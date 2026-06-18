/**
 * 4.25 / 4.26 Portrait — the Portrait TAB root. Branches on calibration state:
 *  - Locked (< 7 sessions): "Still taking shape.", progress dots, "N of 7".
 *  - Unlocked: "WHAT YOUR BODY CAN DO" eyebrow + five relative CapabilityBars +
 *    the model's insight line.
 *
 * Capability fractions + insight come from the FROZEN model (domain/portrait);
 * this screen only renders them. Then·Now (§4.27) surfaces via PortraitRevisit's
 * compare / a resolved forecast receipt.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppTabBar, TAB_BAR_SPACE } from '@/components/AppTabBar';
import { CapabilityBar } from '@/components/CapabilityBar';
import { Eyebrow } from '@/components/Eyebrow';
import { TextAction } from '@/components/TextAction';
import { thenSnapshot } from '@/screens/portrait/PortraitThenNow';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import {
  barFraction,
  capabilityNameKey,
  isStillLearning,
  strongestConfident,
} from '@/domain/portrait';
import { PORTRAIT_DISPLAY_ORDER, capLabel } from '@/screens/portrait/portraitDisplay';
import { CALIBRATION_SESSIONS } from '@/state/machines/athleteMode';
import { track, trackFirst } from '@/platform/telemetry';
import { color, space, heroTitle } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'Portrait'>;

export function Portrait({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const unlocked = app.modeState.portrait === 'PORTRAIT_UNLOCKED';
  const done = app.modeState.completedSessions;

  useEffect(() => {
    void track('portrait_tab_viewed', { unlocked });
    if (unlocked) {
      void app.ensurePortraitSnapshot(); // heal a missed unlock snapshot
      void trackFirst('first_portrait_viewed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.header} accessibilityRole="header">{t('portrait.tab')}</Text>
        {unlocked ? <Unlocked /> : <Locked />}
      </ScrollView>
      <AppTabBar active="portrait" />
    </SafeAreaView>
  );

  function Locked() {
    const total = CALIBRATION_SESSIONS;
    const remaining = Math.max(0, total - done);
    return (
      <View style={styles.locked}>
        <Text style={styles.lockedTitle}>{t('portrait.stillTakingShape')}</Text>
        <Text style={styles.lockedBody}>{t('portrait.lockedBody', { remaining })}</Text>
        <View style={styles.dots}>
          {Array.from({ length: total }).map((_, i) => (
            <View key={i} style={[styles.dot, i < done ? styles.dotFilled : styles.dotEmpty]} />
          ))}
        </View>
        <Text style={styles.count}>{t('portrait.sessionsCount', { done, total })}</Text>
      </View>
    );
  }

  function Unlocked() {
    const snapshot = app.currentSnapshot;
    if (!snapshot) {
      // Unlocked but snapshot not yet captured (offline) — quiet, no fake bars.
      return <Text style={styles.lockedBody}>{t('portrait.lockedBody', { remaining: 0 })}</Text>;
    }
    // Insight names the strongest pattern (§4.26).
    const strongest = strongestConfident(snapshot);
    const insight = strongest
      ? t('portrait.insightStrongest', { pattern: t(capabilityNameKey(strongest)) })
      : null;
    const then = thenSnapshot(app.snapshots, Date.now());
    const comparable = !!then && then.timestamp !== snapshot.timestamp;
    return (
      <View style={styles.unlocked}>
        <Eyebrow label={t('portrait.headline')} size={12} trackingPx={2} />
        {PORTRAIT_DISPLAY_ORDER.map((c) => (
          <CapabilityBar
            key={c}
            label={capLabel(t(capabilityNameKey(c)))}
            fraction={barFraction(snapshot, c)}
            stillLearning={isStillLearning(snapshot, c)}
            stillLearningLabel={t('portrait.stillLearning')}
          />
        ))}
        {insight ? <Text style={styles.insight}>{insight}</Text> : null}
        {comparable ? (
          <View style={styles.compareRow}>
            <TextAction label={t('portrait.compareThreeMonths')} onPress={() => navigation.navigate('PortraitThenNow')} />
          </View>
        ) : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  body: { paddingTop: 22, paddingHorizontal: space.gutter, paddingBottom: TAB_BAR_SPACE },
  header: { ...heroTitle(28), color: color.textPrimary, fontSize: 28, fontWeight: '600' },

  unlocked: { marginTop: 26 },
  insight: { marginTop: 26, fontSize: 14, lineHeight: 14 * 1.5, color: color.textDim },
  compareRow: { marginTop: 28, alignItems: 'flex-start' },

  locked: { marginTop: 80, alignItems: 'center', paddingHorizontal: 12 },
  lockedTitle: { fontSize: 21, fontWeight: '600', color: color.textPrimary, textAlign: 'center', marginBottom: 20 },
  lockedBody: { fontSize: 14, lineHeight: 14 * 1.55, color: color.textSecondary, textAlign: 'center', marginBottom: 20 },
  dots: { flexDirection: 'row', gap: 7, marginBottom: 16 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  dotFilled: { backgroundColor: color.textPrimary },
  dotEmpty: { backgroundColor: color.surface3 },
  count: { fontSize: 12, letterSpacing: 0.3, color: color.textTertiary },
});
