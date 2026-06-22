/**
 * Authentication (§4.1) — the front door, re-skinned to the design sign-in: the
 * "hush·" wordmark centred with the product line, then Continue with Apple
 * (primary) and Continue with Google (secondary), and a calm legal line. Sells
 * nothing. On success → Consent.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/ds';
import { HushMark } from '@/components/HushMark';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { color, space, font, textScale, tracking, trackingPx, signal } from '@/design/tokens';
import { SignInCanceledError, type AuthProvider } from '@/platform/auth';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'Authentication'>;

export function Authentication({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function onSignIn(provider: AuthProvider) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await app.signIn(provider);
      navigation.navigate('Consent');
    } catch (e) {
      if (!(e instanceof SignInCanceledError)) setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.hero}>
        <HushMark size={46} />
        <View style={[styles.brand, styles.brandSpacing]}>
          <Text style={styles.wordmark}>hush</Text>
          <View style={styles.dot} />
        </View>
        <Text style={styles.tagline}>{t('ob.signinTagline')}</Text>
      </View>
      <View style={styles.actions}>
        {error ? <Text style={styles.error}>{t('errors.general')}</Text> : null}
        <Button
          variant="primary"
          size="lg"
          block
          label={t('ob.apple')}
          leading={<AppleLogo color={color.onAccent} />}
          onPress={() => onSignIn('apple')}
          disabled={busy}
        />
        <Button
          variant="secondary"
          size="lg"
          block
          label={t('ob.google')}
          leading={<GoogleG />}
          onPress={() => onSignIn('google')}
          disabled={busy}
        />
        <Text style={styles.legal}>{t('ob.signinLegal')}</Text>
      </View>
    </SafeAreaView>
  );
}

function AppleLogo({ color: c, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={c}
        d="M16.365 1.43c0 1.14-.46 2.22-1.21 3.01-.81.85-2.13 1.51-3.23 1.42-.13-1.09.43-2.25 1.13-2.98.79-.83 2.18-1.45 3.31-1.45zM20.5 17.06c-.55 1.27-.81 1.84-1.52 2.96-.99 1.56-2.39 3.5-4.12 3.51-1.54.02-1.93-1-4.02-.99-2.09.01-2.52 1.01-4.06.99-1.73-.02-3.05-1.77-4.04-3.33C-.07 16.99-.32 12.16 1.4 9.59c1.22-1.83 3.15-2.9 4.96-2.9 1.84 0 3 .99 4.52.99 1.48 0 2.38-.99 4.51-.99 1.61 0 3.32.88 4.54 2.39-3.99 2.19-3.34 7.89.07 8.98z"
      />
    </Svg>
  );
}

function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <Path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <Path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z" />
      <Path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  brand: { flexDirection: 'row', alignItems: 'flex-end' },
  brandSpacing: { marginTop: 18 },
  wordmark: { fontFamily: font.sansSemibold, fontSize: 44, letterSpacing: trackingPx(44, tracking.display), color: color.textPrimary },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: signal[0], marginLeft: 4, marginBottom: 9 },
  tagline: { fontFamily: font.sans, fontSize: textScale.md, lineHeight: 24, color: color.textSecondary, textAlign: 'center', marginTop: 16, maxWidth: 290 },
  actions: { paddingHorizontal: space.gutter, paddingBottom: 32, gap: 10 },
  error: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textSecondary, textAlign: 'center', marginBottom: 6 },
  legal: { fontFamily: font.sans, fontSize: textScale.xs, color: color.textTertiary, textAlign: 'center', marginTop: 6, lineHeight: 18 },
});
