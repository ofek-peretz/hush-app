// @ts-nocheck
/**
 * LIVE PROBE (hand-run only, excluded from the standing suite like its sibling):
 *   set -a; . ./.env; set +a; npx jest planBuildFootballLive --testPathIgnorePatterns=/node_modules/
 *
 * Founder, 2026-09-07: *"כתבתי לו שאני רוצה שהוא יבנה עבורי תוכנית שמתאימה לשחקן כדורגל … אבל כרגע
 * זה לא ניראה שהוא אכן בנה תוכנית כזאת. אלא יותר היפרטרופיה רגילה."* This asks the live Worker the
 * founder's exact sentence and prints what came back — the days, the lifts, and above all the
 * `missing` list, which is the model saying what it wanted and could not find in the catalogue.
 */
import fs from 'fs';
import path from 'path';

const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const { requestPlanBuild } = require('@/platform/coach/planBuild');
const { exerciseById } = require('@/data/exercises');
const { initI18n, setLocale } = require('@/i18n');

jest.setTimeout(120_000);

describe('the live week for a football player', () => {
  it('prints what the model wrote, and what it said was missing', async () => {
    await initI18n();
    await setLocale('he');
    const res = await requestPlanBuild({
      daysPerWeek: 4,
      sex: 'male',
      weightKg: 78,
      ask: 'אני שחקן כדורגל. תבנה לי תוכנית שתמקסם את היכולות שלי במגרש — מהירות, קפיצה, כוח מתפרץ וסיבולת.',
    });
    // eslint-disable-next-line no-console
    console.log('LIVE FOOTBALL RESULT:', JSON.stringify(res, null, 2).slice(0, 6000));
    expect(res.ok).toBe(true);
    if (res.ok) {
      for (const d of res.week.days) {
        // eslint-disable-next-line no-console
        console.log(d.name, '→', d.lifts.map((l) => `${exerciseById(l.ex)?.name ?? l.ex} ${l.sets}×${l.reps ? l.reps.join('–') : 'band'}`).join(', '));
      }
      // eslint-disable-next-line no-console
      console.log('MISSING:', res.week.missing);
    }
  });
});
