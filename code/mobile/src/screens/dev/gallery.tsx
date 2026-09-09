/**
 * THE v7 GALLERY — one entry per handoff screen id (WEB PREVIEW ONLY).
 *
 * Lives under `screens/dev` on purpose: that path is the app's agreed internal-debug
 * surface and is excluded from the copy/voice laws, because nothing here ships. Every
 * entry mounts a REAL screen — never a copy of one — inside fixture contexts, so what
 * the browser draws is what the device draws.
 *
 * Add an entry as each screen is built; the id must match the handoff exactly
 * (`screenshots/screens/<id>.png`), because that PNG is the acceptance test.
 */

// 

/*
 * ═══ `@ts-nocheck` IS DELIBERATE HERE, AND ONLY HERE (2026-08-23) ═══
 *
 * Every other file under `src` typechecks for real now — 233 came out from under this pragma in one
 * day and the checker found eleven live defects (a colour that does not exist, an import locale that
 * was undefined for every Hebrew athlete, the S-77 swap door that never reached its rows, a "+15
 * sec" control with no body…). This file is the one deliberate exception, and the reason is its
 * job: it mounts ~100 screens against PARTIAL fixtures. `SessionView` alone carries 45 fields;
 * typing every fixture in full would bury the two lines each one exists to show under forty noops.
 *
 * ⚠️ THE COST IS NAMED: stale fixture props — the "harness lie" this file has already paid for
 * twice — go invisible again. Mitigation: the file was swept ONCE with the pragma off before it
 * went back on, and two more lies came out (`emphases`, `programTitle`, both deleted 2026-08-12
 * and still being supplied). Sweep it again whenever a screen's props change shape.
 */
// @ts-nocheck

import React from 'react';
import { View, StyleSheet, Animated, ScrollView } from 'react-native';
import { AppContext } from '@/state/stores/appStore';
import { SessionContext } from '@/state/stores/sessionStore';
import { HushTabBar } from '@/app/HushTabBar';
import { ToastProvider, Button } from '@/components/ds';
import { Authentication } from '@/screens/onboarding/Authentication';
import { Start } from '@/screens/onboarding/Start';
import { AboutYou } from '@/screens/onboarding/AboutYou';
import { BodyMapEdit } from '@/screens/profile/BodyMapEdit';
import { ExerciseLibrary } from '@/screens/profile/ExerciseLibrary';
import { ImportPlan } from '@/screens/import/ImportPlan';
import { ImportReview } from '@/screens/import/ImportReview';
import { ConnectHealth } from '@/screens/onboarding/ConnectHealth';
import { BuildingProgramme } from '@/screens/onboarding/BuildingProgramme';
import { BuildingProgrammeView } from '@/screens/onboarding/BuildingProgrammeView';
import { ProgramCreated } from '@/screens/onboarding/ProgramCreated';
import { HomeView, type HomePlanLift } from '@/screens/home/HomeView';
import { WheelPicker } from '@/components/ds';
import { TimeStage, DistanceStage } from '@/screens/session/ItemStage';
import { coachFacts } from '@/domain/coachFacts';
import { coachRequest } from '@/domain/coachPrompt';
import { COACH_PLAN_SCHEMA, parseCoachPlan } from '@/domain/coachPlan';
import { askCoach } from '@/platform/coach/coachClient';
import { fixtureModel } from '@/data/api/fixtureModel';
import { milestoneCopy } from '@/domain/milestoneCopy';
import type { CoachDecision } from '@/domain/coachLog';
import type { CoachPlan, PlannedItem } from '@/domain/coachPlan';
import { askAfterSession } from '@/platform/coach/afterSession';
import type { Session } from '@/data/local/models';
import { db } from '@/data/local/db';
import { PreWorkoutView } from '@/screens/plan/PreWorkout';
import { SessionFlow, Logged } from '@/screens/session/SessionFlow';
import { SessionScan, SessionEarned } from '@/screens/session/WellDone';
import { WeeklyUpdate } from '@/screens/weekly/WeeklyUpdate';
import { ProgressLifts } from '@/screens/progress/ProgressLifts';
import { ProgramTabView } from '@/screens/program/ProgramTab';
import { PlanBuilderView } from '@/screens/plan/PlanBuilder';
import { addLift as builderAddLift, blankDraft as builderBlankDraft, addDay as builderAddDay, builderAdvice as builderAdviceOf } from '@/domain/planBuilder';
import { LiftDetailView } from '@/screens/progress/LiftDetail';
import { CardioReady } from '@/screens/cardio/CardioReady';
import { CardioDetail } from '@/screens/cardio/CardioDetail';
import { CardioLiveView, CardioComplete, CardioCountdown, KmMoment } from '@/screens/cardio/Cardio';
import { HistoryView } from '@/screens/history/History';
import { FreeLogView } from '@/screens/history/FreeLog';
import { WorkoutDetailView } from '@/screens/history/WorkoutDetail';
import { ProfileSheet } from '@/screens/profile/ProfileSheet';
import { Paywall } from '@/screens/subscription/Paywall';
import { ShareCardModal } from '@/screens/share/ShareCardModal';
import { NotificationAsk } from '@/screens/onboarding/NotificationAsk';
import { WelcomeBackView } from '@/screens/comeback/WelcomeBack';
import { LapsedView } from '@/screens/subscription/Lapsed';
import { OnYourWristView } from '@/screens/watch/OnYourWrist';
import { SharePlanView } from '@/screens/plan/SharePlan';
import { TogetherView } from '@/screens/together/Together';
import { PlanReceivedView } from '@/screens/plan/PlanReceived';
import { PainWhere } from '@/screens/pain/PainWhere';
import { ProgressReportView } from '@/screens/progress/ProgressReportView';
import { PausedStage } from '@/components/PausedStage';
import { RouteTrace } from '@/components/RouteTrace';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { exerciseCues, exerciseDisplayName, EXERCISES } from '@/data/exercises';
import { SwapSheet } from '@/components/SwapSheet';
import { PairStrip } from '@/components/PairStrip';
import { PairSwapSheet } from '@/components/PairSwapSheet';
import { TrainTogetherSheet } from '@/components/TrainTogetherSheet';
import type { PairView } from '@/state/stores/pairStore';
import { swapChoices } from '@/domain/swapPool';
import { tg, currentLocale } from '@/i18n';
import { WhyChangedSheet, whyProps, type WhyChangedProps } from '@/components/WhyChangedSheet';
import type { ChangedLiftCase } from '@/domain/changedLiftCase';
import { MilestoneEmblem } from '@/components/MilestoneEmblem';
import { Legend } from '@/components/ds';
import { Text } from 'react-native';
import { cream, font, stage } from '@/design/tokens';

/**
 * How a handoff screen stands, from this harness's point of view.
 *
 *   `live`   — built, and it mounts here against fixtures. Click it and look at it.
 *   `device` — built and wired IN THE APP, but it cannot mount here: it reads SQLite, GPS, the
 *              engine, or a beat that only a real session produces. Its correctness is held by the
 *              unit tests, not by this page.
 *   `todo`   — not built yet, and still wanted.
 *   `cancelled` — WITHDRAWN from the product (founder 2026-07-29).
 *
 * ⛔ AND THERE ARE NO `cancelled` ENTRIES LEFT (founder 2026-08-12, on the last one: *"לא קיים? אם
 * כן למחוק."*). The status stays in the type because the next withdrawal will want it for one
 * commit; what does not stay is the argument that used to sit here — that a withdrawn screen should
 * remain listed *"so the id is never silently reused and nobody re-derives it from the handoff as
 * missing work."*
 *
 * That was a bookkeeping argument, and it lost to the only reader this page has. **He walks the
 * index screen by screen, and every row he stops on that turns out to be nothing is a row that cost
 * him a note.** Four of them were sitting in here: the day that would not fit, the sealed block, the
 * next twelve, the widgets. Git remembers the ids; a review page is not an archive.
 */
export type ScreenStatus = 'live' | 'device' | 'todo' | 'cancelled';

export interface GalleryEntry {
  id: string;
  label: string;
  status: ScreenStatus;
  /** Why it cannot be shown here, or why it is not built. One short line. */
  note?: string;
  /**
   * ⛔ THE ID OF THE SCREEN THIS IS A **STATE** OF (founder 2026-08-12).
   *
   * *"יש 5 מסכי TODAY. מה זה?"* … *"יש כאן 3 מסכים Pre workout"* … *"יש כאן לא פחות מ9 מסכי The
   * set, למה?"*
   *
   * There are not. There is **one** Today, **one** pre-workout card and **one** set screen, and
   * between them about eighteen states worth looking at — a lift with no history, a load the engine
   * eased mid-set, a week she brought that names its own days. Every one guards a rule that has
   * broken at least once.
   *
   * The fault was never that they exist. It is that the index printed each of them as a peer of the
   * screen it belongs to, in the same type, at the same indent, with the same mark. **A page whose
   * job is "walk the product screen by screen" was answering the question "how many screens are
   * there" with a number three times too big** — and the founder spent three separate notes asking
   * what the extra ones were.
   *
   * So a state DECLARES its screen and the index nests it. Nothing is deleted, nothing is hidden,
   * and the count at the top of the page finally means screens.
   *
   * ⚠️ IT IS AN EXPLICIT FIELD RATHER THAN AN ID PREFIX, because the prefix does not carry it:
   * `2.1b` is the WHY sheet and `2.1f` is the pre-workout card — two different surfaces inside the
   * `2.1` family. Deriving the relationship from the number would have nested them under Today,
   * which is exactly the wrong answer stated confidently.
   */
  of?: string;
  render?: () => React.ReactNode;
}

/* ============================================================================
 * Fixtures — the same people and numbers the handoff draws.
 * ==========================================================================*/

const noop = () => {};
const asyncNoop = async () => {};

/**
 * ⛔ A PARTNER, FOR THE ONE FEATURE THAT CANNOT BE REVIEWED ALONE (§11.2, 2026-08-31).
 *
 * The live pair needs two phones, two Apple accounts and a gym. This is the seam that lets the row
 * be walked here instead: `PairStrip` and `TrainTogetherSheet` both take an optional `PairView`,
 * and this is the one the harness hands them. Everything in it is a value the wire really carries —
 * `domain/sharedSession`'s allow-list and nothing else — so a state that draws here is a state that
 * can happen.
 */
const pairFixture = (over: Partial<PairView> = {}): PairView => ({
  ready: true,
  signedIn: true,
  canHandOverLead: false,
  joinedByLink: false,
  stage: 'live',
  link: 'open',
  code: 'K7M2PQ',
  role: 'host',
  partnerName: 'Dana',
  partnerHere: true,
  partnerPresence: 'resting',
  /* ⚠️ THE BAR NAMES ITS LIFT, and the harness has to get that right or the row silently draws no
     number — this file carries `@ts-nocheck`, so the compiler will not say so. It must match the
     `standing.exerciseId` below, exactly as a real frame does. */
  partnerBar: { exerciseId: 'bb_bench_press', kg: 30, reps: 10 },
  plan: { v: 1, lifts: [{ exerciseId: 'bb_bench_press', sets: 4 }, { exerciseId: 'cable_row', sets: 3 }] },
  standing: {
    liftIndex: 0,
    exerciseId: 'bb_bench_press',
    turn: 'host',
    mine: true,
    mineSet: { n: 2, m: 4 },
    theirsSet: { n: 2, m: 4 },
    stale: false,
    behindOnPlan: false,
  },
  atSameStation: true,
  swapAsk: null,
  swapAnswer: null,
  failure: null,
  loadsPrivate: false,
  open: async () => 'K7M2PQ',
  join: async () => null,
  signIn: async () => true,
  invite: async () => {},
  clearJoinedByLink: noop,
  handOverLead: noop,
  leave: noop,
  setLoadsPrivate: noop,
  askSwap: noop,
  answerSwap: noop,
  clearSwapAsk: noop,
  clearSwapAnswer: noop,
  beginAsGuest: async () => 'refused',
  ...over,
});

/** Everything a screen may read off `useApp()`, with the handoff's own athlete in it. */
const appFixture = {
  booted: true,
  // The map starts with one LEAD, so 4.1 draws its moss zone and its leader line on arrival.
  profile: { id: 'p1', name: 'Erez', sex: 'male', units: 'kg', weightKg: 78, bodyMap: { Chest: 'emphasis' }, repBandByMuscle: {} },
  program: null,
  sessions: [],
  entitlement: { status: 'trial', sessionsUsed: 0 },
  /*
   * ⛔ THE REAL ENGINE, NOT AN EMPTY SEAM (founder 2026-08-12: *"מסך 1.5 Ready מציג This screen threw"*).
   *
   * This was `model: {}` under a comment claiming "every member a screen reaches for is optional
   * there, so a gallery mount cannot call one by accident". That stopped being true the day
   * `ProgramCreated` began previewing her week — it calls `generateProgram` on mount, unguarded, and
   * the gallery answered `undefined is not a function`.
   *
   * `fixtureModel` IS the deterministic engine: pure, local, no network, no key. Handing it over is
   * not a fixture pretending to be the app — it is the app, which is the only thing worth looking at.
   */
  model: fixtureModel,
  pendingName: () => 'Erez',
  setPendingName: noop,
  setPendingSex: noop,
  signIn: asyncNoop,
  // The You tab asks on every focus (2026-09-09) — an account exists in the harness.
  isSignedIn: async () => true,
  acceptConsent: asyncNoop,
  completeOnboarding: asyncNoop,
  // A screen that PERFORMS the weekly roll before it reads (WeeklyUpdate) calls this on mount.
  // Without it the harness threw an unhandled rejection on 3.1b — harmless to the render, but it
  // is exactly the kind of noise that hides the next real one.
  refreshProgram: asyncNoop,
  modeState: { completedSessions: 0 },
} as unknown as React.ContextType<typeof AppContext>;

/**
 * A live session frozen on 2.2's own set — Bench Press, set 2 of 4, 34 kg into an 8–10 band,
 * lift 1 of 6. Actions are inert: the gallery is for LOOKING at a screen, not driving it.
 */
const sessionFixture = {
  active: true,
  phase: 'SET_PRESENTED',
  displayPhase: 'SET_PRESENTED',
  paused: false,
  // The REAL catalogue entry, not a hand-written partial. The partial was missing `cues`, so the
  // Technique sheet on this page had nothing to show — and missing `capability`/`pattern`, which is
  // what the swap pool reads. A harness that lies about its data cannot test the screens that read it.
  currentExercise: EXERCISES.find((e) => e.id === 'bb_bench_press')!,
  currentExerciseId: 'bb_bench_press',
  sessionExerciseIds: ['bb_bench_press'],
  currentTarget: { exerciseId: 'bb_bench_press', setIndex: 1, recommendedWeight: 34, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
  // A lift, so the stage takes its ordinary set path. The shapes that are NOT sets have their own
  // entries below (2.2c/2.2d/2.2e) — see `itemFixture`.
  currentItem: null,
  nextItem: null,
  /* Mid-lift: no bridge is offered (a warm-up belongs at the START of an exercise) and the set has
     not run long. Stated rather than left absent — an absent field is how 2.4b came to draw a
     count control with no count in it. */
  warmupOffered: 0,
  setRunningLong: false,
  nextLiftFact: null,
  // An ordinary set: a rest follows it, so nothing is chained. 2.2k drives the superset.
  straightInto: null,
  nextExerciseId: 'bb_bench_press',
  setLabel: { n: 2, m: 4 },
  /* ⛔ `emphases` STOOD HERE with two of the coach's KEY POINTS — a surface the founder deleted on
     2026-08-12 (`sessionStore` records the deletion). The fixture went on supplying it: the third
     instance of the documented harness lie ("a fixture that supplies something the product does not
     is a screen nobody can act on"). Found the day the checker was allowed into this file. */
  reviseToday: () => 0,
  lastTime: { ago: 4, loadKg: 32.5, reps: [9, 9, 8], loads: [32.5, 32.5, 32.5] },
  /* ⚠️ TWO SETS ALREADY DONE, so the set row draws its filled slots and its ghosts. An empty array
     here would make every entry on this page look like set 1 of a lift she has never done — which
     is exactly the blindness the row was built to end. */
  setsSoFar: [9, 8],
  /* The loads she lifted them at — index-aligned with the reps above, and what the hero's delta is
     measured against when Loop 1 has moved the bar mid-lift. */
  loadsSoFar: [34, 34],
  globalProgress: { index: 1, total: 24 },
  exerciseProgress: { index: 0, total: 6 },
  nextExercise: null,
  nextTarget: null,
  nextSetLabel: { n: 3, m: 4 },
  restSeconds: 147,
  restExtraSeconds: 0,
  watchLoggedSet: null,
  startedAtMs: Date.now() - 23 * 60 * 1000 - 41 * 1000,
  toLoad: false,
  canMarkOccupied: false,
  endResult: null,
  correction: null,
  start: asyncNoop,
  startCoach: asyncNoop,
  loadResumable: async () => null,
  resumeSaved: async () => false,
  /*
   * A REAL RESULT, not `asyncNoop` (2026-07-31).
   *
   * It returned `undefined`, so the screen's `r.correction` threw the instant a set was logged and
   * the catch fired the "this set was not saved" notice — on EVERY SessionFlow entry on this page,
   * for as long as the harness has existed. It went unnoticed because the beat that followed drew
   * during the dwell BEFORE the throw, so the page still looked right.
   *
   * It stopped looking right the moment a beat needed the result: the question that closes a lift
   * (2.3b) opens only after `completeSet` resolves — deliberately, so the set is on disk first —
   * and against a throwing fixture it could never open at all. The harness could not drive the very
   * state it exists to show. Same shape as C.9, C.13 and A.6.
   */
  completeSet: async () => ({ ended: false, unlockedPortrait: false, correction: null }),
  completeItem: async () => ({ ended: false, unlockedPortrait: false }),
  editCurrentSet: noop,
  endRest: noop,
  extendRest: noop,
  pause: noop,
  resume: noop,
  finishEarly: async () => ({ ended: true, unlockedPortrait: false, correction: null }),
  swapNextExercise: noop,
  swapCurrentExercise: noop,
  markEquipmentOccupied: noop,
  publishWatchLobby: noop,
  setWatchHomeActions: noop,
  clearEndResult: noop,
  clearCorrection: noop,
  /*
   * TYPE-CHECKED, not cast (2026-07-31).
   *
   * This was `as unknown as ContextType<…>` — an escape hatch that silenced the compiler about
   * every key the fixture did NOT have. It cost exactly what that always costs: the question that
   * closes a lift shipped, the harness had no `reportEffort`, and pressing an answer on 2.3b threw
   * `session.reportEffort is not a function` — a crash TypeScript already knew about and had been
   * told to ignore. The jest test could not catch it either, because a test supplies its own mock.
   *
   * `satisfies` keeps the literal's own narrow types while making the compiler check the shape, so
   * the NEXT action added to the session's API fails the build here instead of on a founder's
   * device. Same failure as the wrist's pain report dying in a delegate literal with no
   * `reportPain` key: a contract nobody was checking.
   */
} satisfies React.ContextType<typeof SessionContext>;

/** 2.4 · REST — the same lift, 2:27 left, with Loop 1's eased load waiting on the next set. */
const restFixture = {
  ...(sessionFixture as unknown as Record<string, unknown>),
  displayPhase: 'REST_INTER',
  restSeconds: 147,
  nextExercise: { id: 'bb_bench_press', name: 'Bench Press', muscle: 'Chest', equipment: 'barbell' },
  nextTarget: { exerciseId: 'bb_bench_press', setIndex: 2, recommendedWeight: 31.5, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
  correction: { exerciseId: 'bb_bench_press', direction: 'down', from: 34, to: 31.5, reps: 5, band: [8, 10] },
  // The set she just did, so the card can say the bar MOVED (34 → 31.5) and by how much.
  loggedSets: [{ exerciseId: 'bb_bench_press', setIndex: 1, recommendedWeight: 34, recommendedReps: 8, actualWeight: 34, actualReps: 5, edited: false, persistedAt: new Date().toISOString() }],
} as unknown as React.ContextType<typeof SessionContext>;

/** 2.4b · TRANSITION REST — the crossing from Bench Press to Overhead Press. */
const crossingFixture = {
  ...(sessionFixture as unknown as Record<string, unknown>),
  displayPhase: 'REST_TRANSITION',
  restSeconds: 72,
  /*
   * ⛔ THE TWO THINGS THE CROSSING GREW ON 2026-08-31, and they are here because the harness's
   * standing sin is showing a different product than the one that ships. Without them this page
   * drew a crossing card that no athlete will ever see.
   *
   *   · `warmupOffered` — the founder's opt-in ramp. ONE bridge, because the bench before this was
   *     the day's first compound and the shoulder press is already half-warm (`warmupRamp`).
   *   · `nextLiftFact` — what the app KNOWS about the lift she is walking to. Her measured rest on
   *     it, which is the fact `factForLift` ranks first and the one no athlete knows about herself.
   *     74 seconds is a real median, not a round number, because a round number reads as a default.
   */
  warmupOffered: 1,
  nextLiftFact: { kind: 'rest', value: 74 },
  nextExerciseId: 'bb_overhead_press',
  nextExercise: { id: 'bb_overhead_press', name: exerciseDisplayName('bb_overhead_press'), muscle: 'Shoulders', equipment: 'barbell' },
  nextTarget: { exerciseId: 'bb_overhead_press', setIndex: 0, recommendedWeight: 22.5, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
  nextSetLabel: { n: 1, m: 4 },
  correction: null,
} as unknown as React.ContextType<typeof SessionContext>;

/** The bench's three rows, hers — the board's fixture (2.4r) shows a lift already done. */
const benchRows = [0, 1, 2].map((i) => ({
  exerciseId: 'bb_bench_press', setIndex: i, recommendedWeight: 34, recommendedReps: 8,
  actualWeight: 34, actualReps: 8, edited: false,
  persistedAt: new Date(Date.now() - (3 - i) * 150_000).toISOString(),
}));

/** 2.4r · the board, from a live set two lifts in. */
const boardFixture = {
  ...(sessionFixture as unknown as Record<string, unknown>),
  currentExerciseId: 'bb_overhead_press',
  currentExercise: EXERCISES.find((e) => e.id === 'bb_overhead_press')!,
  currentTarget: { exerciseId: 'bb_overhead_press', setIndex: 0, recommendedWeight: 22.5, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
  setLabel: { n: 1, m: 4 },
  setsSoFar: [],
  loadsSoFar: [],
  lastTime: null,
  loggedSets: benchRows,
  sessionExerciseIds: ['bb_bench_press', 'bb_overhead_press', 'bb_row', 'db_curl'],
  aheadExerciseIds: ['bb_row', 'db_curl'],
  sessionSetCounts: { bb_bench_press: 3, bb_overhead_press: 4, bb_row: 3, db_curl: 3 },
  movableExerciseIds: ['bb_row', 'db_curl'],
  exerciseProgress: { index: 1, total: 4 },
} as unknown as React.ContextType<typeof SessionContext>;

/**
 * 2.2i · A STEP THAT IS NOT A SET, INSIDE THE STAGE.
 *
 * 2.2f/g/h mount the three stages BARE, which is why none of them could show the thing that was
 * actually broken: `SessionFlow` never branched to any of them, so a plank arrived at the SET
 * screen. A fixture that only ever draws the destination cannot see a missing road — the same
 * lesson as 2.1's static Today. This one goes through the stage.
 */
const itemFixture = {
  ...(sessionFixture as unknown as Record<string, unknown>),
  currentExercise: null, // a movement is not in the lift catalogue, by design
  currentExerciseId: 'plank',
  currentTarget: null, // no weight, no rep band — the whole point
  currentItem: { kind: 'time', ex: 'plank', seconds: 45, say: 'Ribs down, breathe. Stop when the hips drop, not before.' },
  setLabel: { n: 2, m: 3 },
} as unknown as React.ContextType<typeof SessionContext>;

/**
 * 2.2k · A SUPERSET, SAID OUT LOUD.
 *
 * The app has always RUN these correctly — no rest inside a round — and never told the athlete.
 * From her side an intentional superset and a broken rest timer are the same screen.
 */
const supersetFixture = {
  ...(sessionFixture as unknown as Record<string, unknown>),
  straightInto: exerciseDisplayName('bb_row'),
} as unknown as React.ContextType<typeof SessionContext>;

/** 2.4e · A CROSSING INTO A RUN — the up-next card with no load to state. */
const crossingToRunFixture = {
  ...(sessionFixture as unknown as Record<string, unknown>),
  displayPhase: 'REST_TRANSITION',
  restSeconds: 72,
  nextExercise: null,
  nextExerciseId: 'run_outdoor',
  nextTarget: null,
  nextItem: { kind: 'distance', ex: 'run_outdoor', metres: 5000, say: 'Conversation pace the whole way.' },
  nextSetLabel: { n: 1, m: 1 },
  correction: null,
} as unknown as React.ContextType<typeof SessionContext>;

/** 13.1 · PAUSED — the same set, held. The pause SHEET follows `session.paused`, so the fixture
 *  has to actually be paused; a fixture whose `pause()` is a no-op can never open it. */
const pausedFixture = {
  ...(sessionFixture as unknown as Record<string, unknown>),
  paused: true,
} as unknown as React.ContextType<typeof SessionContext>;

/** 2.3b · LAST SET — the fourth set of four, just logged. */
const lastSetFixture = {
  ...(sessionFixture as unknown as Record<string, unknown>),
  setLabel: { n: 4, m: 4 },
} as unknown as React.ContextType<typeof SessionContext>;

/** A React Navigation prop pair that satisfies every screen's props and does nothing. */
function nav(params: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    navigation: {
      navigate: noop,
      goBack: noop,
      push: noop,
      pop: noop,
      replace: noop,
      setOptions: noop,
      addListener: () => noop,
      canGoBack: () => true,
    },
    route: { key: 'k', name: 'n', params },
  };
}

/**
 * A coach that answers from a script.
 *
 * The gallery has no server, and a chat screen with a dead Send button shows nothing about the one
 * thing that matters — what it feels like to send something and wait. So this drives the real
 * component with a canned reply on a real delay: the composing state is genuine, the scroll is
 * genuine, only the answer is written in advance.
 */
/**
 * THE REAL ONE. Same screen, wired to `useCoach`, talking to the deployed Worker.
 *
 * The scripted entry above answers the question "what does waiting feel like". This one answers the
 * only question that matters after that: does it work. It is here because of the lesson this project
 * keeps re-learning — **the gallery cannot see what it cannot drive.** A chat that has only ever
 * spoken to a `setTimeout` has never been seen to fail, and every interesting state of this screen
 * is a failure state.
 *
 * With no token in `.env` it shows exactly what a misconfigured build shows: her message, marked as
 * not sent. That IS the state worth looking at, and it is honest rather than a mock of honesty.
 */
/**
 * THE WEEK THE COACH ACTUALLY BUILT, read back from storage.
 *
 * Plain on purpose — the founder is designing these screens in Claude Design, and a decorated
 * placeholder is harder to replace than an undecorated one. What this is for is the question no
 * test can answer: **is the programme any good?** A count on the chat screen proves it parsed. This
 * shows the week, in the coach's own vocabulary, so a human can disagree with it.
 *
 * It reads what `db.recordCoachAnswer` wrote, so it is also the proof that the seam ran.
 */
/**
 * THE POST-SESSION CALL, drivable.
 *
 * This is the call the whole product is built around, and until now it could only happen by
 * finishing a real workout on a real phone — which is to say it could not be looked at. A press
 * here sends a finished session to the live coach and shows exactly what came back, including the
 * failure states, which are the ones nobody ever sees before they ship.
 *
 * The session below is a real one: she was told 8 and did 12, twice, at the same load. That is the
 * simplest case where a coach must do something, so a reply that changes nothing is a finding.
 */
function AfterSessionProbe() {
  const [state, setState] = React.useState<string>('idle');

  const run = async () => {
    setState('asking…');
    await db.saveProfile({ sex: 'female', weightKg: 62, units: 'kg', daysPerWeek: 4, repBand: '8-10', healthConnected: false });
    const set = (i: number) => ({
      exerciseId: 'bb_bench_press', setIndex: i, recommendedWeight: 30, recommendedReps: 8,
      actualWeight: 30, actualReps: 12, edited: false, restBeforeS: 120,
      persistedAt: new Date(Date.UTC(2026, 7, 1, 17, i * 4)).toISOString(),
    });
    const finished: Session = {
      id: `probe-${Date.now()}`, programDayId: 'd1', programDayName: 'Upper A',
      startedAt: '2026-08-01T17:00:00.000Z', state: 'SAVED', earlyFinish: false, trained: true,
      sets: [set(0), set(1), set(2)],
    };
    const update = await askAfterSession(finished);
    const plan = await db.loadCoachPlan();
    setState(
      [`outcome: ${update.outcome}${update.trouble ? ` (${update.trouble})` : ''}`,
       update.say ? `

“${update.say}”` : '',
       plan ? `

stored: ${plan.sessions.length} sessions · ${plan.notes?.length ?? 0} reasons` : '',
      ].join(''),
    );
  };

  return (
    <View style={{ padding: 16, gap: 14 }}>
      <Button label="Finish a workout and ask the coach" onPress={() => { void run(); }} />
      <Text style={{ color: cream[1], fontSize: 17 }}>{state}</Text>
      <Text style={{ color: cream[2], fontSize: 17 }}>
        Told 8, did 12, three sets at 30 kg. A reply that changes nothing here is a finding.
      </Text>
    </View>
  );
}

function StoredCoachWeek() {
  const [plan, setPlan] = React.useState<CoachPlan | null | undefined>(undefined);
  React.useEffect(() => { void db.loadCoachPlan().then(setPlan); }, []);

  const label = (i: PlannedItem): string => {
    if (i.kind === 'reps') return `${i.reps[0]}–${i.reps[1]} reps${i.load != null ? ` @ ${i.load} kg` : ''}`;
    if (i.kind === 'time') return `${i.seconds}s${i.load != null ? ` @ ${i.load} kg` : ''}`;
    if (i.kind === 'distance') return `${i.metres} m`;
    return '—';
  };

  if (plan === undefined) return <Text style={sw.dim}>reading…</Text>;
  if (!plan) return <Text style={sw.dim}>Nothing stored yet. Have a conversation in 0.1a first.</Text>;

  return (
    <ScrollView contentContainerStyle={sw.page}>
      {plan.sessions.map((session, si) => (
        <View key={si} style={sw.session}>
          <Text style={sw.name}>{session.day ? `${session.day} · ` : ''}{session.name}</Text>
          {session.blocks.map((b, bi) => (
            <View key={bi} style={sw.block}>
              <Text style={sw.rounds}>
                {b.rounds}× {b.restS != null ? `· ${b.restS}s between` : ''}
              </Text>
              {b.items.map((item, ii) => (
                <View key={ii}>
                  <Text style={sw.item}>{item.ex} — {label(item)}</Text>
                  {/* The instruction. It has no field anywhere in the old `Slot`, which is exactly
                      why the plan is stored whole rather than converted. */}
                  {item.say ? <Text style={sw.say}>“{item.say}”</Text> : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}
      {plan.notes?.length ? (
        <View style={sw.session}>
          <Text style={sw.name}>Why</Text>
          {plan.notes.map((n, i) => (
            <Text key={i} style={sw.say}>{n.ex ? `${n.ex}: ` : ''}{n.say}</Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const sw = StyleSheet.create({
  page: { padding: 16, gap: 18 },
  session: { gap: 8 },
  name: { color: cream[0], fontSize: 17, fontWeight: '600' },
  block: { gap: 2, paddingStart: 10 },
  rounds: { color: cream[2], fontSize: 17 },
  item: { color: cream[1], fontSize: 17 },
  /* The harness's own debug list — not a shipped surface, so it keeps the slant as a cheap
     differentiator. `rtl-ok` because `lint-rtl` reads this file too and the ban is about the
     PRODUCT's voice: no italic face is loaded, so a shipped italic is a shear. */
  say: { color: cream[2], fontSize: 17, fontStyle: 'italic' }, // latin-ok
  dim: { color: cream[2], fontSize: 17, padding: 16 },
});

/**
 * ════ THE ADVERSARIAL PROBE — dev only, and it earns its place ════
 *
 * The founder asked whether someone can get the coach to talk about things that have nothing to do
 * with training, and said it needs testing properly. Properly means MANY attempts, INDEPENDENT of
 * each other — an attempt that inherits the previous conversation is not the same attempt — and it
 * means the real prompt, not a reconstruction of it.
 *
 * Typing them one at a time into the screen gives neither: the thread accumulates, and each round
 * trip is twenty seconds. This fires each attempt as its own single-turn conversation, in parallel,
 * through the same `coachRequest` the app builds. `__DEV__` only; the gallery is a dev route and
 * this never reaches a build she can open.
 */
function installProbe() {
  if (!__DEV__) return;
  (globalThis as unknown as { __probe?: unknown }).__probe = async (message: string, language = 'en') => {
    const facts = coachFacts({
      profile: { sex: 'female', weightKg: 62, units: 'kg', daysPerWeek: 4, repBand: '8-10', healthConnected: false },
      plan: null,
      history: [],
      language,
    });
    const reply = await askCoach(
      coachRequest({ facts, ask: { kind: 'chat', turns: [{ from: 'her', text: message }] } }),
      COACH_PLAN_SCHEMA as unknown as Record<string, unknown>,
    );
    if (!reply.ok) return `NO ANSWER: ${reply.reason}`;
    const parsed = parseCoachPlan(reply.text, facts);
    if (!parsed.ok) return `UNREADABLE: ${parsed.reason}`;
    return { say: parsed.answer.say, attachedAProgramme: parsed.answer.plan != null, out: reply.usage?.candidatesTokenCount ?? null };
  };
}

/** The stage's own ground — `SessionFlow.root`. A stage component drawn on white is not the screen. */
function OnStage({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: stage[0] }}>{children}</View>;
}

function InApp({ children, session = sessionFixture }: { children: React.ReactNode; session?: React.ContextType<typeof SessionContext> }) {
  return (
    <AppContext.Provider value={appFixture}>
      <SessionContext.Provider value={session}>
        <ToastProvider>{children}</ToastProvider>
      </SessionContext.Provider>
    </AppContext.Provider>
  );
}

/**
 * The four peer surfaces sit UNDER the bottom bar, and the bar belongs to the navigator — not to
 * the screen. A gallery mount has no navigator, so a tab screen shown bare is missing the one piece
 * of chrome it always ships with. This puts the REAL `HushTabBar` back under it, with a minimal
 * navigation state, so what the browser draws is what the device draws.
 */
function UnderTabs({ active, children }: { active: number; children: React.ReactNode }) {
  const routes = ['Today', 'Program', 'Cardio', 'Progress', 'You'].map((name) => ({ key: name, name }));
  const tabProps = {
    state: { index: active, routes },
    navigation: { emit: () => ({ defaultPrevented: false }), navigate: noop },
    descriptors: {},
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  } as Record<string, unknown>;
  return (
    <View style={styles.underTabs}>
      <View style={styles.tabScene}>{children}</View>
      {React.createElement(HushTabBar as never, tabProps as never)}
    </View>
  );
}

const styles = StyleSheet.create({
  underTabs: { flex: 1 },
  tabScene: { flex: 1 },
  // 3.4b fires OVER the running stage; the harness gives it the same dark ground to land on.
  kmStage: { flex: 1, backgroundColor: stage[0] },
});

/** The four kilometres 3.4 / 3.4b / 3.4c all read. */
const runSplits = [
  { km: 1, durationSec: 362, paceSec: 362, gait: 'run' as const, kcal: 72 },
  { km: 2, durationSec: 371, paceSec: 371, gait: 'run' as const, kcal: 72 },
  { km: 3, durationSec: 384, paceSec: 384, gait: 'run' as const, kcal: 72 },
  { km: 4, durationSec: 379, paceSec: 379, gait: 'run' as const, kcal: 72 },
];

/** The closing summary 2.5 reads — the handoff's own Upper A: 52 minutes, finished whole. */
const sessionSummary = {
  workoutName: 'Upper A',
  sets: 21,
  progressed: 2,
  durationMs: 52 * 60 * 1000,
  earlyFinish: false,
  startedAtMs: Date.now() - 52 * 60 * 1000,
  trained: true,
};

/**
 * The onboarding answers 0.0e and 1.5 read her week out of.
 *
 * ⛔ TWO KEYS IN IT WERE FICTION, AND `@ts-nocheck` ON THIS FILE IS WHY (founder 2026-08-12, on
 * 0.0e: *"למה זה ניראה רע ומשעמם וכל כך חסר חיים?"*).
 *
 *   · `bodyweightKg` — there is no such field. `OnboardingInputs.weightKg` is the one every screen
 *     reads, so the bodyweight ruler on 0.0e counted from zero **to zero**, forever.
 *   · `units: 'metric'` — `Units` is `'kg' | 'lb'`, and `unitLabel` returns its argument. The ruler
 *     was labelled **"0 metric"**.
 *
 * Neither is a fixture detail: they are the two numbers movement one is entirely made of, so the
 * screen he was asked to judge had nothing in it to look at. TypeScript knew about both and had
 * been told, at the top of this file, not to mention it.
 *
 * ⚠️ AND IT NOW CARRIES HER MAP, because `generateProgram` reads it — without one, 1.5 and 0.0e
 * previewed a week with no emphasis in it while `appFixture.profile` marks her chest.
 */
const onboardingInputs = {
  name: 'Erez',
  sex: 'male',
  units: 'kg',
  daysPerWeek: 4,
  weightKg: 78,
  bodyMap: { Chest: 'emphasis' },
  healthConnected: false,
} as never;

/** 2.1b / 2.1c / 2.1d — the same argument, three verdicts. Straight from the handoff's own copy. */
/*
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE WHOLE SHEET WAS BEING REVIEWED IN ENGLISH (2026-08-27).
 *
 * `2.1b`, `2.1j` and `2.1k` hand-wrote every string on the WHY sheet: the lift's name, both dates,
 * the serif headline, the band's verdict and the coach's paragraph. On glass, in a Hebrew app, the
 * only Hebrew on the screen was the chrome — the legend, the chip and the dismiss.
 *
 * ⚠️ AND THE PRODUCT BUILDS ALL OF IT. `whyProps` is that function and its own header says why it
 * exists: *"the only work here is LANGUAGE … BOTH doors into the argument must produce the same
 * words from the same case. Two presenters would be two voices."* The harness was the third voice.
 *
 * These are cases now, run through `whyProps` exactly as Today and the Saturday letter run theirs —
 * so the sheet is reviewed in whatever language the reviewer has toggled, at the lengths that
 * language actually produces. `line` stays literal text because that is what the type says a
 * COACH's reason is; it is written in her language, which is the whole point.
 *
 * ⚠️ FUNCTIONS, NOT CONSTS. `whyProps` calls `t`, and a const at module scope resolves before
 * i18next has its resources — the trap that left `todayView`'s milestone card drawing an empty
 * title for days. See the note over `progressView`.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
const whyCase = (over: Partial<ChangedLiftCase>): ChangedLiftCase => ({
  exerciseId: 'bb_row',
  verdict: 'up',
  from: '44',
  to: '47.5',
  unit: 'kg',
  delta: '+3.5',
  band: [8, 10],
  line: { text: 'שני אימונים, כל חזרה בתוך 8–10. זה הסימן להעלות — אז העליתי, בצעד הכי קטן שיש.' },
  sessions: [
    { at: '2026-07-15T17:00:00.000Z', figure: '44 × 9·9·8', reached: false },
    { at: '2026-07-18T17:00:00.000Z', figure: '44 × 10·10·10', reached: true },
  ],
  ...over,
});

const whyRaised = (): WhyChangedProps => ({ ...whyProps(whyCase({}), tg, currentLocale()), onClose: noop });

const whyHeld = (): WhyChangedProps => ({
  ...whyProps(
    whyCase({
      exerciseId: 'bb_bench_press',
      verdict: 'hold',
      from: null,
      to: '44',
      delta: null,
      line: { text: 'שני האימונים נשארו בתוך 8–10 — אבל אף אחד מהם לא הגיע לקצה העליון פעמיים. אז אני משאיר. תגיעי לקצה, והמשקל עולה.' },
      sessions: [
        { at: '2026-07-15T17:00:00.000Z', figure: '44 × 8·8·7', reached: false },
        { at: '2026-07-22T17:00:00.000Z', figure: '44 × 9·8·8', reached: false },
      ],
    }),
    tg,
    currentLocale(),
  ),
  onClose: noop,
});

const whyEased = (): WhyChangedProps => ({
  ...whyProps(
    whyCase({
      exerciseId: 'bb_back_squat',
      verdict: 'down',
      from: '60',
      to: '57.5',
      delta: '−2.5',
      line: { text: 'החזרות ירדו מתחת לטווח בשתי הפעמים. שני אימונים מתחת לרצפה הם הסימן שלי להוריד — אז הורדתי, בצעד הכי קטן שיש. בלי לנחש למה; תחזירי את הטווח והמשקל חוזר.' },
      sessions: [
        { at: '2026-07-15T17:00:00.000Z', figure: '60 × 6·6·5', reached: false },
        { at: '2026-07-22T17:00:00.000Z', figure: '60 × 6·5·5', reached: false },
      ],
    }),
    tg,
    currentLocale(),
  ),
  onClose: noop,
});

/**
 * 2.6 · MILESTONE — the seal, at the size and rhythm the handoff draws it.
 *
 * ⛔ IT WAS THE HARNESS LIE AGAIN, IN THE ONE PLACE IT HURTS MOST (2026-08-27).
 *
 * The note over `progressView` names this exact fault and its cure: hardcoded English marks made the
 * Progress page *"read as a localisation defect it does not have"*, and it was closed *"by calling
 * the product's own function and letting it answer in whatever language the reviewer is reading."*
 * That fix stopped at the Progress marks. This entry — **the milestone moment itself, the one
 * licensed loud moment in the app** — went on being reviewed as `MILESTONE` / `workouts` /
 * `Ten workouts. You kept coming.` on a Hebrew page.
 *
 * ⚠️ AND IT WAS SHOWING A SCREEN THE PRODUCT DOES NOT PRODUCE. `meta` was a hand-written
 * `21.4 T MOVED · 8 RAISES · 3 WEEKS`; `WellDone`'s milestone beat draws `MEASURED · <date>` and
 * nothing else, carries a `sub` line for the tonnage marks, and ends in a Continue button. Three
 * differences, none of them reviewable, on the beat the whole app builds toward.
 *
 * So it takes a `Milestone` now, exactly as `WellDone` does, and asks `milestoneCopy` — the same
 * function, the same keys, the same answer. The only thing still local is the date, because the
 * product reads it off `celebration.earnedAt` and a fixture has to say when.
 */
function MilestoneBeat({ mark, earnedAt }: { mark: Parameters<typeof milestoneCopy>[0]; earnedAt: string }) {
  const mc = milestoneCopy(mark, tg, 'kg');
  return (
    <View style={milestoneStyles.body}>
      <Legend size={17} track={0.24} align="center" tone="onStage">{tg('milestones.legend')}</Legend>
      <View style={milestoneStyles.seal}>
        <MilestoneEmblem size={216} onStage pulse value={mc.value} caption={mc.caption} glyph={mc.glyph} />
      </View>
      <View style={milestoneStyles.words}>
        <Text style={milestoneStyles.title}>{mc.title}</Text>
        {mc.sub ? <Text style={milestoneStyles.sub}>{mc.sub}</Text> : null}
        {/* MEASURED · 17 JULY 2026 — the mark is a record, and a record is dated. */}
        <Legend size={17} track={0} weight="regular" align="center" tone="onStage">
          {`${tg('milestones.measured')} · ${earnedAt}`}
        </Legend>
      </View>
    </View>
  );
}

const milestoneStyles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, marginTop: -20, backgroundColor: stage[0] },
  seal: { marginTop: 30, marginBottom: 30 },
  words: { alignItems: 'center', gap: 10 },
  title: { fontFamily: font.serif, fontSize: 40, lineHeight: 46, color: stage.ink0, textAlign: 'center' },
  sub: { fontFamily: font.sans, fontSize: 17, color: stage.ink1, textAlign: 'center' },
});

/** 3.2 · PROGRESS — LIFTS. The handoff's own six weeks: 186 t, 38 raises, 18 workouts. */
/*
 * ⛔ THESE TWO ARE FUNCTIONS, AND THAT IS NOT A STYLE CHOICE (2026-08-27).
 *
 * Both build copy through `milestoneCopy(…, tg, …)`, and as module-level JSX they were evaluated
 * at IMPORT time — before i18next has its resources. `tg` calls `i18next.t` directly, so every
 * milestone string in both fixtures resolved to the empty string. Measured on `2.1c`: the next-mark
 * card drew its label, its progress rule and its figure around **a title 184 points wide with
 * nothing in it.**
 *
 * ⚠️ AND IT LOOKED LIKE THE FIX HAD WORKED. The note over `progressView` closed the hardcoded-
 * English marks by calling the product's own function — correct, and it has been returning nothing
 * ever since, which reads as "no title on this seal" rather than as a broken fixture. A harness
 * that fails silently is worse than one that fails: it is trusted.
 *
 * Called at RENDER, they resolve against a loaded locale like every other screen.
 */
const progressView = () => (
  <ProgressLifts
    /*
     * ⛔ DERIVED FROM `milestoneCopy`, NEVER TYPED (visual sweep, 2026-08-24). These three marks were
     * hardcoded English — "WORKOUTS", "The 10-workout club", "Squat · one plate" — so the Progress
     * screen showed English captions on a Hebrew page and read as a localisation defect it does not
     * have: the product builds every one of them through `t('milestones.*')`. Same harness lie as the
     * exercise names, in a shape the name law cannot see, so it is closed the same way — by calling
     * the product's own function and letting it answer in whatever language the reviewer is reading.
     */
    marks={{
      earned: [
        { ...milestoneCopy({ id: 'count_10', family: 'count', value: 10 }, tg, 'kg') },
        { ...milestoneCopy({ id: 'club_bb_back_squat_60', family: 'club', value: 60, exerciseId: 'bb_back_squat' }, tg, 'kg') },
      ],
      next: { ...milestoneCopy({ id: 'count_25', family: 'count', value: 25 }, tg, 'kg'), progressLabel: '18/25' },
    }}
    loaded
    units="kg"
    /* ⚠️ `deltaKg` and `currentKg` ARE THE FIGURES THE PAGE NOW LEADS WITH — this fixture carried
       neither, so the claim read every lift as "not moved" and the harness drew the starting-point
       state over a set of obvious gains. A fixture missing the newest field is how a redesign gets
       reviewed against the wrong screen. */
    entries={[
      { exerciseId: 'bb_row', mode: 'weight', initialPeakKg: 40, periodPeakKg: 47.5, currentKg: 47.5, deltaKg: 7.5, series: [40, 41, 44, 44, 47.5] },
      { exerciseId: 'bb_bench_press', mode: 'weight', initialPeakKg: 30, periodPeakKg: 41, currentKg: 41, deltaKg: 11, series: [30, 34, 34, 38, 41] },
      { exerciseId: 'bb_deadlift', mode: 'weight', initialPeakKg: 70, periodPeakKg: 92.5, currentKg: 92.5, deltaKg: 22.5, series: [70, 80, 85, 90, 92.5] },
    ] as never}
    aggregate={{
      liftedKg: 186000,
      workouts: 18,
      weeks: 6,
      kcal: 82000,
      raises: 38,
      cardioKm: 32,
      // ⛔ 18 workouts at ~55 min + the runs. The fixture had no `minutes` and the board drew the
      // word "undefined" at 44 points — a fixture that cannot produce a field is how a field ships
      // unlooked-at, which is this file's oldest lesson.
      minutes: 1180,
      weeklyTonnes: [7.9, 7.2, 9.4, 8.8, 10.6, 10.1, 11.8, 12.4],
    } as never}
    onLog={noop}
  />
);

/** 3.2b · LIFT DETAIL — the handoff's own Barbell Row: 34 → 47.5 kg, three marks, the engine log. */
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => Date.now() - n * DAY;

const liftDetailView = (
  <LiftDetailView
    exerciseId="bb_row"
    units="kg"
    loaded
    band={[8, 10]}
    onBack={noop}
    /* Measured strength and her note (2026-09-09) — the row under the climb, and the sheet. */
    estimate={{ e1rm: 60.5, load: 47.5, reps: 8, atMs: Date.now() }}
    note="Overhand, a thumb wider than the knurling. Bar 2 by the window."
    onSaveNote={noop}
    climb={{
      mode: 'load',
      firstAtMs: daysAgo(46),
      current: 47.5,
      best: 47.5,
      points: [
        { atMs: daysAgo(46), value: 34, dayBest: 34, sessionId: 's1' },
        { atMs: daysAgo(39), value: 36, dayBest: 36, sessionId: 's2' },
        { atMs: daysAgo(32), value: 38, dayBest: 38, sessionId: 's3' },
        { atMs: daysAgo(25), value: 40, dayBest: 40, sessionId: 's4' },
        { atMs: daysAgo(18), value: 42.5, dayBest: 42.5, sessionId: 's5' },
        { atMs: daysAgo(11), value: 42.5, dayBest: 42.5, sessionId: 's6' },
        { atMs: daysAgo(4), value: 44, dayBest: 44, sessionId: 's7' },
        { atMs: Date.now(), value: 47.5, dayBest: 47.5, sessionId: 's8' },
      ],
    }}
    moments={[
      { kind: 'best', value: 47.5, atMs: Date.now() },
      {
        kind: 'club',
        value: 40,
        atMs: daysAgo(25),
        milestone: { id: 'club_bb_row_40', family: 'club', value: 40, exerciseId: 'bb_row', earnedAt: new Date(daysAgo(25)).toISOString(), sessionId: 's4' },
      },
      { kind: 'origin', value: 34, atMs: daysAgo(46) },
    ]}
    changes={[
      { atMs: Date.now(), loadFrom: 44, loadTo: 47.5, decision: 'progress' },
      { atMs: daysAgo(4), loadFrom: 42.5, loadTo: 44, decision: 'progress' },
      { atMs: daysAgo(11), loadFrom: 42.5, loadTo: 42.5, decision: 'hold' },
      { atMs: daysAgo(18), loadFrom: 40, loadTo: 42.5, decision: 'progress' },
      { atMs: daysAgo(25), loadFrom: 38, loadTo: 40, decision: 'progress' },
      { atMs: daysAgo(32), loadFrom: 36, loadTo: 38, decision: 'progress' },
      { atMs: daysAgo(39), loadFrom: 34, loadTo: 36, decision: 'progress' },
      { atMs: daysAgo(46), loadFrom: null, loadTo: 34, decision: 'seed' },
    ]}
  />
);

/** 3.6b · PROGRESS — DAY ONE. History has been READ and it is empty; that is the whole screen. */
const progressDayOne = <ProgressLifts loaded units="kg" entries={[]} aggregate={null} onLog={noop} />;

/** 3.3c · CARDIO RECORD — the handoff's own Friday run: 4.2 km, 26:14, four splits.
 *  A factory, not a constant: `mount` is declared below and a const would read it in its TDZ. */
const cardioRecord = () => mount(CardioDetail, {
  activity: {
    id: 'c1',
    kind: 'cardio',
    gait: 'run',
    startedAt: new Date(daysAgo(1)).toISOString(),
    durationSec: 26 * 60 + 14,
    distanceKm: 4.2,
    calories: 318,
    avgHr: 141,
    splits: [
      { km: 1, durationSec: 362, paceSec: 362, gait: 'run' },
      { km: 2, durationSec: 371, paceSec: 371, gait: 'run' },
      { km: 3, durationSec: 384, paceSec: 384, gait: 'run' },
      { km: 4, durationSec: 379, paceSec: 379, gait: 'run' },
    ],
    // The route — so the record's MAP (Apple Maps on device; the engraved RouteTrace fallback on
    // this web harness) has a shape to draw. A seafront out-and-back, plausible and fictional.
    route: [
      { lat: 32.08000, lon: 34.76920 },
      { lat: 32.08085, lon: 34.76940 },
      { lat: 32.08169, lon: 34.76957 },
      { lat: 32.08248, lon: 34.76969 },
      { lat: 32.08322, lon: 34.76978 },
      { lat: 32.08390, lon: 34.76983 },
      { lat: 32.08450, lon: 34.76985 },
      { lat: 32.08501, lon: 34.76985 },
      { lat: 32.08544, lon: 34.76982 },
      { lat: 32.08578, lon: 34.76978 },
      { lat: 32.08606, lon: 34.76973 },
      { lat: 32.08627, lon: 34.76968 },
      { lat: 32.08643, lon: 34.76962 },
      { lat: 32.08656, lon: 34.76958 },
      { lat: 32.08668, lon: 34.76954 },
      { lat: 32.08680, lon: 34.76952 },
      { lat: 32.08696, lon: 34.76952 },
      { lat: 32.08716, lon: 34.76954 },
      { lat: 32.08741, lon: 34.76958 },
      { lat: 32.08774, lon: 34.76964 },
      { lat: 32.08815, lon: 34.76972 },
      { lat: 32.08865, lon: 34.76982 },
      { lat: 32.08922, lon: 34.76993 },
      { lat: 32.08988, lon: 34.77005 },
      { lat: 32.09061, lon: 34.77017 },
      { lat: 32.09139, lon: 34.77029 },
      { lat: 32.09222, lon: 34.77041 },
      { lat: 32.09307, lon: 34.77051 },
      { lat: 32.09392, lon: 34.77059 },
      { lat: 32.09476, lon: 34.77065 },
      { lat: 32.09557, lon: 34.77067 },
      { lat: 32.09633, lon: 34.77066 },
      { lat: 32.09702, lon: 34.77061 },
      { lat: 32.09763, lon: 34.77051 },
      { lat: 32.09816, lon: 34.77037 },
      { lat: 32.09861, lon: 34.77019 },
      { lat: 32.09898, lon: 34.76995 },
      { lat: 32.09927, lon: 34.76968 },
      { lat: 32.09949, lon: 34.76937 },
      { lat: 32.09966, lon: 34.76902 },
    ],
  },
});

/**
 * 3.3e · CARDIO RECORD — MIXED GAIT. The one shape `cardioRecord` above cannot show.
 * (`3.3d` was taken — the free-workout composer. The law that caught the collision is
 * `everyGalleryScreenIsListed`, which refuses a duplicate id rather than letting the index quietly
 * link it as `i2` and hide it.)
 *
 * ⛔ THE HARNESS DREW THE UNIFORM CASE AND ONLY THE UNIFORM CASE, which is how the defect the
 * founder walked into on 2026-09-02 stayed invisible here: every fixture split was `gait: 'run'`
 * with no `kcal`, so the gallery never rendered the repeated-constant columns that a real phone
 * rendered on every row. The columns are gone now (see `CardioDetail`), and the branch that
 * REPLACED one of them — the gait tag, which draws only when the activity actually changed gait —
 * had no address in the harness at all.
 *
 * ⚠️ THE SPLIT KCAL IS PRESENT AND DELIBERATELY IDENTICAL on the three walking kilometres (a 74 kg
 * athlete at the flat walking rate: 1 × 0.55 × 74 ≈ 41). It is stamped by `cardioRun` on every real
 * activity and it must keep reaching this screen; the point is that the screen no longer DRAWS it.
 * A fixture that omits the field cannot prove that.
 *
 * Six kilometres: run, run, walk, walk, run, walk — an interval session, or a run that got tired.
 */
const cardioRecordMixed = () => mount(CardioDetail, {
  activity: {
    id: 'c2',
    kind: 'cardio',
    gait: 'run',
    startedAt: new Date(daysAgo(3)).toISOString(),
    durationSec: 45 * 60 + 8,
    distanceKm: 6.0,
    calories: 401,
    avgHr: 133,
    avgPaceSec: 451,
    splits: [
      { km: 1, durationSec: 358, paceSec: 358, gait: 'run', kcal: 76 },
      { km: 2, durationSec: 366, paceSec: 366, gait: 'run', kcal: 76 },
      { km: 3, durationSec: 702, paceSec: 702, gait: 'walk', kcal: 41 },
      { km: 4, durationSec: 688, paceSec: 688, gait: 'walk', kcal: 41 },
      { km: 5, durationSec: 371, paceSec: 371, gait: 'run', kcal: 76 },
      { km: 6, durationSec: 723, paceSec: 723, gait: 'walk', kcal: 41 },
    ],
  },
});


/* ── 3.1 · THE SATURDAY LETTER ────────────────────────────────────────────────────────────────
 * The letter's rows are a WEEK OF ENGINE DECISIONS, so with no engine behind it the harness could
 * only ever show the empty letter — the one state it says least in. These are the handoff's own
 * week six: twelve changes, four of them large enough to lead, and Loop 3's set on the chest.
 *
 * The screen still does everything: it orders by how far each load travelled (so the reading order
 * here is Bench, Row, the volume set, then the Front Squat — the engine's rule, not the mock's
 * layout), holds the rest behind "View all 12", and opens each WHY itself.
 */
const explain = (key: string, params?: Record<string, string | number>) => ({
  key: `explain.${key}`,
  ...(params ? { params } : {}),
});
const liftRow = (exerciseId: string, from: number, to: number) => ({
  exerciseId,
  // The name is whatever the PRODUCT prints for this id, in the language the reviewer reads.
  name: exerciseDisplayName(exerciseId),
  loadKg: to,
  sets: 4,
  repRange: [8, 10] as [number, number],
  change: {
    snapshot: {
      slotId: exerciseId, exerciseId, loadFrom: from, loadTo: to, setsFrom: 4, setsTo: 4,
      rangeFrom: [8, 10] as [number, number], rangeTo: [8, 10] as [number, number], swapped: false,
    },
    explanation: {
      slotId: exerciseId,
      pattern: '',
      observation: explain(to > from ? 'progressLoad.observation' : 'reprice.observation', { ex: exerciseDisplayName(exerciseId) }),
      conclusion: explain(to > from ? 'progressLoad.conclusion' : 'reprice.conclusion'),
      action: explain(to > from ? 'progressLoad.action' : 'reprice.action', to > from ? { delta: +(to - from).toFixed(2) } : { load: to }),
      text: explain(to > from ? 'progressLoad.text' : 'reprice.text', to > from ? { ex: exerciseDisplayName(exerciseId), delta: +(to - from).toFixed(2) } : { ex: exerciseDisplayName(exerciseId), load: to }),
    },
  },
});

const letterWeek = {
  plan: {
    weekIndex: 5, // "Week six."
    at: new Date().toISOString(),
    changedCount: 12, // eleven lifts + Loop 3's set — the handoff's "Twelve changes this week"
    seen: false,
    workouts: [
      { dayId: 'd0', name: 'Upper A', groups: ['Chest', 'Back'], lifts: [
        liftRow('bb_bench_press', 34, 41),
        liftRow('bb_row', 44, 47.5),
        liftRow('bb_overhead_press', 21, 22.5),
        liftRow('lat_pulldown', 45, 47.5),
        liftRow('triceps_pushdown', 16, 17.5),
        liftRow('bb_curl', 25, 26),
      ] },
      { dayId: 'd1', name: 'Lower A', groups: ['Quads', 'Hamstrings'], lifts: [
        // The one that came DOWN: matched to what her reps showed, drawn in blue, never red.
        liftRow('front_squat', 38.5, 34),
        liftRow('bb_rdl', 60, 62.5),
        liftRow('leg_press', 120, 122.5),
        liftRow('leg_curl', 32, 34),
        liftRow('standing_calf_raise', 40, 42.5),
      ] },
    ],
    volume: [{
      muscle: 'Chest',
      setsFrom: 3,
      setsTo: 4,
      explanation: {
        slotId: 'Chest', pattern: '',
        observation: explain('volumeUp.observation', { muscle: 'Chest' }),
        conclusion: explain('volumeUp.conclusion'),
        action: explain('volumeUp.action', { muscle: 'Chest' }),
        text: explain('volumeUp.text', { muscle: 'Chest' }),
      },
    }],
  },
  band: { done: 4, planned: 4, tonnes: 46.8, kcal: 3120 },
} as never;

/**
 * …and the week the engine changed NOTHING — the letter's other face (founder note 15).
 *
 * Six weeks of her own sessions ride along, because a steady week's whole answer is drawn FROM
 * them: the standing record counts them, and the travelled lifts are read out of them. Without a
 * history the screen falls to its "too early to have proof" line, which is the state the founder
 * called robotic in the first place.
 */
/*
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE TWO HALVES OF THIS LETTER CONTRADICTED EACH OTHER (2026-08-27).
 *
 * `3.1c` drew `46.8 טון הונף` for the WEEK and, four lines below it, `18.3 טון הונף` since the first
 * day. **All-time cannot be less than one week of it.** The screen was right and the fixture was
 * not: `band` was hand-written and `history` is COMPUTED, and nobody had done the arithmetic that
 * ties them.
 *
 * The history's own numbers: six weekly sessions of 4×9 bench, 4×9 row and 3×8 press on a rising
 * load — 18,306 kg exactly, which is the 18.3 the screen printed. `band.tonnes: 46.8` was two and a
 * half times the entire history.
 *
 * ⚠️ AND `band.kcal` SAID WHAT THE FIXTURE MEANT. 3,120 kcal is four sessions' worth, and
 * `done: 4, planned: 4` says so outright — but the history carried ONE session a week. So the fixture
 * always intended four, and only the history was never built to match.
 *
 * Four a week now, and the week's tonnage is the last week's four sessions as the history actually
 * computes them: (1,242 + 1,602 + 522) × 4 = 13,464 kg. All-time follows to 73.2 t over 24 sessions,
 * and every figure on the letter is derivable from the one below it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
const steadyHistory = [0, 1, 2, 3, 4, 5].flatMap((week) =>
  [0, 1, 2, 3].map((session) => {
    const at = new Date(daysAgo(38 - week * 7 + (3 - session))).toISOString();
    const load = (base: number, step: number) => base + step * week;
    return {
      id: `sv-steady-${week}-${session}`,
      programDayId: `d${session}`,
      programDayName: 'Upper A',
      startedAt: at,
      state: 'SAVED' as const,
      trained: true,
      sets: [
        ...[1, 2, 3, 4].map((n) => ({ exerciseId: 'bb_bench_press', setIndex: n, actualWeight: load(27, 1.5), actualReps: 9, persistedAt: at })),
        ...[1, 2, 3, 4].map((n) => ({ exerciseId: 'bb_row', setIndex: n, actualWeight: load(37, 1.5), actualReps: 9, persistedAt: at })),
        ...[1, 2, 3].map((n) => ({ exerciseId: 'bb_overhead_press', setIndex: n, actualWeight: load(18, 0.75), actualReps: 8, persistedAt: at })),
      ],
    };
  }),
);

const steadyWeek = {
  plan: { weekIndex: 5, at: new Date().toISOString(), changedCount: 0, seen: false, workouts: [], volume: [] },
  /* 13.464 t — the last week's four sessions, as `steadyHistory` computes them. See the note above. */
  band: { done: 4, planned: 4, tonnes: 13.5, kcal: 3120 },
  history: steadyHistory,
} as never;

/** §9.1 — the record card: 47.5 on the row, +3.5 up from a 34 that was eight weeks ago. */
const recordCard = {
  kind: 'record' as const,
  exerciseId: 'bb_row',
  weight: 47.5,
  unit: 'kg',
  reps: 8,
  delta: 3.5,
  firstWeight: 34,
  weeksAgo: 8,
  dateMs: Date.now(),
};

/** §9.2 — the week card: four days trained, 12.4 t moved, up 5% on the week before. */
/* 9.3 — the session story (founder 2026-08-23): the workout just done, body worn, three figures. */
const sessionCard = {
  kind: 'session',
  dayName: 'Upper A',
  muscles: ['Chest', 'Shoulders', 'Triceps', 'Back', 'Biceps'],
  durationMin: 52,
  moved: 3240,
  unit: 'kg',
  kcal: 310,
  dateMs: Date.UTC(2026, 7, 23, 10, 0, 0),
  // A record set inside the workout rides the card as a LINE — never a rival card (device QA
  // 2026-08-23: the door opened on a deadlift figure instead of the workout).
  record: { exerciseId: 'bb_deadlift', weight: 55, unit: 'kg', reps: 8 },
} as const;

/* 9.4 — the run's story (founder 2026-08-23): the cardio finish, shared. Longest — the pride line. */
const cardioShareCard = {
  kind: 'cardio' as const,
  distanceKm: 6.2,
  durationSec: 37 * 60 + 41,
  avgPaceSec: 365,
  kcal: 442,
  splits: [
    { km: 1, sec: 362 },
    { km: 2, sec: 371 },
    { km: 3, sec: 384 },
    { km: 4, sec: 379 },
    { km: 5, sec: 356 },
    { km: 6, sec: 349 },
  ],
  longest: true,
  dateMs: Date.UTC(2026, 7, 23, 7, 0, 0),
};

const weekCard = {
  kind: 'week' as const,
  weekNumber: 6,
  days: [
    { trained: true, height: 0.82 },
    { trained: false, height: 0 },
    { trained: true, height: 1 },
    { trained: true, height: 0.74 },
    { trained: false, height: 0 },
    { trained: true, height: 0.9 },
    { trained: false, height: 0 },
  ],
  moved: 12400,
  unit: 'kg',
  kcal: 3120,
  deltaPct: 5,
  trainedDays: 4,
  startMs: daysAgo(6),
  endMs: Date.now(),
};

/** A saved session, as SQLite would hand it back — 3.3 and 3.3b both read one. */
const savedSession = {
  id: 'sv1',
  programDayId: 'd0',
  startedAt: new Date(daysAgo(1)).toISOString(),
  state: 'SAVED',
  earlyFinish: false,
  /*
   * ⛔ THE SETS CARRY WHAT THEY WERE PRESCRIBED AS WELL AS WHAT SHE LIFTED (2026-08-22).
   *
   * They were `[id, weight, reps]` — the performed half only — so `domain/liveCorrections` had
   * nothing to read and 3.3b could not show the one thing this product does that nothing else does.
   * The row block is now a real Loop 1 ease: she got 8, then 6 (below her band), and set 3 was
   * prescribed 41 instead of 44. The record marks that chip; the two lifts around it are untouched,
   * so the mark's ABSENCE is reviewable too.
   *
   * ⚠️ AND THE CURL IS HER OWN EDIT, DELIBERATELY: prescribed 25, she reached for the 27.5s and the
   * next set was prescribed 27.5. **Nothing was corrected**, and the record must not mark it — the
   * one case `liveCorrections` exists to get right, standing in the harness where it can be seen.
   */
  sets: [
    ['bb_bench_press', 34, 34, 9], ['bb_bench_press', 34, 34, 9], ['bb_bench_press', 34, 34, 8], ['bb_bench_press', 34, 34, 8],
    ['bb_overhead_press', 21, 21, 8], ['bb_overhead_press', 21, 21, 8], ['bb_overhead_press', 21, 21, 8],
    ['bb_row', 44, 44, 8], ['bb_row', 44, 44, 6], ['bb_row', 41, 41, 8],
    ['bb_curl', 25, 27.5, 9], ['bb_curl', 27.5, 27.5, 8],
  ].map(([exerciseId, rec, w, r], i) => ({
    exerciseId,
    setIndex: i,
    recommendedWeight: rec,
    recommendedReps: 8,
    actualWeight: w,
    actualReps: r,
    edited: rec !== w,
    persistedAt: new Date(daysAgo(1) + i * 3 * 60 * 1000).toISOString(),
  })),
} as never;

/** The engine's stamped forward loads for that session — what 3.3b prints beside each lift. */
const savedForward = {
  bb_bench_press: { loadFrom: 34, loadTo: 41 },
  bb_overhead_press: { loadFrom: 21, loadTo: 22.5 },
  bb_curl: { loadFrom: 25, loadTo: 25 },
};

/** A recorded run, for 3.3's cardio row. */
const savedRun = {
  kind: 'cardio' as const,
  id: 'cr1',
  gait: 'run',
  startedAt: new Date(daysAgo(2)).toISOString(),
  durationSec: 26 * 60 + 14,
  distanceKm: 4.2,
  calories: 318,
  avgHr: 141,
  splits: [1, 2, 3, 4].map((km) => ({ km, durationSec: 370, paceSec: 370, gait: 'run' })),
} as never;

/** §11.4 / 11.5 — the handoff's own Upper/Lower: four days, 22 lifts, one band. */
const sharedFixture = {
  v: 1 as const,
  from: 'Dana',
  days: [
    { name: 'Upper A', muscleGroups: ['Chest', 'Back', 'Shoulders'], exerciseIds: ['a', 'b', 'c', 'd', 'e', 'f'] },
    { name: 'Lower A', muscleGroups: ['Quads', 'Hamstrings', 'Glutes'], exerciseIds: ['a', 'b', 'c', 'd', 'e'] },
    /* ⛔ `'Arms'` UNTIL 2026-08-28 — a muscle group the product cannot produce. The engine files
       everything under `CANONICAL_MUSCLE_ORDER` (ten names, pinned to the locale in both
       directions by `aMuscleIsCalledWhatSheCallsIt`), and `Arms` is not one of them. It fell
       through `muscleGroupsLabel`'s `defaultValue` and drew the raw English token, so `11.4`
       showed `כתפיים · Arms · גב` — one English word among Hebrew ones, on the card she SHARES.
       The law guards the product's list against the locale; nothing guarded the harness. */
    { name: 'Upper B', muscleGroups: ['Shoulders', 'Triceps', 'Back'], exerciseIds: ['a', 'b', 'c', 'd', 'e', 'f'] },
    { name: 'Lower B', muscleGroups: ['Hamstrings', 'Quads', 'Calves'], exerciseIds: ['a', 'b', 'c', 'd', 'e'] },
  ],
  repBandByMuscle: { Chest: '8-10', Back: '8-10', Quads: '8-10' },
};

/** 3.5 · THE WEEK IS DONE — Today, on a rest day that closes a full week (4/4). */
const weekDoneView = (
  <HomeView
    onTogether={noop}
    resting
    name="Erez"
    dayName={null}
    trainedThisWeek={4}
    startError={false}
    weekNumber={6}
    units="kg"
    plan={null}
    /* ⚠️ ALL FOUR CARRY THEIR CHECK, because this is the week-COMPLETE state and the ledger that
       replaced the day strip reads `done` per workout rather than assuming the week's verdict. A
       fixture with no checks would draw four blank rows under a seal that says 4/4 — the same
       contradiction, one component later. */
    workouts={[
      { id: 'd0', name: 'Upper A', items: 6, minutes: 55, done: true },
      { id: 'd1', name: 'Lower A', items: 5, minutes: 50, done: true },
      { id: 'd2', name: 'Upper B', items: 6, minutes: 55, done: true },
      { id: 'd3', name: 'Lower B', items: 5, minutes: 48, done: true },
    ]}
    weekStats={{ tonnes: 46.8, kcal: 3120, loadsUp: 12 }}
    nextWorkoutName="Upper A"
    brief={null}
    briefCount={null}
    briefUnseen={false}
    onForm={noop}
    onStart={noop}
    onChooseWorkout={noop}
    onWeeklyUpdate={noop}
  />
);

/**
 * 2.1a · TODAY, DRIVEN — the entry the founder's build-36 items needed and 2.1 could not give.
 *
 * 2.1 is a static `HomeView` with `onChooseWorkout={noop}`, so it can show one selection and one
 * plan and nothing else. Four of his findings live in states it cannot produce:
 *
 *   A.12  the chip tap FLICKERS      — needs a real tap, and a plan read that takes a moment
 *   A.16  a done chip stays white    — needs a DONE workout that is also the selection
 *   A.15  a long name ellipsises     — needs the catalog's longest name in the list
 *   A.5   the unit is missing        — visible anywhere, but it belongs beside the other three
 *
 * So this one holds its own selection, owns a real (delayed) plan read exactly like Home.tsx does,
 * and seeds a finished workout. Tap the chips: the rows must hold their places while the figures
 * arrive, and "Push A" must never come back as the cream pill.
 */
function TodayDriven() {
  const [chosen, setChosen] = React.useState('d1');
  /* ⚠️ AN EARNED PATTERN, so tapping exercises the WEEK form. Without it this fixture would only
     ever draw the numbered column, and the day-placement rules would be undriveable here. */
  const days = React.useMemo(() => new Set(['sun', 'tue', 'thu', 'sat'] as const), []);
  const [rows, setRows] = React.useState<HomePlanLift[] | null>(null);

  const workouts = [
    // Two of them name a DAY, which is what an endurance plan looks like — and the label was
    // decided, stored and sent back to the coach for a whole build without ever being drawn.
    { id: 'd0', name: 'Push A', items: 5, minutes: 48, done: true },
    { id: 'd1', name: 'Pull A', items: 4, minutes: 52, day: 'tue', changes: 3 },
    { id: 'd2', name: 'Legs A', items: 5, minutes: 55 },
    { id: 'd3', name: 'Push B', items: 5, minutes: 50, changes: 1 },
    { id: 'd4', name: 'Pull B', items: 4, minutes: 46, done: true, day: 'sun' },
  ];

  // The day's slots — names and set counts, known synchronously (this is the whole point of A.12).
  const slots: Record<string, { exerciseId: string; name: string; sets: number; load: number | null }[]> = {
    d0: [
      { exerciseId: 'bb_bench_press', name: exerciseDisplayName('bb_bench_press'), sets: 4, load: 41 },
      { exerciseId: 'machine_shoulder_press', name: exerciseDisplayName('machine_shoulder_press'), sets: 4, load: 22.5 },
      { exerciseId: 'overhead_triceps_ext', name: exerciseDisplayName('overhead_triceps_ext'), sets: 3, load: 27.5 },
    ],
    d1: [
      { exerciseId: 'bb_row', name: exerciseDisplayName('bb_row'), sets: 4, load: 47.5 },
      // A.15's own case: the catalog's longest name, in the narrowest column it ever gets.
      { exerciseId: 'db_rdl', name: exerciseDisplayName('db_rdl'), sets: 4, load: 32.5 },
      { exerciseId: 'pull_up', name: exerciseDisplayName('pull_up'), sets: 3, load: null },
      { exerciseId: 'bb_curl', name: exerciseDisplayName('bb_curl'), sets: 3, load: 25 },
    ],
    d2: [
      { exerciseId: 'bb_back_squat', name: exerciseDisplayName('bb_back_squat'), sets: 4, load: 62.5 },
      { exerciseId: 'seated_leg_curl', name: exerciseDisplayName('seated_leg_curl'), sets: 3, load: 36.5 },
    ],
    d3: [{ exerciseId: 'incline_db_press', name: exerciseDisplayName('incline_db_press'), sets: 4, load: 24 }],
    d4: [{ exerciseId: 'lat_pulldown', name: exerciseDisplayName('lat_pulldown'), sets: 4, load: 45 }],
  };

  // The engine read, as it really behaves: a promise, one tick out. This is what used to blank the
  // list — keep the delay, so the entry can still SHOW the state the fix has to survive.
  React.useEffect(() => {
    setRows(slots[chosen].map((s) => ({ ...s, load: null, band: [8, 8] as [number, number], pending: true })));
    const id = setTimeout(
      () =>
        setRows(
          slots[chosen].map((s, i) => ({
            exerciseId: s.exerciseId,
            name: s.name,
            load: s.load,
            sets: s.sets,
            band: [8, 10] as [number, number],
            changed: i === 0 ? ('up' as const) : i === 1 ? ('down' as const) : undefined,
          })),
        ),
      450,
    );
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen]);

  const name = workouts.find((w) => w.id === chosen)!.name;
  return (
    <HomeView
      resting={false}
      name="Erez"
      dayName={name}
      dayId={chosen}
      trainedThisWeek={2}
      startError={false}
      weekNumber={11}
      units="kg"
      planMinutes={52}
      plan={rows}
      dayDone={!!workouts.find((w) => w.id === chosen)!.done}
      workouts={workouts}
      brief={null}
      briefCount={3}
      briefUnseen
      trialLeft={9}
      onForm={noop}
      onStart={noop}
      onChooseWorkout={setChosen}
      onWeeklyUpdate={noop}
    />
  );
}

/* ============================================================================
 * The gallery.
 * ==========================================================================*/

/** Screens take React Navigation props; the gallery hands them stubs. */
type AnyScreen = (props: never) => React.ReactElement | null;
const mount = (Screen: unknown, params?: Record<string, unknown>, session?: React.ContextType<typeof SessionContext>) => {
  const S = Screen as AnyScreen;
  return <InApp session={session}>{React.createElement(S as never, nav(params) as never)}</InApp>;
};

/** 2.1 · TODAY — the handoff's own Tuesday: Upper A, three changes, six lifts, ~55 min. */
const todayView = () => (
  <HomeView
    resting={false}
    name="Erez"
    /*
     * ⛔ THE SECOND AI ARTEFACT ON THIS SCREEN, AND THE ONE THE FOUNDER ACTUALLY READ.
     *
     * He asked about *"החלונית של הAI למעלה"*. The corner door was one half of it; this was the
     * other, and it is the half with words in it:
     *
     *     "Twelve weeks to the half"
     *     "You gave me a date, so the lifting serves the running and the long day is protected."
     *
     * A programme name and a paragraph of the coach's reasoning — **and the engine cannot write the
     * second one.** `domain/enginePlan` sets `title` and leaves `why` deliberately absent (R7: Hush
     * never states a reason it did not measure), and `Home.tsx` reads `coachPlan?.why ?? null`. On
     * every device in existence that italic sentence is null and draws nothing. Only this line put
     * it on a screen.
     *
     * ⚠️ THE TITLE IS REAL AND STAYS — but as the engine composes it, not as a marathon coach would:
     * `programmeName` returns the shape, the days and the muscles she leads with. Reviewing Today
     * against a headline no athlete can ever see is reviewing a different product.
     */
    /* ⚠️ THE QUEUE IS THE THIRD ROW, AND THE FIRST TWO CARRY THEIR CHECKS. The eyebrow states
       "2 OF 4 DONE" now, so the column has to agree with it — it did not, and a screen that counts
       two finished workouts above four rows with no check on any of them is contradicting itself in
       the two places she looks first. Mid-week is also simply the truest state to review Today in. */
    dayName="Upper B"
    dayId="d2"
    trainedThisWeek={2}
    startError={false}
    /* ════ the living half (founder 2026-08-23) — the week on her body + the closest mark ════ */
    weekLive={{ tonnes: 6.4, kcal: 480, loadsUp: 3, muscles: ['Chest', 'Back', 'Quads', 'Biceps', 'Hamstrings'] }}
    /* ⛔ WAS `title: 'The 25-workout club'` — hardcoded English on a Hebrew home screen. The
       note over `progressView` names this exact fault and closes it by calling the product's own
       function; that fix reached the Progress marks and not this one, so Today went on being
       reviewed with a localisation defect it does not have. `name`, not `title`: the card shows a
       mark she has NOT reached. */
    nextMark={{ figure: '18/25', title: `${milestoneCopy({ id: 'count_25', family: 'count', value: 25 }, tg, 'kg').value} ${milestoneCopy({ id: 'count_25', family: 'count', value: 25 }, tg, 'kg').caption}`, progress: 0.72 }}
    sex="female" 
    weekNumber={11}
    units="kg"
    planMinutes={55}
    /*
     * ⚠️ REAL CATALOGUE IDS. These were `bench`, `ohp`, `row`, `curl`, `push`, `ab` — six ids that
     * exist in no catalogue. Each row's press calls `onForm(exerciseId)` and the WHY sheet calls
     * `liftPlacement(exerciseId, …)`, which answers `null` for a lift it cannot find — so every
     * door on this screen opened onto nothing, on the entry that IS Today.
     */
    plan={[
      // Two raises and one ease, so Today shows the direction law in one glance.
      { exerciseId: 'bb_bench_press', name: exerciseDisplayName('bb_bench_press'), load: 41, sets: 4, band: [8, 10], changed: 'up' as const },
      { exerciseId: 'bb_overhead_press', name: exerciseDisplayName('bb_overhead_press'), load: 22.5, sets: 4, band: [8, 10], changed: 'down' as const },
      { exerciseId: 'bb_row', name: exerciseDisplayName('bb_row'), load: 47.5, sets: 4, band: [8, 10], changed: 'up' as const },
      { exerciseId: 'bb_curl', name: exerciseDisplayName('bb_curl'), load: 25, sets: 3, band: [8, 10] },
      { exerciseId: 'triceps_pushdown', name: exerciseDisplayName('triceps_pushdown'), load: 16, sets: 3, band: [8, 10] },
      { exerciseId: 'lateral_raise', name: exerciseDisplayName('lateral_raise'), load: 9, sets: 3, band: [10, 12] },
    ]}
    /* ⚠️ EVERY ROW CARRIES ITS OWN SHAPE. The week is a sequence of workouts now, and a row with
       nothing but a name is what made three quarters of it look like filler. */
    /*
     * ⛔ EVERY ROW CARRIES ITS MUSCLES AND ITS `lifts` (2026-08-22). Two of the four were `muscles:
     * ''` — a fixture state no athlete is ever in, because `Home.musclesOf` derives one for every
     * workout — and `lifts` was absent on all four, so `shapeOf` fell back to `items`, which counts
     * ROUNDS. That is exactly the 2026-08-18 defect (twenty-two exercises inside fifty-four
     * minutes), preserved in the harness the founder reviews the screen in.
     *
     * ⚠️ AND THE FIXTURE OUTLIVED THE SURFACE THAT NEEDED IT (2026-08-29). This note used to say the
     * lines mattered MORE because the week had moved into `WeekSheet`, a chooser that drew them.
     * The founder has since removed both — the sheet and the "אימון אחר" door that opened it
     * (*"יותר נוח לבצע אימון אחר דרך מסך התוכנית"*), along with the muscle captions he called
     * uninteresting. `lifts` still matters here and is still asserted: Today's own shape line reads
     * it, and falling back to `items` is the 2026-08-18 defect this fixture was corrected for.
     *
     * ⛔ ENTRY 2.1n — "the week, behind its door" — IS DELETED WITH THE SHEET. His standing rule
     * (*"I don't want a screen in the code that is supposed to appear and does not appear in the
     * gallery"*) is untouched: the surface that answers "show me another workout" is the Program
     * tab, which is filed, and choosing a day there opens the same pre-workout card.
     */
    workouts={[
      { id: 'd0', name: 'Upper A', items: 6, lifts: 6, minutes: 55, done: true },
      { id: 'd1', name: 'Lower A', items: 5, lifts: 5, minutes: 50, done: true },
      { id: 'd2', name: 'Upper B', items: 6, lifts: 6, minutes: 55, changes: 3 },
      { id: 'd3', name: 'Lower B', items: 5, lifts: 5, minutes: 48, changes: 1 },
    ]}
    brief={null}
    briefCount={3}
    briefUnseen={false}
    trialLeft={11}
    onForm={noop}
    onStart={noop}
    onChooseWorkout={noop}
    onWeeklyUpdate={noop}
    /* ⛔ `onCoach` IS GONE, AND THE NOTE THAT USED TO SIT HERE IS THE WHOLE LESSON. It read: *"without
       this the coach's door is not drawn at all — no fixture on this page ever was handed a handler."*
       True, and the right conclusion was the opposite one: **the app never hands it a handler either.**
       Handing the harness a function the product does not have did not restore a missing control, it
       manufactured one — and cost the founder a review note on 2026-08-12 asking what it was. */
  />
);

/**
 * The pre-workout card, with its header count DERIVED from the rows under it.
 *
 * Two of the three entries used to hand `shape` a hand-typed string that disagreed with their own
 * lift array. A card that announces six lifts and lists two is not a fixture detail — it is the
 * screen contradicting itself in the largest type on it.
 */
function preWorkout(p: {
  name: string;
  dayLabel?: string;
  minutes: number;
  changes?: number;
  done?: boolean;
  lifts: { exerciseId: string; name: string; load: number | null; sets: number; band: [number, number]; changed?: 'up' | 'down' }[];
}): React.ReactNode {
  return (
    <InApp>
      <PreWorkoutView
        name={p.name}
        {...(p.dayLabel ? { dayLabel: p.dayLabel } : {})}
        shape={`${p.lifts.length} LIFTS \u00b7 ~${p.minutes} MIN`}
        minutes={p.minutes}
        units="kg"
        /* ⚠️ STATED, NOT DEFAULTED. `figure` became required on `PlanLifts` on 2026-08-29, when the
           ▶ glyph became the lift's own still — precisely so a fixture cannot quietly draw a man's
           week onto a woman's body, which is the founder's 2026-08-23 finding one screen over. */
        figure="female"
        {...(p.changes != null ? { changes: p.changes } : {})}
        {...(p.done ? { done: true } : {})}
        lifts={p.lifts as never}
        onForm={noop}
        onWhy={noop}
        /* The drag (2026-09-07): offered on a day still ahead, exactly as the screen offers it. */
        {...(p.done ? {} : { onReorder: noop })}

        onStart={noop}
        onClose={noop}

      />
    </InApp>
  );
}

/* ═══════════════════════ the week she owns: the Program tab and the pen ═══════════════════════ */

/*
 * ⛔ BOTH OF THESE WERE IMPORTED AND MOUNTED BY NOTHING (found 2026-08-29). `PlanBuilderView`,
 * `ProgramTabView` and the four builder verbs sat in this file's import block with no entry using
 * them — so the screen that is now ONBOARDING STEP 3, and the tab whose whole subject is her week,
 * were both invisible to the one page the founder reviews screens on.
 *
 * ⚠️ HIS RULE IS THE OLDEST ONE IN THIS FILE (2026-08-02): *"I don't want a screen in the code that
 * is supposed to appear and does not appear in the gallery."* An unused import is how that rule
 * fails silently — `everyGalleryScreenIsListed` looks for the NAME in this file, and an import line
 * carries the name without drawing anything.
 */

/**
 * A week as the Program tab draws it: two days, every lift with its live figure, one of them done.
 *
 * ⚠️ A FUNCTION, NOT A CONST, and the reason is this file's own oldest trap: a fixture evaluated at
 * module scope runs BEFORE `initI18n`, so `exerciseDisplayName` answers with the English fallback
 * and the screen is reviewed in a language no athlete has. Called at render, it speaks hers.
 */
const programWeek = () => [
  {
    id: 'day_1',
    name: 'Upper A',
    lifts: 4,
    minutes: 52,
    done: true,
    rows: [
      { exerciseId: 'bb_bench_press', name: exerciseDisplayName('bb_bench_press'), load: 60, sets: 4, band: [8, 10] as [number, number] },
      { exerciseId: 'bb_row', name: exerciseDisplayName('bb_row'), load: 47.5, sets: 4, band: [8, 10] as [number, number] },
      { exerciseId: 'lat_pulldown', name: exerciseDisplayName('lat_pulldown'), load: 50, sets: 3, band: [10, 12] as [number, number] },
      { exerciseId: 'db_curl', name: exerciseDisplayName('db_curl'), load: 14, sets: 3, band: [10, 12] as [number, number] },
    ],
  },
  {
    id: 'day_2',
    name: 'Lower A',
    lifts: 4,
    minutes: 55,
    done: false,
    rows: [
      { exerciseId: 'bb_back_squat', name: exerciseDisplayName('bb_back_squat'), load: 80, sets: 4, band: [6, 8] as [number, number] },
      { exerciseId: 'bb_rdl', name: exerciseDisplayName('bb_rdl'), load: 70, sets: 3, band: [8, 10] as [number, number] },
      { exerciseId: 'leg_curl', name: exerciseDisplayName('leg_curl'), load: 35, sets: 3, band: [10, 12] as [number, number] },
      { exerciseId: 'standing_calf_raise', name: exerciseDisplayName('standing_calf_raise'), load: 60, sets: 4, band: [12, 15] as [number, number] },
    ],
  },
];

/** A draft mid-edit: two days, five lifts, priced and advised by the builder's own arithmetic. */
function builderDraft() {
  let d = builderBlankDraft('gallery_draft');
  d = builderAddLift(d, 0, 'bb_bench_press');
  d = builderAddLift(d, 0, 'bb_overhead_press');
  d = builderAddLift(d, 0, 'triceps_pushdown');
  d = builderAddDay(d);
  d = builderAddLift(d, 1, 'bb_back_squat');
  d = builderAddLift(d, 1, 'bb_rdl');
  return d;
}

/** Every handler a builder entry needs, so an entry states only what it is ABOUT. */
const builderProps = {
  savedIsAuthored: false,
  ownedIds: new Set<string>(),
  figure: 'female' as const,
  onExit: noop,
  onStartFromEngine: noop,
  onStartBlank: noop,
  onStartTemplate: noop,
  onDraft: noop,
  onSave: noop,
  onRevert: noop,
  onAiReview: noop,
  aiBusy: false,
  reviewOpen: false,
  onReviewClose: noop,
};

/**
 * EVERY SCREEN IN THE HANDOFF, and where it stands. The ids match the handoff exactly, in the
 * handoff's own order, so this page can be read next to it line for line.
 */
export const GALLERY: GalleryEntry[] = [
  // ── 01 · ARRIVE ────────────────────────────────────────────────────────────────────────────
  { id: '1.1', label: 'Sign in', status: 'live', render: () => mount(Authentication) },
  /*
   * ⛔ THE FORK (founder 2026-08-12) — the two ways this product begins, the same size.
   *
   * ⛔ AND IT IS FILED AS `1.1b`, NOT `1.0` (founder, same day): *"למה מסך 1.0 … לפני מסך 1.1?! הוא
   * צריך להופיע אחריו."* He is reading the index in flow order, which is the only order it is worth
   * reading in — and `1.0` sorted it in front of the front door while `Root` has always pushed it
   * AFTER `Authentication`. **The index disagreed with the app about what comes first**, on the one
   * page that exists so the flow can be walked. An id is an address, and this one was lying.
   */
  { id: '1.1b', label: 'Where do we start?', status: 'live', note: 'the fork, after sign-in: build one, or bring the one she has. Bringing it was a 14px underline under a button', render: () => mount(Start) },
  /*
   * ⛔ THE ONE NUMBER THE COACH CANNOT INFER (founder 2026-08-03): *"the coach didn't ask for my
   * weight, and it's critical for it."* Nobody asked — `coachFacts` spreads it conditionally, so an
   * absent bodyweight was an absent line on the sheet and nothing anywhere was surprised.
   */
  /*
    ⛔ ONE SCREEN, FOUR ANSWERS (2026-08-04). `NameEntry` is merged in here and deleted — measured in
    taps, it was a keyboard the product did not need to raise plus a single tap.

    ⚠️ THE FIRST STATE IS THE ONE THAT MATTERS AND NO HARNESS PRODUCES IT: Apple hands us a name on
    first authorization, so most athletes land on a FILLED field. `app.pendingName()` is null in the
    gallery, which draws the other case — so both are entries here.
  */
  { id: '1.2c', label: 'About you — the whole first step', status: 'live', note: 'name, sex and the two rulers on one screen (founder 2026-08-10). No name from the provider here, and sex unchosen, so Continue waits', render: () => mount(AboutYou) },
  /*
   * ⛔ ENTRIES 1.2e AND 1.2f — the body map inside the intake — ARE DELETED (2026-08-29).
   *
   * The map is no longer a step: the plan builder took its seat (*"אני רוצה לעשות את שלב בניית
   * התוכנית כמסך בניית התוכנית בONBOARDING"*), and the screen went with that ruling. These two
   * entries filed it, and they came back for one commit while this file's Today block was being
   * reconstructed — a gallery entry for a screen that does not exist is the founder's own rule
   * running backwards.
   *
   * ⚠️ THE MAP IS NOT GONE FROM THE PRODUCT and is still filed: `4.1 · Body map — hers to change`
   * mounts `BodyMapEdit`, where an athlete edits it after onboarding. What was deleted is asking
   * her for one before she has trained a single session.
   */
  /*
   * ⛔ THE FIGURE ITSELF, BOTH FACES AND ALL THREE STANCES ON ONE PAGE.
   *
   * ⚠️ 1.2e CAN ONLY EVER SHOW ONE FACE AND ONE STATE AT A TIME — it is a screen, and the back is a
   * tap away. That is right for the athlete and useless for reconciling a drawing: the whole reason
   * the first figure shipped reading like a snowman is that nobody ever looked at both halves of it
   * beside each other. This entry is the drawing under a lamp: front and back, with one muscle LED
   * with, one turned OFF and one open for editing, so every state the painter can produce is on
   * screen at once and a regression in any of them is visible without a single press.
   */
  /*
   * ⛔ 1.2f IS GONE (founder 2026-08-12): *"אותו דבר? אם כן אז תוריד את המסך שמציג את 2 הצדדים."*
   *
   * It mounted `BodyMapFigure` twice side by side — a DRAWING under a lamp, not a screen. It existed
   * to judge the artwork while the body was being made, and the body is made. `1.2e` is the screen,
   * and a screen index that also lists its own parts is an index nobody can read down.
   */
  /*
   * ⛔ AND THE DEMONSTRATION WENT WITH IT (founder 2026-08-12): *"תמחק את מסך 2.9 … זה סך הכל
   * הדגמה."* Same answer as 1.2f, one line down: `FormMedia` drawn on its own is a DRAWING under a
   * lamp. It was filed here to judge the motion rig beside the body map while the body was being
   * made; that comparison is closed.
   *
   * ⛔ AND IT WAS SITTING ON AN ID THAT ALREADY BELONGED TO A SCREEN. `2.9` is *Paused · the stage
   * held*, declared 1,100 lines below — so `#2.9` resolved to the demonstration and **the paused
   * stage had no address in the harness at all**. `addressOf` catches the collision for the index's
   * links (it falls back to `i<n>`), which is why nothing looked wrong; a typed hash still went to
   * the wrong screen. `everyGalleryScreenIsListed` now refuses a duplicate id outright.
   */
  { id: '1.3', label: 'Connect health', status: 'live', note: 'no watch paired — the wrist row is absent, which is most phones', render: () => mount(ConnectHealth, { sex: 'male' }) },
  // The harness has no WCSession, so without the seam the wrist row could only ever be looked at
  // ABSENT — and "absent" is the one state it says nothing in. Both faces, driven.
  /*
   * ⛔ 1.3b AND 1.3c ARE GONE (founder 2026-08-12): *"הם גם מייצגים אותו דבר לא? אם כן אז תוריד את
   * השניים המיותרים."*
   *
   * They were `ConnectHealth` with `previewWrist` set two other ways — one SCREEN filed three times
   * as if it were three surfaces. The gallery has made this mistake before and its own §00 note
   * records the founder catching it: *"I don't understand what you did here."* The states are still
   * reachable from the screen's own props for anyone reconciling it against a PNG.
   */
  // 1.4 · ABOUT YOU + YOUR WEEK — deleted 2026-08-01. Two wheel pickers asking a coach's
  // questions one screen before a coach; the intake prompt asks for both now.
  { id: '1.5', label: 'Ready', status: 'live', render: () => mount(ProgramCreated, { inputs: onboardingInputs }) },
  /*
   * ⛔ 1.5 READS THE PLAN FROM THE DB, WHICH THE HARNESS DOES NOT HAVE — so the week it exists to
   * present has never been visible in here. This is the same blind spot that hid the coach disc and
   * the wheel: what the gallery cannot drive, nobody looks at.
   *
   * The plan below is real output from the four-week simulation, notes and all.
   */
  /*
   * ⛔ 1.5b IS GONE, AND SO IS THE COMPONENT IT MOUNTED (founder 2026-08-12: *"מה זה המסך הזה? …
   * הוא מעוצב ממש לא בצורה של איך שאפליקציה אכן צריכה להיות מעוצבת."*).
   *
   * It drew `PlanWeek` from a hand-written `CoachPlan` full of `say` and `notes` — the AI era's
   * "here is your week, and here is why", from move 4. Checked before removing: **no shipping screen
   * renders `PlanWeek`.** Its last consumer was `ProgramCreated`, whose own header records that it
   * stopped reading a coach plan; the component and this entry survived as each other's only reason
   * to exist. A fixture is not a user, and a gallery entry is not a consumer.
   */

  // ── 02 · TRAIN ─────────────────────────────────────────────────────────────────────────────
  // The card rises once per install, so the harness has to hold it open — and it hands the
  // learning length (the handoff's own four) rather than reading a programme it does not have.
  { id: '2.0', label: 'First workout — the first four', status: 'live', note: 'shown over 2.2', render: () => mount(SessionFlow, { previewFirstGym: 4 }) },
  { id: '2.1', label: 'Today', status: 'live', render: () => <InApp><UnderTabs active={0}>{todayView()}</UnderTabs></InApp> },
  /* ⛔ WEEK ONE — nothing has been compared to anything, so there is no change pill and no arrow on
     any lift, and the eyebrow reads "0 OF 4". It used to differ from 2.1 by having no earned weekday
     pattern; the pattern is gone from Today entirely (founder 2026-08-12), so what is left is the
     honest difference: a week with no history behind it. */
  { id: '2.1c', label: 'week one — nothing compared yet', of: '2.1', status: 'live', note: 'no changes pill, no arrows: there is no previous week to read', render: () => (
    <InApp><UnderTabs active={0}>
      {React.cloneElement(todayView(), { weekNumber: 1, briefCount: 0, trainedThisWeek: 0, trialLeft: 4 })}
    </UnderTabs></InApp>
  ) },
  /* ⚠️ A DONE SESSION AS THE OPEN ROW — founder A.16, in the one place it can still happen: she taps
     a finished workout to re-read it and the row opens exactly as an offer does. */
  { id: '2.1d', label: 'a finished session, re-read', of: '2.1', status: 'live', note: 'the check holds, and the act refuses it', render: () => (
    <InApp><UnderTabs active={0}>
      {React.cloneElement(todayView(), {
        dayId: 'd0',
        dayName: 'Upper A',
        dayDone: true,
        workouts: [
          { id: 'd0', name: 'Upper A', items: 6, minutes: 55, done: true },
          { id: 'd1', name: 'Lower A', items: 5, minutes: 50, changes: 2 },
          { id: 'd2', name: 'Upper B', items: 6, minutes: 55 },
          { id: 'd3', name: 'Lower B', items: 5, minutes: 48 },
        ],
      })}
    </UnderTabs></InApp>
  ) },
  /* ⚠️ AND A WEEK THE COACH DATED ITSELF — an endurance plan names every day for a reason, and the
     column must place each session on ITS day rather than on her habit. No hypertrophy fixture can
     show this, because a hypertrophy week carries no days at all. */
  /*
   * ⛔ THIS SAID "a week the COACH dated", AND THE COACH IS GONE (2026-08-12).
   *
   * The founder read the label and reasonably asked what it was. The STATE is real and still
   * reachable — but only one thing produces it now: a programme she **brought**. An imported plan
   * can name its own weekdays ("Tuesday, easy 5 km") and `authored` says we never rewrite it, so
   * those days outrank the pattern she earned. The engine dates nothing; `enginePlan` writes no
   * `day` at all, which is why a generated week is the numbered N-workouts model she asked for.
   */
  { id: '2.1e', label: 'a week that names its own days', of: '2.1', status: 'live', note: 'only an IMPORTED programme does this — its days outrank her earned pattern', render: () => (
    <InApp><UnderTabs active={0}>
      {React.cloneElement(todayView(), {
        dayId: 'd1',
        dayName: 'Tempo + Core',
        workouts: [
          { id: 'd0', name: 'Easy 6k', day: 'sun', items: 1, timeUnknown: true, done: true },
          { id: 'd1', name: 'Tempo + Core', day: 'wed', items: 7, minutes: 48 },
          /* ⚠️ `timeUnknown` — a long run has no honest minute count without a pace, and the card
             says how many things she does rather than inventing one. */
          { id: 'd2', name: 'Long run', day: 'fri', items: 1, timeUnknown: true },
        ],
      })}
    </UnderTabs></InApp>
  ) },
  { id: '2.1a', label: 'driven — tap the rows', of: '2.1', status: 'live', note: 'tap the ROWS: A.5 units · A.12 no flicker · A.15 the long name · A.16 the done row', render: () => <InApp><UnderTabs active={0}><TodayDriven /></UnderTabs></InApp> },
  { id: '2.1b', label: 'The why sheet — raised', status: 'live', note: 'the answer carries the verb (device QA 2026-08-23): the swap door under the act', render: () => <InApp><WhyChangedSheet {...whyRaised()} onSwap={noop} /></InApp> },
  /*
    ⛔ THE PRE-WORKOUT CARD (founder 2026-08-05) — what a day on the week board opens, and where the
    lift table went when it left Today. Three entries, because the three states differ in the only
    thing that matters: whether the act is offered.

    ⛔ FILED `2.1f–h`, AND IT USED TO BE `2.1c–e` — WHICH THREE OTHER SCREENS ALSO ANSWERED TO
    (2026-08-12). Nine ids in this file were held by two or three entries each: three Today states,
    these three, three why-sheets, three set states, three item stages and six cardio screens. Since
    `resolve()` is `GALLERY.find(g => g.id === id)`, **twelve screens had no address anyone could
    type** — the first holder took every one of them.

    ⚠️ NOBODY NOTICED FOR MONTHS BECAUSE THE INDEX ALREADY COMPENSATES: `addressOf` links a
    non-first holder as `i<n>` instead, so clicking always worked and only typing an id failed. The
    workaround removed the symptom and with it the report. `everyGalleryScreenIsListed` refuses a
    duplicate outright now, which is how the other eight were found — by writing the law for `2.9`.
  */
  /*
   * ⛔ THE SHAPE LINE IS DERIVED, NOT TYPED (founder 2026-08-12): *"אחד ניראה מדהים עם צבעים והסבר
   * והאחרים נראים אפורים ועצובים."*
   *
   * He is describing two real faults and the second one is a straight contradiction. `2.1g` said
   * **"5 LIFTS · ~45 MIN"** above a list of TWO, and `2.1h` said the same above THREE — a
   * hand-typed `shape` string beside a hand-typed array, drifting the moment either was edited.
   * Half of each screen was empty because half of each workout was missing, and "grey and sad" is
   * exactly what a card looks like when its own header says there should be more on it.
   *
   * So the count comes off `lifts.length` here and can never disagree with the rows again — the
   * same rule the app follows, where both come off the programme.
   *
   * ⚠️ THE FIRST FAULT IS NOT A FAULT, AND IT MATTERS THAT IT ISN'T. `2.1f` has arrows and a
   * changes pill because loads MOVED; the other two have none because nothing has been compared
   * yet — a week-one card has no previous week, and a finished session's numbers are a record.
   * Painting arrows on them to even the three screens out would be inventing engine decisions on
   * the screen she stands in front of deciding whether the numbers are right (R7).
   */
  { id: '2.1f', label: 'Pre-workout', status: 'live', note: 'the lifts, the changes, and the one act', render: () => preWorkout({
    name: 'Upper Body A', dayLabel: tg('weekdayLong.mon'), minutes: 50, changes: 2,
    lifts: [
      { exerciseId: 'bb_bench_press', name: exerciseDisplayName('bb_bench_press'), load: 57.5, sets: 4, band: [8, 10], changed: 'up' },
      { exerciseId: 'bb_row', name: exerciseDisplayName('bb_row'), load: 45, sets: 4, band: [8, 10] },
      { exerciseId: 'lat_pulldown', name: exerciseDisplayName('lat_pulldown'), load: 42.5, sets: 3, band: [8, 10], changed: 'down' },
      { exerciseId: 'db_shoulder_press', name: exerciseDisplayName('db_shoulder_press'), load: 16, sets: 3, band: [8, 10] },
      { exerciseId: 'lateral_raise', name: exerciseDisplayName('lateral_raise'), load: 7, sets: 3, band: [10, 12] },
      /* `tri_pushdown` was not an exercise. The catalogue calls it `triceps_pushdown`, and every
         sibling row here uses a real id — so `onForm` on this one row opened a lift that does not
         exist. Another thing `@ts-nocheck` on this file had nothing to say about. */
      { exerciseId: 'triceps_pushdown', name: exerciseDisplayName('triceps_pushdown'), load: 20, sets: 3, band: [10, 12] },
    ],
  }) },
  /* ⚠️ A FINISHED SESSION she opened to re-read. The plan is hers to read; the act is refused —
     a record must never wear an offer's clothes (founder 2026-07-11). */
  /*
   * ⛔ THE SWAP, OFF THE GYM FLOOR (founder 2026-08-22). Every row on a day still ahead of her
   * carries the disc; a finished day carries none, because offering to change a lift she has
   * already done would be the app proposing to rewrite history (2.1g below is that state).
   */
  { id: '2.1m', label: 'the swap, before she leaves the house', of: '2.1f', status: 'live', note: 'the third door on a row, held open — the same sheet the rack raises, same pool, one to three rows and never padded', render: () => preWorkout({
    name: 'Upper Body A', dayLabel: tg('weekdayLong.mon'), minutes: 50, changes: 2, swapOn: 'bb_bench_press',
    lifts: [
      { exerciseId: 'bb_bench_press', name: exerciseDisplayName('bb_bench_press'), load: 57.5, sets: 4, band: [8, 10], changed: 'up' },
      { exerciseId: 'bb_row', name: exerciseDisplayName('bb_row'), load: 45, sets: 4, band: [8, 10] },
      { exerciseId: 'lat_pulldown', name: exerciseDisplayName('lat_pulldown'), load: 42.5, sets: 3, band: [8, 10], changed: 'down' },
      { exerciseId: 'db_shoulder_press', name: exerciseDisplayName('db_shoulder_press'), load: 16, sets: 3, band: [8, 10] },
    ],
  }) },
  { id: '2.1g', label: 'already trained', of: '2.1f', status: 'live', note: 'a record, not an offer', render: () => preWorkout({
    name: 'Lower Body A', dayLabel: tg('weekdayLong.wed'), minutes: 45, done: true,
    lifts: [
      { exerciseId: 'bb_back_squat', name: exerciseDisplayName('bb_back_squat'), load: 72.5, sets: 4, band: [8, 10] },
      { exerciseId: 'bb_rdl', name: exerciseDisplayName('bb_rdl'), load: 62.5, sets: 4, band: [8, 10] },
      { exerciseId: 'leg_press', name: exerciseDisplayName('leg_press'), load: 100, sets: 4, band: [10, 12] },
      { exerciseId: 'leg_curl', name: exerciseDisplayName('leg_curl'), load: 34, sets: 3, band: [10, 12] },
      { exerciseId: 'standing_calf_raise', name: exerciseDisplayName('standing_calf_raise'), load: 42.5, sets: 3, band: [10, 12] },
    ],
  }) },
  /* ⚠️ AND A WEEK WITH NO DAYS YET — the commonest state for a new athlete, and the one a live
     harness cannot reach because it takes a fortnight of history to leave it. No day label, no
     change pill: nothing has been compared against anything. */
  { id: '2.1h', label: 'week one', of: '2.1f', status: 'live', note: 'no day, no changes: nothing to compare yet', render: () => preWorkout({
    name: 'Full Body A', minutes: 45, changes: 0,
    lifts: [
      { exerciseId: 'bb_back_squat', name: exerciseDisplayName('bb_back_squat'), load: 40, sets: 3, band: [8, 10] },
      { exerciseId: 'bb_bench_press', name: exerciseDisplayName('bb_bench_press'), load: 30, sets: 3, band: [8, 10] },
      { exerciseId: 'bb_row', name: exerciseDisplayName('bb_row'), load: 30, sets: 3, band: [8, 10] },
      { exerciseId: 'bb_rdl', name: exerciseDisplayName('bb_rdl'), load: 35, sets: 3, band: [8, 10] },
      { exerciseId: 'pull_up', name: exerciseDisplayName('pull_up'), load: null, sets: 3, band: [5, 8] },
    ],
  }) },
  { id: '2.1j', label: 'held', of: '2.1b', status: 'live', render: () => <InApp><WhyChangedSheet {...whyHeld()} /></InApp> },
  { id: '2.1k', label: 'eased', of: '2.1b', status: 'live', render: () => <InApp><WhyChangedSheet {...whyEased()} /></InApp> },
  /*
   * ⛔ THE SET — ONE SCREEN, AND `of` NOW SAYS SO (founder 2026-08-12: *"יש כאן לא פחות מ9 מסכי The
   * set למה?"*). Nine of the rows he counted are STATES of this mount, each one a rule that has
   * broken before: a lift with no history to ghost, a load Loop 1 eased between two sets, a set
   * count that grew, a superset with no rest in it.
   *
   * ⛔ AND ONE OF THEM WAS NOT A STATE AT ALL. `2.2b · Edit set` rendered `mount(SessionFlow)` —
   * **byte-for-byte the same call as this line** — under the note *"tap the weight on 2.2"*. It was
   * an INSTRUCTION filed as a screen: a row that opened this exact screen and told you to press
   * something on it. Deleted; the instruction is here, where it applies.
   */
  /*
   * ⛔ WHY THE PER-SIDE LINE IS ON SOME OF THESE AND NOT OTHERS (founder 2026-08-12: *"יש בגלריה
   * מסכי THE SET שכתוב גם כמה לשים בכל צד ובחלק לא. צריך להסגר."*).
   *
   * It is one rule, ruled on 2026-08-04, and every entry below obeys it — `domain/loadNews`:
   *
   *     showsPerSide = setNumber <= 1 || the load moved
   *
   * **She loads the bar once.** On set 1 the line tells her how; on sets 2–4 it is a fact she acted
   * on five minutes ago and taking the space is the founder's own *"it still looks like a lot of
   * numbers"*. It returns the instant the load changes, because then the bar must be re-loaded —
   * which is why `2.2k` and `2.2l` carry it and `2.2m` and `2.2i` do not.
   *
   * ⚠️ NOTHING WAS BROKEN HERE; THE INDEX WAS SILENT. The entries showed the states without saying
   * which state each one was, so the rule looked like inconsistency. Each note names its set now.
   *
   * ⛔ AND THE SWAP DISC IS ON EXACTLY ONE OF THEM (founder, same message): the first set of the
   * FIRST lift. `2.2e` is that entry — three discs. Every other set state shows two, and the swap
   * for later lifts lives on the transition rest (`2.4b`), where she has just walked to the machine
   * and found out whether it is free. See `domain/swapPool.isSwapMoment`.
   */
  { id: '2.2', label: 'The set', status: 'live', note: 'set 2 of 4 · the dashed rule under the figures is the door to the set editor', render: () => mount(SessionFlow) },
  /* ⛔ THE ROW OF FIGURES, IN THE STATES A LIVE SESSION CANNOT BE ASKED FOR (2026-08-04). The row is
     the whole set stage now — it replaced the rep-band graphic AND "SET 3 OF 4" — and three of its
     states are unreachable by simply running a workout in the harness. */
  /* ⛔ THE SET THAT HAS RUN LONG HAD NO ENTRY AT ALL until 2026-08-31, and it is the one state on
     this stage the athlete is MEANT to notice. It cannot be reached by running the harness — the
     store arms it off `learnedExecS`, twice her measured execution on this lift, so looking at it
     used to mean waiting three minutes inside a live session. Now the figure carries it, and a
     pose nobody can open is a pose nobody reviews. */
  { id: '2.2u', label: 'the set has run long', of: '2.2', status: 'live', note: 'she is at her phone instead of under the bar — the pose IS the ask (no second line, no banner)', render: () =>
    mount(SessionFlow, undefined, { ...sessionFixture, setRunningLong: true }) },
  { id: '2.2h', label: 'a lift she has never done', of: '2.2', status: 'live', note: 'set 2 · no history AND no load change, so no delta and no per-side line', render: () =>
    mount(SessionFlow, undefined, { ...sessionFixture, lastTime: null, setsSoFar: [] }) },
  /* ⛔ THE LOAD'S NEWS, IN ITS THREE STATES (founder 2026-08-04). None is reachable by running the
     harness: the first needs a HISTORY to compare against, the second needs Loop 1 to have fired
     mid-lift, and the third — silence — is the one that looks like nothing is wired. */
  { id: '2.2k', label: 'heavier than last time', of: '2.2', status: 'live', note: 'set 1 · ↑1.5 against last week, and the per-side line is up with it', render: () =>
    mount(SessionFlow, undefined, {
      ...sessionFixture,
      setsSoFar: [],
      loadsSoFar: [],
      setLabel: { n: 1, m: 4 },
      lastTime: { ago: 4, loadKg: 32.5, reps: [8, 8, 7, 6], loads: [32.5, 32.5, 32.5, 32.5] },
    }) },
  { id: '2.2l', label: 'Loop 1 eased it mid-lift', of: '2.2', status: 'live', note: 'mid-lift · ↓2.5 against the SET BEFORE, and the per-side RETURNS because the bar must be re-loaded', render: () =>
    mount(SessionFlow, undefined, {
      ...sessionFixture,
      setsSoFar: [9, 5],
      loadsSoFar: [34, 34],
      setLabel: { n: 3, m: 4 },
      currentTarget: { ...sessionFixture.currentTarget!, recommendedWeight: 31.5 },
      /* ⚠️ LOOP 1 MOVED HER MID-LIFT LAST WEEK TOO — so the row shows each set's OWN load,
         which is the state one figure over four sets would misreport. */
      lastTime: { ago: 4, loadKg: 30, reps: [8, 8, 7, 6], loads: [32.5, 32.5, 30, 30] },
    }) },
  { id: '2.2m', label: 'nothing moved', of: '2.2', status: 'live', note: 'set 3 of 4 · nothing moved, so no delta and no per-side: three things on the screen', render: () =>
    mount(SessionFlow, undefined, {
      ...sessionFixture,
      setsSoFar: [8, 7],
      loadsSoFar: [34, 34],
      setLabel: { n: 3, m: 4 },
      lastTime: { ago: 4, loadKg: 34, reps: [8, 8, 7, 6], loads: [34, 34, 34, 34] },
    }) },
  /*
   * ⛔ THE TALLEST THE SET STAGE CAN EVER BE (2026-08-26, with the last-time row).
   *
   * The stage distributes THREE blocks over a fixed height, and the row of last time's figures
   * added a fourth line to the first of them. So the case that decides whether the screen fits is
   * the one where every block is at its maximum at once: the longest name in the catalogue (`פשיטת
   * מרפקים מעל הראש במשקולת יד`, 32 characters — TWO lines at 36 pt), a full row of last time
   * underneath it, and two `xl` dials below that.
   *
   * ⚠️ IT IS STANDING FURNITURE, not a one-off check. Every previous overflow on this screen was
   * found on a founder's device because the harness only ever drew the SHORT name — see the C.9
   * decimal load, found the same way, and now permanently at `2.2d`.
   */
  { id: '2.2n', label: 'the tallest the stage gets', of: '2.2', status: 'live', note: "⚠️ two-line name + the coach’s line + last time + two xl dials — every block at its maximum at once", render: () =>
    mount(SessionFlow, undefined, {
      ...sessionFixture,
      /* `Triceps` is what the catalogue files this lift under — see the note on `Upper B` above for
         why `Arms` was never a muscle this app has. */
      currentExercise: { id: 'db_overhead_triceps_ext', name: 'Overhead Dumbbell Triceps Extension', muscle: 'Triceps', equipment: 'dumbbell' },
      currentExerciseId: 'db_overhead_triceps_ext',
      sessionExerciseIds: ['db_overhead_triceps_ext'],
      nextExerciseId: 'db_overhead_triceps_ext',
      currentTarget: { exerciseId: 'db_overhead_triceps_ext', setIndex: 1, recommendedWeight: 12.5, recommendedReps: 10, repBandLo: 10, repBandHi: 12 },
      setLabel: { n: 2, m: 5 },
      setsSoFar: [12],
      loadsSoFar: [12.5],
      lastTime: { ago: 4, loadKg: 10, reps: [12, 12, 11, 10, 10], loads: [10, 10, 10, 10, 10] },
      /* ⚠️ AND THE COACH'S LINE, at its two-line cap (2026-08-26). The `say` on a lift got a
         surface on the same day this entry was written, and an entry whose whole job is to be the
         tallest case has to carry every block that can appear — otherwise it stops being the
         tallest case the moment one is added, silently, which is how the last overflow shipped. */
      currentItem: { kind: 'reps', ex: 'db_overhead_triceps_ext', reps: [10, 12], load: 12.5, say: 'שלוש שניות בדרך למטה ועצור רגע למטה — בלי לנעול את המרפקים למעלה.' },
    }) },
  /*
   * ⛔ THE COACH'S LINE ON A LIFT — the surface that did not exist until 2026-08-26.
   *
   * A `reps` item carries `say` exactly as a hold or a run does, and the set stage discarded the
   * whole item for `kind === 'reps'`. Nothing on this page could produce the state, which is why it
   * survived a fortnight after the KEY POINTS control that used to draw it was deleted. It has an
   * address now (`everythingTheCoachSaysHasAMouth`).
   */
  { id: '2.2o', label: "the coach's line on a lift", of: '2.2', status: 'live', note: "an item's `say`, on the set stage — capped at two lines above two xl dials", render: () =>
    mount(SessionFlow, undefined, {
      ...sessionFixture,
      currentItem: { kind: 'reps', ex: 'bb_bench_press', reps: [8, 10], load: 34, say: 'עצור כשנשארו לך שתי חזרות במאגר — זה לא סט עד כישלון.' },
    }) },
  { id: '2.2i', label: 'a rep down, and a rep up', of: '2.2', status: 'live', note: 'set 3 of 4 · moss above the band, blue below — the landing law, on her own sets', render: () =>
    mount(SessionFlow, undefined, {
      ...sessionFixture,
      setsSoFar: [11, 6],
      setLabel: { n: 3, m: 4 },
      lastTime: { ago: 4, loadKg: 32.5, reps: [9, 9, 8, 8], loads: [32.5, 32.5, 32.5, 32.5] },
    }) },
  /* ⛔ FIVE NOTES IN THIS BLOCK NAMED A SET THE FIXTURE DOES NOT PRODUCE (founder, 2026-08-12:
     *"למה לא מופיע בחלק מהמסכים כמה צריך להרים בכל צד ורק בחלק כן?"*).

     `2.2h` and `2.2d` said "set 1" and inherit `sessionFixture`'s `{ n: 2, m: 4 }`; `2.2m` and
     `2.2i` said "set 4 of 4" and are on set 3; `2.2j` said "of 6" and is of 4. **The per-side rule
     turns on the set number**, so a browser reading these notes sees the line appear and vanish
     against a set count that is not the one on the screen — the behaviour looks arbitrary and is
     not. Only the notes were wrong; every screen was obeying `showsPerSide` exactly.

     ⛔ AND `2.2j` IS DELETED (founder, 2026-08-12). Its subject was the surplus ghost slots carrying
     no rep figure when the coach writes four sets where it wrote two — and **that row was deleted on
     2026-08-12**, so the entry drew the base `2.2` with a different `lastTime` and demonstrated
     nothing. A gallery entry whose subject no longer exists is worse than a missing one: it is a
     screen someone will one day design against. */
  /* THE CASE THAT WAS INVISIBLE. Every fixture here held a two-digit whole load, so nobody could
     see that a decimal — or plain 100 kg — pushed the figure and its per-side annex off the screen
     (founder, build 36 · C.9). A widest-load entry is now standing furniture: 137.5 on a barbell is
     the widest figure the engine can prescribe together with the widest annex it can carry. */
  /* THE SWAP MOMENT — the first set of a lift, where the chrome carries THREE discs (pause left,
     swap + form right). It is the only state in which the stage bar's sides are uneven, and it is
     the state the founder photographed for A.6; every other 2.2 fixture sits on set 2, where the
     swap is gone and the bar self-corrects. Nothing could see it. */
  { id: '2.2e', label: 'first set (swap offered)', of: '2.2', status: 'live', note: 'set 1 of the FIRST lift — the only state that carries the SWAP disc, beside the form clip', render: () =>
    mount(SessionFlow, undefined, {
      ...(sessionFixture as unknown as Record<string, unknown>),
      setLabel: { n: 1, m: 4 },
      nextSetLabel: { n: 2, m: 4 },
      currentTarget: { exerciseId: 'bb_bench_press', setIndex: 0, recommendedWeight: 34, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
    } as unknown as React.ContextType<typeof SessionContext>) },
  { id: '2.2d', label: 'the widest load', of: '2.2', status: 'live', note: 'set 2, load moved · a decimal load + a decimal per-side annex: the C.9 overflow', render: () =>
    mount(SessionFlow, undefined, {
      ...(sessionFixture as unknown as Record<string, unknown>),
      currentTarget: { exerciseId: 'bb_bench_press', setIndex: 1, recommendedWeight: 137.5, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
    } as unknown as React.ContextType<typeof SessionContext>) },
  { id: '2.2c', label: 'Form', status: 'live', note: 'the clip itself needs a device build; the cues and chrome are real', render: () => (
    <InApp>
      <ExerciseDemo
        title={exerciseDisplayName('bb_bench_press')}
        cues={exerciseCues('bb_bench_press')}
        focusLabel={tg('workout.focusOn')}
        formGuideLabel={tg('workout.formGuide')}
        doneLabel={tg('workout.tapAnywhere')}
        exerciseId="bb_bench_press"
        onDone={noop}
      />
    </InApp>
  ) },
  /*
   * ⛔ THE MOTION-REVIEW PAGER (`2.2r`) IS DELETED, AND IT WAS ALREADY BROKEN (found 2026-08-29).
   *
   * It was a QC state of the Form screen — one address to walk an authoring batch through instead
   * of eighteen fixtures — and it rendered `<MotionReview />`, an identifier defined NOWHERE in
   * `src`. So the entry threw on mount for every athlete-facing sweep of this file and was never
   * once looked at; `everyGalleryEntryActuallyRenders` was red on it.
   *
   * ⚠️ IT IS DELETED RATHER THAN REBUILT because the harness it belonged to is not the gallery's
   * job. The per-exercise eye-pass runs from the motion tests (`__tests__/motion`), which is where
   * a new rig batch is checked; a gallery address for a component that does not exist is the exact
   * "supposed to appear and does not" the founder's rule names — and the entry has also been
   * deleted once before, by his own 2026-08-12 ruling, under this same id.
   */
  /* ⛔ THE BEAT IS THE RING NOW (founder, 2026-08-26): one arc per set, filling in order, closing
     on the last one. The entries below walk a four-set lift end to end — 2.3 is her FIRST set, so
     the page can show the state where the ring is nearly empty, which is the one that has to look
     deliberate rather than broken. */
  { id: '2.3', label: 'The capture — set 1', status: 'live', note: 'one arc of four, the tick drawn under it', render: () => (
    <InApp>
      <Logged units="kg" confirm={{ weight: 34, reps: 9, n: 1, m: 4 }} />
    </InApp>
  ) },
  /* ⛔ THE THIRD OUTCOME, AND IT IS THE COMMONEST ONE (founder 2026-08-04). 2.3 above mounts a
     correction, so for a year this page could only ever show the band on a set that MISSED — and so
     could the app. A set that lands where it was asked to had no picture anywhere, which is how it
     stayed missing: nothing here could produce the state, so nobody looked at it. */
  { id: '2.3d', label: 'the capture — set 2', of: '2.3', status: 'live', note: 'the ring half-filled: two spent, two to go', render: () => (
    <InApp>
      <Logged units="kg" confirm={{ weight: 34, reps: 9, n: 2, m: 4, band: [8, 10] }} />
    </InApp>
  ) },
  /* A single-set lift keeps the whole circle — no gaps to part nothing from. Worth its own address
     because it is the one shape where the ring is a plain ring. */
  { id: '2.3h', label: 'a one-set lift', of: '2.3', status: 'live', note: 'one arc, no gaps — and it is NOT a finished lift (m > 1 guards it)', render: () => (
    <InApp>
      <Logged units="kg" confirm={{ weight: 60, reps: 5, n: 1, m: 1 }} />
    </InApp>
  ) },
  /* ⚠️ THE WIDEST RING: eight sets is the most a coach writes, and eight arcs with seven gaps is
     where the segment maths either reads as an instrument or as a dotted line. */
  { id: '2.3i', label: 'eight sets deep', of: '2.3', status: 'live', note: 'set 6 of 8 — the most arcs the circle is ever asked to hold', render: () => (
    <InApp>
      <Logged units="kg" confirm={{ weight: 100, reps: 3, n: 6, m: 8 }} />
    </InApp>
  ) },
  /* ⚠️ OUT OF THE BAND WITH THE LOAD HELD — the case the correction reveal cannot draw. Two
     corrections per lift is the cap, there is none after the last set, and the rail can cancel a
     raise: in all three her reps left the band and nothing moved. The dot must still be outside. */
  { id: '2.3e', label: 'the capture — set 3, a record', of: '2.3', status: 'live', note: 'three arcs and the crown above them: the one loud earned thing', render: () => (
    <InApp>
      <Logged units="kg" confirm={{ weight: 42.5, reps: 13, n: 3, m: 4, band: [8, 10], record: true }} />
    </InApp>
  ) },
  /*
     ⛔ THE LIFT-DONE BEAT, AND THE STATE THAT SHIPPED AS A BLANK SCREEN (founder 2026-08-05):
     *"the exercise-finished screen shows a black screen with only dots at the top."*

     It drew the pips and then a band mark that only exists when the step HAS a band — so on a fixed
     rep count, a hold or a distance, the entire screen was four green dots for 1.4 seconds. **This
     page could not produce it**, which is the whole reason it survived: the last set of a lift only
     happens inside a live session, and a live session almost always has a band. Two entries now,
     because the difference between them is the bug.
  */
  { id: '2.3f', label: 'the lift is done', of: '2.3', status: 'live', note: 'the ring closes and blooms; the lift is named under it', render: () => (
    <InApp>
      <Logged units="kg" confirm={{ weight: 34, reps: 9, n: 4, m: 4, band: [8, 10], lift: 'bb_bench_press' }} />
    </InApp>
  ) },
  { id: '2.3g', label: 'the lift is done — no band', of: '2.3', status: 'live', note: '⚠️ this was four dots on black; the name is the floor now', render: () => (
    <InApp>
      <Logged units="kg" confirm={{ weight: 34, reps: 9, n: 4, m: 4, lift: 'bb_bench_press' }} />
    </InApp>
  ) },
  /* ⛔ `2.3c` — THE PLAIN "34 kg × 8 · Set recorded" READBACK — IS DELETED (founder, 2026-08-12:
     *"צריך להעיף לדעתי ולוודא שהם לא מופיעים בשום דבר באפליקציה כי אני לא מבין מה הם בכלל"*).

     He asked what it was, and the answer is that it was not a design. **The phone could never reach
     it** — `beatSpeaks` requires a correction, a finished lift or a band — so the only thing that
     ever drew it was a set logged on the WATCH, and only because `WatchLoggedSet` carried no band
     for `bandPlacement` to place. A missing field wearing a screen's clothes, and the wrist and the
     phone gave two different answers about one set depending on which the athlete tapped.

     The band travels with the wrist's set now, both devices ask one predicate, and the form has no
     caller left. Deleted from the component, the locales and this page in one move. */
  /* ═══ THE THREE SHAPES THE STAGE COULD NOT RUN (2026-07-31) ═══
     `coachPlan` can write a marathon week, a circuit and a footballer's session. These are where
     the athlete meets the parts of them that are not "a weight for a number of reps". Each one is
     driveable here for the reason every gap in this file has taught: a state no fixture produces is
     a state nobody looks at. */
  /* ═══ THE COACH CHAT — the intake, and every conversation after it ═══
     One screen for both: intake is this with an empty record, three months later it is this with a
     full one. Scripted here so it is drivable before a server exists — type and send and the
     scripted reply arrives, exactly as the real one will. Plain on purpose; the founder is
     redesigning it in Claude Design. */
  /*
   * ⚠️ 0.1 and 0.1a below mount `CoachChat` — the CONVERSATION component — with fixtures. They are
   * how the chat itself is judged, and they are not the screens the product renders.
   *
   * `CoachIntake` and `CoachScreen` wrap that component in everything an athlete actually sees: the
   * chrome, the way back, the record it reads first. Neither had an entry, so neither had ever been
   * looked at in the gallery — which is how a body map nobody wanted survived in the step directly
   * before one of them.
   */
  /*
   * ⛔ 0.0 WAS THE ONBOARDING CONVERSATION AND IT IS DELETED (founder 2026-08-04): *"take the chat
   * out of the front door."* What replaced it is 0.0e — one call, and a wait that shows her own
   * answers being considered rather than a spinner.
   */
  { id: '0.0e', label: 'Building her programme', status: 'live', note: 'where the intake chat was: one call, and the wait shows HER facts, not a percentage nobody can measure', render: () => mount(BuildingProgramme, { inputs: onboardingInputs }) },
  /*
   * ⛔ THE AI WAIT, AS SHE MEETS IT (founder 2026-08-29: *"להמחיש את זה שזה עם AI"*).
   *
   * The VIEW, with fixtures — never the container, which would spend a real call every time this
   * page is opened. This is the state `0.0e` cannot show: the rows still DASHES because the answer
   * has not landed, and her own sentence above the body.
   *
   * ⚠️ WHY THE SENTENCE IS THE WHOLE SIGNATURE: a badge saying "AI", a sparkle or a row of typing
   * dots is a CLAIM about what is happening, and this product does not decorate claims (his own
   * rulings: *"תוריד את המשבצות האלה"*, and the spine rule that a texture may never imitate an
   * absence). Her words are not a claim. They are evidence — the only thing that could put
   * *"דגש על ישבן, בלי מוט ישר"* over a body filling with glute work is something that read it.
   */
  { id: '0.0f', label: 'the model is writing it — the wait', of: '0.0e', status: 'live', note: 'rows still dashes, her own sentence above the body: the AI signature is her words, never a badge', render: () => (
    <InApp>
      <BuildingProgrammeView
        sex="female"
        askedFor="דגש על ישבן ורגליים, בלי מוט ישר"
        muscles={[
          { muscle: 'Glutes', lifts: [{ name: exerciseDisplayName('hip_thrust') }, { name: exerciseDisplayName('cable_kickback') }] },
        ]}
      />
    </InApp>
  ) },
  /*
   * ⛔ 0.0d AND 0.0c WERE THE CONVERSATION, AND THEY ARE DELETED WITH IT (founder 2026-08-12).
   *
   * `CoachChat` and `useCoach` are gone: the two screens that mounted them — the in-workout coach
   * and the pain report — are an action sheet and the body map now, and the gallery was the last
   * thing keeping a chat component (and a hook that could still write a `CoachPlan`) alive.
   *
   * ⚠️ THE GALLERY IS WHY THEY SURVIVED, which is worth remembering: a surface that only the dev
   * gallery renders reads as "unreachable" to a grep and as "still built" to the app.
   */
  { id: '2.2f', label: 'a held duration', of: '2.2q', status: 'live', note: 'press Start — it counts down; Stop ends it with what she actually held', render: () => (
    <InApp>
      <OnStage>
        <TimeStage
          name={exerciseDisplayName('plank')}
          item={{ kind: 'time', ex: 'plank', seconds: 45, say: 'Ribs down, breathe. Stop when the hips drop, not before.' }}
          onDone={noop}
        />
      </OnStage>
    </InApp>
  ) },
  /*
     ═══════════════ ⚠️ `2.2g` IS BACK, AND THE NOTE BELOW SAID IT WOULD BE ═══════════════

     *"`DistanceStage` ITSELF IS STILL IN THE CODE… it is the only door from a session into the
     cardio screens — and he has said those screens are next. Deleting it now would delete the
     entrance to the thing being designed. It gets its entry back then."* The cardio screens were
     designed on 2026-08-27/28, so the condition is met.

     ⛔ AND THERE IS A SHARPER REASON THAN THE PROMISE. On 2026-08-27 this stage was given a band, a
     heading (`מרחק`) and its two missing `Arrive` orders — the fix its own file's note had described
     and never applied — **and it was changed without ever being seen**, because it had no entry to
     open. A screen edited blind is a screen not designed.

     ⚠️ A LOADED CARRY, NOT A RUN. `2.2s` stays deleted for the reason given below: an outdoor run
     IS a gps movement, so `measured` is true and Done hands off to the cardio stage rather than
     ending the item here — that entry drew a screen the app cannot produce. A 40 m carry is the
     honest case: nothing to track, she does it and says so.
  */
  { id: '2.2g', label: 'a distance to cover', of: '2.2q', status: 'live', note: 'a loaded carry — nothing to track, so the act CONFIRMS rather than starts', render: () => (
    <InApp>
      <OnStage>
        <DistanceStage
          name={exerciseDisplayName('farmer_carry')}
          item={{ kind: 'distance', ex: 'farmer_carry', metres: 40, load: 24, /* Infinitive, not an imperative: a `say` is a literal the coach wrote, so a fixture cannot
             switch it with the pronoun toggle — and a masculine `עצור` sitting under a correctly
             feminine `נושאת` would model a bug the product does not have. */
          say: 'חזה גבוה, כתפיים למטה. אם האחיזה נפתחת — לעצור.' }}
          onDone={noop}
        />
      </OnStage>
    </InApp>
  ) },
  /*
     ⛔ `2.2r` AND `2.2s` ARE DELETED (founder, 2026-08-12: *"חוץ מהפלאנק צריך למחוק את הכל
     כי אני לא יודע מה הם קשורים ולאיפה הם קשורים."*).

       `2.2r` open — the item went with it. Nothing on that screen could be measured, progressed or
         held against her body map, which is exactly why it could not be placed.
       `2.2g` a loaded carry, and `2.2s` a 400 m repeat — both `DistanceStage`, and `2.2s` drew it
         in a variant that cannot happen: an outdoor run IS a gps movement, so `measured` is true
         and Done hands off to the cardio stage rather than ending the item here. The entry showed
         a screen the app does not produce.

     ⚠️ `DistanceStage` ITSELF IS STILL IN THE CODE, and this is a deliberate exception he should
     know about. It is **the only door from a session into the cardio screens** — a gps distance
     hands over to `CardioLive` with the coach's target — and he has said those screens are next:
     *"לגבי קרדיו, נטפל בזה בהמשך… ונעשה אפשרות של הליכה / ריצה גם בחדר הכושר וגם בחוץ."* Deleting
     it now would delete the entrance to the thing being designed. It gets its entry back then. */
  /*
     ⛔ `2.2p` AND `2.2n` ARE DELETED (founder, 2026-08-12).

     He asked what they were, and the answer was worse than "not relevant": the mid-workout sheet
     held three chips, and every one of them already had a better home.

       SWAP THIS LIFT        *"להחליף תרגיל יש את כפתור ה-SWAP שמופיע בסט הראשון בתרגיל הראשון ואז
                             במסכי ה-TRANSITION REST."* — two controls, both on the stage, both at
                             the moment the machine is actually likely to be taken.
       SKIP THIS LIFT        *"וזה נראה לי פותר גם את SKIP THIS כי במקום לדלג המתאמן פשוט יכול
                             ללחוץ SWAP."* — and this is the sharper of the two. A lift she wants
                             gone is a lift she wants REPLACED; swapping keeps the volume the week
                             was balanced around, and skipping quietly takes it out of her back.
       THE MACHINE IS TAKEN  the one that had no other door on the phone. It keeps the one on the
                             WRIST (`watchBridge.markEquipmentOccupied`) and loses this one.

     `2.2n`'s sheet had a single caller — the speech disc on the cardio run — and went with it. */
  /*
   * ⛔ `itemFixture` WAS DECLARED AND MOUNTED NOWHERE, and that is exactly how the hole below got
   * in. 2.2f/2.2g/2.2h draw the item STAGES directly, without the chrome around them — so the one
   * state that shows a plank INSIDE the running session had no entry, and the coach disc being
   * hidden on every item stage was invisible to the only person who reads this gallery.
   *
   * Same law as `gallery-cannot-see-what-it-cannot-drive`, third time: an unused fixture is a state
   * nobody looks at.
   */
  /*
   * ⛔ THE WHEEL HAD NO ENTRY OF ITS OWN, and that is how its numerals went missing unnoticed.
   *
   * 2.2b reaches the editor only by TAPPING the load on 2.2 — a state the gallery renders as the
   * ordinary set screen, so nobody ever looked at the wheel here. And `everyWheelIsTheSameWheel`
   * cannot see it either: the law calls `onLayout` ITSELF with a hard-coded width, which is exactly
   * the input that turns out to be missing in the real app.
   */
  /*
   * ⛔ 1.4 IS GONE (founder 2026-08-12): *"אפשר להוריד זה לא באמת מסכים."*
   *
   * It mounted the `WheelPicker` bare, to see the track without the editor driving it. That is a
   * CONTROL being inspected, not a surface an athlete reaches — and the index is a list of places
   * she can stand. The wheel is judged where she meets it, on `1.2c`.
   */
  { id: '2.2q', label: 'An item, inside the session — with its chrome', status: 'live', note: 'a plank on the real stage: the coach disc must be here too, and for half an hour it was not', render: () => mount(SessionFlow, undefined, itemFixture) },
  { id: '2.2t', label: 'straight into the next lift', of: '2.2', status: 'live', note: 'a superset: the line under the position is the only thing that tells her the missing rest is deliberate', render: () => mount(SessionFlow, undefined, supersetFixture) },
  { id: '2.4', label: 'Rest', status: 'live', render: () => mount(SessionFlow, undefined, restFixture) },
  { id: '2.4b', label: 'transition rest', of: '2.4', status: 'live', render: () => mount(SessionFlow, undefined, crossingFixture) },
  /*
   * ════ THE BOARD (founder, 2026-09-07) ════ The session map with a lift one press from starting
   * (2.4r — press the menu disc). `2.4p` (the rest after a set the clock wrote) and `2.4q` (the
   * crossing's "as written?" ask) are DELETED with the clock's presumption (founder, 2026-09-09):
   * no set is written by time, so neither state can exist.
   */
  { id: '2.4r', label: 'the board — press the menu disc', of: '2.4', status: 'live', note: 'a lift still ahead is one press from now; a lift left after two sets waits at the end of the order', render: () => mount(SessionFlow, undefined, boardFixture) },
  /* ⛔ `2.4e` (crossing into a run) IS DELETED (founder, 2026-08-12) — it followed the item-stage
     cull: the run it crossed into was `DistanceStage`'s, and those entries went with it. The
     crossing card itself still states a distance correctly; it gets an entry back when the cardio
     screens are designed. */
  /* ⛔ THE SCAN IS NOT A REST (founder, 2026-08-12): *"למה מסך 2.4c נמצא תחת קטגוריית REST ולא
     בנישה משל עצמו? זה הסריקה של סיום האימון שבודקת באנימציה מה בוצע."* He is right — it filed as a
     STATE of the rest screen because of `of: '2.4'`, and it is not a rest at all: it runs once, at
     the end, reading back what she did. Its own screen now, between the rest and what the session
     earned, which is where it actually happens. */
  { id: '2.45', label: 'The end-of-session scan', status: 'live', note: 'held mid-read — lift 3 of 6; it reads every lift back before the session closes', render: () => (
    <InApp>
      <SessionScan
        read={2}
        setsOf={() => 4}
        onSkip={noop}
        lifts={[
          { exerciseId: 'bb_bench_press', name: exerciseDisplayName('bb_bench_press') },
          { exerciseId: 'bb_overhead_press', name: exerciseDisplayName('bb_overhead_press') },
          { exerciseId: 'bb_row', name: exerciseDisplayName('bb_row') },
          { exerciseId: 'bb_curl', name: exerciseDisplayName('bb_curl') },
          { exerciseId: 'triceps_pushdown', name: exerciseDisplayName('triceps_pushdown') },
          { exerciseId: 'machine_crunch', name: exerciseDisplayName('machine_crunch') },
        ]}
      />
    </InApp>
  ) },
  { id: '2.4d', label: 'learned', of: '2.4', status: 'live', note: 'press Start next set on 2.4', render: () => mount(SessionFlow, undefined, restFixture) },
  // Mounting the whole of WellDone showed the SCAN for 3.4 s and then an empty ledger — the harness
  // has no history and no engine, so the one thing 2.5 exists to say could not be seen at all. The
  // beat is a view now, and this is the handoff's own Upper A: three decided lifts and Loop 3's set.
  // ════ C.15's OWN STATE ════
  // "The engine added a set to three different exercises in one session — I want to understand why."
  // Loop 3 decides per MUSCLE (S-32), not per exercise: complete every set for a muscle AND have
  // one of its lifts advance, and that muscle earns +1 — which lands on one exercise inside it. An
  // upper day trains three or four muscles, so three of them clearing that bar is three separate
  // decisions, not one decision applied three times. 2.5 has said so per muscle since Rev 15
  // (2026-07-29 — the same day his pass is dated, so the build he read predates it). This is what
  // that screen looks like when three muscles earn at once.
  { id: '2.5', label: 'What this session earned', status: 'live', render: () => (
    <InApp>
      <SessionEarned
        /* ⛔ THE POSTER — the facts this screen leads with (founder 2026-08-04). */
        /* Her body wears the session (device QA 2026-08-23) — the fixture passes what the
           container derives from the session's own sets, so the gallery shows the device. */
        muscles={['Quads', 'Hamstrings', 'Glutes']}
        sex="female"
        poster={{
          hero: { kind: 'tonnes', value: 4.2 },
          minutes: 58,
          kcal: 412,
          tonnes: 4.2,
          sets: 19,
          lifts: [
          { exerciseId: 'bb_back_squat', load: 60, unit: 'kg', reps: [8, 7, 8, 7] },
          { exerciseId: 'bb_rdl', load: 50, unit: 'kg', reps: [9, 8, 8] },
          { exerciseId: 'leg_press', load: 120, unit: 'kg', reps: [11, 10, 10] },
          ],
        }}
        workoutName="Lower A"
        savedLegend="Upper A · Saved"
        partial={false}
        durationLabel="52"
        kcal={412}
        tonnes={11.7}
        answered
        decisions={[
          { key: 'bb_bench_press', name: exerciseDisplayName('bb_bench_press'), from: '34', to: '41', held: false,
            reason: { key: 'explain.progressLoad.text', params: { ex: exerciseDisplayName('bb_bench_press'), delta: 7 } } },
          { key: 'bb_overhead_press', name: exerciseDisplayName('bb_overhead_press'), from: '21', to: '22.5', held: false,
            reason: { key: 'explain.progressLoad.text', params: { ex: exerciseDisplayName('bb_overhead_press'), delta: 1.5 } } },
          { key: 'bb_row', name: exerciseDisplayName('bb_row'), from: '44', to: '44', held: true,
            reason: { key: 'explain.rungOutOfReach.text', params: { ex: exerciseDisplayName('bb_row') } } },
        ]}
        volume={[{ muscle: 'Chest', setsFrom: 3, setsTo: 4, reason: { key: 'explain.volumeUp.text', params: { muscle: 'chest' } } }]}
        onDone={noop}
        onRecord={noop}
      />
    </InApp>
  ) },
  /*
    ⛔ WHAT THE BOX OPENS — and the harness cannot press it, so it is handed the open state.
    The decisions moved behind a door on 2026-08-05 (founder: *"a nicely framed box saying X
    decisions were made … pressing it opens the screen of what changed"*), which means the rows
    themselves left this page unless something could raise them. Same seam as `previewPlan`.
  */
  { id: '2.5d', label: 'what changed — opened', of: '2.5', status: 'live', note: 'the rows the decisions box holds', render: () => (
    <InApp>
      <SessionEarned
        muscles={['Quads', 'Hamstrings', 'Glutes']}
        sex="female"
        poster={{ hero: { kind: 'tonnes', value: 4.2 }, minutes: 58, kcal: 412, tonnes: 4.2, sets: 19, lifts: [] }}
        workoutName="Lower A"
        savedLegend="Upper A · Saved"
        partial={false}
        durationLabel="52"
        kcal={412}
        tonnes={11.7}
        answered
        previewSheetOpen
        decisions={[
          { key: 'bb_bench_press', name: exerciseDisplayName('bb_bench_press'), from: '34', to: '41', held: false,
            reason: { key: 'explain.progressLoad.text', params: { ex: exerciseDisplayName('bb_bench_press'), delta: 7 } } },
          { key: 'lat_pulldown', name: exerciseDisplayName('lat_pulldown'), from: null, to: null, held: false, silent: true,
            reason: { text: 'Your last set fell to six reps, so I have taken this back to 42.5 kg.' } },
        ]}
        volume={[{ muscle: 'Chest', setsFrom: 3, setsTo: 4, reason: { key: 'explain.volumeUp.text', params: { muscle: 'chest' } } }]}
        onDone={noop}
        onRecord={noop}
      />
    </InApp>
  ) },
  /*
    ⚠️ A WEEK WHERE NOTHING NEEDED CHANGING. The same frame, no figure, no chevron, not pressable
    — a hold is a verdict she is owed, but it is not a door, because there is nothing behind it.
  */
  /*
   * ⛔ THE STATE HE PHOTOGRAPHED (2026-08-22) — a FIRST workout, where every lift meets its target
   * and every row therefore carried the same sentence. It was five identical lines, and the gallery
   * had no fixture that could produce it: 2.5d holds two DIFFERENT decisions, so the one shape the
   * ledger is worst in was the one shape nobody could look at.
   */
  { id: '2.5f', label: 'a first workout — every lift met its target', of: '2.5', status: 'live', note: 'five lifts, ONE decision: the sentence is said once, under the rows it covers', render: () => (
    <InApp>
      <SessionEarned
        muscles={['Chest', 'Back', 'Quads', 'Shoulders']}
        sex="male"
        poster={{ hero: { kind: 'tonnes', value: 3.9 }, minutes: 52, kcal: 402, tonnes: 3.9, sets: 22, lifts: [] }}
        workoutName="Full Body A"
        savedLegend="Full Body A · Saved"
        partial={false}
        durationLabel="52"
        kcal={402}
        tonnes={3.9}
        answered
        previewSheetOpen
        decisions={[
          { key: 'bb_bench_press', name: exerciseDisplayName('bb_bench_press'), from: '37.5', to: '40', held: false,
            reason: { key: 'explain.progressLoad.textMet', params: { delta: 2.5 } } },
          { key: 'bb_deadlift', name: exerciseDisplayName('bb_deadlift'), from: '55', to: '57.5', held: false,
            reason: { key: 'explain.progressLoad.textMet', params: { delta: 2.5 } } },
          { key: 'triceps_pushdown', name: exerciseDisplayName('triceps_pushdown'), from: '20', to: '22.5', held: false,
            reason: { key: 'explain.progressLoad.textMet', params: { delta: 2.5 } } },
          { key: 'cable_pull_through', name: exerciseDisplayName('cable_pull_through'), from: '25', to: '27.5', held: false,
            reason: { key: 'explain.progressLoad.textMet', params: { delta: 2.5 } } },
          /* ⚠️ AND ONE THAT DOES NOT FOLD IN. A dumbbell's grid steps by 1, so this lift's sentence
             says "1 kg" and keeps its own row — which is the half of the grouping worth looking at. */
          { key: 'db_lateral_raise', name: exerciseDisplayName('lateral_raise'), from: '9', to: '10', held: false,
            reason: { key: 'explain.progressLoad.textMet', params: { delta: 1 } } },
        ]}
        volume={[]}
        onDone={noop}
        onRecord={noop}
      />
    </InApp>
  ) },
  { id: '2.5e', label: 'the poster — nothing changed', of: '2.5', status: 'live', note: 'a verdict, not a door', render: () => (
    <InApp>
      <SessionEarned
        muscles={['Quads', 'Hamstrings', 'Glutes']}
        sex="female"
        poster={{ hero: { kind: 'tonnes', value: 4.2 }, minutes: 58, kcal: 412, tonnes: 4.2, sets: 19, lifts: [] }}
        workoutName="Lower A"
        savedLegend="Upper A · Saved"
        partial={false}
        durationLabel="52"
        kcal={412}
        tonnes={4.2}
        answered
        decisions={[]}
        volume={[]}
        onDone={noop}
        onRecord={noop}
      />
    </InApp>
  ) },
  /*
    ⚠️ AND THE COACH HAS NOT ANSWERED YET. `answered` is false for about fifteen seconds after a
    real workout — the box draws NOTHING there, because a count is a claim and there is no count.
    The one state a live harness always races past.
  */
  /* ⛔ `2.5f` (the poster — still thinking) IS DELETED (founder, 2026-08-12: *"כבר לא רלוונטי
     לדעתי כי זה היה כאשר היה את ה-AI. אפשר למחוק ולוודא שכל הצינור הזה סגור."*).

     It drew the ~15 s the post-session MODEL call took. `sessionStore` stopped making that call on
     2026-08-12 — the engine owns the programme after every session — so `coachIsDeciding()` is
     permanently false and the branch could not render. Deleted from the screen, the prop, the
     locales and here; the pipe is closed at the source. */
  { id: '2.5b', label: 'the poster — a new best', of: '2.5', status: 'live', note: 'the record takes the hero; the tonnage drops to the row', render: () => (
    <InApp>
      <SessionEarned
        poster={{
          hero: { kind: 'record', exerciseId: 'bb_back_squat', value: 60, unit: 'kg', reps: 8, delta: 2.5 },
          minutes: 58,
          kcal: 412,
          tonnes: 4.2,
          sets: 19,
          lifts: [
            { exerciseId: 'bb_back_squat', load: 60, unit: 'kg', reps: [8, 7, 8, 7] },
            { exerciseId: 'bb_rdl', load: 50, unit: 'kg', reps: [9, 8, 8] },
          ],
        }}
        workoutName="Lower A"
        savedLegend="Lower A · Saved"
        partial={false}
        durationLabel="58"
        kcal={412}
        tonnes={4.2}
        answered
        decisions={[]}
        volume={[]}
        onDone={noop}
        onRecord={noop}
      />
    </InApp>
  ) },
  /*
    ⚠️ AND A SESSION WITH NO LOAD IN IT. Tonnes is 0, and leading the one screen meant to make her
    proud with "0.0 t" would be a report of nothing — so the hero falls through to the set count.
  */
  /* ⛔ `2.5c` (the poster — a bodyweight session) IS DELETED (founder, 2026-08-12: *"למה שכל
     האימון יהיה BODYWEIGHT כשאנחנו בחדר הכושר בלבד מבחינת הציוד?"*).

     He is right that it is not a designed state, and the entry presented it as one.

     ⚠️ THE FALLBACK IN `sessionPoster` STAYS, and he should know it. `hero` is a record, else the
     tonnage, else the SET COUNT — and that last arm is a guard against printing "0.0 t", not a
     bodyweight feature. Deleting it would put the exact figure its own comment forbids onto the one
     session that reaches it. No entry draws it now, which is what he asked for. */
  { id: '2.6', label: 'Milestone', status: 'live', note: 'a club mark — every word built by the product’s own milestoneCopy', render: () => <InApp><MilestoneBeat mark={{ id: 'club_bb_bench_press_40', family: 'club', value: 40, exerciseId: 'bb_bench_press' }} earnedAt="17 ביולי 2026" /></InApp> },
  { id: '2.6b', label: 'ten workouts', of: '2.6', status: 'live', note: 'the count family — no sub line, which is the difference 2.6 exists beside', render: () => <InApp><MilestoneBeat mark={{ id: 'count_10', family: 'count', value: 10 }} earnedAt="17 ביולי 2026" /></InApp> },

  // ── 03 · REFLECT ───────────────────────────────────────────────────────────────────────────
  { id: '3.1', label: 'The Saturday letter', status: 'live', note: "a week WITH decisions — the handoff's own example, nothing special about its number", render: () => mount(WeeklyUpdate, { previewPlan: letterWeek }) },
  { id: '3.1b', label: 'the one question', of: '3.1', status: 'live', note: 'held open on Quads', render: () => mount(WeeklyUpdate, { previewAskBack: 'Quads' }) },
  { id: '3.1c', label: 'a steady week', of: '3.1', status: 'live', note: 'nothing changed; the standing record answers', render: () => mount(WeeklyUpdate, { previewPlan: steadyWeek }) },
  /*
   * ⚠️ THE FIRST ATTEMPT AT THIS ENTRY WAS BROKEN, AND THE SCREEN WAS NOT.
   *
   * The founder: *"3.2e doesn't work at all."* True — and it was my FIXTURE, not
   * `ProgressReportView`. I passed `firstKg` / `peakKg` where `QuarterlyProgressEntry` declares
   * `initialPeakKg` / `periodPeakKg` / `currentKg` / `weeksTrained` / `series`, and silenced the
   * type error with `as never`. Second time in one day the same shortcut produced a fake defect —
   * the cardio sheet was the first. **`as never` on a fixture buys a green typecheck and a screen
   * that renders nothing.**
   *
   * This is the real shape, and the screen draws it.
   */
  /*
    ⛔ THE CLAIM'S OTHER TWO STATES. The sentence is derived from the table, so the standing fixture
    can only ever show one of them — and the two it cannot show are the ones a screen gets wrong: a
    mixed month, and an athlete who has not gained yet. Neither is reachable by using the app.
  */
  /* ⛔ `3.2f`, `3.2g` AND `3.2e` ARE DELETED (founder, 2026-08-12: *"יש כאן מלא מסכים שלא צריך —
     צריך רק את 3.6b שמייצג את ההתחלה ואת 3.2 עם התיקונים שאמרתי לך."*).

     `3.2f` and `3.2g` were states of the CLAIM sentence — "a mixed month", "nothing has moved yet".
     The second still exists and is `3.6b`, which he kept; the first is one sentence's wording, not
     a screen. `3.2e` mounted `ProgressReportView`, the quarterly peak-vs-now report — still routed
     from the twelve-week notification, and not this screen. */
  { id: '3.2', label: 'Progress — lifts', status: 'live', render: () => <InApp><UnderTabs active={2}>{progressView()}</UnderTabs></InApp> },
  { id: '3.2b', label: 'Lift detail', status: 'live', note: 'tap a point on the climb', render: () => <InApp>{liftDetailView}</InApp> },
  // C.18's own states. 3.2b hands the screen EIGHT training days, so the two an athlete actually
  // opens it on first — one day, and none — had no entry at all. One day is where "no graph" came
  // from: `Climb` drew a lone dot in a 138 px box.
  { id: '3.2c', label: 'one day', of: '3.2b', status: 'live', note: 'the climb has not started yet — C.18', render: () => (
    <InApp>
      <LiftDetailView
        exerciseId="bb_row"
        units="kg"
        loaded
        band={[8, 10]}
        onBack={noop}
        climb={{ mode: 'load', firstAtMs: daysAgo(0), current: 34, best: 34, points: [{ atMs: Date.now(), value: 34, dayBest: 34, sessionId: 's1' }] }}
        moments={[]}
        changes={[]}
      />
    </InApp>
  ) },
  { id: '3.2d', label: 'never trained', of: '3.2b', status: 'live', render: () => (
    <InApp>
      <LiftDetailView
        exerciseId="bb_row"
        units="kg"
        loaded
        band={[8, 10]}
        onBack={noop}
        climb={{ mode: 'load', firstAtMs: null, current: 0, best: 0, points: [] }}
        moments={[]}
        changes={[]}
      />
    </InApp>
  ) },
  { id: '3.3', label: 'Progress — log', status: 'live', render: () => (
    <InApp>
      <UnderTabs active={2}>
        <HistoryView
          sessions={[savedSession]}
          cardio={[savedRun]}
          dayName={() => 'Upper A'}
          onLifts={noop}
          onSession={noop}
          onCardio={noop}
        />
      </UnderTabs>
    </InApp>
  ) },
  { id: '3.3d', label: 'free workout — the composer', of: '3.3', status: 'live', note: 'work she did without Hush; kept whole, folded by nothing, never a funnel', render: () => (
    <InApp>
      <FreeLogView units="kg" onBack={noop} onSave={noop} />
    </InApp>
  ) },
  { id: '3.3b', label: 'the record', of: '3.3', status: 'live', render: () => (
    <InApp>
      <WorkoutDetailView
        session={savedSession}
        forward={savedForward}
        loading={false}
        units="kg"
        dayName="Upper A"
        bodyweightKg={78}
        onBack={noop}
        /* A chip opens the correction sheet (2026-09-09); the harness writes nothing. */
        onAmend={async () => {}}
      />
    </InApp>
  ) },
  { id: '3.3c', label: 'a cardio record', of: '3.3', status: 'live', render: cardioRecord },
  { id: '3.3e', label: 'a cardio record — mixed gait', of: '3.3', status: 'live', note: 'the only shape that draws the gait tag: it marks the EXCEPTION, so on a pure walk or a pure run (#3.3c) the column is absent entirely rather than repeating one word down the page', render: cardioRecordMixed },
  { id: '3.4', label: 'Cardio — live', status: 'live', note: "the clock is frozen — the harness has no GPS; the coach’s line is ON the stage again (the speech disc it hid behind was deleted 2026-08-12 and nothing replaced it until 2026-08-26)", render: () => (
    <InApp>
      <CardioLiveView

        elapsedSec={26 * 60 + 14}
        distanceKm={4.62}
        exerciseId="run_outdoor"
        say="בקצב שאפשר לדבר בו — זה היום הקל של השבוע. אם את מתקשה לדבר, האטי; אני מודד את ההתאוששות שלך ביום שלישי, לא את הקצב של היום."
        hr={141}
        calories={318}
        splits={runSplits}
        gps="ready"
        watchPaired
        paused={false}
        confirmEnd={false}
        kmMoment={null}
        onPause={noop}
        onResume={noop}
        onAskEnd={noop}
        onKeepGoing={noop}
        onFinish={noop}
      />
    </InApp>
  ) },
  // The screen B.6 lives on. It had no entry because the countdown was buried in the container —
  // so the legend read "ריצה · מתחיל" (wrong order, masculine to every woman) where nothing could
  // look at it. Switch the gallery to Hebrew to read it in the person it is actually spoken in.
  /*
    ⛔ A RUN THE COACH WROTE — the band spans the WHOLE distance instead of resetting every kilometre,
    and the run wears its own name instead of the word "cardio". Unreachable in a live harness twice
    over: it needs a prescribed target on the route AND a GPS fix to move the dot along it.
  */
  { id: '3.4e', label: 'a run her programme prescribed', of: '3.4', status: 'live', note: 'the band is the whole 6 km; the name is the coach’s', render: () => (
    <InApp>
      <CardioLiveView
        elapsedSec={26 * 60 + 14}
        distanceKm={4.62}
        targetMetres={6000}
        /* ⚠️ The product derives this from `target.ex` through `exerciseDisplayName`, so it is a
           MOVEMENT name in her language — never a coach sentence. The old fixture said "Easy 6k",
           a string this screen cannot produce, and it hid the raw-English bypass at
           `Cardio.tsx`’s `runName` for as long as it stood. */
        runName={exerciseDisplayName('run_outdoor')}
        exerciseId="run_outdoor"
        say="בקצב שאפשר לדבר בו — זה היום הקל של השבוע."
        hr={141}
        calories={318}
        splits={runSplits}
        gps="ready"
        watchPaired
        paused={false}
        confirmEnd={false}
        kmMoment={null}
        onPause={noop}
        onResume={noop}
        onAskEnd={noop}
        onKeepGoing={noop}
        onFinish={noop}
      />
    </InApp>
  ) },
  /*
    ⚠️ THE FIRST KILOMETRE, BEFORE ANY SPLIT EXISTS. The shape must be ABSENT here — not an empty
    frame — which is the one thing the rhythm law on this stage was originally written about.
  */
  { id: '3.4f', label: 'the first kilometre', of: '3.4', status: 'live', note: 'no bars yet, and no empty frame where they will be', render: () => (
    <InApp>
      <CardioLiveView
        elapsedSec={92}
        distanceKm={0.31}
        hr={null}
        calories={22}
        splits={[]}
        gps="acquiring"
        watchPaired={false}
        paused={false}
        confirmEnd={false}
        kmMoment={null}
        onPause={noop}
        onResume={noop}
        onAskEnd={noop}
        onKeepGoing={noop}
        onFinish={noop}
      />
    </InApp>
  ) },
  /*
     ⛔ THE FIRST SECONDS OF A KILOMETRE — the state the founder photographed and no fixture could
     draw (2026-08-12).

     The distance readout rides under the moving dot (`left: dotFrac%`, `marginLeft: -75`), so at  // rtl-ok: a symmetric half-width offset centring a readout on a dot, in the dev harness only
     the start of a kilometre the 150-wide box begins at **x = −75** and the leading `0` is off the
     screen: he saw ".00 km". Every run on this page sat mid-kilometre — `3.4f` is at 31%, where it
     centres perfectly — so the one state it breaks in had no entry. **It is the first minute of
     every run**, which is when she looks at the phone.
  */
  { id: '3.4n', label: 'the first seconds of a kilometre', of: '3.4', status: 'live', note: 'the distance readout is clamped inside the rail — it used to read ".00 km"', render: () => (
    <InApp>
      <CardioLiveView
        elapsedSec={127}
        distanceKm={0}
        exerciseId="run_outdoor"
        hr={null}
        calories={0}
        splits={[]}
        gps="acquiring"
        watchPaired={false}
        paused={false}
        confirmEnd={false}
        kmMoment={null}
        onPause={noop}
        onPain={noop}
        onResume={noop}
        onAskEnd={noop}
        onKeepGoing={noop}
        onFinish={noop}
      />
    </InApp>
  ) },
  { id: '3.4d', label: '3·2·1', of: '3.4', status: 'live', note: 'the countdown legend — B.6', render: () => <InApp><CardioCountdown count={2} /></InApp> },
  // B.8's two doors. 3.4 mounts the run UNPAUSED, so neither the pause stage's end control nor
  // the confirmation behind it could be read — and "סיים ושמור" (masculine) was on both.
  { id: '3.4j', label: 'paused', of: '3.4', status: 'live', note: 'the finish control — B.8', render: () => (
    <InApp>
      <CardioLiveView

        elapsedSec={26 * 60 + 14}
        distanceKm={4.62}
        hr={141}
        calories={318}
        splits={runSplits}
        gps="ready"
        watchPaired
        paused
        confirmEnd={false}
        kmMoment={null}
        onPause={noop}
        onPain={noop}
        onResume={noop}
        onAskEnd={noop}
        onKeepGoing={noop}
        onFinish={noop}
      />
    </InApp>
  ) },
  { id: '3.4k', label: 'end sheet', of: '3.4', status: 'live', note: 'the confirmation behind the finish — B.8', render: () => (
    <InApp>
      <CardioLiveView

        elapsedSec={26 * 60 + 14}
        distanceKm={4.62}
        hr={141}
        calories={318}
        splits={runSplits}
        gps="ready"
        watchPaired
        paused
        confirmEnd
        kmMoment={null}
        onPause={noop}
        onResume={noop}
        onAskEnd={noop}
        onKeepGoing={noop}
        onFinish={noop}
      />
    </InApp>
  ) },
  // C.19's own case. 3.4 mounts a PAIRED athlete, so the heart draws — and the screen he was
  // looking at (no watch, an em-dash sitting in a seat labelled דופק on every run she will ever
  // take) had no entry at all.
  { id: '3.4g', label: 'no watch', of: '3.4', status: 'live', note: 'no heart readout at all — C.19', render: () => (
    <InApp>
      <CardioLiveView

        elapsedSec={26 * 60 + 14}
        distanceKm={4.62}
        hr={null}
        calories={318}
        splits={runSplits}
        gps="ready"
        watchPaired={false}
        paused={false}
        confirmEnd={false}
        kmMoment={null}
        onPause={noop}
        onResume={noop}
        onAskEnd={noop}
        onKeepGoing={noop}
        onFinish={noop}
      />
    </InApp>
  ) },
  { id: '3.4a', label: 'Cardio — ready', status: 'live', note: 'the one question: outdoors or a belt — walking vs running is measured, never asked', render: () => <InApp><UnderTabs active={1}><CardioReady onBegin={noop} /></UnderTabs></InApp> },
  { id: '3.4b', label: 'kilometre logged', of: '3.4', status: 'live', render: () => (
    <InApp>
      <View style={styles.kmStage}>
        <KmMoment split={runSplits[3]} splits={runSplits} />
      </View>
    </InApp>
  ) },
  { id: '3.4c', label: 'Cardio — done', status: 'live', note: 'preview — the harness never writes a run to the log; the story door and the longest-yet line render from the preview card', render: () => (
    <InApp>
      <CardioComplete
        preview
        navigation={{ goBack: noop, navigate: noop } as never}
        gait="run"
        startedAt={new Date(daysAgo(0)).toISOString()}
        elapsedSec={26 * 60 + 14}
        distanceKm={4.2}
        avgHr={141}
        calories={318}
        splits={runSplits}
        route={[]}
      />
    </InApp>
  ) },
  /*
    ⚠️ A WALK, AND A RUN TOO SHORT TO HAVE A PACE. Two states of the poster no harness can produce
    by running the stage: the title is derived from the average pace, and the pace line is absent
    below the distance floor — "0:00 /km" is a fabrication, not a measurement.
  */
  /* ⛔ `3.4m` ("a walk") IS DELETED (founder, 2026-08-12) — and my own audit two messages earlier
     said this family had no redundancy in it. It did, and he found the argument I had missed:

       *"מצד אחד אתה אומר שאין צורך ליצור אפשרויות להליכה או ריצה … ומצד שני אתה שם את מסכי הסיום
       בגלריה שמייצגים הליכה או ריצה בנפרד. אז תחליט."*

     The entry existed to show the finish poster titled "Walk" instead of "Run" — a state produced
     by `gaitFromPace(avgPace)`, which is the ONE place the product collapsed a mixed session into a
     single gait. The title is "Cardio" now, so the two posters are the same poster and this is the
     same entry as `3.4c`. */
  { id: '3.4h', label: 'too short for a pace', of: '3.4c', status: 'live', note: 'no pace line, no bars — and no zeros standing in for them', render: () => (
    <InApp>
      <CardioComplete
        preview
        navigation={{ goBack: noop, navigate: noop } as never}
        gait="run"
        startedAt={new Date(daysAgo(0)).toISOString()}
        elapsedSec={44}
        distanceKm={0.02}
        avgHr={null}
        calories={4}
        splits={[]}
        route={[]}
      />
    </InApp>
  ) },
  { id: '3.5', label: 'The week is done', status: 'live', render: () => <InApp><UnderTabs active={0}>{weekDoneView}</UnderTabs></InApp> },
  { id: '3.6b', label: 'day one', of: '3.2', status: 'live', render: () => <InApp><UnderTabs active={2}>{progressDayOne}</UnderTabs></InApp> },

  // ── 04 · OWN ───────────────────────────────────────────────────────────────────────────────
  /*
   * §04 held the body-map editor and the paywall, and not the SCREEN THEY ARE REACHED FROM. The
   * founder's "You is becoming a screen we just push things into" is a judgement about a surface
   * the gallery could not show him.
   */
  { id: '4.0', label: 'You', status: 'live', note: 'the whole tab — every row, in one place, which is the point', render: () => mount(ProfileSheet) },
  /*
   * ⛔ 4.1 EXISTS AGAIN (founder 2026-08-11). The body map lived on ONE screen, in onboarding, drawn
   * once and never reachable — while the pain flow's copy already told her *"adjust it any time in
   * You → Body map."* The app promised a surface it did not have, and its test suite sat blocked on
   * the missing module for as long as that was true.
   */
  { id: '4.1', label: 'Body map — hers to change', status: 'live', note: 'the map after onboarding: a muscle off or led with, its rep band, and a rest window that has run out', render: () => mount(BodyMapEdit) },
  { id: '4.1b', label: 'Exercise library — the lifts she wants', status: 'live', note: 'her picks take the leading seats for a muscle and a refusal is a gate; refusing the LAST lift of a muscle is refused, with a sentence', render: () => mount(ExerciseLibrary) },
  /*
   * ⛔ THE PROGRAM TAB AND THE PEN, FILED (2026-08-29) — see the note at their fixtures.
   *
   * `4.4` is the tab whose whole subject is her week, and since the founder removed Home's "אימון
   * אחר" door (*"יותר נוח לבצע אימון אחר דרך מסך התוכנית"*) it is the ONLY place another workout is
   * chosen. `4.5`–`4.5c` are the builder: onboarding step 3 of 3, and the surface every one of the
   * day's rulings lands on.
   */
  { id: '4.4', label: 'The week — every day, every lift', status: 'live', note: 'the only chooser now — the "אימון אחר" door left Home, and a row here opens the same pre-workout card it opened', render: () => (
    <InApp><UnderTabs active={1}>
      <ProgramTabView workouts={programWeek()} units="kg" settled figure="female" onDay={noop} onBuild={noop} />

    </UnderTabs></InApp>
  ) },
  /* THE RECEIPT (founder, 2026-09-07 — the plan's fourth part): the engine's decisions counted off her
     log, and the fixed plan beside the engine once they have parted. The figures are the shape
     `engineReceipt` returns — a month of bench: fourteen decisions, one lift eight sessions in. */
  { id: '4.4b', label: 'the receipt', of: '4.4', status: 'live', note: 'above the week, under the station note — silent on a first week', render: () => (
    <InApp><UnderTabs active={1}>
      <ProgramTabView
        workouts={programWeek()}
        units="kg"
        settled
        figure="female"
        onDay={noop}
        onBuild={noop}
        receipt={{ decisions: 14, raises: 6, holds: 7, eases: 1, counterfactual: { exerciseId: 'bb_bench_press', occurrences: 8, fixedKg: 77.5, engineKg: 65 } }}
      />
    </UnderTabs></InApp>
  ) },
  { id: '4.5', label: 'The ask — intake step 3/3', status: 'live', note: 'the ONE screen where she talks to the model, and since 2026-09-07 the ONLY door in the intake (founder: "רק החלק של בנה תוכנית עבורי"). Her sentence leads, over three lines; the days and the session length follow', render: () => (
    <InApp><PlanBuilderView {...builderProps} draft={null} intake offerDoors advice={[]} onLetHushBuild={noop} /></InApp>
  ) },
  { id: '4.5a', label: 'the ask — off the Program tab', of: '4.5', status: 'live', note: 'the same step without the intake chrome: reached from the doors on the Program tab, where the blank sheet and the shelves still stand', render: () => (
    <InApp><PlanBuilderView {...builderProps} draft={null} offerDoors advice={[]} onLetHushBuild={noop} previewAsking /></InApp>
  ) },

  /*
   * ⛔ THE WAIT IS THE PROGRAM TAB'S, NOT THE INTAKE'S — corrected 2026-08-30 on an onboarding
   * sweep, and the entry was asserting a state the product had stopped having.
   *
   * When the intake's engine door was wired to the model it went straight to `BuildingProgramme`
   * (the reveal screen was composed for exactly that wait), so `buildBusy` is never set in intake
   * chrome any more — the doors are gone from the screen before a call is a second old. Off the
   * Program tab there IS no reveal to send her to, so the wait stays on the door, which is the
   * state this entry now draws. Mounting it with `intake` filed a screenshot nobody can reach.
   */
  { id: '4.5b', label: 'waiting on the model — off the Program tab', of: '4.5', status: 'live', note: 'the ONLY chrome where the wait sits on the door: in the intake it belongs to the reveal screen. Doors stand down; the label says what is happening', render: () => (
    <InApp><PlanBuilderView {...builderProps} draft={null} offerDoors advice={[]} onLetHushBuild={noop} buildBusy /></InApp>
  ) },
  { id: '4.5c', label: 'the pen — her week, mid-edit', of: '4.5', status: 'live', note: 'where a model-written week, a shelf and a blank sheet all land: rows to swap, sets to turn, the clock and the advice live', render: () => {
    const draft = builderDraft();
    return <InApp><PlanBuilderView {...builderProps} draft={draft} intake offerDoors={false} advice={builderAdviceOf(draft)} /></InApp>;
  } },
  { id: '4.2', label: 'Bring your own programme', status: 'live', note: 'photograph a coach’s sheet or type it out — the door for the coach track', render: () => mount(ImportPlan) },
  { id: '4.2a', label: 'What we found in it', status: 'live', note: 'the report she reads before she chooses — nothing here is fixed, only named', render: () => (
    /*
     * ⛔ RENDERED DIRECTLY, NOT THROUGH `mount()` — and this entry threw for as long as it did not
     * (found by the visual sweep, 2026-08-24). `mount()` is for NAVIGATION screens: it puts what it
     * is given under `route.params`. `ImportReview` is a COMPONENT — `ImportPlan` renders it inline
     * with direct props, callbacks and all — so every prop arrived as `undefined` and `findings.length`
     * threw on the first line of the body. The import report is one of the features with no
     * competitor equivalent, and in the only place a human reviews screens it was a red error page.
     */
    <InApp>
      <ImportReview
        title="My push / pull / legs"
        sessionCount={3}
        liftCount={12}
        findings={[
          { kind: 'unmatched_lift', subject: 'Zercher Squat' },
          { kind: 'session_over_hour', subject: 'Push', value: 74 },
          { kind: 'sets_above_ceiling', subject: exerciseDisplayName('bb_back_squat'), value: 6 },
        ]}
        onKeep={noop}
        onBalance={noop}
      />
    </InApp>
  ) },
  { id: '4.3', label: 'Paywall', status: 'live', note: 'stub store prices — the real ones come from App Store Connect', render: () => mount(Paywall, { source: 'gate' }) },

  // ── 06–11 · SURFACES ───────────────────────────────────────────────────────────────────────
  // §06 IS BUILT, and none of it is a React screen: it is ActivityKit. The RN seam that projects
  // the session into the ContentState is `platform/liveActivity.ts`; the SwiftUI that draws it is
  // `targets/widget/HushLiveActivityWidget.swift`. A browser cannot render either — the acceptance
  // test for these two is a device with a live workout on it.
  { id: '6.1', label: 'Dynamic Island', status: 'device', note: 'ActivityKit — platform/liveActivity.ts → targets/widget/HushLiveActivityWidget.swift' },
  { id: '6.2', label: 'Lock screen · live activity', status: 'device', note: 'the same activity, expanded — strength and cardio both' },
  // The one WidgetKit StaticConfiguration in the repo is the WATCH complication; there is no iOS
  // home-screen widget yet, so this stays honest.
  { id: '8.1', label: 'Notifications', status: 'device', note: 'built + scheduled locally (platform/notifications.ts) — the OS draws them' },
  { id: '8.2', label: 'Permission · the honest ask', status: 'live', note: 'shown once, after the first session', render: () => <InApp><NotificationAsk onAllow={noop} onDecline={noop} /></InApp> },
  { id: '8.3', label: 'In-workout · rest ending', status: 'device', note: 'the 7-second tap — fires on a running rest (platform/restHaptics.ts)' },
  { id: '9.1', label: 'Share card — personal record', status: 'live', render: () => mount(ShareCardModal, { card: recordCard }) },
  { id: '9.2', label: 'Share card — week complete', status: 'live', render: () => mount(ShareCardModal, { card: weekCard }) },
  { id: '9.3', label: 'Share card — the session story', status: 'live', note: 'the finish screens quiet door (founder 2026-08-23): her body wearing the work, plus the sessions three figures', render: () => mount(ShareCardModal, { card: sessionCard }) },
  { id: '9.4', label: 'Share card — the run', status: 'live', note: 'the cardio finish, posted (founder 2026-08-23): distance, whole-run pace, the shape of the effort — and the longest-yet line when it is true', render: () => mount(ShareCardModal, { card: cardioShareCard }) },
  { id: '10.1', label: 'After a gap · the welcome back', status: 'live', render: () => (
    <InApp>
      <WelcomeBackView
        daysAway={11}
        unit="kg"
        lifts={[
          { exerciseId: 'bb_bench_press', name: exerciseDisplayName('bb_bench_press'), load: 42.5 },
          { exerciseId: 'bb_back_squat', name: exerciseDisplayName('bb_back_squat'), load: 60 },
        ]}
        onStart={noop}
      />
    </InApp>
  ) },
  { id: '10.2', label: 'Subscription lapsed · read-only', status: 'live', render: () => (
    <InApp>
      <LapsedView
        dayName="Monday, Push"
        endedOn="28 July"
        priceLabel="$59.99/year"
        onResume={noop}
        kept={[
          { key: 'last', title: 'Last session · 27 July', detail: 'Push · 5 lifts · 4,200 kg moved', onOpen: noop },
          { key: 'best', title: 'Bench press · all-time', detail: 'Best 42.5 kg × 8 · +12.5 in 12 weeks', onOpen: noop },
          { key: 'letters', title: 'The Saturday letters', detail: '12 weeks, all saved', onOpen: noop },
        ]}
      />
    </InApp>
  ) },
  { id: '10.3', label: 'Win-back push', status: 'device', note: 'one notification, weeks after lapsing — the OS draws it' },
  // Not in the handoff — founder 2026-07-29, designed in-house on 1.3. It is filed in §10 because
  // that is what it IS: a third state that replaces Today, on the same mechanism as 10.1 / 10.2.
  // The harness can show both faces; on a device WCSession decides, and neither face exists for a
  // phone with no watch paired to it.
  { id: '10.4', label: 'On your wrist', status: 'live', note: 'for the athlete who got a watch SINCE — someone who had one was told at 1.3b', render: () => (
    <InApp><OnYourWristView offer="confirm" onDone={noop} /></InApp>
  ) },
  { id: '10.4b', label: 'not installed', of: '10.4', status: 'live', note: 'auto-install is off on this iPhone', render: () => (
    <InApp><OnYourWristView offer="install" onDone={noop} /></InApp>
  ) },
  // §11's live half (invite / shared session / the partner feed) needs a server between two
  // devices, and the launch is 100% on-device. The two halves that DON'T are built: a plan travels
  // as an opaque link, so nothing but the shape ever leaves the phone.
  /*
   * ⛔ 11.1 SHIPPED, UNDER ANOTHER NAME (2026-08-25). Its note read "needs a server between two
   * devices — the launch is on-device only", which was true when it was written and stopped being
   * true the day `server/hush-identity/src/index.ts` was deployed. Inviting a partner IS the circle: an invite
   * code, up to six members, join-by-code, all against a live worker. It is drivable at 11.6/11.7.
   *
   * Left as a row rather than deleted, because the index is how a reviewer finds a feature by the
   * name they have in their head — and "invite a partner" is that name. What it must not do any
   * more is tell them it does not exist.
   */
  { id: '11.1', label: 'Invite a partner', status: 'cancelled', note: 'shipped as THE CIRCLE — open 11.6 / 11.7' },
  /*
   * ⛔ 11.2 IS BUILT (2026-08-31). Its note read "needs a live link between two phones", which was
   * true from the day the handoff was drawn until `HushPairRoom` — a Durable Object inside the
   * identity worker — gave it one. Two athletes, one bar, alternating sets, each at their own load.
   *
   * ⚠️ THE ROWS BELOW ARE THE STRIP, NOT THE WHOLE STAGE. The stage is 2.2 and it is already here;
   * what §11.2 adds to it is this row above the act, and the states worth stopping on are the four
   * it can be in. Filing them as states of one row is the founder's own 2026-08-12 ruling about
   * what an index is for.
   */
  { id: '11.2', label: 'Shared session · your turn', status: 'live', note: 'stacked to hand off — never side by side to rank', render: () => (
    <InApp><View style={{ padding: 26 }}><PairStrip pair={pairFixture()} units="kg" /></View></InApp>
  ) },
  { id: '11.2b', label: 'his turn', of: '11.2', status: 'live', note: 'the bar is his; her button still logs, it only changes its words', render: () => (
    <InApp><View style={{ padding: 26 }}><PairStrip units="kg" pair={pairFixture({
      partnerPresence: 'lifting',
      standing: { liftIndex: 0, exerciseId: 'bb_bench_press', turn: 'guest', mine: false, mineSet: { n: 3, m: 4 }, theirsSet: { n: 2, m: 4 }, stale: false, behindOnPlan: false },
    })} /></View></InApp>
  ) },
  { id: '11.2c', label: 'he went quiet', of: '11.2', status: 'live', note: 'nobody to hand off to — she is told once, and trains on', render: () => (
    <InApp><View style={{ padding: 26 }}><PairStrip units="kg" pair={pairFixture({
      standing: { liftIndex: 0, exerciseId: 'bb_bench_press', turn: 'guest', mine: false, mineSet: { n: 3, m: 4 }, theirsSet: { n: 2, m: 4 }, stale: true, behindOnPlan: false },
    })} /></View></InApp>
  ) },
  { id: '11.2d', label: 'the link is down', of: '11.2', status: 'live', note: 'no turn it cannot verify — and the workout carries on', render: () => (
    <InApp><View style={{ padding: 26 }}><PairStrip units="kg" pair={pairFixture({ link: 'closed' })} /></View></InApp>
  ) },
  { id: '11.2e', label: 'his loads are his own', of: '11.2', status: 'live', note: 'she turned the bar number off — the hand-off still works', render: () => (
    <InApp><View style={{ padding: 26 }}><PairStrip units="kg" pair={pairFixture({ partnerBar: null })} /></View></InApp>
  ) },
  { id: '11.2f', label: 'Train together · the room', of: '11.2', status: 'live', note: 'the code, read across a bench', render: () => (
    <InApp><TrainTogetherSheet onClose={noop} pair={pairFixture({ stage: 'waiting', partnerHere: false, partnerName: null, standing: null })} /></InApp>
  ) },
  { id: '11.2g', label: 'Train together · she is here', of: '11.2', status: 'live', note: 'whose lifts it runs on, said out loud — and Begin is the ordinary Begin', render: () => (
    <InApp><TrainTogetherSheet onClose={noop} onBegin={noop} pair={pairFixture({ stage: 'ready', standing: null, canHandOverLead: true })} /></InApp>
  ) },
  { id: '11.2j', label: 'Train together · no account yet', of: '11.2', status: 'live', note: 'a room needs an identity — so the answer is the front door, never an error line', render: () => (
    <InApp><TrainTogetherSheet onClose={noop} pair={pairFixture({ stage: 'idle', signedIn: false, standing: null, partnerName: null, partnerHere: false })} /></InApp>
  ) },
  { id: '11.2h', label: 'Train together · the guest adopts', of: '11.2', status: 'live', note: 'same lifts, same order, his own weights', render: () => (
    <InApp><TrainTogetherSheet onClose={noop} pair={pairFixture({ stage: 'planReady', role: 'guest', standing: null })} /></InApp>
  ) },
  { id: '11.2i', label: 'His swap, proposed', of: '11.2', status: 'live', note: 'accept and both move; decline and both stay — the pair survives either', render: () => (
    <InApp><PairSwapSheet from="bb_bench_press" to="db_bench_press" partner="Dana" onYes={noop} onNo={noop} /></InApp>
  ) },
  { id: '11.3', label: 'The partner, seen', status: 'todo', note: 'needs a server to carry a feed' },
  { id: '11.4', label: 'Share your plan', status: 'live', note: 'the card IS the payload — no weight is in it', render: () => (
    <InApp><SharePlanView splitName="Upper / Lower" plan={sharedFixture} onSend={noop} onPreview={noop} onBack={noop} /></InApp>
  ) },
  /*
   * ⛔ THE CONTAINERS, NOT ONLY THEIR VIEWS — founder, 2026-08-02.
   *
   * `SharePlanScreen` and `PlanReceivedScreen` are seventy-line routes that load the data and hand
   * it to the views above. Filing only the views was defensible right up until the moment it was
   * not: a container is where the LOADING and EMPTY states live, and those are states an athlete
   * really sees. 11.4 draws a plan that is already in memory; 11.4b is the same screen reading it
   * off disk, which is the one that can be empty.
   */
  { id: '11.5', label: 'Plan, received', status: 'live', render: () => (
    <InApp><PlanReceivedView splitName="Upper / Lower" plan={sharedFixture} onAdopt={noop} onDecline={noop} /></InApp>
  ) },
  /* ⛔ THE SOCIAL HOME (founder 2026-08-23: "החלק החברתי צריך להיות נישה נפרדת") — the cards on
     demand, the plan in/out (moved from You), the together record. The CIRCLE builds into this
     screen when its CloudKit cycle lands. Door: the disc beside Progress's title. */
  { id: '11.6', label: 'Together — the social home', status: 'live', note: 'everything that moves between people, in one place; the circle lands here', render: () => (
    <InApp>
      <TogetherView
        sessionCard={sessionCard as never}
        weekCard={weekCard as never}
        hasPlan
        sharedCount={3}
        circleReady
        circle={null}
        onTrainTogether={noop}
        onCreateCircle={noop}
        onJoinCircle={noop}
        onLeaveCircle={noop}
        onShareSession={noop}
        onShareWeek={noop}
        onSendPlan={noop}
        onBringPlan={noop}
        onBack={noop}
      />
    </InApp>
  ) },
  { id: '11.7', label: 'the circle, alive', of: '11.6', status: 'live', note: 'one fact per partner — done of planned; the allow-list is domain/circle', render: () => (
    <InApp>
      <TogetherView
        onTrainTogether={noop}
        /* ⛔ THE COMMUNITY FACT — a SUM with everybody on one side of it, and the together record
           read from her own history. See `domain/circle.circleWeekTotal` for why this is not a
           table of names in order. */
        weekTogether={{ done: 11, people: 4 }}
        /* The SAME count the row above prints — one derivation, and a fixture that disagreed with
           itself is how the two-numbers defect was seen at all. */
        trainedTogether={{ count: 3, names: ['Dana', 'Yonatan'] }}
        sessionCard={sessionCard as never}
        weekCard={weekCard as never}
        hasPlan
        sharedCount={3}
        circleReady
        circle={{ code: 'HKM4Q7', members: [
          { name: 'Sigal', done: 3, planned: 4, at: 0 },
          { name: 'Omer', done: 4, planned: 4, at: 0 },
          { name: 'Dana', done: 1, planned: 3, at: 0 },
        ] }}
        onCreateCircle={noop}
        onJoinCircle={noop}
        onLeaveCircle={noop}
        onShareSession={noop}
        onShareWeek={noop}
        onSendPlan={noop}
        onBringPlan={noop}
        onBack={noop}
      />
    </InApp>
  ) },

  /*
   * ── SURFACES THAT WERE BUILT AND HAD NO ENTRY ────────────────────────────────────────────────
   *
   * ⛔ FOUNDER, 2026-08-02: *"I don't want a screen in the code that is supposed to appear and does
   * not appear in the gallery."* Five of them: a whole progress report, the paused stage, the
   * three-line explanation, the run's own path, and the sheet whose fade he reported twice — none
   * of which he could look at without running the app and reaching the state.
   *
   * That is this file's own law (`everythingBuiltCanBeReached`) failing quietly, which is the exact
   * reason the law exists.
   */
  { id: '2.9', label: 'Paused · the stage held', status: 'live', note: 'resume, end, and the pain door', render: () => (
    <InApp>
      <PausedStage subject={exerciseDisplayName('bb_bench_press')} onResume={noop} endLabel="End session" onEnd={noop} onPain={noop}>
        <View style={{ height: 220 }} />
      </PausedStage>
    </InApp>
  ) },
  { id: '4.9', label: 'The run, drawn', status: 'live', note: 'the engraved path a GPS run leaves behind', render: () => (
    <InApp>
      <RouteTrace width={320} height={200} route={Array.from({ length: 60 }, (_, i) => ({
        lat: 32.08 + Math.sin(i / 9) * 0.004 + i * 0.00012,
        lon: 34.78 + Math.cos(i / 7) * 0.005,
        at: 1_760_000_000_000 + i * 20_000,
      })) as never} />
    </InApp>
  ) },

  // ── 13 · WHEN SOMETHING HURTS ──────────────────────────────────────────────────────────────
  { id: '13.1', label: 'Paused · the affordance', status: 'live', note: 'the door sits under the two acts', render: () => mount(SessionFlow, undefined, pausedFixture) },
  { id: '13.2', label: 'Something hurts — the conversation', status: 'live', note: 'the body map is gone; she tells the coach', render: () => mount(PainWhere, { exerciseId: 'bb_bench_press' }) },
  /*
   * ⛔ THE RECEIPT, WHICH NOBODY COULD LOOK AT (2026-08-22). It is reachable only by filing a real
   * report against a real profile, so the one screen in the product whose whole job is to prove a
   * report was acted on had never been reviewed — and it was a headline, a sentence, and 55% empty
   * black. Both severities, because they answer differently: a twinge rests nothing.
   */
  { id: '13.3', label: 'what I did about it — rested', of: '13.2', status: 'live', note: 'the muscle is in clay on her own map, for the days it has left', render: () => mount(PainWhere, { previewDone: { muscle: 'Chest', severity: 'pain' } }) },
  /* ⚠️ `of` IS THE SCREEN, NEVER ANOTHER STATE — a state hanging off a state is drawn nowhere in
     the index, and the law caught it the first time it was written. */
  { id: '13.3b', label: 'a twinge — the movement goes, the muscle stays', of: '13.2', status: 'live', note: 'nothing rests, so nothing is clay: the mark is the selection ring', render: () => mount(PainWhere, { previewDone: { muscle: 'Shoulders', severity: 'twinge' } }) },
  /*
   * ⚠️ `PlanWeek` was built, shipped on TWO screens, and was not in here — the founder could not
   * look at the one component that shows her the programme. That is this file's own law
   * (`everythingBuiltCanBeReached`) failing about the newest thing in the app.
   */
];

export const DEFAULT_SCREEN = '';
