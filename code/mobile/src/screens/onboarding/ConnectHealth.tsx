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
 *
 * ════ AND THE WRIST, WHEN THERE IS ONE (founder 2026-07-29) ════
 *
 * "If the system detects a watch, the connection to it can be added on 1.3. If it does not, it
 * does not appear on this screen at all."
 *
 * This is the earliest honest moment to say it, and saying it here is what stops the first workout
 * from happening without a watch the athlete owned the whole time. It is drawn ONLY when WCSession
 * reports a paired watch (`platform/watch/watchPresence`), so a phone with no watch never sees a
 * word about one — the screen is exactly what it was.
 *
 * IT IS A NOTICE, NOT A SECOND CARD, and the distinction is the whole design. The Health card is a
 * SWITCH: the founder's 2026-07-12 ruling is that a card here reads as a control, and a card that
 * is not one is the exact bug he rejected. There is nothing to grant for a watch — it auto-installs
 * with its companion, nothing is paired here, no permission exists — so drawing it as a second card
 * would promise a decision that does not exist. It is a ruled row: a glyph, a sentence, no
 * affordance, visibly not the object above it.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button, Switch, Legend } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { health } from '@/platform/health';
import { recordPermissionOutcome } from '@/platform/health/healthIngestion';
import { track } from '@/platform/telemetry';
import { markWristOffered, readWatchPresence, wristFace } from '@/platform/watch/watchPresence';
import * as haptics from '@/platform/haptics';
import { color, font, textScale, radius } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'ConnectHealth'>;

export function ConnectHealth({ navigation, route }: Props) {
  const { t } = useCopy();
  const sex = route.params?.sex;
  const [connected, setConnected] = useState(false);
  const [asking, setAsking] = useState(false);

  /**
   * The wrist, if there is one. Read ONCE — a watch is not paired during the four seconds this
   * screen is on the glass, and a notice that appeared mid-read would be the interruption this
   * product does not do. `route.params.previewWrist` is the gallery's seam and nothing else: the
   * harness has no WCSession, so without it this row could only ever be looked at ABSENT — which
   * is the one state it says nothing in. Never passed by the app.
   */
  const wrist = useMemo(
    () => route.params?.previewWrist ?? wristFace(readWatchPresence()),
    [route.params?.previewWrist],
  );

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
    // SHE HAS BEEN TOLD — but only if this screen actually drew the row. The flag is the one seam
    // between here and 10.4: set it and the later screen stays silent for her forever; leave it
    // unset (no watch, or WCSession did not answer in time) and 10.4 remains armed to say it the
    // first open that knows. Both exits set it, because both leave the screen having shown it.
    if (wrist) void markWristOffered();
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

      {/* THE WRIST — a ruled row, and only for someone who has one. No Pressable, no switch, no
          chevron: there is nothing here to decide, and the shape says so before the words do. */}
      {wrist ? (
        <View style={styles.wrist}>
          <Icon
            name="watch"
            size={20}
            color={wrist === 'confirm' ? color.accent : color.textSecondary}
            strokeWidth={1.8}
          />
          <Text style={styles.wristText}>
            {wrist === 'confirm' ? t('onWrist.noticeOn') : t('onWrist.noticeInstall')}
          </Text>
        </View>
      ) : null}
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
  // The wrist row — ruled off the helper above it, so it reads as a separate FACT rather than a
  // second sentence about Health. A hairline is the lightest thing that can say "and also".
  wrist: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  wristText: { flex: 1, fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: color.textPrimary, textAlign: 'left' },
  // The quiet second exit.
  skip: { fontFamily: font.sansMedium, fontSize: 14, color: color.textMuted, textAlign: 'center', paddingVertical: 4 },
});
