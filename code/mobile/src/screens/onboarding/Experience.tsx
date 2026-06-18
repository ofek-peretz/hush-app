/**
 * Experience — one choice between Goal and Days per week. Training experience is the
 * single biggest input to the cold-start starting weight, so we ask it explicitly
 * (one screen, low friction). Beginner / Intermediate / Advanced, each with a short
 * description. Continue → Days per week, carrying the gathered draft.
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
import type { Experience as ExperienceT } from '@/data/local/models';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'Experience'>;

const OPTIONS: { value: ExperienceT; key: string; descKey: string }[] = [
  { value: 'beginner', key: 'experience.beginner', descKey: 'experience.beginnerDesc' },
  { value: 'intermediate', key: 'experience.intermediate', descKey: 'experience.intermediateDesc' },
  { value: 'advanced', key: 'experience.advanced', descKey: 'experience.advancedDesc' },
];

export function Experience({ navigation, route }: Props) {
  const { t } = useCopy();
  const { profile, goal } = route.params;
  const [experience, setExperience] = useState<ExperienceT>('intermediate');

  function onContinue() {
    void track('experience_selected', { experience });
    navigation.navigate('DaysPerWeek', { profile, goal, experience });
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Eyebrow label={t('experience.eyebrow')} size={16} trackingPx={1.5} align="center" style={styles.eyebrow} />
        <View style={styles.list}>
          {OPTIONS.map((o) => {
            const selected = o.value === experience;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setExperience(o.value)}
                style={({ pressed }) => [
                  styles.option,
                  selected ? styles.optionSelected : styles.optionIdle,
                  { opacity: pressed ? press.opacity : 1 },
                ]}
              >
                <Text style={[styles.optionLabel, selected ? styles.labelSelected : styles.labelIdle]}>
                  {t(o.key)}
                </Text>
                <Text style={styles.optionDesc}>{t(o.descKey)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.actions}>
        <PrimaryButton variant="compact" label={t('experience.continue')} onPress={onContinue} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: space.gutter },
  eyebrow: { marginBottom: s(30), color: color.textSecondary },
  list: { gap: s(12) },
  option: { borderRadius: radius.card, paddingVertical: s(16), paddingHorizontal: s(18), alignItems: 'center' },
  optionSelected: { backgroundColor: color.surface2, borderWidth: 1.5, borderColor: color.textPrimary },
  optionIdle: { borderWidth: 0.5, borderColor: color.border },
  optionLabel: { ...heroTitle(s(19)), fontSize: s(19), lineHeight: s(24) },
  labelSelected: { color: color.textPrimary, fontWeight: '600' },
  labelIdle: { color: color.textSecondary, fontWeight: '400' },
  optionDesc: { fontSize: s(13), color: color.textSecondary, marginTop: s(5), textAlign: 'center' },
  actions: { paddingHorizontal: space.gutter, paddingBottom: 40 },
});
