/**
 * Watch presentation projection (non-native — the canonical spec the SwiftUI
 * layer conforms to). PURE: given the phone's latest mirror, the connection
 * state, and transient local UI flags, it produces the exact screen the watch
 * must render — every approved state from WATCH_EXPERIENCE_SPEC.md.
 *
 * The watch owns no workout state. The only inputs that are not the phone's
 * mirror are (a) connection reachability and (b) two transient *presentation*
 * flags — the Finish confirmation being open, and the brief Exercise Complete
 * interstitial having elapsed. Neither is workout state; both are local UI.
 *
 * Screens covered: active_set · inter_set_rest · exercise_complete ·
 * transition_rest · paused · finish_confirm · workout_complete ·
 * connection_lost · idle.
 */
import type { SessionMirror } from '@/platform/sessionMirror';
import type { WatchIntentType } from './protocol';
import type { WatchHapticEvent } from './watchHaptics';

export type WatchScreenKind =
  | 'active_set'
  | 'inter_set_rest'
  | 'exercise_complete'
  | 'transition_rest'
  | 'paused'
  | 'finish_confirm'
  | 'rep_adjust'
  | 'workout_complete'
  | 'connection_lost'
  | 'idle';

/** Every action the watch can present. Maps to a watch intent or a local-only UI
 *  transition (see `actionToIntent`). */
export type WatchActionId =
  | 'complete_set'
  | 'couldnt_complete' // local: open the rep-adjustment screen
  | 'confirm_reps' // intent: complete_set with the adjusted actual reps
  | 'cancel_reps' // local: back to Active Set without logging
  | 'exercise_busy'
  | 'ready'
  | 'pause'
  | 'resume'
  | 'finish' // local: open the Finish confirmation
  | 'finish_yes' // intent: finish_early
  | 'finish_no' // local: close the confirmation
  | 'dismiss'; // local: dismiss Workout Complete

/** i18n keys for the founder-locked watch copy (values live in en.json). */
export const WATCH_COPY = {
  next: 'watch.next',
  interEncouragement: 'watch.interEncouragement',
  transitionEncouragement: 'watch.transitionEncouragement',
  exerciseComplete: 'watch.exerciseComplete', // template: "{{exercise}} Complete"
  pausedTitle: 'watch.pausedTitle',
  finishPrompt: 'watch.finishPrompt',
  finishYes: 'watch.finishYes',
  finishNo: 'watch.finishNo',
  couldntComplete: 'watch.couldntComplete', // the Active Set action label
  repAdjustTitle: 'watch.repAdjustTitle', // "Actual reps"
  repAdjustTarget: 'watch.repAdjustTarget', // "Target {{reps}}"
  confirm: 'watch.confirm', // "Confirm"
  workoutCompleteTitle: 'watch.workoutCompleteTitle',
  reconnecting: 'watch.reconnecting',
  continueOnPhone: 'watch.continueOnPhone',
} as const;

export interface WatchScreen {
  kind: WatchScreenKind;
  // ---- content (populated per kind) ----
  exerciseName?: string;
  setLabel?: string;
  targetWeight?: number | null;
  targetReps?: number;
  /** The live rep-adjustment value on the rep_adjust screen (Crown-driven). */
  actualReps?: number;
  restEndsAt?: string | null;
  restRemainingS?: number | null;
  nextExerciseName?: string | null;
  nextTargetWeight?: number | null;
  nextTargetReps?: number | null;
  completedExerciseName?: string | null;
  /** i18n key for the encouragement line, when the screen has one. */
  encouragementKey?: string;
  /** i18n key for a title/prompt (Paused, Finish Workout?, Well Done., Reconnecting). */
  titleKey?: string;
  /** Phone-dependent actions are inert (connection lost). */
  disabled?: boolean;
  /** Last-known content is shown dimmed behind a reconnecting overlay. */
  reconnecting?: boolean;
  /** Actions to present, primary first. */
  actions: WatchActionId[];
  /** Haptic event to fire when this screen is entered, if any. */
  entryHaptic?: WatchHapticEvent;
}

export type ConnectionState = 'connected' | 'reconnecting';

export interface WatchLocalUi {
  /** The athlete tapped Finish in Paused → the confirmation dialog is open. */
  finishConfirm?: boolean;
  /** The Exercise Complete interstitial's brief timer has fired → show the rest. */
  exerciseCompleteAck?: boolean;
  /** The rep-adjustment screen is open (the athlete tapped Couldn't Complete).
   *  `actualReps` is the live Crown value (initialized to the target reps). */
  repAdjust?: { actualReps: number };
}

/** Map an action to the watch intent it sends, or null if it is local-only UI. */
export function actionToIntent(id: WatchActionId): WatchIntentType | null {
  switch (id) {
    case 'complete_set':
      return 'complete_set';
    case 'confirm_reps':
      return 'complete_set'; // confirmed adjusted reps = a normal set completion
    case 'exercise_busy':
      return 'exercise_busy';
    case 'ready':
      return 'end_rest';
    case 'pause':
      return 'pause';
    case 'resume':
      return 'resume';
    case 'finish_yes':
      return 'finish_early';
    case 'couldnt_complete': // opens the rep-adjustment screen (local)
    case 'cancel_reps':
    case 'finish':
    case 'finish_no':
    case 'dismiss':
      return null; // local UI transitions
    default:
      return null;
  }
}

/**
 * Project the screen to render. Total and pure; never throws.
 *
 * Precedence: a lost connection always wins (the watch becomes an honest viewer);
 * then a finished session; then the live phase. The Exercise Complete interstitial
 * and the Finish confirmation are the only two local presentation states.
 */
export function projectWatchScreen(
  mirror: SessionMirror | null,
  connection: ConnectionState,
  ui: WatchLocalUi = {},
): WatchScreen {
  // 1. Connection lost — honest viewer over the dimmed last-known context.
  if (connection === 'reconnecting') {
    return {
      kind: 'connection_lost',
      titleKey: WATCH_COPY.reconnecting,
      exerciseName: mirror?.exerciseName,
      setLabel: mirror?.setLabel,
      // A derived rest countdown stays live (it is safe — phone-supplied absolute end).
      restEndsAt: mirror?.restEndsAt ?? null,
      restRemainingS: mirror?.restRemainingS ?? null,
      disabled: true,
      reconnecting: true,
      actions: [],
      entryHaptic: 'connection_lost',
    };
  }

  // 2. No session.
  if (!mirror) return { kind: 'idle', actions: [] };

  // 3. Live phase.
  switch (mirror.phase) {
    case 'complete':
      return {
        kind: 'workout_complete',
        titleKey: WATCH_COPY.workoutCompleteTitle,
        actions: ['dismiss'],
        entryHaptic: 'workout_saved',
      };

    case 'paused':
      if (ui.finishConfirm) {
        return {
          kind: 'finish_confirm',
          titleKey: WATCH_COPY.finishPrompt,
          // No / Yes (No first — destructive action is never the default).
          actions: ['finish_no', 'finish_yes'],
        };
      }
      return {
        kind: 'paused',
        titleKey: WATCH_COPY.pausedTitle,
        exerciseName: mirror.exerciseName,
        setLabel: mirror.setLabel,
        actions: ['resume', 'finish'],
        entryHaptic: 'paused',
      };

    case 'active_set': {
      // Rep-adjustment screen (behind "Couldn't Complete"): the athlete reports the
      // actual reps performed via the Crown, then confirms → a normal set completion.
      if (ui.repAdjust) {
        return {
          kind: 'rep_adjust',
          titleKey: WATCH_COPY.repAdjustTitle, // "Actual reps"
          exerciseName: mirror.exerciseName,
          targetReps: mirror.targetReps, // default + the "Target N" reference
          actualReps: ui.repAdjust.actualReps, // live Crown value
          actions: ['confirm_reps', 'cancel_reps'],
        };
      }
      // No session/exercise progress is shown (founder spec §1) — only the next
      // action and the set within the exercise. Exercise Busy appears only on the
      // first set of a newly started exercise (mirrors the phone). Pause is a
      // corner glyph, not a stacked row.
      const actions: WatchActionId[] = ['complete_set', 'couldnt_complete'];
      if (mirror.canMarkBusy) actions.push('exercise_busy');
      actions.push('pause');
      return {
        kind: 'active_set',
        exerciseName: mirror.exerciseName, // the only screen that states it
        setLabel: mirror.setLabel, // "Set 3 of 4"
        targetWeight: mirror.targetWeight,
        targetReps: mirror.targetReps,
        actions,
      };
    }

    case 'rest_inter':
      return {
        kind: 'inter_set_rest',
        // No exercise name — the athlete already knows the exercise (founder spec §1).
        restEndsAt: mirror.restEndsAt,
        restRemainingS: mirror.restRemainingS,
        nextTargetWeight: mirror.targetWeight, // same exercise, next set's load × reps
        nextTargetReps: mirror.targetReps,
        encouragementKey: WATCH_COPY.interEncouragement, // "You can do this."
        setLabel: mirror.setLabel,
        actions: ['ready', 'pause'],
      };

    case 'rest_transition':
      // Brief Exercise Complete interstitial before the transition rest is shown.
      if (mirror.completedExerciseName && !ui.exerciseCompleteAck) {
        return {
          kind: 'exercise_complete',
          completedExerciseName: mirror.completedExerciseName,
          nextExerciseName: mirror.nextExerciseName,
          actions: [],
          entryHaptic: 'exercise_boundary',
        };
      }
      return {
        kind: 'transition_rest',
        restEndsAt: mirror.restEndsAt,
        restRemainingS: mirror.restRemainingS,
        nextExerciseName: mirror.nextExerciseName, // new exercise — name IS shown
        nextTargetWeight: mirror.nextTargetWeight,
        nextTargetReps: mirror.nextTargetReps,
        encouragementKey: WATCH_COPY.transitionEncouragement, // "Let's go."
        actions: ['ready', 'pause'],
      };

    default:
      return { kind: 'idle', actions: [] };
  }
}
