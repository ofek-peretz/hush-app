// @ts-nocheck
import fs from 'fs';
import path from 'path';
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, View } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { initI18n, tg } from '@/i18n';
import { color } from '@/design/tokens';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PRICE WEARS THE APP'S OWN CARD.
 *
 * ⛔ FOUNDER, 2026-08-13: *"אני חושב שצריך לשנות אותו ולהסיר את כל המלל הזה… ופשוט להגדיל את שני
 * הכרטיסים ולשים אותם במרכז ותעצב אותם כמו שעשית לשאר הכרטיסים באפליקציה. גם למה הלבן הזה בתוך
 * הכרטיס — מאיפה הוא הגיע בכלל?"*
 *
 * ── WHERE THE WHITE CAME FROM, SINCE HE ASKED ───────────────────────────────────────────────────
 * It was deliberate and it was mine: the annual plan cut from PAPER, carrying the one drop shadow
 * in the product outside the training stage, on the argument that "a card you are meant to pick up
 * has to stand off the page". **It is the only object in Hush that uses that trick**, which is
 * exactly why it read as imported from another app — and it did so on the screen where being
 * trusted matters most.
 *
 * Every other choice in the product — sex, units, language, Lifts/Log — is a dark field with a
 * hairline that LIGHTS to cream when chosen. So is this one now.
 *
 * ── AND THE PITCH WENT WITH IT ──────────────────────────────────────────────────────────────────
 * Three ruled promises and a renewal sentence stood between the headline and the prices. She has
 * spent fourteen sessions verifying those promises; the renewal terms are the legal line at the
 * foot, said twice. What is left is the headline, the two prices, and the act.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const METRICS: Metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

const PRODUCTS = [
  { id: 'hush.pro.annual', period: 'annual', priceLabel: '$59.99', introTrialLabel: null },
  { id: 'hush.pro.month', period: 'monthly', priceLabel: '$9.99', introTrialLabel: null },
];

jest.mock('@/platform/billing', () => {
  const actual = jest.requireActual('@/platform/billing');
  return {
    ...actual,
    billing: {
      getProducts: async () => [
        { id: 'hush.pro.annual', period: 'annual', priceLabel: '$59.99', introTrialLabel: null },
        { id: 'hush.pro.month', period: 'monthly', priceLabel: '$9.99', introTrialLabel: null },
      ],
    },
  };
});

jest.mock('@/state/stores/appStore', () => ({
  useApp: () => ({
    modeState: { completedSessions: 0 },
    entitlement: { active: false },
    purchaseSubscription: async () => ({ status: 'cancelled' }),
    restorePurchases: async () => ({ status: 'cancelled' }),
  }),
}));

jest.mock('@/platform/telemetry', () => ({ track: async () => {} }));

const { Paywall } = require('@/screens/subscription/Paywall');

beforeAll(async () => {
  await initI18n();
});

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const SRC = read('src/screens/subscription/Paywall.tsx');

const mounted: ReactTestRenderer[] = [];
async function screen(): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <Paywall navigation={{ goBack: () => {} }} route={{ params: { source: 'gate' } }} />
      </SafeAreaProvider>,
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

const flat = (s: unknown): Record<string, unknown> =>
  Object.assign({}, ...[s].flat(Infinity).filter((x) => x && typeof x === 'object'));

const words = (r: ReactTestRenderer): string =>
  r.root
    .findAllByType(Text)
    .map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.filter((x) => typeof x === 'string').join('') : String(c ?? '');
    })
    .join(' | ');

/**
 * The two plan cards, found the way the athlete finds them: they are the radios. Found by SHAPE
 * rather than `findAllByType(Pressable)` — RN exports Pressable through a memo, so the imported
 * identity is not the rendered one and a type query silently returns nothing.
 */
const cards = (r: ReactTestRenderer) =>
  r.root.findAll((n) => n.props?.accessibilityRole === 'radio' && typeof n.props?.style === 'function');

describe('⛔ the white card is gone, and nothing replaced it with another special case', () => {
  it('no plan is drawn on paper, and no shadow is raised on this screen', async () => {
    /*
     * `paper` and `ink` are the LIGHT ladder — correct on a share card that becomes an image, and
     * wrong on a screen that is part of the dark app. Reading the import list is what makes this
     * airtight: a style can be renamed, an import cannot be smuggled.
     */
    const imports = SRC.match(/^import .*from '@\/design\/tokens';$/m)?.[0] ?? '';
    expect(imports).not.toMatch(/\bpaper\b/);
    expect(imports).not.toMatch(/\bink\b/);
    expect(SRC).not.toMatch(/backgroundColor: (paper|ink)/);
    expect(SRC).not.toContain('onPaper');
    expect(SRC).not.toContain('shadowOpacity');
    expect(SRC).not.toContain('elevation:');
  });

  it('⚠️ …and both cards are the SAME object — equal geometry, one of them merely chosen', async () => {
    const [a, b] = cards(await screen()).map((n) => flat(n.props.style({ pressed: false })));
    // Equal height, equal radius, equal padding: neither plan is dressed as the answer.
    for (const key of ['minHeight', 'borderRadius', 'borderWidth', 'paddingVertical', 'paddingHorizontal']) {
      expect([key, a[key]]).toEqual([key, b[key]]);
    }
    // The difference between them is ONE property, and it is the lit edge.
    expect(a.borderColor).not.toEqual(b.borderColor);
  });

  it('⛔ each plan takes a FULL-WIDTH line of its own, annual first', async () => {
    /*
     * ⛔ FOUNDER, 2026-08-13: *"למה לא אופקי כאשר תשים את השנתי ראשון? רק תן לכל אחד מהם את הספייס
     * שלו."* Two narrow columns made the plans compete for the same 159 points and squeezed the
     * price into a figure that had to shrink to fit. **A plan is a NAME and a PRICE — a line, not a
     * column** — so each takes the width, and the reading order becomes the comparison.
     */
    const r = await screen();
    const [a, b] = cards(r).map((n) => flat(n.props.style({ pressed: false })));
    expect(a.flexDirection).toBe('row');
    expect(b.flexDirection).toBe('row');
    // Not side by side: nothing stretches them into a shared row, and nothing caps their width.
    const row = r.root.findAll((n) => n.props?.style && flat(n.props.style).gap === 18 && !n.props.accessibilityRole);
    expect(row.length).toBeGreaterThan(0);
    expect(flat(row[0].props.style).flexDirection).toBeUndefined();
    expect(a.minHeight).toBeGreaterThanOrEqual(120);

    // Annual leads — it is the better value, and PRODUCT_ORDER says so once for the whole app.
    expect(cards(r)[0].props.accessibilityLabel).toContain(tg('paywall.annual'));
    expect(cards(r)[1].props.accessibilityLabel).toContain(tg('paywall.monthly'));
  });

  it('⚠️ the chosen card is the LIT one — the same signal sex, units and language give', async () => {
    const r = await screen();
    const [annual, monthly] = cards(r);
    expect(annual.props.accessibilityState.selected).toBe(true);
    expect(monthly.props.accessibilityState.selected).toBe(false);

    const lit = String(flat(annual.props.style({ pressed: false })).borderColor).toLowerCase();
    const dim = String(flat(monthly.props.style({ pressed: false })).borderColor);
    // Cream at full strength against the same cream at 0.16 — the onboarding control's own values.
    expect(lit).toBe(color.textPrimary.toLowerCase());
    expect(dim).toContain('0.16');

    // ⚠️ AND THE LIGHT MOVES. A chosen state that cannot be un-chosen is a decoration.
    await act(async () => {
      monthly.props.onPress();
    });
    const after = cards(r).map((n) => String(flat(n.props.style({ pressed: false })).borderColor).toLowerCase());
    expect(after[1]).toBe(color.textPrimary.toLowerCase());
    expect(after[0]).toContain('0.16');
  });

  it('A.13 — a press WASHES the card and never dims it', async () => {
    const pressed = flat(cards(await screen())[0].props.style({ pressed: true }));
    expect(pressed.opacity).toBeUndefined();
    expect(String(pressed.backgroundColor)).toContain('241,238,229');
  });
});

describe('⛔ the pitch is gone', () => {
  it('the three promises and the renewal sentence are not on the screen — or in either locale', async () => {
    const said = words(await screen());
    expect(said).toContain(tg('paywall.title'));
    for (const gone of ['benefitProgram', 'benefitAdapts', 'benefitPortrait', 'trialConverts']) {
      // Deleted, not merely unrendered: a key left behind is a sentence waiting to be put back.
      for (const locale of ['en', 'he']) {
        expect(read(`src/i18n/locales/${locale}.json`)).not.toContain(`"${gone}"`);
      }
      expect(SRC).not.toContain(gone);
    }
    expect(SRC).not.toContain('function Promise(');
  });

  it('⚠️ what remains is the headline, the two prices and the act — nothing between them', async () => {
    const r = await screen();
    expect(cards(r)).toHaveLength(2);
    const said = words(r);
    expect(said).toContain('$5.00'); // the annual, divided into the unit the monthly is quoted in
    expect(said).toContain('$9.99');
    expect(said).toContain(tg('paywall.keepTraining'));
    // The legal line stays: Apple requires it, and it is where the renewal terms now live ALONE.
    expect(said).toMatch(/auto-renews/);
  });
});

describe('⚠️ and they sit in the middle of what the copy vacated', () => {
  it('the plans are centred in their own block rather than stacked under the title', async () => {
    const r = await screen();
    const wrap = r.root
      .findAllByType(View)
      .map((n) => flat(n.props.style))
      .filter((s) => s.justifyContent === 'center' && s.flex === 1);
    expect(wrap.length).toBeGreaterThan(0);
    // A ScrollView that does not grow cannot centre anything — the space has to exist first.
    expect(SRC).toContain('flexGrow: 1');
  });

  it('⛔ the cadence is SANS, because "/month" is a word — and in Hebrew mono cannot draw it', async () => {
    /*
     * ⚠️ THIS WAS BROKEN AND `monoCarriesNoWords` COULD NOT SEE IT. The law scans for `t(...)`
     * INSIDE a mono-styled `<Text>`; here the string arrived through a `const`, so "/חודש" sat in
     * IBM Plex Mono — a face with no Hebrew glyphs — one OS substitution away from tofu on every
     * Hebrew paywall. The sibling law now catches the variable form; this pins the fix itself.
     */
    expect(SRC).toMatch(/cadence: \{[^}]*font\.sans[^}]*\}/);
    expect(SRC).not.toMatch(/cadence: \{[^}]*font\.mono/);
  });
});
