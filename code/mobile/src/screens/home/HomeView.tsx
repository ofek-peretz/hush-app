/**
 * HomeView — the center of gravity, rebuilt 1:1 to the Claude Design "Design
 * System" Home (ui_kits/app/Home.jsx).
 *
 * Hub-and-spoke, no tab bar. A scrolling hub that answers one question on open —
 * what do I do next? — and offers the one affordance to begin:
 *   brand (hush·) + settings · Legend(NEXT WORKOUT) · workout name · muscle
 *   groups · one quiet meta line (exercises · loads set) · week ProgressMeter ·
 *   Begin {name} · Choose another workout (bottom sheet — restored 2026-07-10;
 *   the view had silently lost the phone affordance while the watch kept it) ·
 *   Open training · hub rows (This week / History / Progress).
 * Rest state centers "Recovery." with the completed-week meter and one quiet
 * fact — when the next week opens (Sunday morning, the calendar roll).
 *
 * The container (Home.tsx) wires state + navigation.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { HushMark } from '@/components/HushMark';
import { BottomSheet } from '@/components/BottomSheet';
import { TextAction } from '@/components/TextAction';
import { Legend, Display, BodyL, Body, Button, ProgressMeter, ListRow, IconButton } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { color, space, font, textScale, signal, radius } from '@/design/tokens';

export interface HomeWorkoutOption {
  id: string;
  name: string;
  muscles: string;
}

export interface HomeViewProps {
  resting: boolean;
  dayName: string | null;
  muscles: string; // "Chest · Shoulders · Triceps"
  trainedThisWeek: number;
  startError: boolean;
  weekNumber: number; // training-week counter ("Week N"), from memberSince
  exerciseCount?: number; // next workout's exercise count (meta line)
  /** An interrupted (app-killed) workout that can be picked up exactly where it was (S3).
   *  When present, the primary CTA becomes "Continue {workout}" — one path, no fork. */
  resumable?: { workoutName: string } | null;
  onResume?: () => void;
  onStart: () => void;
  workouts: HomeWorkoutOption[];
  onChooseWorkout: (id: string) => void;
  onProgram: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onProgress?: () => void;
  onCardio: () => void; // Open training (run / walk) — recorded, not coached
}

export function HomeView(props: HomeViewProps) {
  const { t } = useCopy();
  const [choosing, setChoosing] = useState(false);

  const total = props.workouts.length || 0;
  const done = Math.min(props.trainedThisWeek, total);
  const groups = props.muscles ? props.muscles.split(' · ').filter(Boolean) : [];

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        {/* brand + account */}
        <View style={styles.brandRow}>
          <View style={styles.brand}>
            <HushMark size={26} />
            <Text style={styles.wordmark}>hush</Text>
            <View style={styles.dot} />
          </View>
          <IconButton accessibilityLabel={t('menu.title')} onPress={props.onSettings}>
            <Icon name="sliders" size={20} color={color.textPrimary} strokeWidth={2} />
          </IconButton>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Founder 2026-07-10: the greeting line above NEXT WORKOUT said nothing the
              legend + workout name don't — cut. The workout is the star. */}
          <View style={styles.legendTop}>
            <Legend>{props.resting ? t('home.recovery') : t('home.nextWorkout')}</Legend>
          </View>

          {props.resting ? (
            <View style={styles.block}>
              <Display>{t('home.restTitle')}</Display>
              <BodyL tone="secondary" style={styles.restCopy}>
                {t('home.restSub')}
              </BodyL>
              <View style={styles.meterWrap}>
                <ProgressMeter
                  label={t('home.weekComplete', { n: props.weekNumber })}
                  valueLabel={`${total} / ${total}`}
                  value={total}
                  max={total || 1}
                  tone="up"
                  size="lg"
                />
              </View>
              {/* the one fact recovery is waiting on — when the next week opens */}
              <View style={styles.metaRow}>
                <Icon name="calendar" size={15} color={color.textTertiary} strokeWidth={2} />
                <Text style={styles.metaMono}>{t('home.restNext')}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.block}>
              <Display>{props.dayName ?? ''}</Display>
              {groups.length ? (
                <View style={styles.groups}>
                  {groups.map((g, i) => (
                    <View key={g} style={styles.groupItem}>
                      <Body tone="secondary">{g}</Body>
                      {i < groups.length - 1 ? <Text style={styles.sep}>·</Text> : null}
                    </View>
                  ))}
                </View>
              ) : null}

              {/* one quiet meta line — what's ahead + the product promise, together */}
              <View style={styles.metaRow}>
                <Icon name="checkCircle" size={15} color={color.up} strokeWidth={2} />
                <Text style={styles.metaMono}>
                  {props.exerciseCount
                    ? `${t('home.exerciseCount', { n: props.exerciseCount })} · ${t('home.loadsSet')}`
                    : t('home.loadsSet')}
                </Text>
              </View>

              <View style={styles.meterWrap}>
                <ProgressMeter
                  label={t('home.weekLabel', { n: props.weekNumber })}
                  valueLabel={`${done} / ${total}`}
                  value={done}
                  max={total || 1}
                  tone="signal"
                />
              </View>

              {props.startError ? <Body tone="secondary" style={styles.error}>{t('errors.general')}</Body> : null}

              <View style={styles.cta}>
                {props.resumable ? (
                  <Button
                    variant="primary"
                    size="lg"
                    block
                    label={t('home.continueWorkout', { name: bidi(props.resumable.workoutName) })}
                    onPress={props.onResume}
                    leading={<Icon name="play" size={18} color={color.onAccent} />}
                  />
                ) : props.dayName ? (
                  <Button
                    variant="primary"
                    size="lg"
                    block
                    label={t('home.begin', { name: bidi(props.dayName) })}
                    onPress={props.onStart}
                    leading={<Icon name="play" size={18} color={color.onAccent} />}
                  />
                ) : null}
                {/* the athlete owns the week's order — a quiet path to queue a different workout */}
                {!props.resumable && props.workouts.length > 1 ? (
                  <TextAction label={t('home.chooseAnother')} onPress={() => setChoosing(true)} />
                ) : null}
              </View>
            </View>
          )}

          {/* open training — run / walk, recorded not coached (sealed from the engine) */}
          <View style={styles.openTraining}>
            <Legend style={styles.hubLegend}>{t('home.openTraining')}</Legend>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('cardio.title')}
              onPress={props.onCardio}
              style={({ pressed }) => [styles.cardioCard, pressed && styles.cardioCardPressed]}
            >
              <View style={styles.cardioIconBox}>
                <Icon name="footprints" size={19} color={color.textSecondary} strokeWidth={2} />
              </View>
              <View style={styles.cardioText}>
                <Text style={styles.cardioTitle}>{t('cardio.title')}</Text>
                <Text style={styles.cardioSub}>{t('cardio.recordedNotCoached')}</Text>
              </View>
              <Icon name="chevronRight" size={18} color={color.textTertiary} strokeWidth={2} />
            </Pressable>
          </View>

          {/* hub entries */}
          <View style={styles.hub}>
            <Legend style={styles.hubLegend}>{t('home.programLegend')}</Legend>
            <ListRow
              title={t('home.hubThisWeek')}
              subtitle={t('home.hubThisWeekSub', { done, remaining: Math.max(0, total - done) })}
              chevron
              onPress={props.onProgram}
              leading={<Icon name="calendar" size={20} color={color.textSecondary} strokeWidth={2} />}
            />
            <ListRow
              title={t('home.hubHistory')}
              subtitle={t('home.hubHistorySub')}
              chevron
              onPress={props.onHistory}
              leading={<Icon name="history" size={20} color={color.textSecondary} strokeWidth={2} />}
            />
            {props.onProgress ? (
              <ListRow
                title={t('home.hubProgress')}
                subtitle={t('home.hubProgressSub')}
                chevron
                last
                onPress={props.onProgress}
                leading={<Icon name="trendingUp" size={20} color={color.textSecondary} strokeWidth={2} />}
              />
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* choose another workout — the weekly bucket is unscheduled; the athlete queues any of it */}
      {choosing ? (
        <BottomSheet onClose={() => setChoosing(false)}>
          <Legend style={styles.sheetLegend}>{t('home.chooseAnother')}</Legend>
          {props.workouts.map((w, i) => {
            const current = w.name === props.dayName;
            return (
              <ListRow
                key={w.id}
                title={w.name}
                subtitle={w.muscles}
                chevron={!current}
                last={i === props.workouts.length - 1}
                onPress={() => {
                  if (!current) props.onChooseWorkout(w.id);
                  setChoosing(false);
                }}
                trailing={current ? <Icon name="check" size={18} color={color.up} strokeWidth={2.2} /> : undefined}
              />
            );
          })}
        </BottomSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  safe: { flex: 1 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.gutter,
    paddingTop: 4,
  },
  // The wordmark + accent dot is a brand lockup — it stays LTR ("Hush·") in every
  // locale rather than mirroring to "·Hush".
  brand: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, direction: 'ltr' },
  wordmark: { fontFamily: font.sansSemibold, fontSize: 21, letterSpacing: -0.6, color: color.textPrimary },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: signal[0], marginLeft: 2, marginBottom: 5 }, // rtl-ok: inside LTR brand lockup

  scroll: { paddingHorizontal: space.gutter, paddingBottom: 32 },
  legendTop: { paddingTop: 24 },
  block: { paddingTop: 14 },
  restCopy: { marginTop: 14, maxWidth: 320 },

  sheetLegend: { marginTop: 6, marginBottom: 8 },

  openTraining: { marginTop: 24 },
  cardioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cardioCardPressed: { backgroundColor: color.fillSubtle },
  cardioIconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: color.fillSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardioText: { flex: 1, minWidth: 0 },
  cardioTitle: { fontFamily: font.sansSemibold, fontSize: textScale.md, color: color.textPrimary },
  cardioSub: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, marginTop: 2 },

  groups: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, alignItems: 'center' },
  groupItem: { flexDirection: 'row', alignItems: 'center' },
  sep: { marginHorizontal: 10, color: color.textTertiary, fontFamily: font.sans, fontSize: textScale.base },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  metaMono: { fontFamily: font.mono, fontSize: textScale.sm, color: color.textMuted },

  meterWrap: { marginTop: 28 },
  error: { marginTop: 16 },
  cta: { marginTop: 24, gap: 10 },

  hub: { marginTop: 34 },
  hubLegend: { marginBottom: 4 },
});
