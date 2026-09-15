/**
 * ════ EVERY SHELF BUILDS (founder mandate 2026-08-26) ════
 *
 * A template is a PROMISE printed on a card: pick this and a working week opens. Every way that
 * promise can quietly rot is pinned here, because template content is hand-authored data and the
 * compiler checks none of it:
 *
 *   · an exercise id that left the catalogue → the day would build with a hole;
 *   · a set count outside the builder's own [1..8] → the algebra would clamp or refuse;
 *   · a day that prices outside a real session (25–70 min) → the card's own clock would argue
 *     with the advice strip one tap later;
 *   · a name or tag key missing in either locale → a card that reads as its key;
 *   · a duplicate lift within a day → the add-sheet's own "כבר ביום הזה" rule, violated by us.
 *
 * The materializer runs THROUGH the builder algebra, so passing here means the real builder
 * accepts every shelf verbatim — priced, advised, sealable.
 */
// @ts-nocheck

import { PLAN_TEMPLATES, materializeTemplate } from '@/domain/planTemplates';
import { builderMinutes, sealAuthored, BUILDER_SETS_MAX, BUILDER_SETS_MIN } from '@/domain/planBuilder';
import { exerciseById } from '@/data/exercises';
import en from '@/i18n/locales/en.json';
import he from '@/i18n/locales/he.json';

describe('every shelf builds', () => {
  for (const tpl of PLAN_TEMPLATES) {
    describe(tpl.id, () => {
      it('every lift is the catalogue\'s own, within the builder\'s set bounds, no day repeats one', () => {
        for (const day of tpl.days) {
          const seen = new Set();
          for (const l of day.lifts) {
            expect(exerciseById(l.ex)).toBeTruthy();
            expect(l.sets).toBeGreaterThanOrEqual(BUILDER_SETS_MIN);
            expect(l.sets).toBeLessThanOrEqual(BUILDER_SETS_MAX);
            expect(seen.has(l.ex)).toBe(false);
            seen.add(l.ex);
          }
        }
      });

      it('materializes into a sealable draft whose every day is a real session (25-70 min)', () => {
        const draft = materializeTemplate(tpl, (k) => k);
        expect(draft.days).toHaveLength(tpl.days.length);
        for (const day of draft.days) {
          const min = builderMinutes(day);
          expect(min).toBeGreaterThanOrEqual(25);
          expect(min).toBeLessThanOrEqual(70);
        }
        expect(sealAuthored(draft)).not.toBeNull();
      });

      it('speaks in both locales — name, tag, and every day name', () => {
        for (const loc of [en, he]) {
          const tpls = loc.builder.templates;
          expect(typeof tpls[tpl.id]?.name).toBe('string');
          expect(typeof tpls[tpl.id]?.tag).toBe('string');
          for (const day of tpl.days) expect(typeof tpls.dayNames[day.nameKey]).toBe('string');
        }
      });
    });
  }

  it('the shelf wall is curated, not a dump — a handful, each with a reason', () => {
    expect(PLAN_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    expect(PLAN_TEMPLATES.length).toBeLessThanOrEqual(12);
    expect(new Set(PLAN_TEMPLATES.map((t) => t.id)).size).toBe(PLAN_TEMPLATES.length);
  });

  /*
   * ⛔ THE SHELF COVERS THE WEEKS PEOPLE ACTUALLY TRAIN (founder 2026-08-29): *"למה יש אפשרות רק
   * של 3 ו 4 אימונים ולא של 3-5 אימונים?"*
   *
   * The gap was invisible from inside the file — every shelf was individually good, and nobody had
   * ever asked the collection a question. This is that question, and it is asked of the ARRAY:
   * a curation that answers "I train five times a week" with silence is incomplete however well
   * each of its entries is built.
   *
   * ⚠️ 3–5 and not 2–6. Two days is `full_body`'s argument territory and six is a specialist's
   * week; three, four and five are what a gym membership is bought for.
   */
  it('a person who trains three, four or five times a week finds a shelf of her own', () => {
    const dayCounts = new Set(PLAN_TEMPLATES.map((t) => t.days.length));
    for (const n of [3, 4, 5]) {
      expect(dayCounts.has(n)).toBe(true);
    }
  });

  it('no shelf outruns what the app itself builds (2–6 days)', () => {
    for (const tpl of PLAN_TEMPLATES) {
      expect(tpl.days.length).toBeGreaterThanOrEqual(2);
      expect(tpl.days.length).toBeLessThanOrEqual(6);
    }
  });
});
