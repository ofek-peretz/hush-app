/**
 * Weekly Update (v4) — the week-rollover summary of what Hush changed and WHY.
 *
 * Each row is one v4 explanation (`explanation.text`, first-person). Tapping a row reveals the
 * "Why" — the engine's {observation → conclusion → action} for that change (the same triple the
 * engine emits per decision). Read-only: v4 changes are athlete-owned data, not gated/vetoable
 * (load/progression is the model's job; selection is the athlete's). Empty week → "all steady".
 *
 * Sourced from the persisted v4 Weekly Update (engine/v4/v4Engine.getWeeklyUpdate). Gated: only
 * meaningful when the v4 engine is enabled; otherwise it shows the steady-state empty view.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { track } from '@/platform/telemetry';
import { getWeeklyUpdate, markWeeklyUpdateSeen, type WeeklyUpdate as WeeklyUpdateData } from '@/engine/v4/v4Engine';
import type { Explanation } from '@/engine/v4/types';
import { color, space, font, textScale, tracking, trackingPx } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'WeeklyUpdate'>;
const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

export function WeeklyUpdate({ navigation }: Props) {
  const { t } = useCopy();
  const [data, setData] = useState<WeeklyUpdateData | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void getWeeklyUpdate().then((u) => {
      if (!active) return;
      setData(u);
      setLoaded(true);
      void track('weekly_update_viewed', { weekIndex: u?.weekIndex ?? null, changes: u?.explanations.length ?? 0 });
      if (u && !u.seen) void markWeeklyUpdateSeen();
    });
    return () => {
      active = false;
    };
  }, []);

  const changes: Explanation[] = data?.explanations ?? [];

  function toggle(e: Explanation): void {
    const next = openId === e.slotId ? null : e.slotId;
    setOpenId(next);
    if (next) void track('weekly_update_why_opened', { pattern: e.pattern });
  }

  return (
    <SafeAreaView style={styles.canvas} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            void track('weekly_update_dismissed', { changes: changes.length });
            navigation.goBack();
          }}
          hitSlop={HIT}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Icon name="chevronLeft" size={28} color={color.textPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>{t('weekly.eyebrow')}</Text>
        <Text style={styles.title}>{t('weekly.title')}</Text>

        {loaded && changes.length === 0 && <Text style={styles.steady}>{t('weekly.steady')}</Text>}

        {changes.map((e) => {
          const open = openId === e.slotId;
          return (
            <Pressable key={e.slotId} style={styles.card} onPress={() => toggle(e)} accessibilityRole="button">
              <View style={styles.rowTop}>
                <Text style={styles.changeText}>{e.text}</Text>
                <Icon name={open ? 'chevronUp' : 'chevronDown'} size={20} color={color.textMuted} />
              </View>
              {open && (
                <View style={styles.why}>
                  <WhyLine label={t('weekly.observation')} value={e.observation} />
                  <WhyLine label={t('weekly.conclusion')} value={e.conclusion} />
                  <WhyLine label={t('weekly.action')} value={e.action} />
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function WhyLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.whyLine}>
      <Text style={styles.whyLabel}>{label}</Text>
      <Text style={styles.whyValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: color.bgBase },
  header: { paddingHorizontal: space.gutter, paddingTop: space[2], paddingBottom: space[1] },
  scroll: { paddingHorizontal: space.gutter, paddingBottom: space[10] },
  eyebrow: {
    color: color.textTertiary,
    fontFamily: font.mono,
    fontSize: textScale.xs,
    letterSpacing: trackingPx(textScale.xs, tracking.wide),
    textTransform: 'uppercase',
    marginBottom: space[1],
  },
  title: { color: color.textPrimary, fontFamily: font.sansSemibold, fontSize: textScale['2xl'], marginBottom: space[5] },
  steady: { color: color.textSecondary, fontFamily: font.sans, fontSize: textScale.md, marginTop: space[4] },
  card: { backgroundColor: color.bgSurface, borderRadius: 16, padding: space[5], marginBottom: space[3] },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[4] },
  changeText: { flex: 1, color: color.textPrimary, fontFamily: font.sans, fontSize: textScale.md, lineHeight: 24 },
  why: { marginTop: space[4], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border, paddingTop: space[4], gap: space[2] },
  whyLine: { gap: 2 },
  whyLabel: {
    color: color.textTertiary,
    fontFamily: font.mono,
    fontSize: textScale.xs,
    letterSpacing: trackingPx(textScale.xs, tracking.wide),
    textTransform: 'uppercase',
  },
  whyValue: { color: color.textPrimary, fontFamily: font.sans, fontSize: textScale.base, lineHeight: 22 },
});
