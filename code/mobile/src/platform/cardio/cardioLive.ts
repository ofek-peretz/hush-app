/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ONE RUN, EVERY SURFACE — the fan-out for a run the PHONE is recording (founder, 2026-09-15).
 *
 * *"תיגע בשניים האלו לפי מה שישדרג את חווית המשתמש ואת המוצר שלנו ברמה הגבוהה ביותר."* — the second
 * of the two was that a run started on the phone never reached the wrist at all. The wire carried a
 * finished run HOME from the watch (`cardio_record`) and nothing live the other way, so the athlete
 * with the phone in a pocket and a watch on her wrist ran blind: no clock, no kilometre, no pause
 * button on the one screen she can see while running.
 *
 * A run is published from TWO places — the screen once a second while it is open, and `cardioRun`
 * every fifteen seconds from a background GPS wake — and each of them used to talk to the Live
 * Activity directly. Adding the wrist beside each call would be two more roads that eventually
 * disagree, so every publish now goes through `cardioSurfaces`, which feeds the lock card and the
 * wrist from the SAME state in the same call.
 *
 * THE PHONE STAYS THE ONLY AUTHORITY. The wrist draws what it is sent and proposes pause, resume and
 * finish; the screen that owns the run performs them (`setCardioControls`). Nothing here records.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { cardioLiveActivity, type CardioLiveActivityState } from '@/platform/liveActivity';
import type { WatchCardioLive } from '@/platform/watch/protocol';
import { elapsedSec as runElapsedSec, isRunning } from './cardioRun';

export type CardioControlOp = 'pause' | 'resume' | 'finish';

/** Hands a frame to the wrist; answers whether a reachable wrist is there to receive it. */
type WatchSink = (live: WatchCardioLive | null) => boolean;

/**
 * How often an UNCHANGED run is restated to the wrist. The wrist ticks its own clock from the anchor
 * it is sent, so frames only carry what moves slowly — distance, heart rate, energy. Anything that
 * matters at once (a pause, a kilometre, the finish) is sent the instant it happens.
 */
export const WATCH_CARDIO_REFRESH_MS = 5_000;

let watchSink: WatchSink | null = null;
let controls: Partial<Record<CardioControlOp, () => void>> | null = null;
let runId: string | null = null;
let lastKey = '';
let lastSentAtMs = 0;
let wristHasIt = false;

/** The session store plugs the watch bridge in here, once, for the life of the app. */
export function setCardioWatchSink(fn: WatchSink | null): void {
  watchSink = fn;
  if (!fn) wristHasIt = false;
}

/** The screen that owns the run registers what pause, resume and finish MEAN — null when it ends. */
export function setCardioControls(c: Partial<Record<CardioControlOp, () => void>> | null): void {
  controls = c;
}

/** A proposal from the wrist, performed by the run's owner. False when no run is listening. */
export function cardioControl(op: CardioControlOp): boolean {
  const f = controls?.[op];
  if (!f) return false;
  f();
  return true;
}

/**
 * ⛔ ONE BEAT, ONE WRIST — for a run too. True while a reachable wrist is mirroring this run, which
 * means it will play the kilometre and the finish itself; the phone then stays still, exactly as the
 * rest beats do (`phoneOwnsRestHaptics`).
 */
export function wristOwnsTheBeat(): boolean {
  return wristHasIt;
}

/** The lock card's state, as the wrist reads it. Pure but for the run clock it consults. */
export function toWatchCardio(state: CardioLiveActivityState, id: string, complete: boolean, nowMs: number): WatchCardioLive {
  // The run's own pause-aware clock when it is live — the screen's `elapsedSec` is a whole second
  // taken at render, and the wrist's clock would sit up to a second away from the phone's.
  const elapsed = Math.max(0, isRunning() ? runElapsedSec() : state.elapsedSec);
  const frozen = state.paused || complete;
  return {
    runId: id,
    gait: state.gait,
    paused: frozen,
    clockAnchorMs: frozen ? null : Math.round(nowMs - elapsed * 1000),
    elapsedS: elapsed,
    distanceKm: Number.isFinite(state.distanceKm) ? state.distanceKm : 0,
    hr: Number.isFinite(state.hr) ? Math.round(state.hr) : 0,
    kcal: Number.isFinite(state.calories) ? Math.round(state.calories) : 0,
    lastSplitKm: state.lastSplit?.km ?? null,
    lastSplitPaceS: state.lastSplit?.paceSec ?? null,
    lastSplitFastest: state.lastSplit?.fastest ?? false,
    complete,
  };
}

function toWrist(live: WatchCardioLive | null, force: boolean): void {
  if (!watchSink) return;
  const key = live ? `${live.runId}|${live.paused}|${live.lastSplitKm ?? 0}|${live.complete}` : '';
  const now = Date.now();
  if (!force && live && key === lastKey && now - lastSentAtMs < WATCH_CARDIO_REFRESH_MS) return;
  lastKey = key;
  lastSentAtMs = now;
  const reached = watchSink(live);
  wristHasIt = reached && !!live && !live.complete;
}

/** The ONLY way a run reaches the lock card and the wrist. */
export const cardioSurfaces = {
  start(state: CardioLiveActivityState, id: string): void {
    runId = id;
    lastKey = '';
    void cardioLiveActivity.start(state).catch(() => {});
    toWrist(toWatchCardio(state, id, false, Date.now()), true);
  },
  update(state: CardioLiveActivityState): void {
    void cardioLiveActivity.update(state).catch(() => {});
    // A background wake before the screen has started the run has nothing to name on the wrist.
    if (runId) toWrist(toWatchCardio(state, runId, false, Date.now()), false);
  },
  /** The run is over and was worth recording — the wrist closes it the way it closes its own. */
  complete(state: CardioLiveActivityState): void {
    if (!runId) return;
    toWrist(toWatchCardio(state, runId, true, Date.now()), true);
  },
  end(): void {
    void cardioLiveActivity.end().catch(() => {});
    if (!runId) return;
    runId = null;
    toWrist(null, true);
  },
};
