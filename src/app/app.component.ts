import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { NetworkService } from './core/services/network.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AsyncPipe, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="topbar">
      <a class="brand" routerLink="/">Exam&nbsp;<span>RxJS</span></a>
      <nav>
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Scenarios</a>
        <a routerLink="/start" routerLinkActive="active">Start exam</a>
        <a routerLink="/leaderboard" routerLinkActive="active">Leaderboard</a>
        <a routerLink="/network" routerLinkActive="active">Network lab</a>
      </nav>
    </header>
    @if ((online$ | async) === false) {
      <div class="offline-banner" role="status">
        You are offline. Answers are kept here and saved when the connection comes back.
      </div>
    }
    <main>
      <router-outlet />
    </main>
  `,
})
export class AppComponent {
  // Scenario 7: fromEvent(window, 'offline') drives the banner on every page.
  readonly online$ = inject(NetworkService).online$;
}
