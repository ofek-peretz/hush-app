// @ts-nocheck
/**
 * THE BLIND JUDGE (hand-run only) — the bake-off's programmes scored by a coach who cannot see who
 * wrote them. (2026-09-17)
 *
 *   JUDGE_URL=… JUDGE_MODEL=gpt-5.6-sol@low BAKE_DIR=… npx jest modelJudge --testPathIgnorePatterns=/node_modules/
 *
 * Per ask, every programme is shuffled, relabelled P01…Pnn, and sent in ONE call so the judge scores
 * them against each other on the same rubric. The label→file map never leaves this process.
 */
import fs from 'fs';
import path from 'path';

const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const S = process.env.BAKE_DIR;
const [MODEL, THINK] = (process.env.JUDGE_MODEL || 'gpt-5.6-sol@low').split('@');

const RUBRIC = `You are an elite strength & hypertrophy coach reviewing training weeks written for real athletes.
Each programme below answers the SAME athlete request. Loads, reps and rest are filled in later by
software — judge the STRUCTURE only: the split, exercise selection, sets per exercise, weekly
frequency and volume per muscle, exercise order, balance, and above all how well it serves exactly
what the athlete asked for (goal, constraints, experience, time).

Score every programme from 1 to 10 against the others, using the full range:
10 = what the best coach in the world would write for this request; 5 = acceptable but generic;
1 = wrong for this athlete. A constraint the athlete stated that is broken caps the score at 4.
Give one short reason each.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scores'],
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'score', 'reason'],
        properties: { id: { type: 'string' }, score: { type: 'integer' }, reason: { type: 'string' } },
      },
    },
  },
};

jest.setTimeout(2 * 60 * 60 * 1000);

it('judges every ask', async () => {
  const files = fs.readdirSync(path.join(S, 'blind'));
  const asks = [...new Set(files.map((f) => f.split('-')[0]))];
  const results = [];
  for (const ask of asks) {
    const group = files.filter((f) => f.startsWith(`${ask}-`)).sort(() => Math.random() - 0.5);
    const labels = {};
    let request = '';
    const blocks = group.map((f, i) => {
      const id = `P${String(i + 1).padStart(2, '0')}`;
      labels[id] = f;
      const j = JSON.parse(fs.readFileSync(path.join(S, 'blind', f), 'utf8'));
      request = `ATHLETE: ${j.sex}, ${j.kg} kg, ${j.days} days per week.\nREQUEST (their own words): ${j.ask}`;
      const week = j.week.days.map((d) => `  ${d.name}: ${d.lifts.map((l) => `${l.lift} ${l.sets}×${l.reps ? l.reps.join('-') : ''}${l.pair ? ' [superset with next]' : ''}`).join('; ')}`).join('\n');
      return `${id}\n${week}`;
    });
    const text = `${RUBRIC}\n\n${request}\n\nPROGRAMMES\n\n${blocks.join('\n\n')}`;
    const res = await fetch(process.env.JUDGE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hush-token': process.env.EXPO_PUBLIC_COACH_TOKEN,
        'x-hush-install': `judge-${MODEL}`,
        'x-probe-model': MODEL,
        'x-probe-think': THINK || 'default',
      },
      body: JSON.stringify({ v: 1, kind: 'review', blocks: [{ text }], schema: SCHEMA }),
    });
    const body = await res.json().catch(() => ({}));
    let parsed = null;
    try {
      parsed = JSON.parse(body.text);
    } catch {}
    if (!parsed?.scores) {
      results.push({ ask, error: body.error ?? res.status });
      continue;
    }
    for (const s of parsed.scores) if (labels[s.id]) results.push({ ask, file: labels[s.id], score: s.score, reason: s.reason });
  }
  fs.writeFileSync(path.join(S, `judge-${MODEL}.json`), JSON.stringify(results, null, 2));
  console.log('JUDGED', results.filter((r) => r.score != null).length, 'errors', results.filter((r) => r.error).map((r) => `${r.ask}:${r.error}`).join(','));
});
