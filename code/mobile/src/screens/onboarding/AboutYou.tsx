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
import { Button, TextField, SegmentedControl } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
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
  /*
   * ⛔ HOW LONG SHE HAS TRAINED IS NOT ASKED (founder 2026-08-08, on a measurement).
   *
   * I answered his question — *"האם אתה חושב שכן צריך ניסיון והאם זה כן יהיה מדויק יותר?"* — first
   * with a simulation that had a 100 kg-capable athlete opened at 45 kg and still under 75 kg after
   * six sessions, and concluded the question WAS needed. He corrected the model in one line:
   * *"אל תשכח את העובדה שאם מתאמן עורך ומשנה משקל המנוע מתאים אותו מיד. אתה מסתכל רק על החזרות."*
   *
   * He was right, and re-measuring with a single edit on set 1 reverses the answer:
   *
   *     TRUE 100 | opened 45 | PASSIVE after 6: 75 | EDITED s1: 100  → session 2 opens 102.5
   *     TRUE 130 | opened 45 | PASSIVE after 6: 75 | EDITED s1: 130  → session 2 opens 132.5
   *
   * `observedLoads` reads `actualWeight` — what she LIFTED, never what she was told to lift — so the
   * engine learns from the correction and builds on it the next session. A wrong opening load costs
   * one finger movement; a wrong ANSWER to "how long have you trained" costs the same load and is
   * also a question she may not know how to answer honestly.
   *
   * ⚠️ Nothing in `src/engine` has ever read `experience`. Its only consumers were `coachFacts` (the
   * AI's fact pack) and the server payload, and the AI is out of the front door.
   */

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
    navigation.navigate('YourTraining', { sex });
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
          ⛔ THE EXPERIENCE CONTROL STOOD HERE AND IS DELETED — see the note on the state above. The
          screen is down to the two things it cannot learn any other way: what to call her, and which
          gender every Hebrew sentence from here on conjugates against.
        */}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 22 },
  col: { gap: 12 },
});
