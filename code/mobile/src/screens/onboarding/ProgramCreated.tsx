/**
 * 4.6 Program Created — a ~2s confirmation, then auto-advance to Home. No button.
 * Builds the program (completeOnboarding), which sets the profile and flips Root
 * to the main app. A minimum dwell keeps the moment from flashing past when the
 * build is instant (fixture/offline).
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, space, heroTitle, s } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'ProgramCreated'>;

const DWELL_MS = 1900;

export function ProgramCreated({ route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const reduced = useReducedMotion();
  const { inputs } = route.params;
  const fired = useRef(false);

  useEffect(() => {
    // Build after a brief dwell so the confirmation is seen; completeOnboarding
    // sets the profile → Root swaps to Home (this screen unmounts).
    const id = setTimeout(() => {
      if (fired.current) return;
      fired.current = true;
      void app.completeOnboarding(inputs);
    }, DWELL_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <Animated.View entering={reduced ? FadeIn.duration(120) : FadeIn.duration(400)} style={styles.center}>
        <Text style={styles.title}>{t('programCreated.title')}</Text>
        <Text style={styles.subtitle}>{t('programCreated.subtitle', { days: inputs.daysPerWeek })}</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.gutter },
  title: { ...heroTitle(s(36)), color: color.textPrimary, fontSize: s(36), lineHeight: s(36) * 1.12, fontWeight: '600', textAlign: 'center' },
  subtitle: { marginTop: s(14), fontSize: s(14), color: color.textSecondary, textAlign: 'center' },
});
