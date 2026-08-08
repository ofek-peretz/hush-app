/**
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * A REAL REPLY FROM THE REAL MODEL SURVIVES THE WHOLE CHAIN.
 *
 * Every fixture in this suite was written by me, which means every one of them is a guess about what
 * the model does. On 2026-08-02 the coach was asked for the first time since the sheet grew, and the
 * three answers it gave found three defects that 1,635 green tests did not:
 *
 *   1 Â· **`brief` ran away.** One free string, capped only in our parse and in prose, came back as
 *       7,883 characters of the same four facts repeating until `MAX_TOKENS` â€” a truncated reply
 *       with no programme in it at all. A cap the answerer cannot see is not a cap. It is a bounded
 *       LIST now, because `maxItems` is the one bound the Worker's translator forwards.
 *
 *   2 Â· **It said "I've built you a three-day plan" and attached nothing.** Twice, with
 *       `finishReason: STOP` â€” not truncated, finished. A programme is fifteen hundred tokens of
 *       work and the intake schema lets it be omitted; acknowledging is cheaper. Prose could not fix
 *       it and did not; `useCoach` re-asks once with `sessions` in `required`.
 *
 *   3 Â· **AND THE PARSE THREW THE PROGRAMME AWAY.** Three good sessions â€” her days, her injury
 *       honoured, no lunges â€” rejected on `sit_up`, because the coach omitted `load` on a
 *       bodyweight exercise. The schema permits that and every other shape already allowed it; only
 *       `reps` compared `!== null`, so `undefined` failed. **One omitted optional field on one item
 *       and she gets no week.**
 *
 * This file pins the reply itself. It is not a fixture in the usual sense â€” it is evidence, and the
 * point of keeping it is that the next person to change the parse is arguing with the model rather
 * than with me.
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 */
// @ts-nocheck

// 

import { parseCoachPlan } from '@/domain/coachPlan';
import { coachFacts } from '@/domain/coachFacts';
import { coachWeek, queuedWorkout } from '@/domain/coachWeek';
import { buildPlanFromCoach, restAfterStep } from '@/state/stores/sessionStore';
import type { Profile } from '@/data/local/models';

const profile: Profile = {
  name: 'Maya', sex: 'female', weightKg: 62, units: 'kg', goal: 'build_muscle',
  daysPerWeek: 3, healthConnected: false, repBand: '8-10', workoutMinutes: 60,
};

/**
 * `gemini-3.6-flash`, 2026-08-02, verbatim â€” the reply to one Hebrew intake message naming a half
 * marathon in April, a left shoulder that rules out overhead pressing, 62 kg, three days of sixty
 * minutes, and a refusal to do lunges. Trimmed only of the `say` and `brief` prose, which are hers
 * to read and not this file's business.
 */
const LIVE = JSON.stringify({
  say: '× ×¢×™× ×œ×”×›×™×¨, ×× ×™ ×”×•×©. ×‘× ×™×ª×™ ×œ×š ×ª×•×›× ×™×ª ×©×œ ×©×œ×•×©×” ×™×ž×™× ×‘×©×‘×•×¢.',
  learned: { weightKg: 62, daysPerWeek: 3, minutes: 60 },
  brief: ['×™×¢×“: ×—×¦×™ ×ž×¨×ª×•×Ÿ ×‘××¤×¨×™×œ.', '×¨×’×™×©×•×ª ×‘×›×ª×£ ×©×ž××œ â€” ×œ×œ× ×œ×—×™×¦×•×ª ×ž×¢×œ ×”×¨××©.', '×œ×œ× ×œ×× ×’×™×.'],
  sessions: [
    {
      day: 'sun',
      name: '××™×ž×•×Ÿ 1 - ×›×•×— ×‘×¡×™×¡×™ ×•××™× ×˜×¨×•×•×œ×™×',
      blocks: [
        { rounds: 3, restS: 90, items: [
          { kind: 'reps', ex: 'goblet_squat', reps: [8, 10], load: 12 },
          { kind: 'reps', ex: 'db_bench_press', reps: [8, 12], load: 10 },
        ] },
        { rounds: 1, restS: 0, items: [{ kind: 'distance', ex: 'run_outdoor', metres: 3000 }] },
      ],
    },
    {
      day: 'tue',
      name: '××™×ž×•×Ÿ 2 - ×—×™×–×•×§ ×¨×¦×™× ×•×œ×™×‘×”',
      blocks: [
        { rounds: 3, restS: 90, items: [{ kind: 'reps', ex: 'hip_thrust', reps: [10, 12], load: 30 }] },
        // âš ï¸ THE ITEM THAT KILLED THE WHOLE PROGRAMME: a reps item with no `load` at all.
        { rounds: 3, restS: 60, items: [{ kind: 'reps', ex: 'sit_up', reps: [10, 12] }] },
        { rounds: 3, restS: 60, items: [{ kind: 'time', ex: 'plank', seconds: 45 }] },
      ],
    },
    {
      day: 'thu',
      name: '××™×ž×•×Ÿ 3 - × ×¤×— ×¨×™×¦×”',
      blocks: [{ rounds: 1, restS: 0, items: [{ kind: 'distance', ex: 'run_outdoor', metres: 5000 }] }],
    },
  ],
});

const parsed = () => parseCoachPlan(LIVE, coachFacts({ profile, plan: null, history: [], language: 'he' }));

describe('the reply the model actually sent', () => {
  it('âš ï¸ parses at all â€” a bodyweight item with no load is bodyweight, not malformed', () => {
    const r = parsed();
    expect(r.ok ? 'ok' : `${r.reason} at ${r.at}`).toBe('ok');
  });

  it('reads an omitted load as bodyweight, exactly as an explicit null is read', () => {
    const r = parsed();
    if (!r.ok) throw new Error('unreachable');
    const items = r.answer.plan!.sessions.flatMap((s) => s.blocks.flatMap((b) => b.items));
    const deadBug = items.find((i) => i.ex === 'sit_up')!;
    expect(deadBug).toMatchObject({ kind: 'reps', load: null });
  });

  it('changes not one load â€” the coach lands on real rungs by itself', () => {
    // `snapped` is the count of loads the typist had to move. Zero is the whole argument for telling
    // the coach each equipment's grain instead of correcting it afterwards.
    const r = parsed();
    expect(r.ok && r.snapped).toBe(0);
  });

  it('carries what she said about herself into the record', () => {
    const r = parsed();
    expect(r.ok && r.answer.learned).toEqual({ weightKg: 62, daysPerWeek: 3, minutes: 60 });
    expect(r.ok && r.answer.brief!.length).toBe(3);
  });

  it('names its days, and Tuesday offers the Tuesday session', () => {
    const r = parsed();
    if (!r.ok) throw new Error('unreachable');
    const week = coachWeek(r.answer.plan!);
    expect(week.map((w) => w.day)).toEqual(['sun', 'tue', 'thu']);
    expect(queuedWorkout(week, [], Date.parse('2026-08-04T09:00:00Z'))?.day).toBe('tue');
  });

  it('runs as a session â€” supersets chained, a run among the sets', () => {
    const r = parsed();
    if (!r.ok) throw new Error('unreachable');
    const steps = buildPlanFromCoach(r.answer.plan!.sessions[0]);
    // Three rounds of squatâ†’bench with no rest between the two lifts: three chained steps.
    expect(steps.filter((s) => restAfterStep(s) === 0 && !s.lastSetOfSession)).toHaveLength(3);
    expect([...new Set(steps.map((s) => s.item?.kind))].sort()).toEqual(['distance', 'reps']);
  });

  it('âš ï¸ admits it cannot price a session containing a run', () => {
    // `timeOf` has no pace to price a distance with, so a workout built around 5 km came out as
    // "~6 min" on the first screen she opens. The flag existed and nothing read it.
    const r = parsed();
    if (!r.ok) throw new Error('unreachable');
    const week = coachWeek(r.answer.plan!);
    expect(week.map((w) => w.hasUncountedWork)).toEqual([true, false, true]);
  });
});
