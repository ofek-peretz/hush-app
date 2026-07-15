/**
 * Engine v5 · Revision 7 — learned exercise selection, PURE CORE (register Part 9, S-68…S-70).
 *
 * K = 2 (F-14): two consecutive same-target in-workout swaps adopt a standing replacement; one swap
 * declares nothing; the blueprint original is always offered first afterwards, so a wrong adoption is
 * cheaply reversible. Deterministic, no I/O. (The rotation interactions S-71/S-72 land at wiring.)
 */
import {
  emptyLearning, applyOccurrence, foldOccurrences, offeredFor, anchorOf, swapMenuOrder,
  type SwapLearning, type SwapOccurrence,
} from '@/engine/v5/learnedSwap';

const swap = (offered: string, performed: string): SwapOccurrence => ({ offered, performed });
const perform = (offered: string): SwapOccurrence => ({ offered, performed: offered });

describe('Rev 7 · learned swap — S-68 one swap declares nothing', () => {
  it('a single swap does not change what is offered', () => {
    const s = applyOccurrence(emptyLearning(), swap('squat', 'leg_press'));
    expect(offeredFor(s, 'squat')).toBe('squat'); // still the blueprint — nothing adopted
    expect(s.pending['squat']).toEqual({ target: 'leg_press', count: 1 });
  });

  it('performing the offered lift resets a pending swap (S-68 reset)', () => {
    const s = foldOccurrences([swap('squat', 'leg_press'), perform('squat')]);
    expect(s.pending['squat']).toBeUndefined();
    expect(offeredFor(s, 'squat')).toBe('squat');
  });
});

describe('Rev 7 · learned swap — S-69 two consecutive swaps adopt (K=2)', () => {
  it('two consecutive same-target swaps adopt the replacement', () => {
    const s = foldOccurrences([swap('squat', 'leg_press'), swap('squat', 'leg_press')]);
    expect(offeredFor(s, 'squat')).toBe('leg_press');
    expect(s.pending['squat']).toBeUndefined();
  });

  it('a different target each time never adopts (no clear preference)', () => {
    const s = foldOccurrences([swap('squat', 'leg_press'), swap('squat', 'hack_squat'), swap('squat', 'leg_press')]);
    expect(offeredFor(s, 'squat')).toBe('squat'); // never two-in-a-row for the same target
    expect(s.pending['squat']).toEqual({ target: 'leg_press', count: 1 });
  });

  it('a non-consecutive repeat does not count — the run must be unbroken', () => {
    // swap→A, perform (reset), swap→A again = two ones, never a two.
    const s = foldOccurrences([swap('squat', 'leg_press'), perform('squat'), swap('squat', 'leg_press')]);
    expect(offeredFor(s, 'squat')).toBe('squat');
    expect(s.pending['squat']).toEqual({ target: 'leg_press', count: 1 });
  });
});

describe('Rev 7 · learned swap — S-70 the original is offered first, and re-adoption is reversible', () => {
  it('after adoption, the swap menu offers the blueprint original first', () => {
    const s = foldOccurrences([swap('squat', 'leg_press'), swap('squat', 'leg_press')]);
    // The plan now offers leg_press; the menu must lead with the original squat (the perpetual re-test).
    expect(swapMenuOrder(s, 'leg_press', ['hack_squat', 'front_squat', 'squat'])).toEqual(['squat', 'hack_squat', 'front_squat']);
  });

  it('anchorOf reverse-maps a standing substitute back to its blueprint', () => {
    const s = foldOccurrences([swap('squat', 'leg_press'), swap('squat', 'leg_press')]);
    expect(anchorOf(s, 'leg_press')).toBe('squat');
    expect(anchorOf(s, 'bench')).toBe('bench'); // not a substitute → itself
  });

  it('swapping back to the original twice CLEARS the substitute (the original returns)', () => {
    const adopted = foldOccurrences([swap('squat', 'leg_press'), swap('squat', 'leg_press')]);
    expect(offeredFor(adopted, 'squat')).toBe('leg_press');
    // Now the plan offers leg_press; she swaps back to squat twice.
    const back = foldOccurrences([swap('leg_press', 'squat'), swap('leg_press', 'squat')], adopted);
    expect(offeredFor(back, 'squat')).toBe('squat');
    expect(back.substitutes['squat']).toBeUndefined();
  });

  it('a chain: after adopting one replacement she can adopt a different one (keyed by anchor)', () => {
    const first = foldOccurrences([swap('squat', 'leg_press'), swap('squat', 'leg_press')]); // → leg_press
    const second = foldOccurrences([swap('leg_press', 'hack_squat'), swap('leg_press', 'hack_squat')], first);
    expect(offeredFor(second, 'squat')).toBe('hack_squat'); // the role's current pick, still keyed to squat
    expect(anchorOf(second, 'hack_squat')).toBe('squat');
  });

  it('no adoption in play → the swap menu keeps the engine order untouched', () => {
    expect(swapMenuOrder(emptyLearning(), 'squat', ['leg_press', 'hack_squat'])).toEqual(['leg_press', 'hack_squat']);
  });
});

describe('Rev 7 · learned swap — determinism (I-24)', () => {
  it('identical occurrence streams yield identical state', () => {
    const stream = [swap('squat', 'leg_press'), perform('squat'), swap('squat', 'hack_squat'), swap('squat', 'hack_squat')];
    expect(foldOccurrences(stream)).toEqual(foldOccurrences([...stream]));
  });

  it('applyOccurrence does not mutate its input', () => {
    const before: SwapLearning = emptyLearning();
    const frozen = JSON.stringify(before);
    applyOccurrence(before, swap('squat', 'leg_press'));
    expect(JSON.stringify(before)).toBe(frozen);
  });
});
