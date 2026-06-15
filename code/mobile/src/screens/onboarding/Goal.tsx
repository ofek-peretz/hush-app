/**
 * 1.3 Goal. Capture intent in one tap. No Continue button — selection is the
 * action (spec §1.3, §3.2). Rows (frozen, user-ratified): Get Stronger /
 * Build Muscle / General Fitness. No selected resting state; tap fades forward.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCopy } from '@/i18n/useCopy';
import { track } from '@/platform/telemetry';
import { color, layout, press, type as typo } from '@/design/tokens';
import type { Goal as GoalT } from '@/data/local/models';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'Goal'>;

const ROWS: { goal: GoalT; key: string }[] = [
  { goal: 'get_stronger', key: 'goal.getStronger' },
  { goal: 'build_muscle', key: 'goal.buildMuscle' },
  { goal: 'general_fitness', key: 'goal.generalFitness' },
];

export function Goal({ navigation, route }: Props) {
  const { t } = useCopy();
  const { healthConnected } = route.params;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.list}>
        {ROWS.map((r) => (
          <Pressable
            key={r.goal}
            accessibilityRole="button"
            onPress={() => { void track('goal_selected', { goal: r.goal }); navigation.navigate('DaysPerWeek', { healthConnected, goal: r.goal }); }}
            style={({ pressed }) => [styles.row, { opacity: pressed ? press.opacity : 1 }]}
          >
            <Text style={styles.label}>{t(r.key)}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase, justifyContent: 'center' },
  list: { paddingHorizontal: layout.screenMargin },
  row: { minHeight: 64, justifyContent: 'center' },
  label: { color: color.textPrimary, fontSize: typo.titleL.size, fontWeight: typo.titleL.weight },
});
