/**
 * The on-device half of the sync proof (2026-09-17): the trace records, ships in pieces the sink
 * accepts, and reads back into the numbers the device test is for. `platform/syncTrace` +
 * `scripts/sync-report.cjs`.
 */
// @ts-nocheck
import AsyncStorage from '@react-native-async-storage/async-storage';

const tracked: { type: string; data: Record<string, unknown> }[] = [];
jest.mock('@/platform/telemetry', () => ({
  track: jest.fn(async (type: string, data: Record<string, unknown>) => void tracked.push({ type, data })),
  shipToSink: jest.fn(async () => true),
}));

import { syncTrace, traceWristReport, SYNC_TRACE_PIECE } from '@/platform/syncTrace';
import { parseWatchIntent, WATCH_PROTOCOL_VERSION } from '@/platform/watch/protocol';
const { reassemble, analyse } = require('../../scripts/sync-report.cjs');

let now = 1_900_000_000_000;
beforeEach(() => {
  tracked.length = 0;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});

it('OFF, nothing is recorded and nothing ships', async () => {
  await AsyncStorage.setItem('hush.syncTrace', '0');
  syncTrace.add('P', 1, 'rest_inter', 3, 1000, true);
  await syncTrace.ship();
  expect(tracked.filter((t) => t.type === 'sync_trace')).toHaveLength(0);
});

it('ON, a workout reads back as delivery, buzz, card and tap timings', async () => {
  await syncTrace.setOn(true);
  // The phone publishes a rest ending 90 s from now; the wrist gets it 180 ms later.
  const end = now + 90_000;
  syncTrace.add('P', 7, 'rest_inter', 2, syncTrace.rel(end), true);
  syncTrace.add('L', 'update', 'rest_inter', syncTrace.rel(end));
  now += 40;
  syncTrace.add('l', 'update', true);
  now += 90_000;
  // She taps Start on the wrist; the tap carries its report — frame 7 received, the GO beat 60 ms late.
  const wristTap = {
    v: WATCH_PROTOCOL_VERSION, type: 'end_rest', intentId: 'x', issuedAt: new Date(now - 250).toISOString(),
    issuedAtMs: now - 250, rx: [[7, end - 90_000 + 180]], hx: [[0, end + 60, end]],
  };
  syncTrace.add('W', 'end_rest', syncTrace.rel(wristTap.issuedAtMs), true, '');
  traceWristReport(wristTap);
  syncTrace.add('K', 'add_rest', syncTrace.rel(now - 1_200));
  await syncTrace.end();

  const pieces = tracked.filter((t) => t.type === 'sync_trace');
  expect(pieces.length).toBeGreaterThan(0);
  // Every piece fits the sink's 256-character string rule.
  for (const p of pieces) expect(String(p.data.c).length).toBeLessThanOrEqual(SYNC_TRACE_PIECE);

  const [[, { texts, missing }]] = [...reassemble(pieces.map((p) => ({ properties: Object.fromEntries(Object.entries(p.data).map(([k, v]) => [`d_${k}`, v])) })))];
  expect(missing).toEqual([]);
  const r = analyse(texts);
  expect(r.wristDeliveryMs).toMatchObject({ n: 1, median: 180 });
  expect(r.wristBuzzLateMs).toMatchObject({ median: 60 });
  expect(r.wristGoVsPhoneRestEndMs).toMatchObject({ median: 0 });
  expect(r.liveActivityUpdateMs).toMatchObject({ median: 40 });
  expect(r.wristTapToPhoneMs).toMatchObject({ median: 250 });
  expect(r.lockTapToPhoneMs).toMatchObject({ median: 1_200 });
  expect(r.framesNeverSeenByWrist).toBe(0);
  await syncTrace.setOn(false);
});

it('the wrist report rides the intent through the parser, and a malformed one never costs her tap', () => {
  const base = { v: WATCH_PROTOCOL_VERSION, type: 'complete_set', intentId: 'i', issuedAt: new Date(now).toISOString() };
  expect(parseWatchIntent({ ...base, issuedAtMs: now, rx: [[1, now]], hx: [[0, now, now]] })).toMatchObject({ issuedAtMs: now, rx: [[1, now]], hx: [[0, now, now]] });
  const junk = parseWatchIntent({ ...base, rx: 'nope', hx: [['a', 1]] });
  expect(junk).not.toBeNull();
  expect(junk.hx).toEqual([]);
});
