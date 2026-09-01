/**
 * Authentication (§4.1) — THE CLOSER since 2026-09-01 (audit lever 3, decided under the founder's
 * grant). It was the front door, and the audit's charge stood: an account wall before any value is
 * the one pattern Duolongo/Whoop-class onboarding refuses, and the entire intake was device-local
 * anyway — nothing needed an account until the moment there was a programme to KEEP. So the walk
 * is now anonymous end-to-end, and this screen stands between the Ready screen and Home: the
 * wordmark, the promise, "your programme is built — an account keeps it", the two providers, the
 * legal line. Sells nothing, still; but now it closes instead of gatekeeping.
 *
 * MERGED WITH CONSENT (founder 2026-07-12). There was a whole screen between the front
 * door and the first real question whose only job was to say "terms and privacy". That is
 * a speed bump, not a step — every serious product records agreement AT the sign-in with
 * one line beneath the buttons. Consent is still affirmative, still versioned, still
 * idempotent (OD-3 / BB-33): pressing a provider button IS the agreement, `acceptConsent()`
 * records it the moment the provider returns, and the line above the buttons says so before
 * a finger lands on one. On success → `Start`, the fork. (This line said `NameEntry` until
 * 2026-08-12 — a screen deleted long before — and then `AboutYou` for an afternoon, until bringing
 * your own programme became a screen of its own rather than a line under a button.)
 *
 * v7 1.1 button treatment: Apple is the CREAM primary (dark glyph + label on paper), Google
 * the dark hairline-outline secondary with cream label and no logo. The account is the action,
 * not either brand — so the two share one geometry and the design carries no platform colour.
 *
 * ── ⛔ APPLE AND GOOGLE ONLY, AND IT IS A DECISION (founder 2026-08-12) ──────────────────────────
 * There is no email path and there will not be one. Two reasons, and the second is the real one:
 *
 *   · Apple's own rule (App Store 4.8) requires Sign in with Apple wherever a third-party login is
 *     offered, so the pair is the smallest set that ships at all.
 *   · An email account is a PASSWORD, and a password is a support surface — reset mail, a lockout,
 *     a screen for choosing one — none of which this product would do well, and all of which would
 *     stand between her and a programme. Two buttons and no field is the whole front door.
 *
 * ⚠️ THE COST IS REAL AND IT IS ACCEPTED: an athlete with neither account cannot use Hush. That is
 * a small number of people and a large amount of surface, and it is written down here so nobody has
 * to re-derive it from the absence of a text field.
 *
 * ── THE SEQUENCE ────────────────────────────────────────────────────────────────────────────────
 * The hero ARRIVES rather than appearing: mark, wordmark, promise, affirmation, then the buttons,
 * in reading order at one step apart (`components/ds/Arrive`). Everything is home in under 700 ms.
 */

// 

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Arrive } from '@/components/ds';
import * as Haptics from 'expo-haptics';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { setLocale, currentLocale, type Locale } from '@/i18n';
import { reloadApp } from '@/app/reload';
import { useReducedMotion } from '@/platform/reducedMotion';
import { FREE_SESSION_LIMIT } from '@/domain/entitlement';
import { LegalSheet } from '@/components/LegalSheet';
import { color, space, font, textScale, tracking, trackingPx, signal, control, radius, press, motion } from '@/design/tokens';
import { legendVoice } from '@/design/monoVoice';
import { SignInCanceledError, type AuthProvider } from '@/platform/auth';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'Authentication'>;

export function Authentication({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState(false);
  /**
   * ⛔ WHAT WENT WRONG, NOT THAT SOMETHING DID (founder 2026-08-12).
   *
   * This was a boolean behind `errors.general` — *"Something went wrong. Try again."* — which is the
   * sentence every app on the phone shows and the reason none of them are believed. The three things
   * that actually happen here are different problems with different answers: she has no signal, the
   * provider declined, or she backed out (which is not a failure and says nothing at all).
   */
  const [failed, setFailed] = useState<null | 'network' | 'apple' | 'google'>(null);
  const locale = currentLocale();
  const affirm = t('ob.signinAffirm').toUpperCase();
  /*
   * ⛔ THE FACE SWAPPED AND THE TRACKING DID NOT — ON THE FIRST SCREEN OF THE APP (2026-08-26).
   *
   * This slot has asked the STRING which face to use since it was built (`affirmSans`), and then
   * merged that answer on top of a style still carrying `.22em`. So the product's one claim —
   * the only thing this screen asserts — was drawn to a Hebrew reader as
   * `כ ל  מ ש ק ל  מ ס ט  ש ה ר מ ת`: a sentence spelled out letter by letter, at the top of the
   * funnel, on the screen that has to earn the download.
   *
   * `Legend` fixed exactly this on 2026-08-21 and the fix stayed inside `Legend`. It is one shared
   * question now (`legendVoice`), and `noTrackedHebrew` in `lint-rtl` stops it being asked twice.
   */
  /* ⚠️ SIZED AT `md`, NOT `sm` — see the style. The tracking is computed from the size it is
     actually drawn at, or the two drift and Latin gets the wrong track. */
  const affirmVoice = legendVoice(affirm, textScale.md, 0.22);

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
  /* The legal sheet — consent may not point at nothing (founder 2026-09-01). */
  const [legalOpen, setLegalOpen] = useState(false);
  useEffect(() => {
    if (reduced) {
      halo.setValue(1);
      return;
    }
    Animated.timing(halo, { toValue: 1, duration: motion.dur.bloom, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [halo, reduced]);

  async function onSignIn(provider: AuthProvider) {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    /*
     * ⚠️ THE ONE HAPTIC ON THIS SCREEN, and it fires on the PRESS rather than on the result. It is
     * the acknowledgement that the tap landed, on a button whose work then takes a system sheet and
     * a network round trip — the beat Apple puts under every primary action for exactly this reason.
     * Best-effort: a device without a taptic engine is not an error.
     */
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await app.signIn(provider);
      // Continuing IS the agreement (see header) — recorded before anything is written.
      void app.acceptConsent();
      /*
       * ════ THE WALL MOVED BEHIND THE AHA (2026-09-01, audit lever 3 — decided) ════
       * This screen is the CLOSER now, reached from the Ready screen's save-CTA. Success hands
       * her back to the programme she just watched being built; ProgramCreated notices the
       * account on focus and finishes the enrolment itself. The fallback hop survives for the
       * one path that can still land here without a parent (a stale deep link).
       */
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.navigate('Start');
    } catch (e) {
      /*
       * ⛔ A CANCELLED SIGN-IN IS SILENT, AND THAT IS THE RULE THIS BRANCH EXISTS FOR. She pressed
       * Apple, read the sheet, and changed her mind — telling her that "something went wrong" would
       * be the app arguing with a decision she just made.
       */
      if (e instanceof SignInCanceledError) return;
      const offline = /network|offline|timeout|connect/i.test(String((e as Error)?.message ?? ''));
      setFailed(offline ? 'network' : provider === 'apple' ? 'apple' : 'google');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      {/*
        ⛔ A WORD, NOT A SWITCH (founder 2026-08-12: *"כל משפט צריך להיות אייקוני ומדויק"*).
        It was a segmented pill — `EN | עב` — which is a SETTINGS idiom, and it was the only object
        on a ceremonial screen that looked like a form control. It also asked her to read her own
        language as an abbreviation in a typeface chosen for numbers.

        The offer is one thing, so it is one word, in the language it would switch TO — the way a
        person offers it. Nothing to parse: an English reader sees "עברית", a Hebrew reader sees
        "English", and the word IS the button.
      */}
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={locale === 'he' ? 'English' : 'עברית'}
          hitSlop={16}
          onPress={() => void pickLocale(locale === 'he' ? 'en' : 'he')}
          style={({ pressed }) => [styles.langSwap, pressed && styles.langSwapPressed]}
        >
          <Text style={styles.langSwapText}>{locale === 'he' ? 'English' : 'עברית'}</Text>
        </Pressable>
      </View>
      <View style={styles.hero}>
        {/* v7 1.1 mark: a moss ring blooms behind the cream span-bracket, and a moss dot
            rests at its centre — "line grows, ticks strike, the dot rolls home". */}
        <Arrive order={0} style={[styles.markWrap, styles.markLockup]}>
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
        </Arrive>
        {/* v7 1.1: just "hush" in the coach's serif — no trailing moss dot. The moss on this
            screen lives once, in the mark's halo above (the pulse ring), not after the word. */}
        <Arrive order={1} style={[styles.brand, styles.brandLockup]}>
          <Text style={styles.wordmark}>hush</Text>
        </Arrive>
        {/* ONE CLAIM, NOT TWO (2026-07-17).
            This was a boast — "The best training experience in the world." — above the deal that
            earns it. Two sentences saying one thing, and the weaker one was on top: a superlative
            Hush cannot measure (R7), on the one screen the brief says "sells nothing". The deal is
            better in every way — first person, provable, and it IS the promise. So it takes the
            size the boast was wearing, and the boast is gone. */}
        <Arrive order={2} style={styles.promiseLockup}><Text style={styles.promise}>{t('ob.signinTagline')}</Text></Arrive>
        {/* v7 1.1: the coach's affirmation under the promise — IBM Plex Mono 500 at .22em,
            exactly as the handoff draws it. The face is chosen from the STRING: a locale mono
            cannot draw falls back to Assistant rather than breaking mid-line. */}
        {/*
          ⛔ THE HAIRLINE OVER THE AFFIRMATION IS DELETED (2026-08-26, the elevation pass).

          It was 30 × 1 points of cream, meant as *"a seal on the promise above rather than a stray
          caption"*. Read on glass at the real size it is the opposite: a floating dash with nothing
          either side of it, the only fragment on a screen otherwise made of whole objects. The
          affirmation is already a different register — different face, different size, different
          ink, thirty points of air — and none of those needed a rule to be seen.

          The app's own copy law, arriving in a graphic: *a label that explains a control steals its
          job; delete, don't shorten.* A rule that separates a line from a line is that label.
        */}
        <Arrive order={3}>
          <Text
            /* ⚠️ `affirmSans` STAYS BEFORE THE INLINE OBJECT. `monoCarriesNoWords` reads this style
               expression with a regex that stops at the first `}`, and its escape hatch is seeing a
               sans key in it — so a non-Latin fallback declared AFTER an inline object is invisible
               to the law that exists to require one. The two keys set different properties, so the
               order is free; being legible to the law is not. */
            style={[styles.affirm, !affirmVoice.latin && styles.affirmSans, { letterSpacing: affirmVoice.letterSpacing }]}
          >
            {affirm}
          </Text>
        </Arrive>
        {/* ⛔ THE VALUE, BEFORE THE WALL (founder 2026-09-01 · F5). The front door asked for an
            account before showing anything but a slogan — and the one hesitation everyone brings
            to that wall is "what will this cost me". One measured fact answers it: the fourteen
            free sessions, from the same constant the trial actually runs on. No extra screen, no
            demo mode — the door itself carries the reason to walk through it. */}
        {/* THE REASON SHE IS HERE (2026-09-01): the programme is already built and on screen one
            step back — the account is what keeps it hers. Stated as a fact, like everything. */}
        <Arrive order={4}>
          <Text style={styles.trialFact}>{t('ob.signinSaveFact')}</Text>
        </Arrive>
        <Arrive order={5}>
          <Text style={styles.trialFact}>{t('ob.signinTrialFact', { n: FREE_SESSION_LIMIT })}</Text>
        </Arrive>
      </View>
      <Arrive order={6} style={styles.actions}>
        {failed ? (
          <Text style={styles.error}>
            {t(failed === 'network' ? 'ob.signinFailedNetwork' : failed === 'apple' ? 'ob.signinFailedProvider' : 'ob.signinFailedGoogle')}
          </Text>
        ) : null}
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
          logo={<GoogleLogo />}
          style={styles.google}
          pressedStyle={styles.googlePressed}
          labelStyle={styles.googleLabel}
        />
        {/* The agreement, in one line, where the decision is actually made. Legible ink —
            a legal line the athlete cannot read is not consent (founder 2026-07-12). One
            weight, one tone: the handoff draws it as a single 12px muted sentence. */}
        {/* ⛔ THE ONLY TWO WORDS THAT MUST BE PRESSABLE, MADE PRESSABLE (design review 2026-09-01).
            "תנאי השימוש והפרטיות" was dead text — consent pointing at a document she cannot open
            fails her and App Review alike. The phrase is a link now (underlined, one ink up), and
            the whole line is the touch target so 44pt is met without growing the type. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('ob.signinLegalTerms')}
          hitSlop={10}
          /* ⛔ IN-APP, NOT A URL (founder 2026-09-01): the document she consents to opens HERE,
             readable, in her language — an external link was the interim and a dead one was the
             bug. `LegalSheet` carries the actual terms + privacy text from the copy pack. */
          onPress={() => setLegalOpen(true)}
          style={styles.legalPress}
        >
          <Text style={styles.legal}>
            {t('ob.signinLegalPre')}
            <Text style={styles.legalLink}>{t('ob.signinLegalTerms')}</Text>
            {t('ob.signinLegalPost')}
          </Text>
        </Pressable>
        {/* The "your data is only used for your recommendations, they are never sold" line is
            GONE (founder 2026-07-12). Nobody arrives at a training app suspecting we sell them;
            volunteering the denial is what plants the thought. The agreement above is the record;
            the promise belongs in the policy it links to, not on the front door. */}
      </Arrive>
          {legalOpen ? <LegalSheet onClose={() => setLegalOpen(false)} /> : null}
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
/**
 * The four-colour G — Google's own sign-in mark (design review 2026-09-01). Apple's button carried
 * its apple while Google's carried nothing: an asymmetry that reads as carelessness, and Google's
 * brand guidelines ask for the G on sign-in buttons. Path data is the standard identity asset.
 */
function GoogleLogo() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

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
  // The offer sits at the READING START of the top bar, 30px in — where the handoff puts it.
  topBar: { paddingHorizontal: 30, paddingTop: 18, alignItems: 'flex-start' },
  /* The language offer: a word with a hairline under it, so it reads as something to press without
     wearing the chrome of a control. Muted — it is the one thing on this screen that is not the
     decision she came to make. */
  /*
   * ⛔ IT WEARS A CAPSULE NOW (2026-08-26). The note below argues, rightly, that this is a WORD and
   * not a switch — and then dressed it as nothing at all: bare cream type in the corner of an
   * otherwise empty screen, which reads as a debug label rather than an offer. The app has one
   * vocabulary for a small quiet control (a cream wash at the pill radius) and it is used on every
   * other screen; wearing it here costs the word nothing and stops it looking like a leftover.
   */
  langSwap: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.fillSubtle,
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.14)',
  },
  /* Same law as everywhere else: a press is a WASH under the word, never a fade of it (A.13). */
  langSwapPressed: { backgroundColor: color.fillSubtleStrong },
  /**
   * ⛔ THE ONLY UNDERLINE IN THE APP, AND IT IS GONE (2026-08-21).
   *
   * `textDecorationLine: 'underline'` appeared exactly once in `src` — here, on the first screen an
   * athlete ever sees. An underline is a WEB affordance; this product's vocabulary for "you may press
   * this" is cream in the light, a hairline, or a wash under the finger, and it uses those everywhere
   * else. One rule under one word made the first object on the first screen look like a hyperlink.
   *
   * ⚠️ THE DECISION ABOVE IT STANDS — it is still a WORD and not a switch, for the reason the note at
   * the markup gives. What changed is only how it says it is pressable.
   *
   * ⚠️ AND IT GOT BRIGHTER, NOT QUIETER. Dropping the rule from a muted grey would have left the one
   * way a Hebrew speaker escapes an English screen almost invisible. In the light it carries its own
   * affordance, and at 13 pt beside a 60 pt wordmark it competes with nothing.
   */
  langSwapText: {
    fontFamily: font.sansMedium,
    fontSize: textScale.sm,
    color: color.textPrimary,
    textAlign: 'left',
  },
  /*
   * ⛔ THE 30px RHYTHM WAS FOUR EQUAL GAPS BETWEEN FOUR UNEQUAL THINGS (2026-08-26).
   *
   * Even spacing is what makes a group read as a LIST. This is not a list — it is a mark, its
   * wordmark, the promise they make, and the seal under it, and the eye should read one object.
   *
   * So the rhythm is graded the way the meaning is: the mark and the word are a LOCKUP and sit
   * close (18); the promise is what they say, one register out (34); the affirmation is a different
   * voice again and takes the most air (34). Same total height, one object instead of four.
   */
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, marginTop: -20 },
  markLockup: { marginBottom: 18 },
  brandLockup: { marginBottom: 34 },
  promiseLockup: { marginBottom: 34 },
  markWrap: { width: 180, height: 120, alignItems: 'center', justifyContent: 'center' },
  // The ignition — a moss ring that blooms once behind the mark and settles (118px).
  /* borderWidth 1.5 → 2 (design review 2026-09-01): at 0.5 opacity a 1.5 hairline ring is nearly
     invisible on glass, and on this screen the mark IS the personality. */
  halo: { position: 'absolute', width: 118, height: 118, borderRadius: 59, borderWidth: 2, borderColor: signal[0] },
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
  /* ⚠️ NO `letterSpacing` HERE. It is supplied at the call site from `legendVoice`, because it is
     an answer about the STRING and a StyleSheet cannot see one. See the note there. */
  /*
   * ⛔ 17 → 18, TO OUTRANK THE LEGAL LINE (2026-08-26).
   *
   * The type floor made `sm` and `xs` the same number, so the product's ONE CLAIM and the consent
   * fine print were being set at the identical size — separated only by ink. On the screen that has
   * to earn the download, the claim has to be the larger of the two, and `md` is the next rung the
   * scale actually has.
   */
  affirm: {
    fontFamily: font.monoMedium,
    fontSize: textScale.md,
    textTransform: 'uppercase',
    color: color.textSecondary,
    textAlign: 'center',
  },
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
  providerLabel: { fontFamily: font.sansSemibold, fontSize: 17, textAlign: 'left' },
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
  /*
   * ⛔ GOOGLE IS A TRUE OUTLINE NOW — NO FILL (2026-08-26).
   *
   * It carried BOTH a 5% cream fill and a 16% cream border, which on absolute black is the muddiest
   * of the three options available: too faint to read as a surface, too faint to read as an edge.
   * On glass it looks like a dark box that failed to load, directly under a cream slab that looks
   * finished — so the PAIR reads as one button and one mistake rather than a primary and a
   * secondary.
   *
   * Transparent ground, a real hairline, cream label. The rank is then unmistakable — light versus
   * line — and the press obeys the app's own law that *a press changes the SURFACE*: the fill
   * arrives under the finger instead of the edge dimming.
   */
  google: { backgroundColor: 'transparent', borderColor: 'rgba(241,238,229,0.26)' },
  googlePressed: { backgroundColor: color.fillSubtleStrong, borderColor: 'rgba(241,238,229,0.34)' },
  googleLabel: { color: color.textPrimary },

  // The legal line is READ, not decoration: one weight, one muted tone, 12px, 4px under the pair.
  legalPress: { marginTop: 4, minHeight: 44, justifyContent: 'center' },
  trialFact: { fontFamily: font.sansMedium, fontSize: 17, lineHeight: 22, color: color.textSecondary, textAlign: 'center', marginTop: 18 },
  legal: { fontFamily: font.sans, fontSize: textScale.xs, color: color.textMuted, textAlign: 'center', lineHeight: 18 },
  legalLink: { color: color.textSecondary, textDecorationLine: 'underline' }, // rtl-ok: nested span, inherits the centred line
});
