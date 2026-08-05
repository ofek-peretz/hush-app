import fs from 'fs';
import path from 'path';
import { PHONE_FLOOR } from './typeHasAFloor.test';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const cardio = () => read('src/screens/cardio/Cardio.tsx');
const done = () => {
  const src = cardio();
  const at = src.indexOf('export function CardioComplete');
  return src.slice(at, src.indexOf('\n/* ---- small instrument readouts', at));
};

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A RUN CLOSES ON A POSTER TOO — and its title can never argue with its own numbers.
 *
 * ⛔ FOUNDER, 2026-08-04, on the drawn proposal, with three corrections and one question:
 *
 *   > *"At the top it says Easy 6k but the example covered 5.2 km. And the pace per kilometre
 *   > appears in very small type, which is something I forbid. And is this map any good at all? It
 *   > looks like a drawing from one point to another — it isn't clear it's a route of anything."*
 *
 * All three were mine. The name came from my mockup and never from the code; the pace was eleven
 * points wedged between two other things; and the map he was judging was a squiggle I had drawn by
 * hand rather than `RouteTrace`, which projects the real fixes.
 *
 * He then chose: **no route on the poster.** A polyline with no streets under it is legible to
 * exactly one person — the woman who ran it, who already knows — and a poster is read by strangers
 * in two seconds. The splits carry the shape of the effort instead, in the dimension that actually
 * describes a run.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

describe('⛔ the title can never disagree with the figure under it', () => {
  it('the run is named by its MOVEMENT, never by a prescribed distance', () => {
    /*
     * A name with a number in it disagrees with the distance below it exactly when she stopped
     * short — which is the moment a poster must not be caught arguing with her.
     */
    expect(done()).toContain("t(gaitFromPace(avgPace) === 'walk' ? 'cardio.walk' : 'cardio.run')");
    expect(done()).not.toMatch(/targetMetres|runName/);
  });

  it('and both names exist in both languages', () => {
    for (const loc of ['en', 'he']) {
      const copy = JSON.parse(read(`src/i18n/locales/${loc}.json`)) as { cardio: Record<string, string> };
      expect(copy.cardio.run).toBeTruthy();
      expect(copy.cardio.walk).toBeTruthy();
    }
  });

  it('⚠️ and the sentence it replaced is DELETED from both locales, not merely unused', () => {
    // Dead copy is what comes back into a screen a year later because someone finds the key.
    for (const loc of ['en', 'he']) {
      const copy = JSON.parse(read(`src/i18n/locales/${loc}.json`)) as { cardio: Record<string, string> };
      expect(copy.cardio.savedTitle).toBeUndefined();
      expect(copy.cardio.savedLegend).toBeUndefined();
    }
  });
});

describe('⛔ nothing on it is small', () => {
  it('pace is a HERO line, not a caption', () => {
    // 38 points, under the distance, in the accent. It was 11 and between two other things.
    expect(cardio()).toMatch(/posterPaceNum:[\s\S]{0,240}fontSize: 38/);
  });

  it('⚠️ …and it is absent rather than zero on a run too short to have one', () => {
    // "0:00 /km" is a fabrication, not a measurement.
    expect(done()).toContain('{avgPace > 0 ? (');
  });

  /**
   * ⚠️ THIS PINNED 11.5 AND THE FLOOR OVERTOOK IT (2026-08-05). The law's point was that a date on
   * a poster is not fine print — it was written when the alternative was eight points. `typeHasAFloor`
   * now makes 13 the smallest thing the phone may draw at all, so pinning a literal below the floor
   * would be one law forbidding what another requires. It asserts the FLOOR, which is the claim that
   * was always being made.
   */
  it('the date is set at the type floor, not at the eight points a date usually gets', () => {
    const m = cardio().match(/posterDate:[\s\S]{0,200}fontSize: ([0-9.]+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(PHONE_FLOOR);
  });
});

describe('the route, and the ruling behind it', () => {
  it('⛔ no route is DRAWN on the poster — and it is still SAVED', () => {
    /*
     * ⚠️ THE ELEMENT, NOT THE WORD. `simplifyRoute` comes from the same module and thins the trace
     * before it is written to the record — asserting the identifier is absent would forbid keeping
     * the route at all, which is the opposite of the decision: it is not drawn here, it is not lost.
     */
    expect(done()).not.toContain('<RouteTrace');
    expect(done()).toContain('simplifyRoute(route)');
  });

  it('the SPLITS carry the shape of the run instead', () => {
    expect(done()).toContain('styles.doneShape');
    expect(done()).toContain('{splits.length > 0 ? (');
  });

  it('⚠️ and the map ruling is untouched — no map package, still', () => {
    /*
     * Founder, 2026-07-12, in `RouteTrace` and marked *do not reopen*: "no map SDK, ever." The
     * poster decision did not go near it, and this asserts that from the dependency list rather
     * than from a comment — the only place the claim can actually be checked.
     */
    const deps = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(Object.keys(deps.dependencies).filter((k) => /(^|-)map(box|libre)?($|-)/i.test(k))).toEqual([]);
    expect(read('src/components/RouteTrace.tsx')).toContain('no map SDK, ever');
  });
});

describe('and it asks for nothing', () => {
  it('there is no share control at the end of a run', () => {
    // The CONTROL, not the word: the block above explains in prose why there is no share button,
    // and a law that forbade the word would forbid saying why.
    expect(done()).not.toMatch(/onShare|ShareCardModal|t\('cardio\.share/);
  });

  it('it ends on DONE, and the mark is carried whole so a screenshot brings the product with it', () => {
    expect(done()).toContain("label={t('cardio.done')}");
    expect(done()).toContain('<RangeMark />');
  });
});
