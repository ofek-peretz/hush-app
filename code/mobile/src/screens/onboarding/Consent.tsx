/**
 * Consent — affirmative agreement after sign-in, before onboarding (founder
 * directive 2026-06-18; OD-3 / BB-33). One calm statement; "I agree" records the
 * consent (versioned, server-idempotent) and advances to Connect Health.
 *
 * Not one of the 31 prototype screens, so it follows the spec's design system
 * (true black, one statement, the single white button) rather than a bespoke look.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextAction } from '@/components/TextAction';
import { track } from '@/platform/telemetry';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { color, space, heroTitle, s } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'Consent'>;

export function Consent({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const [busy, setBusy] = useState(false);

  function onAgree() {
    if (busy) return;
    setBusy(true);
    // Recording consent is best-effort and MUST NOT block the flow (the server
    // record is idempotent and retried later). Fire it and advance immediately so
    // "I agree" feels instant — awaiting a slow network here read as a dead button.
    void app.acceptConsent();
    navigation.navigate('ConnectHealth');
  }

  // Consent is required to use Hush (OD-3 / BB-33). Declining can't proceed into
  // the app, so it signs back out — RESET returns to the sign-in screen, where
  // they can reconsider. No data was recorded (consent was never given).
  function onDecline() {
    if (busy) return;
    void track('consent_declined', {});
    // Consent is required: declining signs back out AND returns to the sign-in
    // screen. resetAccount alone doesn't move the navigator (no profile exists yet,
    // so Root stays on the onboarding stack) — that left the screen "stuck", so we
    // explicitly pop to the first onboarding screen (Authentication).
    void app.resetAccount();
    navigation.popToTop();
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Text style={styles.title}>{t('consent.title')}</Text>
        <Text style={styles.copy}>{t('consent.body')}</Text>
      </View>
      <View style={styles.actions}>
        <PrimaryButton variant="compact" label={t('consent.agree')} onPress={onAgree} disabled={busy} />
        <View style={styles.decline}>
          <TextAction label={t('consent.decline')} onPress={onDecline} />
        </View>
        <Text style={styles.legal}>{t('consent.legal')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: space.gutter },
  title: { ...heroTitle(s(28)), color: color.textPrimary, fontSize: s(28), fontWeight: '600', marginBottom: s(16) },
  copy: { fontSize: s(15), lineHeight: s(15) * 1.6, color: color.textSecondary },
  actions: { paddingHorizontal: space.gutter, paddingBottom: 40 },
  decline: { marginTop: s(8), alignItems: 'center' },
  legal: { marginTop: s(16), fontSize: s(12), color: color.textTertiary, textAlign: 'center' },
});
