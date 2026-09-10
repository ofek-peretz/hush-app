/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WEEK, AS A MEASURED RANGE — how much of it she has done, drawn rather than written.
 *
 * ⛔ FOUNDER, 2026-08-22: *"ארצה לראות מה קורה במידה ואימון אחד בוצע — איך זה מסמן את ההתקדמות
 * שבוצעו N מתוך M אימונים."*
 *
 * ── ⚠️ THIS IS NOT A REVERSAL OF THE 2026-08-12 DELETION, AND THE DISTINCTION IS THE DESIGN ─────
 * What was deleted then was the eyebrow **"WEEK 11 · 2 OF 4 DONE"** — a caption, spending the top
 * of the fold to state in words a fact the four cards under it already drew with two checks. The
 * argument was right and it is kept: *a screen that states a fact its own content already draws is
 * spending the top of the fold on a caption.*
 *
 * **What changed is that the content no longer draws it.** Today leads with TODAY now, and the rest
 * of the week is behind a door (`WeekSheet`) — so there are no cards on the screen to carry the
 * checks, and the fact genuinely is not stated anywhere. A caption was redundant; an instrument is
 * the only thing left that says it.
 *
 * ── WHY IT IS THE RANGE MARK AND NOT A ROW OF DOTS ──────────────────────────────────────────────
 * The brand's glyph is a hairline between two end ticks — a measured span. A week IS a measured
 * span with a filled portion, so the meter is the wordmark's own mark, at width, carrying her
 * progress. Dots would have been a second visual language for a thing the identity already draws,
 * and progress dots are the most generic object in this category of app.
 *
 * Three states, and they are the three states a workout can be in — no more:
 *   DONE    a filled moss segment. It happened.
 *   QUEUED  a hairline carrying a cream POSITION DOT — "you are here", never a fill.
 *   AHEAD   a hairline. Nothing has happened there and nothing is owed.
 *
 * ⛔ QUEUED WAS A FILLED CREAM BAR, AND IT LIED (design review 2026-09-01). Cream is BRIGHTER than
 * moss, so the segment being offered was the loudest thing on the rule — and a filled segment on a
 * progress instrument reads as progress, full stop. The meter said "one done" twenty-five points
 * above a counter saying "0 מתוך 4". Only work that HAPPENED may fill; the day being offered is a
 * position, and a position is a marker.
 *
 * ⚠️ AN AHEAD SEGMENT IS A LINE, NOT AN EMPTY BOX. The Recovery seal learned this the hard way
 * (2026-08-12): *"a dashed ring is the visual language of a slot waiting to be filled … three of
 * them under a headline that says the week is complete is the screen telling her she finished
 * everything and then drawing three holes."* A hairline is the ABSENCE of a mark rather than an
 * empty container, so a week with three still to do reads as a week with room in it.
 *
 * Pure — every state is reachable from props alone.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import React from 'react';
import { View, StyleSheet } from 'react-native';

import { Legend } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { color, signal } from '@/design/tokens';

export type WeekMeterState = 'done' | 'queued' | 'ahead';

export interface WeekMeterProps {
  /** One entry per workout in the week, in the week's own order. */
  segments: WeekMeterState[];
  /**
   * Draw the count beside the rule. Absent → the instrument alone, which is what a sheet header
   * wants (the sheet's own title already says which week it is).
   */
  showCount?: boolean;
}

/** How many of them are behind her. Exported so the law and the copy read one derivation. */
export function doneCount(segments: readonly WeekMeterState[]): number {
  return segments.filter((s) => s === 'done').length;
}

/**
 * The meter's segments, from the week Home already holds.
 *
 * ⛔ IT LIVED IN `WeekSheet` UNTIL 2026-08-29, where the sheet's header meter and its rows read
 * one derivation so the instrument could never disagree with the list beneath it. The sheet is
 * deleted (its door was "אימון אחר", which the founder removed in favour of the Program tab), and
 * the helper came HERE rather than being inlined at the one call site left: it is the answer to
 * "what shape is this week in", and it belongs beside the instrument that draws it.
 */
export function sheetSegments(
  workouts: readonly { id: string; done?: boolean }[],
  selectedId: string | null,
): WeekMeterState[] {
  return workouts.map((w) => (w.done ? 'done' : w.id === selectedId ? 'queued' : 'ahead'));
}

export function WeekMeter({ segments, showCount = true }: WeekMeterProps) {
  const { t } = useCopy();
  if (!segments.length) return null;

  const done = doneCount(segments);

  return (
    <View style={styles.root}>
      {/*
        The rule, with the brand's end ticks. `direction: 'ltr'` because the week reads left to
        right as a TIMELINE in both locales — the same reason the wordmark does not mirror. A week
        that ran right-to-left in Hebrew would put her first workout where her last one was
        yesterday, on the one object whose whole job is "how far along am I".
      */}
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel={t('home.weekMeter', { done, total: segments.length })}
      >
        <View style={styles.tick} />
        <View style={styles.segments}>
          {segments.map((s, i) => (
            s === 'queued' ? (
              /* "You are here" — a hairline like AHEAD, carrying the cream position dot. */
              <View key={i} style={[styles.segment, styles.segmentQueuedTrack]}>
                <View style={styles.queuedDot} />
              </View>
            ) : (
              <View
                key={i}
                style={[styles.segment, s === 'done' ? styles.segmentDone : styles.segmentAhead]}
              />
            )
          ))}
        </View>
        <View style={styles.tick} />
      </View>

      {/* The count in words, because "2 of 4 done" is a SENTENCE — `Legend` picks the face off the
          string, so English gets the mono the design draws and Hebrew gets Assistant rather than a
          line of missing glyphs (`monoCarriesNoWords`). */}
      {showCount ? (
        <Legend track={0.12} tone="muted" style={styles.count}>
          {t('home.weekMeter', { done, total: segments.length })}
        </Legend>
      ) : null}
    </View>
  );
}

const TRACK_H = 12;
const BAR_H = 4;

const styles = StyleSheet.create({
  root: { gap: 10 },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    height: TRACK_H,
    direction: 'ltr', // rtl-ok: a timeline, not text — see the note at the call site
  },
  /** The range mark's end tick, full height of the track. */
  tick: { width: 1.5, height: TRACK_H, backgroundColor: color.borderStrong },
  segments: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 5 },
  segment: { flex: 1, borderRadius: BAR_H / 2 },
  /** It happened. Moss — the mark of a thing the product has banked. */
  segmentDone: { height: BAR_H, backgroundColor: signal[0] },
  /** The one she is being offered: the AHEAD hairline with a position dot on it — see the header. */
  segmentQueuedTrack: { height: 1.5, backgroundColor: color.meterLine, alignItems: 'center', justifyContent: 'center' },
  queuedDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.textPrimary },
  /** Nothing has happened there. A LINE, never an empty box — see the header.
      ⛔ `color.border` (12% cream) was 1.4:1 against the black ground — an instrument drawn below
      the threshold of sight. `meterLine` is the dedicated instrument-hairline token (~3.5:1). */
  segmentAhead: { height: 1.5, backgroundColor: color.meterLine },
  count: { paddingTop: 0 },
});

export default WeekMeter;
