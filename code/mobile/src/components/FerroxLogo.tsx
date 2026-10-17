/**
 * FERROX — the brand, drawn (2026-09-16, the rename from Hush).
 *
 * THE MARK: two horns whose flat middle is a bar, and a notch in the bar's underside that
 * cradles the moss dot — the dot Hush carried, now held. Horns = the OX, the bar = the FERR,
 * the dot = "a decision made". Geometry is the master in `brand/logo/export/ferrox-mark.svg`
 * (dot r 10, gap 4, bar 44→60); do not redraw it by eye.
 *
 * THE WORDMARK: geometric wide capitals, stroke 16 on a 100 cap height, tracking 44 — the
 * master is `brand/logo/export/ferrox-wordmark.svg`.
 *
 * Both are vector (react-native-svg), so a poster captured by view-shot keeps them crisp. On
 * the dark stage they default to cream + lit moss; a caller on paper passes ink + deep moss.
 */

//

import React from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { color as tokenColor, signal } from '@/design/tokens';

const MARK_VB = { x: 9.5, y: 16, w: 81, h: 59 };
const MARK_PATH =
  'M62 60 C79 60 88 46 89.5 17 C82 34 74 44 61 44 L39 44 C26 44 18 34 10.5 17 C12 46 21 60 38 60 L36.584 60 A14 14 0 0 1 63.416 60 Z';

interface MarkProps {
  /** The mark's WIDTH in points; the height follows at 59/81. */
  width?: number;
  /** The horns (cream on the stage by default). */
  color?: string;
  /** The dot (lit moss on the stage by default). */
  accent?: string;
}

export function FerroxMark({ width = 28, color = tokenColor.textPrimary, accent = signal[0] }: MarkProps) {
  const height = (width * MARK_VB.h) / MARK_VB.w;
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`${MARK_VB.x} ${MARK_VB.y} ${MARK_VB.w} ${MARK_VB.h}`}
      accessibilityRole="image"
      accessibilityLabel="FERROX"
    >
      <Path d={MARK_PATH} fill={color} />
      <Circle cx={50} cy={64} r={10} fill={accent} />
    </Svg>
  );
}

const WORD_VB = { x: -2, y: -4, w: 704, h: 108 };

interface WordmarkProps {
  /** The wordmark's WIDTH in points; the height follows at 108/704. */
  width?: number;
  color?: string;
}

export function FerroxWordmark({ width = 96, color = tokenColor.textPrimary }: WordmarkProps) {
  const height = (width * WORD_VB.h) / WORD_VB.w;
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`${WORD_VB.x} ${WORD_VB.y} ${WORD_VB.w} ${WORD_VB.h}`}
      accessibilityRole="image"
      accessibilityLabel="FERROX"
    >
      <G fill={color}>
        {/* F */}
        <Rect x={0} y={0} width={16} height={100} />
        <Rect x={0} y={0} width={66} height={16} />
        <Rect x={0} y={40} width={56} height={16} />
        {/* E */}
        <Rect x={110} y={0} width={16} height={100} />
        <Rect x={110} y={0} width={68} height={16} />
        <Rect x={110} y={40} width={60} height={16} />
        <Rect x={110} y={84} width={68} height={16} />
        {/* R */}
        <Path fillRule="evenodd" d="M222 0 H270 A29 29 0 0 1 270 58 H222 Z M238 16 H270 A13 13 0 0 1 270 42 H238 Z" />
        <Rect x={222} y={0} width={16} height={100} />
        <Path d="M258 42 L276.4 42 L302 100 L283.6 100 Z" />
        {/* R */}
        <Path fillRule="evenodd" d="M346 0 H394 A29 29 0 0 1 394 58 H346 Z M362 16 H394 A13 13 0 0 1 394 42 H362 Z" />
        <Rect x={346} y={0} width={16} height={100} />
        <Path d="M382 42 L400.4 42 L426 100 L407.6 100 Z" />
        {/* O */}
        <Path fillRule="evenodd" d="M521 -1.5 A51 51.5 0 1 1 520.99 -1.5 Z M521 14.5 A35 35.5 0 1 0 521.01 14.5 Z" />
        {/* X */}
        <Path d="M616 0 H635.2 L700 100 H680.8 Z" />
        <Path d="M680.8 0 H700 L635.2 100 H616 Z" />
      </G>
    </Svg>
  );
}
