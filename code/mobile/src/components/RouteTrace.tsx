/**
 * RouteTrace — the path the athlete actually ran, drawn as an engraved line.
 *
 * FOUNDER RULING 2026-07-12 — CLOSED, do not reopen: no map SDK, ever. A tiled map drags in
 * API keys, third-party tracking, heavy data use on a run, and it destroys the minimal language
 * with foreign colours and street labels. The athlete is not navigating to Paris; they want to
 * see the shape of the effort they just made. The engraved polyline on graphite is the answer.
 *
 * This is deliberately NOT a tiled map: a Google/Apple map tile drops a foreign visual language (someone else's
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
import { stage, up, radius } from '@/design/tokens';

interface Props {
  route: CardioPoint[];
  width: number;
  height: number;
  style?: ViewStyle | ViewStyle[];
}

/** Enough points to be a shape rather than a smudge. */
export const MIN_ROUTE_POINTS = 8;

/**
 * The most points worth KEEPING for a route.
 *
 * GPS fires roughly once a second, so an hour's run is ~3,600 fixes. All cardio activities live
 * in ONE AsyncStorage value, which History parses in full every time it opens — persisting raw
 * traces would put megabytes there within a few months, for a picture that is 300px wide and
 * cannot resolve two points a metre apart anyway. 300 points draws every loop, switchback and
 * out-and-back a human can see, at ~7 KB a run.
 */
export const MAX_ROUTE_POINTS = 300;

/**
 * Thin a route to at most `max` points by even stride, always keeping the first and the last —
 * the start and finish markers must land where the athlete actually started and stopped.
 * Pure + exported: this runs before persistence, so getting it wrong would silently corrupt the
 * record rather than just the picture.
 */
export function simplifyRoute(route: CardioPoint[], max: number = MAX_ROUTE_POINTS): CardioPoint[] {
  if (route.length <= max) return route;
  const out: CardioPoint[] = [];
  const stride = (route.length - 1) / (max - 1);
  for (let i = 0; i < max - 1; i++) out.push(route[Math.round(i * stride)]);
  out.push(route[route.length - 1]); // the finish, exactly
  return out;
}

/**
 * Project lat/lon into the frame, preserving the route's true ASPECT RATIO — an
 * out-and-back down one street must not be stretched into a square, or the athlete is
 * looking at a shape they never ran. Longitude is scaled by cos(latitude) so a degree of
 * east-west reads at its real ground distance. Pure + exported for unit coverage.
 */
export function projectPoints(route: CardioPoint[], width: number, height: number, pad: number): Array<[number, number]> {
  if (route.length < 2) return [];
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

  return xs.map((x, i): [number, number] => [offX + (x - minX) * s, offY + (ys[i] - minY) * s]);
}

/** The SVG path for a projected route. Separated from the projection so the endpoints (the
 *  start / finish markers) come from the SAME pass rather than a second, re-parsed one. */
export function projectRoute(route: CardioPoint[], width: number, height: number, pad: number): string {
  return projectPoints(route, width, height, pad)
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
}

export function RouteTrace({ route, width, height, style }: Props) {
  const pad = 18;
  // Thinned before drawing too — a live summary hands us the raw fix list, and a 3,600-command
  // SVG path is a lot of work for a picture whose pixels cannot resolve it.
  const pts = React.useMemo(() => projectPoints(simplifyRoute(route), width, height, pad), [route, width, height]);
  if (pts.length < 2) return null;

  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [sx, sy] = pts[0];
  const [ex, ey] = pts[pts.length - 1];

  return (
    <View style={[styles.frame, { width, height }, style]}>
      <Svg width={width} height={height}>
        {/* the plotter's paper — a faint grid corner, so the trace has something to sit on */}
        <Rect x={0} y={0} width={width} height={height} fill={stage[1]} rx={radius.lg} />
        {/* the run */}
        {/* The route is data, and this surface is always the stage (it paints its own).
            Data gets the strongest ink its world has — it was the ochre until 2026-07-17. */}
        <Path d={d} stroke={stage.ink0} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {/* start: an open ring. finish: a filled mark. */}
        <Circle cx={sx} cy={sy} r={4.5} stroke={stage.ink0} strokeWidth={1.75} fill={stage[1]} />
        <Circle cx={ex} cy={ey} r={4.5} fill={up.stage} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.lg, overflow: 'hidden' },
});
