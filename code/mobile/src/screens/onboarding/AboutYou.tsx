/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * HOW OLD SHE IS, AND HOW LONG SHE HAS BEEN DOING THIS.
 *
 * ⛔ FOUNDER, 2026-08-03, listing what the coach must be given rather than left to ask for:
 * *"age, weight, sex, experience, training frequency, goal, injuries/limits, session length."*
 *
 * The two on this step are the two that decide WEEK ONE. Everything after it is measured — her reps
 * move the load and the coach reads the record — but the first prescription has no history behind
 * it, and these are what make it an educated guess instead of a coin toss.
 *
 * ── WHY BOTH ON ONE SCREEN ──────────────────────────────────────────────────────────────────────
 * They answer the same question — *who am I writing this for?* — and splitting them would make the
 * intake feel like a form with pages. `domain/coachRequirements` holds the argument for why these
 * are a form at all; the short version is that a conversation cannot guarantee coverage.
 *
 * ── ⚠️ WHAT EXPERIENCE IS NOT ───────────────────────────────────────────────────────────────────
 * It is not a level she has to live up to, and the labels must not read as a ranking. It is one
 * fact — how long she has been lifting — and the descriptions say exactly that, in years, so nobody
 * has to decide whether they are "advanced".
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button, Legend, SegmentedControl, WheelPicker } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import type { Experience } from '@/data/local/models';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'AboutYou'>;

/** Where the age wheel opens — a place to turn from, not a default anybody keeps. */
const OPENS_ON = 30;

export function AboutYou({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const [age, setAge] = useState<number>(app.profile?.age && app.profile.age > 0 ? app.profile.age : OPENS_ON);
  const [experience, setExperience] = useState<Experience>(app.profile?.experience ?? 'beginner');

  function onContinue() {
    navigation.navigate('YourWeek', { ...route.params, age, experience });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 3, total: 6 }}
      legend={t('ob.aboutLegend')}
      title={t('ob.aboutTitle')}
      headGap={28}
      footer={<Button variant="primary" size="lg" block label={t('ob.continue')} onPress={onContinue} />}
    >
      <View style={styles.rows}>
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
        <View style={styles.col}>
          <Legend>{t('ob.experience')}</Legend>
          {/* Years, not ranks — see the header. Nobody has to decide whether they are "advanced". */}
          <SegmentedControl
            block
            size="lg"
            options={[
              { value: 'beginner', label: t('ob.expNew') },
              { value: 'intermediate', label: t('ob.expSome') },
              { value: 'advanced', label: t('ob.expYears') },
            ]}
            value={experience}
            onChange={(v) => setExperience(v as Experience)}
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
