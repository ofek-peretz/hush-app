/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ENGINE AS SHE LIVES IT — an AI-written week, trained for twelve weeks, by three kinds of athlete.
 *
 * Founder, 2026-10-17: *"אני רוצה שתסתכל על המנוע ותראה האם לדעתך הוא ברמה הגבוהה ביותר מבחינת חווית
 * המשתמש וניהול המתאמן… לאחר מכן ארצה שתוודא האם המנוע פועל בדיוק לפי איך שאתה רואה לנכון."*
 *
 * Every other simulation here (`helpers/virtualAthlete`, `eightWeeksOfTraining`) trains a week the
 * ENGINE generated and regenerates it weekly. No athlete has trained that week since 2026-09-28: every
 * week is written by the model and sealed (`sealAuthored`), the engine may not rebuild it, and only
 * the loads move. This is that athlete — the real seam (`sessionTargets` → her sets → `sessionEarned`),
 * nothing stubbed but the clock.
 *
 * ── HOW SHE LOGS — the variable no simulation here had ever varied ──────────────────────────────
 *   · `top`    — she goes for the top of the range on every set, and logs what she did;
 *   · `shown`  — she does the number the stage shows her, no more, and logs it;
 *   · `tapper` — she presses Done: the set is logged as written, unless she truly fell short.
 * Her body is the same in all three (`helpers/virtualAthlete`'s model: reps fall ~3% of load per rep,
 * ~0.8 per set inside an exercise, ±0.8 seeded noise, novice gains decaying week by week).
 *
 * Hand-run report: `AUDIT_PRINT=1 npx jest theEngineAsSheLivesIt --testPathIgnorePatterns=/node_modules/`
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { fixtureModel } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import { exerciseById } from '@/data/exercises';
import { carryWeightForward } from '@/engine/v5/liveSession';
import { modelledLoadKg } from '@/domain/startingLoad';
import { draftFromCoachWeek } from '@/domain/coachDraft';
import { sealAuthored } from '@/domain/planBuilder';
import { rng } from '../helpers/virtualAthlete';
import { nextRung } from '@/engine/v5/grid';
import type { Profile, Session, SetLog } from '@/data/local/models';

const WEEKS = 12;
const PRINT = process.env.AUDIT_PRINT === '1';

/** The week the live model wrote on 2026-10-17 for a 4-day intermediate man (prompt v9), unchanged. */
const WEEK = {
  name: 'Upper / Lower',
  days: [
    { name: 'Upper A', lifts: [
      { ex: 'bb_bench_press', sets: 3, reps: [5, 8] }, { ex: 'cable_row', sets: 3 }, { ex: 'incline_db_press', sets: 3 },
      { ex: 'lat_pulldown', sets: 3 }, { ex: 'lateral_raise', sets: 3, reps: [12, 20] }, { ex: 'rope_pushdown', sets: 3, reps: [10, 15] },
      { ex: 'db_curl', sets: 3, reps: [10, 15] },
    ] },
    { name: 'Lower A', lifts: [
      { ex: 'bb_back_squat', sets: 3, reps: [5, 8] }, { ex: 'bb_rdl', sets: 3, reps: [6, 10] }, { ex: 'leg_press', sets: 3, reps: [10, 15] },
      { ex: 'seated_leg_curl', sets: 3, reps: [10, 15] }, { ex: 'standing_calf_raise', sets: 4, reps: [10, 15] },
    ] },
    { name: 'Upper B', lifts: [
      { ex: 'bb_overhead_press', sets: 3, reps: [6, 10] }, { ex: 'incline_db_row', sets: 3 }, { ex: 'machine_chest_press', sets: 3 },
      { ex: 'close_grip_pulldown', sets: 3 }, { ex: 'cable_lateral_raise', sets: 3, reps: [12, 20] }, { ex: 'overhead_triceps_ext', sets: 3, reps: [10, 15] },
      { ex: 'hammer_curl', sets: 3, reps: [10, 15] }, { ex: 'push_up', sets: 3 },
    ] },
    { name: 'Lower B', lifts: [
      { ex: 'hack_squat', sets: 3 }, { ex: 'hip_thrust', sets: 3 }, { ex: 'bulgarian_split_squat', sets: 3 },
      { ex: 'leg_curl', sets: 3, reps: [10, 15] }, { ex: 'seated_calf_raise', sets: 4, reps: [10, 15] },
    ] },
  ],
};

type Policy = 'top' | 'shown' | 'tapper';

export interface LiftLine {
  ex: string;
  /** The load she was handed at each occurrence (first set). */
  loads: number[];
  /** Her true 8-rep capacity at each occurrence — what a coach who could see inside her would load. */
  caps: number[];
  /** The reps she logged on set 1, each occurrence. */
  reps: number[];
  band: [number, number];
  /** Occurrences where the load went up / down from the one before. */
  raises: number;
  drops: number;
  /** Occurrences where the prescription asked for more reps than her body had on set 1. */
  overshoot: number;
}

const offersOf: Record<string, string[]> = {};

async function live(policy: Policy, seed = 7): Promise<Record<string, LiftLine>> {
  await db.clearAll();
  const r = rng(seed);
  const person = { sex: 'male' as const, weightKg: 80 };
  const profile: Profile = { units: 'kg', healthConnected: false, sex: 'male', weightKg: 80, daysPerWeek: 4, repBand: '8-12', experience: 'intermediate' } as Profile;
  await db.saveProfile(profile);
  const program = sealAuthored(draftFromCoachWeek(WEEK, { id: 'ai_week' })!)!;
  await db.saveProgram(program);

  // Her true capacity: the load she can do for 8 fresh reps — modelled for a man her size, 10% stronger
  // than the model's guess (an intermediate who has trained), and growing at a decaying novice rate.
  const cap: Record<string, number> = {};
  const capFor = (id: string) => (cap[id] ??= (modelledLoadKg(exerciseById(id)!, person) ?? 10) * 1.1);
  const canDo = (id: string, load: number | null, setIndex: number) => {
    const ex = exerciseById(id)!;
    const wear = setIndex * 0.8 + (r() - 0.5) * 1.6;
    if (ex.bodyweight || load == null) return Math.max(0, Math.round(12 - wear));
    const c = capFor(id);
    return Math.max(0, Math.round(8 + (c - load) / Math.max(0.4, c * 0.03) - wear));
  };

  const lines: Record<string, LiftLine> = {};
  let t = Date.now() - WEEKS * 7 * 86400000;
  const realNow = Date.now;
  Date.now = () => t;
  try {
    for (let w = 0; w < WEEKS; w++) {
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
        for (const step of plan) {
          const st = plan.find((s) => s.globalIndex === step.globalIndex)!;
          const load = st.target.recommendedWeight;
          // What the stage asks for: her rep target (2026-10-17 — the floor until it climbs).
          const shown = st.target.recommendedReps;
          const hi = st.target.repBandHi ?? shown;
          const body = canDo(st.exerciseId, load, st.exerciseSetIndex);
          const reps = policy === 'top' ? Math.min(body, hi) : Math.min(body, shown);
          sets.push({
            exerciseId: st.exerciseId, setIndex: st.exerciseSetIndex,
            recommendedWeight: load, recommendedReps: shown,
            actualWeight: load, actualReps: reps,
            // `tapper` pressed Done on every set she made; she only edits a set she fell short on.
            edited: policy === 'tapper' ? reps < shown : true,
            persistedAt: new Date(t + st.globalIndex * 180000).toISOString(),
            restBeforeS: st.exerciseSetIndex === 0 ? 120 : 90,
          });
          const line = (lines[st.exerciseId] ??= { ex: st.exerciseId, loads: [], caps: [], reps: [], band: [st.target.repBandLo, hi], raises: 0, drops: 0, overshoot: 0 });
          if (st.exerciseSetIndex === 0 && load == null && process.env.AUDIT_LOG) {
            // eslint-disable-next-line no-console
            console.log(`BW ${policy} w${w} ${st.exerciseId} shown ${shown} band ${st.target.repBandLo}-${hi} did ${reps}`);
          }
          if (st.exerciseSetIndex === 0 && load != null) {
            const prev = line.loads[line.loads.length - 1];
            if (prev != null && load > prev + 0.01) line.raises += 1;
            if (prev != null && load < prev - 0.01) line.drops += 1;
            line.loads.push(load);
            line.caps.push(+capFor(st.exerciseId).toFixed(1));
            line.reps.push(reps);
            if (body < shown) line.overshoot += 1;
          }
          plan = carryWeightForward(plan as never, st.globalIndex, load) as never;
        }
        const session: Session = { id: `s${w}_${day.id}`, programDayId: day.id, programDayName: day.name, startedAt: new Date(t).toISOString(), state: 'SAVED', earlyFinish: false, sets } as Session;
        await db.appendCompletedSession(session);
        await fixtureModel.sessionEarned!({ startedAtMs: Date.parse(session.startedAt) });
        t += 2 * 86400000;
      }
      // Her body adapts to the week she trained — the same decaying novice curve for every policy.
      for (const id of Object.keys(cap)) cap[id] *= 1 + 0.015 * Math.exp(-w / 10);
      t += 86400000;
    }
  } finally {
    Date.now = realNow;
  }
  // The changes the engine OFFERED her on this written week (`domain/swapOffers`) — a lift at the top
  // of its range with no load to add has only this axis left, so the offer is part of the outcome.
  offersOf[policy] = ((await db.loadPreferences()).swapOffers ?? []).map((o) => `${o.kind}:${o.from}->${o.to}`);
  if (process.env.AUDIT_LOG) {
    const st = await db.loadEngineV5();
    for (const id of process.env.AUDIT_LOG.split(',')) {
      const rows = (st?.changeLog ?? []).filter((c) => c.exerciseId === id).map((c) => `${c.decision ?? c.kind}:${c.loadFrom}->${c.loadTo}`);
      const hist = (st?.exercises?.[id]?.history ?? []).slice(0, 12).map((h) => `${h.sets?.map((x) => `${x.load}x${x.reps}`).join(',')}`);
      // eslint-disable-next-line no-console
      console.log(`LOG ${policy} ${id}: ${rows.join(' | ')}
   state ${JSON.stringify({ load: st?.exercises?.[id]?.load, band: st?.exercises?.[id]?.band })}
   history(newest first) ${hist.join(' / ')}`);
    }
  }
  return lines;
}

function summary(lines: Record<string, LiftLine>) {
  const loaded = Object.values(lines).filter((l) => l.loads.length > 0);
  const end = loaded.map((l) => l.loads[l.loads.length - 1] / l.caps[l.caps.length - 1]);
  // Every raise, as a share of the load it left — ACSM's 2–10%; the benchmark flags anything over ~10%.
  const jumps = loaded.flatMap((l) => l.loads.slice(1).map((x, i) => x / l.loads[i] - 1).filter((d) => d > 0.001));
  // A raise taken back within two occurrences — the yo-yo a coach would not prescribe.
  const yoyo = loaded.reduce((n, l) => n + l.loads.slice(2).filter((x, i) => l.loads[i + 1] > l.loads[i] && x < l.loads[i + 1]).length, 0);
  // Occurrences where she logged the TOP of her band on set 1 and the next load did not rise.
  const frozenAtTop = loaded.reduce((n, l) => n + l.reps.slice(0, -1).filter((r, i) => r >= l.band[1] && !(l.loads[i + 1] > l.loads[i])).length, 0);
  return {
    biggestJumpPct: Math.round(Math.max(0, ...jumps) * 100),
    jumpsOver10Pct: jumps.filter((d) => d > 0.1).length,
    jumps: jumps.length,
    yoyo,
    frozenAtTop,
    lifts: loaded.length,
    raisesPerLift: +(loaded.reduce((n, l) => n + l.raises, 0) / loaded.length).toFixed(1),
    neverRaised: loaded.filter((l) => l.raises === 0).map((l) => l.ex),
    /** Her last load as a share of what she could truly do for 8 — 1.0 is a coach who sees inside her. */
    endLoadVsCapacity: +(end.reduce((a, b) => a + b, 0) / end.length).toFixed(2),
    overshoots: loaded.reduce((n, l) => n + l.overshoot, 0),
  };
}

describe('the engine as she lives it — an AI week, twelve weeks, three ways of logging', () => {
  jest.setTimeout(600_000);
  const runs: Record<string, Record<string, LiftLine>> = {};

  beforeAll(async () => {
    for (const p of ['top', 'shown', 'tapper'] as Policy[]) runs[p] = await live(p);
  });

  it('runs — and prints the board when asked (`AUDIT_PRINT=1`)', async () => {
    if (PRINT) {
      for (const [p, lines] of Object.entries(runs)) {
        // eslint-disable-next-line no-console
        console.log(`\n══ ${p} ══ ${JSON.stringify(summary(lines))} offers ${JSON.stringify(offersOf[p] ?? [])}`);
        for (const l of Object.values(lines)) {
          // eslint-disable-next-line no-console
          console.log(`${l.ex.padEnd(22)} band ${l.band.join('-').padEnd(6)} loads ${l.loads.join(' ')} | cap ${l.caps[0]}→${l.caps[l.caps.length - 1]} | reps ${l.reps.join(' ')}`);
        }
      }
    }
    expect(Object.keys(runs.top).length).toBeGreaterThan(10);
  });

  /*
   * ⛔ THE FINDING THAT OPENED THE AUDIT. Before the climbing rep target (`ExerciseState.repTarget`),
   * an athlete who pressed Done — or did the number the stage showed — rose 0 times on 24 of 24 lifts
   * in twelve weeks and ended at 70–73% of what she could truly lift. The target walks her to the raise.
   */
  it.each(['tapper', 'shown'] as const)('⛔ the %s athlete PROGRESSES — no lift frozen by the way she logs', (p) => {
    const s = summary(runs[p]);
    expect(s.raisesPerLift).toBeGreaterThanOrEqual(1.8);
    expect(s.endLoadVsCapacity).toBeGreaterThanOrEqual(0.8);
    // Only the lightest isolation lifts, whose next weight is a doubling, may wait out twelve weeks.
    expect(s.neverRaised.length).toBeLessThanOrEqual(3);
  });

  it('⛔ the athlete who logs her real reps progresses close to her capacity, and never yo-yos', () => {
    const s = summary(runs.top);
    expect(s.raisesPerLift).toBeGreaterThanOrEqual(2.5);
    expect(s.endLoadVsCapacity).toBeGreaterThanOrEqual(0.85);
    expect(s.yoyo).toBe(0);
    // The overhead press froze at the top of its range for five sessions before F-24.
    expect(s.frozenAtTop).toBeLessThanOrEqual(10);
  });

  it('⛔ F-24 · no raise is bigger than a tenth of the load — unless one rung of the equipment itself is', () => {
    const offenders: string[] = [];
    for (const p of ['top', 'shown', 'tapper'] as const) {
      for (const l of Object.values(runs[p])) {
        const eq = exerciseById(l.ex)!.equipment;
        for (let i = 1; i < l.loads.length; i++) {
          const from = l.loads[i - 1];
          const to = l.loads[i];
          if (!(to > from) || to / from - 1 <= 0.1 + 1e-9) continue;
          if (to > nextRung(from, eq) + 1e-6) offenders.push(`${p} ${l.ex}: ${from} → ${to}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
