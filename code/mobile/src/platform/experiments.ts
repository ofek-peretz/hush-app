/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * EXPERIMENTS — one coin per install, tossed once, remembered (2026-09-09, the formula report).
 *
 * The report's one product ruling it asked to reopen with data rather than argument: does the
 * account wall belong BEFORE the first workout (today) or AFTER it (Hevy, Strong)? That is not a
 * question two people can settle in a room. It is a question two arms of real athletes settle in
 * a month, once the analytics sink is armed — so this module exists to give every install exactly
 * one arm, stable for the life of the install, and to say which one on the wire.
 *
 * HOW THE ARM IS CHOSEN: a hash of the install id against the percentage remote config names for
 * the experiment. No server round trip decides it (a coin that waits on the network is a coin
 * that lands differently offline), and the toss is written to storage the first time so a config
 * change mid-flight never moves an athlete between arms. Remote config can still END an
 * experiment — `0` or `100` — and every install follows on its next boot, because a finished
 * experiment is a decision, and a decision is not an arm.
 *
 * ⚠️ DELIBERATELY OUTSIDE `db.K`: an account wipe should not re-toss the coin.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import AsyncStorage from '@react-native-async-storage/async-storage';
import { deviceContext } from '@/platform/deviceContext';
import { track } from '@/platform/telemetry';

export type ExperimentName = 'signInAfterFirstWorkout';

/** The percentage of installs on the NEW arm, per experiment. Remote config overrides these. */
const DEFAULT_PCT: Record<ExperimentName, number> = {
  /* 50/50 — the report's recommendation is the new arm; the founder's ruling is the old one. */
  signInAfterFirstWorkout: 50,
};

const pct: Record<ExperimentName, number> = { ...DEFAULT_PCT };

/** Remote-config apply (clamped 0..100; garbage restores the default). */
export function applyExperimentPct(name: ExperimentName, n: unknown): void {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    pct[name] = DEFAULT_PCT[name];
    return;
  }
  pct[name] = Math.max(0, Math.min(100, Math.round(n)));
}

const STORE_KEY = (name: ExperimentName) => `hush.experiment.${name}`;
const decided = new Map<ExperimentName, boolean>();

/** FNV-1a over the install id — cheap, stable, and spread evenly enough for a coin. */
function bucket(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}

/**
 * Is this install on the NEW arm of `name`? Resolves the same answer for the life of the install.
 * Never throws: a device with no readable id or no storage lands on the old arm (the shipped
 * behaviour), which is the honest fallback for a coin that cannot be tossed.
 */
export async function onNewArm(name: ExperimentName): Promise<boolean> {
  const cached = decided.get(name);
  if (cached != null) return cached;
  const p = pct[name];
  // A finished experiment is a decision — it ignores the remembered toss.
  if (p <= 0 || p >= 100) {
    const arm = p >= 100;
    decided.set(name, arm);
    return arm;
  }
  try {
    const stored = await AsyncStorage.getItem(STORE_KEY(name));
    if (stored === 'new' || stored === 'old') {
      const arm = stored === 'new';
      decided.set(name, arm);
      return arm;
    }
    const id = (await deviceContext()).device_id;
    if (!id) {
      decided.set(name, false);
      return false;
    }
    const arm = bucket(`${name}:${id}`) < p;
    await AsyncStorage.setItem(STORE_KEY(name), arm ? 'new' : 'old').catch(() => {});
    decided.set(name, arm);
    void track('experiment_arm', { name, arm: arm ? 'new' : 'old' });
    return arm;
  } catch {
    decided.set(name, false);
    return false;
  }
}

/** Test seam — forget every toss. */
export function __resetExperimentsForTest(): void {
  decided.clear();
  for (const k of Object.keys(DEFAULT_PCT) as ExperimentName[]) pct[k] = DEFAULT_PCT[k];
}
