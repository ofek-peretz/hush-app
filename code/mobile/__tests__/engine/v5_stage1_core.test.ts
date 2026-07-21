/**
 * Engine v5 · Stage 1 — the pure core. One `describe` per situation it owns; the test name carries
 * the S-number, so coverage is a count, not a feeling (register Part 7).
 */
import { correctInSession } from '@/engine/v5/loop1';
import { decideExercise } from '@/engine/v5/loop2';
import { snapDown, nextRung, prevRung } from '@/engine/v5/grid';
import { theilSenSlope, percentileNearestRank, median } from '@/engine/v5/stats';
import type { Band, ExerciseMeta, ExerciseState, SetPerf, SessionRecord } from '@/engine/v5/types';

const BAND: Band = { lo: 8, hi: 12 };
const bb = (over: Partial<ExerciseMeta> = {}): ExerciseMeta => ({ equipment: 'barbell', bodyweight: false, ...over });
const S = (load: number | null, reps: number, rest = 90, isApproach = false): SetPerf => ({ load, reps, restBeforeS: rest, isApproach });

const state = (over: Partial<ExerciseState> = {}): ExerciseState => ({
  exerciseId: 'bench', load: 80, band: BAND, sets: 3, history: [], ...over,
});

// ─────────────────────────── Loop 1 (in-session) ───────────────────────────
describe('S-11 · a set above Thi raises the load for the next set', () => {
  it('overshoot (15 > 12) → the next set is heavier, always inside the rail', () => {
    const r = correctInSession({ currentLoad: 80, band: BAND, repsJustDone: 15, correctionsSoFar: 0, isLastSet: false, meta: bb(), perRung: null });
    expect(r.direction).toBe('up');
    expect(r.nextLoad!).toBeGreaterThan(80);
  });
});

describe('S-12 · a set below Tlo drops the load for the next set', () => {
  it('shortfall (6 < 8) → the next set is lighter', () => {
    const r = correctInSession({ currentLoad: 80, band: BAND, repsJustDone: 6, correctionsSoFar: 0, isLastSet: false, meta: bb(), perRung: null });
    expect(r.direction).toBe('down');
    expect(r.nextLoad!).toBeLessThan(80);
  });
  it('a set inside the band is exactly right — no correction', () => {
    const r = correctInSession({ currentLoad: 80, band: BAND, repsJustDone: 10, correctionsSoFar: 0, isLastSet: false, meta: bb(), perRung: null });
    expect(r.corrected).toBe(false);
  });
});

describe('S-13 · at most 2 corrections per exercise, never after the last set', () => {
  it('the cap is honoured', () => {
    const r = correctInSession({ currentLoad: 80, band: BAND, repsJustDone: 20, correctionsSoFar: 2, isLastSet: false, meta: bb(), perRung: null });
    expect(r.corrected).toBe(false);
  });
  it('no correction after the last set', () => {
    const r = correctInSession({ currentLoad: 80, band: BAND, repsJustDone: 20, correctionsSoFar: 0, isLastSet: true, meta: bb(), perRung: null });
    expect(r.corrected).toBe(false);
  });
});

describe('S-51 · Loop 1 never corrects a bodyweight lift (no load axis)', () => {
  it('bodyweight → no load correction', () => {
    const r = correctInSession({ currentLoad: null, band: BAND, repsJustDone: 20, correctionsSoFar: 0, isLastSet: false, meta: bb({ bodyweight: true, equipment: 'bodyweight' }), perRung: null });
    expect(r.corrected).toBe(false);
    expect(r.nextLoad).toBeNull();
  });
});

// ─────────────────────────── Loop 2 (between sessions) ───────────────────────────
describe('S-22 · all working sets met Tlo → the load goes up', () => {
  it('progress, and the athlete never has to reach the top of the band', () => {
    const r = decideExercise({ state: state({ load: 80, history: [{ load: 80, sets: [S(80, 8), S(80, 8)] }] }), session: [S(80, 8), S(80, 8), S(80, 8)], meta: bb() });
    expect(r.decision).toBe('progress');
    expect(r.load!).toBeGreaterThan(80);
  });
});

describe('S-24 · not every set met Tlo → hold at the median anchor', () => {
  it('holds, does not cut, does not raise', () => {
    const r = decideExercise({ state: state({ load: 80 }), session: [S(80, 8), S(80, 8), S(80, 6)], meta: bb() });
    expect(r.decision).toBe('hold');
    expect(r.load).toBe(80);
  });
});

describe('L10 · the anchor is the MEDIAN of met-Tlo sets — a fat finger cannot be the median', () => {
  it('S-14 · a mis-keyed 400 among 80s does not move the prescription off 80', () => {
    // three sets met Tlo: 80, 80, 400 (fat finger). median = 80. progress steps from 80, not 400.
    const r = decideExercise({
      state: state({ load: 80, history: [{ load: 80, sets: [S(80, 8), S(80, 8)] }] }),
      session: [S(80, 8), S(80, 8), S(400, 8)],
      meta: bb(),
    });
    expect(r.decision).toBe('progress');
    // steps from the median (80), so the next load is a small step above 80 — nowhere near 400.
    expect(r.load!).toBeLessThan(100);
  });
});

describe('S-15 · she loads far LESS than prescribed — the median absorbs the light mis-key too', () => {
  it('a 4-for-40 on the last set cannot drag the anchor down', () => {
    // Sets at 40, 40, and a mis-keyed 4 — all met Tlo, so this is a PROGRESS decision, and the
    // anchor is the median of {40, 40, 4} = 40. The 4 never becomes a load she is prescribed.
    const r = decideExercise({
      state: state({ load: 40 }),
      session: [S(40, 8), S(40, 8), S(4, 12)],
      meta: bb(),
    });
    expect(r.decision).toBe('progress');
    expect(r.load!).toBeGreaterThanOrEqual(40); // stepped up FROM 40, never from 4
  });
});

describe('L11 · the rail caps progress at one rung above her settled best at Tlo', () => {
  it('S-49 · cannot prescribe far above her demonstrated record even after a strong session', () => {
    // settled best at Tlo = 80. rail = next rung above 80 = 82.5. A big measured headroom cannot pass it.
    const hist: SessionRecord[] = [{ load: 80, sets: [S(80, 8), S(80, 8)] }];
    const r = decideExercise({ state: state({ load: 80, history: hist }), session: [S(80, 12), S(80, 12), S(80, 12)], meta: bb() });
    expect(r.decision).toBe('progress');
    expect(r.load!).toBeLessThanOrEqual(82.5 + 1e-6);
  });
});

describe('S-16 · an ambiguous session (no usable working set) holds the load', () => {
  it('all-zero → hold, bank nothing', () => {
    const r = decideExercise({ state: state({ load: 80 }), session: [S(80, 0), S(80, 0)], meta: bb() });
    expect(r.decision).toBe('ambiguous');
    expect(r.load).toBe(80);
  });
  it('approach sets are excluded from the decision (S-60)', () => {
    const r = decideExercise({ state: state({ load: 80 }), session: [S(40, 8, 90, true)], meta: bb() });
    expect(r.decision).toBe('ambiguous');
  });
});

describe('S-25 · a stall backs off, then rotates', () => {
  it('B-3 · after N failed occurrences at a load, back off to the heaviest full-clear', () => {
    // N = ATTEMPTS_TO_CLEAR_SEED = 1 (B-3, novice, no cleared runs → seed 1), so the back-off lands on
    // the SECOND consecutive failed occurrence — a first miss holds (S-24). Fails this session at 82.5;
    // history holds a full clear at 80.
    const hist: SessionRecord[] = [{ load: 82.5, sets: [S(82.5, 8), S(82.5, 6)] }, { load: 80, sets: [S(80, 8), S(80, 8)] }];
    const r = decideExercise({ state: state({ load: 82.5, history: hist }), session: [S(82.5, 8), S(82.5, 6)], meta: bb() });
    expect(r.decision).toBe('stall_backoff');
    expect(r.load).toBe(80);
  });
  it('a FIRST stall backs off even with rotation available (S-25 order — back off before rotate)', () => {
    // No back-off in her history yet → re-climb first, never rotate on the first wall.
    const r = decideExercise({ state: state({ load: 80, history: [{ load: 80, sets: [S(80, 6), S(80, 6)] }] }), session: [S(80, 6), S(80, 5)], meta: bb(), rotationAvailable: true });
    expect(r.decision).toBe('stall_backoff');
    expect(r.wantsChange).toBeUndefined();
  });
  it('a REPEATED stall at the same wall (stall → back off → re-climb → stall again) rotates (S-25.2)', () => {
    // Newest-first: the re-climb stall at 80, the back-off/clear at 75, the original stall at 80.
    const hist: SessionRecord[] = [
      { load: 80, sets: [S(80, 6), S(80, 6)] },
      { load: 75, sets: [S(75, 8), S(75, 8)] },
      { load: 80, sets: [S(80, 6), S(80, 6)] },
    ];
    const r = decideExercise({ state: state({ load: 80, history: hist }), session: [S(80, 6), S(80, 5)], meta: bb(), rotationAvailable: true });
    expect(r.decision).toBe('stall_rotate');
    expect(r.wantsChange).toBe('rotate');
  });
});

/**
 * **S-39 · her numbers come down across the board.** There is no deload construct (`injury_flag`,
 * `DELOAD_LOAD`, `DELOAD_SETS` — all deleted): a deload is a *prediction* device, and **a measured
 * descent IS the deload**. So the only thing to prove is that the SAME rules run in both directions —
 * the descent needs no special machinery, and the climb back needs no permission.
 */
describe('S-39 · the engine follows her down, and back up — no deload construct', () => {
  it('a descent is just the ordinary stall back-off, and the re-climb is just the ordinary progress', () => {
    const down = decideExercise({
      state: state({ load: 80, history: [{ load: 80, sets: [S(80, 6), S(80, 6)] }] }),
      session: [S(80, 6), S(80, 5)], meta: bb(),
    });
    expect(down.decision).toBe('stall_backoff');
    expect(down.load!).toBeLessThan(80); // it goes where her numbers went — no deload constant involved

    const lower = down.load!;
    const back = decideExercise({
      state: state({ load: lower, history: [{ load: lower, sets: [S(lower, 8), S(lower, 8)] }] }),
      session: [S(lower, 8), S(lower, 8), S(lower, 8)], meta: bb(),
    });
    expect(back.decision).toBe('progress');
    expect(back.load!).toBeGreaterThan(lower); // …and back up the moment she clears again
  });
});

describe('S-51/S-52 · bodyweight progresses on reps and graduates at Thi or on a stall', () => {
  const bw = bb({ bodyweight: true, equipment: 'bodyweight' });
  it('every set reaches Thi → graduate (too easy)', () => {
    const r = decideExercise({ state: state({ load: null, history: [] }), session: [S(null, 12), S(null, 12), S(null, 12)], meta: bw });
    expect(r.decision).toBe('graduate');
    expect(r.wantsChange).toBe('graduate');
  });
  it('reps climbing inside the band → progress, no graduation', () => {
    const r = decideExercise({ state: state({ load: null }), session: [S(null, 9), S(null, 9), S(null, 8)], meta: bw });
    expect(r.decision).toBe('progress');
  });
  it("S-52's OWN trap case · a 12-15 athlete stuck FLAT at 3×12 (Tlo met every time) graduates on the stall — never frozen", () => {
    // The register's motivating example verbatim: she meets Tlo=12 every session, never reaches
    // Thi=15, and has no load lever. "Failed to clear Tlo" can never fire here — reps not MOVING is
    // the wall. Two flat occurrences behind her (N=1 seed) + this one → attempts 2 > N → graduate.
    const highBand: Band = { lo: 12, hi: 15 };
    const flat = { load: null, sets: [S(null, 12), S(null, 12), S(null, 12)] };
    const r = decideExercise({ state: state({ load: null, band: highBand, history: [flat, flat] }), session: [S(null, 12), S(null, 12), S(null, 12)], meta: bw });
    expect(r.decision).toBe('graduate');
    expect(r.wantsChange).toBe('graduate');
  });
  it('stuck BELOW Tlo (reps not moving) → the same stall graduates', () => {
    const highBand: Band = { lo: 12, hi: 15 };
    const rec = { load: null, sets: [S(null, 11), S(null, 10)] };
    const r = decideExercise({ state: state({ load: null, band: highBand, history: [rec, rec] }), session: [S(null, 11), S(null, 10)], meta: bw });
    expect(r.decision).toBe('graduate');
  });
  it('climbing below Tlo — every fresh post-graduation lift — is PROGRESS, never a chain-graduation', () => {
    // 8 → 9 in a 12-15 band: she is adding reps, exactly what a new harder lift looks like (S-52:
    // "graduating drops her below the new lift's Tlo and she climbs again — no harm"). The old
    // "not every set met Tlo" read would have graduated her again after two occurrences of honest
    // climbing, cascading up the ladder.
    const highBand: Band = { lo: 12, hi: 15 };
    const r = decideExercise({
      state: state({ load: null, band: highBand, history: [{ load: null, sets: [S(null, 8), S(null, 8)] }] }),
      session: [S(null, 9), S(null, 9)],
      meta: bw,
    });
    expect(r.decision).toBe('progress');
    expect(r.wantsChange).toBeUndefined();
  });
  it('repeating a number is not an advance — a flat occurrence HOLDS (S-32b stays honest)', () => {
    // One flat occurrence is not yet a stall (attempts 1 = N 1) and not progress either: Loop 3 must
    // not read "she repeated 3×12" as a lift advancing (volume grows only on progress, S-32).
    const highBand: Band = { lo: 12, hi: 15 };
    const flat = { load: null, sets: [S(null, 12), S(null, 12), S(null, 12)] };
    const r = decideExercise({ state: state({ load: null, band: highBand, history: [flat] }), session: [S(null, 12), S(null, 12), S(null, 12)], meta: bw });
    expect(r.decision).toBe('hold');
  });
});

// ─────────────────────────── grid + stats ───────────────────────────
describe('grid · snap DOWN, and one rung is a real weight', () => {
  it('snaps down to the learned rung, never up', () => {
    expect(snapDown(83, 'barbell', [80, 82.5, 85])).toBe(82.5);
  });
  it('falls back to the starting increment with no grid (B-6)', () => {
    expect(snapDown(83, 'barbell')).toBe(82.5);
  });
  it('nextRung / prevRung step by real rungs', () => {
    expect(nextRung(80, 'barbell', [80, 82.5, 85])).toBe(82.5);
    expect(prevRung(82.5, 'barbell', [80, 82.5, 85])).toBe(80);
  });
});

describe('F-13 · the two named estimators are deterministic', () => {
  it('Theil–Sen returns the median pairwise slope', () => {
    // points (0,0),(1,2),(2,4) → all slopes 2 → 2
    expect(theilSenSlope([{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 4 }], 1)).toBe(2);
  });
  it('too few pairs → null (falls back to the bootstrap)', () => {
    expect(theilSenSlope([{ x: 0, y: 0 }], 1)).toBeNull();
  });
  it('nearest-rank percentile is stable on small samples', () => {
    expect(percentileNearestRank([1, 2, 3, 4], 0.75)).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});
