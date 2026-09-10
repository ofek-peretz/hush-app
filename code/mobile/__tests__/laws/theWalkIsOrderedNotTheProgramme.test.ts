// @ts-nocheck
// 
import { orderByStation, orderPlanByStation, stationChanges } from '@/domain/stationOrder';
import { parseCoachPlan } from '@/domain/coachPlan';
import type { PlannedBlock, CoachPlan } from '@/domain/coachPlan';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ORDER SHE WALKS IS ARRANGED. THE PROGRAMME SHE DOES IS NOT TOUCHED.
 *
 * ⛔ FOUNDER, 2026-08-04 — and this is the THIRD attempt at his one request, because the first two
 * were prompt rules and both failed, in opposite directions:
 *
 *   · *"finish a station before leaving it"* → the coach applied it while CHOOSING and returned five
 *     dumbbell lifts in a row. *"That is exactly what I said I did not want."*
 *   · rewritten as a second pass over the finished order → the coach simply did not do it. A single
 *     generation does not reliably re-read and revise its own output.
 *
 * So it is code now, where it can be bounded and proven. **It never chooses a lift, never touches a
 * load, a rep or a set, and never changes what the session IS.** It reorders the walk.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const at = (ex: string): PlannedBlock =>
  ({ rounds: 3, restS: 90, items: [{ kind: 'reps', ex, reps: [8, 10], load: 20 }] });

const ids = (b: PlannedBlock[]) => b.map((x) => x.items[0].ex);

describe('the founder\'s own examples', () => {
  it('⛔ chest on the cable, a dumbbell, then chest on the cable again', () => {
    /*
     * *"If a lifter does chest on the high cable, then rear delts with a dumbbell, then goes back to
     * chest on the low cable — better to do the two chest exercises first and only then move."*
     */
    const before = [at('cable_fly'), at('rear_delt_fly'), at('cable_crunch'), at('db_curl')];
    const after = orderByStation(before);
    expect(stationChanges(after)).toBeLessThan(stationChanges(before));
    // …and every lift he chose is still there, exactly once.
    expect([...ids(after)].sort()).toEqual([...ids(before)].sort());
  });

  it('⛔ face pull, a dumbbell, cable lats, cable biceps — the swap he described', () => {
    /*
     * *"Better to swap the dumbbell curl with the cable curl, so he uses the whole cable station and
     * only then moves to dumbbells."*
     */
    const before = [at('face_pull'), at('db_curl'), at('lat_pulldown'), at('cable_curl')];
    const after = orderByStation(before);
    expect(stationChanges(after)).toBeLessThan(stationChanges(before));
    expect([...ids(after)].sort()).toEqual([...ids(before)].sort());
  });
});

describe('the bounds — every one of them', () => {
  it('⛔ 1 · never reorders ITEMS inside a block', () => {
    /*
     * An item inside a block is a superset or a circuit. Reordering those changes the TRAINING,
     * which is the one thing forbidden. Only whole blocks move.
     */
    const superset: PlannedBlock = {
      rounds: 3, restS: 0,
      items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 10], load: 40 },
              { kind: 'reps', ex: 'cable_fly', reps: [10, 12], load: 15 }],
    };
    const out = orderByStation([superset, at('db_curl'), at('cable_curl'), at('lat_pulldown')]);
    const moved = out.find((b) => b.items.length === 2)!;
    expect(moved.items.map((i) => i.ex)).toEqual(['bb_bench_press', 'cable_fly']);
  });

  it('⛔ 2 · the OPENER never moves', () => {
    /*
     * The first lift is the one she is freshest for and the position a coach thinks hardest about.
     * Here the opener is the ONLY barbell lift, so a naive sort would bury it — this is the case
     * that proves the bound rather than merely stating it.
     */
    const before = [at('bb_back_squat'), at('cable_curl'), at('db_curl'), at('cable_row')];
    expect(orderByStation(before)[0].items[0].ex).toBe('bb_back_squat');
  });

  it('⛔ 3 · a swap must STRICTLY reduce the changes — equal is not better', () => {
    /*
     * Already grouped AND already compound-first, so nothing moves on either axis and the array comes
     * back by IDENTITY — a caller can tell that no decision was made.
     *
     * ⚠️ The first draft of this used `[cable_row, cable_curl, db_curl, db_row]`, which is grouped
     * but puts a curl before a row inside the dumbbell run. The compound layer correctly reordered
     * it and failed this test — the fixture was wrong, not the code.
     */
    const grouped = [at('cable_row'), at('cable_curl'), at('db_row'), at('db_curl')];
    expect(orderByStation(grouped)).toBe(grouped);
  });

  it('⛔ 4 · it is bounded, so the session stays the one the coach wrote', () => {
    // A deliberately awful order. It improves, but it is NOT sorted into perfect runs — an unbounded
    // sort would hand her a different-looking programme every week.
    const messy = [at('bb_back_squat'), at('db_curl'), at('cable_row'), at('db_row'), at('cable_curl'), at('leg_press')];
    const out = orderByStation(messy);
    expect(stationChanges(out)).toBeLessThan(stationChanges(messy));
    expect([...ids(out)].sort()).toEqual([...ids(messy)].sort());
  });

  it('does nothing to a short session — there is no return trip to remove', () => {
    const short = [at('bb_back_squat'), at('db_curl'), at('cable_row')];
    expect(orderByStation(short)).toBe(short);
  });
});

describe('what it must never change', () => {
  const plan: CoachPlan = {
    v: 2,
    sessions: [{ name: 'A', blocks: [at('face_pull'), at('db_curl'), at('lat_pulldown'), at('cable_curl')] }],
  };

  it('⚠️ every load, rep window and round count survives untouched', () => {
    const out = orderPlanByStation(plan);
    const flat = (p: CoachPlan) => p.sessions[0].blocks
      .map((b) => `${b.items[0].ex}:${b.rounds}:${b.restS}:${JSON.stringify(b.items[0])}`).sort();
    expect(flat(out)).toEqual(flat(plan));
  });

  it('⚠️ an unchanged plan comes back by IDENTITY', () => {
    /*
     * `db.saveCoachPlan` keeps the previous plan to derive Today's change arrows. A plan rewritten to
     * an identical value would read as a new decision on every single call.
     */
    const already: CoachPlan = { v: 2, sessions: [{ name: 'A', blocks: [at('cable_row'), at('cable_curl'), at('db_row'), at('db_curl')] }] };
    expect(orderPlanByStation(already)).toBe(already);
  });
});

describe('⛔ the second layer — compound before isolation, inside a station', () => {
  /*
   * ⛔ FOUNDER, looking at the first ordered output: *"in the first example the dumbbells are
   * shoulders first and then chest. Isn't the opposite more logical? But only if it doesn't hurt the
   * sort you already did, because that one seems to be working."*
   *
   * He is right about the training: a lateral raise before an incline press spends the shoulder on
   * the small movement and then asks it to stabilise the big one.
   */
  it('⛔ his exact example — lateral raise before incline press, corrected', () => {
    const before = [at('lat_pulldown'), at('face_pull'), at('cable_row'), at('lateral_raise'), at('incline_db_press')];
    const after = orderByStation(before);
    const db = ids(after).slice(-2);
    expect(db).toEqual(['incline_db_press', 'lateral_raise']);
  });

  it("⛔⛔ AND THE STATION SEQUENCE IS UNCHANGED — the founder's whole condition", () => {
    /*
     * This is not "unlikely to break the first sort", it is arithmetically incapable of it: the pass
     * only reorders WITHIN one contiguous run, so the run boundaries — and therefore the sequence of
     * stations she walks — cannot move. Asserted EQUAL, not merely non-worse.
     */
    const before = [at('lat_pulldown'), at('face_pull'), at('cable_row'), at('lateral_raise'), at('incline_db_press')];
    expect(stationChanges(orderByStation(before))).toBe(stationChanges(before));
  });

  it('⚠️ never moves the opener, even when it is an isolation lift', () => {
    // "The first lift of the session" outranks "compounds first" — the opener is the position a
    // coach thinks hardest about, and it is not ours to second-guess.
    const before = [at('cable_curl'), at('cable_row'), at('db_curl'), at('db_row')];
    expect(orderByStation(before)[0].items[0].ex).toBe('cable_curl');
  });

  it("is STABLE — a run of all compounds keeps the coach's own order", () => {
    // This ranks two KINDS of movement. It has no opinion about which compound comes first.
    /*
     * ⚠️ ALL ONE STATION, deliberately. The first draft used `leg_press` here, which is a MACHINE —
     * so the station layer moved it and the test failed for the right reason on the wrong fixture.
     */
    const allCompound = [at('bb_back_squat'), at('bb_rdl'), at('bb_row'), at('hip_thrust')];
    expect(ids(orderByStation(allCompound))).toEqual(ids(allCompound));
  });

  it('⚠️ runs on a SHORT session too, where the station swap does not', () => {
    // The station swap needs four blocks to be worth anything; pressing before flying is worth it at
    // any length, and an early return would have silently excluded short days.
    const short = [at('bb_back_squat'), at('leg_extension'), at('leg_press')];
    expect(ids(orderByStation(short))).toEqual(['bb_back_squat', 'leg_press', 'leg_extension']);
  });
});

describe('and it happens on the one seam every path goes through', () => {
  it('⛔ a parsed reply comes back already ordered', () => {
    const reply = JSON.stringify({
      say: 'x',
      sessions: [{ name: 'A', blocks: [at('face_pull'), at('db_curl'), at('lat_pulldown'), at('cable_curl')] }],
    });
    const r = parseCoachPlan(reply);
    expect(r.ok).toBe(true);
    const blocks = r.ok ? r.answer.plan!.sessions[0].blocks : [];
    expect(stationChanges(blocks)).toBeLessThan(3);
  });
});
