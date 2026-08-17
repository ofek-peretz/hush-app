/**
 * THE HEBREW BATCH — founder build 36, B.1 · B.2 · B.9 · B.11 (and B.5's edge case).
 *
 * Four copy findings and two structural ones, and the copy half all comes down to a single habit:
 * a Hebrew line written once, in the masculine, and never given its other form.
 *
 *   B.1   "רק להתאמן. השאר עליי." — "השאר" is read first as the imperative "stay", not as the
 *         noun "the rest". "כל השאר" can only be the noun.
 *   B.2   the sentence under the Apple Health toggle addressed a man, twice; and the three
 *         measurements Health hands over were crammed into one mono legend as abbreviations.
 *   B.9   "חבר מאז" to every woman; "חשבון" reading as the last word of the health paragraph;
 *         the plan-share row still sitting in the YOU tab; and "טווחי החזרות נוסעים", which is a
 *         literal rendering of "travel" and is not a sentence in Hebrew.
 *   B.11  the share screen's own heading.
 *   B.5   the one act fell below the fold on a long plan.
 */
// @ts-nocheck

// 

import React from 'react';
import i18next from 'i18next';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { HomeView, type HomeViewProps } from '@/screens/home/HomeView';
import { initI18n, tg } from '@/i18n';
import { setGender, resetGender } from '@/i18n/gender';
import { bidi } from '@/i18n/bidi';
import he from '@/i18n/locales/he.json';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

beforeAll(async () => {
  await initI18n();
  await i18next.changeLanguage('he');
});
afterAll(async () => {
  await i18next.changeLanguage('en');
});
afterEach(() => resetGender());

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

/* ═════════════════════ the copy, read straight off the locale ═════════════════════ */

describe('the Hebrew reads as Hebrew', () => {
  /**
   * B.1 · THE FRONT DOOR. Unvowelled, "השאר" is the imperative "stay" before it is the noun "the
   * rest" — so the first sentence in the product read as an instruction to remain. "כל השאר" can
   * only be the noun. It stays genderless, as the whole sign-in screen must: Hush has not been
   * told who it is speaking to yet (`the front door has no gender to speak in`).
   */
  it('B.1 — the tagline cannot be read as "stay"', () => {
    expect(he.ob.signinTagline).toContain('כל השאר עליי');
    expect(he.ob.signinTagline).not.toMatch(/\.\nהשאר/);
    // and no feminine variant was invented for a screen that must not have one
    expect(Object.keys(he.ob)).not.toContain('signinTagline_female');
  });

  it('B.2 — the sentence under the toggle speaks to the woman reading it', () => {
    setGender('male');
    expect(tg('ob.healthHelper')).toContain('שאתה מתעד');
    setGender('female');
    const her = tg('ob.healthHelper');
    expect(her).toContain('שאת מתעדת');
    expect(her).toContain('שאת מרימה');
    expect(her).not.toContain('אתה');
  });

  it('B.9 — a woman has been a member since, too', () => {
    setGender('male');
    expect(tg('profile.memberSince')).toBe('חבר מאז');
    setGender('female');
    expect(tg('profile.memberSince')).toBe('חברה מאז');
  });

  /**
   * B.9 · "טווחי החזרות נוסעים" is "the rep ranges are travelling" — a word-for-word carry of the
   * English "travel", which in Hebrew says nothing. The sentence has to state the actual fact: the
   * bands go with the plan, the weights do not leave her.
   */
  /**
   * ⚠️ AND A NOTE ON THE FIRST DRAFT OF THIS LINE. It read "טווחי החזרות נשלחים", and
   * `gender.test.ts` refused it: the law scans for feminine markers as SUBSTRINGS, and "שלחי" —
   * the feminine imperative "send" — lives inside "נשלחים". The linter was wrong about this word
   * and right about the class, so the line was rephrased rather than the law loosened. A base key
   * that merely LOOKS feminine is a base key nobody will trust.
   */
  it('B.9 — the share screen says what actually happens to her numbers', () => {
    expect(he.planShare.structureTail).not.toContain('נוסעים');
    expect(he.planShare.structureTail).toContain('כלולים');
    expect(he.planShare.structureTail).toContain('נשארים אצלך');
  });

  it('B.11 — the share screen is headed in the athlete’s own person', () => {
    setGender('female');
    expect(tg('planShare.title')).toContain('שתפי את תוכנית האימון שלך');
    setGender('male');
    expect(tg('planShare.title')).toContain('שתף את תוכנית האימון שלך');
  });

  /**
   * B.2's second half. These are not a marketing list — they are exactly the three HealthKit types
   * `healthKitGate` asks read access to. Each is genderless, because each states a FACT about a
   * measurement rather than addressing anybody.
   */
  it('B.2 — the three measurements each have their own line, in both languages', () => {
    for (const k of ['healthHr', 'healthHrSub', 'healthKcal', 'healthKcalSub', 'healthKm', 'healthKmSub']) {
      expect(tg(`ob.${k}`)).toBeTruthy();
      expect(tg(`ob.${k}`)).not.toBe(`ob.${k}`); // i18next echoes the key when it is missing
    }
    // …and the card's fine print is its STATE now, not three abbreviations
    expect(tg('ob.healthCardSub')).not.toContain('KCAL');
    expect(tg('ob.healthCardOn')).not.toContain('KCAL');
  });
});

/* ═════════════════════ B.5 — the act, on a long plan ═════════════════════ */

const LIFT = (i: number) => ({
  exerciseId: `x${i}`,
  name: `Lift ${i}`,
  load: 40 + i,
  sets: 4,
  band: [8, 10] as [number, number],
});

function props(over: Partial<HomeViewProps> = {}): HomeViewProps {
  return {
    resting: false,
    dayName: 'Upper A',
    dayId: 'd0',
    trainedThisWeek: 1,
    startError: false,
    weekNumber: 3,
    plan: [1, 2, 3, 4, 5, 6, 7, 8].map(LIFT),
    planMinutes: 62,
    units: 'kg',
    onForm: () => {},
    workouts: [{ id: 'd0', name: 'Upper A', muscles: '' }],
    brief: null,
    briefCount: null,
    briefUnseen: false,
    trialLeft: 9,
    onStart: () => {},
    onChooseWorkout: () => {},
    onWeeklyUpdate: () => {},
    ...over,
  };
}

/**
 * "With many exercises the Begin button — and the free-workouts line — fall below the fold; it
 * scrolls, but the athlete may simply not find Start."
 *
 * The act used to sit INSIDE the scroller, held down by `marginTop: 'auto'` — the foot of the
 * CONTENT, which is the foot of the SCREEN only while the content is short. The law is where it
 * lives, so that is what this reads: the one act is a sibling of the scroller, never a child of it.
 */
describe('the one act is never below the fold', () => {
  function ctaIsOutsideTheScroller(r: ReactTestRenderer): boolean {
    // A ScrollView is the only thing in this tree that takes `contentContainerStyle` — a more
    // durable handle than a displayName, which RN is free to change.
    const scrollers = r.root.findAll((n) => n.props?.contentContainerStyle != null);
    // The exact Begin label — the CHIP is also labelled "Upper A" and it lives inside the scroller
    // by design, so a `.includes` here would find the chip and call the law broken.
    const label = tg('home.begin', { name: bidi('Upper A') });
    const begin = r.root.findAll((n) => n.props?.accessibilityLabel === label || n.props?.label === label);
    const inScroller = begin.some((b) => scrollers.some((s) => s.findAll((c) => c === b).length > 0));
    return begin.length > 0 && !inScroller;
  }

  it('an eight-lift day still has Begin outside the scroller', () => {
    expect(ctaIsOutsideTheScroller(mount(<HomeView {...props()} />))).toBe(true);
  });

  it('…and so does a two-lift day — one composition, not a special case', () => {
    expect(ctaIsOutsideTheScroller(mount(<HomeView {...props({ plan: [1, 2].map(LIFT) })} />))).toBe(true);
  });

  it('the trial line rides with it, so it cannot be lost either', () => {
    const r = mount(<HomeView {...props()} />);
    const said: string[] = [];
    const walk = (n: unknown): void => {
      if (n == null) return;
      if (typeof n === 'string') return void said.push(n);
      if (Array.isArray(n)) return void n.forEach(walk);
      const j = n as { children?: unknown[] };
      j.children?.forEach(walk);
    };
    walk(r.toJSON());
    expect(said.join(' ')).toContain(tg('home.trialLeft', { count: 9 }).toUpperCase());
  });

  it('Recovery has no act, so nothing is pinned there', () => {
    const r = mount(<HomeView {...props({ resting: true, dayName: null, plan: null })} />);
    const label = tg('home.begin', { name: bidi('Upper A') });
    expect(r.root.findAll((n) => n.props?.accessibilityLabel === label || n.props?.label === label)).toHaveLength(0);
  });
});
