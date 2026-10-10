/**
 * ════ THE SECOND CAMERA IS THE SAME LIFT (2026-09-30) ════
 *
 * `library/frontViews` draws six big lifts face-on for the form card's angle switch. They are not in
 * the registry (a registry entry is an exercise's ONE demonstration), so the catalogue's laws do not
 * reach them on their own — this suite runs every one of those laws over them, and adds the one
 * promise only a second camera makes: that it is the SAME REP as the first, at the same instant.
 */
// @ts-nocheck

import { auditAll } from '@/motion/audit';
import { validate } from '@/motion/formspec';
import { buildFrame, VIEWBOX } from '@/motion/frame';
import { EXERCISE_MOTION } from '@/motion/registry';
import { FRONT_VIEWS } from '@/motion/library/frontViews';

const ids = Object.keys(FRONT_VIEWS);
const samples = Array.from({ length: 41 }, (_, i) => i / 40);

describe('the second camera', () => {
  it('covers the lifts it says, each the other camera on a real catalogue rig', () => {
    expect(ids.sort()).toEqual(['bb_back_squat', 'bb_deadlift', 'bb_overhead_press', 'bb_rdl', 'front_squat', 'goblet_squat']);
    for (const id of ids) {
      expect(EXERCISE_MOTION[id]).toBeDefined();
      expect(FRONT_VIEWS[id].id).toBe(`${id}@front`);
      expect(FRONT_VIEWS[id].chains.view).toBe('front');
    }
  });

  it('no front view breaks a universal body law (the catalogue’s own auditor)', () => {
    const failures = auditAll(Object.fromEntries(ids.map((id) => [FRONT_VIEWS[id].id, FRONT_VIEWS[id]]))).filter((f) => f.severity === 'fail');
    if (failures.length) throw new Error(failures.map((f) => `  ${f.rig} — ${f.law}: ${f.detail}`).join('\n'));
  });

  it('each holds the contract it declares — start, end, a vertical path, planted feet', () => {
    for (const id of ids) {
      const v = validate(FRONT_VIEWS[id]).violations;
      if (v.length) throw new Error(`${id}@front: ${v.map((x) => x.detail).join(' · ')}`);
    }
  });

  it('it is the SAME rep: one tempo, and every joint at the height the side camera draws it', () => {
    for (const id of ids) {
      const side = EXERCISE_MOTION[id];
      const front = FRONT_VIEWS[id];
      expect(front.formspec.tempo).toEqual(side.formspec.tempo);
      for (const rom of samples) {
        const s = side.poseAt(rom).j;
        const f = front.poseAt(rom).j;
        // a level camera: a height is a height from either side
        for (const [a, b] of [['head', 'head'], ['hip', 'hipC'], ['knee', 'kneeR'], ['ankle', 'ankleR'], ['shoulder', 'neckBase']]) {
          expect({ id, rom, joint: b, y: f[b].y }).toEqual({ id, rom, joint: b, y: s[a].y });
        }
      }
    }
  });

  it('the whole of every view is inside the frame, every frame', () => {
    for (const id of ids) {
      for (const rom of samples) {
        const p = FRONT_VIEWS[id].poseAt(rom);
        for (const [name, j] of Object.entries(p.j)) {
          const inside = j.x >= VIEWBOX.x && j.x <= VIEWBOX.x + VIEWBOX.w && j.y >= VIEWBOX.y - 20 && j.y <= VIEWBOX.y + VIEWBOX.h + 20;
          expect({ id, rom, name, inside }).toEqual({ id, rom, name, inside: true });
        }
        expect(buildFrame(FRONT_VIEWS[id], rom).length).toBeGreaterThan(10);
      }
    }
  });

  it('the grip sits where the lift says: outside the knees on a pull, wide of the shoulders under a back squat', () => {
    for (const rom of samples) {
      const dl = FRONT_VIEWS.bb_deadlift.poseAt(rom).j;
      expect(dl.handR.x).toBeGreaterThan(dl.kneeR.x + 5);
      const sq = FRONT_VIEWS.bb_back_squat.poseAt(rom).j;
      expect(sq.handR.x).toBeGreaterThan(sq.shoulderR.x + 10);
    }
    // and the squat's knees go OUT as it deepens — the cue the side camera cannot show
    const top = FRONT_VIEWS.bb_back_squat.poseAt(0).j.kneeR.x;
    const bottom = FRONT_VIEWS.bb_back_squat.poseAt(1).j.kneeR.x;
    expect(bottom - top).toBeGreaterThan(6);
  });
});
