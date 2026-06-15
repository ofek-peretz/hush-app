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
