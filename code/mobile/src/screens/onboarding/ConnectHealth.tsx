/**
 * 4.2 Connect Health — offer HealthKit; declining is free (sets the
 * override-not-permission tone). Continue requests HealthKit: granted → prefill
 * and skip Manual Info (→ Goal); denied → Manual Info. Skip → Manual Info.
 *
 * Health is a deferred native surface (stubbed; requestPermission()=false in v1),
 * so the Manual Info path is the one exercised today.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextAction } from '@/components/TextAction';
import { useCopy } from '@/i18n/useCopy';
import { color, space, heroTitle } from '@/design/tokens';
import { health } from '@/platform/health';
import { recordPermissionOutcome } from '@/platform/health/healthIngestion';
import { track } from '@/platform/telemetry';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'ConnectHealth'>;

export function ConnectHealth({ navigation }: Props) {
  const { t } = useCopy();

  async function onContinue() {
    const granted = await health.requestPermission();
    recordPermissionOutcome(granted, (type, data) => void track(type, data));
    if (granted) {
      // HealthKit prefills the profile → skip Manual Info (§4.2).
      navigation.navigate('Goal', { profile: { healthConnected: true } });
    } else {
      navigation.navigate('ManualInfo');
    }
  }

  function onSkip() {
    void track('health_skipped', {});
    navigation.navigate('ManualInfo');
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Text style={styles.title}>{t('connectHealth.title')}</Text>
        <Text style={styles.copy}>{t('connectHealth.body')}</Text>
        <Text style={styles.optional}>{t('connectHealth.optional')}</Text>
      </View>
      <View style={styles.actions}>
        <PrimaryButton variant="compact" label={t('connectHealth.continue')} onPress={onContinue} />
        <View style={styles.gap} />
        <TextAction label={t('connectHealth.skip')} onPress={onSkip} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.gutter },
  title: { ...heroTitle(28), color: color.textPrimary, fontSize: 28, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
  copy: { fontSize: 15, lineHeight: 15 * 1.6, color: color.textPrimary, textAlign: 'center' },
  optional: { marginTop: 16, fontSize: 13, color: color.textSecondary, textAlign: 'center' },
  actions: { paddingHorizontal: space.gutter, paddingBottom: 26 },
  gap: { height: 8 },
});
