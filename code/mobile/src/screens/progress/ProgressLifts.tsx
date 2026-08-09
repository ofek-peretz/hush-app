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
// @ts-nocheck

// 

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { I18nManager } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import { GhostClimb, Legend, SegmentedControl, VolumeArea } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { progressClaim, progressClaimKey } from '@/domain/progressClaim';
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

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {aggregate ? (
          <AllTime
            aggregate={aggregate}
            entries={entries}
            units={units}
            onShareWeek={onShareWeek}
            {...(onLift ? { onLift } : {})}
          />
        ) : null}
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

/**
 * ════ THE ANSWER, THEN THE EVIDENCE (founder 2026-08-04) ════
 *
 * ⛔ *"Right now it looks like a banal graph with a collection of milestones — and there's one for
 * every single exercise, which nobody is ever going to open."*
 *
 * The page led with LIFETIME TONNAGE, which is a vanity figure: it grows whether or not she is
 * getting stronger, and it cannot go down. It answers nothing. What she opens a progress tab to ask
 * is *am I getting stronger*, and the screen now answers that first — in one figure, one sentence,
 * and one line — with the table that proves it directly underneath.
 *
 * Tonnage keeps its place in the badge strip at the foot, where a lifetime total belongs.
 */
function AllTime({ aggregate, entries, units, onShareWeek, onLift }: {
  aggregate: ProgressAggregate;
  entries: QuarterlyProgressEntry[];
  units: Units;
  onShareWeek?: () => void;
  onLift?: (exerciseId: string) => void;
}) {
  const { t } = useCopy();
  // Live, not a snapshot taken at import — the graph follows a rotation or a split view.
  const graphW = Math.round(useWindowDimensions().width - 60);
  const a = aggregate;
  /*
   * ⚠️ THE kg TOTAL EXCLUDES REPS-MODE LIFTS and the CLAIM does not. A pull-up that went from six
   * reps to nine got stronger, but its gain is not kilograms — so it counts toward "every lift is
   * heavier" and adds nothing to "+47 kg". Two questions, two populations, and conflating them
   * would either lie about the kilograms or erase the bodyweight athlete.
   */
  const loadEntries = entries.filter((e) => e.mode !== 'reps');
  const totalGainKg = loadEntries.reduce((x, e) => x + Math.max(0, e.deltaKg), 0);
  const totalGain = displayWeight(Math.round(totalGainKg * 10) / 10, units) ?? 0;
  const claim = progressClaim(entries);
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
      {/*
        THE ANSWER. `+47 kg` — what she has actually added, not what she has moved. Before any lift
        has risen there is no total to state and a "+0" would read as a verdict, so the starting-point
        framing stands in its place: the first mark is what every later gain is measured against.
      */}
      <View style={styles.answer}>
        {totalGainKg > 0 ? (
          <>
            <Legend tone="onStage">{t('report.totalAdded')}</Legend>
            <View style={styles.heroValueRow}>
              <Text style={styles.heroValue}>{`+${totalGain}`}</Text>
              <Text style={[styles.heroUnit, !monoCanDraw(unitLabel(units)) && styles.heroUnitWord]}>{unitLabel(units)}</Text>
            </View>
          </>
        ) : (
          <>
            <Legend tone="onStage">{t('report.startingPoint')}</Legend>
            <Text style={styles.claim}>{t('report.startingPointSub')}</Text>
          </>
        )}

        {/*
          ⛔ AND THE SENTENCE, DERIVED (`domain/progressClaim`). It states what is true of the table
          under it and nothing else — a screen that could be generous about a bad month is a screen
          whose other figures have to be checked. Only something that watched can write it, which is
          the whole difference between this page and a chart.
        */}
        {claim && totalGainKg > 0 ? (
          <Text style={styles.claim}>
            {t(progressClaimKey(claim), claim.kind === 'some' ? { risen: claim.risen, lifts: claim.lifts } : { lifts: claim.kind === 'all' ? claim.lifts : 0 })}
          </Text>
        ) : null}

        <Legend size={11} track={0.12}>{t('progress.workoutsWeeks', { workouts: a.workouts, weeks: a.weeks })}</Legend>
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

      {/*
        ⛔ THE LIFTS, AS A TABLE — and this is the answer to *"nobody is ever going to open it."*

        They were a horizontal strip of chips carrying nothing but a NAME. A chip that says
        "Barbell Row" gives no reason to tap it: there is no way to tell from the outside whether
        anything is behind it, so nothing is. A row that already says `40 → 47.5  +7.5` has told her
        the answer AND told her there is more — which is the only honest way to earn a tap.

        ⚠️ Each row still opens that lift's own card, which is where the whole history belongs. The
        detail screen was never the problem; the front page pretending to be six of them was.
      */}
      {entries.length > 0 ? (
        <View style={styles.table}>
          <Legend tone="onStage">{t('progress.everyLift')}</Legend>
          {entries.map((e) => {
            // A bodyweight movement progresses in REPS and is never unit-converted (founder
            // 2026-07-10) — its row reads "9 reps", not a fabricated kilogram.
            const isReps = e.mode === 'reps';
            const conv = (v: number) => (isReps ? Math.round(v) : displayWeight(v, units) ?? 0);
            const unit = isReps ? t('report.repsUnit') : unitLabel(units);
            return (
              <Pressable
                key={e.exerciseId}
                accessibilityRole="button"
                accessibilityLabel={`${exerciseDisplayName(e.exerciseId)} ${conv(e.initialPeakKg)} ${conv(e.periodPeakKg)} ${unit}`}
                onPress={() => onLift?.(e.exerciseId)}
                style={({ pressed }) => [styles.liftRow, pressed && styles.liftRowPressed]}
              >
                <Text style={styles.liftName} numberOfLines={1}>{exerciseDisplayName(e.exerciseId)}</Text>
                <Text style={styles.liftFigure}>
                  <Text style={styles.liftFrom}>{conv(e.initialPeakKg)}</Text>
                  {' → '}
                  <Text style={styles.liftTo}>{conv(e.periodPeakKg)}</Text>
                  {/* A lift that has not moved shows no delta: "+0" reads as a result rather than as
                      a lift she has done twice at the same weight. */}
                  {e.deltaKg > 0 ? <Text style={styles.liftDelta}>{`  +${conv(e.deltaKg)}`}</Text> : null}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

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
          <Legend size={11} track={0.12} align="center">{unit}</Legend>
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
  /*
   * ⚠️ EVERY SIZE HERE IS THE FOUNDER'S FLOOR (2026-08-04): *"certainly not small type."* The claim
   * is 17 in the coach's serif, a lift name 16.5, its figure 15. Nothing on this page is a caption.
   */
  answer: { paddingHorizontal: space.gutter, gap: space[3] },
  claim: {
    fontFamily: font.serif,
    fontSize: 17,
    lineHeight: 25,
    color: color.textSecondary,
    textAlign: 'left',
  },
  table: { paddingHorizontal: space.gutter, gap: space[2], marginTop: space[6] },
  liftRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space[4],
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  /* A wash, never a fade — `aPressNeverDimsWhatYouPressed`. */
  liftRowPressed: { backgroundColor: color.surface },
  liftName: { flex: 1, fontFamily: font.sans, fontSize: 16.5, color: color.textPrimary, textAlign: 'left' },
  liftFigure: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: 15, color: color.textMuted, textAlign: 'left' },
  liftFrom: { color: color.textMuted },
  liftTo: { color: color.textPrimary },
  liftDelta: { fontFamily: font.monoMedium, color: signal[0], textAlign: 'left' },

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
