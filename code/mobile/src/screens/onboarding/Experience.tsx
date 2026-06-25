/**
 * Experience — one choice between Goal and Days per week, re-skinned to the design
 * onboarding step: legend → title → sub → a stacked SegmentedControl
 * (Beginner / Intermediate / Advanced with durations). Training experience is the
 * single biggest input to the cold-start starting weight. Continue → Days per
 * week. Progress 5 / 6.
 */
import React, { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { OptStack } from '@/components/onboarding/OptStack';
import { Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { track } from '@/platform/telemetry';
import type { Experience as ExperienceT } from '@/data/local/models';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'Experience'>;

export function Experience({ navigation, route }: Props) {
  const { t } = useCopy();
  const { profile, goal } = route.params;
  const [experience, setExperience] = useState<ExperienceT>('intermediate');

  function onContinue() {
    void track('experience_selected', { experience });
    navigation.navigate('DaysPerWeek', { profile, goal, experience });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 5, total: 6 }}
      legend={t('ob.expLegend')}
      title={t('ob.expTitle')}
      sub={t('ob.expSub')}
      footer={<Button variant="primary" size="lg" block label={t('ob.continue')} onPress={onContinue} />}
    >
      <OptStack
        value={experience}
        onChange={(v) => setExperience(v as ExperienceT)}
        options={[
          { value: 'beginner', label: t('ob.expBeginner'), desc: t('ob.expBeginnerDesc') },
          { value: 'intermediate', label: t('ob.expIntermediate'), desc: t('ob.expIntermediateDesc') },
          { value: 'advanced', label: t('ob.expAdvanced'), desc: t('ob.expAdvancedDesc') },
        ]}
      />
    </OnboardingScaffold>
  );
}
