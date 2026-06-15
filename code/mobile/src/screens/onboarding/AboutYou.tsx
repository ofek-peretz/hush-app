/**
 * 1.5 About You — Screen A of two (Age + Sex). Split from the former single
 * four-wheel screen so the AGE field can never sit below the fold and be missed
 * (spec §1.5, §10.16). Two wheels only: both are always above the fold. Height +
 * Weight follow on Screen B (AboutYouBody). Sensible mid-range defaults are
 * pre-populated so a force-quit still generates a program.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Wheel } from '@/components/Wheel';
import { useCopy } from '@/i18n/useCopy';
import { color, layout, type as typo } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'AboutYou'>;

const SEX = [0, 1]; // 0=female, 1=male
const AGES = range(14, 90);

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

export function AboutYou({ navigation, route }: Props) {
  const { t } = useCopy();
  const { healthConnected, goal, daysPerWeek } = route.params;
  const [age, setAge] = useState(30);
  const [sex, setSex] = useState(1);

  function onContinue() {
    navigation.navigate('AboutYouBody', {
      healthConnected,
      goal,
      daysPerWeek,
      age,
      sex: sex === 1 ? 'male' : 'female',
    });
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Row label="Age">
          <Wheel values={AGES} selected={age} onChange={setAge} />
        </Row>
        <Row label="Sex">
          <Wheel values={SEX} selected={sex} onChange={setSex} format={(v) => (v === 1 ? 'Male' : 'Female')} />
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
