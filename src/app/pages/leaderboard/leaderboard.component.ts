import { AsyncPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { BehaviorSubject, catchError, filter, map, of, scan, shareReplay, startWith, switchMap } from 'rxjs';

import { LeaderboardMessage } from '../../core/models';
import { ExamApiService } from '../../core/services/exam-api.service';
import { LeaderboardService, LeaderboardUpdate } from '../../core/services/leaderboard.service';

type Mode = 'websocket' | 'poll';

/** Scenario 9: the teacher's live results, by WebSocket or by polling. */
@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [AsyncPipe, DatePipe, DecimalPipe],
  template: `
    <span class="scenario-tag">Scenario 9</span>
    <h1>Live leaderboard</h1>
    <p class="lead">
      Mock classmates start and submit every few seconds, so leave this open and watch it change.
    </p>

    <div class="card row" style="margin-bottom: 16px">
      <label class="row small">
        <input type="radio" name="mode" [checked]="(mode$ | async) === 'websocket'" (change)="mode$.next('websocket')" />
        WebSocket <code>webSocket('/ws/leaderboard')</code>
      </label>
      <label class="row small">
        <input type="radio" name="mode" [checked]="(mode$ | async) === 'poll'" (change)="mode$.next('poll')" />
        Polling <code>interval({{ pollMs$ | async }}) + switchMap(http.get)</code>
      </label>
      <span class="spacer"></span>
      @if ((mode$ | async) === 'websocket') {
        <button class="btn small" (click)="leaderboard.refresh()">Send "refresh"</button>
      }
    </div>

    @if (latest$ | async; as u) {
      @let lb = u.message.leaderboard;
      <div class="row" style="margin-bottom: 12px">
        <span class="badge ok">{{ lb.submittedCount }} submitted</span>
        <span class="badge info">{{ lb.inProgressCount }} in progress</span>
        <span class="badge">{{ lb.notStartedCount }} not started</span>
        <span class="spacer"></span>
        <span class="small muted">{{ u.message.type }} via {{ u.source }} at {{ u.message.sentAt | date: 'mediumTime' }}</span>
      </div>

      <div class="layout">
        <div class="card table-wrap">
          <table>
            <thead>
              <tr><th>#</th><th>Student</th><th>Status</th><th>Score</th><th>Time</th></tr>
            </thead>
            <tbody>
              @for (e of lb.entries; track e.studentId) {
                <tr [class.flash]="e.studentId === u.message.changed?.studentId">
                  <td>{{ e.rank ?? '–' }}</td>
                  <td><img class="avatar" [src]="e.avatarUrl" alt="" /> {{ e.name }}</td>
                  <td>
                    <span class="badge" [class.ok]="e.status === 'SUBMITTED'" [class.info]="e.status === 'IN_PROGRESS'">
                      {{ e.status.replace('_', ' ').toLowerCase() }}
                    </span>
                  </td>
                  <td>{{ e.score ?? '' }}{{ e.percentage !== null ? ' (' + (e.percentage | number: '1.0-0') + '%)' : '' }}</td>
                  <td>{{ e.timeTakenSeconds !== null ? (e.timeTakenSeconds / 60 | number: '1.0-0') + ' min' : '' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <aside class="card">
          <h2>Recent events</h2>
          @for (m of events$ | async; track m.sentAt + m.changed?.studentId) {
            <div class="small event">
              <span class="badge" [class.ok]="m.type === 'SUBMITTED'" [class.info]="m.type === 'STARTED'">{{ m.type }}</span>
              {{ m.changed?.name }}
              <span class="muted">{{ m.sentAt | date: 'mediumTime' }}</span>
            </div>
          } @empty {
            <p class="small muted">
              {{ (mode$ | async) === 'poll' ? 'Polling only sees snapshots. Switch to WebSocket for events.' : 'Waiting for someone to start or submit…' }}
            </p>
          }
        </aside>
      </div>
    } @else {
      <p class="muted">Connecting…</p>
    }
  `,
  styles: `
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 16px; align-items: start; }
    .event { padding: 6px 0; border-bottom: 1px solid var(--border); }
    @media (max-width: 760px) { .layout { grid-template-columns: 1fr; } }
  `,
})
export class LeaderboardComponent {
  readonly leaderboard = inject(LeaderboardService);
  private readonly api = inject(ExamApiService);
  private readonly examId = 'EXAM-101';

  readonly mode$ = new BehaviorSubject<Mode>('websocket');

  readonly pollMs$ = this.api.settings(this.examId).pipe(
    map(s => s.leaderboardPollIntervalMs),
    catchError(() => of(10000)),
    shareReplay(1),
  );

  // switchMap on the mode: switching closes the WebSocket or stops the polling timer.
  readonly updates$ = this.mode$.pipe(
    switchMap(mode =>
      mode === 'websocket'
        ? this.leaderboard.live()
        : this.pollMs$.pipe(switchMap(ms => this.leaderboard.poll(this.examId, ms))),
    ),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly latest$ = this.updates$;

  readonly events$ = this.updates$.pipe(
    map((u: LeaderboardUpdate) => u.message),
    filter(m => m.changed !== null),
    scan((recent: LeaderboardMessage[], m) => [m, ...recent].slice(0, 10), []),
    startWith([] as LeaderboardMessage[]),
  );
}
