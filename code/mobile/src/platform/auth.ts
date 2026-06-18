/**
 * Auth — the product front door (HUSH_BUILD_SPEC §4.1). Apple Sign-In or Google
 * Sign-In; the invite-token enrollment model is removed.
 *
 * NATIVE STATUS: real Sign in with Apple (`expo-apple-authentication` /
 * AuthenticationServices) and Google OAuth require native modules + an Apple
 * Developer account (currently pending) and a dev-client rebuild. This module is
 * the seam: it returns a normalized {@link AuthResult} so the app flow
 * (Authentication screen → Consent → onboarding) is fully built and testable
 * today. The stub establishes a local session without a server identity token;
 * when the native providers land, swap `signInWith` to call them and return their
 * identityToken (which `appStore.signIn` forwards to the backend session).
 */
import { track } from '@/platform/telemetry';

export type AuthProvider = 'apple' | 'google';

export interface AuthResult {
  provider: AuthProvider;
  /** Provider identity token for backend session exchange. Null in the stub. */
  identityToken: string | null;
  /** Stable per-provider user id, when available. */
  userId: string | null;
  /** Full name (Apple only returns this on first authorization). */
  name: string | null;
  email: string | null;
}

/**
 * Begin sign-in with the chosen provider. Resolves on success; rejects if the
 * athlete cancels or the provider errors (the Authentication screen surfaces the
 * single sanctioned error line and stays put).
 *
 * Stub behavior (native pending): resolves immediately with a tokenless result so
 * the rest of the flow runs. No PII is fabricated.
 */
export async function signInWith(provider: AuthProvider): Promise<AuthResult> {
  void track('auth_sign_in', { provider });
  return {
    provider,
    identityToken: null,
    userId: null,
    name: null,
    email: null,
  };
}
