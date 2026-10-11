// @ts-nocheck
/**
 * THE HEARTBEAT, MEASURED ON THE REAL EDGE (hand-run only):
 *     npx jest beatOnTheEdge --testPathIgnorePatterns=/node_modules/
 *     env: EDGE_RUNS (default 3), EDGE_GAP_MS (default 20000), EDGE_WHO (1 = states her lifts)
 *
 * Founder-approved plan, 2026-10-11, stage 3: *"מדידה: 10 בניות אמיתיות למתאמן המנוסה. היעד הוא 10
 * מתוך 10 בחשיבה העמוקה."*
 *
 * The unit tests prove the Worker WRITES a beat every ten seconds. They cannot prove the beat
 * ARRIVES: between the Worker and the phone sits Cloudflare's edge, and a compressor or a buffer
 * there would deliver every beat together with the answer — the same sixty silent seconds, by
 * another road. So this reads the stream chunk by chunk and prints WHEN each piece landed:
 *
 *   · the longest silence on the line (must stay far under 60 s — the phone's idle timeout);
 *   · which lane wrote the week (reasoning tokens: thousands = the strong model, hundreds = the
 *     fallback) and how long it took;
 *   · against a Worker that predates the heartbeat: says so, and reports the plain reply.
 *
 * It sends exactly what the app sends — `buildWeekRequest`, `kind: build`, `wait: 120000`,
 * `beat: true` — with the app's own token and install header, so the walls it passes are the app's.
 */
import fs from 'fs';
import path from 'path';

const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const { buildWeekRequest } = require('@/domain/buildPrompt');
const { PLAN_BUILD_SAID_MS } = require('@/platform/coach/planBuild');
const { initI18n, setLocale } = require('@/i18n');

const RUNS = Number(process.env.EDGE_RUNS || 3);
const GAP_MS = Number(process.env.EDGE_GAP_MS || 20_000);
const WHO = Number(process.env.EDGE_WHO || 1);

const ATHLETES = {
  1: { daysPerWeek: 5, sex: 'male', weightKg: 82, experience: 'advanced', ask: 'PPL, דגש על גב וכתפיים.',
       lifts: [{ exerciseId: 'bb_bench_press', kg: 100, reps: 6 }, { exerciseId: 'bb_back_squat', kg: 130, reps: 5 }, { exerciseId: 'bb_deadlift', kg: 160, reps: 5 }, { exerciseId: 'bb_overhead_press', kg: 60, reps: 8 }] },
  2: { daysPerWeek: 4, sex: 'male', weightKg: 75, experience: 'intermediate', ask: '' },
};

jest.setTimeout(RUNS * (PLAN_BUILD_SAID_MS + GAP_MS + 30_000));

async function once(req) {
  const t0 = Date.now();
  const res = await fetch(process.env.EXPO_PUBLIC_COACH_URL, {
    method: 'POST',
    // A fresh install each call, as each jest run of the other live files is: an intake's build
    // rides on the install's own small daily allowance, and ten builds are ten intakes.
    headers: { 'content-type': 'application/json', 'x-hush-token': process.env.EXPO_PUBLIC_COACH_TOKEN, 'x-hush-install': `edge-probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
    body: JSON.stringify({ blocks: req.blocks.map((b) => ({ text: b.text })), schema: req.schema, think: req.think, kind: 'build', wait: PLAN_BUILD_SAID_MS, beat: true }),
  });
  const type = res.headers.get('content-type') ?? '';
  if (res.status !== 200) return { fail: `http ${res.status}`, s: (Date.now() - t0) / 1000 };
  if (!type.includes('text/event-stream')) {
    const body = await res.json();
    return { old: true, s: (Date.now() - t0) / 1000, think: body.usage?.output_tokens_details?.reasoning_tokens ?? null, effort: body.effort, miss: body.strongMiss };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const arrivals = [];
  let raw = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    arrivals.push(Date.now() - t0);
    raw += dec.decode(value, { stream: true });
  }
  const data = raw.split('\n').filter((l) => l.startsWith('data: '));
  const beats = raw.split('\n').filter((l) => l === ': beat').length;
  const gaps = arrivals.map((a, i) => (i === 0 ? a : a - arrivals[i - 1]));
  const body = data.length ? JSON.parse(data[data.length - 1].slice(6)) : null;
  return {
    s: (Date.now() - t0) / 1000,
    first: arrivals[0] / 1000,
    chunks: arrivals.length,
    beats,
    longestSilence: Math.max(...gaps) / 1000,
    encoding: res.headers.get('content-encoding'),
    think: body?.usage?.output_tokens_details?.reasoning_tokens ?? null,
    effort: body?.effort,
    miss: body?.strongMiss,
    http: body?.http,
    finished: body?.finishReason === 'STOP',
  };
}

describe('the heartbeat on the real edge', () => {
  it('prints when each piece of the stream landed, and which lane wrote the week', async () => {
    await initI18n();
    await setLocale('he');
    const req = buildWeekRequest({ ...ATHLETES[WHO], locale: 'he', cache: false });
    const rows = [];
    for (let i = 0; i < RUNS; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, GAP_MS));
      rows.push(await once(req));
    }
    const line = (r) => r.fail
      ? `   FAIL ${r.fail} after ${r.s.toFixed(0)}s`
      : r.old
        ? `   ${r.s.toFixed(0)}s  (this Worker predates the heartbeat: one JSON body)  thinking=${r.think} effort=${r.effort}${r.miss ? ` strongMiss=${r.miss}` : ''}`
        : `   ${r.s.toFixed(0)}s  ${r.think > 1000 ? 'DEEP' : 'FALLBACK'} thinking=${r.think} effort=${r.effort}${r.miss ? ` strongMiss=${r.miss}` : ''}  first byte ${r.first.toFixed(1)}s · ${r.beats} beats in ${r.chunks} chunks · longest silence ${r.longestSilence.toFixed(1)}s · encoding=${r.encoding}${r.http ? ` http=${r.http}` : ''}${r.finished ? '' : ' NOT FINISHED'}`;
    // eslint-disable-next-line no-console
    console.log(`EDGE athlete ${WHO}, wait ${PLAN_BUILD_SAID_MS / 1000}s\n` + rows.map(line).join('\n'));
    expect(rows.length).toBe(RUNS);
  });
});
