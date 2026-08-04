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
import { Button, Legend, SegmentedControl } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import type { Experience } from '@/data/local/models';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'YourTraining'>;

/**
 * The four session lengths.
 *
 * ⚠️ 45 AND 60 ARE THE MIDDLE TWO ON PURPOSE — the founder's own reading of the field: *"most people
 * like 45–60 minutes."* 30 is for someone squeezing it in; 75 is for someone who genuinely has the
 * evening. Offering 90 would invite a budget almost nobody keeps, and a budget she does not keep is
 * worse than none, because the coach sizes every session against it.
 */
const LENGTHS = [30, 45, 60, 75] as const;

export function YourTraining({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const [experience, setExperience] = useState<Experience>(app.profile?.experience ?? 'beginner');
  const [days, setDays] = useState<number>(app.profile?.daysPerWeek && app.profile.daysPerWeek > 0 ? app.profile.daysPerWeek : 3);
  const [minutes, setMinutes] = useState<number>(app.profile?.workoutMinutes ?? 60);

  function onContinue() {
    navigation.navigate('YourGoal', { ...route.params, experience, daysPerWeek: days, workoutMinutes: minutes });
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
        {/* Years, not ranks — nobody has to decide whether they are "advanced". */}
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
        <View style={styles.col}>
          <Legend>{t('ob.daysPerWeek')}</Legend>
          <SegmentedControl
            block
            size="lg"
            options={[2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
          />
        </View>
        <View style={styles.col}>
          <Legend>{t('ob.sessionLength')}</Legend>
          <SegmentedControl
            block
            size="lg"
            options={LENGTHS.map((n) => ({ value: String(n), label: t('ob.minutesShort', { min: n }) }))}
            value={String(minutes)}
            onChange={(v) => setMinutes(Number(v))}
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
