/**
 * The server's finer refusals (`COACH_TRACK_V1 §6`, settled 2026-09-17) reach the coach's screens as
 * words — folded onto the coarse codes the outbox already keys on, and never letting a 5xx read as
 * "the link is gone" (law 6: a pull that merely failed forgets nothing).
 */

import * as SecureStore from 'expo-secure-store';

process.env.EXPO_PUBLIC_CIRCLE_URL = 'https://identity.test';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const client = require('@/platform/coachTrackClient') as typeof import('@/platform/coachTrackClient');

let next: { status: number; body?: unknown } = { status: 200, body: {} };
beforeEach(async () => {
  await SecureStore.setItemAsync('hush.circle.session', 'tok');
  (global as any).fetch = jest.fn(async () => ({ status: next.status, ok: next.status < 400, json: async () => next.body ?? {} }));
});

describe('§6 refusals, as the coach screens say them', () => {
  it.each([
    [404, { error: 'not_linked' }, 'not_found'],
    [404, { error: 'not_found' }, 'not_found'],
    [403, { error: 'not_coach' }, 'forbidden'],
    [400, { error: 'bad_week' }, 'invalid'],
    [400, { error: 'bad_request' }, 'invalid'],
    [409, { error: 'templates_full' }, 'templates_full'],
    [429, { error: 'too_many_invites' }, 'too_many_invites'],
    [429, {}, 'too_many_invites'],
    [503, { error: 'unavailable' }, 'unavailable'],
    [503, { error: 'coach_not_configured' }, 'coach_not_configured'],
    // ⛔ a 5xx is the network, whatever word rides on it — never "unlinked".
    [503, { error: 'not_found' }, 'network'],
    [502, { error: 'not_linked' }, 'network'],
  ])('HTTP %s %j → %s', async (status, body, error) => {
    next = { status, body };
    expect(await client.coachRoster()).toEqual({ ok: false, error });
  });
});
