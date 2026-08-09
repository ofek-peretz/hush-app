/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THE APP ITSELF COSTS — move 3 of the plan: everything instant except the build.
 *
 * ⛔ FOUNDER: *"Spotify plays instantly. We think for 20 seconds."* The coach's latency is known and
 * bounded. What has never been measured is OURS — the work the app does on its own, with an athlete
 * who has been training for months rather than the three-session fixtures every test uses.
 *
 * ── THE BUDGET ──────────────────────────────────────────────────────────────────────────────────
 * 16ms is one frame at 60fps. Anything a screen does on mount that costs more than that drops
 * frames; anything past ~100ms is felt as a pause. These are pure functions, so they are the FLOOR
 * of what each screen costs — real cost adds the db read and the render on top.
 *
 * Not a test: `.sim.ts`, run by hand, prints numbers to read.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import { coachFacts } from '@/domain/coachFacts';
import { coachWeek, coachRows } from '@/domain/coachWeek';
import { lastTimeOn } from '@/domain/lastTimeOn';
import { coachBrief } from '@/domain/coachEarned';
import { liftClimb } from '@/domain/liftDetail';
import type { CoachPlan } from '@/domain/coachPlan';
import type { CoachDecision } from '@/domain/coachLog';
import type { Profile, Session, SetLog } from '@/data/local/models';

const LIFTS = ['bb_bench_press', 'lat_pulldown', 'db_row', 'bb_back_squat', 'hip_thrust', 'face_pull', 'db_curl', 'leg_press'];

const HER: Profile = {
  sex: 'female', age: 34, weightKg: 62, experience: 'intermediate', daysPerWeek: 4,
  workoutMinutes: 60, units: 'kg', goal: 'build_muscle', healthConnected: false,
};

/** A year of training: 4 sessions a week × 52 weeks, 18 sets each. */
function history(sessions: number): Session[] {
  const out: Session[] = [];
  for (let i = 0; i < sessions; i += 1) {
    const at = new Date(Date.UTC(2026, 0, 1) + i * 2 * 86_400_000).toISOString();
    const sets: SetLog[] = [];
    for (let k = 0; k < 18; k += 1) {
      sets.push({
        exerciseId: LIFTS[(i + k) % LIFTS.length],
        setIndex: k % 3, recommendedWeight: 40 + (i % 20) * 0.5, recommendedReps: 8,
        actualWeight: 40 + (i % 20) * 0.5, actualReps: 8 + (k % 3),
        edited: false, persistedAt: at,
      } as SetLog);
    }
    out.push({ id: `s${i}`, programDayId: 'd', programDayName: 'Upper A', startedAt: at,
      state: 'SAVED', earlyFinish: false, trained: true, sets });
  }
  return out.reverse(); // newest first, as the app stores it
}

const plan: CoachPlan = {
  v: 2,
  title: 'Twelve weeks to the half',
  sessions: [0, 1, 2, 3].map((d) => ({
    name: `Day ${d + 1}`,
    blocks: LIFTS.slice(0, 6).map((ex) => ({
      rounds: 3, restS: 90,
      items: [{ kind: 'reps' as const, ex, reps: [8, 10] as [number, number], load: 40 }],
    })),
  })),
};

const log: CoachDecision[] = LIFTS.map((ex, i) => ({
  ex, say: 'Up two and a half — you cleared the ceiling on every set.',
  at: new Date(Date.UTC(2026, 7, 1 + i)).toISOString(),
}));

/** Median of 9 runs — a single run measures the JIT more than the code. */
function ms(label: string, f: () => unknown): void {
  const runs: number[] = [];
  for (let i = 0; i < 9; i += 1) {
    const t = process.hrtime.bigint();
    f();
    runs.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  runs.sort((a, b) => a - b);
  const med = runs[4];
  const flag = med > 100 ? '  ⛔ FELT AS A PAUSE' : med > 16 ? '  ⚠️ DROPS A FRAME' : '';
  console.log(`### ${label.padEnd(46)} ${med.toFixed(2).padStart(8)} ms${flag}`);
}

describe('what the app costs on its own', () => {
  it('measures the work every screen does on mount', () => {
    for (const n of [12, 52, 208]) {
      const h = history(n);
      const weeks = Math.round(n / 4);
      console.log(`\n### ─── ${n} sessions (${weeks} weeks of training) ───`);
      ms('coachFacts  (built on EVERY coach call)', () => coachFacts({ profile: HER, plan, history: h, justFinished: h[0], language: 'en' }));
      ms('coachWeek   (Today: the week chips)', () => coachWeek(plan));
      ms('coachRows   (Today: the lift rows)', () => coachRows(plan, 'w0'));
      ms('coachBrief  (Today: the change pill)', () => coachBrief(log, Date.parse('2026-08-01')));
      ms('lastTimeOn  (EVERY set, mid-workout)', () => lastTimeOn('bb_bench_press', h));
      ms('liftClimb   (Progress: one lift)', () => liftClimb(h, 'bb_bench_press'));
      ms('JSON.stringify(facts) (the wire)', () => JSON.stringify(coachFacts({ profile: HER, plan, history: h, language: 'en' })));
    }
  });
});
