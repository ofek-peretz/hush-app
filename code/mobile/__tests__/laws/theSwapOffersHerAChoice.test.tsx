/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * SHE TAPS SWAP AND IS SHOWN HER OPTIONS — AND EVERY ONE OF THEM IS LABELLED HONESTLY.
 *
 * ⛔ FOUNDER, 2026-08-16: *"שלחיצת swap לא ישר מעביר לתרגיל דומה אלא מציג 3 אופציות לבחירה"*, with
 * the bar attached in the same message: *"רק תוודא שאכן החלופות הגיוניות ושזה לא יציע סתם
 * אופציות."* — make sure the alternatives are genuinely sensible and it does not just offer options.
 *
 * That second sentence is the whole law. A menu is easy; a menu of three is easy. A menu that
 * refuses to invent a third row when the catalogue has no third answer is the thing that had to be
 * built, and it is the thing that can silently rot back into padding.
 *
 * ── WHAT IS ASSERTED, AND WHY EACH ONE ──────────────────────────────────────────────────────────
 *   · The sheet draws exactly what `swapChoices` returned — no slice, no pad, no re-order. If the
 *     screen and the pool can disagree, the pool's measured restraint means nothing.
 *   · A row that is NOT the same movement says so. This is what buys the right to show a third
 *     option at all: `swapPool` measures that 49 of 111 lifts have no third true synonym, so an
 *     unlabelled third row would be a different movement presented as a peer.
 *   · The body line is true of EVERY row. It used to say "the same movement, a different station",
 *     which a "trains it a different way" row flatly contradicts; same muscle is what `admissible`
 *     actually guarantees, so that is what it claims.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { SwapSheet } from '@/components/SwapSheet';
import { swapChoices, SWAP_CHOICES } from '@/domain/swapPool';
import { EXERCISES, isSwapOnly } from '@/data/exercises';
import { initI18n, tg } from '@/i18n';

const METRICS: Metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

beforeAll(async () => {
  await initI18n();
});

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});

function draw(currentId: string, onPick = () => {}): ReactTestRenderer {
  const choices = swapChoices(currentId, { sessionExerciseIds: [] });
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <SwapSheet currentName="Current Lift" choices={choices} onPick={onPick} onClose={() => {}} />
      </SafeAreaProvider>,
    );
  });
  mounted.push(r);
  return r;
}

/** Every string the sheet actually rendered. */
const texts = (r: ReactTestRenderer): string[] =>
  r.root.findAll((n) => typeof n.type === 'string' && n.props.children != null)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)));

/** The pressable rows — one per option. */
const rows = (r: ReactTestRenderer, currentId: string) => {
  const names = new Set(swapChoices(currentId, { sessionExerciseIds: [] }).map((c) => c.exercise.name));
  return r.root.findAll((n) => typeof n.props.onPress === 'function' && names.has(n.props.accessibilityLabel));
};

describe('⛔ the sheet shows what the pool decided — nothing added, nothing dropped', () => {
  it('one row per choice, in the pool’s order', () => {
    const id = 'bb_bench_press';
    const choices = swapChoices(id, { sessionExerciseIds: [] });
    const r = draw(id);
    expect(rows(r, id).map((n) => n.props.accessibilityLabel)).toEqual(choices.map((c) => c.exercise.name));
  });

  it('⛔ never more than three, on any lift in the catalogue', () => {
    for (const ex of EXERCISES) {
      if (isSwapOnly(ex.id)) continue;
      expect(swapChoices(ex.id, { sessionExerciseIds: [] }).length).toBeLessThanOrEqual(SWAP_CHOICES);
    }
  });

  it('⛔ and it is NOT padded to three — a lift with two synonyms draws two rows', () => {
    // Asked of the catalogue rather than asserted about a favourite lift: if every lift really did
    // have three synonyms this test would be vacuous, and it would say so by failing here.
    const short = EXERCISES.filter(
      (e) => !isSwapOnly(e.id) && swapChoices(e.id, { sessionExerciseIds: [] }).length < SWAP_CHOICES,
    );
    expect(short.length).toBeGreaterThan(0);
    const id = short[0].id;
    expect(rows(draw(id), id).length).toBe(swapChoices(id, { sessionExerciseIds: [] }).length);
  });
});

describe('⛔ every row says what kind of answer it is', () => {
  it('a true synonym is marked as the same movement', () => {
    const id = 'bb_bench_press';
    const choices = swapChoices(id, { sessionExerciseIds: [] });
    expect(choices.some((c) => c.sameMovement)).toBe(true); // or the case below proves nothing
    const drawn = texts(draw(id)).join(' | ');
    expect(drawn).toContain(tg('swap.sameMovement', { equipment: tg('equipment.dumbbell') }).split('·')[1].trim());
  });

  it('⛔ a row that is NOT the same movement says so, in its own words', () => {
    const withOther = EXERCISES.find(
      (e) => !isSwapOnly(e.id) && swapChoices(e.id, { sessionExerciseIds: [] }).some((c) => !c.sameMovement),
    );
    expect(withOther).toBeDefined(); // the honest-label path must be reachable, or it is dead code
    expect(texts(draw(withOther.id)).join(' | ')).toContain(tg('swap.differentWay'));
  });
});

describe('⛔ the sentence at the top is true of every row under it', () => {
  it('claims the same MUSCLE — which is the gate — and not the same movement', () => {
    const body = tg('swap.body');
    // The old line promised "the same movement", which a different-movement row contradicts.
    expect(texts(draw('bb_bench_press'))).toContain(body);
    for (const ex of EXERCISES) {
      if (isSwapOnly(ex.id)) continue;
      for (const c of swapChoices(ex.id, { sessionExerciseIds: [] })) {
        expect(c.exercise.muscle).toBe(ex.muscle); // the claim, verified across the catalogue
      }
    }
  });
});

describe('⛔ her own standing choices are IN the menu, whatever pattern they carry', () => {
  /*
   * S-70's promise is that a wrong adoption is cheap to reverse: the blueprint ORIGINAL is offered
   * first ever after, so swapping back twice restores it. The first build of `swapChoices`
   * re-partitioned the ranked list by exact `pattern` — and any pinned lift whose pattern differed
   * fell out of the menu entirely, so on the phone it was not offered at all. `admissible` gates on
   * `patternFamily`, which is far wider; a cross-pattern standing choice is legal, just not a synonym.
   */
  it('⛔ a standing SUBSTITUTE of a different pattern is still offered', () => {
    const all = EXERCISES.filter((e) => !isSwapOnly(e.id));
    const current = all.find((e) => !e.bodyweight)!;
    const cross = all.find(
      (e) => e.muscle === current.muscle && e.capability === current.capability
        && e.pattern !== current.pattern && e.id !== current.id,
    );
    if (!cross) return; // the catalogue offers no cross-pattern peer for this lift — nothing to prove
    const menu = swapChoices(current.id, {
      sessionExerciseIds: [],
      prefs: { substitutes: { [current.id]: cross.id } },
    });
    expect(menu.map((c) => c.exercise.id)).toContain(cross.id);
    // …and it is LABELLED for what it is, not dressed as a synonym.
    expect(menu.find((c) => c.exercise.id === cross.id)!.sameMovement).toBe(false);
  });

  it('⚠️ and it LEADS, because it is hers', () => {
    const all = EXERCISES.filter((e) => !isSwapOnly(e.id));
    const current = all.find((e) => !e.bodyweight)!;
    const peer = swapChoices(current.id, { sessionExerciseIds: [] })[1];
    if (!peer) return;
    const menu = swapChoices(current.id, {
      sessionExerciseIds: [],
      prefs: { backups: { [current.id]: peer.exercise.id } },
    });
    expect(menu[0].exercise.id).toBe(peer.exercise.id);
  });
});

describe('⛔ picking a row is the whole gesture', () => {
  it('hands the chosen exercise id back, once', () => {
    const picked: string[] = [];
    const id = 'bb_bench_press';
    const r = draw(id, (exId) => picked.push(exId));
    const first = rows(r, id)[0];
    act(() => first.props.onPress());
    expect(picked).toEqual([swapChoices(id, { sessionExerciseIds: [] })[0].exercise.id]);
  });
});
