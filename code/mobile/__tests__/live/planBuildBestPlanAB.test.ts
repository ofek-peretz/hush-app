// @ts-nocheck
/**
 * LIVE A/B (hand-run only):  npx jest planBuildBestPlanAB --testPathIgnorePatterns=/node_modules/
 *
 * FOUNDER, 2026-10-11: *"אני לא מחפש אימונים מלאים יותר — אני מחפש את האימונים הטובים ביותר… כך שכל מאמן
 * כולל הכי טובים בעולם יתרשמו מהתוכנית הזאת. שיבנה את התוכנית הטובה ביותר עבור מתאמן מבלי להתייחס
 * למגבלת הזמן, העיקר שהוא יקבל את מה שהוא צריך."*
 *
 * The build prompt has never named a time limit — and has never named a STANDARD either: it says
 * "write a training week". Walked the same day, the model's own choice was a compact week: 35–45
 * minute days and two-set accessories. This holds the catalogue, the schema and the athlete fixed
 * and varies the brief:
 *
 *   A  the prompt as it shipped (v7)
 *   B  the standard, stated ("the best week this athlete could be given…")
 *   C  the standard AND the fact that time is not a limit
 *
 * Read like a coach reads a sheet, not like a counter: `dose` = how many of the seven big muscles
 * get 10–20 hard sets a week (direct work only — an undercount, the same for every arm), `twice` =
 * how many are trained on two days or more, `thin` = the share of lifts written at two sets or
 * fewer, and the wall clock, because the wait has a budget (`PLAN_BUILD_SAID_MS`).
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

const RUNS = Number(process.env.AB_RUNS || 2);
const ARMS = (process.env.AB_ARMS || 'A,B,C').split(',');
const WHO = (process.env.AB_WHO || '1,2,3').split(',').map(Number);
const BIG = ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Biceps', 'Triceps'];

const ATHLETES = {
  1: { daysPerWeek: 5, sex: 'male', weightKg: 82, experience: 'advanced', ask: 'PPL, דגש על גב וכתפיים.',
       lifts: [{ exerciseId: 'bb_bench_press', kg: 100, reps: 6 }, { exerciseId: 'bb_back_squat', kg: 130, reps: 5 }, { exerciseId: 'bb_deadlift', kg: 160, reps: 5 }, { exerciseId: 'bb_overhead_press', kg: 60, reps: 8 }] },
  2: { daysPerWeek: 4, sex: 'male', weightKg: 75, experience: 'intermediate', ask: '' },
  3: { daysPerWeek: 3, sex: 'female', weightKg: 60, experience: 'beginner', ask: 'לחזק ולעצב ישבן ורגליים, וגם גב חזק.' },
};

const BASE = 'Write a training week for the athlete below.';
const STANDARD =
  'Write the best training week this athlete could be given: the week the best coach in the world would write for exactly this person, and that other top coaches would respect.';
const NO_CLOCK =
  '· Time is no limit. Never trim exercises, sets or weekly volume to keep a session short — give every muscle and every lift the work it needs, and nothing that does not earn its place.';

/* D — the same standard, and time taken out of the decision without asking for more: need decides. */
const NEED_ONLY =
  '· Session length is not a constraint. Choose every exercise and every number of sets only by what this athlete needs to progress — never by how long the session takes.';
/* E — D, and the craft a sheet is judged by, named as the brief rather than as rules. */
const CRAFT =
  '· A coach reading it should find nothing to add and nothing to cut: every muscle given the weekly work it needs, every exercise there for a reason, every set a hard one.';
/* F — D said in as few characters as it can be: the block's length is itself a cost (her own
   sentence is heard less as it grows — `buildPrompt.instructions`). */
const STANDARD_SHORT = 'Write the best training week this athlete could be given — one the world’s best coaches would respect.';
const NEED_SHORT = '· Session length is no constraint: choose every exercise and every set count only by what this athlete needs.';
/**
 * ⛔ THE WAIT RIDES ALONG, AS IT DOES IN THE APP (`planBuild.left()`): with sixty seconds in hand
 * the Worker buys the STRONG model; with none it answers on the fast lane — a different model, and
 * not the one her intake gets. The first runs of this file forgot it and measured the wrong coach.
 */
const BUDGET_MS = Number(process.env.AB_BUDGET_MS || 60_000);
/** The Worker rate-limits a burst of builds — pace the calls (ms between them). */
const GAP_MS = Number(process.env.AB_GAP_MS || 15_000);

jest.setTimeout(RUNS * ARMS.length * WHO.length * (100_000 + GAP_MS));

function variant(arm, who) {
  const req = buildWeekRequest({ ...ATHLETES[who], locale: 'he', cache: false });
  let [stable, her] = req.blocks.map((b) => b.text);
  /*
   * F IS WHAT SHIPS (v8, 2026-10-11): the block as `buildWeekRequest` writes it today. Every other
   * arm is rebuilt FROM it — A by taking the two sentences back out, which is v7 to the character
   * except for the title's language — so this file goes on comparing against the prompt that was,
   * not against a constant that quietly stopped matching anything.
   */
  if (!stable.includes(STANDARD_SHORT) || !stable.includes(`${NEED_SHORT}\n`)) throw new Error('the shipped lines moved — re-anchor the arms');
  const old = stable.replace(STANDARD_SHORT, BASE).replace(`${NEED_SHORT}\n`, '');
  if (arm === 'A') stable = old;
  if (arm === 'B') stable = old.replace(BASE, STANDARD);
  if (arm === 'C') stable = old.replace(BASE, STANDARD).replace('\n\n·', `\n\n${NO_CLOCK}\n·`);
  if (arm === 'D') stable = old.replace(BASE, STANDARD).replace('\n\n·', `\n\n${NEED_ONLY}\n·`);
  if (arm === 'E') stable = old.replace(BASE, STANDARD).replace('\n\n·', `\n\n${NEED_ONLY}\n${CRAFT}\n·`);
  /*
   * G / H — THE PROMPT AS SHIPPED, WITH ONE SCHEMA SENTENCE CHANGED (founder, 2026-10-11: two-set
   * lifts are "מוזר… יכול להיות שיש משהו שמגביל אותה שם"). The only words of ours that touch a set
   * count are the `sets` description, which opens "Working sets only." — a coach's term for the
   * HARD sets, and a plausible reason a model counts two where a sheet says three.
   *   G  the field with no description at all
   *   H  the same facts, without the loaded opening
   */
  let schema = req.schema;
  if (arm === 'G' || arm === 'H') {
    schema = JSON.parse(JSON.stringify(req.schema));
    const sets = schema.properties.days.items.properties.lifts.items.properties.sets;
    if (!sets?.description?.startsWith('Working sets only.')) throw new Error('the sets description moved — re-anchor G/H');
    if (arm === 'G') delete sets.description;
    if (arm === 'H') sets.description = 'How many sets of this exercise the athlete does. Do not count warm-up sets: the app offers those on the day. The app also decides how long to pause between sets, and adjusts the weight between sets from what the athlete actually lifts.';
  }
  return { blocks: [{ text: stable }, { text: her }], think: req.think, schema, v: req.v };
}

function score(week) {
  const sets = {};
  const days = {};
  let lifts = 0;
  let total = 0;
  let thin = 0;
  for (const d of week.days) {
    const hit = new Set();
    for (const l of d.lifts) {
      lifts += 1;
      total += l.sets ?? 0;
      if ((l.sets ?? 0) <= 2) thin += 1;
      const m = exerciseById(l.ex)?.muscle;
      if (!m) continue;
      sets[m] = (sets[m] ?? 0) + (l.sets ?? 0);
      hit.add(m);
    }
    for (const m of hit) days[m] = (days[m] ?? 0) + 1;
  }
  const n = week.days.length || 1;
  return {
    days: week.days.length,
    liftsDay: +(lifts / n).toFixed(1),
    setsDay: +(total / n).toFixed(1),
    total,
    thin: +(thin / Math.max(1, lifts)).toFixed(2),
    /* How loudly HER sentence was heard: the share of the week's sets on the muscles she named. */
    heard: +(((sets.Back ?? 0) + (sets.Shoulders ?? 0)) / Math.max(1, total)).toFixed(2),
    twice: BIG.filter((m) => (days[m] ?? 0) >= 2).length,
    dose: BIG.filter((m) => (sets[m] ?? 0) >= 10 && (sets[m] ?? 0) <= 20).length,
    sets,
  };
}

describe('the best plan, with no clock — live A/B', () => {
  it('prints each arm for each athlete', async () => {
    await initI18n();
    await setLocale('he');
    const out = [];
    for (const who of WHO) {
      for (const arm of ARMS) {
        const rows = [];
        for (let i = 0; i < RUNS; i++) {
          const r = variant(arm, who);
          await new Promise((res) => setTimeout(res, GAP_MS));
          const t0 = Date.now();
          const reply = await askCoach({ v: r.v, blocks: r.blocks }, r.schema, r.think, undefined, 'build', BUDGET_MS);
          const ms = Date.now() - t0;
          if (!reply.ok) { rows.push({ ms, fail: reply.reason }); continue; }
          let week = null;
          try { week = readCoachWeek(JSON.parse(reply.text)); } catch {}
          if (!week) { rows.push({ ms, fail: 'unreadable' }); continue; }
          rows.push({ ms, think: reply.usage?.output_tokens_details?.reasoning_tokens ?? null, ...score(week), title: week.name ?? '', shape: week.days.map((d) => `${d.name} [${d.lifts.map((l) => `${l.ex}×${l.sets}${l.pair ? '+' : ''}`).join(', ')}]`).join('\n        ') });
        }
        out.push(`ATHLETE ${who} · ARM ${arm}\n` + rows.map((r) => r.fail
          ? `   FAIL ${r.fail} (${r.ms}ms)`
          : `   ${Math.round(r.ms / 1000)}s  thinking=${r.think} (${r.think == null ? '?' : r.think > 1000 ? 'DEEP' : 'FALLBACK'})  days=${r.days} lifts/day=${r.liftsDay} sets/day=${r.setsDay} total=${r.total} thin=${r.thin} twice=${r.twice}/7 dose=${r.dose}/7 back+shoulders=${r.heard}\n      sets=${JSON.stringify(r.sets)}\n      "${r.title}"${process.env.AB_SHAPE ? `\n        ${r.shape}` : ''}`).join('\n'));
      }
    }
    // eslint-disable-next-line no-console
    console.log('BESTPLAN\n' + out.join('\n'));
  });
});
