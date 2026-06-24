/**
 * Local data models — the offline source of truth (UX §6, spec §8.4).
 *
 * The app STORES and RENDERS these; it never derives loads, confidence,
 * capability scores, or forecasts (spec §8.7 — the model owns those).
 */

/** The five Class-A capabilities — the model's primitive (spec §0). */
export type Capability =
  | 'horizontal_push'
  | 'horizontal_pull'
  | 'vertical_push'
  | 'knee_dominant'
  | 'hip_dominant';

export type Units = 'kg' | 'lb';

export type Goal = 'get_stronger' | 'build_muscle' | 'general_fitness' | 'toning';

/** Weekly training volume — the athlete's set-volume lever (default moderate). */
export type WeeklyVolume = 'low' | 'moderate' | 'high';

/** Training experience — the single biggest input to the cold-start starting weight. */
export type Experience = 'beginner' | 'intermediate' | 'advanced';

/** Athlete-Model mode (spec §6.1). Gates whether Hush may speak. */
export type AthleteMode =
  | 'UNAUTH'
  | 'AUTHED'
  | 'ONBOARDING'
  | 'CALIBRATING'
  | 'ADVISORY'
  | 'ADVISORY_AUTOPILOT_L1'; // gated, flag off in v1

export type PortraitState = 'PORTRAIT_LOCKED' | 'PORTRAIT_UNLOCKED';

export interface Profile {
  name?: string; // from auth provider; absent => identity block shows stats only (§10.2 UX)
  sex?: 'male' | 'female';
  heightCm?: number;
  weightKg?: number;
  age?: number;
  units: Units;
  goal: Goal;
  experience?: Experience; // drives starting weights; collected in onboarding
  daysPerWeek: number; // 1..6
  volume?: WeeklyVolume; // weekly set-volume lever; absent => 'moderate' (parity-preserving)
  healthConnected: boolean;
  /** ISO date the account was created (Profile §4.28 "Member since"). App-layer. */
  memberSince?: string;
}

/** Everything onboarding gathers before building the first program (§4.2–4.6). */
export interface OnboardingInputs {
  goal: Goal;
  experience?: Experience;
  daysPerWeek: number;
  units: Units;
  healthConnected: boolean;
  name?: string;
  sex?: 'male' | 'female';
  heightCm?: number;
  weightKg?: number;
  age?: number;
}

/** A frame-owned slot in a program day. */
export interface Slot {
  capability: Capability; // capability class is FIXED for the slot
  exerciseId: string;
  setCount: number;
  // Supplemental work (currently: core) — included in the program but NOT a primary
  // progression target. One per week, 3 sets, placed last, preferring upper sessions.
  // Rendered like any slot; it just never drives capability load/progression.
  supplemental?: boolean;
}

export interface ProgramDay {
  id: string;
  name: string; // e.g. "Upper A"
  muscleGroups: string[]; // metadata line
  isRest: boolean;
  slots: Slot[];
  // Weekly Program Container: the workout's stable key for athlete-owned workout ordering
  // (the model's template index = session_index % weekly_frequency; persisted via
  // /preferences/order scope='workout' and consumed by compose_week's _ordered_template_indices).
  key?: string;
  // Weekly Program Container: this workout is finished for the week (backend status
  // 'completed'|'skipped'). The Program screen renders a completed workout green; Home advances
  // to the next UNFINISHED workout. Rest begins only after ALL of the week's workouts are done.
  completed?: boolean;
}

export interface Program {
  id: string;
  frequency: number;
  days: ProgramDay[];
}

/** Reason types Hush may attach to a changed set (spec §4.4). */
export type ReasonType = 'increase' | 'decrease';

/** A model-provided target for one set of one exercise. */
export interface SetTarget {
  exerciseId: string;
  setIndex: number;
  /** Backend block id (HTTP model only) — needed to report sets against it. */
  blockId?: string;
  recommendedWeight: number | null; // null => bodyweight
  recommendedReps: number;
  reasonType?: ReasonType; // present only on a changed set, ADVISORY only
  reasonDelta?: number; // for increase/decrease copy
}

/** A single logged set. Per-set actuals persisted at each Complete Set (§8.4). */
export interface SetLog {
  exerciseId: string;
  setIndex: number;
  /** Backend block id (HTTP path) — carried so the set syncs to the right block. */
  blockId?: string;
  recommendedWeight: number | null;
  recommendedReps: number;
  actualWeight: number | null;
  actualReps: number;
  edited: boolean; // true if athlete used Edit Result
  persistedAt: string; // ISO
}

export type SessionState = 'ACTIVE' | 'SAVED';

/** Closing summary for the Complete screen, computed at finalize (§4.18 / design). */
export interface SessionSummary {
  workoutName: string;
  sets: number; // sets logged this session
  progressed: number; // distinct lifts whose load increased this session
  durationMs: number; // start → finish
  earlyFinish: boolean;
}

export interface Session {
  id: string;
  programDayId: string;
  // Day name captured AT START so History reads stably even after the program
  // regenerates with fresh day ids (the backend composes a new id per session).
  // Optional: sessions saved before this field fall back to a program lookup.
  programDayName?: string;
  startedAt: string;
  state: SessionState;
  earlyFinish: boolean;
  sets: SetLog[];
  // Owner-voice History annotation — present only when Hush acted or the athlete
  // ended early (spec §4.10, §2.10). `annotationCapability` carries the load noun.
  annotation?: HistoryAnnotation;
  annotationCapability?: Capability;
}

/** Portrait snapshot stored at each program construction (spec §8.4). */
export interface PortraitSnapshot {
  timestamp: string;
  perCapability: Record<Capability, number>; // relative-to-standard score (rendered as bar length)
  confidence: Record<Capability, number>; // internal; NEVER displayed
  stillLearning: Record<Capability, boolean>;
}

export type HistoryAnnotation = 'increased' | 'swapped' | 'ended_early' | null;

export interface HistoryEvent {
  id: string;
  kind: 'workout' | 'walk';
  timestamp: string;
  annotation: HistoryAnnotation;
  ref: string; // session id or health-activity id
}
