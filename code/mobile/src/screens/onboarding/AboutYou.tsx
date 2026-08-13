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
/*
 * ⛔ `Pressable` WAS MISSING TOO — the SECOND crash in this one file, found in the same audit.
 *
 * The import door added on 2026-08-11 is a `<Pressable>` wrapping a `<Text>`, and NONE of the three
 * things it needs were imported. Three crashes in one edit, each hidden differently:
 *
 *   `font` / `color`  threw at MODULE scope — the whole app died on launch, every platform
 *   `Pressable`       threw at RENDER — step two of onboarding, the moment she pressed Continue
 *   `Text`            ⛔ threw NOTHING anywhere, and is the worst of the three
 *
 * ⚠️ `Text` IS A DOM CONSTRUCTOR. On web `window.Text` exists, so the name resolved silently to the
 * browser's global and React tried to call it as a component — "Please use the 'new' operator".
 * There is no `ReferenceError` for the bundle to report and no `TS2304` for the typechecker to find,
 * because `lib.dom` says `Text` is perfectly defined. On Hermes there is no such global and it would
 * have been a plain crash instead. One bug, two different failures, and neither one visible from
 * inside this repo's tooling — see `everyComponentIsImported`, written for this class.
 */
import { View, Text, Keyboard, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button, Legend, TextField, WheelPicker } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
/*
 * ⛔ THIS LINE WAS MISSING AND IT CRASHED THE WHOLE APP (found 2026-08-12, in a browser).
 *
 * The import door was added to this step on 2026-08-11 with a style that reads `font.sans` and
 * `color.textMuted`, and the import for them was never added. `StyleSheet.create` runs at MODULE
 * scope, `Root` imports every screen eagerly, so the reference threw before a single frame — the
 * entire bundle died on `font is not defined`, on every platform, from the first launch.
 *
 * ⚠️ AND NOTHING CAUGHT IT: this file carries `@ts-nocheck`, so the typechecker never looked, and
 * no test mounts `AboutYou`. 2,639 laws, a clean `tsc`, and the app did not start.
 */
import { line, color, font, textScale } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'AboutYou'>;

/** Where each rule opens — a place to turn from, not a default anybody keeps. */
const WEIGHT_OPENS_ON: Record<'kg' | 'lb', number> = { kg: 70, lb: 155 };
const DAYS_OPENS_ON = 3;

export function AboutYou({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
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
   * ⛔ THE TWO RULERS CAME BACK HERE (founder 2026-08-10): *"תמשיך למיזוג המסכים."*
   *
   * `YourTraining` held three wheels — days, bodyweight, age — and once age left with experience
   * (see the note below), the intake was FOUR answers spread over two screens, each half empty.
   * Two half-screens is not a gentler form than one full one; it is the same form with an extra tap
   * in the middle of it. The screen now asks everything a person is and everything she sets, and
   * the next thing she sees is her own body.
   *
   * ⚠️ The wheel itself is untouched, on his standing instruction: *"אל תיגע בפונקציונליות של
   * הסרגלים, הם עובדים מושלם."* Same `WheelPicker`, same ranges, same opening values.
   */
  const [days, setDays] = useState<number>(
    app.profile?.daysPerWeek && app.profile.daysPerWeek > 0 ? app.profile.daysPerWeek : DAYS_OPENS_ON,
  );
  const [weight, setWeight] = useState<number>(() => {
    const known = app.profile?.weightKg;
    if (known && known > 0) return units === 'lb' ? Math.round(known * 2.2046226) : known;
    return WEIGHT_OPENS_ON[units];
  });
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
    // The one place lb becomes kg. The record is metric; the wheel is hers.
    const kg = units === 'lb' ? +(weight / 2.2046226).toFixed(1) : weight;
    // Carried in the params, exactly as `sex` is — `ConnectHealth` assembles the whole
    // `OnboardingInputs` and there must be ONE place that does.
    navigation.navigate('ConnectHealth', { sex, weightKg: kg, daysPerWeek: days });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 1, total: 3 }}
      /*
       * ⛔ THE BODY OF THIS STEP IS TWO HORIZONTAL WHEELS, so it cannot also be a step you leave
       * with a horizontal drag (founder 2026-07-13): every attempt to set a bodyweight would drag
       * the screen back instead of turning the rule. The navigator's full-screen gesture is off for
       * this step (`Root`), and the way back by hand lives in the footer — the one band with no
       * wheel in it. The arrow in the top bar is, as ever, the way back that always works.
       */
      onSwipeBack={() => navigation.goBack()}
      keyboard
      title={t('ob.aboutTitle')}
      headGap={26}
      footer={
        <>
          <Button
            variant="primary"
            size="lg"
            block
            label={t('ob.continue')}
            onPress={onContinue}
            /* Sex has no default, so there is genuinely nothing to continue with until she picks. */
            disabled={!sex}
          />
          {/*
            ⛔ THE DOOR FOR A PROGRAMME SHE ALREADY HAS IS NOT HERE ANY MORE (founder 2026-08-12).

            It was a 14px underlined line under this button, and behind it sat a matcher, a prompt, a
            background runner, a review screen and 96 laws — *"זה לא פיצ'ר אלא זה חלק מהמוצר שלנו
            שהגדרנו מערכת שלמה עבורו"*. A control's SIZE is the app saying how much it matters, and
            this one said "footnote".

            It is `screens/onboarding/Start` now: a fork, before the intake, where the two ways to
            begin are the same size. The reasoning that put it EARLY still holds and is written
            there — the model's read runs underneath the rest of the questions.
          */}
        </>
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
        {/*
          ⛔ NOT A SEGMENTED CONTROL (founder 2026-08-12: *"הפקדים של זכר ונקבה לא קשורים למסך
          וניראים בנאליים"*).

          He is right twice. A segmented pill is the iOS idiom for a VIEW FILTER — All / Unread /
          Flagged — so putting her sex in one framed it as a display preference rather than a fact
          about her body. And it was the only control on the screen with that shape, sitting between
          a written line and two measuring wheels, belonging to neither.

          Two plain choices on the same rules the wheels below are drawn with: a hairline each, the
          chosen one lit. It reads as an answer to a question, which is what it is.

          ⛔ AND IT CARRIES NO CAPTION EXPLAINING ITSELF. My first cut added one, and
          `appMatchesEngine` refused it by name: `ob.sexWhy` was deleted by the founder on
          2026-07-28 as *"a note defending a control nobody had objected to, pointing at a body map
          two steps ahead that she has not seen."*

          ⚠️ THAT RULING STILL STANDS AND TODAY'S OBJECTION WAS A DIFFERENT ONE. He called the
          control banal and unrelated to the screen — a complaint about its SHAPE, which is what
          changed. Answering it with prose would have been defending the old shape instead of
          fixing it, twice.
        */}
        <View style={styles.col}>
          <Legend>{t('ob.sexLegend')}</Legend>
          <View style={styles.choices}>
            {(['female', 'male'] as const).map((v) => (
              <Pressable
                key={v}
                accessibilityRole="radio"
                accessibilityState={{ selected: sex === v }}
                accessibilityLabel={t(v === 'female' ? 'ob.female' : 'ob.male')}
                onPress={() => pickSex(v)}
                style={({ pressed }) => [styles.choice, sex === v && styles.choiceOn, pressed && styles.choicePressed]}
              >
                <Text style={[styles.choiceText, sex === v && styles.choiceTextOn]}>
                  {t(v === 'female' ? 'ob.female' : 'ob.male')}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        {/*
          ⛔ THE EXPERIENCE CONTROL STOOD HERE AND IS DELETED — see the note on the state above.
          What is left above is the two things the app cannot learn any other way: what to call her,
          and which gender every Hebrew sentence from here on conjugates against. Below it, the two
          numbers she sets — one instrument each.
        */}
        <View style={styles.col}>
          <Legend>{t('ob.daysPerWeek')}</Legend>
          <WheelPicker
            value={days}
            onChange={setDays}
            step={1}
            min={2}
            max={6}
            size="lg"
            ends="chevron"
            label={t('ob.daysPerWeek')}
          />
        </View>
        <View style={styles.col}>
          <Legend>{t('ob.weightLegend')}</Legend>
          <WheelPicker
            value={weight}
            onChange={setWeight}
            step={units === 'kg' ? 0.5 : 1}
            min={units === 'kg' ? 30 : 66}
            max={units === 'kg' ? 250 : 550}
            size="lg"
            ends="chevron"
            label={t('ob.weightLegend')}
          />
        </View>
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  bringYours: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  /* Two answers, drawn on the same rules the wheels below are drawn with — a hairline each, the
     chosen one lit. Whole-row targets: this is a question, not a toolbar. */
  choices: { flexDirection: 'row', gap: 10 },
  choice: {
    flex: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: line[0],
  },
  choiceOn: { borderColor: color.textPrimary },
  /* A press is a WASH, never a fade (founder A.13). */
  choicePressed: { backgroundColor: 'rgba(241,238,229,0.06)' },
  choiceText: { fontFamily: font.sansMedium, fontSize: textScale.md, color: color.textMuted, textAlign: 'center' },
  choiceTextOn: { color: color.textPrimary },

  rows: { gap: 20 },
  col: { gap: 12 },
});
