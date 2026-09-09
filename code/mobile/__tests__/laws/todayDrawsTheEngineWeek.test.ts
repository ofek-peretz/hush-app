/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * TODAY DRAWS THE WEEK THE ENGINE BUILT.
 *
 * ⛔ FOUNDER, 2026-08-11: *"תתקן את המסך של Today שיצייר את התוכנית של המנוע."*
 *
 * ── THE HOLE ──────────────────────────────────────────────────────────────────────────────────────
 * Every surface — Today, the pre-workout card, the session runner, the watch, the Saturday letter —
 * reads a `CoachPlan`. Onboarding stopped producing one: it calls `generateProgram` and stores a
 * `Program`. `db.recordCoachAnswer` is the only writer of a `CoachPlan` left and it runs after a
 * SESSION. So an athlete finished onboarding, was shown her programme being built, and arrived at a
 * blank Today — with the week sitting in storage, unread, until the day she trained.
 *
 * ⚠️ AND NOTHING CAUGHT IT. `tsc` was clean, 2,578 tests passed, every screen rendered. The read was
 * simply pointed at a key nothing writes any more. This file is what makes that impossible: it takes
 * the engine's own output and asks what Today would show.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { coachPlanFromProgram, bandFromChoice } from '@/domain/enginePlan';
import { coachWeek, coachRows, coachPlanRows, coachWorkoutId } from '@/domain/coachWeek';
import { fixtureModel, estimateSessionMinutes } from '@/data/api/fixtureModel';
import { SESSION_MIN, SESSION_MAX } from '@/engine/v5/constants';
import { parseCoachPlan } from '@/domain/coachPlan';

const athlete = (over = {}) => ({
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

const build = (over = {}) => fixtureModel.generateProgram(athlete(over));
const workoutsOf = (p) => p.days.filter((d) => !d.isRest && d.slots.length > 0);

describe('⛔ the engine’s week reaches the screen', () => {
  it('⛔ a stored programme is NEVER an empty week — the defect, stated directly', async () => {
    /*
     * Swept over every frequency, because the shape of the week changes with it (full-body below
     * four days, upper/lower above) and an empty answer at ONE of them is still a blank Today.
     */
    const blank: string[] = [];
    for (const days of [2, 3, 4, 5, 6])
      for (const sex of ['male', 'female']) {
        const program = await build({ daysPerWeek: days, sex });
        const week = coachWeek(coachPlanFromProgram(program));
        if (week.length !== workoutsOf(program).length) blank.push(`${sex} ${days}d: ${week.length} of ${workoutsOf(program).length}`);
      }
    expect(blank).toEqual([]);
  });

  it('⛔ every lift, in her order, with the sets the engine dealt', async () => {
    const program = await build({ daysPerWeek: 4 });
    const plan = coachPlanFromProgram(program);
    workoutsOf(program).forEach((day, i) => {
      const rows = coachPlanRows(coachRows(plan, coachWorkoutId(i)), 'kg');
      expect(rows.map((r) => r.exerciseId)).toEqual(day.slots.map((s) => s.exerciseId));
      expect(rows.map((r) => r.sets)).toEqual(day.slots.map((s) => s.setCount));
    });
  });

  it('the day’s NAME is the engine’s own', async () => {
    const program = await build({ daysPerWeek: 4 });
    expect(coachWeek(coachPlanFromProgram(program)).map((w) => w.name)).toEqual(workoutsOf(program).map((d) => d.name));
  });

  it('⛔ a REST day is not a workout', async () => {
    /*
     * `Program.days` holds rest days; `CoachPlan.sessions` are things she does. Carrying one across
     * would put an empty chip on her week and give the runner a session with no work in it.
     */
    const program = await build({ daysPerWeek: 3 });
    const before = coachPlanFromProgram(program).sessions.length;
    // Whether the engine emits rest days varies with the week's shape, so one is added by hand —
    // the claim is about the conversion, and it must hold for any programme that carries one.
    const withRest = {
      ...program,
      days: [...program.days, { id: 'rest_x', name: 'Rest', muscleGroups: [], isRest: true, slots: [] }],
    };
    expect(coachPlanFromProgram(withRest).sessions).toHaveLength(before);
    expect(coachPlanFromProgram(withRest).sessions.every((s) => s.name !== 'Rest')).toBe(true);
  });

  it('⛔ the ids are the ones every surface already matches on', async () => {
    /*
     * "Done this week" is derived by filtering history for `programDayId.startsWith('coach_')`, and
     * `SessionFlow` looks a workout up by the same id. An id of any other shape would render a week
     * that could be read and never started, and never marked done.
     */
    const week = coachWeek(coachPlanFromProgram(await build({ daysPerWeek: 4 })));
    expect(week.map((w) => w.id)).toEqual(week.map((_, i) => coachWorkoutId(i)));
    for (const w of week) expect(w.id.startsWith('coach_')).toBe(true);
  });

  it('⛔ THE MINUTES ARE THE ENGINE’S MINUTES — one answer, not two', async () => {
    /*
     * ⛔ THE DEFECT THIS CLOSED, AND IT IS THE ONE SHE WOULD HAVE SEEN FIRST.
     *
     * `enforceTimeCap` cuts a day until it fits `SESSION_MAX` priced at the day-one bootstrap.
     * `coachWeek` priced the same day at a flat `EXEC_S + DEFAULT_REST_S` per set plus a transition.
     * Measured over twenty-four generated sessions, Today overstated EVERY one of them, by up to
     * nine minutes — announcing sixty-six for a session the engine had capped at sixty.
     *
     * The founder has caught this exact class of defect on this exact screen before ("the home
     * screen still shows about 35 minutes for a longer workout"), so it is asserted to the minute
     * rather than to a tolerance.
     */
    const off: string[] = [];
    for (const days of [3, 4, 5, 6])
      for (const sex of ['male', 'female']) {
        const program = await build({ daysPerWeek: days, sex });
        const week = coachWeek(coachPlanFromProgram(program));
        workoutsOf(program).forEach((d, i) => {
          const engine = Math.round(estimateSessionMinutes(d));
          if (week[i].minutes !== engine) off.push(`${sex} ${days}d ${d.name}: Today ${week[i].minutes} vs engine ${engine}`);
        });
      }
    expect(off).toEqual([]);
  });

  it('⛔ …and what she is told is inside the hour she was promised', async () => {
    // The number the engine holds itself to (F-15), asserted on the figure she actually reads.
    const outside: string[] = [];
    for (const days of [3, 4, 5, 6]) {
      const program = await build({ daysPerWeek: days });
      for (const w of coachWeek(coachPlanFromProgram(program)))
        if (w.minutes < SESSION_MIN || w.minutes > SESSION_MAX) outside.push(`${days}d ${w.name}: ${w.minutes} min`);
    }
    expect(outside).toEqual([]);
  });

  it('⛔ IT NEVER PRESCRIBES REST — the field the session runner obeys stays empty', async () => {
    /*
     * ⛔ THE MOST DANGEROUS FIELD IN THIS CONVERSION. `restAfterStep` reads `restS` as the coach's
     * PRESCRIPTION and it overrules her learned median (S-17) — so a number written here to make an
     * estimate tidier would silently start prescribing rest to every athlete on the engine's week,
     * on every set, forever. The engine has never prescribed rest and this must not start.
     */
    const plan = coachPlanFromProgram(await build({ daysPerWeek: 5 }));
    for (const s of plan.sessions)
      for (const b of s.blocks) {
        expect(b.restS).toBeUndefined();
        expect(b.restAfterS).toBeUndefined();
      }
  });

  it('⛔ it invents no PROSE — no `say`, no `why`', async () => {
    /*
     * The coach wrote an execution instruction per lift and a paragraph about the programme. The
     * engine wrote neither, and filling them would be the app arguing on its behalf (R7) — the
     * exact failure the AI removal was for.
     */
    const plan = coachPlanFromProgram(await build({ daysPerWeek: 4 }));
    expect(plan.why).toBeUndefined();
    for (const s of plan.sessions) for (const b of s.blocks) for (const i of b.items) expect(i.say).toBeUndefined();
  });

  it('⛔ each lift is its OWN block — nothing is turned into a circuit', async () => {
    /*
     * A block is done `rounds` times as a group. Two lifts in one block is a superset, and the
     * session runner would alternate them. The engine writes straight sets.
     */
    const plan = coachPlanFromProgram(await build({ daysPerWeek: 4 }));
    for (const s of plan.sessions) for (const b of s.blocks) expect(b.items).toHaveLength(1);
  });

  it('⛔ the LOADS are the engine’s, and an unmet lift carries none', async () => {
    /*
     * A lift she has never performed has no load until her first set decides it (S-38). Null is the
     * honest answer, and the surfaces already draw it as "no weight, the scheme alone".
     */
    const program = await build({ daysPerWeek: 4 });
    const first = program.days.find((d) => !d.isRest).slots[0];
    const targets = [
      { exerciseId: first.exerciseId, setIndex: 0, recommendedWeight: 42.5, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
    ];
    const plan = coachPlanFromProgram(program, targets, [8, 10]);
    const rows = coachPlanRows(coachRows(plan, coachWorkoutId(0)), 'kg');
    expect(rows[0].load).toBe(42.5);
    expect(rows[0].band).toEqual([8, 10]);
    expect(rows[1].load).toBeNull(); // no target yet — and it says so rather than guessing
  });

  it('⛔ her BAND is hers, not the default, when the engine has no target yet', async () => {
    const program = await build({ daysPerWeek: 4, repBand: '6-8' });
    const plan = coachPlanFromProgram(program, [], bandFromChoice('6-8'));
    const rows = coachPlanRows(coachRows(plan, coachWorkoutId(0)), 'kg');
    for (const r of rows) expect(r.band).toEqual([6, 8]);
  });

  it('a later set’s target never overwrites the first one’s', async () => {
    // Loop 1 moves the load BETWEEN sets, so set 3 may carry a different weight. The written week is
    // the prescription she starts from, which is set one.
    const program = await build({ daysPerWeek: 4 });
    const first = program.days.find((d) => !d.isRest).slots[0];
    const plan = coachPlanFromProgram(program, [
      { exerciseId: first.exerciseId, setIndex: 2, recommendedWeight: 60, recommendedReps: 8 },
      { exerciseId: first.exerciseId, setIndex: 0, recommendedWeight: 40, recommendedReps: 8 },
    ]);
    expect(coachPlanRows(coachRows(plan, coachWorkoutId(0)), 'kg')[0].load).toBe(40);
  });

  it('nothing to convert answers NOTHING — not an empty week', async () => {
    // `null` is what makes Home fall through to its old behaviour instead of drawing a blank plan.
    expect(coachPlanFromProgram(null)).toBeNull();
    expect(coachPlanFromProgram({ id: 'p', frequency: 0, days: [] })).toBeNull();
    expect(coachPlanFromProgram({ id: 'p', frequency: 1, days: [{ id: 'd', name: 'R', muscleGroups: [], isRest: true, slots: [] }] })).toBeNull();
  });

  it('⛔ THE WHOLE CHAIN — the conversion is worthless if the screen does not call it', () => {
    /*
     * ⛔ THIS IS THE TEST THAT WOULD HAVE CAUGHT THE ORIGINAL DEFECT, and every test above it would
     * not have. `coachPlanFromProgram` can be perfect and Today can still be blank, because the bug
     * was never in a function — it was a READ pointed at a key nothing writes any more.
     *
     * So the source is read as data, the way the reachability laws do it. Each link is asserted
     * separately so a red run names which one was cut.
     */
    const fs = require('fs');
    const path = require('path');
    const { globSync } = require('glob');
    const src = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', p), 'utf8');

    // 1 · ONE bridge, in one place. Nine screens read her week; nine conversions would drift, and
    //     the first version of this fix had two within a day of each other.
    const bridges = globSync('**/*.{ts,tsx}', { cwd: path.resolve(__dirname, '..', '..', 'src'), absolute: true })
      .filter((f: string) => !f.includes('enginePlan'))
      .filter((f: string) => fs.readFileSync(f, 'utf8').includes('coachPlanFromProgram('));
    /*
     * `planReview.ts` joined 2026-08-25 (the plan builder's AI opinion): it converts the DRAFT she
     * is editing so the coach reviews exactly the week on her screen, loads included. Same bridge,
     * second consumer — still nothing else may run its own conversion.
     */
    expect(bridges.map((f: string) => path.basename(f)).sort()).toEqual(['planReview.ts', 'weekPlan.ts']);

    // 2 · …and it is the door every surface actually goes through.
    const door = src('data/local/weekPlan.ts');
    expect(door).toContain('db.loadCoachPlan'); //   a stored coach week still wins
    expect(door).toContain('db.loadProgram'); //     …and the engine's is the fallback
    expect(door).toContain('sessionTargets'); //     …with the engine's own loads on it

    // 3 · every screen that draws her week asks that door, and none of them asks the dead key.
    const SURFACES = [
      'screens/home/Home.tsx',
      'screens/plan/PreWorkoutScreen.tsx',
      'screens/plan/SharePlanScreen.tsx',
      'screens/progress/LiftDetail.tsx',
      'screens/weekly/WeeklyUpdate.tsx',
      'screens/session/SessionFlow.tsx',
    ];
    /*
     * ⛔ `screens/pain/PainWhere.tsx` CAME OFF THIS LIST ON 2026-08-12. It used to read her week
     * because it was a CHAT and the coach needed the context. It is the body map again — she points
     * at a muscle and picks a severity — and it reads nothing but her body map and the pain tables.
     * A screen listed here that does not draw her week would be a law asking for a read nobody needs.
     *
     * ⛔ AND `screens/profile/ProfileSheet.tsx` CAME OFF IT ON 2026-08-18, for the same reason worn
     * differently: it drew NOTHING from the week. Its read fed a `hasPlan` flag that gated a
     * Share-or-Bring fork, the fork was removed (one destination, see the door there), and the flag
     * was then a whole-week disk read on every open of the You tab that no pixel could see. The law
     * was holding the read in place after the row it served had gone.
     */
    expect(src('screens/pain/PainWhere.tsx')).not.toContain('loadWeekPlan');
    /* Comments are stripped first — several of these files EXPLAIN the old read in prose, and a law
       that cannot tell code from its own documentation teaches people to stop writing the prose. */
    const code = (body: string) => body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const stillDirect: string[] = [];
    for (const f of SURFACES) {
      const body = src(f);
      expect(body).toContain('loadWeekPlan');
      if (/db\.loadCoachPlan\(\)/.test(code(body))) stillDirect.push(f);
    }
    /*
     * ⛔ THE ONE THAT WOULD HAVE CAUGHT THE ORIGINAL BUG. `db.loadCoachPlan()` answers `null` on the
     * engine's path, and a surface calling it directly is a blank screen waiting to be noticed —
     * which is exactly how Today shipped empty — and again a day later through Home's DRAG re-read,
     * which emptied the board the moment she moved a session.
     */
    expect(stillDirect).toEqual([]);

    // 5 · the pre-workout card reads the same stored week — for the day's budget verdict and, since
    //     2026-09-07, for the drag that reorders it (`app.reorderExercise` by day id). The placement
    //     sheet it used to build off that read is gone with the founder's ruling (theWedgeLands…).
    const pre = src('screens/plan/PreWorkoutScreen.tsx');
    expect(pre).toContain('db.loadProgram');
    expect(pre).toContain('app.reorderExercise');
    expect(pre).not.toContain('WhyHereSheet');


    // 6 · and the row asks for every lift, not only a changed one (the WHY defect, in one line).
    expect(src('components/PlanLifts.tsx')).toContain('onWhy ? onWhy(lift.exerciseId) : onForm(lift.exerciseId)');
  });

  it('⛔ the engine PRICING FLAG is set here and only here', async () => {
    /*
     * `coachWeek` prices a week differently when it sees this flag. If the bridge stopped setting it
     * the minutes law above would go red — but a COACH plan carrying it would be priced by the
     * engine's bootstrap, which is the other half of the same mistake. `parseCoachPlan` does not
     * read the field, so nothing off the wire can claim it; this pins the local half.
     */
    expect(coachPlanFromProgram(await build({ daysPerWeek: 4 })).pricing).toBe('engine');
    const parsed = parseCoachPlan(
      JSON.stringify({
        say: 'ok',
        pricing: 'engine',
        sessions: [{ name: 'A', blocks: [{ rounds: 3, restS: 90, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 10], load: 40 }] }] }],
      }),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.answer.plan.pricing).toBeUndefined();
  });
});
