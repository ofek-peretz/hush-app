/**
 * ════ THE BRIDGE LOGS IN SILENCE (eye-pass 2026-08-26) ════
 *
 * A warm-up set is a bridge, not a measurement (`theWarmupIsABridgeNotAMeasurement` holds that
 * for the ENGINE; this holds it for the STAGE). Found live: the beat after a bridge read
 * **"סט 1 נחת בתוך הטווח שלך · 25 kg נשאר לסט הבא"** — a verdict against the bridge's own [3,3]
 * band, and a promise that the load "stays" while the very next set was the working 37.5. An
 * athlete reading that leaves the warm-up plates on the bar.
 *
 * `beatSpeaksFor` is the ONE predicate all three askers share (render guard, dwell timer, wrist
 * replay) — unified here precisely because the askers answering separately is how the in-band
 * flash (2026-08-16) and the record-flash happened. This law pins:
 *   · a warm-up confirm NEVER speaks, whatever else it carries;
 *   · each of the three working-set cases (last set, band, record) still speaks;
 *   · the collapsed-band figure prints "3", never "3–3".
 */
// @ts-nocheck

import fs from 'fs';
import path from 'path';
import { beatSpeaksFor } from '@/screens/session/SessionFlow';

const working = { weight: 37.5, reps: 8, n: 1, m: 3, band: [8, 10] };

describe('the warm-up bridge never speaks', () => {
  it('a bridge is silent even wearing a band, a record flag, or a last-set shape', () => {
    expect(beatSpeaksFor({ ...working, warmup: true }, null)).toBe(false);
    expect(beatSpeaksFor({ weight: 25, reps: 3, n: 1, m: 1, band: [3, 3], warmup: true }, null)).toBe(false);
    expect(beatSpeaksFor({ ...working, n: 3, m: 3, record: true, warmup: true }, null)).toBe(false);
  });

  it('every working set speaks — the capture is the beat (2026-08-26), through the ONE predicate', () => {
    expect(beatSpeaksFor(working, null)).toBe(true); // in her band
    expect(beatSpeaksFor({ ...working, band: undefined, n: 3, m: 3 }, null)).toBe(true); // lift done
    expect(beatSpeaksFor({ ...working, band: undefined, record: true }, null)).toBe(true); // a record on a band-less step
    /* The old fourth state — a band-less mid-lift set going straight to rest — is gone with the
       verdicts: a logger's beat is the record, and every working set has one. */
    expect(beatSpeaksFor({ ...working, band: undefined }, null)).toBe(true);
    expect(beatSpeaksFor(null, null)).toBe(false);
  });
});

describe('a collapsed band is one number', () => {
  it('the reps heading never prints "3–3" — the collapse rule rides the heading now', () => {
    /* The band mark is gone (2026-08-26); the band lives in the reps HEADING, and the degenerate
       warm-up band must still collapse to silence there rather than print "3–3". */
    const flow = fs.readFileSync(path.join(__dirname, '..', '..', 'src/screens/session/SessionFlow.tsx'), 'utf8');
    expect(flow).toContain("bandLo === bandHi ? '' :");
  });
});
