/**
 * A MEASUREMENT IS ONE THING — the Complete poster's three facts (§4.18, v7 2.5).
 *
 * `factRow` was `justifyContent: 'space-between'` with the figure and its unit as the two children,
 * so "5" sat on one edge of the poster and "min" on the other with a quarter of the screen of black
 * between them. The docblock over `Fact` promised "the figure on the start edge, its NAME on the
 * end edge" — but what went to the end edge was the unit, so no row ever said what it measured, and
 * a screen reader stopped on "5" and again, separately, on "min".
 *
 * These mount the beat and ask what she reads and what VoiceOver says.
 */
// @ts-nocheck

//

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { SessionEarned } from '@/screens/session/WellDone';
import { initI18n, tg } from '@/i18n';

beforeAll(async () => {
  await initI18n();
});

const mounted: ReactTestRenderer[] = [];

/** A RECORD poster — the only shape that draws all three facts (tonnage joins when it loses the hero). */
function draw(): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(
      <SessionEarned
        poster={{
          hero: { kind: 'record', exerciseId: 'bb_deadlift', value: 60, unit: 'kg', reps: 5, delta: 5 },
          minutes: 5,
          kcal: 25,
          tonnes: 3.9,
          sets: 11,
          lifts: [{ exerciseId: 'bb_deadlift', load: 60, unit: 'kg', reps: [5, 5] }],
        }}
        workoutName="Full Body A"
        savedLegend="Full Body A · Saved"
        partial={false}
        durationLabel="5"
        kcal={25}
        tonnes={3.9}
        decisions={[]}
        volume={[]}
        onDone={() => {}}
        onRecord={() => {}}
      />,
    );
  });
  mounted.push(r);
  return r;
}

afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

const labels = (r: ReactTestRenderer): string[] =>
  r.root
    .findAll((n) => typeof n.props?.accessibilityLabel === 'string')
    .map((n) => String(n.props.accessibilityLabel));

const strings = (r: ReactTestRenderer): string[] =>
  r.root.findAllByType(Text).map((n) => {
    const c = n.props.children;
    return Array.isArray(c) ? c.filter((x) => typeof x === 'string').join('') : String(c ?? '');
  });

describe('a measurement is one thing', () => {
  it('names every fact, in the same words the all-time board uses', () => {
    const all = strings(draw());
    expect(all).toContain(tg('progress.badgeTrained').toUpperCase());
    expect(all).toContain(tg('progress.badgeLifted').toUpperCase());
    expect(all).toContain(tg('progress.badgeBurned').toUpperCase());
  });

  it('keeps the unit beside its figure instead of building it into the name', () => {
    const all = strings(draw());
    // "t moved" was one concatenated string; the unit stands alone now, beside the 3.9.
    expect(all).toContain(tg('weekly.tonneUnit'));
    expect(all).not.toContain(`${tg('weekly.tonneUnit')} ${tg('complete.movedShort')}`);
  });

  it('says each fact to a screen reader as one sentence, not two stops', () => {
    const said = labels(draw());
    expect(said).toContain(`${tg('progress.badgeTrained')} 5 ${tg('common.minShort')}`);
    expect(said).toContain(`${tg('progress.badgeBurned')} 25 ${tg('complete.kcal')}`);
    expect(said).toContain(`${tg('progress.badgeLifted')} 3.9 ${tg('weekly.tonneUnit')}`);
  });

  it('speaks the hero once — "60 kg", not "60" and then "kg"', () => {
    expect(labels(draw())).toContain('60 kg');
  });
});

describe('one word per fact, across the app', () => {
  it('says calories the same way on Complete as on Progress and the weekly letter', () => {
    expect(tg('complete.kcal')).toBe(tg('progress.unitKcal'));
  });
});
