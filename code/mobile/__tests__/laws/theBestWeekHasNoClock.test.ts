// @ts-nocheck
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * THE BEST WEEK HAS NO CLOCK (founder, 2026-10-11)
 *
 *   > *"אני לא מחפש אימונים מלאים יותר — אני מחפש את האימונים הטובים ביותר שיתנו למתאמן את תוכנית
 *   > האימון הטובה ביותר המותאמת אליו, כך שכל מאמן כולל הכי טובים בעולם יתרשמו מהתוכנית הזאת.
 *   > שיבנה את התוכנית הטובה ביותר עבור מתאמן מבלי להתייחס למגבלת הזמן, העיקר שהוא יקבל את מה
 *   > שהוא צריך."*
 *
 * Three places could put a clock on her week, and each is closed here:
 *
 *   1. THE COACH THAT WRITES IT — briefed with the standard and told the session's length is not a
 *      thing it may trade against (`buildPrompt.instructions`; what that bought is measured in the
 *      note there, on the live Worker, on the model her intake gets).
 *   2. THE COACH THAT REVIEWS IT — told the same FACT (not the standard: a review is steered
 *      towards no verdict), so the second voice she hears cannot defend a thin lift with an hour
 *      nobody set (it did, on 2026-10-10).
 *   3. THE APP'S OWN READING — "my reading" told an athlete that four of the five days his coach
 *      had just written were "under the 45-minute floor". The minutes are still printed on the day
 *      as a fact; they are no longer an opinion about it.
 *
 * ⚠️ AND NOTHING BETWEEN THE MODEL AND THE SCREEN TRIMS FOR TIME: the reader keeps a long day whole.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'node:fs';
import path from 'node:path';

import { BUILD_MAX_LIFTS, BUILD_PROMPT_VERSION, buildWeekRequest } from '@/domain/buildPrompt';
import { REVIEW_PROMPT_VERSION } from '@/domain/reviewPrompt';
import { readCoachWeek } from '@/domain/coachDraft';
import { BUILDER_SETS_MAX } from '@/domain/planBuilder';
import { EXERCISES, isSwapOnly } from '@/data/exercises';

const MOBILE = path.join(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(MOBILE, rel), 'utf8');
const code = (src: string): string => src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

const STANDARD = 'the best training week this athlete could be given — one the world’s best coaches would respect';
const NO_CLOCK = 'Session length is no constraint';

describe('1 · the coach that writes her week', () => {
  const req = buildWeekRequest({ daysPerWeek: 5, sex: 'male', weightKg: 82, experience: 'advanced', ask: 'PPL', locale: 'he' });
  const [stable, her] = req.blocks.map((b) => b.text);
  const brief = stable.slice(0, stable.indexOf('CATALOGUE'));

  it('⛔ is told what the week is measured against, before anything else', () => {
    expect(brief.startsWith(`Write ${STANDARD}.`)).toBe(true);
    expect(BUILD_PROMPT_VERSION).toBeGreaterThanOrEqual(8);
    expect(req.v).toBe(BUILD_PROMPT_VERSION);
  });

  it('⛔ and that a session’s length is not a constraint — need decides, nothing else', () => {
    expect(brief).toContain(`${NO_CLOCK}: choose every exercise and every set count only by what this athlete needs.`);
  });

  it('⛔ it is handed no time of any kind — not in our lines, not among her facts', () => {
    for (const word of ['minute', 'hour', 'min)', 'duration', 'time budget', 'quick']) {
      expect({ word, inBrief: brief.toLowerCase().includes(word) }).toEqual({ word, inBrief: false });
      expect({ word, inFacts: her.toLowerCase().includes(word) }).toEqual({ word, inFacts: false });
    }
  });

  it('the week’s title is written in her language even when she asked for nothing', () => {
    const silent = buildWeekRequest({ daysPerWeek: 4, sex: 'male', locale: 'he' }).blocks[0].text;
    expect(silent).toContain('Write the week’s title and each day’s name in Hebrew.');
    expect(buildWeekRequest({ daysPerWeek: 4, sex: 'male', locale: 'en' }).blocks[0].text).toContain('in English.');
  });
});

describe('2 · the coach that reviews it', () => {
  const review = read('src/domain/reviewPrompt.ts');

  it('⛔ is told the same fact: a session’s length is not a constraint', () => {
    expect(code(review)).toContain("'Session length is no constraint in this app: every exercise and every set count is judged only by what she needs.',");
    expect(REVIEW_PROMPT_VERSION).toBeGreaterThanOrEqual(2);
  });

  it('⚠️ and is NOT handed the standard as a verdict — a review is told the truth and decides itself', () => {
    // `theReviewIsToldTheTruthAndDecidesItself` refuses steering words in this block; the fact above carries none.
    const lines = code(review).slice(code(review).indexOf('function instructions()'), code(review).indexOf('export function numberedDays'));
    for (const steer of ['best week', 'would respect', 'should']) {
      expect({ steer, present: lines.includes(steer) }).toEqual({ steer, present: false });
    }
  });

  it('…and its sheet still carries no minutes she did not give (`theCoachIsToldOnlyWhatSheSaid`)', () => {
    expect(code(read('src/state/stores/appStore.tsx'))).not.toMatch(/workoutMinutes \?\? \d+/);
  });
});

describe('3 · the app’s own reading of her week', () => {
  const builder = read('src/screens/plan/PlanBuilder.tsx');
  const line = builder.slice(builder.indexOf('const adviceLine = (f: WeekFinding)'), builder.indexOf("case 'under_dose':"));

  it('⛔ says nothing about minutes to the athlete — too short or too long', () => {
    const body = code(line);
    expect(body).toMatch(/case 'session_length':\s+if \(!fa\) return null;/);
    // a human coach writing for a trainee keeps the arithmetic; that is the only reader left
    expect(body.indexOf('if (!fa) return null;')).toBeLessThan(body.indexOf("t('builder.advice.session_short'"));
  });
});

describe('…and nothing between the model and the screen trims a day for time', () => {
  it('⛔ a long day comes through whole: every lift the shape allows, every set the builder allows', () => {
    const ids = EXERCISES.filter((e) => !isSwapOnly(e.id)).slice(0, BUILD_MAX_LIFTS).map((e) => e.id);
    const week = readCoachWeek({ name: 'w', days: [{ name: 'a long day', lifts: ids.map((ex) => ({ ex, sets: 5 })) }] });
    expect(week.days[0].lifts.map((l) => l.ex)).toEqual(ids);
    expect(week.days[0].lifts.every((l) => l.sets === 5)).toBe(true);
    expect(BUILD_MAX_LIFTS).toBeGreaterThanOrEqual(12);
    expect(BUILDER_SETS_MAX).toBeGreaterThanOrEqual(8);
  });
});
