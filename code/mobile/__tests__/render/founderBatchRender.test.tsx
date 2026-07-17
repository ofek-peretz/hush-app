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
import { color, stage, signal, ink, paper, up, down } from '@/design/tokens';

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
 * THE ONE OCHRE (founder ruling 2026-07-13 — final, and it reverses the deep-fill pass).
 *
 * Three attempts, in order: cream on the bright ochre (the founder's brown, 2.6:1). Charcoal on
 * the bright ochre (AA, rejected on sight: "the black inside the brown, I liked it less"). Cream
 * on a darkened ochre (AA, rejected on the device: "bring back the familiar brown — this dark
 * brown is not pretty"). The founder has now chosen the same thing twice, and the choice is made:
 * ONE brown, everywhere, with cream on it.
 *
 * So this suite no longer guards a contrast floor on the primary label — it guards the SHAPE of
 * the decision, which is what can actually rot: that there is exactly one ochre, that cream (not
 * charcoal) sits on it, and that the exception is confined to a large button's short semibold
 * label. Everything an athlete must READ — the ink on paper, the cream on the graphite stage —
 * still has to clear AA, and that is asserted here so the exception can never quietly spread.
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

/**
 * READOUT (founder-ratified 2026-07-17). These three tests replace the three that
 * encoded the 2026-07-13 ochre ruling. They are not a relaxation of that ruling —
 * they are its retirement, and the direction of the third assertion is the whole
 * story: it used to assert the primary label FAILED AA on purpose, so that nobody
 * would "fix" the founder's brown by accident. There is no brown to fix now.
 */
describe('READOUT: no accent hue — emphasis is distance from the ground', () => {
  it('the primary action is the darkest thing on the page, not a colour', () => {
    const r = mount(<Button variant="primary" size="lg" block label="Begin Push A" onPress={() => {}} />);
    const json = JSON.stringify(r.toJSON());
    expect(json).toContain(signal.fill); // graphite
    expect(json).toContain(color.onAccent); // cream on it
    expect(json).not.toContain(signal[0]); // the mark never fills a control
    expect(texts(r)).toContain('Begin Push A');
  });

  it('the ochre is the MARK and nothing else — the fill and the mark have parted', () => {
    // The inverse of the old law. `signal.fill` used to be forbidden from diverging from
    // `signal[0]`, because a second, darker brown was what the founder rejected on sight.
    // Under READOUT they are different KINDS: `signal[0]` is a seal (HushMark only),
    // `signal.fill` is a control's ground. The seal is the only ochre the product owns.
    expect(signal.fill).not.toBe(signal[0]);
    expect(signal.fill).toBe(ink[0]);
    expect(signal[0]).toBe('#c8873a');
    // Retired slots must not quietly resurrect a coloured surface or coloured text.
    expect(signal.wash).toBe(paper[1]);
    expect(signal.ink).toBe(ink[0]);
    expect(up.wash).toBe(paper[1]);
    expect(down.wash).toBe(paper[1]);
  });

  it('nothing coloured carries text, so nothing can fail contrast', () => {
    // This assertion used to read `.toBeLessThan(4.5)`. That is the entire redesign.
    expect(contrast(signal.fill, color.onAccent)).toBeGreaterThanOrEqual(4.5);

    // Every tier licensed to carry text, on every ground it is allowed to sit on.
    for (const t of [color.textPrimary, color.textSecondary, color.textMuted, color.textTertiary]) {
      expect(contrast(color.bg, t)).toBeGreaterThanOrEqual(4.5); // on the ground
      expect(contrast(color.surface, t)).toBeGreaterThanOrEqual(4.5); // on a raised card
      expect(contrast(color.lift, t)).toBeGreaterThanOrEqual(4.5); // on the active thing
      expect(contrast(color.fillSubtle, t)).toBeGreaterThanOrEqual(4.5); // in a well
    }

    // The stage. `ink2` is included deliberately: the old test stopped at `ink1`, which is
    // why #767471 shipped at 4.04:1 and nobody saw it.
    for (const t of [stage.ink0, stage.ink1, stage.ink2]) {
      expect(contrast(stage[0], t)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(stage[1], t)).toBeGreaterThanOrEqual(4.5); // and on a raised stage card
    }

    // Semantics survive the accent's death — so they answer to the same bar, in both worlds.
    expect(contrast(color.bg, up[0])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.bg, down[0])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(stage[0], up.stage)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(stage[0], down.stage)).toBeGreaterThanOrEqual(4.5);
  });

  it('the ladder climbs: a raised card is lighter than the page it sits on', () => {
    // The pre-2026-07-17 file had `paper[1]` DARKER than `paper[0]` — "raised" meant a tint,
    // not an elevation, which is why a card needed a hairline to be seen at all.
    expect(luminance(paper.lift)).toBeGreaterThan(luminance(paper[1]));
    expect(luminance(paper[1])).toBeGreaterThan(luminance(paper[0]));
    expect(luminance(paper[0])).toBeGreaterThan(luminance(paper[2]));
    expect(luminance(paper[2])).toBeGreaterThan(luminance(paper[3]));
    // The ground is paper, not white. 78.6% — a Braun housing, not a lamp.
    expect(luminance(paper[0])).toBeLessThan(0.85);
  });

  it('nothing in the system is a neutral grey', () => {
    // "No accent hue" is not "no hue at all" — that conflation is what made the first pass
    // read as silver. Warmth is R−B; every ground and every ink carries some.
    const warmth = (hex: string) => parseInt(hex.slice(1, 3), 16) - parseInt(hex.slice(5, 7), 16);
    for (const p of [paper[0], paper[1], paper[2], paper[3]]) expect(warmth(p)).toBeGreaterThanOrEqual(4);
    for (const i of [ink[0], ink[1], ink[2]]) expect(warmth(i)).toBeGreaterThanOrEqual(4);
    expect(warmth(stage[0])).toBeGreaterThan(0); // warm graphite, never true #000
    // Both ramps converge on the same warm middle from opposite ends.
    expect(warmth(paper[2])).toBeGreaterThan(warmth(paper[1])); // paper warms as it darkens
    expect(warmth(ink[2])).toBeGreaterThan(warmth(ink[0])); // ink warms as it lightens
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
