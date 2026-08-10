/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE BODY SHE TOUCHES — the ten muscles as a figure, front and back.
 *
 * ⛔ FOUNDER, 2026-08-08: *"גוף אחד שלוחצים עליו"* — one body she presses, carrying all three of her
 * decisions about a muscle: lead with it, leave it, or turn it off.
 *
 * ── THE GEOMETRY IS THE V7 HANDOFF'S, NOT AN INVENTION ──────────────────────────────────────────
 * Screen 4.1 · BODY MAP in `Hush v7 — All Dark` draws the figure as ROUNDED RECTANGLES — a head, two
 * shoulder caps, two chest slabs, two arms, an abdomen and two thighs — and it is a better answer
 * than the anatomical silhouette this file held first. The first version traced muscle outlines in
 * SVG, which looks more like a body and is worse at being one: a limb outline is a sliver a thumb
 * misses, and `react-native-svg`'s press handling is the least portable part of that library.
 *
 * A muscle here IS its touch target. The shape you see is the region that responds, at the size the
 * designer drew it, with no invisible hit box compensating for a shape too thin to press. That also
 * removes the SVG dependency from this screen entirely.
 *
 * His three states come from the same handoff: normal is cream, a LEAD is cream tinted toward moss
 * with a moss hairline and a badge, and the muscle being edited takes a bright border and a ring.
 *
 * ── WHY NOT A 3D MODEL ──────────────────────────────────────────────────────────────────────────
 * He asked whether this needed the kind of 3D body MoveKit has. A 3D rig is for DEMONSTRATING A
 * MOVEMENT — showing a joint travel through space. This screen answers "which muscle", and for that
 * a drawn figure is the better instrument, not a compromise: instant, offline, legible in either
 * language, and kilobytes. A body that rotates in order to say "my shoulder hurts" is ceremony
 * charged to her loading time.
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
import { color } from '@/design/tokens';
import { tg } from '@/i18n';
import type { MuscleStance } from '@/data/local/models';

export type Face = 'front' | 'back';

/** A muscle's shape, in the 200 × 380 body box both faces share. `x` is the LEFT limb; `mirror` the right. */
export interface Zone {
  muscle: string;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  /** Left edge of the mirrored copy. Present on limbs; absent on the midline shapes. */
  mirror?: number;
}

/* The handoff's proportions, centred in a 200-wide box: shoulder 54×24 r13, chest 56×50 r15,
 * arm 25×92 r13, abdomen 90×82 r17, thigh 42×126 r21. Verticals are its own: 44 / 74 / 78 / 132 / 224. */
export const ZONES: { front: Zone[]; back: Zone[] } = {
  front: [
    { muscle: 'Shoulders', x: 16, y: 44, w: 54, h: 24, r: 12, mirror: 130 },
    { muscle: 'Chest', x: 44, y: 74, w: 54, h: 50, r: 15, mirror: 102 },
    { muscle: 'Biceps', x: 4, y: 80, w: 25, h: 92, r: 12, mirror: 171 },
    { muscle: 'Core', x: 55, y: 132, w: 90, h: 82, r: 17 },
    { muscle: 'Quads', x: 56, y: 224, w: 42, h: 126, r: 21, mirror: 102 },
  ],
  back: [
    { muscle: 'Back', x: 44, y: 44, w: 112, h: 96, r: 17 },
    { muscle: 'Triceps', x: 4, y: 80, w: 25, h: 92, r: 12, mirror: 171 },
    { muscle: 'Glutes', x: 55, y: 148, w: 90, h: 58, r: 17 },
    { muscle: 'Hamstrings', x: 56, y: 214, w: 42, h: 92, r: 20, mirror: 102 },
    { muscle: 'Calves', x: 60, y: 312, w: 34, h: 62, r: 16, mirror: 106 },
  ],
};

/** The face a muscle is drawn on. Unknown → front, so a new muscle is visible rather than lost. */
export function viewOf(muscle: string): Face {
  return ZONES.back.some((z) => z.muscle === muscle) ? 'back' : 'front';
}

const BOX = { w: 200, h: 380 };
const pct = (n: number, of: number) => `${(n / of) * 100}%`;

/** The handoff's three states. Cream is resting; moss is "a decision made", as everywhere else. */
function skin(stance: MuscleStance, editing: boolean) {
  const base =
    stance === 'off'
      ? { backgroundColor: 'rgba(241,238,229,0.06)', borderColor: 'rgba(241,238,229,0.16)', borderWidth: 1 }
      : stance === 'emphasis'
        ? { backgroundColor: '#E0E8D6', borderColor: '#A9C49F', borderWidth: 1.5 }
        : { backgroundColor: '#E3DED0', borderColor: 'rgba(241,238,229,0.12)', borderWidth: 1 };
  return editing ? { ...base, borderColor: '#F1EEE5', borderWidth: 2 } : base;
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

  const shape = (z: Zone, left: number, key: string, stance: MuscleStance, editing: boolean) => (
    <View
      key={key}
      pointerEvents="none"
      style={[
        styles.piece,
        skin(stance, editing),
        {
          left: pct(left, BOX.w),
          top: pct(z.y, BOX.h),
          width: pct(z.w, BOX.w),
          height: pct(z.h, BOX.h),
          borderRadius: z.r,
        },
        editing && styles.ring,
      ]}
    />
  );

  return (
    <View style={styles.stage}>
      {/* The head — never a muscle, only what makes the shapes read as a person. */}
      <View style={[styles.head, { left: pct(83, BOX.w), width: pct(34, BOX.w), height: pct(34, BOX.h) }]} />

      {zones.map((z) => {
        const stance = map[z.muscle] ?? 'normal';
        const editing = selected === z.muscle;
        return (
          <React.Fragment key={z.muscle}>
            {shape(z, z.x, `${z.muscle}-a`, stance, editing)}
            {z.mirror != null ? shape(z, z.mirror, `${z.muscle}-b`, stance, editing) : null}
          </React.Fragment>
        );
      })}

      {/*
        THE PRESSABLE IS THE SHAPE, at the size it is drawn — no invisible hit box compensating for a
        shape too thin to press, because none of these is. One control per muscle, named and stateful,
        which is also exactly what VoiceOver reads out.
      */}
      {zones.map((z) => {
        const stance = map[z.muscle] ?? 'normal';
        const name = tg(`muscle.${z.muscle}`);
        const word = tg(
          stance === 'off' ? 'ob.stanceOff' : stance === 'emphasis' ? 'ob.stanceEmphasis' : 'ob.stanceNormal',
        );
        // The press area spans BOTH limbs where a muscle has two, so the pair is one decision.
        const left = z.mirror != null ? Math.min(z.x, z.mirror) : z.x;
        const right = z.mirror != null ? Math.max(z.x, z.mirror) + z.w : z.x + z.w;
        return (
          <Pressable
            key={z.muscle}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${word}`}
            accessibilityState={{ selected: selected === z.muscle }}
            onPress={() => onSelect(z.muscle)}
            style={[
              styles.hit,
              { left: pct(left, BOX.w), top: pct(z.y, BOX.h), width: pct(right - left, BOX.w), height: pct(z.h, BOX.h) },
            ]}
          >
            {/*
              A DOT, NOT A LETTER. The handoff's badge carries a glyph, and at 17 px that glyph is
              9 pt — under the 13 pt floor `typeHasAFloor` holds every surface to. A mark does not
              need to be read: the muscle beneath it is already moss, and the stance is spoken in
              the control's own accessibility label. So the badge says the same thing without type.
            */}
            {stance === 'emphasis' ? <View style={styles.badge} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', aspectRatio: BOX.w / BOX.h, alignSelf: 'center', maxWidth: 240 },
  head: {
    position: 'absolute', top: 0, borderRadius: 999,
    backgroundColor: '#E3DED0', borderWidth: 1, borderColor: 'rgba(241,238,229,0.12)',
  },
  piece: { position: 'absolute' },
  ring: { shadowColor: '#F1EEE5', shadowOpacity: 0.28, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  hit: { position: 'absolute', alignItems: 'flex-end', justifyContent: 'flex-start' },
  badge: {
    width: 13, height: 13, borderRadius: 7, backgroundColor: '#A9C49F',
    borderWidth: 2, borderColor: color.bg, marginTop: -6, marginEnd: -6,
  },
});
