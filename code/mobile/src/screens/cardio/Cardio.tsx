/**
 * Cardio — the v7 open-tracking surface (handoff 3.4 / 3.4a / 3.4c). Run or walk, recorded beside
 * your lifting; the strength engine never touches it.
 *
 * v7 REBUILD (2026-07-23, "Full 1:1 match" ruling): the surface is stripped to timer-first OPEN
 * tracking, exactly as the handoff shows. The READY step (3.4a) now lives in the Cardio TAB
 * (CardioReady, so the bottom bar stays visible at rest); this stage is pushed above the bar and
 * opens straight into the countdown —
 *   · LIVE (3.4): the elapsed clock as the hero; a 1,000 m band whose dot travels the CURRENT
 *     kilometre with its metres riding under it in moss; one readable row — kilometre, heart, burn;
 *     a split pill when a kilometre logs; a single cream "Pause".
 *   · DONE (3.4c): centred like a milestone — "Cardio · saved", "That's the distance.", the distance
 *     alone in the light, three facts (time · kcal · avg hr), one cream "Done".
 *
 * What was removed per the ruling: distance/time GOALS and the in-run run/walk toggle (the surface is
 * open-tracking only now). The RECORDING flow underneath is untouched — real GPS via useCardioTracker,
 * the honest GPS-lock gating, the Live Activity, and the once-on-mount persistence (route + splits +
 * hr + calories still saved to the log, they are simply not drawn on the done stage).
 *
 * THE LAW (monoCarriesNoWords): mono carries only figures (the clock, the metres, the km/hr/kcal
 * numbers). Every word — "CARDIO", "KM", "1,000 m", "km 3 logged", the legends — is SANS.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Legend, Button } from '@/components/ds';
import { PausedStage } from '@/components/PausedStage';
import { BottomSheet } from '@/components/BottomSheet';
import { MIN_ROUTE_POINTS, simplifyRoute } from '@/components/RouteTrace';
import { useCopy } from '@/i18n/useCopy';
import { monoCanDraw } from '@/design/monoVoice';
import { db } from '@/data/local/db';
import { useApp } from '@/state/stores/appStore';
import { useKeepAwake } from 'expo-keep-awake';
import { useCardioTracker, fmtClock, fmtPace, type GpsState } from '@/platform/cardio/cardioTracker';
import { cardioPerformed } from '@/domain/cardio';
import { cardioLiveActivity, type CardioLiveActivityState } from '@/platform/liveActivity';
import { useFocusedStatusBar } from '@/platform/statusBar';
import type { CardioActivity, CardioGait, CardioPoint, CardioSplit } from '@/data/local/models';
import * as haptics from '@/platform/haptics';
import { color, font, textScale, radius, stage as stageC, signal, tracking, trackingPx } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'CardioLive'>;
type Phase = 'countdown' | 'active' | 'complete';

export function Cardio({ navigation }: Props) {
  const { t } = useCopy();
  // The unit words, read once: each rides a MONO slot in the handoff and hands over to sans in a
  // script mono cannot draw (see `unitWord`).
  const metresUnit = t('cardio.metresUnit');
  const perKm = t('cardio.perKm');
  const kmUnit = t('cardio.km');
  const app = useApp();
  // Foreground-only GPS (no background-location entitlement yet): the screen stays awake for the
  // whole cardio surface so a live activity never loses its fix mid-run.
  useKeepAwake();
  // The stage opens straight into the countdown — the READY step lives in the Cardio tab now.
  const [phase, setPhase] = useState<Phase>('countdown');
  // Open tracking only (v7): gait is fixed to a run; no picker, no in-run toggle.
  const live: CardioGait = 'run';
  const [count, setCount] = useState(3);
  const [paused, setPaused] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  // 3.4b · KILOMETRE LOGGED — the split that just landed rises alone in the light, then the run
  // resumes on its own. A moment, mirrored to the watch; the tracking underneath never pauses.
  const [kmMoment, setKmMoment] = useState<CardioSplit | null>(null);
  const [backIn, setBackIn] = useState(3);
  const shownSplitsRef = useRef(0);
  const backBar = useRef(new Animated.Value(0)).current;
  const startedAtRef = useRef<string>('');
  // Stamp the start the moment the stage mounts (the countdown is already running).
  useEffect(() => {
    startedAtRef.current = new Date().toISOString();
  }, []);

  // GPS warms up during the 3·2·1 countdown; the clock and accumulation start only once the phase
  // is truly 'active' and unpaused.
  const sample = useCardioTracker(
    phase === 'countdown' || phase === 'active',
    paused || phase !== 'active',
    live,
    app.profile?.weightKg,
  );
  const { elapsedSec, distanceKm, paceSec, hr, avgHr, calories, splits, gps, route } = sample;

  // Live Activity / Dynamic Island — start when live, update each tick, end on unmount.
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
      paceSec: Math.round(paceSec),
      hr: hr != null ? Math.round(hr) : 0, // 0 = no source; the widget hides it
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
  }, [phase, elapsedSec, paused]);
  useEffect(() => () => {
    if (laStarted.current) void cardioLiveActivity.end().catch(() => {});
  }, []);

  // Every cardio phase is a dark stage now — light glyphs throughout, restored on blur.
  useFocusedStatusBar('light');

  // Countdown 3 → 2 → 1 → Go → active. Every beat is FELT (rising haptics, a sustained double on GO).
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count < 0) {
      setPhase('active');
      return;
    }
    haptics.countdownBeat(count);
    const id = setTimeout(() => setCount((c) => c - 1), 800);
    return () => clearTimeout(id);
  }, [phase, count]);

  // A kilometre just closed → raise the moment for the newest split. We compare against a stamped
  // count (not just length) so a moment fires exactly once per completed km, even across re-renders.
  useEffect(() => {
    if (phase !== 'active') return;
    if (splits.length <= shownSplitsRef.current) return;
    shownSplitsRef.current = splits.length;
    haptics.setLogged();
    setKmMoment(splits[splits.length - 1]);
  }, [phase, splits]);

  // The moment breathes on its own: a 3-second "back to run" countdown with a filling bar, then it
  // clears itself — no tap. Mirrors the set-logged moment's timing and dismissal.
  useEffect(() => {
    if (!kmMoment) return;
    setBackIn(3);
    backBar.setValue(0);
    Animated.timing(backBar, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: false }).start();
    const tick = setInterval(() => setBackIn((n) => Math.max(0, n - 1)), 1000);
    const done = setTimeout(() => setKmMoment(null), 3150);
    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [kmMoment, backBar]);

  const finish = () => {
    // NOT PERFORMED (founder 2026-07-10): finishing with no real activity records nothing.
    if (!cardioPerformed(elapsedSec, distanceKm)) {
      navigation.goBack();
      return;
    }
    setPaused(true);
    setPhase('complete');
  };

  if (phase === 'countdown') {
    return (
      <View style={styles.stage}>
        <SafeAreaView style={styles.stageSafe} edges={['top', 'bottom']}>
          <View style={styles.countdownWrap}>
            <Text style={styles.startingLegend}>
              {t('cardio.run').toUpperCase()} · {t('cardio.starting').toUpperCase()}
            </Text>
            {/* 3 · 2 · 1 are FIGURES (mono, tabular); "GO" is a WORD (sans) — the mono font cannot
                even draw it in Hebrew. Same size, same weight, each in the voice it belongs to. */}
            <Text style={[styles.countNum, count <= 0 && styles.countGo]}>
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
        gait={live}
        startedAt={startedAtRef.current}
        elapsedSec={elapsedSec}
        distanceKm={distanceKm}
        // The MEAN of every live reading, not the last one — `hr` is what the row is showing
        // this second, and a summary that called that "average" would be reporting one heartbeat.
        avgHr={avgHr ?? null}
        calories={calories}
        splits={splits}
        route={route}
      />
    );
  }

  // ---- LIVE (stage) ----
  return (
    <CardioLiveView
      elapsedSec={elapsedSec}
      distanceKm={distanceKm}
      hr={hr}
      calories={calories}
      splits={splits}
      gps={gps}
      paused={paused}
      confirmEnd={confirmEnd}
      kmMoment={kmMoment}
      backIn={backIn}
      backBar={backBar}
      onPause={() => setPaused(true)}
      onResume={() => {
        setConfirmEnd(false);
        setPaused(false);
      }}
      onAskEnd={() => setConfirmEnd(true)}
      onKeepGoing={() => setConfirmEnd(false)}
      onFinish={finish}
    />
  );
}

/**
 * 3.4 · CARDIO — LIVE, as a pure view.
 *
 * Split from the container for the same reason Home/HomeView and LiftDetail are: the stage's whole
 * content comes from a live GPS tracker, and a harness cannot produce one. Everything here is
 * props, so the gallery draws exactly what a running phone draws — the band, the split pill, the
 * paused stage and the end sheet included.
 */
export function CardioLiveView(props: {
  elapsedSec: number;
  distanceKm: number;
  hr: number | null;
  calories: number;
  splits: CardioSplit[];
  gps: GpsState;
  paused: boolean;
  confirmEnd: boolean;
  kmMoment: CardioSplit | null;
  backIn: number;
  backBar: Animated.Value;
  onPause: () => void;
  onResume: () => void;
  onAskEnd: () => void;
  onKeepGoing: () => void;
  onFinish: () => void;
}) {
  const { t } = useCopy();
  const metresUnit = t('cardio.metresUnit');
  const { elapsedSec, distanceKm, hr, calories, splits, gps, paused, confirmEnd, kmMoment, backIn, backBar } = props;
  const metresTotal = distanceKm * 1000;
  const metresIntoKm = metresTotal % 1000; // 0–1000 within the current kilometre
  const dotFrac = Math.max(0, Math.min(1, metresIntoKm / 1000));
  const kmDone = Math.floor(distanceKm);
  const lastSplit = splits[splits.length - 1];

  return (
    <View style={styles.stage}>
      <SafeAreaView style={styles.stageSafe} edges={['top', 'bottom']}>
        {/* "CARDIO" — a legend, a word: sans. */}
        <View style={styles.liveTop}>
          <Legend size={12} tone="onStage">{t('cardio.liveLegend')}</Legend>
        </View>

        <View style={styles.liveBody}>
          {/* the elapsed clock — the hero. Pure figures + ":" — mono. */}
          <Text style={styles.clock}>{fmtClock(elapsedSec)}</Text>

          {/* the 1,000 m band — the dot travels the current kilometre, metres riding under it. */}
          <View style={styles.band}>
            <View style={styles.bandLabels}>
              <Legend size={10} track={0}>0</Legend>
              <Legend size={10} track={0}>{t('cardio.bandEnd')}</Legend>
            </View>
            <View style={styles.bandLine} />
            <View style={styles.bandCapL} />
            <View style={styles.bandCapR} />
            <View style={[styles.bandFill, { width: `${dotFrac * 100}%` }]} />
            <View style={[styles.bandDot, { left: `${dotFrac * 100}%` }]} />
            <View style={[styles.bandMetres, { left: `${dotFrac * 100}%` }]}>
              <Text style={styles.bandMetresNum}>{Math.round(metresIntoKm)}</Text>
              <Text style={[styles.bandMetresUnit, !monoCanDraw(metresUnit) && styles.unitWord]}> {metresUnit}</Text>
            </View>
          </View>

          {/* GPS truth line — never confident zeros while there is no lock. Fixed height, no jump. */}
          <View style={styles.gpsSlot}>
            {gps === 'acquiring' ? <Text style={styles.gpsStatus}>{t('cardio.gpsAcquiring')}</Text> : null}
            {gps === 'denied' || gps === 'unavailable' ? <Text style={styles.gpsStatus}>{t('cardio.gpsOff')}</Text> : null}
          </View>

          {/* one readable row: kilometre · heart · burn */}
          <View style={styles.liveRow}>
            <LiveStat value={kmDone} label={t('cardio.km')} />
            <LiveStat value={hr != null ? Math.round(hr) : '—'} label={t('cardio.hrShort')} icon="heart" />
            <LiveStat value={Math.round(calories)} label={t('cardio.kcal')} icon="flame" />
          </View>
        </View>

        <View style={styles.liveFooter}>
          {/* the split pill — a kilometre just logged, at the pace it took. */}
          {lastSplit ? (
            <View style={styles.splitPill}>
              <Icon name="checkCheck" size={14} color={signal[0]} strokeWidth={2.4} />
              <Legend size={12} track={0.04} tone="accent">
                {t('cardio.splitLogged', { km: lastSplit.km, pace: fmtPace(lastSplit.paceSec) })}
              </Legend>
            </View>
          ) : null}
          <Button
            variant="onstage"
            size="act"
            block
            label={t('cardio.pause')}
            onPress={props.onPause}
            leading={<Icon name="pause" size={18} color={stageC[0]} />}
          />
        </View>

        {/* 13.1 · PAUSED — the SAME stage the gym session raises. One pause screen for the whole
            product: same mark, same sentence, same two acts. What differs is only what is stated
            under it (the run's clock and distance) and that a run offers no pain door — it trains
            no muscle Hush prescribes, so there is nothing for a report to act on. v7 fixes the
            gait to a run (no picker, no in-run toggle), so the subject is one word. */}
        {paused ? (
          <PausedStage
            subject={t('cardio.run')}
            onResume={props.onResume}
            endLabel={t('cardio.finish')}
            onEnd={props.onAskEnd}
          >
            <View style={styles.pausedFacts}>
              <Text style={styles.pausedClock}>{fmtClock(elapsedSec)}</Text>
              <View style={styles.pausedStats}>
                <Text style={styles.pauseStat}>{distanceKm.toFixed(2)} {t('cardio.km')}</Text>
                <Text style={styles.pauseStat}>{fmtPace(distanceKm >= 0.05 ? elapsedSec / distanceKm : 0)} {t('cardio.perKm')}</Text>
              </View>
            </View>
          </PausedStage>
        ) : null}

        {/* end-confirm sheet — bound to the same condition as the overlay that arms it. */}
        {confirmEnd && paused ? (
          <BottomSheet onClose={props.onKeepGoing}>
            <Legend style={styles.sheetLegend}>{t('cardio.endLegend')}</Legend>
            <Text style={styles.sheetTitle}>{t('cardio.endTitleRun')}</Text>
            <Text style={styles.sheetBody}>{t('cardio.endBody')}</Text>
            <View style={styles.sheetActions}>
              <Button variant="primary" block label={t('cardio.keepGoing')} onPress={props.onKeepGoing} />
              <Button variant="danger" block label={t('cardio.finish')} onPress={props.onFinish} />
            </View>
          </BottomSheet>
        ) : null}

        {/* 3.4b · KILOMETRE LOGGED — fires over the run each km, clears itself. */}
        {kmMoment ? <KmMoment split={kmMoment} splits={splits} backIn={backIn} progress={backBar} /> : null}
      </SafeAreaView>
    </View>
  );
}

/* ===================== KILOMETRE LOGGED (moment) — 3.4b ===================== */
/** EXPORTED for the gallery (3.4b): it already takes only props. */
export function KmMoment({ split, splits, backIn, progress }: { split: CardioSplit; splits: CardioSplit[]; backIn: number; progress: Animated.Value }) {
  const { t } = useCopy();
  const perKm = t('cardio.perKm');
  const paces = splits.map((s) => s.paceSec);
  const avg = paces.length ? paces.reduce((a, b) => a + b, 0) / paces.length : split.paceSec;
  const fastest = paces.length ? Math.min(...paces) : split.paceSec;
  const quickest = split.paceSec <= fastest; // this split IS the quickest so far (ties count)
  // Place the split against the run average — faster (lower pace) sits left of centre, slower right.
  const dev = avg > 0 ? Math.max(-0.4, Math.min(0.4, (split.paceSec - avg) / avg)) : 0;
  const dotFrac = 0.5 + dev;
  const barW = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.kmMoment}>
      <View style={styles.liveTop}>
        <Legend size={12} tone="onStage">{t('cardio.liveLegend')}</Legend>
      </View>

      <View style={styles.kmBody}>
        <View style={styles.kmBandWrap}>
          <View style={styles.kmBand}>
            <View style={styles.kmBandLine} />
            <View style={styles.kmBandSeg} />
            <View style={[styles.kmBandCap, { left: '24%' }]} />
            <View style={[styles.kmBandCap, { left: '76%' }]} />
            <View style={[styles.kmBandDot, { left: `${dotFrac * 100}%` }]} />
          </View>
          <Legend size={11} tone="onStage">{t('cardio.kmMomentLabel', { km: split.km })}</Legend>
        </View>

        {/* the split — figures alone in the light: mono. */}
        <View style={styles.kmSplit}>
          <Text style={styles.kmSplitNum}>{fmtPace(split.paceSec)}</Text>
          <Text style={[styles.kmSplitUnit, !monoCanDraw(perKm) && styles.unitWord]}>{perKm}</Text>
        </View>

        {quickest ? (
          <View style={styles.kmQuickest}>
            <Icon name="checkCheck" size={14} color={signal[0]} strokeWidth={2.4} />
            <Legend size={11.5} track={0.12} tone="accent">{t('cardio.kmMomentQuickest')}</Legend>
          </View>
        ) : null}
      </View>

      <View style={styles.kmFooter}>
        <Legend size={12.5} tone="onStage">{t('cardio.kmMomentBack', { n: backIn })}</Legend>
        <View style={styles.kmBarTrack}>
          <Animated.View style={[styles.kmBarFill, { width: barW }]} />
        </View>
      </View>
    </View>
  );
}

/* ============================ DONE (stage) — 3.4c ============================ */
/**
 * EXPORTED for the gallery (3.4c). `preview` is the harness's contract: the gallery is for LOOKING
 * at a screen, and this one PERSISTS on mount — a mount that saved a fictional run into the real
 * log would be the harness changing the data it exists to show.
 */
export function CardioComplete(props: {
  navigation: Props['navigation'];
  /** Gallery only — render the stage without recording anything. */
  preview?: boolean;
  gait: CardioGait;
  startedAt: string;
  elapsedSec: number;
  distanceKm: number;
  avgHr: number | null;
  calories: number;
  splits: CardioActivity['splits'];
  route: CardioPoint[];
}) {
  const { t } = useCopy();
  const kmUnit = t('cardio.km');
  const { navigation, gait, elapsedSec, distanceKm, avgHr, splits, route } = props;
  const avgPace = distanceKm >= 0.05 ? elapsedSec / distanceKm : 0;
  const hasRoute = route.length >= MIN_ROUTE_POINTS;

  // Persist the recorded activity exactly once, on mount (sealed from the engine). Route / splits /
  // hr / calories are all still saved to the log — they are simply not drawn on this stage.
  const saved = useRef(false);
  useEffect(() => {
    if (saved.current) return;
    saved.current = true;
    if (props.preview) return; // the harness looks; it never writes
    if (!cardioPerformed(elapsedSec, distanceKm)) return;
    const activity: CardioActivity = {
      kind: 'cardio',
      id: `cardio_${Date.now()}`,
      gait,
      startedAt: props.startedAt || new Date().toISOString(),
      durationSec: Math.round(elapsedSec),
      distanceKm: Math.round(distanceKm * 100) / 100,
      avgPaceSec: Math.round(avgPace),
      ...(avgHr != null ? { avgHr: Math.round(avgHr) } : {}),
      ...(props.calories > 0 ? { calories: Math.round(props.calories) } : {}),
      splits,
      ...(hasRoute
        ? { route: simplifyRoute(route).map((p) => ({ lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5) })) }
        : {}),
    };
    void db.appendCardioActivity(activity).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.stage}>
      <SafeAreaView style={styles.stageSafe} edges={['top', 'bottom']}>
        <View style={styles.doneBody}>
          <View style={styles.savedRow}>
            <Icon name="checkCheck" size={15} color={signal[0]} strokeWidth={2.4} />
            <Legend size={11.5} tone="accent">{t('cardio.savedLegend')}</Legend>
          </View>
          <Text style={styles.savedTitle}>{t('cardio.savedTitle')}</Text>

          <View style={styles.doneHero}>
            <Text style={styles.doneHeroNum}>{distanceKm.toFixed(1)}</Text>
            <Text style={[styles.doneHeroUnit, !monoCanDraw(kmUnit) && styles.unitWord]}>{kmUnit}</Text>
          </View>

          <View style={styles.doneRow}>
            <DoneStat value={fmtClock(elapsedSec)} label={t('cardio.timeShort')} />
            <DoneStat value={Math.round(props.calories)} label={t('cardio.kcal')} icon="flame" />
            <DoneStat value={avgHr != null ? Math.round(avgHr) : '—'} label={t('cardio.avgHrShort')} icon="heart" />
          </View>
        </View>

        <View style={styles.doneFooter}>
          <Button variant="onstage" size="lg" block label={t('cardio.done')} onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    </View>
  );
}

/* ---- small instrument readouts ---- */
function LiveStat({ value, label, icon }: { value: string | number; label: string; icon?: 'heart' | 'flame' }) {
  return (
    <View style={styles.liveStat}>
      <View style={styles.liveStatRow}>
        {icon ? <Icon name={icon} size={18} color={signal[0]} strokeWidth={2} /> : null}
        <Text style={styles.liveStatVal}>{value}</Text>
      </View>
      <Legend size={10.5} track={0.14} tone="onStage">{label}</Legend>
    </View>
  );
}

function DoneStat({ value, label, icon }: { value: string | number; label: string; icon?: 'heart' | 'flame' }) {
  return (
    <View style={styles.doneStat}>
      <View style={styles.liveStatRow}>
        {icon ? <Icon name={icon} size={16} color={signal[0]} strokeWidth={2} /> : null}
        <Text style={styles.doneStatVal}>{value}</Text>
      </View>
      <Legend size={10.5} track={0.14} tone="onStage">{label}</Legend>
    </View>
  );
}

const MOSS_WASH = 'rgba(169,196,159,0.12)';
const MOSS_BORDER = 'rgba(169,196,159,0.3)';
const LINE = 'rgba(241,238,229,0.16)';

const styles = StyleSheet.create({
  // stage (shared)
  stage: { flex: 1, backgroundColor: stageC[0] },
  stageSafe: { flex: 1 },

  // countdown
  countdownWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  startingLegend: { fontFamily: font.sansSemibold, fontSize: textScale.md, letterSpacing: trackingPx(textScale.md, tracking.legend), color: stageC.ink1, marginBottom: 28, textAlign: 'left' },
  countNum: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: 140, lineHeight: 150, letterSpacing: -6, color: stageC.ink0, textAlign: 'left' },
  countGo: { fontFamily: font.sansBold, letterSpacing: -4, color: stageC.lift }, // rtl-ok

  // LIVE (3.4)
  liveTop: { alignItems: 'center', paddingTop: 14 },
  liveBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 30, paddingHorizontal: 28 },
  // The elapsed clock is the lit thing on a run, exactly as the load is on a set: the BRIGHT
  // cream with a wide soft glow, never the plain ink.
  clock: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 84,
    lineHeight: 88,
    includeFontPadding: false,
    letterSpacing: -3.36,
    color: '#f6f3ea',
    textAlign: 'left',
    textShadowColor: 'rgba(246,243,234,0.12)',
    textShadowRadius: 44,
    textShadowOffset: { width: 0, height: 0 },
  },

  band: { width: '100%', maxWidth: 310, height: 64, marginTop: 4 },
  bandLabels: { position: 'absolute', left: 0, right: 0, top: -2, flexDirection: 'row', justifyContent: 'space-between' },
  bandLine: { position: 'absolute', left: 0, right: 0, top: 30, height: 1, backgroundColor: LINE },
  bandCapL: { position: 'absolute', left: 0, top: 22, width: 2, height: 18, backgroundColor: 'rgba(241,238,229,0.4)' },
  bandCapR: { position: 'absolute', right: 0, top: 22, width: 2, height: 18, backgroundColor: 'rgba(241,238,229,0.4)' },
  bandFill: { position: 'absolute', left: 0, top: 29, height: 3, borderRadius: 2, backgroundColor: signal[0] },
  bandDot: { position: 'absolute', top: 24, marginLeft: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: stageC.ink0, borderWidth: 2.5, borderColor: signal[0] }, // rtl-ok: centering offset pairs with the physical `left` set inline; the distance band is a direction-neutral data axis
  bandMetres: { position: 'absolute', top: 44, marginLeft: -22, flexDirection: 'row', alignItems: 'baseline', width: 60, justifyContent: 'center' }, // rtl-ok: centering offset pairs with the physical `left` set inline; the distance band is a direction-neutral data axis
  bandMetresNum: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: 21, color: signal[0], textAlign: 'left' },
  bandMetresUnit: { fontFamily: font.monoSemibold, fontSize: 21, color: signal[0], textAlign: 'left' },

  gpsSlot: { height: 20, justifyContent: 'center' },
  gpsStatus: { fontFamily: font.sans, fontSize: textScale.xs, color: stageC.ink2, letterSpacing: 0.3, textAlign: 'left' },

  liveRow: { flexDirection: 'row', width: '100%', maxWidth: 340, justifyContent: 'space-evenly', borderTopWidth: 1, borderTopColor: 'rgba(241,238,229,0.1)', paddingTop: 26 },
  liveStat: { alignItems: 'center', gap: 5 },
  liveStatRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveStatVal: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 36, color: stageC.ink0, textAlign: 'left' },

  liveFooter: { paddingHorizontal: 26, paddingBottom: 30, gap: 12 },
  splitPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 11, paddingHorizontal: 16, borderRadius: radius.full, backgroundColor: MOSS_WASH, borderWidth: 1, borderColor: MOSS_BORDER },

  // 13.1 — what a PAUSED RUN states under the sentence. The lifting stage states nothing there:
  // a set has no clock of its own to hold, and a run does.
  pausedFacts: { alignItems: 'center', gap: 10 },
  pausedClock: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale['4xl'], letterSpacing: -1.4, color: stageC.ink0, textAlign: 'center' },
  pausedStats: { flexDirection: 'row', gap: 24 },
  pauseStat: { fontFamily: font.sans, fontVariant: ['tabular-nums'], fontSize: textScale.sm, color: stageC.ink1, textAlign: 'center' },

  // the end-confirm sheet (paper — a decision, not part of the stage)
  sheetLegend: { marginBottom: 10 },
  sheetTitle: { fontFamily: font.sansSemibold, fontSize: textScale.xl, letterSpacing: trackingPx(textScale.xl, tracking.tight), color: color.textPrimary, textAlign: 'left' },
  sheetBody: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 23, color: color.textSecondary, marginTop: 10, textAlign: 'left' },
  sheetActions: { marginTop: 22, gap: 10 },

  // DONE (3.4c)
  doneBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 26, paddingHorizontal: 34 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  savedTitle: { fontFamily: font.serif, fontSize: 40, lineHeight: 44, color: stageC.ink0, textAlign: 'center' },
  doneHero: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 10 },
  doneHeroNum: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 106,
    lineHeight: 108,
    includeFontPadding: false,
    letterSpacing: -4.77,
    color: '#f6f3ea',
    textAlign: 'left',
    textShadowColor: 'rgba(246,243,234,0.14)',
    textShadowRadius: 44,
    textShadowOffset: { width: 0, height: 0 },
  },
  doneHeroUnit: { fontFamily: font.mono, fontSize: 22, color: stageC.ink1, textAlign: 'left' },
  doneRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-evenly', borderTopWidth: 1, borderTopColor: 'rgba(241,238,229,0.1)', paddingTop: 26 },
  doneStat: { alignItems: 'center', gap: 5 },
  doneStatVal: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 30, color: stageC.ink0, textAlign: 'left' },
  doneFooter: { paddingHorizontal: 26, paddingBottom: 30 },

  // KILOMETRE LOGGED (3.4b) — a full, opaque overlay; the run keeps tracking underneath.
  kmMoment: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: stageC[0] },
  kmBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, paddingHorizontal: 34, marginTop: -16 },
  kmBandWrap: { alignItems: 'center', gap: 12 },
  kmBand: { width: 230, height: 20, justifyContent: 'center' },
  kmBandLine: { position: 'absolute', left: 0, right: 0, top: 9.5, height: 1, backgroundColor: 'rgba(241,238,229,0.18)' },
  kmBandSeg: { position: 'absolute', left: '24%', right: '24%', top: 9, height: 2, backgroundColor: 'rgba(169,196,159,0.5)' },
  kmBandCap: { position: 'absolute', top: 3, width: 1.5, height: 14, backgroundColor: 'rgba(169,196,159,0.5)' },
  kmBandDot: { position: 'absolute', top: 4.5, marginLeft: -5.5, width: 11, height: 11, borderRadius: 6, backgroundColor: stageC.ink0, borderWidth: 2.5, borderColor: signal[0] }, // rtl-ok: centering offset pairs with the physical `left` set inline; the km band is a direction-neutral data axis
  kmSplit: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  kmSplitNum: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 104,
    lineHeight: 106,
    includeFontPadding: false,
    letterSpacing: -4.68,
    color: signal[0],
    textAlign: 'left',
    textShadowColor: 'rgba(169,196,159,0.18)',
    textShadowRadius: 44,
    textShadowOffset: { width: 0, height: 0 },
  },
  kmSplitUnit: { fontFamily: font.mono, fontSize: 20, color: stageC.ink1, textAlign: 'left' },
  kmQuickest: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kmFooter: { paddingHorizontal: 26, paddingBottom: 30, alignItems: 'center', gap: 9 },
  kmBarTrack: { width: 130, height: 3, borderRadius: 2, backgroundColor: 'rgba(241,238,229,0.15)', overflow: 'hidden' },
  kmBarFill: { height: '100%', backgroundColor: signal[0] },
  // The sans sibling every mono UNIT slot hands over to when the locale spells it in Hebrew.
  unitWord: { fontFamily: font.sans },
});
