/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * A WEEK SHE BROUGHT IS NOT OURS TO REWRITE.
 *
 * ⛔ FOUNDER, 2026-08-11: *"נצטרך שהמנוע לא יחתוך למתאמן וישמר לו את התוכנית ורק ינהל אותה… אסור
 * למנוע שלנו לשנות את זה אלא רק לנהל את המתאמן בהסתמך על התוכנית שהוא קיבל."*
 *
 * And the reason it must be airtight rather than merely careful, in his words: *"זה הפתח גם למסלול
 * המאמנים שיוצרים תוכנית עבור המתאמן שלהם."* A coach who writes a week for their athlete and finds
 * Hush has quietly cut it to sixty minutes will not use Hush again, and will be right not to.
 *
 * ── WHAT THE ENGINE WOULD DO IF NOTHING STOPPED IT ─────────────────────────────────────────────
 * `generateProgram` is not a formatter. It runs `trimV5ToBudget`, `enforceTimeCap`,
 * `fillToSessionFloor`, `growEmphasised` and `raiseToWeeklyFloor` — passes that exist to make a
 * HUSH week legal, and that would turn an imported week into one: a 74-minute Monday cut to 60,
 * accessory work deleted for sitting under MEV, the exercise order reflowed for station flow.
 * Every one of those is right for a week Hush wrote and wrong for a week it was handed.
 *
 * ── THE LINE THIS FILE DRAWS ───────────────────────────────────────────────────────────────────
 * The SHAPE is hers: which exercises, on which days, in which order, for how many sets.
 * The LOADS are ours: Loop 1 corrects the weight between sets from the reps she just did, Loop 2
 * decides the next session's load from the last one. No written plan can contain those, and they
 * are the reason she is using Hush at all.
 *
 * ⚠️ THIS FILE ASSERTS THE GUARANTEE ON THE SOURCE, not only on behaviour, because the failure it
 * guards against is a FUTURE call site: someone adds a fifth rebuild trigger next month and does not
 * know this rule exists. So it counts the `generateProgram` calls and requires every one of them to
 * sit behind the gate.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import fs from 'fs';
import path from 'path';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { fixtureModel, estimateSessionMinutes } from '@/data/api/fixtureModel';
import { AppProvider, engineMayRebuild, useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { muscleOf, exerciseById } from '@/data/exercises';
import { SESSION_MAX, WEEKLY_SETS_FLOOR, SETS_MAX } from '@/engine/v5/constants';
import type { Profile, Program } from '@/data/local/models';

const ROOT = path.resolve(__dirname, '../..');
const STORE = fs.readFileSync(path.join(ROOT, 'src/state/stores/appStore.tsx'), 'utf8');

const athlete = (over: Partial<Profile> = {}): Profile => ({
  id: 'p1',
  sex: 'female',
  units: 'kg',
  weightKg: 62,
  startWeightKg: 62,
  daysPerWeek: 4,
  repBand: '8-10',
  repBandByMuscle: {},
  memberSince: new Date('2026-01-01').toISOString(),
  ...over,
});

/**
 * A week a COACH wrote, built to break every rule Hush holds itself to — so that "the engine did
 * not change it" means something. It is 74 minutes on one day, has a muscle far under MEV, repeats a
 * movement, puts an isolation before a compound, and carries a six-set block above F-1's ceiling.
 */
function coachesWeek(): Program {
  return {
    id: 'imported-1',
    frequency: 3,
    authored: 'athlete_or_coach',
    days: [
      {
        id: 'd1',
        name: 'Coach — Monday',
        isRest: false,
        slots: [
          { exerciseId: 'pec_deck', setCount: 4, supplemental: false }, // an isolation, first
          { exerciseId: 'bb_bench_press', setCount: 6, supplemental: false }, // above F-1's five
          { exerciseId: 'incline_db_press', setCount: 5, supplemental: false },
          { exerciseId: 'chest_dip', setCount: 5, supplemental: false },
          { exerciseId: 'cable_fly', setCount: 4, supplemental: false },
          { exerciseId: 'triceps_pushdown', setCount: 4, supplemental: false },
          { exerciseId: 'db_overhead_triceps_ext', setCount: 4, supplemental: false },
          { exerciseId: 'skullcrusher', setCount: 4, supplemental: false },
        ],
      },
      {
        id: 'd2',
        name: 'Coach — Wednesday',
        isRest: false,
        slots: [
          { exerciseId: 'bb_back_squat', setCount: 5, supplemental: false },
          { exerciseId: 'front_squat', setCount: 5, supplemental: false }, // the same pattern twice
          { exerciseId: 'leg_extension', setCount: 4, supplemental: false },
        ],
      },
      {
        id: 'd3',
        name: 'Coach — Friday',
        isRest: false,
        slots: [
          { exerciseId: 'bb_row', setCount: 5, supplemental: false },
          { exerciseId: 'db_curl', setCount: 3, supplemental: false }, // Biceps: 3 weekly sets, under MEV
        ],
      },
    ],
  } as Program;
}

/** A stable fingerprint of a week's SHAPE — days, order, exercises, set counts. */
const shapeOf = (p: Program) =>
  p.days.map((d) => `${d.name}:${d.slots.map((s) => `${s.exerciseId}x${s.setCount}`).join(',')}`).join(' | ');

describe('⛔ the engine may not rewrite a week she brought', () => {
  it('the imported week really does break Hush’s own rules — otherwise this file proves nothing', () => {
    /*
     * The fixture is the test. If the coach's week happened to be a legal Hush week, every assertion
     * below would pass on a build that rewrote it freely. So the breaches are asserted FIRST.
     */
    const p = coachesWeek();
    const monday = p.days[0];
    expect(estimateSessionMinutes(monday)).toBeGreaterThan(SESSION_MAX);

    const sets: Record<string, number> = {};
    for (const d of p.days) for (const s of d.slots) {
      const m = muscleOf(s.exerciseId)!;
      sets[m] = (sets[m] ?? 0) + s.setCount;
    }
    expect(sets.Biceps).toBeLessThan(WEEKLY_SETS_FLOOR); // under MEV, on purpose

    const overF1 = p.days.flatMap((d) => d.slots).filter((s) => s.setCount > SETS_MAX);
    expect(overF1.length).toBeGreaterThan(0); // a six-set block, on purpose

    // …and Wednesday trains the same movement twice, which the generator forbids.
    const wed = p.days[1].slots.map((s) => exerciseById(s.exerciseId)!.pattern);
    expect(new Set(wed).size).toBeLessThan(wed.length);

    // …and Monday opens on an isolation, which `orderForFlow` would never do.
    expect(exerciseById(monday.slots[0].exerciseId)!.tier).toBe('isolation');
  });

  it('⛔ the gate refuses to rebuild an authored week, and allows an engine one', () => {
    expect(engineMayRebuild(coachesWeek())).toBe(false);
    expect(engineMayRebuild({ id: 'x', frequency: 4, days: [], authored: 'engine' } as Program)).toBe(true);
    /*
     * ⚠️ ABSENT MEANS ENGINE. Every programme that exists on a device today predates this field, and
     * a migration that read `undefined` as "authored" would freeze every one of them — the athlete's
     * week would stop responding to her body map for ever, silently.
     */
    expect(engineMayRebuild({ id: 'x', frequency: 4, days: [] } as Program)).toBe(true);
    expect(engineMayRebuild(null)).toBe(true);
  });

  it('⛔ EVERY rebuild in the store sits behind the gate — including the one added next month', () => {
    /*
     * The guarantee cannot be "the four call sites we know about". It has to be "all of them", and
     * the way a rule like this dies is a fifth trigger written by someone who never read this file.
     *
     * ⛔ AND `completeOnboarding` IS NO LONGER EXEMPT (2026-08-11). It used to be, on the reasoning
     * that the first build has no imported week to overwrite — which stopped being true the moment
     * `ImportPlan` became reachable FROM onboarding. She could import her coach's programme on the
     * body-map step, `adoptImportedProgram` would write it to disk, and this call would generate a
     * Hush week over the top of it before she ever saw a screen. The import would have appeared to
     * work and been gone by the next screen.
     *
     * So there is no exemption left: every `generateProgram` in this store sits behind the gate.
     */
    const calls = [...STORE.matchAll(/generateProgram\(programProfile\(profile\)\)/g)];
    expect(calls.length).toBeGreaterThanOrEqual(4); // the sweep really found the call sites

    const ungated: string[] = [];
    for (const m of calls) {
      const before = STORE.slice(Math.max(0, m.index! - 900), m.index!);
      /*
       * ════ ONE exemption, and it is the door OUT (founder, 2026-08-25) ════
       * `revertProgramToEngine` exists to hand the pen back: she built a week in the plan builder
       * (authored), and this is her explicit, confirmed tap asking Hush to write again. Gating it
       * on `engineMayRebuild` would make authorship a one-way trap — the gate would refuse the
       * very act of lifting the gate. It is exempt BY NAME, not by pattern, so a sixth rebuild
       * still cannot slip through.
       */
      const wideBefore = STORE.slice(Math.max(0, m.index! - 2200), m.index!);
      if (/revertProgramToEngine/.test(wideBefore)) continue;
      if (!/engineMayRebuild\(/.test(before)) ungated.push(STORE.slice(Math.max(0, m.index! - 80), m.index! + 40));
    }
    expect(ungated).toEqual([]);
  });

  it('⛔ …and the FIRST build asks it too — the hole that onboarding opened', () => {
    /*
     * Asserted separately and by name, because this is the one that was actually wrong. It reads the
     * programme from DISK rather than from `state.program`: at this point in onboarding the store has
     * not loaded one, so checking React state would have been a check that always passed.
     */
    expect(STORE).toMatch(/const brought = await db\.loadProgram\(\)/);
    expect(STORE).toMatch(/engineMayRebuild\(brought\)\s*\?\s*await live\.generateProgram/);
  });

  it('⛔ a rebuild triggered by pain, by a profile edit, or by a rest answer cannot reach an authored week', () => {
    /*
     * Read as behaviour rather than as source: each of the three guarded sites returns BEFORE
     * `generateProgram`, so no assembly pass can run. Asserted by the shape of the code around each
     * gate — the `return` must come first, or the guard is decoration.
     */
    // ⚠️ `return;` OR `return false;` — `saveLibrary` reports the outcome to its caller so the
    // screen can say what actually happened, and a returned value is still a return BEFORE any
    // assembly runs, which is the whole of what this law checks.
    /*
     * ⛔ AND THE GATE ASKS THE DISK, NOT `state.program` (found 2026-08-18). This pattern used to
     * read `engineMayRebuild(state.program)` and the law was satisfied by it — while the thing being
     * asked was EMPTY. Boot dispatches `program: null` deliberately, `engineMayRebuild(null)` is
     * true, and so after every cold start the first pain report or profile edit rewrote her coach's
     * week. The gates were all present, all correct, and all asked of nobody.
     *
     * The literal is pinned here for the same reason the count below is: this is the exact line that
     * was wrong, and a law that accepted `engineMayRebuild(anything)` would accept it again.
     */
    const gates = [...STORE.matchAll(
      /if \(!engineMayRebuild\(await db\.loadProgram\(\)\.catch\(\(\) => state\.program\)\)\) return(?: false)?;/g,
    )];
    // …and nothing anywhere in the store asks the question of React state again.
    expect(STORE).not.toMatch(/engineMayRebuild\(state\.program\)/);
    /*
     * ⚠️ 3 → 4 on 2026-08-16: `saveLibrary` (her picks and refusals in the exercise library) is the
     * fourth thing she can do that reshapes which lifts a week is made of, so it rebuilds — and it
     * asks the same question first. The count is named rather than loosened on purpose: the way this
     * rule dies is a FIFTH trigger written by someone who never read this file.
     *
     * ⚠️ 4 → 5 on 2026-08-22, AND THE LAW DID ITS JOB. `declareSwap` — *"give me this one instead of
     * that one"*, from the pre-workout card (founder 2026-08-22) — is the fifth, and the count is
     * what forced it to be declared here rather than added quietly. It carries the guard for exactly
     * the reason the other four do: a substitution reshapes which lifts a week is made of, and a
     * week she BROUGHT is not ours to reshape, however she asks.
     *
     * ⚠️ AND THE DECLARATION IS STILL SAVED on an authored week — the guard stops the REBUILD, not
     * the record of what she said. That is the contract `saveLibrary` already keeps, and it is why
     * both return a boolean instead of throwing: what she is told about her week is the caller's job.
     *
     * ⚠️ 5 → 4 on 2026-09-07, AND THE LAW DID ITS JOB AGAIN, in the other direction. `declareSwap`
     * no longer REBUILDS at all: the founder saw the rebuild from the outside — *"כאשר מחליפים
     * תרגיל עוד תרגילים מתחלפים אוטומטית"* — because a fresh assembly pass re-deals every seat it
     * is free to deal. A swap is an EDIT of the seats holding the lift she named (`replaceLift`,
     * the builder's verb), on any week including one she brought, at her own tap — the same
     * authority as `saveBuiltProgram`. No `generateProgram`, so no gate to count.
     */
    expect(gates.length).toBe(4); // reportPain · updateProfileInfo · answerEaseCheck · saveLibrary

    for (const g of gates) {
      const after = STORE.slice(g.index!, g.index! + 400);
      // The very next statement is the build — nothing may sit between the guard and what it guards.
      // `return;` or `return false;` — the value is for the CALLER's message; the return is the guard.
      expect(after).toMatch(/return(?: false)?;\s*(\/\/[^\n]*\n\s*)*(\/\*[\s\S]*?\*\/\s*)*const rebuilt = await model\.generateProgram/);
    }
  });

  it('⛔ …and the engine’s own week is still rebuilt — the guard is not a freeze on everyone', async () => {
    /*
     * The other direction, and the one a careless fix would break: this rule must cost the ordinary
     * athlete nothing. A generated week still responds to her body map, at every frequency.
     */
    const drifted: string[] = [];
    for (const days of [3, 4, 5]) {
      const plain = await fixtureModel.generateProgram(athlete({ daysPerWeek: days }));
      const marked = await fixtureModel.generateProgram(
        athlete({ daysPerWeek: days, bodyMap: { Back: 'emphasis' } }),
      );
      if (shapeOf(plain) === shapeOf(marked)) drifted.push(`${days}d: the map changed nothing`);
      expect(engineMayRebuild(plain)).toBe(true);
    }
    expect(drifted).toEqual([]);
  });

  it('⛔ the number of sets she performs comes from HER PLAN, never from the engine', () => {
    /*
     * ⛔ THE OTHER HALF OF THE GUARANTEE, and the half a "the engine may not rebuild" guard does not
     * cover on its own. Blocking regeneration protects the stored week; it says nothing about what
     * the SESSION renders from it. If the live session asked the engine how many sets to run, an
     * authored six-set block would quietly become a four-set one on the way to her hands, and the
     * stored plan would be untouched and irrelevant.
     *
     * It does not: `sessionStore` loops `slot.setCount` — the count is the plan's, and the engine
     * only answers "how heavy, and in what rep range" for each of those sets. That is exactly the
     * line the founder drew: the shape is hers, the loads are ours.
     */
    const store = fs.readFileSync(path.join(ROOT, 'src/state/stores/sessionStore.tsx'), 'utf8');
    expect(store).toMatch(/for \(let s = 0; s < slot\.setCount; s\+\+\)/);
    expect(store).toMatch(/totalSetsInExercise: slot\.setCount/);
  });

  it('⛔ a block ABOVE F-1’s ceiling is still fully covered — no set arrives without a load', () => {
    /*
     * The failure this catches is silent and specific: a coach writes six sets, F-1 caps Hush's own
     * blocks at five, and `sessionTargets` emits five targets. The sixth set then renders against a
     * neutral fallback — no weight, no band — and she is left guessing on the last set of her heaviest
     * lift, with nothing on any screen saying why.
     *
     * `sessionTargets` sizes its emission from the PROGRAMME's largest slot rather than from F-1, so
     * an authored week is covered whatever it asks for. Asserted on the source because the arithmetic
     * is the guarantee.
     */
    const model = fs.readFileSync(path.join(ROOT, 'src/data/api/fixtureModel.ts'), 'utf8');
    expect(model).toMatch(
      /const maxSetCount = program\s*\?\s*Math\.max\(MAX_SETS, \.\.\.program\.days\.flatMap\(\(d\) => d\.slots\.map\(\(s\) => s\.setCount\)\)\)/,
    );
    // …and the coach's week really does contain a slot the ceiling would have clipped.
    const biggest = Math.max(...coachesWeek().days.flatMap((d) => d.slots.map((s) => s.setCount)));
    expect(biggest).toBeGreaterThan(SETS_MAX);
  });

  it('⛔ THE WHOLE CHAIN — every link from the tap to the saved week', () => {
    /*
     * ⛔ FOUNDER, 2026-08-11: *"צריך ממש להתחשב בהכל ובכל השרשרת."*
     *
     * Every other test in this file checks one link. This one checks that they are JOINED, because
     * all three defects found while wiring this were joins rather than parts:
     *
     *   · `completeOnboarding` generated a week over the top of an imported one, so the import
     *     appeared to work and was gone by the next screen;
     *   · the door navigated to a route registered only in the MAIN navigator, and onboarding is a
     *     separate stack — the tap would have found nothing at runtime;
     *   · the door was on the LAST step, so the slowest call in the flow ran at the one moment she
     *     had nothing else to do. It is on the FIRST question now and runs underneath the intake.
     *
     * None of those is visible from any single component.
     */
    const root = fs.readFileSync(path.join(ROOT, 'src/app/Root.tsx'), 'utf8');
    const start = fs.readFileSync(path.join(ROOT, 'src/screens/onboarding/Start.tsx'), 'utf8');
    const building = fs.readFileSync(path.join(ROOT, 'src/screens/onboarding/BuildingProgramme.tsx'), 'utf8');
    // ⛔ 2026-08-23: the in-app door moved from You to TOGETHER (the social home) — the founder:
    // "החלק החברתי צריך להיות נישה נפרדת". The chain's shape is unchanged; only the door's address.
    const profile = fs.readFileSync(path.join(ROOT, 'src/screens/together/Together.tsx'), 'utf8');
    const screen = fs.readFileSync(path.join(ROOT, 'src/screens/import/ImportPlan.tsx'), 'utf8');

    /*
     * 1 · THE DOOR IS THE FIRST SCREEN AFTER SIGN-IN, so the read overlaps the whole intake.
     *
     * ⛔ IT WAS A LINE ON `AboutYou` UNTIL 2026-08-12, and the founder's objection was to its SIZE:
     * *"זה לא פיצ'ר אלא זה חלק מהמוצר שלנו שהגדרנו מערכת שלמה עבורו."* Behind a 14px underline sat
     * this entire file. It is `Start` now — a fork where the two ways to begin are the same size —
     * and the timing argument that put it early is unchanged and is why it moved FORWARD, not back.
     */
    expect(start).toMatch(/navigate\('ImportPlan', \{ fromOnboarding: true \}\)/);
    // …and the intake still begins where it did, one screen later.
    expect(start).toMatch(/navigate\('AboutYou'\)/);
    // …and the profile keeps its own door for an athlete who already finished onboarding.
    expect(profile).toMatch(/navigate\('ImportPlan'\)/);

    // 2 · REGISTERED IN BOTH NAVIGATORS, because they are separate stacks.
    expect(root).toMatch(/OnboardingStack\.Screen name="ImportPlan"/);
    expect(root).toMatch(/MainStack\.Screen name="ImportPlan"/);

    /*
     * 3 · FROM THE INTAKE THE WORK IS HANDED TO THE MODULE — but the SCREEN STAYS (2026-08-29).
     *
     * ⛔ IT USED TO CALL `goBack()` in the same breath as `startImport`, and the founder met exactly
     * what that looks like: *"שלחתי את זה לאפשרות של צילום תוכנית האימון וזה לא עובד זה ישר יוצא
     * מהמסך."* Nothing was broken; nothing said anything. `busy` was never set on that path, `Start`
     * shows no pending state, and the report surfaced minutes later on the build step — which is
     * indistinguishable from a crash, and teaches her the feature does not work.
     *
     * ⚠️ THE 08-11 RULING IS INTACT AND IS WHAT CLAUSES 4 AND 5 STILL ASSERT: the read lives in
     * `pendingImport` so it outlives any screen, she may walk away, and the build step meets it.
     * What is forbidden now is the screen walking away FOR her — so this clause asserts the module
     * hand-off AND the subscription that makes the wait visible.
     */
    expect(screen).toMatch(/startImport\(askCoach as never/);
    expect(screen).toMatch(/if \(fromOnboarding\) return startAndWatch\(\{ images: picked \}\)/);
    expect(screen).toMatch(/return watchImport\(\(st\) => \{/);
    // …and no exit is fired at the moment the read begins. This is the regression itself, pinned.
    expect(screen).not.toMatch(/startImport\([\s\S]{0,200}navigation\?\.goBack/);

    // 4 · THE BUILD STEP IS WHERE SHE MEETS IT, and it is a waiting screen already.
    expect(building).toMatch(/peekImport\(\)\.phase !== 'idle'/);
    expect(building).toMatch(/settledImport\(\)\.then/);
    expect(building).toMatch(/navigation\.replace\('ImportPlan', \{ inputs, review: true,/);

    /*
     * 5 · A FAILED import does not strand her — the ordinary build carries on.
     *
     * ⛔ AND SINCE 2026-08-19 IT ALSO SAYS SO. The build step is the last screen standing when the
     * read settles: `startAndReturn` dismisses the importer the moment the read STARTS, so the
     * failure arrived here minutes later with nowhere to go and was silently dropped. She finished
     * the intake on a generated week believing it was her coach's. Carrying on is right; carrying
     * on without a word is what this clause now forbids.
     */
    expect(building).toMatch(/if \(result\?\.ok\) \{/);
    expect(building).toMatch(/const reason = result \? importFailure\(\) : null;/);
    expect(building).toMatch(/note=\{importFailed \? t\(`import\.fail\.\$\{importFailed\}`\) : null\}/);

    // 6 · KEEPING IT GOES FORWARD, and the intake still finishes at `ProgramCreated`'s CTA.
    expect(screen).toMatch(/clearImport\(\)/);
    /*
     * ⛔ THREE DOORS REACH THE ADOPTION AND THEY ARE NOT ONE SITUATION (fixed 2026-08-30, on the
     * onboarding sweep). This asserted a single exit, and the single exit was the bug: from the
     * FORK there is no relay at all, so `onboardingInputs` is undefined and the fallback was
     * `goBack` — **which is the fork**. She photographed her programme, watched it read, pressed
     * "keep mine", and landed back on *"איפה מתחילים?"* with an authored week on disk and no
     * profile. It was invisible while this screen dismissed itself the moment the read STARTED;
     * making it stay moved the adoption to the fork and brought its missing relay with it.
     */
    // from the build step: forward to the screen that names her programme…
    expect(screen).toMatch(/navigation\?\.replace\?\.\('ProgramCreated', \{/);
    // …and the week she BROUGHT re-stamps the frequency, exactly as `PlanBuilder.onSave` does.
    expect(screen).toMatch(/const days = program\.days\.filter\(\(d\) => !d\.isRest\)\.length;/);
    // from the FORK: on into the intake, because she has not answered a single question yet.
    expect(screen).toMatch(/if \(fromOnboarding\) \{[\s\S]{0,120}navigation\?\.navigate\?\.\('AboutYou'\)/);
    /*
     * …and the step she lands on at the end of that intake does NOT offer to rewrite what she
     * brought: `PlanBuilder` reads the disk in the intake now and takes an authored week straight
     * to the reveal. Before this, the blank sheet and the shelf would have overwritten it
     * (`saveBuiltProgram` is deliberately ungated) and the engine door would have revealed a week
     * `completeOnboarding` then refused to use.
     */
    const builderSrc = fs.readFileSync(path.join(ROOT, 'src/screens/plan/PlanBuilder.tsx'), 'utf8');
    expect(builderSrc).toMatch(/if \(intake\) \{[\s\S]{0,900}db\.loadProgram\(\)/);
    /*
     * ⚠️ AND THE READ CAN NEVER LEAVE HER ON A BLACK SCREEN. `PlanBuilder` renders nothing until
     * `loaded`, so a disk read that does not resolve is a blank rectangle on the step the whole
     * intake rides on. It runs ONCE (a ref, not a dependency list — widening the deps was how I
     * made it re-run and never settle) and the doors appear regardless after a bound.
     */
    expect(builderSrc).toContain('const readOnce = useRef(false);');
    expect(builderSrc).toMatch(/setTimeout\(\(\) => \{ if \(alive\) setLoaded\(true\); \}, 2000\)/);
    expect(builderSrc).toMatch(/authored \?\? 'engine'\) === 'athlete_or_coach' && inputs/);

    /*
     * 6b · MORE THAN ONE PAGE (founder 2026-08-29): *"שמתי לב שאפשר לשלוח רק תמונה אחת בשביל
     * לייבא."*
     *
     * ⛔ `runImport` HAS ALWAYS TAKEN AN ARRAY and sent it in one turn, and `MAX_IMAGES_PER_TURN`
     * has been 3 since the file was written — the whole restriction was one picker flag. A
     * programme that runs over two pages could not be imported at all: she picked one, and the read
     * returned half her week and reported it as the whole of it, which is worse than refusing.
     */
    const picker = fs.readFileSync(path.join(ROOT, 'src/platform/coach/coachImage.ts'), 'utf8');
    expect(picker).toMatch(/allowsMultipleSelection: true/);
    expect(picker).toMatch(/selectionLimit: MAX_IMAGES_PER_TURN/);
    // …and the bound is stated where it is spent, not left to the caller to remember.
    expect(picker).toMatch(/MAX_IMAGES_PER_TURN = 3/);

    /*
     * 6c · THE READER'S ADDRESS REACHES A REAL BUILD.
     *
     * ⛔ `EXPO_PUBLIC_COACH_URL` / `_TOKEN` live in `code/mobile/.env`, which the root `.gitignore`
     * excludes — and EAS honours `.gitignore` when it packages the working tree. With no `env` and
     * no `environment` on a build profile, both arrive EMPTY, `coachIsReachable()` is false, and
     * every import dies instantly as `not_configured` → `unreachable`, on device, silently. That is
     * a shipped feature that cannot work, and nothing in the repo said so.
     *
     * ⚠️ THE VALUES ARE NOT PUT IN THE REPO. `environment` points each profile at the EAS-stored
     * set (`eas env:create --environment production --name EXPO_PUBLIC_COACH_URL …`), which is the
     * one place a build-time public var belongs. This clause asserts the WIRING, which is the half
     * that was missing; whether the values exist is an account fact only EAS can answer.
     */
    const eas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8')) as {
      build: Record<string, { environment?: string }>;
    };
    for (const profile of ['development', 'preview', 'production']) {
      expect({ profile, env: eas.build[profile]?.environment }).toEqual({ profile, env: expect.any(String) });
    }

    /*
     * 6d · SHE CAN SAY NO (founder 2026-08-30): *"תבחן את כל האפשרויות ותיקח את הטובה ביותר."*
     *
     * ⛔ THE REPORT CAN ARRIVE UNINVITED, and until now it arrived with no way out. She photographs
     * a sheet at the fork, walks on into the intake, chooses who writes her week — and the landed
     * import REPLACES the build she is watching. Both acts on that screen adopt the photograph, and
     * the back chevron only exists on the collector branch, so a picture of the wrong page silently
     * overrode the door she chose three minutes earlier. Her only non-adopting exit was an edge
     * swipe back to step 2 of 3.
     *
     * ⚠️ AN EXIT, NOT A THIRD OPINION. Somebody who photographed a programme usually wants it, so
     * "keep mine" stays the primary and this is a line under both buttons. And it is offered ONLY
     * on the path where the screen was not asked for — from the profile she opened the importer
     * herself and the chevron is right there.
     */
    expect(screen).toMatch(/const declineImport = \(\) => \{/);
    // it DISCARDS the read rather than deferring it — being asked twice is the same interruption
    expect(screen).toMatch(/declineImport = \(\) => \{\s*clearImport\(\);/);
    // …and returns her to the SAME build, the sentence she typed included
    expect(screen).toMatch(/coachAsk: route\.params\.coachAsk/);
    expect(building).toMatch(/replace\('ImportPlan', \{ inputs, review: true, \.\.\.\(coachAsk != null/);
    // …offered only where the screen arrived uninvited
    expect(screen).toMatch(/reviewPending && onboardingInputs \? \{ onDecline: declineImport \}/);

    // 7 · THE ONLY WRITER of an adopted week stamps nothing extra on the way to disk.
    expect(screen).toMatch(/app\.adoptImportedProgram\(program\)/);
    expect(STORE).toMatch(/async adoptImportedProgram\(program\)[\s\S]{0,600}await db\.saveProgram\(program\)/);
  });

  it('⛔ nothing in the engine writes `authored` — only the import path may set it', () => {
    /*
     * The field is a statement about PROVENANCE. If `generateProgram` ever stamped it, a generated
     * week could freeze itself and the athlete would lose the adaptation she signed up for. So the
     * engine is asserted never to write it, and the only writer is the import flow.
     */
    const engineDirs = ['src/engine', 'src/data/api'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name)) {
          const text = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
          if (/authored\s*[:=]/.test(text)) offenders.push(rel);
        }
      }
    };
    for (const d of engineDirs) walk(d);
    expect(offenders).toEqual([]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ AND IT SURVIVES A COLD START — the half of this law that was true on paper only.
 *
 * Everything above reads the SOURCE, and the source was right: four rebuilds, four gates, every one
 * of them in front of the call it guards. What no clause here could see is that the gate was asked
 * about `state.program`, and the store dispatches `program: null` at boot on purpose — so the first
 * launch after she closed the app, `engineMayRebuild(null)` said yes and her coach's week was
 * replaced by a Hush week the moment she edited anything.
 *
 * ⚠️ SO THIS ONE BOOTS THE STORE FOR REAL. A law written against source shape can only ever protect
 * the shape it was written for; this mounts the provider with her week on DISK and nothing in React
 * state — which is the exact state every athlete is in on every second launch — and then does the
 * ordinary thing she does: she changes her body map.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a cold start does not forget whose week it is', () => {
  /** The api, off the live provider. Re-captured on every render; the last one is the current one. */
  function Probe({ hold }: { hold: (api: unknown) => void }) {
    hold(useApp());
    return null;
  }

  /** Boot is a chain of awaited storage reads — let them all land before the athlete touches anything. */
  const settle = async () => {
    for (let i = 0; i < 30; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { await Promise.resolve(); });
    }
  };

  it('⛔ the first edit after a restart leaves her coach’s week exactly as it was', async () => {
    await AsyncStorage.clear();
    const brought = coachesWeek();
    await db.saveProfile(athlete());
    await db.saveProgram(brought); // …the week `adoptImportedProgram` wrote, before the app was killed

    let api: any = null;
    let tree: renderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = renderer.create(
        React.createElement(AppProvider, null, React.createElement(Probe, { hold: (a: any) => { api = a; } })),
      );
    });
    await settle();

    // The trap, stated as a fact rather than assumed: she is an athlete, and the store holds no week.
    expect(api.profile).toBeTruthy();
    expect(api.program).toBeNull();

    // The ordinary act — a muscle marked on the body map, which is a RESHAPE and rebuilds.
    await act(async () => { await api.updateProfileInfo({ bodyMap: { Back: 'emphasis' } }); });
    await settle();

    // …and her week is the week her coach wrote, to the set.
    expect(await db.loadProgram()).toEqual(brought);
    // …and the store said so to the caller: nothing was rebuilt, so nothing may be announced as one.
    let told: unknown = null;
    await act(async () => { told = await api.updateProfileInfo({ bodyMap: { Chest: 'emphasis' } }); });
    expect(told).toBe(false);
    expect(await db.loadProgram()).toEqual(brought);

    await act(async () => { tree!.unmount(); });
  });

  it('⛔ …and an ENGINE week on the same cold start is still rebuilt', async () => {
    /*
     * The other direction, and the one a careless fix breaks: reading the disk must not turn the
     * gate into a freeze on everyone. An ordinary athlete's week still answers her body map on the
     * first edit after a restart, exactly as it did before.
     */
    await AsyncStorage.clear();
    const ours = await fixtureModel.generateProgram(athlete());
    await db.saveProfile(athlete());
    await db.saveProgram(ours);

    let api: any = null;
    let tree: renderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = renderer.create(
        React.createElement(AppProvider, null, React.createElement(Probe, { hold: (a: any) => { api = a; } })),
      );
    });
    await settle();

    let told: unknown = null;
    await act(async () => { told = await api.updateProfileInfo({ bodyMap: { Back: 'emphasis' } }); });
    await settle();
    expect(told).toBe(true);
    expect(shapeOf(await db.loadProgram())).not.toEqual(shapeOf(ours));

    await act(async () => { tree!.unmount(); });
  });
});
