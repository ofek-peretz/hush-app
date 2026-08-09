/**
 * Local persistence — the offline source of truth (UX §6, spec §8.4).
 *
 * Uses AsyncStorage behind this repo interface; it can be swapped for a durable
 * store (e.g. SQLite) later without touching callers. Per-set actuals are persisted at
 * each Complete Set (not at session end) so a killed app resumes from the last
 * persisted set (§7.4). Logged actuals are immutable (§9 law 17).
 */
// @ts-nocheck

// 

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  AthleteMode,
  CardioActivity,
  PortraitSnapshot,
  PortraitState,
  Profile,
  Program,
  Session,
} from './models';
// Type-only import (erased at runtime → no layering cycle). The Health connection
// record is persisted local state, stored behind this repo like everything else.
import type { HealthState } from '@/platform/health/healthModel';
// Type-only — the cached entitlement (StoreKit is the source of truth; this is the
// local mirror used for instant offline gating at boot).
import type { Entitlement } from '@/domain/entitlement';
// Type-only for the decision shape; `appendDecisions` is the pure accumulator that owns the cap.
import { appendDecisions, type CoachDecision } from '@/domain/coachLog';
import type { CoachPlan } from '@/domain/coachPlan';
import { currentWeekOpen } from '@/domain/weekCadence';
import type { CoachUpdate } from '@/platform/coach/afterSession';
import type { CoachQuotaState } from '@/domain/coachQuota';

/**
 * How much of the conversation is kept.
 *
 * It travels back to the coach on every call, so an uncapped transcript is a bill that grows for
 * ever on an athlete who has been here two years. Twenty exchanges covers an entire intake and any
 * conversation anyone actually has in one sitting; past that, what keeps the coach consistent is
 * the DECISION log, not the transcript — see `domain/coachLog`.
 */
export const COACH_THREAD_CAP = 40;

/** One thing said, as stored. Deliberately not the screen's `CoachTurn`: the view's transient
 *  marks (`pending`) mean nothing after a restart, and persisting them would restore a message as
 *  eternally in-flight. `failed` DOES survive — it is a fact about the message, not a phase. */
export interface PersistedCoachTurn {
  id: string;
  by: 'athlete' | 'coach';
  text: string;
  failed?: boolean;
}

const K = {
  profile: 'hush.profile',
  program: 'hush.program',
  mode: 'hush.mode',
  activeSession: 'hush.session.active',
  sessionResume: 'hush.session.resume', // live machine snapshot — mid-workout resume (S3)
  history: 'hush.history.sessions',
  cardio: 'hush.cardio.activities', // recorded run/walk activities (Open training)
  snapshots: 'hush.portrait.snapshots',
  recents: 'hush.exercise.recents',
  pendingSync: 'hush.sync.pending',
  telemetry: 'hush.telemetry.buffer',
  firsts: 'hush.telemetry.firsts',
  health: 'hush.health.state',
  preferences: 'hush.preferences',
  engineV5: 'hush.engine.v5', // Hush v5 exercise-keyed progression state (see engine/v5)
  entitlement: 'hush.entitlement', // cached subscription entitlement (offline gating mirror)
  weekOpen: 'hush.week.open', // Sunday-04:00 the current weekly bucket was built for (calendar cadence)

  /* ── THE COACH'S TWO MEMORIES ────────────────────────────────────────────────────────────────
   * They are separate because they are forgotten at different rates and for different reasons.
   *
   * `coachThread` is the CONVERSATION — what was said, in order. It exists so that closing the app
   * halfway through the intake does not mean starting the intake again, which is the single worst
   * thing this screen could do to someone. Capped: it travels back on every call, so it is paid
   * for on every call, and beyond a point a transcript is not what makes the coach consistent.
   *
   * `coachLog` is WHAT WAS DECIDED, and why, in the coach's own words. That is what makes it
   * consistent across months — see `domain/coachLog`. The transcript ages out; the decisions do
   * not. Both are the athlete's, and both go in a wipe. */
  coachThread: 'hush.coach.thread',
  coachLog: 'hush.coach.log',
  /* ⚠️ WHO SHE IS, in the coach's own words — the third memory, and the one that was missing.
   * The transcript ages out at 40 turns and the decision log at 60, and the post-session call sends
   * NEITHER a transcript nor a conversation: only her record. So without this, the goal she stated
   * in the intake had nowhere to live, and a year in the coach would be writing sound programmes
   * for someone it no longer knew anything about. See `CoachAnswer.brief`. */
  coachBrief: 'hush.coach.brief',
  /* The programme the coach decided, stored AS THE COACH WROTE IT — see `saveCoachPlan`. */
  coachPlan: 'hush.coach.plan',
  /* The one before it. Kept for exactly one reason — see `saveCoachPlan`: the direction a load
   * moved is a fact about TWO programmes, and the founder's law says a direction is a colour. */
  coachPlanPrev: 'hush.coach.plan.prev',
  /*
   * ⛔ THE PROGRAMME AS IT STOOD WHEN THIS WEEK OPENED — the other end of "what changed this week".
   *
   * `coachPlanPrev` is the plan before the LAST call, and the coach now answers after every
   * workout. So by Wednesday it is one session old, which is the right window for Today's pill
   * ("what that workout changed") and the wrong one for a letter titled "what changed this week":
   * the Mirror would report the last session and call it the week.
   *
   * Both surfaces read THIS instead, so they cannot drift — which is the whole of
   * `thePillAndTheLetterCountTheSameThing`, and the third time that law has been re-opened.
   */
  coachPlanWeek: 'hush.coach.plan.week',
  /* When she last opened the Saturday letter, as epoch ms. The changes pill wears an unseen dot
   * until a decision newer than this exists — one comparison, no second flag to fall out of step. */
  coachLetterSeen: 'hush.coach.letter.seen',
  /* The chat allowance for the current window — see `domain/coachQuota`. A business guard, never a
   * security control: anyone who unpacks the app bypasses it, and the Worker's rate limit is what
   * stands in the way of abuse. */
  coachQuota: 'hush.coach.quota',
  /* The last post-session attempt and how it went. The app must be able to SAY that an update is
   * waiting; the one thing worse than it not arriving is not knowing that it did not. */
  coachUpdate: 'hush.coach.update',
  schemaVersion: 'hush.schema.version',

  /* ── ONCE-PER-ATHLETE FLAGS ──────────────────────────────────────────────────────────────────
   * Each is declared next to the surface that owns it (the name here is the ONLY copy that must
   * agree). They are registered in K for one reason: `clearAll` wipes exactly `Object.values(K)`,
   * so a flag that is not here SURVIVES A WIPED IDENTITY — and the next athlete on that phone is
   * silently never asked, never told, never greeted. Every one of these means "we already said
   * this to HER", and "her" is precisely what a wipe changes.
   *
   * Found 2026-07-29 while adding `watchOffered`; the other two had the same hole already.
   * `everyStorageKeyIsAccountedFor` now sweeps the source so the next one cannot be forgotten.
   *
   * Clearing `notificationsAsked` does NOT burn iOS's one prompt: `shouldAskForNotifications`
   * still reads the system state first, so a permission already granted or refused-for-good is
   * never re-asked — only a fresh athlete on a still-askable phone sees the pre-ask again. */
  notificationsAsked: 'hush.notifications.asked', // 8.2 · platform/notifications
  watchOffered: 'hush.watch.offered', // 1.3 + 10.4 · platform/watch/watchPresence
  recoverySealed: 'hush.recovery.sealed', // 3.5 · screens/home/HomeView
} as const;

/** Athlete-OWNED program customizations, persisted so weekly regeneration honors them.
 *  Keyed by MUSCLE (swaps are muscle-scoped, so the muscle is the durable identity across
 *  regenerations). **There is no PIN** — nothing here is declared; every entry is LEARNED from her
 *  in-workout swaps at K=2 (register Rev 7 §B / S-69 / S-71). */
export interface OwnedPreferences {
  /** S-71 — her learned LEAVE-ITS: MuscleGroup -> the lift the engine must stop rotating away.
   *  EARNED, never declared: the engine rotated a stalled lift out and she swapped back to it twice
   *  (K=2). This replaced the v4 pin, which had a button; there is no button and no pin. */
  leaveItsByMuscle: Record<string, string>;
  backups: Record<string, string>; // primary exerciseId -> equipment-busy backup
  substitutes: Record<string, string>; // primary exerciseId -> preferred substitute
  // Engine v5 (Rev 7) — the LEARNED-swap in-progress counter (S-68): anchor exerciseId -> the pending
  // replacement being accumulated (not yet adopted). Adopting writes `substitutes` above and clears
  // this. The pure decision logic is `engine/v5/learnedSwap`.
  swapPending?: Record<string, { target: string; count: number }>;
  // Engine v5 (Rev 7, S-71/S-72) — anchor exerciseId the ENGINE rotated away (a stalled lift, S-25.3)
  // → the lift it rotated TO. Marks a rotation as the engine's, so an athlete swap-BACK to the anchor
  // is recognised as RESISTANCE (not a fresh preference — S-72 keeps the two signals apart). When a
  // resisted rotation's substitute is cleared by two swap-backs, the anchor becomes a learned
  // "leave it" (S-71) and is removed from here.
  engineRotated?: Record<string, string>;
  // S-56 — muscles the one-time ask-back has already been ANSWERED for (either way). The question
  // ("been off a while — want it back?") is asked once per muscle, at the Saturday mirror, and never
  // again (L4). Additive/optional: absent means never asked.
  askedBackMuscles?: string[];
  workoutOrder: string[]; // day keys, athlete order
  exerciseOrderByWorkout: Record<string, string[]>; // day key -> exerciseId order within it
  // (The v4 Lock System `lockedSlots` and the 3-week periodic-refresh `rotations`/`rotationUsed`/
  //  `lastRotationCycle` were removed with the v4 burial — S-58. v5 has no calendar rotation.)
}

export const EMPTY_PREFERENCES: OwnedPreferences = {
  leaveItsByMuscle: {},
  backups: {},
  substitutes: {},
  workoutOrder: [],
  exerciseOrderByWorkout: {},
};

/** Bump when a persisted shape changes incompatibly; boot guards against drift.
 *  v2: added the Health connection record (hush.health.state) — additive.
 *  v3: added the Hush v4 per-slot engine state (hush.engine.v4) — additive.
 *  v4: added the cached subscription entitlement (hush.entitlement) — additive.
 *  v5: added recorded cardio activities (hush.cardio.activities) — additive.
 *  v6: added the calendar-week anchor (hush.week.open) — additive.
 *  v7: added the mid-workout resume snapshot (hush.session.resume) — additive. */
export const SCHEMA_VERSION = 7;

/** Persisted mid-workout resume snapshot (S3). Shape mirrors state/sessionRecovery's
 *  ResumeSnapshot — kept structural here to avoid a persistence→store layering cycle. */
export interface PersistedSessionResume {
  schema: 1;
  plan: unknown[]; // Step[]
  machine: unknown; // SessionMachine
  restStartedAtMs: number | null;
  restExtraS: number;
  pausedAtMs: number | null;
  savedAt: string; // ISO
  /** Rest (seconds) already completed and waiting to be stamped onto the next set (SetLog
   *  .restBeforeS). Carried across an app kill so a crash between "Ready" and "Complete Set"
   *  does not silently drop the rest fact. Optional: snapshots written before v5 Stage 0. */
  pendingRestS?: number;
}

/**
 * Persisted Hush v5 engine state — exercise-keyed (not slot-keyed). `exercises` maps exerciseId →
 * the v5 ExerciseState (load, band, sets, history); `lastAdvanceWeekOpen` is the Sat-20:30 the engine
 * last folded a week for. Shape kept structural to avoid a layering cycle into engine/v5. There is NO
 * migration from the old v4 engine (register S-58): the TestFlight cohort is recreated clean, and
 * history is the substrate.
 */
export interface EngineV5State {
  exercises: Record<string, unknown>; // exerciseId -> ExerciseState
  /** The newest completed-session `startedAt` (ms) already folded. Decisions run PER WORKOUT at the
   *  end of each occurrence (register L7 — no weekly boundary); this is the per-workout cursor. */
  lastFoldedAt?: number;
  /** A timestamped log of every load change the engine made, for the Saturday MIRROR (S-45 — the
   *  review is a reflection of decisions already told per-workout, never a decision itself). The
   *  mirror filters this to the week that just closed. Capped; structural to avoid a layering cycle. */
  changeLog?: {
    exerciseId: string;
    decision: string;
    loadFrom: number | null;
    loadTo: number | null;
    setsFrom: number;
    setsTo: number;
    bandFrom: [number, number];
    bandTo: [number, number];
    at: number; // the occurrence's session startedAt (ms)
    /** A STRUCTURAL change (S-45) — the exercise itself changed identity: a bodyweight graduation
     *  (S-52), a stall rotation (S-25.3), or a learned in-workout swap adopted as standing (S-69); or a
     *  VOLUME change (S-32/S-34/S-37 — Loop 3 grew or trimmed a muscle's weekly sets). `exerciseId`
     *  holds the FROM lift (or the muscle name, for 'volume'); the mirror narrates each with its copy.
     *  Absent on the ordinary load-change entries. */
    kind?: 'graduate' | 'swap' | 'volume' | 'rung';
    toExercise?: string;
    /** For kind 'volume' — the muscle whose weekly set target moved (setsFrom → setsTo). */
    muscle?: string;
  }[];
  /** The closed-week-end (ms) the athlete last marked seen — so a newly closed week reads unseen. */
  seenWeekEnd?: number;
  /**
   * Loop 3 (the Muscle loop) — the LEARNED per-occurrence set target per muscle (register Part 4 §E,
   * S-32/S-34). Seeded from her real day-one prescription the first time a muscle is folded, then it
   * grows (+1 when she completed everything AND a lift advanced) or is trimmed (−1 after two unfinished
   * occurrences). Regeneration distributes this across the muscle's exercises (distributeMuscleSets),
   * so an earned set actually reaches the bar; absent → the muscle is still on its day-one shape.
   */
  volumeByMuscle?: Record<string, number>;
  /** Per-muscle count of CONSECUTIVE unfinished occurrences (S-34 — a second one in a row cuts a set).
   *  Reset to 0 the moment she completes the muscle's sets again. */
  unfinishedByMuscle?: Record<string, number>;
}

/** A completed session awaiting backend delivery (offline → reconcile on reconnect, §6.4). */
export interface PendingSync {
  sessionId: string;
  programDayId: string;
  sets: { exerciseId: string; setIndex: number; actualWeight: number | null; actualReps: number; blockId?: string }[];
  earlyFinish: boolean;
}

export interface PersistedMode {
  mode: AthleteMode;
  completedSessions: number;
  portrait: PortraitState;
}

/**
 * Keys whose LAST read hit a stored-but-unreadable value (corrupt JSON, a storage fault) as opposed
 * to simply not being there yet. The two are indistinguishable from `null`, and that is precisely
 * what made engine-state loss SILENT (register S-47: "Engine state fails to load. Telemetry fires; a
 * safe prescription is served. **Never a silent reset.**"). The engine reads this to tell the
 * difference and report it; `db` stays free of a telemetry dependency.
 */
const corruptOnRead = new Set<string>();

async function getJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as T) : null;
    corruptOnRead.delete(key);
    return parsed;
  } catch {
    // Corrupt/partial value must never brick boot — treat as absent (recovery), but REMEMBER that it
    // was a failure and not an absence, so the caller can report it rather than reset in silence.
    corruptOnRead.add(key);
    return null;
  }
}
async function setJSON(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export const db = {
  // ---- Profile / Program / Mode ----
  loadProfile: () => getJSON<Profile>(K.profile),
  saveProfile: (p: Profile) => setJSON(K.profile, p),

  loadProgram: () => getJSON<Program>(K.program),
  saveProgram: (p: Program) => setJSON(K.program, p),

  // Calendar cadence (product model 2026-07-05): the Sunday-04:00-local instant the current
  // weekly bucket was generated for. The bucket turns over when the calendar week advances
  // past this, regardless of workout completion. Null until the first bucket is stamped.
  loadWeekOpen: () => getJSON<number>(K.weekOpen),
  saveWeekOpen: (ms: number) => setJSON(K.weekOpen, ms),

  loadMode: () => getJSON<PersistedMode>(K.mode),
  saveMode: (m: PersistedMode) => setJSON(K.mode, m),

  // ---- Active session (crash-safe resume; written at each Complete Set) ----
  loadActiveSession: () => getJSON<Session>(K.activeSession),
  saveActiveSession: (s: Session) => setJSON(K.activeSession, s),
  clearActiveSession: () => AsyncStorage.removeItem(K.activeSession),

  // ---- Mid-workout resume snapshot (S3; written on every session state change) ----
  loadSessionResume: () => getJSON<PersistedSessionResume>(K.sessionResume),
  saveSessionResume: (s: PersistedSessionResume) => setJSON(K.sessionResume, s),
  clearSessionResume: () => AsyncStorage.removeItem(K.sessionResume),

  // ---- History (completed sessions, newest first; immutable once written) ----
  async loadHistory(): Promise<Session[]> {
    return (await getJSON<Session[]>(K.history)) ?? [];
  },
  async appendCompletedSession(s: Session): Promise<void> {
    const all = await this.loadHistory();
    all.unshift(s);
    await setJSON(K.history, all);
  },

  /* ── The coach's conversation ──────────────────────────────────────────────────────────────── */

  loadCoachThread: () => getJSON<PersistedCoachTurn[]>(K.coachThread),
  /**
   * Write the thread, keeping the most recent `COACH_THREAD_CAP` turns.
   *
   * Capped at the WRITE rather than at the send, so what is stored is what is sent — a thread that
   * kept everything and sent a window would show her a conversation the coach cannot see, and the
   * first time it answered as though it had forgotten something visible on screen would be
   * impossible to explain.
   */
  saveCoachThread(turns: PersistedCoachTurn[]): Promise<void> {
    const kept = turns.length > COACH_THREAD_CAP ? turns.slice(turns.length - COACH_THREAD_CAP) : turns;
    return setJSON(K.coachThread, kept);
  },
  clearCoachThread: () => AsyncStorage.removeItem(K.coachThread),

  /* ── The programme the coach decided ───────────────────────────────────────────────────────── */

  loadCoachPlan: () => getJSON<CoachPlan>(K.coachPlan),
  /**
   * Stored in the coach's own vocabulary, NOT converted into `Program`.
   *
   * The obvious move is to translate it into the shape the screens already read. It is also the one
   * the founder ruled against: `Slot` is `{ capability, exerciseId, setCount }` and nothing else, so
   * a 5 km run has no home in it, a 45-second plank has no home in it, and `say` — the coach's
   * execution instruction, the thing the app could never carry before — is dropped on the floor.
   * A conversion that silently deletes three of the four shapes is not a conversion; it is the old
   * engine's assumptions winning an argument that was already settled.
   *
   * So the plan is the record, whole, and the surfaces read IT. `buildPlanFromCoach` turns one
   * session into runnable steps without losing anything on the way.
   */
  async saveCoachPlan(p: CoachPlan): Promise<void> {
    /*
     * THE OUTGOING PLAN IS KEPT, and it is not history-for-its-own-sake.
     *
     * The founder's law is that a DIRECTION IS A COLOUR: a load that went up is moss, one that came
     * down is blue, one that held is cream, on every surface without exception. The engine could
     * state a direction because it computed a delta. The coach states a PROGRAMME — it says what she
     * lifts next, not which way it moved — so the direction is not in the answer.
     *
     * It is still knowable, and honestly: it is the difference between two programmes we hold. So
     * the previous one is kept, and Today reads the direction off the pair rather than being told.
     * That is a derivation from two facts, not a guess about one.
     */
    const outgoing = await getJSON<CoachPlan>(K.coachPlan);
    if (outgoing) await setJSON(K.coachPlanPrev, outgoing);
    /*
     * …AND THE WEEK'S ANCHOR, ROTATED ONCE PER WEEK RATHER THAN ONCE PER CALL.
     *
     * On the first save after Saturday 20:30, the OUTGOING plan is by definition the one she
     * carried into this week — so that is what the anchor becomes, stamped with the week it
     * belongs to. Every later save in the same week leaves it alone.
     *
     * ⚠️ `outgoing` may be absent on the very first programme, and then there is no anchor and no
     * count — which is correct: a first programme is a starting point, not a set of changes.
     */
    if (outgoing) {
      const weekOpen = currentWeekOpen(Date.now());
      const anchor = await getJSON<{ at: number; plan: CoachPlan }>(K.coachPlanWeek);
      if (!anchor || anchor.at < weekOpen) await setJSON(K.coachPlanWeek, { at: weekOpen, plan: outgoing });
    }
    await setJSON(K.coachPlan, p);
  },
  /**
   * ⛔ SHE MOVED A WORKOUT TO ANOTHER DAY — and this must NOT look like the coach deciding.
   *
   * `saveCoachPlan` rotates two anchors on every write: `coachPlanPrev` and the week's own. That is
   * exactly right when a programme ARRIVES, and exactly wrong here. Writing her drag through it
   * would make the previous programme equal to the current one, so the next real plan would diff
   * against the wrong week and **every change the coach then made would go uncounted** — the pill
   * would read zero on the week it mattered most.
   *
   * ⚠️ AND THE COACH DID NOT DO THIS. A day assignment she chose is not a decision to report in a
   * letter titled "what I changed". It rides back to the coach on the next call inside the plan, so
   * it stops proposing the day she rejected — which is all the memory it needs.
   *
   * One field, one write, no rotation.
   */
  saveCoachPlanDays: async (days: Record<string, string>) => {
    const plan = await getJSON<CoachPlan>(K.coachPlan);
    if (!plan) return;
    const next: CoachPlan = {
      ...plan,
      sessions: plan.sessions.map((s, i) => {
        const day = days[`coach_${i}`];
        return day ? { ...s, day: day as CoachPlan['sessions'][number]['day'] } : s;
      }),
    };
    await setJSON(K.coachPlan, next);
  },

  loadCoachPlanPrev: () => getJSON<CoachPlan>(K.coachPlanPrev),
  /** The programme this week opened on — the pair both change counters read. See `coachPlanWeek`. */
  loadCoachPlanWeek: async (): Promise<CoachPlan | null> =>
    (await getJSON<{ at: number; plan: CoachPlan }>(K.coachPlanWeek))?.plan ?? null,

  /* ── How the last post-session call went ───────────────────────────────────────────────────── */

  loadCoachLetterSeen: () => getJSON<number>(K.coachLetterSeen),
  saveCoachLetterSeen: (atMs: number) => setJSON(K.coachLetterSeen, atMs),

  loadCoachQuota: () => getJSON<CoachQuotaState>(K.coachQuota),
  saveCoachQuota: (q: CoachQuotaState) => setJSON(K.coachQuota, q),

  loadCoachUpdate: () => getJSON<CoachUpdate>(K.coachUpdate),
  saveCoachUpdate: (u: CoachUpdate) => setJSON(K.coachUpdate, u),

  /* ── The coach's own decisions, coming back ────────────────────────────────────────────────── */

  async loadCoachLog(): Promise<CoachDecision[]> {
    return (await getJSON<CoachDecision[]>(K.coachLog)) ?? [];
  },
  /**
   * Append this plan's reasons to the log.
   *
   * Mirrors `appendCompletedSession`: the caller hands over what happened, the repo owns the
   * accumulation and the cap. It lives here rather than in the chat hook because the post-session
   * call produces decisions too and never goes near a conversation.
   */
  async appendCoachDecisions(notes: { ex?: string; say: string }[] | undefined, at: string): Promise<void> {
    const next = appendDecisions(await this.loadCoachLog(), notes, at);
    await setJSON(K.coachLog, next);
  },

  /**
   * ════ ONE ANSWER LANDS IN ONE PLACE ════
   *
   * The single seam where a coach's reply becomes the app's state, and it exists because there are
   * TWO callers that must not drift: the chat (a turn that decided something) and the post-session
   * call (which never goes near a conversation). Two call sites doing "save the plan, then append
   * the reasons" in their own order is how one of them ends up doing only half of it.
   *
   * The plan is written BEFORE the log. If only one of the two survives a crash, the programme she
   * is about to train matters more than the record of why.
   */
  async recordCoachAnswer(
    answer: { plan: CoachPlan | null; brief?: string[]; notes?: CoachPlan['notes'] },
    at: string,
  ): Promise<void> {
    /*
     * ⚠️ THE BRIEF IS SAVED BEFORE THE EARLY RETURN, and that ordering is the whole feature.
     *
     * Most turns that teach the coach something about her decide NOTHING — "I want to run a half
     * marathon", "my shoulder has been bad since March", "please stop giving me lunges" are answers
     * to a question, not programmes. Writing the brief only alongside a plan would drop exactly the
     * turns it exists for.
     */
    if (answer.brief?.length) await setJSON(K.coachBrief, answer.brief);
    if (!answer.plan) {
      /*
       * ⛔ AND THE REASONS ARE WRITTEN EVEN WITH NO PROGRAMME.
       *
       * ⚠️ Found testing the founder's foundation stones, 2026-08-02: he asked the coach to HOLD a
       * weight. It held — correctly attaching nothing, because nothing changed — and it wrote the
       * reason. The reason was then dropped on this line, so the one decision she is least able to
       * understand on her own arrived at the "Why?" screen as silence.
       *
       * A hold is a decision. The founder listed it himself, beside raising and lowering.
       */
      if (answer.notes?.length) await this.appendCoachDecisions(answer.notes, at);
      return;
    }
    await this.saveCoachPlan(answer.plan);
    await this.appendCoachDecisions(answer.plan.notes, at);
  },

  /** The coach's memory of who she is, as lines, or null before it has met her. */
  async loadCoachBrief(): Promise<string[] | null> {
    const stored = await getJSON<string[] | string>(K.coachBrief);
    if (stored == null) return null;
    // A brief written before it became a list — one string is one line.
    return Array.isArray(stored) ? stored : [stored];
  },

  // ---- Cardio activities (Open training: recorded, never coached; newest first) ----
  async loadCardio(): Promise<CardioActivity[]> {
    return (await getJSON<CardioActivity[]>(K.cardio)) ?? [];
  },
  async appendCardioActivity(a: CardioActivity): Promise<void> {
    const all = await this.loadCardio();
    all.unshift(a);
    await setJSON(K.cardio, all);
  },

  // ---- Portrait snapshots (one per program construction; oldest first) ----
  async loadSnapshots(): Promise<PortraitSnapshot[]> {
    return (await getJSON<PortraitSnapshot[]>(K.snapshots)) ?? [];
  },
  async appendSnapshot(s: PortraitSnapshot): Promise<PortraitSnapshot[]> {
    const all = await this.loadSnapshots();
    all.push(s);
    await setJSON(K.snapshots, all);
    return all;
  },

  // ---- Exercise recents ("Your exercises"); most-recent first (UX §1.6) ----
  async loadRecents(): Promise<string[]> {
    return (await getJSON<string[]>(K.recents)) ?? [];
  },
  async addRecent(exerciseId: string): Promise<string[]> {
    const all = (await this.loadRecents()).filter((id) => id !== exerciseId);
    all.unshift(exerciseId);
    const capped = all.slice(0, 20);
    await setJSON(K.recents, capped);
    return capped;
  },

  // ---- Pending backend sync (offline-completed sessions; reconcile on reconnect §6.4) ----
  async loadPendingSync(): Promise<PendingSync[]> {
    return (await getJSON<PendingSync[]>(K.pendingSync)) ?? [];
  },
  async setPendingSync(items: PendingSync[]): Promise<void> {
    await setJSON(K.pendingSync, items);
  },
  async enqueuePendingSync(item: PendingSync): Promise<void> {
    const all = await this.loadPendingSync();
    // De-dupe by session id (idempotent replay; a retried session never doubles).
    await this.setPendingSync([...all.filter((p) => p.sessionId !== item.sessionId), item]);
  },

  // ---- Telemetry (durable buffer + first-event registry; alpha hardening) ----
  async loadTelemetry<T>(): Promise<T[]> {
    return (await getJSON<T[]>(K.telemetry)) ?? [];
  },
  async saveTelemetry<T>(events: T[]): Promise<void> {
    await setJSON(K.telemetry, events);
  },
  async loadFirsts(): Promise<string[]> {
    return (await getJSON<string[]>(K.firsts)) ?? [];
  },
  async hasFirst(name: string): Promise<boolean> {
    return (await this.loadFirsts()).includes(name);
  },
  async markFirst(name: string): Promise<void> {
    const all = await this.loadFirsts();
    if (!all.includes(name)) await setJSON(K.firsts, [...all, name]);
  },

  // ---- Health connection record (convenience-only; never a model input) ----
  loadHealthState: () => getJSON<HealthState>(K.health),
  saveHealthState: (s: HealthState) => setJSON(K.health, s),

  // ---- Athlete-owned program preferences (pins / order / backups; durable across regen) ----
  async loadPreferences(): Promise<OwnedPreferences> {
    const p = await getJSON<Partial<OwnedPreferences>>(K.preferences);
    return { ...EMPTY_PREFERENCES, ...(p ?? {}) };
  },
  async savePreferences(p: OwnedPreferences): Promise<void> {
    await setJSON(K.preferences, p);
  },

  // ---- Hush v5 engine state (exercise-keyed progression; durable across regen) ----
  loadEngineV5: () => getJSON<EngineV5State>(K.engineV5),
  saveEngineV5: (s: EngineV5State) => setJSON(K.engineV5, s),
  /** S-47 — did the last `loadEngineV5` FAIL (stored but unreadable), rather than find nothing? The
   *  engine fires telemetry on true, so a rebuilt-from-history recovery is never silent. */
  engineV5ReadFailed: () => corruptOnRead.has(K.engineV5),

  // ---- Subscription entitlement (local mirror; StoreKit is the source of truth) ----
  loadEntitlement: () => getJSON<Entitlement>(K.entitlement),
  saveEntitlement: (e: Entitlement) => setJSON(K.entitlement, e),

  // ---- Schema version (detect persisted-shape drift on boot) ----
  async getSchemaVersion(): Promise<number | null> {
    return getJSON<number>(K.schemaVersion);
  },
  async setSchemaVersion(v: number): Promise<void> {
    await setJSON(K.schemaVersion, v);
  },

  // ---- Account lifecycle ----
  async clearAll(): Promise<void> {
    // Preserve telemetry firsts? No — a wiped identity starts fresh. Telemetry
    // buffer is flushed best-effort before a revoke/reset by the caller.
    await AsyncStorage.multiRemove(Object.values(K));
  },
};
