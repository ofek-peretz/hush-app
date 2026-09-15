/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PACE WAITS FOR THE KILOMETRE — founder, 2026-08-23, on the cardio redesign:
 *
 *   *"אני לא רוצה שיופיע בזמן אמת מה הקצב לקילומטר אלא רק לאחר קילומטר להראות כמה זמן זה ארך.
 *   וכך לכל קילומטר."*
 *
 * This REVERSES his own 2026-08-04 ruling ("pace takes the seat") by name, which is why it needs a
 * law of its own: the pace seat has now been put ON the live stage once and taken OFF it once, and
 * without a pin the third pass re-derives whichever ruling its author read last.
 *
 * What the ruling means, precisely:
 *   · While a kilometre is UNDERWAY, no per-kilometre rate is drawn anywhere — not on the live
 *     stage, not on the pause screen, not on the lock card (that half is pinned beside the widget
 *     source in `theLockCardStatesEveryFact`).
 *   · The moment a kilometre CLOSES, its own time is stated — the row, the 3.4b moment, the
 *     notification. Those are statements about a finished thing, and they stay.
 *   · A FINISHED RUN may state its whole-run average — the poster and the record are after the
 *     run, which is what "לא בזמן אמת" excludes.
 *
 * ⚠️ `paceSec` KEEPS EXISTING inside `cardioRun` — the energy model prices every credited segment
 * at the pace it was covered at (`kcalForSegment`), and that is measurement, not display. The law
 * governs what is DRAWN.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import * as fs from 'fs';
import * as path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const cardio = read('src/screens/cardio/Cardio.tsx');

/** The LIVE stage — everything from the view's declaration to the kilometre moment's. The poster
 *  (`CardioComplete`) is deliberately OUTSIDE this slice: it is after the run. */
function liveSlice(): string {
  const start = cardio.indexOf('export function CardioLiveView');
  const end = cardio.indexOf('export function KmMoment');
  if (start < 0 || end < 0 || end <= start) throw new Error('CardioLiveView / KmMoment moved — re-anchor this law, do not delete it');
  return cardio.slice(start, end);
}

/** The kilometre moment (3.4b) — from its declaration to the poster's. */
function momentSlice(): string {
  const start = cardio.indexOf('export function KmMoment');
  const end = cardio.indexOf('export function CardioComplete');
  if (start < 0 || end < 0 || end <= start) throw new Error('KmMoment / CardioComplete moved — re-anchor this law, do not delete it');
  return cardio.slice(start, end);
}

describe('the pace waits for the kilometre (founder 2026-08-23)', () => {
  it('⛔ the live stage draws no live pace — no paceSec prop, no /km readout', () => {
    // The prop is gone from the view entirely; a re-added seat would bring both of these back.
    expect(liveSlice()).not.toContain('props.paceSec');
    expect(liveSlice()).not.toContain("t('cardio.perKm')");
  });

  it('…and the pause screen states the clock and the distance, never a rate', () => {
    // The paused block lives inside the live slice; this pins the specific regression — the old
    // line computed an average pace from elapsed/distance right on the pause stage.
    expect(liveSlice()).not.toContain('elapsedSec / distanceKm');
  });

  it('a FINISHED kilometre states the time it took — the rows and the moment read durationSec', () => {
    expect(liveSlice()).toContain('fmtPace(sp.durationSec)');
    expect(momentSlice()).toContain('fmtPace(split.durationSec)');
    // …and neither dresses it as a rate: the /km unit went with the framing.
    expect(momentSlice()).not.toContain("t('cardio.perKm')");
  });

  it('the seat the pace left holds the run’s total distance', () => {
    /*
     * The ring shows the CURRENT kilometre's metres; without this seat the total is on the screen
     * nowhere. (Not the 2026-08-04 duplicate — that seat repeated the old full-run band.)
     *
     * ⚠️ LOOSENED 2026-08-27. This pinned the exact expression `distanceKm.toFixed(2)`, so it also
     * froze the FORMATTING — and the formatting turned out to be wrong: the seat printed `0.00`
     * before GPS had a fix, next to a burn already drawing `—` and a status line reading "מאתר GPS".
     * A law that names the occupant should name the occupant, not the sentence it is written in.
     * What it means is: this seat exists, and what sits in it is `distanceKm` in her unit.
     */
    expect(liveSlice()).toMatch(/<LiveStat value=\{distanceKm[^}]*\} label=\{kmUnit\} \/>/);
    expect(liveSlice()).toContain("distanceKm > 0 ? distanceKm.toFixed(2) : '—'");
  });

  it('⚠️ and the FINISHED run may state its whole-run average — the poster keeps it', () => {
    const poster = cardio.slice(cardio.indexOf('export function CardioComplete'));
    expect(poster).toContain('fmtPace(avgPace)');
  });
});
