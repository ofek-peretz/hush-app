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
import { VoiceConductor, WINDOWS, REPORT_SETTLE_MS } from '@/platform/voice/voiceConductor';
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
const audio = { duck: async () => {}, unduck: async () => {}, playChime: async () => {} };
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
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type: string, cb: (s: string) => void) => {
    wake = cb;
    return { remove() {} } as never;
  });
});
afterAll(() => clock.mockRestore());

/** `free`: the phone's own microphone is held for the workout (the shipping default) — see `nextSet`. */
function harness(opts: { free?: boolean } = {}) {
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
  it('§3.1 + §3.2: the opening, then the first-time loading dialogue; "מוכן" is the start', async () => {
    const { view, c } = harness();
    await start(c, view);
    // ⛔ Since 2026-09-28 the first workout's first line INTRODUCES the coach (founder: "משפט שמציג את המאמן הקולי
    // באימון הראשון… כאשר המשתמש לוחץ START"), and no longer calls the loads a bodyweight guess — B-1 is cancelled.
    expect(said[0]).toBe('אני המאמנת שלך. לפני כל סט, תגיד: מוכן. אחרי הסט, תגיד כמה חזרות. אם המשקל לא מתאים, תגיד משקל אחר.');
    // The engine's "Upper A" is a key on disk; she hears it in her language (`i18n/dayTitle`, 2026-09-28).
    expect(said[1]).toMatch(/^פלג עליון אלף\. שני תרגילים, בערך .+ דקות\.$/);
    expect(said[2]).toBe(
      // ⛔ 2026-10-05: the lift, its load, its range — and nothing she was told in the opening.
      'לחיצת חזה במוט. משקל פתיחה: עשרים קילו בכל צד. שמונה עד עשר חזרות.',
    );
    expect(view().awaitingReady).toBe(true); // the lock screen offers Ready
    expect(ear?.ms).toBe(WINDOWS.loading); // the long window (§3.2)
    // Noise while loading is ignored and the window stays open.
    expect(ear!.onSentence('מה קורה אחי', 0.9)).toBe(true);
    // A different load: echoed, carried, the window stays open.
    await hear('חמישים', c, view);
    expect(said[said.length - 1]).toBe('חמישים קילו, חמישה עשר קילו בכל צד.');
    expect(view().currentTarget?.recommendedWeight).toBe(50);
    expect(view().livePlan[1].target?.recommendedWeight).toBe(50); // carried to the lift's later sets
    // "מוכן": go, the set is under way, no window open, the ask is due at start + reps × rep time + 15.
    await hear('מוכן', c, view);
    // "קדימה." and nothing after it — no technique line (founder, 2026-09-27).
    expect(said[said.length - 1]).toBe('קדימה.');
    expect(said.some((l) => l.includes('רגליים נטועות'))).toBe(false);
    expect(view().awaitingReady).toBe(false);
    expect(ear).toBeNull();
    const askAt = timers.find((t) => true)!.at;
    expect(askAt).toBe(now + voiceAskAfterS(BENCH, 8) * 1000);
  });

  it('§3.4 + §3.5: the ask wants a number; the echo, the verdict (first time: one miss moves), the rest', async () => {
    const { view, c } = harness();
    await start(c, view);
    await hear('מוכן', c, view);
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
    expect(said[2]).toBe(restLine(view()));
    // The next set's load moved; the completed row did not.
    expect(view().livePlan[1].target?.recommendedWeight).toBeGreaterThan(60);
    expect(view().loggedSets[0].actualWeight).toBe(60);
  });

  it('§3.5: "לא, עשר" in the echo\'s tail amends the row and is echoed again', async () => {
    const { view, c } = harness();
    await start(c, view);
    await hear('מוכן', c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    await hear('תשע', c, view);
    expect(view().loggedSets[0].actualReps).toBe(9);
    said = [];
    await hear('לא, עשר', c, view);
    expect(view().loggedSets[0].actualReps).toBe(10);
    expect(said[0]).toBe('עשר חזרות. נרשם.');
  });

  it('§3.6 + §3.2: ten seconds out, then the changed load opens a loading dialogue with the plates to add', async () => {
    const { view, c } = harness();
    await start(c, view);
    await hear('מוכן', c, view);
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
    expect(view().awaitingReady).toBe(true);
  });

  it('⛔ §3.4 silence (amended 2026-09-09): "אשאל שוב עוד רגע", a second ask, then NOTHING is written — the set stays open', async () => {
    const { view, c } = harness();
    await start(c, view);
    await hear('מוכן', c, view);
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
    // The rest is whatever the store prescribes for this lift (a learned rest can move it between
    // runs of this file); the line must name THAT number — after the echo's tail has closed.
    await silence(c, view);
    expect(said[said.length - 1]).toBe(restLine(view()));
    expect(view().displayPhase).toBe('REST_INTER');
  });

  it('⛔ an hour of silence on the long window writes nothing either — the set waits for her, anywhere', async () => {
    const { view, c } = harness();
    await start(c, view);
    await hear('מוכן', c, view);
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
    await hear('מוכן', c, view);
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

  it('§3.2 "לא יודע": a light calibration set, and her reps set the next load by Epley', async () => {
    const { view, c } = harness();
    await start(c, view);
    said = [];
    await hear('לא יודע', c, view);
    expect(said[0]).toBe('נתחיל קל: שתים עשרה וחצי קילו בכל צד. תעשה כמה חזרות שנוח לך.');
    expect(view().currentTarget?.recommendedWeight).toBe(45);
    await hear('מוכן', c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    await hear('חמש עשרה', c, view); // 15 easy reps at 45 → e1RM 67.5 → 8-rep load ≈ 53
    expect(view().loggedSets[0]).toMatchObject({ actualWeight: 45, actualReps: 15 });
    await silence(c, view);
    expect(view().livePlan[1].target?.recommendedWeight).toBeGreaterThan(45);
  });

  it('§3.2: while the loading dialogue is open the clock does not write the set — however long she loads', async () => {
    const { view, c } = harness();
    await start(c, view);
    expect(view().awaitingReady).toBe(true);
    await advance(4 * 60 * 1000, c, view); // four minutes at the rack, no "מוכן"
    expect(view().loggedSets).toHaveLength(0); // the clock is held: nothing written, nothing presumed
    expect(view().displayPhase).toBe('SET_PRESENTED');
    expect(said[said.length - 1]).toBe('מוכן?'); // the 45 s prompt, once
    await silence(c, view); // the 90 s window runs out
    expect(said[said.length - 1]).toBe('לא שמעתי מוכן. אשאל בסוף הסט.');
    expect(view().awaitingReady).toBe(true); // the card's Ready button stays until the question comes
    expect(view().loggedSets).toHaveLength(0);
  });

  it('⛔ a loading window that ran out is never a dead end — the question comes one set later, and her number writes (2026-09-27)', async () => {
    const { view, c } = harness();
    await start(c, view);
    await silence(c, view); // no "מוכן" heard in 90 s — she started without it
    said = [];
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    expect(said).toEqual(['כמה חזרות?']);
    expect(view().awaitingReady).toBe(false); // the question means the set is under way
    expect(view().loggedSets).toHaveLength(0);
    await hear('תשע', c, view);
    expect(view().loggedSets[0]).toMatchObject({ actualWeight: 60, actualReps: 9 });
  });

  it('⛔ a number that cannot be a load is the set she already did — said back with "נכון?", never a new load (2026-09-27)', async () => {
    const { view, c } = harness();
    await start(c, view);
    // ⛔ 2026-10-05: sooner than a set can be done, a number that is no load and no side is let go —
    // nobody has lifted in the seconds after the lift is called, and nothing is asked about it.
    said = [];
    await hear('שמונה', c, view);
    expect(said).toEqual([]);
    expect(view().awaitingReady).toBe(true);
    // Half a minute at the rack with no "מוכן" heard: now it can be the set she did.
    await advance(30_000, c, view);
    said = [];
    await hear('שמונה', c, view); // eight kilos on a sixty-kilo bench? No: eight reps.
    expect(view().currentTarget?.recommendedWeight).toBe(60);
    // Said in full here: the load is what tells her how "שמונה" was read — as reps, on the bar's sixty.
    expect(said[said.length - 1]).toBe('שמעתי שישים קילו, שמונה חזרות. נכון?');
    expect(view().loggedSets).toHaveLength(0);
    expect(view().awaitingReady).toBe(false);
    // "לא" — it was not a set: back to loading, the load untouched.
    await hear('לא', c, view);
    expect(said[said.length - 1]).toBe('מוכן?');
    expect(view().awaitingReady).toBe(true);
    expect(view().loggedSets).toHaveLength(0);
    // A load IS a load: "חמישים" on a sixty-kilo bar moves the bar.
    await hear('חמישים', c, view);
    expect(view().currentTarget?.recommendedWeight).toBe(50);
    // …and "שש" once a set could be over, then "כן": the set is written, at the bar's load.
    await advance(30_000, c, view);
    await hear('שש', c, view);
    await hear('כן', c, view);
    expect(view().loggedSets[0]).toMatchObject({ actualWeight: 50, actualReps: 6 });
  });

  /*
   * ⛔ THE COACH SAYS A BAR BY ITS SIDES, SO SHE ANSWERS IT BY ITS SIDES (founder, 2026-10-05: *"רק כמה
   * בכל צד"*). A coach who says "עשרים קילו בכל צד" and then cannot understand "חמש עשרה בכל צד" has
   * taught her a sentence it does not know.
   */
  it('⛔ "חמש עשרה בכל צד" loads the bar by its sides — and is said back both ways', async () => {
    const { view, c } = harness();
    await start(c, view); // the bench at sixty: twenty a side
    await hear('חמש עשרה בכל צד', c, view);
    expect(view().currentTarget?.recommendedWeight).toBe(50);
    expect(said[said.length - 1]).toBe('חמישים קילו, חמישה עשר קילו בכל צד.');
    expect(view().awaitingReady).toBe(true); // still loading: the word that starts the set is "מוכן"
    // A number of kilos below the bar's own weight can only be a side.
    await hear('עשר קילו', c, view);
    expect(view().currentTarget?.recommendedWeight).toBe(40);
    expect(said[said.length - 1]).toBe('ארבעים קילו, עשרה קילו בכל צד.');
    // …and a total is still a total.
    await hear('שישים', c, view);
    expect(view().currentTarget?.recommendedWeight).toBe(60);
    expect(view().loggedSets).toHaveLength(0);
  });

  it('⛔ a bare number plates can make, said sooner than a set takes, is a side — said after a set\'s time, it is her reps', async () => {
    const { view, c } = harness();
    await start(c, view);
    // Seconds after the lift was called: nobody has done a set yet. "עשר" is ten a side.
    await hear('עשר', c, view);
    expect(view().currentTarget?.recommendedWeight).toBe(40);
    expect(said[said.length - 1]).toBe('ארבעים קילו, עשרה קילו בכל צד.');
    expect(view().loggedSets).toHaveLength(0);
    // Two minutes at the rack with no "מוכן" heard: now "עשר" is the set she did — asked, never assumed.
    await advance(120_000, c, view);
    await hear('עשר', c, view);
    expect(view().currentTarget?.recommendedWeight).toBe(40); // the bar is untouched
    expect(said[said.length - 1]).toBe('שמעתי ארבעים קילו, עשר חזרות. נכון?');
    expect(view().loggedSets).toHaveLength(0);
  });

  it('§3.2: "מוכן" from the lock screen is the start signal — Ready goes, the ask is scheduled from the tap', async () => {
    const { view, c } = harness();
    await start(c, view);
    expect(view().awaitingReady).toBe(true);
    await act(async () => view().applyLockIntents([{ id: 'lk1', type: 'set_ready', atMs: now }]));
    await settle();
    c.observe(view());
    await settle();
    expect(view().awaitingReady).toBe(false);
    expect(ear).toBeNull(); // the 90 s window closed
    expect(timers.some((t) => t.at === now + voiceAskAfterS(BENCH, 8) * 1000)).toBe(true);
  });

  it('§3.5: after the echo, "לא" then a number AMENDS the row instead of writing a second set', async () => {
    const { view, c } = harness();
    await start(c, view);
    await hear('מוכן', c, view);
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
      if (view().awaitingReady) await hear('מוכן', c, view);
      await advance(voiceAskAfterS(view().currentExerciseId!, view().currentTarget!.repBandLo ?? 8) * 1000, c, view);
      await hear('כמו שכתוב', c, view);
      await silence(c, view); // the echo's tail
      await advance((view().restSeconds + 1) * 1000, c, view);
    }
    if (view().awaitingReady) await hear('מוכן', c, view);
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

describe('⛔ a superset is ONE round — one loading dialogue, one question, one echo (spec §3.9)', () => {
  it('the round is loaded as one, asked once after both lifts, and written half by half in order', async () => {
    const { view, c } = harness();
    await start(c, view, SS_PLAN);
    const loading = said[said.length - 1];
    expect(loading.startsWith('סופר סט. לחיצת חזה במוט: ')).toBe(true);
    expect(loading).toMatch(/\. ואז חתירה בפולי בישיבה: .+ חזרות\.$/);
    expect(view().awaitingReady).toBe(true);
    await hear('מוכן', c, view);
    said = [];
    // Asked once, after BOTH lifts' own time — never after the first half alone.
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    expect(said).toEqual(['קדימה.'].filter((l) => said.includes(l)));
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
    // The echo's tail first; the rest line after it.
    expect(ear?.ms).toBe(WINDOWS.echoTail);
    await silence(c, view);
    expect(said[said.length - 1]).toMatch(/^מנוחה: /);
  });

  it('one number for two lifts: the first\'s — and the second is asked for by name', async () => {
    const { view, c } = harness();
    await start(c, view, SS_PLAN);
    await hear('מוכן', c, view);
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
    await hear('מוכן', c, view);
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
    await hear('מוכן', c, view);
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
    await hear('מוכן', c, view);
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
    await hear('מוכן', c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    await hear('עשר', c, view);
    said = [];
    await hear('כן', c, view);
    expect(said).not.toContain('כמה חזרות?');
    expect(view().loggedSets).toHaveLength(1);
    expect(said[said.length - 1]).toMatch(/^מנוחה: /);
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
  it('a hold is counted aloud: "מוכן" starts it, ten seconds out, "זהו", and HER word ends it — silence writes nothing', async () => {
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
    expect(said[1]).toMatch(/^התרגיל האחרון: לחיצת חזה במוט, עשרים קילו בכל צד\. מנוחה: /);
  });

  it('an open set is asked about again after the long window — twice, ninety seconds apart — and never written', async () => {
    const { view, c } = harness();
    await start(c, view);
    await hear('מוכן', c, view);
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
    await hear('מוכן', c, view);
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

  it('earbuds back during a pause: "חזרתי", the pause — and no "מוכן?" window into a frozen workout', async () => {
    const { view, c } = harness();
    await start(c, view); // the loading dialogue is open
    await hear('עצור', c, view);
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
    await hear('מוכן', c, view);
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
    await hear('מוכן', c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    expect(said[said.length - 1]).toBe('סיימת את החימום?');
    said = [];
    await hear('כן', c, view);
    expect(said[0]).toMatch(/נרשם\.$/);
    expect(ear).toBeNull();
    expect(said[said.length - 1]).toMatch(/^מנוחה: /);
  });

  it('a record is said at the set that struck it — only where there is a past to beat', async () => {
    await db.appendCompletedSession({
      id: 'past', programDayId: 'coach_0', startedAt: new Date(now - 3 * 86_400_000).toISOString(), state: 'SAVED', earlyFinish: false,
      sets: [{ exerciseId: BENCH, setIndex: 0, recommendedWeight: 57.5, recommendedReps: 8, actualWeight: 57.5, actualReps: 9, edited: false, persistedAt: new Date(now - 3 * 86_400_000).toISOString() }],
    } as never);
    const { view, c } = harness();
    await start(c, view);
    await hear('מוכן', c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    said = [];
    await hear('שמונה', c, view);
    expect(said.slice(0, 2)).toEqual(['שמונה חזרות. נרשם.', 'שיא אישי חדש.']);
  });

  it('…and never on a lift met for the first time: set two heavier than set one is the day finding her weight', async () => {
    const { view, c } = harness();
    await start(c, view);
    await hear('מוכן', c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    await hear('שתים עשרה', c, view); // → 62.5 next set
    await silence(c, view);
    await advance((view().restSeconds + 1) * 1000, c, view);
    await hear('מוכן', c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    said = [];
    await hear('עשר', c, view);
    expect(said.some((l) => l.includes('שיא'))).toBe(false);
  });

  it('the crossing names the next lift and its load, and "התרגיל האחרון" for the last', async () => {
    const { view, c } = harness();
    await start(c, view);
    for (let i = 0; i < 3; i++) {
      if (view().awaitingReady) await hear('מוכן', c, view);
      await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
      said = [];
      await hear('כמו שכתוב', c, view);
      await silence(c, view);
      if (i < 2) await advance((view().restSeconds + 1) * 1000, c, view);
    }
    expect(said[said.length - 1]).toMatch(/^התרגיל האחרון: חתירה בפולי בישיבה, ארבעים קילו\. מנוחה: .+\.$/);
  });

  it('"תשע, לא, עשר" at the question is ten reps — never nine kilos for ten', async () => {
    const { view, c } = harness();
    await start(c, view);
    await hear('מוכן', c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    await hear('תשע, לא, עשר', c, view);
    expect(view().loggedSets[0]).toMatchObject({ actualWeight: 60, actualReps: 10 });
  });

  it('"קל יותר" moves to a weight that exists, and never below the empty bar', async () => {
    const { view, c } = harness();
    await start(c, view, { name: 'DB', blocks: [{ rounds: 2, items: [{ kind: 'reps', ex: 'incline_db_press', load: 22.5, reps: [10, 12] }] }] });
    await hear('קל יותר', c, view);
    expect(view().currentTarget?.recommendedWeight).toBe(22); // not the 21.5 no rack holds
    await hear('כבד יותר', c, view);
    expect(view().currentTarget?.recommendedWeight).toBe(23);
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
      if (view().awaitingReady) await hear('מוכן', c, view);
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
    expect(said.length).toBeGreaterThan(15);
  });
});

describe('⛔ every window tells the second ear what its question expects (2026-09-27)', () => {
  it('loading → ready, the question and the echo → reps, a pause → resume', async () => {
    const { view, c } = harness();
    await start(c, view);
    expect(expectLog[expectLog.length - 1]).toBe('ready');
    await hear('עצור', c, view);
    expect(expectLog[expectLog.length - 1]).toBe('resume');
    await hear('המשך', c, view);
    expect(expectLog[expectLog.length - 1]).toBe('ready');
    await hear('מוכן', c, view);
    await advance(voiceAskAfterS(BENCH, 8) * 1000, c, view);
    expect(expectLog[expectLog.length - 1]).toBe('reps');
    await hear('עשר', c, view);
    expect(expectLog[expectLog.length - 1]).toBe('reps'); // the echo's tail hears a correction
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
describe('⛔ every set is the same five beats (2026-10-05)', () => {
  const ASK = voiceAskAfterS(BENCH, 8) * 1000;
  const FROM = voiceReportFromS(BENCH, 8) * 1000;

  /** Set one, by her word, in range — and on to the moment set two is called. */
  async function toSetTwo(c: VoiceConductor, view: () => SessionView) {
    await start(c, view);
    await hear('מוכן', c, view);
    await advance(FROM, c, view);
    await hear('עשר חזרות', c, view);
    await silence(c, view); // the echo's tail
    said = [];
    await advance((view().restSeconds + 1) * 1000, c, view);
  }

  it('the second set is called and started like the first: "מוכן" → "קדימה.", and its question is timed from her word', async () => {
    const { view, c } = harness({ free: true });
    await toSetTwo(c, view);
    expect(view().displayPhase).toBe('SET_PRESENTED');
    expect(said[said.length - 1]).toBe('סט שני מתוך שלושה.');
    expect(view().awaitingReady).toBe(true); // Ready on the stage, the wrist and the card — for EVERY set now
    expect(expectLog[expectLog.length - 1]).toBe('set');
    await advance(9_000, c, view); // she takes nine more seconds
    await hear('מוכן', c, view);
    expect(said[said.length - 1]).toBe('קדימה.');
    expect(view().awaitingReady).toBe(false);
    expect(timers.some((t) => t.at === now + ASK)).toBe(true); // from her word, not from the chime
    expect(view().loggedSets).toHaveLength(1);
  });

  it('…and a set she does not announce still runs — the question comes at its usual time, never a stall', async () => {
    const { view, c } = harness({ free: true });
    await toSetTwo(c, view);
    said = [];
    await advance(ASK, c, view);
    expect(said).toEqual(['כמה חזרות?']); // no "מוכן?", no "לא שמעתי מוכן" — she is simply lifting
    expect(view().awaitingReady).toBe(false);
    expect(ear?.ms).toBe(WINDOWS.done);
    await hear('תשע', c, view);
    expect(view().loggedSets[1]).toMatchObject({ actualWeight: 60, actualReps: 9 });
  });

  it('her own report is heard without the question — but nothing listens before a set could be over', async () => {
    const { view, c } = harness({ free: true });
    await start(c, view);
    await hear('מוכן', c, view);
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
    await hear('מוכן', c, view);
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
    await hear('מוכן', a.c, a.view);
    await advance(FROM, a.c, a.view);
    said = [];
    await hear('סיימתי', a.c, a.view);
    expect(said).toEqual(['כמה חזרות?']);
    expect(ear?.ms).toBe(WINDOWS.done);
    await hear('תשע', a.c, a.view);
    expect(a.view().loggedSets[0]).toMatchObject({ actualReps: 9 });
  });

  it('a set begun without "מוכן" and reported with a bare number never moves the bar', async () => {
    const { view, c } = harness({ free: true });
    await toSetTwo(c, view);
    // No "מוכן". She lifts, racks the bar twenty seconds in and says the one word.
    await advance(FROM + 4_000, c, view);
    said = [];
    await hear('עשר', c, view);
    expect(view().currentTarget?.recommendedWeight).toBe(60); // "עשר" is her reps here — not ten a side
    await advance(REPORT_SETTLE_MS, c, view);
    expect(view().loggedSets[1]).toMatchObject({ actualWeight: 60, actualReps: 10 });
    expect(said[0]).toBe('עשר חזרות. נרשם.');
    expect(view().awaitingReady).toBe(false); // the Ready it still offered goes with the set
  });

  it('…while the same word in the seconds after the set is called IS the bar — and then the set waits for her', async () => {
    const { view, c } = harness({ free: true });
    await toSetTwo(c, view);
    await advance(3_000, c, view); // nobody has done a set in three seconds
    said = [];
    await hear('קל יותר', c, view);
    expect(view().currentTarget?.recommendedWeight).toBeLessThan(60);
    expect(said[0]).toMatch(/קילו, .+ בכל צד\.$/); // said back both ways
    expect(view().awaitingReady).toBe(true);
    expect(ear?.ms).toBe(WINDOWS.loading); // she is changing plates: now it waits, like a first set
    said = [];
    await advance(ASK + 5_000, c, view);
    expect(said).not.toContain('כמה חזרות?'); // the assumed start is withdrawn — nothing presumes she is lifting
    expect(view().loggedSets).toHaveLength(1);
  });

  it('"מוכן" said to the question of a set she had not started begins it — her word is the start whenever she gives it', async () => {
    const { view, c } = harness({ free: true });
    await toSetTwo(c, view);
    await advance(ASK, c, view); // she was still resting; the coach assumed and asked
    expect(said[said.length - 1]).toBe('כמה חזרות?');
    said = [];
    await hear('מוכן', c, view);
    expect(said).toEqual(['קדימה.']);
    expect(view().loggedSets).toHaveLength(1); // nothing written
    expect(timers.some((t) => t.at === now + ASK)).toBe(true); // the set is timed from now
  });

  it('without a microphone that is free — the earbuds\' own — a set after a rest runs as it did: no window through the set', async () => {
    const { view, c } = harness(); // the earbuds' microphone: open only in a question's short window
    await start(c, view);
    await hear('מוכן', c, view);
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
