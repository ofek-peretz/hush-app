/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE BODY SHE TOUCHES — the ten muscles as a figure, front and back.
 *
 * ⛔ FOUNDER, 2026-08-08: *"גוף אחד שלוחצים עליו"* — one body she presses, carrying all three of her
 * decisions about a muscle: lead with it, leave it, or turn it off.
 *
 * ── ⛔ THE SECOND VERSION, BECAUSE I LOOKED AT THE FIRST ─────────────────────────────────────────
 * The first pass transcribed the v7 handoff's screen 4.1 literally: a head, two shoulder caps, two
 * chest slabs, two arms, an abdomen and two thighs, all as ROUNDED RECTANGLES. Rendered live it does
 * not read as a person — the shoulders float detached above the chest, the arms are unattached bars,
 * there is no neck and no waist, and the legs are two identical blocks. The founder had already set
 * the bar for this screen (*"אני חייב להביא גוף רציני יותר"*, and: not a real 3D rig like MoveKit's),
 * and a diagram of a snowman does not clear it.
 *
 * ── THE ARCHITECTURE: DRAWN IN SVG, PRESSED IN RN ───────────────────────────────────────────────
 * The reason the first version avoided SVG was touch, and it was a real reason: a muscle outline is
 * a sliver a thumb misses, and `react-native-svg`'s press handling is the least portable part of
 * that library. But that argument only ever applied to pressing the PATH. So the two jobs are split
 * and neither is compromised:
 *
 *   · **What she sees** is an SVG figure — silhouette underneath, each muscle a filled shape on top.
 *   · **What she presses** is a plain RN `Pressable` per limb, a rectangle over that muscle's area.
 *
 * ⛔ AND THE HIT BOXES DO NOT OVERLAP, WHICH THE FIRST VERSION'S DID. Its press area spanned BOTH
 * limbs as one control, so the biceps' box ran the full width of the body at the height of the
 * chest — and because it is drawn later it sat on top. **Pressing her chest opened her biceps.** No
 * test saw it: the suite finds a zone by its accessibility label and calls `onPress` directly, which
 * is exactly the call a covered control never receives from a finger. `noZonesOverlap` is the law.
 *
 * A muscle with two limbs therefore has TWO controls, and that is the honest description of what is
 * on the screen — both carry the same label and set the same stance, so a press on either is the one
 * decision it has always been.
 *
 * ── WHY NOT A 3D MODEL ──────────────────────────────────────────────────────────────────────────
 * A 3D rig is for DEMONSTRATING A MOVEMENT — showing a joint travel through space. This screen
 * answers "which muscle", and a drawn figure is the better instrument for that, not a compromise:
 * instant, offline, legible in either language, and kilobytes. A body that rotates in order to say
 * "my shoulder hurts" is ceremony charged to her loading time.
 *
 * ── THE ZONES ARE THE ENGINE'S TEN ──────────────────────────────────────────────────────────────
 * Every member of `CANONICAL_MUSCLE_ORDER` is drawn exactly once across the two faces: a muscle on
 * neither is a decision she can never make, and one on both is a control that disagrees with itself.
 * `bodyMapScreen` asserts the partition. The split follows anatomy — biceps face you, triceps do not.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Svg, { Path, Ellipse, G } from 'react-native-svg';
import { color } from '@/design/tokens';
import { tg } from '@/i18n';
import type { MuscleStance } from '@/data/local/models';

export type Face = 'front' | 'back';

/** The drawing board both faces share. Every number below is in these units. */
const BOX = { w: 200, h: 440 };

/**
 * A muscle: what is DRAWN and what is PRESSED, kept separate on purpose.
 *
 * `d` is the left-hand limb (or the midline shape). `mirrored` redraws it flipped about the centre
 * line rather than carrying a second hand-written path — symmetry that cannot drift.
 *
 * `hit` is the press rectangle for that same left limb; a mirrored muscle gets a second one, flipped.
 * It is deliberately LARGER than the shape: a thumb is about 44 pt, and a press area that traces an
 * outline is one she has to aim at.
 */
export interface Zone {
  muscle: string;
  d: string;
  /** Drawn and pressed twice, flipped about x = 100. Absent on the shapes that cross the midline. */
  mirrored?: boolean;
  hit: { x: number; y: number; w: number; h: number };
}

/**
 * The un-chosen body: present enough to be a person, quiet enough not to look like an option.
 *
 * ⚠️ FILLED, NEVER STROKED. The first render outlined every filler shape, and the outlines are what
 * you actually saw: a bright box where the neck met the torso, and a hard line across the hips where
 * the torso path met the legs. The parts are drawn OVERLAPPING on purpose so the body is continuous;
 * an outline is what makes an overlap look like a seam.
 */
/*
 * ⛔ AND IT IS OPAQUE, NOT A CREAM WASH AT 11%. The ground is absolute black (founder 2026-08-05),
 * and a translucent fill over black STACKS where two shapes overlap: the neck sits inside the torso
 * and the torso inside the hips, so both read as a lighter box drawn on the body — a bright collar
 * under the chin and a hard band across the pelvis. Every other wash in the product is safe because
 * nothing else lays one over another. This is the same colour that wash resolved to, resolved once.
 */
const FILL_IDLE = '#232220';

/*
 * ⚠️ THE TORSO, THE ARMS AND THE LEGS ARE THE SAME ON BOTH FACES — a body seen from behind has the
 * same outline as one seen from the front. Only what is drawn ON it changes, which is the whole
 * reason this list is shared rather than written twice and allowed to drift.
 */
const NECK = 'M 89,50 L 111,50 L 113,74 L 87,74 Z';
const TORSO =
  'M 88,62 L 112,62 C 127,65 139,72 147,83 C 153,94 155,107 152,121 C 149,136 145,147 141,156 '
  + 'C 137,171 135,188 136,205 C 137,216 135,224 131,230 L 69,230 C 65,224 63,216 64,205 '
  + 'C 65,188 63,171 59,156 C 55,147 51,136 48,121 C 45,107 47,94 53,83 C 61,72 73,65 88,62 Z';
const ARM_L =
  'M 50,92 C 41,102 34,124 33,148 C 32,171 34,192 38,208 C 40,220 42,233 43,246 L 58,246 '
  + 'C 59,232 60,217 61,203 C 63,184 64,161 63,140 C 62,117 58,100 53,90 Z';
const ARM_R =
  'M 150,92 C 159,102 166,124 167,148 C 168,171 166,192 162,208 C 160,220 158,233 157,246 L 142,246 '
  + 'C 141,232 140,217 139,203 C 137,184 136,161 137,140 C 138,117 142,100 147,90 Z';
const LEG_L =
  'M 68,226 C 61,248 59,286 63,317 C 66,338 68,355 70,371 C 71,392 72,406 74,417 L 93,417 '
  + 'C 94,404 94,388 93,371 C 95,349 97,329 97,308 C 98,279 97,250 95,226 Z';
const LEG_R =
  'M 132,226 C 139,248 141,286 137,317 C 134,338 132,355 130,371 C 129,392 128,406 126,417 L 107,417 '
  + 'C 106,404 106,388 107,371 C 105,349 103,329 103,308 C 102,279 103,250 105,226 Z';
const HAND_L = 'M 42,246 C 37,250 36,262 39,270 C 43,275 55,275 58,270 C 61,262 60,250 56,246 Z';
const HAND_R = 'M 158,246 C 163,250 164,262 161,270 C 157,275 145,275 142,270 C 139,262 140,250 144,246 Z';
const FOOT_L = 'M 73,414 C 68,418 66,426 69,430 L 95,430 C 96,424 95,417 93,414 Z';
const FOOT_R = 'M 127,414 C 132,418 134,426 131,430 L 105,430 C 104,424 105,417 107,414 Z';

/**
 * ⛔ THE FIGURE THAT IS NOT PRESSABLE — and what makes the muscles read as a body.
 *
 * Drawn first and dimly, it closes the silhouette so the deltoid sits ON a shoulder rather than
 * beside one. None of it is a muscle the engine trains, so none of it responds to a finger: a shape
 * that highlights but cannot be chosen is a promise the screen does not keep.
 */
const FILLER: readonly string[] = [NECK, TORSO, ARM_L, ARM_R, LEG_L, LEG_R, HAND_L, HAND_R, FOOT_L, FOOT_R];

/**
 * A rounded rectangle as path data — the one shape SVG has no primitive for inside a `<Path>`.
 *
 * ⚠️ IT EXISTS FOR THE ABDOMEN AND NOTHING ELSE. Drawn as a single tapering outline the core read as
 * a slab: correct in outline, and the only shape on the body that did not look like a muscle. The
 * rectus abdominis is SEGMENTED, and drawing the segments is what makes it legible as an abdomen
 * rather than as a panel — the dark between them is the tendon, and it is doing the work.
 */
const rr = (x: number, y: number, w: number, h: number, r: number): string =>
  `M ${x + r},${y} h ${w - 2 * r} a ${r},${r} 0 0 1 ${r},${r} v ${h - 2 * r} `
  + `a ${r},${r} 0 0 1 ${-r},${r} h ${-(w - 2 * r)} a ${r},${r} 0 0 1 ${-r},${-r} `
  + `v ${-(h - 2 * r)} a ${r},${r} 0 0 1 ${r},${-r} Z`;

/**
 * Three rows of the rectus, tapering downward, with a four-unit gap for the linea alba.
 *
 * ⚠️ IT WAS FOUR, AND THE FOURTH ROW WAS 13 UNITS SQUARE — at the size this actually draws that is a
 * pair of dots below the abdomen, which reads as a rendering fault rather than as lower abs. Three
 * rows is also simply what an abdomen looks like.
 */
const ABS = [
  [78, 143, 20, 21],
  [79, 168, 19, 21],
  [81, 193, 17, 22],
]
  .flatMap(([x, y, w, h]) => [rr(x, y, w, h, 4), rr(200 - x - w, y, w, h, 4)])
  .join(' ');

/** The head, drawn apart from the paths because a circle is a circle. */
const HEAD = { cx: 100, cy: 32, rx: 18, ry: 24 };

export const ZONES: { front: Zone[]; back: Zone[] } = {
  front: [
    {
      muscle: 'Shoulders',
      // The anterior deltoid CAPS the shoulder — from the collarbone, wrapping out and down.
      d: 'M 66,76 C 54,79 46,88 43,100 C 41,111 43,122 48,127 C 55,124 61,114 64,102 C 67,90 68,80 66,76 Z',
      mirrored: true,
      hit: { x: 24, y: 66, w: 40, h: 60 },
    },
    {
      muscle: 'Chest',
      // Both pectorals in one path, parted by the sternum — one muscle, one decision, two shapes.
      d: 'M 68,92 C 78,84 90,82 99,85 L 99,136 C 88,142 76,140 70,131 C 65,120 64,102 68,92 Z '
        + 'M 132,92 C 122,84 110,82 101,85 L 101,136 C 112,142 124,140 130,131 C 135,120 136,102 132,92 Z',
      hit: { x: 66, y: 70, w: 68, h: 68 },
    },
    {
      muscle: 'Biceps',
      d: 'M 48,128 C 41,138 38,156 39,174 C 41,188 46,196 52,197 C 58,192 60,176 59,158 C 58,142 54,131 48,128 Z',
      mirrored: true,
      hit: { x: 24, y: 128, w: 40, h: 74 },
    },
    {
      muscle: 'Core',
      d: ABS,
      hit: { x: 66, y: 138, w: 68, h: 84 },
    },
    {
      muscle: 'Quads',
      d: 'M 77,228 C 68,240 65,268 68,296 C 70,313 76,325 84,328 C 92,323 95,304 95,280 '
        + 'C 95,254 88,236 82,228 Z',
      mirrored: true,
      hit: { x: 62, y: 224, w: 37, h: 106 },
    },
  ],
  back: [
    {
      muscle: 'Back',
      /*
       * ⛔ THREE SHAPES, NOT ONE MASS. Written first as a single outline, it rendered as an amoeba
       * filling the whole torso — a back-shaped silhouette rather than a back. What makes a back
       * read as a back is the pair: the TRAPEZIUS as a kite from the neck out to the shoulders, and
       * the two LATISSIMUS wings flaring from the armpit down into the waist. The dark between them
       * is doing as much work as the fill.
       *
       * ⚠️ One muscle, one decision — `Back` is a single engine muscle, so all three subpaths take
       * one stance and one control. They are drawn apart because that is what a back looks like.
       */
      /*
       * ⚠️ THE KITE'S LOWER EDGE AND THE WINGS' UPPER EDGES OVERLAP BY SIX UNITS. Butted against
       * each other they left a dark wedge biting up into the trapezius at the spine, which reads as
       * a broken shape rather than as two muscles. Overlapping them means the only dark left between
       * the wings is the spine — which is where a spine goes.
       */
      d: 'M 100,64 L 118,68 C 129,74 137,83 141,93 C 134,102 119,110 100,113 '
        + 'C 81,110 66,102 59,93 C 63,83 71,74 82,68 Z '
        + 'M 88,112 C 77,120 66,134 62,152 C 59,169 62,183 70,192 C 80,198 90,194 96,186 '
        + 'C 98,168 96,144 95,130 C 94,120 91,114 88,112 Z '
        + 'M 112,112 C 123,120 134,134 138,152 C 141,169 138,183 130,192 C 120,198 110,194 104,186 '
        + 'C 102,168 104,144 105,130 C 106,120 109,114 112,112 Z',
      hit: { x: 60, y: 62, w: 80, h: 134 },
    },
    {
      muscle: 'Triceps',
      d: 'M 47,116 C 39,128 36,148 37,168 C 39,184 45,194 51,195 C 57,190 59,172 58,152 C 57,132 53,119 47,116 Z',
      mirrored: true,
      hit: { x: 20, y: 114, w: 38, h: 86 },
    },
    {
      muscle: 'Glutes',
      d: 'M 100,202 C 89,198 78,202 73,212 C 70,221 74,232 82,236 C 90,239 97,235 100,228 '
        + 'C 103,235 110,239 118,236 C 126,232 130,221 127,212 C 122,202 111,198 100,202 Z',
      hit: { x: 62, y: 200, w: 76, h: 44 },
    },
    {
      muscle: 'Hamstrings',
      d: 'M 77,248 C 68,260 66,284 69,306 C 71,319 77,328 84,330 C 92,325 95,309 95,288 '
        + 'C 95,266 88,252 82,248 Z',
      mirrored: true,
      hit: { x: 62, y: 246, w: 37, h: 86 },
    },
    {
      muscle: 'Calves',
      d: 'M 81,334 C 73,344 70,362 72,378 C 74,389 79,395 85,396 C 91,392 93,378 93,363 '
        + 'C 93,349 87,336 81,334 Z',
      mirrored: true,
      hit: { x: 62, y: 334, w: 36, h: 68 },
    },
  ],
};

/** The face a muscle is drawn on. Unknown → front, so a new muscle is visible rather than lost. */
export function viewOf(muscle: string): Face {
  return ZONES.back.some((z) => z.muscle === muscle) ? 'back' : 'front';
}

/** The mirrored twin of a press rectangle, about the centre line. Symmetry, not a second constant. */
export function mirrorHit(hit: Zone['hit']): Zone['hit'] {
  return { ...hit, x: BOX.w - hit.x - hit.w };
}

/** One drawing-board unit, in points, at the size the figure actually renders. */
export const UNIT_PT = () => STAGE_MAX_W / BOX.w;

/** Every press rectangle on a face, in the order they are laid down. The overlap law reads this. */
export function hitBoxes(face: Face): { muscle: string; box: Zone['hit'] }[] {
  return ZONES[face].flatMap((z) =>
    (z.mirrored ? [z.hit, mirrorHit(z.hit)] : [z.hit]).map((box) => ({ muscle: z.muscle, box })),
  );
}

const pct = (n: number, of: number) => `${(n / of) * 100}%`;

/**
 * The three states, in the palette the rest of the product already speaks.
 *
 * Cream is a muscle at rest. Moss is "a decision made" — the same green that marks a choice
 * everywhere else. OFF is drawn as an OUTLINE with almost no fill: the limb is still there, which is
 * the point — she has not deleted her shoulder, she has told Hush to leave it alone.
 */
function skin(stance: MuscleStance, editing: boolean) {
  const base =
    stance === 'off'
      ? { fill: 'rgba(241,238,229,0.05)', stroke: 'rgba(241,238,229,0.24)', strokeWidth: 1 }
      : stance === 'emphasis'
        ? { fill: '#CFE0BE', stroke: '#8FB27F', strokeWidth: 1.75 }
        : { fill: '#E3DED0', stroke: 'rgba(241,238,229,0.14)', strokeWidth: 1 };
  /*
   * ⚠️ THE EDITING RING IS 3 UNITS, NOT 2.25. The figure is 200 units wide and draws at about 150 px,
   * so a stroke is scaled by roughly 0.75 — a 2.25 ring lands under two pixels and reads as nothing.
   * Whichever muscle her sheet is open on has to be obvious without her hunting for it.
   */
  return editing ? { ...base, stroke: '#F1EEE5', strokeWidth: 3 } : base;
}

export interface BodyMapFigureProps {
  face: Face;
  /** Her map. A muscle absent from it is `normal` — normal is the absence of a decision, not one. */
  map: Record<string, MuscleStance>;
  /** The muscle whose sheet is open, if any. */
  selected?: string | null;
  onSelect: (muscle: string) => void;
}

export function BodyMapFigure({ face, map, selected, onSelect }: BodyMapFigureProps) {
  const zones = ZONES[face];
  const flip = `translate(${BOX.w}, 0) scale(-1, 1)`;

  return (
    <View style={styles.stage}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${BOX.w} ${BOX.h}`}>
        {/* The body first, dim — it is the ground the muscles sit on, never a target. */}
        <Ellipse {...HEAD} fill={FILL_IDLE} />
        {FILLER.map((d, i) => (
          <Path key={`filler-${i}`} d={d} fill={FILL_IDLE} />
        ))}

        {zones.map((z) => {
          const s = skin(map[z.muscle] ?? 'normal', selected === z.muscle);
          return (
            <React.Fragment key={z.muscle}>
              <Path d={z.d} {...s} />
              {z.mirrored ? (
                <G transform={flip}>
                  <Path d={z.d} {...s} />
                </G>
              ) : null}
            </React.Fragment>
          );
        })}
      </Svg>

      {/*
        ⛔ THE CONTROLS, LAID OVER THE DRAWING AND NOT PART OF IT.

        One per limb, because a press box that spans both limbs spans everything between them — which
        is how the first version's biceps came to cover the chest. Both carry the same name and set
        the same stance, so the pair is still one decision; it is only the TARGET that is two.
      */}
      {zones.map((z) => {
        const stance = map[z.muscle] ?? 'normal';
        const name = tg(`muscle.${z.muscle}`);
        const word = tg(
          stance === 'off' ? 'ob.stanceOff' : stance === 'emphasis' ? 'ob.stanceEmphasis' : 'ob.stanceNormal',
        );
        const boxes = z.mirrored ? [z.hit, mirrorHit(z.hit)] : [z.hit];
        return boxes.map((h, i) => (
          <Pressable
            key={`${z.muscle}-${i}`}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${word}`}
            accessibilityState={{ selected: selected === z.muscle }}
            onPress={() => onSelect(z.muscle)}
            style={[
              styles.hit,
              {
                left: pct(h.x, BOX.w),
                top: pct(h.y, BOX.h),
                width: pct(h.w, BOX.w),
                height: pct(h.h, BOX.h),
              },
            ]}
          >
            {/*
              A DOT, NOT A LETTER. The handoff's badge carries a glyph, and at this size that glyph
              is 9 pt — under the 13 pt floor `typeHasAFloor` holds every surface to. A mark does not
              need to be read: the muscle beneath it is already moss, and the stance is spoken in the
              control's own accessibility label. Drawn once, on the first limb, so a pair of legs does
              not wear two badges for one decision.
            */}
            {stance === 'emphasis' && i === 0 ? <View style={styles.badge} /> : null}
          </Pressable>
        ));
      })}
    </View>
  );
}

/**
 * ⛔ THE WIDTH THE FIGURE ACTUALLY DRAWS AT, published because a TARGET SIZE CANNOT BE CHECKED
 * WITHOUT IT. A press rectangle 34 units wide is 42 pt here and 26 pt if this number drops to 150 —
 * the same geometry, one of them under Apple's 44 pt floor. `everyMuscleIsThumbSized` reads it.
 */
export const STAGE_MAX_W = 250;

const styles = StyleSheet.create({
  stage: { width: '100%', aspectRatio: BOX.w / BOX.h, alignSelf: 'center', maxWidth: STAGE_MAX_W },
  /*
   * ⛔ CENTRED, BECAUSE A CORNER IS NOT ON THE MUSCLE. The badge used to sit at the top OUTER corner
   * of the press rectangle — and the chest's rectangle spans both pectorals, so its corner is over
   * the far deltoid. The mark for "I lead with your chest" was drawn on her shoulder.
   */
  hit: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  badge: {
    width: 13, height: 13, borderRadius: 7, backgroundColor: '#A9C49F',
    borderWidth: 2, borderColor: 'rgba(0,0,0,0.35)',
  },
});
