/**
 * Render smoke tests for the 2026-07-12 design batch.
 *
 * The unit tests above pin the pure rules; this file does the thing a typecheck cannot: it
 * actually MOUNTS every component the batch introduced or rewrote, with real props, and asserts
 * what came out. A bad SVG path, a style key that resolves to undefined, a hook ordering
 * mistake, a component that renders nothing at all — none of those are type errors, and all of
 * them are the kind of thing that only shows up on a device otherwise.
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

import { WheelPicker } from '@/components/ds/WheelPicker';
import { HoldButton } from '@/components/ds/HoldButton';
import { TextField } from '@/components/ds/TextField';
import { Button } from '@/components/ds/Button';
import { MilestoneEmblem } from '@/components/MilestoneEmblem';
import { MilestoneGlyph, type MilestoneGlyphName } from '@/components/MilestoneGlyph';
import { RouteTrace } from '@/components/RouteTrace';
import { Icon } from '@/components/Icon';
import { OptStack } from '@/components/onboarding/OptStack';
import { color, stage } from '@/design/tokens';

function mount(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(el);
  });
  return r;
}

type Json = { type: string; props: Record<string, unknown>; children: Json[] | null } | string | null;

/**
 * Every text string actually rendered. Walks the OUTPUT tree, not the element tree — a
 * react-native <Text> is a composite that renders a host node, so asking the renderer for
 * components of type Text finds the wrapper and never reaches the string inside it.
 */
function texts(r: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (n: Json | Json[]): void => {
    if (n == null) return;
    if (typeof n === 'string') {
      out.push(n);
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (n.children) n.children.forEach(walk);
  };
  walk(r.toJSON() as unknown as Json);
  return out;
}

/**
 * Nodes carrying an accessibility role. HOST nodes only: `findAll` visits the composite
 * component AND the host element it renders, so a single accessible View is matched two or
 * three times over. The athlete's screen reader sees one — so should the test.
 */
function byRole(r: ReactTestRenderer, role: string): ReactTestInstance[] {
  return r.root.findAll((n) => typeof n.type === 'string' && n.props?.accessibilityRole === role);
}

describe('WheelPicker mounts as a measuring rule', () => {
  it('renders, and exposes the centred value to VoiceOver', () => {
    const r = mount(<WheelPicker value={82} onChange={() => {}} min={35} max={250} step={0.5} unit="kg" label="Weight" />);
    const adjustable = byRole(r, 'adjustable');
    expect(adjustable.length).toBe(1);
    expect(adjustable[0].props.accessibilityValue).toEqual({ text: '82 kg' });
    // The unit cell is present and is NOT part of the scrolling track.
    expect(texts(r)).toContain('kg');
  });

  it('survives the extremes of every track the app actually builds', () => {
    // These are the real call sites: age, height, bodyweight, sessions/week, target distance,
    // target time, and the 1,001-detent in-session load wheel that blanked in Build #22.
    const tracks: Array<[number, number, number, number]> = [
      [14, 90, 1, 28], // age
      [120, 220, 1, 178], // height
      [35, 250, 0.5, 82], // weight (431 detents)
      [2, 6, 1, 4], // sessions / week
      [0.5, 50, 0.5, 5], // target distance
      [5, 240, 5, 30], // target time
      [0, 500, 0.5, 60], // in-session load (1,001 detents)
    ];
    for (const [min, max, step, value] of tracks) {
      expect(() => mount(<WheelPicker value={value} onChange={() => {}} min={min} max={max} step={step} />)).not.toThrow();
    }
  });

  it('renders on the inverted stage too (the in-workout Edit Result)', () => {
    expect(() => mount(<WheelPicker onStage value={60} onChange={() => {}} min={0} max={500} step={0.5} unit="kg" />)).not.toThrow();
  });
});

describe('HoldButton is a hold, not a tap', () => {
  it('does NOT fire on a press alone — a stray tap can never end a run', () => {
    const onComplete = jest.fn();
    const r = mount(<HoldButton onStage block label="Hold to finish" onComplete={onComplete} />);
    // The Pressable that owns the hold. (The completion path is driven by the Animated
    // timing callback, which is a real animation clock — that half is exercised on device;
    // what MUST hold here is the safety property: nothing fires without a completed hold.)
    const pressable = r.root.findAll((n) => typeof n.props?.onPressIn === 'function')[0];

    act(() => pressable.props.onPressIn());
    expect(onComplete).not.toHaveBeenCalled(); // the hold has only begun

    act(() => pressable.props.onPressOut()); // let go early
    expect(onComplete).not.toHaveBeenCalled(); // …and nothing happened

    act(() => r.unmount()); // the sweep animation is torn down with the view
  });

  it('carries its label', () => {
    const r = mount(<HoldButton label="Hold to finish" onComplete={() => {}} />);
    expect(texts(r)).toContain('Hold to finish');
  });

  it('inks its label in the tone of the surface it is ON while holding', () => {
    // The "holding" colour used to be a single hardcoded stage ink. On a PAPER HoldButton that
    // is near-white on near-white — the label would vanish at the exact moment the athlete is
    // watching it to know the hold has taken.
    for (const onStage of [false, true]) {
      const r = mount(<HoldButton onStage={onStage} label="Hold to finish" onComplete={() => {}} />);
      const pressable = r.root.findAll((n) => typeof n.props?.onPressIn === 'function')[0];
      act(() => pressable.props.onPressIn());

      const json = JSON.stringify(r.toJSON());
      // The label must never be drawn in the OTHER surface's ink.
      expect(json).toContain(onStage ? stage.ink0 : color.textPrimary);
      expect(json).not.toContain(onStage ? color.textPrimary : stage.ink0);

      act(() => pressable.props.onPressOut());
      act(() => r.unmount());
    }
  });
});

describe('milestone badges render their meaning', () => {
  const ALL: MilestoneGlyphName[] = [
    'tally',
    'liberty', 'a380', 'train', 'warship', 'plates', 'eiffel',
    'squat', 'deadlift', 'bench', 'overhead', 'row',
    'raise', 'doubled',
  ];

  it('every glyph in the set draws (a malformed SVG path is not a type error)', () => {
    for (const name of ALL) {
      const r = mount(<MilestoneGlyph name={name} size={48} color="#854a0b" />);
      expect(r.toJSON()).toBeTruthy();
    }
  });

  it('the emblem strikes figure, caption and motif together', () => {
    const r = mount(<MilestoneEmblem size={216} onStage pulse value="140" caption="KG" glyph="bench" />);
    const out = texts(r);
    expect(out).toContain('140');
    expect(out).toContain('KG');
    // The halo loops forever by design — unmounting proves it is torn down with the view.
    act(() => r.unmount());
  });

  it('a mark with no figure gives the motif the whole medallion (the first raise)', () => {
    const r = mount(<MilestoneEmblem size={88} value="" glyph="raise" />);
    expect(texts(r)).toEqual([]); // no empty <Text> stub where the figure used to be
    expect(r.toJSON()).toBeTruthy();
  });

  it('renders locked silhouettes for the gallery', () => {
    expect(() => mount(<MilestoneEmblem size={88} tone="locked" value="250" caption="Tonnes" glyph="liberty" />)).not.toThrow();
  });
});

describe('RouteTrace', () => {
  const loop = Array.from({ length: 120 }, (_, i) => {
    const a = (i / 120) * Math.PI * 2;
    return { lat: 32.08 + 0.004 * Math.sin(a), lon: 34.78 + 0.005 * Math.cos(a) };
  });

  it('draws a run', () => {
    const r = mount(<RouteTrace route={loop} width={320} height={198} />);
    expect(r.toJSON()).toBeTruthy();
  });

  it('draws NOTHING rather than an empty frame when there is no route', () => {
    // A treadmill run, or a run with no location permission. The caller gates on
    // MIN_ROUTE_POINTS, but the component must be safe on its own.
    expect(mount(<RouteTrace route={[]} width={320} height={198} />).toJSON()).toBeNull();
    expect(mount(<RouteTrace route={[{ lat: 32, lon: 34 }]} width={320} height={198} />).toJSON()).toBeNull();
  });

  it('survives a run that never moved (every fix identical)', () => {
    const still = Array.from({ length: 30 }, () => ({ lat: 32.08, lon: 34.78 }));
    expect(() => mount(<RouteTrace route={still} width={320} height={198} />)).not.toThrow();
  });
});

describe('the icon set', () => {
  it('draws the new runner glyph', () => {
    expect(mount(<Icon name="runner" size={20} />).toJSON()).toBeTruthy();
  });
});

describe('primary buttons carry charcoal on ochre (WCAG)', () => {
  it('the primary label is the charcoal on-accent ink, not paper', () => {
    const r = mount(<Button variant="primary" size="lg" block label="Begin Push A" onPress={() => {}} />);
    const json = JSON.stringify(r.toJSON());
    expect(json).toContain(color.onAccent); // charcoal, 7.0:1 on ochre
    expect(json).not.toContain('#fbfaf8'); // never paper on ochre again (2.4:1, fails AA)
    expect(texts(r)).toContain('Begin Push A');
  });
});

describe('onboarding controls', () => {
  it('OptStack leads with the radio and reports selection to VoiceOver', () => {
    const r = mount(
      <OptStack
        value="intermediate"
        onChange={() => {}}
        options={[
          { value: 'beginner', label: 'Beginner', desc: 'under 1 year' },
          { value: 'intermediate', label: 'Intermediate', desc: '1–3 years' },
          { value: 'advanced', label: 'Advanced', desc: '3+ years' },
        ]}
      />,
    );
    const radios = byRole(r, 'radio');
    expect(radios.length).toBe(3);
    expect(radios.map((n) => n.props.accessibilityState.selected)).toEqual([false, true, false]);
  });

  it('TextField is written on a rule, and its label is a legend', () => {
    const r = mount(<TextField block label="Name" value="Ofek" onChangeText={() => {}} placeholder="Your name" />);
    expect(texts(r)).toContain('NAME');
  });
});
