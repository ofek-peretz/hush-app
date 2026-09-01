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
// @ts-nocheck

// 

import {
  earnedMilestones,
  newlyEarned,
  nextUp,
  clubLadders,
  COUNT_THRESHOLDS,
  TONNAGE_THRESHOLDS_KG,
  WEEKS_THRESHOLDS,
  type MilestoneProfile,
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

  it('a PARTIAL session is not a workout — it never ticks the count (founder 2026-07-11)', () => {
    // 9 whole workouts + 3 partials: still 9. The count family asks for WHOLE workouts.
    const whole = Array.from({ length: 9 }, (_, i) => session(i, [log('lat_pulldown', 35)]));
    const partials = Array.from({ length: 3 }, (_, i) => ({
      ...session(10 + i, [log('lat_pulldown', 35)]),
      trained: false,
    }));
    expect(earnedMilestones([...whole, ...partials]).filter((m) => m.family === 'count')).toEqual([]);
    // The 10th WHOLE workout earns it — and it is the one credited, not a later partial.
    const tenth = session(20, [log('lat_pulldown', 35)]);
    const counts = earnedMilestones([...whole, ...partials, tenth]).filter((m) => m.family === 'count');
    expect(counts).toHaveLength(1);
    expect(counts[0].sessionId).toBe(tenth.id);
  });

  it('but a partial session STILL breaks every other mark — the work was real', () => {
    // A short session in which the athlete genuinely lifted a club load keeps the club mark.
    const partial = { ...session(1, [log('bb_back_squat', 100)]), trained: false };
    const clubs = earnedMilestones([partial]).filter((m) => m.family === 'club');
    expect(clubs.map((m) => m.id)).toContain('club_bb_back_squat_100');
    expect(earnedMilestones([partial]).filter((m) => m.family === 'count')).toEqual([]);
  });

  it('nextUp counts only whole workouts toward the next count mark', () => {
    const whole = Array.from({ length: 4 }, (_, i) => session(i, [log('lat_pulldown', 35)]));
    const partial = { ...session(9, [log('lat_pulldown', 35)]), trained: false };
    const next = nextUp([...whole, partial]).find((n) => n.milestone.family === 'count')!;
    expect(next.current).toBe(4); // the partial is not counted
    expect(next.target).toBe(10);
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
  // No profile passed ⇒ the median man (75 kg, intermediate): squat starts at 50 kg, so his
  // ladder is 60 · 80 · 100 · 120 · 140.
  it('a logged 100 kg squat set earns every rung up to it at once', () => {
    const s = session(0, [log('bb_back_squat', 100, 5)]);
    const clubs = earnedMilestones([s]).filter((m) => m.family === 'club');
    expect(clubs.map((m) => m.id)).toEqual([
      'club_bb_back_squat_60',
      'club_bb_back_squat_80',
      'club_bb_back_squat_100',
    ]);
  });

  it('each rung is earned once; the next rung needs a genuinely heavier set', () => {
    const sessions = [
      session(0, [log('bb_bench_press', 60, 8)]),
      session(2, [log('bb_bench_press', 62.5, 8)]), // heavier, but no new rung crossed
      session(4, [log('bb_bench_press', 100, 3)]),
    ];
    const clubs = earnedMilestones(sessions).filter((m) => m.family === 'club');
    expect(clubs.map((m) => [m.id, m.sessionId])).toEqual([
      ['club_bb_bench_press_50', 's1'],
      ['club_bb_bench_press_60', 's1'],
      ['club_bb_bench_press_80', 's3'],
      ['club_bb_bench_press_100', 's3'],
    ]);
  });

  it('non-club lifts never club, and a 0-rep set never counts', () => {
    const s = session(0, [log('leg_press', 220, 8), log('bb_deadlift', 140, 0)]);
    expect(earnedMilestones([s]).filter((m) => m.family === 'club')).toEqual([]);
  });
});

/**
 * THE PERSONAL LADDER (founder 2026-07-13) — "adapt the loads that open a milestone to what we know
 * about them from onboarding". The rungs are multiples of the load Hush itself started the athlete
 * at, snapped to round plates; the LIFTS that carry clubs lean lower-body for women.
 */
describe('club ladders are cut from the onboarding answers', () => {
  const woman: MilestoneProfile = { sex: 'female', weightKg: 60 };
  const man: MilestoneProfile = { sex: 'male', weightKg: 82 };

  it("a woman's clubs are four-fifths lower body, and a man's include the hip thrust", () => {
    expect(Object.keys(clubLadders(woman)).sort()).toEqual(
      ['bb_back_squat', 'bb_bench_press', 'bb_deadlift', 'bb_rdl', 'hip_thrust'].sort(),
    );
    expect(Object.keys(clubLadders(man))).toContain('hip_thrust');
    expect(Object.keys(clubLadders(man))).toContain('bb_overhead_press'); // …and keeps his classics
  });

  it('every rung is a round, sayable load, strictly rising, above where she started', () => {
    for (const rungs of Object.values(clubLadders(woman))) {
      expect(rungs.length).toBeGreaterThanOrEqual(3);
      for (const r of rungs) expect(r % 5).toBe(0);
      for (let i = 1; i < rungs.length; i += 1) expect(rungs[i]).toBeGreaterThan(rungs[i - 1]);
    }
  });

  it('the beginner woman is given reachable marks where the old fixed table gave her none', () => {
    // The old ladder opened at bench 60 / squat 60 for everyone. Hers now opens far below that —
    // and her first squat club is a real step up from the ~22 kg Hush starts her at.
    const l = clubLadders(woman);
    expect(l.bb_bench_press[0]).toBeLessThanOrEqual(40);
    expect(l.bb_back_squat[0]).toBeGreaterThan(22);
    expect(l.bb_back_squat[0]).toBeLessThanOrEqual(40);
  });

  it('the same 100 kg squat is a mark for one athlete and further along the ladder for another', () => {
    const s = [session(0, [log('bb_back_squat', 100, 3)])];
    const hers = earnedMilestones(s, woman).filter((m) => m.family === 'club').length;
    const his = earnedMilestones(s, man).filter((m) => m.family === 'club').length;
    expect(hers).toBeGreaterThan(his); // she has crossed more of her ladder with the same bar
  });

  it('the ladder is anchored on the weight Hush MET her at — editing weight never takes a mark back', () => {
    const s = [session(0, [log('bb_back_squat', 60, 5)])];
    const earned = earnedMilestones(s, woman).map((m) => m.id);
    // She gains 8 kg of bodyweight. The anchor is startWeightKg, so the rungs do not move.
    const heavier: MilestoneProfile = { ...woman, weightKg: 68, startWeightKg: 60 };
    expect(earnedMilestones(s, heavier).map((m) => m.id)).toEqual(earned);
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

describe('weeks — showing up, counted, never a streak (2026-08-24)', () => {
  const anyLift = () => [log('lat_pulldown', 40), log('lat_pulldown', 40), log('lat_pulldown', 40)];

  it('four distinct training weeks earn weeks_4, attributed to the crossing session', () => {
    const sessions = [0, 7, 14, 21].map((d) => session(d, anyLift()));
    const weeks = earnedMilestones(sessions).filter((m) => m.family === 'weeks');
    expect(weeks.map((m) => m.id)).toEqual(['weeks_4']);
    expect(weeks[0].sessionId).toBe(sessions[3].id);
  });

  it('two workouts in one week claim the week ONCE — a week is a week, not a volume knob', () => {
    const sessions = [0, 2, 7, 14].map((d) => session(d, anyLift())); // 3 distinct weeks
    expect(earnedMilestones(sessions).filter((m) => m.family === 'weeks')).toHaveLength(0);
  });

  it('a gap costs nothing already earned — the count only grows (no chain, no reset)', () => {
    const sessions = [0, 7, 14, 21, 70].map((d) => session(d, anyLift())); // 7-week hole after weeks_4
    const weeks = earnedMilestones(sessions).filter((m) => m.family === 'weeks');
    expect(weeks.map((m) => m.id)).toEqual(['weeks_4']); // still earned, nothing taken back
    const next = nextUp(sessions).find((n) => n.milestone.family === 'weeks')!;
    expect(next.milestone.id).toBe('weeks_12');
    expect(next.current).toBe(5); // …and the hole simply did not count
  });

  it('WEEKS_THRESHOLDS starts at 4 — a month of showing up, not day-one candy', () => {
    expect(WEEKS_THRESHOLDS[0]).toBe(4);
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
