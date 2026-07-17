/**
 * History (§4.22/§4.23) — the flight recorder, rebuilt 1:1 to the Claude Design
 * "Design System" History (ui_kits/app/History.jsx). A single unified, reverse-
 * chronological timeline of everything recorded: completed strength sessions AND
 * recorded cardio activities (run / walk). The header sums the strength work so
 * far; cardio is simply another recorded activity type in the same timeline.
 *
 * Tapping a strength row opens its read-only record (WorkoutDetail); tapping a
 * cardio row opens its activity details (CardioDetail). Records without
 * interpreting — no praise, no PRs, and no grade on a run.
 *
 * Founder 2026-07-10 (design pass): the timeline reads in month chapters — a quiet
 * legend when the month changes; a wall of rows isn't a record.
 *
 * Founder 2026-07-17 (from the reference): a strength session is a CARD you can read — its lifts,
 * each with the top set it took ("Barbell Bench Press · 80 kg"). This does not reopen the
 * 2026-07-12 "no trailing figure" ruling; it honours it. That banned ONE bare number on a whole
 * session ("17 kg" — top set? average?), which the athlete could not interpret. A LABELLED per-lift
 * line answers exactly what it shows. The set-by-set detail still lives one tap in (WorkoutDetail).
 *
 * Durations everywhere read in MINUTES ("63 min"), never as a clock — "1:03" next to a date reads
 * as one in the morning (see domain/duration).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { Icon } from '@/components/Icon';
import { Legend, ListRow } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { exerciseDisplayName } from '@/data/exercises';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import type { CardioActivity, HistoryItem, Session } from '@/data/local/models';
import { sessionDayName, displayWeight, unitLabel } from '@/domain/schedule';
import { fmtMinutes } from '@/domain/duration';
import { cardioPerformed } from '@/domain/cardio';
import { color, space, font, textScale, tracking, trackingPx, press, radius } from '@/design/tokens';
import type { MainParamList, HomeTabsParamList } from '@/app/navigation';

// A TAB now (founder 2026-07-17), so it pushes onto the parent stack — the Props are the
// composite of the tab it lives in and the stack above it.
type Props = CompositeScreenProps<
  BottomTabScreenProps<HomeTabsParamList, 'History'>,
  NativeStackScreenProps<MainParamList>
>;

/** Wall-clock seconds from the session's start to its last logged set. */
function sessionDurationSec(s: Session): number {
  const start = Date.parse(s.startedAt);
  const ends = s.sets.map((x) => Date.parse(x.persistedAt)).filter((n) => !Number.isNaN(n));
  const end = ends.length ? Math.max(...ends) : start;
  return Math.max(0, Math.round((end - start) / 1000));
}

function sessionVolumeKg(s: Session): number {
  return s.sets.reduce((sum, x) => sum + (x.actualWeight ?? 0) * x.actualReps, 0);
}

/**
 * The lifts a session trained, each with the top set it took — the record read at a glance
 * (founder 2026-07-17, from the reference: History lists "Bench Press · 80 kg" per lift).
 *
 * This does NOT reopen the "no trailing figure" ruling (2026-07-12). That banned ONE bare number on
 * a whole session — "17 kg", top set? average? — which the athlete could not interpret. A LABELLED
 * per-lift line is the opposite: "Bench Press · 80 kg" answers exactly what it shows. The set-by-set
 * detail still lives in WorkoutDetail; this is the spine of it, on the card.
 *
 * The top set is the heaviest work (weight × reps), ties to the longer set — the same comparator the
 * closing read-back uses (sessionMirror.summaryLifts), so History and Well Done never name different
 * sets for the same lift.
 */
function sessionLifts(s: Session): Array<{ exerciseId: string; load: number | null; reps: number }> {
  const order: string[] = [];
  const best = new Map<string, { load: number | null; reps: number }>();
  const vol = (w: number | null, r: number) => (w ?? 0) * r;
  for (const set of s.sets) {
    const cur = best.get(set.exerciseId);
    if (!cur) order.push(set.exerciseId);
    const better =
      !cur ||
      vol(set.actualWeight, set.actualReps) > vol(cur.load, cur.reps) ||
      (vol(set.actualWeight, set.actualReps) === vol(cur.load, cur.reps) && set.actualReps > cur.reps);
    if (better) best.set(set.exerciseId, { load: set.actualWeight, reps: set.actualReps });
  }
  return order.map((id) => ({ exerciseId: id, ...best.get(id)! }));
}

function dateLabelOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Month chapter label — "July 2026", locale-aware. */
function monthLabelOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function History({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  const [sessions, setSessions] = useState<Session[] | null>(null); // null = loading
  const [cardio, setCardio] = useState<CardioActivity[]>([]);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      Promise.all([db.loadHistory(), db.loadCardio()]).then(([all, cd]) => {
        if (!active) return;
        setSessions(all);
        setCardio(cd);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const dayName = (s: Session) => sessionDayName(s, app.program);

  // Only PERFORMED work is a record (founder 2026-07-10): a session with zero
  // completed sets or a cardio false-start never shows here. Writers already gate
  // these; this display gate also covers records persisted before the rule existed.
  const strength = (sessions ?? []).filter((s) => s.sets.length > 0);
  const performedCardio = cardio.filter((a) => cardioPerformed(a.durationSec, a.distanceKm));

  // Unified, reverse-chronological timeline (newest first).
  const items: HistoryItem[] = [
    ...strength.map((s): HistoryItem => ({ kind: 'strength', ...s })),
    ...performedCardio,
  ].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

  // Header summary — the STRENGTH work so far (the engine's record; cardio is
  // never graded and never counted as "kg moved").
  const totalSessions = strength.length;
  const totalKg = Math.round(strength.reduce((sum, s) => sum + sessionVolumeKg(s), 0));
  const totalVol = displayWeight(totalKg, units) ?? 0;
  const earliest = strength.length ? Math.min(...strength.map((s) => Date.parse(s.startedAt))) : Date.now();
  const weeks = Math.max(1, Math.ceil((Date.now() - earliest) / (7 * 24 * 60 * 60 * 1000)));

  const isEmpty = sessions != null && items.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* No back chevron — History is a tab now; you leave by tapping another tab. The title sits
          at the page edge (like the reference), not indented behind a chevron that is not there. */}
      <View style={styles.header}>
        <View style={styles.headTitles}>
          <Legend>{t('history.legend')}</Legend>
          <Text style={styles.title} accessibilityRole="header">{t('history.title')}</Text>
        </View>
      </View>

      {isEmpty ? (
        // The first day is not a blank page (founder 2026-07-12) — it is the ledger, open
        // and clean. An empty state is a chance to say what this place IS.
        <View style={styles.emptyWrap}>
          <View style={styles.emptyMark}>
            <Icon name="history" size={24} color={color.textTertiary} strokeWidth={1.75} />
          </View>
          <Text style={styles.emptyTitle}>{t('history.emptyTitle')}</Text>
          <Text style={styles.empty}>{t('history.empty')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {totalSessions > 0 ? (
            <View style={styles.summary}>
              <Legend>{t('history.summaryLegend')}</Legend>
              <View style={styles.summaryCountRow}>
                <Text style={styles.summaryCount}>{totalSessions}</Text>
                <Text style={styles.summaryCountLabel}>{t('history.sessionsLogged')}</Text>
              </View>
              <Text style={styles.summaryBody}>
                <Text style={styles.summaryStrong}>{totalVol.toLocaleString()} {unitLabel(units)}</Text>
                {/* "…across 1 week" / "…across 6 weeks" — i18next plural forms. A product that
                    prints "1 weeks" is not a premium product (founder 2026-07-12). */}
                {t('history.summaryMoved', { count: weeks })}
              </Text>
            </View>
          ) : null}

          {items.map((item, i) => {
            // Month chapters: a quiet legend where the month turns; each chapter's
            // final row drops its divider so chapters read as distinct blocks.
            const month = monthLabelOf(item.startedAt);
            const newMonth = i === 0 || monthLabelOf(items[i - 1].startedAt) !== month;
            const last = i === items.length - 1 || monthLabelOf(items[i + 1].startedAt) !== month;
            const row =
              item.kind === 'cardio' ? (
                <ListRow
                  title={item.gait === 'run' ? t('cardio.run') : t('cardio.walk')}
                  // "Sat, 11 Jul · 63 min" — a duration, never a clock (see domain/duration).
                  subtitle={`${dateLabelOf(item.startedAt)} · ${fmtMinutes(item.durationSec, t('common.minShort'))}`}
                  chevron
                  last={last}
                  onPress={() => navigation.navigate('CardioDetail', { activity: item })}
                  leading={
                    <View style={styles.iconBox}>
                      <Icon name={item.gait === 'run' ? 'runner' : 'footprints'} size={16} color={color.textSecondary} strokeWidth={2} />
                    </View>
                  }
                  // Distance is what a run IS — it stays.
                  trailing={<Text style={styles.vol}>{item.distanceKm.toFixed(2)} {t('cardio.km')}</Text>}
                />
              ) : (
                /* A READABLE RECORD, not a row that hides one (founder 2026-07-17, from the
                   reference). The header dates it and names it; the lines under it are the lifts
                   with the top set each took — "Barbell Bench Press · 80 kg". You read what you did
                   without tapping in; the set-by-set detail is still one tap away (WorkoutDetail). */
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${dayName(item)} · ${dateLabelOf(item.startedAt)}`}
                  onPress={() => navigation.navigate('WorkoutDetail', { sessionId: item.id })}
                  style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                >
                  <View style={styles.cardHead}>
                    <Text style={styles.cardDate}>{dateLabelOf(item.startedAt)}</Text>
                    <View style={styles.namePill}>
                      <Text style={styles.namePillText} numberOfLines={1}>{bidi(dayName(item))}</Text>
                    </View>
                    {/* SANS, not mono: the duration ends in a translated word — "63 min" but
                        "63 דק׳" in Hebrew, and JetBrains Mono has no Hebrew glyphs. */}
                    <Text style={styles.cardMin} allowFontScaling>{fmtMinutes(sessionDurationSec(item), t('common.minShort'))}</Text>
                  </View>
                  {sessionLifts(item).map((lift) => {
                    // The load string is BUILT here, then rendered as a plain value — so the mono
                    // Text holds no `t(` call (the load is figures + a Latin unit: kg / lb / BW).
                    const loadLabel = lift.load == null ? t('workout.bw') : `${displayWeight(lift.load, units)} ${unitLabel(units)}`;
                    return (
                      <View key={lift.exerciseId} style={styles.liftLine}>
                        <Text style={styles.liftName} numberOfLines={1}>{bidi(exerciseDisplayName(lift.exerciseId))}</Text>
                        <Text style={styles.liftLoad}>{loadLabel}</Text>
                      </View>
                    );
                  })}
                </Pressable>
              );
            return (
              <View key={item.id}>
                {newMonth ? <Legend style={styles.monthLegend}>{month}</Legend> : null}
                {row}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.gutter - 4, paddingTop: 6, paddingBottom: 12, minHeight: 44 },
  back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headTitles: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, marginTop: 1, textAlign: 'left' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.gutter, paddingBottom: 40 },
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
  list: { paddingHorizontal: space.gutter, paddingBottom: 40 },

  summary: { paddingTop: 6, paddingBottom: 20, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: color.border },
  summaryCountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 8 },
  summaryCount: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale['3xl'], letterSpacing: -1.4, color: color.textPrimary, textAlign: 'left' },
  summaryCountLabel: { fontFamily: font.sans, fontSize: textScale.md, color: color.textSecondary, textAlign: 'left' },
  summaryBody: { marginTop: 12, fontFamily: font.sans, fontSize: textScale.md, lineHeight: 24, color: color.textSecondary, textAlign: 'left' },
  summaryStrong: { fontFamily: font.mono, fontVariant: ['tabular-nums'], color: color.textPrimary, textAlign: 'left' },

  monthLegend: { marginTop: 20, marginBottom: 4 },

  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: color.fillSubtle,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vol: { fontFamily: font.sans, fontVariant: ['tabular-nums'], fontSize: textScale.xs, color: color.textMuted, textAlign: 'left' },

  /* A session, read at a glance — a raised card, its lifts and loads listed. */
  card: {
    marginTop: 12,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  cardPressed: { backgroundColor: color.fillSubtle },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  cardDate: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: textScale.xs, color: color.textMuted, textAlign: 'left' },
  namePill: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  namePillText: { fontFamily: font.sansSemibold, fontSize: textScale.sm, color: color.textPrimary, textAlign: 'left' },
  cardMin: { fontFamily: font.sans, fontSize: textScale.xs, color: color.textMuted, textAlign: "right" },
  liftLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingVertical: 3 },
  liftName: { flex: 1, minWidth: 0, fontFamily: font.sans, fontSize: textScale.sm, color: color.textSecondary, textAlign: 'left' },
  liftLoad: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: textScale.sm, color: color.textPrimary, textAlign: 'right' },
});
