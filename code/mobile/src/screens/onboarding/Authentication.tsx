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
 * v7 1.1 button treatment: Apple is the CREAM primary (dark glyph + label on paper), Google
 * the dark hairline-outline secondary with cream label and no logo. The account is the action,
 * not either brand — so the two share one geometry and the design carries no platform colour.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SegmentedControl } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { setLocale, currentLocale, type Locale } from '@/i18n';
import { reloadApp } from '@/app/reload';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, space, font, textScale, tracking, trackingPx, signal, control, radius, press } from '@/design/tokens';
import { monoCanDraw } from '@/design/monoVoice';
import { SignInCanceledError, type AuthProvider } from '@/platform/auth';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'Authentication'>;

export function Authentication({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const locale = currentLocale();
  const affirm = t('ob.signinAffirm').toUpperCase();

  /**
   * LANGUAGE LIVES ON THE FRONT DOOR (founder 2026-07-12). It used to be buried in Settings,
   * which meant a Hebrew athlete read the whole of onboarding in English before discovering
   * they never had to. The switch is here, above the fold, before the first decision — and
   * because the writing DIRECTION changes with it, the app tree is remounted (reloadApp) so
   * the very next frame is already right-to-left.
   */
  async function pickLocale(next: string) {
    if (next === locale) return;
    try {
      await setLocale(next as Locale);
    } catch {
      // The language did not switch. Reloading anyway would remount the app in the OLD language
      // and read as a dead control — so do nothing, and leave the switch where it is. (Letting
      // this reject would also be an unhandled promise rejection, from a `void`-ed call.)
      return;
    }
    // Apply the new writing direction (RTL ⇄ LTR) immediately — no manual relaunch.
    reloadApp();
  }

  /** The ochre ignition: the instrument coming to life, once, under the mark. */
  const halo = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      halo.setValue(1);
      return;
    }
    Animated.timing(halo, { toValue: 1, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [halo, reduced]);

  async function onSignIn(provider: AuthProvider) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await app.signIn(provider);
      // Continuing IS the agreement (see header) — recorded before the first question.
      void app.acceptConsent();
      navigation.navigate('AboutYou');
    } catch (e) {
      if (!(e instanceof SignInCanceledError)) setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topBar}>
        <SegmentedControl
          size="pill"
          options={[{ value: 'en', label: 'EN' }, { value: 'he', label: 'עב' }]}
          value={locale}
          onChange={(v) => void pickLocale(v)}
        />
      </View>
      <View style={styles.hero}>
        {/* v7 1.1 mark: a moss ring blooms behind the cream span-bracket, and a moss dot
            rests at its centre — "line grows, ticks strike, the dot rolls home". */}
        <View style={styles.markWrap}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.halo,
              {
                opacity: halo.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 0.55, 0.5] }),
                transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
              },
            ]}
          />
          <View style={styles.bracket}>
            <View style={styles.bracketBar} />
            <View style={styles.bracketTickStart} />
            <View style={styles.bracketTickEnd} />
            <View style={styles.bracketDot} />
          </View>
        </View>
        {/* v7 1.1: just "hush" in the coach's serif — no trailing moss dot. The moss on this
            screen lives once, in the mark's halo above (the pulse ring), not after the word. */}
        <View style={styles.brand}>
          <Text style={styles.wordmark}>hush</Text>
        </View>
        {/* ONE CLAIM, NOT TWO (2026-07-17).
            This was a boast — "The best training experience in the world." — above the deal that
            earns it. Two sentences saying one thing, and the weaker one was on top: a superlative
            Hush cannot measure (R7), on the one screen the brief says "sells nothing". The deal is
            better in every way — first person, provable, and it IS the promise. So it takes the
            size the boast was wearing, and the boast is gone. */}
        <Text style={styles.promise}>{t('ob.signinTagline')}</Text>
        {/* v7 1.1: the coach's affirmation under the promise — IBM Plex Mono 500 at .22em,
            exactly as the handoff draws it. The face is chosen from the STRING: a locale mono
            cannot draw falls back to Assistant rather than breaking mid-line. */}
        <View style={styles.affirmRule} />
        <Text style={[styles.affirm, !monoCanDraw(affirm) && styles.affirmSans]}>{affirm}</Text>
      </View>
      <View style={styles.actions}>
        {error ? <Text style={styles.error}>{t('errors.general')}</Text> : null}
        {/* v7 1.1: Apple is the cream PRIMARY (dark glyph on paper); Google is the dark
            outline SECONDARY with no logo — the account is the action, not either brand. */}
        <ProviderButton
          label={t('ob.apple')}
          onPress={() => onSignIn('apple')}
          disabled={busy}
          logo={<AppleLogo color={color.onAccent} />}
          style={styles.apple}
          pressedStyle={styles.applePressed}
          labelStyle={styles.appleLabel}
        />
        <ProviderButton
          label={t('ob.google')}
          onPress={() => onSignIn('google')}
          disabled={busy}
          logo={null}
          style={styles.google}
          pressedStyle={styles.googlePressed}
          labelStyle={styles.googleLabel}
        />
        {/* The agreement, in one line, where the decision is actually made. Legible ink —
            a legal line the athlete cannot read is not consent (founder 2026-07-12). One
            weight, one tone: the handoff draws it as a single 12px muted sentence. */}
        <Text style={styles.legal}>
          {t('ob.signinLegalPre')}
          {t('ob.signinLegalTerms')}
          {t('ob.signinLegalPost')}
        </Text>
        {/* The "your data is only used for your recommendations, they are never sold" line is
            GONE (founder 2026-07-12). Nobody arrives at a training app suspecting we sell them;
            volunteering the denial is what plants the thought. The agreement above is the record;
            the promise belongs in the policy it links to, not on the front door. */}
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

/** Apple's mark exactly as the handoff draws it — 17 × 20 on a 17 × 20 box. */
function AppleLogo({ color: c }: { color: string }) {
  return (
    <Svg width={17} height={20} viewBox="0 0 17 20">
      <Path
        fill={c}
        d="M14.1 10.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.9C4.2 5 2.7 6 1.9 7.4c-1.7 2.9-.4 7.2 1.2 9.5.8 1.2 1.7 2.4 2.9 2.4 1.2 0 1.6-.8 3-.8s1.8.8 3.1.8c1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.2-.9-2.2-3.7zM11.7 3.2c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.2 1.9-1 2.9 1 .1 2-.5 2.7-1.3z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, justifyContent: 'space-between' },
  // The switch sits at the READING START of the top bar, 30px in — where the handoff puts it.
  topBar: { paddingHorizontal: 30, paddingTop: 18, alignItems: 'flex-start' },
  // One 30px rhythm down the whole hero (mark → wordmark → promise → affirmation).
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, marginTop: -20, gap: 30 },
  markWrap: { width: 180, height: 120, alignItems: 'center', justifyContent: 'center' },
  // The ignition — a moss ring that blooms once behind the mark and settles (118px).
  halo: { position: 'absolute', width: 118, height: 118, borderRadius: 59, borderWidth: 1.5, borderColor: signal[0] },
  // The span-bracket: a cream hairline between two end ticks, wider than the ring (150×26).
  bracket: { width: 150, height: 26 },
  bracketBar: { position: 'absolute', left: 0, right: 0, top: 12, height: 2, backgroundColor: color.textPrimary },
  bracketTickStart: { position: 'absolute', left: 0, top: 3, width: 2, height: 20, backgroundColor: color.textPrimary },
  bracketTickEnd: { position: 'absolute', right: 0, top: 3, width: 2, height: 20, backgroundColor: color.textPrimary },
  // The moss dot resting at the centre of the span.
  // rtl-ok — the centring idiom: `left:'50%'` then back off HALF THE DOT's width. Both halves are
  // about the dot's own geometry, not about a reading direction, so a logical margin here would
  // shift it off centre in one locale and not the other.
  bracketDot: { position: 'absolute', left: '50%', marginLeft: -6, top: 7, width: 12, height: 12, borderRadius: 6, backgroundColor: signal[0] }, // rtl-ok — centring idiom, not a reading direction
  // Brand lockup stays LTR ("hush") in every locale rather than mirroring.
  brand: { flexDirection: 'row', alignItems: 'flex-end', direction: 'ltr' },
  // v7: the wordmark is the coach's serif, 76px — matching the welcome mock.
  wordmark: { fontFamily: font.serif, fontSize: 76, lineHeight: 76, letterSpacing: trackingPx(76, tracking.display), color: color.textPrimary, textAlign: 'left' },
  /* ════ TWO LINES, BECAUSE IT IS TWO PROMISES (founder 2026-07-28) ════
     "You train. I carry the rest." is a deal with two halves — what SHE does, and what HUSH does —
     and set as one wrapped paragraph the split fell wherever the width happened to put it. Given a
     line each, the sentence keeps its own shape on every case size and the second half lands as
     the answer to the first. `maxWidth` is gone with the wrapping it existed to control; the break
     is in the copy now (`\n`), so it is the same break in every locale and at every text size. */
  promise: {
    fontFamily: font.serif,
    fontStyle: 'italic',
    fontSize: 30,
    lineHeight: 42,
    color: color.textPrimary,
    textAlign: 'center',
  },
  /* The affirmation: the mono legend voice at .22em (see `monoVoice` for the Hebrew fallback).
     It is the only CLAIM this screen makes — the whole product's argument in three words — and it
     was set at the smallest size the app has, in the faintest ink, where nobody noticed it
     (founder 2026-07-28). Up two rungs and out of the muted tone: still a legend, no longer a
     whisper. It sits under a hairline so it reads as a seal on the promise above rather than a
     stray caption. */
  affirm: {
    fontFamily: font.monoMedium,
    fontSize: textScale.sm,
    letterSpacing: trackingPx(textScale.sm, 0.22),
    textTransform: 'uppercase',
    color: color.textSecondary,
    textAlign: 'center',
  },
  // The hairline the seal rests on — as wide as the words, never a full rule across the screen.
  affirmRule: { width: 30, height: 1, backgroundColor: 'rgba(241,238,229,0.28)', marginBottom: 14 },
  // …and the sans sibling the same slot swaps to when the string is not Latin. Naming a sans
  // style here is also the contract `monoCarriesNoWords` reads: this mono slot keeps its promise.
  affirmSans: { fontFamily: font.sansMedium },
  actions: { paddingHorizontal: space.gutter, paddingBottom: 30, gap: 12 },
  error: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textSecondary, textAlign: 'center', marginBottom: 6 },

  // provider buttons — identical geometry (58px pill); Apple is the cream primary,
  // Google the dark outline secondary.
  provider: {
    height: control.hLg,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  providerPressed: { transform: [{ translateY: press.translateY }] },
  providerDisabled: { opacity: 0.4 },
  providerLabel: { fontFamily: font.sansSemibold, fontSize: 16, textAlign: 'left' },
  // Apple — the cream PRIMARY, dark glyph + label on paper.
  apple: { backgroundColor: color.accentFill },
  applePressed: { backgroundColor: color.accentFillPressed },
  /*
   * APPLE'S WHITE, NOT HUSH'S — a brand literal on purpose, exactly like Google's below.
   *
   * This read `paper[0]` until 2026-07-17, which was correct only by luck: `paper[0]` was then
   * `#fbfaf8` (95.7% — white with a hint). The READOUT redesign INVERTED the ladder — `0` stopped
   * meaning "the lightest value" and started meaning "the ground" (`#e8e5e0`, 78.6%) — and this
   * screen was never part of that pass, so Apple's mark and label quietly turned warm grey on
   * near-black, sitting directly above a pure-white Google button. On the app's front door.
   *
   * The lesson is the binding, not the hex: Apple's button is Apple's surface, and its white must
   * never move when Hush's paper moves. A Hush token here is a promise this screen cannot keep —
   * Sign in with Apple's dark variant requires a WHITE mark and label (Apple HIG), full stop.
   */
  appleLabel: { color: color.onAccent },
  // Google — the dark outline SECONDARY, cream label, no logo.
  google: { backgroundColor: color.fillSubtle, borderColor: color.borderControl },
  googlePressed: { backgroundColor: color.fillSubtleStrong },
  googleLabel: { color: color.textPrimary },

  // The legal line is READ, not decoration: one weight, one muted tone, 12px, 4px under the pair.
  legal: { fontFamily: font.sans, fontSize: textScale.xs, color: color.textMuted, textAlign: 'center', marginTop: 4, lineHeight: 18 },
});
