/**
 * Program Created (§4.6) — the "build" step. A sequenced "Building your program" with
 * four steps, then the "Ready" confirmation. The CTA runs completeOnboarding
 * (selfEnroll + generateProgram + profile), which flips Root to Home.
 *
 * Founder 2026-07-12:
 *  • Each step LANDS. A completed step fires a light tick against the wrist as its check
 *    stamps in — the athlete feels the machine working rather than watching a spinner.
 *    This is the only place in onboarding where Hush is visibly doing something, so it
 *    has to be felt.
 *  • The steps ahead sat at 0.32 opacity — effectively invisible, so the list read as one
 *    line rather than a plan. They now hold real presence and the CONTRAST between pending
 *    and landed does the work.
 *  • Ready is a celebration, so it is composed like one: the block is centred (the top half
 *    of the screen was dead white space) and the check is a real mark — a sage seal — not a
 *    20px glyph on a screen that just said "your program is built".
 *  • The CTA said "Go to my next workout". It is the athlete's FIRST workout; nothing is
 *    "next" yet.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import * as haptics from '@/platform/haptics';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, space, font, textScale, tracking, trackingPx, up, signal } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'ProgramCreated'>;

export function ProgramCreated({ route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const { inputs } = route.params;
  const [phase, setPhase] = useState(0);
  const [busy, setBusy] = useState(false);
  const reduced = useReducedMotion();

  // Cosmetic, sequenced reveal (the real build runs on the CTA → completeOnboarding).
  useEffect(() => {
    const marks = [700, 1400, 2100, 2800];
    const timers = marks.map((ms, i) => setTimeout(() => setPhase(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, []);

  // Every landed step is FELT — a light tick as the check stamps in, the double pulse
  // when the build resolves.
  const lastPhase = useRef(0);
  useEffect(() => {
    if (phase === lastPhase.current || phase === 0) return;
    lastPhase.current = phase;
    if (phase >= 4) haptics.success();
    else haptics.tick();
  }, [phase]);

  const ready = phase >= 4;

  // The ready seal draws itself in — something settling, not popping.
  const seal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!ready) return;
    if (reduced) {
      seal.setValue(1);
      return;
    }
    Animated.timing(seal, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [ready, reduced, seal]);

  const steps = [t('ob.buildStep1'), t('ob.buildStep2'), t('ob.buildStep3'), t('ob.buildStep4')];
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
              {steps.map((s, i) => {
                const done = i < phase;
                const running = i === phase;
                return (
                  <View key={i} style={styles.stepRow}>
                    <View style={styles.stepIcon}>
                      {done ? (
                        <Icon name="check" size={18} color={up[0]} strokeWidth={2.4} />
                      ) : running ? (
                        <ActivityIndicator size="small" color={signal[0]} />
                      ) : (
                        <View style={styles.dot} />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.stepText,
                        // Landed = ink. Running = ink. Ahead = a real, readable grey — present
                        // enough to be a plan, quiet enough not to compete.
                        { color: done || running ? color.textPrimary : color.textMuted },
                      ]}
                    >
                      {s}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        ) : (
          <View style={styles.readyBlock}>
            <Animated.View
              style={[
                styles.seal,
                { opacity: seal, transform: [{ scale: seal.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }] },
              ]}
            >
              <Icon name="check" size={34} color={up[0]} strokeWidth={2.6} />
            </Animated.View>
            <Text style={styles.readyLegend}>{t('ob.readyLegend').toUpperCase()}</Text>
            <Text style={styles.readyTitle} accessibilityRole="header">{t('ob.readyTitle')}</Text>
            <Text style={styles.readySub}>{t('ob.readySub', { focus, days: inputs.daysPerWeek })}</Text>
            {/* the philosophy in one sentence — given its own weight (handoff §1/§9) */}
            <Text style={styles.readyOwnership}>{t('ob.readyOwnership')}</Text>
            <View style={styles.readyNote}>
              <Icon name="shield" size={16} color={up[0]} strokeWidth={2} />
              <Text style={styles.readyNoteText}>{t('ob.readyNote')}</Text>
            </View>
          </View>
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

  // ready — one centred block; the mark leads it
  readyBlock: { alignItems: 'center' },
  seal: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: up[0],
    backgroundColor: color.upWash,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  readyLegend: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), color: up[0] },
  readyTitle: {
    fontFamily: font.sansSemibold,
    fontSize: textScale['3xl'],
    lineHeight: Math.round(textScale['3xl'] * 1.08),
    letterSpacing: trackingPx(textScale['3xl'], tracking.display),
    color: color.textPrimary,
    textAlign: 'center',
    marginTop: 12,
  },
  readySub: { fontFamily: font.sans, fontSize: textScale.md, lineHeight: 24, color: color.textSecondary, textAlign: 'center', marginTop: 12, maxWidth: 300 },
  readyOwnership: {
    fontFamily: font.sansSemibold,
    fontSize: textScale.lg,
    lineHeight: 26,
    letterSpacing: trackingPx(textScale.lg, tracking.tight),
    color: color.textPrimary,
    textAlign: 'center',
    marginTop: 22,
    maxWidth: 320,
  },
  readyNote: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginTop: 22, maxWidth: 320 },
  readyNoteText: { flex: 1, fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 20, color: color.textSecondary },
  footer: { paddingHorizontal: space.gutter, paddingBottom: 24 },
});
