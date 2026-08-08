/**
 * Engine v5 · Stage 3 — Loop 3 (volume) + the time budget from measured rest. One describe per
 * S-number.
 */
import { decideVolume } from '@/engine/v5/loop3';
import { learnedRestS, setsToMinutes, maxSetsInBudget, fitsBudget } from '@/engine/v5/timeBudget';
import { chooseDonor, type VolumeCandidate } from '@/engine/v5/volumeAllocation';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';

const vol = (over: Partial<Parameters<typeof decideVolume>[0]> = {}) =>
  decideVolume({ sets: 4, minSets: 3, maxSets: 8, completedAll: true, anyAdvanced: true, unfinishedStreak: 0, ...over });

describe('S-32 · completed every set AND a lift advanced → +1 set', () => {
  it('earns a set', () => {
    expect(vol()).toEqual({ sets: 5, decision: 'progress' });
  });
  it('but not past the time-budget ceiling (S-64) → capped, not grown', () => {
    expect(vol({ sets: 8, maxSets: 8 })).toEqual({ sets: 8, decision: 'capped' });
  });
});

describe('S-32b · completed everything but nothing advanced → hold (more volume for a stall is theory)', () => {
  it('holds', () => {
    expect(vol({ anyAdvanced: false })).toEqual({ sets: 4, decision: 'hold' });
  });
});

describe('S-33 / S-34 · unfinished holds once, cuts on the second in a row', () => {
  it('first unfinished occurrence → hold', () => {
    expect(vol({ completedAll: false, unfinishedStreak: 1 })).toEqual({ sets: 4, decision: 'hold' });
  });
  it('unfinished twice → −1', () => {
    expect(vol({ completedAll: false, unfinishedStreak: 2 })).toEqual({ sets: 3, decision: 'cut' });
  });
});

describe('S-35 / S-36 · never cut below the floor — signal the assembler instead', () => {
  it('at the floor, still unfinished → at_floor (drop an exercise / look at load)', () => {
    expect(vol({ sets: 3, minSets: 3, completedAll: false, unfinishedStreak: 2 })).toEqual({ sets: 3, decision: 'at_floor' });
  });
});

describe('S-64 · the time budget is measured from her REST, and is a ceiling not a target', () => {
  it('learned rest is the median of what she actually took (unknown rests excluded, L3)', () => {
    expect(learnedRestS([60, 90, 120, undefined, null])).toBe(90);
    expect(learnedRestS([undefined, null])).toBeNull();
  });
  it('a faster rester fits MORE work in the same minutes (the fix for v4 ignoring rest)', () => {
    // 60 min, 40s work/set. At 150s rest → 40s+150s=190s/set → 18 sets. At 60s rest → 100s/set → 36 sets.
    expect(maxSetsInBudget(60, 40, 150)).toBe(18);
    expect(maxSetsInBudget(60, 40, 60)).toBe(36);
  });
  it('setsToMinutes / fitsBudget use work + measured rest', () => {
    expect(setsToMinutes(10, 40, 80)).toBeCloseTo(20, 5); // 10 × 120s = 1200s = 20 min
    expect(fitsBudget(10, 20, 40, 80)).toBe(true);
    expect(fitsBudget(11, 20, 40, 80)).toBe(false);
  });
});

describe('S-37 donor · never emphasis / floored, then MOST weekly sets, then reverse canonical order', () => {
  const c = (muscle: string, over: Partial<VolumeCandidate> = {}): VolumeCandidate => ({ muscle, isEmphasis: false, weeklySets: 10, atFloor: false, ...over });
  it('never donates from an emphasis muscle', () => {
    // Only Chest is eligible (Back is emphasis) → Chest donates even though it is not the most-sets.
    expect(chooseDonor([c('Chest', { weeklySets: 8 }), c('Back', { isEmphasis: true, weeklySets: 12 })], CANONICAL_MUSCLE_ORDER)!.muscle).toBe('Chest');
  });
  it('donates from the muscle with the MOST weekly sets (best able to spare it)', () => {
    expect(chooseDonor([c('Chest', { weeklySets: 12 }), c('Back', { weeklySets: 8 })], CANONICAL_MUSCLE_ORDER)!.muscle).toBe('Chest');
  });
  it('reverse canonical order breaks the tie deterministically', () => {
    expect(chooseDonor([c('Back'), c('Chest')], CANONICAL_MUSCLE_ORDER)!.muscle).toBe('Back'); // Back trails Chest → donates first
  });
  it('returns null when every muscle is emphasis or at its floor', () => {
    expect(chooseDonor([c('Chest', { isEmphasis: true }), c('Back', { atFloor: true })], CANONICAL_MUSCLE_ORDER)).toBeNull();
  });
});

describe('S-37 donor · the mirror of the give-rule, never emphasis or a floored muscle', () => {
  const c = (muscle: string, over: Partial<VolumeCandidate> = {}): VolumeCandidate => ({ muscle, isEmphasis: false, weeklySets: 10, atFloor: false, ...over });
  it('takes from the muscle with the MOST sets', () => {
    expect(chooseDonor([c('Chest', { weeklySets: 8 }), c('Triceps', { weeklySets: 14 })], CANONICAL_MUSCLE_ORDER)!.muscle).toBe('Triceps');
  });
  it('never an emphasis or floored muscle; none eligible → null (the set does not fit)', () => {
    expect(chooseDonor([c('Chest', { isEmphasis: true }), c('Back', { atFloor: true })], CANONICAL_MUSCLE_ORDER)).toBeNull();
  });
});
