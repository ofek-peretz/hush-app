/**
 * Weekly Update — the Saturday letter. What Hush CHANGED, and why.
 *
 * ═══ THE SECOND PASS (founder 2026-07-13) ═══
 *
 *  · "Show only the exercises that changed, and why they changed." It used to print the whole week
 *    at its new loads, with the changed lifts highlighted inside it — so the news was buried in a
 *    list of things that were not news. The screen now holds the CHANGES and nothing else; one line
 *    at the end says the rest of the plan stands.
 *  · The WHY was always there (each changed lift unfolds to Observation → Conclusion → Action) and
 *    nothing said so — a bare chevron. Every changed row now carries the word "Why?".
 *  · "If there is no change, do not leave the screen empty — that reads as no progress." A steady
 *    week is the engine being right, so it says so and PROVES it: the lifts that have moved the
 *    furthest since day one, in the athlete's own numbers. Trust me — here is the evidence.
 *  · It opens with their name. This is a letter.
 *
 * v4 rules honoured: read-only (no accept/reject/undo); a load coming down is "matched to
 * demonstrated capability, sets kept" — never a setback, never red; no forecasts or probabilities.
 *
 * Data: getWeeklyPlan() joins the program structure with the engine's per-slot state and the
 * captured weekly change snapshot; the evidence comes from the logged history (domain/progressReport).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Legend } from '@/components/ds';
import { WhyChangedSheet, whyProps } from '@/components/WhyChangedSheet';
import { changedLiftCase } from '@/domain/changedLiftCase';
import { currentLocale } from '@/i18n';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { track } from '@/platform/telemetry';
import { getWeeklyPlan, markWeeklyUpdateSeen, type WeeklyPlanView } from '@/domain/weeklyUpdate';
import { askBackMuscle, trainedMuscles } from '@/engine/v5/bodyMap';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { allTimePeakProgress, standingRecord, type QuarterlyProgressEntry, type StandingRecord } from '@/domain/progressReport';
import { currentWeekOpen } from '@/domain/weekCadence';
import { sessionKcal } from '@/domain/energy';
import { exerciseDisplayName } from '@/data/exercises';
import { bidi } from '@/i18n/bidi';
import type { Session, Units } from '@/data/local/models';
import { color, space, font, textScale, tracking, trackingPx, up, down, signal, radius, directionTone, type LoadDirection } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'WeeklyUpdate'>;

// Loads arrive in kg from the engine snapshot; render in the athlete's display units
// (the rest of the app never shows a unit the athlete didn't choose).
const fmtLoad = (n: number | null, units: Units): string =>
  n == null ? 'BW' : String(+((displayWeight(n, units) ?? 0).toFixed(2)));
const rangeStr = (r: [number, number]): string => `${r[0]}-${r[1]}`;

// The letter's fact band (v7 3.1): "4/4 WORKOUTS · 46.8 t MOVED · 3,120 KCAL". Computed as display
// arithmetic on the logged week, never through the engine — the mirror reports what happened, and a
// wall-clock duration (first set-start → last set persisted) is the honest input the kcal MET estimate
// already runs on elsewhere.
type WeekBand = { done: number; planned: number; tonnes: number; kcal: number | null };
const sessionDurationMs = (s: Session): number => {
  const start = new Date(s.startedAt).getTime();
  let end = start;
  for (const set of s.sets ?? []) {
    if (set.persistedAt) end = Math.max(end, new Date(set.persistedAt).getTime());
  }
  return Math.max(0, end - start);
};

/** A `muscle.*` word at the head of a sentence. See the note at its call site. */
const headlineCase = (s: string) => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s);

export function WeeklyUpdate({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const name = app.profile?.name;
  const units = app.profile?.units ?? 'kg';
  const [view, setView] = useState<WeeklyPlanView | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  /** The letter shows the four biggest moves; this is the athlete asking for the rest. */
  const [showAll, setShowAll] = useState(false);
  /**
   * Her completed sessions — the evidence a WHY pill needs to draw a lift's full case (2.1b).
   * The letter already reads history for the steady week's proof; this is the same read.
   */
  const [history, setHistory] = useState<Session[]>([]);
  /** The harness's own sessions, when it brought some — see `previewPlan` in navigation.ts. */
  const previewHistory = route?.params?.previewPlan?.history;
  useEffect(() => {
    if (previewHistory) {
      setHistory(previewHistory);
      return;
    }
    let alive = true;
    void db.loadHistory().then((h) => {
      if (alive) setHistory(h);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [previewHistory]);
  /** The lift whose case is open, if any — keyed by the row, not the slot, so a volume row
   *  (which has no case) can share the same open-state. */
  const openCase = React.useMemo(() => {
    if (!openId) return null;
    const lift = (view?.workouts ?? []).flatMap((w) => w.lifts).find((l) => l.change?.snapshot.slotId === openId);
    return lift ? changedLiftCase(lift, history, units) : null;
  }, [openId, view, history, units]);
  const [loaded, setLoaded] = useState(false);

  /**
   * THE SCREEN THE SATURDAY NOTE OPENS — AND IT MUST NOT SHOW LAST WEEK (founder 2026-07-13).
   *
   * The roll is LAZY: nothing happens at 20:30 on a phone in a pocket. The bucket regenerates on
   * `refreshProgram`, and the engine folds the week inside `sessionTargets` — both of which run on
   * HOME's focus effects. But the note deep-links straight here, and this screen used to read the
   * engine's record the instant it mounted, racing Home's effects behind it. The athlete would tap
   * "I've updated your program", land on this screen, and read LAST week's update — the one moment
   * in the product where being wrong is unforgivable, because it is the moment the product is
   * claiming to have done the work.
   *
   * So the screen no longer races: it PERFORMS the roll it is here to report, and only then reads.
   * Both calls are idempotent (a bucket already rolled returns immediately; `maybeAdvance` coalesces
   * an in-flight advance and folds nothing twice), so arriving from Home — where the effects have
   * already run — costs a no-op.
   */
  useEffect(() => {
    // The harness has handed us the week the engine would have decided (see `previewPlan` in
    // navigation.ts). Nothing is rolled, folded or read; everything below this line is the screen
    // doing its own job on real data.
    const preview = route?.params?.previewPlan;
    if (preview) {
      setView(preview.plan);
      setBand(preview.band);
      setLoaded(true);
      return;
    }
    let active = true;
    void (async () => {
      // 1 · the calendar roll (a new bucket, if Saturday 20:30 has passed since the last one)
      await app.refreshProgram().catch(() => {});
      // The store's `app.program` in this closure is the PRE-roll one; read the bucket that now
      // exists on disk, or fall back to what we were rendered with.
      const program = (await db.loadProgram().catch(() => null)) ?? app.program;
      if (!active) return;
      if (!program) {
        setLoaded(true);
        return;
      }
      // 2 · the engine's weekly fold (raises, match-downs, swaps) — it runs inside sessionTargets,
      //     which is where the record this screen renders is actually written.
      try {
        const day = program.days.find((d) => !d.isRest);
        if (day) {
          await app.model.sessionTargets({ programDayId: day.id, completedSessions: app.modeState.completedSessions });
        }
      } catch {
        /* the engine could not advance — render whatever record exists rather than nothing */
      }
      // 3 · …and only now, read it.
      const v = await getWeeklyPlan(program);
      if (!active) return;
      setView(v);
      setLoaded(true);
      void track('weekly_update_viewed', { weekIndex: v?.weekIndex ?? null, changes: v?.changedCount ?? 0 });
      if (v && !v.seen) void markWeeklyUpdateSeen();
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    void track('weekly_update_dismissed', { changes: view?.changedCount ?? 0 });
    navigation.goBack();
  }

  /**
   * THE EVIDENCE (founder 2026-07-13) — for the week where Hush changed nothing. An empty screen on
   * the day the product is supposed to prove it is working reads as "nothing is happening", which is
   * the opposite of the truth: a steady week means the plan is already right. So the screen fills
   * with the athlete's own history — the lifts that have travelled furthest since Hush met them.
   * Loaded only when there is nothing to report (the common case still costs no disk read).
   *
   * …and with THE STANDING RECORD beside them (founder 2026-07-28: "0 changes reads robotic —
   * use that moment to show what the whole use of the app has come to"). The travelled lifts prove
   * the engine works; the standing totals prove the WEEKS have added up. Same three facts as the
   * week's own band directly above, at the scale of everything she has ever logged — the contrast
   * is the point, and every figure is read off her own sets.
   */
  const [evidence, setEvidence] = useState<QuarterlyProgressEntry[] | null>(null);
  const [standing, setStanding] = useState<StandingRecord | null>(null);
  const steady = loaded && (view?.changedCount ?? 0) === 0;
  useEffect(() => {
    if (!steady) return;
    let active = true;
    void Promise.resolve(previewHistory ?? db.loadHistory())
      .then((h: Session[]) => {
        if (!active) return;
        const top = allTimePeakProgress(h, Date.now())
          .filter((e) => e.deltaKg > 0)
          .sort((a, b) => b.deltaKg - a.deltaKg)
          .slice(0, 3);
        setEvidence(top);
        setStanding(standingRecord(h));
      })
      .catch(() => active && setEvidence([]));
    return () => {
      active = false;
    };
  }, [steady, previewHistory]);

  /**
   * S-56 — THE ONE QUESTION THE MIRROR MAY ASK. "A muscle is switched off after she has trained it.
   * Once — and once only — Hush comes back: 'Legs have been off a while. Want them back?' One tap;
   * if she says no, it is never raised again (L4)… asked once, at the Saturday mirror, and never
   * counted in days." The candidate is a FACT (off on the map + a logged set exists + never asked);
   * either answer marks it asked forever. The map editor itself obeys an OFF in silence (L8).
   */
  const [askBack, setAskBack] = useState<string | null>(route?.params?.previewAskBack ?? null);
  useEffect(() => {
    if (route?.params?.previewAskBack) return; // the harness is holding the question open
    let active = true;
    void (async () => {
      try {
        const [history, prefs] = await Promise.all([db.loadHistory(), db.loadPreferences()]);
        if (!active) return;
        setAskBack(
          askBackMuscle(app.profile?.bodyMap, trainedMuscles(history), new Set(prefs.askedBackMuscles ?? [])),
        );
      } catch {
        /* no storage, no question — silence is the safe failure (L8) */
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Answering — either way — retires the question for this muscle forever (L4). */
  async function answerAskBack(bringBack: boolean) {
    const m = askBack;
    if (!m) return;
    setAskBack(null);
    void track('askback_answered', { muscle: m, bringBack });
    try {
      const prefs = await db.loadPreferences();
      const asked = new Set(prefs.askedBackMuscles ?? []);
      asked.add(m);
      await db.savePreferences({ ...prefs, askedBackMuscles: [...asked] });
    } catch {
      /* worst case the question is seen again next Saturday — never blocks the answer itself */
    }
    if (bringBack) {
      // Back to `normal`; the muscle RESUMES with all its exercises' history (S-44 — v5 keys
      // progression to the exercise, so nothing was ever reset). The store rebuilds the week.
      const map = { ...(app.profile?.bodyMap ?? {}), [m]: 'normal' as const };
      await app.updateProfileInfo({ bodyMap: map }).catch(() => {});
    }
  }

  /**
   * THE WEEK'S FACTS (v7 3.1). The mirror opens with the numbers the week actually earned — workouts
   * done of planned, tonnage moved, calories — a border-bound band under "Week six.". Display-only:
   * computed from the logged history and the on-disk program, never from an engine type.
   */
  const [band, setBand] = useState<WeekBand | null>(null);
  useEffect(() => {
    if (route?.params?.previewPlan) return; // the harness supplied the band with the week
    let active = true;
    void (async () => {
      try {
        const [history, program] = await Promise.all([
          db.loadHistory(),
          db.loadProgram().catch(() => app.program),
        ]);
        if (!active) return;
        const weekEnd = currentWeekOpen(Date.now());
        const weekStart = weekEnd - 7 * 24 * 60 * 60 * 1000;
        const inWeek = (history ?? []).filter((s) => {
          const at = new Date(s.startedAt).getTime();
          return at >= weekStart && at < weekEnd;
        });
        // "N/M workouts" counts whole workouts trained (the workout-count rule: trained !== false).
        const done = inWeek.filter((s) => s.trained !== false).length;
        const planned = program ? program.days.filter((d) => !d.isRest).length : 0;
        let kg = 0;
        let kcal = 0;
        let kcalSeen = false;
        for (const s of inWeek) {
          for (const set of s.sets ?? []) kg += (set.actualWeight ?? 0) * set.actualReps;
          const k = sessionKcal(s, sessionDurationMs(s), app.profile?.weightKg);
          if (k != null) {
            kcal += k;
            kcalSeen = true;
          }
        }
        setBand({ done, planned, tonnes: +(kg / 1000).toFixed(1), kcal: kcalSeen ? kcal : null });
      } catch {
        if (active) setBand(null);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changedCount = view?.changedCount ?? 0;
  const whenLabel = view
    ? `${new Date(view.at).toLocaleDateString(undefined, { weekday: 'long' })} · ${new Date(view.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`
    : '';

  /**
   * THE FOUR THAT MATTER MOST (v7 3.1).
   *
   * A week can carry twelve changes. Printing all of them turns a letter into a spreadsheet, and
   * the athlete stops reading at four anyway. So the letter states the COUNT and then shows the
   * four largest moves; everything else is one press away. Ordered by how far the load actually
   * travelled — the biggest decision is the one worth reading first.
   */
  const allChanges = React.useMemo(() => {
    const lifts = (view?.workouts ?? []).flatMap((w) => w.lifts.filter((l) => l.change));
    const rows: LetterRow[] = lifts.map((l) => {
      const c = l.change!.snapshot;
      return {
        key: c.slotId,
        name: exerciseDisplayName(l.exerciseId),
        from: fmtLoad(c.loadFrom, units) ?? '',
        to: fmtLoad(c.loadTo, units) ?? '',
        suffix: '',
        /**
         * THE SAME THREE-WAY ANSWER TODAY GIVES (founder 2026-07-29's law).
         *
         * This was a BOOLEAN — `rose`, i.e. "up or not-up" — and not-up was drawn as a fall. So the
         * one narrated HOLD the engine makes (S-28, the rung out of reach, stamped with equal
         * from/to loads) came out BLUE in the letter and CREAM on Today, for the same decision, on
         * the same day. A two-way answer cannot carry a three-way law.
         */
        dir: liftDirection(c.loadFrom, c.loadTo),
        magnitude: Math.abs((c.loadTo ?? 0) - (c.loadFrom ?? 0)),
        slotId: c.slotId,
        line: null,
      };
    });
    // A volume move is news of the same kind and reads as one more row — "Chest, volume  3 → 4 sets".
    for (const v of view?.volume ?? []) {
      rows.push({
        key: `vol:${v.muscle}`,
        name: t('weekly.volumeRowName', { muscle: t(`muscle.${v.muscle}`) }),
        from: String(v.setsFrom),
        to: String(v.setsTo),
        suffix: t('weekly.setsUnit'),
        dir: v.setsTo > v.setsFrom ? 'up' : ('down' as LoadDirection),
        magnitude: Math.abs(v.setsTo - v.setsFrom),
        slotId: null,
        // The muscle is stamped raw by the engine (it is pure); the letter says it in her
        // language, exactly as the row's own name does above.
        line: t(v.explanation.text.key, { ...(v.explanation.text.params ?? {}), muscle: t(`muscle.${v.muscle}`) }),
      });
    }
    return rows.sort((a, b) => b.magnitude - a.magnitude);
  }, [view, units, t]);
  const shown = showAll ? allChanges : allChanges.slice(0, LETTER_ROWS);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* The date, centred, with the way out on the end edge — a 36px disc, the same chrome shape
          the training stage uses. */}
      <View style={styles.header}>
        <View style={styles.headSpacer} />
        <Legend size={11.5} align="center" style={styles.when}>{whenLabel}</Legend>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={close}
          hitSlop={8}
          style={({ pressed }) => [styles.closeDisc, pressed && styles.pressedDim]}
        >
          <Icon name="close" size={18} color={color.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headBlock}>
          <Legend size={11} track={0.22}>
            {askBack ? t('weekly.askLegend') : steady ? t('weekly.evidenceLegend') : t('weekly.eyebrow')}
          </Legend>
          {/* A week with a question in it steps its headline DOWN (40, not 56): the biggest thing
              on the page has to be the question, and two things cannot both be biggest. */}
          <Text style={[styles.title, askBack && styles.titleAsking]} accessibilityRole="header">
            {view ? t('weekly.weekTitle', { n: view.weekIndex + 1 }) : t('weekly.title')}
          </Text>
        </View>

        {/* THE WEEK'S FACTS — workouts / tonnage / kcal, ruled above and below. */}
        {!askBack && band && (band.planned > 0 || band.done > 0) ? (
          <View style={styles.statBand}>
            <LetterFact value={`${band.done}/${band.planned}`} label={t('weekly.statWorkouts')} />
            <LetterFact value={`${band.tonnes} ${t('weekly.tonneUnit')}`} label={t('weekly.statMoved')} />
            {band.kcal != null ? <LetterFact value={band.kcal.toLocaleString()} label={t('weekly.statKcal')} /> : null}
          </View>
        ) : null}

        {/* The one sentence that frames what follows. With a question up, it frames the QUESTION —
            and it promises, before she reads it, that this is the only time she will see it.

            IT SAYS NOTHING UNTIL THE LETTER HAS READ. `changedCount` falls back to 0 while the roll
            and the fold are still running, and this line printed that fallback as a fact: "I read
            last week's sessions and changed 0 lifts. Tap any of them to see why" — a count Hush had
            not counted, a claim to have read what it had not read, and an instruction to tap rows
            that were not there. A letter that fails to load then keeps that sentence forever. The
            genuinely steady week never reaches it: `steady` is a LOADED zero, and it has the
            evidence page. */}
        {askBack || loaded ? (
          <Text style={[styles.intro, askBack && styles.introAsking]}>
            {askBack
              ? t('weekly.askIntro')
              : steady
                ? t('weekly.evidenceIntro')
                : allChanges.length > LETTER_ROWS
                  ? t('weekly.introTop', { count: allChanges.length, shown: LETTER_ROWS })
                  : t('weekly.intro', { count: changedCount })}
          </Text>
        ) : null}

        {/* ── S-56 · the one question the mirror may ask (asked once per muscle, ever) ── */}
        {askBack ? (
          <>
            {/* THE ONE QUESTION (v7 3.1b). It gets a moss rim and a moss wash — the only card in
                the product drawn in the accent — because it is the only place the engine ever asks
                the athlete for anything, and it will not ask again. */}
            <View style={styles.askCard}>
              <View style={styles.askHead}>
                <View style={styles.askDot} />
                <Legend size={10.5} tone="accent">{t('weekly.askSince')}</Legend>
              </View>
              <Text style={styles.askTitle} accessibilityRole="header">
                {/* `muscle.*` is written for mid-sentence (English keeps it singular and
                    lowercase), and this is the sentence's FIRST word — so it takes headline case.
                    A no-op in a script without case. */}
                {t('weekly.askBackTitle', { muscle: headlineCase(t(`muscle.${askBack}`)) })}
              </Text>
              <Text style={styles.askBody}>{t('weekly.askBackBody')}</Text>
              {/* Stacked, full width, and the moss one first: bringing a muscle back is the answer
                  that costs her nothing, and the one the card exists to make easy. */}
              <View style={styles.askActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('weekly.askBackYes')}
                  onPress={() => void answerAskBack(true)}
                  style={({ pressed }) => [styles.askYes, pressed && styles.pressedDim]}
                >
                  <Text style={styles.askYesLabel}>{t('weekly.askBackYes')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('weekly.askBackNo')}
                  onPress={() => void answerAskBack(false)}
                  style={({ pressed }) => [styles.askNo, pressed && styles.pressedDim]}
                >
                  <Text style={styles.askNoLabel}>{t('weekly.askBackNo')}</Text>
                </Pressable>
              </View>
            </View>
            {/* The law, said out loud: it never holds up her week, and it is never asked twice. */}
            <Text style={styles.askNote}>{t('weekly.askNote')}</Text>
          </>
        ) : null}

        {/* THE CHANGES — one flat ruled list, largest move first.
            Not grouped by workout any more: the athlete is reading what CHANGED, and which day it
            falls on is not what makes a change worth reading. Each row's WHY opens the reason
            sheet — the same one a changed lift opens from Today, so the product explains itself in
            one voice from both doors. */}
        {!steady && !askBack
          ? shown.map((row, i) => {
              const open = openId === (row.slotId ?? row.key);
              return (
                <View key={row.key} style={[styles.row, i === shown.length - 1 && styles.rowLast]}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName} numberOfLines={1}>{bidi(row.name)}</Text>
                    <View style={styles.rowRight}>
                      <Text style={styles.rowMove} numberOfLines={1}>
                        <Text style={styles.rowFrom}>{`${row.from} `}</Text>
                        <Text style={{ color: directionTone(row.dir) }}>
                          {`→ ${row.to}${row.suffix ? ` ${row.suffix}` : ''}`}
                        </Text>
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('weekly.whyLink')}
                        onPress={() => setOpenId((cur) => (cur === (row.slotId ?? row.key) ? null : (row.slotId ?? row.key)))}
                        hitSlop={6}
                        style={({ pressed }) => [styles.whyPill, pressed && styles.pressedDim]}
                      >
                        <Legend size={10.5} track={0.08} tone="onStage">{t('weekly.whyWord')}</Legend>
                      </Pressable>
                    </View>
                  </View>
                  {open && row.line ? <Text style={styles.rowLine}>{row.line}</Text> : null}
                </View>
              );
            })
          : null}

        {/* ── the steady week: what the weeks have added up to (see the header) ──
            It sits above the travelled lifts because it is the wider fact: the lifts say the engine
            is working, these say she has been. Drawn only once there is a workout to count — a
            band of three zeroes on her first Saturday would be the emptiness this exists to fix. */}
        {steady && standing && standing.workouts > 0 ? (
          <View style={styles.standing}>
            <Legend size={10.5} track={0.2}>{t('weekly.standingLegend')}</Legend>
            <View style={styles.statBand}>
              <LetterFact value={String(standing.workouts)} label={t('weekly.statWorkouts')} />
              <LetterFact value={`${standing.tonnes} ${t('weekly.tonneUnit')}`} label={t('weekly.statMoved')} />
              <LetterFact value={String(standing.sets)} label={t('weekly.statSets')} />
            </View>
          </View>
        ) : null}

        {/* ── the steady week: the proof (see the header) ── */}
        {steady && evidence ? (
          evidence.length > 0 ? (
            <View style={styles.evidence}>
              {evidence.map((e) => {
                const reps = e.mode === 'reps';
                // Reps are a count; a load goes through the athlete's units and the same trim every
                // other figure on this screen uses (62.50 → 62.5, never 62.50).
                const from = reps ? e.initialPeakKg : fmtLoad(e.initialPeakKg, units);
                const to = reps ? e.periodPeakKg : fmtLoad(e.periodPeakKg, units);
                return (
                  <View key={e.exerciseId} style={styles.evidenceRow}>
                    <Text style={styles.evidenceName} numberOfLines={1}>
                      {bidi(exerciseDisplayName(e.exerciseId))}
                    </Text>
                    {/* The figures are MEASURED (mono, which has no Hebrew — so it may carry no
                        words); the unit standing beside them is SPOKEN, and sits in its own Text. */}
                    <View style={styles.evidenceMoveRow}>
                      <Text style={styles.evidenceMove}>{`${from} → ${to}`}</Text>
                      <Text style={styles.evidenceUnit}>{reps ? t('weekly.repsUnit') : unitLabel(units)}</Text>
                    </View>
                  </View>
                );
              })}
              <Text style={styles.evidenceClose}>{t('weekly.evidenceClose')}</Text>
            </View>
          ) : (
            // Too early to have proof of anything — so we claim none.
            <Text style={styles.evidenceClose}>{t('weekly.evidenceEmpty')}</Text>
          )
        ) : null}
      </ScrollView>

      {/* THE CASE — the same sheet a changed lift opens from Today, reached from the letter's own
          WHY. One argument, one drawing, whichever door the athlete came through. */}
      {openCase ? (
        <View style={StyleSheet.absoluteFill}>
          <WhyChangedSheet {...whyProps(openCase, t, currentLocale())} onClose={() => setOpenId(null)} />
        </View>
      ) : null}

      {/* The rest of the changes are one press away, and then the letter closes in the coach's own
          hand. No "Done": the × at the top is the way out, and a letter does not need a button to
          say it is finished. */}
      <View style={styles.footer}>
        {!steady && !askBack && !showAll && allChanges.length > LETTER_ROWS ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('weekly.viewAll', { count: allChanges.length })}
            onPress={() => setShowAll(true)}
            style={({ pressed }) => [styles.viewAll, pressed && styles.pressedDim]}
          >
            <Text style={styles.viewAllLabel}>{t('weekly.viewAll', { count: allChanges.length })}</Text>
          </Pressable>
        ) : null}
        {loaded ? <Text style={styles.signature}>{t('weekly.signature')}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

/**
 * A load move's direction, from the stamped snapshot alone — the SAME derivation Home uses, so the
 * two doors into a decision can never disagree about which way it went. A structural change has no
 * load it came from: that is a new lift arriving, and it lights like one.
 */
function liftDirection(from: number | null, to: number | null): LoadDirection {
  if (from == null || to == null) return 'up';
  return to < from ? 'down' : to > from ? 'up' : 'hold';
}

/** How many changes the letter shows before it offers the rest. */
const LETTER_ROWS = 4;

/** One row of the letter: a lift (or a muscle's volume) and the move the engine made. */
interface LetterRow {
  key: string;
  name: string;
  from: string;
  to: string;
  /** "sets" on a volume row; empty on a load row, where the unit is implied by the column. */
  suffix: string;
  /** Which way it moved — the app-wide three, never a boolean (see `allChanges`). */
  dir: LoadDirection;
  magnitude: number;
  /** The slot whose reason sheet the WHY pill opens. Null on a volume row — a muscle is not a slot. */
  slotId: string | null;
  /**
   * A volume move's reason, already spoken. It has no case to open — there is no band and no pair
   * of sessions behind "chest earned a set", only the sentence — so its WHY unfolds in place.
   */
  line: string | null;
}

/** One fact of the week's band — the figure in mono over its mono legend. */
function LetterFact({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factValue}>{value}</Text>
      <Legend size={10} track={0.14}>{label}</Legend>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  // v7 3.1: the date centred between a spacer and a 36px close disc — the same chrome shape
  // the training stage uses, so a way out looks the same everywhere.
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 26, paddingTop: 18 },
  closeDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.fillSubtleStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressedDim: { opacity: 0.62 },
  headSpacer: { width: 36 },
  when: { flex: 1 },

  // The letter's own gutter is 34 — wider than the app's, because prose wants a narrower column.
  scroll: { flexGrow: 1, paddingHorizontal: 34, paddingTop: 20, paddingBottom: 20 },
  headBlock: { gap: 2 },
  eyebrow: { marginTop: 12, marginBottom: 10 },
  vocative: { fontFamily: font.sans, fontSize: textScale.lg, color: color.textSecondary, textAlign: 'left', marginBottom: 2 },
  // v7 (2026-07-22): the letter's headline is the COACH's voice — the serif ("Week six."), not UI
  // chrome. It opens the mirror, so it carries the size of a statement.
  // "Week six." — 56px, the largest headline in the product. A letter opens by naming itself.
  title: { fontFamily: font.serif, fontSize: 56, lineHeight: 59, color: color.textPrimary, textAlign: 'left' },
  titleAsking: { fontSize: 40, lineHeight: 42 }, // rtl-ok: merged onto title, which sets textAlign
  // The framing sentence is the COACH speaking, so it is the serif — not UI sans.
  intro: { marginTop: 16, fontFamily: font.serif, fontSize: 17, lineHeight: 26, color: color.textPrimary, textAlign: 'left' },
  introAsking: { marginTop: 14, fontSize: 16, lineHeight: 24, color: color.textSecondary }, // rtl-ok: merged onto intro

  // The week's facts (v7 3.1) — three mono figures bound top and bottom by a hairline, sitting
  // directly beneath the headline before the letter's prose begins.
  statBand: {
    flexDirection: 'row',
    gap: 26,
    marginTop: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,229,0.14)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241,238,229,0.14)',
  },

  // …and the same band again at the scale of everything she has logged, on a steady week. Its own
  // legend, because two identical bands with nothing to tell them apart would read as a repeat.
  standing: { marginTop: 26, gap: 2 },

  lift: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.border },
  liftTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  liftName: { flex: 1, fontFamily: font.sans, fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  liftNameStrong: { fontFamily: font.sansSemibold, textAlign: 'left' },
  liftSecond: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6 },

  sub: { fontFamily: font.mono, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
  subFrom: { color: color.textTertiary },
  subArrow: { color: color.textTertiary },
  subStrong: { fontFamily: font.monoSemibold, color: color.textPrimary, textAlign: 'left' },
  subDot: { color: color.textTertiary },
  newExercise: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textTertiary, textAlign: 'left' },

  loadCluster: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadLine: { fontFamily: font.mono, fontSize: textScale.md, color: color.textMuted, textAlign: 'left' },
  loadFrom: { fontFamily: font.mono, fontSize: textScale.sm, color: color.textTertiary, textAlign: 'left' },
  arrow: { color: color.textTertiary, fontSize: textScale.sm },
  loadTo: { fontFamily: font.monoSemibold, fontSize: textScale.lg, textAlign: 'left' },
  loadPlain: { fontFamily: font.mono, fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  loadSwap: { fontFamily: font.monoSemibold, fontSize: textScale.lg, color: color.textPrimary, textAlign: 'left' },
  kg: { fontFamily: font.mono, fontSize: textScale.xs, color: color.textMuted, textAlign: 'left' },

  swapBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.full, backgroundColor: color.fillSubtle },
  swapBadgeText: { fontFamily: font.sansSemibold, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), color: color.accentText, textAlign: 'left' },

  whyRow: { marginTop: 8 },
  whyLink: { fontFamily: font.sansSemibold, fontSize: textScale.sm, color: color.accentText, textAlign: 'left' },
  whyWrap: { marginTop: 14, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 18, backgroundColor: color.surface3, borderRadius: radius.lg },

  // the rest of the plan stands — said once, at the end
  /* ── The changes: one ruled list, largest move first. ── */
  row: {
    paddingVertical: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,229,0.14)',
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  // A volume move's reason, unfolded in place — one sentence, in the coach's voice.
  rowLine: { fontFamily: font.serif, fontStyle: 'italic', fontSize: 15, lineHeight: 21, color: color.textSecondary, textAlign: 'left' },
  rowLast: { borderBottomWidth: 1, borderBottomColor: 'rgba(241,238,229,0.14)' },
  rowName: { flexShrink: 1, fontFamily: font.sansMedium, fontSize: 16, color: color.textPrimary, textAlign: 'left' },
  rowRight: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowMove: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 15, textAlign: 'right' },
  // Where it came FROM rests in shadow; where it went stands in the accent — and a load coming
  // DOWN is drawn in exactly the same moss as one going up. It is the engine matching what she
  // demonstrated, not a setback, and the letter never colours it like one.
  rowFrom: { color: color.textSecondary }, // rtl-ok: nested in rowMove

  // WHY is a door, so it is drawn as one — a hairline pill, not an underlined word.
  whyPill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(241,238,229,0.16)' },
  /* ── The week's facts. ── */
  fact: { gap: 2 },
  factValue: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 22, color: color.textPrimary, textAlign: 'left' },
  /* ── The rest of the changes, then the hand. ── */
  viewAll: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.3)',
  },
  viewAllLabel: { fontFamily: font.sansSemibold, fontSize: 14.5, color: color.textPrimary, textAlign: 'center' },

  // Loop 3 — a volume move is a muscle's news, so it gets a muscle row, not a fake lift row.

  // S-56 — the one question the mirror may ask. A quiet card, not a modal: the letter is hers to
  // read, and the question waits inside it rather than standing in front of it (L9).
  /* ── 3.1b · THE ONE QUESTION ── */
  askCard: {
    marginTop: 26,
    paddingVertical: 24,
    paddingHorizontal: 22,
    gap: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(169,196,159,0.28)',
    backgroundColor: 'rgba(169,196,159,0.06)',
  },
  askHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  askDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: signal[0] },
  // The question is the coach speaking, so it is the serif — and it is the biggest thing here.
  askTitle: { fontFamily: font.serif, fontSize: 27, lineHeight: 31, color: color.textPrimary, textAlign: 'left' },
  askBody: { fontFamily: font.sans, fontSize: 14.5, lineHeight: 22, color: color.textSecondary, textAlign: 'left' },
  askActions: { gap: 10, marginTop: 4 },
  // The one MOSS-FILLED button in the product: this is the answer that gives something back.
  askYes: { height: 52, borderRadius: 15, backgroundColor: signal[0], alignItems: 'center', justifyContent: 'center' },
  askYesLabel: { fontFamily: font.sansSemibold, fontSize: 15, color: '#141310', textAlign: 'center' },
  askNo: { height: 52, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(241,238,229,0.24)', alignItems: 'center', justifyContent: 'center' },
  askNoLabel: { fontFamily: font.sansSemibold, fontSize: 15, color: color.textPrimary, textAlign: 'center' },
  askNote: { marginTop: 18, fontFamily: font.sans, fontSize: 15, lineHeight: 18, color: color.textMuted, textAlign: 'left' },

  // the steady week: the athlete's own history, as proof
  evidence: { marginTop: 24 },
  evidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  evidenceName: { flex: 1, fontFamily: font.sansSemibold, fontSize: textScale.md, color: color.textPrimary, textAlign: 'left' },
  // A measurement, in the measuring voice — and it is a RISE, so it is sage.
  evidenceMove: { fontFamily: font.monoSemibold, fontVariant: ['tabular-nums'], fontSize: textScale.md, color: up.stage, textAlign: 'left' },
  evidenceMoveRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  evidenceUnit: { fontFamily: font.sans, fontSize: textScale.xs, color: color.textMuted, textAlign: 'left' },
  evidenceClose: { marginTop: 22, fontFamily: font.sans, fontSize: textScale.md, lineHeight: 25, color: color.textSecondary, textAlign: 'left' },

  // The coach's hand — the serif, closing the letter. Quiet, set apart from the last line above it.
  signature: { fontFamily: font.serif, fontSize: 21, color: color.textPrimary, textAlign: 'left' },

  // No rule above it and no filled button in it: the letter ends, it does not get dismissed.
  footer: { paddingHorizontal: 34, paddingBottom: 36, gap: 14 },
});
