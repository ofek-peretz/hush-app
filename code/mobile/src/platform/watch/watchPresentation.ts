/**
 * Watch presentation projection (non-native — the canonical spec the SwiftUI
 * layer conforms to). PURE: given the phone's latest mirror, the connection
 * state, the pre-session lobby, and the one transient local flag (the Set
 * Confirmation interstitial), it produces the exact screen the watch must render.
 *
 * Source of truth for the visual + interaction design: the Claude Design project
 * `ui_kits/watch` ("The same instrument, on the wrist") — the inverted "stage"
 * surface, mono numbers, the giant load, the LoadDelta mark, the rest ring, and the
 * six live-workout screens (Start · Active Set · Set Confirmation · Inter-Set Rest ·
 * Transition Rest · Complete) plus the carried-over Choose / Pause / Edit / Swap.
 *
 * The watch owns no workout state. Choose-workout, inline Edit (load + reps), and
 * the Swap overlay are LOCAL view modes the native layer drives from the lobby /
 * mirror data; they are not separate projection states. Every action is a PROPOSAL
 * the phone validates (the phone is the sole authority over the session lifecycle).
 */
// @ts-nocheck

// 

import type { SessionMirror } from '@/platform/sessionMirror';
import type { WatchIntentType, WatchLobby } from './protocol';
import type { WatchHapticEvent } from './watchHaptics';

export type WatchScreenKind =
  | 'start'
  | 'active_set'
  | 'set_confirmation'
  | 'inter_set_rest'
  | 'transition_rest'
  | 'paused'
  | 'workout_complete'
  | 'connection_lost'
  | 'idle';

/** Every action the watch can present. Maps to a watch intent or a local-only UI
 *  transition (see `actionToIntent`). */
export type WatchActionId =
  | 'begin' // intent: start the queued workout
  | 'choose_workout' // local: open the Choose Workout overlay
  | 'select_workout' // intent: queue the picked workout
  | 'edit_result' // local: enter inline Edit mode (load + reps)
  | 'save_result' // local: leave Edit mode (the override rides Complete Set)
  | 'complete_set' // intent: log the set (carries the Edit override if any)
  | 'swap' // local: open the Swap overlay
  | 'swap_pick' // intent: swap to the chosen exercise
  | 'ready' // intent: end rest now (Start next set / lift / Skip rest)
  | 'add_rest' // intent: +15s
  | 'pause' // intent
  | 'resume' // intent
  | 'end_workout' // intent: finish_early (Pause → End workout, routes to Complete)
  | 'dismiss'; // local: dismiss Complete

/** i18n keys for the founder-locked watch copy (values live in en.json). */
export const WATCH_COPY = {
  nextWorkout: 'watch.nextWorkout',
  begin: 'watch.begin',
  chooseWorkout: 'watch.chooseWorkout',
  recovery: 'watch.recovery',
  upNext: 'watch.upNext',
  startNextSet: 'watch.startNextSet',
  skipRest: 'watch.skipRest',
  startNextLift: 'watch.startNextLift',
  addRest: 'watch.addRest',
  ready: 'watch.ready',
  rest: 'watch.rest',
  next: 'watch.next',
  completeSet: 'watch.completeSet',
  save: 'watch.save',
  editResult: 'watch.editResult',
  crownToAdjust: 'watch.crownToAdjust',
  setLogged: 'watch.setLogged', // "Set {{n}} of {{m}} logged"
  recorded: 'watch.recorded',
  workoutHeld: 'watch.workoutHeld',
  pausedTitle: 'watch.pausedTitle',
  resume: 'watch.resume',
  endWorkout: 'watch.endWorkout',
  saved: 'watch.saved',
  complete: 'watch.complete', // "{{name}} complete."
  done: 'watch.done',
  swapTitle: 'watch.swapTitle',
  swapHint: 'watch.swapHint',
  cancel: 'watch.cancel',
  reconnecting: 'watch.reconnecting',
  continueOnPhone: 'watch.continueOnPhone',
} as const;

export interface WatchScreenWorkout {
  id: string;
  name: string;
  lifts?: number;
  muscles?: string;
  done?: boolean;
}

export interface WatchSwapOption {
  id: string;
  name: string;
}

export interface WatchScreen {
  kind: WatchScreenKind;
  // ---- Start (lobby) ----
  workoutName?: string;
  muscles?: string;
  lifts?: number;
  durationLabel?: string;
  workouts?: WatchScreenWorkout[];
  resting?: boolean;
  // ---- Active Set ----
  exerciseName?: string;
  exerciseGroup?: string;
  setLabel?: string;
  setNumber?: number;
  setsInExercise?: number;
  /** "Lift i/n" — exercises-remaining context on the top strip. */
  liftIndex?: number;
  liftCount?: number;
  targetWeight?: number | null;
  targetReps?: number;
  /** The rep band's ceiling (floor == targetReps); drives the 8–10 rep-range ruler (WT2).
   *  Null/omitted when the target is a single rep count. */
  targetRepsHi?: number | null;
  /** Signed kg load change → the LoadDelta mark (sage ▲ / clay ▼ / hold). */
  loadDeltaKg?: number;
  /** In-class alternatives for the Swap overlay (empty/undefined = no swap glyph). */
  swapOptions?: WatchSwapOption[];
  // ---- Set Confirmation ----
  confirmWeight?: number | null;
  confirmReps?: number;
  confirmIndex?: number;
  confirmTotal?: number;
  // ---- rests ----
  restEndsAt?: string | null;
  restRemainingS?: number | null;
  nextExerciseName?: string | null;
  nextSetsInExercise?: number;
  nextTargetWeight?: number | null;
  nextTargetReps?: number | null;
  nextLoadDeltaKg?: number;
  // ---- Complete ----
  summary?: { timeLabel: string; sets: number; up: number } | null;
  // ---- shared ----
  titleKey?: string;
  disabled?: boolean;
  reconnecting?: boolean;
  actions: WatchActionId[];
  entryHaptic?: WatchHapticEvent;
}

export type ConnectionState = 'connected' | 'reconnecting';

export interface WatchEditDraft {
  weight: number | null;
  reps: number;
}

export interface WatchLocalUi {
  /** The Set Confirmation interstitial (`{weight} × {reps}`, "Set n of m logged"). */
  setConfirm?: { weight: number | null; reps: number; index: number; total: number };
}

/** Map an action to the watch intent it sends, or null if it is local-only UI. */
export function actionToIntent(id: WatchActionId): WatchIntentType | null {
  switch (id) {
    case 'begin':
      return 'start_workout';
    case 'select_workout':
      return 'select_workout';
    case 'complete_set':
      return 'complete_set';
    case 'swap_pick':
      return 'swap_exercise';
    case 'ready':
      return 'end_rest';
    case 'add_rest':
      return 'add_rest';
    case 'pause':
      return 'pause';
    case 'resume':
      return 'resume';
    case 'end_workout':
      return 'finish_early';
    case 'choose_workout':
    case 'edit_result':
    case 'save_result':
    case 'swap':
    case 'dismiss':
      return null; // local UI transitions
    default:
      return null;
  }
}

/**
 * Project the screen to render. Total and pure; never throws.
 *
 * Precedence: a lost connection always wins (honest viewer); then the local Set
 * Confirmation interstitial (it always shows its brief beat, even as the phone
 * advances); then the live phase / pre-session lobby.
 */
export function projectWatchScreen(
  mirror: SessionMirror | null,
  connection: ConnectionState,
  ui: WatchLocalUi = {},
  lobby: WatchLobby | null = null,
): WatchScreen {
  // 1. Connection lost — honest viewer over the dimmed last-known context.
  if (connection === 'reconnecting') {
    return {
      kind: 'connection_lost',
      titleKey: WATCH_COPY.reconnecting,
      exerciseName: mirror?.exerciseName,
      setLabel: mirror?.setLabel,
      restEndsAt: mirror?.restEndsAt ?? null,
      restRemainingS: mirror?.restRemainingS ?? null,
      disabled: true,
      reconnecting: true,
      actions: [],
      entryHaptic: 'connection_lost',
    };
  }

  // 2. Set Confirmation interstitial — local, always shows its brief beat.
  if (ui.setConfirm) {
    return {
      kind: 'set_confirmation',
      confirmWeight: ui.setConfirm.weight,
      confirmReps: ui.setConfirm.reps,
      confirmIndex: ui.setConfirm.index,
      confirmTotal: ui.setConfirm.total,
      actions: [],
      entryHaptic: 'set_logged',
    };
  }

  // 3. No active session → Complete, the Start (lobby) screen, or idle.
  if (!mirror || mirror.phase === 'complete') {
    if (mirror?.phase === 'complete') {
      return {
        kind: 'workout_complete',
        workoutName: mirror.workoutName,
        summary: mirror.summary,
        actions: ['dismiss'],
        entryHaptic: 'workout_saved',
      };
    }
    if (lobby) {
      return {
        kind: 'start',
        workoutName: lobby.workoutName,
        muscles: lobby.muscles,
        lifts: lobby.lifts,
        durationLabel: lobby.durationLabel,
        workouts: lobby.workouts,
        resting: !!lobby.resting,
        disabled: !!lobby.resting,
        actions: lobby.resting ? ['choose_workout'] : ['begin', 'choose_workout'],
      };
    }
    return { kind: 'idle', actions: [] };
  }

  // 4. Live phase.
  switch (mirror.phase) {
    case 'paused':
      return {
        kind: 'paused',
        titleKey: WATCH_COPY.pausedTitle,
        // Resume (primary) + End workout (routes straight to Complete — no extra step).
        actions: ['resume', 'end_workout'],
        entryHaptic: 'paused',
      };

    case 'active_set': {
      const actions: WatchActionId[] = ['edit_result', 'complete_set', 'pause'];
      if (mirror.swapOptions.length > 0) actions.push('swap');
      return {
        kind: 'active_set',
        exerciseName: mirror.exerciseName,
        exerciseGroup: mirror.exerciseGroup,
        setLabel: mirror.setLabel,
        setNumber: mirror.setNumber,
        setsInExercise: mirror.setsInExercise,
        liftIndex: mirror.liftIndex,
        liftCount: mirror.liftCount,
        targetWeight: mirror.targetWeight,
        targetReps: mirror.targetReps,
        targetRepsHi: mirror.targetRepsHi,
        loadDeltaKg: mirror.loadDeltaKg,
        swapOptions: mirror.swapOptions,
        actions,
      };
    }

    case 'rest_inter':
      return {
        kind: 'inter_set_rest',
        restEndsAt: mirror.restEndsAt,
        restRemainingS: mirror.restRemainingS,
        // The same exercise; the upcoming set's load × reps (unchanged).
        exerciseName: mirror.exerciseName,
        setNumber: mirror.setNumber,
        setsInExercise: mirror.setsInExercise,
        liftIndex: mirror.liftIndex,
        liftCount: mirror.liftCount,
        targetWeight: mirror.targetWeight,
        targetReps: mirror.targetReps,
        actions: ['ready', 'add_rest', 'pause'],
      };

    case 'rest_transition':
      return {
        kind: 'transition_rest',
        restEndsAt: mirror.restEndsAt,
        restRemainingS: mirror.restRemainingS,
        nextExerciseName: mirror.nextExerciseName,
        nextSetsInExercise: mirror.nextSetsInExercise,
        nextTargetWeight: mirror.nextTargetWeight,
        nextTargetReps: mirror.nextTargetReps,
        nextLoadDeltaKg: mirror.nextLoadDeltaKg,
        liftIndex: mirror.liftIndex,
        liftCount: mirror.liftCount,
        swapOptions: mirror.nextSwapOptions,
        actions: mirror.nextSwapOptions.length > 0
          ? ['ready', 'add_rest', 'pause', 'swap']
          : ['ready', 'add_rest', 'pause'],
      };

    default:
      return { kind: 'idle', actions: [] };
  }
}
