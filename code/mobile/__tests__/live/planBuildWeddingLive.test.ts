// @ts-nocheck
/**
 * LIVE PROBE (hand-run only, excluded from the standing suite like its siblings):
 *   npx jest planBuildWeddingLive --testPathIgnorePatterns=/node_modules/
 *
 * Founder, 2026-09-17: asked for the best programme to maximise muscle before his wedding
 * (4.11.26, under two months) and got a one-muscle-a-week split at ~10 sets. This asks the live
 * Worker his sentence N times through the app's own `requestPlanBuild` and scores each week the
 * way a hypertrophy coach would: weekly hard sets and weekly frequency per muscle.
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

const RUNS = Number(process.env.WED_RUNS || 4);
const DAYS = Number(process.env.WED_DAYS || 5);
const ASK = process.env.WED_ASK || 'אני רוצה שתבנה לי את תוכנית האימון הטובה ביותר שתמקסם את מסת השריר שלי כי יש לי חתונה ב-4.11.26';

jest.setTimeout(RUNS * 60_000);

export function scoreWeek(week) {
  const sets = {};
  const freq = {};
  let lifts = 0;
  for (const d of week.days) {
    const hit = new Set();
    for (const l of d.lifts) {
      const m = exerciseById(l.ex)?.muscle ?? '?';
      sets[m] = (sets[m] ?? 0) + (l.sets ?? 0);
      hit.add(m);
      lifts += 1;
    }
    for (const m of hit) freq[m] = (freq[m] ?? 0) + 1;
  }
  const big = ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Glutes', 'Biceps', 'Triceps'];
  const once = big.filter((m) => (freq[m] ?? 0) < 2);
  return { sets, freq, lifts, once };
}

describe('the live week for the wedding ask', () => {
  it('prints what came back, scored', async () => {
    await initI18n();
    await setLocale('he');
    const rows = [];
    for (let i = 0; i < RUNS; i++) {
      const t0 = Date.now();
      const res = await requestPlanBuild({ daysPerWeek: DAYS, sex: 'male', weightKg: 75, ask: ASK });
      const ms = Date.now() - t0;
      if (!res.ok) {
        rows.push(`run ${i + 1}: ${ms}ms FAILED ${res.reason}`);
        continue;
      }
      const s = scoreWeek(res.week);
      rows.push(
        `run ${i + 1}: ${ms}ms NAME=${JSON.stringify(res.week.name)} lifts=${s.lifts} MISSING=${JSON.stringify(res.week.missing ?? [])}\n` +
          `   weekly sets: ${JSON.stringify(s.sets)}\n   days hit:    ${JSON.stringify(s.freq)}\n   once-a-week big muscles: ${s.once.join(', ') || 'none'}\n` +
          res.week.days.map((d) => `   [legs ${d.lifts.filter((l) => ['Quads', 'Hamstrings', 'Glutes', 'Calves'].includes(exerciseById(l.ex)?.muscle)).length}/${d.lifts.length}] ${d.name}: ` + d.lifts.map((l) => `${exerciseById(l.ex)?.name ?? l.ex}×${l.sets}${l.reps ? `(${l.reps.join('-')})` : ''}`).join(', ')).join('\n'),
      );
    }
    // eslint-disable-next-line no-console
    console.log('WEDDING PROBE\n' + rows.join('\n'));
  });
});
