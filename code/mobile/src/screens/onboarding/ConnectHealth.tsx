/**
 * Connect Health (§4.2) — offer HealthKit, re-skinned to the design onboarding
 * step: legend → title → sub → an Apple Health Card → Connect / Skip for now.
 * Continue requests HealthKit and carries the outcome to Body data (ManualInfo).
 * Progress 2 / 6.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Card, Button } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { health } from '@/platform/health';
import { recordPermissionOutcome } from '@/platform/health/healthIngestion';
import { track } from '@/platform/telemetry';
import { color, font, textScale } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'ConnectHealth'>;

export function ConnectHealth({ navigation }: Props) {
  const { t } = useCopy();

  async function onContinue() {
    const granted = await health.requestPermission();
    recordPermissionOutcome(granted, (type, data) => void track(type, data));
    navigation.navigate('ManualInfo', { healthConnected: granted });
  }
  function onSkip() {
    void track('health_skipped', {});
    navigation.navigate('ManualInfo', { healthConnected: false });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 2, total: 5 }}
      legend={t('ob.healthLegend')}
      title={t('ob.healthTitle')}
      sub={t('ob.healthSub')}
      footer={
        <>
          <Button variant="primary" size="lg" block label={t('ob.healthConnect')} onPress={onContinue} />
          <Button variant="quiet" block label={t('ob.healthSkip')} onPress={onSkip} />
        </>
      }
    >
      <Card pad="md">
        <View style={styles.row}>
          <Icon name="heart" size={22} color={color.textSecondary} strokeWidth={2} />
          <View style={styles.info}>
            <Text style={styles.title}>{t('ob.healthCardTitle')}</Text>
            <Text style={styles.sub}>{t('ob.healthCardSub')}</Text>
          </View>
          <Icon name="chevronRight" size={18} color={color.textTertiary} strokeWidth={2} />
        </View>
      </Card>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  info: { flex: 1 },
  title: { fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textPrimary },
  sub: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, marginTop: 2 },
});
