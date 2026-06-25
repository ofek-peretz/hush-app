/**
 * Model interface (spec §8.7). The app CONSUMES this; it never implements the
 * model. Inputs are only actual weight + actual reps per set (no RIR/effort).
 *
 * In v1 this is fulfilled by a local fixture (fixtureModel) until the existing
 * backend in `implementation/api` is wired. The interface is the contract; the
 * client code above it does not care which implementation answers.
 */
import type { Capability, PortraitSnapshot, Profile, Program, SetTarget } from '@/data/local/models';

/** What the athlete actually did — the only model input (spec §8.7). */
export interface ActualSet {
  exerciseId: string;
  setIndex: number;
  actualWeight: number | null;
  actualReps: number;
  /** Backend block id (HTTP model only) — the set is reported against it. */
  blockId?: string;
}

/** The backend's minimal athlete identity (set by the operator at enrollment). */
export interface BackendProfile {
  sex?: 'male' | 'female';
  age?: number;
  bodyweightKg?: number | null;
  experience?: string;
}

export interface ModelClient {
  /**
   * Fetch the athlete identity (backend §9 GET /profile). Doubles as token
   * validation for operator-mediated enrollment: a 200 means the token is a
   * real, active athlete. Fixture returns empty (no server identity).
   */
  getProfile(): Promise<BackendProfile>;

  /**
   * Record the athlete's affirmative consent to a versioned agreement (OD-3/BB-33).
   * Enrollment is operator-mediated, so consent is captured IN-APP (pressing Continue
   * on Enrollment is the affirmative act). Durable + append-only server-side; the
   * server stamps the authoritative timestamp. Fixture: no-op (offline/dev).
   */
  recordConsent(args: { version: string; acceptedAt: string }): Promise<void>;

  /**
   * Athlete-initiated right-to-erasure (OD-2) — the in-app "Delete Account" action. Logically
   * erases (anonymizes) the CALLER server-side (`POST /me/erase`; athlete derived from the token,
   * so it can only erase its own data). The token is invalidated by the call; the caller then wipes
   * local state. Fixture: no-op (offline/dev has no server identity to erase).
   */
  eraseAccount(): Promise<void>;

  /**
   * Server-side count of completed sessions — the SOURCE OF TRUTH for calibration
   * (spec §2.3). The client derives CALIBRATING/ADVISORY from this so a reinstall
   * or device change never resets calibration. null = no backend (fixture/dev).
   */
  sessionsCompleted(): Promise<number | null>;

  /**
   * Persist the athlete's chosen weekly training frequency (onboarding days-per-week)
   * into the server strategy BEFORE the first week is composed, so the generated week
   * has the chosen number of workouts. The server clamps to a supported template
   * (2–4). Best-effort; fixture honors it via the profile in generateProgram.
   */
  setWeeklyFrequency(daysPerWeek: number): Promise<void>;

  /** Generate the program before Home renders (spec §1.4/§4.1, flow §2.1). */
  generateProgram(profile: Profile): Promise<Program>;

  /**
   * Resolve advisory targets for the next session of a program day. During
   * calibration these are conservative with NO reason line attached — the
   * model owns that gating (spec §5.6, §2.3). The app renders what it gets.
   */
  sessionTargets(args: {
    programDayId: string;
    completedSessions: number;
  }): Promise<SetTarget[]>;

  /** Post actuals for a finished (or early-finished) session. */
  recordSession(args: {
    programDayId: string;
    sets: ActualSet[];
    earlyFinish: boolean;
  }): Promise<void>;

  /**
   * Per-capability relative scores + confidence + still-learning flags for the
   * Portrait (spec §8.7). Stored as a snapshot at each program construction
   * (§8.4). The app renders bars/words from this; it never computes the scores.
   */
  portraitSnapshot(args: { completedSessions: number }): Promise<PortraitSnapshot>;

  /**
   * Athlete-initiated, capability-preserving exercise replacement (L2 REPLACE,
   * R18). Backend: POST /blocks/{id}/replace. Fixture: no-op (local only).
   */
  replaceBlock(args: { blockId: string; fromExercise: string; toExercise?: string }): Promise<void>;

  // NOTE: the per-week "material program changes" surface is now the v4 Weekly Update + Why
  // (engine/v4), sourced from the engine's persisted explanations — not a model-client method.

  // ---- Program Ownership Contract: athlete-OWNED program structure (durable + server-backed) ----
  // Every customization is persisted to the append-only preference log server-side, so it
  // survives refetches, reinstalls, device changes, and future week regenerations, and the
  // model honors it with priority. Fixture impls are local/no-op (dev offline).

  /** Pin the athlete's EXACT exercise choice for a slot's capability (honored verbatim). */
  setExercisePreference(args: {
    capability: Capability;
    fromExercise: string;
    toExercise: string;
    reason?: string;
  }): Promise<void>;
  /** Clear the pin for a capability → the model selects again. */
  restoreExercisePreference(args: { capability: Capability }): Promise<void>;
  /** Lock System: lock/unlock a slot (by its durable engine slotId) against engine-initiated
   *  swaps. The lock belongs to the slot (survives regen + manual replacement); manual replacement
   *  stays allowed. */
  setSlotLock(args: { slotId: string; locked: boolean }): Promise<void>;
  /** Define (or remove) a persistent preferred substitute for an exercise. */
  setSubstitute(args: { primaryExercise: string; substituteExercise?: string; remove?: boolean }): Promise<void>;
  /** Define (or remove) an equipment-busy backup exercise. */
  setBackup(args: { primaryExercise: string; backupExercise?: string; remove?: boolean }): Promise<void>;
  /** Persist athlete-owned exercise order (within a workout, keyed by `workoutKey`) or the
   *  workout order itself. `workoutKey` is the day's stable key — required for exercise scope so
   *  the order survives weekly regeneration; omitted for workout scope. */
  setOrder(args: { scope: 'exercise' | 'workout'; order: string[]; capability?: Capability; workoutKey?: string }): Promise<void>;
  /** Equipment occupied (V1): move this exercise one position later in the current workout. No
   *  replacement, no structure change — a temporary runtime reorder. Returns nothing (the caller
   *  re-reads the session). */
  markEquipmentOccupied(args: { blockId: string }): Promise<void>;

  /** Weekly Program Container: true when the week is complete and the athlete is in Rest (the
   *  existing Home Rest state is reused). false (and no backend) when not in rest. */
  weeklyRest(): Promise<boolean>;
}
