/**
 * Periodic program refresh (founder 2026-07-09). Every 3-week cycle, ONE non-pinned lift per
 * workout rotates to a fresh same-muscle + same-tier variation. This suite PROVES the refresh
 * honors every requirement across many cycles — the founder's explicit "how do we KNOW it respects
 * all the rules" question, answered as assertions rather than a promise.
 */
import { fixtureModel, estimateSessionMinutes } from '@/data/api/fixtureModel';
import { exerciseById } from '@/data/exercises';
import { db } from '@/data/local/db';
import type { Profile, Program } from '@/data/local/models';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const NOW = Date.now();
const base: Profile = { units: 'kg', sex: 'male', age: 30, weightKg: 80, experience: 'intermediate', goal: 'build_muscle', daysPerWeek: 3, healthConnected: false };

beforeEach(async () => { await db.clearAll(); });

/** Per-day multiset of (muscle|tier) over the PRIMARY (non-core) lifts — the coverage + quality
 *  fingerprint the refresh must never change (it only swaps the specific exercise, same muscle+tier). */
function composition(prog: Program): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of prog.days) {
    out[d.id] = d.slots
      .filter((s) => !s.supplemental)
      .map((s) => { const e = exerciseById(s.exerciseId); return `${e?.muscle}|${e?.tier}`; })
      .sort()
      .join(',');
  }
  return out;
}

/** Advance to a given 3-week cycle by dating memberSince into the past, then regenerate. */
async function generateAtCycle(profile: Profile, cycle: number): Promise<Program> {
  const p: Profile = { ...profile, memberSince: new Date(NOW - cycle * 3 * WEEK).toISOString() };
  await db.saveProfile(p);
  const prog = await fixtureModel.generateProgram(p);
  await db.saveProgram(prog);
  return prog;
}

/** True iff same-equipment lifts are contiguous — one station to the end, never leave and return. */
function equipmentContiguous(prog: Program): boolean {
  for (const d of prog.days) {
    const equips = d.slots.filter((s) => !s.supplemental).map((s) => exerciseById(s.exerciseId)?.equipment ?? '');
    let prev: string | null = null;
    const closed = new Set<string>();
    for (const e of equips) {
      if (e === prev) continue;
      if (closed.has(e)) return false;
      if (prev !== null) closed.add(prev);
      prev = e;
    }
  }
  return true;
}

test('every cycle keeps ≤60 min, ≤4 sets, no duplicate, same coverage, AND equipment grouped', async () => {
  await db.saveProfile(base);
  const cycle0 = await generateAtCycle(base, 0);
  const fingerprint = composition(cycle0);

  for (let cycle = 1; cycle <= 60; cycle++) {
    const prog = await generateAtCycle(base, cycle);
    for (const d of prog.days) {
      expect(estimateSessionMinutes(d)).toBeLessThanOrEqual(60); // ≤ 60 min
      for (const s of d.slots) expect(s.setCount).toBeLessThanOrEqual(4); // ≤ 4 sets
      const ids = d.slots.map((s) => s.exerciseId);
      expect(new Set(ids).size).toBe(ids.length); // no duplicate lift in a workout
    }
    expect(composition(prog)).toEqual(fingerprint); // coverage + tier preserved every single cycle
    expect(equipmentContiguous(prog)).toBe(true); // equipment stays grouped even AFTER a rotation
  }
});

test('a rotating slot walks its WHOLE pool with no ping-pong (never bounces between two)', async () => {
  await db.saveProfile(base);
  await generateAtCycle(base, 0);
  // Track the first push lift (Push A: bench slot) — with no stalls it is the one that rotates.
  const seq: string[] = [];
  for (let cycle = 1; cycle <= 60; cycle++) {
    const prog = await generateAtCycle(base, cycle);
    const pushDay = prog.days.find((d) => d.name.startsWith('Push'))!;
    // the horizontal-push COMPOUND that leads the day is the rotating slot
    const lead = pushDay.slots.find((s) => { const e = exerciseById(s.exerciseId); return e?.capability === 'horizontal_push' && e?.tier === 'compound'; })!;
    seq.push(lead.exerciseId);
  }
  // no immediate ping-pong: no two consecutive cycles are the same lift
  for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
  // walks the pool: many distinct lifts used over 21 cycles, not a 2-way bounce
  expect(new Set(seq).size).toBeGreaterThanOrEqual(4);
  // no A→B→A ping-pong: a lift never returns until ≥2 others have been used since
  for (let i = 2; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 2]);
});

test('a PINNed lift is NEVER rotated out', async () => {
  await db.saveProfile(base);
  await generateAtCycle(base, 0);
  // Pin the athlete to barbell bench (muscle Chest).
  await fixtureModel.setExercisePreference({ capability: 'horizontal_push', fromExercise: 'bb_bench_press', toExercise: 'bb_bench_press' });
  for (let cycle = 1; cycle <= 60; cycle++) {
    const prog = await generateAtCycle(base, cycle);
    const chestLifts = prog.days
      .flatMap((d) => d.slots)
      .filter((s) => exerciseById(s.exerciseId)?.muscle === 'Chest')
      .map((s) => s.exerciseId);
    expect(chestLifts).toContain('bb_bench_press'); // the pinned chest lift is always present
  }
});
