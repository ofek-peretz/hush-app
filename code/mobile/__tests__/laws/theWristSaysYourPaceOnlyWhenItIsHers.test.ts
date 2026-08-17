/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * "YOUR PACE" — ON A NUMBER THE COACH WROTE.
 *
 * ⛔ FOUNDER'S LIST, 2026-08-16, the last item: make the wrist's badge honest.
 *
 * S-17 says her measured rest becomes the prescription, and WT5 says the wrist must SAY so when it
 * happens — *"without it the wrist silently uses her pace and never tells her, which is the app
 * doing something FOR her without her knowing"*. The phone-mirrored path has carried an honest
 * `restIsLearned` for months. The STANDALONE path — the watch running a workout with the phone in a
 * locker — inferred it:
 *
 *     restIsLearned: cur.restInterS != nil          // LocalWorkoutEngine.swift
 *
 * That is true of her learned median AND of a rest the COACH wrote for the block. So on the one
 * surface she stares at between sets, a number she had never produced wore her name.
 *
 * ── ⚠️ WHY IT SAT THERE, AND WHY THAT REASON DID NOT SURVIVE ────────────────────────────────────
 * `buildCoachWatchPlan`'s own note called it *"still imprecise, and deliberately left so… a schema
 * bump plus a matching Swift decode that cannot be exercised from here."* Both halves were wrong:
 *
 *   · It needs no schema bump. `restIsLearned` rides as an OPTIONAL key exactly as `lastReps` does —
 *     an older watch ignores a key it has never heard of, a newer watch reading an older plan
 *     decodes `nil`, and nil draws what it always drew.
 *   · "Cannot be exercised from here" is true of a Swift COMPILER and false of a Swift SOURCE FILE.
 *     `watchCopyPack.test.ts` already keeps a Swift constant honest by reading it as text. This does
 *     the same for the one line that decides whether the badge lights.
 *
 * ⚠️ THIS IS A SOURCE READER AND IT SAYS SO. It cannot prove the watch renders correctly; it proves
 * the wrist no longer INFERS the fact, and that the phone only ever claims it on her own branch.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';
import { buildCoachWatchPlan } from '@/platform/watch/watchPlan';

const ROOT = path.resolve(__dirname, '..', '..');
const swift = (f: string) => fs.readFileSync(path.join(ROOT, 'targets', 'watch', f), 'utf8');

/** One coach session: a block whose rest the COACH set, and a block that leaves it to her. */
const plan = (coachRestS: number | null) => ({
  nowMs: Date.UTC(2026, 7, 16, 9, 0, 0),
  sessions: [
    {
      id: 'c0',
      name: 'Upper A',
      blocks: [
        {
          rounds: 2,
          ...(coachRestS != null ? { restS: coachRestS } : {}),
          items: [{ kind: 'reps', ex: 'bb_bench_press', load: 40, reps: [8, 10] }],
        },
      ],
    },
  ],
});

const build = (coachRestS: number | null, hers: number | null) =>
  buildCoachWatchPlan({
    ...plan(coachRestS),
    restInterS: 90,
    restTransitionS: 120,
    restInterSFor: () => hers,
  } as never);

const firstStep = (snap: unknown) => (snap as { workouts: { steps: unknown[] }[] }).workouts[0].steps[0] as Record<string, unknown>;

describe('⛔ the phone only claims her pace on her own number', () => {
  it('HER learned median → the step says so', () => {
    const step = firstStep(build(null, 75));
    expect(step.restInterS).toBe(75);
    expect(step.restIsLearned).toBe(true);
  });

  it('⛔ the COACH’s rest → the step does NOT say so, and that is the whole defect', () => {
    const step = firstStep(build(150, 75));
    expect(step.restInterS).toBe(150); // the coach's number still runs the timer (S-48)
    expect(step.restIsLearned).toBeUndefined();
  });

  it('⛔ no rest known at all → nothing is claimed', () => {
    const step = firstStep(build(null, null));
    expect(step.restInterS).toBeUndefined();
    expect(step.restIsLearned).toBeUndefined();
  });

  it('⚠️ and `restInterSFor` returning null IS how the phone says "she has not earned one"', () => {
    // `Home` passes `restIsLearnedFor(id) ? restInterSecondsFor(id) : null` — so reaching the second
    // branch at all is the evidence gate (F-17), already applied. Nothing is re-decided here.
    const src = fs.readFileSync(path.join(ROOT, 'src', 'screens', 'home', 'Home.tsx'), 'utf8');
    expect(src).toMatch(/restIsLearnedFor\(exerciseId\) \? restInterSecondsFor\(exerciseId\) : null/);
  });
});

describe('⛔ the wrist reads the fact instead of inferring it', () => {
  it('the standalone engine no longer derives the badge from the rest being present', () => {
    const src = swift('LocalWorkoutEngine.swift');
    expect(src).not.toMatch(/restIsLearned:\s*cur\.restInterS\s*!=\s*nil/);
    expect(src).toMatch(/restIsLearned:\s*cur\.restIsLearned == true/);
  });

  it('⛔ …and the wire struct can actually decode it', () => {
    expect(swift('WatchWire.swift')).toMatch(/var restIsLearned: Bool\?/);
  });

  it('⚠️ OPTIONAL on the wire, so an older phone is not a lie either', () => {
    // `Bool?` decoded from an absent key is nil, and `== true` is false: the line stays down. A
    // non-optional `Bool` would fail the whole decode on an older plan, which is worse than silence.
    expect(swift('WatchWire.swift')).not.toMatch(/var restIsLearned: Bool\b(?!\?)/);
    expect(swift('LocalWorkoutEngine.swift')).toMatch(/== true/);
  });

  it('⛔ and the badge itself is still gated on the mirror field, not on a rest existing', () => {
    expect(swift('WatchScreens.swift')).toMatch(/if mirror\.restIsLearned == true \{/);
  });
});
