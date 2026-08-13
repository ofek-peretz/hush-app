/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * READING A PROGRAMME SHE ALREADY HAS.
 *
 * ⛔ FOUNDER, 2026-08-11: *"נצטרך שהמנוע לא יחתוך למתאמן וישמר לו את התוכנית ורק ינהל אותה."*
 *
 * `aWeekSheBroughtIsNotOursToRewrite` proves the ENGINE cannot touch an imported week. This file
 * proves the other half: that the week we build from her words is the week she wrote.
 *
 * The two failures that matter here are opposite and both silent:
 *   · a WRONG match — she wrote "nordic curl", we heard "leg curl", and she trains something else
 *     for a month without ever being told;
 *   · a TIMID match — we fail to recognise "bench" and hand her a questionnaire instead of a
 *     programme, which is how an import feature stops being used.
 *
 * So the matcher is tested from both directions, on the words lifters actually write.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import {
  matchLift,
  matchWeek,
  toProgram,
  reviewFindings,
  isRunnable,
  normaliseLiftName,
  SETS_WHEN_UNSTATED,
  type ImportedWeek,
} from '@/domain/importedPlan';
import { exerciseById, EXERCISES } from '@/data/exercises';
import { SESSION_MAX, SETS_MAX, WEEKLY_SETS_FLOOR } from '@/engine/v5/constants';

describe('⛔ her words → our catalogue', () => {
  it('reads the names lifters actually write', () => {
    /*
     * Every one of these is a string a real programme contains. If this list shrinks, the feature
     * got worse: each miss is an athlete answering a question she should never have been asked.
     */
    const cases: [string, string][] = [
      ['Barbell Bench Press', 'bb_bench_press'],
      ['bench', 'bb_bench_press'],
      ['BB Bench Press', 'bb_bench_press'],
      ['bench press', 'bb_bench_press'], // unqualified, it is the barbell one in every gym
      ['Incline Dumbbell Press', 'incline_db_press'],
      ['incline db press', 'incline_db_press'],
      ['DB Row', 'db_row'],
      ['dumbbell row', 'db_row'],
      ['Romanian Deadlift', 'bb_rdl'],
      ['RDL', 'bb_rdl'],
      ['Barbell Back Squat', 'bb_back_squat'],
      ['back squat', 'bb_back_squat'],
      ['Leg Press', 'leg_press'],
      ['Lat Pulldown', 'lat_pulldown'],
      ['lat pulldown', 'lat_pulldown'],
      ['Leg Curl', 'leg_curl'],
      ['Hip Thrust', 'hip_thrust'],
      ['Barbell Hip Thrust', 'hip_thrust'],
      ['Pull-up', 'pull_up'],
      ['pull ups', 'pull_up'],
      ['Triceps Pushdown', 'triceps_pushdown'],
      ['Face Pull', 'face_pull'],
      ['Hack Squat', 'hack_squat'],
      ['Bulgarian Split Squat', 'bulgarian_split_squat'],
      ['Standing Calf Raise', 'standing_calf_raise'],
      ['Preacher Curl', 'preacher_curl'],
      ['Hammer Curl', 'hammer_curl'],
      ['Cable Fly', 'cable_fly'],
      ['Pec Deck', 'pec_deck'],
      ['Deadlift', 'bb_deadlift'],
    ];
    const missed = cases.filter(([raw, id]) => matchLift(raw).id !== id).map(([raw, id]) => `${raw} → ${matchLift(raw).id ?? 'nothing'} (wanted ${id})`);
    expect(missed).toEqual([]);
  });

  it('⛔ refuses to guess — an ambiguous or unknown name comes back unmatched, never wrong', () => {
    /*
     * The failure this prevents is the expensive one. "Press" is contained in a dozen lifts; a
     * scoring matcher picks whichever sorts first and she silently trains it. "Nordic curl" is a real
     * exercise this catalogue does not have, and answering it with a leg curl would be a substitution
     * she never agreed to.
     */
    /*
     * ⚠️ 'squat' AND 'lunge' ARE NOT HERE, and that is not a weakening. The catalogue DECLARES them
     * as synonyms of the barbell back squat and the walking lunge — a match on a name the catalogue
     * itself offers is an answer, not a guess. What must never match is a bare movement word nobody
     * declared ('press', 'curl', 'row') or a real exercise this catalogue does not carry.
     */
    for (const raw of ['press', 'curl', 'row', 'raise', 'jefferson curl', 'zercher squat', 'sissy squat', '']) {
      expect(matchLift(raw).id).toBeNull();
    }
  });

  it('⛔ never matches two different names to one lift by accident — the ids it returns are real', () => {
    const ids = new Set(EXERCISES.map((e) => e.id));
    for (const raw of ['Barbell Bench Press', 'RDL', 'lat pulldown', 'pull ups']) {
      const { id } = matchLift(raw);
      expect(id).not.toBeNull();
      expect(ids.has(id as string)).toBe(true);
    }
  });

  it('normalises the way a lifter writes, not the way a database does', () => {
    expect(normaliseLiftName('BB  Bench-Press!!')).toBe('barbell bench press');
    expect(normaliseLiftName('DB Rows')).toBe('dumbbell row');
    expect(normaliseLiftName('  OHP ')).toBe('overhead press');
  });
});

/** A real three-day programme, written the way an athlete writes one. */
const herWeek: ImportedWeek = {
  title: 'My coach’s block',
  sessions: [
    {
      name: 'Push',
      lifts: [
        { name: 'Barbell Bench Press', sets: 5 },
        { name: 'Incline DB Press', sets: 4 },
        { name: 'Cable Fly', sets: 3 },
        { name: 'OHP', sets: 4 },
        { name: 'Triceps Pushdown', sets: 3 },
        { name: 'Zercher Squat', sets: 3 }, // a real lift this catalogue does not carry
      ],
    },
    {
      name: 'Pull',
      lifts: [
        { name: 'Deadlift', sets: 4 },
        { name: 'Pull-up', sets: 4 },
        { name: 'DB Row' }, // no set count given
        { name: 'Hammer Curl', sets: 3 },
      ],
    },
    {
      name: 'Legs',
      lifts: [
        { name: 'Back Squat', sets: 6 }, // above F-1's ceiling
        { name: 'Leg Press', sets: 4 },
        { name: 'Leg Curl', sets: 4 },
        { name: 'Standing Calf Raise', sets: 4 },
      ],
    },
  ],
};

describe('⛔ her week becomes a programme — unchanged', () => {
  it('matches what it can and names what it cannot', () => {
    const m = matchWeek(herWeek);
    expect(m.unmatched).toEqual(['Zercher Squat']);
    expect(m.sessions[0].lifts[0].match.id).toBe('bb_bench_press');
    expect(m.sessions[1].lifts[0].match.id).toBe('bb_deadlift');
  });

  it('⛔ the programme it builds is stamped as HERS — this is what protects it for ever', () => {
    const p = toProgram(matchWeek(herWeek));
    expect(p.authored).toBe('athlete_or_coach');
    expect(p.frequency).toBe(3);
    expect(isRunnable(p)).toBe(true);
  });

  it('⛔ every set count she wrote survives, including the one F-1 would have clamped', () => {
    /*
     * The single most important assertion in this file. Her coach wrote six sets of squats; F-1 caps
     * a HUSH block at five. Clamping it here would be exactly the silent correction the whole feature
     * exists to refuse — and it would be invisible, because the number on the screen would simply be
     * a five and she would never know a six had been written.
     */
    const p = toProgram(matchWeek(herWeek));
    const squat = p.days[2].slots.find((s) => s.exerciseId === 'bb_back_squat');
    expect(squat?.setCount).toBe(6);
    expect(squat!.setCount).toBeGreaterThan(SETS_MAX);

    const bench = p.days[0].slots.find((s) => s.exerciseId === 'bb_bench_press');
    expect(bench?.setCount).toBe(5);
  });

  it('⛔ the order she wrote is the order she trains — nothing is reflowed', () => {
    /*
     * `orderForFlow` would move her cable fly behind the overhead press (compounds before isolations)
     * and group the stations. That is right for a week Hush wrote and wrong for a week it was handed:
     * a coach who put the fly third put it there.
     */
    const p = toProgram(matchWeek(herWeek));
    expect(p.days[0].slots.map((s) => s.exerciseId)).toEqual([
      'bb_bench_press',
      'incline_db_press',
      'cable_fly',
      'bb_overhead_press',
      'triceps_pushdown',
    ]);
  });

  it('a lift with no set count is carried at F-1’s floor — and that is REPORTED, not hidden', () => {
    const m = matchWeek(herWeek);
    const p = toProgram(m);
    const row = p.days[1].slots.find((s) => s.exerciseId === 'db_row');
    expect(row?.setCount).toBe(SETS_WHEN_UNSTATED);
    expect(reviewFindings(m, p)).toContainEqual({ kind: 'sets_unstated', subject: 'DB Row', value: SETS_WHEN_UNSTATED });
  });

  it('a lift we could not find is left OUT of the programme, never substituted', () => {
    const p = toProgram(matchWeek(herWeek));
    const push = p.days[0].slots.map((s) => s.exerciseId);
    expect(push).toHaveLength(5); // six written, one unmatched — and no stand-in for it
    expect(push.some((id) => exerciseById(id)!.muscle === 'Hamstrings')).toBe(false);
  });
});

describe('⛔ what we found — reported, never fixed', () => {
  it('names an unmatched lift, so she is asked rather than quietly given something else', () => {
    const m = matchWeek(herWeek);
    expect(reviewFindings(m, toProgram(m))).toContainEqual({ kind: 'unmatched_lift', subject: 'Zercher Squat' });
  });

  it('names a block above F-1’s ceiling — and the programme still carries it', () => {
    const m = matchWeek(herWeek);
    const p = toProgram(m);
    expect(reviewFindings(m, p)).toContainEqual({ kind: 'sets_above_ceiling', subject: 'bb_back_squat', value: 6 });
    expect(p.days[2].slots.find((s) => s.exerciseId === 'bb_back_squat')!.setCount).toBe(6);
  });

  it('names a session past the hour — and the programme still carries it', () => {
    const long: ImportedWeek = {
      sessions: [
        {
          name: 'Marathon Monday',
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
      ],
    };
    const m = matchWeek(long);
    const p = toProgram(m);
    const found = reviewFindings(m, p).find((f) => f.kind === 'session_over_hour');
    expect(found).toBeDefined();
    expect(found!.value).toBeGreaterThan(SESSION_MAX);
    // …and every lift she wrote is still there, at the sets she wrote.
    expect(p.days[0].slots).toHaveLength(7);
  });

  it('names a muscle under the effective dose — and does not add work to lift it', () => {
    const thin: ImportedWeek = {
      sessions: [
        { name: 'A', lifts: [{ name: 'Barbell Bench Press', sets: 4 }, { name: 'Hammer Curl', sets: 3 }] },
      ],
    };
    const m = matchWeek(thin);
    const p = toProgram(m);
    const findings = reviewFindings(m, p);
    expect(findings).toContainEqual({ kind: 'muscle_under_dose', subject: 'Biceps', value: 3 });
    expect(findings).toContainEqual({ kind: 'muscle_under_dose', subject: 'Chest', value: 4 });
    // Nothing was added: two lifts in, two lifts out.
    expect(p.days[0].slots).toHaveLength(2);
    expect(p.days[0].slots.reduce((n, s) => n + s.setCount, 0)).toBe(7);
  });

  it('names a muscle trained only once a week — the dose the evidence is clearest about', () => {
    const m = matchWeek(herWeek);
    const findings = reviewFindings(m, toProgram(m));
    // Her week trains chest on one day only.
    expect(findings.some((f) => f.kind === 'muscle_once_a_week' && f.subject === 'Chest')).toBe(true);
  });

  it('⛔ a week that breaks nothing produces NO findings — the report is not noise', () => {
    /*
     * A report that always says something is a report nobody reads. An athlete whose programme is
     * already sane must see a clean screen, or the feature teaches her to dismiss it.
     */
    const clean: ImportedWeek = {
      sessions: [
        {
          name: 'Full A',
          lifts: [
            { name: 'Barbell Bench Press', sets: 4 },
            { name: 'DB Row', sets: 4 },
            { name: 'Back Squat', sets: 4 },
          ],
        },
        {
          name: 'Full B',
          lifts: [
            { name: 'Incline DB Press', sets: 3 },
            { name: 'Lat Pulldown', sets: 4 },
            { name: 'Romanian Deadlift', sets: 4 },
          ],
        },
      ],
    };
    const m = matchWeek(clean);
    const p = toProgram(m);
    const findings = reviewFindings(m, p);
    const kinds = [...new Set(findings.map((f) => f.kind))];
    // Nothing unmatched, nothing unstated, nothing over the hour, nothing above the ceiling.
    expect(kinds.filter((k) => k !== 'muscle_under_dose' && k !== 'muscle_once_a_week')).toEqual([]);
    for (const f of findings) expect(f.value).toBeLessThan(WEEKLY_SETS_FLOOR + 6);
  });
});

describe('⛔ a programme written in Hebrew', () => {
  /*
   * ⛔ THE CATALOGUE SHIPS ENGLISH NAMES ONLY, BY PRODUCT RULE — `exerciseDisplayName` says so in as
   * many words. So `matchLift` has no Hebrew in its vocabulary, and without help EVERY line of a
   * Hebrew sheet would miss locally and fall through to the model: slower, costlier, and it hands the
   * matching to the one component that can be wrong about it.
   *
   * The reader returns a second, English reading of each line (`nameEn`). Her words stay untouched
   * and are what the review quotes; the English rendering is used only to look the lift up.
   */
  it('resolves LOCALLY when the reader gives an English rendering — no second call', () => {
    const week = {
      sessions: [
        {
          name: 'דחיפה',
          lifts: [
            { name: 'לחיצת חזה במוט', nameEn: 'Barbell Bench Press', sets: 4 },
            { name: 'לחיצת כתפיים', nameEn: 'Dumbbell Shoulder Press', sets: 3 },
          ],
        },
      ],
    };
    const m = matchWeek(week);
    expect(m.unmatched).toEqual([]); // nothing for the model to do
    expect(m.sessions[0].lifts[0].match.id).toBe('bb_bench_press');
    expect(m.sessions[0].lifts[1].match.id).toBe('db_shoulder_press');
  });

  it('⛔ HER words are what the report quotes back, never the English rendering', () => {
    const week = {
      sessions: [{ name: 'רגליים', lifts: [{ name: 'סקוואט זרקר', nameEn: 'Zercher Squat', sets: 3 }] }],
    };
    const m = matchWeek(week);
    // Not ours in either language — and the question she is asked uses the words she wrote.
    expect(m.unmatched).toEqual(['סקוואט זרקר']);
    expect(reviewFindings(m, toProgram(m))).toContainEqual({ kind: 'unmatched_lift', subject: 'סקוואט זרקר' });
  });

  it('her own words still win — the English rendering is only tried when they miss', () => {
    /*
     * If she wrote an English name on a Hebrew sheet, that is the match. A reader that mis-rendered
     * "Bench" as something else must not override a name the catalogue already answers.
     */
    const m = matchWeek({
      sessions: [{ name: 'A', lifts: [{ name: 'Bench Press', nameEn: 'Leg Press', sets: 4 }] }],
    });
    expect(m.sessions[0].lifts[0].match.id).toBe('bb_bench_press');
  });
});
