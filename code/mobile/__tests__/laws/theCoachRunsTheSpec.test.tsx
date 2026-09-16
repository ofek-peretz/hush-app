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
import { SessionProvider, useSession, type SessionView } from '@/state/stores/sessionStore';
import { hebrewDuration } from '@/domain/hebrewNumbers';
import { initI18n, setLocale } from '@/i18n';
import { db } from '@/data/local/db';
import { voiceAskAfterS } from '@/domain/setDwell';
import { VoiceConductor, WINDOWS } from '@/platform/voice/voiceConductor';
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
    return {
      close: () => {
        if (ear && ear.onEnd === opts.onEnd) {
          const e = ear;
          ear = null;
          e.onEnd('closed');
        }
      },
    };
  },
};
const audio = { duck: async () => {}, unduck: async () => {}, playChime: async () => {} };
const NOT_HEARD = 'לא שמעתי תשובה. הסט נשאר פתוח: תגיד לי כמה חזרות כשתסיים, או תלחץ סיום במסך הנעילה או בשעון.';

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
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type: string, cb: (s: string) => void) => {
    wake = cb;
    return { remove() {} } as never;
  });
});
afterAll(() => clock.mockRestore());

function harness() {
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

async function start(c: VoiceConductor, view: () => SessionView) {
  c.enable();
  await act(async () => view().startCoach(PLAN, 'coach_0'));
  await settle();
  c.observe(view());
  await settle();
}

describe('⛔ the coach runs the spec', () => {
  it('§3.1 + §3.2: the opening, then the first-time loading dialogue; "מוכן" is the start', async () => {
    const { view, c } = harness();
    await start(c, view);
    expect(said[0]).toBe('זה האימון הראשון שלך. המשקלים היום הם הצעה לפי משקל הגוף, לא לפי הכוח שלך. תגיד לי מה באמת עלה על המוט, ומהסט הראשון אני מתאימה.');
    expect(said[1]).toMatch(/^Upper A\. שני תרגילים, בערך .+ דקות\. מתחילים בלחיצת חזה במוט\.$/);
    expect(said[2]).toBe(
      'לחיצת חזה במוט. זו הפעם הראשונה שלך בתרגיל הזה, אז המשקל הוא הצעה: שישים קילו: המוט עשרים קילו, ועשרים קילו בכל צד. אם זה נראה לך קל מדי או כבד מדי, תגיד משקל אחר. שמונה עד עשר חזרות. כשהמוט טעון, תגיד: מוכן.',
    );
    expect(view().awaitingReady).toBe(true); // the lock screen offers Ready
    expect(ear?.ms).toBe(WINDOWS.loading); // the long window (§3.2)
    // Noise while loading is ignored and the window stays open.
    expect(ear!.onSentence('מה קורה אחי', 0.9)).toBe(true);
    // A different load: echoed, carried, the window stays open.
    await hear('חמישים', c, view);
    expect(said[said.length - 1]).toBe('חמישים קילו: המוט עשרים קילו, וחמישה עשר קילו בכל צד. כשהמוט טעון, תגיד: מוכן.');
    expect(view().currentTarget?.recommendedWeight).toBe(50);
    expect(view().livePlan[1].target?.recommendedWeight).toBe(50); // carried to the lift's later sets
    // "מוכן": go, the set is under way, no window open, the ask is due at start + reps × rep time + 15.
    await hear('מוכן', c, view);
    expect(said[said.length - 1]).toBe('קדימה.');
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
    expect(said).toEqual(['סיימת את הסט? כמה חזרות עשית?']);
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
    expect(said[0]).toBe('שישים קילו, שתים עשרה חזרות. נרשם.');
    expect(said[1]).toMatch(/^יותר מהטווח\. בסט הבא נעלה ל.+ קילו: תוסיף .+ בכל צד\.$/);
    expect(said[2]).toBe(`מנוחה: ${hebrewDuration(view().restSeconds)}.`);
    expect(view().displayPhase).toBe('REST_INTER');
    // The echo's tail is open for a correction (§3.5).
    expect(ear?.ms).toBe(WINDOWS.echoTail);
    await silence(c, view);
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
    expect(said[0]).toBe('שישים קילו, עשר חזרות. נרשם.');
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
    expect(said[0]).toMatch(/^סט שתיים מתוך שלוש\. עולים ל.+ קילו: תוסיף .+ בכל צד\. כשהמוט טעון, תגיד: מוכן\.$/);
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
    expect(said).toEqual(['סיימת את הסט? כמה חזרות עשית?']);
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
    expect(said[0]).toBe('שישים קילו, עשר חזרות. נרשם.');
    // The rest is whatever the store prescribes for this lift (a learned rest can move it between
    // runs of this file); the line must name THAT number.
    expect(said[said.length - 1]).toBe(`מנוחה: ${hebrewDuration(view().restSeconds)}.`);
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
    expect(said[0]).toBe('שישים קילו, שמונה חזרות. נרשם.');
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
    expect(said[0]).toBe('אין בעיה, נתחיל קל. ארבעים וחמישה קילו: המוט עשרים קילו, ושתים עשרה וחצי קילו בכל צד — עשרה קילו ושתיים וחצי קילו. תעשה כמה חזרות שיוצא בנוח, ותגיד לי כמה. כשהמוט טעון, תגיד: מוכן.');
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
    expect(said[said.length - 1]).toBe('כשתהיה מוכן, תלחץ על מוכן בשעון או במסך הנעילה.');
    expect(view().awaitingReady).toBe(true); // the card's Ready button carries the start from here
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
    expect(said).toEqual(['סיימת את הסט? זה הסט האחרון היום. כמה חזרות עשית?']);
    await silence(c, view);
    await advance(WINDOWS.reask, c, view);
    await silence(c, view);
    expect(view().loggedSets).toHaveLength(4); // the last set was NOT written
    expect(view().active).toBe(true);
    expect(said[said.length - 1]).toBe(NOT_HEARD);
    said = [];
    await hear('עשר', c, view);
    expect(view().active).toBe(false);
    expect(said.some((s) => /^סיימת את האימון\. שני תרגילים, .+ דקות\. הסיכום מחכה בטלפון\.$/.test(s))).toBe(true);
  });
});
