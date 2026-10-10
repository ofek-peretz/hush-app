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

import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Svg, { Path, Ellipse, G } from 'react-native-svg';
import { color, alert } from '@/design/tokens';
import { tg } from '@/i18n';
import type { MuscleStance } from '@/data/local/models';

export type Face = 'front' | 'back';

/** The drawing board both faces share. Every number below is in these units. */
export const BOX = { w: 200, h: 440 };

/** Its proportions as one number: the figure is 2.2 times as tall as it is wide, on every screen. */
const RATIO = BOX.h / BOX.w;

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
/*
 * ⛔ AND IT IS VISIBLE (design review 2026-09-01). `#232220` was 1.3:1 against the black ground —
 * the head and the connective filler vanished, so the figure read as floating muscles with no body
 * (and no head). `#4a473d` is ~2.3:1: clearly a GROUND, still well beneath the quietest muscle
 * fill (`#E3DED0`), but present enough that the silhouette closes.
 */
export const FILL_IDLE = '#4a473d';

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
/** The three rows of the rectus, as data — so the female figure can re-width them at the source. */
const ABS_ROWS: readonly (readonly [number, number, number, number])[] = [
  [78, 143, 20, 21],
  [79, 168, 19, 21],
  [81, 193, 17, 22],
];

const ABS = ABS_ROWS.flatMap(([x, y, w, h]) => [rr(x, y, w, h, 4), rr(200 - x - w, y, w, h, 4)]).join(' ');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ AND THERE ARE TWO BODIES, BECAUSE THERE ARE TWO ATHLETES.
 *
 * There was one figure and it was a man's. It is drawn on the screen where she describes HER OWN
 * BODY — one step after the app asked whether she is a woman, and one step before it builds a week
 * whose whole shape is decided by that answer.
 *
 * ⛔ THE FIRST ATTEMPT FAILED AND THE FOUNDER SAID SO IN FOUR WORDS: *"זה לא אישה."* It moved the
 * shoulder line five units on a 200-wide box — 2.5%, under the threshold an eye resolves — and
 * deliberately left `ZONES` alone. But the MUSCLES are most of the cream on that screen, and a
 * six-segment rectus over a square pair of pectorals reads as a man whatever the outline does.
 *
 * ── ONE SHAPE FUNCTION, AND EVERYTHING FOLLOWS IT ───────────────────────────────────────────────
 * So the body is not redrawn by hand — it is DERIVED. `WIDTH_AT` is a half-width scale against the
 * midline, read off the height: shoulders drawn in, the ribcage a little narrower, a waist that
 * genuinely pinches, hips that flare wider than the shoulders, thighs that follow them.
 *
 * ⚠️ AND IT IS APPLIED TO THE SILHOUETTE AND THE ZONES TOGETHER, which is the whole reason it is a
 * function rather than ten hand-authored paths. Hand-drawing them separately is how a deltoid ends
 * up floating beside a narrower arm; under one transform the muscles cannot come off the body,
 * because the body and the muscles are the same arithmetic.
 *
 * The head is exempt — a circle is a circle — and so is the vertical axis: nothing here changes how
 * tall anything is, only how wide it is at each height.
 */
/*
 * ⛔ THE SECOND RETUNE, AND THE FIRST ONE THAT ACTUALLY INVERTS THE TRIANGLE (device review,
 * 2026-08-23 — the founder photographed her on TestFlight and asked what needed changing).
 *
 * The table below it used to read *"the pelvis, flared until it meets the shoulder line"*, and
 * `meets` was exactly the problem. Measured on the shipped figure: her shoulder half-width came out
 * **44.3 units and her hip 36.6** — the hips were still the narrower end. That is a man's triangle
 * with a waist cut into it, which is why she still read as a slim man with long hair. An eye does
 * not grade a waist on its own; it reads WHICH END IS WIDER, and until this pass the answer was the
 * same on both figures.
 *
 * So the pelvis now genuinely OUTRUNS the shoulder line (≈48 against ≈41), which is the one
 * proportion every viewer resolves instantly and without being told.
 *
 * ⚠️ AND THE FLARE STARTS BELOW THE ABDOMEN, NOT THROUGH IT. The rectus sits at y 143–215, straddling
 * the waist; a flare that began at 205 (as it did) widened the BOTTOM row past the top one, so her
 * abdomen tapered upward — a wedge, drawn on the one shape that must taper down. The pinch is held
 * to y=212 and the whole flare happens in the twenty units under it, which is where a pelvis is.
 */
const WIDTH_AT: readonly (readonly [number, number])[] = [
  [60, 0.86], // collarbone
  [90, 0.80], // shoulder line
  [110, 0.78], // ribcage — pulled IN, so the widest part of her is not her chest
  [150, 0.76],
  [180, 0.70], // the waist, and the point of the whole figure
  [212, 0.80], // still narrow under the last row of the rectus — see the note above
  [232, 1.58], // the pelvis, flared PAST the shoulder line: the read, in one number
  [252, 1.34],
  [300, 1.14], // thighs, following the hips down
  [340, 1.04],
  [440, 0.98], // calves and feet
];

/**
 * ⛔ AN ARM IS NOT A CROSS-SECTION OF HER — the limb table, and why there had to be two.
 *
 * `WIDTH_AT` answers *"how wide is her body at this height"*, and applying it to the arms is what
 * the first version of the flare did. The result was immediate and unmistakable in a render: at the
 * pelvis the multiplier is 1.46, the hands happen to hang at exactly that height, and **her forearms
 * bowed outward and her hands swung out into the air like wings.** Nothing was wrong with the
 * number; it was being asked about the wrong thing. A hip is a cross-section of a body. An arm hangs
 * BESIDE that body and its width is its own.
 *
 * So limbs get their own scale: narrowed with the shoulders and then held, so the arms fall straight
 * and the hands come to rest just outside her hips — which is where hands rest.
 *
 * ⚠️ THEY DO GRAZE THE PELVIS, and that is correct rather than tolerated: on a figure whose hips are
 * her widest point, hands at hip height touch them. Both are the same idle fill, so the overlap is
 * invisible — and the waist above it keeps a clear gap of ground, which is where the eye reads the
 * shape anyway.
 */
const LIMB_WIDTH_AT: readonly (readonly [number, number])[] = [
  [60, 0.86],
  [110, 0.84], // narrowed with the shoulder it hangs from
  [200, 0.88],
  [440, 0.92], // …then held, so the fall of the arm is straight
];

function scaleAt(table: readonly (readonly [number, number])[], y: number): number {
  if (y <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [y1, k1] = table[i];
    const [y0, k0] = table[i - 1];
    if (y <= y1) return k0 + ((k1 - k0) * (y - y0)) / (y1 - y0);
  }
  return table[table.length - 1][1];
}

function widthAt(y: number): number {
  return scaleAt(WIDTH_AT, y);
}

/** Mirror-safe: the scale is about the midline, so a flipped shape lands where its twin does. */
const femaleX = (x: number, y: number, limb = false): number =>
  Math.round((100 + (x - 100) * scaleAt(limb ? LIMB_WIDTH_AT : WIDTH_AT, y)) * 10) / 10;

/**
 * Re-widths a path. Every path in this file is written in ABSOLUTE `M`/`L`/`C` — the one exception is
 * the abdomen, which is generated from a table below and gets the same treatment at the source.
 */
function feminise(d: string, limb = false): string {
  const out: string[] = [];
  const tok = d.match(/[MLCZ]|-?\d+(?:\.\d+)?/g) ?? [];
  let i = 0;
  while (i < tok.length) {
    const cmd = tok[i++];
    if (cmd === 'Z') {
      out.push('Z');
      continue;
    }
    const pairs = cmd === 'C' ? 3 : 1;
    out.push(cmd);
    for (let p = 0; p < pairs; p++) {
      const x = Number(tok[i++]);
      const y = Number(tok[i++]);
      out.push(`${femaleX(x, y, limb)},${y}`);
    }
  }
  return out.join(' ');
}

/** The rectus, narrower on a narrower waist — the same three rows, re-widthed at the source. */
const ABS_F = ABS_ROWS.map(([x, y, w, h]) => {
  const l = femaleX(x, y + h / 2);
  const r = femaleX(x + w, y + h / 2);
  return [l, y, r - l, h] as [number, number, number, number];
})
  .flatMap(([x, y, w, h]) => [rr(x, y, w, h, 4), rr(200 - x - w, y, w, h, 4)])
  .join(' ');

/**
 * ⛔ AND SHE HAS HAIR (founder, 2026-08-22) — the strongest signal on the whole figure, and the
 * cheapest.
 *
 * Proportion is read slowly: an eye has to compare a shoulder against a hip before it decides. A
 * head-and-hair silhouette is read INSTANTLY, before anything else on the screen, because it is the
 * one shape people are best in the world at recognising. It is why it belongs here even though the
 * waist now does its own work.
 *
 * ⚠️ IT IS AUTHORED AT FINAL COORDINATES AND NOT RE-WIDTHED. `feminise` narrows by height, and at the
 * jaw line it would thin the fall to a pair of wires — the transform describes a TORSO, and a head is
 * not one. This is the one shape in the figure that is drawn rather than derived.
 *
 * ⚠️ AND IT IS NOT A GARMENT. The founder also asked about clothing them; a body map is a diagram of
 * MUSCLES, and every muscle on it is a press target. A top covers the chest zone and shorts cover the
 * glutes — clothing would hide exactly what she came to this screen to touch, and it would date. Hair
 * sits outside the body and covers nothing.
 */
const HAIR_F =
  'M 100,2 C 82,2 70,14 69,34 C 68,48 71,60 70,76 C 69,88 71,96 76,99 '
  + 'C 80,96 81,88 80,76 C 79,60 80,46 82,36 C 86,26 92,22 100,22 '
  + 'C 108,22 114,26 118,36 C 120,46 121,60 120,76 C 119,88 120,96 124,99 '
  + 'C 129,96 131,88 130,76 C 129,60 132,48 131,34 C 130,14 118,2 100,2 Z';

/* The arms and the hands take the LIMB scale; everything else is a cross-section of her. The order
   matches `FILLER` exactly — neck, torso, armL, armR, legL, legR, handL, handR, footL, footR. */
const LIMB_FILLER = new Set([ARM_L, ARM_R, HAND_L, HAND_R]);
const FILLER_F: readonly string[] = [...FILLER.map((d) => feminise(d, LIMB_FILLER.has(d))), HAIR_F];

/** The head is the same ellipse on both — a diagram's head carries no sex. */
export const fillerFor = (sex: 'female' | 'male' | undefined): readonly string[] => (sex === 'male' ? FILLER : FILLER_F);

/** The head, drawn apart from the paths because a circle is a circle. */
export const HEAD = { cx: 100, cy: 32, rx: 18, ry: 24 };

export const ZONES: { front: Zone[]; back: Zone[] } = {
  front: [
    {
      muscle: 'Shoulders',
      // The anterior deltoid CAPS the shoulder — from the collarbone, wrapping out and down.
      d: 'M 66,76 C 54,79 46,88 43,100 C 41,111 43,122 48,127 C 55,124 61,114 64,102 C 67,90 68,80 66,76 Z',
      mirrored: true,
      hit: { x: 18, y: 66, w: 46, h: 60 },
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
      hit: { x: 18, y: 128, w: 46, h: 74 },
    },
    {
      muscle: 'Core',
      d: ABS,
      hit: { x: 66, y: 138, w: 68, h: 84 },
    },
    {
      muscle: 'Quads',
      /*
       * ⛔ A MUSCLE IS WIDE WHERE IT ORIGINATES (device review 2026-08-23). This was five units
       * across at the hip and bulged to its widest in mid-thigh — a LENS, and on the device it read
       * as a leaf laid on the leg rather than as a quadriceps. Every long muscle on this figure had
       * the same fault, and it is the same fix: full at the top where it attaches, tapering to a
       * rounded belly above the knee.
       */
      d: 'M 70,230 C 65,246 63,272 66,296 C 69,314 76,326 84,328 C 91,326 95,312 96,292 '
        + 'C 97,266 96,244 93,230 Z',
      mirrored: true,
      hit: { x: 54, y: 224, w: 45, h: 106 },
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
      hit: { x: 14, y: 114, w: 44, h: 86 },
    },
    {
      muscle: 'Glutes',
      d: 'M 100,202 C 89,198 78,202 73,212 C 70,221 74,232 82,236 C 90,239 97,235 100,228 '
        + 'C 103,235 110,239 118,236 C 126,232 130,221 127,212 C 122,202 111,198 100,202 Z',
      hit: { x: 62, y: 200, w: 76, h: 44 },
    },
    {
      muscle: 'Hamstrings',
      /* Full at the seat, tapering behind the knee — the quadriceps' fix, on the other face. */
      d: 'M 70,250 C 65,264 64,286 67,306 C 70,320 77,330 84,331 C 91,329 94,316 95,298 '
        + 'C 96,276 94,258 92,250 Z',
      mirrored: true,
      hit: { x: 54, y: 246, w: 45, h: 86 },
    },
    {
      muscle: 'Calves',
      /* The one muscle whose belly IS high — but it was pointed at the top; a calf is broad there. */
      d: 'M 77,336 C 73,346 71,363 73,378 C 75,390 80,396 85,397 C 90,394 92,381 92,366 '
        + 'C 92,350 89,340 87,336 Z',
      mirrored: true,
      hit: { x: 52, y: 334, w: 46, h: 68 },
    },
  ],
};

/**
 * ⛔ THE MUSCLES ARE RE-WIDTHED TOO, AND THAT IS WHAT THE FIRST ATTEMPT MISSED.
 *
 * `ZONES` above is the male body. The female set is the same ten muscles under the same shape
 * function that drew her silhouette — so a deltoid narrows exactly as much as the shoulder it caps,
 * and the rectus narrows exactly as much as the waist it sits on. Nothing can float.
 *
 * ⚠️ THE ABDOMEN IS THE ONE EXCEPTION, and only mechanically: it is generated from `ABS_ROWS` in
 * relative path commands, which the re-widther does not read. It is re-widthed at the table instead
 * (`ABS_F`) — the same arithmetic, applied one step earlier.
 *
 * The `hit` boxes travel with their shapes. A target that stayed where the male muscle was would be
 * a body you press beside.
 */
const hitF = (h: Zone['hit'], limb = false): Zone['hit'] => {
  const mid = h.y + h.h / 2;
  const l = femaleX(h.x, mid, limb);
  const r = femaleX(h.x + h.w, mid, limb);
  return { x: l, y: h.y, w: r - l, h: h.h };
};

/**
 * ⛔ THE MUSCLES ON HER ARMS TRAVEL WITH THE ARM, NOT WITH HER WAIST.
 *
 * The biceps sits at y 128–197, which on the body table is the WAIST — the narrowest scale on the
 * whole figure (0.70). Re-widthed by it, her biceps walked inward off the arm it belongs to and
 * floated over the ground beside her, which is the exact failure this file's own header records
 * from the first attempt (*"a deltoid ends up floating beside a narrower arm"*) — reintroduced from
 * the other side the moment the body and the limbs stopped sharing one curve.
 *
 * The deltoid is on this list because it caps the arm; the two scales barely differ at its height,
 * so the entry is about which thing it belongs to rather than about the number.
 */
const LIMB_MUSCLES = new Set(['Shoulders', 'Biceps', 'Triceps']);

/**
 * ⛔ HER CHEST STOPS, AND THE DARK UNDER IT IS THE POINT (device review, 2026-08-23).
 *
 * The pectorals run to y=142 and the rectus begins at y=143. One unit apart, at the size this
 * actually draws, is not a gap — so from collarbone to pelvis her torso was ONE UNBROKEN FIELD OF
 * CREAM, and that column is most of what still read as a man. It is the same finding this file
 * already records about the abdomen (*"the dark between them is the tendon, and it is doing the
 * work"*), one level up: what separates a chest from an abdomen is the ground between them.
 *
 * So hers ends at 122 and lifts a little — thirteen units of ground under it, and the two shapes
 * become two things instead of a breastplate.
 *
 * ⚠️ HIS IS UNCHANGED. A chest sitting straight onto the abdomen is what a man's torso looks like,
 * and it is drawn correctly; this is a fact about her figure, not a defect in his.
 *
 * ⚠️ AND THE PRESS TARGET DOES NOT MOVE. `hit` is separate from `d` by design (see the header), so
 * the chest is still pressed over the whole area it always was — a smaller drawing, never a smaller
 * target.
 */
const CHEST_F_RAW =
  'M 70,94 C 79,86 90,84 99,88 L 99,122 C 89,130 78,128 73,120 C 68,111 67,101 70,94 Z '
  + 'M 130,94 C 121,86 110,84 101,88 L 101,122 C 111,130 122,128 127,120 C 132,111 133,101 130,94 Z';

const ZONES_F: { front: Zone[]; back: Zone[] } = {
  front: ZONES.front.map((z) => {
    const limb = LIMB_MUSCLES.has(z.muscle);
    if (z.muscle === 'Core') return { ...z, d: ABS_F, hit: hitF(z.hit) };
    if (z.muscle === 'Chest') return { ...z, d: feminise(CHEST_F_RAW), hit: hitF(z.hit) };
    return { ...z, d: feminise(z.d, limb), hit: hitF(z.hit, limb) };
  }),
  back: ZONES.back.map((z) => {
    const limb = LIMB_MUSCLES.has(z.muscle);
    return { ...z, d: feminise(z.d, limb), hit: hitF(z.hit, limb) };
  }),
};

/** Whose muscles. Absent means hers — the same default, and for the same reason, as `fillerFor`. */
export const zonesFor = (sex: 'female' | 'male' | undefined) => (sex === 'male' ? ZONES : ZONES_F);

/** The face a muscle is drawn on. Unknown → front, so a new muscle is visible rather than lost. */
export function viewOf(muscle: string): Face {
  return ZONES.back.some((z) => z.muscle === muscle) ? 'back' : 'front';
}

/** The mirrored twin of a press rectangle, about the centre line. Symmetry, not a second constant. */
export function mirrorHit(hit: Zone['hit']): Zone['hit'] {
  return { ...hit, x: BOX.w - hit.x - hit.w };
}

/**
 * One drawing-board unit, in points, at the SMALLEST the figure ever renders — the worst case, which
 * is the only case a target-size law may be held to. A screen with room draws it larger, and larger
 * is a direction a thumb never minds.
 */
export const UNIT_PT = () => STAGE_FLOOR_W / BOX.w;

/** Every press rectangle on a face, in the order they are laid down. The overlap law reads this. */
export function hitBoxes(face: Face): { muscle: string; box: Zone['hit'] }[] {
  return ZONES[face].flatMap((z) =>
    (z.mirrored ? [z.hit, mirrorHit(z.hit)] : [z.hit]).map((box) => ({ muscle: z.muscle, box })),
  );
}

/* RN accepts percentage strings for these four, but `ViewStyle` types them as the template-literal
 * `${number}%` — a plain `string` return is the one thing it refuses. The annotation is the fix. */
const pct = (n: number, of: number): `${number}%` => `${(n / of) * 100}%`;

/**
 * The three states, in the palette the rest of the product already speaks.
 *
 * Cream is a muscle at rest. Moss is "a decision made" — the same green that marks a choice
 * everywhere else. OFF is drawn as an OUTLINE with almost no fill: the limb is still there, which is
 * the point — she has not deleted her shoulder, she has told Hush to leave it alone.
 */
function skin(stance: MuscleStance, editing: boolean, tender = false) {
  /*
   * ⛔ THE FOURTH STATE, AND IT IS NOT A STANCE (2026-08-22).
   *
   * A muscle resting off a pain report is not `off`. `off` is a DECISION SHE MADE and it has no
   * expiry; this one was made by the report, lifts itself, and is stored beside her map precisely so
   * it can never be mistaken for a stance she chose (`domain/painReport`: *"her map is HERS, and a
   * tender shoulder must not quietly rewrite a decision she made"*).
   *
   * ⚠️ CLAY, AND CLAY IS THE LAW HERE. `tokens.alert` is reserved — *"the ONLY thing pain and
   * destruction may draw in"* (founder 2026-07-29, after `down` moved to blue and everything that
   * had borrowed clay FOR ITS CLAY went blue with it, the body map's tender halo among them). This
   * is the halo, back, in the colour that was reserved for it.
   *
   * ⚠️ AND IT IS A FILL, NOT A RING. `off` is already an outline; a tender ring on an outlined limb
   * is two line treatments saying two different things about one shape. The limb is PRESENT and it
   * is sore, so it is filled — quietly, at wash weight, with the clay edge stating it.
   */
  if (tender) {
    return { fill: alert.wash, stroke: alert.stage, strokeWidth: editing ? 3 : 1.75 };
  }
  const base =
    stance === 'off'
      ? { fill: 'rgba(241,238,229,0.05)', stroke: 'rgba(241,238,229,0.24)', strokeWidth: 1 }
      : stance === 'emphasis'
        ? /*
           * ⛔ THE CHOICE MUST BE SEEN FROM ARM'S LENGTH (founder, device QA 2026-08-23: he
           * photographed his selected quads — *"מופיע בצבע לבן וזה בדיוק כמו השריר שנלחץ…
           * לא רואים הבדל בכלל"*). The old emphasis wash `#CFE0BE` sits a few luminance points
           * from the normal cream `#E3DED0` — a hue whisper that vanishes on a phone. SATURATED
           * moss + the moss rim: the one lit answer on a page of candidates, the same
           * "moss = the decision" grammar as every selected control in the product.
           */
          { fill: '#A9C49F', stroke: '#8FB27F', strokeWidth: 2.5 }
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
  /**
   * Take the room the parent gives instead of drawing at the floor width — for a screen that hands
   * the body a bounded box and wants it filled. ⚠️ THE PARENT MUST ACTUALLY HAVE A HEIGHT: `flex: 1`
   * inside a scroller that grows with its content is a box of nothing, which is why a scroller's
   * child states `height` instead.
   */
  fill?: boolean;
  /**
   * Whose body is drawn. Absent means the female silhouette — the product's primary athlete, and the
   * safer default when nobody has said: showing a woman a man's body on the screen about her own is
   * the error this prop exists to stop. See `fillerFor`.
   */
  sex?: 'female' | 'male';
  /** A height budget in points, for a parent that cannot give one. */
  height?: number;
  /**
   * Muscles resting off a PAIN REPORT — drawn in clay, and never confused with a stance she chose.
   * See `skin`. Absent on every surface that is only about her map.
   */
  tender?: readonly string[];
}

export function BodyMapFigure({ face, map, selected, onSelect, fill, height, sex, tender }: BodyMapFigureProps) {
  const isTender = (m: string) => !!tender?.includes(m);
  const zones = zonesFor(sex)[face];
  const flip = `translate(${BOX.w}, 0) scale(-1, 1)`;

  /*
   * ⛔ THE STAGE IS MEASURED, BECAUSE `aspectRatio` AND `maxWidth` TOGETHER LIE (2026-08-18).
   *
   * The stage was `{ width: '100%', maxWidth: 220, aspectRatio: 200 / 440 }`, and Yoga resolves those
   * three in an order that cannot be right: it derives the HEIGHT from the full 100% width — 378 pt
   * of a You tab, so 831 pt tall — and only THEN clamps the width back to 220. So the box the figure
   * lived in was 220 × 831, and `<Svg>` fits its viewBox into a box and CENTRES it: a 220 × 484
   * drawing with 173 pt of nothing above its head and 173 below its feet.
   *
   * That is the founder's screenshot exactly — *"הגוף למטה"* — a body slumped down the screen under a
   * dead band. And the band was not merely air: **the press targets are laid out as percentages of
   * THE BOX**, so they were spread over 831 pt while the muscles were drawn in the middle 484. Every
   * hit rectangle sat below its muscle, by up to a hand's width.
   *
   * The box is now the drawing's own rectangle in points, computed from the room the parent actually
   * gives and anchored at the TOP of it. Drawing and targets share one rect by construction, and
   * there is no `aspectRatio` left for a max constraint to argue with.
   */
  const [room, setRoom] = useState<{ w: number; h: number } | null>(null);
  /** A parent that states a height is one the figure may fill; anywhere else it sizes itself. */
  const bounded = fill || height != null;
  const drawn = room
    ? bounded
      ? Math.max(STAGE_FLOOR_W, Math.min(room.w, room.h / RATIO))
      : Math.min(room.w, STAGE_FLOOR_W)
    : STAGE_FLOOR_W;

  return (
    <View
      style={[styles.room, bounded && styles.roomFloor, fill && styles.roomFill, height != null && { height }]}
      onLayout={(e) => {
        const { width, height: h } = e.nativeEvent.layout;
        setRoom((r) => (r && Math.abs(r.w - width) < 0.5 && Math.abs(r.h - h) < 0.5 ? r : { w: width, h }));
      }}
    >
      <View style={[styles.stage, { width: drawn, height: drawn * RATIO }]}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${BOX.w} ${BOX.h}`}>
          {/* The body first, dim — it is the ground the muscles sit on, never a target. */}
          <Ellipse {...HEAD} fill={FILL_IDLE} />
          {fillerFor(sex).map((d, i) => (
            <Path key={`filler-${i}`} d={d} fill={FILL_IDLE} />
          ))}

          {zones.map((z) => {
            const s = skin(map[z.muscle] ?? 'normal', selected === z.muscle, isTender(z.muscle));
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
          /* ⚠️ THE SPOKEN STATE FOLLOWS THE DRAWN ONE. A limb drawn in clay and announced as
             "normal" is the screen reader being told a different thing from the eye — the exact
             failure `everyScreenShowsTheEngineNumber` exists to stop, one sense over. */
          const word = isTender(z.muscle)
            ? tg('pain.stanceResting')
            : tg(
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

                ⚠️ AND NEVER ON A TENDER MUSCLE (audit 2026-08-24). The badge says "I lead with this";
                tender says "this hurts". On the pain screen both landed on one shape — a moss dot for
                the raise, centred inside the clay for the injury — and the muscle she is reporting on
                is exactly the one whose emphasis is about to change. A screen that states a training
                decision on top of the report that will revise it is arguing with itself in the one
                place it must be plain. The clay is the whole statement; the stance keeps its badge on
                every screen where the stance is what she is being asked about.
              */}
              {stance === 'emphasis' && i === 0 && !isTender(z.muscle) ? <View style={styles.badge} /> : null}
            </Pressable>
          ));
        })}
      </View>
    </View>
  );
}

/**
 * ⛔ THE NARROWEST THE FIGURE EVER DRAWS, published because a TARGET SIZE CANNOT BE CHECKED WITHOUT
 * IT. A press rectangle 34 units wide is 42 pt here and 26 pt if this number drops to 150 — the same
 * geometry, one of them under Apple's 44 pt floor.
 *
 * ⚠️ IT IS A FLOOR NOW, NOT A CEILING. It was the one width the figure drew at everywhere; a screen
 * that hands the body its whole box (`fill`, or a `height`) draws it as large as that box allows and
 * never below this, so the law below still describes the worst case.
 *
 * ⚠️ AND THE GEOMETRY NO LONGER DEPENDS ON IT. Sized to the drawn muscle, a calf's target was 36
 * units — which clears 44 pt only while this number stays at 250, and the figure has to shrink the
 * moment it shares a screen with a back arrow, a stance sheet and a footer. Every limb target now
 * reaches OUTWARD into the empty space beside the limb until it is at least 44 units on both sides,
 * so the floor holds at ANY stage width from 200 pt up. The law asserts both: the size in points
 * here, and the size in units that stops this from being a number nobody may touch.
 */
export const STAGE_FLOOR_W = 220;

const styles = StyleSheet.create({
  /*
   * The room the parent gives, and the figure's own rectangle inside it — TOP-ANCHORED, because a
   * body hanging in the middle of a taller box is the whole defect this pair of views replaced.
   */
  room: { width: '100%', alignSelf: 'center', alignItems: 'center' },
  roomFill: { flex: 1 },
  /*
   * ⚠️ AND THE ROOM ITSELF NEVER SHRINKS BELOW THE FIGURE. A page can offer a box too short for the
   * floor width — the You tab on a small phone does — and the figure holds the floor because below it
   * a thumb stops landing on a muscle. Without this the body would then spill over whatever the page
   * drew under it; with it the page grows and scrolls, which is the honest way to be out of room.
   */
  roomFloor: { minHeight: STAGE_FLOOR_W * RATIO },
  stage: { position: 'relative' },
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
