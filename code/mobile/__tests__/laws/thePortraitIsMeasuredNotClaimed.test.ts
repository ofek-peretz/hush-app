/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THE ENGINE KNOWS ABOUT A LIFT IS SHOWN — AND IT IS SHOWN ONLY WHEN IT HAS BEEN EARNED.
 *
 * The engine holds four measured facts about every loaded lift she trains, and until 2026-08-22
 * every one of them existed only inside a decision: her reps-per-rung slope, the rungs she taught it
 * by performing them, the rail she built, and the rest she actually takes. Nothing has ever shown
 * her any of it.
 *
 * ── ⚠️ AND THE HALF THAT MATTERS IS THE ABSENCE ─────────────────────────────────────────────────
 * Every one of these is gated on evidence — F-12's four like-for-like pairs for a slope, F-17's
 * three samples for a rest, L11's completed set at her target for a rail. Below the gate the engine
 * runs on a BOOTSTRAP, and a portrait that printed the bootstrap would be showing her the ledger's
 * assumptions wearing her name. That is the one thing Part 6 exists to keep out of a standing
 * decision, and it must not sneak back in through a display.
 *
 * So: absent is absent. Never a zero, never a placeholder, never the bootstrap.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { liftKnowledge, knowsAnything } from '@/domain/whatIKnow';
import { REST_COMPOUND_S } from '@/domain/restPrescription';
import type { Session, SetLog } from '@/data/local/models';

const set = (
  exerciseId: string,
  recommendedWeight: number | null,
  actualWeight: number | null,
  actualReps: number,
  restBeforeS?: number,
  /* ⚠️ THE POSITION IS PART OF THE FACT. Rev 13 split the rest doctrine in two: the rest before set
     1 is the WALK to the station and is pooled across lifts; only `setIndex > 0` samples feed a
     lift's own between-sets median. A fixture that stamped every set as index 0 would prove the
     gate holds by never reaching it. */
  setIndex = 0,
): SetLog =>
  ({
    exerciseId,
    setIndex,
    recommendedWeight,
    recommendedReps: 8,
    actualWeight,
    actualReps,
    edited: false,
    persistedAt: '2026-08-01T10:00:00.000Z',
    ...(restBeforeS != null ? { restBeforeS } : {}),
  }) as SetLog;

const session = (day: string, sets: SetLog[]): Session =>
  ({
    id: `s${day}`,
    programDayId: 'd',
    startedAt: `2026-08-${day}T10:00:00.000Z`,
    state: 'SAVED',
    earlyFinish: false,
    trained: true,
    sets,
  }) as Session;

describe('the portrait is measured, never claimed', () => {
  it('⛔ a lift she has never done knows nothing at all', () => {
    const k = liftKnowledge('bb_bench_press', [], 8);
    expect(k).toEqual({ perRung: null, rungs: [], ceiling: null, restS: null });
    expect(knowsAnything(k)).toBe(false);
  });

  it('⛔ …and neither does a null lift, which is a real state on a screen mid-load', () => {
    expect(knowsAnything(liftKnowledge(null, [], 8))).toBe(false);
  });

  it('⛔ the RUNGS are the loads she actually performed', () => {
    /*
     * F-2: *"the equipment grid is a MOVEMENT, not a constant — rungs are the loads that physically
     * exist"*, learned from her behaviour. She has been on this machine at 40 and 50, so those are
     * her rungs, and nothing invents the 45 in between.
     */
    const h = [
      session('01', [set('machine_row', 40, 40, 9)]),
      session('08', [set('machine_row', 50, 50, 8)]),
    ];
    expect(liftKnowledge('machine_row', h, 8).rungs).toEqual([40, 50]);
  });

  it('⛔ the CEILING is her own record plus one rung — and it does not exist before she earns it', () => {
    /*
     * L11. The rail is *"inactive on a lift with no completed set inside the window"*, and nothing
     * replaces it there: F-10 was a predicted physical ceiling and it was deleted as theory. A
     * portrait that drew one anyway would be resurrecting it as decoration.
     */
    const missed = [session('01', [set('bb_bench_press', 60, 60, 5)])]; // 5 reps, band floor is 8
    expect(liftKnowledge('bb_bench_press', missed, 8).ceiling).toBeNull();

    const cleared = [session('01', [set('bb_bench_press', 60, 60, 9)])];
    const ceiling = liftKnowledge('bb_bench_press', cleared, 8).ceiling;
    expect(ceiling).not.toBeNull();
    expect(ceiling).toBeGreaterThan(60); // one rung above what she completed, never below it
  });

  it('⛔⛔ the REST is absent below its evidence gate — and it is NEVER the bootstrap', () => {
    /*
     * F-17 = 3 samples, and the reasoning is the reason this assertion exists: *"one rest cut short —
     * a phone call, a queue for the rack, a mis-tapped skip — would have become her standing
     * prescription."* Below three, the engine runs on `REST_COMPOUND_S`. Printing that figure in a
     * panel headed "what I have measured about you" would be the ledger's assumption wearing her
     * name, which is precisely what this whole file is about.
     */
    const two = [
      session('01', [
        set('bb_bench_press', 60, 60, 9),
        set('bb_bench_press', 60, 60, 9, 95, 1),
        set('bb_bench_press', 60, 60, 9, 100, 2),
      ]),
    ];
    const k = liftKnowledge('bb_bench_press', two, 8);
    expect(k.restS).toBeNull();
    expect(k.restS).not.toBe(REST_COMPOUND_S);
  });

  it('⚠️ …and it appears the moment the evidence does', () => {
    const three = [
      session('01', [
        set('bb_bench_press', 60, 60, 9),
        set('bb_bench_press', 60, 60, 9, 90, 1),
        set('bb_bench_press', 60, 60, 9, 90, 2),
        set('bb_bench_press', 60, 60, 9, 90, 3),
      ]),
    ];
    expect(liftKnowledge('bb_bench_press', three, 8).restS).toBe(90);
  });

  it('⛔ a SLOPE is absent until the estimator can fit one from her own like-for-like sets', () => {
    // F-12: four pairs at distinct loads. One session at one load is not a relationship between load
    // and reps; it is one point, and a line through one point is an opinion.
    const one = [session('01', [set('bb_bench_press', 60, 60, 9, 90)])];
    expect(liftKnowledge('bb_bench_press', one, 8).perRung).toBeNull();
  });

  it('⚠️ a lift with ONE rung and nothing else is not a portrait — the surface stays silent', () => {
    /*
     * A panel headed "what I have measured" over a single number is the app performing knowledge it
     * does not have. `knowsAnything` is asked separately so a screen can draw nothing rather than an
     * empty frame — the same discipline as the record card, which exists only when there is a record.
     */
    const once = [session('01', [set('bb_bench_press', 60, 60, 5)])];
    expect(knowsAnything(liftKnowledge('bb_bench_press', once, 8))).toBe(false);
  });

  it('⚠️ a BODYWEIGHT lift has no load axis, so it has no slope and no ceiling', () => {
    // S-51: reps carry the progression and there is no rung to be worth anything. Both façade
    // functions answer null for it by construction; the portrait must not fabricate either.
    const h = [session('01', [set('pull_up', null, null, 8), set('pull_up', null, null, 7)])];
    const k = liftKnowledge('pull_up', h, 8);
    expect(k.perRung).toBeNull();
    expect(k.ceiling).toBeNull();
  });
});
