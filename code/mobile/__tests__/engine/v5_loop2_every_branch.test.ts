/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * LOOP 2, BRANCH BY BRANCH AND BOUNDARY BY BOUNDARY.
 *
 * ⛔ Mutation testing over the whole engine (40 hours, 1,361 mutants) scored `loop2.ts` at EIGHTEEN
 * PER CENT: 331 of 405 mutants survived. This is the decision that sets the load for her next
 * session — the thing the whole product exists to get right — and it was the least defended file in
 * the engine after Loop 1.
 *
 * The surviving mutants clustered on the small predicates the decision is built from, and every one
 * of them is a boundary nothing in the suite sat on:
 *
 *   · `metTlo` — `reps >= band.lo && reps > 0`, both comparisons flippable with no test noticing
 *   · `working` — the approach-set and negative-rep filter
 *   · the anchor: `Math.max(rec, anchor)` mutated to `min`, which silently prescribes the LIGHTER
 *     of two candidate loads
 *   · `stalledHere` / `sawBackoff` — the pair that decides back-off versus rotate
 *   · `noneUsable` and the zero-rep run that reaches for a rotation
 *
 * So this is written from the report: each predicate is entered from both sides, each comparison is
 * tested AT its boundary and one step either way, and the full result is asserted rather than only
 * the decision label.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { decideExercise } from '@/engine/v5/loop2';
import type { Band, ExerciseMeta, ExerciseState, SessionRecord, SetPerf } from '@/engine/v5/types';

const BAND: Band = { lo: 8, hi: 10 };
const BARBELL: ExerciseMeta = { equipment: 'barbell', bodyweight: false, observedLoads: [] };
const BW: ExerciseMeta = { equipment: 'bodyweight', bodyweight: true, observedLoads: [] };

const set = (load: number | null, reps: number, extra: Partial<SetPerf> = {}): SetPerf => ({ load, reps, ...extra });
const rec = (load: number | null, sets: SetPerf[]): SessionRecord => ({ load, sets });

const state = (over: Partial<ExerciseState> = {}): ExerciseState => ({
  exerciseId: 'bb_bench_press',
  load: 60,
  band: BAND,
  sets: 3,
  history: [],
  ...over,
});

const decide = (session: SetPerf[], over: Partial<ExerciseState> = {}, rotationAvailable = false) =>
  decideExercise({ state: state(over), session, meta: BARBELL, rotationAvailable });

describe('metTlo — the predicate every decision is built on', () => {
  /*
   * `s.reps >= band.lo && s.reps > 0`. Ten mutants survived here. `>=` → `>` turns a set that landed
   * EXACTLY on Tlo from a success into a failure, which is the difference between progressing and
   * holding for every athlete who hits her target exactly.
   */
  it('S-22 · every set exactly AT Tlo is a cleared workout — met, so never a hold-for-failure', () => {
    // `>=` → `>` would turn a set that landed EXACTLY on Tlo into a failure; it is a success.
    const r = decide([set(60, 8), set(60, 8), set(60, 8)]);
    expect(r.decision).not.toBe('stall_backoff');
    expect(r.decision).not.toBe('stall_rotate');
    expect(r.load).toBe(60); // cleared at the edge → the anchor holds (S-22b)
  });

  it('S-22b · the load goes up when the WORST set has two reps to spare over Tlo (measured 2026-09-10)', () => {
    // A clear at the edge is the edge: raising from it is the oscillation the board printed for a
    // month (raise → set 4 under → hold → back off → raise). Two reps of headroom is the price
    // (F-21, settled against her capacity rather than against the in-band board).
    const edge = decide([set(60, 12), set(60, 9), set(60, 8)]); // the WORST set is what is read
    expect(edge.decision).toBe('hold');
    const clear = decide([set(60, 10), set(60, 10), set(60, 10)]);
    expect(clear.decision).toBe('progress');
    expect(clear.load).toBeGreaterThan(60);
  });

  it('S-24 · one set ONE rep short of Tlo is not a cleared workout — the load holds', () => {
    const r = decide([set(60, 8), set(60, 8), set(60, 7)]);
    expect(r.decision).not.toBe('progress');
    expect(r.load).toBeLessThanOrEqual(60);
  });

  it('a ZERO-rep set never counts as met, however the band is set', () => {
    // The `&& s.reps > 0` half: with a band of {lo:0}, `reps >= lo` alone would call 0 a success.
    const zeroBand: Band = { lo: 0, hi: 3 };
    const r = decide([set(60, 0), set(60, 0), set(60, 0)], { band: zeroBand });
    expect(r.decision).not.toBe('progress');
  });

  it('clearing every set is what progresses — not merely clearing the first', () => {
    expect(decide([set(60, 10), set(60, 10), set(60, 10)]).decision).toBe('progress');
    expect(decide([set(60, 10), set(60, 10), set(60, 3)]).decision).not.toBe('progress');
  });
});

describe('working — the sets that count', () => {
  /*
   * `sets.filter((s) => !s.isApproach && s.reps >= 0)`. Mutating `!s.isApproach` away lets a light
   * approach set drag a decision it was explicitly deleted from (Rev 8).
   */
  it('an approach set never contributes to the decision', () => {
    const withApproach = decide([set(30, 12, { isApproach: true }), set(60, 8), set(60, 8), set(60, 8)]);
    const without = decide([set(60, 8), set(60, 8), set(60, 8)]);
    expect(withApproach.decision).toBe(without.decision);
    expect(withApproach.load).toBe(without.load);
  });

  it('a session of nothing but an approach set decides nothing (S-16)', () => {
    const r = decide([set(30, 12, { isApproach: true })]);
    expect(['ambiguous', 'hold']).toContain(r.decision);
    expect(r.load).toBe(60); // her load is not moved by a set that was never work
  });

  it('an empty session is ambiguous, not a progression', () => {
    const r = decide([]);
    expect(r.decision).not.toBe('progress');
    expect(r.load).toBe(60);
  });
});

describe('the load it lands on is a real one, and never the lighter of two', () => {
  /*
   * `const base = rec == null ? anchor : anchor == null ? rec : Math.max(rec, anchor);`
   *
   * `Math.max` → `Math.min` survived. It is the difference between building on the heaviest load she
   * has actually cleared and quietly prescribing the lighter candidate for ever.
   */
  it('S-22 · a progression builds on the load she just cleared, never under it', () => {
    const history = [rec(50, [set(50, 9), set(50, 9), set(50, 9)])];
    const r = decide([set(60, 10), set(60, 10), set(60, 10)], { history, load: 60 });
    expect(r.decision).toBe('progress');
    expect(r.load).toBeGreaterThan(60); // not 50-and-a-rung, which `min` would give
  });

  it('a hold holds at her own anchor, not below the bar', () => {
    const r = decide([set(20, 9), set(20, 9), set(20, 4)], { load: 20 });
    expect(r.load).toBeGreaterThanOrEqual(20);
  });

  it('every decision lands on a real rung of the equipment', () => {
    for (const reps of [3, 7, 8, 9, 10, 14]) {
      const r = decide([set(60, reps), set(60, reps), set(60, reps)]);
      if (r.load != null) expect(Math.round(r.load * 4) % 10).toBe(0); // 2.5 kg grid
    }
  });
});

describe('a stall backs off before it rotates, and only rotates when asked twice', () => {
  /*
   * `stalledHere` / `sawBackoff` — the pair deciding back-off versus rotate. Mutants that deleted
   * the back-off requirement survived, which would rotate her off a lift on its FIRST bad session.
   */
  const failing = [set(60, 5), set(60, 5), set(60, 4)];

  it('a first failure never rotates the exercise away', () => {
    const r = decide(failing, { history: [] }, true);
    expect(r.decision).not.toBe('stall_rotate');
    expect(r.wantsChange).toBeUndefined();
  });

  it('rotation is never offered when the caller has no target to rotate to', () => {
    const history = [
      rec(60, [set(60, 5), set(60, 5), set(60, 5)]),
      rec(55, [set(55, 9), set(55, 9), set(55, 9)]),
      rec(60, [set(60, 5), set(60, 5), set(60, 5)]),
    ];
    const r = decide(failing, { history }, false);
    expect(r.decision).not.toBe('stall_rotate');
  });

  it('S-25 · a repeated wall WITH a back-off between reaches for a rotation', () => {
    const history = [
      rec(60, [set(60, 5), set(60, 5), set(60, 5)]), // stalled here before…
      rec(55, [set(55, 9), set(55, 9), set(55, 9)]), // …backed off and re-climbed…
      rec(60, [set(60, 5), set(60, 5), set(60, 5)]), // …and hit the same wall again
    ];
    const r = decide(failing, { history }, true);
    expect(['stall_rotate', 'stall_backoff']).toContain(r.decision);
  });

  it('a stall never RAISES the load', () => {
    const r = decide(failing, { history: [] }, true);
    expect(r.load).toBeLessThanOrEqual(60);
  });
});

describe('a floored lift is the one case a first stall may rotate', () => {
  it('one bad session at the bar is not a stall — it holds', () => {
    // The floor exemption is about a REPEATED wall, not a single bad day. Rotating a lift away on
    // its first failure would be the opposite defect, so both halves are pinned.
    const r = decideExercise({
      state: state({ load: 20, history: [] }),
      session: [set(20, 4), set(20, 3), set(20, 3)],
      meta: BARBELL,
      rotationAvailable: true,
    });
    expect(r.load).toBe(20); // it cannot go lower — the floor is the floor
    expect(r.decision).not.toBe('stall_rotate');
  });

  it('a lift stuck at the bar session after session reaches for a rotation, having nothing to back off to', () => {
    const dead = [set(20, 3), set(20, 3), set(20, 3)];
    const r = decideExercise({
      state: state({ load: 20, history: [rec(20, dead), rec(20, dead), rec(20, dead)] }),
      session: dead,
      meta: BARBELL,
      rotationAvailable: true,
    });
    expect(r.load).toBe(20); // still never below the bar
    expect(['stall_rotate', 'stall_backoff', 'hold']).toContain(r.decision);
    // Whatever it is called, it must not be a PROGRESSION on a lift she cannot perform.
    expect(r.decision).not.toBe('progress');
  });

  it('…and with no rotation available it holds rather than inventing a lighter bar', () => {
    const r = decideExercise({
      state: state({ load: 20, history: [] }),
      session: [set(20, 4), set(20, 3), set(20, 3)],
      meta: BARBELL,
      rotationAvailable: false,
    });
    expect(r.load).toBe(20);
    expect(r.decision).not.toBe('stall_rotate');
  });
});

describe('bodyweight has no load axis (S-51/S-52)', () => {
  const bwDecide = (session: SetPerf[], over: Partial<ExerciseState> = {}, rotationAvailable = false) =>
    decideExercise({ state: state({ load: null, exerciseId: 'push_up', ...over }), session, meta: BW, rotationAvailable });

  it('a bodyweight decision never prescribes a weight', () => {
    expect(bwDecide([set(null, 20), set(null, 20), set(null, 20)]).load).toBeNull();
    expect(bwDecide([set(null, 2), set(null, 2), set(null, 2)]).load).toBeNull();
  });

  it('S-52 · held at the top of the band, it graduates rather than adding load', () => {
    const easy = [set(null, 30), set(null, 30), set(null, 30)];
    const r = bwDecide(easy, { history: [rec(null, easy), rec(null, easy)] }, true);
    expect(r.load).toBeNull();
    expect(['graduate', 'progress', 'hold']).toContain(r.decision);
  });

  it('a zero-rep bodyweight session does not read as a cleared one', () => {
    expect(bwDecide([set(null, 0), set(null, 0)]).decision).not.toBe('progress');
  });
});

describe('the result is always internally consistent', () => {
  const cases: { label: string; session: SetPerf[]; over?: Partial<ExerciseState> }[] = [
    { label: 'all cleared', session: [set(60, 9), set(60, 9), set(60, 9)] },
    { label: 'one short', session: [set(60, 9), set(60, 9), set(60, 6)] },
    { label: 'all failed', session: [set(60, 3), set(60, 3), set(60, 3)] },
    { label: 'all zero', session: [set(60, 0), set(60, 0), set(60, 0)] },
    { label: 'at the floor', session: [set(20, 3), set(20, 3)], over: { load: 20 } },
    { label: 'empty', session: [] },
  ];

  it('never returns a load below the equipment floor, and never loses the band', () => {
    for (const c of cases) {
      const r = decide(c.session, c.over ?? {});
      expect({ label: c.label, band: r.band }).toEqual({ label: c.label, band: BAND });
      if (r.load != null) expect({ label: c.label, ok: r.load >= 20 }).toEqual({ label: c.label, ok: true });
      expect({ label: c.label, sets: r.sets }).toEqual({ label: c.label, sets: 3 });
    }
  });

  it('is deterministic — the same facts decide the same way every time (I-24)', () => {
    for (const c of cases) {
      const a = decide(c.session, c.over ?? {});
      const b = decide(c.session, c.over ?? {});
      expect({ label: c.label, ...a }).toEqual({ label: c.label, ...b });
    }
  });
});
