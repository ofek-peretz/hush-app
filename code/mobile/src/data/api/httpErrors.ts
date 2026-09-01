/**
 * Network error taxonomy (alpha hardening). Every backend failure is classified
 * so callers can act correctly (retry vs drop) and so failures are OBSERVABLE
 * and distinguishable in telemetry — not collapsed into "offline".
 */

// 

export type HttpErrorKind =
  | 'timeout' // request exceeded the deadline (AbortController)
  | 'offline' // fetch threw (no connectivity / DNS / connection refused)
  | 'unauthorized' // 401 — revoked/invalid invite
  | 'validation' // 400 / 422 — malformed request (a client bug; never succeeds on retry)
  | 'server' // 5xx — backend fault (transient; safe to retry)
  | 'unknown'; // other non-2xx

export class HttpError extends Error {
  readonly kind: HttpErrorKind;
  readonly status?: number;
  constructor(kind: HttpErrorKind, status?: number, message?: string) {
    super(message ?? `${kind}${status ? `:${status}` : ''}`);
    this.name = 'HttpError';
    this.kind = kind;
    this.status = status;
  }

  /** Transient failures are worth queuing/retrying; permanent ones are not. */
  get transient(): boolean {
    return this.kind === 'timeout' || this.kind === 'offline' || this.kind === 'server';
  }
}

export function classifyStatus(status: number): HttpErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 400 || status === 422) return 'validation';
  if (status >= 500) return 'server';
  return 'unknown';
}
