/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * HOW HIGH A CLIP SPEAKS (2026-10-12) — the one thing this Worker can hear.
 *
 * Founder, build 79: *"זה בוודאות לא נאמר באותו הקול. היה גם פעם אחת את הקול של כרמית ופעם אחת את הקול
 * של נקבה של OpenAI ופעם אחת היה קול של גבר ונראה לי גם הוא מ-OpenAI."*
 *
 * Every coach line is its own request to the voice model, and the model does not hold a voice from
 * one request to the next: 175 clips of one named voice measured between 96 and 253 Hz, the same
 * word between 166 and 250 (`server/voiceDrift.cjs` is the instrument). So `voice.ts` asks for a
 * short line more than once and keeps the take nearest the voice's own pitch — and this is the ear
 * it chooses with.
 *
 * The pitch of a clip is the median over its voiced frames of the autocorrelation period, on a
 * signal brought down to about 4 kHz (a fundamental and its first harmonics live well below that,
 * and it is what keeps this to well under a millisecond of CPU a clip). TWO readings come back:
 *
 *   · `hz`     — the FIRST strong peak of each frame. Twice the period correlates as well as the
 *                period, and the strongest peak is sometimes that octave below.
 *   · `strong` — the STRONGEST peak of each frame (or a shorter period that is its equal). The
 *                man's clip read 224 Hz by first peak in a third of its frames, and 88–100 Hz by
 *                strongest peak in every one.
 *
 * A clip is as far from a voice as its WORSE reading says — that is the caller's rule, and why both
 * are here. `voiced` is how many frames were measured: under a handful, the clip is too short or
 * too quiet to judge, and a clip that cannot be judged is never refused for it.
 *
 * Pure arithmetic: no network, no globals, the same in a Worker and under `node --test`.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface ClipPitch {
  /** Median pitch by the first strong peak, Hz — 0 when nothing was voiced. */
  hz: number;
  /** Median pitch by the strongest peak, Hz — 0 when nothing was voiced. */
  strong: number;
  /** Frames measured (20 ms apart). */
  voiced: number;
  /** The clip's whole length. */
  seconds: number;
}

const NOTHING: ClipPitch = { hz: 0, strong: 0, voiced: 0, seconds: 0 };

/** The rate the pitch is read at. */
const TARGET_RATE = 4_000;
/** No more than this much of a clip is read — a median needs seconds, not a whole loading dialogue. */
const MAX_SECONDS = 6;
/** A human voice: nothing below 70 Hz or above 400 is looked for. */
const LOW_HZ = 70;
const HIGH_HZ = 400;
/** A frame quieter than this share of the clip's peak is a pause, or a consonant's hiss. */
const QUIET = 0.08;
/** A frame whose best period correlates less than this is not voiced. */
const VOICED = 0.6;
/** A shorter period that correlates this close to the best one IS the period. */
const NEAR_BEST = 0.9;
/**
 * …and for the strongest-peak reading, only a shorter period that is the best one's EQUAL: a steady
 * voice correlates at twice its period exactly as well as at its period, and which of the two is
 * "strongest" is then rounding. (The man's false 224 Hz peaks were 0.9 of his best, never its equal.)
 */
const EQUAL_BEST = 0.97;

/** 16-bit PCM out of a RIFF WAV — tolerant of a streamed header whose sizes were never filled in. */
function samplesOf(wav: Uint8Array): { rate: number; x: Float32Array } | null {
  if (wav.length < 44) return null;
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const tag = (o: number) => String.fromCharCode(wav[o], wav[o + 1], wav[o + 2], wav[o + 3]);
  if (tag(0) !== 'RIFF') return null;
  let rate = 24_000;
  let channels = 1;
  let bits = 16;
  let at = 12;
  while (at + 8 <= wav.length) {
    const id = tag(at);
    const size = v.getUint32(at + 4, true);
    if (id === 'fmt ' && at + 24 <= wav.length) {
      channels = v.getUint16(at + 10, true) || 1;
      rate = v.getUint32(at + 12, true) || rate;
      bits = v.getUint16(at + 22, true) || bits;
    }
    if (id === 'data') {
      if (bits !== 16) return null;
      const start = at + 8;
      const end = size === 0xffffffff || start + size > wav.length ? wav.length : start + size;
      const step = 2 * channels;
      const n = Math.max(0, Math.floor((end - start) / step));
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = v.getInt16(start + i * step, true) / 32768;
      return { rate, x };
    }
    at += 8 + size + (size % 2);
  }
  return null;
}

/** Averaged twice over `d` samples (a triangle — enough of a low-pass for a pitch), then every d-th kept. */
function broughtDown(x: Float32Array, d: number): Float32Array {
  if (d <= 1) return x;
  const n = x.length;
  const sum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) sum[i + 1] = sum[i] + x[i];
  const once = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const end = Math.min(n, i + d);
    once[i + 1] = once[i] + (sum[end] - sum[i]) / d;
  }
  const out = new Float32Array(Math.floor(n / d));
  for (let k = 0; k < out.length; k++) {
    const from = k * d;
    const end = Math.min(n, from + d);
    out[k] = (once[end] - once[from]) / d;
  }
  return out;
}

const median = (v: number[]): number => {
  if (v.length === 0) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export function wavPitch(wav: Uint8Array): ClipPitch {
  const pcm = samplesOf(wav);
  if (!pcm || pcm.x.length === 0) return NOTHING;
  const seconds = pcm.x.length / pcm.rate;
  const head = pcm.x.length > pcm.rate * MAX_SECONDS ? pcm.x.subarray(0, pcm.rate * MAX_SECONDS) : pcm.x;
  const d = Math.max(1, Math.round(pcm.rate / TARGET_RATE));
  const x = broughtDown(head, d);
  const rate = pcm.rate / d;
  const win = Math.round(rate * 0.04);
  const hop = Math.round(rate * 0.02);
  const lo = Math.max(2, Math.floor(rate / HIGH_HZ));
  const hi = Math.ceil(rate / LOW_HZ);
  if (x.length < win + hi + 1) return { ...NOTHING, seconds };

  let peak = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i] < 0 ? -x[i] : x[i];
    if (a > peak) peak = a;
  }
  if (peak === 0) return { ...NOTHING, seconds };
  // Σ x² up to each sample: a window's energy at any lag is two reads.
  const sq = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) sq[i + 1] = sq[i] + x[i] * x[i];
  const quiet = peak * QUIET;

  const firsts: number[] = [];
  const strongs: number[] = [];
  const r = new Float64Array(hi + 2);
  // Where the peak really is between two lags — a parabola through it and its neighbours.
  const fine = (lag: number): number => {
    const a = r[lag - 1];
    const b = r[lag];
    const c = r[lag + 1];
    const bend = a - 2 * b + c;
    const shift = bend < 0 ? (0.5 * (a - c)) / bend : 0;
    return rate / (lag + (shift > 0.5 ? 0.5 : shift < -0.5 ? -0.5 : shift));
  };
  for (let s = 0; s + win + hi + 1 < x.length; s += hop) {
    const e = sq[s + win] - sq[s];
    if (Math.sqrt(e / win) < quiet) continue;
    let best = 0;
    let bestLag = 0;
    for (let lag = lo - 1; lag <= hi + 1; lag++) {
      let num = 0;
      for (let i = 0; i < win; i++) num += x[s + i] * x[s + i + lag];
      r[lag] = num / Math.sqrt(e * (sq[s + win + lag] - sq[s + lag]) + 1e-12);
      if (lag >= lo && lag <= hi && r[lag] > best) {
        best = r[lag];
        bestLag = lag;
      }
    }
    if (best < VOICED) continue;
    let first = bestLag;
    let strong = bestLag;
    for (let lag = lo; lag < bestLag; lag++) {
      if (r[lag] < r[lag - 1] || r[lag] < r[lag + 1]) continue; // not a peak
      if (first === bestLag && r[lag] >= best * NEAR_BEST) first = lag;
      if (r[lag] >= best * EQUAL_BEST) {
        strong = lag;
        break;
      }
    }
    firsts.push(fine(first));
    strongs.push(fine(strong));
  }
  return { hz: Math.round(median(firsts)), strong: Math.round(median(strongs)), voiced: firsts.length, seconds };
}
