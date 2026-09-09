/**
 * Live Activity / Dynamic Island / Lock Screen host. The NATIVE side is split in
 * two: the ActivityKit controller (`modules/hush-live-activity/ios/`, in the app
 * target) and the WidgetKit UI (`targets/widget/`, the extension built by
 * @bacons/apple-targets) — see LIVE_ACTIVITY_HANDOFF.md. This module is the
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

// 

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { tg } from '@/i18n';
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
  /** The same count as NUMBERS — v7 6.2 draws it as a dot row, which a localized string cannot be. */
  setIndex: number;
  setCount: number;
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
  // ── The lock screen as a control (founder, 2026-09-08) — see `LockExtras`. ──
  restAfterS: number;
  lastSetOfSession: boolean;
  nextSetLabel: string;
  nextSetIndex: number;
  nextSetCount: number;
  alertTitle: string;
  alertBody: string;
  wordRest: string;
  wordNext: string;
  wordPaused: string;
  wordLogged: string;
  actDone: string;
  actAddRest: string;
  actStart: string;
  // ── Her figures, typed on the lock screen (founder, 2026-09-08, mid-workout) — see `LockExtras`. ──
  unitLabel: string;
  weightStep: number;
  wordReps: string;
  // ── The voice's loading dialogue (spec §3.2 / §4): the card offers Ready beside Done. ──
  awaitingReady: boolean;
  actReady: string;
}

/**
 * ════ THE LOCK SCREEN IS A CONTROL (founder, 2026-09-08) ════
 *
 *   > *"להזין סט כשהמסך סגור וגם מנוחה של קיצור או הוספת 15 שניות. כי כרגע חובה בכל פעם לפתוח
 *   > את המסך."*
 *
 * What a tap on the Live Activity needs in order to answer WITHOUT the phone's JS awake — baked
 * on the phone, in her language, and carried in the activity's own state: the rest the set on
 * stage will earn, the label of the set after it, the rest-over alert's words (`nextSetAlert`),
 * and the three verbs. The widget draws these strings and decides nothing (`theWidgetSpeaksFromThePhone`
 * is the same law, on the same surface). The projection the intents apply locally lives in
 * `targets/widget/HushLockIntents.swift`; the phone reconciles every tap from the App Group queue
 * (`drainLockIntents`) at the instant it happened.
 */
export interface LockExtras {
  restAfterS: number;
  lastSetOfSession: boolean;
  nextSetLabel: string;
  nextSetIndex: number;
  nextSetCount: number;
  alertTitle: string;
  alertBody: string;
  words: { rest: string; next: string; paused: string; logged: string; done: string; addRest: string; start: string; reps: string; ready: string };
  /** The voice's loading dialogue is open: the set on stage waits for her "מוכן" (spec §3.2). */
  awaitingReady: boolean;
  /*
   * ════ HER FIGURES, TYPED ON THE LOCK SCREEN (founder 2026-09-08, mid-workout) ════
   *
   *   > *"אפשרות להזין ישירות מהלייב אקטיביטי את המשקל והחזרות."*
   *
   * A Live Activity has no text field — only buttons — so the card carries two steppers, and
   * they need to know what one step of load IS for this lift: the equipment's own detent, the
   * same `weightStepFor` the stage's nudgers and the editor's wheel turn by. The unit word rides
   * with it so the card never says "kg" to an athlete in pounds.
   */
  unitLabel: string;
  weightStep: number;
}

/**
 * One lock-screen tap, as the queue records it: which verb, and the instant her thumb landed.
 * A `complete_set` may carry HER FIGURES — the steppers' values at the tap — and then the set is
 * written with them, exactly as a typed set on the stage is (`completeSet(override)`).
 */
export interface LockIntent {
  id: string;
  type: 'complete_set' | 'add_rest' | 'end_rest' | 'set_ready';
  atMs: number;
  /** Her load at the tap (kg/lb per profile), when she moved a stepper; `null` = bodyweight. */
  weight?: number | null;
  /** Her reps at the tap, when she moved a stepper. */
  reps?: number;
}

/** The four verbs, in the order the Swift enum declares them: three of the stage, and "מוכן" of the voice. */
export const LOCK_INTENT_TYPES: readonly LockIntent['type'][] = ['complete_set', 'add_rest', 'end_rest', 'set_ready'];

/** Parse what the native queue hands over — anything not a known verb with a sane instant is dropped. */
export function parseLockIntents(raw: unknown): LockIntent[] {
  if (!Array.isArray(raw)) return [];
  const out: LockIntent[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.atMs !== 'number' || !Number.isFinite(o.atMs)) continue;
    if (!(LOCK_INTENT_TYPES as readonly unknown[]).includes(o.type)) continue;
    const intent: LockIntent = { id: o.id, type: o.type as LockIntent['type'], atMs: o.atMs };
    // Figures ride only on a set, only when sane: reps a positive whole number, a load finite and
    // not negative (or null — bodyweight). Half a pair (a load with no reps) is dropped whole.
    if (intent.type === 'complete_set' && typeof o.reps === 'number' && Number.isInteger(o.reps) && o.reps > 0) {
      const w = o.weight;
      // A property list has no null: the native queue leaves the key OUT for bodyweight.
      if (w === undefined || w === null) {
        intent.reps = o.reps;
        intent.weight = null;
      } else if (typeof w === 'number' && Number.isFinite(w) && w >= 0) {
        intent.reps = o.reps;
        intent.weight = w;
      }
    }
    out.push(intent);
  }
  return out.sort((a, b) => a.atMs - b.atMs);
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
  start(mirror: SessionMirror, lock?: LockExtras): Promise<void>;
  update(mirror: SessionMirror, lock?: LockExtras): Promise<void>;
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
  /** Every lock-screen tap since the last drain, oldest first; the native queue is emptied. */
  drainLockIntents(): Promise<unknown>;
  addListener?(event: 'onLockIntent', cb: () => void): { remove(): void };
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
/** What the state carries when no lock extras were handed over (a harness, a cardio switch). */
const NO_LOCK: LockExtras = {
  restAfterS: 0,
  lastSetOfSession: false,
  nextSetLabel: '',
  nextSetIndex: 1,
  nextSetCount: 1,
  alertTitle: '',
  alertBody: '',
  words: { rest: 'Rest', next: 'Next up', paused: 'Paused', logged: 'Logged', done: 'Done', addRest: '+15 s', start: 'Next set', reps: 'reps', ready: 'Ready' },
  awaitingReady: false,
  unitLabel: 'kg',
  weightStep: 2.5,
};

export function liveActivityStateFromMirror(mirror: SessionMirror, lock: LockExtras = NO_LOCK): LiveActivityState {
  const isResting = mirror.phase === 'rest_inter' || mirror.phase === 'rest_transition';
  const endMs = mirror.restEndsAt ? Date.parse(mirror.restEndsAt) : NaN;
  const isTransition = mirror.phase === 'rest_transition';
  return {
    kind: 'strength',
    workoutName: mirror.workoutName,
    phase: phaseFromMirror(mirror.phase),
    exerciseName: mirror.exerciseName,
    // The Live Activity is a PHONE surface, so its set label follows the app language (the watch
    // is English-only and keeps the raw English mirror labels). Names stay English by product rule.
    //
    // DURING A REST, THE SET IS THE NEXT ONE. The machine holds `setIndex` on the set that has
    // just been completed until the rest ends, so `setNumber` on a rest frame is the set the
    // athlete already did — and the Lock Screen was showing it back to them while they waited to
    // do the following one. The mirror now says which set is coming; on a rest, that is the only
    // set worth naming.
    // A warm-up bridge says so on the Lock Screen too — same localized wording as the stage.
    setLabel:
      isResting && mirror.nextSetNumber > 0
        ? tg(mirror.nextIsWarmup ? 'workout.warmupOfM' : 'workout.setOfM', { n: mirror.nextSetNumber, m: mirror.nextSetsInExercise })
        : tg(mirror.isWarmup ? 'workout.warmupOfM' : 'workout.setOfM', { n: mirror.setNumber, m: mirror.setsInExercise }),
    // The dot row follows the SAME set the label names — on a rest that is the set still to come.
    setIndex: isResting && mirror.nextSetNumber > 0 ? mirror.nextSetNumber : mirror.setNumber,
    setCount: isResting && mirror.nextSetNumber > 0 ? mirror.nextSetsInExercise : mirror.setsInExercise,
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
    restAfterS: lock.restAfterS,
    lastSetOfSession: lock.lastSetOfSession,
    nextSetLabel: lock.nextSetLabel,
    nextSetIndex: lock.nextSetIndex,
    nextSetCount: lock.nextSetCount,
    alertTitle: lock.alertTitle,
    alertBody: lock.alertBody,
    wordRest: lock.words.rest,
    wordNext: lock.words.next,
    wordPaused: lock.words.paused,
    wordLogged: lock.words.logged,
    actDone: lock.words.done,
    actAddRest: lock.words.addRest,
    actStart: lock.words.start,
    unitLabel: lock.unitLabel,
    weightStep: lock.weightStep,
    wordReps: lock.words.reps,
    awaitingReady: lock.awaitingReady && phaseFromMirror(mirror.phase) === 'set',
    actReady: lock.words.ready,
  };
}

// ───────────────────────────── The lock screen's taps ─────────────────────────────

/** Every tap queued on the lock screen since the last drain, oldest first. Empty off-device. */
export async function drainLockIntents(): Promise<LockIntent[]> {
  if (!nativeModule?.drainLockIntents) return [];
  try {
    return parseLockIntents(await nativeModule.drainLockIntents());
  } catch {
    return [];
  }
}

/** The whistle: a tap was just queued. The listener should drain — the event carries nothing. */
export function addLockIntentListener(cb: () => void): () => void {
  if (!nativeModule?.addListener) return () => {};
  try {
    const sub = nativeModule.addListener('onLockIntent', cb);
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

// ───────────────────────────── Native + stub hosts ─────────────────────────────

/**
 * ════ IS A LIVE ACTIVITY ON THE LOCK SCREEN RIGHT NOW? ════
 *
 * Asked by `restHaptics` (founder 2026-07-29). The rest notifications exist ONLY because a JS timer
 * is suspended when the phone is locked — they are a backstop for a countdown the athlete cannot
 * see. A Live Activity runs in ActivityKit, not in JS, so while one is up the countdown IS on the
 * lock screen, and the "7 seconds left" note becomes a second copy of something already visible.
 *
 * Tracked here rather than asked of the native module, because the answer has to be TRUE ON THE
 * STUB as well: on any surface with no ActivityKit there is no Live Activity, so the warning is not
 * redundant and must still be sent.
 */
let activityIsLive = false;

export function liveActivityRunning(): boolean {
  return activityIsLive;
}

export const liveActivityStub: LiveActivityHost = {
  async start() {},
  async update() {},
  async end() {},
};

export const liveActivityNative: LiveActivityHost = {
  async start(mirror, lock) {
    if (!nativeModule) return;
    activityIsLive = true;
    await nativeModule.startActivity(liveActivityStateFromMirror(mirror, lock));
  },
  async update(mirror, lock) {
    if (!nativeModule) return;
    await nativeModule.updateActivity(liveActivityStateFromMirror(mirror, lock));
  },
  async end() {
    if (!nativeModule) return;
    activityIsLive = false;
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
