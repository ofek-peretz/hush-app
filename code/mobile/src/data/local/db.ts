/**
 * Local persistence — the offline source of truth (UX §6, spec §8.4).
 *
 * M1 uses AsyncStorage behind this repo interface; it can be swapped for
 * expo-sqlite later without touching callers. Per-set actuals are persisted at
 * each Complete Set (not at session end) so a killed app resumes from the last
 * persisted set (§7.4). Logged actuals are immutable (§9 law 17).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  AthleteMode,
  ForecastRecord,
  PortraitSnapshot,
  PortraitState,
  Profile,
  Program,
  Session,
  ThresholdEvent,
} from './models';
// Type-only import (erased at runtime → no layering cycle). The Health connection
// record is persisted local state, stored behind this repo like everything else.
import type { HealthState } from '@/platform/health/healthModel';

const K = {
  profile: 'hush.profile',
  program: 'hush.program',
  mode: 'hush.mode',
  activeSession: 'hush.session.active',
  history: 'hush.history.sessions',
  snapshots: 'hush.portrait.snapshots',
  forecasts: 'hush.forecasts',
  recents: 'hush.exercise.recents',
  pendingSync: 'hush.sync.pending',
  pendingThreshold: 'hush.portrait.threshold',
  telemetry: 'hush.telemetry.buffer',
  firsts: 'hush.telemetry.firsts',
  health: 'hush.health.state',
  schemaVersion: 'hush.schema.version',
} as const;

/** Bump when a persisted shape changes incompatibly; boot guards against drift.
 *  v2: added the Health connection record (hush.health.state) — additive. */
export const SCHEMA_VERSION = 2;

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

  loadMode: () => getJSON<PersistedMode>(K.mode),
  saveMode: (m: PersistedMode) => setJSON(K.mode, m),

  // ---- Active session (crash-safe resume; written at each Complete Set) ----
  loadActiveSession: () => getJSON<Session>(K.activeSession),
  saveActiveSession: (s: Session) => setJSON(K.activeSession, s),
  clearActiveSession: () => AsyncStorage.removeItem(K.activeSession),

  // ---- History (completed sessions, newest first; immutable once written) ----
  async loadHistory(): Promise<Session[]> {
    return (await getJSON<Session[]>(K.history)) ?? [];
  },
  async appendCompletedSession(s: Session): Promise<void> {
    const all = await this.loadHistory();
    all.unshift(s);
    await setJSON(K.history, all);
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

  // ---- Forecast records (the asymmetry engine; spec §8.4) ----
  async loadForecasts(): Promise<ForecastRecord[]> {
    return (await getJSON<ForecastRecord[]>(K.forecasts)) ?? [];
  },
  async saveForecasts(all: ForecastRecord[]): Promise<void> {
    await setJSON(K.forecasts, all);
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

  // ---- Pending threshold alert (durable; survives relaunch until surfaced §7.10) ----
  loadPendingThreshold: () => getJSON<ThresholdEvent>(K.pendingThreshold),
  savePendingThreshold: (ev: ThresholdEvent) => setJSON(K.pendingThreshold, ev),
  clearPendingThreshold: () => AsyncStorage.removeItem(K.pendingThreshold),

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
