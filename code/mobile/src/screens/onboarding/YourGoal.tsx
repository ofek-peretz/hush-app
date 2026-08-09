/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE TWO THINGS A FORM CANNOT HOLD — on one screen, with nothing to read.
 *
 * ⛔ FOUNDER, 2026-08-04: *"nobody reads whole sentences in onboarding — it's the stage where you
 * collect information quickly and start. Fewer screens = shorter onboarding."*
 *
 * This was `WhatFor` and `Limits`. They were separate because each had a paragraph explaining
 * itself; with the paragraphs gone they fit together with room to spare, and the intake loses a
 * step. **The prose was what made them two screens.**
 *
 * ── ⚠️ WHY THIS IS THE ONLY MERGE LEFT ──────────────────────────────────────────────────────────
 * Measured, not guessed. The body runs from ~150 to the act at 775 — about 625px. What is left:
 *
 *   · her body      sex 80 + two rules 288 + gaps  = 432   ✓
 *   · her training  three choices 240 + gaps       = 304   ✓
 *   · this screen   two fields 120 + two chip rows = 380   ✓
 *
 * Putting her body and her training together comes to 656 and does not fit — and a wheel is not
 * something to shrink. Four answering screens is the floor without making one of them worse.
 *
 * ── THE CHIPS ───────────────────────────────────────────────────────────────────────────────────
 * A bare field asks her to invent an answer to a question she has not thought about; the chips say
 * what kind of answer this is, which is the founder's own law — *let the control speak*. Tapping
 * FILLS the field, so the common case is two taps and an unusual one is still her own sentence.
 *
 * ⚠️ The field is ABOVE its chips on both halves: it was below, and the keyboard rose over the one
 * thing she was trying to look at.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import React, { useState } from 'react';
import { View, Keyboard, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button, Legend, TextField } from '@/components/ds';
import { AnswerChips } from '@/components/onboarding/AnswerChips';
import { useCopy } from '@/i18n/useCopy';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'YourGoal'>;

export function YourGoal({ navigation, route }: Props) {
  const { t } = useCopy();
  const [goal, setGoal] = useState('');
  const [limits, setLimits] = useState('');

  function onContinue() {
    Keyboard.dismiss();
    navigation.navigate('ConnectHealth', { ...route.params, goal: goal.trim(), limits: limits.trim() });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 3, total: 4 }}
      keyboard
      legend={t('ob.forLegend')}
      title={t('ob.forTitle')}
      headGap={24}
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          label={t('ob.continue')}
          onPress={onContinue}
          disabled={goal.trim().length === 0 || limits.trim().length === 0}
        />
      }
    >
      <View style={styles.rows}>
        <View style={styles.col}>
          <TextField
            block
            value={goal}
            onChangeText={setGoal}
            placeholder={t('ob.forPlaceholder')}
            multiline
            maxLength={200}
          />
          {/*
            ⛔ NO "A RACE" (founder, build 41): *"go back to the source and be the best gym-only app
            there is."* Offering a race invites a goal whose conditioning is not on the coach's menu.
            She can still type it, and the coach answers honestly about what it can do.
          */}
          <AnswerChips
            options={[t('ob.forChipMuscle'), t('ob.forChipStrong'), t('ob.forChipBack')]}
            onPick={setGoal}
            picked={goal}
          />
        </View>

        <View style={styles.col}>
          {/* The second question needs a name; the first one has the screen's title. */}
          <Legend>{t('ob.limitsLegend')}</Legend>
          <TextField
            block
            value={limits}
            onChangeText={setLimits}
            placeholder={t('ob.limitsPlaceholder')}
            multiline
            maxLength={300}
          />
          {/*
            ⚠️ "NOTHING" IS A CHIP. Most athletes have nothing to report, and a required field would
            make them invent a sentence or lie. As a chip it is one tap AND an explicit answer — so
            the coach can tell "she said nothing hurts" from "nobody asked her", which are different
            facts and lead to different first programmes.
          */}
          {/*
            ⛔ THE CHIPS ARE THE AREAS PEOPLE ACTUALLY SKIP (founder 2026-08-05): *"I suggest making
            it 'injuries or certain areas you would rather not train?' and then chips of the most
            common areas people don't want to train — calves for example, or other areas where it is
            common that people don't like working on them."*

            Two things were merged, and merging them is the insight: **to the programme, a knee that
            hurts and a calf she refuses have the same effect** — do not put load there. Asking them
            as two questions would have been asking twice for one answer.
          */}
          <AnswerChips
            options={[
              t('ob.limitsChipNone'),
              t('ob.limitsChipKnee'),
              t('ob.limitsChipShoulder'),
              t('ob.limitsChipBack'),
              t('ob.limitsChipCalves'),
              t('ob.limitsChipNeck'),
            ]}
            onPick={setLimits}
            picked={limits}
          />
        </View>
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 26 },
  col: { gap: 12 },
});
