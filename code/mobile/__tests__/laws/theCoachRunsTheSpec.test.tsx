/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH RUNS THE SPEC.
 *
 * docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md §3, walked end to end on the REAL session store with
 * a fake mouth, a fake ear and a fake clock: what is said, in which order, which question is open,
 * what one word or one number does to the session, and what silence does. The founder's condition
 * (2026-09-08): *"בנה את זה בדיוק לפי כל מה שסיכמנו ואל תסטה מילימטר."* — so every expectation here
 * is a line or a rule of that document, cited.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { AppContext } from '@/state/stores/appStore';
import { SessionProvider, useSession, restAfterStep, type SessionView } from '@/state/stores/sessionStore';
import { fixedLines, voiceLinesAhead } from '@/domain/voiceLinesAhead';
import { spokenRest } from '@/domain/voiceScript';
import { initI18n, setLocale } from '@/i18n';
import { db } from '@/data/local/db';
import { voiceAskAfterS, voiceReportFromS } from '@/domain/setDwell';
import { VoiceConductor, WINDOWS, REPORT_SETTLE_MS, FIRST_SET_SETUP_S } from '@/platform/voice/voiceConductor';
import type { PlannedSession } from '@/domain/coachPlan';

jest.mock('@/platform/restHaptics', () => ({
  REST_WARNING_LEAD_S: 7,
  phoneOwnsRestHaptics: () => true,
  restAlertDelays: () => ({ warnInS: null, doneInS: null }),
  restHaptics: { arm: jest.fn(async () => {}), disarm: jest.fn(async () => {}) },
}));
jest.mock('@/platform/coach/afterSession', () => ({
  askAfterSession: jest.fn(async () => ({ ok: false, reason: 'offline' })),
}));

const BENCH = 'bb_bench_press';
const ROW = 'cable_row';
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
} as unknown as React.ContextType<typeof AppContext>;

const PLAN: PlannedSession = {
  name: 'Upper A',
  blocks: [
    { rounds: 3, items: [{ kind: 'reps', ex: BENCH, load: 60, reps: [8, 10] }] },
    { rounds: 2, items: [{ kind: 'reps', ex: ROW, load: 40, reps: [10, 12] }] },
  ],
};

/** The wall clock, in our hands. */
let now = 1_800_000_000_000;
const clock = jest.spyOn(Date, 'now');
let wake: ((s: string) => void) | null = null;

/** The conductor's own timers, fired by hand. */
type Timer = { at: number; f: () => void; id: number };
let timers: Timer[] = [];
let timerId = 0;

/** What was said, and the ear's open window. */
let said: string[] = [];
let ear: { onSentence: (t: string, c: number | null) => boolean; onEnd: (why: string) => void; ms: number } | null = null;
let earLog: number[] = [];
/** What each window told the second ear the question expects (`cloudEar`). */
let expectLog: string[] = [];
/** How each window was asked to listen: patient — only a clear voice is sent anywhere. */
let listenLog: { expect: string; ms: number; patient: boolean }[] = [];
/** How many times the rest's bell rang. */
let chimes = 0;

const mouth = {
  say: async (text: string) => {
    said.push(text);
  },
  interrupt: () => {},
};
const fakeEar = {
  open: (opts) => {
    ear = { onSentence: opts.onSentence, onEnd: opts.onEnd, ms: opts.ms };
    earLog.push(opts.ms);
    expectLog.push(opts.expect ?? 'none');
    listenLog.push({ expect: opts.expect ?? 'none', ms: opts.ms, patient: !!opts.patient });
    return {
      close: () => {
        if (ear && ear.onEnd === opts.onEnd) {
          const e = ear;
          ear = null;
          e.onEnd('closed');
        }
      },
      /*
       * ⛔ HELD AND EXTENDED, AS THE REAL EAR IS (2026-09-27). Without these the conductor took a
       * different road here than on the phone (`reopen` closed and reopened instead of holding) — and
       * the one bug that lived only on the phone's road (the loading window answering "נכון?") passed.
       */
      hold: () => {},
      extend: (ms: number) => {
        if (ear && ear.onEnd === opts.onEnd) {
          ear.ms = ms;
          earLog.push(ms);
        }
      },
    };
  },
};
const audio = { duck: async () => {}, unduck: async () => {}, playChime: async () => void (chimes += 1) };
/** The rest line as the voice says it — the store's rest, rounded to the quarter minute (2026-09-27). */
const restLine = (v: SessionView) => `מנוחה: ${spokenRest(v.restSeconds, { locale: 'he', units: 'kg' })}.`;
const NOT_HEARD = 'לא שמעתי. כמה חזרות? אפשר גם לסמן במסך הנעילה או בשעון.';

beforeAll(async () => {
  await initI18n();
  await setLocale('he');
});
beforeEach(async () => {
  await db.clearAll();
  now = 1_800_000_000_000;
  clock.mockImplementation(() => now);
  wake = null;
  timers = [];
  said = [];
  ear = null;
  earLog = [];
  expectLog = [];
  listenLog = [];
  chimes = 0;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type: string, cb: (s: string) => void) => {
    wake = cb;
    return { remove() {} } as never;
  });
});
afterAll(() => clock.mockRestore());

/**
 * `free`: the phone's own microphone is held for the workout (the shipping default) — see `nextSet`.
 * `verdict`: Loop 1 inside the workout and its line — OFF in the app since 2026-10-06 (`verdictFor`);
 * the laws that still walk that mechanism ask for it.
 */
function harness(opts: { free?: boolean; verdict?: boolean } = {}) {
  let view: SessionView | null = null;
  function Probe() {
    view = useSession();
    return null;
  }
  act(() => {
    renderer.create(
      <AppContext.Provider value={appFixture}>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </AppContext.Provider>,
    );
  });
  const getView = () => view!;
  const c = new VoiceConductor({
    mouth,
    ear: fakeEar,
    audio,
    now: () => now,
    setTimeout: (f, ms) => {
      const id = ++timerId;
      timers.push({ at: now + ms, f, id });
      return id;
    },
    clearTimeout: (id) => {
      timers = timers.filter((t) => t.id !== id);
    },
    getView,
    locale: () => ({ locale: 'he', units: 'kg' }),
    firstSessionEver: () => true,
    ...(opts.free ? { earIsFree: () => true } : {}),
    ...(opts.verdict ? { verdictInWorkout: true } : {}),
  });
  return { view: getView, c };
}

/** Let promises settle and the store re-render. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** Move the clock; fire the conductor's due timers in order; let the store notice. */
async function advance(ms: number, c: VoiceConductor, view: () => SessionView) {
  const target = now + ms;
  for (;;) {
    const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    now = due.at;
    timers = timers.filter((t) => t.id !== due.id);
    due.f();
    await settle();
    c.observe(view());
    await settle();
  }
  now = target;
  await act(async () => {
    wake?.('active');
    await new Promise((r) => setTimeout(r, 0));
  });
  c.observe(view());
  await settle();
}

async function hear(text: string, c: VoiceConductor, view: () => SessionView, confidence: number | null = 0.9) {
  expect(ear).not.toBeNull();
  await act(async () => {
    const e = ear!;
    const keep = e.onSentence(text, confidence);
    // The conductor may have closed the window itself (its close() calls onEnd('closed')).
    if (!keep && ear === e) {
      ear = null;
      e.onEnd('heard');
    }
    await new Promise((r) => setTimeout(r, 0));
  });
  await settle();
  c.observe(view());
  await settle();
}

/**
 * The set on stage is under way. Since 2026-10-06 nobody says "מוכן": a set is hers from its call, and
 * the coach's clock for it starts after the moment a lift's first set is given to get under the bar
 * (`FIRST_SET_SETUP_S`). This lets that moment pass, so the set's own time is counted from here.
 */
async function underWay(c: VoiceConductor, view: () => SessionView) {
  await advance(FIRST_SET_SETUP_S * 1000, c, view);
}

async function silence(c: VoiceConductor, view: () => SessionView) {
  expect(ear).not.toBeNull();
  await act(async () => {
    const e = ear!;
    ear = null;
    e.onEnd('timeout');
    await new Promise((r) => setTimeout(r, 0));
  });
  await settle();
  c.observe(view());
  await settle();
}

async function start(c: VoiceConductor, view: () => SessionView, plan: PlannedSession = PLAN) {
  c.enable();
  await act(async () => view().startCoach(plan, 'coach_0'));
  await settle();
  c.observe(view());
  await settle();
}

describe('⛔ the coach runs the spec', () => {
  it('§3.1: the opening, the lift called — and the set is simply hers: no Ready anywhere, nothing asked, the question at the set\'s own time', async () => {
    const { view, c } = harness();
    await start(c, view);
    // ⛔ 2026-10-06 (founder: *"להגיד בתחילת האימון הראשון בלבד שצריך לומר רק את מספר החזרות בסוף כל סט
    // והבינה תרשום וזהו. בלי להגיד מוכן ובלי להוסיף פקד של מוכן במסכים."*)
    expect(said).toEqual([
      'אני המאמנת שלך. בסוף כל סט, תגיד כמה חזרות עשית.',
      expect.stringMatching(/^פלג עליון אלף\. שני תרגילים, בערך .+ דקות\.$/),
      'לחיצת חזה במוט. משקל פתיחה: עשרים קילו בכל צד. שמונה עד עשר חזרות.',
    ]);
    expect(view().awaitingReady).toBe(false); // no Ready control — on the stage, the lock screen or the wrist
    expect(ear).toBeNull(); // nothing listens before a set could be over
    // The question is due after the moment a lift's first set is given to get under the bar, and the set's own time.
    expect(Math.max(...timers.map((t) => t.at))).toBe(now + (FIRST_SET_SETUP_S + voiceAskAfterS(BENCH, 8)) * 1000);
    await advance((FIRST_SET_SETUP_S + voiceAskAfterS(BENCH, 8)) * 1000, c, view);
    expect(said[said.length - 1]).toBe('כמה חזרות?');
    expect(said).not.toContain('קדימה.');
    expect(said.some((l) => l.includes('מוכן'))).toBe(false);
    expect(view().loggedSets).toHaveLength(0); // the clock writes nothing
  });

  it('§3.4 + §3.5: the ask wants a number; the echo, the verdict (first time: one miss moves), the rest — with the verdict switched on', async () => {
    const { view, c } = harness({ verdict: true });
    await start(c, view);
    await underWay(c, view);
    said = [];
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    expect(said).toEqual(['כמה חזרות?']);
    expect(ear?.ms).toBe(WINDOWS.done);
    // "כן" is not a number: "כמה חזרות?" (§0.8)
    await hear('כן', c, view);
    expect(said[said.length - 1]).toBe('כמה חזרות?');
    expect(ear?.ms).toBe(WINDOWS.reps);
    // Twelve: two over the band's ceiling — first time, so the load moves at once (§ז / spec §4).
    said = [];
    await hear('שתים עשרה', c, view);
    const row = view().loggedSets[0];
    expect(row).toMatchObject({ actualWeight: 60, actualReps: 12 });
    expect(row.presumed).toBeUndefined();
    // At the plan's load the set is said back by its reps alone (2026-10-05).
    expect(said[0]).toBe('שתים עשרה חזרות. נרשם.');
    expect(said[1]).toMatch(/^תוסיף .+ בכל צד\.$/);
    expect(view().displayPhase).toBe('REST_INTER');
    // The echo's tail is open for a correction (§3.5) — and the rest line WAITS for it (2026-09-27):
    // said into the tail, a correction was never heard, and 'מנוחה: שתי דקות' could be heard as 2.
    expect(said).toHaveLength(2);
    expect(ear?.ms).toBe(WINDOWS.echoTail);
    await silence(c, view);
    expect(said).toHaveLength(2); // …and between two sets of one lift nothing more is said (2026-10-06)
    // The next set's load moved; the completed row did not.
    expect(view().livePlan[1].target?.recommendedWeight).toBeGreaterThan(60);
    expect(view().loggedSets[0].actualWeight).toBe(60);
  });

  it('§3.5: "לא, עשר" in the echo\'s tail amends the row and is echoed again', async () => {
    const { view, c } = harness();
    await start(c, view);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    await hear('תשע', c, view);
    expect(view().loggedSets[0].actualReps).toBe(9);
    said = [];
    await hear('לא, עשר', c, view);
    expect(view().loggedSets[0].actualReps).toBe(10);
    expect(said[0]).toBe('עשר חזרות. נרשם.');
  });

  it('§3.6: ten seconds out, the bell, and a changed load is named in the set\'s call — with the verdict switched on', async () => {
    const { view, c } = harness({ verdict: true });
    await start(c, view);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    await hear('שתים עשרה', c, view);
    await silence(c, view); // the echo's tail
    const rest = view().restSeconds;
    said = [];
    await advance((rest - 10) * 1000, c, view);
    expect(said).toContain('עוד עשר שניות.');
    said = [];
    await advance(11 * 1000, c, view);
    expect(view().displayPhase).toBe('SET_PRESENTED');
    // The plates to move were said when the load moved, at the start of the rest; the set names its load.
    expect(said[0]).toMatch(/^סט שני מתוך שלושה\. .+ קילו בכל צד\.$/);
    expect(view().awaitingReady).toBe(false); // called with its load — and nothing waits (2026-10-06)
  });

  it('⛔ §3.4 silence (amended 2026-09-09): "אשאל שוב עוד רגע", a second ask, then NOTHING is written — the set stays open', async () => {
    const { view, c } = harness();
    await start(c, view);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    said = [];
    await silence(c, view);
    expect(said).toEqual(['אשאל שוב עוד רגע.']);
    said = [];
    await advance(WINDOWS.reask, c, view);
    expect(said).toEqual(['כמה חזרות?']);
    said = [];
    await silence(c, view);
    // The founder cancelled the automatic set everywhere: no row, no rest, the set on stage.
    expect(view().loggedSets).toHaveLength(0);
    expect(view().displayPhase).toBe('SET_PRESENTED');
    expect(said).toEqual([NOT_HEARD]);
    // …and the long window is open for her number, without a second line.
    expect(ear).not.toBeNull();
    expect(earLog[earLog.length - 1]).toBe(WINDOWS.longDone);
    said = [];
    await hear('עשר', c, view);
    expect(view().loggedSets[0]).toMatchObject({ actualWeight: 60, actualReps: 10 });
    expect(view().loggedSets[0].presumed).toBeUndefined();
    expect(said[0]).toBe('עשר חזרות. נרשם.');
    // Between two sets of one lift nothing more is said (2026-10-06): the echo is the last word.
    await silence(c, view);
    expect(said).toEqual(['עשר חזרות. נרשם.']);
    expect(view().displayPhase).toBe('REST_INTER');
  });

  it('⛔ an hour of silence on the long window writes nothing either — the set waits for her, anywhere', async () => {
    const { view, c } = harness();
    await start(c, view);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    await silence(c, view);
    await advance(WINDOWS.reask, c, view);
    await silence(c, view); // → "לא שמעתי תשובה…", the long window
    await silence(c, view); // the long window runs out
    await advance(60 * 60 * 1000, c, view);
    expect(view().loggedSets).toHaveLength(0);
    expect(view().displayPhase).toBe('SET_PRESENTED');
    expect(view().active).toBe(true);
    // Her word from another channel — the lock screen's Done — is what writes it, and the voice echoes it.
    said = [];
    await act(async () => await view().completeSet());
    await settle();
    c.observe(view());
    await settle();
    expect(view().loggedSets).toHaveLength(1);
    expect(said[0]).toBe('שמונה חזרות. נרשם.');
  });

  it('§3.4 "לא" twice: "בסדר", then "תגיד סיימתי כשתסיים" with a long window; a number then logs it', async () => {
    const { view, c } = harness();
    await start(c, view);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    said = [];
    await hear('עוד רגע', c, view);
    expect(said).toEqual(['בסדר.']);
    await advance(WINDOWS.reask, c, view);
    await hear('לא', c, view);
    expect(said[said.length - 1]).toBe('תגיד סיימתי כשתסיים.');
    expect(ear?.ms).toBe(WINDOWS.longDone);
    await hear('שמונה', c, view);
    expect(view().loggedSets[0]).toMatchObject({ actualReps: 8 });
    expect(view().loggedSets[0].presumed).toBeUndefined();
  });

  /*
   * ⛔ THE COACH SAYS A BAR BY ITS SIDES, SO SHE ANSWERS IT BY ITS SIDES (founder, 2026-10-05: *"רק כמה
   * בכל צד"*). A coach who says "עשרים קילו בכל צד" and then cannot understand "חמש עשרה בכל צד" has
   * taught her a sentence it does not know.
   */
  it('§3.5: after the echo, "לא" then a number AMENDS the row instead of writing a second set', async () => {
    const { view, c } = harness();
    await start(c, view);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    await hear('תשע', c, view);
    expect(view().loggedSets[0].actualReps).toBe(9);
    await hear('לא', c, view);
    expect(said[said.length - 1]).toBe('כמה חזרות?');
    await hear('עשר', c, view);
    expect(view().loggedSets).toHaveLength(1);
    expect(view().loggedSets[0].actualReps).toBe(10);
  });

  it('§3.8: the last set — silence twice leaves it to her, like every set; the end line closes the session', async () => {
    const { view, c } = harness();
    await start(c, view);
    // Walk to the last set by her word: every set logged as written by voice.
    for (let i = 0; i < 4; i++) {
      await underWay(c, view);
      await advance(voiceAskAfterS(view().currentExerciseId!, view().currentTarget!.repBandLo ?? 8) * 1000, c, view);
      await hear('כמו שכתוב', c, view);
      await silence(c, view); // the echo's tail
      await advance((view().restSeconds + 1) * 1000, c, view);
    }
    expect(view().livePlan[view().globalProgress!.index].lastSetOfSession).toBe(true);
    said = [];
    await advance(voiceAskAfterS(ROW, 10) * 1000, c, view);
    expect(said).toEqual(['כמה חזרות?']);
    await silence(c, view);
    await advance(WINDOWS.reask, c, view);
    await silence(c, view);
    expect(view().loggedSets).toHaveLength(4); // the last set was NOT written
    expect(view().active).toBe(true);
    expect(said[said.length - 1]).toBe(NOT_HEARD);
    said = [];
    await hear('עשר', c, view);
    expect(view().active).toBe(false);
    expect(said.some((s) => /^כל הכבוד\. שני תרגילים, .+ דקות\.$/.test(s))).toBe(true);
  });
});

/*
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE 2026-09-27 AUDIT — what four reviewers found in a voice that had never once run on a phone.
 * Each case below failed before that day's rebuild of the conductor.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
const SS_PLAN: PlannedSession = {
  name: 'Upper A',
  blocks: [
    // A superset: bench, then straight into the row, three rounds, 90 s between rounds.
    { rounds: 3, restS: 90, items: [{ kind: 'reps', ex: BENCH, load: 60, reps: [8, 10] }, { kind: 'reps', ex: ROW, load: 40, reps: [10, 12] }] },
  ],
};

describe('⛔ a superset is ONE round — one call, one question, one echo (spec §3.9)', () => {
  it('the round is called as one, asked once after both lifts, and written half by half in order', async () => {
    const { view, c } = harness();
    await start(c, view, SS_PLAN);
    const loading = said[said.length - 1];
    expect(loading.startsWith('סופר סט. לחיצת חזה במוט: ')).toBe(true);
    expect(loading).toMatch(/\. ואז חתירה בפולי בישיבה: .+ חזרות\.$/);
    expect(view().awaitingReady).toBe(false);
    await underWay(c, view);
    said = [];
    // Asked once, after BOTH lifts' own time — never after the first half alone.
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    expect(said).toEqual([]);
    await advance(voiceAskAfterS(ROW, 10) * 1000, c, view);
    expect(said[said.length - 1]).toMatch(/^כמה חזרות בלחיצת חזה במוט, וכמה ב.+\?$/);
    expect(ear?.ms).toBe(WINDOWS.round);
    said = [];
    await hear('עשר ושמונה', c, view);
    const rows = view().loggedSets;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ exerciseId: BENCH, actualReps: 10 });
    expect(rows[1]).toMatchObject({ exerciseId: ROW, actualReps: 8 });
    expect(said[0]).toMatch(/^לחיצת חזה במוט: עשר חזרות\. .+: שמונה חזרות\. נרשם\.$/);
    // The echo's tail — and after it, nothing: the round's rest needs no line.
    expect(ear?.ms).toBe(WINDOWS.echoTail);
    await silence(c, view);
    expect(said).toHaveLength(1);
  });

  it('one number for two lifts: the first\'s — and the second is asked for by name', async () => {
    const { view, c } = harness();
    await start(c, view, SS_PLAN);
    await underWay(c, view);
    await advance((voiceAskAfterS(BENCH, 8) + voiceAskAfterS(ROW, 10)) * 1000, c, view);
    said = [];
    await hear('עשר', c, view);
    expect(said[0]).toMatch(/^וכמה ב.+\?$/);
    expect(view().loggedSets).toHaveLength(0);
    await hear('שמונה', c, view);
    expect(view().loggedSets.map((r) => r.actualReps)).toEqual([10, 8]);
  });
});

describe('⛔ the 2026-09-27 red lines', () => {
  it('silence after "נכון?" writes NOTHING — it is the question\'s silence (the last silent write, closed)', async () => {
    const { view, c } = harness();
    await start(c, view);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    said = [];
    await hear('תשע', c, view, 0.3);
    expect(said[0]).toBe('שמעתי תשע חזרות. נכון?');
    said = [];
    await silence(c, view);
    expect(view().loggedSets).toHaveLength(0);
    expect(said).toEqual(['אשאל שוב עוד רגע.']);
  });

  it('a row another channel wrote first is the truth — the voice never says "נרשם" over it', async () => {
    const { view, c } = harness();
    await start(c, view);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    said = [];
    // Done on the lock screen, and "עשר" at the same instant: the lock's write is in flight.
    await act(async () => {
      const tap = view().completeSet({ weight: 60, reps: 8 });
      ear!.onSentence('עשר', 0.9);
      await tap;
    });
    await settle();
    c.observe(view());
    await settle();
    expect(view().loggedSets).toHaveLength(1);
    expect(view().loggedSets[0].actualReps).toBe(8);
    expect(said).not.toContain('עשר חזרות. נרשם.');
    expect(said).toContain('שמונה חזרות. נרשם.'); // the row that WAS written, said back
  });

  it('an ear that cannot hear from here is said ONCE, and the questions become where to mark the set', async () => {
    const { view, c } = harness();
    await start(c, view);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    said = [];
    await act(async () => {
      const e = ear!;
      ear = null;
      e.onEnd('locked');
      await new Promise((r) => setTimeout(r, 0));
    });
    await settle();
    expect(said).toEqual([
      'אני לא שומעת אותך כרגע. תסמן את הסטים במסך הנעילה או בשעון.',
      'סיימת? תסמן במסך הנעילה או בשעון.',
    ]);
    expect(view().loggedSets).toHaveLength(0);
    // …and no window is tried again until the ear may listen.
    expect(ear).toBeNull();
  });

  it('"כן" in the echo\'s tail is agreement — it never asks "כמה חזרות?" about a logged set', async () => {
    const { view, c } = harness();
    await start(c, view);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    await hear('עשר', c, view);
    said = [];
    await hear('כן', c, view);
    expect(said).toEqual([]); // agreement: nothing asked, nothing more said
    expect(view().loggedSets).toHaveLength(1);
  });

  it('a set she started with a TAP does not reopen the loading dialogue on the next set', async () => {
    const { view, c } = harness();
    await start(c, view);
    // Ready from the lock screen, then Done on the stage — the voice never heard "מוכן".
    await act(async () => view().setAwaitingReady(false));
    await settle();
    c.observe(view());
    await act(async () => void (await view().completeSet({ weight: 60, reps: 10 })));
    await settle();
    c.observe(view());
    await settle();
    said = [];
    await advance((view().restSeconds + 1) * 1000, c, view);
    expect(view().displayPhase).toBe('SET_PRESENTED');
    expect(view().awaitingReady).toBe(false);
    // No lift is opened again (a loading line begins with the lift's name) — the set is only named.
    expect(said.some((l) => l.startsWith('לחיצת חזה במוט.'))).toBe(false);
    expect(said).toContain('סט שני מתוך שלושה.');
  });
});

/*
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SECOND 2026-09-27 PASS — a whole workout walked aloud, and a random athlete run at the voice
 * (`zzVoiceFuzz`, 80 seeds of every door in any order). Each case below is a hole that pass found.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
const HOLD_PLAN: PlannedSession = {
  name: 'Core',
  blocks: [
    { rounds: 2, restS: 45, items: [{ kind: 'time', ex: 'plank', seconds: 45 }] },
    { rounds: 1, items: [{ kind: 'reps', ex: BENCH, load: 60, reps: [8, 10] }] },
  ],
};
const TRI_PLAN: PlannedSession = {
  name: 'Tri',
  blocks: [
    {
      rounds: 2,
      restS: 90,
      items: [
        { kind: 'reps', ex: BENCH, load: 60, reps: [8, 10] },
        { kind: 'reps', ex: ROW, load: 40, reps: [10, 12] },
        { kind: 'reps', ex: 'lateral_raise', load: 8, reps: [12, 15] },
      ],
    },
  ],
};

async function tapDone(c: VoiceConductor, view: () => SessionView) {
  await act(async () => void (await view().completeSet()));
  await settle();
  c.observe(view());
  await settle();
}

describe('⛔ the second 2026-09-27 pass — the walk and the random athlete', () => {
  it('a hold is the one step with a start — "מוכן" starts its clock; ten seconds out, "זהו", and HER word ends it; silence writes nothing', async () => {
    const { view, c } = harness();
    await start(c, view, HOLD_PLAN);
    expect(said[said.length - 1]).toBe('פלאנק, ארבעים וחמש שניות.');
    expect(ear?.ms).toBe(WINDOWS.loading);
    // ⛔ SINCE 2026-09-28 A HOLD OFFERS READY ON EVERY SURFACE, and "מוכן" starts its ONE clock —
    // the store's, the one the stage, the wrist and the card count down to (founder: *"אחידות בצורה
    // הרמטית"*). It used to be the voice's alone, on a clock of the voice's own.
    expect(view().awaitingReady).toBe(true);
    await hear('מוכן', c, view);
    expect(said[said.length - 1]).toBe('קדימה.');
    expect(view().awaitingReady).toBe(false);
    expect(view().holdEndsAtMs).toBe(now + 45_000);
    said = [];
    await advance(35_000, c, view);
    expect(said).toEqual(['עוד עשר שניות.']);
    await advance(10_000, c, view);
    expect(said[said.length - 1]).toBe('זהו. סיימת?');
    await silence(c, view);
    expect(said[said.length - 1]).toBe('אשאל שוב עוד רגע.');
    expect(view().displayPhase).toBe('SET_PRESENTED'); // nothing written by silence
    await advance(WINDOWS.holdReask, c, view);
    expect(said[said.length - 1]).toBe('סיימת?');
    said = [];
    await hear('כן', c, view);
    expect(said[0]).toBe('ארבעים וחמש שניות. נרשם.');
    expect(view().displayPhase).toBe('REST_INTER');
    // Round two: a number is the seconds she held.
    await advance((view().restSeconds + 1) * 1000, c, view);
    await hear('מוכן', c, view);
    await advance(45_000, c, view);
    said = [];
    await hear('שלושים', c, view);
    expect(said[0]).toBe('שלושים שניות. נרשם.');
    expect(said[1]).toBe('התרגיל האחרון: לחיצת חזה במוט, עשרים קילו בכל צד.');
  });

  it('an open set is asked about again after the long window — twice, ninety seconds apart — and never written', async () => {
    const { view, c } = harness();
    await start(c, view);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    await silence(c, view);
    await advance(WINDOWS.reask, c, view);
    await silence(c, view); // → "לא שמעתי תשובה…", the long window
    await silence(c, view); // the long window runs out
    said = [];
    await advance(WINDOWS.remind, c, view);
    expect(said).toEqual(['הסט עדיין פתוח. כמה חזרות?']);
    await silence(c, view);
    await advance(WINDOWS.remind, c, view);
    expect(said).toEqual(['הסט עדיין פתוח. כמה חזרות?', 'הסט עדיין פתוח. כמה חזרות?']);
    await silence(c, view);
    said = [];
    await advance(10 * WINDOWS.remind, c, view);
    expect(said).toEqual([]); // two reminders, then the lock screen and the wrist
    expect(view().loggedSets).toHaveLength(0);
    // …and a reminder answered writes the set, like any question.
  });

  it('a pause freezes the set — "המשך" does not bring "סיימת?" the moment she picks the bar back up', async () => {
    const { view, c } = harness();
    await start(c, view);
    await underWay(c, view);
    await advance(20_000, c, view);
    await act(async () => view().pause());
    await settle();
    c.observe(view());
    await settle();
    await advance(5 * 60_000, c, view);
    await act(async () => view().resume());
    await settle();
    c.observe(view());
    await settle();
    said = [];
    await advance(5_000, c, view);
    expect(said).not.toContain('כמה חזרות?');
    await advance(voiceAskAfterS(BENCH, 8) * 1000 - 20_000, c, view);
    expect(said[said.length - 1]).toBe('כמה חזרות?');
  });

  it('earbuds back during a pause: "חזרתי", the pause — and nothing asked of a frozen workout', async () => {
    const { view, c } = harness();
    await start(c, view);
    await act(async () => view().pause()); // the button: nothing listens in a set's first seconds
    await settle();
    c.observe(view());
    await settle();
    expect(view().paused).toBe(true);
    c.disable();
    ear = null;
    said = [];
    c.enable();
    await settle();
    c.observe(view());
    await settle();
    c.observe(view());
    await settle();
    expect(said).toEqual(['חזרתי.', 'האימון מושהה. כדי להמשיך, תגיד: המשך.']);
    expect(ear?.ms).toBe(WINDOWS.paused);
  });

  it('the middle of a tri-set reached by a tap is asked about with the rest of the round — never left silent', async () => {
    const { view, c } = harness();
    await start(c, view, TRI_PLAN);
    await underWay(c, view);
    await tapDone(c, view); // bench, pressed on the lock screen
    expect(view().currentExerciseId).toBe(ROW);
    said = [];
    await advance((voiceAskAfterS(ROW, 10) + voiceAskAfterS('lateral_raise', 12)) * 1000, c, view);
    expect(said[said.length - 1]).toMatch(/^כמה חזרות בחתירה בפולי בישיבה, וכמה ב.+\?$/);
    await hear('עשר ושתים עשרה', c, view);
    expect(view().loggedSets.map((r) => r.actualReps)).toEqual([8, 10, 12]);
  });

  it('a warm-up is announced as one, and its echo has no correction tail (a bridge cannot be amended)', async () => {
    const { view, c } = harness();
    await start(c, view);
    expect(view().warmupOffered).toBeGreaterThan(0);
    said = [];
    await act(async () => view().addWarmup());
    await settle();
    c.observe(view());
    await settle();
    expect(said[said.length - 1]).toMatch(/^לחיצת חזה במוט\. (סט חימום|חימום ראשון מתוך .+): .+ חזרות\.$/);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    expect(said[said.length - 1]).toBe('סיימת את החימום?');
    said = [];
    await hear('כן', c, view);
    expect(said[0]).toMatch(/נרשם\.$/);
    expect(ear).toBeNull();
    expect(said).toHaveLength(1);
  });

  it('a record is said at the set that struck it — only where there is a past to beat', async () => {
    await db.appendCompletedSession({
      id: 'past', programDayId: 'coach_0', startedAt: new Date(now - 3 * 86_400_000).toISOString(), state: 'SAVED', earlyFinish: false,
      sets: [{ exerciseId: BENCH, setIndex: 0, recommendedWeight: 57.5, recommendedReps: 8, actualWeight: 57.5, actualReps: 9, edited: false, persistedAt: new Date(now - 3 * 86_400_000).toISOString() }],
    } as never);
    const { view, c } = harness();
    await start(c, view);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    said = [];
    await hear('שמונה', c, view);
    expect(said.slice(0, 2)).toEqual(['שמונה חזרות. נרשם.', 'שיא אישי חדש.']);
  });

  it('…and never on a lift met for the first time: set two heavier than set one is the day finding her weight', async () => {
    const { view, c } = harness({ verdict: true });
    await start(c, view);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    await hear('שתים עשרה', c, view); // → 62.5 next set
    await silence(c, view);
    await advance((view().restSeconds + 1) * 1000, c, view);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    said = [];
    await hear('עשר', c, view);
    expect(said.some((l) => l.includes('שיא'))).toBe(false);
  });

  it('the crossing names the next lift and its load, and "התרגיל האחרון" for the last', async () => {
    const { view, c } = harness();
    await start(c, view);
    for (let i = 0; i < 3; i++) {
      await underWay(c, view);
      await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
      said = [];
      await hear('כמו שכתוב', c, view);
      await silence(c, view);
      if (i < 2) await advance((view().restSeconds + 1) * 1000, c, view);
    }
    // ⛔ 2026-10-06: where to walk and what to load — and no rest length; it is on every screen.
    expect(said[said.length - 1]).toBe('התרגיל האחרון: חתירה בפולי בישיבה, ארבעים קילו.');
  });

  it('"תשע, לא, עשר" at the question is ten reps — never nine kilos for ten', async () => {
    const { view, c } = harness();
    await start(c, view);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    await hear('תשע, לא, עשר', c, view);
    expect(view().loggedSets[0]).toMatchObject({ actualWeight: 60, actualReps: 10 });
  });

});

describe('⛔ the natural voice has the line before it is said (2026-09-27, `voiceLinesAhead`)', () => {
  it('every line the script can write in advance is in a list fetched at the start or at a rest before it', async () => {
    const HEL = { locale: 'he', units: 'kg' } as const;
    const ahead = new Set<string>(fixedLines());
    const snapshot = (from: number) => {
      for (const line of voiceLinesAhead(view().livePlan as never[], from, (st) => restAfterStep(st as never), HEL)) ahead.add(line);
    };
    const { view, c } = harness();
    await start(c, view);
    snapshot(0);
    // A whole workout by her word, with the numbers a real set produces — over, inside, and under.
    const answers = ['שתים עשרה', 'עשר', 'כמו שכתוב', 'שתים עשרה', 'עשר'];
    for (let i = 0; i < 5 && view().active; i++) {
      await underWay(c, view);
      await advance(voiceAskAfterS(view().currentExerciseId!, view().currentTarget!.repBandLo ?? 8) * 1000, c, view);
      await hear(answers[i], c, view);
      if (view().active) {
        await silence(c, view); // the echo's tail
        snapshot((view().globalProgress?.index ?? 0) + 1); // what the phone fetches at this rest
        await advance((view().restSeconds + 1) * 1000, c, view);
      }
    }
    // What depends on her answer, or on the clock, is said at its moment and is not in any list.
    const dynamic = /^(פלג עליון אלף\.|אני המאמנת שלך|כל הכבוד|עולים ל|יורדים ל|תוסיף |תוריד |שמעתי)/;
    const missing = said.filter((l) => !ahead.has(l) && !dynamic.test(l));
    expect(missing).toEqual([]);
    expect(said.length).toBeGreaterThan(12);
  });
});

describe('⛔ every window tells the second ear what its question expects (2026-09-27)', () => {
  it('through a set → set, the question and the echo → reps, a pause → resume, a rest → ready', async () => {
    const { view, c } = harness({ free: true });
    await start(c, view);
    expect(expectLog).toEqual([]); // nothing listens before a set could be over
    await advance((FIRST_SET_SETUP_S + voiceReportFromS(BENCH, 8)) * 1000, c, view);
    expect(expectLog[expectLog.length - 1]).toBe('set');
    await hear('עצור', c, view);
    expect(expectLog[expectLog.length - 1]).toBe('resume');
    await hear('המשך', c, view);
    await advance(100, c, view); // the set's own window opens again a beat after "ממשיכים."
    expect(expectLog[expectLog.length - 1]).toBe('set');
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    expect(expectLog[expectLog.length - 1]).toBe('reps');
    await hear('עשר', c, view);
    expect(expectLog[expectLog.length - 1]).toBe('reps'); // the echo's tail hears a correction
    await silence(c, view);
    await settle();
    expect(expectLog[expectLog.length - 1]).toBe('ready'); // the rest, for the word that ends it
    expect(expectLog).not.toContain('none');
  });
});

/*
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ EVERY SET IS THE SAME FIVE BEATS — AND SHE REPORTS WITHOUT BEING ASKED (founder, 2026-10-05)
 *
 *   > *"אני מרגיש שזה מבוצע בצורה חפיפניקית ואני רוצה שזה יהיה הכי מסודר ומתוכנן שיש. אני רוצה לעשות את
 *   > זה ממש כמו waze של חדר הכושר + הקלט שהאפליקציה מקבלת מהמתאמן."*  — and, shown the two places it
 *   > was uneven ("מוכן" on some sets only; "כמה חזרות?" fired by a clock): *"אני מסכים."*
 *
 *     the set is called → "מוכן" → the set → her reps → said back, and what comes next
 *
 * Walked here on the phone's own microphone held for the workout — the shipping default, and the
 * only world in which a set can be listened to without costing her music.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('⛔ a set is called and is hers — her report, and the question as the fallback (2026-10-05; without "מוכן" since 2026-10-06)', () => {
  const ASK = voiceAskAfterS(BENCH, 8) * 1000;
  const FROM = voiceReportFromS(BENCH, 8) * 1000;

  /** Set one, by her word, in range — and on to the moment set two is called. */
  async function toSetTwo(c: VoiceConductor, view: () => SessionView) {
    await start(c, view);
    await underWay(c, view);
    await advance(FROM, c, view);
    await hear('עשר חזרות', c, view);
    await silence(c, view); // the echo's tail
    said = [];
    await advance((view().restSeconds + 1) * 1000, c, view);
  }

  it('a set runs from its call — the question comes at the set\'s own time, never a stall', async () => {
    const { view, c } = harness({ free: true });
    await toSetTwo(c, view);
    said = [];
    await advance(ASK, c, view);
    expect(said).toEqual(['כמה חזרות?']); // nothing else was said or asked — she is simply lifting
    expect(view().awaitingReady).toBe(false);
    expect(ear?.ms).toBe(WINDOWS.done);
    await hear('תשע', c, view);
    expect(view().loggedSets[1]).toMatchObject({ actualWeight: 60, actualReps: 9 });
  });

  it('her own report is heard without the question — but nothing listens before a set could be over', async () => {
    const { view, c } = harness({ free: true });
    await start(c, view);
    await underWay(c, view);
    expect(ear).toBeNull();
    await advance(FROM - 1_000, c, view);
    expect(ear).toBeNull(); // a count begun aloud, a word to a friend: not even heard
    await advance(1_000, c, view);
    expect(ear).not.toBeNull();
    expect(expectLog[expectLog.length - 1]).toBe('set');
    said = [];
    await hear('עשר חזרות', c, view); // said as a report: hers at once
    expect(view().loggedSets[0]).toMatchObject({ actualWeight: 60, actualReps: 10 });
    expect(said[0]).toBe('עשר חזרות. נרשם.');
    expect(said).not.toContain('כמה חזרות?');
    // …and the question that was due is never asked.
    await silence(c, view);
    said = [];
    await advance(ASK, c, view);
    expect(said).not.toContain('כמה חזרות?');
  });

  it('a count is not a report: "שש… שבע… שמונה" writes eight — once — and only when she stops', async () => {
    const { view, c } = harness({ free: true });
    await start(c, view);
    await underWay(c, view);
    await advance(FROM, c, view);
    said = [];
    await hear('שש', c, view);
    expect(view().loggedSets).toHaveLength(0);
    await advance(REPORT_SETTLE_MS - 500, c, view);
    await hear('שבע', c, view);
    await advance(REPORT_SETTLE_MS - 500, c, view);
    await hear('שמונה', c, view);
    expect(view().loggedSets).toHaveLength(0); // still held: the next number could replace it
    await advance(REPORT_SETTLE_MS, c, view);
    expect(view().loggedSets).toHaveLength(1);
    expect(view().loggedSets[0]).toMatchObject({ actualWeight: 60, actualReps: 8 });
    expect(said.filter((l) => l.endsWith('נרשם.'))).toEqual(['שמונה חזרות. נרשם.']);
  });

  it('"סיימתי" brings the one question left; "כמו שכתוב" needs none', async () => {
    const a = harness({ free: true });
    await start(a.c, a.view);
    await underWay(a.c, a.view);
    await advance(FROM, a.c, a.view);
    said = [];
    await hear('סיימתי', a.c, a.view);
    expect(said).toEqual(['כמה חזרות?']);
    expect(ear?.ms).toBe(WINDOWS.done);
    await hear('תשע', a.c, a.view);
    expect(a.view().loggedSets[0]).toMatchObject({ actualReps: 9 });
  });

  it('a bare number is her reps — it never moves the bar', async () => {
    const { view, c } = harness({ free: true });
    await toSetTwo(c, view);
    // She lifts, racks the bar twenty seconds in and says the one word.
    await advance(FROM + 4_000, c, view);
    said = [];
    await hear('עשר', c, view);
    expect(view().currentTarget?.recommendedWeight).toBe(60); // "עשר" is her reps here — not ten a side
    await advance(REPORT_SETTLE_MS, c, view);
    expect(view().loggedSets[1]).toMatchObject({ actualWeight: 60, actualReps: 10 });
    expect(said[0]).toBe('עשר חזרות. נרשם.');
    expect(view().awaitingReady).toBe(false);
  });

  it('without a microphone that is free — the earbuds\' own — a set after a rest runs as it did: no window through the set', async () => {
    const { view, c } = harness(); // the earbuds' microphone: open only in a question's short window
    await start(c, view);
    await underWay(c, view);
    await advance(FROM + 2_000, c, view);
    expect(ear).toBeNull(); // her music is not held at call quality for a whole set
    await advance(ASK - FROM - 2_000, c, view);
    expect(said[said.length - 1]).toBe('כמה חזרות?');
    await hear('עשר', c, view);
    await silence(c, view);
    said = [];
    await advance((view().restSeconds + 1) * 1000, c, view);
    expect(said[said.length - 1]).toBe('סט שני מתוך שלושה.');
    expect(view().awaitingReady).toBe(false);
    expect(ear).toBeNull();
  });
});

/*
 * ════ ⛔ THE FOUNDER'S NOTES AFTER HIS FIRST WORKOUT WITH A VOICE HE COULD HEAR (2026-10-06) ════
 *   1 · *"אני לא חושב שצריך לומר 'אותו משקל' או הורד משקל או הרם משקל. לפחות לא כרגע. … רק צריך להשמיע
 *       צליל של LOGGED."*
 *   2 · *"אי אפשר לקצר את המנוחה במלל במידה ואני רוצה?"*
 *   4 · *"הבינה אמרה 'חזרתי' ואז 'סט שלישי מתוך ארבעה' אבל היא לא הגיבה. לאחר 20 שניות בערך היא שאלה
 *       אותי 'כמה חזרות' ואז אמרתי עשר ואז היא כן הגיבה."*
 */
describe('⛔ 2026-10-06 · after a set the coach says what was written — and the plan\'s load stands', () => {
  it('twelve where ten was the top: "שתים עשרה חזרות. נרשם.", the rest — no verdict, and the next set is the same bar', async () => {
    const { view, c } = harness();
    await start(c, view);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    said = [];
    await hear('שתים עשרה', c, view);
    expect(said).toEqual(['שתים עשרה חזרות. נרשם.']);
    await silence(c, view); // the echo's three seconds
    expect(said).toEqual(['שתים עשרה חזרות. נרשם.']); // …and not a word more: no verdict, no rest line
    expect(view().livePlan[1].target?.recommendedWeight).toBe(60);
    // …so the next set is simply called: no load, no loading dialogue, no Ready owed.
    said = [];
    await advance((view().restSeconds + 1) * 1000, c, view);
    expect(said).toEqual(['עוד עשר שניות.', 'סט שני מתוך שלושה.']);
    expect(view().awaitingReady).toBe(false);
  });

  it('a set under the range says nothing either — the engine between workouts is what reads it', async () => {
    const { view, c } = harness();
    await start(c, view);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    said = [];
    await hear('חמש', c, view);
    expect(said).toEqual(['חמש חזרות. נרשם.']);
    await silence(c, view);
    expect(view().livePlan[1].target?.recommendedWeight).toBe(60);
  });

});

describe('⛔ 2026-10-06 · her word ends a rest', () => {
  /** One set by voice on the held microphone, to the start of its rest (the rest line said, the tail closed). */
  async function toTheRest(c: VoiceConductor, view: () => SessionView) {
    await start(c, view);
    await underWay(c, view);
    await advance(voiceReportFromS(BENCH, 8) * 1000 + 500, c, view);
    await hear('עשר חזרות', c, view);
    await silence(c, view); // the echo's three seconds
    await settle();
  }

  it('the rest is listened to — patiently, and not into the bell: the window closes before the rest does', async () => {
    const { view, c } = harness({ free: true });
    await toTheRest(c, view);
    const w = listenLog[listenLog.length - 1];
    expect(w).toMatchObject({ expect: 'ready', patient: true });
    const left = view().restEndsAtMs! - now;
    expect(w.ms).toBeLessThan(left);
    expect(w.ms).toBeGreaterThan(left - 5_000);
  });

  it('"מוכן" in the middle of a rest: the rest is over, no bell, the set is called — and its clock runs from that word', async () => {
    const { view, c } = harness({ free: true });
    await toTheRest(c, view);
    await advance(20_000, c, view);
    expect(view().displayPhase).toBe('REST_INTER');
    said = [];
    chimes = 0;
    const at = now;
    await hear('מוכן', c, view);
    expect(view().displayPhase).toBe('SET_PRESENTED');
    expect(said).toEqual(['סט שני מתוך שלושה.']); // the call — and no "קדימה": nobody starts her
    expect(chimes).toBe(0);
    expect(view().awaitingReady).toBe(false);
    said = [];
    await advance(voiceAskAfterS(BENCH, 8) * 1000 - 2_000, c, view);
    expect(said).toEqual([]);
    await advance(2_500, c, view);
    expect(said).toEqual(['כמה חזרות?']);
    expect(now - at).toBeGreaterThanOrEqual(voiceAskAfterS(BENCH, 8) * 1000);
  });

  it('"דלג" ends it too; "כן", a number, a word to a friend do not', async () => {
    const { view, c } = harness({ free: true });
    await toTheRest(c, view);
    for (const word of ['כן', 'עשר', 'מה קורה אחי', 'עוד רגע']) {
      await hear(word, c, view);
      expect(view().displayPhase).toBe('REST_INTER');
    }
    await hear('דלג', c, view);
    expect(view().displayPhase).toBe('SET_PRESENTED');
  });

  it('"עצור" in a rest pauses the workout; the rest left alone ends with its bell as it always did', async () => {
    const a = harness({ free: true });
    await toTheRest(a.c, a.view);
    await hear('עצור', a.c, a.view);
    expect(a.view().paused).toBe(true);
  });

  it('the rest left alone ends with its bell, and the set is called — nothing waits for a word', async () => {
    const { view, c } = harness({ free: true });
    await toTheRest(c, view);
    said = [];
    chimes = 0;
    await advance((view().restSeconds + 1) * 1000, c, view);
    expect(chimes).toBe(1);
    expect(said).toEqual(['עוד עשר שניות.', 'סט שני מתוך שלושה.']);
    expect(view().awaitingReady).toBe(false);
  });

  it('a rest cut short before a bar that changed: the set is called with its load — and still nothing waits', async () => {
    const { view, c } = harness({ free: true, verdict: true });
    await start(c, view);
    await underWay(c, view);
    await advance(voiceReportFromS(BENCH, 8) * 1000 + 500, c, view);
    await hear('שתים עשרה חזרות', c, view); // over the range, the verdict on: the bar goes up
    await silence(c, view);
    await settle();
    said = [];
    await hear('מוכן', c, view); // into the rest
    expect(view().displayPhase).toBe('SET_PRESENTED');
    expect(said).toEqual([expect.stringMatching(/^סט שני מתוך שלושה\. .+ בכל צד\.$/)]);
    expect(view().awaitingReady).toBe(false);
  });

  it('on the earbuds\' own microphone a rest is not listened to at all — her music is not spent on it', async () => {
    const { view, c } = harness();
    await start(c, view);
    await underWay(c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    await hear('עשר', c, view);
    await silence(c, view);
    await settle();
    expect(ear).toBeNull();
  });
});

