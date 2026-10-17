/**
 * ⛔ THE READY SCREEN SHOWS THE LOADS SHE TRAINS (founder 2026-09-28: *"מסך התוכנית מוכנה — מאשר,
 * שיהיה יפה ומרשים"*).
 *
 * The Ready screen now draws her week with its weights, and it runs BEFORE the profile is on disk —
 * so it reads `openingLoadsOf`, a pure copy of the engine's first-meeting seed chain. A pure copy is
 * a second derivation, and a second derivation is exactly how a screen comes to promise 60 kg over a
 * first set of 55. This law walks the real rails (`db` → `loadWeekPlan` → `sessionTargets`) and
 * holds every number on the Ready screen equal to the number Today prints for the same lift.
 */
// @ts-nocheck

import { db } from '@/data/local/db';
import { loadWeekPlan } from '@/data/local/weekPlan';
import { openingLoadsOf, openingTargetsOf, fixtureModel } from '@/data/api/fixtureModel';
import { previewWeekPlan } from '@/data/local/weekPlan';
import { addDay, addLift, blankDraft, sealAuthored, setLiftStartLoad } from '@/domain/planBuilder';

const PROFILE = {
  id: 'p1', name: 'Ofek', sex: 'male', units: 'kg', weightKg: 82, experience: 'intermediate',
  daysPerWeek: 2, bodyMap: {}, repBandByMuscle: {},
};

beforeEach(async () => {
  await db.clearAll();
  await db.saveProfile(PROFILE);
});

function loadsOnToday(plan): Record<string, number | null> {
  const out = {};
  for (const s of plan.sessions) for (const b of s.blocks) for (const i of b.items) {
    if (i.kind === 'reps' && !(i.ex in out)) out[i.ex] = i.load ?? null;
  }
  return out;
}

it('a week the model wrote loads for: the Ready screen and Today print the same number', async () => {
  let d = blankDraft('ready_e2e');
  d = addLift(d, 0, 'bb_bench_press');
  d = addLift(d, 0, 'db_row');
  d = addDay(d);
  d = addLift(d, 1, 'bb_back_squat');
  d = addLift(d, 1, 'pull_up');
  d = setLiftStartLoad(d, 0, 0, 80); // "לחיצת חזה 80×8" — the model wrote it
  const week = sealAuthored(d);
  await db.saveProgram(week);

  const ready = openingLoadsOf(week, PROFILE);
  const today = loadsOnToday(await loadWeekPlan());
  expect(Object.keys(today).sort()).toEqual(Object.keys(ready).sort());
  for (const ex of Object.keys(today)) expect({ ex, load: ready[ex] }).toEqual({ ex, load: today[ex] });
  expect(ready.bb_bench_press).toBe(80);
  expect(ready.pull_up).toBeNull(); // her body is the load
});

it('an engine week with no written loads: the seed is the same seed', async () => {
  const week = await fixtureModel.generateProgram(PROFILE);
  await db.saveProgram(week);
  const ready = openingLoadsOf(week, PROFILE);
  const today = loadsOnToday(await loadWeekPlan());
  for (const ex of Object.keys(today)) expect({ ex, load: ready[ex] }).toEqual({ ex, load: today[ex] });
});

it('⛔ the whole week the Ready screen draws IS the week Today draws — every row, band and set', async () => {
  const week = await fixtureModel.generateProgram(PROFILE);
  await db.saveProgram(week);
  const ready = previewWeekPlan(week, PROFILE);
  const today = await loadWeekPlan();
  expect(ready.sessions).toEqual(today.sessions);
});
