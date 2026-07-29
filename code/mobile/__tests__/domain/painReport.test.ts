/**
 * WHEN SOMETHING HURTS (v7 §13) — the rest window, and the map the engine is handed.
 *
 * The feature's whole claim is that it adds NO mechanism: a muscle goes off for a while and comes
 * back on its own, and her map is never rewritten. These are the tests that hold that claim — the
 * two ways it could quietly break are a window that never lapses, and an ease that leaks into the
 * map she drew.
 */
import {
  EASE_DAYS,
  activeEases,
  daysLeft,
  easeFor,
  easeOn,
  effectiveBodyMap,
  type PainEase,
} from '@/domain/painReport';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-07-27T09:00:00.000Z');

describe('the rest window', () => {
  it('runs from the report for exactly the severity’s days', () => {
    const e = easeFor('Shoulders', 'pain', NOW);
    expect(e.muscle).toBe('Shoulders');
    expect(e.fromMs).toBe(NOW);
    expect(e.untilMs).toBe(NOW + EASE_DAYS.pain * DAY);
    // the handoff's own figure — "eased in your map for 7 days"
    expect(EASE_DAYS.pain).toBe(7);
  });

  it('rests longer the sharper it is, and never the other way round', () => {
    expect(EASE_DAYS.twinge).toBeLessThan(EASE_DAYS.pain);
    expect(EASE_DAYS.pain).toBeLessThan(EASE_DAYS.sharp);
  });

  it('LAPSES ON ITS OWN — nothing has to run for the muscle to come back', () => {
    const e = easeFor('Shoulders', 'twinge', NOW);
    expect(activeEases([e], NOW + 2 * DAY)).toHaveLength(1);
    // the instant it expires it is simply not returned; it is never "cleared"
    expect(activeEases([e], e.untilMs)).toEqual([]);
    expect(activeEases([e], e.untilMs + 1)).toEqual([]);
  });

  it('counts the days left rounded UP, so a part-day still reads as a day', () => {
    const e = easeFor('Shoulders', 'pain', NOW);
    expect(daysLeft(e, NOW)).toBe(7);
    expect(daysLeft(e, NOW + 6.5 * DAY)).toBe(1);
    expect(daysLeft(e, e.untilMs)).toBe(0);
  });

  it('answers with the LONGEST standing rest when one muscle was reported twice', () => {
    const eases = [easeFor('Shoulders', 'twinge', NOW), easeFor('Shoulders', 'sharp', NOW)];
    expect(easeOn(eases, 'Shoulders', NOW)!.severity).toBe('sharp');
    expect(easeOn(eases, 'Chest', NOW)).toBeNull();
  });
});

describe('the map the engine is handed', () => {
  const her = { Chest: 'emphasis', Calves: 'off' } as const;

  it('switches a resting muscle off WITHOUT touching the map she drew', () => {
    const eases: PainEase[] = [easeFor('Shoulders', 'pain', NOW)];
    const map = { ...her };
    const effective = effectiveBodyMap(map, eases, NOW);

    expect(effective.Shoulders).toBe('off');
    // her map is untouched — this is what makes the return automatic
    expect(map).toEqual(her);
    expect(effective.Chest).toBe('emphasis');
  });

  it('gives the muscle back to HER stance the moment the window lapses', () => {
    const eases: PainEase[] = [easeFor('Chest', 'pain', NOW)];
    expect(effectiveBodyMap(her, eases, NOW).Chest).toBe('off');
    // …and the lead she gave it is still hers on the other side of the window
    expect(effectiveBodyMap(her, eases, NOW + 8 * DAY).Chest).toBe('emphasis');
  });

  it('never makes anything MORE trained — an off muscle stays off', () => {
    expect(effectiveBodyMap(her, [easeFor('Calves', 'sharp', NOW)], NOW).Calves).toBe('off');
  });

  it('is her own map, copied, when nothing is resting', () => {
    const out = effectiveBodyMap(her, [], NOW);
    expect(out).toEqual(her);
    expect(out).not.toBe(her); // a copy — the caller may not mutate hers through it
  });

  it('does not throw on a profile that has never reported anything', () => {
    expect(effectiveBodyMap(undefined, undefined, NOW)).toEqual({});
  });
});
