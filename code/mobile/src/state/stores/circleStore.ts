/**
 * ════ THE CIRCLE, HELD ONCE FOR EVERY SURFACE THAT SHOWS IT (2026-09-29) ════
 *
 * Three surfaces read her circle — the tab, the faces on Today's week line, and the week-closed
 * line on Well Done — and they must say the same thing. So there is one snapshot, read here, and
 * each surface subscribes to it. The tiny-store shape `i18n/gender` keeps: no provider, no context,
 * nothing that re-renders the world.
 *
 * A refresh PUBLISHES FIRST (`armCirclePublish`) and then reads, so her own row is never a workout
 * behind the one she just finished. Signed out, or a build with no identity URL, is `ready: false`,
 * and every surface draws nothing — never a door to nowhere.
 *
 * ⚠️ The web fixture (`screens/crew/devCrew`) is read HERE and nowhere else.
 */

//

import { useSyncExternalStore } from 'react';
import type { CircleState } from '@/domain/circle';
import { circleAvailable, circleFetch, circleSignedIn } from '@/platform/circleClient';
import { armCirclePublish } from '@/platform/circlePublish';
import { devCircle } from '@/screens/crew/devCrew';

export interface CircleSnapshot {
  /** A circle session exists on this phone (or the web fixture is on). */
  ready: boolean;
  /** Her circle, or null while she is in none. */
  circle: CircleState | null;
  /** When it was last read; 0 = never. */
  fetchedAt: number;
}

let snapshot: CircleSnapshot = { ready: false, circle: null, fetchedAt: 0 };
const listeners = new Set<() => void>();
let inflight: Promise<CircleSnapshot> | null = null;
let pendingCode: string | null = null;

function publish(next: CircleSnapshot): void {
  snapshot = next;
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const read = () => snapshot;

/** Re-renders the caller whenever the circle is read again. */
export function useCircle(): CircleSnapshot {
  return useSyncExternalStore(subscribe, read, read);
}

export function circleSnapshot(): CircleSnapshot {
  return snapshot;
}

/** Is the circle part of this build at all — the tab, and the faces on Today, exist only then. */
export function circleTabShown(): boolean {
  return circleAvailable() || devCircle() !== undefined;
}

/** Publish her week, then read the circle. One read at a time; a second caller shares the first. */
export function refreshCircle(nowMs: number = Date.now()): Promise<CircleSnapshot> {
  if (inflight) return inflight;
  inflight = (async () => {
    const dev = devCircle(nowMs);
    if (dev !== undefined) {
      publish({ ready: true, circle: dev, fetchedAt: nowMs });
      return snapshot;
    }
    if (!(await circleSignedIn())) {
      publish({ ready: false, circle: null, fetchedAt: nowMs });
      return snapshot;
    }
    await armCirclePublish(nowMs);
    const circle = await circleFetch();
    /* A failed read keeps what was already on screen rather than blanking her friends. */
    publish({ ready: true, circle: circle ?? snapshot.circle, fetchedAt: Date.now() });
    return snapshot;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** The same read, skipped when the last one is fresh — for surfaces she opens many times a day. */
export function refreshCircleIfStale(maxAgeMs = 60_000, nowMs: number = Date.now()): void {
  if (nowMs - snapshot.fetchedAt < maxAgeMs) return;
  void refreshCircle(nowMs);
}

/**
 * A circle invite that arrived before she could use it (no profile yet, or no session): held in
 * memory and spent once, by the circle tab.
 */
export function setPendingCircleCode(code: string | null): void {
  pendingCode = code;
}

export function takePendingCircleCode(): string | null {
  const code = pendingCode;
  pendingCode = null;
  return code;
}

/** Test seam. */
export function resetCircleStore(): void {
  snapshot = { ready: false, circle: null, fetchedAt: 0 };
  inflight = null;
  pendingCode = null;
  for (const l of listeners) l();
}
