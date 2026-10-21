import { AsyncPipe, DatePipe, NgClass } from '@angular/common';
import { Component, inject } from '@angular/core';
import { combineLatest, map } from 'rxjs';

import { ExamService } from '../../core/services/exam.service';

// Scenario 3: each widget below injects the same ExamService and reads its own slice of the
// shared BehaviorSubject<ExamState>. None of them talk to each other or keep a copy.

/** Scenario 1 + 8: the countdown. */
@Component({
  selector: 'app-exam-timer',
  standalone: true,
  imports: [AsyncPipe, NgClass],
  template: `
    @if (view$ | async; as v) {
      <div class="timer" [ngClass]="v.level" aria-live="off">
        <span class="small muted">Time left</span>
        <strong>{{ v.text }}</strong>
      </div>
    }
  `,
  styles: `
    .timer { display: flex; flex-direction: column; align-items: flex-end; }
    strong { font-size: 1.6rem; font-variant-numeric: tabular-nums; }
    .warn strong { color: var(--warn); }
    .danger strong { color: var(--danger); }
  `,
})
export class ExamTimerComponent {
  private readonly exam = inject(ExamService);

  readonly view$ = combineLatest([this.exam.timeLeft$, this.exam.context$]).pipe(
    map(([t, ctx]) => {
      const seconds = Math.max(t ?? 0, 0);
      const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
      const ss = String(seconds % 60).padStart(2, '0');
      const warnAt = ctx?.settings.warningAtSeconds ?? 300;
      const level = t === null ? '' : seconds <= 60 ? 'danger' : seconds <= warnAt ? 'warn' : '';
      return { text: t === null ? '--:--' : `${mm}:${ss}`, level };
    }),
  );
}

/** The "answered 7/20" bar. */
@Component({
  selector: 'app-exam-progress',
  standalone: true,
  imports: [AsyncPipe],
  template: `
    @if (progress$ | async; as p) {
      <div class="small muted">Answered {{ p.answered }}/{{ p.total }}</div>
      <div class="bar"><div [style.width.%]="p.total ? (p.answered / p.total) * 100 : 0"></div></div>
    }
  `,
  styles: `
    .bar { height: 8px; background: var(--code-bg); border-radius: 99px; overflow: hidden; margin-top: 4px; }
    .bar div { height: 100%; background: var(--ok); transition: width 0.3s; }
  `,
})
export class ExamProgressComponent {
  readonly progress$ = inject(ExamService).progress$;
}

/** Question navigator: jump to a question, see which are answered or flagged. */
@Component({
  selector: 'app-exam-navigator',
  standalone: true,
  imports: [AsyncPipe, NgClass],
  template: `
    @if (view$ | async; as v) {
      <div class="nav">
        @for (q of v.questions; track q.id; let i = $index) {
          <button
            type="button"
            [ngClass]="{ current: i === v.index, answered: !!v.answers[q.id], flagged: v.flagged.includes(q.id) }"
            (click)="exam.goTo(i)"
            [attr.aria-label]="'Question ' + q.number"
          >{{ q.number }}</button>
        }
      </div>
      <div class="small muted legend">
        <span class="dot answered"></span> answered <span class="dot flagged"></span> flagged
      </div>
    }
  `,
  styles: `
    .nav { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
    button { font: inherit; padding: 6px 0; border-radius: 6px; border: 1px solid var(--border);
      background: var(--surface); color: var(--text); cursor: pointer; position: relative; }
    .answered { background: var(--ok-soft); border-color: var(--ok); }
    .flagged::after { content: ''; position: absolute; top: 3px; right: 3px; width: 6px; height: 6px;
      border-radius: 50%; background: var(--warn); }
    .current { outline: 2px solid var(--primary); outline-offset: 1px; }
    .legend { margin-top: 8px; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 8px; }
    .dot.answered { background: var(--ok); } .dot.flagged { background: var(--warn); }
  `,
})
export class ExamNavigatorComponent {
  readonly exam = inject(ExamService);

  readonly view$ = combineLatest([this.exam.questions$, this.exam.state$]).pipe(
    map(([questions, s]) => ({
      questions,
      index: s?.currentQuestionIndex ?? 0,
      answers: s?.answers ?? {},
      flagged: s?.flaggedQuestionIds ?? [],
    })),
  );
}

/** The current question and its options. */
@Component({
  selector: 'app-question-panel',
  standalone: true,
  imports: [AsyncPipe, NgClass],
  template: `
    @if (view$ | async; as v) {
      @if (v.question; as q) {
        <div class="row">
          <span class="badge info">Question {{ q.number }} of {{ v.total }}</span>
          <span class="badge">{{ q.topic }}</span>
          <span class="badge">{{ q.marks }} marks</span>
          <span class="spacer"></span>
          <button class="btn small" type="button" (click)="exam.toggleFlag(q.id)">
            {{ v.flagged ? 'Unflag' : 'Flag for review' }}
          </button>
        </div>
        <p class="question">{{ q.text }}</p>
        <div class="options" role="radiogroup">
          @for (o of q.options; track o.id) {
            <label class="option" [ngClass]="{ selected: v.selected === o.id }">
              <input type="radio" [name]="q.id" [checked]="v.selected === o.id" [disabled]="v.locked"
                (change)="exam.selectAnswer(q.id, o.id)" />
              <strong>{{ o.id }}.</strong> {{ o.text }}
            </label>
          }
        </div>
        <div class="row" style="margin-top: 16px">
          <button class="btn" type="button" [disabled]="v.index === 0" (click)="exam.goTo(v.index - 1)">← Previous</button>
          <span class="spacer"></span>
          <button class="btn" type="button" [disabled]="v.index >= v.total - 1" (click)="exam.goTo(v.index + 1)">Next →</button>
        </div>
      }
    }
  `,
  styles: `
    .question { font-size: 1.1rem; margin: 16px 0; }
    .options { display: flex; flex-direction: column; gap: 8px; }
    .option { display: flex; gap: 8px; align-items: baseline; padding: 10px 12px; border: 1px solid var(--border);
      border-radius: 8px; cursor: pointer; }
    .option.selected { border-color: var(--primary); background: var(--primary-soft); }
  `,
})
export class QuestionPanelComponent {
  readonly exam = inject(ExamService);

  readonly view$ = combineLatest([this.exam.currentQuestion$, this.exam.state$]).pipe(
    map(([question, s]) => ({
      question,
      index: s?.currentQuestionIndex ?? 0,
      total: s?.totalQuestions ?? 0,
      selected: question ? s?.answers[question.id] : undefined,
      flagged: question ? (s?.flaggedQuestionIds.includes(question.id) ?? false) : false,
      locked: s?.status !== 'IN_PROGRESS',
    })),
  );
}

/** Scenario 2 + 7: what the auto-save is doing right now. */
@Component({
  selector: 'app-save-status',
  standalone: true,
  imports: [AsyncPipe, DatePipe],
  template: `
    @if (status$ | async; as s) {
      @switch (s.kind) {
        @case ('idle') { <span class="badge">No changes yet</span> }
        @case ('pending') { <span class="badge">Waiting for you to stop clicking…</span> }
        @case ('saving') {
          <span class="badge info">Saving{{ s.attempt > 1 ? ' (retry ' + (s.attempt - 1) + ')' : '' }}…</span>
        }
        @case ('saved') { <span class="badge ok">Saved {{ s.at | date: 'mediumTime' }} · save #{{ s.saveCount }}</span> }
        @case ('error') { <span class="badge danger" [title]="s.message">Not saved: {{ s.message }}</span> }
      }
    }
  `,
})
export class SaveStatusComponent {
  readonly status$ = inject(ExamService).saveStatus$;
}

/** Scenario 4: how many times the student left the page. */
@Component({
  selector: 'app-tab-switches',
  standalone: true,
  imports: [AsyncPipe],
  template: `
    @if (summary$ | async; as s) {
      <span class="badge" [class.warn]="s.count > 0 && !s.limitExceeded" [class.danger]="s.limitExceeded">
        Tab switches {{ s.count }}/{{ s.maxAllowed }}
      </span>
    }
  `,
})
export class TabSwitchesComponent {
  readonly summary$ = inject(ExamService).tabSwitches$;
}
