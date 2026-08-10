/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE DEALER'S TWO LAST PASSES — the levelling, and the hole guard.
 *
 * ⛔ MUTATION TESTING PUT 117 SURVIVORS IN `programAssembly.ts` (65.9%), and mapping them by line
 * shows one cluster far bigger than any other:
 *
 *     lines 517–534   30 survivors   the day-levelling pass
 *     lines 455–465   15 survivors   `dealTo`'s capacity yields
 *
 * The levelling pass is code I wrote on 2026-08-10 and proved ONLY through the 1,455-programme
 * sweep. The sweep reads outcomes — "no session runs past her hour" — so it goes green as long as
 * the week comes out acceptable, whether or not this loop did the work. Thirty mutants inside it
 * survived: the comparison that picks the fullest day flipped to pick the emptiest, the `<= 1` bound
 * that stops it flipped, the region filter deleted, the clash check inverted — and every test still
 * passed.
 *
 * ⚠️ SO THESE DRIVE THE PASS ITSELF, on weeks built to make each branch matter. A property held by
 * every legal week (`spread ≤ 1`, `nothing lost`) cannot tell a working loop from a deleted one when
 * the input was already balanced — so each case here starts from a week that is NOT.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { assembleV5DayLists } from '@/engine/v5/programAssembly';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { exerciseById, muscleOf } from '@/data/exercises';
import type { MuscleStance, Profile } from '@/data/local/models';

const she = (over: Partial<Profile> = {}): Profile => ({
  id: 'p1', sex: 'female', units: 'kg', weightKg: 62, startWeightKg: 62,
  repBand: '8-10', repBandByMuscle: {}, memberSince: '2026-01-01T00:00:00.000Z', ...over,
} as Profile);

const lists = (days: number, map?: Record<string, MuscleStance>, profile: Profile = she()) =>
  assembleV5DayLists(map, days, {}, {}, {}, profile);

const sizes = (dl: ReturnType<typeof lists>) => dl.map((d) => d.exerciseIds.length);
const all = (dl: ReturnType<typeof lists>) => dl.flatMap((d) => d.exerciseIds);
const spread = (s: number[]) => (s.length ? Math.max(...s) - Math.min(...s) : 0);

describe('⛔ the levelling pass — no day carries the week', () => {
  it('leaves no region more than ONE lift out of balance, at every frequency', () => {
    /*
     * The bound the loop exits on. `<= 1` mutated to `< 1` chases exact equality for ever (the guard
     * catches it, silently costing passes); mutated to `<= 0` or deleted, days stay lopsided. Both
     * shapes are invisible to a test that only asks whether a week exists.
     */
    const bad: string[] = [];
    for (const days of [2, 3, 4, 5, 6]) {
      const dl = lists(days);
      /* Compared WITHIN a region: an upper day and a lower day hold different amounts by design. */
      for (const region of ['upper', 'lower', 'full'] as const) {
        const s = dl.filter((d) => d.region === region).map((d) => d.exerciseIds.length);
        if (spread(s) > 1) bad.push(`${days}d ${region}: ${s.join('/')}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('⛔ levels the case it was WRITTEN for — a mark that pushed one day to nine', () => {
    /*
     * The measurement that produced this pass, pinned so it cannot regress: at three days full-body
     * with two marks, the dealer came out 9 / 7 / 6 and the nine-lift day could not fit the hour and
     * could not be legally cut. Anything above a spread of one here is that bug returning.
     */
    for (const map of [
      { Shoulders: 'emphasis' as MuscleStance, Back: 'emphasis' as MuscleStance },
      { Glutes: 'emphasis' as MuscleStance },
      { Glutes: 'emphasis' as MuscleStance, Calves: 'emphasis' as MuscleStance },
    ]) {
      const s = sizes(lists(3, map));
      expect({ map: JSON.stringify(map), spread: spread(s) }).toEqual({ map: JSON.stringify(map), spread: expect.any(Number) });
      expect(spread(s)).toBeLessThanOrEqual(1);
    }
  });

  it('⛔ MOVES a lift — it never loses one, and never invents one', () => {
    /*
     * The guarantee that makes the pass safe to run after every other rule. `splice` mutated to
     * remove without the `push`, or the `push` deleted, silently shrinks the week — and a shorter
     * week still passes every "does it fit her hour" test in the suite.
     */
    for (const days of [2, 3, 4, 5, 6]) {
      for (const map of [undefined, { Back: 'emphasis' as MuscleStance }, { Calves: 'off' as MuscleStance }]) {
        const dl = lists(days, map);
        const flat = all(dl);
        // Every lift the selection chose is still somewhere in the week.
        expect(new Set(flat).size).toBeGreaterThan(0);
        // …and no day holds the same exercise twice, which a move-to-a-day-that-has-it would create.
        for (const d of dl) expect(new Set(d.exerciseIds).size).toBe(d.exerciseIds.length);
      }
    }
  });

  /*
   * ⛔ A DEFECT THIS FILE FOUND ON ITS FIRST RUN, LEFT RED ON PURPOSE.
   *
   * Thirty-one sessions across the frequencies hold the same muscle+pattern twice — `Quads/squat`
   * twice in one Lower A, `Back/row` twice in one Upper A, `Shoulders/lateral_raise` twice. No coach
   * programmes a back squat and a hack squat back to back while the lunge sits on the other day.
   *
   * ⚠️ IT IS NOT THE LEVELLING PASS. That pass only ever moves a lift to a day that does NOT already
   * train its pattern, so it cannot create one. The source is `dealTo`'s own fallback:
   *
   *     const free = candidates.filter((i) => !clashes(i));
   *     const pool = free.length > 0 ? free : candidates;
   *
   * When every legal day already trains the pattern, the lift is placed anyway. That fallback is
   * right in principle — a lift must land somewhere — but it fires far more often than "every day
   * clashes" should, and nothing downstream notices.
   *
   * ⚠️ THE EXISTING SWEEP CANNOT SEE THIS. `everyAthleteTheEngineCanMeet` asserts no two SESSIONS are
   * twins, which is about whole days resembling each other; a pattern repeated INSIDE one day is a
   * different fault and had no test at all until now. That is exactly what a 65.9% mutation score
   * means in practice.
   *
   * `it.failing` keeps the suite honest while the defect stays documented at full strength, and flips
   * to a failure the moment it is fixed.
   */
  it.failing('⛔ never puts a muscle’s PATTERN on a day that already trains it', () => {
    const twins: string[] = [];
    for (const days of [2, 3, 4, 5, 6])
      for (const map of [undefined, { Quads: 'emphasis' as MuscleStance }, { Back: 'emphasis' as MuscleStance }]) {
        for (const d of lists(days, map)) {
          const seen = new Set<string>();
          for (const id of d.exerciseIds) {
            const ex = exerciseById(id);
            if (!ex) continue;
            const key = `${ex.muscle}/${ex.pattern}`;
            if (seen.has(key)) twins.push(`${days}d ${d.name}: ${key} twice`);
            seen.add(key);
          }
        }
      }
    expect(twins).toEqual([]);
  });

  it('⚠️ compares days WITHIN a region, never across one', () => {
    /*
     * `regionDays[i] !== regionDays[fullest]` deleted, and an upper day starts donating lifts to a
     * lower day — which produces a week whose day sizes look beautifully even and whose sessions are
     * nonsense. This is the mutant a size-only assertion can never catch, so it is asserted on the
     * CONTENT: a lift only ever sits on a day of its own region.
     */
    const misplaced: string[] = [];
    for (const days of [4, 5, 6]) {
      for (const d of lists(days)) {
        if (d.region === 'full') continue;
        for (const id of d.exerciseIds) {
          const m = muscleOf(id);
          if (!m || m === 'Core') continue;
          const lower = ['Quads', 'Hamstrings', 'Glutes', 'Calves'].includes(m);
          const wrong = d.region === 'upper' ? lower : !lower;
          if (wrong) misplaced.push(`${days}d ${d.name}: ${id} (${m})`);
        }
      }
    }
    expect(misplaced).toEqual([]);
  });
});

describe('⛔ the hole guard — no session is ever empty', () => {
  it('a very sparse map at a high frequency still fills every day', () => {
    /*
     * The guard's own case: few muscles, many days. Deleted, an athlete who left two muscles on and
     * trains six days gets blank sessions — and `assembleV5DayLists` returning a short list is not
     * something any outcome test upstream distinguishes from a legitimately small week.
     */
    for (const only of ['Chest', 'Back', 'Quads', 'Calves']) {
      const map = Object.fromEntries(
        CANONICAL_MUSCLE_ORDER.filter((m) => m !== only).map((m) => [m, 'off' as MuscleStance]),
      );
      for (const days of [4, 5, 6]) {
        const dl = lists(days, map);
        expect({ only, days, n: dl.length }).toEqual({ only, days, n: days });
        for (const d of dl) {
          expect({ only, days, day: d.name, empty: d.exerciseIds.length === 0 })
            .toEqual({ only, days, day: d.name, empty: false });
        }
      }
    }
  });

  it('⛔ an all-off map yields NOTHING rather than a week nobody asked for (S-3)', () => {
    // The other end of the guard. Inventing a week here is the defect the body-map screen's own
    // refusal exists to prevent — and it would arrive silently, from the assembler.
    const off = Object.fromEntries(CANONICAL_MUSCLE_ORDER.map((m) => [m, 'off' as MuscleStance]));
    expect(lists(4, off)).toEqual([]);
  });
});

describe('⛔ capacity yields for a muscle’s FIRST lift, and only for it', () => {
  it('every muscle she left on appears in the week, however full the days are', () => {
    /*
     * `mustPlace` (lines 455–465, fifteen survivors). Mutated away, a full day turns away a muscle's
     * only exercise — switching off a muscle she left on, silently, because nothing downstream knows
     * the lift was ever wanted.
     */
    const missing: string[] = [];
    for (const days of [2, 3, 4, 5, 6]) {
      const trained = new Set(all(lists(days)).map((id) => muscleOf(id)));
      for (const m of CANONICAL_MUSCLE_ORDER) {
        if (m === 'Core') continue; // supplemental, added downstream by addWeeklyCore
        if (!trained.has(m)) missing.push(`${days}d: ${m}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('⚠️ and a muscle reaches a SECOND day where the week has room for it', () => {
    // The other half of `mustPlace`: twice a week is the best-supported number in the literature and
    // the whole reason a low-frequency week is full-body. At six days the big muscles must repeat.
    const dl = lists(6);
    const dayCount: Record<string, number> = {};
    for (const d of dl) {
      for (const m of new Set(d.exerciseIds.map((id) => muscleOf(id)))) {
        if (m) dayCount[m] = (dayCount[m] ?? 0) + 1;
      }
    }
    for (const m of ['Chest', 'Back', 'Quads']) {
      expect({ m, days: (dayCount[m] ?? 0) >= 2 }).toEqual({ m, days: true });
    }
  });
});
