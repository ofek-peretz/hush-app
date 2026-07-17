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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, Easing } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon, type IconName } from '@/components/Icon';
import { Button, IconButton, RestRing, Card, LoadDelta, Legend, WheelPicker, useToast, type ToastAction } from '@/components/ds';
import { BottomSheet } from '@/components/BottomSheet';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { useApp } from '@/state/stores/appStore';
import { useFocusedStatusBar } from '@/platform/statusBar';
import { useSession, type CompleteResult } from '@/state/stores/sessionStore';
import { exerciseCues, exerciseDisplayName } from '@/data/exercises';
import { inWorkoutLadder } from '@/domain/replacement';
import { isSwapMoment } from '@/domain/swapPool';
import { displayWeekNumber } from '@/domain/weekCadence';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { loadSetup, type LoadSetup } from '@/domain/loadPresentation';
import { db } from '@/data/local/db';
import * as haptics from '@/platform/haptics';
import { restHaptics, REST_WARNING_LEAD_S } from '@/platform/restHaptics';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, space, stage, font, textScale, tracking, trackingPx, signal, up, down, radius, press } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'SessionFlow'>;
type Overlay = 'none' | 'pause' | 'endConfirm' | 'reasoning' | 'demo' | 'firstGym';
type Confirm = { weight: number | null; reps: number; n: number; m: number };

const CONFIRM_DWELL_MS = 1400; // the deliberate "Set logged" capture beat
/** Once-per-install key for the "We're learning your gym" first-workout note. */
const FIRST_GYM_KEY = 'first_workout_modal';

export function SessionFlow({ navigation }: Props) {
  const { t } = useCopy();
  const session = useSession();
  const toast = useToast();
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
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
  const notify = useCallback(
    (message: string, actions?: ToastAction[]) => {
      setNotice(true);
      toast.show(message, { actions, onHide: () => setNotice(false) });
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

  // First Start ever: a confident start haptic, and the one-time "we're learning your gym" note
  // (shown AFTER Start, never in onboarding, never twice). Mount-only.
  useEffect(() => {
    haptics.workoutStart();
    let active = true;
    void db.hasFirst(FIRST_GYM_KEY).then((seen) => {
      if (active && !seen) setOverlay('firstGym');
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismissFirstGym() {
    void db.markFirst(FIRST_GYM_KEY);
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
    session.pause(); // the effect above raises the sheet — one path, phone or wrist
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
    setConfirm({
      weight: tgt.recommendedWeight,
      reps: tgt.recommendedReps,
      n: session.setLabel?.n ?? 1,
      m: session.setLabel?.m ?? 1,
    });
  }
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
    const id = setTimeout(async () => {
      try {
        const r = await session.completeSet();
        // Non-blocking confirmation that Hush will remember the corrected load — shown at most ONCE
        // per workout, and NEVER when this set ends the workout (it must never float over Well Done).
        if (corrected && !r.ended && !learnToastShownRef.current) {
          learnToastShownRef.current = true;
          notify(t('load.remembered'));
        }
        // When r.ended, the `endResult` effect navigates to Well Done (one path for phone + watch).
      } catch {
        // completeSet PERSISTS the set (db.saveActiveSession), so it can reject on a storage
        // failure. Without this, the rejection escaped into the void with `confirm` still set —
        // and the "Set logged" beat has NO controls, so the athlete was frozen there, mid-workout,
        // with force-quitting the app as the only way out. The set is not saved; say so, and give
        // the athlete their set back so they can log it again.
        notify(t('workout.setSaveFailed'));
      } finally {
        // ALWAYS: the stage must return to the athlete, saved or not.
        confirmRunning.current = false;
        setConfirm(null);
      }
    }, CONFIRM_DWELL_MS);
    return () => clearTimeout(id);
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

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {confirm ? (
          <Logged units={units} confirm={confirm} />
        ) : session.displayPhase === 'SET_PRESENTED' ? (
          <ActiveSet
            units={units}
            editing={editing}
            notice={notice}
            onToggleEdit={() => setEditing((v) => !v)}
            onComplete={onCompleteSet}
            onExit={openPause}
            onWhy={() => setOverlay('reasoning')}
            onDemo={() => setOverlay('demo')}
            onSwap={() => void startQuickSwap('current')}
          />
        ) : (
          <Rest
            units={units}
            paused={session.paused}
            notice={notice}
            onExit={openPause}
            onDemo={() => setOverlay('demo')}
            onSwap={() => void startQuickSwap('next')}
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
      {overlay === 'pause' ? (
        <BottomSheet onClose={resume}>
          <Legend style={styles.sheetLegend}>{t('pauseSheet.legend')}</Legend>
          <Text style={styles.sheetTitle}>{t('pauseSheet.title')}</Text>
          <View style={styles.sheetActions}>
            <Button variant="primary" block label={t('pauseSheet.resume')} onPress={resume} />
            <Button variant="danger" block label={t('pauseSheet.finishWorkout')} onPress={() => setOverlay('endConfirm')} />
          </View>
        </BottomSheet>
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

      {overlay === 'firstGym' ? (
        <BottomSheet onClose={dismissFirstGym}>
          <Legend style={styles.sheetLegend}>{t('firstGym.legend')}</Legend>
          <Text style={styles.sheetTitle}>{t('firstGym.title')}</Text>
          <Text style={styles.sheetBody}>{t('firstGym.body1')}</Text>
          <Text style={styles.sheetBody}>{t('firstGym.body2')}</Text>
          <View style={styles.sheetActions}>
            <Button variant="primary" block label={t('firstGym.got')} onPress={dismissFirstGym} />
          </View>
        </BottomSheet>
      ) : null}

      {overlay === 'demo' ? (
        <ExerciseDemo
          title={session.currentExercise?.name ?? exerciseDisplayName(session.currentExerciseId)}
          cues={exerciseCues(session.currentExerciseId)}
          focusLabel={t('workout.focusOn')}
          formGuideLabel={t('workout.formGuide')}
          doneLabel={t('workout.demoDone')}
          exerciseId={session.currentExerciseId}
          onDone={() => setOverlay('none')}
        />
      ) : null}
    </View>
  );
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
function StageBar({ center, ordinal, onExit }: { center?: string; ordinal?: string; onExit: () => void }) {
  const { t } = useCopy();
  return (
    <View style={styles.stageBar}>
      <View style={styles.stageBarSide}>
        <IconButton onStage accessibilityLabel={t('workout.pauseAction')} onPress={onExit} style={styles.pauseBtn}>
          <Icon name="pause" size={17} color={stage.ink1} strokeWidth={2.2} />
        </IconButton>
      </View>
      {ordinal ? (
        <Text style={styles.stageBarOrdinal}>{ordinal}</Text>
      ) : center ? (
        <Text style={styles.stageBarCenter}>{center}</Text>
      ) : (
        <View style={styles.flex} />
      )}
      <View style={[styles.stageBarSide, styles.stageBarRight]} />
    </View>
  );
}

/**
 * Which set you are on, and how many are left — as a mark, not a sentence.
 *
 * `label` is what a sighted athlete reads off the dots in one glance ("Set 1 of 4"), spoken for one
 * who cannot see them. It used to be printed underneath as well, which said the same fact twice:
 * the dots ARE the count. Now the dots carry it in both senses — the group is one accessibility
 * element, so VoiceOver says the sentence and never the four anonymous views it is drawn from.
 */
function SetDots({ total, index, done, label }: { total: number; index: number; done: number; label: string }) {
  return (
    <View style={styles.dots} accessible accessibilityLabel={label}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            { width: i === index ? 22 : 7 },
            i < done ? styles.dotDone : i === index ? styles.dotActive : styles.dotRest,
          ]}
        />
      ))}
    </View>
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
  onExit,
  onWhy,
  onDemo,
  onSwap,
}: {
  units: 'kg' | 'lb';
  editing: boolean;
  /** A notice owns the footer while it is up — the buttons stand down (see SessionFlow.notice). */
  notice: boolean;
  onToggleEdit: () => void;
  onComplete: () => void;
  onExit: () => void;
  onWhy: () => void;
  onDemo: () => void;
  onSwap: () => void;
}) {
  const { t } = useCopy();
  const session = useSession();
  const ex = session.currentExercise;
  const target = session.currentTarget;
  if (!target) return <View style={styles.center} />;
  const exName = ex?.name ?? exerciseDisplayName(session.currentExerciseId);
  const group = ex?.muscle ?? '';
  const total = session.exerciseProgress?.total ?? 1;
  const exNo = (session.exerciseProgress?.index ?? 0) + 1; // exercise ordinal among distinct exercises
  const setN = session.setLabel?.n ?? 1;
  const setM = session.setLabel?.m ?? 1;

  const isBodyweight = target.recommendedWeight == null;
  const weight = displayWeight(target.recommendedWeight, units);
  const reason = target.reasonType; // 'increase' | 'hold' | 'decrease' | undefined
  const deltaMag = displayWeight(Math.abs(target.reasonDelta ?? 0), units) ?? 0;
  // Equipment-native setup: the headline snaps to a loadable weight (barbell / plate-loaded),
  // and the setup lines tell the athlete exactly how to load it (items 5 & 12).
  const setup = loadSetup(session.currentExerciseId, weight, units);
  const heroValue = setup ? setup.headline : weight;

  // Inline edit → write straight to the current step (engine re-renders).
  // 0.5 kg (1 lb) detents — the union of every real gym granularity (2 kg and 2.5 kg dumbbell
  // racks, 1.25 kg plate pairs, half-pin stacks) AND the 1 kg-rounded cold-start seeds, so the
  // prescribed value always sits ON the wheel and the athlete can log the weight they actually
  // lifted. The coarser 2.5 kg wheel could not express a real 14/16 kg dumbbell — the learned
  // equipment grid was being taught rungs that don't exist.
  const wStep = units === 'kg' ? 0.5 : 1;
  const setWeight = (v: number) => {
    const kg = units === 'lb' ? +(v / 2.2046226).toFixed(1) : v;
    session.editCurrentSet({ weight: kg, reps: target.recommendedReps });
  };
  const setReps = (v: number) => session.editCurrentSet({ weight: target.recommendedWeight, reps: v });

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
  const canSwap = isSwapMoment(setN - 1); // setN is 1-based; the law speaks in 0-based set indices

  return (
    <>
      {/* WHERE AM I (founder 2026-07-13). The ordinal goes back to the top bar — but readable, not
          the 11px whisper it was when the founder said "1 / 6 is so small you cannot notice it at
          all". The previous pass over-corrected by dragging it down into the body next to the
          muscle group, which cost the muscle group its place: it belongs CENTRED over the lift's
          name, as its eyebrow, in the same ink as the ordinal. Chrome above, the lift below. */}
      <StageBar ordinal={t('workout.exerciseCount', { n: exNo, N: total })} onExit={onExit} />
      <View style={styles.stageBody}>
        {group ? <Text style={styles.group}>{t(`muscle.${group}`).toUpperCase()}</Text> : null}
        <Text style={styles.exName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>{exName}</Text>

        {!editing ? (
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
                    <Text style={styles.heroUnit}>{t('workout.repsUnit')}</Text>
                  </View>
                  <Text style={styles.bodyweightQuiet}>{t('workout.bodyweight')}</Text>
                </>
              ) : (
                <View style={styles.heroRow}>
                  <Text style={styles.hero} accessibilityLabel={`${heroValue} ${unitLabel(units)}`}>{heroValue}</Text>
                  <Text style={styles.heroUnit}>{unitLabel(units)}</Text>
                </View>
              )}
              {/* The dashed rule is the mark, and it is enough. There were THREE signals for one
                  act here — this rule, a "TAP TO EDIT" caption under it, and the pencil in the
                  footer — because two founder rulings landed on top of each other: "make it obvious
                  the number opens the edit" (07-12, which added the rule AND the caption) and
                  "bring the pencil back" (07-13). The caption is the one that has to go: the rule
                  is the universal "this value is editable" mark, and the pencil is the named
                  teacher for anyone who misses it. A word telling you to tap the giant number you
                  are already looking at is the app not trusting its own control. VoiceOver still
                  hears it — as the accessibilityHint above, which is where a hint belongs. */}
              <View style={styles.heroEditRule} />
            </Pressable>

            {/* 2 · INSTRUCTION — what the athlete physically does now (part of the prescription). */}
            {setup ? <ExecInstruction setup={setup} toLoad={session.toLoad} units={units} /> : null}

            {/* 3 · REPS — the execution target. Absent on a bodyweight lift: the reps ARE the hero
                  above, and repeating them here would say the same thing twice. */}
            {!isBodyweight ? (
              <View style={styles.repsPill}>
                <Text style={styles.repsTimes}>×</Text>
                <Text style={styles.repsNum}>{target.recommendedReps}</Text>
                <Text style={styles.repsWord}>{t('workout.repsUnit')}</Text>
              </View>
            ) : null}

            {/* 4 · THE REASON, STATED — not a link to it (2026-07-17).
                  "The number and the reason arrive together" (the brief). This row used to be the
                  delta pill + "Why this load ›" — a generic label that made the athlete TAP to
                  learn why the number in front of her had changed. So the most distinctive thing
                  the product does (it explains its own decisions) was one tap away from the decision
                  it explains. Now the row STATES it: the delta, then the measured clause that earned
                  it ("cleared your range" / "matched your clean sets" / "in your range"). The full
                  note is still a tap away for anyone who wants it — the delta pill is the door — but
                  the reason itself no longer hides behind one.
                  A held load with nothing changed says nothing: a load that stood still is not news
                  every set (the up-next law's spirit, on the stage). */}
            {!isBodyweight && reason ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t(reasonKey(reason))} · ${t('whyLoad.legend')}`}
                accessibilityHint={t('whyLoad.trigger')}
                onPress={onWhy}
                style={({ pressed }) => [styles.whyDeltaRow, pressed && styles.loadBtnPressed]}
              >
                <LoadDelta
                  direction={reason === 'increase' ? 'up' : reason === 'decrease' ? 'down' : 'hold'}
                  value={deltaMag}
                  unit={unitLabel(units)}
                  holdLabel={t('whyLoad.verdictHold')}
                  size="sm"
                  pill
                />
                <Text style={styles.whyText}>{t(reasonKey(reason))}</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          /* EDIT (founder 2026-07-12): the unit chips are gone from both rules — the field
             labels say what these numbers are, and they say it bigger now, because "actual
             weight" and "actual reps" are the whole reason this screen exists and the athlete
             must not have to work out which rule is which. */
          <View style={styles.editBlock}>
            {!isBodyweight ? (
              <View style={styles.editRow}>
                <Text style={styles.editLabel}>{t('workout.actualWeightWith', { unit: unitLabel(units) })}</Text>
                {/* The wheel's LABEL carries the unit for VoiceOver. The visible unit chip is gone
                    (founder), and the chip was also what fed `accessibilityValue` — so without this
                    a blind athlete would hear "44" and never hear "kilograms". */}
                <WheelPicker value={weight ?? 0} onChange={setWeight} step={wStep} min={0} max={units === 'kg' ? 500 : 1100} label={t('workout.actualWeightWith', { unit: unitLabel(units) })} onStage style={styles.editWheel} />
              </View>
            ) : null}
            <View style={styles.editRow}>
              <Text style={styles.editLabel}>{t('workout.actualReps')}</Text>
              <WheelPicker value={target.recommendedReps} onChange={setReps} step={1} min={0} max={50} label={t('workout.actualReps')} onStage style={styles.editWheel} />
            </View>
          </View>
        )}

        {/* THE DOTS ARE THE COUNT (2026-07-17). "Set 1 of 4" was printed under them — the same
            fact, read twice, one of the thirteen things this screen asked the eye to do. The dots
            say it faster than the words can be read, and they say something the words cannot: how
            much is left. The sentence lives on inside them now, for VoiceOver. */}
        <View style={styles.dotsWrap}>
          <SetDots total={setM} index={setN - 1} done={setN - 1} label={t('workout.setOfM', { n: setN, m: setM })} />
        </View>
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
        <Button
          variant="onstage"
          size="lg"
          block
          label={editing ? t('workout.saveComplete') : t('workout.completeSet')}
          onPress={onComplete}
        />
        <View style={styles.ghostRow}>
          {/* TWO DOORS TO THE SAME ROOM (founder 2026-07-13: "bring the edit-set button back, and
              also keep tapping the number opening the edit"). The pencil was removed on the theory
              that one affordance is cleaner than two — but the athlete who has never tapped the
              number has no way to LEARN that they can, and the footer is where a hand already goes.
              The named button teaches it; the number stays the shortcut for anyone who knows. */}
          {editing ? (
            <StageGhost icon="check" label={t('workout.editDone')} onPress={onToggleEdit} />
          ) : (
            <StageGhost icon="pencil" label={t('workout.editResult')} onPress={onToggleEdit} />
          )}
          <StageGhost icon="playCircle" label={t('workout.form')} onPress={onDemo} />
          {canSwap ? <StageGhost icon="repeat" label={t('workout.swapAction')} onPress={onSwap} /> : null}
        </View>
      </View>
    </>
  );
}

/* ----------------------------------------------------------------- Logged beat */
function Logged({ units, confirm }: { units: 'kg' | 'lb'; confirm: Confirm }) {
  const { t } = useCopy();
  const w = displayWeight(confirm.weight, units);
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

/* ----------------------------------------------------------------------- Rest */
function Rest({
  units,
  paused,
  notice,
  onExit,
  onDemo,
  onSwap,
}: {
  units: 'kg' | 'lb';
  paused: boolean;
  /** A notice owns the footer while it is up — the buttons stand down (see SessionFlow.notice). */
  notice: boolean;
  onExit: () => void;
  onDemo: () => void;
  onSwap: () => void;
}) {
  const { t } = useCopy();
  const session = useSession();
  const isTransition = session.displayPhase === 'REST_TRANSITION';
  // The signature moment, if Loop 1 just made one. Guarded against the NEXT lift below: a
  // correction belongs to the exercise it was measured on, and a transition rest is already
  // looking at a different one.
  const correction = session.correction;
  const nextExerciseId = session.nextExerciseId;
  const nextName = session.nextExercise?.name ?? exerciseDisplayName(session.nextExerciseId);
  const nextGroup = session.nextExercise?.muscle ?? '';
  const nextTarget = session.nextTarget;
  // The upcoming load is the engine's prescribed value verbatim (same number the athlete will lift).
  const nextWeight = displayWeight(nextTarget?.recommendedWeight ?? null, units);
  // (The upcoming REPS are deliberately absent — see the up-next law below. They were read here
  // and printed on the rest card; nothing reads them now.)
  const nextSet = session.nextSetLabel;
  const nextDelta = nextTarget?.reasonType;
  // On a TRANSITION the load is an instruction, so it comes with how to build it (per side).
  const nextSetup = isTransition ? loadSetup(session.nextExerciseId, nextWeight, units) : null;

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

  // Final-seconds IGNITION (founder 2026-07-10): the phone is on the floor and a buzz
  // alone doesn't say "get under the bar". With the display held awake for the whole
  // session, the last REST_WARNING_LEAD_S seconds also announce themselves VISUALLY —
  // the stage pulses a soft ochre wash once per second (light matching the countdown),
  // readable from standing height without picking the phone up. Honors Reduce Motion
  // (the closing digits still turn ochre — see RestRing `closing`).
  const reducedMotion = useReducedMotion();
  const closing = !paused && remaining > 0 && remaining <= REST_WARNING_LEAD_S;
  const ignition = useSharedValue(0);
  useEffect(() => {
    if (!closing || reducedMotion) return;
    ignition.value = withSequence(
      withTiming(0.14, { duration: 140, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 640, easing: Easing.in(Easing.quad) }),
    );
  }, [remaining, closing, reducedMotion, ignition]);
  const ignitionStyle = useAnimatedStyle(() => ({ opacity: ignition.value }));

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
      <StageBar
        center={isTransition ? t('workout.nextExercise') : undefined}
        ordinal={
          isTransition || !session.exerciseProgress
            ? undefined
            : t('workout.exerciseCount', {
                n: session.exerciseProgress.index + 1,
                N: session.exerciseProgress.total,
              })
        }
        onExit={onExit}
      />
      <View style={styles.stageBody}>
        <RestRing
          remaining={remaining}
          total={total || 1}
          size={196}
          stroke={6}
          onStage
          closing={closing}
          label={remaining <= 0 ? t('workout.ready') : t('workout.rest')}
        />

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
          <Legend tone="onStage" style={styles.upNextLegend}>{t('workout.upNext')}</Legend>
          <Card stage pad="md">
            <View style={styles.upRow}>
              <View style={styles.upInfo}>
                {isTransition && nextGroup ? <Text style={styles.upGroup}>{t(`muscle.${nextGroup}`).toUpperCase()}</Text> : null}
                <Text style={styles.upName} numberOfLines={2}>{nextName}</Text>
                <Text style={styles.upMeta}>{t('workout.setOfM', { n: nextSet?.n ?? 1, m: nextSet?.m ?? 1 })}</Text>
              </View>
              {isTransition ? (
                <View style={styles.upRight}>
                  {/* A load is a FIGURE (mono); "bodyweight" is a WORD, and it takes the word's voice
                      — the mono face has no Hebrew letters to draw it with at all. */}
                  <Text style={[styles.upWeight, nextWeight == null && styles.upWeightWord]}>
                    {nextWeight != null ? nextWeight : t('workout.bodyweight')}
                    {nextWeight != null ? <Text style={styles.upWeightUnit}> {unitLabel(units)}</Text> : null}
                  </Text>
                  {nextDelta ? (
                    <View style={styles.upDelta}>
                      <LoadDelta
                        direction={nextDelta === 'increase' ? 'up' : 'down'}
                        value={displayWeight(Math.abs(nextTarget?.reasonDelta ?? 0), units) ?? 0}
                        unit={unitLabel(units)}
                        size="sm"
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
            {/* ═══ THE SIGNATURE MOMENT (2026-07-17) ═══
                The set she just finished moved the next one, and this is Hush saying so — the
                brief's "single most distinctive moment in the product", which it also notes is
                easy to miss. It was easy to miss because it was INVISIBLE: Loop 1 corrected the
                load, reported it to telemetry, and swapped the plan underneath her. She arrived at
                a different number with no account of why.

                It lives INSIDE the up-next card, not beside it, because they are the same fact:
                the card IS the next set and the correction IS about the next set. One fact, one
                element.

                And it is the one thing licensed past the up-next law's "the lift's name and which
                set. Nothing else." That law bans a REMINDER — a load the athlete saw thirty
                seconds ago and will see again in thirty more. A correction is not a reminder, it
                is news, and it is rare (S-13 caps it at 2 per exercise). The law already carves
                out exactly this: the transition rest shows a load because there "a number is an
                instruction rather than a reminder." A corrected load is an instruction. */}
            {correction && correction.exerciseId === nextExerciseId ? (
              <View style={styles.corr}>
                <View style={styles.corrRow}>
                  <Text style={styles.corrFrom}>{displayWeight(correction.from, units)}</Text>
                  <Text style={styles.corrArrow}>→</Text>
                  <Text style={styles.corrTo}>{displayWeight(correction.to, units)}</Text>
                  <Text style={styles.corrUnit}>{unitLabel(units)}</Text>
                </View>
                {/* Only what Hush measured: the reps she just did, and the edge they crossed. */}
                <Text style={styles.corrWhy}>
                  {t(correction.direction === 'up' ? 'workout.correctedUp' : 'workout.correctedDown', {
                    reps: correction.reps,
                    edge: correction.direction === 'up' ? correction.band[1] : correction.band[0],
                  })}
                </Text>
              </View>
            ) : null}

            {/* How to BUILD that load — the plates per side, the pin, the pair of dumbbells. */}
            {isTransition && nextSetup ? (
              <View style={styles.upSetup}>
                <ExecInstruction setup={nextSetup} toLoad units={units} />
              </View>
            ) : null}
            {isTransition ? (
              <View style={styles.upActions}>
                <StageGhost icon="playCircle" label={t('workout.form')} onPress={onDemo} />
                <StageGhost icon="repeat" label={t('workout.swapExercise')} onPress={onSwap} />
              </View>
            ) : null}
          </Card>
        </View>
      </View>

      {/* Stood down while a notice is up — out of the finger's reach AND out of VoiceOver's. */}
      <View
        style={[styles.stageFooter, notice && styles.footerStoodDown]}
        pointerEvents={notice ? 'none' : 'auto'}
        accessibilityElementsHidden={notice}
        importantForAccessibility={notice ? 'no-hide-descendants' : 'auto'}
      >
        <Button
          variant="onstage"
          size="lg"
          block
          label={isTransition ? t('workout.startNamed', { name: bidi(nextName) }) : t('workout.startNextSet')}
          onPress={() => session.endRest()}
        />
        {remaining > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('workout.addSeconds')}
            onPress={addFifteen}
            style={({ pressed }) => [styles.addFifteen, pressed && styles.ghostPressed]}
          >
            <Text style={styles.ghostLabel}>{t('workout.addSeconds')}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* final-seconds ignition wash — over everything, touches nothing */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.ignition, ignitionStyle]} />
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
  stageBar: { height: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  // A soft graphite disc, not a bordered box: found when looked for, silent otherwise.
  pauseBtn: { backgroundColor: stage[1], borderRadius: radius.full, borderColor: 'transparent' },
  stageBarSide: { width: 44 },
  stageBarRight: { alignItems: 'flex-end' },
  stageBarCenter: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink2, textAlign: 'left' },
  // The ordinal — the one thing in the bar that is READ, so it is sized to be read.
  //
  // SANS, not mono. "Exercise 1 / 6" is a sentence with a number in it, and the two-voice law gives
  // sentences to Hanken; mono is for what the instrument MEASURES. It also has a hard consequence
  // in Hebrew — JetBrains Mono carries no Hebrew, so "תרגיל" fell out to whatever font the OS
  // could find, in the middle of the one line that says where the athlete is. Tabular figures keep
  // the digits from dancing as the count climbs. Same face and same ink as the muscle group below,
  // which is what the founder asked for when he said "make it the same colour".
  stageBarOrdinal: { fontFamily: font.sansSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.sm, letterSpacing: trackingPx(textScale.sm, tracking.wide), color: stage.ink1, textAlign: 'center' },

  stageBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.gutter },
  stageFooter: { paddingHorizontal: space.gutter, paddingBottom: 14, gap: 10 },
  // A notice is up: the footer holds its space and gives up its surface (nothing peeks out
  // from under the card, nothing under it can be pressed by mistake).
  footerStoodDown: { opacity: 0 },

  // Active set
  // The muscle group — the lift's eyebrow: centred over the name, in the ordinal's ink.
  group: { fontFamily: font.sansSemibold, fontSize: textScale.sm, letterSpacing: trackingPx(textScale.sm, tracking.legend), textTransform: 'uppercase', color: stage.ink1, marginBottom: 10, textAlign: 'center' },
  exName: { fontFamily: font.sansSemibold, fontSize: textScale['2xl'], letterSpacing: trackingPx(textScale['2xl'], tracking.tight), color: stage.ink0, textAlign: 'center', maxWidth: 320 },
  // Tapping the load reveals "why this load" — a quiet, intentional dim, never a button-like fill.
  loadBtnPressed: { opacity: 0.55 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end' },
  // The hero IS the edit control — a dashed rule under an editable value, and a whispered hint.
  heroPress: { alignItems: 'center' },
  heroPressed: { opacity: press.opacity },
  heroEditRule: { alignSelf: 'stretch', height: 0, borderBottomWidth: 1, borderStyle: 'dashed', borderBottomColor: stage[2], marginTop: 6 },
  heroEditHint: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), color: stage.ink2, marginTop: 7, textAlign: 'center' },
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
  repsPill: { marginTop: 16, alignSelf: 'center', flexDirection: 'row', alignItems: 'baseline', gap: 7, paddingVertical: 9, paddingHorizontal: 18, borderWidth: 1, borderColor: stage[2], borderRadius: radius.full },
  repsTimes: { fontFamily: font.mono, fontSize: textScale.md, color: stage.ink2, textAlign: 'left' },
  repsNum: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.xl, color: stage.ink0, textAlign: 'left' },
  addFifteen: { alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: radius.md },
  // The 7s ignition before the first set. Loud is lift, not hue.
  ignition: { backgroundColor: stage.lift },
  // lineHeight must be ≥ fontSize or RN clips the tall mono digit tops (the web
  // design's 0.9 is safe there but not in RN). Slight headroom keeps glyphs whole.
  hero: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.data, letterSpacing: trackingPx(textScale.data, tracking.display), color: stage.ink0, lineHeight: Math.round(textScale.data * 1.06), includeFontPadding: false, textAlign: 'left' },
  heroUnit: { fontFamily: font.sans, fontSize: textScale.lg, color: stage.ink2, marginStart: 6, marginBottom: 12, textAlign: 'left' },
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
  repsWord: { fontFamily: font.sans, fontSize: textScale.sm, color: stage.ink2, textAlign: 'left' },

  // Inline edit
  editBlock: { marginTop: 30, width: '100%', maxWidth: 300, gap: 16 },
  editRow: { gap: 8 },
  editWheel: { alignSelf: 'stretch' },
  // The field labels ARE the units now (the chips came off the rules) — so they are read, not squinted at.
  editLabel: { fontFamily: font.sansSemibold, fontSize: textScale.sm, letterSpacing: trackingPx(textScale.sm, tracking.legend), textTransform: 'uppercase', color: stage.ink1, textAlign: 'left' },

  dotsWrap: { marginTop: 24, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 7, justifyContent: 'center' },
  dot: { height: 7, borderRadius: 4 },
  dotDone: { backgroundColor: up.stage },
  dotActive: { backgroundColor: stage.ink0 },
  dotRest: { backgroundColor: stage[2] },
  setLabel: { fontFamily: font.sans, fontSize: textScale.sm, color: stage.ink2, marginTop: 12, textAlign: 'left' },

  // Ghost actions
  ghostRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  ghost: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
  ghostPressed: { backgroundColor: stage[1] },
  ghostLabel: { fontFamily: font.sansMedium, fontSize: textScale.sm, color: stage.ink1, textAlign: 'left' },

  // Logged beat
  loggedRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  loggedHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loggedLegend: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: up[0], textAlign: 'left' },
  loggedValue: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, marginTop: 30 },
  loggedNum: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale['5xl'], color: stage.ink0, lineHeight: Math.round(textScale['5xl'] * 1.06), letterSpacing: trackingPx(textScale['5xl'], tracking.display), includeFontPadding: false, textAlign: 'left' },
  loggedUnit: { fontFamily: font.mono, fontSize: textScale.lg, color: stage.ink2, textAlign: 'left' },
  loggedTimes: { fontFamily: font.mono, fontSize: textScale['2xl'], color: stage.ink2, marginHorizontal: 4, textAlign: 'left' },
  loggedCopy: { fontFamily: font.sans, fontSize: textScale.sm, color: stage.ink2, marginTop: 18, maxWidth: 260, textAlign: 'center' },

  // Up next card
  upNext: { marginTop: 40, width: '100%', maxWidth: 340 },
  upNextLegend: { marginBottom: 12 },
  upRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  upInfo: { flex: 1, minWidth: 0 },
  upGroup: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink2, textAlign: 'left' },
  upName: { fontFamily: font.sansSemibold, fontSize: textScale.md, color: stage.ink0, marginTop: 3, textAlign: 'left' },
  upMeta: { fontFamily: font.sans, fontSize: textScale.sm, color: stage.ink2, marginTop: 2, textAlign: 'left' },
  upRight: { alignItems: 'flex-end', marginStart: 12 },
  upWeight: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.xl, color: stage.ink0, textAlign: 'left' },
  // Same slot, the other voice: the word "bodyweight" where a figure would be (and a size down —
  // a word needs the room a two-digit number does not).
  // A MODIFIER composed onto `upWeight` (which declares the logical start); it only swaps the face
  // + size when the load is a word ("Bodyweight"). It never renders alone.
  upWeightWord: { fontFamily: font.sansSemibold, fontSize: textScale.md }, // rtl-ok
  upWeightUnit: { fontFamily: font.mono, fontSize: textScale.sm, color: stage.ink2, textAlign: 'left' },
  upDelta: { marginTop: 4 },
  /* ── The signature moment. The one place a load may appear during a between-sets rest. ──
     The old load is struck through and RECEDES; the new one is the brightest thing on the stage.
     That is READOUT's whole law doing the work it exists for — emphasis is distance from the
     ground, so what matters lifts and what is finished falls away. No arrow of colour, no green
     "up" chip: the number itself carries the news. */
  corr: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: stage[2], gap: 6 },
  corrRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8 },
  corrFrom: {
    fontFamily: font.mono,
    fontVariant: ['tabular-nums'],
    fontSize: textScale.lg,
    color: stage.ink2,
    textDecorationLine: 'line-through',
    textAlign: 'left',
  },
  corrArrow: { fontFamily: font.mono, fontSize: textScale.sm, color: stage.ink2, textAlign: 'left' },
  corrTo: {
    fontFamily: font.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: textScale['2xl'],
    color: stage.lift, // the brightest value the stage has — this is the news
    letterSpacing: -0.5,
    textAlign: 'left',
  },
  corrUnit: { fontFamily: font.mono, fontSize: textScale.sm, color: stage.ink1, textAlign: 'left' },
  /* The reason, in Hush's voice, under the number it earned — never apart from it. */
  corrWhy: { fontFamily: font.sans, fontSize: textScale.sm, color: stage.ink1, lineHeight: 19, textAlign: 'center' },

  upSetup: { marginTop: 12, alignItems: 'center' },
  upActions: { flexDirection: 'row', gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: stage[2] },

  // Sheets
  sheetLegend: { marginBottom: 4 },
  sheetTitle: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, marginTop: 4, marginBottom: 18, textAlign: 'left' },
  sheetBody: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 22, color: color.textSecondary, marginTop: 6, marginBottom: 18, textAlign: 'left' },
  sheetActions: { gap: 10 },

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
