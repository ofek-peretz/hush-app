/**
 * ════ THE CIRCLE'S WIRE — the one client of `server/hush-identity/src/index.ts` (2026-08-24) ════
 *
 * The same build discipline as the coach client (`aBuildWithoutACoachSaysSo`): the URL arrives at
 * build time via `EXPO_PUBLIC_CIRCLE_URL`, and an ABSENT url means the circle does not exist in
 * this build — every call answers null/false, Together draws its pre-circle self, and nothing
 * throws. No URL, no wire, no surprise.
 *
 * THE SESSION. At sign-in the app holds a fresh Apple identity token for a few minutes; `exchange`
 * trades it (fire-and-forget, never blocking the front door) for the worker's own session token,
 * which lives in the Keychain and renews server-side on use. A 401 anywhere clears it — she is
 * simply signed out of the circle until her next sign-in, never stuck.
 *
 * WHAT LEAVES THE PHONE is `domain/circle`'s allow-list and nothing else — this file sends the
 * payload it is handed and adds no field of its own.
 */

//

import * as SecureStore from 'expo-secure-store';
import { track } from '@/platform/telemetry';
import type { CircleState, CircleWeekPayload } from '@/domain/circle';

const CIRCLE_URL = process.env.EXPO_PUBLIC_CIRCLE_URL || '';
const TOKEN_KEY = 'hush.circle.session';

/** Is the circle part of THIS build at all? (No URL → Together stays pre-circle, by design.) */
export function circleAvailable(): boolean {
  return CIRCLE_URL.length > 0;
}

/**
 * The identity worker's base URL, for the ONE other surface that speaks to it: the live PAIR
 * (`platform/sharedClient`).
 *
 * Same worker, same session, same build-time variable — so a build with a circle has a pair, and a
 * build without one has neither. That is not a shortcut; it is the honest shape. The pair's room
 * lives inside `hush-identity` precisely because it needs the Apple-verified identity this file
 * already holds, and giving the same worker a second env var would let a build be configured into
 * a state where half of it can reach the server.
 */
export function identityBaseUrl(): string {
  return CIRCLE_URL;
}

/**
 * The one authenticated door onto the identity worker — shared with the pair rather than copied.
 *
 * A lapsed session must sign out of BOTH surfaces at once, and it does, because there is one 401
 * rule in one function. Two copies of this would eventually be one copy that clears the token and
 * one that does not.
 */
export async function identityCall<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<T | null> {
  return call<T>(path, init);
}

async function storedToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * The session token, read-only, for the ONE other caller that authenticates with it: the coach
 * client. The coach worker reads the same `session:` keys this worker writes, which is what turns
 * its shared-token speed bump into authentication — see finding 1 of the 2026-09-01 audit. Reading
 * here keeps the Keychain key name private to this file; the 401-clears-it rule stays here too,
 * because the coach's 401 means a stale COACH token or an unflipped flag, never a dead session.
 */
export async function identitySessionToken(): Promise<string | null> {
  return storedToken();
}

async function call<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<T | null> {
  if (!circleAvailable()) return null;
  const token = await storedToken();
  if (!token) return null;
  try {
    const res = await fetch(`${CIRCLE_URL}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    if (res.status === 401) {
      // The session lapsed — clear it and fall quiet; her next sign-in reopens the door.
      await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
      return null;
    }
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // offline is a normal day, not an error state
  }
}

/** Trade a fresh Apple identity token for the worker's session. Fire-and-forget at sign-in —
 *  the front door never waits on a network. */
export async function circleExchange(identityToken: string | null): Promise<boolean> {
  if (!circleAvailable() || !identityToken) return false;
  try {
    const res = await fetch(`${CIRCLE_URL}/auth/apple`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identityToken }),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { token?: string };
    if (!body.token) return false;
    await SecureStore.setItemAsync(TOKEN_KEY, body.token);
    void track('circle_session_opened');
    return true;
  } catch {
    return false;
  }
}

/** Does a circle session exist on this phone? (Gates the Together section, never a screen.) */
export async function circleSignedIn(): Promise<boolean> {
  return circleAvailable() && (await storedToken()) != null;
}

/** Erase the circle session — called from `resetAccount`: the session is IDENTITY, and a device
 *  going back to a stranger keeps nobody's circle (`everyStorageKeyIsAccountedFor` verifies the
 *  call site). The circle membership itself lives server-side and survives her next sign-in. */
export async function circleSignOut(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
}

/**
 * ════ DELETE, SERVER FIRST (2026-09-01, audit finding 4) ════
 *
 * Asks the worker to erase everything it holds about this account — user record, week
 * publications, circle membership, this session — and only then clears the local token. Called
 * from `deleteAccount` BEFORE the device wipe, because the wipe erases the very token this call
 * authenticates with; ordering is the whole design. Returns whether the server confirmed, so the
 * caller can journal a failed erase (`account_erase_failed`) instead of silently stranding her
 * data on Cloudflare — but it never blocks the local wipe: her right to clear the device she is
 * holding does not depend on the network.
 */
export async function deleteIdentity(): Promise<boolean> {
  const ok = (await call<{ ok: boolean }>('/account/delete', { method: 'POST' }))?.ok === true;
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  return ok;
}

export async function circleCreate(): Promise<string | null> {
  const res = await call<{ code: string }>('/circle/create', { method: 'POST' });
  return res?.code ?? null;
}

export async function circleJoin(code: string): Promise<boolean> {
  const res = await call<{ code: string }>('/circle/join', { method: 'POST', body: { code } });
  return res != null;
}

export async function circleLeave(): Promise<void> {
  await call('/circle/leave', { method: 'POST' });
}

export async function circlePublishWeek(payload: CircleWeekPayload): Promise<void> {
  await call('/circle/week', { method: 'POST', body: payload });
}

export async function circleFetch(): Promise<CircleState | null> {
  const res = await call<{ circle: CircleState | null }>('/circle', { method: 'GET' });
  return res?.circle ?? null;
}
