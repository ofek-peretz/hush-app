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
 * engine type is read. A LIFT CHIP OPENS ITS OWN CARD (3.2b, screens/progress/LiftDetail): the
 * handoff retired the always-open inline history, so this surface only ever draws the aggregate.
 *
 * DAY ONE (3.6b): before any workout is logged there is nothing measured to draw, and Hush shows
 * only what was measured — so the page says so, over a ghost of the graph to come.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import { GhostClimb, Legend, SegmentedControl, VolumeArea } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { exerciseDisplayName } from '@/data/exercises';
import { monoCanDraw } from '@/design/monoVoice';
import type { QuarterlyProgressEntry } from '@/domain/progressReport';
import type { ProgressAggregate } from '@/domain/progressAggregate';
import type { Units } from '@/data/local/models';
import { Icon } from '@/components/Icon';
import { color, space, font, textScale, tracking, trackingPx, radius, signal, press } from '@/design/tokens';

interface Props {
  entries: QuarterlyProgressEntry[];
  aggregate: ProgressAggregate | null;
  loaded: boolean;
  units: Units;
  /** Opens the history ledger (the "Log" tab). */
  onLog?: () => void;
  /** Opens one lift's own card (3.2b) — what a lift chip does now. */
  onLift?: (exerciseId: string) => void;
  /** Opens the week's share card (§9.2) — present only when this week has real work to show. */
  onShareWeek?: () => void;
}

/** A lifetime figure, big and compact: "186" mono with a subordinate sans unit ("t"). */
const fmtTonnes = (kg: number): string => {
  const t = kg / 1000;
  return t >= 10 ? String(Math.round(t)) : String(+t.toFixed(1));
};
const fmtK = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

export function ProgressLifts({ entries, aggregate, loaded, units, onLog, onLift, onShareWeek }: Props) {
  const { t } = useCopy();
  // DAY ONE (3.6b) — nothing has been measured yet. The page then holds only its own name: there is
  // no Lifts/Log choice to make when both are empty, and no chip strip to scroll.
  const dayOne = loaded && entries.length === 0;

  if (dayOne) return <DayOne />;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* header — the section name in the coach's serif, and the Lifts / Log choice */}
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">{t('progress.title')}</Text>
        <SegmentedControl
          size="pill"
          style={styles.lens}
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
        <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipsRow}
        >
          {/* "All time" is where this surface stands; every other chip LEAVES it for that lift's
              own card (3.2b), so it is a door, not a filter. */}
          <Chip label={t('progress.chipAllTime')} active />
          {entries.map((e) => (
            <Chip
              key={e.exerciseId}
              label={exerciseDisplayName(e.exerciseId)}
              active={false}
              onPress={() => onLift?.(e.exerciseId)}
            />
          ))}
        </ScrollView>
        <View pointerEvents="none" style={styles.chipsFade}>
          <Svg width="100%" height="100%">
            <Defs>
              <SvgGradient id="progChipFade" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={color.bg} stopOpacity="0" />
                <Stop offset="1" stopColor={color.bg} stopOpacity="1" />
              </SvgGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#progChipFade)" />
          </Svg>
        </View>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {aggregate ? <AllTime aggregate={aggregate} units={units} onShareWeek={onShareWeek} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * 3.6b · PROGRESS — DAY ONE. "A ghost of the graph to come, and a promise that reads like a fact."
 *
 * No numbers, because none have been measured, and Hush shows only what was measured (R7). The one
 * lit thing on the page is where she stands: a single moss point at the foot of a dashed climb.
 */
function DayOne() {
  const { t } = useCopy();
  // The live window width, not a Dimensions snapshot taken at import — see LiftDetail's note.
  const ghostW = Math.round(useWindowDimensions().width - 64);
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.dayOneHeader}>
        <Text style={styles.title} accessibilityRole="header">{t('progress.title')}</Text>
      </View>
      <View style={styles.dayOne}>
        {ghostW > 0 ? <GhostClimb width={ghostW} height={150} label={t('progress.youAreHere')} /> : null}
        <Text style={styles.dayOneTitle}>{t('progress.dayOneTitle')}</Text>
        <Text style={styles.dayOneBody}>{t('progress.dayOneBody')}</Text>
        <View style={styles.dayOneNote}>
          <Icon name="check" size={15} color={signal[0]} strokeWidth={2.2} />
          <Text style={styles.dayOneNoteText}>{t('progress.dayOneFirstMark')}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

/** The aggregate lens: tonnage hero, weekly-volume graph, all-time milestone badges. */
function AllTime({ aggregate, units, onShareWeek }: { aggregate: ProgressAggregate; units: Units; onShareWeek?: () => void }) {
  const { t } = useCopy();
  // Live, not a snapshot taken at import — the graph follows a rotation or a split view.
  const graphW = Math.round(useWindowDimensions().width - 60);
  const a = aggregate;
  const series = a.weeklyTonnes;
  const first = series[0] ?? 0;
  const last = series[series.length - 1] ?? 0;

  const tonneUnit = t('progress.tonneUnit');
  const raises = t('progress.raises', { count: a.raises });

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
            {/* "t" is a unit, so it is mono like the figure — unless the locale spells it in a
                script mono cannot draw, in which case it hands over to sans. */}
            <Text style={[styles.heroUnit, !monoCanDraw(tonneUnit) && styles.heroUnitWord]}>{tonneUnit}</Text>
          </View>
        </View>
        <View style={styles.heroRight}>
          <View style={styles.raisesPill}>
            <Text style={[styles.raisesText, !monoCanDraw(raises) && styles.raisesTextWord]}>{raises}</Text>
          </View>
          <Legend size={10} track={0.12} align="right">{t('progress.workoutsWeeks', { workouts: a.workouts, weeks: a.weeks })}</Legend>
        </View>
      </View>

      {/* weekly-volume area graph */}
      <View style={styles.graph}>
        <VolumeArea
          data={series}
          width={graphW}
          height={150}
          startLabel={`${first} ${t('progress.unitTonnes')} · ${t('progress.volWeekOne')}`.toUpperCase()}
          endLabel={`${last} ${t('progress.unitTonnes')} · ${t('progress.volThisWeek')}`.toUpperCase()}
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

/**
 * A chip. WITHOUT `onPress` it is not a button at all — "All time" names the surface you are
 * already standing on, and a control that announces itself to a screen reader and then does
 * nothing is a lie the size of a tap.
 */
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress?: () => void }) {
  const body = (
    <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextIdle]} numberOfLines={1}>
      {label}
    </Text>
  );
  const shape = [styles.chip, active ? styles.chipActive : styles.chipIdle];
  if (!onPress) {
    return (
      <View accessible accessibilityState={{ selected: active }} style={shape}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [...shape, { opacity: pressed ? press.opacity : 1 }]}
    >
      {body}
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
          <Legend size={7.5} track={0.12} align="center">{unit}</Legend>
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
    paddingHorizontal: 30,
    paddingTop: 20,
    paddingBottom: 16,
  },
  // "Progress" at 40 — a surface title, one step below the letter's 56 and above a step's 32.
  title: { fontFamily: font.serif, fontSize: 40, lineHeight: 42, color: color.textPrimary, textAlign: 'left' },
  // The Lifts / Log switch rides on the headline's shoulder, not on its baseline.
  lens: { marginTop: 8 },

  chipsRow: { flexGrow: 0 },
  chipsWrap: { position: 'relative', overflow: 'hidden' },
  // The strip runs off the page rather than stopping — the same 56px fade Today's chooser uses.
  chipsFade: { position: 'absolute', top: 0, bottom: 0, end: 0, width: 56 },
  chips: { paddingHorizontal: 30, gap: 8, paddingBottom: 12 },
  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.full, justifyContent: 'center' },
  chipActive: { backgroundColor: color.textPrimary },
  chipIdle: { borderWidth: 1, borderColor: 'rgba(241,238,229,0.2)' },
  chipText: { fontFamily: font.sansMedium, fontSize: 13, textAlign: 'left' },
  chipTextActive: { color: color.bg, fontFamily: font.sansSemibold }, // rtl-ok: merged onto chipText, which sets textAlign
  chipTextIdle: { color: color.textSecondary },

  body: { paddingHorizontal: 30, paddingTop: 20, paddingBottom: 40, flexGrow: 1 },

  // ── 3.6b · day one ──────────────────────────────────────────────────────────────────────────
  dayOneHeader: { paddingHorizontal: 30, paddingTop: 20 },
  // Centred in the page, not stacked under the title: on day one the page IS this block.
  dayOne: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 40, gap: 22 },
  // 34 in the coach's serif — the promise, at the size of a screen headline.
  dayOneTitle: { fontFamily: font.serif, fontSize: 34, lineHeight: 39, color: color.textPrimary, textAlign: 'left' },
  dayOneBody: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 23, color: color.textSecondary, textAlign: 'left' },
  dayOneNote: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: color.border, paddingTop: 16 },
  dayOneNoteText: { flex: 1, fontFamily: font.sans, fontSize: 14, color: color.textSecondary, textAlign: 'left' },

  // tonnage hero
  hero: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  heroLeft: { flexShrink: 1, gap: 3 },
  heroValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  heroValue: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 56, lineHeight: 56, letterSpacing: -1.68, color: color.textPrimary, textAlign: 'left' },
  // "t" is a UNIT, and a unit is a measurement — mono, like the figure it belongs to.
  heroUnit: { fontFamily: font.mono, fontSize: 20, color: color.textMuted, textAlign: 'left' },
  heroUnitWord: { fontFamily: font.sans },
  heroRight: { flexShrink: 0, alignItems: 'flex-end', gap: 4 },
  raisesPill: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: radius.full, backgroundColor: 'rgba(169,196,159,0.18)' },
  raisesText: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: 18, color: signal[0], textAlign: 'left' },
  raisesTextWord: { fontFamily: font.sansSemibold },

  graph: { marginTop: 14, alignItems: 'flex-start' },
  shareWeek: { marginTop: 14, alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  shareWeekLabel: { fontFamily: font.sansSemibold, fontSize: textScale.sm, color: color.textSecondary, textAlign: 'left' },

  // all-time milestone badges
  milestones: { marginTop: 26, gap: 14 },
  badgeRow: { flexDirection: 'row', gap: 6 },
  badgeCell: { flex: 1, alignItems: 'center', gap: 7 },
  badgeRing: { width: 58, height: 58, borderRadius: 29, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(241,238,229,0.4)', alignItems: 'center', justifyContent: 'center' },
  badgeInner: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: 'rgba(241,238,229,0.15)', backgroundColor: color.fillSubtle, alignItems: 'center', justifyContent: 'center' },
  badgeValue: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 14, color: color.textPrimary, textAlign: 'center' },
  badgeCaption: { fontFamily: font.sans, fontSize: 14, lineHeight: 14, color: color.textSecondary, textAlign: 'center' },

});
