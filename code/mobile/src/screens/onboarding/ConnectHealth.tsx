/**
 * Connect Health (v7 1.3) — offer HealthKit.
 *
 * Founder 2026-07-12 (critical): the Apple Health card looked like STATIC INFORMATION —
 * no affordance at all — so the athlete read it as a notice rather than a choice, and the
 * real decision hid in the buttons below. The card now IS the control: a Switch that reads
 * the granted state and, when flipped on, runs the system permission flow right there.
 *
 * v7 1.3: the icon is the moss ACTIVITY waveform (health is a signal, not a heart); the card's
 * fine print is a mono legend — "HR · KCAL · KM — DISPLAY ONLY" — stating what flows and, in
 * caps, that it never decides. A sans helper line under the card carries the law in words, and
 * the footer holds BOTH exits: Continue (paper) and a quiet "Skip for now" ghost.
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
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button, Switch, Legend } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import * as Localization from 'expo-localization';
import { unitsForDevice } from '@/domain/unitsForDevice';
import { health } from '@/platform/health';
import { recordPermissionOutcome } from '@/platform/health/healthIngestion';
import { track } from '@/platform/telemetry';
import { markWristOffered, readWatchPresence, wristFace } from '@/platform/watch/watchPresence';
import * as haptics from '@/platform/haptics';
import { color, font, textScale, radius } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'ConnectHealth'>;

export function ConnectHealth({ navigation, route }: Props) {
  const { t } = useCopy();
  const sex = route.params?.sex;
  const weightKg = route.params?.weightKg;
  const age = route.params?.age;
  const experience = route.params?.experience;
  const daysPerWeekAsked = route.params?.daysPerWeek;
  const workoutMinutes = route.params?.workoutMinutes;
  const goal = route.params?.goal;
  const limits = route.params?.limits;
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
     * ════ THE LAST STEP BEFORE THE COACH ════
     *
     * Founder, 2026-08-01: *"delete every screen you can and change the prompt accordingly. Good
     * onboarding is short — precise and to the point, and now that we added a conversation window
     * we MUST make onboarding as short as possible."*
     *
     * `ManualInfo` used to sit here: two wheel pickers asking her bodyweight and how many days she
     * trains. Both are questions a coach asks, and the very next screen IS a coach — so she was
     * being asked twice, once by a form that cannot follow up and once by something that can.
     *
     * The intake prompt names both as things to learn. What is left here is what a conversation
     * genuinely cannot supply: her units, which the PHONE already knows and should never be a
     * question at all.
     */
    navigation.navigate('CoachIntake', {
      inputs: {
        // Hush is hypertrophy-first for everyone — goal is not asked. Experience is deleted (Rev 7).
        goal: 'build_muscle',
        /*
         * ⛔ ZERO MEANS NOBODY HAS ASKED HER, AND IT MUST STAY A NUMBER SHE NEVER SEES.
         *
         * ⚠️ This was `4`, with a comment claiming "the coach replaces it, so the placeholder
         * survives exactly one exchange". **It did not survive one exchange — it decided the
         * product.** The founder, on the device: *"he decides by himself that he'll do 4 workouts
         * for me, for some reason, without asking me how many I want."*
         *
         * The number went onto the coach's sheet as a measured fact, under a bound that reads
         * "write exactly that many sessions", so the very first reply was a four-day programme and
         * the question was never asked. `coachFacts` omits it now while it is 0.
         */
        /*
         * ⛔ HER ANSWER, FROM `YourWeek` — never a placeholder. This field was hard-coded to a
         * literal 4 once, and it decided the founder's week without asking him. `0` remains the
         * fallback so that `coachFacts` omits it rather than stating a number nobody gave.
         */
        daysPerWeek: daysPerWeekAsked ?? 0,
        // ════ THE PHONE ALREADY KNOWS (founder P0b.1) ════
        // This was `'kg'` for everybody, so every American athlete was told her bodyweight in
        // kilos and then had to go and find a switch. `unitsForDevice` reads the measurement
        // system SHE set when she set the phone up, and falls back to its region.
        units: unitsForDevice(Localization.getLocales()[0]),
        healthConnected: withHealth,
        sex,
        /*
         * ⛔ HER BODYWEIGHT, from the step before this one (founder 2026-08-03). Not optional in
         * practice: `Bodyweight` is on the only path here, and `missingForCoach` is what proves it.
         */
        ...(weightKg != null ? { weightKg } : {}),
        ...(age != null ? { age } : {}),
        ...(experience != null ? { experience } : {}),
        ...(workoutMinutes != null ? { workoutMinutes } : {}),
        /* Her own words — the two things a form cannot hold. They become the coach's first brief. */
        ...(goal ? { goalText: goal } : {}),
        ...(limits ? { limitsText: limits } : {}),
      },
    });
  }

  return (
    <OnboardingScaffold
      onBack={() => navigation.goBack()}
      progress={{ index: 6, total: 6 }}
      legend={t('ob.healthLegend')}
      title={t('ob.healthTitle')}
      voice={t('ob.healthSub')}
      headGap={32}
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
        accessibilityRole="switch"
        accessibilityState={{ checked: connected }}
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
          <Legend size={12.5} track={0} weight="regular" tone="onStage" style={styles.sub}>
            {connected ? t('ob.healthCardOn') : t('ob.healthCardSub')}
          </Legend>
        </View>
        {/* The switch is the card's STATE, drawn — not a second control. The card above is the
            one Pressable and the one accessibility element; nesting a live Switch inside it
            would announce two switches to VoiceOver and give the athlete two hit targets for
            one decision. */}
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
          <Switch size="lg" checked={connected} onChange={() => void toggle()} accessibilityLabel={t('ob.healthCardTitle')} />
        </View>
      </Pressable>

      {/* ════ WHAT SHE ACTUALLY GETS, ONE LINE EACH (founder B.2) ════
          "In BOTH languages this screen should convey that she gets the most accurate measurements
          for her training, shown handsomely: one line calories · one line heart rate · one line
          kilometre (cardio)."

          These are not a marketing list — they are exactly the three HealthKit types the app asks
          read access to (`healthKitGate`: HeartRate · ActiveEnergyBurned · DistanceWalkingRunning)
          and nothing else. Each row names the measurement and what having it makes true, which is
          the promise; the helper line under them still carries the limit, because the ratified law
          is that Health NEVER decides a weight. Both halves belong on this screen: the reason to
          say yes, and the reason it is safe to. */}
      <View style={styles.reads}>
        <HealthRead icon="heart" name={t('ob.healthHr')} sub={t('ob.healthHrSub')} />
        <HealthRead icon="flame" name={t('ob.healthKcal')} sub={t('ob.healthKcalSub')} />
        <HealthRead icon="footprints" name={t('ob.healthKm')} sub={t('ob.healthKmSub')} last />
      </View>

      {/* v7 helper line — the law in words, under the card, sans. */}
      <Text style={styles.helper}>{t('ob.healthHelper')}</Text>

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
 * Ruled between rows so the three read as a list of facts rather than a paragraph in columns.
 */
function HealthRead({ icon, name, sub, last }: { icon: 'heart' | 'flame' | 'footprints'; name: string; sub: string; last?: boolean }) {
  return (
    <View style={[styles.read, !last && styles.readRuled]}>
      <Icon name={icon} size={17} color={color.accent} strokeWidth={1.8} />
      <View style={styles.readText}>
        <Text style={styles.readName}>{name}</Text>
        <Text style={styles.readSub}>{sub}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.card,
    backgroundColor: color.surface,
  },
  cardOn: { borderColor: color.up, backgroundColor: color.upWash },
  cardPressed: { backgroundColor: color.fillSubtle },
  // v7: 46 × 46, radius 14, a subtle paper wash behind the moss waveform.
  iconBox: { width: 46, height: 46, borderRadius: 14, backgroundColor: color.fillSubtleStrong, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.sansSemibold, fontSize: 16, color: color.textPrimary, textAlign: 'left' },
  sub: { color: color.textSecondary, marginTop: 3 },
  // The three measurements — a block of rows, not a paragraph.
  reads: { marginTop: 18 },
  read: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 11 },
  readRuled: { borderBottomWidth: 1, borderBottomColor: color.border },
  readText: { flex: 1, minWidth: 0, gap: 1 },
  readName: { fontFamily: font.sansSemibold, fontSize: 15, color: color.textPrimary, textAlign: 'left' },
  readSub: { fontFamily: font.sans, fontSize: 13, color: color.textMuted, textAlign: 'left' },
  // The law in words, under the three rows.
  helper: { fontFamily: font.sans, fontSize: 14, lineHeight: 22, color: color.textSecondary, marginTop: 16, textAlign: 'left' },
  // The wrist row — ruled off the helper above it, so it reads as a separate FACT rather than a
  // second sentence about Health. A hairline is the lightest thing that can say "and also".
  wrist: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  wristText: { flex: 1, fontFamily: font.sans, fontSize: 14, lineHeight: 21, color: color.textPrimary, textAlign: 'left' },
  // The quiet second exit.
  skip: { fontFamily: font.sansMedium, fontSize: 14, color: color.textMuted, textAlign: 'center', paddingVertical: 4 },
});
