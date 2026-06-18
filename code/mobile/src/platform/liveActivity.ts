/**
 * Live Activity / Dynamic Island / Lock Screen host. DEFERRED native surface —
 * stubbed per the v1 build decision (wired later via EAS/Mac). Spec §1.25, §8.5.
 *
 * It renders the CANONICAL SessionMirror (platform/sessionMirror.ts) — the same
 * read-only projection the Apple Watch consumes. There is no second projection
 * system: this host simply renders a SUBSET of the mirror (the timer is the hero,
 * tabular; exercise name + set label as support).
 *
 * Contract (spec §8.5) — do not violate:
 *  - READ-ONLY mirror of the current session.
 *  - NO Complete-Set / completion control from outside the app (data integrity).
 *  - NO progress ring, heart rate, calories, or streak.
 *
 * Native note: drive the rest countdown from `mirror.restEndsAt` (absolute) via
 * SwiftUI `Text(timerInterval:)` so it is drift-proof under update latency.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { SessionMirror } from './sessionMirror';

export type { SessionMirror };

export interface LiveActivityHost {
  start(mirror: SessionMirror): Promise<void>;
  update(mirror: SessionMirror): Promise<void>;
  end(): Promise<void>;
}

/** v1 no-op stub. */
export const liveActivityStub: LiveActivityHost = {
  async start() {},
  async update() {},
  async end() {},
};

// ---- Native (ActivityKit) host ---------------------------------------------
//
// The native module (`modules/hush-live-activity`, Swift/ActivityKit) is resolved
// by name at runtime. `requireOptionalNativeModule` returns null where the module
// is absent (web / Expo Go / a build without it / jest), so the host degrades to
// the stub rather than throwing.

/** The minimal subset the ActivityKit ContentState renders (NATIVE_SURFACES §1):
 *  the timer is the hero (driven by `restEndsAtMs`, absolute), with the exercise
 *  name + set label as support. NO completion control, ring, HR, calories, streak. */
export interface LiveActivityState {
  exerciseName: string;
  setLabel: string;
  /** Absolute rest-end instant in ms epoch; null unless resting. Drives the native
   *  `Text(timerInterval:)` countdown so it is drift-proof under update latency. */
  restEndsAtMs: number | null;
  isResting: boolean;
}

interface HushLiveActivityNativeModule {
  startActivity(state: LiveActivityState): Promise<boolean>;
  updateActivity(state: LiveActivityState): Promise<void>;
  endActivity(): Promise<void>;
  areActivitiesEnabled(): boolean;
}

const nativeModule =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<HushLiveActivityNativeModule>('HushLiveActivity')
    : null;

/** Map the canonical mirror to the ActivityKit ContentState subset. Pure + exported
 *  so the projection rules (resting → absolute timer; active set → no countdown) are
 *  unit-tested without the native module. */
export function liveActivityStateFromMirror(mirror: SessionMirror): LiveActivityState {
  const isResting = mirror.phase === 'rest_inter' || mirror.phase === 'rest_transition';
  const endMs = mirror.restEndsAt ? Date.parse(mirror.restEndsAt) : NaN;
  return {
    exerciseName: mirror.exerciseName,
    setLabel: mirror.setLabel,
    restEndsAtMs: isResting && !Number.isNaN(endMs) ? endMs : null,
    isResting,
  };
}

/** ActivityKit-backed host (active on a native iOS build with the module). */
export const liveActivityNative: LiveActivityHost = {
  async start(mirror) {
    if (!nativeModule) return;
    await nativeModule.startActivity(liveActivityStateFromMirror(mirror));
  },
  async update(mirror) {
    if (!nativeModule) return;
    await nativeModule.updateActivity(liveActivityStateFromMirror(mirror));
  },
  async end() {
    if (!nativeModule) return;
    await nativeModule.endActivity();
  },
};

/** Active Live Activity host — the single swap point. Native ActivityKit host when
 *  the module is present (native iOS build); the no-op stub everywhere else. */
export const liveActivity: LiveActivityHost = nativeModule ? liveActivityNative : liveActivityStub;
