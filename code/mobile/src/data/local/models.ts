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

/** Engine v5 — the athlete's declared rep band (T). One onboarding question; default '8-10'.
 *  It is a floor and a ceiling: Tlo is the target, Thi the "too light" mark. See the register S-6. */
export type RepBandChoice = '6-8' | '8-10' | '10-12' | '12-15';

/** Engine v5 — the athlete's stance on a muscle group on the body map. `off` never appears in the
 *  programme; `emphasis` gets first claim on volume (budget of 2, F-4). Default: every muscle `normal`. */
export type MuscleStance = 'off' | 'normal' | 'emphasis';

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
  /** The bodyweight Hush MET them at — written once, at onboarding, never edited (founder
   *  2026-07-13). The milestone ladders are cut from it (domain/milestones): a ladder anchored on
   *  the CURRENT weight would move every time the athlete edited their profile, and could take back
   *  a mark they had already earned. Absent on older profiles → they fall back to the current
   *  weight, which is what they were built from anyway. */
  startWeightKg?: number;
  age?: number;
  /** ISO instant age was last set/advanced — the auto-yearly-update anchor (founder
   *  2026-07-10: age is asked once; the app keeps it current by itself). Absent on
   *  older profiles → falls back to memberSince (see domain/profileAge). */
  ageUpdatedAt?: string;
  units: Units;
  goal: Goal;
  experience?: Experience; // drives starting weights; collected in onboarding
  daysPerWeek: number; // 1..6
  volume?: WeeklyVolume; // weekly set-volume lever; absent => 'moderate' (parity-preserving)
  /** Engine v5 — her declared rep band (T). Absent on older profiles => default '8-10'. */
  repBand?: RepBandChoice;
  /** Engine v5 — the body map: per-muscle stance. Absent on older profiles => every muscle 'normal'
   *  (the parity-preserving default). Keyed by MuscleGroup. */
  bodyMap?: Record<string, MuscleStance>;
  /** Engine v5 — minutes she has for a workout (the time-budget ceiling, S-64). Absent => 60. */
  workoutMinutes?: number;
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
  // Lock System: the athlete locked this slot's exercise against engine-initiated swaps.
  // Present (true/false) only on engine-managed, lockable slots; undefined on core /
  // unmapped slots (which the engine never swaps anyway, so they cannot be locked).
  locked?: boolean;
  // STABLE engine-slot identity (founder 2026-07-09), stamped at generation from the CANONICAL
  // blueprint pattern-occurrence order — NOT the display order. This decouples a slot's durable
  // identity from equipment clustering + engine swaps, so an engine swap/graduation never shifts
  // it (fixes findings 2 / V1). Absent on core / unmapped slots; deriveSlots falls back to the
  // positional id when absent (backward compatibility with pre-upgrade persisted programs).
  engineSlotId?: string;
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
  recommendedReps: number; // engine v5: this is Tlo, the band floor / target
  /** Engine v5 — Thi, the top of her declared band (the "too light" mark Loop 1 reads). Absent on
   *  profiles with no declared T => the live loop falls back to a provisional window. */
  repBandHi?: number;
  /** Engine v5 — the first set of a lift with no recent fact is an APPROACH set: a measurement, not
   *  a working set (S-60). Marked on setIndex 0 only; excluded from every engine decision. */
  isApproach?: boolean;
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
  /** Engine v5 — this set was an APPROACH measurement (S-60), not a working set. Carried from the
   *  target so the engine can exclude it from the weekly fold. */
  isApproach?: boolean;
  persistedAt: string; // ISO
  /**
   * Seconds of rest ACTUALLY taken immediately before this set (engine v5 · Stage 0 · law L3).
   *
   * The engine may only compare a set to a set taken under similar conditions. Without this
   * number every rep comparison is corrupt: an athlete who shortens her rest and drops a rep
   * looks identical to an athlete whose load is too heavy — and the engine would cut the load
   * when the load was never the problem. It is also what makes the time budget real (the 60-min
   * cap is otherwise computed from a per-set constant that ignores rest entirely).
   *
   * Absent when there was no rest to measure: the first set of a session, a resume across an app
   * kill that landed between the rest ending and the set being logged, and every set logged
   * before this field existed. Absent means UNKNOWN — such a set is usable for load history but
   * is excluded from any rest comparison. It never means zero.
   */
  restBeforeS?: number;
}

export type SessionState = 'ACTIVE' | 'SAVED';

/** Closing summary for the Complete screen, computed at finalize (§4.18 / design). */
export interface SessionSummary {
  workoutName: string;
  sets: number; // sets logged this session
  progressed: number; // distinct lifts whose load increased this session
  durationMs: number; // start → finish
  earlyFinish: boolean;
  /** The session FINISHED the workout for the week (>= half the prescribed sets — see
   *  domain/completion). False = a partial session: real work, saved and folded by the
   *  engine, but the workout stays on this week's list. */
  trained?: boolean;
}

export interface Session {
  id: string;
  programDayId: string;
  /** Did this session TRAIN the workout (>= half its prescribed sets — domain/completion)?
   *  Stamped at save so the verdict is durable and retroactively readable: the workout-COUNT
   *  milestones ("N workouts") only count trained sessions, since that family is about whole
   *  workouts. Every other milestone family (tonnage / clubs / engine) counts a partial's work
   *  in full — the athlete lifted it (founder 2026-07-11). Absent on sessions saved before the
   *  rule => counted (they finished the workout under the old law). */
  trained?: boolean;
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

/* ----------------------------------------------------------------------------
 * Cardio — "Open training" (run / walk). Recorded, NEVER coached. A deliberate
 * departure from the rest of Hush: the v4 strength engine does not see any of
 * this — it never influences load, progression, volume, frequency, exercise
 * selection, or programming. Cardio activities are simply logged and surfaced
 * in the single unified History timeline alongside strength sessions.
 * -------------------------------------------------------------------------- */
export type CardioGait = 'run' | 'walk';
export type CardioGoalKind = 'open' | 'distance' | 'time';

/** One kilometre split of a recorded cardio activity (pure data, never graded). */
export interface CardioSplit {
  km: number; // which kilometre (1-indexed)
  durationSec: number; // seconds spent on this km
  paceSec: number; // sec per km (this split)
  gait: CardioGait; // gait held during this km
}

/** One GPS fix on the route actually travelled. */
export interface CardioPoint {
  lat: number;
  lon: number;
}

/** A recorded run/walk. Stored in History; opening it shows its own activity
 *  details (distance, duration, pace, heart rate, calories, route) — no coaching. */
export interface CardioActivity {
  kind: 'cardio'; // discriminator in the unified History timeline
  id: string;
  gait: CardioGait; // the chosen mode
  startedAt: string; // ISO
  durationSec: number;
  distanceKm: number;
  avgPaceSec: number; // sec/km
  avgHr?: number; // bpm — present only when a heart-rate source was available
  calories?: number; // kcal — present only when estimable
  splits: CardioSplit[];
  /**
   * The path travelled (founder 2026-07-12). Absent on activities recorded before routes
   * existed, and on any activity with no GPS lock — a run indoors on a treadmill has no
   * route, and the summary simply omits the trace rather than drawing a lie.
   */
  route?: CardioPoint[];
}

/** Unified History timeline entry: a completed strength Session or a recorded
 *  CardioActivity. Sessions are tagged `kind:'strength'` at merge time. */
export type HistoryItem = ({ kind: 'strength' } & Session) | CardioActivity;
