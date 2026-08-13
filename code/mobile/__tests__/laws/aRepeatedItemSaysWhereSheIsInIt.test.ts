// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A REPEATED ITEM SAYS WHERE SHE IS IN IT.
 *
 * ⛔ FOUNDER, 2026-08-02, choosing between three ways to run an interval: *"do B."*
 *
 * `6 × 400 m` expands into six steps, and each one opened the item stage showing "400 m" and
 * nothing else — so the sixth rep was indistinguishable from the first, and from a brand new
 * exercise. The set stage has said "SET 2 OF 4" since the beginning.
 *
 * ── ⚠️ WHY IT LIVES HERE NOW ────────────────────────────────────────────────────────────────────
 * These three assertions were the tail of `theCoachsWordsAreBehindOneControl`, a law about the
 * mid-workout sheet and the cardio key-points sheet — **both deleted 2026-08-12** at the founder's
 * instruction, because every action they held already had a better home. The round line has nothing
 * to do with either sheet; it was only filed beside them. Carried out whole rather than deleted
 * with its neighbours, which is how a real rule disappears in a cleanup.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a repeated item says where she is in it', () => {
  it('⛔ THE RAIL DRAWS IT ON A HOLD — and the words came off, because they were the same fact twice', () => {
    /*
     * ⛔ REWRITTEN THE DAY AFTER IT WAS WRITTEN (founder, 2026-08-12), and the correction is his own
     * earlier ruling arriving one screen late.
     *
     * On the set stage he had "SET 2 OF 4" merged into the rail: *"אולי אפשר לעשות את זה יחד עם הקו
     * שהחליף את ה-LIFT."* `LiftRail` is fed `session.setLabel` and it is drawn above EVERY stage,
     * the plank included — so when he asked for the plank to be built like `2.2`, the screen was
     * already printing "REP 2 OF 3" underneath a rail that was drawing the identical fact.
     *
     * ⚠️ THE ORIGINAL BUG IS STILL CLOSED, WHICH IS WHAT THIS FILE IS FOR. Six 400 m repeats were
     * six identical screens; they are not, because the rail splits into the item's rounds exactly as
     * it splits into a lift's sets. The fact moved instruments — it did not go away.
     */
    const flow = read('src/screens/session/SessionFlow.tsx');
    expect(flow).toContain('const round = session.setLabel;');
    // One rail, fed the same label the words used to carry.
    expect(flow).toContain('setN={session.setLabel?.n}');
    expect(flow).toContain('setM={session.setLabel?.m}');
    // …and the hold no longer says it a second time.
    const stage = read('src/screens/session/ItemStage.tsx');
    const time = stage.slice(stage.indexOf('export function TimeStage'), stage.indexOf('export function DistanceStage'));
    expect(time).not.toContain('<RoundLine');
  });

  it('⛔ and the hold is built in the SET stage’s language', () => {
    /*
     * FOUNDER: *"מה שאני כן רוצה מהPLANK שתעצב אותו כמו מסכים THE SET 2.2 כי זה תרגיל לכל דבר."*
     * The three tells were the ones `2.2` had already fixed: the identity floating mid-screen, the
     * figure with no heading over it, and a 50-point text bloom that painted a grey RECTANGLE
     * behind `0:45` on his screenshot.
     */
    const stage = read('src/screens/session/ItemStage.tsx');
    expect(stage).toContain("justifyContent: 'space-between'"); // not `center` with a gap
    expect(stage).toContain("{t('workout.hold')}"); // the lit heading, as WEIGHT and REPS are
    expect(stage).not.toContain('textShadowRadius'); // the bloom that read as a box
  });

  it('⚠️ stays silent when the item does not repeat', () => {
    // A single 5 km run is not "rep 1 of 1". Saying so puts a number on the stage that means
    // nothing, which is worse than the silence it replaced.
    expect(read('src/screens/session/ItemStage.tsx')).toContain('if (!round || round.m <= 1) return null;');
  });

  it('is written in both languages', () => {
    for (const loc of ['en', 'he']) {
      const copy = JSON.parse(read(`src/i18n/locales/${loc}.json`)) as { workout: Record<string, string> };
      expect(copy.workout.repOfM).toMatch(/\{\{n\}\}[\s\S]*\{\{m\}\}/);
      /*
       * ⛔ AND `keyPoints` MUST BE GONE, not merely unused — it was the label of the speech disc on
       * the cardio run, the one caller of the sheet that went with it. Dead copy in a locale file is
       * how a screen comes back a year later, because someone finds the key and assumes it belongs.
       */
      expect(copy.workout.keyPoints).toBeUndefined();
    }
  });
});

describe('⛔ and the two sheets are gone from the app, not just from the gallery', () => {
  /*
   * FOUNDER, 2026-08-12: *"להחליף תרגיל יש את כפתור ה-SWAP … וזה נראה לי פותר גם את SKIP THIS כי
   * במקום לדלג המתאמן פשוט יכול ללחוץ SWAP. תמחק אותם בבקשה."*
   *
   * The sharper half is the second: a lift she wants gone is a lift she wants REPLACED. Swapping
   * keeps the volume the week was balanced around; skipping quietly takes it out of her back.
   */
  it('neither file exists, and nothing imports them', () => {
    for (const f of ['src/screens/session/SessionCoach.tsx', 'src/screens/session/EmphasesSheet.tsx']) {
      expect({ file: f, exists: fs.existsSync(path.join(__dirname, '..', '..', f)) }).toEqual({
        file: f,
        exists: false,
      });
    }
    for (const f of [
      'src/screens/session/SessionFlow.tsx',
      'src/screens/cardio/Cardio.tsx',
      'src/screens/dev/gallery.tsx',
      'src/components/PausedStage.tsx',
    ]) {
      const s = read(f);
      expect({ f, importsCoach: /import .*SessionCoach/.test(s) }).toEqual({ f, importsCoach: false });
      expect({ f, importsSheet: /import .*EmphasesSheet/.test(s) }).toEqual({ f, importsSheet: false });
    }
  });

  it('⛔ every DOOR is gone too — a removed room behind a live door is worse than either', () => {
    const flow = read('src/screens/session/SessionFlow.tsx');
    expect(flow).not.toContain("setOverlay('coach')");
    expect(flow).not.toContain("| 'coach'"); // and out of the Overlay union, so it cannot be set
    // The paused stage's door, and the stage bar's speech disc that NOTHING ever passed.
    expect(read('src/components/PausedStage.tsx')).not.toContain('onCoach');
    expect(flow).not.toContain('sessionCoach.open');
    expect(read('src/screens/cardio/Cardio.tsx')).not.toContain('setPoints(true)');
  });

  it('⚠️ and the store no longer collects what only they read', () => {
    // `emphases` had exactly two readers and both are deleted; the domain that built it went with
    // them. An item's own sentence survives on the stage it belongs to (`ItemStage`'s `SayLine`),
    // which is the better place for it than a page she has to go and open.
    expect(fs.existsSync(path.join(__dirname, '..', '..', 'src/domain/emphases.ts'))).toBe(false);
    const store = read('src/state/stores/sessionStore.tsx');
    expect(store).not.toContain('emphasesOf(plan)');
    expect(read('src/screens/session/ItemStage.tsx')).toContain('<SayLine say={item.say} />');
  });
});
