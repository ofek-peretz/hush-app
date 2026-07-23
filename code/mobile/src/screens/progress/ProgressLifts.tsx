/**
 * ProgressLifts — Progress · Lifts, the ALL-TIME lens (v7 3.2). Rebuilt 1:1 from the handoff.
 *
 * IA (top → bottom):
 *   · header — serif "Progress" + a Lifts / Log toggle (Log opens the history ledger)
 *   · a per-lift chip row — "All time" (the aggregate) then one chip per trained lift
 *   · ALL TIME: the lifetime-tonnage hero (t moved · +N raises · N workouts · N weeks), the
 *     weekly-volume area graph, and the all-time milestone badges
 *   · A LIFT: that lift's climb — its running-max sparkline and where it started / stands now
 *
 * Everything here is display arithmetic over the logged history (domain/progressAggregate) — no
 * engine type is read. The chips' deeper per-lift card (3.2b — the engine change-log) is a separate
 * surface and is intentionally NOT built here.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Legend, SegmentedControl, Sparkline, VolumeArea } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import type { QuarterlyProgressEntry } from '@/domain/progressReport';
import type { ProgressAggregate } from '@/domain/progressAggregate';
import type { Units } from '@/data/local/models';
import { Icon } from '@/components/Icon';
import { color, space, font, textScale, tracking, trackingPx, radius, signal, press } from '@/design/tokens';

const CONTENT_W = Math.round(Dimensions.get('window').width - space.gutter * 2);

interface Props {
  entries: QuarterlyProgressEntry[];
  aggregate: ProgressAggregate | null;
  loaded: boolean;
  units: Units;
  /** Opens the history ledger (the "Log" tab). */
  onLog?: () => void;
  /** Opens the week's share card (§9.2) — present only when this week has real work to show. */
  onShareWeek?: () => void;
}

/** A lifetime figure, big and compact: "186" mono with a subordinate sans unit ("t"). */
const fmtTonnes = (kg: number): string => {
  const t = kg / 1000;
  return t >= 10 ? String(Math.round(t)) : String(+t.toFixed(1));
};
const fmtK = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

export function ProgressLifts({ entries, aggregate, loaded, units, onLog, onShareWeek }: Props) {
  const { t } = useCopy();
  // null = the "All time" aggregate; otherwise the selected lift's exerciseId.
  const [lift, setLift] = useState<string | null>(null);
  const selected = lift ? entries.find((e) => e.exerciseId === lift) ?? null : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* header — the section name in the coach's serif, and the Lifts / Log choice */}
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">{t('progress.title')}</Text>
        <SegmentedControl
          options={[
            { value: 'lifts', label: t('progress.tabLifts') },
            { value: 'log', label: t('progress.tabLog') },
          ]}
          value="lifts"
          onChange={(v) => {
            if (v === 'log') onLog?.();
          }}
        />
      </View>

      {/* the per-lift chip row — "All time" then each trained lift */}
      {entries.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipsRow}
        >
          <Chip label={t('progress.chipAllTime')} active={lift == null} onPress={() => setLift(null)} />
          {entries.map((e) => (
            <Chip
              key={e.exerciseId}
              label={exerciseDisplayName(e.exerciseId)}
              active={lift === e.exerciseId}
              onPress={() => setLift(e.exerciseId)}
            />
          ))}
        </ScrollView>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loaded && entries.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyMark}>
              <Icon name="trendingUp" size={24} color={color.textTertiary} strokeWidth={1.75} />
            </View>
            <Text style={styles.emptyTitle}>{t('report.emptyTitle')}</Text>
            <Text style={styles.empty}>{t('report.empty')}</Text>
          </View>
        ) : selected ? (
          <LiftFocus entry={selected} units={units} />
        ) : aggregate ? (
          <AllTime aggregate={aggregate} units={units} onShareWeek={onShareWeek} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** The aggregate lens: tonnage hero, weekly-volume graph, all-time milestone badges. */
function AllTime({ aggregate, units, onShareWeek }: { aggregate: ProgressAggregate; units: Units; onShareWeek?: () => void }) {
  const { t } = useCopy();
  const a = aggregate;
  const series = a.weeklyTonnes;
  const first = series[0] ?? 0;
  const last = series[series.length - 1] ?? 0;

  const badges: { value: string; unit: string; caption: string }[] = [
    { value: fmtTonnes(a.liftedKg), unit: t('progress.unitTonnes'), caption: t('progress.badgeLifted') },
    { value: String(a.workouts), unit: t('progress.unitDone'), caption: t('progress.badgeWorkouts') },
    { value: fmtK(a.kcal), unit: t('progress.unitKcal'), caption: t('progress.badgeBurned') },
    { value: String(a.raises), unit: t('progress.unitUp'), caption: t('progress.badgeRaises') },
    { value: String(Math.round(a.cardioKm)), unit: t('progress.unitKm'), caption: t('progress.badgeCardio') },
  ];

  return (
    <>
      {/* tonnage hero */}
      <View style={styles.hero}>
        <View style={styles.heroLeft}>
          <Legend tone="onStage">{t('progress.everythingLifted')}</Legend>
          <View style={styles.heroValueRow}>
            <Text style={styles.heroValue}>{fmtTonnes(a.liftedKg)}</Text>
            <Text style={styles.heroUnit}>{t('progress.tonneUnit')}</Text>
          </View>
        </View>
        <View style={styles.heroRight}>
          <View style={styles.raisesPill}>
            <Text style={styles.raisesText}>{t('progress.raises', { count: a.raises })}</Text>
          </View>
          <Text style={styles.heroMeta}>{t('progress.workoutsWeeks', { workouts: a.workouts, weeks: a.weeks })}</Text>
        </View>
      </View>

      {/* weekly-volume area graph */}
      <View style={styles.graph}>
        <VolumeArea
          data={series}
          width={CONTENT_W}
          height={150}
          startLabel={`${first} ${t('progress.unitTonnes')} · ${t('progress.volWeekOne')}`}
          endLabel={`${last} ${t('progress.unitTonnes')} · ${t('progress.volThisWeek')}`}
        />
        {onShareWeek ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('share.shareWeek')}
            onPress={onShareWeek}
            hitSlop={8}
            style={({ pressed }) => [styles.shareWeek, { opacity: pressed ? press.opacity : 1 }]}
          >
            <Text style={styles.shareWeekLabel}>{t('share.shareWeek')}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* all-time milestone badges */}
      <View style={styles.milestones}>
        <Legend tone="onStage">{t('progress.allTimeMilestones')}</Legend>
        <View style={styles.badgeRow}>
          {badges.map((b) => (
            <StatBadge key={b.caption} value={b.value} unit={b.unit} caption={b.caption} />
          ))}
        </View>
      </View>
    </>
  );
}

/** One lift's climb — the running-max sparkline and its started → now numbers. */
function LiftFocus({ entry, units }: { entry: QuarterlyProgressEntry; units: Units }) {
  const { t } = useCopy();
  const isReps = entry.mode === 'reps';
  const conv = (v: number) => (isReps ? v : displayWeight(v, units) ?? 0);
  const unit = isReps ? t('report.repsUnit') : unitLabel(units);
  const initial = conv(entry.initialPeakKg);
  const best = conv(entry.periodPeakKg);

  return (
    <View style={styles.focus}>
      <View style={styles.focusHead}>
        <Text style={styles.focusName}>{exerciseDisplayName(entry.exerciseId)}</Text>
        <Text style={styles.focusBest}>
          {best}
          <Text style={styles.focusBestUnit}> {unit}</Text>
        </Text>
      </View>
      <View style={styles.focusSpark}>
        <Sparkline data={entry.series} width={CONTENT_W} height={120} />
      </View>
      <View style={styles.focusFoot}>
        <Text style={styles.footText}>{t('report.initialPeak', { value: initial, unit })}</Text>
        <Text style={[styles.footText, styles.footNow]}>{t('report.best', { value: best, unit })}</Text>
      </View>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active ? styles.chipActive : styles.chipIdle, { opacity: pressed ? press.opacity : 1 }]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextIdle]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A circular milestone badge: a mono figure with its unit, and a sans caption below. */
function StatBadge({ value, unit, caption }: { value: string; unit: string; caption: string }) {
  return (
    <View style={styles.badgeCell}>
      <View style={styles.badgeRing}>
        <View style={styles.badgeInner}>
          <Text style={styles.badgeValue}>{value}</Text>
          <Text style={styles.badgeUnit}>{unit.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.badgeCaption} numberOfLines={1}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: space.gutter,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { fontFamily: font.serif, fontSize: textScale['2xl'], letterSpacing: trackingPx(textScale['2xl'], tracking.display), color: color.textPrimary, textAlign: 'left' },

  chipsRow: { flexGrow: 0 },
  chips: { paddingHorizontal: space.gutter, gap: 8, paddingBottom: 12 },
  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.full, justifyContent: 'center' },
  chipActive: { backgroundColor: color.textPrimary },
  chipIdle: { borderWidth: 1, borderColor: color.borderStrong },
  chipText: { fontFamily: font.sansMedium, fontSize: textScale.sm, textAlign: 'left' },
  chipTextActive: { color: color.bg, fontFamily: font.sansSemibold }, // rtl-ok: merged onto chipText, which sets textAlign
  chipTextIdle: { color: color.textSecondary },

  body: { paddingHorizontal: space.gutter, paddingBottom: 40, flexGrow: 1 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  emptyMark: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { fontFamily: font.sansSemibold, fontSize: textScale.lg, letterSpacing: trackingPx(textScale.lg, tracking.tight), color: color.textPrimary, textAlign: 'center' },
  empty: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 22, color: color.textMuted, textAlign: 'center', marginTop: 8, maxWidth: 280 },

  // tonnage hero
  hero: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 4 },
  heroLeft: { gap: 6 },
  heroValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  heroValue: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: 56, letterSpacing: trackingPx(56, tracking.display), color: color.textPrimary, textAlign: 'left' },
  // The unit rides in SANS — mono carries no words (the law), the same split Metric makes.
  heroUnit: { fontFamily: font.sansMedium, fontSize: textScale.lg, color: color.textMuted, textAlign: 'left' },
  heroRight: { alignItems: 'flex-end', gap: 6 },
  raisesPill: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.full, backgroundColor: 'rgba(169,196,159,0.18)' },
  raisesText: { fontFamily: font.sansSemibold, fontSize: textScale.md, color: signal[0], textAlign: 'left' },
  heroMeta: { fontFamily: font.sansMedium, fontVariant: ['tabular-nums'], fontSize: textScale['2xs'], letterSpacing: 0.4, color: color.textMuted, textAlign: 'left' },

  graph: { marginTop: 20, alignItems: 'flex-start' },
  shareWeek: { marginTop: 14, alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  shareWeekLabel: { fontFamily: font.sansSemibold, fontSize: textScale.sm, color: color.textSecondary, textAlign: 'left' },

  // all-time milestone badges
  milestones: { marginTop: 26 },
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  badgeCell: { flex: 1, alignItems: 'center', gap: 7 },
  badgeRing: { width: 58, height: 58, borderRadius: 29, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.borderStrong, alignItems: 'center', justifyContent: 'center' },
  badgeInner: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' },
  badgeValue: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.sm, color: color.textPrimary, textAlign: 'center' },
  badgeUnit: { fontFamily: font.sansMedium, fontSize: 7.5, letterSpacing: 0.6, color: color.textMuted, textAlign: 'center' },
  badgeCaption: { fontFamily: font.sans, fontSize: textScale['2xs'], color: color.textSecondary, textAlign: 'center' },

  // lift focus
  focus: { marginTop: 4 },
  focusHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  focusName: { fontFamily: font.serif, fontSize: textScale.xl, color: color.textPrimary, flexShrink: 1, textAlign: 'left' },
  focusBest: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.lg, color: color.textPrimary, textAlign: 'left' },
  focusBestUnit: { fontFamily: font.mono, fontSize: textScale.xs, color: color.textMuted }, // rtl-ok: nested unit span, inherits textAlign from focusBest
  focusSpark: { marginTop: 18, alignItems: 'flex-start' },
  focusFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  footText: { fontFamily: font.sans, fontVariant: ['tabular-nums'], fontSize: textScale['2xs'], color: color.textTertiary, textAlign: 'left' },
  footNow: { color: color.up },
});
