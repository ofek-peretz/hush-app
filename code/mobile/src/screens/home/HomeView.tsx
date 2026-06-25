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
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { HushMark } from '@/components/HushMark';
import { Legend, Display, BodyL, Body, Button, ProgressMeter, ListRow, IconButton } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
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
  greetingPart: 'morning' | 'afternoon' | 'evening';
  name: string | null;
  trainedThisWeek: number;
  startError: boolean;
  dateLabel: string;
  weekNumber: number; // training-week counter ("Week N"), from memberSince
  exerciseCount?: number; // next workout's exercise count (meta line)
  loadsUp?: number; // how many lifts step up this session (meta line)
  restDaysTaken?: number; // recovery stat
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
          <View style={styles.legendTop}>
            {!props.resting ? (
              <Text style={styles.greeting}>
                {props.name ? t('home.readyWhenYouAre', { name: props.name.split(' ')[0] }) : t('home.readyAnon')}
              </Text>
            ) : null}
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

              {props.exerciseCount ? (
                <View style={styles.metaRow}>
                  <Icon name="layers" size={15} color={color.textMuted} strokeWidth={2} />
                  <Text style={styles.metaMono}>{t('home.exerciseCount', { n: props.exerciseCount })}</Text>
                  {props.loadsUp ? (
                    <>
                      <Text style={styles.metaSep}>·</Text>
                      <Text style={styles.metaText}>{t('home.loadsUp', { n: props.loadsUp })}</Text>
                    </>
                  ) : null}
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

              <View style={styles.loadsSetRow}>
                <Icon name="checkCircle" size={15} color={color.up} strokeWidth={2} />
                <Text style={styles.loadsSetText}>{t('home.loadsSet')}</Text>
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
  brand: { flexDirection: 'row', alignItems: 'flex-end', gap: 9 },
  wordmark: { fontFamily: font.sansSemibold, fontSize: 21, letterSpacing: -0.6, color: color.textPrimary },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: signal[0], marginLeft: 2, marginBottom: 5 },

  scroll: { paddingHorizontal: space.gutter, paddingBottom: 32 },
  legendTop: { paddingTop: 24 },
  greeting: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, marginBottom: 10 },
  block: { paddingTop: 14 },
  restCopy: { marginTop: 14, maxWidth: 320 },

  loadsSetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22 },
  loadsSetText: { flex: 1, fontFamily: font.sans, fontSize: textScale.sm, color: color.textSecondary },

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
  metaText: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted },
  metaSep: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textTertiary },

  meterWrap: { marginTop: 28 },
  error: { marginTop: 16 },
  cta: { marginTop: 24, gap: 10 },

  hub: { marginTop: 34 },
  hubLegend: { marginBottom: 4 },
});
