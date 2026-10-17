/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WALK — what she actually crosses, on real programmes from the real coach.
 *
 * ⛔ FOUNDER, 2026-08-04: *"I just want him to build exactly the programmes he means to build, and
 * then, once he has built them, to check whether the order of STATIONS could be arranged better."*
 *
 * `orderByStation` is unit-tested against fixtures I wrote, which only ever proves it does what I
 * expected of it. This asks the model. Three first programmes, and for each session it prints the
 * walk, the FLOOR (one fewer than the number of distinct stations — the best any reorder can do),
 * and anything left above it.
 *
 * ── ⚠️ WHAT IT IS ACTUALLY HUNTING ──────────────────────────────────────────────────────────────
 * The last run left two sessions above the floor and the reorder was RIGHT to leave them: the coach
 * had written a dumbbell lift and a cable lift as one two-item CIRCUIT, which is six crossings by
 * design and which `stationOrder` must never touch (reordering inside a block changes the training).
 * A prompt line was added for it. **`⛔ SPLIT` below is that bug; the FLOOR line is the reorder.**
 *
 * ⚠️ REAL BILLED CALLS. `.sim.ts`, never in CI, run by hand:
 *
 *   npx jest --testMatch "**\/*.sim.ts" --testTimeout 900000 -t "walk"
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

/* The env must be loaded before `coachClient` is — see `fourWeeks.sim.ts` for why. */
import fs from 'fs';
import path from 'path';
for (const l of fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8').split('\n')) {
  const i = l.indexOf('=');
  if (i > 0 && l.startsWith('EXPO_PUBLIC')) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}

import { coachFacts } from '@/domain/coachFacts';
import { coachRequest } from '@/domain/coachPrompt';
import { COACH_DECISION_SCHEMA, parseCoachPlan } from '@/domain/coachPlan';
import { stationChanges } from '@/domain/stationOrder';
import { exerciseById } from '@/data/exercises';
import type { Profile } from '@/data/local/models';

jest.setTimeout(900_000);

const line = (s: string) => console.log(s);
const rule = () => line('─'.repeat(96));

/** Three athletes, because the failure was equipment-shaped and a woman at 4×60 is one case. */
const PEOPLE: { who: string; profile: Profile }[] = [
  {
    who: 'Maya · 4 days · 60 min · shoulder',
    profile: {
      name: 'Maya', sex: 'female', age: 34, weightKg: 62, startWeightKg: 62,
      experience: 'intermediate', daysPerWeek: 4, workoutMinutes: 60, units: 'kg',
      healthConnected: false, repBand: '8-10',
      goalText: 'Get visibly stronger and put some size on my shoulders and back.',
      limitsText: 'Left shoulder — it clicks and aches on overhead pressing. Nothing else.',
    },
  },
  {
    who: 'Tom · 3 days · 45 min · beginner',
    profile: {
      name: 'Tom', sex: 'male', age: 27, weightKg: 78, startWeightKg: 78,
      experience: 'beginner', daysPerWeek: 3, workoutMinutes: 45, units: 'kg',
      healthConnected: false,
      goalText: 'Put on size, mostly arms and chest.', limitsText: 'Nothing.',
    },
  },
  {
    who: 'Dana · 5 days · 75 min · advanced',
    profile: {
      name: 'Dana', sex: 'female', age: 41, weightKg: 68, startWeightKg: 68,
      experience: 'advanced', daysPerWeek: 5, workoutMinutes: 75, units: 'kg',
      healthConnected: false,
      goalText: 'Legs and back — I want to be visibly bigger by winter.',
      limitsText: 'Lower back gets sore after heavy deadlifts.',
    },
  },
];

const stationOf = (ex: string) => exerciseById(ex)?.equipment ?? 'floor';

describe('the walk, on real programmes', () => {
  it('builds three and prints every station change', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { askCoach } = require('@/platform/coach/coachClient') as typeof import('@/platform/coach/coachClient');

    let splits = 0;
    let aboveFloor = 0;
    let sessions = 0;

    for (const { who, profile } of PEOPLE) {
      rule();
      line(who.toUpperCase());
      rule();
      const reply = await askCoach(
        coachRequest({
          facts: coachFacts({ profile, plan: null, history: [], language: 'en' }),
          ask: { kind: 'first_programme' },
        }),
        COACH_DECISION_SCHEMA as unknown as Record<string, unknown>,
      );
      if (!reply.ok) { line(`  ⛔ call failed: ${reply.reason}`); continue; }
      const parsed = parseCoachPlan(reply.text);
      if (!parsed.ok || !parsed.answer.plan) { line(`  ⛔ unreadable`); continue; }

      for (const s of parsed.answer.plan.sessions) {
        sessions += 1;
        const walk = s.blocks.map((b) => stationOf(b.items[0]?.ex ?? ''));
        const changes = stationChanges(s.blocks);
        const floor = new Set(walk).size - 1;
        if (changes > floor) aboveFloor += 1;
        line(`\n  · ${s.name}   changes ${changes} · floor ${floor}${changes > floor ? '   ⚠️ ABOVE FLOOR' : ''}`);
        for (const b of s.blocks) {
          const st = [...new Set(b.items.map((i) => stationOf(i.ex)))];
          // A block whose items live on two stations is a circuit across the gym — the prompt bug.
          const flag = st.length > 1 ? `   ⛔ SPLIT (${st.join(' + ')})` : '';
          const names = b.items.map((i) => i.ex).join(' + ');
          line(`      [${st.join('|').padEnd(12)}] ${b.rounds}× ${names}${flag}`);
          if (st.length > 1) splits += 1;
        }
      }
    }

    rule();
    line(`  sessions ${sessions} · above the floor ${aboveFloor} · cross-station circuits ${splits}`);
    rule();
  });
});
