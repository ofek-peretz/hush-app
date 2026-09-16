/**
 * The sync trace, read. (2026-09-17)
 *
 *   node scripts/sync-report.cjs <posthog-export.json|csv-free json lines>
 *
 * Input: `sync_trace` events as exported from PostHog (an array, or one JSON object per line), each
 * with `properties.d_trace`, `d_part`, `d_i`, `d_n`, `d_c`. Output: for every trace, the numbers the
 * founder's device test is for — how late each frame reached the wrist, how far the wrist's buzz
 * landed from the rest's end, how long iOS took to take a Live Activity update, how late lock-screen
 * and wrist taps were acted on. Pure: `analyse(text)` is exported for the test.
 */
'use strict';

function reassemble(events) {
  const traces = new Map();
  for (const ev of events) {
    const p = ev.properties ?? ev;
    const id = p.d_trace ?? p.trace;
    if (id == null) continue;
    const part = Number(p.d_part ?? p.part);
    const i = Number(p.d_i ?? p.i);
    const n = Number(p.d_n ?? p.n);
    const c = String(p.d_c ?? p.c ?? '');
    if (!traces.has(id)) traces.set(id, new Map());
    const parts = traces.get(id);
    if (!parts.has(part)) parts.set(part, { n, pieces: new Map() });
    parts.get(part).pieces.set(i, c);
  }
  const out = new Map();
  for (const [id, parts] of traces) {
    const texts = [];
    const missing = [];
    for (const part of [...parts.keys()].sort((a, b) => a - b)) {
      const { n, pieces } = parts.get(part);
      let text = '';
      for (let i = 0; i < n; i++) {
        if (!pieces.has(i)) missing.push(`${part}.${i}`);
        text += pieces.get(i) ?? '';
      }
      texts.push(text);
    }
    out.set(id, { texts, missing });
  }
  return out;
}

/** Rows of one or more shipped parts, on ONE absolute timeline (each part carries its own base). */
function rowsOf(texts) {
  const rows = [];
  for (const text of texts) {
    const lines = text.split('\n');
    const head = lines.shift() ?? '';
    const base = Number(head.split('|')[1]);
    for (const line of lines) {
      const [t, k, ...f] = line.split('|');
      if (!k) continue;
      rows.push({ at: base + Number(t), k, f, base });
    }
  }
  return rows.sort((a, b) => a.at - b.at);
}

const abs = (row, v) => (v === '' || v == null ? null : row.base + Number(v));

function stats(xs) {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return { n: v.length, median: q(0.5), p90: q(0.9), max: v[v.length - 1] };
}

function analyse(texts) {
  const rows = rowsOf(texts);
  const published = new Map(); // seq → {at, phase, end}
  const delivery = [];
  const undelivered = [];
  const buzz = [];
  const laAsk = [];
  const laLatency = [];
  const laFailed = [];
  const wristLate = [];
  const wristRefused = [];
  const lockLate = [];
  const alertVsWrist = [];
  let lastEnd = null;
  let pendingLa = [];
  for (const r of rows) {
    switch (r.k) {
      case 'P': {
        const [seq, phase, , end, ok] = r.f;
        published.set(Number(seq), { at: r.at, phase, end: abs(r, end), ok: ok === '1' });
        if (end !== '') lastEnd = abs(r, end);
        break;
      }
      case 'R': {
        const [seq, got] = r.f;
        const p = published.get(Number(seq));
        if (p) delivery.push(abs(r, got) - p.at);
        break;
      }
      case 'H': {
        const [offset, fired, intended] = r.f;
        buzz.push({ offsetS: Number(offset), lateMs: abs(r, fired) - abs(r, intended), intended: abs(r, intended) });
        break;
      }
      case 'L':
        pendingLa.push(r);
        laAsk.push(r);
        break;
      case 'l': {
        const ask = pendingLa.shift();
        if (ask) laLatency.push(r.at - ask.at);
        if (r.f[1] === '0') laFailed.push(r.at);
        break;
      }
      case 'W': {
        const [type, issued, accepted, reason] = r.f;
        if (issued !== '') wristLate.push(r.at - abs(r, issued));
        if (accepted !== '1') wristRefused.push(`${type}:${reason}`);
        break;
      }
      case 'K': {
        const [, tapped] = r.f;
        if (tapped !== '') lockLate.push(r.at - abs(r, tapped));
        break;
      }
      case 'A': {
        const [end] = r.f;
        if (lastEnd != null && end !== '') alertVsWrist.push(abs(r, end) - lastEnd);
        break;
      }
      default:
        break;
    }
  }
  for (const [seq, p] of published) {
    if (!rows.some((r) => r.k === 'R' && Number(r.f[0]) === seq)) undelivered.push(seq);
  }
  // The GO beat's truth: did the wrist's buzz at offset 0 land on the rest end the PHONE published?
  const goAgainstPhone = buzz
    .filter((b) => b.offsetS === 0)
    .map((b) => {
      const ends = [...published.values()].map((p) => p.end).filter((e) => e != null);
      const nearest = ends.reduce((best, e) => (best == null || Math.abs(e - b.intended) < Math.abs(best - b.intended) ? e : best), null);
      return nearest == null ? null : b.intended - nearest;
    })
    .filter((x) => x != null);
  return {
    rows: rows.length,
    wristDeliveryMs: stats(delivery),
    framesNeverSeenByWrist: undelivered.length,
    wristBuzzLateMs: stats(buzz.map((b) => b.lateMs)),
    wristGoVsPhoneRestEndMs: stats(goAgainstPhone.map((x) => Math.abs(x))),
    liveActivityUpdateMs: stats(laLatency),
    liveActivityFailures: laFailed.length,
    wristTapToPhoneMs: stats(wristLate),
    wristTapsRefused: wristRefused,
    lockTapToPhoneMs: stats(lockLate),
    phoneAlertVsPublishedEndMs: stats(alertVsWrist.map(Math.abs)),
  };
}

module.exports = { reassemble, rowsOf, analyse };

if (require.main === module) {
  const fs = require('node:fs');
  const raw = fs.readFileSync(process.argv[2], 'utf8').trim();
  const events = raw.startsWith('[') ? JSON.parse(raw) : raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  for (const [id, { texts, missing }] of reassemble(events)) {
    console.log(`\n══ trace ${id} ══${missing.length ? `  (missing pieces: ${missing.join(', ')})` : ''}`);
    console.log(JSON.stringify(analyse(texts), null, 2));
  }
}
