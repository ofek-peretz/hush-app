/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE CALL — where the intake conversation used to be.
 *
 * ⛔ FOUNDER, 2026-08-04: *"take the chat out of the front door… my model from the start was to be
 * the SPOTIFY of the fitness world."*
 *
 * The intake was a chat because the coach had to gather everything itself. It does not any more: six
 * facts come off a form and two come from her own words, so there is nothing left to ask. This
 * screen makes ONE call and hands her a programme.
 *
 * ── ⚠️ THE WAIT IS THE PRODUCT HERE, NOT AN INTERRUPTION ────────────────────────────────────────
 * A real build takes 14–20 seconds. That is a long time to look at a spinner, and the founder said
 * so directly: *"the loading looks very static right now."*
 *
 * So this does not show progress it cannot measure — a percentage would be a lie, and a bar that
 * fills at a made-up rate is the same lie with better manners. It shows WHAT IS BEING CONSIDERED, in
 * her own facts, one line at a time: her days, her minutes, what she said she is training for. The
 * wait becomes evidence that something is being done WITH what she typed, which is the only honest
 * thing a wait can be.
 *
 * ⚠️ THE LINES ARE HERS, NOT DECORATION. Every one is a value she gave two screens ago. A generic
 * "analysing your goals…" is exactly the AI-app noise the founder is trying to get away from.
 *
 * ── WHEN IT FAILS ───────────────────────────────────────────────────────────────────────────────
 * It says so and offers to try again. It NEVER invents a programme locally: the coach is the only
 * decider, and a fallback week would be the engine coming back through a side door.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { askCoach } from '@/platform/coach/coachClient';
import { coachFacts } from '@/domain/coachFacts';
import { coachRequest } from '@/domain/coachPrompt';
import { COACH_DECISION_SCHEMA, parseCoachPlan } from '@/domain/coachPlan';
import { currentLocale } from '@/i18n';
import { color, font } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'BuildingProgramme'>;

/** How long each considered line holds before the next replaces it. */
const LINE_MS = 2600;

export function BuildingProgramme({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const { inputs } = route.params;
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  /*
   * WHAT IS BEING CONSIDERED — her own answers, in order. Never a generic stage name: the whole
   * point is that she recognises every line as something she typed.
   */
  const lines = [
    t('ob.buildingDays', { n: inputs.daysPerWeek }),
    t('ob.buildingMinutes', { n: inputs.workoutMinutes ?? 60 }),
    ...(inputs.goalText ? [t('ob.buildingFor', { what: inputs.goalText })] : []),
    ...(inputs.limitsText ? [t('ob.buildingAround', { what: inputs.limitsText })] : []),
  ];
  const [line, setLine] = useState(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    const id = setInterval(() => {
      fade.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.quad) }, () => {
        fade.value = withTiming(1, { duration: 260 });
      });
      // Held, not looped past the end: the last fact stays up rather than starting the list again,
      // which would read as a stall dressed up as activity.
      setTimeout(() => setLine((i) => Math.min(i + 1, lines.length - 1)), 260);
    }, LINE_MS);
    return () => clearInterval(id);
  }, [fade, lines.length]);

  const lineStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const build = useCallback(async () => {
    setFailed(false);
    try {
      // The profile has to exist before the sheet can be built from it — this is the moment
      // onboarding's answers become an athlete.
      await app.completeOnboarding(inputs);
      const profile = await db.loadProfile();
      if (!profile) { setFailed(true); return; }
      const facts = coachFacts({ profile, plan: null, history: [], language: currentLocale() });
      const reply = await askCoach(
        coachRequest({ facts, ask: { kind: 'first_programme' } }),
        COACH_DECISION_SCHEMA as unknown as Record<string, unknown>,
      );
      if (!reply.ok) { setFailed(true); return; }
      const parsed = parseCoachPlan(reply.text);
      if (!parsed.ok || !parsed.answer.plan) { setFailed(true); return; }
      await db.recordCoachAnswer(parsed.answer, new Date().toISOString());
      navigation.replace('ProgramCreated', { inputs });
    } catch {
      setFailed(true);
    }
  }, [app, inputs, navigation]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void build();
  }, [build]);

  return (
    <OnboardingScaffold
      progress={{ index: 7, total: 7 }}
      legend={t(failed ? 'ob.buildingFailedLegend' : 'ob.buildingLegend')}
      title={t(failed ? 'ob.buildingFailedTitle' : 'ob.buildingTitle')}
      headGap={32}
      footer={
        failed ? (
          <Button variant="primary" size="lg" block label={t('ob.buildingRetry')} onPress={() => void build()} />
        ) : undefined
      }
    >
      {failed ? (
        <Text style={styles.failed}>{t('ob.buildingFailedSub')}</Text>
      ) : (
        <Animated.View style={[styles.considering, lineStyle]}>
          <Text style={styles.line}>{lines[line]}</Text>
        </Animated.View>
      )}
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  considering: { marginTop: 8 },
  // The coach's own italic serif — this is it thinking out loud, not the app reporting a status.
  line: {
    fontFamily: font.serif,
    fontStyle: 'italic',
    fontSize: 22,
    lineHeight: 32,
    color: color.textSecondary,
    textAlign: 'left',
  },
  failed: {
    fontFamily: font.sans,
    fontSize: 16,
    lineHeight: 25,
    color: color.textSecondary,
    textAlign: 'left',
  },
});
