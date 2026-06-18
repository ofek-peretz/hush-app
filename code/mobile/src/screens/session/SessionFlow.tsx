/**
 * Session Flow controller (HUSH_BUILD_SPEC §4.9–4.17). One phase-driven surface:
 *  - Active Set (§4.9): exercise name, baseline-aligned weight, "× reps",
 *    "Set n of m", a POSITIVE coaching line (§5.4), Edit result, Complete set
 *    (which morphs to "{reps} ✓" for ~0.8s on success, §4.10).
 *  - Inter-set Rest (§4.11) / Transition Rest (§4.12): live countdown, the
 *    upcoming set/exercise, Ready, and Exercise Busy (auto-swap, §5.5).
 *  - Edit Result (§4.13), Pause (§4.14), Exercise Demo (§4.15) bottom sheets.
 *
 * The session engine (sessionStore) is unchanged — only presentation. Weight,
 * reps and progression come from the FROZEN model; this screen renders them.
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
import { Icon } from '@/components/Icon';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { Wheel } from '@/components/Wheel';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { useSession, type CompleteResult } from '@/state/stores/sessionStore';
import { exercisesForCapability, exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { color, space, tnum, heroNum, heroTitle, press } from '@/design/tokens';
import { motion } from '@/design/motion';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'SessionFlow'>;
type Overlay = 'none' | 'pause' | 'edit' | 'demo';

export function SessionFlow({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const session = useSession();
  const [overlay, setOverlay] = useState<Overlay>('none');
  const units = app.profile?.units ?? 'kg';

  // Rough "minutes left" for the top bar: remaining sets × ~2 min (work + rest).
  const prog = session.globalProgress;
  const minutesLeft = prog ? Math.max(1, Math.round((prog.total - prog.index) * 2)) : 1;

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

  return (
    <SafeAreaView style={styles.root}>
      <WorkoutTopBar minutesLeft={minutesLeft} onPause={openPause} />

      {session.displayPhase === 'SET_PRESENTED' ? (
        <ActiveSet units={units} onEdit={() => setOverlay('edit')} onComplete={goWellDone} />
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
          // From Pause → Show exercise: Done returns to the (still-frozen) Pause sheet.
          onDone={() => setOverlay('pause')}
        />
      ) : null}
      {overlay === 'edit' ? (
        <EditResult units={units} onDismiss={() => setOverlay('none')} onDone={goWellDone} />
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
  onComplete: (r: CompleteResult) => void;
}) {
  const { t } = useCopy();
  const session = useSession();
  const [successReps, setSuccessReps] = useState<number | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A Pause during the success morph cancels the pending Complete-Set (§7.2).
  useEffect(() => {
    if (session.paused && successTimer.current) {
      clearTimeout(successTimer.current);
      successTimer.current = null;
      setSuccessReps(null);
    }
  }, [session.paused]);
  useEffect(() => () => {
    if (successTimer.current) clearTimeout(successTimer.current);
  }, []);

  const ex = session.currentExercise;
  const target = session.currentTarget;
  // Only a truly absent target blanks the set; a missing catalog entry still shows
  // a readable name (the set is a decision, never an empty screen — §7.9).
  if (!target) return <View style={styles.center} />;
  const exName = ex?.name ?? exerciseDisplayName(session.currentExerciseId);

  const weight = displayWeight(target.recommendedWeight, units);
  const isBodyweight = target.recommendedWeight == null;
  // Coaching line (§5.4): positive only. Up when the model raised the load; else "You can do it."
  const delta = target.reasonType === 'increase' ? displayWeight(target.reasonDelta ?? null, units) : null;
  const coaching =
    delta != null && delta > 0
      ? t('workout.coachingUp', { delta })
      : t('workout.coachingHold');

  function onCompleteSet() {
    setSuccessReps(target!.recommendedReps); // morph to "{reps} ✓"
    successTimer.current = setTimeout(async () => {
      successTimer.current = null;
      const r = await session.completeSet();
      setSuccessReps(null);
      if (r.ended) onComplete(r);
    }, motion.completeSetSuccessMs);
  }

  const confirming = successReps != null;

  return (
    <View style={styles.center}>
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
        {/* Coaching line hidden during the confirmation morph (§4.10). */}
        {!confirming ? <Text style={styles.coaching}>{coaching}</Text> : null}
      </View>

      {/* Spec §4.9: Edit result sits above the primary Complete-set button (which is
          the bottom-most action). Edit is hidden during the confirmation morph. */}
      <View style={styles.actions}>
        {!confirming ? (
          <View style={styles.editRow}>
            <TextAction label={t('workout.editResult')} onPress={onEdit} />
          </View>
        ) : null}
        <PrimaryButton
          variant="compact"
          label={confirming ? String(successReps) : t('workout.completeSet')}
          trailing={confirming ? <Icon name="check" size={18} color={color.bg} strokeWidth={2.6} /> : undefined}
          disabled={confirming}
          onPress={onCompleteSet}
        />
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
  const isTransition = session.displayPhase === 'REST_TRANSITION';
  const nextEx = session.nextExercise;
  // Readable name even when the live id is absent from the local catalog (§7.9).
  const nextName = exerciseDisplayName(session.nextExerciseId);
  const nextTarget = session.nextTarget;
  const nextWeight = displayWeight(nextTarget?.recommendedWeight ?? null, units);
  const nextReps = nextTarget?.recommendedReps ?? 0;

  // Live countdown driven by the session clock.
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
    const id = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining, paused, session]);

  const setLine = nextWeight != null ? `${nextWeight} ${unitLabel(units)} × ${nextReps}` : `${t('workout.bodyweight')} × ${nextReps}`;

  // Exercise Busy (§5.5): auto-swap the upcoming exercise to a same-pattern
  // alternative, without ceremony. Persisted best-effort via the model.
  const alt = nextEx ? exercisesForCapability(nextEx.capability).find((e) => e.id !== nextEx.id) : undefined;
  function onExerciseBusy() {
    if (!nextEx || !alt) return;
    if (nextTarget?.blockId) {
      void app.model.replaceBlock({ blockId: nextTarget.blockId, fromExercise: nextEx.id, toExercise: alt.id });
    }
    session.swapNextExercise(alt.id);
  }

  return (
    <View style={styles.center}>
      <View style={styles.hero}>
        <Text style={styles.timer}>{fmt(remaining)}</Text>
        {isTransition ? (
          <>
            <Text style={styles.restEyebrow}>{t('workout.nextExercise')}</Text>
            {nextName ? <Text style={styles.restExercise}>{nextName}</Text> : null}
            <Text style={styles.restSet}>{setLine}</Text>
          </>
        ) : (
          <>
            {session.nextSetLabel ? (
              <Text style={styles.restSetLabel}>
                {t('workout.setOfM', { n: session.nextSetLabel.n, m: session.nextSetLabel.m })}
              </Text>
            ) : null}
            {nextName ? <Text style={styles.restExerciseSm}>{nextName}</Text> : null}
            <Text style={styles.restSet}>{setLine}</Text>
          </>
        )}
      </View>

      <View style={styles.actions}>
        <TextAction label={t('workout.ready')} tone="primary" onPress={() => session.endRest()} />
        {nextEx && alt ? (
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
  // Scrim tap resumes (the workout stays frozen until an explicit choice).
  return (
    <BottomSheet onClose={onResume} background={color.surface} heightFraction={0.44}>
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
function EditResult({
  units,
  onDismiss,
  onDone,
}: {
  units: 'kg' | 'lb';
  onDismiss: () => void;
  onDone: (r: CompleteResult) => void;
}) {
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
  const weightValues = rangeStep(Math.max(0, base - 50), base + 50, 2.5);

  async function save() {
    // Edited values log as actual (override recorded). Store back in kg.
    const kg = !hasWeight ? null : units === 'lb' ? +(weight / 2.2046226).toFixed(1) : weight;
    const r = await session.completeSet({ weight: kg, reps });
    onDone(r);
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
  const s = Math.max(0, totalSeconds);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
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

  hero: { alignItems: 'center' },
  exerciseName: { ...heroTitle(22), color: color.textDim, fontSize: 22, fontWeight: '600' },
  weightRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 10 },
  weight: { ...heroNum(76), color: color.textPrimary, fontSize: 76, lineHeight: 76 * 0.85, fontWeight: '700' },
  unit: { fontSize: 16, fontWeight: '500', color: color.textSecondary, marginLeft: 5 },
  bodyweight: { ...heroTitle(40), color: color.textPrimary, fontSize: 40, fontWeight: '700', marginTop: 10 },
  reps: { ...tnum, fontSize: 30, fontWeight: '500', color: color.textPrimary, marginTop: 6, letterSpacing: -0.3 },
  setLabel: { fontSize: 13, color: color.textSecondary, marginTop: 16 },
  coaching: { fontSize: 13, lineHeight: 13 * 1.4, color: color.textDim, textAlign: 'center', marginTop: 12, paddingHorizontal: 22 },

  // Rest
  timer: { ...heroNum(62, -0.02), fontSize: 62, fontWeight: '600', color: color.textPrimary },
  restEyebrow: { fontSize: 13, color: color.textSecondary, marginTop: 18 },
  restExercise: { fontSize: 22, fontWeight: '600', color: color.textPrimary, marginTop: 8 },
  restExerciseSm: { fontSize: 14, color: color.textSecondary, marginTop: 4 },
  restSetLabel: { fontSize: 13, color: color.textSecondary, marginTop: 18 },
  restSet: { ...tnum, fontSize: 17, color: color.textSecondary, marginTop: 6 },

  actions: { alignSelf: 'stretch', position: 'absolute', bottom: 32, left: 0, right: 0, paddingHorizontal: space.gutter, alignItems: 'center' },
  editRow: { marginBottom: 10 },
  busyRow: { marginTop: 10 },

  // Pause sheet
  pauseTitle: { fontSize: 22, fontWeight: '600', color: color.textPrimary, textAlign: 'center', marginBottom: 24 },
  pauseOpt: { paddingVertical: 6, alignItems: 'center' },

  // Edit Result
  editHeader: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 4 },
  editEyebrow: { textAlign: 'center' },
  wheelRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
});
