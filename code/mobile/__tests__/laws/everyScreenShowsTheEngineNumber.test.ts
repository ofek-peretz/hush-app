/**
 * EVERY SCREEN SHOWS THE ENGINE'S NUMBER — not its own arithmetic over the same history.
 *
 * ── Why this law exists ──────────────────────────────────────────────────────────────────────────
 * The engine can be perfect and the app still lie. Every screen that reports a decision has, sitting
 * right beside it, the raw session history — and from that history almost any of these figures can
 * be *re-derived*. A re-derivation looks identical on the happy path and diverges exactly where it
 * matters: after a mid-session correction, after a back-off, after a rotation, after the athlete
 * edited a weight herself. Then the screen states, in Hush's voice, something Hush did not decide.
 *
 * Nothing about that failure is visible in a render test, a typecheck, or a screenshot. So this law
 * BUILDS A REAL ATHLETE — several weeks of training through the real seam — and then asks, surface
 * by surface: does what this screen would render equal what the engine actually recorded?
 *
 * Each block below names the screen it protects, so a future change that re-derives a number has to
 * argue with the screen's own law rather than with a comment.
 */
// @ts-nocheck

// 

import { fixtureModel } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import { exerciseById } from '@/data/exercises';
import { applyLoop1, carryWeightForward } from '@/engine/v5/liveSession';
import { observedLoads, railCeilingFor, currentV5Targets, getSessionForwardV5, changeMoved } from '@/engine/v5/v5Engine';
import { getWeeklyPlan } from '@/domain/weeklyUpdate';
import { liftClimb, liftChanges } from '@/domain/liftDetail';
import { modelledLoadKg } from '@/domain/startingLoad';
import type { Profile, Program, Session, SetLog } from '@/data/local/models';
import fs from 'fs';
import path from 'path';

const TLO = 8;
const THI = 10;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Built { program: Program; sessionStarts: number[] }

/**
 * Six weeks of real training on the real seam, with Loop 1 live — long enough that the history
 * contains the very events a re-derivation gets wrong: in-session corrections, holds, back-offs and
 * at least one structural change.
 */
async function buildAthlete(): Promise<Built> {
  await db.clearAll();
  const r = rng(7);
  const cap: Record<string, number> = {};
  const capFor = (id: string) => (cap[id] ??= modelledLoadKg(exerciseById(id)!, { sex: 'female', weightKg: 60 }) ?? 10);
  const repsFor = (id: string, load: number | null, i: number) => {
    const ex = exerciseById(id)!;
    const wear = i * 0.8 + (r() - 0.5) * 1.6;
    if (ex.bodyweight || load == null) return Math.max(0, Math.round(10 - wear));
    const c = capFor(id);
    return Math.max(0, Math.round(TLO + (c - load) / Math.max(0.4, c * 0.03) - wear));
  };

  const profile: Profile = {
    units: 'kg', healthConnected: false,
    sex: 'female', weightKg: 60, daysPerWeek: 3, workoutMinutes: 55, repBand: '8-10',
    memberSince: '2026-01-05T00:00:00.000Z',
  };
  await db.saveProfile(profile);

  const sessionStarts: number[] = [];
  let t = Date.parse('2026-01-05T09:00:00.000Z');
  let program = await fixtureModel.generateProgram(profile);
  await db.saveProgram(program);

  for (let w = 0; w < 6; w++) {
    if (w > 0) { program = await fixtureModel.generateProgram(profile); await db.saveProgram(program); }
    const trained = new Set<string>();
    for (const day of program.days) {
      if (day.isRest || day.slots.length === 0) continue;
      const targets = await fixtureModel.sessionTargets({ programDayId: day.id, completedSessions: 0 });
      let plan = day.slots
        .flatMap((slot) => Array.from({ length: slot.setCount }, (_, s) => ({
          exerciseId: slot.exerciseId, globalIndex: 0, exerciseSetIndex: s,
          target: targets.find((x) => x.exerciseId === slot.exerciseId && x.setIndex === s)!,
        })))
        .map((s, i) => ({ ...s, globalIndex: i }));

      const sets: SetLog[] = [];
      const session: Session = {
        id: `s${w}_${day.id}`, programDayId: day.id, programDayName: day.name,
        startedAt: new Date(t).toISOString(), state: 'SAVED', earlyFinish: false, sets, trained: true,
      };
      const history = await db.loadHistory();
      const corrections: Record<string, number> = {};
      for (const step of plan) {
        const live = plan.find((s) => s.globalIndex === step.globalIndex)!;
        const load = live.target.recommendedWeight;
        const reps = repsFor(live.exerciseId, load, live.exerciseSetIndex);
        sets.push({
          exerciseId: live.exerciseId, setIndex: live.exerciseSetIndex,
          recommendedWeight: load, recommendedReps: live.target.recommendedReps,
          actualWeight: load, actualReps: reps, edited: false,
          persistedAt: new Date(t + live.globalIndex * 180000).toISOString(),
          restBeforeS: live.exerciseSetIndex === 0 ? 120 : 90,
        });
        const seen = [{ ...session, sets: [...sets] } as Session, ...history];
        corrections[live.exerciseId] ??= 0;
        const carried = carryWeightForward(plan as never, live.globalIndex, load);
        const l1 = applyLoop1(
          carried as never, live.globalIndex, load, reps, corrections[live.exerciseId],
          observedLoads(live.exerciseId, seen),
          railCeilingFor(live.exerciseId, live.target.repBandLo ?? TLO, seen),
        );
        if (l1.corrected) corrections[live.exerciseId] += 1;
        plan = l1.plan as never;
      }
      await db.appendCompletedSession(session);
      await fixtureModel.sessionEarned!({ startedAtMs: Date.parse(session.startedAt) });
      sessionStarts.push(Date.parse(session.startedAt));
      for (const s of day.slots) trained.add(s.exerciseId);
      t += 2 * 86400000;
    }
    for (const id of trained) if (cap[id] != null) cap[id] *= 1.012;
    t += 86400000;
  }
  return { program, sessionStarts };
}

jest.setTimeout(300000);

describe('every screen reaches the engine through the SEAM', () => {
  it('no screen imports the fixture model client directly', () => {
    // `app.model` is the one door (`data/api/modelClient`), and which client sits behind it is
    // chosen once, centrally. A screen that imports `fixtureModel` works today only because the
    // fixture IS the model — and the day a backend client is selected it keeps reading the local
    // engine while every other surface moves on. Nothing throws; the numbers just disagree.
    // `WorkoutDetail` did exactly this until 2026-07-28.
    //
    // Named PURE helpers that happen to live in that file (`estimateSessionMinutes` — the same
    // arithmetic the time cap enforces, and there must be only one copy of it) are not the client
    // and are not the concern here.
    const dir = path.join(__dirname, '..', '..', 'src', 'screens');
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name);
        if (entry.isDirectory()) { walk(p); continue; }
        if (!/\.tsx?$/.test(entry.name) || p.includes('dev')) continue;
        const src = fs.readFileSync(p, 'utf8');
        for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@\/data\/api\/fixtureModel'/g)) {
          if (/\bfixtureModel\b/.test(m[1])) offenders.push(path.relative(dir, p));
        }
      }
    };
    walk(dir);
    expect({ bypassingTheSeam: offenders }).toEqual({ bypassingTheSeam: [] });
  });
});

describe('the app and the engine agree, after six weeks of real training', () => {
  let built: Built;
  beforeAll(async () => { built = await buildAthlete(); });

  it('the athlete really did produce the hard cases — corrections, holds and moves', () => {
    // A law that ran on a trivial history would pass by being vacuous. This is the guard on the
    // guard: the fixture must actually contain the events a re-derivation gets wrong.
    return db.loadEngineV5().then((state) => {
      const log = state?.changeLog ?? [];
      expect(log.length).toBeGreaterThan(5);
      expect(log.some((c) => c.kind == null && (c.loadTo ?? 0) > (c.loadFrom ?? 0))).toBe(true); // a raise
      expect(built.sessionStarts.length).toBeGreaterThan(10);
    });
  });

  // ── SessionFlow (§3.3) — the prescription on the stage ─────────────────────────────────────────
  it('SessionFlow · every load on the stage is the engine state, not a seed or a last-logged weight', async () => {
    const targets = await fixtureModel.sessionTargets({ programDayId: built.program.days[0].id, completedSessions: 0 });
    const engine = await currentV5Targets([]);
    const wrong: string[] = [];
    for (const slot of built.program.days.flatMap((d) => d.slots)) {
      const st = engine[slot.exerciseId];
      if (!st) continue; // an unmanaged / supplemental lift falls back to the seed by design
      const t0 = targets.find((x) => x.exerciseId === slot.exerciseId && x.setIndex === 0);
      if (!t0) { wrong.push(`${slot.exerciseId}: no target emitted`); continue; }
      if (t0.recommendedWeight !== st.weight) wrong.push(`${slot.exerciseId}: stage ${t0.recommendedWeight} vs engine ${st.weight}`);
      if (t0.repBandLo !== st.reps || t0.repBandHi !== st.bandHi) wrong.push(`${slot.exerciseId}: band [${t0.repBandLo},${t0.repBandHi}] vs engine [${st.reps},${st.bandHi}]`);
    }
    expect({ disagreements: wrong }).toEqual({ disagreements: [] });
  });

  it('SessionFlow · every renderable set of every slot has a real target (no silent neutral fallback)', async () => {
    // buildPlan renders `slot.setCount` sets and falls back to a null-weight/reps-8 neutral target
    // for any set it cannot match — which would drop her load and band without a word. Loop 3 can
    // push a slot to 5 sets, so the emitted count has to follow the programme, not a constant.
    const missing: string[] = [];
    for (const day of built.program.days) {
      const targets = await fixtureModel.sessionTargets({ programDayId: day.id, completedSessions: 0 });
      for (const slot of day.slots) {
        for (let s = 0; s < slot.setCount; s++) {
          if (!targets.some((x) => x.exerciseId === slot.exerciseId && x.setIndex === s)) {
            missing.push(`${day.name}/${slot.exerciseId} set ${s + 1} of ${slot.setCount}`);
          }
        }
      }
    }
    expect({ uncovered: missing }).toEqual({ uncovered: [] });
  });

  it('SessionFlow · the reason arrow agrees with the decision the engine actually made', async () => {
    // "↑ 2.5" beside a load is Hush claiming it raised her. The claim is computed by comparing the
    // prescription to her LAST LOGGED weight — which is not the engine's `loadFrom` whenever Loop 1
    // moved the load mid-session, and Loop 1 moves the load constantly. Where the engine logged a
    // move for a lift, the arrow must point the same way and carry the same size.
    const state = await db.loadEngineV5();
    const log = state?.changeLog ?? [];
    const latest = new Map<string, (typeof log)[number]>();
    for (const c of log) if (c.kind == null && c.loadFrom != null && c.loadTo != null) latest.set(c.exerciseId, c);
    expect(latest.size).toBeGreaterThan(0);

    const targets = await fixtureModel.sessionTargets({ programDayId: built.program.days[0].id, completedSessions: 0 });
    const wrong: string[] = [];
    for (const [id, c] of latest) {
      const t0 = targets.find((x) => x.exerciseId === id && x.setIndex === 0);
      if (!t0 || t0.reasonType == null) continue; // silent is always allowed (R7)
      const engineDir = (c.loadTo ?? 0) > (c.loadFrom ?? 0) ? 'increase' : 'decrease';
      if (t0.reasonType !== engineDir) wrong.push(`${id}: says "${t0.reasonType}", engine decided "${engineDir}" (${c.loadFrom}→${c.loadTo})`);
    }
    expect({ contradictions: wrong }).toEqual({ contradictions: [] });
  });

  // ── Record / Complete (§3.3b, §2.5) — what the workout earned ─────────────────────────────────
  it('Record + Complete · the forward loads are the engine\'s stamped fold, for every session', async () => {
    for (const at of built.sessionStarts) {
      const viaSeam = (await fixtureModel.sessionForward?.({ startedAtMs: at })) ?? {};
      const viaEngine = await getSessionForwardV5(at);
      expect({ at, forward: viaSeam }).toEqual({ at, forward: viaEngine });
    }
  });

  it('Complete · a workout that changed nothing says nothing (R7) — never an invented change', async () => {
    /*
     * ⛔ TIGHTENED 2026-08-12, and the loosening is the fix (founder: *"כתוב 12 שינויים בזמן שהיו רק
     * 6 תרגילים … כל דבר שנמצא ב-HOLD זה לא שינוי!"*).
     *
     * This pinned "a line for every stamped entry", which let the ledger draw a HOLD and a
     * muscle-keyed volume move as changes — twelve rows for a six-lift session, half of them
     * announcing that nothing happened. `getSessionEarnedV5` now returns only entries where a
     * number actually MOVED (`changeMoved`), so the right ceiling is the stamped entries that pass
     * the same predicate.
     *
     * ⚠️ THE LAW'S OWN CLAIM IS UNTOUCHED AND IS THE HALF THAT MATTERED: the screen may never show
     * a line the fold did not stamp. It may now show fewer, which is what R7 asks for.
     */
    const state = await db.loadEngineV5();
    const real = (state?.changeLog ?? []).filter((c) => c.kind !== 'volume' && changeMoved(c));
    const stamped = new Set((state?.changeLog ?? []).map((c) => c.at));
    for (const at of built.sessionStarts) {
      const earned = (await fixtureModel.sessionEarned?.({ startedAtMs: at })) ?? [];
      const moved = real.filter((c) => c.at === at).length;
      expect({ at, lines: earned.length, engineDecided: stamped.has(at) })
        .toEqual({ at, lines: moved, engineDecided: stamped.has(at) });
    }
  });

  it('⛔ …and a HOLD is never one of them, nor a MUSCLE', async () => {
    /*
     * The two faults he counted, asserted directly on the seam. `getSessionForwardV5` twenty lines
     * from `getSessionEarnedV5` had excluded holds since the day it was written — *"a hold is not a
     * change (R7)"* — and the earned list had never asked the same question.
     */
    const state = await db.loadEngineV5();
    const log = state?.changeLog ?? [];
    expect(log.some((c) => !changeMoved(c))).toBe(true); // the fixture really does hold some lifts
    for (const at of built.sessionStarts) {
      const earned = (await fixtureModel.sessionEarned?.({ startedAtMs: at })) ?? [];
      const held = log.filter((c) => c.at === at && !changeMoved(c)).map((c) => c.exerciseId);
      const muscles = log.filter((c) => c.at === at && c.kind === 'volume').map((c) => c.exerciseId);
      for (const id of [...held, ...muscles]) {
        expect({ at, id, drawn: earned.some((e) => e.slotId === id) }).toEqual({ at, id, drawn: false });
      }
    }
  });

  // ── Weekly Update (§3.6) + Home's briefing (§3.1) ──────────────────────────────────────────────
  it('Weekly Update · every lift row carries the engine\'s current load and band, never a recomputation', async () => {
    const view = await getWeeklyPlan(built.program);
    expect(view).not.toBeNull();
    const engine = await currentV5Targets([]);
    const wrong: string[] = [];
    for (const w of view!.workouts) for (const l of w.lifts) {
      const st = engine[l.exerciseId];
      if (!st) continue;
      if (l.loadKg !== st.weight) wrong.push(`${l.exerciseId}: row ${l.loadKg} vs engine ${st.weight}`);
      if (l.repRange && (l.repRange[0] !== st.reps || l.repRange[1] !== st.bandHi)) wrong.push(`${l.exerciseId}: row band ${l.repRange} vs engine [${st.reps},${st.bandHi}]`);
    }
    expect({ disagreements: wrong }).toEqual({ disagreements: [] });
  });

  it('Weekly Update · the set count shown is the PROGRAMME\'s, after the time cap trimmed it', async () => {
    // `ExerciseState.sets` is vestigial (always the day-one 4). A row that read it would tell her
    // four sets while the workout in front of her holds three or five.
    const view = await getWeeklyPlan(built.program);
    const byEx = new Map(built.program.days.flatMap((d) => d.slots).map((s) => [s.exerciseId, s.setCount]));
    const wrong = (view!.workouts.flatMap((w) => w.lifts) ?? [])
      .filter((l) => byEx.has(l.exerciseId) && l.sets !== byEx.get(l.exerciseId))
      .map((l) => `${l.exerciseId}: row ${l.sets} vs programme ${byEx.get(l.exerciseId)}`);
    expect({ disagreements: wrong }).toEqual({ disagreements: [] });
  });

  it('Home + Weekly Update · a lift is marked "changed" only where the engine logged a change', async () => {
    const view = await getWeeklyPlan(built.program);
    const state = await db.loadEngineV5();
    const log = state?.changeLog ?? [];
    // Home takes its `changedIds` from exactly this view, so proving the view is honest proves both.
    for (const l of view!.workouts.flatMap((w) => w.lifts)) {
      if (!l.change) continue;
      const known = log.some((c) => c.exerciseId === l.exerciseId || c.toExercise === l.exerciseId);
      expect({ exercise: l.exerciseId, inChangeLog: known }).toEqual({ exercise: l.exerciseId, inChangeLog: true });
    }
  });

  // ── Progress · Lift detail (§3.2b) ────────────────────────────────────────────────────────────
  it('Lift detail · every "all changes" row is a decision the engine logged — no more, no fewer', async () => {
    const state = await db.loadEngineV5();
    const log = state?.changeLog ?? [];
    const ids = [...new Set(log.filter((c) => c.kind == null).map((c) => c.exerciseId))];
    expect(ids.length).toBeGreaterThan(0); // the fixture must exercise this surface
    for (const id of ids) {
      const moves = log.filter((c) => c.exerciseId === id && c.kind == null);
      const rows = liftChanges(log, id).filter((c) => c.kind == null);
      expect({ id, rows: rows.length }).toEqual({ id, rows: moves.length });
      // …each row carries the engine's own from/to, not a delta recomputed from her history…
      const key = (c: { at?: number; atMs?: number; loadFrom: number | null; loadTo: number | null }) =>
        `${c.at ?? c.atMs}:${c.loadFrom}→${c.loadTo}`;
      expect({ id, rows: rows.map(key).sort() }).toEqual({ id, rows: moves.map(key).sort() });
      // …and the list reads newest first, which is the order she thinks in.
      const times = rows.map((c) => c.atMs);
      expect({ id, newestFirst: times.every((v, i) => i === 0 || v <= times[i - 1]) })
        .toEqual({ id, newestFirst: true });
    }
  });

  it('Lift detail · the CLIMB is her performance, and it never draws a dip it does not mean', async () => {
    // The climb is deliberately NOT the changeLog: it is what she lifted, per training day, as a
    // running max. That is a fact about her, not a decision about her — the one figure on these
    // surfaces that is right to read from raw history. What it must never do is fall.
    const history = await db.loadHistory();
    const ids = [...new Set(history.flatMap((s) => s.sets.map((l) => l.exerciseId)))];
    for (const id of ids) {
      const climb = liftClimb(history, id);
      const values = climb.points.map((p) => p.value);
      expect({ id, monotonic: values.every((v, i) => i === 0 || v >= values[i - 1]) })
        .toEqual({ id, monotonic: true });
      for (const p of climb.points) expect(Number.isFinite(p.value)).toBe(true);
    }
  });
});
