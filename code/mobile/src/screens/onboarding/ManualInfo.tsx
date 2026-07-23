/**
 * Body data (§4.3) — title → sub → ONE labelled WheelPicker (Weight — swipe straight to your
 * value). Seeds the cold-start load; the first working set overwrites it. Continue → Training,
 * carrying the draft.
 *
 * AGE AND HEIGHT ARE NO LONGER ASKED (founder 2026-07-23, Rev 14). Neither was ever an engine
 * input — the cold start reads SEX × BODYWEIGHT only (register B-1), and Loop 1 corrects from the
 * first set. Two wheels that decided nothing are two wheels that shouldn't be asked. Bodyweight
 * stays because it genuinely seeds the opening load.
 *
 * SEX IS NO LONGER ASKED HERE EITHER (founder 2026-07-12). It was a control on the most crowded
 * step and it drowned; it now lives on the NAME step, early enough for the copy layer to conjugate
 * Hebrew for the right person. It still travels in this draft (route param) so the profile and the
 * starting-load model are unchanged.
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
  // Weight is entered by hand — Health is now read for cardio metrics, not bodyweight.
  const [weight, setWeight] = useState(82);

  function onContinue() {
    navigation.navigate('Training', {
      profile: { healthConnected, sex, weightKg: weight },
    });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 3, total: 5 }}
      // v7 1.4: "About you" is the serif TITLE now — no mono legend above it (the image leads
      // with the headline, not a label). The sub carries the "seeds, then overwritten" law.
      title={t('ob.bodyTitle')}
      sub={t('ob.bodySub')}
      // The navigator's back-swipe is OFF for this step (Root) — three horizontal wheels cannot
      // share a screen with a horizontal back gesture. The way back by hand lives in the footer.
      onSwipeBack={() => navigation.goBack()}
      footer={<Button variant="primary" size="lg" block label={t('ob.continue')} onPress={onContinue} />}
    >
      <View style={styles.rows}>
        {/* No unit cell (founder 2026-07-12): "82.5" under a legend that says Weight is
            kilograms. The chip was a label for a number that already labels itself, and it
            cost the scale its full width. */}
        <View style={styles.col}>
          <Legend>{t('ob.weight')}</Legend>
          <WheelPicker value={weight} onChange={setWeight} step={0.5} min={35} max={250} label={t('ob.weight')} style={styles.wheel} />
        </View>
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  // Down to a single wheel (Rev 14): sex moved to the Name step, and age/height were struck for
  // deciding nothing. One clean measure — bodyweight — with all the air on the page it wants.
  rows: { gap: 22 },
  col: { gap: 8 },
  wheel: { alignSelf: 'stretch' },
});
