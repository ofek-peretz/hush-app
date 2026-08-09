/**
 * Auth — the product front door (HUSH_BUILD_SPEC §4.1). Apple / Google sign-in.
 *
 * NATIVE STATUS: native Sign in with Apple is deferred (it requires the
 * `com.apple.developer.applesignin` entitlement + the "Sign in with Apple"
 * capability on the App ID, which isn't enabled yet). Until then this is a local
 * stub: it establishes a session without a server identity token so the whole flow
 * (Authentication → Consent → NameEntry → onboarding) runs. The athlete's NAME is
 * collected on the NameEntry screen (see appStore.setPendingName); when native Apple
 * Sign In is enabled, return its first-auth full name here as `name`.
 */
// @ts-nocheck

// 

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

/** Raised when the athlete cancels a provider sheet — the screen should stay put.
 *  (Retained for the Authentication screen's catch; the stub never throws it.) */
export class SignInCanceledError extends Error {
  constructor() {
    super('sign_in_canceled');
    this.name = 'SignInCanceledError';
  }
}

/**
 * Begin sign-in with the chosen provider. Stub behavior (native pending): resolves
 * immediately with a tokenless, name-less result so the rest of the flow runs.
 */
export async function signInWith(provider: AuthProvider): Promise<AuthResult> {
  void track('auth_sign_in', { provider });
  return { provider, identityToken: null, userId: null, name: null, email: null };
}
