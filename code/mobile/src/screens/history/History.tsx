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
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Legend, ListRow } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import type { CardioActivity, HistoryItem, Session } from '@/data/local/models';
import { sessionDayName, displayWeight, unitLabel } from '@/domain/schedule';
import { fmtClock } from '@/platform/cardio/cardioTracker';
import { color, space, font, textScale, tracking, trackingPx, press } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'History'>;

function sessionDurationLabel(s: Session): string {
  const start = Date.parse(s.startedAt);
  const ends = s.sets.map((x) => Date.parse(x.persistedAt)).filter((n) => !Number.isNaN(n));
  const end = ends.length ? Math.max(...ends) : start;
  const total = Math.max(0, Math.round((end - start) / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function sessionVolumeKg(s: Session): number {
  return s.sets.reduce((sum, x) => sum + (x.actualWeight ?? 0) * x.actualReps, 0);
}

function dateLabelOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
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

  // Unified, reverse-chronological timeline (newest first).
  const items: HistoryItem[] = [
    ...(sessions ?? []).map((s): HistoryItem => ({ kind: 'strength', ...s })),
    ...cardio,
  ].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

  // Header summary — the STRENGTH work so far (the engine's record; cardio is
  // never graded and never counted as "kg moved").
  const strength = sessions ?? [];
  const totalSessions = strength.length;
  const totalKg = Math.round(strength.reduce((sum, s) => sum + sessionVolumeKg(s), 0));
  const totalVol = displayWeight(totalKg, units) ?? 0;
  const earliest = strength.length ? Math.min(...strength.map((s) => Date.parse(s.startedAt))) : Date.now();
  const weeks = Math.max(1, Math.ceil((Date.now() - earliest) / (7 * 24 * 60 * 60 * 1000)));

  const isEmpty = sessions != null && items.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.back, { opacity: pressed ? press.opacity : 1 }]}
        >
          <Icon name="chevronLeft" size={24} color={color.textPrimary} strokeWidth={2} />
        </Pressable>
        <View style={styles.headTitles}>
          <Legend>{t('history.legend')}</Legend>
          <Text style={styles.title} accessibilityRole="header">{t('history.title')}</Text>
        </View>
      </View>

      {isEmpty ? (
        <View style={styles.emptyWrap}>
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
                {t('history.summaryMoved', { weeks })}
              </Text>
            </View>
          ) : null}

          {items.map((item, i) => {
            const last = i === items.length - 1;
            if (item.kind === 'cardio') {
              return (
                <ListRow
                  key={item.id}
                  title={item.gait === 'run' ? t('cardio.run') : t('cardio.walk')}
                  subtitle={`${dateLabelOf(item.startedAt)} · ${fmtClock(item.durationSec)}`}
                  chevron
                  last={last}
                  onPress={() => navigation.navigate('CardioDetail', { activity: item })}
                  leading={
                    <View style={styles.iconBox}>
                      <Icon name="footprints" size={16} color={color.textSecondary} strokeWidth={2} />
                    </View>
                  }
                  trailing={<Text style={styles.vol}>{item.distanceKm.toFixed(2)} {t('cardio.km')}</Text>}
                />
              );
            }
            const volKg = sessionVolumeKg(item);
            const vol = displayWeight(Math.round(volKg), units) ?? 0;
            return (
              <ListRow
                key={item.id}
                title={dayName(item)}
                subtitle={`${dateLabelOf(item.startedAt)} · ${sessionDurationLabel(item)}`}
                chevron
                last={last}
                onPress={() => navigation.navigate('WorkoutDetail', { sessionId: item.id })}
                leading={
                  <View style={styles.iconBox}>
                    <Icon name="dumbbell" size={16} color={color.textSecondary} strokeWidth={2} />
                  </View>
                }
                trailing={
                  <Text style={styles.vol}>
                    {vol.toLocaleString()} {unitLabel(units)}
                  </Text>
                }
              />
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
  title: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, marginTop: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.gutter, paddingBottom: 40 },
  empty: { fontFamily: font.sans, fontSize: textScale.base, color: color.textSecondary, textAlign: 'center' },
  list: { paddingHorizontal: space.gutter, paddingBottom: 40 },

  summary: { paddingTop: 6, paddingBottom: 20, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: color.border },
  summaryCountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 8 },
  summaryCount: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale['3xl'], letterSpacing: -1.4, color: color.textPrimary },
  summaryCountLabel: { fontFamily: font.sans, fontSize: textScale.md, color: color.textSecondary },
  summaryBody: { marginTop: 12, fontFamily: font.sans, fontSize: textScale.md, lineHeight: 24, color: color.textSecondary },
  summaryStrong: { fontFamily: font.mono, color: color.textPrimary },

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
  vol: { fontFamily: font.mono, fontSize: textScale.xs, color: color.textMuted },
});
