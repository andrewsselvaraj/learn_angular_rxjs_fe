import { AsyncPipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { describeError } from '../../core/http-error';
import { ExamService } from '../../core/services/exam.service';
import {
  ExamNavigatorComponent,
  ExamProgressComponent,
  ExamTimerComponent,
  QuestionPanelComponent,
  SaveStatusComponent,
  TabSwitchesComponent,
} from './exam-widgets';

@Component({
  selector: 'app-exam',
  standalone: true,
  imports: [
    AsyncPipe,
    DecimalPipe,
    RouterLink,
    ExamNavigatorComponent,
    ExamProgressComponent,
    ExamTimerComponent,
    QuestionPanelComponent,
    SaveStatusComponent,
    TabSwitchesComponent,
  ],
  template: `
    @let ctx = exam.context$ | async;
    @if (error) {
      <div class="alert">{{ error }}</div>
      <p><a routerLink="/start">Back to the start screen</a></p>
    } @else if (ctx) {
      <div class="row header">
        <div>
          <h1>{{ ctx.settings.title }}</h1>
          <div class="row small muted">
            <span>Session <code>{{ ctx.session.sessionId.slice(0, 8) }}</code></span>
            @if (ctx.session.resumed) {
              <span class="badge info">Resumed</span>
            }
            <app-save-status />
            <app-tab-switches />
          </div>
        </div>
        <span class="spacer"></span>
        <app-exam-timer />
      </div>

      @if (exam.tabSwitches$ | async; as tabs) {
        @if (tabs.limitExceeded) {
          <div class="alert warn" style="margin-bottom: 16px">
            You have left this page {{ tabs.count }} times, more than the {{ tabs.maxAllowed }} allowed. Your teacher can see this.
          </div>
        }
      }

      @if (exam.submitState$ | async; as submit) {
        @if (submit.kind === 'done') {
          <div class="card stack">
            <h2>Submitted {{ submit.response.result.reason === 'TIMER' ? 'automatically (time is up)' : '' }}</h2>
            <div class="row">
              <span class="badge" [class.ok]="submit.response.result.passed" [class.danger]="!submit.response.result.passed">
                {{ submit.response.result.passed ? 'Passed' : 'Not passed' }}
              </span>
              <strong>{{ submit.response.result.score }}/{{ submit.response.result.totalMarks }}</strong>
              <span class="muted">({{ submit.response.result.percentage | number: '1.0-1' }}%)</span>
            </div>
            <p class="small">
              <span class="scenario-tag">Scenario 6</span><br />
              You clicked Submit {{ exam.submitClickCount$ | async }} time(s);
              the server received {{ submit.response.submitRequestCount }} request(s).
              <code>exhaustMap</code> ignored the rest while the first was in flight.
            </p>
            <div class="row">
              <a class="btn primary" [routerLink]="['/result', submit.response.sessionId]">Full result</a>
              <a class="btn" routerLink="/leaderboard">Leaderboard</a>
            </div>
          </div>
        } @else {
          <div class="layout">
            <section class="card">
              <app-question-panel />
            </section>
            <aside class="stack">
              <div class="card">
                <app-exam-progress />
              </div>
              <div class="card">
                <app-exam-navigator />
              </div>
              <div class="card stack">
                <button class="btn primary" type="button" (click)="exam.submit('MANUAL')">
                  {{ submit.kind === 'submitting' ? 'Submitting…' : 'Submit exam' }}
                </button>
                <p class="small muted" style="margin: 0">
                  Try a double (or triple) click. The button stays enabled on purpose:
                  <code>exhaustMap</code> is what stops the extra requests.
                  Clicks so far: {{ exam.submitClickCount$ | async }}.
                </p>
                @if (submit.kind === 'error') {
                  <div class="alert small">{{ submit.message }}</div>
                }
              </div>
            </aside>
          </div>
        }
      }

      @if (exam.showWarning$ | async) {
        <div class="modal-backdrop" role="dialog" aria-modal="true">
          <div class="card stack">
            <span class="scenario-tag">Scenario 8</span>
            <h2>{{ ctx.settings.warningAtSeconds / 60 | number: '1.0-1' }} minutes left</h2>
            <p>Check your flagged questions. The exam submits itself when the timer reaches zero.</p>
            <button class="btn primary" type="button" (click)="exam.dismissWarning()">OK</button>
          </div>
        </div>
      }
    } @else {
      <p class="muted">Starting the exam…</p>
    }
  `,
  styles: `
    .header { margin-bottom: 16px; align-items: flex-start; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 16px; align-items: start; }
    @media (max-width: 760px) { .layout { grid-template-columns: 1fr; } }
  `,
})
export class ExamComponent implements OnInit, OnDestroy {
  readonly exam = inject(ExamService);
  private readonly destroyRef = inject(DestroyRef);

  /** Route parameter and query parameter, bound by withComponentInputBinding(). */
  readonly examId = input.required<string>();
  readonly studentId = input<string>();

  error = '';

  ngOnInit(): void {
    this.exam
      .start(this.examId(), this.studentId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: err => (this.error = describeError(err)) });
  }

  ngOnDestroy(): void {
    this.exam.stop();
  }
}
