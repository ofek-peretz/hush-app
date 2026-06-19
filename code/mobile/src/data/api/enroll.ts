/**
 * Self-enrollment (zero-friction onboarding). After the athlete completes onboarding,
 * the app creates its backend athlete from the collected stats and adopts the minted
 * token — so the REAL model drives the program from the first workout, with no extra
 * screen, no operator step, no token baking. Every tester just downloads, onboards,
 * and trains.
 *
 * Best-effort by design: no backend configured / offline / gate rejection → returns
 * false and the app stays on the local fixture (still fully usable). Never throws.
 *
 * Wire: `POST {EXPO_PUBLIC_API_BASE_URL}/enroll` → { athlete_id, token }. When the
 * backend sets HUSH_ENROLL_KEY (closed alpha), the matching `x-enroll-key` is sent from
 * EXPO_PUBLIC_ENROLL_KEY (baked per build, like the base URL).
 */
import { getBaseUrl, getToken, setToken } from './config';
import { newEventId } from '@/platform/deviceContext';
import { track } from '@/platform/telemetry';

export interface EnrollStats {
  sex?: 'male' | 'female';
  age?: number;
  experience?: string;
  bodyweightKg?: number | null;
}

const ENROLL_TIMEOUT_MS = 12000;

/** Create the backend athlete + adopt its token. Returns true iff a token was newly
 *  stored (the model now talks to the backend); false leaves the app on the fixture. */
export async function selfEnroll(stats: EnrollStats): Promise<boolean> {
  const base = getBaseUrl();
  if (!base) return false; // no backend configured (dev) → fixture
  if (await getToken()) return false; // already enrolled — never double-enroll
  if (!stats.sex || !stats.experience) return false; // need the seed inputs

  const enrollKey = process.env.EXPO_PUBLIC_ENROLL_KEY;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENROLL_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/enroll`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(enrollKey ? { 'x-enroll-key': enrollKey } : {}),
      },
      body: JSON.stringify({
        athlete_id: `app_${newEventId()}`,
        sex: stats.sex,
        age: stats.age ?? 0,
        experience: stats.experience,
        bodyweight_kg: stats.bodyweightKg ?? null,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      void track('self_enroll_failed', { status: res.status });
      return false;
    }
    const data = (await res.json()) as { token?: string };
    if (!data.token) return false;
    await setToken(data.token);
    void track('self_enroll_ok', {});
    return true;
  } catch {
    void track('self_enroll_failed', { kind: 'network' });
    return false;
  } finally {
    clearTimeout(timer);
  }
}
