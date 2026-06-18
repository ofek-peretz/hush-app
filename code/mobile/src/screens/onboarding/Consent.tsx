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
import { color, space, heroTitle } from '@/design/tokens';
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
    setBusy(true);
    void track('consent_declined', {});
    void app.resetAccount();
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
  title: { ...heroTitle(28), color: color.textPrimary, fontSize: 28, fontWeight: '600', marginBottom: 16 },
  copy: { fontSize: 15, lineHeight: 15 * 1.6, color: color.textSecondary },
  actions: { paddingHorizontal: space.gutter, paddingBottom: 40 },
  decline: { marginTop: 8, alignItems: 'center' },
  legal: { marginTop: 16, fontSize: 12, color: color.textTertiary, textAlign: 'center' },
});
