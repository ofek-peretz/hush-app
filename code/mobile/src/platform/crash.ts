/**
 * Crash reporting — Sentry, behind the same degrade-cleanly seam every native
 * integration uses (2026-08-24). Until now the only record of a crash in the
 * field was `installCrashHandler` → telemetry, and telemetry posts nowhere; we
 * were blind. Sentry is the production layer the telemetry header always named.
 *
 * The DSN arrives at build time via `EXPO_PUBLIC_SENTRY_DSN` (eas.json env /
 * .env). NO DSN → this module does nothing at all: no init, no native calls, no
 * jest/web breakage. That keeps local dev and CI silent by construction rather
 * than by configuration.
 *
 * Privacy, same stance as telemetry: no athlete identity attaches to a report —
 * `sendDefaultPii: false`, no user scope is ever set, and performance tracing is
 * off (crashes are the product need; traces are surveillance we don't want).
 *
 * BUILD NOTE (2026-08-24): the Sentry Expo plugin adds an Xcode phase that uploads source maps
 * and HARD-FAILS without an org/auth token — so EAS carries `SENTRY_DISABLE_AUTO_UPLOAD=true`
 * until the Sentry account exists. When it does: set SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN
 * in EAS env, flip the disable flag off, and stack traces become symbolicated.
 */

//

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

/** Initialize crash reporting. Call once, as early in the app's life as possible.
 *  A missing DSN or a failed native init is a clean no-op — never load-bearing. */
export function installCrashReporting(): void {
  if (!DSN) return;
  try {
    // Lazy require so environments without the native module (jest, web) and
    // builds without a DSN never touch the SDK at all.
    const Sentry = require('@sentry/react-native') as typeof import('@sentry/react-native');
    Sentry.init({
      dsn: DSN,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      enableAutoSessionTracking: true,
    });
  } catch {
    /* crash reporting is never allowed to be the thing that crashes */
  }
}
