/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE COACH KNOWS HOW THE WEEK IS USED — AND EVERY LINE IT IS TOLD IS TRUE (2026-10-17)
 *
 * Founder: *"משום מה הבינה עושה 2 סטים לתרגילים מסוימים וזה קצת מוזר לי כי ממתי עושים 2 סטים. אמרתי לך
 * על זה כמה פעמים חשוב שנבדוק עם הבינה האם היא בטוחה שהתוכניות שהיא בונה הן הטובות ביותר ולא חסר לה
 * שום מידע שהיא צריכה."*
 *
 * The model was asked, on the live Worker, about weeks it had just written
 * (`__tests__/live/askTheCoachAboutItsWeek`). It wrote most of its 2-set lifts as "a starting dose to
 * adjust later" and named, on every athlete, what it had not been told: whether the week repeats,
 * whether set counts change, how the weights move. In this app nothing ever adjusts a set count.
 *
 * So the prompt now says how the app uses the week (`buildPrompt.appFacts`), and asks for at least
 * three sets. A fact told to the coach is a promise about the engine. This law holds each line of the
 * facts to the code that makes it true, so a change to the engine fails here before it can turn the
 * prompt into a lie.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';

import { appFacts, buildWeekRequest } from '@/domain/buildPrompt';
import { nextRepTarget } from '@/engine/v5/loop2';
import { atTheFloor } from '@/domain/statedLifts';
import { RAISE_HEADROOM_REPS } from '@/engine/v5/constants';
import { DELOAD_DAYS, DELOAD_FRACTION } from '@/engine/v5/deload';
import { DEFAULT_REP_BAND } from '@/engine/v5/repBand';
import { MODEL_SETS_MIN, draftFromCoachWeek } from '@/domain/coachDraft';
import { BUILDER_SETS_MIN, sealAuthored } from '@/domain/planBuilder';
import { coachPlanFromProgram } from '@/domain/enginePlan';
import { liftsFromHistory, LIFTS_FROM_LOG_MAX, LIFTS_FROM_LOG_WEEKS } from '@/domain/statedLifts';
import type { Session } from '@/data/local/models';

const MOBILE = path.join(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(MOBILE, rel), 'utf8').replace(/\r\n/g, '\n');

// `appStore` is a React module; its rebuild gate is read as the one line it is.
const appStore = read('src/state/stores/appStore.tsx');

describe('1 · the coach is told how the week is used, before the catalogue', () => {
  const req = buildWeekRequest({ daysPerWeek: 4, sex: 'female', weightKg: 64, experience: 'intermediate', locale: 'he' });
  const stable = req.blocks[0]!.text;

  it('the facts sit between our lines and the catalogue, in the cached half', () => {
    const facts = stable.indexOf('HOW THE APP USES THIS WEEK (facts about the app)');
    expect(facts).toBeGreaterThan(stable.indexOf('Write the best training week'));
    expect(stable.indexOf('CATALOGUE' + String.fromCharCode(10) + 'bb_')).toBeGreaterThan(facts);
    expect(stable).toContain(appFacts());
    // The athlete half carries none of it — it is the same for everybody, and cached.
    expect(req.blocks[1]!.text).not.toContain('HOW THE APP USES THIS WEEK');
  });

  it('⛔ at least three sets, fewer exercises before fewer sets — and the floor under the answer', () => {
    expect(stable).toContain('· Every exercise gets at least 3 working sets.');
    expect(stable).toContain('give it fewer exercises — never fewer sets per exercise, and never more work than the athlete needs.');
    expect(JSON.stringify(req.schema)).toContain('Working sets only, at least 3.');
    expect(MODEL_SETS_MIN).toBe(3);
    // A slip of the model never reaches her as a 2; her OWN edit still may go to one.
    const drafted = draftFromCoachWeek({ days: [{ name: 'A', lifts: [{ ex: 'bb_bench_press', sets: 2 }, { ex: 'lat_pulldown', sets: 1 }] }] })!;
    expect(drafted.days[0]!.slots.map((s) => s.setCount)).toEqual([3, 3]);
    expect(BUILDER_SETS_MIN).toBe(1);
  });

  it('her words are a priority, not a fence', () => {
    expect(stable).toContain('What the athlete asked for names what matters most to them; it is not a list of the only things they train.');
  });
});

describe('2 · every fact is true of the code', () => {
  const facts = appFacts();
  const written = draftFromCoachWeek({
    days: [
      { name: 'Upper', lifts: [{ ex: 'bb_bench_press', sets: 4 }, { ex: 'lat_pulldown', sets: 3 }] },
      { name: 'Lower', lifts: [{ ex: 'bb_back_squat', sets: 3 }] },
    ],
  })!;
  const sealed = sealAuthored(written)!;

  it('"It repeats unchanged … until the athlete asks for a new one" — a sealed week is never rebuilt by the engine', () => {
    expect(facts).toContain('It repeats unchanged, week after week, until the athlete asks for a new one.');
    expect(sealed.authored).toBe('athlete_or_coach');
    expect(appStore).toContain("return (program?.authored ?? 'engine') === 'engine';");
    // …and the model is only ever asked on her tap.
    expect(read('src/platform/coach/planBuild.ts')).toContain('fired by HER TAP');
  });

  it('"The set count you write is permanent" — every workout she starts runs the written count', () => {
    expect(facts).toContain('The set count you write is permanent: nothing in the app adds or removes sets later.');
    const plan = coachPlanFromProgram(sealed)!;
    expect(plan.sessions[0]!.blocks.map((b) => b.rounds)).toEqual([4, 3]);
    expect(plan.sessions[1]!.blocks.map((b) => b.rounds)).toEqual([3]);
  });

  it('"two reps above the bottom… or the top, when the next step is big" is the engine\'s own raise rule (F-21, F-24)', () => {
    expect(facts).toContain(`when every working set reaches ${RAISE_HEADROOM_REPS} reps above the bottom (${8 + RAISE_HEADROOM_REPS} in an 8–12 range) — or the top of the range, when the next weight step is a big one — the next session adds one step and the target starts over.`);
    expect(DEFAULT_REP_BAND).toBe('8-12');
    const loop2 = read('src/engine/v5/loop2.ts');
    expect(loop2).toContain('RAISE_HEADROOM_REPS');
    expect(loop2).toContain('BIG_STEP_FRACTION');
  });

  it('"a rep target that starts at the bottom … and climbs one rep each session they meet it" is `nextRepTarget`', () => {
    expect(facts).toContain('a rep target that starts at the bottom of the range and climbs one rep each session they meet it on every set');
    const band = { lo: 8, hi: 12 };
    const met = (n: number) => [{ load: 40, reps: n }, { load: 40, reps: n }, { load: 40, reps: n }];
    expect(nextRepTarget(undefined, met(8), band, 10)).toBe(9);
    expect(nextRepTarget(9, met(9), band, 10)).toBe(10);
    expect(nextRepTarget(10, met(10), band, 10)).toBe(10); // the raise point — Loop 2 raises from here
    expect(nextRepTarget(10, met(9), band, 10)).toBe(10); // short of the target, over the floor: again
    expect(nextRepTarget(10, met(7), band, 10)).toBe(8); // under the floor: back to the floor
  });

  it('one range per exercise — the app keeps one progression per exercise', () => {
    const stable = buildWeekRequest({ daysPerWeek: 4, sex: 'male', locale: 'he' }).blocks[0]!.text;
    expect(stable).toContain('· An exercise you use on more than one day gets the same rep range each time — the app keeps one progression per exercise.');
  });

  it('the coach is not promised a first-set correction that no longer exists', () => {
    const schema = JSON.stringify(buildWeekRequest({ daysPerWeek: 4, sex: 'male' }).schema);
    expect(schema).not.toContain('corrects it on the first set');
    expect(schema).toContain('The app does not change a weight during the workout');
  });

  it('"lightens every load for a week" is the deload as it is built — loads only, seven days', () => {
    expect(facts).toContain('the app lightens every load for a week');
    expect(DELOAD_DAYS).toBe(7);
    expect(DELOAD_FRACTION).toBeLessThan(1);
  });

  it('"One set of a one-sided exercise covers both sides" — logged once, its time charged twice', () => {
    expect(facts).toContain('One set of a one-sided exercise (lunge, split squat, single-arm row) covers both sides.');
    expect(read('src/domain/restPrescription.ts')).toContain('unilateral ? 2 : 1');
    expect(facts).toContain('A dumbbell load is the weight of one dumbbell.');
  });

  it('it is handed no clock and no instruction to do MORE — the facts are about the app, not a push', () => {
    for (const word of ['minute', 'hour', 'Never trim', 'more sets', 'more exercises']) {
      expect({ word, present: facts.includes(word) }).toEqual({ word, present: false });
    }
  });
});

describe('3 · a rebuilt week is written from her own sets, and in her room', () => {
  const now = Date.UTC(2026, 9, 17);
  const day = 86_400_000;
  const set = (exerciseId: string, actualWeight: number | null, actualReps: number, extra: Record<string, unknown> = {}) =>
    ({ exerciseId, setIndex: 0, actualWeight, actualReps, ...extra }) as unknown as Session['sets'][number];
  const session = (daysAgo: number, sets: Session['sets'], extra: Partial<Session> = {}): Session =>
    ({ id: `s${daysAgo}`, programDayId: 'd', startedAt: new Date(now - daysAgo * day).toISOString(), state: 'SAVED', earlyFinish: false, sets, ...extra }) as Session;

  it('her best set of each lift, the most-trained first — never a presumed set, a warm-up, a bodyweight lift or an old one', () => {
    const history = [
      session(2, [set('bb_bench_press', 100, 6), set('bb_bench_press', 105, 3), set('lat_pulldown', 70, 10)]),
      session(5, [set('bb_bench_press', 95, 8), set('bb_back_squat', 140, 5, { presumed: true })]),
      session(9, [set('bb_back_squat', 130, 5), set('bb_bench_press', 120, 1, { isApproach: true }), set('pull_up', null, 8)]),
      session(LIFTS_FROM_LOG_WEEKS * 7 + 3, [set('bb_deadlift', 200, 5)]), // older than the window
      session(1, [set('bb_overhead_press', 60, 8)], { freeform: true }), // a free log is folded by nothing
    ];
    const lifts = liftsFromHistory(history, now);
    // Bench: trained in two sessions (the warm-up on the third is not evidence). Its best set is the
    // strongest by Epley — 95×8 (≈120.3) over 100×6 (120) and 105×3 (115.5) — not simply the heaviest.
    expect(lifts[0]).toEqual({ exerciseId: 'bb_bench_press', kg: 95, reps: 8 });
    expect(lifts.map((l) => l.exerciseId)).toEqual(['bb_bench_press', 'bb_back_squat', 'lat_pulldown']);
    expect(lifts.find((l) => l.exerciseId === 'bb_back_squat')).toEqual({ exerciseId: 'bb_back_squat', kg: 130, reps: 5 });
    expect(lifts.length).toBeLessThanOrEqual(LIFTS_FROM_LOG_MAX);
  });

  it('the line says where the numbers came from, and the room is said when she named one', () => {
    const fromLog = buildWeekRequest({ daysPerWeek: 4, sex: 'male', lifts: [{ exerciseId: 'bb_bench_press', kg: 100, reps: 6 }], liftsFrom: 'logs', equipment: ['dumbbell', 'barbell'] }).blocks[1]!.text;
    expect(fromLog).toContain(`- what they lift now, from their own logged sets (their best set of each lift in the last ${LIFTS_FROM_LOG_WEEKS} weeks): bb_bench_press 100 kg x 6`);
    expect(fromLog).toContain('- equipment where they train: dumbbells, barbell and plates, and their own bodyweight (use only exercises these allow)');
    // Plain words, bodyweight once, and a room of nothing but bodyweight says nothing it would not already assume.
    const odd = buildWeekRequest({ daysPerWeek: 3, sex: 'female', equipment: ['fixed_barbell', 'bodyweight', 'band'] }).blocks[1]!.text;
    expect(odd).toContain('- equipment where they train: fixed-weight barbells, resistance bands, and their own bodyweight');
    expect(odd).not.toContain('fixed_barbell');
    expect(buildWeekRequest({ daysPerWeek: 3, sex: 'female', equipment: ['bodyweight'] }).blocks[1]!.text).not.toContain('equipment where they train');
    // The intake's line is the one that was measured live, word for word.
    const stated = buildWeekRequest({ daysPerWeek: 4, sex: 'male', lifts: [{ exerciseId: 'bb_bench_press', kg: 100, reps: 6 }] }).blocks[1]!.text;
    expect(stated).toContain('- weights they lift today: bb_bench_press 100 kg x 6');
    expect(stated).not.toContain('equipment where they train');
  });

  it('her stated set is priced at the floor she will train — "100 × 3" never opens an 8-rep bench at 100', () => {
    expect(atTheFloor({ exerciseId: 'bb_bench_press', kg: 100, reps: 3 }, 8)).toBeLessThan(90);
    expect(atTheFloor({ exerciseId: 'bb_bench_press', kg: 100, reps: 10 }, 8)).toBe(100); // more reps than the floor: it stands
    expect(atTheFloor({ exerciseId: 'bb_bench_press', kg: 100 }, 8)).toBe(100); // no reps given: her number
  });

  it('the Program tab\'s rebuild sends them — her log and her room', () => {
    const builder = read('src/screens/plan/PlanBuilder.tsx');
    expect(builder).toContain('const lifted = liftsFromHistory(history, Date.now());');
    expect(builder).toContain("...(lifted.length > 0 ? { lifts: lifted, liftsFrom: 'logs' as const } : {}),");
    expect(builder).toContain('...(room && room.length > 0 ? { equipment: room } : {}),');
  });
});
