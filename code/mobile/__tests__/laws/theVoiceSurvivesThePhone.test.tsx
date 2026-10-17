/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE VOICE SURVIVES THE PHONE — the screen going dark, the app minimised, the app killed and opened
 * again, a pause, a call, earbuds that drop and come back.
 *
 * Founder, 2026-10-05: *"ואם יוצאים מהאפליקציה רק כמזעור או יוצאים לגמרי או שהמסך נכבה מה קורה בכל אחד
 * מהמקרים? ואם המתאמן לחץ pause וחזר? חייב לבדוק את כל מקרי הקצה ולוודא שהשמע עובד בהכל."*
 *
 * Until this file nothing ran `useVoiceCoach` at all: the conductor was walked on a fake ear, and the
 * hook that ties it to the phone — the gate, the microphone opened on glass, the app's state, the
 * earbuds, a call, what survives a killed app — was read as text by a few regex laws and trusted.
 * Every one of his questions is a question about that hook.
 *
 * ⛔ SINCE 2026-10-17 THE COACH ON THE STAGE IS THE QUIET COACH (founder: *"מה שטוב: … עוד 10 שניות …
 * הצליל … בסיום האימון לתת פידבק חיובי מסוים וזהו"*): ten seconds before a rest ends (the next lift
 * named at a crossing), the bell, a plank the same way, and one sentence at the end. Every walk below
 * is his list of questions asked of THAT coach, on the product as it ships: no microphone at all.
 *
 * So here the REAL hook runs over the REAL session store and the REAL quiet coach, on a phone that
 * behaves as iOS does where it matters:
 *   · a recording cannot START while the app is not on glass (`earOpen` refuses);
 *   · a microphone that was started on glass keeps running in the pocket;
 *   · without one, a window opened from the pocket ends at once as `locked`;
 *   · a call stops the microphone and nothing but the app starts it again;
 *   · a killed app runs no cleanup, keeps no timer, and comes back from what was written to disk.
 *
 * `LIFECYCLE_OUT=<file>` writes every walk's transcript.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { AppContext } from '@/state/stores/appStore';
import { SessionProvider, useSession, type SessionView } from '@/state/stores/sessionStore';
import { useVoiceCoach } from '@/platform/voice/useVoiceCoach';
import { initI18n, setLocale } from '@/i18n';
import { db } from '@/data/local/db';
import { exerciseDisplayName } from '@/data/exercises';
import type { PlannedSession } from '@/domain/coachPlan';

/** The phone. Everything iOS decides is decided here. */
const mockPhone = {
  onGlass: true,
  headset: true,
  permission: true,
  /** The workout's microphone is running (started on glass, kept in the pocket). */
  micHeld: false,
  /** A call holds the audio: nothing of ours can start. */
  inCall: false,
  /** A call stopped the microphone; only the app can start it again. */
  micCutByCall: false,
  /** The strong ear cannot be reached — and this phone has no recognizer of its own (`cloudEar.deaf`). */
  noNetwork: false,
  /** What the rest-over alert was last told: the voice will say it (true) or nobody will (false). */
  voiceCallsTheSet: false,
  /**
   * The workout holds a microphone (`platform/voice/workoutMicrophone`). ⛔ The product ships with
   * this OFF since 2026-10-10 — on his phone a held microphone stops his music — and that product is
   * walked in the last block of this file. It is ON for every walk above it: the microphone's own
   * code is kept, and kept honest, for the day a phone shows a way for it to live with her music.
   */
  holdsMic: true,
  /** Times she was asked for the microphone. */
  permissionAsks: 0,
  /**
   * How long a line takes to say. Zero everywhere but the last block: a real line takes two to five
   * seconds, and a thumb is faster than that — which is the only way a queued line can go stale.
   */
  lineMs: 0,
  earOpenTries: 0,
  window: null as any,
  route: new Set<any>(),
  earState: new Set<any>(),
  interruption: new Set<any>(),
  appState: new Set<any>(),
  keepAlive: new Set<string>(),
};
const mockLog: string[] = [];
let mockT0 = 0;
const mockStamp = () => {
  const s = Math.round((Date.now() - mockT0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const mockNote = (who: string, what: string) => void mockLog.push(`${mockStamp()}  ${who.padEnd(5)}  ${what}`);

jest.mock('@/platform/restHaptics', () => ({
  REST_WARNING_LEAD_S: 7,
  phoneOwnsRestHaptics: () => true,
  restAlertDelays: () => ({ warnInS: null, doneInS: null }),
  // Who says the rest is over: the hook tells the alert whenever the voice comes on or goes quiet.
  restHaptics: { arm: jest.fn(async () => {}), disarm: jest.fn(async () => {}), voiceCallsTheSet: (on: boolean) => void (mockPhone.voiceCallsTheSet = on) },
}));
jest.mock('@/platform/coach/afterSession', () => ({ askAfterSession: jest.fn(async () => ({ ok: false, reason: 'offline' })) }));
jest.mock('@/platform/voice/coachVoice', () => ({
  coachVoice: {
    available: () => true,
    // Written down when the line ENDS, as the phone's own journal writes it.
    say: async (text: string) => {
      if (mockPhone.lineMs > 0) await new Promise((r) => setTimeout(r, mockPhone.lineMs));
      mockNote('COACH', text);
    },
    interrupt: () => {},
    warm: () => {},
    lastLine: () => null,
  },
}));
jest.mock('@/platform/voice/neuralVoice', () => ({ neuralVoice: { setVoice() {}, enabled: () => false, reset() {}, prefetch() {} } }));
jest.mock('@/platform/voice/cloudEar', () => ({ cloudEar: { setEnabled() {}, available: () => true, deaf: () => mockPhone.noNetwork, reset() {} } }));
jest.mock('@/platform/voice/audioSession', () => ({
  audioSession: {
    available: () => true,
    headsetConnected: () => mockPhone.headset,
    onRouteChange: (cb: any) => (mockPhone.route.add(cb), () => mockPhone.route.delete(cb)),
    onInterruption: (cb: any) => (mockPhone.interruption.add(cb), () => mockPhone.interruption.delete(cb)),
    onEarState: (cb: any) => (mockPhone.earState.add(cb), () => mockPhone.earState.delete(cb)),
    onEarResult: () => () => {},
    holdKeepAlive: async (owner: string) => void mockPhone.keepAlive.add(owner),
    releaseKeepAlive: async (owner: string) => void mockPhone.keepAlive.delete(owner),
    duck: async () => {},
    unduck: async () => {},
    playChime: async () => mockNote('CHIME', ''),
    prepareListening: async () => {},
    earAvailable: async () => false, // no recognizer of the phone's own: the strong ear alone
    earPrepare: async () => false,
    // ⛔ iOS: a recording cannot START unless the app is on glass — and not during a call.
    earOpen: async () => {
      mockPhone.earOpenTries += 1;
      if (!mockPhone.onGlass) return 'cannotStartRecording';
      if (mockPhone.inCall) return 'insufficientPriority';
      if (!mockPhone.micHeld) mockNote('PHONE', 'microphone opened');
      mockPhone.micHeld = true;
      mockPhone.micCutByCall = false;
      return null;
    },
    earClose: async () => {
      if (mockPhone.micHeld) mockNote('PHONE', 'microphone closed');
      mockPhone.micHeld = false;
    },
    earRunning: () => mockPhone.micHeld,
    // The session taken back after an interruption that never said it ended (`HushVoiceAudioModule`).
    recoverSession: async () => {
      if (mockPhone.inCall) return false;
      if (mockPhone.micCutByCall) {
        mockPhone.micCutByCall = false;
        mockPhone.micHeld = true;
        mockNote('PHONE', 'microphone back');
      }
      return true;
    },
    routeInfo: () => ({ outputs: [], category: '', mode: '' }),
    canPlayFile: () => false,
  },
}));
jest.mock('@/platform/voice/workoutMicrophone', () => ({ workoutHoldsMicrophone: () => mockPhone.holdsMic }));
jest.mock('@/platform/voice/voiceCapture', () => ({
  recognizerLang: (l: string) => (l.startsWith('he') ? 'he-IL' : 'en-US'),
  voiceCapture: {
    available: () => true,
    ensurePermission: async () => {
      mockPhone.permissionAsks += 1;
      return mockPhone.permission;
    },
    askAtStart: async () => {},
    lastLevels: () => null,
    /*
     * The real seam's three roads (`voiceCapture.open`): the held microphone answers anywhere; without
     * it a window opens only on glass; from the pocket it ends at once as `locked`.
     */
    open: (opts: any) => {
      let done = false;
      let timer: any = null;
      let w: any = null;
      const end = (why: string) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (w && mockPhone.window === w) mockPhone.window = null;
        opts.onEnd(why);
      };
      if (!mockPhone.micHeld && !mockPhone.onGlass) {
        const t = setTimeout(() => end('locked'), 0);
        return { close: () => (clearTimeout(t), end('closed')), hold() {}, extend() {} };
      }
      w = { opts, end, road: mockPhone.micHeld ? 'pocket' : 'glass' };
      mockPhone.window = w;
      mockNote('MIC', `listens · ${Math.round(opts.ms / 1000)}s · ${opts.expect}${opts.patient ? ' · clear voice only' : ''}`);
      // Out of reach: the real window learns it from two unanswered sends — at its end, or eight seconds into a long one.
      timer = setTimeout(() => end(mockPhone.noNetwork ? 'deaf' : 'timeout'), mockPhone.noNetwork ? Math.min(opts.ms, 8_000) : opts.ms);
      return {
        close: () => end('closed'),
        hold: () => {
          if (timer) clearTimeout(timer);
          timer = null;
        },
        extend: (ms: number) => {
          if (done) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => end('timeout'), ms);
        },
      };
    },
  },
}));

const appFixture = {
  booted: true,
  profile: { id: 'p1', name: 'Ofek', sex: 'male', units: 'kg', weightKg: 80, bodyMap: {}, repBandByMuscle: {} },
  program: null,
  sessions: [],
  entitlement: { status: 'trial', sessionsUsed: 0 },
  model: {},
  modeState: { completedSessions: 0 },
  recordSessionCompleted: async () => ({ unlockedPortrait: false }),
  markWorkoutCompleted: async () => {},
  refreshProgram: async () => {},
} as any;

const BENCH = 'bb_bench_press';
const ROW = 'cable_row';
const PLAN: PlannedSession = {
  name: 'Upper A',
  blocks: [
    { rounds: 3, restS: 90, items: [{ kind: 'reps', ex: BENCH, load: 60, reps: [8, 10] }] },
    { rounds: 2, restS: 60, items: [{ kind: 'reps', ex: ROW, load: 40, reps: [10, 12] }] },
  ],
};

// ── One process of the app ───────────────────────────────────────────────────────────────────────

let view: SessionView | null = null;
let root: any = null;
const V = () => view!;
function Probe() {
  view = useSession();
  return null;
}
/**
 * The session screen: where the voice lives (`SessionFlow`) — and where a rest ENDS. The store never
 * ends a rest by itself: the rest screen ticks once a second and calls `endRest` at zero (and holds
 * still while paused). With the process kept awake that tick runs in the pocket too; it is repeated
 * here as the screen does it, or no rest in this file would ever end.
 */
function Stage() {
  const session = useSession();
  useVoiceCoach(session);
  const [, tick] = React.useState(0);
  const resting = session.displayPhase === 'REST_INTER' || session.displayPhase === 'REST_TRANSITION';
  React.useEffect(() => {
    if (!resting || session.paused) return;
    if (session.restEndsAtMs != null && Date.now() >= session.restEndsAtMs) return void session.endRest();
    const id = setTimeout(() => tick((n) => n + 1), 1000);
    return () => clearTimeout(id);
  });
  return null;
}
const tree = (stage: boolean) => (
  <AppContext.Provider value={appFixture}>
    <SessionProvider>
      <Probe />
      {stage ? <Stage /> : null}
    </SessionProvider>
  </AppContext.Provider>
);

const run = async (ms = 0) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};
/** A verb of the store that waits on its own zero-length timers: the clock is nudged until it returns. */
const drive = async <T,>(verb: () => Promise<T>): Promise<T> => {
  let out: T;
  await act(async () => {
    let done = false;
    const p = Promise.resolve(verb()).then((r) => {
      out = r;
      done = true;
    });
    for (let i = 0; i < 200 && !done; i++) await jest.advanceTimersByTimeAsync(1);
    await p;
  });
  return out!;
};
const wait = (s: number) => run(s * 1000);

/** The app is opened: a fresh process. */
async function launch() {
  view = null;
  act(() => {
    root = renderer.create(tree(false));
  });
  await run(10);
}
/** The session screen comes up (after Start, or after a workout was resumed from disk). */
async function stage() {
  act(() => root.update(tree(true)));
  await run(10);
}
/** Start from Today: the workout begins and the session screen opens. */
async function start() {
  await launch();
  await drive(() => V().startCoach(PLAN, 'coach_0'));
  await stage();
}
/**
 * The app is KILLED (swiped away, or taken by iOS): no cleanup runs, every timer dies, the microphone
 * and the silent loop die with the process. What is on disk stays.
 */
function kill() {
  mockNote('PHONE', '✂ the app is killed');
  // Every timer of the dead process goes — and the wall clock stays where it was (clearing jest's
  // timers also rewinds its clock to the moment the fake clock was installed).
  const at = Date.now();
  jest.clearAllTimers();
  jest.setSystemTime(at);
  for (const set of [mockPhone.route, mockPhone.earState, mockPhone.interruption, mockPhone.appState]) set.clear();
  mockPhone.keepAlive.clear();
  mockPhone.micHeld = false;
  mockPhone.micCutByCall = false;
  mockPhone.window = null;
  root = null; // never unmounted: a dead process says no goodbyes
}
/** …and opened again: `Root`'s own road — a workout on disk is resumed, then its screen opens. */
async function reopen() {
  mockPhone.onGlass = true;
  mockNote('PHONE', 'the app is opened again');
  await launch();
  const ok = await drive(async () => (await V().loadResumable()) != null && (await V().resumeSaved()));
  if (!ok) return false;
  await stage();
  return true;
}

const appState = async (on: boolean, how: string) => {
  mockPhone.onGlass = on;
  mockNote('PHONE', how);
  // A window on the screen-on ear dies with the screen (Apple's recognizer does not run in the background).
  if (!on && mockPhone.window?.road === 'glass') mockPhone.window.end('error');
  await act(async () => {
    for (const cb of [...mockPhone.appState]) cb(on ? 'active' : 'background');
    await jest.advanceTimersByTimeAsync(0);
  });
  await run(10);
};
const lock = () => appState(false, 'the screen goes dark');
const minimise = () => appState(false, 'the app is minimised');
const unlock = () => appState(true, 'back on glass');

const earbuds = async (on: boolean) => {
  mockPhone.headset = on;
  mockNote('PHONE', on ? 'earbuds back' : 'earbuds out');
  await act(async () => {
    for (const cb of [...mockPhone.route]) cb(on);
    await jest.advanceTimersByTimeAsync(0);
  });
  await run(10);
};
/** A call: iOS interrupts the session and stops the microphone; `ended` true → iOS says when it is over. */
const callBegins = async () => {
  mockPhone.inCall = true;
  mockNote('PHONE', 'a call');
  if (mockPhone.micHeld) {
    mockPhone.micHeld = false;
    mockPhone.micCutByCall = true;
  }
  await act(async () => {
    for (const cb of [...mockPhone.interruption]) cb(true);
    await jest.advanceTimersByTimeAsync(0);
  });
};
const callEnds = async (told: boolean) => {
  mockPhone.inCall = false;
  mockNote('PHONE', told ? 'the call ends' : 'the call ends — and iOS never says so');
  if (!told) return;
  // The native observer's own order: the microphone is started again, then JS is told.
  if (mockPhone.micCutByCall) {
    mockPhone.micCutByCall = false;
    mockPhone.micHeld = true;
  }
  await act(async () => {
    for (const cb of [...mockPhone.interruption]) cb(false);
    await jest.advanceTimersByTimeAsync(0);
  });
  await run(10);
};

const says = async (text: string) => {
  const w = mockPhone.window;
  if (!w) throw new Error(`he said "${text}" and nothing was listening (${mockStamp()})\n${mockLog.slice(-12).join('\n')}`);
  mockNote('HE', `"${text}"`);
  if (mockPhone.noNetwork) return; // said into a microphone nothing can hear through
  await act(async () => {
    if (!w.opts.onSentence(text, 0.92)) w.end('heard');
    await jest.advanceTimersByTimeAsync(0);
  });
  await run(10);
};
const press = async (what: string, intent: Record<string, unknown>) => {
  mockNote('HE', `👆 ${what}`);
  await drive(() => V().applyLockIntents([{ id: `lk${mockLog.length}`, atMs: Date.now(), ...intent }]));
  await run(10);
};
const coachSaid = (from = 0) => mockLog.slice(from).filter((l) => l.includes('  COACH  ')).map((l) => l.split('  COACH  ')[1]);
/** Let the clock run until the coach says a line containing `part` — or fail with the transcript. */
const untilCoach = async (part: string, maxS = 400) => {
  const from = mockLog.length;
  for (let i = 0; i < maxS * 2; i++) {
    if (coachSaid(from).some((l) => l.includes(part))) return;
    await run(500);
  }
  throw new Error(`the coach never said "${part}" (${mockStamp()})\n${mockLog.slice(-16).join('\n')}`);
};
const untilMic = async (maxS = 400) => {
  for (let i = 0; i < maxS * 2 && !mockPhone.window; i++) await run(500);
  if (!mockPhone.window) throw new Error(`nothing ever listened (${mockStamp()})\n${mockLog.slice(-16).join('\n')}`);
};
const rows = () => V().loggedSets.map((r) => `${exerciseDisplayName(r.exerciseId)} ${r.actualWeight}×${r.actualReps}`);
/** The coach is listening for the SET — his report, or the answer to "כמה חזרות?" — not for a rest's word, and not for a correction. */
const untilSetMic = async (maxS = 400) => {
  const forTheSet = () => {
    const o = mockPhone.window?.opts;
    return !!o && (o.expect === 'set' || (o.expect === 'reps' && o.ms > 3_000));
  };
  for (let i = 0; i < maxS * 2 && !forTheSet(); i++) await run(500);
  if (!forTheSet()) throw new Error(`nothing ever listened for the set (${mockStamp()})\n${mockLog.slice(-16).join('\n')}`);
};
/** One whole set by voice from wherever the coach stands: he lifts, and says his reps. (Nobody says "מוכן" — 2026-10-06.) */
const aSetByVoice = async (reps: string) => {
  await untilSetMic();
  await says(`${reps} חזרות`);
};
/** The echo's three seconds pass, and the rest is under way (nothing is said to mark it any more). */
const intoTheRest = async () => {
  await wait(4);
  expect(V().displayPhase).toMatch(/^REST_/);
};

const transcripts: string[] = [];
jest.setTimeout(120_000);
beforeAll(async () => {
  await initI18n();
  await setLocale('he');
});
beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-05T07:00:00Z'));
  mockT0 = Date.now();
  mockLog.length = 0;
  Object.assign(mockPhone, { onGlass: true, headset: true, permission: true, micHeld: false, inCall: false, micCutByCall: false, noNetwork: false, voiceCallsTheSet: false, holdsMic: false, permissionAsks: 0, lineMs: 0, earOpenTries: 0, window: null });
  appFixture.profile.voiceMic = undefined;
  for (const set of [mockPhone.route, mockPhone.earState, mockPhone.interruption, mockPhone.appState, mockPhone.keepAlive]) set.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_t: string, cb: any) => {
    mockPhone.appState.add(cb);
    return { remove: () => mockPhone.appState.delete(cb) } as never;
  });
  Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => (mockPhone.onGlass ? 'active' : 'background') });
  await db.clearAll();
});
afterEach(() => {
  transcripts.push(`\n══ ${expect.getState().currentTestName} ══\n${mockLog.join('\n')}`);
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});
afterAll(() => {
  if (process.env.LIFECYCLE_OUT) require('node:fs').writeFileSync(process.env.LIFECYCLE_OUT, transcripts.join('\n'), 'utf8');
});

const TEN = 'עוד עשר שניות.';
const chimes = (from = 0) => mockLog.slice(from).filter((l) => l.includes('  CHIME  ')).length;
/** Nothing in the workout ever listened, and nobody was asked for a microphone. */
const heardNothing = () => [
  ...(mockPhone.earOpenTries ? [`earOpen ×${mockPhone.earOpenTries}`] : []),
  ...(mockPhone.permissionAsks ? [`permission ×${mockPhone.permissionAsks}`] : []),
  ...(mockPhone.window ? ['a window is open'] : []),
];
/** Done on the lock screen, as written. */
const done = () => press('Done on the lock screen', { type: 'complete_set' });
/** Let the clock run to `s` seconds before the rest's own end. */
const toBeforeRestEnd = async (s: number) => {
  const end = V().restEndsAtMs!;
  await run(Math.max(0, end - s * 1000 - Date.now()));
};

const PLANK: PlannedSession = {
  name: 'Core',
  blocks: [
    { rounds: 1, restS: 60, items: [{ kind: 'reps', ex: BENCH, load: 60, reps: [8, 10] }] },
    { rounds: 1, items: [{ kind: 'time', ex: 'plank', seconds: 45 }] },
  ],
};

describe('⛔ the quiet coach: ten seconds, the bell, and one sentence — nothing else (founder-approved 2026-10-17)', () => {
  it('a whole workout from the pocket: in every rest "ten seconds" and the bell, the next lift named at the crossing, one sentence at the end — and nothing listens', async () => {
    await start();
    await lock();
    expect(coachSaid()).toEqual([]); // nothing at the start
    for (let set = 1; set <= 3; set++) {
      await done();
      const before = mockLog.length;
      await toBeforeRestEnd(11);
      expect(coachSaid(before)).toEqual([]); // the rest itself is silent
      await wait(12);
      const said = coachSaid(before);
      expect(said).toHaveLength(1);
      expect(said[0] === TEN || said[0].startsWith('עוד עשר שניות. הבא: ')).toBe(true);
      if (set === 3) expect(said[0]).toBe(`עוד עשר שניות. הבא: ${exerciseDisplayName(ROW)}.`); // the crossing names the row
      else expect(said[0]).toBe(TEN);
      expect(chimes(before)).toBe(1);
    }
    await done();
    const rowRest = mockLog.length;
    await toBeforeRestEnd(0);
    expect(chimes(rowRest)).toBe(1); // AT the rest's end, by its own clock — not when the stage gets to it
    await wait(2);
    await done(); // the last set closes the workout
    await wait(5);
    expect(coachSaid().slice(-1)).toEqual(['כל הכבוד. עמדת ביעד בכל הסטים בשני תרגילים.']);
    expect(coachSaid().filter((l) => l.startsWith('כל הכבוד'))).toHaveLength(1);
    expect(mockPhone.voiceCallsTheSet).toBe(true); // the rest-over banner knows the voice rings it
    expect(heardNothing()).toEqual([]);
  });

  it('the rest cut short from the lock screen: no bell — she is already moving; +15 moves the ten seconds with it', async () => {
    await start();
    await lock();
    await done();
    const end = V().restEndsAtMs!;
    await press('+15 on the lock screen', { type: 'add_rest' });
    expect(V().restEndsAtMs).toBe(end + 15_000);
    const before = mockLog.length;
    await run(end - 10_000 - Date.now() + 500);
    expect(coachSaid(before)).toEqual([]); // the old ten-seconds mark is not the end any more
    await run(15_000);
    expect(coachSaid(before)).toEqual([TEN]);
    await press('Next set on the lock screen', { type: 'end_rest' });
    expect(V().displayPhase).toBe('SET_PRESENTED');
    expect(chimes(before)).toBe(0);
  });

  it('a plank: Ready on the lock screen starts it from the pocket, ten seconds before its end, and the bell at zero — zero writes nothing', async () => {
    await launch();
    await drive(() => V().startCoach(PLANK, 'coach_0'));
    await stage();
    await lock();
    await done();
    await run(V().restEndsAtMs! - Date.now() + 1_500); // the rest runs out (and rings)
    expect(V().currentExerciseId).toBe('plank');
    const before = mockLog.length;
    await press('Ready on the lock screen', { type: 'set_ready' });
    const end = V().holdEndsAtMs!;
    expect(end).toBeGreaterThan(Date.now());
    await run(end - Date.now() - 9_000);
    expect(coachSaid(before)).toEqual([TEN]);
    await run(9_500);
    expect(chimes(before)).toBe(1);
    expect(V().currentExerciseId).toBe('plank'); // her Done finishes it, not the clock
    expect(heardNothing()).toEqual([]);
  });
});

describe('⛔ the screen goes dark, the app is minimised', () => {
  it('minimised through a whole rest: the ten seconds and the bell are said in his ears — and back on glass nothing is said again', async () => {
    await start();
    await done();
    await minimise();
    const before = mockLog.length;
    await toBeforeRestEnd(9);
    expect(coachSaid(before)).toEqual([TEN]);
    await wait(10);
    expect(chimes(before)).toBe(1);
    await unlock();
    await wait(5);
    expect(coachSaid(before)).toEqual([TEN]);
  });
});

describe('⛔ the app is killed and opened again', () => {
  it('during a rest, before its ten seconds: opened again, the ten seconds land on the rest\'s own end, once — no "חזרתי", nothing replayed', async () => {
    await start();
    await lock();
    await done();
    const end = V().restEndsAtMs!;
    await wait(30);
    kill();
    await run(20_000);
    expect(await reopen()).toBe(true);
    const before = mockLog.length;
    await run(end - Date.now() + 1_500);
    expect(coachSaid(before)).toEqual([TEN]);
    expect(chimes(before)).toBe(1);
    expect(coachSaid()).toEqual([TEN]);
    expect(rows()).toEqual(['לחיצת חזה במוט 60×8']);
  });

  it('the rest ran out while the app was dead: opened again, no bell for a rest that is long over, and nothing is said', async () => {
    await start();
    await lock();
    await done();
    kill();
    await run(5 * 60_000);
    expect(await reopen()).toBe(true);
    await wait(5);
    expect(coachSaid()).toEqual([]);
    expect(chimes()).toBe(0);
  });
});

describe('⛔ pause, and back', () => {
  it('a pause in the rest: nothing is said while it stands; back, the ten seconds and the bell come at the rest\'s moved end', async () => {
    await start();
    await done();
    await wait(30);
    await drive(() => V().pause());
    const before = mockLog.length;
    await wait(180);
    expect(coachSaid(before)).toEqual([]);
    expect(chimes(before)).toBe(0);
    await drive(() => V().resume());
    await toBeforeRestEnd(9);
    expect(coachSaid(before)).toEqual([TEN]);
    await wait(10);
    expect(chimes(before)).toBe(1);
  });
});

describe('⛔ earbuds that drop, a call', () => {
  it('an earbud drops out mid-rest and comes back: silent while out, the ten seconds still on time — and no "חזרתי"', async () => {
    await start();
    await lock();
    await done();
    await wait(20);
    await earbuds(false);
    await wait(5);
    expect(mockPhone.voiceCallsTheSet).toBe(false); // the banner says the rest is over while the voice cannot
    await earbuds(true);
    const before = mockLog.length;
    await toBeforeRestEnd(9);
    expect(coachSaid(before)).toEqual([TEN]);
    await wait(10);
    expect(chimes(before)).toBe(1);
    expect(coachSaid()).toEqual([TEN]);
  });

  it('earbuds out through the end of the rest: no bell — the banner is hers', async () => {
    await start();
    await lock();
    await done();
    await earbuds(false);
    await wait(120);
    expect(chimes()).toBe(0);
    expect(coachSaid()).toEqual([]);
    expect(mockPhone.voiceCallsTheSet).toBe(false);
  });

  it('a call over the ten seconds: nothing said over it; the rest ended during it — so no bell after it', async () => {
    await start();
    await lock();
    await done();
    await toBeforeRestEnd(12);
    await callBegins();
    await wait(30); // the ten seconds and the rest's end pass during the call
    await callEnds(true);
    await wait(5);
    expect(coachSaid()).toEqual([]);
    expect(chimes()).toBe(0);
    // …and the next rest is counted as ever.
    await done();
    await toBeforeRestEnd(9);
    expect(coachSaid()).toEqual([TEN]);
  });

  it('a call iOS never reports as ended: back on glass the audio is taken back, and the next rest is counted', async () => {
    await start();
    await done();
    await callBegins();
    await callEnds(false);
    await wait(120);
    await lock();
    await unlock();
    await wait(1);
    if (V().displayPhase !== 'SET_PRESENTED') await press('Next set', { type: 'end_rest' });
    await done();
    const before = mockLog.length;
    await toBeforeRestEnd(9);
    expect(coachSaid(before)).toEqual([TEN]);
  });
});

describe('⛔ a line that is no longer true is not said', () => {
  it('a rest she ends inside its last ten seconds before the line had its turn: the line is not said late into the set', async () => {
    await start();
    await lock();
    await done();
    await toBeforeRestEnd(12);
    await press('Next set on the lock screen', { type: 'end_rest' });
    await wait(20);
    expect(coachSaid()).toEqual([]);
    expect(chimes()).toBe(0);
  });
});
