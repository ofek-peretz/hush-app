/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT SHE SAID AND WHAT SHE KEEPS DOING ARE TWO DIFFERENT FACTS, AND THEY LIVE IN TWO MAPS.
 *
 * ⛔ FOUNDER, 2026-08-22: *"יש לנו ספריית תרגילים אבל אי אפשר ממש להכנס לתוכנית האימון שלנו ולהחליף
 * תרגיל לתרגיל שנמצא בספרייה."*
 *
 * The answer is a 1:1 replacement she names from the pre-workout card, through the SAME sheet the
 * rack raises. What it must not become is an entry in the learned map — and that is the whole of
 * this file.
 *
 * ── THE TWO MAPS, AND WHY MERGING THEM WOULD LOSE HER DECLARATION ───────────────────────────────
 *   · `substitutes`  — LEARNED. Written by the K=2 fold and by the engine's own graduations and
 *     rotations, and **cleared by the fold when it stops believing an adoption** (two swap-backs
 *     retire one). It is a count of what she happened to do.
 *   · `declaredSubs` — DECLARED. She named both sides, once, with time to think.
 *
 * `db.OwnedPreferences` already carries the doctrine, written the day the library shipped: *"a
 * declaration is not evidence and is never inferred; it is also never overridden by inference."* Put
 * a declaration in the learned map and inference deletes it — silently, weeks later, because she
 * swapped back to something twice at a busy rack.
 *
 * ── ⚠️ AND THE LEARNED ENTRY IS LEFT STANDING UNDERNEATH ────────────────────────────────────────
 * The merge does not delete what she has been doing; it outranks it. So the day she takes a
 * declaration back, the week falls to her behaviour rather than to nothing.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';
import { effectiveSubstitutes } from '@/domain/swapPool';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('a declaration outranks a count, and never lives in its map', () => {
  it('⛔ declared beats learned on a collision', () => {
    const merged = effectiveSubstitutes({
      substitutes: { bb_bench_press: 'db_bench_press' },
      declaredSubs: { bb_bench_press: 'machine_chest_press' },
    });
    expect(merged.bb_bench_press).toBe('machine_chest_press');
  });

  it('⛔ …and the learned entry is not destroyed by being outranked', () => {
    /*
     * The half a naive `Object.assign` onto the stored map would have lost. Taking a declaration
     * back must fall to what she has BEEN DOING, not to nothing — so the two are merged at the point
     * of use and never at the point of storage.
     */
    const prefs = {
      substitutes: { bb_bench_press: 'db_bench_press' },
      declaredSubs: { bb_bench_press: 'machine_chest_press' },
    };
    effectiveSubstitutes(prefs);
    expect(prefs.substitutes.bb_bench_press).toBe('db_bench_press');
  });

  it('⛔⛔ a declaration is TERMINAL — inference may not walk past the lift she named', () => {
    /*
     * The hole this file was re-read to find. `resolveChain` follows substitutions transitively, so
     * a plain merge let a LEARNED entry keyed on her declared TARGET carry the walk straight past
     * her: she declares `bench → machine_press`, the fold has separately learned
     * `machine_press → cable_fly`, and the week hands her the fly. **She named the machine press and
     * got something else, by inference.**
     */
    const merged = effectiveSubstitutes({
      substitutes: { machine_chest_press: 'cable_fly' },
      declaredSubs: { bb_bench_press: 'machine_chest_press' },
    });
    expect(merged.bb_bench_press).toBe('machine_chest_press');
    expect(merged.machine_chest_press).toBeUndefined(); // the walk stops where she stopped it
  });

  it('⚠️ …and dropping it is a READ, not a deletion — it returns when the declaration lifts', () => {
    const prefs = {
      substitutes: { machine_chest_press: 'cable_fly' },
      declaredSubs: { bb_bench_press: 'machine_chest_press' },
    };
    effectiveSubstitutes(prefs);
    expect(prefs.substitutes.machine_chest_press).toBe('cable_fly');
    // …and with the declaration gone, the learned chain is whole again.
    expect(effectiveSubstitutes({ substitutes: prefs.substitutes }).machine_chest_press).toBe('cable_fly');
  });

  it('⚠️ a learned entry with no declaration still stands', () => {
    expect(effectiveSubstitutes({ substitutes: { a: 'b' } })).toEqual({ a: 'b' });
    expect(effectiveSubstitutes({ declaredSubs: { a: 'c' } })).toEqual({ a: 'c' });
    expect(effectiveSubstitutes({})).toEqual({});
  });

  it('⛔⛔ ONLY `declareSwap` writes `declaredSubs` — the learned fold may never touch it', () => {
    /*
     * The mechanical half of the doctrine. `sessionStore`'s fold writes `substitutes`, `swapPending`,
     * `leaveItsByMuscle` and `engineRotated`; if it ever learned to write this one too, the
     * distinction would be gone and nothing would say so.
     */
    const writers = ['state/stores/appStore.tsx', 'state/stores/sessionStore.tsx', 'data/api/fixtureModel.ts']
      .filter((f) => /declaredSubs\s*[:=]/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, '')));
    expect(writers).toEqual(['state/stores/appStore.tsx']);
  });

  it('⛔ the assembler reads the MERGE, never the learned map alone', () => {
    /*
     * Two call sites feed `assembleV5DayLists`, and a declaration that reached one of them and not
     * the other would apply to an athlete with a body map and not to one without — the exact shape
     * of "a law that holds on one path and not its neighbour".
     */
    const model = read('data/api/fixtureModel.ts');
    expect(model).toContain('const subs = effectiveSubstitutes(prefs);');
    expect(model.match(/assembleV5DayLists\([^)]*prefs\.substitutes/g) ?? []).toEqual([]);
  });

  it('⛔ naming the current stand-in again TAKES THE DECLARATION BACK', () => {
    /*
     * A declaration is reversible the way she made it — by saying the other thing — rather than by a
     * second control that exists only to undo the first. And the anchor is the lift the WEEK was
     * built from, not the row she is looking at: after one declaration the row shows the
     * REPLACEMENT, so a second swap must edit the entry that produced it or the original lift
     * becomes unreachable behind a chain of one-offs.
     */
    const store = read('state/stores/appStore.tsx').replace(/\s+/g, ' ');
    expect(store).toContain('const anchor = Object.keys(declared).find((k) => declared[k] === fromExerciseId) ?? fromExerciseId;');
    expect(store).toContain('if (anchor === toExerciseId) delete declared[anchor];');
  });

  it('⛔ a finished day is a record — it is never offered a swap', () => {
    // Offering to change a lift she has already done would be the app proposing to rewrite history.
    const screen = read('screens/plan/PreWorkoutScreen.tsx').replace(/\s+/g, ' ');
    expect(screen).toContain('onSwap={doneIds.includes(workout.id) ? undefined : (exerciseId) => setSwapFor(exerciseId)}');
  });

  it('⚠️ the sheet is the RACK’s sheet, and it cannot offer a lift already in the day', () => {
    /*
     * One pool, one set of rows, two moments. `swapChoices` is given the day's other lifts exactly as
     * the live session gives it `sessionExerciseIds` — the guard that stops a swap duplicating a lift
     * she is already doing.
     */
    const screen = read('screens/plan/PreWorkoutScreen.tsx').replace(/\s+/g, ' ');
    expect(screen).toContain('swapChoices(swapFor, { sessionExerciseIds: lifts.map((l) => l.exerciseId), equipment: app.profile?.equipment })');
  });
});
