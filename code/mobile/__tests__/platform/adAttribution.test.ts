/**
 * Apple Search Ads attribution — once per install, Apple's 404 retry contract, ids only.
 */
jest.mock('@/data/local/db', () => {
  const firsts: string[] = [];
  return {
    db: {
      hasFirst: async (n: string) => firsts.includes(n),
      markFirst: async (n: string) => void firsts.push(n),
      __reset: () => firsts.splice(0),
    },
  };
});
jest.mock('@/platform/telemetry', () => ({
  trackFirst: jest.fn(async (name: string, data: unknown) => {
    const { db } = jest.requireMock('@/data/local/db');
    if (await db.hasFirst(name)) return;
    await db.markFirst(name);
    (global as unknown as { __tracked: unknown[] }).__tracked.push([name, data]);
  }),
}));

import { resolveAdAttribution, AD_SERVICES_ENDPOINT } from '@/platform/adAttribution';
import { db } from '@/data/local/db';

const tracked = () => (global as unknown as { __tracked: unknown[] }).__tracked;
const response = (status: number, body?: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as unknown as Response;

beforeEach(() => {
  (global as unknown as { __tracked: unknown[] }).__tracked = [];
  (db as unknown as { __reset: () => void }).__reset();
});

test('posts the token to Apple and records the campaign ids, and only the listed scalars', async () => {
  const fetchImpl = jest.fn(async () =>
    response(200, { attribution: true, orgId: 1, campaignId: 2, adGroupId: 3, keywordId: 4, countryOrRegion: 'IL', injected: { x: 1 } }),
  );
  await resolveAdAttribution({ token: async () => 'tok', fetchImpl: fetchImpl as unknown as typeof fetch, wait: async () => {} });
  expect(fetchImpl).toHaveBeenCalledWith(AD_SERVICES_ENDPOINT, expect.objectContaining({ method: 'POST', body: 'tok' }));
  expect(tracked()).toEqual([
    ['install_ad_attribution', { attribution: true, orgId: 1, campaignId: 2, adGroupId: 3, keywordId: 4, countryOrRegion: 'IL' }],
  ]);
});

test('a 404 is "not ready yet": three tries, five seconds apart, then give up for this launch', async () => {
  const waits: number[] = [];
  const fetchImpl = jest.fn(async () => response(404));
  await resolveAdAttribution({ token: async () => 'tok', fetchImpl: fetchImpl as unknown as typeof fetch, wait: async (ms) => void waits.push(ms) });
  expect(fetchImpl).toHaveBeenCalledTimes(3);
  expect(waits).toEqual([5000, 5000, 5000]);
  expect(tracked()).toEqual([]);
});

test('once per install — an install already attributed never asks Apple again', async () => {
  const fetchImpl = jest.fn(async () => response(200, { attribution: false }));
  const seams = { token: async () => 'tok', fetchImpl: fetchImpl as unknown as typeof fetch, wait: async () => {} };
  await resolveAdAttribution(seams);
  await resolveAdAttribution(seams);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(tracked()).toHaveLength(1);
});

test('silent: no token, a network error or a server error never throws and records nothing', async () => {
  await expect(resolveAdAttribution({ token: async () => null })).resolves.toBeUndefined();
  await expect(resolveAdAttribution({ token: async () => 'tok', fetchImpl: (async () => { throw new Error('offline'); }) as unknown as typeof fetch })).resolves.toBeUndefined();
  await expect(resolveAdAttribution({ token: async () => 'tok', fetchImpl: (async () => response(500)) as unknown as typeof fetch })).resolves.toBeUndefined();
  expect(tracked()).toEqual([]);
});
