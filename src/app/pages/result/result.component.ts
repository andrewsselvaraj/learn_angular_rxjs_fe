import { AsyncPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';

import { toLoadState } from '../../core/load-state';
import { ExamApiService } from '../../core/services/exam-api.service';

@Component({
  selector: 'app-result',
  standalone: true,
  imports: [AsyncPipe, DatePipe, DecimalPipe, RouterLink],
  template: `
    <h1>Result</h1>
    <p class="lead">From <code>GET /api/sessions/{{ sessionId() }}/result</code>, so it survives a page refresh.</p>
    @if (result$ | async; as state) {
      @if (state.status === 'loading') {
        <p class="muted">Loading…</p>
      } @else if (state.status === 'error') {
        <div class="alert">{{ state.error }}</div>
      } @else {
        @let r = state.data.result;
        <div class="card stack">
          <div class="row">
            <strong style="font-size: 2rem">{{ r.score }}/{{ r.totalMarks }}</strong>
            <span class="badge" [class.ok]="r.passed" [class.danger]="!r.passed">{{ r.passed ? 'Passed' : 'Not passed' }}</span>
            <span class="muted">{{ r.percentage | number: '1.0-1' }}%</span>
          </div>
          <div class="row small">
            <span class="badge ok">{{ r.correct }} correct</span>
            <span class="badge danger">{{ r.wrong }} wrong</span>
            <span class="badge">{{ r.unanswered }} unanswered</span>
          </div>
          <p class="small muted" style="margin: 0">
            Submitted {{ r.submittedAt | date: 'medium' }} ({{ r.reason === 'TIMER' ? 'time ran out' : 'Submit button' }})
            after {{ r.timeTakenSeconds / 60 | number: '1.0-0' }} min {{ r.timeTakenSeconds % 60 }} s.
            The server received {{ state.data.submitRequestCount }} submit request(s) for this session.
          </p>
          <div class="row">
            <a class="btn primary" routerLink="/leaderboard">Leaderboard</a>
            <a class="btn" routerLink="/start">Take it again</a>
          </div>
        </div>
      }
    }
  `,
})
export class ResultComponent {
  private readonly api = inject(ExamApiService);

  readonly sessionId = input.required<string>();

  readonly result$ = toObservable(this.sessionId).pipe(switchMap(id => toLoadState(this.api.result(id))));
}
