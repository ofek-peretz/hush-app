// @ts-nocheck
import fs from 'fs';
import path from 'path';
import { bandPlacement } from '@/screens/session/SessionFlow';

const flow = () => fs.readFileSync(path.join(__dirname, '..', '..', 'src/screens/session/SessionFlow.tsx'), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE END-OF-SET BEAT IS NOT A FOOTNOTE ON A POSTER.
 *
 * ⛔ FOUNDER, 2026-08-12, on four screenshots of the family:
 *   *"מסך פלאפון כזה עצום והאישור של סוף סט נראה כל כך עצוב וקטן."*
 *
 * Measured before the redesign, on an 844-point screen: the "set landed" beat drew **59 points** of
 * content — a 280×2 hairline, an 84×3 span, two 18-point ticks and one line of 17px `ink1`. Four
 * hundred points of black above it and four hundred below.
 *
 * ⚠️ AND THE WORST OF IT WAS NOT THE SIZE. `2.3d` (inside the band) and `2.3e` (above it) were the
 * same picture in a different hue, told apart by one word at 17 points — two opposite training
 * conclusions, indistinguishable at arm's length in a gym.
 *
 * This file pins the three things that made it small, because each of them is a single number that
 * a later edit can quietly put back.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** A style block's body, by key — the same device the other type laws use. */
function styleOf(key: string): string {
  const s = flow();
  const at = s.indexOf(`  ${key}: {`);
  if (at < 0) throw new Error(`no style named ${key}`);
  return s.slice(at, s.indexOf('\n  },', at) + 4);
}

describe('the beat is drawn at the scale of the screen it is on', () => {
  it('⛔ the verdict is a sentence, not a caption', () => {
    /*
     * It was `textScale['2xs']` uppercase in `stage.ink1` — the exact size and colour the founder
     * had ruled out on the SET stage the same morning ("בחדר כושר לא יראו את זה"). On a screen
     * holding nothing else, the only words on it were the quietest thing in the type scale.
     */
    const legend = styleOf('corrBeatLegend');
    const size = /fontSize:\s*([0-9.]+)/.exec(legend);
    expect({ found: !!size }).toEqual({ found: true });
    expect(Number(size![1])).toBeGreaterThanOrEqual(28);
    expect(legend).toContain('stage.ink0'); // full ink, not the secondary
    expect(legend).not.toContain('uppercase'); // a sentence is not a label
  });

  it('⛔ the instrument spans the stage, and its ticks are at full strength', () => {
    /*
     * 280 wide on a 390 phone, with the band's own ticks at `opacity: 0.55` — a scale drawn at half
     * strength is what let "inside" and "above" read as one screen.
     */
    expect(styleOf('corrBeatBand')).toContain('width: BAND_W');
    const w = /const BAND_W = ([0-9]+)/.exec(flow());
    expect(Number(w![1])).toBeGreaterThanOrEqual(320);

    const tick = styleOf('corrBeatBandTick');
    expect(tick).not.toContain('opacity');
    expect(Number(/height:\s*([0-9.]+)/.exec(tick)![1])).toBeGreaterThanOrEqual(24);

    // The dot must not be smaller than the ticks it is read against — it was 14 to their 18.
    const dot = /const BAND_DOT = ([0-9]+)/.exec(flow());
    expect(Number(dot![1])).toBeGreaterThanOrEqual(20);
  });

  it('⛔ the band says what the band IS — two anonymous ticks are not a scale', () => {
    /*
     * The instrument told her she landed inside "your band" and never once printed the range. It is
     * the cheapest information on the screen and the only thing there she cannot already infer.
     */
    expect(flow()).toContain('styles.corrBeatScaleLo');
    expect(flow()).toContain('styles.corrBeatScaleHi');
    expect(flow()).toContain('{band[0]}');
    expect(flow()).toContain('{band[1]}');
  });

  it('⚠️ the drawn geometry and the placement rule read the SAME constants', () => {
    /*
     * `bandPlacement` returns a pixel offset and the stylesheet draws the track it is an offset
     * INTO. They were two sets of magic numbers (98/182 in the rule, 98/182 in the styles) that
     * agreed only by coincidence — rescale one and the dot silently stops meaning anything.
     */
    for (const key of ['corrBeatBandSpan', 'corrBeatBandTickLo', 'corrBeatBandTickHi']) {
      expect({ key, wired: /BAND_X_(LO|HI)/.test(styleOf(key)) }).toEqual({ key, wired: true });
    }
    // And the placement never puts the dot outside the track it is drawn in.
    const W = Number(/const BAND_W = ([0-9]+)/.exec(flow())![1]);
    const D = Number(/const BAND_DOT = ([0-9]+)/.exec(flow())![1]);
    for (const reps of [1, 7, 8, 9, 10, 11, 40]) {
      const p = bandPlacement({ weight: 34, reps, n: 1, m: 4, band: [8, 10] })!;
      expect({ reps, inside: p.left >= 0 && p.left + D <= W }).toEqual({ reps, inside: true });
    }
  });

  it('⛔ the lift-done beat carries a screen on its own, because on `2.3g` it has to', () => {
    /*
     * FOUNDER, 2026-08-12: *"אם צריך אותו אז אל תמחק אותו אבל תעצב אותו מחדש שיראה נורמלי."*
     *
     * `2.3g` is the last set of a lift with NO rep band — a hold, a carry, a distance. There is no
     * band to draw, so the pips and the lift's name ARE the screen: 72 points of an 844-point phone
     * before this. ⚠️ The fix is not more facts — a hold has no reps and often no load, and R7
     * forbids inventing the rest. It is that both were drawn at the size of a caption.
     */
    // The pips take the band's own track, so the family has one geometry rather than two.
    expect(styleOf('donePipsWrap')).toContain('width: BAND_W');
    expect(Number(/height:\s*([0-9.]+)/.exec(styleOf('donePip'))![1])).toBeGreaterThanOrEqual(12);
    // …and they are LABELLED, exactly as the band's ends are. An instrument you have to count is
    // the same defect in both.
    expect(flow()).toContain("t('workout.setsDone', { count: confirm.m })");
    // The name outranks the band's sentence: a lift ending is the larger news.
    const title = Number(/fontSize:\s*([0-9.]+)/.exec(styleOf('beatDoneTitle'))![1]);
    const legend = Number(/fontSize:\s*([0-9.]+)/.exec(styleOf('corrBeatLegend'))![1]);
    expect({ title, outranks: title > legend }).toEqual({ title, outranks: true });
  });

  it('⛔ one anchor for the whole family — the lift-done beat is not pinned to the top', () => {
    /*
     * `beatHead` carried `paddingTop: 28` while the set-landed beats were vertically centred, so
     * the founder's screenshots showed the same instrument in two different places on the screen.
     */
    const head = styleOf('beatHead');
    expect(head).not.toContain('paddingTop');
    expect(head).toContain("justifyContent: 'center'");
  });
});

describe('and the plain readback is gone from the app, not just from the gallery', () => {
  it('⛔ nothing draws "Set recorded" any more', () => {
    /*
     * FOUNDER: *"צריך להעיף … ולוודא שהם לא מופיעים בשום דבר באפליקציה."* The phone could never
     * reach it; a set logged on the WATCH always did, because `WatchLoggedSet` carried no band for
     * `bandPlacement` to place. The form is deleted and so is its copy — dead copy in a locale file
     * is how a screen comes back a year later.
     */
    expect(flow()).not.toContain('styles.loggedNum');
    expect(flow()).not.toContain("t('workout.recorded')");
    for (const loc of ['en', 'he']) {
      const copy = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', '..', `src/i18n/locales/${loc}.json`), 'utf8'),
      ) as { workout: Record<string, string> };
      expect(copy.workout.recorded).toBeUndefined();
      expect(copy.workout.setLogged).toBeUndefined();
      expect(copy.workout.loadHolds).toMatch(/\{\{load\}\}/);
    }
  });

  it('⛔ the wrist carries the band, so both devices answer one set the same way', () => {
    const store = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src/state/stores/sessionStore.tsx'),
      'utf8',
    );
    expect(store).toContain('...(bandOf(tgt) ? { band: bandOf(tgt)! } : {}),');
    // …and the phone applies the SAME predicate to it that its own beat uses.
    expect(flow()).toContain('if (!(beat.n >= beat.m && beat.m > 1) && bandPlacement(beat) == null) return;');
  });
});
