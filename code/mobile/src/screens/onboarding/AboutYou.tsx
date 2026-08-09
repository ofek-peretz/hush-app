/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ABOUT YOU — name, sex, and how long she has trained. One screen.
 *
 * ⛔ RESHAPED 2026-08-05 (founder): *"make one screen of 3 rulers — DAYS A WEEK together with
 * BODYWEIGHT and AGE — and then move the years of experience to the screen with the name and the
 * sex."* This screen asks the three things she IS; `YourTraining` asks the three she SETS.
 *
 * ⛔ FOUNDER, 2026-08-04, rejecting a proposal that would have added a line of the coach's voice to
 * every step: *"not good enough. That's a lot of copy, and onboarding is something people fill in
 * and move on from."*
 *
 * So the intake was measured in TAPS instead, and two of the slowest things in it turned out to be
 * answers the app already had.
 *
 * ── ⛔ NAMEENTRY IS MERGED INTO THIS SCREEN AND DELETED ─────────────────────────────────────────
 * It asked two things — a name and a sex — and one of them is a single tap while the other is a
 * keyboard the product did not need to raise (see below). What was left did not justify a screen of
 * its own, and five answering screens became four.
 *
 * ⚠️ THE ORDER IS DELIBERATE: the name and the sex come FIRST on the page, above the wheels, because
 * sex is published the moment it is picked and every Hebrew sentence from here on conjugates against
 * it. She answers it before she reads anything that depends on it, exactly as she did when it had
 * its own screen.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import React, { useState } from 'react';
import { View, Keyboard, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button, Legend, TextField, SegmentedControl } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import type { Experience } from '@/data/local/models';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'AboutYou'>;

/** Where each rule opens — a place to turn from, not a default anybody keeps. */
const WEIGHT_OPENS_ON = { kg: 70, lb: 155 } as const;

export function AboutYou({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  /*
   * ⛔ THE NAME IS ALREADY OURS (founder 2026-08-04): *"onboarding is something people fill in and
   * move on."*
   *
   * `AuthResult` carries `name` — Apple returns it on first authorization — and `appStore` catches
   * it into `pendingNameRef` the moment she signs in. The screen that asked for it initialised its
   * field from `app.profile?.name`, which **does not exist yet during onboarding**, so the field she
   * landed on was always empty. She retyped a name the product had been handed one screen earlier.
   *
   * Editable, obviously. But for most people the first screen of the app now needs no keyboard.
   */
  const [name, setName] = useState(app.pendingName() ?? '');
  /*
   * ⛔ AND SEX HAS NO DEFAULT. It was `'male'`.
   *
   * A woman who does not notice gets an app that addresses her in the wrong gender in every line of
   * Hebrew it will ever write her — silently, for ever, because Hebrew conjugates the second person
   * and the whole copy layer keys off this one value. One extra tap for a man is not a price; it is
   * the removal of the worst default in the product.
   */
  const [sex, setSex] = useState<'female' | 'male' | null>(app.profile?.sex ?? null);
  const [experience, setExperience] = useState<Experience>(app.profile?.experience ?? 'beginner');

  function pickSex(v: string) {
    const next = v as 'female' | 'male';
    setSex(next);
    // The rest of onboarding speaks to this person — in Hebrew, in their gender. Published the
    // moment it is picked, not at the end: the screens that follow already address her directly.
    app.setPendingSex(next);
  }

  function onContinue() {
    if (!sex) return;
    Keyboard.dismiss();
    app.setPendingName(name);
    app.setPendingSex(sex);
    // Carried in the params, exactly as `sex` is — `ConnectHealth` assembles the whole
    // `OnboardingInputs` and there must be ONE place that does. The lb→kg conversion went with the
    // weight wheel to `YourTraining`; there is still exactly one place it happens.
    navigation.navigate('YourTraining', { sex, experience });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 1, total: 4 }}
      keyboard
      title={t('ob.aboutTitle')}
      headGap={26}
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          label={t('ob.continue')}
          onPress={onContinue}
          /* Sex has no default, so there is genuinely nothing to continue with until she picks. */
          disabled={!sex}
        />
      }
    >
      <View style={styles.rows}>
        {/*
          ⚠️ NO LABEL OVER THE FIELD OR THE SEGMENT. The headline names the screen and both controls
          say what they are — a placeholder of "Your name", and two labelled choices. A label that
          explains a control steals the control's job (the founder's own law), and this screen now
          carries four answers: every line it does not need is one it cannot afford.
        */}
        <TextField
          block
          value={name}
          onChangeText={setName}
          placeholder={t('ob.namePlaceholder')}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={40}
          returnKeyType="done"
        />
        <SegmentedControl
          block
          size="lg"
          options={[{ value: 'female', label: t('ob.female') }, { value: 'male', label: t('ob.male') }]}
          value={sex ?? ''}
          onChange={pickSex}
        />
        {/*
          ⛔ EXPERIENCE MOVED HERE (founder 2026-08-05): *"move the years of experience to the screen
          with the name and the sex."*

          He is right about what belongs together. This screen asks the three things she IS — her
          name, her sex, how long she has trained — and none of them is a number she sets. The next
          screen asks the three she SETS, on one instrument each. Bodyweight and age went with it.

          Years, not ranks: nobody has to decide whether they are "advanced".
        */}
        <View style={styles.col}>
          <Legend>{t('ob.experience')}</Legend>
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
  rows: { gap: 22 },
  col: { gap: 12 },
});
