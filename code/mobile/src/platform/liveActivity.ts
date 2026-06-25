/**
 * Live Activity / Dynamic Island / Lock Screen host. The NATIVE rendering
 * (ActivityKit + WidgetKit, SwiftUI) lives in `modules/hush-live-activity/` and
 * is built on macOS/Xcode — see LIVE_ACTIVITY_HANDOFF.md. This module is the
 * complete RN-side seam: it projects the canonical session/cardio state into the
 * exact ContentState the widget renders, resolves the native module when present,
 * and degrades to a no-op stub everywhere else (web / Expo Go / jest / a build
 * without the module).
 *
 * Two activity kinds, mirroring the design's Dynamic Island grammar:
 *  - `strength` — the live workout. Set / rest / transition / paused. The rest
 *    countdown is driven by `restEndsAtMs` (absolute) so SwiftUI's
 *    `Text(timerInterval:)` is drift-proof under update latency. NO completion
 *    control from outside the app (data integrity); NO HR/calories (the strength
 *    engine never reads them).
 *  - `cardio` — Open training. Running / paused, with pace · calories · heart and
 *    the latest kilometre split. Recorded, never coached (sealed from the engine).
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { SessionMirror } from './sessionMirror';
import type { CardioGait } from '@/data/local/models';

export type { SessionMirror };

// ───────────────────────────── Strength ─────────────────────────────
export type LiveActivityPhase = 'set' | 'rest' | 'transition' | 'paused';

/** The subset the strength ActivityKit ContentState renders. Mirrors the design's
 *  Dynamic Island (compact pill + expanded panel) and lock-screen card. */
export interface LiveActivityState {
  kind: 'strength';
  workoutName: string; // "Upper B"
  phase: LiveActivityPhase;
  exerciseName: string;
  setLabel: string; // "Set 1 of 4"
  liftIndex: number; // 1-based ordinal among distinct lifts
  liftCount: number;
  targetWeight: number | null; // null => bodyweight
  targetReps: number;
  /** Absolute rest-end instant (ms epoch); null unless resting. Drives the native
   *  drift-proof `Text(timerInterval:)` countdown. */
  restEndsAtMs: number | null;
  restTotalS: number | null;
  isResting: boolean;
  /** Upcoming exercise during a transition rest (else null). */
  nextExerciseName: string | null;
  nextTargetWeight: number | null;
  nextTargetReps: number | null;
}

// ───────────────────────────── Cardio ─────────────────────────────
/** The subset the cardio ActivityKit ContentState renders (Open training). */
export interface CardioLiveActivityState {
  kind: 'cardio';
  gait: CardioGait; // run | walk
  paused: boolean;
  /** Absolute start instant (ms epoch) so the widget's elapsed timer is drift-proof. */
  startedAtMs: number;
  elapsedSec: number;
  distanceKm: number;
  paceSec: number; // current avg pace, sec/km
  hr: number; // bpm
  calories: number; // kcal
  /** The most recent kilometre split (Dynamic Island "split" presentation); else null. */
  lastSplit: { km: number; paceSec: number; fastest: boolean } | null;
}

export type LiveActivityContent = LiveActivityState | CardioLiveActivityState;

// ───────────────────────────── Hosts ─────────────────────────────
export interface LiveActivityHost {
  start(mirror: SessionMirror): Promise<void>;
  update(mirror: SessionMirror): Promise<void>;
  end(): Promise<void>;
}

export interface CardioLiveActivityHost {
  start(state: CardioLiveActivityState): Promise<void>;
  update(state: CardioLiveActivityState): Promise<void>;
  end(): Promise<void>;
}

interface HushLiveActivityNativeModule {
  startActivity(content: LiveActivityContent): Promise<boolean>;
  updateActivity(content: LiveActivityContent): Promise<void>;
  endActivity(): Promise<void>;
  areActivitiesEnabled(): boolean;
}

const nativeModule =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<HushLiveActivityNativeModule>('HushLiveActivity')
    : null;

// ───────────────────────────── Projections (pure, tested) ─────────────────────────────
const phaseFromMirror = (phase: SessionMirror['phase']): LiveActivityPhase => {
  switch (phase) {
    case 'paused':
      return 'paused';
    case 'rest_transition':
      return 'transition';
    case 'rest_inter':
      return 'rest';
    default:
      return 'set';
  }
};

/** Map the canonical mirror to the strength ContentState. Pure + exported so the
 *  projection rules (resting → absolute timer; transition carries the next lift;
 *  set → no countdown) are unit-tested without the native module. */
export function liveActivityStateFromMirror(mirror: SessionMirror): LiveActivityState {
  const isResting = mirror.phase === 'rest_inter' || mirror.phase === 'rest_transition';
  const endMs = mirror.restEndsAt ? Date.parse(mirror.restEndsAt) : NaN;
  const isTransition = mirror.phase === 'rest_transition';
  return {
    kind: 'strength',
    workoutName: mirror.workoutName,
    phase: phaseFromMirror(mirror.phase),
    exerciseName: mirror.exerciseName,
    setLabel: mirror.setLabel,
    liftIndex: mirror.liftIndex,
    liftCount: mirror.liftCount,
    targetWeight: mirror.targetWeight,
    targetReps: mirror.targetReps,
    restEndsAtMs: isResting && !Number.isNaN(endMs) ? endMs : null,
    restTotalS: isResting ? mirror.restTotalS ?? null : null,
    isResting,
    nextExerciseName: isTransition ? mirror.nextExerciseName : null,
    nextTargetWeight: isTransition ? mirror.nextTargetWeight : null,
    nextTargetReps: isTransition ? mirror.nextTargetReps : null,
  };
}

// ───────────────────────────── Native + stub hosts ─────────────────────────────
export const liveActivityStub: LiveActivityHost = {
  async start() {},
  async update() {},
  async end() {},
};

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

const cardioStub: CardioLiveActivityHost = { async start() {}, async update() {}, async end() {} };
const cardioNative: CardioLiveActivityHost = {
  async start(state) {
    if (!nativeModule) return;
    await nativeModule.startActivity(state);
  },
  async update(state) {
    if (!nativeModule) return;
    await nativeModule.updateActivity(state);
  },
  async end() {
    if (!nativeModule) return;
    await nativeModule.endActivity();
  },
};

/** Active hosts — the single swap point. Native ActivityKit when the module is
 *  present (native iOS build); the no-op stub everywhere else. */
export const liveActivity: LiveActivityHost = nativeModule ? liveActivityNative : liveActivityStub;
export const cardioLiveActivity: CardioLiveActivityHost = nativeModule ? cardioNative : cardioStub;
