/**
 * Watch presentation projection — the canonical "what screen to show" logic for
 * every approved state. Pure; the SwiftUI layer conforms to this.
 */
import {
  projectWatchScreen,
  actionToIntent,
  WATCH_COPY,
} from '@/platform/watch/watchPresentation';
import {
  screenPresentedEvent,
  hapticEvent,
  finishResolvedEvent,
} from '@/platform/watch/watchTelemetry';
import { WATCH_EVENTS } from '@/platform/events';
import type { SessionMirror } from '@/platform/sessionMirror';

function mirror(over: Partial<SessionMirror> = {}): SessionMirror {
  return {
    schema: 1, phase: 'active_set', exerciseName: 'Bench Press', setLabel: 'Set 1 of 3',
    globalIndex: 0, totalSets: 3, targetWeight: 60, targetReps: 5,
    restEndsAt: null, restRemainingS: null, nextExerciseName: null,
    nextTargetWeight: null, nextTargetReps: null, completedExerciseName: null,
    canMarkBusy: false, ...over,
  };
}

describe('projectWatchScreen — connection + idle', () => {
  it('connected + no session → idle', () => {
    expect(projectWatchScreen(null, 'connected').kind).toBe('idle');
  });

  it('reconnecting → connection_lost over dimmed last-known context, actions disabled', () => {
    const s = projectWatchScreen(mirror({ phase: 'rest_inter', restEndsAt: 'X', restRemainingS: 42 }), 'reconnecting');
    expect(s.kind).toBe('connection_lost');
    expect(s.disabled).toBe(true);
    expect(s.reconnecting).toBe(true);
    expect(s.actions).toEqual([]);
    expect(s.restRemainingS).toBe(42); // derived countdown stays visible
    expect(s.entryHaptic).toBe('connection_lost');
    expect(s.titleKey).toBe(WATCH_COPY.reconnecting);
  });

  it('reconnecting wins even over a complete mirror', () => {
    expect(projectWatchScreen(mirror({ phase: 'complete' }), 'reconnecting').kind).toBe('connection_lost');
  });
});

describe('projectWatchScreen — Active Set', () => {
  it('shows exercise, target, set label; Complete Set + Couldn\'t Complete; NO progress', () => {
    const s = projectWatchScreen(mirror({ setLabel: 'Set 3 of 4' }), 'connected');
    expect(s.kind).toBe('active_set');
    expect(s.exerciseName).toBe('Bench Press');
    expect(s.targetWeight).toBe(60);
    expect(s.setLabel).toBe('Set 3 of 4');
    expect(s).not.toHaveProperty('sessionProgress'); // exercise/session progress removed (§1)
    expect(s.actions).toEqual(['complete_set', 'couldnt_complete', 'pause']);
  });

  it('adds Exercise Busy only when offerable (first set of a new exercise)', () => {
    const s = projectWatchScreen(mirror({ canMarkBusy: true }), 'connected');
    expect(s.actions).toEqual(['complete_set', 'couldnt_complete', 'exercise_busy', 'pause']);
  });

  it('opens the rep-adjustment screen (Couldn\'t Complete) with target default', () => {
    const s = projectWatchScreen(mirror({ targetReps: 8 }), 'connected', { repAdjust: { actualReps: 6 } });
    expect(s.kind).toBe('rep_adjust');
    expect(s.targetReps).toBe(8); // default + reference
    expect(s.actualReps).toBe(6); // live Crown value
    expect(s.actions).toEqual(['confirm_reps', 'cancel_reps']);
  });
});

describe('projectWatchScreen — rests', () => {
  it('inter-set rest: NO exercise name, encouragement, set progress, Ready', () => {
    const s = projectWatchScreen(mirror({ phase: 'rest_inter', setLabel: 'Set 3 of 4', restRemainingS: 90 }), 'connected');
    expect(s.kind).toBe('inter_set_rest');
    expect(s.exerciseName).toBeUndefined(); // founder spec §1 — do not repeat it
    expect(s.encouragementKey).toBe(WATCH_COPY.interEncouragement);
    expect(s.setLabel).toBe('Set 3 of 4');
    expect(s.actions).toEqual(['ready', 'pause']);
  });

  it('transition rest: shows the NEW exercise name + target, forward encouragement', () => {
    const s = projectWatchScreen(
      mirror({ phase: 'rest_transition', completedExerciseName: 'Bench Press', nextExerciseName: 'Incline Press', nextTargetWeight: 40, nextTargetReps: 8 }),
      'connected',
      { exerciseCompleteAck: true },
    );
    expect(s.kind).toBe('transition_rest');
    expect(s.nextExerciseName).toBe('Incline Press');
    expect(s.nextTargetWeight).toBe(40);
    expect(s.encouragementKey).toBe(WATCH_COPY.transitionEncouragement);
    expect(s.actions).toEqual(['ready', 'pause']);
  });
});

describe('projectWatchScreen — Exercise Complete interstitial', () => {
  it('shows the interstitial before the transition rest, with its own haptic', () => {
    const s = projectWatchScreen(
      mirror({ phase: 'rest_transition', completedExerciseName: 'Bench Press', nextExerciseName: 'Incline Press' }),
      'connected',
      { exerciseCompleteAck: false },
    );
    expect(s.kind).toBe('exercise_complete');
    expect(s.completedExerciseName).toBe('Bench Press');
    expect(s.nextExerciseName).toBe('Incline Press');
    expect(s.entryHaptic).toBe('exercise_boundary');
    expect(s.actions).toEqual([]);
  });
});

describe('projectWatchScreen — Paused + Finish confirmation', () => {
  it('paused offers Resume + Finish with a settle haptic', () => {
    const s = projectWatchScreen(mirror({ phase: 'paused' }), 'connected');
    expect(s.kind).toBe('paused');
    expect(s.titleKey).toBe(WATCH_COPY.pausedTitle);
    expect(s.actions).toEqual(['resume', 'finish']);
    expect(s.entryHaptic).toBe('paused');
  });

  it('finish confirmation: explicit No / Yes (No first, never the default)', () => {
    const s = projectWatchScreen(mirror({ phase: 'paused' }), 'connected', { finishConfirm: true });
    expect(s.kind).toBe('finish_confirm');
    expect(s.titleKey).toBe(WATCH_COPY.finishPrompt);
    expect(s.actions).toEqual(['finish_no', 'finish_yes']);
  });
});

describe('projectWatchScreen — Workout Complete', () => {
  it('shows the locked "Well Done." with the signature completion haptic', () => {
    const s = projectWatchScreen(mirror({ phase: 'complete' }), 'connected');
    expect(s.kind).toBe('workout_complete');
    expect(s.titleKey).toBe(WATCH_COPY.workoutCompleteTitle);
    expect(s.actions).toEqual(['dismiss']);
    expect(s.entryHaptic).toBe('workout_saved');
  });
});

describe('actionToIntent', () => {
  it('maps actions to intents, locals to null', () => {
    expect(actionToIntent('complete_set')).toBe('complete_set');
    expect(actionToIntent('confirm_reps')).toBe('complete_set'); // adjusted reps = a completion
    expect(actionToIntent('ready')).toBe('end_rest');
    expect(actionToIntent('exercise_busy')).toBe('exercise_busy');
    expect(actionToIntent('resume')).toBe('resume');
    expect(actionToIntent('finish_yes')).toBe('finish_early');
    expect(actionToIntent('couldnt_complete')).toBeNull(); // opens local rep-adjust
    expect(actionToIntent('cancel_reps')).toBeNull();
    expect(actionToIntent('finish')).toBeNull(); // opens local confirm
    expect(actionToIntent('finish_no')).toBeNull();
    expect(actionToIntent('dismiss')).toBeNull();
  });
});

describe('watch telemetry builders (dataset capture)', () => {
  it('builds a screen_presented record', () => {
    const s = projectWatchScreen(mirror(), 'connected');
    expect(screenPresentedEvent(s)).toEqual({
      type: WATCH_EVENTS.screenPresented,
      data: { kind: 'active_set', disabled: false, reconnecting: false },
    });
  });

  it('builds a haptic record naming event + resolved pattern', () => {
    expect(hapticEvent('workout_saved')).toEqual({
      type: WATCH_EVENTS.haptic,
      data: { event: 'workout_saved', pattern: 'workout_complete' },
    });
  });

  it('builds a finish_resolved record', () => {
    expect(finishResolvedEvent('yes')).toEqual({
      type: WATCH_EVENTS.finishResolved,
      data: { answer: 'yes' },
    });
  });
});
