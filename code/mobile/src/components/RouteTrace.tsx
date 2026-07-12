/**
 * RouteTrace — the path the athlete actually ran, drawn as an engraved line.
 *
 * Founder 2026-07-12 asked for a map on the run summary. This is deliberately NOT a
 * tiled map: a Google/Apple map tile drops a foreign visual language (someone else's
 * roads, someone else's typography, someone else's colour) into the middle of an
 * instrument that has spent its whole life avoiding decoration — and it costs a native
 * SDK, an API key, and a network round-trip to show the athlete something they already
 * know (they were there).
 *
 * What they DON'T know is the SHAPE of what they did, and that is the whole point of a
 * route on a summary: the loop, the out-and-back, the block they circled twice. So the
 * trace is exactly that — the GPS polyline, normalised into the frame, with the start and
 * finish marked. An engraved line on graphite. It reads as a plotter output, which is what
 * it is, and it works with no key, no tiles and no network.
 *
 * A run with no lock (treadmill, no permission) has no route, and the caller renders
 * nothing rather than an empty box.
 */
import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import type { CardioPoint } from '@/data/local/models';
import { stage, signal, up, radius } from '@/design/tokens';

interface Props {
  route: CardioPoint[];
  width: number;
  height: number;
  style?: ViewStyle | ViewStyle[];
}

/** Enough points to be a shape rather than a smudge. */
export const MIN_ROUTE_POINTS = 8;

/**
 * Project lat/lon into the frame, preserving the route's true ASPECT RATIO — an
 * out-and-back down one street must not be stretched into a square, or the athlete is
 * looking at a shape they never ran. Longitude is scaled by cos(latitude) so a degree of
 * east-west reads at its real ground distance. Pure + exported for unit coverage.
 */
export function projectRoute(route: CardioPoint[], width: number, height: number, pad: number): string {
  if (route.length < 2) return '';
  const lat0 = route.reduce((a, p) => a + p.lat, 0) / route.length;
  const kx = Math.cos((lat0 * Math.PI) / 180); // east-west foreshortening at this latitude

  const xs = route.map((p) => p.lon * kx);
  const ys = route.map((p) => -p.lat); // north is up, so latitude inverts
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  // One scale for BOTH axes — the shape is preserved, and the smaller axis is centred.
  const scale = Math.min(spanX > 0 ? innerW / spanX : Infinity, spanY > 0 ? innerH / spanY : Infinity);
  const s = Number.isFinite(scale) ? scale : 1;
  const offX = pad + (innerW - spanX * s) / 2;
  const offY = pad + (innerH - spanY * s) / 2;

  return xs
    .map((x, i) => {
      const px = offX + (x - minX) * s;
      const py = offY + (ys[i] - minY) * s;
      return `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`;
    })
    .join(' ');
}

/** The projected pixel position of one point (start / finish markers). */
function endpoints(route: CardioPoint[], width: number, height: number, pad: number): { sx: number; sy: number; ex: number; ey: number } | null {
  const d = projectRoute(route, width, height, pad);
  if (!d) return null;
  const cmds = d.split(/[ML]/).filter(Boolean).map((c) => c.trim().split(' ').map(Number));
  const first = cmds[0];
  const last = cmds[cmds.length - 1];
  if (!first || !last) return null;
  return { sx: first[0], sy: first[1], ex: last[0], ey: last[1] };
}

export function RouteTrace({ route, width, height, style }: Props) {
  const pad = 18;
  const d = projectRoute(route, width, height, pad);
  const ends = endpoints(route, width, height, pad);
  if (!d || !ends) return null;

  return (
    <View style={[styles.frame, { width, height }, style]}>
      <Svg width={width} height={height}>
        {/* the plotter's paper — a faint grid corner, so the trace has something to sit on */}
        <Rect x={0} y={0} width={width} height={height} fill={stage[1]} rx={radius.lg} />
        {/* the run */}
        <Path d={d} stroke={signal[0]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {/* start: an open ring. finish: a filled mark. */}
        <Circle cx={ends.sx} cy={ends.sy} r={4.5} stroke={stage.ink0} strokeWidth={1.75} fill={stage[1]} />
        <Circle cx={ends.ex} cy={ends.ey} r={4.5} fill={up[0]} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.lg, overflow: 'hidden' },
});
