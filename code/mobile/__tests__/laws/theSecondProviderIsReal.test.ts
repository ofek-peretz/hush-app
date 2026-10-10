/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ GOOGLE IS A REAL PROVIDER, NOT A BUTTON — and Android is why.
 *
 * FOUNDER, 2026-09-16, asking about Facebook: *"אני בקרוב מאוד ארצה להתחיל ליישם את זה לגבי
 * אנדרואיד."* The honest answer to the question underneath it was that Google had never been wired
 * at all: `signInWith('google')` fell through to the local stub, so the button produced a session no
 * server could verify — and on Android, where there is no Sign in with Apple, that stub WAS the
 * entire front door.
 *
 * What this law holds, in the three places the wiring can rot:
 *   1. The client asks the REAL sheet when the build carries one, and degrades to the stub —
 *      never to a failure — when it does not, exactly as Apple's branch does.
 *   2. The token reaches the verifier for ITS OWN issuer. One provider's token handed to the other
 *      provider's endpoint is a silent 401, which reads to an athlete as "sign-in is broken".
 *   3. The worker refuses a Google token whose AUDIENCE is not ours. The server half of that is
 *      driven for real in `server/tests/identityGoogle.test.ts`; what is pinned here is that the
 *      check exists at all, because it is the one that cannot be observed from the app.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import * as fs from 'fs';
import * as path from 'path';

import { googleIsConfigured, signInWith, SignInCanceledError } from '@/platform/auth';

const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const worker = () => fs.readFileSync(path.join(ROOT, '..', '..', 'server', 'hush-identity', 'src', 'index.ts'), 'utf8');

describe('1 · the client', () => {
  it('this jest runtime has no native sheet, and the stub answers rather than throwing', async () => {
    /* The whole degrade-cleanly contract in one call: no module, no client ids, no throw — and a
       result whose `identityToken` is null, which is exactly what stops the exchange from running. */
    expect(googleIsConfigured()).toBe(false);
    const res = await signInWith('google');
    expect({ provider: res.provider, token: res.identityToken }).toEqual({ provider: 'google', token: null });
  });

  it('⛔ a cancelled sheet is HER decision — the screen stays put and says nothing', () => {
    /* Both platforms' spellings are handled at the call site; what this pins is that the error type
       the screen catches is the shared one, not a Google-specific class it does not know. */
    const src = read('src/platform/auth.ts');
    expect(src).toContain('throw new SignInCanceledError()');
    expect(new SignInCanceledError().name).toBe('SignInCanceledError');
  });

  it('⛔ the real sheet is asked for an ID TOKEN, and Play Services first', () => {
    const src = read('src/platform/auth.ts');
    expect(src).toContain('GoogleSignin.hasPlayServices');
    expect(src).toContain('GoogleSignin.signIn()');
    // Both response shapes the library has shipped — see `readGoogleUser`.
    expect(src).toContain("r.type === 'success'");
    /* ⚠️ NO REFRESH TOKEN. `offlineAccess` would hand us a credential we would then have to store,
       rotate, and one day be breached of; the phone needs an ID token and nothing else. */
    expect(src).toContain('offlineAccess: false');
  });

  it('⛔ the client ids come from the BUILD, never from a literal in the source', () => {
    const src = read('src/platform/auth.ts');
    expect(src).toContain('process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
    expect(src).toContain('process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID');
    expect(src).not.toMatch(/\d{6,}-[a-z0-9]+\.apps\.googleusercontent\.com/);
  });
});

describe('2 · the token goes to its own verifier', () => {
  it("⛔ the exchange is addressed by PROVIDER — Apple's door cannot verify Google's token", () => {
    const src = read('src/platform/circleClient.ts');
    expect(src).toContain("`${CIRCLE_URL}/auth/${provider === 'google' ? 'google' : 'apple'}`");
    // …and the caller passes the provider it actually signed in with, rather than defaulting.
    expect(read('src/state/stores/appStore.tsx')).toContain('circleExchange(result.identityToken, result.provider)');
  });
});

describe('3 · the worker', () => {
  it('⛔ verifies the AUDIENCE, and refuses when the deployment has no clients', () => {
    const src = worker();
    // Anybody's app can get a validly-signed Google token; `aud` is what says it was minted for US.
    expect(src).toContain('if (audiences.length === 0) return null;');
    expect(src).toContain('if (!payload.aud || !audiences.includes(payload.aud)) return null;');
    // Google's own keys, and both spellings of its issuer.
    expect(src).toContain('https://www.googleapis.com/oauth2/v3/certs');
    expect(src).toContain("const GOOGLE_ISS = ['accounts.google.com', 'https://accounts.google.com'];");
  });

  it('⛔ namespaces the Google id, so two providers can never collide on one athlete', () => {
    const src = worker();
    expect(src).toContain('const id = `google:${sub}`;');
    expect(src).toContain('await env.HUSH_KV.put(`session:${token}`, id, { expirationTtl: SESSION_TTL_S });');
  });
});
