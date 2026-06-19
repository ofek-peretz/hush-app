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
  | 'settings'; // gearshape

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
    default:
      return null;
  }
}
