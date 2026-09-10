/**
 * Watch haptic taxonomy — the five major progress events must be mutually
 * distinct, and every event maps to its pattern. Pure data; the native layer
 * conforms to this.
 */
// @ts-nocheck

// 

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

describe('rest countdown ("The Approach")', () => {
  const cd = HAPTICS.rest_countdown;

  it('is a non-major, wrist-down pattern (does not inflate the five majors)', () => {
    expect(cd.major).toBe(false);
    expect(cd.firesWristDown).toBe(true);
    expect(MAJORS).toHaveLength(5); // unchanged
  });

  it('begins at 7s with a single soft whisper, then a 3-2-1 cadence', () => {
    expect(cd.beats).toHaveLength(4);
    expect(cd.beats[0].intensity).toBe('soft'); // T-7 whisper
    // 7s → 3s is a 4s gap; then 1s between each of 3-2-1.
    expect(cd.beats[1].gapBeforeMs).toBe(4000);
    expect(cd.beats[2].gapBeforeMs).toBe(1000);
    expect(cd.beats[3].gapBeforeMs).toBe(1000);
  });

  it('escalates toward zero (never softer than it started) and ends firm', () => {
    const rank: Record<string, number> = { low: 0, soft: 1, light: 1, gentle_firm: 2, warm: 3 };
    const levels = cd.beats.map((b) => rank[b.intensity]);
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    expect(cd.beats[cd.beats.length - 1].intensity).toBe('warm'); // the "one"
  });

  it('maps from the rest_approaching event', () => {
    expect(hapticForEvent('rest_approaching').id).toBe('rest_countdown');
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
