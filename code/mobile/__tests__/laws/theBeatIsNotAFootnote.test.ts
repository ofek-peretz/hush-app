/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE BEAT IS NOT A FOOTNOTE — held through its second life (founder 2026-08-12 → 2026-08-26).
 *
 * The original finding: *"מסך פלאפון כזה עצום והאישור של סוף סט נראה כל כך עצוב וקטן"* — a whole
 * phone, and the moment after a set occupied 59 points. The first cure was the band instrument at
 * three times the scale. The 2026-08-26 ruling then deleted the band (a logger is not judged
 * mid-workout), and THIS law survives the deletion because its subject was never the band — it
 * was the SIZE of the moment. The capture that replaced the verdict must never shrink back into a
 * caption, and the lift-done beat must still carry a screen on its own.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const flow = () => fs.readFileSync(path.join(ROOT, 'src/screens/session/SessionFlow.tsx'), 'utf8');

const styleNum = (name: string, prop: string): number => {
  const block = new RegExp(name + ':\\s*\\{[^}]*' + prop + ':\\s*(\\d+)').exec(flow());
  expect(block).not.toBeNull();
  return Number(block![1]);
};

describe('the capture is drawn at the scale of the screen it is on', () => {
  it('⛔ her figures are the subject — bigger than any legend on the beat', () => {
    expect(styleNum('capFigures', 'fontSize')).toBeGreaterThanOrEqual(56);
  });

  it('⛔ the strike is a target, not a glyph — the moss disc holds real size', () => {
    expect(styleNum('capDisc', 'width')).toBeGreaterThanOrEqual(44);
  });

  it('the beat is composed, not dumped — it rides the product\'s own Arrive', () => {
    const f = flow();
    const capture = f.slice(f.indexOf('function LoggedCapture'), f.indexOf('function ExerciseDone'));
    expect(capture).toContain('<Arrive');
  });

  it('…and it is FELT: the capture and the lift-close each carry their own pulse', () => {
    const f = flow();
    const capture = f.slice(f.indexOf('function LoggedCapture'), f.indexOf('function ExerciseDone'));
    const done = f.slice(f.indexOf('function ExerciseDone'), f.indexOf('DOES THE LOGGED BEAT SPEAK'));
    expect(capture).toContain('haptics.success()');
    expect(done).toContain('haptics.success()');
  });
});

describe('the lift-done beat carries a screen on its own', () => {
  /*
   * ⛔ THE INSTRUMENT CHANGED ON 2026-08-26 AND THIS LAW DID NOT (founder: *"אולי אתה יכול לעשות
   * עיגול שמשלים את עצמו וכשהוא מגיע לסט האחרון לעשות אנימציה יפה של התרגיל הושלם"*).
   *
   * The 334-point pip row is gone; the RING the athlete has been filling one set at a time closes
   * in its place. The law's subject was never the pips — it was the founder's original finding,
   * *"מסך פלאפון כזה עצום והאישור של סוף סט נראה כל כך עצוב וקטן"* — so it follows the instrument
   * rather than the drawing, and asserts the same thing about the new one: it spans the stage, and
   * the count is still said in words beside it.
   */
  it('⛔ the ring spans the stage and the sets are labelled — an instrument, not a caption', () => {
    const m = /const RING_D = (\d+)/.exec(flow());
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(200);
    expect(flow()).toContain("t('workout.setsDone'");
  });

  it('⛔ and it is the SAME ring both beats draw — the last set closes what every set filled', () => {
    /* The continuity is the whole idea. A lift-done graphic that appears only at the end is a
       summary; a ring the athlete watched fill is a conclusion. One component, both beats. */
    const f = flow();
    const capture = f.slice(f.indexOf('function LoggedCapture'), f.indexOf('function ExerciseDone'));
    const done = f.slice(f.indexOf('function ExerciseDone'), f.indexOf('DOES THE LOGGED BEAT SPEAK'));
    expect(capture).toContain('<SetRing');
    expect(done).toContain('<SetRing');
    /* …and the arcs are per SET, not a single sweep: `m` divides the circle. */
    expect(f).toContain('const pitch = circ / sets;');
  });

  it('⛔ the sentence is not optional — the beat always names the lift that ended', () => {
    const f = flow();
    expect(f).toContain("t('workout.liftDone'");
    expect(f).toContain("t('workout.liftDonePlain')");
  });
});

describe('one predicate, shared by the askers that once diverged', () => {
  it('the wrist replay asks the same beatSpeaksFor the render guard asks', () => {
    expect(flow()).toContain('if (!beatSpeaksFor(beat, null)) return;');
  });
});
