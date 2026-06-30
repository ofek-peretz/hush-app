/**
 * Body data (§4.3) — re-skinned to the design onboarding step: legend → title →
 * sub → four labelled controls (Sex via SegmentedControl, Age / Height / Weight
 * via horizontal WheelPickers — swipe straight to your value). Calibrates starting
 * loads. Continue → Experience, carrying the draft. Progress 3 / 5.
 */
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Legend, SegmentedControl, WheelPicker, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'ManualInfo'>;

export function ManualInfo({ navigation, route }: Props) {
  const { t } = useCopy();
  const healthConnected = route.params?.healthConnected ?? false;
  const [sex, setSex] = useState<'female' | 'male'>('male');
  const [age, setAge] = useState(28);
  const [height, setHeight] = useState(178);
  // Weight is entered by hand — Health is now read for cardio metrics, not bodyweight.
  const [weight, setWeight] = useState(82);

  function onContinue() {
    navigation.navigate('Experience', {
      profile: { healthConnected, age, sex, heightCm: height, weightKg: weight },
    });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 3, total: 5 }}
      legend={t('ob.bodyLegend')}
      title={t('ob.bodyTitle')}
      sub={t('ob.bodySub')}
      footer={<Button variant="primary" size="lg" block label={t('ob.continue')} onPress={onContinue} />}
    >
      <View style={styles.rows}>
        <View style={styles.col}>
          <Legend>{t('ob.sex')}</Legend>
          <SegmentedControl
            options={[{ value: 'female', label: t('ob.female') }, { value: 'male', label: t('ob.male') }]}
            value={sex}
            onChange={(v) => setSex(v as 'female' | 'male')}
          />
        </View>
        <View style={styles.col}>
          <Legend>{t('ob.age')}</Legend>
          <WheelPicker value={age} onChange={setAge} min={14} max={90} label={t('ob.age')} style={styles.wheel} />
        </View>
        <View style={styles.col}>
          <Legend>{t('ob.height')}</Legend>
          <WheelPicker value={height} onChange={setHeight} min={120} max={220} unit="cm" label={t('ob.height')} style={styles.wheel} />
        </View>
        <View style={styles.col}>
          <Legend>{t('ob.weight')}</Legend>
          <WheelPicker value={weight} onChange={setWeight} step={0.5} min={35} max={250} unit="kg" label={t('ob.weight')} style={styles.wheel} />
        </View>
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 18 },
  col: { gap: 8 },
  wheel: { alignSelf: 'stretch' },
});
