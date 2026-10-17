/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE COACH SAYS ONLY WHAT MATTERS (founder-approved, 2026-10-17)
 *
 * Founder, after training with the full spoken coach: *"מה שטוב: שהבינה אומרת שנותרו עוד 10 שניות
 * למנוחה ואז כשנגמרת המנוחה יש את הצליל שהמנוחה נגמרה. כל השאר אני חושב שאפשר לבטל. אולי אפשר
 * לעשות שבסיום האימון לתת פידבק חיובי מסוים וזהו."* — and, on the proposal (ten seconds that name a
 * NEW lift, a plank the same way, the record in the closing line): *"מאשר הכל."*
 *
 * The walks on a real store are `theVoiceSurvivesThePhone` (the phone's situations) and
 * `theSurfacesNeverDisagree` (every surface at every step, sixty random workouts). This file pins the
 * words and the facts under them.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import fs from 'fs';
import path from 'path';

import { initI18n, setLocale } from '@/i18n';
import { setGender } from '@/i18n/gender';
import { voiceRecap } from '@/domain/voiceRecap';
import { voiceScript } from '@/domain/voiceScript';
import { quietLinesAhead } from '@/domain/voiceLinesAhead';
import { exerciseDisplayName } from '@/data/exercises';
import { QuietCoach } from '@/platform/voice/quietCoach';

const MOBILE = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(MOBILE, rel), 'utf8');
const HE = { locale: 'he', units: 'kg' as const };

const T0 = Date.UTC(2026, 9, 17, 7, 0, 0);
const set = (ex: string, kg: number | null, reps: number, asked: number, i: number, extra: Record<string, unknown> = {}) => ({
  exerciseId: ex, setIndex: i, recommendedWeight: kg, recommendedReps: asked, actualWeight: kg, actualReps: reps,
  edited: false, persistedAt: new Date(T0 + (i + 1) * 3 * 60_000).toISOString(), restBeforeS: 90, ...extra,
});
const sess = (id: string, at: number, sets: unknown[]) => ({ id, programDayId: 'd', startedAt: new Date(at).toISOString(), state: 'SAVED', earlyFinish: false, sets });

beforeAll(async () => {
  await initI18n();
  await setLocale('he');
});
afterEach(() => setGender('male'));

describe('the facts under the closing sentence (`voiceRecap`)', () => {
  const history = [sess('h1', T0 - 7 * 86_400_000, [set('bb_bench_press', 60, 8, 8, 0), set('bb_bench_press', 60, 8, 8, 1), set('cable_row', 40, 10, 10, 0)])];

  it('a record is the stage\'s record: heavier than ever, or more reps than ever at her heaviest — once per lift', () => {
    const today = sess('s', T0, [
      set('bb_bench_press', 62.5, 6, 6, 0), // heavier than ever → a record
      set('bb_bench_press', 62.5, 6, 6, 1), // the same again → not a second one
      set('cable_row', 40, 11, 10, 0), // 11 at her heaviest 40, where she had done 10 → a rep record
      set('cable_row', 35, 14, 10, 1), // more reps at a LIGHTER weight → not a record
    ]);
    expect(voiceRecap(today, history, { bb_bench_press: 2, cable_row: 2 }).records).toEqual(['bb_bench_press', 'cable_row']);
  });

  it('on target is EVERY prescribed working set at or above its reps — a lift she cut short, or missed once, is not', () => {
    const today = sess('s', T0, [
      set('bb_bench_press', 60, 9, 9, 0), set('bb_bench_press', 60, 9, 9, 1), set('bb_bench_press', 60, 9, 9, 2),
      set('cable_row', 40, 10, 10, 0), set('cable_row', 40, 9, 10, 1), // one short
      set('lat_pulldown', 35, 10, 10, 0), // one of three
    ]);
    expect(voiceRecap(today, history, { bb_bench_press: 3, cable_row: 2, lat_pulldown: 3 }).onTarget).toEqual(['bb_bench_press']);
  });

  it('a warm-up bridge is neither a record nor a set, and the minutes run to her last set', () => {
    const today = sess('s', T0, [set('bb_bench_press', 80, 3, 3, -1, { isWarmup: true }), set('bb_bench_press', 60, 8, 8, 0)]);
    const r = voiceRecap(today, history, { bb_bench_press: 1 });
    expect(r.records).toEqual([]);
    expect(r.sets).toBe(1);
    expect(r.minutes).toBe(3);
  });
});

describe('the closing sentence — at most two facts, after "כל הכבוד"; a day with none is still said, kindly', () => {
  const bench = 'bb_bench_press';
  const base = { records: [] as string[], onTarget: [] as string[], sets: 18, minutes: 40 };

  it('a record and every set on target', () => {
    const line = voiceScript.recap({ ...base, records: [bench], onTarget: ['a', 'b', 'c', 'd'] }, false, HE);
    expect(line).toBe(`כל הכבוד. שיא חדש ב${exerciseDisplayName(bench)}, ועמדת ביעד בכל הסטים בארבעה תרגילים.`);
  });

  it('two records, and the week done — the third fact waits for another day', () => {
    expect(voiceScript.recap({ ...base, records: ['a', 'b'], onTarget: ['a'] }, true, HE)).toBe(`כל הכבוד. שני שיאים חדשים, ועמדת ביעד בכל הסטים ב${exerciseDisplayName('a') === 'a' ? 'a' : exerciseDisplayName('a')}.`);
    expect(voiceScript.recap({ ...base }, true, HE)).toBe('כל הכבוד. השבוע הושלם.');
  });

  it('none of the three: how much she did, and that it counts', () => {
    expect(voiceScript.recap({ ...base }, false, HE)).toBe('סיימת. שמונה עשר סטים בארבעים דקות. כל אימון נספר.');
  });

  it('she is spoken to as she is', () => {
    setGender('female');
    expect(voiceScript.recap({ ...base, onTarget: ['a', 'b'] }, false, HE)).toBe('כל הכבוד. עָמַדְתְּ ביעד בכל הסטים בשני תרגילים.');
    expect(voiceScript.recap({ ...base }, false, HE)).toMatch(/^סִיַּמְתְּ\./);
  });

  it('the workout is never graded — the facts are the praise (§4.10)', () => {
    const he = JSON.parse(read('src/i18n/locales/he.json')).voice;
    const en = JSON.parse(read('src/i18n/locales/en.json')).voice;
    for (const k of Object.keys(en).filter((k) => k.startsWith('recap'))) expect(`${k}: ${en[k]}`).not.toMatch(/strong|great|amazing|crushed/i);
    expect(he.recapStrong).toBeUndefined();
  });
});

describe('ten seconds — and the lift she walks to, only when it is a new one', () => {
  const view = (over: Record<string, unknown>) => ({
    active: true, paused: false, displayPhase: 'REST_TRANSITION', restSeconds: 120, restExtraSeconds: 0,
    restEndsAtMs: 1_000_000 + 120_000, nextExerciseId: 'cable_row', globalProgress: { index: 2 },
    livePlan: [{ exerciseId: 'bb_bench_press' }, { exerciseId: 'bb_bench_press' }, { exerciseId: 'bb_bench_press' }, { exerciseId: 'cable_row' }],
    setAwaitingReady() {}, ...over,
  });
  const said = (v: Record<string, unknown>) => {
    const lines: string[] = [];
    let fire: (() => void) | null = null;
    const c = new QuietCoach({
      mouth: { say: async (l: string) => void lines.push(l), interrupt() {} },
      audio: { duck: async () => {}, unduck: async () => {}, playChime: async () => {} },
      now: () => 1_000_000 + 100_000, // twenty seconds before the rest's end
      setTimeout: (f: () => void) => ((fire ??= f), 1),
      clearTimeout: () => {},
      getView: () => v as never,
      locale: () => HE,
    });
    return { c, lines, fire: () => fire?.() };
  };

  it('a crossing to a new lift names it', async () => {
    const v = view({});
    const { c, lines, fire } = said(v);
    c.enable();
    fire();
    await (c as any).chain;
    expect(lines).toEqual([`עוד עשר שניות. הבא: ${exerciseDisplayName('cable_row')}.`]);
  });

  it('between the rounds of a superset the row comes back — nothing is named, she is not walking anywhere', async () => {
    const v = view({ livePlan: [{ exerciseId: 'bb_bench_press' }, { exerciseId: 'cable_row' }, { exerciseId: 'bb_bench_press' }, { exerciseId: 'cable_row' }], globalProgress: { index: 1 }, nextExerciseId: 'bb_bench_press' });
    const { c, lines, fire } = said(v);
    c.enable();
    fire();
    await (c as any).chain;
    expect(lines).toEqual(['עוד עשר שניות.']);
  });

  it('the natural voice is handed exactly those lines ahead', () => {
    const plan = [{ exerciseId: 'bb_bench_press' }, { exerciseId: 'bb_bench_press' }, { exerciseId: 'cable_row' }, { exerciseId: 'plank' }];
    expect(quietLinesAhead(plan as never, 0)).toEqual([voiceScript.tenSecondsNext('cable_row'), voiceScript.tenSecondsNext('plank')]);
  });
});

describe('what is mounted', () => {
  it('the stage mounts the quiet coach, and the full spoken coach is not imported by it', () => {
    const hook = read('src/platform/voice/useVoiceCoach.ts');
    expect(hook).toContain('conductorRef.current = new QuietCoach({');
    expect(hook).not.toMatch(/from '@\/platform\/voice\/voiceConductor'/);
    expect(hook).toContain('finished: readFinishedWorkout');
  });
  it('a plank that has not started offers Ready on the card and the wrist, voice or none (`sessionMirror`)', () => {
    expect(read('src/platform/sessionMirror.ts')).toContain("awaitingReady: phase === 'active_set' && (!!inp.awaitingReady || (cur.hold?.seconds != null && inp.holdEndsAtMs == null)),");
  });
});
