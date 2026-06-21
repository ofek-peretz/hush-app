/**
 * Watch presentation projection — the canonical "what screen to show" logic for
 * the Claude Design watch (ui_kits/watch). Pure; the SwiftUI layer conforms to this.
 */
import {
  projectWatchScreen,
  actionToIntent,
} from '@/platform/watch/watchPresentation';
import {
  screenPresentedEvent,
  hapticEvent,
  finishResolvedEvent,
} from '@/platform/watch/watchTelemetry';
import { WATCH_EVENTS } from '@/platform/events';
import type { SessionMirror } from '@/platform/sessionMirror';
import type { WatchLobby } from '@/platform/watch/protocol';

function mirror(over: Partial<SessionMirror> = {}): SessionMirror {
  return {
    schema: 1, phase: 'active_set', exerciseName: 'Chest-Supported Row', exerciseGroup: 'Back',
    setLabel: 'Set 1 of 3', setNumber: 1, setsInExercise: 3, nextSetsInExercise: 0,
    globalIndex: 0, totalSets: 3, targetWeight: 60, targetReps: 8,
    restEndsAt: null, restRemainingS: null, nextExerciseName: null,
    nextTargetWeight: null, nextTargetReps: null, completedExerciseName: null,
    canMarkBusy: false, loadDeltaKg: 0, nextLoadDeltaKg: 0, liftIndex: 1, liftCount: 6,
    workoutName: 'Upper B', summary: null, swapOptions: [], nextSwapOptions: [], ...over,
  };
}

const LOBBY: WatchLobby = {
  workoutId: 'upB', workoutName: 'Upper B', muscles: 'Back · Biceps · Rear delts',
  lifts: 6, durationLabel: '~48 min', resting: false,
  workouts: [
    { id: 'upB', name: 'Upper B', lifts: 6, muscles: 'Back · Biceps', done: false },
    { id: 'loA', name: 'Lower A', lifts: 5, muscles: 'Quads · Glutes', done: true },
  ],
};

describe('projectWatchScreen — connection + idle + Start', () => {
  it('connected + no session + no lobby → idle', () => {
    expect(projectWatchScreen(null, 'connected').kind).toBe('idle');
  });

  it('connected + no session + lobby → Start (Begin + Choose workout, lifts + duration)', () => {
    const s = projectWatchScreen(null, 'connected', {}, LOBBY);
    expect(s.kind).toBe('start');
    expect(s.workoutName).toBe('Upper B');
    expect(s.lifts).toBe(6);
    expect(s.durationLabel).toBe('~48 min');
    expect(s.workouts).toHaveLength(2);
    expect(s.actions).toEqual(['begin', 'choose_workout']);
  });

  it('Start on a recovery week has no Begin', () => {
    const s = projectWatchScreen(null, 'connected', {}, { ...LOBBY, resting: true });
    expect(s.kind).toBe('start');
    expect(s.disabled).toBe(true);
    expect(s.actions).toEqual(['choose_workout']);
  });

  it('reconnecting → connection_lost over dimmed last-known context, actions disabled', () => {
    const s = projectWatchScreen(mirror({ phase: 'rest_inter', restEndsAt: 'X', restRemainingS: 42 }), 'reconnecting');
    expect(s.kind).toBe('connection_lost');
    expect(s.disabled).toBe(true);
    expect(s.reconnecting).toBe(true);
    expect(s.actions).toEqual([]);
    expect(s.restRemainingS).toBe(42);
    expect(s.entryHaptic).toBe('connection_lost');
  });
});

describe('projectWatchScreen — Active Set', () => {
  it('shows group, name, target, set number, LoadDelta; Edit + Complete + pause', () => {
    const s = projectWatchScreen(mirror({ setLabel: 'Set 2 of 3', setNumber: 2, loadDeltaKg: 2.5 }), 'connected');
    expect(s.kind).toBe('active_set');
    expect(s.exerciseName).toBe('Chest-Supported Row');
    expect(s.exerciseGroup).toBe('Back');
    expect(s.targetWeight).toBe(60);
    expect(s.targetReps).toBe(8);
    expect(s.setNumber).toBe(2);
    expect(s.setsInExercise).toBe(3);
    expect(s.loadDeltaKg).toBe(2.5); // sage ▲ +2.5 kg
    expect(s.actions).toEqual(['edit_result', 'complete_set', 'pause']);
  });

  it('adds the Swap action only when the phone provides alternatives', () => {
    const s = projectWatchScreen(mirror({ swapOptions: [{ id: 'x', name: 'Lat Pulldown' }] }), 'connected');
    expect(s.actions).toEqual(['edit_result', 'complete_set', 'pause', 'swap']);
    expect(s.swapOptions).toHaveLength(1);
  });

  it('carries a downward (clay) load change as a negative delta', () => {
    expect(projectWatchScreen(mirror({ loadDeltaKg: -5 }), 'connected').loadDeltaKg).toBe(-5);
  });
});

describe('projectWatchScreen — Set Confirmation', () => {
  it('shows {weight} × {reps} + "Set n of m logged" with the set-complete haptic', () => {
    const s = projectWatchScreen(mirror({ phase: 'rest_inter' }), 'connected', {
      setConfirm: { weight: 62.5, reps: 8, index: 1, total: 3 },
    });
    expect(s.kind).toBe('set_confirmation');
    expect(s.confirmWeight).toBe(62.5);
    expect(s.confirmReps).toBe(8);
    expect(s.confirmIndex).toBe(1);
    expect(s.confirmTotal).toBe(3);
    expect(s.entryHaptic).toBe('set_logged');
    expect(s.actions).toEqual([]);
  });

  it('connection lost still wins over the interstitial', () => {
    const s = projectWatchScreen(mirror(), 'reconnecting', { setConfirm: { weight: 60, reps: 8, index: 1, total: 3 } });
    expect(s.kind).toBe('connection_lost');
  });
});

describe('projectWatchScreen — rests (ring, +15s, no HR/calories)', () => {
  it('inter-set rest: up-next load×reps, Ready + add_rest + pause', () => {
    const s = projectWatchScreen(mirror({ phase: 'rest_inter', setNumber: 2, restRemainingS: 47 }), 'connected');
    expect(s.kind).toBe('inter_set_rest');
    expect(s.exerciseName).toBe('Chest-Supported Row');
    expect(s.targetWeight).toBe(60);
    expect(s.setNumber).toBe(2);
    expect(s.actions).toEqual(['ready', 'add_rest', 'pause']);
  });

  it('transition rest: new exercise + signed delta; Swap appears with alternatives', () => {
    const s = projectWatchScreen(
      mirror({
        phase: 'rest_transition', nextExerciseName: 'Lat Pulldown', nextSetsInExercise: 3,
        nextTargetWeight: 45, nextTargetReps: 10, nextLoadDeltaKg: 2.5,
        nextSwapOptions: [{ id: 'y', name: 'Pull-Up' }],
      }),
      'connected',
    );
    expect(s.kind).toBe('transition_rest');
    expect(s.nextExerciseName).toBe('Lat Pulldown');
    expect(s.nextSetsInExercise).toBe(3);
    expect(s.nextLoadDeltaKg).toBe(2.5);
    expect(s.actions).toEqual(['ready', 'add_rest', 'pause', 'swap']);
  });
});

describe('projectWatchScreen — Paused', () => {
  it('offers Resume + End workout (End routes straight to Complete) with a settle haptic', () => {
    const s = projectWatchScreen(mirror({ phase: 'paused' }), 'connected');
    expect(s.kind).toBe('paused');
    expect(s.actions).toEqual(['resume', 'end_workout']);
    expect(s.entryHaptic).toBe('paused');
  });
});

describe('projectWatchScreen — Complete', () => {
  it('shows the session name + summary (time / sets / up) with the completion haptic', () => {
    const s = projectWatchScreen(
      mirror({ phase: 'complete', workoutName: 'Upper B', summary: { timeLabel: '48:21', sets: 14, up: 3 } }),
      'connected',
    );
    expect(s.kind).toBe('workout_complete');
    expect(s.workoutName).toBe('Upper B');
    expect(s.summary).toEqual({ timeLabel: '48:21', sets: 14, up: 3 });
    expect(s.actions).toEqual(['dismiss']);
    expect(s.entryHaptic).toBe('workout_saved');
  });
});

describe('actionToIntent', () => {
  it('maps actions to intents, locals to null', () => {
    expect(actionToIntent('begin')).toBe('start_workout');
    expect(actionToIntent('select_workout')).toBe('select_workout');
    expect(actionToIntent('complete_set')).toBe('complete_set');
    expect(actionToIntent('swap_pick')).toBe('swap_exercise');
    expect(actionToIntent('ready')).toBe('end_rest');
    expect(actionToIntent('add_rest')).toBe('add_rest');
    expect(actionToIntent('pause')).toBe('pause');
    expect(actionToIntent('resume')).toBe('resume');
    expect(actionToIntent('end_workout')).toBe('finish_early');
    expect(actionToIntent('choose_workout')).toBeNull();
    expect(actionToIntent('edit_result')).toBeNull();
    expect(actionToIntent('save_result')).toBeNull();
    expect(actionToIntent('swap')).toBeNull(); // opens the local overlay
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
