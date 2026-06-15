/**
 * 1.4 Days per Week. Numeric frequency via wheel (1–6, default 4). Continue
 * routes by the Health flag: granted -> Home; denied -> About You (spec §1.4).
 */
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Wheel } from '@/components/Wheel';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { color, layout } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'DaysPerWeek'>;

const DAYS = [1, 2, 3, 4, 5, 6];

export function DaysPerWeek({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const { healthConnected, goal } = route.params;
  const [days, setDays] = useState(4); // default 4

  async function onContinue() {
    if (healthConnected) {
      // Health available => skip About You; finalize with defaults (§1.4, §10.16).
      await app.completeOnboarding({ goal, daysPerWeek: days, units: 'kg', healthConnected: true });
    } else {
      navigation.navigate('AboutYou', { healthConnected, goal, daysPerWeek: days });
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Wheel values={DAYS} selected={days} onChange={setDays} />
      </View>
      <View style={styles.actions}>
        <PrimaryButton label={t('daysPerWeek.continue')} onPress={onContinue} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center' },
  actions: { paddingHorizontal: layout.screenMargin, paddingBottom: 32 },
});
