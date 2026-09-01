// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';
import { coachChangedCase } from '@/domain/coachWeek';
import type { CoachPlan } from '@/domain/coachPlan';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A LOAD THAT MOVED CAN ALWAYS BE ASKED ABOUT.
 *
 * ⛔ FOUND IN THE HERMETIC SCAN, 2026-08-02. `Home` built a why-case only for a lift the coach had
 * also written a NOTE about:
 *
 *     const say = saidFor.get(ex);
 *     if (!say) return null;
 *
 * So a load she could see had changed — drawn in moss, which is the app SHOUTING that something
 * happened — opened nothing when she tapped it. No sheet, no sentence, no acknowledgement. The one
 * question the sheet exists to answer was unanswerable for exactly the lifts the coach had been
 * quiet about.
 *
 * And it is not a rare state: measured across three live programmes, the coach wrote notes for some
 * lifts and none for others in the same week.
 *
 * ── THE DISTINCTION THAT FIXES IT ───────────────────────────────────────────────────────────────
 * The verdict and both loads are MEASURED — they come from comparing the coach's previous programme
 * with its current one, and they are true whether or not it also wrote prose. Only the closing line
 * is the coach's own writing. So only the closing line is absent when there is none.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const plan = (load: number): CoachPlan => ({
  v: 2,
  sessions: [
    {
      name: 'A',
      blocks: [{ rounds: 3, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 10], load }] }],
    },
  ],
});

describe('a lift the coach moved', () => {
  it('⚠️ opens its case even when the coach wrote no sentence', () => {
    const c = coachChangedCase('bb_bench_press', plan(42.5), plan(40), undefined, 'kg');
    expect(c).not.toBeNull();
    expect(c).toMatchObject({ verdict: 'up', from: '40', to: '42.5', delta: '+2.5' });
    // …and the sheet is told there is no sentence, rather than being handed a blank one to draw.
    expect(c!.line.text).toBe('');
  });

  it('carries the coach\'s sentence when there is one', () => {
    const c = coachChangedCase('bb_bench_press', plan(42.5), plan(40), 'שתים עשרה ב-40 זה תקרת הטווח.', 'kg');
    expect(c!.line.text).toBe('שתים עשרה ב-40 זה תקרת הטווח.');
  });

  it('a hold is a case too — the sheet says so rather than staying shut', () => {
    // The founder's own list puts holding beside raising and lowering. Nothing moved, and that is
    // the answer she is owed.
    const c = coachChangedCase('bb_bench_press', plan(40), plan(40), undefined, 'kg');
    expect(c).toMatchObject({ verdict: 'hold', from: null, delta: null });
  });

  it('still refuses a lift that is not in the current programme', () => {
    // The one honest null: there is nothing to explain about a lift she is not being asked to do.
    expect(coachChangedCase('bb_back_squat', plan(40), plan(40), 'x', 'kg')).toBeNull();
  });

  it('⚠️ TODAY does not skip a lift because the coach was quiet about it', () => {
    /*
     * ⛔ THIS IS THE ASSERTION THAT ACTUALLY COVERS THE BUG, and my first draft of this file did
     * not have it.
     *
     * I wrote four tests against `coachChangedCase` and watched them stay GREEN when I reverted the
     * fix — because the fix I reverted was a TYPE (`string` vs `string | undefined`), which changes
     * nothing at runtime. The defect was never in the domain function. It was one line in the
     * screen: `if (!say) return null`.
     *
     * Testing the domain and calling the screen covered is the exact habit that produced four of
     * today's defects. A law that cannot fail on its own motivating bug is a comment with a test
     * runner attached — so this one reads the screen.
     */
    const home = read('src/screens/home/Home.tsx');
    expect(home).not.toContain('if (!say) return null;');
    // …and it passes whatever it has, present or not.
    expect(home).toMatch(/coachChangedCase\(ex, coachPlan, before, saidFor\.get\(ex\)/);
  });

  it('the screen does not draw an empty sentence as a failed one', () => {
    // An empty string in the slot renders an italic block with its own padding, which reads as a
    // sentence that did not load. The sheet skips the element entirely.
    const src = read('src/components/WhyChangedSheet.tsx');
    expect(src).toMatch(/\{props\.line \? <Text style=\{styles\.line\}>\{props\.line\}<\/Text> : null\}/);
  });
});

describe('⛔ the answer carries the verb (founder, device QA 2026-08-23)', () => {
  /*
   * *"ובלחיצה על תרגיל למה זה מציג למה זה נבחר?"* — he tapped a lift to MANAGE it and the why sheet
   * offered only understanding. His 2026-08-05 ruling (the row opens the WHY) stands; the sheet's
   * foot now ends with the one thing she can do about it — the swap door — wherever the surface
   * offers management at all (the pre-workout card), and never where it only reports (the Mirror).
   */
  const fs2 = require('fs');
  const path2 = require('path');
  const src = (rel: string) => fs2.readFileSync(path2.join(__dirname, '..', '..', rel), 'utf8');

  it('both why sheets can carry the swap door, dressed as a ghost under the act', () => {
    for (const rel of ['src/components/WhyChangedSheet.tsx', 'src/components/WhyHereSheet.tsx']) {
      const sheet = src(rel);
      expect(sheet).toContain('onSwap?: () => void;');
      expect(sheet).toContain("props.onSwap ? (");
      expect(sheet).toContain("label={t('swap.title')} onPress={props.onSwap}");
    }
  });

  it('…and the pre-workout card hands the door through — gated exactly like the row’s own swap', () => {
    const host = src('src/screens/plan/PreWorkoutScreen.tsx');
    // Both sheet hosts pass onSwap, and both are gated on the day not being done.
    const doors = host.split('onSwap: () =>').length - 1;
    expect(doors).toBe(2);
    expect(host).toContain('setSwapFor(id)');
  });
});
