/**
 * S-28 · THE NEXT RUNG IS A BIG JUMP — the register, built.
 *
 * > "**S-28 · The next rung is a big jump** (a machine with 10 kg pins; no micro-loading). The load
 * > cannot move without breaking her — and **T is hers, so the engine may not quietly raise it.** So
 * > it says the truth and offers the only honest axis left: *'This machine jumps 10 kg — too big a
 * > step for you right now. We'll add reps here until it's within reach.'* **And 'within reach' is
 * > the same measured number as S-11:** when her reps at the current load give her a full rung's
 * > worth of headroom, the rung is taken."
 *
 * Both conditions come from that text, and both are built from facts the ledger already declares:
 *   1. "no micro-loading" → the real rung (F-2's learned grid) exceeds the equipment's finest step
 *      (B-6). FALSE on a barbell, which is why S-22 is untouched there.
 *   2. "cannot move without breaking her" / "a full rung's worth of headroom" → one test on her own
 *      measured reps-per-rung (F-13): `reps − perRung ≥ Tlo`.
 * No constant was added. The situation defined itself.
 */
import { decideExercise } from '@/engine/v5/loop2';
import { correctInSession } from '@/engine/v5/loop1';
import { isBigJump, rungSize } from '@/engine/v5/grid';
import type { Band, ExerciseMeta, ExerciseState, SessionRecord, SetPerf } from '@/engine/v5/types';

const BAND: Band = { lo: 8, hi: 10 };
/** Her gym's chest-press stack jumps 40 → 50. She has performed both, so the LEARNED grid is coarse. */
const stack: ExerciseMeta = { equipment: 'machine', bodyweight: false, observedLoads: [40, 50] };
const barbell: ExerciseMeta = { equipment: 'barbell', bodyweight: false, observedLoads: [40, 42.5, 45] };

/** History dense enough to fit a real slope (F-12: 4 like-for-like pairs at distinct loads). */
function slopeHistory(loads: number[], reps: number[], rest = 90): SessionRecord[] {
  return loads.map((load, i) => ({ load, sets: [{ load, reps: reps[i], restBeforeS: rest }] }));
}

describe('the condition, stated as the register states it', () => {
  it('a coarse stack IS a big jump; a barbell is NOT (so S-22 is untouched there)', () => {
    expect(rungSize(40, 'machine', [40, 50])).toBe(10);
    expect(isBigJump(40, 'machine', [40, 50])).toBe(true);
    expect(isBigJump(42.5, 'barbell', [40, 42.5, 45])).toBe(false);
    expect(isBigJump(80, 'barbell')).toBe(false); // no grid yet — the increment IS the rung
  });
});

describe('S-28 · the load holds, and the release is her own measured headroom', () => {
  // Her history across the two real rungs. The 10 kg step costs her ~2 reps (a shallow slope), so
  // the whole mechanism turns on ONE rep — which is exactly the point: the trigger and the release
  // are the same measured number, read in both directions.
  const history = slopeHistory([40, 50, 40, 50], [10, 8, 9, 7]);
  const state: ExerciseState = { exerciseId: 'machine_chest_press', load: 40, band: BAND, sets: 3, history };
  const at = (reps: number): SetPerf[] => [0, 1, 2].map(() => ({ load: 40, reps, restBeforeS: 90 }));

  it('she cleared every set — but the step would land her under Tlo, so the load HOLDS', () => {
    const out = decideExercise({ state, session: at(9), meta: stack }); // 9 − 2 = 7 < 8
    expect(out.decision).toBe('rung_out_of_reach');
    expect(out.load).toBe(40); // "T is hers, so the engine may not quietly raise it"
  });

  it('the band is NEVER quietly raised — T stays exactly hers', () => {
    const out = decideExercise({ state, session: at(9), meta: stack });
    expect(out.band).toEqual(BAND);
  });

  it('"within reach": one more rep gives a full rung\'s worth of headroom, and the rung IS taken', () => {
    const out = decideExercise({ state, session: at(10), meta: stack }); // 10 − 2 = 8 ≥ 8
    expect(out.decision).toBe('progress');
    expect(out.load).toBe(50);
  });

  it('a steeper lift holds longer — the engine follows HER number, not a threshold', () => {
    // The same 10 kg rung, but her reps say it costs ~6. Nine reps is nowhere near enough.
    const steep = slopeHistory([40, 50, 40, 50], [9, 4, 10, 3]);
    const s: ExerciseState = { ...state, history: steep };
    expect(decideExercise({ state: s, session: at(9), meta: stack }).decision).toBe('rung_out_of_reach');
  });

  it('S-22 is untouched on micro-loadable equipment — "All three sets hit 8. The row goes to 47.5."', () => {
    const bbHistory = slopeHistory([40, 42.5, 45, 47.5], [10, 9, 8, 7]);
    const bb: ExerciseState = { exerciseId: 'bb_row', load: 45, band: BAND, sets: 3, history: bbHistory };
    const out = decideExercise({
      state: bb,
      session: [0, 1, 2].map(() => ({ load: 45, reps: 8, restBeforeS: 90 })),
      meta: barbell,
    });
    expect(out.decision).toBe('progress');
    expect(out.load!).toBeGreaterThan(45);
  });

  it('silent until her slope is fitted (F-12) — no measured fact, no claim that the jump breaks her', () => {
    const thin: ExerciseState = { exerciseId: 'machine_chest_press', load: 40, band: BAND, sets: 3, history: [] };
    const out = decideExercise({ state: thin, session: at(9), meta: stack });
    expect(out.decision).toBe('progress'); // B-5's cautious rung stands
  });
});

describe('S-28 · Loop 1 honours the same law, so it cannot re-enter through the in-session door', () => {
  it('above Thi on a coarse stack, a raise that would break the contract does not happen', () => {
    const r = correctInSession({
      currentLoad: 40, band: BAND, repsJustDone: 12, correctionsSoFar: 0, isLastSet: false,
      meta: stack, perRung: 6,
    });
    expect(r.corrected).toBe(false);
    expect(r.nextLoad).toBe(40);
  });

  it('…but once the overshoot really covers the rung, it raises', () => {
    const r = correctInSession({
      currentLoad: 40, band: BAND, repsJustDone: 16, correctionsSoFar: 0, isLastSet: false,
      meta: stack, perRung: 6,
    });
    expect(r.corrected).toBe(true);
    expect(r.nextLoad).toBe(50);
  });

  it('a barbell raise is never gated by S-28 — the rung is the increment, not a jump', () => {
    const r = correctInSession({
      currentLoad: 45, band: BAND, repsJustDone: 12, correctionsSoFar: 0, isLastSet: false,
      meta: barbell, perRung: 1.5,
    });
    expect(r.corrected).toBe(true);
    expect(r.nextLoad!).toBeGreaterThan(45);
  });
});

describe('the oscillation S-28 exists to end', () => {
  it('10 sessions on a coarse stack settle instead of flipping 40 ↔ 50 for ever', () => {
    let load: number | null = 40;
    let history: SessionRecord[] = slopeHistory([40, 50, 40, 50], [9, 4, 10, 3]);
    const prescribed: (number | null)[] = [];
    let rotations = 0;
    for (let i = 0; i < 10; i++) {
      const reps = load! <= 40 ? 9 : 4; // the 10 kg step is genuinely beyond her
      const sets: SetPerf[] = [0, 1, 2].map(() => ({ load, reps, restBeforeS: 90 }));
      const state: ExerciseState = { exerciseId: 'machine_chest_press', load, band: BAND, sets: 3, history };
      const out = decideExercise({ state, session: sets, meta: stack, rotationAvailable: true });
      if (out.decision === 'stall_rotate') rotations += 1;
      history = [{ load, sets }, ...history];
      load = out.load;
      prescribed.push(load);
    }
    // It never asks for 50 again, so it never fails at 50, so it never mistakes a coarse grid for a
    // stalled LIFT and rotates her chest press away. That misfire was the real cost of the gap.
    expect(prescribed.every((l) => l === 40)).toBe(true);
    expect(rotations).toBe(0);
  });
});
