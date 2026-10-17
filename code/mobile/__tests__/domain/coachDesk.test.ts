/**
 * The coach's desk (`domain/coachDesk`) — the decisions the coach-side screens make about what the
 * wire carried: which section a trainee sits in, which lifts earn a sparkline, how a workout reads
 * set by set, and which bounds refuse a week before it is sent.
 */

import type { Program } from '@/data/local/models';
import { COACH_WIRE, validateWeekWire, type RosterAthlete, type SessionUpload } from '@/domain/coachTrack';
import {
  ROSTER_SEARCH_MIN,
  bandShown,
  draftFromWire,
  draftWithoutPassport,
  filterRosterSections,
  leadingFlag,
  liftTrends,
  rosterCount,
  rosterSections,
  sendableWeek,
  sessionLines,
  setCoachBand,
  setLiftNote,
  setsFigure,
  setWeekTitle,
  shortDate,
  weekProblems,
} from '@/domain/coachDesk';
import { addDay, addLift, blankDraft } from '@/domain/planBuilder';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-17T12:00:00Z');
const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

const up = (id: string, daysAgo: number, sets: SessionUpload['sets'], more: Partial<SessionUpload> = {}): SessionUpload => ({
  id, at: at(daysAgo), day: 'Upper', minutes: 50, early: false, sets, ...more,
});
const bench = (kg: number, reps = 8) => ({ ex: 'bb_bench_press', load: kg, reps });

/* ⚠️ `weekVersion: 1` by default (2026-09-18): a trainee with no week raises `noWeek` and nothing
   else — the roster stopped blaming her for a week the coach never wrote. See `CoachFlag`. */
const athlete = (over: Partial<RosterAthlete>): RosterAthlete => ({
  linkId: 'l', name: 'X', since: at(60), days: 3, weekVersion: 1, recent: [], ...over,
});

describe('rosterSections — who needs him, then everyone else', () => {
  const roster = [
    athlete({ linkId: 'best', name: 'Yoav', recent: [up('y1', 1, [bench(90)]), up('y2', 10, [bench(85)])] }),
    athlete({ linkId: 'quiet', name: 'Omer', recent: [up('o1', 8, [bench(60)])] }),
    athlete({ linkId: 'pain', name: 'Noa', recent: [up('n1', 2, [bench(35)], { pain: ['Quads'] })] }),
    athlete({ linkId: 'fine', name: 'Dana', recent: [up('d1', 1, [bench(40)]), up('d2', 2, [bench(40)])] }),
  ];
  const s = rosterSections(roster, NOW, NOW - 3 * DAY);

  it('pain leads, silence follows, and a new best never lifts a row into "needs you"', () => {
    expect(s.attention.map((r) => r.linkId)).toEqual(['pain', 'quiet']);
    expect(s.week.map((r) => r.linkId)).toEqual(['fine', 'best']);
  });

  it('each row carries its one flag and its done/planned figure', () => {
    expect(s.attention[0].flag).toMatchObject({ kind: 'pain', area: 'Quads' });
    expect(s.attention[1].flag).toMatchObject({ kind: 'inactive', days: 8 });
    expect(s.week.find((r) => r.linkId === 'best')!.flag).toMatchObject({ kind: 'best', ex: 'bb_bench_press' });
    expect(s.week.find((r) => r.linkId === 'fine')).toMatchObject({ flag: null, done: 2, planned: 3 });
  });

  it('the gravest flag is the one a row prints', () => {
    expect(leadingFlag([
      { kind: 'best', ex: 'a', e1rm: 1, at: at(0) },
      { kind: 'swaps', ex: 'b', count: 3 },
      { kind: 'pain', area: 'Back', at: at(0) },
    ])?.kind).toBe('pain');
    expect(leadingFlag([])).toBeNull();
  });

  /**
   * ⛔ AT THIRTY ATHLETES A LIST IS A CORPUS (2026-09-18). The roster had no search at any length,
   * so finding one name meant scrolling past every other. The search narrows each section IN PLACE:
   * "needs you" stays pinned above "this week" and the two never merge into one ranked list, or a
   * coach filtering for a name would stop being told first about the athlete who is in pain.
   */
  describe('the search', () => {
    it('counts the whole roster across both sections, and the threshold is a dozen', () => {
      expect(rosterCount(s)).toBe(4);
      expect(ROSTER_SEARCH_MIN).toBe(12);
    });

    it('narrows both sections and keeps the flagged one first', () => {
      const hit = filterRosterSections(s, 'no');
      expect(hit.attention.map((r) => r.linkId)).toEqual(['pain']);
      expect(hit.week).toEqual([]);
      const two = filterRosterSections(s, 'a');
      // Noa, Dana and Yoav all match; Noa is in pain and is still in the section above the two.
      expect(two.attention.map((r) => r.name)).toEqual(['Noa']);
      expect(two.week.map((r) => r.name)).toEqual(['Dana', 'Yoav']);
    });

    it('is case-insensitive, matches inside a name, and an empty query is the whole roster', () => {
      expect(filterRosterSections(s, 'YOA').week.map((r) => r.name)).toEqual(['Yoav']);
      expect(filterRosterSections(s, 'oav').week.map((r) => r.name)).toEqual(['Yoav']);
      expect(filterRosterSections(s, '   ')).toBe(s);
      expect(filterRosterSections(s, '')).toBe(s);
    });

    it('a query nobody answers leaves both sections empty rather than falling back to everyone', () => {
      const none = filterRosterSections(s, 'zzz');
      expect(none.attention).toEqual([]);
      expect(none.week).toEqual([]);
    });
  });
});

describe('liftTrends — which lifts earn a line', () => {
  const sessions = [
    up('a', 20, [bench(35), { ex: 'db_row', load: 20, reps: 10 }]),
    up('b', 13, [bench(37.5), { ex: 'db_row', load: 22, reps: 10 }]),
    up('c', 6, [bench(40), { ex: 'db_row', load: 22, reps: 10 }, { ex: 'bb_back_squat', load: 60, reps: 5 }]),
    up('d', 1, [bench(42.5, 8), bench(45, 3), { ex: 'bb_back_squat', load: 65, reps: 5 }]),
  ];

  it('two points at least; the coach\'s own lifts first; then the most trained', () => {
    const tr = liftTrends(sessions, { prefer: ['bb_back_squat'] });
    expect(tr.map((x) => x.ex)).toEqual(['bb_back_squat', 'bb_bench_press', 'db_row']);
  });

  it('the series is the best Epley per session, oldest first, rounded to half a kilo', () => {
    const b = liftTrends(sessions).find((x) => x.ex === 'bb_bench_press')!;
    // 42.5×8 = 53.83 → 54; 45×3 = 49.5 — the heavier-looking set is the lighter estimate.
    expect(b.series).toEqual([44.5, 47.5, 50.5, 54]);
    expect(b.current).toBe(54);
    expect(b.delta).toBe(9.5);
    expect(b.weeks).toBe(2);
  });

  it('a set past ten reps, or with no load, is not an estimate', () => {
    const tr = liftTrends([up('a', 3, [bench(20, 15), { ex: 'pullup', load: null, reps: 8 }]), up('b', 1, [bench(20, 15)])]);
    expect(tr).toEqual([]);
  });

  it('at most three', () => {
    const many = ['a_1', 'b_2', 'c_3', 'd_4'].flatMap((ex) => [up(`${ex}1`, 5, [{ ex, load: 10, reps: 5 }]), up(`${ex}2`, 1, [{ ex, load: 11, reps: 5 }])]);
    expect(liftTrends(many)).toHaveLength(3);
  });
});

describe('the log — a workout set by set', () => {
  it('setsFigure keeps the load while it holds, and says it again where it moves', () => {
    /* ⛔ ISOLATED (2026-09-18) — so the order is a property of the VALUE and not of the renderer
       that draws it (RN native and react-native-web disagree about a declared direction). It is NOT
       a reversal fix: measured on glass, the run already laid out left-to-right. See `setsFigure`. */
    const bare = (x: string) => x.replace(/[⁨⁩]/g, '');
    expect(setsFigure([{ load: 42.5, reps: 8 }, { load: 42.5, reps: 8 }, { load: 42.5, reps: 7 }])).toBe('⁨' + '42.5 × 8 · 8 · 7' + '⁩');
    expect(bare(setsFigure([{ load: 40, reps: 8 }, { load: 42.5, reps: 6 }]))).toBe('40 × 8 · 42.5 × 6');
    expect(bare(setsFigure([{ load: null, reps: 10 }, { load: null, reps: 9 }]))).toBe('10 · 9');
  });

  it('a swap is written beside the lift she did, with the lift it replaced', () => {
    const r = sessionLines(up('s', 1, [bench(40), { ex: 'db_shoulder_press', load: 12, reps: 10 }], {
      swaps: [{ from: 'bb_overhead_press', to: 'db_shoulder_press' }], skipped: ['triceps_pushdown'], pain: ['Shoulders'], early: true,
    }));
    expect(r.lines).toEqual([
      { ex: 'bb_bench_press', figure: '⁨' + '40 × 8' + '⁩' },
      { ex: 'db_shoulder_press', figure: '⁨' + '12 × 10' + '⁩', swappedFrom: 'bb_overhead_press' },
    ]);
    expect(r).toMatchObject({ skipped: ['triceps_pushdown'], pain: ['Shoulders'], early: true });
  });

  it('shortDate is two figures, the same in every language', () => {
    expect(shortDate('2026-09-02T09:00:00')).toBe('02.09');
    expect(shortDate('not a date')).toBe('');
  });
});

describe('the pen — every bound refused before a send, never trimmed', () => {
  const week = (): Program => {
    let d = blankDraft('w');
    d = addLift(d, 0, 'bb_bench_press');
    d = addDay(d);
    d = addLift(d, 1, 'bb_back_squat');
    return d;
  };

  it('a clean week goes to the wire, and the wire reads it back', () => {
    const s = sendableWeek(setLiftNote(setCoachBand(week(), 0, 0, [6, 8]), 0, 0, 'Feet planted.'));
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(validateWeekWire(s.week).ok).toBe(true);
    expect(s.week.days[0].lifts[0]).toEqual({ ex: 'bb_bench_press', sets: 3, band: [6, 8], note: 'Feet planted.' });
  });

  it('an empty day is a problem naming the day — not a day silently dropped', () => {
    const d = addDay(week());
    expect(weekProblems(d)).toEqual([{ kind: 'empty_day', day: 'Workout C' }]);
    expect(sendableWeek(d).ok).toBe(false);
  });

  it('eight days, fifteen lifts, a 41-character day name — each refused with where', () => {
    let d = week();
    for (let i = 0; i < 6; i++) d = addLift(addDay(d), d.days.length, 'bb_rdl');
    expect(weekProblems(d)).toContainEqual({ kind: 'too_many_days', n: 8 });

    const long: Program = { ...week(), days: week().days.map((x, i) => (i === 0 ? { ...x, name: 'x'.repeat(41) } : x)) };
    expect(weekProblems(long)).toContainEqual({ kind: 'day_name', day: 'x'.repeat(41) });

    const crowded: Program = { ...week(), days: [{ ...week().days[0], slots: Array.from({ length: 15 }, () => ({ ...week().days[0].slots[0] })) }] };
    expect(weekProblems(crowded)).toContainEqual({ kind: 'too_many_lifts', day: 'Workout A', n: 15 });
  });

  it('a 141-character note and a 61-character title cannot be written, and are refused if they arrive', () => {
    const d = week();
    expect(setLiftNote(d, 0, 0, 'n'.repeat(COACH_WIRE.noteMax + 1))).toBe(d);
    expect(setWeekTitle(d, 't'.repeat(COACH_WIRE.titleMax + 1))).toBe(d);
    const smuggled: Program = { ...d, title: 't'.repeat(61), days: d.days.map((x, i) => (i === 0 ? { ...x, slots: [{ ...x.slots[0], coachNote: 'n'.repeat(141) }] } : x)) };
    expect(weekProblems(smuggled).map((p) => p.kind).sort()).toEqual(['note_long', 'title_long']);
  });

  it('the band takes the wire\'s bounds — heavy singles are a prescription — and nothing outside them', () => {
    const d = week();
    expect(setCoachBand(d, 0, 0, [1, 3]).days[0].slots[0].repBand).toEqual([1, 3]);
    expect(setCoachBand(d, 0, 0, [0, 3])).toBe(d);
    expect(setCoachBand(d, 0, 0, [9, 8])).toBe(d);
    expect(setCoachBand(d, 0, 0, [8, 51])).toBe(d);
    expect(bandShown({})).toHaveLength(2);
  });

  it('an empty note clears, never stores whitespace', () => {
    const d = setLiftNote(setLiftNote(week(), 0, 0, 'x'), 0, 0, '   ');
    expect(d.days[0].slots[0].coachNote).toBeUndefined();
  });

  it('a week off the wire opens as a DRAFT — no coach passport on the page he is still writing', () => {
    const { draft, dropped } = draftFromWire({
      v: 1, title: 'UL', days: [{ name: 'Upper', lifts: [{ ex: 'bb_bench_press', sets: 4, band: [5, 8], note: 'Pause.' }, { ex: 'not_a_lift', sets: 3, band: [8, 10] }] }],
    }, 'd1');
    expect(dropped).toEqual(['not_a_lift']);
    expect(draft).not.toHaveProperty('authored');
    expect(draft).not.toHaveProperty('coachVersion');
    expect(draft).not.toHaveProperty('coachName');
    expect(draft.id).toBe('d1');
    expect(draft.days[0].slots[0]).toMatchObject({ exerciseId: 'bb_bench_press', setCount: 4, repBand: [5, 8], coachNote: 'Pause.' });
    const again = draftWithoutPassport({ ...draft, authored: 'athlete_or_coach' }, 'd2');
    expect(again).not.toHaveProperty('authored');
  });
});
