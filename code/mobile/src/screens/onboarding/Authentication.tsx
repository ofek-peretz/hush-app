/**
 * Authentication (§4.1) — the front door. The "hush·" wordmark centred with the
 * product line, then Continue with Apple and Continue with Google, and the legal line.
 * Sells nothing.
 *
 * MERGED WITH CONSENT (founder 2026-07-12). There was a whole screen between the front
 * door and the first real question whose only job was to say "terms and privacy". That is
 * a speed bump, not a step — every serious product records agreement AT the sign-in with
 * one line beneath the buttons. Consent is still affirmative, still versioned, still
 * idempotent (OD-3 / BB-33): pressing a provider button IS the agreement, `acceptConsent()`
 * records it the moment the provider returns, and the line above the buttons says so before
 * a finger lands on one. On success → NameEntry.
 *
 * The provider buttons follow the PLATFORM's brand guidelines, not ours (founder 2026-07-12):
 * Apple is black with a white mark; Google is white with the four-colour G and a hairline.
 * Painting Apple in the Hush ochre and leaving Google plain white read as a preference for
 * Apple users — and neither is what Apple's or Google's sign-in guidelines permit. Neither
 * button is the primary action here; the ACCOUNT is.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HushMark } from '@/components/HushMark';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { color, space, font, textScale, tracking, trackingPx, signal, control, radius, ink, paper, press } from '@/design/tokens';
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
      // Continuing IS the agreement (see header) — recorded before the first question.
      void app.acceptConsent();
      navigation.navigate('NameEntry');
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
        <ProviderButton
          label={t('ob.apple')}
          onPress={() => onSignIn('apple')}
          disabled={busy}
          logo={<AppleLogo color={paper[0]} />}
          style={styles.apple}
          pressedStyle={styles.applePressed}
          labelStyle={styles.appleLabel}
        />
        <ProviderButton
          label={t('ob.google')}
          onPress={() => onSignIn('google')}
          disabled={busy}
          logo={<GoogleG />}
          style={styles.google}
          pressedStyle={styles.googlePressed}
          labelStyle={styles.googleLabel}
        />
        {/* The agreement, in one line, where the decision is actually made. Legible ink —
            a legal line the athlete cannot read is not consent (founder 2026-07-12). */}
        <Text style={styles.legal}>
          {t('ob.signinLegalPre')}
          <Text style={styles.legalStrong}>{t('ob.signinLegalTerms')}</Text>
          {t('ob.signinLegalPost')}
        </Text>
      </View>
    </SafeAreaView>
  );
}

/** A platform sign-in button. Both providers get the SAME geometry, weight and icon size —
 *  only the platform's own colours differ, so neither reads as the favoured path. */
function ProviderButton({
  label,
  logo,
  onPress,
  disabled,
  style,
  pressedStyle,
  labelStyle,
}: {
  label: string;
  logo: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  style: object;
  pressedStyle: object;
  labelStyle: object;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.provider,
        style,
        pressed && !disabled && styles.providerPressed,
        pressed && !disabled && pressedStyle,
        disabled && styles.providerDisabled,
      ]}
    >
      {logo}
      <Text numberOfLines={1} style={[styles.providerLabel, labelStyle]}>
        {label}
      </Text>
    </Pressable>
  );
}

function AppleLogo({ color: c, size = 19 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={c}
        d="M16.365 1.43c0 1.14-.46 2.22-1.21 3.01-.81.85-2.13 1.51-3.23 1.42-.13-1.09.43-2.25 1.13-2.98.79-.83 2.18-1.45 3.31-1.45zM20.5 17.06c-.55 1.27-.81 1.84-1.52 2.96-.99 1.56-2.39 3.5-4.12 3.51-1.54.02-1.93-1-4.02-.99-2.09.01-2.52 1.01-4.06.99-1.73-.02-3.05-1.77-4.04-3.33C-.07 16.99-.32 12.16 1.4 9.59c1.22-1.83 3.15-2.9 4.96-2.9 1.84 0 3 .99 4.52.99 1.48 0 2.38-.99 4.51-.99 1.61 0 3.32.88 4.54 2.39-3.99 2.19-3.34 7.89.07 8.98z"
      />
    </Svg>
  );
}

function GoogleG({ size = 19 }: { size?: number }) {
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
  // Brand lockup stays LTR ("Hush·") in every locale rather than mirroring.
  brand: { flexDirection: 'row', alignItems: 'flex-end', direction: 'ltr' },
  brandSpacing: { marginTop: 18 },
  wordmark: { fontFamily: font.sansSemibold, fontSize: 44, letterSpacing: trackingPx(44, tracking.display), color: color.textPrimary },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: signal[0], marginLeft: 4, marginBottom: 9 }, // rtl-ok: inside LTR brand lockup
  tagline: { fontFamily: font.sans, fontSize: textScale.md, lineHeight: 24, color: color.textSecondary, textAlign: 'center', marginTop: 16, maxWidth: 290 },
  actions: { paddingHorizontal: space.gutter, paddingBottom: 32, gap: 10 },
  error: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textSecondary, textAlign: 'center', marginBottom: 6 },

  // provider buttons — identical geometry, platform-native colour
  provider: {
    height: control.hLg,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  providerPressed: { transform: [{ translateY: press.translateY }] },
  providerDisabled: { opacity: 0.4 },
  providerLabel: { fontFamily: font.sansSemibold, fontSize: textScale.md, letterSpacing: trackingPx(textScale.md, tracking.tight) },
  apple: { backgroundColor: ink[0] },
  applePressed: { backgroundColor: '#000000' },
  appleLabel: { color: paper[0] },
  google: { backgroundColor: '#ffffff', borderColor: color.borderControl },
  googlePressed: { backgroundColor: color.fillSubtle },
  googleLabel: { color: ink[0] },

  // The legal line is READ, not decoration: secondary ink, not the near-invisible tertiary.
  legal: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'center', marginTop: 10, lineHeight: 19 },
  legalStrong: { fontFamily: font.sansSemibold, color: color.textSecondary },
});
