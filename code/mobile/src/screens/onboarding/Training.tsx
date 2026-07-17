/**
 * Your schedule (§4.4/§4.5) — the training input. Rev 7 (Part 9 §A): **experience is deleted** (the
 * approach set measures her, so a self-report never touches a load), and reps + minutes are NOT asked
 * (defaults, edited later — per-muscle T in the body map, minutes in Settings). What remains is
 * sessions per week — one scroller. Continue → Body map.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { WheelPicker, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { track } from '@/platform/telemetry';
import { color, font, textScale } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'Training'>;

export function Training({ navigation, route }: Props) {
  const { t } = useCopy();
  const { profile } = route.params;
  const [days, setDays] = useState(4);

  function onContinue() {
    void track('days_per_week_selected', { days });
    navigation.navigate('BodyMap', {
      inputs: {
        // Hush is hypertrophy-first for everyone — goal is not asked. Experience is deleted (Rev 7).
        goal: 'build_muscle',
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
      progress={{ index: 4, total: 5 }}
      centerContent
      legend={t('ob.trainLegend')}
      title={t('ob.trainTitle')}
      sub={t('ob.trainSub')}
      footer={<Button variant="primary" size="lg" block label={t('ob.continue')} onPress={onContinue} />}
    >
      <View style={styles.section}>
        {/* The section label is a QUESTION (founder 2026-07-12), sentence case — not an uppercase Legend. */}
        <Text style={styles.question}>{t('ob.daysSection')}</Text>
        {/* No "/wk" chip: the question above already says "a week". */}
        <WheelPicker value={days} onChange={setDays} min={2} max={6} size="lg" label={t('ob.daysUnit')} style={styles.wheel} />
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  question: { fontFamily: font.sansSemibold, fontSize: textScale.md, lineHeight: 22, color: color.textPrimary, textAlign: 'left' },
  wheel: { alignSelf: 'stretch' },
});
