/**
 * Connect Health (§4.2) — offer HealthKit.
 *
 * Founder 2026-07-12 (critical): the Apple Health card looked like STATIC INFORMATION —
 * no affordance at all — so the athlete read it as a notice rather than a choice, and the
 * real decision hid in the buttons below. The card now IS the control: a Switch that reads
 * the granted state and, when flipped on, runs the system permission flow right there. The
 * footer stops asking a second time — once Health is on (or deliberately left off), one
 * button carries the outcome forward.
 *
 * Progress 2 / 4.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button, Switch } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { health } from '@/platform/health';
import { recordPermissionOutcome } from '@/platform/health/healthIngestion';
import { track } from '@/platform/telemetry';
import * as haptics from '@/platform/haptics';
import { color, font, textScale, radius, up } from '@/design/tokens';
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

  function onContinue() {
    if (!connected) void track('health_skipped', {});
    navigation.navigate('ManualInfo', { healthConnected: connected, sex });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 2, total: 4 }}
      legend={t('ob.healthLegend')}
      title={t('ob.healthTitle')}
      sub={t('ob.healthSub')}
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          label={connected ? t('ob.continue') : t('ob.healthSkip')}
          onPress={onContinue}
          disabled={asking}
        />
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
        <View style={styles.iconBox}>
          <Icon name="heart" size={22} color={connected ? up[0] : color.textSecondary} strokeWidth={2} />
        </View>
        <View style={styles.info}>
          <Text style={styles.title}>{t('ob.healthCardTitle')}</Text>
          <Text style={styles.sub}>{connected ? t('ob.healthCardOn') : t('ob.healthCardSub')}</Text>
        </View>
        {/* The switch is the card's STATE, drawn — not a second control. The card above is the
            one Pressable and the one accessibility element; nesting a live Switch inside it
            would announce two switches to VoiceOver and give the athlete two hit targets for
            one decision. */}
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
          <Switch checked={connected} onChange={() => void toggle()} accessibilityLabel={t('ob.healthCardTitle')} />
        </View>
      </Pressable>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: color.borderControl,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  cardOn: { borderColor: up[0], backgroundColor: color.upWash },
  cardPressed: { backgroundColor: color.fillSubtle },
  iconBox: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: color.fillSubtle, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.sansSemibold, fontSize: textScale.base, color: color.textPrimary, textAlign: 'left' },
  sub: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, marginTop: 2, textAlign: 'left' },
});
