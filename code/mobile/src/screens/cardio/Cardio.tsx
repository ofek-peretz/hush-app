/**
 * Cardio — the v7 open-tracking surface (handoff 3.4 / 3.4a / 3.4c). Run or walk, recorded beside
 * your lifting; the strength engine never touches it.
 *
 * v7 REBUILD (2026-07-23, "Full 1:1 match" ruling): the surface is stripped to timer-first OPEN
 * tracking, exactly as the handoff shows. The READY step (3.4a) now lives in the Cardio TAB
 * (CardioReady, so the bottom bar stays visible at rest); this stage is pushed above the bar and
 * opens straight into the countdown —
 *   · LIVE (3.4): the elapsed clock as the hero; a 1,000 m band whose dot travels the CURRENT
 *     kilometre with its metres riding under it in moss; one readable row — kilometre, heart, burn;
 *     a split pill when a kilometre logs; a single cream "Pause".
 *   · DONE (3.4c): centred like a milestone — "Cardio · saved", "That's the distance.", the distance
 *     alone in the light, three facts (time · kcal · avg hr), one cream "Done".
 *
 * What was removed per the ruling: distance/time GOALS and the in-run run/walk toggle (the surface is
 * open-tracking only now). The RECORDING flow underneath is untouched — real GPS via useCardioTracker,
 * the honest GPS-lock gating, the Live Activity, and the once-on-mount persistence (route + splits +
 * hr + calories still saved to the log, they are simply not drawn on the done stage).
 *
 * THE LAW (monoCarriesNoWords): mono carries only figures (the clock, the metres, the km/hr/kcal
 * numbers). Every word — "CARDIO", "KM", "1,000 m", "km 3 logged", the legends — is SANS.
 */
// @ts-nocheck

// 

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { DistanceRing } from './DistanceRing';
import { RangeMark } from '@/components/RangeMark';
import { Legend, Button } from '@/components/ds';
import { PausedStage } from '@/components/PausedStage';
import { BottomSheet } from '@/components/BottomSheet';
import { MIN_ROUTE_POINTS, simplifyRoute } from '@/components/RouteTrace';
import { useCopy } from '@/i18n/useCopy';
import { movementById, isOutdoorMovement } from '@/data/movements';
import { monoCanDraw } from '@/design/monoVoice';
import { db } from '@/data/local/db';
import { useApp } from '@/state/stores/appStore';
import { useKeepAwake } from 'expo-keep-awake';
import { useCardioTracker, fmtClock, fmtPace, gaitFromPace, type GpsState } from '@/platform/cardio/cardioTracker';
import { cardioPerformed } from '@/domain/cardio';
import { cardioLiveActivity, type CardioLiveActivityState } from '@/platform/liveActivity';
import { useFocusedStatusBar } from '@/platform/statusBar';
import { readWatchPresence } from '@/platform/watch/watchPresence';
import type { CardioActivity, CardioGait, CardioPoint, CardioSplit } from '@/data/local/models';
import * as haptics from '@/platform/haptics';
import { color, font, textScale, radius, stage as stageC, signal, tracking, trackingPx } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'CardioLive'>;
type Phase = 'countdown' | 'active' | 'complete';

export function Cardio({ navigation, route: nav }: Props) {
  const { t } = useCopy();
  /**
   * ════ A RUN THE COACH PRESCRIBED ENDS ITSELF ════
   *
   * Founder, 2026-08-02: *"why does she need a Done button? The GPS can tell us she finished. And
   * we can use our existing cardio screen for these cases, no?"* — both right.
   *
   * A "5 km" step inside a session used to draw a figure and a button, and ask her to confirm a
   * distance the phone was already able to measure. It opens THIS stage now, with the coach's
   * target, and the target is the whole difference: at the distance, the run finishes on its own.
   *
   * Absent for an open run from the Cardio tab, which is exactly what it has always been — she
   * decides when that one is over.
   */
  const target = nav.params?.target ?? null;
  // The unit words, read once: each rides a MONO slot in the handoff and hands over to sans in a
  // script mono cannot draw (see `unitWord`).
  const metresUnit = t('cardio.metresUnit');
  const kmUnit = t('cardio.km');
  const perKm = t('cardio.perKm');
  const app = useApp();
  // Foreground-only GPS (no background-location entitlement yet): the screen stays awake for the
  // whole cardio surface so a live activity never loses its fix mid-run.
  useKeepAwake();
  // The stage opens straight into the countdown — the READY step lives in the Cardio tab now.
  const [phase, setPhase] = useState<Phase>('countdown');
  // Open tracking only (v7): gait is fixed to a run; no picker, no in-run toggle.
  const live: CardioGait = 'run';
  const [count, setCount] = useState(3);
  // C.19 — whether anything on her wrist could measure a heartbeat. Read once: a watch is not
  // paired or unpaired mid-run, and `readWatchPresence` degrades to "we could not find out"
  // everywhere but a native build (never to "no watch").
  const watchPaired = useRef(readWatchPresence().paired).current;
  const [paused, setPaused] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  // 3.4b · KILOMETRE LOGGED — the split that just landed rises alone in the light, then the run
  // resumes on its own. A moment, mirrored to the watch; the tracking underneath never pauses.
  const [kmMoment, setKmMoment] = useState<CardioSplit | null>(null);
  const shownSplitsRef = useRef(0);
  const startedAtRef = useRef<string>('');
  // Stamp the start the moment the stage mounts (the countdown is already running).
  useEffect(() => {
    startedAtRef.current = new Date().toISOString();
  }, []);

  // GPS warms up during the 3·2·1 countdown; the clock and accumulation start only once the phase
  // is truly 'active' and unpaused.
  /*
   * ⛔ INDOORS IS A SOURCE, NOT A SCREEN (founder, 2026-08-12). An indoor movement from the
   * catalogue (`run_treadmill`, `walk_treadmill`) carries no `gps` flag, so a prescribed treadmill
   * session selects it without anyone choosing — and the route param carries it for the athlete
   * who opens the tab herself.
   */
  /*
   * ⚠️ `nav`, NOT `route` — and this line was written as `route?.params?.indoor` and typechecked
   * clean, because this file carries `@ts-nocheck`. **The prop is destructured as `nav` and there
   * is no `route` in this scope**; it would have thrown a ReferenceError on the first treadmill
   * session and on nothing else. Caught by reading, which is the only thing left that can.
   */
  const indoor = nav.params?.indoor ?? (target?.ex ? !isOutdoorMovement(target.ex) : false);
  const sample = useCardioTracker(
    phase === 'countdown' || phase === 'active',
    paused || phase !== 'active',
    live,
    app.profile?.weightKg,
    indoor,
  );
  const { elapsedSec, distanceKm, paceSec, hr, avgHr, calories, splits, gps, route } = sample;

  // Live Activity / Dynamic Island — start when live, update each tick, end on unmount.
  const laStarted = useRef(false);
  useEffect(() => {
    if (phase !== 'active') return;
    const last = splits[splits.length - 1];
    const fastest = splits.length ? Math.min(...splits.map((s) => s.paceSec)) : Infinity;
    const state: CardioLiveActivityState = {
      kind: 'cardio',
      gait: live,
      paused,
      startedAtMs: Date.parse(startedAtRef.current) || Date.now(),
      elapsedSec,
      distanceKm: Math.round(distanceKm * 100) / 100,
      paceSec: Math.round(paceSec),
      hr: hr != null ? Math.round(hr) : 0, // 0 = no source; the widget hides it
      calories: Math.round(calories),
      lastSplit: last ? { km: last.km, paceSec: Math.round(last.paceSec), fastest: last.paceSec <= fastest } : null,
    };
    if (!laStarted.current) {
      laStarted.current = true;
      void cardioLiveActivity.start(state).catch(() => {});
    } else {
      void cardioLiveActivity.update(state).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, elapsedSec, paused]);
  useEffect(() => () => {
    if (laStarted.current) void cardioLiveActivity.end().catch(() => {});
  }, []);

  // Every cardio phase is a dark stage now — light glyphs throughout, restored on blur.
  useFocusedStatusBar('light');

  // Countdown 3 → 2 → 1 → Go → active. Every beat is FELT (rising haptics, a sustained double on GO).
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count < 0) {
      setPhase('active');
      return;
    }
    haptics.countdownBeat(count);
    const id = setTimeout(() => setCount((c) => c - 1), 800);
    return () => clearTimeout(id);
  }, [phase, count]);

  // A kilometre just closed → raise the moment for the newest split. We compare against a stamped
  // count (not just length) so a moment fires exactly once per completed km, even across re-renders.
  useEffect(() => {
    if (phase !== 'active') return;
    if (splits.length <= shownSplitsRef.current) return;
    shownSplitsRef.current = splits.length;
    haptics.setLogged();
    setKmMoment(splits[splits.length - 1]);
  }, [phase, splits]);

  // The moment breathes on its own and clears itself — no tap. It used to COUNT ITSELF DOWN in
  // words under a filling bar; the founder had both taken off every workout surface (A.11 / C.14),
  // so the timing survives and the narration of it does not. The split is on the glass for three
  // seconds, then the run is back.
  useEffect(() => {
    if (!kmMoment) return;
    const done = setTimeout(() => setKmMoment(null), 3150);
    return () => clearTimeout(done);
  }, [kmMoment]);

  const finish = () => {
    // NOT PERFORMED (founder 2026-07-10): finishing with no real activity records nothing.
    if (!cardioPerformed(elapsedSec, distanceKm)) {
      navigation.goBack();
      return;
    }
    setPaused(true);
    setPhase('complete');
  };

  /**
   * The prescribed distance is covered — end it, without being asked.
   *
   * The signature triple (`exerciseAdvance`) rather than a set's single tap: something FINISHED, and
   * she is very likely not looking at the screen. She can still stop early; the target only removes
   * the moment where the phone knows she is done and waits to be told.
   */
  const reachedRef = useRef(false);
  useEffect(() => {
    if (!target || phase !== 'active' || reachedRef.current) return;
    if (distanceKm * 1000 < target.metres) return;
    reachedRef.current = true;
    haptics.exerciseAdvance();
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, phase, distanceKm]);

  if (phase === 'countdown') return <CardioCountdown count={count} />;

  if (phase === 'complete') {
    return (
      <CardioComplete
        navigation={navigation}
        gait={live}
        startedAt={startedAtRef.current}
        elapsedSec={elapsedSec}
        distanceKm={distanceKm}
        // The MEAN of every live reading, not the last one — `hr` is what the row is showing
        // this second, and a summary that called that "average" would be reporting one heartbeat.
        avgHr={avgHr ?? null}
        calories={calories}
        splits={splits}
        route={route}
      />
    );
  }

  // ---- LIVE (stage) ----
  return (
    <CardioLiveView
      elapsedSec={elapsedSec}
      distanceKm={distanceKm}
      hr={hr}
      watchPaired={watchPaired}
      {...(target?.say ? { say: target.say } : {})}
      {...(target?.ex ? { exerciseId: target.ex } : {})}
      paceSec={paceSec}
      {...(target?.metres ? { targetMetres: target.metres } : {})}
      /*
       * ⛔ THE RUN'S OWN NAME. `target.ex` is a MOVEMENT id (`run_outdoor`, `walk_outdoor`), and
       * `movementById` holds the word for it — so a prescribed run says "Run" where a free one says
       * "Cardio", and a session that is a run is not filed under a category.
       *
       * ⚠️ Absent on a run she started herself, which is the common case: there is no coach behind
       * it and naming it would be the app inventing a purpose she did not give it.
       */
      {...(target?.ex && movementById(target.ex) ? { runName: movementById(target.ex)!.name } : {})}
      calories={calories}
      splits={splits}
      gps={gps}
      paused={paused}
      confirmEnd={confirmEnd}
      kmMoment={kmMoment}
      onPause={() => setPaused(true)}
      /*
       * ⛔ THE RUN STAYS PAUSED BEHIND THE REPORT, exactly as the gym session does — the report is
       * pushed over this screen, so Back reveals the run she left rather than a stage that moved.
       * The movement travels with it so the ease is filed against what she was actually doing.
       */
      onPain={() => navigation.navigate('PainWhere', { exerciseId: target?.ex ?? undefined })}
      indoor={indoor}
      onResume={() => {
        setConfirmEnd(false);
        setPaused(false);
      }}
      onAskEnd={() => setConfirmEnd(true)}
      onKeepGoing={() => setConfirmEnd(false)}
      onFinish={finish}
    />
  );
}

/**
 * ════ IS THERE ANYTHING THAT COULD MEASURE HER HEART? (founder C.19) ════
 *
 * "For someone with no Apple Watch, HR must not appear — tie it to the same flag as the watch
 * presence." The row used to draw the heart unconditionally and fall back to an em-dash, so every
 * athlete without a watch got a permanent empty seat labelled דופק: a measurement announced, and
 * then declined, on every run they will ever take.
 *
 * Two facts decide it, and the OR between them matters:
 *   · `paired` — a wrist that can stream a reading. The seat is real even before the first beat
 *     arrives, so a paired athlete sees "—" for a second, not a slot appearing under her thumb.
 *   · `hr != null` — a reading is ALREADY arriving. Whatever WCSession thinks, something is
 *     measuring, and `watchPresence` is explicit that `known: false` means "we could not find
 *     out", never "no watch". A live number outranks a flag that admits it does not know.
 *
 * Neither → nothing is drawn. That is the general law, of which his ask is the case: Hush does not
 * name a measurement it has no instrument for.
 */
export function showsHeartRate(hr: number | null, watchPaired: boolean): boolean {
  return hr != null || watchPaired;
}

/**
 * 3 · 2 · 1 · GO — the countdown, as a pure view.
 *
 * EXTRACTED from the container (founder B.6). It was eight lines of JSX inside `Cardio`, reachable
 * only by mounting the real stage with a real GPS tracker — so the gallery had no entry for it and
 * no test had ever seen it. That is exactly where B.6 was hiding: the legend read "ריצה · מתחיל",
 * the wrong word order AND the masculine form for every woman, and nothing in the build could look
 * at it. Same split, and the same reason, as `CardioLiveView` below.
 */
export function CardioCountdown({ count }: { count: number }) {
  const { t } = useCopy();
  return (
    <View style={styles.stage}>
      <SafeAreaView style={styles.stageSafe} edges={['top', 'bottom']}>
        <View style={styles.countdownWrap}>
          {/* ════ ONE KEY, NOT TWO WORDS GLUED IN JSX (founder B.6) ════
              The legend was ASSEMBLED HERE — `{run} · {starting}`, with a hard-coded separator —
              so Hebrew could neither put its own words in its own order nor conjugate the verb.
              Both of his faults have that one cause: a sentence built in code is a sentence with
              one language's grammar baked into it. It is one key now and each locale writes its
              own — English keeps "RUN · STARTING", Hebrew leads with the verb and takes its
              feminine form from the same i18next context every other line in the app uses. */}
          <Text style={styles.startingLegend}>{t('cardio.startingLegend').toUpperCase()}</Text>
          {/* 3 · 2 · 1 are FIGURES (mono, tabular); "GO" is a WORD (sans) — the mono font cannot
              even draw it in Hebrew. Same size, same weight, each in the voice it belongs to. */}
          <Text style={[styles.countNum, count <= 0 && styles.countGo]}>
            {count <= 0 ? t('cardio.go') : count}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

/**
 * 3.4 · CARDIO — LIVE, as a pure view.
 *
 * Split from the container for the same reason Home/HomeView and LiftDetail are: the stage's whole
 * content comes from a live GPS tracker, and a harness cannot produce one. Everything here is
 * props, so the gallery draws exactly what a running phone draws — the band, the split pill, the
 * paused stage and the end sheet included.
 */
export function CardioLiveView(props: {
  elapsedSec: number;
  distanceKm: number;
  hr: number | null;
  calories: number;
  splits: CardioSplit[];
  gps: GpsState;
  /** A watch is paired to this iPhone (`platform/watch/watchPresence`). Gates the HEART readout —
   *  see `showsHeartRate`. The container reads it; the view only obeys it. */
  watchPaired: boolean;
  /**
   * The coach's instruction for THIS run, when it wrote one.
   *
   * ⛔ It has been passed into this screen's route since a prescribed run started opening it, and
   * this file did not contain the word `say` even once — so "at a pace where you could hold a
   * conversation", the sentence that turns 5 km into a prescription, was handed over and dropped.
   */
  say?: string;
  /** The exercise the instruction is about — names the point on the sheet. */
  exerciseId?: string;
  /**
   * ⛔ HER PACE (founder 2026-08-04) — sec/km, smoothed, and 0 the moment she stops moving.
   *
   * The number every runner reads first, computed every second since the tracker was written, and
   * drawn NOWHERE on the running screen: it appeared on the pause stage and in the split pill, which
   * are the two places she is not running. The stat row's third seat was spent on "4 km" — the same
   * fact the band above it was already drawing.
   */
  paceSec: number;
  /** The distance the coach prescribed, in metres, when it prescribed one. */
  targetMetres?: number;
  /** The coach's name for this run — drawn in the chrome, so the run is a thing rather than "cardio". */
  runName?: string;
  paused: boolean;
  confirmEnd: boolean;
  kmMoment: CardioSplit | null;
  onPause: () => void;
  /** ⛔ The pain door on the paused run — see the note at `PausedStage`. Absent in the harness. */
  onPain?: () => void;
  /**
   * ⛔ INDOORS — a treadmill (founder, 2026-08-12). The view needs it for ONE thing: which absence
   * to name when there is no distance. Everything else about the mode is decided above it.
   *
   * ⚠️ IT IS A PROP AND NOT A LOCAL, and the render suite is what said so. The sentence lives here
   * in `CardioLiveView` while the mode is computed in `Cardio`; writing `indoor` here typechecked
   * clean because this file carries `@ts-nocheck`, and threw `ReferenceError: indoor is not
   * defined` the instant anything mounted the view. Three render tests caught it in one run.
   */
  indoor?: boolean;
  onResume: () => void;
  onAskEnd: () => void;
  onKeepGoing: () => void;
  onFinish: () => void;
}) {
  const { t } = useCopy();
  const [points, setPoints] = useState(false);
  const metresUnit = t('cardio.metresUnit');
  const kmUnit = t('cardio.km');
  /* ⚠️ READ HERE, not borrowed from the container. `CardioLiveView` is a separate component and the
     `perKm` in `Cardio` is out of its scope — `@ts-nocheck` let a `ReferenceError` compile clean,
     and three render tests caught it in one run. Same shape as `indoor` an hour ago. */
  const perKm = t('cardio.perKm');
  const { elapsedSec, distanceKm, hr, calories, splits, gps, paused, confirmEnd, kmMoment } = props;
  // One line, or none at all — see the block where it is drawn.
  const gpsNote =
    /*
     * ⛔ AN INDOOR SESSION IS NOT WAITING FOR A SATELLITE, AND IT DOES NOT LOSE ONE. Both of these
     * lines name GPS, and neither is true on a treadmill — "Acquiring GPS signal" over a belt is
     * the same class of lie as a pace on a table. Indoors the only failure worth a sentence is
     * having no motion source at all, which is what `unavailable` means there.
     */
    /*
     * ⛔ AND "NOTHING YET" IS NOT THE SAME AS "NOTHING AT ALL" (founder 2026-08-16, on a treadmill
     * session that never moved). Indoors there were only two outcomes on screen — `unavailable`, or
     * silence — and silence was drawn over a **confident 0 m**, which is the state the athlete is in
     * for the first minutes of EVERY indoor run and cannot tell apart from a broken one:
     *
     *   · Core Motion counts GAIT, not vibration, and it needs the phone ON HER (see
     *     `platform/health`) — a phone on the treadmill console reads zero forever, correctly;
     *   · and even walking, iOS flushes distance to HealthKit in BATCHED segments minutes apart,
     *     against a five-second poll, with `ingestStride` spending the first reading as a cursor.
     *
     * So the first metre is legitimately minutes away, and until it lands the only honest line is
     * the one that says what the measurement needs. It clears itself the moment distance is
     * credited, so a working run shows it briefly and a broken one shows it until she fixes it.
     *
     * ⚠️ THERE IS NO `denied` BRANCH HERE ON PURPOSE. A refused HealthKit READ returns an empty
     * array rather than an error — the API will not say it was refused — so the only two states this
     * mode can honestly tell apart are "no source at all" (`unavailable`: Android, no HealthKit) and
     * "a source that has not answered yet". A denial lands in the second, which is why the line it
     * gets names the thing she can actually check.
     */
    props.indoor
      ? gps === 'unavailable'
        ? t('cardio.motionOff')
        : distanceKm > 0
          ? ''
          : t('cardio.motionWaiting')
      : gps === 'acquiring'
      ? t('cardio.gpsAcquiring')
      : gps === 'denied' || gps === 'unavailable'
        ? t('cardio.gpsOff')
        : null;
  const metresTotal = distanceKm * 1000;
  /*
   * ⛔ THE BAND IS THE WHOLE RUN WHEN THERE IS AN END TO DRAW (founder 2026-08-04).
   *
   * It has always shown the CURRENT kilometre — right for a run she started herself, because a free
   * run has no end and inventing one would be the app deciding how far she is going. But when the
   * coach prescribed a distance the run HAS an end, and a band that keeps resetting every kilometre
   * refuses to tell her how much of it is left.
   */
  const target = props.targetMetres && props.targetMetres > 0 ? props.targetMetres : null;
  const spanM = target ?? 1000;
  const metresIntoSpan = target ? Math.min(metresTotal, target) : metresTotal % 1000;
  const dotFrac = Math.max(0, Math.min(1, metresIntoSpan / spanM));
  const kmDone = Math.floor(distanceKm);
  const lastSplit = splits[splits.length - 1];

  return (
    <View style={styles.stage}>
      <SafeAreaView style={styles.stageSafe} edges={['top', 'bottom']}>
        {/* "CARDIO" — a legend, a word: sans. */}
        {/* Three parts, like the strength stage's bar: a spacer, the centred legend, and the
            control — flexbox rather than an absolute `end`, so it flips with the language instead
            of sitting on the right of a Hebrew screen. */}
        {/*
          ⛔ PAUSE IS A DISC IN THE CHROME NOW (founder 2026-08-04):

            > *"Why is there such a huge PAUSE button there in the first place? We could do pause
            > like on the strength screen and then use all the enormous space we'd have. That button
            > is asking for trouble — somebody could press it by accident during cardio and not
            > notice at all."*

          He is right about the hazard, and it is worse here than anywhere else in the product: a
          paused strength set is obvious the moment she looks, and a paused RUN keeps looking like a
          run — same screen, clock stopped, kilometres quietly not being counted. A 338×64 target at
          the bottom edge is exactly where a phone is gripped and pushed into a pocket.

          Same disc, same corner and the same glyph as the strength stage's, so one gesture pauses
          any work in this product — and it opens the SAME paused stage it always did. Nothing about
          stopping or finishing a run changed except the size of the target that starts it.
        */}
        <View style={styles.liveTop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('cardio.pause')}
            hitSlop={8}
            onPress={props.onPause}
            style={({ pressed }) => [styles.pointsDisc, pressed && styles.pointsDiscPressed]}
          >
            <Icon name="pause" size={15} color={stageC.ink0} filled />
          </Pressable>
          <View style={styles.liveTopCentre}>
            {/* The run's own name when the coach wrote one — a run with a purpose is not "cardio". */}
            <Legend size={RUN_LEGEND_PT} tone="onStage">{props.runName ?? t('cardio.liveLegend')}</Legend>
          </View>
          {/* ⛔ THE SPEECH DISC WENT WITH `EmphasesSheet` (founder, 2026-08-12). The spacer stays:
              it is what keeps the run's name on the screen's centre line against the pause disc. */}
          <View style={styles.liveTopSpacer} />
        </View>

        {/*
          ════ THE COACH'S INSTRUCTION FOR THIS RUN — BEHIND THE CONTROL, NOT ON THE STAGE ════

          It used to be printed here, clamped to two lines, because it had been passed into this
          screen for weeks and drawn nowhere. That fixed the disappearance and created a smaller
          problem: a sentence longer than two lines was cut off mid-thought, and there was no way to
          read the rest of it.

          ⛔ FOUNDER, 2026-08-02: *"a KEY POINTS button… for cardio and for strength both."* Same
          control, same sheet, same glyph as the strength stage — so wherever the coach has
          something to say, it is in the same place, and the stage stays a stage. She is running.
        */}
        <View style={styles.liveBody}>
          {/* the elapsed clock — the hero. Pure figures + ":" — mono. */}
          <Text style={styles.clock}>{fmtClock(elapsedSec)}</Text>

          {/*
            ════════════════════════════════════════════════════════════════════════════════════
            ⛔ THE BAND IS REPLACED BY A RING — the founder's own design (2026-08-12)

              *"למה שלא נשים טבעת ענקית במרכז המסך שבתוכה יופיע המספר של המטרים שהמתאמן רץ — זה
              יהיה במטרים בלבד — וככל שהמטרים גדלים הטבעת מתחילה לסגור את הסיבוב שלה בצבע הירוק."*

            Three passes at spreading the old layout failed on the same state, and he was right that
            the layout was not the problem. **A 334-point horizontal rule is a footnote's shape**;
            no amount of space around it makes it the subject of a screen. And `0.00 km` cannot move
            for the first ten seconds of a run — two decimals of a kilometre is a number that sits
            still while she is running.

            Metres move on every stride. See `DistanceRing`.
            ════════════════════════════════════════════════════════════════════════════════════
          */}
          <DistanceRing
            metres={metresIntoSpan}
            spanM={spanM}
            label={target ? t('cardio.targetEnd', { km: +(target / 1000).toFixed(2) }) : t('cardio.kmOrdinal', { n: kmDone + 1 })}
            unit={t('cardio.metresUnit')}
          />

          {gpsNote ? <Text style={styles.gpsStatus}>{gpsNote}</Text> : null}

          {/*
            ⛔ THE BAR TEXTURE IS DELETED (founder, 2026-08-12: *"תוריד את המשבצות האלה כי זה לא ברור
            בכלל"*).

            One bar per kilometre, height = pace, approved on a drawing in August and kept when the
            per-kilometre ROWS landed beside it on the argument that the bars answer *what shape is
            this run* while the rows answer *what did I do*. **Two readings of one fact, and the
            unlabelled one goes** — the rows say 6:19 and 6:24 in figures, which is the same
            comparison without asking her to measure rectangles at eight kilometres an hour.
          */}

          {/*
            ════════════════════════════════════════════════════════════════════════════════════════
            ⛔ EVERY KILOMETRE, ON ITS OWN ROW, WITH THE TIME IT TOOK (founder, 2026-08-12)

              *"מסך שלם שהכל מתנקז לחלק העליון של המסך למה?! תתפרש על המסך. ובחלק התחתון לכל
              קילומטר תציג אותו בשורה נפרדת ובכמה זמן הוא בוצע."*

            The whole run lived in the top third: clock, band, pace, calories — and then four hundred
            points of black. The splits existed as a 38-point bar texture and nowhere else, so the
            one thing a runner actually wants mid-run — *how fast was the last one* — could only be
            read as a HEIGHT.

            ⚠️ THE TEXTURE STAYS AND IS NOT REPLACED. It answers "what shape is this run" at a
            glance, which is what a bar chart is for; the rows answer "what did I do", which is what
            a number is for. Newest first, because the kilometre she just finished is the one she is
            asking about.
            ════════════════════════════════════════════════════════════════════════════════════════
          */}
          {splits.length > 0 ? (
            <View style={styles.kmRows}>
              {[...splits].reverse().map((sp) => (
                <View key={sp.km} style={styles.kmRow}>
                  <Legend size={RUN_SMALL_PT} track={0.16} tone="onStage" style={styles.kmRowOrdinal}>
                    {t('cardio.kmOrdinal', { n: sp.km })}
                  </Legend>
                  <Text style={styles.kmRowTime}>{fmtPace(sp.paceSec)}</Text>
                  {/* The same per-string face this file already gives its three other unit slots —
                      this row was added later and missed it, so "‏/ק״מ" sat in a face with no
                      Hebrew glyphs (`monoCarriesNoWords`). */}
                  <Text style={[styles.kmRowUnit, !monoCanDraw(perKm) && styles.unitWord]}>{perKm}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/*
            ⛔ PACE TAKES THE SEAT THAT WAS REPEATING THE BAND (founder 2026-08-04).

            The row read "kilometre · heart · burn" — and the kilometre is the same fact the band
            directly above it draws, twice over (the count, and the metres riding under the dot). So
            the one seat that could hold the number every runner reads first was spent saying
            something already on the screen.

            ⚠️ It blanks itself the moment she stops moving — the honesty gate that stops a phone on
            a table reporting a 5:39 — and `fmtPace` draws "--:--" there rather than a stale figure.
          */}
          <View style={styles.liveRow}>
            <LiveStat value={fmtPace(props.paceSec)} label={t('cardio.perKm')} />
            {/* ════ NO INSTRUMENT, NO READOUT (founder C.19) ════
                It always drew, showing "—" to every athlete without an Apple Watch — a permanent
                empty seat for a measurement their phone cannot take. It is gone for them now. */}
            {showsHeartRate(hr, props.watchPaired) ? (
              <LiveStat value={hr != null ? Math.round(hr) : '—'} label={t('cardio.hrShort')} icon="heart" />
            ) : null}
            <LiveStat value={Math.round(calories)} label={t('cardio.kcal')} icon="flame" />
          </View>
        </View>

        {/*
          ⛔ THE FOOTER IS GONE, AND SO IS THE SPLIT PILL.

          The pill said "kilometre 4 logged · 5:38" — which the bars now draw for every kilometre,
          the 3.4b moment already announces as it happens, and the per-km push already delivers to a
          pocket. Four statements of one fact; the quietest one is the one that survives.

          With the button and the pill both gone the stage has one act (the disc in the chrome) and
          the body takes the whole screen — which is what the founder freed it for.
        */}

        {/*
          13.1 · PAUSED — the SAME stage the gym session raises. One pause screen for the whole
          product: same mark, same sentence, same two acts.

          ════════════════════════════════════════════════════════════════════════════════════════
          ⛔ AND THE PAIN DOOR IS HERE NOW (founder, 2026-08-12: *"למה ב-PAUSE בקרדיו אין את
          האפשרות לפציעה כמו באימון בחדר הכושר?"*)

          The note that used to sit here gave the reason, and the reason does not survive being
          checked: *"a run offers no pain door — it trains no muscle Hush prescribes, so there is
          nothing for a report to act on."*

          **A run loads calves, quads, hamstrings, hips and shins**, and every one of them is a
          muscle on her body map that the assembler prescribes and `PainEase` can rest. A shin that
          starts hurting at kilometre three is precisely a report the engine acts on — it eases that
          muscle, and the ease window is the thing Home asks her about when it lapses.

          ⚠️ AND IT IS THE MOMENT SHE IS MOST LIKELY TO NEED IT. Something going wrong mid-run is
          why a runner stops; the pause screen was the one place she could reach and the only one
          that refused to ask. `exerciseId` travels with it exactly as the gym's does, so the report
          is filed against the movement she was doing.
          ════════════════════════════════════════════════════════════════════════════════════════
        */}
        {paused ? (
          <PausedStage
            subject={t('cardio.run')}
            onResume={props.onResume}
            endLabel={t('cardio.finish')}
            onEnd={props.onAskEnd}
            onPain={props.confirmEnd ? undefined : props.onPain}
          >
            <View style={styles.pausedFacts}>
              <Text style={styles.pausedClock}>{fmtClock(elapsedSec)}</Text>
              <View style={styles.pausedStats}>
                <Text style={styles.pauseStat}>{distanceKm.toFixed(2)} {t('cardio.km')}</Text>
                <Text style={styles.pauseStat}>{fmtPace(distanceKm >= 0.05 ? elapsedSec / distanceKm : 0)} {t('cardio.perKm')}</Text>
              </View>
            </View>
          </PausedStage>
        ) : null}

        {/* end-confirm sheet — bound to the same condition as the overlay that arms it. */}
        {confirmEnd && paused ? (
          <BottomSheet onClose={props.onKeepGoing}>
            <Legend style={styles.sheetLegend}>{t('cardio.endLegend')}</Legend>
            <Text style={styles.sheetTitle}>{t('cardio.endTitleRun')}</Text>
            <Text style={styles.sheetBody}>{t('cardio.endBody')}</Text>
            <View style={styles.sheetActions}>
              <Button variant="primary" block label={t('cardio.keepGoing')} onPress={props.onKeepGoing} />
              <Button variant="danger" block label={t('cardio.finish')} onPress={props.onFinish} />
            </View>
          </BottomSheet>
        ) : null}

        {/* 3.4b · KILOMETRE LOGGED — fires over the run each km, clears itself. */}
        {kmMoment ? <KmMoment split={kmMoment} splits={splits} /> : null}

      </SafeAreaView>
    </View>
  );
}

/* ===================== KILOMETRE LOGGED (moment) — 3.4b ===================== */
/** EXPORTED for the gallery (3.4b): it already takes only props. */
export function KmMoment({ split, splits }: { split: CardioSplit; splits: CardioSplit[] }) {
  const { t } = useCopy();
  const perKm = t('cardio.perKm');
  const paces = splits.map((s) => s.paceSec);
  const avg = paces.length ? paces.reduce((a, b) => a + b, 0) / paces.length : split.paceSec;
  const fastest = paces.length ? Math.min(...paces) : split.paceSec;
  const quickest = split.paceSec <= fastest; // this split IS the quickest so far (ties count)
  // Place the split against the run average — faster (lower pace) sits left of centre, slower right.
  const dev = avg > 0 ? Math.max(-0.4, Math.min(0.4, (split.paceSec - avg) / avg)) : 0;
  const dotFrac = 0.5 + dev;
  return (
    <View style={styles.kmMoment}>
      <View style={styles.liveTop}>
        <Legend size={RUN_LEGEND_PT} tone="onStage">{t('cardio.liveLegend')}</Legend>
      </View>

      <View style={styles.kmBody}>
        <View style={styles.kmBandWrap}>
          <View style={styles.kmBand}>
            <View style={styles.kmBandLine} />
            <View style={styles.kmBandSeg} />
            <View style={[styles.kmBandCap, { left: '24%' }]} />
            <View style={[styles.kmBandCap, { left: '76%' }]} />
            <View style={[styles.kmBandDot, { left: `${dotFrac * 100}%` }]} />
          </View>
          {/* ⛔ The rail's own caption, at the size of a statement — it names the kilometre this
              whole beat is about, and it was the same 17 points as the "quickest" footnote. */}
          <Legend size={26} track={0.2} align="center" style={styles.kmBandLabel}>
            {t('cardio.kmMomentLabel', { km: split.km })}
          </Legend>
        </View>

        {/* the split — figures alone in the light: mono. */}
        <View style={styles.kmSplit}>
          <Text style={styles.kmSplitNum}>{fmtPace(split.paceSec)}</Text>
          <Text style={[styles.kmSplitUnit, !monoCanDraw(perKm) && styles.unitWord]}>{perKm}</Text>
        </View>

        {quickest ? (
          <View style={styles.kmQuickest}>
            <Icon name="checkCheck" size={14} color={signal[0]} strokeWidth={2.4} />
            <Legend size={RUN_SMALL_PT} track={0.12} tone="accent">{t('cardio.kmMomentQuickest')}</Legend>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* ============================ DONE (stage) — 3.4c ============================ */
/**
 * EXPORTED for the gallery (3.4c). `preview` is the harness's contract: the gallery is for LOOKING
 * at a screen, and this one PERSISTS on mount — a mount that saved a fictional run into the real
 * log would be the harness changing the data it exists to show.
 */
export function CardioComplete(props: {
  navigation: Props['navigation'];
  /** Gallery only — render the stage without recording anything. */
  preview?: boolean;
  gait: CardioGait;
  startedAt: string;
  elapsedSec: number;
  distanceKm: number;
  avgHr: number | null;
  calories: number;
  splits: CardioActivity['splits'];
  route: CardioPoint[];
}) {
  const { t } = useCopy();
  const kmUnit = t('cardio.km');
  const { navigation, gait, elapsedSec, distanceKm, avgHr, splits, route } = props;
  const avgPace = distanceKm >= 0.05 ? elapsedSec / distanceKm : 0;
  const perKmLabel = t('cardio.perKm');
  /*
   * "TUESDAY 4 AUGUST" — composed part by part to dodge the locale's comma, exactly as CardioDetail
   * does it. A poster carries a date; a screenshot with none is a picture of nothing in particular.
   */
  const started = new Date(props.startedAt || Date.now());
  const dateLabel = [
    started.toLocaleDateString(undefined, { weekday: 'long' }),
    started.toLocaleDateString(undefined, { day: 'numeric' }),
    started.toLocaleDateString(undefined, { month: 'long' }),
  ].join(' ');
  const hasRoute = route.length >= MIN_ROUTE_POINTS;

  // Persist the recorded activity exactly once, on mount (sealed from the engine). Route / splits /
  // hr / calories are all still saved to the log — they are simply not drawn on this stage.
  const saved = useRef(false);
  useEffect(() => {
    if (saved.current) return;
    saved.current = true;
    if (props.preview) return; // the harness looks; it never writes
    if (!cardioPerformed(elapsedSec, distanceKm)) return;
    const activity: CardioActivity = {
      kind: 'cardio',
      id: `cardio_${Date.now()}`,
      /*
       * ⛔ THE ACTIVITY IS LABELLED BY WHAT IT WAS, NOT BY WHAT SHE PICKED (founder 2026-08-04) —
       * there is no picker, and `gait` has been a hard-coded 'run' since v7, so every walk in her
       * history was filed as a run. Its own average pace is a better witness than a constant.
       *
       * `avgPace` is 0 on an activity too short to have one; `gaitFromPace` answers 'run' there,
       * which is the value that was being written anyway.
       */
      gait: gaitFromPace(avgPace),
      startedAt: props.startedAt || new Date().toISOString(),
      durationSec: Math.round(elapsedSec),
      distanceKm: Math.round(distanceKm * 100) / 100,
      avgPaceSec: Math.round(avgPace),
      ...(avgHr != null ? { avgHr: Math.round(avgHr) } : {}),
      ...(props.calories > 0 ? { calories: Math.round(props.calories) } : {}),
      splits,
      ...(hasRoute
        ? { route: simplifyRoute(route).map((p) => ({ lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5) })) }
        : {}),
    };
    void db.appendCardioActivity(activity).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.stage}>
      <SafeAreaView style={styles.stageSafe} edges={['top', 'bottom']}>
        <View style={styles.doneBody}>
          {/*
            ⛔ THE RUN'S POSTER (founder 2026-08-04). Same grammar as the workout's, one screen over:
            wordmark, date, name, one enormous figure, the facts, and DONE. No share control —
            *"SHARE makes us look like we want publicity; they can screenshot it and post it."*

            Everything above the act is screenshot-safe: no back arrow, no title bar, the mark
            carried whole. A phone screen is 9:16, and this is what goes on a story.
          */}
          <View style={styles.posterMark}>
            <RangeMark />
            <Text style={styles.posterWord}>hush</Text>
          </View>

          <View style={styles.posterFill} />

          <Text style={styles.posterDate}>{dateLabel.toUpperCase()}</Text>
          {/*
            ⛔ THE TITLE IS THE MOVEMENT, NEVER THE PRESCRIPTION (founder 2026-08-04): *"at the top
            it says Easy 6k but the example covered 5.2 km."* A name with a number in it can always
            disagree with the number under it — and it disagrees exactly when she stopped short,
            which is the moment a poster must not be caught arguing with her.
          */}
          {/*
            ════════════════════════════════════════════════════════════════════════════════════════
            ⛔ THE FINISHED ACTIVITY IS "CARDIO", NOT "RUN" OR "WALK" (founder, 2026-08-12)

              *"אם המתאמן גם רץ וגם הולך באותו אימון איך נציג את זה כריצה או הליכה?! צריך להציג את
              זה כקרדיו אחד בדיוק כמו שאמרת שאנו עושים קרדיו מדויק מאוד."*

            He caught me holding two positions at once, and he is right about which one to drop. I
            argued that no gait question is needed because `kcalPerKgKm` interpolates continuously
            through the walk-run region **and bills every segment at its own pace** — and then this
            line collapsed the whole activity into one word by taking `gaitFromPace` of the AVERAGE.

            ⚠️ ON A MIXED SESSION THE AVERAGE IS NOBODY'S GAIT. Twenty minutes walking and twenty
            running averages to a jog that never happened, and the poster titles her session with it.
            The energy underneath was right the entire time; only the headline was picking a side.

            **The splits already carry the truth** — each one is stamped with its own `gait` — so
            nothing is lost by the title telling the honest, general fact instead.
            ════════════════════════════════════════════════════════════════════════════════════════
          */}
          <Text style={styles.posterName}>{t('cardio.liveLegend')}</Text>

          <View style={styles.doneHero}>
            <Text style={styles.doneHeroNum}>{distanceKm.toFixed(1)}</Text>
            <Text style={[styles.doneHeroUnit, !monoCanDraw(kmUnit) && styles.unitWord]}>{kmUnit}</Text>
          </View>

          {/*
            ⛔ PACE IS A HERO LINE, NOT SMALL PRINT (founder 2026-08-04): *"the pace per kilometre
            appears in very small type, and that small type is something I forbid."* It is the number
            a runner reads first, and it was set at eleven points wedged between two other things.

            ⚠️ Absent on a run too short to have an average — `avgPace` is 0 there, and "0:00 /km" is
            a fabrication rather than a measurement.
          */}
          {avgPace > 0 ? (
            <View style={styles.posterPace}>
              <Text style={styles.posterPaceNum}>{fmtPace(avgPace)}</Text>
              <Text style={[styles.posterPaceUnit, !monoCanDraw(perKmLabel) && styles.unitWord]}>{perKmLabel}</Text>
            </View>
          ) : null}

          {/*
            ⛔ THE SHAPE OF THE RUN, AND NOT THE ROUTE (founder 2026-08-04, choosing B).

            *"Is this map any good at all? It looks like a drawing from one point to another — it
            isn't remotely clear that it's a route of anything."* He was judging a sketch I drew by
            hand rather than `RouteTrace`, which projects the real fixes — but the conclusion holds
            for the real one too: **a polyline with no streets under it is legible to exactly one
            person, the woman who ran it, and she already knows.** A poster is read by strangers in
            two seconds.

            The splits are not: one bar per kilometre, and the shape of the effort is there in the
            dimension that actually describes a run. The trace keeps its home in the run's own
            record — which is also the first screen ever to mount it.

            ⚠️ AND HIS MAP RULING STANDS UNTOUCHED (`RouteTrace`, 2026-07-12, "do not reopen"): no
            map SDK, ever. This decision did not go near it.
          */}
          {splits.length > 0 ? (
            <View style={styles.doneShape} accessibilityRole="image" accessibilityLabel={t('cardio.shapeLabel', { count: splits.length })}>
              {splits.map((sp) => {
                const best = Math.min(...splits.map((x) => x.paceSec));
                const h = Math.max(0.26, Math.min(1, best / Math.max(1, sp.paceSec)));
                return <View key={sp.km} style={[styles.shapeBar, { height: `${h * 100}%` }]} />;
              })}
            </View>
          ) : null}

          <View style={styles.doneRow}>
            <DoneStat value={fmtClock(elapsedSec)} label={t('cardio.timeShort')} />
            <DoneStat value={Math.round(props.calories)} label={t('cardio.kcal')} icon="flame" />
            {/* Same law as the live row, asked of the right fact: the LIVE stage asks whether an
                instrument exists, a SAVED run asks whether a measurement was taken. A run with no
                average heart rate is not a run with a blank one. */}
            {avgHr != null ? <DoneStat value={Math.round(avgHr)} label={t('cardio.avgHrShort')} icon="heart" /> : null}
          </View>

          <View style={styles.posterFill} />
        </View>

        <View style={styles.doneFooter}>
          <Button variant="onstage" size="lg" block label={t('cardio.done')} onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    </View>
  );
}

/* ---- small instrument readouts ---- */
function LiveStat({ value, label, icon }: { value: string | number; label: string; icon?: 'heart' | 'flame' }) {
  return (
    <View style={styles.liveStat}>
      <View style={styles.liveStatRow}>
        {icon ? <Icon name={icon} size={18} color={signal[0]} strokeWidth={2} /> : null}
        <Text style={styles.liveStatVal}>{value}</Text>
      </View>
      <Legend size={READOUT_LABEL_PT} track={0.14} tone="onStage">{label}</Legend>
    </View>
  );
}

function DoneStat({ value, label, icon }: { value: string | number; label: string; icon?: 'heart' | 'flame' }) {
  return (
    <View style={styles.doneStat}>
      <View style={styles.liveStatRow}>
        {icon ? <Icon name={icon} size={16} color={signal[0]} strokeWidth={2} /> : null}
        <Text style={styles.doneStatVal}>{value}</Text>
      </View>
      <Legend size={READOUT_LABEL_PT} track={0.14} tone="onStage">{label}</Legend>
    </View>
  );
}

const MOSS_WASH = 'rgba(169,196,159,0.12)';
const MOSS_BORDER = 'rgba(169,196,159,0.3)';
const LINE = 'rgba(241,238,229,0.16)';

/* ════ THE RUN'S SMALL TYPE (founder B.7) ════
 *
 * "The type is tiny — '0 מטר', the kilometre label, and the word 'קרדיו' at the top. Enlarge all
 * of it; there is plenty of room."
 *
 * These were NOT drift: the built screen was a faithful 1:1 of the canonical handoff, which sets
 * the legend at 12, the band labels at 10, the metres at 21 and the readout labels at 10.5. He is
 * overriding his own design file, and the reason it survived design review and failed on a device
 * is worth writing down: **the handoff was drawn in English.** "CARDIO", "0", "1,000 M", "KM",
 * "HR", "KCAL" are Latin CAPITALS at heavy tracking — the small-caps trick that makes a 10 px
 * label read as deliberate rather than merely small. Hebrew has no uppercase, so "קרדיו", "ק״מ",
 * "דופק" and "קק״ל" get none of that; they are just tiny words. Nothing else on this screen is
 * competing for the space — the hero clock is 84 px and the body is centred with 30 px gaps.
 *
 * Declared as constants because two components draw the same readout (LiveStat on the run, DoneStat
 * on the saved stage) and the run's own legend appears twice (live, and the kilometre moment). One
 * of those drifting away from the others is precisely how a screen ends up half-fixed.
 */
/*
 * ════ ⛔ ALL FOUR ARE 17 NOW, AND THIS IS THE SCREEN HE NAMED ════
 *
 * FOUNDER, on this file, twice: *"שוב מסך הקרדיו בפעם האלף — ביקשתי ממך להגדיל את הכתב ואתה לא
 * מקשיב לי."* And on 2026-08-12, ruling the floor at 17 for the whole product.
 *
 * They were 15, 12.5, 15 and 13. ⚠️ **AND THEY HID FROM THE LAW BY BEING NAMED.** `typeHasAFloor`
 * matched `<Legend size={12.5}>` — a literal — and these are `<Legend size={RUN_SMALL_PT}>`. The
 * constants were introduced to stop the four drifting apart, which they did; nobody noticed they
 * had also stepped out of the sweep's line of sight, so the one screen he complained about most
 * kept its small type through every pass of a law written because of it.
 *
 * The law resolves module-level constants now. See `typeHasAFloor`.
 */
/** "CARDIO" — the legend over the run, and over the kilometre moment. */
const RUN_LEGEND_PT = 17;
/**
 * THE FLOOR for every other word on a cardio stage — the 1,000 m band's end labels, the split
 * pill, the kilometre moment's label and its "quickest" tag, and the saved stage's legend.
 *
 * It is a FLOOR, not a size for one element, because "the type is tiny" was never about three
 * particular labels. He named the three he happened to be looking at; the rest of the surface was
 * set the same way and would have failed the same reading. `nothingOnTheRunIsTooSmall` holds it.
 */
const RUN_SMALL_PT = 17;
/** The band's own label — raised from 12.5 because it is read at arm's length, mid-run. */
const RUN_LABEL_PT = 17;
/** KM · HR · KCAL under their figures — live, and on the saved stage, which must agree with it. */
const READOUT_LABEL_PT = 17;

const styles = StyleSheet.create({
  // stage (shared)
  stage: { flex: 1, backgroundColor: stageC[0] },
  stageSafe: { flex: 1 },

  // countdown
  countdownWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  startingLegend: { fontFamily: font.sansSemibold, fontSize: textScale.md, letterSpacing: trackingPx(textScale.md, tracking.legend), color: stageC.ink1, marginBottom: 28, textAlign: 'left' },
  countNum: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: 140, lineHeight: 150, letterSpacing: -6, color: stageC.ink0, textAlign: 'left' },
  countGo: { fontFamily: font.sansBold, letterSpacing: -4, color: stageC.lift }, // rtl-ok

  // LIVE (3.4)
  // The coach speaking, on the stage: the serif it uses everywhere else it talks.
  // The 38px chrome disc, in the cardio stage's own inks — the same shape and the same weight as
  // the strength stage's, because it is the same control.
  pointsDisc: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(241,238,229,0.08)', borderWidth: 1, borderColor: 'rgba(241,238,229,0.12)',
  },
  pointsDiscPressed: { backgroundColor: 'rgba(241,238,229,0.14)' },
  liveTop: { flexDirection: 'row', alignItems: 'center', paddingTop: 14, paddingHorizontal: 24 },
  liveTopSpacer: { width: 38 },
  liveTopCentre: { flex: 1, alignItems: 'center' },
  /*
   * ⛔ THE CLOCK RISES (founder 2026-08-05): *"raise the running time a bit at the top and
   * significantly enlarge the text above the bar."* The body centred its three children with 30 of
   * air between them, which on a tall phone left the clock floating in the middle of a screen whose
   * top third was empty. It hangs from the top now and the band follows it.
   */
  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ AND IT IS STILL TOP-HEAVY BEFORE THE FIRST KILOMETRE (founder, 2026-08-12, second time)
   *
   * The per-kilometre rows landed and he photographed the screen again — at **0:00**, where there
   * are no splits yet, so neither the rows nor the bar texture render and the body is three items
   * hanging from `flex-start` over four hundred points of black. **The fix I shipped only helps
   * from the first kilometre on**, and the first minute is exactly the founder's complaint both
   * times.
   *
   * `space-between` distributes whatever the run has: three items at the start, five once she is
   * running. The screen is full either way, which is what "spread out" has to mean on a surface
   * whose contents grow.
   * ════════════════════════════════════════════════════════════════════════════════════════════
   */
  /*
   * ⛔ BACK TO `flex-start`, AND THIS TIME IT IS RIGHT — because the RING fills the screen.
   *
   * `space-between` was the third attempt at fixing a top-heavy stage by moving spacing around; the
   * founder's ring is what actually fixed it. With a 268-point instrument under the clock the body
   * is full from the top whether or not any kilometres have landed — and `space-between` now does
   * harm: with three children it pushes the ring into the middle of the page and with five it does
   * not, so the same screen sits in two places depending on how long she has been running.
   *
   * **The ring must not move between the first minute and the fortieth.**
   */
  liveBody: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', gap: 26, paddingTop: 18, paddingBottom: 28, paddingHorizontal: 26 },
  /* One kilometre, one row — see the note at the markup. */
  kmRows: { alignSelf: 'stretch', marginTop: 4 },
  kmRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 14,
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(241,238,229,0.14)',
  },
  kmRowOrdinal: { flex: 1 },
  kmRowTime: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: 30, lineHeight: 34, color: stageC.ink0, includeFontPadding: false, textAlign: 'left' },
  kmRowUnit: { fontFamily: font.mono, fontSize: 17, color: stageC.ink2, textAlign: 'left' },
  // The elapsed clock is the lit thing on a run, exactly as the load is on a set: the BRIGHT
  // cream with a wide soft glow, never the plain ink.
  clock: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 84,
    lineHeight: 88,
    includeFontPadding: false,
    letterSpacing: -3.36,
    color: '#f6f3ea',
    textAlign: 'left',
    textShadowColor: 'rgba(246,243,234,0.12)',
    textShadowRadius: 44,
    textShadowOffset: { width: 0, height: 0 },
  },

  // ── the 1,000 m band, at the canonical handoff's own offsets (C.19: "not what the HTML draws")
  //    The labels belong ABOVE the box (top:-16), not tucked inside it — having them inside is what
  //    pushed every internal down ~15 px and left the metres readout hanging off the bottom edge.
  /* ⛔ The `band*` styles went with the horizontal rule they drew — see `DistanceRing`. An
     orphaned style is what comes back a year later attached to something it was never about. */

  /*
   * ⛔ THE SHAPE OF THE RUN — furniture, and it has to stay furniture (founder 2026-08-04).
   *
   * At eight kilometres an hour nothing may compete with the clock. No numbers on it, no axis, no
   * labels: a texture read at a glance or not at all. The one lit bar is the kilometre she is
   * standing in, which is the only part of it that is news.
   *
   * ⚠️ It draws NOTHING before the first kilometre lands, rather than an empty frame — an axis with
   * no data on it is a promise the screen has not kept yet.
   */
  /* ⛔ `shape` (the LIVE texture) is deleted with its markup. `shapeBar` survives because the DONE
     poster still draws the finished run's bars, where there is nothing beside them saying the same
     thing in figures — the objection was to two readings of one fact on the live stage. */
  shapeBar: { flex: 1, borderRadius: 2, backgroundColor: 'rgba(241,238,229,0.22)' },

  gpsStatus: { fontFamily: font.sans, fontSize: textScale.xs, color: stageC.ink2, letterSpacing: 0.3, textAlign: 'left' },

  liveRow: { flexDirection: 'row', width: '100%', maxWidth: 340, justifyContent: 'space-evenly', borderTopWidth: 1, borderTopColor: 'rgba(241,238,229,0.1)', paddingTop: 26 },
  liveStat: { alignItems: 'center', gap: 5 },
  liveStatRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveStatVal: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 36, color: stageC.ink0, textAlign: 'left' },

  liveFooter: { paddingHorizontal: 26, paddingBottom: 30, gap: 12 },
  splitPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 11, paddingHorizontal: 16, borderRadius: radius.full, backgroundColor: MOSS_WASH, borderWidth: 1, borderColor: MOSS_BORDER },

  // 13.1 — what a PAUSED RUN states under the sentence. The lifting stage states nothing there:
  // a set has no clock of its own to hold, and a run does.
  pausedFacts: { alignItems: 'center', gap: 10 },
  pausedClock: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale['4xl'], letterSpacing: -1.4, color: stageC.ink0, textAlign: 'center' },
  pausedStats: { flexDirection: 'row', gap: 24 },
  pauseStat: { fontFamily: font.sans, fontVariant: ['tabular-nums'], fontSize: textScale.sm, color: stageC.ink1, textAlign: 'center' },

  // the end-confirm sheet (paper — a decision, not part of the stage)
  sheetLegend: { marginBottom: 10 },
  sheetTitle: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, textAlign: 'left' },
  sheetBody: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 23, color: color.textSecondary, marginTop: 10, textAlign: 'left' },
  sheetActions: { marginTop: 22, gap: 10 },

  // DONE (3.4c)
  /*
   * ════ THE RUN'S POSTER (founder 2026-08-04) ════
   *
   * `justifyContent: 'center'` is gone: the poster has a TOP (the mark) and a BOTTOM (the facts),
   * with two flexible spacers between, so it fills a 9:16 frame the way a poster does rather than
   * clustering in the middle of one. Every figure is sized to be read in a screenshot on somebody
   * else's phone — nothing here is under 11.5.
   */
  doneBody: { flex: 1, alignItems: 'center', gap: 20, paddingHorizontal: 34 },
  posterFill: { flex: 1 },
  posterMark: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  posterWord: { fontFamily: font.serif, fontSize: 20, color: stageC.ink0, textAlign: 'left' },
  posterDate: {
    fontFamily: font.sansMedium,
    fontSize: 17,
    letterSpacing: 1.9,
    color: stageC.ink2,
    textAlign: 'center',
  },
  posterName: { fontFamily: font.serif, fontSize: 34, lineHeight: 38, color: stageC.ink0, textAlign: 'center', marginTop: -8 },
  posterPace: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, marginTop: -12 },
  posterPaceNum: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -0.9,
    includeFontPadding: false,
    color: signal[0],
    textAlign: 'left',
  },
  posterPaceUnit: { fontFamily: font.mono, fontSize: 17, color: stageC.ink2, textAlign: 'left' },
  /* The same instrument as the live stage's, so a run looks the same finished as it did inside it. */
  doneShape: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 46, width: '100%', maxWidth: 300 },
  doneHero: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 10 },
  doneHeroNum: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 106,
    lineHeight: 108,
    includeFontPadding: false,
    letterSpacing: -4.77,
    color: '#f6f3ea',
    textAlign: 'left',
    textShadowColor: 'rgba(246,243,234,0.14)',
    textShadowRadius: 44,
    textShadowOffset: { width: 0, height: 0 },
  },
  doneHeroUnit: { fontFamily: font.mono, fontSize: 22, color: stageC.ink1, textAlign: 'left' },
  doneRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-evenly', borderTopWidth: 1, borderTopColor: 'rgba(241,238,229,0.1)', paddingTop: 26 },
  doneStat: { alignItems: 'center', gap: 5 },
  doneStatVal: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 30, color: stageC.ink0, textAlign: 'left' },
  doneFooter: { paddingHorizontal: 26, paddingBottom: 30 },

  // KILOMETRE LOGGED (3.4b) — a full, opaque overlay; the run keeps tracking underneath.
  kmMoment: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: stageC[0] },
  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ THE KILOMETRE BEAT TAKES THE WHOLE SCREEN (founder, 2026-08-12)
   *
   *   *"תגדיל את כל החלק שמעל הזמן ואת ה-KM שליד הזמן — זה באמצע ריצה והליכה ויש לנו את כל המסך
   *   תתפרש עליו."*
   *
   * It was a 230-point rail, a 17-point label and a `/km` at 20, floated as one centred block with a
   * 24-point gap — measured, everything above the split occupied about a hundred points of an
   * 844-point screen and the rest was black.
   *
   * ⚠️ AND SHE IS READING IT AT EIGHT KILOMETRES AN HOUR, which is the whole argument. This is the
   * one beat in the product with no thumb on the way — it fires by itself and clears itself — so
   * there is nothing to reach and nothing to avoid covering. Every point on the page is available
   * and none of it was being used.
   * ════════════════════════════════════════════════════════════════════════════════════════════
   */
  kmBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 46, paddingHorizontal: 26, marginTop: -16 },
  kmBandWrap: { alignSelf: 'stretch', alignItems: 'center', gap: 20 },
  kmBand: { alignSelf: 'stretch', height: 30, justifyContent: 'center' }, // 230 → the full stage
  kmBandLine: { position: 'absolute', left: 0, right: 0, top: 14, height: 2, backgroundColor: 'rgba(241,238,229,0.22)' },
  kmBandSeg: { position: 'absolute', left: '24%', right: '24%', top: 12, height: 6, borderRadius: 3, backgroundColor: 'rgba(169,196,159,0.55)' },
  kmBandCap: { position: 'absolute', top: 2, width: 3, height: 26, borderRadius: 1.5, backgroundColor: signal[0] },
  kmBandDot: { position: 'absolute', top: 1, marginLeft: -14, width: 28, height: 28, borderRadius: 14, backgroundColor: stageC.ink0, borderWidth: 4, borderColor: signal[0] }, // rtl-ok: centering offset pairs with the physical `left` set inline; the km band is a direction-neutral data axis
  kmSplit: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  kmSplitNum: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 104,
    lineHeight: 106,
    includeFontPadding: false,
    letterSpacing: -4.68,
    color: signal[0],
    textAlign: 'left',
    textShadowColor: 'rgba(169,196,159,0.18)',
    textShadowRadius: 44,
    textShadowOffset: { width: 0, height: 0 },
  },
  /* ⛔ 20 → 30 (founder: *"ואת ה-KM שליד הזמן"*). It is the unit of the largest figure on the
     screen and it was set smaller than the label above the rail. */
  kmSplitUnit: { fontFamily: font.mono, fontSize: 30, color: stageC.ink1, textAlign: 'left' },
  kmBandLabel: { color: stageC.ink0 },
  kmQuickest: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // The sans sibling every mono UNIT slot hands over to when the locale spells it in Hebrew.
  unitWord: { fontFamily: font.sans },
});
