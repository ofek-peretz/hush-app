/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH IS NEVER TOLD LESS THAN THE ENGINE COULD SEE.
 *
 * Founder, 2026-08-02, and it is the sentence the whole AI layer stands or falls on:
 *
 *   > *"The most important thing is that the AI is genuinely good, and that there is never a
 *   > situation where it is dumber than the engine we had."*
 *
 * The engine read her whole history. It knew, mechanically, that a lift had not moved in four
 * sessions (S-32b — a stall holds), that her reps had fallen at a load she used to clear, and how
 * long it had been since she last trained a movement (the absence path). Those were the inputs to
 * every decision it made between sessions.
 *
 * When the decision moved to the coach, the sheet did not move with it. `performed` carried the rung
 * ladder, the last load and the last reps — a summary with no time in it. Measured against a real
 * twelve-week history, a bench stuck at 40 kg for four sessions with the reps down from 9 to 6
 * arrived as:
 *
 *     rungs: [30, 32.5, 35, 37.5, 40], lastLoad: 40, lastReps: [6, 6, 6], occurrences: 8
 *
 * A ladder climbing to 40 and a set of 6 on it. It reads like a lift that has just gone up. The one
 * thing the coach needed to know — that it has been there a month and is going backwards — was not
 * in the message at all.
 *
 * This file is the standing check on that class: what the engine could see, the coach is told.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { coachFacts } from '@/domain/coachFacts';
import type { Profile, Session, SetLog } from '@/data/local/models';

const profile: Profile = {
  sex: 'female', weightKg: 62, units: 'kg', goal: 'build_muscle', daysPerWeek: 4, healthConnected: false,
};

const NOW = Date.UTC(2026, 5, 26);
const DAY = 86_400_000;

/** One session, `daysAgo` back, one lift at one load for the given reps. */
function session(id: string, daysAgo: number, ex: string, load: number, reps: number[], effort?: string): Session {
  const at = new Date(NOW - daysAgo * DAY).toISOString();
  const sets: SetLog[] = reps.map((r, setIndex) => ({
    exerciseId: ex, setIndex, recommendedWeight: load, recommendedReps: 8,
    actualWeight: load, actualReps: r, edited: false, restBeforeS: 90, persistedAt: at,
  }));
  return {
    id, programDayId: 'd', startedAt: at, state: 'SAVED', earlyFinish: false, trained: true, sets,
    ...(effort ? { effort: [{ exerciseId: ex, level: effort as never, at }] } : {}),
  };
}

/** Her bench: climbed to 40, and has been stuck there for four sessions with the reps falling. */
const STALLED: Session[] = [
  session('a', 40, 'bb_bench_press', 32.5, [9, 9, 9]),
  session('b', 33, 'bb_bench_press', 35, [9, 9, 8]),
  session('c', 26, 'bb_bench_press', 40, [8, 7, 6]),
  session('d', 19, 'bb_bench_press', 40, [7, 6, 6]),
  session('e', 12, 'bb_bench_press', 40, [6, 6, 6]),
  session('f', 5, 'bb_bench_press', 40, [6, 6, 5], 'hard'),
];

const sheet = (history: Session[]) => coachFacts({ profile, plan: null, history, nowMs: NOW });
const bench = (history: Session[]) => sheet(history).performed.find((p) => p.ex === 'bb_bench_press')!;


describe('a stall is visible', () => {
  it('states each of the last sessions on the lift, newest first', () => {
    const r = bench(STALLED).recent;
    expect(r.map((o) => o.load)).toEqual([40, 40, 40, 40, 35, 32.5]);
    expect(r[0].reps).toEqual([6, 6, 5]);
  });

  it('⚠️ four sessions at one load are FOUR SESSIONS, not one number', () => {
    // The whole defect in one assertion: the summary could not distinguish "she just reached 40"
    // from "she has been at 40 for a month", and those need opposite decisions.
    const atLast = bench(STALLED).recent.filter((o) => o.load === 40).length;
    expect(atLast).toBe(4);
  });

  it('shows the reps FALLING at a load she used to clear', () => {
    // 9 at 32.5 → 6 at 40, three sessions running. A lift going backwards, not settling.
    const r = bench(STALLED).recent;
    const best = (o: { reps: number[] }) => Math.max(...o.reps);
    expect(best(r[0])).toBeLessThan(best(r.at(-1)!));
  });

  it('says WHEN, so a lift trained on Tuesday differs from one untouched since March', () => {
    const r = bench(STALLED).recent;
    expect(r.map((o) => o.ago)).toEqual([5, 12, 19, 26, 33, 40]);
  });

  /*
   * ⚠️ THE EFFORT ANSWER IS GONE, AND THIS ASSERTION WENT WITH IT — founder, 2026-08-02:
   * *"Take it off completely. The AI should give the athlete instructions according to their goal.
   * And what about someone who just trains for fun?"*
   *
   * The mid-workout "how did that go?" beat is deleted, so nothing writes the answer and the sheet
   * no longer carries the field. What replaces the signal is not nothing: the coach sets a rep band
   * and `recent` still carries every set's reps against it, which is the same information without
   * an interrogation. How it should ask, if it ever should, is prompt work reserved for the founder
   * and me together.
   */

  it('keeps the ladder as well — every rung she has ever used exists in her gym', () => {
    expect(bench(STALLED).rungs).toEqual([32.5, 35, 40]);
  });
});

describe('the window is bounded, and the bound is on the SHAPE', () => {
  it('sends the most recent occurrences and stops', () => {
    const many = Array.from({ length: 20 }, (_, i) => session(`s${i}`, 100 - i * 5, 'bb_bench_press', 30 + i, [8, 8, 8]));
    const r = bench(many).recent;
    expect(r.length).toBeLessThanOrEqual(6);
    expect(r[0].ago).toBe(5); // newest first, whatever the history's own order
  });

  it('costs a bounded number of tokens per lift, however long she has trained', () => {
    // Same rule as the catalogue's ceiling: a lift added is expected and cheap, a FIELD added is
    // paid on every lift of every athlete on every call.
    const lifts = ['bb_bench_press', 'bb_row', 'bb_back_squat', 'bb_deadlift', 'bb_overhead_press'];
    const history = lifts.flatMap((ex, k) =>
      Array.from({ length: 12 }, (_, i) => session(`${ex}${i}`, 90 - i * 7, ex, 30 + k, [8, 8, 8])),
    );
    const performed = sheet(history).performed;
    const perLift = JSON.stringify(performed).length / performed.length;
    expect(perLift).toBeLessThan(420);
  });
});
