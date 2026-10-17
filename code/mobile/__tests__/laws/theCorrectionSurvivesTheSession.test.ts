/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE THING THIS PRODUCT IS FOR LEAVES A TRACE IN THE RECORD OF THE SESSION IT HAPPENED IN.
 *
 * Moving the iron BETWEEN SETS, from the reps she just did, is the whole argument — the register
 * closes on it: *"this engine is inside the set, sees the number, and moves the iron in ninety
 * seconds."*
 *
 * ⛔ AND IT LIVED FOR 2.2 SECONDS AND THEN NOWHERE (found 2026-08-22). The finish ledger reports
 * LOOP 2 — what the next occurrence gets. The Saturday letter mirrors the week. And the session
 * record, the one surface that claims to BE what happened, printed her sets as flat `weight×reps`
 * chips: a reader could see the weight change between chip two and chip three with no way to know
 * whether SHE had moved it or the engine had.
 *
 * ── ⚠️ WHICH IS THE ENTIRE DIFFICULTY, AND THE REASON THIS IS A DOMAIN MODULE ───────────────────
 * `carryWeightForward` copies the weight she ACTUALLY LIFTED onto the rest of the exercise before
 * Loop 1 runs (Rev 8, ratified: *"a weight the athlete actually lifts is the baseline for the REST
 * of the exercise"*). So a prescription that changed between two sets may be **her** doing, not the
 * engine's. **A record that credited the engine with a weight she reached for herself would be
 * worse than a record that said nothing**, and these tests are that guarantee.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';
import { correctionsIn, correctionsByPosition } from '@/domain/liveCorrections';
import type { SetLog } from '@/data/local/models';

const set = (
  exerciseId: string,
  setIndex: number,
  recommendedWeight: number | null,
  actualWeight: number | null,
  actualReps: number,
  edited = false,
): SetLog =>
  ({
    exerciseId,
    setIndex,
    recommendedWeight,
    recommendedReps: 8,
    actualWeight,
    actualReps,
    edited,
    persistedAt: '2026-08-22T10:00:00.000Z',
  }) as SetLog;

describe('the correction is readable out of a finished session', () => {
  it('⛔ an eased load is found, with the set it landed on', () => {
    // She was asked for 40 and got 6 — below the band — so set 3 was prescribed 37.5.
    const sets = [
      set('bench', 0, 40, 40, 9),
      set('bench', 1, 40, 40, 6),
      set('bench', 2, 37.5, 37.5, 8),
    ];
    expect(correctionsIn(sets)).toEqual([
      { exerciseId: 'bench', position: 3, from: 40, to: 37.5, direction: 'down' },
    ]);
  });

  it('⛔ a raise is found the same way, and carries the direction', () => {
    const sets = [set('row', 0, 40, 40, 14), set('row', 1, 45, 45, 10)];
    expect(correctionsIn(sets)[0]).toMatchObject({ position: 2, direction: 'up', from: 40, to: 45 });
  });

  it('⛔⛔ HER OWN EDIT IS NOT THE ENGINE, and this is the assertion the module exists for', () => {
    /*
     * She was prescribed 40, reached for the 45s and logged 45. `carryWeightForward` then prescribes
     * 45 for the next set — and Loop 1 did NOTHING, because 10 reps is inside the band. A naive
     * `recommendedWeight[i] !== recommendedWeight[i-1]` reads that as an engine raise and tells her
     * the app moved a weight she moved herself.
     */
    const sets = [set('press', 0, 40, 45, 10, true), set('press', 1, 45, 45, 9)];
    expect(correctionsIn(sets)).toEqual([]);
  });

  it('⚠️ …and the engine is still credited when it acts ON TOP of her edit', () => {
    // Same edit, but this time she got 14 reps on the 45 — above the band — so Loop 1 raised it to
    // 47.5 from the weight she actually lifted. The engine moved 45 → 47.5, and only that.
    const sets = [set('press', 0, 40, 45, 14, true), set('press', 1, 47.5, 47.5, 9)];
    expect(correctionsIn(sets)).toEqual([
      { exerciseId: 'press', position: 2, from: 45, to: 47.5, direction: 'up' },
    ]);
  });

  it('⛔ set 1 can never carry one — there is no set before it to have been read', () => {
    expect(correctionsIn([set('bench', 0, 40, 40, 9)])).toEqual([]);
  });

  it('⛔ two lifts are never compared across the gap between them', () => {
    /*
     * The last set of one lift against the first set of the next is not a correction; it is an
     * exercise transition, and reading it as one would report a "correction" on every single lift
     * change of every workout — which is why the grouping lives in the module and not at a call site.
     */
    const sets = [set('bench', 0, 40, 40, 9), set('squat', 0, 80, 80, 9)];
    expect(correctionsIn(sets)).toEqual([]);
  });

  it('⚠️ a lift with no load axis produces none — null is the absence of a weight, never zero', () => {
    const sets = [set('pull_up', 0, null, null, 8), set('pull_up', 1, null, null, 6)];
    expect(correctionsIn(sets)).toEqual([]);
  });

  it('⚠️ two figures that are the same rung are the same weight', () => {
    // Plate maths and unit conversion make 40 and 40.000000000000004 the same load. A phantom mark
    // on the record would be a claim about her training.
    const sets = [set('bench', 0, 40, 40, 9), set('bench', 1, 40.000000000000004, 40, 9)];
    expect(correctionsIn(sets)).toEqual([]);
  });

  it('⚠️ a lift trained twice in one session reads as ONE sequence', () => {
    // Exercise-keyed, like everything else in this engine — the second block continues the first.
    const sets = [
      set('bench', 0, 40, 40, 9),
      set('squat', 0, 80, 80, 9),
      set('bench', 1, 42.5, 42.5, 9),
    ];
    expect(correctionsIn(sets)).toEqual([
      { exerciseId: 'bench', position: 2, from: 40, to: 42.5, direction: 'up' },
    ]);
  });

  it('positions are what a row of chips needs, and they agree with the report above them', () => {
    const sets = [set('bench', 0, 40, 40, 9), set('bench', 1, 40, 40, 5), set('bench', 2, 35, 35, 8)];
    const byPos = correctionsByPosition(sets, 'bench');
    expect([...byPos.keys()]).toEqual([3]);
    expect(byPos.get(3)).toEqual(correctionsIn(sets)[0]);
    // …and it answers for the lift it was asked about, never for its neighbour.
    expect([...correctionsByPosition(sets, 'squat').keys()]).toEqual([]);
  });
});

describe('and the record draws it', () => {
  const detail = () =>
    fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'src/screens/history/WorkoutDetail.tsx'),
      'utf8',
    );

  it('⛔ the chip the engine moved into is marked', () => {
    const src = detail().replace(/\s+/g, ' ');
    expect(src).toContain('const moved = corrections.get(i + 1);');
  });

  it('⛔ …in the direction law’s own colour, never a hue this screen picked', () => {
    /*
     * Founder 2026-07-29, on every screen without exception: raise = moss, ease = blue, hold =
     * cream, from ONE function. A record that chose its own green would be the fourth surface to
     * have an opinion about a direction — and `everyDirectionIsDrawnByTheLaw` sweeps for exactly
     * this.
     */
    const src = detail().replace(/\s+/g, ' ');
    expect(src).toContain('color: directionTone(moved.direction)');
  });

  it('⚠️ and it is spoken, not only drawn', () => {
    // A glyph is a mark; a screen reader gets a sentence. Both say the same fact.
    const src = detail().replace(/\s+/g, ' ');
    expect(src).toContain("'history.movedUp' : 'history.movedDown'");
  });
});
