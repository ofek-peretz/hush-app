/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A ONE-SIDED SET IS PERFORMED TWICE, AND THE CLOCK DID NOT KNOW.
 *
 * ⛔ FOUNDER'S LIST, 2026-08-16: *"התמודדות המנוע עם תרגילים מבודדים לשרירים למשל רגל - רגל."*
 *
 * `unilateral` is a fact the catalogue has carried on **21 of its 111 generatable lifts** since it
 * was written, and it was read in exactly ONE place in the entire app: the swap score. Not by the
 * time budget, which is the one thing it changes.
 *
 * A Bulgarian split squat, a walking lunge, a single-leg press, a one-arm row — she does the left
 * side, then the right, then rests. Priced as a single set, a day fills to the cap on a number that
 * under-counts it. Measured before the fix:
 *
 *     woman 62 kg · 4 days · Lower B    8 one-sided sets    priced 60.0 min → really ~66
 *     man 80 kg · 4 days · Lower A      4 one-sided sets    priced 60.0 min → really ~63
 *
 * F-15 fixes the session at 45-60 minutes, and this walked through the ceiling on most lower days —
 * the quad and glute pools are half one-sided (5 each of the 21).
 *
 * ── THE CHARGE IS ON, AND THE NUMBER THAT DECIDED IT ────────────────────────────────────────────
 * This shipped off for one turn while four balance ratchets moved against it. Re-measured over 50
 * athletes and 200 generated days, on one honest ruler across both arms:
 *
 *     days over the hour  74/200 → 0/200   ·   muscles below MEV  62/450 → 62/450 (identical)
 *     weekly sets         4327 → 4205      ·   days under 45 min  0 → 0
 *
 * The balance ratchets got worse because the week is 2.8% smaller, not because a muscle stopped
 * being trained — an inversion is a relative rank, and the same 62 muscle-weeks sit under MEV either
 * way. And the finding does not rest on B-4's 45 s: re-priced at every plausible second-side cost,
 * ZERO seconds is the only one at which no day runs over, because `enforceTimeCap` packs 123 of the
 * 200 days within thirty seconds of the ceiling. The full table is in `domain/restPrescription`.
 *
 * ── THE TWO THINGS THAT WOULD BE WRONG ──────────────────────────────────────────────────────────
 *   · **Doubling the SET.** That charges a second rest she does not take, and over-prices a leg day
 *     by as much as this under-priced it. Only the WORK doubles.
 *   · **Doubling HER measured duration.** `learnedExecS` derives the work from the gap between two
 *     logged sets, and she logs a one-sided set once, after both legs — so both sides are already
 *     inside her number. Doubling it would count the second leg twice.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { fixtureModel, estimateSessionMinutes } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import { EXERCISES, exerciseById, isSwapOnly } from '@/data/exercises';
import { SESSION_MAX } from '@/engine/v5/constants';
import type { Profile } from '@/data/local/models';

jest.setTimeout(600000);

const athlete = (over = {}): Profile => ({
  units: 'kg', goal: 'build_muscle', healthConnected: false,
  sex: 'female', weightKg: 62, daysPerWeek: 4, repBand: '8-10', ...over,
} as Profile);

/** A one-sided lift and its two-sided peer, matched on tier so only `unilateral` differs. */
const uni = EXERCISES.find((e) => e.unilateral && !isSwapOnly(e.id) && e.tier === 'compound');
const bi = EXERCISES.find((e) => !e.unilateral && !isSwapOnly(e.id) && e.tier === 'compound');

const dayOf = (exerciseId: string, setCount = 4) => ({
  id: 'd', name: 'Test', muscleGroups: [], isRest: false, key: '0', completed: false,
  slots: [{ capability: exerciseById(exerciseId).capability, exerciseId, setCount }],
});

describe('⛔ the clock charges for both sides', () => {
  it('⛔ a one-sided lift costs more than its two-sided peer, at the same set count', () => {
    expect(uni).toBeDefined();
    expect(bi).toBeDefined();
    expect(estimateSessionMinutes(dayOf(uni.id))).toBeGreaterThan(estimateSessionMinutes(dayOf(bi.id)));
  });

  it('⚠️ but it does NOT cost double — the rest is taken once, after both sides', () => {
    const one = estimateSessionMinutes(dayOf(uni.id));
    const two = estimateSessionMinutes(dayOf(bi.id));
    expect(one).toBeLessThan(two * 2);
  });

  it('⛔ and HER measured duration is not doubled — both sides are already inside it', () => {
    // `execSecFor` returns her own number, derived from the gap between two logged sets. She logs a
    // one-sided set once, after both legs, so the second side is already counted.
    const rest = () => 90;
    const hers = () => 120;
    const oneSided = estimateSessionMinutes(dayOf(uni.id), rest, hers);
    const twoSided = estimateSessionMinutes(dayOf(bi.id), rest, hers);
    expect(oneSided).toBeCloseTo(twoSided, 6);
  });

  it('⛔ …while the BOOTSTRAP is per-side, so it does double the work half', () => {
    const rest = () => 90;
    expect(estimateSessionMinutes(dayOf(uni.id), rest)).toBeGreaterThan(estimateSessionMinutes(dayOf(bi.id), rest));
  });
});

/** The 50 athletes the decision was measured over — both sexes, 2-6 days, five body maps. */
const SWEEP: Profile[] = [];
for (const sex of ['female', 'male'] as const)
  for (const daysPerWeek of [2, 3, 4, 5, 6])
    for (const mark of [null, 'Quads', 'Glutes', 'Chest', 'Back'])
      SWEEP.push(athlete({ sex, weightKg: sex === 'female' ? 62 : 82, daysPerWeek, ...(mark ? { bodyMap: { [mark]: 'emphasis' } } : {}) }));

describe('⛔ and a real week now fits the hour it promises (F-15)', () => {
  it('no generated day is priced over her ceiling — 200 days, 50 athletes', async () => {
    const over: string[] = [];
    for (const profile of SWEEP) {
      await db.clearAll();
      await db.saveProfile(profile);
      const p = await fixtureModel.generateProgram(profile);
      for (const d of p.days) {
        if (d.isRest || d.slots.length === 0) continue;
        const min = estimateSessionMinutes(d);
        // S-3 allows an honest overrun when every trained muscle is down to its last lift, and the
        // engine MARKS it. What must never happen is an unmarked one.
        if (min > SESSION_MAX + 0.01 && !d.overBudget) {
          over.push(`${profile.sex} ${profile.daysPerWeek}d · ${d.name} — ${min.toFixed(1)} min, unmarked`);
        }
      }
    }
    expect(over).toEqual([]);
  });
});
