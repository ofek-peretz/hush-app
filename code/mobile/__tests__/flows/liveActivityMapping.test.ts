/**
 * Live Activity ContentState projection (liveActivityStateFromMirror).
 *
 * Locks the rules the ActivityKit widget renders: during rest the absolute
 * restEndsAtMs is carried (drift-proof countdown); during an active set there is
 * no countdown. The widget is a read-only SUBSET of the canonical SessionMirror.
 */
import { liveActivityStateFromMirror } from '@/platform/liveActivity';
import { MIRROR_SCHEMA_VERSION, type SessionMirror } from '@/platform/sessionMirror';

function mirror(over: Partial<SessionMirror>): SessionMirror {
  return {
    schema: MIRROR_SCHEMA_VERSION,
    phase: 'active_set',
    exerciseName: 'Back Squat',
    setLabel: 'Set 2 of 4',
    globalIndex: 1,
    totalSets: 12,
    targetWeight: 100,
    targetReps: 5,
    restEndsAt: null,
    restRemainingS: null,
    nextExerciseName: null,
    nextTargetWeight: null,
    nextTargetReps: null,
    completedExerciseName: null,
    canMarkBusy: false,
    ...over,
  };
}

describe('liveActivityStateFromMirror', () => {
  it('active set: no countdown, exercise + set label carried', () => {
    const s = liveActivityStateFromMirror(mirror({ phase: 'active_set' }));
    expect(s).toEqual({
      exerciseName: 'Back Squat',
      setLabel: 'Set 2 of 4',
      restEndsAtMs: null,
      isResting: false,
    });
  });

  it('inter-set rest: carries the absolute rest-end instant', () => {
    const iso = '2026-06-16T10:00:00.000Z';
    const s = liveActivityStateFromMirror(mirror({ phase: 'rest_inter', restEndsAt: iso }));
    expect(s.isResting).toBe(true);
    expect(s.restEndsAtMs).toBe(Date.parse(iso));
  });

  it('transition rest is also resting', () => {
    const iso = '2026-06-16T10:01:00.000Z';
    const s = liveActivityStateFromMirror(mirror({ phase: 'rest_transition', restEndsAt: iso }));
    expect(s.isResting).toBe(true);
    expect(s.restEndsAtMs).toBe(Date.parse(iso));
  });

  it('resting with no end instant → null restEndsAtMs (no bogus countdown)', () => {
    const s = liveActivityStateFromMirror(mirror({ phase: 'rest_inter', restEndsAt: null }));
    expect(s.isResting).toBe(true);
    expect(s.restEndsAtMs).toBeNull();
  });
});
