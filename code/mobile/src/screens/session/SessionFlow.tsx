/**
 * Session Flow controller — rebuilt to the hush_iphone_v1 prototype + founder
 * corrections:
 *  - Header shows the LIVE clock time (#4), pause glyph on the right (#3).
 *  - Active Set: exercise name on top, hero weight, "× reps", "Set n of m", and a
 *    small ▲/▼ progression arrow (no spoken sentence — #13). Edit result · Complete set.
 *  - Set Confirmation (#6): after Complete set, the performed "{weight} × {reps}" is
 *    shown for ~1.1s (name on top) before advancing to rest / Well Done.
 *  - Inter-set / Transition Rest: exercise name on TOP (#8), countdown, load, and a
 *    bpm + kcal line from the paired watch (#7) above Ready.
 *  - Edit Result updates the CURRENT set only (#5) — Complete set is the sole logger.
 *
 * The session engine (sessionStore) is unchanged except editCurrentSet; this screen
 * renders weight/reps/progression from the FROZEN model.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextAction } from '@/components/TextAction';
import { BottomSheet } from '@/components/BottomSheet';
import { WorkoutTopBar } from '@/components/WorkoutTopBar';
import { Eyebrow } from '@/components/Eyebrow';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { Wheel } from '@/components/Wheel';
import { ProgressArrow, directionFromReason } from '@/components/ProgressArrow';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { useSession, type CompleteResult } from '@/state/stores/sessionStore';
import { useWorkoutVitals, estimateActiveKcal } from '@/platform/health/useWorkoutVitals';
import { exercisesForCapability, exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { color, space, tnum, heroNum, heroTitle, s } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'SessionFlow'>;
type Overlay = 'none' | 'pause' | 'edit' | 'demo';
type Confirm = { weight: number | null; reps: number };

const CONFIRM_DWELL_MS = 1100; // §3.3 — brief result acknowledgement

export function SessionFlow({ navigation }: Props) {
  const { t } = useCopy();
  const session = useSession();
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const units = useApp().profile?.units ?? 'kg';
  const confirmRunning = useRef(false);

  function goWellDone(r: CompleteResult) {
    navigation.replace('WellDone', { unlockedPortrait: r.unlockedPortrait });
  }
  function openPause() {
    session.pause();
    setOverlay('pause');
  }
  function resume() {
    session.resume();
    setOverlay('none');
  }

  // Complete set → show the result briefly (#6), then log + advance. completeSet
  // reads the live session/machine via refs, so the captured closure is safe.
  function onCompleteSet() {
    const tgt = session.currentTarget;
    if (!tgt || confirm) return;
    setConfirm({ weight: tgt.recommendedWeight, reps: tgt.recommendedReps });
  }
  useEffect(() => {
    if (!confirm || confirmRunning.current) return;
    confirmRunning.current = true;
    const id = setTimeout(async () => {
      const r = await session.completeSet();
      confirmRunning.current = false;
      setConfirm(null);
      if (r.ended) goWellDone(r);
    }, CONFIRM_DWELL_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm]);

  const showPause = !confirm; // the brief confirmation has no pause control (§3.3)

  return (
    <SafeAreaView style={styles.root}>
      <WorkoutTopBar onPause={showPause ? openPause : undefined} />

      {confirm ? (
        <Confirmation units={units} confirm={confirm} />
      ) : session.displayPhase === 'SET_PRESENTED' ? (
        <ActiveSet units={units} onEdit={() => setOverlay('edit')} onComplete={onCompleteSet} />
      ) : (
        <Rest units={units} paused={session.paused} onComplete={goWellDone} />
      )}

      {overlay === 'pause' ? (
        <PauseSheet
          onResume={resume}
          onShowExercise={() => setOverlay('demo')}
          onFinish={async () => {
            const r = await session.finishEarly();
            goWellDone(r);
          }}
        />
      ) : null}
      {overlay === 'demo' ? (
        <ExerciseDemo
          title={session.currentExercise?.name ?? ''}
          cues={session.currentExercise?.cues ?? []}
          focusLabel={t('workout.focusOn')}
          formGuideLabel={t('workout.formGuide')}
          doneLabel={t('workout.demoDone')}
          onDone={() => setOverlay('pause')}
        />
      ) : null}
      {overlay === 'edit' ? (
        <EditResult units={units} onDismiss={() => setOverlay('none')} />
      ) : null}
    </SafeAreaView>
  );
}

// ----------------------------------------------------------------- Active Set
function ActiveSet({
  units,
  onEdit,
  onComplete,
}: {
  units: 'kg' | 'lb';
  onEdit: () => void;
  onComplete: () => void;
}) {
  const { t } = useCopy();
  const session = useSession();

  const ex = session.currentExercise;
  const target = session.currentTarget;
  if (!target) return <View style={styles.center} />;
  const exName = ex?.name ?? exerciseDisplayName(session.currentExerciseId);

  const weight = displayWeight(target.recommendedWeight, units);
  const isBodyweight = target.recommendedWeight == null;
  // #13: a silent ▲/▼ arrow instead of a coaching sentence (▲ up, ▼ down, none = same).
  const direction = directionFromReason(target.reasonType);

  return (
    <View style={styles.phaseRoot}>
      <View style={styles.heroWrap}>
        <View style={styles.hero}>
          <Text style={styles.exerciseName}>{exName}</Text>
          {isBodyweight ? (
            <Text style={styles.bodyweight}>{t('workout.bodyweight')}</Text>
          ) : (
            <View style={styles.weightRow}>
              <Text
                style={styles.weight}
                accessibilityLabel={`${weight} ${units === 'kg' ? 'kilograms' : 'pounds'}`}
              >
                {weight}
              </Text>
              <Text style={styles.unit}>{unitLabel(units)}</Text>
            </View>
          )}
          <Text style={styles.reps}>{t('workout.reps', { reps: target.recommendedReps })}</Text>
          {session.setLabel ? (
            <Text style={styles.setLabel}>
              {t('workout.setOfM', { n: session.setLabel.n, m: session.setLabel.m })}
            </Text>
          ) : null}
          {direction ? (
            <View style={styles.arrowRow}>
              <ProgressArrow direction={direction} />
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.actions}>
        <PrimaryButton variant="compact" label={t('workout.completeSet')} onPress={onComplete} />
        <View style={styles.editRow}>
          <TextAction label={t('workout.editResult')} onPress={onEdit} />
        </View>
      </View>
    </View>
  );
}

// ------------------------------------------------------------- Set Confirmation
function Confirmation({ units, confirm }: { units: 'kg' | 'lb'; confirm: Confirm }) {
  const session = useSession();
  const exName = session.currentExercise?.name ?? exerciseDisplayName(session.currentExerciseId);
  const w = displayWeight(confirm.weight, units);
  const text = w != null ? `${w} × ${confirm.reps}` : `${confirm.reps}`;
  return (
    <View style={styles.phaseRoot}>
      <View style={styles.heroWrap}>
        <View style={styles.hero}>
          {exName ? <Text style={styles.exerciseName}>{exName}</Text> : null}
          <Text style={styles.confirmText} accessibilityRole="text">{text}</Text>
        </View>
      </View>
    </View>
  );
}

// ----------------------------------------------------------------------- Rest
function Rest({
  units,
  paused,
  onComplete,
}: {
  units: 'kg' | 'lb';
  paused: boolean;
  onComplete: (r: CompleteResult) => void;
}) {
  const { t } = useCopy();
  const app = useApp();
  const session = useSession();
  // Watch users: live bpm + kcal from the paired watch (#7). Everyone else: an
  // estimated calorie burn so watch-less athletes still see calories (founder #1).
  const watchVitals = useWorkoutVitals(true);
  const elapsedMin = session.startedAtMs ? (Date.now() - session.startedAtMs) / 60000 : 0;
  const estKcal = estimateActiveKcal(app.profile?.weightKg, elapsedMin);
  const isTransition = session.displayPhase === 'REST_TRANSITION';
  const nextEx = session.nextExercise;
  const nextName = exerciseDisplayName(session.nextExerciseId);
  const nextTarget = session.nextTarget;
  const nextWeight = displayWeight(nextTarget?.recommendedWeight ?? null, units);
  const nextReps = nextTarget?.recommendedReps ?? 0;

  const [remaining, setRemaining] = useState(session.restSeconds);
  useEffect(() => {
    setRemaining(session.restSeconds);
  }, [session.restSeconds, session.displayPhase]);
  useEffect(() => {
    if (paused) return;
    if (remaining <= 0) {
      session.endRest();
      return;
    }
    const id = setTimeout(() => setRemaining((sec) => sec - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining, paused, session]);

  void onComplete; // rest never ends the session directly; kept for signature parity

  const setLine =
    nextWeight != null ? `${nextWeight} ${unitLabel(units)} × ${nextReps}` : `${t('workout.bodyweight')} × ${nextReps}`;

  // Exercise Busy (§5.5): auto-swap the upcoming exercise to a same-pattern alternative.
  const alt = nextEx ? exercisesForCapability(nextEx.capability).find((e) => e.id !== nextEx.id) : undefined;
  function onExerciseBusy() {
    if (!nextEx || !alt) return;
    if (nextTarget?.blockId) {
      void app.model.replaceBlock({ blockId: nextTarget.blockId, fromExercise: nextEx.id, toExercise: alt.id });
    }
    session.swapNextExercise(alt.id);
  }

  return (
    <View style={styles.phaseRoot}>
      <View style={styles.heroWrap}>
        <View style={styles.hero}>
          {/* #8: exercise name on TOP, like Active Set. */}
          {nextName ? <Text style={styles.restName}>{nextName}</Text> : null}
          <Text style={styles.restEyebrow}>
            {isTransition
              ? t('workout.nextExercise')
              : session.nextSetLabel
                ? t('workout.setOfM', { n: session.nextSetLabel.n, m: session.nextSetLabel.m })
                : ''}
          </Text>
          <Text style={styles.timer}>{fmt(remaining)}</Text>
          <Text style={styles.restSet}>{setLine}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <View style={styles.bpmRow}>
          {watchVitals ? <Text style={styles.bpm}>{Math.round(watchVitals.heartRateBpm)} bpm</Text> : null}
          <Text style={styles.bpm}>{watchVitals ? Math.round(watchVitals.activeKcal) : estKcal} kcal</Text>
        </View>
        <TextAction label={t('workout.ready')} tone="primary" onPress={() => session.endRest()} />
        {isTransition && nextEx && alt ? (
          <View style={styles.busyRow}>
            <TextAction label={t('workout.exerciseBusy')} onPress={onExerciseBusy} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

// -------------------------------------------------------------------- Pause sheet
function PauseSheet({
  onResume,
  onShowExercise,
  onFinish,
}: {
  onResume: () => void;
  onShowExercise: () => void;
  onFinish: () => void;
}) {
  const { t } = useCopy();
  return (
    <BottomSheet onClose={onResume} background={color.surface}>
      <Text style={styles.pauseTitle}>{t('pauseSheet.title')}</Text>
      <View style={styles.pauseOpt}>
        <TextAction label={t('pauseSheet.resume')} tone="primary" onPress={onResume} />
      </View>
      <View style={styles.pauseOpt}>
        <TextAction label={t('pauseSheet.showExercise')} onPress={onShowExercise} />
      </View>
      <View style={styles.pauseOpt}>
        <TextAction label={t('pauseSheet.finishEarly')} onPress={onFinish} />
      </View>
    </BottomSheet>
  );
}

// --------------------------------------------------------------- Edit Result sheet
function EditResult({ units, onDismiss }: { units: 'kg' | 'lb'; onDismiss: () => void }) {
  const { t } = useCopy();
  const session = useSession();
  const target = session.currentTarget;
  const recReps = target?.recommendedReps ?? 8;
  const recWeight = displayWeight(target?.recommendedWeight ?? null, units);
  const [reps, setReps] = useState(recReps);
  const [weight, setWeight] = useState(recWeight ?? 0);
  const hasWeight = target?.recommendedWeight != null;

  const repValues = rangeStep(1, 20, 1);
  const base = recWeight ?? 0;
  const weightValues = rangeStep(Math.max(0, base - 50), base + 50, 1); // 1 kg steps (founder)

  function save() {
    // #5: update the CURRENT set only (store back in kg). Does NOT log — Complete set
    // remains the sole confirmer. Active Set re-renders with the new weight/reps.
    const kg = !hasWeight ? null : units === 'lb' ? +(weight / 2.2046226).toFixed(1) : weight;
    session.editCurrentSet({ weight: kg, reps });
    onDismiss();
  }

  return (
    <BottomSheet onClose={onDismiss} background={color.surface} heightFraction={0.48}>
      <View style={styles.editHeader}>
        {hasWeight ? <Eyebrow label={t('editResult.weight')} size={11} trackingPx={1} style={styles.editEyebrow} /> : <View />}
        <Eyebrow label={t('editResult.repsLabel')} size={11} trackingPx={1} style={styles.editEyebrow} />
      </View>
      <View style={styles.wheelRow}>
        {hasWeight ? (
          <Wheel values={weightValues} selected={weight} onChange={setWeight} format={(v) => `${v}`} />
        ) : null}
        <Wheel values={repValues} selected={reps} onChange={setReps} format={(v) => `${v}`} />
      </View>
      <PrimaryButton variant="compact" label={t('editResult.save')} onPress={save} />
    </BottomSheet>
  );
}

function fmt(totalSeconds: number): string {
  const sec = Math.max(0, totalSeconds);
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function rangeStep(a: number, b: number, step: number): number[] {
  const out: number[] = [];
  for (let v = a; v <= b + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.gutter },
  phaseRoot: { flex: 1, paddingHorizontal: space.gutter },
  heroWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  hero: { alignItems: 'center' },
  exerciseName: { ...heroTitle(s(15)), color: color.textPrimary, fontSize: s(15), fontWeight: '700' },
  weightRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: s(10) },
  weight: { ...heroNum(s(50)), color: color.textPrimary, fontSize: s(50), lineHeight: s(56), fontWeight: '700' },
  unit: { fontSize: s(13), fontWeight: '500', color: color.textSecondary, marginLeft: s(5), marginBottom: s(8) },
  bodyweight: { ...heroTitle(s(34)), color: color.textPrimary, fontSize: s(34), fontWeight: '700', marginTop: s(12) },
  reps: { ...tnum, fontSize: s(15), fontWeight: '500', color: color.textSecondary, marginTop: s(4) },
  setLabel: { fontSize: s(11), color: color.textSecondary, marginTop: s(12) },
  arrowRow: { marginTop: s(14), alignItems: 'center' },

  // Set Confirmation
  confirmText: { ...heroNum(s(34)), color: color.textPrimary, fontSize: s(34), lineHeight: s(40), fontWeight: '700', marginTop: s(14) },

  // Rest — exercise name leads (on top, #8), then label, countdown, load.
  restName: { ...heroTitle(s(18)), fontSize: s(18), fontWeight: '700', color: color.textPrimary, textAlign: 'center' },
  restEyebrow: { fontSize: s(11), letterSpacing: 1, textTransform: 'uppercase', color: color.textTertiary, marginTop: s(8) },
  timer: { ...heroNum(s(42), -0.02), fontSize: s(42), lineHeight: s(48), fontWeight: '700', color: color.textPrimary, marginTop: s(10) },
  restSet: { ...tnum, fontSize: s(13), color: color.textSecondary, marginTop: s(8) },

  actions: { alignSelf: 'stretch', paddingBottom: s(32), alignItems: 'center' },
  editRow: { marginTop: s(12) },
  busyRow: { marginTop: s(10) },
  bpmRow: { flexDirection: 'row', gap: s(18), marginBottom: s(14) },
  bpm: { ...tnum, fontSize: s(13), color: color.textSecondary },

  // Pause sheet
  pauseTitle: { fontSize: s(18), fontWeight: '700', color: color.textPrimary, textAlign: 'center', marginBottom: s(24) },
  pauseOpt: { paddingVertical: s(10), alignItems: 'center' },

  // Edit Result
  editHeader: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 4 },
  editEyebrow: { textAlign: 'center' },
  wheelRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
});
