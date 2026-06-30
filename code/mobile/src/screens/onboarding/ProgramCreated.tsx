/**
 * Program Created (§4.6) — re-skinned to the design's "build" step. A calm,
 * sequenced "Building your program" with four steps, then a "Ready" confirmation:
 * "{focus} focus · {days} sessions a week." The CTA runs completeOnboarding
 * (selfEnroll + generateProgram + profile), which flips Root to Home.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { color, space, font, textScale, tracking, trackingPx, up, signal } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'ProgramCreated'>;

export function ProgramCreated({ route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const { inputs } = route.params;
  const [phase, setPhase] = useState(0);
  const [busy, setBusy] = useState(false);

  // Cosmetic, sequenced reveal (the real build runs on the CTA → completeOnboarding).
  useEffect(() => {
    const marks = [700, 1400, 2100, 2800];
    const timers = marks.map((ms, i) => setTimeout(() => setPhase(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, []);

  const steps = [t('ob.buildStep1'), t('ob.buildStep2'), t('ob.buildStep3'), t('ob.buildStep4')];
  const ready = phase >= 4;
  // Hush is hypertrophy-first for everyone — the focus is fixed, no longer chosen in onboarding.
  const focus = t('ob.focusHypertrophy');

  function onDone() {
    if (busy) return;
    setBusy(true);
    void app.completeOnboarding(inputs); // sets profile → Root swaps to Home
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.body}>
        {!ready ? (
          <>
            <Text style={styles.legend}>{t('ob.buildLegend')}</Text>
            <Text style={styles.buildingTitle}>{t('ob.buildTitle')}</Text>
            <View style={styles.steps}>
              {steps.map((s, i) => (
                <View key={i} style={[styles.stepRow, { opacity: i <= phase ? 1 : 0.32 }]}>
                  <View style={styles.stepIcon}>
                    {i < phase ? (
                      <Icon name="check" size={18} color={up[0]} strokeWidth={2.4} />
                    ) : i === phase ? (
                      <ActivityIndicator size="small" color={signal[0]} />
                    ) : (
                      <View style={styles.dot} />
                    )}
                  </View>
                  <Text style={[styles.stepText, { color: i <= phase ? color.textPrimary : color.textMuted }]}>{s}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <>
            <View style={styles.readyRow}>
              <Icon name="checkCircle" size={20} color={up[0]} strokeWidth={2} />
              <Text style={styles.readyLegend}>{t('ob.readyLegend')}</Text>
            </View>
            <Text style={styles.readyTitle}>{t('ob.readyTitle')}</Text>
            <Text style={styles.readySub}>{t('ob.readySub', { focus, days: inputs.daysPerWeek })}</Text>
            {/* the philosophy in one sentence — given its own weight (handoff §1/§9) */}
            <Text style={styles.readyOwnership}>{t('ob.readyOwnership')}</Text>
            <View style={styles.readyNote}>
              <Icon name="shield" size={16} color={up[0]} strokeWidth={2} />
              <Text style={styles.readyNoteText}>{t('ob.readyNote')}</Text>
            </View>
          </>
        )}
      </View>
      {ready ? (
        <View style={styles.footer}>
          <Button variant="primary" size="lg" block label={t('ob.readyCta')} onPress={onDone} disabled={busy} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  legend: {
    fontFamily: font.sansMedium,
    fontSize: textScale['2xs'],
    letterSpacing: trackingPx(textScale['2xs'], tracking.legend),
    textTransform: 'uppercase',
    color: color.textMuted,
  },
  buildingTitle: { fontFamily: font.sansSemibold, fontSize: textScale['2xl'], letterSpacing: trackingPx(textScale['2xl'], tracking.tight), color: color.textPrimary, marginTop: 8, marginBottom: 28 },
  steps: { gap: 16 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepIcon: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.textTertiary },
  stepText: { fontFamily: font.sans, fontSize: textScale.base },

  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  readyLegend: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: up[0] },
  readyTitle: { fontFamily: font.sansSemibold, fontSize: textScale['3xl'], lineHeight: textScale['3xl'] * 1.05, letterSpacing: trackingPx(textScale['3xl'], tracking.display), color: color.textPrimary, marginTop: 16 },
  readySub: { fontFamily: font.sans, fontSize: textScale.md, lineHeight: 24, color: color.textSecondary, marginTop: 14, maxWidth: 300 },
  readyOwnership: { fontFamily: font.sansSemibold, fontSize: textScale.lg, lineHeight: 26, letterSpacing: trackingPx(textScale.lg, tracking.tight), color: color.textPrimary, marginTop: 16, maxWidth: 320 },
  readyNote: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginTop: 18, maxWidth: 320 },
  readyNoteText: { flex: 1, fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 20, color: color.textSecondary },
  footer: { paddingHorizontal: space.gutter, paddingBottom: 24 },
});
