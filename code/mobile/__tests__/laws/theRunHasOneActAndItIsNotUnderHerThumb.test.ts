// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
const cardio = () => read('src/screens/cardio/Cardio.tsx');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE RUN HAS ONE ACT, AND IT IS NOT UNDER HER THUMB.
 *
 * ⛔ FOUNDER, 2026-08-04:
 *
 *   > *"Why is there such a huge PAUSE button there in the first place? We could do pause like on
 *   > the strength screen and then use all the enormous space we'd have. That button is asking for
 *   > trouble — somebody could press it by accident during cardio and not notice at all."*
 *
 * ── ⚠️ WHY THIS IS WORSE ON THIS SCREEN THAN ANY OTHER ──────────────────────────────────────────
 * A paused strength set is obvious the moment she looks at it. **A paused run keeps looking exactly
 * like a run** — same stage, same numbers, the clock simply stopped and the kilometres quietly not
 * being counted. And a full-width button at the bottom edge is precisely where a phone is gripped,
 * squeezed and pushed into a pocket, which is what a phone does for the entire duration of a run.
 *
 * The failure is silent, it lasts as long as the run does, and it destroys the record of it.
 *
 * ── AND THE SPACE IT FREED ──────────────────────────────────────────────────────────────────────
 * Pace, which every runner reads first and which this screen had never drawn; and the run's own
 * shape, one bar per kilometre. Both were already computed and both were invisible.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

describe('⛔ pause is a disc in the chrome, not a target at the bottom edge', () => {
  it('no full-width button is rendered anywhere on the live stage', () => {
    /*
     * `Button … size="act" block` is the shape of the thing that was there. A `block` button on this
     * screen is the defect, whatever its label says.
     */
    const live = cardio().slice(cardio().indexOf('export function CardioLiveView'));
    const end = live.indexOf('export function', 40);
    expect(live.slice(0, end > 0 ? end : undefined)).not.toMatch(/size="act"\s*\n?\s*block/);
  });

  it('and the pause disc carries the SAME glyph as the strength stage’s', () => {
    // One gesture pauses any work in this product. Two different marks for one act is how an athlete
    // ends up hunting for a control mid-run.
    expect(cardio()).toMatch(/<Icon name="pause" size=\{15\}[^/]*filled/);
    expect(read('src/screens/session/SessionFlow.tsx')).toMatch(/<Icon name="pause" size=\{15\}[^/]*filled/);
  });

  it('⚠️ it still opens the same paused stage — nothing about stopping a run changed', () => {
    // The hazard was the size of the target, never the path behind it. Rewiring the path would have
    // been a second change hiding inside a layout fix.
    expect(cardio()).toContain('onPress={props.onPause}');
    expect(cardio()).toContain('<PausedStage');
  });
});

describe('what the freed space carries', () => {
  it('⛔ the seat holds the DISTANCE, and no live pace exists on the stage (founder 2026-08-23)', () => {
    /*
     * RE-LITIGATED. This test used to pin the pace INTO the seat (his 2026-08-04 ruling); on
     * 2026-08-23 he reversed it by name — *"אני לא רוצה שיופיע בזמן אמת מה הקצב לקילומטר"* —
     * so the pace waits for the kilometre and the seat carries the run's total distance, which the
     * ring (current-km metres only) stopped showing when it replaced the band. The full ruling is
     * pinned in `thePaceWaitsForTheKilometre`; this test keeps only the seat's occupant.
     */
    /* ⚠️ The exact expression is no longer pinned here — see the same note in
       `thePaceWaitsForTheKilometre`, which owns the formatting half. This test keeps the seat. */
    expect(cardio()).toMatch(/<LiveStat value=\{distanceKm[^}]*\} label=\{kmUnit\} \/>/);
    expect(cardio()).not.toContain("fmtPace(props.paceSec)");
  });

  it('⛔ the poster draws no chart at all — it says the run in figures', () => {
    /* Founder, 2026-08-28. The full argument is in `theRunClosesOnAPosterToo`, which owns this
       ruling; here it only has to stay true of the file that used to draw it. */
    expect(cardio()).not.toContain('<EffortShape');
    expect(cardio()).not.toContain('styles.shapeBar');
  });

  it('⚠️ and the bars stay FURNITURE — no numbers, no axis, no labels on them', () => {
    /*
     * At 8 km/h nothing may compete with the clock. If the shape reads as a chart rather than as a
     * texture it comes out, and the first symptom of that would be a figure printed on a bar.
     */
    const at = cardio().indexOf('styles.shape}');
    const block = cardio().slice(at, cardio().indexOf('</View>', at));
    expect(block).not.toContain('<Text');
    expect(block).not.toContain('Legend');
  });

  it('⛔ and the split PILL is gone — one fact was being stated four times', () => {
    // The bars draw every kilometre, the 3.4b moment announces the one that just landed, and the
    // per-km push delivers it to a pocket. The pill was the fourth and the least useful.
    expect(cardio()).not.toContain('splitLogged');
  });
});

describe('a run the coach wrote has an end, and a free run does not', () => {
  /*
   * ⛔ RE-LITIGATED 2026-08-24 (founder, build-58 QA): the RING left the live stage — the list
   * is the instrument now (*"לכל קילומטר שורה משלו עם הקלוריות והזמן… לא חייב את הטבעת"*).
   * What survives of the old pins: a prescribed run STATES its end (the quiet target line) and a
   * free run never has one invented; and the live top row moves on the current kilometre alone.
   */
  it('⚠️ a prescribed run states its end — the quiet target line', () => {
    expect(cardio()).toContain('const target = props.targetMetres && props.targetMetres > 0 ? props.targetMetres : null;');
    expect(cardio()).toContain("t('cardio.targetEnd'");
  });

  it('⛔ and a free run never invents one — the live row is the current kilometre alone', () => {
    expect(cardio()).toContain('const metresIntoKm = metresTotal % 1000;');
    expect(cardio()).toContain("t('cardio.kmOrdinal', { n: kmDone + 1 })");
  });

  it('the run carries its own name, and falls back rather than blanking', () => {
    expect(cardio()).toContain("{props.runName ?? t('cardio.liveLegend')}");
  });

  it('⛔ …and the name is actually FED, not merely drawn', () => {
    /*
     * ⚠️ CAUGHT DURING THE BUILD: `runName` was declared, drawn and passed by nothing — the
     * "written, wired, drawn nowhere" failure inverted, and the one this codebase keeps producing.
     * A prop with no source is a prop that renders its fallback for ever while looking finished.
     *
     * ⛔ AND THIS LINE PINNED THE BYPASS (2026-08-27). It asserted the exact text
     * `runName: movementById(target.ex)!.name` — a direct read of the catalogue's raw ENGLISH
     * field, which is what titled the live run stage `Run` in a Hebrew app. The law was doing its
     * real job (the prop is fed) through a string that also froze *how*, so the defect could not be
     * fixed without failing the test that was meant to protect the feature.
     *
     * It pins the two things it actually means now: the name is fed FROM the target, and it is fed
     * THROUGH the display path. `everyLiftHasAHebrewName` owns the second half as well.
     */
    expect(cardio()).toContain('runName: exerciseDisplayName(target.ex)');
    expect(cardio()).toContain('target?.ex && movementById(target.ex)');
  });
});
