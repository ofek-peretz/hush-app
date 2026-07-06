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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon, type IconName } from '@/components/Icon';
import { Button, IconButton, RestRing, Card, LoadDelta, Legend, WheelPicker, useToast } from '@/components/ds';
import { BottomSheet } from '@/components/BottomSheet';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { useApp } from '@/state/stores/appStore';
import { useFocusedStatusBar } from '@/platform/statusBar';
import { useSession, type CompleteResult } from '@/state/stores/sessionStore';
import { exerciseDisplayName } from '@/data/exercises';
import { swapLadder } from '@/domain/replacement';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { loadSetup, type LoadSetup } from '@/domain/loadPresentation';
import { db } from '@/data/local/db';
import * as haptics from '@/platform/haptics';
import { restHaptics } from '@/platform/restHaptics';
import { color, space, stage, font, textScale, tracking, trackingPx, signal, up, down, radius } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'SessionFlow'>;
type Overlay = 'none' | 'pause' | 'reasoning' | 'demo' | 'firstGym';
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

  // Capture the engine's pristine recommended load the first time each set is presented (before
  // an Edit Result mutates it). Done during render so the value is the untouched engine number.
  const curIdx = session.globalProgress?.index ?? -1;
  if (curIdx !== lastIdxRef.current) {
    lastIdxRef.current = curIdx;
    originalWeightRef.current = session.currentTarget?.recommendedWeight ?? null;
  }

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
  function openPause() {
    session.pause();
    setOverlay('pause');
  }
  function resume() {
    session.resume();
    setOverlay('none');
  }
  async function finish() {
    // Navigation is driven by the `endResult` effect above (one path for phone + watch).
    await session.finishEarly();
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
    haptics.setLogged(); // the set is captured — a light, affirmative tick
    const corrected = correctedRef.current;
    correctedRef.current = false;
    const id = setTimeout(async () => {
      const r = await session.completeSet();
      confirmRunning.current = false;
      setConfirm(null);
      // Non-blocking confirmation that Hush will remember the corrected load — shown at most ONCE
      // per workout, and NEVER when this set ends the workout (it must never float over Well Done).
      if (corrected && !r.ended && !learnToastShownRef.current) {
        learnToastShownRef.current = true;
        toast.show(t('load.remembered'));
      }
      // When r.ended, the `endResult` effect navigates to Well Done (one path for phone + watch).
    }, CONFIRM_DWELL_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm]);

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
    toast.show(t('swap.swappedTo', { name: exerciseDisplayName(id) }), {
      actions: [
        { label: t('swap.tryAnother'), onPress: () => swapActionsRef.current.tryAnother() },
        { label: t('swap.undo'), onPress: () => swapActionsRef.current.undo() },
      ],
    });
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
      toast.show(t('swap.restored', { name: exerciseDisplayName(st.originalId) }));
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
    const ladder = swapLadder(exId, prefs);
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
            onExit={openPause}
            onDemo={() => setOverlay('demo')}
            onSwap={() => void startQuickSwap('next')}
          />
        )}
      </SafeAreaView>

      {overlay === 'pause' ? (
        <BottomSheet onClose={resume}>
          <Legend style={styles.sheetLegend}>{t('pauseSheet.legend')}</Legend>
          <Text style={styles.sheetTitle}>{t('pauseSheet.title')}</Text>
          <Text style={styles.sheetBody}>{t('pauseSheet.body')}</Text>
          <View style={styles.sheetActions}>
            <Button variant="primary" block label={t('pauseSheet.resume')} onPress={resume} />
            <Button variant="danger" block label={t('pauseSheet.finishWorkout')} onPress={finish} />
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
          cues={session.currentExercise?.cues ?? []}
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
function StageBar({ center, onExit }: { center: string; onExit: () => void }) {
  const { t } = useCopy();
  return (
    <View style={styles.stageBar}>
      <View style={styles.stageBarSide}>
        <IconButton onStage accessibilityLabel={t('pauseSheet.title')} onPress={onExit}>
          <Icon name="close" size={20} color={stage.ink1} strokeWidth={2} />
        </IconButton>
      </View>
      <Text style={styles.stageBarCenter}>{center}</Text>
      <View style={[styles.stageBarSide, styles.stageBarRight]} />
    </View>
  );
}

function SetDots({ total, index, done }: { total: number; index: number; done: number }) {
  return (
    <View style={styles.dots}>
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
      return 'layers'; // barbell, plate_loaded
  }
}

/**
 * The execution INSTRUCTION — sits directly under the load (the athlete's "what do I do now?").
 * TO-LOAD: a bright imperative chip (verb + figure). LOADED (after the first set at this load): a
 * quiet "loaded" confirmation. It is the prescription's action, never secondary metadata.
 */
function ExecInstruction({ setup, toLoad, units }: { setup: LoadSetup; toLoad: boolean; units: 'kg' | 'lb' }) {
  const { t } = useCopy();
  if (toLoad) {
    const { verb, figure } = execParts(setup, t, units);
    return (
      <View style={styles.instrChip}>
        <Icon name={execGlyph(setup.style)} size={18} color={signal[0]} strokeWidth={2} />
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
      <Icon name="check" size={15} color={up[0]} strokeWidth={2.4} />
      <Text style={styles.instrDoneText}>{execConfirmation(setup, t)}</Text>
    </View>
  );
}

/* ----------------------------------------------------------------- Active Set */
function ActiveSet({
  units,
  editing,
  onToggleEdit,
  onComplete,
  onExit,
  onWhy,
  onDemo,
  onSwap,
}: {
  units: 'kg' | 'lb';
  editing: boolean;
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

  const canSwap = exNo === 1 && setN === 1; // first set of the first exercise

  return (
    <>
      <StageBar center={t('workout.exerciseCount', { n: exNo, N: total })} onExit={onExit} />
      <View style={styles.stageBody}>
        {group ? <Text style={styles.group}>{t(`muscle.${group}`).toUpperCase()}</Text> : null}
        <Text style={styles.exName}>{exName}</Text>

        {!editing ? (
          <>
            {/* 1 · LOAD — Hush's decision, the hero (set before you arrived). */}
            {isBodyweight ? (
              <Text style={styles.bodyweight}>{t('workout.bodyweight')}</Text>
            ) : (
              <View style={styles.heroRow}>
                <Text style={styles.hero} accessibilityLabel={`${heroValue} ${unitLabel(units)}`}>{heroValue}</Text>
                <Text style={styles.heroUnit}>{unitLabel(units)}</Text>
              </View>
            )}

            {/* 2 · INSTRUCTION — what the athlete physically does now (part of the prescription). */}
            {setup ? <ExecInstruction setup={setup} toLoad={session.toLoad} units={units} /> : null}

            {/* 3 · REPS — the execution target. */}
            <View style={styles.repsPill}>
              <Text style={styles.repsTimes}>×</Text>
              <Text style={styles.repsNum}>{target.recommendedReps}</Text>
              <Text style={styles.repsWord}>{t('workout.repsUnit')}</Text>
            </View>

            {/* 4 · WHY / Δ — optional reasoning, demoted below the instruction so it never competes
                  with it. The delta is shown when the load changed; the row taps through to "why". */}
            {!isBodyweight ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('whyLoad.legend')}
                onPress={onWhy}
                style={({ pressed }) => [styles.whyDeltaRow, pressed && styles.loadBtnPressed]}
              >
                {reason ? (
                  <LoadDelta
                    direction={reason === 'increase' ? 'up' : reason === 'decrease' ? 'down' : 'hold'}
                    value={deltaMag}
                    unit={unitLabel(units)}
                    size="sm"
                    pill
                  />
                ) : null}
                <Text style={styles.whyText}>{t('whyLoad.trigger')}</Text>
                <Icon name="chevronRight" size={13} color={stage.ink2} strokeWidth={2} />
              </Pressable>
            ) : null}
          </>
        ) : (
          <View style={styles.editBlock}>
            {!isBodyweight ? (
              <View style={styles.editRow}>
                <Text style={styles.editLabel}>{t('workout.actualWeight')}</Text>
                <WheelPicker value={weight ?? 0} onChange={setWeight} step={wStep} min={0} max={units === 'kg' ? 500 : 1100} unit={unitLabel(units)} label={t('workout.actualWeight')} onStage style={styles.editWheel} />
              </View>
            ) : null}
            <View style={styles.editRow}>
              <Text style={styles.editLabel}>{t('workout.actualReps')}</Text>
              <WheelPicker value={target.recommendedReps} onChange={setReps} step={1} min={0} max={50} unit={t('workout.repsUnit')} label={t('workout.actualReps')} onStage style={styles.editWheel} />
            </View>
          </View>
        )}

        <View style={styles.dotsWrap}>
          <SetDots total={setM} index={setN - 1} done={setN - 1} />
          <Text style={styles.setLabel}>{t('workout.setOfM', { n: setN, m: setM })}</Text>
        </View>
      </View>

      <View style={styles.stageFooter}>
        <Button
          variant="onstage"
          size="lg"
          block
          label={editing ? t('workout.saveComplete') : t('workout.completeSet')}
          onPress={onComplete}
        />
        <View style={styles.ghostRow}>
          <StageGhost icon={editing ? 'check' : 'pencil'} label={editing ? t('workout.editDone') : t('workout.editResult')} onPress={onToggleEdit} />
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
        <Icon name="check" size={20} color={up[0]} strokeWidth={2.4} />
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
  onExit,
  onDemo,
  onSwap,
}: {
  units: 'kg' | 'lb';
  paused: boolean;
  onExit: () => void;
  onDemo: () => void;
  onSwap: () => void;
}) {
  const { t } = useCopy();
  const session = useSession();
  const isTransition = session.displayPhase === 'REST_TRANSITION';
  const nextName = session.nextExercise?.name ?? exerciseDisplayName(session.nextExerciseId);
  const nextGroup = session.nextExercise?.muscle ?? '';
  const nextTarget = session.nextTarget;
  // The upcoming load is the engine's prescribed value verbatim (same number the athlete will lift).
  const nextWeight = displayWeight(nextTarget?.recommendedWeight ?? null, units);
  const nextReps = nextTarget?.recommendedReps ?? 0;
  const nextSet = session.nextSetLabel;
  const nextDelta = nextTarget?.reasonType;

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

  // A new rest period (duration changed / phase changed): reset and re-anchor.
  useEffect(() => {
    setTotal(session.restSeconds);
    setRemaining(session.restSeconds);
    remainingRef.current = session.restSeconds;
    endAtRef.current = paused ? null : Date.now() + session.restSeconds * 1000;
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

  // +15s: extend the absolute end but KEEP `total` fixed (the design adds only to
  // `remaining`), so the ring visibly fills FORWARD by a clear 15/total slice — the
  // "loading" top-up — instead of the near-imperceptible nudge you get when total
  // grows in lock-step. Then re-sync, and tell the session store so the longer rest
  // re-publishes to the Apple Watch / Live Activity (a phone +15 must reach the watch).
  const addFifteen = useCallback(() => {
    remainingRef.current += 15;
    endAtRef.current = (endAtRef.current ?? Date.now() + remainingRef.current * 1000) + 15000;
    beatsFiredRef.current.clear(); // the final-seconds window moved out — re-arm the countdown
    prevRemForBeatsRef.current = remainingRef.current;
    sync();
    void restHaptics.arm(endAtRef.current); // the end moved out — reschedule the OS alerts
    session.extendRest(15);
  }, [sync, session]);

  return (
    <>
      <StageBar center={isTransition ? t('workout.nextExercise') : t('workout.rest')} onExit={onExit} />
      <View style={styles.stageBody}>
        <RestRing
          remaining={remaining}
          total={total || 1}
          size={196}
          stroke={6}
          onStage
          label={remaining <= 0 ? t('workout.ready') : t('workout.rest')}
        />

        <View style={styles.upNext}>
          <Legend tone="onStage" style={styles.upNextLegend}>{t('workout.upNext')}</Legend>
          <Card stage pad="md">
            <View style={styles.upRow}>
              <View style={styles.upInfo}>
                {isTransition && nextGroup ? <Text style={styles.upGroup}>{t(`muscle.${nextGroup}`).toUpperCase()}</Text> : null}
                <Text style={styles.upName}>{nextName}</Text>
                <Text style={styles.upMeta}>
                  {isTransition
                    ? t('workout.setsAnd', { sets: nextSet?.m ?? 1, reps: nextReps })
                    : `${t('workout.setOfM', { n: nextSet?.n ?? 1, m: nextSet?.m ?? 1 })} · × ${nextReps}`}
                </Text>
              </View>
              <View style={styles.upRight}>
                <Text style={styles.upWeight}>
                  {nextWeight != null ? nextWeight : t('workout.bodyweight')}
                  {nextWeight != null ? <Text style={styles.upWeightUnit}> {unitLabel(units)}</Text> : null}
                </Text>
                {isTransition && nextDelta ? (
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
            </View>
            {isTransition ? (
              <View style={styles.upActions}>
                <StageGhost icon="playCircle" label={t('workout.form')} onPress={onDemo} />
                <StageGhost icon="repeat" label={t('workout.swapExercise')} onPress={onSwap} />
              </View>
            ) : null}
          </Card>
        </View>
      </View>

      <View style={styles.stageFooter}>
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
  const target = session.currentTarget;
  const exName = session.currentExercise?.name ?? exerciseDisplayName(session.currentExerciseId);
  if (!target) return null;

  const to = displayWeight(target.recommendedWeight, units) ?? 0;
  const deltaMag = displayWeight(Math.abs(target.reasonDelta ?? 0), units) ?? 0;
  const unit = unitLabel(units);
  const tone: 'up' | 'down' | 'hold' =
    target.reasonType === 'increase' ? 'up' : target.reasonType === 'decrease' ? 'down' : 'hold';
  const toneColor = tone === 'up' ? up[0] : tone === 'down' ? down[0] : color.hold;
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
  center: { flex: 1 },

  // Stage chrome
  stageBar: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  stageBarSide: { width: 44 },
  stageBarRight: { alignItems: 'flex-end' },
  stageBarCenter: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink2 },

  stageBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.gutter },
  stageFooter: { paddingHorizontal: space.gutter, paddingBottom: 14, gap: 10 },

  // Active set
  group: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink2, marginBottom: 10 },
  exName: { fontFamily: font.sansSemibold, fontSize: textScale['2xl'], letterSpacing: trackingPx(textScale['2xl'], tracking.tight), color: stage.ink0, textAlign: 'center', maxWidth: 320 },
  loadBtn: { marginTop: 30, alignItems: 'center', paddingVertical: 6, paddingHorizontal: 16, borderRadius: radius.md },
  // Tapping the load reveals "why this load" — a quiet, intentional dim, never a button-like fill.
  loadBtnPressed: { opacity: 0.55 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end' },
  // Equipment-native setup instruction under the headline (plate math, pin, per hand, fixed bar).
  setupLines: { marginTop: 12, alignItems: 'center', gap: 3 },
  setupLine: { fontFamily: font.mono, fontSize: textScale.sm, color: stage.ink1, letterSpacing: 0.2 },
  // Instruction-first execution: the imperative chip (TO-LOAD) + the quiet confirmation (LOADED),
  // sitting directly under the load — the athlete's "what do I do now?".
  instrChip: { marginTop: 16, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 18, backgroundColor: stage[1], borderWidth: 1, borderColor: stage[2], borderRadius: radius.lg },
  instrCol: { alignItems: 'flex-start' },
  instrVerb: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: signal[0], marginBottom: 2 },
  instrFigure: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.lg, color: stage.ink0 },
  instrVerbSolo: { fontFamily: font.sansSemibold, fontSize: textScale.lg, letterSpacing: trackingPx(textScale.lg, tracking.tight), color: stage.ink0 },
  instrDone: { marginTop: 16, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7 },
  instrDoneText: { fontFamily: font.mono, fontSize: textScale.sm, color: stage.ink2 },
  // Why / Δ — demoted below the instruction; quiet and optional, never competing with it.
  whyDeltaRow: { marginTop: 18, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.md },
  whyText: { fontFamily: font.sansMedium, fontSize: textScale.sm, color: stage.ink2 },
  repsPill: { marginTop: 16, alignSelf: 'center', flexDirection: 'row', alignItems: 'baseline', gap: 7, paddingVertical: 9, paddingHorizontal: 18, borderWidth: 1, borderColor: stage[2], borderRadius: radius.full },
  repsTimes: { fontFamily: font.mono, fontSize: textScale.md, color: stage.ink2 },
  repsNum: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.xl, color: stage.ink0 },
  addFifteen: { alignItems: 'center', paddingVertical: 10, borderRadius: radius.md },
  // lineHeight must be ≥ fontSize or RN clips the tall mono digit tops (the web
  // design's 0.9 is safe there but not in RN). Slight headroom keeps glyphs whole.
  hero: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.data, letterSpacing: trackingPx(textScale.data, tracking.display), color: stage.ink0, lineHeight: Math.round(textScale.data * 1.06), includeFontPadding: false },
  heroUnit: { fontFamily: font.mono, fontSize: textScale.lg, color: stage.ink2, marginStart: 6, marginBottom: 12 },
  bodyweight: { fontFamily: font.sansSemibold, fontSize: textScale['3xl'], color: stage.ink0, marginTop: 28 },
  deltaWrap: { marginTop: 16, height: 26, alignItems: 'center' },
  repsWord: { fontFamily: font.sans, fontSize: textScale.sm, color: stage.ink2 },

  // Inline edit
  editBlock: { marginTop: 30, width: '100%', maxWidth: 300, gap: 16 },
  editRow: { gap: 8 },
  editWheel: { alignSelf: 'stretch' },
  editLabel: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink2 },

  dotsWrap: { marginTop: 24, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: 7, justifyContent: 'center' },
  dot: { height: 7, borderRadius: 4 },
  dotDone: { backgroundColor: up[0] },
  dotActive: { backgroundColor: signal[0] },
  dotRest: { backgroundColor: stage[2] },
  setLabel: { fontFamily: font.mono, fontSize: textScale.sm, color: stage.ink2, marginTop: 12 },

  // Ghost actions
  ghostRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  ghost: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
  ghostPressed: { backgroundColor: stage[1] },
  ghostLabel: { fontFamily: font.sansMedium, fontSize: textScale.sm, color: stage.ink1 },

  // Logged beat
  loggedRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  loggedHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loggedLegend: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: up[0] },
  loggedValue: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, marginTop: 30 },
  loggedNum: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale['5xl'], color: stage.ink0, lineHeight: Math.round(textScale['5xl'] * 1.06), letterSpacing: trackingPx(textScale['5xl'], tracking.display), includeFontPadding: false },
  loggedUnit: { fontFamily: font.mono, fontSize: textScale.lg, color: stage.ink2 },
  loggedTimes: { fontFamily: font.mono, fontSize: textScale['2xl'], color: stage.ink2, marginHorizontal: 4 },
  loggedCopy: { fontFamily: font.sans, fontSize: textScale.sm, color: stage.ink2, marginTop: 18, maxWidth: 260, textAlign: 'center' },

  // Up next card
  upNext: { marginTop: 40, width: '100%', maxWidth: 340 },
  upNextLegend: { marginBottom: 12 },
  upRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  upInfo: { flex: 1, minWidth: 0 },
  upGroup: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink2 },
  upName: { fontFamily: font.sansSemibold, fontSize: textScale.md, color: stage.ink0, marginTop: 3 },
  upMeta: { fontFamily: font.mono, fontSize: textScale.sm, color: stage.ink2, marginTop: 2 },
  upRight: { alignItems: 'flex-end', marginStart: 12 },
  upWeight: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.xl, color: stage.ink0 },
  upWeightUnit: { fontFamily: font.mono, fontSize: textScale.sm, color: stage.ink2 },
  upDelta: { marginTop: 4 },
  upActions: { flexDirection: 'row', gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: stage[2] },

  // Sheets
  sheetLegend: { marginBottom: 4 },
  sheetTitle: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, marginTop: 4, marginBottom: 18 },
  sheetBody: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 22, color: color.textSecondary, marginTop: 6, marginBottom: 18 },
  sheetActions: { gap: 10 },

  // Swap rows

  // Why this load (the in-session, single-line cousin of the Why triple)
  whyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6 },
  whyName: { flex: 1, fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary },
  verdictBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 11, borderRadius: radius.full },
  verdictText: { fontFamily: font.sansSemibold, fontSize: textScale.xs },
  whyNums: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 16 },
  whyFrom: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: textScale.lg, color: color.textTertiary },
  whyTo: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale['3xl'], letterSpacing: -0.7 },
  whyKg: { fontFamily: font.mono, fontSize: textScale.md, color: color.textMuted },
  whyLine: { fontFamily: font.sans, fontSize: textScale.base, color: color.textSecondary, lineHeight: 23, marginTop: 14 },
  whyNote: { flexDirection: 'row', gap: 9, marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: color.border },
  whyNoteText: { flex: 1, fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, lineHeight: 20 },
  whyGot: { marginTop: 18 },
});
