/**
 * THE PROGRAMME SHE CAN ACTUALLY LIFT.
 *
 * ── The bug this exists to prevent ────────────────────────────────────────────────────────────
 * Every grid function floors a barbell at `BAR_KG`, and `startingWeight` clamps up to it — so a
 * prescription below the bar is not a prescription, it is the floor, and **Loop 1 cannot correct
 * downward out of it** (S-51/S-55: the floor is the floor). The selector never asked whether the
 * load it was about to prescribe could be loaded at all, so a 58 kg beginner was handed a 20 kg
 * barbell bench, a 20 kg overhead press and a 20 kg barbell curl on day one — four of her five
 * upper lifts pinned above her modelled capacity with no way down but a manual swap.
 *
 * Nothing here reads sex to pick a lift (S-58 — the demographic shelf stays deleted). It reads the
 * load B-1 already computed and asks one physical question: can this equipment hold it?
 */
// @ts-nocheck

// 

import { assembleV5DayLists, orderWithinDay } from '@/engine/v5/programAssembly';
import { exerciseById } from '@/data/exercises';
import { modelledLoadKg } from '@/domain/startingLoad';
import { loadFloor } from '@/engine/v5/grid';

const FREQUENCIES = [1, 2, 3, 4, 5, 6];
const PEOPLE = [
  { label: 'woman 48 kg', sex: 'female' as const, weightKg: 48 },
  { label: 'woman 58 kg', sex: 'female' as const, weightKg: 58 },
  { label: 'woman 70 kg', sex: 'female' as const, weightKg: 70 },
  { label: 'man 62 kg', sex: 'male' as const, weightKg: 62 },
  { label: 'man 80 kg', sex: 'male' as const, weightKg: 80 },
  { label: 'man 100 kg', sex: 'male' as const, weightKg: 100 },
];

const lifts = (profile: (typeof PEOPLE)[number], days: number) =>
  assembleV5DayLists(undefined, days, {}, {}, {}, profile).flatMap((d) => d.exerciseIds);

describe('every prescribed lift is one she can actually load', () => {
  for (const p of PEOPLE) {
    for (const days of FREQUENCIES) {
      it(`${p.label} · ${days}d — no lift is pinned above her by its own floor`, () => {
        const pinned = lifts(p, days)
          .map((id) => exerciseById(id)!)
          .filter((e) => {
            const want = modelledLoadKg(e, p);
            return want != null && want < loadFloor(e.equipment);
          })
          .map((e) => `${e.name} (floor ${loadFloor(e.equipment)}kg > modelled ${modelledLoadKg(e, p)!.toFixed(1)}kg)`);
        expect({ pinnedAboveHer: [...new Set(pinned)] }).toEqual({ pinnedAboveHer: [] });
      });
    }
  }
});

describe('the day is a session, not a pile', () => {
  for (const p of PEOPLE) {
    for (const days of FREQUENCIES) {
      it(`${p.label} · ${days}d — every day has work, and compounds lead it`, () => {
        for (const d of assembleV5DayLists(undefined, days, {}, {}, {}, p)) {
          expect(d.exerciseIds.length).toBeGreaterThan(0); // no empty session ever ships

          // COMPOUNDS BEFORE ISOLATIONS — the heavy work happens on a fresh nervous system.
          const tiers = d.exerciseIds.map((id) => (exerciseById(id)!.tier === 'compound' ? 0 : 1));
          expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
        }
      });
    }
  }

  it('the compounds are spread ACROSS the week, never piled onto one day', () => {
    // The bug: a flat round-robin over a muscle-ordered list dealt EVERY muscle's leading compound
    // to the same day — Upper A came out four-fifths barbell and Upper B one compound and four
    // isolations. A heavy day and a scraps day, chosen by nobody.
    const days = assembleV5DayLists(undefined, 4, {}, {}, {}, { sex: 'male', weightKg: 80 });
    const upper = days.filter((d) => d.region === 'upper');
    const compoundsPerDay = upper.map((d) => d.exerciseIds.filter((id) => exerciseById(id)!.tier === 'compound').length);
    // No upper day may hold every compound while its sibling holds none worth the name.
    expect(Math.max(...compoundsPerDay) - Math.min(...compoundsPerDay)).toBeLessThanOrEqual(1);
  });
});

describe('the order you walk', () => {
  it('keeps a station together once the training order allows it', () => {
    // Barbell, barbell, CABLE, barbell, barbell — the athlete crossed the gym for one pushdown and
    // came back. The order may never trade a compound for a shorter walk; it may only spend the
    // freedom it already had.
    const bench = 'bb_bench_press'; // barbell compound
    const ohp = 'bb_overhead_press'; // barbell compound
    const pushdown = 'tricep_pushdown'; // cable isolation
    const curl = 'bb_curl'; // barbell isolation
    const ordered = orderWithinDay([bench, pushdown, ohp, curl].filter((id) => exerciseById(id)));
    const equips = ordered.map((id) => exerciseById(id)!.equipment);
    const changes = equips.filter((e, i) => i > 0 && e !== equips[i - 1]).length;
    expect(changes).toBeLessThanOrEqual(1);
  });

  it('never reorders a compound behind an isolation to save a walk', () => {
    const ordered = orderWithinDay(['tricep_pushdown', 'bb_bench_press'].filter((id) => exerciseById(id)));
    expect(exerciseById(ordered[0])!.tier).toBe('compound');
  });
});
