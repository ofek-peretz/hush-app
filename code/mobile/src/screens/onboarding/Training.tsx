/**
 * Training (§4.4/§4.5, merged 2026-07-10) — the two training inputs on ONE
 * screen, whole in the viewport (onboarding never scrolls): experience
 * (OptStack — the single biggest input to the cold-start starting weight) and
 * sessions per week (WheelPicker 2–6, default 4 — the split is designed to fit
 * it exactly). One screen, one story: how you train. Continue → Program
 * Created (assembles the full inputs). Progress 4 / 4.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { OptStack } from '@/components/onboarding/OptStack';
import { WheelPicker, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { track } from '@/platform/telemetry';
import { color, font, textScale } from '@/design/tokens';
import type { Experience } from '@/data/local/models';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'Training'>;

export function Training({ navigation, route }: Props) {
  const { t } = useCopy();
  const { profile } = route.params;
  const [experience, setExperience] = useState<Experience>('intermediate');
  const [days, setDays] = useState(4);

  function onContinue() {
    void track('experience_selected', { experience });
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
      progress={{ index: 4, total: 4 }}
      legend={t('ob.trainLegend')}
      title={t('ob.trainTitle')}
      sub={t('ob.trainSub')}
      footer={<Button variant="primary" size="lg" block label={t('ob.daysBuild')} onPress={onContinue} />}
    >
      <View style={styles.sections}>
        <View style={styles.section}>
          {/* The section labels are QUESTIONS now (founder 2026-07-12) — "Experience" and
              "Sessions per week" are the names of the fields, not what we are asking. A
              question is asked in sentence case, so these are not uppercase Legends. */}
          <Text style={styles.question}>{t('ob.expSection')}</Text>
          <OptStack
            value={experience}
            onChange={(v) => setExperience(v as Experience)}
            options={[
              { value: 'beginner', label: t('ob.expBeginner'), desc: t('ob.expBeginnerDesc') },
              { value: 'intermediate', label: t('ob.expIntermediate'), desc: t('ob.expIntermediateDesc') },
              { value: 'advanced', label: t('ob.expAdvanced'), desc: t('ob.expAdvancedDesc') },
            ]}
          />
        </View>
        <View style={styles.section}>
          <Text style={styles.question}>{t('ob.daysSection')}</Text>
          {/* No "/wk" chip: the question above already says "a week", and the rule reads
              cleaner without a unit hanging off its end (founder 2026-07-12). */}
          <WheelPicker
            value={days}
            onChange={setDays}
            min={2}
            max={6}
            size="lg"
            label={t('ob.daysUnit')}
            style={styles.wheel}
          />
        </View>
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  sections: { gap: 24 },
  section: { gap: 10 },
  question: { fontFamily: font.sansSemibold, fontSize: textScale.md, lineHeight: 22, color: color.textPrimary, textAlign: 'left' },
  wheel: { alignSelf: 'stretch' },
});
