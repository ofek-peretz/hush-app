/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT HURTS, AND WHAT SHE WILL NOT DO — the last thing the coach needs, and the last screen.
 *
 * The argument for why this is a screen rather than a chat turn is in `WhatFor`. This one carries
 * the half that matters most for her safety: the coach's whole hand is free, and a free hand that
 * has not been told about a shoulder writes overhead pressing into week one.
 *
 * ── ⚠️ "NOTHING" IS AN ANSWER, AND IT IS A CHIP ─────────────────────────────────────────────────
 * Most athletes have nothing to report, and a required text field would make them invent a sentence
 * or lie. "Nothing" as a chip lets the common case finish in one tap AND makes the answer explicit —
 * so the coach can tell "she said nothing hurts" apart from "nobody asked her", which are different
 * facts and lead to different first programmes.
 *
 * ⚠️ The others are named as body PARTS, not as injuries. "A knee" is something she can recognise in
 * two seconds; "patellofemoral pain" is a question about her diagnosis, which is not ours to ask and
 * not what the coach needs. The coach reads the prose she adds, and asks its own follow-up in the
 * first conversation if it needs one.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React, { useState } from 'react';
import { View, Keyboard, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button, TextField } from '@/components/ds';
import { AnswerChips } from '@/components/onboarding/AnswerChips';
import { useCopy } from '@/i18n/useCopy';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'Limits'>;

export function Limits({ navigation, route }: Props) {
  const { t } = useCopy();
  const [text, setText] = useState('');

  function onContinue() {
    Keyboard.dismiss();
    navigation.navigate('ConnectHealth', { ...route.params, limits: text.trim() });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 5, total: 6 }}
      keyboard
      legend={t('ob.limitsLegend')}
      title={t('ob.limitsTitle')}
      voice={t('ob.limitsSub')}
      headGap={28}
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          label={t('ob.continue')}
          onPress={onContinue}
          disabled={text.trim().length === 0}
        />
      }
    >
      <View style={styles.rows}>
        {/*
          ⛔ THE FIELD IS ABOVE THE CHIPS (founder, build 41): *"when you come to type in onboarding,
          you can't see the text window."*

          It was below them, near the foot of the body — so the keyboard rose over the one thing she
          was trying to look at. Above them it sits high on the screen and stays visible with the
          keyboard up.

          ⚠️ And it is the better order anyway: the ANSWER comes first and the suggestions sit under
          it, rather than a row of options standing between the question and the place to reply.
        */}
        <TextField
          block
          value={text}
          onChangeText={setText}
          placeholder={t('ob.limitsPlaceholder')}
          multiline
          maxLength={300}
          returnKeyType="done"
          onSubmitEditing={onContinue}
        />
        <AnswerChips
          options={[
            t('ob.limitsChipNone'),
            t('ob.limitsChipKnee'),
            t('ob.limitsChipShoulder'),
            t('ob.limitsChipBack'),
            t('ob.limitsChipWrist'),
          ]}
          onPick={setText}
          picked={text}
        />
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 20 },
});
