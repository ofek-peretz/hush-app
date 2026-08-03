/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * HER BODY — the two numbers the coach cannot infer, on one screen, on two rules.
 *
 * ⛔ FOUNDER, 2026-08-04: *"try to merge as many of the new screens as possible into one screen in
 * onboarding — but sensibly, and with no scrolling."*
 *
 * This was `Bodyweight` and half of `AboutYou`. They belong together: both are facts about the body
 * in front of the coach, both are a value out of a continuum, and both wear the same rule. Splitting
 * them made the intake feel like a form with pages, which is the thing his Spotify note was about.
 *
 * ── ⚠️ "NO SCROLLING" IS A MEASUREMENT, NOT AN INTENTION ────────────────────────────────────────
 * Two rules cost 2 × (20 legend + 112 wheel) plus one 32 gap = 296px. The body opens at ~195 and the
 * act sits at 775, so there is ~565 to spend. It fits with room to spare — measured in the browser,
 * not estimated. A third rule would NOT fit, which is why experience moved to the next step.
 *
 * ── WHY A WHEEL AND NOT A KEYBOARD ──────────────────────────────────────────────────────────────
 * The wheel is this product's measuring rule — the same control she turns to log a set, wearing the
 * same graduation. A number pad would be faster to build and would make the first thing she does in
 * Hush feel like filling in a web form. She is not entering data; she is setting a rule.
 *
 * ⚠️ Each opens on a plausible value rather than at the bottom of its range — she is adjusting, not
 * counting up from nothing — and what she leaves them on IS the answer, so there is no way to reach
 * the next screen having skipped either. That is the guarantee a conversation could not make; the
 * argument for why these are a form at all lives in `domain/coachRequirements`.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button, Legend, WheelPicker } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'AboutYou'>;

/** Where each rule opens — a place to turn from, not a default anybody keeps. */
const WEIGHT_OPENS_ON = { kg: 70, lb: 155 } as const;
const AGE_OPENS_ON = 30;

export function AboutYou({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  const [weight, setWeight] = useState<number>(() => {
    const known = app.profile?.weightKg;
    if (known && known > 0) return units === 'lb' ? Math.round(known * 2.2046226) : known;
    return WEIGHT_OPENS_ON[units];
  });
  const [age, setAge] = useState<number>(app.profile?.age && app.profile.age > 0 ? app.profile.age : AGE_OPENS_ON);

  function onContinue() {
    const kg = units === 'lb' ? +(weight / 2.2046226).toFixed(1) : weight;
    // Carried in the params, exactly as `sex` is — `ConnectHealth` assembles the whole
    // `OnboardingInputs` and there must be ONE place that does.
    navigation.navigate('YourTraining', { sex: route.params.sex, weightKg: kg, age });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 2, total: 5 }}
      legend={t('ob.aboutLegend')}
      title={t('ob.aboutTitle')}
      headGap={28}
      footer={<Button variant="primary" size="lg" block label={t('ob.continue')} onPress={onContinue} />}
    >
      <View style={styles.rows}>
        <View style={styles.col}>
          <Legend>{t('ob.weightLegend')}</Legend>
          <WheelPicker
            value={weight}
            onChange={setWeight}
            step={units === 'kg' ? 0.5 : 1}
            min={units === 'kg' ? 30 : 66}
            max={units === 'kg' ? 250 : 550}
            size="lg"
            ends="chevron"
            label={t('ob.weightLegend')}
            unit={units}
          />
        </View>
        <View style={styles.col}>
          <Legend>{t('ob.age')}</Legend>
          <WheelPicker
            value={age}
            onChange={setAge}
            step={1}
            min={14}
            max={95}
            size="lg"
            ends="chevron"
            label={t('ob.age')}
          />
        </View>
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 32 },
  col: { gap: 12 },
});
