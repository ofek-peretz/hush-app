/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THREE FAILED FETCHES PAUSE THE NATURAL VOICE — THEY DO NOT END IT FOR THE WORKOUT (2026-10-05)
 *
 *   > founder: *"הקול של האימון לא נשמע טוב זה כמו 'סירי'"* … *"ובדקת בקוד שזה אמור לעבוד? הכל אמור
 *   > לעבוד חלק?"*
 *
 * `neuralVoice` gave up "until the next workout" after three failed fetches in a row — and three lines
 * are fetched at once as a workout opens. One dead corner of a gym for the seconds it takes to walk
 * through it was three failures at the same instant, and from there every line of that hour was the
 * phone's own voice: the sound he reported, from a cause the next room would have cured. Found by
 * reading the path a line takes to her ear, the day he asked whether it had been checked.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

let mockNetwork = false;
let mockCalls = 0;
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: async () => ({ exists: true }),
  makeDirectoryAsync: async () => {},
  writeAsStringAsync: async () => {},
  deleteAsync: async () => {},
}));
jest.mock('@/platform/voice/audioSession', () => ({ audioSession: { canPlayFile: () => true } }));
jest.mock('@/platform/voice/voiceCloud', () => ({
  voiceCloudReachable: () => true,
  voiceCloudLastFailure: () => ({ hear: null, say: mockNetwork ? null : 'offline' }),
  cloudSay: async () => {
    mockCalls += 1;
    return mockNetwork ? { ok: true, audio: 'UklGRg==', voice: 'openai:gpt-4o-mini-tts:marin' } : { ok: false, why: 'offline' };
  },
}));
jest.mock('@/platform/telemetry', () => ({ track: () => {} }));

type Module = typeof import('@/platform/voice/neuralVoice');
let neuralVoice: Module['neuralVoice'];
let PAUSE_MS: number;

const flush = async (ms = 0) => {
  await jest.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  mockNetwork = false;
  mockCalls = 0;
  // A phone that has never fetched a line: the module's cache, queue and counters start over.
  jest.resetModules();
  ({ neuralVoice, PAUSE_MS } = require('@/platform/voice/neuralVoice') as Module);
});
afterEach(() => jest.useRealTimers());

describe('⛔ the natural voice comes back when the network does', () => {
  it('a workout that opens in a dead corner: the three lines fetched at once fail, and fetching pauses — it is not hammered', async () => {
    neuralVoice.prefetch(['קדימה.', 'כמה חזרות?', 'מנוחה: דקה וחצי.', 'סט שני מתוך ארבעה.', 'אותו משקל.'], 'he');
    await flush();
    expect(mockCalls).toBe(3); // the burst — and nothing after it
    expect(neuralVoice.stats().failing).toBe(true);
    expect(await neuralVoice.clip('קדימה.', 'he', 4_000)).toBeNull(); // this line is the phone's own voice, now
    expect(mockCalls).toBe(3);
  });

  it('…and half a minute later, with the network back, her voice is back — in the same workout', async () => {
    neuralVoice.prefetch(['קדימה.', 'כמה חזרות?', 'מנוחה: דקה וחצי.'], 'he');
    await flush();
    expect(neuralVoice.stats().failing).toBe(true);
    mockNetwork = true; // she walked out of the corner
    await flush(PAUSE_MS - 1_000);
    expect(await neuralVoice.clip('סט אחרון.', 'he', 4_000)).toBeNull(); // still inside the pause: not even asked
    expect(mockCalls).toBe(3);
    await flush(1_100);
    const uri = neuralVoice.clip('סט אחרון.', 'he', 4_000);
    await flush();
    expect(await uri).toMatch(/coach-voice\/[0-9a-f]{16}\.wav$/);
    expect(neuralVoice.stats().failing).toBe(false);
    // …and the lines after it are fetched ahead again, as before.
    neuralVoice.prefetch(['עולים לארבעים וחמש.'], 'he');
    await flush();
    expect(mockCalls).toBe(5);
  });

  it('a network still gone after the pause is asked a little, every half-minute — never per line', async () => {
    neuralVoice.prefetch(['קדימה.', 'כמה חזרות?', 'מנוחה: דקה וחצי.'], 'he');
    await flush();
    await flush(PAUSE_MS + 100);
    const first = neuralVoice.clip('סט אחרון.', 'he', 4_000);
    await flush();
    expect(await first).toBeNull();
    expect(mockCalls).toBe(4); // one try, failed: paused again
    for (const line of ['א.', 'ב.', 'ג.', 'ד.']) expect(await neuralVoice.clip(line, 'he', 4_000)).toBeNull();
    expect(mockCalls).toBe(4);
  });
});
