/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * A ZERO IS NOT A MEASUREMENT OF ZERO.
 *
 * The poster has said this since it was built, in its own words:
 *
 *   > *"A run that recorded time and no credited distance — a phone that never got a fix, an athlete
 *   > with no bodyweight on file — closed on a poster reading '0 KCAL'. The record it wrote in the
 *   > same breath OMITS the field entirely, so the app was printing a figure on the one screen she
 *   > screenshots that it refused to keep. Zero calories is not a measurement of zero; it is the
 *   > absence of one."*
 *
 * ⛔ AND THE LIVE ROW TWELVE LINES ABOVE IT WAS STILL PRINTING `0` (found 2026-08-22, in a founder
 * screenshot of the first seconds of a run: `--:--  ·  —  ·  0`). One row, three seats, and the two
 * that had a law were honest while the third was not.
 *
 * ── ⚠️ THIS IS THE SHAPE THIS CODEBASE KEEPS FINDING, AND IT IS WHY THERE IS A LAW HERE ─────────
 * The engine register's own conclusion, after five audits: *"a law that holds on one path and not
 * its neighbour is how every defect in this engine's audit got in."* Both seats read the SAME
 * `calories`, on the same screen, four hundred lines apart.
 *
 * ── THE TWO SURFACES DIFFER, AND THE DIFFERENCE IS DELIBERATE ───────────────────────────────────
 *   · the POSTER is final, so an absent fact leaves NO SEAT — there is nothing more to come.
 *   · the LIVE row is mid-run, so it holds the seat and draws the em-dash it already draws for a
 *     heart it cannot read. The burn arrives within seconds of the first credited metre, and a row
 *     that re-flows under her eyes at eight kilometres an hour is worse than a dash.
 *
 * Neither of them may print a zero.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const cardio = () => fs.readFileSync(path.join(SRC, 'screens', 'cardio', 'Cardio.tsx'), 'utf8');

describe('the run never prints a figure it did not measure', () => {
  it('⛔ the LIVE burn holds its seat and draws a dash', () => {
    const src = cardio().replace(/\s+/g, ' ');
    expect(src).toContain("value={calories > 0 ? Math.round(calories) : '—'}");
  });

  it('⛔ the POSTER burn leaves no seat at all', () => {
    const src = cardio().replace(/\s+/g, ' ');
    expect(src).toContain('{props.calories > 0 ? ( <DoneStat value={Math.round(props.calories)}');
  });

  it('⚠️ …and no seat ANYWHERE on the screen can be reached by an unguarded burn', () => {
    /*
     * The assertion that survives a refactor of either markup. Written as a sweep rather than as two
     * string matches because the failure was never in one place — it was that one place had the
     * guard and its neighbour did not, so a law naming both by their current JSX would go stale the
     * first time either was rewritten.
     *
     * ⚠️ SCOPED TO WHAT IS DRAWN — a `value=` prop, which is what both stat components take. The
     * screen also rounds the burn into the LIVE ACTIVITY's `ContentState`, and that is a different
     * layer with a different contract: it is a typed native payload whose sibling field says so in
     * as many words (`hr: … : 0, // 0 = no source; the widget hides it`). A sentinel inside a data
     * envelope is not a figure printed at an athlete, and a law that could not tell them apart would
     * be demanding a dash in a Swift struct.
     */
    const src = cardio();
    const seats = [...src.matchAll(/value=\{[^}]*calories[^}]*\}/g)];
    expect(seats.length).toBeGreaterThan(0);
    for (const m of seats) {
      const line = src.slice(0, m.index).split('\n').length;
      /*
       * ⚠️ THE GUARD MAY SIT EITHER SIDE OF THE SEAT, and both are correct answers to two different
       * questions. The live row guards INSIDE the value, because it keeps the seat and swaps the
       * figure for a dash; the poster guards OUTSIDE it, because it withholds the seat entirely. So
       * the window is the seat plus what wraps it, and what the law forbids is a seat with no guard
       * on either side of it.
       */
      const scope = src.slice(Math.max(0, m.index - 200), m.index + m[0].length);
      expect({ line, guarded: /calories\s*>\s*0/.test(scope) }).toEqual({ line, guarded: true });
    }
  });

  it('⚠️ the heart it cannot read is the language the dash is borrowed from', () => {
    // The em-dash is not invented for the burn: the heart seat has drawn it for a watchless athlete
    // since C.19. One word for "not measured yet", so a row never speaks two languages about it.
    const src = cardio().replace(/\s+/g, ' ');
    expect(src).toContain("value={hr != null ? Math.round(hr) : '—'}");
  });
});
