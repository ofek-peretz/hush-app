/**
 * Connect Health (v7 1.3) — offer HealthKit.
 *
 * Founder 2026-07-12 (critical): the Apple Health card looked like STATIC INFORMATION —
 * no affordance at all — so the athlete read it as a notice rather than a choice, and the
 * real decision hid in the buttons below. The card now IS the control: a Switch that reads
 * the granted state and, when flipped on, runs the system permission flow right there.
 *
 * v7 1.3: the icon is the moss ACTIVITY waveform (health is a signal, not a heart); the card's
 * fine print is a mono legend — "HR · KCAL · KM — DISPLAY ONLY" — stating what flows and, in
 * caps, that it never decides. A sans helper line under the card carries the law in words, and
 * the footer holds BOTH exits: Continue (paper) and a quiet "Skip for now" ghost.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button, Switch, Legend } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { health } from '@/platform/health';
import { recordPermissionOutcome } from '@/platform/health/healthIngestion';
import { track } from '@/platform/telemetry';
import * as haptics from '@/platform/haptics';
import { color, font, textScale, radius } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'ConnectHealth'>;

export function ConnectHealth({ navigation, route }: Props) {
  const { t } = useCopy();
  const sex = route.params?.sex;
  const [connected, setConnected] = useState(false);
  const [asking, setAsking] = useState(false);

  async function toggle() {
    // Off → on: run the real system flow. On → off is not ours to revoke (iOS only allows
    // that from system Settings), so the switch simply stops claiming a connection.
    if (connected) {
      setConnected(false);
      return;
    }
    if (asking) return;
    setAsking(true);
    try {
      const granted = await health.requestPermission();
      recordPermissionOutcome(granted, (type, data) => void track(type, data));
      setConnected(granted);
      if (granted) haptics.success();
    } catch {
      // HealthKit refused to even ask (unavailable, or the system sheet failed). Health stays
      // off — it is optional by design — and the athlete moves on.
      setConnected(false);
    } finally {
      // ALWAYS: a throw here used to leave `asking` true, which disabled the only button on
      // the screen. Onboarding must never be a dead end.
      setAsking(false);
    }
  }

  function proceed(withHealth: boolean) {
    if (!withHealth) void track('health_skipped', {});
    navigation.navigate('ManualInfo', { healthConnected: withHealth, sex });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 2, total: 4 }}
      legend={t('ob.healthLegend')}
      title={t('ob.healthTitle')}
      voice={t('ob.healthSub')}
      headGap={32}
      footer={
        <>
          <Button
            variant="primary"
            size="lg"
            block
            label={t('ob.continue')}
            onPress={() => proceed(connected)}
            disabled={asking}
          />
          {/* The quiet second exit — leaves Health off, moves on. A ghost, not a button. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('ob.healthSkip')}
            onPress={() => proceed(false)}
            disabled={asking}
            hitSlop={8}
          >
            <Text style={styles.skip}>{t('ob.healthSkip')}</Text>
          </Pressable>
        </>
      }
    >
      {/* The card IS the switch — pressing anywhere on it flips Health. */}
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: connected }}
        accessibilityLabel={t('ob.healthCardTitle')}
        onPress={() => void toggle()}
        disabled={asking}
        style={({ pressed }) => [styles.card, connected && styles.cardOn, pressed && styles.cardPressed]}
      >
        {/* v7: the ACTIVITY waveform, always moss — health is a signal the app shows, not a
            verdict. It never changes colour with the toggle. */}
        <View style={styles.iconBox}>
          <Icon name="activity" size={23} color={color.accent} strokeWidth={1.8} />
        </View>
        <View style={styles.info}>
          <Text style={styles.title}>{t('ob.healthCardTitle')}</Text>
          {/* The fine print is a mono legend — what flows, and in caps that it never decides. */}
          <Legend size={12.5} track={0} weight="regular" tone="onStage" style={styles.sub}>
            {connected ? t('ob.healthCardOn') : t('ob.healthCardSub')}
          </Legend>
        </View>
        {/* The switch is the card's STATE, drawn — not a second control. The card above is the
            one Pressable and the one accessibility element; nesting a live Switch inside it
            would announce two switches to VoiceOver and give the athlete two hit targets for
            one decision. */}
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
          <Switch size="lg" checked={connected} onChange={() => void toggle()} accessibilityLabel={t('ob.healthCardTitle')} />
        </View>
      </Pressable>

      {/* v7 helper line — the law in words, under the card, sans. */}
      <Text style={styles.helper}>{t('ob.healthHelper')}</Text>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.card,
    backgroundColor: color.surface,
  },
  cardOn: { borderColor: color.up, backgroundColor: color.upWash },
  cardPressed: { backgroundColor: color.fillSubtle },
  // v7: 46 × 46, radius 14, a subtle paper wash behind the moss waveform.
  iconBox: { width: 46, height: 46, borderRadius: 14, backgroundColor: color.fillSubtleStrong, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.sansSemibold, fontSize: 16, color: color.textPrimary, textAlign: 'left' },
  sub: { color: color.textSecondary, marginTop: 3 },
  // The law in words, under the card.
  helper: { fontFamily: font.sans, fontSize: 14, lineHeight: 22, color: color.textSecondary, marginTop: 18, textAlign: 'left' },
  // The quiet second exit.
  skip: { fontFamily: font.sansMedium, fontSize: 14, color: color.textMuted, textAlign: 'center', paddingVertical: 4 },
});
