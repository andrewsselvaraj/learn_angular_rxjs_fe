import { Injectable, inject } from '@angular/core';
import {
  Observable,
  catchError,
  distinctUntilChanged,
  filter,
  fromEvent,
  map,
  merge,
  of,
  shareReplay,
  skip,
  startWith,
  switchMap,
} from 'rxjs';

import { ExamApiService } from './exam-api.service';

/**
 * Scenario 7: network drop handling.
 *
 * online$ follows the browser's own connection flag. When the browser comes back online we
 * ping the backend, because "the Wi-Fi is back" does not mean "the server is reachable".
 */
@Injectable({ providedIn: 'root' })
export class NetworkService {
  private readonly api = inject(ExamApiService);

  readonly online$: Observable<boolean> = merge(
    fromEvent(window, 'online').pipe(map(() => true)),
    fromEvent(window, 'offline').pipe(map(() => false)),
  ).pipe(startWith(navigator.onLine), distinctUntilChanged(), shareReplay({ bufferSize: 1, refCount: true }));

  /** Emits once each time the browser reconnects, after the server has answered a ping (true) or not (false). */
  readonly reconnected$: Observable<boolean> = this.online$.pipe(
    skip(1),
    filter(Boolean),
    switchMap(() => this.serverReachable()),
  );

  serverReachable(): Observable<boolean> {
    return this.api.ping().pipe(
      map(p => p.status === 'UP'),
      catchError(() => of(false)),
    );
  }
}
