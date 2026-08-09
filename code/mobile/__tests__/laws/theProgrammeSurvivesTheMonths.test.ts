/**
 * THE PROGRAMME SURVIVES THE MONTHS.
 *
 * ── Why this law exists ──────────────────────────────────────────────────────────────────────────
 * Every other engine test asks whether one decision is right. None of them asked what happens when
 * ten weeks of those decisions are stacked on top of each other, and that is where the engine's real
 * defects lived — not in any single loop, but in the way two correct loops fed each other.
 *
 * This drives the REAL seam — `generateProgram` → `sessionTargets` → Loop 1 live → append → fold →
 * regenerate — for virtual athletes who get stronger week by week, and then asks the only three
 * questions that matter to the person doing the training:
 *
 *   1. **Can she lift what she is handed?** Not one prescribed load may sit above what B-1 models
 *      for her by a margin no correction can walk back.
 *   2. **Is any lift a dead end?** A lift pinned on the lightest weight the equipment offers, unable
 *      to make her band, occurrence after occurrence, is a dead exercise in every session.
 *   3. **Is the contract kept?** She was promised N sets in `[Tlo, Thi]`. Sets BELOW `Tlo` are the
 *      ones that matter most — a set she could not complete is a failure of the prescription, where
 *      a set above `Thi` is only a light one.
 *
 * ── What it caught (2026-07-28, sixteen weeks × six athletes × four seeds) ────────────────────────
 * Before the fixes this law is written against: **35% of all sets came in under `Tlo`** — for the
 * lightest woman, **57%**. 44 lifts finished above her capacity and 66 were pinned at an equipment
 * floor they could never leave. The causes were four, and every one of them was an interaction:
 *   · the stall ROTATION had no loadability check, so it preferentially rotated a light athlete onto
 *     the very barbell lifts the assembler had refused her (they were the lifts she had "gone
 *     longest without" precisely BECAUSE it refused them);
 *   · a lift that reached its floor could never rotate out (`isRepeatedStall` needs an occurrence
 *     lower than the current load, and there is none below the floor);
 *   · the reps-per-rung fit paired set 1 against set 4 across occurrences, underestimating her slope
 *     and making every Loop 1 correction too big;
 *   · S-28's "no micro-loading" test was absolute where the fact is relative, so it never fired on
 *     the light cables and machines where the rung is half her load.
 *
 * The thresholds below are deliberately loose — this is a floor under quality, not a tuning target.
 * The fixed engine clears them with a wide margin; the engine before the fixes fails every one.
 */
// @ts-nocheck

// 

import { fixtureModel } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import { exerciseById } from '@/data/exercises';
import { applyLoop1, carryWeightForward } from '@/engine/v5/liveSession';
import { observedLoads, railCeilingFor } from '@/engine/v5/v5Engine';
import { modelledLoadKg } from '@/domain/startingLoad';
import { loadFloor } from '@/engine/v5/grid';
import type { Profile, Program, Session, SetLog } from '@/data/local/models';

/** Deterministic — a law may not pass or fail by luck. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TLO = 8;
const THI = 10;
const WEEKS = 10;

interface Person { label: string; sex: 'male' | 'female'; weightKg: number; days: number; minutes: number; capRatio: number; seed: number }

/**
 * The athletes who broke it. A light woman is the case the engine got wrong, because every equipment
 * floor and every rung is a larger fraction of her load; a man near the middle of the model is the
 * case that must not regress while she is fixed.
 */
const PEOPLE: Person[] = [
  { label: 'woman 52 kg · 4 days · weaker than the model assumed', sex: 'female', weightKg: 52, days: 4, minutes: 45, capRatio: 0.7, seed: 22 },
  { label: 'woman 58 kg · 3 days', sex: 'female', weightKg: 58, days: 3, minutes: 50, capRatio: 1.0, seed: 11 },
  { label: 'man 80 kg · 4 days', sex: 'male', weightKg: 80, days: 4, minutes: 60, capRatio: 1.0, seed: 33 },
];

interface Occurrence { load: number; cap: number; reps: number[]; floor: number }

/**
 * Ten weeks of training. Her TRUE capacity on a lift is the load at which she gets exactly `Tlo`
 * fresh reps; reps fall about 3% of load per rep (the rep-max relationship), another ~0.8 per set
 * from fatigue, and she gains strength week by week at a decaying novice rate. Nothing here models
 * the engine — it only performs what the engine asks for and records what happened.
 */
async function train(p: Person): Promise<Record<string, Occurrence[]>> {
  await db.clearAll();
  const r = rng(p.seed);
  const cap: Record<string, number> = {};
  const bwCap: Record<string, number> = {};
  const capFor = (id: string) => (cap[id] ??= (modelledLoadKg(exerciseById(id)!, p) ?? 10) * p.capRatio);
  const bwCapFor = (id: string) => (bwCap[id] ??= Math.max(2, Math.round(6 * p.capRatio + (p.sex === 'male' ? 4 : 0))));
  const repsFor = (id: string, load: number | null, setIndex: number) => {
    const ex = exerciseById(id)!;
    const wear = setIndex * 0.8 + (r() - 0.5) * 1.6;
    if (ex.bodyweight || load == null) return Math.max(0, Math.round(bwCapFor(id) + 4 - wear));
    const c = capFor(id);
    return Math.max(0, Math.round(TLO + (c - load) / Math.max(0.4, c * 0.03) - wear));
  };

  const profile: Profile = {
    units: 'kg', goal: 'build_muscle', healthConnected: false,
    sex: p.sex, weightKg: p.weightKg, daysPerWeek: p.days, workoutMinutes: p.minutes, repBand: '8-10',
  };
  await db.saveProfile(profile);

  const trace: Record<string, Occurrence[]> = {};
  let t = Date.parse('2026-01-05T09:00:00.000Z');
  let program: Program = await fixtureModel.generateProgram(profile);
  await db.saveProgram(program);

  for (let w = 0; w < WEEKS; w++) {
    if (w > 0) {
      program = await fixtureModel.generateProgram(profile); // the weekly roll — Loop 3 reshapes here
      await db.saveProgram(program);
    }
    const trained = new Set<string>();
    for (const day of program.days) {
      if (day.isRest || day.slots.length === 0) continue;
      const targets = await fixtureModel.sessionTargets({ programDayId: day.id, completedSessions: 0 });
      let plan = day.slots
        .flatMap((slot) =>
          Array.from({ length: slot.setCount }, (_, s) => ({
            exerciseId: slot.exerciseId,
            globalIndex: 0,
            exerciseSetIndex: s,
            target:
              targets.find((x) => x.exerciseId === slot.exerciseId && x.setIndex === s) ??
              { exerciseId: slot.exerciseId, setIndex: s, recommendedWeight: null, recommendedReps: TLO, repBandLo: TLO, repBandHi: THI },
          })),
        )
        .map((s, i) => ({ ...s, globalIndex: i }));

      const sets: SetLog[] = [];
      const session: Session = {
        id: `s${w}_${day.id}`, programDayId: day.id, programDayName: day.name,
        startedAt: new Date(t).toISOString(), state: 'SAVED', earlyFinish: false, sets,
      };
      const history = await db.loadHistory();
      const corrections: Record<string, number> = {};

      for (const step of plan) {
        const live = plan.find((s) => s.globalIndex === step.globalIndex)!; // Loop 1 may have moved it
        const load = live.target.recommendedWeight;
        const reps = repsFor(live.exerciseId, load, live.exerciseSetIndex);
        sets.push({
          exerciseId: live.exerciseId, setIndex: live.exerciseSetIndex,
          recommendedWeight: load, recommendedReps: live.target.recommendedReps,
          actualWeight: load, actualReps: reps, edited: false,
          persistedAt: new Date(t + live.globalIndex * 180000).toISOString(),
          restBeforeS: live.exerciseSetIndex === 0 ? 120 : 90,
        });
        // Exactly the call sequence sessionStore makes on "Complete set".
        const seen = [{ ...session, sets: [...sets] } as Session, ...history];
        const grid = observedLoads(live.exerciseId, seen);
        const rail = railCeilingFor(live.exerciseId, live.target.repBandLo ?? TLO, seen);
        corrections[live.exerciseId] ??= 0;
        const carried = carryWeightForward(plan as never, live.globalIndex, load);
        const l1 = applyLoop1(carried as never, live.globalIndex, load, reps, corrections[live.exerciseId], grid, rail);
        if (l1.corrected) corrections[live.exerciseId] += 1;
        plan = l1.plan as never;
      }

      await db.appendCompletedSession(session);
      await fixtureModel.sessionEarned!({ startedAtMs: Date.parse(session.startedAt) }); // folds the occurrence

      for (const slot of day.slots) {
        const ex = exerciseById(slot.exerciseId)!;
        const mine = sets.filter((s) => s.exerciseId === slot.exerciseId);
        if (mine.length === 0) continue;
        trained.add(slot.exerciseId);
        if (!ex.bodyweight && mine[0].actualWeight != null) {
          (trace[slot.exerciseId] ??= []).push({
            load: mine[0].actualWeight, cap: capFor(slot.exerciseId),
            reps: mine.map((s) => s.actualReps), floor: loadFloor(ex.equipment),
          });
        }
      }
      t += 2 * 86400000;
    }
    for (const id of trained) {
      const gain = (0.022 * Math.exp(-w / 10)) / Math.max(1, p.days / 2); // novice gains, decaying
      if (cap[id] != null) cap[id] *= 1 + gain;
      if (bwCap[id] != null && r() < gain * 12) bwCap[id] += 1;
    }
    t += 86400000;
  }
  return trace;
}

jest.setTimeout(300000);

describe(`${WEEKS} weeks of real training, on the real seam`, () => {
  for (const p of PEOPLE) {
    describe(p.label, () => {
      let trace: Record<string, Occurrence[]>;
      beforeAll(async () => { trace = await train(p); });

      it('never LEAVES her on a load she cannot lift', () => {
        // 1.3× what B-1 models for her is not a hard session — it is a lift she cannot perform.
        //
        // TWO occurrences running, not one, and the difference is the whole design. Loop 1 exists to
        // catch a load that is wrong the moment she meets it, from set 1 — so a single occurrence
        // that opens too heavy and is corrected inside the session is the engine WORKING, not
        // failing. (A full simulated year produced exactly one: an unpriced rung on a light cable
        // opened 50% high, she got 3 reps, and Loop 1 had her back down for sets 2 and 3.) What must
        // never happen is that she comes back and finds it there again.
        const over = Object.entries(trace)
          .filter(([, tr]) => tr.length >= 3)
          .map(([id, tr]) => ({ id, ratios: tr.slice(-2).map((o) => o.load / o.cap) }))
          .filter((x) => x.ratios.length === 2 && x.ratios.every((r) => r > 1.3))
          .map((x) => `${x.id} at ${x.ratios.map((r) => `${(r * 100).toFixed(0)}%`).join(' then ')} of her capacity`);
        expect({ leftAboveHer: over }).toEqual({ leftAboveHer: [] });
      });

      it('leaves no lift dead on the floor of its equipment', () => {
        // FOUR occurrences running, on the lightest weight that exists, with every set under Tlo.
        //
        // Four, not three, and the number is the engine's own patience rather than a slack tolerance.
        // The register forbids acting on a first miss (S-24/S-33: "a first miss holds, a second
        // acts"), and an occurrence she could not get a single rep out of consumes another before
        // the stall read can even reach it. So hold → hold → rotate is the CORRECT worst case, and a
        // window of three would flag the engine behaving exactly as ratified. A fourth occurrence at
        // the floor means she was handed the lift again after Hush had every signal it needs.
        const dead = Object.entries(trace)
          .filter(([, tr]) => tr.length >= 4)
          .filter(([, tr]) => tr.slice(-4).every((o) => o.load <= o.floor + 1e-6 && o.reps.every((n) => n < TLO)))
          .map(([id]) => id);
        expect({ dead }).toEqual({ dead: [] });
      });

      it('keeps the contract: fewer than a quarter of her sets come in under her target reps', () => {
        // The settled tail only — the first weeks are the engine finding her, which is its job.
        let under = 0, total = 0;
        for (const tr of Object.values(trace)) {
          if (tr.length < 3) continue;
          for (const occ of tr.slice(Math.ceil(tr.length / 2))) for (const n of occ.reps) {
            total += 1;
            if (n < TLO) under += 1;
          }
        }
        expect(total).toBeGreaterThan(100); // the law must actually have looked at something
        expect({ shortOfTarget: `${((100 * under) / total).toFixed(1)}%` })
          .toEqual({ shortOfTarget: expect.stringMatching(/^(\d|1\d|2[0-4])\.\d%$/) });
      });
    });
  }
});
