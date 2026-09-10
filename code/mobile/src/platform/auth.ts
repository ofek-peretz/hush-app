/**
 * Auth — the product front door (HUSH_BUILD_SPEC §4.1). Apple / Google sign-in.
 *
 * NATIVE STATUS: **Sign in with Apple is WIRED (2026-08-24)** via `expo-apple-authentication`,
 * behind the same degrade-cleanly probe every native seam keeps (`requireOptionalNativeModule` —
 * the billing seam's exact shape): a binary that carries the module runs the real Apple sheet;
 * jest, web, Expo Go and every build older than today keep the local stub, and the whole flow
 * (Authentication → Consent → onboarding) still runs. The config plugin declares the
 * `com.apple.developer.applesignin` entitlement; EAS syncs that capability onto the App ID by
 * itself (it is a plain toggle — not an account-level OBJECT like the App Group, which is why
 * this one needs no founder portal step).
 *
 * WHAT THE REAL SHEET YIELDS: the identity TOKEN (a JWT signed by Apple — the credential the
 * identity worker verifies server-side, `server/hush-identity/src/index.ts`), the stable per-team `user` id, and
 * — on the FIRST authorization only — her full name and email. The name feeds the same
 * `appStore.setPendingName` path the NameEntry screen owns; a later sign-in yields nulls there,
 * by Apple's design, and the profile keeps what it has.
 *
 * GOOGLE stays a local stub: it needs its own SDK, a client id, and a server exchange — none of
 * which exists yet — and a second identity provider is not what any current feature is blocked
 * on. The button keeps working through the stub, exactly as the whole door did until today.
 */

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

/** Raised when the athlete cancels a provider sheet — the screen should stay put. */
export class SignInCanceledError extends Error {
  constructor() {
    super('sign_in_canceled');
    this.name = 'SignInCanceledError';
  }
}

type AppleAuth = typeof import('expo-apple-authentication');

let apple: AppleAuth | null | undefined; // undefined = not probed yet

function loadApple(): AppleAuth | null {
  if (apple !== undefined) return apple;
  apple = null;
  try {
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule?: (name: string) => unknown;
    };
    if (core.requireOptionalNativeModule?.('ExpoAppleAuthentication') != null) {
      apple = require('expo-apple-authentication') as AppleAuth;
    }
  } catch {
    apple = null;
  }
  return apple;
}

/** Compose Apple's structured name into one display name, or null when Apple sent none. */
function fullNameOf(n: { givenName?: string | null; familyName?: string | null } | null | undefined): string | null {
  const parts = [n?.givenName, n?.familyName].filter((x): x is string => !!x);
  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * Begin sign-in with the chosen provider. Real Apple sheet when the binary carries it; the local
 * stub everywhere else (see the header). Throws `SignInCanceledError` when she dismisses the
 * sheet — the screen stays put, exactly as its catch expects.
 */
export async function signInWith(provider: AuthProvider): Promise<AuthResult> {
  void track('auth_sign_in', { provider });
  if (provider === 'apple') {
    const native = loadApple();
    if (native) {
      try {
        const credential = await native.signInAsync({
          requestedScopes: [
            native.AppleAuthenticationScope.FULL_NAME,
            native.AppleAuthenticationScope.EMAIL,
          ],
        });
        return {
          provider,
          identityToken: credential.identityToken ?? null,
          userId: credential.user ?? null,
          name: fullNameOf(credential.fullName),
          email: credential.email ?? null,
        };
      } catch (e) {
        const code = (e as { code?: string } | null)?.code ?? '';
        if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') throw new SignInCanceledError();
        // Any other native failure degrades to the stub result rather than stranding her at the
        // front door — the session is local-first; the token is an upgrade, never a gate.
        void track('auth_apple_failed', { code });
      }
    }
  }
  return { provider, identityToken: null, userId: null, name: null, email: null };
}
