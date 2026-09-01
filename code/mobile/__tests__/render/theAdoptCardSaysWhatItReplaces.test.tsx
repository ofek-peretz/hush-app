/**
 * ⛔ THE ONE THING ADOPTING A FRIEND'S PLAN OVERWRITES.
 *
 * Every word on this card is a promise that nothing of hers is touched — "your starting weights come
 * from your body, not Dana's" — and it is true, because no weight is in the payload to begin with.
 * Then `onAdopt` calls `updateProfileInfo({ repBandByMuscle })` and writes the SENDER's rep bands
 * straight over the ones she set in her body map. Defensible (a band is a preference, and adopting a
 * shape you cannot read at your own rep range is adopting nothing) and, until now, said nowhere.
 *
 * A screen whose whole job is telling her what she is agreeing to has to name the one thing it takes.
 */
// @ts-nocheck

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { PlanReceivedView } from '@/screens/plan/PlanReceived';
import { initI18n, tg } from '@/i18n';
import { planBandSummary, type SharedPlan } from '@/domain/planShare';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

beforeAll(async () => {
  await initI18n();
});

const mounted: ReactTestRenderer[] = [];
function mount(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(<SafeAreaProvider initialMetrics={METRICS}>{el}</SafeAreaProvider>);
  });
  mounted.push(r);
  return r;
}
afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

const PLAN: SharedPlan = {
  v: 1,
  from: 'Dana',
  days: [
    { name: 'Upper A', muscleGroups: ['Chest', 'Back'], exerciseIds: ['bb_bench_press', 'bb_row'] },
    { name: 'Lower A', muscleGroups: ['Quads'], exerciseIds: ['bb_back_squat'] },
  ],
  repBandByMuscle: { Chest: '8-10' },
};

const view = (over = {}) => (
  <PlanReceivedView plan={PLAN} splitName="Upper / Lower" onAdopt={() => {}} onDecline={() => {}} {...over} />
);

function texts(r: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (n == null) return;
    if (typeof n === 'string') return void out.push(n);
    if (Array.isArray(n)) return void n.forEach(walk);
    (n as { children?: unknown[] }).children?.forEach(walk);
  };
  walk(r.toJSON());
  return out;
}

describe('the card names the one thing adopting takes from her', () => {
  it('says her rep bands are replaced, and by what', () => {
    const said = texts(mount(view())).join(' ');
    expect(said).toContain(tg('planReceived.bandsReplaced', { bands: planBandSummary(PLAN) }));
  });

  it('and says nothing about bands when none travelled — nothing of hers is touched then', () => {
    const said = texts(mount(view({ plan: { ...PLAN, repBandByMuscle: undefined } }))).join(' ');
    expect(said).not.toContain(tg('planReceived.bandsReplaced', { bands: planBandSummary(PLAN) }));
    // The promise the card exists for is still there.
    expect(said).toContain(tg('planReceived.yoursSub'));
  });
});

describe('the three figures each read as one measurement', () => {
  /**
   * "4 days", not "4", stop, "days". Two sibling <Text>s are two stops under VoiceOver, and a bare
   * figure with its noun in the next swipe is not a measurement. The pattern is `WellDone`'s `Fact`.
   */
  it('is one accessible node per figure', () => {
    const r = mount(view());
    const label = `${PLAN.days.length} ${tg('planReceived.days')}`;
    // Host nodes only — a composite `View` and the host it renders both carry the props.
    const nodes = r.root.findAll(
      (n) => typeof n.type === 'string' && n.props?.accessible === true && n.props?.accessibilityLabel === label,
    );
    expect(nodes).toHaveLength(1);
  });
});
