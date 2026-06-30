/**
 * Days per week (§4.5) — frequency 2–6 (default 4), re-skinned to the design
 * onboarding step: legend → title → sub → a large mono number + "sessions / week"
 * + a horizontal WheelPicker. Continue → Program Created (assembles the full
 * inputs). Progress 5 / 5.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Legend, WheelPicker, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { track } from '@/platform/telemetry';
import { color, font, textScale, tracking, trackingPx } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'DaysPerWeek'>;

export function DaysPerWeek({ navigation, route }: Props) {
  const { t } = useCopy();
  const { profile, experience } = route.params;
  const [days, setDays] = useState(4);

  function onContinue() {
    void track('days_per_week_selected', { days });
    navigation.navigate('ProgramCreated', {
      inputs: {
        // Hush is hypertrophy-first for everyone — goal is no longer asked in onboarding.
        goal: 'build_muscle',
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
      progress={{ index: 5, total: 5 }}
      legend={t('ob.daysLegend')}
      title={t('ob.daysTitle')}
      sub={t('ob.daysSub')}
      footer={<Button variant="primary" size="lg" block label={t('ob.daysBuild')} onPress={onContinue} />}
    >
      <View style={styles.center}>
        <Text style={styles.number}>{days}</Text>
        <Legend>{t('ob.daysUnit')}</Legend>
        <View style={styles.stepper}>
          <WheelPicker value={days} onChange={setDays} min={2} max={6} size="lg" unit="/wk" label={t('ob.daysUnit')} style={styles.wheel} />
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
  stepper: { marginTop: 16, alignSelf: 'stretch' },
  wheel: { alignSelf: 'stretch' },
});
