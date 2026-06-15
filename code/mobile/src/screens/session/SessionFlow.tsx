/**
 * Session Flow controller (spec §1.11–1.18). One phase-driven surface: only
 * Weight/Reps/Set Counter/Timer change between sets; exercise name and CTA
 * position stay fixed (spec §4.3). Pause/Finish are modal-frozen overlays;
 * Edit Result / Technique Notes are dismissible overlays.
 *
 * Calibration is silent: reason/forecast lines are gated by the mode (they do
 * not render until ADVISORY) — enforced in domain/voice via the mode gate.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextAction } from '@/components/TextAction';
import { WeightDisplay } from '@/components/WeightDisplay';
import { RestTimer } from '@/components/RestTimer';
import { Wheel } from '@/components/Wheel';
import { ReplacementSheet } from '@/components/ReplacementSheet';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { useSession, type CompleteResult } from '@/state/stores/sessionStore';
import { reasonLine, forecastLine, weightHasReason } from '@/domain/voice';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { color, layout, press, type as typo } from '@/design/tokens';
import { motion } from '@/design/motion';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'SessionFlow'>;
type Overlay = 'none' | 'pause' | 'finish' | 'edit' | 'technique' | 'reason';

export function SessionFlow({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const session = useSession();
  const [overlay, setOverlay] = useState<Overlay>('none');

  const mode = app.modeState.mode;
  const units = app.profile?.units ?? 'kg';

  function goWellDone(r: CompleteResult) {
    navigation.replace('WellDone', { unlockedPortrait: r.unlockedPortrait });
  }

  function openPause() {
    session.pause(); // freeze instantly (0ms)
    setOverlay('pause');
  }
  function resume() {
    session.resume();
    setOverlay('none');
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Pause control — present on the workout and rest surfaces */}
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Pause" onPress={openPause}
          style={({ pressed }) => [styles.pauseBtn, { opacity: pressed ? press.opacity : 1 }]}>
          <Text style={styles.pauseGlyph}>‖</Text>
        </Pressable>
      </View>

      {session.displayPhase === 'SET_PRESENTED' ? (
        <WorkoutView mode={mode} units={units} onEdit={() => setOverlay('edit')}
          onReason={() => setOverlay('reason')} onComplete={goWellDone} />
      ) : (
        <RestView units={units} paused={session.paused} onComplete={goWellDone} />
      )}

      {overlay === 'pause' ? (
        <PauseOverlay onResume={resume} onShowExercise={() => setOverlay('technique')} onFinish={() => setOverlay('finish')} />
      ) : null}
      {overlay === 'finish' ? (
        <FinishConfirm onCancel={() => setOverlay('pause')} onFinish={async () => {
          const r = await session.finishEarly();
          goWellDone(r);
        }} />
      ) : null}
      {overlay === 'technique' ? <TechniqueNotes onDone={() => setOverlay('pause')} /> : null}
      {overlay === 'edit' ? (
        <EditResultOverlay units={units} onDismiss={() => setOverlay('none')} onDone={goWellDone} />
      ) : null}
      {overlay === 'reason' ? <ReasonOverlay units={units} onDismiss={() => setOverlay('none')} /> : null}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------- Workout view
function WorkoutView({ mode, units, onEdit, onReason, onComplete }: {
  mode: ReturnType<typeof useApp>['modeState']['mode'];
  units: 'kg' | 'lb';
  onEdit: () => void;
  onReason: () => void;
  onComplete: (r: CompleteResult) => void;
}) {
  const { t, line } = useCopy();
  const session = useSession();
  const [successReps, setSuccessReps] = useState<number | null>(null);

  const ex = session.currentExercise;
  const target = session.currentTarget;
  if (!ex || !target) return <View style={styles.center} />;

  const reason = line(reasonLine(mode, target));
  const forecast = line(forecastLine(mode, target));
  const receipt = line(session.receiptLine);
  const hasReason = weightHasReason(mode, target);
  const shownWeight = displayWeight(target.recommendedWeight, units);

  function onCompleteSet() {
    // 95% press -> 400ms success ("[reps] ✓") -> rest flow (spec §3.2).
    setSuccessReps(target!.recommendedReps);
    setTimeout(async () => {
      const r = await session.completeSet();
      setSuccessReps(null);
      if (r.ended) onComplete(r);
    }, motion.completeSetSuccessMs);
  }

  return (
    <View style={styles.center}>
      <Text style={styles.exerciseName}>{ex.name}</Text>
      {session.setLabel ? (
        <Text style={styles.setCounter} accessibilityLabel={`set ${session.setLabel.n} of ${session.setLabel.m}`}>
          {`Set ${session.setLabel.n} of ${session.setLabel.m}`}
        </Text>
      ) : null}
      {reason ? <Text style={styles.reason}>{reason}</Text> : null}

      <View style={styles.hero}>
        <WeightDisplay weight={shownWeight} units={unitLabel(units)} hasReason={hasReason}
          onPressReason={onReason} bodyweightLabel={t('workout.bodyweight')}
          a11yLabel={heroA11yLabel(shownWeight, units, target.recommendedReps, session.setLabel)} />
      </View>

      {/* Receipt: loud when right, white, once (§4.6). Resolved from last set. */}
      {receipt ? <Text style={styles.receipt}>{receipt}</Text> : null}
      {forecast ? <Text style={styles.forecast}>{forecast}</Text> : null}

      <View style={styles.actions}>
        <PrimaryButton
          label={successReps != null ? `${successReps} ✓` : t('workout.completeSet')}
          disabled={successReps != null}
          onPress={onCompleteSet}
        />
        <View style={styles.gap} />
        <TextAction label={t('workout.editResult')} onPress={onEdit} />
        {/* Equipment Occupied (V1): move this exercise one position later — no replacement. */}
        {session.canMarkOccupied ? (
          <>
            <View style={styles.gap} />
            <TextAction label={t('workout.equipmentOccupied')} onPress={() => session.markEquipmentOccupied()} />
          </>
        ) : null}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------- Rest view
function RestView({ units, paused, onComplete }: {
  units: 'kg' | 'lb';
  paused: boolean;
  onComplete: (r: CompleteResult) => void;
}) {
  const { t } = useCopy();
  const app = useApp();
  const session = useSession();
  const [choosing, setChoosing] = useState(false);
  const isTransition = session.displayPhase === 'REST_TRANSITION';
  const nextEx = session.nextExercise;
  const nextTarget = session.nextTarget;
  const nextWeight = displayWeight(nextTarget?.recommendedWeight ?? null, units);

  return (
    <View style={styles.center}>
      {isTransition && nextEx ? (
        <Text style={styles.nextLabel}>
          {`${nextEx.name}${nextWeight != null ? `  ·  ${nextWeight} ${unitLabel(units)} × ${nextTarget?.recommendedReps}` : ''}`}
        </Text>
      ) : null}
      <RestTimer seconds={session.restSeconds} running={!paused} onElapsed={() => session.endRest()} />
      <View style={styles.actions}>
        <TextAction label={t('rest.ready')} onPress={() => session.endRest()} />
        {isTransition && nextEx ? (
          <>
            <View style={styles.gap} />
            <TextAction label={t('transition.chooseAnother')} onPress={() => setChoosing(true)} />
          </>
        ) : null}
      </View>

      {choosing && nextEx ? (
        <ReplacementSheet
          capability={nextEx.capability}
          currentExerciseId={nextEx.id}
          target={{ weight: nextTarget?.recommendedWeight ?? null, reps: nextTarget?.recommendedReps ?? 8 }}
          units={units}
          recents={app.recents}
          mode="session"
          onUse={(exId) => {
            // Capability-preserving L2 REPLACE against the live block (R18). The
            // backend persists the preference; the fixture no-ops.
            if (nextTarget?.blockId) {
              void app.model.replaceBlock({ blockId: nextTarget.blockId, fromExercise: nextEx.id, toExercise: exId });
            }
            session.swapNextExercise(exId); // swaps in place; timer untouched
            setChoosing(false);
          }}
          onDismiss={() => setChoosing(false)}
        />
      ) : null}
    </View>
  );
}

// --------------------------------------------------------------------- Overlays
function PauseOverlay({ onResume, onShowExercise, onFinish }: {
  onResume: () => void; onShowExercise: () => void; onFinish: () => void;
}) {
  const { t } = useCopy();
  return (
    <View style={styles.modalFrozen}>
      <View style={styles.sheet}>
        <PrimaryButton label={t('pause.resume')} onPress={onResume} />
        <View style={styles.gap} />
        <TextAction label={t('pause.showExercise')} onPress={onShowExercise} />
        <View style={styles.gap} />
        <TextAction label={t('pause.finishEarly')} onPress={onFinish} />
      </View>
    </View>
  );
}

function FinishConfirm({ onCancel, onFinish }: { onCancel: () => void; onFinish: () => void }) {
  const { t } = useCopy();
  return (
    <View style={styles.modalFrozen}>
      <View style={styles.sheet}>
        <PrimaryButton label={t('finishConfirm.finish')} onPress={onFinish} />
        <View style={styles.gap} />
        <TextAction label={t('finishConfirm.cancel')} onPress={onCancel} />
      </View>
    </View>
  );
}

/**
 * Technique Notes (replaces Exercise Demo, 2026-06-13). No video, no clips, no
 * content delivery — exactly three plain-language cues as a quick reminder
 * before a set. Layered above Pause; the workout stays frozen. "Done" returns
 * to the Pause sheet (still frozen).
 */
function TechniqueNotes({ onDone }: { onDone: () => void }) {
  const { t } = useCopy();
  const session = useSession();
  const ex = session.currentExercise;
  const cues = ex?.cues ?? [];
  return (
    <View style={styles.modalFrozen}>
      <View style={styles.sheet}>
        {ex ? <Text style={styles.techniqueTitle}>{ex.name}</Text> : null}
        {cues.map((c, i) => (
          <Text key={i} style={styles.cue}>{`•  ${c}`}</Text>
        ))}
        <View style={styles.gap} />
        <PrimaryButton label={t('technique.done')} onPress={onDone} />
      </View>
    </View>
  );
}

function EditResultOverlay({ units, onDismiss, onDone }: {
  units: 'kg' | 'lb'; onDismiss: () => void; onDone: (r: CompleteResult) => void;
}) {
  const { t } = useCopy();
  const session = useSession();
  const target = session.currentTarget;
  const recReps = target?.recommendedReps ?? 8;
  const recWeight = displayWeight(target?.recommendedWeight ?? null, units);
  const [reps, setReps] = useState(recReps);
  const [weight, setWeight] = useState(recWeight ?? 0);

  const repValues = rangeStep(1, 20, 1);
  const base = recWeight ?? 0;
  const weightValues = rangeStep(Math.max(0, base - 50), base + 50, 2.5);

  async function done() {
    // Edited values are logged as actual (spec §3.2). Store back in kg.
    const kg = target?.recommendedWeight == null ? null : units === 'lb' ? +(weight / 2.2046226).toFixed(1) : weight;
    const r = await session.completeSet({ weight: kg, reps });
    onDone(r);
  }

  return (
    <Pressable style={styles.scrim} onPress={onDismiss}>
      <Pressable style={styles.sheet} onPress={() => {}}>
        <View style={styles.wheelRow}>
          <Wheel values={repValues} selected={reps} onChange={setReps} format={(v) => `${v} reps`} />
          {target?.recommendedWeight != null ? (
            <Wheel values={weightValues} selected={weight} onChange={setWeight} format={(v) => `${v} ${unitLabel(units)}`} />
          ) : null}
        </View>
        <PrimaryButton label={t('editResult.done')} onPress={done} />
      </Pressable>
    </Pressable>
  );
}

function ReasonOverlay({ units, onDismiss }: { units: 'kg' | 'lb'; onDismiss: () => void }) {
  const { t } = useCopy();
  const app = useApp();
  const session = useSession();
  const target = session.currentTarget;
  const w = displayWeight(target?.recommendedWeight ?? null, units);
  const header = t('reasonSheet.header', { weight: `${w ?? ''} ${unitLabel(units)}` });
  // One sentence of cause, keyed by reason type (spec §4.5). Calibration never reaches here.
  const body =
    target?.reasonType === 'increase' ? t('reasonSheet.increase')
    : target?.reasonType === 'hold' ? t('reasonSheet.hold')
    : target?.reasonType === 'decrease' ? t('reasonSheet.decrease', { delta: target.reasonDelta ?? '' })
    : '';
  return (
    <Pressable style={styles.scrim} onPress={onDismiss}>
      <Pressable style={[styles.sheet, styles.reasonSheet]} onPress={() => {}}>
        <Text style={styles.reasonHeader}>{header}</Text>
        <Text style={styles.reasonBody}>{body}</Text>
        <View style={styles.gap} />
        <PrimaryButton label={t('reasonSheet.dismiss')} onPress={onDismiss} />
      </Pressable>
    </Pressable>
  );
}

/** Hero VoiceOver label (§8.3): "[weight], [reps] reps, set n of m". */
function heroA11yLabel(
  weight: number | null,
  units: 'kg' | 'lb',
  reps: number,
  setLabel: { n: number; m: number } | null,
): string {
  const w = weight == null ? 'Bodyweight' : `${weight} ${units === 'kg' ? 'kilograms' : 'pounds'}`;
  const set = setLabel ? `, set ${setLabel.n} of ${setLabel.m}` : '';
  return `${w}, ${reps} reps${set}`;
}

function rangeStep(a: number, b: number, step: number): number[] {
  const out: number[] = [];
  for (let v = a; v <= b + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase },
  top: { flexDirection: 'row', justifyContent: 'flex-end', padding: layout.screenMargin },
  pauseBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pauseGlyph: { color: color.textSecondary, fontSize: typo.titleM.size },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: layout.screenMargin },
  exerciseName: { color: color.textDim, fontSize: typo.bodyL.size, marginBottom: 8 },
  setCounter: { color: color.textSecondary, fontSize: typo.caption.size, marginBottom: 8 },
  reason: { color: color.textDim, fontSize: typo.bodyM.size, textAlign: 'center', marginBottom: 8 },
  hero: { marginVertical: 8 },
  forecast: { color: color.textPrimary, fontSize: typo.bodyL.size, textAlign: 'center', marginTop: 8 },
  receipt: { color: color.textPrimary, fontSize: typo.bodyL.size, textAlign: 'center', marginTop: 8 },
  nextLabel: { color: color.textDim, fontSize: typo.bodyL.size, marginBottom: 24, textAlign: 'center' },
  actions: { alignSelf: 'stretch', position: 'absolute', bottom: 32, paddingHorizontal: layout.screenMargin, left: 0, right: 0 },
  gap: { height: 12 },
  // Modal-frozen overlays (Pause, Finish): non-dismissible by swipe/tap-outside.
  modalFrozen: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  // Dismissible overlays (Edit, Reason, Demo): scrim tap dismisses.
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.bgSurface, padding: layout.screenMargin, paddingBottom: 32, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  reasonSheet: { maxHeight: '30%' },
  reasonHeader: { color: color.textSecondary, fontSize: typo.caption.size, marginBottom: 8 },
  reasonBody: { color: color.textPrimary, fontSize: typo.bodyL.size, lineHeight: typo.bodyL.lineHeight },
  wheelRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  techniqueTitle: { color: color.textPrimary, fontSize: typo.titleM.size, marginBottom: 16 },
  cue: { color: color.textSecondary, fontSize: typo.bodyL.size, lineHeight: typo.bodyL.lineHeight, marginBottom: 8 },
});
