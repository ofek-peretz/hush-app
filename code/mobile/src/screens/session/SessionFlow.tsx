/**
 * Session Flow — the live workout, rebuilt 1:1 to the Claude Design "Design
 * System" LiveWorkout (ui_kits/app/LiveWorkout.jsx). The core of the product, on
 * the inverted **stage**: the room disappears, one decision remains.
 *
 * A small state machine over the REAL session engine (sessionStore — unchanged):
 *   set → logged (a capture beat) → rest / transition → … → Well Done.
 * Overlays (bottom sheets): Form (demo), Swap, Pause, Finish.
 *
 * Everything the engine owns is preserved: targets/loads from the frozen model,
 * per-set logging at Complete Set, the save-before-Well-Done invariant, rest
 * timing, edit-result (inline WheelPickers), swap (current + upcoming), finish.
 */

// 

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, AppState, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import Animated, { useSharedValue, useAnimatedProps, useAnimatedStyle, withDelay, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Icon, type IconName } from '@/components/Icon';
import { Arrive, Button, IconButton, RestRing, Card, LoadDelta, Legend, NumberPad, useToast, type ToastAction } from '@/components/ds';
import { PausedStage } from '@/components/PausedStage';
import { BottomSheet } from '@/components/BottomSheet';
import { ReorderRows } from '@/components/ReorderRows';

import { ExerciseDemo } from '@/components/ExerciseDemo';
import { useCopy } from '@/i18n/useCopy';
import { currentLocale } from '@/i18n';
import { track } from '@/platform/telemetry';
import { bidi } from '@/i18n/bidi';
import { MotionThumb } from '@/motion/render/MotionThumb';
import { MotionFigure } from '@/motion/render/MotionFigure';
import { STAGE_FRAME_ASPECT } from '@/motion/frame';
import { exerciseMotion } from '@/motion/registry';
import { drinkingRig, loggingRig, restingRig } from '@/motion/library/life';
import { useApp } from '@/state/stores/appStore';
import { useFocusedStatusBar } from '@/platform/statusBar';
import { useSession, filmSubject, type CompleteResult } from '@/state/stores/sessionStore';
import { exerciseById, exerciseCues, exerciseDisplayName } from '@/data/exercises';
import { exerciseNameSize } from '@/screens/session/nameSize';
import { useVoiceCoach } from '@/platform/voice/useVoiceCoach';
import { weightStepFor } from '@/domain/weightStep';
import { emptyBarKg } from '@/engine/loadMath';
import { isOutdoorMovement, isTrackedMovement } from '@/data/movements';
// `OpenStage` was imported here for a week after it was deleted (2026-08-12). `ItemStage` exports
// no such binding; `@ts-nocheck` is why nothing said so, and nothing rendered it, so nothing broke.
import { TimeStage, DistanceStage, SayLine, clockOf, distanceOf } from '@/screens/session/ItemStage';
import { swapChoices, type SwapChoice } from '@/domain/swapPool';
import { SwapSheet } from '@/components/SwapSheet';
import { PairStrip } from '@/components/PairStrip';
import { usePair } from '@/state/stores/pairStore';
import { SHARED_SWAP_WAIT_MS, sharedRestEndsAt } from '@/domain/sharedSession';
import { PairSwapSheet } from '@/components/PairSwapSheet';
import { displayWeekNumber } from '@/domain/weekCadence';
import { displayWeight, kgFromDisplay, unitLabel, learnPhaseLength } from '@/domain/schedule';
import { equipmentLoad, equipmentValue, loadSetup, rxType, totalFromEquipment, type LoadSetup } from '@/domain/loadPresentation';
import { StageBreath } from '@/components/StageBreath';
import { db } from '@/data/local/db';
// ⛔ ONE DOOR ONTO HER WEEK, whoever wrote it — the coach's plan when there is one, the engine's
// programme in the same shape when there is not. See `data/local/weekPlan`.
import { loadWeekPlan } from '@/data/local/weekPlan';
import { coachChangedCase } from '@/domain/coachWeek';
import type { ChangedLiftCase } from '@/domain/changedLiftCase';
import type { CoachPlan, PlannedItem } from '@/domain/coachPlan';
import type { Session } from '@/data/local/models';
import { restWithSample, restedSeconds } from '@/domain/restPrescription';
import type { LastTime } from '@/domain/lastTimeOn';
import * as haptics from '@/platform/haptics';
import { restHaptics, REST_WARNING_LEAD_S } from '@/platform/restHaptics';
import { useReducedMotion } from '@/platform/reducedMotion';
import { legendVoice } from '@/design/monoVoice';
import { color, space, stage, font, ramp, rampLine, textScale, tracking, trackingPx, signal, up, down, hold, radius, press, line, motion, directionTone } from '@/design/tokens';
import { bandOf } from '@/domain/setRow';
import { isRecordSet } from '@/domain/setRecord';
import { loadNews } from '@/domain/loadNews';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'SessionFlow'>;
/*
 * ⛔ `'coach'` IS GONE (founder, 2026-08-12). The sheet behind it held three chips, and he closed
 * all three in one sentence: *"להחליף תרגיל יש את כפתור ה-SWAP שמופיע בסט הראשון בתרגיל הראשון ואז
 * במסכי ה-TRANSITION REST. וזה נראה לי פותר גם את SKIP THIS כי במקום לדלג המתאמן פשוט יכול ללחוץ
 * SWAP."* He is right on both counts and the second is the sharper one: a lift she wants gone is a
 * lift she wants REPLACED, and swapping keeps the volume the week was balanced around.
 */
type Overlay = 'none' | 'pause' | 'endConfirm' | 'reasoning' | 'demo' | 'firstGym' | 'points' | 'swap' | 'map' | 'pairSwap';
export type Confirm = {
  weight: number | null;
  reps: number;
  n: number;
  m: number;
  /** The set was a warm-up bridge. A bridge is not a measurement (`theWarmupIsABridgeNot-
   *  AMeasurement`), so the logged beat must not judge it against a band nor promise its load
   *  "stays" — the next set's load is a DIFFERENT rung of the ramp (eye-pass 2026-08-26). */
  warmup?: boolean;
  /** This set struck her all-time record on the lift (domain/setRecord — the share card's exact
   *  rule, so the beat and the poster can never disagree about the same bar). */
  record?: boolean;
  /**
   * ⛔ HER BAND — [Tlo, Thi], the IMMUTABLE one, never the reps she edited (founder, 2026-08-04).
   *
   * *"I really did say that if the athlete is inside the range there would be a confirmation of
   * landing inside the range; if it falls out at the bottom that's blue and the weight comes down,
   * and the same going out at the top, in green."*
   *
   * Only the two ends were ever built, because both hung off Loop 1 — and Loop 1 fires ONLY when
   * the reps leave the band. So the case that happens most had no picture at all, and the band she
   * is being measured against was invisible on the beat that measures her against it.
   *
   * Absent on a step with no rep prescription (a hold, a distance), where there is no band.
   */
  band?: [number, number];
  /**
   * ⛔ THE LIFT THIS SET BELONGED TO — added 2026-08-05, and it is what makes the lift-done beat
   * survive a step with no band. See `ExerciseDone`: it drew a row of pips and a band mark, and
   * when there was no band the whole screen was four green dots on black. The founder photographed
   * that and described it exactly: *"the exercise-finished screen shows a black screen with only
   * dots at the top."*
   *
   * The wrist has said "Leg Press, done." since it was built. The phone had nothing.
   */
  lift?: string;
};

const CONFIRM_DWELL_MS = 1400; // the deliberate "Set logged" capture beat
/**
 * ⛔ AND A LIFT CLOSING HOLDS LONGER THAN A SET LANDING (founder, 2026-08-26 — the ring).
 *
 * 1400 was measured against a beat that was fully drawn on its first frame. The ring is not: the
 * last arc sweeps for 600 ms after an 80 ms hold, and the bloom leaves at that instant and runs for
 * `motion.dur.bloom`. At 1400 the athlete would be moved to her rest **while the animation she was
 * asked to be shown was still running** — which is the one way to make ceremony read as a glitch.
 *
 * ⚠️ 2600 IS THE ANIMATION'S OWN LENGTH, NOT A ROUND NUMBER: 80 + 600 + 1400 = 2080 of motion, and
 * the remainder is the beat of stillness a finished thing is owed before the screen moves on. The
 * ordinary capture is untouched — a set landing is not an event, and the founder's "an ordinary set
 * gets no ceremony" rule is exactly what the ring's continuity is spending its ceremony to earn.
 */
const LIFT_DONE_DWELL_MS = 2600;
/** The last set of a lift — the one beat that closes something. Asked in one place, so the dwell
 *  and the beat can never disagree about which screen is up. */
function closesTheLift(c: Confirm | null): boolean {
  return !!c && c.n >= c.m && c.m > 1;
}
/** 2.4d holds the screen a beat longer than a capture: it is showing a plan changing, not a log. */
const PACE_BEAT_MS = 2600;
// When the set just logged moved the next one, the capture beat holds a moment longer as the
// correction reveal (mock 2.3) — the old load struck, the eased/raised one standing in its place —
// before it releases to rest. Long enough to read the change, short enough to stay "one breath".
/**
 * ════ THE LIFT-DONE BEAT IS WHERE THE QUESTION LIVES (2026-07-31) ════
 *
 * The coach's most valuable missing input is how hard it was, and the cheapest place to ask is the
 * beat that already holds the whole stage to say nothing (the founder's own note: this screen "does
 * not look good enough"). It cost 1.4 s of the athlete's workout and told her the lift she had just
 * finished was finished.
 *
 * **Answering is the FAST WAY OUT.** A tap releases the beat immediately, so the athlete who answers
 * reaches her rest sooner than the one who does not — the question is never a toll. This window is
 * only the ceiling for someone who ignores it, and it is deliberately short for that reason.
 *
 * Crucially it opens AFTER the set is written, not before: the dwell used to sit in front of
 * `completeSet`, and stretching that would have left a logged set unsaved for the whole window.
 */
/** Once-per-install key for the "We're learning your gym" first-workout note. */
const FIRST_GYM_KEY = 'first_workout_modal';

export function SessionFlow({ navigation, route }: Props) {
  const { t } = useCopy();
  const session = useSession();
  /* The voice coach (docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md) rides the same view this screen
     draws and presses the same verbs; with no earbuds it is silent and this screen is exactly what
     it was. The one thing read back is WHY it is silent, for the two reasons that are defects
     (a refused permission, a build with no engine) — one notice, once (see below). */
  const voice = useVoiceCoach(session);
  /* Two athletes, one bar (`state/stores/pairStore`). Solo — which is nearly every workout — every
     field below is in its resting state and nothing on this screen changes. */
  const pair = usePair();
  const partnerName = pair.partnerName ? bidi(pair.partnerName) : null;
  const toast = useToast();
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  /**
   * 2.4d · REST — LEARNED. Set when the athlete leaves a rest she CHANGED — cut short, or
   * stretched with +15. Not a verdict and not a question: the pace she actually rests becomes the
   * prescription, and this is the product saying so on the way past.
   */
  const [paceBeat, setPaceBeat] = useState<{ took: number; was: number; now: number | null } | null>(null);
  // Her completed sessions, read once, so the projection above is instant when the beat fires.
  // (`refreshLearnedRests` has already warmed the engine's own cache from the same read on Home.)
  const historyRef = useRef<Session[]>([]);
  useEffect(() => {
    let alive = true;
    void db.loadHistory().then((h) => {
      if (alive) historyRef.current = h;
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /**
   * ════ SHE WENT OUT AND RAN, AND THE RECORD PICKS IT UP WHEN SHE COMES BACK ════
   *
   * A GPS step hands the athlete to the cardio stage (`ItemBeat`), which measures the run, writes a
   * `CardioActivity`, and returns here. This is the other half: the step she left is still the
   * current one, and it is closed from what was MEASURED — the distance she actually covered and
   * the time it took — rather than from the ask.
   *
   * ⚠️ IT MUST NOT CLOSE THE STEP ON A RUN THAT DID NOT HAPPEN. She can open the stage, decide the
   * weather is wrong and come straight back; `cardioPerformed` refuses to write anything for that,
   * so there is simply no new activity and the step stands exactly where she left it. The guard is
   * the activity's own START INSTANT: only a run that began after she left this screen can be the
   * run this step is waiting for.
   */
  const leftForRunAtRef = useRef<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      const leftAt = leftForRunAtRef.current;
      if (leftAt == null) return;
      leftForRunAtRef.current = null;
      void db.loadCardio().then((all) => {
        const run = all.find((a) => Date.parse(a.startedAt) >= leftAt);
        if (!run) return; // she came back without running — the step is still hers to do
        void session.completeItem({
          metres: Math.round(run.distanceKm * 1000),
          seconds: run.durationSec,
          activityId: run.id,
        });
      }).catch(() => {});
    }, [session]),
  );

  /**
   * ════ AN ORDINARY SET GETS NO CEREMONY (founder, build 36 — C.13) ════
   *
   * The capture beat used to hold the stage for every logged set to say "✓ SET 2 OF 4 LOGGED /
   * 14 kg × 8 / Set recorded." — a leftover from the previous app. It restated the set she had just
   * performed and then handed over to rest, which is where she was going anyway. *"Just remove this
   * screen, because the one that comes after it is the one that matters — whether she landed inside
   * or outside her band."*
   *
   * So the beat now speaks only when it HAS something:
   *   · a CORRECTION — the set moved the next load. The most distinctive thing the product does.
   *   · the LAST SET of a lift — finishing a lift is a thing that happened; finishing a set is a
   *     thing that keeps happening.
   *   · IN THE BAND — the set landed where it was asked to, and the mark says so.
   * Anything else goes straight to rest.
   *
   * ⛔⛔ THE THIRD LINE IS THE FOUNDER'S CORRECTION OF MY READING OF THE FIRST TWO (2026-08-04):
   *
   *   > *"I really did say that if the athlete is inside the range there would be a confirmation of
   *   > landing inside the range."*
   *
   * His build-36 note names the thing he wanted in its second half — *"the one that matters is
   * whether she landed inside or outside her band"* — and I acted only on the first half. I deleted
   * a beat that restated the set she had just done ("14 kg × 8 · Set recorded") and put nothing in
   * its place, so the in-band case, which is most sets, showed her nothing at all. The instruction
   * was to REPLACE the restatement with the band, not to remove the beat.
   *
   * ⚠️ What made it survive is that the deletion looked like the founder's own law — silence is the
   * product agreeing with her — and it reads perfectly well as long as you never ask what the
   * athlete learns from the sets she gets right.
   */
  // ONE predicate, every caller — see `beatSpeaksFor`. Since the 2026-08-26 ruling every
  // working set speaks (the capture IS the beat); only a warm-up bridge logs in silence.
  const beatSpeaks = beatSpeaksFor(confirm);

  // ⛔ `editing` IS GONE (founder, 2026-08-26 — second cut): the editor room was deleted when its
  // two dials moved onto the stage itself, so there is no door state left to hold. The watch-safety
  // effect that closed it on `curIdx` went with it — a dial on the stage always belongs to the set
  // the stage is showing, by construction.
  /**
   * THE SET THE WRIST LOGGED IS LOGGED ON THE PHONE TOO (founder 2026-07-13: "I complete a set on
   * the watch and the phone never shows the logged screen").
   *
   * The phone's own beat is a DWELL BEFORE the write (`confirm` above): the stage holds the
   * numbers for 1.4 s, then the set is written and the rest begins. A watch completion writes at
   * once — the wrist is already resting — so the phone plays the same beat AFTER the fact, as a
   * layer over the rest that has already started underneath. That distinction is the whole design:
   * if this beat replaced the stage the way `confirm` does, the Rest screen would mount 1.4 s late
   * and anchor its countdown 1.4 s behind the wrist's. Two clocks, one workout — the exact bug the
   * mirror was fixed for. The rest runs on time under the beat; the beat just covers it.
   */
  const [watchBeat, setWatchBeat] = useState<Confirm | null>(null);
  // Anything already in the store when this screen mounts belongs to a PREVIOUS workout — never
  // replay it as a beat on this one.
  const seenWatchSeq = useRef(session.watchLoggedSet?.seq ?? 0);
  /**
   * A notice is on the stage (founder 2026-07-13: "when the swapped-to badge appears it should
   * cover the WHOLE start-of-exercise part"). The swap confirmation used to float half-over the
   * Start button — a big cream button sticking out from under a card, which reads as a rendering
   * fault. For the seconds a notice is up it IS the footer: the buttons stand down (invisible and
   * untouchable, but still holding their space, so nothing jumps), and the notice sits alone.
   */
  const [notice, setNotice] = useState(false);

  /**
   * EVERY notice on the stage goes through here, and every notice owns the footer while it is up.
   *
   * Not just the swap one. If a plain `toast.show` could still land on this screen, two things
   * would go wrong: it would half-cover the button exactly the way the swap toast did, and — worse
   * — showing it WHILE a swap notice was up would end the swap notice (a new toast retires the old
   * one), handing the footer back underneath a card that is still on screen. One door in, one law.
   */
  const noticeSeq = useRef(0);
  const notify = useCallback(
    (message: string, actions?: ToastAction[]) => {
      /*
       * ONLY THE LIVING NOTICE MAY HAND THE FOOTER BACK (founder, build 36 — C.12).
       *
       * `toast.show` retires whatever is on screen and fires ITS `onHide` synchronously, so a
       * second notice queued `setNotice(true)` and then, in the same tick, the FIRST notice's
       * `setNotice(false)` — and false won. From the second notice onward the footer came back
       * underneath a toast that was still up: the founder photographed "Another option" and "Undo"
       * sitting across the +15 sec control on a transition rest.
       *
       * It bit exactly once because it needs a REPLACEMENT: the first swap was fine, and tapping
       * "Another option" (or swapping twice) broke it. Toast.tsx already guards this same hazard on
       * its animation path with a nonce — and says so in a comment — but the `show()` path had
       * nothing. This is that guard, on the owner's side: a stale `onHide` cannot clear a claim it
       * no longer owns.
       */
      const seq = ++noticeSeq.current;
      setNotice(true);
      toast.show(message, {
        actions,
        onHide: () => {
          if (noticeSeq.current === seq) setNotice(false);
        },
      });
    },
    [toast],
  );

  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  /*
   * ════ A SILENT COACH SAYS WHY — ONCE (founder, 2026-09-09) ════
   *   > *"לא היה שמע גם מהצד שהמאמן מדבר וגם מהצד שהוא מחכה לאישור ממני."*
   * Silence for want of earbuds is the design (spec §0.1: no message). Silence because the
   * microphone was refused, or because the build has no engine, is a defect she can act on — so
   * the stage says it, through the one notice door, once per mount, with the settings as the act.
   */
  const voiceNoticeRef = useRef(false);
  useEffect(() => {
    if (voiceNoticeRef.current) return;
    if (voice.silentBecause === 'permission') {
      voiceNoticeRef.current = true;
      notify(t('workout.voiceSilentPermission'), [{ label: t('workout.voiceOpenSettings'), onPress: () => void Linking.openSettings() }]);
    } else if (voice.silentBecause === 'no_engine') {
      voiceNoticeRef.current = true;
      notify(t('workout.voiceSilentNoEngine'));
    }
  }, [voice.silentBecause, notify, t]);
  const confirmRunning = useRef(false);
  // Equipment-learning toast: the engine's pristine load for the active set (captured before any
  // Edit Result), and whether the athlete corrected the load to a different available weight.
  const originalWeightRef = useRef<number | null>(null);
  const lastIdxRef = useRef<number>(-1);
  const correctedRef = useRef(false);
  // The learning reassurance is one promise for the whole gym, not per lift — show it AT MOST ONCE
  // per workout (resets naturally on each fresh SessionFlow mount), never on a set-by-set basis.
  const learnToastShownRef = useRef(false);
  useFocusedStatusBar('light'); // stage screen: light glyphs, restored to dark on blur
  // The phone is often DOWN on the bench/floor mid-workout (founder 2026-07-10): the
  // display must never auto-lock during a session, or the rest countdown goes dark and
  // the athlete misses the 7 s warning. Same mechanism the cardio surface uses;
  // released automatically when the workout unmounts (Well Done / exit).
  useKeepAwake();

  // Capture the engine's pristine recommended load the first time each set is presented (before
  // an Edit Result mutates it). Done during render so the value is the untouched engine number.
  const curIdx = session.globalProgress?.index ?? -1;
  if (curIdx !== lastIdxRef.current) {
    lastIdxRef.current = curIdx;
    originalWeightRef.current = session.currentTarget?.recommendedWeight ?? null;
  }

  /**
   * 2.0 · HOW MANY WORKOUTS THE LEARNING TAKES — HER NUMBER, THE SAME ONE 1.5 PROMISED.
   *
   * The card said "these FOUR workouts" to everyone, exactly the constant `ob.readyLearnRange`
   * stopped being (founder 2026-07-28). The programme exists by the time this screen mounts, so
   * the count is read straight off it — one home, `learnPhaseLength`, so the promise made in
   * onboarding and the promise repeated on the gym floor cannot drift apart.
   */
  const previewFirstGym = route?.params?.previewFirstGym;
  /*
   * The learning phase's length, counted from whichever week she actually has.
   *
   * It read `app.program`, which a coach-led athlete does not have — so the promise made in
   * onboarding ("I learn for N sessions") would have been repeated on the gym floor as zero, which
   * is the exact drift the comment above exists to prevent.
   */
  const [coachPlan, setCoachPlan] = useState<CoachPlan | null>(null);
  useEffect(() => {
    let alive = true;
    void loadWeekPlan().then((p) => alive && setCoachPlan(p));
    return () => {
      alive = false;
    };
  }, []);
  const learnCount = useMemo(() => {
    if (previewFirstGym != null) return previewFirstGym;
    if (coachPlan) {
      return learnPhaseLength(
        coachPlan.sessions.map((sess) => ({
          slots: sess.blocks.flatMap((b) => b.items.map((i) => ({ exerciseId: i.ex }))),
        })),
      );
    }
    return 0;
  }, [previewFirstGym, coachPlan]);

  // First Start ever: a confident start haptic, and the one-time "we're learning your gym" note
  // (shown AFTER Start, never in onboarding, never twice). Mount-only.
  useEffect(() => {
    haptics.workoutStart();
    if (previewFirstGym) {
      setOverlay('firstGym'); // the harness is holding the card open
      return;
    }
    let active = true;
    // A count of zero would make the card promise nothing ("these 0 workouts"), so the note waits
    // rather than lies; it is once-per-install and unmarked, so the next start still carries it.
    void db.hasFirst(FIRST_GYM_KEY).then((seen) => {
      if (active && !seen && learnCount > 0) setOverlay('firstGym');
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismissFirstGym() {
    if (!previewFirstGym) void db.markFirst(FIRST_GYM_KEY); // the harness looks; it never writes
    setOverlay('none');
  }

  function goWellDone(r: CompleteResult) {
    navigation.replace('WellDone', { unlockedPortrait: r.unlockedPortrait, summary: r.summary, notStarted: r.notStarted });
  }

  // Single navigation path to Well Done: ANY completion (phone tap, finish-early, or a
  // watch-proposed finish) sets `endResult` on the session store; we consume it here and
  // navigate. This is what keeps a watch-triggered finish from leaving SessionFlow stranded
  // on an empty (black) stage — the screen no longer has to be the thing that calls complete.
  useEffect(() => {
    if (!session.endResult) return;
    const r = session.endResult;
    session.clearEndResult();
    goWellDone(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.endResult]);
  /**
   * PAUSE IS A STATE OF THE WORKOUT, NOT A STATE OF THIS SCREEN.
   *
   * It was the latter, and the wrist made that a lie in both directions. Pause on the WATCH and the
   * phone kept showing a live stage over a frozen workout — the rest ring stopped, and nothing said
   * why. Resume on the WATCH while the phone had its Pause sheet up, and the sheet STAYED, a modal
   * over a workout that was already running again, with a Resume button that did nothing (the
   * machine was no longer paused) — the athlete's way back was to press a button that had no
   * effect. So the sheet follows the session now, whoever paused it, and it lets go the moment the
   * session is live again. The end-confirm sheet is the one exception: it is itself a paused-state
   * sheet, and it stays until the athlete answers it (or the wrist resumes, which closes it too).
   */
  useEffect(() => {
    /*
     * ⚠️ AND A PAUSE CLEARS THE SWAP MENU WITH IT (2026-08-16, caught in review). This effect knew
     * two overlays; the swap sheet is a third, and pausing mid-menu tore it off the screen while
     * leaving `swapMenu` and `quickSwapRef` populated — so the verb had done nothing and left state
     * behind for the next Undo to act on. A paused session has no swap to make; the sheet closes
     * cleanly and she taps Swap again when she is training.
     */
    if (session.paused) {
      setSwapMenu(null);
      swapMenuRef.current = null;
      setOverlay((o) => (o === 'endConfirm' ? o : 'pause'));
    } else setOverlay((o) => (o === 'pause' || o === 'endConfirm' ? 'none' : o));
  }, [session.paused]);

  function openPause() {
    session.pause(); // the effect above raises the stage — one path, phone or wrist
    /*
     * …AND ASSERT IT HERE TOO, because the effect above is edge-triggered and this button is not.
     *
     * `PAUSE` on an already-PAUSED machine returns the SAME state object (sessionState.ts), so
     * `session.paused` does not change, so the effect does not re-run. Any moment the overlay is
     * closed while the session is still frozen therefore left this button doing literally nothing
     * for the rest of the workout — no error, no feedback, just a dead control (founder, build 36).
     * Asserting the stage from the press makes Pause self-healing whatever put the two out of step.
     */
    setOverlay((o) => (o === 'endConfirm' ? o : 'pause'));
  }
  function resume() {
    session.resume();
    setOverlay('none');
  }
  async function finish() {
    // Ending a workout early is the one irreversible thing the athlete can do mid-session, so
    // the body is told (founder 2026-07-12): the slow, heavy WARNING texture — the opposite of
    // the crisp double-pulse a save gets. It says "this is not a normal action" before the
    // screen has had a chance to.
    haptics.warning();
    try {
      // Navigation is driven by the `endResult` effect above (one path for phone + watch).
      await session.finishEarly();
    } catch {
      // finalize() writes the session to storage, so this can reject. If it does, the athlete is
      // left staring at the pause sheet with no way to end the workout — and the button they just
      // pressed appears to have done nothing. Say what happened and leave them ON the pause sheet,
      // where Resume and Finish both still work; their logged sets are already persisted per-set.
      notify(t('workout.finishFailed'));
    }
  }

  // Complete set → the "Set logged" beat (§3.3), then log + advance.
  function onCompleteSet() {
    const tgt = session.currentTarget;
    if (!tgt || confirm) return;
    // Equipment learning: the load was corrected to a different available weight (not bodyweight).
    correctedRef.current =
      tgt.recommendedWeight != null &&
      originalWeightRef.current != null &&
      tgt.recommendedWeight !== originalWeightRef.current;
    // Which lift this set belongs to, read BEFORE it is logged — `completeSet` moves the cursor on,
    // and the question that follows must be filed against the lift she just did.
    exerciseAtLogRef.current = session.currentExerciseId ?? null;
    setConfirm({
      weight: tgt.recommendedWeight,
      reps: tgt.recommendedReps,
      n: session.setLabel?.n ?? 1,
      m: session.setLabel?.m ?? 1,
      // THE RECORD, SAID AT THE BAR (founder 2026-08-24). Never on a warm-up bridge — half the
      // working weight by design is not a best of anything.
      record:
        !session.setLabel?.warmup &&
        isRecordSet(tgt.recommendedWeight, tgt.recommendedReps, session.priorPeakKg),
      /*
       * ⛔ ONE LADDER, SHARED WITH THE STAGE (`domain/setRow.bandOf`, 2026-08-05).
       *
       * This used to require BOTH ends to be present, and fell through to no band when either was
       * missing — which is what a coach writing a fixed rep count produces. The stage's own ladder
       * was more forgiving, so it drew a band the beat then denied existed, and every set logged
       * against a fixed count came out as the bare "Set recorded." readback the founder
       * photographed. The band is derived in one place now and both surfaces ask it.
       *
       * ⚠️ Still never `recommendedReps` on its own from HERE: the edit wheel writes her performed
       * reps into that field, so reading it raw would make every edited set land dead-centre in a
       * band of itself. `bandOf` prefers `repBandLo`, which the wheel never touches.
       */
      ...(bandOf(tgt) ? { band: bandOf(tgt)! } : {}),
      // Read BEFORE `completeSet` moves the cursor — the same reason `exerciseAtLogRef` exists.
      ...(session.currentExerciseId ? { lift: session.currentExerciseId } : {}),
      ...(session.setLabel?.warmup ? { warmup: true } : {}),
    });
  }
  /**
   * The lift whose "how did that go?" is open, or null.
   *
   * Captured at the moment the last set writes, NOT read live: by the time she answers, the session
   * has already advanced its cursor to the next lift, and reading `currentExerciseId` there would
   * file her answer against a lift she has not started.
   */
  const exerciseAtLogRef = useRef<string | null>(null);

  useEffect(() => {
    if (!confirm || confirmRunning.current) return;
    confirmRunning.current = true;
    // The set is captured — a single light tap, and it STAYS one (founder 2026-07-12, after the
    // double-pulse "success" texture was proposed for it and rejected here).
    //
    // The five major workout events must be tellable apart by rhythm alone, wrist-down, without
    // looking (WATCH_EXPERIENCE_SPEC §3): set = one tap, rest-over = ascending double, exercise =
    // triple, workout = the signature, connection = one low sustained. A double on the set would
    // put TWO doubles among the five and blunt the one law that lets an athlete run a session by
    // feel — and the watch, which taps once for the same action, would stop matching the phone.
    // `haptics.success()` is used where nothing collides: a profile saved, Health connected, the
    // program built, a run finished.
    haptics.setLogged();
    const corrected = correctedRef.current;
    correctedRef.current = false;
    // Set inside the async callback (after completeSet reveals a correction) and cleared on unmount
    // so the extra correction-hold timer never outlives the screen.
    let holdId: ReturnType<typeof setTimeout> | undefined;
    const id = setTimeout(async () => {
      try {
        const r = await session.completeSet();
        // Non-blocking confirmation that Hush will remember the corrected load — shown at most ONCE
        // per workout, and NEVER when this set ends the workout (it must never float over Well Done).
        if (corrected && !r.ended && !learnToastShownRef.current) {
          learnToastShownRef.current = true;
          notify(t('load.remembered'));
        }
        /*
         * ⛔ "HOW DID THAT GO?" IS DELETED — founder, 2026-08-02, on build 39:
         *
         *   > *"Take it off completely. The AI should give the athlete instructions according to
         *   > their goal. And what about someone who just trains for fun? We already had this
         *   > conversation and you left this screen in."*
         *
         * It held the beat for six seconds at the end of every lift, mid-workout, offering three
         * choices. Because it HOLDS rather than ends, it read as a finish screen that then put her
         * back on the set — his exact words. And it fired once per BLOCK, so a lift the coach split
         * across two blocks asked twice.
         *
         * ⚠️ The signal was real and is not being replaced by nothing: the coach sets a rep band and
         * can see what she actually did against it, which is the same information without an
         * interrogation. Whether it should ever ask, and how, is the prompt work he has reserved to
         * do together.
         */
        // When r.ended, the `endResult` effect navigates to Well Done (one path for phone + watch).
      } catch {
        // completeSet PERSISTS the set (db.saveActiveSession), so it can reject on a storage
        // failure. Without this, the rejection escaped into the void with `confirm` still set —
        // and the "Set logged" beat has NO controls, so the athlete was frozen there, mid-workout,
        // with force-quitting the app as the only way out. The set is not saved; say so, and give
        // the athlete their set back so they can log it again.
        notify(t('workout.setSaveFailed'));
      }
      // ALWAYS (the non-correction path): the stage must return to the athlete, saved or not.
      confirmRunning.current = false;
      setConfirm(null);
      /*
       * The dwell exists to let a beat LAND. With nothing to show (C.13) there is nothing to land,
       * so an ordinary set does not wait 1.4 s to reach its rest — it just reaches it. The last set
       * of a lift still holds, because `ExerciseDone` is drawn immediately; a CORRECTION is not
       * known until `completeSet` resolves, and it opens its own hold when it arrives.
       *
       * ⛔⛔ THIS CONDITION MUST STAY EQUAL TO `beatSpeaks` (founder, 2026-08-16): *"the Logged screen
       * does not appear after a set when the trainee lands in range."*
       *
       * `beatSpeaks` has THREE qualifying cases; this timer only ever had the second. So the in-band
       * landing — the case the founder restored on 2026-08-04, and the one that covers MOST SETS —
       * passed the render guard, drew, and was torn down by `setConfirm(null)` on the very next tick.
       * Net visible time: under one frame. It reads exactly like the C.13 deletion it was meant to
       * undo, which is why it survived a review of the line above.
       *
       * ⚠️ WHAT MADE IT LOOK FINE is that the out-of-band case never comes through here: a correction
       * opens its own 2.2 s hold at the branch above and returns. So the two directions the founder
       * would naturally test — a raise and a drop — both worked, and only the quiet middle did not.
       * The wrist path (`watchBeat`, below) already gated on all three and held unconditionally, so
       * the same set logged on the WATCH showed the beat while the same set tapped on the PHONE
       * showed nothing. That divergence is the repro.
       *
       * `beatCorrection` is deliberately NOT read here — it cannot be known before `completeSet`
       * resolves, and it owns its own hold when it arrives.
       */
    }, beatSpeaksFor(confirm) ? (closesTheLift(confirm) ? LIFT_DONE_DWELL_MS : CONFIRM_DWELL_MS) : 0);
    return () => {
      clearTimeout(id);
      if (holdId) clearTimeout(holdId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm]);

  // The wrist logged a set → play the phone's beat over the running rest, then lift it.
  const logged = session.watchLoggedSet;
  useEffect(() => {
    if (!logged || logged.seq <= seenWatchSeq.current) return;
    seenWatchSeq.current = logged.seq;
    // The phone's own beat is already on the stage (the athlete tapped here and the wrist there,
    // inside the same 1.4 s — the write is idempotent, and one beat is enough).
    if (confirm) return;
    /*
     * ⛔ AND IT ONLY SPEAKS IF IT HAS SOMETHING TO SAY — the same predicate the phone's own beat
     * uses (`beatSpeaks`), rather than a second rule that happened to agree most of the time.
     *
     * It did not agree. The wrist beat mounted unconditionally and carried no band, so it fell into
     * the plain "34 kg × 8 · Set recorded" readback — **the exact restatement the founder deleted
     * from the phone in build 36** — for every set logged on the watch. Now the band travels with
     * the set (`WatchLoggedSet.band`) and the two devices answer identically.
     */
    const beat: Confirm = {
      weight: logged.weight,
      reps: logged.reps,
      n: logged.n,
      m: logged.m,
      ...(logged.band ? { band: logged.band } : {}),
      ...(logged.lift ? { lift: logged.lift } : {}),
      ...(logged.record ? { record: true } : {}),
    };
    // The same speak-predicate as the phone's own beat — ONE function, so the two devices can
    // never drift apart again (that divergence was the 2026-08-16 repro).
    if (!beatSpeaksFor(beat)) return;
    setWatchBeat(beat);
    haptics.setLogged(); // one tap — the same rhythm the phone's own capture has
    const id = setTimeout(() => setWatchBeat(null), CONFIRM_DWELL_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logged]);

  /**
   * Leaving a rest that was CHANGED. The beat holds the screen for its dwell and then the set
   * begins on its own — the handoff is explicit that there is no button here.
   */
  function endRestLearned(tookS: number, wasS: number) {
    const exId = session.currentExerciseId;
    const now = exId ? restWithSample(historyRef.current, exId, tookS) : null;
    /*
     * ════ ⛔ "LEARNED" IS SHOWN ONLY WHEN SOMETHING WAS (founder, 2026-08-18) ════
     *
     * The trigger for this beat is `remaining > 0 || restExtraSeconds > 0` — **she pressed Start
     * early** — and that is a different fact from *her prescription moved*. `restWithSample` folds
     * the sample into a MEDIAN over every rest she has taken on this lift, so an impatient tap on a
     * lift with history routinely leaves the number exactly where it was. The beat fired anyway:
     * `RestLearned` hides its struck "what it was" row when `now === was`, so what she got was a
     * screen reading **"REST · LEARNED / 2:30 NEXT TIME"** with nothing changed and nothing
     * replaced — a rule-change announcement for a rule that did not change.
     *
     * ⚠️ THIS IS THE 2026-08-05 COMPLAINT AGAIN, ON ANOTHER SURFACE: *"it says 6 changes, but when
     * you go in and check you see there is no change."* The law that came out of it —
     * `aCountAndItsRowsAreOneDerivation` — says a number and the thing behind it must be ONE
     * derivation. Here the trigger and the finding were two, and only the trigger was consulted.
     *
     * A rest she cut short that moved nothing taught nothing, so it hands straight to the set,
     * exactly as a rest that simply ran out already did.
     */
    if (now == null || Math.round(now) === Math.round(wasS)) {
      session.endRest();
      return;
    }
    setPaceBeat({ took: tookS, was: wasS, now });
    setTimeout(() => {
      setPaceBeat(null);
      session.endRest();
    }, PACE_BEAT_MS);
  }

  /*
   * ════ SHE TAPS SWAP AND IS SHOWN HER OPTIONS (founder, 2026-08-16) ════
   *
   * ⛔ THIS REPLACES THE ONE-TAP LADDER (S4, 2026-07-06), AND THE OLD RULE WAS NOT SILLY. It said
   * *the athlete never evaluates a list mid-workout* — Hush picks, the toast offers "Another
   * option". That is the right instinct about a LOAD, where she has no information the engine
   * lacks. It is the wrong instinct about a busy station, because there she is the one standing in
   * the gym looking at which machines are free. Handing her one answer at a time meant tapping
   * "Another option" until it named the machine she could see, which is a list with its labels
   * hidden and an extra tap per row.
   *
   * ⚠️ THE MENU IS ONE TO THREE ROWS AND NEVER PADDED — `swapChoices` owns that, and the reason is
   * measured in `domain/swapPool`: 49 of 111 lifts have no third true synonym.
   *
   * ⚠️ UNDO SURVIVES. It is the one part of the ladder that answers a question the menu cannot:
   * "that was the wrong pick." The toast keeps it, behind a per-render-re-bound ref so a delayed
   * press always drives the LIVE session rather than a stale closure's plan.
   */
  /**
   * ⛔ THE MENU REMEMBERS WHICH LIFT IT WAS OPENED ON — three review findings, one cause.
   *
   * The first build kept only `{ target, originalId }` and read the live session at pick time, and a
   * menu is a window during which the session moves underneath it:
   *
   *   · **The crossing expires while she reads.** The transition rest ends on its own timer, so a
   *     menu opened on the way to lift 4 applied to lift 5 — with `replaceBlock` sent under the
   *     wrong `blockId`. Now the pick is refused unless the lift it was built for is still the one
   *     in that slot.
   *   · **Two taps in one frame both landed.** `setSwapMenu(null)` is batched, so the rows are still
   *     mounted for that tick: two rows (or a double-tap) meant two swaps and two toasts. The ref is
   *     now cleared FIRST and synchronously, which is the only guard that holds inside one frame.
   *   · **`quickSwapRef` outlived the sheet.** It was written on OPEN, and closing without picking
   *     left it — so a second Swap within the toast's six seconds clobbered `originalId`, and Undo
   *     "restored" the lift she was already on while the real original became unreachable. Undo now
   *     owns its own record, written at the moment of a pick and at no other time.
   */
  /**
   * ════ ⛔ A SWAP AT A SHARED STATION IS A PROPOSAL, NOT AN ACT (founder ruling 1, 2026-08-31) ═══
   *
   *   > *"מציע לשני, הזוג נשאר."* — the swap is offered; accept and both move, decline and both stay.
   *
   * ⚠️ AND IT REALLY DOES HOLD HER UNTIL HE ANSWERS, which looked wrong until the arithmetic was
   * done. The alternative — swap now, ask afterwards — STRANDS THE PAIR: the shared plan counts
   * sets per lift, so an athlete who has moved to a lift the plan does not name can never finish
   * the station, and the pair sticks there for the rest of the workout. His answer is two metres
   * away and takes about three seconds; a stranded pair lasts an hour.
   *
   * `SHARED_SWAP_WAIT_MS` is the other half — a question nobody reads is a decline, not a wait.
   */
  const [proposal, setProposal] = useState<{ from: string; to: string; target: 'current' | 'next' } | null>(null);
  const swapMenuRef = useRef<{ target: 'current' | 'next'; originalId: string } | null>(null);
  const undoRef = useRef<{ target: 'current' | 'next'; originalId: string } | null>(null);
  const [swapMenu, setSwapMenu] = useState<{ name: string; choices: SwapChoice[]; fallbackWeight?: number | null } | null>(null);
  const swapActionsRef = useRef({ undo: () => {} });
  /** Read by the answer effect, which is bound to `pair.swapAnswer` alone (one answer, one run). */
  const proposalRef = useRef(proposal);
  proposalRef.current = proposal;

  function applySwapTo(target: 'current' | 'next', id: string) {
    if (target === 'current') {
      session.swapCurrentExercise(id);
    } else {
      // Keep the backend block mapping when known (fixture: no-op).
      const nt = session.nextTarget;
      const from = session.nextExerciseId;
      if (nt?.blockId && from) void app.model.replaceBlock({ blockId: nt.blockId, fromExercise: from, toExercise: id });
      session.swapNextExercise(id);
    }
  }

  const closeSwapMenu = () => {
    swapMenuRef.current = null;
    setSwapMenu(null);
    setOverlay('none');
  };

  /** She picked a row. Close the menu, make the swap, and leave one way back. */
  function pickSwap(id: string) {
    const st = swapMenuRef.current;
    if (!st) return; // already spent — a second tap in the same frame finds nothing
    swapMenuRef.current = null; // …because THIS runs before any state update is flushed
    /*
     * ⛔ AND THE LIFT MUST STILL BE THE ONE SHE OPENED THE MENU ON. A transition rest can expire
     * while the sheet is up, moving the session on; applying then would replace the WRONG lift.
     */
    const liveId = st.target === 'current' ? session.currentExerciseId : session.nextExerciseId;
    setSwapMenu(null);
    setOverlay('none');
    if (liveId !== st.originalId) {
      notify(t('swap.moved'));
      return;
    }
    /*
     * ⛔ IS THIS LIFT PART OF WHAT THE TWO OF THEM ARE DOING TOGETHER? Not "is it the current one" —
     * a lift she swaps on a transition rest is the pair's NEXT station and strands it just as
     * thoroughly. The shared plan is the whole answer: if it names this lift, the partner is asked.
     */
    if (pair.stage === 'live' && pair.plan?.lifts.some((l) => l.exerciseId === st.originalId)) {
      haptics.confirm();
      setProposal({ from: st.originalId, to: id, target: st.target });
      pair.askSwap(st.originalId, id);
      notify(partnerName ? t('pair.swapWaiting', { name: partnerName }) : t('pair.swapWaitingAnon'));
      return;
    }
    undoRef.current = st;
    haptics.confirm();
    applySwapTo(st.target, id);
    notify(t('swap.swappedTo', { name: exerciseDisplayName(id) }), [
      { label: t('swap.undo'), onPress: () => swapActionsRef.current.undo() },
    ]);
  }

  /** His answer came back. Accept applies it here too; anything else changes nothing, and says so. */
  useEffect(() => {
    if (pair.swapAnswer == null) return;
    const accepted = pair.swapAnswer;
    pair.clearSwapAnswer();
    const p = proposalRef.current;
    if (!p) return;
    setProposal(null);
    if (!accepted) {
      notify(t('pair.swapDeclined'));
      return;
    }
    /* The lift must still be where she left it — the same guard `pickSwap` keeps, and for the same
       reason: a transition rest can expire while a question is out. */
    const liveId = p.target === 'current' ? session.currentExerciseId : session.nextExerciseId;
    if (liveId !== p.from) {
      notify(t('swap.moved'));
      return;
    }
    undoRef.current = { target: p.target, originalId: p.from };
    applySwapTo(p.target, p.to);
    notify(t('pair.swapAccepted', { to: exerciseDisplayName(p.to) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair.swapAnswer]);

  /** Nobody is reading it. A question with no answer is a decline — never a wait without an end. */
  useEffect(() => {
    if (!proposal) return;
    const id = setTimeout(() => {
      setProposal(null);
      notify(t('pair.swapDeclined'));
    }, SHARED_SWAP_WAIT_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal]);

  /**
   * ⛔ HIS QUESTION, ARRIVING HERE — and answered before it is asked when it cannot be honoured.
   *
   * A proposal about a lift this phone is not standing at (she is three stations ahead, she already
   * swapped it herself) has exactly one honest answer, and making her read a sheet to give it would
   * be an interruption mid-set that changes nothing.
   */
  useEffect(() => {
    const ask = pair.swapAsk;
    if (!ask) return;
    const canApply = session.currentExerciseId === ask.from || session.nextExerciseId === ask.from;
    if (!canApply) {
      pair.answerSwap(false);
      return;
    }
    setOverlay('pairSwap');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair.swapAsk]);

  swapActionsRef.current = {
    undo: () => {
      const st = undoRef.current;
      if (!st) return;
      undoRef.current = null;
      haptics.confirm();
      applySwapTo(st.target, st.originalId);
      notify(t('swap.restored', { name: exerciseDisplayName(st.originalId) }));
    },
  };

  async function startQuickSwap(target: 'current' | 'next') {
    const exId = target === 'current' ? session.currentExerciseId : session.nextExerciseId;
    if (!exId) return;
    let prefs: { substitutes?: Record<string, string>; backups?: Record<string, string> } | undefined;
    try {
      prefs = await db.loadPreferences();
    } catch {
      prefs = undefined;
    }
    // The whole session goes in — the pool excludes it (and normalises the id space, so an engine
    // id like 'back_squat' still matches the catalog's 'bb_back_squat'). Same function the WATCH
    // now calls, so the two surfaces can never disagree about what a legal swap is.
    const choices = swapChoices(exId, { sessionExerciseIds: session.sessionExerciseIds, prefs, equipment: app.profile?.equipment });
    // ⛔ SIX LIFTS IN THE CATALOGUE HAVE NO ADMISSIBLE PEER AT ALL. Opening an empty sheet would be
    // worse than the verb doing nothing; she is told instead, because a door that opens on nothing
    // is the thing this pass exists to remove.
    if (choices.length === 0) {
      notify(t('swap.none'));
      return;
    }
    swapMenuRef.current = { target, originalId: exId };
    /* What a pick would put on the bar — the ADOPTION RULE, previewed: the table's own first-set
       prescription for the candidate, and where the table has none, the current prescription
       carries across (exactly `retargetPlanForSwap`'s fallback). The sheet may never show a
       number the pick would not produce. */
    const fallbackW = (target === 'next' ? session.nextTarget : session.currentTarget)?.recommendedWeight ?? null;
    setSwapMenu({ name: exerciseDisplayName(exId), choices, fallbackWeight: fallbackW });
    setOverlay('swap');
  }

  /**
   * ════ THE CHROME NEVER LEAVES (founder 2026-07-27) ════
   *
   * Pause and the elapsed clock are not part of any one training screen — they belong to the
   * WORKOUT, and the workout is still running on every one of them. The handoff draws some beats
   * without them (2.3b, 2.4b, 2.4d), and that is the one place it is drawing a moment rather than
   * a product: an athlete mid-session must always be able to see how long they have been at it and
   * always be one tap from stopping. So the bar is hoisted OUT of the phase branch and rendered
   * once, above all of them.
   *
   * What changes per beat is only what the bar SAYS in its middle slot — the position you are at:
   * "LIFT 1 / 6" during a set or a rest between sets, "LIFT 1 → 2" while crossing to a new lift.
   * And its end-edge doors: Swap + Form on a live set, Form alone on a rest, neither during the
   * one-second logged beat, when there is nothing to reach for.
   */
  const isTransition = session.displayPhase === 'REST_TRANSITION';
  /** A crossing into a RUN has no form clip and nothing to swap for — see `swapPool`. */
  const nextIsALift = !!exerciseById(session.nextExerciseId ?? '');
  const exIndex = session.exerciseProgress?.index ?? 0;
  /* ⛔ `chromeOrdinal` STOOD HERE: two `t()` calls on every render of the workout screen, handed to
     nothing. `<StageBar>` below takes no `ordinal` (it does take `center`, for a beat with no
     clock — see its own note), and destructured the ordinal without ever reading it — a
     live-looking prop surface, which is how it survived two redesigns. */
  const onSet = !confirm && session.displayPhase === 'SET_PRESENTED';
  /* Resting BETWEEN SETS of one lift — not a crossing, which belongs to the next lift's set 1 and
     whose rail segment moves on its own. See the `LiftRail` note below.

     ⚠️ `REST_INTER`, and the name is checked against `DisplayPhase` rather than guessed: the union
     is `'SET_PRESENTED' | 'REST_INTER' | 'REST_TRANSITION'` and there is no `'REST'`. This was
     written as `=== 'REST'` for an hour and it went green in the harness, because the Rest screen
     is the FALL-THROUGH branch — an unknown phase renders it. A fixture inventing a phase name is a
     test that agrees with itself. */
  const restingBetweenSets = session.displayPhase === 'REST_INTER';
  /**
   * ════ THE STEP SHE IS ON IS NOT ALWAYS A SET ════
   *
   * The coach writes four shapes and only one of them is a weight for a number of reps. This is the
   * branch — the one thing that was missing between a stage built for all four (`ItemStage`) and a
   * plan that carried all four (`buildPlanFromCoach`). Without it a plank reached the SET screen as
   * a set with no weight and no rep band, in the middle of a workout.
   *
   * `reps` and a step with no item at all (an engine-built plan) are the ordinary path, untouched.
   */
  const itemShape = session.currentItem && session.currentItem.kind !== 'reps' ? session.currentItem : null;
  /**
   * Both end-edge doors belong to a LIFT, and neither means anything on a run.
   *
   * Swap answers "the machine is taken" out of a pool of lifts in the same class; a movement is in
   * no class and has no synonyms. Form plays a demo of a catalogue exercise; there is no film of a
   * five-kilometre run, and `exerciseCues` for a movement id is empty. A door that opens onto
   * nothing is worse than no door.
   */
  const onLift = !!exerciseById(session.currentExerciseId ?? '');
  /**
   * ⛔ ON A CROSSING, THE FILM IS OF THE LIFT SHE IS WALKING TO (founder bug, 2026-08-30):
   * *"באג - בסט המעבר זה מציג את הוידאו של התרגיל הקודם."*
   *
   * The whole argument — why a crossing's `current` is the wrong lift, and why the old gate failed
   * in BOTH directions — lives with the derivation in `sessionStore.filmSubject`, which is pure so
   * that `theCrossingSpeaksOfTheLiftAhead` can hold it. `null` means no film and therefore no door.
   */
  const demoExerciseId = filmSubject(session.displayPhase, session.currentExerciseId, session.nextExerciseId);
  /*
   * ⛔ THE FIRST SET OF THE FIRST LIFT (founder 2026-08-12) — one rule (`isSwapMoment`), asked by the
   * phone and the wrist alike, so the two surfaces can never disagree about when a swap is legal.
   * The swap for every OTHER lift lives on the transition rest, which is where she finds out the
   * machine is taken. See `swapPool` for the argument.
   */
  /*
   * ⛔ ON EVERY SET (founder, 2026-09-07 — the board). The first-set rule's stated reason was that a
   * mid-lift swap "strands the sets she has already logged", and it never did — `retargetPlanForSwap`
   * re-points only the steps from the cursor on. A machine taken between set 2 and set 3 is the
   * ordinary case; the disc is live wherever there is a lift on the stage.
   */
  const canSwap = onLift;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* The chrome's one exception is gone with the editor room (2026-08-26, second cut): the
            stage bar now stands over every beat without a carve-out, which is what "THE CHROME
            NEVER LEAVES" always claimed. */}
        <>
          <StageBar
            elapsedFrom={session.startedAtMs}
            onExit={openPause}
            /* Every beat: what is left of the session is a question a rest, a set and a crossing
               all answer the same way. See the note at the disc. */
            onMap={() => setOverlay('map')}
            /*
             * ⛔ THE SWAP DISC — REMOVED ON 2026-08-02, BACK ON 2026-08-03, AND BOTH WERE RIGHT.
             *
             *   > *"I was wondering whether to add an AI window and remove SWAP."*  — and we did.
             *   > *"In the workout, bring back the SWAP."*  — after he used it on the device.
             *
             * The window was the right idea and the deletion was one step too far. A swap is the
             * commonest thing she does at the rack, and putting it behind a disc, a sheet and a chip
             * made the FASTEST action in the product slower than it had been. The chip stays, so the
             * window still answers "swap this" in words; the one-tap door is a control again.
             *
             * ⚠️ It is the one disc that COMES AND GOES — offered only before the first set of a
             * lift (`isSwapMoment`), because a swap mid-exercise strands the sets she has already
             * logged. That is what makes the bar's centring worth a test of its own.
             */
            /*
             * ⛔ AND ON A TRANSITION REST, FOR THE LIFT SHE IS WALKING TO (founder, 2026-08-12).
             * It was an outline button on the up-next card, beneath a form disc the bar was already
             * drawing. The bar is where this stage keeps its controls — and a crossing is the moment
             * his swap ruling was written for: she has not reached the station yet, so this is when
             * she finds out the machine is taken.
             */
            onSwap={
              onSet && canSwap
                ? () => void startQuickSwap('current')
                : isTransition && nextIsALift
                  ? () => void startQuickSwap('next')
                  : undefined
            }
            /* The quiet disc is gone with the rule it taught (2026-09-07): the swap is live on every set. */
            swapQuiet={false}
            /*
             * ⛔ THE FORM DISC IS DELETED FROM THE CHROME (founder, 2026-08-31): *"צריך להוריד את
             * הפקד של צפייה בסרטון כי הכנסנו אותו למסך עצמו."*
             *
             * A 38-point disc labelled "watch the clip" in the corner of a screen that is now
             * mostly the clip. The sheet behind it did not close with it — it still carries the
             * CUES, which the stage does not draw — so the door MOVED rather than shut: onto the
             * athlete on the set stage, and onto the next lift's figure on a crossing. You tap the
             * demonstration to see the demonstration bigger, which needs no label at all.
             *
             * ⚠️ `demoExerciseId` SURVIVES AND ITS SUBJECT RULE IS UNCHANGED — the NEXT lift on a
             * crossing, the current one on a set (founder, 2026-08-30). Both new doors read it.
             */
            /*
             * ⛔ THE COACH IS NOT ON THE STAGE ANY MORE (founder 2026-08-05): *"I suggest you take
             * the AI screen off the workout — leave it only for the case of an injury. Remove the
             * button from every workout state except the injury state."*
             *
             * It was a disc in the top-left of every live set, and the argument for it was that
             * something can always go wrong mid-workout. That is true and it is what the INJURY
             * door is for — "something feels off", on the pause screen, which reports to the coach
             * and gets a decision back. What the chat added on top of that was a place to have a
             * conversation while standing at a loaded bar.
             *
             * ⚠️ AND THE OVERLAY WENT WITH IT, not just the button. This was the only door into
             * `overlay === 'coach'`; leaving the room behind a removed door is how a screen becomes
             * unreachable code that still has to be maintained — the shape three audits in this
             * batch have already found. The coach is one tap from Today, where she is not mid-set.
             */
          />
          {/* What the ear heard, and what was done about it — one line under the chrome (2026-09-07). */}
          {/*
            The session's shape, drawn — see `LiftRail`. It replaces "LIFT 1 / 6".

            ⛔ DURING A REST IT READS THE SET SHE IS GOING TO, NOT THE ONE SHE FINISHED (2026-08-18).

            `setLabel` is the set on the STAGE, and on the stage it is right. A rest is the gap after
            it: `setLabel` still says 2, and the moment the rest card started naming the set she
            comes back to — which is the whole point of the card — the screen carried **"SET 2/4"
            eight points above "Set 3 of 4"**, two numbers for one lift, both wearing the word set.
            Caught the minute both were drawn together in the harness.

            The rest belongs to the set it precedes, which is also what the pips already say: set 2
            is spent, so its pip is moss and the lit one is 3. One derivation, one number.
          */}
          {/* THE RAIL IS A DOOR NOW (founder's suggestion, accepted 2026-08-26): the strip that
              says WHERE she is opens the map of the WHOLE session — every lift, its state, its
              sets — instead of that map living only as two names on the rest card. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('workout.sessionMap')}
            onPress={() => setOverlay('map')}
          >
            <LiftRail
              index={exIndex}
              total={session.exerciseProgress?.total ?? 1}
              setN={restingBetweenSets ? session.nextSetLabel?.n : session.setLabel?.n}
              setM={restingBetweenSets ? session.nextSetLabel?.m : session.setLabel?.m}
              warmup={restingBetweenSets ? session.nextSetLabel?.warmup : session.setLabel?.warmup}
            />
          </Pressable>
        </>
        {paceBeat ? (
          <RestLearned took={paceBeat.took} was={paceBeat.was} now={paceBeat.now} />
        ) : beatSpeaks ? (
          <Logged units={units} confirm={confirm!} />
        ) : session.displayPhase === 'SET_PRESENTED' && itemShape ? (
          <ItemBeat
            item={itemShape}
            onRun={(metres, say) => {
              leftForRunAtRef.current = Date.now();
              navigation.navigate('CardioLive', {
                target: { metres, ex: itemShape.ex, ...(say ? { say } : {}) },
                // The source, decided by the movement — see `measuresDistance` above.
                indoor: !isOutdoorMovement(itemShape.ex),
              });
            }}
          />
        ) : session.displayPhase === 'SET_PRESENTED' ? (
          <ActiveSet
            units={units}
            notice={notice}
            onComplete={onCompleteSet}
            onWhy={() => setOverlay('reasoning')}
            /* ⛔ THE FORM DISC IS GONE FROM THE CHROME AND THE FIGURE IS THE DOOR (founder,
               2026-08-31: *"צריך להוריד את הפקד של צפייה בסרטון כי הכנסנו אותו למסך עצמו"*). He is
               right that a disc for "watch the clip" is absurd on a screen that is now mostly the
               clip — and the sheet behind it still carries the CUES, which the stage does not, so
               the door had to move rather than close. It moves onto the thing you would reach for:
               the athlete herself. */
            onDemo={confirm || !demoExerciseId ? undefined : () => setOverlay('demo')}
          />
        ) : (
          <Rest
            units={units}
            paused={session.paused}
            notice={notice}
            /* The crossing's figure IS the technique door now — see the chrome's deletion note. */
            onDemo={confirm || !demoExerciseId ? undefined : () => setOverlay('demo')}
            onLearned={endRestLearned}
          />
        )}
      </SafeAreaView>

      {/* The wrist's set, read back on the phone — a layer, so the rest underneath keeps its
          clock (see `watchBeat`). It swallows taps for its 1.4 s: the stage beneath is mid-beat
          and must not be operated through it. */}
      {watchBeat && !confirm ? (
        <View style={styles.beatLayer}>
          <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <Logged units={units} confirm={watchBeat} />
          </SafeAreaView>
        </View>
      ) : null}

      {/* PAUSED — two doors, no essay (founder 2026-07-12). The paragraph explaining that
          completed sets are saved was reassurance for a fear the athlete does not have while
          the workout is merely PAUSED. What they want here is to go back in, or to stop. */}
      {/* 13.1 · PAUSED — a full STAGE, not a sheet. A sheet is something waiting to be dismissed;
          a pause is the session standing still, so the whole page stands still with it. The pain
          door lives at its foot (§13). */}
      {/* THE STAGE STAYS UP WHILE THE END IS CONFIRMED. Pressing "End session early" used to drop
          the paused stage and hand the athlete back the LIVE SET with a sheet over it — two visual
          languages in one gesture, and a lie besides: the session is still paused while she is
          being asked. The stage holds; the guard rides on top of it. */}
      {overlay === 'pause' || overlay === 'endConfirm' ? (
        <PausedStage
          // The DISPLAY name, not the catalog's — "מושהה · BARBELL BACK SQUAT" on a Hebrew screen
          // was the one surface still reading `.name` raw (eye-pass 2026-08-26).
          // ⛔ AND ON A CROSSING, THE NEXT LIFT (design review 2026-09-01): the cursor only moves
          // on REST_ELAPSED (see `filmSubject`), so a pause during a transition announced the lift
          // that ENDED while the stage behind it already said "תרגיל חדש" with the next one. Same
          // rule as the film door: a transition's subject is the lift she is walking towards.
          subject={(() => {
            const id =
              session.displayPhase === 'REST_TRANSITION'
                ? session.nextExerciseId ?? session.currentExerciseId
                : session.currentExerciseId;
            return id ? exerciseDisplayName(id) : null;
          })()}
          onResume={resume}
          endLabel={t('pauseSheet.endSession')}
          onEnd={() => setOverlay('endConfirm')}
          onPain={
            // Hidden while the guard is up — one question at a time.
            overlay === 'endConfirm'
              ? undefined
              : () => {
                  // Reported on a PAUSED session on purpose: it stays paused behind the report, so
                  // accepting the swap returns to a session that never went anywhere.
                  //
                  // THE STAGE STAYS UP BEHIND THE REPORT. It used to be closed here, and since the
                  // session remains frozen the edge-triggered effect above never raised it again:
                  // Back from the report landed on the LIVE set over a paused workout, and Pause
                  // was dead from then on (founder, build 36). PainWhere is pushed over this
                  // screen, so leaving the stage up costs nothing — and Back reveals exactly the
                  // screen she left, which is what Back means.
                  navigation.navigate('PainWhere', { exerciseId: session.currentExerciseId ?? undefined });
                }
          }
        />
      ) : null}

      {/* ENDING IS GUARDED — the same law the watch already holds (2026-07-12). Ending a workout
          is destructive of the rest of it, so it ASKS, and the answer tells the athlete the one
          thing that matters: nothing you did is lost. Keep going is the primary. */}
      {/*
        ════════════════════════════════════════════════════════════════════════════════════════
        ⛔ AND IT WAS THE CLAY BUTTON, UNDER COPY THAT SAYS NOTHING IS LOST (2026-08-27).

        `tokens.ts` states the rule in the founder's words (2026-07-29): **clay is reserved for pain
        and for destructive confirms.** This sheet's body is
        *"כל מה שעשית עד עכשיו נשמר, ונשקלל בבניית תוכנית האימון הבאה שלך."* — everything you did is
        kept, and it counts toward the next plan — and the button directly beneath it was painted the
        colour of a warning. **The screen argued with itself, in two adjacent lines.**

        ⚠️ AND IT SPENT THE APP'S LOUDEST MARK ON ITS MOST ORDINARY ACT. The only other `danger`
        buttons in the product are Sign out and **Delete account**. Giving "finish my workout" the
        same tone as "delete my account for ever" is not caution; it is the warning losing its
        meaning by being spent on something that is not one. The cardio sheet had it worse still —
        its label is literally `סיים ושמור`, *finish and SAVE*, in clay.

        ⚠️ THE GUARD IS THE SHEET, NOT THE COLOUR. Asking is right — a mis-tap should not end a
        session — and asking is what the sheet does. Keep going stays the primary, so the safe
        answer is still the one under her thumb. The end act is a plain secondary: available,
        deliberate, and not dressed as damage.
      */}
      {overlay === 'endConfirm' ? (
        /* scrim 0.72: the pause screen's own primary act kept full brightness through the default
           0.45 and competed with this sheet's decision (design review 2026-09-01). */
        <BottomSheet onClose={() => setOverlay('pause')} scrimOpacity={0.72}>
          <Legend style={styles.sheetLegend}>{t('finishSheet.legend')}</Legend>
          <Text style={styles.sheetTitle}>{t('finishSheet.title')}</Text>
          <Text style={styles.sheetBody}>{t('finishSheet.body')}</Text>
          <View style={styles.sheetActions}>
            <Button variant="primary" block label={t('finishSheet.keep')} onPress={() => setOverlay('pause')} />
            <Button variant="secondary" block label={t('finishSheet.save')} onPress={finish} />
          </View>
        </BottomSheet>
      ) : null}

      {overlay === 'reasoning' ? (
        <WhyLoadSheet units={units} onClose={() => setOverlay('none')} />
      ) : null}

      {/* His proposal, and the two answers to it. See `PairSwapSheet`. */}
      {overlay === 'pairSwap' && pair.swapAsk ? (
        <PairSwapSheet
          from={pair.swapAsk.from}
          to={pair.swapAsk.to}
          partner={partnerName}
          onYes={() => {
            const ask = pair.swapAsk;
            setOverlay('none');
            if (!ask) return;
            const target = session.currentExerciseId === ask.from ? 'current' : 'next';
            pair.answerSwap(true);
            haptics.confirm();
            undoRef.current = { target, originalId: ask.from };
            applySwapTo(target, ask.to);
          }}
          onNo={() => {
            setOverlay('none');
            pair.answerSwap(false);
          }}
        />
      ) : null}

      {/* ⛔ HER OPTIONS FOR A BUSY STATION — one to three, never padded. See `SwapSheet`. */}
      {overlay === 'swap' && swapMenu ? (
        <SwapSheet
          currentName={swapMenu.name}
          choices={swapMenu.choices}
          /* The two facts a swap is decided on — see `SwapSheetProps.weightFor`. */
          weightFor={(id) => session.previewTargetFor?.(id)?.recommendedWeight ?? swapMenu.fallbackWeight ?? null}
          units={units}
          figure={app.profile?.sex === 'female' ? 'female' : 'male'}
          onPick={pickSwap}
          onClose={closeSwapMenu}
        />
      ) : null}

      {/* 2.0 · FIRST WORKOUT — THE FIRST FOUR. Shown once, before set 1 of workout 1: the promise
          that these sessions are Hush READING the athlete's real numbers, not prescribing from a
          guess.

          It is a FLOATING card, not a bottom sheet (v7 2.0). A sheet is a place you have gone; this
          is a note left on top of the set that is already waiting behind it — so the stage stays
          visible at the edges, dimmed to `rgba(15,14,12,.62)`, and the card sits 22 in from each
          side with 44 of air beneath it. Its own ground is a short vertical gradient (#231F19 →
          #15140F), the one card in the product lit from inside. */}
      {overlay === 'firstGym' ? (
        <View style={StyleSheet.absoluteFill}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={dismissFirstGym} style={styles.calScrim} />
          <View style={styles.calCard}>
            {/* THE GROUND IS DRAWN THE WAY `components/ds/Stage` DRAWS IT — absoluteFill on a
                WRAPPER, percentages inside it — and not with both on the <Svg> itself.
                `style={absoluteFill}` AND `width="100%"` gave the element two ways to be sized,
                and on the first native frame — before the card's height has settled — they
                disagreed: the founder's very first workout drew the gradient offset from the card
                it was supposed to fill (build 36). The web harness never showed it, because there
                the two happen to resolve the same.
                `rx` is gone with it: the card already clips itself (overflow + borderRadius 28),
                and a second radius is just a second thing that can disagree. */}
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Svg width="100%" height="100%">
                <Defs>
                  <SvgGradient id="calCard" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#231f19" />
                    <Stop offset="1" stopColor="#15140f" />
                  </SvgGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#calCard)" />
              </Svg>
            </View>
            <Legend track={0.2} tone="accent" style={styles.calLegend}>{t('firstGym.legend', { count: learnCount })}</Legend>
            <Text style={styles.calTitle}>{t('firstGym.title', { count: learnCount })}</Text>
            <Text style={styles.calBody}>{t('firstGym.body')}</Text>
            <View style={styles.calChips}>
              <CalChip icon="plate" label={t('firstGym.chipPlates')} />
              <CalChip icon="dumbbell" label={t('firstGym.chipDumbbells')} />
              <CalChip icon="pin" label={t('firstGym.chipPins')} />
            </View>
            <Text style={styles.calFootnote}>{t('firstGym.footnote')}</Text>
            <Button variant="primary" block size="card" label={t('firstGym.got')} onPress={dismissFirstGym} />
          </View>
        </View>
      ) : null}

      {overlay === 'map' ? (
        <BottomSheet onClose={() => setOverlay('none')}>
          <Legend style={styles.mapLegend}>{t('workout.sessionMap')}</Legend>
          {/*
            ════ ⛔ THE MAP IS WHERE SHE REORDERS THE REST OF THE SESSION (founder, 2026-09-07) ════

            *"במהלך האימון יש פקד שמציג את התרגילים — אני רוצה שיהיה אפשרות להחליף את סדר התרגילים
            שם. רק תוודא שמה שבוצע אי אפשר להחליף ותסדר ותעצב את המסך יפה."*

            Every row that is still ahead carries a grip; a done row and the lift she is standing
            on do not, and nothing can be dropped into their seats (`ReorderRows` holds a dragged
            row at the last movable seat). Which rows are movable is the STORE's answer
            (`movableExerciseIds` — see `movableExercisesFrom` for the boundary and the superset
            lock), so the sheet cannot offer a move the plan would refuse. The drop calls
            `reorderAhead` with the seat's position among the movable rows, and the live plan is
            what re-renders the list — the sheet animates the promise, the store keeps it.
          */}
          {(session.aheadExerciseIds ?? []).length > 0 ? (
            /* THE BOARD (founder, 2026-09-07): a lift still ahead is one press from being next. */
            <Text style={styles.mapHint}>{t('workout.mapTapHint')}</Text>
          ) : (session.movableExerciseIds ?? []).length > 1 ? (
            <Text style={styles.mapHint}>{t('workout.mapReorderHint')}</Text>
          ) : null}
          <ReorderRows
            items={(session.sessionExerciseIds ?? []).map((id) => ({ key: id, movable: (session.movableExerciseIds ?? []).includes(id) }))}
            gripColor={color.textMuted}
            gripLabel={t('program.reorderGrip')}
            onMove={(from, to) => {
              const ids = session.sessionExerciseIds ?? [];
              const movable = session.movableExerciseIds ?? [];
              const position = movable.indexOf(ids[to] ?? '');
              if (position >= 0) session.reorderAhead?.(ids[from], position);
            }}
            renderItem={(item, _i, grip, lifted) => {
            const id = item.key;
            const currentAt = (session.sessionExerciseIds ?? []).indexOf(session.currentExerciseId ?? '');
            const at = (session.sessionExerciseIds ?? []).indexOf(id);
            const state: 'done' | 'now' | 'ahead' = at < currentAt ? 'done' : at === currentAt ? 'now' : 'ahead';
            // Working sets for this lift, straight off the plan (bridges excluded by the store).
            /* ⚠️ THE RECORD ITSELF IS OPTIONAL, not just the entry. It is published when a plan is
               laid (`sessionStore`), and a resumed or watch-driven session can reach this room
               before that happens — which used to throw INSIDE a `.map`, taking the whole screen
               down. It mattered less while the only door was the rail; the map has a control on
               every beat now, so an absent count must read as "no number yet", never as a crash. */
            const sets = session.sessionSetCounts?.[id] ?? 0;
            /* A lift still wholly ahead can start NOW — the row is the control (2026-09-07). The
               next lift in line needs no verb (it is next); a done or current row is a record. */
            const startable = (session.aheadExerciseIds ?? []).includes(id);
            return (
              <Pressable
                accessibilityRole={startable ? 'button' : undefined}
                accessibilityLabel={startable ? t('workout.startNamed', { name: bidi(exerciseDisplayName(id)) }) : undefined}
                disabled={!startable}
                onPress={() => {
                  session.startExerciseNow?.(id);
                  setOverlay('none');
                }}
                style={[styles.mapRow, state === 'now' && styles.mapRowNow, lifted && styles.mapRowLifted]}
              >
                {/* ⛔ `tone` — THE THUMB HAS BEEN INVISIBLE SINCE THE DAY IT LANDED. It draws in the
                    paper ladder, whose near limb is #191714, on a sheet that is #1b1914: present in
                    the tree, absent to the eye, and nobody noticed because a 30-point figure being
                    faint reads as a 30-point figure. Found while building `MOTION_PALETTE_STAGE`
                    for the training stage; this row is the only other dark surface that draws one. */}
                {/* 30 → 44 (design review 2026-09-01): a 30-point square cannot carry a human mid-movement —
                    seven of them read as seven smudges. 44 is the floor at which a pose is a pose. */}
                <MotionThumb exerciseId={id} size={44} tone="stage" figure={app.profile?.sex === 'female' ? 'female' : 'male'} />
                <Text
                  style={[styles.mapName, state === 'done' && styles.mapNameDone, state === 'now' && styles.mapNameNow]}
                  numberOfLines={1}
                >
                  {bidi(exerciseDisplayName(id))}
                </Text>
                {state === 'done' ? (
                  <Icon name="check" size={15} color={up.stage} strokeWidth={2.2} />
                ) : state === 'now' ? (
                  <Legend size={17} track={0.12} tone="accent">{t('workout.mapNow')}</Legend>
                ) : startable ? (
                  <Legend size={17} track={0.12} tone="onStage">{t('workout.startNow')}</Legend>
                ) : (
                  <Text style={styles.mapSets}>{sets > 0 ? `${sets}×` : ''}</Text>
                )}
                {grip}
              </Pressable>
            );
            }}
          />
          {/* The same explicit close the swap sheet carries — a sheet's drag handle alone is a
              gesture some athletes never try (design review 2026-09-01). */}
          <Button variant="ghost" block label={t('swap.close')} onPress={() => setOverlay('none')} style={styles.mapClose} />
        </BottomSheet>
      ) : null}

      {/* ⛔ THE SUBJECT IS `demoExerciseId`, NOT `currentExerciseId` (founder 2026-08-30) — all four
          props, because a title from one lift over a film of another is the same bug wearing a
          different face. See the derivation's note for why a crossing's "current" is the wrong lift. */}
      {overlay === 'demo' && demoExerciseId ? (
        <ExerciseDemo
          title={exerciseDisplayName(demoExerciseId)}
          cues={exerciseCues(demoExerciseId)}
          focusLabel={t('workout.focusOn')}
          formGuideLabel={t('workout.formGuide')}
          doneLabel={t('workout.tapAnywhere')}
          exerciseId={demoExerciseId}
          onDone={() => setOverlay('none')}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ Item beat */
/**
 * THE THREE SHAPES THAT ARE NOT A SET, ON THE STAGE SHE IS ALREADY STANDING IN FRONT OF.
 *
 * `ItemStage` draws them; this is what hands them the athlete's step and takes back what she did.
 * It is deliberately thin — no beat, no dwell, no question. A set earns its 1.4-second capture
 * because a number was decided and Hush may have moved the next one; a plank that ended has no news
 * in it, and holding the screen to say nothing is the exact thing C.13 removed from the set path.
 *
 * The haptic is the same single tap a logged set gets: one step captured, one tap, whatever shape
 * it was — the five-event rhythm law (WATCH_EXPERIENCE_SPEC §3) counts events, not shapes.
 */
function ItemBeat({
  item,
  onRun,
}: {
  item: Exclude<PlannedItem, { kind: 'reps' }>;
  /** Hand a GPS movement to the cardio stage — see `MEASURED_BY_THE_PHONE` below. */
  onRun: (metres: number, say?: string) => void;
}) {
  const session = useSession();
  const name = exerciseDisplayName(session.currentExerciseId);
  /*
   * ════ WHERE SHE IS IN A REPEATED ITEM — "REP 3 OF 6" ════
   *
   * ⛔ FOUNDER, 2026-08-02, choosing between three ways to run an interval: *"do B."*
   *
   * `6 × 400 m, 90 seconds walk` is a block of `rounds: 6`, which the machine expands into six
   * steps. Each one opened this stage showing "400 m" and nothing else — so from her side the sixth
   * rep was indistinguishable from the first, and from a brand new exercise. The set stage has said
   * "SET 2 OF 4" since the beginning; a repeated hold or run said nothing at all.
   *
   * ⚠️ The alternative was to run the whole block INSIDE the cardio screen, which is better for her
   * and touches the session machine — the most fragile thing in this app — to close six steps from
   * another surface. His call was to fix the thing that actually hurts (not knowing where she is)
   * and leave the machine alone. It also makes the bigger version an upgrade rather than a
   * precondition.
   */
  const round = session.setLabel;
  const finish = useCallback(
    (done?: { seconds?: number; metres?: number }) => {
      haptics.setLogged();
      // When it ends the session, the `endResult` effect navigates to Well Done — one path for
      // every shape and every surface, exactly as the set path leaves it.
      void session.completeItem(done);
    },
    [session],
  );

  switch (item.kind) {
    case 'time':
      return <TimeStage item={item} name={name} onDone={(seconds) => finish({ seconds })} />;
    case 'distance': {
      /**
       * ════ A RUN IS NOT A THING SHE CONFIRMS ════
       *
       * Founder, 2026-08-02: *"why does she need a Done button? The GPS can tell us she finished.
       * And we can use our existing cardio screen for these cases, no?"*
       *
       * A 40 m farmer's carry has nothing to measure — she does it and says so, and that is what
       * this stage was built for. A 5 km run is the opposite: the phone measures the distance, the
       * pace, the splits and the route, and asking her to press a button at the end asks her to
       * confirm something it already knows. So a `gps` movement hands over to the cardio stage —
       * the real one, with the map and the live figures — carrying the coach's distance as its
       * target, and that stage ends the run itself when the distance is covered.
       */
      /*
       * ⛔ AND A TREADMILL RUN IS MEASURED TOO (founder, 2026-08-12).
       *
       * This read `isGpsMovement`, so a coach's "5 km on the treadmill" fell to the unmeasured
       * branch: a figure, a Done button, and an ask to confirm a distance the phone could already
       * count. **The flag it asked was about the SATELLITE, and the question is about the phone** —
       * which measures the indoor ones now, from Core Motion.
       *
       * ⚠️ AND IT IS NOT "HAS A DISTANCE". A 40 m farmer's carry is measured in distance and the
       * phone cannot track it — she walks it across a gym floor holding weights. The catalogue
       * states which movements are tracked and by what (`Movement.tracked`); `isTrackedMovement`
       * answers whether, `isOutdoorMovement` answers by what.
       */
      const measured = isTrackedMovement(item.ex);
      return (
        <DistanceStage
          item={item}
          name={name}
          measured={measured}
          onDone={() => (measured ? onRun(item.metres, item.say) : finish())}
        />
      );
    }
  }
}

/* --------------------------------------------------------------- Stage chrome */
/**
 * The stage's chrome: the way out, and where the athlete is.
 *
 * THE PAUSE (founder 2026-07-13: "it looks gaudy — redesign it"). The last pass answered "you
 * can't see it" by drawing a bright hairline box around it, and a bordered square on a black
 * stage is the loudest thing on a screen whose whole job is to be quiet — it read as chrome from
 * another app. A pause does not need a frame to be found: it needs a GROUND. It is now a soft
 * graphite disc, borderless, with a calm ink glyph — visible at a glance, silent when ignored,
 * and unmistakably a pause (an ✕ would promise "discard", which is a lie: nothing is lost here).
 *
 * THE ORDINAL rode in the centre of the bar (founder 2026-07-13) — and does not any more: the rail
 * carries her position now. `ordinal` and `onCoach` were destructured here for a year afterwards
 * without a single read, and `chromeOrdinal` went on being composed on every render to feed one of
 * them. `center` is the live one: the quiet uppercase legend the rest screens use ("REST" /
 * "NEXT EXERCISE").
 */
/**
 * THE CHROME (handoff 2.2) — one quiet line across the top of every training screen.
 *
 * Pause on the reading-start edge, "LIFT 1 / 6 · 23:41" centred, and on the end edge the two moves
 * that are not the set itself: SWAP this lift, and watch its FORM. v7 lifts both out of the footer,
 * where they sat as labelled ghosts under the one act — three buttons competing at the bottom of a
 * screen whose whole job is "do this set". Up here they are found when looked for and silent
 * otherwise, and the footer holds exactly one thing again.
 *
 * All three wear the same 38px disc: `rgba(241,238,229,.08)` behind a `.12` rim.
 */
function StageBar({
  center,
  elapsedFrom,
  onExit,
  onMap,
  onSwap,
  swapQuiet,
}: {
  center?: string;
  elapsedFrom?: number | null;
  onExit: () => void;
  onMap?: () => void;
  onSwap?: () => void;
  /** The swap moment has passed — the disc stays, dimmed, and its press explains (F4). */
  swapQuiet?: boolean;
}) {
  const { t } = useCopy();
  const hasClock = elapsedFrom != null;
  const hasCentre = hasClock || !!center;
  return (
    <View style={styles.stageBar}>
      {/*
        ⛔ TWO A SIDE, NOT ONE AND THREE (founder 2026-08-04): *"in the workout the SWAP appears on
        top of the LIFT."*

        Measured: with pause alone on the left and swap + form + coach on the right, the end group
        needed 130px, the centre's ordinal ran to x=253, and the swap disc began at x=236 — a 17px
        overlap on the one line that tells her where she is.

        Both sides carry `flex: 1`, so the centre only stays centred while they are the same width.
        The coach moves across rather than the centre giving way: pause and the coach are both ways
        OUT of the set, swap and form are both about the lift in front of her. Symmetric, and the
        grouping is the honest one.
      */}
      <View style={styles.stageBarSide}>
        <StageDisc accessibilityLabel={t('workout.pauseAction')} onPress={onExit}>
          <Icon name="pause" size={15} color={stage.ink0} filled />
        </StageDisc>
        {/*
          ⛔ THE MAP HAS A CONTROL NOW (founder 2026-08-29): *"אני רוצה אפשרות לצפות בכל התרגילים
          שעוד יש לנו. כרגע זה בלחיצה על הפסים אבל זה לא מובן כל כך. אולי אפשר להוסיף פקד נוסף."*

          The session map has existed since 2026-08-26 and its only door was the rail — an 8px
          strip of hairlines that says WHERE she is and gives no sign it also opens. A door nobody
          can see is the same as no door, which is why the rest card was still trying to answer
          finding #9 in two truncated names at its foot (that line is deleted; see the note there).

          ⚠️ IT IS ON THE LEFT, and the founder suggested beside the video and the swap. The bar's
          own law is *"TWO A SIDE, NOT ONE AND THREE"* — measured, when the right group held three
          discs the centre's ordinal ran into the swap by 17px, and the clock's space is a founder
          ruling of its own. The grouping the law states is the reason this side is the right home:
          pause and map are both ways to step OUT of the set and look at the session; swap and form
          are both about the lift in front of her. It restores the symmetry rather than spending it.

          `menu` is the glyph on purpose — three horizontal bars, the same shape as the rail it
          doubles, so the two doors into one room read as one idea.
        */}
        {onMap ? (
          <StageDisc accessibilityLabel={t('workout.sessionMap')} onPress={onMap}>
            <Icon name="menu" size={15} color={stage.ink0} strokeWidth={1.7} />
          </StageDisc>
        ) : null}
        {/* ⚠️ AND A SPEECH DISC LIVED HERE THAT NOTHING EVER PASSED. Found while sweeping the
            deletion above: `onCoach` on this bar had no caller anywhere in the app, so the branch
            never rendered — which is why it survived every pass over this screen, including the
            founder's own screenshots. Dead code that LOOKS live is the kind a redesign preserves. */}
      </View>
      {/*
        ════ ⛔ THE CLOCK STANDS ALONE, AND "LIFT 1 / 6" IS DRAWN INSTEAD OF WRITTEN ════

        FOUNDER, 2026-08-12: *"לגבי ה-LIFT שלמעלה — ארצה להעיף אותו ולהציג את זה בצורה שונה
        ויצירתית איזה תרגיל התקדמנו מבלי שזה יוצג במלל. אני רוצה לתת לטיימר את הספייס שלו שיהיה
        בודד שם."*

        The pair was stacked here on 2026-07-28 to stop them sitting side by side as one cramped
        line. That fixed the crowding and kept the cause: **two unrelated questions sharing one
        slot.** Position in the session is not a running number and does not belong beside one.

        It is a RAIL now — one segment per lift, filled behind her — drawn under the whole chrome
        (`LiftRail`). It answers "how far in am I" in a glance, in no language, and it leaves the
        clock the only thing in the middle of the bar.

        ⚠️ `center` STAYS. It is not the ordinal: it is what a beat with no clock puts there
        instead (the rest's own label), and nothing has been said about that.
      */}
      {hasCentre ? (
        <View style={styles.stageBarCentre}>
          {hasClock ? <ElapsedClock from={elapsedFrom as number} /> : null}
          {!hasClock && center ? <Text style={styles.stageBarCenter}>{center}</Text> : null}
        </View>
      ) : (
        <View style={styles.flex} />
      )}
      <View style={[styles.stageBarSide, styles.stageBarRight]}>
        {onSwap ? (
          <View style={swapQuiet ? styles.discQuiet : null}>
            <StageDisc accessibilityLabel={t('workout.swapAction')} onPress={onSwap}>
              <Icon name="repeat" size={15} color={swapQuiet ? stage.ink2 : stage.ink0} strokeWidth={1.7} />
            </StageDisc>
          </View>
        ) : null}

        {/* `speech` and not a lightbulb or an ℹ: this is not the app informing her, it is the
            COACH talking. The glyph names the speaker, which is the whole distinction — and since
            the founder's ruling it is literally true: pressing it opens a conversation. */}
      </View>
    </View>
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WARM-UP, OFFERED (founder, 2026-08-30)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   > *"צריך להציע למתאמן אפשרות לסט חימום ולא חובה. לכן צריך להוסיף בתחילת כל תרגיל את האפשרות
 *   > הזאת שמפנה אותך לסט חימום."* … *"רק בתרגילי הקומפאונד."*
 *
 * It renders itself or nothing: `warmupOffered` is the store's single answer to "is a bridge legal
 * here", and it is 0 on every beat but two — the first set of a compound, and the crossing INTO
 * one. No caller decides; every caller just draws it.
 *
 * ── ⛔ IT IS NOT A DISC, AND THAT IS THE BAR'S OWN LAW ───────────────────────────────────────────
 * The stage bar holds *"TWO A SIDE, NOT ONE AND THREE"* (founder 2026-08-04), and it is a MEASURED
 * law — with three discs on one side the centre and the end group overlapped by 17 points. A
 * warm-up disc would be the third on a crossing, which already draws swap and form.
 *
 * ── AND IT IS NOT A SECOND ACT EITHER ───────────────────────────────────────────────────────────
 * The foot of this screen holds ONE act (*"the foot returns to ONE act"*, at the Complete Set
 * button). This is the `+15 sec` shape exactly — a full-width quiet press, no fill, no rim, under
 * the act — which is the idiom this stage already uses for the secondary thing a footer offers.
 * A warm-up is the same kind of thing as fifteen more seconds: a choice about how she gets to the
 * work, made in the action zone, next to the act and clearly beneath it.
 *
 * ⚠️ THE COUNT IS IN THE LABEL. "Add a warm-up · 2 sets" says what pressing costs before it is
 * pressed — the day's first compound is offered two bridges and a later one gets a single one, and
 * an athlete deciding at the rack is deciding about minutes.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ATHLETE, ON THE STAGE — the figure carries the state (founder, 2026-08-31)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   > *"מסך האימון לא ברור האם זה המסך שצריך להזין בו את הסט או שזה המסך שמציג את התרגיל."*
 *   > *"אני מציע שנעשה את הדמות שיצרנו כגיבור של המסך… הדמות מדמה את כל מהלך האימון."*
 *
 * ⛔ THE SET SCREEN WAS THE ONLY SCREEN IN THE WORKOUT WITH NO STATE AND NO MOTION. A rest has a
 * ring counting down — an object that visibly says *something is running*. A set had a name, two
 * numbers and a button, identical before she lifted and after, which is exactly why it read as a
 * display of the exercise rather than as the place the result goes. Everything downstream of that
 * came from it: a set performed and never logged, a rest clock that starts at the tap instead of at
 * the last rep, and `learnedExecS` reading the whole gap as execution.
 *
 * ── ⛔ THE POSE IS DRIVEN BY WHAT THE APP KNOWS, NEVER BY A REP COUNT ────────────────────────────
 *
 * The founder's first shape was *"the figure performs the maximum reps, then switches to entering
 * the set"*. The instinct is right and the trigger cannot be the count. A 8–12 band drawn at the
 * rig's own tempo finishes twelve reps in about twenty-five seconds; her set takes fifty-five. The
 * figure would sit down with a phone while she is on rep six — and then it is a PACER telling her
 * she is late, and the logging pose appears on every single set whether or not anything is wrong,
 * which spends the one signal this whole feature exists to send.
 *
 * So the switch is `session.setRunningLong` — setup + reps × this lift's own rep time + ten
 * (`domain/setDwell.nudgeAfterS`), which is the same instant the notification and the haptic
 * already fire on — and which is now plain arithmetic off the prescription rather than a
 * measurement of her (his second ruling of 2026-08-31: *"סתם סיבכת את זה… זה צריך להיות פשוט"*).
 *
 * ⚠️ AND `SetRunningLong`'S SENTENCE STAYS, WHICH IS A DELIBERATE READING OF "ONE MOMENT, ONE
 * TELL". It looked at first like the pose must replace the line. It must not: they are not two
 * statements of one fact. The pose says WHAT TO DO — she is standing over her phone, so should you
 * be. The line says WHY, and the why is the founder's own distinction from 2026-08-30 (*"אל תשכח
 * להזין" is an alarm; "this set is running longer than yours usually do" is somebody who has been
 * watching*). It is also the only half a screen reader can hear: a pose is worth nothing to
 * VoiceOver, and this is the one moment on the stage the athlete is meant to be interrupted.
 *
 * If it turns out to read as a pile on real glass, the LINE is the half to drop — never the pose,
 * because the pose is the only one of the two that speaks to somebody who is not reading.
 *
 * ── ⚠️ WHAT IS NOT DONE YET, AND SHOULD BE ──────────────────────────────────────────────────────
 *
 * The figure reps at the RIG's tempo, not at hers. `learnedExecS` is already on this screen and the
 * honest version scales the loop to it, so the drawn set and her set finish together — that is what
 * turns this from a stock animation into her. It is a second pass because it means deriving a rig
 * per athlete per lift, and `MotionFigure`'s clock restarts whenever the rig identity changes, so
 * it has to be memoised or it stutters every render.
 *
 * ⚠️ `fps` IS CAPPED FOR THE SAME REASON `DayInMotion` CAPS IT. A `MotionFigure` rebuilds every
 * primitive on every frame; this one is on screen for the whole workout, on the phone she is about
 * to train with. 24 is what the eye reads as movement and it is what cinema has run at for a
 * century.
 */
const STAGE_FPS = 24;

function StageAthlete({ exerciseId }: { exerciseId: string | null | undefined }) {
  const app = useApp();
  const session = useSession();
  const lift = exerciseMotion(exerciseId);
  /* A lift with no rig yet draws NOTHING rather than a stand-in: a generic body performing a
     movement that is not the one she is doing is worse than an empty slot, and the caller keeps
     its own shape either way. */
  const rig = session.setRunningLong ? loggingRig : lift;
  if (!rig) return null;
  return (
    <MotionFigure
      rig={rig}
      tone="stage"
      fps={STAGE_FPS}
      fit
      figure={app.profile?.sex === 'female' ? 'female' : 'male'}
      style={styles.athleteFigure}
    />
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * SHE IS SITTING, BREATHING, AND EVERY SO OFTEN SHE DRINKS (founder, 2026-08-31)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   > *"במנוחה אפשר לעשות אנימציה שהמשתמש גם שותה מים."*
 *
 * ⛔ ONE RIG CANNOT DO BOTH, and the reason is structural rather than a matter of effort. `poseAt`
 * is a pure function of `rom`, and `rom` is a TRIANGLE — the timeline runs it 0 → 1 → 0 every loop.
 * Anything authored to happen once per loop therefore happens twice, once on the way up and once on
 * the way back, so "breathe three times, then take a drink" has nowhere to live inside a single
 * `rom`. Two rigs and a clock is the honest shape, and it is what `DayInMotion` already does to
 * walk one figure through a day of lifts.
 *
 * ⚠️ THE CUT IS INVISIBLE BY ARITHMETIC, NOT BY LUCK. `MotionFigure` anchors its clock at MOUNT and
 * does NOT restart it when the rig changes, so both rigs are always being asked for a pose at the
 * same elapsed time. The breath loops in 9 s and the drink in 3, and the swap fires on a multiple of
 * both — so at every swap instant each rig is at rom 0, and their rom-0 poses are identical by
 * construction (`life.ts`, held by `__tests__/motion/life.test.ts`). Nothing moves at the cut.
 *
 * ⚠️ AND IT IS RARE ON PURPOSE. Three breaths between drinks. A figure that drinks every few
 * seconds is not resting, it is fidgeting — and the whole value of the beat is that it is a small
 * human thing that happens while you are waiting, not a loop you start watching.
 */
const BREATHS_BETWEEN_DRINKS = 3;
const BREATH_LOOP_MS = 9000;
const DRINK_LOOP_MS = 3000;

function RestingAthlete() {
  const app = useApp();
  const [drinking, setDrinking] = useState(false);
  useEffect(() => {
    /* One chained timeout rather than an interval, because the two phases have different lengths
       and an interval would drift them apart within a single long rest. */
    let id: ReturnType<typeof setTimeout>;
    const step = (next: boolean) => {
      setDrinking(next);
      id = setTimeout(() => step(!next), next ? DRINK_LOOP_MS : BREATH_LOOP_MS * BREATHS_BETWEEN_DRINKS);
    };
    id = setTimeout(() => step(true), BREATH_LOOP_MS * BREATHS_BETWEEN_DRINKS);
    return () => clearTimeout(id);
  }, []);
  return (
    <MotionFigure
      rig={drinking ? drinkingRig : restingRig}
      tone="stage"
      fps={STAGE_FPS}
      fit
      figure={app.profile?.sex === 'female' ? 'female' : 'male'}
      style={styles.restFigure}
    />
  );
}

/**
 * ⛔ THE CROSSING SHOWS THE LIFT SHE IS WALKING TOWARDS (founder, 2026-08-31).
 *
 *   > *"בסט המעבר אני חושב שצריך להיות אנימציה של התרגיל הבא כי זה ישר הנעה לפעולה."*
 *
 * He is right, and it also settles what the crossing was missing when the seated figure had to be
 * suppressed there: a transition is the ONE rest where she is on her feet, walking to a station,
 * being told how much to load. A figure sitting on a bench contradicts that; the next lift being
 * performed is the instruction itself, arriving before she reaches the rack.
 *
 * It is the same `MotionFigure` the set stage runs, on the same rig, at the same cap — so what she
 * watches on the way over is exactly what she will be standing in front of.
 */
function CrossingAthlete({ exerciseId }: { exerciseId: string | null | undefined }) {
  const app = useApp();
  const rig = exerciseMotion(exerciseId);
  if (!rig) return null;
  return (
    <MotionFigure
      rig={rig}
      tone="stage"
      fps={STAGE_FPS}
      fit
      figure={app.profile?.sex === 'female' ? 'female' : 'male'}
      style={styles.restFigure}
    />
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * "THIS SET IS RUNNING LONG" — the foreground half of the ask (founder, 2026-08-30)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   > *"אני לפעמים שוכח להזין את תוצאות הסט וכבר ממתין לסט הבא ואז כשרואה שזה לא הגיוני שהמנוחה
 *   > עדיין לא הסתיימה אני מבין ששכחתי להזין בכלל את סיום הסט."*
 *
 * ── ⛔ IT IS A LINE, NOT AN ALERT, AND THAT IS THE FOUNDER'S OWN DISTINCTION ─────────────────────
 * *"אל תשכח להזין"* is an alarm; a line that says her set is running longer than her sets run is
 * somebody who has been watching. Same feature, opposite meaning — and only the second is
 * available to a product that measured her first (`domain/setDwell.nudgeAfterS` is twice HER
 * execution on THIS lift, never a constant).
 *
 * So: no sheet, no modal, no banner over the stage. One line above the act, in the muted ink, with
 * ONE haptic behind it — the stage's whole job is to hold a single decision, and this does not
 * become a second one. The act underneath is already the answer to it.
 *
 * ⚠️ THE HAPTIC FIRES ONCE PER SET, guarded by the store (`nudgedRef`), not by this component: a
 * remount mid-set must not buzz her again for a question already asked.
 */
function SetRunningLong() {
  const { t } = useCopy();
  const session = useSession();
  const long = session.setRunningLong;
  const buzzedRef = useRef(false);
  useEffect(() => {
    if (!long) {
      buzzedRef.current = false;
      return;
    }
    if (buzzedRef.current) return;
    buzzedRef.current = true;
    haptics.warning(); // the one beat — a tap on the shoulder, not the rest-over GO
  }, [long]);
  if (!long) return null;
  /*
   * ⛔ THE ONLY SET THIS LINE STILL SPEAKS FOR IS THE LAST ONE (2026-09-07 — the session runs
   * itself). Every other set is presumed by the clock at exactly this instant (`domain/sessionClock`)
   * and the stage moves to the rest; the last set of the session is the one the clock never touches,
   * because SESSION_SAVED is hers alone. So what is running long here is the workout, and the ask
   * is the finish — the act underneath it.
   */
  return (
    <Text style={styles.runningLong} accessibilityLiveRegion="polite">
      {t('workout.finishAsk')}
    </Text>
  );
}

function WarmupOffer() {
  const { t } = useCopy();
  const session = useSession();
  const n = session.warmupOffered;
  /* ⛔ `> 0`, NOT `<= 0` — the difference is a broken label on the harness (found 2026-08-31 by
     looking at 2.4b in Chrome). `undefined <= 0` is FALSE, so a view that has not supplied this
     field fell through the guard and drew *"+ חימום · סטים"* — the sentence with its number
     missing, because i18next drops a placeholder given `undefined`. A count control must treat
     "no number" as "no offer", which is also the honest reading. */
  if (!(n > 0)) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={n === 1 ? t('workout.addWarmupOne') : t('workout.addWarmup', { n })}
      onPress={session.addWarmup}
      style={({ pressed }) => [styles.addFifteen, pressed && styles.addFifteenPressed]}
    >
      <Text style={styles.addFifteenLabel}>
        {n === 1 ? t('workout.addWarmupOne') : t('workout.addWarmup', { n })}
      </Text>
    </Pressable>
  );
}

/** One 38px chrome disc — the only control shape the training stage's top line has. */
function StageDisc({ accessibilityLabel, onPress, children }: { accessibilityLabel: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.stageDisc, pressed && styles.stageDiscPressed]}
    >
      {children}
    </Pressable>
  );
}

/**
 * THE ELAPSED CLOCK (handoff 2.2) — mm:ss since the session began, ticking once a second.
 *
 * It rides in the chrome beside the ordinal: the one running number on a training screen that is
 * not a load or a rep. MONO digits only — never a translated word — so it stays inside the
 * two-voice law (`monoCarriesNoWords`): mono is what the instrument MEASURES; it never speaks.
 * The clock reads from `session.startedAtMs` (the epoch instant the workout began), so it survives
 * a screen change and a pause — it is the wall-clock length of the session, not a per-screen timer.
 */
/**
 * ════ HOW FAR INTO THE SESSION SHE IS, DRAWN ════
 *
 * One segment per lift, in order, filled up to and including the one she is on. It replaces the
 * words "LIFT 1 / 6" (founder 2026-08-12) and it answers the same question faster and in every
 * language — a bar that is a third full IS "a third of the way in".
 *
 * ⚠️ THE CURRENT SEGMENT IS THE LIT ONE and the ones behind it are dimmer, so the rail says where
 * she IS rather than only how much is done. A single uniform fill would leave her counting.
 *
 * ⚠️ AND IT IS NOT A PROGRESS BAR FOR TIME. It moves once per lift, never continuously — a rail
 * that crept would invite her to read a rate into it, and there is no rate here to read.
 */
/**
 * ════ ⛔ ONE RAIL. THE LIFT SHE IS ON OPENS INTO ITS SETS ════
 *
 * FOUNDER, 2026-08-12: *"התכוונתי למצוא דרך לאחד את מספר הסטים יחד עם מספר התרגיל. בדרך כלשהי."*
 *
 * The first attempt stacked two rows — the session above, the sets below. That is not a union, it is
 * two instruments touching, and he said so.
 *
 * A union has to come from what the facts ARE: **her sets live inside her lift.** So the rail is the
 * session, one segment per lift — and the segment she is standing in EXPANDS and splits into its own
 * sets. Nothing else on the row moves. One instrument, one row, both facts, and the nesting is the
 * drawing rather than a caption on it.
 *
 * ⚠️ THE ACTIVE SEGMENT IS WIDER BY FLEX, not by a fixed width, so a two-lift day and a nine-lift day
 * both fill the row. It is the only segment that can be counted, which is right: she needs to COUNT
 * her sets and only to SEE her position in the session.
 */
function LiftRail({
  index,
  total,
  setN,
  setM,
  warmup,
}: {
  index: number;
  total: number;
  setN?: number;
  setM?: number;
  warmup?: boolean;
}) {
  const { t } = useCopy();
  const sets = setM && setM > 1 && setN ? setM : 0;
  if (total <= 1 && !sets) return null;
  return (
    <View
      style={styles.railRow}
      accessibilityRole="progressbar"
      accessibilityLabel={[
        total > 1 ? t('workout.exerciseCount', { n: index + 1, N: total }) : null,
        sets ? t(warmup ? 'workout.warmupOfM' : 'workout.setOfM', { n: setN, m: setM }) : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      {/*
        ════ ⛔ THE TRACK IS GONE — THE SENTENCE STAYS (founder, 2026-09-07) ════

        *"יש גם פס התקדמות במסך האימון וגם את מספר התרגיל ואיזה סט. צריך לבחור מה מהם נשאר. אני
        חושב שעדיף להוריד את פס ההתקדמות הזה."*

        The rail was two rows of one instrument: strokes per lift with the live lift opened into
        pips, and, since 2026-09-01, the same fact written under it as a caption. Two statements of
        one position, eight points apart — the exact excess this screen has been losing all summer,
        and he chose which one goes. The strokes and the pips are deleted; the WRITTEN line is the
        instrument now, and it keeps the rail's three duties: the `progressbar` role with the whole
        sentence for VoiceOver, the same `setLabel` derivation for every shape (a run, a hold, a
        set), and the door onto the session map (the `Pressable` around it). Nothing she could read
        or reach is lost; one drawing is.
      */}
      {/*
        ════ ⛔ THE WRITTEN COUNT IS BACK — AS THE RAIL'S OWN CAPTION (founder, 2026-09-01) ════

        Cut on 2026-08-26 ("בשביל זה יש את הפס שמופיע לידו") and reinstated by the founder's
        standing instruction of 2026-09-01: every deferred design-review finding is treated on the
        reviewer's judgment. The judgment: the pips ARE the instrument, and an instrument this
        small still earns a caption — a sighted athlete mid-set was counting hairlines to answer
        "which lift am I on", a sentence the rail was already speaking to VoiceOver and to nobody
        else. So the SAME string the accessibilityLabel carries is drawn once, small and muted,
        centred under the track. Not a second instrument — the first one's label.
      */}
      {total > 1 || sets ? (
        <Text style={styles.railLine} numberOfLines={1}>
          {[
            total > 1 ? t('workout.exerciseCount', { n: index + 1, N: total }) : null,
            sets ? t(warmup ? 'workout.warmupOfM' : 'workout.setOfM', { n: setN, m: setM }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ LAST TIME, DRAWN — NOT IMPLIED (founder, 2026-08-26)
 *
 *   *"אני עדיין לא מבין איך אתה הולך להציג את החזרות והמשקלים מהאימון הקודם במידה וצריך את זה. כי
 *   אם כן כרגע אני לא רואה את זה."*
 *
 * He is right, and the honest answer was: it wasn't drawn. What "last time" had on this stage were
 * two INFERENCES — a `↑1.5` delta on the weight heading, and a 6-point moss dot on each dial's
 * track. Both are true, both are clever, and neither is the sentence she came to the screen for:
 * **what did I do last time.** A dot is not a figure; a delta is arithmetic she has to run
 * backwards to recover the number it was measured from.
 *
 * ── WHY IT IS SAFE TO PRINT THE REPS AGAIN ──────────────────────────────────────────────────────
 * ⚠️ THIS ROW WAS DELETED ONCE, ON A REAL DEFECT (2026-08-12): `Complete set` wrote
 * `recommendedReps` — the FLOOR of the band — so an athlete who did ten and tapped once was
 * recorded as eight, and the row printed the lie back to her a week later. **The dials fixed the
 * cause** (2026-08-26: the figures on the stage are wheels, and what is logged is what they say),
 * so the record is hers now and the row can be trusted. Same reason `LoggedCapture` was allowed to
 * put her rep count on the beat.
 *
 * ── WHAT IT SAYS, AND WHAT IT REFUSES TO SAY ────────────────────────────────────────────────────
 *   · ONE LOAD when every set carried the same one — the common case, and the shortest true form.
 *   · PER-SET `w×r` the moment they differ, because Loop 1 moves the load mid-exercise and one
 *     figure over four sets she did at two weights is a workout that did not happen.
 *   · The set she is standing in NOW is lit, so the comparison is positional and needs no labels —
 *     the same idea `setRow` was built on, at a size a gym can read.
 *   · NOTHING on a warm-up bridge: half the working load is not a comparison (Rev 8's whole
 *     complaint), and the caller suppresses it for the same reason it suppresses the dial markers.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
function ElapsedClock({ from }: { from: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  // Floored, then formatted by the workout's one clock (`clockOf`) — the elapsed never rounds up.
  return <Text style={styles.stageBarClock}>{clockOf(Math.max(0, Math.floor((now - from) / 1000)))}</Text>;
}

/**
 * THE BREATH — the rest ring's slow 4.5 s in / 4.5 s out (v7's "one physics").
 *
 * It is the only ambient motion in the product, and it is doing a job: a screen where nothing
 * moves for two minutes reads as frozen, and an athlete checks whether the app is still running.
 * A ring that breathes says "still counting" without a single moving digit. Scale 1 → 1.035, so it
 * is felt rather than watched. Off entirely under Reduce Motion.
 */
function Breathe({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (reduced) {
      scale.value = 1;
      return;
    }
    scale.value = withRepeat(
      withSequence(
        withTiming(1.035, { duration: motion.dur.breath / 2, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: motion.dur.breath / 2, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/* ------------------------------------------------------- Equipment-native load */
/** The setup instruction lines under the headline load — equipment-native, never a universal
 *  "per side". Tells the athlete exactly how to load the weight so they never have to calculate. */

type ExecT = (k: string, o?: Record<string, unknown>) => string;

/**
 * The equipment-native figure that rides INLINE beside the load hero (mock 2.2, line 382):
 * "7 kg a side" / "14 kg per hand". The number is a measurement (mono, cream); the suffix is a
 * word (sans, quiet). Absent for pin/fixed-bar, where the hero already IS the whole figure. This
 * is the per-side / per-hand fact the old ExecInstruction chip carried, folded into the hero the
 * mock points the eye at — so the load and how to load it read as one thing, not two.
 */
function heroAnnex(
  setup: LoadSetup | null,
  t: ExecT,
  units: 'kg' | 'lb',
): { value: string; suffix: string } | null {
  if (!setup) return null;
  switch (setup.style) {
    case 'barbell':
    case 'plate_loaded':
      if (setup.perSide == null || setup.perSide <= 0) return null;
      /*
       * ⛔ THE TOTAL A SIDE, NOT THE PLATE STACK (founder, 2026-08-26 — third cut, reversing the
       * 2026-08-21 "plates, not arithmetic" line): *"לא צריך 5 + 1.25 וממש לפרק לפלטות. לדוגמא
       * משקל — 7.5 קילו בכל צד."* As a compact heading suffix the decomposition became the noise;
       * "7.5 a side" is the one figure she racks by, on every equipment class, on every set.
       * The unit is dropped from the VALUE too — the word beside it ("משקל") attests it.
       */
      return { value: `${setup.perSide}`, suffix: t('load.aSide') };
    case 'dumbbell':
      if (setup.perHand == null) return null;
      return { value: `${setup.perHand}`, suffix: t('load.perHand') };
    default:
      return null; // pin / fixed-bar: the hero is the figure
  }
}

/**
 * One equipment chip on the first-week calibration card (mock 2.0): a moss-stroke glyph + the
 * implement's name. The mock draws the name in mono, but mono has no Hebrew — so the word rides in
 * SANS (the monoCarriesNoWords law), moss glyph doing the mock's job of coloring it as "learned".
 */
function CalChip({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.calChip}>
      <Icon name={icon} size={14} color={signal[0]} strokeWidth={1.8} />
      <Legend track={0} style={styles.calChipText}>{label}</Legend>
    </View>
  );
}

/* ----------------------------------------------------------------- Active Set */
/*
 * ════ THE EQUIPMENT'S OWN DETENT, SHARED (2026-08-26) ════
 * One ladder for every control that can put a load into her history: the stage's nudgers, the
 * editor's dials and the lock screen's steppers read the SAME per-equipment step and the same bar
 * floor — `domain/weightStep` since 2026-09-08, so the Live Activity turns by it too. The full
 * reasoning — the 41.5 kg bench that no plates could build — lives at the DETENT note inside EditSet.
 */

/** No lift goes under its bar — the same `emptyBarKg` floor the editor's wheel refuses to cross. */
function weightFloorFor(units: 'kg' | 'lb', equipment: string | undefined): number {
  const floorKg = equipment ? emptyBarKg(equipment as Parameters<typeof emptyBarKg>[0]) : 0;
  return floorKg > 0 ? (displayWeight(floorKg, units) ?? 0) : 0;
}

function ActiveSet({
  units,
  notice,
  onComplete,
  onWhy,
  onDemo,
}: {
  units: 'kg' | 'lb';
  /** A notice owns the footer while it is up — the buttons stand down (see SessionFlow.notice). */
  notice: boolean;
  onComplete: () => void;
  onWhy: () => void;
  /** Opens the technique sheet. Absent while a beat is up, or on a lift with no film. */
  onDemo?: () => void;
}) {
  const { t } = useCopy();
  const session = useSession();
  const pair = usePair();
  /* She is at the shared station, the bar is hers, and her partner is answering — the one state in
     which "Complete set" is also "your turn is over". Every other state leaves the label alone. */
  const passingTheBar =
    pair.stage === 'live' && pair.atSameStation && pair.standing?.mine === true && !pair.standing.stale;
  const partnerName = pair.partnerName ? bidi(pair.partnerName) : null;
  const ex = session.currentExercise;
  const target = session.currentTarget;
  /* How wide the news chip actually is, so the centred heading can be kept out of its corner —
     see the note at the heading row. Zero until it has drawn, which is also when there is no news.

     ⛔ IT IS ABOVE THE GUARD BECAUSE IT IS A HOOK, AND THAT IS THE FOUNDER'S CRASH (2026-08-31):
     *"בעת יציאה ממסך האימון בתחילת האימון או בזמן שקרוב אליו האפליקציה קורסת."*

     The guard below is right and was written for the right reason — `currentTarget` really is null
     for one frame when a session ends. But it sat ABOVE this `useState`, so on that frame this
     component rendered THREE hooks where it had rendered four, and React does not tolerate that:
     *"Rendered more hooks than during the previous render"* is a thrown error, not a warning. The
     guard against the crash WAS the crash.

     ⚠️ AND IT ONLY EVER FIRED AT THE START OF A WORKOUT, which is why it survived every eye-pass.
     Leaving before anything is logged takes `finalize`'s not-started branch, which dispatches END —
     emptying the plan — and sets `endResult` in the SAME batch. React renders before the effect
     that navigates runs, so the stage draws one frame on an empty plan. Leave later and the session
     has work in it, takes the ordinary door, and this frame never exists. */
  const [newsW, setNewsW] = useState(0);
  /*
   * ════ ⛔ ONE SLOT, TWO OCCUPANTS: THE ATHLETE, OR THE LOAD SHE IS UNDER ════
   *
   * FOUNDER, 2026-08-31: *"בתור אחד שהתאמן עם האפליקציה — ברגע שהמשקל מונח על המוט או הפין במכשיר
   * או המשקולת ביד — המשקל כבר לא הגיבור כי ב-90% מהזמן המשקל הזה לא מתחלף לאורך כל התרגיל."*
   *
   * He is right, and the codebase had already written half of it down: the UP-NEXT LAW (see the
   * rest screen) prints the load on a CROSSING — where it is a racking instruction — and refuses to
   * print it between sets, because *"the load and the reps were on the stage thirty seconds ago and
   * will be on it again in thirty more"*. The load is news at the moment it is SET, not for the
   * duration it is held. This finishes that sentence: it is not news during the set either.
   *
   * ⚠️ SO IT IS DEMOTED, NOT DELETED — and the FIRST attempt got the demotion wrong, which is worth
   * recording because it is the trap this pattern always sets:
   *
   *   > *"ושמתי לב שהמשקל נעלם מהמסך כך שאי אפשר לשנות אותו, זה לא תקין."* — the founder, on it
   *
   * The load became a 19-point muted caption under the athlete, tappable, opening the wheel in
   * place. Every part of that worked and **he never found it**, because a small grey line does not
   * read as a control — it reads as a screen that lost a feature. A demotion has to move a thing
   * DOWN THE HIERARCHY, not out of it.
   *
   * ── THE SHAPE IT SETTLED INTO ───────────────────────────────────────────────────────────────
   *
   * The stage is three blocks: WHO (the lift, and last time) · the ATHLETE · the PRESCRIPTION.
   * The prescription is two figures at gym size, side by side, both always on screen and both
   * pressable — which is the 2026-08-12 ruling verbatim (*"a barbell prescription is one sentence
   * with two numbers in it"*), just no longer spelled out in two 164-point wheels.
   *
   * Pressing a figure puts ITS wheel where the athlete stands. That box is 211 points and a
   * heading-plus-wheel is 217, so nothing on the stage moves; and the figure being edited leaves
   * the prescription row while its wheel is up, so no number is ever stated twice.
   */
  const [slot, setSlot] = useState<'athlete' | 'weight' | 'reps'>('athlete');
  /*
   * ════ ⛔ THE REP COUNT STARTS EMPTY, AND IT IS THE BEST ANSWER THIS SCREEN HAS ════
   *
   * FOUNDER, 2026-08-31: *"ובחזרות להשאיר ריק."*
   *
   * It reads at first like a small preference and it is the closest thing to a cure for the problem
   * that started this whole redesign — *"לא ברור האם זה המסך שצריך להזין בו את הסט או שזה המסך
   * שמציג את התרגיל"*, and the set he performed, forgot to log, and lost.
   *
   * **A screen with an empty field cannot look finished.** The nudge detects the lapse afterwards
   * and the athlete's pose says she should be logging; an empty rep count means there is nothing to
   * mistake — the set is visibly not recorded until she records it, at a glance, with no timer and
   * no notification involved.
   *
   * ⚠️ AND IT CLOSES A REAL DEFECT IN THE RECORD. The stage's own scar: *"`Complete set` wrote
   * `recommendedReps` — the FLOOR of the band — so an athlete who did ten and tapped once was
   * recorded as doing eight."* A pre-filled count is the app answering for her, which is the exact
   * thing `theAppNeverAnswersForHer` exists to stop; it was stopped on the coach's sheet and left
   * standing on the one number the whole engine reads back.
   *
   * ⚠️ THE COST IS HONEST AND IT IS A TAP. One set used to be one press. It is now: the count, then
   * the act. That is the price of the log being true, and the founder set it knowingly.
   */
  /*
   * ════ ⛔ SUPERSEDED — THE FIELD OPENS FULL, AND THE ACT LOGS AS WRITTEN (founder, 2026-09-07) ════
   *
   * Everything above was right for a diary, and the founder approved the plan that ends the diary:
   * *"בכל סט וסט להזין ולהכנס לפלאפון… היתרון בלהתאמן לבד שאתה לא צריך להשתעבד לפלאפון."* The set
   * is now presumed done as written (`domain/sessionClock`), and a deviation is what she enters —
   * so the field shows the prescription in the muted ink until she types, and the act logs the set
   * as written in one press. `repsTyped` still means "she typed": empty is "as written", never
   * "nobody has said" — the clock is about to say it, and the rest screen says it was the clock.
   * `theAppNeverAnswersForHer` still holds where it matters: the RECORD carries the clock's mark
   * (`presumed`), and nothing reads a presumed set as her performance (`domain/setEvidence`).
   */
  const [repsTyped, setRepsTyped] = useState<string>('');
  /** What is being typed right now, as glyphs — so `7.` and `07` behave the way a keypad does. */
  const [draft, setDraft] = useState<string>('');
  /*
   * ⛔ THE PRE-FILLED VALUE IS REPLACED BY THE FIRST KEY, NOT APPENDED TO — and the founder's
   * question about a slider is what surfaced it (2026-08-31): *"מה קורה במידה וכן רוצים לשנות
   * משקל?"*
   *
   * The weight field opens holding what is already on the bar, because it is a CORRECTION and
   * starting from blank would make her retype a number she is not changing. Appending to it is the
   * trap: her prescription is 8.25 a side, and going to 10 meant four presses of backspace before
   * the first digit. Four presses to delete something she never typed.
   *
   * ⚠️ IT IS ALSO WHY THE KEYPAD SURVIVES THE SLIDER QUESTION. With the replace, ANY weight is two
   * or three presses from any other — a plate up, or a jump from 7 to 25 — which is the one thing a
   * drag can never be. Every calculator and every form field on earth behaves this way; it is only
   * a decision here because the field starts full.
   */
  const [draftPristine, setDraftPristine] = useState(false);
  /*
   * ⛔ THE BUTTON MAY NOT ANSWER WITH SILENCE (design review 2026-09-01). Pressing "Complete set"
   * with no count opened the keypad and said nothing — from the floor that reads as "the button
   * didn't work, then something jumped". The pad still opens (disabling the act would be the app
   * refusing a set she performed), but a line above the act now says WHY, in the same voice and
   * place the running-long nudge uses. It clears itself the moment a count lands.
   * ⚠️ ABOVE THE `!target` GUARD — a hook below it is the founder's own crash, third telling.
   */
  /* `askedForReps` is gone with the rule it served (2026-09-07): the act no longer refuses a set.
     `holdClock`, which took its seat, went with the clock's presumption (2026-09-09): no clock
     writes a set, so there is nothing for an open field to hold. */
  /*
   * WHICH STEP THIS IS — one string, and the only reason it is derived up HERE.
   *
   * ⛔ ABOVE THE `!target` GUARD, FOR THE REASON THE NOTE 15 LINES UP SPELLS OUT. The effect below
   * closes the wheel when the set changes, and it was written next to `beat` where it reads best —
   * which put a fifth hook BELOW the early return and reproduced the founder's crash of this same
   * morning, verbatim, in the same component, on the same guard. *"Rendered more hooks than during
   * the previous render"*, thrown, on leaving a workout at its start.
   *
   * ⚠️ AND `beat` IS NOW THIS, rather than a second copy of the same expression built later. Two
   * derivations of "which step is she on" is how the `Arrive` keys and this reset would come to
   * disagree about when a set has changed.
   */
  const beat = `${session.currentExerciseId ?? ''}-${session.setLabel?.warmup ? 'w' : ''}${session.setLabel?.n ?? 1}`;
  /* A new set gives the slot back to the athlete. Without this the athlete who corrected set 2's
     load meets set 3 with a dial where the figure should be — and the slot's whole argument is that
     a wheel is what she ASKED for, not what the screen defaults to. */
  /* What the ENGINE asked for this set — captured at the beat's open, BEFORE any edit writes
     through to the live target. The restore line below offers exactly this number back. */
  const plannedWeightRef = useRef<number | null>(null);
  useEffect(() => {
    setSlot('athlete');
    setRepsTyped('');
    setDraft('');
    setDraftPristine(false);
    plannedWeightRef.current = session.currentTarget?.recommendedWeight ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat]);
  /* One frame, on the way out — see the hook above. Every hook this component owns has now run, so
     the count is stable whichever way this returns. */
  if (!target) return <View style={styles.center} />;
  // ⛔ THE EDITOR SCREEN IS GONE (founder, 2026-08-26 — the second cut of the live-set redesign).
  // "Edit set" was a room because the stage's figures were posters; the figures are DIALS now, so
  // the room's whole inventory — two engraved wheels — lives here, on the set itself. One screen,
  // zero doors. See the note at the dials below.
  /*
   * ⛔ `ex?.name` SHORT-CIRCUITED THE ONE PATH THAT SPEAKS HEBREW (2026-08-21). The catalogue's
   * `name` is canonical English — data the import matcher and the coach prompt depend on — so
   * reaching it first meant the stage drew "Triceps Pushdown" under a Hebrew muscle line.
   * `exerciseDisplayName` resolves the locale and falls back to that same field.
   */
  const exName = exerciseDisplayName(session.currentExerciseId);
  const total = session.exerciseProgress?.total ?? 1;
  const exNo = (session.exerciseProgress?.index ?? 0) + 1; // exercise ordinal among distinct exercises
  const lastTime = session.lastTime;
  const setN = session.setLabel?.n ?? 1;
  const setM = session.setLabel?.m ?? 1;

  const isBodyweight = target.recommendedWeight == null;
  // The engine v5 rep BAND — a floor to clear, a ceiling that means "too light" (models.ts §159/162).
  // `recommendedReps` starts equal to the floor but the athlete's edit overwrites it with her PERFORMED
  // reps, so the band must be read from repBandLo/Hi (mirrors Home.tsx's fallback ladder).
  const [bandLo, bandHi] = bandOf(target) ?? [8, 8];

  /*
   * ════ ⛔ THE FIGURES ARE THE DIALS (founder, 2026-08-26 — the live-set redesign, second cut) ════
   *
   * *"אם מעכשיו אנחנו נותנים למתאמן להזין במדויק כמה משקל הוא באמת הרים וכמה חזרות הוא באמת עשה…
   * המסך הראשי בעצמו צריך להשתנות כך שבכל סט נרשום את המשקל והחזרות שביצענו."* — and on the first
   * cut's ± buttons: *"לא יהיה הכי אלגנטי… להכניס את הסליידרים מהעורך למסך הראשי?"*
   *
   * He was right both times. The stage used to CONFIRM the prescription and hide the correction
   * behind a door — an athlete who did 7 where 8 was written taps the big button rather than open
   * a door, so the engine learned the prescription instead of the set. And a bare ± was the wrong
   * instrument for half the corrections (a 60→40 drop is forty taps).
   *
   * So each figure IS the product's own engraved dial — the same `WheelPicker` the intake rulers
   * and the late editor were built from: chevron ends for the one-detent nudge, a fling for the
   * far jump, `adjustable` to a screen reader. Did exactly what was written → one tap on Complete,
   * unchanged. Did anything else → the correction happens where her eyes already are. Complete Set
   * always logs what the stage SHOWS, so what the engine learns is what happened.
   *
   * ⚠️ EVERY TURN WRITES THROUGH `editCurrentSet` — the single entry `theEngineDecidesWhatASetIs`
   * pins — so the plate math, the per-side annex and the ↑/↓ news restate themselves live from the
   * one written fact. The detent and the floor are the equipment's own (`weightStepFor` /
   * `weightFloorFor`): a dial on the stage must not mint a load the room cannot build.
   *
   * ⚠️ AND THE EDITOR SCREEN IS DELETED, not orphaned: its whole inventory was these two dials.
   */
  const wStep = weightStepFor(units, ex?.equipment);
  const wMin = weightFloorFor(units, ex?.equipment);
  const weightVal = displayWeight(target.recommendedWeight, units) ?? 0;
  const setDialWeight = (v: number) => {
    session.editCurrentSet({ weight: kgFromDisplay(v, units), reps: target.recommendedReps });
  };
  const setDialReps = (v: number) => session.editCurrentSet({ weight: target.recommendedWeight, reps: v });
  /* Where her count stands inside the band — the brand's own range mark becomes the readback:
     the moss dot rides from floor to ceiling with her reps (clamped; outside the band it waits at
     the end, and the figure's colour is not touched — the Logged beat owns verdicts). Physical
     `left` on a row Yoga mirrors under RTL, so the fraction flips with the layout. */
  const repsNow = target.recommendedReps;
  /*
   * ════ "פעם שעברה" LIVES ON THE TRACK ITSELF (founder, 2026-08-26 — third cut) ════
   * *"אולי אפשר להשתמש איכשהו גם במספר שבתוך הסרגל עצמו."* The ruler is a scale, and last time is
   * a point on it — so each dial carries a quiet moss point over the value she stood on last
   * session (`WheelPicker.marker`): under her own numeral when she matches it, off in the margin
   * when she has moved past it, out of the window when it is far. The ↑/↓ delta on the heading
   * still says the direction in words; the mark says WHERE, in the instrument's own language.
   * Suppressed on warm-up bridges — a half-weight step measured against last time is the exact
   * "looks broken" frame Rev 8 deleted (see `news` above). `lastTimeOn` filters approach sets, so
   * the reps index is working-set n against working-set n.
   */
  const isWarmupSet = !!session.setLabel?.warmup;
  const lastW = !isWarmupSet && lastTime?.loadKg != null ? displayWeight(lastTime.loadKg, units) : null;
  const lastR = !isWarmupSet && lastTime ? lastTime.reps[setN - 1] ?? null : null;
  /* The same suppression, one level up: the STRIP is the row of figures the markers annotate, so
     the two can never disagree about whether last time is being shown. An empty rep list is a
     history record with nothing in it — a row of nothing is worse than no row. */

  /*
   * ⛔ THE ROW OF FIGURES IS NOT ON THIS SCREEN, AND THE COMMENT SAID IT WAS.
   *
   * `const slots = setRow({…})` ran on every set and was rendered by nothing, under a block that
   * described it as live UI — *"her sets this session over last time's, read by POSITION so set 2
   * sits under set 2"*. A comparison against last time that the stage does not draw is worse than
   * no comment at all: it tells the next reader the feature exists, so nobody goes looking for it.
   * The rail carries her position and the hero carries the delta; there is no second row.
   */
  /*
   * ⛔ WHAT CHANGED ABOUT THIS BAR (founder 2026-08-04): *"we show how many reps were done, but not
   * how much weight was lifted last time."*
   *
   * A row of last time's reps with no load beside it invites the wrong conclusion — 8 at 32.5 kg is
   * not better than 7 at 34. The delta rides on the hero, where the thing being compared already is,
   * and it is ABSENT on every set where nothing moved, which is most of them.
   */
  /*
   * ⚠️ A WARM-UP BRIDGE CARRIES NO NEWS (2026-08-24). Its weight is half the working load BY
   * DESIGN — measured against last time it would print "↓ 30" on the hero, which is the exact
   * "looks broken" frame Rev 8 deleted the approach set over. The word above the name already
   * says what this step is; the delta belongs to the work.
   */
  const news = session.setLabel?.warmup
    ? null
    : loadNews({
        currentLoadKg: target.recommendedWeight,
        /* ⚠️ `?? []` — `loadsSoFar` is a required field so the app cannot omit it, but a render fixture
           built by hand always lags the newest one, and a crash on the set stage is unforgivable. Same
           reasoning as `setRow`'s optional `done`. */
        ...((session.loadsSoFar ?? []).length > 0
          ? { previousSetKg: (session.loadsSoFar ?? [])[(session.loadsSoFar ?? []).length - 1] }
          : {}),
        ...(lastTime && lastTime.loadKg != null ? { lastTimeKg: lastTime.loadKg } : {}),
      });
  /*
   * ⛔ `setsLabel` IS DELETED (2026-08-18), AND IT WAS NEVER RENDERED.
   *
   * It was `t('workout.setOfM', …)` under a note reading *"one sentence for VoiceOver, because a
   * row of bare digits announces as a row of bare digits"* — a good rule, describing a fix that was
   * computed and then dropped on the floor. **It had no reader**: not a `<Text>`, not an
   * `accessibilityLabel`, nothing. So the comment asserted an accessibility guarantee the screen
   * did not make, which is worse than not having made it, because it stops anyone looking.
   *
   * ⚠️ THE RULE IT NAMED IS REAL AND IS KEPT, one layer up: `LiftRail` is the row of bare digits in
   * question and it carries the sentence itself — `accessibilityRole="progressbar"` over "Lift 1 /
   * 6 · Set 2 of 4". One owner for the fact, and it is the thing that draws it.
   */
  /*
   * ════ ⛔ THE STAGE COMPOSES ITSELF WHEN A SET IS PRESENTED ════
   *
   * FOUNDER, 2026-08-12: *"אני עדיין לא חושב שהמסך שלנו ברמת APPLE או SPOTIFY … אתה יכול לקחת את
   * עצמך לקצה."*
   *
   * The screen was a poster. Four sets of a lift produced four pixel-identical frames, so nothing
   * on it ever acknowledged that a NEW SET had begun — the one event the whole screen exists for.
   *
   * `Arrive` is the product's own sequencing primitive (`ARRIVE_STAGGER`, one curve, reduced-motion
   * safe), already shipping across the intake. Three groups in reading order — who she is lifting,
   * what to do with it, what is behind her — 70 ms apart, 500 ms end to end.
   *
   * ⚠️ THIS IS NOT DECORATION, WHICH IS THE TEST EVERY MOTION IN THIS PRODUCT HAS TO PASS. It marks
   * a boundary that genuinely exists and that the screen previously hid: set 2 began. The rest beat
   * between sets already unmounts this body, so the arrival is the truth about what happened rather
   * than an effect played over a static thing.
   *
   * ⚠️ KEYED ON THE BEAT so it re-fires if the body is ever preserved across a set instead of
   * remounting — a silent one-arrival-per-lift would be worse than none, because the first set would
   * feel composed and the other three would not.
   *
   * ⛔ AND I CANNOT WATCH IT. The harness pane does not composite frames, so this ships on the
   * founder's eye, at his instruction — *"שים ואני אשפוט ואעדכן"* — after a sweep animation I argued
   * for without ever seeing it and he deleted on sight. `useNativeDriver: true` means a real device
   * runs it on the UI thread regardless of what JS is doing, which is the one part I can be sure of.
   */
  // A warm-up and a working set can share an ordinal (warm-up 1, then set 1) — the marker keeps
  // the arrival animation firing on the boundary between the ramp and the real work.

  const weight = displayWeight(target.recommendedWeight, units);
  const reason = target.reasonType; // 'increase' | 'hold' | 'decrease' | undefined
  const deltaMag = displayWeight(Math.abs(target.reasonDelta ?? 0), units) ?? 0;
  // Equipment-native setup: the headline snaps to a loadable weight (barbell / plate-loaded),
  // and the setup lines tell the athlete exactly how to load it (items 5 & 12).
  const setup = loadSetup(session.currentExerciseId, weight, units);
  // The equipment-native per-side / per-hand figure, inline beside the hero (mock 2.2).
  const annex = heroAnnex(setup, t, units);

  /*
   * ════ THE FIGURE SHE SETS ON THE EQUIPMENT, AND THE ONE THE RECORD KEEPS ════
   *
   * `equipmentLoad` is the founder's per-side ruling generalised over all six implements — see
   * `domain/loadPresentation` for why "per side" is the barbell's answer to a question every
   * implement answers, and why only the two loaded-by-hand styles change anything on screen.
   */
  const eq = equipmentLoad(setup);

  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ WHAT SHE DID LAST TIME — ON THIS SET, INSIDE THE FIELD (founder, 2026-08-31, free hand)
   * ════════════════════════════════════════════════════════════════════════════════════════════
   *
   * The one thing Hevy and Strong do better than we did, and it is worth naming precisely because
   * the rest of their screen is a spreadsheet we must not become. Their log is a table with a
   * PREVIOUS column, and the previous sits **in the row, beside the number you are about to type**.
   * Ours sat at the top of the screen, above the athlete, in the smallest type on the stage — so
   * the one comparison an athlete actually makes (am I above last week or below it?) was split
   * across the whole screen with a figure in the middle of it.
   *
   * ⚠️ SO THE ROW CAME DOWN AND THE FIGURES MOVED INTO THE FIELDS. `LastTimeStrip` is deleted:
   * everything it said about THIS set is now two lines under the two numbers it is about, in the
   * same units as them. What it said that a field cannot — the SHAPE across all four sets, whether
   * she faded — is a history question, and history has a screen. That is a real loss and it is the
   * one thing to put back if it is missed; the honest home for it is the session map, which is
   * already one tap away in the chrome.
   *
   * ⚠️ AND THE LOAD IS CONVERTED TWICE ON PURPOSE: `displayWeight` puts her kilos into HER units,
   * and `equipmentValue` then restates that as the number she hangs on one end. Skipping the first
   * would show a pound athlete a kilo figure; skipping the second would put the total back beside a
   * field headed "a side", which is the two-scales fault this whole pass exists to remove.
   */
  /*
   * ════ ⛔ LAST TIME, AS ONE STRIP OF HER SETS (founder, 2026-09-07) ════
   *
   * *"להוריד את האפשרויות של 8, 9, 10 חזרות בלחיצה אוטומטית ולהשאיר את האפשרות ללחוץ על המשקל או על
   * החזרות ולהקליד … אני רק רוצה שיהיה עיצוב יפה שיראה מה היה בפעם הקודמת."*
   *
   * The two fields each carried a "last time" line under their own figure — the same session split
   * in two, one number per field, matched by set position. Now it is ONE strip under the fields:
   * every set of her previous session on this lift, load × reps, in the order she did them, with
   * the set she is on now lit. What the split lines could not say — that she faded on set four, or
   * held — is exactly what a row of four cells says at a glance. `LastTimeStrip` was deleted on
   * 2026-08-31 for sitting at the TOP of the screen above the athlete; this stands under the
   * figures it is compared against, which is where the 08-31 note said the loss should be put back.
   *
   * ⚠️ THE LOAD IS THE EQUIPMENT'S OWN NUMBER, per set — `loads[i]` beside `reps[i]`, converted by
   * `equipmentValue` exactly as the field above it is, so a per-side field never sits over a total.
   * Absent on a warm-up bridge and on a lift she has never done: nothing is claimed about a set that
   * never happened.
   */
  const prevSetIdx = setN - 1;
  const lastSets =
    !isWarmupSet && lastTime
      ? lastTime.reps.map((reps, i) => ({
          reps,
          load: equipmentValue(session.currentExerciseId, displayWeight(lastTime.loads?.[i] ?? lastTime.loadKg ?? null, units), units),
        }))
      : [];
  const eqLabel =
    eq == null
      ? t('editResult.weight')
      : eq.style === 'dumbbell'
        ? t('load.perHand')
        : eq.style === 'selectorized' || eq.style === 'cable'
          ? t('load.pinLabel')
          : eq.style === 'fixed_barbell'
            ? t('editResult.weight')
            : t('load.aSide');

  /** What the pad is filling, as a number — or null while it says nothing yet. */
  const draftValue = draft === '' || draft === '.' ? null : Number(draft);

  /**
   * A key press, routed to whichever field is open.
   *
   * ⛔ THE WEIGHT WRITES THROUGH ON EVERY KEY and the reps do NOT. A half-typed weight is still a
   * weight (7 on the way to 7.5 is a load she could have used), so the total under it can track her
   * thumb and teach the arithmetic as she goes. A half-typed rep count is not a rep count — writing
   * `1` on the way to `12` would put a set of one into the engine for as long as her second finger
   * takes, and `Complete Set` is one mis-tap away the whole time.
   */
  const onPadKey = (k: string) => {
    /* A pristine draft is the value she arrived with, not something she typed — the first key
       REPLACES it. `del` is exempt: deleting a digit off the current value is a real edit. */
    const base = draftPristine && k !== 'del' ? '' : draft;
    if (draftPristine) setDraftPristine(false);
    const next =
      k === 'del'
        ? base.slice(0, -1)
        : k === '.'
          ? base.includes('.')
            ? base
            : `${base === '' ? '0' : base}.`
          : `${base}${k}`.replace(/^0(?=\d)/, '');
    if (next.length > 5) return; // 137.5 is the widest real load; nothing legitimate is longer
    setDraft(next);
    if (slot === 'weight') {
      const v = next === '' || next === '.' ? null : Number(next);
      const total = v == null ? null : totalFromEquipment(session.currentExerciseId, v, units);
      if (total != null) session.editCurrentSet({ weight: total, reps: repsNow });
    } else if (slot === 'reps') {
      setRepsTyped(next);
      const v = Number(next);
      if (next !== '' && Number.isFinite(v) && v > 0) session.editCurrentSet({ weight: target.recommendedWeight, reps: v });
    }
  };

  /** Open a field with the pad. The weight arrives pre-filled (it is a correction); reps do not. */
  const openField = (which: 'weight' | 'reps') => {
    const filled = which === 'weight' ? (eq ? String(eq.value) : '') : repsTyped;
    setDraft(filled);
    setDraftPristine(filled !== '');
    setSlot(which);
  };

  /*
   * ⛔ THE ACT WILL NOT LOG A SET WITH NO REP COUNT — it opens the field instead.
   *
   * A disabled button is the wrong shape here: it says "no" and leaves her to work out why, at a
   * bar, out of breath. Pressing the act when the count is missing does the obvious thing — it
   * takes her to the one thing still owed.
   */
  /*
   * ⛔ THE BAND CELLS ARE GONE (founder, 2026-09-07): *"להוריד את האפשרויות של 8, 9, 10 חזרות
   * בלחיצה אוטומטית ולהשאיר את האפשרות ללחוץ על המשקל או על החזרות ולהקליד."*
   *
   * They were built on 2026-08-31 as the tap-cost answer — the coach's own band laid out as three
   * one-press cells at the foot. He used them and does not want them: a row of counts under the
   * act is a second instrument for a number the field above already takes, and the field is the
   * one that says what she did rather than what was hoped. Both figures are typed now, and the
   * reps field carries the same pencil the load has carried since the third time he could not tell
   * it was pressable. The keypad's one seat is the athlete's slot, as before.
   */
  const repsEntered = repsTyped !== '' && Number(repsTyped) > 0;
  /* ⛔ THE ACT LOGS AS WRITTEN (founder, 2026-09-07 — superseding the 08-31 gate above). An
     untouched field is the prescription; the press is her word on it. The pad is for a deviation. */
  const onCompletePressed = () => {
    onComplete();
  };

  /*
   * ⛔ THE LOAD, AS A CAPTION ON THE ATHLETE — `34 ק״ג · 7 בכל צד`.
   *
   * Both facts, one line, in the muted ink: the total on the bar and how it is built. It is the
   * same pair the band prints as a 78-point numeral over a 17-point sub-line, and it says the same
   * thing at a size proportionate to how often it is news — which the founder's own measurement
   * puts at once per lift, not once per set.
   *
   * ⚠️ THE SPOKEN FORM KEEPS THE UNIT WORD SEPARATELY. `unitLabel` is already in the visible
   * string, but a screen reader gets the number and the unit as one phrase rather than as a figure
   * followed by an abbreviation it will spell out.
   */
  const loadSpoken = isBodyweight
    ? t('workout.bodyweight')
    : `${displayWeight(target.recommendedWeight, units)} ${unitLabel(units)}${annex ? ` · ${annex.value} ${annex.suffix}` : ''}`;

  /*
   * THE SWAP IS OFFERED BEFORE THE FIRST SET OF **EVERY** LIFT — not just the session's first.
   *
   * This used to read `exNo === 1 && setN === 1`, which was survivable only while the programme-edit
   * screen existed: a lift you wanted rid of on day 4 could be dealt with by planning. **S-73 deleted
   * that screen**, and the brief states the consequence — "the in-workout swap is now the athlete's
   * main exercise-selection lever… the stage is the ONLY place the swap verb is taught, so it must be
   * discoverable here." The old rule taught it once, on the first lift of the session, and then hid
   * it for the rest of the workout.
   *
   * It also made the two surfaces disagree about the same instant: the wrist offers a swap on the
   * first set of ANY lift (`buildMirrorSteps` gates on `exerciseSetIndex === 0`), so an athlete
   * standing at lift 4 saw the glyph on her watch and nothing on her phone. `startQuickSwap` was
   * never the thing restricted — it is fully general, and its own comment says both surfaces call it
   * "so the two surfaces can never disagree about what a legal swap is." They agreed on what; they
   * disagreed on when.
   *
   * The rule now lives in ONE place (`isSwapMoment`, beside the pool that decides what a legal swap
   * is) and both surfaces ask it — not "both happen to agree". The transition rest keeps its own
   * swap (the better moment — she has not walked to the station yet); this is the door for the
   * athlete who is already standing there.
   */
  return (
    <>
      {/* The chrome (pause · position · clock · swap · form) is rendered ONCE by SessionFlow, above
          every beat — see "THE CHROME NEVER LEAVES". This body starts under it. */}
      <View style={styles.stageBody}>
        {/*
          ════ A SUPERSET IS NAMED AT THE TOP, AND BOTH LIFTS STAND TOGETHER ════

          Founder, 2026-08-02, specifying it exactly: *"write SUPERSET at the top, underneath it the
          current exercise as it is now, and beneath that the NEXT exercise at the same size, in the
          grey the KG label uses."*

          It used to be one muted line under the set counter — "Straight into Cable Row" — which
          says the same fact in the place the eye goes last. Both lifts are the subject here, so
          both are set at the subject's size; the one she is not on yet is the quieter of the two.

          ⚠️ VERIFIED, not assumed: `restAfterS === 0` already skips the rest phase outright
          (`afterSetCompletion` — `restSeconds <= REST_SKIP_THRESHOLD_S` goes straight to the next
          SET_PRESENTED), so there is no timer between the two halves. And the coach reads them as
          ONE piece of work rather than two with no rest, because the sheet carries `block`, `round`
          and `position` — same block, same round, two positions.
        */}
        {/*
          ⚠️ WRAPPED SO THE STAGE HAS THREE GROUPS, NOT FIVE LOOSE CHILDREN. The muscle, the name and
          a superset's second lift are ONE thing — who she is lifting — and flex cannot know that
          while they are siblings of the hero. It matters because `stageBody` distributes its
          children now (see its style): unwrapped, the eyebrow would be spaced away from the name it
          belongs to.
        */}
        <Arrive key={`id-${beat}`} order={0} style={styles.identity}>
          {/* A warm-up bridge announces itself where the muscle usually stands — the one word that
              keeps a half-weight bar from ever reading as a broken prescription (Rev 8's whole
              complaint). The working sets get their muscle line back the moment the ramp is done. */}
          {/* ⛔ THE MUSCLE WORD IS GONE (founder, 2026-08-26 — the dial redesign): "חזה" over the
              lift's name was a fact she already knows standing at the bench, and the dials need
              the room more. The SLOT survives, because two announcements genuinely live here —
              the warm-up bridge's ("חימום 1 מתוך 1", Rev 8's whole complaint) and the superset's.
              A regular working set now opens straight with the lift's name. */}
          {session.setLabel?.warmup ? (
            <Legend size={20} track={0.28} align="center" style={styles.group}>
              {t('workout.warmupOfM', { n: setN, m: setM })}
            </Legend>
          ) : session.straightInto ? (
            <Legend size={20} track={0.28} align="center" style={styles.group}>{t('workout.superset')}</Legend>
          ) : null}
          {/* Sized from the name, never fitted — see `nameSize.ts` for the frame that shrank it to
              nothing (founder 2026-09-08). Two lines are allowed; the size already guarantees the
              name fits them, so nothing here is ever clipped or shrunk. */}
          <Text style={[styles.exName, exerciseNameSize(exName)]} numberOfLines={2}>{exName}</Text>
          {session.straightInto ? (
            <Text style={[styles.supersetNext, exerciseNameSize(session.straightInto)]} numberOfLines={2}>
              {session.straightInto}
            </Text>
          ) : null}
          {/*
            ════ ⛔ THE COACH'S LINE ABOUT THIS LIFT, WHICH THIS SCREEN HAS NEVER DRAWN ════

            Found by reading the wire against the screens (2026-08-26). A `reps` item carries `say`
            exactly as a hold or a run does — the parser keeps it, `buildPlan` puts the whole item on
            the step, and `session.currentItem` hands it to this stage — and the stage's very first
            line throws it away: `currentItem.kind !== 'reps' ? currentItem : null`. So the sentence
            the coach wrote about the lift she is standing in front of reached the device on every
            set and was drawn nowhere.

            ⚠️ IT HAD A SURFACE ONCE AND LOST IT SILENTLY. It sat behind the KEY POINTS control until
            that control was deleted with `EmphasesSheet` (founder, 2026-08-12), and the store's own
            note recorded the casualty at the time — *"what no longer has a surface is the `say` on
            an ordinary LIFT"* — as a line in a comment rather than as a thing to fix. The coach
            prompt still tells the coach where this lands, so the app was quietly failing a promise
            it was still making.

            ⚠️ CAPPED AT TWO LINES HERE AND NOWHERE ELSE. The item stages have a screen to spare;
            this one carries two 164-point dials and a row of last time's figures under it. The
            prompt bounds `say` to ONE line ("one line about HOW HARD, HOW FAST, or WHERE TO STOP"),
            so two is headroom, not truncation.
          */}
          <SayLine say={session.currentItem?.say} lines={2} />

        </Arrive>

        {/*
          ════════════════════════════════════════════════════════════════════════════════════════
          ⛔ THE PRESCRIPTION IS TWO EQUAL FIGURES — REDESIGNED 2026-08-12, ON HIS APPROVAL
          ════════════════════════════════════════════════════════════════════════════════════════

          FOUNDER: *"עכשיו יש לי כאוס של מלל ומספרים במרכז … ואני מאשר את השינוי שהצעת. רק שהכל
          יהיה ברור כי זה חדר כושר ושהכל ירגיש נכון ומדויק."*

          What stood here was a 118-point load with three different things stacked under it at three
          different sizes, weights and inks — the band, the per-side line, and (for an hour) a
          control. Four objects reading as one pile.

          **A barbell prescription is one sentence with two numbers in it: fifty kilos, six to eight
          times.** So it is drawn as two peers on one rule, each with its own label, and nothing else
          in the block. The load keeps the larger share of attention through POSITION and through the
          figure it carries, not by being three times the size of the thing she is counting toward.

          ⚠️ THE 118 IS GONE AND THAT IS THE POINT OF THE CHANGE. It made the load the screen and the
          rep target a footnote — and in a hypertrophy app the band is half the instruction. Sixty-four
          points of tabular mono is read across a gym; the founder's own type floor argument applies
          here at the other end.

          ⚠️ AND EVERY FIGURE IS LABELLED, because it is a gym: KG under the load, REPS under the
          band, "A SIDE" on the loading line. Nothing on this screen is a number she has to identify.
        */}
        {/*
          ════════════════════════════════════════════════════════════════════════════════════════
          ⛔ THREE BANDS, EACH WITH ITS OWN HEADING AND ITS OWN SPACE
          ════════════════════════════════════════════════════════════════════════════════════════

          FOUNDER, 2026-08-12: *"אפשר להרים את שם התרגיל לראש המסך … ואז אפשר לתת כותרת מעל המשקל
          וכותרת מעל החזרות ולמה יותר איזה סט זה מתוך כמה. אני רוצה לנצל את כל השטח ולתת לכל מרכיב
          את השטח שלו."*

          The lift's name moves to the top — there were **220 dead points** between the rail and
          "CHEST" — and the three facts underneath become three BANDS, each opened by a rule and
          named by a heading above its figure.

          ⚠️ THE HEADING REPLACES THE INLINE LABEL, it does not join it. "WEIGHT" over "34 kg" and
          "KG" beside it would be the same word twice; the unit stays on the figure because it is
          part of the number, and the heading names the band.

          ⚠️ AND SET IS DELIBERATELY THE SMALL ONE. It gets a band and a heading like the others —
          he asked for it — but its figure is 46 to their 92. **The first two are instructions; this
          is orientation**, and a screen where everything is the largest thing has no hierarchy at
          all. In a gym that is the difference between reading and searching.
        */}
        {/*
          ⛔ NOT GROUPED (founder 2026-08-12): *"אבל למה שוב הדבקת אותם והותרת חלל ריק? עכשיו רק תן
          לכל אחד את הספייס שלו."*

          I wrapped the two cards in one container to stop `space-between` parting them by 88 points
          — and that turned three children into two, so the distribution pushed the PAIR to the foot
          and left three hundred points of nothing above it. **The gap I was afraid of was the
          spacing working.**

          Three children, three shares: the lift's name, the load, the reps. Each gets its own space,
          which is what he asked for the first time.
        */}
        <Arrive key={`load-${beat}`} order={1} style={styles.bandArrive}>
         {slot === 'athlete' ? (
          /*
            ⛔ THE ATHLETE IS THE HERO OF THIS STAGE (founder, 2026-08-31) — see `StageAthlete` for
            why the pose is driven by `setRunningLong` and never by a rep count.

            ⚠️ AND SHE IS THE DOOR TO THE TECHNIQUE SHEET, which is where the chrome's form disc
            went. Tapping the demonstration to see the demonstration bigger needs no label; a disc
            in the top corner for the same act, on a screen that is now mostly the clip, is the
            control the founder asked to delete.
          */
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('workout.form')}
            onPress={onDemo}
            disabled={!onDemo}
            style={styles.athleteSlot}
          >
            <StageAthlete exerciseId={session.currentExerciseId} />
            {/* ⛔ A DOOR WEARS A HANDLE (design review 2026-09-01). The figure opens the technique
                sheet and nothing said so — the product's best surface was also its best-hidden
                control. One quiet glyph in the slot's corner: present when the door is, gone when
                a beat has no film. */}
            {onDemo ? (
              <View style={styles.demoHint} pointerEvents="none">
                <Icon name="playCircle" size={18} color={stage.ink2} strokeWidth={1.8} />
              </View>
            ) : null}
          </Pressable>
         ) : (
          /*
            ⛔ ONE SLOT, AND THE PAD STANDS EXACTLY WHERE SHE DOES. The athlete's box is 259 points
            and four rows of 58 with 6 between them is 250 — so opening a field moves NOTHING else
            on the stage. That is the property that makes "reveal a control" survivable in a gym:
            the box was already reserved, and the screen does not jump under a thumb.
          */
          <View style={styles.athleteSlot}>
            <NumberPad onKey={onPadKey} decimal={slot === 'weight'} />
          </View>
         )}
        </Arrive>

        {/*
          ════════════════════════════════════════════════════════════════════════════════════════
          ⛔ THE TWO FIELDS — WHAT GOES ON THE BAR, AND WHAT SHE ACTUALLY DID
          ════════════════════════════════════════════════════════════════════════════════════════

          FOUNDER, 2026-08-31: *"בחלק של מילוי המשקל והחזרות תופיע ההמלצה של המנוע במשקל וכמובן
          המשתמש לא חייב לבצע, ובחזרות להשאיר ריק."* — and, on the load itself: *"הרבה הרבה יותר
          נוח באמצע האימון לדעת כמה משקל לשים בכל צד מאשר המשקל הכולל."*

          Three decisions, and they resolve into one sentence: **the screen states what she does to
          the equipment, and waits for what she did.**

          ⛔ THE LOAD IS THE EQUIPMENT'S OWN NUMBER, not the total. Per side on a bar, per hand on a
          dumbbell, the pin on a stack — see `domain/loadPresentation.equipmentLoad`. The total is
          under it, quiet, because the record keeps it and a chart will want it; but nothing in a
          gym is ever done with it.

          ⛔ THE REP COUNT IS EMPTY. The rule is above at `repsTyped`, and it is the strongest fix
          this screen has for the lost set that started the redesign: a screen with an empty field
          cannot look finished.
        */}
        <Arrive key={`rx-${beat}`} order={2} style={styles.rxRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${eqLabel} · ${loadSpoken}`}
            onPress={() => openField('weight')}
            style={[styles.rxCell, slot === 'weight' && styles.rxCellOpen]}
          >
            {/*
              ⛔ THE PENCIL, BECAUSE THE WELL WAS NOT ENOUGH (founder, 2026-08-31, third time):
              *"ומה קורה במידה וכן רוצים לשנות משקל? ממה שאני רואה כאן מופיע רק האפשרות לשינוי
              חזרות."*

              The load HAS been changeable the whole time — the cell opens the keypad — and he could
              not tell, for the third time in one day: first as a muted caption, then as a big
              figure, now as a figure inside a well. **A surface that is pressable does not announce
              itself by being pretty.** The counts at the foot read as controls because they are cells
              in a row of cells; a single figure has nothing to be compared against.

              ⚠️ AND IT IS THE SAME GLYPH THE COUNT ROW ALREADY USES for the same act, on the same
              screen — so it is learned once and means one thing: **this number is typed.** The reps
              do not carry it here because their answers are the row at the foot, which carries it
              already. Every number on this screen has exactly one obvious way in.
            */}
            <View style={styles.rxHeadRow}>
              <Legend size={17} track={0.24} align="center" style={styles.rxHead}>{eqLabel}</Legend>
              <Icon name="pencil" size={14} color={stage.ink2} strokeWidth={2} />
            </View>
            <View style={styles.rxFigureRow}>
              {isBodyweight ? (
                <Text style={styles.rxWordSm} numberOfLines={1}>{t('workout.bodyweight')}</Text>
              ) : (
                <Text
                  style={[styles.rxFigure, rxType(String(slot === 'weight' ? draft || '0' : eq?.value ?? ''))]}
                  numberOfLines={1}
                >
                  {slot === 'weight' ? draft || '0' : (eq?.value ?? '')}
                </Text>
              )}
              {news && slot !== 'weight' ? (
                <Text style={[styles.rxFigureDelta, { color: directionTone(news.direction) }]} numberOfLines={1}>
                  {`${news.direction === 'up' ? '↑' : '↓'}${displayWeight(news.deltaKg, units)}`}
                </Text>
              ) : null}
            </View>
            {/* ⛔ THE MONO WRAPS FIGURES AND NEVER WORDS (`monoCarriesNoWords`): the unit, the total
                word and the per-side suffix are all Hebrew, and IBM Plex Mono has no Hebrew. Value
                and words are split, exactly as the rest card's `upSide` splits them. */}
            <Text style={styles.rxSub} numberOfLines={1}>
              {isBodyweight ? (
                ''
              ) : eq?.total != null ? (
                <>
                  {`${t('load.totalWord')} `}
                  <Text style={styles.rxSubFig}>
                    {slot === 'weight' && draftValue != null
                      ? totalFromEquipment(session.currentExerciseId, draftValue, units)
                      : eq.total}
                  </Text>
                  {` ${unitLabel(units)}`}
                </>
              ) : (
                unitLabel(units)
              )}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('workout.repsUnit')} · ${repsEntered ? repsTyped : `${target.recommendedReps} · ${t('workout.asWritten')}`}`}
            onPress={() => openField('reps')}
            style={[styles.rxCell, slot === 'reps' && styles.rxCellOpen]}
          >
            <View style={styles.rxHeadRow}>
              <Legend size={17} track={0.24} align="center" style={styles.rxHead}>{t('workout.repsUnit')}</Legend>
              <Icon name="pencil" size={14} color={stage.ink2} strokeWidth={2} />
            </View>
            <View style={styles.rxFigureRow}>
              {/*
                ⛔ THE FIELD OPENS FULL (founder, 2026-09-07 — superseding the em-dash rule). The
                prescription stands in the MUTED ink until she types: it is what the set will be
                logged as if she says nothing, and the muting is the one honest signal that it is
                the plan's number and not yet hers. The record keeps that distinction too
                (`presumed`, `domain/setEvidence`), so a greyed 8 is no longer the app answering for
                her — it is the app saying what it will presume.
              */}
              <Text
                style={[
                  styles.rxFigure,
                  rxType(slot === 'reps' ? draft || '—' : repsEntered ? repsTyped : String(target.recommendedReps)),
                  !repsEntered && slot !== 'reps' && styles.rxFigureEmpty,
                ]}
                numberOfLines={1}
              >
                {slot === 'reps' ? draft || '—' : repsEntered ? repsTyped : String(target.recommendedReps)}
              </Text>
            </View>
            {/* The band under the count — the instruction the count is aimed at. A collapsed band
                (a fixed rep count) says nothing rather than "8–8". */}
            <Text style={styles.rxSub} numberOfLines={1}>{bandLo === bandHi ? '' : `${bandLo}–${bandHi}`}</Text>
          </Pressable>
        </Arrive>

        {/* Her previous session on this lift, set by set — see the note at `lastSets`. */}
        {lastSets.length > 0 ? (
          <Arrive key={`last-${beat}`} order={3} style={styles.lastRow}>
            <Legend size={17} track={0.2} style={styles.lastLegend}>{t('workout.prevShort')}</Legend>
            <View style={styles.lastCells}>
              {lastSets.map((s, i) => {
                const now = i === prevSetIdx;
                return (
                  <View
                    key={i}
                    style={[styles.lastCell, now && styles.lastCellNow]}
                    accessible
                    accessibilityLabel={`${t('workout.setOfM', { n: i + 1, m: lastSets.length })} · ${s.load != null ? `${s.load} ${unitLabel(units)} × ` : ''}${s.reps} ${t('workout.repsUnit')}`}
                  >
                    {s.load != null ? (
                      <Text style={[styles.lastFig, now && styles.lastFigNow]} numberOfLines={1}>{`${s.load}×${s.reps}`}</Text>
                    ) : (
                      <Text style={[styles.lastFig, now && styles.lastFigNow]} numberOfLines={1}>{String(s.reps)}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </Arrive>
        ) : null}

        {/* ⛔ THE ENGINE'S NUMBER SURVIVES HER TYPO (design review 2026-09-01). One keystroke into
            the weight field and the prescription was gone — no undo, no way back but remembering
            it. While the pad has moved the load off the prescription, one quiet line offers the
            planned number back. It never argues; it restores, and hands the stage back. */}
        {slot === 'weight' &&
        !isBodyweight &&
        plannedWeightRef.current != null &&
        target.recommendedWeight !== plannedWeightRef.current ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('workout.backToPlanned', { w: displayWeight(plannedWeightRef.current, units) ?? '' })}
            onPress={() => {
              session.editCurrentSet({ weight: plannedWeightRef.current as number, reps: repsNow });
              setSlot('athlete');
              setDraft('');
              setDraftPristine(false);
            }}
            style={styles.restoreRow}
            hitSlop={8}
          >
            <Text style={styles.restoreText}>{t('workout.backToPlanned', { w: displayWeight(plannedWeightRef.current, units) ?? '' })}</Text>
          </Pressable>
        ) : null}

        {/*
          ════ ⛔ THE SET BAND WENT UP INTO THE RAIL (founder 2026-08-12) ════

          *"הדבר היחיד שמפריע לי עדיין הוא שה-SET תקוע שם למטה ובאיזשהו מקום דווקא מפריע … אולי אפשר
          לעשות את זה יחד עם הקו שהחליף את ה-LIFT? לעשות איחוד ביניהם."*

          He is right and the reason is that they are the same KIND of fact. "Lift 1 of 6" and "set 2
          of 4" are both *where am I*, one nested inside the other — and one of them was a rail at the
          top of the screen while the other was a 40-point figure at the bottom, squeezed against the
          act. Two answers to one question, in two languages, at opposite ends.

          They are two rows of one instrument now (`LiftRail`): the session above, this lift below.
          **And the whole bottom third of the stage came free**, which is what pays for the cards.
        */}

        {/*
          ⛔ AND THE "LAST TIME · 57.5 KG" LINE IS DELETED (founder 2026-08-04).

          The hero carries the comparison now — `↑1.5`, in the direction's colour — and printing the
          absolute weight underneath states the same fact a second time in a form she has to do
          arithmetic on. Two statements of one thing is exactly the excess this screen has been
          losing all week.

          ⚠️ The evidence did not go with it: the reps are the row's ghosts and the load is the
          delta. Nothing that was reachable is now behind a tap.
        */}
      </View>

      {/* `pointerEvents` stops the finger; it does NOT stop VoiceOver, which would happily focus and
          fire an invisible Complete Set. A control that is not on screen is not on screen for
          anybody — so the footer leaves the accessibility tree too while it is stood down. */}
      <View
        style={[styles.stageFooter, notice && styles.footerStoodDown]}
        pointerEvents={notice ? 'none' : 'auto'}
        accessibilityElementsHidden={notice}
        importantForAccessibility={notice ? 'no-hide-descendants' : 'auto'}
      >
        {/*
          ════ ⛔ THE ACTIONS LIVE TOGETHER, AT THE FOOT ════

          FOUNDER, 2026-08-12: *"עכשיו יש לי כאוס של מלל ומספרים במרכז. למה לא לשים את זה כפקד
          מתחת ל-COMPLETE SET?"*

          The edit chip was floating in the middle of the figures — a control standing inside the
          data, which is what made that block read as four unrelated things stacked. **A control
          belongs in the action zone.** The middle of this screen is now only what she reads; the
          foot is only what she presses.

          ⚠️ AND THE OLD NOTE HERE WAS ALREADY STALE: it said *"the edit door is the dashed pill on
          the number itself"*. That pill has been gone for weeks (a caliper replaced it, and the
          caliper is gone too). A comment that describes a control the screen no longer draws is how
          five different marks came to be tried for one job — see the note above the figures.
        */}
        {/*
          ⛔ AND THE "עריכת סט" GHOST IS GONE (founder, 2026-08-26 — the live-set redesign, note at
          the nudgers). Its whole job was to be the door to correcting the numbers; the numbers are
          the controls now, so a second full-width button under the act was a door into a room she
          is already standing in. The editor itself survives — both figures still open it for the
          far jumps a detent cannot make — and the foot returns to ONE act, which is what this
          screen's own "the foot is only what she presses" rule always wanted.
        */}

        {/* WHOSE TURN IT IS, and where her partner is — §11.2, and nothing at all when she is
            training alone. It sits directly above the act because the act is the hand-off. */}
        <PairStrip />
        {/* The ask sits ABOVE the act it is about — see `SetRunningLong`. Above, because the answer
            to "this is running long" is the button underneath it, and a question printed below its
            own answer reads as a footnote. */}
        <SetRunningLong />
        {/* Pressed "Complete set" with no count — the pad is open and this says why (never both
            lines at once: the running-long ask is about a set she has not logged, and answering
            the button supersedes it). */}
        {slot !== 'athlete' && (draft === '' || draft === '.') ? (
          /* ⛔ AN EMPTY FIELD SAYS SO (founder 2026-09-07): *"ניסיתי להזין משקל או חזרות מבלי לכתוב
             מספר וזה לא נתן … לפחות שיהיה כתוב שאי אפשר להזין נתון ריק."* The pad is open and the
             field holds nothing — the stage refused it silently. Same voice and seat as the
             running-long ask; it clears itself the moment a digit lands. */
          <Text style={styles.runningLong} accessibilityLiveRegion="polite">
            {t('workout.emptyEntry')}
          </Text>
        ) : null}

        <Button
          variant="onstage"
          size="stage"
          block
          /*
           * ⛔ THE BUTTON NEVER STOPS BEING THE LOG BUTTON, WHATEVER THE PAIR THINKS.
           *
           * It was tempting to disable it while the bar is her partner's — it would make the turn
           * feel authoritative. It would also put the app between an athlete and a set she has just
           * performed, which is the one thing this screen may never do. Two people at one bench are
           * not in lockstep: he steps away, she does a set, the world is fine. So the pair CHANGES
           * THE WORDING and never the permission, and an out-of-turn log simply moves the turn —
           * which is what a state-carrying wire makes safe (`domain/sharedSession`).
           */
          label={passingTheBar ? (partnerName ? t('pair.logAndPass', { name: partnerName }) : t('pair.logAndPassAnon')) : t('workout.completeSet')}
          onPress={onCompletePressed}
          leading={<Icon name="check" size={18} color={stage[0]} strokeWidth={2.4} />}
        />
        {/* The offer, on the first set of a compound and nowhere else — see `WarmupOffer`. It is
            here as well as on the crossing because the day's FIRST lift has no crossing before it,
            and the day's first compound is the one the bridge was argued for.
            ⚠️ INSIDE THE BAND — the fixed slot that keeps the act above it from moving when the
            offer appears or goes (see `footerBand`). */}
        <View style={styles.footerBand}>
          <WarmupOffer />
        </View>
      </View>
    </>
  );
}

/* ----------------------------------------------------------------- Logged beat */
/** EXPORTED for the v7 gallery (2.3): it takes only props, so the harness can hold the beat still
 *  instead of racing the timers that drive it inside a live session. */
export function Logged({
  units,
  confirm,
}: {
  units: 'kg' | 'lb';
  confirm: Confirm;
}) {
  const { t } = useCopy();
  const w = displayWeight(confirm.weight, units);
  /*
   * ════ ⛔ THE CAPTURE IS THE WHOLE BEAT (founder, 2026-08-26) ════
   *
   * *"לבטל את כל החלק הזה של אם הוא נפל בפנים או מחוץ לטווח… במקום זה לעשות מסך של LOGGED שיראה
   * סופר איכותי ומדהים… כולל רטטים כולל כל החוויה."*
   *
   * The band-verdict beat (where the dot landed, the eased/raised reveal — and with it the
   * 2-corrections-per-lift budget, S-13) is DELETED with the
   * in-session corrections it narrated: during the workout she is a logger, and a logger's moment
   * of glory is the RECORD ITSELF. So the beat is her set, said at full stage size — the reps she
   * actually did (the dials made that number honest at last — see the old BandMark note that
   * predicted exactly this) with the weight beside it, under a small moss strike that says
   * "written". The verdicts moved to where the coach now lives: after the session, in the
   * decisions door, each with its reason.
   *
   * Three states remain: a RECORD crowns the capture (the one loud earned thing), the LAST set of
   * a lift closes it (`ExerciseDone`), and every other working set gets this capture. A warm-up
   * bridge still logs in silence (`beatSpeaksFor`).
   */
  /*
   * ══════ ⛔ THE CROWN WAS THE QUIETEST THING ON THE SCREEN IT CROWNS (2026-08-27) ══════
   *
   * The note above calls a record *"the one loud earned thing"*. Measured on `2.3e`: the word was 20
   * points and its figure 24, standing over a capture figure of **66**. The biggest moment the
   * product has was announced at a third of the size of the routine receipt underneath it.
   *
   * ⚠️ AND IT SAID THE NUMBER TWICE. `recordFig` drew `${w} ${unit}` — `w` is
   * `displayWeight(confirm.weight, units)`, the SAME value `LoggedCapture` is handed on the next
   * line. Not a coincidence to be defended: identical by construction, always. So the screen spent
   * its celebration restating, in small type, a number it was about to say at 66.
   *
   * The crown names what happened and lets the capture say the number — once, big. `שיא אישי` at 28
   * in moss over a ring that has just closed in moss reads as the headline it is, and the figure
   * below it stops being a repetition and becomes the evidence.
   */
  const recordLine = confirm.record ? (
    <View style={styles.recordRow}>
      <Legend tone="accent" size={28} track={0.24} align="center">{t('workout.recordStruck')}</Legend>
    </View>
  ) : null;
  // 2.3b — THE LAST SET OF A LIFT IS NOT AN ORDINARY LOG. Finishing a lift is a thing that
  // happened; finishing a set is a thing that keeps happening.
  if (closesTheLift(confirm)) {
    return (
      <View style={styles.loggedRoot}>
        {recordLine}
        <ExerciseDone confirm={confirm} />
      </View>
    );
  }
  return (
    <View style={styles.loggedRoot}>
      {recordLine}
      <LoggedCapture units={units} confirm={confirm} w={w} />
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE LIFT'S RING — THE BEAT, REDESIGNED TO THE EDGE (founder, 2026-08-26)
 *
 *   *"אני רוצה שתעצב את מסך ה-LOGGED של כל סט בצורה הרבה יותר מרשימה ומדויקת. יש לך את כל המסך
 *   תשתמש בזה… אולי אתה יכול לעשות עיגול שמשלים את עצמו וכשהוא מגיע לסט האחרון לעשות אנימציה יפה
 *   של התרגיל הושלם. כלומר כל סט ממלא קצת את העיגול עם הוי."*
 *
 * The capture beat was correct and it was SMALL: a 46-point moss disc, a legend and a figure, in
 * the middle of a 393×852 stage with nothing else on it. It stated the fact and drew nothing.
 *
 * ── WHAT THE RING IS, AND WHY IT IS THE RIGHT INSTRUMENT ────────────────────────────────────────
 * One arc per set, parted by air, filling in order. It answers the two questions the beat is asked
 * — *is my set in?* and *how much of this lift is left?* — with ONE shape rather than a mark and a
 * counter, and the second answer is the one no previous version of this screen gave at all.
 *
 * ⚠️ IT IS ALSO A PROMISE THE LAST SET COLLECTS. Every set fills a little more of the same circle,
 * so the lift-done beat is not a different screen wearing a different graphic — it is THIS one,
 * closed, with a moss bloom running out of it. The founder asked for exactly that continuity, and
 * it is the whole reason the pip row it replaces had to go: a row that appears only at the end
 * cannot be the completion of anything the athlete watched.
 *
 * ── HOW THE ARC IS DRAWN (the one bit worth writing down) ───────────────────────────────────────
 * Each segment is a full circle with the dash pattern `[L, C]` — one dash of the segment's length,
 * then a gap longer than the whole path, so exactly one arc can ever appear. `strokeDashoffset`
 * places it: at `-start` the dash begins at the segment's start angle; at `L - start` the pattern
 * has slid on by a whole dash and the arc is empty. So the fill is ONE animated number sliding
 * `L - start → -start`, which is a plain scalar the UI thread can carry — no animated arrays, no
 * per-frame path rebuild.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const BEAT_EASE = Easing.bezier(...motion.easeStandard);

/** The ring's outer diameter. ⚠️ `theBeatIsNotAFootnote` reads this literal: the beat's subject may
 *  never shrink back into a caption, and this is the number that says it is not one. */
/** Air between the heading and the news chip in the band's corner — see the note at `headRow`. */
const NEWS_CLEAR = 12;

/** The rest card's loading line. Named because `legendVoice` needs it before the stylesheet does. */
const UP_SIDE_SIZE = 17;

const RING_D = 236;
const RING_STROKE = 14;
/**
 * The air between two sets, in degrees.
 *
 * ⛔ 7 → 13, MEASURED ON GLASS (2026-08-26, first eye-pass). Seven degrees of a 697-point
 * circumference is 13.6 points of gap — and `strokeLinecap="round"` adds HALF THE STROKE to each
 * end of every dash, which is 7 points a side, 14 in total. **The caps ate the entire gap**: four
 * sets drew as one continuous arc, and the instrument whose whole job is to be countable could not
 * be counted. The declared gap has to pay for the caps before it buys any air.
 *
 * ⚠️ IT IS DECLARED, NOT DERIVED, ON PURPOSE. Writing `gap = caps + 10` would tie the design to the
 * stroke width in a way the next person changing the stroke would not see. 13° is the number that
 * leaves ~11 points of black between two arcs at every set count the coach can write (1–8), and the
 * eight-set case is the tight one — it is on the gallery at `2.3i` for exactly that reason.
 */
const RING_GAP_DEG = 13;

/** The tick, in its own 64-box, drawn rather than placed — `M` … `L` … `L`, length ≈ 55.2. */
const CHECK_PATH = 'M13 33 L26 46 L51 18';
const CHECK_LEN = 56;

/**
 * The sets she has NOT done yet — a groove, and it has to be a visible one.
 *
 * ⛔ 0.13 → 0.20 (2026-08-26, same eye-pass). At 0.13 on absolute black the unspent half of the
 * ring was a shadow: the beat read as a lone moss arc floating in space rather than as a circle
 * being filled, which is the whole idea the founder asked for (*"עיגול שמשלים את עצמו"*). **A
 * progress ring whose track cannot be seen is not showing progress, it is showing an amount.** The
 * `RestRing`'s own track is a 0.12 veil, and it gets away with it because it starts FULL and drains
 * — there is never a frame where the track is most of the ring.
 */
const RING_TRACK = 'rgba(241,238,229,0.20)';

/* ── THE BEAT'S CLOCK, ON THE PRODUCT'S OWN SCALE (`nothingMovesForeverWithoutAsking`) ─────────
   Every figure below is a `motion.dur` rung, and everything that follows one is DERIVED from it
   rather than typed a second time — the "one moment, two literals" defect the token scale was
   written to end. Read down: the arc waits a frame, sweeps; the tick starts inside that sweep and
   finishes first, so the ring closes ON a tick that is already there. */
const ARC_IN = motion.dur.instant;      // the beat of stillness before anything moves
const ARC_SWEEP = motion.dur[5];        // the set filling its share of the circle
const CHECK_IN = motion.dur[2];         // the tick begins under the arc, not after it
const CHECK_DRAW = motion.dur[4];

/**
 * ONE SET'S WORTH OF RING. `n` of `m` are filled; the `n`-th sweeps in under the fingers.
 *
 * ⚠️ REDUCED MOTION IS NOT A FASTER SWEEP — IT IS NONE (the `Arrive` contract). The ring is drawn
 * complete on the first frame, because the FACT is the fill, not the filling: an athlete who asked
 * the OS to stop moving things must still be able to see that her set went in.
 */
function SetRing({ n, m, done }: { n: number; m: number; done?: boolean }) {
  const reduced = useReducedMotion();
  const r = (RING_D - RING_STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const sets = Math.max(1, m);
  const pitch = circ / sets;
  /* A single-set lift has no neighbour to be parted from, so it keeps the whole circle. */
  const gap = sets > 1 ? (RING_GAP_DEG / 360) * circ : 0;
  const arc = Math.max(6, pitch - gap);
  const startOf = (i: number) => i * pitch + gap / 2;
  const live = Math.min(Math.max(1, n), sets) - 1; // the arc this beat is filling
  const liveStart = startOf(live);

  const grow = useSharedValue(arc);
  const halo = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      grow.value = 0;
      halo.value = 0;
      return;
    }
    grow.value = arc;
    grow.value = withDelay(ARC_IN, withTiming(0, { duration: ARC_SWEEP, easing: BEAT_EASE }));
    /* The bloom belongs to the LIFT closing, not to a set landing — it leaves the ring at exactly
       the frame the last arc lands (`ARC_IN + ARC_SWEEP`, derived rather than typed), so the two
       read as one gesture rather than two animations that happen to overlap. */
    halo.value = 0;
    if (done) halo.value = withDelay(ARC_IN + ARC_SWEEP, withTiming(1, { duration: motion.dur.bloom, easing: BEAT_EASE }));
  }, [arc, done, reduced, grow, halo]);

  const liveArc = useAnimatedProps(() => ({ strokeDashoffset: grow.value - liveStart }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: (1 - halo.value) * 0.55,
    transform: [{ scale: 1 + halo.value * 0.3 }],
  }));

  return (
    <View style={styles.capRing}>
      {/* The bloom — a moss outline of the ring itself, running outward and dissolving. It is drawn
          UNDER the ring so it reads as light leaving the instrument, never as a second object. */}
      {done ? <Animated.View style={[styles.capHalo, haloStyle]} pointerEvents="none" /> : null}
      <Svg width={RING_D} height={RING_D}>
        {/* -90° so set 1 begins at twelve o'clock, where a dial is read from. */}
        <G rotation={-90} origin={`${RING_D / 2}, ${RING_D / 2}`}>
          {Array.from({ length: sets }).map((_, i) => (
            <Circle
              key={`t${i}`}
              cx={RING_D / 2}
              cy={RING_D / 2}
              r={r}
              stroke={i < live ? up.stage : RING_TRACK}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={[arc, circ]}
              strokeDashoffset={-startOf(i)}
              fill="none"
            />
          ))}
          <AnimatedCircle
            cx={RING_D / 2}
            cy={RING_D / 2}
            r={r}
            stroke={up.stage}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={[arc, circ]}
            animatedProps={liveArc}
            fill="none"
          />
        </G>
      </Svg>
      <View style={styles.capRingCore} pointerEvents="none">
        <View style={styles.capDisc}>
          <CheckDraw size={done ? 84 : 68} />
        </View>
      </View>
    </View>
  );
}

/** The tick, drawn stroke-first — the same reveal the ring uses, one size down, a beat behind it. */
function CheckDraw({ size }: { size: number }) {
  const reduced = useReducedMotion();
  const on = useSharedValue(reduced ? 0 : CHECK_LEN);
  useEffect(() => {
    if (reduced) {
      on.value = 0;
      return;
    }
    on.value = CHECK_LEN;
    on.value = withDelay(CHECK_IN, withTiming(0, { duration: CHECK_DRAW, easing: BEAT_EASE }));
  }, [reduced, on]);
  const draw = useAnimatedProps(() => ({ strokeDashoffset: on.value }));
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <AnimatedPath
        d={CHECK_PATH}
        stroke={up.stage}
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={[CHECK_LEN, CHECK_LEN]}
        animatedProps={draw}
      />
    </Svg>
  );
}

/** The capture itself — the set, written, inside the lift it belongs to. Composed with the
 *  product's own Arrive; the second, softer pulse under the fingers is the "it is in the book" of
 *  the experience the founder asked for (the first, crisper one fired at the press —
 *  `haptics.setLogged`). */
function LoggedCapture({ units, confirm, w }: { units: 'kg' | 'lb'; confirm: Confirm; w: number | null }) {
  const { t } = useCopy();
  useEffect(() => {
    haptics.success();
  }, []);
  return (
    <View style={styles.capWrap}>
      <Arrive order={0} style={styles.capBlock}>
        {/* No `done` — an ordinary set is not a lift closing, and the ring says so by NOT blooming.
            (`done={false}` would be a prop pinned to a literal: `nothingIsBuiltForNobody`.) */}
        <SetRing n={confirm.n} m={confirm.m} />
      </Arrive>
      <Arrive order={1}>
        {/* HER SET, at the stage's own size — reps she did, weight she did it with. The old
            BandMark note said the rep count belongs here "when the logging path is fixed";
            the dials fixed it, and here it is. */}
        {/*
          ⚠️ ONE LINE, ALWAYS — AND IT WAS NOT (2026-08-26, first eye-pass on the ring).

          `42.5 kg × 13` is the widest set the engine can prescribe with a decimal load and a
          two-digit rep count, and at 66 points of mono it is 380 points wide inside a 337-point
          stage. **It wrapped**, leaving the × hanging at the end of the first line and the rep
          count alone on the second — one statement drawn as two, on the beat whose whole subject is
          that statement. The gallery could not see it because every fixture on the page held a
          two-digit whole load; `2.3e` carries the record at 42.5×13 now, for the same reason `2.2d`
          carries 137.5.

          The air around the × comes down to one space a side, and the figure shrinks to fit rather
          than breaking — the same contract `exName` and the bodyweight word already keep on the
          stage above. The DECLARED size is untouched, which is what `theBeatIsNotAFootnote` reads.
        */}
        <Text
          style={styles.capFigures}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          accessibilityLabel={`${w != null ? `${w} ${unitLabel(units)} · ` : ''}${confirm.reps} ${t('workout.repsUnit')}`}
        >
          {w != null ? (
            <>
              {w}
              <Text style={styles.capUnit}> {unitLabel(units)}</Text>
              <Text style={styles.capTimes}>{' × '}</Text>
            </>
          ) : null}
          {confirm.reps}
        </Text>
      </Arrive>
      <Arrive order={2}>
        {/* ⚠️ 20 → 23, with the stage's own headings (the founder's gym rule, same day): this is the
            line that says WHICH set was written, on a screen read at arm's length. */}
        <Legend size={23} track={0.24} align="center" tone="onStage" style={styles.capLegend}>
          {t('workout.setCaptured', { n: confirm.n })}
        </Legend>
      </Arrive>
    </View>
  );
}

function ExerciseDone({ confirm }: { confirm: Confirm }) {
  const { t } = useCopy();
  /* The lift-close carries its own soft pulse too — a boundary the hand should feel. */
  useEffect(() => {
    haptics.success();
  }, []);
  /* ⛔ THE PIP ROW IS GONE, AND THE RING IS WHY (founder, 2026-08-26 — see `SetRing`). Four green
     dots that appear only when a lift ends are a summary; the ring the athlete has been filling one
     set at a time is a CONCLUSION. Same fact, said by the instrument that earned it.

     ⛔ AND THE BAND MARK STAYS GONE: where the final set fell is a verdict, and verdicts are the
     coach's business after the session. The ring says the LIFT is finished — a fact — and the name
     says which. That is everything measured, and R7 forbids inventing the rest. */
  return (
    <View style={styles.beatHead}>
      <Arrive order={0}>
        <SetRing n={confirm.m} m={confirm.m} done />
      </Arrive>
      <Arrive order={1} style={styles.doneWords}>
        {/* The name is the floor: whatever else this beat can say, it always says which lift just
            ended — the sentence the wrist has had since it was built (founder 2026-08-05). */}
        <Text style={styles.beatDoneTitle}>
          {confirm.lift ? t('workout.liftDone', { lift: bidi(exerciseDisplayName(confirm.lift)) }) : t('workout.liftDonePlain')}
        </Text>
        {/* ⚠️ SANS, NOT MONO — `monoCarriesNoWords`: this reads "4 סטים" in Hebrew and IBM Plex
            Mono has no Hebrew. */}
        <Legend size={22} track={0.22} align="center" style={styles.doneCount}>
          {t('workout.setsDone', { count: confirm.m })}
        </Legend>
      </Arrive>
    </View>
  );
}

/**
 * ════ DOES THE LOGGED BEAT SPEAK FOR THIS SET? — ONE PREDICATE, EVERY CALLER ════
 *
 * Three surfaces ask (render guard, dwell timer, wrist replay), and they must answer together —
 * the flash bugs of 2026-08-16 were three askers answering apart. Since the 2026-08-26 ruling the
 * answer is simply: EVERY working set speaks — the capture is the beat — and a WARM-UP BRIDGE
 * NEVER does (it is not a measured set; `theWarmupIsABridgeNotAMeasurement`). The second argument
 * it once took (a correction) left with the live loop; nothing fed it, so it is gone (2026-09-09).
 */
export function beatSpeaksFor(confirm: Confirm | null): boolean {
  if (confirm == null) return false;
  return confirm.warmup !== true;
}

/* ----------------------------------------------------- Rest — learned (2.4d) */
/**
 * REST — LEARNED (v7 2.4d). The one screen in the product that reports a rule changing.
 *
 * It appears only when the athlete CHANGED the rest — pressed Start next set early, or added +15.
 * Both are measurements: her median moves, and the next prescription with it. So the beat states
 * three things and asks for nothing —
 *
 *   the pace she ACTUALLY took, inside a double ring (this is what you did),
 *   "REST · LEARNED" (this is what I made of it),
 *   the plan struck through into its new value (this is what changes).
 *
 * No verdict — a shorter rest is not worse than a longer one, and Hush does not have an opinion
 * about it. No button, because there is nothing to agree to: the set begins on its own.
 */
function RestLearned({ took, was, now }: { took: number; was: number; now: number | null }) {
  const { t } = useCopy();
  // `clockOf` — the workout's one clock format; this had its own copy, the only one of four that
  // clamped negatives, and the four have been one since 2026-09-09.
  const clock = clockOf;
  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ THE HERO IS THE REST SHE WILL GET, NOT THE ONE SHE JUST TOOK (founder, 2026-08-12)
   *
   *   *"המסך הזה לא ברור. מה זה השניות שמופיעות על המסך ורשום LEARNED? צריך להציג את הזמן שהמנוע
   *   למד שהמתאמן אוהב ולרשום NEXT TIME זה הזמן שיהיה."*
   *
   * It put `took` in the ring under "YOUR PACE" — the raw sample, which on his screenshot was
   * **0:03**, because he pressed Start immediately in the harness. A three-second rest drawn as the
   * largest figure on the screen, labelled as though it were a finding.
   *
   * ⚠️ AND THE SAMPLE IS NOT THE DECISION. `restWithSample` folds it into a MEDIAN over every rest
   * she has taken on this lift, so once she has any history an impatient tap moves the prescription
   * a little rather than to itself. The screen was showing her the INPUT to that calculation and
   * calling it the result — then printing the actual result, smaller, in the struck row underneath.
   * **The two were the wrong way round.**
   *
   * ⚠️ ON THE VERY FIRST SAMPLE THE MEDIAN *IS* THE SAMPLE, which is exactly what the gallery draws
   * (`0:00`, from a Start pressed instantly with no history behind it). That is honest — it really
   * is what the next rest would be — and it is worth knowing that this screen's most alarming state
   * is reachable only on the first set of a lift she has never rested through.
   *
   * `now` in the ring under NEXT TIME; what it WAS, struck, beneath. The new value is not printed
   * twice — it is the hero, and the row below exists only to say what it replaced.
   */
  const next = now ?? took;
  return (
    <View style={styles.paceBody}>
      <Breathe>
        <View style={styles.paceRing}>
          <View style={styles.paceRingInner}>
            <Text style={styles.paceValue}>{clock(next)}</Text>
            <Legend size={17} track={0.22} align="center" tone="onStage">{t('workout.nextTime')}</Legend>
          </View>
        </View>
      </Breathe>

      <Legend size={17} track={0.18} align="center" tone="accent">{t('workout.restLearned')}</Legend>

      {/* What it was. Only when the median actually MOVED — a struck figure identical to the one
          above it would announce a change that did not happen. */}
      {/* The SAME test `endRestLearned` fires the beat on (whole seconds) — strict inequality here
          could strike a row over a change the trigger had already called "nothing" (2026-09-09). */}
      {now != null && Math.round(now) !== Math.round(was) ? <Text style={styles.paceWas}>{clock(was)}</Text> : null}
    </View>
  );
}

/* ------------------------------------------------- The last set of a lift (2.3b) */
/* ----------------------------------------------------------------------- Rest */
function Rest({
  units,
  paused,
  notice,
  onLearned,
  onDemo,
}: {
  units: 'kg' | 'lb';
  paused: boolean;
  /** A notice owns the footer while it is up — the buttons stand down (see SessionFlow.notice). */
  notice: boolean;
  /* ⛔ `onSwap` IS GONE FROM THIS COMPONENT (founder, 2026-08-12) — it is a disc on the stage bar,
     which is where every other control on this stage lives.
     ⚠️ `onDemo` CAME BACK ON 2026-08-31, and not as a disc: the chrome's form control was deleted
     (*"הכנסנו אותו למסך עצמו"*) and a crossing now DRAWS the next lift, so the figure itself is the
     way into the technique sheet. */
  onDemo?: () => void;
  /** Leaving a rest the athlete CHANGED — cut short, or stretched. Carries what she actually
   *  rested and what had been prescribed, so 2.4d can state both. */
  onLearned: (tookS: number, wasS: number) => void;
}) {
  const { t } = useCopy();
  const session = useSession();
  const pair = usePair();
  /*
   * ════ ⛔ HER REST AND THE BAR, TOGETHER — `domain/sharedSession.sharedRestEndsAt` ════
   *
   * A partner can only ever LENGTHEN a rest, never shorten one, and this is the screen where that
   * asymmetry is visible. Her own countdown runs exactly as it does alone — the engine's number,
   * untouched, because the bar being free is not a reason to be recovered. What changes is the far
   * end: when the clock reaches zero and her partner is still under the bar, there is no instant to
   * count to, and the readout must not say READY over an occupied bench.
   *
   * The rule is not re-derived here. `sharedRestEndsAt` answers `null` for exactly that case, and
   * the label follows its answer.
   */
  const barIsHis =
    pair.stage === 'live' && pair.atSameStation && pair.standing != null && !pair.standing.mine && !pair.standing.stale;
  const isTransition = session.displayPhase === 'REST_TRANSITION';
  // The signature moment, if Loop 1 just made one. Guarded against the NEXT lift below: a
  // correction belongs to the exercise it was measured on, and a transition rest is already
  // looking at a different one.
  const correction = session.correction;
  const nextExerciseId = session.nextExerciseId;
  // The eased/raised load is now REVEALED on the logged beat (mock 2.3); here on the rest card it
  // survives only as the next set's load in moss + an "Eased for you" pill (mock 2.4) — the one
  // number the up-next law licenses between sets, because a corrected load is news, not a reminder.
  // A correction always belongs to the next set of the SAME exercise, so it never coincides with a
  // transition rest (whose next lift is a different exercise) — the two right-hand states below are
  // mutually exclusive by construction.
  const nextName = exerciseDisplayName(session.nextExerciseId);
  /* Which set she comes back to. `nextSetLabel` is the same source `SessionFlow` reads for the
     learned-rest beat, so the rail, the card and the beat cannot disagree about the number. */
  const nextSetN = session.nextSetLabel?.n ?? 1;
  const nextSetM = session.nextSetLabel?.m ?? 1;
  const nextGroup = session.nextExercise?.muscle ?? '';
  const nextTarget = session.nextTarget;
  // The upcoming load is the engine's prescribed value verbatim (same number the athlete will lift).
  const nextWeight = displayWeight(nextTarget?.recommendedWeight ?? null, units);
  /**
   * WHAT IS COMING, WHEN WHAT IS COMING IS NOT A LIFT.
   *
   * The crossing card's right-hand figure is a load, and it prints the WORD "bodyweight" when there
   * is none — correct for a push-up, a lie in front of a five-kilometre run, which is the next thing
   * the coach can now put there. A movement's instruction is its own measure: the distance, or the
   * hold. `open` has neither and gets nothing, which is the honest answer for an item whose whole
   * point is that no number was worth stating.
   */
  const nextItem = session.nextItem;
  const nextFigure =
    nextItem?.kind === 'distance'
      ? distanceOf(nextItem.metres, t)
      : nextItem?.kind === 'time'
        ? { figure: clockOf(nextItem.seconds), unit: '' }
        : null;
  // Both doors open onto a lift's pool and a lift's film — see `onLift` on the stage above.
  const nextIsLift = !!exerciseById(session.nextExerciseId ?? '');
  // (The upcoming REPS are deliberately absent — see the up-next law below. They were read here
  // and printed on the rest card; nothing reads them now.)
  const nextSet = session.nextSetLabel;
  const nextDelta = nextTarget?.reasonType;
  /*
   * ════ A LOAD THAT MOVED MID-LIFT IS SAID WHERE SHE CAN STILL ACT ON IT (2026-09-08) ════
   *
   * Loop 1 can ease or raise the next set of the SAME lift (gallery 2.2l). The set stage shows
   * it, but by then she is on the bench with the old plates on the bar; the rest is where the bar
   * gets changed. So the card carries the new figure — in the direction's own colour, the one law
   * from `design/tokens` — and ONLY when it moved: a load that holds is not news (the
   * constant-column ruling, 2026-09-02), and the crossing and the warm-up rung keep their own
   * branches above. Measured against her last logged set of this lift, not the prescription: a
   * presumed set carried the prescription, so the comparison is still the bar as it stands.
   */
  const lastOfThisLift = (session.loggedSets ?? []).filter((l) => l.exerciseId === session.currentExerciseId && !l.isApproach).slice(-1)[0];
  const lastWeight = lastOfThisLift ? displayWeight(lastOfThisLift.actualWeight, units) : null;
  const movedTo =
    !isTransition && !session.setLabel?.warmup && !session.nextSetLabel?.warmup && nextWeight != null && lastWeight != null && nextWeight !== lastWeight
      ? nextWeight
      : null;
  const movedBy = movedTo != null && lastWeight != null ? +(movedTo - lastWeight).toFixed(2) : 0;
  /* ⚠️ `nextSetup` IS ALIVE AGAIN (founder gym finding #2, 2026-08-25: *"היה כתוב בזמן מנוחה 30
     קילו אבל לא כמה לשים בכל צד"*). The v7 2.4b ruling kept the per-side figure off this card on
     the grounds that she is "still walking to the station" — his own session answered that the
     walk is exactly when he wants to know what to rack. The crossing card now carries the same
     equipment-native line the set stage does: plates a side, the pin, the bar to pick up. */
  // …and the same line under a load that MOVED mid-lift (2026-09-08): she is changing the plates now.
  const nextSetup = isTransition ? loadSetup(session.nextExerciseId, nextWeight, units) : movedTo != null ? loadSetup(session.currentExerciseId, movedTo, units) : null;
  const nextAnnex = heroAnnex(nextSetup, t, units);
  /* The face and the tracking are ONE answer, taken from the string itself — see the note at the
     markup for the fault this replaces. A Hebrew suffix makes the whole line sans and untracked. */
  const upSideVoice = legendVoice(nextAnnex ? `${nextAnnex.value} ${nextAnnex.suffix}` : '', UP_SIDE_SIZE, tracking.legend);
  /* One measured fact about the lift ahead, or nothing at all — `domain/whatIKnow` decides which,
     and the copy pack owns the sentence (a `kind` picks it, a `value` fills it). The load is
     converted like every other weight on this screen; seconds and counts are unit-free. */
  const knownFact = session.nextLiftFact;
  const knownLine = !knownFact
    ? null
    : knownFact.kind === 'rest'
      ? t('workout.knowRest', { n: knownFact.value })
      : knownFact.kind === 'exec'
        ? t('workout.knowExec', { n: knownFact.value })
        : knownFact.kind === 'peak'
          ? t('workout.knowPeak', { n: displayWeight(knownFact.value, units) ?? knownFact.value, unit: unitLabel(units) })
          : t('workout.knowSessions', { n: knownFact.value });
  /*
   * ⛔ "STILL AHEAD" IS DELETED FROM THIS CARD (founder 2026-08-29): *"במסך המנוחה באימון כתוב עוד
   * בהמשך.. ורשום תרגילים שאי אפשר לראות בכלל בלחיצה על זה. תוריד את הכיתוב הזה משם."*
   *
   * It was the answer to his own gym finding #9 (2026-08-25, *"אין לי שום דרך לדעת"*) and it was
   * the WRONG SHAPE of answer: two names out of however many remain, on one clipped line, with no
   * press behind them. It looked like a door and was a caption — which is worse than silence,
   * because a person who taps it and gets nothing stops believing the rest of the screen's rows.
   *
   * The question is real and it now has a real instrument: the session map, every remaining lift
   * with its state and its set count, opened from a disc that is present on every beat of the
   * session including this one (see `onMap` on the stage bar). One answer, whole, in one place.
   */

  // The countdown is anchored to an ABSOLUTE end instant on the wall clock, NOT a
  // per-second decrement. iOS suspends JS timers while backgrounded/locked, so a
  // decrementing counter would freeze and resume mid-count — here we recompute
  // `remaining` from `endAt - now` each tick AND on every return to foreground, so
  // the real elapsed rest is always reflected (the timer keeps running while away).
  const [total, setTotal] = useState(session.restSeconds);
  const [remaining, setRemaining] = useState(session.restSeconds);
  const endAtRef = useRef<number | null>(null);
  const remainingRef = useRef(session.restSeconds);
  // Rest "Approach" haptic countdown — each beat (7/3/2/1) fires once as `remaining` lands on it.
  const beatsFiredRef = useRef<Set<number>>(new Set());
  const prevRemForBeatsRef = useRef(session.restSeconds);

  const sync = useCallback(() => {
    if (endAtRef.current == null) return;
    const rem = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000));
    remainingRef.current = rem;
    setRemaining(rem);
  }, []);

  // How much of the session's "+15 sec" total this screen has already folded into its countdown.
  const appliedExtraRef = useRef(0);

  // A new rest period (duration changed / phase changed / the ANCHOR moved): reset and re-anchor.
  useEffect(() => {
    /*
     * ⛔ THE STORE'S END, NOT `now + restSeconds` (code review 2026-09-09). Anchoring at mount was
     * right for a rest that began when this screen appeared, and wrong for the two rests that do
     * not: one the CLOCK started at its due instant while the phone slept (the ring restarted a
     * full rest over a remainder the wrist and the lock screen were already counting down), and
     * one "I just finished" re-anchored to NOW (the store moved, the ring never did). The mirror's
     * end instant — `restEndsAtMs` — is the one every surface counts to; a rest with no anchor
     * yet (the first frame of a resume) keeps the old arithmetic.
     */
    const endAt = session.restEndsAtMs ?? Date.now() + session.restSeconds * 1000;
    const rem = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    setTotal(session.restSeconds);
    setRemaining(rem);
    remainingRef.current = rem;
    endAtRef.current = paused ? null : endAt;
    /**
     * THE EXTENSION IS ALREADY IN THE ANCHOR — DO NOT ADD IT TWICE.
     *
     * On a fresh rest this is zero: the store resets the "+15" total with every new rest, and
     * `restSeconds` is the prescribed length. But on a rest RESUMED after an app kill it is not.
     * `sessionRecovery` rebuilds the remaining time as `base + restExtraS − elapsed`, so the
     * seconds the athlete added before the crash are ALREADY inside `restSeconds` — while the
     * store, correctly, still reports them as the current rest's extension. Anchoring this ref at
     * 0 would make the effect below read a 15-second "delta" that had already been counted and
     * hand the athlete a rest fifteen seconds longer than the one they walked away from — on the
     * wrist too, since the phone is the clock. Anchor to what the store already knows.
     */
    appliedExtraRef.current = session.restExtraSeconds;
    beatsFiredRef.current.clear(); // fresh rest → re-arm the Approach countdown
    prevRemForBeatsRef.current = session.restSeconds;
    // Locked/background backstop: schedule the OS-level 7s warning + rest-over alert
    // against the same absolute end (or clear it while paused). ALWAYS with the next set's words
    // (`restAlert`) — this used to re-arm bare and overwrite the store's payload with "Go." (2026-09-09).
    if (endAtRef.current != null) void restHaptics.arm(endAtRef.current, session.restAlert ?? undefined);
    else void restHaptics.disarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.restSeconds, session.displayPhase, session.restStartedAtMs]);

  // Pause freezes the value; resume re-anchors the end from the frozen remaining.
  useEffect(() => {
    if (paused) {
      endAtRef.current = null;
      void restHaptics.disarm(); // held — no alert should fire
    } else {
      endAtRef.current = Date.now() + remainingRef.current * 1000;
      sync();
      void restHaptics.arm(endAtRef.current, session.restAlert ?? undefined); // resume — reschedule from the new end
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, sync]);

  // Cancel any pending locked/background alerts when this rest screen tears down
  // (workout exit, finish, or advancing to the next set).
  useEffect(() => {
    return () => void restHaptics.disarm();
  }, []);

  // Lock-screen / background fix: JS timers suspend, so re-sync on foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !paused) sync();
    });
    return () => subscription.remove();
  }, [paused, sync]);

  useEffect(() => {
    if (paused) return;
    if (remaining <= 0) {
      // GO — felt without looking. A new exercise gets the distinct triple; the next set, the double.
      if (isTransition) haptics.exerciseAdvance();
      else haptics.restFinished();
      void restHaptics.disarm(); // rest reached zero in-app → drop the pending OS alerts
      session.endRest();
      return;
    }
    const id = setTimeout(sync, 1000);
    return () => clearTimeout(id);
  }, [remaining, paused, session, sync, isTransition]);

  // The Approach countdown: fire each beat once as `remaining` lands on a threshold via a normal
  // tick. A jump (background catch-up / re-anchor) consumes skipped beats SILENTLY — never a buzz
  // storm on return to foreground.
  useEffect(() => {
    const prev = prevRemForBeatsRef.current;
    prevRemForBeatsRef.current = remaining;
    if (paused) return;
    const jumped = prev - remaining > 1;
    for (const tSec of haptics.REST_APPROACH_BEATS) {
      if (remaining <= tSec && !beatsFiredRef.current.has(tSec)) {
        beatsFiredRef.current.add(tSec); // consume so it never fires late
        if (!jumped && remaining === tSec) haptics.restApproach(tSec);
      }
    }
  }, [remaining, paused]);

  /**
   * ════ THE FINAL SECONDS ARE FELT, NOT FLASHED (founder 2026-07-29) ════
   *
   * The last `REST_WARNING_LEAD_S` seconds used to pulse a white wash over the whole stage, once a
   * second — an "ignition" meant to be readable from standing height with the phone on the floor.
   * On the device it reads as a fault: the screen blinking at her while she is between sets. It is
   * gone from every rest surface. **The countdown is carried by the wrist and by the OS alert**
   * (`restHaptics` — untouched), which is where a warning belongs when the phone is not in her hand.
   *
   * What survives is not motion: the readout LIFTS in the closing window (`RestRing closing`), a
   * static change of presence that catches the eye without moving.
   */
  const closing = !paused && remaining > 0 && remaining <= REST_WARNING_LEAD_S;

  /**
   * +15s — AND THE ONLY PLACE IT LANDS, whoever pressed it (founder 2026-07-13: "+15 on the watch
   * doesn't add on the phone; the other way round works").
   *
   * The button used to extend this screen's countdown itself and then tell the store, for the
   * watch's benefit. So a +15 from the WRIST — which enters through the store — reached the mirror,
   * the Live Activity and the watch, and never reached the one countdown the athlete was looking
   * at. The store now holds the truth (`restExtraSeconds`, reset with every new rest) and this
   * screen FOLLOWS it: press here or press there, the same seconds arrive by the same road.
   *
   * `total` stays fixed while `remaining` grows, so the ring visibly fills FORWARD by a clear
   * 15/total slice — the "loading" top-up — instead of the imperceptible nudge you get when the
   * total grows in lock-step (the law: `restTotalS` never grows, on any surface).
   */
  const extraS = session.restExtraSeconds;
  useEffect(() => {
    const delta = extraS - appliedExtraRef.current;
    appliedExtraRef.current = extraS;
    if (delta <= 0) return; // a reset (new rest) is handled by the re-anchor effect above
    remainingRef.current += delta;
    beatsFiredRef.current.clear(); // the final-seconds window moved out — re-arm the countdown
    prevRemForBeatsRef.current = remainingRef.current;
    if (endAtRef.current == null) {
      // Paused: there is no end instant to move — the frozen remaining grows, and resume anchors
      // from it (the pause effect above).
      setRemaining(remainingRef.current);
      return;
    }
    endAtRef.current += delta * 1000;
    sync();
    void restHaptics.arm(endAtRef.current, session.restAlert ?? undefined); // the end moved out — reschedule the OS alerts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraS, sync]);

  const addFifteen = useCallback(() => {
    session.extendRest(15);
  }, [session]);

  return (
    <>
      {/* THE STRIP SAYS WHERE YOU ARE, NOT WHAT SCREEN THIS IS (2026-07-17).
          It used to read "REST" — the same word the ring says, 200pt below it, under the clock.
          One fact, one element: the ring already IS a rest timer, and its label earns its place by
          turning into "Ready" at zero. The strip's copy was pure chrome, and it cost the rest
          screen the one thing it never told you — how far through the workout you are. It now
          carries the ordinal, exactly as the live set does, so the two screens stop disagreeing
          about what the top of the stage is for.
          (A TRANSITION rest keeps its legend: there the strip is not repeating the ring — the ring
          says the clock, the legend says a new lift is coming, which is news.) */}
      {/* The chrome — pause, "LIFT 1 → 2", the elapsed clock — is rendered once by SessionFlow
          above every beat, a crossing included. A rest is still inside the workout. */}
      <View style={styles.restBody}>
        {/*
          ⛔ THE CIRCLE IS OFF, AND THE BREATH WENT WITH IT (founder, 2026-08-31).

          *"אני בעד להוריד את המעגל שסביב השעון כי זה יפתח לנו את כל המסך."* — and the second half of
          that is `Breathe`. The ring breathed because it was the only living thing on a screen where
          nothing happens; the athlete beneath it breathes now, at the same 4.5/4.5 the ring used, so
          keeping the pulse on the clock would be two things breathing at each other. One moment, one
          tell — the stage's own law, applied to its own instrument.
        */}
        {(
          <RestRing
            bare
            remaining={remaining}
            total={total || 1}
            size={240}
            stroke={4}
            onStage
            closing={closing}
            // A rest that follows a CORRECTION runs in that correction's colour — the eased blue or
            // the raised moss. The card below already says which way the load went; the ring is the
            // thing she is actually looking at, so it must not disagree with it.
            label={
              remaining <= 0
                ? sharedRestEndsAt(Date.now(), barIsHis ? null : Date.now()) == null
                  ? t('pair.barBusy')
                  : t('workout.ready')
                : t('workout.rest')
            }
          />
        )}

        {/*
          ════════════════════════════════════════════════════════════════════════════════════════
          ⛔ AND UNDER THE CLOCK, THE PERSON IT IS COUNTING FOR (founder, 2026-08-31)
          ════════════════════════════════════════════════════════════════════════════════════════

          The ring already said a rest was running. What it could not say is WHOSE, or that the
          thing being rested is a body — and between sets that is the entire content of the screen.
          A seated figure breathing at the ring's own 4.5/4.5 cadence is the same fact drawn twice
          in two registers, which is what a stage is for: the instrument states it, the subject
          embodies it.

          ⚠️ SEATED IS THE WHOLE TELL (see `motion/library/life`). A standing figure at ease and a
          standing figure between sets are one silhouette; the moment she sits, the screen is
          unmistakable from across a gym without a word being read.

          ⚠️ A CROSSING DRAWS THE NEXT LIFT INSTEAD, not this (`CrossingAthlete`). A seated figure
          on the one rest where she is walking to a station would be the screen contradicting the
          only instruction it is giving.
        */}
        {/*
          ⛔ NOT ON A CROSSING, AND THIS IS THE FIRST THING THE POSE GOT WRONG. `restBody` draws both
          rests, so a seated athlete landed on the TRANSITION too — the one rest in the workout where
          she is on her feet, walking to a station she has not reached, being told how much to load.
          A figure sitting on a bench there is the screen contradicting the only instruction it is
          giving. A crossing wants a WALKING pose and there isn't one yet; until there is, it draws
          nothing, which is what it drew yesterday.
        */}
        {isTransition ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('workout.form')}
            onPress={onDemo}
            disabled={!onDemo}
            style={styles.crossingAthleteSlot}
          >
            <CrossingAthlete exerciseId={session.nextExerciseId} />
            {/* The same handle the live stage's figure wears — see `demoHint`. */}
            {onDemo ? (
              <View style={styles.demoHint} pointerEvents="none">
                <Icon name="playCircle" size={18} color={stage.ink2} strokeWidth={1.8} />
              </View>
            ) : null}
          </Pressable>
        ) : (
          <RestingAthlete />
        )}

        {/* ═══ THE UP-NEXT LAW (founder 2026-07-12, phone AND watch, both languages) ═══
            REST BETWEEN SETS: the lift's name and which set. Nothing else. The load and the
            reps were on the stage thirty seconds ago and will be on it again in thirty more —
            printing them during the rest is noise the athlete has to re-read every time, and it
            competes with the only number that matters here, the one counting down in the ring.

            REST BEFORE A NEW EXERCISE: the same, PLUS the load and how to build it — how much
            goes on each side. That is the one moment the athlete stands up and walks to a
            station, and it is the only rest where a number is an instruction rather than a
            reminder. The reps still do not appear: you cannot load reps onto a bar. */}
        <View style={styles.upNext}>
          <View style={styles.upCard}>
            <View style={styles.upRow}>
              <View style={styles.upInfo}>
                {/*
                  ⛔ THE SET POSITION COMES OFF THIS LINE (founder, 2026-08-12).

                  *"אפשר למחוק את הכיתוב של הסט הבא אם זה מוצג לנו למעלה כבר."* — and his other note
                  is the proof: *"או שאני מדמיין או שאני רואה באג שבחלק העליון זה מראה סט 2 מתוך 4
                  ובכיתוב כתוב סט 3 מתוך 4."*

                  ⚠️ IT IS NOT A BUG, AND THAT IS WORSE. The rail says where she IS (set 2, just
                  finished); the card said what is NEXT (set 3). Both true, neither wrong, and **the
                  screen reads as though it cannot count.** Two instruments answering one question
                  with different numbers is a defect whatever the arithmetic says.

                  ⚠️ AND IT WAS ALSO THE LAYOUT FAULT HE PHOTOGRAPHED. "UP NEXT · SET 3 OF 4" is
                  three lines at 17pt tracked in the width the pill left it, which is why "Bench
                  Press" broke in half underneath. One short line fixes both at once.

                  ⚠️ "UP NEXT · NEW LIFT" WENT THE SAME WAY, and measured: 230 points of legend in a
                  175-point column, so the crossing card wrapped its own heading. **"UP NEXT" is not
                  information on a card that is the only card on the screen** — the news is that the
                  lift is a new one, and that is what is left.
                */}
                {/*
                  ════ ⛔ BETWEEN SETS, THE NEWS IS THE SET — NOT THE LIFT (founder, 2026-08-18) ════

                  This drew "UP NEXT" over the name of the lift she is standing at, mid-way through
                  it. **She has not moved.** The name was on the stage thirty seconds ago and is on
                  it again in thirty more; the card was spending the only surface of the rest on the
                  one fact she cannot possibly have lost.

                  ⚠️ AND THE UP-NEXT LAW ABOVE ALREADY SAID SO, AND HAD SINCE 2026-07-12: *"REST
                  BETWEEN SETS: the lift's name **and which set**."* The second half was never
                  built. What is drawn now is that law: the lift recedes to the legend, where a
                  context belongs, and the set she is about to do takes the line.

                  ⚠️ THE LEGEND STILL EARNS ITS ROOM, unlike "UP NEXT" — it is the ONE place a
                  swapped lift announces itself during the rest that follows the swap.

                  A CROSSING is untouched: there the lift genuinely is the news, "NEW LIFT" says the
                  thing that changed, and the load beside it is an instruction to go and build.
                */}
                <Legend size={17} track={0.18} tone="onStage" style={styles.upLegend}>
                  {isTransition ? t('workout.upNextNewLift') : bidi(nextName)}
                </Legend>
                <Text style={styles.upName} numberOfLines={2}>
                  {isTransition
                    ? nextName
                    : session.nextSetLabel?.warmup
                      ? t('workout.warmupOfM', { n: nextSetN, m: nextSetM })
                      : t('workout.setOfM', { n: nextSetN, m: nextSetM })}
                </Text>
              </View>
              {isTransition && nextItem && nextItem.kind !== 'reps' ? (
                nextFigure ? (
                  <View style={styles.upRight}>
                    <Text style={styles.upWeight}>
                      {nextFigure.figure}
                      {nextFigure.unit ? <Text style={styles.upWeightUnit}> {nextFigure.unit}</Text> : null}
                    </Text>
                  </View>
                ) : null
              ) : isTransition ? (
                <View style={styles.upRight}>
                  {/* A load is a FIGURE (mono); "bodyweight" is a WORD, and it takes the word's voice
                      — the mono face has no Hebrew letters to draw it with at all.
                      CREAM, not moss: on a new lift the number is an instruction to go and set up,
                      not a decision the engine just made. Moss on this card means "I changed this". */}
                  <Text style={[styles.upWeight, nextWeight == null && styles.upWeightWord]}>
                    {nextWeight != null ? nextWeight : t('workout.bodyweight')}
                    {nextWeight != null ? <Text style={styles.upWeightUnit}> {unitLabel(units)}</Text> : null}
                  </Text>
                </View>
              ) : !isTransition && (session.setLabel?.warmup || session.nextSetLabel?.warmup) && nextWeight != null ? (
                // AROUND A WARM-UP RUNG THE LOAD IS CHANGING (eye-pass 2026-08-26): the ramp climbs
                // between this rest and the next set, so the card states what to put on the bar —
                // in cream, an instruction to go and build, exactly like a crossing's figure.
                <View style={styles.upRight}>
                  <Text style={styles.upWeight}>
                    {nextWeight}
                    <Text style={styles.upWeightUnit}> {unitLabel(units)}</Text>
                  </Text>
                </View>
              ) : movedTo != null ? (
                // THE NEXT SET OF THIS LIFT MOVED (2026-09-08): the new figure in the direction's colour,
                // with the step it took — she reads it here, at the bar, and changes the plates now.
                <View style={styles.upRight}>
                  <Text style={[styles.upWeight, { color: directionTone(movedBy > 0 ? 'up' : 'down') }]}>
                    {movedTo}
                    <Text style={styles.upWeightUnit}> {unitLabel(units)}</Text>
                  </Text>
                  <LoadDelta value={movedBy} unit={unitLabel(units)} />
                </View>
              ) : null}
            </View>
            {/*
              ⛔ IT WAS SAYING `בכל צד` IN MONO, TRACKED 1.2 (found 2026-08-27).

              The comment said *"the same voice as the stage's"* and the style was the opposite of it:
              `font.mono`, `letterSpacing: 1.2`, `.toUpperCase()`. That is the founder's own 2026-08-21
              finding — `מ ש ק ל` on the live stage — rebuilt by hand on the rest card. IBM Plex Mono
              has no Hebrew, so the suffix fell back to a substitute face and then had 1.2 points
              driven between letters that carry the word as a connected block. (`.toUpperCase()` on
              Hebrew is a no-op, which is the tell: the line was drawn as an English all-caps legend.)

              ⚠️ AND IT WALKED PAST BOTH GUARDS. `monoCarriesNoWords` and `lint-rtl` look for a
              `tracking.*` rung; this was a bare `1.2`. **A literal is not a rung, so nothing read it.**
              `everyTrackedWordIsLatin` is extended to catch the literal form too.

              `legendVoice` is the one answer for both halves — face AND tracking follow the string —
              which is what the stage's annex does one screen earlier.
            */}
            {nextAnnex ? (
              <Text style={[styles.upSide, upSideVoice.latin ? styles.upSideMono : null, { letterSpacing: upSideVoice.letterSpacing }]}>
                <Text style={styles.upSideValue}>{nextAnnex.value}</Text>
                {` ${nextAnnex.suffix}`}
              </Text>
            ) : null}

            {/*
              ════ ⛔ WHAT THE APP KNOWS ABOUT HER ON THIS LIFT (founder, 2026-08-31) ════

                > *"אם המשתמש מרגיש שבאמת התוכנית אישית… יהיה לו דרייב לדבוק בה ולהשקיע ברישום כל
                > סט. אם המשתמש מרגיש שזאת סתם תוכנית כללית וגנרית אז זה פחות נותן דרייב."*

              The diagnosis in `domain/whatIKnow`: this app has always told her what it DID and
              never what it KNOWS. Every statistic it decides with — her rest on this lift, her
              execution, the rungs she taught it by lifting them — ran a timer in silence.

              ⚠️ THE CROSSING IS THE ONE BEAT WHERE THIS BELONGS, and the up-next law is why. Between
              sets the news is the SET and the lift is a fact she cannot have lost; on a live set the
              screen is the prescription and nothing may compete with it. A crossing is the only
              moment in a workout when she is walking, holding the phone, with the next lift on her
              mind and nothing to do but read — and it is already the card that answers "what do I
              go and rack".

              ⛔ AND IT IS SILENT ON DAY ONE. `factForLift` returns null until a gate is cleared, and
              this draws nothing rather than a placeholder — the whole claim is that the number is
              hers, and a filled-in slot on a lift she has never done is how "personalised" becomes
              a word she stops believing.
            */}
            {knownLine ? <Text style={styles.upKnown}>{knownLine}</Text> : null}

            {/* ⛔ NO "OR START" CHIPS HERE (founder, 2026-09-08, on glass): *"יש swap ויש פקד שמציג
                את התרגילים הנותרים — צריך למחוק את השני."* A taken station is the swap disc or the
                session map, both one press away in the chrome; the card stays the card. */}

            {/* ═══ THE SIGNATURE MOMENT (2026-07-17, moved to the logged beat 2026-07-24) ═══
                The set she just finished moved the next one — the brief's "single most distinctive
                moment in the product." The FULL account (old load → new, and the reps that earned
                it) now plays on the logged beat itself (mock 2.3, `CorrectionBeat`), at the instant
                the set writes. Here on the rest card it survives only as the eased/raised load in
                moss + the "Eased/Raised for you" pill above (mock 2.4) — the one number the up-next
                law licenses between sets, because a corrected load is news, not a reminder. */}

            {/* The per-side figure RETURNED to this card on 2026-08-25 (founder gym finding #2) —
                see `nextAnnex` above. The v7 2.4b removal note argued she is "still walking to the
                station"; the founder's own session answered that the walk is when the racking
                plan is needed. It renders in the pill row above, beside the load it explains. */}

          </View>
          {/*
            ⛔ BOTH DOORS MOVED INTO THE CHROME (founder, 2026-08-12).

            *"מסך 2.4b transition rest מציג גם צפייה בוידאו בכפתור וגם בחלק העליון בצד. אפשר פשוט
            לשים את ה-SWAP בפקד למעלה כמו במסך הסט הראשון של התרגיל הראשון."*

            He is right and the FORM half was a plain duplication: the stage bar already carries a
            form disc through a rest, so this row drew a second control for the same act, one under
            the other. The swap disc was the missing half — it is offered on the first set of the
            first lift and nowhere else, and the transition rest is *"the only case where the machine
            is likely to be taken"* (his own ruling of 2026-08-12). Both are discs now, in the one
            place the stage puts its controls.
          */}
        </View>
      </View>

      {/* Stood down while a notice is up — out of the finger's reach AND out of VoiceOver's. */}
      <View
        style={[isTransition ? styles.crossingFooter : styles.stageFooter, notice && styles.footerStoodDown]}
        pointerEvents={notice ? 'none' : 'auto'}
        accessibilityElementsHidden={notice}
        importantForAccessibility={notice ? 'no-hide-descendants' : 'auto'}
      >
        {/* The partner, on the one screen where the answer to "how long" is another person. */}
        <PairStrip />
        <Button
          variant="onstage"
          size={isTransition ? 'crossing' : 'act'}
          block
          label={isTransition ? t('workout.startNamed', { name: bidi(nextName) }) : t('workout.startNextSet')}
          onPress={() => {
            // A rest she CHANGED is a measurement (2.4d): cutting it short or stretching it both
            // move her median, and the beat says so on the way out. A rest that simply ran out
            // taught nothing new, so it hands straight over to the set.
            const changed = remaining > 0 || session.restExtraSeconds > 0;
            // What she actually rested — see `restedSeconds` for why the added seconds have to be
            // added back (founder C.10).
            if (changed && !isTransition) onLearned(restedSeconds(total, remaining, session.restExtraSeconds), total);
            else session.endRest();
          }}
        />
        {/* ⛔ THE WARM-UP OFFER SITS ABOVE +15, AND THE ORDER IS THE ARGUMENT: a bridge changes
            what she does at the station she is walking to; fifteen seconds changes only how long
            she stands here. The nearer control to the act is the one about the work.

            ⚠️ IT RENDERS ONLY ON A CROSSING INTO A COMPOUND — `warmupOffered` is 0 during a rest
            BETWEEN sets, because the lift has begun and a bridge behind her is nothing. This
            component draws on every rest and the store decides which ones. */}
        {/* Both secondary controls live INSIDE the fixed band (see `footerBand`), side by side —
            so the act above them holds one position whether zero, one or both are offered, and
            "+15" vanishing at READY no longer drops the act into the space it left. */}
        <View style={styles.footerBand}>
          <WarmupOffer />
          {/* +15 IS A CONTROL, on every rest (founder 2026-07-27). It does real work — it extends
              the running rest, and the ring answers by FILLING FORWARD, the way it did before the
              redesign: `total` is held still while `remaining` grows, so the arc sweeps up by a
              visible 15/total slice instead of nudging imperceptibly. A control that does that must
              look like one, at a crossing as much as between sets. */}
          {remaining > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('workout.addSeconds')}
              onPress={addFifteen}
              style={({ pressed }) => [styles.addFifteen, pressed && styles.addFifteenPressed]}
            >
              <Text style={styles.addFifteenLabel}>{t('workout.addSeconds')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

    </>
  );
}

/* --------------------------------------------------- Why this load (reasoning) */
/** The LIGHT, single-line, observational reason behind a load — the in-session
 *  cousin of the Weekly Update's WhyTriple. Calm, past-tense, never predictive,
 *  never a setback. A load coming down is matched to demonstrated capability with
 *  the sets kept. */
function WhyLoadSheet({ units, onClose }: { units: 'kg' | 'lb'; onClose: () => void }) {
  const { t } = useCopy();
  const session = useSession();
  const app = useApp();
  /*
   * ⛔ THE COACH'S OWN CASE, NOT THE ENGINE'S REASON FIELDS — found in the 2026-08-03 audit, and it
   * is the FOURTH instance of one pattern: a surface still reading a number the deterministic engine
   * produced, after the coach became the thing that decides.
   *
   * `buildPlanFromCoach` writes a target with `exerciseId`, `setIndex`, `recommendedWeight`,
   * `recommendedReps`, `repBandLo`, `repBandHi` — and **no `reasonType` and no `reasonDelta`.** This
   * sheet read those two fields for its verdict and its magnitude, so on every coach-built workout
   * it answered "held · 0", whatever the coach had actually done to the load. The one screen whose
   * entire job is explaining the number was the screen misreporting it.
   *
   * `coachChangedCase` is where that question already has an answer — Today has used it since the
   * why-case shipped, measured off the current plan and the one before it. One home, two surfaces.
   */
  const [coachCase, setCoachCase] = useState<ChangedLiftCase | null>(null);
  const exId = session.currentExerciseId;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [now, before, log] = await Promise.all([
        loadWeekPlan().catch(() => null),
        db.loadCoachPlanPrev().catch(() => null),
        db.loadCoachLog().catch(() => null),
      ]);
      if (cancelled || !now || !exId) return;
      const said = (log ?? []).find((d) => d.ex === exId)?.say;
      setCoachCase(coachChangedCase(exId, now, before, said, units));
    })();
    return () => { cancelled = true; };
  }, [exId, units]);
  // displayWeekNumber: an extended first bucket (mid-week signup) is still the
  // learning week — the Why sheet keeps the learning note until it rolls.
  const week = displayWeekNumber(app.profile?.memberSince, app.weekOpenMs, Date.now());
  const target = session.currentTarget;
  const exName = exerciseDisplayName(session.currentExerciseId);
  if (!target) return null;

  // Week 1 is the LEARNING week (founder 2026-07-09): Hush is still getting to know the athlete, so
  // there is no up/down yet — pressing Why explains exactly that instead of a load change.
  if (week <= 1) {
    // TWO LINES, NOTHING ELSE (founder 2026-07-12). In week one there is no decision to explain
    // — there is no history to have made one from — so the sheet had been padding the silence
    // with the lift's name, a shield, and a paragraph about how I don't move loads on a single
    // session. All of that is answering a question the athlete did not ask. What they asked is
    // "why this load", and in week one the whole honest answer is: I don't know you yet, and
    // next week I will.
    return (
      <BottomSheet onClose={onClose}>
        <Legend style={styles.sheetLegend}>{t('whyLoad.legend')}</Legend>
        <Text style={styles.whyLearnTitle}>{t('whyLoad.learningTitle')}</Text>
        <Text style={styles.whyLine}>{t('whyLoad.learning')}</Text>
        <Button variant="primary" block label={t('whyLoad.got')} onPress={onClose} style={styles.whyGot} />
      </BottomSheet>
    );
  }

  const to = displayWeight(target.recommendedWeight, units) ?? 0;
  const deltaMag = coachCase
    ? Math.abs(Number(coachCase.delta ?? 0))
    : displayWeight(Math.abs(target.reasonDelta ?? 0), units) ?? 0;
  const unit = unitLabel(units);
  /*
   * The coach's verdict wins where there is one; the engine's fields remain the answer for a plan
   * built the old way from a `ProgramDay`. Neither is a fallback for the other's absence — they are
   * two eras, and a session belongs to exactly one of them.
   */
  const tone: 'up' | 'down' | 'hold' = coachCase
    ? coachCase.verdict
    : target.reasonType === 'increase' ? 'up' : target.reasonType === 'decrease' ? 'down' : 'hold';
  const toneColor = tone === 'up' ? up.stage : tone === 'down' ? down.stage : stage.ink1;
  const toneWash = tone === 'up' ? up.wash : tone === 'down' ? down.wash : color.fillSubtle;
  const verdict = tone === 'up' ? t('whyLoad.verdictUp') : tone === 'down' ? t('whyLoad.verdictDown') : t('whyLoad.verdictHold');
  const from = tone === 'up' ? to - deltaMag : tone === 'down' ? to + deltaMag : null;
  const line = tone === 'up' ? t('whyLoad.lineUp', { delta: deltaMag, unit }) : tone === 'down' ? t('whyLoad.lineDown') : t('whyLoad.lineHold');
  const icon: IconName = tone === 'up' ? 'trendingUp' : 'minus';

  return (
    <BottomSheet onClose={onClose}>
      <Legend style={styles.sheetLegend}>{t('whyLoad.legend')}</Legend>
      <View style={styles.whyHead}>
        <Text style={styles.whyName} numberOfLines={1}>{exName}</Text>
        <View style={[styles.verdictBadge, { backgroundColor: toneWash }]}>
          <Icon name={icon} size={14} color={toneColor} strokeWidth={2} />
          <Text style={[styles.verdictText, { color: toneColor }]}>{verdict}</Text>
        </View>
      </View>
      <View style={styles.whyNums}>
        {from != null ? (
          <>
            <Text style={styles.whyFrom}>{from}</Text>
            <Icon name="chevronRight" size={16} color={color.textTertiary} strokeWidth={2} />
          </>
        ) : null}
        <Text style={[styles.whyTo, { color: toneColor }]}>{to}</Text>
        <Text style={styles.whyKg}>{unit}</Text>
      </View>
      <Text style={styles.whyLine}>{line}</Text>
      <View style={styles.whyNote}>
        <Icon name="shield" size={16} color={color.textTertiary} strokeWidth={2} />
        <Text style={styles.whyNoteText}>{t('whyLoad.note')}</Text>
      </View>
      <Button variant="primary" block label={t('whyLoad.got')} onPress={onClose} style={styles.whyGot} />
    </BottomSheet>
  );
}

/*
 * ⛔ FIFTY-THREE ORPHANED KEYS CAME OUT OF THIS OBJECT (2026-08-19), along with the exec chip, the
 * two stage decorations, `setRow`'s undrawn slots, `chromeOrdinal`, `nextSetup` and an import of a
 * component deleted in August. None of it rendered; all of it read as live product to anyone
 * opening the file, which is the cost — a screen this size is edited by reading it first.
 *
 * ⚠️ `// @ts-nocheck` at the head is why none of it was ever reported. Nothing here is checked, so
 * a style nobody uses, a prop nobody reads and an import of a symbol that does not exist all sit
 * exactly as quietly as working code.
 */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: stage[0] },
  safe: { flex: 1 },
  // The watch-logged beat: the stage's own black, edge to edge, over a rest that keeps running.
  beatLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: stage[0] },
  center: { flex: 1 },

  // Stage chrome
  flex: { flex: 1 },
  // Tall enough that the rest ring can never come up and touch the control.
  stageBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 14 },
  // A soft graphite disc, not a bordered box: found when looked for, silent otherwise.
  // The chrome disc — 38px, a `.08` cream veil behind a `.12` rim (handoff 2.2).
  stageDisc: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(241,238,229,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageDiscPressed: { backgroundColor: 'rgba(241,238,229,0.14)' },
  /**
   * THE SIDES RESERVE EQUAL ROOM, SO THE CENTRE IS ACTUALLY CENTRED (founder, build 36 — A.6).
   *
   * `stageBar` is `space-between` over three children, which centres the middle one only when the
   * outer two are the same width — and they are not. The left holds ONE disc (pause, 38); the right
   * holds up to TWO (swap + form, 38 + 8 + 38 = 84). On the FIRST set of a lift, where the swap is
   * offered, the clock and the lift ordinal therefore sat 23 px left of centre. That is the screen
   * he photographed, and it self-corrected on set 2 when the swap disappeared — which is why it
   * read as "sometimes off" rather than as a bug.
   *
   * `flex: 1` on both sides makes them split the leftover evenly whatever they hold, so the centre
   * group lands on the axis for one disc, two, or none.
   */
  stageBarSide: { flex: 1, flexDirection: 'row', gap: 8 },
  stageBarRight: { justifyContent: 'flex-end' },
  /* The stage bar's centre slot. Tracking removed with `noTrackedHebrew` (2026-08-26): `center`
     is a translated position ("LIFT 1 / 6"), so this is a sans slot that can meet Hebrew. */
  stageBarCenter: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], textTransform: 'uppercase', color: stage.ink2, textAlign: 'left' },
  // The ordinal — the one thing in the bar that is READ, so it is sized to be read.
  //
  // SANS, not mono. "Exercise 1 / 6" is a sentence with a number in it, and the two-voice law gives
  // sentences to Hanken; mono is for what the instrument MEASURES. It also has a hard consequence
  // in Hebrew — JetBrains Mono carries no Hebrew, so "תרגיל" fell out to whatever font the OS
  // could find, in the middle of the one line that says where the athlete is. Tabular figures keep
  // the digits from dancing as the count climbs. Same face and same ink as the muscle group below,
  // which is what the founder asked for when he said "make it the same colour".
  // v7 2.2 sets it in the instrument's MONO at .14em — "LIFT 1 / 6" is a position, not a sentence,
  // and it sits on one line with the clock in the same face. (A Hebrew ordinal falls back to
  // Assistant through `Legend`; here the string is figures and a Latin word, so mono draws it.)
  /*
   * ── ⛔ ONE INSTRUMENT, TWO ROWS: THE SESSION, AND THIS LIFT ──
   *
   * The upper row is the lifts; the lower is the sets of the one she is on. Nested, not adjacent —
   * which is what they are. See the note where the SET band used to be.
   *
   * ⚠️ THEY MUST NOT LOOK ALIKE, or two rows of identical ticks read as one broken row. The session
   * is thin and quiet (context); the set is thicker and lit (now). Same width, so the second reads
   * as living inside the first.
   */
  /*
   * ── ⛔ THE ROW IS THE RAIL PLUS ITS FIGURE (2026-08-18) ──
   *
   * The count sits ON this row rather than in the chrome above it, and that placement is the union
   * the founder asked for: one instrument, one line, the drawing and its number. Put in the chrome
   * it would be a second reading of the same fact in a second place, which is the two-rows problem
   * that got the stacked version rejected in the first place.
   */
  /* The position, written — the one line left of the rail (2026-09-07). The caption's voice at the
     caption's size: a fact she glances at, not a heading, centred where the track was. */
  railRow: { alignItems: 'stretch', paddingHorizontal: 24, marginTop: 14 },
  railLine: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: stage.ink1, textAlign: 'center' },
  /* The figure, at the end of its own row. Tabular + a floor on the width so the rail does not
     shuffle sideways every time a digit lands. */
  // The chrome's centre group: [ordinal] · [elapsed] (handoff 2.2). A dim dot parts the ordinal
  // (where am I) from the clock (how long have I been here) — two facts, one line.
  stageBarCentre: { alignItems: 'center', gap: 3 },
  /*
   * ════ ⛔ 26 → 17, AND IT GIVES THE TOP OF THE SCREEN BACK ════
   *
   * FOUNDER, 2026-08-12: *"אם רצית להוריד את השעון או כל דבר אחר — אני נותן לך יד חופשית."*
   *
   * It was set at 26 on 2026-07-28 with a good argument — *"the clock is the one running number on
   * the screen and it goes on TOP, at its own size"* — and the argument has a hole in it that only
   * shows when you ask what the number is FOR. **Elapsed session time is the least actionable fact
   * on a working set.** She cannot spend it, she cannot beat it, and nothing she does about the bar
   * depends on it. It was the second-largest thing on the screen and the first thing in the eye's
   * path, ahead of the lift she is about to do.
   *
   * ⚠️ IT IS NOT DELETED, and that distinction matters. "How long have I been here" is a real
   * question between sets and at the end of a session, and a screen that cannot answer it forces a
   * pause just to look. It sits with the position it belongs beside — one quiet line, two facts,
   * which is what the line was before 2026-07-28 and is right for the reason that note gave: they
   * are two answers to the same small question, *where am I in this*.
   *
   * ⚠️ AND THE STACK STAYS, so the ordinal is still under it rather than beside it — Hebrew runs
   * long and a two-fact row wraps, which is what that ruling actually fixed.
   */
  stageBarClock: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 17, lineHeight: 21, color: stage.ink1, textAlign: 'center' },

  /*
   * ════ ⛔ ONE OBJECT, WITH THE AIR AROUND IT — NOT FOUR ISLANDS ════
   *
   * FOUNDER, 2026-08-12, on the first screenshot of this screen: *"אתה חותם עליהם כמושלמים?"*
   *
   * ── WHAT I DID WRONG EARLIER THE SAME DAY ───────────────────────────────────────────────────────
   * I measured `justifyContent: 'center'` producing 155 points of nothing above the content and 155
   * below, called it *"37% empty in two dead blocks"*, and spread the children with `space-evenly`.
   * The measurement was right and **the diagnosis was wrong.** That air was not a hole — it was the
   * margin around an object, which is exactly what a stage should have. What I then did was take the
   * emptiness that was correctly at the ends and distribute it BETWEEN the parts of the object:
   * 111 points between the lift's name and its load, 106 between the band and her sets.
   *
   * **I turned one instrument into four islands**, and the picture is what showed it.
   *
   * ── WHAT THE GOOD SCREENS OUTSIDE THIS CATEGORY ACTUALLY DO ─────────────────────────────────────
   * Spotify's Now Playing, Oura's readout, Nike Run Club, the Watch's own workout face — every one
   * is **a dominant object with everything else clustered tight against it**, and generous air on
   * the outside. None of them spaces its parts evenly down the screen; even spacing is what a page
   * of unrelated rows needs, and this is not that. Today IS that — four peer workouts — which is why
   * the same fix was right there and wrong here.
   *
   * So: centred again, and the internal gaps come DOWN rather than the outer ones. The muscle labels
   * the name, the name labels the load, the band belongs to the load, and her sets are that load's
   * history. One block. The screen's emptiness goes back to the edges where it reads as room.
   */
  /*
   * ⛔ `space-between`, AND THE ARGUMENT FINALLY LANDS ON THE RIGHT SIDE. It was `center` (a clump
   * with air at the ends), then `space-evenly` (four islands), then `center` again once the block
   * was one object. The block is FOUR bands now and they nearly fill the stage — so distributing is
   * no longer spreading the parts of one thing, it is giving four things their own space, which is
   * exactly what the founder asked for: *"אני רוצה לנצל את כל השטח ולתת לכל מרכיב את השטח שלו."*
   */
  /*
   * ⛔ THE BOTTOM GAP IS PADDING, AND IT HAS TO BE BOUGHT (founder 2026-08-12: *"למה החזרות כל כך
   * קרוב ל-COMPLETE SET?"*).
   *
   * `space-between` puts free space BETWEEN children and none after the last one — so the two upper
   * gaps measured 106 and 104 while the reps card sat 16 points off the act. Three equal-looking
   * seams and one that is a sixth of them reads as a mistake, because it is one.
   *
   * The bottom seam is `paddingBottom`, and paying for it takes it back out of the other two: they
   * settle around 75 and the card no longer leans on the button.
   */
  /*
   * ⛔ THE FREED HEIGHT GOES TO THE EDGES, NOT TO THE SEAMS (2026-08-22).
   *
   * Dropping the band from 92 to 62 frees 33 points of line box. Under `space-between` that would
   * have been handed straight to the two internal gaps — the demotion would have paid for wider
   * voids, which is the opposite of what it is for. The padding absorbs it instead, split top and
   * bottom, so **the seams stay exactly the sizes the founder last approved** (2026-08-12, on the
   * reps sitting too close to `Complete set`) and the room appears where it reads as room.
   *
   * ⚠️ `space-between` STAYS, and it is his instruction, not a default: *"אני רוצה לנצל את כל השטח
   * ולתת לכל מרכיב את השטח שלו"* — three children, three shares. What changed is the size of one
   * child, never the arrangement.
   */
  /*
   * ⛔ 75 → 40 AT THE FOOT (2026-08-26), AND THE OLD NUMBER'S REASON RETIRED WITH THE THING IT
   * PROTECTED. The 75 was measured when the last band was a 92-point POSTER figure whose glyphs ran
   * to the edge of their line box; it "ended exactly on the button's edge" and needed the air. The
   * band is a DIAL now — a 164-point instrument that ends in a tick strip with its own margin — and
   * the clearance was being paid for twice while the screen above it had to fit a lift's name, a
   * row of last time's figures and two wheels. 40 is the real gap, and the 35 points it returns are
   * what buy the row the founder asked for.
   */
  /*
   * ⛔ BACK TO `center`, AND IT IS THE FILE'S OWN 2026-08-12 RULING RETURNING TO FIT.
   *
   * *"every good screen outside this category is a dominant object with everything else clustered
   * tight against it, and generous air on the outside. None of them spaces its parts evenly down
   * the screen; even spacing is what a page of unrelated rows needs, and this is not that."*
   *
   * `space-between` was right for the four-band stage, where the children were peers. They are not
   * peers any more: the ATHLETE is the object and the name and the two fields are clustered on
   * her — so distributing put a hundred points of nothing above the figure and a hundred below it,
   * which is the "four islands" fault the same note records, with three islands instead of four.
   */
  stageBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 26, paddingTop: 18, paddingBottom: 28 },
  /* Who she is lifting: the eyebrow, the name, and a superset's second lift. One group. */
  identity: { alignItems: 'center', alignSelf: 'stretch' },

  /* `Arrive` wraps the set row in a View of its own, which would shrink-wrap and break the row's
     even columns — the stretch has to live on the wrapper, not only on the row inside it. */
  /* ⛔ 30/14 → 20/10 (2026-08-12). The stage grew a second full-width button and a third band; the
     footer's own generosity was the last ten points the content needed. Measured against the BOX
     this time, not the text inside it. */
  stageFooter: { paddingHorizontal: space.gutter, paddingBottom: 24, gap: 10 },
  /*
   * ════ ⛔ THE ACT NEVER MOVES (design review 2026-09-01) ════
   *
   * "Complete set" is pressed twenty-plus times a session, with the phone on the floor and a heart
   * at 150 — muscle memory is the whole interface there. But the controls UNDER it (the warm-up
   * offer, +15s) appear and vanish per beat, so the most-pressed button in the product changed its
   * y three times per lift. The variable content lives inside this fixed-height band now: present
   * or absent, the act above it stands still. Both footers share the band and the same
   * paddingBottom, so the act also holds one position ACROSS beats (set → rest → crossing).
   */
  footerBand: { height: 52, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },

  /* ── the session map (the rail's own sheet, 2026-08-26) ── */
  mapLegend: { marginBottom: 6 },
  mapHint: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textMuted, textAlign: 'left', marginBottom: 8 },

  /* The lift she is on: a faint well, so "now" is a place on the list and not only a word. */
  mapRowNow: { backgroundColor: 'rgba(241,238,229,0.05)', borderRadius: 12, marginHorizontal: -8, paddingHorizontal: 8 },
  mapRowLifted: { backgroundColor: stage[2], borderRadius: 12, marginHorizontal: -8, paddingHorizontal: 8 },

  mapClose: { marginTop: 18 },
  mapRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  mapName: { flex: 1, fontFamily: font.sans, fontSize: 17, color: color.textSecondary, textAlign: 'left' },
  mapNameDone: { color: color.textMuted },
  mapNameNow: { fontFamily: font.sansSemibold, color: color.textPrimary }, // rtl-ok — a MODIFIER composed onto mapName, which declares the start
  mapSets: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: 17, color: color.textMuted, textAlign: 'left' },
  // A notice is up: the footer holds its space and gives up its surface (nothing peeks out
  // from under the card, nothing under it can be pressed by mistake).
  footerStoodDown: { opacity: 0 },
  /* A disc past its moment: present, quiet, still answering (see StageBar.swapQuiet). */
  discQuiet: { opacity: 0.55 },
  /* The ear, open: the disc takes the moss (2026-09-07). */
  discLive: { borderRadius: 19, backgroundColor: 'rgba(143,176,122,0.18)' },
  /* What was heard, then what was done — the stage's quiet voice, centred under the chrome. */

  // Active set
  /* The muscle group — the lift's eyebrow. ⛔ It kept the ordinal's muted ink after everything around
     it was lit; at four metres it was the one line on the stage that vanished. */
  group: { marginBottom: 11, color: stage.ink1 },
  /*
   * ⛔ 29 → 36 (founder 2026-08-12, on the set screen). It was the SMALLEST thing on the stage apart
   * from its own eyebrow — smaller than the rep band under the load (30) and smaller than the set
   * figures at the foot (38). **The lift is the subject of the screen**; it was set below two things
   * that describe it.
   *
   * ⚠️ THE SIZE HERE IS THE ONE-LINE CASE ONLY. `adjustsFontSizeToFit` used to make 36 safe for a
   * long Hebrew name — and on iOS it also fitted the name to the block's HEIGHT, which the keypad's
   * slide and the `Arrive` animation squeeze for a few frames, so the name was sometimes drawn at
   * a size nobody can read from the bar (founder 2026-09-08). The call site now overrides
   * `fontSize`/`lineHeight` from the name's own length (`nameSize.ts`): 36 to 16 characters, 30 to
   * 30, 26 beyond — arithmetic, never a measurement, so no frame can move it.
   */
  exName: { fontFamily: font.sansSemibold, fontSize: 36, lineHeight: 42, color: stage.ink0, textAlign: 'center', maxWidth: 330 },
  // The second half of a superset: the SAME size as the lift she is on, in the quiet tone the unit
  // label wears — present as an equal, subordinate only in colour.
  supersetNext: { fontFamily: font.sansSemibold, fontSize: 36, lineHeight: 42, color: stage.ink2, textAlign: 'center', maxWidth: 330, marginTop: 2 },
  // Tapping the load reveals "why this load" — a quiet, intentional dim, never a button-like fill.
  // A.13 — the wash, not a fade: a control at 55% reads as disabled, not as pressed.
  // The equipment-native figure UNDER the hero: "7 kg a side". The number is a measurement (mono,
  // cream); the "a side / per hand" suffix is a word (sans, quiet). It rode inline beside the hero
  // until build 36, where every load past two whole digits pushed it off the screen — see the note
  // at the markup, and `heroFontSize` for the measurements.
  // A figure inside the hero's annex row, which centres its children — declared so the number
  // never lands on the physical left in Hebrew.
  // The hero IS the edit control — its door is a dashed pill (below), the pencil + caption inside it.
  /* ⛔ 34 → 22. The load is what the name above it names; a third of an inch of black between them
     made them two facts instead of one. */
  heroPressed: { opacity: press.opacity },

  // Instruction-first execution: the imperative chip (TO-LOAD) + the quiet confirmation (LOADED),
  // sitting directly under the load — the athlete's "what do I do now?".
  // Why / Δ — demoted below the instruction; quiet and optional, never competing with it.
  // minHeight keeps the quiet look while giving the tap a full 44pt target.
  // 3 · THE ENGRAVED REP-RANGE BAND (handoff 2.2) — a floor and a ceiling, drawn as a rule with
  // two moss end-ticks and a moss bar between them. Moss is spent exactly once per set screen, here.
  // 268-wide rule; the numbers hang off each end, and the legend rides above. The word "reps" that
  // used to sit between the two numbers is gone (founder 2026-07-29) — the legend already says it,
  // and the legend took the space it left (11 → 14).
  // The rule lost the row that carried "reps" underneath it: 58 → 44.
  // The engraved groove — a translucent-cream hairline the moss bar sits on top of (inset 20 to meet
  // the ticks, exactly under the bar — the mock's base line is NOT full-width).
  // The lit span between the ticks (inset 20 each side to meet them).
  /* ⛔ THE BASE STYLE WAS MISSING — `styles.addFifteen` resolved to `undefined` and the control
     rendered as bare centred text with no tap body, which is what the founder's rest screenshot
     shows. Its own pressed wash survived below, washing a shape that did not exist. Reconstructed
     as the quiet full-width text action it was: 44 of height for the finger, a radius for the wash. */
  /* The nudge line. It is held back by COLOUR, not by size — `stage.ink2` is the stage's quietest
     ink, and the floor is 17 for everything the athlete has to read (`typeHasAFloor`, the founder's
     own line, asked five times). A question set at 15pt in a gym, at arm's length, past a heavy
     set, is a question that was not asked. Centred over the full-width act it belongs to. */
  runningLong: {
    fontFamily: font.sans,
    fontSize: 17,
    lineHeight: 22,
    color: stage.ink2,
    textAlign: 'center',
    marginBottom: 10,
  },
  /* The known-fact line on the crossing card. It is the card's quietest ink and it sits under the
     racking instruction, because it is CONTEXT and the instruction is the act — but it is at the
     reading floor (17), because a number about her that she cannot read across a gym is not a
     number about her. */
  upKnown: {
    marginTop: 10,
    fontFamily: font.sans,
    fontSize: 17,
    lineHeight: 22,
    color: stage.ink2,
    textAlign: 'left',
  },
  /* `flexGrow/flexBasis` (not alignSelf:'stretch') — these pills live inside the `footerBand` ROW
     now: alone one takes the full width, and on a rest the warm-up offer and +15 share it. */
  addFifteen: { flexGrow: 1, flexBasis: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, paddingVertical: 10 },
  addFifteenPressed: { backgroundColor: 'rgba(241,238,229,0.06)' },
  /* The pressable passes the flex down to the figure — see `restFigure` for why the figure is the
     element that gives. Without this the slot sizes to content (zero) and the crossing draws blank. */
  crossingAthleteSlot: { flexGrow: 1, flexShrink: 1, minHeight: 0, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  /* paddingBottom 44 → 24, gap 12 → 10: the SAME geometry as `stageFooter`, so the act does not
     jump when a set hands over to a crossing — see `footerBand`. */
  crossingFooter: { paddingHorizontal: space.gutter, paddingBottom: 24, gap: 10 },
  addFifteenLabel: { fontFamily: font.sansSemibold, fontSize: 17, color: stage.ink0, textAlign: 'center' },
  // Size, leading and tracking all come from `heroType` at the markup — they move together with
  // the glyph count, and the leading must never fall under the size or RN clips the digit tops.
  // THE LIT HERO (v7 2.2): 132px mono at -.05em in the BRIGHT cream, with a wide soft glow. It is
  // the one thing on the stage standing fully in the light — everything else rests in shadow.
  /*
   * ⛔ THE GLOW WAS DRAWING A GREY BOX (founder 2026-08-05, from two screenshots).
   *
   * This carried `textShadowRadius: 50` with no offset — intended as a halo, on the theory that
   * the hero is "standing in the light". **iOS rasterises a text shadow over the glyph's BOUNDING
   * RECTANGLE**, so at that radius it does not read as a glow at all: it fills a soft grey
   * rectangle behind the digits, visible on both the load and the cardio clock, which reuses this
   * style. He photographed it twice without naming it, because it looks like a component rather
   * than a bug.
   *
   * ⚠️ AND THE GROUND IS BLACK NOW. Whatever the halo was buying against `#131210`, it buys
   * nothing against zero — the cream figure is already the brightest thing on the screen by the
   * largest possible margin. Deleted rather than tuned.
   */
  // The whisper under a bodyweight hero — a quiet fact, never a headline (founder 2026-07-11).
  /* ── 2.4d · REST — LEARNED. A double ring holding the pace she took, and the plan moving. ── */
  paceBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, paddingHorizontal: 40, marginTop: -20 },
  // Two rings, 14 apart: the outer in moss (this is a rest), the inner a plain cream rule.
  paceRing: {
    width: 186,
    height: 186,
    borderRadius: 93,
    borderWidth: 1.5,
    borderColor: 'rgba(169,196,159,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paceRingInner: {
    width: 158,
    height: 158,
    borderRadius: 79,
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  paceValue: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 46, lineHeight: 50, letterSpacing: -0.92, color: stage.ink0, textAlign: 'center' },
  // What it WAS: struck through, in the ink of something no longer in force.
  paceWas: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 20, color: '#57534a', textDecorationLine: 'line-through', textAlign: 'left' },
  /* ── 2.3b · EXERCISE DONE — a beat, centred, that hands over by itself. ── */
  /* ⛔ CENTRED, LIKE EVERY OTHER BEAT IN THE FAMILY (founder's four screenshots, 2026-08-12).
     `paddingTop: 28` pinned the lift-done beat to the top of the stage while the set-landed beats
     were vertically centred — **two anchors inside one family**, so his screenshots showed the same
     instrument in two different places on the screen. It is one composition now. */
  beatHead: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 30 },
  // The lift, named, in the coach's serif — the beat's subject, drawn whether or not there is a
  // band under it. 26 rather than 29: the pips above it are the mark, this is the caption to them.
  /* ⛔ 26 → 34 (founder 2026-08-12). On `2.3g` this line and the pips ARE the screen; at 26 it read
     as the caption of a graphic rather than the statement the beat exists to make. It matches the
     band beat's own sentence in voice and outranks it in size, which is the right order: the LIFT
     ending is the larger news, where its last set fell is the detail. */
  beatDoneTitle: { fontFamily: font.serif, fontSize: 34, lineHeight: 42, color: stage.ink0, textAlign: 'center', maxWidth: 330 },

  /* ⛔ THE PIP ROW IS DELETED (founder, 2026-08-26 — see `SetRing` and `ExerciseDone`). `donePips`,
     `donePip` and the 334-point `donePipsWrap` the old band mark bequeathed it all went with it:
     the ring the athlete filled one set at a time IS the statement now, and a second row of green
     marks under it would say the same thing twice in two vocabularies. The legend survives — the
     ring draws the count, the line names it. */
  doneWords: { alignItems: 'center', gap: 16 },
  /* The count, named — the ring draws it, this says what it is. Renamed off `donePipsLegend`
     with the pips it was named for: a style named after a deleted instrument is a false map. */
  doneCount: { color: stage.ink1 },

  /* ── THE HAND-OVER — how long the beat intends to hold the screen. ── */

  // "SET 2 OF 4" — the position, in the chrome's mono, 30px under the band.
  // The chained lift, quieter than the position it follows — news, not an instruction.
  // Under the position, in the quietest ink on the stage — a footnote, not a second fact.
  /*
   * ════ EVERY SIZE BELOW IS A FLOOR THE FOUNDER SET, NOT A TASTE ════
   *
   * *"There can't be a lot of copy and certainly not small type — everything has to be clear and
   * exact. You have a tendency to use small type that can barely be seen."* (2026-08-04)
   *
   * The ask is 30 — twice the size of the two numbers the deleted band held. The set figures are 34,
   * the ghosts the SAME 34 at 38% opacity (dimmed, never shrunk: a small number is unreadable, a
   * quiet one is merely quiet), and the last-load line is 13 where its predecessor was 10.5.
   */
  /*
   * ⚠️ THIS WAS AN ORPHAN. It read `{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }` —
   * the CONTAINER of the deleted band graphic, left behind on the `<Text>` that replaced it. A
   * flex-row style on a Text sets nothing; the ask rendered at the platform default, on the second
   * most important figure on the screen, directly beneath a comment claiming it was 30.
   *
   * The founder photographed it four times and called it small type. It was not a taste I was
   * defending — it was a style that got orphaned, which is worse, because nothing was deciding it
   * at all. `typeHasAFloor` can see it now, and 30 is what the comment always claimed.
   */
  /* ── THE CALIPER — the edit door, drawn as the brand's own range mark. ──
   *
   * Two ticks with the editable values between them. It replaces a dashed pill that carried the
   * words "TAP THE WEIGHT TO EDIT", which was a label explaining a control — the founder's own law
   * against itself — and which could only ever teach on the first set of a session because after
   * that it was noise. The frame teaches on every set and says nothing.
   *
   * ⚠️ The ticks are the same 1.6 rule at the same 32% the wordmark uses, so the glyph is
   * recognisably the same object at a different scale rather than a decoration that resembles it.
   */
  /*
   * ════ ⛔ THE PRESCRIPTION, VERTICAL — SO BOTH FIGURES CAN BE HUGE ════
   *
   * FOUNDER, 2026-08-12: *"אולי נעשה את זה אנכי, כלומר אחד מעל השני עם הפרדים ברורים, וכך תוכל
   * להגדיל משמעותית כל אחד מהם … יש לנו כאן חלל ענק למעלה ולמטה לא מנוצל ואני שואל למה? זה חדר כושר
   * הכל צריך להיות גדול וברור מהרגע הראשון."*
   *
   * Side by side, the two figures had to share 330 points of width, which capped them at 64 — and
   * "8–10" at 64 is four glyphs wide and already at the edge. Stacked, each one owns the full width
   * and the ceiling is the SCREEN'S HEIGHT, which the screen had 340 spare points of.
   *
   * ⚠️ 92, AND THE LABEL SITS BESIDE THE FIGURE RATHER THAN UNDER IT. A label on its own line costs
   * 22 points of the height that is buying the size in the first place; on the baseline it costs
   * nothing and reads as part of the same statement — "ninety-two kilos", not "92" and then "KG".
   */
  /* One band: a rule to open it, a heading, and the figure it names. */
  /*
  * ⛔ I READ AN OVERLAP HERE THAT DOES NOT EXIST, AND THE REASON IS WORTH KEEPING (2026-08-12).
  *
  * The bands measured ten points INSIDE `Complete set`, so I shrank the set figure and the footer's
  * padding to "fix" it. Then I measured the transform: `opacity: 0, translateY: 10` — every band was
  * sitting in `Arrive`'s PRE-ARRIVAL state, because the review harness never composites a frame and
  * the animation had never started. **The ten points were the rise, not a collision.**
  *
  * ⚠️ A LAYOUT MEASUREMENT TAKEN DURING AN ANIMATION IS NOT A LAYOUT MEASUREMENT. Twice in one hour
  * I read a resting position as a final one.
  *
  * ⚠️ AND THE SAME READING FOUND SOMETHING REAL: at rest these bands are `opacity: 0`. On a device
  * `useNativeDriver: true` runs the arrival on the UI thread and it always completes — but anywhere
  * frames do not come, **the live set screen is blank.** That is the third time today an animation's
  * un-run state has hidden or erased content (the rulers, the muscle bars, the sweep), and this one
  * is on the screen she is holding a barbell in front of.
  *
  * The clearance below is REAL and is kept: the last band ended exactly on the button's edge once
  * the rise was subtracted, which is a figure kissing a control.
  */
  /*
   * ════ ⛔ THE BANDS HAVE BODIES (founder 2026-08-12): *"אני כן ארצה שתיתן לרצועות גוף כרטיס
   * והגבהה כפי שהצעת."* ════
   *
   * They were hairline rules over centred text — precise, legible, and four rows of type on black
   * with nothing that had an EDGE. Today reads better than this screen did for exactly that reason:
   * it has objects. These are objects now.
   *
   * ⚠️ AND THIS BENDS A LAW THE PRODUCT WROTE FOR ITSELF, so it is named rather than slipped in:
   * *"nothing is a card on the stage — the stage itself is lit, and emphasis is standing in that
   * light versus resting in shadow"* (v7, 2026-07-22). That rule was made when the stage held ONE
   * lit object and everything else was chrome. It holds two peers now, and two peers with no edges
   * are a list. The elevation still means what it always meant — distance from the ground — it is
   * simply spent on both, because both are the instruction.
   */
  bandArrive: { alignSelf: 'stretch' },

  /*
   * ════ THE ATHLETE'S BOX, AND WHY IT IS EXACTLY THE BAND'S BOX ════
   *
   * 164 is `WHEEL_HEIGHT.xl` — the wheel that stands here when she asks for it — and the caption
   * row underneath answers the band's own heading + per-side sub-line. Same total, so the slot's
   * two occupants swap without a single point of the stage moving. A control that is revealed by a
   * tap and shoves the rest of the screen is the reason "reveal" is usually the wrong pattern; it
   * is only right when the box was already reserved.
   *
   * ⚠️ THE FIGURE IS `16:10` AND IT IS THE WIDTH THAT IS BINDING. At the stage's 338 points of
   * usable width the frame comes out 211 tall, so it is HEIGHT-capped at 220 and letter-boxes with
   * air either side — which is the correct trade: a hero that grew to its natural width would take
   * the rep band's room, and the rep band is the instruction.
   */
  athleteSlot: { alignSelf: 'stretch', alignItems: 'center' },
  /* The technique door's handle — the slot's end corner, under the figure's feet. */
  demoHint: { position: 'absolute', bottom: 6, end: 10, opacity: 0.9 },

  /*
   * ════ THE PRESCRIPTION ROW — two cells, one rule, sharing the width ════
   *
   * `space-around` rather than `space-between`: at two children, between pins them to the gutters
   * and the pair stops reading as one statement. Around gives each cell its own half and the
   * figures land near the thirds, which is where two numbers that belong together sit.
   *
   * ⚠️ A CELL DOES NOT SHRINK WHEN ITS TWIN LEAVES. While a wheel is open only one cell is drawn,
   * and `flex: 1` on each keeps the survivor exactly where it was standing instead of sliding to
   * the centre — the athlete's slot is what changed, and nothing else on the stage may move with it.
   */
  rxRow: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'stretch', gap: 10 },
  /* The way back to the prescription — a quiet line, 44pt with its hitSlop, under the fields. */
  restoreRow: { alignSelf: 'center', minHeight: 32, justifyContent: 'center' },
  /* The board at the crossing (2026-09-07): the lifts still ahead, one chip each, under the card. */
  restoreText: { fontFamily: font.sans, fontSize: 17, color: stage.ink2, textDecorationLine: 'underline', textAlign: 'center' },
  /*
   * ⛔ A FIELD HAS TO LOOK LIKE A FIELD. The founder read a muted caption as a deleted feature
   * (*"המשקל נעלם מהמסך כך שאי אפשר לשנות אותו"*), and the size alone did not fix it: a big number
   * on a black ground is still just a big number. A soft well says "this is a thing you press"
   * without a border (which would read as a web form) and without a label (which this stage bans).
   */
  rxCell: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(241,238,229,0.04)' },
  /* Which field the pad is filling. A wash, not a border: a rule around a cell would read as a
     text input from a form, and this stage has never drawn one. */
  rxCellOpen: { backgroundColor: 'rgba(241,238,229,0.11)' },
  /* The em-dash is not a number and must not be lit like one — it is the absence of an answer. */
  rxFigureEmpty: { color: stage.ink2 },
  /* The word and its pencil on one baseline — flex, so RTL flips them with everything else. */
  rxHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rxHead: { color: stage.ink1 },
  rxFigureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  /* 46 is the gym floor for a figure that is an INSTRUCTION rather than a caption. The wheels this
     replaced ran their active numeral at 78; a figure that is read rather than turned does not need
     the wheel's tier, but it does need to be unmistakably the subject of its own block. */
  /* ⛔ NO `fontSize` AND NO `lineHeight` HERE — they come from `rxType`, which is the rule this
     screen must CALL rather than restate. See `domain/loadPresentation`'s third tier for the
     arithmetic, and `loadPresentation.test` for the week-long clip that made it a law. */
  rxFigure: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], color: stage.ink0, textAlign: 'center' },
  rxFigureDelta: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 17, lineHeight: 51, textAlign: 'center' },
  /* BODYWEIGHT keeps the block's shape where the number would be (founder, 2026-08-12) — smaller,
     because a word at 46 in Hebrew runs past its own cell. */
  rxWordSm: { fontFamily: font.sansSemibold, fontSize: 26, lineHeight: 51, color: stage.ink0, textAlign: 'center' },
  /* 15 → 17: the app's measured type floor (`typeHasAFloor`), which a gym caption is exactly
     the kind of line that tries to slip under. */
  rxSub: { fontFamily: font.sans, fontSize: 17, lineHeight: 21, color: stage.ink2, textAlign: 'center' },
  rxSubFig: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 17, color: stage.ink1, textAlign: 'center' },
  /* ════ last time, set by set (2026-09-07) ════
     A quiet strip under the two fields: the legend at the start, then one cell per set she did,
     `load×reps` in the mono, the set she is on now raised in a faint well. Read, never pressed —
     it lives in the body, not the foot. */
  lastRow: { alignSelf: 'stretch', gap: 8, marginTop: 6 },
  lastLegend: { color: stage.ink2 },
  lastCells: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  lastCell: { minWidth: 58, paddingHorizontal: 10, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(241,238,229,0.04)' },
  lastCellNow: { backgroundColor: 'rgba(241,238,229,0.12)' },
  lastFig: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: 17, color: stage.ink2, textAlign: 'center' },
  lastFigNow: { fontFamily: font.monoMedium, color: stage.ink0, textAlign: 'center' },

  /*
   * ⛔ `aspectRatio` FROM THE FRAME, NEVER A LITERAL HEIGHT — and it has now been wrong twice in
   * the same place, each time by about a hundred points of nothing.
   *
   * The `<Svg>` inside carries a viewBox and `preserveAspectRatio` defaults to *meet*, so it fits
   * INSIDE whatever box it is given and centres itself in the remainder. `height: 220` on a
   * 338-point stage drew 338 × 211 and left 52 points of dead air above the drawing and 52 below.
   * Fixing that with the SHARED 16:10 ratio then left a different hole: 16:10 reserves the top of
   * the frame for the rigs that stand up, so a bench press filled 115 of its 187.5 units and the
   * stage was distributing its children around the gap.
   *
   * `STAGE_FRAME_ASPECT` is the fitted frame's — content-centred, one scale for the whole
   * catalogue, and the number is derived where the frame is (`motion/frame.stageFrame`) so the two
   * cannot drift.
   */
  /* 88%, same reason as `restFigure`: the rig's floor must not run edge-to-edge. */
  athleteFigure: { width: '88%', aspectRatio: STAGE_FRAME_ASPECT },
  /*
   * ⚠️ THE HEIGHT IS THE FRAME'S OWN RATIO AND NOTHING ELSE — see `athleteFigure` for why any
   * literal height here is dead air rather than size. The seated body fills 115 of the authoring
   * frame's 187.5 units of height and 107 of its 300 across, so the drawn athlete is about 61 % of
   * the box's height and 36 % of its width whatever the box is.
   *
   * ⛔ MEASURED ALTERNATIVE, REJECTED: cropping the frame tight around the body (x 76–256) would
   * nearly double the figure. It needs a per-rig crop on `MotionFigure`, and the 136 exercise rigs
   * genuinely use the full width — measured, they span x 29–299 — so the crop would exist for these
   * two poses alone. Worth building when this direction is settled; not worth an API today.
   */
  /* ⛔ THE FIGURE FLEXES, THE INSTRUMENTS DO NOT (design review 2026-09-01). A fixed
     `width:'100%'` box at the stage aspect is 298 points on a 390 screen — and a CROSSING adds a
     card and a taller footer around it, so the column overflowed 844 and painted the clock over
     the lift rail and the act over the card ("הסט שלך כאן לוקח..." cut mid-sentence). The figure
     is the one element that can give: it is an SVG on a viewBox, so it shrinks clean. It absorbs
     the free height up to its old size and yields it back on a small phone. */
  /* maxWidth 88%: the rig's floor line runs the full width of its frame BY LAW (motion/frame —
     "a floor extends past a photograph"), so a full-bleed figure drew that floor edge-to-edge and
     it read as a hard seam splitting the screen (design review 2026-09-01). Kept short of the
     edges it reads as what it is — the floor the athlete stands on. */
  restFigure: { flexGrow: 1, flexShrink: 1, minHeight: 0, maxHeight: 298, maxWidth: '88%', aspectRatio: STAGE_FRAME_ASPECT, marginTop: 2 },
  /* Number and delta on one baseline, the delta in its own direction's colour — the same pairing
     the band makes 60 points higher, at the size a caption earns. */
  loadCaptionRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  loadCaption: { fontFamily: font.sans, fontSize: 19, lineHeight: 24, color: stage.ink1, textAlign: 'center' },
  loadCaptionFig: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 20, color: stage.ink0, textAlign: 'center' },
  loadCaptionDelta: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 17, lineHeight: 24, textAlign: 'center' },
  /*
   * ⛔ 17 → 22, AND ink1 → ink0 (founder 2026-08-12): *"תגדיל את המלל שלידם ותשנה להם צבע."*
   *
   * With the cards gone the labels are the only thing naming these figures, and they were 17 points
   * of #a8a290 — a caption size in a secondary ink, on a screen read from across a room.
   *
   * ⚠️ FULL INK, AND THE HIERARCHY IS UNHARMED, because it was never being carried by colour: the
   * figure is 92 and the label is 22. **Rank a thing once.** Dimming a word that also has to be read
   * at four metres is ranking it twice and paying for it in legibility — the same mistake that made
   * the rep band both small and quiet.
   */
  /*
   * ⛔ AND 22 → 26 (founder, 2026-08-26): *"הגדלת את הגודל של הסרגלים אבל את המלל מעליהם השארת קטן
   * — למה?! הכל צריך להיות ברור בזמן אימון תגדיל את המלל."*
   *
   * The same fault as the one above, one redesign later and from the opposite end. The figures grew
   * — the posters became `xl` dials, 164 points tall with 78-point numerals — and their headings did
   * not move, so the ratio between the instrument and the word naming it went from 92:22 to 78:22
   * on an object more than twice the height. **A label does not stay legible by staying the same
   * size; it stays legible by keeping its distance to the thing it names.**
   */
  cardLabel: { color: stage.ink0 },
  /* The loading instruction, under the heading it used to hang off. See the note at the markup:
     one step down the ladder from the heading, on the stage's secondary ink, so it reads as a
     caption of the figure below rather than as a second title. */
  rxPerSide: { color: stage.ink1, marginTop: 3 },
  /*
   * ════ ⛔ THE CARDS ARE GONE, AND THEY WERE MY IDEA (founder 2026-08-12) ════
   *
   * *"האם הכרטיסים האלה אכן הכרחיים ומשדרגים את המסך? כרגע זה נראה חיוור … לדעתי צריך להוריד אותם
   * ולעצב את המלל שלידם בצורה שתהיה ברורה. זה חדר כושר אתה חייב להבין את זה."*
   *
   * I proposed them, he agreed to try, and they were tried twice — `stage[1]` with no edge, then
   * `stage[2]` with a hairline. **Both were pale, and the second was pale for a reason no amount of
   * tuning fixes:** any fill light enough to read as a surface against absolute black is also light
   * enough to sit ON the figure it holds, and any fill quiet enough not to is invisible. A dark stage
   * does not have a card in it. The v7 law said so — *"nothing is a card on the stage"* — and I bent
   * it on a hunch rather than an argument.
   *
   * What carries the screen instead is what was carrying it before: TYPE, at gym size, on nothing.
   * The rule opens the band, the heading names it, the figure is the fact.
   */
  band: { alignSelf: 'stretch', alignItems: 'center', gap: 2 },
  /*
   * ⛔ THE RULES ARE GONE (founder 2026-08-12): *"השאלה היא האם להוריד את הקווים האלה שבינהם."*
   *
   * My answer is yes, and the reason is that they had already been made redundant by the fix before
   * them. A separator exists to say *these are two different things* — and when the headings were 17
   * points of muted ink, nothing else was saying it. They are 22 points at full strength now:
   * **WEIGHT and REPS separate the bands by being read.**
   *
   * ⚠️ AND TWO SEPARATORS FOR ONE JOB IS NOT BELT AND BRACES. It made the stage read as a form —
   * ruled rows, boxed values — which is exactly the "table that lost its table" the caliper was
   * deleted for. The air between the bands is the separator; there is a lot of it, and it is free.
   */
  /* ⛔ BODYWEIGHT, where a number would be. Sans — it is a WORD, and mono has no Hebrew to draw
     "משקל גוף" with at all (`monoCarriesNoWords`). Set below the figures because it is six times
     their glyph count and the two bands must still read as a pair. */
  rxWord: {
    fontFamily: font.sansSemibold,
    fontSize: 46,
    lineHeight: 56,
    /* ⛔ THE TRACKING IS GONE (2026-08-27), and at this size that is the correction, not a loss.
       It sat at +1pt: display type wants LESS letter-spacing than body type, never more, and this
       word is 46pt — so the number was working against the size it was set at even in English. In
       Hebrew it did the thing the type lint exists to forbid, on the largest word in the session. */
    color: stage.ink0,
    includeFontPadding: false,
    textAlign: 'center',
  },
  /* The range instrument under the band — the brand mark, wide, with the moss landing dot. */
  /* The numbered band: end figures either side of the mark, quiet — the instruction, not the act. */
  /* A dial inside `band` (alignItems: center) must claim the row itself — a shrink-to-fit wheel
     has no width, and a wheel with no width lays out no numerals. */
  stageDial: { alignSelf: 'stretch' },
  /* The heading and its news, on one line — and the heading keeps the axis. See the markup. */
  headRow: { flexDirection: 'row', alignItems: 'center' },
  rxDeltaAbs: { position: 'absolute', end: 0, top: 0 },
  /* A step behind the heading it annotates — it reports a change, it is not a quantity to act on. */
  rxDelta: {
    fontFamily: font.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'left',
  },
  /* How to build the load. The figure is a measurement (mono); "a side" is a word (sans). */
  /*
   * ⛔ THE LOADING LINE READS AS AN INSTRUCTION NOW (founder 2026-08-12: *"ה-7 קילו לכל צד נראה קטן
   * וחיוור"*).
   *
   * It was 17 points of muted sans hanging under the label column — a footnote about the load rather
   * than the one thing she has to DO with it. **She reads this standing at the rack with plates in
   * her hands.** 24 points, tracked, uppercase like every other instruction on the stage, the figure
   * at full ink and the words a step behind it.
   */
  /*
   * The edit control. A hairline outline that hugs its label — it must read as a button and must
   * never read as the ACT, which is cream, full width and pinned to the foot of the stage.
   */
  /* The act's twin: `Button` already draws the geometry, so this only lights its edge. The variant
     (`onstageGhost`) carries the fill and the pressed wash. */
  /* The delta rides the hero's own baseline — no line of its own, because it has no vertical cost. */
  /*
   * ⛔ `marginTop: 'auto'` MADE THE EMPTY MIDDLE THIRD (founder 2026-08-05's screenshot).
   *
   * `stageBody` centres its children. An auto top-margin on the LAST child consumes every spare
   * point in the column — so the name, the load and the ask were pinned to the top of the stage,
   * this row was pinned to the bottom against the button, and 300 points of black sat between
   * them. It also put the set figures directly under `Complete set`, which is the second half of
   * what he photographed: *"only the weight appears, and the reps from the previous workout are
   * right at the bottom on top of COMPLETE SET."*
   *
   * One number, two complaints. It is a normal gap now, and the column centres as a whole.
   */
  /* ⛔ 30 → 26, and it is the load's HISTORY — it belongs to the block above it, not adrift below. */
  /* A set she has not reached: present, and saying nothing. */
  /* Last time's number, still standing in the slot: dimmed rather than shrunk. A small number is
     unreadable; a quiet one is merely quiet — the founder's floor, applied to a ghost. */
  /* ⚠️ CREAM, not moss. It marks WHERE SHE IS, which is not a decision the app made — and the
     accent on this stage is now reserved for a thing that happened. */
  /* ⚠️ SANS. It holds a translated phrase ("LAST TIME · …") and mono cannot draw Hebrew at all —
     the same reason its predecessor was sans, caught again by `monoCarriesNoWords`. */
  // Ghost actions
  // Logged beat
  /* ── the capture beat (2026-08-26): the set, written — nothing judged ── */
  capWrap: { alignItems: 'center', gap: 30 },
  capBlock: { alignItems: 'center' },
  /* ── THE LIFT'S RING (see `SetRing`) ─────────────────────────────────────────────────────────
     The box the arcs are drawn in, and the anchor everything inside the circle centres on. The
     halo is absolutely positioned against it, so the bloom leaves from the ring's own edge. */
  capRing: { width: 236, height: 236, alignItems: 'center', justifyContent: 'center' },
  capRingCore: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  /* The bloom: the ring's own outline, one stroke wide, running outward as it dissolves. */
  capHalo: {
    position: 'absolute',
    width: 236,
    height: 236,
    borderRadius: 118,
    borderWidth: 2,
    borderColor: up.stage,
  },
  /*
   * ⛔ THE STRIKE IS THE GROUND UNDER THE TICK NOW, NOT THE TICK ITSELF (2026-08-26).
   *
   * It was a 46-point moss disc with a 22-point cream check punched out of it — a filled mark, at
   * the size of a list-row tick, standing alone on a 393×852 stage. Inside the ring that reading
   * inverts: the RING is the earned moss, so a second solid moss object at its centre would be two
   * statements of the same colour and the tick would have nothing to be drawn ON. So the disc is a
   * moss WASH — the faintest ground the palette has — and the tick is the lit stroke over it.
   *
   * ⚠️ `theBeatIsNotAFootnote` reads this literal width. It was 46; it is 148, because the target
   * the law is protecting grew with the beat rather than shrinking back into it.
   */
  capDisc: { width: 148, height: 148, borderRadius: 74, backgroundColor: signal.wash, alignItems: 'center', justifyContent: 'center' },
  capLegend: { marginTop: 2 },
  capFigures: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 66,
    lineHeight: 74,
    letterSpacing: -2,
    color: stage.ink0,
    includeFontPadding: false,
    textAlign: 'center',
  },
  capUnit: { fontFamily: font.monoMedium, fontSize: 24, letterSpacing: 0, color: stage.ink2, textAlign: 'center' },
  capTimes: { fontFamily: font.mono, fontSize: 34, letterSpacing: trackingPx(34, tracking.figure), color: stage.ink2, textAlign: 'center' },
  loggedRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  /* The record, said at the bar — one accent word, breathing room below. Its figure is DELETED; see
     the note at `recordLine` for why saying the number here was saying it twice. */
  recordRow: { alignItems: 'center', marginBottom: 22 },
  // LIT moss on the dark stage (v7 shows #A9C49F). `up[0]` is the PAPER moss — near-invisible here;
  // this screen was never part of the READOUT ladder inversion, so it silently held the wrong rung.
  // Up next card
  // A crossing between two lifts: one centred legend, 76 down from the top of the frame.
  // Form / Swap at a crossing — an equal pair of 52px outlines.
  // The rest stage: the ring centred in the space it owns, the up-next card at the 26px gutter.
  /* ⚠️ A GAP, NOW THAT THE RING IS OFF. Centring three loose children used to be right when the
     middle one was a 240-point ring that owned the screen; with a clock, a figure and a card it
     let them drift apart. The gap holds them as one column. */
  restBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  /* 40 → 22 (founder, 2026-08-31: *"תעלה קצת את הכרטיסייה של התרגיל"*) — the ring's removal
     freed the room and the card should take it, not the air above it. */
  upNext: { marginTop: 22, width: '100%', paddingHorizontal: 26, gap: 10 },
  upCard: {
    backgroundColor: 'rgba(241,238,229,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.16)',
    borderRadius: 22,
    paddingVertical: 24,
    paddingHorizontal: 22,
  },
  upRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  upInfo: { flex: 1, minWidth: 0, gap: 7 },
  upLegend: { color: stage.ink1 },
  upName: { fontFamily: font.sansSemibold, fontSize: 22, lineHeight: 27, color: stage.ink0, textAlign: 'left' },
  upRight: { alignItems: 'flex-end', marginStart: 14, gap: 7 },
  upWeight: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale['2xl'], color: stage.ink0, textAlign: 'left' },
  // Same slot, the other voice: the word "bodyweight" where a figure would be (and a size down —
  // a word needs the room a two-digit number does not).
  // A MODIFIER composed onto `upWeight` (which declares the logical start); it only swaps the face
  // + size when the load is a word ("Bodyweight"). It never renders alone.
  upWeightWord: { fontFamily: font.sansSemibold, fontSize: textScale.md }, // rtl-ok
  upWeightUnit: { fontFamily: font.mono, fontSize: textScale.sm, color: stage.ink2, textAlign: 'left' },
  /* The crossing card's loading line (finding #2) — the stage's `rxSide` voice, quieter. */
  /* No family and no tracking here — both are decided per string by `legendVoice`; a style with no
     family inherits the app's sans, which is the correct default for a Hebrew line. */
  upSide: { fontSize: UP_SIDE_SIZE, color: stage.ink2, marginTop: 6, textAlign: 'left' },
  upSideMono: { fontFamily: font.mono },
  upSideValue: { color: stage.ink1 },
  /* Still ahead (finding #9): a label and a line of names, dimmest thing on the card. */

  // Sheets
  sheetLegend: { marginBottom: 8 },
  /* ════ ⛔ THE END SHEET IS A DECISION, AND IT WAS SET LIKE A TOOLTIP (founder, 2026-08-12) ════
     *"למה חלונית END WORKOUT נראת ככה ולא גדולה וברורה יותר?"* — a 22-point question over 17-point
     body copy, in the smallest sheet the component draws, asking her to end the workout she is
     standing in. It is the most consequential thing this screen ever asks. */
  sheetTitle: { fontFamily: font.sansSemibold, fontSize: 30, lineHeight: 38, letterSpacing: trackingPx(30, tracking.tight), color: color.textPrimary, marginTop: 6, marginBottom: 14, textAlign: 'left' },
  sheetBody: { fontFamily: font.sans, fontSize: 20, lineHeight: 29, color: color.textSecondary, marginTop: 4, marginBottom: 26, textAlign: 'left' },
  sheetActions: { gap: 12, paddingBottom: 6 },

  // 2.0 · THE FIRST FOUR — a card FLOATING on the dimmed stage, not a sheet stuck to its floor.
  calScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,14,12,0.62)' },
  calCard: {
    position: 'absolute',
    left: 22,
    right: 22,
    bottom: 44,
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.12)',
    borderRadius: 28,
    paddingHorizontal: 26,
    paddingTop: 28,
    paddingBottom: 26,
    gap: 16,
    overflow: 'hidden',
  },
  calLegend: {},
  /* 34/37 → `ramp.head` (2026-08-26). Thirty-four was a size this card invented for itself, four
     points from a rung the app has and two from another it uses elsewhere. And 37 over 34 is a 1.09
     line box — very tight for a Hebrew heading that wraps, which this one does. */
  calTitle: { fontFamily: font.serif, fontSize: ramp.head, lineHeight: rampLine.head, color: stage.ink0, textAlign: 'left' },
  calBody: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 23, color: stage.ink1, textAlign: 'left' },
  /* ⛔ INFORMATION, NOT OPTIONS (design review 2026-09-01). Bordered pills are this product's
     unselected-choice idiom — three of them in a row on a card that says "I learn while you use"
     read as a selector nobody could operate. The border goes; what remains is a quiet inventory
     line: glyph + word, wrapping from the start edge so a third item never orphans centred. */
  calChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', columnGap: 18, rowGap: 8 },
  calChip: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  calChipText: { color: '#c9c4b4' },
  calFootnote: { fontFamily: font.sans, fontSize: textScale.sm, lineHeight: 20, color: stage.ink2, textAlign: 'left' },

  // Why this load (the in-session, single-line cousin of the Why triple)
  whyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6 },
  whyName: { flex: 1, fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, textAlign: 'left' },
  verdictBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 11, borderRadius: radius.full },
  verdictText: { fontFamily: font.sansSemibold, fontSize: textScale.xs, textAlign: 'left' },
  whyNums: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 16 },
  whyFrom: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: textScale.lg, color: color.textTertiary, textAlign: 'left' },
  whyTo: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale['3xl'], letterSpacing: -0.7, textAlign: 'left' },
  whyKg: { fontFamily: font.mono, fontSize: textScale.md, color: color.textMuted, textAlign: 'left' },
  whyLine: { fontFamily: font.sans, fontSize: textScale.base, color: color.textSecondary, lineHeight: 23, marginTop: 14, textAlign: 'left' },
  whyLearnTitle: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, marginTop: 10, textAlign: 'left' },
  whyNote: { flexDirection: 'row', gap: 9, marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: color.border },
  whyNoteText: { flex: 1, fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, lineHeight: 20, textAlign: 'left' },
  whyGot: { marginTop: 18 },
});
