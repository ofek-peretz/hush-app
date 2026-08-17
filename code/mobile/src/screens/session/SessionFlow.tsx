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
// @ts-nocheck

// 

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Icon, type IconName } from '@/components/Icon';
import { Arrive, Button, IconButton, RestRing, Card, LoadDelta, Legend, WheelPicker, useToast, type ToastAction } from '@/components/ds';
import { PausedStage } from '@/components/PausedStage';
import { BottomSheet } from '@/components/BottomSheet';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { useApp } from '@/state/stores/appStore';
import { useFocusedStatusBar } from '@/platform/statusBar';
import { useSession, type CompleteResult, type LiveCorrection } from '@/state/stores/sessionStore';
import { exerciseById, exerciseCues, exerciseDisplayName } from '@/data/exercises';
import { isOutdoorMovement, isTrackedMovement } from '@/data/movements';
import { TimeStage, DistanceStage, OpenStage, clockOf, distanceOf } from '@/screens/session/ItemStage';
import { swapChoices, type SwapChoice } from '@/domain/swapPool';
import { SwapSheet } from '@/components/SwapSheet';
import { isSwapMoment } from '@/domain/swapPool';
import { displayWeekNumber } from '@/domain/weekCadence';
import { displayWeight, unitLabel, learnPhaseLength } from '@/domain/schedule';
import { heroType, loadSetup, type LoadSetup } from '@/domain/loadPresentation';
import { db } from '@/data/local/db';
// ⛔ ONE DOOR ONTO HER WEEK, whoever wrote it — the coach's plan when there is one, the engine's
// programme in the same shape when there is not. See `data/local/weekPlan`.
import { loadWeekPlan } from '@/data/local/weekPlan';
import { coachChangedCase } from '@/domain/coachWeek';
import type { ChangedLiftCase } from '@/domain/changedLiftCase';
import type { CoachPlan, PlannedItem } from '@/domain/coachPlan';
import type { Session } from '@/data/local/models';
import { restWithSample, restedSeconds } from '@/domain/restPrescription';
import * as haptics from '@/platform/haptics';
import { restHaptics, REST_WARNING_LEAD_S } from '@/platform/restHaptics';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, space, stage, font, textScale, tracking, trackingPx, signal, up, down, hold, radius, press, line, motion, directionTone } from '@/design/tokens';
import { monoCanDraw } from '@/design/monoVoice';
import { bandOf, setRow } from '@/domain/setRow';
import { loadNews, showsPerSide } from '@/domain/loadNews';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'SessionFlow'>;
/*
 * ⛔ `'coach'` IS GONE (founder, 2026-08-12). The sheet behind it held three chips, and he closed
 * all three in one sentence: *"להחליף תרגיל יש את כפתור ה-SWAP שמופיע בסט הראשון בתרגיל הראשון ואז
 * במסכי ה-TRANSITION REST. וזה נראה לי פותר גם את SKIP THIS כי במקום לדלג המתאמן פשוט יכול ללחוץ
 * SWAP."* He is right on both counts and the second is the sharper one: a lift she wants gone is a
 * lift she wants REPLACED, and swapping keeps the volume the week was balanced around.
 */
type Overlay = 'none' | 'pause' | 'endConfirm' | 'reasoning' | 'demo' | 'firstGym' | 'points' | 'swap';
export type Confirm = {
  weight: number | null;
  reps: number;
  n: number;
  m: number;
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
/** 2.4d holds the screen a beat longer than a capture: it is showing a plan changing, not a log. */
const PACE_BEAT_MS = 2600;
// When the set just logged moved the next one, the capture beat holds a moment longer as the
// correction reveal (mock 2.3) — the old load struck, the eased/raised one standing in its place —
// before it releases to rest. Long enough to read the change, short enough to stay "one breath".
const CORRECTION_DWELL_MS = 2200;
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
  // THE SIGNATURE MOMENT on the capture beat (mock 2.3): set once completeSet reports that the
  // logged set moved the next load, it turns the "Set logged" beat into the correction reveal for
  // an extra beat before rest. Null on an ordinary set.
  const [beatCorrection, setBeatCorrection] = useState<LiveCorrection | null>(null);

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
  const beatSpeaks =
    confirm != null &&
    (beatCorrection != null || (confirm.n >= confirm.m && confirm.m > 1) || bandPlacement(confirm) != null);

  const [editing, setEditing] = useState(false);
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

  // The set moved on — so the edit closes. The phone's own Complete Set already does this, but a
  // set completed on the WATCH advances the machine without this screen ever hearing about it: the
  // wheels would stay open and quietly start editing the NEXT set, which the athlete has not even
  // seen yet. An editor belongs to the set it was opened on and to nothing else.
  useEffect(() => {
    setEditing(false);
  }, [curIdx]);

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
    setEditing(false);
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
        // THE SIGNATURE MOMENT (mock 2.3): the set she just logged moved the next one. Hold the
        // capture beat as the correction reveal — old load struck, eased/raised one standing in —
        // for one extra beat, THEN release to rest (where the eased load carries the "Eased for
        // you" pill). Never on the set that ends the session: it has no next set (r.correction is
        // null there), so this branch simply doesn't run and the beat releases as always.
        if (r.correction && !r.ended) {
          setBeatCorrection(r.correction);
          holdId = setTimeout(() => {
            setBeatCorrection(null);
            confirmRunning.current = false;
            setConfirm(null);
          }, CORRECTION_DWELL_MS);
          return; // the hold timer owns the release
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
    }, (confirm.n >= confirm.m && confirm.m > 1) || bandPlacement(confirm) != null ? CONFIRM_DWELL_MS : 0);
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
    };
    if (!(beat.n >= beat.m && beat.m > 1) && bandPlacement(beat) == null) return;
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
  const swapMenuRef = useRef<{ target: 'current' | 'next'; originalId: string } | null>(null);
  const undoRef = useRef<{ target: 'current' | 'next'; originalId: string } | null>(null);
  const [swapMenu, setSwapMenu] = useState<{ name: string; choices: SwapChoice[] } | null>(null);
  const swapActionsRef = useRef({ undo: () => {} });

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
    undoRef.current = st;
    haptics.confirm();
    applySwapTo(st.target, id);
    notify(t('swap.swappedTo', { name: exerciseDisplayName(id) }), [
      { label: t('swap.undo'), onPress: () => swapActionsRef.current.undo() },
    ]);
  }

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
    const choices = swapChoices(exId, { sessionExerciseIds: session.sessionExerciseIds, prefs });
    // ⛔ SIX LIFTS IN THE CATALOGUE HAVE NO ADMISSIBLE PEER AT ALL. Opening an empty sheet would be
    // worse than the verb doing nothing; she is told instead, because a door that opens on nothing
    // is the thing this pass exists to remove.
    if (choices.length === 0) {
      notify(t('swap.none'));
      return;
    }
    swapMenuRef.current = { target, originalId: exId };
    setSwapMenu({ name: exerciseDisplayName(exId), choices });
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
  const chromeOrdinal = isTransition
    ? t('workout.liftCrossing', { from: exIndex + 1, to: exIndex + 2 })
    : session.exerciseProgress
      ? t('workout.exerciseCount', { n: exIndex + 1, N: session.exerciseProgress.total })
      : undefined;
  const onSet = !confirm && session.displayPhase === 'SET_PRESENTED';
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
  /*
   * ⛔ THE FIRST SET OF THE FIRST LIFT (founder 2026-08-12) — one rule (`isSwapMoment`), asked by the
   * phone and the wrist alike, so the two surfaces can never disagree about when a swap is legal.
   * The swap for every OTHER lift lives on the transition rest, which is where she finds out the
   * machine is taken. See `swapPool` for the argument.
   */
  const canSwap = isSwapMoment((session.setLabel?.n ?? 1) - 1, exIndex) && onLift;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* The one exception, and it is not an exception to the LAW: the editor (2.2b) is a room
            you stepped into, not a beat of the workout, so it carries its own header — a way BACK
            rather than a pause, and the same elapsed clock on the same line. Drawing the stage bar
            over it would put that clock on the screen twice. */}
        {editing && onSet ? null : (
          <>
          <StageBar
            elapsedFrom={session.startedAtMs}
            onExit={openPause}
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
            onDemo={confirm || !onLift ? undefined : () => setOverlay('demo')}
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
          {/* The session's shape, drawn — see `LiftRail`. It replaces "LIFT 1 / 6". */}
          <LiftRail
            index={exIndex}
            total={session.exerciseProgress?.total ?? 1}
            setN={session.setLabel?.n}
            setM={session.setLabel?.m}
          />
          </>
        )}
        {paceBeat ? (
          <RestLearned took={paceBeat.took} was={paceBeat.was} now={paceBeat.now} nextSet={session.nextSetLabel?.n ?? 1} />
        ) : beatSpeaks ? (
          <Logged units={units} confirm={confirm!} correction={beatCorrection} />
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
            editing={editing}
            notice={notice}
            onToggleEdit={() => setEditing((v) => !v)}
            onComplete={onCompleteSet}
            onWhy={() => setOverlay('reasoning')}
          />
        ) : (
          <Rest
            units={units}
            paused={session.paused}
            notice={notice}
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
          subject={session.currentExercise?.name ?? null}
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
          thing that matters: nothing you did is lost. Keep going is the primary; the end act is
          the clay danger button. */}
      {overlay === 'endConfirm' ? (
        <BottomSheet onClose={() => setOverlay('pause')}>
          <Legend style={styles.sheetLegend}>{t('finishSheet.legend')}</Legend>
          <Text style={styles.sheetTitle}>{t('finishSheet.title')}</Text>
          <Text style={styles.sheetBody}>{t('finishSheet.body')}</Text>
          <View style={styles.sheetActions}>
            <Button variant="primary" block label={t('finishSheet.keep')} onPress={() => setOverlay('pause')} />
            <Button variant="danger" block label={t('finishSheet.save')} onPress={finish} />
          </View>
        </BottomSheet>
      ) : null}

      {overlay === 'reasoning' ? (
        <WhyLoadSheet units={units} onClose={() => setOverlay('none')} />
      ) : null}

      {/* ⛔ HER OPTIONS FOR A BUSY STATION — one to three, never padded. See `SwapSheet`. */}
      {overlay === 'swap' && swapMenu ? (
        <SwapSheet
          currentName={swapMenu.name}
          choices={swapMenu.choices}
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

      {overlay === 'demo' ? (
        <ExerciseDemo
          title={session.currentExercise?.name ?? exerciseDisplayName(session.currentExerciseId)}
          cues={exerciseCues(session.currentExerciseId)}
          focusLabel={t('workout.focusOn')}
          formGuideLabel={t('workout.formGuide')}
          doneLabel={t('workout.tapAnywhere')}
          exerciseId={session.currentExerciseId}
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
  const name = session.currentExercise?.name ?? exerciseDisplayName(session.currentExerciseId);
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
      return <TimeStage item={item} name={name} round={round} onDone={(seconds) => finish({ seconds })} />;
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
          round={round}
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
 * THE ORDINAL rides in the centre of the bar again (founder 2026-07-13) — where it was, but at a
 * size a person can actually read mid-set. `ordinal` is mono and legible; `center` is the quiet
 * uppercase legend the rest screens use ("REST" / "NEXT EXERCISE").
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
  ordinal,
  elapsedFrom,
  onExit,
  onSwap,
  onDemo,
  onCoach,
}: {
  center?: string;
  ordinal?: string;
  elapsedFrom?: number | null;
  onExit: () => void;
  onSwap?: () => void;
  onDemo?: () => void;
  /**
   * Open the conversation with the coach. Absent only when there is no lift on the stage — a
   * transition or a confirmation is not a moment to ask about a lift she is not on.
   */
  onCoach?: () => void;
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
          <StageDisc accessibilityLabel={t('workout.swapAction')} onPress={onSwap}>
            <Icon name="repeat" size={15} color={stage.ink0} strokeWidth={1.7} />
          </StageDisc>
        ) : null}
        {onDemo ? (
          <StageDisc accessibilityLabel={t('workout.form')} onPress={onDemo}>
            <Icon name="playCircle" size={15} color={stage.ink0} strokeWidth={1.8} />
          </StageDisc>
        ) : null}
        {/* `speech` and not a lightbulb or an ℹ: this is not the app informing her, it is the
            COACH talking. The glyph names the speaker, which is the whole distinction — and since
            the founder's ruling it is literally true: pressing it opens a conversation. */}
      </View>
    </View>
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
}: {
  index: number;
  total: number;
  setN?: number;
  setM?: number;
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
        sets ? t('workout.setOfM', { n: setN, m: setM }) : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      {Array.from({ length: Math.max(1, total) }).map((_, i) => {
        if (i !== index || !sets) {
          return <View key={i} style={[styles.railSeg, i < index && styles.railSegDone]} />;
        }
        return (
          <View key={i} style={styles.railOpen}>
            {Array.from({ length: sets }).map((_, k) => (
              <View
                key={k}
                style={[
                  styles.setSeg,
                  k < (setN as number) - 1 && styles.setSegDone,
                  k === (setN as number) - 1 && styles.setSegNow,
                ]}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}

function ElapsedClock({ from }: { from: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const totalS = Math.max(0, Math.floor((now - from) / 1000));
  const mm = Math.floor(totalS / 60);
  const ss = totalS % 60;
  return <Text style={styles.stageBarClock}>{`${mm}:${String(ss).padStart(2, '0')}`}</Text>;
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

/**
 * A stage OUTLINE action — icon + label inside a 52px hairline pill, half the width of a pair.
 * The transition rest's Form / Swap (v7 2.4b). Not a ghost: at a crossing these are the screen's
 * real offers, and an underlined word would not read as one across a gym.
 */
function StageOutline({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.stageOutline, pressed && styles.addFifteenPressed]}
    >
      <Icon name={icon} size={16} color={stage.ink0} strokeWidth={1.8} />
      <Text style={styles.stageOutlineLabel}>{label}</Text>
    </Pressable>
  );
}

/** A quiet ghost action on the inverted stage (icon + label). */
function StageGhost({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8 }}
      onPress={onPress}
      style={({ pressed }) => [styles.ghost, pressed && styles.ghostPressed]}
    >
      <Icon name={icon} size={16} color={stage.ink1} strokeWidth={2} />
      <Text style={styles.ghostLabel}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------- Equipment-native load */
/** The setup instruction lines under the headline load — equipment-native, never a universal
 *  "per side". Tells the athlete exactly how to load the weight so they never have to calculate. */
/** The per-side line: an exact plate stack when the load decomposes ("20 + 20"), else the numeric
 *  per-side weight ("9.5") — never a plate stack that doesn't sum to the prescribed load. */
function perSideLine(setup: LoadSetup, t: (k: string, o?: Record<string, unknown>) => string): string | null {
  if (setup.perSide == null || setup.perSide <= 0) return null;
  const stack = setup.plates && setup.plates.length ? setup.plates.join(' + ') : String(setup.perSide);
  return t('load.perSide', { plates: stack });
}

type ExecT = (k: string, o?: Record<string, unknown>) => string;

/** The imperative + the info the athlete acts on. Barbell/plate carry the per-side figure; pin/fixed
 *  are verb-only (the hero IS the figure); dumbbell names the exact pair to take off the rack. */
function execParts(setup: LoadSetup, t: ExecT, units: 'kg' | 'lb'): { verb: string; figure: string | null } {
  switch (setup.style) {
    case 'barbell':
    case 'plate_loaded':
      return { verb: t('exec.load'), figure: perSideLine(setup, t) };
    case 'dumbbell':
      return { verb: t('exec.use'), figure: t('exec.dumbbells', { weight: setup.perHand, unit: unitLabel(units) }) };
    case 'selectorized':
    case 'cable':
      return { verb: t('exec.setPin'), figure: null };
    case 'fixed_barbell':
      return { verb: t('exec.takeBar'), figure: null };
    default:
      return { verb: '', figure: null };
  }
}

/** The quiet LOADED-state confirmation (bar/pin already set). */
function execConfirmation(setup: LoadSetup, t: ExecT): string {
  switch (setup.style) {
    case 'barbell':
    case 'plate_loaded': {
      const ps = perSideLine(setup, t);
      return ps ? `${t('exec.loaded')} · ${ps}` : t('exec.loaded');
    }
    case 'dumbbell':
      return t('exec.inHand');
    case 'selectorized':
    case 'cable':
      return t('exec.pinSet');
    case 'fixed_barbell':
      return t('exec.barReady');
    default:
      return t('exec.loaded');
  }
}

function execGlyph(style: LoadSetup['style']): IconName {
  switch (style) {
    case 'dumbbell':
    case 'fixed_barbell':
      return 'dumbbell';
    case 'selectorized':
    case 'cable':
      return 'pin';
    default:
      // The athlete is about to pick up PLATES — so the glyph is a plate (founder 2026-07-12).
      // It was `layers`: two stacked rhombi that read as a pair of squares.
      return 'plate'; // barbell, plate_loaded
  }
}

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
  const unit = unitLabel(units);
  switch (setup.style) {
    case 'barbell':
    case 'plate_loaded':
      if (setup.perSide == null || setup.perSide <= 0) return null;
      return { value: `${setup.perSide} ${unit}`, suffix: t('load.aSide') };
    case 'dumbbell':
      if (setup.perHand == null) return null;
      return { value: `${setup.perHand} ${unit}`, suffix: t('load.perHand') };
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

/**
 * The execution INSTRUCTION — sits directly under the load (the athlete's "what do I do now?").
 * TO-LOAD: a bright imperative chip (verb + figure). LOADED (after the first set at this load): a
 * quiet "loaded" confirmation. It is the prescription's action, never secondary metadata.
 */
function ExecInstruction({ setup, toLoad, units }: { setup: LoadSetup; toLoad: boolean; units: 'kg' | 'lb' }) {
  const { t } = useCopy();
  const { figure } = execParts(setup, t, units);
  /*
   * A VERB WITH NO OBJECT IS NOT AN INSTRUCTION (2026-07-17).
   *
   * This chip earns its place by doing the athlete's arithmetic — "LOAD · 20 + 20 /side" is the
   * one thing on the stage the hero cannot say. But a plate-loaded lift whose per-side figure does
   * not resolve (the target is lighter than the bar, an odd implement) fell through to a bare
   * "Load", parked next to a 15 kg hero: an imperative with no object. It told the athlete to load
   * the thing she is standing in front of, having already read what to load it to.
   *
   * So when the arithmetic is absent, the chip is absent — in BOTH states, because a bare "Loaded"
   * confirms nothing the bar in front of her does not. `selectorized` / `fixed_barbell` keep their
   * solo verb: "Set the pin" and "Take the bar" name WHICH control to touch, which is a fact, not
   * an echo.
   */
  const platesOnly = setup.style === 'barbell' || setup.style === 'plate_loaded';
  if (platesOnly && !figure) return null;
  if (toLoad) {
    const { verb } = execParts(setup, t, units);
    return (
      <View style={styles.instrChip}>
        <Icon name={execGlyph(setup.style)} size={18} color={stage.ink1} strokeWidth={2} />
        {figure ? (
          <View style={styles.instrCol}>
            <Text style={styles.instrVerb}>{verb.toUpperCase()}</Text>
            <Text style={styles.instrFigure}>{figure}</Text>
          </View>
        ) : (
          <Text style={styles.instrVerbSolo}>{verb}</Text>
        )}
      </View>
    );
  }
  return (
    <View style={styles.instrDone}>
      <Icon name="check" size={15} color={up.stage} strokeWidth={2.4} />
      <Text style={styles.instrDoneText}>{execConfirmation(setup, t)}</Text>
    </View>
  );
}

/** The stage's short inline reason for a load change — the measured clause, stated beside the
 *  delta, so the reason arrives WITH the number instead of behind a "why" tap. The fuller note is
 *  still one tap away (the row opens the sheet); this is the headline of it. */
function reasonKey(r: 'increase' | 'decrease' | 'hold'): string {
  return r === 'increase' ? 'workout.reasonUp' : r === 'decrease' ? 'workout.reasonDown' : 'workout.reasonHold';
}

/* ----------------------------------------------------------------- Active Set */
function ActiveSet({
  units,
  editing,
  notice,
  onToggleEdit,
  onComplete,
  onWhy,
}: {
  units: 'kg' | 'lb';
  editing: boolean;
  /** A notice owns the footer while it is up — the buttons stand down (see SessionFlow.notice). */
  notice: boolean;
  onToggleEdit: () => void;
  onComplete: () => void;
  onWhy: () => void;
}) {
  const { t } = useCopy();
  const session = useSession();
  const ex = session.currentExercise;
  const target = session.currentTarget;
  if (!target) return <View style={styles.center} />;
  // THE EDIT IS ITS OWN SCREEN NOW (mock 2.2b). "Edit" no longer folds two wheels into the set
  // body — it opens a dedicated editor: the engraved dials, "What did you actually do?", and the
  // consequence line that reads the numbers back against the band. `editing` is the door; EditSet
  // is the room. Everything below renders only when the door is shut.
  if (editing) return <EditSet units={units} onDone={onToggleEdit} onSave={onComplete} />;
  const exName = ex?.name ?? exerciseDisplayName(session.currentExerciseId);
  const group = ex?.muscle ?? '';
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
   * ⛔ THE LIFT AS A ROW OF FIGURES (`domain/setRow`) — what replaced the rep-band graphic and the
   * ten-point "last time" line. Her sets this session over last time's, read by POSITION so set 2
   * sits under set 2.
   */
  /*
   * ⚠️ NOT MEMOISED, AND IT MUST NOT BE. `if (editing) return <EditSet …>` sits a few lines above,
   * so a hook here is a CONDITIONAL hook — React renders fewer hooks the moment the edit door opens
   * and the stage tears down mid-render. Four slots of array work is nothing; a hook past an early
   * return is a crash.
   */
  const slots = setRow({
    totalSets: setM,
    currentSetIndex: setN - 1,
    done: session.setsSoFar,
    band: isBodyweight ? null : [bandLo, bandHi],
    ...(lastTime ? { lastReps: lastTime.reps } : {}),
  });
  /*
   * ⛔ WHAT CHANGED ABOUT THIS BAR (founder 2026-08-04): *"we show how many reps were done, but not
   * how much weight was lifted last time."*
   *
   * A row of last time's reps with no load beside it invites the wrong conclusion — 8 at 32.5 kg is
   * not better than 7 at 34. The delta rides on the hero, where the thing being compared already is,
   * and it is ABSENT on every set where nothing moved, which is most of them.
   */
  const news = loadNews({
    currentLoadKg: target.recommendedWeight,
    /* ⚠️ `?? []` — `loadsSoFar` is a required field so the app cannot omit it, but a render fixture
       built by hand always lags the newest one, and a crash on the set stage is unforgivable. Same
       reasoning as `setRow`'s optional `done`. */
    ...((session.loadsSoFar ?? []).length > 0
      ? { previousSetKg: (session.loadsSoFar ?? [])[(session.loadsSoFar ?? []).length - 1] }
      : {}),
    ...(lastTime && lastTime.loadKg != null ? { lastTimeKg: lastTime.loadKg } : {}),
  });
  /* One sentence for VoiceOver, because a row of bare digits announces as a row of bare digits. */
  const setsLabel = t('workout.setOfM', { n: setN, m: setM });
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
  const beat = `${session.currentExerciseId ?? ''}-${setN}`;

  const weight = displayWeight(target.recommendedWeight, units);
  const reason = target.reasonType; // 'increase' | 'hold' | 'decrease' | undefined
  const deltaMag = displayWeight(Math.abs(target.reasonDelta ?? 0), units) ?? 0;
  // Equipment-native setup: the headline snaps to a loadable weight (barbell / plate-loaded),
  // and the setup lines tell the athlete exactly how to load it (items 5 & 12).
  const setup = loadSetup(session.currentExerciseId, weight, units);
  const heroValue = setup ? setup.headline : weight;
  // The equipment-native per-side / per-hand figure, inline beside the hero (mock 2.2).
  const annex = heroAnnex(setup, t, units);

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
          {session.straightInto ? (
            <Legend size={20} track={0.28} align="center" style={styles.group}>{t('workout.superset')}</Legend>
          ) : group ? (
            <Legend size={20} track={0.22} align="center" style={styles.group}>{t(`muscle.${group}`)}</Legend>
          ) : null}
          <Text style={styles.exName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>{exName}</Text>
          {session.straightInto ? (
            <Text style={styles.supersetNext} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>
              {session.straightInto}
            </Text>
          ) : null}
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
         <View style={styles.band}>
          {/*
            ⛔ THE HEADINGS ARE LIT (founder 2026-08-12): *"צריך לשנות את הצבע של הכותרות כי בחדר
            הכושר לא יראו את זה."*

            `Legend` defaults to `textMuted` = `cream[2]` = #8b8474, which on this card's #1b1914 is
            about 4.4:1 — a ratio tuned for a caption on paper, read at desk distance.

            ⚠️ AND `tone="onStage"` WOULD HAVE CHANGED NOTHING, which is worth recording: it resolves
            to `textTertiary`, and `textTertiary` and `textMuted` are **the same token** (`cream[2]`).
            I set it, measured, and got the identical colour back. A prop that looks like a choice and
            is not one is how a screen stays broken through a fix.

            `stage.ink1` is the stage's own secondary — about 7:1 here — and it stays below the figure
            it names, so the hierarchy is untouched.
          */}
          {/*
            ⛔ THE DELTA RIDES THE HEADING, NOT THE FIGURE ROW (founder's screenshot, 2026-08-12).

            On the baseline it was correct as a reading order and wrong as a composition: `34 KG ↑1.5`
            is a much wider group than `8–10`, and both rows are centred — so **the largest number on
            the screen sat off the centre line the one below it stands on.** Two figures that must be
            compared at a glance were not even sharing an axis.

            The heading row carries it instead. It is news ABOUT the weight, which is what a heading
            names, and the figure rows are now identical in construction: a number, its unit, centred.
          */}
          {/*
            ⚠️ AND THE HEADING NEEDS THE SAME TREATMENT THE FIGURE GOT, for the same reason and one
            row up. Moving the delta here cured the figure and moved the fault onto the label: `WEIGHT
            ↑1.5` is one centred group, so "WEIGHT" sat at c=164 while "REPS" below it stood at 195.
            **Two headings that stack, thirty-one points apart.**

            ⛔ AND A FIXED SLOT WAS THE WRONG CURE — the same wrong cure, twice in one screen. 72
            points held `↑1.5`; the founder's `↑103.5` **wrapped onto a second line** and dragged the
            heading row up with it. A slot sized to the case in front of me is not a rule.

            Absolute, hanging off the heading's right edge, one line. The heading is centred because
            it is the only thing in the row — not because I balanced something against it.
          */}
          <View style={styles.headRow}>
            <Legend size={22} track={0.26} style={styles.cardLabel}>{t('editResult.weight')}</Legend>
            {news ? (
              <View style={styles.rxDeltaAbs} pointerEvents="none">
              <Text
                numberOfLines={1}
                style={[styles.rxDelta, { color: directionTone(news.direction) }]}
                accessibilityLabel={t(news.direction === 'up' ? 'workout.loadUpBy' : 'workout.loadDownBy', {
                  delta: displayWeight(news.deltaKg, units),
                  unit: unitLabel(units),
                })}
              >
                {`${news.direction === 'up' ? '↑' : '↓'}${displayWeight(news.deltaKg, units)}`}
              </Text>
              </View>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isBodyweight
                ? `${target.recommendedReps} ${t('workout.repsUnit')} · ${t('workout.bodyweight')}`
                : `${heroValue} ${unitLabel(units)}`
            }
            accessibilityHint={t('workout.tapToEdit')}
            onPress={onToggleEdit}
            style={({ pressed }) => [styles.bandPress, pressed && styles.bandPressed]}
          >
            {/*
              ════ ⛔ THE UNIT COSTS THE FIGURE NOTHING (founder's `137.5` screenshot, 2026-08-12) ════

              `34 KG` was one centred row, so the number sat 23 points left of the screen's axis while
              `8–10` in the band below stood on it. **The two figures the athlete compares at a glance
              were not on the same vertical line.** I balanced it with an empty slot the width of the
              unit — and that fix bought the axis by spending 144 points of width the figure needed.

              He photographed `137.5`: the figure held the axis exactly, and `KG` was **at x=398 on a
              390-point screen.** Off the edge. A centring device that narrows the thing it centres is
              not a fix, it is a trade, and I did not measure the side I was paying with.

              The unit is ABSOLUTE now, hanging off the figure's right edge. It takes no row width, so
              the figure is centred by simply being the only thing in the row — and `8–10`, which has
              no unit, lands on the same axis for the same reason rather than by arrangement.
            */}
            {/*
              ════════════════════════════════════════════════════════════════════════════════════
              ⛔ A BODYWEIGHT LIFT KEEPS THE SCREEN'S SHAPE (founder, 2026-08-12)

                *"למה ב-Hanging Leg Raise או במשקלי גוף זה מציג את זה בצורה מוזרה ככה. תשמור על
                המבנה של המסך רק במשקל תכתוב BODY WEIGHT במקום מספר."*

              It was folding the two bands into one: the WEIGHT heading over a figure that was the
              REP COUNT, with "REPS" hanging off it as a unit and "BODYWEIGHT" underneath — so the
              screen read "WEIGHT · 8 REPS · BODYWEIGHT" and the rep band below it was suppressed
              entirely. Three facts in the wrong slots and a heading that named none of them.

              **The structure does not change; one slot does.** The weight band says BODYWEIGHT
              where a number would be, and the rep band underneath draws her reps exactly as it does
              on every other lift.
              ════════════════════════════════════════════════════════════════════════════════════
            */}
            {isBodyweight ? (
              <Text style={styles.rxWord} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {t('workout.bodyweight').toUpperCase()}
              </Text>
            ) : (
              <View style={styles.rxRow}>
                <View>
                  <Text style={[styles.rxFigure, heroType(String(heroValue))]}>{heroValue}</Text>
                  <View style={styles.rxUnitAbs} pointerEvents="none">
                    <Legend size={22} track={0.2} style={styles.cardLabel}>{unitLabel(units)}</Legend>
                  </View>
                </View>
              </View>
            )}
            {/*
              ⛔ THE LOADING LINE BELONGS TO THE LOAD (founder 2026-08-12), so it is inside the load's
              own band. ⚠️ Not on every set — she loads the bar once, and it returns the instant the
              load moves (founder 2026-08-04).

              ⚠️ ONE CASE FOR THE WHOLE PHRASE. It read "7 kg A SIDE" for an hour — I uppercased the
              SUFFIX and left `annex.value`, which carries its own unit, exactly as it was. Two cases
              inside one phrase reads as a typo, not as emphasis.
            */}
            {/* ⚠️ AND NO SECOND "BODYWEIGHT" UNDERNEATH. The word is the figure now — printing it
                again in the loading line's slot said the same thing twice, one line apart. */}
            {isBodyweight ? null : annex && showsPerSide({ setNumber: setN, news }) ? (
              <Text style={styles.rxSide}>
                <Text style={styles.rxSideValue}>{annex.value.toUpperCase()}</Text>
                {` ${annex.suffix.toUpperCase()}`}
              </Text>
            ) : null}
          </Pressable>
         </View>
        </Arrive>

        {/* ⛔ THE REP BAND IS DRAWN ON EVERY LIFT, bodyweight included (founder, 2026-08-12). It was
            suppressed there on the grounds that the block above "already carries them" — which it
            did, in the WEIGHT slot, under the WEIGHT heading. See the note there. */}
        {(
          <Arrive key={`reps-${beat}`} order={2} style={styles.bandArrive}>
           <View style={styles.band}>
            <Legend size={22} track={0.26} align="center" style={styles.cardLabel}>{t('workout.repsUnit')}</Legend>
            <Text
              style={[styles.rxFigure, heroType(`${bandLo}–${bandHi}`)]}
              accessibilityLabel={`${bandLo}–${bandHi} ${t('workout.repsUnit')}`}
            >
              {`${bandLo}–${bandHi}`}
            </Text>
           </View>
          </Arrive>
        )}

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
        <Button
          variant="onstage"
          size="stage"
          block
          label={t('workout.completeSet')}
          onPress={onComplete}
          leading={<Icon name="check" size={18} color={stage[0]} strokeWidth={2.4} />}
        />
        {/*
          ⛔ THE SAME BUTTON, IN THE STAGE'S OWN COLOUR (founder 2026-08-12): *"תעשה את הפקד של EDIT
          RESULT כמו ה-COMPLETE רק בצבע הנוכחי."*

          It was a chip that hugged its label — small, and therefore still arguable as decoration on
          a screen where five different marks had already failed to read as a control. Same size,
          same shape, same full width as the act: **there is nothing left to mistake it for.**

          ⚠️ WHAT KEEPS THE HIERARCHY IS THE FILL, and that is enough. `Complete set` is CREAM — light
          standing on the dark stage, which is this product's whole definition of a primary action.
          This is the stage's own ground with a hairline round it. Same geometry, opposite weight.
        */}
        <Button
          variant="onstageGhost"
          size="stage"
          block
          label={t('workout.editResult')}
          onPress={onToggleEdit}
          leading={<Icon name="pencil" size={18} color={stage.ink0} strokeWidth={1.8} />}
          style={styles.editSet}
        />
      </View>
    </>
  );
}

/* ------------------------------------------------------------- Edit set (2.2b) */
/**
 * EDIT SET (mock 2.2b) — "opens from Edit on the set screen, for when you did something else". The
 * pencil ghost and the hero tap both open THIS: a dedicated editor, not two wheels folded into the
 * set body. Two engraved dials (the same instrument the onboarding rulers are drawn as), the
 * athlete's numbers written straight to the current step as she drags — her numbers always win —
 * and a consequence line that reads the result back against her band.
 *
 * R7 (the engine invents nothing here): the consequence line states only what the numbers MEAN
 * against the band and the DIRECTION the next set will take — never a promised amount, and it drops
 * the "next set" clause on the last set (which never corrects). The load Loop 1 will actually land
 * is computed at Complete Set, on the grid; this screen does not pre-empt it.
 */
/**
 * 2.2b · EDIT SET.
 *
 * ════ SAVE SAVES THE SET (founder, build 36 — A.10) ════
 *
 * "When the athlete edits and presses confirm it should CONFIRM — not send them back to the set
 * screen." It used to only close: the dials write the step's target live as she drags, so the
 * button had nothing left to do and handed her back to press Complete Set. Two presses for one
 * act, and a button that read "Save set" while saving nothing.
 *
 * `onSave` is the set screen's own `onCompleteSet` — the same single entry point the Complete Set
 * button uses, not a parallel path. So the edited set gets the whole real beat: the one light tap,
 * the "Set logged" capture, the correction reveal when this set moved the next one, the
 * storage-failure notice, and the navigation to Well Done when it is the last set.
 *
 * The BACK chevron keeps `onDone` — closing without logging is still there, and it is the only way
 * out that does not record. That is the founder's requirement too: the row goes, the door stays.
 */
function EditSet({ units, onDone, onSave }: { units: 'kg' | 'lb'; onDone: () => void; onSave: () => void }) {
  const { t } = useCopy();
  const session = useSession();
  const ex = session.currentExercise;
  const target = session.currentTarget;
  // Capture the engine's prescription at the instant the editor opened — the dials overwrite the
  // step's target live as she drags, so "planned N" must be read from HERE, not from the (moving)
  // current value. The `useState` initialiser runs once, on mount = the moment Edit opened.
  const [planned] = useState(() => ({
    weight: target?.recommendedWeight ?? null,
    reps: target?.recommendedReps ?? 8,
  }));
  if (!target) return <View style={styles.center} />;

  const exName = ex?.name ?? exerciseDisplayName(session.currentExerciseId);
  const lastTime = session.lastTime;
  const setN = session.setLabel?.n ?? 1;
  const setM = session.setLabel?.m ?? 1;
  const isBodyweight = planned.weight == null;
  /* ⚠️ The editor asks the SAME ladder as the stage and the beat (`bandOf`). It kept its own until
     2026-08-05, and three ladders for one fact is how the beat came to deny a band the stage was
     drawing. `planned.reps` is the last resort here because the editor can open on a step the
     target has not been built for. */
  const [bandLo, bandHi] = bandOf(target) ?? bandOf({ recommendedReps: planned.reps }) ?? [8, 8];
  // 0.5 kg (1 lb) detents — the union of every real gym granularity, so the prescribed value always
  // sits ON the wheel and she can log the weight she actually lifted.
  const wStep = units === 'kg' ? 0.5 : 1;
  const weightVal = displayWeight(target.recommendedWeight, units) ?? 0;
  const repsVal = target.recommendedReps;

  const setWeight = (v: number) => {
    const kg = units === 'lb' ? +(v / 2.2046226).toFixed(1) : v;
    session.editCurrentSet({ weight: kg, reps: target.recommendedReps });
  };
  const setReps = (v: number) => session.editCurrentSet({ weight: target.recommendedWeight, reps: v });

  /*
   * ⛔ THIS COMMENT USED TO SAY THE QUIET PART OUT LOUD: *"Mono must never render a literal t()
   * — so each is baked into a variable first."* That is not obeying `monoCarriesNoWords`, it is
   * stepping around the only shape the law could see. The rendered string was unchanged, so
   * "משקל · ק״ג" and "חזרות" went to IBM Plex Mono, which has no Hebrew glyphs at all.
   *
   * ⚠️ The variables are still right — the legend IS assembled from two pieces. The face is now
   * asked of the STRING (`monoCanDraw`), the way this file already treats its hero unit: English
   * reads exactly as the handoff draws it, Hebrew never breaks mid-line.
   */
  const weightLegend = `${t('editResult.weight')} · ${unitLabel(units)}`.toUpperCase();
  const repsLegend = t('editResult.repsLabel').toUpperCase();

  return (
    <View style={styles.editScreen}>
      {/* HEADER — the door and the clock, and nothing between them (founder, build 36 — C.6).
          It used to carry "BARBELL BENCH PRESS · SET 1 OF 4" between the two, and on a real phone
          the clock ran straight into it: "‹ BARBELL BENCH PRESS · SET…13:20". The label was the
          collision AND it was already redundant — she arrived here by tapping that very lift's
          weight one screen ago, and the title below says what this screen is. So the clock sits
          where it sits on the workout screen, the back door stays, and the middle is quiet. */}
      <View style={styles.editHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={12}
          onPress={onDone}
          style={({ pressed }) => pressed && styles.heroPressed}
        >
          <Icon name="chevronLeft" size={22} color={stage.ink0} strokeWidth={1.8} />
        </Pressable>
        {session.startedAtMs != null ? <ElapsedClock from={session.startedAtMs} /> : null}
        {/* Balances the chevron so the clock is centred, exactly as the stage bar centres it. */}
        <View style={styles.editHeaderGap} />
      </View>

      <View style={styles.editBody}>
        {/* The title IS the screen (founder 2026-07-28). It asked "What did you actually do?" over
            a line explaining that dragging a dial sets the next weight — a question she did not ask
            and a caption for a control that speaks for itself. Two dials, labelled, named once. */}
        <Text style={styles.editTitle}>{t('workout.editTitle')}</Text>

        <View style={styles.editDials}>
          {!isBodyweight ? (
            <View style={styles.editDial}>
              <View style={styles.editDialHead}>
                <Text style={[styles.editDialLegend, !monoCanDraw(weightLegend) && styles.editDialLegendWord]}>{weightLegend}</Text>
                <Text style={styles.editDialSub}>{t('workout.editPlanned', { n: displayWeight(planned.weight, units) })}</Text>
              </View>
              <WheelPicker value={weightVal} onChange={setWeight} step={wStep} min={0} max={units === 'kg' ? 500 : 1100} size="lg" ends="chevron" label={weightLegend} onStage />
            </View>
          ) : null}
          <View style={styles.editDial}>
            <View style={styles.editDialHead}>
              <Text style={[styles.editDialLegend, !monoCanDraw(repsLegend) && styles.editDialLegendWord]}>{repsLegend}</Text>
              <Text style={styles.editDialSub}>{t('workout.editBand', { lo: bandLo, hi: bandHi })}</Text>
            </View>
            <WheelPicker value={repsVal} onChange={setReps} step={1} min={0} max={50} size="lg" ends="chevron" label={repsLegend} onStage />
          </View>
        </View>
      </View>

      {/* SAVE — CREAM, and it now does what it says: logs the set (A.10, see the note above).
          The consequence line that used to sit under it is gone (founder, build 36 — C.7). It read
          the numbers back — "36.5 kg × 8 — in your band" — which is the two dials directly above it
          said a second time, in smaller type. The dials are the statement; a caption under a control
          that speaks for itself steals its job (the let-the-control-speak law). */}
      <View style={styles.editFooter}>
        <Button
          variant="primary"
          size="crossing"
          block
          label={t('workout.editSave')}
          leading={<Icon name="check" size={17} color={stage[0]} strokeWidth={2.4} />}
          onPress={onSave}
        />
      </View>
    </View>
  );
}

/* ----------------------------------------------------------------- Logged beat */
/** EXPORTED for the v7 gallery (2.3): it takes only props, so the harness can hold the beat still
 *  instead of racing the timers that drive it inside a live session. */
export function Logged({
  units,
  confirm,
  correction,
}: {
  units: 'kg' | 'lb';
  confirm: Confirm;
  /** When present, the capture beat IS the correction reveal (mock 2.3). */
  correction?: LiveCorrection | null;
}) {
  const { t } = useCopy();
  const w = displayWeight(confirm.weight, units);
  // 2.3b — THE LAST SET OF A LIFT IS NOT AN ORDINARY LOG. Finishing a lift is a thing that
  // happened; finishing a set is a thing that keeps happening. So the final set gets the whole
  // beat: the set tracker completed, the band with the dot arrived, and what is coming next.
  if (!correction && confirm.n >= confirm.m && confirm.m > 1) {
    return <ExerciseDone confirm={confirm} />;
  }
  // THE SIGNATURE MOMENT, on the logged moment itself (mock 2.3): the set she just did moved the
  // next load, so the capture turns into the change — the old load struck through, the eased/raised
  // one standing in moss beside it — with the reps that earned it named, and nothing invented (R7).
  if (correction) {
    return <CorrectionBeat units={units} confirm={confirm} correction={correction} />;
  }
  /*
   * ⛔ THE THIRD STATE — THE SET THAT LANDED WHERE IT WAS ASKED TO (founder, 2026-08-04).
   *
   * The band and its dot were built only for the two edges, because both were drawn from a Loop 1
   * CORRECTION — and Loop 1 by definition never fires inside the band. So the outcome that happens
   * on most sets of most workouts had no picture, and the athlete only ever saw the instrument that
   * measures her on the rare occasions it disagreed with her.
   *
   * `hold` is already a colour in this product's law (down = blue, hold = cream, raise = moss);
   * this is the one surface that was never given the middle one.
   */
  const held = bandPlacement(confirm);
  /*
   * ⛔ AND THE PLAIN "34 kg × 8 · Set recorded" READBACK IS DELETED (founder, 2026-08-12: *"צריך
   * להעיף לדעתי ולוודא שהם לא מופיעים בשום דבר באפליקציה כי אני לא מבין מה הם בכלל"*).
   *
   * He was right that it should not exist, and it turned out not to be a design at all. The phone
   * could never reach it — `beatSpeaks` requires a correction, a finished lift, or a band — so the
   * ONLY thing that ever drew it was a set logged on the WATCH, and only because `WatchLoggedSet`
   * carried no band for `bandPlacement` to place. **A missing field wearing a screen's clothes.**
   *
   * The band travels with the wrist's set now and both devices ask one predicate, so this beat has
   * three states and no fourth. `null` rather than a fallback: a fallback is where the next missing
   * field would go to hide.
   */
  return held ? (
    <View style={styles.loggedRoot}>
      <BandMark
        tone={held.tone}
        left={held.left}
        legend={t(`workout.${held.legend}`, { n: confirm.n })}
        band={confirm.band}
        reps={confirm.reps}
        holds={w != null ? `${w} ${unitLabel(units)}` : null}
      />
    </View>
  ) : null;
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
function RestLearned({ took, was, now, nextSet }: { took: number; was: number; now: number | null; nextSet: number }) {
  const { t } = useCopy();
  const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, Math.round(sec)) % 60).padStart(2, '0')}`;
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
      {now != null && now !== was ? <Text style={styles.paceWas}>{clock(was)}</Text> : null}
    </View>
  );
}

/* ------------------------------------------------- The last set of a lift (2.3b) */
/**
 * ════ EXERCISE DONE (v7 2.3b) — the beat that closes a lift, and asks the one question ════
 *
 * It used to carry three small marks in a void — a legend, a band, a row of pips — and hold the
 * whole stage for 1.4 s to tell the athlete that the lift she had just finished was finished. The
 * founder's note on it was "does not look good enough", and he was right about the symptom; the
 * cause was that the beat had nothing to say.
 *
 * Now it has the only thing the record was missing. A load and a rep count cannot tell a grind from
 * a stroll, and those two need opposite decisions next week (`EffortLevel`). So the moment the lift
 * ends — the one moment she actually knows the answer, before the next lift overwrites the feeling
 * — the stage asks, and the whole stage is the question.
 *
 * **The pips stay, and they earn it here**: every one filled is the reason the question is being
 * asked at all. They were rejected UNDER THE REP BAND on the live set screen for a good reason
 * ("this stage already spends its moss on the rep band, and a row of pips put a second graphic
 * where the eye wanted a fact") — that reason is about the set stage, which has a fact to protect.
 * This beat has none, and the mark is its subject.
 *
 * **No skip control.** A fourth button would put "no answer" on the same footing as an answer and
 * invite the fastest tap; the window simply ends instead. Answering is the fast way out (a tap
 * releases at once), so the question can never read as a toll.
 */
function ExerciseDone({ confirm }: { confirm: Confirm }) {
  const { t } = useCopy();
  /*
   * ⚠️ AND THE BAND IS HERE TOO (founder 2026-08-04). Without it this beat is the one place a set
   * lands and is not told where — the LAST set of every lift, which is a quarter of her workout.
   *
   * The two marks are not a duplication: the pips say the LIFT is finished, the band says where its
   * final set fell. This beat's documented problem was that it "had nothing to say"; the effort
   * question that used to fill it was deleted, and this is the honest thing to put in its place —
   * a fact, not a question.
   */
  const placed = bandPlacement(confirm);
  return (
    <View style={styles.beatHead}>
      {/*
        ════ ⛔ THE PIPS ARE AN INSTRUMENT, AND THEY ARE LABELLED (founder 2026-08-12) ════

        *"אם צריך אותו אז אל תמחק אותו אבל תעצב אותו מחדש שיראה נורמלי."* — about `2.3g`, the last
        set of a lift with NO rep band: a hold, a carry, a distance. It is reachable, so it stays,
        and on that beat these pips and the lift's name are **the entire screen**. Four 34×10
        lozenges and a 26px line came to 72 points on an 844-point phone.

        ⚠️ AND ADDING FACTS WAS NOT THE ANSWER. A hold has no reps and often no load; "this lift is
        finished, it was four sets, here is its name" is genuinely everything we measured, and R7
        forbids inventing the rest. **The fault was never that the beat had too little to say — it
        was that it said it at the size of a caption.**

        So the pips take the same 334-point track the band does — one family, one geometry — and
        they are LABELLED, exactly as the band's ends now are. An anonymous graphic that the athlete
        has to count is the same defect in both instruments.
      */}
      <View style={styles.donePipsWrap}>
        <View style={styles.donePips}>
          {Array.from({ length: confirm.m }).map((_, i) => (
            <View key={i} style={styles.donePip} />
          ))}
        </View>
        {/* ⚠️ SANS, NOT MONO — `monoCarriesNoWords` caught me: this reads "4 סטים" in Hebrew and
            IBM Plex Mono has no Hebrew. The band's ends stay mono because they are pure figures. */}
        <Legend size={19} track={0.22} align="center" style={styles.donePipsLegend}>
          {t('workout.setsDone', { count: confirm.m })}
        </Legend>
      </View>
      {/*
        ⛔ THE SENTENCE, AND IT IS NOT OPTIONAL (founder 2026-08-05).
        This beat drew pips and then a band mark that only exists when the step HAS a band. On a
        fixed-rep prescription, a hold or a distance there was no band — and the entire screen was
        four green dots on black for 1.4 seconds, with no name, no verdict and nothing to read.
        **A display hung off a decision can only show the states where the decision fired**, which
        is the same shape as the bug that lost the in-band confirmation.
        The name is the floor now: whatever else this beat can say, it always says which lift just
        ended — the sentence the wrist has had since it was built.
      */}
      <Text style={styles.beatDoneTitle}>
        {confirm.lift ? t('workout.liftDone', { lift: bidi(exerciseDisplayName(confirm.lift)) }) : t('workout.liftDonePlain')}
      </Text>
      {/* No `holds` on the last set of a lift: there is no next set for a load to hold FOR, and
          what next week does with it is Loop 2's business, not this beat's (R7). */}
      {placed ? (
        <BandMark
          tone={placed.tone}
          left={placed.left}
          legend={t(`workout.${placed.legend}`, { n: confirm.n })}
          band={confirm.band}
          reps={confirm.reps}
        />
      ) : null}
    </View>
  );
}




/* --------------------------------------------------- The band, and where she landed on it */
/**
 * ════ ONE INSTRUMENT, THREE OUTCOMES ════
 *
 * The rep band with a dot on it. It was drawn only when Loop 1 moved the load, which meant it was
 * only ever drawn when she MISSED — and the founder's ruling is that all three outcomes wear it:
 * inside is cream and the load holds, out of the bottom is blue and the load comes down, out of the
 * top is moss and it goes up.
 *
 * ⚠️ THE DOT IS PLACED FROM THE REPS, NOT FROM THE DECISION. Those are usually the same thing and
 * once in a while they are not: the correction budget is two per lift, there is none after the last
 * set, and the rail can cancel a raise. In every one of those the reps still left the band and the
 * load still held — and the honest picture is a dot outside the band beside a load that did not
 * move. Reading the placement off the correction would have drawn her a set that landed perfectly.
 */
/* ⛔ RE-SCALED 2026-08-12 — the instrument is 334 wide, not 280, and the numbers below are the one
   place its geometry is stated. The track spans the stage; the band occupies its middle third. */
const BAND_W = 334;
const BAND_X_LO = 117; // where the span starts, in the 334-wide track
const BAND_X_HI = 217; // …and ends
const BAND_DOT = 22; // 14 → 22: at 14 it was smaller than the tick marks it had to be read against
/** Off the ends. Fixed, not scaled — see the note above `bandPlacement`. */
const BAND_OUT_LO = 34;
const BAND_OUT_HI = BAND_W - 34 - BAND_DOT;

/** Where the dot sits and what colour it is, or null on a step with no band. Pure — and exported
 *  so the gallery can drive all three states, which is the only way anyone sees two of them. */
export function bandPlacement(
  confirm: Confirm,
): { left: number; tone: string; legend: 'landedInside' | 'landedBelow' | 'landedAbove' } | null {
  if (!confirm.band) return null;
  const [lo, hi] = confirm.band;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return null;
  const reps = confirm.reps;
  // Outside: the fixed positions the correction reveal has always used — the distance off the end
  // is not a measurement (12 reps over is not twice as far as 6), so it does not scale.
  if (reps < lo) return { left: BAND_OUT_LO, tone: down.stage, legend: 'landedBelow' };
  if (reps > hi) return { left: BAND_OUT_HI, tone: up.stage, legend: 'landedAbove' };
  // Inside: proportional, so a set at the top of the band LOOKS like a set at the top of the band —
  // which is the only warning she gets that the load is about to be raised.
  const t = hi === lo ? 0.5 : (reps - lo) / (hi - lo);
  return { left: BAND_X_LO + t * (BAND_X_HI - BAND_X_LO) - BAND_DOT / 2, tone: hold.stage, legend: 'landedInside' };
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE END-OF-SET BEAT WAS A FOOTNOTE ON A POSTER (founder, 2026-08-12)
 *
 *   *"מסך פלאפון כזה עצום והאישור של סוף סט נראה כל כך עצוב וקטן."*
 *
 * He is right and the measurement is brutal. On an 844-point screen the whole beat occupied **59
 * points**: a 280×2 hairline, an 84×3 span, two 18-point ticks and one line of 17px `ink1`. Nearly
 * four hundred points of black above it and four hundred below.
 *
 * ── AND IT WAS WORSE THAN SMALL: TWO OF THE STATES WERE THE SAME PICTURE ───────────────────────
 * `2.3d` (landed inside) and `2.3e` (landed above) differed by **one hue and one word at 17px**.
 * Two opposite training conclusions, told apart by a colour, at a size he had already ruled out on
 * the set stage that same day. At arm's length in a gym they are one screen.
 *
 * ── WHAT THE BEAT NOW SAYS, AND WHY EACH PART IS ALLOWED ───────────────────────────────────────
 *   the band, at THREE TIMES the scale, with **its ends written** — she has never once been told
 *     what "your band" is. Two unlabelled ticks asked her to trust a verdict about a range she
 *     could not read.
 *   the sentence, at 30px serif in full ink — the voice `beatDoneTitle` already speaks in.
 *   the consequence, when there is one: **the load that holds.**
 *
 * ⚠️ AND THE REP COUNT IS DELIBERATELY NOT THE HERO, though it is the obvious choice and it would
 * have filled the screen beautifully. `Complete set` records `recommendedReps` — the FLOOR of her
 * band — so on every unedited set the number is 8 and the dot sits on the left tick. Drawing that
 * at 92 points is the rep-ghost mistake again, one screen over. **The dot already carries it; a
 * figure would carry it in a size that makes the defect unmissable.** When the logging path is
 * fixed, the number is what belongs here.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
function BandMark({
  tone,
  left,
  legend,
  band,
  holds,
}: {
  tone: string;
  left: number;
  legend: string;
  band?: [number, number];
  reps?: number;
  /** The load that does NOT move because of this set — absent on the correction, which moves it. */
  holds?: string | null;
}) {
  const { t } = useCopy();
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) });
  }, [enter]);
  const dotIn = useAnimatedStyle(() => ({ opacity: enter.value, transform: [{ scale: enter.value }] }));
  return (
    <View style={styles.corrBeatTop}>
      <View style={styles.corrBeatBand}>
        <View style={styles.corrBeatBandLine} />
        <View style={[styles.corrBeatBandSpan, { backgroundColor: tone, opacity: 0.55 }]} />
        <View style={[styles.corrBeatBandTick, styles.corrBeatBandTickLo, { backgroundColor: tone }]} />
        <View style={[styles.corrBeatBandTick, styles.corrBeatBandTickHi, { backgroundColor: tone }]} />
        <Animated.View style={[styles.corrBeatDot, { left, backgroundColor: tone }, dotIn]} />
      </View>
      {/*
        ⛔ THE BAND'S ENDS, WRITTEN. The instrument has drawn two anonymous ticks since it was built
        and told her she landed inside "your band" without ever saying what the band was. It is the
        cheapest information on the screen and the only thing here she cannot already infer.
      */}
      {band ? (
        <View style={styles.corrBeatScale}>
          <Text style={[styles.corrBeatScaleNum, styles.corrBeatScaleLo]}>{band[0]}</Text>
          <Text style={[styles.corrBeatScaleNum, styles.corrBeatScaleHi]}>{band[1]}</Text>
        </View>
      ) : null}
      <Text style={styles.corrBeatLegend}>{legend}</Text>
      {holds ? (
        <Text style={styles.corrBeatHolds}>
          {t('workout.loadHolds', { load: holds })}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------ The correction reveal (2.3) */
/**
 * The logged moment WHEN the set moved the next load. The mock (2.3) makes this the whole beat:
 * a band legend ("SET n landed below/above your band"), the old load struck through as the new one
 * rises in moss, and a "Logged · rest begins" line under a filling bar — no button, one breath,
 * then rest. Below the band → too heavy → eased down; above → too light → raised up. The reps she
 * just did are the only reason stated.
 *
 * WHY IT CAN BE THE WHOLE BEAT: a mid-workout correction is NEWS, and it is rare — the register
 * caps it at two per exercise per session and forbids it after the last set (S-13). A change that
 * could fire on every set would have to be a quiet line; one that fires at most twice can take the
 * screen. The cap is the engine's, not this screen's: `sessionStore` hands a correction over only
 * when the rule allows one, and the beat draws whatever it is given.
 */
function CorrectionBeat({
  units,
  confirm,
  correction,
}: {
  units: 'kg' | 'lb';
  confirm: Confirm;
  correction: LiveCorrection;
}) {
  const { t } = useCopy();
  const from = displayWeight(correction.from, units);
  const to = displayWeight(correction.to, units);
  const below = correction.direction === 'down'; // eased: reps landed below the band
  const legend = t(below ? 'workout.landedBelow' : 'workout.landedAbove', { n: confirm.n });
  // The dot sits where her reps landed relative to the band — ONE placement rule, shared with the
  // held beat, so the two cannot drift apart. `correction.band` rather than `confirm.band`: the
  // correction carries the band it was actually decided against.
  const placed = bandPlacement({ ...confirm, reps: correction.reps, band: correction.band });
  /* ════ DIRECTION IS A COLOUR, AND AN EASED LOAD IS BLUE (founder 2026-07-28) ════
     The whole beat was moss whichever way the load went — the RAISE colour announcing a cut. A fall
     is not a failure: Loop 1 matched the weight to the body that showed up today, and told in the
     wrong colour that reads as a demotion. Blue is calm and clinical, unmistakably not the green
     beside it, and far from any red. One hue per direction, everywhere on this screen. */
  const tone = below ? down.stage : up.stage;
  /* …and it MOVES. This is the product's most distinctive moment and it used to simply appear. The
     dot lands where her reps fell relative to the band; the new load rises into place under it. */
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) });
  }, [enter]);
  const numsIn = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 16 }],
  }));
  return (
    <View style={styles.corrBeatRoot}>
      {/* No `holds` here — this is the one state where the load does NOT hold, and the figures
          below say what it does instead. */}
      <BandMark
        tone={tone}
        left={placed?.left ?? (below ? BAND_OUT_LO : BAND_OUT_HI)}
        legend={legend}
        band={correction.band}
        reps={correction.reps}
      />
      <Animated.View style={[styles.corrBeatNums, numsIn]}>
        <Text style={styles.corrBeatFrom}>{from}</Text>
        <Text style={[styles.corrBeatTo, { color: tone, textShadowColor: tone }]}>{to}</Text>
        <Text style={styles.corrBeatUnit}>{unitLabel(units)}</Text>
      </Animated.View>
    </View>
  );
}

/* ----------------------------------------------------------------------- Rest */
function Rest({
  units,
  paused,
  notice,
  onLearned,
}: {
  units: 'kg' | 'lb';
  paused: boolean;
  /** A notice owns the footer while it is up — the buttons stand down (see SessionFlow.notice). */
  notice: boolean;
  /* ⛔ `onDemo`/`onSwap` ARE GONE FROM THIS COMPONENT (founder, 2026-08-12) — both doors are
     discs on the stage bar now, which is where every other control on this stage lives. */
  /** Leaving a rest the athlete CHANGED — cut short, or stretched. Carries what she actually
   *  rested and what had been prescribed, so 2.4d can state both. */
  onLearned: (tookS: number, wasS: number) => void;
}) {
  const { t } = useCopy();
  const session = useSession();
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
  const hasCorrection = !!correction && correction.exerciseId === nextExerciseId;
  const nextName = session.nextExercise?.name ?? exerciseDisplayName(session.nextExerciseId);
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
      ? distanceOf(nextItem.metres)
      : nextItem?.kind === 'time'
        ? { figure: clockOf(nextItem.seconds), unit: '' }
        : null;
  // Both doors open onto a lift's pool and a lift's film — see `onLift` on the stage above.
  const nextIsLift = !!exerciseById(session.nextExerciseId ?? '');
  // (The upcoming REPS are deliberately absent — see the up-next law below. They were read here
  // and printed on the rest card; nothing reads them now.)
  const nextSet = session.nextSetLabel;
  const nextDelta = nextTarget?.reasonType;
  // On a TRANSITION the load is an instruction, so it comes with how to build it (per side).
  // Kept for the a11y load label only — the per-side figure is stated on the SET screen, not here.
  const nextSetup = isTransition ? loadSetup(session.nextExerciseId, nextWeight, units) : null;
  void nextSetup;

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

  // A new rest period (duration changed / phase changed): reset and re-anchor.
  useEffect(() => {
    setTotal(session.restSeconds);
    setRemaining(session.restSeconds);
    remainingRef.current = session.restSeconds;
    endAtRef.current = paused ? null : Date.now() + session.restSeconds * 1000;
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
    // against the same absolute end (or clear it while paused).
    if (endAtRef.current != null) void restHaptics.arm(endAtRef.current);
    else void restHaptics.disarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.restSeconds, session.displayPhase]);

  // Pause freezes the value; resume re-anchors the end from the frozen remaining.
  useEffect(() => {
    if (paused) {
      endAtRef.current = null;
      void restHaptics.disarm(); // held — no alert should fire
    } else {
      endAtRef.current = Date.now() + remainingRef.current * 1000;
      sync();
      void restHaptics.arm(endAtRef.current); // resume — reschedule from the new end
    }
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
    void restHaptics.arm(endAtRef.current); // the end moved out — reschedule the OS alerts
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
        {/* The ring BREATHES — 4.5s in, 4.5s out — and it is the only thing on the stage that
            moves while nothing else is happening. 240 across, a 4px band: big enough to read from
            the bar, thin enough to stay a groove rather than a dial. */}
        <Breathe>
          <RestRing
            remaining={remaining}
            total={total || 1}
            size={240}
            stroke={4}
            onStage
            closing={closing}
            // A rest that follows a CORRECTION runs in that correction's colour — the eased blue or
            // the raised moss. The card below already says which way the load went; the ring is the
            // thing she is actually looking at, so it must not disagree with it.
            arc={hasCorrection ? directionTone(correction!.direction) : undefined}
            label={remaining <= 0 ? t('workout.ready') : t('workout.rest')}
          />
        </Breathe>

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
                <Legend size={17} track={0.18} tone="onStage" style={styles.upLegend}>
                  {isTransition ? t('workout.upNextNewLift') : t('workout.upNext')}
                </Legend>
                <Text style={styles.upName} numberOfLines={2}>{nextName}</Text>
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
              ) : hasCorrection && correction ? (
                // The eased/raised next load (moss) under an "Eased/Raised for you" pill (mock 2.4).
                // The full account of WHY already played on the logged beat; here it is just the
                // number she will lift, marked as Hush's doing, not a reminder she must re-read.
                <View style={styles.upRight}>
                  {/* Same law as the beat: an eased load is blue, a raised one moss. This card drew
                      BOTH in moss, so a cut arrived wearing the colour of a gain. */}
                  <Text style={[styles.corrEasedLoad, correction.direction === 'down' && styles.corrEasedDown]}>
                    {displayWeight(correction.to, units)}
                    <Text style={[styles.corrEasedUnit, correction.direction === 'down' && styles.corrEasedDown]}> {unitLabel(units)}</Text>
                  </Text>
                </View>
              ) : null}
            </View>
            {/*
              ⛔ THE PILL CAME OUT OF THE RIGHT COLUMN (founder's screenshot, 2026-08-12).

              "EASED FOR YOU" is 150 points wide at 17pt tracked. Stacked under "31.5 kg" it made the
              right column the WIDER of the two, so the name — the thing the card is for — was left
              108 points and "Bench Press" broke across two lines. **A sentence about the load was
              sizing the column the load lives in.** It is a row of its own now, under both.
            */}
            {hasCorrection && correction && !isTransition ? (
              <View style={[styles.corrEasedPill, correction.direction === 'down' && styles.corrEasedPillDown]}>
                <Legend size={17} track={0.1} tone="onStage" style={correction.direction === 'down' ? styles.corrEasedDown : styles.corrEasedUp}>
                  {t(correction.direction === 'down' ? 'workout.easedForYou' : 'workout.raisedForYou')}
                </Legend>
              </View>
            ) : null}

            {/* ═══ THE SIGNATURE MOMENT (2026-07-17, moved to the logged beat 2026-07-24) ═══
                The set she just finished moved the next one — the brief's "single most distinctive
                moment in the product." The FULL account (old load → new, and the reps that earned
                it) now plays on the logged beat itself (mock 2.3, `CorrectionBeat`), at the instant
                the set writes. Here on the rest card it survives only as the eased/raised load in
                moss + the "Eased/Raised for you" pill above (mock 2.4) — the one number the up-next
                law licenses between sets, because a corrected load is news, not a reminder. */}

            {/* THE PER-SIDE FIGURE IS NOT HERE (v7 2.4b). It used to ride on this card, which put
                "1.25 / side" in front of an athlete who is still walking to the station. The set
                screen states it at the moment it is acted on — inline beside the hero, "7 kg a
                side" (2.2) — so the crossing card carries only what a crossing is for: which lift
                is next, and what it weighs. `loadSetup` still runs for the a11y load label. */}

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
          {false ? (
            <View style={styles.upActions} />
          ) : null}
        </View>
      </View>

      {/* Stood down while a notice is up — out of the finger's reach AND out of VoiceOver's. */}
      <View
        style={[isTransition ? styles.crossingFooter : styles.stageFooter, notice && styles.footerStoodDown]}
        pointerEvents={notice ? 'none' : 'auto'}
        accessibilityElementsHidden={notice}
        importantForAccessibility={notice ? 'no-hide-descendants' : 'auto'}
      >
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
  const exName = session.currentExercise?.name ?? exerciseDisplayName(session.currentExerciseId);
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
  stageBarCenter: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink2, textAlign: 'left' },
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
  railRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 24, marginTop: 18 },
  /* A lift she is not on: one stroke, and nothing to count. */
  railSeg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(241,238,229,0.12)' },
  /* ⛔ MOSS, NOT DIM CREAM (founder, 2026-08-12): *"אפשר לעשות שכאשר תרגיל מסתיים להפוך את הקו
     המלא למעלה לירוק שמסמן הושלם."* A dimmer segment says "behind me"; it does not say DONE, and
     the difference is the whole point of looking at the rail. Moss is the product's finished colour
     everywhere else — the pips on the lift-done beat are the same green. */
  railSegDone: { backgroundColor: up.stage, opacity: 0.55 },
  /* The lift she IS on: two and a half times the room, opened into its sets. */
  railOpen: { flex: 2.5, flexDirection: 'row', gap: 3 },
  setSeg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(241,238,229,0.14)' },
  setSegDone: { backgroundColor: up.stage, opacity: 0.7 }, // a finished SET, in the finished colour
  setSegNow: { backgroundColor: stage.ink0 },
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
  stageBody: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 26, paddingTop: 6, paddingBottom: 58 },
  /* Who she is lifting: the eyebrow, the name, and a superset's second lift. One group. */
  identity: { alignItems: 'center', alignSelf: 'stretch' },
  /* `Arrive` wraps the set row in a View of its own, which would shrink-wrap and break the row's
     even columns — the stretch has to live on the wrapper, not only on the row inside it. */
  setsArrive: { alignSelf: 'stretch' },

  /* ⛔ 30/14 → 20/10 (2026-08-12). The stage grew a second full-width button and a third band; the
     footer's own generosity was the last ten points the content needed. Measured against the BOX
     this time, not the text inside it. */
  stageFooter: { paddingHorizontal: space.gutter, paddingBottom: 20, gap: 10 },
  // A notice is up: the footer holds its space and gives up its surface (nothing peeks out
  // from under the card, nothing under it can be pressed by mistake).
  footerStoodDown: { opacity: 0 },

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
   * ⚠️ `adjustsFontSizeToFit` IS WHAT MAKES THIS SAFE, and it is why the number can move at all. A
   * coach names sessions in words and Hebrew runs long — "לחיצת חזה במוט" at 36 would overrun 330
   * points, and the prop shrinks it to fit rather than clipping. The floor stays 0.72 of 36 = 26,
   * which is still above the type floor.
   */
  exName: { fontFamily: font.sansSemibold, fontSize: 36, lineHeight: 42, color: stage.ink0, textAlign: 'center', maxWidth: 330 },
  // The second half of a superset: the SAME size as the lift she is on, in the quiet tone the unit
  // label wears — present as an equal, subordinate only in colour.
  supersetNext: { fontFamily: font.sansSemibold, fontSize: 36, lineHeight: 42, color: stage.ink2, textAlign: 'center', maxWidth: 330, marginTop: 2 },
  // Tapping the load reveals "why this load" — a quiet, intentional dim, never a button-like fill.
  // A.13 — the wash, not a fade: a control at 55% reads as disabled, not as pressed.
  heroRow: { flexDirection: 'row', alignItems: 'flex-end' },
  // The equipment-native figure UNDER the hero: "7 kg a side". The number is a measurement (mono,
  // cream); the "a side / per hand" suffix is a word (sans, quiet). It rode inline beside the hero
  // until build 36, where every load past two whole digits pushed it off the screen — see the note
  // at the markup, and `heroFontSize` for the measurements.
  heroAnnex: { fontFamily: font.sans, fontSize: 19, color: stage.ink1, marginTop: 6, textAlign: 'center' },
  // A figure inside the hero's annex row, which centres its children — declared so the number
  // never lands on the physical left in Hebrew.
  heroAnnexValue: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 21, color: stage.ink0, textAlign: 'center' },
  // The hero IS the edit control — its door is a dashed pill (below), the pencil + caption inside it.
  /* ⛔ 34 → 22. The load is what the name above it names; a third of an inch of black between them
     made them two facts instead of one. */
  heroPress: { alignItems: 'center', marginTop: 22 },
  heroPressed: { opacity: press.opacity },

  // Instruction-first execution: the imperative chip (TO-LOAD) + the quiet confirmation (LOADED),
  // sitting directly under the load — the athlete's "what do I do now?".
  instrChip: { marginTop: 16, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 18, backgroundColor: stage[1], borderWidth: 1, borderColor: stage[2], borderRadius: radius.lg },
  instrCol: { alignItems: 'flex-start' },
  instrVerb: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink1, marginBottom: 2, textAlign: 'left' },
  instrFigure: { fontFamily: font.sansSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.lg, color: stage.ink0, textAlign: 'left' },
  instrVerbSolo: { fontFamily: font.sansSemibold, fontSize: textScale.lg, letterSpacing: trackingPx(textScale.lg, tracking.tight), color: stage.ink0, textAlign: 'left' },
  instrDone: { marginTop: 16, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7 },
  instrDoneText: { fontFamily: font.sans, fontSize: textScale.sm, color: stage.ink2, textAlign: 'left' },
  // Why / Δ — demoted below the instruction; quiet and optional, never competing with it.
  // minHeight keeps the quiet look while giving the tap a full 44pt target.
  // 3 · THE ENGRAVED REP-RANGE BAND (handoff 2.2) — a floor and a ceiling, drawn as a rule with
  // two moss end-ticks and a moss bar between them. Moss is spent exactly once per set screen, here.
  // 268-wide rule; the numbers hang off each end, and the legend rides above. The word "reps" that
  // used to sit between the two numbers is gone (founder 2026-07-29) — the legend already says it,
  // and the legend took the space it left (11 → 14).
  repBand: { marginTop: 34, alignSelf: 'center', alignItems: 'center' },
  repBandLegend: { marginBottom: 12 },
  // The rule lost the row that carried "reps" underneath it: 58 → 44.
  repBandRule: { width: 268, height: 44 },
  // The engraved groove — a translucent-cream hairline the moss bar sits on top of (inset 20 to meet
  // the ticks, exactly under the bar — the mock's base line is NOT full-width).
  repBandBase: { position: 'absolute', top: 11, left: 26, right: 26, height: 2, borderRadius: 1, backgroundColor: 'rgba(241,238,229,0.16)' },
  // The lit span between the ticks (inset 20 each side to meet them).
  repBandBar: { position: 'absolute', top: 9, left: 26, right: 26, height: 6, borderRadius: 3, backgroundColor: up.stage },
  repBandTick: { position: 'absolute', top: 0, width: 3, height: 24, borderRadius: 2, backgroundColor: up.stage },
  repBandTickL: { left: 24 },
  repBandTickR: { right: 24 },
  repBandNum: { position: 'absolute', top: 27, fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: 30, color: up.stage }, // rtl-ok: base; the repBandNumL/R variants each set textAlign explicitly
  // The floor hangs off the left end (left:8); the ceiling off the right (right:0) — asymmetric because
  // one is a single digit left-aligned and the other can be two digits right-aligned (handoff 2.2).
  repBandNumL: { left: 0, textAlign: 'left' },
  repBandNumR: { right: 0, textAlign: 'right' },
  // +15 is the rest's SECOND action, and v7 draws it as an outline the same width as the act
  // above it — 52 tall to the act's 62, so the pair reads as one decision and its qualifier.
  addFifteen: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.28)',
  },
  addFifteenPressed: { backgroundColor: 'rgba(241,238,229,0.06)' },
  crossingFooter: { paddingHorizontal: space.gutter, paddingBottom: 44, gap: 12 },
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
  hero: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    color: '#f6f3ea',
    includeFontPadding: false,
    textAlign: 'left',
  },
  heroUnit: { fontFamily: font.mono, fontSize: 26, color: stage.ink2, marginStart: 10, marginBottom: 13, textAlign: 'left' },
  heroUnitWord: { fontFamily: font.sans },
  // The whisper under a bodyweight hero — a quiet fact, never a headline (founder 2026-07-11).
  bodyweightQuiet: {
    fontFamily: font.sansMedium,
    fontSize: textScale['2xs'],
    letterSpacing: trackingPx(textScale['2xs'], tracking.legend),
    textTransform: 'uppercase',
    color: stage.ink2,
    marginTop: 6,
    textAlign: 'left',
  },

  // EDIT SET — the dedicated editor (mock 2.2b).
  editScreen: { flex: 1 },
  editHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 26, paddingTop: 16 },
  // Balances the back chevron so `space-between` lands the clock dead centre. It must equal the
  // chevron's drawn width (22), not merely approximate it — at 40 the clock sat 18px off, which is
  // visible on a row this sparse and is the same centring complaint the founder raised on 2.2.
  editHeaderGap: { width: 22 },
  editBody: { flex: 1, paddingHorizontal: 28, paddingTop: 30 },
  editTitle: { fontFamily: font.serif, fontSize: 38, lineHeight: 42, color: stage.ink0, textAlign: 'left' },
  /* ════ THE SAME PLACEMENT 1.4 USES (founder 2026-07-29) ════
     Both screens ask exactly one thing — two rulers — and 1.4 was fixed for it on 2026-07-28 while
     this one kept the old stack: a fixed 30 of air under the title and a fixed 46 between the
     dials, so on a tall phone the pair huddled up and the leftover height pooled under the last
     one. The rule is `ManualInfo.sections`, verbatim: `flex: 1` + `space-evenly` hands the spare
     height to the GAPS, and each label breathes 14 above its own scale. */
  editDials: { flex: 1, justifyContent: 'space-evenly', paddingVertical: 8 },
  editDial: { gap: 18 },
  editDialHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  /* ⛔ 17 → 22 (founder, 2026-08-12: *"תגדיל את הסרגלים עצמם ואת המלל במסך EDIT SET בלבד … זה חדר
     כושר זה צריך להיות ברור ומדויק מהרגע הראשון."*). These two lines name what each dial IS, and
     they were set at the same size as the muted note beside them. This screen only. */
  editDialLegend: { fontFamily: font.monoMedium, fontSize: 22, letterSpacing: trackingPx(22, tracking.legend), color: stage.ink0, textAlign: 'left' },
  // The face for a legend mono cannot draw — the tracking stays, only the family moves.
  editDialLegendWord: { fontFamily: font.sansMedium }, // rtl-ok: merged onto a base that sets textAlign
  editDialSub: { fontFamily: font.sans, fontSize: 20, color: stage.ink1, textAlign: 'left' }, // …and a step out of shadow with it
  editFooter: { marginTop: 'auto', paddingHorizontal: 26, paddingBottom: 34, gap: 12 },

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
  paceChange: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  // What it WAS: struck through, in the ink of something no longer in force.
  paceWas: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 20, color: '#57534a', textDecorationLine: 'line-through', textAlign: 'left' },
  paceNow: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 30, color: up.stage, textAlign: 'left' },

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

  // The band, resolved: the span lit, the dot landed inside it.
  // Every pip filled — a lift is spent, and that is the whole statement.
  /* ⛔ THE SAME 334-POINT TRACK THE BAND USES — see the note at the markup. The pips were a row of
     34×10 lozenges sized to nothing; they are the lift's own shape now, spanning the stage, and the
     segments divide the track however many sets it held. */
  donePipsWrap: { width: BAND_W, alignItems: 'center', gap: 14 },
  donePips: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8 },
  donePip: { flex: 1, height: 14, borderRadius: 7, backgroundColor: up.stage },
  donePipsLegend: { color: stage.ink1 },

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
  ask: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    /*
     * ⛔ 30 → 40 (founder 2026-08-12, pushing the screen further). Measured against what was around
     * it: the band was 30 and the row of sets she had ALREADY DONE was 38. **The target she is
     * chasing was smaller than the record of what is behind her**, on a screen she reads from a
     * metre and a half away with a bar in her hands.
     *
     * The order the screen now states is the order the work happens in: the LOAD is what she must
     * put on the bar (118), the BAND is what she must do with it (40), and the sets behind her are
     * context (34).
     */
    fontSize: 40,
    letterSpacing: trackingPx(40, tracking.tight),
    /*
     * ⛔ ink1 → ink0 (founder 2026-08-12): *"למה החזרות ככה חיוורות וקטנות לעומת המשקל?"*
     *
     * Because a hierarchy had been built twice into the same pair. The load already outranks the
     * band by SIZE — 118 against 40 — and the band was then dimmed on top of that, so the second
     * half of the prescription was quiet AND small on a screen she reads at arm's length with a bar
     * in her hands. **Rank a thing once.** Size carries it; the ink does not have to say it again.
     *
     * ⚠️ THIS IS NOT THE MOSS THE FOUNDER STRUCK DOWN. He removed the band's ACCENT on 2026-08-04 —
     * *"why are we putting the reps in green as a hero? it is only the rep range that follows from
     * the weight"* — because moss means A DECISION MADE and the load is the bigger decision. Cream
     * at full strength is not a claim about importance; it is the difference between legible and not.
     */
    color: stage.ink0,
    includeFontPadding: false,
    marginTop: 6,
    textAlign: 'center',
  },

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
  cardLabel: { color: stage.ink0 },
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
  bandPress: { alignSelf: 'stretch', alignItems: 'center' },
  /* A.13 — a wash under the block, never a fade of the figures it holds. */
  bandPressed: { backgroundColor: 'rgba(241,238,229,0.05)', borderRadius: radius.lg },
  rxRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 10 },
  /* ⛔ The unit hangs off the figure and costs it no width — see the note at the markup. `left:
     '100%'` is the figure's own right edge, whatever the figure turned out to be. */
  rxUnitAbs: { position: 'absolute', left: '100%', bottom: 8, paddingStart: 10 },
  /* ⛔ BODYWEIGHT, where a number would be. Sans — it is a WORD, and mono has no Hebrew to draw
     "משקל גוף" with at all (`monoCarriesNoWords`). Set below the figures because it is six times
     their glyph count and the two bands must still read as a pair. */
  rxWord: {
    fontFamily: font.sansSemibold,
    fontSize: 46,
    lineHeight: 56,
    letterSpacing: 1,
    color: stage.ink0,
    includeFontPadding: false,
    textAlign: 'center',
  },
  /* ⚠️ 46, NOT 92. Set position is orientation, not instruction — see the note at the markup. */
  setFigure: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -1,
    color: stage.ink1,
    includeFontPadding: false,
    textAlign: 'center',
  },
  rxFigure: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 92,
    lineHeight: 98,
    letterSpacing: -3,
    color: stage.ink0,
    includeFontPadding: false,
    textAlign: 'center',
  },
  /* The heading and its news, on one line — and the heading keeps the axis. See the markup. */
  headRow: { flexDirection: 'row', alignItems: 'center' },
  rxDeltaAbs: { position: 'absolute', left: '100%', top: 0, paddingStart: 10 },
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
  rxSide: {
    marginTop: 10,
    fontFamily: font.sansMedium,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: 1.6,
    color: stage.ink1,
    textAlign: 'center',
  },
  rxSideValue: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 24, color: stage.ink0, textAlign: 'center' },
  /*
   * The edit control. A hairline outline that hugs its label — it must read as a button and must
   * never read as the ACT, which is cream, full width and pinned to the foot of the stage.
   */
  /* The act's twin: `Button` already draws the geometry, so this only lights its edge. The variant
     (`onstageGhost`) carries the fill and the pressed wash. */
  editSet: { borderColor: 'rgba(241,238,229,0.26)' },
  /* The delta rides the hero's own baseline — no line of its own, because it has no vertical cost. */
  heroNews: {
    fontFamily: font.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 22,
    marginStart: 8,
    includeFontPadding: false,
    textAlign: 'left',
  },

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
  sets: { flexDirection: 'row', alignSelf: 'stretch', paddingHorizontal: 8, marginTop: 26 },
  setCol: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 43 },
  /* A set she has not reached: present, and saying nothing. */
  setDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(241,238,229,0.28)' },
  setNum: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    /*
     * ⚠️ 38 → 34. It went 34 → 38 when the second row was removed and its height went into the first
     * row's size — the founder's own arithmetic, and right at the time. It became wrong when the
     * band it sits under stayed at 30: the record of the sets behind her outranked the target in
     * front of her. This is the same figure it was before that trade, now under a band that is
     * properly larger than it.
     */
    fontSize: 34,
    lineHeight: 39,
    color: stage.ink0,
    includeFontPadding: false,
    textAlign: 'center',
  },
  /* Last time's number, still standing in the slot: dimmed rather than shrunk. A small number is
     unreadable; a quiet one is merely quiet — the founder's floor, applied to a ghost. */
  setNumGhost: { fontFamily: font.mono, color: stage.ink1, opacity: 0.4, textAlign: 'center' },
  setNumUp: { color: up.stage },
  setNumDown: { color: down.stage },
  /* ⚠️ CREAM, not moss. It marks WHERE SHE IS, which is not a decision the app made — and the
     accent on this stage is now reserved for a thing that happened. */
  setMark: { marginTop: 8, width: 26, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(241,238,229,0.55)' },
  setMarkOff: { backgroundColor: 'transparent' },
  /* ⚠️ SANS. It holds a translated phrase ("LAST TIME · …") and mono cannot draw Hebrew at all —
     the same reason its predecessor was sans, caught again by `monoCarriesNoWords`. */
  lastTime: {
    marginTop: 10,
    fontFamily: font.sansMedium,
    fontSize: 17,
    letterSpacing: trackingPx(13, tracking.legend),
    color: stage.ink2,
    textAlign: 'center',
  },
  setOf: { marginTop: 30, color: stage.ink1 },

  // Ghost actions
  ghost: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
  ghostPressed: { backgroundColor: stage[1] },
  ghostLabel: { fontFamily: font.sansMedium, fontSize: textScale.sm, color: stage.ink1, textAlign: 'left' },

  // Logged beat
  loggedRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  loggedHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // LIT moss on the dark stage (v7 shows #A9C49F). `up[0]` is the PAPER moss — near-invisible here;
  // this screen was never part of the READOUT ladder inversion, so it silently held the wrong rung.
  loggedLegend: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: up.stage, textAlign: 'left' },
  loggedValue: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, marginTop: 30 },
  loggedNum: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale['5xl'], color: stage.ink0, lineHeight: Math.round(textScale['5xl'] * 1.06), letterSpacing: trackingPx(textScale['5xl'], tracking.display), includeFontPadding: false, textAlign: 'left' },
  loggedUnit: { fontFamily: font.mono, fontSize: textScale.lg, color: stage.ink2, textAlign: 'left' },
  loggedTimes: { fontFamily: font.mono, fontSize: textScale['2xl'], color: stage.ink2, marginHorizontal: 4, textAlign: 'left' },
  loggedCopy: { fontFamily: font.sans, fontSize: textScale.sm, color: stage.ink2, marginTop: 18, maxWidth: 260, textAlign: 'center' },

  // Up next card
  // A crossing between two lifts: one centred legend, 76 down from the top of the frame.
  // Form / Swap at a crossing — an equal pair of 52px outlines.
  stageOutline: {
    flex: 1,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.28)',
  },
  stageOutlineLabel: { fontFamily: font.sansSemibold, fontSize: 17, color: stage.ink0, textAlign: 'left' },
  // The rest stage: the ring centred in the space it owns, the up-next card at the 26px gutter.
  restBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  upNext: { marginTop: 40, width: '100%', paddingHorizontal: 26, gap: 10 },
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
  /* ── The signature moment, on the rest card (mock 2.4). The full account played on the logged
     beat; here the next load stands in moss under an "Eased/Raised for you" pill — the one number
     the up-next law licenses between sets, because a corrected load is news, not a reminder. ── */
  corrEasedLoad: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 32, lineHeight: 33, color: up.stage, textAlign: 'left' },
  // The unit trailing the eased load ("31.5 kg") — it follows the figure it belongs to.
  corrEasedUnit: { fontFamily: font.monoMedium, fontSize: 17, color: up.stage, textAlign: 'left' },
  corrEasedPill: { alignSelf: 'flex-end', paddingVertical: 5, paddingHorizontal: 11, borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(169,196,159,0.4)' },

  /* ── The correction reveal (mock 2.3): the logged moment IS the change. Old load struck and
     receding, the eased/raised one the brightest thing on the stage — READOUT's law, emphasis as
     distance from the ground. A band line places the reps she did; a filling bar says rest is
     coming; no button, one breath, then rest. ── */
  corrBeatRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.gutter, gap: 44 },
  corrBeatTop: { alignItems: 'center', gap: 22 },
  /* ⛔ 280 → 334 wide and 24 → 40 tall. The geometry constants are `BAND_W`/`BAND_X_*` above the
     placement rule; these must agree with them, which `theBeatIsNotAFootnote` pins. */
  corrBeatBand: { width: BAND_W, height: 40, justifyContent: 'center' },
  corrBeatBandLine: { position: 'absolute', left: 0, right: 0, top: 19, height: 2, backgroundColor: 'rgba(241,238,229,0.22)' },
  corrBeatBandSpan: { position: 'absolute', left: BAND_X_LO, top: 17, width: BAND_X_HI - BAND_X_LO, height: 6, borderRadius: 3 },
  /* Full opacity, not 0.55 — the ticks are the scale, and a scale drawn at half strength is what
     made "inside" and "above" the same picture from arm's length. */
  corrBeatBandTick: { position: 'absolute', top: 6, width: 3, height: 28, borderRadius: 1.5 },
  corrBeatBandTickLo: { left: BAND_X_LO },
  corrBeatBandTickHi: { left: BAND_X_HI },
  /* The band's ends, written under their ticks — see the note in `BandMark`. */
  corrBeatScale: { alignSelf: 'stretch', height: 22 },
  corrBeatScaleNum: {
    position: 'absolute',
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 19,
    lineHeight: 22,
    color: stage.ink1,
    textAlign: 'center',
    width: 44,
  },
  corrBeatScaleLo: { left: BAND_X_LO + 1.5 - 22 },
  corrBeatScaleHi: { left: BAND_X_HI + 1.5 - 22 },
  corrBeatDot: { position: 'absolute', top: 9, width: BAND_DOT, height: BAND_DOT, borderRadius: BAND_DOT / 2 },
  /* ⛔ 17px UPPERCASE `ink1` → 30px SERIF IN FULL INK (founder 2026-08-12). It was a caption on a
     screen with nothing else on it — the same size and colour he had ruled out on the set stage
     that morning. It is a sentence about her training and it is allowed to sound like one, in the
     voice `beatDoneTitle` already speaks. */
  corrBeatLegend: {
    fontFamily: font.serif,
    fontSize: 30,
    lineHeight: 38,
    color: stage.ink0,
    textAlign: 'center',
    maxWidth: 330,
  },
  /* The consequence, a step behind the sentence that earns it. */
  corrBeatHolds: { fontFamily: font.sansMedium, fontSize: 20, lineHeight: 26, color: stage.ink1, textAlign: 'center' },
  corrBeatNums: { flexDirection: 'row', alignItems: 'baseline', gap: 18 },
  corrBeatFrom: {
    fontFamily: font.mono,
    fontVariant: ['tabular-nums'],
    fontSize: textScale['3xl'],
    color: stage.ink2,
    textDecorationLine: 'line-through',
    textAlign: 'left',
  },
  corrBeatTo: {
    fontFamily: font.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: textScale['5xl'],
    // The COLOUR arrives from the direction at the call site (moss risen / blue eased). This is the
    // brightest value the stage has, and the news it carries is which WAY the load went.
    letterSpacing: -2,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24, // a soft bloom, so the figure reads as lit rather than printed
    includeFontPadding: false,
    textAlign: 'left',
  },
  corrBeatUnit: { fontFamily: font.mono, fontSize: textScale.xl, color: stage.ink1, textAlign: 'left' },
  corrEasedUp: { color: up.stage },
  corrEasedDown: { color: down.stage },
  corrEasedPillDown: { borderColor: 'rgba(126,178,214,0.45)' },

  upActions: { flexDirection: 'row', gap: 10 },

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
  calTitle: { fontFamily: font.serif, fontSize: 34, lineHeight: 37, color: stage.ink0, textAlign: 'left' },
  calBody: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 23, color: stage.ink1, textAlign: 'left' },
  calChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  calChip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: 'rgba(241,238,229,0.18)', borderRadius: 100, paddingVertical: 8, paddingHorizontal: 13 },
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
