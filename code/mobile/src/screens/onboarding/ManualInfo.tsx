/**
 * Body data (§4.3) — legend → title → sub → three labelled WheelPickers (Age / Height /
 * Weight — swipe straight to your value). Calibrates starting loads. Continue → Training,
 * carrying the draft.
 *
 * SEX IS NO LONGER ASKED HERE (founder 2026-07-12). It was the fourth control on the most
 * crowded step in the app and it drowned; it now lives on the NAME step, where it is also
 * early enough for the copy layer to conjugate Hebrew for the right person. It still travels
 * in this draft (route param) so the profile and the starting-load model are unchanged.
 */
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Legend, WheelPicker, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { getGender } from '@/i18n/gender';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'ManualInfo'>;

export function ManualInfo({ navigation, route }: Props) {
  const { t } = useCopy();
  const healthConnected = route.params?.healthConnected ?? false;
  // The pick itself is the source of truth, not the params it rode in on. If the route param is
  // ever lost (state restoration, a nav reset, a deep link), falling back to a hardcoded 'male'
  // would write a MAN's starting loads into a woman's profile while the copy around her went on
  // addressing her correctly — a divergence nobody would ever see and the engine would never
  // recover from. The gender store holds what she actually chose on the previous screen.
  const sex = route.params?.sex ?? getGender();
  const [age, setAge] = useState(28);
  const [height, setHeight] = useState(178);
  // Weight is entered by hand — Health is now read for cardio metrics, not bodyweight.
  const [weight, setWeight] = useState(82);

  function onContinue() {
    navigation.navigate('Training', {
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
      // The navigator's back-swipe is OFF for this step (Root) — three horizontal wheels cannot
      // share a screen with a horizontal back gesture. The way back by hand lives in the footer.
      onSwipeBack={() => navigation.goBack()}
      footer={<Button variant="primary" size="lg" block label={t('ob.continue')} onPress={onContinue} />}
    >
      <View style={styles.rows}>
        <View style={styles.col}>
          <Legend>{t('ob.age')}</Legend>
          <WheelPicker value={age} onChange={setAge} min={14} max={90} label={t('ob.age')} style={styles.wheel} />
        </View>
        {/* No unit cells (founder 2026-07-12): "178" under a legend that says Height is a
            height in centimetres, and "82.5" under Weight is kilograms. The chip was a label
            for a number that already labels itself, and it cost the scale its full width. */}
        <View style={styles.col}>
          <Legend>{t('ob.height')}</Legend>
          <WheelPicker value={height} onChange={setHeight} min={120} max={220} label={t('ob.height')} style={styles.wheel} />
        </View>
        <View style={styles.col}>
          <Legend>{t('ob.weight')}</Legend>
          <WheelPicker value={weight} onChange={setWeight} step={0.5} min={35} max={250} label={t('ob.weight')} style={styles.wheel} />
        </View>
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  // Sex moved to the Name step (2026-07-12), which gave this step its air back: three wheels
  // instead of four controls, so the rhythm can breathe again.
  rows: { gap: 22 },
  col: { gap: 8 },
  wheel: { alignSelf: 'stretch' },
});
