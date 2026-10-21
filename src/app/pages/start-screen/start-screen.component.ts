import { AsyncPipe, DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, Subject, catchError, defer, forkJoin, map, of, shareReplay, startWith, switchMap } from 'rxjs';

import { describeError } from '../../core/http-error';
import { StartScreen, Simulation } from '../../core/models';
import { ExamApiService } from '../../core/services/exam-api.service';

type Source = 'questions' | 'student' | 'settings';
type Mode = 'forkJoin' | 'single';

interface Timed<T> {
  value: T;
  ms: number;
}

interface LoadResult {
  mode: Mode;
  totalMs: number;
  timings: Partial<Record<Source, number>>;
  data?: StartScreen;
  error?: string;
}

/** Measures how long one request takes, from subscribe to response. */
function timed<T>(source$: Observable<T>): Observable<Timed<T>> {
  return defer(() => {
    const started = performance.now();
    return source$.pipe(map(value => ({ value, ms: Math.round(performance.now() - started) })));
  });
}

/**
 * Scenario 5: load the exam start screen with forkJoin({ questions, student, settings }).
 * Add a delay to one call to see forkJoin wait for the slowest, or fail one to see the whole thing fail.
 */
@Component({
  selector: 'app-start-screen',
  standalone: true,
  imports: [AsyncPipe, DecimalPipe, FormsModule, RouterLink],
  template: `
    <span class="scenario-tag">Scenario 5</span>
    <h1>Exam start screen</h1>
    <p class="lead">
      Three requests in parallel with <code>forkJoin</code>. It emits once, when the slowest finishes,
      and fails as a whole if any one fails.
    </p>

    <div class="card stack">
      <div class="row">
        <label class="field">
          Student
          <select [(ngModel)]="studentId">
            <option value="me">me (S1001)</option>
            @for (s of students$ | async; track s.id) {
              <option [value]="s.id">{{ s.id }} · {{ s.name }}</option>
            }
          </select>
        </label>
        <label class="field">questions delayMs <input type="number" min="0" step="100" [(ngModel)]="delays.questions" /></label>
        <label class="field">student delayMs <input type="number" min="0" step="100" [(ngModel)]="delays.student" /></label>
        <label class="field">settings delayMs <input type="number" min="0" step="100" [(ngModel)]="delays.settings" /></label>
        <label class="field">
          Fail one call (500)
          <select [(ngModel)]="failing">
            <option value="">none</option>
            <option value="questions">questions</option>
            <option value="student">student</option>
            <option value="settings">settings</option>
          </select>
        </label>
      </div>
      <div class="row">
        <button class="btn primary" (click)="load$.next('forkJoin')">Load with forkJoin</button>
        <button class="btn" (click)="load$.next('single')">Load with one call (/start-screen)</button>
      </div>
    </div>

    @if (result$ | async; as r) {
      @if (r === 'loading') {
        <p class="muted">Loading…</p>
      } @else {
        <div class="card" style="margin-top: 16px">
          <div class="row">
            <strong>{{ r.mode === 'forkJoin' ? 'forkJoin' : 'GET /start-screen' }}</strong>
            <span class="badge info">total {{ r.totalMs | number }} ms</span>
            @for (t of timingList(r); track t.name) {
              <span class="badge">{{ t.name }} {{ t.ms | number }} ms</span>
            }
          </div>
          @if (r.error) {
            <div class="alert" style="margin-top: 12px">{{ r.error }}</div>
          }
        </div>

        @if (r.data; as d) {
          <div class="grid" style="margin-top: 16px">
            <div class="card">
              <h2>Student</h2>
              <div class="row">
                <img class="avatar" [src]="d.student.avatarUrl" alt="" />
                <div>
                  <strong>{{ d.student.name }}</strong>
                  <div class="muted small">{{ d.student.rollNumber }} · {{ d.student.className }} · {{ d.student.email }}</div>
                </div>
              </div>
            </div>
            <div class="card">
              <h2>{{ d.settings.title }}</h2>
              <ul class="small">
                <li>{{ d.settings.totalQuestions }} questions, {{ d.settings.totalMarks }} marks, pass at {{ d.settings.passPercentage }}%</li>
                <li>{{ d.settings.durationSeconds / 60 | number: '1.0-1' }} minutes, warning at {{ d.settings.warningAtSeconds / 60 | number: '1.0-1' }} minutes left</li>
                <li>Auto-save after {{ d.settings.autoSaveDebounceMs }} ms, {{ d.settings.saveRetryCount }} retries</li>
                <li>Up to {{ d.settings.maxTabSwitches }} tab switches allowed</li>
              </ul>
            </div>
            <div class="card">
              <h2>Questions</h2>
              <p class="small muted">{{ d.questions.length }} questions loaded (no answers are sent to the browser).</p>
              <a class="btn primary" [routerLink]="['/exam', d.settings.examId]" [queryParams]="{ studentId: d.student.id }">
                Start exam as {{ d.student.name }}
              </a>
            </div>
          </div>
        }
      }
    }
  `,
})
export class StartScreenComponent {
  private readonly api = inject(ExamApiService);

  readonly examId = 'EXAM-101';
  studentId = 'me';
  failing: Source | '' = '';
  delays: Record<Source, number> = { questions: 1200, student: 300, settings: 0 };

  readonly students$ = this.api.students().pipe(catchError(() => of([])));

  readonly load$ = new Subject<Mode>();

  // switchMap: clicking Load again cancels a load that is still running.
  readonly result$: Observable<LoadResult | 'loading'> = this.load$.pipe(
    startWith<Mode>('forkJoin'),
    switchMap(mode =>
      (mode === 'forkJoin' ? this.loadWithForkJoin() : this.loadInOneCall()).pipe(startWith('loading' as const)),
    ),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  timingList(r: LoadResult): { name: string; ms: number }[] {
    return Object.entries(r.timings).map(([name, ms]) => ({ name, ms: ms ?? 0 }));
  }

  private sim(source: Source): Simulation {
    return { delayMs: this.delays[source] || 0, failWith: this.failing === source ? 500 : undefined };
  }

  private loadWithForkJoin(): Observable<LoadResult> {
    const timings: LoadResult['timings'] = {};
    const record = <T>(name: Source, source$: Observable<T>) =>
      timed(source$).pipe(
        map(t => {
          timings[name] = t.ms;
          return t.value;
        }),
      );
    return timed(
      forkJoin({
        questions: record('questions', this.api.questions(this.examId, this.sim('questions'))),
        student: record('student', this.api.student(this.studentId, this.sim('student'))),
        settings: record('settings', this.api.settings(this.examId, this.sim('settings'))),
      }),
    ).pipe(
      map(t => ({ mode: 'forkJoin' as const, totalMs: t.ms, timings, data: t.value })),
      catchError(err => of({ mode: 'forkJoin' as const, totalMs: 0, timings, error: describeError(err) })),
    );
  }

  private loadInOneCall(): Observable<LoadResult> {
    const delayMs = Math.max(this.delays.questions, this.delays.student, this.delays.settings);
    const studentId = this.studentId === 'me' ? 'S1001' : this.studentId;
    return timed(this.api.startScreen(this.examId, studentId, { delayMs, failWith: this.failing ? 500 : undefined })).pipe(
      map(t => ({ mode: 'single' as const, totalMs: t.ms, timings: {}, data: t.value })),
      catchError(err => of({ mode: 'single' as const, totalMs: 0, timings: {}, error: describeError(err) })),
    );
  }
}
