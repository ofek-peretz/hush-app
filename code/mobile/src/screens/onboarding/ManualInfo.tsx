/**
 * About you + Your week (v7 1.4) — the merged body-and-schedule step, 3/4.
 *
 * v7 folds the old Body-data and Training steps into ONE screen: two engraved rulers under a
 * single serif title. WEIGHT · KG seeds the cold-start load (the first working set overwrites it),
 * and SESSIONS A WEEK shapes the split. Continue → Body map, carrying the assembled inputs.
 *
 * WHAT IS NOT ASKED, and why:
 *  - AGE / HEIGHT (founder 2026-07-23, Rev 14; re-affirmed 2026-07-24): neither was ever an engine
 *    input — the cold start reads SEX × BODYWEIGHT only (register B-1), and Loop 1 corrects from the
 *    first set. The v7 mock draws them as rulers, but the founder kept them OFF this screen: only
 *    weight and sessions-a-week are asked here.
 *  - SEX (founder 2026-07-12): moved to the NAME step, early enough for the copy layer to conjugate
 *    Hebrew for the right person. It still travels in the draft (route param) so the starting-load
 *    model is unchanged.
 *  - EXPERIENCE (Rev 7): deleted — the approach set measures her, so a self-report never touches a
 *    load.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Legend, WheelPicker, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { getGender } from '@/i18n/gender';
import { track } from '@/platform/telemetry';
import { color, font, textScale } from '@/design/tokens';
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
  const [days, setDays] = useState(4);

  function onContinue() {
    void track('days_per_week_selected', { days });
    navigation.navigate('BodyMap', {
      inputs: {
        // Hush is hypertrophy-first for everyone — goal is not asked. Experience is deleted (Rev 7).
        goal: 'build_muscle',
        daysPerWeek: days,
        units: 'kg',
        healthConnected,
        sex,
        weightKg: weight,
      },
    });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 3, total: 4 }}
      // v7 1.4: "About you" is the serif TITLE — no mono legend above it. The sub carries the
      // "seeds, then overwritten" law for both rulers below.
      title={t('ob.bodyTitle')}
      sub={t('ob.bodySub')}
      // 1.4 opens closer to the rail (30) and takes a slightly smaller headline (42), because the
      // body below it is two full-width rulers rather than a single field.
      bodyTop={30}
      titleSize={42}
      headGap={22}
      // The navigator's back-swipe is OFF for this step (Root) — two horizontal wheels cannot share
      // a screen with a horizontal back gesture. The way back by hand lives in the footer.
      onSwipeBack={() => navigation.goBack()}
      footer={<Button variant="primary" size="lg" block label={t('ob.continue')} onPress={onContinue} />}
    >
      <View style={styles.sections}>
        {/* WEIGHT · KG — the cold-start seed. The unit lives in the legend now (no chip): the
            scale keeps its full width, and "82.5" under "WEIGHT · KG" needs nothing else. */}
        <View style={styles.section}>
          <Legend>{t('ob.weightWith', { unit: 'kg' })}</Legend>
          <WheelPicker value={weight} onChange={setWeight} step={0.5} min={35} max={250} label={t('ob.weightWith', { unit: 'kg' })} style={styles.wheel} />
        </View>

        {/* SESSIONS A WEEK — the split's shape. The legend and its one-line helper sit on a
            baseline together, the way the v7 mock draws them. */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Legend>{t('ob.daysLabel')}</Legend>
            <Text style={styles.helper}>{t('ob.trainSub')}</Text>
          </View>
          <WheelPicker value={days} onChange={setDays} min={2} max={6} label={t('ob.daysLabel')} style={styles.wheel} />
        </View>
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  /* ════ EACH RULER GETS ITS OWN SPACE, AND THE STEP FILLS (founder 2026-07-28) ════
     Two rulers 22 apart, each label 9 above its scale, on a step with nothing else on it — so the
     pair huddled at the top and the screen read as unfinished. They are the ONLY thing this step
     asks for, and they are now sized and spaced like it: the rulers stand apart far enough to be
     two separate questions, the labels breathe over their own scale, and `flex: 1` + `space-evenly`
     hands the leftover height to the gaps instead of leaving it pooled under the last one. */
  sections: { flex: 1, justifyContent: 'space-evenly', paddingVertical: 8 },
  section: { gap: 14 },
  // The legend and its helper share a baseline, pushed to opposite ends.
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  // The sans helper beside the sessions legend — same muted ink as the legend.
  helper: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
  wheel: { alignSelf: 'stretch' },
});
