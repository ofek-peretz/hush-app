/**
 * A SUPERSET, AS THE ATHLETE NEEDS IT TOLD (2026-10-11) — `domain/supersetView`.
 *
 * The founder walked a superset and could not tell what it was asking: one word over the first
 * lift, nothing on the second, "a new exercise" on the rest between rounds. Every screen now reads
 * one description — which lifts, which of them, which round — and this is that description's proof.
 */
import { supersetAt } from '@/domain/supersetView';

type S = { exerciseId: string; straight?: boolean; warmup?: true };
const straightOn = (s: S): boolean => s.straight === true;
/** `A>` flows straight into the next step; `A` is followed by a rest. */
const plan = (...steps: string[]): S[] =>
  steps.map((x) => ({ exerciseId: x.replace(/[>~]/g, ''), straight: x.includes('>'), ...(x.includes('~') ? { warmup: true as const } : {}) }));

describe('a round is the run of steps the plan joins with no rest', () => {
  // bench · three rounds of raise + pushdown · curl
  const session = plan('bench', 'bench', 'raise>', 'push', 'raise>', 'push', 'raise>', 'push', 'curl', 'curl');

  it('an ordinary set is no superset', () => {
    expect(supersetAt(session, 0, straightOn)).toBeNull();
    expect(supersetAt(session, 1, straightOn)).toBeNull();
    expect(supersetAt(session, 8, straightOn)).toBeNull();
  });

  it('BOTH lifts of a pair know the pair, their place in it, and the round', () => {
    expect(supersetAt(session, 2, straightOn)).toEqual({ exerciseIds: ['raise', 'push'], position: 1, round: 1, rounds: 3, first: 2 });
    // The second lift has no "straight into" of its own — the step the old screen left unexplained.
    expect(supersetAt(session, 3, straightOn)).toEqual({ exerciseIds: ['raise', 'push'], position: 2, round: 1, rounds: 3, first: 2 });
    expect(supersetAt(session, 4, straightOn)).toMatchObject({ position: 1, round: 2, rounds: 3, first: 4 });
    expect(supersetAt(session, 7, straightOn)).toMatchObject({ position: 2, round: 3, rounds: 3, first: 6 });
  });

  it('a circuit of three is the same rule', () => {
    const circuit = plan('a>', 'b>', 'c', 'a>', 'b>', 'c');
    expect(supersetAt(circuit, 1, straightOn)).toEqual({ exerciseIds: ['a', 'b', 'c'], position: 2, round: 1, rounds: 2, first: 0 });
    expect(supersetAt(circuit, 5, straightOn)).toMatchObject({ position: 3, round: 2, rounds: 2 });
  });

  it('two different pairs back to back are two supersets, each counting its own rounds', () => {
    const two = plan('a>', 'b', 'a>', 'b', 'c>', 'd', 'c>', 'd');
    expect(supersetAt(two, 3, straightOn)).toMatchObject({ exerciseIds: ['a', 'b'], round: 2, rounds: 2 });
    expect(supersetAt(two, 4, straightOn)).toMatchObject({ exerciseIds: ['c', 'd'], round: 1, rounds: 2 });
  });
});

describe('what is NOT a superset', () => {
  it('the same lift repeated with no rest is one lift, not a pair', () => {
    expect(supersetAt(plan('a>', 'a>', 'a'), 1, straightOn)).toBeNull();
  });

  it('a warm-up bridge is never half of a round', () => {
    const ramp = plan('a~>', 'a>', 'b', 'a>', 'b');
    expect(supersetAt(ramp, 0, straightOn)).toBeNull();
    expect(supersetAt(ramp, 1, straightOn)).toMatchObject({ exerciseIds: ['a', 'b'], position: 1, round: 1, rounds: 2 });
  });

  it('the last step of the session flows nowhere, and an index outside the plan is nothing', () => {
    expect(supersetAt(plan('a', 'b>'), 1, straightOn)).toBeNull();
    expect(supersetAt(plan('a>', 'b'), 5, straightOn)).toBeNull();
    expect(supersetAt([], 0, straightOn)).toBeNull();
  });
});
