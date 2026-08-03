/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT SHE WEIGHS — the one number the coach cannot infer, asked once, on a rule.
 *
 * ⛔ FOUNDER, 2026-08-03, after his first real intake on build 40: *"The coach didn't ask for my
 * weight, and as far as I know that's critical for it. Maybe we should put everything the coach has
 * to use into onboarding, and then a chat window at the end for extra requests."*
 *
 * He was right about the fact and right about the shape. `domain/coachRequirements` holds the
 * argument for WHY this is a form and not a question; this screen is the form.
 *
 * ── WHY A WHEEL AND NOT A KEYBOARD ──────────────────────────────────────────────────────────────
 * The wheel is this product's measuring rule — the same control she turns to log a set, wearing the
 * same graduation. A number pad would be faster to build and would make the first thing she does in
 * Hush feel like filling in a web form. She is not entering data; she is setting a rule, and the
 * control should say so before any label does.
 *
 * ⚠️ It opens on a plausible weight rather than on zero — she is adjusting, not counting up from
 * nothing — and the value she leaves it on IS the answer, so there is no way to arrive at the next
 * screen having skipped it. That is the guarantee a conversation could not make.
 *
 * ── WHERE THE NUMBER GOES ───────────────────────────────────────────────────────────────────────
 * `weightKg` AND `startWeightKg`. The second is the baseline every later reading is compared to, and
 * a profile that acquires it in week six has no week one to compare with.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button, WheelPicker } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'Bodyweight'>;

/**
 * Where the wheel opens.
 *
 * Not a default she keeps — a place to start turning from. Chosen per unit so the number under her
 * thumb is already the right order of magnitude, which is the difference between adjusting and
 * scrolling.
 */
const OPENS_ON = { kg: 70, lb: 155 } as const;

export function Bodyweight({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  const [value, setValue] = useState<number>(() => {
    const known = app.profile?.weightKg;
    if (known && known > 0) return units === 'lb' ? Math.round(known * 2.2046226) : known;
    return OPENS_ON[units];
  });

  function onContinue() {
    const kg = units === 'lb' ? +(value / 2.2046226).toFixed(1) : value;
    // Carried in the params, exactly as `sex` is — `ConnectHealth` assembles the whole
    // `OnboardingInputs` and there must be ONE place that does.
    navigation.navigate('ConnectHealth', { sex: route.params.sex, weightKg: kg });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 2, total: 4 }}
      legend={t('ob.weightLegend')}
      title={t('ob.weightTitle')}
      voice={t('ob.weightSub')}
      headGap={32}
      footer={<Button variant="primary" size="lg" block label={t('ob.continue')} onPress={onContinue} />}
    >
      <View style={styles.rule}>
        <WheelPicker
          value={value}
          onChange={setValue}
          step={units === 'kg' ? 0.5 : 1}
          min={units === 'kg' ? 30 : 66}
          max={units === 'kg' ? 250 : 550}
          size="lg"
          ends="chevron"
          label={t('ob.weightLegend')}
          unit={units}
        />
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  // The rule sits in the body's own rhythm — nothing else is on this step, which is the point.
  rule: { marginTop: 8 },
});
