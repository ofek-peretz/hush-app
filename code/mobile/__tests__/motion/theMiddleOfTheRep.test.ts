/**
 * THE LAWS THAT ONLY THE MIDDLE OF A REP CAN BREAK.
 *
 * Everything else that guards these clips reads the two ENDS. A FormSpec's `start` and `end`
 * predicates are literally evaluated at rom 0 and rom 1; a reviewer's eye goes to the same two
 * frames because those are the ones the cue names. On 2026-08-29 three separate defects were found
 * living in the gap between them, all of them invisible to every check that existed:
 *
 *   · `landmine_press` ran its elbow 46° → 14° → 165°. Both ends correct, the middle a fold.
 *   · four fly rigs shipped at a 25° azimuth their own file argues against, and the far arm passed
 *     edge-on at rom 0.63 — a 4° drawn hinge, an arm gone missing from the picture.
 *   · the whole supine chest family foreshortened its humerus and not its forearm, which describes
 *     a bar travelling 21 cm toward the feet in a rig that declares a vertical path.
 *
 * The auditor samples 96 frames but only judges CONTINUITY and bone length; it has no opinion about
 * whether a press presses. These tests do. They are cheap, and each one is a shape a rep must have
 * rather than a number a frame must hit.
 */

//

import { ATHLETE } from '@/motion/anthro';
import { EXERCISE_MOTION } from '@/motion/registry';
import { FLAT, project } from '@/motion/camera';
import type { Rig } from '@/motion/types';

const SAMPLES = 64;

/** The interior angle at `b`, AS DRAWN — through the rig's own camera and its own depth. */
function drawnAngle(rig: Rig, rom: number, a: string, b: string, c: string): number {
  const pose = rig.poseAt(rom);
  const cam = rig.camera ?? FLAT;
  const hip = pose.j[rig.chains.torso[0]];
  const sh = pose.j[rig.chains.torso[1]];
  const spine =
    hip && sh && Math.hypot(sh.x - hip.x, sh.y - hip.y) > 1
      ? { x: sh.x - hip.x, y: sh.y - hip.y }
      : { x: 0, y: -1 };
  const c2 = { ...cam, axis: cam.axis ?? spine };
  const g = (n: string) => project(pose.j[n], pose.z?.[n] ?? 0, c2);
  const [pa, pb, pc] = [g(a), g(b), g(c)];
  const u = { x: pa.x - pb.x, y: pa.y - pb.y };
  const w = { x: pc.x - pb.x, y: pc.y - pb.y };
  const du = Math.hypot(u.x, u.y) || 1e-9;
  const dw = Math.hypot(w.x, w.y) || 1e-9;
  return (Math.acos(Math.max(-1, Math.min(1, (u.x * w.x + u.y * w.y) / (du * dw)))) * 180) / Math.PI;
}

describe('a press presses, in every frame of it', () => {
  /*
   * The elbow of a press opens from the rack to the lockout and never turns back. This is not a
   * style rule — an elbow that closes mid-press is teaching the athlete to fold under the weight,
   * and it is exactly what a hand-placed rack position on the wrong side of an arc produced.
   *
   * Tolerance is 1°, not 0: `poseAt` is sampled, not symbolic, and a joint that flattens out for a
   * few frames at the top of a curve may wobble in the last decimal.
   */
  const PRESSES: Array<[string, [string, string, string]]> = [
    ['landmine_press', ['shoulder', 'elbow', 'hand']],
    ['bb_overhead_press', ['shoulder', 'elbow', 'hand']], // side-view standing since 2026-08-29
    ['db_shoulder_press', ['shoulderR', 'elbowR', 'handR']],
  ];

  for (const [id, triple] of PRESSES) {
    const rig = EXERCISE_MOTION[id];
    if (!rig) continue;
    test(`${id} — the elbow only ever opens`, () => {
      let worstDrop = 0;
      let prev = drawnAngle(rig, 0, ...triple);
      for (let i = 1; i <= SAMPLES; i++) {
        const a = drawnAngle(rig, i / SAMPLES, ...triple);
        worstDrop = Math.max(worstDrop, prev - a);
        prev = a;
      }
      expect(worstDrop).toBeLessThan(1);
    });
  }
});

describe('a symmetric movement is drawn symmetric', () => {
  /*
   * A fly is judged on symmetry — both arms opening the same amount, both elbows holding the same
   * angle — so the two sides have to be COMPARABLE in the drawing, at every frame and not only at
   * the ends. Any orbit off square-on breaks that: one arm falls behind the torso and the far one
   * collapses toward the lens partway through the sweep, and the four fly rigs shipped exactly
   * that for a while. Pinning the two drawn hinges to each other is what pins the camera.
   */
  for (const id of ['pec_deck', 'cable_fly', 'rear_delt_fly', 'reverse_pec_deck', 'low_cable_fly']) {
    const rig = EXERCISE_MOTION[id];
    if (!rig) continue;
    test(`${id} — the two elbows are drawn at the same angle throughout`, () => {
      let worst = 0;
      for (let i = 0; i <= SAMPLES; i++) {
        const rom = i / SAMPLES;
        const r = drawnAngle(rig, rom, 'shoulderR', 'elbowR', 'handR');
        const l = drawnAngle(rig, rom, 'shoulderL', 'elbowL', 'handL');
        worst = Math.max(worst, Math.abs(r - l));
      }
      expect(worst).toBeLessThan(1);
    });
  }
});

describe('foreshortening means a depth, and says so', () => {
  /*
   * A bone drawn shorter than it is has turned toward the lens, and how far it turned is a fact
   * about the pose — so `Pose.z` has to carry it. The supine chest family used to encode the fold
   * as two hand-authored projected lengths with no depth behind them, and the pair described an
   * impossible bar path. Now one tuck angle produces both, and this checks the arithmetic actually
   * closes: drawn length and declared depth must reconstruct the canonical bone.
   */
  const CHEST = [
    'bb_bench_press',
    'incline_bb_press',
    'db_bench_press',
    'incline_db_press',
    'close_grip_bench',
    'smith_bench_press',
    'decline_bb_press',
    'smith_incline_press',
  ];

  test.each(CHEST)('%s — the drawn arm and its depth rebuild a canonical arm', (id) => {
    const rig = EXERCISE_MOTION[id];
    expect(rig).toBeDefined();
    for (let i = 0; i <= SAMPLES; i++) {
      const pose = rig.poseAt(i / SAMPLES);
      const s = pose.j.shoulder;
      const e = pose.j.elbow;
      const h = pose.j.hand;
      const zs = pose.z?.shoulder ?? 0;
      const ze = pose.z?.elbow ?? 0;
      const zh = pose.z?.hand ?? 0;
      const upper = Math.hypot(e.x - s.x, e.y - s.y, ze - zs);
      const fore = Math.hypot(h.x - e.x, h.y - e.y, zh - ze);
      /* Against the skeleton, not typed numbers (2026-09-07): the arm grew from 25/23 to 27/25 and
         a literal 25 here would have pinned the old anthro forever. */
      expect(upper).toBeGreaterThan(ATHLETE.upperArm - 0.6);
      expect(upper).toBeLessThan(ATHLETE.upperArm + 0.6);
      expect(fore).toBeGreaterThan(ATHLETE.foreArm - 0.6);
      expect(fore).toBeLessThan(ATHLETE.foreArm + 0.6);
    }
  });
});
