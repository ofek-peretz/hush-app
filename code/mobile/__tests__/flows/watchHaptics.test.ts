/**
 * Watch haptic taxonomy — the five major progress events must be mutually
 * distinct, and every event maps to its pattern. Pure data; the native layer
 * conforms to this.
 */
import {
  HAPTICS,
  hapticForEvent,
  type HapticPattern,
  type WatchHapticEvent,
} from '@/platform/watch/watchHaptics';

const MAJORS = Object.values(HAPTICS).filter((p) => p.major);

describe('haptic taxonomy', () => {
  it('defines exactly the five required major progress events', () => {
    expect(MAJORS.map((p) => p.id).sort()).toEqual(
      ['connection_lost', 'exercise_complete', 'rest_complete', 'set_complete', 'workout_complete'],
    );
  });

  it('no two majors feel the same (distinct beat signatures)', () => {
    const sig = (p: HapticPattern) => JSON.stringify(p.beats);
    const sigs = MAJORS.map(sig);
    expect(new Set(sigs).size).toBe(MAJORS.length);
  });

  it('the Workout Complete signature is unique: a pause + a sustained beat', () => {
    const wc = HAPTICS.workout_complete;
    expect(wc.beats.some((b) => b.sustained)).toBe(true);
    expect(wc.beats.some((b) => b.gapBeforeMs >= 400)).toBe(true); // the internal pause
    // No other major both pauses and sustains.
    const others = MAJORS.filter((p) => p.id !== 'workout_complete');
    expect(others.some((p) => p.beats.some((b) => b.sustained) && p.beats.some((b) => b.gapBeforeMs >= 400))).toBe(false);
  });

  it('all majors are felt with the wrist down (gym-critical)', () => {
    expect(MAJORS.every((p) => p.firesWristDown)).toBe(true);
  });
});

describe('hapticForEvent mapping', () => {
  const cases: [WatchHapticEvent, string][] = [
    ['set_logged', 'set_complete'],
    ['rest_elapsed', 'rest_complete'],
    ['exercise_boundary', 'exercise_complete'],
    ['workout_saved', 'workout_complete'],
    ['connection_lost', 'connection_lost'],
    ['ready_tapped', 'action_ack'],
    ['receipt_earned', 'receipt'],
    ['paused', 'settle'],
    ['resumed', 'affirm'],
    ['reconnected', 'affirm'],
    ['exercise_busy_applied', 'action_ack'],
  ];
  it.each(cases)('%s → %s', (event, pattern) => {
    expect(hapticForEvent(event).id).toBe(pattern);
  });
});
