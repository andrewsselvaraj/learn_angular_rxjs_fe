import { HttpErrorResponse } from '@angular/common/http';

import { ApiError } from './models';

/** Turns an HttpClient error into one readable line, using the backend's ApiError shape when present. */
export function describeError(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return 'Cannot reach the server (offline, or the backend is not running on :8080).';
    }
    const body = err.error as Partial<ApiError> | null;
    if (body && typeof body === 'object' && body.message) {
      return `${err.status} ${body.code ?? ''}: ${body.message}`.trim();
    }
    return `${err.status} ${err.statusText}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/** 4xx errors (other than 408 and 429) will fail the same way again, so retrying them is pointless. */
export function isRetryable(err: unknown): boolean {
  if (!(err instanceof HttpErrorResponse)) {
    return false;
  }
  return err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500;
}
