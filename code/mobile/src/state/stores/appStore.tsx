/**
 * App state — profile, program, and athlete-mode, persisted locally.
 * Routes the whole app (Root reads `mode` to decide which screens exist).
 */
import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Experience, MuscleStance, OnboardingInputs, PortraitSnapshot, Profile, Program, RepBandChoice, Session, Units } from '@/data/local/models';
import { db, SCHEMA_VERSION, type PersistedMode } from '@/data/local/db';
import { salvageOrphanSession, RESUME_WINDOW_MS, type SalvageResult } from '@/state/sessionRecovery';
import { currentWeekOpen, firstBucketOpen, healWeekCompletion, shouldRollWeek } from '@/domain/weekCadence';
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
import { selectModel, resetModelSelection } from '@/data/api/selectModel';
import { selfEnroll } from '@/data/api/enroll';
import { setToken, clearToken, adoptDevTokenIfPresent } from '@/data/api/config';
import { setUnauthorizedHandler } from '@/data/api/authEvents';
import { HttpError } from '@/data/api/httpErrors';
import { track, flush as flushTelemetry } from '@/platform/telemetry';
import type { ModelClient } from '@/data/api/modelClient';
import { move } from '@/domain/reorder';
import { undoEngineRotation } from '@/domain/swapLearning';
import { muscleOf } from '@/data/exercises';
import { notifier } from '@/platform/notifications';
import { health } from '@/platform/health';
import { ingestHealth } from '@/platform/health/healthIngestion';
import { INITIAL_HEALTH_STATE } from '@/platform/health/healthModel';
import { signInWith, type AuthProvider } from '@/platform/auth';
import { setGender, resetGender } from '@/i18n/gender';
import { billing, trackEntitlementChange, type ProductId, type PurchaseResult } from '@/platform/billing';
import { BILLING_EVENTS } from '@/platform/events';
import { NO_ENTITLEMENT, type Entitlement } from '@/domain/entitlement';

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
  program: Program | null;
  modeState: AthleteModeState;
  justUnlockedPortrait: boolean; // one-shot flag consumed by the Well Done → Portrait route
  snapshots: PortraitSnapshot[]; // oldest first; [0] is the week-one baseline
  recents: string[]; // exercise ids, most-recent first ("Your exercises")
  revoked: boolean; // the invite was revoked (401) — show the explanation on Enrollment
  weekOpenMs: number | null; // Saturday-20:30-local the current bucket was built for (calendar cadence)
  entitlement: Entitlement; // subscription state (StoreKit truth, locally cached for gating)
}

type Action =
  | { type: 'BOOTED'; profile: Profile | null; program: Program | null; mode: AthleteModeState; snapshots: PortraitSnapshot[]; recents: string[]; entitlement: Entitlement; weekOpenMs: number | null }
  | { type: 'ENTITLEMENT'; entitlement: Entitlement }
  | { type: 'PROGRAM_UPDATED'; program: Program; recents: string[]; weekOpenMs?: number }
  | { type: 'ONBOARDED'; profile: Profile; program: Program; mode: AthleteModeState; snapshots: PortraitSnapshot[]; weekOpenMs: number }
  | { type: 'PROFILE_UPDATED'; profile: Profile }
  | { type: 'SESSION_COMPLETED'; mode: AthleteModeState; unlocked: boolean; snapshots: PortraitSnapshot[] }
  | { type: 'CALIBRATION_SYNCED'; mode: AthleteModeState }
  | { type: 'PORTRAIT_RESOLVED'; snapshots: PortraitSnapshot[] }
  | { type: 'CLEAR_PORTRAIT_FLAG' }
  | { type: 'REVOKED' }
  | { type: 'RESET' };

const initial: AppState = {
  booted: false,
  profile: null,
  program: null,
  modeState: initialAthleteModeState,
  justUnlockedPortrait: false,
  snapshots: [],
  recents: [],
  revoked: false,
  weekOpenMs: null,
  entitlement: NO_ENTITLEMENT,
};

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'BOOTED':
      return { ...s, booted: true, profile: a.profile, program: a.program, modeState: a.mode, snapshots: a.snapshots, recents: a.recents, entitlement: a.entitlement, weekOpenMs: a.weekOpenMs };
    case 'ENTITLEMENT':
      return { ...s, entitlement: a.entitlement };
    case 'PROGRAM_UPDATED':
      return { ...s, program: a.program, recents: a.recents, ...(a.weekOpenMs !== undefined ? { weekOpenMs: a.weekOpenMs } : {}) };
    case 'ONBOARDED':
      return { ...s, profile: a.profile, program: a.program, modeState: a.mode, snapshots: a.snapshots, weekOpenMs: a.weekOpenMs, revoked: false };
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
    case 'REVOKED':
      // Authenticated state cleared; the athlete is returned to Enrollment with
      // the one-line explanation. No continued training on a revoked identity.
      return { ...initial, booted: true, revoked: true };
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
  undoEngineSwap: (anchorExerciseId: string) => Promise<void>;
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
  }) => Promise<void>;
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

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  // Active model: the real backend when configured + enrolled, else the fixture.
  // Resolved once at boot (selectModel); read at call time so the app store
  // never cares which implementation answers (spec §8.7).
  const modelRef = useRef<ModelClient>(fixtureModel);
  // Latest "is the athlete enrolled?" for the revocation guard, and a one-shot
  // latch so a burst of 401s triggers a single revocation.
  const enrolledRef = useRef(false);
  enrolledRef.current = !!state.profile;
  const revokingRef = useRef(false);
  // Name captured from Apple at sign-in (returned only on first authorization) —
  // applied to the profile at completeOnboarding. No PII is persisted before that.
  const pendingNameRef = useRef<string | null>(null);

  // A 401 on an authenticated request = the session is no longer valid (signed out
  // elsewhere / token expired). Clear the identity + ALL local state and return to
  // the Authentication front door. Guarded so it fires once per session and is a
  // no-op before the athlete has a profile (pre-onboarding sign-in failures are
  // handled inline by the Authentication screen).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!enrolledRef.current || revokingRef.current) return;
      revokingRef.current = true;
      (async () => {
        void track('session_invalidated');
        await flushTelemetry(); // ship before the wipe
        await notifier.cancelAll(); // no scheduled notes survive an invalidated session
        await db.clearAll();
        await clearToken();
        resetModelSelection();
        modelRef.current = await selectModel();
        // The device goes back to a stranger. Nothing about the last athlete may survive into the
        // next one's onboarding: not their gender (the app would address the next person in her
        // person, in Hebrew, all the way to the step where they finally get to say who they are),
        // and certainly not their NAME, which is still sitting in the pending ref.
        resetGender();
        pendingNameRef.current = null;
        dispatch({ type: 'RESET' });
      })();
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    (async () => {
      // Internal "connected" builds: adopt a baked test-athlete token BEFORE model
      // selection so selectModel() picks the real backend (HTTP) instead of the
      // fixture. No-op in production (no token baked in). See config.adoptDevTokenIfPresent.
      await adoptDevTokenIfPresent();
      modelRef.current = await selectModel();


      // Schema-version guard: detect persisted-shape drift (e.g. an upgrade/
      // downgrade) so corruption is OBSERVABLE rather than silent. Shapes are
      // additive (forward-compatible), so we stamp + telemeter rather than wipe.
      const storedVersion = await db.getSchemaVersion();
      if (storedVersion != null && storedVersion !== SCHEMA_VERSION) {
        void track('schema_version_mismatch', { stored: storedVersion, current: SCHEMA_VERSION });
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

      const [storedProfile, program, persistedMode, snapshots, recents, cachedEntitlement, weekOpenMs] = await Promise.all([
        db.loadProfile(),
        db.loadProgram(),
        db.loadMode(),
        db.loadSnapshots(),
        db.loadRecents(),
        db.loadEntitlement(),
        db.loadWeekOpen(),
      ]);
      // Age upkeep (founder 2026-07-10): age is asked once — the app advances it a
      // year per full year elapsed, so program construction always sees the current
      // age. Best-effort persist; the aged value is used this session regardless.
      let profile = storedProfile;
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
      dispatch({ type: 'BOOTED', profile, program, mode, snapshots, recents, entitlement: cachedEntitlement ?? NO_ENTITLEMENT, weekOpenMs });

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
      else void notifier.cancelWeeklyProgramReady();

      // Finding 5: heal a crashed completion. If a session for a program day is in THIS week's
      // history but the day wasn't flagged done (a kill between the history write and the flag
      // write), mark it done so Home never re-offers an already-trained workout. Best-effort +
      // isolated so it can never break boot. (The completed-session COUNT is no longer surfaced,
      // so only the day flag needs healing.)
      void (async () => {
        try {
          if (!program) return;
          const healed = healWeekCompletion(program, await db.loadHistory(), weekOpenMs, Date.now());
          if (healed) {
            await db.saveProgram(healed);
            dispatch({ type: 'PROGRAM_UPDATED', program: healed, recents });
          }
        } catch {
          /* best-effort heal — never blocks boot */
        }
      })();

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

  const api = useMemo<AppApi>(() => {
    const model = modelRef.current;
    async function persistMode(m: AthleteModeState) {
      const p: PersistedMode = { mode: m.mode, completedSessions: m.completedSessions, portrait: m.portrait };
      await db.saveMode(p);
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
        if (result.identityToken) {
          await setToken(result.identityToken);
          resetModelSelection();
          modelRef.current = await selectModel();
        }
        void track('signed_in', { provider });
        revokingRef.current = false; // re-arm the session-invalidation guard
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
          // Rev 7: the time budget is a 60-minute ceiling by default (S-64), editable in Settings.
          workoutMinutes: 60,
        };
        // SELF-ENROLL (zero-friction): create the backend athlete from the onboarding
        // stats + adopt its token, so the REAL model drives the program from the first
        // workout — no extra screen, no operator step. Best-effort: on failure (no backend
        // / offline) the app stays on the local fixture, still fully usable. Must run
        // BEFORE the model calls below so they hit the backend; re-select the model after.
        const enrolled = await selfEnroll({
          sex: inputs.sex,
          age: inputs.age,
          experience: inputs.experience,
          bodyweightKg: inputs.weightKg,
        });
        if (enrolled) {
          resetModelSelection();
          modelRef.current = await selectModel();
        }
        const live = modelRef.current; // the (possibly just-swapped) live model

        // Carry the chosen weekly frequency into the server strategy BEFORE composing
        // the first week (compose is idempotent — frequency can't change after). Best-
        // effort: a failure here must not strand onboarding (the week then falls back to
        // the strategy default); generateProgram below would surface a real outage anyway.
        try {
          await live.setWeeklyFrequency(inputs.daysPerWeek);
        } catch {
          /* non-fatal — proceed; the composed week uses the default frequency */
        }
        // Program generated BEFORE Home renders (spec flow §2.1).
        const program = await live.generateProgram(profile);

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
        await Promise.all([db.saveProfile(profile), db.saveProgram(program), db.saveWeekOpen(weekOpenMs), persistMode(m)]);
        setGender(profile.sex);
        dispatch({ type: 'ONBOARDED', profile, program, mode: m, snapshots, weekOpenMs });
        void track('onboarding_completed', { goal: inputs.goal, experience: inputs.experience, daysPerWeek: inputs.daysPerWeek, healthConnected: inputs.healthConnected });
        void track('program_generated', { reason: 'onboarding', frequency: program.frequency, workouts: program.days.length });
        // Quarterly progress report — a recurring ~3-month note that opens the
        // peak-weight comparison (founder). Stub is a no-op; native build delivers.
        void notifier.scheduleQuarterlyReport();
        // …and the weekly receipt, from the first Saturday on. `true` = this is the ONE call
        // allowed to raise the permission dialog: the athlete has just finished building their
        // program, which is the only honest moment to ask whether Hush may tell them it changed.
        void notifier.scheduleWeeklyUpdate(true);
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
        try {
          const program = await model.generateProgram(state.profile);
          await db.saveProgram(program);
          await db.saveWeekOpen(weekOpen);
          dispatch({ type: 'PROGRAM_UPDATED', program, recents: state.recents, weekOpenMs: weekOpen });
          void track('program_generated', { reason: 'weekly', frequency: program.frequency, workouts: program.days.length });
        } catch {
          // Backend unreachable → keep the last-known bucket (degrade quietly, §5.3); the roll
          // re-attempts on the next Home focus since the anchor is only advanced on success.
        }
      },

      async setUnits(units) {
        if (!state.profile || state.profile.units === units) return;
        const profile: Profile = { ...state.profile, units };
        await db.saveProfile(profile);
        dispatch({ type: 'PROFILE_UPDATED', profile });
      },

      async updateProfileInfo(fields) {
        if (!state.profile) return;
        const daysChanged = fields.daysPerWeek != null && fields.daysPerWeek !== state.profile.daysPerWeek;
        const minutesChanged = fields.workoutMinutes != null && fields.workoutMinutes !== state.profile.workoutMinutes;
        // The map decides which muscles exist and how much of the week each one owns — a change is a
        // reshape, so it rebuilds on the same road as frequency and the time cap.
        const mapChanged = fields.bodyMap != null && JSON.stringify(fields.bodyMap) !== JSON.stringify(state.profile.bodyMap ?? {});
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
          ...(fields.workoutMinutes != null ? { workoutMinutes: fields.workoutMinutes } : {}),
          ...(fields.bodyMap != null ? { bodyMap: fields.bodyMap } : {}),
          ...(fields.repBandByMuscle != null ? { repBandByMuscle: fields.repBandByMuscle } : {}),
        };
        await db.saveProfile(profile);
        dispatch({ type: 'PROFILE_UPDATED', profile });
        void track('profile_edited', {
          changed: Object.keys(fields).filter((k) => (fields as Record<string, unknown>)[k] != null),
        });
        // A changed weekly frequency reshapes the split; a changed time budget re-runs the time cap
        // (S-64) — either reshapes the week, so rebuild now (athlete-owned pins/order re-apply through
        // generateProgram). Best-effort; otherwise it applies at the next regeneration.
        if (daysChanged || minutesChanged || mapChanged) {
          if (daysChanged) {
            try {
              await model.setWeeklyFrequency(profile.daysPerWeek);
            } catch {
              /* non-fatal — generateProgram below still uses the profile's frequency */
            }
          }
          try {
            const fresh = await model.generateProgram(profile);
            // A MID-WEEK rebuild must not resurrect finished work: the fresh days come back
            // `completed: false`, so re-apply this week's DONE flags from the history (else
            // Home re-offers a workout the athlete already trained).
            const program = healWeekCompletion(fresh, await db.loadHistory(), state.weekOpenMs, Date.now()) ?? fresh;
            await db.saveProgram(program);
            dispatch({ type: 'PROGRAM_UPDATED', program, recents: state.recents });
            void track('program_generated', { reason: daysChanged ? 'frequency' : mapChanged ? 'body_map' : 'minutes', frequency: program.frequency });
          } catch {
            /* offline — applies on the next weekly regeneration */
          }
        }
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
      // the IN-WORKOUT swap (learned into a standing choice, S-69), the body map (S-56), and — since
      // 2026-07-17 — the UNDO below, which is S-71's outcome asked for out loud instead of inferred.

      /**
       * "No — give me that lift back." The one explicit lever over an engine ROTATION.
       *
       * Founder 2026-07-17: show the engine's exercise change on Home and let her undo it. This is
       * the same state S-71 reaches after two silent swap-backs (`learnedLeaveIts`), reached in one
       * tap: the substitute is cleared, the rotation mark with it, and the anchor becomes a learned
       * pin the engine will not rotate again (S-30/S-59 roles included).
       *
       * The pure rule lives in `domain/swapLearning.undoEngineRotation` — including the guard that
       * only a LIVE engine rotation can be undone, so a graduation (not resistible, S-52/S-71) and
       * her own learned swap are both out of reach, and a double tap cannot invent a pin.
       *
       * Rebuilding the week travels the exact road a body-map or frequency change does, `healWeek
       * Completion` included: the fresh days come back `completed: false`, and a mid-week undo must
       * not resurrect a workout she already trained.
       */
      async undoEngineSwap(anchorExerciseId) {
        if (!state.profile) return;
        const prefs = await db.loadPreferences();
        const next = undoEngineRotation(prefs, anchorExerciseId, (id) => muscleOf(id) ?? null);
        if (next === prefs) return; // not a live rotation — nothing to undo, nothing to write
        await db.savePreferences(next);
        void track('engine_rotation_undone', { exerciseId: anchorExerciseId });
        try {
          const fresh = await model.generateProgram(state.profile);
          const program = healWeekCompletion(fresh, await db.loadHistory(), state.weekOpenMs, Date.now()) ?? fresh;
          await db.saveProgram(program);
          dispatch({ type: 'PROGRAM_UPDATED', program, recents: state.recents });
        } catch {
          /* offline — the preference is saved; it applies at the next regeneration */
        }
      },

      async reorderExercise(dayId, fromIndex, toIndex) {
        if (!state.program) return;
        const day = state.program.days.find((d) => d.id === dayId);
        if (!day) return;
        const slots = move(day.slots, fromIndex, toIndex);
        const days = state.program.days.map((d) => (d.id === dayId ? { ...d, slots } : d));
        const program: Program = { ...state.program, days };
        await db.saveProgram(program);
        dispatch({ type: 'PROGRAM_UPDATED', program, recents: state.recents });
        // Athlete-owned order (Athlete > Model): persist the workout's exercise sequence so future
        // weekly regenerations preserve it. Exercise ids are the durable keys composition consumes.
        void track('exercise_reordered', { dayId });
        model
          .setOrder({ scope: 'exercise', order: slots.map((s) => s.exerciseId), workoutKey: day.key })
          .catch((e) => void track('preference_sync_failed', { kind: e instanceof HttpError ? e.kind : 'unknown', scope: 'exercise' }));
      },

      async reorderWorkouts(fromIndex, toIndex) {
        if (!state.program) return;
        const days = move(state.program.days, fromIndex, toIndex);
        const program: Program = { ...state.program, days };
        await db.saveProgram(program);
        dispatch({ type: 'PROGRAM_UPDATED', program, recents: state.recents });
        // Athlete-owned workout order (Athlete > Model): persist the sequence by workout key so
        // future weekly plans preserve it. Days without a key (legacy) persist nothing.
        void track('workout_reordered', {});
        const order = days.map((d) => d.key).filter((k): k is string => !!k);
        if (order.length > 0) {
          model
            .setOrder({ scope: 'workout', order })
            .catch((e) => void track('preference_sync_failed', { kind: e instanceof HttpError ? e.kind : 'unknown', scope: 'workout' }));
        }
      },

      async markWorkoutCompleted(programDayId) {
        if (!state.program) return;
        const days = state.program.days.map((d) =>
          d.id === programDayId ? { ...d, completed: true } : d,
        );
        if (days.every((d, i) => d.completed === state.program!.days[i].completed)) return; // no change
        const program: Program = { ...state.program, days };
        await db.saveProgram(program);
        dispatch({ type: 'PROGRAM_UPDATED', program, recents: state.recents });
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
        await clearToken(); // sign out of the issued invite
        resetModelSelection();
        modelRef.current = await selectModel();
        // The device goes back to a stranger. Nothing about the last athlete may survive into the
        // next one's onboarding: not their gender (the app would address the next person in her
        // person, in Hebrew, all the way to the step where they finally get to say who they are),
        // and certainly not their NAME, which is still sitting in the pending ref.
        resetGender();
        pendingNameRef.current = null;
        dispatch({ type: 'RESET' });
      },

      async deleteAccount() {
        void track('account_deleted');
        await flushTelemetry(); // ship telemetry while the token is still VALID (erase invalidates it)
        // Erase (anonymize) server-side FIRST, while the token is present (OD-2). Best-effort: a
        // transient/offline failure must not strand the athlete on a half-deleted device, so we
        // still wipe locally and telemeter the failure (the operator can complete erasure
        // out-of-band). In the normal online case this genuinely deletes the athlete server-side.
        try {
          await model.eraseAccount();
        } catch (e) {
          void track('account_erase_failed', { kind: e instanceof HttpError ? e.kind : 'unknown' });
        }
        await notifier.cancelAll();
        await db.clearAll();
        await clearToken();
        resetModelSelection();
        modelRef.current = await selectModel();
        // The device goes back to a stranger. Nothing about the last athlete may survive into the
        // next one's onboarding: not their gender (the app would address the next person in her
        // person, in Hebrew, all the way to the step where they finally get to say who they are),
        // and certainly not their NAME, which is still sitting in the pending ref.
        resetGender();
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
