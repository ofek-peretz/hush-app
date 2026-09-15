/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE FIGURE'S GEOMETRY — the half of this screen no render test can see.
 *
 * ⛔ THE FIRST FIGURE SHIPPED A CONTROL THAT COULD NOT BE PRESSED, AND EVERY TEST WAS GREEN.
 *
 * Its press area spanned BOTH limbs of a muscle as one rectangle. For the biceps that rectangle runs
 * the full width of the body — from the left arm to the right — at the height of the chest, and
 * because the biceps are drawn after the chest it sat on top of them. **Pressing her chest opened her
 * biceps**, on the screen whose entire job is choosing a muscle.
 *
 * `bodyMapScreen` did not catch it and could not have: it finds a zone by its accessibility label and
 * calls `onPress` directly. That is exactly the call a covered control never receives from a finger.
 * A test that reaches past the hit testing cannot report a hit-testing bug.
 *
 * ⚠️ SO THESE READ THE GEOMETRY ITSELF. They are not about how the body looks — taste is the
 * founder's and the browser's — they are the three things that must be true for a drawing to be a
 * control at all: every muscle has a target, no target is stolen by another, and a thumb can land on
 * one.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { ZONES, hitBoxes, mirrorHit, viewOf, UNIT_PT, type Face } from '@/components/BodyMapFigure';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';

const FACES: Face[] = ['front', 'back'];

/** Do two rectangles share any area? Touching edges do not — a shared edge steals nothing. */
function overlaps(a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('every muscle the engine trains is on the body exactly once', () => {
  it('the two faces PARTITION the engine’s ten — none missing, none drawn twice', () => {
    const drawn = [...ZONES.front, ...ZONES.back].map((z) => z.muscle);
    expect([...drawn].sort()).toEqual([...CANONICAL_MUSCLE_ORDER].sort());
    expect(new Set(drawn).size).toBe(drawn.length);
  });

  it('`viewOf` sends every muscle to the face it is actually drawn on', () => {
    // The screen turns the body to `viewOf(m)` before opening a muscle. If that disagrees with where
    // the zone lives, pressing a muscle in the sheet turns to a face that does not contain it.
    for (const face of FACES) {
      for (const z of ZONES[face]) expect({ m: z.muscle, face: viewOf(z.muscle) }).toEqual({ m: z.muscle, face });
    }
  });
});

describe('⛔ no muscle’s target may cover another’s', () => {
  /*
   * THE LAW THE FIRST VERSION BROKE. Every rectangle laid on the figure is compared with every other
   * on the same face — including a muscle's own mirrored twin, since a pair whose halves overlap each
   * other at the midline is a body whose left and right have merged.
   */
  it.each(FACES)('%s — every pair of press rectangles is disjoint', (face) => {
    const boxes = hitBoxes(face);
    const collisions: string[] = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        if (overlaps(boxes[i].box, boxes[j].box)) collisions.push(`${boxes[i].muscle} ⨯ ${boxes[j].muscle}`);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('and the one that used to break it is named, so the fix cannot be undone quietly', () => {
    // Biceps over Chest was the shipped defect. It is the pair a "tidy-up" that re-merges the two
    // limbs into one control would recreate first, because the arms straddle the chest.
    const biceps = hitBoxes('front').filter((b) => b.muscle === 'Biceps');
    const chest = hitBoxes('front').filter((b) => b.muscle === 'Chest');
    expect(biceps).toHaveLength(2); // one per arm — a single box here IS the bug
    for (const a of biceps) for (const c of chest) expect(overlaps(a.box, c.box)).toBe(false);
  });
});

describe('a thumb can land on every one of them', () => {
  it('no target is under 44 pt on either side (Apple’s floor)', () => {
    const pt = UNIT_PT();
    const small = FACES.flatMap((f) => hitBoxes(f))
      .filter((b) => b.box.w * pt < 44 || b.box.h * pt < 44)
      .map((b) => `${b.muscle} ${Math.round(b.box.w * pt)}×${Math.round(b.box.h * pt)}pt`);
    expect(small).toEqual([]);
  });

  it('⛔ …and clears it in UNITS too, so the floor does not depend on the stage width', () => {
    /*
     * THE TEST ABOVE PASSES FOR THE WRONG REASON IF THE GEOMETRY IS TIGHT. Sized to the drawn
     * muscle, a calf's target was 36 units — 45 pt at a 250 pt stage and 40 pt at 220, which is
     * where the stage landed the moment this figure had to share a screen with a back arrow, a
     * stance sheet and a footer. A law that a layout tweak can break is a law about the layout.
     *
     * ⚠️ At 1 unit ≥ 1 pt the stage can be anything from 200 pt up and every target still clears.
     */
    const tight = FACES.flatMap((f) => hitBoxes(f))
      .filter((b) => b.box.w < 44 || b.box.h < 44)
      .map((b) => `${b.muscle} ${b.box.w}×${b.box.h}u`);
    expect(tight).toEqual([]);
    expect(UNIT_PT()).toBeGreaterThanOrEqual(1);
  });

  it('every target sits on the drawing board, not off the edge of it', () => {
    for (const face of FACES) {
      for (const { muscle, box } of hitBoxes(face)) {
        const inside = box.x >= 0 && box.y >= 0 && box.x + box.w <= 200 && box.y + box.h <= 440;
        expect({ muscle, inside }).toEqual({ muscle, inside: true });
      }
    }
  });
});

describe('the body is symmetric, and symmetric by construction', () => {
  it('a mirrored target is the exact reflection of its twin — no second constant to drift', () => {
    for (const face of FACES) {
      for (const z of ZONES[face]) {
        if (!z.mirrored) continue;
        const m = mirrorHit(z.hit);
        expect({ muscle: z.muscle, ...m }).toEqual({ muscle: z.muscle, x: 200 - z.hit.x - z.hit.w, y: z.hit.y, w: z.hit.w, h: z.hit.h });
        // …and reflecting twice is the identity, which is what makes it a reflection and not a shift.
        expect(mirrorHit(m)).toEqual(z.hit);
      }
    }
  });

  it('a muscle with two limbs offers two targets; a midline muscle offers one', () => {
    // Chest, Core, Back and Glutes cross the centre line — one shape, one target. Everything else is
    // a pair. Getting this wrong is how a control ends up spanning the whole body.
    const midline = ['Chest', 'Core', 'Back', 'Glutes'];
    for (const face of FACES) {
      for (const z of ZONES[face]) {
        const expected = midline.includes(z.muscle) ? 1 : 2;
        const actual = hitBoxes(face).filter((b) => b.muscle === z.muscle).length;
        expect({ muscle: z.muscle, targets: actual }).toEqual({ muscle: z.muscle, targets: expected });
      }
    }
  });
});

describe('every muscle is actually drawn', () => {
  it('carries real path data — a zone with no shape is a control with nothing under it', () => {
    for (const face of FACES) {
      for (const z of ZONES[face]) {
        expect({ m: z.muscle, ok: typeof z.d === 'string' && z.d.trim().startsWith('M') && z.d.length > 40 })
          .toEqual({ m: z.muscle, ok: true });
      }
    }
  });
});
