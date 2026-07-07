/**
 * MotionFigure — the React Native renderer for a motion rig. It consumes the SAME `Primitive[]`
 * that the CI validator and the review harness use (via `buildFrame`), so what ships matches what
 * was reviewed and validated exactly. A lightweight rAF clock advances the range-of-motion
 * fraction over the canonical loop; Reduce Motion freezes it at the start position (both range
 * ticks still mark the endpoints). Muted, no controls — a living illustration, not a player.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';
import type { Primitive, Rig } from '../types';
import { buildFrame, VIEWBOX } from '../frame';
import { romAt, loopDurationMs } from '../timeline';
import { hex } from '../palette';

interface Props {
  rig: Rig;
  style?: ViewStyle;
}

function useMotionRom(rig: Rig): number {
  const [rom, setRom] = useState(0);
  const start = useRef<number>(Date.now());
  const reduce = useRef(false);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      reduce.current = on;
      if (on) setRom(0);
    });
    const loop = loopDurationMs(rig.formspec.tempo);
    const tick = () => {
      if (!alive) return;
      if (!reduce.current) setRom(romAt(Date.now() - start.current, rig.formspec.tempo));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
    // loop is derived from the rig; re-run only when the rig identity changes
  }, [rig]);

  return rom;
}

function renderPrimitive(p: Primitive, i: number): React.ReactElement | null {
  switch (p.kind) {
    case 'line':
    case 'dash':
      return (
        <Line
          key={i}
          x1={p.a.x}
          y1={p.a.y}
          x2={p.b.x}
          y2={p.b.y}
          stroke={hex(p.color)}
          strokeWidth={p.w}
          strokeOpacity={p.opacity ?? 1}
          strokeLinecap={p.kind === 'line' ? p.cap ?? 'round' : 'round'}
          strokeDasharray={p.kind === 'dash' ? `${p.dash[0]},${p.dash[1]}` : undefined}
        />
      );
    case 'polyline':
      return (
        <Polyline
          key={i}
          points={p.pts.map((pt) => `${pt.x},${pt.y}`).join(' ')}
          fill="none"
          stroke={hex(p.color)}
          strokeWidth={p.w}
          strokeOpacity={p.opacity ?? 1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case 'quad':
      return (
        <Path
          key={i}
          d={`M ${p.a.x} ${p.a.y} Q ${p.c.x} ${p.c.y} ${p.b.x} ${p.b.y}`}
          fill="none"
          stroke={hex(p.color)}
          strokeWidth={p.w}
          strokeOpacity={p.opacity ?? 1}
          strokeLinecap="round"
        />
      );
    case 'circle':
      return (
        <Circle
          key={i}
          cx={p.c.x}
          cy={p.c.y}
          r={p.r}
          fill={p.fill ? hex(p.fill) : 'none'}
          fillOpacity={p.fillOpacity ?? 1}
          stroke={p.stroke ? hex(p.stroke) : undefined}
          strokeWidth={p.w ?? 0}
        />
      );
    case 'rect':
      return (
        <Rect
          key={i}
          x={p.x}
          y={p.y}
          width={p.width}
          height={p.height}
          rx={p.rx ?? 0}
          fill={p.fill ? hex(p.fill) : 'none'}
          stroke={p.stroke ? hex(p.stroke) : undefined}
          strokeWidth={p.w ?? 0}
        />
      );
    case 'ellipse':
      return (
        <Ellipse key={i} cx={p.c.x} cy={p.c.y} rx={p.rx} ry={p.ry} fill={hex(p.fill)} fillOpacity={p.opacity ?? 1} />
      );
    case 'poly':
      return (
        <Polygon
          key={i}
          points={p.pts.map((pt) => `${pt.x},${pt.y}`).join(' ')}
          fill={hex(p.fill)}
          fillOpacity={p.opacity ?? 1}
        />
      );
    case 'path': {
      const d =
        `M ${p.start.x} ${p.start.y} ` +
        p.segs.map((s) => `C ${s.c1.x} ${s.c1.y} ${s.c2.x} ${s.c2.y} ${s.to.x} ${s.to.y}`).join(' ') +
        (p.closed ? ' Z' : '');
      return (
        <Path
          key={i}
          d={d}
          fill={p.fill ? hex(p.fill) : 'none'}
          fillOpacity={p.opacity ?? 1}
          stroke={p.stroke ? hex(p.stroke) : undefined}
          strokeWidth={p.w ?? 0}
        />
      );
    }
    default:
      return null;
  }
}

export function MotionFigure({ rig, style }: Props) {
  const rom = useMotionRom(rig);
  const prims = buildFrame(rig, rom);
  return (
    <View style={style} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}>
        <G>{prims.map(renderPrimitive)}</G>
      </Svg>
    </View>
  );
}
