/**
 * The coach track's pure half — `domain/coachTrack` (2026-09-17, docs/architecture/COACH_TRACK_V1.md).
 * The wire to the edge of every bound, the upload's allow-list, the landing (law 2), the roster math.
 */

import {
  COACH_WIRE,
  adherence,
  dayForSession,
  diffWeeks,
  flags,
  landCoachUpdate,
  needsAttention,
  sessionToUpload,
  sortRoster,
  validateEnvelope,
  validateSessionUpload,
  validateWeekWire,
  weekIsLockedToCoach,
  weekToWire,
  wireToProgram,
  type CoachWeekWire,
  type RosterAthlete,
  type SessionUpload,
  type WeekEnvelope,
} from '@/domain/coachTrack';
import { exerciseById } from '@/data/exercises';
import { epley } from '@/engine/loadMath';
import type { Program, Session, SetLog } from '@/data/local/models';

const week = (over: Partial<CoachWeekWire> = {}): CoachWeekWire => ({
  v: 1,
  title: 'Dana’s block',
  days: [
    {
      name: 'Upper',
      lifts: [
        { ex: 'bb_bench_press', sets: 4, band: [6, 8], note: 'pause the first rep' },
        { ex: 'bb_row', sets: 3, band: [8, 10], pairNext: true },
        { ex: 'db_curl', sets: 3, band: [10, 12] },
      ],
    },
    { name: 'Lower', lifts: [{ ex: 'bb_back_squat', sets: 5, band: [3, 5] }, { ex: 'leg_extension', sets: 3, band: [12, 15] }] },
  ],
  ...over,
});

const env = (version = 1, w: CoachWeekWire = week()): WeekEnvelope => ({
  version,
  sentAt: '2026-09-17T08:00:00.000Z',
  coachName: 'Dana',
  week: w,
});

describe('the catalogue ids this file leans on exist', () => {
  it.each(['bb_bench_press', 'bb_row', 'db_curl', 'bb_back_squat', 'leg_extension', 'incline_db_press'])('%s', (id) => {
    expect(exerciseById(id)).toBeTruthy();
  });
});

describe('validateWeekWire — rebuilt field by field, refused whole', () => {
  it('accepts a legal week and copies only the contract’s fields', () => {
    const raw = { ...week(), extra: 'nope', days: week().days.map((d) => ({ ...d, secret: 1, lifts: d.lifts.map((l) => ({ ...l, load: 100 })) })) };
    const v = validateWeekWire(raw);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value).toEqual(week());
    expect(JSON.stringify(v.value)).not.toMatch(/extra|secret|load/);
  });

  const bad: Array<[string, (w: any) => void, string]> = [
    ['v', (w) => { w.v = 2; }, 'v'],
    ['title too long', (w) => { w.title = 'x'.repeat(61); }, 'title'],
    ['no days', (w) => { w.days = []; }, 'days'],
    ['eight days', (w) => { w.days = Array.from({ length: 8 }, () => w.days[0]); }, 'days'],
    ['day name 41', (w) => { w.days[0].name = 'x'.repeat(41); }, 'days[0].name'],
    ['blank day name', (w) => { w.days[0].name = '  '; }, 'days[0].name'],
    ['no lifts', (w) => { w.days[0].lifts = []; }, 'days[0].lifts'],
    ['fifteen lifts', (w) => { w.days[0].lifts = Array.from({ length: 15 }, () => w.days[0].lifts[0]); }, 'days[0].lifts'],
    ['ex pattern', (w) => { w.days[0].lifts[0].ex = 'Bench Press'; }, 'days[0].lifts[0].ex'],
    ['sets 0', (w) => { w.days[0].lifts[0].sets = 0; }, 'days[0].lifts[0].sets'],
    ['sets 11', (w) => { w.days[0].lifts[0].sets = 11; }, 'days[0].lifts[0].sets'],
    ['sets float', (w) => { w.days[0].lifts[0].sets = 3.5; }, 'days[0].lifts[0].sets'],
    ['band lo>hi', (w) => { w.days[0].lifts[0].band = [9, 8]; }, 'days[0].lifts[0].band'],
    ['band 0', (w) => { w.days[0].lifts[0].band = [0, 8]; }, 'days[0].lifts[0].band'],
    ['band 51', (w) => { w.days[0].lifts[0].band = [8, 51]; }, 'days[0].lifts[0].band'],
    ['note 141 — law 7', (w) => { w.days[0].lifts[0].note = 'x'.repeat(141); }, 'days[0].lifts[0].note'],
    ['pairNext string', (w) => { w.days[0].lifts[0].pairNext = 'yes'; }, 'days[0].lifts[0].pairNext'],
  ];
  it.each(bad)('refuses: %s', (_n, mutate, reason) => {
    const w = JSON.parse(JSON.stringify(week()));
    mutate(w);
    expect(validateWeekWire(w)).toEqual({ ok: false, reason });
  });

  it('the edges themselves are legal: 7 days, 14 lifts, sets 1 and 10, band 1–50, a 140-char note', () => {
    const lift = { ex: 'bb_row', sets: 10, band: [1, 50] as [number, number], note: 'x'.repeat(140) };
    const w: CoachWeekWire = { v: 1, title: 'x'.repeat(60), days: Array.from({ length: 7 }, () => ({ name: 'x'.repeat(40), lifts: Array.from({ length: 14 }, () => lift) })) };
    expect(validateWeekWire(w).ok).toBe(true);
    expect(validateWeekWire({ ...w, days: [{ name: 'A', lifts: [{ ...lift, sets: 1 }] }] }).ok).toBe(true);
  });

  it('the envelope needs a version ≥ 1 and a real instant', () => {
    expect(validateEnvelope(env(1)).ok).toBe(true);
    expect(validateEnvelope({ ...env(1), version: 0 }).ok).toBe(false);
    expect(validateEnvelope({ ...env(1), sentAt: 'yesterday' }).ok).toBe(false);
    expect(validateEnvelope({ ...env(1), week: { v: 1, days: [] } }).ok).toBe(false);
  });
});

describe('wireToProgram / weekToWire', () => {
  it('builds seats the way the import does, stamped `coach`, carrying band, note and pair', () => {
    const w = week();
    w.days[0].lifts[2].sets = 2; // the partner disagrees about its set count
    const { program, dropped } = wireToProgram(env(4, w));
    expect(dropped).toEqual([]);
    expect(program.authored).toBe('coach');
    expect(program.coachVersion).toBe(4);
    expect(program.coachName).toBe('Dana');
    expect(program.title).toBe('Dana’s block');
    expect(program.frequency).toBe(2);
    const [upper] = program.days;
    expect(upper.slots[0]).toMatchObject({
      exerciseId: 'bb_bench_press',
      capability: exerciseById('bb_bench_press')!.capability,
      setCount: 4,
      repBand: [6, 8],
      coachNote: 'pause the first rep',
      supplemental: false,
    });
    // the pair: adjacent, partner takes the first lift's set count (planBuilder.togglePair's rule)
    expect(upper.slots[1].pairedWithNext).toBe(true);
    expect(upper.slots[2].setCount).toBe(3);
    expect(upper.muscleGroups.length).toBeGreaterThan(0);
  });

  it('drops and reports an id this build does not know — never guesses — and dissolves its pair', () => {
    const w = week();
    w.days[0].lifts[1] = { ex: 'bb_row', sets: 3, band: [8, 10], pairNext: true };
    w.days[0].lifts[2] = { ex: 'future_lift_9000', sets: 2, band: [10, 12] };
    w.days.push({ name: 'Ghost', lifts: [{ ex: 'future_lift_9000', sets: 3, band: [5, 5] }] });
    const { program, dropped } = wireToProgram(env(1, w));
    expect(dropped).toEqual(['future_lift_9000']);
    expect(program.days.map((d) => d.name)).toEqual(['Upper', 'Lower']); // a day with nothing is not a day
    expect(program.days[0].slots.some((s) => s.pairedWithNext)).toBe(false);
  });

  it('a pair never chains', () => {
    const w = week();
    w.days[0].lifts = w.days[0].lifts.map((l) => ({ ...l, pairNext: true }));
    const { program } = wireToProgram(env(1, w));
    expect(program.days[0].slots.map((s) => !!s.pairedWithNext)).toEqual([true, false, false]);
  });

  it('the catalogue is injectable', () => {
    const { program, dropped } = wireToProgram(env(1), (id) => (id === 'bb_row' ? exerciseById(id) : undefined));
    expect(program.days.map((d) => d.slots.map((s) => s.exerciseId))).toEqual([['bb_row']]);
    expect(dropped).toEqual(['bb_bench_press', 'db_curl', 'bb_back_squat', 'leg_extension']);
  });

  it('round-trips: a coach week to the wire and back is the same week', () => {
    const { program } = wireToProgram(env(2));
    const again = weekToWire(program);
    expect(validateWeekWire(again).ok).toBe(true);
    expect(again).toEqual(week());
  });

  it('weekToWire skips rest and empty days, defaults a missing band, clamps to the wire', () => {
    const p: Program = {
      id: 'x',
      frequency: 2,
      days: [
        { id: 'a', name: 'A', muscleGroups: [], isRest: false, slots: [{ capability: exerciseById('bb_row')!.capability, exerciseId: 'bb_row', setCount: 14 }] },
        { id: 'r', name: 'Rest', muscleGroups: [], isRest: true, slots: [] },
        { id: 'e', name: 'Empty', muscleGroups: [], isRest: false, slots: [] },
      ],
    };
    const w = weekToWire(p);
    expect(w.days).toHaveLength(1);
    expect(w.days[0].lifts[0].sets).toBe(10);
    expect(w.days[0].lifts[0].band).toEqual([8, 12]);
    expect(validateWeekWire(w).ok).toBe(true);
  });
});

/* ── the upload ─────────────────────────────────────────────────────────────────────────────── */

const T0 = Date.parse('2026-09-15T17:00:00.000Z');
const set = (exerciseId: string, i: number, w: number | null, r: number, over: Partial<SetLog> = {}): SetLog => ({
  exerciseId,
  setIndex: i,
  recommendedWeight: w,
  recommendedReps: r,
  actualWeight: w,
  actualReps: r,
  edited: false,
  persistedAt: new Date(T0 + (i + 1) * 180_000).toISOString(),
  ...over,
});

function coachProgram(): Program {
  return wireToProgram(env(7)).program;
}

function session(over: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    programDayId: 'coach_0',
    programDayName: 'Upper',
    startedAt: new Date(T0).toISOString(),
    state: 'SAVED',
    earlyFinish: false,
    sets: [
      set('bb_bench_press', 0, 40, 5, { isApproach: true, isWarmup: true }),
      set('bb_bench_press', 1, 80, 7),
      set('bb_bench_press', 2, 80, 6),
      // bb_row swapped for a dumbbell row — the same muscle, one lift not done, one done instead
      set('db_row', 3, 30, 10),
      set('db_row', 4, 30, 9, { presumed: true }),
    ],
    ...over,
  };
}

describe('sessionToUpload — the allow-list', () => {
  it('db_row exists (the swap target)', () => expect(exerciseById('db_row')).toBeTruthy());

  it('sends working sets only — no warm-up, no approach, no presumed set', () => {
    const u = sessionToUpload(session(), coachProgram(), { bodyweight: false, cardio: false })!;
    expect(u.sets).toEqual([
      { ex: 'bb_bench_press', load: 80, reps: 7 },
      { ex: 'bb_bench_press', load: 80, reps: 6 },
      { ex: 'db_row', load: 30, reps: 10 },
    ]);
    expect(validateSessionUpload(u).ok).toBe(true);
  });

  it('derives the swap and the skip from the plan against the log', () => {
    const u = sessionToUpload(session(), coachProgram(), { bodyweight: false, cardio: false })!;
    expect(u.swaps).toEqual([{ from: 'bb_row', to: 'db_row' }]);
    expect(u.skipped).toEqual(['db_curl']);
    expect(u.day).toBe('Upper');
    expect(u.weekVersion).toBe(7);
    expect(u.minutes).toBe(15);
    expect(u.early).toBe(false);
  });

  it('bodyweight only with consent; pain only when reported inside the workout', () => {
    const eases = [
      { muscle: 'Chest', severity: 'pain' as const, fromMs: T0 + 5 * 60_000, untilMs: T0 + 9e8 },
      { muscle: 'Quads', severity: 'twinge' as const, fromMs: T0 - 86_400_000, untilMs: T0 + 9e8 },
    ];
    const no = sessionToUpload(session(), coachProgram(), { bodyweight: false, cardio: false }, 71, eases)!;
    expect(no.bodyweightKg).toBeUndefined();
    expect(no.pain).toEqual(['Chest']);
    const yes = sessionToUpload(session(), coachProgram(), { bodyweight: true, cardio: false }, 71)!;
    expect(yes.bodyweightKg).toBe(71);
    expect(yes.pain).toBeUndefined();
  });

  it('nothing to tell → null; an engine week sends no version', () => {
    expect(sessionToUpload(session({ sets: [set('bb_bench_press', 0, 40, 5, { isApproach: true })] }), coachProgram(), { bodyweight: false, cardio: false })).toBeNull();
    const engine = { ...coachProgram(), authored: 'engine' as const };
    expect(sessionToUpload(session(), engine, { bodyweight: false, cardio: false })!.weekVersion).toBeUndefined();
  });

  it('finds the day by `coach_<i>` or by id', () => {
    const p = coachProgram();
    expect(dayForSession({ programDayId: 'coach_1' }, p)?.name).toBe('Lower');
    expect(dayForSession({ programDayId: p.days[0].id }, p)?.name).toBe('Upper');
    expect(dayForSession({ programDayId: 'coach_9' }, p)).toBeNull();
  });

  it('the upload validator mirrors the bounds', () => {
    const u = sessionToUpload(session(), coachProgram(), { bodyweight: false, cardio: false })!;
    expect(validateSessionUpload({ ...u, minutes: 601 }).ok).toBe(false);
    expect(validateSessionUpload({ ...u, id: 'x'.repeat(65) }).ok).toBe(false);
    expect(validateSessionUpload({ ...u, pain: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).ok).toBe(false);
    expect(validateSessionUpload({ ...u, sets: [{ ex: 'bb_row', load: 1001, reps: 5 }] }).ok).toBe(false);
    expect(validateSessionUpload({ ...u, sets: [{ ex: 'bb_row', load: null, reps: 5 }] }).ok).toBe(true);
    expect(COACH_WIRE.batchMax).toBe(20);
  });
});

/* ── the landing ────────────────────────────────────────────────────────────────────────────── */

describe('landCoachUpdate — law 2', () => {
  const today = new Date(2026, 8, 17, 9, 30);

  it('a running session defers the whole week', () => {
    const out = landCoachUpdate(coachProgram(), env(8), { state: 'ACTIVE' }, today);
    expect(out).toEqual({ kind: 'deferred', reason: 'active_session', version: 8 });
  });

  it('nothing running → it lands today, with the diff', () => {
    const w = week();
    w.days[0].lifts[0] = { ...w.days[0].lifts[0], sets: 5 };
    w.days[0].lifts.splice(2, 1);
    w.days[1].lifts.push({ ex: 'incline_db_press', sets: 3, band: [8, 10] });
    const out = landCoachUpdate(coachProgram(), env(8, w), null, today);
    expect(out.kind).toBe('landed');
    if (out.kind !== 'landed') return;
    expect(out.effectiveDay).toBe('2026-09-17');
    expect(out.program.coachVersion).toBe(8);
    expect(out.diff.added).toEqual([{ day: 'Lower', ex: 'incline_db_press' }]);
    expect(out.diff.removed).toEqual([{ day: 'Upper', ex: 'db_curl' }]);
    expect(out.diff.changed).toEqual([{ day: 'Upper', ex: 'bb_bench_press', sets: [4, 5] }]);
  });

  it('a saved session is not running', () => {
    expect(landCoachUpdate(coachProgram(), env(8), { state: 'SAVED' }, today).kind).toBe('landed');
  });

  it('not newer → stale; the first coach week over an engine week lands whole', () => {
    expect(landCoachUpdate(coachProgram(), env(7), null, today)).toEqual({ kind: 'stale' });
    const engine: Program = { ...coachProgram(), authored: 'engine', coachVersion: undefined };
    const out = landCoachUpdate(engine, env(1), null, today);
    expect(out.kind).toBe('landed');
    if (out.kind === 'landed') expect(out.diff.added).toHaveLength(5);
  });

  it('a week this build cannot run a single lift of is refused, not landed empty', () => {
    const out = landCoachUpdate(coachProgram(), env(9), null, today, () => undefined);
    expect(out.kind).toBe('refused');
  });

  it('diffWeeks names a note change and a removed day', () => {
    const before = coachProgram();
    const w = week();
    w.days[0].lifts[0].note = 'no pause';
    w.days.pop();
    const d = diffWeeks(before, wireToProgram(env(2, w)).program);
    expect(d.changed).toEqual([{ day: 'Upper', ex: 'bb_bench_press', note: true }]);
    expect(d.removed.map((r) => r.day)).toEqual(['Lower', 'Lower']);
    expect(d.moved).toEqual([]);
  });

  /**
   * ⛔ A PURE REORDER LANDED SILENTLY UNTIL 2026-09-18 (the `moved` kind).
   *
   * `diffWeeks` compared each day's lifts through a Map keyed by exercise id, so a coach who
   * reordered a day — or moved a day up the week — produced `added: [] removed: [] changed: []`,
   * `diffCount === 0`, and NO CARD. Her week changed and the app said nothing, on the one surface
   * whose whole job is to tell her that it did.
   */
  describe('⛔ order is a change', () => {
    const after = (mutate: (w: CoachWeekWire) => void) => {
      const w = week();
      mutate(w);
      return diffWeeks(coachProgram(), wireToProgram(env(2, w)).program);
    };

    it('a day whose lifts were reordered says so, and says nothing else', () => {
      /* `Lower`, because reversing `Upper` would move its superset mark onto a different pair —
         a real re-prescription, and the point here is the case where NOTHING else moved. */
      const d = after((w) => {
        w.days[1].lifts.reverse();
      });
      expect(d.added).toEqual([]);
      expect(d.removed).toEqual([]);
      expect(d.changed).toEqual([]);
      expect(d.moved).toEqual([{ day: 'Lower', kind: 'lifts' }]);
    });

    it('a day that moved up the week names its new seat, and the other day is not blamed for it', () => {
      const d = after((w) => {
        w.days.reverse();
      });
      // Two days swapping is one of them moving — the LCS keeps the longer run in place.
      expect(d.moved.filter((m) => m.kind === 'day')).toEqual([{ day: 'Lower', kind: 'day', to: 1 }]);
      expect(d.added).toEqual([]);
      expect(d.removed).toEqual([]);
    });

    it('a day ADDED at the front does not report the days it pushed down as moved', () => {
      const d = after((w) => {
        w.days.unshift({ name: 'Arms', lifts: [{ ex: 'db_curl', sets: 3, band: [10, 12] }] });
      });
      expect(d.moved.filter((m) => m.kind === 'day')).toEqual([]);
      expect(d.added.map((x) => x.day)).toContain('Arms');
    });

    it('a lift that arrived or left is not ALSO reported as an order change', () => {
      const d = after((w) => {
        w.days[0].lifts.unshift({ ex: 'incline_db_press', sets: 3, band: [8, 10] });
      });
      expect(d.added).toEqual([{ day: 'Upper', ex: 'incline_db_press' }]);
      expect(d.moved).toEqual([]);
    });

    /* ⛔ THE RULE THE NO-CARD PATH DEPENDS ON: a week re-landed identical is still nothing. */
    it('an identical week reports no move, no change, nothing at all', () => {
      const d = after(() => undefined);
      expect(d).toEqual({ added: [], removed: [], changed: [], moved: [] });
    });

    it('a reorder and a re-prescription on the same day are two separate facts', () => {
      const d = after((w) => {
        w.days[1].lifts.reverse();
        w.days[1].lifts[0].sets = 6;
      });
      expect(d.changed).toEqual([{ day: 'Lower', ex: 'leg_extension', sets: [3, 6] }]);
      expect(d.moved).toEqual([{ day: 'Lower', kind: 'lifts' }]);
    });
  });

  /**
   * ⛔ A DROPPED LIFT CARRIES THE DAY IT WAS WRITTEN FOR (2026-09-18). Law 7 leaves her no reply
   * channel, so the ask she sends her coach herself has to name the workout as well as the lift.
   */
  it('wireToProgram says WHERE each unknown lift was, not only that there was one', () => {
    const out = wireToProgram(env(3), (id) => (id === 'bb_row' ? undefined : exerciseById(id)));
    expect(out.dropped).toEqual(['bb_row']);
    expect(out.droppedAt).toEqual([{ ex: 'bb_row', day: 'Upper' }]);
    const landed = landCoachUpdate(coachProgram(), env(9), null, today, (id) => (id === 'bb_row' ? undefined : exerciseById(id)));
    expect(landed.kind).toBe('landed');
    if (landed.kind === 'landed') expect(landed.droppedAt).toEqual([{ ex: 'bb_row', day: 'Upper' }]);
  });
});

/* ── the roster ─────────────────────────────────────────────────────────────────────────────── */

const NOW = Date.parse('2026-09-17T12:00:00.000Z');
const DAY = 86_400_000;
const up = (id: string, daysAgo: number, over: Partial<SessionUpload> = {}): SessionUpload => ({
  id,
  at: new Date(NOW - daysAgo * DAY).toISOString(),
  day: 'Upper',
  minutes: 50,
  early: false,
  sets: [{ ex: 'bb_bench_press', load: 80, reps: 6 }],
  ...over,
});
/*
 * ⚠️ `weekVersion: 1` IS THE DEFAULT HERE NOW (2026-09-18). A trainee with no week raises the
 * `noWeek` flag and raises NO `inactive` flag — she has nothing to be idle on — so every fixture
 * that is testing something else has to say it was sent a week. The behaviour itself is pinned by
 * its own case below.
 */
const athlete = (name: string, recent: SessionUpload[], over: Partial<RosterAthlete> = {}): RosterAthlete => ({
  linkId: `l-${name}`,
  name,
  since: new Date(NOW - 30 * DAY).toISOString(),
  days: 3,
  weekVersion: 1,
  recent,
  ...over,
});

describe('the roster math', () => {
  it('adherence counts this week’s workouts against her days', () => {
    const a = athlete('Noa', [up('1', 1), up('2', 3), up('3', 9)]);
    expect(adherence(a, NOW - 5 * DAY)).toEqual({ done: 2, planned: 3, ratio: 2 / 3 });
    expect(adherence({ ...a, days: undefined }, NOW - 5 * DAY)).toEqual({ done: 2, planned: null, ratio: null });
  });

  it('flags in order: pain (with the area), inactive, swaps, a new best', () => {
    const a = athlete('Noa', [
      up('old', 12, { sets: [{ ex: 'bb_bench_press', load: 80, reps: 5 }], swaps: [{ from: 'bb_row', to: 'db_row' }] }),
      up('mid', 10, { swaps: [{ from: 'bb_row', to: 'db_row' }] }),
      up('new', 8, { sets: [{ ex: 'bb_bench_press', load: 85, reps: 5 }], swaps: [{ from: 'bb_row', to: 'cable_row' }], pain: ['Shoulders'] }),
    ]);
    // the last session is 8 days ago: pain window (7 d) has passed, so no pain; inactive yes; swaps ×3
    expect(flags(a, NOW).map((f) => f.kind)).toEqual(['inactive', 'swaps']);

    const b = athlete('Lea', [
      up('p', 13, { sets: [{ ex: 'bb_bench_press', load: 80, reps: 5 }] }),
      up('q', 2, { sets: [{ ex: 'bb_bench_press', load: 85, reps: 5 }], pain: ['Shoulders', 'Shoulders'] }),
    ]);
    const fb = flags(b, NOW);
    expect(fb).toEqual([
      { kind: 'pain', area: 'Shoulders', at: b.recent[1].at },
      { kind: 'best', ex: 'bb_bench_press', e1rm: Math.round(epley(85, 5) * 10) / 10, at: b.recent[1].at },
    ]);
    expect(needsAttention(fb)).toBe(true);
    expect(needsAttention(fb.filter((f) => f.kind === 'best'))).toBe(false);
  });

  it('a week he never wrote is HIS flag, and it silences the one that blames her', () => {
    const never = athlete('Avi', [], { weekVersion: undefined, since: new Date(NOW - 60 * DAY).toISOString() });
    expect(flags(never, NOW)).toEqual([{ kind: 'noWeek' }]);
    expect(needsAttention(flags(never, NOW))).toBe(true);
    // The same athlete, once a week exists, is idle — and says so.
    expect(flags({ ...never, weekVersion: 1 }, NOW)).toEqual([{ kind: 'inactive', days: 60 }]);
  });

  it('a first-ever lift is not a "best"; silence is measured from the link date when nothing was trained', () => {
    expect(flags(athlete('A', [up('x', 1)]), NOW)).toEqual([]);
    expect(flags(athlete('B', [], { since: new Date(NOW - 6 * DAY).toISOString() }), NOW)).toEqual([{ kind: 'inactive', days: 6 }]);
    expect(flags(athlete('C', [], { since: new Date(NOW - 5 * DAY).toISOString() }), NOW)).toEqual([]);
  });

  it('sortRoster puts needs-attention first, gravest first, then by name', () => {
    const fine = athlete('Avi', [up('a', 1)]);
    const idle = athlete('Ben', [up('b', 7)]);
    const hurt = athlete('Zoe', [up('c', 1, { pain: ['Knee'] })]);
    const alsoFine = athlete('Adi', [up('d', 2)]);
    expect(sortRoster([fine, idle, alsoFine, hurt], NOW).map((a) => a.name)).toEqual(['Zoe', 'Ben', 'Adi', 'Avi']);
  });
});

describe('law 5 — locked while the link lives', () => {
  it('a coach week is locked only while linked; nothing else ever is', () => {
    const p = coachProgram();
    expect(weekIsLockedToCoach(p, true)).toBe(true);
    expect(weekIsLockedToCoach(p, false)).toBe(false);
    expect(weekIsLockedToCoach({ ...p, authored: 'athlete_or_coach' }, true)).toBe(false);
    expect(weekIsLockedToCoach(null, true)).toBe(false);
  });
});
