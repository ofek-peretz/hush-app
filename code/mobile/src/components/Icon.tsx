/**
 * Icon — dependency-free SVG icon set (react-native-svg), mapping the spec's
 * SF-Symbol references (§2.5) to clean vector glyphs. No font/native-icon library
 * is used (would require a dev-client rebuild); these are real vectors, satisfying
 * the spec rule "no raw text glyphs for icons anywhere".
 *
 * Stroke-based by default; `filled` switches the tab glyphs to a solid look for
 * the active tab. Color/size/strokeWidth are caller-controlled.
 *
 * FOUNDER RULING 2026-07-12 — CLOSED: the stroke weight stays as it is. It was proposed that
 * every icon be thinned to match the font's stroke (~1.5px) for typographic harmony. Rejected:
 * LEGIBILITY BEATS AESTHETICS. A slightly heavy glyph that is recognised in a fraction of a
 * second across a gym is worth more than a harmonious one that disappears at 16px.
 */
import React from 'react';
import { I18nManager } from 'react-native';
import Svg, { Path, Rect, Circle, Line, G } from 'react-native-svg';
import { color as tokens } from '@/design/tokens';

export type IconName =
  | 'menu' // line.3.horizontal (hamburger)
  | 'chevronRight'
  | 'chevronLeft'
  | 'chevronUp'
  | 'chevronDown'
  | 'pause' // pause.fill
  | 'swap' // arrow.left.arrow.right
  | 'check' // checkmark
  | 'close' // xmark
  | 'grip' // reorder handle
  | 'home' // house / house.fill
  | 'todayRange' // v7 2.1 — the brand's measured range with the dot at centre (the Today tab)
  | 'lineChart' // v7 2.1 — a bare polyline, no arrowhead (the Progress tab)
  | 'program' // square.grid.2x2
  | 'history' // clock.arrow.circlepath
  | 'portrait' // chart.bar / chart.bar.fill
  | 'settings' // gearshape
  | 'user' // a person — the "You" tab
  | 'play' // play (lucide outline triangle — Begin)
  | 'playCircle' // circle-play (Form)
  | 'repeat' // repeat (Swap)
  | 'pencil' // pencil (Edit result)
  | 'checkCircle' // circle-check (Ready)
  | 'sliders' // sliders.horizontal
  | 'calendar' // calendar-range
  | 'trendingUp' // trending-up
  | 'layers' // layers
  | 'plate' // a weight plate, face-on — the "add N + N per side" instruction
  | 'lock' // lock
  | 'pin' // pin — "pinned / protected" (the lock affordance; not a security padlock)
  | 'minus' // minus — calm "matched / held" verdict mark
  | 'circle' // circle-dashed (remaining workout)
  | 'dumbbell' // dumbbell (history)
  | 'shield' // shield-check (consent)
  | 'heart' // heart-pulse (health)
  | 'footprints' // footprints (a recorded walk)
  | 'runner' // a running figure (Open training: run / walk)
  | 'wind' // wind (walk mode)
  | 'flag' // flag (finish a cardio activity)
  | 'flame' // flame (calories burned — cardio)
  | 'checkCheck' // check-check (cardio recorded)
  | 'activity' // pulse waveform (cardio record header — v7 3.3c)
  | 'star' // a solid five-point star — a MARK EARNED (v7 3.2b Milestones)
  | 'plus' // plus — "where it began", inside a dashed ring (v7 3.2b)
  | 'alert' // a warning triangle — the ONE place it appears is the pain door (v7 13.1)
  | 'share' // a tray with an arrow out of it — sending a plan link (v7 11.4)
  | 'twoPeople' // two figures — the door to the share cards, from Today (v7 2.1)
  | 'eyeOff' // an eye, struck — "this does NOT travel" (v7 11.4's privacy line)
  | 'watch'; // a watch on its band, crown at the side — the wrist (10.4)

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  filled?: boolean; // tab glyphs: solid when active
  /** Opt OUT of RTL geometry mirroring — for a glyph that is a MEDIA TRANSPORT rather than a
   *  direction of travel (the ▶ on a video). See the note above `resolveDirection`. */
  noMirror?: boolean;
}

/**
 * The horizontal chevrons are DIRECTIONAL (back / forward / disclosure) everywhere
 * they're used in this app, so they must mirror under RTL — a frozen SVG glyph won't.
 * `trendingUp` and `swap` are NOT mirrored (a rising trend rises the same way in every
 * language; an exchange glyph is a cycle, not a direction). Vertical chevrons are neutral.
 *
 * `play` DOES mirror now (founder 2026-07-12: "the start-workout arrow points the opposite
 * way to every other arrow on the screen"). The iOS convention that freezes a play triangle
 * is about a MEDIA TRANSPORT — the ▶ on a video, which means "run the tape", not "go that
 * way". Ours is not that. It sits on "Begin Push A" and "Start run", beside a row of
 * disclosure chevrons that all point to the start of the line, and it means GO FORWARD.
 * Forward in Hebrew is leftward.
 *
 * The one place `play` IS a transport is the video player (components/FormMedia), and a
 * backwards ▶ on a video is nonsense in any language — that call site passes `noMirror`.
 * `playCircle` never mirrors: it is only ever a transport.
 */
function resolveDirection(name: IconName): IconName {
  if (!I18nManager.isRTL) return name;
  if (name === 'chevronLeft') return 'chevronRight';
  if (name === 'chevronRight') return 'chevronLeft';
  return name;
}

/** Glyphs whose SVG geometry must be flipped (no mirrored twin exists to swap to). */
function mirrorsGeometry(name: IconName): boolean {
  return I18nManager.isRTL && name === 'play';
}

export function Icon({ name, size = 22, color = tokens.textPrimary, strokeWidth = 2, filled, noMirror }: Props) {
  const stroke = color;
  const common = {
    stroke,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      // A geometric flip about the glyph's own centre — the triangle points the way the
      // language reads (see mirrorsGeometry).
      style={!noMirror && mirrorsGeometry(name) ? { transform: [{ scaleX: -1 }] } : undefined}
    >
      {render(resolveDirection(name), { stroke, strokeWidth, filled: !!filled, common })}
    </Svg>
  );
}

function render(
  name: IconName,
  ctx: { stroke: string; strokeWidth: number; filled: boolean; common: object },
) {
  const { stroke, common, filled } = ctx;
  switch (name) {
    case 'menu':
      return (
        <G {...common}>
          <Line x1="3" y1="7" x2="21" y2="7" />
          <Line x1="3" y1="12" x2="21" y2="12" />
          <Line x1="3" y1="17" x2="21" y2="17" />
        </G>
      );
    case 'grip':
      return (
        <G {...common}>
          <Line x1="5" y1="9" x2="19" y2="9" />
          <Line x1="5" y1="15" x2="19" y2="15" />
        </G>
      );
    case 'chevronRight':
      return <Path d="M9 5l7 7-7 7" {...common} />;
    case 'chevronLeft':
      return <Path d="M15 5l-7 7 7 7" {...common} />;
    case 'chevronUp':
      return <Path d="M5 15l7-7 7 7" {...common} />;
    case 'chevronDown':
      return <Path d="M5 9l7 7 7-7" {...common} />;
    case 'pause':
      return (
        <G fill={stroke}>
          <Rect x="6" y="5" width="4" height="14" rx="1.2" />
          <Rect x="14" y="5" width="4" height="14" rx="1.2" />
        </G>
      );
    case 'swap':
      return (
        <G {...common}>
          <Path d="M7 8h12l-3-3" />
          <Path d="M17 16H5l3 3" />
        </G>
      );
    case 'check':
      return <Path d="M5 12.5l4.5 4.5L19 7" {...common} />;
    case 'close':
      return (
        <G {...common}>
          <Line x1="6" y1="6" x2="18" y2="18" />
          <Line x1="18" y1="6" x2="6" y2="18" />
        </G>
      );
    case 'todayRange':
      // v7 2.1 — the Today tab wears the brand's own glyph: a span between two end ticks with
      // the dot landed at its centre. Today IS the measurement, so the tab says so.
      return (
        <G {...common}>
          <Path d="M4 12h16M4 8.5v7M20 8.5v7" />
          <Circle cx="12" cy="12" r="2.6" fill={stroke} stroke="none" />
        </G>
      );
    case 'lineChart':
      // v7 2.1 — Progress: a bare trace, no arrowhead. The shape is the point, not the direction.
      return <Path d="M4 17l6-6 4 3 6-8" {...common} />;
    case 'home':
      return filled ? (
        <Path d="M12 3l9 8h-2v9h-5v-6h-4v6H5v-9H3z" fill={stroke} />
      ) : (
        <Path d="M4 11l8-7 8 7M6 9.5V20h4v-6h4v6h4V9.5" {...common} />
      );
    case 'program':
      return filled ? (
        <G fill={stroke}>
          <Rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <Rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
          <Rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
          <Rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        </G>
      ) : (
        <G {...common}>
          <Rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <Rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
          <Rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
          <Rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        </G>
      );
    case 'history':
      return (
        <G {...common}>
          <Path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
          <Path d="M3.2 4.5v3.6h3.6" />
          <Path d="M12 7.5V12l3 2" />
        </G>
      );
    case 'portrait':
      return filled ? (
        <G fill={stroke}>
          <Rect x="4" y="12" width="3.6" height="8" rx="1" />
          <Rect x="10.2" y="7" width="3.6" height="13" rx="1" />
          <Rect x="16.4" y="4" width="3.6" height="16" rx="1" />
        </G>
      ) : (
        <G {...common}>
          <Rect x="4" y="12" width="3.6" height="8" rx="1" />
          <Rect x="10.2" y="7" width="3.6" height="13" rx="1" />
          <Rect x="16.4" y="4" width="3.6" height="16" rx="1" />
        </G>
      );
    case 'settings':
      return (
        <G {...common}>
          <Circle cx="12" cy="12" r="3.2" />
          <Path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />
        </G>
      );
    case 'user':
      // lucide `user` — a head and shoulders, the "You" tab.
      return (
        <G {...common}>
          <Circle cx="12" cy="9" r="3.6" />
          <Path d="M5.5 19c1.4-3.2 4-4.6 6.5-4.6s5.1 1.4 6.5 4.6" />
        </G>
      );
    case 'play':
      // v7: the Begin CTA's triangle is SOLID — `M8 5v14l11-7z`, filled, no stroke.
      return <Path d="M8 5v14l11-7z" fill={stroke} />;
    case 'playCircle':
      // lucide `circle-play` — the form-clip glyph on every plan row.
      return (
        <G {...common}>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M10 8.5l5 3.5-5 3.5z" fill={stroke} stroke="none" />
        </G>
      );
    case 'repeat':
      // lucide `repeat` — Swap action (two looping arrows).
      return (
        <G {...common}>
          <Path d="M17 2l4 4-4 4" />
          <Path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <Path d="M7 22l-4-4 4-4" />
          <Path d="M21 13v1a4 4 0 0 1-4 4H3" />
        </G>
      );
    case 'pencil':
      // lucide `pencil` — Edit result.
      return (
        <G {...common}>
          <Path d="M12 20h9" />
          <Path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
        </G>
      );
    case 'checkCircle':
      // lucide `circle-check` — Ready confirmation.
      return (
        <G {...common}>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M8.5 12.5l2.5 2.5 4.5-5" />
        </G>
      );
    case 'sliders':
      // lucide `sliders-horizontal` — three rows, each with a knob.
      return (
        <G {...common}>
          <Line x1="4" y1="6" x2="20" y2="6" />
          <Line x1="4" y1="12" x2="20" y2="12" />
          <Line x1="4" y1="18" x2="20" y2="18" />
          <Circle cx="15" cy="6" r="2.5" fill={stroke} stroke="none" />
          <Circle cx="9" cy="12" r="2.5" fill={stroke} stroke="none" />
          <Circle cx="15" cy="18" r="2.5" fill={stroke} stroke="none" />
        </G>
      );
    case 'calendar':
      return (
        <G {...common}>
          <Rect x="3.5" y="5" width="17" height="15" rx="2" />
          <Line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
          <Line x1="8" y1="3" x2="8" y2="6" />
          <Line x1="16" y1="3" x2="16" y2="6" />
        </G>
      );
    case 'trendingUp':
      return (
        <G {...common}>
          <Path d="M3 17l6-6 4 4 8-8" />
          <Path d="M15 7h6v6" />
        </G>
      );
    case 'layers':
      return (
        <G {...common}>
          <Path d="M12 3l9 5-9 5-9-5z" />
          <Path d="M3 13l9 5 9-5" />
        </G>
      );
    case 'lock':
      return (
        <G {...common}>
          <Rect x="5" y="11" width="14" height="9" rx="2" />
          <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </G>
      );
    case 'pin':
      // lucide `pin` — "pinned / protected", the calm lock affordance (not a padlock).
      return (
        <G {...common}>
          <Path d="M12 17v5" />
          <Path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
        </G>
      );
    case 'minus':
      return <Line x1="5" y1="12" x2="19" y2="12" {...common} />;
    case 'circle':
      return <Circle cx="12" cy="12" r="8" {...common} strokeDasharray="3 3" />;
    case 'dumbbell':
      // lucide `dumbbell` (current diagonal form, verbatim) — matches the Claude
      // Design history rows (which render `data-lucide="dumbbell"` from lucide@latest).
      return (
        <G {...common}>
          <Path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z" />
          <Path d="m2.5 21.5 1.4-1.4" />
          <Path d="m20.1 3.9 1.4-1.4" />
          <Path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z" />
          <Path d="m9.6 14.4 4.8-4.8" />
        </G>
      );
    case 'shield':
      return (
        <G {...common}>
          <Path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
          <Path d="M9 12l2 2 4-4" />
        </G>
      );
    case 'heart':
      return (
        <G {...common}>
          <Path d="M12 20s-7-4.3-9.3-8.3C1.3 9 2.3 6 5.2 6c1.8 0 2.9 1 3.8 2.2C9.9 7 11 6 12.8 6c2.9 0 3.9 3 2.5 5.7" />
          <Path d="M3 13h4l2-3 2 5 2-3h6" />
        </G>
      );
    case 'flame':
      // lucide `flame` — the calories-burned glyph on the cardio stage. Rendered filled at the call
      // site (moss) beside a burn figure; a stroke fallback here keeps it legible if drawn outline.
      return (
        <G {...common} fill={filled ? stroke : 'none'}>
          <Path d="M12 22c-3.9 0-7-2.9-7-6.8 0-2.7 1.5-4.7 2.9-6.5.3-.4 1-.2 1 .3.1 1 .4 2 1.2 2.5C10.6 8.7 11.5 5 14 2.4c.4-.4 1-.1 1 .4-.1 2 .5 3.6 1.7 5.1 1.2 1.5 2.3 3.2 2.3 5.3 0 3.9-3.1 6.8-7 6.8z" />
        </G>
      );
    case 'footprints':
      // lucide `footprints` — two staggered footprints.
      return (
        <G {...common}>
          <Path d="M4 16v-2.4a2 2 0 0 1 .6-1.5C5.3 11.4 6 10.3 6 8.5 6 6 5 4 6.5 4S9 6 9 8.5c0 1.6.4 3 .7 4.1.2.7-.4 1.4-1.1 1.4H5.2A1.2 1.2 0 0 0 4 15.2" />
          <Path d="M20 20v-2.4a2 2 0 0 0-.6-1.5c-.7-.7-1.4-1.8-1.4-3.6 0-2.5 1-4.5-.5-4.5S15 10 15 12.5c0 1.6-.4 3-.7 4.1-.2.7.4 1.4 1.1 1.4h3.4a1.2 1.2 0 0 1 1.2 1.2" />
        </G>
      );
    case 'plate':
      // A WEIGHT PLATE, seen face-on: the disc, its rim, and the collar hole.
      //
      // Founder 2026-07-12: this instruction ("Add 20 + 20 per side") used to carry lucide's
      // `layers` glyph — two stacked rhombi, which read as a pair of squares and meant nothing to
      // an athlete standing at a bar. The one thing they are about to pick up is a round plate, so
      // that is what the icon is: the disc and its collar hole, and nothing else. It renders at
      // 18px, where a third ring would close up into mush — two circles is what stays legible in
      // the fraction of a second an athlete gives it.
      return (
        <G {...common}>
          <Circle cx="12" cy="12" r="9" />
          <Circle cx="12" cy="12" r="3" />
        </G>
      );
    case 'runner':
      // A running figure — the head, the driving arm, the split stride.
      // Founder 2026-07-12: `footprints` was abstract enough to read as two cups. Open
      // training is a PERSON moving; the glyph should be unmistakable at 16px.
      return (
        <G {...common}>
          <Circle cx="15.5" cy="4.5" r="1.9" fill={stroke} stroke="none" />
          <Path d="M13.2 20.5l1.6-5-3.1-2.6.9-4.9" />
          <Path d="M12.6 8l-3.4 1.6L8 12.6" />
          <Path d="M12.6 8l3.9 1.7 2.2 3.4h2" />
          <Path d="M11.7 12.9L7.4 15l-2.6 4.4" />
        </G>
      );
    case 'wind':
      // lucide `wind` — three streams of moving air.
      return (
        <G {...common}>
          <Path d="M3 8h9a2.5 2.5 0 1 0-2.5-2.5" />
          <Path d="M3 12h13a2.5 2.5 0 1 1-2.5 2.5" />
          <Path d="M3 16h7a2 2 0 1 1-2 2" />
        </G>
      );
    case 'flag':
      // lucide `flag` — pole + pennant.
      return (
        <G {...common}>
          <Path d="M5 21V4M5 4h11l-1.5 3.5L16 11H5" />
        </G>
      );
    case 'checkCheck':
      // lucide `check-check` — a doubled checkmark (recorded / saved).
      return (
        <G {...common}>
          <Path d="M2 12.5l3.5 3.5L13 8" />
          <Path d="M11 15l1 1 7.5-8" />
        </G>
      );
    case 'activity':
      // lucide `activity` — a single pulse/waveform line. Marks a cardio record
      // (v7 3.3c) in moss beside the serif title.
      return (
        <G {...common}>
          <Path d="M3 12h4l2-6 4 12 2-6h6" />
        </G>
      );
    case 'star':
      // SOLID, not outlined: a milestone is a thing that HAPPENED. It is the only filled glyph in
      // the set, which is exactly why it reads as a seal beside the stroke-drawn rest.
      return <Path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z" fill={stroke} stroke="none" />;
    case 'plus':
      return (
        <G {...common}>
          <Path d="M12 6v12M6 12h12" />
        </G>
      );
    case 'twoPeople':
      /* Traced from the canonical HTML's Today screen (§02) — two heads over two shoulder arcs,
         the second slightly behind the first. It is the door to the SHARE cards, and it says what
         sharing IS here: another person, not a network. Circles carry no stroke-linecap, so they
         are drawn with the same `common` props the paths use. */
      return (
        <G {...common}>
          <Circle cx={8} cy={9} r={2.6} />
          <Circle cx={16} cy={9} r={2.6} />
          <Path d="M3.4 18c.9-2.4 2.6-3.4 4.6-3.4 1.3 0 2.5.4 3.4 1.3" />
          <Path d="M14 15.9c.9-.9 2.1-1.3 3.4-1.3 2 0 3.7 1 4.6 3.4" />
        </G>
      );
    case 'share':
      // lucide `share`/upload — a tray with the arrow rising out of it. Never mirrored: it means
      // "out of this device", not a direction of travel through the text.
      return (
        <G {...common}>
          <Path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" />
          <Path d="M16 6l-4-4-4 4M12 2v13" />
        </G>
      );
    case 'eyeOff':
      return (
        <G {...common}>
          <Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          <Path d="M4 4l16 16" />
        </G>
      );
    case 'watch':
      // The wrist (10.4): the case, the two band stubs above and below it, and the crown on the
      // side. It is a DEVICE, not a clock — no hands inside it, because the one thing this glyph
      // must never say is "time".
      return (
        <G {...common}>
          <Rect x="6" y="6" width="12" height="12" rx="3.6" />
          <Path d="M9 6V3.6h6V6" />
          <Path d="M9 18v2.4h6V18" />
          <Path d="M19.6 10.4v3.2" />
        </G>
      );
    case 'alert':
      // lucide `triangle-alert`. It marks the pain door and nothing else — Hush does not warn.
      return (
        <G {...common}>
          <Path d="M10.3 3.9L2.6 17.5A2 2 0 004.3 20.5h15.4a2 2 0 001.7-3l-7.7-13.6a2 2 0 00-3.4 0z" />
          <Path d="M12 8v5" />
          <Path d="M12 16.4v.2" />
        </G>
      );
    default:
      return null;
  }
}
