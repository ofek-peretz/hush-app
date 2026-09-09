/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * LOOP 2 — THE HALF THAT READS HER HISTORY.
 *
 * ⛔ The first pass over Loop 2 (`v5_loop2_every_branch`) took the file from 18% to 57% on mutation
 * testing, and mapping the 173 survivors showed exactly one shape: they all sit in the helpers that
 * READ HISTORY, and the first pass drove almost every case with an empty one.
 *
 *     line  39 (13 survivors) · stalledHere — did she hit THIS wall before
 *     line  61 (13)           · the rail record — heaviest load she ever completed at Tlo
 *     line 141 (12)           · the back-off target — heaviest full clear STRICTLY BELOW the wall
 *     line 183 ( 9)           · noneUsable — a session with sets but nothing to read
 *     line 115 ( 8)           · sameLoad — the EPS compare against the load she is on
 *     line 255 ( 6)           · atFloor — the empty bar, where there is nothing to back off to
 *
 * Every one is a comparison with a boundary: `>=` against `>`, `> best` against `< best`, `break`
 * against `continue`, "strictly below" against "at or below". A history of one session cannot tell
 * those apart, which is why they survived a suite that passes.
 *
 * So each test here builds the SHAPE of history the predicate is about — a wall hit twice with a
 * back-off between it, a clear at a load and a failure at the same load, a record just above and
 * just below the wall — and asserts the decision the register names for it.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { decideExercise } from '@/engine/v5/loop2';
import type { Band, ExerciseMeta, ExerciseState, SessionRecord, SetPerf } from '@/engine/v5/types';

const BAND: Band = { lo: 8, hi: 10 };
const BARBELL: ExerciseMeta = { equipment: 'barbell', bodyweight: false, observedLoads: [] };

const set = (load: number | null, reps: number, extra: Partial<SetPerf> = {}): SetPerf => ({ load, reps, ...extra });
const rec = (load: number | null, sets: SetPerf[]): SessionRecord => ({ load, sets });
/** A session where every set met Tlo, at `load`. */
const cleared = (load: number): SessionRecord => rec(load, [set(load, 10), set(load, 10), set(load, 10)]);
/** A session at `load` that did not clear. */
const failed = (load: number): SessionRecord => rec(load, [set(load, 5), set(load, 5), set(load, 4)]);

const decide = (session: SetPerf[], over: Partial<ExerciseState> = {}, rotationAvailable = false) =>
  decideExercise({
    state: { exerciseId: 'bb_bench_press', load: 60, band: BAND, sets: 3, history: [], ...over },
    session,
    meta: BARBELL,
    rotationAvailable,
  });

describe('the rail — the heaviest load she ever COMPLETED at Tlo', () => {
  /*
   * `if (s.reps >= band.lo && (best == null || s.load > best)) best = s.load;`
   *
   * Thirteen survivors. `>=` → `>` loses the set that landed exactly on Tlo; `>` → `<` picks her
   * LIGHTEST completed load as the ceiling, which would pin a progressing athlete under her own
   * warm-up for ever. Both need a history with more than one load in it to tell apart.
   */
  it('reads the HEAVIEST completed load, not the first or the lightest', () => {
    // 50 then 70 then 60, all completed. The ceiling must come off 70.
    const history = [cleared(60), cleared(70), cleared(50)];
    const r = decide([set(65, 12), set(65, 12), set(65, 12)], { load: 65, history });
    expect(r.decision).toBe('progress');
    // One rung above her best (70) is 72.5 — a raise may reach it and may not exceed it.
    expect(r.load).toBeLessThanOrEqual(72.5);
    expect(r.load).toBeGreaterThan(65);
  });

  it('a set exactly AT Tlo counts toward the rail; one rep short does not', () => {
    const atTlo = decide([set(60, 12), set(60, 12), set(60, 12)], {
      load: 60, history: [rec(80, [set(80, BAND.lo), set(80, BAND.lo), set(80, BAND.lo)])],
    });
    const shortOfTlo = decide([set(60, 12), set(60, 12), set(60, 12)], {
      load: 60, history: [rec(80, [set(80, BAND.lo - 1), set(80, BAND.lo - 1), set(80, BAND.lo - 1)])],
    });
    // The 80 kg session only raises her ceiling when its sets actually MET the band.
    expect(atTlo.load).toBeGreaterThanOrEqual(shortOfTlo.load);
  });

  it('an approach set never lifts the rail', () => {
    const withApproach = decide([set(60, 12), set(60, 12), set(60, 12)], {
      load: 60, history: [rec(200, [set(200, 12, { isApproach: true })])],
    });
    const without = decide([set(60, 12), set(60, 12), set(60, 12)], { load: 60, history: [] });
    expect(withApproach.load).toBe(without.load); // a 200 kg approach set is not a 200 kg ceiling
  });
});

describe('the back-off target is read STRICTLY BELOW the wall', () => {
  /*
   * `if (rec.load >= below - EPS) continue;` — twelve survivors across this and its neighbour.
   *
   * The comment above it records the bug it fixes: a back-off target EQUAL to the wall is not a
   * back-off, it is a freeze, and the lift sat at 40 kg for ever. `>=` → `>` reopens exactly that.
   */
  it('a clear AT the stalled load is not a step down — the engine still moves', () => {
    // She cleared 60 once, and is now failing 60. 60 is not a back-off from 60.
    const history = [failed(60), cleared(60)];
    const r = decide([set(60, 5), set(60, 5), set(60, 4)], { load: 60, history }, false);
    expect(r.load).toBeLessThan(60); // it must step DOWN, not freeze
  });

  it('the heaviest clear BELOW the wall is the one it steps to', () => {
    // Two lighter clears: 50 and 55. The step down is to the heavier of them.
    const history = [failed(60), cleared(50), cleared(55)];
    const r = decide([set(60, 5), set(60, 5), set(60, 4)], { load: 60, history }, false);
    expect(r.load).toBeLessThan(60);
    expect(r.load).toBeGreaterThanOrEqual(50);
  });

  it('a clear ABOVE the wall is never a back-off target', () => {
    const history = [failed(60), cleared(80)];
    const r = decide([set(60, 5), set(60, 5), set(60, 4)], { load: 60, history }, false);
    expect(r.load).toBeLessThanOrEqual(60); // it cannot "back off" upward
  });

  it('a session with no sets contributes nothing', () => {
    const history = [failed(60), rec(50, []), cleared(45)];
    const r = decide([set(60, 5), set(60, 5), set(60, 4)], { load: 60, history }, false);
    expect(r.load).toBeLessThan(60);
  });
});

describe('attempts at the current load — the run that decides a stall', () => {
  /*
   * `if (!sameLoad || cleared) break;` — eight survivors. `||` → `&&` keeps counting across a
   * DIFFERENT load or across a session she cleared, which manufactures a stall out of a history
   * that contains none.
   */
  it('a cleared session ENDS the run — a stall is consecutive failures, not a tally', () => {
    // fail, fail, but a CLEAR sits between them: the run is 1, not 3.
    const broken = [failed(60), cleared(60), failed(60), failed(60)];
    const r = decide([set(60, 5), set(60, 5), set(60, 4)], { load: 60, history: broken }, true);
    expect(r.decision).not.toBe('stall_rotate');
  });

  it('a session at a DIFFERENT load ends the run too', () => {
    const elsewhere = [rec(55, [set(55, 5), set(55, 5)]), failed(60)];
    const r = decide([set(60, 5), set(60, 5), set(60, 4)], { load: 60, history: elsewhere }, true);
    expect(r.decision).not.toBe('stall_rotate');
  });

  it('an unbroken run of failures at the same load IS a stall', () => {
    const run = [failed(60), failed(60), failed(60), failed(60)];
    const r = decide([set(60, 4), set(60, 4), set(60, 3)], { load: 60, history: run }, false);
    expect(['stall_backoff', 'hold']).toContain(r.decision);
    expect(r.load).toBeLessThanOrEqual(60);
  });
});

describe('S-25.2 · the same wall twice, with a rebuild between', () => {
  /*
   * `stalledHere` + `sawBackoff` — thirteen survivors on line 39 alone. Rotation needs BOTH: a
   * failure at this load, and a lighter occurrence MORE RECENT than an earlier failure at it.
   * Deleting either half rotates on a first stall or never rotates at all.
   */
  const wall = [set(60, 5), set(60, 5), set(60, 4)];

  it('back off, re-climb, hit it again → the engine asks to rotate', () => {
    const history = [failed(60), cleared(55), failed(60)]; // newest first
    const r = decide(wall, { load: 60, history }, true);
    expect(r.decision).toBe('stall_rotate');
    expect(r.wantsChange).toBe('rotate');
  });

  it('…and without the back-off between, it backs off instead of rotating', () => {
    const history = [failed(60), failed(60)];
    const r = decide(wall, { load: 60, history }, true);
    expect(r.decision).not.toBe('stall_rotate');
  });

  it('…and a rotation is never enacted when the caller has nowhere to send her', () => {
    const history = [failed(60), cleared(55), failed(60)];
    const r = decide(wall, { load: 60, history }, false);
    expect(r.wantsChange).toBeUndefined();
  });
});

describe('the floor is the one place a first stall may rotate at once', () => {
  /*
   * `atFloor` — six survivors. Below the empty bar there is nothing, so S-25.1's step-down does not
   * exist and step 2 is the only step left. Flipping either EPS compare either freezes her on the
   * bar or lets a mid-weight stall rotate on its first bad day.
   */
  it('stalled ON the bar with a rotation available → rotate', () => {
    const r = decide([set(20, 4), set(20, 3), set(20, 3)], { load: 20, history: [failed(20), failed(20)] }, true);
    expect(r.load).toBe(20);
    expect(r.decision).toBe('stall_rotate');
  });

  it('stalled one rung ABOVE the bar is not at the floor — it steps down first', () => {
    const r = decide([set(22.5, 4), set(22.5, 3), set(22.5, 3)], { load: 22.5, history: [failed(22.5)] }, true);
    expect(r.decision).not.toBe('stall_rotate');
    expect(r.load).toBeLessThanOrEqual(22.5);
  });
});

describe('a session with sets but nothing usable', () => {
  /*
   * `noneUsable` — nine survivors. A record can hold sets that carry no load or no reps (an aborted
   * lift, a mis-log). It is not a cleared session and it is not a failed one; it is unreadable, and
   * the run of them is what reaches for a rotation on a lift she cannot perform at all.
   */
  it('zero-rep sessions in a row on a loaded lift reach for a change, not a progression', () => {
    const dead = rec(60, [set(60, 0), set(60, 0), set(60, 0)]);
    const r = decide([set(60, 0), set(60, 0), set(60, 0)], { load: 60, history: [dead, dead, dead] }, true);
    expect(r.decision).not.toBe('progress');
    expect(r.load).toBeLessThanOrEqual(60);
  });

  it('a single unreadable session is not a verdict — one bad day holds', () => {
    const r = decide([set(60, 10), set(60, 10), set(60, 10)], {
      load: 60, history: [rec(60, [set(null, 0)])],
    }, true);
    expect(r.decision).toBe('progress'); // this session cleared; the junk one says nothing
  });
});

describe('the history window and determinism', () => {
  it('is deterministic across a long history (I-24)', () => {
    const history = [failed(60), cleared(55), failed(60), cleared(50), cleared(45), failed(60)];
    const a = decide([set(60, 5), set(60, 5), set(60, 4)], { load: 60, history }, true);
    const b = decide([set(60, 5), set(60, 5), set(60, 4)], { load: 60, history }, true);
    expect(a).toEqual(b);
  });

  it('never returns a load below the equipment floor, whatever the history says', () => {
    const histories: SessionRecord[][] = [
      [],
      [failed(20), failed(20), failed(20)],
      [cleared(200)],
      [rec(null, []), rec(null, [set(null, 0)])],
    ];
    for (const history of histories) {
      const r = decide([set(20, 1), set(20, 0), set(20, 0)], { load: 20, history }, true);
      expect({ n: history.length, ok: r.load == null || r.load >= 20 }).toEqual({ n: history.length, ok: true });
    }
  });
});
