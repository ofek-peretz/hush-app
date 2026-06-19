/**
 * Backend connection config + the auth token store.
 *
 * SECURITY (alpha hardening): the bearer token is the device's authenticated
 * identity and is stored in the OS secure enclave (Keychain / Keystore) via
 * expo-secure-store — NOT in AsyncStorage (which is plaintext on disk). The
 * token is minted out-of-band at operator enrollment (backend §2).
 *
 * Until enrollment, `getToken()` returns null and the app stays on the local
 * fixture model (see selectModel()).
 */
import * as SecureStore from 'expo-secure-store';

// SecureStore keys must be alphanumeric/._- (no namespacey dots beyond allowed).
const TOKEN_KEY = 'hush_auth_token';

/** Base URL of the Hush API (e.g. https://api.hush.app). Empty => not configured. */
export function getBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_BASE_URL || '';
}

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null; // keychain unavailable → treat as unenrolled, never crash
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // already absent / keychain unavailable — nothing to do
  }
}

/**
 * INTERNAL/TEST builds only: adopt an operator-minted test-athlete token baked into
 * the build via `EXPO_PUBLIC_DEV_AUTH_TOKEN`, so a "connected" internal build talks
 * to the real backend with ZERO extra screens or typing — open the app and you're a
 * test athlete on the live model. Called once at boot, BEFORE selectModel().
 *
 * Safe + isolated by construction:
 *  - the var is set ONLY on the internal `preview-connected` EAS profile; production
 *    never carries it, so this is a no-op there and the app behaves exactly as before;
 *  - it NEVER overrides a token already present (Sign In / a prior adopt win);
 *  - a keychain failure is swallowed — worst case the app stays on the fixture.
 */
export async function adoptDevTokenIfPresent(): Promise<void> {
  const devToken = process.env.EXPO_PUBLIC_DEV_AUTH_TOKEN;
  if (!devToken) return;
  try {
    const existing = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!existing) await SecureStore.setItemAsync(TOKEN_KEY, devToken);
  } catch {
    // keychain unavailable → skip silently; falls back to the fixture, never crashes
  }
}
