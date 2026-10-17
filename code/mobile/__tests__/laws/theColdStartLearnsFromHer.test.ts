/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COLD START COULD ONLY EVER FAIL ONE WAY, AND IT WAS THE WRONG WAY.
 *
 * ⛔ FOUNDER'S LIST, 2026-08-16: deepen the cold start beyond sex and bodyweight. MEASURED FIRST —
 * three simulated athletes, ten weeks, the first set of every lift never performed:
 *
 *     an athlete the model fits ........  85.0% in band  ·  0% over  ·  15% under
 *     an athlete the model fits ........  57.7% in band  ·  0% over  ·  42% under
 *     an athlete WEAKER than modelled ..   0.0% in band  ·  0% over  · 100% under, by 6.4 reps
 *
 * B-1 is well calibrated for someone the model fits and catastrophic for someone it does not — and
 * across all three, "over" was ZERO. It is never too light and routinely too heavy, which is the
 * exact reverse of what B-1's own register row says it is for: *"a light seed becomes Loop 1's
 * visible 'you did 14, so I added weight'; a heavy one fails her very first set."*
 *
 * ── THE TWO HALVES, AND WHY NEITHER IS A NEW GUESS ──────────────────────────────────────────────
 *   · **`personalScale`** — the ratio between what B-1 PREDICTED for the lifts she has done and what
 *     she DEMONSTRATED on them. Entirely her own data; the same move S-9 makes with one load, taken
 *     one level up. It recovered the simulated athletes' true ratios to within 3% (0.7 → 0.72).
 *   · **A seed she has not tested is RE-READ.** State was created for every lift in the programme on
 *     the first call, from an empty history, and then frozen — so a lift she met on Thursday carried
 *     a load decided before she had lifted anything. 21 of one athlete's 25 model cold starts were
 *     in week one for exactly this reason, and nothing she did on Monday could reach them.
 *
 * Together: 55.77% → 58.31% in band, 1.02 → 0.87 mean miss, and the convergence defect closed.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { personalScale, modelledLoadKg, startingWeight, MIN_SCALE_LIFTS, PERSONAL_SCALE_FLOOR } from '@/domain/startingLoad';
import { exerciseById, EXERCISES, isSwapOnly } from '@/data/exercises';
import { epley } from '@/engine/loadMath';

const she = { sex: 'female', weightKg: 60 } as const;
const TLO = 8;
const scale = (h: unknown) => personalScale(h as never, she, exerciseById, TLO, epley);

/** A session in which she performed `load × reps` on each of the given lifts. */
const did = (lifts: [string, number, number][]) => ({
  sets: lifts.map(([exerciseId, actualWeight, actualReps]) => ({ exerciseId, actualWeight, actualReps })),
});

/** The load B-1 models for a lift, expressed as the working load at Tlo — what the ratio compares. */
const modelWorking = (id: string) => modelledLoadKg(exerciseById(id)!, she)!;
/** What she must perform to demonstrate exactly `f` × the model, at Tlo. */
const atFraction = (id: string, f: number) => [id, Math.round(modelWorking(id) * f * 100) / 100, TLO] as [string, number, number];

/* Asked of the catalogue rather than typed from memory — an invented id is silently skipped by
 * `personalScale` (`if (!ex) continue`), so a hard-coded one that stops existing would make these
 * cases pass on an empty sample. */
const LOADED = EXERCISES.filter((e) => !isSwapOnly(e.id) && !e.bodyweight && e.baseKg != null).map((e) => e.id);
const THREE = LOADED.slice(0, 3);

describe('⛔ the scale is measured from her, or it is not returned at all', () => {
  it('null until she has enough lifts — the evidence gate (F-12 family)', () => {
    expect(scale([])).toBeNull();
    expect(scale([did([atFraction(THREE[0], 0.7), atFraction(THREE[1], 0.7)])])).toBeNull();
    expect(scale([did(THREE.map((id) => atFraction(id, 0.7)))])).not.toBeNull();
    expect(MIN_SCALE_LIFTS).toBe(3);
  });

  it('⛔ recovers the fraction she is actually at', () => {
    const s = scale([did(THREE.map((id) => atFraction(id, 0.7)))]);
    expect(s).toBeGreaterThan(0.66);
    expect(s).toBeLessThan(0.74);
  });

  it('⚠️ one freak lift cannot move it — the median is why (F-13’s reason)', () => {
    const five = LOADED.slice(0, 5);
    const honest = five.map((id) => atFraction(id, 0.7));
    const withFreak = [...honest.slice(0, 4), [five[4], modelWorking(five[4]) * 4, TLO] as [string, number, number]];
    const a = scale([did(honest)]);
    const b = scale([did(withFreak)]);
    expect(Math.abs(a - b)).toBeLessThan(0.05);
  });

  it('⚠️ …and one lift cannot vote twice, however often she trains it', () => {
    const once = scale([did(THREE.map((id) => atFraction(id, 0.7)))]);
    const again = scale([
      did(THREE.map((id) => atFraction(id, 0.7))),
      did([atFraction(THREE[0], 0.7), atFraction(THREE[0], 0.7), atFraction(THREE[0], 0.7)]),
    ]);
    expect(again).toBeCloseTo(once, 6);
  });
});

describe('⛔ it may only make the seed lighter', () => {
  it('a STRONGER athlete is clamped to 1 — the model, unchanged', () => {
    expect(scale([did(THREE.map((id) => atFraction(id, 1.6)))])).toBe(1);
  });

  it('⛔ WHY: measured, "over" was 0% for every athlete — the model is never too light', () => {
    /*
     * The two errors are not equal and the register already says so. Light costs her one set that
     * Loop 1 raises from inside and is the product's best moment; heavy costs her the first set of a
     * lift she has never met. A factor that can only reduce fixes the failure that exists and cannot
     * create the one that does not.
     */
    for (const f of [1.0, 1.2, 2.0, 5.0]) {
      expect(scale([did(THREE.map((id) => atFraction(id, f)))])).toBe(1);
    }
  });

  it('⛔ and it is floored — a mis-logged set may not halve her whole programme', () => {
    // Every lift entered at a tenth of her real load: absurd, and the floor is what survives it.
    expect(scale([did(THREE.map((id) => atFraction(id, 0.1)))])).toBe(PERSONAL_SCALE_FLOOR);
  });
});

describe('⛔ what it refuses to read', () => {
  it('a warm-up / approach set is not evidence (S-60)', () => {
    const h = [{ sets: THREE.map((id) => ({ ...Object.fromEntries([['exerciseId', id], ['actualWeight', modelWorking(id) * 0.7], ['actualReps', TLO]]), isApproach: true })) }];
    expect(scale(h)).toBeNull();
  });

  it('⚠️ a bodyweight lift has no load axis, so it never enters the ratio', () => {
    const h = [did([['push_up', null as never, 12], ['plank', null as never, 30], ...THREE.map((id) => atFraction(id, 0.7))])];
    const s = scale(h);
    expect(s).toBeGreaterThan(0.66);
    expect(s).toBeLessThan(0.74);
  });

  it('⚠️ a set with no reps says nothing', () => {
    expect(scale([did(THREE.map((id) => [id, modelWorking(id), 0] as [string, number, number]))])).toBeNull();
  });
});

describe('⛔ the seed she has not tested is re-read, not frozen', () => {
  it('the engine says so in the one place it could go wrong', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'engine', 'v5', 'v5Engine.ts'), 'utf8');
    // The guard is the whole safety of it: only a lift with NO engine history and NO performance.
    expect(src).toMatch(/ex\[id\]\.history\.length === 0/);
    expect(src).toMatch(/bestDemonstratedLoad\(id, b, history\) == null/);
  });

  it('⚠️ and the cold start reads her scale rather than the model alone', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'data', 'api', 'fixtureModel.ts'), 'utf8');
    expect(src).toMatch(/personalScale\(history, profile/);
  });

  it('⛔ but the SELECTOR still asks about the model (S-55b)', () => {
    /*
     * `canLoad` asks "can this equipment hold the load B-1 models for her?" — and it must keep asking
     * about the MODEL. Scaling there would withhold lifts from a weaker athlete entirely rather than
     * prescribe them lighter, which is the opposite of the intent.
     */
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'domain', 'startingLoad.ts'), 'utf8');
    const canLoad = src.slice(src.indexOf('export function canLoad'), src.indexOf('export function canLoad') + 400);
    expect(canLoad).not.toMatch(/personalScale/);
  });
});
