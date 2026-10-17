/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WRIST SWAPS ALONE AS IT SWAPS WITH THE PHONE — and the week always fits the wire.
 * (2026-10-17, the wrist-alone plan, stage 4; approved 2026-10-13, "כן מאשר")
 *
 * With the phone in her pocket the wrist offers Swap on the walk to the next lift (WT11b): the
 * phone's own options, true synonyms only, one tap, Undo for six seconds. With the phone in a locker
 * the button was not there — the options are the phone's to choose. Now the phone chooses them in
 * advance and puts them on the step the crossing leads into, each with what the wrist needs to show
 * it once chosen, and the options the phone would offer for it in turn; the wrist's engine applies
 * the phone's swap (`retargetPlanForSwap`) to the letter. `sync/theWristRunsWhatThePhoneRuns` plays
 * it on the watch's real engine (`swap-alone`, `phone-dies-then-swap`) and holds every option offered
 * at every crossing to the phone's.
 *
 * And because the whole week rides ONE message with a size limit, the plan is held to a budget and
 * gives up its extras — never a set — in the order they matter least (`fitPlanToWire`).
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck
//
import fs from 'fs';
import path from 'path';
import { buildCoachWatchPlan, fitPlanToWire, planBytes, WATCH_PLAN_BYTE_BUDGET } from '@/platform/watch/watchPlan';
import { buildMirrorSteps, buildPlanFromCoach, retargetPlanForSwap } from '@/state/stores/sessionStore';
import { wireSetup, wristSwapOptions } from '@/platform/watch/watchLoad';

const ROOT = path.resolve(__dirname, '..', '..');
const swift = (f: string) => fs.readFileSync(path.join(ROOT, 'targets', 'watch', f), 'utf8');
const reps = (ex: string, load: number | null, band: [number, number] = [8, 12]) => ({ kind: 'reps', ex, load, reps: band });
const DAY = {
  name: 'Upper A',
  blocks: [
    { rounds: 2, items: [reps('bb_bench_press', 60, [8, 10])] },
    { rounds: 2, items: [reps('bb_row', 50)] },
    { rounds: 2, items: [reps('db_curl', 12), reps('rope_pushdown', 25, [10, 15])] }, // a superset: every step a run start
    { rounds: 2, items: [reps('lateral_raise', 8, [12, 20])] },
  ],
};
const build = (sessions = [{ id: 'd1', ...DAY }]) => buildCoachWatchPlan({ sessions, nowMs: 0, restInterS: 90, restTransitionS: 120 });

describe('the options the wrist offers alone are the phone’s own', () => {
  const steps = build()!.workouts[0].steps;
  const own = buildPlanFromCoach(DAY);
  const live = buildMirrorSteps(own);

  it('⛔ on the step a crossing leads into — the first of each lift’s run — the very list the live mirror sends there', () => {
    steps.forEach((s, i) => {
      const runStart = i === 0 || steps[i - 1].exerciseId !== s.exerciseId;
      const expected = runStart ? live[i].swapOptions : [];
      expect({ at: i, offered: (s.swaps ?? []).map((c) => ({ id: c.id, name: c.name })) }).toEqual({ at: i, offered: expected });
    });
    expect(steps.some((s) => s.swaps?.length)).toBe(true);
  });

  it('each option arrives ready to stand in: its bar for the written weight, and what the phone offers for it in turn', () => {
    const lifts = [...new Set(own.map((s) => s.exerciseId))];
    expect(lifts.length).toBeGreaterThan(2);
    steps.forEach((s, i) => {
      for (const c of s.swaps ?? []) {
        expect(c.loadSetup ?? null).toEqual(wireSetup(c.id, s.targetWeight));
        // The phone, having swapped, would offer exactly this on the same crossing.
        const after = retargetPlanForSwap(own, [], i, c.id);
        expect({ choice: c.id, next: (c.swaps ?? []).map((o) => o.id) }).toEqual({ choice: c.id, next: buildMirrorSteps(after)[i].swapOptions.map((o) => o.id) });
      }
    });
  });

  it('true synonyms only, and never a lift already in the session — one definition for the frame and the plan', () => {
    const offered = wristSwapOptions('bb_row', ['bb_bench_press', 'bb_row', 'db_curl']);
    expect(offered.every((o) => !['bb_bench_press', 'bb_row', 'db_curl'].includes(o.id))).toBe(true);
    const store = fs.readFileSync(path.join(ROOT, 'src', 'state', 'stores', 'sessionStore.tsx'), 'utf8');
    expect(store).toContain('const swapOptions = ex ? wristSwapOptions(st.exerciseId, sessionExerciseIds, equipment) : [];');
    expect(store).not.toMatch(/swapChoices\(ex\.id/);
  });
});

describe('the wrist’s half, read from its source (compiled and RUN on a Mac by the instrument)', () => {
  const engine = swift('LocalWorkoutEngine.swift');
  const model = swift('WatchModel.swift');
  const fn = engine.slice(engine.indexOf('func swapNext(to id: String)'), engine.indexOf('func endRest()'));

  it('⛔ only on the walk to a lift, only to an option the phone offered, never to a lift already in the session', () => {
    expect(fn).toContain('state.phase == "rest_transition"');
    expect(fn).toContain('old.swaps?.first(where: { $0.id == id })');
    expect(fn).toContain('!state.steps.contains(where: { $0.exerciseId == id })');
  });

  it('the phone’s swap to the letter: every remaining step of the lift, its weights untouched, the old lift offered back whole', () => {
    expect(fn).toContain('for i in at..<state.steps.count where state.steps[i].exerciseId == old.exerciseId');
    // An assignment, not the comparison that decides whether the bar's breakdown still applies.
    expect(fn).not.toMatch(/targetWeight\s*=(?!=)/);
    expect(fn).not.toMatch(/targetReps\s*=(?!=)/);
    expect(fn).toContain('o.id == back.id ? back');
  });

  it('the crossing shows what the step offers, less any lift now in the session', () => {
    expect(engine).toContain('m.nextSwapOptions = offered.isEmpty ? nil : offered');
  });

  it('alone the wrist’s own engine swaps — and undoes — with the phone, the phone does, and silent, the wrist', () => {
    const swap = model.slice(model.indexOf('private func swap('), model.indexOf('private func resolveUndo('));
    expect(swap).toContain('engine.swapNext(to: exerciseId)');
    expect(swap).toContain('propose("swap_exercise", exerciseId: exerciseId)');
    const undo = model.slice(model.indexOf('func undoSwap()'), model.indexOf('// MARK: Watch-local cardio'));
    expect(undo).toContain('engine.swapNext(to: u.id)');
    expect(undo).toContain('propose("swap_exercise", exerciseId: u.id)');
  });
});

describe('⛔ the week always fits the one message it rides in', () => {
  const day = (i: number) => ({
    id: `d${i}`,
    name: `Day ${i}`,
    blocks: [
      { rounds: 5, items: [reps('bb_bench_press', 60)] },
      { rounds: 5, items: [reps('bb_back_squat', 100, [5, 8])] },
      { rounds: 5, items: [reps('bb_row', 50)] },
      { rounds: 5, items: [reps('bb_rdl', 80)] },
      { rounds: 5, items: [reps('db_shoulder_press', 16)] },
      { rounds: 5, items: [reps('lat_pulldown', 45)] },
      { rounds: 5, items: [reps('lateral_raise', 8, [12, 20])] },
    ],
  });
  const history = [{ id: 'h1', programDayId: 'x', startedAt: '2026-01-01T00:00:00.000Z', state: 'SAVED', earlyFinish: false, sets: ['bb_bench_press', 'bb_back_squat', 'bb_row', 'bb_rdl', 'db_shoulder_press', 'lat_pulldown', 'lateral_raise'].flatMap((ex) => [0, 1, 2].map((k) => ({ exerciseId: ex, setIndex: k, recommendedWeight: 50, recommendedReps: 8, actualWeight: 50, actualReps: 8, edited: false, persistedAt: '2026-01-01T00:10:00.000Z' }))) }];
  const heavy = buildCoachWatchPlan({ sessions: [0, 1, 2, 3, 4, 5].map(day), history, nowMs: 0, restInterS: 90, restTransitionS: 120 })!;

  it('a plan within the budget is sent exactly as built', () => {
    const p = build()!;
    expect(fitPlanToWire(p)).toBe(p);
  });

  it('a six-day week of heavy days is held under the budget — giving up extras before a single day', () => {
    expect(planBytes(heavy)).toBeGreaterThan(WATCH_PLAN_BYTE_BUDGET); // the case is real
    const fit = fitPlanToWire(heavy);
    expect(planBytes(fit)).toBeLessThanOrEqual(WATCH_PLAN_BYTE_BUDGET);
    // Whatever was given up, every set of every day that was kept is still there, as built.
    for (const w of fit.workouts) {
      const was = heavy.workouts.find((x) => x.id === w.id)!;
      expect(w.steps.map((s) => [s.exerciseId, s.targetWeight, s.targetReps])).toEqual(was.steps.map((s) => [s.exerciseId, s.targetWeight, s.targetReps]));
    }
    expect(fit.planId).not.toBe(heavy.planId); // a different plan is named differently
  });

  it('the order things are given up in: their nested options, the swaps, the warm-ups, last time, then the farthest day', () => {
    const at = (budget: number) => fitPlanToWire(heavy, budget);
    const has = (p, f) => p.workouts.some((w) => w.steps.some(f));
    const full = planBytes(heavy);
    // Just under the full size: only the nested options go.
    const a = at(full - 1);
    expect(has(a, (s) => s.swaps?.some((c) => c.swaps))).toBe(false);
    expect(has(a, (s) => s.swaps)).toBe(true);
    // Far below: swaps, ramps and last time gone before any day is dropped.
    const noSwaps = fitPlanToWire(heavy, planBytes(fitPlanToWire(heavy, full - 1)) - 1);
    expect(has(noSwaps, (s) => s.swaps)).toBe(false);
    expect(noSwaps.workouts.length).toBe(heavy.workouts.length);
    // And never below one day: the next workout is always sent.
    expect(at(1).workouts.length).toBe(1);
    expect(at(1).workouts[0].id).toBe('d0');
  });
});
