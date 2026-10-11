/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WEEK IS WRITTEN BY THE STRONGEST MODEL THAT FITS HER WAIT — founder, 2026-09-27:
 * *"הכי חשוב זו התוכנית הטובה ביותר"*, and: choose by the models' strength, thinking level and
 * response speed, Opus or Sol first.
 *
 * ⛔ Since 2026-09-28 one provider (founder: *"בוא נשתמש רק ב-OPEN AI עבור כל המטרות שלנו"*):
 * OpenAI's GPT-6 Sol at `high` writes the week when the app says it can wait for it (the founder's
 * call over Astra); the same Sol at `low` answers every miss of the strong call (until then: Claude
 * Opus 5.5, and Gemini 3.8 Flash).
 * The choice is the Worker's, made from the wait the app declares — so an app that declares nothing
 * (every build before 75) is never kept waiting on a model it has no time for.
 *
 * What this law holds:
 *   1. The strong call is a model call like any other: spent after the day's budget, before the fast one.
 *   2. It is bounded so the fast model always keeps its reserve, and any miss falls through to it.
 *   3. The arithmetic: an empty ask never buys the strong model (the 20 s reveal ceiling stands),
 *      a sentence always does, and a client cannot buy it more time than the cap.
 *   4. The app sends the wait on the build and nowhere else.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import * as fs from 'fs';
import * as path from 'path';
import { PLAN_BUILD_BUDGET_MS, PLAN_BUILD_SAID_MS } from '@/platform/coach/planBuild';

const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const worker = read('../../server/worker.ts');
const strong = read('../../server/strongModel.ts');
const openai = read('../../server/openaiModel.ts');

const num = (name: string): number => {
  const m = new RegExp(`const ${name} = ([\\d_]+);`).exec(worker);
  if (!m) throw new Error(`no ${name} in worker.ts`);
  return Number(m[1].replace(/_/g, ''));
};

describe('1 · the strong call is a model call like any other', () => {
  it('is spent after the day’s budget and asked before the fast model', () => {
    const spend = worker.indexOf('quota:g:');
    const ask = worker.indexOf('await askStrongModel(');
    const fast = worker.indexOf('await askOpenAI(');
    expect(spend).toBeGreaterThan(0);
    expect(ask).toBeGreaterThan(spend);
    expect(fast).toBeGreaterThan(ask);
  });

  it('only a build, with a schema, outside the bake-off, with room declared', () => {
    expect(worker).toContain('if (isBuild && call.schema && !probing && wait >= BUILD_STRONG_MIN_WAIT_MS) {');
    expect(worker).toContain('const BUILD_STRONG_MODEL = MODEL;');
    expect(worker).toContain("const BUILD_STRONG_EFFORT: StrongEffort = 'high';");
    // …and the one it falls back to is the build's own fast lane.
    expect(worker).toContain("build: { model: MODEL, effort: 'low' },");
    expect(worker).toContain("const MODEL = 'gpt-6-sol';");
  });
});

describe('2 · bounded, and every miss is the fast model’s', () => {
  it('the deadline leaves the reserve, and the declared wait is capped', () => {
    expect(worker).toContain('deadlineMs: wait - BUILD_FALLBACK_RESERVE_MS,');
    // Twice the cap for an app that keeps the line alive, and only for it (2026-10-11).
    expect(worker).toContain('Math.min(call.wait, call.beat === true ? BUILD_WAIT_CAP_BEAT_MS : BUILD_WAIT_CAP_MS)');
    expect(num('BUILD_WAIT_CAP_MS')).toBe(60_000);
  });

  it('a hit answers as a finished reply; a miss falls through with its reason', () => {
    expect(worker).toContain("if (strong.ok) return json({ text: strong.text, finishReason: 'STOP', usage: strong.usage, model: strong.model, effort: BUILD_STRONG_EFFORT });");
    expect(worker).toContain('strongMiss = strong.why;');
    // One key for every job: the strong call spends the same OpenAI account as the fast one.
    expect(worker).toMatch(/await askStrongModel\([\s\S]{0,400}?env\.OPENAI_API_KEY,\s*\);/);
  });

  it('the strong seam never retries on its own, never throws, and accepts only a finished JSON week', () => {
    expect(strong.match(/await askOpenAI\(/g)).toHaveLength(1);
    expect(strong).not.toMatch(/\b(for|while)\s*\(/);
    expect(strong).toContain("if (r.finishReason !== 'STOP') return { ok: false");
    expect(strong).toContain('JSON.parse(r.text);');
    expect(openai).toMatch(/} catch \(e\) \{\s*\n\s*return \{ ok: false, why:/);
    expect(openai).toContain('clearTimeout(timer);');
  });
});

describe('3 · the arithmetic', () => {
  const min = num('BUILD_STRONG_MIN_WAIT_MS');
  const reserve = num('BUILD_FALLBACK_RESERVE_MS');
  /* The cap an app of today meets: it sends `beat` with every build that declares a wait. */
  const cap = num('BUILD_WAIT_CAP_BEAT_MS');

  it('⛔ an empty ask buys the strong model too (founder, 2026-09-27: "תשים את OPUS גם למי שלא כתב כלום")', () => {
    expect(PLAN_BUILD_BUDGET_MS).toBeGreaterThanOrEqual(min);
    expect(cap).toBeGreaterThanOrEqual(PLAN_BUILD_BUDGET_MS);
  });

  it('a sentence always does, and the cap covers the whole of it', () => {
    expect(PLAN_BUILD_SAID_MS).toBeGreaterThanOrEqual(min);
    expect(cap).toBeGreaterThanOrEqual(PLAN_BUILD_SAID_MS);
  });

  it('the fast model’s reserve clears its measured tail (p90 ~11 s), and the strong one gets real time', () => {
    expect(reserve).toBeGreaterThanOrEqual(11_000);
    expect(min - reserve).toBeGreaterThanOrEqual(15_000);
  });
});

describe('3b · ⛔ the strong model has the time its answers actually take (2026-10-11)', () => {
  const reserve = num('BUILD_FALLBACK_RESERVE_MS');
  const client = read('src/platform/coach/coachClient.ts');

  it('measured: 37–45 s in, the misses just past 47 — so the deadline is past a minute and a half', () => {
    expect(PLAN_BUILD_SAID_MS - reserve).toBeGreaterThanOrEqual(100_000);
    expect(PLAN_BUILD_BUDGET_MS - reserve).toBeGreaterThanOrEqual(100_000);
    expect(num('BUILD_WAIT_CAP_BEAT_MS')).toBeGreaterThanOrEqual(PLAN_BUILD_SAID_MS);
  });

  it('⛔ a wait past a minute exists ONLY on a line that is kept alive', () => {
    // the app says it can read the heartbeat on exactly the calls that declare a wait
    expect(client).toContain("...(kind === 'build' && wait && wait > 0 ? { beat: true } : {}),");
    // the Worker answers such a build through the heartbeat, and nothing else
    expect(worker).toMatch(/if \(call\.kind === 'build' && call\.beat === true\) \{[\s\S]{0,220}?return withHeartbeat\(modelStage\(\),/);
    expect(worker).toContain('return modelStage();');
    // the beat is far inside the sixty silent seconds a phone allows
    expect(num('BEAT_MS')).toBeLessThanOrEqual(15_000);
    // …and no compressor may hold it back
    expect(worker).toContain("'content-encoding': 'identity',");
    expect(worker).toContain("'cache-control': 'no-store, no-transform',");
  });

  it('the app reads the answer off that line, and a status that rode in the body is a status', () => {
    expect(client).toContain("if (!type.includes('text/event-stream')) return response.json();");
    expect(client).toContain("if (typeof body.http === 'number' && body.http !== 200) {");
  });
});

describe('4 · the app sends the wait on the build and nowhere else', () => {
  it('the build passes what is left of its budget', () => {
    expect(read('src/platform/coach/planBuild.ts')).toContain(
      "askCoach({ v: req.v, blocks: req.blocks }, req.schema, req.think, undefined, 'build', left())",
    );
  });

  it('the wire carries it only when given', () => {
    expect(read('src/platform/coach/coachClient.ts')).toContain('...(wait && wait > 0 ? { wait: Math.round(wait) } : {}),');
  });

  it('no other caller declares a wait', () => {
    const src = ['src/platform/coach/afterSession.ts', 'src/platform/coach/planReview.ts'].map(read).join('\n');
    expect(src).not.toMatch(/'(review|chat|import)',\s*[\w.()]+\s*\)/);
  });
});
