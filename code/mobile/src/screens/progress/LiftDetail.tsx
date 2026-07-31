/**
 * LiftDetail — ONE LIFT'S CARD, opened by tapping a chip on Progress · Lifts (v7 3.2b).
 *
 * "The long always-open history is gone. The climb now carries tappable points, and the story sits
 * behind two tabs — Milestones (the few that mattered) opens by default; All changes holds the full
 * engine log. Tapping any graph point surfaces that day's decision."
 *
 * IA (top → bottom):
 *   · header — back, and the surface it came from (PROGRESS · LIFTS)
 *   · the lift named in the coach's serif, its muscle / band / start date beneath, and where it
 *     stands today as the one big mono figure
 *   · THE CLIMB — tappable. A tapped day answers in the callout above it.
 *   · two tabs, with counts: Milestones (default) · All changes
 *   · the rows, and the tap hint sealing the page
 *
 * READS ONLY. The climb and the marks are display arithmetic over logged sets (domain/liftDetail);
 * the change ledger is the engine's own stamped `changeLog`, read back off persisted state. Nothing
 * here decides a load, a band or a verdict — the engine did that at the end of each occurrence.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Climb, Legend } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db, type EngineV5State } from '@/data/local/db';
import { exerciseById, exerciseDisplayName } from '@/data/exercises';
import { milestoneCopy } from '@/domain/milestoneCopy';
import { displayWeight, unitLabel } from '@/domain/schedule';
import {
  changeDirection,
  liftChanges,
  liftClimb,
  liftMoments,
  pointIndexAt,
  type LiftChange,
  type LiftClimb,
  type LiftMoment,
} from '@/domain/liftDetail';
import type { Session } from '@/data/local/models';
import { color, space, font, textScale, tracking, trackingPx, radius, signal, press } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'LiftDetail'>;

/** Which story the page is telling. Milestones opens — "the few that mattered". */
type Tab = 'moments' | 'changes';

/** The engine's own band for this lift, read structurally off persisted state (no engine import). */
function bandOf(state: EngineV5State | null, exerciseId: string): [number, number] | null {
  const ex = state?.exercises?.[exerciseId] as { band?: unknown } | undefined;
  const b = ex?.band;
  return Array.isArray(b) && b.length === 2 && typeof b[0] === 'number' && typeof b[1] === 'number'
    ? [b[0], b[1]]
    : null;
}

/**
 * The route container: it READS (history + the stamped engine state) and hands the view facts.
 * Split for the same reason Home/HomeView are — the view is then mountable against fixtures, so the
 * gallery draws the real screen rather than a copy of it.
 */
export function LiftDetail({ navigation, route }: Props) {
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  const exerciseId = route.params.exerciseId;

  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [engine, setEngine] = useState<EngineV5State | null>(null);

  useEffect(() => {
    let active = true;
    db.loadHistory().then((all) => active && setSessions(all));
    // The stamped ledger, read back. A first-run device has no state yet — the tab then simply
    // holds no rows, which is the true answer, not an error.
    Promise.resolve(db.loadEngineV5())
      .then((s) => active && setEngine(s ?? null))
      .catch(() => active && setEngine(null));
    return () => {
      active = false;
    };
  }, []);

  const climb = useMemo<LiftClimb>(() => liftClimb(sessions ?? [], exerciseId), [sessions, exerciseId]);
  const moments = useMemo<LiftMoment[]>(
    () => liftMoments(sessions ?? [], app.profile, exerciseId, climb),
    [sessions, app.profile, exerciseId, climb],
  );
  const changes = useMemo<LiftChange[]>(() => liftChanges(engine?.changeLog, exerciseId), [engine, exerciseId]);

  return (
    <LiftDetailView
      exerciseId={exerciseId}
      units={units}
      climb={climb}
      moments={moments}
      changes={changes}
      band={bandOf(engine, exerciseId)}
      loaded={sessions != null}
      onBack={() => navigation.goBack()}
    />
  );
}

export interface LiftDetailViewProps {
  exerciseId: string;
  units: 'kg' | 'lb';
  climb: LiftClimb;
  moments: LiftMoment[];
  changes: LiftChange[];
  /** The engine's own rep band for this lift; null until it has one. */
  band: [number, number] | null;
  /** History has been read. False = still reading, and the page says nothing rather than "empty". */
  loaded: boolean;
  onBack: () => void;
}

export function LiftDetailView({ exerciseId, units, climb, moments, changes, band, loaded, onBack }: LiftDetailViewProps) {
  const { t } = useCopy();
  const [tab, setTab] = useState<Tab>('moments');
  const [tapped, setTapped] = useState<number | null>(null);
  // The trace is drawn into the LIVE window width, not a Dimensions snapshot taken at import: a
  // rotation, a split view or the web harness all change it after the module has loaded.
  const graphW = Math.round(useWindowDimensions().width - 60);

  const isReps = climb.mode === 'reps';
  const conv = (v: number) => (isReps ? v : displayWeight(v, units) ?? 0);
  const unit = isReps ? t('report.repsUnit') : unitLabel(units);

  // The days that carry news wear the small dot: a stamped change, or a mark crossed.
  /* TWO KINDS OF NEWS, TOLD APART (founder 2026-07-28). They used to be poured into one Set, so
     the graph could say "something happened here" and never which. A CHANGE is the engine moving
     the load; a MILESTONE is a mark she crossed. Both are worth a point; they are not the same
     point, and the shapes that draw them say so (see `Climb`). */
  const changeMarks = useMemo(() => {
    const idx = new Set<number>();
    for (const c of changes) {
      const i = pointIndexAt(climb.points, c.atMs);
      if (i >= 0) idx.add(i);
    }
    return [...idx];
  }, [changes, climb.points]);

  const milestoneMarks = useMemo(() => {
    const idx = new Set<number>();
    for (const m of moments) {
      // A MARK, not merely a moment. `origin` is the left end of the line — "where you began" is
      // true of the first point by construction, and ringing it would promise news at the one
      // place there cannot be any. A `club` crossed and a `best` set are both real marks.
      if (m.kind === 'origin') continue;
      const i = pointIndexAt(climb.points, m.atMs);
      if (i >= 0) idx.add(i);
    }
    return [...idx];
  }, [moments, climb.points]);

  const ex = exerciseById(exerciseId);
  const muscle = ex ? t(`muscle.${ex.muscle}`) : '';
  const meta = [
    muscle,
    band ? t('progress.bandMeta', { lo: band[0], hi: band[1] }) : null,
    climb.firstAtMs != null ? t('progress.sinceMeta', { date: shortDate(climb.firstAtMs) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  /** What a tapped day says. That day's stamped decision if there is one; else what she lifted. */
  /* What a tapped point SAYS — and it must say which of the two things it is, because that is the
     whole reason the point is marked. A mark she crossed leads (it is the rarer news), then the
     load the engine moved to and the direction it moved, then — for an ordinary day — simply what
     she lifted. Any moment counts, not only a `club`: the graph draws a ring for every one, so a
     ring that opened to a bare weight would be the point promising news and then withholding it. */
  const calloutFor = (i: number): string | null => {
    const p = climb.points[i];
    if (!p) return null;
    const mark = moments.find((m) => pointIndexAt(climb.points, m.atMs) === i && m.kind !== 'origin');
    if (mark) {
      const word = mark.kind === 'best' ? t('progress.bestWord') : t('progress.markWord');
      return `${conv(mark.milestone ? mark.value : p.dayBest)} · ${word}`;
    }
    const change = changes.find((c) => pointIndexAt(climb.points, c.atMs) === i);
    if (change && change.loadTo != null) {
      return `${conv(change.loadTo)} · ${t(`progress.dir_${changeDirection(change)}`)}`;
    }
    return `${conv(p.dayBest)} ${unit}`;
  };

  const empty = loaded && climb.points.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.back, { opacity: pressed ? press.opacity : 1 }]}
        >
          <Icon name="chevronLeft" size={22} color={color.textPrimary} strokeWidth={1.8} />
        </Pressable>
        <Legend align="center" size={11.5} style={styles.headLegend}>
          {`${t('progress.title')} · ${t('progress.tabLifts')}`}
        </Legend>
        <View style={styles.headSpacer} />
      </View>

      {/* the lift, and where it stands */}
      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          <Text style={styles.name} accessibilityRole="header" numberOfLines={2}>
            {exerciseDisplayName(exerciseId)}
          </Text>
          {meta ? <Legend size={11.5} track={0.1}>{meta}</Legend> : null}
        </View>
        {!empty ? (
          <View style={styles.standRow}>
            <Text style={styles.stand}>{conv(climb.current)}</Text>
            <Text style={styles.standUnit}>{unit}</Text>
          </View>
        ) : null}
      </View>

      {/* ════ THE CLIMB — AND WHAT STANDS THERE BEFORE THERE IS ONE (founder C.18) ════
          "No graph when you open a lift."
          There was one, technically: at a single training day `Climb` draws a lone dot in the
          middle of a 138 px box — no line, no fill, no shape. A dot in a void is not a graph, and
          it does not tell her the honest thing, which is that ONE DAY IS NOT A CLIMB YET. Two
          points are the minimum that can rise. So the graph draws from the second day and the
          first one gets a sentence in the same slot: the page keeps its shape, and instead of
          looking broken it says what it is waiting for. (Her CURRENT figure is beside the title
          throughout — the number she has is never withheld, only the shape it has not made yet.) */}
      {climb.points.length > 1 ? (
        <View style={styles.graph}>
          {graphW > 0 ? (
            <Climb
              data={climb.points.map((p) => conv(p.value))}
              width={graphW}
              height={138}
              markers={changeMarks}
              milestones={milestoneMarks}
              selected={tapped}
              onSelect={(i) => setTapped((cur) => (cur === i ? null : i))}
              callout={tapped != null ? calloutFor(tapped) : null}
              endLabel={String(conv(climb.best))}
              pointLabel={(i) =>
                t('progress.pointLabel', { date: shortDate(climb.points[i]?.atMs ?? 0), value: conv(climb.points[i]?.dayBest ?? 0), unit })
              }
            />
          ) : null}
        </View>
      ) : climb.points.length === 1 ? (
        <View style={styles.graphWaiting}>
          <Text style={styles.climbWaiting}>{t('progress.climbNeedsTwo')}</Text>
        </View>
      ) : null}

      <View style={styles.body}>
        {/* the two stories, with their counts */}
        <View style={styles.tabs}>
          <TabButton
            active={tab === 'moments'}
            icon="star"
            label={t('progress.tabMilestones')}
            count={moments.length}
            onPress={() => setTab('moments')}
          />
          <TabButton
            active={tab === 'changes'}
            icon="trendingUp"
            label={t('progress.tabChanges')}
            count={changes.length}
            onPress={() => setTab('changes')}
          />
        </View>

        <ScrollView style={styles.rows} contentContainerStyle={styles.rowsContent} showsVerticalScrollIndicator={false}>
          {empty ? (
            <Text style={styles.emptyLine}>{t('progress.liftEmpty')}</Text>
          ) : tab === 'moments' ? (
            moments.map((m, i) => (
              <MomentRow key={`${m.kind}${m.atMs}${i}`} moment={m} value={conv(m.value)} unit={unit} units={units} />
            ))
          ) : changes.length === 0 ? (
            <Text style={styles.emptyLine}>{t('progress.changesEmpty')}</Text>
          ) : (
            changes.map((c, i) => <ChangeRow key={`${c.atMs}${i}`} change={c} conv={conv} unit={unit} />)
          )}
        </ScrollView>

        {/* THE HINT IS GONE (founder 2026-07-28). It told her to tap a point on a graph whose points
            were 2.6 px at half opacity — a caption compensating for a target too small to see. The
            points are targets now, and a marked one wears a shape that asks to be pressed. */}
      </View>
    </SafeAreaView>
  );
}

/** "26 JUN" — day + month, composed to avoid the locale comma. Uppercased by the Legend/row. */
function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.toLocaleDateString(undefined, { day: 'numeric' })} ${d.toLocaleDateString(undefined, { month: 'short' })}`;
}

/** Today reads as TODAY — a date the athlete has to decode is a date she has to decode. */
function useDateWord(): (ms: number) => string {
  const { t } = useCopy();
  return (ms: number) => {
    const d = new Date(ms);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    return sameDay ? t('progress.today') : shortDate(ms);
  };
}

function TabButton({
  active,
  icon,
  label,
  count,
  onPress,
}: {
  active: boolean;
  icon: 'star' | 'trendingUp';
  label: string;
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} (${count})`}
      onPress={onPress}
      style={({ pressed }) => [styles.tab, active && styles.tabActive, { opacity: pressed ? press.opacity : 1 }]}
    >
      <Icon name={icon} size={icon === 'star' ? 14 : 15} color={active ? signal[0] : color.textMuted} strokeWidth={1.9} />
      <Text style={[styles.tabLabel, active ? styles.tabLabelOn : styles.tabLabelOff]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.tabCount, active ? styles.tabCountOn : styles.tabCountOff]}>{count}</Text>
    </Pressable>
  );
}

/** One of the few that mattered: the mark's ring, the load, the date, and its one factual line. */
function MomentRow({ moment, value, unit, units }: { moment: LiftMoment; value: number; unit: string; units: 'kg' | 'lb' }) {
  const { t } = useCopy();
  const dateWord = useDateWord();
  const line =
    moment.kind === 'best'
      ? t('progress.momentBest')
      : moment.kind === 'origin'
        ? t('progress.momentOrigin')
        : // A club mark keeps its own named line when it has one ("The one-plate club."). Its
          // TITLE is not usable here: it spells "40 kg Barbell Row", and the lift is the page's
          // headline and the row's own figure — three times is not a sentence.
          (milestoneCopy(moment.milestone!, t, units).sub ?? t('progress.momentClub'));

  return (
    <View style={styles.row}>
      <View style={[styles.mark, moment.kind === 'best' && styles.markBest, moment.kind === 'club' && styles.markClub, moment.kind === 'origin' && styles.markOrigin]}>
        {moment.kind === 'best' ? (
          <Icon name="star" size={16} color={signal[0]} />
        ) : moment.kind === 'club' ? (
          <Icon name="check" size={18} color={color.onAccent} strokeWidth={2.6} />
        ) : (
          <Icon name="plus" size={15} color={color.textMuted} strokeWidth={1.8} />
        )}
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowHead}>
          <Text style={[styles.rowValue, moment.kind === 'origin' && styles.rowValueMuted]}>
            {value}
            <Text style={styles.rowUnit}> {unit}</Text>
          </Text>
          <Legend size={10.5} track={0.06}>{dateWord(moment.atMs)}</Legend>
        </View>
        <Text style={styles.rowLine}>{line}</Text>
      </View>
    </View>
  );
}

/** One stamped engine decision: which way it went, from what to what, and when. */
function ChangeRow({ change, conv, unit }: { change: LiftChange; conv: (v: number) => number; unit: string }) {
  const { t } = useCopy();
  const dateWord = useDateWord();
  const dir = changeDirection(change);
  const to = change.loadTo != null ? conv(change.loadTo) : null;
  const from = change.loadFrom != null ? conv(change.loadFrom) : null;

  // A structural move (graduation / rotation / an adopted swap) names the lift it became; a volume
  // move belongs to the muscle, not the bar. Both say so in words rather than pretending a weight.
  const structural = change.kind === 'graduate' || change.kind === 'swap';
  // BOTH ENDS only when the load actually travelled. "From 42.5 to 42.5" is not a sentence, it is
  // the screen filling a slot — a hold says it held.
  const moved = from != null && to != null && from !== to;

  return (
    <View style={styles.row}>
      <View style={[styles.mark, dir === 'up' ? styles.markUp : styles.markHold]}>
        <Icon
          name={dir === 'up' ? 'trendingUp' : dir === 'down' ? 'chevronDown' : 'minus'}
          size={15}
          color={dir === 'up' ? signal[0] : color.textMuted}
          strokeWidth={1.9}
        />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowHead}>
          {/* A LOAD is a figure and takes the mono; a lift's new NAME, or a bare verdict word when
              no load was stamped, is language — and mono cannot draw Hebrew at all (the law). */}
          {to != null && !structural ? (
            <Text style={[styles.rowValue, dir !== 'up' && styles.rowValueMuted]} numberOfLines={1}>
              {to}
              <Text style={styles.rowUnit}> {unit}</Text>
            </Text>
          ) : (
            <Text style={[styles.rowWord, dir !== 'up' && styles.rowValueMuted]} numberOfLines={1}>
              {structural
                ? t('progress.changeBecame', { exercise: exerciseDisplayName(change.toExercise) })
                : t(`progress.dir_${dir}`)}
            </Text>
          )}
          <Legend size={10.5} track={0.06}>{dateWord(change.atMs)}</Legend>
        </View>
        <Text style={styles.rowLine}>
          {structural || !moved
            ? t(`progress.changeWord_${change.kind ?? dir}`)
            : t('progress.changeFromTo', { from, to, unit })}
        </Text>
      </View>
    </View>
  );
}

const HAIRLINE = 'rgba(241,238,229,0.10)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.gutter - 4,
    paddingTop: 12,
    minHeight: 44,
  },
  back: { width: 22, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headLegend: { flex: 1 },
  headSpacer: { width: 22 },

  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingHorizontal: 30, paddingTop: 16 },
  titleLeft: { flexShrink: 1, gap: 5 },
  // The lift is named in the coach's serif at 34 — a screen headline, under the 40 of a surface.
  name: { fontFamily: font.serif, fontSize: 34, lineHeight: 36, color: color.textPrimary, textAlign: 'left' },
  standRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 0 },
  stand: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 46, lineHeight: 47, letterSpacing: -1.38, color: color.textPrimary, textAlign: 'left' },
  standUnit: { fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textMuted, textAlign: 'left' },

  // A fixed HEIGHT so the page does not jump on the first layout pass, before the width is known.
  graph: { marginHorizontal: 30, marginTop: 14, height: 138 },
  // C.18 — the climb's own slot, holding the reason it is not drawn yet. Same box, so the page
  // below it does not move when the second day arrives and the graph takes the space over.
  graphWaiting: { marginHorizontal: 30, marginTop: 14, height: 138, justifyContent: 'center' },
  climbWaiting: { fontFamily: font.serif, fontStyle: 'italic', fontSize: 16, lineHeight: 23, color: color.textMuted, textAlign: 'left' },

  body: { flex: 1, minHeight: 0, paddingHorizontal: 30, paddingTop: 12 },

  tabs: {
    flexDirection: 'row',
    gap: 6,
    padding: 5,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.fillSubtle,
  },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11, borderRadius: 11 },
  tabActive: { backgroundColor: 'rgba(241,238,229,0.09)' },
  tabLabel: { fontFamily: font.sansSemibold, fontSize: textScale.sm, textAlign: 'left', flexShrink: 1 },
  tabLabelOn: { color: color.textPrimary },
  tabLabelOff: { color: color.textMuted },
  // The count is a FIGURE — mono, and it wears the moss stamp only on the open tab.
  tabCount: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 14, paddingVertical: 2, paddingHorizontal: 7, borderRadius: radius.full, overflow: 'hidden', textAlign: 'center' },
  tabCountOn: { color: color.onAccent, backgroundColor: signal[0] },
  tabCountOff: { color: color.textMuted, borderWidth: 1, borderColor: 'rgba(241,238,229,0.2)' },

  rows: { flex: 1, marginTop: 6 },
  rowsContent: { paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, borderTopWidth: 1, borderTopColor: HAIRLINE },
  mark: { width: 44, height: 44, flexShrink: 0, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  markBest: { borderWidth: 1.5, borderColor: 'rgba(169,196,159,0.45)', backgroundColor: 'rgba(169,196,159,0.08)' },
  markClub: { backgroundColor: signal[0] },
  markOrigin: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(241,238,229,0.3)' },
  markUp: { borderWidth: 1.5, borderColor: 'rgba(169,196,159,0.45)', backgroundColor: 'rgba(169,196,159,0.08)' },
  markHold: { borderWidth: 1.5, borderColor: color.border },

  rowBody: { flex: 1, gap: 3 },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  rowValue: { flexShrink: 1, fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  // The same row, when it carries a WORD rather than a figure — sans, at the same weight and size.
  rowWord: { flexShrink: 1, fontFamily: font.sansSemibold, fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  rowValueMuted: { color: color.textMuted },
  // The unit is a translated slot (he: "ק״מ" / "חזרות") — sans, never mono.
  rowUnit: { fontFamily: font.sansMedium, fontSize: textScale.sm, color: color.textMuted }, // rtl-ok: nested span inside rowValue, which sets textAlign
  // The line the mark earns is the coach speaking — serif italic, the one voice on this page.
  rowLine: { fontFamily: font.serif, fontStyle: 'italic', fontSize: 13.5, lineHeight: 19, color: color.textSecondary, textAlign: 'left' },

  emptyLine: { paddingTop: 22, fontFamily: font.serif, fontStyle: 'italic', fontSize: 15, lineHeight: 22, color: color.textMuted, textAlign: 'left' },

  hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(241,238,229,0.08)' },
  hintText: { fontFamily: font.sans, fontSize: 15, color: color.textMuted, textAlign: 'center' },
});
