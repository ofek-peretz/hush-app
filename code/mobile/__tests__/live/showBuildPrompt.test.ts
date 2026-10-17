// @ts-nocheck
/**
 * SHOW ME THE PROMPT (hand-run only):  npx jest showBuildPrompt --testPathIgnorePatterns=/node_modules/
 *
 * FOUNDER, 2026-10-11: *"תעבור על הפרומפט שנתנו לבינה בצורה הכי מדוקדקת ומפורטת ותגיד לי בדיוק מה
 * כתוב שם. אני רוצה לראות את זה בעיניים שלי כי יכול להיות שיש משהו שמגביל אותה שם ואתה מפספס."*
 *
 * Writes `docs/BUILD_PROMPT_AS_SENT.txt` — every character the app sends for one real athlete, in
 * the order the model reads it: the text (our lines, the catalogue, her facts, her words) and the
 * reply schema with each field's description, which the model reads as part of the prompt.
 *
 * Built by calling `buildWeekRequest` — the function the intake calls — so it cannot drift from
 * what ships. With `SHOW_LIVE=1` it also makes ONE real call, exactly as the app does (60 s of
 * wait riding along), and appends which model answered, how many tokens it spent thinking, and
 * the week it wrote.
 */
import fs from 'fs';
import path from 'path';

const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const { askCoach } = require('@/platform/coach/coachClient');
const { buildWeekRequest, BUILD_PROMPT_VERSION } = require('@/domain/buildPrompt');
const { readCoachWeek } = require('@/domain/coachDraft');
const { initI18n, setLocale } = require('@/i18n');

const OUT = path.join(__dirname, '..', '..', '..', '..', 'docs', 'BUILD_PROMPT_AS_SENT.txt');

/* The athlete the 2026-10-11 walks used: every intake field filled, so every line is on the page. */
const ATHLETE = {
  daysPerWeek: 5,
  sex: 'male',
  weightKg: 82,
  experience: 'advanced',
  ask: 'PPL, דגש על גב וכתפיים.',
  lifts: [
    { exerciseId: 'bb_bench_press', kg: 100, reps: 6 },
    { exerciseId: 'bb_back_squat', kg: 130, reps: 5 },
    { exerciseId: 'bb_deadlift', kg: 160, reps: 5 },
    { exerciseId: 'bb_overhead_press', kg: 60, reps: 8 },
  ],
};

jest.setTimeout(180_000);

const rule = (title) => `\n${'═'.repeat(100)}\n${title}\n${'═'.repeat(100)}\n`;

describe('the build prompt, as sent', () => {
  it('writes it to docs/BUILD_PROMPT_AS_SENT.txt', async () => {
    await initI18n();
    await setLocale('he');
    const req = buildWeekRequest({ ...ATHLETE, locale: 'he' });
    const [stable, her] = req.blocks.map((b) => b.text);
    // The header on its own line — "CATALOGUE" also appears INSIDE one of our lines.
    const cut = stable.indexOf('\n\nCATALOGUE\n') + 2;
    const ours = stable.slice(0, cut);
    const catalogue = stable.slice(cut);
    const lines = catalogue.split('\n').filter((l) => l.includes(' = '));

    let doc = '';
    doc += `FERROX — the week-build prompt, exactly as the app sends it (prompt version ${BUILD_PROMPT_VERSION})\n`;
    doc += `Generated ${new Date().toISOString()} by __tests__/live/showBuildPrompt.test.ts from buildWeekRequest().\n`;
    doc += rule('HOW IT TRAVELS');
    doc += [
      'phone  →  our Worker (Cloudflare)  →  OpenAI Responses API',
      '',
      'The phone sends:  blocks (the two texts below), the reply schema, think: "' + req.think + '", kind: "build", wait: 60000 ms.',
      'The Worker joins the two texts with one blank line and sends them as ONE user message.',
      'It adds NO system prompt and NO other text. (server/worker.ts, server/openaiModel.ts)',
      'Model settings are the Worker\'s, not the phone\'s:',
      '   first try   gpt-6-sol, reasoning effort HIGH, max_output_tokens 32000, deadline = wait − 13 s (47 s at most)',
      '   if it misses that deadline (or fails): gpt-6-sol, reasoning effort LOW, max_output_tokens 16384',
      'The schema is sent as text.format json_schema, strict: false, with numeric/array bounds stripped.',
    ].join('\n') + '\n';
    doc += rule(`TEXT 1 of 2 — OUR LINES (${ours.trim().length} characters). Identical for every athlete.`);
    doc += ours;
    doc += rule(`TEXT 1 continued — THE CATALOGUE (${lines.length} exercises, ${catalogue.length} characters). Identical for every athlete.`);
    doc += catalogue + '\n';
    doc += rule('TEXT 2 of 2 — THIS ATHLETE. Only what the intake collected; a field she skipped is not sent.');
    doc += her + '\n';
    doc += rule('THE REPLY SCHEMA — the model reads every "description" below as part of the prompt');
    doc += JSON.stringify(req.schema, null, 2) + '\n';

    if (process.env.SHOW_LIVE) {
      const t0 = Date.now();
      const reply = await askCoach({ v: req.v, blocks: req.blocks }, req.schema, req.think, undefined, 'build', 60_000);
      const s = Math.round((Date.now() - t0) / 1000);
      doc += rule(`ONE LIVE CALL, MADE AS THE APP MAKES IT — answered in ${s} s`);
      if (!reply.ok) doc += `FAILED: ${reply.reason}\n`;
      else {
        doc += `model that answered: ${reply.model}\nusage as the provider reported it: ${JSON.stringify(reply.usage)}\n\nRAW REPLY:\n${JSON.stringify(JSON.parse(reply.text), null, 1)}\n`;
        const week = readCoachWeek(JSON.parse(reply.text));
        // eslint-disable-next-line no-console
        console.log(`LIVE ${s}s model=${reply.model} usage=${JSON.stringify(reply.usage)} days=${week?.days.length}`);
      }
    }
    fs.writeFileSync(OUT, doc, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`WROTE ${OUT}\nours=${ours.trim().length} chars · catalogue=${lines.length} lifts · her=${her.length} chars`);
    expect(ours).toContain('Write the best training week');
  });
});
