/**
 * Workout Detail (§4.24) — read-only record of a logged session, rebuilt 1:1 to
 * the Claude Design "Design System" History record (ui_kits/app/History.jsx →
 * Record). Legend "{date} · read-only record" → name → Duration / Sets / Volume →
 * each exercise's ACTUAL logged sets as mono "weight × reps" chips. Immutable; no
 * targets, no editing.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Legend, Metric } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { exerciseById } from '@/data/exercises';
import { durationMinutes } from '@/domain/duration';
import { displayWeight, unitLabel, sessionDayName } from '@/domain/schedule';
import type { Session, SetLog } from '@/data/local/models';
import { color, space, font, textScale, tracking, trackingPx, press } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'WorkoutDetail'>;

/** Wall-clock seconds from the session's start to its last logged set. */
function durationSec(s: Session): number {
  if (s.sets.length === 0) return 0;
  const last = Date.parse(s.sets[s.sets.length - 1].persistedAt);
  return Math.max(0, Math.round((last - Date.parse(s.startedAt)) / 1000));
}

export function WorkoutDetail({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.loadHistory().then((all) => {
      setSession(all.find((s) => s.id === route.params.sessionId) ?? null);
      setLoading(false);
    });
  }, [route.params.sessionId]);

  // Group logged sets by exercise, preserving order.
  const order: string[] = [];
  const byEx: Record<string, SetLog[]> = {};
  for (const set of session?.sets ?? []) {
    if (!byEx[set.exerciseId]) {
      byEx[set.exerciseId] = [];
      order.push(set.exerciseId);
    }
    byEx[set.exerciseId].push(set);
  }

  const dateLabel = session
    ? new Date(session.startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    : '';
  const volumeKg = (session?.sets ?? []).reduce((sum, x) => sum + (x.actualWeight ?? 0) * x.actualReps, 0);
  const volume = displayWeight(Math.round(volumeKg), units) ?? 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.back, { opacity: pressed ? press.opacity : 1 }]}
        >
          <Icon name="chevronLeft" size={24} color={color.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>

      {loading || !session ? null : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Legend>{t('history.recordLegend', { date: dateLabel })}</Legend>
          <Text style={styles.title} accessibilityRole="header">{sessionDayName(session, app.program)}</Text>

          <View style={styles.stats}>
            {/* A recorded duration reads in MINUTES, like every other one in the app
                (domain/duration) — "1:03" beside a date reads as one in the morning. */}
            <Metric value={durationMinutes(durationSec(session))} unit={t('common.minShort')} label={t('history.duration')} size="sm" />
            <Metric value={session.sets.length} label={t('history.setsLabel')} size="sm" />
            <Metric value={volume.toLocaleString()} unit={unitLabel(units)} label={t('history.volumeLabel')} size="sm" />
          </View>

          <View style={styles.exercises}>
            {order.map((exId, idx) => (
              <View key={exId} style={[styles.exercise, idx < order.length - 1 && styles.exerciseBorder]}>
                <Text style={styles.exName}>{exerciseById(exId)?.name ?? exId}</Text>
                <View style={styles.chips}>
                  {byEx[exId].map((set, i) => {
                    const w = displayWeight(set.actualWeight, units);
                    return (
                      <View key={i} style={styles.chip}>
                        <Text style={styles.chipIdx}>{i + 1}</Text>
                        {w == null ? (
                          <>
                            <Text style={styles.chipNum}>{set.actualReps}</Text>
                            <Text style={styles.chipUnit}>{t('workout.repsUnit')}</Text>
                          </>
                        ) : (
                          <>
                            <Text style={styles.chipNum}>{w}</Text>
                            <Text style={styles.chipUnit}>{unitLabel(units)} ×</Text>
                            <Text style={styles.chipNum}>{set.actualReps}</Text>
                          </>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  headerRow: { paddingHorizontal: space.gutter - 4, paddingTop: 6, paddingBottom: 2 },
  back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  body: { paddingTop: 6, paddingHorizontal: space.gutter, paddingBottom: 48 },
  title: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, marginTop: 4, textAlign: 'left' },
  stats: { flexDirection: 'row', gap: 22, marginTop: 14 },
  exercises: { marginTop: 18 },
  exercise: { paddingVertical: 14 },
  exerciseBorder: { borderBottomWidth: 1, borderBottomColor: color.border },
  exName: { fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textPrimary, marginBottom: 10, textAlign: 'left' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: color.fillSubtle,
    borderRadius: 4,
  },
  chipIdx: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: 10, color: color.textTertiary, textAlign: 'left' },
  chipNum: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: textScale.sm, color: color.textPrimary, textAlign: 'left' },
  chipUnit: { fontFamily: font.sans, fontSize: textScale.xs, color: color.textMuted, textAlign: 'left' },
});
