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

// 

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Arrive, Legend } from '@/components/ds';
import { WhyChangedSheet, whyProps } from '@/components/WhyChangedSheet';
import { changedLiftCase } from '@/domain/changedLiftCase';
import { currentLocale } from '@/i18n';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
// ⛔ ONE DOOR ONTO HER WEEK, whoever wrote it — the coach's plan when there is one, the engine's
// programme in the same shape when there is not. See `data/local/weekPlan`.
import { loadWeekPlan } from '@/data/local/weekPlan';
import { coachBrief } from '@/domain/coachEarned';
import { coachChanges } from '@/domain/coachWeek';
import type { CoachPlan } from '@/domain/coachPlan';
import type { CoachDecision } from '@/domain/coachLog';
import { track } from '@/platform/telemetry';
import type { WeeklyPlanView } from '@/engine/weeklyView';
import { MiniBody } from '@/components/MiniBody';
import { MilestoneEmblem } from '@/components/MilestoneEmblem';
import { earnedMilestones } from '@/domain/milestones';
import { milestoneCopy } from '@/domain/milestoneCopy';
import { weekCardFromHistory, type ShareWeekCard as ShareWeekCardT } from '@/domain/shareCard';
import { tg } from '@/i18n';
import { muscleOf } from '@/data/exercises';
import { getWeeklyPlan, markWeeklyUpdateSeen } from '@/domain/weeklyUpdate';
import { askBackMuscle, trainedMuscles } from '@/engine/v5/bodyMap';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { allTimePeakProgress, standingRecord, type QuarterlyProgressEntry, type StandingRecord } from '@/domain/progressReport';
import { currentWeekOpen } from '@/domain/weekCadence';
import { completedWorkouts, sessionEnergyKcal, tonnesFromKg, totalTonnageKg } from '@/domain/sessionMetrics';
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
// arithmetic on the logged week, never through the engine — the mirror reports what happened.
//
// ⛔ THE BAND USED TO WORK ALL THREE FIGURES OUT ITSELF, and its duration read only `sets`, so an
// interval week's calories came out at zero in a letter whose whole job is to say what the week was.
// Workouts, tonnage and calories all come from `domain/sessionMetrics` now — the same three
// functions Progress, the Log and the share card read.
type WeekBand = { done: number; planned: number; tonnes: number; kcal: number | null };

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
      /*
       * ⛔ THIS USED TO DRIVE THE ENGINE BEFORE READING IT.
       *
       * Three steps: roll the week, force the fold by asking `sessionTargets` for any day, then
       * read the record it had just written. All three are gone — nothing composes a week and
       * nothing folds between sessions, so there is nothing to provoke and nothing to wait for.
       *
       * The roll survives because the ANCHOR still turns (which decisions belong to this week, when
       * the push fires, when Recovery gives way). It just no longer produces a programme.
       */
      await app.refreshProgram().catch(() => {});
      /*
       * ⚠️ `loaded` FLIPS ONLY ONCE THE COACH'S LOG IS IN HAND, and that ordering is the law here
       * (founder 2026-07-28). `changedCount` falls back to 0 while the read is out, so flipping it
       * early prints "I read last week's sessions and changed 0 lifts" — a count nobody counted, a
       * claim to have read what has not been read, and an instruction to tap rows that do not
       * exist. A letter whose read FAILS keeps that sentence for ever.
       */
      /*
       * ════ ⛔ THE LETTER FINALLY READS THE THING THAT MAKES THE DECISIONS (2026-08-19) ════
       *
       * `view` — the engine's week — was declared, typed, threaded into `allChanges`, into
       * `openCase`, into the "Why?" rows, into `close()`'s telemetry … and set from exactly one
       * place: the dev gallery's preview branch, twenty lines above. On a real phone it was null
       * for ever.
       *
       * ⚠️ AND THIS FILE ALREADY WROTE THE CONSEQUENCE DOWN, at `changedCount`: *"a week with
       * eleven moved lifts rendered as a steady week … the screen prints 'I changed nothing this
       * week' over a `view` holding every change it just made."* The note was right about the
       * mechanism and wrong about one word: the `view` was not holding the changes, because nobody
       * ever fetched it. Every Saturday since the coach was taken out on 2026-08-12, every athlete
       * has been told the engine changed nothing — while `getWeeklyPlanV5` stamped, narrated and
       * unit-tested every load move, graduation, rotation and volume shift it made.
       *
       * The programme comes off disk rather than from `app.program`, which is null after any cold
       * start; the letter is the one screen that must never render an empty week because a store
       * had not caught up.
       */
      const [log, program] = await Promise.all([
        db.loadCoachLog().catch(() => null),
        db.loadProgram().catch(() => null),
      ]);
      if (!active) return;
      setCoachLog(log ?? []);
      const engineWeek = program ? await getWeeklyPlan(program).catch(() => null) : null;
      if (!active) return;
      if (engineWeek) setView(engineWeek);
      /*
       * ⚠️ `loaded` FLIPS ONCE, AFTER BOTH READS. It used to flip on the coach log alone while
       * `changedCount` came from a different effect — so whichever read won the race decided
       * whether she was shown the steady-week page. When the log won, the letter said *"I changed
       * nothing"* over a week that had changed things, then swapped to the list underneath her.
       */
      setLoaded(true);
      void track('weekly_update_viewed', { weekIndex: null, changes: coachBrief(log, app.weekOpenMs)?.count ?? 0 });
      /*
       * SEEN, as an instant rather than a flag. The pill on Today compares it against the newest
       * decision — one number, one comparison, and no second piece of state that can disagree with
       * the log about whether there is news.
       */
      void db.saveCoachLetterSeen(Date.now());
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    void track('weekly_update_dismissed', { changes: view?.changedCount ?? 0 });
    /*
     * ⛔ AND THE WEEK IS MARKED READ. `markWeeklyUpdateSeen` had no production caller either, so
     * the engine's `seenWeekEnd` never moved and nothing downstream could tell a letter she had
     * read from one she had not. Dismissing is the act that means "read"; it is stamped here.
     */
    void markWeeklyUpdateSeen().catch(() => {});
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
  /*
   * ⛔ "1 CHANGE" ON TODAY, "NOTHING CHANGED" IN HERE — founder, 2026-08-03:
   *
   *   > *"It also shows one change in green, but when I tap it, it says nothing changed."*
   *
   * Two screens counting two different things. Today's pill counts the COACH's decisions
   * (`coachBrief` over the coach log). `steady` counted `view.changedCount`, which is the old
   * engine's tally of lifts whose LOAD moved, derived from history. A coach that holds a lift and
   * writes the reason is exactly one change by the first measure and zero by the second — so the
   * pill lit, she tapped it, and the screen told her nothing had happened.
   *
   * ⚠️ AND THE ROWS WERE ALREADY THERE. `allChanges` reads `fromCoach` and builds a row per
   * decision; only this flag disagreed, and it wins because it swaps the whole screen for the
   * "steady week" copy. The fix is not new data — it is one source of truth for the count.
   */
  const [coachLog, setCoachLog] = useState<CoachDecision[] | null>(null);
  const fromCoach = React.useMemo(() => coachBrief(coachLog, app.weekOpenMs), [coachLog, app.weekOpenMs]);
  /*
   * ⛔ THE TWO PROGRAMMES, BECAUSE A CHANGE IS THE DIFFERENCE BETWEEN THEM (2026-08-05).
   *
   * ⚠️ THIS FILE ALREADY CARRIES THE SCAR. Its own note two blocks up records the 2026-08-03 bug:
   * *"1 CHANGE on Today, NOTHING CHANGED in here — two screens counting two different things."*
   * Fixing Today's pill to count measured differences and leaving this on `fromCoach.count` would
   * have re-opened exactly that, in the opposite direction: Today saying 2 and the letter saying 10.
   *
   * So both screens ask `coachChanges`, and the rows below ARE those changes rather than a parallel
   * list that happens to be about the same week.
   */
  const [plans, setPlans] = useState<{ now: CoachPlan | null; before: CoachPlan | null }>({ now: null, before: null });
  const changes = React.useMemo(() => coachChanges(plans.now, plans.before), [plans]);
  const allChanges = React.useMemo(() => {
    /*
     * A COACH ROW HAS NO from→to AND NO "WHY?" PILL, and both absences are the point.
     *
     * The coach states the next programme whole rather than a set of deltas, so there is nothing to
     * print in a move column — and the arrow exists to show a direction, which a sentence does not
     * have. The pill existed because the engine's reason was a three-part case folded behind a
     * chevron; the coach's reason is one sentence, and a control that hides one sentence is a
     * control stealing the job of the thing underneath it (the founder's law: let the control
     * speak). So the sentence is simply on the row.
     */
    if (changes) {
      /*
       * ⛔ A ROW IS A CHANGE, AND ITS SENTENCE IS THE COACH'S (rebuilt 2026-08-05).
       *
       * These used to be the coach's NOTES — one row per thing it wrote about, which meant a lift
       * it held and explained got a row in a letter titled "What changed". The founder's ruling:
       * *"a change is only if there is a drop or a raise or added sets or anything else."*
       *
       * So the rows are the measured differences, and the coach's sentence is JOINED to the lift it
       * is about. A change with no sentence still draws — the figure is a fact and she is owed it —
       * and a sentence with no change is not in a letter about changes.
       *
       * ⚠️ THE COUNT IS `changes.length` AND SO IS THIS. One derivation, which is the whole point.
       */
      const saidFor = new Map((fromCoach?.lines ?? []).filter((l) => l.ex).map((l) => [l.ex as string, l.say]));
      const rows: LetterRow[] = changes.map((c) => {
        const structural = c.kind === 'added' || c.kind === 'dropped';
        return {
          key: `${c.ex}:${c.kind}`,
          name: exerciseDisplayName(c.ex),
          from: structural || c.from == null ? '' : String(+c.from.toFixed(2)),
          to: structural || c.to == null ? '' : String(+c.to.toFixed(2)),
          suffix: c.kind === 'sets' ? t('weekly.setsUnit') : '',
          // A lift arriving or leaving has no direction — it did not move, it appeared. It reads in
          // the neutral tone, which is the same three-way law every other surface obeys.
          dir: (c.direction ?? 'hold') as LoadDirection,
          magnitude: c.from != null && c.to != null ? Math.abs(c.to - c.from) : 0,
          slotId: null,
          line: saidFor.get(c.ex) ?? (structural ? t(c.kind === 'added' ? 'weekly.liftAdded' : 'weekly.liftDropped') : null),
        };
      });
      return rows.sort((a, b) => b.magnitude - a.magnitude);
    }
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
        /*
         * ⛔ THE ENGINE'S OWN SENTENCE, ON THE ROW (founder, 2026-08-12: *"תציג את הנקודות
         * לשינוי"*). This was `null`, so every load change in the letter was a name and two numbers
         * and the reason was one press away inside the case sheet — which is what made a page of
         * them read as a statement from a bank.
         *
         * ⚠️ IT IS NOT A NEW SENTENCE. `lift.change.explanation.text` is the same line the case
         * sheet opens with and the same one Today prints; nothing is authored here, which is why
         * the three surfaces cannot start explaining one decision three ways.
         */
        line: l.change!.explanation?.text?.key
          ? t(l.change!.explanation.text.key, l.change!.explanation.text.params)
          : null,
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
    /*
     * ⛔ `fromCoach` WAS MISSING FROM THIS LIST, AND THAT IS THE WHOLE BUG (founder 2026-08-05):
     *
     *   > *"It shows 10 changes, but when you press it THE MIRROR opens and it says 0 workouts of 4
     *   > were done, 0 tonnes lifted, but that the AI read the sessions and decided on 10 changes —
     *   > it's obvious to you that this isn't right. And it doesn't show the changes at all."*
     *
     * The rows and the count came from the same object and disagreed anyway, because only one of
     * them was memoised. This runs once, on the first render, while `coachLog` is still `null` —
     * so `fromCoach` is null, it takes the dead engine's branch, `view` is null, and it produces
     * an empty array. `changedCount` two lines above is a plain expression, so it recomputed the
     * instant the log landed and printed 10.
     *
     * **A count and its rows must be one derivation.** The dependency is the fix; the memo was
     * never the problem, its list was.
     */
  }, [changes, fromCoach, view, units, t]);
  /*
   * ⛔ THE COUNT IS THE ROWS' OWN LENGTH — AND IT WAS NOT (founder's screenshot, 2026-08-12).
   *
   * This file's own header records the 2026-08-03 bug it was written after: *"a count and its rows
   * must be one derivation."* It then kept two anyway. `changedCount` read `changes` — the diff of
   * two stored `CoachPlan` snapshots — while the ROWS came from `changes ?? fromCoach ?? view`, and
   * `view` is the engine's weekly plan.
   *
   * ⚠️ SO A WEEK WITH ELEVEN MOVED LIFTS RENDERED AS A STEADY WEEK. With no coach plans stored —
   * which is every athlete now, since the model was taken out — `changes` is null, `changedCount`
   * is 0, `steady` is true, and the screen prints *"I changed nothing this week"* over a `view`
   * holding every change it just made. The gallery's `3.1` said "a week WITH decisions" and drew
   * the opposite; that is the screen the founder photographed and called a tax letter.
   *
   * One derivation now: the count IS the rows, so the two cannot disagree about the week again.
   */
  const changedCount = allChanges.length;
  const steady = loaded && changedCount === 0;
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
  /** The muscles her week's sets touched — worn on the letter's body (2026-08-23). */
  const [weekMuscles, setWeekMuscles] = useState<string[]>([]);
  /** Marks CROSSED inside this closed week — the letter carries the seal (2026-08-23). */
  const [weekMarks, setWeekMarks] = useState<{ value: string; caption?: string; title: string; glyph?: string }[]>([]);
  /** The week's share card, when the week holds real work — the letter's quiet story door. */
  const [weekCard, setWeekCard] = useState<ShareWeekCardT | null>(null);
  useEffect(() => {
    if (route?.params?.previewPlan) return; // the harness supplied the band with the week
    let active = true;
    void (async () => {
      try {
        const [history, weekPlan, prevPlan] = await Promise.all([
          db.loadHistory(),
          loadWeekPlan().catch(() => null),
          // The programme this WEEK opened on — the other half of every change on this screen, and
          // the same pair Today's pill reads. `coachPlanPrev` is one SESSION old, which would make
          // a letter about the week report only its last workout.
          db.loadCoachPlanWeek().catch(() => null),
        ]);
        if (!active) return;
        setPlans({ now: weekPlan ?? null, before: prevPlan ?? null });
        /*
         * ⛔ THIS BAND WAS MEASURING THE WRONG WEEK (founder 2026-08-05, same screenshot as above:
         * "0/4 workouts, 0 t moved" on a day he had trained).
         *
         * `currentWeekOpen(now)` is the most recent Saturday 20:30 — the START of the week she is
         * in. It was being used as `weekEnd`, so the window was the seven days BEFORE it: the week
         * that had already closed. Every session since Saturday counted as zero.
         *
         * ⚠️ AND THE CHANGES ABOVE IT WERE ALREADY READING THIS WEEK. `coachBrief` filters on
         * `weekOpenMs`, which is this same instant used correctly as an opening. So one screen was
         * reporting a completed week's work above a current week's decisions — a mismatch nothing
         * could show except by producing exactly the contradiction he photographed.
         *
         * One window, and it is the one the changes come from.
         */
        const weekStart = currentWeekOpen(Date.now());
        const inWeek = (history ?? []).filter((s) => {
          const at = new Date(s.startedAt).getTime();
          return at >= weekStart;
        });
        // "N/M workouts" counts whole workouts trained — the one workout-count rule, shared with
        // Progress and the milestones. `trained !== false` alone also counted an empty session row.
        const done = completedWorkouts(inWeek);
        // How many workouts the COACH set for the week — the denominator of "N/M workouts".
        const planned = weekPlan?.sessions.length ?? 0;
        const kg = totalTonnageKg(inWeek);
        let kcal = 0;
        let kcalSeen = false;
        for (const s of inWeek) {
          const k = sessionEnergyKcal(s, app.profile?.weightKg);
          if (k != null) {
            kcal += k;
            kcalSeen = true;
          }
        }
        setBand({ done, planned, tonnes: tonnesFromKg(kg), kcal: kcalSeen ? kcal : null });
        /*
         * ════ THE LETTER WEARS THE WEEK (founder 2026-08-23: the Saturday screen must make her
         * genuinely want to look) ════
         * Three additions, all already-owned vocabulary: the week's muscles on her body (Home's
         * living half, at the week's close), any mark CROSSED this week as its engraved seal (the
         * celebration's own emblem — a letter that omits the week's proudest fact is not a summary),
         * and the week's story card behind a quiet door (the finish screen's own pattern).
         */
        const touched = new Set<string>();
        for (const sess of inWeek) for (const set of sess.sets) {
          const m = muscleOf(set.exerciseId);
          if (m) touched.add(m);
        }
        setWeekMuscles([...touched]);
        const crossed = earnedMilestones(history ?? [], app.profile).filter((mk) => {
          const at = Date.parse(mk.earnedAt);
          return Number.isFinite(at) && at >= weekStart;
        });
        setWeekMarks(
          crossed.map((mk) => {
            const c = milestoneCopy(mk, tg, app.profile?.units ?? 'kg');
            return { value: c.value, caption: c.caption, title: c.title, glyph: c.glyph };
          }),
        );
        setWeekCard(
          weekCardFromHistory(history ?? [], weekStart, app.profile?.weightKg, app.profile?.units ?? 'kg', app.profile?.memberSince),
        );
      } catch {
        if (active) setBand(null);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * ════ THE WEEK, FROM THE COACH ════
   *
   * `getWeeklyPlan` joins the programme to a changeLog the between-session fold wrote, and that
   * fold is deleted — so the engine's half of this letter is empty for ever on any athlete who
   * started after it went. What the letter is FOR has not changed at all: what did Hush change,
   * and why. That is `coachLog`, filtered to this week, already written in her language.
   */
  const whenLabel = view
    ? `${new Date(view.at).toLocaleDateString(currentLocale(), { weekday: 'long' })} · ${new Date(view.at).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit', hour12: false })}`
    : '';

  /**
   * THE FOUR THAT MATTER MOST (v7 3.1).
   *
   * A week can carry twelve changes. Printing all of them turns a letter into a spreadsheet, and
   * the athlete stops reading at four anyway. So the letter states the COUNT and then shows the
   * four largest moves; everything else is one press away. Ordered by how far the load actually
   * travelled — the biggest decision is the one worth reading first.
   */
  const shown = showAll ? allChanges : allChanges.slice(0, LETTER_ROWS);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* The date, centred, with the way out on the end edge — a 36px disc, the same chrome shape
          the training stage uses. */}
      <View style={styles.header}>
        <View style={styles.headSpacer} />
        <Legend size={17} align="center" style={styles.when}>{whenLabel}</Legend>
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
        {/*
          ════════════════════════════════════════════════════════════════════════════════════════
          ✦ THE LETTER ARRIVES (2026-08-27).

          `Arrive` was built for the founder's largest note — a screen should ARRIVE, not appear
          (2026-08-12) — and reached six screens out of forty-seven. This one is a LETTER: the one
          surface in the product whose whole form is "something written to you, read top to bottom".
          It landed all at once, like a page pasted onto the glass.

          Five beats in reading order: whose week and which, what it came to, the body that did it,
          what it earned, and then the sentence that frames the changes.
          ════════════════════════════════════════════════════════════════════════════════════════
        */}
        <Arrive order={0} style={styles.headBlock}>
          <Legend size={17} track={0.22}>
            {askBack ? t('weekly.askLegend') : steady ? t('weekly.evidenceLegend') : t('weekly.eyebrow')}
          </Legend>
          {/* A week with a question in it steps its headline DOWN (40, not 56): the biggest thing
              on the page has to be the question, and two things cannot both be biggest. */}
          <Text style={[styles.title, askBack && styles.titleAsking]} accessibilityRole="header">
            {view ? t('weekly.weekTitle', { n: view.weekIndex + 1 }) : t('weekly.title')}
          </Text>
        </Arrive>

        {/* THE WEEK'S FACTS — workouts / tonnage / kcal, ruled above and below. */}
        {!askBack && band && (band.planned > 0 || band.done > 0) ? (
          <Arrive order={1}>
            <View style={styles.statBand}>
              <LetterFact value={`${band.done}/${band.planned}`} label={t('weekly.statWorkouts')} />
              <LetterFact value={`${band.tonnes} ${t('weekly.tonneUnit')}`} label={t('weekly.statMoved')} />
              {band.kcal != null ? <LetterFact value={band.kcal.toLocaleString()} label={t('weekly.statKcal')} /> : null}
            </View>
          </Arrive>
        ) : null}

        {/* The week, worn — her body with the week's muscles lit. A summary that SHOWS the
            coverage before a single row is read (2026-08-23). */}
        {!askBack && weekMuscles.length > 0 ? (
          <Arrive order={2}>
            <View style={styles.weekBody}>
              <MiniBody face="front" sex={app.profile?.sex === 'male' ? 'male' : 'female'} lit={weekMuscles} height={150} />
              <MiniBody face="back" sex={app.profile?.sex === 'male' ? 'male' : 'female'} lit={weekMuscles} height={150} />
            </View>
          </Arrive>
        ) : null}

        {/* A mark crossed THIS week carries its seal — the week's proudest fact, in the letter. */}
        {!askBack && weekMarks.length > 0 ? (
          <Arrive order={3}>
            <View style={styles.weekMarks}>
              {weekMarks.map((mk, i) => (
                <View key={`${mk.title}-${i}`} style={styles.weekMark}>
                  <MilestoneEmblem size={124} value={mk.value} caption={mk.caption} glyph={mk.glyph as never} />
                  <Text style={styles.weekMarkTitle} numberOfLines={2}>{mk.title}</Text>
                </View>
              ))}
            </View>
          </Arrive>
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
          <Arrive order={4}>
            <Text style={[styles.intro, askBack && styles.introAsking]}>
              {askBack
                ? t('weekly.askIntro')
                : steady
                  ? t('weekly.evidenceIntro')
                  : allChanges.length > LETTER_ROWS
                    ? t('weekly.introTop', { count: allChanges.length, shown: LETTER_ROWS })
                    : t('weekly.intro', { count: changedCount })}
            </Text>
          </Arrive>
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
                <Legend size={17} tone="accent">{t('weekly.askSince')}</Legend>
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
              const id = row.slotId ?? row.key;
              const hasCase = !!(row.from || row.to);
              return (
                <Pressable
                  key={row.key}
                  accessibilityRole={hasCase ? 'button' : undefined}
                  accessibilityLabel={hasCase ? `${row.name} · ${t('weekly.whyLink')}` : undefined}
                  disabled={!hasCase}
                  onPress={() => setOpenId((cur) => (cur === id ? null : id))}
                  style={({ pressed }) => [
                    styles.row,
                    i === shown.length - 1 && styles.rowLast,
                    pressed && hasCase && styles.rowPressed,
                  ]}
                >
                  {/*
                    ════════════════════════════════════════════════════════════════════════════
                    ⛔ THE REASON IS NOT BEHIND A PILL ANY MORE (founder, 2026-08-12)

                      *"מסך כל כך עצוב ומשעמם שלמה לעזאזל מישהו ירצה לקרוא אותו … תן חיים למסך
                      הזה, לא תיבת טקסט אלא תתפרש על המסך, תציג את הנקודות לשינוי … כרגע הוא נראה
                      כמו מכתב לתשלום ממס הכנסה."*

                    A tax letter is exactly what it was, and structurally: a name at 17, a figure at
                    17 pushed to the right margin, and the SENTENCE — the only part anyone would
                    actually want — collapsed behind a "WHY?" pill. **The reasons are the letter.**
                    Every row was a line item you had to click to find out what it meant.

                    Each change is a block now, in the same shape the finish screen's decisions
                    take: the lift, the move at 40 points, the coach's sentence underneath. The row
                    still opens the full case — pressing anywhere on it does — but she no longer has
                    to press to be told anything at all.
                    ════════════════════════════════════════════════════════════════════════════
                  */}
                  {row.name ? (
                    <Text style={styles.rowName} numberOfLines={2}>{bidi(row.name)}</Text>
                  ) : null}
                  {hasCase ? (
                    <Text style={styles.rowMove} numberOfLines={1}>
                      <Text style={styles.rowFrom}>{`${row.from} `}</Text>
                      <Text style={{ color: directionTone(row.dir) }}>
                        {`→ ${row.to}${row.suffix ? ` ${row.suffix}` : ''}`}
                      </Text>
                    </Text>
                  ) : null}
                  {row.line ? <Text style={styles.rowLine}>{row.line}</Text> : null}
                </Pressable>
              );
            })
          : null}

        {/* ── the steady week: what the weeks have added up to (see the header) ──
            It sits above the travelled lifts because it is the wider fact: the lifts say the engine
            is working, these say she has been. Drawn only once there is a workout to count — a
            band of three zeroes on her first Saturday would be the emptiness this exists to fix. */}
        {steady && standing && standing.workouts > 0 ? (
          <View style={styles.standing}>
            <Legend size={17} track={0.2}>{t('weekly.standingLegend')}</Legend>
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
              {/*
                ⛔ THE CLOSING PARAGRAPH IS DELETED (founder, 2026-08-12: *"גם הוא צריך קצת פוליש של
                הורדת מלל ולתת קצת אוויר לכל דבר"*).

                It read *"I read every set you lift and tune the program to what you showed me. This
                week it needed nothing."* — under an intro that had already said *"I changed nothing
                this week — the program is working. Here is what it has done so far."* **The same
                claim, twice, with the evidence sandwiched between them.** The rows are the argument;
                a paragraph after them repeating the headline is what made the page read as prose.
              */}
            </View>
          ) : (
            // Too early to have proof of anything — so we claim none.
            <Text style={styles.evidenceClose}>{t('weekly.evidenceEmpty')}</Text>
          )
        ) : null}

        {/* The week's story, behind the finish screen's own quiet door (2026-08-23). Drawn only
            when the week holds real work — a card with three zeroes is not a story. */}
        {!askBack && weekCard ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('weekly.shareWeek')}
            onPress={() => navigation.navigate('ShareCardModal', { card: weekCard })}
            style={({ pressed }) => [styles.shareDoor, pressed && styles.pressedDim]}
          >
            <Text style={styles.shareDoorLabel}>{t('weekly.shareWeek')}</Text>
          </Pressable>
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
      <Legend size={17} track={0.14}>{label}</Legend>
    </View>
  );
}

const styles = StyleSheet.create({
  /* ════ the letter wears the week (2026-08-23) ════ */
  weekBody: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 18 },
  weekMarks: { flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: 20, flexWrap: 'wrap' },
  weekMark: { alignItems: 'center', gap: 8, width: 140 },
  weekMarkTitle: {
    fontFamily: font.sans,
    fontSize: textScale.sm,
    lineHeight: 20,
    color: color.textSecondary,
    textAlign: 'center',
  },
  shareDoor: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, marginTop: 10 },
  shareDoorLabel: {
    fontFamily: font.sansMedium,
    fontSize: textScale.base,
    lineHeight: 22,
    color: color.textSecondary,
    textAlign: 'center',
  },

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
  /* ⛔ A.13 — five controls on the Saturday letter answered a press by fading themselves, including
     both answers to the one question it asks. A wash, under them. */
  pressedDim: { backgroundColor: 'rgba(241,238,229,0.08)' },
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
  /* 17/26 → 19/29. It is the letter's opening sentence and the only prose left on a steady week;
     air is what he asked for, and leading is where a page gets it. */
  intro: { marginTop: 22, fontFamily: font.serif, fontSize: 19, lineHeight: 29, color: color.textPrimary, textAlign: 'left' },
  introAsking: { marginTop: 14, fontSize: 17, lineHeight: 24, color: color.textSecondary }, // rtl-ok: merged onto intro

  // The week's facts (v7 3.1) — three mono figures bound top and bottom by a hairline, sitting
  // directly beneath the headline before the letter's prose begins.
  statBand: {
    flexDirection: 'row',
    /* A floor between columns, not the thing that positions them — see `fact`. */
    gap: 16,
    marginTop: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,229,0.14)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241,238,229,0.14)',
  },

  // …and the same band again at the scale of everything she has logged, on a steady week. Its own
  // legend, because two identical bands with nothing to tell them apart would read as a repeat.
  standing: { marginTop: 34, gap: 6 },

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

  /* ⛔ `swapBadge` / `swapBadgeText` ARE DELETED (2026-08-26). Neither was rendered — a badge for a
     swap the letter draws as a row now — and `swapBadgeText` was the last slot in the app tracking a
     translated word open, which is how a dead style came to be found: `noTrackedHebrew` read it. */

  whyRow: { marginTop: 8 },
  whyLink: { fontFamily: font.sansSemibold, fontSize: textScale.sm, color: color.accentText, textAlign: 'left' },
  whyWrap: { marginTop: 14, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 18, backgroundColor: color.surface3, borderRadius: radius.lg },

  // the rest of the plan stands — said once, at the end
  /* ── The changes: one ruled list, largest move first. ── */
  /* ⛔ A BLOCK, NOT A LINE ITEM — see the note at the markup. 15 points of padding and three
     17-point type sizes is a table; this is the same rhythm the finish screen's decisions run on. */
  row: {
    paddingVertical: 22,
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,229,0.14)',
  },
  rowPressed: { backgroundColor: 'rgba(241,238,229,0.05)' },
  // A volume move's reason, unfolded in place — one sentence, in the coach's voice.
  rowLine: { fontFamily: font.serif, fontSize: 19, lineHeight: 27, color: color.textSecondary, textAlign: 'left' },
  rowLast: { borderBottomWidth: 1, borderBottomColor: 'rgba(241,238,229,0.14)' },
  rowName: { fontFamily: font.sansSemibold, fontSize: 20, lineHeight: 26, color: color.textPrimary, textAlign: 'left' },
  rowRight: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowMove: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 40, lineHeight: 46, letterSpacing: -1, includeFontPadding: false, textAlign: 'left' },
  // Where it came FROM rests in shadow; where it went stands in the accent — and a load coming
  // DOWN is drawn in exactly the same moss as one going up. It is the engine matching what she
  // demonstrated, not a setback, and the letter never colours it like one.
  rowFrom: { color: color.textSecondary }, // rtl-ok: nested in rowMove

  // WHY is a door, so it is drawn as one — a hairline pill, not an underlined word.
  whyPill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(241,238,229,0.16)' },
  /* ── The week's facts. ── */
  /*
   * ⛔ A COLUMN THAT CLAIMS ITS SHARE OF THE BAND (2026-08-27, the elevation pass).
   *
   * The three facts were laid out `row` + `gap: 26` and nothing else, so they packed against the
   * start edge and left the remainder as dead space — while the band's two rules, which are
   * `alignSelf: stretch`, ran the FULL width above and below them. The rules drew a box a quarter
   * wider than anything inside it, and the emptiest part of the letter was the part the founder
   * pointed at: *"תן חיים למסך הזה, לא תיבת טקסט אלא תתפרש על המסך."*
   *
   * `flex: 1` rather than `justifyContent: 'space-between'`, deliberately. Space-between is right
   * for a fixed set and wrong for this one — `kcal` is dropped when it is unknown, and two facts
   * flung to opposite ends of 342 points is the *"5 ··· 250 points of black ··· min"* fault that
   * `WellDone.Fact` already has a docblock about. Equal columns hold their spacing at two facts or
   * at three.
   */
  fact: { flex: 1, gap: 2 },
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
  viewAllLabel: { fontFamily: font.sansSemibold, fontSize: 17, color: color.textPrimary, textAlign: 'center' },

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
  askBody: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textSecondary, textAlign: 'left' },
  askActions: { gap: 10, marginTop: 4 },
  // The one MOSS-FILLED button in the product: this is the answer that gives something back.
  askYes: { height: 52, borderRadius: 15, backgroundColor: signal[0], alignItems: 'center', justifyContent: 'center' },
  askYesLabel: { fontFamily: font.sansSemibold, fontSize: 17, color: '#141310', textAlign: 'center' },
  askNo: { height: 52, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(241,238,229,0.24)', alignItems: 'center', justifyContent: 'center' },
  askNoLabel: { fontFamily: font.sansSemibold, fontSize: 17, color: color.textPrimary, textAlign: 'center' },
  askNote: { marginTop: 18, fontFamily: font.sans, fontSize: 17, lineHeight: 18, color: color.textMuted, textAlign: 'left' },

  // the steady week: the athlete's own history, as proof
  evidence: { marginTop: 30, gap: 2 },
  /* Air, not more words — his polish note. The rows carry the whole argument on a steady week. */
  evidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 19,
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
