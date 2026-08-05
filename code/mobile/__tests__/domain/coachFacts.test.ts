import { coachFacts, coachCatalogue, coachEquipment, COACH_FACTS_VERSION } from '@/domain/coachFacts';
import { parseCoachPlan } from '@/domain/coachPlan';
import { EXERCISES } from '@/data/exercises';
import { STARTING_INCREMENT } from '@/engine/v5/constants';
import type { Profile, Session, SetLog, Program } from '@/data/local/models';

/**
 * The sheet is the message the founder described: *"as if I did a workout, sent you all the data,
 * and said — now decide."* These tests ask the only two questions that matter about it.
 *
 *   1. Can the decisions he named actually be made FROM it? A sheet that is missing one field is a
 *      coach that has to guess, and guessing is the thing the product forbids.
 *   2. Does it carry anything it was not given on purpose?
 */

const profile: Profile = {
  sex: 'female',
  weightKg: 62,
  units: 'kg',
  goal: 'build_muscle',
  daysPerWeek: 4,
  repBand: '8-10',
  workoutMinutes: 55,
  healthConnected: false,
  name: 'Dana Levi',
};

function set(exerciseId: string, i: number, w: number, r: number, atMin: number, rest = 120): SetLog {
  return {
    exerciseId,
    setIndex: i,
    recommendedWeight: w,
    recommendedReps: 8,
    actualWeight: w,
    actualReps: r,
    edited: false,
    restBeforeS: rest,
    persistedAt: new Date(Date.UTC(2026, 6, 26, 17, atMin)).toISOString(),
  };
}

/** A real session shape: bench 30 kg for four sets, then a row. */
function session(startedAt: string, benchKg: number): Session {
  return {
    id: 's-' + startedAt,
    programDayId: 'd1',
    programDayName: 'Upper A',
    startedAt,
    state: 'SAVED',
    earlyFinish: false,
    trained: true,
    sets: [
      set('bb_bench_press', 0, benchKg, 12, 0),
      set('bb_bench_press', 1, benchKg, 11, 4),
      set('bb_bench_press', 2, benchKg, 10, 8),
      set('bb_bench_press', 3, benchKg, 8, 12),
      set('bb_row', 0, 40, 10, 18),
      set('bb_row', 1, 40, 10, 22),
    ],
  };
}

const program: Program = {
  id: 'p1',
  frequency: 4,
  days: [
    { id: 'd1', name: 'Upper A', muscleGroups: ['Chest', 'Back'], isRest: false,
      slots: [
        { capability: 'horizontal_push', exerciseId: 'bb_bench_press', setCount: 4 },
        { capability: 'horizontal_pull', exerciseId: 'bb_row', setCount: 3 },
      ] },
    { id: 'd2', name: 'Rest', muscleGroups: [], isRest: true, slots: [] },
  ],
};

const history = [session('2026-07-26T17:00:00.000Z', 30), session('2026-07-19T17:00:00.000Z', 27.5)];

function build() {
  return coachFacts({ profile, plan: null, history, justFinished: history[0] });
}

describe('coach facts — the message the coach is sent', () => {
  it('states what she actually did, set by set, with the rest that makes a rep count mean something', () => {
    const f = build();
    expect(f.v).toBe(COACH_FACTS_VERSION);
    const bench = f.session!.lifts.find((l) => l.ex === 'bb_bench_press')!;
    expect(bench.sets.map((s) => [s.w, s.r])).toEqual([[30, 12], [30, 11], [30, 10], [30, 8]]);
    expect(bench.sets.every((s) => s.rest === 120)).toBe(true);
    // The ASK is stated beside the result — the gap between them is the whole signal.
    expect({ askedLoad: bench.askedLoad, askedReps: bench.askedReps }).toEqual({ askedLoad: 30, askedReps: 8 });
  });

  it('costs the session in the minutes she actually lived, not a modelled per-set constant', () => {
    // First set stamped at :00, last at :22 — 22 minutes, read from the record.
    expect(build().session!.minutes).toBe(22);
  });

  it('answers "I press 30 on the bar, what do I take on the machine?" without guessing', () => {
    // The founder's own example. It is answerable only if the sheet carries, for the lift she HAS
    // done: the load, the muscle, the capability, the pattern and the equipment — and, for the lift
    // she has NOT done, the same descriptors plus that equipment's grain.
    const f = build();
    const done = f.performed.find((p) => p.ex === 'bb_bench_press')!;
    expect(done.recent[0].load).toBe(30); // newest first — what she pressed last time
    expect(done.rungs).toEqual([27.5, 30]); // her real ladder, both occurrences
    expect(done.occurrences).toBe(2);
    for (const field of ['muscle', 'capability', 'pattern', 'equipment', 'tier'] as const) {
      expect({ field, present: typeof done[field] === 'string' && done[field].length > 0 })
        .toEqual({ field, present: true });
    }

    // The machine she is asking to move to must be findable in the catalogue by the SAME
    // descriptors, or there is nothing to map between.
    const machine = f.catalogue.find(
      (c) => c.capability === done.capability && c.equipment === 'machine',
    );
    expect(machine).toBeDefined();

    // And its grain must be stated, so the answer lands on a weight the machine can hold.
    expect(f.equipment.machine.step).toBe(STARTING_INCREMENT.machine);
    expect(f.equipment.barbell.floor).toBe(20); // no barbell decision may fall under the bar
  });

  it('carries every equipment class the catalogue can prescribe — no silent gap', () => {
    const grains = coachEquipment();
    for (const ex of EXERCISES) {
      expect({ equipment: ex.equipment, stated: grains[ex.equipment] != null })
        .toEqual({ equipment: ex.equipment, stated: true });
    }
  });

  it('shows the coach THE PROGRAMME IT WROTE, in all four shapes', () => {
    /*
     * ⚠️ This used to send the ENGINE's `Program`, which for a coach-led athlete is empty — so the
     * coach was being asked after every session to decide what happens next WITHOUT being shown the
     * week it had prescribed. It could see what she did and why it had decided things, and not what
     * it had actually asked for.
     *
     * All four shapes, because the programme has them: a `lifts` list would describe a marathon week
     * as three squat sessions and nothing else.
     */
    const parsed = parseCoachPlan(
      JSON.stringify({
        say: 'ok',
        sessions: [{
          name: 'Intervals', day: 'tue',
          blocks: [
            { rounds: 4, restS: 60, items: [{ kind: 'distance', ex: 'run_outdoor', metres: 400 }] },
            { rounds: 3, restS: 90, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: 40 }] },
          ],
        }],
      }),
    );
    if (!parsed.ok) throw new Error('the fixture must parse');
    const f = coachFacts({ profile, plan: parsed.answer.plan, history, justFinished: history[0] });
    expect(f.programme).toEqual([
      {
        name: 'Intervals',
        day: 'tue',
        items: [
          { ex: 'run_outdoor', kind: 'distance', rounds: 4, metres: 400 },
          { ex: 'bb_bench_press', kind: 'reps', rounds: 3, reps: [8, 12], load: 40 },
        ],
      },
    ]);
  });

  it('states an empty programme before the coach has written one', () => {
    // The intake's one call. A fact about her, not a hole to fill with assumptions.
    expect(build().programme).toEqual([]);
  });

  it('sends her injuries as an instruction, not a reading', () => {
    /*
     * ⚠️ THE MAP LEFT THIS TEST ON 2026-08-05, and so did the band — see the two tests below and
     * `everyFactIsNamedToTheCoach`. What survives is the claim the title was always about: an injury
     * she reported is an INSTRUCTION to work around, and it reaches the coach with the severity and
     * the date attached rather than as something for it to infer.
     *
     * `untilMs` is stated relative to `nowMs` now, because the sheet only carries live windows.
     */
    const now = 1_000_000;
    const f = coachFacts({
      profile: {
        ...profile,
        bodyMap: { Chest: 'emphasis' },
        repBandByMuscle: { Chest: '6-8' },
        painEases: [{ muscle: 'Shoulders', severity: 'twinge', fromMs: 1, untilMs: now + 999 }],
      }, plan: null , history, justFinished: history[0], nowMs: now,
    });
    expect(f.athlete.resting).toEqual([{ muscle: 'Shoulders', severity: 'twinge', untilMs: now + 999 }]);
    expect(f.athlete.minutes).toBe(55);
    // Neither of the two engine-era fields rides along, even when the profile carries both.
    expect('emphasis' in f.athlete).toBe(false);
    expect('bandByMuscle' in f.athlete).toBe(false);
  });

  it('⛔ but NOT the rep band, which was never her instruction', () => {
    /*
     * ⛔ 2026-08-05. The test above used to assert `bandByMuscle` alongside these, under a title that
     * called all three "her instructions". Two of them are. The band is not: `profile.repBand` is the
     * literal '8-10' written at sign-up, the same string for every athlete alive, and `bandByMuscle`
     * is empty unless she imported someone else's shared plan — in which case it describes THAT plan.
     *
     * On the sheet, beside her age and her bodyweight, it read as a preference she had expressed, and
     * the coach had no way to tell a default from an answer. It sets the band on every item it writes
     * and the app enforces that band live, so nothing was lost by dropping it.
     */
    const f = coachFacts({
      profile: { ...profile, repBand: '8-10', repBandByMuscle: { Chest: '6-8' } },
      plan: null, history, justFinished: history[0],
    });
    expect('band' in f.athlete).toBe(false);
    expect('bandByMuscle' in f.athlete).toBe(false);
    expect(JSON.stringify(f)).not.toContain('8-10');
  });

  it('never sends her name, and sends no field it was not explicitly given', () => {
    const json = JSON.stringify(build());
    expect(json).not.toContain('Dana');
    expect(json).not.toContain('Levi');
    /*
     * The athlete block is an allow-list, not a copy of the profile — asserted against a REAL
     * profile, which always carries `startWeightKg` (stamped at onboarding and never moved). A
     * fixture missing it would let a new field slip in unlisted whenever it happened to be absent.
     */
    const full = coachFacts({ profile: { ...profile, startWeightKg: 62 }, plan: null, history, justFinished: history[0] });
    expect(Object.keys(full.athlete).sort()).toEqual(
      // `language` is on the athlete because everything the coach writes is read by HER — see
      // `thePreambleIsTheSameForEveryone`, which holds it below the cache breakpoint.
      // ⚠️ `band` left this list on 2026-08-05 — see the test above for why it was never hers.
      ['daysPerWeek', 'language', 'minutes', 'sex', 'startWeightKg', 'units', 'weightKg'].sort(),
    );
  });

  it('holds its shape when there is no history, no programme and no session', () => {
    const f = coachFacts({ profile, plan: null, history: [], justFinished: undefined });
    expect(f.session).toBeUndefined();
    expect(f.performed).toEqual([]);
    expect(f.programme).toEqual([]);
    expect(f.catalogue.length).toBe(EXERCISES.length); // the coach can still choose
  });

  it('drops a lift whose id is no longer in the catalogue rather than inventing a name for it', () => {
    const ghost = { ...history[0], sets: [...history[0].sets, set('deleted_lift_id', 0, 50, 5, 30)] };
    const f = coachFacts({ profile, plan: null, history: [ghost], justFinished: ghost });
    expect(f.session!.lifts.map((l) => l.ex)).toEqual(['bb_bench_press', 'bb_row']);
    expect(f.performed.map((p) => p.ex).includes('deleted_lift_id')).toBe(false);
  });

  it('is small enough that the expensive model is affordable — the measurement, not an estimate', () => {
    const f = build();
    const tok = (o: unknown) => Math.round(JSON.stringify(o).length / 3.5);
    const cat = tok(coachCatalogue());
    const perAthlete = tok({ ...f, catalogue: [] });
    // THE CACHEABLE HALF. The catalogue is byte-identical for every athlete and every call, so it
    // goes FIRST in the prompt and is read from cache at a tenth of the input price. Measured: 3,087
    // tokens against 5,699 for the full exercise records — the fields dropped (cues, video, display
    // metadata, cold-start constants) are not inputs to a choice. `name` and `pattern` are KEPT on
    // purpose: `pattern` is what makes "I bench 30, what do I take on the machine?" answerable at
    // all, and `name` stops the coach from rendering a lift by a name the screen does not use.
    // The bound guards GROWTH, which is the real risk — a field added here is paid on every call
    // for every athlete for ever.
    // ⚠️ PER LIFT, not per catalogue (2026-08-01, when the catalogue went 68 → 116). A total is
    // blind to the difference between a lift added — which is what the list is for — and a FIELD
    // added, which is paid on every entry of it for ever. `everyPrescribableThingHasOneId` holds
    // the founder's own number (~159 bytes a lift); this holds the ratio that made the split worth
    // making at all.
    expect(cat / EXERCISES.length).toBeLessThan(50);
    expect(tok(EXERCISES)).toBeGreaterThan(cat * 1.8); // the saving is real, not rounding
    /*
     * THE FRESH HALF — paid in full on every call. This is the number the cost table rests on.
     *
     * Raised 2,000 → 4,000 on 2026-08-02, when `performed` gained the last six occurrences of each
     * lift. Measured at the heavy end (15 lifts × 12 weeks): 2,989 tokens, of which the history is
     * ~1,600 — about $0.37 per athlete per year at $1.50/MTok.
     *
     * It is the same trade the catalogue's ceiling makes, and it is worth naming: the sheet used to
     * be small because it said less than the engine knew. A bench stuck at one load for four
     * sessions arrived as a tidy ascending ladder. Paying a third of a dollar a year so the coach
     * can SEE a stall is not a cost problem, it is the product.
     */
    expect(perAthlete).toBeLessThan(4000);
  });
});

describe('what she has chosen with her hands', () => {
  /*
   * ⚠️ THIS WAS MISSING, AND IT WAS THE QUIET KIND OF MISSING.
   *
   * Two same-target swaps in a row adopt a standing substitute (S-69): she has told the app, by
   * DOING it rather than saying it, that she trains Y where it offers X. The coach never saw that —
   * so it would have kept prescribing X every single week while she silently swapped it out every
   * single session, and neither of them would ever have found out.
   */
  it('sends the lifts she has swapped away from, and the ones she asked to keep', () => {
    const f = coachFacts({
      profile,
      plan: null,
      history,
      preferences: {
        substitutes: { bb_bench_press: 'db_bench_press' },
        keep: { Back: 'bb_row' },
      },
    });
    expect(f.swappedByHer).toEqual({ bb_bench_press: 'db_bench_press' });
    expect(f.keepsByHer).toEqual({ Back: 'bb_row' });
  });

  it('omits them entirely when she has asked for nothing', () => {
    // An empty object on every sheet is bytes paid for on every call to say "she has not asked for
    // anything" — and a field that is present-but-empty invites the coach to reason about it.
    const f = coachFacts({ profile, plan: null, history, preferences: { substitutes: {}, keep: {} } });
    expect('swappedByHer' in f).toBe(false);
    expect('keepsByHer' in f).toBe(false);
  });

  it('omits them when the caller does not supply any', () => {
    const f = coachFacts({ profile, plan: null, history });
    expect('swappedByHer' in f).toBe(false);
  });
});

describe('everything the workout produces reaches the coach', () => {
  /*
   * The founder's check before moving on: *"does it use all the data the workout gives it, in the
   * best way?"* Two things did not, and both were invisible because nothing broke.
   */
  it('⚠️ sends the runs she recorded HERSELF, outside the programme', () => {
    /*
     * "Recorded, never coached" was a wall built when a run was not something anything here could
     * reason about. The coach PRESCRIBES runs now — so without this it would write her a 5 km
     * Tuesday knowing nothing about the 10 km she ran on Sunday, every week, and then wonder in its
     * own notes why her legs were not recovering.
     */
    const f = coachFacts({
      profile, plan: null, history,
      cardio: [{
        kind: 'cardio', id: 'c1', gait: 'run', startedAt: '2026-07-28T06:00:00.000Z',
        durationSec: 3120, distanceKm: 10.4, avgPaceSec: 300, avgHr: 152, splits: [],
      }],
    });
    expect(f.ranOwn).toEqual([
      { at: '2026-07-28T06:00:00.000Z', gait: 'run', metres: 10400, seconds: 3120, paceSecPerKm: 300, avgHr: 152 },
    ]);
  });

  it('does not send the ROUTE', () => {
    // A GPS trace is the most identifying thing this app holds, and it tells the coach nothing a
    // distance and a pace do not.
    const f = coachFacts({
      profile, plan: null, history,
      cardio: [{
        kind: 'cardio', id: 'c1', gait: 'run', startedAt: '2026-07-28T06:00:00.000Z',
        durationSec: 1800, distanceKm: 5, avgPaceSec: 360, splits: [],
        route: [{ lat: 32.08, lon: 34.78, at: 1 }] as never,
      }],
    });
    expect(JSON.stringify(f)).not.toContain('32.08');
    expect(JSON.stringify(f)).not.toContain('route');
  });

  it('omits her runs entirely when there are none', () => {
    expect('ranOwn' in coachFacts({ profile, plan: null, history })).toBe(false);
  });

  it('⚠️ sends what she WEIGHED when Hush met her, beside what she weighs now', () => {
    /*
     * For "get stronger" the current number is enough. For gain or lose it is the whole feedback
     * loop — and a coach shown a single reading cannot know which direction she has been going,
     * how fast, or whether the last month of work did anything at all.
     */
    const f = coachFacts({ profile: { ...profile, weightKg: 66, startWeightKg: 62 }, plan: null, history });
    expect(f.athlete.startWeightKg).toBe(62);
    expect(f.athlete.weightKg).toBe(66);
  });
});
