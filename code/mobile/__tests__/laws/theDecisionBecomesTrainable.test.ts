/**
 * ════ WHAT THE COACH DECIDED IS WHAT SHE TRAINS ════
 *
 * `buildPlanFromCoach` existed, was fully tested, and nothing in `src` called it. The coach's
 * programme arrived, parsed, and was dropped on the floor — the app was a very well-tested pipe
 * with no outlet. This is the law that says the outlet exists.
 *
 * ── AND WHY THE PLAN IS NOT CONVERTED INTO `Program` ────────────────────────────────────────────
 * The obvious move is to translate the coach's sessions into the `Program`/`ProgramDay`/`Slot`
 * shape the screens already read. It is also the move the founder ruled against, and the shapes
 * say why: a `Slot` is `{ capability, exerciseId, setCount }`. A 5 km run has no home in it. A
 * 45-second plank has no home in it. `say` — the coach's execution instruction, the one thing the
 * app could never carry before this layer — is dropped entirely.
 *
 * So a conversion would silently delete three of the four shapes and the instruction with them,
 * and it would do it quietly, in a function that looked like plumbing. The plan is stored whole,
 * in the coach's vocabulary, and the surfaces read IT.
 */
import { db } from '@/data/local/db';
import { buildPlanFromCoach } from '@/state/stores/sessionStore';
import { parseCoachPlan, type CoachAnswer } from '@/domain/coachPlan';

/** A week only the new vocabulary can express: intervals, a hold, a run, and a lift. */
const REPLY = JSON.stringify({
  say: 'Here is your week.',
  sessions: [{
    name: 'Intervals & Core',
    day: 'tue',
    blocks: [
      { rounds: 4, restS: 60, items: [
        { kind: 'distance', ex: 'run_outdoor', metres: 400, say: 'At a pace you could not hold a conversation at.' },
        { kind: 'time', ex: 'walk_outdoor', seconds: 90 },
      ] },
      { rounds: 3, restS: 90, items: [
        { kind: 'reps', ex: 'bb_back_squat', reps: [8, 12], load: 40 },
        { kind: 'time', ex: 'plank', seconds: 45 },
      ] },
    ],
  }],
  notes: [{ ex: 'bb_back_squat', say: 'Holding the load while the running volume climbs.' }],
});

async function land(): Promise<CoachAnswer> {
  const parsed = parseCoachPlan(REPLY);
  if (!parsed.ok) throw new Error(`the fixture must parse, got ${parsed.reason}`);
  await db.recordCoachAnswer(parsed.answer, '2026-08-01T09:00:00.000Z');
  return parsed.answer;
}

describe('the decision reaches the athlete', () => {
  it('stores the programme, and stores it WHOLE', async () => {
    await land();
    const stored = await db.loadCoachPlan();
    expect(stored?.sessions[0].name).toBe('Intervals & Core');
    // Every shape survives the round trip. This is the assertion a `Program` conversion fails.
    const kinds = stored!.sessions[0].blocks.flatMap((b) => b.items.map((i) => i.kind));
    expect(kinds).toEqual(['distance', 'time', 'reps', 'time']);
    // And the instruction survives, which is the thing that has no field anywhere in `Slot`.
    expect(stored!.sessions[0].blocks[0].items[0].say).toBe('At a pace you could not hold a conversation at.');
  });

  it('turns the stored programme into steps she can actually train', async () => {
    await land();
    const stored = await db.loadCoachPlan();
    const steps = buildPlanFromCoach(stored!.sessions[0]);

    // 4 rounds x 2 items, then 3 rounds x 2 items.
    expect(steps.length).toBe(14);
    expect(steps[0].item).toMatchObject({ kind: 'distance', ex: 'run_outdoor', metres: 400 });
    // Only the reps shape carries a target — the rest of the machine reads `target` to drive a
    // load, and a run has no load to drive.
    expect(steps.filter((s) => s.target).every((s) => s.item.kind === 'reps')).toBe(true);
    const squat = steps.find((s) => s.exerciseId === 'bb_back_squat')!;
    expect(squat.target).toMatchObject({ recommendedWeight: 40, repBandLo: 8, repBandHi: 12 });
  });

  it('writes the plan and the reasons together, from one call', async () => {
    // Two callers reach this seam — the chat and the post-session call. Half of it happening is
    // how a programme lands with no record of why, or a reason lands with no programme.
    await land();
    expect((await db.loadCoachPlan())?.sessions.length).toBe(1);
    expect((await db.loadCoachLog()).some((d) => d.ex === 'bb_back_squat')).toBe(true);
  });

  it('leaves a stored programme alone when a turn only spoke', async () => {
    // Most turns are a question answered. If those overwrote the programme with nothing, one
    // "why is the squat in there?" would wipe her week.
    await land();
    await db.recordCoachAnswer({ plan: null }, '2026-08-01T10:00:00.000Z');
    expect((await db.loadCoachPlan())?.sessions[0].name).toBe('Intervals & Core');
  });
});
