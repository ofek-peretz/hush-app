/**
 * The coach track's wire (`platform/coachTrackClient`): the refusals are words, every call is
 * bounded, a malformed week is refused on arrival, and a week the server must refuse is never sent.
 */

import * as SecureStore from 'expo-secure-store';

process.env.EXPO_PUBLIC_CIRCLE_URL = 'https://identity.test';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const client = require('@/platform/coachTrackClient') as typeof import('@/platform/coachTrackClient');

const legalWeek = { v: 1 as const, days: [{ name: 'A', lifts: [{ ex: 'bb_row', sets: 3, band: [8, 10] as [number, number] }] }] };

let next: { status: number; body?: unknown } | 'abortable' = { status: 200, body: {} };
const fetchMock = jest.fn(async (_url: string, init: any) => {
  if (next === 'abortable') {
    return new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
  }
  const r = next;
  return { status: r.status, ok: r.status < 400, json: async () => r.body ?? {} };
});

beforeEach(async () => {
  await SecureStore.setItemAsync('hush.circle.session', 'tok');
  (global as any).fetch = fetchMock;
  fetchMock.mockClear();
});

describe('coachTrackClient', () => {
  it.each([
    [404, { error: 'bad_code' }, 'bad_code'],
    [409, { error: 'seats_full' }, 'seats_full'],
    [409, { error: 'already_linked' }, 'already_linked'],
    [409, { error: 'self' }, 'self'],
    [503, { error: 'coach_not_configured' }, 'coach_not_configured'],
    [500, {}, 'network'],
    [404, {}, 'not_found'],
    [403, {}, 'forbidden'],
    [400, {}, 'invalid'],
  ])('HTTP %s %j → %s', async (status, body, error) => {
    next = { status, body };
    const r = await client.coachJoin({ code: 'ABC123', name: 'Noa', consent: { bodyweight: false, cardio: false } });
    expect(r).toEqual({ ok: false, error });
  });

  it('a 401 is signed_out, and clears the session', async () => {
    next = { status: 401 };
    expect(await client.coachMe()).toEqual({ ok: false, error: 'signed_out' });
    expect(await SecureStore.getItemAsync('hush.circle.session')).toBeNull();
    fetchMock.mockClear();
    expect(await client.coachMe()).toEqual({ ok: false, error: 'signed_out' });
    expect(fetchMock).not.toHaveBeenCalled(); // no session → no call
  });

  it('a week that arrives malformed is refused, never handed on', async () => {
    next = { status: 200, body: { week: { version: 2, sentAt: '2026-09-17T08:00:00Z', coachName: 'Dana', week: { v: 1, days: [] } } } };
    expect(await client.traineeWeek(1)).toEqual({ ok: false, error: 'invalid' });
    next = { status: 200, body: { week: { version: 2, sentAt: '2026-09-17T08:00:00Z', coachName: 'Dana', week: legalWeek } } };
    const ok = await client.traineeWeek(1);
    expect(ok.ok && ok.value.week?.version).toBe(2);
    next = { status: 200, body: {} };
    expect(await client.traineeWeek(2)).toEqual({ ok: true, value: {} });
    expect(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0]).toBe('https://identity.test/me/coach/week?since=2');
  });

  it('a week the server must refuse is never sent', async () => {
    const r = await client.coachSendWeek('l1', { ...legalWeek, days: [] });
    expect(r).toEqual({ ok: false, error: 'invalid' });
    expect(fetchMock).not.toHaveBeenCalled();
    next = { status: 200, body: { version: 3, sentAt: 'x' } };
    expect((await client.coachSendWeek('l/1', legalWeek)).ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://identity.test/coach/athlete/week?l=l%2F1');
    expect(init.method).toBe('PUT');
  });

  it('every call is bounded — a worker that never answers is `network`', async () => {
    jest.useFakeTimers();
    next = 'abortable';
    const pending = client.coachRoster();
    for (let i = 0; i < 20; i += 1) await Promise.resolve(); // past the Keychain read, onto the fetch
    jest.advanceTimersByTime(client.TIMEOUT_MS + 1);
    jest.useRealTimers();
    expect(await pending).toEqual({ ok: false, error: 'network' });
  });
});
