/**
 * 4.4 Goal — one choice. Eyebrow + three single-select options (Build Muscle
 * selected by default = white fill) + Continue. Stored; influences split
 * generation. Continue → Days per week.
 *
 * Spec labels map to the frozen model Goal values (training engine unchanged):
 * Build Muscle → build_muscle · Increase Strength → get_stronger ·
 * Stay Consistent → general_fitness.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Eyebrow } from '@/components/Eyebrow';
import { useCopy } from '@/i18n/useCopy';
import { track } from '@/platform/telemetry';
import { color, space, radius, press, heroTitle, s } from '@/design/tokens';
import type { Goal as GoalT } from '@/data/local/models';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'Goal'>;

const OPTIONS: { goal: GoalT; key: string }[] = [
  { goal: 'build_muscle', key: 'goal.buildMuscle' },
  { goal: 'get_stronger', key: 'goal.increaseStrength' },
  { goal: 'general_fitness', key: 'goal.stayConsistent' },
];

export function Goal({ navigation, route }: Props) {
  const { t } = useCopy();
  const { profile } = route.params;
  const [goal, setGoal] = useState<GoalT>('build_muscle'); // default selected (§4.4)

  function onContinue() {
    void track('goal_selected', { goal });
    navigation.navigate('DaysPerWeek', { profile, goal });
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Eyebrow label={t('goal.eyebrow')} size={16} trackingPx={1.5} align="center" style={styles.eyebrow} />
        <View style={styles.list}>
          {OPTIONS.map((o) => {
            const selected = o.goal === goal;
            return (
              <Pressable
                key={o.goal}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setGoal(o.goal)}
                style={({ pressed }) => [
                  styles.option,
                  selected ? styles.optionSelected : styles.optionIdle,
                  { opacity: pressed ? press.opacity : 1 },
                ]}
              >
                <Text style={[styles.optionLabel, selected ? styles.labelSelected : styles.labelIdle]}>
                  {t(o.key)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.actions}>
        <PrimaryButton variant="compact" label={t('goal.continue')} onPress={onContinue} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: space.gutter },
  eyebrow: { marginBottom: s(30), color: color.textSecondary },
  list: { gap: s(12) },
  option: { borderRadius: radius.card, paddingVertical: s(18), alignItems: 'center' },
  // Selected = a highlighted dark chip with a white outline (NOT a solid-white fill —
  // that read as a second Continue button). Continue stays the only solid-white element.
  optionSelected: { backgroundColor: color.surface2, borderWidth: 1.5, borderColor: color.textPrimary },
  optionIdle: { borderWidth: 0.5, borderColor: color.border },
  // Premium display finish (§2.2): tight tracking on the choice labels.
  optionLabel: { ...heroTitle(s(19)), fontSize: s(19), lineHeight: s(24) },
  labelSelected: { color: color.textPrimary, fontWeight: '600' },
  labelIdle: { color: color.textSecondary, fontWeight: '400' },
  actions: { paddingHorizontal: space.gutter, paddingBottom: 40 },
});
