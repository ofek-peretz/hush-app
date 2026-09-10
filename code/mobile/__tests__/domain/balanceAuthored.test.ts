/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * "BALANCE MINE" — what the second button on the review actually does.
 *
 * ⛔ FOUNDER, 2026-08-11: *"תציע לי מה אתה חושב שכפתור תאזן לי צריך לעשות ותאמת בקוד ובטסטים שאכן
 * ההצעה שלך עובדת."*
 *
 * The proposal, and this file is the proof of it:
 *
 *     HERS, untouched      which exercises · which days · what order · which muscles she trains
 *     OURS to fix          a session past her hour · a muscle under the effective dose
 *     AND IT STAYS HERS    `authored` survives, so her next profile edit still cannot rewrite it
 *
 * The alternative — regenerate a Hush week from her profile — answers a question she did not ask.
 * She arrived WITH a programme and pressed a button that says balance MINE. The tests below are
 * written to fail loudly if anyone ever swaps one for the other.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { balanceAuthoredWeek, estimateSessionMinutes } from '@/data/api/fixtureModel';
import { muscleOf } from '@/data/exercises';
import { SESSION_MAX, SETS_MAX, WEEKLY_SETS_FLOOR } from '@/engine/v5/constants';
import { matchWeek, toProgram } from '@/domain/importedPlan';

/** A coach's week that is genuinely too long, so "it fits now" means something. */
function longWeek() {
  return toProgram(
    matchWeek({
      title: 'Coach block',
      sessions: [
        {
          name: 'Push',
          lifts: [
            { name: 'Barbell Bench Press', sets: 5 },
            { name: 'Incline DB Press', sets: 5 },
            { name: 'Cable Fly', sets: 4 },
            { name: 'OHP', sets: 5 },
            { name: 'Lateral Raise', sets: 4 },
            { name: 'Triceps Pushdown', sets: 4 },
            { name: 'Skullcrusher', sets: 4 },
          ],
        },
        {
          name: 'Pull',
          lifts: [
            { name: 'Deadlift', sets: 4 },
            { name: 'Pull-up', sets: 4 },
            { name: 'DB Row', sets: 4 },
            { name: 'Hammer Curl', sets: 3 },
          ],
        },
      ],
    }),
  );
}

const shape = (p) => p.days.map((d) => `${d.name}:${d.slots.map((s) => s.exerciseId).join(',')}`).join(' | ');

describe('⛔ balancing a week she brought', () => {
  it('the week really is too long to begin with — otherwise this file proves nothing', () => {
    const p = longWeek();
    expect(estimateSessionMinutes(p.days[0])).toBeGreaterThan(SESSION_MAX);
  });

  it('⛔ every session fits her hour afterwards — this is what she pressed the button for', () => {
    const { program } = balanceAuthoredWeek(longWeek());
    for (const d of program.days) expect(estimateSessionMinutes(d)).toBeLessThanOrEqual(SESSION_MAX);
  });

  it('⛔ IT STAYS HERS — one adjustment is not handing the week over', () => {
    /*
     * If this came back `engine`, her next profile edit would regenerate the whole programme and the
     * import would quietly have been undone by a button she read as "tidy this up".
     */
    const { program } = balanceAuthoredWeek(longWeek());
    expect(program.authored).toBe('athlete_or_coach');
  });

  it('⛔ her DAYS are her days — nothing is merged, split, renamed or reordered', () => {
    const { program } = balanceAuthoredWeek(longWeek());
    expect(program.days.map((d) => d.name)).toEqual(['Push', 'Pull']);
    expect(program.frequency).toBe(2);
  });

  it('⛔ her ORDER survives — a balanced week is not a reflowed one', () => {
    /*
     * `orderForFlow` would move her cable fly behind the overhead press and group the stations. That
     * is what a generated week gets. Hers keeps the order her coach wrote, minus only what the clock
     * genuinely could not hold.
     */
    const { program } = balanceAuthoredWeek(longWeek());
    const push = program.days[0].slots.map((s) => s.exerciseId);
    const original = longWeek().days[0].slots.map((s) => s.exerciseId);
    // A subsequence of the original, in the original order.
    let at = -1;
    for (const id of push) {
      const next = original.indexOf(id, at + 1);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
  });

  it('⛔ it never REGENERATES — no exercise appears that she did not write', () => {
    /*
     * The single assertion that separates "balance mine" from "give me a new one". A generated week
     * would introduce a squat, a leg press, a calf raise — muscles her programme does not train.
     */
    const { program } = balanceAuthoredWeek(longWeek());
    const mine = new Set(longWeek().days.flatMap((d) => d.slots.map((s) => s.exerciseId)));
    for (const d of program.days) for (const s of d.slots) expect(mine.has(s.exerciseId)).toBe(true);
  });

  it('⛔ a muscle she does not train is NOT added — balancing is not completing', () => {
    /*
     * Compared against HER OWN muscle set rather than a hardcoded list: her Pull day has a deadlift,
     * so hamstrings are legitimately in this programme. What must never appear is a muscle she did
     * not write — the quads, glutes and calves a generated week would supply to fill the map.
     */
    const mine = new Set(longWeek().days.flatMap((d) => d.slots.map((s) => muscleOf(s.exerciseId))));
    const { program } = balanceAuthoredWeek(longWeek());
    for (const d of program.days) for (const s of d.slots) expect(mine.has(muscleOf(s.exerciseId))).toBe(true);
    for (const absent of ['Quads', 'Glutes', 'Calves']) expect(mine.has(absent)).toBe(false);
  });

  it('⛔ it says what it did — a removed lift is a real change, made at her request', () => {
    const { program, changes } = balanceAuthoredWeek(longWeek());
    const removed = changes.filter((c) => c.kind === 'lift_removed');
    const trimmed = changes.filter((c) => c.kind === 'sets_trimmed');
    // Something had to give for the hour to be met…
    expect(removed.length + trimmed.length).toBeGreaterThan(0);
    // …and every reported change is true of the programme it returned.
    for (const c of changes) {
      const day = program.days.find((d) => d.name === c.day);
      const slot = day.slots.find((s) => s.exerciseId === c.exerciseId);
      if (c.kind === 'lift_removed') expect(slot).toBeUndefined();
      else expect(slot.setCount).toBe(c.to);
    }
  });

  it('⛔ the programme she is still looking at is NOT mutated', () => {
    /*
     * She can back out of the review. If balancing edited the object in place, the week she brought
     * would already be gone by the time she pressed cancel.
     */
    const mine = longWeek();
    const before = shape(mine);
    const beforeSets = mine.days.flatMap((d) => d.slots.map((s) => s.setCount)).join(',');
    balanceAuthoredWeek(mine);
    expect(shape(mine)).toBe(before);
    expect(mine.days.flatMap((d) => d.slots.map((s) => s.setCount)).join(',')).toBe(beforeSets);
  });

  it('a week that already fits comes back untouched', () => {
    /*
     * Balancing a sane programme must be a no-op. A pass that "tidied" a week with nothing wrong
     * would be the silent correction this whole feature refuses, arriving through the front door.
     */
    /*
     * ⚠️ THE FIXTURE HAS TO BE GENUINELY SANE, and the first draft of it was not: four sets a muscle
     * is UNDER the effective dose, so balancing correctly raised all of it and the test failed for the
     * right reason. Two lifts a muscle at three sets each is six — at the floor, inside the hour, and
     * therefore nothing for this pass to do.
     */
    const fine = toProgram(
      matchWeek({
        sessions: [
          {
            name: 'A',
            lifts: [
              { name: 'Barbell Bench Press', sets: 3 },
              { name: 'Incline DB Press', sets: 3 },
              { name: 'DB Row', sets: 3 },
              { name: 'Lat Pulldown', sets: 3 },
            ],
          },
        ],
      }),
    );
    const { program, changes } = balanceAuthoredWeek(fine);
    expect(changes).toEqual([]);
    expect(shape(program)).toBe(shape(fine));
  });

  it('⛔ raises a thin muscle AS FAR AS HER OWN STRUCTURE ALLOWS — and no further', () => {
    /*
     * ⛔ THIS IS THE MOST IMPORTANT LIMIT IN THE WHOLE PASS, and it is easy to read as a shortfall.
     *
     * Her back has ONE lift. F-1 caps a block at five sets, so five is the most this muscle can
     * receive without a SECOND back exercise — and adding one would be inventing work she did not
     * write, which is the line balancing must not cross. So it lifts 3 → 5 and stops, one short of
     * the effective dose, on purpose.
     *
     * The alternative is a pass that quietly grows her programme every time she asks it to tidy one,
     * and that is how "balance mine" becomes "replace mine" without anyone deciding to.
     */
    const thin = toProgram(
      matchWeek({
        sessions: [{ name: 'A', lifts: [{ name: 'Barbell Bench Press', sets: 4 }, { name: 'DB Row', sets: 3 }] }],
      }),
    );
    const { program } = balanceAuthoredWeek(thin);
    const sets = {};
    for (const d of program.days) for (const s of d.slots) {
      const m = muscleOf(s.exerciseId);
      sets[m] = (sets[m] ?? 0) + s.setCount;
    }
    expect(sets.Back).toBe(SETS_MAX);          // as far as one lift can go
    expect(sets.Back).toBeLessThan(WEEKLY_SETS_FLOOR); // …and honestly still short of the dose
    expect(program.days[0].slots).toHaveLength(2); // no second back lift was invented
    expect(estimateSessionMinutes(program.days[0])).toBeLessThanOrEqual(SESSION_MAX);
  });
});
