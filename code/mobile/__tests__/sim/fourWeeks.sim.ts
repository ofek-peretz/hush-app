/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * FOUR REAL WEEKS THROUGH THE REAL COACH — the thing that has never been done.
 *
 * ⛔ FOUNDER, 2026-08-04: *"we run tests on tests and builds on builds, but what do we actually need
 * to do to beat our competitors? What's the plan?"* — and the first move he picked:
 *
 *   > *"If the programmes the coach writes in week 3 are not good, nothing else matters."*
 *
 * The deterministic engine had a 16-week simulation. **The coach has never been run for more than
 * one session.** Every check so far has been screen-by-screen: does the field arrive, does the
 * screen draw it, does the law hold. None of them can answer the only question that decides whether
 * this product is worth using — *is the training any good, four weeks in?*
 *
 * ── ⚠️ THIS MAKES REAL, BILLED CALLS ────────────────────────────────────────────────────────────
 * It is NOT a test and must never run in CI: `.sim.ts`, outside the `*.test.ts` pattern, run by hand.
 * Seventeen calls, roughly $0.70. The output is meant to be READ, not asserted — the founder asked
 * for text he can judge, not a green tick.
 *
 *   npx jest --testMatch "**\/*.sim.ts" --testTimeout 900000
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
/*
 * ⚠️ THE ENV MUST BE LOADED BEFORE `coachClient` IS. It reads `EXPO_PUBLIC_*` at MODULE LOAD, and
 * Expo normally inlines those at build time — jest never sees them, so the first run answered
 * `not_configured` without making a call at all. `.env` is read here and the client is `require`d
 * inside the test, after these are set.
 */
import fs from 'fs';
import path from 'path';
for (const l of fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8').split('\n')) {
  const i = l.indexOf('=');
  if (i > 0 && l.startsWith('EXPO_PUBLIC')) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}

import { coachFacts } from '@/domain/coachFacts';
import { coachRequest } from '@/domain/coachPrompt';
import { COACH_DECISION_SCHEMA, parseCoachPlan, type CoachPlan, type PlannedSession } from '@/domain/coachPlan';
import { runSteps } from '@/domain/planRun';
import type { Profile, Session, SetLog } from '@/data/local/models';

jest.setTimeout(900_000);

/**
 * HER.
 *
 * Deliberately not a blank slate: a real athlete with a constraint the coach has to plan around and
 * a goal in her own words. A simulation of an easy case proves nothing — the interesting question is
 * whether the coach still respects her shoulder in week four, when the conversation that mentioned
 * it is long gone and only `brief` remembers.
 */
const HER: Profile = {
  name: 'Maya',
  sex: 'female',
  age: 34,
  weightKg: 62,
  startWeightKg: 62,
  experience: 'intermediate',
  daysPerWeek: 4,
  workoutMinutes: 60,
  units: 'kg',
  goal: 'build_muscle',
  healthConnected: false,
  repBand: '8-10',
  goalText: 'Get visibly stronger and put some size on my shoulders and back.',
  limitsText: 'Left shoulder — it clicks and aches on overhead pressing. Nothing else.',
};

/**
 * HOW SHE PERFORMS, week by week — the part that makes this a simulation rather than a demo.
 *
 * The coach only ever sees numbers. So the story is told in numbers: she is strong on pulling and
 * stalls on pressing, she misses a session in week 2 because life happened, and in week 4 one lift
 * goes backwards. If the coach is any good, all three should be visible in what it writes.
 */
function repsFor(week: number, ex: string, bandLo: number, bandHi: number): number {
  const pull = /row|pulldown|pull_up|curl|face_pull|shrug/.test(ex);
  const press = /press|dip|fly|push/.test(ex);
  if (pull) return bandHi + (week >= 2 ? 2 : 1);          // clears the ceiling — should be raised
  if (press && week === 4) return Math.max(1, bandLo - 2); // week 4: it goes backwards
  if (press) return bandLo;                                // sits on the floor — a stall
  return Math.round((bandLo + bandHi) / 2);                // everything else, comfortably inside
}

const iso = (dayOffset: number) => new Date(Date.UTC(2026, 7, 4 + dayOffset, 18, 0, 0)).toISOString();

/** Turn a planned session into the record of her having done it. */
function perform(plan: PlannedSession, week: number, dayOffset: number, n: number): Session {
  const sets: SetLog[] = [];
  for (const st of runSteps(plan)) {
    if (st.item.kind !== 'reps') continue;
    const [lo, hi] = st.item.reps;
    const reps = repsFor(week, st.item.ex, lo, hi);
    sets.push({
      exerciseId: st.item.ex,
      setIndex: st.round - 1,
      recommendedWeight: st.item.load,
      recommendedReps: lo,
      actualWeight: st.item.load,
      actualReps: reps,
      edited: false,
      restBeforeS: 90,
      persistedAt: iso(dayOffset),
    });
  }
  return {
    id: `s-w${week}-${n}`,
    programDayId: `d${n}`,
    programDayName: plan.name,
    startedAt: iso(dayOffset),
    state: 'SAVED',
    earlyFinish: false,
    trained: true,
    sets,
  };
}

const line = (s: string) => console.log(s);
const rule = () => line('─'.repeat(96));

/** Print a programme the way the athlete would meet it. */
function showPlan(plan: CoachPlan, say: string) {
  line(`\n  SAY → ${say}`);
  if (plan.title) line(`  TITLE → ${plan.title}`);
  if (plan.why) line(`  WHY   → ${plan.why}`);
  for (const s of plan.sessions) {
    const lifts = s.blocks.flatMap((b) =>
      b.items.map((i) =>
        i.kind === 'reps'
          ? `${i.ex} ${b.rounds}×${i.reps[0]}-${i.reps[1]} @ ${i.load ?? 'bw'}`
          : i.kind === 'time' ? `${i.ex} ${b.rounds}×${i.seconds}s`
          : i.kind === 'distance' ? `${i.ex} ${b.rounds}×${i.metres}m`
          : `${i.ex} (open)`,
      ),
    );
    line(`  · ${s.name}${s.day ? ` [${s.day}]` : ''}`);
    for (const l of lifts) line(`      ${l}`);
  }
  for (const n of plan.notes ?? []) line(`  NOTE  ${n.ex ?? '—'} → ${n.say}`);
}

describe('four weeks with the real coach', () => {
  it('builds, trains, and decides — sixteen sessions', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { askCoach } = require('@/platform/coach/coachClient') as typeof import('@/platform/coach/coachClient');
    let plan: CoachPlan | null = null;
    let brief: string[] = [];
    const history: Session[] = [];
    const decided: { ex?: string; say: string; at: string }[] = [];

    rule();
    line('WEEK 0 · THE FIRST PROGRAMME');
    rule();
    const first = await askCoach(
      coachRequest({
        facts: coachFacts({ profile: HER, plan: null, history: [], language: 'en' }),
        ask: { kind: 'first_programme' },
      }),
      COACH_DECISION_SCHEMA as unknown as Record<string, unknown>,
    );
    if (!first.ok) { line(`  ⛔ FAILED: ${first.reason}`); return; }
    const built = parseCoachPlan(first.text);
    if (!built.ok || !built.answer.plan) { line(`  ⛔ UNREADABLE: ${built.ok ? 'no plan' : built.reason}`); return; }
    plan = built.answer.plan;
    brief = built.answer.brief ?? [];
    showPlan(plan, built.answer.say);
    line(`\n  BRIEF (its memory of her):`);
    for (const b of brief) line(`      · ${b}`);

    let day = 0;
    for (let week = 1; week <= 4; week += 1) {
      rule();
      line(`WEEK ${week}`);
      rule();
      for (let n = 0; n < plan.sessions.length; n += 1) {
        day += 2;
        // Week 2, third session: life happened. The coach should notice a gap, not a failure.
        if (week === 2 && n === 2) { line(`\n  (she missed ${plan.sessions[n].name})`); continue; }

        const done = perform(plan.sessions[n], week, day, n);
        history.unshift(done);
        const reps = done.sets.map((s) => s.actualReps).join('·');
        line(`\n  ${plan.sessions[n].name} — reps ${reps}`);

        const reply = await askCoach(
          coachRequest({
            facts: coachFacts({
              profile: HER, plan, history, justFinished: done, brief, decided, language: 'en',
            }),
            ask: { kind: 'after_session' },
          }),
          COACH_DECISION_SCHEMA as unknown as Record<string, unknown>,
        );
        if (!reply.ok) { line(`      ⛔ call failed: ${reply.reason}`); continue; }
        const parsed = parseCoachPlan(reply.text);
        if (!parsed.ok) { line(`      ⛔ unreadable: ${parsed.reason}`); continue; }

        line(`      SAY → ${parsed.answer.say}`);
        for (const note of parsed.answer.plan?.notes ?? []) line(`      NOTE ${note.ex ?? '—'} → ${note.say}`);
        for (const note of parsed.answer.plan?.notes ?? []) decided.push({ ...note, at: iso(day) });
        if (parsed.answer.plan) plan = parsed.answer.plan;
        if (parsed.answer.brief?.length) brief = parsed.answer.brief;
      }
    }

    rule();
    line('AFTER FOUR WEEKS — the programme she is now on');
    rule();
    showPlan(plan, '(current)');
    line(`\n  BRIEF:`);
    for (const b of brief) line(`      · ${b}`);
    rule();
  });
});
