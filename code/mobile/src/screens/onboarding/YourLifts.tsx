/**
 * ════ THE WEIGHTS SHE LIFTS TODAY — the one fact the coach cannot guess ════
 *
 * Founder, 2026-10-11: *"אם היא [הבינה] צריכה מידע נוסף בשביל לדייק כמה שיותר את התוכנית עבור המתאמן
 * אפשר להוסיף עוד נתונים שהבינה חייבת למסכים ב-onboarding. אני רוצה את תוכנית האימון הטובה ביותר
 * לכל מתאמן."*
 *
 * Walked live as a man with six years under the bar: the week was his split, his emphasis, his four
 * big lifts at his numbers — and every other lift opened at a weight for a stranger of his
 * bodyweight, because the only numbers the model had were the ones he happened to type into a free
 * line. `domain/statedLifts` has the reasoning; this is the step that asks.
 *
 * ⚠️ ASKED ONLY OF AN ATHLETE WHO SAID SHE HAS TRAINED (`ConnectHealth` routes here; a beginner
 * goes straight to the week). She has no numbers, and a screen of empty fields is a quiz she fails.
 *
 * ⚠️ EVERY FIELD IS OPTIONAL AND THE SCREEN SAYS SO WITH A BUTTON, NOT A SENTENCE. His bar for the
 * intake is *"קצר וקולע"* and *"המוח של האדם הוא עצלן"* (2026-09-16): a title, four rows, two ways
 * out. A row she leaves empty is a lift the model estimates from the rows she filled.
 *
 * The figures are typed in her own units and stored in kilograms, as every load in the app is.
 */

//

import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OnboardingParamList } from '@/app/navigation';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button, TextField } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { exerciseDisplayName } from '@/data/exercises';
import { kgFromDisplay, unitLabel } from '@/domain/schedule';
import { cleanStatedLifts, intakeLifts } from '@/domain/statedLifts';
import { color, font, textScale } from '@/design/tokens';

type Props = NativeStackScreenProps<OnboardingParamList, 'YourLifts'>;

/** Digits and one decimal point; anything else a keyboard can produce is dropped as it is typed. */
const figure = (raw: string, decimal: boolean): string => {
  const cleaned = raw.replace(',', '.').replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  return rest.length > 0 ? `${whole}.${rest.join('')}` : whole;
};

export function YourLifts({ navigation, route }: Props) {
  const { t } = useCopy();
  const inputs = route.params.inputs;
  const units = inputs.units;
  const ids = useMemo(() => intakeLifts(inputs.sex), [inputs.sex]);
  const [typed, setTyped] = useState<Record<string, { weight: string; reps: string }>>({});
  const set = (id: string, field: 'weight' | 'reps', value: string) =>
    setTyped((was) => ({ ...was, [id]: { weight: was[id]?.weight ?? '', reps: was[id]?.reps ?? '', [field]: value } }));

  const proceed = (withLifts: boolean) => {
    const lifts = withLifts
      ? cleanStatedLifts(
          ids.map((exerciseId) => {
            const row = typed[exerciseId];
            const shown = Number(row?.weight);
            return {
              exerciseId,
              kg: row?.weight && Number.isFinite(shown) ? kgFromDisplay(shown, units) : undefined,
              reps: row?.reps ? Number(row.reps) : undefined,
            };
          }),
        )
      : [];
    navigation.navigate('PlanBuilder', { inputs: { ...inputs, ...(lifts.length > 0 ? { lifts } : {}) } });
  };

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 3, total: 4 }}
      keyboard
      title={t('ob.liftsTitle')}
      headGap={22}
      bodyTop={10}
      footer={
        <>
          <Button variant="primary" size="lg" block label={t('ob.continue')} onPress={() => proceed(true)} />
          {/* The quiet second exit, exactly as the Health step has it: she may not know, and that is an answer. */}
          <Pressable accessibilityRole="button" accessibilityLabel={t('ob.liftsSkip')} onPress={() => proceed(false)} hitSlop={8}>
            <Text style={styles.skip}>{t('ob.liftsSkip')}</Text>
          </Pressable>
        </>
      }
    >
      <View style={styles.rows}>
        {ids.map((id) => {
          const name = exerciseDisplayName(id);
          return (
            <View key={id} style={styles.row}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              <View style={styles.fields}>
                <TextField
                  style={styles.weight}
                  value={typed[id]?.weight ?? ''}
                  onChangeText={(v) => set(id, 'weight', figure(v, true))}
                  placeholder={unitLabel(units)}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  maxLength={5}
                  accessibilityLabel={`${name} · ${t('ob.liftsWeight', { unit: unitLabel(units) })}`}
                  returnKeyType="done"
                />
                <Text style={styles.times}>×</Text>
                <TextField
                  style={styles.reps}
                  value={typed[id]?.reps ?? ''}
                  onChangeText={(v) => set(id, 'reps', figure(v, false))}
                  placeholder={t('ob.liftsReps')}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={2}
                  accessibilityLabel={`${name} · ${t('ob.liftsReps')}`}
                  returnKeyType="done"
                />
              </View>
            </View>
          );
        })}
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 22 },
  row: { gap: 6 },
  name: { fontFamily: font.sansSemibold, fontSize: textScale.lg, lineHeight: 26, color: color.textPrimary, textAlign: 'left' },
  fields: { flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
  weight: { flex: 3, minWidth: 0 },
  reps: { flex: 2, minWidth: 0 },
  times: { fontFamily: font.mono, fontSize: textScale.lg, lineHeight: 30, color: color.textMuted, textAlign: 'center', paddingBottom: 8 },
  skip: { fontFamily: font.sansMedium, fontSize: textScale.sm, color: color.textMuted, textAlign: 'center', paddingVertical: 13 },
});
