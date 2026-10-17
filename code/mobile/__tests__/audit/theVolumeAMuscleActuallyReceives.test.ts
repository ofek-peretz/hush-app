/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * INDIRECT VOLUME — the difference between what a muscle is PRESCRIBED and what it RECEIVES.
 *
 * ⛔ FOUNDER, 2026-08-11: *"תלמד את חישוב הנפח לקרוא את capability."*
 *
 * The catalogue files every lift under exactly ONE muscle. That is right for selection — a lift has
 * one muscle it is chosen to train — and wrong for accounting: every row trains the biceps, every
 * press trains the triceps, and every hinge trains the glutes. For as long as the engine measured
 * volume by the filing, it was answering "is this muscle under-trained?" with a number that could
 * not be true, and this file exists because SEVEN separate engine fixes were attempted against one
 * of those numbers (Glutes at 7 weekly sets) before the number itself was checked.
 *
 * ⚠️ WHAT IS PINNED HERE IS THE MEASUREMENT, NOT A PRESCRIPTION. `indirectMusclesOf` changes what the
 * engine BELIEVES a muscle received; it may never change what the engine gives her. The third block
 * below is the one that enforces that, and it is the important one.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { fixtureModel } from '@/data/api/fixtureModel';
import {
  EXERCISES,
  exerciseById,
  muscleOf,
  indirectMusclesOf,
  INDIRECT_SHARE,
  exercisesForMuscle,
} from '@/data/exercises';
import { CANONICAL_MUSCLE_ORDER, WEEKLY_SETS_FLOOR } from '@/engine/v5/constants';
import type { MuscleStance, Profile, Program } from '@/data/local/models';

const athlete = (over: Partial<Profile> = {}): Profile => ({
  id: 'p1',
  sex: 'female',
  units: 'kg',
  weightKg: 62,
  startWeightKg: 62,
  daysPerWeek: 4,
  repBand: '8-10',
  repBandByMuscle: {},
  memberSince: new Date('2026-01-01').toISOString(),
  ...over,
});

const workouts = (p: Program) => p.days.filter((d) => !d.isRest);

/** What each muscle is PRESCRIBED, and what it RECEIVES once indirect work is counted. */
function volumes(p: Program): { filed: Record<string, number>; effective: Record<string, number> } {
  const filed: Record<string, number> = {};
  const effective: Record<string, number> = {};
  for (const d of workouts(p))
    for (const s of d.slots) {
      const m = muscleOf(s.exerciseId);
      if (!m) continue;
      filed[m] = (filed[m] ?? 0) + s.setCount;
      effective[m] = (effective[m] ?? 0) + s.setCount;
      for (const im of indirectMusclesOf(s.exerciseId)) {
        effective[im] = (effective[im] ?? 0) + s.setCount * INDIRECT_SHARE;
      }
    }
  return { filed, effective };
}

const DAYS = [2, 3, 4, 5, 6];
const MAPS: Record<string, MuscleStance>[] = [
  {},
  { Shoulders: 'off' },
  { Back: 'emphasis' },
  { Glutes: 'emphasis' },
  { Chest: 'emphasis', Back: 'emphasis' },
  { Calves: 'off', Core: 'off', Biceps: 'off' },
];

describe('⛔ the volume a muscle actually receives', () => {
  jest.setTimeout(300000);

  it('⛔ the guardrail holds — no lift ever lends volume outside its own capability', () => {
    /*
     * This is what keeps the table honest, and it is asserted against the CATALOGUE rather than
     * trusted from the table's own filter. `capability` is far too coarse to decide indirect volume
     * on its own — `hip_dominant` contains Hamstrings, Glutes AND Core, so reading it directly would
     * credit a hanging leg raise as glute work — but it is exactly right as a bound: a lift may only
     * lend to a muscle it could plausibly share a movement with. If this ever goes red, someone has
     * written a claim that a bench press trains the back.
     */
    const crossed: string[] = [];
    for (const ex of EXERCISES) {
      for (const m of indirectMusclesOf(ex.id)) {
        const sameCapability = exercisesForMuscle(m).some((o) => o.capability === ex.capability);
        if (!sameCapability) crossed.push(`${ex.id} (${ex.capability}) → ${m}`);
        if (m === ex.muscle) crossed.push(`${ex.id} lends to itself`);
      }
    }
    expect(crossed).toEqual([]);
  });

  it('⛔ the muscles the catalogue under-counts are named, and the difference is real', async () => {
    /*
     * The concrete claim, so this file cannot pass on an empty table. Biceps and Triceps are the
     * clearest cases in the catalogue — a back day is a biceps day and a chest day is a triceps day —
     * and the engine deliberately prescribes them little DIRECT work for exactly that reason
     * (`MUSCLE_VOLUME_SHARE` gives both 0.7, the lowest of the large groups, with the note "worked by
     * every pull already"). Until this table existed, nothing downstream knew that.
     *
     * Measured at five days: Biceps 6 filed sets → 13.5 received. Triceps 10 → 16. Glutes 7 → 10.5.
     */
    const p = await fixtureModel.generateProgram(athlete({ daysPerWeek: 5 }));
    const { filed, effective } = volumes(p);
    for (const m of ['Biceps', 'Triceps', 'Glutes']) {
      expect(effective[m]).toBeGreaterThan(filed[m]);
    }
    // …and the share is a half set, not a whole one — a prime mover, not the lift's target.
    expect(INDIRECT_SHARE).toBe(0.5);
  });

  it('⛔ indirect volume is never PRESCRIBED — a muscle she left on still gets its own lifts', async () => {
    /*
     * ⛔ THE LAW THAT MATTERS, AND THE ONE THIS CHANGE COULD PLAUSIBLY HAVE BROKEN.
     *
     * The danger in teaching the engine that rows feed the biceps is that it decides the biceps need
     * no lift of their own. They do: indirect work is what a muscle RECEIVES, never what it can be
     * prescribed, and S-2 says a muscle she left ON is trained. So every muscle that is not switched
     * off must still hold at least one lift with its own name on it, at every frequency and under
     * every map — exactly as it did before this table existed.
     */
    const missing: string[] = [];
    for (const days of DAYS)
      for (const bodyMap of MAPS) {
        const p = await fixtureModel.generateProgram(athlete({ daysPerWeek: days, bodyMap }));
        const trained = new Set(workouts(p).flatMap((d) => d.slots.map((s) => muscleOf(s.exerciseId))));
        for (const m of CANONICAL_MUSCLE_ORDER) {
          if (m === 'Core') continue; // supplemental — sized by the map, may legitimately be absent
          if (bodyMap[m] === 'off') continue;
          if (!trained.has(m)) missing.push(`${days}d ${JSON.stringify(bodyMap)}: ${m} has no lift of its own`);
        }
      }
    expect(missing).toEqual([]);
  });

  it('⛔ …and a muscle she switched OFF is never given work to reach a floor with', async () => {
    /*
     * The other direction of the same danger. An `off` muscle still RECEIVES indirect volume — she
     * turned off the biceps, and her rows keep training them, which is simply true and worth the
     * engine knowing. What must never happen is the reverse: the floor pass noticing an off muscle
     * sitting under MEV and prescribing it a lift. S-3 is absolute and outranks every dose.
     */
    const leaked: string[] = [];
    for (const days of DAYS)
      for (const bodyMap of MAPS) {
        const off = Object.entries(bodyMap).filter(([, v]) => v === 'off').map(([m]) => m);
        if (off.length === 0) continue;
        const p = await fixtureModel.generateProgram(athlete({ daysPerWeek: days, bodyMap }));
        const trained = new Set(workouts(p).flatMap((d) => d.slots.map((s) => muscleOf(s.exerciseId))));
        for (const m of off) if (trained.has(m)) leaked.push(`${days}d ${JSON.stringify(bodyMap)}: ${m}`);
      }
    expect(leaked).toEqual([]);
  });

  it('⛔ no muscle she trains is under MEV once what it receives is counted', async () => {
    /*
     * The floor, asked of the honest number. Two days is excluded for the reason the sister file
     * gives: nine muscles at MEV is ~54 weekly sets and two 60-minute sessions hold about 40, so that
     * week cannot reach it and no engine change makes it.
     *
     * ⚠️ THIS IS THE STRICTER READING, NOT THE LOOSER ONE. Effective volume is always ≥ filed, so a
     * muscle that fails HERE has no indirect work left to hide behind — it is genuinely short.
     */
    const thin: string[] = [];
    for (const days of DAYS)
      for (const bodyMap of MAPS) {
        if (days < 3) continue;
        const p = await fixtureModel.generateProgram(athlete({ daysPerWeek: days, bodyMap }));
        const { effective } = volumes(p);
        for (const m of CANONICAL_MUSCLE_ORDER) {
          if (m === 'Core' || bodyMap[m] === 'off') continue;
          const n = effective[m] ?? 0;
          if (n > 0 && n < WEEKLY_SETS_FLOOR) thin.push(`${days}d ${JSON.stringify(bodyMap)}: ${m} receives ${n}`);
        }
      }
    expect(thin).toEqual([]);
  });

  it('every lift that lends is a compound — an isolation trains the muscle it is filed under', () => {
    /*
     * A sanity bound on the table, asserted rather than assumed. Indirect volume comes from
     * multi-joint work: a row bends the elbow, a hinge extends the hip. A single-joint lift by
     * definition moves one joint, so it cannot be a prime mover anywhere but its own muscle — a leg
     * curl is not glute work and a cable fly is not triceps work. If an isolation ever appears here,
     * the table has drifted from the reason it exists.
     */
    const wrong: string[] = [];
    for (const ex of EXERCISES) {
      if (indirectMusclesOf(ex.id).length === 0) continue;
      if (ex.tier !== 'compound') wrong.push(`${ex.id} (${ex.tier}) lends volume`);
    }
    expect(wrong).toEqual([]);
  });
});
