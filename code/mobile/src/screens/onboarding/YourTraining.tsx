/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * HER TRAINING — how long she has done it, how many days, and how long each one is.
 *
 * ⛔ FOUNDER, 2026-08-04: *"merge as many of the new screens as possible into one — sensibly, and
 * with no scrolling."* This absorbed the experience question from `AboutYou`, which kept the two
 * RULES (bodyweight and age) and handed the three CHOICES here. One screen answers "what is her
 * body", the next answers "what is her training", and neither scrolls.
 *
 * ⚠️ Three segmented controls cost 3 × (20 + 48) + 2 × 32 gaps = 268px against a ~565px body — the
 * lightest of the three steps, which is why it took the extra question rather than the other one.
 *
 * ⛔ FOUNDER, 2026-08-03: *"training frequency… session length — I don't know how critical it is,
 * most people like 45–60 minutes."*
 *
 * It is critical, and there is evidence rather than an opinion: he was handed a six-exercise session
 * the app called 35 minutes. **A coach cannot size a session against a budget nobody told it**, and
 * a session that does not fit her evening is one she stops finishing.
 *
 * ── ⛔ AND THIS IS THE SCREEN HIS EARLIER RULING WAS ABOUT ──────────────────────────────────────
 * *"It decides on its own that it will do 4 workouts for me, without asking."* That was the app
 * handing the coach a placeholder 4 as a measured fact. The fix then was to send nothing; the fix
 * now is to ASK. Those are the same ruling, not opposite ones: a placeholder is a lie, a question is
 * a question. What must never happen again is a number on the coach's sheet that she did not give.
 *
 * ── WHY SEGMENTED AND NOT A WHEEL ───────────────────────────────────────────────────────────────
 * The wheel is for a value out of a continuum — a bodyweight, an age. These are CHOICES out of a
 * handful, and every option should be visible at once so she can see the shape of the decision
 * rather than discover it by scrolling.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button, Legend, WheelPicker } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import type { Experience } from '@/data/local/models';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'YourTraining'>;

/**
 * ⛔ THE SESSION-LENGTH PICKER IS DELETED (founder 2026-08-05).
 *
 * He opened by proposing an hour as a default — *"I suggest setting a workout at an hour by
 * default … and then it frees up room in the onboarding"* — and I argued it should leave the form
 * altogether: the coach already knows her days, her experience and her goal, and **she cannot
 * answer how long she wants to be in a gym before her first session.** He agreed and set the one
 * bound that matters: *"fine, take it out. Just make it at least 45 minutes, because less than that
 * is too light."*
 *
 * ⚠️ So the floor is the COACH's, not a wheel's — see `coachPrompt`. Nothing here decides it, and
 * nothing here should: a number she never chose has no business being carried as if she had.
 */

/** Where the wheels open when there is nothing known about her yet. */
const WEIGHT_OPENS_ON: Record<'kg' | 'lb', number> = { kg: 70, lb: 155 };
const AGE_OPENS_ON = 30;
const DAYS_OPENS_ON = 3;

export function YourTraining({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  const [days, setDays] = useState<number>(
    app.profile?.daysPerWeek && app.profile.daysPerWeek > 0 ? app.profile.daysPerWeek : DAYS_OPENS_ON,
  );
  const [weight, setWeight] = useState<number>(() => {
    const known = app.profile?.weightKg;
    if (known && known > 0) return units === 'lb' ? Math.round(known * 2.2046226) : known;
    return WEIGHT_OPENS_ON[units];
  });
  const [age, setAge] = useState<number>(app.profile?.age && app.profile.age > 0 ? app.profile.age : AGE_OPENS_ON);

  function onContinue() {
    // The one place lb becomes kg. The record is metric; the wheel is hers.
    const kg = units === 'lb' ? +(weight / 2.2046226).toFixed(1) : weight;
    navigation.navigate('YourGoal', { ...route.params, weightKg: kg, age, daysPerWeek: days });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 2, total: 4 }}
      legend={t('ob.weekLegend')}
      title={t('ob.weekTitle')}
      headGap={28}
      footer={<Button variant="primary" size="lg" block label={t('ob.continue')} onPress={onContinue} />}
    >
      <View style={styles.rows}>
        {/*
          ⛔ THREE RULERS, ONE SCREEN (founder 2026-08-05): *"make one screen of 3 rulers — DAYS A
          WEEK together with BODYWEIGHT and AGE."*

          ⚠️ AND DAYS BECAME ONE. It was a segmented control of five buttons while bodyweight and age
          were wheels a screen earlier — three answers of the same kind asked by two different
          instruments. His instruction was explicit that the wheel itself is not to be touched
          (*"don't touch the functionality of the rulers, they work perfectly — just add a ruler
          where one is needed, exactly like the others"*), so this is the same `WheelPicker`
          component with a smaller range, not a new control.
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
        <View style={styles.col}>
          <Legend>{t('ob.age')}</Legend>
          <WheelPicker
            value={age}
            onChange={setAge}
            step={1}
            min={14}
            max={95}
            size="lg"
            ends="chevron"
            label={t('ob.age')}
          />
        </View>
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 32 },
  col: { gap: 12 },
});
