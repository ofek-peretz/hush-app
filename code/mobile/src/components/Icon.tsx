/**
 * Icon — dependency-free SVG icon set (react-native-svg), mapping the spec's
 * SF-Symbol references (§2.5) to clean vector glyphs. No font/native-icon library
 * is used (would require a dev-client rebuild); these are real vectors, satisfying
 * the spec rule "no raw text glyphs for icons anywhere".
 *
 * Stroke-based by default; `filled` switches the tab glyphs to a solid look for
 * the active tab. Color/size/strokeWidth are caller-controlled.
 */
import React from 'react';
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
  | 'program' // square.grid.2x2
  | 'history' // clock.arrow.circlepath
  | 'portrait' // chart.bar / chart.bar.fill
  | 'settings' // gearshape
  | 'play' // play (lucide outline triangle — Begin)
  | 'playCircle' // circle-play (Form)
  | 'repeat' // repeat (Swap)
  | 'pencil' // pencil (Edit result)
  | 'checkCircle' // circle-check (Ready)
  | 'sliders' // sliders.horizontal
  | 'calendar' // calendar-range
  | 'trendingUp' // trending-up
  | 'layers' // layers
  | 'lock' // lock
  | 'pin' // pin — "pinned / protected" (the lock affordance; not a security padlock)
  | 'minus' // minus — calm "matched / held" verdict mark
  | 'circle' // circle-dashed (remaining workout)
  | 'dumbbell' // dumbbell (history)
  | 'shield' // shield-check (consent)
  | 'heart' // heart-pulse (health)
  | 'footprints' // footprints (Open training: run / walk)
  | 'wind' // wind (walk mode)
  | 'flag' // flag (finish a cardio activity)
  | 'checkCheck'; // check-check (cardio recorded)

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  filled?: boolean; // tab glyphs: solid when active
}

export function Icon({ name, size = 22, color = tokens.textPrimary, strokeWidth = 2, filled }: Props) {
  const stroke = color;
  const common = {
    stroke,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {render(name, { stroke, strokeWidth, filled: !!filled, common })}
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
    case 'play':
      // lucide `play` — a clean rounded triangle (outline), used on Begin CTAs.
      return <Path d="M8 5.2l11 6.8-11 6.8z" {...common} />;
    case 'playCircle':
      // lucide `circle-play` — Form action.
      return (
        <G {...common}>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M10 8.5l5.5 3.5-5.5 3.5z" fill={stroke} />
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
      // lucide-style horizontal dumbbell: outer caps · plates · bar.
      return (
        <G {...common}>
          <Path d="M4 9.5v5M7 7v10M17 7v10M20 9.5v5M7 12h10" />
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
    case 'footprints':
      // lucide `footprints` — two staggered footprints.
      return (
        <G {...common}>
          <Path d="M4 16v-2.4a2 2 0 0 1 .6-1.5C5.3 11.4 6 10.3 6 8.5 6 6 5 4 6.5 4S9 6 9 8.5c0 1.6.4 3 .7 4.1.2.7-.4 1.4-1.1 1.4H5.2A1.2 1.2 0 0 0 4 15.2" />
          <Path d="M20 20v-2.4a2 2 0 0 0-.6-1.5c-.7-.7-1.4-1.8-1.4-3.6 0-2.5 1-4.5-.5-4.5S15 10 15 12.5c0 1.6-.4 3-.7 4.1-.2.7.4 1.4 1.1 1.4h3.4a1.2 1.2 0 0 1 1.2 1.2" />
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
    default:
      return null;
  }
}
