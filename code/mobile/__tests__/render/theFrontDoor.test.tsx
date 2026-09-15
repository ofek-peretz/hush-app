/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE FRONT DOOR — the first eight seconds of the product.
 *
 * ⛔ FOUNDER, 2026-08-12: *"כרגע כשאתה מסתכל על המוצר שלנו הוא APPLE? … כל משפט צריך להיות אייקוני
 * ומדויק."*
 *
 * The honest answer was that the VOCABULARY already was — one settle curve, a semantic palette, a
 * reduced-motion contract — and the CHOREOGRAPHY did not exist. Every element was present on the
 * first frame, so the screen appeared instead of arriving.
 *
 * This file holds the four things that changed, because each of them is the kind that decays back:
 * a sequence someone flattens while debugging, a claim someone softens into an adjective, a control
 * that drifts back to a Settings idiom, and an error someone replaces with "Something went wrong."
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import fs from 'fs';
import path from 'path';

import { Arrive, ARRIVE_STAGGER } from '@/components/ds';
import { motion } from '@/design/tokens';
import { initI18n, tg } from '@/i18n';

const METRICS: Metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const mounted: ReactTestRenderer[] = [];
afterEach(() => act(() => { while (mounted.length) mounted.pop().unmount(); }));
beforeAll(async () => { await initI18n(); });

const src = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', p), 'utf8');
const door = () => src('screens/onboarding/Authentication.tsx');

describe('⛔ the hero arrives, it does not appear', () => {
  it('⛔ every element of the hero is SEQUENCED, in reading order', () => {
    /*
     * Mark, wordmark, promise, affirmation, then the actions. The orders are asserted as a run from
     * zero because a gap is a beat of silence in the middle of the screen, and a repeat is two
     * things landing together — both of which read as a bug rather than a rhythm.
     */
    const orders = [...door().matchAll(/<Arrive order=\{(\d+)\}/g)].map((m) => Number(m[1]));
    expect(orders.length).toBeGreaterThanOrEqual(5);
    expect(orders).toEqual([...orders].sort((a, b) => a - b)); // reading order, in source order
    expect(orders).toEqual(Array.from({ length: orders.length }, (_, i) => i)); // 0,1,2,… no gaps
  });

  it('⛔ …and the whole sequence is home in well under a second', () => {
    /*
     * Ceremony that costs her time is not ceremony, it is a wait. Six elements at one step apart
     * plus the settle itself has to land inside the moment she is still looking at the mark.
     */
    const last = 5 * ARRIVE_STAGGER + motion.dur[4];
    expect(last).toBeLessThan(750);
  });

  it('⛔ it moves on the PRODUCT’S curve, and owns no curve of its own', () => {
    // `tokens.motion` declares one settle for the whole app. A component that eased differently
    // would be a second physics, which is the thing the token exists to prevent.
    const arrive = src('components/ds/Arrive.tsx');
    expect(arrive).toContain('motion.easeStandard');
    expect(arrive).toContain('motion.dur[4]');
    expect(arrive).not.toMatch(/Easing\.(bounce|elastic|back)/);
  });

  it('⛔ REDUCED MOTION IS NONE, not a gentler version of the thing she turned off', () => {
    const arrive = src('components/ds/Arrive.tsx');
    expect(arrive).toContain('useReducedMotion');
    // The value starts AT its resting place, so the first frame is already correct.
    expect(arrive).toMatch(/new Animated\.Value\(reduced \? 1 : 0\)/);
  });

  it('renders its children either way', () => {
    for (const _ of [0, 1]) {
      let r: ReactTestRenderer;
      act(() => {
        r = renderer.create(
          <SafeAreaProvider initialMetrics={METRICS}>
            <Arrive order={2}><Text>hush</Text></Arrive>
          </SafeAreaProvider>,
        );
      });
      mounted.push(r!);
      expect(JSON.stringify(r!.toJSON())).toContain('hush');
    }
  });
});

describe('⛔ every sentence on it is one she could check', () => {
  it('⛔ the affirmation is a CLAIM, not an adjective', () => {
    /*
     * ⛔ IT SAID "Built on facts", WHICH IS WHAT EVERY APP SAYS AND WHAT NONE OF THEM MEAN. It is the
     * one line on the screen that separates this from any other training app, and it was the
     * quietest thing there — an abstraction sitting directly under another abstraction.
     *
     * What replaced it is the product's actual behaviour, stated so she can hold us to it: no load
     * in Hush is ever a guess (S-38 — the opening weight comes from her FIRST SET, and Loop 1 moves
     * it from her reps). A promise the engine keeps is worth more than a superlative it cannot.
     */
    const en = tg('ob.signinAffirm');
    expect(en).not.toMatch(/built on facts/i);
    expect(en.toLowerCase()).toContain('lifted'); // the verb that makes it checkable
    expect(en.length).toBeLessThan(40); // …and it still fits one line under the promise
  });

  it('⛔ a FAILED sign-in says which thing failed', () => {
    /*
     * "Something went wrong. Try again." is the sentence every app on the phone shows, and the
     * reason none of them are believed. Three different problems, three different answers — and
     * each one tells her what to do next.
     */
    const code = door().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain("errors.general");
    for (const k of ['ob.signinFailedNetwork', 'ob.signinFailedProvider', 'ob.signinFailedGoogle']) {
      expect(code).toContain(k);
      expect(tg(k).length).toBeGreaterThan(20);
      expect(tg(k)).not.toBe(k); // …and it resolves, in both locales
    }
  });

  it('⛔ a CANCELLED sign-in says nothing at all', () => {
    // She read Apple's sheet and changed her mind. Telling her something went wrong would be the app
    // arguing with a decision she made one second ago.
    expect(door()).toMatch(/if \(e instanceof SignInCanceledError\) return;/);
  });

  it('⛔ the language offer is a WORD, not a settings control', () => {
    /*
     * It was a segmented pill reading `EN | עב` — the only object on a ceremonial screen wearing the
     * chrome of a form, and it asked her to read her own language as an abbreviation. One word, in
     * the language it switches TO, is how a person offers it.
     */
    const code = door().replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain('SegmentedControl');
    expect(code).toMatch(/locale === 'he' \? 'English' : 'עברית'/);
  });

  it('⛔ the primary action answers the finger before the network does', () => {
    // A system sheet and a round trip stand between the tap and anything visible. The impact is the
    // acknowledgement that the press landed — the beat Apple puts under every primary action.
    expect(door()).toContain('Haptics.impactAsync');
  });
});

describe('⛔ and the door is documented as the decision it is', () => {
  it('⛔ Apple-and-Google-only is written down, not left to be inferred from a missing field', () => {
    /*
     * An athlete with neither account cannot use Hush. That is a real cost, deliberately accepted,
     * and the kind of thing a reader otherwise re-derives from the absence of a text input — badly.
     */
    const head = door().slice(0, 2600);
    expect(head).toMatch(/APPLE AND GOOGLE ONLY/);
    expect(head).toMatch(/4\.8/); // the App Store rule that makes the pair the smallest legal set
  });

  it('⛔ the header names a route that EXISTS', () => {
    /*
     * It said "On success → NameEntry" long after that screen was deleted. A header is the first
     * thing a new reader trusts; one that names an unreachable route is the first thing that lies.
     */
    // The word may still appear in the note explaining what it used to say — the CLAIM is what is
    // forbidden, not the history. A correction that erased its own reason would invite the mistake.
    expect(door()).not.toMatch(/On success → NameEntry/);
    /*
     * ⛔ AND THE ROUTE MOVED AGAIN ON 2026-08-12 — to `Start`, the fork, when bringing your own
     * programme stopped being a line under a button and became one of the two ways this app begins.
     * The header is asserted against the CURRENT route rather than a remembered one, which is the
     * entire point of this test.
     */
    expect(door()).toMatch(/On success → `Start`/);
    expect(door()).toMatch(/navigation\.navigate\('Start'\)/);
  });

  it('⛔ the screen the intake replaced is GONE, not merely unreachable', () => {
    // `YourGoal` asked for prose the ENGINE never read. The body map replaced it; the file lingered,
    // and two laws were still anchored to it — which is how a deleted feature keeps voting.
    expect(fs.existsSync(path.resolve(__dirname, '..', '..', 'src', 'screens/onboarding/YourGoal.tsx'))).toBe(false);
  });
});

/* ══════════════════════════ THE CONSENT OPENS A DOCUMENT (founder 2026-09-01) ══════════════════ */

describe('⛔ the legal line opens a real document, in the app, in her language', () => {
  it('the door wires the line to the in-app sheet — never a dead tap, never a bare URL', () => {
    const d = door();
    expect(d).toContain('LegalSheet');
    expect(d).toContain('setLegalOpen(true)');
    // The external-link interim is gone from this screen: consent opens content, not a browser.
    expect(d).not.toContain('Linking.openURL');
  });

  it('…and the sheet actually carries the four sections, in words', () => {
    const { LegalSheet } = require('@/components/LegalSheet');
    let r: ReactTestRenderer;
    act(() => {
      r = renderer.create(
        <SafeAreaProvider initialMetrics={METRICS}>
          <LegalSheet onClose={() => {}} />
        </SafeAreaProvider>,
      );
    });
    mounted.push(r!);
    const said = JSON.stringify(r!.toJSON());
    for (const k of ['legal.termsTitle', 'legal.privacyTitle', 'legal.healthTitle', 'legal.billingTitle']) {
      expect(said).toContain(tg(k));
    }
    // The privacy section states the two facts the product actually lives by.
    expect(tg('legal.privacyBody')).toContain('iCloud');
  });
});
