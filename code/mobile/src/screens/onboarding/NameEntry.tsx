/**
 * NameEntry — "How should I address you?" (step 2). Two answers, one question:
 * the athlete's NAME and their GENDER.
 *
 * FOUNDER 2026-07-12 — three changes, and they are one change:
 *  - The name is no longer optional-with-a-Skip. "Leave it blank to stay anonymous" plus a
 *    Skip button is an escape hatch nobody asked for, on the step where the product first
 *    speaks to a person. Both are gone, and the step is the better for the room they freed.
 *  - GENDER MOVED HERE, from Body data. It sat down there as the fourth control on the most
 *    crowded step in the app, drowned between three wheels — while every Hebrew sentence
 *    from this screen onward needs it, because Hebrew conjugates the second person. Asked at
 *    the door, it is answered before the first sentence that depends on it (i18n/gender.ts).
 *  - It is published the moment it is picked, not at the end of onboarding: the four screens
 *    that follow already address the athlete directly.
 *
 * Sex remains a physiological input to the starting loads and the split — the one line under
 * the control says so, at the moment it is asked.
 */
import React, { useState } from 'react';
import { View, Text, Keyboard, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { TextField, Button, Legend, SegmentedControl } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { color, font, textScale } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'NameEntry'>;

export function NameEntry({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const [name, setName] = useState(app.profile?.name ?? '');
  const [sex, setSex] = useState<'female' | 'male'>(app.profile?.sex ?? 'male');

  function pickSex(v: string) {
    const next = v as 'female' | 'male';
    setSex(next);
    // The rest of onboarding speaks to this person — in Hebrew, in their gender.
    app.setPendingSex(next);
  }

  function onContinue() {
    Keyboard.dismiss();
    app.setPendingName(name);
    app.setPendingSex(sex);
    navigation.navigate('Bodyweight', { sex });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 1, total: 6 }}
      keyboard
      title={t('ob.nameTitle')}
      footer={<Button variant="primary" size="lg" block label={t('ob.continue')} onPress={onContinue} />}
    >
      <View style={styles.rows}>
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
        <View style={styles.col}>
          <Legend>{t('ob.sex')}</Legend>
          <SegmentedControl
            block
            size="lg"
            options={[{ value: 'female', label: t('ob.female') }, { value: 'male', label: t('ob.male') }]}
            value={sex}
            onChange={pickSex}
          />
          {/* ════ THE LINE UNDER SEX IS GONE (founder 2026-07-28) ════
              It defended a control nobody had objected to yet, and it defended it by pointing at a
              screen — the BODY MAP — that is two steps AHEAD and has not been seen. A caption that
              explains a control steals the control's job, and one that forward-references a screen
              she cannot picture buys nothing at all: the map itself says what it is for, when she
              gets there, with the muscles in front of her. Two labelled choices need no footnote. */}
        </View>
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  // One 40px rhythm down the step: title → NAME → SEX (the handoff's body gap).
  rows: { gap: 40 },
  col: { gap: 12 },
  why: { fontFamily: font.sans, fontSize: 14, lineHeight: 22, color: color.textSecondary, textAlign: 'left' },
  whyStrong: { fontFamily: font.sansSemibold, color: color.textPrimary, textAlign: 'left' },
});
