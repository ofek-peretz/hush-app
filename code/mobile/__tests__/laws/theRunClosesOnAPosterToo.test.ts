// @ts-nocheck
// 
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
  it('the activity is named by what it IS, never by a prescribed distance', () => {
    /*
     * A name with a number in it disagrees with the distance below it exactly when she stopped
     * short — which is the moment a poster must not be caught arguing with her.
     */
    expect(done()).not.toMatch(/targetMetres|runName/);
  });

  it('⛔ …and never by a GAIT, because a mixed session has no single one', () => {
    /*
     * ⛔ TIGHTENED 2026-08-12, and the founder caught me holding two positions at once:
     *
     *   *"אם המתאמן גם רץ וגם הולך באותו אימון איך נציג את זה כריצה או הליכה?! צריך להציג את זה
     *   כקרדיו אחד."*
     *
     * This line pinned `gaitFromPace(avgPace)` — the ONE place the product collapsed a session into
     * a single gait. I had just argued that no gait question is needed because `kcalPerKgKm` bills
     * **every segment at its own pace**, and then the poster titled the whole thing from the
     * average. **Twenty minutes walking and twenty running averages to a jog that never happened.**
     *
     * ⚠️ THE ENERGY WAS RIGHT THE WHOLE TIME — only the headline was picking a side, and the splits
     * already carry each kilometre's own gait. So the title states the general fact and the record
     * keeps the specific ones.
     */
    expect(done()).toContain("<Text style={styles.posterName}>{t('cardio.liveLegend')}</Text>");
    expect(done()).not.toContain('gaitFromPace(avgPace) ===');
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
    /*
     * ⛔ AND THE POSTER CARRIES NO GRAPHIC AT ALL (founder, 2026-08-28):
     * *"לא אבל בכללי זה לא ברור הדבר הזה. אנשים לא מבינים מה זה בכלל. זה נראה מוזר."*
     *
     * This test has now held three different answers to "what shape does the poster draw" — a bar
     * chart scaled by ratio, one scaled by window, and one drawn against the average — and the
     * founder rejected the CATEGORY, not the encoding. It is the same ruling he made about the route
     * on 2026-08-04, on the same surface: a graphic that needs explaining does not belong on a thing
     * read in one second by a stranger.
     *
     * So the rule is what it always meant: the poster says the run in FIGURES. It is pinned as an
     * absence because that is the decision — and if the shape of a run is ever wanted here again, it
     * arrives as a sentence in the coach's voice, which needs no legend.
     */
    expect(done()).not.toContain('<EffortShape');
    expect(done()).not.toContain('styles.doneShape');
  });

  it('⚠️ and the map ruling is untouched — no map package, still', () => {
    /*
     * Founder, 2026-07-12, in `RouteTrace` and marked *do not reopen*: "no map SDK, ever." The
     * poster decision did not go near it, and this asserts that from the dependency list rather
     * than from a comment — the only place the claim can actually be checked.
     */
    /*
     * ⛔ RE-LITIGATED 2026-08-23: the founder released his own 2026-07-12 ban ("פסיקות ישנות…
     * אל תיתן להן להגביל אותך"), and the run's RECORD now draws the route on Apple Maps
     * (react-native-maps — keyless, no account). What this test still holds is the half that was
     * never about the SDK: the POSTER stays map-free (a polyline is legible to one person, and a
     * paid tile on a shared story is somebody else's brand), and third-party TILE services with
     * keys and tracking stay out.
     */
    const deps = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(Object.keys(deps.dependencies).filter((k) => /mapbox|maplibre|google-maps/i.test(k))).toEqual([]);
    expect(deps.dependencies['react-native-maps']).toBeTruthy(); // Apple's own — keyless, released 2026-08-23
    expect(read('src/components/RouteTrace.tsx')).toContain('WAS RELEASED BY ITS AUTHOR');
    // The poster half of CardioComplete still draws no map — the shape bars carry the effort there.
    const done2 = done();
    expect(done2.slice(0, done2.indexOf('styles.doneFooter'))).not.toMatch(/MapView|react-native-maps/);
  });
});

describe('and its poster half asks for nothing — the door lives with the act', () => {
  /*
   * ⛔ RE-LITIGATED 2026-08-23. This test pinned the founder's 2026-08-02 "no share button"
   * ruling; he reversed it for the strength finish that morning and for THIS screen by name the
   * same day: *"שמסך הסיום של הקרדיו ירגיש גם הוא גאווה כך שהמתאמן ירצה לשתף את זה."*
   *
   * What SURVIVES of the old ruling is its dress code, the same split `theFinishIsAPosterNotAReport`
   * holds on WellDone: the poster half — everything a screenshot captures above the footer — stays
   * chrome-free, and the door is a QUIET ghost link in the footer, below Done, never a primary.
   */
  it('the POSTER half carries no share chrome — the door is in the footer only', () => {
    const poster = done().slice(0, done().indexOf('styles.doneFooter'));
    expect(poster.length).toBeGreaterThan(200); // the anchor still splits the halves
    expect(poster).not.toMatch(/ShareCardModal|t\('cardio\.shareStory'/);
  });

  it('⛔ …and the quiet door exists, dressed as a ghost link below Done', () => {
    const footer = done().slice(done().indexOf('styles.doneFooter'));
    expect(footer).toContain("navigation.navigate('ShareCardModal', { card: shareCard })");
    // Below Done, and in the ghost dress — not a second primary.
    expect(footer.indexOf("t('cardio.done')")).toBeLessThan(footer.indexOf("t('cardio.shareStory')"));
    expect(footer).toContain('styles.shareLink');
  });

  it('it ends on DONE, and the mark is carried whole so a screenshot brings the product with it', () => {
    expect(done()).toContain("label={t('cardio.done')}");
    expect(done()).toContain('<RangeMark />');
  });
});
