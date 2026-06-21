/**
 * Days per week (§4.5) — frequency 2–6 (default 4), re-skinned to the design
 * onboarding step: legend → title → sub → a large mono number + "sessions / week"
 * + a Stepper. Continue → Program Created (assembles the full inputs). Progress
 * 6 / 6.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Legend, Stepper, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { color, font, textScale, tracking, trackingPx } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'DaysPerWeek'>;

export function DaysPerWeek({ navigation, route }: Props) {
  const { t } = useCopy();
  const { profile, goal, experience } = route.params;
  const [days, setDays] = useState(4);

  function onContinue() {
    navigation.navigate('ProgramCreated', {
      inputs: {
        goal,
        experience,
        daysPerWeek: days,
        units: 'kg',
        healthConnected: profile.healthConnected,
        age: profile.age,
        sex: profile.sex,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
      },
    });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 6, total: 6 }}
      legend={t('ob.daysLegend')}
      title={t('ob.daysTitle')}
      sub={t('ob.daysSub')}
      footer={<Button variant="primary" size="lg" block label={t('ob.daysBuild')} onPress={onContinue} />}
    >
      <View style={styles.center}>
        <Text style={styles.number}>{days}</Text>
        <Legend>{t('ob.daysUnit')}</Legend>
        <View style={styles.stepper}>
          <Stepper value={days} onChange={setDays} min={2} max={6} size="lg" unit="/wk" />
        </View>
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  number: {
    fontFamily: font.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: textScale['5xl'],
    letterSpacing: trackingPx(textScale['5xl'], tracking.display),
    color: color.textPrimary,
    lineHeight: textScale['5xl'],
  },
  stepper: { marginTop: 16 },
});
