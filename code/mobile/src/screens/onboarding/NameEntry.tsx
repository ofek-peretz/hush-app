/**
 * NameEntry — "What should Hush call you?" (after Consent), re-skinned to the
 * design onboarding step: legend → title → sub → a labelled TextField → Continue /
 * Skip. Optional; the name is how Hush addresses the athlete. Progress 1 / 5.
 */
import React, { useState } from 'react';
import { Keyboard } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { TextField, Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'NameEntry'>;

export function NameEntry({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const [name, setName] = useState(app.profile?.name ?? '');

  function onContinue() {
    Keyboard.dismiss();
    app.setPendingName(name);
    navigation.navigate('ConnectHealth');
  }
  function onSkip() {
    Keyboard.dismiss();
    navigation.navigate('ConnectHealth');
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 1, total: 5 }}
      keyboard
      legend={t('ob.nameLegend')}
      title={t('ob.nameTitle')}
      sub={t('ob.nameSub')}
      footer={
        <>
          <Button variant="primary" size="lg" block label={t('ob.continue')} onPress={onContinue} />
          <Button variant="quiet" block label={t('ob.skip')} onPress={onSkip} />
        </>
      }
    >
      <TextField
        block
        label={t('ob.nameLabel')}
        value={name}
        onChangeText={setName}
        placeholder={t('ob.namePlaceholder')}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={40}
        returnKeyType="done"
        onSubmitEditing={onContinue}
      />
    </OnboardingScaffold>
  );
}
