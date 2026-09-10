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

// 

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Arrive, Climb, Legend, Button, TextField } from '@/components/ds';
import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db, type EngineV5State } from '@/data/local/db';
// ⛔ ONE DOOR ONTO HER WEEK, whoever wrote it — the coach's plan when there is one, the engine's
// programme in the same shape when there is not. See `data/local/weekPlan`.
import { loadWeekPlan } from '@/data/local/weekPlan';
import type { CoachDecision } from '@/domain/coachLog';
import type { CoachPlan } from '@/domain/coachPlan';
import { exerciseById, exerciseDisplayName } from '@/data/exercises';
import { milestoneCopy } from '@/domain/milestoneCopy';
import { liftKnowledge, knowsAnything, type LiftKnowledge } from '@/domain/whatIKnow';
import { displayWeight, unitLabel } from '@/domain/schedule';
import {
  changeDirection,
  liftChanges,
  liftChangesFromCoach,
  liftClimb,
  liftMoments,
  pointIndexAt,
  strengthEstimate,
  type StrengthEstimate,
  type LiftChange,
  type LiftClimb,
  type LiftMoment,
} from '@/domain/liftDetail';
import type { Session } from '@/data/local/models';
import { color, space, font, textScale, tracking, trackingPx, radius, signal, press } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';
// The app's language, not the device's — see `everyDateSpeaksHerLanguage`.
import { currentLocale } from '@/i18n';

type Props = NativeStackScreenProps<MainParamList, 'LiftDetail'>;

/** Which story the page is telling. Milestones opens — "the few that mattered". */
type Tab = 'moments' | 'changes';

/** The engine's own band for this lift, read structurally off persisted state (no engine import). */
/**
 * Her band for this lift — the prescription, read from the programme that prescribes it.
 *
 * ⚠️ It read the ENGINE's stamped state, and nothing writes that any more: `ensureExercisesV5` has
 * no caller left, so the band was silently null on every lift for every athlete. The coach writes
 * the band into the item, which is where it was always going to be most honest — it is the same
 * pair the session runs against rather than a second copy in a ledger.
 */
function bandOf(plan: CoachPlan | null, exerciseId: string): [number, number] | null {
  for (const session of plan?.sessions ?? []) {
    for (const block of session.blocks) {
      for (const item of block.items) {
        if (item.kind === 'reps' && item.ex === exerciseId) return item.reps;
      }
    }
  }
  return null;
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
  const [coachLog, setCoachLog] = useState<CoachDecision[] | null>(null);
  /** The engine's own stamped decisions for this lift — the source, see the read below. */
  const [engineLog, setEngineLog] = useState<any[] | null>(null);
  const [plan, setPlan] = useState<CoachPlan | null>(null);

  useEffect(() => {
    let active = true;
    db.loadHistory().then((all) => active && setSessions(all));
    /*
     * ⛔ EVERY DECISION ABOUT THIS LIFT — FROM THE THING THAT MAKES THEM (2026-08-19).
     *
     * This read the coach's log, on the stated grounds that *"nothing writes the engine's changeLog
     * any more"*. That was true of the v4 fold and has been false since v5: `foldEngine` stamps
     * `state.changeLog` at the end of every workout. So the tab was drawing the empty half of the
     * product — and drawing it as five identical rows saying "held", because the coach mapper has
     * no from→to figures to give (see `liftChangesFromCoach`).
     *
     * The engine leads; the coach's log stays for an athlete whose history predates v5, where those
     * really are the only decisions on record.
     */
    void Promise.all([db.loadEngineV5().catch(() => null), db.loadCoachLog(), loadWeekPlan()])
      .then(([eng, l, p]) => {
        if (!active) return;
        setEngineLog(eng?.changeLog ?? []);
        setCoachLog(l);
        setPlan(p);
      })
      .catch(() => active && setCoachLog([]));
    return () => {
      active = false;
    };
  }, []);

  const climb = useMemo<LiftClimb>(() => liftClimb(sessions ?? [], exerciseId), [sessions, exerciseId]);
  /* Measured strength and her own note (2026-09-09, the formula report) — see `strengthEstimate`. */
  const estimate = useMemo(() => strengthEstimate(sessions ?? [], exerciseId), [sessions, exerciseId]);
  const [note, setNote] = useState<string>('');
  useEffect(() => {
    let active = true;
    db.loadLiftNotes()
      .then((all) => active && setNote(all[exerciseId] ?? ''))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [exerciseId]);
  const moments = useMemo<LiftMoment[]>(
    () => liftMoments(sessions ?? [], app.profile, exerciseId, climb),
    [sessions, app.profile, exerciseId, climb],
  );
  const changes = useMemo<LiftChange[]>(() => {
    const fromEngine = liftChanges(engineLog ?? undefined, exerciseId);
    if (fromEngine.length > 0) return fromEngine;
    return liftChangesFromCoach(coachLog ?? undefined, exerciseId);
  }, [engineLog, coachLog, exerciseId]);

  /*
   * ⛔ WHAT THE ENGINE HAS MEASURED ABOUT THIS LIFT (founder 2026-08-22, authorising the redesign).
   *
   * Four facts about HER — her slope, her rungs, her ceiling, her rest — every one of them a
   * statistic the loops already compute to make a decision, and every one of them shown to nobody
   * until now. `domain/whatIKnow` asks the engine's own façade rather than deriving any of it a
   * second time, and returns null wherever the evidence gate has not been cleared.
   */
  const band = bandOf(plan, exerciseId);
  const knowledge = useMemo(
    () => liftKnowledge(exerciseId, sessions ?? [], band?.[0] ?? 8),
    [exerciseId, sessions, band],
  );

  return (
    <LiftDetailView
      exerciseId={exerciseId}
      units={units}
      climb={climb}
      moments={moments}
      changes={changes}
      band={band}
      knowledge={knowledge}
      loaded={sessions != null}
      estimate={estimate}
      note={note}
      onSaveNote={(next) => {
        setNote(next);
        void db.saveLiftNote(exerciseId, next);
      }}
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
  /**
   * What the engine has MEASURED about this lift. Every field is null until its own evidence gate is
   * cleared — see `domain/whatIKnow`, and the law that holds it there.
   */
  knowledge?: LiftKnowledge;
  /** History has been read. False = still reading, and the page says nothing rather than "empty". */
  loaded: boolean;
  /** Measured strength (2026-09-09) — Epley over her logged working sets; null with no evidence. */
  estimate?: StrengthEstimate | null;
  /** Her own line about this lift, and the way to change it. Absent in fixtures = no note row. */
  note?: string;
  onSaveNote?: (note: string) => void;
  onBack: () => void;
}

export function LiftDetailView({ exerciseId, units, climb, moments, changes, band, knowledge, loaded, estimate, note, onSaveNote, onBack }: LiftDetailViewProps) {
  const { t } = useCopy();
  const [tab, setTab] = useState<Tab>('moments');
  const [tapped, setTapped] = useState<number | null>(null);
  /** The note sheet's draft — null while closed. */
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ THE CLIMB WAS DRAWN INTO THE WINDOW, NOT INTO ITS OWN SLOT (2026-08-27).
   *
   * It read `useWindowDimensions().width - 60` — the live window, correctly, and then guessed the
   * rest. `60` is `styles.graph`'s two 30-point margins, restated as a number a hundred lines away
   * from the style that owns them. It happens to be right on a phone and it is a guess everywhere
   * else, and the guess is exactly the kind this file's neighbours keep getting caught by:
   * **measured, not reserved.**
   *
   * ⚠️ AND IT MADE THE SCREEN UNREVIEWABLE. Measured in the harness, where the window is the
   * BROWSER and not the simulated phone: `width` came back 2880, so the trace was drawn **2,820
   * points wide inside a 390-point frame** and clipped at the gutter. What showed was the first
   * thirteen per cent of the line — its earliest, flattest stretch — so a 34 → 47.5 climb, a rise of
   * forty per cent, read on `3.2b` as a horizontal grey line. The one graph on the screen showed
   * none of the climb it exists to draw.
   *
   * The slot measures itself now. The margins can change in the stylesheet without a constant
   * elsewhere going stale, and a frame that is not the window gets the width it actually has.
   *
   * ⚠️ AND THE OLD SUM SURVIVES AS THE FIRST GUESS, deliberately. `onLayout` lands one frame after
   * mount and never at all in the test renderer — measuring from zero drew nothing on the first
   * paint and made `theClimbStartsOnTheSecondDay` fail, which is the law noticing correctly that
   * the graph had stopped existing. So the window's width opens the slot and the slot's own
   * measurement takes over the moment it arrives: right immediately, and right afterwards.
   * ════════════════════════════════════════════════════════════════════════════════════════════
   */
  /*
   * ⛔ AND THE FIRST WRITE OF THIS PUT A HOOK INSIDE A TERNARY (2026-08-27, caught on glass):
   * `measuredW > 0 ? measuredW : useWindowDimensions().width - 60`. The moment `onLayout` landed,
   * `useWindowDimensions` stopped being called and every hook after it shifted a slot — React threw
   * `Cannot read properties of undefined (reading 'length')` out of `areHookInputsEqual` and the
   * whole screen went to the error boundary.
   *
   * ⚠️ AND THE SUITE COULD NOT HAVE CAUGHT IT. `onLayout` never fires in the test renderer, so
   * `measuredW` is always 0 there, so the hook is always called and the order never changes. 3,559
   * tests passed on a screen that crashed on the second frame. The browser found it in one load.
   */
  const windowW = useWindowDimensions().width;
  const [measuredW, setMeasuredW] = useState(0);
  const graphW = measuredW > 0 ? measuredW : Math.round(windowW - 60);

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
      // ⚠️ WITH ITS UNIT. The ordinary-day branch below keeps it and this one dropped it, so a
      // ringed point read "100 · best" beside a plain point reading "95 kg" — and in pounds the
      // figure was a converted number with nothing saying what it had been converted to.
      return `${conv(mark.milestone ? mark.value : p.dayBest)} ${unit} · ${word}`;
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
        <Legend align="center" size={17} style={styles.headLegend}>
          {`${t('progress.title')} · ${t('progress.tabLifts')}`}
        </Legend>
        <View style={styles.headSpacer} />
      </View>

      {/* the lift, and where it stands

          ✦ AND IT ARRIVES (2026-08-27) — see the note at `HomeView`. Two beats: the lift and where
          it stands, then the climb that got it there. The rows below land with the climb, because a
          lift's history is one record and not a sequence of reveals. */}
      <Arrive order={0} style={styles.titleRow}>
        <View style={styles.titleLeft}>
          <Text style={styles.name} accessibilityRole="header" numberOfLines={2}>
            {exerciseDisplayName(exerciseId)}
          </Text>
          {meta ? <Legend size={17} track={0.1}>{meta}</Legend> : null}
        </View>
        {!empty ? (
          <View style={styles.standRow}>
            <Text style={styles.stand}>{conv(climb.current)}</Text>
            <Text style={styles.standUnit}>{unit}</Text>
          </View>
        ) : null}
      </Arrive>

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
        <View style={styles.graph} onLayout={(e) => setMeasuredW(Math.round(e.nativeEvent.layout.width))}>
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

      {/* ════ MEASURED STRENGTH, AND HER OWN LINE (2026-09-09, the formula report) ════
          The one figure every lifter expects, said as a READ with the set it was read from — never
          a mark, never a standard. Under it, the one thing the record cannot know: what SHE knows
          about this lift ("seat 4, safety bar"), kept with the lift and shown on the stage. */}
      {estimate && !isReps ? (
        <View style={styles.measuredRow}>
          <Legend size={17} track={0.18}>{t('progress.measuredStrength')}</Legend>
          <View style={styles.measuredFig}>
            <Text style={styles.measuredNum}>{conv(estimate.e1rm)}</Text>
            <Text style={styles.measuredUnit}>{unit}</Text>
          </View>
          <Text style={styles.measuredFrom}>
            {t('progress.measuredFrom', { load: conv(estimate.load), unit, reps: estimate.reps, date: shortDate(estimate.atMs) })}
          </Text>
        </View>
      ) : null}
      {onSaveNote ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={note ? t('progress.noteLegend') : t('progress.noteAdd')}
          onPress={() => setNoteDraft(note ?? '')}
          style={({ pressed }) => [styles.noteRow, pressed && { opacity: press.opacity }]}
        >
          {note ? (
            <>
              <Legend size={17} track={0.18}>{t('progress.noteLegend')}</Legend>
              <Text style={styles.noteText}>{note}</Text>
            </>
          ) : (
            <Text style={styles.noteAdd}>{t('progress.noteAdd')}</Text>
          )}
        </Pressable>
      ) : null}
      {noteDraft != null && onSaveNote ? (
        <BottomSheet onClose={() => setNoteDraft(null)} heightFraction={0.4}>
          <TextField
            label={t('progress.noteLegend')}
            value={noteDraft}
            placeholder={t('progress.notePlaceholder')}
            onChangeText={setNoteDraft}
            multiline
            maxLength={280}
            block
            autoFocus
          />
          <View style={styles.noteActions}>
            <Button
              variant="primary"
              block
              label={t('progress.noteSave')}
              onPress={() => {
                onSaveNote(noteDraft.trim());
                setNoteDraft(null);
              }}
            />
          </View>
        </BottomSheet>
      ) : null}

      <View style={styles.body}>
        {/*
          ════════════════════════════════════════════════════════════════════════════════════════
          ⛔ WHAT I HAVE MEASURED ABOUT THIS LIFT (founder 2026-08-22)
          ════════════════════════════════════════════════════════════════════════════════════════

          The engine knows four things about her on this lift and had never shown her one of them.
          They are not derived here and they are not new: `perRungForV5`, `observedLoads`,
          `railCeilingFor` and `learnedInterRestS` are the same functions the loops call to decide a
          load, read back out (`domain/whatIKnow`).

          ⚠️ AND EVERY ROW IS ABSENT UNTIL IT IS EARNED, which is the half that makes the panel
          honest rather than impressive. Below F-12's four like-for-like pairs there is no slope;
          below F-17's three samples there is no learned rest; on a lift with no completed set at her
          target there is no rail at all (L11 — and nothing replaces it: the one predicted physical
          ceiling this engine ever had was deleted as theory, and a panel is not the place to bring
          it back). **A panel that filled itself with bootstraps would be showing her the ledger's
          assumptions wearing her name.**

          ⚠️ THE RETIRED ROW IS DELIBERATELY NOT NAMED HERE, and the law caught me naming it.
          `everySurfacedSituationNamesAScreen` refuses a surface that cites a retired ledger code —
          even in order to say it is dead — because a reader scanning the screens for what this app
          implements cannot tell a citation from a resurrection. The reasoning is what belongs in a
          screen; the code belongs in the register.

          ⚠️ IT REPORTS, IT DOES NOT CLAIM — Progress's standing rule. Nothing here is a forecast, a
          score or a grade; every figure is a statistic the engine already acted on.
        */}
        {knowledge && knowsAnything(knowledge) ? (
          <View style={styles.known}>
            <Legend track={0.18} tone="muted">{t('progress.measuredLegend')}</Legend>
            <View style={styles.knownRows}>
              {knowledge.perRung != null ? (
                <KnownRow
                  label={t('progress.knownSlope')}
                  value={t('progress.knownSlopeValue', { n: Math.round(knowledge.perRung * 10) / 10 })}
                />
              ) : null}
              {knowledge.ceiling != null ? (
                <KnownRow
                  label={t('progress.knownCeiling')}
                  value={`${displayWeight(knowledge.ceiling, units)} ${unitLabel(units)}`}
                />
              ) : null}
              {knowledge.restS != null ? (
                <KnownRow
                  label={t('progress.knownRest')}
                  value={t('progress.knownRestValue', { n: knowledge.restS })}
                />
              ) : null}
              {knowledge.rungs.length > 1 ? (
                <KnownRow
                  label={t('progress.knownRungs')}
                  value={String(knowledge.rungs.length)}
                />
              ) : null}
            </View>
          </View>
        ) : null}

        {/*
          ⛔ THE SELECTOR DREW ITSELF WITH NOTHING BEHIND EITHER TAB (2026-08-27).

          On `3.2c` — a lift on its FIRST day, which is the state an athlete opens a new lift in —
          the page read: the name, the load, `העלייה מתחילה ביום השני שלך.`, and then a two-tab
          control saying `אבני דרך 0` / `כל השינויים 0` over an empty list. Two controls, both
          counting nothing, offering a choice between two empty rooms.

          ⚠️ AND ONLY ONE OF THE TWO HAD AN EMPTY LINE. `changes` says `changesEmpty`; `moments`
          renders `[].map(…)`, which draws nothing at all — so tapping the tab that is already
          selected did nothing visible, and the screen looked unfinished rather than young.

          The page already says the honest thing above: the climb has not started. A selector for
          two empty stories is not information, and it is the same fault the founder found on
          2026-08-26 — *"three controls that could never appear."* It appears when there is
          something to choose between.
        */}
        {moments.length + changes.length > 0 ? (
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
        ) : null}

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
  return `${d.toLocaleDateString(currentLocale(), { day: 'numeric' })} ${d.toLocaleDateString(currentLocale(), { month: 'short' })}`;
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
          <Legend size={17} track={0.06}>{dateWord(moment.atMs)}</Legend>
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
          <Legend size={17} track={0.06}>{dateWord(change.atMs)}</Legend>
        </View>
        {/*
          ⛔ AND THE COACH'S OWN SENTENCE WAS THROWN AWAY. `LiftChange.decision` carries the line the
          coach wrote about this lift — the only thing a coach-era row has to say, since that mapper
          stamps no from→to figures — and this printed a generic verdict word over it instead. An
          ENGINE row's `decision` is a code, never a sentence, so it is `spoken` that decides.
        */}
        <Text style={styles.rowLine}>
          {change.spoken && change.decision
            ? change.decision
            : structural || !moved
              ? t(`progress.changeWord_${change.kind ?? dir}`)
              : t('progress.changeFromTo', { from, to, unit })}
        </Text>
      </View>
    </View>
  );
}

const HAIRLINE = 'rgba(241,238,229,0.10)';

/**
 * One measured fact: what it is, and the figure.
 *
 * ⚠️ THE LABEL IS SANS AND THE FIGURE IS MONO, which is the app's standing split — a translated
 * phrase cannot go through IBM Plex Mono at all (`monoCarriesNoWords`), and a reading wants the
 * column. `Legend` would uppercase; these are sentence-case labels, so they are plain text.
 */
function KnownRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.knownRow}>
      <Text style={styles.knownLabel}>{label}</Text>
      <Text style={styles.knownValue}>{value}</Text>
    </View>
  );
}

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
  climbWaiting: { fontFamily: font.serif, fontSize: 17, lineHeight: 23, color: color.textMuted, textAlign: 'left' },

  body: { flex: 1, minHeight: 0, paddingHorizontal: 30, paddingTop: 12 },
  measuredRow: { marginHorizontal: 30, marginTop: 18, gap: 4 },
  measuredFig: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  measuredNum: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 30, lineHeight: 34, color: color.textPrimary, textAlign: 'left' },
  measuredUnit: { fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textMuted, textAlign: 'left' },
  measuredFrom: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
  noteRow: { marginHorizontal: 30, marginTop: 16, gap: 4, minHeight: 44, justifyContent: 'center' },
  noteText: { fontFamily: font.serif, fontSize: 19, lineHeight: 25, color: color.textPrimary, textAlign: 'left' },
  noteAdd: { fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textSecondary, textAlign: 'left' },
  noteActions: { marginTop: 18 },

  /* Its own band above the tabs — it is a different KIND of thing from the two stories under it:
     they are what happened, this is what was learned from it. */
  known: { paddingTop: 4, paddingBottom: 22, gap: 10 },
  knownRows: { gap: 0 },
  knownRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241,238,229,0.08)',
  },
  knownLabel: { flex: 1, fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textSecondary, textAlign: 'left' },
  knownValue: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 20,
    lineHeight: 26,
    color: color.textPrimary,
    textAlign: 'right',
  },

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
  tabCount: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 17, paddingVertical: 2, paddingHorizontal: 7, borderRadius: radius.full, overflow: 'hidden', textAlign: 'center' },
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
  rowLine: { fontFamily: font.serif, fontSize: 17, lineHeight: 19, color: color.textSecondary, textAlign: 'left' },

  emptyLine: { paddingTop: 22, fontFamily: font.serif, fontSize: 17, lineHeight: 22, color: color.textMuted, textAlign: 'left' },

  hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(241,238,229,0.08)' },
  hintText: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, textAlign: 'center' },
});
