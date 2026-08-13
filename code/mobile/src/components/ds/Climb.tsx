/**
 * Climb — one lift's trace, with TAPPABLE points (v7 3.2b).
 *
 * The Sparkline's grown-up sibling. Same moss staircase, but every training day here is a target the
 * finger can reach: tap one and the callout above it answers with that day's decision. Marked days
 * (the ones the engine actually moved, or a club was crossed on) wear a small dot so the eye can
 * find them before the finger does; the last point is always the loud one — where she stands.
 *
 * The callout rides in an RN Text overlay, never inside the SVG: mono carries no words (the law),
 * and a callout can hold one ("40 · plate"). Defensive by construction — 0–1 points draw a dot, a
 * flat series draws level, and it never throws, because a progress screen must not crash.
 */
// @ts-nocheck

// 

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Polyline, Circle, Defs, LinearGradient, Stop, Line } from 'react-native-svg';
import { signal, font, color, stage } from '@/design/tokens';
import { monoCanDraw } from '@/design/monoVoice';

interface Props {
  /** The climb, oldest → newest. */
  data: number[];
  width: number;
  height?: number;
  /** Indices where the ENGINE MOVED the load — a stamped change. They wear a filled dot. */
  markers?: number[];
  /**
   * Indices where a MARK was crossed — a milestone. They wear an open RING.
   *
   * Two kinds of news used to share one dot, so the graph could say "something happened here" and
   * never which (founder 2026-07-28). They are told apart by SHAPE rather than hue: the palette has
   * no accent to spend (READOUT — emphasis is distance from the ground, and the milestone emblem is
   * moss like everything else), and a shape survives a colour-blind eye and a sunlit screen where a
   * second green would not. A filled dot is a decision; a struck ring is a mark.
   */
  milestones?: number[];
  /** The tapped point; null = nothing selected and no callout drawn. */
  selected?: number | null;
  onSelect?: (index: number) => void;
  /** What the selected point says — one short reading ("40 · plate"). */
  callout?: string | null;
  /** The reading above the newest point ("47.5"). */
  endLabel?: string;
  /** Announced on each point, so the graph is reachable without sight. */
  pointLabel?: (index: number) => string;
}

const PAD_X = 12;
const TOP = 32; // headroom for the callout box + the end reading
const CALLOUT_H = 22;

export function Climb({
  data,
  width,
  height = 138,
  markers = [],
  milestones = [],
  selected = null,
  onSelect,
  callout,
  endLabel,
  pointLabel,
}: Props) {
  const bottom = height - 10;
  const n = data.length;
  const max = Math.max(1, ...data);
  // The floor sits a little under the lowest reading, so a climb that starts high still has a shape
  // instead of being pinned flat to the baseline.
  const min = Math.min(...data, max);
  const span = Math.max(1e-6, max - min);
  const floor = min - span * 0.35;

  const x = (i: number) => (n <= 1 ? width / 2 : PAD_X + (i / (n - 1)) * (width - PAD_X * 2));
  const y = (v: number) => (n <= 1 ? (TOP + bottom) / 2 : bottom - ((v - floor) / (max - floor)) * (bottom - TOP));

  const lastX = x(n - 1);
  const lastY = y(data[n - 1] ?? 0);
  const marked = new Set(markers.filter((i) => i >= 0 && i < n));
  // A day can carry BOTH — the load moved and a mark was crossed on it. The ring wins the point
  // (it is the rarer news), so the sets are drawn exclusively and never stacked into a blob.
  const milestoneSet = new Set(milestones.filter((i) => i >= 0 && i < n));

  const linePts = data.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const fillPath =
    n > 1
      ? `M ${x(0)},${y(data[0])} ${data.map((v, i) => `L ${x(i)},${y(v)}`).join(' ')} L ${lastX},${bottom} L ${x(0)},${bottom} Z`
      : '';

  const selValid = selected != null && selected >= 0 && selected < n;
  const selX = selValid ? x(selected!) : 0;
  const selY = selValid ? y(data[selected!]) : 0;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="climbFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={signal[0]} stopOpacity={0.22} />
            <Stop offset="1" stopColor={signal[0]} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {n > 1 ? <Path d={fillPath} fill="url(#climbFill)" stroke="none" /> : null}
        {n > 1 ? (
          <Polyline
            points={linePts}
            fill="none"
            stroke={signal[0]}
            strokeWidth={2.2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}

        {/* THE MARKED DAYS. They were 2.6 px at half opacity — findable only if you already knew
            where to look, on a graph whose whole point is to be tapped (founder 2026-07-28). Now
            they are targets: a CHANGE is a filled dot, a MILESTONE is an open ring, and both are
            drawn at a size a thumb can aim at. */}
        {[...marked].map((i) =>
          i === n - 1 || milestoneSet.has(i) ? null : (
            <Circle key={`m${i}`} cx={x(i)} cy={y(data[i])} r={3.6} fill={signal[0]} opacity={0.9} />
          ),
        )}
        {/* a mark was struck here — an open seal, never a filled point */}
        {[...milestoneSet].map((i) =>
          i === n - 1 || i < 0 || i >= n ? null : (
            <Circle
              key={`k${i}`}
              cx={x(i)}
              cy={y(data[i])}
              r={5.5}
              fill="none"
              stroke={signal[0]}
              strokeWidth={2}
            />
          ),
        )}

        {/* where she stands — always the loudest point on the trace */}
        <Circle cx={lastX} cy={lastY} r={5} fill={signal[0]} />

        {/* the tapped day: the connector down from its callout, then the point itself, ringed in the
            stage so it reads as lifted off the line rather than sitting on it */}
        {selValid ? (
          <>
            <Line
              x1={selX}
              y1={Math.max(TOP - CALLOUT_H / 2 + CALLOUT_H, 0)}
              x2={selX}
              y2={selY - 6}
              stroke={signal[0]}
              strokeOpacity={0.5}
              strokeWidth={1}
            />
            <Circle cx={selX} cy={selY} r={5.5} fill={signal[0]} stroke={color.bg} strokeWidth={2} />
          </>
        ) : null}

        {/* the reach targets — invisible, generous, one per day */}
        {onSelect
          ? data.map((v, i) => (
              <Circle
                key={`hit${i}`}
                cx={x(i)}
                cy={y(v)}
                r={18}
                fill="transparent"
                onPress={() => onSelect(i)}
                accessible
                accessibilityLabel={pointLabel?.(i)}
              />
            ))
          : null}
      </Svg>

      {endLabel ? (
        <Text
          style={[
            styles.endLabel,
            { fontFamily: monoCanDraw(endLabel) ? font.monoMedium : font.sansMedium, right: Math.max(4, width - lastX - 26) }, // rtl-ok: merged onto endLabel (sets textAlign); `right` is a pixel offset off the plotted point
          ]}
          numberOfLines={1}
        >
          {endLabel}
        </Text>
      ) : null}

      {selValid && callout ? (
        <View
          pointerEvents="none"
          style={[styles.callout, { left: Math.min(Math.max(selX - 44, 0), Math.max(0, width - 88)), top: TOP - CALLOUT_H / 2 }]}
        >
          <Text
            style={[styles.calloutText, { fontFamily: monoCanDraw(callout) ? font.monoMedium : font.sansMedium }]} // rtl-ok: merged onto calloutText, which sets textAlign
            numberOfLines={1}
          >
            {callout}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The newest reading rides above its point in the instrument's mono — it is a reading off the
  // trace, not a caption about it.
  endLabel: { position: 'absolute', top: 2, fontSize: 17, color: signal[0], textAlign: 'right' },
  callout: {
    position: 'absolute',
    width: 88,
    height: CALLOUT_H,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(169,196,159,0.55)',
    // OPAQUE on purpose — the callout sits over the trace and must not let the line read through it.
    backgroundColor: stage[2],
    alignItems: 'center',
    justifyContent: 'center',
  },
  calloutText: { fontSize: 17, color: signal[0], textAlign: 'center' },
});
