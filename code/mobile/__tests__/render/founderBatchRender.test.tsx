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
import { TextField } from '@/components/ds/TextField';
import { Button } from '@/components/ds/Button';
import { MilestoneEmblem } from '@/components/MilestoneEmblem';
import { MilestoneGlyph, type MilestoneGlyphName } from '@/components/MilestoneGlyph';
import { RouteTrace } from '@/components/RouteTrace';
import { Icon } from '@/components/Icon';
import { OptStack } from '@/components/onboarding/OptStack';
import { color, stage, signal } from '@/design/tokens';

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

  it('draws a real weight PLATE for the load instruction', () => {
    // It was lucide `layers` — two stacked rhombi, which an athlete at a bar read as two squares.
    const r = mount(<Icon name="plate" size={18} />);
    const json = JSON.stringify(r.toJSON());
    expect(r.toJSON()).toBeTruthy();
    expect(json).toContain('Circle'); // a disc, not a polygon
  });
});

/**
 * THE OCHRE THAT CARRIES TEXT (founder 2026-07-12, reversing the charcoal-on-ochre pass).
 *
 * The founder's verdict on charcoal-on-ochre was blunt: "the black inside the brown, I liked it
 * less — put back what was there." The accessibility problem that caused it was real, though:
 * cream on the bright ochre is 2.6:1 and cannot be read in sun. So the FILL got darker instead
 * of the ink getting heavier, and both constraints are satisfied at once.
 *
 * This test does not take that on faith. It computes the actual WCAG contrast ratio of whatever
 * the button renders, so the law survives anybody's future colour tweak.
 */
function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('the primary button: cream on a deep ochre, and it clears WCAG AA', () => {
  it('renders cream ink on signal.fill — not charcoal, and not on the bright signal', () => {
    const r = mount(<Button variant="primary" size="lg" block label="Begin Push A" onPress={() => {}} />);
    const json = JSON.stringify(r.toJSON());
    expect(json).toContain(signal.fill); // the deep ochre
    expect(json).toContain(color.onAccent); // cream
    expect(json).not.toContain(signal[0]); // the bright ochre never carries a letter
    expect(texts(r)).toContain('Begin Push A');
  });

  it('measures at least 4.5:1 — the law, not the swatch', () => {
    expect(contrast(signal.fill, color.onAccent)).toBeGreaterThanOrEqual(4.5);
  });

  it('the bright ochre is still exactly why it could not carry text', () => {
    // Kept as the reason this whole token split exists: signal[0] is beautiful and unreadable.
    expect(contrast(signal[0], color.onAccent)).toBeLessThan(4.5);
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
