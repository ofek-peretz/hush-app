/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * IS THE COACH ONE VOICE? (2026-10-12) — the same line, asked for again and again, measured.
 *
 * Founder, build 79: *"זה בוודאות לא נאמר באותו הקול. היה גם פעם אחת את הקול של כרמית ופעם אחת את הקול
 * של נקבה של OpenAI ופעם אחת היה קול של גבר ונראה לי גם הוא מ-OpenAI."*
 *
 * The app asks for ONE voice by name and the Worker passes that name on (`voice.ts` `say`); no male
 * voice is on the list. So either the phone said a line itself (Carmit — the fallback), or the model
 * does not hold a voice from one request to the next. The second is a fact about the model, and it
 * can be measured from this desk: every coach line is its own request, so every line is its own
 * chance to come back as somebody else.
 *
 *     node server/voiceDrift.cjs [out-dir]            (production Worker, the app's own door)
 *
 * Env: DRIFT_VOICES (comma list, default the app's default voice), DRIFT_RUNS (default 6),
 * DRIFT_GAP_MS (default 700), DRIFT_LINES (comma list of indexes into LINES); DRIFT_URL + DRIFT_PROBE=1
 * to ask a probe preview for a voice the shipping Worker would refuse (another model, a dated
 * version); DRIFT_ANALYZE=1 to re-read the files a run already left in out-dir.
 *
 * For each returned WAV: the median pitch of its voiced frames, read by the Worker's own ear
 * (`voicePitch.ts` — one ear, so what this reports is what `say` chooses by). An adult woman's
 * speaking pitch sits around 165–255 Hz, a man's around 85–155 — a clip of a "female" voice with a
 * median near 95 Hz is a man, whatever it was asked to be. The files are kept in out-dir so a person
 * can listen to the ones the numbers point at.
 *
 * WHAT IT FOUND (2026-10-12, before `voice.ts` chose between takes): one request in five to the
 * model's unversioned name never answered; the same word came back between 166 and 250 Hz; one clip
 * in about 200 was a man. AFTER a deploy, the same run is the proof: nothing lost, each short line
 * `takes 3`, the dated `model`, and the spread of a short line a third of what it was.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '.voicedrift'));
const ENV = fs.readFileSync(path.resolve(__dirname, '../code/mobile/.env'), 'utf8');
const env = (k) => (new RegExp(`^${k}=(.*)$`, 'm').exec(ENV)?.[1] ?? '').trim();
const BASE = (process.env.DRIFT_URL || env('EXPO_PUBLIC_COACH_URL')).replace(/\/+$/, '');
const TOKEN = env('EXPO_PUBLIC_COACH_TOKEN');
const VOICES = (process.env.DRIFT_VOICES || 'openai:gpt-4o-mini-tts:marin').split(',').map((s) => s.trim()).filter(Boolean);
const RUNS = Number(process.env.DRIFT_RUNS || 6);
const GAP_MS = Number(process.env.DRIFT_GAP_MS || 700);
// A PROBE preview of the Worker (`voiceBakeoff.cjs` says how one is made) takes any model:voice by
// header — the way to measure a candidate against the shipping voice before anything is deployed.
const PROBE = process.env.DRIFT_PROBE === '1';
// An install of its own: the Worker's anonymous pool (300 lines a day) is what this spends.
const INSTALL = process.env.DRIFT_INSTALL || 'voice-drift-probe-01';
/** Fewer voiced frames than this and a clip is too short to give a pitch (`voice.ts` MIN_VOICED). */
const MIN_VOICED = 8;

/** Lines the coach really says in a workout — short ones first: they are where a voice has least to hold on to. */
const LINES = [
  'חזרתי.',
  'קדימה.',
  'נרשם.',
  'עוד עשר שניות.',
  'מנוחה: דקה וחצי.',
  'שמונה חזרות. נרשם.',
  'המנוחה נגמרה. הסט הבא: שישים קילו, שמונה עד עשר חזרות.',
  'לחיצת חזה במוט. שישים קילו: המוט עשרים קילו, ועשרים קילו בכל צד. שמונה עד עשר חזרות.',
  'סיימת עם לחיצת חזה במוט. התרגיל הבא: חתירה בפולי בישיבה, ארבעים וחמישה קילו. מנוחה: שתי דקות.',
];
const PICK = process.env.DRIFT_LINES ? process.env.DRIFT_LINES.split(',').map(Number) : LINES.map((_, i) => i);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function say(text, voice) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/voice/say`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hush-token': TOKEN, 'x-hush-install': INSTALL, ...(PROBE ? { 'x-probe-voice': voice } : {}) },
    body: JSON.stringify({ text, lang: 'he', voice }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    return { ok: false, why: `http_${res.status}:${b.why ?? b.error ?? ''}@${b.ms ?? '?'}ms`, ms: Date.now() - t0 };
  }
  const body = await res.json();
  return { ok: true, wav: Buffer.from(String(body.audio ?? ''), 'base64'), model: body.model ?? null, takes: body.takes ?? null, ms: Date.now() - t0 };
}

const nameOf = (voice) => voice.split(':').slice(1).join('-');

function report(rows, fails) {
  for (const name of [...new Set([...rows, ...fails].map((r) => r.voice))]) {
    const all = rows.filter((r) => r.voice === name);
    const mine = all.filter((r) => r.voiced >= MIN_VOICED);
    const hz = mine.map((r) => r.hz).sort((a, b) => a - b);
    const timed = all.filter((r) => r.ms != null);
    if (timed.length) {
      // What the phone lives with: a line is waited on for four seconds, and then Carmit says it.
      const lost = fails.filter((f) => f.voice === name).length;
      const ms = timed.map((r) => r.ms).sort((a, b) => a - b);
      const late = timed.filter((r) => r.ms > 4000).length;
      const asked = timed.length + lost;
      const said = [...new Set(timed.map((r) => `${r.model ?? 'model not reported'}, takes ${[...new Set(timed.filter((x) => x.model === r.model).map((x) => x.takes ?? '?'))].join('/')}`))].join(' · ');
      console.log(`\n${name}: asked ${asked} · never came ${lost} · came after 4 s ${late} → ${Math.round(((lost + late) / asked) * 100)}% of new lines are the phone's own voice · latency median ${ms[Math.floor(ms.length / 2)]} ms, p90 ${ms[Math.floor(ms.length * 0.9)]} ms`);
      console.log(`   spoke: ${said}`);
    } else {
      console.log(`\n${name}:`);
    }
    if (!hz.length) continue;
    const mid = hz[Math.floor(hz.length / 2)];
    const far = mine.filter((r) => Math.abs(r.hz - mid) > mid * 0.2 || Math.abs(r.strong - mid) > mid * 0.2);
    console.log(`   ${mine.length} clips · pitch ${hz[0]}–${hz[hz.length - 1]} Hz, median ${mid} · under 150 Hz (a man's range): ${mine.filter((r) => Math.min(r.hz, r.strong) < 150).length} · more than 20% from the median: ${far.length}`);
    for (const line of [...new Set(mine.map((r) => r.line))].sort((a, b) => a - b)) {
      const l = mine.filter((r) => r.line === line).map((r) => r.hz).sort((a, b) => a - b);
      console.log(`   line ${line}  n ${String(l.length).padStart(2)}  ${l[0]}–${l[l.length - 1]} Hz  (${Math.round((l[l.length - 1] / l[0] - 1) * 100)}% apart)  ${JSON.stringify(LINES[line] ?? '')}`);
    }
    for (const r of far) console.log(`   ↯ ${path.basename(r.file)}  ${r.hz} Hz (strongest peak ${r.strong}), ${r.seconds.toFixed(1)} s`);
  }
}

(async () => {
  // One ear: the Worker's (`voicePitch.ts`), so a clip is measured here exactly as `say` measures it.
  const { wavPitch } = await import(pathToFileURL(path.join(__dirname, 'voicePitch.ts')).href);
  const pitchOf = (buf) => wavPitch(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));

  // DRIFT_ANALYZE=1: no asking — read the files a run already left in out-dir (a run cut short keeps its clips).
  if (process.env.DRIFT_ANALYZE === '1') {
    const got = fs
      .readdirSync(OUT)
      .map((f) => ({ f, m: /^(.*)-line(\d+)-run(\d+)\.wav$/.exec(f) }))
      .filter((x) => x.m)
      .map(({ f, m }) => ({ voice: m[1], line: Number(m[2]), run: Number(m[3]), file: path.join(OUT, f), ...pitchOf(fs.readFileSync(path.join(OUT, f))) }));
    fs.writeFileSync(path.join(OUT, 'pitch.json'), JSON.stringify(got, null, 1));
    report(got, []);
    return;
  }

  if (!BASE || !TOKEN) throw new Error('code/mobile/.env has no coach URL / token');
  fs.mkdirSync(OUT, { recursive: true });
  const rows = [];
  const fails = [];
  for (const voice of VOICES) {
    const name = nameOf(voice);
    for (const li of PICK) {
      const cells = [];
      for (let run = 0; run < RUNS; run++) {
        const r = await say(LINES[li], voice);
        if (!r.ok) {
          cells.push(r.why);
          fails.push({ voice: name, line: li, why: r.why, ms: r.ms });
          await sleep(GAP_MS * 4);
          continue;
        }
        const file = path.join(OUT, `${name}-line${li}-run${run}.wav`);
        fs.writeFileSync(file, r.wav);
        const p = pitchOf(r.wav);
        rows.push({ voice: name, line: li, run, file, ...p, ms: r.ms, model: r.model, takes: r.takes });
        cells.push(`${p.hz}`);
        await sleep(GAP_MS);
      }
      console.log(`${name.padEnd(8)} line ${li}  median pitch per ask (Hz): ${cells.join('  ')}`);
    }
  }
  fs.writeFileSync(path.join(OUT, 'pitch.json'), JSON.stringify(rows, null, 1));
  report(rows, fails);
})().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
