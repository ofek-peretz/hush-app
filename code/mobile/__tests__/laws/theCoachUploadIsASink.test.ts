/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH UPLOAD IS A SINK. — the coach track, law 3 (2026-09-17)
 *
 * No upload blocks a set. A workout is saved to the phone first, always, and the coach's copy is a
 * queue drained afterwards: the save path never awaits the network, a failed drain keeps every item
 * (silently, with a backoff), and an athlete who is not linked to a coach makes no call at all.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { db } from '@/data/local/db';
import { wireToProgram } from '@/domain/coachTrack';
import type { Session, SetLog } from '@/data/local/models';

process.env.EXPO_PUBLIC_CIRCLE_URL = 'https://identity.test';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const outbox = require('@/state/coachOutbox') as typeof import('@/state/coachOutbox');

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const LINKED_SINCE = '2026-09-01T00:00:00.000Z';
const set = (i: number, w: number, r: number): SetLog => ({
  exerciseId: 'bb_bench_press',
  setIndex: i,
  recommendedWeight: w,
  recommendedReps: r,
  actualWeight: w,
  actualReps: r,
  edited: false,
  persistedAt: new Date(Date.parse('2026-09-15T17:00:00.000Z') + (i + 1) * 120_000).toISOString(),
});
const saved = (id: string, startedAt = '2026-09-15T17:00:00.000Z'): Session => ({
  id,
  programDayId: 'coach_0',
  programDayName: 'Upper',
  startedAt,
  state: 'SAVED',
  earlyFinish: false,
  sets: [set(0, 80, 6), set(1, 80, 6)],
});

type Reply = { status: number; body?: unknown } | 'throw' | 'hang';
let reply: Reply = { status: 200, body: { accepted: 1 } };
let release: (() => void) | null = null;
const bodies: any[] = [];
const fetchMock = jest.fn(async (_url: string, init: any) => {
  if (init?.body) bodies.push(JSON.parse(init.body));
  if (reply === 'throw') throw new TypeError('Network request failed');
  if (reply === 'hang') {
    await new Promise<void>((res) => { release = res; });
    return { status: 200, ok: true, json: async () => ({ accepted: 1 }) };
  }
  const r = reply;
  return { status: r.status, ok: r.status < 400, json: async () => r.body ?? {} };
});

async function link() {
  await outbox.saveCoachLink({ linkId: 'l1', coachName: 'Dana', since: LINKED_SINCE, consent: { bodyweight: false, cardio: false } });
}

/** Let the un-awaited drain the sink kicked finish its own work. */
const settle = async () => {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
};

beforeEach(async () => {
  await AsyncStorage.clear();
  await SecureStore.setItemAsync('hush.circle.session', 'tok');
  (global as any).fetch = fetchMock;
  fetchMock.mockClear();
  bodies.length = 0;
  reply = { status: 200, body: { accepted: 1 } };
  await db.saveProgram(wireToProgram({
    version: 3,
    sentAt: LINKED_SINCE,
    coachName: 'Dana',
    week: { v: 1, days: [{ name: 'Upper', lifts: [{ ex: 'bb_bench_press', sets: 2, band: [6, 8] }] }] },
  }).program);
});

afterEach(async () => {
  release?.();
  release = null;
  await settle();
});

describe('⛔ law 3 — the save path never waits on the coach', () => {
  it('every save site queues with `void` — after the history write, never awaited', () => {
    const store = read('src/state/stores/sessionStore.tsx');
    expect(store).toMatch(/await db\.appendCompletedSession\(saved\);\s*(\/\*[\s\S]*?\*\/\s*)?void queueSessionForCoach\(saved\);/);
    expect(store).toMatch(/await db\.appendCompletedSession\(s\);\s*void queueSessionForCoach\(s\);/);
    expect(read('src/state/sessionRecovery.ts')).toMatch(/await db\.appendCompletedSession\(saved\);\s*void queueSessionForCoach\(saved\);/);

    // nowhere in the app is the sink awaited, and the session code never touches the wire itself
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name) && /await\s+queueSessionForCoach/.test(read(rel))) offenders.push(rel);
      }
    };
    walk('src');
    expect(offenders).toEqual([]);
    expect(store).not.toMatch(/coachTrackClient/);
    // …and the sink kicks its drain without waiting on it either
    expect(read('src/state/coachOutbox.ts')).toMatch(/void drainOutbox\(nowMs\);/);
  });

  it('⛔ a network that never answers costs the save nothing', async () => {
    await link();
    reply = 'hang';
    const t = Date.now();
    await outbox.queueSessionForCoach(saved('s1'));
    expect(Date.now() - t).toBeLessThan(1000);
    expect((await outbox.loadOutbox()).map((i) => i.upload.id)).toEqual(['s1']);
  });

  it('⛔ a failed drain keeps the queue — a 5xx, and an offline throw — with a backoff', async () => {
    await link();
    reply = { status: 503 };
    const now = Date.parse('2026-09-15T18:00:00.000Z');
    await outbox.queueSessionForCoach(saved('s1'), now);
    await settle();
    let box = await outbox.loadOutbox();
    expect(box).toHaveLength(1);
    expect(box[0].tries).toBe(1);
    expect(box[0].nextAtMs).toBe(now + outbox.backoffMs(1));

    // not due yet: no call at all
    fetchMock.mockClear();
    await outbox.drainOutbox(now + 1000);
    expect(fetchMock).not.toHaveBeenCalled();

    reply = 'throw';
    await outbox.drainOutbox(now + outbox.backoffMs(1));
    box = await outbox.loadOutbox();
    expect(box).toHaveLength(1);
    expect(box[0].tries).toBe(2);
  });

  it('⛔ success removes exactly what was sent, and the wire carries the allow-list', async () => {
    await link();
    reply = { status: 503 };
    await outbox.queueSessionForCoach(saved('s1'), 1);
    await settle();
    reply = { status: 200, body: { accepted: 2 } };
    await outbox.queueSessionForCoach(saved('s2', '2026-09-16T17:00:00.000Z'), 10 ** 13);
    await settle();
    expect(await outbox.loadOutbox()).toEqual([]);
    const last = bodies[bodies.length - 1];
    expect(last.sessions.map((s: any) => s.id).sort()).toEqual(['s1', 's2']);
    expect(Object.keys(last.sessions[0]).sort()).toEqual(['at', 'day', 'early', 'id', 'minutes', 'sets', 'weekVersion']);
  });

  it('⛔ not linked → zero network; signed out → zero network, queue kept', async () => {
    await outbox.queueSessionForCoach(saved('s1'));
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await outbox.loadOutbox()).toEqual([]);
    expect(await outbox.pullCoachWeek(async () => {})).toEqual({ kind: 'idle' });
    expect(fetchMock).not.toHaveBeenCalled();

    await link();
    await SecureStore.deleteItemAsync('hush.circle.session');
    await outbox.queueSessionForCoach(saved('s1'));
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await outbox.loadOutbox()).toHaveLength(1);
  });

  it('⛔ nothing from before the link date leaves the phone', async () => {
    await link();
    await outbox.queueSessionForCoach(saved('old', '2026-08-30T17:00:00.000Z'));
    await settle();
    expect(await outbox.loadOutbox()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('⛔ a workout queued while a drain is in flight is not lost', async () => {
    await link();
    reply = 'hang';
    await outbox.queueSessionForCoach(saved('s1'), 1);
    await settle();
    await outbox.queueSessionForCoach(saved('s2', '2026-09-16T17:00:00.000Z'), 1);
    release?.();
    release = null;
    await settle();
    expect((await outbox.loadOutbox()).map((i) => i.upload.id)).toEqual(['s2']);
  });
});
