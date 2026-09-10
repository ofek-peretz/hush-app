/**
 * THE WAY BACK, AND THE THING SHE IS SENDING — founder A.4.
 *
 * "Share screen: no way back to Today — no back control. And restyle it in the manner of the
 * personal-record share card; the current white treatment is ugly."
 *
 * ── The way back ──────────────────────────────────────────────────────────────────────────────
 * The route is pushed with `headerShown: false`, so the ONLY exit was the edge-swipe gesture —
 * which works, and which nothing on the glass admits to. He confirmed that directly: "there is a
 * swipe back, but make a button too, so it is clear you can return to TODAY."
 *
 * A bare chevron would have said "back", and on a screen opened from a door on Today "back" is a
 * guess. So the control names its DESTINATION, in the word the tab bar itself uses (`nav.today`) —
 * the same rule the nav-path copy already follows, and the reason there is a test for it here:
 * the day someone rewords the tab, this control has to move with it or it starts lying.
 *
 * ── The card ──────────────────────────────────────────────────────────────────────────────────
 * It was a flat 5%-cream wash inside a hairline: a form field, not a thing anyone would be pleased
 * to send. The record poster (`components/share/ShareCard`) is the manner he named — the lit stage
 * gradient poured into a frame, the wordmark carried whole, the moss spent on one small mark. This
 * is the same object, so it is built the same way.
 */
// @ts-nocheck

// 

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { SharePlanView } from '@/screens/plan/SharePlan';
import { initI18n, tg } from '@/i18n';
import type { SharedPlan } from '@/domain/planShare';
import { bidi } from '@/i18n/bidi';
import { signal } from '@/design/tokens';

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
    { name: 'Upper A', muscleGroups: ['Chest', 'Back'], exerciseIds: ['a', 'b', 'c'] },
    { name: 'Lower A', muscleGroups: ['Quads', 'Glutes'], exerciseIds: ['d', 'e'] },
  ],
  repBandByMuscle: { Chest: '8-10' },
};

const view = (over: Partial<React.ComponentProps<typeof SharePlanView>> = {}) => (
  <SharePlanView plan={PLAN} splitName="Upper / Lower" onSend={() => {}} onBack={() => {}} {...over} />
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

describe('the way back is on the glass, and it names where it goes', () => {
  it('the control is there, and it says Today — not "back"', () => {
    const r = mount(view());
    const back = r.root.findAll((n) => n.props?.accessibilityLabel === tg('nav.today') && typeof n.props.onPress === 'function');
    expect(back.length).toBeGreaterThan(0);
    // The word is VISIBLE, not only announced: the whole point is that a glance can see the exit.
    expect(texts(r)).toContain(tg('nav.today'));
    // …and it is not the generic word, which would leave the destination a guess.
    expect(texts(r)).not.toContain(tg('common.back'));
  });

  it('pressing it goes back', () => {
    let went = 0;
    const r = mount(view({ onBack: () => void went++ }));
    act(() => {
      r.root
        .findAll((n) => n.props?.accessibilityLabel === tg('nav.today') && typeof n.props.onPress === 'function')[0]
        .props.onPress();
    });
    expect(went).toBe(1);
  });

  /** The harness mounts this screen with no navigator, and a dead control is worse than none. */
  it('and it does not draw at all where there is nowhere to go back to', () => {
    const r = mount(view({ onBack: undefined }));
    expect(texts(r)).not.toContain(tg('nav.today'));
  });
});

describe('the card is dressed as the poster it is', () => {
  /**
   * The two things that make the record card a card rather than a panel: the stage gradient poured
   * into the frame, and the brand carried whole at its head. Asserted structurally — a colour
   * assertion would pin the palette, and the palette is not what he asked about.
   */
  it('carries the stage gradient, not a flat wash', () => {
    const r = mount(view());
    const grads = r.root.findAll((n) => {
      const name = typeof n.type === 'string' ? n.type : (n.type as { displayName?: string })?.displayName;
      return name === 'LinearGradient' || name === 'RNSVGLinearGradient';
    });
    expect(grads.length).toBeGreaterThan(0);
  });

  it('carries the wordmark, as the record poster does', () => {
    expect(texts(mount(view()))).toContain('hush');
  });

  /**
   * The days tag was a SOLID moss pill with dark ink — the loudest thing on a card that is mostly
   * a quiet list, and the opposite of how the record poster spends its one accent. It reads in
   * moss on a moss wash now, so nothing in the payload shouts over the payload.
   */
  it('spends its moss on a mark, not on a filled tag', () => {
    const r = mount(view());
    const flat = (s: unknown) => (Array.isArray(s) ? Object.assign({}, ...s.flat(Infinity).filter(Boolean)) : s);
    const label = tg('planShare.daysTag', { count: PLAN.days.length });

    // The tag's TEXT is the moss now — it used to be `onAccent` ink knocked out of a solid pill.
    const text = r.root.findAll((n) => n.children?.some((c) => typeof c === 'string' && c === label));
    expect(text.length).toBeGreaterThan(0);
    expect(text.map((n) => flat(n.props.style)?.color)).toContain(signal[0]);

    // …and its pill is a WASH, not the solid accent. (Scoped to the tag on purpose: the eyebrow's
    // 7 px dot and the send button ARE solid moss, and both are right — a mark and the act.)
    const pill = text[0].parent!;
    expect(flat(pill.props.style)?.backgroundColor).not.toBe(signal[0]);
  });

  it('still shows every day, and still never a load', () => {
    const said = texts(mount(view())).join(' ');
    expect(said).toContain('Upper A');
    expect(said).toContain('Lower A');
    expect(said).toContain(tg('planShare.structureOnly').trim());
    expect(said).not.toMatch(/\bkg\b/);
  });
});

/**
 * ⛔ NOTHING TRAVELS THAT THE PREVIEW DOES NOT SHOW.
 *
 * The card IS the payload rendered, and this file's own docblock promises "there is nothing on the
 * screen she cannot see in the preview". `SharePlanScreen` has always passed `from: profile.name`
 * and `sharedPlan` has always encoded it — the receiving screen is built around it — but the preview
 * never drew it. The one identifying thing in the payload was the one thing she could not read
 * before she sent it.
 */
describe('the preview shows her that her name is attached', () => {
  it('names the sender, in the card that is about to become a link', () => {
    expect(texts(mount(view())).join(' ')).toContain(tg('planShare.fromYou', { name: bidi('Dana') }));
  });

  it('and says nothing at all when no name travels', () => {
    // A profile with no name sends an unsigned plan, and the card states what it carries — a sender
    // line over an empty name would be the preview describing a field that is not in the payload.
    const said = texts(mount(view({ plan: { ...PLAN, from: undefined } }))).join(' ');
    expect(said).not.toContain('Dana');
    expect(said).not.toContain(tg('planShare.fromYou', { name: bidi('Dana') }));
    expect(said).toContain('Upper A'); // …and the rest of the card is untouched
  });
});
