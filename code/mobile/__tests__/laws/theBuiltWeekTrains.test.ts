/**
 * ════ A WEEK SHE BUILT, TRAINS — end to end, on the production rails ════
 *
 * The builder's whole architecture is that a sealed draft is an ordinary authored `Program`: it
 * rides `hush.program`, `loadWeekPlan` converts it, `coachSession` runs it, `sessionTargets`
 * seeds every lift she has no history on, and the live builder gives her compounds their ramp.
 * This law walks that exact chain — no mocks of the rails themselves — so "the builder works"
 * is a statement about the machine, not about the screen.
 */
// @ts-nocheck

import { db } from '@/data/local/db';
import { loadWeekPlan } from '@/data/local/weekPlan';
import { coachSession, coachWorkoutId } from '@/domain/coachWeek';
import { addDay, addLift, blankDraft, sealAuthored, setLiftSets } from '@/domain/planBuilder';
import { buildPlanFromCoach, warmupOffer } from '@/state/stores/sessionStore';
import { engineMayRebuild } from '@/state/stores/appStore';

const PROFILE = {
  id: 'p1', name: 'Noa', sex: 'female', units: 'kg', weightKg: 62,
  daysPerWeek: 2, bodyMap: {}, repBandByMuscle: {},
};

beforeEach(async () => {
  await db.clearAll();
  await db.saveProfile(PROFILE);
});

function builtWeek() {
  let d = blankDraft('built_e2e');
  d = addLift(d, 0, 'bb_bench_press');
  d = addLift(d, 0, 'db_row');
  d = setLiftSets(d, 0, 0, 6); // above F-1's ceiling — legal on HER week
  d = addDay(d);
  d = addLift(d, 1, 'bb_back_squat'); // legs once a week — her call, the founder's own case
  return sealAuthored(d);
}

it('seals, saves, survives the gate, and loads as her week', async () => {
  const sealed = builtWeek();
  expect(sealed.authored).toBe('athlete_or_coach');
  await db.saveProgram(sealed);
  expect(engineMayRebuild(await db.loadProgram())).toBe(false);

  const plan = await loadWeekPlan();
  expect(plan).not.toBeNull();
  expect(plan.sessions).toHaveLength(2);
  expect(plan.pricing).toBe('engine'); // priced by the one arithmetic Today and the cap share
});

it('every lift she wrote gets a load she can lift — smart seeds, no history needed', async () => {
  await db.saveProgram(builtWeek());
  const plan = await loadWeekPlan();
  const lifts = plan.sessions.flatMap((s) => s.blocks.flatMap((b) => b.items.filter((i) => i.kind === 'reps')));
  expect(lifts).toHaveLength(3);
  for (const lift of lifts) {
    expect(lift.load).toBeGreaterThan(0); // seeded from sex × bodyweight, snapped to real iron
    expect(lift.reps[0]).toBeGreaterThan(0);
  }
});

it('her 6-set lift carries all six sets into the session, and no bridge is written for her', async () => {
  await db.saveProgram(builtWeek());
  const plan = await loadWeekPlan();
  const steps = buildPlanFromCoach(coachSession(plan, coachWorkoutId(0)));

  const bench = steps.filter((s) => s.exerciseId === 'bb_bench_press' && !s.warmup);
  expect(bench).toHaveLength(6); // sessionTargets sizes from HER largest slot, not F-1
  expect(bench.every((s) => s.target?.recommendedWeight > 0)).toBe(true);

  /* ⛔ HER WEEK GETS NO RAMP EITHER (founder 2026-08-30) — the ruling is about the athlete, not
     about which builder made the plan, so an authored week and an engine week arrive identically
     bare. She is offered bridges at the station (`warmupOffer`); nothing is decided for her here.
     The offer's own rules, including the 62 kg athlete whose bench seeds at the EMPTY BAR and can
     therefore be offered nothing, live in `theWarmupIsABridgeNotAMeasurement` §5. */
  expect(steps.filter((s) => s.warmup)).toHaveLength(0);
  expect(warmupOffer(steps, 0)).toBeNull(); // her session opens on a lift with no road below it
  const rowAt = steps.findIndex((s) => s.exerciseId === 'db_row');
  expect(warmupOffer(steps, rowAt)?.ramp.length).toBeGreaterThan(0); // …but the row is offered one
});
