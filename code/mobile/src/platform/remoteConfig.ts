/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * REMOTE CONFIG — the smallest honest answer to "every experiment costs a binary" (2026-09-01,
 * the audit's finding 03).
 *
 * One GET at boot, one cached JSON, one allow-list of tunables. Everything about it degrades to
 * exactly the app we ship today:
 *
 *   · NO URL → inert. Same discipline as the coach, the circle and the telemetry sink: a build
 *     that names no config server behaves as if this file does not exist.
 *   · OFFLINE → the cached copy applies (a tunable should not flap with the network), and with no
 *     cache the compiled defaults stand. The fetch can never block boot — it is fire-and-forget
 *     behind the same 5-second timeout the identity calls keep.
 *   · AN UNKNOWN KEY → dropped on the floor. The allow-list below is the whole of what a server
 *     may say to this app; config is a tuning channel, never a code channel.
 *
 * WHAT IS TUNABLE, AND WHY SO LITTLE: each entry is a number the founder has already had to pick
 * blind (the audit: "trial length is a constant in the binary; companies that run ten such
 * experiments a year double conversion; here you cannot run one"). Adding a key here is a
 * decision, with this header to answer to.
 *
 * The server half is `GET /config` on the identity worker (`server/hush-identity/src/index.ts`) — an operator
 * edits one KV entry (`wrangler kv key put config:app '{...}'`) and every boot from then on
 * carries it. No redeploy, no binary, no review cycle.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyTrialLimitOverride, applyTrialMaxDaysOverride } from '@/domain/entitlement';

/* Deliberately OUTSIDE db.K (like the install id): config is a fact about the BUILD's tuning, not
 * about the athlete, and an account wipe should not reset an experiment arm mid-flight. */
const CACHE_KEY = 'hush.config.cache';

const CONFIG_URL =
  process.env.EXPO_PUBLIC_CONFIG_URL ||
  (process.env.EXPO_PUBLIC_CIRCLE_URL ? `${process.env.EXPO_PUBLIC_CIRCLE_URL.replace(/\/$/, '')}/config` : '');

let configUrl = CONFIG_URL;

/** Test seam — point at a mock, or '' to silence. */
export function __setConfigUrlForTest(url: string): void {
  configUrl = url;
}

export interface RemoteConfig {
  /** Free completed sessions before the paywall. Clamped 1..60 at the apply site. */
  trialSessionLimit?: number;
  /** The trial's TIME cap in days (sessions OR days, first spent gates). Absent = disarmed —
   *  the founder-ratified sessions-only arc. Clamped 7..365 at the apply site. */
  trialMaxDays?: number;
}

/** The allow-list, applied. Unknown keys never get this far; bad types are ignored per-field. */
function apply(cfg: RemoteConfig): void {
  applyTrialLimitOverride(cfg.trialSessionLimit);
  applyTrialMaxDaysOverride(cfg.trialMaxDays);
}

/** Rebuild the config field-by-field from an untrusted body — the circle's own discipline. */
function sanitize(raw: unknown): RemoteConfig {
  const cfg: RemoteConfig = {};
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (typeof r.trialSessionLimit === 'number') cfg.trialSessionLimit = r.trialSessionLimit;
    if (typeof r.trialMaxDays === 'number') cfg.trialMaxDays = r.trialMaxDays;
  }
  return cfg;
}

/**
 * Boot entry: apply the cached word immediately, then refresh from the server for NEXT boot's
 * cache (and this boot too — a tunable is safe to move mid-session because every reader is a live
 * binding). Never throws; never blocks anything.
 */
export async function loadRemoteConfig(): Promise<void> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) apply(sanitize(JSON.parse(cached)));
  } catch {
    /* a corrupt cache is just no cache */
  }
  if (!configUrl) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    let res: Response;
    try {
      res = await fetch(configUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return;
    const cfg = sanitize(await res.json());
    apply(cfg);
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cfg));
  } catch {
    /* offline / bad server — the cache (or the defaults) already applied */
  }
}
