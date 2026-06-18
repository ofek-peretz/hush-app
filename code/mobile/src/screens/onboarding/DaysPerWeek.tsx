/**
 * 4.5 Days per week — frequency 2–6 (default 4). A vertical number column with a
 * wheel-style fade: the selection is large and white, one step away dims, two
 * steps away dims further. Continue → Program Created (assembles the full inputs).
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Eyebrow } from '@/components/Eyebrow';
import { useCopy } from '@/i18n/useCopy';
import { color, space, heroNum, tnum, press } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'DaysPerWeek'>;

const DAYS = [2, 3, 4, 5, 6];

export function DaysPerWeek({ navigation, route }: Props) {
  const { t } = useCopy();
  const { profile, goal } = route.params;
  const [days, setDays] = useState(4);

  function onContinue() {
    navigation.navigate('ProgramCreated', {
      inputs: {
        goal,
        daysPerWeek: days,
        units: 'kg',
        healthConnected: profile.healthConnected,
        age: profile.age,
        sex: profile.sex,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
      },
    });
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Eyebrow label={t('daysPerWeek.eyebrow')} size={13} trackingPx={2} align="center" style={styles.eyebrow} />
        <View style={styles.column}>
          {DAYS.map((n) => {
            const dist = Math.abs(n - days);
            const tint = dist === 0 ? color.textPrimary : dist === 1 ? '#6A6A6E' : '#46464A';
            const selected = dist === 0;
            return (
              <Pressable key={n} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setDays(n)} hitSlop={10}>
                <Text style={[styles.num, selected ? styles.selected : styles.idle, { color: tint }]}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.actions}>
        <PrimaryButton variant="compact" label={t('daysPerWeek.continue')} onPress={onContinue} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.gutter },
  eyebrow: { marginBottom: 30 },
  column: { alignItems: 'center', gap: 10 },
  num: { ...tnum },
  selected: { ...heroNum(48, -0.02), fontSize: 48, fontWeight: '600' },
  idle: { fontSize: 26, fontWeight: '500' },
  actions: { paddingHorizontal: space.gutter, paddingBottom: 40 },
});
