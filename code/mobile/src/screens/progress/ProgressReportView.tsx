/**
 * ProgressReportView — shared presentational report, 1:1 from the design
 * `ui_kits/app/Progress.jsx`. For each lift: the initial peak vs the best peak
 * reached since, the gain (LoadDelta), and a SPARKLINE of the peak trajectory (founder 2026-07-17). A header sums the total strength added.
 *
 * Used by the **Progress** screen in both its windows: all-time (Home / Recovery) and the last
 * 12 weeks (the every-12-weeks notification, `window: 'quarter'`). They differ only in `legend`,
 * `title`, which entries they pass, and whether the milestones gallery is shown.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Legend, Badge, LoadDelta, Sparkline } from '@/components/ds';
import { MilestoneEmblem } from '@/components/MilestoneEmblem';
import { useCopy } from '@/i18n/useCopy';
import { exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import type { QuarterlyProgressEntry } from '@/domain/progressReport';
import type { EarnedMilestone, NextMilestone } from '@/domain/milestones';
import { milestoneCopy } from '@/domain/milestoneCopy';
import type { Units } from '@/data/local/models';
import { color, space, font, textScale, tracking, trackingPx, press } from '@/design/tokens';

// The sparkline fills the row: the page's content width (screen minus the two gutters).
const SPARK_W = Math.round(Dimensions.get('window').width - space.gutter * 2);

interface Props {
  title: string;
  legend: string; // e.g. "All time" / "Last 12 weeks"
  entries: QuarterlyProgressEntry[];
  loaded: boolean; // false while history is still loading (suppresses the empty state)
  units: Units;
  onBack?: () => void;
  /** The milestones gallery (Progress screen only — the quarterly report stays a pure
   *  peak-weight comparison): earned emblems + each family's single next silhouette. */
  milestones?: { earned: EarnedMilestone[]; next: NextMilestone[] } | null;
}

export function ProgressReportView({ title, legend, entries, loaded, units, onBack, milestones }: Props) {
  const { t } = useCopy();
  // The header total is a kg story — bodyweight (reps-mode) gains are real progress
  // but never counted as "kg added".
  const loadEntries = entries.filter((e) => e.mode !== 'reps');
  const totalGainKg = loadEntries.reduce((a, e) => a + Math.max(0, e.deltaKg), 0);
  const totalGain = displayWeight(Math.round(totalGainKg * 10) / 10, units) ?? 0;
  // Baseline (founder 2026-07-09): no gains yet (the first week) — the screen shows the athlete's
  // starting point, NOT a "+0 added". Each lift's first mark is what every later gain measures against.
  const isBaseline = entries.length > 0 && entries.every((e) => e.deltaKg === 0);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header. NO back chevron when this is a tab root (Progress) — a tab has nowhere to go back
          to; you leave by tapping another tab. `onBack` is passed only if some future caller pushes
          this on a stack. The title sits at the page edge like the reference, not indented behind a
          chevron that is not there. */}
      <View style={styles.header}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={10}
            onPress={onBack}
            style={({ pressed }) => [styles.back, { opacity: pressed ? press.opacity : 1 }]}
          >
            <Icon name="chevronLeft" size={24} color={color.textPrimary} strokeWidth={2} />
          </Pressable>
        ) : null}
        <View style={styles.headTitles}>
          <Legend>{legend}</Legend>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loaded && entries.length === 0 ? (
          // Day one is not a blank screen (founder 2026-07-12) — it is the instrument
          // waiting for its first reading.
          <View style={styles.emptyWrap}>
            <View style={styles.emptyMark}>
              <Icon name="trendingUp" size={24} color={color.textTertiary} strokeWidth={1.75} />
            </View>
            <Text style={styles.emptyTitle}>{t('report.emptyTitle')}</Text>
            <Text style={styles.empty}>{t('report.empty')}</Text>
          </View>
        ) : (
          <>
            {/* total strength added — or, before any gain, the starting-point framing.
                (Reps-only gains keep the starting-point header — the kg total would lie —
                while their per-lift rows below still show the rep progress.) */}
            <View style={styles.totalBlock}>
              {isBaseline || totalGainKg <= 0 ? (
                <>
                  <Legend>{t('report.startingPoint')}</Legend>
                  <Text style={styles.startingSub}>{t('report.startingPointSub')}</Text>
                </>
              ) : (
                <>
                  <Legend>{t('report.totalAdded')}</Legend>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalValue}>+{totalGain}</Text>
                    <Text style={styles.totalUnit}>{unitLabel(units)}</Text>
                    <View style={styles.totalBadge}>
                      <Badge tone="up">{t('report.acrossLifts', { count: loadEntries.length })}</Badge>
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* per-lift rows */}
            <View style={styles.lifts}>
              {entries.map((e) => {
                // Bodyweight movements progress by REPS (founder 2026-07-10): raw rep
                // counts, never unit-converted; the row reads "12 reps" instead of kg.
                const isReps = e.mode === 'reps';
                const conv = (v: number) => (isReps ? v : displayWeight(v, units) ?? 0);
                const initial = conv(e.initialPeakKg);
                const best = conv(e.periodPeakKg);
                const current = conv(e.currentKg);
                const deltaDisp = conv(e.deltaKg);
                const unit = isReps ? t('report.repsUnit') : unitLabel(units);
                // BACKED OFF (founder 2026-07-12): the athlete is currently working below
                // their all-time best — a layoff, an injury, a deload. The peak still stands
                // (it happened), so the meter still fills to it; the current load is drawn as
                // a second, calmer reference so the screen never pretends the gap isn't there.
                // The line beneath says what is actually true: the engine has met them where
                // they are and will climb back from there. Not a failure, a fact.
                const backedOff = e.currentKg < e.periodPeakKg;
                return (
                  <View key={e.exerciseId} style={styles.lift}>
                    <View style={styles.liftHead}>
                      <Text style={styles.liftName}>{exerciseDisplayName(e.exerciseId)}</Text>
                      <View style={styles.liftRight}>
                        <Text style={styles.liftBest}>
                          {best}
                          <Text style={styles.liftBestUnit}> {unit}</Text>
                        </Text>
                        {/* No gain yet (first performance / held) → the mark IS the starting
                            point; a "+0" would misread as a result. Show the delta only once it rises. */}
                        {e.deltaKg > 0 ? <LoadDelta value={deltaDisp} unit={unit} size="sm" /> : null}
                      </View>
                    </View>
                    {/* THE TRAJECTORY — the shape of the progress, not just its endpoints
                        (founder 2026-07-17, from the reference: Progress is a chart). It replaces
                        the single-bar gauge, whose job (where she started → where she is) the line
                        does better by showing the path between them. The numbers live in the foot
                        below, which is the sparkline's axis-in-words. */}
                    <View style={styles.spark}>
                      <Sparkline data={e.series} width={SPARK_W} height={40} />
                    </View>
                    <View style={styles.liftFoot}>
                      <Text style={styles.footText}>{t('report.initialPeak', { value: initial, unit })}</Text>
                      <Text style={[styles.footText, styles.footNow]}>{t('report.best', { value: best, unit })}</Text>
                    </View>
                    {backedOff ? (
                      <View style={styles.backOff}>
                        <Icon name="minus" size={13} color={color.textMuted} strokeWidth={2.2} />
                        <Text style={styles.backOffText}>
                          {t('report.workingAt', { value: current, unit })}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>

            {/* milestones — earned stamps (newest first) + each family's next silhouette */}
            {milestones && (milestones.earned.length > 0 || milestones.next.length > 0) ? (
              <View style={styles.milestones}>
                <Legend>{t('milestones.gallery')}</Legend>
                <View style={styles.emblemGrid}>
                  {milestones.earned
                    .slice()
                    .reverse()
                    .map((m) => {
                      const mc = milestoneCopy(m, t, units);
                      return (
                        <View key={m.id} style={styles.emblemCell}>
                          <MilestoneEmblem size={88} value={mc.value} caption={mc.caption} glyph={mc.glyph} />
                          <Text style={styles.emblemTitle} numberOfLines={2}>{mc.title}</Text>
                          <Text style={styles.emblemFoot}>
                            {new Date(m.earnedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                          </Text>
                        </View>
                      );
                    })}
                  {milestones.next.map((n) => {
                    const mc = milestoneCopy(n.milestone, t, units);
                    return (
                      <View key={n.milestone.id} style={styles.emblemCell}>
                        <MilestoneEmblem size={88} tone="locked" value={mc.value} caption={mc.caption} glyph={mc.glyph} />
                        <Text style={[styles.emblemTitle, styles.emblemLocked]} numberOfLines={2}>{mc.title}</Text>
                        <Text style={styles.emblemFoot}>{toGoLabel(n, t, units)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** "12 kg to go" / "עוד 13 אימונים" — the silhouette's live distance, in the family's unit. */
function toGoLabel(n: NextMilestone, t: (k: string, p?: Record<string, unknown>) => string, units: Units): string {
  const remaining = Math.max(0, n.target - n.current);
  const amount =
    n.milestone.family === 'count'
      ? `${remaining} ${t('milestones.workoutsCaption').toLowerCase()}`
      : n.milestone.family === 'tonnage'
        ? `${Math.ceil(remaining / 1000).toLocaleString()} ${t('milestones.tonnesCaption').toLowerCase()}`
        : `${displayWeight(remaining, units) ?? remaining} ${unitLabel(units)}`;
  return t('milestones.toGo', { amount });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.gutter - 4, paddingTop: 6, paddingBottom: 12, minHeight: 44 },
  back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headTitles: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, marginTop: 1, textAlign: 'left' },

  body: { paddingHorizontal: space.gutter, paddingBottom: 40, flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  emptyMark: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: { fontFamily: font.sansSemibold, fontSize: textScale.lg, letterSpacing: trackingPx(textScale.lg, tracking.tight), color: color.textPrimary, textAlign: 'center' },
  empty: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 22, color: color.textMuted, textAlign: 'center', marginTop: 8, maxWidth: 280 },

  totalBlock: { paddingTop: 4, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: color.border },
  startingSub: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textSecondary, marginTop: 8, lineHeight: textScale.sm * 1.4, textAlign: 'left' },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8 },
  totalValue: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale['4xl'], letterSpacing: trackingPx(textScale['4xl'], tracking.display), color: color.textPrimary, textAlign: 'left' },
  totalUnit: { fontFamily: font.mono, fontSize: textScale.lg, color: color.textMuted, textAlign: 'left' },
  totalBadge: { marginStart: 'auto', alignSelf: 'center' },

  // Rows breathe (founder 2026-07-12): the started/best line was pressed against the meter
  // and the whole block read as one dense smear. Air between a gauge and its labels is not
  // decoration — it is what lets the eye separate the reading from the scale.
  lifts: { marginTop: 18, gap: 24 },
  lift: {},
  liftHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 },
  liftName: { fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textPrimary, flexShrink: 1, textAlign: 'left' },
  liftRight: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  liftBest: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  liftBestUnit: { fontFamily: font.mono, fontSize: textScale['2xs'], color: color.textMuted, textAlign: 'left' },
  spark: { marginTop: 12, alignItems: 'flex-start' },
  liftFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 11 },
  footText: { fontFamily: font.sans, fontVariant: ['tabular-nums'], fontSize: textScale['2xs'], color: color.textTertiary, textAlign: 'left' },
  footNow: { color: color.up },
  backOff: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 },
  backOffText: { flex: 1, fontFamily: font.sans, fontSize: textScale.xs, lineHeight: 17, color: color.textMuted, textAlign: 'left' },

  milestones: { marginTop: 30, paddingTop: 22, borderTopWidth: 1, borderTopColor: color.border },
  emblemGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 },
  emblemCell: { width: '33.33%', alignItems: 'center', paddingHorizontal: 6, marginBottom: 22 },
  emblemTitle: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], color: color.textPrimary, textAlign: 'center', marginTop: 10, lineHeight: textScale['2xs'] * 1.35 },
  emblemLocked: { color: color.textMuted },
  emblemFoot: { fontFamily: font.sans, fontVariant: ['tabular-nums'], fontSize: 10, color: color.textTertiary, marginTop: 3, textAlign: 'left' },
});
