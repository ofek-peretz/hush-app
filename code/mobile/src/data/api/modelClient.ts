/**
 * Model interface (spec §8.7). The app CONSUMES this; it never implements the
 * model. Inputs are only actual weight + actual reps per set (no RIR/effort).
 *
 * In v1 this is fulfilled by a local fixture (fixtureModel) until the existing
 * backend in `implementation/api` is wired. The interface is the contract; the
 * client code above it does not care which implementation answers.
 */
import type { Capability, PortraitSnapshot, ProgramChange, Profile, Program, SetTarget } from '@/data/local/models';

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
   * Server-side count of completed sessions — the SOURCE OF TRUTH for calibration
   * (spec §2.3). The client derives CALIBRATING/ADVISORY from this so a reinstall
   * or device change never resets calibration. null = no backend (fixture/dev).
   */
  sessionsCompleted(): Promise<number | null>;

  /** Generate the program before Home renders (spec §1.4/§4.1, flow §2.1). */
  generateProgram(profile: Profile): Promise<Program>;

  /**
   * Resolve advisory targets for the next session of a program day. During
   * calibration these are conservative with NO reason/forecast attached — the
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

  /**
   * Material program changes for the current week (spec §4.9, §2.7). Load
   * changes are auto-applied + undoable; frame changes are decided + vetoable.
   * Empty when nothing material changed — the app then shows NO line (§5.5 R7).
   * Never returns changes during calibration.
   */
  programChanges(args: { completedSessions: number }): Promise<ProgramChange[]>;

  // NOTE (C5, ratified 2026-06-15): a program change may be ACKNOWLEDGED, VETOED, or
  // IGNORED, and every such response is stored as DATA for learning + trust measurement —
  // it must NEVER directly alter model state or future recommendations (not user-controlled
  // progression). Responses are therefore recorded as research events via the telemetry →
  // athlete_event pipeline, NOT as model-mutating client methods. There is deliberately no
  // undo/veto method here (an earlier revert-style contract was wrong and was removed).

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
  /** Define (or remove) a persistent preferred substitute for an exercise. */
  setSubstitute(args: { primaryExercise: string; substituteExercise?: string; remove?: boolean }): Promise<void>;
  /** Define (or remove) an equipment-busy backup exercise. */
  setBackup(args: { primaryExercise: string; backupExercise?: string; remove?: boolean }): Promise<void>;
  /** Persist athlete-owned exercise order (within a capability) or workout order. */
  setOrder(args: { scope: 'exercise' | 'workout'; order: string[]; capability?: Capability }): Promise<void>;
  /** Equipment occupied (V1): move this exercise one position later in the current workout. No
   *  replacement, no structure change — a temporary runtime reorder. Returns nothing (the caller
   *  re-reads the session). */
  markEquipmentOccupied(args: { blockId: string }): Promise<void>;

  /** Weekly Program Container: true when the week is complete and the athlete is in Rest (the
   *  existing Home Rest state is reused). false (and no backend) when not in rest. */
  weeklyRest(): Promise<boolean>;
}
