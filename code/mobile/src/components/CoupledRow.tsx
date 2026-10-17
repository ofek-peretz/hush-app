/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A COUPLE, WHEREVER A PLAN IS PRINTED — one mark, drawn once, used by every list of lifts.
 *
 * Founder, 2026-10-13: *"לא היה סופרסט בתוכנית ופתאום הופיע במהלך האימון דרישה לסופרסט."*
 *
 * Half of that sentence was a bug (a couple nobody wrote — `laws/aSupersetIsOnlyEverWritten`). The
 * other half was this: a couple that WAS written — by the model, or by her own finger in the
 * builder — was printed as two ordinary lifts on Today, on the programme tab, on the pre-workout
 * card and on her first week. The workout is where she found out. A plan that hides a superset and
 * a workout that then demands one is the same surprise from the honest side.
 *
 * WHAT IT IS, AND WHY THIS SHAPE:
 *
 *   · A RAIL, in the accent, down the start edge of the lifts that belong to each other. It hangs in
 *     the card's own gutter, so the names stay in the column every other row's name stands in — a
 *     couple is not indented out of its table, it is bracketed inside it. Two rows or five: the rail
 *     is as long as the round.
 *   · A LEGEND over the first of them: the link — the builder's own glyph for exactly this — and the
 *     word. Where the screen is a REFERENCE (the card she opens with her bag on her shoulder, the
 *     programme, her first week) it also says the one thing that makes a superset different from
 *     two lifts: no rest between them. Today is a preview (`the-elevation-pass`: *"a preview is not a
 *     reference"*) and carries the word alone.
 *
 * ⛔ NOT THE BUILDER'S PILL. That pill is a CONTROL — it pairs and unpairs — and a control's costume
 * on a fact is a button that does nothing. Everything here is read-only: nothing is pressable, and
 * the rows keep every door they had.
 *
 * ⚠️ READ OFF THE ROWS (`withNext`), never off a label — the same rule the session's own superset
 * follows (`domain/supersetView`). `coupleSeat` is the one place a row learns where it stands.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/Icon';
import { Legend } from '@/components/ds/Legend';
import { useCopy } from '@/i18n/useCopy';
import { color, font } from '@/design/tokens';

/** Where a row stands in a round — or null when it stands alone. */
export type CoupleSeat = 'first' | 'middle' | 'last' | null;

/** Row `i`'s seat, from the rows' own marks: a row is coupled to the one after it, or it is not. */
export function coupleSeat(rows: readonly { withNext?: boolean }[], i: number): CoupleSeat {
  const withNext = rows[i]?.withNext === true;
  const withPrev = i > 0 && rows[i - 1]?.withNext === true;
  if (withNext) return withPrev ? 'middle' : 'first';
  return withPrev ? 'last' : null;
}

/**
 * How far the rail hangs into the gutter of whatever card holds the list. Every plan card pads ≥ 18.
 * Ten, not twelve (photographed on her first week, 2026-10-13): a couple that closes a day runs its
 * rail down to the card's foot, and at twelve it came within two points of the rounded corner.
 */
export const COUPLE_RAIL_HANG = 10;
const RAIL_WIDTH = 2;

const styles = StyleSheet.create({
  /* The rail belongs to the ROW's own box, so adjoining rows make one unbroken line without either
     of them knowing about the other — which is what lets a table of draggable rows carry it too. */
  rail: {
    marginStart: -COUPLE_RAIL_HANG,
    paddingStart: COUPLE_RAIL_HANG - RAIL_WIDTH,
    borderStartWidth: RAIL_WIDTH,
    borderStartColor: color.accent,
  },
  legend: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8, rowGap: 2 },
  /* Over an unruled list the legend takes a little air from the row above, so it reads as the head
     of the two lifts under it and not as a seventh item of equal standing. */
  legendAbove: { paddingTop: 6 },
  word: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  how: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textMuted, textAlign: 'left' },
});

/** The rail alone — for a row that is its own box (a pressable, a drag item) and carries the legend inside. */
export const coupleRail = styles.rail;

/** "⛓ SUPERSET" — and, where `how`, the one thing that makes it one. Read-only; one node to a screen reader. */
export function SupersetLegend({ how = false, style }: { how?: boolean; style?: StyleProp<ViewStyle> }) {
  const { t } = useCopy();
  const word = t('workout.superset');
  const said = how ? `${word} · ${t('workout.supersetNoRest')}` : word;
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={said} style={[styles.legend, style]}>
      <View style={styles.word}>
        <Icon name="link" size={15} color={color.accent} strokeWidth={1.7} />
        <Legend tone="accent">{word}</Legend>
      </View>
      {how ? <Text style={styles.how}>{t('workout.supersetNoRest')}</Text> : null}
    </View>
  );
}

/**
 * One row of a plan, in its seat. A row that stands alone comes back untouched — no wrapper, no
 * cost — so a list with no couple in it renders exactly the tree it rendered before this existed.
 *
 * `legendStyle` is for a list whose rows are RULED: there the legend takes the rule the first row
 * would have drawn (the caller drops the row's own), so the order down the card is rule → legend →
 * lift, and the legend never reads as the tail of the row above it.
 */
export function CoupledRow({
  seat,
  how = false,
  legendStyle,
  children,
}: {
  seat: CoupleSeat;
  how?: boolean;
  legendStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  if (!seat) return <>{children}</>;
  return (
    <View style={styles.rail}>
      {seat === 'first' ? <SupersetLegend how={how} style={[styles.legendAbove, legendStyle]} /> : null}
      {children}
    </View>
  );
}
