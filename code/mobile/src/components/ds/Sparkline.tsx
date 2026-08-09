/**
 * Sparkline — one lift's trajectory, drawn as a bare line (dataviz: single-series change-over-time,
 * no axes, no legend; the row's own name titles it).
 *
 * "Progress" is a SHAPE over time, and a column of peak numbers is not that shape. This draws the
 * running-max staircase (the entry's `series`): it only ever holds or rises, because the report's
 * premise is that a peak never falls. So there is no dip to misread — the line is the record of PRs.
 *
 * COLOUR: moss (`up`), and this is the one place a hue is right — it is SEMANTIC, not accent: every
 * point of this line is progress by construction (deltaKg ≥ 0), the same meaning moss carries
 * everywhere (a lift that went up, a set that was done). v7 (2026-07-22): Progress is a STAGE screen
 * now, so the line takes `up.stage` (lit moss) — `up[0]` is paper moss, near-invisible on the dark.
 * The current point gets a filled dot — "you are here".
 *
 * Defensive by construction: 0 points draws nothing, 1 point draws a single dot (no line from a
 * point to itself), a flat series draws a flat line at mid-height. It never throws on a degenerate
 * input, because a progress screen must never be the thing that crashes.
 */
// @ts-nocheck

// 

import React from 'react';
import { View } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { up } from '@/design/tokens';

interface Props {
  /** Oldest → newest. Running-max, so non-decreasing — but the component assumes nothing. */
  data: number[];
  width?: number;
  height?: number;
}

export function Sparkline({ data, width = 88, height = 32 }: Props) {
  const pad = 3; // keep the 2px stroke and the end dot off the edges
  const n = data.length;
  if (n === 0) return <View style={{ width, height }} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1; // a flat series has zero span → draw it level, never divide by zero
  const x = (i: number) => (n === 1 ? width / 2 : pad + (i / (n - 1)) * (width - pad * 2));
  // Invert Y (SVG y grows downward): the highest value sits near the top.
  const y = (v: number) => (max === min ? height / 2 : pad + (1 - (v - min) / span) * (height - pad * 2));

  const lastX = x(n - 1);
  const lastY = y(data[n - 1]);

  return (
    <Svg width={width} height={height}>
      {n > 1 ? (
        <Polyline
          points={data.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          fill="none"
          stroke={up.stage}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {/* "You are here" — the current best, always drawn (it is the point of the picture). */}
      <Circle cx={lastX} cy={lastY} r={3} fill={up.stage} />
    </Svg>
  );
}
