/**
 * ════ THE SUPERSET IS ONE BLOCK (founder mandate 2026-08-26) ════
 *
 * Her pair is a CONTRACT with four clauses, and every surface keeps all four:
 *
 *   1. THE PEN — `togglePair` couples two ADJACENT seats, never chains, and syncs the partners'
 *      set counts (the runner's `rounds` is one number). Any structural edit that disturbs the
 *      seats dissolves the pair — a mark may never bind lifts she did not couple.
 *   2. THE SEAL — pairing an engine day is TOUCHING it: `daySignature` carries the mark, so
 *      `sealSmart` stamps the day hers and every rebuild preserves the couple.
 *   3. THE BRIDGE — `coachPlanFromProgram` folds the pair into ONE `PlannedBlock` with two items,
 *      the exact circuit shape the session runner has interleaved since coach plans existed.
 *      Engine slots never carry the mark, so the old "one block per lift" reading is untouched
 *      for every week the engine wrote.
 *   4. THE CLOCK — a pair rests once per round: `estimateSessionMinutes` prices the shared rest
 *      (`pairedRestSavedS`, the same ruler as `perSetSeconds`), so the card's minutes fall when
 *      she pairs and rise when she breaks it. A clock that ignored the pair would argue with the
 *      gym floor twice a round.
 *   5. THE COACH — added 2026-08-31, when the founder asked whether the AI knows how to put a
 *      superset into a week it writes, and the answer was no on all three counts. A superset was a
 *      thing only her finger could say: the model that WRITES her week had no field for one, the
 *      coach that READS her week was handed it with the blocks flattened away, and the reviewer had
 *      no verb to propose one. All three speak it now — through the same pen, so nothing the model
 *      says can express what her fingers could not.
 */
// @ts-nocheck

import { blankDraft, addLift, setLiftSets, togglePair, moveLift, removeLift, builderMinutes, sealSmart, draftFromProgram } from '@/domain/planBuilder';
import { readCoachWeek, draftFromCoachWeek } from '@/domain/coachDraft';
import { BUILD_WEEK_SCHEMA } from '@/domain/buildPrompt';
import { applyPlanSuggestion, parsePlanReview } from '@/domain/planReview';
import { coachFacts } from '@/domain/coachFacts';
import { coachPlanFromProgram } from '@/domain/enginePlan';
import { pairedRestSavedS } from '@/domain/restPrescription';
import { fixtureModel } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';

function coupleDraft() {
  let d = blankDraft('pair1');
  d = addLift(d, 0, 'bb_bench_press');
  d = addLift(d, 0, 'db_row');
  d = addLift(d, 0, 'lateral_raise');
  return d;
}

describe('the pen', () => {
  it('couples adjacent seats and syncs their rounds — from either side', () => {
    let d = coupleDraft();
    d = setLiftSets(d, 0, 0, 4);
    d = togglePair(d, 0, 0);
    expect(d.days[0].slots[0].pairedWithNext).toBe(true);
    expect(d.days[0].slots[1].setCount).toBe(4); // synced on pairing
    d = setLiftSets(d, 0, 1, 5); // editing the SECOND partner moves both
    expect(d.days[0].slots[0].setCount).toBe(5);
    expect(d.days[0].slots[1].setCount).toBe(5);
  });

  it('never chains — a claimed seat refuses a second pair, both directions', () => {
    let d = coupleDraft();
    d = togglePair(d, 0, 0);
    expect(togglePair(d, 0, 1)).toBe(d); // B is already A's partner
    let e = coupleDraft();
    e = togglePair(e, 0, 1); // B+C
    expect(togglePair(e, 0, 0)).toBe(e); // A cannot claim B now
  });

  it('a move or a removal dissolves the pair it disturbs', () => {
    let d = coupleDraft();
    d = togglePair(d, 0, 0);
    const moved = moveLift(d, 0, 2, 0); // the third lift lands between the couple's old seats
    expect(moved.days[0].slots.some((s) => s.pairedWithNext)).toBe(false);
    const removed = removeLift(d, 0, 1); // the partner leaves
    expect(removed.days[0].slots.some((s) => s.pairedWithNext)).toBe(false);
  });
});

describe('the seal', () => {
  beforeEach(async () => {
    await db.clearAll();
    await db.saveProfile({ id: 'p1', name: 'Noa', sex: 'female', units: 'kg', weightKg: 62, daysPerWeek: 3, bodyMap: {}, repBandByMuscle: {} });
  });

  it('pairing an engine day stamps it hers', async () => {
    const engine = await fixtureModel.generateProgram({ id: 'p1', name: 'Noa', sex: 'female', units: 'kg', weightKg: 62, daysPerWeek: 3, bodyMap: {}, repBandByMuscle: {} });
    const draft = togglePair(draftFromProgram(engine), 0, 0);
    const sealed = sealSmart(draft, engine);
    expect(sealed.days[0].authored).toBe(true);
    expect(sealed.days.filter((x) => x.authored)).toHaveLength(1);
  });
});

describe('the bridge', () => {
  it('a pair is one two-item block with the shared rounds; straight lifts stay one block each', () => {
    let d = coupleDraft();
    d = setLiftSets(d, 0, 0, 4);
    d = togglePair(d, 0, 0);
    const plan = coachPlanFromProgram(d, [], [8, 10]);
    const blocks = plan.sessions[0].blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[0].rounds).toBe(4);
    expect(blocks[0].items.map((i) => i.ex)).toEqual(['bb_bench_press', 'db_row']);
    expect(blocks[1].items.map((i) => i.ex)).toEqual(['lateral_raise']);
  });
});

describe('the clock', () => {
  it('a paired day prices under its serial self by exactly the shared rests', () => {
    let serial = coupleDraft();
    serial = setLiftSets(serial, 0, 0, 4);
    serial = setLiftSets(serial, 0, 1, 4);
    let paired = togglePair(serial, 0, 0);
    const serialMin = builderMinutes(serial.days[0]);
    const pairedMin = builderMinutes(paired.days[0]);
    expect(pairedMin).toBeLessThan(serialMin);
    const savedMin = (4 * pairedRestSavedS('bb_bench_press', 'db_row')) / 60;
    expect(serialMin - pairedMin).toBeCloseTo(savedMin, 5);
    expect(savedMin).toBeGreaterThan(0);
  });
});


/* ═══════════════════════════════════════ 5 · the coach ═══════════════════════════════════════ */

const NOA = { id: 'p1', name: 'Noa', sex: 'female', units: 'kg', weightKg: 62, daysPerWeek: 3, bodyMap: {}, repBandByMuscle: {} };

describe('the model may WRITE one', () => {
  it('the week schema carries the field, and it says what it is', () => {
    const lift = BUILD_WEEK_SCHEMA.properties.days.items.properties.lifts.items;
    expect(Object.keys(lift.properties)).toContain('pair');
    expect(lift.properties.pair.type).toBe('boolean');
    // Its MEANING rides the schema rather than the instruction block, whose length is a measured
    // law in both directions (`theModelWritesAWeekSheCanEdit`). A field nobody defines is unused.
    expect(lift.properties.pair.description).toContain('superset');
    // …and it stays optional: a week with no couple in it is the ordinary answer.
    expect(lift.required).toEqual(['ex', 'sets']);
    // The engine's three jobs stay refused by shape — a pair is STRUCTURE, not a prescription.
    const json = JSON.stringify(BUILD_WEEK_SCHEMA);
    for (const forbidden of ['load', 'reps', 'rest']) {
      expect({ forbidden, present: json.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
  });

  it('`true` and nothing else — a truthy value never makes a couple', () => {
    const read = (pair) =>
      readCoachWeek({ days: [{ name: 'A', lifts: [{ ex: 'bb_bench_press', sets: 3, pair }, { ex: 'db_row', sets: 3 }] }] });
    expect(read(true).days[0].lifts[0].pair).toBe(true);
    for (const junk of [1, 'yes', {}, 'true', null]) expect(read(junk).days[0].lifts[0].pair).toBeUndefined();
  });

  it('the model’s pair lands as HER pair — one block, one set count', () => {
    const week = readCoachWeek({
      days: [{ name: 'A', lifts: [{ ex: 'bb_bench_press', sets: 4, pair: true }, { ex: 'db_row', sets: 2 }, { ex: 'lateral_raise', sets: 3 }] }],
    });
    const draft = draftFromCoachWeek(week);
    expect(draft.days[0].slots[0].pairedWithNext).toBe(true);
    expect(draft.days[0].slots[1].setCount).toBe(4); // the pen syncs the couple; `rounds` is ONE number
    expect(draft.days[0].slots[2].pairedWithNext).toBeUndefined();
  });

  it('⛔ a mark whose partner did not survive is DROPPED, never re-aimed at a stranger', () => {
    // `pair` means "with the NEXT lift". When the row under it is refused — an invented id, or the
    // same lift twice — the seat under it becomes somebody else, and a couple she was never offered
    // would read on the seam as one the model asked for.
    const invented = draftFromCoachWeek(
      readCoachWeek({
        days: [{ name: 'A', lifts: [{ ex: 'bb_bench_press', sets: 3, pair: true }, { ex: 'not_a_lift', sets: 3 }, { ex: 'lateral_raise', sets: 3 }] }],
      }),
    );
    expect(invented.days[0].slots.map((s) => s.exerciseId)).toEqual(['bb_bench_press', 'lateral_raise']);
    expect(invented.days[0].slots.some((s) => s.pairedWithNext)).toBe(false);

    const twice = draftFromCoachWeek(
      readCoachWeek({
        days: [{ name: 'A', lifts: [{ ex: 'bb_bench_press', sets: 3, pair: true }, { ex: 'bb_bench_press', sets: 3 }, { ex: 'db_row', sets: 3 }] }],
      }),
    );
    expect(twice.days[0].slots.some((s) => s.pairedWithNext)).toBe(false);

    // …and a mark on the last seat has no partner to reach at all.
    const trailing = draftFromCoachWeek(
      readCoachWeek({ days: [{ name: 'A', lifts: [{ ex: 'bb_bench_press', sets: 3 }, { ex: 'db_row', sets: 3, pair: true }] }] }),
    );
    expect(trailing.days[0].slots.some((s) => s.pairedWithNext)).toBe(false);
  });

  it('⛔ and it can never chain — three marks in a row make ONE couple', () => {
    const draft = draftFromCoachWeek(
      readCoachWeek({
        days: [
          {
            name: 'A',
            lifts: [
              { ex: 'bb_bench_press', sets: 3, pair: true },
              { ex: 'db_row', sets: 3, pair: true },
              { ex: 'lateral_raise', sets: 3, pair: true },
              { ex: 'triceps_pushdown', sets: 3 },
            ],
          },
        ],
      }),
    );
    expect(draft.days[0].slots.map((s) => s.pairedWithNext === true)).toEqual([true, false, true, false]);
  });
});

describe('the coach can SEE one', () => {
  it('a paired week reaches the sheet as one block; a straight one carries no seam at all', () => {
    let d = coupleDraft();
    d = togglePair(d, 0, 0);
    const paired = coachFacts({ profile: NOA, plan: coachPlanFromProgram(d, [], [8, 10]), history: [] }).programme[0].items;
    // Both halves of the couple carry the SAME block; the lone lift carries none.
    expect(paired[0].block).toBe(0);
    expect(paired[1].block).toBe(0);
    expect(paired[2].block).toBeUndefined();

    const straight = coachFacts({ profile: NOA, plan: coachPlanFromProgram(coupleDraft(), [], [8, 10]), history: [] }).programme[0].items;
    for (const i of straight) expect(i.block).toBeUndefined();
  });
});

describe('the reviewer may PROPOSE one', () => {
  const say = 'שני התרגילים האלה חוסכים לך זמן ביחד';

  it('the verb survives the parse, and needs two REAL and different lifts', () => {
    const parse = (one) => parsePlanReview({ say: 'ok', suggestions: [one] }).review.suggestions;
    expect(parse({ day: 1, do: 'pair', ex: 'bb_bench_press', to: 'db_row', say })).toHaveLength(1);
    for (const bad of [
      { day: 1, do: 'pair', ex: 'bb_bench_press', say }, // no partner
      { day: 1, do: 'pair', ex: 'bb_bench_press', to: 'not_a_lift', say }, // a partner we do not carry
      { day: 1, do: 'pair', ex: 'bb_bench_press', to: 'bb_bench_press', say }, // itself
    ]) {
      expect(parse(bad)).toHaveLength(0);
    }
  });

  it('applying it brings the partner adjacent and couples them — through her own verbs', () => {
    const d = coupleDraft(); // bench, row, lateral raise
    const out = applyPlanSuggestion(d, { day: 1, do: 'pair', ex: 'bb_bench_press', to: 'lateral_raise', say });
    expect(out.days[0].slots.map((s) => s.exerciseId)).toEqual(['bb_bench_press', 'lateral_raise', 'db_row']);
    expect(out.days[0].slots[0].pairedWithNext).toBe(true);
    expect(out.days[0].slots[1].pairedWithNext).toBeUndefined();
  });

  it('⛔ it will not break a couple SHE made in order to build the one it wants', () => {
    let d = coupleDraft();
    d = togglePair(d, 0, 1); // hers: row + lateral raise
    const out = applyPlanSuggestion(d, { day: 1, do: 'pair', ex: 'bb_bench_press', to: 'lateral_raise', say });
    expect(out).toBe(d); // a no-op, never a second edit riding inside the one she approved
    expect(out.days[0].slots[1].pairedWithNext).toBe(true);
  });

  it('a stale opinion is a no-op, never a throw', () => {
    const d = coupleDraft();
    expect(applyPlanSuggestion(d, { day: 9, do: 'pair', ex: 'bb_bench_press', to: 'db_row', say })).toBe(d);
    expect(applyPlanSuggestion(d, { day: 1, do: 'pair', ex: 'bb_bench_press', to: 'leg_press', say })).toBe(d);
  });
});
