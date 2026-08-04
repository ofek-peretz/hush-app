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
  it('⛔ PACE is on the live stage, in the seat that was repeating the band', () => {
    /*
     * The row read "kilometre · heart · burn", and the kilometre is the same fact the band above it
     * draws twice — as a count and as the metres riding under its dot. Pace had been computed every
     * second since the tracker was written and drawn only on the pause stage and in a pill: the two
     * places she is not running.
     */
    expect(cardio()).toContain("<LiveStat value={fmtPace(props.paceSec)} label={t('cardio.perKm')} />");
    expect(cardio()).not.toContain("<LiveStat value={kmDone} label={t('cardio.km')} />");
  });

  it('the run’s SHAPE is drawn, and only once a kilometre exists', () => {
    // A bar chart with no bars is the empty slot `cardioLive`'s rhythm law was written about.
    expect(cardio()).toContain('{splits.length > 0 ? (');
    expect(cardio()).toContain('styles.shapeBar');
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
  it('⚠️ the band spans the TARGET when there is one', () => {
    expect(cardio()).toContain('const target = props.targetMetres && props.targetMetres > 0 ? props.targetMetres : null;');
    expect(cardio()).toContain('const spanM = target ?? 1000;');
  });

  it('⛔ and it never invents an end for a run she started herself', () => {
    /*
     * A free run has no distance to draw toward, and deciding one would be the app deciding how far
     * she is going. There the band stays on the current kilometre, exactly as it always has.
     */
    expect(cardio()).toContain("target ? Math.min(metresTotal, target) : metresTotal % 1000");
  });

  it('the run carries its own name, and falls back rather than blanking', () => {
    expect(cardio()).toContain("{props.runName ?? t('cardio.liveLegend')}");
  });

  it('⛔ …and the name is actually FED, not merely drawn', () => {
    /*
     * ⚠️ CAUGHT DURING THE BUILD: `runName` was declared, drawn and passed by nothing — the
     * "written, wired, drawn nowhere" failure inverted, and the one this codebase keeps producing.
     * A prop with no source is a prop that renders its fallback for ever while looking finished.
     */
    expect(cardio()).toContain('runName: movementById(target.ex)!.name');
  });
});
