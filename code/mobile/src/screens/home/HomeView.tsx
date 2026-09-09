/**
 * HomeView — the Today tab, v7 "All Dark · One Lit Stage".
 *
 * The first tab under the bar (Today · Cardio · Progress · You). It answers the only two questions
 * an open earns — what is up next, and what did Hush change — and offers the one act:
 *
 *   hush (range-mark + serif)     — the wordmark, with the coach's door opposite it
 *   WEEK 3 · FOUR DAYS            — the shape of the week, in the chrome's mono
 *   Shoulders, rebuilt            — THE PROGRAMME, in the coach's serif. The headline.
 *   its `why`, one or two lines   — the coach's reason for the whole thing, in its own serif
 *   SUN  Upper A               ✓  · the week as a COLUMN she reads down (`components/WeekColumn`)
 *   TUE  Lower A    · N CHANGES   ·   …the queued row OPENS and holds the shape, the lifts and
 *        5 LIFTS · ~58 MIN        ·   the change pill. Every other row is one line.
 *        lift · load · scheme     ·   a CHANGED load stands in the direction it moved
 *   WED  ———                      · a day with nothing on it: a letter and a rule, never the word
 *   Begin Lower A                 · the one act — cream standing on the dark stage, pinned
 *   N WORKOUTS LEFT IN YOUR TRIAL · one quiet line, gone when the trial is
 *
 * ⛔ REBUILT 2026-08-04. It used to open on the QUEUED WORKOUT with the week reduced to a horizontal
 * strip of chips — *"the way I chose is like a to-do list, and that wasn't right"* (founder). The two
 * questions an athlete actually opens the app with, *what am I on?* and *where am I in the week?*,
 * were both unanswerable, while *what is today called?* took the largest type on the screen.
 *
 * ⚠️ AND THE WEEKDAYS ARE EARNED, NEVER ASKED — `domain/trainingDays`. Until the pattern exists the
 * column numbers its rows, which is the founder's own N-workouts model, unchanged.
 *
 * WHY THE STRUCTURE CHANGED (founder v7, 2026-07-22). The old Home led with a brief CARD (the
 * engine's sentence in a framed box) and closed with a week CARD (the chips inside a second frame).
 * v7 dissolved both frames into the page. Nothing is a card on the stage — the stage itself is lit,
 * and emphasis is standing in that light versus resting in shadow. The open row of the week column
 * is the one thing that RISES off it, which is the same law spent on the one row that has an act.
 *
 * Cardio is its own TAB now, so the run link that used to sit under the act is gone from here.
 *
 * Rest state centers "Recovery." with the completed-week meter and the one fact recovery waits on —
 * when the next week opens. There, and only there, Open training keeps its card: on a day with no
 * workout, a run IS the day's act.
 *
 * The container (Home.tsx) wires state + navigation.
 */

// 

import React, { useEffect, useRef, useState } from 'react';
import { plannedMinutes } from '@/domain/duration';
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { Arrive, Legend, Display, Body, Button, Stage, FooterFade } from '@/components/ds';
/*
 * ⛔ NEITHER THE WEEK COLUMN NOR THE WEEK SHEET IS DRAWN HERE ANY MORE.
 *
 * 2026-08-22 moved the week off Today and behind a door (`WeekSheet`), so Today could lead with
 * today. 2026-08-29 removed the door as well, on the founder's reading of what it was competing
 * with: *"לגבי כפתור ה'אימון אחר' אפשר להוריד כי יותר נוח לבצע אימון אחר דרך מסך התוכנית שכבר
 * אפשר לעשות כיום."*
 *
 * He is right, and the sheet had become the weaker of two surfaces answering the same question:
 * the Program tab lists every workout of the week with ALL of its lifts and their live figures,
 * and a row there opens the same `PreWorkout` card the sheet's row opened. Two doors onto one
 * room, one of them showing less. The meter above still draws the week's shape — that is a STATUS
 * line, not a chooser, which is why it stays and `sheetSegments` came with it into `WeekMeter`.
 *
 * ⚠️ ONE THING IS GENUINELY LOST AND IS STATED RATHER THAN GLOSSED: the sheet printed a per-day
 * "N changes" count for the days that are NOT today. Today's own count is untouched (the pill on
 * the card below, which is also the door to the weekly update), and the update surface still holds
 * the whole week's account. What is gone is seeing at a glance that Thursday moved.
 */
import { usePair } from '@/state/stores/pairStore';
import { WeekMeter } from '@/components/WeekMeter';
import { MiniBody } from '@/components/MiniBody';
import { sheetSegments } from '@/components/WeekMeter';
/* The one place the app decides how a prescription READS — "54 kg · 4×8–10". The queued card's
   three headline rows borrow the assembly rather than growing a second one beside it. */
import { figureLoad, figureUnit, figureScheme, FigureCells } from '@/components/PlanLifts';
import type { Weekday } from '@/domain/coachPlan';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import type { Line } from '@/domain/voice';
import { displayWeight, unitLabel } from '@/domain/schedule';
import * as haptics from '@/platform/haptics';
import { useReducedMotion } from '@/platform/reducedMotion';
import { DayInMotion } from '@/components/DayInMotion';
import type { FigureSex } from '@/motion/types';
import { color, space, font, textScale, ramp, radius, signal, stage, motion, tracking, trackingPx, directionTone, type LoadDirection } from '@/design/tokens';
import { TRIAL_NEWS_AT } from '@/domain/entitlement';
// The app's language, not the device's — see `everyDateSpeaksHerLanguage`.
import { currentLocale } from '@/i18n';

/** The week whose Recovery moment has already been given (never repeat a celebration). */
const RECOVERY_SEAL_KEY = 'hush.recovery.sealed';

/*
 * ⛔ `HEADLINE_LIFTS = 3` IS DELETED — TODAY DRAWS THE WHOLE DAY (founder 2026-08-29).
 *
 * *"ואז כך תוכל להציג את כל התוכנית שיש היום במקום עוד 2 תרגילים כפי שכתוב עכשיו."*
 *
 * The old argument was that three rows plus "+4 more lifts" reads as a SAMPLE, where five would
 * read as a truncated table — and that was true of a card competing for the fold with an "אימון
 * אחר" row and a week sheet behind it. Both are gone (see the note at the top of the file), and the
 * space they held is exactly what a full day costs.
 *
 * ⚠️ AND IT DOES NOT REOPEN THE 08-12 RULING — *"One workout's contents belong in ONE place"* — as
 * squarely as it looks. That ruling was about the PRESCRIPTION: sets, reps, the reason a load
 * moved, the clip, the swap. `PreWorkout` still owns every one of those, and these rows still
 * carry only a name and a figure. What changed is how many names: "the lifts I am doing today" is
 * a fact about today, and printing two-thirds of it was the card being coy about the one thing it
 * is for.
 */

export interface HomeWorkoutOption {
  id: string;
  name: string;
  /* ⛔ `muscles` IS DELETED (2026-08-29). It was the line under a workout's name in `WeekSheet`,
     and the sheet went with its door — see the note at the top of this file. `Home.musclesOf` /
     `signatureOf`, which produced it, are deleted there with the argument they carried. */
  /**
   * The weekday the coach put it on ('sun'…'sat'), when it put it on one.
   *
   * Absent on a hypertrophy week, which does not care what day is what — four sessions in any order
   * is the same week. An endurance plan is the opposite: the long run is on Sunday because the rest
   * of the week is arranged around it, and until now that was decided, stored, sent back to the
   * coach, and never shown to the athlete once.
   */
  day?: string;
  /** Already trained this week — a record, not an option (founder 2026-07-11): it shows
   *  as DONE and cannot be queued again. */
  done?: boolean;
  /*
   * ⛔ FIVE FIELDS HOME HAS ALWAYS PASSED AND THIS INTERFACE NEVER DECLARED (2026-08-22).
   *
   * `Home.tsx` builds every option with `items`, `lifts`, `minutes`, `timeUnknown` and `changes`,
   * and `WeekColumn` declares all five on its own props — so the shape was real, documented one
   * component over, and invisible here. `@ts-nocheck` is why nothing said so.
   *
   * ⚠️ THEY ARE STILL READ HERE, and by the line that matters most: `shapeLine` is cut from
   * `lifts ?? items ?? minutes ?? timeUnknown`, which is the card's own "6 lifts · ~55 min". A
   * reader who cannot see a field in the type it is handed is how a `lifts` count quietly becomes
   * an `items` count again (2026-08-18 — twenty-two exercises inside fifty-four minutes).
   */
  /** How many things she does in it — ROUNDS, which is the estimate's unit, not the session's shape. */
  items?: number;
  /** How many LIFTS — distinct exercises. The line says "N lifts", so this is what it prints. */
  lifts?: number;
  minutes?: number;
  /** There is work in it with no duration to price (a distance) — `minutes` is a floor. */
  timeUnknown?: boolean;
  /** How many loads the engine moved in THIS session. A count belongs to the thing it counts. */
  changes?: number;
}

/**
 * One lift of the selected workout, as Home prints it. The LOAD is the point — the one number Hush
 * decides, sitting on the first screen the athlete opens. A lift the engine CHANGED this week has
 * its load lit — IN THE DIRECTION IT MOVED (founder 2026-07-29: raise = moss, ease = blue, hold =
 * cream, on every screen without exception). It used to be one ochre for all three, so the first
 * screen of the day told her something had changed and refused to say which way.
 */
export interface HomePlanLift {
  exerciseId: string;
  name: string;
  /**
   * THE RIGHT-HAND FIGURE, ALREADY WRITTEN — for work that is not reps at a load.
   *
   * A lift's figure is assembled here from `load` / `band` / `sets`, and that assembly only knows
   * how to say "40 · 3×8–12". A 400 m repeat and a 45-second plank have no load and no band, and
   * bending them into those fields would print "0 · 4×0–0". So the shapes that cannot be said in
   * this vocabulary arrive already said, from `coachWeek`, and this row prints them verbatim.
   *
   * Absent on every engine row, where the existing assembly is exactly right.
   */
  detail?: string;
  /** kg; null = bodyweight (the row then says the reps carry the work, not a weight). */
  load: number | null;
  sets: number;
  /**
   * HER BAND — `[Tlo, Thi]`, not a single number. The prescription IS the band (register S-6):
   * land in it, and clearing the top earns weight. Printing `recommendedReps` alone printed Tlo,
   * the FLOOR, dressed as the whole target.
   */
  band: [number, number];
  /** Which way the engine moved this lift's load this week; absent = it did not touch it. */
  changed?: LoadDirection;
  /**
   * THE FIGURE HAS NOT LANDED YET (founder A.12 — "tapping the chips flickers").
   *
   * A row's NAME and set count are facts of the programme day, known the instant a chip is tapped;
   * only the load and the band are read from the engine, and that read is a promise. The list used
   * to wait for the whole thing — so every chip tap collapsed six rows into an empty 168 px box and
   * grew them back, which is the flicker. Now the rows stand immediately and only the figure waits.
   * `load: null` already means BODYWEIGHT, so a pending row needs its own flag: a blank column is
   * not a claim that the lift carries no weight.
   */
  pending?: boolean;
}

/**
 * ════ THE LIVING HALF (founder, device QA 2026-08-23) ════
 *
 * *"יש כאן יותר מחצי מהמסך שהוא פשוט ריק ולא מנוצל … תן לו יותר חיים וניצול של השטח."*
 *
 * Everything here is a FACT the app already holds — nothing is invented to fill space, because a
 * screen padded with filler is emptier than one with room:
 *   · `weekLive` — what this week has actually cost her so far (the rest band's own figures,
 *     finally shown while the week is LIVE and not only after it closes) + the muscles her logged
 *     sets have touched, drawn on her own body.
 *   · `nextMark` — the closest milestone, as a paper card (the product's one opaque-cream surface,
 *     the same material as Begin): the brightest thing on the page after the act itself.
 */
export interface HomeLiveWeek {
  tonnes: number;
  kcal: number | null;
  loadsUp: number;
  /** Muscles with at least one logged set THIS WEEK — the moss on the figure. */
  muscles: string[];
}

export interface HomeNextMark {
  /** The engraved figure — "18/25", "3.2/10 t". Mono-safe: numerals and separators only. */
  figure: string;
  /** What the mark is — "מועדון 25 האימונים". */
  title: string;
  /** 0..1 toward it — the hairline under the figure. */
  progress: number;
}

export interface HomeViewProps {
  resting: boolean;
  /** The corner disc — Together, the people around her training (founder 2026-08-24). Absent
   *  draws nothing (a fixture that predates it, never a door to nowhere). */
  onTogether?: () => void;
  /**
   * ⛔ TRAIN TOGETHER — the door to the live pair (§11.2), and it is HERE rather than on Together
   * for one reason: two brothers deciding to share a bench are standing in a gym looking at the
   * Begin button. A social feature filed under the social tab is a feature they find at home on the
   * sofa, which is not when they need it.
   *
   * Absent draws nothing — and so does a build with no wire, which the row checks itself.
   */
  onTrainTogether?: () => void;
  /** The living half — see above. Absent (day one, nothing logged) draws nothing. */
  weekLive?: HomeLiveWeek | null;
  nextMark?: HomeNextMark | null;
  /** Whose body the week's moss is drawn on. */
  sex?: 'female' | 'male';
  /** The athlete's first name, when they gave one — spoken only where Hush is speaking TO them. */
  name?: string;
  dayName: string | null;
  /** The QUEUED workout's id. The chips key off this, never off the name: two workouts in a week
   *  can be called the same thing, and a chip that matched by name would light the wrong one. */
  dayId?: string | null;
  /* ⛔ `muscles` REMOVED (2026-08-16). It was declared here and never read in this file: the coach
     names its own sessions and does not state muscle groups, so `Home` fed it `''` to satisfy a
     field with no consumer. `HomeWorkoutOption.muscles` above is a different, live one. */
  trainedThisWeek: number;
  startError: boolean;
  weekNumber: number; // training-week counter ("Week N"), from memberSince
  /** The SELECTED workout's lifts, with the loads Hush set. Null while they are being read — the
   *  section holds its shape rather than flashing an empty list. */
  plan: HomePlanLift[] | null;
  /** Honest work-time estimate for the selected workout (minutes). 0 = unknown. */
  planMinutes?: number;
  /**
   * The estimate CANNOT be honest, because the session contains work with no duration to price — a
   * run, a ride. Then the line says how much work it is and stops, rather than printing a number
   * that is wrong by a factor of six.
   */
  planTimeUnknown?: boolean;
  /** Muscles whose rest window has run out and are still waiting on her answer (S-32b's sibling). */
  easeChecks?: string[];
  onEaseAnswer?: (muscle: string, answer: 'recovered' | 'tender' | 'hurts') => void;
  /** A tap on a lift's row. Since 2026-09-07 it opens the DAY's card (`PreWorkout`) — the room
   *  holding the swap, the drag, the clip and the load's case — never a sheet of its own. The
   *  name is kept so the fixtures that hand one in stay honest about what they hand. */
  onForm: (exerciseId: string) => void;

  /** The selected workout is already trained this week: it can be READ, never started again
   *  (founder 2026-07-11). The act is what the gate belongs on — the plan still shows. */
  dayDone?: boolean;
  /** The athlete's units, for the loads on the plan rows. */
  units: 'kg' | 'lb';
  /**
   * WHICH ATHLETE DEMONSTRATES — the day's figure and the rows' stills.
   *
   * ⚠️ THE SAME SWITCH EVERY OTHER MOTION SURFACE TAKES, and it exists because of a founder finding
   * on the plan builder: *"אם אני בוחר את הגוף הגברי, באנימציה זה מציג את הגוף הנשי."* A default
   * inside the renderer is how that happens — so the caller states it, here as everywhere.
   */
  figure?: FigureSex;
  /** True while Today is not the visible tab — the day's figure holds its pose and stops its clock. */
  motionPaused?: boolean;
  /** An interrupted (app-killed) workout that can be picked up exactly where it was (S3).
   *  When present, the primary CTA becomes "Continue {workout}" — one path, no fork. */
  resumable?: { workoutName: string } | null;
  onResume?: () => void;
  onStart: () => void;
  workouts: HomeWorkoutOption[];
  onChooseWorkout: (id: string) => void;
  /**
   * ⛔ SHE DRAGGED ONE ONTO ANOTHER DAY (founder 2026-08-05). Absent = the board is read-only,
   * which is what week one is: with no pattern the rows are numbered and there are no days.
   */
  /* ⛔ `onMoveToDay` IS DELETED (founder 2026-08-12) — the numbered column has no day to drop onto.
     See `WeekColumn`, which carries the argument and the measurement. */
  /*
   * ⛔ `brief`, `briefCount` AND `briefUnseen` ARE DELETED (2026-08-26, the founder's "decide it"
   * pass). This view read none of the three, and each was dead for its own reason:
   *
   *   `brief`        never written — `setBrief` was declared and called nowhere, so it was `null`
   *                  for the life of the screen. `weekBriefing` assembled a sentence out of deltas
   *                  and the coach writes its own.
   *   `briefCount`   the WEEK's total, superseded by the founder's own ruling (2026-08-12): *"a
   *                  count belongs to the thing it counts"* — the pill draws `todayChanges`, this
   *                  session's own, and that is live and unaffected.
   *   `briefUnseen`  ⛔ CANNOT BECOME TRUE. It is derived from `db.loadCoachLog()`, and the only
   *                  writer of that log is `afterSession`, which nothing calls (`theAiHasOneJob`).
   *                  An unseen dot built for it could never appear — the same trap the deleted
   *                  rotation-undo was in, two props down.
   */
  /** How many lifts the engine changed this week — the count on the moss pill beside the title.
   *  Null / 0 in a steady week, where no pill shows. */
  /** The coach's name for the programme she is on. Null until it has named one. */
  /*
   * ⛔ `programTitle` IS DELETED (founder 2026-08-12): *"תוריד את שם התוכנית."* It was the screen's
   * headline from 2026-08-04 and 50px of the first fold saying the same sentence every morning.
   * The name lives where it is news — `ProgramCreated`, the day it is made.
   */
  /*
   * ⛔ `programWhy` IS DELETED (2026-08-12). It carried `coachPlan.why` — the coach's paragraph about
   * the whole programme — and `domain/enginePlan` leaves `why` deliberately absent (R7: Hush never
   * states a reason it did not measure). Null on every device since the engine took the week.
   */
  /**
   * ⛔ THE ENGINE'S OWN SENTENCE ABOUT WHAT HER WEEK COULD NOT DO — `domain/weekNotice`.
   *
   * Distinct from the coach's `why` (deleted above): this is the ENGINE
   * saying it could not fit her hour, could not fill it, or could not feed every muscle she left on
   * — three facts it has stamped on the days for a long time and told nobody but telemetry.
   */
  notice?: string | null;
  /**
   * The weekdays she trains on, or absent while the pattern is still being earned.
   * Absent → the column NUMBERS its rows instead (see `WeekColumn`), which is week one.
   */
  /* ⛔ `trainingDays` IS DELETED (founder 2026-08-12): *"אמרנו שזה לא יופיע כימים אלא כN אימונים."*
     The derivation is still right and still lives in `domain/trainingDays`; Today simply does not
     draw a calendar out of it. */
  /* ⛔ `undoable` / `onUndoSwap` ARE DELETED (2026-08-26). This view never read either — the
     container computed the offer and wired a real handler to a control that does not exist, and
     `setUndoable` was only ever called with `null`, so it could not have appeared. The take-back is
     `declareSwap` from the pre-workout card, which is reversible by naming the original again. The
     whole argument is at the deletion note in `appStore`. */
  onWeeklyUpdate: () => void;
  /** The Saturday letter holds changes she has not opened — a moss dot on the pill (audit QW). */
  letterUnseen?: boolean;
  /** Workouts left in the free trial — one quiet line under the act; absent once the trial is over
   *  or the athlete is a member. */
  trialLeft?: number | null;
  /* ⛔ `previewWeekOpen` IS DELETED (2026-08-29). It was the gallery's seam onto `WeekSheet`, and
     the sheet is gone with its door — a preview flag for a surface that no longer exists is a prop
     every future reader has to chase before finding out it draws nothing. */
  /*
   * ⛔ `onCoach` IS DELETED (founder 2026-08-12). The corner door it drew had no caller in the app —
   * only the dev fixture — so the prop's whole remaining function was to let a harness invent a
   * control the product does not have. See the brand row.
   */
  /** Open the plan-share door. Reached from the You tab; nothing stands in Today's corner now. */
  onShare?: () => void;

  // ── RECOVERY, v7 3.5 "THE WEEK IS DONE" — all optional, all best-effort. Absent → the section
  //    simply does not draw (the closing verdict still reads from the seal + copy alone).
  /** Sun→Sat (7), each day of THIS week: trained (a session logged) and whether it is today. The
   *  strip lands day by day — trained days wear the moss check, rest days a dashed ring. */
  /* ⛔ `weekDays` IS DELETED (founder 2026-08-12). It fed the seven-mark day strip on the
     week-complete state; the week is N workouts everywhere on this screen now, and the ledger that
     replaced the strip reads `workouts` like the active face does. */
  /** The week's facts band: tonnage moved, calories, loads the engine raised. kcal null → omitted. */
  weekStats?: { tonnes: number; kcal: number | null; loadsUp: number } | null;
  /** The workout that opens the next week (rotation's first) — named, without a fabricated load. */
  nextWorkoutName?: string | null;
}

export function HomeView(props: HomeViewProps) {
  const { t } = useCopy();
  const reduced = useReducedMotion();

  const total = props.workouts.length || 0;
  const done = Math.min(props.trainedThisWeek, total);
  const liftCount = props.plan?.length ?? 0;
  // Today's weekday, spelled in the active locale (sans eyebrow — never mono, it is a word).
  const restWeekday = new Date().toLocaleDateString(currentLocale(), { weekday: 'long' });

  /* ---- the Recovery moment (founder 2026-07-12) — a SEAL, not confetti ---- */
  const seal = useRef(new Animated.Value(0)).current;
  const [sealed, setSealed] = useState(false);
  /*
   * ⛔ THE PINNED ACT SITS ON TOP OF HER WEEK, AND THE LAST CARD LIVED UNDER IT (founder, 2026-08-21,
   * photographing "Full Body C" cut in half by the Begin button).
   *
   * The act is deliberately at the foot of the SCREEN rather than the foot of the CONTENT — see the
   * note at `styles.cta`, and it is the right call: on a long week the one thing the screen exists to
   * offer must not be a scroll away. But nothing then reserved its height, so the scroll's own
   * `paddingBottom: 8` let the list run underneath it. The last workout of every week was
   * permanently half-hidden, and no amount of scrolling freed it.
   *
   * ⚠️ MEASURED, NOT GUESSED. The act's height is the button plus its gutters plus whatever line
   * sits under it (the trial counter today, something else tomorrow), and a constant here would be
   * wrong the first time any of those changed — which is exactly how it would come back.
   */
  const [ctaH, setCtaH] = useState(0);

  /*
   * ⛔ THE WEEK, BEHIND ITS DOOR (founder 2026-08-22). Held here rather than on `Home` because it
   * is a view state and nothing outside this file can put the screen into it — the container owns
   * WHICH workout is queued (`onChooseWorkout`), and this owns whether the chooser is open.
   */


  /*
   * ⚠️ THE FALLBACK MATCHES BY NAME because `dayId` is absent on an engine-era plan — exactly what
   * the column did, for the same reason, and it is kept verbatim so the two arrangements can never
   * disagree about which row is the queued one.
   */
  const queuedId =
    props.dayId ?? props.workouts.find((w) => w.name === props.dayName)?.id ?? null;
  const queuedWorkout = props.workouts.find((w) => w.id === queuedId) ?? null;

  /*
   * TODAY's shape — "5 lifts · ~50 min".
   *
   * ⛔ IT ASKS THE WORKOUT, NOT THE PLAN, and that is the 2026-08-12 ruling applied to the new
   * arrangement: *"a row must never be able to say a different thing from its neighbour about the
   * same kind of fact. The workout answers for itself."* The block on Today and the row in the
   * sheet behind it read ONE object, so they cannot disagree one tap apart.
   *
   * ⚠️ AND IT ROUNDS TO FIVE, like `PreWorkoutScreen` and the sheet — the same session must not
   * read as "~53 min" here and "~55 min" there.
   */
  /*
   * ⛔ WHAT THE ENGINE MOVED IN **THIS** SESSION. See the note at the pill: the week's total is not
   * a fact about today, and drawing it here would restore the exact defect the founder named on
   * 2026-08-12. `briefCount` still reaches the screen — it is what the WHY surface opens onto.
   */
  const todayChanges = queuedWorkout?.changes ?? 0;

  const shapeLine = (() => {
    const n = queuedWorkout?.lifts ?? queuedWorkout?.items ?? props.plan?.length ?? 0;
    if (!n) return null;
    const min = queuedWorkout?.minutes ?? props.planMinutes;
    const unknown = queuedWorkout?.timeUnknown ?? props.planTimeUnknown;
    return min && !unknown
      ? t('home.planShape', { count: n, lifts: n, min: plannedMinutes(min) })
      : t('home.planShapeNoTime', { count: n, lifts: n });
  })();
  useEffect(() => {
    if (!props.resting) return;
    let active = true;
    const week = String(props.weekNumber);

    const settle = (celebrate: boolean) => {
      if (!active) return;
      setSealed(true);
      if (!celebrate || reduced) {
        seal.setValue(1);
        if (celebrate) haptics.weekComplete();
        return;
      }
      haptics.weekComplete();
      Animated.timing(seal, { toValue: 1, duration: motion.dur[5], easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    };

    AsyncStorage.getItem(RECOVERY_SEAL_KEY)
      .then((stored) => {
        if (!active) return;
        const firstTime = stored !== week;
        if (firstTime) void AsyncStorage.setItem(RECOVERY_SEAL_KEY, week).catch(() => {});
        settle(firstTime);
      })
      .catch(() => settle(false));

    return () => {
      active = false;
    };
  }, [props.resting, props.weekNumber, reduced, seal]);

  return (
    <View style={styles.root}>
      <Stage />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        {/* brand + account — the range-mark and "hush" in the coach's serif, the avatar opposite */}
        <View style={styles.brandRow}>
          <View style={styles.brand}>
            <RangeMark />
            <Text style={styles.wordmark}>hush</Text>
          </View>
          {/*
            ════ ⛔ THE CORNER DOOR IS GONE, AND IT HAD ALREADY LEFT THE PRODUCT ════

            FOUNDER, 2026-08-12: *"ומה זה החלונית של הAI למעלה, אתה ממליץ להשאיר אותה? כרגע זה לא
            מובן."* The answer is not a recommendation — it is a measurement. **`Home.tsx` has never
            passed `onCoach`.** The route it opened (`Coach`) was deleted on 2026-08-11 with
            `CoachScreen`, and this block is `props.onCoach ? … : null`, so on a real device the
            speech bubble has not been drawn since. The only thing still handing it a function was
            the gallery fixture — which is why he could see it and nobody else could.

            ⚠️ THAT IS THE SECOND TIME THIS EXACT HARNESS LIE HAS COST A REVIEW. `1.5` mounted a
            `model: {}` that the app never has, and now Today mounted a coach door the app never
            has. **A fixture that supplies something the product does not is not a convenience —
            it is a screen nobody can act on**, and the founder spent one of his notes on a control
            that was not there.

            What it USED to be, kept because the argument is still binding on whatever stands here
            next: the founder put the coach in the corner rather than the tab bar — *"I don't want
            to put the AI in the tab bar, because that would signal hardest of all that we're just
            another AI app."* A tab is a section; that was not a section. The AI has one job
            (`theAiHasOneJob`) and it is reached from the import screen.

            ════ THE CORNER BELONGS TO HER PEOPLE NOW (founder, 2026-08-24) ════

            *"איך זה קשור לשם? זה לא. אולי אפשר לשים את זה במסך הבית."* — the Together disc sat on
            Progress for one day, and the founder is right that pride and people are different
            subjects. The corner is the honest home: one quiet chrome disc, opposite the wordmark,
            in the same 36-pt disc grammar every stage door already speaks — the people around her
            training, one tap off the screen she opens every day, and not one word added to it.
            The old ruling stands undisturbed: this is not an AI door, and the daily screen still
            has exactly one act.
          */}
          {props.onTogether ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('together.title')}
              hitSlop={8}
              onPress={props.onTogether}
              style={({ pressed }) => [styles.togetherDisc, pressed && styles.togetherDiscPressed]}
            >
              <Icon name="twoPeople" size={17} color={stage.ink0} strokeWidth={1.8} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: styles.scroll.paddingBottom + ctaH }]} showsVerticalScrollIndicator={false}>
          {/*
            ⛔ THE REST WINDOW THAT RAN OUT — FIRST THING, ABOVE HER WEEK (founder 2026-08-11).
            The founder's rule is that Hush must *"REMEMBER and TELL him the time is up, and ASK HIM
            HOW HE FEELS."* The body map answers it too, but a question that only lives there is one
            she has to go looking for — and "tell" is not "wait to be found". This is the screen she
            opens; this is where telling happens.

            ⚠️ IT IS NOT A BANNER AND IT DOES NOT NAG. It appears only while a window has lapsed and
            she has not answered, and any answer removes it — including "back to normal", which
            writes nothing but a close. `awaitingAnswer` reads the clock, so a window that ran out
            while the app was shut is here the moment she opens it.
          */}
          {(props.easeChecks ?? []).map((m) => (
            <View key={m} style={styles.easeAsk}>
              <Text style={styles.easeAskTitle}>{t('pain.askBack', { muscle: t(`muscle.${m}`) })}</Text>
              <View style={styles.easeAnswers}>
                {(['recovered', 'tender', 'hurts'] as const).map((a) => (
                  <Pressable
                    key={a}
                    accessibilityRole="button"
                    accessibilityLabel={`${t(`muscle.${m}`)} — ${t(`pain.answer${a[0].toUpperCase()}${a.slice(1)}`)}`}
                    onPress={() => props.onEaseAnswer?.(m, a)}
                    style={styles.easeAnswer}
                  >
                    <Text style={styles.easeAnswerText}>
                      {t(`pain.answer${a[0].toUpperCase()}${a.slice(1)}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          {props.resting ? (
            <View style={styles.restBlock}>
              {/* the day + week, quietly — a sans eyebrow (holds the translated word "Week") */}
              <Legend align="center" tone="muted" style={styles.restEyebrow}>
                {`${restWeekday} · ${t('home.weekLabel', { n: props.weekNumber })}`}
              </Legend>

              {/* THE SEAL — a dashed ring holding N/N sessions, a moss check stamped at its crown.
                  It draws itself in once, the first landing after a full week. */}
              <Animated.View
                style={[
                  styles.sealRing,
                  sealed
                    ? { opacity: seal, transform: [{ scale: seal.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }
                    : { opacity: 0 },
                ]}
              >
                <View style={styles.sealCore}>
                  <Text style={styles.sealCount}>{`${total}/${total}`}</Text>
                  <Legend size={17} tone="muted">{t('home.sessionsLabel')}</Legend>
                </View>
                <View style={styles.sealBadge}>
                  <Icon name="check" size={11} color={color.up} strokeWidth={3} />
                </View>
              </Animated.View>

              <Display style={styles.restTitle}>{t('home.restTitle')}</Display>

              {/*
                ════ ⛔ THE SEVEN-MARK DAY STRIP IS GONE, AND THE MEASUREMENT IS THE WHOLE ARGUMENT ════

                FOUNDER, 2026-08-12, on whether it should follow the N-workouts ruling off this
                screen: *"נותן לך את זכות הבחירה לזה."*

                It goes, and not on consistency — on a self-contradiction I could measure. The seal
                says **4/4** at y=149. Two hundred and thirty-one pixels below it, the strip drew
                **three dashed empty rings**. A dashed ring is the visual language of a slot waiting
                to be filled; three of them under a headline that says the week is complete is the
                screen telling her she finished everything and then drawing three holes.

                ⚠️ I ARGUED FOR KEEPING IT ONE MESSAGE EARLIER, on tense — the week is over, so those
                are days she trained rather than days she owes. That reasoning is sound and it is not
                how a strip of dots is read. **Nobody parses tense out of seven circles.**

                ── WHAT REPLACES IT, AND WHY IT IS NOT JUST A DELETION ─────────────────────────────
                Her four workouts, named, each with its check. It is the same vocabulary the active
                Today now speaks (`WeekColumn`), so the two faces of this screen stop disagreeing
                about what a week is — and it says the thing weekdays could not: **what she did.**
                "Upper A, Lower A, Upper B, Lower B" is what an athlete remembers about a finished
                week. "Sunday, Tuesday, Thursday, Saturday" is what a calendar remembers.
              */}
              {props.workouts?.length ? (
                <View style={styles.doneList}>
                  {props.workouts.map((w, i) => (
                    <View key={w.id} style={[styles.ledgerRow, i > 0 && styles.doneRowRuled]}>
                      <Text style={styles.doneIndex}>{String(i + 1).padStart(2, '0')}</Text>
                      <Text style={styles.doneName} numberOfLines={1}>{bidi(w.name)}</Text>
                      {/* ⚠️ THE CHECK FOLLOWS THE WORKOUT, NOT THE SCREEN. A week can close with a
                          session unfinished — she trained three of four and Saturday came — and
                          ticking every row because the week rolled over would be the app claiming a
                          workout she did not do, on the screen that congratulates her. */}
                      {w.done ? (
                        <Icon name="check" size={17} color={color.up} strokeWidth={2.6} />
                      ) : (
                        <View style={styles.doneMissing} />
                      )}
                    </View>
                  ))}
                </View>
              ) : null}

              {/*
                ⛔ THE REST NOTE IS DELETED (founder, 2026-08-12): *"תמחק את המשפט … ואז זה יתן יותר
                מקום וחלל במסך."*

                It read *"Muscle is built on days like this. Nothing is scheduled — that's the
                program working."* — true, and it is the one thing on this screen she does not need
                told. **The seal says 3/3 and the ledger names all three**; a paragraph explaining
                that a finished week is a good thing is the screen talking over its own evidence.
              */}

              {/* the week's facts — moved · kcal · loads up (mono figures, sans labels) */}
              {props.weekStats ? (
                <View style={styles.statBand}>
                  <RestFact value={props.weekStats.tonnes.toFixed(1)} label={`${t('weekly.tonneUnit')} ${t('weekly.statMoved')}`} />
                  {props.weekStats.kcal != null ? <RestFact value={String(props.weekStats.kcal)} label={t('weekly.statKcal')} /> : null}
                  <RestFact value={String(props.weekStats.loadsUp)} label={t('home.loadsUp')} accent />
                </View>
              ) : null}

              {/* NEXT — the workout that opens next week, named. No fabricated load: the roll has not
                  happened, so the only honest facts are its name and when the week opens. */}
              {props.nextWorkoutName ? (
                <Text style={styles.nextRow}>
                  <Text style={styles.nextLabel}>{`${t('home.nextLabel').toUpperCase()} · `}</Text>
                  <Text style={styles.nextName}>{bidi(props.nextWorkoutName)}</Text>
                </Text>
              ) : null}
              <View style={styles.metaRow}>
                <Icon name="calendar" size={15} color={color.textTertiary} strokeWidth={2} />
                <Text style={styles.restNext}>{t('home.restNext')}</Text>
              </View>

              {/* THE RUN CARD IS GONE (founder 2026-07-27). Cardio has its own seat in the tab
                  bar now, one tap away from every surface — so a second door to it on the rest day
                  was the same act offered twice. The week's close says the week is closed; anyone
                  who wants to run already knows where the tab is. */}
            </View>
          ) : (
            <View style={styles.block}>
              {/* "TUESDAY · UP NEXT" — the weekday is the DEVICE's, read off the clock exactly like
                  the rest state's; it is not the engine claiming a calendar (register L7). What is
                  up next is still the queued workout, whatever day it is opened on. */}
              {/*
                ════ ⛔ THE HIERARCHY WAS UPSIDE DOWN, AND THE MEASUREMENT SAYS SO ════

                FOUNDER, 2026-08-12: *"המסך הזה צריך עיצוב כולל מחדש … יש לך יד חופשית."*

                The largest type on Today was the PROGRAMME NAME — 38px serif, three lines, 84
                pixels of the first fold. It reads *"Upper / Lower · 4 days a week · leading with
                Chest"*, and **it says exactly that every single morning for the life of the
                programme.** The thing she opened the app for — Upper B, six lifts, fifty-five
                minutes — was 23px, third row down, inside a container.

                **A screen should be biggest where it changes.** The name is identity: worth
                stating, in the serif, because it is the name of a made object — and worth stating
                ONCE, small. So it drops to a supporting line and the queued workout takes the
                headline in `WeekColumn`.

                ⚠️ THIS DEMOTES SOMETHING HE ASKED FOR ON 2026-08-04, and it is the same argument he
                made then, applied one level further. What he was fixing was Home leading with
                *"MONDAY · UP NEXT"* — a fact she already had. A name that never changes is the same
                fault at a larger size: it is not news, and news is what a daily screen is for.
              */}
              {/*
                ════ ⛔ THE EYEBROW, THE METER, AND WHY THE CAPTION CAME BACK AS AN INSTRUMENT ════

                It read "WEEK 11 · 2 OF 4 DONE" until 2026-08-12, when it was cut to the week number
                alone on an argument that was correct at the time: *"the four cards underneath say
                '2 of 4' by having checks on two of them. A screen that states a fact its own
                content already draws is spending the top of the fold on a caption."*

                ⛔ FOUNDER, 2026-08-22, asking for it back: *"ארצה לראות מה קורה במידה ואימון אחד
                בוצע — איך זה מסמן את ההתקדמות שבוצעו N מתוך M אימונים."*

                ⚠️ AND THE 08-12 ARGUMENT DOES NOT SURVIVE THE ARRANGEMENT THAT REPLACED IT. Those
                four cards left this screen (first behind a door, and since 2026-08-29 to the Program
                tab entirely), so nothing here draws the fact any more — the caption was redundant,
                and it is not redundant now. What comes
                back is an INSTRUMENT rather than a sentence (`WeekMeter`), which is the founder's
                standing preference stated as a law on 2026-08-22: *"העדפה להראות במקום לכתוב."*
              */}
              {/* ⚠️ THE FALLBACK STAYS. A week with no sessions in it has no week number worth
                  stating — "Week 3" over an empty page is the app naming a thing that is not there
                  — so it says the day and what is up next instead. Pinned by
                  `theProgrammeIsAThingWithAName`. */}
              {/*
                ════════════════════════════════════════════════════════════════════════════════
                ✦ TODAY ARRIVES (2026-08-27).

                `Arrive` was built to answer the founder's largest note — *"האם המוצר שלנו APPLE? אם
                לא, בוא נדאג שהוא יתחיל להיות ולהרגיש כך"* (2026-08-12) — and its own docblock names
                the diagnosis: *"every element was simply present on the first frame, so a screen
                APPEARED rather than ARRIVING. That is the single largest difference between this and
                the apps he is naming."*

                It was then wired into SIX screens out of forty-seven. **Today — the screen she opens
                every morning — was not one of them.** The tool, the curve, the stagger and the
                reduced-motion contract all existed; this screen just never took them.

                Four beats, in reading order: the week, the day in front of her, the other door, and
                her body. 70ms apart on the product's own curve — the last is home in under 600ms,
                which is the difference between composed and slow.
                ════════════════════════════════════════════════════════════════════════════════
              */}
              <Arrive order={0}>
                <Legend track={0.18}>
                  {props.weekNumber != null && props.workouts.length > 0
                    ? t('home.weekLabel', { n: props.weekNumber })
                    : `${restWeekday} · ${t('home.upNext')}`}
                </Legend>
              </Arrive>

              {/* ⚠️ ONE DERIVATION FOR THE METER AND THE SHEET (`sheetSegments`), so the rule at the
                  top of Today and the rule at the top of the sheet behind it can never disagree
                  about which session is which. */}
              {props.workouts.length > 0 ? (
                <Arrive order={0} style={styles.meter}>
                  <WeekMeter segments={sheetSegments(props.workouts, queuedId)} />
                </Arrive>
              ) : null}

              {/*
                ⛔ WHAT THE WEEK COULD NOT DO (founder 2026-08-12). The ENGINE's own honest sentence
                about her INPUTS: a day past her minutes, a day her map cannot fill, a muscle two
                days a week cannot feed. `domain/weekNotice` picks the one that matters and every
                version of it carries the remedy, which is hers.

                ⚠️ SET IN THE READING VOICE, NOT AS A WARNING. It is a fact about a choice she made,
                with something she can do about it — clay is for pain and destructive confirms and
                appears nowhere near it.
              */}
              {props.notice ? <Text style={styles.weekNotice}>{props.notice}</Text> : null}

              {/*
                ════════════════════════════════════════════════════════════════════════════════════
                ⛔ TODAY IS THE SUBJECT OF THE SCREEN (founder, 2026-08-22)
                ════════════════════════════════════════════════════════════════════════════════════

                *"להציג את האימון של היום ולעשות אפשרות של אימון אחר בלחצן או באיזשהי דרך. אני רוצה
                שהיא תיראה מה קורה היום ושתהייה לה תמונת מצב."*

                The week column answered *"where am I in the week?"* very well and answered *"what
                am I doing today?"* by making the reader find the open row among four. His
                instruction inverts the priority: the session is the page, the week is a door, and
                the status is the rule above it.

                ⚠️ AND IT KEEPS THE 08-12 RULING RATHER THAN REOPENING IT. *"One workout's contents
                belong in ONE place"* — `PreWorkout` still owns the contents: every lift, its clip,
                its reason, its doors. What stands here is the FIRST FACT — three loads and the count
                of what is behind them — and it is the same three rows the queued card has carried
                since 2026-08-18. The block gained a frame and a heading; it did not gain a table.
              */}
              {props.dayName ? (
                <Arrive order={1}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={props.dayName}
                    /* ⚠️ ANNOUNCED, NOT ONLY ENFORCED. A block that refuses a press and says nothing
                       to VoiceOver is a control that works for sighted athletes and lies to everyone
                       else — the same law the column kept while a session was resumable. */
                    accessibilityState={{ disabled: !!props.resumable || !queuedId }}
                    disabled={!!props.resumable || !queuedId}
                    onPress={() => {
                      if (props.resumable || !queuedId) return;
                      haptics.tick();
                      props.onChooseWorkout(queuedId);
                    }}
                    style={({ pressed }) => [styles.today, pressed && !props.resumable && styles.todayPressed]}
                  >
                    <View style={styles.todayHead}>
                      <Legend tone="accent" track={0.18}>{t('home.todayLabel')}</Legend>
                      <View style={styles.spacer} />
                      {/*
                        ⛔ THE COUNT IS THIS SESSION'S OWN, NEVER THE WEEK'S (founder 2026-08-12).

                        *"The pill drew `briefCount` — the WEEK's total — on the queued card only, so
                        a load the engine moved in Lower B was invisible until she opened it, and the
                        number on the card she was looking at was counting work that was not in it. A
                        count belongs to the thing it counts."*

                        ⚠️ AND SINCE 2026-08-29 THIS IS THE ONLY COUNT ON HOME. The sheet that
                        carried the other days' counts is deleted with its door (see the note at the
                        top of the file); this stays because it is the one number Today is entitled
                        to — the one on the session it is about — and because it is also the door to
                        the week's whole account, which is where the rest of them live.
                      */}
                      {!props.dayDone && todayChanges > 0 ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t('home.briefChanges', { count: todayChanges })}
                          hitSlop={8}
                          onPress={props.onWeeklyUpdate}
                          /* ⛔ A WASH, NEVER A FADE. `aPressNeverDimsWhatYouPressed` caught this the
                             minute it was written: the line was copied from the column's pill, which
                             answered a press with `opacity: 0.62` — dimming the label AND the veil
                             under it. A press changes the SURFACE. */
                          style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
                        >
                          {/* SANS, not mono — a translated sentence. `Legend` picks the face. */}
                          <Legend size={17} track={0.08} weight="semibold" tone="accent">
                            {t('home.briefChangesShort', { count: todayChanges })}
                          </Legend>
                          {/* Unread: the letter behind this pill has news she has not opened. The
                              dot clears the moment she walks in (seen is re-read on focus). */}
                          {props.letterUnseen ? <View style={styles.unreadDot} /> : null}
                        </Pressable>
                      ) : null}
                      {props.dayDone ? <Icon name="check" size={17} color={color.up} strokeWidth={2.6} /> : null}
                    </View>

                    {/* The session's name — the headline, and the thing that actually changes daily.
                        Wraps rather than truncating: an ellipsis hides the one word that tells two
                        sessions of the same family apart (founder A.15). */}
                    <Text style={styles.todayName}>{bidi(props.dayName)}</Text>

                    {/* Its shape — "5 lifts · ~50 min". Rounded to five exactly as `PreWorkoutScreen`
                        rounds it: the same session must not read as two different lengths one tap
                        apart. */}
                    {shapeLine ? <Text style={styles.todayShape}>{shapeLine}</Text> : null}

                    {/*
                      THE LOAD IS THE ONE THING THIS PRODUCT DECIDES, and it belongs on the first
                      screen she opens. Every lift of the day and its figure — the whole day since
                      2026-08-29, and still not the prescription (see the note over the deleted
                      `HEADLINE_LIFTS`). A lift the engine MOVED is lit in the direction it moved
                      (`directionTone`, founder 2026-07-29, on every screen without exception).
                    */}
                    {/*
                      ════ ⛔ THE ATHLETE IS THE FACE OF THE PRODUCT (founder, 2026-08-30) ════

                        > *"אני מרגיש שכל כך חבל שהשקענו בדמות שלנו והיא לא הפנים של המוצר. למשל
                        > במסך הHome במקום להציג את התרגילים כסטטיים כמו עכשיו אפשר להציג אנימציה
                        > מלאה של כל תרגילי האימון של אותו היום."*

                      136 rigs, depth, per-joint timing, two anatomies — and the first screen of the
                      app drew the day as a column of words. `DayInMotion` holds the argument for
                      why it is ONE figure the day passes through rather than a loop per row.

                      ⚠️ IT SITS ABOVE THE ROWS, NOT INSTEAD OF THEM. The founder's *"במקום"* is
                      about the STATIC presentation, not about the loads — the row beneath is where
                      the one number this product decides is printed, and that is the reason this
                      card exists at all. The figure says what today IS; the rows say what it costs.
                    */}
                    {props.plan && props.plan.length > 0 && !props.dayDone ? (
                      <DayInMotion
                        exerciseIds={props.plan.map((l) => l.exerciseId)}
                        figure={props.figure}
                        /* Today stays MOUNTED behind the other tabs — see the prop. */
                        paused={props.motionPaused}
                        style={styles.todayMotion}
                      />
                    ) : null}
                    {props.plan && props.plan.length > 0 && !props.dayDone ? (
                      <View style={styles.todayLifts}>
                        {props.plan.map((lift) => (
                          <Pressable
                            key={lift.exerciseId}
                            accessibilityRole="button"
                            accessibilityLabel={lift.name}
                            onPress={() => props.onForm(lift.exerciseId)}
                            style={({ pressed }) => [styles.headLift, pressed && styles.headLiftPressed]}
                          >
                            {/*
                              ⛔ NO STILL ON THE ROW, AND THAT WAS A CORRECTION (2026-08-31, looking
                              at this card in Chrome). A 34-point `MotionThumb` was added here beside
                              each name and it was wrong three ways: the founder's ask was that the
                              animation REPLACE the static presentation, not join it; at that size
                              against a 17-point name it read as a smudge rather than a movement; and
                              it put five `buildFrame` walks into every render of the app's
                              most-opened screen. The hero above carries what a body is for. The row
                              carries the NAME and the LOAD, which is what a row is good at — and
                              this card has been bitten once already by a figure column starving the
                              name (see the note at `headLiftFigure`).
                            */}
                            <Text style={styles.headLiftName}>{bidi(lift.name)}</Text>
                            {/* A pending row's figure has not landed yet, and `load: null` already
                                means BODYWEIGHT — a blank column here would be a claim, not a wait. */}
                            {/*
                              ✦ THE SCHEME IS NOT ON THIS CARD (2026-08-27) — a preview owes her
                              WHICH lifts and HOW HEAVY; sets and reps are reference, one tap away.
                              `FigureCells` passes `scheme={false}` for exactly that ruling.
                              ⛔ AND THE FIGURE IS COLUMNS NOW (design review 2026-09-01): the old
                              single end-aligned string put `kg` at four different x-positions in
                              five rows, and a bodyweight row printed nothing at all. See
                              `FigureCells` — load, unit and the bodyweight word each hold a cell,
                              so the column reads down the card like an instrument.
                            */}
                            {lift.pending ? null : (
                              <FigureCells
                                lift={lift}
                                units={props.units}
                                scheme={false}
                                loadSize={17}
                                metaSize={17}
                                changedColor={lift.changed ? directionTone(lift.changed) : null}
                                bodyweightWord={t('workout.bodyweightShort')}
                              />
                            )}
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </Pressable>
                </Arrive>
              ) : null}

              {/*
                ⛔ "אימון אחר" STOOD HERE AND IS DELETED (founder 2026-08-29): *"אפשר להוריד כי יותר
                נוח לבצע אימון אחר דרך מסך התוכנית שכבר אפשר לעשות כיום."*

                It was added on 2026-08-22 for a good reason — choosing another session was real and
                had no control — and the Program tab has since become the better answer to the same
                need: it lists the whole week with every lift and its figure, and a row opens the
                same `PreWorkout` card. Two doors onto one room, and this one showed less.

                ⚠️ AND THE 08-22 FINDING IS NOT REVERSED, only re-homed. A capability with no control
                is the app saying it does not exist; the control exists, on the tab whose whole
                subject is the week. What Today gets back is the space — which is what the card
                below now spends on the FULL day (see the note at the lift rows).
              */}

              {/*
                ════ ⛔ AND THEN IT LEFT AGAIN, THE SAME DAY, AND HE WAS RIGHT TWICE ════

                FOUNDER, 2026-08-12: *"למה במסך הTODAY יש גם את הימים וגם את תוכנית האימון שמוצגת
                למטה, וגם יש מסך PREWORKOUT?"*

                Because I put it there. I found `HomeView` never calling the `onForm` it was handed —
                three sheets behind a door that did not exist — and I fixed that by drawing the whole
                lift table on Today, then justified the duplication with a distinction he never asked
                for ("Today is the queued workout, PreWorkout is any other"). **That distinction was
                built to defend the thing I had just done**, which is the tell.

                One workout's contents belong in ONE place, and his vision names it: the week is a
                sequence, and pressing a workout raises a sheet from the bottom holding it. So the
                table is gone from here and `PreWorkout` is that sheet (`Root.tsx`, presentation:
                'modal'). Today is the week and nothing else.

                ⚠️ THE REAL FINDING SURVIVES AND IS NOT LOST IN THE REVERSAL: the wedge's door was
                shut, and it is open now on the surface that owns the lifts. `theWedgeLandsBeforeSheTrains`
                asserts it there.
              */}

              {props.startError ? <Body tone="secondary" style={styles.error}>{t('errors.general')}</Body> : null}

              {/*
                ════ THE LIVING HALF (founder, device QA 2026-08-23) ════

                *"יש כאן יותר מחצי מהמסך שהוא פשוט ריק ולא מנוצל … תן לו יותר חיים."*

                Below the act's territory, the week itself: her body wearing what she has trained,
                the closest mark on its paper card, and the week's own running figures. Facts only —
                each block draws exactly when its fact exists, so day one is quiet rather than
                padded, and every colour is one the law already grants: moss for work done (the
                choice green), paper for the mark (the Begin pill's own material), cream for words.
              */}
              {props.weekLive && props.weekLive.muscles.length > 0 ? (
                <Arrive order={3}>
                  <View style={styles.liveBlock}>
                    <Legend track={0.18}>{t('home.liveTitle')}</Legend>
                    <View style={styles.liveBody}>
                      {/* Her week, on her body — trained muscles in moss, front and back. A mirror,
                          not a control: the map edits under You, and drawing a pressable body here
                          would be a second editor (`viewOf` splits the ten across the two faces). */}
                      <View style={styles.liveFigures}>
                        <MiniBody face="front" sex={props.sex} lit={props.weekLive.muscles} height={172} />
                        <MiniBody face="back" sex={props.sex} lit={props.weekLive.muscles} height={172} />
                      </View>
                      {/*
                        ⛔ "N שרירים עבדו השבוע" IS DELETED (founder 2026-08-29): *"יש כיתוב על סוגי
                        שריר וכל מיני דברים מוזרים שלא מעניינים."*

                        Two figures stand above it with her worked muscles lit in moss. The caption
                        counted them — it told her in words the number of things she could already
                        see coloured in, which is the exact shape of the caption the 08-12 ruling
                        struck off the top of this screen (*"a screen that states a fact its own
                        content already draws is spending the fold on a caption"*), and it is the
                        founder's standing preference stated twice over: *"העדפה להראות במקום
                        לכתוב."*

                        ⚠️ NOTHING REPLACES IT, deliberately. The three figures directly below —
                        tonnes moved, calories, loads raised — are what this block has to SAY, and
                        they are facts the body drawing cannot state. Putting a different sentence
                        in the deleted one's place would be filling a hole that is better empty;
                        the block already carries its heading ("השבוע שלך עד כה") and its numbers.
                      */}
                    </View>

                    {/* The week's running figures — the rest band's own vocabulary, live. */}
                    <View style={styles.liveStats}>
                      <View style={styles.liveStat}>
                        <Text style={styles.liveStatValue}>{props.weekLive.tonnes.toFixed(1)}</Text>
                        <Legend size={17} tone="muted">{`${t('weekly.tonneUnit')} ${t('weekly.statMoved')}`}</Legend>
                      </View>
                      {props.weekLive.kcal != null ? (
                        <View style={styles.liveStat}>
                          <Text style={styles.liveStatValue}>{String(props.weekLive.kcal)}</Text>
                          <Legend size={17} tone="muted">{t('weekly.statKcal')}</Legend>
                        </View>
                      ) : null}
                      {props.weekLive.loadsUp > 0 ? (
                        <View style={styles.liveStat}>
                          <Text style={[styles.liveStatValue, { color: color.up }]}>{String(props.weekLive.loadsUp)}</Text>
                          <Legend size={17} tone="muted">{t('home.loadsUp')}</Legend>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Arrive>
              ) : null}

              {/* The closest mark, on paper — the brightest surface after the act itself. */}
              {props.nextMark ? (
                <View style={styles.markCard}>
                  <View style={styles.markText}>
                    <Legend size={textScale.base} weight="semibold" style={styles.markLabel}>{t('home.nextMarkLabel')}</Legend>
                    <Text style={styles.markTitle}>{props.nextMark.title}</Text>
                  </View>
                  <View style={styles.markFigureWrap}>
                    <Text style={styles.markFigure}>{props.nextMark.figure}</Text>
                    <View style={styles.markTrack}>
                      <View style={[styles.markFill, { width: `${Math.round(Math.min(1, Math.max(0, props.nextMark.progress)) * 100)}%` }]} />
                    </View>
                  </View>
                </View>
              ) : null}

            </View>
          )}
        </ScrollView>
        {/* ════ THE ONE ACT IS NEVER BELOW THE FOLD (founder B.5) ════
            "With many exercises the Begin button — and the free-workouts line — fall below the
            fold; it scrolls, but the athlete may simply not find Start."

            It used to live INSIDE the scroller, pushed to the bottom with `marginTop: 'auto'` —
            which put it at the foot of the CONTENT, not the foot of the SCREEN. On a four-lift day
            those are the same place, so it looked right; on an eight-lift day the only thing the
            screen exists to offer was a scroll away, under a list she had already read. Pinned
            here it is identical on a short page and present on every long one. Nothing else moved:
            it keeps its own 26 px gutter, which is what the negative margin inside the 30 px
            column was reproducing. Recovery has no act, so it draws nothing at all. */}
        {props.resting ? null : (
          <View style={styles.cta} onLayout={(e) => setCtaH(e.nativeEvent.layout.height)}>
              {/* The list continues under this footer, and until now nothing said so — the last
                  row cut mid-line at the fold and the screen read as finished, hiding "השבוע שלך
                  עד כה" and the next-milestone card on first render (design review 2026-09-01). */}
              <FooterFade />
              {props.resumable ? (
                <Button
                  variant="primary"
                  size="lg"
                  block
                  label={t('home.continueWorkout', { name: bidi(props.resumable.workoutName) })}
                  onPress={props.onResume}
                  leading={<Icon name="play" size={16} color={color.onAccent} />}
                />
              ) : props.dayDone ? (
                <View style={styles.doneRow}>
                  {/* ⛔ THE HEBREW READ `אומן השבוע` (2026-08-27), which is not what it meant.
                      `אומן` as a standalone word is far more readable as אוֹמָן — an ARTISAN — so a chip
                      standing where the Start button was, on a finished workout, said something
                      close to "artist of the week". `בוצע השבוע` states the fact and cannot be
                      read as anything else. The English (`Trained this week`) was always fine. */}
                  <Icon name="check" size={16} color={color.up} strokeWidth={2.4} />
                  <Text style={styles.doneText}>{t('program.doneThisWeek')}</Text>
                </View>
              ) : props.dayName ? (
                <Button
                  variant="primary"
                  size="lg"
                  block
                  label={t('home.begin', { name: bidi(props.dayName) })}
                  onPress={props.onStart}
                  leading={<Icon name="play" size={16} color={color.onAccent} />}
                />
              ) : null}

              {/* One quiet line under the act — never a second button competing with Begin. It
                  states where the pairing already is, so the code she read out is on the screen she
                  is looking at rather than behind a sheet she has to reopen. */}
              {/* ⛔ HIDDEN FOR A CONFLICT, NOT FOR AN EMPTY WEEK. An interrupted workout is a real
                  conflict — she has to answer it before she starts anything. A finished workout is
                  not: a GUEST needs no workout of his own, he adopts his partner's and his own
                  engine prices it, so hiding the door there would close the guest path to anybody
                  whose own week happens to be done. */}
              <TrainTogetherRow onPress={props.onTrainTogether} hidden={!!props.resumable} />

              {/* the trial — one quiet mono line under the act, gone when the trial is.

                  ⛔ TRACKING 0.1 → 0.04 (founder's screenshot, 2026-08-12). At 17px with 0.1 em of
                  tracking, "4 WORKOUTS LEFT IN YOUR TRIAL" broke across two lines with **TRIAL alone
                  on the second** — a widow, centred, directly under the one act on the screen.
                  Uppercase tracked type is what pushed it over; the type floor is not negotiable, so
                  the tracking is what gives way. */}
              {/* Only inside the last few — before that this is a countdown, not news. See
                  `TRIAL_NEWS_AT`; the standing fact lives on You's membership row. */}
              {/* ⛔ ZERO IS NEWS TOO (founder 2026-08-23): a spent trial used to say nothing here,
                  so Begin quietly opened a paywall she was never told to expect — a surprise toll
                  where a sentence belonged. One line, same quiet dress as the countdown. */}
              {props.trialLeft === 0 && !props.dayDone ? (
                <Legend size={17} track={0.04} align="center" style={styles.trialLine}>
                  {t('home.trialSpent')}
                </Legend>
              ) : null}
              {props.trialLeft != null && props.trialLeft > 0 && props.trialLeft <= TRIAL_NEWS_AT && !props.dayDone ? (
                <Legend size={17} track={0.04} align="center" style={styles.trialLine}>
                  {t('home.trialLeft', { count: props.trialLeft })}
                </Legend>
              ) : null}
          </View>
        )}
      </SafeAreaView>

    </View>
  );
}

/**
 * The measured-range mark — a hairline spanning two end ticks, struck in cream beside the wordmark
 * (the brand's range glyph). The same glyph the tab bar strikes in moss under the active tab.
 */
function RangeMark() {
  return (
    <View style={styles.mark}>
      <View style={styles.markBar} />
      <View style={[styles.markTick, styles.markTickStart]} />
      <View style={[styles.markTick, styles.markTickEnd]} />
    </View>
  );
}

/*
 * ⛔ THE FIGURE ASSEMBLY LEFT WITH THE TABLE (2026-08-05). `figureLoad`, `figureUnit`,
 * `figureScheme` and `planFigureLabel` are the one place the app decides how a prescription READS
 * — "54 kg · 4×8–10" — and they now live in `components/PlanLifts`, beside the rows they format.
 *
 * ⚠️ LEAVING A SECOND COPY HERE IS EXACTLY THE DRIFT `bandOf` HAD TO BE INVENTED TO END: two
 * ladders for one fact, eight hundred lines apart, and the shorter one winning on the screen that
 * mattered. The table is not on this screen any more; neither is its vocabulary.
 */

/*
 * ⛔ `whatIsLeftFirst` IS DELETED (2026-08-22), AND IT HAD ALREADY STOPPED BEING CALLED.
 *
 * It partitioned the week so finished sessions fell to the end of the strip (founder A.16: *"a
 * completed workout may not belong in the row of pending ones at all"*). The strip it sorted became
 * the column, the column moved behind `WeekSheet`, and nothing has called this since — a helper
 * with no caller is the same class of thing as an orphaned style, and this file has been bitten by
 * one of those before.
 *
 * ⚠️ THE RULE IT CARRIED IS NOT LOST, and it is worth saying where it went rather than assuming.
 * The week is drawn in its OWN order — Upper A · Lower A · Upper B · Lower B — on the Program tab
 * (2026-08-29; before that, in the sheet this note used to name). The strip led with what was left
 * because it was an OFFER and the offer had to come first; a week you open on purpose to find a
 * specific row in has a shape, and re-sorting it is the wrong kindness.
 */



/** One fact of the week's band — a mono figure over its sans meta label (MOVED / KCAL / LOADS UP). */
/**
 * ⛔ ONE FACT, ONE ROW (founder, 2026-08-12): *"תן למשקל שהורם, לקלוריות ולהעלאות כל שורה משל עצמו
 * אבל תעצב את זה יפה כי יהיה לך הרבה מקום."*
 *
 * They shared a 12-point band, three abreast, under a paragraph that has now gone — so the space
 * the deletion freed goes to the three facts that were crowded by it. The figure leads the row and
 * its name closes it, ruled, in the same shape the finish poster's facts take: two screens that
 * report a week and a session should not report them in two different languages.
 */
function RestFact({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <View style={styles.restFact}>
      <Text style={[styles.restFactVal, accent && styles.restFactValUp]}>{value}</Text>
      <Legend size={20} tone={accent ? 'accent' : 'muted'}>{label}</Legend>
    </View>
  );
}

/* ⚠️ Twelve style keys left with the lift table on 2026-08-05 — `plan`, `planRow`, `planName`,
   `planFigure` and the five `figure*` spans among them. They are in `components/PlanLifts` now.
   An orphaned style is what `styles.ask` became when the band graphic was deleted around it, and
   it then rendered the second largest figure on the set screen at the platform default for a week. */
/**
 * The pair's door on Home. Draws NOTHING when the build has no wire, when the caller passed no
 * handler (the gallery's fixtures), or when there is no workout to start — a door onto a room she
 * cannot use is worse than no door.
 */
function TrainTogetherRow({ onPress, hidden }: { onPress?: () => void; hidden: boolean }) {
  const { t } = useCopy();
  const pair = usePair();
  if (!onPress || !pair.ready || hidden) return null;
  const label =
    pair.stage === 'waiting' && pair.code
      ? `${t('pair.codeLabel')} · ${pair.code}`
      : pair.partnerHere
        ? (pair.partnerName ? t('pair.here', { name: bidi(pair.partnerName) }) : t('pair.hereAnon'))
        : t('pair.door');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('pair.title')}
      onPress={onPress}
      style={({ pressed }) => [homeStyles.pairRow, pressed && homeStyles.pairRowPressed]}
    >
      <Icon name="twoPeople" size={16} color={color.textTertiary} strokeWidth={2} />
      <Text style={homeStyles.pairLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const homeStyles = StyleSheet.create({
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    marginTop: 4,
  },
  pairRowPressed: { opacity: 1, backgroundColor: color.fillSubtle, borderRadius: 12 },
  pairLabel: { fontFamily: font.sans, fontSize: 17, lineHeight: 21, color: color.textTertiary, textAlign: 'center' },
});

const styles = StyleSheet.create({
  /* ════ the living half (founder 2026-08-23) ════ */
  liveBlock: { marginTop: 26, gap: 12 },
  liveBody: { alignItems: 'center', gap: 4 },
  liveFigures: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  /* ⛔ `liveCaption` IS DELETED with the sentence it dressed (2026-08-29) — see the note at the
     figures. The `gap: 4` on `liveBody` is now the gap between the two bodies and nothing, which
     is why `liveStats` keeps its own `marginTop`. */
  liveStats: { flexDirection: 'row', justifyContent: 'space-evenly', marginTop: 4 },
  liveStat: { alignItems: 'center', gap: 2 },
  // The rest band's figure voice — mono numerals, one size below the seal's count.
  liveStatValue: { fontFamily: font.mono, fontSize: 30, letterSpacing: trackingPx(30, tracking.figure), lineHeight: 36, color: color.textPrimary, textAlign: 'center' },

  /* The mark card — PAPER: the Begin pill's own material, dark ink on cream. */
  markCard: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    backgroundColor: color.paper,
    borderRadius: radius.card,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  markText: { flex: 1, gap: 4 },
  /* ⛔ The mark's label was opening its Hebrew by 1.4pt on the paper card — one of ten found
     2026-08-27. It is a `Legend`; what stays here is the ink, which is a PAPER ink and therefore
     not one of `Legend`'s four stage tones. */
  markLabel: { lineHeight: 21, color: 'rgba(26,24,21,0.62)', textAlign: 'left' },
  markTitle: { fontFamily: font.serifMedium, fontSize: 22, lineHeight: 26, color: color.onPaper, textAlign: 'left' },
  markFigureWrap: { alignItems: 'flex-end', gap: 8 },
  markFigure: { fontFamily: font.mono, fontSize: 26, letterSpacing: trackingPx(26, tracking.figure), lineHeight: 30, color: color.onPaper, textAlign: 'right' },
  /* height 3 → 4, track 0.18 → 0.30 (design review 2026-09-01): on the paper card the unfilled
     rail was a scratch, not an instrument — a meter must be readable BEFORE it fills. */
  markTrack: { width: 92, height: 4, borderRadius: 2, backgroundColor: 'rgba(26,24,21,0.30)', overflow: 'hidden' },
  markFill: { height: 4, borderRadius: 2, backgroundColor: 'rgba(26,24,21,0.82)' },

  /* The lapsed rest window. Quiet, above the week, and gone the moment she answers. */
  easeAsk: { marginBottom: 22 },
  /* A wash, never a fade — `aPressNeverDimsWhatYouPressed`. */
  headLiftPressed: { backgroundColor: color.surface },
  easeAskTitle: { fontFamily: font.serif, fontSize: 19, lineHeight: 26, color: color.textPrimary, textAlign: 'left' },
  easeAnswers: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  easeAnswer: {
    paddingVertical: 9, paddingHorizontal: 16, borderRadius: 12,
    borderWidth: 1, borderColor: color.borderControl,
  },
  easeAnswerText: { fontFamily: font.sans, fontSize: 17, color: color.textPrimary, textAlign: 'center' },
  root: { flex: 1, backgroundColor: color.bg },
  safe: { flex: 1 },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
    paddingTop: 16,
  },
  // The Together disc — the same 36-pt chrome disc grammar every stage door speaks (2026-08-24).
  togetherDisc: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(241,238,229,0.08)', borderWidth: 1, borderColor: 'rgba(241,238,229,0.12)' },
  togetherDiscPressed: { backgroundColor: 'rgba(241,238,229,0.14)' },
  // The wordmark stays LTR ("hush") in every locale rather than mirroring.
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, direction: 'ltr' },
  wordmark: { fontFamily: font.serif, fontSize: 22, color: color.textPrimary, textAlign: 'left' },
  // the range-mark beside the wordmark (cream), 26 × 11
  mark: { width: 26, height: 11 },
  markBar: { position: 'absolute', start: 0, end: 0, top: 5, height: 1.5, backgroundColor: color.textPrimary },
  markTick: { position: 'absolute', top: 0, width: 1.5, height: 11, backgroundColor: color.textPrimary },
  markTickStart: { start: 0 },
  markTickEnd: { end: 0 },
  // ════ THE SHARE DOOR IS A CONTROL, SO IT LOOKS LIKE ONE (founder A.8) ════
  /*
   * ⛔ `shareDoor` GOES WITH THE DOOR IT DRESSED (2026-08-12) — see the brand row.
   *
   * Its note is kept, because the RULE it won is general and the next thing put in that corner has
   * to obey it: *"the two-people icon is swallowed by the background — effectively invisible."* It
   * was never the colour. A 1.8-weight outline floating in a bare corner with no surface under it
   * does not register as a thing to press; the eye reads it as decoration beside the wordmark and
   * moves on. A control needs a BODY — a wash, not a ring, which would compete with the range-mark
   * opposite.
   */
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.fillSubtleStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: font.sansSemibold, fontSize: 17, color: color.textPrimary, textAlign: 'center' },

  // v7 2.1: the page's own gutter is 30; only the ACT drops to 26 (see `cta`).
  // flexGrow so the ACT can sit at the foot of a short page (the handoff's `margin-top:auto`)
  // while a long one still scrolls.
  scroll: { flexGrow: 1, paddingHorizontal: 30, paddingTop: 22, paddingBottom: 8 },
  /*
   * ⛔ `flexGrow`, NOT `flex` (2026-08-18) — the column could not overflow, only be CUT.
   *
   * `flex: 1` is `flexGrow:1 flexShrink:1 flexBasis:0%`: the block took EXACTLY the scroll
   * viewport's height and never one pixel more, so a week taller than the fold was clipped by the
   * pinned act rather than scrolled under it. `WeekColumn.week` says *"a long one overflows into
   * the scroll, which is the right thing to lose off the bottom"* — it could not, and had not been
   * able to since the column landed. Four workouts with the queued one carrying its loads is what
   * finally showed it; a six-day week would have shown it sooner and nobody had one on a device.
   *
   * `flexGrow: 1` alone keeps `flexBasis: auto` and `flexShrink: 0`, so the block still fills a
   * short screen (which is what the centring needs) and now stands at its own height on a long one.
   */
  block: { flexGrow: 1, gap: 13 },
  /* ⛔ `pressedDim` IS DELETED (2026-08-22). It was `opacity: 0.62` — the exact thing
     `aPressNeverDimsWhatYouPressed` exists to forbid — and its last caller was the change pill,
     which now answers a press with `pillPressed`. An orphaned style that breaks a law is worse
     than an orphaned style: it is a working example of the wrong answer, waiting to be reused. */

  // ── the title row ──
  /*
   * ⛔ `programWhy` IS DELETED WITH ITS PROP (2026-08-12). It drew `coachPlan.why` — a paragraph the
   * engine does not write and never will (R7, `domain/enginePlan`), so it was null on every device
   * and the only place it was ever seen was a gallery fixture that invented one.
   */
  /* The engine's own note. Sans rather than the coach's serif — it is a fact about her inputs, not
     a voice speaking to her, and the two must not be mistaken for each other. */
  weekNotice: {
    marginTop: 10,
    fontFamily: font.sans,
    fontSize: 17,
    lineHeight: 20,
    color: color.textMuted,
    textAlign: 'left',
  },
  /* ── the queued card's headline lifts (2026-08-18) ──
     Name left, figure right, on one baseline. NOT a table: no rule between rows, no clip glyph and
     no reason door — every one of those belongs to `PlanLifts` on the sheet.
     ⛔ BUT IT *IS* A PRESS TARGET (design review 2026-09-01): the row is a live button (it opens
     "למה זה כאן" — and the a11y tree says `button`), and `paddingVertical: 3` made it a 28-point
     target in a product used mid-workout. The docblock said "no press target" while the render
     disagreed; the render wins, so the row meets the 44-point floor. */
  headLift: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 11,
  },
  headLiftName: { flex: 1, fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: stage.ink1, textAlign: 'left' },
  /* The hero's own band of air. It is the one moving thing on Today, so it is given room rather
     than tucked between two text blocks — and the height is fixed so the card does not resize as
     the day cycles through lifts of different builds. */
  todayMotion: { height: 132, marginTop: 14, marginBottom: 2, alignItems: 'center', justifyContent: 'center' },
  /* ⚠️ MONO, AND IT MAY BE: this span is DIGITS — a load, a unit, "4×8–10". `monoCarriesNoWords`
     forbids the face on translated sentences because IBM Plex Mono cannot draw Hebrew at all; a
     figure has no words in it in any locale, and the numbers want the column. */
  headLiftFigure: {
    flexGrow: 0,
    flexShrink: 0,
    fontFamily: font.mono,
    /* Tabular figures, exactly as the sheet's table sets them: three loads stacked one above the
       other are a COLUMN, and proportional digits make a column that does not line up. */
    fontVariant: ['tabular-nums'],
    fontSize: 17,
    lineHeight: 22,
    textAlign: 'right',
  },
  /* The LOAD is the lit thing — the one number Hush decides. A lift the engine MOVED is tinted in
     the direction it moved (founder 2026-07-29, on every screen without exception); one it held
     stands in the reading cream, which is the same rule the sheet's table keeps. */
  headLiftLoad: { color: stage.ink0 }, // rtl-ok: nested span, inherits end-alignment from headLiftFigure
  headLiftMeta: { color: stage.ink2 }, // rtl-ok: nested span, inherits end-alignment from headLiftFigure
  /* ⛔ `headLiftMore` IS DELETED (2026-08-29) — there is no "+4 more lifts" line, because there are
     no more lifts: the card draws the day. An orphaned style is the exact class of thing this file
     has been bitten by before, so it goes with the row it dressed. */

  /*
   * ⛔ `titleRow` / `title` / `changePill` / `changeDot` / `shapeLine` WENT WITH THE ARRANGEMENT
   * THEY DRESSED (2026-08-22). They were the legacy 54px headline row, deleted from the render on
   * 2026-08-12 and left standing here for ten days — the exact shape of the `styles.ask` orphan
   * this file's own note warns about (*"an orphaned style is what `styles.ask` became when the band
   * graphic was deleted around it, and it then rendered the second largest figure on the set screen
   * at the platform default for a week"*).
   *
   * ⚠️ THE CHIP SURVIVES AS `pill`, at the head of the TODAY block, because a count still belongs
   * beside the thing it counts. It keeps the handoff's `.18` moss veil verbatim.
   */

  // ── THE WEEK'S RULE ──
  /* Its own band of air: the meter is the screen's status line and it must not read as attached to
     the eyebrow above it or to the block below. */
  meter: { marginTop: 4, marginBottom: 4 },

  // ── TODAY, THE SUBJECT (founder 2026-08-22) ──
  /*
   * ⚠️ IT IS A FRAMED SURFACE AND THE REST OF THE PAGE IS NOT, WHICH IS THE WHOLE POINT.
   *
   * The v7 law is *"nothing is a card on the stage — the stage itself is lit, and emphasis is
   * standing in that light versus resting in shadow"*, and it earned an exception the day the week
   * column landed: *"the open row of the week column is the one thing that RISES off it, which is
   * the same law spent on the one row that has an act."* That exception transfers here unchanged.
   * There is exactly one raised object on Today, it is the session she is being offered, and it is
   * the only thing on the screen with a button under it.
   */
  today: {
    marginTop: 6,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.borderControl,
    backgroundColor: color.surface,
    gap: 6,
  },
  /* A wash ON TOP, never a fade of the card — `aPressNeverDimsWhatYouPressed`. */
  todayPressed: { backgroundColor: color.surface2 },
  todayHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  spacer: { flex: 1 },
  // The letter's unread mark — moss, six points, sitting on the pill's trailing side.
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.up, marginStart: 6 },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderRadius: radius.full,
    // Row, so the unread dot (when the letter holds unopened news) sits beside the label.
    flexDirection: 'row',
    alignItems: 'center',
    // The handoff's veil for exactly this chip — heavier than the app's default moss wash.
    backgroundColor: 'rgba(169,196,159,0.18)',
  },
  /* One notch deeper, same hue: the ground moves under the press and the label does not change at
     all (`aPressNeverDimsWhatYouPressed`). */
  pillPressed: { backgroundColor: 'rgba(169,196,159,0.30)' },
  /*
   * THE HEADLINE. 38, not 54: the old figure was set when the name shared a row with a pill and had
   * the whole fold to itself. Inside a framed block with a rule above it and three loads below it,
   * 54 is the block shouting over its own contents — and it is the size at which "Bulgarian Split
   * Squat B" takes three lines. `lineHeight` is tightened relative to the size so a two-line name
   * stacks as one label rather than two rows of text.
   */
  todayName: { fontFamily: font.serif, fontSize: 38, lineHeight: 42, color: color.textPrimary, textAlign: 'left' },
  /* The shape — how much work and how long. The one line that answers "have I got time for this?",
     so it is never below the floor (founder 2026-08-03, raising it once already). */
  todayShape: { fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: color.textSecondary, textAlign: 'left' },
  /* The three loads, held off the shape line by a rule — they are a different kind of thing from
     the sentence above them, and the rule is what says so without a heading. */
  todayLifts: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },

  // ── THE DOOR ONTO THE REST OF THE WEEK ──
  /*
   * A ROW, NOT A BUTTON. A second filled control under a framed session would compete with the one
   * act at the foot of the screen, and this is not an act — it is a way to look at something else.
   * It gets a body (a wash and a radius) rather than a bare line, because the founder's standing
   * ruling on affordance is that an outline floating with no surface under it *"does not register
   * as a thing to press"* (2026-08-12, on the share door).
   */
  elseRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: radius.control,
    backgroundColor: color.fillSubtle,
  },
  elseRowPressed: { backgroundColor: color.surface2 },
  elseText: { fontFamily: font.sansMedium, fontSize: 17, color: color.textPrimary, textAlign: 'left' },

  // ── the plan table ──
  // The FIGURE is never squeezed: it is the fact the row exists for. The name shrinks and
  // truncates around it (handoff: the load span is `flex:none; white-space:nowrap`).
  // A.15 — no `numberOfLines` on the name: it WRAPS. `lineHeight` is set so a two-line name reads
  // as one label rather than two rows of text.
  // ── the figure's META: the unit and the scheme ──
  // The LOAD keeps the founder's 2026-07-28 enlargement (17 pt — "she reads it to decide whether to
  // go to the gym"). Its meta does not: the canonical handoff sets the whole figure at 13.5, and
  // once the unit joined the row (A.5) a 17 pt scheme was taking half the row's width from the
  // NAME, which is what pushed a long name onto a third line (A.15). Small meta is also the
  // hierarchy this row is supposed to have — one lit fact, everything else in shadow.
  // The unit is a caption on the number, never part of the fact the engine decided — so it wears
  // the muted tone whether or not the load moved.
  // The face only — the COLOUR is `directionTone(lift.changed)` at the call site, so this row can
  // never hold an opinion about direction that the rest of the app does not share.
  // S-3 — a quiet note, not an alarm. Sans (it carries words), secondary ink, sits under the plan.
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 4 },
  doneText: { fontFamily: font.sansMedium, fontSize: textScale.base, color: color.textSecondary, textAlign: 'left' },

  // ── the chooser (horizontal chips) ──
  chipStrip: { position: 'relative', overflow: 'hidden' },
  chipFade: { position: 'absolute', top: 0, bottom: 0, end: 0, width: 52 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4, paddingEnd: space.gutter },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  // queued = cream, standing in the light (paper pill, dark ink)
  chipCurrent: { backgroundColor: color.paper, borderColor: color.paper },
  // ── done = a RECORD, and it steps back (founder A.16; canonical v7 handoff, the wrist's week
  //    list). It used to be a filled moss pill, which is a lit state — the loudest thing in the
  //    strip was the one workout that could not be started. Now: no fill, the faintest hairline,
  //    dimmed, struck through, with the moss check carrying the whole verdict.
  chipDone: { backgroundColor: 'transparent', borderColor: color.border, opacity: 0.6 },
  // …and when the athlete taps it to re-read its plan, it comes back up to full and takes a moss
  // ring. Selected, still finished — never the cream pill of something still to do.
  chipDoneCurrent: { opacity: 1, borderColor: color.up },
  /** The weekday, quieter than the name it sits beside: a label, not the thing she is choosing. */
  /* ⛔ `chipDay` IS DELETED (2026-08-27) — it had ZERO readers, and it was tracking Hebrew by .6pt
     for none of them. Found when the type lint learned to read a style block; worth recording only
     because a dead style is how a fault stays "fixed" while nothing is drawing it either way. */
  chipText: { flexShrink: 1, fontFamily: font.sansMedium, fontSize: textScale.xs, color: color.textSecondary, textAlign: 'left' },
  chipTextDone: { color: color.textMuted, textDecorationLine: 'line-through' }, // rtl-ok: merged onto chipText, which sets textAlign
  chipTextCurrent: { fontFamily: font.sansSemibold, color: color.onPaper }, // rtl-ok: merged onto chipText, which sets textAlign

  // ── the act ──
  error: { marginTop: 4 },
  // The act drops to the 26px gutter the whole product's primary buttons sit at, and negative
  // margin walks it back out of the page's 30px column so the two agree.
  // Pinned under the scroller (B.5). The 26 px gutter every primary button in the product
  // sits at — reached directly now rather than by walking back out of the page's 30.
  cta: { paddingHorizontal: 26, paddingTop: 18, paddingBottom: 6, gap: 12 },
  trialLine: { marginTop: 4, paddingHorizontal: 4 },

  // ── recovery (v7 3.5 "THE WEEK IS DONE") ──
  restBlock: { paddingTop: 6, alignItems: 'center' },
  restEyebrow: { marginBottom: 15 },

  // the seal — a big dashed ring, its core the N/N count, a moss check at the crown
  /* ⛔ THE RING WAS INVISIBLE (founder, 2026-08-12): *"את העיגול בחלק העליון תן לו צבע, לא רואים
     בכלל ש-3/3 מוקף בעיגול."* A 1.5-point dashed hairline in `borderStrong` on black is a texture,
     not a ring — and it is the SEAL: the one mark on this screen that says the week closed. Moss,
     at 2.5, in the product's own finished colour. */
  sealRing: {
    width: 158,
    height: 158,
    borderRadius: 79,
    borderWidth: 2.5,
    borderStyle: 'dashed',
    borderColor: color.up,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealCore: {
    width: 126,
    height: 126,
    borderRadius: 63,
    backgroundColor: color.fillSubtle,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  sealCount: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 40, letterSpacing: -0.8, color: color.textPrimary, textAlign: 'center' },
  sealBadge: {
    position: 'absolute',
    top: -9,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: color.bg,
    borderWidth: 1.5,
    borderColor: color.up,
    alignItems: 'center',
    justifyContent: 'center',
  },

  restTitle: { marginTop: 15, textAlign: 'center' },

  /* The week she finished, named — the ledger that replaced the seven-day strip. Left-aligned
     inside a centred column on purpose: it is a LIST of things done, and a centred list has no
     edge for the eye to run down. */
  doneList: { alignSelf: 'stretch', marginTop: 22, paddingHorizontal: 4 },
  /* ⛔ THIS WAS ALSO CALLED `doneRow`, and it is the second one in this object — so it silently
     won, and the "Trained this week" line up at the CTA lost its `justifyContent: 'center'` and
     took this list's gap and padding instead. It sat flush against the left gutter where the Begin
     button had been centred. A duplicate key in a StyleSheet is invisible: no warning, no type
     error under `@ts-nocheck`, and the loser is whichever one was written first. */
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  doneRowRuled: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  // The index is `String(i + 1).padStart(2, '0')` — two digits, for ever, so the mono and its
  // opening are earned. Declared because mono may no longer OPEN a word without saying why
  // (`lint-rtl`, 2026-08-27); the marker rides the style line because that is the block the
  // rule reads.
  doneIndex: { width: 26, fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 17, letterSpacing: 0.8, color: color.textMuted, textAlign: 'left' }, // latin-ok
  doneName: { flex: 1, fontFamily: font.sans, fontSize: 17, color: color.textPrimary, textAlign: 'left' },
  /* A workout the week closed without: the check's own space, held empty. Not a cross and not a
     dash — nothing failed, and the row is a record rather than a verdict. */
  doneMissing: { width: 15, height: 15 },

  // the italic-serif rest note, opened by a moss range-mark
  restNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 22,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: color.border,
    alignSelf: 'stretch',
  },
  restNoteMark: { width: 18, height: 8, marginTop: 8 },
  restNoteBar: { position: 'absolute', start: 0, end: 0, top: 3.5, height: 1.5, backgroundColor: color.up },
  restNoteTick: { position: 'absolute', top: 0, width: 1.5, height: 8, backgroundColor: color.up },
  restNoteText: { flex: 1, fontFamily: font.serif, fontSize: 17, lineHeight: 24, color: color.textPrimary, textAlign: 'left' },

  // the week's facts band
  statBand: {
    alignSelf: 'stretch',
    marginTop: 26,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  /*
   * ⛔ THE SAME VOID THE FINISH POSTER HAD, IN ITS OWN COPY (2026-08-27).
   *
   * `space-between` threw the figure to one margin and its NAME to the other: on the week-done
   * screen, `46.8` ended at 87 and `טון הונף` began at 196 — a measurement and the word for what it
   * is, with the width of the screen between them. `WellDone.factRow` was built the same way and
   * has the long version of this note; the lesson that matters here is that fixing it there fixed
   * ONE COPY of it. A hand-rolled row is not caught by repairing its twin.
   *
   * The rules still run edge to edge — that is what fills the width. The words do not have to.
   */
  restFact: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  /* 22 → 44, with the room the deleted paragraph freed. These are the week's three measured facts
     and they were set at the size of the label beside them. */
  /* `-1` was -0.023em by hand; stated from the rung so it travels with the size. */
  restFactVal: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 44, lineHeight: 50, letterSpacing: trackingPx(44, tracking.figure), includeFontPadding: false, color: color.textPrimary, textAlign: 'left' },
  restFactValUp: { color: color.up },

  // NEXT — name only, no fabricated load
  nextRow: { alignSelf: 'stretch', marginTop: 16, textAlign: 'left' },
  /* ⚠️ THE 0.8 OF TRACKING IS GONE (2026-08-26). This slot draws `t('home.nextLabel')` upper-cased,
     so on the screen she opens every morning it was opening a Hebrew word. Its `rtl-ok` was granted
     for the nested-span alignment below and was quietly excusing this too — see the note in
     `lint-rtl` about an exemption only excusing what it was granted for. */
  nextLabel: { fontFamily: font.sansMedium, fontSize: 17, color: color.textMuted }, // rtl-ok: nested span, inherits textAlign from nextRow
  nextName: { fontFamily: font.sansSemibold, fontSize: 17, color: color.textPrimary }, // rtl-ok: nested span, inherits textAlign from nextRow

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, alignSelf: 'stretch' },
  restNext: { fontFamily: font.sans, fontSize: textScale.sm, color: color.textMuted, textAlign: 'left' },
});
