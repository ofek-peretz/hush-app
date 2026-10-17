/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE LIGHT WEEK IS EARNED AND EXPLAINED — founder authorization, 2026-08-24.
 *
 * Every competing engine deloads badly: on the calendar (Alpha Progression), unannounced (RP keeps
 * a help article titled "Why did my training get so much easier?"), or only after the damage (Dr.
 * Muscle). Hush's deload (engine/v5/deload) is allowed exactly one shape — called by EVIDENCE,
 * told the moment it is born, every moved load carrying its reason — and this law holds it there:
 *
 *   1 · the trigger is systemic fact, never the calendar: most judgeable lifts below their rep
 *       floor twice running with the load not lower — and never before real statistics exist;
 *   2 · the light week is stamped like any decision, its sessions are recorded but NEVER folded,
 *       and Loop 1 may not raise a deliberately light bar;
 *   3 · the week ends at its window — even on a pure read — and the loads walk back to exactly
 *       where they stood, stamped again;
 *   4 · both sentences exist, in both of her languages.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import * as fs from 'fs';
import * as path from 'path';
import { advanceV5, currentV5Targets, activeDeloadV5, resetV5, explainChange } from '@/engine/v5/v5Engine';
import {
  deloadDue,
  liftIsFatigued,
  DELOAD_MIN_ELIGIBLE,
  DELOAD_MIN_HISTORY_SESSIONS,
  DELOAD_COOLDOWN_DAYS,
  DELOAD_FRACTION,
  DELOAD_DAYS,
} from '@/engine/v5/deload';
import { bandFor } from '@/engine/v5/repBand';
import { db } from '@/data/local/db';
import type { Session, SetLog } from '@/data/local/models';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

const BAND = bandFor('8-10'); // floor 8
const LIFTS = ['bb_bench_press', 'incline_bb_press', 'db_bench_press', 'machine_chest_press'];
const seed = () => 60;
const DAY = 24 * 60 * 60 * 1000;

const set = (exerciseId: string, setIndex: number, reps: number): SetLog => ({
  exerciseId, setIndex, recommendedWeight: 60, recommendedReps: 8, actualWeight: 60, actualReps: reps, edited: false, persistedAt: '', restBeforeS: 90,
});
const session = (startedAt: string, reps: number): Session => ({
  id: `s_${startedAt}`,
  programDayId: 'd',
  startedAt,
  state: 'SAVED',
  earlyFinish: false,
  sets: LIFTS.flatMap((id) => [0, 1, 2].map((i) => set(id, i, reps))),
});
const T = (n: number) => new Date(2026, 5, 1 + n, 10).toISOString();

/** Twelve strong sessions, then two systemic collapses — the exact evidence the trigger names. */
const fatiguedHistory = (): Session[] => [
  ...Array.from({ length: 12 }, (_, n) => session(T(n), 8)),
  session(T(12), 6),
  session(T(13), 6),
];

describe('1 · the trigger is systemic fact, never the calendar', () => {
  const fatigued = { load: 60, band: { lo: 8, hi: 10 }, history: [{ load: 60, sets: [{ reps: 6 }] }, { load: 60, sets: [{ reps: 6 }] }] };
  const healthy = { load: 60, band: { lo: 8, hi: 10 }, history: [{ load: 60, sets: [{ reps: 9 }] }, { load: 60, sets: [{ reps: 8 }] }] };

  it('a lift is fatigued only when the miss is persistent, sliding, and not explained by heavier iron', () => {
    expect(liftIsFatigued(fatigued)).toBe(true);
    expect(liftIsFatigued(healthy)).toBe(false);
    // One bad day is Loop 2's problem, not a deload's.
    expect(liftIsFatigued({ ...fatigued, history: [{ load: 60, sets: [{ reps: 6 }] }, { load: 60, sets: [{ reps: 9 }] }] })).toBe(false);
    // A heavier bar explains the misses — the load rose between the two occurrences.
    expect(liftIsFatigued({ ...fatigued, history: [{ load: 62.5, sets: [{ reps: 6 }] }, { load: 60, sets: [{ reps: 6 }] }] })).toBe(false);
    // Climbing back (6 → 7) is recovery in motion, not fatigue.
    expect(liftIsFatigued({ ...fatigued, history: [{ load: 60, sets: [{ reps: 7 }] }, { load: 60, sets: [{ reps: 6 }] }] })).toBe(false);
  });

  it('half the roster must carry the mark, and thin statistics never deload', () => {
    const four = Object.fromEntries([['a', fatigued], ['b', fatigued], ['c', healthy], ['d', healthy]]);
    const base = { atMs: Date.now(), managed: new Set(['a', 'b', 'c', 'd']), historySessions: 20, lastDeloadStartedAt: null };
    expect(deloadDue({ ...base, exercises: four }).due).toBe(true); // 2/4 at the 0.5 share
    expect(deloadDue({ ...base, exercises: { ...four, c: healthy, d: healthy, e: healthy } , managed: new Set(['a','b','c','d','e'])}).due).toBe(false); // 2/5 under it
    // Fewer judgeable lifts than DELOAD_MIN_ELIGIBLE cannot prove "systemic".
    expect(deloadDue({ ...base, exercises: { a: fatigued, b: fatigued, c: fatigued }, managed: new Set(['a', 'b', 'c']) }).due).toBe(false);
    expect(3).toBeLessThan(DELOAD_MIN_ELIGIBLE);
    // Day-one noise never deloads.
    expect(deloadDue({ ...base, exercises: four, historySessions: DELOAD_MIN_HISTORY_SESSIONS - 1 }).due).toBe(false);
    // …and a deload may not answer its own aftermath (hysteresis, not a schedule).
    expect(deloadDue({ ...base, exercises: four, lastDeloadStartedAt: base.atMs - (DELOAD_COOLDOWN_DAYS - 1) * DAY }).due).toBe(false);
  });
});

describe('2+3 · the engine opens it on the evidence, protects it, and closes it at the window', () => {
  beforeEach(async () => {
    await resetV5();
  });

  it('the whole arc: stamped open → light prescription → recovery sessions never fold → stamped restore', async () => {
    const history = fatiguedHistory();
    const lastAt = Date.parse(history[history.length - 1].startedAt);
    await advanceV5(LIFTS, BAND, history, seed, lastAt);

    // OPEN — the state carries the window and every lightened load is stamped with its from→to.
    const state = await db.loadEngineV5();
    expect(state.deload).toBeTruthy();
    expect(state.deload.startedAt).toBe(lastAt);
    expect(state.deload.endsAt).toBe(lastAt + DELOAD_DAYS * DAY);
    const opens = (state.changeLog ?? []).filter((c) => c.kind === 'deload' && c.loadTo < c.loadFrom);
    expect(opens.length).toBeGreaterThanOrEqual(LIFTS.length);
    expect(await activeDeloadV5(lastAt + DAY)).toBe(true);

    // The prescription she reads is the light one — ~DELOAD_FRACTION, snapped to her real grid.
    const targets = await currentV5Targets(history, lastAt + DAY);
    const preLoad = opens.find((c) => c.exerciseId === 'bb_bench_press').loadFrom;
    expect(targets['bb_bench_press'].weight).toBeLessThan(preLoad);
    expect(targets['bb_bench_press'].weight).toBeLessThanOrEqual(preLoad * DELOAD_FRACTION + 1e-6);

    // A recovery session inside the window is RECORDED, never FOLDED: she crushes the light bar
    // (12 reps, far over the band) and no loop reads it as capability news.
    const lightLoad = targets['bb_bench_press'].weight;
    const recovery = session(T(15), 12);
    await advanceV5(LIFTS, BAND, [...history, recovery], seed, Date.parse(recovery.startedAt));
    const during = await db.loadEngineV5();
    expect(during.deload).toBeTruthy(); // still open
    expect(during.lastFoldedAt).toBe(Date.parse(recovery.startedAt)); // recorded — the cursor moved
    const afterTargets = await currentV5Targets([...history, recovery], Date.parse(recovery.startedAt));
    expect(afterTargets['bb_bench_press'].weight).toBe(lightLoad); // …and nothing progressed from it

    // THE HUNT OF 2026-08-24, PINNED — three ways the light week could have lied:
    //  a) Well Done's "next time" must show the number the deload DECIDED, not the Loop 2 move it
    //     overrode in the same fold (last write wins; the FROM stays her standing weight);
    const { getSessionForwardV5 } = require('@/engine/v5/v5Engine');
    const forward = await getSessionForwardV5(lastAt);
    expect(forward['bb_bench_press']?.loadTo).toBe(lightLoad);
    //  b) the light load steps down the EQUIPMENT's ladder, never her sparse performed grid — a
    //     [40, 60] grid must not turn a 10% deload into a 33% one;
    const { snapDown } = require('@/engine/v5/grid');
    expect(lightLoad).toBe(snapDown(preLoad * DELOAD_FRACTION, 'barbell'));
    expect(lightLoad).toBeGreaterThanOrEqual(preLoad * DELOAD_FRACTION - 2.5);
    //  c) the Saturday letter narrates ONE sentence per lift per moment — the deload alone, never
    //     the raise she never saw beside it (source-pinned; the closed-week clock is not this
    //     test's to fake).
    expect(read('src/engine/v5/v5Engine.ts')).toContain("!(c.kind == null && deloadAt.has(`${c.exerciseId}@${c.at}`))");

    // CLOSE — a pure read past the window restores every load exactly and stamps the walk back.
    await advanceV5(LIFTS, BAND, [...history, recovery], seed, lastAt + (DELOAD_DAYS + 1) * DAY);
    const closed = await db.loadEngineV5();
    expect(closed.deload).toBeUndefined();
    const restores = (closed.changeLog ?? []).filter((c) => c.kind === 'deload' && c.loadTo > c.loadFrom);
    expect(restores.length).toBe(opens.length);
    const finalTargets = await currentV5Targets([...history, recovery], lastAt + (DELOAD_DAYS + 1) * DAY);
    expect(finalTargets['bb_bench_press'].weight).toBe(preLoad);
    // …and the hysteresis remembers.
    expect(closed.lastDeloadStartedAt).toBe(lastAt);
  });

  it('twelve strong sessions alone never open one (no false fire on an ordinary athlete)', async () => {
    const history = Array.from({ length: 14 }, (_, n) => session(T(n), 8));
    await advanceV5(LIFTS, BAND, history, seed, Date.parse(history[13].startedAt));
    expect((await db.loadEngineV5()).deload).toBeUndefined();
  });
});

describe('2b · the live loop and the stage know the week is light', () => {
  it('Loop 1 may not raise under deloadHold — pinned at the one place it could', () => {
    const src = read('src/state/stores/sessionStore.tsx');
    /* 2026-08-26: Loop 1 left the live session entirely, so the one place a light week could
       be raised mid-workout no longer exists — the stronger guarantee subsumes the branch. */
    expect(src).not.toContain('applyLoop1(');
    expect(src).toContain('LOOP 1 NO LONGER TOUCHES THE IRON');
  });

  it('every target of a light week carries the hold', () => {
    const src = read('src/data/api/fixtureModel.ts');
    expect(src).toContain('deloadActive ? { deloadHold: true } : {}');
  });
});

describe('4 · both sentences exist, in both of her languages', () => {
  const en = JSON.parse(read('src/i18n/locales/en.json'));
  const he = JSON.parse(read('src/i18n/locales/he.json'));
  it('deloadStart + deloadEnd carry observation → conclusion → action, en + he', () => {
    for (const lang of [en, he])
      for (const key of ['deloadStart', 'deloadEnd'])
        for (const part of ['observation', 'conclusion', 'action', 'text']) expect(lang.explain[key][part]).toBeTruthy();
  });

  it('explainChange narrates the open by its direction, and the close by its', () => {
    const base = { exerciseId: 'bb_bench_press', decision: 'deload', setsFrom: 3, setsTo: 3, bandFrom: [8, 10], bandTo: [8, 10], at: 0, kind: 'deload' };
    expect(explainChange({ ...base, loadFrom: 60, loadTo: 55 }).observation.key).toBe('explain.deloadStart.observation');
    expect(explainChange({ ...base, loadFrom: 55, loadTo: 60 }).observation.key).toBe('explain.deloadEnd.observation');
  });
});
