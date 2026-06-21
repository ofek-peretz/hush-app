/**
 * Consent — affirmative agreement after sign-in (OD-3 / BB-33), re-skinned to the
 * design's onboarding step: legend → "Terms & privacy" → a reassurance Card →
 * Accept & continue / Decline. "I agree" records consent (versioned, idempotent)
 * and advances to NameEntry; Decline signs back out.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Card, Button } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { track } from '@/platform/telemetry';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { color, font, textScale } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'Consent'>;

export function Consent({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const [busy, setBusy] = useState(false);

  function onAgree() {
    if (busy) return;
    setBusy(true);
    void app.acceptConsent();
    navigation.navigate('NameEntry');
  }
  function onDecline() {
    if (busy) return;
    void track('consent_declined', {});
    void app.resetAccount();
    navigation.popToTop();
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      legend={t('ob.consentLegend')}
      title={t('ob.consentTitle')}
      sub={t('ob.consentSub')}
      footer={
        <>
          <Button variant="primary" size="lg" block label={t('ob.consentAccept')} onPress={onAgree} disabled={busy} />
          <Button variant="quiet" block label={t('ob.consentDecline')} onPress={onDecline} disabled={busy} />
        </>
      }
    >
      <Card pad="md">
        <View style={styles.cardRow}>
          <Icon name="shield" size={20} color={color.textSecondary} strokeWidth={2} />
          <Text style={styles.cardText}>{t('ob.consentCard')}</Text>
        </View>
      </Card>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  cardRow: { flexDirection: 'row', gap: 12 },
  cardText: { flex: 1, fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 21, color: color.textSecondary },
});
