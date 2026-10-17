/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * SHE PICKED IT IN THE LIBRARY. IT IS IN HER WEEK.
 *
 * ⛔ FOUNDER, 2026-08-16:
 *
 *   > *"או שבמקום זה פשוט אוסיף לאפליקציה את ספריית תרגילים שהמתאמן יכול להכנס לכל תרגיל ותרגיל
 *   > ולהוסיף אותו לתוכנית האימון."*
 *
 * This reverses a standing position. `OwnedPreferences` opened with **"There is no PIN — nothing
 * here is declared; every entry is LEARNED from her in-workout swaps at K=2"**, and everything in it
 * was inference. Two things make a declaration better than an inference where one exists: a swap is
 * ambiguous (dislike, or a busy rack?) and it needs two occurrences to say anything at all, while a
 * tap in the library is unambiguous and immediate. The learned machinery is untouched and still
 * explains every lift she never opens the library for, which is most of them.
 *
 * ── THE THREE THINGS A DECLARATION MAY NOT DO ───────────────────────────────────────────────────
 *   · It may not buy VOLUME. Picking five chest lifts does not make room for five — the muscle's
 *     weekly target and the clock still decide how many fit (S-64). The hour is the hour.
 *   · It may not empty a muscle she left ON. Refusing everything that trains a muscle she asked to
 *     train is a contradiction, and the honest reading is the body map's `off`, which says so on
 *     screen.
 *   · It may not overrule a PAIN ban. The gates run before the seats are handed out.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { assembleV5DayLists } from '@/engine/v5/programAssembly';
import { exerciseById, exercisesForMuscle, isSwapOnly } from '@/data/exercises';
import { easeFor, effectiveBodyMap } from '@/domain/painReport';

const NOW = Date.UTC(2026, 5, 1);
const she = { sex: 'female', weightKg: 62 };
const lifts = (lists) => lists.flatMap((d) => d.exerciseIds);
const build = (library, map = {}, profile = she) =>
  lifts(assembleV5DayLists(map, 4, {}, {}, undefined, profile, NOW, library));

describe('⛔ a lift she chose leads its muscle', () => {
  it('appears in the week when the engine would not have picked it', () => {
    /*
     * ⚠️ THE CANDIDATE MUST BE ONE THE GATES ALLOW. A 62 kg athlete cannot load a barbell bench —
     * `canLoad` (S-55b) refuses it before any preference is read — so choosing it and expecting it
     * would be testing that a declaration overrules a physical fact, which it must not.
     */
    const without = build(undefined);
    const reachable = build({ chosenByMuscle: {} , refusedIds: [] });
    const chest = exercisesForMuscle('Chest').filter((e) => !isSwapOnly(e.id)).map((e) => e.id);
    const ignored = chest.find((id) => !without.includes(id) && build({ chosenByMuscle: { Chest: [id] } }).includes(id));
    expect(ignored).toBeDefined(); // there really is a lift the engine passed over and CAN offer
    expect(build({ chosenByMuscle: { Chest: [ignored] } })).toContain(ignored);
    expect(reachable).toEqual(without);
  });

  it('⚠️ and it LEADS — her pick takes the first seat, not a leftover one', () => {
    const chest = exercisesForMuscle('Chest').filter((e) => !isSwapOnly(e.id)).map((e) => e.id);
    const pick = [...chest].reverse().find((id) => build({ chosenByMuscle: { Chest: [id] } }).includes(id));
    const week = build({ chosenByMuscle: { Chest: [pick] } });
    const chestInWeek = week.filter((id) => exerciseById(id)?.muscle === 'Chest');
    expect(chestInWeek[0]).toBe(pick);
  });

  it('⛔ but it does NOT buy volume — the clock still decides how many fit (S-64)', () => {
    const chest = exercisesForMuscle('Chest').filter((e) => !isSwapOnly(e.id)).map((e) => e.id);
    const baseline = build(undefined).filter((id) => exerciseById(id)?.muscle === 'Chest').length;
    const greedy = build({ chosenByMuscle: { Chest: chest } }); // she picked ALL of them
    expect(greedy.filter((id) => exerciseById(id)?.muscle === 'Chest').length).toBe(baseline);
  });
});

describe('⛔ a lift she refused is not offered', () => {
  it('is gone from the week', () => {
    const without = build(undefined);
    const target = without.find((id) => exerciseById(id)?.muscle === 'Chest');
    expect(target).toBeDefined();
    expect(build({ refusedIds: [target] })).not.toContain(target);
  });

  it('⛔ …unless refusing it would empty a muscle she left ON — that is a contradiction, not an instruction', () => {
    const calves = exercisesForMuscle('Calves').filter((e) => !isSwapOnly(e.id)).map((e) => e.id);
    const week = build({ refusedIds: calves }); // she refused every calf lift there is
    expect(week.some((id) => exerciseById(id)?.muscle === 'Calves')).toBe(true);
  });

  it('⚠️ switching the MUSCLE off is what actually empties it (S-2)', () => {
    const week = build(undefined, { Calves: 'off' });
    expect(week.some((id) => exerciseById(id)?.muscle === 'Calves')).toBe(false);
  });
});

describe('⛔ a declaration never overrules a gate', () => {
  it('pain still wins over a pick', () => {
    const eases = [easeFor('Glutes', 'sharp', NOW)];
    const map = effectiveBodyMap(undefined, eases, NOW);
    const banned = exercisesForMuscle('Glutes').find((e) => e.pattern === 'thrust');
    expect(banned).toBeDefined();
    const week = build({ chosenByMuscle: { Glutes: [banned.id] } }, map, { ...she, painEases: eases });
    expect(week).not.toContain(banned.id);
  });
});

describe('⚠️ and nothing changes for an athlete who never opens the library', () => {
  it('an absent declaration builds byte-for-byte the week it always did', () => {
    expect(build(undefined)).toEqual(build({}));
    expect(build(undefined)).toEqual(build({ chosenByMuscle: {}, refusedIds: [] }));
  });
});
