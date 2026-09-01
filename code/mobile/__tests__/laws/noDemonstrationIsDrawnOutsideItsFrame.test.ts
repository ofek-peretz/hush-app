/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * NO DEMONSTRATION IS DRAWN OUTSIDE ITS FRAME — geometry QC, 2026-08-25.
 *
 * The FormSpec validator asks whether the TECHNIQUE is right: angles at the endpoints, the tracked
 * path, the invariants that hold across the rep. It is thorough and it is the reason a rig cannot
 * contradict its own cues. It also cannot see a frame, and it never claimed to.
 *
 * So the calf-raise family shipped with the athlete's head clipped off the top of the media field
 * at the peak of every rep — five rigs, `validate: PASS` on all of them. It is the only family whose
 * athlete rises as a rigid body, the rise is a real 26 units, and authored at canonical standing
 * height the crown reached y ≈ 19.5 against a viewbox that begins at 26. The fix was not a smaller
 * rep: the scene was drawn `DROP` units lower into the ~20 units of unused frame beneath the floor.
 *
 * This law is the second half of "the demonstration is the cues, drawn". The first half is that it
 * must be TRUE (FormSpec). This half is that it must be VISIBLE.
 *
 * ── WHAT IT CHECKS, AND THE TWO THINGS IT DELIBERATELY DOES NOT ─────────────────────────────────
 *   ✓ every DRAWN joint stays inside `VIEWBOX` at 21 samples across the rep, with the head allowed
 *     its own radius so a crown is judged by its edge and not by its centre.
 *
 *   ✗ NOT pseudo-joints. `machine_chest_press` carries `stroke` in its pose — "the validator's
 *     honest depth axis: the true 3D stroke as a measurable pseudo-joint". No chain names it, so
 *     nothing draws it, so its coordinates are a measurement and not a position. Only joints a
 *     chain actually references are judged.
 *
 *   ✗ NOT segment length. The first draft of this check flagged 46 "stretching" bones and every one
 *     was honest: `anthro.ts` states that "a rig may FORESHORTEN a projected segment (a bench-press
 *     humerus abducts into depth, a squat grip rotates out of the side plane) but must document it
 *     against these canonical lengths." A humerus going 17 → 25 across a bench press IS the drawing
 *     telling the truth about depth. A law that forbade it would forbid perspective.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { EXERCISE_MOTION } from '@/motion/registry';
import { VIEWBOX } from '@/motion/frame';

const X0 = VIEWBOX.x;
const X1 = VIEWBOX.x + VIEWBOX.w;
const Y0 = VIEWBOX.y;
const Y1 = VIEWBOX.y + VIEWBOX.h;

/** The joints a rig's chains actually draw — everything else in the pose is measurement. */
function drawnJoints(chains: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  for (const [key, value] of Object.entries(chains)) {
    if (key === 'view') continue;
    if (typeof value === 'string') out.add(value);
    else if (Array.isArray(value)) for (const j of value) if (typeof j === 'string') out.add(j);
  }
  return out;
}

const rigs = Object.entries(EXERCISE_MOTION);

describe('no demonstration is drawn outside its frame', () => {
  it('there are rigs to check', () => {
    expect(rigs.length).toBeGreaterThanOrEqual(42);
  });

  it('⛔ every drawn joint stays inside the media frame, across the whole rep', () => {
    const clipped: string[] = [];
    for (const [id, rig] of rigs) {
      const drawn = drawnJoints(rig.chains);
      for (let i = 0; i <= 20; i++) {
        const rom = i / 20;
        const pose = rig.poseAt(rom);
        const headR = pose.headR ?? 8;
        for (const [name, j] of Object.entries(pose.j)) {
          if (!drawn.has(name) || typeof j?.x !== 'number' || typeof j?.y !== 'number') continue;
          // The head is a disc; every other joint is the centre of a stroke that is much thinner.
          const pad = name === 'head' || name === 'headC' ? headR : 1;
          if (j.x < X0 || j.x > X1 || j.y - pad < Y0 || j.y + pad > Y1) {
            clipped.push(`${id}: ${name} at rom ${rom.toFixed(2)} → (${j.x.toFixed(1)}, ${j.y.toFixed(1)})`);
          }
        }
      }
    }
    // One line per offending rig+joint is enough to act on; the rest is noise.
    const unique = [...new Set(clipped.map((c) => c.split(' at rom')[0]))];
    expect(unique).toEqual([]);
  });

  it('the head in particular clears the top edge — the failure this law was written for', () => {
    const offenders: string[] = [];
    for (const [id, rig] of rigs) {
      for (let i = 0; i <= 20; i++) {
        const pose = rig.poseAt(i / 20);
        const head = pose.j.head ?? pose.j.headC;
        if (!head) continue;
        if (head.y - (pose.headR ?? 8) < Y0) offenders.push(id);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });
});
