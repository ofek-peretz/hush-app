/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE ENGINE AUDIT, HELD (founder-approved, 2026-10-17)
 *
 * Founder: *"אני רוצה שתסתכל על המנוע ותראה האם לדעתך הוא ברמה הגבוהה ביותר… לאחר מכן ארצה שתוודא האם
 * המנוע פועל בדיוק לפי איך שאתה רואה לנכון."* — and then, on the report: *"אני מאשר את הכל."*
 *
 * Each block below is one finding of that audit, pinned to the behaviour that answers it. The twelve-
 * week simulation that found the biggest of them lives beside this file (`audit/theEngineAsSheLivesIt`).
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import fs from 'fs';
import path from 'path';

import { applyDetrainingV5, advanceV5, currentV5Targets, getSessionForwardV5, getSessionEarnedV5, getWeeklyUpdateV5 } from '@/engine/v5/v5Engine';
import { offerTarget } from '@/domain/swapOffers';
import { exerciseById } from '@/data/exercises';
import { seedStatedLoads } from '@/domain/statedLifts';
import { draftFromCoachWeek } from '@/domain/coachDraft';
import { lastSessionStartMs } from '@/engine/v5/detraining';
import { db } from '@/data/local/db';
import { withOffer, declined, liveOffers, applyOffer, isAuthored } from '@/domain/swapOffers';
import { isRepRecordSet, priorRepsAtKg, isRecordSet } from '@/domain/setRecord';
import { dumbbellUp, dumbbellDownOrEqual } from '@/engine/v5/loadGrid';
import type { Session } from '@/data/local/models';

const MOBILE = path.join(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(MOBILE, rel), 'utf8').replace(/\r\n/g, '\n');

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 5, 9, 0, 0);
const BAND = { lo: 8, hi: 12 };
const EX = 'bb_bench_press';

const session = (id: string, at: number, load: number, reps: number[], ex = EX): Session => ({
  id, programDayId: 'd1', startedAt: new Date(at).toISOString(), state: 'SAVED', earlyFinish: false,
  sets: reps.map((r, i) => ({ exerciseId: ex, setIndex: i, recommendedWeight: load, recommendedReps: 8, actualWeight: load, actualReps: r, edited: false, persistedAt: '', restBeforeS: 90 })),
});
const weeks = (n: number, load: number, reps: number[]) => Array.from({ length: n }, (_, w) => session(`s${w}`, T0 + w * 7 * DAY, load, reps));
const lastStart = (h: Session[]) => lastSessionStartMs(h.map((s) => Date.parse(s.startedAt)));
const loadOf = async (h: Session[]) => (await currentV5Targets(h))[EX]?.weight ?? null;

describe('1 · a layoff decays the same however often she opens the app', () => {
  it('opening it every day of a 45-day gap lands on the same loads as opening it once at the end', async () => {
    const h = weeks(8, 60, [9, 9, 9]);

    await db.clearAll();
    await advanceV5([EX], () => BAND, h, () => 20, lastStart(h));
    for (let d = 11; d <= 45; d += 1) await applyDetrainingV5(h, lastStart(h) + d * DAY);
    const daily = await loadOf(h);

    await db.clearAll();
    await advanceV5([EX], () => BAND, h, () => 20, lastStart(h));
    await applyDetrainingV5(h, lastStart(h) + 45 * DAY);
    const once = await loadOf(h);

    expect(daily).toBe(once);
    expect(once).toBeLessThan(60); // and a month and a half away IS decayed
  });
});

describe('2 · a workout that comes home late is still read — once', () => {
  it('a session older than the last one folded, arriving after it, is folded; folding again changes nothing', async () => {
    await db.clearAll();
    const early = session('early', T0, 60, [9, 9, 9]);
    const later = session('later', T0 + 4 * DAY, 60, [9, 9, 9]);
    await advanceV5([EX], () => BAND, [early, later], () => 60, T0 + 5 * DAY);
    const before = (await db.loadEngineV5())!.exercises[EX].history.length;

    // The wrist's workout from day 2 reaches the phone on day 6 — after `later` was folded.
    const late = session('wrist', T0 + 2 * DAY, 60, [10, 10, 10]);
    const all = [early, late, later];
    await advanceV5([EX], () => BAND, all, () => 60, T0 + 6 * DAY);
    const after = (await db.loadEngineV5())!.exercises[EX].history.length;
    expect(after).toBe(before + 1);

    await advanceV5([EX], () => BAND, all, () => 60, T0 + 7 * DAY);
    expect((await db.loadEngineV5())!.exercises[EX].history.length).toBe(after);
  });
});

describe('3 · a partial occurrence never raises', () => {
  it('one strong set of three prescribed holds the load', async () => {
    await db.clearAll();
    const h = [session('s0', T0, 60, [9, 9, 9]), session('s1', T0 + 3 * DAY, 60, [15])];
    await advanceV5([EX], () => BAND, h, () => 60, T0 + 4 * DAY, undefined, () => 3);
    expect(await loadOf(h)).toBe(60);
  });
  it('…and the light approach set is one of the prescribed sets, not a missing one (S-60)', async () => {
    await db.clearAll();
    const s1 = session('s1', T0 + 3 * DAY, 60, [12, 12, 12]);
    s1.sets[0] = { ...s1.sets[0], isApproach: true, actualWeight: 40, recommendedWeight: 40 };
    const h = [session('s0', T0, 60, [9, 9, 9]), s1];
    await advanceV5([EX], () => BAND, h, () => 60, T0 + 4 * DAY, undefined, () => 3);
    expect(await loadOf(h)).toBeGreaterThan(60);
  });
  it('…while the same reps on every prescribed set do raise it', async () => {
    await db.clearAll();
    const h = [session('s0', T0, 60, [9, 9, 9]), session('s1', T0 + 3 * DAY, 60, [12, 12, 11])];
    await advanceV5([EX], () => BAND, h, () => 60, T0 + 4 * DAY, undefined, () => 3);
    expect(await loadOf(h)).toBeGreaterThan(60);
  });
});

describe('4 · the rep target climbs, is said at the finish, and is never news in the letter', () => {
  it('meeting the target on every set raises it one rep; the climb is in the session\'s forward record', async () => {
    await db.clearAll();
    const s0 = session('s0', T0, 60, [8, 8, 8]);
    await advanceV5([EX], () => BAND, [s0], () => 60, T0 + DAY, undefined, () => 3);
    expect((await currentV5Targets([s0]))[EX].reps).toBe(9);
    const fwd = await getSessionForwardV5(T0);
    expect(fwd[EX]).toMatchObject({ repsFrom: 8, repsTo: 9 });
    expect(read('src/engine/v5/v5Engine.ts')).toContain("c.at >= start && c.at < end && c.kind !== 'reps'");
  });

  /*
   * ⛔ FOUND ON THE SCREEN, NOT BY A TEST (2026-10-17 web walk). The finish screen builds its "next
   * time" rows from `sessionEarned`, and that list kept only entries whose LOAD moved — a climb holds
   * the load by definition, so every climb was dropped and a workout that met every target read
   * "same weights and same targets". The forward map above was right the whole time.
   */
  it('the climb reaches the finish screen\'s list — and four climbs say their reason once', async () => {
    await db.clearAll();
    const s0 = session('s0', T0, 60, [8, 8, 8]);
    await advanceV5([EX], () => BAND, [s0], () => 60, T0 + DAY, undefined, () => 3);
    const earned = await getSessionEarnedV5(T0);
    expect(earned.map((e) => e.slotId)).toEqual([EX]);
    // No figures in the sentence — the row carries them, so lifts that climbed group into one line.
    expect(earned[0].text).toEqual({ key: 'explain.repsUp.text' });
  });
});

describe('5 · on a written week, a change is offered — never made, never narrated as made', () => {
  const week = {
    id: 'w', authored: 'athlete_or_coach', days: [
      { id: 'a', name: 'A', isRest: false, slots: [{ id: '1', exerciseId: 'bb_overhead_press', setCount: 3, repBand: [6, 10] }, { id: '2', exerciseId: 'push_up', setCount: 3 }] },
      { id: 'b', name: 'B', isRest: false, slots: [{ id: '3', exerciseId: 'bb_overhead_press', setCount: 4 }, { id: '4', exerciseId: 'db_shoulder_press', setCount: 3 }] },
    ],
  } as never;

  it('an offer is made once, a "no" is kept, and a newer reason replaces an older one', () => {
    let offers = withOffer(undefined, { from: 'bb_overhead_press', to: 'db_shoulder_press', kind: 'rotate', at: 1 });
    offers = withOffer(offers, { from: 'bb_overhead_press', to: 'db_shoulder_press', kind: 'rotate', at: 2 });
    expect(offers).toHaveLength(1);
    offers = declined(offers, offers[0], 3);
    offers = withOffer(offers, { from: 'bb_overhead_press', to: 'db_shoulder_press', kind: 'rotate', at: 4 });
    expect(offers[0].declinedAt).toBe(3); // she said no to exactly this — not asked again
    offers = withOffer(offers, { from: 'bb_overhead_press', to: 'landmine_press', kind: 'rotate', at: 5 });
    expect(offers[0]).toMatchObject({ to: 'landmine_press' });
    expect(offers[0].declinedAt).toBeUndefined();
  });

  it('only a live offer is shown — the lift still in her week, the replacement not already there', () => {
    expect(liveOffers([{ from: 'bb_overhead_press', to: 'landmine_press', kind: 'rotate', at: 1 }], week)).toHaveLength(1);
    expect(liveOffers([{ from: 'bb_overhead_press', to: 'db_shoulder_press', kind: 'rotate', at: 1 }], week)).toHaveLength(1);
    expect(liveOffers([{ from: 'leg_press', to: 'hack_squat', kind: 'rotate', at: 1 }], week)).toHaveLength(0);
  });

  it('taking it changes every seat of the lift, keeps sets and range, and never doubles a day', () => {
    const next = applyOffer(week, { from: 'bb_overhead_press', to: 'db_shoulder_press' });
    expect(next.days[0].slots[0]).toMatchObject({ exerciseId: 'db_shoulder_press', setCount: 3, repBand: [6, 10] });
    // Day B already holds the replacement — it keeps its own press rather than holding it twice.
    expect(next.days[1].slots.map((s) => s.exerciseId)).toEqual(['bb_overhead_press', 'db_shoulder_press']);
    expect(isAuthored(next)).toBe(true);
  });

  it('the fold offers on a written week instead of writing a substitute or narrating a swap', () => {
    const fm = read('src/data/api/fixtureModel.ts');
    const at = fm.indexOf('  if (writtenWeek) {');
    expect(at).toBeGreaterThan(-1);
    const block = fm.slice(at, fm.indexOf('    return;\n  }', at));
    expect(block).toContain('withOffer(');
    expect(block).not.toContain('p.substitutes');
    expect(block).not.toContain('recordStructuralChangeV5');
    expect(read('src/engine/v5/v5Engine.ts')).toContain('if (res.sets !== current && !writtenWeek) {');
  });
});

describe('6 · a rep record is more reps at her heaviest weight — and only that', () => {
  const past = [{ exerciseId: EX, actualWeight: 60, actualReps: 8 }, { exerciseId: EX, actualWeight: 60, actualReps: 9 }, { exerciseId: EX, actualWeight: 55, actualReps: 12 }];
  it('nine at her 60 kg peak, where she had done eight and nine, is not a record; ten is', () => {
    const atPeak = priorRepsAtKg(past, EX, 60);
    expect(atPeak).toBe(9);
    expect(isRepRecordSet(60, 9, 60, atPeak)).toBe(false);
    expect(isRepRecordSet(60, 10, 60, atPeak)).toBe(true);
  });
  it('more reps at a LIGHTER weight is the climb back, not a best — and a heavier weight is the weight record', () => {
    expect(isRepRecordSet(55, 13, 60, 9)).toBe(false);
    expect(isRepRecordSet(62.5, 10, 60, 9)).toBe(false);
    expect(isRecordSet(62.5, 1, 60)).toBe(true);
  });
});

describe('7 · a dumbbell is a pair the rack holds', () => {
  it('by 1 kg to 10, by 2 to 20, by 2.5 above — never an 11 or a 13 the engine invented', () => {
    expect([dumbbellUp(9), dumbbellUp(10), dumbbellUp(12), dumbbellUp(20), dumbbellUp(22.5)]).toEqual([10, 12, 14, 22.5, 25]);
    expect([dumbbellDownOrEqual(13), dumbbellDownOrEqual(21), dumbbellDownOrEqual(9.4)]).toEqual([12, 20, 9]);
  });
});

/*
 * ⛔ FOUND ON THE SCREENS (the 2026-10-17 web walk the founder asked for — "מסכים שאתה מסתכל בעיניים").
 * Each of these read green in every suite and false on the glass.
 */
describe('8 · what the walk found', () => {
  it('the Program tab reads her target the way Today and the pre-workout read it — "3×7–8", not the floor', () => {
    const tab = read('src/screens/program/ProgramTab.tsx');
    expect(tab).toContain('...(r.target != null ? { target: r.target } : {})');
    expect(tab).toContain('const [lo, hi] = schemeBand(r);');
  });
  it('the engine\'s "what your week could not do" is never printed over a week the model, she or a coach wrote', () => {
    expect(read('src/screens/home/Home.tsx')).toContain('const notice = isAuthored(program) ? null : weekNotice(');
  });
  it('"your week so far" counts the cycle the meter above it counts — never the calendar week behind it', () => {
    expect(read('src/screens/home/Home.tsx')).toContain('const weekOpen = app.weekOpenMs ?? currentWeekOpen(Date.now());');
  });
});

/*
 * ⛔ THE SECOND PASS (2026-10-17, founder: *"תעבור על כל ההודעה ותוודא שממצא אחר ממצא טופל בצורה
 * הטובה ביותר"*). The report read finding by finding against the code and the twelve-week board.
 */
describe('9 · the second pass — each finding, held at the level it was promised', () => {
  const ws = (id: string, at: number, ex: string, load: number, reps: number[]): Session => ({
    id, programDayId: 'd1', startedAt: new Date(at).toISOString(), state: 'SAVED', earlyFinish: false,
    sets: reps.map((r, i) => ({ exerciseId: ex, setIndex: i, recommendedWeight: load, recommendedReps: 12, actualWeight: load, actualReps: r, edited: true, persistedAt: '', restBeforeS: 60 })),
  });
  const runOf = (ex: string, load: number, reps: number[], n: number) => Array.from({ length: n }, (_, w) => ws(`n${w}`, T0 + w * 3 * DAY, ex, load, reps));
  const loadAfter = async (ex: string, band: { lo: number; hi: number }, h: Session[]) => {
    await db.clearAll();
    await advanceV5([ex], () => band, h, () => h[0].sets[0].actualWeight as number, Date.parse(h[h.length - 1].startedAt) + DAY, undefined, () => 3);
    return (await currentV5Targets(h))[ex]?.weight ?? null;
  };

  it('F-24 on the way down: one or two reps short on a coarse rung HOLDS — the dumbbell never halves for a near miss', async () => {
    // 6 → 5 kg is −17%: a near miss (12, 11, 10 in a 12–20 range) keeps the 6.
    expect(await loadAfter('lateral_raise', { lo: 12, hi: 20 }, runOf('lateral_raise', 6, [12, 11, 10], 5))).toBe(6);
    // …a real miss, far under the floor, still backs off.
    expect(await loadAfter('lateral_raise', { lo: 12, hi: 20 }, runOf('lateral_raise', 6, [9, 8, 7], 5))).toBeLessThan(6);
    // …and a barbell's rung is never big, so its back-off is S-25's as ever.
    expect(await loadAfter('bb_bench_press', { lo: 8, hi: 12 }, runOf('bb_bench_press', 60, [7, 6, 6], 5))).toBeLessThan(60);
  });

  const week = {
    id: 'w', authored: 'athlete_or_coach', days: [
      { id: 'a', name: 'A', isRest: false, slots: [{ id: '1', exerciseId: 'leg_curl', setCount: 3 }, { id: '2', exerciseId: 'pull_up', setCount: 3 }, { id: '3', exerciseId: 'cable_lateral_raise', setCount: 3 }] },
      { id: 'b', name: 'B', isRest: false, slots: [{ id: '4', exerciseId: 'bb_rdl', setCount: 3 }, { id: '5', exerciseId: 'chest_dip', setCount: 3 }] },
    ],
  } as never;

  it('a rotation is offered as the SAME movement — a leg curl for a leg curl, never a deadlift', () => {
    const to = offerTarget('leg_curl', 'rotate', week);
    expect(to).toBeDefined();
    expect(exerciseById(to!)!.pattern).toBe('knee_flexion');
    const lat = offerTarget('cable_lateral_raise', 'rotate', week);
    expect(exerciseById(lat!)!.pattern).toBe('lateral_raise');
  });

  it('a pull-up or a dip at the top of its range is offered its loaded form; a push-up its harder variation', () => {
    expect(offerTarget('pull_up', 'graduate', week)).toBe('weighted_pull_up');
    expect(offerTarget('chest_dip', 'graduate', week)).toBe('weighted_dip');
    expect(offerTarget('push_up', 'graduate', week)).toBe('chest_dip');
  });

  it('the fold offers through `offerTarget`, and keeps a leave-it', () => {
    const fm = read('src/data/api/fixtureModel.ts');
    const at = fm.indexOf('  if (writtenWeek) {');
    const block = fm.slice(at, fm.indexOf('    return;\n  }', at));
    expect(block).toContain('offerTarget(from, kind, program');
    expect(block).toContain('prefs.leaveItsByMuscle?.[m] === from');
  });

  it('the letter over a written week never narrates a set or a swap the engine did not make — old entries included', async () => {
    await db.clearAll();
    const start = T0;
    const end = T0 + 7 * DAY;
    const base = { setsFrom: 3, setsTo: 3, bandFrom: [8, 12] as [number, number], bandTo: [8, 12] as [number, number], at: T0 + DAY };
    await db.saveEngineV5({
      exercises: {},
      changeLog: [
        { ...base, exerciseId: 'Chest', decision: 'hold', loadFrom: null, loadTo: null, kind: 'volume', muscle: 'Chest', setsFrom: 10, setsTo: 11 },
        { ...base, exerciseId: 'bb_bench_press', decision: 'progress', loadFrom: 60, loadTo: 62.5 },
      ],
    } as never);
    const engineWeek = await getWeeklyUpdateV5(T0 + 8 * DAY, { start, end }, false);
    const written = await getWeeklyUpdateV5(T0 + 8 * DAY, { start, end }, true);
    expect(engineWeek!.explanations.length).toBe(2);
    expect(written!.explanations.map((e) => e.slotId)).toEqual(['bb_bench_press']);
    expect(read('src/domain/weeklyUpdate.ts')).toContain('return getWeeklyUpdateV5(Date.now(), await closedCycle(), isAuthored(program));');
  });

  it('a weight she stated never opens heavier than her own set allows at the bottom of the range', () => {
    const w = { id: 'w', days: [{ id: 'a', name: 'A', isRest: false, slots: [
      { id: '1', exerciseId: 'bb_bench_press', setCount: 3, repBand: [8, 12], startLoadKg: 100 },
      { id: '2', exerciseId: 'bb_back_squat', setCount: 3, repBand: [8, 12], startLoadKg: 80 },
    ] }] } as never;
    const out = seedStatedLoads(w, [{ exerciseId: 'bb_bench_press', kg: 100, reps: 3 }, { exerciseId: 'bb_back_squat', kg: 120, reps: 5 }]);
    // 100 × 3 asked for eight is about 87 — never the 100 the model kept.
    expect(out.days[0].slots[0].startLoadKg).toBeLessThan(90);
    expect(out.days[0].slots[0].startLoadKg).toBeGreaterThan(84);
    // A lighter number the model chose is its own and stands.
    expect(out.days[0].slots[1].startLoadKg).toBe(80);
  });

  it('one lift, one range: the first range the week gives a lift is the range of every seat of it', () => {
    const p = draftFromCoachWeek({ days: [
      { name: 'A', lifts: [{ ex: 'bb_bench_press', sets: 3, reps: [5, 8] }] },
      { name: 'B', lifts: [{ ex: 'bb_bench_press', sets: 3, reps: [10, 12] }, { ex: 'cable_row', sets: 3 }] },
    ] } as never)!;
    const seats = p.days.flatMap((d) => d.slots).filter((s) => s.exerciseId === 'bb_bench_press');
    expect(seats.map((s) => s.repBand)).toEqual([[5, 8], [5, 8]]);
  });
});
