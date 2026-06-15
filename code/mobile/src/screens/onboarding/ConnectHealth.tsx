/**
 * 1.2 Connect Health. One active-voice sentence; proceed regardless of answer.
 * Denial is NOT a failure — it routes through About You later (spec §1.2, §7.11).
 * Health is a deferred native surface (stubbed); requestPermission()=false in v1
 * so the About You path is exercised.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useCopy } from '@/i18n/useCopy';
import { color, layout, type as typo } from '@/design/tokens';
import { health } from '@/platform/health';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'ConnectHealth'>;

export function ConnectHealth({ navigation }: Props) {
  const { t } = useCopy();

  async function onContinue() {
    // Denial is NOT a failure — routes through About You (§7.11). Always advances.
    const granted = await health.requestPermission();
    navigation.navigate('Goal', { healthConnected: granted });
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Text style={styles.sentence}>{t('connectHealth.sentence')}</Text>
      </View>
      <View style={styles.actions}>
        <PrimaryButton label={t('connectHealth.continue')} onPress={onContinue} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: layout.screenMargin },
  sentence: { color: color.textPrimary, fontSize: typo.titleL.size, fontWeight: typo.titleL.weight, lineHeight: typo.titleL.lineHeight },
  actions: { paddingHorizontal: layout.screenMargin, paddingBottom: 32 },
});
