/**
 * Milestone glyphs (founder 2026-07-12) — a mark must LOOK like what it means.
 *
 * The medallion used to carry a bare figure, so a 60 kg bench and a 60 kg squat
 * struck the same badge, and "you have moved the Statue of Liberty" was engraved as
 * the numeral 250. That is a receipt, not a mark. Every milestone family now has an
 * engraved motif, drawn in the same line language as the rest of the instrument
 * (single weight, no fills, no gradients, no shading):
 *
 *   count    — a tally. The ledger of whole workouts, cut five strokes at a time.
 *   tonnage  — the OBJECT the athlete has now moved. The Statue of Liberty is a statue,
 *              the A380 is an aircraft, the Eiffel Tower is a tower. The copy already
 *              named them; the badge finally shows them.
 *   club     — the LIFT itself, in silhouette. A bench is a body under a bar; a squat is
 *              a bar across the back; a deadlift is a bar on the floor. Two 60 kg clubs
 *              are now unmistakably different objects.
 *   engine   — the two marks Hush earns rather than the athlete: a load rising off the
 *              bar (the first raise), and one bar carrying twice the plates of another
 *              (doubled).
 *
 * Authored on a 48×48 grid, centred, with generous margins so the motif reads at the
 * 24px the gallery renders it at.
 */
import React from 'react';
import Svg, { Path, Circle, Line, G, Rect } from 'react-native-svg';

export type MilestoneGlyphName =
  // count
  | 'tally'
  // tonnage — the object moved
  | 'liberty'
  | 'a380'
  | 'train'
  | 'warship'
  | 'plates'
  | 'eiffel'
  // clubs — the lift
  | 'squat'
  | 'deadlift'
  | 'bench'
  | 'overhead'
  | 'row'
  | 'hipThrust'
  | 'rdl'
  // engine
  | 'raise'
  | 'doubled';

interface Props {
  name: MilestoneGlyphName;
  size: number;
  color: string;
}

export function MilestoneGlyph({ name, size, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {body(name, strokeShape(color), color)}
    </Svg>
  );
}

type Stroke = ReturnType<typeof strokeShape>;
function strokeShape(color: string) {
  return { stroke: color, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' as const };
}

function body(name: MilestoneGlyphName, s: Stroke, color: string): React.ReactNode {
  switch (name) {
    /* ─────────────────────────── count: the ledger ─────────────────────────── */
    case 'tally':
      // Five strokes — four upright, one struck through. The oldest counting mark there is.
      return (
        <G {...s}>
          <Line x1="14" y1="15" x2="14" y2="33" />
          <Line x1="20" y1="15" x2="20" y2="33" />
          <Line x1="26" y1="15" x2="26" y2="33" />
          <Line x1="32" y1="15" x2="32" y2="33" />
          <Line x1="11" y1="33" x2="35" y2="15" />
        </G>
      );

    /* ─────────────────────── tonnage: the object moved ─────────────────────── */
    case 'liberty':
      // The Statue of Liberty: the raised torch arm, the crown, the robe, the pedestal.
      return (
        <G {...s}>
          <Path d="M27 13.5l2-4.5 2 4.5" />
          <Line x1="29" y1="13.5" x2="29" y2="18" />
          <Path d="M18.5 20.5l1-1.2 1.2 1.2 1.3-1.6 1.3 1.6 1.2-1.2 1 1.2" />
          <Path d="M21.5 20.5v2.5" />
          <Path d="M18 39l2.5-13.5c.4-2 1.6-3 3-3s2.6 1 3 3L29 39" />
          <Path d="M24.5 23l4.5-5" />
          <Line x1="15" y1="39" x2="33" y2="39" />
          <Line x1="17" y1="42.5" x2="31" y2="42.5" />
        </G>
      );
    case 'a380':
      // An aircraft from above: the double-delta wing, the fuselage, the tailplane.
      return (
        <G {...s}>
          <Path d="M24 6c1.6 0 2.4 2.2 2.4 5.4v7.2l14 8.6v3.4l-14-4.6v7l4.6 3.4v2.6L24 37.6l-7 1.4v-2.6l4.6-3.4v-7L7.6 30.6v-3.4l14-8.6v-7.2C21.6 8.2 22.4 6 24 6z" />
        </G>
      );
    case 'train':
      // A freight train: the locomotive, a wagon, and the rail beneath.
      return (
        <G {...s}>
          <Path d="M5 16h11a3 3 0 0 1 3 3v10H5z" />
          <Path d="M8 19h5v4H8z" />
          <Line x1="10.5" y1="16" x2="10.5" y2="11" />
          <Path d="M9 11h3" />
          <Path d="M23 20h20v9H23z" />
          <Circle cx="9" cy="32" r="2.6" />
          <Circle cx="15" cy="32" r="2.6" />
          <Circle cx="28" cy="32" r="2.6" />
          <Circle cx="38" cy="32" r="2.6" />
          <Line x1="3" y1="37" x2="45" y2="37" />
        </G>
      );
    case 'warship':
      // A warship: the hull, the superstructure, the mast, the waterline.
      return (
        <G {...s}>
          <Path d="M6 27h36l-4.5 8H11z" />
          <Path d="M16 27v-5h13v5" />
          <Path d="M21 22v-4h5v4" />
          <Line x1="23.5" y1="18" x2="23.5" y2="11" />
          <Path d="M23.5 13.5h6" />
          <Path d="M4 39c3-1.6 5-1.6 8 0s5 1.6 8 0 5-1.6 8 0 5 1.6 8 0 5-1.6 8 0" />
        </G>
      );
    case 'plates':
      // Pure quantity — the one rung in the ladder that names no object: a loaded bar,
      // stacked to the collar. What five thousand tonnes actually looks like on a barbell.
      return (
        <G {...s}>
          <Line x1="4" y1="24" x2="44" y2="24" />
          <Rect x="9" y="12" width="3.4" height="24" rx="1" />
          <Rect x="14" y="15" width="3.4" height="18" rx="1" />
          <Rect x="19" y="18" width="3.4" height="12" rx="1" />
          <Rect x="25.6" y="18" width="3.4" height="12" rx="1" />
          <Rect x="30.6" y="15" width="3.4" height="18" rx="1" />
          <Rect x="35.6" y="12" width="3.4" height="24" rx="1" />
        </G>
      );
    case 'eiffel':
      // The Eiffel Tower: the splayed legs, the two decks, the spire.
      return (
        <G {...s}>
          <Path d="M24 6v5" />
          <Path d="M20.5 11h7" />
          <Path d="M21.6 11l-2 9" />
          <Path d="M26.4 11l2 9" />
          <Path d="M17.5 20h13" />
          <Path d="M19.6 20l-3.4 11" />
          <Path d="M28.4 20l3.4 11" />
          <Path d="M14.5 31h19" />
          <Path d="M16.2 31l-4.2 10" />
          <Path d="M31.8 31l4.2 10" />
          <Path d="M10 41h28" />
          <Path d="M20.5 20l7 11M27.5 20l-7 11" />
        </G>
      );

    /* ─────────────────────────── clubs: the lift ─────────────────────────── */
    case 'squat':
      // A body under a loaded bar across the back, knees bent.
      return (
        <G {...s}>
          {plateBar(color, 12)}
          <Circle cx="24" cy="20" r="2.6" />
          <Path d="M24 22.6v6" />
          <Path d="M24 28.6l-4 5.5V41" />
          <Path d="M24 28.6l4 5.5V41" />
          <Path d="M20 24h8" />
        </G>
      );
    case 'deadlift':
      // The bar on the FLOOR, the athlete hinged over it, arms straight down.
      return (
        <G {...s}>
          <Circle cx="20" cy="13" r="2.6" />
          <Path d="M20 15.6l4.5 5.5" />
          <Path d="M24.5 21.1l-3 8" />
          <Path d="M22.5 22.5l1 12" />
          <Line x1="19.5" y1="21" x2="19.5" y2="33" />
          {plateBar(color, 36)}
        </G>
      );
    case 'bench':
      // A body LYING on a bench, the bar pressed above the chest. The one club that is horizontal.
      return (
        <G {...s}>
          <Line x1="10" y1="32" x2="38" y2="32" />
          <Line x1="14" y1="32" x2="14" y2="40" />
          <Line x1="34" y1="32" x2="34" y2="40" />
          <Circle cx="15.5" cy="28" r="2.4" />
          <Path d="M18 29.5h12" />
          <Path d="M30 29.5l4 8" />
          <Path d="M24 29.5v-6" />
          {plateBar(color, 19)}
        </G>
      );
    case 'overhead':
      // The bar LOCKED OUT overhead — arms extended, body stacked beneath it.
      return (
        <G {...s}>
          {plateBar(color, 10)}
          <Path d="M19 12v6" />
          <Path d="M29 12v6" />
          <Circle cx="24" cy="21" r="2.6" />
          <Path d="M24 23.6v8" />
          <Path d="M19 18l5 5.6 5-5.6" />
          <Path d="M24 31.6l-3.5 9" />
          <Path d="M24 31.6l3.5 9" />
        </G>
      );
    case 'row':
      // Bent over, the bar pulled to the ribs — the one club that pulls rather than presses.
      return (
        <G {...s}>
          <Circle cx="13" cy="17" r="2.6" />
          <Path d="M15.6 18.5L30 22" />
          <Path d="M30 22l1 12" />
          <Path d="M22 20.4v6" />
          {plateBar(color, 28)}
        </G>
      );

    case 'hipThrust':
      // Shoulders on the bench, hips DRIVEN to the ceiling, the bar riding across them. The only
      // club whose bar is carried by the hips — which is the whole reason the lift exists.
      return (
        <G {...s}>
          <Line x1="6" y1="28" x2="17" y2="28" />
          <Line x1="8" y1="28" x2="8" y2="41" />
          <Circle cx="11.5" cy="24.5" r="2.4" />
          <Path d="M14 26.5L26 22.5" />
          <Path d="M26 22.5l7 6.5" />
          <Path d="M33 29v12" />
          {plateBar(color, 20)}
          <Line x1="6" y1="41" x2="42" y2="41" />
        </G>
      );
    case 'rdl':
      // The hinge: legs nearly straight, back flat, the bar hanging at the knee and NEVER touching
      // the floor — which is the one line that separates it from the deadlift above.
      return (
        <G {...s}>
          <Circle cx="16" cy="14" r="2.6" />
          <Path d="M18.6 15.5L28 19" />
          <Path d="M28 19v20" />
          <Line x1="21.5" y1="17" x2="21.5" y2="26" />
          {plateBar(color, 27)}
          <Line x1="10" y1="41" x2="38" y2="41" />
        </G>
      );

    /* ───────────────────────────── engine ───────────────────────────── */
    case 'raise':
      // The load RISING off the bar. Not a medical plus sign: an arrow lifting away from
      // the barbell, which is exactly what the mark records — Hush moved the weight up.
      return (
        <G {...s}>
          {plateBar(color, 36)}
          <Path d="M24 28V10" />
          <Path d="M17.5 16.5L24 10l6.5 6.5" />
        </G>
      );
    case 'doubled':
      // Two bars: the one the athlete started with, and the one they lift now — twice the
      // plates, drawn to scale. The mark is a comparison, so the badge is a comparison.
      return (
        <G {...s}>
          <Line x1="8" y1="15" x2="40" y2="15" />
          <Rect x="21.4" y="10.5" width="2.8" height="9" rx="1" />
          <Rect x="24.8" y="10.5" width="2.8" height="9" rx="1" />
          <Line x1="8" y1="33" x2="40" y2="33" />
          <Rect x="14.6" y="26" width="2.8" height="14" rx="1" />
          <Rect x="18" y="26" width="2.8" height="14" rx="1" />
          <Rect x="21.4" y="26" width="2.8" height="14" rx="1" />
          <Rect x="24.8" y="26" width="2.8" height="14" rx="1" />
          <Rect x="28.2" y="26" width="2.8" height="14" rx="1" />
          <Rect x="31.6" y="26" width="2.8" height="14" rx="1" />
        </G>
      );
  }
}

/** A loaded barbell at height `y` — the shared vocabulary of every lifting glyph. */
function plateBar(color: string, y: number): React.ReactNode {
  const s = strokeShape(color);
  return (
    <G {...s}>
      <Line x1="7" y1={y} x2="41" y2={y} />
      <Rect x="10.6" y={y - 5} width="2.8" height="10" rx="1" />
      <Rect x="14.2" y={y - 4} width="2.4" height="8" rx="1" />
      <Rect x="31.4" y={y - 4} width="2.4" height="8" rx="1" />
      <Rect x="34.6" y={y - 5} width="2.8" height="10" rx="1" />
    </G>
  );
}

export { strokeShape as _strokeShape };
