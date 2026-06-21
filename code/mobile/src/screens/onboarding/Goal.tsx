/**
 * Goal (§4.4) — one choice, re-skinned to the design onboarding step: legend →
 * title → sub → a stacked SegmentedControl. The goal drives the per-set rep/set
 * schemes. Continue → Experience. Progress 4 / 6.
 *
 * Build Muscle → build_muscle · Increase Strength → get_stronger · Get Lean →
 * toning · Stay Consistent → general_fitness.
 */
import React, { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { SegmentedControl, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { track } from '@/platform/telemetry';
import type { Goal as GoalT } from '@/data/local/models';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'Goal'>;

export function Goal({ navigation, route }: Props) {
  const { t } = useCopy();
  const { profile } = route.params;
  const [goal, setGoal] = useState<GoalT>('build_muscle');

  function onContinue() {
    void track('goal_selected', { goal });
    navigation.navigate('Experience', { profile, goal });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 4, total: 6 }}
      legend={t('ob.goalLegend')}
      title={t('ob.goalTitle')}
      sub={t('ob.goalSub')}
      footer={<Button variant="primary" size="lg" block label={t('ob.continue')} onPress={onContinue} />}
    >
      <SegmentedControl
        stack
        size="lg"
        value={goal}
        onChange={(v) => setGoal(v as GoalT)}
        options={[
          { value: 'build_muscle', label: t('ob.goalMuscle') },
          { value: 'get_stronger', label: t('ob.goalStrength') },
          { value: 'toning', label: t('ob.goalLean') },
          { value: 'general_fitness', label: t('ob.goalConsistent') },
        ]}
      />
    </OnboardingScaffold>
  );
}
