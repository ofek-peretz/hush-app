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

import { fixtureModel, estimateSessionMinutes } from '@/data/api/fixtureModel';
import { engineMayRebuild } from '@/state/stores/appStore';
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
    const gates = [...STORE.matchAll(/if \(!engineMayRebuild\(state\.program\)\) return;/g)];
    expect(gates.length).toBe(3); // reportPain · updateProfileInfo · answerEaseCheck
    for (const g of gates) {
      const after = STORE.slice(g.index!, g.index! + 400);
      // The very next statement is the build — nothing may sit between the guard and what it guards.
      expect(after).toMatch(/return;\s*(\/\/[^\n]*\n\s*)*const rebuilt = await model\.generateProgram/);
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
    const profile = fs.readFileSync(path.join(ROOT, 'src/screens/profile/ProfileSheet.tsx'), 'utf8');
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

    // 3 · FROM THE INTAKE IT STARTS AND RETURNS — she does not wait on the collector.
    expect(screen).toMatch(/startImport\(askCoach as never/);
    expect(screen).toMatch(/if \(fromOnboarding\) return startAndReturn\(\{ images: \[img\] \}\)/);

    // 4 · THE BUILD STEP IS WHERE SHE MEETS IT, and it is a waiting screen already.
    expect(building).toMatch(/peekImport\(\)\.phase !== 'idle'/);
    expect(building).toMatch(/settledImport\(\)\.then/);
    expect(building).toMatch(/navigation\.replace\('ImportPlan', \{ inputs, review: true \}\)/);

    // 5 · A FAILED import does not strand her — the ordinary build carries on.
    expect(building).toMatch(/if \(result\?\.ok\) navigation\.replace/);

    // 6 · KEEPING IT GOES FORWARD, and the intake still finishes at `ProgramCreated`'s CTA.
    expect(screen).toMatch(/clearImport\(\)/);
    expect(screen).toMatch(/navigation\?\.replace\?\.\('ProgramCreated', \{ inputs: onboardingInputs \}\)/);

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
