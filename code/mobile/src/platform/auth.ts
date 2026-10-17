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
 * ⛔ GOOGLE IS WIRED TOO (2026-09-16), AND ANDROID IS WHY. The note here used to say Google was a
 * local stub because *"a second identity provider is not what any current feature is blocked on"* —
 * true while the product shipped on one platform. It stops being true the moment Android does: there
 * is no Sign in with Apple there, so the stub WAS the whole front door, and an Android athlete would
 * have had a session no server could verify, no restore onto a second phone, and no circle.
 *
 * The shape is Apple's exactly: an optional native module probed at run time
 * (`@react-native-google-signin/google-signin`), the real sheet where the binary carries it, and the
 * local stub everywhere else — jest, web, Expo Go, and any build made before the OAuth clients
 * exist. What comes back is an ID TOKEN (a JWT signed by Google), the stable `sub`, the name and the
 * email; `server/hush-identity` verifies it against Google's own JWKS at `/auth/google`.
 *
 * ⚠️ IT NEEDS THREE OAUTH CLIENT IDS AND THEY ARE NOT SECRETS — an iOS client, an Android client
 * (keyed to the signing certificate's SHA-1) and a Web client, whose id is the `audience` both the
 * phone and the worker check. They are read from the build's environment
 * (`EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`); with none configured this file returns the stub it always did,
 * which is what keeps an un-configured build behaving exactly as today rather than failing closed at
 * the door. See `NATIVE_SURFACES.md` for the ops steps.
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

/**
 * The Google clients, from the build's own environment. Public by design — an OAuth client id ships
 * inside every binary that uses it; the SECRET half never leaves Google's console and is not used by
 * a mobile client at all (the flow is PKCE, not a client-secret exchange).
 */
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';

/** Is this build configured to run the real Google sheet? (The web client id is the audience.) */
export function googleIsConfigured(): boolean {
  return GOOGLE_WEB_CLIENT_ID.length > 0;
}

type AppleAuth = typeof import('expo-apple-authentication');

/* The Google module, shaped only where this file touches it — the package is optional at BUILD
   time as well as at run time, so it is required dynamically and never imported for its types. */
interface GoogleSignInModule {
  GoogleSignin: {
    configure(o: { webClientId: string; iosClientId?: string; offlineAccess?: boolean; scopes?: string[] }): void;
    hasPlayServices(o?: { showPlayServicesUpdateDialog?: boolean }): Promise<boolean>;
    signIn(): Promise<unknown>;
  };
  statusCodes: { SIGN_IN_CANCELLED?: string; IN_PROGRESS?: string; PLAY_SERVICES_NOT_AVAILABLE?: string };
}

let google: GoogleSignInModule | null | undefined; // undefined = not probed yet

function loadGoogle(): GoogleSignInModule | null {
  if (google !== undefined) return google;
  google = null;
  if (!googleIsConfigured()) return google; // an unconfigured build keeps the stub, by construction
  try {
    const mod = require('@react-native-google-signin/google-signin') as GoogleSignInModule;
    if (typeof mod?.GoogleSignin?.signIn === 'function') {
      mod.GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        ...(GOOGLE_IOS_CLIENT_ID ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : {}),
        /* No offline access: the phone needs an ID token, not a refresh token. A server-side
           refresh token is a credential we would then have to store, rotate and be breached of. */
        offlineAccess: false,
      });
      google = mod;
    }
  } catch {
    google = null;
  }
  return google;
}

/**
 * What the sheet hands back, across the library's two response shapes. v13+ answers
 * `{ type: 'success', data: { idToken, user } }`; older builds answer the flat `{ idToken, user }`.
 * Reading both is three lines and removes a whole class of upgrade break.
 */
function readGoogleUser(raw: unknown): { idToken: string | null; sub: string | null; name: string | null; email: string | null } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const inner = (r.type === 'success' && r.data ? r.data : r) as Record<string, unknown>;
  const user = (inner.user ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
  return {
    idToken: str(inner.idToken),
    sub: str(user.id),
    name: str(user.name),
    email: str(user.email),
  };
}

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
  if (provider === 'google') {
    const native = loadGoogle();
    if (native) {
      try {
        /* Android only: the sheet cannot open without Play Services, and the dialog that says so is
           Google's own. On iOS this resolves true and costs nothing. */
        await native.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        const read = readGoogleUser(await native.GoogleSignin.signIn());
        return {
          provider,
          identityToken: read.idToken,
          userId: read.sub,
          name: read.name,
          email: read.email,
        };
      } catch (e) {
        const code = String((e as { code?: string | number } | null)?.code ?? '');
        /* Her own decision, on both platforms' spellings — the screen stays put and says nothing. */
        if (code === (native.statusCodes?.SIGN_IN_CANCELLED ?? '__none__') || code === '-5' || /cancel/i.test(code)) {
          throw new SignInCanceledError();
        }
        /* Anything else degrades to the stub rather than stranding her at the door — the same
           local-first rule Apple's branch keeps: the session is local, the token is an upgrade. */
        void track('auth_google_failed', { code });
      }
    }
  }
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
