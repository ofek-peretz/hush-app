/**
 * THE TWO NON-EXERCISE RIGS, HELD TO THE SAME BODY LAWS.
 *
 * `restingRig` and `loggingRig` are deliberately outside `registry.ts` (see `library/life.ts` for
 * why), so `theUniversalMotionLaws` — which walks `EXERCISE_MOTION` — never sees them. That buys
 * them an exemption from the EXERCISE contract and none at all from anatomy: a figure sitting on a
 * bench can still stretch a femur, sink a heel through the floor or snap an elbow inside out, and
 * this one appears at hero size on the screen the athlete looks at longest.
 *
 * ⚠️ `formspec.validate` IS RUN TOO, and it is not ceremony here. Both rigs pin joints they claim
 * never to move (`pointFixed` on the hip, the shoulder, the head) and both are authored by hand
 * against `ATHLETE`, so the predicates are the only thing standing between a typo'd constant and a
 * breathing figure whose hips drift up the bench.
 */

//

import { auditAll } from '@/motion/audit';
import { validate } from '@/motion/formspec';
import { celebratingRig, drinkingRig, loggingRig, restingRig } from '@/motion/library/life';
import { buildFrame, VIEWBOX } from '@/motion/frame';

const RIGS = { life_resting: restingRig, life_drinking: drinkingRig, life_logging: loggingRig, life_celebrating: celebratingRig };

describe('the athlete between sets', () => {
  test('neither pose breaks a universal body law', () => {
    const failures = auditAll(RIGS).filter((f) => f.severity === 'fail');
    if (failures.length) {
      throw new Error(failures.map((f) => `  ${f.rig} — ${f.law}: ${f.detail}`).join('\n'));
    }
  });

  /**
   * ⛔ ONE EXEMPTION, AND IT IS THE ONE THAT PROVES THESE ARE NOT EXERCISES.
   *
   * `validate` ends with a floor — *"tracked point barely travels (Nu) — not a real range of
   * motion"* — and it is a good rule for a catalogue in which a clip that does not move is a clip
   * that teaches nothing. `restingRig`'s shoulder travels 2.9 units, because that is how far a
   * chest rises on one breath, and the whole point of the pose is that she is NOT performing a
   * range of motion. Widening the breath to satisfy a validator would be animating a lie.
   *
   * It is exempted BY NAME and BY MESSAGE rather than by skipping the rig: every other predicate
   * this rig declares — the pinned hip, the pinned knee, the pinned ankle, the two endpoint
   * heights, the elbow that never locks — is still asserted, and a second violation of any kind
   * fails the test.
   */
  const isBreathNotARep = (rig: string, detail: string) =>
    rig === 'life_resting' && detail.includes('barely travels');

  /**
   * ⛔ THE SWAP BETWEEN THE TWO REST POSES IS INVISIBLE ONLY IF THIS HOLDS.
   *
   * `SessionFlow.RestingAthlete` alternates the two rigs on a timer, and `MotionFigure` anchors its
   * clock at MOUNT — it does not restart when the rig changes. So at the swap instant both rigs are
   * asked for a pose at the same elapsed time, and the cut is invisible exactly when their rom-0
   * poses agree. If somebody moves the drink's start, the rest screen starts jump-cutting and
   * nothing else in the suite would notice.
   */
  test('the drink begins in the pose the breath begins in — the swap has nothing to jump', () => {
    const a = restingRig.poseAt(0);
    const b = drinkingRig.poseAt(0);
    for (const name of Object.keys(a.j)) {
      expect(b.j[name].x).toBeCloseTo(a.j[name].x, 6);
      expect(b.j[name].y).toBeCloseTo(a.j[name].y, 6);
    }
  });

  test('each pose holds the contract it declares', () => {
    for (const rig of Object.values(RIGS)) {
      const violations = validate(rig).violations.filter((v) => !isBreathNotARep(rig.id, v.detail));
      if (violations.length) throw new Error(`${rig.id}: ${violations.map((f) => f.detail).join(' · ')}`);
    }
  });
});

describe('✦ the arms go up (2026-09-30)', () => {
  const samples = Array.from({ length: 41 }, (_, i) => i / 40);

  test('the whole celebration is inside the frame — hands, crown and feet, every frame', () => {
    for (const rom of samples) {
      const p = celebratingRig.poseAt(rom);
      for (const [name, j] of Object.entries(p.j)) {
        expect({ rom, name, inside: j.x >= VIEWBOX.x && j.x <= VIEWBOX.x + VIEWBOX.w && j.y >= VIEWBOX.y && j.y <= VIEWBOX.y + VIEWBOX.h })
          .toEqual({ rom, name, inside: true });
      }
      expect(p.j.head.y - p.headR).toBeGreaterThan(VIEWBOX.y);
      expect(buildFrame(celebratingRig, rom).length).toBeGreaterThan(10);
    }
  });

  test('the elbow keeps its side of the arm for the whole sweep — it never snaps across', () => {
    type P = { x: number; y: number };
    const cross = (s: P, e: P, h: P) => (e.x - s.x) * (h.y - s.y) - (e.y - s.y) * (h.x - s.x);
    let sign = 0;
    for (const rom of samples) {
      const { shoulderR, elbowR, handR } = celebratingRig.poseAt(rom).j;
      const c = Math.sign(cross(shoulderR, elbowR, handR));
      expect(c).not.toBe(0);
      if (sign === 0) sign = c;
      expect({ rom, c }).toEqual({ rom, c: sign });
    }
  });

  test('she starts with her arms down and ends in the V, the two sides mirrored', () => {
    const down = celebratingRig.poseAt(0).j;
    const up = celebratingRig.poseAt(1).j;
    expect(down.handR.y).toBeGreaterThan(down.hipC.y); // by her thighs
    expect(up.handR.y).toBeLessThan(up.head.y); // over her head
    expect(up.handR.x - up.head.x).toBeCloseTo(up.head.x - up.handL.x, 6); // a symmetric V
  });
});
