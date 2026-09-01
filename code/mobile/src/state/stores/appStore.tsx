/**
 * App state — profile, program, and athlete-mode, persisted locally.
 * Routes the whole app (Root reads `mode` to decide which screens exist).
 */

// 

import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Experience, MuscleStance, OnboardingInputs, PortraitSnapshot, Profile, Program, RepBandChoice, Session, Units } from '@/data/local/models';
import type { LearnedAboutHer } from '@/domain/coachPlan';
import { applyLearned } from '@/domain/coachLearned';
import { db, SCHEMA_VERSION, type PersistedMode } from '@/data/local/db';
import type { AthleteRecord } from '@/domain/record';
import { salvageOrphanSession, RESUME_WINDOW_MS, type SalvageResult } from '@/state/sessionRecovery';
import { applyWeekOpenDow, currentWeekOpen, firstBucketOpen, healWeekCompletion, shouldRollWeek } from '@/domain/weekCadence';
import { agedProfile } from '@/domain/profileAge';
import { CONSENT_VERSION } from '@/domain/consent';
import {
  athleteModeReducer,
  didUnlockPortrait,
  initialAthleteModeState,
  CALIBRATION_SESSIONS,
  type AthleteModeState,
} from '@/state/machines/athleteMode';
import { fixtureModel } from '@/data/api/fixtureModel';
import { HttpError } from '@/data/api/httpErrors';
import { track, flush as flushTelemetry, refreshTelemetryOptOut } from '@/platform/telemetry';
import type { ModelClient } from '@/data/api/modelClient';
import { move } from '@/domain/reorder';
import { activeEases, awaitingAnswer, easeFor, effectiveBodyMap, ANSWER_SEVERITY, type EaseAnswer, type PainEase, type PainSeverity } from '@/domain/painReport';
import { muscleOf } from '@/data/exercises';
import { notifier } from '@/platform/notifications';
import { health } from '@/platform/health';
import { ingestHealth } from '@/platform/health/healthIngestion';
import { INITIAL_HEALTH_STATE } from '@/platform/health/healthModel';
import { signInWith, type AuthProvider } from '@/platform/auth';
import { circleExchange, circleSignOut, deleteIdentity } from '@/platform/circleClient';
import { setGender, resetGender } from '@/i18n/gender';
import { resetWristOffered } from '@/platform/watch/watchPresence';
import { billing, onEntitlementArrived, trackEntitlementChange, type ProductId, type PurchaseResult } from '@/platform/billing';
// Aliased: this file already declares its own `AppState` interface for the store's shape.
import { AppState as RNAppState } from 'react-native';
import { BILLING_EVENTS } from '@/platform/events';
import { trialUsed, nextLedger } from '@/domain/trialLedger';
import { readTrialLedger, writeTrialLedger } from '@/platform/trialLedger';
import { cloud } from '@/platform/cloud';
import { cloudAutoBackup } from '@/platform/cloudBackup';
import { updateHomeWidget } from '@/platform/homeWidget';
import { syncTrainingRemindersFromPlan } from '@/platform/trainingReminders';
import { armGapCatch } from '@/platform/gapCatch';
import { armTrialLast } from '@/platform/trialCatch';
import { readRecord as readAthleteRecord, restoreVerdict } from '@/domain/record';
import { NO_ENTITLEMENT, entitlementNow, type Entitlement } from '@/domain/entitlement';

/** Derive the calibration mode from the backend's completed-session count
 *  (source of truth, §2.3). Reinstall/device-change safe. */
function deriveCalibrationMode(count: number): AthleteModeState {
  const advisory = count >= CALIBRATION_SESSIONS;
  return {
    mode: advisory ? 'ADVISORY' : 'CALIBRATING',
    completedSessions: count,
    portrait: advisory ? 'PORTRAIT_UNLOCKED' : 'PORTRAIT_LOCKED',
  };
}

/** Durable capability-trajectory point (per-capability score + confidence + still-learning). */
function emitCapabilitySnapshot(snap: PortraitSnapshot, reason: string, completedSessions: number): void {
  void track('capability_snapshot', {
    reason,
    completedSessions,
    per: snap.perCapability,
    confidence: snap.confidence,
    stillLearning: snap.stillLearning,
  });
}

/** Capture a Portrait snapshot, tolerating the B2 gap (HTTP backend exposes no
 *  capability endpoint yet) so onboarding/unlock never break. */
async function tryPortraitSnapshot(model: ModelClient, completedSessions: number): Promise<PortraitSnapshot | null> {
  try {
    return await model.portraitSnapshot({ completedSessions });
  } catch {
    return null; // B2: no capability endpoint — Portrait stays locked/degraded, app intact
  }
}

interface AppState {
  booted: boolean;
  profile: Profile | null;
  /**
   * ⚠️ ALWAYS NULL, AND KEPT ONLY SO THE SHAPE DOES NOT CHANGE UNDER THE SCREENS.
   *
   * Nothing writes a `Program`. The coach's plan is the programme and it lives on disk under
   * `hush.coach.plan`, read by `coachWeek` where it is needed rather than held in the store — a
   * week that is decided after every session does not want a copy in memory that can be stale.
   *
   * The field goes when the founder's redesign touches the screens that still name it.
   */
  program: Program | null;
  modeState: AthleteModeState;
  justUnlockedPortrait: boolean; // one-shot flag consumed by the Well Done → Portrait route
  snapshots: PortraitSnapshot[]; // oldest first; [0] is the week-one baseline
  recents: string[]; // exercise ids, most-recent first ("Your exercises")
  weekOpenMs: number | null; // Saturday-20:30-local the current bucket was built for (calendar cadence)
  entitlement: Entitlement; // subscription state (StoreKit truth, locally cached for gating)
}

type Action =
  | { type: 'BOOTED'; profile: Profile | null; program: Program | null; mode: AthleteModeState; snapshots: PortraitSnapshot[]; recents: string[]; entitlement: Entitlement; weekOpenMs: number | null }
  | { type: 'ENTITLEMENT'; entitlement: Entitlement }
  | { type: 'PROGRAM_UPDATED'; program: Program | null; recents: string[]; weekOpenMs?: number }
  | { type: 'ONBOARDED'; profile: Profile; program: Program | null; mode: AthleteModeState; snapshots: PortraitSnapshot[]; weekOpenMs: number }
  | { type: 'PROFILE_UPDATED'; profile: Profile }
  | { type: 'SESSION_COMPLETED'; mode: AthleteModeState; unlocked: boolean; snapshots: PortraitSnapshot[] }
  | { type: 'CALIBRATION_SYNCED'; mode: AthleteModeState }
  | { type: 'PORTRAIT_RESOLVED'; snapshots: PortraitSnapshot[] }
  | { type: 'CLEAR_PORTRAIT_FLAG' }
  | { type: 'RESET' };

const initial: AppState = {
  booted: false,
  profile: null,
  program: null,
  modeState: initialAthleteModeState,
  justUnlockedPortrait: false,
  snapshots: [],
  recents: [],
  weekOpenMs: null,
  entitlement: NO_ENTITLEMENT,
};

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    // Both doors an entitlement enters state through pass `entitlementNow` — an expired cache
    // stops saying "active" the moment it is read, not the day StoreKit is next reachable
    // (domain/entitlement, audit finding 5).
    case 'BOOTED':
      return { ...s, booted: true, profile: a.profile, program: a.program, modeState: a.mode, snapshots: a.snapshots, recents: a.recents, entitlement: entitlementNow(a.entitlement), weekOpenMs: a.weekOpenMs };
    case 'ENTITLEMENT':
      return { ...s, entitlement: entitlementNow(a.entitlement) };
    case 'PROGRAM_UPDATED':
      return { ...s, program: a.program, recents: a.recents, ...(a.weekOpenMs !== undefined ? { weekOpenMs: a.weekOpenMs } : {}) };
    case 'ONBOARDED':
      return { ...s, profile: a.profile, program: a.program, modeState: a.mode, snapshots: a.snapshots, weekOpenMs: a.weekOpenMs };
    case 'PROFILE_UPDATED':
      return { ...s, profile: a.profile };
    case 'SESSION_COMPLETED':
      return {
        ...s,
        modeState: a.mode,
        justUnlockedPortrait: a.unlocked,
        snapshots: a.snapshots,
      };
    case 'CALIBRATION_SYNCED':
      // Reconcile to backend truth WITHOUT firing the one-time unlock animation
      // (that is a live-session moment, not a boot/reconcile moment).
      return { ...s, modeState: a.mode };
    case 'PORTRAIT_RESOLVED':
      return { ...s, snapshots: a.snapshots };
    case 'CLEAR_PORTRAIT_FLAG':
      return { ...s, justUnlockedPortrait: false };
    case 'RESET':
      return { ...initial, booted: true };
    default:
      return s;
  }
}

interface AppApi extends AppState {
  /** Front door (HUSH_BUILD_SPEC §4.1): Apple/Google sign-in. Establishes the
   *  session (sets the backend token when the provider returns one) but does NOT
   *  create a profile — the athlete proceeds through Consent → onboarding, which
   *  ends in completeOnboarding. Throws if sign-in is cancelled/fails. */
  signIn: (provider: AuthProvider) => Promise<void>;
  /** Record affirmative consent (OD-3/BB-33). Since 2026-07-12 the Consent SCREEN is gone and
   *  consent is recorded at sign-in — continuing with a provider IS the agreement, and the line
   *  under the buttons says so. Best-effort against the backend; the server record is idempotent. */
  acceptConsent: () => Promise<void>;
  /** Store the athlete's chosen name (NameEntry screen) for the profile built at
   *  completeOnboarding. Overrides any Apple-provided name. */
  setPendingName: (name: string) => void;
  /** The name as given, BEFORE the profile exists — the ready screen speaks to the athlete by
   *  name (founder 2026-07-13) and it is still one screen away from being written to disk. */
  pendingName: () => string | null;
  /** Publish the athlete's gender to the copy layer the moment it is picked (NameEntry).
   *  The value itself travels to the profile through the onboarding draft. */
  setPendingSex: (sex: 'male' | 'female') => void;
  completeOnboarding: (inputs: OnboardingInputs) => Promise<void>;
  recordSessionCompleted: () => Promise<{ unlockedPortrait: boolean }>;
  clearPortraitFlag: () => void;
  /** Re-resolve today's session (session-at-a-time). Called on Home focus so a
   *  completed session gives way to the next composed one. */
  refreshProgram: () => Promise<void>;
  /** Undo an engine ROTATION and pin the lift back (S-71, asked out loud). No-op for anything that
   *  is not a live rotation — a graduation is not resistible, and her own swap is not ours to undo. */
  /**
   * What she DECLARED in the exercise library: the lifts she picked per muscle, and the ones she
   * refused. Saved together and the week rebuilt on the same road a body-map edit travels — both
   * are her reshaping which work the engine may deal her, so both must land the same way.
   */
  saveLibrary: (chosenByMuscle: Record<string, string[]>, refusedIds: string[]) => Promise<boolean>;
  /**
   * ⛔ "GIVE ME THIS ONE INSTEAD OF THAT ONE" — a DECLARED 1:1 replacement (founder 2026-08-22).
   *
   * Returns true when a new week was actually built, false when it was not — the same contract
   * `saveLibrary` keeps, and for the same reason: the declaration is saved either way, and what she
   * is TOLD about her week is the caller's job.
   *
   * Naming the anchor's current stand-in as the replacement REMOVES the declaration: she is saying
   * the other thing, which is how a declaration is taken back.
   */
  declareSwap: (fromExerciseId: string, toExerciseId: string) => Promise<boolean>;
  /**
   * ⛔ READ A SAVED RECORD BACK ONTO THIS PHONE. `domain/record` decides whether a file MAY be
   * restored and the screen says the sentence; this writes it and makes sure she lands somewhere.
   */
  restoreRecord: (record: AthleteRecord) => Promise<void>;
  /** Reconcile calibration/mode to the backend's completed-session count (source of truth). */
  syncCalibration: () => Promise<void>;
  /** Drain offline-completed sessions to the backend (reconcile on reconnect, §6.4). */
  syncPending: () => Promise<void>;
  /** Heal the Portrait if its unlock snapshot was missed (e.g. session 7 offline). */
  ensurePortraitSnapshot: () => Promise<void>;
  /** Switch units (kg/lb); restyles every weight display instantly (§10.1). */
  setUnits: (units: Units) => Promise<void>;
  /** Edit post-onboarding profile info from Settings (founder 2026-07-10: the edit surface is
   *  height + weight + days/week only — sex is fixed, age advances yearly by itself, experience is
   *  derived from progression). Persists the merged profile. Body-data corrections must NOT reset
   *  progression, so the current program is left untouched — they inform the next weekly
   *  regeneration + cold starts. A daysPerWeek change is the exception: the split must match the
   *  chosen frequency, so it rebuilds the week immediately. */
  /**
   * v7 §13 — she said a muscle hurts. Rests it for the severity's window and rebuilds the week
   * around it, then resolves. Adds NO mechanism: the muscle simply goes off until the window
   * lapses (domain/painReport), and the lift the session was on is swapped through the ordinary
   * pool by the caller. Returns the ease so the response screen can state it as a fact.
   */
  /** Returns whether a new week was actually built — the same contract `saveLibrary` and
   *  `declareSwap` keep, and for the same reason: the report always lands; what she is told about
   *  the WEEK is the caller's job. (Declared `void` until 2026-08-23 while the implementation had
   *  answered with a boolean for weeks — `@ts-nocheck` was why nobody had to reconcile them.) */
  reportPain: (muscle: string, severity: PainSeverity) => Promise<boolean | undefined>;
  /**
   * ⛔ ADOPT A WEEK SHE BROUGHT — the only writer of `authored`, and the only way it is ever set.
   *
   * FOUNDER, 2026-08-11: *"אסור למנוע שלנו לשנות את זה אלא רק לנהל את המתאמן בהסתמך על התוכנית שהוא
   * קיבל."* From the moment this lands, `engineMayRebuild` returns false for her and no assembly pass
   * runs over the week again — not on a profile edit, not on a pain report, not on a rest answer.
   *
   * ⚠️ IT SAVES WHAT IT IS GIVEN, WITHOUT TOUCHING IT. Not one clamp, not one reflow, not one floor
   * raise. `importedPlan.toProgram` already stamped it; this writes it to disk and tells the app.
   */
  adoptImportedProgram: (program: Program) => Promise<void>;
  /**
   * ════ THE BUILDER'S DOOR (founder, 2026-08-25) ════
   * Saves a week SHE built in the plan builder — sealed by `planBuilder.sealAuthored`, so it
   * carries `authored: 'athlete_or_coach'` and every rebuild gate refuses it from here on. Same
   * naked-save contract as `adoptImportedProgram`: not one clamp on the way past.
   */
  saveBuiltProgram: (program: Program) => Promise<void>;
  /**
   * Hands the pen back: regenerates a fresh ENGINE week (stamped `authored: 'engine'` by absence)
   * and saves it over her built one. Only she calls this, from the builder's own door — it is the
   * single sanctioned way out of authorship, and it is loud in the UI, never implied.
   */
  revertProgramToEngine: () => Promise<boolean>;
  /** The rest windows that have run out and are still waiting on her. */
  easeChecks: () => PainEase[];
  /** Her answer to one of them: clear, still tender, or still hurting. */
  answerEaseCheck: (muscle: string, answer: EaseAnswer) => Promise<boolean | undefined>;  // ^ same reconciliation as reportPain — the implementation has answered with the rebuild verdict for weeks.
  /** ⚠️ RESOLVES TRUE ONLY IF THE WEEK WAS REBUILT AND SAVED. A week she brought is not ours to
   *  rewrite, so the save can land while the programme stays exactly as it was — and the screen that
   *  tells her what happened must be able to tell those two apart (see the implementation's note). */
  updateProfileInfo: (fields: {
    age?: number;
    heightCm?: number;
    weightKg?: number;
    sex?: 'male' | 'female';
    experience?: Experience;
    daysPerWeek?: number;
    /** Rev 7 — her time-budget ceiling (minutes). Changing it re-runs enforceTimeCap, so the week
     *  rebuilds like a frequency change. */
    workoutMinutes?: number;
    /** Engine v5 — the body map (register Part 3). The programme's whole SHAPE follows from it, so a
     *  change rebuilds the week exactly like a frequency change. Replaces the whole map, never merges:
     *  a muscle she took back to normal must LEAVE the map, and a merge could not express that. */
    bodyMap?: Record<string, MuscleStance>;
    /** Engine v5 — the per-muscle rep band (register Part 9). Whole-object, same reason. Loads and
     *  progression re-read it live (S-43 recomputes from her history at the new T), so no rebuild. */
    repBandByMuscle?: Record<string, RepBandChoice>;
    /** THE ROOM (2026-09-01, audit 06) — which equipment families exist where she trains. The pools
     *  the engine chooses from follow it (`domain/room`), so a change rebuilds the week exactly
     *  like a body-map change. `null` clears back to the full-gym default; `undefined` leaves it. */
    equipment?: import('@/data/exercises').EquipmentFamily[] | null;
    /** WHEN HER WEEK TURNS (audit 07) — the JS weekday of the roll. Applied live and persisted;
     *  the weekly note re-schedules itself onto the new day. No rebuild: the week's CONTENT is
     *  untouched, only the boundary walks. */
    weekOpensDow?: number;
  }) => Promise<boolean>;
  /**
   * ════ SHE TOLD THE COACH SOMETHING ABOUT HERSELF, AND THE APP WRITES IT DOWN ════
   *
   * The intake asks for her bodyweight and her days in conversation, because nothing else in the
   * app ever will. This is where the answer stops being a sentence in a transcript and becomes
   * part of her record — see `LearnedAboutHer`.
   *
   * ⚠️ IT IS DELIBERATELY NOT `updateProfileInfo`. That one exists for her CHANGING HER MIND, and
   * it ends by telling the coach so (`askCoachToRevise`). Routing this through it would answer the
   * coach's own sentence by calling the coach to inform it of what it just said — a paid round trip
   * to tell somebody their own news, and a programme rewritten on the strength of it.
   *
   * No rebuild, no revision, no toast. The number was already true when she said it; the app is
   * merely the last to hear.
   */
  learnFromCoach: (learned: LearnedAboutHer) => Promise<void>;
  /** Persist the Apple Health connection (Settings). The switch's only writer. */
  setHealthConnected: (connected: boolean) => Promise<void>;
  /** Athlete-owned exercise order within a workout (Athlete > Model). Durable + preserved across
   *  weekly regenerations. */
  reorderExercise: (dayId: string, fromIndex: number, toIndex: number) => Promise<void>;
  /** Athlete-owned workout order within the weekly plan (Athlete > Model). Durable + preserved. */
  reorderWorkouts: (fromIndex: number, toIndex: number) => Promise<void>;
  /** Mark a workout finished for the week (DONE chip + Home advances). Local, idempotent. */
  markWorkoutCompleted: (programDayId: string) => Promise<void>;
  /** Re-read the entitlement from the store (StoreKit) and update the cache. Best-effort. */
  refreshEntitlement: () => Promise<void>;
  /** Begin the StoreKit purchase flow for a plan; on success the entitlement unlocks training. */
  purchaseSubscription: (productId: ProductId) => Promise<PurchaseResult>;
  /** Restore a prior purchase (re-reads the Apple ID's entitlements). */
  restorePurchases: () => Promise<PurchaseResult>;
  /** Sign Out: clear the local identity + token (the server data is retained). */
  resetAccount: () => Promise<void>;
  /** Delete Account: erase (anonymize) the athlete SERVER-SIDE (OD-2), then wipe local state. */
  deleteAccount: () => Promise<void>;
  /** __DEV__-only test harness: jump straight to the Portrait unlock state. */
  devUnlockPortrait: () => Promise<void>;
  model: ModelClient;
  /** Current (most recent) Portrait snapshot, or null pre-unlock. */
  currentSnapshot: PortraitSnapshot | null;
  /** Week-one baseline snapshot for Compare, or null. */
  baselineSnapshot: PortraitSnapshot | null;
}

const Ctx = createContext<AppApi | null>(null);

/**
 * The raw context, exported for the WEB PREVIEW GALLERY only (`App.web.tsx`). The
 * gallery renders one screen at a time against fixture state; it must never boot the
 * real provider, which reaches for SQLite / HealthKit / billing. Nothing in the
 * shipping app imports this — screens use `useApp()`.
 */
export const AppContext = Ctx;

/**
 * THE PROFILE THE PROGRAMME IS BUILT FROM (v7 §13).
 *
 * Her body map with every muscle that is currently RESTING switched off — the pain eases composed
 * over the map, never written into it. This is the only place the two meet, so:
 *   · her map stays the map she drew, and a lapsed ease needs nothing undone;
 *   · the engine is handed an ordinary body map and knows nothing about pain.
 * Every `generateProgram` call goes through here; a call that did not would quietly train a muscle
 * she just told us hurts.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ A WEEK SHE BROUGHT IS NOT OURS TO REWRITE — the one gate every rebuild passes.
 *
 * FOUNDER, 2026-08-11: *"נצטרך שהמנוע לא יחתוך למתאמן וישמר לו את התוכנית ורק ינהל אותה… אסור
 * למנוע שלנו לשנות את זה אלא רק לנהל את המתאמן בהסתמך על התוכנית שהוא קיבל."*
 *
 * There are FOUR places that rebuild her programme — finishing onboarding, editing her profile,
 * reporting pain, and answering a rest-window question — and every one of them calls
 * `generateProgram`, which runs the whole assembly: `trimV5ToBudget`, `enforceTimeCap`,
 * `raiseToWeeklyFloor`, `growEmphasised`, the lot. Any of them would silently rewrite an imported
 * week into a Hush week: her 74-minute Monday cut to 60, her coach's exercise order reflowed, her
 * accessory work deleted for sitting under MEV.
 *
 * So the rebuild asks this first. It is a FUNCTION rather than a flag checked in four places for the
 * reason `programProfile` above it is: four copies of a rule are three places for it to drift.
 *
 * ⛔ AND IT IS ASKED OF THE WEEK ON DISK, NEVER OF `state.program` (found 2026-08-18).
 *
 * The gate was airtight and the thing it was asked about was empty. Boot dispatches `program: null`
 * on purpose — the store does not carry a week, every screen reads one through `loadWeekPlan` — and
 * `engineMayRebuild(null)` is TRUE, because absent must mean "engine" for every athlete who predates
 * the field. So on the first launch after any cold start, the first profile edit, pain report, rest
 * answer or library save asked the question of `null`, was told yes, and replaced her coach's week
 * with a Hush one. She would have seen the import work, closed the app, and lost it to the next
 * thing she touched.
 *
 * ⚠️ THE READ IS THE FIX, NOT A BOOT LOAD. Restoring `db.loadProgram()` to the boot list would put a
 * second copy of her week in React state for every screen to disagree with — the exact reason it was
 * taken out. One disk read at the four moments that rebuild costs nothing and cannot go stale, and it
 * is the same road `completeOnboarding` already takes (`const brought = await db.loadProgram()`).
 * A read that FAILS falls back to `state.program`: never better than before, never worse.
 *
 * ⚠️ IT GUARDS THE SHAPE, NOT THE LOADS. Loop 1 and Loop 2 never come through here — they write
 * `SetTarget`s against the programme that exists, which is exactly the management she wants.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function engineMayRebuild(program: Program | null | undefined): boolean {
  return (program?.authored ?? 'engine') === 'engine';
}

function programProfile(profile: Profile, nowMs = Date.now()): Profile {
  const eases = activeEases(profile.painEases, nowMs);
  if (eases.length === 0) return profile;
  return { ...profile, bodyMap: effectiveBodyMap(profile.bodyMap, eases, nowMs) };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  /*
   * ⛔ THE MODEL IS THE FIXTURE, FULL STOP (founder ruling, 2026-08-25: "איזה V4? אנחנו ב-v8").
   *
   * Until today this ref was resolved through `selectModel()` — the v4 swap point that would have
   * returned an `HttpModelClient` aimed at a Python backend, if `EXPO_PUBLIC_API_BASE_URL` had ever
   * been set. It was set in no build; the backend is not in this repository; the v8 engine decides
   * every load ON THE DEVICE. So `selectModel`, `enroll`, `config` (the token vault), `authEvents`
   * (the 401 → wipe-the-phone handler) and the 327-line HTTP client were 580 lines of dead
   * machinery, deleted whole. The two workers Hush actually talks to (identity/circle, coach) have
   * their own clients and never went through this ref.
   *
   * The ref itself STAYS, deliberately: every store call still reads `modelRef.current`, so the day
   * a remote model earns its way back it is one assignment — not an archaeology dig — away.
   */
  const modelRef = useRef<ModelClient>(fixtureModel);
  // Name captured from Apple at sign-in (returned only on first authorization) —
  // applied to the profile at completeOnboarding. No PII is persisted before that.
  const pendingNameRef = useRef<string | null>(null);

  useEffect(() => {
    (async () => {

      // Schema-version guard: detect persisted-shape drift (e.g. an upgrade/
      // downgrade) so corruption is OBSERVABLE rather than silent. Shapes are
      // additive (forward-compatible), so we stamp + telemeter rather than wipe.
      const storedVersion = await db.getSchemaVersion();
      if (storedVersion != null && storedVersion !== SCHEMA_VERSION) {
        void track('schema_version_mismatch', { stored: storedVersion, current: SCHEMA_VERSION });
      }
      /*
       * ════════════════════════════════════════════════════════════════════════════════════════
       * ⛔ A STORED COACH PLAN IS A FOSSIL NOW, AND IT WOULD HAVE OUTLIVED THE ENGINE FOREVER.
       *
       * ⛔ FOUNDER, 2026-08-12: *"תוודא שוב שהכל מחובר ומכויל שלא יהיו לנו עוד הפתעות חדשות."*
       * This is the surprise that sweep found, and nothing else would have.
       *
       * `loadWeekPlan` prefers a stored `CoachPlan` over the engine's week — correctly, because that
       * shape is where a real COACH's programme will live. And as of today NOTHING WRITES ONE: the
       * post-session call is gone, so on a fresh install the branch is simply never taken.
       *
       * ⚠️ BUT NOT ON A PHONE THAT ALREADY HAS ONE. Every athlete on a previous build has a
       * `hush.coachPlan` in storage, written by a model that no longer runs — and every screen would
       * have kept preferring it, week after week, with no way on earth for it to change. She would
       * have been the only person in the world whose engine never took over, and the app would have
       * looked completely correct while it happened.
       *
       * So it is cleared ONCE, at the version boundary. Not on every launch: the coach track is
       * coming, and the day a human coach writes her a week, that plan must survive a restart.
       * ════════════════════════════════════════════════════════════════════════════════════════
       */
      if (storedVersion != null && storedVersion < SCHEMA_VERSION) {
        await db.clearCoachPlan().catch(() => {});
      }
      await db.setSchemaVersion(SCHEMA_VERSION);

      // Recovery (§7.4 / §5.5): an active session left behind by an app-kill is
      // never lost. S3 (approved 2026-07-05): a FRESH interruption — a non-terminal
      // resume snapshot younger than the resume window — is kept INTACT so Home can
      // offer "Continue {workout}" and the session store rebuilds it exactly.
      // Anything stale or unusable is salvaged as before: completed sets become an
      // "ended early" history entry (queued for sync) and the orphan is cleared. An
      // interrupted session does NOT advance calibration (§2.3).
      let salvaged: SalvageResult = { trained: false, programDayId: null };
      const active = await db.loadActiveSession();
      if (active) {
        let fresh = false;
        try {
          const snap = await db.loadSessionResume();
          const phase = (snap?.machine as { phase?: string } | undefined)?.phase;
          fresh =
            snap?.schema === 1 &&
            phase !== 'SESSION_SAVED' &&
            phase !== 'WELL_DONE' &&
            Date.now() - Date.parse(snap.savedAt) < RESUME_WINDOW_MS;
        } catch {
          /* unreadable snapshot → salvage */
        }
        if (!fresh) salvaged = await salvageOrphanSession();
      }

      /*
       * ⛔ `db.loadProgram()` IS NOT IN THIS LIST, AND THE REASON IT GIVES IS NO LONGER TRUE.
       *
       * It said "nothing writes a `Program` any more". Things do — onboarding assembles one on
       * 2026-08-10, `adoptImportedProgram` writes the week she brought, and every rebuild saves what
       * it built. What survives is the RULING: the store carries `program: null` at boot, because
       * every screen reads her week through `loadWeekPlan` and a second copy in React state is a
       * second answer to drift from the first.
       *
       * ⚠️ AND THE GATE THAT PROTECTS AN IMPORTED WEEK KNOWS IT (found 2026-08-18). It used to ask
       * `state.program`, which is this `null`, and `engineMayRebuild(null)` is true — so after any
       * cold start the first thing she changed rewrote her coach's week. It asks the disk now; see
       * `engineMayRebuild`.
       */
      /*
       * ════ ⛔ THE ACCOUNT IS HER APPLE ID — the silent restore (founder, 2026-08-23) ════
       *
       * A fresh install on a phone signed into her iCloud finds the record her last device wrote
       * (`platform/cloudBackup`) and simply puts it back — no sign-in screen, no button, nothing
       * to know about. This is the whole "account server", and it runs ONLY onto an EMPTY phone
       * (`restoreVerdict`'s no-confirm case): a phone with any history keeps the manual,
       * confirmed restore in You, because silently merging two lives is how records get eaten.
       *
       * ⚠️ A null read is NOT proof of absence — iCloud materialises the container lazily on a
       * fresh install, and the native side has already asked it to download. One quiet retry
       * after boot covers the common case; the next launch covers the rest.
       */
      try {
        if (cloud.available()) {
          const bare = await db.loadProfile().catch(() => null);
          const hist = bare ? [] : await db.loadHistory().catch(() => []);
          if (!bare && hist.length === 0) {
            const raw = await cloud.readBackup();
            if (raw != null) {
              const read = readAthleteRecord(JSON.parse(raw));
              if (read.ok && restoreVerdict(read.record, 0).do === 'restore') {
                await db.restoreRecord(read.record);
                void track('cloud_restored', { sessions: read.record.sessions.length });
              }
            }
          }
        }
      } catch {
        /* a failed cloud read costs the restore, never the boot — she starts fresh, as before */
      }

      const [storedProfile, persistedMode, snapshots, recents, cachedEntitlement, weekOpenMs, ledger] = await Promise.all([
        db.loadProfile(),
        db.loadMode(),
        db.loadSnapshots(),
        db.loadRecents(),
        db.loadEntitlement(),
        db.loadWeekOpen(),
        readTrialLedger(),
      ]);
      // Age upkeep (founder 2026-07-10): age is asked once — the app advances it a
      // year per full year elapsed, so program construction always sees the current
      // age. Best-effort persist; the aged value is used this session regardless.
      let profile = storedProfile;
      // Her week-opening day (audit 07) applies BEFORE anything derives from the cadence this boot.
      if (storedProfile?.weekOpensDow != null) applyWeekOpenDow(storedProfile.weekOpensDow);
      if (storedProfile) {
        const aged = agedProfile(storedProfile, Date.now());
        if (aged) {
          profile = aged;
          void db.saveProfile(aged).catch(() => {});
          void track('age_auto_advanced', { age: aged.age });
        }
        // Backfill the milestone anchor ONCE for athletes who signed up before it existed: their
        // ladders are frozen at the weight they carry today (which is the weight those ladders
        // would have been cut from anyway). Without this, their next weight edit would move a
        // ladder that has already handed out marks (models.Profile.startWeightKg).
        if (profile && profile.startWeightKg == null && profile.weightKg != null) {
          profile = { ...profile, startWeightKg: profile.weightKg };
          void db.saveProfile(profile).catch(() => {});
        }
      }
      let mode: AthleteModeState = persistedMode
        ? { mode: persistedMode.mode, completedSessions: persistedMode.completedSessions, portrait: persistedMode.portrait }
        : initialAthleteModeState;
      /*
       * ⚠️ THE KEYCHAIN RAISES A COUNT A REINSTALL RESET.
       *
       * The trial lived only in AsyncStorage, so deleting the app — or "erase account" inside it —
       * handed back fourteen free workouts, and it took no skill at all. The ledger outlives the
       * app; `trialUsed` takes the HIGHER of the two so an unreadable Keychain never gifts a second
       * trial. See `domain/trialLedger` for why that direction and what it honestly buys.
       */
      const used = trialUsed(ledger, mode.completedSessions, cloud.ledgerGet());
      if (used > mode.completedSessions) mode = { ...mode, completedSessions: used };
      // CREDIT A SALVAGED WORKOUT (founder 2026-07-11): the app died mid-workout, but the athlete
      // TRAINED it (>= half the prescribed sets) — a crash is not their fault, so it counts exactly
      // like a workout they finished by hand: the session count advances (free trial + calibration),
      // and the week's DONE flag follows from the heal below. A PARTIAL salvage credits nothing.
      // Persisted immediately so a second boot cannot double-credit (the session is de-duped in
      // History, and salvage only reports a FRESH write).
      if (salvaged.trained) {
        mode = athleteModeReducer(mode, { type: 'SESSION_COMPLETED' });
        await db.saveMode({ mode: mode.mode, completedSessions: mode.completedSessions, portrait: mode.portrait });
        void track('session_recovered_credited', { programDayId: salvaged.programDayId, completedSessions: mode.completedSessions });
      }
      // Gate on the CACHED entitlement immediately (offline-safe); the live store
      // value is reconciled just after boot (below).
      // The copy layer must know who it is speaking to BEFORE the first screen renders
      // (Hebrew conjugates every verb by gender — i18n/gender.ts).
      setGender(profile?.sex);
      dispatch({ type: 'BOOTED', profile, program: null, mode, snapshots, recents, entitlement: cachedEntitlement ?? NO_ENTITLEMENT, weekOpenMs });
      // The widget catches up with whatever changed while the app was closed (a week roll, a
      // restore) — after BOOTED, so it never stands in the boot path.
      void updateHomeWidget();

      /**
       * THE WEEK'S RECEIPT (founder 2026-07-13). Re-scheduled on every boot rather than once at
       * sign-up, on purpose: it is a repeating CALENDAR trigger, so re-scheduling coalesces onto
       * the same id (never stacks), and it self-heals an install whose note was lost to a permission
       * flip, a restore from backup, or the release that retired it. Scheduled AFTER `setGender` —
       * the note's copy is conjugated, and a note written before the copy layer knows who it is
       * speaking to would address half the athletes in the wrong person, once a week, forever.
       * Only for an enrolled athlete: there is no week to report on before there is a program.
       */
      if (profile) void notifier.scheduleWeeklyUpdate();
      // The training-day reminder resyncs on every boot too — same self-healing discipline.
      if (profile) void syncTrainingRemindersFromPlan();
      else void notifier.cancelWeeklyProgramReady();
      // The day-six catch re-derives at boot as well (permission flips, restores, lost notes) —
      // and clears itself for a signed-out phone. See `platform/gapCatch`.
      void armGapCatch();
      // The trial's last-workout note re-derives on the same cadence (`platform/trialCatch`).
      void armTrialLast();
      // The analytics opt-out latch loads before any flush can ship (audit finding 4).
      void refreshTelemetryOptOut();
      // …and sweep any note a PREVIOUS build scheduled and this one no longer sends. Deleting the
      // code that schedules a repeating push does not cancel the push — it lives in iOS's queue.
      void notifier.cancelRetiredNotes();

      /*
       * ⛔ THE COMPLETION HEAL WAS HERE, and it is not needed because the thing it healed is gone.
       *
       * It repaired a `ProgramDay.completed` flag that a crash could leave unwritten while the
       * session itself was already in history — two copies of one fact, and a repair for when they
       * disagreed. "Done" is read from the history directly now, so there is only ever one.
       */

      // Reconcile the entitlement against StoreKit (source of truth) right after
      // boot. Best-effort + fully isolated so it can never break the boot path; a
      // store/offline failure just keeps the cached value.
      void (async () => {
        try {
          const prev = cachedEntitlement ?? NO_ENTITLEMENT;
          const next = await billing.getEntitlement();
          await db.saveEntitlement(next);
          trackEntitlementChange(prev, next);
          dispatch({ type: 'ENTITLEMENT', entitlement: next });
          void armTrialLast(); // a member's pending trial note cancels itself here
        } catch {
          /* store unavailable — keep the cached entitlement */
        }
      })();

      // HealthKit (convenience-only) — silent bodyweight ingestion on boot. It is
      // NEVER a model input (it only proposes a value for the local Profile, which
      // stays the source of truth); a denied/unavailable/errored read is a clean
      // no-op. Best-effort and fully isolated so it can never break boot.
      void (async () => {
        try {
          const prevHealth = (await db.loadHealthState()) ?? INITIAL_HEALTH_STATE;
          const res = await ingestHealth({
            health,
            prevState: prevHealth,
            profileWeightKg: profile?.weightKg ?? null,
            now: () => Date.now(),
            track: (type, data) => void track(type, data),
          });
          await db.saveHealthState(res.state);
          if (res.adoptedBodyweightKg != null && profile) {
            const updated: Profile = { ...profile, weightKg: res.adoptedBodyweightKg, healthConnected: true };
            await db.saveProfile(updated);
            dispatch({ type: 'PROFILE_UPDATED', profile: updated });
          }
        } catch {
          /* health ingestion must never break boot */
        }
      })();
    })();
  }, []);

  /*
   * ════ THE ENTITLEMENT LISTENS (2026-09-01, audit finding 5) ════
   *
   * Two ears, one reconcile: the StoreKit persistent listener rings when an Ask-to-Buy approval
   * or a renewal is finished mid-run (until today that unlock waited for the next cold boot), and
   * every return from background re-reads too — collecting whatever Apple decided while the phone
   * was in a pocket. `prev` is read from the cache, not from a stale closure; a throwing store
   * keeps the cache, same contract as the boot reconcile.
   */
  useEffect(() => {
    const reconcile = async () => {
      try {
        const prev = (await db.loadEntitlement()) ?? NO_ENTITLEMENT;
        const next = await billing.getEntitlement();
        await db.saveEntitlement(next);
        trackEntitlementChange(prev, next);
        dispatch({ type: 'ENTITLEMENT', entitlement: next });
        void armTrialLast();
      } catch {
        /* store unavailable — keep the cached entitlement */
      }
    };
    onEntitlementArrived(() => void reconcile());
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st === 'active') void reconcile();
    });
    return () => sub.remove();
  }, []);

  const api = useMemo<AppApi>(() => {
    const model = modelRef.current;
    async function persistMode(m: AthleteModeState) {
      const p: PersistedMode = { mode: m.mode, completedSessions: m.completedSessions, portrait: m.portrait };
      await db.saveMode(p);
      /*
       * …and the same number into the Keychain, which outlives the app.
       *
       * Best-effort and never awaited-on for correctness — a device that cannot keep the ledger
       * still counts locally, and `trialUsed` takes the higher of the two. See `domain/trialLedger`.
       */
      void readTrialLedger().then((prev) => writeTrialLedger(nextLedger(prev, m.completedSessions)));
      // …and the CLOUD half — per Apple ID, so a new device does not restart the fourteen either.
      cloud.ledgerSet(nextLedger(cloud.ledgerGet(), m.completedSessions));
    }

    return {
      ...state,
      model,
      currentSnapshot: state.snapshots.length > 0 ? state.snapshots[state.snapshots.length - 1] : null,
      baselineSnapshot: state.snapshots.length > 0 ? state.snapshots[0] : null,

      async signIn(provider) {
        // Apple/Google sign-in (the stub seam in platform/auth resolves locally
        // until the native providers + Apple Developer infra land). On a real
        // identity token, establish the backend session so the rest of the app
        // talks to the server; otherwise the local fixture model serves dev/offline.
        const result = await signInWith(provider); // throws on cancel → screen stays
        // Capture the provider name (Apple returns it on first sign-in only) for the
        // profile created later at completeOnboarding.
        if (result.name) pendingNameRef.current = result.name;
        // The circle's session (2026-08-24): trade the fresh Apple token for the identity worker's
        // own, fire-and-forget — the front door never waits on a network, and a build with no
        // EXPO_PUBLIC_CIRCLE_URL makes this a no-op by construction (platform/circleClient).
        // (The v4 path ALSO vaulted the Apple token here for a backend that no longer exists —
        // the circle exchange is the only consumer the token ever really had.)
        void circleExchange(result.identityToken);
        void track('signed_in', { provider });
        // No profile yet → Root keeps the onboarding stack (Name → … → Program Created).
      },

      async acceptConsent() {
        void track('consent_accepted', { version: CONSENT_VERSION });
        try {
          await modelRef.current.recordConsent({ version: CONSENT_VERSION, acceptedAt: new Date().toISOString() });
        } catch {
          // Best-effort; the server record is idempotent and safely retried later.
          void track('consent_record_failed', { version: CONSENT_VERSION });
        }
      },

      setPendingName(name) {
        const trimmed = name.trim();
        pendingNameRef.current = trimmed.length > 0 ? trimmed : null;
      },

      pendingName() {
        return state.profile?.name ?? pendingNameRef.current;
      },

      setPendingSex(sex) {
        // Published to the copy layer AT THE PICK, not at completeOnboarding: the four
        // screens that follow (Health, Body, Training, Ready) already address the athlete
        // in the second person, and in Hebrew that sentence has a gender.
        setGender(sex);
      },

      async completeOnboarding(inputs) {
        const profile: Profile = {
          name: inputs.name ?? pendingNameRef.current ?? undefined,
          sex: inputs.sex,
          /* Her words survive onboarding — the coach reads them on every call, for ever. */
          ...(inputs.goalText ? { goalText: inputs.goalText } : {}),
          ...(inputs.limitsText ? { limitsText: inputs.limitsText } : {}),
          heightCm: inputs.heightCm,
          weightKg: inputs.weightKg,
          // The weight Hush met them at — the milestone ladders are cut from it and must never
          // move again (models.Profile.startWeightKg).
          startWeightKg: inputs.weightKg,
          age: inputs.age,
          // Anchor for the yearly age auto-advance (domain/profileAge).
          ...(inputs.age != null ? { ageUpdatedAt: new Date().toISOString() } : {}),
          units: inputs.units,
          goal: inputs.goal,
          experience: inputs.experience,
          daysPerWeek: inputs.daysPerWeek,
          healthConnected: inputs.healthConnected,
          memberSince: new Date().toISOString(),
          // Engine v5 (Revision 7): onboarding puts every NEW athlete on v5. `repBand` is the cohort
          // switch — its presence routes generation, progression and the weekly mirror through v5.
          // It is NOT asked (register Part 9 §A): the rep band defaults to 8-10, editable per-muscle in
          // the body map later. Minutes default to a 60-minute ceiling, editable in Settings. The body
          // map itself comes from the body-map screen (all-normal when skipped → a full-body v5 plan).
          repBand: '8-10',
          bodyMap: inputs.bodyMap,
          // Rev 7: the time budget is a 60-minute ceiling by default (S-64), editable in Settings —
          // and hers when she told the coach how long she actually has (`withLearned`).
          workoutMinutes: inputs.workoutMinutes ?? 60,
        };
        const live = modelRef.current; // the fixture — the v8 engine's local data layer

        /*
         * ⛔ THE PROGRAMME IS GENERATED HERE AGAIN (founder 2026-08-10). It was `null`.
         *
         * The comment that stood here said the programme "already exists" because `CoachIntake` did
         * not leave until the coach's plan was on disk. **`CoachIntake` was deleted on 2026-08-04**,
         * and what replaced it — `BuildingProgramme` — still made the call, so the claim stayed true
         * by accident. Every new athlete's first programme was therefore a network round trip: slow,
         * paid for, and impossible without a signal — the whole of what the founder asked to remove.
         *
         * `live.generateProgram` is not a fallback. It reads her body map, honours `off` and
         * `emphasis`, applies her learned substitutes, orders the lifts by station, sizes the core
         * from the map and fits the week inside her minutes. It is the path
         * `everyAthleteTheEngineCanMeet` sweeps 1,455 programmes through.
         *
         * ⚠️ AND IT IS PERSISTED BELOW, in the same write as the profile. The old flow left that to
         * `db.recordCoachAnswer` one screen earlier; with nothing writing that record any more, a
         * programme held only in React state would vanish on the first cold start.
         */
        /*
         * ⛔ SHE MAY ALREADY HAVE BROUGHT ONE (founder 2026-08-11) — and this was the hole in the
         * chain. `ImportPlan` is reachable from onboarding, `adoptImportedProgram` writes her week to
         * disk, and then THIS line generated a Hush week over the top of it at the last step. The
         * import would have appeared to work and been gone by the first screen after it.
         *
         * It asks the SAME gate every other rebuild asks, so there is one rule with one home: a week
         * she brought is not ours to rewrite, and that holds on the very first build as much as on
         * the hundredth.
         */
        const brought = await db.loadProgram().catch(() => null);
        const program: Program | null = engineMayRebuild(brought)
          ? await live.generateProgram(programProfile(profile)).catch((e) => {
              void track('engine_error', { op: 'generateProgram', message: String(e) });
              return null;
            })
          : brought;

        let m = athleteModeReducer(initialAthleteModeState, { type: 'AUTH_SUCCESS' });
        m = athleteModeReducer(m, { type: 'ENTER_ONBOARDING' });
        m = athleteModeReducer(m, { type: 'PROGRAM_GENERATED' }); // -> CALIBRATING

        // A snapshot is stored at each program construction (§8.4) — this is the
        // week-one baseline used later by Compare. It is NOT surfaced now
        // (Portrait stays locked through calibration; clean absence §2.9).
        const baseline = await tryPortraitSnapshot(live, 0);
        const snapshots = baseline ? await db.appendSnapshot(baseline) : await db.loadSnapshots();
        if (baseline) emitCapabilitySnapshot(baseline, 'onboarding', 0);

        // Stamp the calendar-week anchor (calendar-primary cadence, founder 2026-07-09).
        // Mid-week signup (founder 2026-07-10): when the remaining days cannot fit the chosen
        // frequency (e.g. Thursday + 4×/week), the first bucket is stamped for the NEXT open so
        // it survives the first Saturday roll — the athlete's first program gets a full runway.
        const weekOpenMs = firstBucketOpen(Date.now(), inputs.daysPerWeek);
        await Promise.all([
          db.saveProfile(profile),
          ...(program ? [db.saveProgram(program)] : []),
          db.saveWeekOpen(weekOpenMs),
          persistMode(m),
        ]);
        setGender(profile.sex);
        dispatch({ type: 'ONBOARDED', profile, program, mode: m, snapshots, weekOpenMs });
        void track('onboarding_completed', { goal: inputs.goal, experience: inputs.experience, daysPerWeek: inputs.daysPerWeek, healthConnected: inputs.healthConnected });
        // THE WEEKLY RECEIPT IS THE ONLY RECURRING PUSH (founder 2026-07-29). A quarterly-report
        // note used to be armed here too; it was not on the founder's list of what may ever fire,
        // and the screen that announced it no longer promises it. The twelve-week window is still
        // a place she can walk to on Progress — nothing pushes her there.
        /*
         * ⚠️ REVERSED 2026-09-01 (audit finding 3). This call carried `true` — the one flag that
         * raises the iOS permission dialog — and it fired the instant she tapped the CTA, before a
         * single workout. iOS answers that question ONCE per install; burning it here meant the
         * honest pre-ask in WellDone (§8.2, "deliberately after this screen has been earned …
         * never at onboarding, before value is felt") could NEVER render on a real device. Two
         * written policies disagreed and the worse one won by executing first.
         *
         * Now: schedule only if permission already exists (a reinstall, an upgrade). The dialog
         * belongs to WellDone's ask, after the first finished session — which re-arms this exact
         * letter the moment she says yes.
         */
        void notifier.scheduleWeeklyUpdate();
      },

      async recordSessionCompleted() {
        const prev = state.modeState;
        const next = athleteModeReducer(prev, { type: 'SESSION_COMPLETED' });
        const unlocked = didUnlockPortrait(prev, next);
        await persistMode(next);

        let snapshots = state.snapshots;
        // A Portrait snapshot is captured at every session once the Portrait is live —
        // the unlock session and every session after it (§8.4) — giving the capability
        // trajectory its continuity. Tolerates the B2 gap (no snap).
        if (next.portrait === 'PORTRAIT_UNLOCKED') {
          const snap = await tryPortraitSnapshot(model, next.completedSessions);
          if (snap) {
            snapshots = await db.appendSnapshot(snap);
            emitCapabilitySnapshot(snap, unlocked ? 'unlock' : 'session', next.completedSessions);
          }
        }
        dispatch({ type: 'SESSION_COMPLETED', mode: next, unlocked, snapshots });
        // Her whole record to iCloud, after the workout that changed it — fire-and-forget,
        // throttled, never load-bearing (see `platform/cloudBackup`).
        void cloudAutoBackup();
        // …and the home-screen widget learns the week moved (same discipline: never load-bearing).
        void updateHomeWidget();
        // …and the reminders re-derive: a FINISHED week goes silent until the next roll (N-of-M).
        void syncTrainingRemindersFromPlan();
        // …and the day-six catch re-arms from THIS session — training pushes it six days out,
        // so a consistent athlete never sees it (`domain/gapCatch`).
        void armGapCatch();
        // …and the trial note re-derives: this session may be the one that left exactly one.
        void armTrialLast();
        return { unlockedPortrait: unlocked };
      },

      clearPortraitFlag() {
        dispatch({ type: 'CLEAR_PORTRAIT_FLAG' });
      },

      async syncCalibration() {
        if (!state.profile) return;
        try {
          const count = await model.sessionsCompleted();
          if (count == null) return; // fixture/dev — local count is authoritative
          const cur = state.modeState;
          const next = deriveCalibrationMode(count);
          if (next.mode === cur.mode && next.completedSessions === cur.completedSessions && next.portrait === cur.portrait) {
            return; // already consistent with backend truth
          }
          await persistMode(next);
          dispatch({ type: 'CALIBRATION_SYNCED', mode: next });
        } catch {
          // offline / backend down → keep the local (cached) calibration state
        }
      },

      async syncPending() {
        const items = await db.loadPendingSync();
        if (items.length === 0) return;
        const remaining: typeof items = [];
        for (const item of items) {
          try {
            await model.recordSession({ programDayId: item.programDayId, sets: item.sets, earlyFinish: item.earlyFinish });
          } catch (e) {
            if (!(e instanceof HttpError) || e.transient) {
              remaining.push(item); // transient — keep for the next attempt
            } else {
              void track('sync_dropped', { sessionId: item.sessionId, kind: e.kind }); // permanent — drop + record
            }
          }
        }
        await db.setPendingSync(remaining);
      },

      async ensurePortraitSnapshot() {
        // If the Portrait unlocked but its snapshot was never captured (e.g. the
        // calibration-completing session finished offline), only the week-one
        // baseline exists. Heal by capturing one now that the athlete is viewing
        // it (online); best-effort, stops once unlock data is present.
        if (state.modeState.portrait !== 'PORTRAIT_UNLOCKED') return;
        if (state.snapshots.length >= 2) return;
        const snap = await tryPortraitSnapshot(model, state.modeState.completedSessions);
        if (!snap) return; // still offline — heal on a later view
        const snapshots = await db.appendSnapshot(snap);
        emitCapabilitySnapshot(snap, 'heal', state.modeState.completedSessions);
        dispatch({ type: 'PORTRAIT_RESOLVED', snapshots });
      },

      async refreshProgram() {
        if (!state.profile) return;
        /*
         * ════ THE PROFILE MAY HAVE MOVED WITHOUT THIS STORE (2026-08-02) ════
         *
         * The post-session call runs with no React around it — she has finished and left — and it
         * applies what the coach learned about her straight to the record (`afterSession`). A coach
         * that drops her to three days a week writes it there, and this store would go on holding
         * the four it booted with until the app was killed.
         *
         * Re-read before anything else: Home calls this on focus, which is the first moment after a
         * workout that anybody looks at a number derived from the profile.
         */
        const stored = await db.loadProfile().catch(() => null);
        if (stored && JSON.stringify(stored) !== JSON.stringify(state.profile)) {
          dispatch({ type: 'PROFILE_UPDATED', profile: stored });
        }

        /*
         * ⛔ THE RETRY OF THE POST-SESSION CALL IS GONE WITH THE CALL (founder 2026-08-12).
         *
         * It read: *"if the post-session call died … her next week was simply lost."* True, and no
         * longer a risk anyone can run: the engine decides the next week from her record, so there
         * is no call to have died and nothing to wait for. See the note in `sessionStore`.
         */

        /*
         * ════ AND THE MUSCLE THAT HAS COME BACK (2026-08-02) ════
         *
         * ⚠️ A PAIN EASE TURNED A MUSCLE OFF AND NOTHING EVER TURNED IT ON. Reporting pain calls the
         * coach the same day — correctly, urgently. But the ease carries a window, and when the
         * window lapses `activeEases` simply stops returning it: the muscle drops off her sheet with
         * no event, no sentence, and no call. The coach's last instruction about that shoulder was
         * "leave it alone", and nothing ever contradicted it. She would have to notice herself, and
         * ask.
         *
         * This closes it at the one moment she is looking at Today: an ease that has expired since
         * the last check is REMOVED from her record, and the coach is told she is clear. Once per
         * ease — it is deleted in the same breath, so there is nothing left to fire on again.
         */
        const live = state.profile.painEases ?? [];
        const lapsed = live.filter((e) => e.untilMs <= Date.now());
        if (lapsed.length > 0) {
          /*
           * ⛔ THE WINDOW ENDING IS A QUESTION FOR HER, NOT A FACT THE CLOCK DECIDES.
           *
           * ⚠️ FOUND TESTING THE FOUNDER'S FOUNDATION STONES, 2026-08-02. His words:
           *
           *   > *"Say the system thinks the athlete needs to rest X time — after X time the system
           *   > has to REMEMBER and TELL him the time is up, and ASK HIM HOW HE FEELS, and whether
           *   > we can release the injury report and put it back into the programme."*
           *
           * What this did instead: deleted the ease the moment the clock passed it, told the coach
           * "bring it back at whatever pace you think is right", and said nothing at all to her. A
           * timer decided she was healed, silently, and her programme changed underneath her.
           *
           * That is the app deciding — which is the one thing the whole AI move exists to stop, and
           * it was doing it about an INJURY.
           *
           * ── WHY THE EASE IS NO LONGER CLEARED HERE ──────────────────────────────────────────────
           * Clearing it was what made the question unaskable: once the muscle is back in the map,
           * "may I bring it back?" is a question about something that has already happened. So the
           * rest STAYS until she says otherwise, `askedAt` marks that she has been asked, and the
           * coach's reply is what ends it — through the ordinary path, where she can also say no.
           */
          const askedNow = Date.now();
          const marked: Profile = {
            ...state.profile,
            painEases: live.map((e) => (e.untilMs <= askedNow && !e.askedAt ? { ...e, askedAt: askedNow } : e)),
          };
          const toAsk = lapsed.filter((e) => !e.askedAt);
          if (toAsk.length > 0) {
            await db.saveProfile(marked);
            dispatch({ type: 'PROFILE_UPDATED', profile: marked });
            void track('pain_ease_lapsed', { muscles: toAsk.map((e) => e.muscle) });
            /*
             * ⛔ THE QUESTION IS STATE NOW, NOT A MESSAGE (founder 2026-08-11).
             *
             * This fired `askCoachToRevise` — so the founder's own rule (*"the system has to REMEMBER
             * and TELL him the time is up, and ASK HIM HOW HE FEELS"*) held only while there was a
             * signal. With none, she was never asked: the muscle simply reappeared in her programme
             * one morning and nothing said why. An injury is the last place in this product that
             * should need a connection.
             *
             * Marking `askedAt` is the whole of it. `awaitingAnswer` reads the window against the
             * clock, so the question survives an app that was shut for a fortnight, and
             * `answerEaseCheck` below is what closes it.
             */
          }
        }
        // CALENDAR-PRIMARY CADENCE (founder 2026-07-09): the weekly bucket turns over at
        // Saturday 20:30 local, regardless of workout completion. Finishing every workout early just
        // leaves Home in Recovery (no next workout to offer) until the calendar rolls; missed
        // workouts never carry over — each week is a fresh bucket and the engine only progresses
        // from completed, real-logged work. So the SOLE regeneration trigger is the calendar week
        // advancing past the one the current bucket was built for (no completion-driven roll — that
        // was the old `weeklyRest` gate whose hardcoded `false` froze the bucket forever).
        const nowMs = Date.now();
        const weekOpen = currentWeekOpen(nowMs);
        const rolled = shouldRollWeek(state.weekOpenMs, state.program != null, nowMs);
        if (!rolled) {
          // A persisted bucket with no anchor is pre-upgrade state: adopt it into the CURRENT week
          // (persist the anchor) so upgrading never wipes an in-progress week — it rolls next Saturday.
          if (state.program && state.weekOpenMs == null) {
            await db.saveWeekOpen(weekOpen);
            dispatch({ type: 'PROGRAM_UPDATED', program: state.program, recents: state.recents, weekOpenMs: weekOpen });
          }
          return; // mid-week: keep the bucket intact (completed flags + athlete edits survive).
        }
        /*
         * ⛔ THE ROLL NO LONGER COMPOSES A WEEK. It only advances the anchor.
         *
         * A new week used to mean a newly generated programme. It does not any more: the coach
         * decides the programme after every session, so by Saturday the current one is already the
         * one it wants her to train — regenerating on the calendar would overwrite a decision that
         * was made from her actual training with one assembled from her body map.
         *
         * The anchor still turns, because plenty still hangs off it: which decisions belong to
         * "this week" in the letter, when the weekly push fires, and when Recovery gives way.
         */
        await db.saveWeekOpen(weekOpen);
        dispatch({ type: 'PROGRAM_UPDATED', program: state.program, recents: state.recents, weekOpenMs: weekOpen });
      },

      async setUnits(units) {
        if (!state.profile || state.profile.units === units) return;
        const profile: Profile = { ...state.profile, units };
        await db.saveProfile(profile);
        dispatch({ type: 'PROFILE_UPDATED', profile });
      },

      async reportPain(muscle, severity) {
        if (!state.profile) return;
        const now = Date.now();
        // Newest-wins by construction: the old ease is kept only if it is for another muscle, so
        // reporting the same one again REPLACES its window rather than stacking two.
        const active = activeEases(state.profile.painEases, now);
        const kept = active.filter((e) => e.muscle !== muscle);
        /*
         * ⚠️ THE SAME REPORT, ARRIVING TWICE (2026-08-05).
         *
         * A wrist report now travels on the DURABLE channel so it survives a locker and a flight
         * mode — and that channel is at-least-once. `watchBridge` rejects a repeated `intentId`,
         * but its `seen` set is in memory, so a delivery that lands after an app restart gets
         * through. The state above is idempotent by construction (the old ease is replaced, never
         * stacked); **the coach call below is not.** Two calls is two bills and two revisions that
         * can disagree.
         *
         * So the revision fires only when something actually changed. An identical ease already
         * standing for this muscle at this severity means the coach has already been told.
         */
        const already = active.some((e) => e.muscle === muscle && e.severity === severity);
        const profile: Profile = { ...state.profile, painEases: [...kept, easeFor(muscle, severity, now)] };
        await db.saveProfile(profile);
        dispatch({ type: 'PROFILE_UPDATED', profile });
        void track('pain_reported', { muscle, severity });
        /*
         * ⛔ THE MUSCLE IS OFF NOW, AND THE PROGRAMME ANSWERS THAT HERE (founder 2026-08-11).
         *
         * This was `void askCoachToRevise(...)` under a comment that said *"this used to regenerate
         * the week on the spot. It cannot any more — nothing composes a week"*. It can: the
         * assembler came back on 2026-08-10. This is the FOURTH place carrying that same sentence,
         * and it is the one where being wrong is dangerous rather than merely slow.
         *
         * ⚠️ WHAT IT MEANT IN PRACTICE: she reports a painful shoulder, the ease is saved, a network
         * call fires unawaited — and if it does not land, **the shoulder is programmed tomorrow.**
         * The old comment conceded *"the worst case is that the revision arrives later rather than
         * never"*; with no signal, later IS never. Hush has no business needing a connection to stop
         * training a joint she just said hurts.
         *
         * ⚠️ AND IT GOES THROUGH `programProfile`, which composes her active eases over the map she
         * drew — including the one saved two lines above. A raw call here would rebuild the week
         * from a body map that does not yet know about the injury, which is the exact defect that
         * function's own comment warns about.
         */
        // ⛔ A week she brought is not ours to rewrite — asked of the week ON DISK, because
        // `state.program` is null after every cold start and answered yes for everyone.
        if (!engineMayRebuild(await db.loadProgram().catch(() => state.program))) return;
        const rebuilt = await model.generateProgram(programProfile(profile)).catch((e) => {
          void track('engine_error', { op: 'generateProgram', message: String(e) });
          return null;
        });
        if (!rebuilt) return false;
        await db.saveProgram(rebuilt);
        dispatch({ type: 'PROGRAM_UPDATED', program: rebuilt, recents: state.recents });
        return true;
      },

      async saveBuiltProgram(program) {
        // Same law as adoptImportedProgram below: what she sealed is what lands on disk.
        await db.saveProgram(program);
        dispatch({ type: 'PROGRAM_UPDATED', program, recents: state.recents });
        void track('plan_built', {
          sessions: program.days.filter((d) => !d.isRest).length,
          lifts: program.days.reduce((n, d) => n + d.slots.length, 0),
        });
      },

      async revertProgramToEngine() {
        const profile = state.profile ?? (await db.loadProfile().catch(() => null));
        if (!profile) return false;
        /*
         * A full pen-back clears DAY-LEVEL ownership too: `generateProgram` preserves `authored`
         * days by design (the hybrid week), so a revert that left the flags standing would rebuild
         * around the very days she is asking to be rid of. The stripped copy is written FIRST so
         * the rebuild reads a clean week even if it re-reads disk.
         */
        const prior = await db.loadProgram().catch(() => null);
        if (prior) {
          await db.saveProgram({ ...prior, authored: undefined, days: prior.days.map((d) => ({ ...d, authored: undefined })) } as Program);
        }
        // Deliberately NOT gated on engineMayRebuild — this is the one door that hands the pen
        // back, and it exists precisely for a week the gate protects. Her tap IS the authority.
        const program = await model.generateProgram(programProfile(profile)).catch((e: unknown) => {
          void track('engine_error', { op: 'generateProgram', message: String(e) });
          return null;
        });
        if (!program) return false;
        await db.saveProgram(program);
        dispatch({ type: 'PROGRAM_UPDATED', program, recents: state.recents });
        void track('plan_reverted_to_engine', {});
        return true;
      },

      async adoptImportedProgram(program) {
        /*
         * ⛔ NO GENERATION, NO VALIDATION, NO TIDYING — see the note on the interface above. A
         * `saveProgram` that ran her week through anything on the way past would undo the entire
         * feature, silently, at the last possible moment.
         */
        await db.saveProgram(program);
        dispatch({ type: 'PROGRAM_UPDATED', program, recents: state.recents });
        void track('plan_imported', {
          sessions: program.days.filter((d) => !d.isRest).length,
          lifts: program.days.reduce((n, d) => n + d.slots.length, 0),
        });
      },

      easeChecks() {
        return state.profile ? awaitingAnswer(state.profile.painEases, Date.now()) : [];
      },

      /**
       * ⛔ HER ANSWER ENDS THE WINDOW — the app never decides she is healed.
       *
       * ⚠️ "RECOVERED" WRITES NOTHING BUT A CLOSE, and that is not an oversight: a lapsed ease
       * already forbids nothing, because `activeEases` reads the clock. Saying yes changes no
       * programme; it closes the question. The other two write a FRESH window, so the week is rebuilt
       * against a body map that knows about it — through `programProfile`, like every other build.
       */
      async answerEaseCheck(muscle, answer) {
        if (!state.profile) return;
        const now = Date.now();
        const open = awaitingAnswer(state.profile.painEases, now).filter((e) => e.muscle === muscle);
        if (open.length === 0) return;
        const closed = (state.profile.painEases ?? []).map((e) =>
          open.includes(e) ? { ...e, answeredAt: now } : e,
        );
        const again = ANSWER_SEVERITY[answer];
        const profile: Profile = {
          ...state.profile,
          painEases: again ? [...closed, easeFor(muscle, again, now)] : closed,
        };
        await db.saveProfile(profile);
        dispatch({ type: 'PROFILE_UPDATED', profile });
        void track('pain_ease_answered', { muscle, answer });
        // ⛔ A week she brought is not ours to rewrite — asked of the week ON DISK, because
        // `state.program` is null after every cold start and answered yes for everyone.
        if (!engineMayRebuild(await db.loadProgram().catch(() => state.program))) return;
        const rebuilt = await model.generateProgram(programProfile(profile)).catch((e) => {
          void track('engine_error', { op: 'generateProgram', message: String(e) });
          return null;
        });
        if (!rebuilt) return false;
        await db.saveProgram(rebuilt);
        dispatch({ type: 'PROGRAM_UPDATED', program: rebuilt, recents: state.recents });
        return true;
      },

      /*
       * ⚠️ IT REPORTS WHETHER THE WEEK WAS REBUILT (found 2026-08-18), and the reason is `BodyMapEdit`.
       *
       * That screen toasted *"Saved. Your week was rebuilt to match."* on every save — including the
       * one that returns three lines below without rebuilding anything, because the week is her
       * coach's. She read a claim about her programme that the store had just decided not to make.
       * `ExerciseLibrary` has said the true thing since `saveLibrary` started answering; this is the
       * same answer, so the same sentence can be picked from it.
       */
      async updateProfileInfo(fields) {
        if (!state.profile) return false;
        const daysChanged = fields.daysPerWeek != null && fields.daysPerWeek !== state.profile.daysPerWeek;
        const minutesChanged = false; // F-15 — the session length is a constant; nothing can change it
        // The map decides which muscles exist and how much of the week each one owns — a change is a
        // reshape, so it rebuilds on the same road as frequency and the time cap.
        const mapChanged = fields.bodyMap != null && JSON.stringify(fields.bodyMap) !== JSON.stringify(state.profile.bodyMap ?? {});
        // The room decides which pools the engine may choose from — a change is a reshape too.
        const roomChanged =
          fields.equipment !== undefined &&
          JSON.stringify(fields.equipment ?? null) !== JSON.stringify(state.profile.equipment ?? null);
        // Merge only the provided fields; undefined leaves the existing value intact.
        const profile: Profile = {
          ...state.profile,
          // Setting age re-anchors the yearly auto-advance (domain/profileAge).
          ...(fields.age != null ? { age: fields.age, ageUpdatedAt: new Date().toISOString() } : {}),
          ...(fields.heightCm != null ? { heightCm: fields.heightCm } : {}),
          ...(fields.weightKg != null ? { weightKg: fields.weightKg } : {}),
          ...(fields.sex ? { sex: fields.sex } : {}),
          ...(fields.experience ? { experience: fields.experience } : {}),
          ...(fields.daysPerWeek != null ? { daysPerWeek: fields.daysPerWeek } : {}),
          /* ⛔ `workoutMinutes` IS NOT SETTABLE (F-15, founder 2026-08-10). It was accepted here and
             no screen ever sent it — a variable nobody could move, costing a dimension of engine
             state. The session is 45–60 for everyone; her days, her bodyweight and her body map are
             what she sets. */
          ...(fields.bodyMap != null ? { bodyMap: fields.bodyMap } : {}),
          ...(fields.repBandByMuscle != null ? { repBandByMuscle: fields.repBandByMuscle } : {}),
        };
        // The room: null clears to the full-gym default (the key leaves the profile), a list sets it.
        if (fields.equipment === null) delete profile.equipment;
        else if (fields.equipment !== undefined) profile.equipment = fields.equipment;
        if (fields.weekOpensDow != null) {
          profile.weekOpensDow = fields.weekOpensDow;
          applyWeekOpenDow(fields.weekOpensDow); // live — the cadence readers follow immediately
          void notifier.scheduleWeeklyUpdate(); // …and the Saturday note walks to the new evening
        }
        await db.saveProfile(profile);
        dispatch({ type: 'PROFILE_UPDATED', profile });
        void track('profile_edited', {
          changed: Object.keys(fields).filter((k) => (fields as Record<string, unknown>)[k] != null),
        });
        if (daysChanged || minutesChanged || mapChanged || roomChanged) {
          /*
           * ⛔ SHE CHANGED SOMETHING STRUCTURAL, AND THE WEEK IS REBUILT HERE AGAIN (founder
           * 2026-08-10, item 3). This was `void askCoachToRevise(...)` — the third instance of the
           * same amputation as `foldEngine` and `completeOnboarding`, and the worst-behaved of them:
           *
           *   · **It was fire-and-forget.** `void`, never awaited. A failed call changed nothing and
           *     said nothing, so turning a muscle off and getting the same week back was the
           *     expected outcome on a bad signal, with no way to tell that from "the engine decided
           *     to keep it".
           *   · **The message only ever named DAYS** — `she now trains N days a week` — so a body-map
           *     edit or a new time cap reached the coach as a sentence about frequency. The one
           *     structural change the athlete makes most deliberately was the one it could not say.
           *
           * `generateProgram` reads all three: the map decides which muscles exist and how much of
           * the week each owns, `daysPerWeek` sets how many workouts it is dealt across, and
           * `workoutMinutes` is the ceiling it trims to.
           *
           * ⚠️ AND HER PROGRESS SURVIVES IT. v5 keys every decision to the EXERCISE, never to a slot
           * (S-29), so a lift that is still in the week after the reshape keeps the load it earned.
           * Generation touches no engine state — that is what makes a rebuild safe to do on an edit
           * rather than something to save for a Saturday.
           */
          // ⛔ A week she brought is not ours to rewrite — asked of the week ON DISK, because
          // `state.program` is null after every cold start and answered yes for everyone.
          if (!engineMayRebuild(await db.loadProgram().catch(() => state.program))) return false;
          const rebuilt = await model.generateProgram(programProfile(profile)).catch((e) => {
            void track('engine_error', { op: 'generateProgram', message: String(e) });
            return null;
          });
          if (rebuilt) {
            await db.saveProgram(rebuilt);
            dispatch({ type: 'PROGRAM_UPDATED', program: rebuilt, recents: state.recents });
            return true;
          }
        }
        // Nothing structural changed, or the build failed: the profile is saved and the week is not
        // new. Only a week that was actually rebuilt may be announced as one.
        return false;
      },

      async learnFromCoach(learned) {
        if (!state.profile) return;
        // The rule itself is `domain/coachLearned` — including the one that matters, that nothing is
        // written when nothing moved. Null means her record already says all of it.
        const applied = applyLearned(state.profile, learned);
        if (!applied) return;
        await db.saveProfile(applied.profile);
        dispatch({ type: 'PROFILE_UPDATED', profile: applied.profile });
        void track('coach_learned', { fields: applied.changed });
      },

      /**
       * Persist the Health connection (Settings → Apple Health).
       *
       * FOUNDER 2026-07-12: "if I didn't turn Apple Health on at the start, Settings won't let
       * me turn it on." Exactly right, and the reason is that the switch had NO WRITER — it read
       * `profile.healthConnected`, which only onboarding ever set. Running the permission flow
       * again changed nothing the switch could see, so it snapped straight back to off.
       */
      async setHealthConnected(connected) {
        if (!state.profile || state.profile.healthConnected === connected) return;
        const profile: Profile = { ...state.profile, healthConnected: connected };
        await db.saveProfile(profile);
        dispatch({ type: 'PROFILE_UPDATED', profile });
        void track('health_connection_changed', { connected });
      },


      // The programme-edit swap (replaceSlotExercise → setExercisePreference, S-31) and the pin/lock
      // toggle (toggleSlotLock, S-30) are DELETED (Rev 7, S-73). Exercise selection is owned through
      // the IN-WORKOUT swap (learned into a standing choice, S-69), the body map (S-56), and the
      // DECLARED replacement (`declareSwap`, founder 2026-08-22) — see the deletion note below.

      /*
       * ⛔ THE ENGINE-ROTATION UNDO IS DELETED (2026-08-26, the founder's "decide it" pass).
       *
       * Founder 2026-07-17: *"when the engine changes an exercise, show it in the engine's review
       * and offer an undo of that change."* It was built — `undoEngineSwap` here, `undoEngineRotation`
       * in `domain/swapLearning`, `undoable`/`onUndoSwap` on Home — and the SURFACE never landed:
       * `HomeView` read neither prop, and `setUndoable` was only ever called with `null`. A control
       * that cannot appear was wired end to end for six weeks.
       *
       * ⚠️ IT IS DELETED RATHER THAN FINISHED, and the argument is the product's own, written at the
       * door that replaced it (`PreWorkoutScreen`): *"naming the original again takes it back. A
       * declaration is reversible the way she made it — by saying the other thing — rather than by a
       * second control that exists only to undo the first."* `declareSwap` (founder 2026-08-22) is
       * that door: it is reachable from the pre-workout card, it covers a rotation and every other
       * case, and it is the same shape as his swap ruling — *"להחליף תרגיל יש את כפתור ה-SWAP"*.
       *
       * ⚠️ AND THE STATE IS NOT LOST. S-71's implicit path is alive and writes the identical
       * `leaveItsByMuscle` pin on two swap-backs (`sessionStore`'s fold, every session save). What
       * went is the second, narrower lever — not the outcome.
       *
       * ⛔ THE NOTE THAT STOOD HERE WAS ALSO WRONG, and it is worth recording: it said *"there are
       * no engine rotations left to undo — rotation was Loop 2's, and Loop 2 is gone."* **Loop 2 is
       * not gone.** `stall_rotate` is still one of its decisions (`engine/v5/loop2`), `fixtureModel`
       * still writes `engineRotated`, and the fold still reads it. What left the product on
       * 2026-08-26 was LOOP 1, from the live session. A comment that retires the wrong loop is how a
       * live feature comes to be treated as residue.
       */

      /**
       * ════ HER PICKS AND HER REFUSALS, AND THE WEEK THAT COMES BACK ════
       *
       * ⛔ FOUNDER, 2026-08-16: *"תרגילים אהובים או שנואים או ספרייה של תרגילים"*.
       *
       * `programAssembly` has honoured both since the same day — her picks take the leading seats for
       * a muscle and the engine fills what the volume still affords behind them; a refusal is a GATE
       * no score may overrule. What did not exist was any way for her to say either, which is a
       * feature that is finished everywhere except where she can reach it.
       *
       * ⚠️ IT REBUILDS ON THE BODY MAP'S ROAD, DELIBERATELY. A pick is not a preference the engine
       * consults later — it changes which lifts her week is made of, exactly as switching a muscle on
       * does, so it must produce the same thing: a new week, now, that she can look at. `refreshProgram`
       * would have been the smaller call and the wrong one; it does not regenerate.
       *
       * ⚠️ AND HER LOADS SURVIVE IT (S-29). v5 keys every decision to the EXERCISE, never to a slot, so
       * a lift still in the week after the reshape keeps the weight it earned.
       */
      /**
       * ⛔ A DECLARED SUBSTITUTION, ON THE LIBRARY'S OWN ROAD (founder 2026-08-22).
       *
       * *"אי אפשר ממש להכנס לתוכנית האימון שלנו ולהחליף תרגיל לתרגיל שנמצא בספרייה."*
       *
       * ⚠️ IT WRITES `declaredSubs`, NEVER `substitutes`. The second map is the K=2 fold's belief
       * about what she keeps doing, and the fold CLEARS entries it stops believing — a declaration
       * living there could be deleted by inference. `db.OwnedPreferences` states the doctrine; this
       * is the one place that obeys it on the write side.
       *
       * ⚠️ AND IT REBUILDS, for the reason `saveLibrary` records: a substitution is not a preference
       * the engine consults later, it changes which lifts her week is made of — so it must produce
       * the same thing switching a muscle on does, which is a new week she can look at now. Her
       * loads survive it: v5 keys every decision to the EXERCISE, never to a slot (S-29).
       */
      /**
       * ⛔ THE RESTORE, AND THE ONE THING IT MUST NOT LEAVE HER WITH: NO WEEK.
       *
       * `Root` gates on the PROFILE, and boot builds no programme — only `completeOnboarding` does.
       * So a record written before the programme travelled (or one taken from a phone that had
       * none) would put her in the app with a full history and nothing on Today.
       *
       * ⚠️ AND IT ONLY BUILDS WHEN THERE IS NOTHING THERE. If the record carried a week, that week
       * stands — including one she BROUGHT, which nothing may regenerate over
       * (`aWeekSheBroughtIsNotOursToRewrite`, and `engineMayRebuild` is asked here exactly as it is
       * at every other build).
       */
      async restoreRecord(record) {
        await db.restoreRecord(record);
        if (!record.program) {
          const profile = await db.loadProfile().catch(() => null);
          const onDisk = await db.loadProgram().catch(() => null);
          if (profile && !onDisk && engineMayRebuild(onDisk)) {
            const built = await model.generateProgram(programProfile(profile)).catch((e) => {
              void track('engine_error', { op: 'generateProgram', message: String(e) });
              return null;
            });
            if (built) await db.saveProgram(built);
          }
        }
      },

      async declareSwap(fromExerciseId, toExerciseId) {
        if (!state.profile) return false;
        const prefs = await db.loadPreferences();
        const declared = { ...(prefs.declaredSubs ?? {}) };
        /*
         * ⚠️ THE ANCHOR IS THE LIFT THE WEEK WAS BUILT FROM, not the one she is looking at. After a
         * first declaration the row shows the REPLACEMENT — so a second swap on that row must edit
         * the entry that produced it, or the map grows a chain of one-offs and the original lift is
         * never reachable again.
         */
        const anchor = Object.keys(declared).find((k) => declared[k] === fromExerciseId) ?? fromExerciseId;
        if (anchor === toExerciseId) delete declared[anchor];
        else declared[anchor] = toExerciseId;
        await db.savePreferences({ ...prefs, declaredSubs: declared });
        void track('swap_declared', { from: anchor, to: toExerciseId, cleared: anchor === toExerciseId });
        // ⛔ A week she brought is not ours to rewrite — the same guard every rebuild passes.
        if (!engineMayRebuild(await db.loadProgram().catch(() => state.program))) return false;
        const rebuilt = await model.generateProgram(programProfile(state.profile)).catch((e) => {
          void track('engine_error', { op: 'generateProgram', message: String(e) });
          return null;
        });
        if (!rebuilt) return false;
        await db.saveProgram(rebuilt);
        dispatch({ type: 'PROGRAM_UPDATED', program: rebuilt, recents: state.recents });
        return true;
      },

      async saveLibrary(chosenByMuscle, refusedIds) {
        if (!state.profile) return false;
        const prefs = await db.loadPreferences();
        await db.savePreferences({ ...prefs, chosenByMuscle, refusedIds });
        void track('library_saved', {
          chosen: Object.values(chosenByMuscle).reduce((n, ids) => n + ids.length, 0),
          refused: refusedIds.length,
        });
        // ⛔ A week she brought is not ours to rewrite — the same guard every rebuild passes, asked
        // of the week ON DISK. Her declarations are saved above regardless; what she is told about
        // the WEEK is the caller's job.
        if (!engineMayRebuild(await db.loadProgram().catch(() => state.program))) return false;
        const rebuilt = await model.generateProgram(programProfile(state.profile)).catch((e) => {
          void track('engine_error', { op: 'generateProgram', message: String(e) });
          return null;
        });
        if (!rebuilt) return false;
        await db.saveProgram(rebuilt);
        dispatch({ type: 'PROGRAM_UPDATED', program: rebuilt, recents: state.recents });
        return true;
      },

      async reorderExercise(dayId, fromIndex, toIndex) {
        /*
         * ⛔ NOTHING TO REORDER. This moved a slot within a generated `ProgramDay`. The coach writes
         * the order it wants and there is no local structure to rearrange behind its back — if she
         * wants a different order she can say so, which is a better door than a drag that had to be
         * inferred.
         */
        void dayId; void fromIndex; void toIndex;
      },

      async reorderWorkouts(fromIndex, toIndex) {
        /*
         * ⛔ NOTHING TO REORDER, for the same reason as `reorderExercise` above: this moved a
         * generated week's days around, and the coach writes the order it means. A programme has a
         * shape — a long run belongs on Sunday — and dragging it silently would edit a decision.
         */
        void fromIndex; void toIndex;
      },

      async markWorkoutCompleted(programDayId) {
        /*
         * ⛔ NOTHING TO MARK. "Done this week" used to be a FLAG written onto a `ProgramDay`, and
         * the flag needed healing at boot because a kill between the history write and the flag
         * write left a trained workout still on offer.
         *
         * It is DERIVED now: a coach workout is done when a completed session carrying its id sits
         * in this week's history. One fact, read where it is needed, and there is no second copy to
         * fall out of step with the first — which is what the heal existed to repair.
         */
        void programDayId;
      },

      // Test harness only — never reachable in a release build. Simulates having
      // completed calibration so the signature moment can be reviewed without
      // grinding seven sessions. Does NOT alter product behavior in production.
      async devUnlockPortrait() {
        if (!__DEV__) return;
        const next: AthleteModeState = {
          mode: 'ADVISORY',
          completedSessions: CALIBRATION_SESSIONS,
          portrait: 'PORTRAIT_UNLOCKED',
        };
        const snap = await model.portraitSnapshot({ completedSessions: next.completedSessions });
        const snapshots = await db.appendSnapshot(snap);
        await persistMode(next);
        dispatch({ type: 'SESSION_COMPLETED', mode: next, unlocked: true, snapshots });
      },

      async refreshEntitlement() {
        try {
          const next = await billing.getEntitlement();
          if (
            next.active === state.entitlement.active &&
            next.productId === state.entitlement.productId &&
            next.source === state.entitlement.source
          ) {
            return; // already consistent
          }
          await db.saveEntitlement(next);
          trackEntitlementChange(state.entitlement, next);
          dispatch({ type: 'ENTITLEMENT', entitlement: next });
          void armTrialLast(); // a member's pending trial note cancels itself here
        } catch {
          /* store unavailable — keep the cached entitlement */
        }
      },

      async purchaseSubscription(productId) {
        void track(BILLING_EVENTS.purchaseStarted, { productId });
        const result = await billing.purchase(productId);
        if (result.status === 'purchased' || result.status === 'restored') {
          await db.saveEntitlement(result.entitlement);
          trackEntitlementChange(state.entitlement, result.entitlement);
          dispatch({ type: 'ENTITLEMENT', entitlement: result.entitlement });
          void armTrialLast(); // a member's pending trial note cancels itself here
          void track(BILLING_EVENTS.purchaseSucceeded, { productId, source: result.entitlement.source });
        } else if (result.status === 'cancelled') {
          void track(BILLING_EVENTS.purchaseCancelled, { productId });
        } else {
          void track(BILLING_EVENTS.purchaseFailed, { productId, status: result.status });
        }
        return result;
      },

      async restorePurchases() {
        void track(BILLING_EVENTS.restoreStarted);
        const result = await billing.restore();
        if (result.status === 'restored' && result.entitlement.active) {
          await db.saveEntitlement(result.entitlement);
          trackEntitlementChange(state.entitlement, result.entitlement);
          dispatch({ type: 'ENTITLEMENT', entitlement: result.entitlement });
          void armTrialLast(); // a member's pending trial note cancels itself here
          void track(BILLING_EVENTS.restoreSucceeded, { productId: result.entitlement.productId });
        } else {
          void track(BILLING_EVENTS.restoreEmpty);
        }
        return result;
      },

      async resetAccount() {
        void track('signed_out');
        await flushTelemetry(); // ship before the wipe
        await notifier.cancelAll(); // cancel the weekly note so a signed-out device stays silent
        await db.clearAll();
        await circleSignOut(); // the circle session is IDENTITY — a stranger's phone keeps nobody's circle
        // The device goes back to a stranger. Nothing about the last athlete may survive into the
        // next one's onboarding: not their gender (the app would address the next person in her
        // person, in Hebrew, all the way to the step where they finally get to say who they are),
        // and certainly not their NAME, which is still sitting in the pending ref.
        resetGender();
        // …and not the in-memory latch that says the wrist has already been named. `db.clearAll`
        // removed the key; this drops the shadow over it, or a wiped phone goes on telling the
        // next athlete "already told" until the app is force-quit.
        resetWristOffered();
        pendingNameRef.current = null;
        dispatch({ type: 'RESET' });
      },

      async deleteAccount() {
        void track('account_deleted');
        await flushTelemetry(); // journal the act before the wipe erases the journal
        /*
         * SERVER FIRST, AND FOR REAL (2026-09-01, audit finding 4). Until today "delete account"
         * deleted the phone and left the Apple sub → circle mapping on Cloudflare forever — the
         * model's erase hook below is a fixture no-op, and nothing else called out. `deleteIdentity`
         * erases the worker's copy (user record, week publications, circle membership, session)
         * while the token that authenticates it still exists; a failure is journaled, never a
         * blocker — her right to wipe the device in her hand does not depend on the network.
         */
        if (!(await deleteIdentity().catch(() => false))) {
          void track('account_erase_failed', { kind: 'identity_worker' });
        }
        // The model's erase hook (OD-2), kept best-effort: today the fixture's is a no-op — her
        // record IS the device (+ her iCloud), so wiping locally below IS the deletion — but any
        // future remote model must erase server-side FIRST, and this is where that happens. A
        // transient failure must never strand the athlete on a half-deleted device.
        try {
          await model.eraseAccount();
        } catch (e) {
          void track('account_erase_failed', { kind: e instanceof HttpError ? e.kind : 'unknown' });
        }
        await notifier.cancelAll();
        await db.clearAll();
        await circleSignOut(); // the circle session is IDENTITY — a stranger's phone keeps nobody's circle
        // The device goes back to a stranger. Nothing about the last athlete may survive into the
        // next one's onboarding: not their gender (the app would address the next person in her
        // person, in Hebrew, all the way to the step where they finally get to say who they are),
        // and certainly not their NAME, which is still sitting in the pending ref.
        resetGender();
        // …and not the in-memory latch that says the wrist has already been named. `db.clearAll`
        // removed the key; this drops the shadow over it, or a wiped phone goes on telling the
        // next athlete "already told" until the app is force-quit.
        resetWristOffered();
        pendingNameRef.current = null;
        dispatch({ type: 'RESET' });
      },
    };
  }, [state]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useApp(): AppApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used within AppProvider');
  return v;
}
