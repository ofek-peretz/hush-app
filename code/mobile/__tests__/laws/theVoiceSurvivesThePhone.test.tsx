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
 * So here the REAL hook runs over the REAL session store and the REAL conductor, on a phone that
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
import { PAUSE_LISTEN_MS } from '@/platform/voice/voiceConductor';
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
  restHaptics: { arm: jest.fn(async () => {}), disarm: jest.fn(async () => {}) },
}));
jest.mock('@/platform/coach/afterSession', () => ({ askAfterSession: jest.fn(async () => ({ ok: false, reason: 'offline' })) }));
jest.mock('@/platform/voice/coachVoice', () => ({
  coachVoice: {
    available: () => true,
    say: async (text: string) => mockNote('COACH', text),
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
jest.mock('@/platform/voice/voiceCapture', () => ({
  recognizerLang: (l: string) => (l.startsWith('he') ? 'he-IL' : 'en-US'),
  voiceCapture: {
    available: () => true,
    ensurePermission: async () => mockPhone.permission,
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
/** One whole set by voice from wherever the coach stands: "מוכן", the set, the reps. */
const aSetByVoice = async (reps: string) => {
  await untilMic();
  await says('מוכן');
  await wait(26);
  await untilMic();
  await says(`${reps} חזרות`);
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
  Object.assign(mockPhone, { onGlass: true, headset: true, permission: true, micHeld: false, inCall: false, micCutByCall: false, noNetwork: false, earOpenTries: 0, window: null });
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

const CANT_HEAR = 'אני לא שומעת אותך כרגע. תסמן את הסטים במסך הנעילה או בשעון.';

describe('⛔ the screen goes dark, the app is minimised', () => {
  it('the microphone was opened at Start: a whole set, its rest and the next set run from the pocket — and the microphone is never opened twice', async () => {
    await start();
    await untilMic();
    expect(mockPhone.micHeld).toBe(true);
    await lock();
    await aSetByVoice('עשר');
    expect(rows()).toEqual(['לחיצת חזה במוט 60×10']);
    // …the rest counts down and the next set is called, with the screen still dark.
    await untilCoach('עוד עשר שניות');
    await untilCoach('סט שני מתוך שלושה');
    // He looks at the phone and puts it away again, mid-set: nothing restarts, nothing is said twice.
    const before = mockLog.length;
    await unlock();
    await minimise();
    await unlock();
    await lock();
    expect(coachSaid(before)).toEqual([]);
    await aSetByVoice('תשע');
    expect(rows()).toEqual(['לחיצת חזה במוט 60×10', 'לחיצת חזה במוט 60×9']);
    expect(mockPhone.earOpenTries).toBe(1);
    expect(mockPhone.micHeld).toBe(true);
    expect(coachSaid()).not.toContain(CANT_HEAR);
    expect([...mockPhone.keepAlive]).toContain('workout'); // the silent loop that keeps the process awake
  });

  it('the screen went dark BEFORE the microphone could open: the coach says once that she cannot hear, the lock screen carries the set — and on glass she hears again', async () => {
    await launch();
    await drive(() => V().startCoach(PLAN, 'coach_0'));
    mockPhone.onGlass = false; // Start, and the phone straight into the pocket
    await stage();
    await wait(5);
    expect(mockPhone.micHeld).toBe(false);
    expect(coachSaid().filter((l) => l === CANT_HEAR)).toHaveLength(1);
    expect(V().awaitingReady).toBe(true); // the lock screen offers Ready
    await press('Ready on the lock screen', { type: 'set_ready' });
    await wait(60);
    await press('Done on the lock screen', { type: 'complete_set', weight: 60, reps: 10 });
    expect(rows()).toEqual(['לחיצת חזה במוט 60×10']);
    expect(coachSaid().filter((l) => l === CANT_HEAR)).toHaveLength(1); // once a workout, not once a set
    // He takes the phone out during the rest: the microphone opens, and the next set is by voice.
    await unlock();
    expect(mockPhone.micHeld).toBe(true);
    await lock();
    await untilCoach('סט שני מתוך שלושה');
    await aSetByVoice('תשע');
    expect(rows()).toEqual(['לחיצת חזה במוט 60×10', 'לחיצת חזה במוט 60×9']);
  });
});

describe('⛔ the app is killed and opened again', () => {
  const comesBack = async (where: string) => {
    const before = mockLog.length;
    expect(await reopen()).toBe(true);
    await wait(5);
    const lines = coachSaid(before);
    expect(`${where}: ${lines[0]}`).toBe(`${where}: חזרתי.`);
    expect(lines.filter((l) => l.startsWith('אני המאמנת שלך')).length).toBe(0); // never the opening again
    expect(mockPhone.micHeld).toBe(true);
    expect([...mockPhone.keepAlive]).toContain('workout');
  };

  it('while the bar is being loaded — "מוכן" was never said: she is back, asks "מוכן?", and the set runs', async () => {
    await start();
    await untilMic();
    await wait(8);
    kill();
    await wait(40);
    const before = mockLog.length;
    await comesBack('loading');
    expect(coachSaid(before)).toEqual(['חזרתי.', 'מוכן?']); // not the whole load line again
    await aSetByVoice('עשר');
    expect(rows()).toEqual(['לחיצת חזה במוט 60×10']);
  });

  it('in the middle of a set — after "מוכן": she is back and the set is still his to report; nothing was written by the kill', async () => {
    await start();
    await untilMic();
    await says('מוכן');
    await wait(10);
    kill();
    await wait(30);
    const before = mockLog.length;
    await comesBack('mid-set');
    expect(coachSaid(before)).toEqual(['חזרתי.']); // the set he is in is not called a second time
    expect(rows()).toEqual([]);
    // He racks the bar five seconds after reopening the app and says his reps: they are his reps.
    await untilMic();
    await says('תשע חזרות');
    expect(rows()).toEqual(['לחיצת חזה במוט 60×9']);
  });

  it('during a rest — and again after the rest ran out while the app was dead: the set he logged is there once, and the next one is called', async () => {
    await start();
    await aSetByVoice('עשר');
    await untilCoach('מנוחה');
    await wait(20);
    kill();
    await wait(15);
    await comesBack('rest');
    expect(rows()).toEqual(['לחיצת חזה במוט 60×10']);
    await untilCoach('סט שני מתוך שלושה');
    await aSetByVoice('תשע');
    await untilCoach('מנוחה');
    kill();
    await wait(240); // long past the rest's end
    await comesBack('after the rest');
    await aSetByVoice('שמונה');
    expect(rows()).toEqual(['לחיצת חזה במוט 60×10', 'לחיצת חזה במוט 60×9', 'לחיצת חזה במוט 60×8']);
  });

  it('while paused: opening the app again IS coming back — the workout is live, and she picks the set up where it stood', async () => {
    await start();
    await untilMic();
    await wait(5);
    await says('עצור');
    expect(V().paused).toBe(true);
    kill();
    await wait(120);
    const before = mockLog.length;
    await comesBack('paused');
    expect(V().paused).toBe(false); // the store's own rule (`reconcileResume`): reopening un-freezes a pause
    expect(coachSaid(before)).toEqual(['חזרתי.', 'מוכן?']); // the load was said before the pause; only the word is asked for
    await aSetByVoice('עשר');
    expect(rows()).toEqual(['לחיצת חזה במוט 60×10']);
  });
});

describe('⛔ pause, and back', () => {
  it('in the middle of a set (the pause button; "המשך" by voice): the question waits out the pause, and the set is written only by his word', async () => {
    await start();
    await untilMic();
    await says('מוכן');
    await wait(10);
    mockNote('HE', '👆 Pause');
    await act(async () => V().pause());
    await run(10);
    expect(coachSaid().slice(-1)).toEqual(['האימון מושהה. כדי להמשיך, תגיד: המשך.']);
    await untilMic();
    const before = mockLog.length;
    await lock();
    await wait(45);
    expect(coachSaid(before)).toEqual([]); // a paused workout asks nothing
    expect(rows()).toEqual([]);
    await says('המשך');
    expect(coachSaid(before)).toEqual(['ממשיכים.']);
    await wait(20);
    expect(coachSaid(before)).toEqual(['ממשיכים.']); // …and "כמה חזרות?" does not land the moment he is back
    await untilMic();
    await says('עשר חזרות');
    expect(rows()).toEqual(['לחיצת חזה במוט 60×10']);
  });

  it('by a button, during a rest: the rest stands still, and comes back where it was — ten seconds out and all', async () => {
    await start();
    await aSetByVoice('עשר');
    await untilCoach('מנוחה');
    await wait(20);
    const left = V().restEndsAtMs! - Date.now();
    await act(async () => V().pause());
    await run(10);
    await lock();
    await wait(200);
    expect(V().displayPhase).not.toBe('SET_PRESENTED'); // the rest did not run out under the pause
    await press('Resume on the lock screen', { type: 'resume' });
    if (V().paused) {
      await act(async () => V().resume());
      await run(10);
    }
    expect(V().paused).toBe(false);
    expect(Math.abs(V().restEndsAtMs! - Date.now() - left)).toBeLessThan(2_000);
    await untilCoach('עוד עשר שניות');
    await untilCoach('סט שני מתוך שלושה');
    await aSetByVoice('תשע');
    expect(rows()).toEqual(['לחיצת חזה במוט 60×10', 'לחיצת חזה במוט 60×9']);
  });

  it('a long pause is not listened to for ever: a minute of full attention, a clear voice until five, then a button — and the voice is whole when he is back', async () => {
    await start();
    await untilMic();
    await wait(5);
    await says('עצור'); // by voice, while the bar is being loaded and she is listening
    await untilMic();
    expect(mockPhone.window.opts.patient).toBeFalsy(); // the first minute: as attentive as any question
    await wait(70);
    expect(mockPhone.window?.opts.patient).toBe(true); // after it: only a clear voice is sent anywhere
    await wait(PAUSE_LISTEN_MS / 1000);
    expect(mockPhone.window).toBeNull(); // five minutes in: nothing listens
    expect(mockPhone.micHeld).toBe(true); // …but the microphone was not let go — it could not be opened again from the pocket
    await lock();
    await wait(600);
    const before = mockLog.length;
    mockNote('HE', '👆 Resume');
    await act(async () => V().resume());
    await run(10);
    expect(coachSaid(before)).toEqual(['ממשיכים.', 'מוכן?']);
    await aSetByVoice('עשר');
    expect(rows()).toEqual(['לחיצת חזה במוט 60×10']);
  });
});

describe('⛔ earbuds that drop, a call', () => {
  it('an earbud drops out and comes back with the phone in the pocket: silent while it is out, "חזרתי" — and she still HEARS, because the microphone was kept', async () => {
    await start();
    await untilMic();
    await lock();
    await says('מוכן');
    await wait(8);
    const before = mockLog.length;
    await earbuds(false);
    await wait(20);
    expect(coachSaid(before)).toEqual([]); // not one word out of the phone's speaker
    expect(mockPhone.micHeld).toBe(true);
    await earbuds(true);
    await wait(5);
    expect(coachSaid(before)).toEqual(['חזרתי.']);
    await untilMic();
    await says('עשר חזרות');
    expect(rows()).toEqual(['לחיצת חזה במוט 60×10']);
    expect(coachSaid()).not.toContain(CANT_HEAR);
  });

  it('earbuds gone for good: the microphone is let go after the grace — the app does not hold it through a workout it is not coaching', async () => {
    await start();
    await untilMic();
    await earbuds(false);
    await wait(60);
    expect(mockPhone.micHeld).toBe(true);
    await wait(180);
    expect(mockPhone.micHeld).toBe(false);
    // …and back on glass with earbuds in, everything returns.
    await earbuds(true);
    await wait(5);
    expect(mockPhone.micHeld).toBe(true);
    await aSetByVoice('עשר');
    expect(rows()).toEqual(['לחיצת חזה במוט 60×10']);
  });

  it('a call in the pocket, mid-question: silence over the call, the microphone back when it ends, and the question asked once more', async () => {
    await start();
    await untilMic();
    await lock();
    await says('מוכן');
    await untilCoach('כמה חזרות?');
    await callBegins();
    const before = mockLog.length;
    await wait(90);
    expect(coachSaid(before)).toEqual([]);
    await callEnds(true);
    expect(mockPhone.micHeld).toBe(true);
    await untilCoach('כמה חזרות?', 30);
    await untilMic();
    await says('עשר');
    expect(rows()).toEqual(['לחיצת חזה במוט 60×10']);
  });

  it('a call iOS never reports as ended: the coach is not left mute for the workout — back on glass she takes the audio back', async () => {
    await start();
    await untilMic();
    await lock();
    await says('מוכן');
    await untilCoach('כמה חזרות?');
    await callBegins();
    await wait(60);
    await callEnds(false);
    const before = mockLog.length;
    await wait(60);
    expect(coachSaid(before)).toEqual([]); // nothing told her — she is still silent
    await unlock();
    await wait(3);
    expect(mockPhone.micHeld).toBe(true);
    await untilCoach('כמה חזרות?', 30);
    await untilMic();
    await says('עשר');
    expect(rows()).toEqual(['לחיצת חזה במוט 60×10']);
  });
});

describe('⛔ the network goes — a basement gym, a dead corner', () => {
  it('she says ONCE that she cannot hear, the lock screen carries the sets — and when the network is back she hears again, by herself, in the pocket', async () => {
    await start();
    await untilMic();
    await lock();
    await says('מוכן');
    mockPhone.noNetwork = true;
    mockNote('PHONE', 'no network');
    await untilMic();
    await says('עשר חזרות'); // he reports his set — and nothing can hear it
    await untilCoach(CANT_HEAR, 60);
    await untilCoach('סיימת? תסמן במסך הנעילה או בשעון.', 60); // the question becomes where to mark it
    await press('Done on the lock screen', { type: 'complete_set', weight: 60, reps: 10 });
    expect(rows()).toEqual(['לחיצת חזה במוט 60×10']);
    // The next set, still with no network: called and marked from the lock screen — and not one more "I cannot hear".
    await untilCoach('סט שני מתוך שלושה');
    await wait(50);
    await press('Done on the lock screen', { type: 'complete_set', weight: 60, reps: 9 });
    expect(rows()).toEqual(['לחיצת חזה במוט 60×10', 'לחיצת חזה במוט 60×9']);
    expect(coachSaid().filter((l) => l === CANT_HEAR)).toHaveLength(1);
    expect(coachSaid().filter((l) => l.startsWith('לא שמעתי'))).toEqual([]); // never blamed on him
    // He walks back up the stairs during the rest. Nothing to press, nothing to look at:
    mockPhone.noNetwork = false;
    mockNote('PHONE', 'the network is back');
    await untilCoach('סט אחרון');
    await aSetByVoice('שמונה');
    expect(rows()).toEqual(['לחיצת חזה במוט 60×10', 'לחיצת חזה במוט 60×9', 'לחיצת חזה במוט 60×8']);
    expect(mockPhone.earOpenTries).toBe(1);
  });
});
