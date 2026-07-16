/**
 * Local persistence — the offline source of truth (UX §6, spec §8.4).
 *
 * Uses AsyncStorage behind this repo interface; it can be swapped for a durable
 * store (e.g. SQLite) later without touching callers. Per-set actuals are persisted at
 * each Complete Set (not at session end) so a killed app resumes from the last
 * persisted set (§7.4). Logged actuals are immutable (§9 law 17).
 */
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
  engineV4: 'hush.engine.v4', // Hush v4 per-slot progression state (gated; see engine/v4)
  engineV5: 'hush.engine.v5', // Hush v5 exercise-keyed progression state (see engine/v5)
  entitlement: 'hush.entitlement', // cached subscription entitlement (offline gating mirror)
  weekOpen: 'hush.week.open', // Sunday-04:00 the current weekly bucket was built for (calendar cadence)
  schemaVersion: 'hush.schema.version',
} as const;

/** Athlete-OWNED program customizations, persisted so weekly regeneration honors them
 *  (Program Ownership Contract). Pins are keyed by MUSCLE (swaps are muscle-scoped, so the
 *  muscle is the durable slot identity across regenerations). */
export interface OwnedPreferences {
  pinsByMuscle: Record<string, string>; // MuscleGroup -> chosen exerciseId
  backups: Record<string, string>; // primary exerciseId -> equipment-busy backup
  substitutes: Record<string, string>; // primary exerciseId -> preferred substitute
  // Engine v5 (Rev 7) — the LEARNED-swap in-progress counter (S-68): anchor exerciseId -> the pending
  // replacement being accumulated (not yet adopted). Adopting writes `substitutes` above and clears
  // this. The pure decision logic is `engine/v5/learnedSwap`.
  swapPending?: Record<string, { target: string; count: number }>;
  // Engine v5 (Rev 7, S-71/S-72) — anchor exerciseId the ENGINE rotated away (a stalled lift, S-25.3)
  // → the lift it rotated TO. Marks a rotation as the engine's, so an athlete swap-BACK to the anchor
  // is recognised as RESISTANCE (not a fresh preference — S-72 keeps the two signals apart). When a
  // resisted rotation's substitute is cleared by two swap-backs, the anchor becomes a learned "leave
  // it" (a pin, S-71) and is removed from here.
  engineRotated?: Record<string, string>;
  workoutOrder: string[]; // day keys, athlete order
  exerciseOrderByWorkout: Record<string, string[]>; // day key -> exerciseId order within it
  // Athlete-LOCKED slots (Lock System): engine slotIds the athlete pinned against engine-initiated
  // swaps. The lock belongs to the SLOT (durable across regen + manual replacement), never the
  // exercise — so it is keyed by the engine's stable slotId (deriveSlots), not an exercise id.
  lockedSlots: string[];
  // PERIODIC REFRESH (founder 2026-07-09): every 3-week cycle, ONE non-PINNed lift per workout is
  // rotated to a fresh same-muscle variation (variety + plateau-breaking). `rotations` is the
  // system-chosen exercise per engine slotId (overrides the blueprint, is overridden by an athlete
  // pin). `rotationUsed` is the ordered list of lifts a slot has already cycled through — so the
  // rotation walks the WHOLE pool with NO ping-pong (repeats only after the pool is exhausted).
  // `lastRotationCycle` is the 3-week cycle index last rotated (so it fires once per cycle).
  rotations: Record<string, string>;
  rotationUsed: Record<string, string[]>;
  lastRotationCycle: number;
}

export const EMPTY_PREFERENCES: OwnedPreferences = {
  pinsByMuscle: {},
  backups: {},
  substitutes: {},
  workoutOrder: [],
  exerciseOrderByWorkout: {},
  lockedSlots: [],
  rotations: {},
  rotationUsed: {},
  lastRotationCycle: -1,
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
 *  ResumeSnapshot — kept structural here to avoid a persistence→store layering cycle
 *  (same pattern as EngineV4State). */
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

/** Persisted Hush v4 engine state (gated). `slots` keyed by durable slotId; `global` carries
 *  days_since_last_session; `lastAdvanceAt` is the completed-session count at the last weekly
 *  advance (the week-rollover trigger). Shape mirrors engine/v4 types (kept structural to avoid a
 *  layering cycle into the engine from the persistence module). */
export interface EngineV4State {
  slots: Record<string, unknown>; // slotId -> SlotState
  global: unknown; // GlobalState
  lastAdvanceAt: number; // completed-session COUNT already folded into the engine (the slice marker)
  /** The Sat-20:30 week-open the engine last advanced for (founder 2026-07-09, finding 7). The engine
   *  now progresses ONCE per training week at the calendar roll — not per N sessions — so the plan is
   *  stable all week and updates on the whole week's work. null until the first program is built. */
  lastAdvanceWeekOpen?: number;
  /** How many weekly advances have run — the durable "week N" index for records + the Weekly Update
   *  (lastAdvanceAt is no longer a clean multiple of frequency once weeks are calendar-sized). */
  weeksProcessed?: number;
  goal?: string; // last engine goal seen — a change applies the C4-1 goal-change transition
  /** Id of the last pre-gap session an extended-absence ease (I-6) was applied for — the ease
   *  fires ONCE per gap; reopening the app during the same gap never re-eases. */
  absenceKey?: string;
  /** The most recent week's explanations (for the Weekly Update + Why surfaces) + when produced.
   *  `plan` is the per-changed-slot from→to snapshot captured at advance time (Weekly Update B
   *  renders the whole week at its new loads). Structural to avoid a layering cycle into the engine.
   *  `seen` flips once the athlete views it. */
  lastUpdate?: { weekIndex: number; at: string; explanations: unknown[]; plan?: unknown[]; seen?: boolean };
}

/**
 * Persisted Hush v5 engine state — exercise-keyed (not slot-keyed). `exercises` maps exerciseId →
 * the v5 ExerciseState (load, band, sets, history); `lastAdvanceWeekOpen` is the Sat-20:30 the engine
 * last folded a week for. Shape kept structural to avoid a layering cycle into engine/v5. There is NO
 * migration from EngineV4State (register S-58): v4 state is dropped, history is the substrate.
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
     *  (S-52), a stall rotation (S-25.3), or a learned in-workout swap adopted as standing (S-69).
     *  `exerciseId` holds the FROM lift; the mirror narrates it with the graduate / swap copy. Absent
     *  on the ordinary load-change entries. */
    kind?: 'graduate' | 'swap';
    toExercise?: string;
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

async function getJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // Corrupt/partial value must never brick boot — treat as absent (recovery).
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

  // ---- Hush v4 engine state (gated per-slot progression; durable across regen) ----
  loadEngineV4: () => getJSON<EngineV4State>(K.engineV4),
  saveEngineV4: (s: EngineV4State) => setJSON(K.engineV4, s),
  loadEngineV5: () => getJSON<EngineV5State>(K.engineV5),
  saveEngineV5: (s: EngineV5State) => setJSON(K.engineV5, s),

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
