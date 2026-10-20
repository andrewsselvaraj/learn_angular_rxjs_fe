import { Observable, catchError, map, of, startWith } from 'rxjs';

import { describeError } from './http-error';

export type LoadState<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error'; error: string };

/** Wraps a request so a template can show loading, data or error from one async pipe. */
export function toLoadState<T>(source$: Observable<T>): Observable<LoadState<T>> {
  return source$.pipe(
    map((data): LoadState<T> => ({ status: 'ok', data })),
    catchError(err => of<LoadState<T>>({ status: 'error', error: describeError(err) })),
    startWith<LoadState<T>>({ status: 'loading' }),
  );
}
