import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { toLoadState } from '../../core/load-state';
import { ExamApiService } from '../../core/services/exam-api.service';

/** Where in this app each scenario can be tried out. */
const DEMO_LINKS: Record<number, { path: string; label: string }> = {
  1: { path: '/start', label: 'Start an exam and watch the timer' },
  2: { path: '/start', label: 'Pick answers during an exam' },
  3: { path: '/start', label: 'Navigator, progress bar and question panel' },
  4: { path: '/start', label: 'Switch tabs during an exam' },
  5: { path: '/start', label: 'Open the start screen' },
  6: { path: '/start', label: 'Double click Submit' },
  7: { path: '/network', label: 'Open the network lab' },
  8: { path: '/network', label: 'See the network lab for a short exam' },
  9: { path: '/leaderboard', label: 'Open the live leaderboard' },
};

@Component({
  selector: 'app-scenarios',
  standalone: true,
  imports: [AsyncPipe, RouterLink],
  template: `
    <h1>Nine RxJS scenarios in an online exam</h1>
    <p class="lead">
      Served by <code>GET /api/scenarios</code>. Each card links to the screen where you can try it.
      If you want to start small, the timer (1), auto-save (2) and double-submit protection (6) give the biggest benefit.
    </p>

    @if (scenarios$ | async; as state) {
      @if (state.status === 'loading') {
        <p class="muted">Loading scenarios…</p>
      } @else if (state.status === 'error') {
        <div class="alert">{{ state.error }}</div>
      } @else {
        <div class="grid">
          @for (s of state.data; track s.number) {
            <article class="card stack">
              <div>
                <span class="scenario-tag">Scenario {{ s.number }}</span>
                <h2>{{ s.title }}</h2>
                <p class="muted small">{{ s.description }}</p>
                <pre>{{ s.rxjs }}</pre>
                <details>
                  <summary class="small">Endpoints</summary>
                  <ul class="small">
                    @for (e of s.endpoints; track e) {
                      <li><code>{{ e }}</code></li>
                    }
                  </ul>
                </details>
              </div>
              <div class="spacer"></div>
              <a class="btn" [routerLink]="links[s.number].path">{{ links[s.number].label }} →</a>
            </article>
          }
        </div>
      }
    }
  `,
})
export class ScenariosComponent {
  readonly scenarios$ = toLoadState(inject(ExamApiService).scenarios());
  readonly links = DEMO_LINKS;
}
