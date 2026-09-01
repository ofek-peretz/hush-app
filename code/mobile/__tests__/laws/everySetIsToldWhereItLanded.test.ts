/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A SET IS CAPTURED, NEVER JUDGED, IN SESSION — the successor law (founder, 2026-08-26).
 *
 * This file used to be "every set is told where it landed": the band with a dot, three coloured
 * outcomes, the correction reveal. The founder's ruling inverted the doctrine at its root:
 *
 *   *"בזמן האימון המתאמן רק רושם ומתעד את הביצועים שלו… לבטל את כל החלק הזה של אם הוא נפל בפנים
 *   או מחוץ לטווח… החלק החשוב ביותר הוא לאחר האימון איזה החלטות מתקבלות."*
 *
 * Mid-workout she is a LOGGER — tired, loaded, non-compliant — and the app that respects that is
 * the one she keeps. So the beat after a set is the RECORD, at stage size, and the verdicts moved
 * to where the coach now lives: after the session, in the decisions door, each with its reason
 * (`engineChanges`, Loop 2). This law pins the inversion so it cannot silently un-invert:
 *
 *   1. EVERY working set gets the capture beat, through the one shared predicate; a warm-up
 *      bridge never does (`theBridgeLogsInSilence` holds the bridge half).
 *   2. The capture carries HER figures — the reps she actually did (the dials made that number
 *      honest) with the weight beside them — at a scale read across a gym.
 *   3. NO verdict machinery survives on the session surfaces: no band placement, no landed copy,
 *      no eased/raised chrome, no correction reveal.
 *   4. The dwell and the wrist ask the SAME predicate the render guard asks — the three askers
 *      answering separately is how the 2026-08-16 flash bugs happened, and that lesson outlives
 *      the band it was learned on.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';
import { beatSpeaksFor } from '@/screens/session/SessionFlow';

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const flow = () => read('src/screens/session/SessionFlow.tsx');

const working = { weight: 34, reps: 9, n: 2, m: 4, band: [8, 10] };

describe('1 · every working set gets the capture', () => {
  it('banded, band-less, mid-lift, last set, record — all speak', () => {
    expect(beatSpeaksFor(working, null)).toBe(true);
    expect(beatSpeaksFor({ ...working, band: undefined }, null)).toBe(true);
    expect(beatSpeaksFor({ ...working, n: 4, m: 4 }, null)).toBe(true);
    expect(beatSpeaksFor({ ...working, record: true }, null)).toBe(true);
  });

  it('a warm-up bridge never does, whatever it wears', () => {
    expect(beatSpeaksFor({ ...working, warmup: true }, null)).toBe(false);
    expect(beatSpeaksFor({ ...working, warmup: true, record: true, n: 4, m: 4 }, null)).toBe(false);
  });
});

describe('2 · the capture carries her figures at stage scale', () => {
  it('the beat draws the reps she did with the weight beside them', () => {
    const f = flow();
    expect(f).toContain('function LoggedCapture');
    expect(f).toContain('confirm.reps');
    expect(f).toContain('styles.capFigures');
  });

  it('at a size read across a gym — the capture is not a caption', () => {
    const m = /capFigures:\s*\{[^}]*fontSize:\s*(\d+)/.exec(flow());
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(56);
  });
});

describe('3 · no verdict machinery survives in session', () => {
  it('the band instrument, the landed copy and the correction reveal are gone from the stage', () => {
    const f = flow();
    /* Function-level probes — the words may survive in history comments; the MACHINERY may not. */
    for (const dead of ['function BandMark', 'function CorrectionBeat', 'bandPlacement(', 'landedInside', 'easedForYou', 'raisedForYou', 'setBeatCorrection']) {
      expect({ dead, present: f.includes(dead) }).toEqual({ dead, present: false });
    }
  });

  it('and the store logs the set without judging it — carry only', () => {
    const store = read('src/state/stores/sessionStore.tsx');
    expect(store).not.toContain('applyLoop1(');
    expect(store).toContain('carryWeightForward(plan, current.globalIndex');
    expect(store).toContain('LOOP 1 NO LONGER TOUCHES THE IRON');
  });

  it('the verdicts live AFTER the session — the decisions door still explains every change', () => {
    // Loop 2 concludes between sessions and `engineChanges` carries each decision with its reason
    // to the WellDone door — the coach the ruling promised in place of the mid-set referee.
    expect(fs.existsSync(path.join(ROOT, 'src/domain/engineChanges.ts'))).toBe(true);
    expect(read('src/screens/session/WellDone.tsx')).toMatch(/decision/i);
  });
});

describe('4 · one predicate, all three askers', () => {
  it('the dwell asks it exactly as the render guard does', () => {
    /*
     * ⚠️ THE PREDICATE IS THE SUBJECT HERE, NOT THE CONSTANT. On 2026-08-26 the lift-close grew an
     * animation (`SetRing` — the last arc sweeping, then the bloom leaving the ring), so the two
     * beats no longer hold the stage for the same length of time and the ternary picks between
     * them. What must never change is the GUARD: `beatSpeaksFor(confirm, null)` decides whether
     * there is a dwell at all, exactly as the render guard decides whether there is a beat at all.
     * The 2026-08-16 flash bugs were three askers answering apart; a second dwell VALUE is not a
     * second asker.
     */
    expect(flow()).toContain('beatSpeaksFor(confirm, null) ? (closesTheLift(confirm) ? LIFT_DONE_DWELL_MS : CONFIRM_DWELL_MS) : 0');
    /* And the beat and the dwell ask ONE question about which of the two is up — the same shape of
       mistake, one level down, is what `closesTheLift` exists to make impossible. */
    expect(flow()).toContain('function closesTheLift(');
    expect(flow()).toContain('if (closesTheLift(confirm)) {');
  });

  it('…and so does the wrist, which is where the divergence was visible', () => {
    expect(flow()).toContain('if (!beatSpeaksFor(beat, null)) return;');
  });
});
