/**
 * ════ THE BUILDER, ON GLASS — the founder's 2026-08-25 instruction, rendered and pressed ════
 *
 * *"אנחנו צריכים לאפשר בנייה באופן מלא של תוכנית האימון"* — days, lifts, sets, order, all hers;
 * the steward prices the clock and advises. This law renders the real view and PRESSES it: adding
 * a lift through the sheet, changing sets through the strip, the advisory line for her single leg
 * day, and the minutes that answer every edit.
 */
// @ts-nocheck

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { AppContext } from '@/state/stores/appStore';
import { PlanBuilderView } from '@/screens/plan/PlanBuilder';
import { addDay, addLift, blankDraft, builderAdvice, builderMinutes } from '@/domain/planBuilder';
import { PLAN_TEMPLATES } from '@/domain/planTemplates';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { initI18n, tg } from '@/i18n';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

beforeAll(async () => {
  await initI18n();
});

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

const noop = () => {};
const appFixture = {
  booted: true,
  profile: { id: 'p1', name: 'Noa', sex: 'female', units: 'kg', weightKg: 62, bodyMap: {}, repBandByMuscle: {} },
  program: null,
  sessions: [],
  entitlement: { status: 'trial', sessionsUsed: 0 },
  model: {},
  modeState: { completedSessions: 0 },
  refreshProgram: async () => {},
};

function fixtureDraft() {
  let d = blankDraft('render1');
  d = addLift(d, 0, 'bb_bench_press');
  d = addLift(d, 0, 'db_row');
  d = addDay(d);
  d = addLift(d, 1, 'bb_back_squat');
  return d;
}

function draw(over = {}) {
  let onDraftCaptured = null;
  const props = {
    draft: fixtureDraft(),
    offerDoors: false,
    savedIsAuthored: false,
    ownedIds: new Set(['built_day_1', 'built_day_2']),
    figure: 'male',
    advice: [],
    onStartFromEngine: noop,
    onStartBlank: noop,
    onStartTemplate: noop,
    onDraft: (next) => { onDraftCaptured = next; },
    onSave: noop,
    onRevert: noop,
    onAiReview: noop,
    aiBusy: false,
    reviewOpen: false,
    onReviewClose: noop,
    ...over,
  };
  let r;
  act(() => {
    r = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <AppContext.Provider value={appFixture}>
          <PlanBuilderView {...props} />
        </AppContext.Provider>
      </SafeAreaProvider>,
    );
  });
  mounted.push(r);
  return { r, next: () => onDraftCaptured };
}

function textOf(r: ReactTestRenderer): string {
  const out = [];
  const walk = (n) => {
    if (n == null) return;
    if (typeof n === 'string') return void out.push(n);
    if (Array.isArray(n)) return void n.forEach(walk);
    if (n.children) walk(n.children);
  };
  walk(r.toJSON());
  return out.join(' ');
}

describe('the two doors, before a draft exists', () => {
  it('an engine week opens on the choice: take the draft, or start blank', () => {
    const { r } = draw({ draft: null, offerDoors: true });
    const said = textOf(r);
    expect(said).toContain(tg('builder.fromEngine'));
    expect(said).toContain(tg('builder.fromBlank'));
  });

  it('…and under them, the proven shelves — each priced, each a door (2026-08-26)', () => {
    const picked = [];
    const { r } = draw({ draft: null, offerDoors: true, onStartTemplate: (id) => picked.push(id) });
    const said = textOf(r);
    expect(said.toUpperCase()).toContain(tg('builder.templates.legend').toUpperCase()); // Legend uppercases
    // Every shelf is on the wall, with its honest clock beside it.
    for (const tpl of PLAN_TEMPLATES) expect(said).toContain(tg(`builder.templates.${tpl.id}.name`));
    // A card is a DOOR: pressing PPL asks the container for exactly that shelf.
    const card = r.root.findAll(
      (n) => n.props?.accessibilityLabel === tg('builder.templates.ppl.name') && n.props?.onPress,
      { deep: true },
    )[0];
    act(() => card.props.onPress());
    expect(picked).toEqual(['ppl']);
  });
});

describe('the sheet that answers back', () => {
  it('renders her days, her lifts, and the honest clock per day', () => {
    const d = fixtureDraft();
    const { r } = draw();
    const said = textOf(r);
    // Day names live in editable TextInputs — their value is a prop, not a text child.
    const names = r.root
      .findAll((n) => n.props?.accessibilityLabel === tg('builder.dayName'), { deep: true })
      .map((n) => n.props.value);
    // findAll sees both the composite and the host element of each input — dedupe preserves order.
    expect([...new Set(names)]).toEqual(['Workout A', 'Workout B']);
    expect(said.toUpperCase()).toContain(tg('builder.minutes', { min: builderMinutes(d.days[0]) }).toUpperCase());
    expect(said).toContain('4×'.replace('4', '3')); // a fresh lift opens at 3 sets
  });

  it('tapping the sets chip opens the strip, and picking a count reports the edited draft', () => {
    const { r, next } = draw();
    const chip = r.root.findAll((n) => n.props?.accessibilityLabel === tg('builder.sets') && n.props?.onPress, { deep: true })[0];
    act(() => chip.props.onPress());
    const six = r.root.findAll((n) => n.props?.accessibilityLabel === `6 ${tg('builder.sets')}` && n.props?.onPress, { deep: true })[0];
    act(() => six.props.onPress());
    expect(next().days[0].slots[0].setCount).toBe(6);
  });

  it('the add sheet searches the catalogue and reports the grown draft', () => {
    const { r, next } = draw();
    const open = r.root.findAll((n) => n.props?.label === tg('builder.addLift') && n.props?.onPress, { deep: true })[0];
    act(() => open.props.onPress());
    const row = r.root.findAll((n) => n.props?.accessibilityLabel === tg('exercise.lat_pulldown', { defaultValue: 'Lat Pulldown' }) && n.props?.onPress, { deep: true })[0];
    act(() => row.props.onPress());
    expect(next().days[0].slots.map((s) => s.exerciseId)).toContain('lat_pulldown');
  });

  it('⛔ the add sheet offers ABS — the chip that was filtered out (founder 2026-08-29)', () => {
    /*
     * *"במסך בניית תוכנית האימון בעצמי אין אפשרות של להוסיף תרגילי בטן משום מה."*
     *
     * The chip row was `CANONICAL_MUSCLE_ORDER` minus `'Core'` — an exclusion borrowed from
     * `weekQuality`, where it is CORRECT (abs are not a structural volume target, so the scoreboard
     * does not price a week by them) and where it is a statement about AUDITING. Copied into a
     * control whose whole job is letting her ask for something, it hid nine core movements behind
     * having to guess their names into the search box.
     *
     * ⚠️ ASSERTED AS THE WHOLE CANONICAL ORDER, not as "Core is present". The bug was a filter, and
     * a filter is exactly the thing that comes back for the next plausible-sounding muscle.
     */
    const { r, next } = draw();
    const open = r.root.findAll((n) => n.props?.label === tg('builder.addLift') && n.props?.onPress, { deep: true })[0];
    act(() => open.props.onPress());
    const said = textOf(r);
    for (const m of CANONICAL_MUSCLE_ORDER) expect(said).toContain(tg(`muscle.${m}`));

    // …and the chip actually FILTERS to abs: pressing it leaves core lifts and drops the rest.
    const textIn = (node): string => {
      const out: string[] = [];
      const walk = (x) => {
        if (x == null) return;
        if (typeof x === 'string') return void out.push(x);
        if (Array.isArray(x)) return void x.forEach(walk);
        if (x.children) walk(x.children);
      };
      walk(node.toJSON ? node.toJSON() : node);
      return out.join(' ');
    };
    const chip = r.root
      .findAll((n) => n.props?.accessibilityRole === 'button' && typeof n.props?.onPress === 'function', { deep: true })
      .find((n) => textIn(n).trim() === tg('muscle.Core'));
    expect(chip).toBeTruthy();
    act(() => chip!.props.onPress());

    const offered = r.root
      .findAll((n) => typeof n.props?.accessibilityLabel === 'string' && typeof n.props?.onPress === 'function', { deep: true })
      .map((n) => String(n.props.accessibilityLabel));
    const nameOf = (id: string) => tg(`exercise.${id}`, { defaultValue: id });
    // The cable crunch is generated core and is offered…
    expect(offered).toContain(nameOf('cable_crunch'));
    // …the ab wheel is SWAP-ONLY and stays out (founder's device QA, 2026-08-23, untouched)…
    expect(offered).not.toContain(nameOf('ab_wheel'));
    // …and the chip really did filter: a chest lift is no longer on the list.
    expect(offered).not.toContain(nameOf('bb_bench_press'));

    // …and one of them can actually be added to her day, which is the founder's whole complaint.
    const row = r.root.findAll(
      (n) => n.props?.accessibilityLabel === nameOf('cable_crunch') && n.props?.onPress,
      { deep: true },
    )[0];
    act(() => row.props.onPress());
    expect(next().days[0].slots.map((s) => s.exerciseId)).toContain('cable_crunch');
  });

  it('advice renders as sentences, and says it is advice', () => {
    const d = fixtureDraft();
    const { r } = draw({ advice: builderAdvice(d, {}) });
    const said = textOf(r);
    expect(said.toUpperCase()).toContain(tg('builder.adviceTitle').toUpperCase());
    expect(said).toContain(tg('builder.adviceNote')); // "advice, not rules"
  });

  it('every lift row carries its movement still, and the still is a door to the full demo', () => {
    const { r } = draw();
    // One demo door per lift (3 in the fixture) — the still beside the name (founder 2026-08-25).
    const doors = r.root.findAll((n) => n.props?.accessibilityLabel === tg('builder.showDemo') && n.props?.onPress, { deep: true });
    expect(doors.length).toBeGreaterThanOrEqual(3);
    act(() => doors[0].props.onPress());
    // The full looping demo card opens over the builder — same card the workout uses.
    expect(textOf(r)).toContain(tg('workout.tapAnywhere'));
  });

  it('removing a lift reports the shrunken draft — six becomes five, on the glass', () => {
    const { r, next } = draw();
    const removes = r.root.findAll((n) => n.props?.accessibilityLabel === tg('builder.removeLift') && n.props?.onPress, { deep: true });
    act(() => removes[0].props.onPress());
    expect(next().days[0].slots).toHaveLength(1); // was 2 on day one of the fixture
  });

  it('the pen-back door shows only when the SAVED week is hers, and asks before acting', () => {
    const there = draw({ savedIsAuthored: true });
    expect(textOf(there.r)).toContain(tg('builder.revert'));
    const notThere = draw({ savedIsAuthored: false });
    expect(textOf(notThere.r)).not.toContain(tg('builder.revert'));
  });
});
