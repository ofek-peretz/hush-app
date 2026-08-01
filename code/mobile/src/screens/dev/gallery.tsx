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
import React from 'react';
import { View, StyleSheet, Animated, ScrollView } from 'react-native';
import { AppContext } from '@/state/stores/appStore';
import { SessionContext } from '@/state/stores/sessionStore';
import { HushTabBar } from '@/app/HushTabBar';
import { ToastProvider, Button } from '@/components/ds';
import { Authentication } from '@/screens/onboarding/Authentication';
import { NameEntry } from '@/screens/onboarding/NameEntry';
import { ConnectHealth } from '@/screens/onboarding/ConnectHealth';
import { ProgramCreated } from '@/screens/onboarding/ProgramCreated';
import { HomeView, type HomePlanLift } from '@/screens/home/HomeView';
import { TimeStage, DistanceStage, OpenStage } from '@/screens/session/ItemStage';
import { CoachChat, type CoachTurn } from '@/screens/coach/CoachChat';
import { useCoach } from '@/screens/coach/useCoach';
import { coachFacts } from '@/domain/coachFacts';
import { coachRequest } from '@/domain/coachPrompt';
import { COACH_PLAN_SCHEMA, parseCoachPlan } from '@/domain/coachPlan';
import { askCoach } from '@/platform/coach/coachClient';
import type { CoachDecision } from '@/domain/coachLog';
import type { CoachPlan, PlannedItem } from '@/domain/coachPlan';
import { askAfterSession } from '@/platform/coach/afterSession';
import type { Session } from '@/data/local/models';
import { db } from '@/data/local/db';
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
import { CoachScreen } from '@/screens/coach/CoachScreen';
import { CoachIntake } from '@/screens/onboarding/CoachIntake';
import { Paywall } from '@/screens/subscription/Paywall';
import { ShareCardModal } from '@/screens/share/ShareCardModal';
import { NotificationAsk } from '@/screens/onboarding/NotificationAsk';
import { WelcomeBackView } from '@/screens/comeback/WelcomeBack';
import { LapsedView } from '@/screens/subscription/Lapsed';
import { OnYourWristView } from '@/screens/watch/OnYourWrist';
import { SharePlanView } from '@/screens/plan/SharePlan';
import { PlanReceivedView } from '@/screens/plan/PlanReceived';
import { PainWhere } from '@/screens/pain/PainWhere';
import { PainResponse } from '@/screens/pain/PainResponse';
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
 *   `cancelled` — WITHDRAWN from the product (founder 2026-07-29). Not "later" and not "blocked":
 *              these are off the list, and they stay listed only so the id is never silently
 *              reused and nobody re-derives them from the handoff as missing work. They do not
 *              count against "built" — a screen the product does not want is not a screen it owes.
 */
export type ScreenStatus = 'live' | 'device' | 'todo' | 'cancelled';

export interface GalleryEntry {
  id: string;
  label: string;
  status: ScreenStatus;
  /** Why it cannot be shown here, or why it is not built. One short line. */
  note?: string;
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
  // The model seam, empty: every member a screen reaches for is optional there, so a gallery
  // mount simply yields nothing rather than booting the engine.
  model: {},
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
  nextExerciseId: 'bb_bench_press',
  setLabel: { n: 2, m: 4 },
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
  reportEffort: noop,
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
      <Text style={{ color: cream[1], fontSize: 13 }}>{state}</Text>
      <Text style={{ color: cream[2], fontSize: 11 }}>
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
  name: { color: cream[0], fontSize: 15, fontWeight: '600' },
  block: { gap: 2, paddingStart: 10 },
  rounds: { color: cream[2], fontSize: 11 },
  item: { color: cream[1], fontSize: 13 },
  say: { color: cream[2], fontSize: 12, fontStyle: 'italic' },
  dim: { color: cream[2], fontSize: 13, padding: 16 },
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

function LiveCoachChat() {
  React.useEffect(installProbe, []);
  // The coach's own past decisions, read back so they travel with the next call. Without this the
  // log is written and never read, which is the whole mechanism missing its return half.
  const [decided, setDecided] = React.useState<CoachDecision[]>([]);
  React.useEffect(() => { void db.loadCoachLog().then(setDecided); }, []);
  const facts = React.useMemo(
    () => coachFacts({
      profile: { sex: 'female', weightKg: 62, units: 'kg', goal: 'build_muscle', daysPerWeek: 4, repBand: '8-10', healthConnected: false },
      plan: null,
      history: [],
      decided,
    }),
    [decided],
  );
  const [note, setNote] = React.useState<string | null>(null);
  const coach = useCoach({
    facts,
    mode: 'intake',
    onAnswer: (a, meta) => {
      // The gallery is the only place a REAL answer can be inspected before it has anywhere to go.
      // A count on screen proves it parsed; it does not show whether the plan is any good, and it
      // does not show what the call cost — which is the number the model was chosen on.
      (globalThis as unknown as { __coachAnswer?: unknown }).__coachAnswer = { answer: a, meta };
      const u = meta.usage;
      setNote(
        [a.plan ? `${a.plan.sessions.length} sessions` : 'words only',
         u ? `in ${u.promptTokenCount} · out ${u.candidatesTokenCount} · thought ${u.thoughtsTokenCount ?? 0}` : meta.model,
        ].join(' — '),
      );
    },
    onTrouble: (t) => setNote(`no answer — ${t}`),
  });
  return (
    <>
      <CoachChat turns={coach.turns} busy={coach.busy} onSend={coach.send} invitation="Erez — tell me what you want, and I'll build it." />
      {note ? <Text style={{ color: cream[2], fontSize: 11, padding: 8 }}>{note}</Text> : null}
    </>
  );
}

function ScriptedCoachChat() {
  const [turns, setTurns] = React.useState<CoachTurn[]>([]);
  const [busy, setBusy] = React.useState(false);
  const n = React.useRef(0);
  const REPLIES = [
    'Good — that gives me the shape of it. How many days a week can you actually train, and roughly how long do you have each time?',
    'Right. And has anything been bothering you — anything that hurts, or that you have been working around?',
    'That is enough to start. I will build you the first week and we will correct it from what you actually do.',
  ];
  return (
    <CoachChat
      turns={turns}
      busy={busy}
      invitation={"Erez — tell me what you want, and I’ll build it."}
      onSend={(text) => {
        setTurns((t) => [...t, { id: `a${t.length}`, by: 'athlete', text }]);
        setBusy(true);
        setTimeout(() => {
          setBusy(false);
          const reply = REPLIES[Math.min(n.current++, REPLIES.length - 1)];
          setTurns((t) => [...t, { id: `c${t.length}`, by: 'coach', text: reply }]);
        }, 1400);
      }}
    />
  );
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

/** The onboarding answers 1.5 reads its name out of. */
const onboardingInputs = {
  name: 'Erez',
  sex: 'male',
  units: 'metric',
  daysPerWeek: 4,
  bodyweightKg: 78,
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
      <Legend size={12} track={0.24} align="center" tone="onStage">MILESTONE</Legend>
      <View style={milestoneStyles.seal}>
        <MilestoneEmblem size={216} onStage pulse value={value} caption={caption} glyph={glyph} />
      </View>
      <View style={milestoneStyles.words}>
        <Text style={milestoneStyles.title}>{title}</Text>
        <Legend size={13.5} track={0} weight="regular" align="center" tone="onStage">{meta}</Legend>
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
    entries={[
      { exerciseId: 'bb_row', mode: 'weight', initialPeakKg: 40, periodPeakKg: 47.5, series: [40, 41, 44, 44, 47.5] },
      { exerciseId: 'bb_bench_press', mode: 'weight', initialPeakKg: 30, periodPeakKg: 41, series: [30, 34, 34, 38, 41] },
      { exerciseId: 'bb_deadlift', mode: 'weight', initialPeakKg: 70, periodPeakKg: 92.5, series: [70, 80, 85, 90, 92.5] },
    ] as never}
    aggregate={{
      liftedKg: 186000,
      workouts: 18,
      weeks: 6,
      kcal: 82000,
      raises: 38,
      cardioKm: 32,
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

/**
 * Sun→Sat, four of them trained. `today` follows the DEVICE's weekday, because the eyebrow above
 * the strip reads off the same clock — a fixture that froze Friday would contradict itself on a
 * Monday, and this page's whole job is to show what the device shows.
 */
const weekStrip = [true, false, true, true, false, true, false].map((trained, i) => ({
  trained,
  today: i === new Date().getDay(),
}));

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
    workouts={[
      { id: 'd0', name: 'Upper A', muscles: '' },
      { id: 'd1', name: 'Lower A', muscles: '' },
      { id: 'd2', name: 'Upper B', muscles: '' },
      { id: 'd3', name: 'Lower B', muscles: '' },
    ]}
    weekDays={weekStrip}
    weekStats={{ tonnes: 46.8, kcal: 3120, loadsUp: 12 }}
    nextWorkoutName="Upper A"
    brief={null}
    briefCount={null}
    briefUnseen={false}
    onForm={noop}
    onStart={noop}
    onChooseWorkout={noop}
    onWeeklyUpdate={noop}
    onShare={noop}
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
  const [rows, setRows] = React.useState<HomePlanLift[] | null>(null);

  const workouts = [
    { id: 'd0', name: 'Push A', muscles: '', done: true },
    { id: 'd1', name: 'Pull A', muscles: '' },
    { id: 'd2', name: 'Legs A', muscles: '' },
    { id: 'd3', name: 'Push B', muscles: '' },
    { id: 'd4', name: 'Pull B', muscles: '', done: true },
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
      onShare={noop}
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
    dayName="Upper A"
    dayId="d0"
    muscles="Chest · Shoulders · Triceps"
    trainedThisWeek={2}
    startError={false}
    weekNumber={11}
    units="kg"
    planMinutes={55}
    plan={[
      // Two raises and one ease, so Today shows the direction law in one glance.
      { exerciseId: 'bench', name: 'Barbell Bench Press', load: 41, sets: 4, band: [8, 10], changed: 'up' as const },
      { exerciseId: 'ohp', name: 'Overhead Press', load: 22.5, sets: 4, band: [8, 10], changed: 'down' as const },
      { exerciseId: 'row', name: 'Barbell Row', load: 47.5, sets: 4, band: [8, 10], changed: 'up' as const },
      { exerciseId: 'curl', name: 'Barbell Curl', load: 25, sets: 3, band: [8, 10] },
      { exerciseId: 'push', name: 'Triceps Pushdown', load: 16, sets: 3, band: [8, 10] },
      { exerciseId: 'ab', name: 'Ab Crunch Machine', load: 25, sets: 3, band: [8, 10] },
    ]}
    workouts={[
      { id: 'd0', name: 'Upper A', muscles: '' },
      { id: 'd1', name: 'Lower A', muscles: '' },
      { id: 'd2', name: 'Upper B', muscles: '' },
      { id: 'd3', name: 'Lower B', muscles: '' },
      { id: 'd4', name: 'Upper C', muscles: '' },
      { id: 'd5', name: 'Lower C', muscles: '' },
    ]}
    brief={null}
    briefCount={3}
    briefUnseen={false}
    trialLeft={11}
    onForm={noop}
    onStart={noop}
    onChooseWorkout={noop}
    onWeeklyUpdate={noop}
    onShare={noop}
  />
);

/**
 * EVERY SCREEN IN THE HANDOFF, and where it stands. The ids match the handoff exactly, in the
 * handoff's own order, so this page can be read next to it line for line.
 */
export const GALLERY: GalleryEntry[] = [
  // ── 01 · ARRIVE ────────────────────────────────────────────────────────────────────────────
  { id: '1.1', label: 'Sign in', status: 'live', render: () => mount(Authentication) },
  { id: '1.2', label: 'Name + sex', status: 'live', render: () => mount(NameEntry) },
  { id: '1.3', label: 'Connect health', status: 'live', note: 'no watch paired — the wrist row is absent, which is most phones', render: () => mount(ConnectHealth, { sex: 'male' }) },
  // The harness has no WCSession, so without the seam the wrist row could only ever be looked at
  // ABSENT — and "absent" is the one state it says nothing in. Both faces, driven.
  { id: '1.3b', label: 'Connect health — a watch is paired', status: 'live', render: () => mount(ConnectHealth, { sex: 'male', previewWrist: 'confirm' }) },
  { id: '1.3c', label: 'Connect health — watch, not installed', status: 'live', render: () => mount(ConnectHealth, { sex: 'male', previewWrist: 'install' }) },
  // 1.4 · ABOUT YOU + YOUR WEEK — deleted 2026-08-01. Two wheel pickers asking a coach's
  // questions one screen before a coach; the intake prompt asks for both now.
  { id: '1.5', label: 'Ready', status: 'live', render: () => mount(ProgramCreated, { inputs: onboardingInputs }) },
  { id: '1.6', label: 'Bring your history', status: 'cancelled', note: 'founder 2026-07-29 — withdrawn' },

  // ── 02 · TRAIN ─────────────────────────────────────────────────────────────────────────────
  // The card rises once per install, so the harness has to hold it open — and it hands the
  // learning length (the handoff's own four) rather than reading a programme it does not have.
  { id: '2.0', label: 'First workout — the first four', status: 'live', note: 'shown over 2.2', render: () => mount(SessionFlow, { previewFirstGym: 4 }) },
  { id: '2.1', label: 'Today', status: 'live', render: () => <InApp><UnderTabs active={0}>{todayView}</UnderTabs></InApp> },
  { id: '2.1a', label: 'Today — driven', status: 'live', note: 'tap the chips: A.5 units · A.12 no flicker · A.15 the long name · A.16 the done chip', render: () => <InApp><UnderTabs active={0}><TodayDriven /></UnderTabs></InApp> },
  { id: '2.1b', label: 'The why sheet — raised', status: 'live', render: () => <InApp><WhyChangedSheet {...whyRaised} /></InApp> },
  { id: '2.1c', label: 'Why — held', status: 'live', render: () => <InApp><WhyChangedSheet {...whyHeld} /></InApp> },
  { id: '2.1d', label: 'Why — eased', status: 'live', render: () => <InApp><WhyChangedSheet {...whyEased} /></InApp> },
  { id: '2.1e', label: "When the day won't fit", status: 'cancelled', note: 'founder 2026-07-29 — withdrawn' },
  { id: '2.2', label: 'The set', status: 'live', render: () => mount(SessionFlow) },
  /* THE CASE THAT WAS INVISIBLE. Every fixture here held a two-digit whole load, so nobody could
     see that a decimal — or plain 100 kg — pushed the figure and its per-side annex off the screen
     (founder, build 36 · C.9). A widest-load entry is now standing furniture: 137.5 on a barbell is
     the widest figure the engine can prescribe together with the widest annex it can carry. */
  /* THE SWAP MOMENT — the first set of a lift, where the chrome carries THREE discs (pause left,
     swap + form right). It is the only state in which the stage bar's sides are uneven, and it is
     the state the founder photographed for A.6; every other 2.2 fixture sits on set 2, where the
     swap is gone and the bar self-corrects. Nothing could see it. */
  { id: '2.2e', label: 'The set — first set (swap offered)', status: 'live', note: 'three chrome discs: the only state where the bar’s sides differ', render: () =>
    mount(SessionFlow, undefined, {
      ...(sessionFixture as unknown as Record<string, unknown>),
      setLabel: { n: 1, m: 4 },
      nextSetLabel: { n: 2, m: 4 },
      currentTarget: { exerciseId: 'bb_bench_press', setIndex: 0, recommendedWeight: 34, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
    } as unknown as React.ContextType<typeof SessionContext>) },
  { id: '2.2d', label: 'The set — the widest load', status: 'live', note: 'a decimal load + a decimal per-side annex: the C.9 overflow', render: () =>
    mount(SessionFlow, undefined, {
      ...(sessionFixture as unknown as Record<string, unknown>),
      currentTarget: { exerciseId: 'bb_bench_press', setIndex: 1, recommendedWeight: 137.5, recommendedReps: 8, repBandLo: 8, repBandHi: 10 },
    } as unknown as React.ContextType<typeof SessionContext>) },
  { id: '2.2b', label: 'Edit set', status: 'live', note: 'tap the weight on 2.2', render: () => mount(SessionFlow) },
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
  { id: '2.2j', label: 'Form — a lift from the expansion', status: 'live', note: 'the 47 new lifts ship their cues in both languages and both voices: switch the bar under the frame', render: () => (
    <InApp>
      <ExerciseDemo
        title={exerciseDisplayName('single_leg_rdl')}
        cues={exerciseCues('single_leg_rdl')}
        focusLabel={tg('workout.focusOn')}
        formGuideLabel={tg('workout.formGuide')}
        doneLabel={tg('workout.tapAnywhere')}
        exerciseId="single_leg_rdl"
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
  /* THE BEAT THAT NOBODY COULD SEE. 2.3 above mounts `Logged` WITH a correction, so only the
     correction form was ever on this page — the plain "Set recorded" form had no entry at all, and
     survived a whole rebuild unlooked-at until the founder met it on a device (C.13). It no longer
     runs after an ordinary set; it is still what the phone shows for a set logged on the WRIST,
     which is the one place the athlete pressed nothing on this device. Standing furniture now. */
  { id: '2.3c', label: 'The wrist’s set, read back', status: 'live', note: 'the plain capture beat — only the watch raises it now', render: () => (
    <InApp>
      <Logged units="kg" confirm={{ weight: 14, reps: 8, n: 2, m: 4 }} />
    </InApp>
  ) },
  { id: '2.3b', label: 'Last set — how did that go?', status: 'live', note: 'press Complete set, then answer — the beat holds 6s for her', render: () => mount(SessionFlow, undefined, lastSetFixture) },
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
  { id: '0.0', label: 'The coach — the intake SCREEN', status: 'live', note: 'the real onboarding step, chrome and all — not the chat component', render: () => mount(CoachIntake, { inputs: onboardingInputs }) },
  { id: '0.0b', label: 'The coach — the conversation SCREEN', status: 'live', note: 'the real screen behind the corner of Today', render: () => mount(CoachScreen) },
  { id: '0.1', label: 'The coach — intake', status: 'live', note: 'type and send: a scripted reply lands after a beat', render: () => (
    <InApp>
      <OnStage>
        <ScriptedCoachChat />
      </OnStage>
    </InApp>
  ) },
  { id: '0.1a', label: 'The coach — LIVE', status: 'live', note: 'talks to the real Worker; with no token it shows the not-sent state honestly', render: () => (
    <InApp>
      <OnStage>
        <LiveCoachChat />
      </OnStage>
    </InApp>
  ) },
  { id: '0.1c', label: 'The coach — the week it built', status: 'live', note: 'reads back what the live conversation stored; the only place to judge whether the plan is good', render: () => (
    <InApp>
      <OnStage>
        <StoredCoachWeek />
      </OnStage>
    </InApp>
  ) },
  { id: '0.1d', label: 'The coach — after a workout', status: 'live', note: 'the call the product is built around; press it and see what the live coach decides', render: () => (
    <InApp>
      <OnStage>
        <AfterSessionProbe />
      </OnStage>
    </InApp>
  ) },
  { id: '0.1b', label: 'The coach — a message that did not land', status: 'live', note: 'sent, unanswered, and failed — the three states side by side', render: () => (
    <InApp>
      <OnStage>
        <CoachChat
          invitation={"Erez — tell me what you want, and I’ll build it."}
          onSend={noop}
          turns={[
            { id: '1', by: 'coach', text: 'How did the long run go?' },
            { id: '2', by: 'athlete', text: 'Eighteen kilometres, felt good.' },
            { id: '3', by: 'athlete', text: 'Slight twinge in the right hamstring at 14.', pending: true },
            { id: '4', by: 'athlete', text: 'Should I still do Thursday?', failed: true },
          ]}
        />
      </OnStage>
    </InApp>
  ) },
  { id: '2.2f', label: 'A held duration', status: 'live', note: 'press Start — it counts down; Stop ends it with what she actually held', render: () => (
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
  { id: '2.2g', label: 'A distance to cover', status: 'live', note: 'a loaded carry — no GPS, she does it and says so', render: () => (
    <InApp>
      <OnStage>
        <DistanceStage
          name="Farmer’s Carry"
          item={{ kind: 'distance', ex: 'farmer_carry', metres: 40, load: 24, say: 'Tall and slow. Put them down before your grip goes.' }}
          onDone={noop}
        />
      </OnStage>
    </InApp>
  ) },
  { id: '2.2h', label: 'Open — no number worth stating', status: 'live', note: 'the instruction IS the item', render: () => (
    <InApp>
      <OnStage>
        <OpenStage
          name="Mobility"
          item={{ kind: 'open', ex: 'mobility', say: 'Whatever your hips need today. Five minutes, no counting.' }}
          onDone={noop}
        />
      </OnStage>
    </InApp>
  ) },
  { id: '2.2i', label: 'A held duration — in the stage', status: 'live', note: '2.2f/g/h draw the stage bare; this is the workout screen ROUTING to it — chrome, pause and all', render: () => mount(SessionFlow, undefined, itemFixture) },
  { id: '2.4', label: 'Rest', status: 'live', render: () => mount(SessionFlow, undefined, restFixture) },
  { id: '2.4b', label: 'Transition rest', status: 'live', render: () => mount(SessionFlow, undefined, crossingFixture) },
  { id: '2.4e', label: 'Crossing into a run', status: 'live', note: 'the up-next card states the distance — it used to say “bodyweight”', render: () => mount(SessionFlow, undefined, crossingToRunFixture) },
  { id: '2.4c', label: 'The scan', status: 'live', note: 'held mid-read — lift 3 of 6', render: () => (
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
  { id: '2.4d', label: 'Rest — learned', status: 'live', note: 'press Start next set on 2.4', render: () => mount(SessionFlow, undefined, restFixture) },
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
  { id: '2.5b', label: 'Session earned — three muscles', status: 'live', note: 'C.15: three MUSCLES earned, not three exercises', render: () => (
    <InApp>
      <SessionEarned
        savedLegend="Upper A · Saved"
        partial={false}
        durationLabel="58"
        kcal={468}
        tonnes={13.2}
        answered
        decisions={[
          { key: 'bb_bench_press', name: 'Barbell Bench Press', from: '34', to: '36', held: false,
            reason: { key: 'explain.progressLoad.text', params: { ex: 'Barbell Bench Press', delta: 2 } } },
          { key: 'bb_row', name: 'Barbell Row', from: '44', to: '46', held: false,
            reason: { key: 'explain.progressLoad.text', params: { ex: 'Barbell Row', delta: 2 } } },
          { key: 'bb_overhead_press', name: 'Overhead Press', from: '21', to: '22.5', held: false,
            reason: { key: 'explain.progressLoad.text', params: { ex: 'Overhead Press', delta: 1.5 } } },
        ]}
        volume={[
          { muscle: 'Chest', setsFrom: 3, setsTo: 4, reason: { key: 'explain.volumeUp.text', params: { muscle: 'chest' } } },
          { muscle: 'Back', setsFrom: 3, setsTo: 4, reason: { key: 'explain.volumeUp.text', params: { muscle: 'back' } } },
          { muscle: 'Shoulders', setsFrom: 2, setsTo: 3, reason: { key: 'explain.volumeUp.text', params: { muscle: 'shoulders' } } },
        ]}
        onDone={noop}
        onRecord={noop}
        onShare={noop}
      />
    </InApp>
  ) },
  { id: '2.5', label: 'What this session earned', status: 'live', render: () => (
    <InApp>
      <SessionEarned
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
        onShare={noop}
      />
    </InApp>
  ) },
  { id: '2.6', label: 'Milestone', status: 'live', render: () => <InApp><MilestoneBeat value="40" caption="kg" title="Forty on the bench." meta="MEASURED · 17 JULY 2026" glyph="plates" /></InApp> },
  { id: '2.6b', label: 'Milestone — ten workouts', status: 'live', render: () => <InApp><MilestoneBeat value="10" caption="workouts" title="Ten workouts. You kept coming." meta="21.4 T MOVED · 8 RAISES · 3 WEEKS" /></InApp> },
  { id: '2.6c', label: 'The block, sealed', status: 'cancelled', note: 'founder 2026-07-29 — withdrawn with the 12-session block' },

  // ── 03 · REFLECT ───────────────────────────────────────────────────────────────────────────
  { id: '3.1', label: 'The Saturday letter', status: 'live', note: "a week WITH decisions — the handoff's own example, nothing special about its number", render: () => mount(WeeklyUpdate, { previewPlan: letterWeek }) },
  { id: '3.1b', label: 'The one question', status: 'live', note: 'held open on Quads', render: () => mount(WeeklyUpdate, { previewAskBack: 'Quads' }) },
  { id: '3.1c', label: 'The Saturday letter — a steady week', status: 'live', note: 'nothing changed; the standing record answers', render: () => mount(WeeklyUpdate, { previewPlan: steadyWeek }) },
  { id: '3.2', label: 'Progress — lifts', status: 'live', render: () => <InApp><UnderTabs active={2}>{progressView}</UnderTabs></InApp> },
  { id: '3.2b', label: 'Lift detail', status: 'live', note: 'tap a point on the climb', render: () => <InApp>{liftDetailView}</InApp> },
  // C.18's own states. 3.2b hands the screen EIGHT training days, so the two an athlete actually
  // opens it on first — one day, and none — had no entry at all. One day is where "no graph" came
  // from: `Climb` drew a lone dot in a 138 px box.
  { id: '3.2c', label: 'Lift detail — one day', status: 'live', note: 'the climb has not started yet — C.18', render: () => (
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
  { id: '3.2d', label: 'Lift detail — never trained', status: 'live', render: () => (
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
  { id: '3.3b', label: 'The record', status: 'live', render: () => (
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
  { id: '3.3c', label: 'Cardio record', status: 'live', render: cardioRecord },
  { id: '3.4', label: 'Cardio — live', status: 'live', note: 'the clock is frozen — the harness has no GPS', render: () => (
    <InApp>
      <CardioLiveView
        elapsedSec={26 * 60 + 14}
        distanceKm={4.62}
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
  { id: '3.4d', label: 'Cardio — 3·2·1', status: 'live', note: 'the countdown legend — B.6', render: () => <InApp><CardioCountdown count={2} /></InApp> },
  // B.8's two doors. 3.4 mounts the run UNPAUSED, so neither the pause stage's end control nor
  // the confirmation behind it could be read — and "סיים ושמור" (masculine) was on both.
  { id: '3.4e', label: 'Cardio — paused', status: 'live', note: 'the finish control — B.8', render: () => (
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
        onResume={noop}
        onAskEnd={noop}
        onKeepGoing={noop}
        onFinish={noop}
      />
    </InApp>
  ) },
  { id: '3.4f', label: 'Cardio — end sheet', status: 'live', note: 'the confirmation behind the finish — B.8', render: () => (
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
  { id: '3.4g', label: 'Cardio — live, no watch', status: 'live', note: 'no heart readout at all — C.19', render: () => (
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
  { id: '3.4a', label: 'Cardio — ready', status: 'live', render: () => <InApp><UnderTabs active={1}><CardioReady onBegin={noop} /></UnderTabs></InApp> },
  { id: '3.4b', label: 'Kilometre logged', status: 'live', render: () => (
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
  { id: '3.5', label: 'The week is done', status: 'live', render: () => <InApp><UnderTabs active={0}>{weekDoneView}</UnderTabs></InApp> },
  { id: '3.6b', label: 'Progress — day one', status: 'live', render: () => <InApp><UnderTabs active={2}>{progressDayOne}</UnderTabs></InApp> },
  { id: '3.6c', label: 'The next twelve', status: 'cancelled', note: 'founder 2026-07-29 — withdrawn with the 12-session block' },

  // ── 04 · OWN ───────────────────────────────────────────────────────────────────────────────
  /*
   * §04 held the body-map editor and the paywall, and not the SCREEN THEY ARE REACHED FROM. The
   * founder's "You is becoming a screen we just push things into" is a judgement about a surface
   * the gallery could not show him.
   */
  { id: '4.0', label: 'You', status: 'live', note: 'the whole tab — every row, in one place, which is the point', render: () => mount(ProfileSheet) },
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
  { id: '7.1', label: 'Widgets', status: 'cancelled', note: 'founder 2026-07-29 — withdrawn; the WATCH complication ships, the iOS home-screen widget is not wanted' },
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
  { id: '10.4b', label: 'On your wrist — not installed', status: 'live', note: 'auto-install is off on this iPhone', render: () => (
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
  { id: '11.5', label: 'Plan, received', status: 'live', render: () => (
    <InApp><PlanReceivedView splitName="Upper / Lower" plan={sharedFixture} onAdopt={noop} onDecline={noop} /></InApp>
  ) },

  // ── 13 · WHEN SOMETHING HURTS ──────────────────────────────────────────────────────────────
  { id: '13.1', label: 'Paused · the affordance', status: 'live', note: 'the door sits under the two acts', render: () => mount(SessionFlow, undefined, pausedFixture) },
  { id: '13.2', label: 'Where, and how much', status: 'live', note: 'tap a muscle, then a grade', render: () => mount(PainWhere, { exerciseId: 'bb_bench_press' }) },
  { id: '13.3', label: 'The engine responds', status: 'live', render: () => mount(PainResponse, { muscle: 'Shoulders', severity: 'pain', exerciseId: 'bb_bench_press' }) },
];

export const DEFAULT_SCREEN = '';
