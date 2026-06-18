/**
 * 4.27 Portrait · Then · Now — a quarterly modal: the same five capability bars
 * with a ghost "then" bar behind each "now" bar, a Then/Now legend, the model's
 * biggest-gain insight, and "Got it" to dismiss. Not a tab.
 *
 * "Then" is the snapshot from ~3 months ago (falls back to the week-one baseline);
 * fractions + the insight come from the FROZEN model (domain/portrait).
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '@/components/PrimaryButton';
import { CapabilityBar } from '@/components/CapabilityBar';
import { Eyebrow } from '@/components/Eyebrow';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { barFraction, capabilityNameKey, compareProof, isStillLearning } from '@/domain/portrait';
import { PORTRAIT_DISPLAY_ORDER, capLabel } from '@/screens/portrait/portraitDisplay';
import { track } from '@/platform/telemetry';
import { color, space, heroTitle } from '@/design/tokens';
import type { PortraitSnapshot } from '@/data/local/models';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'PortraitThenNow'>;

const QUARTER_MS = 84 * 24 * 60 * 60 * 1000; // ~3 months

/** The "then" snapshot: latest one at least ~3 months old, else the baseline. */
export function thenSnapshot(snapshots: PortraitSnapshot[], nowMs: number): PortraitSnapshot | null {
  const older = snapshots.filter((s) => nowMs - Date.parse(s.timestamp) >= QUARTER_MS);
  if (older.length > 0) return older[older.length - 1];
  return snapshots.length > 0 ? snapshots[0] : null;
}

export function PortraitThenNow({ navigation }: Props) {
  const { t, line } = useCopy();
  const app = useApp();
  const now = app.currentSnapshot;
  const then = thenSnapshot(app.snapshots, Date.now());

  useEffect(() => {
    void track('portrait_then_now_viewed', {});
  }, []);

  if (!now || !then || then.timestamp === now.timestamp) {
    // Nothing to compare — dismiss cleanly rather than show an empty comparison.
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.actions}>
          <PrimaryButton variant="compact" label={t('portrait.gotIt')} onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  const insight = line(compareProof(then, now));

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        <Eyebrow label={t('portrait.threeMonths')} size={12} trackingPx={2} />
        <View style={styles.legend}>
          <Legend swatch="#3A3A3C" label={t('portrait.then')} />
          <Legend swatch={color.textPrimary} label={t('portrait.now')} />
        </View>

        {PORTRAIT_DISPLAY_ORDER.map((c) => (
          <CapabilityBar
            key={c}
            label={capLabel(t(capabilityNameKey(c)))}
            fraction={barFraction(now, c)}
            ghostFraction={barFraction(then, c)}
            stillLearning={isStillLearning(now, c)}
            stillLearningLabel={t('portrait.stillLearning')}
          />
        ))}

        {insight ? <Text style={styles.insight}>{insight}</Text> : null}
      </ScrollView>
      <View style={styles.actions}>
        <PrimaryButton variant="compact" label={t('portrait.gotIt')} onPress={() => navigation.goBack()} />
      </View>
    </SafeAreaView>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: swatch }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, justifyContent: 'space-between' },
  body: { paddingTop: 32, paddingHorizontal: space.gutter, paddingBottom: 24 },
  legend: { flexDirection: 'row', gap: 18, marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legendLabel: { fontSize: 11, color: color.textSecondary },
  insight: { marginTop: 28, fontSize: 14, lineHeight: 14 * 1.5, color: color.textDim },
  actions: { paddingHorizontal: space.gutter, paddingBottom: 40 },
});
