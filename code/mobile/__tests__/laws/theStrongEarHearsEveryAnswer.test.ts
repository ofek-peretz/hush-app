/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE STRONG EAR HEARS EVERY ANSWER, AND NEVER WRITES ALONE (2026-09-28).
 *
 * Founder: *"אם יש מנוע תמלול טוב וחזק יותר ממה שיש לנו כיום עדיף לדעתי יהיה להשתמש בו מאחר וזה הקלט
 * של האימון."* The strongest recognizer (`platform/voice/cloudEar` → `server/voice.ts`, OpenAI
 * `gpt-transcribe`) hears every answer; the phone's own ear is the backup for a gym with no signal.
 * What it returns is only words: they reach the conductor through the same `onSentence`, the same
 * closed grammar and the same echo as every other sentence. This law runs the pocket window
 * (`voiceCapture`) over a fake microphone and a fake cloud, and holds:
 *
 *   1. Every sentence the phone hears is heard again by the strong ear, and its words decide.
 *   2. A strong ear that does not answer in time (offline, slow, failing) leaves the phone's words
 *      exactly as they were — never later than `STRONG_WAIT_MS`.
 *   3. A window that ran out is heard again only if the microphone heard a voice; a quiet one costs
 *      nothing.
 *   4. A long window is listened to while it is open — "מוכן" is not left waiting for its end.
 *   5. Her switch off: the phone alone.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { pickHeard, voiced, STRONG_WAIT_MS, LISTEN_EVERY_MS } from '@/platform/voice/cloudEar';

const mockListeners: ((e: { text: string; token: number }) => void)[] = [];
let mockClip: { wav: string; seconds: number; peakDb: number; floorDb: number } | null = null;
let mockListenCalls: number[] = [];
jest.mock('@/platform/voice/audioSession', () => ({
  audioSession: {
    earRunning: () => true,
    earListen: async (_lang: string, token: number) => {
      mockListenCalls.push(token);
      return null;
    },
    earStopListening: async () => {},
    earClip: async () => mockClip,
    onEarResult: (cb: (text: string, token: number) => void) => {
      const l = (e: { text: string; token: number }) => cb(e.text, e.token);
      mockListeners.push(l);
      return () => mockListeners.splice(mockListeners.indexOf(l), 1);
    },
    prepareListening: async () => {},
  },
}));

let mockCloud: { text: string | null; delayMs: number; calls: number } = { text: null, delayMs: 0, calls: 0 };
jest.mock('@/platform/voice/voiceCloud', () => ({
  voiceCloudReachable: () => true,
  // The real `cloudHear` aborts at its own `timeoutMs` (`voiceCloud.post`) — the fake keeps that contract.
  cloudHear: async (_wav: string, _expect: string, _lang: string, timeoutMs: number) => {
    mockCloud.calls += 1;
    await new Promise((r) => setTimeout(r, Math.min(mockCloud.delayMs, timeoutMs)));
    if (mockCloud.delayMs > timeoutMs) return { ok: false, why: 'timeout' };
    return mockCloud.text == null ? { ok: false, why: 'offline' } : { ok: true, text: mockCloud.text };
  },
}));
jest.mock('@/platform/telemetry', () => ({ track: () => {} }));

// eslint-disable-next-line import/first
import { voiceCapture } from '@/platform/voice/voiceCapture';
// eslint-disable-next-line import/first
import { cloudEar } from '@/platform/voice/cloudEar';

const LOUD = { wav: 'UklGRg==', seconds: 3, peakDb: -12, floorDb: -40 };
const QUIET = { wav: 'UklGRg==', seconds: 3, peakDb: -38, floorDb: -40 };

function open(ms = 6_000, expect = 'reps') {
  const heard: string[] = [];
  const ends: string[] = [];
  const w = voiceCapture.open({
    locale: 'he',
    ms,
    expect,
    onSentence: (t) => {
      heard.push(t);
      return false;
    },
    onEnd: (why) => ends.push(why),
  });
  return { w, heard, ends };
}
const say = (text: string) => {
  const token = mockListenCalls[mockListenCalls.length - 1];
  for (const l of [...mockListeners]) l({ text, token });
};
const flush = async (ms = 0) => {
  await jest.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  mockListeners.length = 0;
  mockListenCalls = [];
  mockClip = LOUD;
  mockCloud = { text: null, delayMs: 0, calls: 0 };
  cloudEar.setEnabled(true);
});
afterEach(() => jest.useRealTimers());

describe('⛔ the strong ear hears every answer, and never writes alone', () => {
  it('the policy: whatever the strong ear understood decides; noise or nothing from it leaves the phone\'s words', () => {
    expect(pickHeard('שש', 'עשר')).toBe('עשר');
    expect(pickHeard('מוכן', 'כן')).toBe('כן');
    expect(pickHeard('עשר', null)).toBe('עשר');
    expect(pickHeard('עשר', '')).toBe('עשר');
    expect(pickHeard('עשר', 'מה קורה')).toBe('עשר'); // noise from the cloud never replaces an answer
    expect(voiced(LOUD)).toBe(true);
    expect(voiced(QUIET)).toBe(false);
    expect(voiced(null)).toBe(false);
  });

  it('1 · a number the phone mis-heard is the strong ear\'s number', async () => {
    mockCloud = { text: 'עשר', delayMs: 300, calls: 0 };
    const { heard, ends } = open();
    await flush();
    say('שש');
    await flush(400);
    expect(mockCloud.calls).toBe(1);
    expect(heard).toEqual(['עשר']);
    expect(ends).toEqual(['heard']);
  });

  it('1 · …and a word too: "מוכן" is heard by the strong ear before it starts the set', async () => {
    mockCloud = { text: 'מוכן', delayMs: 400, calls: 0 };
    const { heard } = open(90_000, 'ready');
    await flush();
    say('מוכן');
    await flush(500);
    expect(mockCloud.calls).toBe(1);
    expect(heard).toEqual(['מוכן']);
  });

  it('2 · a strong ear that does not answer in time leaves the phone\'s words — never later than its wait', async () => {
    mockCloud = { text: 'עשר', delayMs: 10_000, calls: 0 };
    const { heard } = open();
    await flush();
    say('שש');
    await flush(STRONG_WAIT_MS - 100);
    expect(heard).toEqual([]);
    await flush(200);
    expect(heard).toEqual(['שש']);
  });

  it('2 · …and offline is the phone alone, exactly as before', async () => {
    mockCloud = { text: null, delayMs: 0, calls: 0 };
    const { heard } = open();
    await flush();
    say('תשע');
    await flush(10);
    expect(heard).toEqual(['תשע']);
  });

  it('3 · a window that ran out with a voice in it is heard again; a quiet one is not sent at all', async () => {
    mockCloud = { text: 'שמונה', delayMs: 200, calls: 0 };
    const a = open(6_000);
    await flush(6_000);
    await flush(500);
    expect(a.heard).toEqual(['שמונה']);
    expect(a.ends).toEqual(['heard']);
    mockClip = QUIET;
    mockCloud = { text: 'שמונה', delayMs: 0, calls: 0 };
    const b = open(6_000);
    await flush(6_000);
    await flush(500);
    expect(mockCloud.calls).toBe(0);
    expect(b.ends).toEqual(['timeout']);
  });

  it('4 · a long window is listened to while it is open — "מוכן" the phone missed is heard in seconds, not at the end', async () => {
    mockCloud = { text: 'מוכן', delayMs: 300, calls: 0 };
    const { heard, ends } = open(90_000, 'ready');
    await flush(LISTEN_EVERY_MS + 500);
    expect(heard).toEqual(['מוכן']);
    expect(ends).toEqual(['heard']);
  });

  it('4 · …but a quiet stretch, or one the phone already handed over, is not sent', async () => {
    mockClip = QUIET;
    const { heard } = open(90_000, 'ready');
    await flush(3 * LISTEN_EVERY_MS);
    expect(mockCloud.calls).toBe(0);
    expect(heard).toEqual([]);
  });

  it('5 · her switch off: the phone alone', async () => {
    cloudEar.setEnabled(false);
    mockCloud = { text: 'עשר', delayMs: 0, calls: 0 };
    const { heard } = open();
    await flush();
    say('שש');
    await flush(100);
    expect(heard).toEqual(['שש']);
    expect(mockCloud.calls).toBe(0);
  });
});
