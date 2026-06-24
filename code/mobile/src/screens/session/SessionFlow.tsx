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
 * timing, edit-result (now inline Steppers), swap (current + upcoming), finish.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon, type IconName } from '@/components/Icon';
import { Button, IconButton, RestRing, Card, LoadDelta, Legend, Stepper } from '@/components/ds';
import { BottomSheet } from '@/components/BottomSheet';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { useSession, type CompleteResult } from '@/state/stores/sessionStore';
import { similarExercises, exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { color, space, stage, font, textScale, tracking, trackingPx, signal, up } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'SessionFlow'>;
type Overlay = 'none' | 'pause' | 'finish' | 'demo' | 'swap';
type Confirm = { weight: number | null; reps: number; n: number; m: number };

const CONFIRM_DWELL_MS = 1400; // the deliberate "Set logged" capture beat

export function SessionFlow({ navigation }: Props) {
  const { t } = useCopy();
  const session = useSession();
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [editing, setEditing] = useState(false);
  const [swapTarget, setSwapTarget] = useState<'current' | 'next'>('current');
  const units = useApp().profile?.units ?? 'kg';
  const confirmRunning = useRef(false);

  function goWellDone(r: CompleteResult) {
    navigation.replace('WellDone', { unlockedPortrait: r.unlockedPortrait, summary: r.summary });
  }
  function openPause() {
    session.pause();
    setOverlay('pause');
  }
  function resume() {
    session.resume();
    setOverlay('none');
  }
  async function finish() {
    const r = await session.finishEarly();
    goWellDone(r);
  }

  // Complete set → the "Set logged" beat (§3.3), then log + advance.
  function onCompleteSet() {
    const tgt = session.currentTarget;
    if (!tgt || confirm) return;
    setEditing(false);
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
    const id = setTimeout(async () => {
      const r = await session.completeSet();
      confirmRunning.current = false;
      setConfirm(null);
      if (r.ended) goWellDone(r);
    }, CONFIRM_DWELL_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm]);

  function openSwap(target: 'current' | 'next') {
    setSwapTarget(target);
    setOverlay('swap');
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {confirm ? (
          <Logged units={units} confirm={confirm} />
        ) : session.displayPhase === 'SET_PRESENTED' ? (
          <ActiveSet
            units={units}
            editing={editing}
            onToggleEdit={() => setEditing((v) => !v)}
            onComplete={onCompleteSet}
            onPause={openPause}
            onFinish={() => setOverlay('finish')}
            onDemo={() => setOverlay('demo')}
            onSwap={() => openSwap('current')}
          />
        ) : (
          <Rest
            units={units}
            paused={session.paused}
            onPause={openPause}
            onFinish={() => setOverlay('finish')}
            onDemo={() => setOverlay('demo')}
            onSwap={() => openSwap('next')}
          />
        )}
      </SafeAreaView>

      {overlay === 'pause' ? (
        <BottomSheet onClose={resume}>
          <Legend style={styles.sheetLegend}>{t('workout.paused')}</Legend>
          <Text style={styles.sheetTitle}>{t('pauseSheet.title')}</Text>
          <View style={styles.sheetActions}>
            <Button variant="primary" block label={t('pauseSheet.resume')} onPress={resume} />
            <Button variant="danger" block label={t('pauseSheet.endWorkout')} onPress={finish} />
          </View>
        </BottomSheet>
      ) : null}

      {overlay === 'finish' ? (
        <BottomSheet onClose={() => setOverlay('none')}>
          <Legend style={styles.sheetLegend}>{t('finishSheet.legend')}</Legend>
          <Text style={styles.sheetBody}>{t('finishSheet.body')}</Text>
          <View style={styles.sheetActions}>
            <Button variant="danger" block label={t('finishSheet.save')} onPress={finish} />
            <Button variant="quiet" block label={t('finishSheet.keep')} onPress={() => setOverlay('none')} />
          </View>
        </BottomSheet>
      ) : null}

      {overlay === 'swap' ? (
        <SwapSheet target={swapTarget} onClose={() => setOverlay('none')} />
      ) : null}

      {overlay === 'demo' ? (
        <ExerciseDemo
          title={session.currentExercise?.name ?? exerciseDisplayName(session.currentExerciseId)}
          cues={session.currentExercise?.cues ?? []}
          focusLabel={t('workout.focusOn')}
          formGuideLabel={t('workout.formGuide')}
          doneLabel={t('workout.demoDone')}
          onDone={() => setOverlay('none')}
        />
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------------- Stage chrome */
function StageBar({ center, onPause, onFinish }: { center: string; onPause: () => void; onFinish: () => void }) {
  const { t } = useCopy();
  return (
    <View style={styles.stageBar}>
      <View style={styles.stageBarSide}>
        <IconButton onStage accessibilityLabel={t('pauseSheet.title')} onPress={onPause}>
          <Icon name="pause" size={20} color={stage.ink1} />
        </IconButton>
      </View>
      <Text style={styles.stageBarCenter}>{center}</Text>
      <View style={[styles.stageBarSide, styles.stageBarRight]}>
        <IconButton onStage accessibilityLabel={t('finishSheet.legend')} onPress={onFinish}>
          <Icon name="close" size={20} color={stage.ink1} strokeWidth={2} />
        </IconButton>
      </View>
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

/* ----------------------------------------------------------------- Active Set */
function ActiveSet({
  units,
  editing,
  onToggleEdit,
  onComplete,
  onPause,
  onFinish,
  onDemo,
  onSwap,
}: {
  units: 'kg' | 'lb';
  editing: boolean;
  onToggleEdit: () => void;
  onComplete: () => void;
  onPause: () => void;
  onFinish: () => void;
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

  // Inline edit → write straight to the current step (engine re-renders).
  const wStep = units === 'kg' ? 2.5 : 5;
  const setWeight = (v: number) => {
    const kg = units === 'lb' ? +(v / 2.2046226).toFixed(1) : v;
    session.editCurrentSet({ weight: kg, reps: target.recommendedReps });
  };
  const setReps = (v: number) => session.editCurrentSet({ weight: target.recommendedWeight, reps: v });

  const canSwap = exNo === 1 && setN === 1; // first set of the first exercise

  return (
    <>
      <StageBar center={t('workout.exerciseCount', { n: exNo, N: total })} onPause={onPause} onFinish={onFinish} />
      <View style={styles.stageBody}>
        {group ? <Text style={styles.group}>{group.toUpperCase()}</Text> : null}
        <Text style={styles.exName}>{exName}</Text>

        {!editing ? (
          <>
            {isBodyweight ? (
              <Text style={styles.bodyweight}>{t('workout.bodyweight')}</Text>
            ) : (
              <View style={styles.heroRow}>
                <Text style={styles.hero} accessibilityLabel={`${weight} ${units}`}>{weight}</Text>
                <Text style={styles.heroUnit}>{unitLabel(units)}</Text>
              </View>
            )}
            {reason ? (
              <View style={styles.deltaWrap}>
                <LoadDelta
                  direction={reason === 'increase' ? 'up' : reason === 'decrease' ? 'down' : 'hold'}
                  value={deltaMag}
                  unit={unitLabel(units)}
                  size="lg"
                  pill
                />
              </View>
            ) : null}
            {reason ? (
              <Text style={styles.deltaCaption}>{t('workout.vsLast')}</Text>
            ) : null}
            <Text style={styles.repsLine}>
              × {target.recommendedReps} <Text style={styles.repsWord}>{t('workout.repsUnit')}</Text>
            </Text>
          </>
        ) : (
          <View style={styles.editBlock}>
            {!isBodyweight ? (
              <View style={styles.editRow}>
                <Text style={styles.editLabel}>{t('workout.actualWeight')}</Text>
                <Stepper value={weight ?? 0} onChange={setWeight} step={wStep} min={0} unit={unitLabel(units)} />
              </View>
            ) : null}
            <View style={styles.editRow}>
              <Text style={styles.editLabel}>{t('workout.actualReps')}</Text>
              <Stepper value={target.recommendedReps} onChange={setReps} step={1} min={0} unit={t('workout.repsUnit')} />
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
  onPause,
  onFinish,
  onDemo,
  onSwap,
}: {
  units: 'kg' | 'lb';
  paused: boolean;
  onPause: () => void;
  onFinish: () => void;
  onDemo: () => void;
  onSwap: () => void;
}) {
  const { t } = useCopy();
  const session = useSession();
  const isTransition = session.displayPhase === 'REST_TRANSITION';
  const nextName = session.nextExercise?.name ?? exerciseDisplayName(session.nextExerciseId);
  const nextGroup = session.nextExercise?.muscle ?? '';
  const nextTarget = session.nextTarget;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.restSeconds, session.displayPhase]);

  // Pause freezes the value; resume re-anchors the end from the frozen remaining.
  useEffect(() => {
    if (paused) {
      endAtRef.current = null;
    } else {
      endAtRef.current = Date.now() + remainingRef.current * 1000;
      sync();
    }
  }, [paused, sync]);

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
      session.endRest();
      return;
    }
    const id = setTimeout(sync, 1000);
    return () => clearTimeout(id);
  }, [remaining, paused, session, sync]);

  // +15s: extend the absolute end and the total, then re-sync (the ring fast-fills).
  // Also tell the session store so the longer rest re-publishes to the Apple Watch /
  // Live Activity (otherwise a phone +15 wouldn't reach the watch).
  const addFifteen = useCallback(() => {
    setTotal((tt) => tt + 15);
    remainingRef.current += 15;
    endAtRef.current = (endAtRef.current ?? Date.now() + remainingRef.current * 1000) + 15000;
    sync();
    session.extendRest(15);
  }, [sync, session]);

  return (
    <>
      <StageBar
        center={isTransition ? t('workout.nextExercise') : t('workout.rest')}
        onPause={onPause}
        onFinish={onFinish}
      />
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
                {isTransition && nextGroup ? <Text style={styles.upGroup}>{nextGroup.toUpperCase()}</Text> : null}
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
          label={isTransition ? t('workout.startNamed', { name: nextName }) : t('workout.startNextSet')}
          onPress={() => session.endRest()}
        />
        {remaining > 0 ? (
          <View style={styles.ghostRow}>
            <StageGhost icon="chevronUp" label={t('workout.addSeconds')} onPress={addFifteen} />
          </View>
        ) : null}
      </View>
    </>
  );
}

/* ---------------------------------------------------------------- Swap sheet */
function SwapSheet({ target, onClose }: { target: 'current' | 'next'; onClose: () => void }) {
  const { t } = useCopy();
  const app = useApp();
  const session = useSession();
  const ex = target === 'current' ? session.currentExercise : session.nextExercise;
  const exId = target === 'current' ? session.currentExerciseId : session.nextExerciseId;
  const curName = ex?.name ?? exerciseDisplayName(exId);
  const muscle = ex?.muscle ?? '';
  // In-workout swap: the 2 closest-in-effect alternatives (current + 2 = 3 total).
  const alts = ex ? similarExercises(ex.id, 2) : [];
  const nextTarget = session.nextTarget;

  function choose(altId: string) {
    if (target === 'current') {
      session.swapCurrentExercise(altId);
    } else {
      // Keep the load progression; tell the backend if this block is known.
      if (nextTarget?.blockId && ex) {
        void app.model.replaceBlock({ blockId: nextTarget.blockId, fromExercise: ex.id, toExercise: altId });
      }
      session.swapNextExercise(altId);
    }
    onClose();
  }

  return (
    <BottomSheet onClose={onClose}>
      <Legend style={styles.sheetLegend}>{t('swap.title')}</Legend>
      <Text style={styles.sheetBody}>{t('swap.body')}</Text>
      <SwapRow title={curName} subtitle={t('swap.currentSub')} currentBadge muted />
      {alts.map((a, i) => (
        <SwapRow
          key={a.id}
          title={a.name}
          subtitle={muscle}
          last={i === alts.length - 1}
          onPress={() => choose(a.id)}
        />
      ))}
    </BottomSheet>
  );
}

function SwapRow({
  title,
  subtitle,
  currentBadge,
  muted,
  last,
  onPress,
}: {
  title: string;
  subtitle?: string;
  currentBadge?: boolean;
  muted?: boolean;
  last?: boolean;
  onPress?: () => void;
}) {
  const { t } = useCopy();
  const body = (
    <>
      <View style={styles.swapInfo}>
        <Text style={[styles.swapTitle, muted && styles.swapTitleMuted]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.swapSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {currentBadge ? (
        <View style={styles.swapBadge}>
          <Text style={styles.swapBadgeText}>{t('swap.currentBadge').toUpperCase()}</Text>
        </View>
      ) : onPress ? (
        <Icon name="chevronRight" size={18} color={color.textTertiary} strokeWidth={2} />
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.swapRow, !last && styles.swapRowBorder, pressed && styles.swapRowPressed]}>
        {body}
      </Pressable>
    );
  }
  return <View style={[styles.swapRow, !last && styles.swapRowBorder]}>{body}</View>;
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
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 38 },
  // lineHeight must be ≥ fontSize or RN clips the tall mono digit tops (the web
  // design's 0.9 is safe there but not in RN). Slight headroom keeps glyphs whole.
  hero: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.data, letterSpacing: trackingPx(textScale.data, tracking.display), color: stage.ink0, lineHeight: Math.round(textScale.data * 1.06), includeFontPadding: false },
  heroUnit: { fontFamily: font.mono, fontSize: textScale.lg, color: stage.ink2, marginLeft: 6, marginBottom: 12 },
  bodyweight: { fontFamily: font.sansSemibold, fontSize: textScale['3xl'], color: stage.ink0, marginTop: 28 },
  deltaWrap: { marginTop: 16, height: 26, alignItems: 'center' },
  deltaCaption: { fontFamily: font.sans, fontSize: textScale.sm, color: stage.ink2, marginTop: 8 },
  repsLine: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: textScale.xl, color: stage.ink1, marginTop: 30 },
  repsWord: { fontFamily: font.sans, fontSize: textScale.sm, color: stage.ink2 },

  // Inline edit
  editBlock: { marginTop: 30, width: '100%', maxWidth: 300, gap: 16 },
  editRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLabel: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink2 },

  dotsWrap: { marginTop: 40, alignItems: 'center' },
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
  upNextLegend: { marginBottom: 12, textAlign: 'left' },
  upRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  upInfo: { flex: 1, minWidth: 0 },
  upGroup: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink2 },
  upName: { fontFamily: font.sansSemibold, fontSize: textScale.md, color: stage.ink0, marginTop: 3 },
  upMeta: { fontFamily: font.mono, fontSize: textScale.sm, color: stage.ink2, marginTop: 2 },
  upRight: { alignItems: 'flex-end', marginLeft: 12 },
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
  swapRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  swapRowBorder: { borderBottomWidth: 1, borderBottomColor: color.border },
  swapRowPressed: { opacity: 0.55 },
  swapInfo: { flex: 1, minWidth: 0 },
  swapTitle: { fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textPrimary },
  swapTitleMuted: { color: color.textSecondary },
  swapSub: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, marginTop: 2 },
  swapBadge: { backgroundColor: signal.wash, borderRadius: 4, paddingHorizontal: 8, height: 22, alignItems: 'center', justifyContent: 'center' },
  swapBadgeText: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), color: color.accentText },
});
