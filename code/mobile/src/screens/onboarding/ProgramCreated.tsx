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
 *
 * Founder 2026-07-13 — this screen is where the PROMISE is made:
 *  • It speaks the athlete's name (their own line, above the statement). We ask for it at the door
 *    and used to never say it once.
 *  • And it states the deal in the first person: from here I manage this programme, and every
 *    Saturday at 20:30 I show you what I changed and why (ob.readyBody). The Home week card no
 *    longer has to make that promise in week one — it is made here, once, at the moment it is true.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
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
  const name = inputs.name ?? app.pendingName(); // the profile is written by the CTA below
  const [phase, setPhase] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
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

  async function onDone() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      // Builds the program and writes the profile → Root swaps to Home.
      await app.completeOnboarding(inputs);
    } catch {
      // A storage failure here used to reject into the void, leaving `busy` true forever —
      // the CTA disabled, and the athlete unable to finish onboarding AT ALL. It is the last
      // screen before the app; it must always offer a way through. Let them press again.
      setBusy(false);
      setFailed(true);
    }
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
            {/* THE NAME (founder 2026-07-13). We ask for it at the door and then never say it. This
                is the moment it is for: the programme is not "a programme", it is theirs, and it is
                addressed to them. Its own line, above the statement — never inside it. */}
            {name ? <Text style={styles.readyName}>{t('common.vocative', { name: bidi(name) })}</Text> : null}
            <Text style={styles.readyTitle} accessibilityRole="header">{t('ob.readyTitle')}</Text>
            {/* "Hypertrophy focus" is GONE (founder 2026-07-12): the average athlete does not
                know the word, and a program screen is a bad place to teach it. The frequency is
                the only fact worth stating here. The ownership couplet and the shield note went
                with it — the moment the program lands is not the moment for a manifesto. */}
            <Text style={styles.readySub}>{t('ob.readySub', { days: inputs.daysPerWeek })}</Text>
            <Text style={styles.readyBody}>{t('ob.readyBody')}</Text>
          </View>
        )}
      </View>
      {ready ? (
        <View style={styles.footer}>
          {failed ? <Text style={styles.error}>{t('errors.general')}</Text> : null}
          <Button variant="primary" size="lg" block label={t('ob.readyCta')} onPress={() => void onDone()} disabled={busy} />
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
    textAlign: 'left',
  },
  buildingTitle: { fontFamily: font.sansSemibold, fontSize: textScale['2xl'], letterSpacing: trackingPx(textScale['2xl'], tracking.tight), color: color.textPrimary, marginTop: 8, marginBottom: 28, textAlign: 'left' },
  steps: { gap: 16 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepIcon: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.textTertiary },
  stepText: { fontFamily: font.sans, fontSize: textScale.base, textAlign: 'left' },

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
  readyLegend: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), color: up[0], textAlign: 'left' },
  // The name is spoken in the SPEAKING voice, a beat before the statement — not folded into it.
  readyName: {
    fontFamily: font.sans,
    fontSize: textScale.lg,
    lineHeight: 28,
    color: color.textSecondary,
    textAlign: 'center',
    marginTop: 14,
  },
  readyTitle: {
    fontFamily: font.sansSemibold,
    fontSize: textScale['3xl'],
    lineHeight: Math.round(textScale['3xl'] * 1.08),
    letterSpacing: trackingPx(textScale['3xl'], tracking.display),
    color: color.textPrimary,
    textAlign: 'center',
    marginTop: 4,
  },
  readySub: { fontFamily: font.sans, fontSize: textScale.md, lineHeight: 24, color: color.textSecondary, textAlign: 'center', marginTop: 12, maxWidth: 300 },
  readyBody: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 24, color: color.textSecondary, textAlign: 'center', marginTop: 22, maxWidth: 330 },
  footer: { paddingHorizontal: space.gutter, paddingBottom: 24, gap: 10 },
  error: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textSecondary, textAlign: 'center' },
});
