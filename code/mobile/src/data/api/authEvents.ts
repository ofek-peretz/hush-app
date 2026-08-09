/**
 * Auth event channel. The data layer (httpClient) signals a 401/revoked identity
 * here; the app store registers a handler that clears state and returns the
 * athlete to Enrollment. Kept dependency-free to avoid an api↔store import cycle.
 *
 * A 401 from the backend is definitive (constant-time token auth — not a
 * transient network blip), so any 401 on an authenticated request means the
 * invite was revoked. Controlled enrollment remains the source of truth.
 */
// @ts-nocheck

// 

type UnauthorizedHandler = () => void;

let handler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  handler = fn;
}

export function notifyUnauthorized(): void {
  handler?.();
}
