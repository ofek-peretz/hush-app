/**
 * HomeView — the center of gravity, rebuilt 1:1 to the Claude Design "Design
 * System" Home (ui_kits/app/Home.jsx).
 *
 * Hub-and-spoke, no tab bar. A scrolling hub that answers one question on open —
 * what do I do next? — and offers the one affordance to begin:
 *   brand (hush·) + settings · Legend(NEXT WORKOUT) · workout name · muscle
 *   groups · week ProgressMeter · Begin {name} · Choose another workout ·
 *   hub rows (This week / History / Progress).
 * Rest state centers "Recovery." with the completed-week meter and a locked next.
 *
 * The container (Home.tsx) wires state + navigation.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Legend, Display, BodyL, Body, Button, ProgressMeter, ListRow, IconButton, Metric } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { color, space, font, textScale, signal } from '@/design/tokens';

export interface HomeWorkoutOption {
  id: string;
  name: string;
  muscles: string;
}

export interface HomeViewProps {
  resting: boolean;
  dayName: string | null;
  muscles: string; // "Chest · Shoulders · Triceps"
  greetingPart: 'morning' | 'afternoon' | 'evening';
  name: string | null;
  trainedThisWeek: number;
  startError: boolean;
  dateLabel: string;
  weekNumber: number; // training-week counter ("Week N"), from memberSince
  onStart: () => void;
  workouts: HomeWorkoutOption[];
  onChooseWorkout: (id: string) => void;
  onProgram: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onProgress?: () => void;
}

export function HomeView(props: HomeViewProps) {
  const { t } = useCopy();
  const [chooseOpen, setChooseOpen] = useState(false);

  const total = props.workouts.length || 0;
  const done = Math.min(props.trainedThisWeek, total);
  const groups = props.muscles ? props.muscles.split(' · ').filter(Boolean) : [];

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        {/* brand + account */}
        <View style={styles.brandRow}>
          <View style={styles.brand}>
            <Text style={styles.wordmark}>hush</Text>
            <View style={styles.dot} />
          </View>
          <IconButton accessibilityLabel={t('menu.title')} onPress={props.onSettings}>
            <Icon name="sliders" size={20} color={color.textPrimary} strokeWidth={2} />
          </IconButton>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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
              {/* two instrument stats: the week counter + when the next week opens (Sunday 04:00) */}
              <View style={styles.statRow}>
                <Metric value={props.weekNumber} label={t('home.weekStat')} size="sm" />
                <Metric value={t('recovery.sunShort')} label={t('home.nextSessionOpens')} size="sm" />
              </View>
              {/* the next session, locked until Sunday 04:00 */}
              <View style={styles.lockedWrap}>
                <ListRow
                  title={props.workouts[0]?.name ?? t('home.nextSession')}
                  subtitle={props.workouts[0]?.muscles}
                  muted
                  last
                  leading={<Icon name="lock" size={20} color={color.textTertiary} strokeWidth={2} />}
                  trailing={<Text style={styles.lockedDay}>{t('recovery.sunday')}</Text>}
                />
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
                {props.dayName ? (
                  <Button
                    variant="primary"
                    size="lg"
                    block
                    label={t('home.begin', { name: props.dayName })}
                    onPress={props.onStart}
                    leading={<Icon name="play" size={18} color={color.onAccent} />}
                  />
                ) : null}
                <Button variant="quiet" block label={t('home.chooseAnother')} onPress={() => setChooseOpen(true)} />
              </View>
            </View>
          )}

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

      {/* Choose another workout — full-screen list, each row = name + muscles. */}
      {chooseOpen ? (
        <View style={styles.overlay}>
          <SafeAreaView edges={['top', 'bottom']} style={styles.overlaySafe}>
            <View style={styles.overlayHead}>
              <Text style={styles.overlayTitle} accessibilityRole="header">
                {t('choose.title')}
              </Text>
              <IconButton accessibilityLabel={t('common.back')} onPress={() => setChooseOpen(false)}>
                <Icon name="close" size={22} color={color.textSecondary} strokeWidth={2} />
              </IconButton>
            </View>
            <ScrollView contentContainerStyle={styles.overlayList} showsVerticalScrollIndicator={false}>
              {props.workouts.map((w, i) => (
                <ListRow
                  key={w.id}
                  title={w.name}
                  subtitle={w.muscles}
                  chevron
                  last={i === props.workouts.length - 1}
                  onPress={() => {
                    props.onChooseWorkout(w.id);
                    setChooseOpen(false);
                  }}
                />
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
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
  brand: { flexDirection: 'row', alignItems: 'flex-end' },
  wordmark: { fontFamily: font.sansSemibold, fontSize: 21, letterSpacing: -0.6, color: color.textPrimary },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: signal[0], marginLeft: 2, marginBottom: 5 },

  scroll: { paddingHorizontal: space.gutter, paddingBottom: 32 },
  legendTop: { paddingTop: 26 },
  block: { paddingTop: 14 },
  restCopy: { marginTop: 14, maxWidth: 320 },

  groups: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, alignItems: 'center' },
  groupItem: { flexDirection: 'row', alignItems: 'center' },
  sep: { marginHorizontal: 10, color: color.textTertiary, fontFamily: font.sans, fontSize: textScale.base },

  meterWrap: { marginTop: 28 },
  statRow: { flexDirection: 'row', gap: 28, marginTop: 24 },
  lockedWrap: { marginTop: 20 },
  lockedDay: { fontFamily: font.mono, fontSize: textScale.xs, color: color.textMuted },
  error: { marginTop: 16 },
  cta: { marginTop: 24, gap: 10 },

  hub: { marginTop: 34 },
  hubLegend: { marginBottom: 4 },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: color.bg },
  overlaySafe: { flex: 1, paddingHorizontal: space.gutter },
  overlayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, marginLeft: 4 },
  overlayTitle: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: -0.3, color: color.textPrimary },
  overlayList: { paddingTop: 12, paddingBottom: 24 },
});
