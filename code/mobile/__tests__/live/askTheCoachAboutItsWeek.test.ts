// @ts-nocheck
/**
 * LIVE (hand-run only):  npx jest askTheCoachAboutItsWeek --testPathIgnorePatterns=/node_modules/
 *
 * FOUNDER, 2026-10-17: *"משום מה הבינה עושה 2 סטים לתרגילים מסוימים וזה קצת מוזר לי כי ממתי עושים 2
 * סטים. אמרתי לך על זה כמה פעמים חשוב שנבדוק עם הבינה האם היא בטוחה שהתוכניות שהיא בונה הן הטובות
 * ביותר ולא חסר לה שום מידע שהיא צריכה."*
 *
 * Two calls per athlete, both to the coach the app's intake gets (the Worker's strong lane, the full
 * two-minute wait):
 *   1. BUILD — the week, from the request the app sends today (`buildWeekRequest`), unchanged.
 *   2. ASK   — the same model is shown everything it was shown, and the week it wrote, and is asked
 *              — neutrally, never "write more" — why each two-set lift is two, how sure it is that
 *              this is the best week for this person, what a top coach would change, and what it was
 *              NOT told, about the athlete or about the app, that would change the week.
 *
 * Env: `ASK_WHO=1,2,3,4`, `ASK_GAP_MS` (the Worker rate-limits a burst of builds), `ASK_OUT` (a JSON
 * file the answers are written to, for reading whole).
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

const WHO = (process.env.ASK_WHO || '1,2,3,4').split(',').map(Number);
const GAP_MS = Number(process.env.ASK_GAP_MS || 25_000);
const WAIT_MS = 120_000; // what the app's build waits (`planBuild`), so the strong model answers
const OUT = process.env.ASK_OUT || null;
/** A file of extra lines put after OUR LINES, before the CATALOGUE — how a candidate prompt is tried without touching `src`. */
const FACTS = process.env.ASK_FACTS_FILE ? fs.readFileSync(process.env.ASK_FACTS_FILE, 'utf8').trim() : '';
/** `1` — build only (no review question), for an A/B of the weeks themselves. */
const BUILD_ONLY = process.env.ASK_BUILD_ONLY === '1';

const ATHLETES = {
  1: { daysPerWeek: 5, sex: 'male', weightKg: 82, experience: 'advanced', ask: 'PPL, דגש על גב וכתפיים.',
       lifts: [{ exerciseId: 'bb_bench_press', kg: 100, reps: 6 }, { exerciseId: 'bb_back_squat', kg: 130, reps: 5 }, { exerciseId: 'bb_deadlift', kg: 160, reps: 5 }, { exerciseId: 'bb_overhead_press', kg: 60, reps: 8 }] },
  2: { daysPerWeek: 4, sex: 'male', weightKg: 75, experience: 'intermediate', ask: '' },
  3: { daysPerWeek: 3, sex: 'female', weightKg: 60, experience: 'beginner', ask: 'לחזק ולעצב ישבן ורגליים, וגם גב חזק.' },
  4: { daysPerWeek: 4, sex: 'female', weightKg: 64, experience: 'intermediate', ask: 'רוצה להיראות חטובה ולהתחזק, אוהבת אימוני משקולות.' },
};

const ASK =
  'Above is everything you were given to write a training week, exactly as it was sent: our instructions, the exercise catalogue and the athlete. Below is the week you wrote.\n\n' +
  'We are reviewing the quality of the weeks this app builds, and we want your honest professional judgment — not a defence of the week, and not a longer week for its own sake. Answer as the coach who wrote it, talking to the head coach:\n' +
  '1. For EVERY exercise you wrote with 2 sets (or fewer): why that number for this athlete? Is it truly the best choice, or a consequence of something in the instructions, of something you were not told, or of habit? Give the number you would write with full information.\n' +
  '2. How confident are you (0–10) that this is the best week this athlete could be given? What would the best coaches in the world change, and why?\n' +
  '3. What information about the ATHLETE were you not given that would change the week? For each item, say how it would change it.\n' +
  '4. What information about the APP or the PROGRAMME were you not given that would change the week — for example how long the programme runs, whether this week repeats, how weights progress between sessions and weeks, how sets are logged, deloads? For each item, say how it would change it.\n' +
  '5. Is anything in our instructions or field descriptions unclear, misleading or constraining?\n' +
  'Answer in English.';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['twoSetLifts', 'confidence', 'topCoachChanges', 'missingAboutAthlete', 'missingAboutApp', 'instructionsProblems'],
  properties: {
    twoSetLifts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ex', 'sets', 'why', 'cause', 'withFullInformation'],
        properties: {
          ex: { type: 'string' },
          sets: { type: 'integer' },
          why: { type: 'string' },
          cause: { type: 'string', description: 'one of: best_for_athlete, instructions, missing_information, habit' },
          withFullInformation: { type: 'integer' },
        },
      },
    },
    confidence: { type: 'integer' },
    topCoachChanges: { type: 'array', items: { type: 'string' } },
    missingAboutAthlete: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['info', 'effect'], properties: { info: { type: 'string' }, effect: { type: 'string' } } } },
    missingAboutApp: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['info', 'effect'], properties: { info: { type: 'string' }, effect: { type: 'string' } } } },
    instructionsProblems: { type: 'array', items: { type: 'string' } },
  },
};

// The title first — without it the reviewer reads a week with no title and reports one missing.
const sheet = (week) =>
  `TITLE: ${week.name ?? '(none)'}\n` +
  week.days
    .map((d) => `${d.name}\n` + d.lifts.map((l) => `  - ${l.ex} (${exerciseById(l.ex)?.name ?? '?'}): ${l.sets} sets${l.reps ? ` × ${l.reps[0]}–${l.reps[1]}` : ''}${l.load != null ? ` @ ${l.load} kg` : ''}${l.pair ? '  [superset with next]' : ''}`).join('\n'))
    .join('\n');

jest.setTimeout(WHO.length * (2 * WAIT_MS + 2 * GAP_MS + 30_000));

describe('ask the coach about its own week — live', () => {
  it('builds, then asks', async () => {
    await initI18n();
    await setLocale('he');
    const results = [];
    for (const who of WHO) {
      const req = buildWeekRequest({ ...ATHLETES[who], locale: 'he', cache: false });
      if (FACTS) {
        const at = req.blocks[0].text.indexOf('\n\nCATALOGUE\n');
        if (at < 0) throw new Error('no CATALOGUE in the request');
        req.blocks[0].text = req.blocks[0].text.slice(0, at) + '\n\n' + FACTS + req.blocks[0].text.slice(at);
      }
      await new Promise((r) => setTimeout(r, GAP_MS));
      let t0 = Date.now();
      const built = await askCoach({ v: req.v, blocks: req.blocks }, req.schema, req.think, undefined, 'build', WAIT_MS);
      const buildMs = Date.now() - t0;
      if (!built.ok) { results.push({ who, fail: `build ${built.reason}` }); continue; }
      let week = null;
      try { week = readCoachWeek(JSON.parse(built.text)); } catch {}
      if (!week) { results.push({ who, fail: 'build unreadable' }); continue; }
      const lifts = week.days.flatMap((d) => d.lifts);
      const two = lifts.filter((l) => (l.sets ?? 0) <= 2);

      if (BUILD_ONLY) {
        results.push({ who, athlete: ATHLETES[who], buildS: Math.round(buildMs / 1000), lifts: lifts.length, twoSetShare: +(two.length / Math.max(1, lifts.length)).toFixed(2), week: sheet(week) });
        console.log(`BUILT ${who}: ${Math.round(buildMs / 1000)}s, two-set ${two.length}/${lifts.length}`);
        continue;
      }
      const blocks = [{ text: req.blocks[0].text }, { text: `${req.blocks[1].text}\n\n════ THE WEEK YOU WROTE ════\n${sheet(week)}\n\n════ OUR QUESTIONS ════\n${ASK}` }];
      await new Promise((r) => setTimeout(r, GAP_MS));
      t0 = Date.now();
      const asked = await askCoach({ v: req.v, blocks }, SCHEMA, req.think, undefined, 'build', WAIT_MS);
      const askMs = Date.now() - t0;
      let answer = null;
      try { answer = asked.ok ? JSON.parse(asked.text) : null; } catch {}
      results.push({
        who,
        athlete: ATHLETES[who],
        buildS: Math.round(buildMs / 1000),
        buildThinking: built.usage?.output_tokens_details?.reasoning_tokens ?? null,
        askS: Math.round(askMs / 1000),
        askThinking: asked.usage?.output_tokens_details?.reasoning_tokens ?? null,
        lifts: lifts.length,
        twoSetShare: +(two.length / Math.max(1, lifts.length)).toFixed(2),
        week: sheet(week),
        answer: answer ?? { fail: asked.ok ? 'unreadable' : asked.reason, raw: asked.text?.slice?.(0, 2000) },
      });
      // eslint-disable-next-line no-console
      console.log(`ASKED ${who}: build ${Math.round(buildMs / 1000)}s, ask ${Math.round(askMs / 1000)}s, two-set ${two.length}/${lifts.length}`);
    }
    if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
    // eslint-disable-next-line no-console
    console.log('ASKRESULTS ' + JSON.stringify(results.map((r) => ({ who: r.who, fail: r.fail, twoSetShare: r.twoSetShare, confidence: r.answer?.confidence }))));
  });
});
