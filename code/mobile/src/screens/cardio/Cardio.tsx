/**
 * Cardio — "Open training" (run / walk), rebuilt 1:1 from the Claude Design
 * "Design System" Cardio (ui_kits/app/Cardio.jsx).
 *
 * A deliberate departure from the rest of Hush: the v4 strength engine does NOT
 * coach a run — it records it. Hush owns load and progression on the platform;
 * outdoors, the athlete owns the effort and Hush simply keeps an honest log.
 * Nothing here ever feeds the engine, the program, loads, or selection.
 *
 * Flow: select (paper) → 3·2·1 (stage) → active (stage) → pause → complete (stage).
 * Live distance / pace / heart / calories come from `useCardioTracker` (simulated
 * pending native GPS + HealthKit — see that module's native handoff note).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Legend, Button, SegmentedControl, WheelPicker } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { db } from '@/data/local/db';
import { useCardioTracker, fmtClock, fmtPace, hrZone } from '@/platform/cardio/cardioTracker';
import { cardioLiveActivity, type CardioLiveActivityState } from '@/platform/liveActivity';
import { useFocusedStatusBar } from '@/platform/statusBar';
import type { CardioActivity, CardioGait, CardioGoalKind } from '@/data/local/models';
import { textEnd } from '@/i18n/bidi';
import { color, space, font, textScale, radius, stage as stageC, signal, up, tracking, trackingPx } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'Cardio'>;
type Phase = 'select' | 'countdown' | 'active' | 'complete';

export function Cardio({ navigation }: Props) {
  const { t } = useCopy();
  const [phase, setPhase] = useState<Phase>('select');
  const [gait, setGait] = useState<CardioGait>('run'); // chosen mode
  const [live, setLive] = useState<CardioGait>('run'); // current interval gait
  const [goalKind, setGoalKind] = useState<CardioGoalKind>('open');
  const [goalDist, setGoalDist] = useState(5); // km
  const [goalTime, setGoalTime] = useState(30); // min
  const [count, setCount] = useState(3);
  const [paused, setPaused] = useState(false);
  const startedAtRef = useRef<string>('');

  const sample = useCardioTracker(phase === 'active' && !paused, live);
  const { elapsedSec, distanceKm, hr, calories, splits } = sample;
  const curPace = distanceKm > 0 ? elapsedSec / distanceKm : 0;

  // Live Activity / Dynamic Island — start when the activity goes live, update each
  // tick, end when the screen unmounts (Done / View in history both leave it). The
  // native rendering is in modules/hush-live-activity (built on macOS — see handoff).
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
      paceSec: Math.round(curPace),
      hr: Math.round(hr),
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
  }, [phase, elapsedSec, paused, live]);
  useEffect(() => () => {
    if (laStarted.current) void cardioLiveActivity.end().catch(() => {});
  }, []);

  // Dark glyphs on the paper "select" step, light on the stage phases; restored to
  // dark on blur so Home/History never inherit invisible glyphs.
  useFocusedStatusBar(phase === 'select' ? 'dark' : 'light');

  // Countdown 3 → 2 → 1 → Go → active.
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count < 0) {
      setPhase('active');
      return;
    }
    const id = setTimeout(() => setCount((c) => c - 1), 800);
    return () => clearTimeout(id);
  }, [phase, count]);

  const begin = () => {
    setLive(gait);
    setCount(3);
    startedAtRef.current = new Date().toISOString();
    setPhase('countdown');
  };
  const finish = () => {
    setPaused(true);
    setPhase('complete');
  };

  if (phase === 'select') {
    return (
      <CardioSelect
        gait={gait}
        setGait={setGait}
        goalKind={goalKind}
        setGoalKind={setGoalKind}
        goalDist={goalDist}
        setGoalDist={setGoalDist}
        goalTime={goalTime}
        setGoalTime={setGoalTime}
        onBack={() => navigation.goBack()}
        onBegin={begin}
      />
    );
  }

  if (phase === 'countdown') {
    return (
      <View style={styles.stage}>
        <SafeAreaView style={styles.stageSafe} edges={['top', 'bottom']}>
          <View style={styles.countdownWrap}>
            <Text style={styles.startingLegend}>
              {(gait === 'run' ? t('cardio.run') : t('cardio.walk')).toUpperCase()} · {t('cardio.starting').toUpperCase()}
            </Text>
            <Text style={[styles.countNum, count <= 0 && { color: signal[0] }]}>
              {count <= 0 ? t('cardio.go') : count}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (phase === 'complete') {
    return (
      <CardioComplete
        navigation={navigation}
        gait={gait}
        startedAt={startedAtRef.current}
        elapsedSec={elapsedSec}
        distanceKm={distanceKm}
        avgHr={hr}
        calories={calories}
        splits={splits}
      />
    );
  }

  // ---- active (stage) ----
  const zone = hrZone(hr);
  const fastest = splits.length ? Math.min(...splits.map((s) => s.paceSec)) : 0;
  const goalFrac =
    goalKind === 'distance'
      ? Math.min(1, distanceKm / goalDist)
      : goalKind === 'time'
        ? Math.min(1, elapsedSec / (goalTime * 60))
        : 0;

  return (
    <View style={styles.stage}>
      <SafeAreaView style={styles.stageSafe} edges={['top', 'bottom']}>
        {/* top bar */}
        <View style={styles.stageBar}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('cardio.pause')} hitSlop={10} onPress={() => setPaused(true)} style={styles.barBtn}>
            <Icon name="pause" size={20} color={stageC.ink0} />
          </Pressable>
          <View style={styles.barCenter}>
            <View style={[styles.runDot, { backgroundColor: live === 'run' ? signal[0] : stageC.ink1 }]} />
            <Text style={styles.barCenterText}>{(live === 'run' ? t('cardio.running') : t('cardio.walking')).toUpperCase()}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('cardio.finishSave')} hitSlop={10} onPress={finish} style={[styles.barBtn, styles.barBtnRight]}>
            <Icon name="flag" size={20} color={stageC.ink0} />
          </Pressable>
        </View>

        {/* hero */}
        <View style={styles.activeBody}>
          <Text style={styles.heroLegend}>{(goalKind === 'distance' ? t('cardio.distance') : t('cardio.elapsed')).toUpperCase()}</Text>
          {goalKind === 'distance' ? (
            <View style={styles.heroRow}>
              <Text style={styles.heroNum}>{distanceKm.toFixed(2)}</Text>
              <Text style={styles.heroUnit}>{t('cardio.km')}</Text>
            </View>
          ) : (
            <Text style={styles.heroNum}>{fmtClock(elapsedSec)}</Text>
          )}

          {/* live pace chip */}
          <View style={styles.paceChip}>
            <Text style={styles.paceLegend}>{t('cardio.pace').toUpperCase()}</Text>
            <View style={styles.paceValRow}>
              <Text style={styles.paceVal}>{fmtPace(curPace)}</Text>
              <Text style={styles.paceUnit}>{t('cardio.perKm')}</Text>
            </View>
          </View>

          {/* progress rhythm */}
          {goalKind === 'time' ? (
            <View style={styles.timeBarWrap}>
              <View style={styles.timeBarTrack}>
                <View style={[styles.timeBarFill, { width: `${goalFrac * 100}%` }]} />
              </View>
              <View style={styles.timeBarLabels}>
                <Text style={styles.timeBarLabel}>
                  {fmtClock(elapsedSec)} / {goalTime}:00
                </Text>
                <Text style={styles.timeBarLabel}>{Math.round(goalFrac * 100)}%</Text>
              </View>
            </View>
          ) : (
            <View style={styles.dotsRow}>
              {Array.from({ length: goalKind === 'distance' ? Math.ceil(goalDist) : Math.min(8, Math.max(1, Math.ceil(distanceKm + 0.0001))) }).map((_, i) => {
                const done = distanceKm >= i + 1;
                const current = !done && distanceKm > i;
                return (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      { width: current || (goalKind === 'open' && !done) ? 22 : 7, backgroundColor: done ? up[0] : current || goalKind === 'open' ? signal[0] : stageC[2] },
                    ]}
                  />
                );
              })}
            </View>
          )}

          {/* secondary metric cluster */}
          <View style={styles.metricCluster}>
            <CardioStat value={goalKind === 'distance' ? fmtClock(elapsedSec) : distanceKm.toFixed(2)} unit={goalKind === 'distance' ? undefined : t('cardio.km')} label={goalKind === 'distance' ? t('cardio.elapsed') : t('cardio.distance')} />
            <View style={styles.clusterDivider} />
            <CardioStat value={Math.round(calories)} unit={t('cardio.kcal')} label={t('cardio.calories')} />
            <View style={styles.clusterDivider} />
            <CardioStat value={hr} unit={t('cardio.bpm')} label={`${t('cardio.heart')} · ${zone}`} />
          </View>
        </View>

        {/* gait toggle + pause */}
        <View style={styles.activeFooter}>
          <View style={styles.gaitToggleWrap}>
            <View style={styles.gaitToggle}>
              {(['run', 'walk'] as CardioGait[]).map((v) => (
                <Pressable key={v} onPress={() => setLive(v)} style={[styles.gaitPill, live === v && styles.gaitPillActive]}>
                  <Text style={[styles.gaitPillText, live === v && styles.gaitPillTextActive]}>{v === 'run' ? t('cardio.run') : t('cardio.walk')}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Button variant="onstage" size="lg" block label={t('cardio.pause')} onPress={() => setPaused(true)} leading={<Icon name="pause" size={18} color={stageC[0]} />} />
        </View>

        {/* pause overlay */}
        {paused && phase === 'active' ? (
          <View style={styles.pauseOverlay}>
            <Text style={styles.pauseLegend}>{t('cardio.paused').toUpperCase()}</Text>
            <Text style={styles.pauseClock}>{fmtClock(elapsedSec)}</Text>
            <View style={styles.pauseStats}>
              <Text style={styles.pauseStat}>{distanceKm.toFixed(2)} {t('cardio.km')}</Text>
              <Text style={styles.pauseStat}>{fmtPace(curPace)} {t('cardio.perKm')}</Text>
            </View>
            <View style={styles.pauseActions}>
              <Button variant="onstage" size="lg" block label={t('cardio.resume')} onPress={() => setPaused(false)} leading={<Icon name="play" size={18} color={stageC[0]} />} />
              <Button variant="ghost" block label={t('cardio.finishSave')} onPress={finish} leading={<Icon name="flag" size={18} color={stageC.ink0} />} style={styles.ghostOnStage} />
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

/* ============================ SELECT (paper) ============================ */
function CardioSelect(props: {
  gait: CardioGait;
  setGait: (g: CardioGait) => void;
  goalKind: CardioGoalKind;
  setGoalKind: (k: CardioGoalKind) => void;
  goalDist: number;
  setGoalDist: (n: number) => void;
  goalTime: number;
  setGoalTime: (n: number) => void;
  onBack: () => void;
  onBegin: () => void;
}) {
  const { t } = useCopy();
  return (
    <SafeAreaView style={styles.paperRoot} edges={['top']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={10} onPress={props.onBack} style={styles.back}>
          <Icon name="chevronLeft" size={24} color={color.textPrimary} strokeWidth={2} />
        </Pressable>
        <View style={styles.headTitles}>
          <Legend>{t('cardio.legend')}</Legend>
          <Text style={styles.title} accessibilityRole="header">{t('cardio.title')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.selectScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.introCard}>
          <Icon name="footprints" size={16} color={color.textMuted} strokeWidth={2} />
          <Text style={styles.introText}>
            {t('cardio.introPre')}
            <Text style={styles.introStrong}>{t('cardio.introRecords')}</Text>
            {t('cardio.introPost')}
          </Text>
        </View>

        <Legend style={styles.fieldLegend}>{t('cardio.mode')}</Legend>
        <SegmentedControl
          block
          size="lg"
          value={props.gait}
          onChange={(v) => props.setGait(v as CardioGait)}
          options={[
            { value: 'run', label: t('cardio.run'), icon: <Icon name="footprints" size={16} color={props.gait === 'run' ? color.textPrimary : color.textSecondary} strokeWidth={2} /> },
            { value: 'walk', label: t('cardio.walk'), icon: <Icon name="wind" size={16} color={props.gait === 'walk' ? color.textPrimary : color.textSecondary} strokeWidth={2} /> },
          ]}
        />

        <Legend style={styles.fieldLegendGoal}>{t('cardio.goalLegend')}</Legend>
        <SegmentedControl
          block
          value={props.goalKind}
          onChange={(v) => props.setGoalKind(v as CardioGoalKind)}
          options={[
            { value: 'open', label: t('cardio.goalOpen') },
            { value: 'distance', label: t('cardio.goalDistance') },
            { value: 'time', label: t('cardio.goalTime') },
          ]}
        />

        {props.goalKind === 'open' ? <Text style={styles.goalNote}>{t('cardio.goalOpenNote')}</Text> : null}
        {props.goalKind === 'distance' ? (
          <View style={styles.goalCol}>
            <Text style={styles.goalRowLabel}>{t('cardio.targetDistance')}</Text>
            <WheelPicker value={props.goalDist} onChange={props.setGoalDist} step={0.5} min={0.5} max={50} unit={t('cardio.km')} label={t('cardio.targetDistance')} style={styles.goalWheel} />
          </View>
        ) : null}
        {props.goalKind === 'time' ? (
          <View style={styles.goalCol}>
            <Text style={styles.goalRowLabel}>{t('cardio.targetTime')}</Text>
            <WheelPicker value={props.goalTime} onChange={props.setGoalTime} step={5} min={5} max={240} unit="min" label={t('cardio.targetTime')} style={styles.goalWheel} />
          </View>
        ) : null}

        <View style={styles.startWrap}>
          <Button variant="primary" size="lg" block label={props.gait === 'run' ? t('cardio.startRun') : t('cardio.startWalk')} onPress={props.onBegin} leading={<Icon name="play" size={18} color={color.onAccent} />} />
        </View>
        <Text style={styles.gpsNote}>{t('cardio.gpsNote')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ============================ COMPLETE (stage) ============================ */
function CardioComplete(props: {
  navigation: Props['navigation'];
  gait: CardioGait;
  startedAt: string;
  elapsedSec: number;
  distanceKm: number;
  avgHr: number;
  calories: number;
  splits: CardioActivity['splits'];
}) {
  const { t } = useCopy();
  const { navigation, gait, elapsedSec, distanceKm, avgHr, splits } = props;
  const d = Math.max(distanceKm, 0.01);
  const avgPace = elapsedSec / d;
  const fastest = splits.length ? Math.min(...splits.map((s) => s.paceSec)) : 0;
  const slowest = splits.length ? Math.max(...splits.map((s) => s.paceSec)) : 0;

  // Persist the recorded activity exactly once, on mount (sealed from the engine).
  const saved = useRef(false);
  useEffect(() => {
    if (saved.current) return;
    saved.current = true;
    const activity: CardioActivity = {
      kind: 'cardio',
      id: `cardio_${Date.now()}`,
      gait,
      startedAt: props.startedAt || new Date().toISOString(),
      durationSec: Math.round(elapsedSec),
      distanceKm: Math.round(distanceKm * 100) / 100,
      avgPaceSec: Math.round(avgPace),
      avgHr: Math.round(avgHr),
      calories: Math.round(props.calories),
      splits,
    };
    void db.appendCardioActivity(activity).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.stage}>
      <SafeAreaView style={styles.stageSafe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.completeScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.recordedRow}>
            <Icon name="checkCheck" size={16} color={up[0]} strokeWidth={2} />
            <Text style={styles.recordedText}>{t('cardio.recorded').toUpperCase()}</Text>
          </View>
          <Text style={styles.loggedTitle}>{gait === 'run' ? t('cardio.runLogged') : t('cardio.walkLogged')}</Text>

          <View style={styles.completeHero}>
            <Text style={styles.heroNum}>{distanceKm.toFixed(2)}</Text>
            <Text style={styles.heroUnit}>{t('cardio.km')}</Text>
          </View>

          <View style={styles.completeMetrics}>
            <CompleteMetric value={fmtClock(elapsedSec)} label={t('cardio.duration')} />
            <CompleteMetric value={fmtPace(avgPace)} unit={t('cardio.perKm')} label={t('cardio.avgPace')} />
            <CompleteMetric value={avgHr} unit={t('cardio.bpm')} label={t('cardio.avgHeart')} />
          </View>

          {splits.length > 0 ? (
            <View style={styles.splitsWrap}>
              <Text style={styles.splitsLegend}>{t('cardio.splitsPerKm').toUpperCase()}</Text>
              <View style={styles.splitsList}>
                {splits.map((s) => {
                  const frac = slowest > fastest ? (s.paceSec - fastest) / (slowest - fastest) : 0;
                  const w = 30 + (1 - frac) * 70; // faster = longer bar
                  const isFast = s.paceSec <= fastest;
                  return (
                    <View key={s.km} style={styles.splitRow}>
                      <Text style={styles.splitKm}>{s.km}</Text>
                      <View style={styles.splitTrack}>
                        <View style={[styles.splitFill, { width: `${w}%`, backgroundColor: isFast ? signal[0] : stageC[2] }]} />
                        {s.gait === 'walk' ? <Text style={styles.splitWalkTag}>{t('cardio.walkTag')}</Text> : null}
                      </View>
                      <Text style={[styles.splitPace, isFast && { color: signal[0], fontFamily: font.monoSemibold }]}>{fmtPace(s.paceSec)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.savedNoteRow}>
            <Icon name="lock" size={15} color={stageC.ink1} strokeWidth={2} />
            <Text style={styles.savedNoteText}>{t('cardio.savedNote')}</Text>
          </View>
        </ScrollView>

        <View style={styles.completeFooter}>
          <Button variant="onstage" size="lg" block label={t('cardio.done')} onPress={() => navigation.goBack()} />
          <Button variant="ghost" block label={t('cardio.viewInHistory')} onPress={() => navigation.replace('History')} style={styles.ghostOnStage} />
        </View>
      </SafeAreaView>
    </View>
  );
}

/* ---- small instrument readouts ---- */
function CardioStat({ value, unit, label }: { value: string | number; unit?: string; label: string }) {
  return (
    <View style={styles.cardioStat}>
      <View style={styles.cardioStatRow}>
        <Text style={styles.cardioStatVal}>{value}</Text>
        {unit ? <Text style={styles.cardioStatUnit}>{unit}</Text> : null}
      </View>
      <Text style={styles.cardioStatLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

function CompleteMetric({ value, unit, label }: { value: string | number; unit?: string; label: string }) {
  return (
    <View style={styles.completeMetric}>
      <View style={styles.cardioStatRow}>
        <Text style={styles.completeMetricVal}>{value}</Text>
        {unit ? <Text style={styles.completeMetricUnit}>{unit}</Text> : null}
      </View>
      <Text style={styles.cardioStatLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // paper (select)
  paperRoot: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.gutter - 4, paddingTop: 6, paddingBottom: 12, minHeight: 44 },
  back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headTitles: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, marginTop: 1 },
  selectScroll: { paddingHorizontal: space.gutter, paddingTop: 4, paddingBottom: 24 },
  introCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 14, backgroundColor: color.surface3, borderRadius: radius.lg, marginBottom: 22 },
  introText: { flex: 1, fontFamily: font.sans, fontSize: textScale.sm, color: color.textSecondary, lineHeight: 20 },
  introStrong: { fontFamily: font.sansMedium, color: color.textPrimary },
  fieldLegend: { marginBottom: 10 },
  fieldLegendGoal: { marginTop: 26, marginBottom: 10 },
  goalNote: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, marginTop: 14, marginHorizontal: 2, lineHeight: 20 },
  goalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  goalCol: { marginTop: 16, gap: 8 },
  goalWheel: { alignSelf: 'stretch' },
  goalRowLabel: { fontFamily: font.sans, fontSize: textScale.base, color: color.textSecondary },
  startWrap: { marginTop: 32 },
  gpsNote: { textAlign: 'center', fontFamily: font.sans, fontSize: textScale['2xs'], color: color.textTertiary, marginTop: 14, letterSpacing: 0.2 },

  // stage (shared)
  stage: { flex: 1, backgroundColor: stageC[0] },
  stageSafe: { flex: 1 },
  stageBar: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  barBtn: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  barBtnRight: { alignItems: 'flex-end' },
  barCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  runDot: { width: 7, height: 7, borderRadius: 4 },
  barCenterText: { fontFamily: font.sansMedium, fontSize: 11, letterSpacing: trackingPx(11, tracking.legend), color: stageC.ink2 },

  // countdown
  countdownWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  startingLegend: { fontFamily: font.sansMedium, fontSize: 11, letterSpacing: trackingPx(11, tracking.legend), color: stageC.ink2, marginBottom: 24 },
  countNum: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: 140, lineHeight: 150, letterSpacing: -6, color: stageC.ink0 },

  // active hero
  activeBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  heroLegend: { fontFamily: font.sansMedium, fontSize: 11, letterSpacing: trackingPx(11, tracking.legend), color: stageC.ink2, marginBottom: 12 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end' },
  // lineHeight ≥ fontSize (+ includeFontPadding:false) or RN clips the tall mono
  // digit tops — the 0.95 the web design tolerates is unsafe here (see SessionFlow `hero`).
  heroNum: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.data, lineHeight: Math.round(textScale.data * 1.06), includeFontPadding: false, letterSpacing: -3, color: stageC.ink0 },
  heroUnit: { fontFamily: font.monoMedium, fontSize: textScale.xl, color: stageC.ink2, marginStart: 6, marginBottom: 8 },

  paceChip: { marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9, paddingHorizontal: 18, borderWidth: 1, borderColor: stageC[2], borderRadius: radius.full },
  paceLegend: { fontFamily: font.sansMedium, fontSize: 10.5, letterSpacing: trackingPx(10.5, tracking.legend), color: stageC.ink2 },
  paceValRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  paceVal: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.xl, color: stageC.ink0 },
  paceUnit: { fontFamily: font.mono, fontSize: textScale.sm, color: stageC.ink2 },

  dotsRow: { flexDirection: 'row', gap: 7, justifyContent: 'center', alignItems: 'center', marginTop: 26, minHeight: 7, flexWrap: 'wrap', maxWidth: 280 },
  dot: { height: 7, borderRadius: 4 },
  timeBarWrap: { width: '100%', maxWidth: 280, marginTop: 26 },
  timeBarTrack: { height: 4, borderRadius: 2, backgroundColor: stageC[2], overflow: 'hidden' },
  timeBarFill: { height: '100%', backgroundColor: signal[0], borderRadius: 2 },
  timeBarLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  timeBarLabel: { fontFamily: font.mono, fontSize: textScale.sm, color: stageC.ink2 },

  metricCluster: { flexDirection: 'row', alignItems: 'stretch', marginTop: 40, paddingTop: 26, borderTopWidth: 1, borderTopColor: stageC[2], width: '100%', maxWidth: 320 },
  clusterDivider: { width: 1, backgroundColor: stageC[2], alignSelf: 'center', height: 34 },
  cardioStat: { flex: 1, alignItems: 'center', gap: 5 },
  cardioStatRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  cardioStatVal: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale['2xl'], letterSpacing: -0.6, color: stageC.ink0 },
  cardioStatUnit: { fontFamily: font.sansMedium, fontSize: 13, color: stageC.ink2 },
  cardioStatLabel: { fontFamily: font.sansMedium, fontSize: 10, letterSpacing: trackingPx(10, tracking.legend), color: stageC.ink2, textTransform: 'uppercase' },

  // active footer
  activeFooter: { paddingHorizontal: 20, paddingBottom: 16 },
  gaitToggleWrap: { alignItems: 'center', marginBottom: 14 },
  gaitToggle: { flexDirection: 'row', gap: 2, padding: 3, backgroundColor: stageC[1], borderRadius: radius.full },
  gaitPill: { paddingVertical: 6, paddingHorizontal: 18, borderRadius: radius.full },
  gaitPillActive: { backgroundColor: stageC.ink0 },
  gaitPillText: { fontFamily: font.sansSemibold, fontSize: 12, color: stageC.ink1 },
  gaitPillTextActive: { color: stageC[0] },

  // pause overlay
  // Near-opaque (RN has no cheap backdrop-blur like the web design): at 0.86 the
  // live metrics behind bled through and collided with the "Finish & save" flag +
  // label, reading as a stray floating flag. A solid cover keeps the pause panel clean.
  pauseOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(20,17,14,0.985)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  pauseLegend: { fontFamily: font.sansMedium, fontSize: 11, letterSpacing: trackingPx(11, tracking.legend), color: stageC.ink2, marginBottom: 12 },
  pauseClock: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale['4xl'], letterSpacing: -1.4, color: stageC.ink0 },
  pauseStats: { flexDirection: 'row', gap: 24, marginTop: 10 },
  pauseStat: { fontFamily: font.mono, fontSize: textScale.sm, color: stageC.ink1 },
  pauseActions: { width: '100%', maxWidth: 280, marginTop: 30, gap: 10 },
  ghostOnStage: { },

  // complete
  completeScroll: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 16 },
  recordedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recordedText: { fontFamily: font.sansMedium, fontSize: 11, letterSpacing: trackingPx(11, tracking.legend), color: up[0] },
  loggedTitle: { fontFamily: font.sansSemibold, fontSize: textScale['2xl'], letterSpacing: trackingPx(textScale['2xl'], tracking.tight), color: stageC.ink0, marginTop: 12 },
  completeHero: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginTop: 24 },
  completeMetrics: { flexDirection: 'row', marginTop: 26, paddingTop: 22, borderTopWidth: 1, borderTopColor: stageC[2] },
  completeMetric: { flex: 1, gap: 4 },
  completeMetricVal: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.xl, letterSpacing: -0.6, color: stageC.ink0 },
  completeMetricUnit: { fontFamily: font.sansMedium, fontSize: 12, color: stageC.ink2 },

  splitsWrap: { marginTop: 28 },
  splitsLegend: { fontFamily: font.sansMedium, fontSize: 11, letterSpacing: trackingPx(11, tracking.legend), color: stageC.ink2, marginBottom: 14 },
  splitsList: { gap: 9 },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  splitKm: { width: 16, fontFamily: font.mono, fontSize: textScale.sm, color: stageC.ink2 },
  splitTrack: { flex: 1, height: 22, backgroundColor: stageC[1], borderRadius: 4, overflow: 'hidden', justifyContent: 'center' },
  splitFill: { height: '100%', borderRadius: 4 },
  splitWalkTag: { position: 'absolute', end: 8, fontFamily: font.sansMedium, fontSize: 9, letterSpacing: trackingPx(9, tracking.legend), color: stageC.ink1, textTransform: 'uppercase' },
  splitPace: { width: 52, textAlign: textEnd, fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: textScale.sm, color: stageC.ink0 },

  savedNoteRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 26, paddingTop: 16, borderTopWidth: 1, borderTopColor: stageC[2] },
  savedNoteText: { flex: 1, fontFamily: font.sans, fontSize: textScale.sm, color: stageC.ink1, lineHeight: 20 },
  completeFooter: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18, gap: 10, borderTopWidth: 1, borderTopColor: stageC[2] },
});
