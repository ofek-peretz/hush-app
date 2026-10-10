/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * A NEW LINK COUNTS ITS OWN WEEKS — found on the web walk of the trainee screens (2026-09-17).
 *
 * Versions count per LINK on the server. She trained a coach's v3, left (law 6 — the week stays on
 * her phone), and joined again: the new link's weeks start at v1. The pull compared v1 against the
 * v3 on disk, asked the server only for `since=3`, and nothing her coach sent ever landed. The week
 * on disk now carries the link it landed through (`Program.coachLinkId`), and a week from another
 * link is version 0 to this one — still hers, never rewritten until a new week lands.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { db } from '@/data/local/db';
import { wireToProgram } from '@/domain/coachTrack';

process.env.EXPO_PUBLIC_CIRCLE_URL = 'https://identity.test';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const outbox = require('@/state/coachOutbox');

const env = (version: number, sets: number) => ({
  version,
  sentAt: '2026-09-17T08:00:00.000Z',
  coachName: 'Dana',
  week: { v: 1, days: [{ name: 'Upper', lifts: [{ ex: 'bb_bench_press', sets, band: [6, 8] }] }] },
});
const LINK = (linkId: string) => ({ linkId, coachName: 'Dana', since: '2026-09-01T00:00:00.000Z', consent: { bodyweight: false, cardio: false } });

let served = null;
const calls: string[] = [];

beforeEach(async () => {
  await AsyncStorage.clear();
  await SecureStore.setItemAsync('hush.circle.session', 'tok');
  calls.length = 0;
  served = null;
  (global as any).fetch = jest.fn(async (url: string) => {
    calls.push(url);
    return { status: 200, ok: true, json: async () => (served ? { week: served } : {}) };
  });
});

describe('⛔ versions count per link', () => {
  it('a week landed through an ended link does not make the new link’s v1 stale', async () => {
    await db.saveProgram({ ...wireToProgram(env(3, 4)).program, coachLinkId: 'old' });
    await outbox.saveCoachLink(LINK('new'));
    served = env(1, 5);
    const adopt = jest.fn(async (p) => { await db.saveProgram(p); });

    const out = await outbox.pullCoachWeek(adopt);
    expect(calls[0]).toContain('/me/coach/week?since=0');
    expect(out.kind).toBe('landed');
    const now = await db.loadProgram();
    expect(now.coachVersion).toBe(1);
    expect(now.coachLinkId).toBe('new');
    expect(now.days[0].slots[0].setCount).toBe(5);
  });

  it('…while the same link still asks only for what is newer, and stamps what lands', async () => {
    await db.saveProgram({ ...wireToProgram(env(3, 4)).program, coachLinkId: 'l1' });
    await outbox.saveCoachLink(LINK('l1'));
    served = null;
    const out = await outbox.pullCoachWeek(async (p) => db.saveProgram(p));
    expect(calls[0]).toContain('/me/coach/week?since=3');
    expect(out).toEqual({ kind: 'current' });

    served = env(4, 6);
    const landed = await outbox.pullCoachWeek(async (p) => db.saveProgram(p));
    expect(landed.kind).toBe('landed');
    expect((await db.loadProgram()).coachLinkId).toBe('l1');
  });
});
