/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE VOICE BAKE-OFF (2026-09-27) — which ear hears Hebrew answers best in a gym, and how each voice
 * sounds. Runs against a PROBE preview of hush-coach, so every candidate goes through `voice.ts`:
 *
 *     npx wrangler versions upload --preview-alias voiceprobe --var PROBE:1      (from server/)
 *     node voiceBakeoff.cjs [out-dir]
 *
 * EARS: the answers a lifter gives ("מוכן", "עשר", "ארבעים וחמש קילו, עשר", "תשע, לא, עשר" …), said
 * by several synthetic speakers, under four rooms — clean; a gym at +5 dB (music, other people, air);
 * at 0 dB; and a phone in a pocket (the same gym through a 2.2 kHz low-pass, −6 dB). Each ear's
 * transcript is read by the APP'S OWN grammar (`src/domain/voiceGrammar`, compiled to out-dir/lib),
 * and scored on whether it means exactly what was said. Median latency beside it.
 *
 * VOICES: the coach's real lines in each candidate voice, written to out-dir/voices/<voice>/ for a
 * person to listen to — a machine cannot say which voice feels like a coach; it can say how fast
 * each one answers and whether the best ear understands every word it says.
 *
 * OpenAI only (founder, 2026-09-28): its three ears, and its five female voices. Needs credit on the
 * OpenAI account behind the Worker (on 2026-09-28 it was empty).
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '.bakeoff'));
const MOBILE = path.resolve(__dirname, '../code/mobile');
const BASE = process.env.PROBE_URL || 'https://voiceprobe-hush-coach.hush-app.workers.dev';
const TOKEN = /EXPO_PUBLIC_COACH_TOKEN=(.*)/.exec(fs.readFileSync(path.join(MOBILE, '.env'), 'utf8'))[1].trim();
fs.mkdirSync(OUT, { recursive: true });
execSync(`"${path.join(MOBILE, 'node_modules/.bin/tsc')}" "${path.join(MOBILE, 'src/domain/voiceGrammar.ts')}" --outDir "${path.join(OUT, 'lib')}" --module commonjs --target es2020 --skipLibCheck`);
const { parseVoiceAnswer } = require(path.join(OUT, 'lib/voiceGrammar.js'));

const EARS = ['openai:gpt-transcribe', 'openai:gpt-4o-transcribe', 'openai:gpt-4o-mini-transcribe'];
// Men and women, so the ear is scored on both — the speakers are never the coach's voice.
const SPEAKERS = ['openai:gpt-4o-mini-tts:onyx', 'openai:gpt-4o-mini-tts:cedar', 'openai:gpt-4o-mini-tts:nova', 'openai:gpt-4o-mini-tts:ballad'];
const VOICES = ['openai:gpt-4o-mini-tts:marin', 'openai:gpt-4o-mini-tts:coral', 'openai:gpt-4o-mini-tts:sage', 'openai:gpt-4o-mini-tts:shimmer', 'openai:gpt-4o-mini-tts:nova'];
const ANSWERS = [
  ['מוכן', 'ready'], ['כן', 'ready'], ['לא', 'reps'], ['עוד רגע', 'reps'], ['סיימתי', 'reps'], ['כמו שכתוב', 'reps'],
  ['שש', 'reps'], ['שמונה', 'reps'], ['תשע', 'reps'], ['עשר', 'reps'], ['אחת עשרה', 'reps'], ['שתים עשרה', 'reps'],
  ['חמש עשרה', 'reps'], ['עשרים', 'reps'], ['עשר חזרות', 'reps'], ['ארבעים וחמש קילו', 'reps'], ['שישים, שמונה', 'reps'],
  ['ארבעים ושתיים וחצי קילו, עשר', 'reps'], ['לא, תשע', 'reps'], ['תשע, לא, עשר', 'reps'], ['עשר ושמונה', 'reps'],
  ['קל יותר', 'ready'], ['לא יודע', 'ready'], ['עצור', 'reps'], ['המשך', 'resume'],
];
const LINES = [
  'לחיצת חזה במוט. שישים קילו: המוט עשרים קילו, ועשרים קילו בכל צד. שמונה עד עשר חזרות. כשהמוט טעון, תגיד: מוכן.',
  'קדימה.',
  'סיימת את הסט? כמה חזרות עשית?',
  'שישים ושתיים וחצי קילו, עשר חזרות. נרשם.',
  'מעולה, יותר מהטווח. בסט הבא נעלה לשישים ושתיים וחצי קילו: תוסיף קילו ורבע בכל צד.',
  'מנוחה: דקה וחצי.',
  'עוד עשר שניות.',
  'סיימת עם לחיצת חזה במוט. התרגיל הבא: חתירה בפולי בישיבה, ארבעים וחמישה קילו. מנוחה: שתי דקות.',
  'כל הכבוד. סיימת את האימון: שישה תרגילים, ארבעים ושתיים דקות, ושיא אישי חדש. הסיכום מחכה בטלפון.',
];

async function post(route, body, headers) {
  const t0 = Date.now();
  const res = await fetch(BASE + route, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hush-token': TOKEN, ...headers }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, ms: Date.now() - t0, ...j };
}
const say = (text, voice) => post('/voice/say', { text, lang: 'he' }, { 'x-probe-voice': voice });
const hear = (wav, ear, expect) => post('/voice/hear', { audio: wav.toString('base64'), expect, lang: 'he' }, { 'x-probe-ear': ear });

// ── audio ─────────────────────────────────────────────────────────────────────────────────────────
function readWav(buf) {
  let o = 12, rate = 24000, ch = 1, data = null;
  while (o + 8 <= buf.length) {
    const id = buf.toString('ascii', o, o + 4);
    let size = buf.readUInt32LE(o + 4);
    if (id === 'fmt ') { ch = buf.readUInt16LE(o + 10); rate = buf.readUInt32LE(o + 12); }
    if (id === 'data') { if (size === 0xffffffff || o + 8 + size > buf.length) size = buf.length - o - 8; data = buf.subarray(o + 8, o + 8 + size); break; }
    o += 8 + size + (size % 2);
  }
  const n = Math.floor(data.length / 2 / ch);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = data.readInt16LE(i * 2 * ch) / 32768;
  return { rate, x };
}
function writeWav(x, rate) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  return b;
}
function resample(x, from, to) {
  const n = Math.floor(x.length * to / from), y = new Float32Array(n), r = from / to;
  for (let i = 0; i < n; i++) { const c = i * r, a = Math.floor(c), b = Math.min(x.length - 1, Math.ceil(c + r)); let s = 0, k = 0; for (let j = a; j <= b; j++) { s += x[j]; k++; } y[i] = s / k; }
  return y;
}
const rms = (x) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / Math.max(1, x.length));
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
/** A gym: a 120 BPM track (kick, hats, bass, pad), other people talking, and air. */
function gymNoise(n, rate, babble) {
  const y = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate, beat = t % 0.5, hat = t % 0.25;
    const kick = Math.sin(2 * Math.PI * 55 * beat) * Math.exp(-beat / 0.12);
    const hats = (rnd() * 2 - 1) * Math.exp(-hat / 0.02) * 0.3;
    const bass = Math.sin(2 * Math.PI * (Math.floor(t / 2) % 2 ? 82 : 110) * t) * 0.35;
    const pad = (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277 * t) + Math.sin(2 * Math.PI * 330 * t)) * 0.12 * (0.7 + 0.3 * Math.sin(t));
    const w = rnd() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527;
    const pink = (b0 + b1 + b2 + w * 0.1848) * 0.05;
    let talk = 0;
    for (let k = 0; k < babble.length; k++) talk += babble[k][(i + k * 7919) % babble[k].length] * 0.5;
    y[i] = (kick + hats + bass + pad) * 0.5 + talk * 0.6 + pink;
  }
  return y;
}
function lowpass(x, rate, fc) {
  const w = 2 * Math.PI * fc / rate, q = 0.707, a = Math.sin(w) / (2 * q), cw = Math.cos(w);
  const b0 = (1 - cw) / 2, b1 = 1 - cw, b2 = (1 - cw) / 2, a0 = 1 + a, a1 = -2 * cw, a2 = 1 - a;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
function room(speech, rate, kind, babble) {
  const pad = Math.round(rate * 0.6);
  const s = new Float32Array(speech.length + pad * 2);
  s.set(speech, pad);
  if (kind === 'clean') return s;
  const snr = kind === 'gym+5' ? 5 : kind === 'gym0' ? 0 : 3;
  const noise = gymNoise(s.length, rate, babble);
  const k = rms(speech) / (rms(noise) * Math.pow(10, snr / 20));
  let mix = s.map((v, i) => v + noise[i] * k);
  if (kind === 'pocket') mix = lowpass(lowpass(mix, rate, 2200), rate, 2200).map((v) => v * 0.5);
  const peak = mix.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  return peak > 0.95 ? mix.map((v) => v * 0.95 / peak) : mix;
}
const same = (a, b) => JSON.stringify(parseVoiceAnswer(a)) === JSON.stringify(parseVoiceAnswer(b));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
async function pool(items, n, f) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await f(items[k], k); } })); return out; }

(async () => {
  // 1 · the speakers say the answers (16 kHz, as the phone sends them).
  const clips = [];
  await pool(SPEAKERS.flatMap((sp) => ANSWERS.map(([text, expect]) => ({ sp, text, expect }))), 6, async (c) => {
    const r = await say(c.text, c.sp);
    if (!r.audio) return console.log('say failed', c.sp, c.text, r.status, r.why);
    const w = readWav(Buffer.from(r.audio, 'base64'));
    clips.push({ ...c, x: resample(w.x, w.rate, 16000) });
  });
  const babble = [];
  for (const t of ['אתה יודע מה קרה אתמול במשחק? זה היה פשוט מטורף, לא האמנתי', 'תביא לי את המשקולות של העשרים, אני צריך עוד סט אחד']) {
    const r = await say(t, 'openai:gpt-4o-mini-tts:echo');
    if (r.audio) { const w = readWav(Buffer.from(r.audio, 'base64')); babble.push(resample(w.x, w.rate, 16000)); }
  }
  if (babble.length === 0) babble.push(new Float32Array(16000));
  // 2 · every ear, every room.
  const rooms = ['clean', 'gym+5', 'gym0', 'pocket'];
  const results = [];
  const jobs = [];
  for (const c of clips) for (const kind of rooms) jobs.push({ c, kind, wav: writeWav(room(c.x, 16000, kind, babble), 16000) });
  fs.mkdirSync(path.join(OUT, 'rooms'), { recursive: true });
  jobs.slice(0, 8).forEach((j, i) => fs.writeFileSync(path.join(OUT, 'rooms', `${i}-${j.kind}.wav`), j.wav));
  await pool(jobs.flatMap((j) => EARS.map((ear) => ({ ...j, ear }))), 8, async (j) => {
    const r = await hear(j.wav, j.ear, j.c.expect);
    results.push({ ear: j.ear, room: j.kind, speaker: j.c.sp, said: j.c.text, heard: r.text ?? null, ok: r.text != null && same(r.text, j.c.text), ms: r.ms, error: r.text == null ? `${r.status}:${r.why ?? r.error}` : null });
  });
  const table = {};
  for (const ear of EARS) {
    table[ear] = {};
    for (const kind of rooms) {
      const rs = results.filter((r) => r.ear === ear && r.room === kind);
      table[ear][kind] = { right: rs.filter((r) => r.ok).length, of: rs.length, medianMs: median(rs.map((r) => r.ms)) };
    }
  }
  // 3 · the voices say the coach's lines.
  const voices = [];
  for (const v of VOICES) {
    const dir = path.join(OUT, 'voices', v.replace(/:/g, '_'));
    fs.mkdirSync(dir, { recursive: true });
    const ms = [];
    for (const [i, line] of LINES.entries()) {
      const r = await say(line, v);
      if (!r.audio) { console.log('voice failed', v, r.status, r.why); continue; }
      ms.push(r.ms);
      fs.writeFileSync(path.join(dir, `${i + 1}.wav`), Buffer.from(r.audio, 'base64'));
    }
    voices.push({ voice: v, lines: ms.length, medianMs: median(ms) });
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ table, voices, results }, null, 2));
  console.log(JSON.stringify({ table, voices }, null, 2));
  const misses = results.filter((r) => !r.ok && r.heard != null).slice(0, 40);
  console.log('sample misses:', misses.map((m) => `${m.ear} ${m.room}: "${m.said}" → "${m.heard}"`).join('\n'));
})();
