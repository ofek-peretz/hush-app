/**
 * Auth — the product front door (HUSH_BUILD_SPEC §4.1). Apple Sign-In (native) or
 * Google Sign-In; the invite-token enrollment model is removed.
 *
 * Apple Sign-In is wired natively (`expo-apple-authentication`) so the athlete's
 * NAME is captured at registration with zero extra friction — Apple returns the
 * full name on the FIRST authorization, which we persist to the profile.
 *
 * The backend has no identity-token exchange yet, so we deliberately do NOT forward
 * Apple's identityToken to the session (`identityToken: null`) — the app keeps its
 * current session behavior, only gaining the name. When a backend exchange lands,
 * return the real token here and `appStore.signIn` will establish the server session.
 *
 * Google remains a local stub until its OAuth client is configured.
 *
 * SAFETY: Apple Sign-In must NEVER hard-block login. Anything other than an explicit
 * user cancel falls back to a tokenless local sign-in so the flow always proceeds.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import { track } from '@/platform/telemetry';

export type AuthProvider = 'apple' | 'google';

export interface AuthResult {
  provider: AuthProvider;
  /** Provider identity token for backend session exchange. Null until the backend
   *  exposes an exchange endpoint (see file header). */
  identityToken: string | null;
  /** Stable per-provider user id, when available. */
  userId: string | null;
  /** Full name (Apple only returns this on first authorization). */
  name: string | null;
  email: string | null;
}

/** Raised when the athlete cancels the Apple sheet — the screen should stay put. */
export class SignInCanceledError extends Error {
  constructor() {
    super('sign_in_canceled');
    this.name = 'SignInCanceledError';
  }
}

const STUB = (provider: AuthProvider): AuthResult => ({
  provider,
  identityToken: null,
  userId: null,
  name: null,
  email: null,
});

/**
 * Begin sign-in with the chosen provider. Resolves on success; rejects only if the
 * athlete cancels (so the Authentication screen stays put). Any provider/setup
 * failure falls back to a tokenless local result so login is never blocked.
 */
export async function signInWith(provider: AuthProvider): Promise<AuthResult> {
  void track('auth_sign_in', { provider });
  if (provider === 'apple') return signInWithApple();
  // Google: local stub until its OAuth client is configured.
  return STUB('google');
}

async function signInWithApple(): Promise<AuthResult> {
  // Not available (older OS / simulator / missing capability) → proceed locally.
  let available = false;
  try {
    available = await AppleAuthentication.isAvailableAsync();
  } catch {
    available = false;
  }
  if (!available) return STUB('apple');

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    const name = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();
    return {
      provider: 'apple',
      identityToken: null, // deliberate — no backend exchange yet (see header)
      userId: credential.user ?? null,
      name: name.length > 0 ? name : null,
      email: credential.email ?? null,
    };
  } catch (e) {
    // Explicit cancel → keep the athlete on the sign-in screen.
    if (e && typeof e === 'object' && (e as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
      throw new SignInCanceledError();
    }
    // Any other failure (setup/capability/network) → don't block login.
    void track('auth_apple_fallback', {});
    return STUB('apple');
  }
}
