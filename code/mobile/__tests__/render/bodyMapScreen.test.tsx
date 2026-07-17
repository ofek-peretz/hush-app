/**
 * The body map, mounted for real — the centrepiece of "what to train" (register Part 3).
 *
 * `validateMap` and the emphasis budget were already pure, already tested, and already correct in
 * the engine. That was never the problem. The problem was that THE SCREEN DID NOT ASK THEM:
 *
 *   · `fixtureModel`'s safety net says, in writing, "everything-off (S-3) is prevented by the
 *     body-map screen (validateMap)". It wasn't. An all-off map sailed through Continue and hit
 *     that net, which quietly rebuilds an ALL-NORMAL map — so Hush handed her a full-body week
 *     after she had explicitly asked for none of it, and never said a word about it.
 *   · A third emphasis mark hit `return` with a haptic tick and nothing else. The brief: "make that
 *     limit legible, not a hidden error."
 *   · The consequence of turning a region off was never stated at all. The brief: "state the
 *     consequence… calmly and once… never argue with the choice."
 *
 * A typecheck cannot see any of that, which is why this file mounts the screen and asks what an
 * athlete would see.
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { BodyMap } from '@/screens/onboarding/BodyMap';
import { initI18n, tg } from '@/i18n';
import { CANONICAL_MUSCLE_ORDER, EMPHASIS_BUDGET } from '@/engine/v5/constants';

beforeAll(async () => {
  await initI18n();
});

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function mount(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(<SafeAreaProvider initialMetrics={METRICS}>{el}</SafeAreaProvider>);
  });
  return r;
}

type Json = { type: string; props: Record<string, unknown>; children: Json[] | null } | string | null;

/** Every string the athlete actually reads on the rendered screen. */
function texts(r: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (n: Json | Json[]): void => {
    if (n == null) return;
    if (typeof n === 'string') return void out.push(n);
    if (Array.isArray(n)) return void n.forEach(walk);
    if (n.children) n.children.forEach(walk);
  };
  walk(r.toJSON() as unknown as Json);
  return out;
}

function byLabel(r: ReactTestRenderer, label: string): ReactTestInstance | null {
  const hits = r.root.findAll((n) => n.props?.accessibilityLabel === label, { deep: true });
  return hits.find((n) => typeof n.props.onPress === 'function') ?? hits[0] ?? null;
}

/** Tap a muscle's stance the way a finger does — through the label VoiceOver reads. */
function tap(r: ReactTestRenderer, muscle: string, stance: 'Off' | 'Normal' | 'Emphasis') {
  const label = `${tg(`muscle.${muscle}`)} — ${tg(`ob.stance${stance}`)}`;
  const node = byLabel(r, label);
  if (!node) throw new Error(`no control for ${label}`);
  act(() => node.props.onPress());
}

/** The Continue button — the only way out of this screen. Found the way VoiceOver finds it; a
 *  JSON.stringify over React props walks into the Provider's circular structure. */
function continueBtn(r: ReactTestRenderer): ReactTestInstance {
  const btn = byLabel(r, tg('ob.daysBuild'));
  if (!btn) throw new Error('no Continue');
  return btn;
}

const UPPER = ['Chest', 'Shoulders', 'Triceps', 'Back', 'Biceps', 'Core'];
const LOWER = ['Quads', 'Hamstrings', 'Glutes', 'Calves'];

function props(over: Record<string, unknown> = {}) {
  const navigated: unknown[] = [];
  return {
    nav: navigated,
    p: {
      navigation: { navigate: (s: string, p: unknown) => void navigated.push({ s, p }), goBack: () => {} },
      route: { params: { inputs: { name: 'Ofek', daysPerWeek: 4 } } },
      ...over,
    } as never,
  };
}

describe('the map arrives whole — nothing to configure, only things to change', () => {
  it('lists all ten muscles, grouped the way the assembler groups them', () => {
    const { p } = props();
    const said = texts(mount(<BodyMap {...p} />)).join(' ');
    for (const m of CANONICAL_MUSCLE_ORDER) expect(said).toContain(tg(`muscle.${m}`));
    // The regions are not a display invention — they are `regionOf`, the same source the assembler
    // uses to decide which days exist. A screen that grouped its own way would show one body and
    // build another.
    expect(said).toContain(tg('ob.regionUpper').toUpperCase());
    expect(said).toContain(tg('ob.regionLower').toUpperCase());
  });

  it('everything starts ON — an untouched map is buildable and says nothing about itself', () => {
    const { p } = props();
    const r = mount(<BodyMap {...p} />);
    expect(continueBtn(r).props.accessibilityState?.disabled).toBeFalsy();
    // No consequence, because nothing has been turned off. Just the budget's standing fact.
    expect(texts(r).join(' ')).toContain(tg('ob.mapEmphasis', { n: 0 }));
  });
});

describe('S-3 · an unbuildable map never leaves this screen', () => {
  it('everything off BLOCKS Continue, and Hush says why', () => {
    // Before 2026-07-17 this navigated. `fixtureModel` caught it and silently rebuilt an ALL-NORMAL
    // map — Hush overriding her stated choice without a word. The belt is still there; nothing may
    // reach it.
    const { p, nav } = props();
    const r = mount(<BodyMap {...p} />);
    for (const m of CANONICAL_MUSCLE_ORDER) tap(r, m, 'Off');

    expect(texts(r).join(' ')).toContain(tg('ob.mapNothingOn'));
    expect(continueBtn(r).props.accessibilityState?.disabled).toBe(true);
    act(() => continueBtn(r).props.onPress());
    expect(nav).toEqual([]); // …and it really did not move
  });

  it('turning one muscle back on makes the map buildable again', () => {
    const { p, nav } = props();
    const r = mount(<BodyMap {...p} />);
    for (const m of CANONICAL_MUSCLE_ORDER) tap(r, m, 'Off');
    tap(r, 'Chest', 'Normal');

    expect(continueBtn(r).props.accessibilityState?.disabled).toBeFalsy();
    act(() => continueBtn(r).props.onPress());
    expect(nav).toHaveLength(1);
  });
});

describe('the consequence is stated — calmly, once, never argued with', () => {
  it('legs off → "your week is upper-body work"', () => {
    const { p } = props();
    const r = mount(<BodyMap {...p} />);
    for (const m of LOWER) tap(r, m, 'Off');
    expect(texts(r).join(' ')).toContain(tg('ob.mapUpperOnly'));
    // Stated, not argued: the map is still buildable and Continue is still open.
    expect(continueBtn(r).props.accessibilityState?.disabled).toBeFalsy();
  });

  it('upper off → "your week is lower-body work"', () => {
    const { p } = props();
    const r = mount(<BodyMap {...p} />);
    for (const m of UPPER) tap(r, m, 'Off');
    expect(texts(r).join(' ')).toContain(tg('ob.mapLowerOnly'));
  });

  it('one muscle off is just her map — no sentence for it', () => {
    // "Calmly and ONCE": a consequence is a whole region going dark. Narrating every toggle would
    // be the nagging the brief bans.
    const { p } = props();
    const r = mount(<BodyMap {...p} />);
    tap(r, 'Calves', 'Off');
    const said = texts(r).join(' ');
    expect(said).not.toContain(tg('ob.mapUpperOnly'));
    expect(said).not.toContain(tg('ob.mapLowerOnly'));
  });
});

describe('F-4 · the emphasis budget is legible, not a hidden error', () => {
  it('a third mark is refused OUT LOUD — naming the two that hold it', () => {
    // The old build hit `return` with a tick: the athlete tapped, nothing happened, and nothing
    // explained why. The brief: "make that limit legible, not a hidden error."
    const { p } = props();
    const r = mount(<BodyMap {...p} />);
    tap(r, 'Chest', 'Emphasis');
    tap(r, 'Back', 'Emphasis');
    tap(r, 'Quads', 'Emphasis'); // the third — refused

    expect(texts(r).join(' ')).toContain(
      tg('ob.mapBudgetFull', { a: tg('muscle.Chest'), b: tg('muscle.Back') }),
    );
  });

  it('the budget really holds — the third muscle did not take the mark', () => {
    const { p, nav } = props();
    const r = mount(<BodyMap {...p} />);
    tap(r, 'Chest', 'Emphasis');
    tap(r, 'Back', 'Emphasis');
    tap(r, 'Quads', 'Emphasis');
    act(() => continueBtn(r).props.onPress());

    const map = (nav[0] as { p: { inputs: { bodyMap: Record<string, string> } } }).p.inputs.bodyMap;
    expect(Object.values(map).filter((s) => s === 'emphasis')).toHaveLength(EMPHASIS_BUDGET);
    expect(map.Quads).toBeUndefined();
  });

  it('freeing a mark clears the refusal — it answers an act, it does not stand there scolding', () => {
    const { p } = props();
    const r = mount(<BodyMap {...p} />);
    tap(r, 'Chest', 'Emphasis');
    tap(r, 'Back', 'Emphasis');
    tap(r, 'Quads', 'Emphasis'); // refused
    tap(r, 'Chest', 'Normal'); // …she frees one

    const said = texts(r).join(' ');
    expect(said).not.toContain(tg('ob.mapBudgetFull', { a: tg('muscle.Chest'), b: tg('muscle.Back') }));
    expect(said).toContain(tg('ob.mapEmphasis', { n: 1 }));
  });
});

describe('the map that leaves is the map she drew', () => {
  it('stores only her decisions — normal is the absence of one, not one', () => {
    const { p, nav } = props();
    const r = mount(<BodyMap {...p} />);
    tap(r, 'Calves', 'Off');
    tap(r, 'Back', 'Emphasis');
    act(() => continueBtn(r).props.onPress());

    const map = (nav[0] as { p: { inputs: { bodyMap: Record<string, string> } } }).p.inputs.bodyMap;
    expect(map).toEqual({ Calves: 'off', Back: 'emphasis' });
  });

  it('a mark taken back leaves no trace', () => {
    const { p, nav } = props();
    const r = mount(<BodyMap {...p} />);
    tap(r, 'Calves', 'Off');
    tap(r, 'Calves', 'Normal'); // …she changed her mind
    act(() => continueBtn(r).props.onPress());

    const map = (nav[0] as { p: { inputs: { bodyMap: Record<string, string> } } }).p.inputs.bodyMap;
    expect(map).toEqual({});
  });
});
