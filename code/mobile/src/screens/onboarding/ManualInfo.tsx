/**
 * Body data (§4.3) — re-skinned to the design onboarding step: legend → title →
 * sub → four labelled controls (Sex via SegmentedControl, Age / Height / Weight
 * via Steppers). Calibrates starting loads. Continue → Goal, carrying the draft.
 * Progress 3 / 6.
 */
import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Legend, SegmentedControl, Stepper, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { health } from '@/platform/health';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'ManualInfo'>;

export function ManualInfo({ navigation, route }: Props) {
  const { t } = useCopy();
  const healthConnected = route.params?.healthConnected ?? false;
  const [sex, setSex] = useState<'female' | 'male'>('male');
  const [age, setAge] = useState(28);
  const [height, setHeight] = useState(178);
  const [weight, setWeight] = useState(82);

  useEffect(() => {
    if (!healthConnected) return;
    let cancelled = false;
    void health.latestBodyweightKg().then((kg) => {
      if (!cancelled && kg && kg > 0) setWeight(Math.round(kg));
    });
    return () => {
      cancelled = true;
    };
  }, [healthConnected]);

  function onContinue() {
    navigation.navigate('Goal', {
      profile: { healthConnected, age, sex, heightCm: height, weightKg: weight },
    });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 3, total: 6 }}
      legend={t('ob.bodyLegend')}
      title={t('ob.bodyTitle')}
      sub={t('ob.bodySub')}
      footer={<Button variant="primary" size="lg" block label={t('ob.continue')} onPress={onContinue} />}
    >
      <View style={styles.rows}>
        <View style={styles.row}>
          <Legend>{t('ob.sex')}</Legend>
          <SegmentedControl
            options={[{ value: 'female', label: t('ob.female') }, { value: 'male', label: t('ob.male') }]}
            value={sex}
            onChange={(v) => setSex(v as 'female' | 'male')}
          />
        </View>
        <View style={styles.row}>
          <Legend>{t('ob.age')}</Legend>
          <Stepper value={age} onChange={setAge} min={14} max={90} />
        </View>
        <View style={styles.row}>
          <Legend>{t('ob.height')}</Legend>
          <Stepper value={height} onChange={setHeight} min={120} max={220} unit="cm" />
        </View>
        <View style={styles.row}>
          <Legend>{t('ob.weight')}</Legend>
          <Stepper value={weight} onChange={setWeight} step={0.5} min={35} max={250} unit="kg" />
        </View>
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 18 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
