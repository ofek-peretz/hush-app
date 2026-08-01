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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon, type IconName } from '@/components/Icon';
import { Button, IconButton, RestRing, Card, LoadDelta, Legend, WheelPicker, useToast, type ToastAction } from '@/components/ds';
import { PausedStage } from '@/components/PausedStage';
import { BottomSheet } from '@/components/BottomSheet';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { useApp } from '@/state/stores/appStore';
import { useFocusedStatusBar } from '@/platform/statusBar';
import { useSession, type CompleteResult, type LiveCorrection } from '@/state/stores/sessionStore';
import { exerciseById, exerciseCues, exerciseDisplayName } from '@/data/exercises';
import { TimeStage, DistanceStage, OpenStage, clockOf, distanceOf } from '@/screens/session/ItemStage';
import { inWorkoutLadder } from '@/domain/replacement';
import { isSwapMoment } from '@/domain/swapPool';
import { displayWeekNumber } from '@/domain/weekCadence';
import { displayWeight, unitLabel, learnPhaseLength } from '@/domain/schedule';
import { heroType, loadSetup, type LoadSetup } from '@/domain/loadPresentation';
import { db } from '@/data/local/db';
import type { CoachPlan, PlannedItem } from '@/domain/coachPlan';
import type { EffortLevel, Session } from '@/data/local/models';
import { restWithSample, restedSeconds } from '@/domain/restPrescription';
import * as haptics from '@/platform/haptics';
import { restHaptics, REST_WARNING_LEAD_S } from '@/platform/restHaptics';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, space, stage, font, textScale, tracking, trackingPx, signal, up, down, radius, press, line, motion, directionTone } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'SessionFlow'>;
type Overlay = 'none' | 'pause' | 'endConfirm' | 'reasoning' | 'demo' | 'firstGym';
export type Confirm = { weight: number | null; reps: number; n: number; m: number };

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
const EFFORT_WINDOW_MS = 6000;
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
   * Anything else goes straight to rest.
   *
   * Worth stating plainly, because it is the consequence: a set that lands INSIDE the band produces
   * no correction (`sessionStore` builds one only when Loop 1 actually moved the load), so nothing
   * follows it at all. That is the intent — silence is the product agreeing with her.
   */
  const beatSpeaks =
    confirm != null && (beatCorrection != null || (confirm.n >= confirm.m && confirm.m > 1));

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
    void db.loadCoachPlan().then((p) => alive && setCoachPlan(p));
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
    if (session.paused) setOverlay((o) => (o === 'endConfirm' ? o : 'pause'));
    else setOverlay((o) => (o === 'pause' || o === 'endConfirm' ? 'none' : o));
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
    });
  }
  /**
   * The lift whose "how did that go?" is open, or null.
   *
   * Captured at the moment the last set writes, NOT read live: by the time she answers, the session
   * has already advanced its cursor to the next lift, and reading `currentExerciseId` there would
   * file her answer against a lift she has not started.
   */
  const [askEffortFor, setAskEffortFor] = useState<string | null>(null);
  const exerciseAtLogRef = useRef<string | null>(null);
  const effortHoldRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Release the beat — with her answer if she gave one, without it if the window simply ran out. */
  const closeEffort = useCallback(
    (level: EffortLevel | null) => {
      if (effortHoldRef.current) { clearTimeout(effortHoldRef.current); effortHoldRef.current = null; }
      setAskEffortFor((exId) => {
        if (level && exId) session.reportEffort(exId, level);
        return null;
      });
      confirmRunning.current = false;
      setConfirm(null);
    },
    [session],
  );

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
         * THE LIFT IS SPENT — SO ASK HOW IT WENT (2026-07-31, `EFFORT_WINDOW_MS`).
         *
         * Only on the beat that ends a LIFT, and never on the one that ends the WORKOUT: there the
         * `endResult` effect is already navigating to Well Done, and a question racing a navigation
         * is a question nobody can answer. (The last lift of a session is therefore never asked —
         * a real gap, and the finish screen is where it belongs.)
         *
         * The set is on disk by now: this hold sits AFTER `completeSet`, so the window costs the
         * record nothing even if the app dies inside it.
         */
        if (!r.ended && confirm.n >= confirm.m && confirm.m > 1 && exerciseAtLogRef.current) {
          setAskEffortFor(exerciseAtLogRef.current);
          effortHoldRef.current = setTimeout(() => closeEffort(null), EFFORT_WINDOW_MS);
          return; // the question owns the release
        }
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
       */
    }, confirm.n >= confirm.m && confirm.m > 1 ? CONFIRM_DWELL_MS : 0);
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
    setWatchBeat({ weight: logged.weight, reps: logged.reps, n: logged.n, m: logged.m });
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

  // ── One-tap swap (S4, approved 2026-07-06) ──
  // The athlete taps Swap; HUSH decides — their saved substitute, then their backup, then the
  // catalog's different-equipment default, then similar-effect candidates. No list, no mid-
  // workout comparison. The toast carries "Try another" (walks the ladder) and "Undo". Kept
  // behind a per-render-re-bound ref so the toast's delayed actions always drive the LIVE
  // session, never a stale closure's plan.
  const quickSwapRef = useRef<{ target: 'current' | 'next'; originalId: string; ladder: string[]; idx: number } | null>(null);
  const swapActionsRef = useRef({ tryAnother: () => {}, undo: () => {} });

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

  function presentSwapChoice(id: string) {
    const st = quickSwapRef.current;
    if (!st) return;
    haptics.confirm();
    applySwapTo(st.target, id);
    notify(t('swap.swappedTo', { name: exerciseDisplayName(id) }), [
      { label: t('swap.tryAnother'), onPress: () => swapActionsRef.current.tryAnother() },
      { label: t('swap.undo'), onPress: () => swapActionsRef.current.undo() },
    ]);
  }

  swapActionsRef.current = {
    tryAnother: () => {
      const st = quickSwapRef.current;
      if (!st || st.ladder.length === 0) return;
      st.idx = (st.idx + 1) % st.ladder.length;
      presentSwapChoice(st.ladder[st.idx]);
    },
    undo: () => {
      const st = quickSwapRef.current;
      if (!st) return;
      quickSwapRef.current = null;
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
    const ladder = inWorkoutLadder(exId, { sessionExerciseIds: session.sessionExerciseIds, prefs });
    if (!ladder.length) return;
    quickSwapRef.current = { target, originalId: exId, ladder, idx: 0 };
    presentSwapChoice(ladder[0]);
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
  // The swap is offered before the FIRST set of every lift — one rule (`isSwapMoment`), asked by
  // the phone and the wrist alike, so the two surfaces can never disagree about when a swap is legal.
  const canSwap = isSwapMoment((session.setLabel?.n ?? 1) - 1) && onLift;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* The one exception, and it is not an exception to the LAW: the editor (2.2b) is a room
            you stepped into, not a beat of the workout, so it carries its own header — a way BACK
            rather than a pause, and the same elapsed clock on the same line. Drawing the stage bar
            over it would put that clock on the screen twice. */}
        {editing && onSet ? null : (
          <StageBar
            ordinal={chromeOrdinal}
            elapsedFrom={session.startedAtMs}
            onExit={openPause}
            onSwap={onSet && canSwap ? () => void startQuickSwap('current') : undefined}
            onDemo={confirm || !onLift ? undefined : () => setOverlay('demo')}
          />
        )}
        {paceBeat ? (
          <RestLearned took={paceBeat.took} was={paceBeat.was} now={paceBeat.now} nextSet={session.nextSetLabel?.n ?? 1} />
        ) : beatSpeaks ? (
          <Logged
            units={units}
            confirm={confirm!}
            correction={beatCorrection}
            onAnswer={(level) => closeEffort(level)}
          />
        ) : session.displayPhase === 'SET_PRESENTED' && itemShape ? (
          <ItemBeat item={itemShape} />
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
            onDemo={() => setOverlay('demo')}
            onSwap={() => void startQuickSwap('next')}
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
function ItemBeat({ item }: { item: Exclude<PlannedItem, { kind: 'reps' }> }) {
  const session = useSession();
  const name = session.currentExercise?.name ?? exerciseDisplayName(session.currentExerciseId);
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
    case 'distance':
      return <DistanceStage item={item} name={name} onDone={() => finish()} />;
    case 'open':
      return <OpenStage item={item} name={name} onDone={() => finish()} />;
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
}: {
  center?: string;
  ordinal?: string;
  elapsedFrom?: number | null;
  onExit: () => void;
  onSwap?: () => void;
  onDemo?: () => void;
}) {
  const { t } = useCopy();
  const hasLabel = !!(ordinal || center);
  const hasClock = elapsedFrom != null;
  return (
    <View style={styles.stageBar}>
      <View style={styles.stageBarSide}>
        <StageDisc accessibilityLabel={t('workout.pauseAction')} onPress={onExit}>
          <Icon name="pause" size={15} color={stage.ink0} filled />
        </StageDisc>
      </View>
      {/* ════ TWO FACTS, STACKED — NOT A ROW (founder 2026-07-28) ════
          They sat side by side, parted by a dot, both at 15 px: "LIFT 1 / 6 · 24:18". One line, two
          unrelated questions, and neither large enough to answer at arm's length. The clock is the
          one running number on the screen and it goes on TOP, at its own size; the lift's position
          sits under it as the quieter fact it is. The dot is gone — the stack does the parting. */}
      {hasLabel || hasClock ? (
        <View style={styles.stageBarCentre}>
          {hasClock ? <ElapsedClock from={elapsedFrom as number} /> : null}
          {ordinal ? (
            <Text style={styles.stageBarOrdinal}>{ordinal}</Text>
          ) : center ? (
            <Text style={styles.stageBarCenter}>{center}</Text>
          ) : null}
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
  const setN = session.setLabel?.n ?? 1;
  const setM = session.setLabel?.m ?? 1;

  const isBodyweight = target.recommendedWeight == null;
  // The engine v5 rep BAND — a floor to clear, a ceiling that means "too light" (models.ts §159/162).
  // `recommendedReps` starts equal to the floor but the athlete's edit overwrites it with her PERFORMED
  // reps, so the band must be read from repBandLo/Hi (mirrors Home.tsx's fallback ladder).
  const bandLo = target.repBandLo ?? target.recommendedReps ?? 8;
  const bandHi = target.repBandHi ?? bandLo;
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
        {group ? <Legend size={12} track={0.22} align="center" style={styles.group}>{t(`muscle.${group}`)}</Legend> : null}
        <Text style={styles.exName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>{exName}</Text>

        <>
            {/* 1 · LOAD — Hush's decision, the hero (set before you arrived).
                  BODYWEIGHT is the one exception (founder 2026-07-11): an athlete on a pull-up
                  knows what they are lifting — shouting "BODYWEIGHT" tells them nothing. The
                  number that carries the work (and the one Hush actually progresses on a
                  bodyweight lift) is the REP COUNT, so it takes the hero mark and "bodyweight"
                  drops to a whisper beneath it. */}
            {/* THE NUMBER IS THE DOOR TO THE EDIT (founder 2026-07-12: "I love that pressing the
                number opens the set edit — it just has to be OBVIOUS that it does, and then the
                pencil at the bottom can go"). So the hero is a real control now: it carries a
                dashed rule beneath it — the universal "this value is editable" mark — and the
                pencil ghost is gone from the footer. One affordance, on the thing it edits. */}
            {/* The LABEL is the load, not the action. Making the hero a button merges its children
                into one accessibility element, so an `accessibilityLabel` of "Edit result" would
                have replaced the announcement of the WEIGHT — VoiceOver would tell a blind athlete
                that there is an edit button here and never tell them what to lift. The value is
                the label; the action is the hint. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isBodyweight
                  ? `${target.recommendedReps} ${t('workout.repsUnit')} · ${t('workout.bodyweight')}`
                  : `${heroValue} ${unitLabel(units)}`
              }
              accessibilityHint={t('workout.tapToEdit')}
              onPress={onToggleEdit}
              hitSlop={12}
              style={({ pressed }) => [styles.heroPress, pressed && styles.heroPressed]}
            >
              {isBodyweight ? (
                <>
                  <View style={styles.heroRow}>
                    <Text style={styles.hero} accessibilityLabel={`${target.recommendedReps} ${t('workout.repsUnit')}`}>
                      {target.recommendedReps}
                    </Text>
                    {/* The unit slot is mono because it usually holds `kg`/`lb`. On a bodyweight
                        lift it holds a translated WORD ("reps"), so it hands over to sans — mono
                        cannot draw Hebrew at all (monoCarriesNoWords). */}
                    <Text style={[styles.heroUnit, styles.heroUnitWord]}>{t('workout.repsUnit')}</Text>
                  </View>
                  <Text style={styles.bodyweightQuiet}>{t('workout.bodyweight')}</Text>
                </>
              ) : (
                <>
                  <View style={styles.heroRow}>
                    {/* The figure takes the size it can HAVE, not a size it was promised — see
                        `heroFontSize`. 5 to 99.5 kg is untouched at the designed 118. */}
                    <Text
                      style={[styles.hero, heroType(String(heroValue))]}
                      accessibilityLabel={`${heroValue} ${unitLabel(units)}`}
                    >
                      {heroValue}
                    </Text>
                    <Text style={styles.heroUnit}>{unitLabel(units)}</Text>
                  </View>
                  {/* THE ANNEX SITS UNDER THE FIGURE, NOT BESIDE IT (founder, build 36 — C.9).
                      Inline, it was pushed off the screen by every load that was not a two-digit
                      whole number: "8.25 kg a sid". Under the figure it always fits, it reads the
                      same at 7.5 kg and at 137.5, and the hero keeps its full designed size instead
                      of shrinking to make room for a secondary fact — which serves "the one thing
                      standing fully in the light" better than the inline row ever did. */}
                  {annex ? (
                    <Text style={styles.heroAnnex}>
                      <Text style={styles.heroAnnexValue}>{annex.value}</Text>
                      {` ${annex.suffix}`}
                    </Text>
                  ) : null}
                </>
              )}
              {/* THE EDIT DOOR (mock 2.2, lines 388–391): a dashed pill under the hero — a pencil
                  and a quiet caption that name the number's one hidden move. The pencil rides
                  INSIDE the pill, where the mock puts it (so the footer no longer needs its own).
                  The caption is a WORD, so it is sans — mono carries only measurements
                  (monoCarriesNoWords). It repeats what the Pressable's accessibilityHint already
                  says, so it is hidden from VoiceOver. Bodyweight has no weight to tap, so the pill
                  — and its "tap the WEIGHT" caption — is shown only for a loaded lift. */}
              {!isBodyweight ? (
                <View style={styles.heroEditPill} importantForAccessibility="no-hide-descendants">
                  <Icon name="pencil" size={12} color={stage.ink2} strokeWidth={1.8} />
                  <Legend size={10.5} track={0.14}>{t('workout.tapToEdit')}</Legend>
                </View>
              ) : null}
            </Pressable>

            {/* 2 · INSTRUCTION — folded into the hero's inline "N a side / per hand" annex (mock 2.2
                  carries the equipment figure beside the load, not as a separate chip below it). */}

            {/* 3 · REPS — the execution target, as an engraved band (handoff 2.2). Absent on a
                  bodyweight lift: the reps ARE the hero above, and repeating them here would say
                  the same thing twice.
                  The old pill said ONE number (× N). The engine v5 target is a BAND — a floor she
                  must clear and a ceiling that means "too light" — so the band is what the athlete
                  should read, not a single figure. Moss is spent exactly once on this screen, here:
                  the range is the one thing the stage marks in the accent. The floor/ceiling are the
                  only translated-free facts (digits), so they are mono; "reps" and the legend are
                  words, so they are sans (the two-voice law). */}
            {!isBodyweight ? (
              <View
                style={styles.repBand}
                accessible
                accessibilityLabel={`${bandLo}–${bandHi} ${t('workout.repsUnit')}`}
              >
                <Legend size={14} track={0.2} align="center" style={styles.repBandLegend}>{t('workout.repRange')}</Legend>
                <View style={styles.repBandRule}>
                  <View style={styles.repBandBase} />
                  <View style={styles.repBandBar} />
                  <View style={[styles.repBandTick, styles.repBandTickL]} />
                  <View style={[styles.repBandTick, styles.repBandTickR]} />
                  {/* The word "reps" USED TO SIT BETWEEN THE TWO NUMBERS and it was the label
                      explaining its own control (founder 2026-07-29). "REP RANGE" is directly
                      above it saying the same thing, and nothing else on this screen is counted in
                      anything but reps. Deleted; the legend it duplicated grew instead. */}
                  <Text style={[styles.repBandNum, styles.repBandNumL]}>{bandLo}</Text>
                  <Text style={[styles.repBandNum, styles.repBandNumR]}>{bandHi}</Text>
                </View>
              </View>
            ) : null}

            {/* 4 · THE REASON IS NOT ON THIS SCREEN (v7 2.2).
                  A delta pill and its clause used to sit under the band, so the set screen carried
                  the engine's argument as well as its instruction. v7 splits them: the SET says what
                  to lift, and nothing else. When a load actually MOVES, the engine takes a whole
                  screen to say so (2.3 · THE CORRECTION), and the week's reasoning lives in the WHY
                  sheet off Today (2.1b). Under a bar, one fact. `onWhy` still opens that sheet from
                  the correction, so nothing the athlete could reach has been taken away. */}
          </>

        {/* WHERE YOU ARE IN THE LIFT, IN WORDS (v7 2.2). The dots were a good mark and the wrong
            one HERE: this stage already spends its moss on the rep band, and a row of pips under it
            put a second graphic where the eye wanted a fact. The handoff prints the sentence —
            "SET 2 OF 4" — in the chrome's own mono, and that reads at a glance from the bar. */}
        <Legend size={15} track={0.2} align="center" tone="onStage" style={styles.setOf}>
          {t('workout.setOfM', { n: setN, m: setM })}
        </Legend>
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
        {/* ONE ACT (v7 2.2). Swap and Form moved into the chrome above; the edit door is the dashed
            pill on the number itself. What is left at the bottom of the stage is the only thing a
            hand under a bar should be able to hit: Complete set. */}
        <Button
          variant="onstage"
          size="stage"
          block
          label={t('workout.completeSet')}
          onPress={onComplete}
          leading={<Icon name="check" size={18} color={stage[0]} strokeWidth={2.4} />}
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
  const setN = session.setLabel?.n ?? 1;
  const setM = session.setLabel?.m ?? 1;
  const isBodyweight = planned.weight == null;
  const bandLo = target.repBandLo ?? planned.reps ?? 8;
  const bandHi = target.repBandHi ?? bandLo;
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

  // The dial legends carry WORDS in a mono voice (the mock draws them in Plex Mono). Mono must never
  // render a literal t() (monoCarriesNoWords) — so each is baked into a variable first and the
  // <Text> body is that variable, exactly as StageBar does with `ordinal`.
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
                <Text style={styles.editDialLegend}>{weightLegend}</Text>
                <Text style={styles.editDialSub}>{t('workout.editPlanned', { n: displayWeight(planned.weight, units) })}</Text>
              </View>
              <WheelPicker value={weightVal} onChange={setWeight} step={wStep} min={0} max={units === 'kg' ? 500 : 1100} size="lg" ends="chevron" label={weightLegend} onStage />
            </View>
          ) : null}
          <View style={styles.editDial}>
            <View style={styles.editDialHead}>
              <Text style={styles.editDialLegend}>{repsLegend}</Text>
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
  onAnswer,
}: {
  units: 'kg' | 'lb';
  confirm: Confirm;
  /** When present, the capture beat IS the correction reveal (mock 2.3). */
  correction?: LiveCorrection | null;
  /** Her answer on the beat that closes a lift. Absent in the gallery, where the beat is a still. */
  onAnswer?: (level: EffortLevel) => void;
}) {
  const { t } = useCopy();
  const w = displayWeight(confirm.weight, units);
  // 2.3b — THE LAST SET OF A LIFT IS NOT AN ORDINARY LOG. Finishing a lift is a thing that
  // happened; finishing a set is a thing that keeps happening. So the final set gets the whole
  // beat: the set tracker completed, the band with the dot arrived, and what is coming next.
  if (!correction && confirm.n >= confirm.m && confirm.m > 1) {
    return <ExerciseDone confirm={confirm} onAnswer={onAnswer ?? (() => {})} />;
  }
  // THE SIGNATURE MOMENT, on the logged moment itself (mock 2.3): the set she just did moved the
  // next load, so the capture turns into the change — the old load struck through, the eased/raised
  // one standing in moss beside it — with the reps that earned it named, and nothing invented (R7).
  if (correction) {
    return <CorrectionBeat units={units} confirm={confirm} correction={correction} />;
  }
  return (
    <View style={styles.loggedRoot}>
      <View style={styles.loggedHead}>
        <Icon name="check" size={20} color={up.stage} strokeWidth={2.4} />
        <Text style={styles.loggedLegend}>{t('workout.setLogged', { n: confirm.n, m: confirm.m }).toUpperCase()}</Text>
      </View>
      <View style={styles.loggedValue}>
        {w != null ? (
          <>
            <Text style={styles.loggedNum}>{w}</Text>
            <Text style={styles.loggedUnit}>{unitLabel(units)}</Text>
            <Text style={styles.loggedTimes}>×</Text>
          </>
        ) : null}
        <Text style={styles.loggedNum}>{confirm.reps}</Text>
      </View>
      <Text style={styles.loggedCopy}>{t('workout.recorded')}</Text>
    </View>
  );
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
  return (
    <>
      <View style={styles.paceBody}>
        <Breathe>
          <View style={styles.paceRing}>
            <View style={styles.paceRingInner}>
              <Text style={styles.paceValue}>{clock(took)}</Text>
              <Legend size={10.5} track={0.22} align="center" tone="onStage">{t('workout.yourPace')}</Legend>
            </View>
          </View>
        </Breathe>

        <Legend size={11.5} track={0.18} align="center" tone="accent">{t('workout.restLearned')}</Legend>

        {/* The plan, moving. Only drawn when the median actually MOVED — a sample that lands on
            the number already in force has changed nothing, and saying otherwise would be noise. */}
        {now != null && now !== was ? (
          <View style={styles.paceChange}>
            <Text style={styles.paceWas}>{clock(was)}</Text>
            <Text style={styles.paceNow}>{clock(now)}</Text>
          </View>
        ) : null}
      </View>
    </>
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
function ExerciseDone({ confirm, onAnswer }: { confirm: Confirm; onAnswer: (level: EffortLevel) => void }) {
  const { t } = useCopy();
  return (
    <>
      <View style={styles.beatHead}>
        {/* Every pip filled: the lift is spent. The subject of the question below it. */}
        <View style={styles.donePips}>
          {Array.from({ length: confirm.m }).map((_, i) => (
            <View key={i} style={styles.donePip} />
          ))}
        </View>
      </View>
      <View style={styles.effortBody}>
        {/* The question is the hero — in the coach's serif, because this is Hush speaking to her
            rather than an instrument reading out a number. */}
        <Text style={styles.effortAsk} accessibilityRole="header">
          {t('workout.effortAsk')}
        </Text>
        <View style={styles.effortChoices}>
          <EffortChoice label={t('workout.effortHadMore')} onPress={() => onAnswer('had_more')} />
          <EffortChoice label={t('workout.effortAboutRight')} onPress={() => onAnswer('about_right')} />
          <EffortChoice label={t('workout.effortNothingLeft')} onPress={() => onAnswer('nothing_left')} />
        </View>
      </View>
    </>
  );
}

/**
 * One answer. Full width, equal weight, in her own words.
 *
 * Deliberately NOT ranked by colour or size: the direction law (down = blue, hold = cream, raise =
 * moss) speaks about what the ENGINE did to a load. Painting "nothing left" red would tell her one
 * honest answer is the wrong answer, and she would stop giving it — which costs the coach the exact
 * signal the question exists to collect.
 */
function EffortChoice({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.effortChoice, pressed && styles.effortChoicePressed]}
    >
      <Text style={styles.effortChoiceLabel}>{label}</Text>
    </Pressable>
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
  // The dot sits where her reps landed relative to the band: below the low edge (left of the moss
  // segment) when eased, above the high edge (right of it) when raised.
  const dotStyle = below ? styles.corrBeatDotLow : styles.corrBeatDotHigh;
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
  const dotIn = useAnimatedStyle(() => ({ opacity: enter.value, transform: [{ scale: enter.value }] }));
  const numsIn = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 16 }],
  }));
  return (
    <View style={styles.corrBeatRoot}>
      <View style={styles.corrBeatTop}>
        <View style={styles.corrBeatBand}>
          <View style={styles.corrBeatBandLine} />
          <View style={[styles.corrBeatBandSpan, { backgroundColor: tone, opacity: 0.55 }]} />
          <View style={[styles.corrBeatBandTick, styles.corrBeatBandTickLo, { backgroundColor: tone, opacity: 0.55 }]} />
          <View style={[styles.corrBeatBandTick, styles.corrBeatBandTickHi, { backgroundColor: tone, opacity: 0.55 }]} />
          <Animated.View style={[styles.corrBeatDot, dotStyle, { backgroundColor: tone }, dotIn]} />
        </View>
        <Text style={styles.corrBeatLegend}>{legend.toUpperCase()}</Text>
      </View>
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
  onDemo,
  onSwap,
  onLearned,
}: {
  units: 'kg' | 'lb';
  paused: boolean;
  /** A notice owns the footer while it is up — the buttons stand down (see SessionFlow.notice). */
  notice: boolean;
  onDemo: () => void;
  onSwap: () => void;
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
                {/* ONE legend, inside the card, carrying both facts: "UP NEXT · SET 3 OF 4".
                    It used to sit ABOVE the card saying only "UP NEXT", with the set position
                    repeated underneath the name — the same idea in two places and neither of them
                    complete. (A transition names the muscle instead: a new lift is the news.) */}
                <Legend size={13} track={0.18} tone="onStage" style={styles.upLegend}>
                  {isTransition
                    ? t('workout.upNextNewLift')
                    : `${t('workout.upNext')} · ${t('workout.setOfM', { n: nextSet?.n ?? 1, m: nextSet?.m ?? 1 })}`}
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
                  <View style={[styles.corrEasedPill, correction.direction === 'down' && styles.corrEasedPillDown]}>
                    <Legend size={13} track={0.1} tone="onStage" style={correction.direction === 'down' ? styles.corrEasedDown : styles.corrEasedUp}>
                      {t(correction.direction === 'down' ? 'workout.easedForYou' : 'workout.raisedForYou')}
                    </Legend>
                  </View>
                </View>
              ) : null}
            </View>
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
          {/* BOTH DOORS, side by side (v7 2.4b): watch the next lift's form, or swap it if the
              machine is taken. They are equals — two outlines of the same width — because at a
              crossing neither is more likely than the other. */}
          {isTransition && nextIsLift ? (
            <View style={styles.upActions}>
              <StageOutline icon="playCircle" label={t('workout.form')} onPress={onDemo} />
              <StageOutline icon="repeat" label={t('workout.swapAction')} onPress={onSwap} />
            </View>
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
  const deltaMag = displayWeight(Math.abs(target.reasonDelta ?? 0), units) ?? 0;
  const unit = unitLabel(units);
  const tone: 'up' | 'down' | 'hold' =
    target.reasonType === 'increase' ? 'up' : target.reasonType === 'decrease' ? 'down' : 'hold';
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
  pauseBtn: { backgroundColor: stage[1], borderRadius: radius.full, borderColor: 'transparent' },
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
  stageBarOrdinal: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 17, letterSpacing: trackingPx(14, 0.14), textTransform: 'uppercase', color: stage.ink1, textAlign: 'center' },
  // The chrome's centre group: [ordinal] · [elapsed] (handoff 2.2). A dim dot parts the ordinal
  // (where am I) from the clock (how long have I been here) — two facts, one line.
  stageBarCentre: { alignItems: 'center', gap: 3 },
  stageBarDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#5a5346' },
  // The elapsed clock — mono, because it carries only digits and a colon (the two-voice law). Medium
  // weight, no tracking — mm:ss reads as a running instrument, matching the mock's LIFT ordinal.
  stageBarClock: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 26, lineHeight: 29, color: stage.ink0, textAlign: 'center' },

  stageBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  stageFooter: { paddingHorizontal: space.gutter, paddingBottom: 30, gap: 14 },
  // A notice is up: the footer holds its space and gives up its surface (nothing peeks out
  // from under the card, nothing under it can be pressed by mistake).
  footerStoodDown: { opacity: 0 },

  // Active set
  // The muscle group — the lift's eyebrow: centred over the name, in the ordinal's ink.
  group: { marginBottom: 11 },
  exName: { fontFamily: font.sansSemibold, fontSize: 29, color: stage.ink0, textAlign: 'center', maxWidth: 330 },
  // Tapping the load reveals "why this load" — a quiet, intentional dim, never a button-like fill.
  // A.13 — the wash, not a fade: a control at 55% reads as disabled, not as pressed.
  loadBtnPressed: { backgroundColor: color.fillSubtleStrong },
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
  heroPress: { alignItems: 'center', marginTop: 34 },
  heroPressed: { opacity: press.opacity },
  // THE EDIT DOOR — a dashed pill (mock 2.2): pencil + a quiet uppercase caption. Sans, because it
  // carries words (monoCarriesNoWords). The dashed border is the "this value is editable" mark the
  // bare rule used to be, now closed into a pill around the affordance's name.
  heroEditPill: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18, paddingVertical: 6, paddingHorizontal: 13, borderRadius: 100, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(241,238,229,0.22)' },
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
  whyDeltaRow: { marginTop: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.md },
  whyText: { fontFamily: font.sansMedium, fontSize: textScale.sm, color: stage.ink2, textAlign: 'left' },
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
  addFifteenLabel: { fontFamily: font.sansSemibold, fontSize: 15, color: stage.ink0, textAlign: 'center' },
  // Size, leading and tracking all come from `heroType` at the markup — they move together with
  // the glyph count, and the leading must never fall under the size or RN clips the digit tops.
  // THE LIT HERO (v7 2.2): 132px mono at -.05em in the BRIGHT cream, with a wide soft glow. It is
  // the one thing on the stage standing fully in the light — everything else rests in shadow.
  hero: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    color: '#f6f3ea',
    includeFontPadding: false,
    textAlign: 'left',
    textShadowColor: 'rgba(246,243,234,0.16)',
    textShadowRadius: 50,
    textShadowOffset: { width: 0, height: 0 },
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
  editDial: { gap: 14 },
  editDialHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  editDialLegend: { fontFamily: font.monoMedium, fontSize: textScale.sm, letterSpacing: trackingPx(textScale.sm, tracking.legend), color: stage.ink0, textAlign: 'left' },
  editDialSub: { fontFamily: font.sans, fontSize: textScale.sm, color: stage.ink2, textAlign: 'left' },
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
  beatHead: { alignItems: 'center', paddingTop: 28 },
  beatBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 30, paddingHorizontal: 28, marginTop: -24 },
  // ── THE QUESTION THAT CLOSES A LIFT ──────────────────────────────────────────────────────────
  effortBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 34, paddingHorizontal: 28 },
  // The serif, because this is Hush asking rather than an instrument reporting. `lineHeight` above
  // the size, per `noGlyphIsClipped` — RN shears a descender to its line box.
  effortAsk: {
    fontFamily: font.serif,
    fontSize: 30,
    lineHeight: 38,
    color: stage.ink0,
    textAlign: 'center',
  },
  effortChoices: { alignSelf: 'stretch', gap: 10 },
  // Three identical targets. Equal weight is the point — see `EffortChoice`.
  effortChoice: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  effortChoicePressed: { backgroundColor: 'rgba(241,238,229,0.06)' },
  effortChoiceLabel: { fontFamily: font.sansSemibold, fontSize: 17, color: stage.ink0, textAlign: 'center' },

  // The band, resolved: the span lit, the dot landed inside it.
  doneBand: { width: 280, height: 24 },
  doneBandRule: { position: 'absolute', left: 0, right: 0, top: 11.5, height: 1.5, backgroundColor: 'rgba(241,238,229,0.20)' },
  doneBandSpan: { position: 'absolute', left: 98, width: 98, top: 10, height: 3, borderRadius: 1.5, backgroundColor: up.stage },
  doneBandTick: { position: 'absolute', top: 3, width: 2, height: 18, backgroundColor: up.stage },
  doneBandTickL: { left: 98 },
  doneBandTickR: { left: 196 },
  doneBandDot: { position: 'absolute', left: 140, top: 5, width: 14, height: 14, borderRadius: 7, backgroundColor: stage.ink0 },
  // Every pip filled — a lift is spent, and that is the whole statement.
  donePips: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  donePip: { width: 34, height: 10, borderRadius: 5, backgroundColor: up.stage },

  /* ── THE HAND-OVER — how long the beat intends to hold the screen. ── */

  // "SET 2 OF 4" — the position, in the chrome's mono, 30px under the band.
  setOf: { marginTop: 30, color: stage.ink1 },
  setLabel: { fontFamily: font.sans, fontSize: textScale.sm, color: stage.ink2, marginTop: 12, textAlign: 'left' },

  // Ghost actions
  ghostRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
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
  crossingRow: { alignItems: 'center', paddingTop: 24 },
  crossing: { color: stage.ink1 },
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
  stageOutlineLabel: { fontFamily: font.sansSemibold, fontSize: 15, color: stage.ink0, textAlign: 'left' },
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
  upDelta: { marginTop: 4 },
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
  corrBeatRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 30 },
  corrBeatTop: { alignItems: 'center', gap: 16 },
  corrBeatBand: { width: 280, height: 24, justifyContent: 'center' },
  corrBeatBandLine: { position: 'absolute', left: 0, right: 0, top: 11.5, height: 1.5, backgroundColor: 'rgba(241,238,229,0.20)' },
  corrBeatBandSpan: { position: 'absolute', left: 98, top: 10, width: 84, height: 3, borderRadius: 1.5 },
  corrBeatBandTick: { position: 'absolute', top: 3, width: 2, height: 18 },
  corrBeatBandTickLo: { left: 98 },
  corrBeatBandTickHi: { left: 182 },
  corrBeatDot: { position: 'absolute', top: 5, width: 14, height: 14, borderRadius: 7 },
  corrBeatDotLow: { left: 30 }, // eased — reps landed below the band's low edge
  corrBeatDotHigh: { left: 240 }, // raised — reps landed above the band's high edge
  corrBeatLegend: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.wide), textTransform: 'uppercase', color: stage.ink1, textAlign: 'center' },
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
  corrBeatFoot: { alignItems: 'center', gap: 9, marginTop: 6 },
  corrBeatFootText: { fontFamily: font.sansMedium, fontSize: textScale.xs, letterSpacing: trackingPx(textScale.xs, tracking.legend), textTransform: 'uppercase', color: stage.ink1, textAlign: 'center' },
  corrBeatProgressTrack: { width: 130, height: 3, borderRadius: 2, backgroundColor: 'rgba(241,238,229,0.15)', overflow: 'hidden' },

  upActions: { flexDirection: 'row', gap: 10 },

  // Sheets
  sheetLegend: { marginBottom: 4 },
  sheetTitle: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, marginTop: 4, marginBottom: 18, textAlign: 'left' },
  sheetBody: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 22, color: color.textSecondary, marginTop: 6, marginBottom: 18, textAlign: 'left' },
  sheetActions: { gap: 10 },

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
