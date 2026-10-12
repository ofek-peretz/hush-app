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
 * to ask a probe preview for a voice the shipping Worker would refuse (another model, a dated snapshot).
 *
 * For each returned WAV: the median pitch of its voiced frames (autocorrelation, 70–400 Hz). An adult
 * woman's speaking pitch sits around 165–255 Hz, a man's around 85–155 — a clip of a "female" voice
 * with a median near 110 Hz is a man, whatever it was asked to be. The files are kept in out-dir so
 * a person can listen to the ones the numbers point at.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
const fs = require('node:fs');
const path = require('node:path');

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

/** 16-bit PCM out of a RIFF WAV — tolerant of a streamed header whose sizes were never filled in. */
function pcm(buf) {
  let rate = 24000;
  let channels = 1;
  let at = 12;
  while (at + 8 <= buf.length) {
    const id = buf.toString('ascii', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(at + 10);
      rate = buf.readUInt32LE(at + 12);
    }
    if (id === 'data') {
      const end = size === 0xffffffff || at + 8 + size > buf.length ? buf.length : at + 8 + size;
      const n = Math.floor((end - at - 8) / 2 / channels);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(at + 8 + i * 2 * channels) / 32768;
      return { rate, samples: out };
    }
    at += 8 + size + (size % 2);
  }
  return { rate, samples: new Float32Array(0) };
}

/** Median pitch (Hz) of the voiced frames, how many there were, and the clip's length in seconds. */
function pitch({ rate, samples }) {
  const win = Math.round(rate * 0.04);
  const hop = Math.round(rate * 0.01);
  const lo = Math.floor(rate / 400);
  const hi = Math.ceil(rate / 70);
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const f0s = [];
  for (let s = 0; s + win + hi < samples.length; s += hop) {
    let e = 0;
    for (let i = 0; i < win; i++) e += samples[s + i] * samples[s + i];
    if (Math.sqrt(e / win) < peak * 0.08) continue; // silence, or a consonant's hiss
    // normalised autocorrelation over the lags a human voice can have
    const r = new Float32Array(hi + 1);
    let best = 0;
    for (let lag = lo; lag <= hi; lag++) {
      let num = 0;
      let d2 = 0;
      for (let i = 0; i < win; i++) {
        num += samples[s + i] * samples[s + i + lag];
        d2 += samples[s + i + lag] * samples[s + i + lag];
      }
      r[lag] = num / Math.sqrt(e * d2 + 1e-12);
      if (r[lag] > best) best = r[lag];
    }
    if (best < 0.6) continue; // not voiced
    // the FIRST strong peak, not the strongest: twice the period correlates as well, and is an octave down
    for (let lag = lo + 1; lag < hi; lag++) {
      if (r[lag] >= best * 0.9 && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) {
        f0s.push(rate / lag);
        break;
      }
    }
  }
  f0s.sort((a, b) => a - b);
  const q = (p) => (f0s.length ? f0s[Math.min(f0s.length - 1, Math.floor(f0s.length * p))] : 0);
  return { hz: Math.round(q(0.5)), low: Math.round(q(0.1)), high: Math.round(q(0.9)), voiced: f0s.length, seconds: samples.length / rate };
}

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
  return { ok: true, wav: Buffer.from(String(body.audio ?? ''), 'base64'), voice: body.voice, ms: Date.now() - t0 };
}

(async () => {
  // DRIFT_ANALYZE=1: no asking — read the files a run already left in out-dir (a run cut short keeps its clips).
  if (process.env.DRIFT_ANALYZE === '1') {
    const found = fs.readdirSync(OUT).filter((f) => f.endsWith('.wav')).map((f) => ({ f, m: /^(.*)-line(\d+)-run(\d+)\.wav$/.exec(f) })).filter((x) => x.m);
    const got = found.map(({ f, m }) => ({ voice: m[1], line: Number(m[2]), run: Number(m[3]), file: f, ...pitch(pcm(fs.readFileSync(path.join(OUT, f)))) }));
    for (const voice of [...new Set(got.map((r) => r.voice))]) {
      for (const line of [...new Set(got.filter((r) => r.voice === voice).map((r) => r.line))].sort((a, b) => a - b)) {
        const hz = got.filter((r) => r.voice === voice && r.line === line && r.voiced >= 5).map((r) => r.hz).sort((a, b) => a - b);
        console.log(`${voice} line ${line}  n ${hz.length}  pitch ${hz[0]}–${hz[hz.length - 1]} Hz  median ${hz[Math.floor(hz.length / 2)]}  under 150: ${hz.filter((h) => h < 150).length}  [${hz.join(' ')}]`);
      }
    }
    fs.writeFileSync(path.join(OUT, 'pitch.json'), JSON.stringify(got, null, 1));
    return;
  }
  if (!BASE || !TOKEN) throw new Error('code/mobile/.env has no coach URL / token');
  fs.mkdirSync(OUT, { recursive: true });
  const rows = [];
  const fails = [];
  for (const voice of VOICES) {
    const name = voice.split(':').slice(1).join('-');
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
        const p = pitch(pcm(r.wav));
        rows.push({ voice: name, line: li, run, file, ...p, ms: r.ms });
        cells.push(`${p.hz}`);
        await sleep(GAP_MS);
      }
      console.log(`${name.padEnd(8)} line ${li}  median pitch per ask (Hz): ${cells.join('  ')}`);
    }
  }
  fs.writeFileSync(path.join(OUT, 'pitch.json'), JSON.stringify(rows, null, 1));
  for (const voice of VOICES) {
    const name = voice.split(':').slice(1).join('-');
    const mine = rows.filter((r) => r.voice === name && r.voiced >= 5);
    const hz = mine.map((r) => r.hz).sort((a, b) => a - b);
    if (!hz.length) continue;
    const mid = hz[Math.floor(hz.length / 2)];
    const men = mine.filter((r) => r.hz < 150);
    const far = mine.filter((r) => Math.abs(r.hz - mid) > mid * 0.2);
    // What the phone lives with: a line is waited on for four seconds, and then Carmit says it.
    const all = rows.filter((r) => r.voice === name);
    const lost = fails.filter((f) => f.voice === name).length;
    const ms = all.map((r) => r.ms).sort((a, b) => a - b);
    const late = all.filter((r) => r.ms > 4000).length;
    const asked = all.length + lost;
    console.log(`\n${name}: asked ${asked} · never came ${lost} · came after 4 s ${late} → ${Math.round(((lost + late) / asked) * 100)}% of new lines are the phone's own voice · latency median ${ms[Math.floor(ms.length / 2)]} ms, p90 ${ms[Math.floor(ms.length * 0.9)]} ms`);
    console.log(`   ${mine.length} clips · pitch ${hz[0]}–${hz[hz.length - 1]} Hz, median ${mid} · under 150 Hz (a man's range): ${men.length} · more than 20% from the median: ${far.length}`);
    for (const r of far) console.log(`   ${path.basename(r.file)}  ${r.hz} Hz  (${r.low}–${r.high}, ${r.seconds.toFixed(1)} s)`);
  }
})().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
