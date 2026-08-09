/**
 * Engine v5 · Stage 4 — the body map, the declared band T, and the assembler core (programme shape
 * from volume, not a shelf). One describe per situation.
 */
// @ts-nocheck

// 

import { bandFor, DEFAULT_REP_BAND } from '@/engine/v5/repBand';
import { bandFromTarget } from '@/engine/v5/liveSession';
import { stanceOf, trainableMuscles, emphasisMuscles, validateMap, shouldAskBackOnOff, askBackMuscle, type BodyMap } from '@/engine/v5/bodyMap';
import { weeklyTargets, regionVolume, assignRegionDays, regionOf } from '@/engine/v5/assembler';

const ALL = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core'] as const;

describe('S-6 · T is the band she picks — a floor and a ceiling, applied to every exercise', () => {
  it('each choice maps to a real band', () => {
    expect(bandFor('6-8')).toEqual({ lo: 6, hi: 8 });
    expect(bandFor('12-15')).toEqual({ lo: 12, hi: 15 });
  });
  it('undefined → the default 8-10 (never a guess)', () => {
    expect(bandFor(undefined)).toEqual(bandFor(DEFAULT_REP_BAND));
    expect(DEFAULT_REP_BAND).toBe('8-10');
  });
  it('Loop 1 reads her real Thi off the target; older profiles fall back to a provisional window', () => {
    expect(bandFromTarget(8, 10)).toEqual({ lo: 8, hi: 10 }); // her declared band
    expect(bandFromTarget(8)).toEqual({ lo: 8, hi: 12 }); // no Thi → provisional lo+4
    expect(bandFromTarget(8, 6)).toEqual({ lo: 8, hi: 12 }); // inverted Thi ignored
  });
});

describe('S-2/S-4 · the body map — off never appears, emphasis has a budget of 2', () => {
  const map: BodyMap = { Calves: 'off', Glutes: 'emphasis', Quads: 'emphasis' };
  it('off muscles are excluded, others default to normal', () => {
    expect(stanceOf(map, 'Calves')).toBe('off');
    expect(stanceOf(map, 'Chest')).toBe('normal');
    expect(trainableMuscles(map, ALL)).not.toContain('Calves');
    expect(trainableMuscles(map, ALL)).toContain('Chest');
  });
  it('emphasis muscles are read off the map', () => {
    expect(emphasisMuscles(map, ALL).sort()).toEqual(['Glutes', 'Quads']);
  });
});

describe('S-3 · a map with nothing left on cannot build a workout', () => {
  it('all off → not buildable', () => {
    const allOff: BodyMap = Object.fromEntries(ALL.map((m) => [m, 'off']));
    expect(validateMap(allOff, ALL)).toEqual({ ok: false, reason: 'nothing_on' });
  });
  it('more than 2 emphasis → refused (F-4)', () => {
    const three: BodyMap = { Chest: 'emphasis', Back: 'emphasis', Quads: 'emphasis' };
    expect(validateMap(three, ALL)).toEqual({ ok: false, reason: 'too_many_emphasis' });
  });
  it('a normal map is buildable', () => {
    expect(validateMap({ Glutes: 'emphasis' }, ALL).ok).toBe(true);
  });
});

describe('S-56 · ask-back fires only for a muscle she actually TRAINED (a change of state, not taste)', () => {
  it('has a logged set → ask; no history → do not (nagging)', () => {
    expect(shouldAskBackOnOff(true)).toBe(true);
    expect(shouldAskBackOnOff(false)).toBe(false);
  });

  it('the mirror asks about an OFF + TRAINED + never-asked muscle — and nothing else', () => {
    const map: BodyMap = { Chest: 'off', Calves: 'off', Back: 'normal' };
    const trained = new Set(['Chest', 'Back']); // Calves never earned a logged set
    // Chest is off, trained, never asked → it is the question. Calves is off but untrained → taste,
    // honoured in silence. Back is on → nothing to ask.
    expect(askBackMuscle(map, trained, new Set())).toBe('Chest');
  });

  it('a question is asked once, ever — either answer retires it (L4)', () => {
    const map: BodyMap = { Chest: 'off' };
    const trained = new Set(['Chest']);
    expect(askBackMuscle(map, trained, new Set(['Chest']))).toBeNull();
  });

  it('one question at a time, deterministically by the canonical order (F-9)', () => {
    const map: BodyMap = { Quads: 'off', Chest: 'off' };
    const trained = new Set(['Quads', 'Chest']);
    expect(askBackMuscle(map, trained, new Set())).toBe('Chest'); // Chest precedes Quads in F-9
    expect(askBackMuscle(map, trained, new Set(['Chest']))).toBe('Quads'); // …then the next, later
  });

  it('an empty map / nothing off → no question', () => {
    expect(askBackMuscle(undefined, new Set(['Chest']), new Set())).toBeNull();
    expect(askBackMuscle({}, new Set(['Chest']), new Set())).toBeNull();
  });
});

describe('the programme SHAPE is an output of volume — emphasis drives the split, no shelf', () => {
  it('mark Glutes + Quads on a 3-day week → two lower days fall out automatically', () => {
    const map: BodyMap = { Glutes: 'emphasis', Quads: 'emphasis' };
    const targets = weeklyTargets(map, ALL);
    const vol = regionVolume(targets);
    expect(vol.lower).toBeGreaterThan(0);
    const days = assignRegionDays(targets, 3);
    expect(days).toHaveLength(3);
    expect(days.filter((d) => d === 'lower').length).toBeGreaterThanOrEqual(2);
  });
  it('a balanced map splits days without favouring either region unfairly', () => {
    const targets = weeklyTargets({}, ALL);
    const days = assignRegionDays(targets, 4);
    expect(days.filter((d) => d === 'lower').length).toBeGreaterThanOrEqual(1);
    expect(days.filter((d) => d === 'upper').length).toBeGreaterThanOrEqual(1);
  });
  it('turning legs off → no lower days', () => {
    const legsOff: BodyMap = { Quads: 'off', Hamstrings: 'off', Glutes: 'off', Calves: 'off' };
    const days = assignRegionDays(weeklyTargets(legsOff, ALL), 4);
    expect(days.every((d) => d === 'upper')).toBe(true);
  });
  it('regionOf classifies muscles', () => {
    expect(regionOf('Glutes')).toBe('lower');
    expect(regionOf('Chest')).toBe('upper');
  });
});
