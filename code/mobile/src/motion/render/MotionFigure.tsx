/**
 * MotionFigure — the React Native renderer for a motion rig. It consumes the SAME `Primitive[]`
 * that the CI validator and the review harness use (via `buildFrame`), so what ships matches what
 * was reviewed and validated exactly. A lightweight rAF clock advances the range-of-motion
 * fraction over the canonical loop; Reduce Motion freezes it at the start position (both range
 * ticks still mark the endpoints). Muted, no controls — a living illustration, not a player.
 */

// 

import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';
import type { FigureSex, Primitive, Rig } from '../types';
import { buildFrame, stageFrame, VIEWBOX } from '../frame';
import { romAt, loopDurationMs } from '../timeline';
import { hexOn, type MotionTone } from '../palette';

interface Props {
  rig: Rig;
  /** Which of the two Duotone Athletes demonstrates (default 'male' — the pre-existing figure). */
  figure?: FigureSex;
  style?: ViewStyle;
  /**
   * ════ HOW OFTEN THE POSE IS REBUILT, WHEN THE FIGURE IS NOT THE SUBJECT (2026-08-31) ════
   *
   * Absent = every frame, which is what the FORM door wants: there the clip IS the screen, she has
   * opened it on purpose to study a movement, and it should be as smooth as the device allows.
   * Every existing caller is unchanged by construction.
   *
   * ⛔ IT EXISTS FOR `DayInMotion`. A rebuild is not free — `buildFrame` walks the whole rig and
   * every primitive is re-rendered — and on Today that was happening sixty times a second, for as
   * long as the athlete had the app's most-opened screen in front of her, for DECORATION. Measured
   * in Chrome on 2026-08-31: Today repeatedly timed out the renderer's own screenshot ("the
   * renderer may be frozen or unresponsive") while the set screen, which draws no figure, answered
   * instantly.
   *
   * ⚠️ AND THE FIGURE DOES NOT LOOK WORSE FOR IT. A rig loops in about two seconds through poses
   * that change slowly; the eye reads the movement, not the frame rate. Cinema has run at 24 for a
   * century. This is the cheapest possible answer — the rAF clock still runs, it simply stops
   * asking React to draw a pose that is a fortieth of a degree from the last one.
   */
  fps?: number;
  /**
   * WHICH GROUND THE FIGURE IS STANDING ON. Absent = `'paper'`, which is every caller that existed
   * before the athlete was asked onto the training stage — `FormMedia`, `DayInMotion`, the demo
   * door. `'stage'` selects the inverted ladder (`MOTION_PALETTE_STAGE`), because absolute black
   * under a #191714 near-limb is a figure that is present in the DOM and absent to the eye.
   */
  tone?: MotionTone;
  /**
   * FIT THE FRAME TO THE DRAWING instead of using the shared 16:10 crop — see `frame.tightFrame`.
   *
   * ⛔ FOR HEROES ONLY, and the distinction is the whole reason it is opt-in. A list of clips must
   * share ONE box or the figures change size row to row and the list stops reading as a set; that
   * is what `VIEWBOX` is for and every existing caller keeps it. A single figure filling a stage has
   * no set to belong to, and 230 points of its screen were letter-box.
   *
   * ⚠️ THE CALLER MUST TAKE ITS HEIGHT FROM `frameOf` (exported below) rather than guessing — a
   * fitted box is a different aspect for every rig, so a hard-coded `aspectRatio` would put the
   * letter-boxing straight back.
   */
  fit?: boolean;
}

function useMotionRom(rig: Rig, fps?: number): number {
  const [rom, setRom] = useState(0);
  const start = useRef<number>(Date.now());
  const reduce = useRef(false);
  const raf = useRef<number | null>(null);
  /* Read through refs so the clock's effect keeps its `[rig]` dependency — a cap that changed
     identity would restart the loop, and with it the movement, mid-rep. */
  const minGapMs = useRef(0);
  minGapMs.current = fps != null && fps > 0 ? 1000 / fps : 0;
  const lastDrawn = useRef(0);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      reduce.current = on;
      if (on) setRom(0);
    });
    const loop = loopDurationMs(rig.formspec.tempo);
    const tick = () => {
      if (!alive) return;
      const now = Date.now();
      // Uncapped (the default) draws every frame; capped draws only when the gap has elapsed.
      if (!reduce.current && (minGapMs.current === 0 || now - lastDrawn.current >= minGapMs.current)) {
        lastDrawn.current = now;
        setRom(romAt(now - start.current, rig.formspec.tempo));
      }
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

/**
 * ⚠️ `tone` IS A THIRD POSITIONAL PARAMETER AND THE CALL SITES MAY NOT USE `prims.map(renderPrimitive)`.
 * `Array.prototype.map` hands its callback (value, index, ARRAY) — passed bare, every primitive
 * would be told its tone is the whole primitive list. Both renderers spell the arrow out.
 */
export function renderPrimitive(p: Primitive, i: number, tone: MotionTone = 'paper'): React.ReactElement | null {
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
          stroke={hexOn(p.color, tone)}
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
          stroke={hexOn(p.color, tone)}
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
          stroke={hexOn(p.color, tone)}
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
          fill={p.fill ? hexOn(p.fill, tone) : 'none'}
          fillOpacity={p.fillOpacity ?? 1}
          stroke={p.stroke ? hexOn(p.stroke, tone) : undefined}
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
          fill={p.fill ? hexOn(p.fill, tone) : 'none'}
          stroke={p.stroke ? hexOn(p.stroke, tone) : undefined}
          strokeWidth={p.w ?? 0}
        />
      );
    case 'ellipse':
      return (
        <Ellipse key={i} cx={p.c.x} cy={p.c.y} rx={p.rx} ry={p.ry} fill={hexOn(p.fill, tone)} fillOpacity={p.opacity ?? 1} />
      );
    case 'poly':
      return (
        <Polygon
          key={i}
          points={p.pts.map((pt) => `${pt.x},${pt.y}`).join(' ')}
          fill={hexOn(p.fill, tone)}
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
          fill={p.fill ? hexOn(p.fill, tone) : 'none'}
          fillOpacity={p.opacity ?? 1}
          stroke={p.stroke ? hexOn(p.stroke, tone) : undefined}
          strokeWidth={p.w ?? 0}
        />
      );
    }
    default:
      return null;
  }
}

/** The box a caller should size its container to: the fitted one, or the shared 16:10 crop. */
export function frameOf(rig: Rig, fit?: boolean) {
  return fit ? stageFrame(rig) : VIEWBOX;
}

/**
 * ⛔ THE CAP IS THE DEFAULT, NOT AN OPT-IN (2026-09-09, the formula report). Six uncapped figures
 * on Home timed the renderer out on 2026-08-31 and the fix was applied at that one call site. Every
 * figure here rebuilds the whole pose on the JS thread each frame, so a screen that forgets the
 * prop is a screen that can freeze — this is the ceiling the Form door already measured as the
 * most a rig can be drawn at without cost (`FormMedia`, 45–95 SVG nodes a frame).
 */
export const DEFAULT_MOTION_FPS = 30;

export function MotionFigure({ rig, figure, style, fps, tone, fit }: Props) {
  const rom = useMotionRom(rig, fps ?? DEFAULT_MOTION_FPS);
  const prims = buildFrame(rig, rom, figure ?? 'male');
  const box = frameOf(rig, fit);
  return (
    <View style={style} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}>
        <G>{prims.map((p, i) => renderPrimitive(p, i, tone))}</G>
      </Svg>
    </View>
  );
}
