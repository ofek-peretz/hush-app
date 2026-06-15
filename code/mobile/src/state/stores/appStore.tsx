/**
 * App state — profile, program, and athlete-mode, persisted locally.
 * Routes the whole app (Root reads `mode` to decide which screens exist).
 */
import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Capability, ForecastRecord, Goal, PortraitSnapshot, Profile, Program, SetLog, Units } from '@/data/local/models';
import { db, SCHEMA_VERSION, type PersistedMode } from '@/data/local/db';
import { buildPortraitForecast, detectThreshold, type ThresholdEvent } from '@/domain/portrait';
import { resolveHold, resolvePortrait } from '@/domain/receiptRules';
import type { Line } from '@/domain/voice';
import {
  athleteModeReducer,
  didUnlockPortrait,
  initialAthleteModeState,
  CALIBRATION_SESSIONS,
  type AthleteModeState,
} from '@/state/machines/athleteMode';
import { fixtureModel } from '@/data/api/fixtureModel';
import { selectModel, resetModelSelection } from '@/data/api/selectModel';
import { setToken, clearToken } from '@/data/api/config';
import { setUnauthorizedHandler } from '@/data/api/authEvents';
import { HttpError } from '@/data/api/httpErrors';
import { track, flush as flushTelemetry } from '@/platform/telemetry';
import type { ModelClient } from '@/data/api/modelClient';
import { move } from '@/domain/reorder';
import { notifierStub as notifier } from '@/platform/notifications';

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
  pendingThreshold: ThresholdEvent | null; // coalesced; at most one outstanding (§7.10)
  forecasts: ForecastRecord[]; // the asymmetry engine (spec §8.4)
  pendingPortraitReceipt: { capability: Capability } | null; // set on a HIT; resurfaces Portrait in Compare
  recents: string[]; // exercise ids, most-recent first ("Your exercises")
  revoked: boolean; // the invite was revoked (401) — show the explanation on Enrollment
  weekRest: boolean; // Weekly Program Container: week complete → Home shows the existing Rest state
}

type Action =
  | { type: 'BOOTED'; profile: Profile | null; program: Program | null; mode: AthleteModeState; snapshots: PortraitSnapshot[]; forecasts: ForecastRecord[]; recents: string[] }
  | { type: 'PROGRAM_UPDATED'; program: Program; recents: string[] }
  | { type: 'ONBOARDED'; profile: Profile; program: Program; mode: AthleteModeState; snapshots: PortraitSnapshot[] }
  | { type: 'PROFILE_UPDATED'; profile: Profile }
  | { type: 'SESSION_COMPLETED'; mode: AthleteModeState; unlocked: boolean; snapshots: PortraitSnapshot[]; pendingThreshold: ThresholdEvent | null }
  | { type: 'CALIBRATION_SYNCED'; mode: AthleteModeState }
  | { type: 'FORECASTS'; forecasts: ForecastRecord[] }
  | { type: 'PORTRAIT_RESOLVED'; forecasts: ForecastRecord[]; snapshots: PortraitSnapshot[]; receipt: { capability: Capability } | null }
  | { type: 'CLEAR_PORTRAIT_FLAG' }
  | { type: 'CLEAR_THRESHOLD' }
  | { type: 'CLEAR_PORTRAIT_RECEIPT' }
  | { type: 'WEEK_REST'; weekRest: boolean }
  | { type: 'REVOKED' }
  | { type: 'RESET' };

const initial: AppState = {
  booted: false,
  profile: null,
  program: null,
  modeState: initialAthleteModeState,
  justUnlockedPortrait: false,
  snapshots: [],
  pendingThreshold: null,
  forecasts: [],
  pendingPortraitReceipt: null,
  recents: [],
  revoked: false,
  weekRest: false,
};

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'BOOTED':
      return { ...s, booted: true, profile: a.profile, program: a.program, modeState: a.mode, snapshots: a.snapshots, forecasts: a.forecasts, recents: a.recents };
    case 'PROGRAM_UPDATED':
      return { ...s, program: a.program, recents: a.recents };
    case 'ONBOARDED':
      return { ...s, profile: a.profile, program: a.program, modeState: a.mode, snapshots: a.snapshots, revoked: false };
    case 'PROFILE_UPDATED':
      return { ...s, profile: a.profile };
    case 'SESSION_COMPLETED':
      return { ...s, modeState: a.mode, justUnlockedPortrait: a.unlocked, snapshots: a.snapshots, pendingThreshold: a.pendingThreshold ?? s.pendingThreshold };
    case 'CALIBRATION_SYNCED':
      // Reconcile to backend truth WITHOUT firing the one-time unlock animation
      // (that is a live-session moment, not a boot/reconcile moment).
      return { ...s, modeState: a.mode };
    case 'FORECASTS':
      return { ...s, forecasts: a.forecasts };
    case 'PORTRAIT_RESOLVED':
      return { ...s, forecasts: a.forecasts, snapshots: a.snapshots, pendingPortraitReceipt: a.receipt ?? s.pendingPortraitReceipt };
    case 'CLEAR_PORTRAIT_FLAG':
      return { ...s, justUnlockedPortrait: false };
    case 'CLEAR_THRESHOLD':
      return { ...s, pendingThreshold: null };
    case 'CLEAR_PORTRAIT_RECEIPT':
      return { ...s, pendingPortraitReceipt: null };
    case 'WEEK_REST':
      return { ...s, weekRest: a.weekRest };
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

export interface OnboardingInputs {
  goal: Goal;
  daysPerWeek: number;
  units: Units;
  healthConnected: boolean;
  name?: string;
  sex?: 'male' | 'female';
  heightCm?: number;
  weightKg?: number;
  age?: number;
}

interface AppApi extends AppState {
  /** Operator-mediated enrollment: intake an issued invite token (no public
   *  registration / self-service / social login). Validates against the backend,
   *  then enters the athlete. Throws if the token is invalid/unreachable. */
  enrollWithToken: (token: string) => Promise<void>;
  completeOnboarding: (inputs: OnboardingInputs) => Promise<void>;
  recordSessionCompleted: () => Promise<{ unlockedPortrait: boolean }>;
  clearPortraitFlag: () => void;
  clearThreshold: () => void;
  /** Create the Portrait's eight-week gap-closing forecast (on unlock dismissal). */
  createPortraitForecast: () => Promise<void>;
  /** Persist a delivered hold forecast as a durable PENDING record (#9). Idempotent
   *  per capability: one outstanding hold per capability. */
  issueHoldForecast: (seed: {
    capability: Capability;
    predictedValue: number;
    predictedReps?: number;
    dueSessionOrDate: string;
  }) => Promise<void>;
  /** Resolve any PENDING hold forecast for `capability` against a just-logged set.
   *  Returns a receipt line ONLY on a HIT (the held weight was passed); otherwise
   *  null and the forecast stays PENDING (horizonless, silent — the asymmetry). */
  resolveHoldForecasts: (args: { capability: Capability; log: SetLog }) => Promise<Line | null>;
  clearPortraitReceipt: () => void;
  /** Re-resolve today's session (session-at-a-time). Called on Home focus so a
   *  completed session gives way to the next composed one. */
  refreshProgram: () => Promise<void>;
  /** Reconcile calibration/mode to the backend's completed-session count (source of truth). */
  syncCalibration: () => Promise<void>;
  /** Drain offline-completed sessions to the backend (reconcile on reconnect, §6.4). */
  syncPending: () => Promise<void>;
  /** Heal the Portrait if its unlock snapshot was missed (e.g. session 7 offline). */
  ensurePortraitSnapshot: () => Promise<void>;
  /** Switch units (kg/lb); restyles every weight display instantly (§10.1). */
  setUnits: (units: Units) => Promise<void>;
  /** Deliberate replacement: persist the chosen exercise as the slot's preference (R18). */
  replaceSlotExercise: (dayId: string, slotIndex: number, exerciseId: string) => Promise<void>;
  /** Athlete-owned exercise order within a workout (Athlete > Model). Durable + preserved across
   *  weekly regenerations. */
  reorderExercise: (dayId: string, fromIndex: number, toIndex: number) => Promise<void>;
  /** Athlete-owned workout order within the weekly plan (Athlete > Model). Durable + preserved. */
  reorderWorkouts: (fromIndex: number, toIndex: number) => Promise<void>;
  resetAccount: () => Promise<void>;
  /** __DEV__-only test harness: jump straight to the Portrait unlock state. */
  devUnlockPortrait: () => Promise<void>;
  /** __DEV__-only test harness: resolve the pending Portrait forecast hit/miss. */
  devResolvePortraitForecast: (success: boolean) => Promise<void>;
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

  // A 401 on an authenticated request = revoked invite (founder decision). Clear
  // the identity + ALL local state and return to Enrollment. Guarded so a 401
  // DURING enrollment validation (not yet enrolled) is just a bad invite, handled
  // inline by enrollWithToken — not a revocation.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!enrolledRef.current || revokingRef.current) return;
      revokingRef.current = true;
      (async () => {
        void track('invite_revoked');
        await flushTelemetry(); // ship before the wipe
        await db.clearAll();
        await clearToken();
        resetModelSelection();
        modelRef.current = await selectModel();
        dispatch({ type: 'REVOKED' });
      })();
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    (async () => {
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
      // never lost. Save what completed (annotated "ended early") + queue it for
      // sync, then clear the orphan so the next Start composes cleanly. An
      // interrupted session does NOT advance calibration (§2.3).
      const active = await db.loadActiveSession();
      if (active) {
        if (active.sets.length > 0) {
          // De-dupe: a prior crash may have saved-but-not-cleared; never double-count.
          const history = await db.loadHistory();
          if (!history.some((h) => h.id === active.id)) {
            const saved = { ...active, state: 'SAVED' as const, earlyFinish: true, annotation: 'ended_early' as const };
            await db.appendCompletedSession(saved);
            await db.enqueuePendingSync({
              sessionId: saved.id,
              programDayId: saved.programDayId,
              sets: saved.sets.map((s) => ({ exerciseId: s.exerciseId, setIndex: s.setIndex, actualWeight: s.actualWeight, actualReps: s.actualReps, blockId: s.blockId })),
              earlyFinish: true,
            });
            void track('session_recovered', { sessionId: saved.id, sets: saved.sets.length });
          }
        }
        await db.clearActiveSession();
      }

      const [profile, program, persistedMode, snapshots, forecasts, recents] = await Promise.all([
        db.loadProfile(),
        db.loadProgram(),
        db.loadMode(),
        db.loadSnapshots(),
        db.loadForecasts(),
        db.loadRecents(),
      ]);
      const mode: AthleteModeState = persistedMode
        ? { mode: persistedMode.mode, completedSessions: persistedMode.completedSessions, portrait: persistedMode.portrait }
        : initialAthleteModeState;
      dispatch({ type: 'BOOTED', profile, program, mode, snapshots, forecasts, recents });
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

      async enrollWithToken(token) {
        const trimmed = token.trim();
        if (!trimmed) throw new Error('empty_token');
        await setToken(trimmed);
        resetModelSelection();
        const client = await selectModel();
        modelRef.current = client;

        let backend;
        try {
          backend = await client.getProfile(); // 200 ⇒ valid, active athlete
        } catch (e) {
          // Invalid/unreachable invite — revert cleanly, surface the one error line.
          await clearToken();
          resetModelSelection();
          modelRef.current = await selectModel();
          throw new Error('enroll_failed');
        }

        // The backend owns composition/strategy; the athlete enters straight to
        // Home (no in-app Goal/Days/About — that data is server-side at enrollment).
        const program = await client.generateProgram({
          units: 'kg', goal: 'general_fitness', daysPerWeek: 0, healthConnected: false,
        });
        const profile: Profile = {
          sex: backend.sex,
          weightKg: backend.bodyweightKg ?? undefined,
          age: backend.age,
          units: 'kg', // client-side display preference; server has no units
          goal: 'general_fitness', // vestigial for the backend path (focus is server-owned)
          daysPerWeek: program.frequency || 0,
          healthConnected: false,
        };

        // Calibration mode from backend truth (a returning athlete past 7 sessions
        // lands in ADVISORY, not re-calibration). Defaults to calibrating offline.
        let completed = 0;
        try {
          completed = (await client.sessionsCompleted()) ?? 0;
        } catch {
          completed = 0;
        }
        const m = deriveCalibrationMode(completed);
        void track('enrolled', { sessionsCompleted: completed });
        // A fresh install enrolling onto an athlete with backend history = reinstall/device change.
        if (completed > 0) void track('reinstall_or_device_change', { sessionsCompleted: completed });

        const baseline = await tryPortraitSnapshot(client, completed);
        const snapshots = baseline ? await db.appendSnapshot(baseline) : await db.loadSnapshots();
        if (baseline) emitCapabilitySnapshot(baseline, 'enrollment', completed);

        await Promise.all([db.saveProfile(profile), db.saveProgram(program), persistMode(m)]);
        revokingRef.current = false; // re-armed for any future revocation
        dispatch({ type: 'ONBOARDED', profile, program, mode: m, snapshots });
        // Weekly plan ready → wire the existing Weekly Program Ready notification (20:00 local).
        void notifier.scheduleWeeklyProgramReady();
      },

      async completeOnboarding(inputs) {
        const profile: Profile = {
          name: inputs.name,
          sex: inputs.sex,
          heightCm: inputs.heightCm,
          weightKg: inputs.weightKg,
          age: inputs.age,
          units: inputs.units,
          goal: inputs.goal,
          daysPerWeek: inputs.daysPerWeek,
          healthConnected: inputs.healthConnected,
        };
        // Program generated BEFORE Home renders (spec flow §2.1).
        const program = await model.generateProgram(profile);

        let m = athleteModeReducer(initialAthleteModeState, { type: 'AUTH_SUCCESS' });
        m = athleteModeReducer(m, { type: 'ENTER_ONBOARDING' });
        m = athleteModeReducer(m, { type: 'PROGRAM_GENERATED' }); // -> CALIBRATING

        // A snapshot is stored at each program construction (§8.4) — this is the
        // week-one baseline used later by Compare. It is NOT surfaced now
        // (Portrait stays locked through calibration; clean absence §2.9).
        const baseline = await tryPortraitSnapshot(model, 0);
        const snapshots = baseline ? await db.appendSnapshot(baseline) : await db.loadSnapshots();
        if (baseline) emitCapabilitySnapshot(baseline, 'onboarding', 0);

        await Promise.all([db.saveProfile(profile), db.saveProgram(program), persistMode(m)]);
        dispatch({ type: 'ONBOARDED', profile, program, mode: m, snapshots });
        // Weekly Program Container: the weekly plan is ready — wire the EXISTING Weekly Program
        // Ready notification (20:00 local; no second flow). Stub is a no-op; native build delivers.
        void notifier.scheduleWeeklyProgramReady();
      },

      async recordSessionCompleted() {
        const prev = state.modeState;
        const next = athleteModeReducer(prev, { type: 'SESSION_COMPLETED' });
        const unlocked = didUnlockPortrait(prev, next);
        await persistMode(next);

        let snapshots = state.snapshots;
        let pendingThreshold: ThresholdEvent | null = null;
        if (unlocked) {
          // Portrait unlock is a program construction — capture the snapshot the
          // unlock screen reveals (§2.4, §8.4). Tolerates the B2 gap.
          const snap = await tryPortraitSnapshot(model, next.completedSessions);
          if (snap) {
            snapshots = await db.appendSnapshot(snap);
            emitCapabilitySnapshot(snap, 'unlock', next.completedSessions);
            // Detect a threshold crossing vs the prior snapshot (coalesced).
            if (snapshots.length >= 2 && !state.pendingThreshold) {
              pendingThreshold = detectThreshold(snapshots[snapshots.length - 2], snap);
              if (pendingThreshold) void track('threshold_crossed', { a: pendingThreshold.a, b: pendingThreshold.b, kind: pendingThreshold.kind });
            }
          }
        }
        dispatch({ type: 'SESSION_COMPLETED', mode: next, unlocked, snapshots, pendingThreshold });
        return { unlockedPortrait: unlocked };
      },

      clearPortraitFlag() {
        dispatch({ type: 'CLEAR_PORTRAIT_FLAG' });
      },

      clearThreshold() {
        dispatch({ type: 'CLEAR_THRESHOLD' });
      },

      // The commitment IS the forecast: on Portrait dismissal, stake an
      // eight-week gap-closing claim on the weakest ACTIONABLE capability
      // (spec §5.3 R9 — never on a low-confidence/still-learning capability).
      // If Hush cannot make an actionable claim, it makes none (conviction or
      // silence). Idempotent — never two outstanding Portrait forecasts.
      async createPortraitForecast() {
        const snap = state.snapshots[state.snapshots.length - 1];
        if (!snap) return;
        const alreadyPending = state.forecasts.some((f) => f.type === 'portrait' && f.state === 'PENDING');
        if (alreadyPending) return;
        const rec = buildPortraitForecast(snap, `pf_${Date.now()}`, new Date().toISOString());
        if (!rec) return; // no actionable commitment -> silence
        const forecasts = [...state.forecasts, rec];
        await db.saveForecasts(forecasts);
        void track('forecast_created', { forecastType: 'portrait', forecastId: rec.id, capability: rec.capability, predictedValue: rec.predictedValue });
        dispatch({ type: 'FORECASTS', forecasts });
      },

      // Hold Receipt loop (#9). A hold forecast ("Holding here — you'll pass it")
      // is staked when delivered and resolves on a LATER session, exactly like the
      // other forecast types — that is how the hold earns authority. These read the
      // DB as source of truth (not in-memory state) so a cross-session resolve is
      // immune to a stale closure. Idempotent: never two outstanding holds for one
      // capability.
      async issueHoldForecast(seed) {
        const all = await db.loadForecasts();
        const alreadyPending = all.some(
          (f) => f.type === 'hold' && f.capability === seed.capability && f.state === 'PENDING',
        );
        if (alreadyPending) return;
        const rec: ForecastRecord = {
          id: `hf_${seed.capability}_${Date.now()}`,
          type: 'hold',
          capability: seed.capability,
          predictedValue: seed.predictedValue,
          predictedReps: seed.predictedReps,
          dueSessionOrDate: seed.dueSessionOrDate,
          state: 'PENDING',
        };
        const forecasts = [...all, rec];
        await db.saveForecasts(forecasts);
        void track('forecast_created', { forecastType: 'hold', forecastId: rec.id, capability: rec.capability, predictedValue: rec.predictedValue });
        dispatch({ type: 'FORECASTS', forecasts });
      },

      async resolveHoldForecasts({ capability, log }) {
        const all = await db.loadForecasts();
        const hasPending = all.some(
          (f) => f.type === 'hold' && f.capability === capability && f.state === 'PENDING',
        );
        if (!hasPending) return null;
        let receipt: Line | null = null;
        let changed = false;
        const forecasts = all.map((f) => {
          if (!(f.type === 'hold' && f.capability === capability && f.state === 'PENDING')) return f;
          const res = resolveHold(f, log);
          if (res.state !== 'HIT') return f; // not passed → stays PENDING, silent (the asymmetry)
          changed = true;
          if (!receipt) receipt = res.receipt;
          void track('forecast_resolved', { forecastId: f.id, forecastType: 'hold', capability: f.capability, hit: true });
          return { ...f, state: 'HIT' as const };
        });
        if (changed) {
          await db.saveForecasts(forecasts);
          dispatch({ type: 'FORECASTS', forecasts });
        }
        return receipt;
      },

      clearPortraitReceipt() {
        dispatch({ type: 'CLEAR_PORTRAIT_RECEIPT' });
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
        dispatch({ type: 'PORTRAIT_RESOLVED', forecasts: state.forecasts, snapshots, receipt: null });
      },

      async refreshProgram() {
        if (!state.profile) return;
        try {
          const program = await model.generateProgram(state.profile);
          await db.saveProgram(program);
          dispatch({ type: 'PROGRAM_UPDATED', program, recents: state.recents });
        } catch {
          // Backend unreachable → keep the last-known session (degrade quietly, §5.3).
        }
        // Weekly Program Container: reflect week completion in the EXISTING Home Rest state
        // (no new screen). Best-effort; defaults to not-resting offline.
        try {
          const rest = await model.weeklyRest();
          if (rest !== state.weekRest) dispatch({ type: 'WEEK_REST', weekRest: rest });
        } catch {
          /* offline — keep the last-known rest state */
        }
      },

      async setUnits(units) {
        if (!state.profile || state.profile.units === units) return;
        const profile: Profile = { ...state.profile, units };
        await db.saveProfile(profile);
        dispatch({ type: 'PROFILE_UPDATED', profile });
      },

      async replaceSlotExercise(dayId, slotIndex, exerciseId) {
        if (!state.program) return;
        // The slot's exercise IS the persisted preference (R18, §7.2). The
        // capability class is unchanged (Replacement only ever offers in-class).
        const day = state.program.days.find((d) => d.id === dayId);
        const slot = day?.slots[slotIndex];
        const fromExercise = slot?.exerciseId;
        const capability = slot?.capability;
        const days = state.program.days.map((d) =>
          d.id !== dayId
            ? d
            : { ...d, slots: d.slots.map((sl, i) => (i === slotIndex ? { ...sl, exerciseId } : sl)) },
        );
        const program: Program = { ...state.program, days };
        const recents = await db.addRecent(exerciseId);
        await db.saveProgram(program);
        dispatch({ type: 'PROGRAM_UPDATED', program, recents });
        // Program Ownership Contract: the choice is athlete-OWNED — persist it to the durable,
        // append-only server preference log so it survives refetch/reinstall/device-change/
        // regeneration and the model honors it with priority. Best-effort (local edit already
        // applied); a transient failure is telemetered, never blocks the UI.
        if (capability && fromExercise && fromExercise !== exerciseId) {
          model
            .setExercisePreference({ capability, fromExercise, toExercise: exerciseId, reason: 'preference' })
            .catch((e) => void track('preference_sync_failed', { capability, kind: e instanceof HttpError ? e.kind : 'unknown' }));
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
          .setOrder({ scope: 'exercise', order: slots.map((s) => s.exerciseId) })
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
        const pendingThreshold =
          snapshots.length >= 2 ? detectThreshold(snapshots[snapshots.length - 2], snap) : null;
        await persistMode(next);
        dispatch({ type: 'SESSION_COMPLETED', mode: next, unlocked: true, snapshots, pendingThreshold });
      },

      // Test harness only — never reachable in release. Fabricates a post-due
      // snapshot to drive the forecast to a HIT or a MISS so the receipt loop
      // (and the silent-on-miss asymmetry) can be reviewed without waiting eight
      // weeks. Production resolves this at real program constructions.
      async devResolvePortraitForecast(success: boolean) {
        if (!__DEV__) return;
        const rec = state.forecasts.find((f) => f.type === 'portrait' && f.state === 'PENDING');
        const current = state.snapshots[state.snapshots.length - 1];
        if (!rec || !current) return;

        // Horizonless: a later snapshot where the gap is (or isn't) closed. A
        // non-close stays PENDING (silent) — same observable outcome as before.
        const future: PortraitSnapshot = {
          timestamp: new Date().toISOString(),
          perCapability: {
            ...current.perCapability,
            [rec.capability]: success ? rec.predictedValue + 0.05 : rec.predictedValue - 0.05,
          },
          confidence: { ...current.confidence },
          stillLearning: { ...current.stillLearning },
        };
        const snapshots = await db.appendSnapshot(future);
        const resolution = resolvePortrait(rec, future);
        const forecasts = state.forecasts.map((f) =>
          f.id === rec.id ? { ...f, state: resolution.state } : f,
        );
        await db.saveForecasts(forecasts);
        const receipt = resolution.state === 'HIT' ? { capability: rec.capability } : null;
        dispatch({ type: 'PORTRAIT_RESOLVED', forecasts, snapshots, receipt });
      },

      async resetAccount() {
        void track('signed_out');
        await flushTelemetry(); // ship before the wipe
        await db.clearAll();
        await clearToken(); // sign out of the issued invite
        resetModelSelection();
        modelRef.current = await selectModel();
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
