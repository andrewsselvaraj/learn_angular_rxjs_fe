import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Subject, catchError, defer, exhaustMap, map, of, retry, scan, startWith, switchMap, tap, timer } from 'rxjs';

import { describeError, isRetryable } from '../../core/http-error';
import { ChaosConfig } from '../../core/models';
import { ExamApiService } from '../../core/services/exam-api.service';
import { NetworkService } from '../../core/services/network.service';

/** Scenario 7: make the backend fail on purpose and watch retry() recover. */
@Component({
  selector: 'app-network-lab',
  standalone: true,
  imports: [AsyncPipe, DatePipe, FormsModule],
  template: `
    <span class="scenario-tag">Scenario 7</span>
    <h1>Network lab</h1>
    <p class="lead">
      Switch on failures here, then go back to an exam and pick answers: the auto-save retries
      <code>retry({{ '{' }} count: 3, delay: 2000 {{ '}' }})</code> and shows each attempt.
    </p>

    <div class="grid">
      <div class="card stack">
        <h2>Connection</h2>
        <div class="row">
          Browser:
          @if (network.online$ | async) {
            <span class="badge ok">online</span>
          } @else {
            <span class="badge danger">offline</span>
          }
        </div>
        <p class="small muted" style="margin: 0">
          From <code>fromEvent(window, 'online' | 'offline')</code>. Try DevTools → Network → Offline,
          or stop the backend.
        </p>
        <div class="row">
          <button class="btn" (click)="ping$.next()">Ping server</button>
          @if (pingResult$ | async; as p) {
            <span class="badge" [class.ok]="p.ok" [class.danger]="!p.ok">{{ p.text }}</span>
          }
        </div>
      </div>

      <div class="card stack">
        <h2>Failure switches</h2>
        <div class="row">
          <label class="field">failNextSaves <input type="number" min="0" [(ngModel)]="form.failNextSaves" /></label>
          <label class="field">failNextRequests <input type="number" min="0" [(ngModel)]="form.failNextRequests" /></label>
          <label class="field">extraLatencyMs <input type="number" min="0" step="100" [(ngModel)]="form.extraLatencyMs" /></label>
        </div>
        <div class="row">
          <button class="btn primary" (click)="chaosAction$.next('apply')">Apply (PUT /api/chaos)</button>
          <button class="btn" (click)="chaosAction$.next('clear')">Turn all off</button>
        </div>
        @if (chaos$ | async; as c) {
          <p class="small muted" style="margin: 0">
            Server now: failNextSaves {{ c.failNextSaves ?? 0 }}, failNextRequests {{ c.failNextRequests ?? 0 }},
            extraLatencyMs {{ c.extraLatencyMs ?? 0 }}
          </p>
        }
        <p class="small muted" style="margin: 0">
          <code>failNextSaves: 2</code> means the third save attempt succeeds. Set it to 5 to see the retries run out.
        </p>
      </div>

      <div class="card stack">
        <h2>Retry in isolation</h2>
        <p class="small muted" style="margin: 0">
          Sets <code>failNextRequests</code> to the number below, then pings with <code>retry({{ '{' }} count: 3, delay: 2000 {{ '}' }})</code>.
        </p>
        <div class="row">
          <label class="field">Failures before success <input type="number" min="0" max="10" [(ngModel)]="failuresBeforeSuccess" /></label>
          <button class="btn primary" (click)="retryDemo$.next()">Run</button>
        </div>
        @for (line of retryLog$ | async; track $index) {
          <div class="small"><code>{{ line }}</code></div>
        }
      </div>

      <div class="card stack">
        <span class="scenario-tag">Scenario 8</span>
        <h2>Reach the 5-minute warning quickly</h2>
        <p class="small" style="margin: 0">Restart the backend with a 6-minute exam:</p>
        <pre>./mvnw spring-boot:run -Dspring-boot.run.arguments=--app.exam.duration-seconds=360</pre>
        <p class="small muted" style="margin: 0">Then start an exam. The popup shows after about a minute, and the exam submits itself at zero.</p>
      </div>

      <div class="card stack">
        <h2>Reset</h2>
        <p class="small muted" style="margin: 0">Clears every session, re-seeds the leaderboard and turns off the failure switches.</p>
        <div class="row">
          <button class="btn danger" (click)="reset()">Reset all data</button>
          @if (resetMessage) {
            <span class="small">{{ resetMessage }}</span>
          }
        </div>
      </div>
    </div>
  `,
})
export class NetworkLabComponent {
  readonly network = inject(NetworkService);
  private readonly api = inject(ExamApiService);

  form: ChaosConfig = { failNextSaves: 2, failNextRequests: 0, extraLatencyMs: 0 };
  failuresBeforeSuccess = 2;
  resetMessage = '';

  readonly ping$ = new Subject<void>();
  readonly pingResult$ = this.ping$.pipe(
    switchMap(() => {
      const started = performance.now();
      return this.api.ping().pipe(
        map(p => ({ ok: true, text: `${p.status} in ${Math.round(performance.now() - started)} ms` })),
        catchError(err => of({ ok: false, text: describeError(err) })),
      );
    }),
  );

  readonly chaosAction$ = new BehaviorSubject<'load' | 'apply' | 'clear'>('load');
  readonly chaos$ = this.chaosAction$.pipe(
    switchMap(action => {
      const call =
        action === 'apply' ? this.api.updateChaos(this.form) : action === 'clear' ? this.api.clearChaos() : this.api.chaos();
      return call.pipe(catchError(() => of(null)));
    }),
  );

  readonly retryDemo$ = new Subject<void>();
  // exhaustMap: clicking Run again while a demo is running does nothing.
  readonly retryLog$ = this.retryDemo$.pipe(
    exhaustMap(() => {
      let attempt = 0;
      const started = performance.now();
      const at = () => `${((performance.now() - started) / 1000).toFixed(1)}s`;
      const ping$ = defer(() => {
        attempt++;
        return this.api.ping();
      }).pipe(
        retry({
          count: 3,
          delay: err => {
            if (!isRetryable(err)) {
              throw err;
            }
            return timer(2000);
          },
        }),
      );
      return this.api.updateChaos({ failNextRequests: this.failuresBeforeSuccess }).pipe(
        switchMap(() => ping$),
        map(() => `${at()} attempt ${attempt}: success`),
        catchError(err => of(`${at()} attempt ${attempt}: gave up after ${attempt} attempts (${describeError(err)})`)),
        tap({ finalize: () => this.api.updateChaos({ failNextRequests: 0 }).subscribe({ error: () => undefined }) }),
        startWith(`Running with ${this.failuresBeforeSuccess} failure(s) queued…`),
        scan((lines: string[], line: string) => [...lines, line], []),
      );
    }),
  );

  reset(): void {
    if (!confirm('Clear all sessions and re-seed the leaderboard?')) {
      return;
    }
    this.api.reset().subscribe({
      next: r => {
        this.resetMessage = `Reset at ${new Date(r.at).toLocaleTimeString()}`;
        this.chaosAction$.next('load');
      },
      error: err => (this.resetMessage = describeError(err)),
    });
  }
}
