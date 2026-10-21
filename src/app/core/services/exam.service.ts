import { Injectable, inject } from '@angular/core';
import {
  BehaviorSubject,
  EMPTY,
  Observable,
  Subject,
  Subscription,
  catchError,
  combineLatest,
  concatMap,
  debounceTime,
  defer,
  distinctUntilChanged,
  exhaustMap,
  filter,
  forkJoin,
  fromEvent,
  map,
  merge,
  of,
  retry,
  switchMap,
  take,
  takeWhile,
  tap,
  throwError,
  timer,
} from 'rxjs';

import { describeError, isRetryable } from '../http-error';
import {
  Answers,
  ExamSettings,
  ExamState,
  Question,
  SessionStarted,
  SubmitReason,
  SubmitResponse,
  TabSwitchSummary,
} from '../models';
import { ExamApiService } from './exam-api.service';
import { NetworkService } from './network.service';

export interface ExamContext {
  session: SessionStarted;
  settings: ExamSettings;
  questions: Question[];
}

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'saving'; attempt: number }
  | { kind: 'saved'; at: string | null; saveCount: number }
  | { kind: 'error'; message: string };

export type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting'; reason: SubmitReason }
  | { kind: 'done'; response: SubmitResponse }
  | { kind: 'error'; message: string };

/**
 * The exam engine. One instance holds the state of the attempt in progress, and every exam
 * component reads from it instead of keeping its own copy (scenario 3).
 *
 * Call start() to load an exam and begin the attempt; it wires up the RxJS pipelines for the
 * timer (1), auto-save (2), tab-switch detection (4), double-submit protection (6),
 * retries (7) and the five-minute warning (8). stop() tears them all down.
 */
@Injectable({ providedIn: 'root' })
export class ExamService {
  private readonly api = inject(ExamApiService);
  private readonly network = inject(NetworkService);

  // Scenario 3: one BehaviorSubject<ExamState>, many readers.
  private readonly stateSubject = new BehaviorSubject<ExamState | null>(null);
  readonly state$ = this.stateSubject.asObservable();

  private readonly contextSubject = new BehaviorSubject<ExamContext | null>(null);
  readonly context$ = this.contextSubject.asObservable();

  readonly questions$ = this.context$.pipe(map(c => c?.questions ?? []));
  readonly currentIndex$ = this.state$.pipe(
    map(s => s?.currentQuestionIndex ?? 0),
    distinctUntilChanged(),
  );
  readonly currentQuestion$ = combineLatest([this.questions$, this.currentIndex$]).pipe(
    map(([questions, index]) => questions[index] ?? null),
  );
  readonly progress$ = this.state$.pipe(
    map(s => ({ answered: s?.answeredCount ?? 0, total: s?.totalQuestions ?? 0 })),
    distinctUntilChanged((a, b) => a.answered === b.answered && a.total === b.total),
  );

  private readonly timeLeftSubject = new BehaviorSubject<number | null>(null);
  readonly timeLeft$ = this.timeLeftSubject.asObservable();

  private readonly saveStatusSubject = new BehaviorSubject<SaveStatus>({ kind: 'idle' });
  readonly saveStatus$ = this.saveStatusSubject.asObservable();

  private readonly tabSwitchesSubject = new BehaviorSubject<TabSwitchSummary | null>(null);
  readonly tabSwitches$ = this.tabSwitchesSubject.asObservable();

  private readonly warningSubject = new BehaviorSubject<boolean>(false);
  readonly showWarning$ = this.warningSubject.asObservable();

  private readonly submitStateSubject = new BehaviorSubject<SubmitState>({ kind: 'idle' });
  readonly submitState$ = this.submitStateSubject.asObservable();

  /** How many times Submit was clicked, to compare with the server's submitRequestCount. */
  private readonly submitClickCountSubject = new BehaviorSubject<number>(0);
  readonly submitClickCount$ = this.submitClickCountSubject.asObservable();

  private readonly answerChanged$ = new Subject<void>();
  private readonly navChanged$ = new Subject<void>();
  private readonly submitClicks$ = new Subject<SubmitReason>();

  private pipelines = new Subscription();
  /** Bumped on every answer change; savedVersion catches up when a save succeeds. */
  private answersVersion = 0;
  private savedVersion = 0;

  /**
   * Scenario 5 + 1: load settings and questions and start (or resume) the attempt in parallel,
   * then restore the saved state and start the pipelines.
   */
  start(examId: string, studentId?: string): Observable<ExamContext> {
    this.stop();
    this.resetSubjects();
    return forkJoin({
      settings: this.api.settings(examId),
      questions: this.api.questions(examId),
      session: this.api.startSession(examId, studentId),
    }).pipe(
      switchMap(context =>
        forkJoin({
          state: this.api.state(context.session.sessionId),
          tabSwitches: this.api.tabSwitches(context.session.sessionId),
        }).pipe(
          tap(({ state, tabSwitches }) => {
            this.contextSubject.next(context);
            this.stateSubject.next(state);
            this.tabSwitchesSubject.next(tabSwitches);
            this.run(context);
          }),
          map(() => context),
        ),
      ),
    );
  }

  /** Tears down every pipeline. Unsaved answers get one last best-effort save. */
  stop(): void {
    this.pipelines.unsubscribe();
    this.pipelines = new Subscription();
    const state = this.stateSubject.value;
    if (state && state.status === 'IN_PROGRESS' && this.answersVersion !== this.savedVersion) {
      this.api.saveAnswers(state.sessionId, { answers: state.answers }).subscribe({ error: () => undefined });
      this.savedVersion = this.answersVersion;
    }
  }

  selectAnswer(questionId: string, optionId: string): void {
    this.updateState(s => {
      const answers: Answers = { ...s.answers, [questionId]: optionId };
      return { ...s, answers, answeredCount: Object.keys(answers).length };
    });
    this.answersVersion++;
    this.answerChanged$.next();
  }

  goTo(index: number): void {
    const total = this.stateSubject.value?.totalQuestions ?? 0;
    if (index < 0 || index >= total) {
      return;
    }
    this.updateState(s => ({ ...s, currentQuestionIndex: index }));
    this.navChanged$.next();
  }

  toggleFlag(questionId: string): void {
    this.updateState(s => {
      const flagged = s.flaggedQuestionIds.includes(questionId)
        ? s.flaggedQuestionIds.filter(id => id !== questionId)
        : [...s.flaggedQuestionIds, questionId];
      return { ...s, flaggedQuestionIds: flagged };
    });
    this.navChanged$.next();
  }

  /** Every click goes into the stream; exhaustMap decides whether it becomes a request. */
  submit(reason: SubmitReason = 'MANUAL'): void {
    this.submitClicks$.next(reason);
  }

  dismissWarning(): void {
    this.warningSubject.next(false);
  }

  private run({ session, settings }: ExamContext): void {
    const id = session.sessionId;
    const sub = new Subscription();
    this.pipelines = sub;

    // Scenario 1: countdown timer. Seeded from the server, and resynced from GET /time whenever
    // the tab becomes visible again (browsers throttle timers in background tabs).
    const remaining$ = merge(
      of(session.remainingSeconds),
      fromEvent(document, 'visibilitychange').pipe(
        filter(() => !document.hidden),
        switchMap(() => this.api.time(id).pipe(catchError(() => EMPTY))),
        map(t => t.remainingSeconds),
      ),
    );
    sub.add(
      remaining$
        .pipe(
          switchMap(remaining =>
            timer(0, 1000).pipe(
              map(s => remaining - s),
              takeWhile(t => t >= 0),
            ),
          ),
        )
        .subscribe(t => this.timeLeftSubject.next(t)),
    );
    sub.add(
      this.timeLeft$
        .pipe(
          filter(t => t === 0),
          take(1),
        )
        .subscribe(() => this.submit('TIMER')),
    );

    // Scenario 8: show the warning once. "<=" rather than "===" so a student who resumes
    // below the threshold still sees it; the server's firstTime flag stops it repeating after a reload.
    sub.add(
      this.timeLeft$
        .pipe(
          filter((t): t is number => t !== null && t > 0 && t <= settings.warningAtSeconds),
          take(1),
          switchMap(() => this.api.timeWarning(id).pipe(catchError(() => of(null)))),
          filter(ack => ack === null || ack.firstTime),
        )
        .subscribe(() => this.warningSubject.next(true)),
    );

    // Scenario 2 + 7: debounce answer changes, then save with retries. switchMap drops a save
    // that is still in flight when a newer one starts. When the browser reconnects and the server
    // answers a ping, unsaved answers are saved again.
    const unsavedAfterReconnect$ = this.network.reconnected$.pipe(
      filter(reachable => reachable && this.answersVersion !== this.savedVersion),
    );
    sub.add(
      merge(this.answerChanged$, unsavedAfterReconnect$)
        .pipe(
          tap(() => this.saveStatusSubject.next({ kind: 'pending' })),
          debounceTime(settings.autoSaveDebounceMs),
          switchMap(() => this.save(id, settings)),
        )
        .subscribe(status => this.saveStatusSubject.next(status)),
    );

    // Scenario 3: keep the server's copy of the navigator state in step, without a request per click.
    sub.add(
      this.navChanged$
        .pipe(
          debounceTime(400),
          map(() => this.stateSubject.value),
          filter((s): s is ExamState => s !== null),
          switchMap(s =>
            this.api
              .patchState(id, { currentQuestionIndex: s.currentQuestionIndex, flaggedQuestionIds: s.flaggedQuestionIds })
              .pipe(catchError(() => EMPTY)),
          ),
        )
        .subscribe(),
    );

    // Scenario 4: every time the page is hidden, tell the server. concatMap keeps the events in order.
    sub.add(
      fromEvent(document, 'visibilitychange')
        .pipe(
          filter(() => document.hidden),
          map(() => new Date().toISOString()),
          concatMap(hiddenAt => this.api.recordTabSwitch(id, hiddenAt).pipe(catchError(() => EMPTY))),
        )
        .subscribe(summary => {
          this.tabSwitchesSubject.next(summary);
          this.updateState(s => ({ ...s, tabSwitchCount: summary.count }));
        }),
    );

    // Scenario 6: exhaustMap ignores clicks (and the timer's auto-submit) while a submit is in flight.
    sub.add(
      this.submitClicks$
        .pipe(
          tap(() => this.submitClickCountSubject.next(this.submitClickCountSubject.value + 1)),
          exhaustMap(reason => {
            this.submitStateSubject.next({ kind: 'submitting', reason });
            const answers = this.stateSubject.value?.answers ?? {};
            return this.api.submit(id, answers, reason).pipe(
              map((response): SubmitState => ({ kind: 'done', response })),
              catchError(err => of<SubmitState>({ kind: 'error', message: describeError(err) })),
            );
          }),
        )
        .subscribe(state => {
          this.submitStateSubject.next(state);
          if (state.kind === 'done') {
            this.savedVersion = this.answersVersion;
            this.updateState(s => ({ ...s, status: 'SUBMITTED' }));
            this.stop();
          }
        }),
    );
  }

  private save(sessionId: string, settings: ExamSettings): Observable<SaveStatus> {
    const version = this.answersVersion;
    const state = this.stateSubject.value;
    if (!state) {
      return EMPTY;
    }
    let attempt = 0;
    // defer() so every retry re-runs this block and the UI can show the attempt number.
    return defer(() => {
      attempt++;
      this.saveStatusSubject.next({ kind: 'saving', attempt });
      return this.api.saveAnswers(sessionId, {
        answers: state.answers,
        currentQuestionIndex: state.currentQuestionIndex,
        clientSavedAt: new Date().toISOString(),
      });
    }).pipe(
      retry({
        count: settings.saveRetryCount,
        delay: err => (isRetryable(err) ? timer(settings.saveRetryDelayMs) : throwError(() => err)),
      }),
      map((res): SaveStatus => {
        this.savedVersion = Math.max(this.savedVersion, version);
        this.updateState(s => ({ ...s, lastSavedAt: res.savedAt }));
        return { kind: 'saved', at: res.savedAt, saveCount: res.saveCount };
      }),
      catchError(err => of<SaveStatus>({ kind: 'error', message: describeError(err) })),
    );
  }

  private updateState(change: (s: ExamState) => ExamState): void {
    const current = this.stateSubject.value;
    if (current) {
      this.stateSubject.next(change(current));
    }
  }

  private resetSubjects(): void {
    this.contextSubject.next(null);
    this.stateSubject.next(null);
    this.timeLeftSubject.next(null);
    this.saveStatusSubject.next({ kind: 'idle' });
    this.tabSwitchesSubject.next(null);
    this.warningSubject.next(false);
    this.submitStateSubject.next({ kind: 'idle' });
    this.submitClickCountSubject.next(0);
    this.answersVersion = 0;
    this.savedVersion = 0;
  }
}
