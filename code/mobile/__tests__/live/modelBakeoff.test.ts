// @ts-nocheck
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE MODEL BAKE-OFF (hand-run only) — which model writes the best week, measured. (2026-09-17)
 *
 *   BAKEOFF_URL=https://bakeoff-hush-coach.<acct>.workers.dev \
 *   BAKEOFF_ARMS="gemini-3.6-flash@low,gemini-3.6-flash@high,gemini-3.1-pro-preview@default" \
 *   npx jest modelBakeoff --testPathIgnorePatterns=/node_modules/
 *
 * Founder: *"אני רוצה את תוכניות האימון הטובות ביותר לאותה המטרה המבוקשת."* Ten real-shaped asks,
 * each run through every arm with the app's OWN prompt and schema (`buildWeekRequest`) against a
 * preview version of the coach Worker whose `PROBE` switch lets a header choose the model. Every
 * week is scored by rules a hypertrophy coach would sign, and written to disk anonymised for a blind
 * read. Nothing here touches production.
 *
 * Scores (per week):
 *   valid     the days asked for, 3–9 lifts a day, nothing refused by the catalogue
 *   twice     big muscles trained on ≥2 days (of the ones the ask cares about)
 *   dose      big muscles at 10–20 weekly sets
 *   rule      the ask's hard constraint kept (no legs / dumbbells only / no overhead press / ≤40 min)
 *   ms        wall clock
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import fs from 'fs';
import path from 'path';

const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const { buildWeekRequest } = require('@/domain/buildPrompt');
const { readCoachWeek } = require('@/domain/coachDraft');
const { exerciseById } = require('@/data/exercises');
const { initI18n, setLocale } = require('@/i18n');

const URL_ = process.env.BAKEOFF_URL;
const ARMS = (process.env.BAKEOFF_ARMS || 'gemini-3.6-flash@low').split(',').map((a) => {
  const [model, think] = a.split('@');
  return { model, think: think || 'default', key: a };
});
const REPEATS = Number(process.env.BAKEOFF_REPEATS || 2);
const OUT = process.env.BAKEOFF_OUT || path.join(__dirname, '..', '..', '..', '..', 'bakeoff-out');

const BIG = ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Glutes', 'Biceps', 'Triceps'];
const LEGS = new Set(['Quads', 'Hamstrings', 'Glutes', 'Calves']);

/** The asks — each with what a coach would check. `care` = the muscles the goal is judged on. */
export const ASKS = [
  { id: 'wedding', days: 5, sex: 'male', kg: 75, ask: 'אני רוצה שתבנה לי את תוכנית האימון הטובה ביותר שתמקסם את מסת השריר שלי כי יש לי חתונה ב-4.11.26', care: BIG },
  { id: 'cut', days: 4, sex: 'female', kg: 64, ask: 'אני רוצה לרדת באחוזי שומן ולשמור על השריר', care: BIG },
  { id: 'beginner', days: 3, sex: 'male', kg: 92, ask: 'אף פעם לא התאמנתי בחדר כושר, אני רוצה להתחזק ולהיראות טוב יותר', care: BIG },
  { id: 'nolegs', days: 4, sex: 'male', kg: 78, ask: 'בלי אימון רגליים בכלל', care: ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps'], rule: (w) => lifts(w).every((l) => !LEGS.has(muscle(l))) },
  { id: 'dumbbells', days: 3, sex: 'female', kg: 58, ask: 'יש לי רק משקולות יד בבית', care: BIG, rule: (w) => lifts(w).every((l) => ['dumbbell', 'bodyweight'].includes(exerciseById(l.ex)?.equipment)) },
  { id: 'shoulder', days: 4, sex: 'male', kg: 84, ask: 'יש לי כאב בכתף ימין כשאני מרים ידיים מעל הראש, אני רוצה להמשיך לבנות שריר', care: ['Chest', 'Back', 'Quads', 'Hamstrings', 'Biceps', 'Triceps'], rule: (w) => lifts(w).every((l) => !/overhead|shoulder_press|press_vertical/i.test(`${exerciseById(l.ex)?.pattern} ${exerciseById(l.ex)?.capability} ${l.ex}`)) },
  { id: 'glutes', days: 5, sex: 'female', kg: 61, ask: 'אני רוצה להתמקד בישבן וברגליים, והגוף העליון פחות', care: ['Glutes', 'Hamstrings', 'Quads'] },
  { id: 'football', days: 3, sex: 'male', kg: 72, ask: 'אני שחקן כדורגל, אני צריך כוח מתפרץ ומהירות בלי להיות כבד', care: ['Quads', 'Hamstrings', 'Glutes'] },
  { id: 'advanced', days: 6, sex: 'male', kg: 88, ask: 'אני מתאמן כבר 6 שנים ונתקעתי. אני רוצה פיצול מתקדם למסה', care: BIG },
  { id: 'short', days: 4, sex: 'male', kg: 80, ask: 'יש לי מקסימום 40 דקות לאימון', care: BIG, rule: (w) => w.days.every((d) => d.lifts.reduce((s, l) => s + (l.sets ?? 0), 0) <= 16) },
];

function lifts(w) {
  return w.days.flatMap((d) => d.lifts);
}
function muscle(l) {
  return exerciseById(l.ex)?.muscle ?? '?';
}

export function scoreWeek(week, ask) {
  const sets = {};
  const days = {};
  for (const d of week.days) {
    const hit = new Set();
    for (const l of d.lifts) {
      const m = muscle(l);
      sets[m] = (sets[m] ?? 0) + (l.sets ?? 0);
      hit.add(m);
    }
    for (const m of hit) days[m] = (days[m] ?? 0) + 1;
  }
  const valid = week.days.length === ask.days && week.days.every((d) => d.lifts.length >= 3 && d.lifts.length <= 9);
  return {
    valid,
    twice: ask.care.filter((m) => (days[m] ?? 0) >= 2).length / ask.care.length,
    dose: ask.care.filter((m) => (sets[m] ?? 0) >= 10 && (sets[m] ?? 0) <= 20).length / ask.care.length,
    rule: ask.rule ? ask.rule(week) : null,
    repsUsed: lifts(week).some((l) => Array.isArray(l.reps)),
    sets,
    days,
  };
}

async function call(arm, req) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hush-token': process.env.EXPO_PUBLIC_COACH_TOKEN,
      'x-hush-install': `bakeoff-${arm.model}`,
      'x-probe-model': arm.model,
      'x-probe-think': arm.think,
    },
    body: JSON.stringify({ v: req.v, kind: 'build', blocks: req.blocks, schema: req.schema, think: req.think }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

jest.setTimeout(3 * 60 * 60 * 1000);

describe('model bake-off', () => {
  it('runs every arm over every ask', async () => {
    if (!URL_) throw new Error('BAKEOFF_URL is required');
    await initI18n();
    await setLocale('he');
    fs.mkdirSync(OUT, { recursive: true });
    const summary = {};
    for (const arm of ARMS) {
      const rows = [];
      for (const ask of ASKS.filter((a) => !process.env.BAKEOFF_ONLY || process.env.BAKEOFF_ONLY.split(',').includes(a.id))) {
        for (let r = 0; r < REPEATS; r++) {
          const req = buildWeekRequest({ daysPerWeek: ask.days, sex: ask.sex, weightKg: ask.kg, ask: ask.ask, locale: 'he' });
          // Round 2: the two prompt levers — the date (a fact) and a quality bar (one line).
          if (process.env.BAKEOFF_PROMPT === 'v2') {
            req.blocks[0] = { ...req.blocks[0], text: req.blocks[0].text.replace('Write a training week for the athlete below.', 'Write the best training week for the athlete below and their goal.') };
            req.blocks[1] = { ...req.blocks[1], text: req.blocks[1].text.replace('ATHLETE\n', 'ATHLETE\n- today: 2026-09-17\n') };
          }
          const t0 = Date.now();
          const { status, body } = await call(arm, req);
          const ms = Date.now() - t0;
          let week = null;
          try {
            week = status === 200 ? readCoachWeek(JSON.parse(body.text)) : null;
          } catch {}
          if (!week) {
            rows.push({ ask: ask.id, ms, fail: body.error ?? `http ${status}` });
            continue;
          }
          const s = scoreWeek(week, ask);
          rows.push({ ask: ask.id, ms, ...s, usage: body.usage, model: body.model });
          // For the blind read: the week alone, under an opaque name.
          const blind = `${ask.id}-${require('crypto').randomBytes(5).toString('hex')}.json`;
          fs.writeFileSync(path.join(OUT, blind), JSON.stringify({ ask: ask.ask, days: ask.days, sex: ask.sex, kg: ask.kg, week: { name: week.name, days: week.days.map((d) => ({ name: d.name, lifts: d.lifts.map((l) => ({ lift: exerciseById(l.ex)?.name ?? l.ex, sets: l.sets, reps: l.reps, pair: l.pair })) })) } }, null, 2));
          fs.appendFileSync(path.join(OUT, 'key.tsv'), `${blind}\t${arm.key}\n`);
        }
      }
      const ok = rows.filter((x) => !x.fail);
      const mean = (f) => (ok.length ? ok.reduce((s, x) => s + f(x), 0) / ok.length : 0);
      const ruled = ok.filter((x) => x.rule !== null);
      const sorted = ok.map((x) => x.ms).sort((a, b) => a - b);
      summary[arm.key] = {
        calls: rows.length,
        failed: rows.length - ok.length,
        valid: +mean((x) => (x.valid ? 1 : 0)).toFixed(2),
        twice: +mean((x) => x.twice).toFixed(2),
        dose: +mean((x) => x.dose).toFixed(2),
        rulesKept: ruled.length ? +(ruled.filter((x) => x.rule).length / ruled.length).toFixed(2) : null,
        medianMs: sorted[Math.floor(sorted.length / 2)] ?? null,
        p90Ms: sorted[Math.floor(sorted.length * 0.9)] ?? null,
        outTokens: Math.round(mean((x) => x.usage?.candidatesTokenCount ?? x.usage?.output_tokens ?? 0)),
        thinkTokens: Math.round(mean((x) => x.usage?.thoughtsTokenCount ?? 0)),
      };
      fs.writeFileSync(path.join(OUT, `rows-${arm.key.replace(/[^\w.-]/g, '_')}.json`), JSON.stringify(rows, null, 2));
    }
    fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
    // eslint-disable-next-line no-console
    console.log('BAKEOFF\n' + JSON.stringify(summary, null, 2));
  });
});
