// @ts-nocheck
/**
 * LIVE A/B (hand-run only):  npx jest planBuildQualityAB --testPathIgnorePatterns=/node_modules/
 *
 * Founder, 2026-09-17: the week the model wrote for "maximise my muscle, wedding on 4.11.26" was a
 * one-muscle-a-week split at ~10 sets. This holds the catalogue and schema fixed and varies ONE thing
 * per arm, scoring every week the way a hypertrophy coach would:
 *   twice = how many of the 7 big muscles are trained on ≥2 days (evidence: ≥2×/week beats 1×)
 *   dose  = how many of them get 10–20 hard sets a week
 */
import fs from 'fs';
import path from 'path';

const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const { askCoach } = require('@/platform/coach/coachClient');
const { buildWeekRequest } = require('@/domain/buildPrompt');
const { readCoachWeek } = require('@/domain/coachDraft');
const { exerciseById } = require('@/data/exercises');
const { initI18n, setLocale } = require('@/i18n');

const RUNS = Number(process.env.AB_RUNS || 5);
const ASK = process.env.AB_ASK || 'אני רוצה שתבנה לי את תוכנית האימון הטובה ביותר שתמקסם את מסת השריר שלי כי יש לי חתונה ב-4.11.26';
const BIG = ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Biceps', 'Triceps'];
const ARMS = (process.env.AB_ARMS || 'A,B,C,D').split(',');

jest.setTimeout(RUNS * ARMS.length * 60_000);

function score(week) {
  const sets = {};
  const days = {};
  for (const d of week.days) {
    const hit = new Set();
    for (const l of d.lifts) {
      const m = exerciseById(l.ex)?.muscle;
      if (!m) continue;
      sets[m] = (sets[m] ?? 0) + (l.sets ?? 0);
      hit.add(m);
    }
    for (const m of hit) days[m] = (days[m] ?? 0) + 1;
  }
  return {
    twice: BIG.filter((m) => (days[m] ?? 0) >= 2).length,
    dose: BIG.filter((m) => (sets[m] ?? 0) >= 10 && (sets[m] ?? 0) <= 20).length,
    sets,
    days,
  };
}

function variant(arm) {
  const req = buildWeekRequest({ daysPerWeek: 5, sex: 'male', weightKg: 75, ask: ASK, locale: 'he', cache: false });
  let [stable, her] = req.blocks.map((b) => b.text);
  let think = req.think;
  if (arm === 'B' || arm === 'C' || arm === 'D') her = her.replace('ATHLETE\n', 'ATHLETE\n- today: 2026-09-17\n');
  if (arm === 'C') think = 'medium';
  if (arm === 'D') stable = stable.replace('Write a training week for the athlete below.', 'Write the best training week for the athlete below and their goal.');
  return { blocks: [{ text: stable }, { text: her }], think, schema: req.schema, v: req.v };
}

describe('build quality A/B', () => {
  it('prints each arm', async () => {
    await initI18n();
    await setLocale('he');
    const out = [];
    for (const arm of ARMS) {
      const rows = [];
      for (let i = 0; i < RUNS; i++) {
        const r = variant(arm);
        const t0 = Date.now();
        await new Promise((res) => setTimeout(res, Number(process.env.AB_GAP_MS || 0)));
        const reply = await askCoach({ v: r.v, blocks: r.blocks }, r.schema, r.think, undefined, 'build');
        const ms = Date.now() - t0;
        if (!reply.ok) { rows.push({ ms, fail: reply.reason }); continue; }
        let week = null;
        try { week = readCoachWeek(JSON.parse(reply.text)); } catch {}
        if (!week) { rows.push({ ms, fail: 'unreadable' }); continue; }
        rows.push({ ms, ...score(week), shape: week.days.map((d) => d.name).join(' / ') });
      }
      const ok = rows.filter((r) => !r.fail);
      const avg = (k) => (ok.reduce((s, r) => s + r[k], 0) / Math.max(1, ok.length)).toFixed(1);
      out.push(`ARM ${arm}: twice ${avg('twice')}/7  dose ${avg('dose')}/7  ms ${avg('ms')}  fails ${rows.length - ok.length}\n` +
        rows.map((r) => r.fail ? `   FAIL ${r.fail}` : `   twice=${r.twice} dose=${r.dose} ${r.ms}ms sets=${JSON.stringify(r.sets)} | ${r.shape}`).join('\n'));
    }
    // eslint-disable-next-line no-console
    console.log('AB\n' + out.join('\n'));
  });
});
