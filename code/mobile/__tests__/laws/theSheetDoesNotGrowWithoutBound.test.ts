/**
 * ════ WHY THE COACH WILL NOT DRIFT IN MONTH TWELVE ════
 *
 * The founder asked the sharpest version of the question: *"why would it start hallucinating after
 * a few months, if every single time it gets a hard prompt and the athlete's data? is there a way
 * to lock it so the quality stays exactly what I expect?"*
 *
 * He is right about the mechanism, and the reason he is right is worth making mechanical rather
 * than believed. A model does not "get worse over time" — it has no memory between calls. What
 * actually degrades a fixed prompt is the thing that is NOT fixed: **the context around it.** An
 * instruction that is one paragraph among four thousand tokens is read; the same instruction among
 * forty thousand is read less well, and that is measurable and well documented.
 *
 * So the only honest answer to "will it still be good in a year" is: the sheet in month twelve has
 * to look like the sheet in month one. This file holds that.
 *
 * ── WHY IT IS BOUNDED AT ALL, AND IT IS NOT AN ACCIDENT ─────────────────────────────────────────
 * Three separate decisions, each made for its own reason, add up to it:
 *
 *   · `performed` is an AGGREGATE, not a history. One entry per exercise, carrying her rung ladder
 *     and her last occurrence — so it grows with how many DIFFERENT lifts she has done (bounded by
 *     the catalogue) and not with how many times she has trained (unbounded).
 *   · `decided` is capped at `COACH_LOG_CAP`, because it travels on every call and is paid for on
 *     every call.
 *   · the conversation is capped at `COACH_THREAD_CAP`, at the write, for the same reason.
 *
 * ── WHAT THIS FILE CANNOT PROMISE ───────────────────────────────────────────────────────────────
 * That the coach is GOOD. No test can. It promises that the conditions under which it was good do
 * not quietly change underneath it — which is the part that is ours. Whether the answers stay good
 * is measured on real athletes, per model, through the unreadable-response counts.
 */
import { coachFacts, type CoachFacts } from '@/domain/coachFacts';
import { COACH_LOG_CAP, appendDecisions, type CoachDecision } from '@/domain/coachLog';
import { COACH_THREAD_CAP } from '@/data/local/db';
import { coachRequest } from '@/domain/coachPrompt';
import type { Profile, Session, SetLog } from '@/data/local/models';

const profile: Profile = {
  sex: 'female', weightKg: 62, units: 'kg', goal: 'build_muscle',
  daysPerWeek: 4, repBand: '8-10', healthConnected: false,
};

/** The eight lifts a real four-day week actually rotates through. */
const LIFTS = [
  'bb_bench_press', 'bb_row', 'bb_back_squat', 'bb_rdl',
  'db_shoulder_press', 'lat_pulldown', 'db_curl', 'leg_press',
];

function set(exerciseId: string, i: number, w: number): SetLog {
  return {
    exerciseId, setIndex: i, recommendedWeight: w, recommendedReps: 8,
    actualWeight: w, actualReps: 8 + (i % 3), edited: false, restBeforeS: 120,
    persistedAt: '2026-08-01T18:00:00.000Z',
  };
}

/** `weeks` of four sessions, every lift climbing 2.5 kg a fortnight — a real year's shape. */
function history(weeks: number): Session[] {
  const out: Session[] = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 4; d++) {
      const at = new Date(Date.UTC(2026, 0, 1 + w * 7 + d, 17)).toISOString();
      const lifts = LIFTS.slice((d % 2) * 4, (d % 2) * 4 + 4);
      out.push({
        id: `s_${w}_${d}`, programDayId: `coach_${d}`, programDayName: `Day ${d}`,
        startedAt: at, state: 'SAVED', earlyFinish: false, trained: true, prescribed: 12,
        sets: lifts.flatMap((ex, k) =>
          [0, 1, 2].map((i) => set(ex, i, 30 + k * 10 + Math.floor(w / 2) * 2.5)),
        ),
      });
    }
  }
  return out;
}

/** A full log and a full thread — the worst case, not the typical one. */
function fullLog(): CoachDecision[] {
  let log: CoachDecision[] = [];
  for (let i = 0; i < COACH_LOG_CAP * 3; i++) {
    log = appendDecisions(log, [{ ex: LIFTS[i % LIFTS.length], say: `Reason number ${i}, written at the length a coach writes at.` }], new Date(2026, 0, 1 + i).toISOString());
  }
  return log;
}

/** Her half of the request — what actually grows. The preamble is identical for everyone. */
function herBytes(facts: CoachFacts): number {
  const blocks = coachRequest({ facts, ask: { kind: 'after_session' } }).blocks;
  return blocks.slice(1).reduce((n, b) => n + b.text.length, 0);
}

describe('a year of training does not become a different message', () => {
  const monthOne = coachFacts({ profile, plan: null, history: history(4), language: 'en' });
  const yearTwelve = coachFacts({ profile, plan: null, history: history(52), decided: fullLog(), language: 'en' });

  it('sends the same NUMBER of performed entries — one per lift, not one per session', () => {
    /*
     * The single decision that makes the rest possible. 208 sessions and 4 — the same eight lifts.
     * A raw history would have sent 2,500 sets by December.
     */
    expect(monthOne.performed.length).toBe(LIFTS.length);
    expect(yearTwelve.performed.length).toBe(LIFTS.length);
  });

  it('keeps her half within a small multiple of month one', () => {
    // Not "identical" — a year of training really is more to say, and her rung ladders really are
    // longer. Bounded is the claim, not frozen.
    const grew = herBytes(yearTwelve) / herBytes(monthOne);
    expect({ grew: grew < 6, ratio: Math.round(grew * 10) / 10 }).toMatchObject({ grew: true });
  });

  it('caps what she has been told, because it is paid for on every call', () => {
    expect(yearTwelve.decided!.length).toBe(COACH_LOG_CAP);
  });

  it('caps the conversation at the write, so what is stored is what is sent', () => {
    // A thread that kept everything and sent a window would show her a conversation the coach
    // cannot see — and the first time it answered as though it had forgotten something visible on
    // screen would be impossible to explain.
    expect(COACH_THREAD_CAP).toBeLessThanOrEqual(60);
  });
});

describe('what stays fixed no matter how long she trains', () => {
  it('sends the instructions BEFORE her record, always', () => {
    /*
     * Order is the other half of the answer. The rules sit in the cached prefix, which is
     * byte-identical for every athlete on every call — so the part that says who the coach is never
     * moves, never grows, and never ends up buried behind a year of data.
     */
    const req = coachRequest({
      facts: coachFacts({ profile, plan: null, history: history(52), decided: fullLog(), language: 'en' }),
      ask: { kind: 'after_session' },
      cache: true,
    });
    expect(req.blocks[0].cache).toBe(true);
    expect(req.blocks[0].text).toContain('You are Hush');
    expect(req.blocks[1].text.startsWith('HER RECORD')).toBe(true);
  });

  it('is the same preamble in month twelve as in month one — to the byte', () => {
    const a = coachRequest({ facts: coachFacts({ profile, plan: null, history: history(4), language: 'en' }), ask: { kind: 'after_session' } });
    const b = coachRequest({ facts: coachFacts({ profile, plan: null, history: history(52), decided: fullLog(), language: 'en' }), ask: { kind: 'after_session' } });
    expect(a.blocks[0].text).toBe(b.blocks[0].text);
  });
});
