/**
 * 1.5 About You — Screen B of two (Height + Weight). Terminal onboarding screen
 * on the no-Health path: finalizes the profile (carrying Age + Sex from Screen A)
 * and generates the program (spec §1.5, §10.16). Two wheels only, both above the
 * fold. Sensible mid-range defaults so a force-quit still produces a program.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Wheel } from '@/components/Wheel';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { color, layout, type as typo } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'AboutYouBody'>;

const HEIGHTS = range(140, 210); // cm
const WEIGHTS = range(40, 160); // kg

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

export function AboutYouBody({ route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const { goal, daysPerWeek, age, sex } = route.params;
  const [height, setHeight] = useState(172);
  const [weight, setWeight] = useState(75);

  async function onContinue() {
    await app.completeOnboarding({
      goal,
      daysPerWeek,
      units: 'kg',
      healthConnected: false,
      sex,
      age,
      heightCm: height,
      weightKg: weight,
    });
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Row label="Height">
          <Wheel values={HEIGHTS} selected={height} onChange={setHeight} format={(v) => `${v} cm`} />
        </Row>
        <Row label="Weight">
          <Wheel values={WEIGHTS} selected={weight} onChange={setWeight} format={(v) => `${v} kg`} />
        </Row>
      </View>
      <View style={styles.actions}>
        <PrimaryButton label={t('aboutYou.continue')} onPress={onContinue} />
      </View>
    </SafeAreaView>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: layout.screenMargin },
  row: { marginBottom: 24 },
  rowLabel: { color: color.textSecondary, fontSize: typo.caption.size, marginBottom: 4 },
  actions: { paddingHorizontal: layout.screenMargin, paddingBottom: 32 },
});
