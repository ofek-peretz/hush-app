/**
 * ════ THE HYBRID WEEK IS SHARED GROUND (founder, 2026-08-25) ════
 *
 * *"יום שנגעה בו — שלה; יום שלא — שלו."* A day she edited in the builder is stamped
 * `authored: true` by the diff-seal and preserved BYTE-FOR-BYTE through every engine rebuild;
 * the engine assembles its own days around it, against the residual weekly volume. This law runs
 * the REAL `generateProgram` — the same function all seven rebuild triggers call — so the
 * guarantee is about the machine, not the screen.
 */
// @ts-nocheck

import { fixtureModel } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import { exerciseById } from '@/data/exercises';
import { draftFromProgram, addLift, setLiftSets, sealSmart, ownedDayIds, removeDay, removeLift } from '@/domain/planBuilder';

const PROFILE = {
  id: 'p1', name: 'Noa', sex: 'female', units: 'kg', weightKg: 62,
  daysPerWeek: 4, bodyMap: {}, repBandByMuscle: {},
};

const daySig = (d) => JSON.stringify({ name: d.name, slots: d.slots.map((s) => [s.exerciseId, s.setCount]) });
const directSets = (days, muscle) =>
  days.flatMap((d) => d.slots).filter((s) => !s.supplemental && exerciseById(s.exerciseId)?.muscle === muscle)
    .reduce((n, s) => n + s.setCount, 0);

/** She edits ONE day of the engine's week in the builder, and saves. */
async function makeHybrid() {
  const engine = await fixtureModel.generateProgram(PROFILE);
  let draft = draftFromProgram(engine);
  draft = addLift(draft, 0, draft.days[0].slots.some((s) => s.exerciseId === 'bb_curl') ? 'hammer_curl' : 'bb_curl');
  draft = setLiftSets(draft, 0, 0, 5);
  const sealed = sealSmart(draft, engine);
  await db.saveProgram(sealed);
  return { engine, sealed };
}

beforeEach(async () => {
  await db.clearAll();
  await db.saveProfile(PROFILE);
});

describe('the diff-seal', () => {
  it('stamps ONLY the day she touched, and the program stays engine-owned', async () => {
    const { engine, sealed } = await makeHybrid();
    expect(sealed.authored ?? 'engine').toBe('engine');
    expect(sealed.days.filter((d) => d.authored)).toHaveLength(1);
    expect(sealed.days[0].authored).toBe(true);
    // untouched days are the engine's, verbatim
    const untouched = engine.days.filter((d) => !d.isRest).slice(1);
    expect(sealed.days.slice(1).map(daySig)).toEqual(untouched.map(daySig));
    // and the chips agree with the seal
    const owned = ownedDayIds(draftFromProgram(sealed), sealed);
    expect([...owned]).toEqual([sealed.days[0].id]);
  });

  it('touching nothing returns the week unchanged; removing an engine day claims the whole week', async () => {
    const engine = await fixtureModel.generateProgram(PROFILE);
    const untouchedSeal = sealSmart(draftFromProgram(engine), engine);
    expect(untouchedSeal.days.some((d) => d.authored)).toBe(false);
    expect(untouchedSeal.authored ?? 'engine').toBe('engine');

    const gutted = removeDay(draftFromProgram(engine), 1);
    expect(sealSmart(gutted, engine).authored).toBe('athlete_or_coach');
  });
});

describe('every rebuild preserves her ground', () => {
  it('her day survives generateProgram byte-for-byte; the others are the engine\'s to reshape', async () => {
    const { sealed } = await makeHybrid();
    const hers = sealed.days.find((d) => d.authored);

    const rebuilt = await fixtureModel.generateProgram(PROFILE);
    const preserved = rebuilt.days.find((d) => d.id === hers.id);
    expect(preserved).toBeTruthy();
    expect(daySig(preserved)).toBe(daySig(hers));
    expect(preserved.authored).toBe(true); // still hers for the NEXT rebuild too
    expect(rebuilt.days.filter((d) => !d.isRest)).toHaveLength(4); // her frequency stands
    // ...and it kept its seat at the head of the week
    expect(rebuilt.days[0].id).toBe(hers.id);
    // no two days share an id (the collision suffix works)
    const ids = rebuilt.days.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the engine budgets AROUND her sets — more of hers means less of his, monotonically', async () => {
    /*
     * ⚠️ WHAT THIS PROMISES, PRECISELY. The residual volume shapes the ASSEMBLY; the session floor
     * (F-15 — an engine day is a real 45-60 minute session, whatever her days took) then fills the
     * engine's days back toward the clock, so "week total == the pot" is not the guarantee. The
     * guarantee is DIRECTIONAL and it is the one that matters to an athlete: the more chest her own
     * day carries, the less chest the engine writes — never more.
     */
    const engine = await fixtureModel.generateProgram(PROFILE);
    const chestOnDays = async (chestSets) => {
      let draft = draftFromProgram(engine);
      while (draft.days[0].slots.length > 0) draft = removeLift(draft, 0, 0);
      draft = addLift(draft, 0, 'db_row'); // the day exists beyond chest, so it is a real workout
      const chestLifts = ['bb_bench_press', 'incline_db_press', 'pec_deck', 'cable_fly', 'db_bench_press', 'machine_chest_press'];
      let left = chestSets;
      for (const ex of chestLifts) {
        if (left <= 0) break;
        draft = addLift(draft, 0, ex);
        const take = Math.min(5, left);
        draft = setLiftSets(draft, 0, draft.days[0].slots.length - 1, take);
        left -= take;
      }
      await db.saveProgram(sealSmart(draft, engine));
      const rebuilt = await fixtureModel.generateProgram(PROFILE);
      return directSets(rebuilt.days.filter((d) => !d.authored && !d.isRest), 'Chest');
    };
    const none = await chestOnDays(0);
    const some = await chestOnDays(15);
    const covering = await chestOnDays(30); // past the 4-day weekly pot — fully covered
    expect(some).toBeLessThan(none);
    expect(covering).toBe(0); // the covered → 'off' path: the engine steps aside entirely
  });

  it('she can DELETE a lift the engine gave her — six becomes five, and it stays five', async () => {
    /*
     * The founder's own question, verbatim (2026-08-25): *"אם בנית לו והוא עורך — הוא יכול למחוק
     * תרגיל כך שבמקום 6 תרגילים הוא יבצע 5?"* Yes: removal is an ordinary edit, the day becomes
     * hers by the diff-seal, and every future rebuild preserves the five — the engine never
     * quietly puts the sixth back.
     */
    const engine = await fixtureModel.generateProgram(PROFILE);
    const day0 = engine.days.filter((d) => !d.isRest)[0];
    const before = day0.slots.filter((sl) => !sl.supplemental).length;
    expect(before).toBeGreaterThanOrEqual(2);

    let draft = draftFromProgram(engine);
    draft = removeLift(draft, 0, 0); // she deletes the first lift — six becomes five
    const sealed = sealSmart(draft, engine);
    await db.saveProgram(sealed);

    const hers = sealed.days[0];
    expect(hers.authored).toBe(true);
    expect(hers.slots.filter((sl) => !sl.supplemental)).toHaveLength(before - 1);

    const rebuilt = await fixtureModel.generateProgram(PROFILE);
    const preserved = rebuilt.days.find((d) => d.id === hers.id);
    expect(preserved.slots.filter((sl) => !sl.supplemental)).toHaveLength(before - 1); // still five
  });

  it('un-marking a day hands it back — the next rebuild reshapes it', async () => {
    const { sealed } = await makeHybrid();
    const stripped = { ...sealed, days: sealed.days.map((d) => ({ ...d, authored: undefined })) };
    await db.saveProgram(stripped);
    const rebuilt = await fixtureModel.generateProgram(PROFILE);
    expect(rebuilt.days.some((d) => d.authored)).toBe(false);
  });

  it('a week she owns ENTIRELY never reaches the assembler with kept days — the gate owns that case', async () => {
    // Full authorship is the imported-week path: generateProgram must NOT preserve days off an
    // 'athlete_or_coach' program, because the only unguarded caller is the pen-back door, which
    // strips first. This asserts the read-side guard directly.
    const { sealed } = await makeHybrid();
    const fullyHers = { ...sealed, authored: 'athlete_or_coach' };
    await db.saveProgram(fullyHers);
    const rebuilt = await fixtureModel.generateProgram(PROFILE);
    expect(rebuilt.days.some((d) => d.authored)).toBe(false); // a clean engine week
  });
});
