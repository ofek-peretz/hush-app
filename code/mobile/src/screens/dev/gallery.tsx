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
// @ts-nocheck

// 

import React from 'react';
import { View, StyleSheet, Animated, ScrollView } from 'react-native';
import { AppContext } from '@/state/stores/appStore';
import { SessionContext } from '@/state/stores/sessionStore';
import { HushTabBar } from '@/app/HushTabBar';
import { ToastProvider, Button } from '@/components/ds';
import { Authentication } from '@/screens/onboarding/Authentication';
import { Start } from '@/screens/onboarding/Start';
import { AboutYou } from '@/screens/onboarding/AboutYou';
import { BodyMap } from '@/screens/onboarding/BodyMap';
import { BodyMapEdit } from '@/screens/profile/BodyMapEdit';
import { ImportPlan } from '@/screens/import/ImportPlan';
import { ImportReview } from '@/screens/import/ImportReview';
import { ConnectHealth } from '@/screens/onboarding/ConnectHealth';
import { BuildingProgramme } from '@/screens/onboarding/BuildingProgramme';
import { ProgramCreated } from '@/screens/onboarding/ProgramCreated';
import { HomeView, type HomePlanLift } from '@/screens/home/HomeView';
import { WheelPicker } from '@/components/ds';
import { TimeStage } from '@/screens/session/ItemStage';
import { coachFacts } from '@/domain/coachFacts';
import { coachRequest } from '@/domain/coachPrompt';
import { COACH_PLAN_SCHEMA, parseCoachPlan } from '@/domain/coachPlan';
import { askCoach } from '@/platform/coach/coachClient';
import { fixtureModel } from '@/data/api/fixtureModel';
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
import { LiftDetailView } from '@/screens/progress/LiftDetail';
import { CardioReady } from '@/screens/cardio/CardioReady';
import { CardioDetail } from '@/screens/cardio/CardioDetail';
import { CardioLiveView, CardioComplete, CardioCountdown, KmMoment } from '@/screens/cardio/Cardio';
import { HistoryView } from '@/screens/history/History';
import { WorkoutDetailView } from '@/screens/history/WorkoutDetail';
import { ProfileSheet } from '@/screens/profile/ProfileSheet';
import { Paywall } from '@/screens/subscription/Paywall';
import { ShareCardModal } from '@/screens/share/ShareCardModal';
import { NotificationAsk } from '@/screens/onboarding/NotificationAsk';
import { WelcomeBackView } from '@/screens/comeback/WelcomeBack';
import { LapsedView } from '@/screens/subscription/Lapsed';
import { OnYourWristView } from '@/screens/watch/OnYourWrist';
import { SharePlanView } from '@/screens/plan/SharePlan';
import { PlanReceivedView } from '@/screens/plan/PlanReceived';
import { PainWhere } from '@/screens/pain/PainWhere';
import { ProgressReportView } from '@/screens/progress/ProgressReportView';
import { PausedStage } from '@/components/PausedStage';
import { RouteTrace } from '@/components/RouteTrace';
import { ExerciseDemo } from '@/components/ExerciseDemo';
import { exerciseCues, exerciseDisplayName, EXERCISES } from '@/data/exercises';
import { tg } from '@/i18n';
import { WhyChangedSheet, type WhyChangedProps } from '@/components/WhyChangedSheet';
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
  // An ordinary set: a rest follows it, so nothing is chained. 2.2k drives the superset.
  straightInto: null,
  nextExerciseId: 'bb_bench_press',
  setLabel: { n: 2, m: 4 },
  /* What the coach wrote about this workout — behind the KEY POINTS disc, not on the stage. */
  emphases: [
    { ex: 'bb_bench_press', say: 'Leave one rep in the tank on the first two sets. The last one is the one I am reading.' },
    { ex: 'db_row', say: 'Your right side has been the slower one for three weeks, so start every set on it.' },
  ],
  reviseToday: () => 0,
  lastTime: { ago: 4, loadKg: 32.5, reps: [9, 9, 8] },
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
} as unknown as React.ContextType<typeof SessionContext>;

/** 2.4b · TRANSITION REST — the crossing from Bench Press to Overhead Press. */
const crossingFixture = {
  ...(sessionFixture as unknown as Record<string, unknown>),
  displayPhase: 'REST_TRANSITION',
  restSeconds: 72,
  nextExerciseId: 'bb_overhead_press',
  nextExercise: { id: 'bb_overhead_press', name: 'Overhead Press', muscle: 'Shoulders', equipment: 'barbell' },
  nextTarget: { exerciseId: 'bb_overhead_press', setIndex: 0, recommendedWeight: 22.5, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
  nextSetLabel: { n: 1, m: 4 },
  correction: null,
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
  straightInto: 'Barbell Row',
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
    await db.saveProfile({ sex: 'female', weightKg: 62, units: 'kg', goal: 'build_muscle', daysPerWeek: 4, repBand: '8-10', healthConnected: false });
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
  say: { color: cream[2], fontSize: 17, fontStyle: 'italic' },
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
      profile: { sex: 'female', weightKg: 62, units: 'kg', goal: 'build_muscle', daysPerWeek: 4, repBand: '8-10', healthConnected: false },
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
  const routes = ['Today', 'Cardio', 'Progress', 'You'].map((name) => ({ key: name, name }));
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
  { km: 1, durationSec: 362, paceSec: 362, gait: 'run' as const },
  { km: 2, durationSec: 371, paceSec: 371, gait: 'run' as const },
  { km: 3, durationSec: 384, paceSec: 384, gait: 'run' as const },
  { km: 4, durationSec: 379, paceSec: 379, gait: 'run' as const },
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
const whyRaised: WhyChangedProps = {
  liftName: 'Barbell Row',
  dateLabel: '18 Jul',
  verdict: 'up',
  loadFrom: '44',
  loadTo: '47.5',
  unit: 'kg',
  delta: '+3.5',
  band: [8, 10],
  title: 'Your reps\nsized this.',
  bandNote: 'Every rep landed inside your band',
  sessions: [
    { label: '15 July · last session', figure: '44 × 9·9·8', reached: false },
    { label: '18 July · today', figure: '44 × 10·10·10', reached: true },
  ],
  line: 'Two sessions, every rep inside 8–10. That’s the signal to load — so I did, by the smallest honest step.',
  onClose: noop,
};

const whyHeld: WhyChangedProps = {
  ...whyRaised,
  liftName: 'Bench Press',
  dateLabel: '22 Jul',
  verdict: 'hold',
  loadFrom: null,
  loadTo: '44',
  delta: null,
  title: 'Your reps\nheld this.',
  bandNote: 'Inside your band — but short of the top',
  sessions: [
    { label: '15 July · last session', figure: '44 × 8·8·7', reached: false },
    { label: '22 July · today', figure: '44 × 9·8·8', reached: false },
  ],
  line: 'Both sessions stayed inside 8–10 — but neither reached the top twice. So I hold. Top your band and the weight goes up.',
};

const whyEased: WhyChangedProps = {
  ...whyRaised,
  liftName: 'Back Squat',
  dateLabel: '22 Jul',
  verdict: 'down',
  loadFrom: '60',
  loadTo: '57.5',
  delta: '−2.5',
  title: 'Your reps\nasked for less.',
  bandNote: 'Reps fell below your band, twice',
  sessions: [
    { label: '15 July · last session', figure: '60 × 6·6·5', reached: false },
    { label: '22 July · today', figure: '60 × 6·5·5', reached: false },
  ],
  line: 'Reps came in under your band both times. Two sessions below the floor is my signal to ease — so I did, by the smallest honest step. No guess about why; win the band back and it returns.',
};

/** 2.6 · MILESTONE — the seal, at the size and rhythm the handoff draws it. */
function MilestoneBeat({ value, caption, title, meta, glyph }: { value: string; caption: string; title: string; meta: string; glyph?: 'plates' }) {
  return (
    <View style={milestoneStyles.body}>
      <Legend size={17} track={0.24} align="center" tone="onStage">MILESTONE</Legend>
      <View style={milestoneStyles.seal}>
        <MilestoneEmblem size={216} onStage pulse value={value} caption={caption} glyph={glyph} />
      </View>
      <View style={milestoneStyles.words}>
        <Text style={milestoneStyles.title}>{title}</Text>
        <Legend size={17} track={0} weight="regular" align="center" tone="onStage">{meta}</Legend>
      </View>
    </View>
  );
}

const milestoneStyles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, marginTop: -20, backgroundColor: stage[0] },
  seal: { marginTop: 30, marginBottom: 30 },
  words: { alignItems: 'center', gap: 10 },
  title: { fontFamily: font.serif, fontSize: 40, lineHeight: 46, color: stage.ink0, textAlign: 'center' },
});

/** 3.2 · PROGRESS — LIFTS. The handoff's own six weeks: 186 t, 38 raises, 18 workouts. */
const progressView = (
  <ProgressLifts
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
const liftRow = (exerciseId: string, name: string, from: number, to: number) => ({
  exerciseId,
  name,
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
      observation: explain(to > from ? 'progressLoad.observation' : 'reprice.observation', { ex: name }),
      conclusion: explain(to > from ? 'progressLoad.conclusion' : 'reprice.conclusion'),
      action: explain(to > from ? 'progressLoad.action' : 'reprice.action', to > from ? { delta: +(to - from).toFixed(2) } : { load: to }),
      text: explain(to > from ? 'progressLoad.text' : 'reprice.text', to > from ? { ex: name, delta: +(to - from).toFixed(2) } : { ex: name, load: to }),
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
        liftRow('bb_bench_press', 'Barbell Bench Press', 34, 41),
        liftRow('bb_row', 'Barbell Row', 44, 47.5),
        liftRow('bb_overhead_press', 'Overhead Press', 21, 22.5),
        liftRow('lat_pulldown', 'Lat Pulldown', 45, 47.5),
        liftRow('triceps_pushdown', 'Triceps Pushdown', 16, 17.5),
        liftRow('bb_curl', 'Barbell Curl', 25, 26),
      ] },
      { dayId: 'd1', name: 'Lower A', groups: ['Quads', 'Hamstrings'], lifts: [
        // The one that came DOWN: matched to what her reps showed, drawn in blue, never red.
        liftRow('front_squat', 'Front Squat', 38.5, 34),
        liftRow('bb_rdl', 'Romanian Deadlift', 60, 62.5),
        liftRow('leg_press', 'Leg Press', 120, 122.5),
        liftRow('leg_curl', 'Leg Curl', 32, 34),
        liftRow('standing_calf_raise', 'Standing Calf Raise', 40, 42.5),
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
const steadyHistory = [0, 1, 2, 3, 4, 5].map((week) => {
  const at = new Date(daysAgo(38 - week * 7)).toISOString();
  const load = (base: number, step: number) => base + step * week;
  return {
    id: `sv-steady-${week}`,
    programDayId: 'd0',
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
});

const steadyWeek = {
  plan: { weekIndex: 5, at: new Date().toISOString(), changedCount: 0, seen: false, workouts: [], volume: [] },
  band: { done: 4, planned: 4, tonnes: 46.8, kcal: 3120 },
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
  sets: [
    ['bb_bench_press', 34, 9], ['bb_bench_press', 34, 9], ['bb_bench_press', 34, 8], ['bb_bench_press', 34, 8],
    ['bb_overhead_press', 21, 8], ['bb_overhead_press', 21, 8], ['bb_overhead_press', 21, 8],
    ['bb_row', 44, 8], ['bb_row', 44, 7], ['bb_row', 44, 6],
    ['bb_curl', 25, 9], ['bb_curl', 25, 8],
  ].map(([exerciseId, w, r], i) => ({
    exerciseId,
    setIndex: i,
    actualWeight: w,
    actualReps: r,
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
    { name: 'Upper B', muscleGroups: ['Shoulders', 'Arms', 'Back'], exerciseIds: ['a', 'b', 'c', 'd', 'e', 'f'] },
    { name: 'Lower B', muscleGroups: ['Hamstrings', 'Quads', 'Calves'], exerciseIds: ['a', 'b', 'c', 'd', 'e'] },
  ],
  repBandByMuscle: { Chest: '8-10', Back: '8-10', Quads: '8-10' },
};

/** 3.5 · THE WEEK IS DONE — Today, on a rest day that closes a full week (4/4). */
const weekDoneView = (
  <HomeView
    resting
    name="Erez"
    dayName={null}
    muscles=""
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
      { id: 'd0', name: 'Upper A', muscles: '', items: 6, minutes: 55, done: true },
      { id: 'd1', name: 'Lower A', muscles: '', items: 5, minutes: 50, done: true },
      { id: 'd2', name: 'Upper B', muscles: '', items: 6, minutes: 55, done: true },
      { id: 'd3', name: 'Lower B', muscles: '', items: 5, minutes: 48, done: true },
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
    { id: 'd0', name: 'Push A', muscles: '', items: 5, minutes: 48, done: true },
    { id: 'd1', name: 'Pull A', muscles: 'Back · Biceps', items: 4, minutes: 52, day: 'tue', changes: 3 },
    { id: 'd2', name: 'Legs A', muscles: '', items: 5, minutes: 55 },
    { id: 'd3', name: 'Push B', muscles: '', items: 5, minutes: 50, changes: 1 },
    { id: 'd4', name: 'Pull B', muscles: '', items: 4, minutes: 46, done: true, day: 'sun' },
  ];

  // The day's slots — names and set counts, known synchronously (this is the whole point of A.12).
  const slots: Record<string, { exerciseId: string; name: string; sets: number; load: number | null }[]> = {
    d0: [
      { exerciseId: 'bench', name: 'Barbell Bench Press', sets: 4, load: 41 },
      { exerciseId: 'ohp', name: 'Machine Shoulder Press', sets: 4, load: 22.5 },
      { exerciseId: 'tri', name: 'Overhead Triceps Extension', sets: 3, load: 27.5 },
    ],
    d1: [
      { exerciseId: 'row', name: 'Barbell Row', sets: 4, load: 47.5 },
      // A.15's own case: the catalog's longest name, in the narrowest column it ever gets.
      { exerciseId: 'rdl', name: 'Dumbbell Romanian Deadlift', sets: 4, load: 32.5 },
      { exerciseId: 'pull', name: 'Pull-Up', sets: 3, load: null },
      { exerciseId: 'curl', name: 'Barbell Curl', sets: 3, load: 25 },
    ],
    d2: [
      { exerciseId: 'squat', name: 'Barbell Back Squat', sets: 4, load: 62.5 },
      { exerciseId: 'legcurl', name: 'Seated Leg Curl', sets: 3, load: 36.5 },
    ],
    d3: [{ exerciseId: 'incline', name: 'Incline Dumbbell Press', sets: 4, load: 24 }],
    d4: [{ exerciseId: 'latpull', name: 'Lat Pulldown', sets: 4, load: 45 }],
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
      programTitle="Upper / Lower · 4 days a week · leading with Chest"
      muscles=""
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
const todayView = (
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
    programTitle="Upper / Lower · 4 days a week · leading with Chest"
    /* ⚠️ THE QUEUE IS THE THIRD ROW, AND THE FIRST TWO CARRY THEIR CHECKS. The eyebrow states
       "2 OF 4 DONE" now, so the column has to agree with it — it did not, and a screen that counts
       two finished workouts above four rows with no check on any of them is contradicting itself in
       the two places she looks first. Mid-week is also simply the truest state to review Today in. */
    dayName="Upper B"
    dayId="d2"
    muscles="Chest · Shoulders · Triceps"
    trainedThisWeek={2}
    startError={false}
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
      { exerciseId: 'bb_bench_press', name: 'Barbell Bench Press', load: 41, sets: 4, band: [8, 10], changed: 'up' as const },
      { exerciseId: 'bb_overhead_press', name: 'Overhead Press', load: 22.5, sets: 4, band: [8, 10], changed: 'down' as const },
      { exerciseId: 'bb_row', name: 'Barbell Row', load: 47.5, sets: 4, band: [8, 10], changed: 'up' as const },
      { exerciseId: 'bb_curl', name: 'Barbell Curl', load: 25, sets: 3, band: [8, 10] },
      { exerciseId: 'triceps_pushdown', name: 'Triceps Pushdown', load: 16, sets: 3, band: [8, 10] },
      { exerciseId: 'lateral_raise', name: 'Lateral Raise', load: 9, sets: 3, band: [10, 12] },
    ]}
    /* ⚠️ EVERY ROW CARRIES ITS OWN SHAPE. The week is a sequence of workouts now, and a row with
       nothing but a name is what made three quarters of it look like filler. */
    workouts={[
      { id: 'd0', name: 'Upper A', muscles: '', items: 6, minutes: 55, done: true },
      { id: 'd1', name: 'Lower A', muscles: '', items: 5, minutes: 50, done: true },
      { id: 'd2', name: 'Upper B', muscles: 'Chest · Shoulders · Triceps', items: 6, minutes: 55, changes: 3 },
      { id: 'd3', name: 'Lower B', muscles: 'Quads · Hamstrings · Calves', items: 5, minutes: 48, changes: 1 },
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
        {...(p.changes != null ? { changes: p.changes } : {})}
        {...(p.done ? { done: true } : {})}
        lifts={p.lifts as never}
        onForm={noop}
        onWhy={noop}
        onStart={noop}
        onClose={noop}
      />
    </InApp>
  );
}

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
   * ⛔ AND THEN 1.2e WENT (founder 2026-08-08): *"פציעות כאבים ומה אסור יהיה בBODYMAP לכן לא צריך
   * טקסט חופשי."* `YourGoal` asked for two paragraphs whose only reader was the AI's fact pack, and
   * the AI is out of the front door. The body map asks the same two things — what to lead with, what
   * to leave alone — in the form `assembleV5DayLists` actually reads.
   *
   * ⚠️ MOUNTED WITH AN EMPTY MAP, which is the state that matters: nothing marked, nothing off,
   * Continue live. The refusals (a third lead, an all-off body) are reached by pressing, not by a
   * fixture — they are the two things this screen exists to say out loud.
   */
  { id: '1.2e', label: 'What do I train? — the body map', status: 'live', note: 'four days · off · normal · lead, on one body she presses — two leads are honourable here', render: () => mount(BodyMap, { sex: 'female', weightKg: 62, daysPerWeek: 4 }) },
  /*
     ⛔ THREE DAYS — the state the founder hit and no fixture could produce (2026-08-12).

     *"אני מנסה לשים 2 שרירים על EMPHASIS וזה נותן לי רק על אחד משום מה."* It is the rule, not a
     bug: below the split every session trains the whole body, so a second lead always competes
     (`FULL_BODY_UNTIL_DAYS`). **What was broken is that the screen promised two anyway** — and the
     sentence explaining the refusal rendered below the fold, so he met a silent refusal.

     Every entry on this page sat at FOUR days, where two leads are honourable, so nothing here
     could draw the week most athletes actually pick.
  */
  { id: '1.2f', label: 'the body map on a THREE-day week', of: '1.2e', status: 'live', note: 'one lead, not two — and the refusal says why, where the control is', render: () => mount(BodyMap, { sex: 'female', weightKg: 62, daysPerWeek: 3 }) },
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
  { id: '2.1', label: 'Today', status: 'live', render: () => <InApp><UnderTabs active={0}>{todayView}</UnderTabs></InApp> },
  /* ⛔ WEEK ONE — nothing has been compared to anything, so there is no change pill and no arrow on
     any lift, and the eyebrow reads "0 OF 4". It used to differ from 2.1 by having no earned weekday
     pattern; the pattern is gone from Today entirely (founder 2026-08-12), so what is left is the
     honest difference: a week with no history behind it. */
  { id: '2.1c', label: 'week one — nothing compared yet', of: '2.1', status: 'live', note: 'no changes pill, no arrows: there is no previous week to read', render: () => (
    <InApp><UnderTabs active={0}>
      {React.cloneElement(todayView, { weekNumber: 1, briefCount: 0, trainedThisWeek: 0, trialLeft: 4 })}
    </UnderTabs></InApp>
  ) },
  /* ⚠️ A DONE SESSION AS THE OPEN ROW — founder A.16, in the one place it can still happen: she taps
     a finished workout to re-read it and the row opens exactly as an offer does. */
  { id: '2.1d', label: 'a finished session, re-read', of: '2.1', status: 'live', note: 'the check holds, and the act refuses it', render: () => (
    <InApp><UnderTabs active={0}>
      {React.cloneElement(todayView, {
        dayId: 'd0',
        dayName: 'Upper A',
        dayDone: true,
        workouts: [
          { id: 'd0', name: 'Upper A', muscles: '', items: 6, minutes: 55, done: true },
          { id: 'd1', name: 'Lower A', muscles: 'Quads · Hamstrings · Glutes', items: 5, minutes: 50, changes: 2 },
          { id: 'd2', name: 'Upper B', muscles: '', items: 6, minutes: 55 },
          { id: 'd3', name: 'Lower B', muscles: '', items: 5, minutes: 48 },
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
      {React.cloneElement(todayView, {
        dayId: 'd1',
        dayName: 'Tempo + Core',
        workouts: [
          { id: 'd0', name: 'Easy 6k', muscles: '', day: 'sun', items: 1, timeUnknown: true, done: true },
          { id: 'd1', name: 'Tempo + Core', muscles: 'Core', day: 'wed', items: 7, minutes: 48 },
          /* ⚠️ `timeUnknown` — a long run has no honest minute count without a pace, and the card
             says how many things she does rather than inventing one. */
          { id: 'd2', name: 'Long run', muscles: '', day: 'fri', items: 1, timeUnknown: true },
        ],
      })}
    </UnderTabs></InApp>
  ) },
  { id: '2.1a', label: 'driven — tap the rows', of: '2.1', status: 'live', note: 'tap the ROWS: A.5 units · A.12 no flicker · A.15 the long name · A.16 the done row', render: () => <InApp><UnderTabs active={0}><TodayDriven /></UnderTabs></InApp> },
  { id: '2.1b', label: 'The why sheet — raised', status: 'live', render: () => <InApp><WhyChangedSheet {...whyRaised} /></InApp> },
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
    name: 'Upper Body A', dayLabel: 'Monday', minutes: 50, changes: 2,
    lifts: [
      { exerciseId: 'bb_bench_press', name: 'Barbell Bench Press', load: 57.5, sets: 4, band: [8, 10], changed: 'up' },
      { exerciseId: 'bb_row', name: 'Barbell Row', load: 45, sets: 4, band: [8, 10] },
      { exerciseId: 'lat_pulldown', name: 'Lat Pulldown', load: 42.5, sets: 3, band: [8, 10], changed: 'down' },
      { exerciseId: 'db_shoulder_press', name: 'Dumbbell Shoulder Press', load: 16, sets: 3, band: [8, 10] },
      { exerciseId: 'lateral_raise', name: 'Lateral Raise', load: 7, sets: 3, band: [10, 12] },
      /* `tri_pushdown` was not an exercise. The catalogue calls it `triceps_pushdown`, and every
         sibling row here uses a real id — so `onForm` on this one row opened a lift that does not
         exist. Another thing `@ts-nocheck` on this file had nothing to say about. */
      { exerciseId: 'triceps_pushdown', name: 'Triceps Pushdown', load: 20, sets: 3, band: [10, 12] },
    ],
  }) },
  /* ⚠️ A FINISHED SESSION she opened to re-read. The plan is hers to read; the act is refused —
     a record must never wear an offer's clothes (founder 2026-07-11). */
  { id: '2.1g', label: 'already trained', of: '2.1f', status: 'live', note: 'a record, not an offer', render: () => preWorkout({
    name: 'Lower Body A', dayLabel: 'Wednesday', minutes: 45, done: true,
    lifts: [
      { exerciseId: 'bb_back_squat', name: 'Barbell Back Squat', load: 72.5, sets: 4, band: [8, 10] },
      { exerciseId: 'bb_rdl', name: 'Romanian Deadlift', load: 62.5, sets: 4, band: [8, 10] },
      { exerciseId: 'leg_press', name: 'Leg Press', load: 100, sets: 4, band: [10, 12] },
      { exerciseId: 'leg_curl', name: 'Leg Curl', load: 34, sets: 3, band: [10, 12] },
      { exerciseId: 'standing_calf_raise', name: 'Standing Calf Raise', load: 42.5, sets: 3, band: [10, 12] },
    ],
  }) },
  /* ⚠️ AND A WEEK WITH NO DAYS YET — the commonest state for a new athlete, and the one a live
     harness cannot reach because it takes a fortnight of history to leave it. No day label, no
     change pill: nothing has been compared against anything. */
  { id: '2.1h', label: 'week one', of: '2.1f', status: 'live', note: 'no day, no changes: nothing to compare yet', render: () => preWorkout({
    name: 'Full Body A', minutes: 45, changes: 0,
    lifts: [
      { exerciseId: 'bb_back_squat', name: 'Barbell Back Squat', load: 40, sets: 3, band: [8, 10] },
      { exerciseId: 'bb_bench_press', name: 'Barbell Bench Press', load: 30, sets: 3, band: [8, 10] },
      { exerciseId: 'bb_row', name: 'Barbell Row', load: 30, sets: 3, band: [8, 10] },
      { exerciseId: 'bb_rdl', name: 'Romanian Deadlift', load: 35, sets: 3, band: [8, 10] },
      { exerciseId: 'pull_up', name: 'Pull-up', load: null, sets: 3, band: [5, 8] },
    ],
  }) },
  { id: '2.1j', label: 'held', of: '2.1b', status: 'live', render: () => <InApp><WhyChangedSheet {...whyHeld} /></InApp> },
  { id: '2.1k', label: 'eased', of: '2.1b', status: 'live', render: () => <InApp><WhyChangedSheet {...whyEased} /></InApp> },
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
      lastTime: { ago: 4, loadKg: 32.5, reps: [8, 8, 7, 6] },
    }) },
  { id: '2.2l', label: 'Loop 1 eased it mid-lift', of: '2.2', status: 'live', note: 'mid-lift · ↓2.5 against the SET BEFORE, and the per-side RETURNS because the bar must be re-loaded', render: () =>
    mount(SessionFlow, undefined, {
      ...sessionFixture,
      setsSoFar: [9, 5],
      loadsSoFar: [34, 34],
      setLabel: { n: 3, m: 4 },
      currentTarget: { ...sessionFixture.currentTarget!, recommendedWeight: 31.5 },
      lastTime: { ago: 4, loadKg: 30, reps: [8, 8, 7, 6] },
    }) },
  { id: '2.2m', label: 'nothing moved', of: '2.2', status: 'live', note: 'set 3 of 4 · nothing moved, so no delta and no per-side: three things on the screen', render: () =>
    mount(SessionFlow, undefined, {
      ...sessionFixture,
      setsSoFar: [8, 7],
      loadsSoFar: [34, 34],
      setLabel: { n: 3, m: 4 },
      lastTime: { ago: 4, loadKg: 34, reps: [8, 8, 7, 6] },
    }) },
  { id: '2.2i', label: 'a rep down, and a rep up', of: '2.2', status: 'live', note: 'set 3 of 4 · moss above the band, blue below — the landing law, on her own sets', render: () =>
    mount(SessionFlow, undefined, {
      ...sessionFixture,
      setsSoFar: [11, 6],
      setLabel: { n: 3, m: 4 },
      lastTime: { ago: 4, loadKg: 32.5, reps: [9, 9, 8, 8] },
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
        title="Bench Press"
        cues={exerciseCues('bb_bench_press')}
        focusLabel={tg('workout.focusOn')}
        formGuideLabel={tg('workout.formGuide')}
        doneLabel={tg('workout.tapAnywhere')}
        exerciseId="bb_bench_press"
        onDone={noop}
      />
    </InApp>
  ) },
  { id: '2.3', label: 'The correction', status: 'live', render: () => (
    <InApp>
      <Logged
        units="kg"
        confirm={{ weight: 34, reps: 5, n: 2, m: 4 }}
        correction={{ exerciseId: 'bb_bench_press', direction: 'down', from: 34, to: 31.5, reps: 5, band: [8, 10] } as never}
      />
    </InApp>
  ) },
  /* ⛔ THE THIRD OUTCOME, AND IT IS THE COMMONEST ONE (founder 2026-08-04). 2.3 above mounts a
     correction, so for a year this page could only ever show the band on a set that MISSED — and so
     could the app. A set that lands where it was asked to had no picture anywhere, which is how it
     stayed missing: nothing here could produce the state, so nobody looked at it. */
  { id: '2.3d', label: 'the set that landed', of: '2.3', status: 'live', note: 'in the band — cream, and the load holds', render: () => (
    <InApp>
      <Logged units="kg" confirm={{ weight: 34, reps: 9, n: 2, m: 4, band: [8, 10] }} />
    </InApp>
  ) },
  /* ⚠️ OUT OF THE BAND WITH THE LOAD HELD — the case the correction reveal cannot draw. Two
     corrections per lift is the cap, there is none after the last set, and the rail can cancel a
     raise: in all three her reps left the band and nothing moved. The dot must still be outside. */
  { id: '2.3e', label: 'out of the band, load held', of: '2.3', status: 'live', note: 'the correction budget is spent — honest, not silent', render: () => (
    <InApp>
      <Logged units="kg" confirm={{ weight: 34, reps: 13, n: 3, m: 4, band: [8, 10] }} />
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
  { id: '2.3f', label: 'the lift is done', of: '2.3', status: 'live', note: 'every pip filled, the lift named, the band under it', render: () => (
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
          name="Plank"
          item={{ kind: 'time', ex: 'plank', seconds: 45, say: 'Ribs down, breathe. Stop when the hips drop, not before.' }}
          onDone={noop}
        />
      </OnStage>
    </InApp>
  ) },
  /*
     ⛔ `2.2g`, `2.2r` AND `2.2s` ARE DELETED (founder, 2026-08-12: *"חוץ מהפלאנק צריך למחוק את הכל
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
          { exerciseId: 'bb_bench_press', name: 'Barbell Bench Press' },
          { exerciseId: 'bb_overhead_press', name: 'Overhead Press' },
          { exerciseId: 'bb_row', name: 'Barbell Row' },
          { exerciseId: 'bb_curl', name: 'Barbell Curl' },
          { exerciseId: 'tri_pushdown', name: 'Triceps Pushdown' },
          { exerciseId: 'ab_crunch', name: 'Ab Crunch Machine' },
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
          { key: 'bb_bench_press', name: 'Barbell Bench Press', from: '34', to: '41', held: false,
            reason: { key: 'explain.progressLoad.text', params: { ex: 'Barbell Bench Press', delta: 7 } } },
          { key: 'bb_overhead_press', name: 'Overhead Press', from: '21', to: '22.5', held: false,
            reason: { key: 'explain.progressLoad.text', params: { ex: 'Overhead Press', delta: 1.5 } } },
          { key: 'bb_row', name: 'Barbell Row', from: '44', to: '44', held: true,
            reason: { key: 'explain.rungOutOfReach.text', params: { ex: 'Barbell Row' } } },
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
          { key: 'bb_bench_press', name: 'Barbell Bench Press', from: '34', to: '41', held: false,
            reason: { key: 'explain.progressLoad.text', params: { ex: 'Barbell Bench Press', delta: 7 } } },
          { key: 'lat_pulldown', name: 'Lat Pulldown', from: null, to: null, held: false, silent: true,
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
  { id: '2.5e', label: 'the poster — nothing changed', of: '2.5', status: 'live', note: 'a verdict, not a door', render: () => (
    <InApp>
      <SessionEarned
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
  { id: '2.6', label: 'Milestone', status: 'live', render: () => <InApp><MilestoneBeat value="40" caption="kg" title="Forty on the bench." meta="MEASURED · 17 JULY 2026" glyph="plates" /></InApp> },
  { id: '2.6b', label: 'ten workouts', of: '2.6', status: 'live', render: () => <InApp><MilestoneBeat value="10" caption="workouts" title="Ten workouts. You kept coming." meta="21.4 T MOVED · 8 RAISES · 3 WEEKS" /></InApp> },

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
  { id: '3.2', label: 'Progress — lifts', status: 'live', render: () => <InApp><UnderTabs active={2}>{progressView}</UnderTabs></InApp> },
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
      />
    </InApp>
  ) },
  { id: '3.3c', label: 'a cardio record', of: '3.3', status: 'live', render: cardioRecord },
  { id: '3.4', label: 'Cardio — live', status: 'live', note: "the clock is frozen — the harness has no GPS; the coach's words are behind the speech disc, top end", render: () => (
    <InApp>
      <CardioLiveView

        paceSec={342}
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
        paceSec={342}
        elapsedSec={26 * 60 + 14}
        distanceKm={4.62}
        targetMetres={6000}
        runName="Easy 6k"
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
        paceSec={0}
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

     The distance readout rides under the moving dot (`left: dotFrac%`, `marginLeft: -75`), so at
     the start of a kilometre the 150-wide box begins at **x = −75** and the leading `0` is off the
     screen: he saw ".00 km". Every run on this page sat mid-kilometre — `3.4f` is at 31%, where it
     centres perfectly — so the one state it breaks in had no entry. **It is the first minute of
     every run**, which is when she looks at the phone.
  */
  { id: '3.4n', label: 'the first seconds of a kilometre', of: '3.4', status: 'live', note: 'the distance readout is clamped inside the rail — it used to read ".00 km"', render: () => (
    <InApp>
      <CardioLiveView
        paceSec={0}
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

        paceSec={342}
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

        paceSec={342}
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

        paceSec={342}
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
  { id: '3.4c', label: 'Cardio — done', status: 'live', note: 'preview — the harness never writes a run to the log', render: () => (
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
  { id: '4.2', label: 'Bring your own programme', status: 'live', note: 'photograph a coach’s sheet or type it out — the door for the coach track', render: () => mount(ImportPlan) },
  { id: '4.2a', label: 'What we found in it', status: 'live', note: 'the report she reads before she chooses — nothing here is fixed, only named', render: () => mount(ImportReview, { sessionCount: 3, liftCount: 12, findings: [{ kind: 'unmatched_lift', subject: 'Zercher Squat' }, { kind: 'session_over_hour', subject: 'Push', value: 74 }, { kind: 'sets_above_ceiling', subject: 'bb_back_squat', value: 6 }], onKeep: () => {}, onBalance: () => {} }) },
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
  { id: '10.1', label: 'After a gap · the welcome back', status: 'live', render: () => (
    <InApp>
      <WelcomeBackView
        daysAway={11}
        unit="kg"
        lifts={[
          { exerciseId: 'bb_bench_press', name: 'Bench press', load: 42.5 },
          { exerciseId: 'bb_back_squat', name: 'Squat', load: 60 },
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
  { id: '11.1', label: 'Invite a partner', status: 'todo', note: 'needs a server between two devices — the launch is on-device only' },
  { id: '11.2', label: 'Shared session · your turn', status: 'todo', note: 'needs a live link between two phones' },
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
      <PausedStage subject="Barbell Bench Press" onResume={noop} endLabel="End session" onEnd={noop} onPain={noop}>
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
   * ⚠️ `PlanWeek` was built, shipped on TWO screens, and was not in here — the founder could not
   * look at the one component that shows her the programme. That is this file's own law
   * (`everythingBuiltCanBeReached`) failing about the newest thing in the app.
   */
];

export const DEFAULT_SCREEN = '';
