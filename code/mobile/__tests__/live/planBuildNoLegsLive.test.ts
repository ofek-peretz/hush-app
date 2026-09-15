// @ts-nocheck
/**
 * LIVE PROBE (hand-run only, excluded from the standing suite like its siblings):
 *   npx jest planBuildNoLegsLive --testPathIgnorePatterns=/node_modules/
 *
 * Founder, 2026-09-09: *"כתבתי בשדה החופשי שאני לא רוצה אימוני רגליים בכלל וקיבלתי 2 אימוני
 * רגליים."* This asks the live Worker that exact sentence N times, through the app's own
 * `requestPlanBuild` (same prompt, schema, think level, budget, retry), and counts the leg lifts
 * in every reply — and records which replies never arrived, because a build that falls through
 * to the local assembler is a week her sentence never touched.
 */
import fs from 'fs';
import path from 'path';

const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const { requestPlanBuild } = require('@/platform/coach/planBuild');
const { buildWeekRequest } = require('@/domain/buildPrompt');
const { exerciseById } = require('@/data/exercises');
const { initI18n, setLocale } = require('@/i18n');

const LEGS = new Set(['Quads', 'Hamstrings', 'Glutes', 'Calves']);
const RUNS = Number(process.env.NO_LEGS_RUNS || 6);
const ASK = process.env.NO_LEGS_ASK || 'אני לא רוצה אימוני רגליים בכלל';

jest.setTimeout(RUNS * 40_000);

describe('the live week for "no leg days at all"', () => {
  it('prints what came back, run by run', async () => {
    await initI18n();
    await setLocale('he');
    const req = buildWeekRequest({ daysPerWeek: 4, sex: 'male', weightKg: 78, ask: ASK, locale: 'he' });
    // eslint-disable-next-line no-console
    console.log('HER BLOCK AS SENT:\n' + req.blocks[1].text);

    const rows = [];
    for (let i = 0; i < RUNS; i++) {
      const t0 = Date.now();
      const res = await requestPlanBuild({ daysPerWeek: 4, sex: 'male', weightKg: 78, ask: ASK });
      const ms = Date.now() - t0;
      if (!res.ok) {
        rows.push(`run ${i + 1}: ${ms}ms  FAILED → ${res.reason}  (she gets the local week)`);
        continue;
      }
      let legLifts = 0;
      let lifts = 0;
      const legDays = [];
      const lines = [];
      for (const d of res.week.days) {
        const legHere = d.lifts.filter((l) => LEGS.has(exerciseById(l.ex)?.muscle)).length;
        legLifts += legHere;
        lifts += d.lifts.length;
        if (legHere >= Math.ceil(d.lifts.length / 2)) legDays.push(d.name);
        lines.push(`   ${d.name}: ` + d.lifts.map((l) => `${exerciseById(l.ex)?.name ?? l.ex}${LEGS.has(exerciseById(l.ex)?.muscle) ? ' [LEG]' : ''}`).join(', '));
      }
      rows.push(`run ${i + 1}: ${ms}ms  NAME=${JSON.stringify(res.week.name)}  days=${res.week.days.length}  lifts=${lifts}  legLifts=${legLifts}  legDays=${legDays.length}${legDays.length ? ' (' + legDays.join(' / ') + ')' : ''}  missing=${JSON.stringify(res.week.missing)}\n` + lines.join('\n'));
    }
    // eslint-disable-next-line no-console
    console.log('NO-LEGS PROBE\n' + rows.join('\n'));
  });
});
