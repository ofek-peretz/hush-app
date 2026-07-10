/**
 * Milestones (domain/milestones) — the founder's rarity-law catalog (2026-07-10).
 * Proves:
 *  - count marks at 10/25/… (never at 1 — no early candy), attributed to the crossing session;
 *  - tonnage marks only at the HUGE thresholds, attributed to the crossing session;
 *  - clubs fire from a genuinely LOGGED set on the five barbell compounds (several rungs can
 *    land at once; unlisted lifts never club);
 *  - engine "first raise" fires ONCE, only when a COMPOUND's prescription rises between
 *    sessions (isolation raises don't count);
 *  - engine "doubled" fires per compound when the working load reaches 2× its first-session peak;
 *  - newlyEarned returns only the latest session's marks, most-personal first (celebrate [0]);
 *  - nextUp exposes each family's single next mark with live progress; untrained clubs stay dark.
 */
import {
  earnedMilestones,
  newlyEarned,
  nextUp,
  COUNT_THRESHOLDS,
  TONNAGE_THRESHOLDS_KG,
} from '@/domain/milestones';
import type { Session, SetLog } from '@/data/local/models';

const T0 = Date.parse('2026-01-05T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function log(exerciseId: string, weight: number | null, reps = 8, recommended = weight): SetLog {
  return {
    exerciseId,
    setIndex: 0,
    recommendedWeight: recommended,
    recommendedReps: 8,
    actualWeight: weight,
    actualReps: reps,
    edited: false,
    persistedAt: new Date(T0).toISOString(),
  };
}

let seq = 0;
function session(day: number, sets: SetLog[]): Session {
  return {
    id: `s${++seq}`,
    programDayId: 'd',
    startedAt: new Date(T0 + day * DAY).toISOString(),
    state: 'SAVED',
    earlyFinish: false,
    sets,
  };
}

beforeEach(() => {
  seq = 0;
});

describe('count family', () => {
  it('earns 10 workouts on the 10th session — and nothing before', () => {
    const sessions = Array.from({ length: 10 }, (_, i) => session(i * 2, [log('lat_pulldown', 35)]));
    expect(earnedMilestones(sessions.slice(0, 9)).filter((m) => m.family === 'count')).toEqual([]);
    const counts = earnedMilestones(sessions).filter((m) => m.family === 'count');
    expect(counts).toHaveLength(1);
    expect(counts[0].id).toBe('count_10');
    expect(counts[0].sessionId).toBe(sessions[9].id);
  });

  it('is order-agnostic (newest-first input, as db.loadHistory returns)', () => {
    const sessions = Array.from({ length: 10 }, (_, i) => session(i, [log('lat_pulldown', 35)]));
    const reversed = sessions.slice().reverse();
    expect(earnedMilestones(reversed).map((m) => m.id)).toEqual(earnedMilestones(sessions).map((m) => m.id));
  });

  it('ignores unsaved / empty sessions', () => {
    const real = Array.from({ length: 9 }, (_, i) => session(i, [log('lat_pulldown', 35)]));
    const empty = session(20, []);
    expect(earnedMilestones([...real, empty]).filter((m) => m.family === 'count')).toEqual([]);
  });
});

describe('tonnage family', () => {
  it('earns the first tonnage mark on the session the running total crosses 250 t', () => {
    // 50 sessions × 5,000 kg = 250,000 exactly on session 50.
    const sets = Array.from({ length: 5 }, () => log('leg_press', 125, 8)); // 125×8×5 = 5,000
    const sessions = Array.from({ length: 50 }, (_, i) => session(i, [...sets]));
    const tons = earnedMilestones(sessions).filter((m) => m.family === 'tonnage');
    expect(tons).toHaveLength(1);
    expect(tons[0].id).toBe(`tonnage_${TONNAGE_THRESHOLDS_KG[0]}`);
    expect(tons[0].sessionId).toBe(sessions[49].id);
  });

  it('never fires early — one big workout is nowhere near a mark', () => {
    const s = session(0, Array.from({ length: 20 }, () => log('bb_deadlift', 180, 5)));
    expect(earnedMilestones([s]).filter((m) => m.family === 'tonnage')).toEqual([]);
  });
});

describe('club family', () => {
  it('a logged 100 kg squat set earns BOTH the 60 and 100 rungs at once', () => {
    const s = session(0, [log('bb_back_squat', 100, 5)]);
    const clubs = earnedMilestones([s]).filter((m) => m.family === 'club');
    expect(clubs.map((m) => m.id)).toEqual(['club_bb_back_squat_60', 'club_bb_back_squat_100']);
  });

  it('each rung is earned once; the next rung needs a genuinely heavier set', () => {
    const sessions = [
      session(0, [log('bb_bench_press', 60, 8)]),
      session(2, [log('bb_bench_press', 62.5, 8)]),
      session(4, [log('bb_bench_press', 100, 3)]),
    ];
    const clubs = earnedMilestones(sessions).filter((m) => m.family === 'club');
    expect(clubs.map((m) => [m.id, m.sessionId])).toEqual([
      ['club_bb_bench_press_60', 's1'],
      ['club_bb_bench_press_100', 's3'],
    ]);
  });

  it('non-club lifts never club, and a 0-rep set never counts', () => {
    const s = session(0, [log('leg_press', 220, 8), log('bb_deadlift', 140, 0)]);
    expect(earnedMilestones([s]).filter((m) => m.family === 'club')).toEqual([]);
  });
});

describe('engine family', () => {
  it('first raise: fires ONCE, when a compound prescription rises between sessions', () => {
    const sessions = [
      session(0, [log('bb_bench_press', 40, 8, 40)]),
      session(7, [log('bb_bench_press', 42.5, 8, 42.5)]), // the raise
      session(14, [log('bb_bench_press', 45, 8, 45)]), // a later raise — no second mark
    ];
    const raises = earnedMilestones(sessions).filter((m) => m.id === 'engine_first_raise');
    expect(raises).toHaveLength(1);
    expect(raises[0].sessionId).toBe('s2');
  });

  it('an isolation raise never triggers first raise', () => {
    const sessions = [
      session(0, [log('lateral_raise', 7, 12, 7)]),
      session(7, [log('lateral_raise', 8, 12, 8)]),
    ];
    expect(earnedMilestones(sessions).filter((m) => m.id === 'engine_first_raise')).toEqual([]);
  });

  it('doubled: fires per compound at 2× the first-session peak, once', () => {
    const sessions = [
      session(0, [log('bb_back_squat', 50, 8)]),
      session(30, [log('bb_back_squat', 95, 8)]), // not yet
      session(60, [log('bb_back_squat', 100, 8)]), // doubled
      session(90, [log('bb_back_squat', 110, 8)]), // no re-fire
    ];
    const doubled = earnedMilestones(sessions).filter((m) => m.id === 'engine_doubled_bb_back_squat');
    expect(doubled).toHaveLength(1);
    expect(doubled[0].sessionId).toBe('s3');
  });
});

describe('newlyEarned — the WellDone crossing read', () => {
  it('returns only the latest session marks, most personal first', () => {
    // 9 prior sessions, then a 10th that BOTH crosses count_10 and logs a 100 kg squat.
    // Prescriptions held flat so the engine family stays out of this test's frame.
    const prior = Array.from({ length: 9 }, (_, i) => session(i, [log('bb_back_squat', 80, 8, 80)]));
    const last = session(20, [log('bb_back_squat', 100, 5, 80)]);
    const marks = newlyEarned([...prior, last]);
    expect(marks.map((m) => m.id)).toEqual(['club_bb_back_squat_100', 'count_10']);
    expect(marks.every((m) => m.sessionId === last.id)).toBe(true);
  });

  it('returns [] on a session that crossed nothing (the common case — rarity law)', () => {
    const sessions = [session(0, [log('bb_back_squat', 80, 8, 80)]), session(2, [log('bb_back_squat', 82.5, 8, 80)])];
    expect(newlyEarned(sessions)).toEqual([]);
  });
});

describe('nextUp — the gallery silhouettes', () => {
  it('exposes the next count + tonnage marks with live progress', () => {
    const sessions = Array.from({ length: 12 }, (_, i) => session(i, [log('bb_back_squat', 80, 8)]));
    const next = nextUp(sessions);
    const count = next.find((n) => n.milestone.family === 'count')!;
    expect(count.milestone.value).toBe(25);
    expect(count.current).toBe(12);
    const ton = next.find((n) => n.milestone.family === 'tonnage')!;
    expect(ton.milestone.value).toBe(TONNAGE_THRESHOLDS_KG[0]);
    expect(ton.current).toBe(12 * 80 * 8);
  });

  it('club silhouette = nearest rung of a lift actually trained; untrained lifts stay dark', () => {
    const sessions = [session(0, [log('bb_bench_press', 90, 5)])];
    const next = nextUp(sessions);
    const club = next.find((n) => n.milestone.family === 'club')!;
    expect(club.milestone.id).toBe('club_bb_bench_press_100');
    expect(club.current).toBe(90);
    expect(next.filter((n) => n.milestone.family === 'club')).toHaveLength(1); // only ONE silhouette
  });

  it('no clubs at all before any club lift is trained', () => {
    const sessions = [session(0, [log('lat_pulldown', 40)])];
    expect(nextUp(sessions).find((n) => n.milestone.family === 'club')).toBeUndefined();
  });
});

describe('catalog sanity', () => {
  it('count ladder starts at 10 — the first workout has its own moment already', () => {
    expect(COUNT_THRESHOLDS[0]).toBe(10);
  });
  it('tonnage ladder starts at 250 t — months away by construction', () => {
    expect(TONNAGE_THRESHOLDS_KG[0]).toBe(250_000);
  });
});
