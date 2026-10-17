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
 *   6. ⛔ (2026-10-05) The strong ear does not wait for the phone: the microphone's level says when
 *      she has spoken and stopped, and that stretch is heard at once — one utterance, one answer.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { pickHeard, voiced, stirred, worthHearing, STRONG_WAIT_MS, LISTEN_EVERY_MS, RESCUE_MS, DEAF_RETRY_MS } from '@/platform/voice/cloudEar';

const mockListeners: ((e: { text: string; token: number }) => void)[] = [];
let mockClip: { wav: string; seconds: number; peakDb: number; floorDb: number } | null = null;
/** When set: the microphone over time — the clip of the last `seconds` as of `now`. */
let mockClipAt: ((now: number, seconds: number) => typeof mockClip) | null = null;
let mockListenCalls: number[] = [];
/** The phone has a recognizer of its own on the window (iOS 26 and the language's model). */
let mockOwn = false;
jest.mock('@/platform/voice/audioSession', () => ({
  audioSession: {
    earRunning: () => true,
    earListen: async (_lang: string, token: number) => {
      mockListenCalls.push(token);
      return null;
    },
    earStopListening: async () => {},
    earClip: async (_token: number, seconds = 12) => (mockClipAt ? mockClipAt(Date.now(), seconds) : mockClip),
    earRecognizing: () => mockOwn,
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
/** A word at the room's own level: eight decibels between the loudest and the quietest moment (measured: 7.9–10.5). */
const UNDER = { wav: 'UklGRg==', seconds: 3, peakDb: -32, floorDb: -40 };

function open(ms = 6_000, expect = 'reps', keepOpen = false) {
  const heard: string[] = [];
  const ends: string[] = [];
  const w = voiceCapture.open({
    locale: 'he',
    ms,
    expect,
    onSentence: (t) => {
      heard.push(t);
      return keepOpen; // `true` is the conductor keeping the window (noise while loading)
    },
    onEnd: (why) => ends.push(why),
  });
  return { w, heard, ends };
}
/** A room that is quiet except while she speaks: `[fromMs, toMs]` after `t0`, as the microphone hears it. */
const speaks = (t0: number, ...spans: [number, number][]) => (now: number, seconds: number) => {
  const from = now - seconds * 1000;
  return spans.some(([a, b]) => t0 + a < now && t0 + b > from) ? LOUD : QUIET;
};
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
  mockClipAt = null;
  mockCloud = { text: null, delayMs: 0, calls: 0 };
  mockOwn = false;
  cloudEar.setEnabled(true);
  cloudEar.reset();
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

/*
 * ════ ⛔ 6 · THE STRONG EAR DOES NOT WAIT FOR THE PHONE (2026-10-05) ════
 *   > founder: *"מי שומע את התגובה שלי — הבינה המלאכותית או מערכת כמו סירי? כי אני זוכר שהוספנו את
 *   > התמלול של openai."*
 * It had been built BEHIND Apple's recognizer: it heard an answer only after the phone produced a
 * sentence for it, and when the phone produced none — only as the window ran out. His report of the
 * workout was *"אני מדבר ואין מענה בכלל"*. The microphone's level now says when she spoke and stopped.
 */
describe('⛔ 6 · the strong ear hears her the moment she stops — it does not wait for the phone', () => {
  it('she speaks and stops, the phone says nothing: heard at once, with seconds of the window still to run', async () => {
    mockCloud = { text: 'עשר', delayMs: 400, calls: 0 };
    mockClipAt = speaks(Date.now(), [1_000, 1_600]);
    const { heard, ends } = open(6_000);
    await flush(2_000); // she has only just stopped
    expect(heard).toEqual([]);
    expect(mockCloud.calls).toBe(0);
    await flush(1_300); // 0.6 s of quiet found, the stretch sent, 0.4 s for the answer
    expect(mockCloud.calls).toBe(1);
    expect(heard).toEqual(['עשר']);
    expect(ends).toEqual(['heard']); // 3.3 s in: the old ear would have waited for 6
  });

  it('…and "מוכן" at the rack is heard in the long window without the phone, too', async () => {
    mockCloud = { text: 'מוכן', delayMs: 300, calls: 0 };
    mockClipAt = speaks(Date.now(), [20_000, 20_500]);
    const { heard, ends } = open(90_000, 'ready');
    await flush(20_400);
    expect(heard).toEqual([]);
    await flush(1_700);
    expect(heard).toEqual(['מוכן']);
    expect(ends).toEqual(['heard']);
  });

  it('one utterance, one answer: the phone\'s late sentence for a stretch the strong ear has is held — and dropped once it answered', async () => {
    mockCloud = { text: 'עשר', delayMs: 600, calls: 0 };
    mockClipAt = speaks(Date.now(), [1_000, 1_600]);
    const { heard } = open(20_000, 'reps', true);
    await flush(2_500); // the stretch is with the strong ear (sent at 2.4 s)
    expect(mockCloud.calls).toBe(1);
    say('שש'); // Apple's recognizer finishes its own sentence for the same word, and mis-hears it
    await flush(700);
    expect(heard).toEqual(['עשר']); // the strong ear's words — once
    say('שש'); // …and again a moment later (some recognizers repeat a final)
    await flush(500);
    expect(heard).toEqual(['עשר']);
    expect(mockCloud.calls).toBe(1); // the phone's sentence was never sent as a second question
  });

  it('a sentence the phone hands over FIRST is heard the old way, and the stretch is not sent again', async () => {
    mockCloud = { text: 'עשר', delayMs: 300, calls: 0 };
    mockClipAt = speaks(Date.now(), [1_000, 1_600]);
    const { heard } = open(20_000, 'reps', true);
    await flush(1_700);
    say('עשר'); // the phone was quick this time
    await flush(3_000);
    expect(heard).toEqual(['עשר']);
    expect(mockCloud.calls).toBe(1); // its `check` asked the strong ear; the stretch did not ask again
  });

  it('a strong ear that cannot answer leaves the phone\'s sentence for that utterance — never silence', async () => {
    mockCloud = { text: 'עשר', delayMs: 10_000, calls: 0 }; // slower than the wait: as good as offline
    mockClipAt = speaks(Date.now(), [1_000, 1_600]);
    const { heard, ends } = open(8_000);
    await flush(2_600);
    say('תשע'); // held while the strong ear has the stretch
    expect(heard).toEqual([]);
    await flush(RESCUE_MS - 400); // still inside its wait: nothing is decided yet
    expect(heard).toEqual([]);
    await flush(500); // its wait runs out
    expect(heard).toEqual(['תשע']);
    expect(ends).toEqual(['heard']);
  });

  it('a room that stays quiet costs nothing, and with her switch off the level is not read at all', async () => {
    mockClipAt = speaks(Date.now());
    mockCloud = { text: 'עשר', delayMs: 0, calls: 0 };
    const a = open(6_000);
    await flush(5_000);
    expect(mockCloud.calls).toBe(0);
    expect(a.heard).toEqual([]);
    a.w.close();
    cloudEar.setEnabled(false);
    mockClipAt = speaks(Date.now(), [1_000, 1_600]);
    const b = open(6_000);
    await flush(5_000);
    expect(mockCloud.calls).toBe(0);
    expect(b.heard).toEqual([]);
  });
});

/*
 * ════ ⛔ 7 · THE PHONE'S LOUDNESS METER DECIDES HOW EARLY — NEVER WHETHER (2026-10-05, measured) ════
 *   > founder: *"ובדקת בקוד שזה אמור לעבוד? הכל אמור לעבוד חלק?"*
 * Every stretch had to be ten decibels "voiced" before the strong ear was sent it. Measured that day:
 * the strong ear heard a word right 39 times of 40, down to a room five decibels LOUDER than the
 * voice; the phone's meter would have sent it 25 times of 40 — never once the room was as loud as
 * she was. In a loud gym the ear that could hear her was not asked (`cloudEar.worthHearing`).
 */
describe('⛔ 7 · a voice no louder than the room is still heard', () => {
  it('the rule: a found stretch is sent as it is; a waited-for word unless the room was flat; a set only a clear voice', () => {
    expect(voiced(UNDER)).toBe(false);
    expect(stirred(UNDER)).toBe(true);
    expect(stirred(QUIET)).toBe(false);
    // A window in which the coach waits for her word:
    expect(worthHearing(UNDER, false, 'end')).toBe(true);
    expect(worthHearing(UNDER, false, 'during')).toBe(true);
    expect(worthHearing(QUIET, false, 'end')).toBe(false);
    // A patient one — she is lifting, or the workout has been paused a while; nobody asked:
    expect(worthHearing(UNDER, true, 'end')).toBe(false);
    expect(worthHearing(LOUD, true, 'end')).toBe(true);
    expect(worthHearing(QUIET, true, 'spoken')).toBe(true); // the level found it against the WINDOW's quietest moment — not judged twice
    expect(worthHearing({ ...LOUD, seconds: 0.1 }, false, 'end')).toBe(false);
    expect(worthHearing(null, false, 'spoken')).toBe(false);
  });

  it('a pause past its first minute is patient: never listened to on a timer, and a room that only stirs is not sent', async () => {
    mockClip = UNDER;
    mockCloud = { text: 'המשך', delayMs: 0, calls: 0 };
    const heard: string[] = [];
    const ends: string[] = [];
    voiceCapture.open({ locale: 'he', ms: 60_000, expect: 'resume', patient: true, onSentence: (t) => (heard.push(t), true), onEnd: (why) => ends.push(why) });
    await flush(60_000);
    await flush(600);
    expect(mockCloud.calls).toBe(0);
    expect(ends).toEqual(['timeout']);
    // …while the first minute of the same pause is heard like any question.
    const first = open(60_000, 'resume');
    await flush(LISTEN_EVERY_MS + 500);
    expect(first.heard).toEqual(['המשך']);
  });

  it('"כמה חזרות?" in a loud room: the level never saw a voice, and the window\'s end is heard all the same', async () => {
    mockClip = UNDER;
    mockCloud = { text: 'עשר', delayMs: 200, calls: 0 };
    const { heard, ends } = open(6_000);
    await flush(5_900);
    expect(mockCloud.calls).toBe(0); // nothing the level could find — no stretch of its own
    await flush(600);
    expect(mockCloud.calls).toBe(1);
    expect(heard).toEqual(['עשר']);
    expect(ends).toEqual(['heard']);
  });

  it('"מוכן" at the rack in a loud room is heard by the long window\'s own listen — in seconds', async () => {
    mockClip = UNDER;
    mockCloud = { text: 'מוכן', delayMs: 300, calls: 0 };
    const { heard, ends } = open(90_000, 'ready');
    await flush(LISTEN_EVERY_MS + 500);
    expect(heard).toEqual(['מוכן']);
    expect(ends).toEqual(['heard']);
  });

  it('while she lifts, a room that only stirs is not sent — not during the set, not as its window runs out', async () => {
    mockClip = UNDER;
    mockCloud = { text: 'עשר', delayMs: 0, calls: 0 };
    const { heard, ends } = open(20_000, 'set', true);
    await flush(20_000);
    await flush(600);
    expect(mockCloud.calls).toBe(0);
    expect(heard).toEqual([]);
    expect(ends).toEqual(['timeout']);
  });

  it('the listening test can say how far over the room she was', async () => {
    mockClipAt = speaks(Date.now(), [1_000, 1_600]);
    mockCloud = { text: 'עשר', delayMs: 100, calls: 0 };
    open(6_000);
    await flush(3_000);
    expect(voiceCapture.lastLevels()).toEqual({ roomDb: -40, loudestDb: -12, found: 1 });
  });
});

/*
 * ════ ⛔ 8 · AN EAR THAT CANNOT BE REACHED IS NOT HER SILENCE (2026-10-05) ════
 *   > founder: *"חייב לבדוק את כל מקרי הקצה ולוודא שהשמע עובד בהכל."*
 * No network in a basement gym was a `timeout` like any other: the coach asked again and said "לא
 * שמעתי" at every set of the workout, to a lifter who had answered every time (`cloudEar.deaf`).
 */
describe('⛔ 8 · no network is said — it is not taken for her silence', () => {
  it('twice out of reach, and the window ends as `deaf` — on a phone with no recognizer of its own', async () => {
    mockClip = UNDER;
    mockCloud = { text: null, delayMs: 0, calls: 0 }; // offline
    const a = open(6_000);
    await flush(6_000);
    await flush(600);
    expect(a.ends).toEqual(['timeout']); // once is a hiccup
    expect(cloudEar.deaf()).toBe(false);
    const b = open(6_000);
    await flush(6_000);
    await flush(600);
    expect(b.ends).toEqual(['deaf']);
    expect(cloudEar.deaf()).toBe(true);
  });

  it('a long window does not wait out its ninety seconds to find out', async () => {
    mockClip = UNDER;
    mockCloud = { text: null, delayMs: 0, calls: 0 };
    const { ends } = open(90_000, 'ready', true);
    await flush(2 * LISTEN_EVERY_MS + 500);
    expect(ends).toEqual(['deaf']);
    expect(mockCloud.calls).toBe(2);
  });

  it('the phone\'s own recognizer on the window: the network is gone and she is still heard — never `deaf`', async () => {
    mockOwn = true;
    mockClip = UNDER;
    mockCloud = { text: null, delayMs: 0, calls: 0 };
    for (let i = 0; i < 2; i++) {
      const w = open(6_000);
      await flush(6_000);
      await flush(600);
      expect(w.ends).toEqual(['timeout']);
    }
    const { heard, ends } = open(6_000);
    await flush();
    say('עשר');
    await flush(50);
    expect(heard).toEqual(['עשר']);
    expect(ends).toEqual(['heard']);
  });

  it('silence is not out-of-reach: a strong ear that answers with no words leaves the count at zero', async () => {
    mockClip = UNDER;
    mockCloud = { text: '', delayMs: 0, calls: 0 };
    for (let i = 0; i < 3; i++) {
      const w = open(6_000);
      await flush(6_000);
      await flush(600);
      expect(w.ends).toEqual(['timeout']);
    }
    expect(cloudEar.deaf()).toBe(false);
  });

  it('…and it heals: after its wait one window is tried, and an answer that comes ends the deafness', async () => {
    mockClip = UNDER;
    mockCloud = { text: null, delayMs: 0, calls: 0 };
    for (let i = 0; i < 2; i++) {
      open(6_000);
      await flush(6_600);
    }
    expect(cloudEar.deaf()).toBe(true);
    await flush(DEAF_RETRY_MS);
    expect(cloudEar.deaf()).toBe(false);
    mockCloud = { text: 'עשר', delayMs: 100, calls: 0 }; // the network is back
    const { heard, ends } = open(6_000);
    await flush(6_000);
    await flush(600);
    expect(heard).toEqual(['עשר']);
    expect(ends).toEqual(['heard']);
    expect(cloudEar.deaf()).toBe(false);
  });
});
