// @ts-nocheck
//
import fs from 'fs';
import path from 'path';

import { liftPlacement } from '@/domain/whyLiftIsHere';
import { fixtureModel } from '@/data/api/fixtureModel';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE THING THAT MAKES THIS PRODUCT DIFFERENT IS THERE BEFORE SHE TRAINS ONCE.
 *
 * ⛔ FOUNDER'S PLAN, move 4: *"the advantage has to show up in the first 60 seconds — before she
 * closes the app for the first time."*
 *
 * **Every app can hand her a plan. Only one that DECIDED the programme can say why a lift is in it.**
 * That sentence is the whole wedge and it has not changed. What carries it has.
 *
 * ── ⛔ REWRITTEN 2026-08-12, BECAUSE ITS SUBJECT MOVED ──────────────────────────────────────────
 * This file used to assert that `PlanWeek` drew the coach's `notes` — prose a model wrote about each
 * lift — on the programme screen. Both halves of that are gone:
 *
 *   · the MODEL is gone from the programme. The engine writes the week and writes no prose (R7 —
 *     Hush never states a reason it did not measure), so there are no `notes` to draw.
 *   · `PlanWeek` is deleted. It had no shipping consumer left; the dev gallery was keeping it alive.
 *
 * What replaced it is stronger, and it is what this file guards now: `domain/whyLiftIsHere` builds
 * the reason from the engine's OWN decisions — the muscle, her mark, the dose, the movement the
 * muscle is never programmed without. It works on the first week, for every lift, with no model and
 * no history, which the coach's notes never did: they existed only where a model had written one.
 *
 * ── ⚠️ AND ONE THING GOT WORSE, WHICH IS RECORDED RATHER THAN GLOSSED ───────────────────────────
 * The note used to be INLINE on the programme screen. The reason is now behind a press on the row.
 * That is a real cost against "the first 60 seconds", and it is the honest trade: an engine that
 * writes no prose has nothing to print in a row, and inventing a sentence to fill the space is the
 * exact failure R7 exists to prevent. What is guaranteed instead is that the door is never locked —
 * every row, on both surfaces, from the first week.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const athlete = (over = {}) => ({
  id: 'p1', sex: 'female', units: 'kg', weightKg: 62, startWeightKg: 62,
  daysPerWeek: 4, repBand: '8-10', repBandByMuscle: {},
  memberSince: new Date('2026-01-01').toISOString(), ...over,
});

describe('⛔ the reason exists before she has trained once', () => {
  it('⛔ every lift of her FIRST week can say why it is there — no history, no model', async () => {
    /*
     * The wedge, measured. Week one: nothing logged, no previous programme, nothing for a model to
     * have written. Every lift still answers, because the answer is the engine's own decision read
     * back rather than a sentence someone stored.
     */
    const bodyMap = { Back: 'emphasis' };
    const program = await fixtureModel.generateProgram(athlete({ bodyMap }));
    const lifts = program.days.flatMap((d) => (d.isRest ? [] : d.slots));
    expect(lifts.length).toBeGreaterThan(10);
    for (const s of lifts) {
      const p = liftPlacement(s.exerciseId, program, bodyMap, 4, []);
      expect(p).not.toBeNull();
      expect(p.muscle).toBeTruthy();
      expect(p.setsHere).toBeGreaterThan(0);
    }
  });

  it('⚠️ a REASON is not an INSTRUCTION — they answer different questions', () => {
    /*
     * The distinction the original file was built on, and it survives the rewrite. `say` was HOW to
     * perform the lift — "a rep short of failure" — and any app can write that. The placement is WHY
     * the lift is in her week at all, which only the thing that chose it can answer.
     *
     * ⚠️ The engine writes no `say`. `domain/enginePlan` refuses to invent one, and that refusal is
     * asserted on its own law — so on the engine's week the row carries the reason and nothing else.
     */
    const sheet = read('src/components/WhyHereSheet.tsx');
    expect(sheet).toContain('whyHere.trains'); // the muscle it serves
    expect(sheet).toContain('whyHere.essential'); // the movement it may not be programmed without
    expect(sheet).toContain('whyHere.marked'); // her own mark
    expect(read('src/domain/enginePlan.ts')).toContain('`say` is left absent');
  });

  /*
   * ════ ⛔ THE DOOR IS CLOSED ON BOTH SURFACES (founder, 2026-09-07) ════
   *
   * *"במסך הבית כשלוחצים על תרגיל מופיע 'למה זה כאן' — אני רוצה להוריד את זה, אין בזה צורך. אני רק
   * רוצה שלחיצה על הכרטיס תפתח את המסך שמציג את עריכת האימון."*
   *
   * The clause below asserted the opposite — that `WhyHereSheet` and `liftPlacement` are wired on
   * Home AND on the pre-workout card. They were, he used them, and he does not want them. The
   * REASON still exists (`domain/whyLiftIsHere`, tested above, and the sheet renders in the
   * gallery); what is gone is the row that opened it. A Home row opens the day's card; a card row
   * opens the load's case when the engine moved it, and the form clip otherwise. The clause now
   * pins the ruling the way it pinned its predecessor.
   */
  it('⛔ the WHY-HERE sheet is wired on NEITHER surface — a row is a door onto the day (2026-09-07)', () => {
    /*
     * ⛔ THE HALF THAT WAS BROKEN FOR MOST OF THIS PRODUCT'S LIFE. The row opened its reason only
     * when the engine had MOVED the load — which needs two programmes to compare, so in her first
     * week it opened nothing at all, on the one screen this law is about.
     */
    expect(read('src/components/PlanLifts.tsx')).toContain('onWhy ? onWhy(lift.exerciseId) : onForm(lift.exerciseId)');
    for (const f of ['src/screens/plan/PreWorkoutScreen.tsx', 'src/screens/home/Home.tsx']) {
      expect(read(f)).not.toContain('WhyHereSheet');
      expect(read(f)).not.toContain('liftPlacement');
    }
    // A Home row opens the day's card — the one room that holds the swap, the drag and the clip.
    expect(read('src/screens/home/Home.tsx')).toMatch(/onForm=\{\(\) => \{\s*if \(todayId\) navigation\.navigate\('PreWorkout', \{ workoutId: todayId \}\);/);
  });

  it('⛔ …and the sheet the week opens is where that table lives', () => {
    /*
     * ════ THE ASSERTION ABOVE WAS GREEN WHILE THE DOOR DID NOT EXIST ════
     *
     * Found 2026-08-12, redesigning Today. `Home.tsx` mounts `WhyHereSheet`, `WhyChangedSheet` and
     * the form clip, and routes all three through one `onForm` it passes to `HomeView`. **`HomeView`
     * never called it.** The lift table had left that screen on 2026-08-05 and the handler stayed —
     * so `plan` arrived, `onForm` arrived, and nothing she could touch opened any of them.
     *
     * ⚠️ AND THIS FILE SAID IT WAS FINE, because it read the CONTAINER's source for the strings
     * `WhyHereSheet` and `liftPlacement` and found them. Both were there. Neither was reachable.
     * **A law that checks a sheet is mounted cannot tell you whether anything opens it** — the same
     * shape as `theProgrammeIsAThingWithAName` demanding a `programWhy` that was permanently null,
     * found the same afternoon.
     *
     * ⛔ I THEN FIXED IT IN THE WRONG PLACE, and the founder caught that inside the hour: I drew the
     * whole table on Today, which duplicated `PreWorkout` outright. One workout's contents belong in
     * ONE surface. Today is the WEEK — a sequence of workouts and nothing else — and pressing one
     * raises the sheet that holds it.
     *
     * So the door is asserted on the sheet, where a door actually is: it renders the table, and the
     * handler it hands over is the one that picks WHICH answer that lift has.
     */
    const sheet = read('src/screens/plan/PreWorkout.tsx');
    expect(sheet).toContain('PlanLifts');
    expect(sheet).toMatch(/onWhy=\{/);
    // …and Today does NOT, which is what stops the duplication coming back.

    expect(read('src/screens/home/HomeView.tsx')).not.toContain('<PlanLifts');
  });

  it('⚠️ it is reachable in the gallery, which is how any of this gets looked at', () => {
    // The original file's last assertion, kept: a wedge nobody can put on a screen is a wedge nobody
    // reviews. `1.5` is the programme she meets first, and it now mounts against the real engine.
    const gallery = read('src/screens/dev/gallery.tsx');
    expect(gallery).toContain("{ id: '1.5'");
    expect(gallery).toContain('model: fixtureModel');
  });
});
