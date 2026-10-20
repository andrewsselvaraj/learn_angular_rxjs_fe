import { Injectable, inject } from '@angular/core';
import { Observable, catchError, defer, EMPTY, map, retry, switchMap, tap, timer } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';

import { environment } from '../../../environments/environment';
import { Leaderboard, LeaderboardMessage } from '../models';
import { ExamApiService } from './exam-api.service';

export interface LeaderboardUpdate {
  source: 'poll' | 'websocket';
  message: LeaderboardMessage;
}

/**
 * Scenario 9: live results for the teacher view, two ways.
 *
 * poll(): interval + switchMap(http.get). switchMap drops a slow response if the next tick has
 * already fired, so the table never goes backwards.
 * live(): the backend's plain-JSON WebSocket through rxjs/webSocket. It reconnects on its own.
 */
@Injectable({ providedIn: 'root' })
export class LeaderboardService {
  private readonly api = inject(ExamApiService);
  private socket: WebSocketSubject<LeaderboardMessage | string> | null = null;

  poll(examId: string, intervalMs: number): Observable<LeaderboardUpdate> {
    return timer(0, intervalMs).pipe(
      switchMap(() => this.api.leaderboard(examId).pipe(catchError(() => EMPTY))),
      map((leaderboard: Leaderboard) => ({
        source: 'poll' as const,
        message: { type: 'SNAPSHOT' as const, sentAt: leaderboard.generatedAt, changed: null, leaderboard },
      })),
    );
  }

  live(): Observable<LeaderboardUpdate> {
    return defer(() => {
      const socket = webSocket<LeaderboardMessage | string>({
        url: environment.wsUrl,
        // The server expects the plain text "refresh", not JSON, so strings go out as-is.
        serializer: value => (typeof value === 'string' ? value : JSON.stringify(value)),
      });
      this.socket = socket;
      return socket.asObservable();
    }).pipe(
      map(message => ({ source: 'websocket' as const, message: message as LeaderboardMessage })),
      tap({ finalize: () => (this.socket = null) }),
      retry({ delay: 3000 }),
    );
  }

  /** Asks the WebSocket for a fresh SNAPSHOT. Does nothing while polling. */
  refresh(): void {
    this.socket?.next('refresh');
  }
}
