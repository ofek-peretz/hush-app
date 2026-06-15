/**
 * 1.1 Enrollment (operator-mediated; ratified 2026-06-14). Begin the
 * relationship. Zero friction, zero persuasion. Athletes enter ONLY through an
 * issued invite token — no public registration, no self-service account
 * creation, no social login. v1 optimizes for controlled enrollment and clean
 * validation data.
 *
 * The token is minted out-of-band by the operator (backend POST /internal/
 * athletes) and delivered to the athlete; this screen intakes and validates it.
 * An invite can also arrive via a deep link (hush://enroll?token=…), prefilled.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextAction } from '@/components/TextAction';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { color, layout, type as typo } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'Enrollment'>;

function tokenFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[?&]token=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function Enrollment({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  // Prefill from a deep-link invite (hush://enroll?token=…) — cold start AND a
  // warm link arriving while this screen is open.
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      const t0 = tokenFromUrl(url);
      if (t0) setToken(t0);
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      const t0 = tokenFromUrl(url);
      if (t0) setToken(t0);
    });
    return () => sub.remove();
  }, []);

  async function onContinue() {
    if (busy || token.trim().length === 0) return;
    setBusy(true);
    setError(false);
    try {
      await app.enrollWithToken(token); // success flips Root → Home
    } catch {
      setError(true); // the one sanctioned error line (§5.1)
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Text style={styles.instruction}>{t('enrollment.instruction')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('enrollment.placeholder')}
          placeholderTextColor={color.textTertiary}
          value={token}
          onChangeText={(v) => {
            setToken(v);
            if (error) setError(false); // the line never persists past the next attempt (§5.1)
          }}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        {/* Revocation explanation persists until a new invite is entered (§5.1
            allows one calm line; this is a real, rare event worth its own moment). */}
        {app.revoked && !error ? <Text style={styles.error}>{t('enrollment.revoked')}</Text> : null}
        {error ? <Text style={styles.error}>{t('errors.general')}</Text> : null}
      </View>
      <View style={styles.actions}>
        <PrimaryButton label={t('enrollment.continue')} onPress={onContinue} disabled={busy} />
        <View style={styles.gap} />
        <TextAction label={t('enrollment.legal')} onPress={() => {}} />
        {__DEV__ ? (
          <>
            <View style={styles.gap} />
            <TextAction label="DEV · continue without backend" onPress={() => navigation.navigate('ConnectHealth')} />
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: layout.screenMargin },
  instruction: { color: color.textPrimary, fontSize: typo.titleL.size, fontWeight: typo.titleL.weight, lineHeight: typo.titleL.lineHeight, marginBottom: 24 },
  input: { backgroundColor: color.bgSurface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: color.textPrimary, fontSize: typo.bodyL.size },
  error: { color: color.textSecondary, fontSize: typo.bodyM.size, marginTop: 16 },
  actions: { paddingHorizontal: layout.screenMargin, paddingBottom: 32 },
  gap: { height: 12 },
});
