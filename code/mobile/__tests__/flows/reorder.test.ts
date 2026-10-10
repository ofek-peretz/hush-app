/**
 * Athlete-owned reorder helper — the deterministic core of exercise/workout ordering.
 */
// @ts-nocheck

// 

import { move } from '@/domain/reorder';

describe('move', () => {
  it('moves an item down one position (Bench → after Incline)', () => {
    expect(move(['bench', 'incline', 'fly'], 0, 1)).toEqual(['incline', 'bench', 'fly']);
  });

  it('moves an item up one position', () => {
    expect(move(['incline', 'bench', 'fly'], 1, 0)).toEqual(['bench', 'incline', 'fly']);
  });

  it('reorders workouts (Upper/Lower/Push/Pull → Push/Pull/Upper/Lower) via repeated moves', () => {
    let w = ['upper', 'lower', 'push', 'pull'];
    w = move(w, 2, 0); // push to front
    w = move(w, 3, 1); // pull to second
    expect(w).toEqual(['push', 'pull', 'upper', 'lower']);
  });

  it('is a no-op for out-of-range or identity moves, and never mutates the input', () => {
    const src = ['a', 'b', 'c'];
    expect(move(src, 0, 0)).toEqual(['a', 'b', 'c']);
    expect(move(src, -1, 2)).toEqual(['a', 'b', 'c']);
    expect(move(src, 0, 9)).toEqual(['a', 'b', 'c']);
    expect(src).toEqual(['a', 'b', 'c']); // input untouched
  });
});
