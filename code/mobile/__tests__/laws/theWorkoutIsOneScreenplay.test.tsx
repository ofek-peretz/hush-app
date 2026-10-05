/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WORKOUT IS ONE SCREENPLAY — a whole session, said and answered, line by line and second by second.
 *
 * Founder, 2026-10-05: *"אני מרגיש שזה מבוצע בצורה חפיפניקית ואני רוצה שזה יהיה הכי מסודר ומתוכנן שיש.
 * אני רוצה לעשות את זה ממש כמו waze של חדר הכושר + הקלט שהאפליקציה מקבלת מהמתאמן מה שיוצר את התחושה של
 * המאמן האישי."* — and, on the plan for it: *"אני מסכים. תוודא אבל במדויק שזה אכן תקין ובאמת מדמה את כל
 * מהלך האימון."*
 *
 * So this is the whole of one workout — the REAL session store and the REAL `VoiceConductor`, a fake
 * mouth, a fake ear and a clock in our hands — with a lifter who does what lifters do: says "מוכן" and
 * forgets to, reports his reps before he is asked and waits to be asked, counts aloud, corrects
 * himself, changes a weight, works a superset and holds a plank. Every line the coach says, every
 * time the microphone opens and for how long, and every row written, is pinned below with its second.
 *
 * It is `docs/canonical/FERROX_VOICE_SCREENPLAY.md` as a test: the document's timeline is this
 * transcript. Change one and the other is wrong.
 *
 * `SCREENPLAY_OUT=<file>` writes the transcript as it ran.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { AppContext } from '@/state/stores/appStore';
import { SessionProvider, useSession, type SessionView } from '@/state/stores/sessionStore';
import { initI18n, setLocale } from '@/i18n';
import { db } from '@/data/local/db';
import { exerciseDisplayName } from '@/data/exercises';
import { VoiceConductor } from '@/platform/voice/voiceConductor';
import type { PlannedSession } from '@/domain/coachPlan';

jest.mock('@/platform/restHaptics', () => ({
  REST_WARNING_LEAD_S: 7,
  phoneOwnsRestHaptics: () => true,
  restAlertDelays: () => ({ warnInS: null, doneInS: null }),
  restHaptics: { arm: jest.fn(async () => {}), disarm: jest.fn(async () => {}) },
}));
jest.mock('@/platform/coach/afterSession', () => ({ askAfterSession: jest.fn(async () => ({ ok: false, reason: 'offline' })) }));

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

/** A bar, a superset, a machine and a hold — every shape a day is made of. */
const PLAN: PlannedSession = {
  name: 'Upper A',
  blocks: [
    { rounds: 3, restS: 90, items: [{ kind: 'reps', ex: 'bb_bench_press', load: 60, reps: [8, 10] }] },
    { rounds: 2, restS: 60, items: [{ kind: 'reps', ex: 'triceps_pushdown', load: 25, reps: [12, 15] }, { kind: 'reps', ex: 'ez_bar_curl', load: 25, reps: [10, 12] }] },
    { rounds: 2, restS: 60, items: [{ kind: 'reps', ex: 'cable_row', load: 40, reps: [10, 12] }] },
    { rounds: 1, items: [{ kind: 'time', ex: 'plank', seconds: 45 }] },
  ],
};

let now = 0;
let t0 = 0;
let wake: any = null;
let timers: any[] = [];
let timerId = 0;
let ear: any = null;
let log: string[] = [];
const stamp = () => {
  const s = Math.round((now - t0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

beforeAll(async () => {
  await initI18n();
  await setLocale('he');
});

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}

/**
 * The screenplay, as it must run: `mm:ss  WHO  what`.
 *   COACH — a line she says · HE — what he says into an open microphone · MIC — the microphone opens
 *   (for how long, and what it expects) · ROW — a set written to his record · CHIME — the rest's end.
 * (The simulated mouth takes no time to speak, so a line and the window after it share a second; on a
 * phone the window opens when the line has been said.)
 */
const SCREENPLAY: string[] = [
  "00:00  COACH  אני המאמנת שלך. לפני כל סט, תגיד: מוכן. אחרי הסט, תגיד כמה חזרות. אם המשקל לא מתאים, תגיד משקל אחר.",
  "00:00  COACH  פלג עליון אלף. חמישה תרגילים, בערך עשרים וחמש דקות.",
  "00:00  COACH  לחיצת חזה במוט. משקל פתיחה: עשרים קילו בכל צד. שמונה עד עשר חזרות.",
  "00:00  MIC    opens · 90s · ready",
  "00:20  HE     \"מוכן\"",
  "00:20  COACH  קדימה.",
  "00:36  MIC    opens · 34s · set",
  "00:46  HE     \"עשר חזרות\"",
  "00:46  COACH  עשר חזרות. נרשם.",
  "00:46  COACH  אותו משקל.",
  "00:46  MIC    opens · 3s · reps",
  "00:46  ROW    לחיצת חזה במוט · 60 kg × 10",
  "00:49  COACH  מנוחה: דקה וחצי.",
  "02:06  COACH  עוד עשר שניות.",
  "02:16  CHIME",
  "02:16  COACH  סט שני מתוך שלושה.",
  "02:16  MIC    opens · 50s · set",
  "02:38  HE     \"עשר\"",
  "02:40  HE     \"אחת עשרה\"",
  "02:41  HE     \"שתים עשרה\"",
  "02:43  COACH  שתים עשרה חזרות. נרשם.",
  "02:43  COACH  תוסיף קילו ורבע בכל צד.",
  "02:43  MIC    opens · 3s · reps",
  "02:43  ROW    לחיצת חזה במוט · 60 kg × 12",
  "02:46  COACH  מנוחה: דקה וחצי.",
  "04:03  COACH  עוד עשר שניות.",
  "04:13  CHIME",
  "04:13  COACH  סט אחרון. עשרים ואחת ורבע קילו בכל צד.",
  "04:13  MIC    opens · 90s · ready",
  "04:43  HE     \"מוכן\"",
  "04:43  COACH  קדימה.",
  "04:59  MIC    opens · 34s · set",
  "05:30  COACH  כמה חזרות?",
  "05:30  MIC    opens · 6s · reps",
  "05:32  HE     \"תשע\"",
  "05:32  COACH  תשע חזרות. נרשם.",
  "05:32  MIC    opens · 3s · reps",
  "05:32  ROW    לחיצת חזה במוט · 62.5 kg × 9",
  "05:32  HE     \"לא, שמונה\"",
  "05:32  COACH  שמונה חזרות. נרשם.",
  "05:32  MIC    opens · 3s · reps",
  "05:32  ROW    לחיצת חזה במוט · 62.5 kg × 8 (corrected)",
  "05:35  COACH  התרגיל הבא: פשיטת מרפקים בפולי עליון, עשרים וחמישה קילו. מנוחה: שתי דקות.",
  "07:22  COACH  עוד עשר שניות.",
  "07:33  CHIME",
  "07:33  COACH  סופר סט. פשיטת מרפקים בפולי עליון: עשרים וחמישה קילו, שתים עשרה עד חמש עשרה חזרות. ואז כפיפת מרפקים במוט איזי: מוט של עשרים וחמישה קילו, עשר עד שתים עשרה חזרות.",
  "07:33  MIC    opens · 90s · ready",
  "07:58  HE     \"מוכן\"",
  "07:58  COACH  קדימה.",
  "08:42  MIC    opens · 62s · set",
  "09:41  COACH  כמה חזרות בפשיטת מרפקים בפולי עליון, וכמה בכפיפת מרפקים במוט איזי?",
  "09:41  MIC    opens · 8s · reps",
  "09:43  HE     \"חמש עשרה\"",
  "09:43  COACH  וכמה בכפיפת מרפקים במוט איזי?",
  "09:43  MIC    stays open · 4s",
  "09:43  HE     \"שתים עשרה\"",
  "09:43  COACH  פשיטת מרפקים בפולי עליון: חמש עשרה חזרות. כפיפת מרפקים במוט איזי: שתים עשרה חזרות. נרשם.",
  "09:43  MIC    opens · 3s · reps",
  "09:43  ROW    פשיטת מרפקים בפולי עליון · 25 kg × 15",
  "09:43  ROW    כפיפת מרפקים במוט EZ · 25 kg × 12",
  "09:46  COACH  מנוחה: דקה.",
  "10:33  COACH  עוד עשר שניות.",
  "10:43  CHIME",
  "10:43  COACH  סט אחרון.",
  "10:43  MIC    opens · 106s · set",
  "10:48  HE     \"מוכן\"",
  "10:48  COACH  קדימה.",
  "11:32  MIC    opens · 62s · set",
  "11:52  HE     \"ארבע עשרה ועשר\"",
  "11:52  COACH  פשיטת מרפקים בפולי עליון: ארבע עשרה חזרות. כפיפת מרפקים במוט איזי: עשר חזרות. נרשם.",
  "11:52  MIC    opens · 3s · reps",
  "11:52  ROW    פשיטת מרפקים בפולי עליון · 25 kg × 14",
  "11:52  ROW    כפיפת מרפקים במוט EZ · 25 kg × 10",
  "11:55  COACH  התרגיל הבא: חתירה בפולי בישיבה, ארבעים קילו. מנוחה: שתי דקות.",
  "13:42  COACH  עוד עשר שניות.",
  "13:52  CHIME",
  "13:52  COACH  חתירה בפולי בישיבה. משקל פתיחה: ארבעים קילו. עשר עד שתים עשרה חזרות.",
  "13:52  MIC    opens · 90s · ready",
  "14:00  HE     \"קל יותר\"",
  "14:00  COACH  שלושים ושבע וחצי קילו.",
  "14:00  MIC    stays open · 90s",
  "14:10  HE     \"מוכן\"",
  "14:10  COACH  קדימה.",
  "14:30  MIC    opens · 38s · set",
  "14:40  HE     \"שתים עשרה חזרות\"",
  "14:40  COACH  שתים עשרה חזרות. נרשם.",
  "14:40  COACH  אותו משקל.",
  "14:40  MIC    opens · 3s · reps",
  "14:40  ROW    חתירה בפולי בישיבה · 37.5 kg × 12",
  "14:43  COACH  מנוחה: דקה.",
  "15:30  COACH  עוד עשר שניות.",
  "15:40  CHIME",
  "15:40  COACH  סט אחרון.",
  "15:40  MIC    opens · 58s · set",
  "15:44  HE     \"מוכן\"",
  "15:44  COACH  קדימה.",
  "16:04  MIC    opens · 38s · set",
  "16:16  HE     \"סיימתי\"",
  "16:16  COACH  כמה חזרות?",
  "16:16  MIC    opens · 6s · reps",
  "16:17  HE     \"אחת עשרה\"",
  "16:17  COACH  אחת עשרה חזרות. נרשם.",
  "16:17  MIC    opens · 3s · reps",
  "16:17  ROW    חתירה בפולי בישיבה · 37.5 kg × 11",
  "16:20  COACH  התרגיל האחרון: פלאנק. מנוחה: שתי דקות.",
  "18:07  COACH  עוד עשר שניות.",
  "18:17  CHIME",
  "18:17  COACH  פלאנק, ארבעים וחמש שניות.",
  "18:17  MIC    opens · 90s · ready",
  "18:27  HE     \"מוכן\"",
  "18:27  COACH  קדימה.",
  "19:02  COACH  עוד עשר שניות.",
  "19:12  COACH  זהו. סיימת?",
  "19:12  MIC    opens · 6s · confirm",
  "19:13  HE     \"כן\"",
  "19:13  COACH  ארבעים וחמש שניות. נרשם.",
  "19:13  COACH  כל הכבוד. חמישה תרגילים, תשע עשרה דקות.",
];

test('⛔ one whole workout runs exactly as the screenplay says — every line, every window, every second', async () => {
  await db.clearAll();
  t0 = Math.round(new Date().getTime() / 1000) * 1000;
  now = t0;
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_t: string, cb: any) => {
    wake = cb;
    return { remove() {} } as never;
  });
  timers = [];
  log = [];
  ear = null;

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
  const V = () => view!;
  const mouth = { say: async (text: string) => void log.push(`${stamp()}  COACH  ${text}`), interrupt: () => {} };
  const fakeEar = {
    open: (opts: any) => {
      if (ear) throw new Error('a window opened over an open one');
      const w = { onSentence: opts.onSentence, onEnd: opts.onEnd, ms: opts.ms, openedAt: now };
      ear = w;
      log.push(`${stamp()}  MIC    opens · ${opts.ms / 1000}s · ${opts.expect}`);
      return {
        close: () => {
          if (ear === w) {
            ear = null;
            w.onEnd('closed');
          }
        },
        hold: () => {},
        extend: (ms: number) => {
          if (ear === w) {
            w.ms = ms;
            w.openedAt = now;
            log.push(`${stamp()}  MIC    stays open · ${ms / 1000}s`);
          }
        },
      };
    },
  };
  const audio = { duck: async () => {}, unduck: async () => {}, playChime: async () => void log.push(`${stamp()}  CHIME`) };
  const c = new VoiceConductor({
    mouth,
    ear: fakeEar,
    audio,
    now: () => now,
    setTimeout: (f: any, ms: number) => {
      const id = ++timerId;
      timers.push({ at: now + ms, f, id });
      return id;
    },
    clearTimeout: (id: number) => {
      timers = timers.filter((t) => t.id !== id);
    },
    getView: V,
    locale: () => ({ locale: 'he', units: 'kg' }),
    firstSessionEver: () => true,
    // The phone's own microphone, held for the workout — what the app ships with.
    earIsFree: () => true,
  });

  /** Every row as last seen — a new one is written, a changed one is a correction. */
  const rows: string[] = [];
  const look = async () => {
    await settle();
    for (let i = 0; i < 8; i++) {
      const seen = V();
      c.observe(seen);
      await settle();
      if (V() === seen) break;
    }
    V().loggedSets.forEach((r, i) => {
      const line = `${exerciseDisplayName(r.exerciseId)} · ${r.actualWeight ?? '—'} kg × ${r.actualReps}`;
      if (rows[i] === line) return;
      log.push(`${stamp()}  ROW    ${line}${rows[i] == null ? '' : ' (corrected)'}`);
      rows[i] = line;
    });
  };
  /** Move the clock to `at` (ms on the wall): the conductor's timers fire at their own instants on the way. */
  const until = async (at: number) => {
    for (;;) {
      const due = timers.filter((t) => t.at <= at).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = Math.max(now, due.at);
      timers = timers.filter((t) => t.id !== due.id);
      due.f();
      await look();
    }
    now = Math.max(now, at);
    await act(async () => {
      wake?.('active');
      await new Promise((r) => setTimeout(r, 0));
    });
    await look();
  };
  const wait = (s: number) => until(now + s * 1000);
  const says = async (text: string) => {
    if (!ear) throw new Error(`he said "${text}" and no microphone was open (${stamp()})`);
    log.push(`${stamp()}  HE     "${text}"`);
    await act(async () => {
      const e = ear;
      const keep = e.onSentence(text, 0.92);
      if (!keep && ear === e) {
        ear = null;
        e.onEnd('heard');
      }
      await new Promise((r) => setTimeout(r, 0));
    });
    await look();
  };
  /** The open window runs to its end with nothing said into it. */
  const quiet = async () => {
    const e = ear;
    if (!e) throw new Error(`no window to run out (${stamp()})`);
    await until(e.openedAt + e.ms);
    if (ear !== e) return; // something else closed or replaced it on the way
    ear = null;
    await act(async () => {
      e.onEnd('timeout');
      await new Promise((r) => setTimeout(r, 0));
    });
    await look();
  };
  /** Let the clock run, timer by timer, until the coach says a line containing `part`. */
  const untilCoach = async (part: string) => {
    const from = log.length;
    for (let i = 0; i < 80; i++) {
      if (log.slice(from).some((l) => l.includes('  COACH  ') && l.includes(part))) return;
      const due = timers.slice().sort((a, b) => a.at - b.at)[0];
      if (!due) throw new Error(`the coach never said "${part}" (${stamp()})`);
      await until(due.at);
    }
    throw new Error(`the coach never said "${part}" (${stamp()})`);
  };
  /** …or until the microphone opens. */
  const untilMic = async () => {
    for (let i = 0; i < 80 && !ear; i++) {
      const due = timers.slice().sort((a, b) => a.at - b.at)[0];
      if (!due) throw new Error(`no microphone opened (${stamp()})`);
      await until(due.at);
    }
  };
  /** The rest runs to its own end — the instant every surface counts to. */
  const rest = async () => {
    const end = V().restEndsAtMs;
    if (end == null) throw new Error(`not resting (${stamp()})`);
    await until(end + 200);
  };

  c.enable();
  await act(async () => V().startCoach(PLAN, 'coach_0'));
  await look();

  // ── 1 · THE BAR: bench press, three sets ────────────────────────────────────────────────────────
  // Set 1 — by the book: "מוכן", the set, and his reps the moment he racks the bar.
  await wait(20);
  await says('מוכן');
  await wait(26);
  await says('עשר חזרות');
  await quiet(); // the echo's three seconds: nothing to correct
  await rest();
  // Set 2 — he forgets "מוכן", lifts, and counts the last reps aloud.
  await wait(22);
  await says('עשר');
  await wait(1.5);
  await says('אחת עשרה');
  await wait(1.5);
  await says('שתים עשרה'); // over the range: the bar goes up
  await wait(3);
  await quiet();
  await rest();
  // Set 3 — the bar changed: he says "מוכן", says nothing after the set, and is asked.
  await wait(30);
  await says('מוכן');
  await wait(47);
  await wait(2);
  await says('תשע');
  await says('לא, שמונה'); // …and corrects himself inside the echo's three seconds
  await quiet();
  await rest();

  // ── 2 · THE SUPERSET: pushdown into curl, two rounds ────────────────────────────────────────────
  // Round 1 — "מוכן", both lifts, and he waits to be asked: one number, then the other by name.
  await wait(25);
  await says('מוכן');
  await untilCoach('כמה חזרות');
  await wait(2);
  await says('חמש עשרה');
  await says('שתים עשרה');
  await quiet();
  await rest();
  // Round 2 — "מוכן", and both numbers the moment he puts the bar down, before any question.
  await wait(5);
  await says('מוכן');
  await untilMic();
  await wait(20);
  await says('ארבע עשרה ועשר');
  await quiet();
  await rest();

  // ── 3 · THE MACHINE: seated row, two sets — and a weight he wants lighter ───────────────────────
  await wait(8);
  await says('קל יותר');
  await wait(10);
  await says('מוכן');
  await wait(30);
  await says('שתים עשרה חזרות');
  await quiet();
  await rest();
  await wait(4);
  await says('מוכן');
  await wait(32);
  await says('סיימתי');
  await wait(1);
  await says('אחת עשרה');
  await quiet();
  await rest();

  // ── 4 · THE HOLD: a plank, counted aloud ────────────────────────────────────────────────────────
  await wait(10);
  await says('מוכן');
  await untilCoach('זהו'); // ten seconds out, then the end
  await wait(1);
  await says('כן');
  await settle();
  await look();
  await until(now + 2_000);

  clock.mockRestore();
  if (process.env.SCREENPLAY_OUT) require('node:fs').writeFileSync(process.env.SCREENPLAY_OUT, log.join('\n'), 'utf8');
  expect(V().active).toBe(false);
  expect(log).toEqual(SCREENPLAY);
  // …and the document that states the screenplay says every one of these lines, word for word.
  const doc = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', '..', '..', '..', 'docs', 'canonical', 'FERROX_VOICE_SCREENPLAY.md'),
    'utf8',
  );
  const said = [...new Set(SCREENPLAY.filter((l) => l.includes('  COACH  ')).map((l) => l.split('  COACH  ')[1]))];
  expect(said.filter((line) => !doc.includes(line))).toEqual([]);
}, 120_000);
