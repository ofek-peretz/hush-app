/**
 * Connect Health (v7 1.3) — offer HealthKit.
 *
 * Founder 2026-07-12 (critical): the Apple Health card looked like STATIC INFORMATION —
 * no affordance at all — so the athlete read it as a notice rather than a choice, and the
 * real decision hid in the buttons below. The card now IS the control: a Switch that reads
 * the granted state and, when flipped on, runs the system permission flow right there.
 *
 * v7 1.3: the icon is the moss ACTIVITY waveform (health is a signal, not a heart); the card's
 * fine print is a mono legend stating what flows, and the footer holds BOTH exits: Continue (paper)
 * and a quiet "Skip for now" ghost.
 *
 * ⚠️ THERE IS NO HELPER LINE UNDER THE CARD ANY MORE, and this paragraph promised one for six days
 * after the founder deleted it (2026-08-12; his words are quoted at the scaffold below). Nothing on
 * this screen states the law in words now — `ob.healthHelper` and `ob.healthSub` stand unrendered in
 * the locale, held there by `appMatchesEngine`'s guard. The law itself did not move an inch: it is
 * kept by `healthIngestion`, which may propose a BODYWEIGHT for display and never touches a lifting
 * load or the model. Enforcement is the promise; the sentence was only ever a report of it.
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

// 

import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button, Legend } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import * as Localization from 'expo-localization';
import { unitsForDevice } from '@/domain/unitsForDevice';
import { health } from '@/platform/health';
import { recordPermissionOutcome } from '@/platform/health/healthIngestion';
import { track } from '@/platform/telemetry';
import { FUNNEL_EVENTS } from '@/platform/events';
import { markWristOffered, readWatchPresence, wristFace } from '@/platform/watch/watchPresence';
import * as haptics from '@/platform/haptics';
import { color, font, textScale, radius } from '@/design/tokens';
import type { OnboardingInputs } from '@/data/local/models';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'ConnectHealth'>;

export function ConnectHealth({ navigation, route }: Props) {
  const { t } = useCopy();
  /* ⛔ FUNNEL (2026-08-23): one event per step REACHED — see `FUNNEL_EVENTS`. The last step that asks
     a question with an answer; the one after it asks who writes the week. */
  React.useEffect(() => {
    void track(FUNNEL_EVENTS.healthReached);
  }, []);
  /*
   * ⚠️ THIS SCREEN STILL READS NONE OF HER ANSWERS — it only FORWARDS them, in one place.
   *
   * Nine of them were once unpacked at the top of this file and never touched again, which reads as
   * "a permission screen with a bodyweight in scope" and invites exactly what the ratified law
   * forbids. They stay out of scope; `proceed` reaches into `route.params` at the single moment the
   * relay is sealed, and nothing here looks at a value it is not carrying forward.
   */
  const [connected, setConnected] = useState(false);
  /**
   * ════ THE SCREEN FLICKERS WHEN THE TOGGLE IS PRESSED (founder C.1) ════
   *
   * This was `useState`, and every press SET IT TRUE AND THEN FALSE — two renders — while the
   * value was wired to `disabled` on the card, on Continue and on Skip. So the whole screen's
   * chrome stepped into its disabled state and straight back out. On the common path it never
   * even waits: iOS shows the HealthKit sheet at most ONCE per app, so after the first answer
   * `requestAuthorization` resolves immediately and the round trip is a frame or two. That is
   * the millisecond he saw.
   *
   * The flag's only real job is re-entrancy — one press must not start two permission flows —
   * and a ref does that without a render. Nothing on the screen needs to look different for a
   * round trip that either returns instantly or is covered by a system sheet anyway.
   */
  const asking = useRef(false);

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
    if (asking.current) return;
    asking.current = true;
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
      asking.current = false;
    }
  }

  function proceed(withHealth: boolean) {
    if (!withHealth) void track('health_skipped', {});
    // SHE HAS BEEN TOLD — but only if this screen actually drew the row. The flag is the one seam
    // between here and 10.4: set it and the later screen stays silent for her forever; leave it
    // unset (no watch, or WCSession did not answer in time) and 10.4 remains armed to say it the
    // first open that knows. Both exits set it, because both leave the screen having shown it.
    if (wrist) void markWristOffered();
    /*
     * ⛔ THIS IS NO LONGER THE LAST STEP (founder 2026-08-10). The step that shapes the week is —
     * the body map until 2026-08-29, the BUILDER since. Health sat last because the step after it
     * was a coach, and a permission ask is a fine thing to put in front of a conversation and a poor
     * thing to put in front of a PROGRAMME. Ending on "may I read your heart rate" and then handing
     * her a programme puts the dullest question in the product between her and what she came for.
     *
     * ⛔ AND THE ASSEMBLY OF `OnboardingInputs` COMES BACK HERE (2026-08-29), whole.
     *
     * It moved to the body map on 2026-08-10 under the rule that the LAST answering step builds the
     * object. The last answering step is now the builder, and the builder has THREE ways out — build
     * one for me, a blank sheet, a shelf — every one of which needs the relay complete on arrival.
     * A screen with three exits assembling her weight in each of them is three places for it to go
     * missing; that is the exact bug this relay's own history records. So the LAST STEP THAT COLLECTS
     * AN ANSWER builds it, which is this one, and the builder only carries it.
     *
     * ⚠️ AND THE BODY MAP IS NO LONGER PART OF IT. Nothing in the intake produces one — `bodyMap`
     * stays on `OnboardingInputs` because the profile still holds one (You → מפת הגוף writes it),
     * but an absent key here means the engine door builds a full-body week with nothing switched
     * off. That is the ruling's cost, stated where it is paid.
     */
    const inputs: OnboardingInputs = {
      // Hush is hypertrophy-first for everyone (register Part 9 §A) — the goal question is gone.
      goal: 'build_muscle',
      /*
       * ⛔ ZERO MEANS NOBODY HAS ASKED HER. This was a literal `4` once and it decided the founder's
       * week unasked — *"he decides by himself that he'll do 4 workouts for me."* The fallback stays
       * 0 so a missing answer reads as missing rather than as an answer.
       */
      daysPerWeek: route.params?.daysPerWeek ?? 0,
      // ════ THE PHONE ALREADY KNOWS (founder P0b.1) ════
      // This was `'kg'` for everybody, so every American athlete was told her bodyweight in kilos
      // and then had to go and find a switch. `unitsForDevice` reads the measurement system SHE set
      // when she set the phone up, and falls back to its region.
      units: unitsForDevice(Localization.getLocales()[0]),
      healthConnected: withHealth,
      sex: route.params?.sex,
      ...(route.params?.weightKg != null ? { weightKg: route.params.weightKg } : {}),
    };
    navigation.navigate('PlanBuilder', { inputs });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 3, total: 4 }}

      /*
       * ════════════════════════════════════════════════════════════════════════════════════════
       * ⛔ THREE LINES OFF THIS SCREEN (founder, 2026-08-12)
       *
       *   *"תוריד את ה-OPTIONAL מלמעלה, תוריד את 'I show it. It never decides a weight', תוריד את
       *   'For the runs and walks you record…' — וזה יפנה לך מקום להגדיל את הכרטיסייה של APPLE
       *   HEALTH ולעשות את זה במסגרת שתשכנע את המשתמש ללחוץ על זה."*
       *
       * ⚠️ AND I ARGUED ONE OF THEM BACK ONTO THIS SCREEN ONCE. The note that stood here defended
       * *"I show it. It never decides a weight"* as a PROMISE rather than prose — the ratified law
       * that Health is never a model input, said at the moment she hands it over.
       *
       * The promise is not deleted; it MOVED. `ob.healthHelper` said the same thing a second time
       * eight lines below ("Your lifting runs on one thing: what you lift"), and the three rows in
       * between say what she GETS. One statement of a law is a promise; two is a screen arguing
       * with itself, and neither survives being the fourth thing she reads before a switch.
       *
       * ⛔ AND "OPTIONAL" WAS THE WORST OF THE THREE. A screen whose footer already says "Skip for
       * now" does not need a word at the top telling her not to bother.
       * ════════════════════════════════════════════════════════════════════════════════════════
       */
      title={t('ob.healthTitle')}
      headGap={26}
      footer={
        <>
          <Button
            variant="primary"
            size="lg"
            block
            label={t('ob.continue')}
            onPress={() => proceed(connected)}
          />
          {/* The quiet second exit — leaves Health off, moves on. A ghost, not a button. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('ob.healthSkip')}
            onPress={() => proceed(false)}
            hitSlop={8}
          >
            <Text style={styles.skip}>{t('ob.healthSkip')}</Text>
          </Pressable>
        </>
      }
    >
      {/* The card IS the switch — pressing anywhere on it flips Health. */}
      <Pressable
        /* ⛔ A BUTTON, NOT A SWITCH (design review 2026-09-01). A switch promises an instant flip;
           behind this press is an OS permission sheet that may answer "no" — a control that flips
           itself and then snaps back is a promise the interface cannot keep. The card is an ACT
           ("connect"), and its state is said in words. */
        accessibilityRole="button"
        accessibilityState={{ selected: connected }}
        accessibilityLabel={t('ob.healthCardTitle')}
        onPress={() => void toggle()}
        style={({ pressed }) => [styles.card, connected && styles.cardOn, pressed && styles.cardPressed]}
      >
        {/* v7: the ACTIVITY waveform, always moss — health is a signal the app shows, not a
            verdict. It never changes colour with the toggle. */}
        <View style={styles.iconBox}>
          <Icon name="activity" size={23} color={color.accent} strokeWidth={1.8} />
        </View>
        <View style={styles.info}>
          <Text style={styles.title}>{t('ob.healthCardTitle')}</Text>
          {/* ════ THE CARD SAYS WHETHER IT IS ON. THE ROWS SAY WHAT IT GIVES (founder B.2) ════
              This line used to be "HR · KCAL · KM — DISPLAY ONLY": three measurements crammed into
              one mono legend as abbreviations, which is the smallest, least legible way to state
              the only reason to turn the switch on. It is the card's STATE now, and the three
              measurements have a row each under it. */}
          <Legend size={17} track={0} weight="regular" tone="onStage" style={styles.sub}>
            {connected ? t('ob.healthCardOn') : t('ob.healthCardSub')}
          </Legend>
        </View>
        {/* The card's STATE, drawn — not a second control (the card is the one Pressable). A
            drawn "connect" chip before, the moss check after: an act and its receipt, never a
            switch pretending the OS sheet does not exist. */}
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
          {connected ? (
            <Icon name="check" size={22} color={color.accent} strokeWidth={2.4} />
          ) : (
            <View style={styles.connectChip}>
              <Text style={styles.connectChipText}>{t('ob.healthConnect')}</Text>
            </View>
          )}
        </View>
      </Pressable>

      {/* ════ WHAT SHE ACTUALLY GETS, ONE LINE EACH (founder B.2) ════
          "In BOTH languages this screen should convey that she gets the most accurate measurements
          for her training, shown handsomely: one line calories · one line heart rate · one line
          kilometre (cardio)."

          These are not a marketing list — they are exactly the three HealthKit types the app asks
          read access to (`healthKitGate`: HeartRate · ActiveEnergyBurned · DistanceWalkingRunning)
          and nothing else. Each row names the measurement and what having it makes true, which is
          the promise.

          ⚠️ AND THERE IS NO HELPER LINE UNDER THEM. This note said there was, and that it "still
          carries the limit" — it was deleted with the other two on 2026-08-12 (his words at the
          scaffold below). What is left here is the reason to say yes; the reason it is safe to is
          kept by `healthIngestion`, not by a fourth sentence in front of a switch. */}
      <View style={styles.reads}>
        <HealthRead icon="heart" name={t('ob.healthHr')} sub={t('ob.healthHrSub')} />
        <HealthRead icon="flame" name={t('ob.healthKcal')} sub={t('ob.healthKcalSub')} />
        <HealthRead icon="footprints" name={t('ob.healthKm')} sub={t('ob.healthKmSub')} />
        {/*
         * ⛔ THE WRITE SIDE, FINALLY SAID (2026-08-23). Hush has written every finished workout back
         * to Health since the world-class pass — the plist promised it in writing for months — and
         * the one screen where she decides about Health never mentioned the half that closes her
         * rings. It is the most differentiating row of the four: every serious competitor reads;
         * the sentence that matters is that her hour under the bar COUNTS.
         */}
        <HealthRead icon="activity" name={t('ob.healthRings')} sub={t('ob.healthRingsSub')} />
      </View>

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

/**
 * One measurement Health hands over: a moss glyph, its name, and what having it makes true.
 *
 * ⛔ THE RULES BETWEEN THEM ARE DELETED (2026-08-26, the elevation pass).
 *
 * They were there *"so the three read as a list of facts rather than a paragraph in columns"* — a
 * real worry, and one the type already answers: every row is a semibold name in full ink over a
 * muted sentence, which is two tiers before a line is drawn. What the rules added on top was the
 * texture of an iOS SETTINGS table, on a screen that is an OFFER — a moss-rimmed invitation with
 * supporting detail under it, not a list of preferences.
 *
 * It is the founder's own ruling from the set stage, where he deleted the same lines for the same
 * reason: *"the air between them is the separator; there is a lot of it, and it is free."*
 *
 * ⚠️ THE WRIST ROW KEEPS ITS RULE, and that is the distinction rather than an inconsistency: it
 * separates two different KINDS of thing (what Health reads / what a watch adds), which is exactly
 * the job a hairline is still the lightest tool for.
 */
function HealthRead({ icon, name, sub }: { icon: 'heart' | 'flame' | 'footprints' | 'activity'; name: string; sub: string }) {
  return (
    <View style={styles.read}>
      {/* 17 → 24 (design review 2026-09-01): the icon ladder is 20/24/32, and a 17-point stroke
          glyph in moss on black sat below legibility while the card above drew its own icon at 23. */}
      <Icon name={icon} size={24} color={color.accent} strokeWidth={1.8} />
      <View style={styles.readText}>
        <Text style={styles.readName}>{name}</Text>
        <Text style={styles.readSub}>{sub}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* ⛔ THE CARD IS THE INVITATION (founder, 2026-08-12): *"להגדיל את הכרטיסייה … ולעשות את זה
     במסגרת שתשכנע את המשתמש ללחוץ על זה."* It was a 20-point row in `border` grey — the same
     weight as the three read-only rows beneath it — and it is the only thing on the page she can
     act on. Moss rim, moss wash, and the room the three deleted lines freed. */
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 28,
    paddingHorizontal: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(169,196,159,0.45)',
    borderRadius: radius.card,
    backgroundColor: 'rgba(169,196,159,0.08)',
  },
  cardOn: { borderColor: color.up, backgroundColor: color.upWash },
  cardPressed: { backgroundColor: color.fillSubtle },
  // v7: 46 × 46, radius 14, a subtle paper wash behind the moss waveform.
  iconBox: { width: 58, height: 58, borderRadius: 18, backgroundColor: 'rgba(169,196,159,0.16)', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.sansSemibold, fontSize: 24, lineHeight: 30, color: color.textPrimary, textAlign: 'left' },
  sub: { color: color.textSecondary, marginTop: 3 },
  // The three measurements — a block of rows, not a paragraph.
  reads: { marginTop: 30 },
  /* 11 → 14: the air the deleted rules were standing in. A row needs to be parted from its
     neighbour by SOMETHING, and space is the quieter of the two. */
  read: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14 },
  readText: { flex: 1, minWidth: 0, gap: 1 },
  readName: { fontFamily: font.sansSemibold, fontSize: 17, color: color.textPrimary, textAlign: 'left' },
  readSub: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, textAlign: 'left' },
  // The wrist row — ruled off the three measurement rows above it, so it reads as a separate FACT
  // rather than a second sentence about Health. A hairline is the lightest thing that can say "and
  // also". (It used to be ruled off a `helper` line; that line, and its rule here, are gone.)
  wrist: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  wristText: { flex: 1, fontFamily: font.sans, fontSize: 17, lineHeight: 21, color: color.textPrimary, textAlign: 'left' },
  // The quiet second exit.
  /* paddingVertical 4 → 13: with the 17px label that makes the quiet exit a real 44pt target. */
  connectChip: { borderWidth: 1, borderColor: color.borderControl, borderRadius: radius.control, paddingHorizontal: 16, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  connectChipText: { fontFamily: font.sansSemibold, fontSize: 17, color: color.textPrimary, textAlign: 'center' },
  skip: { fontFamily: font.sansMedium, fontSize: 17, color: color.textMuted, textAlign: 'center', paddingVertical: 13 },
});
