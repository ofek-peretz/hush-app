/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * A COACH UPDATE NEVER LANDS MID-SESSION. — the coach track, law 2 (2026-09-17)
 *
 * ⛔ FOUNDER, 2026-09-17: *"אני רוצה להוסיף מסלול למאמנים שנותנים למתאמנים שלהם להתאמן איתנו."*
 * The coach can press Send at any moment — including the moment she is under the bar. A week that
 * replaced the one she is standing in would re-point her running workout (it is addressed by
 * position, `coach_<i>`) at whatever day now sits in that seat. So a new version lands on the first
 * day not yet started: while a session is ACTIVE it is deferred, and it lands the moment the save
 * clears the active session — at the session's end or the next foreground.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { db } from '@/data/local/db';
import { landCoachUpdate, wireToProgram, type CoachWeekWire, type WeekEnvelope } from '@/domain/coachTrack';
import type { Program, Session } from '@/data/local/models';

process.env.EXPO_PUBLIC_CIRCLE_URL = 'https://identity.test';
// Required after the URL is set — the client reads it once, at load.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const outbox = require('@/state/coachOutbox') as typeof import('@/state/coachOutbox');

const ROOT = path.resolve(__dirname, '../..');

const week = (sets: number): CoachWeekWire => ({
  v: 1,
  days: [
    { name: 'Upper', lifts: [{ ex: 'bb_bench_press', sets, band: [6, 8] }, { ex: 'bb_row', sets: 3, band: [8, 10] }] },
    { name: 'Lower', lifts: [{ ex: 'bb_back_squat', sets: 5, band: [3, 5] }] },
  ],
});
const env = (version: number, sets: number): WeekEnvelope => ({ version, sentAt: '2026-09-17T08:00:00.000Z', coachName: 'Dana', week: week(sets) });

const running = (): Session => ({
  id: 'running',
  programDayId: 'coach_0',
  startedAt: '2026-09-17T07:00:00.000Z',
  state: 'ACTIVE',
  earlyFinish: false,
  sets: [],
});

let served: WeekEnvelope | null = null;
const calls: string[] = [];

beforeEach(async () => {
  await AsyncStorage.clear();
  await SecureStore.setItemAsync('hush.circle.session', 'tok');
  calls.length = 0;
  (global as any).fetch = jest.fn(async (url: string) => {
    calls.push(url);
    return { status: 200, ok: true, json: async () => (served ? { week: served } : {}) };
  });
  await outbox.saveCoachLink({ linkId: 'l1', coachName: 'Dana', since: '2026-09-01T00:00:00.000Z', consent: { bodyweight: false, cardio: false } });
  // The week on disk landed through THIS link (2026-09-17: versions count per link — see `Program.coachLinkId`).
  await db.saveProgram({ ...wireToProgram(env(1, 4)).program, coachLinkId: 'l1' });
});

describe('⛔ law 2 — a coach update never lands under an active session', () => {
  it('the pure decision: ACTIVE defers, anything else lands', () => {
    const current = wireToProgram(env(1, 4)).program;
    expect(landCoachUpdate(current, env(2, 5), { state: 'ACTIVE' }, new Date()).kind).toBe('deferred');
    expect(landCoachUpdate(current, env(2, 5), { state: 'SAVED' }, new Date()).kind).toBe('landed');
    expect(landCoachUpdate(current, env(2, 5), null, new Date()).kind).toBe('landed');
  });

  it('⛔ the pull, with a workout running: the week on disk is the week she started, to the set', async () => {
    const before = await db.loadProgram();
    await db.saveActiveSession(running());
    served = env(2, 5);
    const adopt = jest.fn(async (p: Program) => { await db.saveProgram(p); });

    const out = await outbox.pullCoachWeek(adopt);
    expect(out).toEqual({ kind: 'deferred', reason: 'active_session', version: 2 });
    expect(adopt).not.toHaveBeenCalled();
    expect(await db.loadProgram()).toEqual(before);
    expect(await outbox.loadPendingCoachUpdate()).toBeNull(); // no card for a week that has not landed
    expect(calls[0]).toContain('/me/coach/week?since=1');
  });

  it('⛔ …and the moment the save clears the session, the same pull lands it', async () => {
    await db.saveActiveSession(running());
    served = env(2, 5);
    const adopt = jest.fn(async (p: Program) => { await db.saveProgram(p); });
    expect((await outbox.pullCoachWeek(adopt)).kind).toBe('deferred');

    await db.clearActiveSession(); // what `finalize` does right after the history write
    const out = await outbox.pullCoachWeek(adopt);
    expect(out.kind).toBe('landed');
    expect(adopt).toHaveBeenCalledTimes(1);
    const now = await db.loadProgram();
    expect(now?.coachVersion).toBe(2);
    expect(now?.days[0].slots[0].setCount).toBe(5);
    const card = await outbox.loadPendingCoachUpdate();
    expect(card?.diff.changed).toEqual([{ day: 'Upper', ex: 'bb_bench_press', sets: [4, 5] }]);
  });

  it('⛔ the store re-asks when a running workout ends, and at every foreground', () => {
    const store = fs.readFileSync(path.join(ROOT, 'src/state/stores/coachStore.tsx'), 'utf8');
    expect(store).toMatch(/if \(was && !session\.active\) void routine\(\);/);
    expect(store).toMatch(/AppState\.addEventListener\('change', \(st\) => \{\s*if \(st === 'active'\) void routine\(\);/);
    // the decision is made in ONE pure place — the store never lands a week by any other road
    const src = fs.readFileSync(path.join(ROOT, 'src/state/coachOutbox.ts'), 'utf8');
    expect(src).toMatch(/const active = await db\.loadActiveSession\(\)[\s\S]{0,80}landCoachUpdate\(current, week, active,/);
    expect(src.match(/adopt\(/g)?.length).toBe(1);
  });
});
