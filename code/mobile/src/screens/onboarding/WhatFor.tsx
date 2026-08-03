/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT SHE IS TRAINING FOR — the one thing a form could not hold, asked as a screen anyway.
 *
 * ⛔ FOUNDER, 2026-08-04: *"my model from the start was to be the SPOTIFY of the fitness world, and
 * right now I don't recognise my product… take the chat out of the front door."*
 *
 * ── WHY THIS IS NOT A CHAT ──────────────────────────────────────────────────────────────────────
 * Every AI app is a text box. That is the whole of the founder's complaint, and it is exactly right:
 * Spotify never asks you anything, and what it hands back is a made object. The intake had become
 * the front door to the product's intelligence, and a front door made of a text box is indistinguishable
 * from every other AI product on the phone.
 *
 * Once the form collects the six facts (`domain/coachRequirements`), only FOUR things are left that a
 * form genuinely cannot hold — what she is training for, what has hurt, what she will not do, and
 * what her gym has. The founder cut the last of those himself: *"no need to ask about equipment, it's
 * a gym, everything is there."* Three, over two screens, and the chat leaves the front door entirely.
 *
 * ── THE CHIPS ARE THE CONTROL SPEAKING ──────────────────────────────────────────────────────────
 * A bare text field asks her to invent an answer to a question she has not thought about. The chips
 * say what kind of answer this is — and that is the founder's own law: *let the control speak*.
 * Tapping one FILLS the field rather than replacing it, so the commonest answers cost two taps and
 * an unusual one is still a sentence she writes herself.
 *
 * ⚠️ AND THE FIELD IS NEVER EMPTY WHEN SHE LEAVES. The act is disabled until there is something,
 * because this is the single most valuable string the coach will ever hold: it is what the whole
 * programme is FOR, and the prompt's last non-negotiable says the sessions have to serve it.
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

type Props = NativeStackScreenProps<OnboardingParamList, 'WhatFor'>;

export function WhatFor({ navigation, route }: Props) {
  const { t } = useCopy();
  const [text, setText] = useState('');

  function onContinue() {
    Keyboard.dismiss();
    navigation.navigate('Limits', { ...route.params, goal: text.trim() });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 4, total: 6 }}
      keyboard
      legend={t('ob.forLegend')}
      title={t('ob.forTitle')}
      voice={t('ob.forSub')}
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
        <AnswerChips
          options={[
            t('ob.forChipMuscle'),
            t('ob.forChipStrong'),
            t('ob.forChipRace'),
            t('ob.forChipBack'),
          ]}
          onPick={setText}
          picked={text}
        />
        <TextField
          block
          value={text}
          onChangeText={setText}
          placeholder={t('ob.forPlaceholder')}
          multiline
          maxLength={200}
          returnKeyType="done"
          onSubmitEditing={onContinue}
        />
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 20 },
});
