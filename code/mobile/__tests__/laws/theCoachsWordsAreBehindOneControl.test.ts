import fs from 'fs';
import path from 'path';
import { emphasesOf } from '@/domain/emphases';
import type { Step } from '@/state/stores/sessionStore';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * KEY POINTS — the coach's words live behind ONE control, on every surface it speaks on.
 *
 * ⛔ FOUNDER, 2026-08-02, rejecting my fix and giving a better one:
 *
 *   > *"Can't we add a KEY POINTS button on the workout screen — tapping it explains the points and
 *   > why? That sounds far smarter than loading up the workout screens. For cardio and for strength
 *   > both."*
 *
 * ── THE MEASUREMENT THAT STARTED IT ─────────────────────────────────────────────────────────────
 * The per-item `say` filled inconsistently: 15/15 and 12/12 on the intake calls, 0/7 on the
 * post-session one. My proposal was to make it REQUIRED in the schema so the model could not omit
 * it. That would have bought a sentence per lift and spent the stage to do it — on a screen whose
 * whole job is "do this set", against a ruling already given once, and by adding instructions to a
 * prompt whose documented worst regression came from exactly that.
 *
 * Behind a control, an inconsistent `say` degrades into a SHORTER LIST. On the stage, it degrades
 * into a blank space where a promise used to be. That is the entire difference, and it is why the
 * founder's version is the one that shipped.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const step = (over: Partial<Step>): Step => ({
  exerciseId: 'bb_bench_press',
  globalIndex: 0,
  exerciseSetIndex: 0,
  totalSetsInExercise: 3,
  lastSetOfExercise: false,
  lastSetOfSession: false,
  ...over,
});

describe('what the coach wrote about this workout', () => {
  it('collects one point per exercise, in the order she meets them', () => {
    const points = emphasesOf([
      step({ exerciseId: 'bb_bench_press', item: { kind: 'reps', ex: 'bb_bench_press', reps: [8, 10], load: 40, say: 'One in the tank.' } }),
      step({ exerciseId: 'db_row', item: { kind: 'reps', ex: 'db_row', reps: [10, 12], load: 22, say: 'Right side first.' } }),
    ]);
    expect(points).toEqual([
      { ex: 'bb_bench_press', say: 'One in the tank.' },
      { ex: 'db_row', say: 'Right side first.' },
    ]);
  });

  it('⚠️ says a repeated item ONCE — six 400s are one point, not six', () => {
    // The interval case, which is the whole reason this deduplicates. Six steps carry the same
    // sentence; printing it six times turns a briefing into wallpaper.
    const repeat = (n: number) =>
      step({ exerciseId: 'run_outdoor', globalIndex: n, exerciseSetIndex: n, totalSetsInExercise: 6,
             item: { kind: 'distance', ex: 'run_outdoor', metres: 400, say: 'Hard, but not a sprint.' } });
    expect(emphasesOf([0, 1, 2, 3, 4, 5].map(repeat))).toHaveLength(1);
  });

  it('is empty when the coach was quiet — and that silence is what hides the control', () => {
    expect(emphasesOf([step({ item: { kind: 'reps', ex: 'bb_bench_press', reps: [8, 10], load: 40 } })])).toEqual([]);
    // Whitespace is silence too. A `say` of "  " would otherwise open a sheet onto a blank line.
    expect(emphasesOf([step({ item: { kind: 'reps', ex: 'bb_bench_press', reps: [8, 10], load: 40, say: '   ' } })])).toEqual([]);
    // …and a plan with no coach items at all — the old ProgramDay path — has no points either.
    expect(emphasesOf([step({})])).toEqual([]);
  });
});

describe('the control is on both stages, and opens onto something', () => {
  /*
   * ⛔ THESE READ THE SCREENS, and that is deliberate. The habit that produced four of this week's
   * defects was testing a domain function and calling the screen covered — most recently a law that
   * stayed green when I reverted its own fix, because the fix was one line in a component.
   *
   * `emphasesOf` being correct proves nothing about whether a single pixel reaches her.
   */
  const flow = () => read('src/screens/session/SessionFlow.tsx');
  const cardio = () => read('src/screens/cardio/Cardio.tsx');

  it('⚠️ on the STRENGTH stage the disc opens the conversation, and the points open it', () => {
    /*
     * ⛔ THE SECOND RULING, HOURS AFTER THE FIRST. The disc was a read-only key-points sheet; the
     * founder then replaced the swap disc with a coach WINDOW. A briefing that only lives behind a
     * control she can no longer reach is a feature deleted by accident — so the points became the
     * conversation's opening turn instead of a second sheet behind a second control.
     */
    expect(flow()).toMatch(/onCoach=\{onLift && !confirm \? \(\) => setOverlay\('coach'\) : undefined\}/);
    expect(flow()).toContain('<SessionCoach');
    expect(read('src/screens/session/SessionCoach.tsx')).toMatch(/useState<CoachTurn\[\]>\([\s\S]{0,40}session\.emphases\.map/);
  });

  it('⚠️ CARDIO keeps the read-only sheet, and that is not an inconsistency', () => {
    // She is RUNNING. A conversation is a thing you have standing still between sets; on a live run
    // the coach's line is something to read, not somewhere to type. Same glyph, same words, one
    // less thing to do with them.
    expect(cardio()).toContain("import { EmphasesSheet } from '@/screens/session/EmphasesSheet'");
    expect(cardio()).toMatch(/\{props\.say \? \(\s*<Pressable/);
    // …and the sheet refuses to draw an empty list even if a caller gets it wrong.
    expect(read('src/screens/session/EmphasesSheet.tsx')).toContain('if (emphases.length === 0) return null;');
  });

  it('cardio names the exercise its point is about', () => {
    // Without `ex` every cardio point would be titled "run_outdoor" — including a row, a bike and
    // a walk.
    expect(cardio()).toMatch(/emphases=\{\[\{ ex: props\.exerciseId \?\? 'run_outdoor', say: props\.say \}\]\}/);
  });

  it('⚠️ cardio no longer clamps the sentence to two lines on the stage', () => {
    /*
     * The state this replaces: `<Text style={styles.coachSay} numberOfLines={2}>` — which fixed the
     * instruction being dropped entirely, and created a smaller bug in its place. Anything longer
     * than two lines was cut mid-thought with no way to read the rest.
     */
    expect(cardio()).not.toContain('styles.coachSay');
  });

  it('the exercise reaches the run, so the point can be named on the sheet', () => {
    // `ex` is carried on the route. Without it every cardio point would be titled "run_outdoor",
    // including a row, a bike and a walk.
    expect(flow()).toContain("target: { metres, ex: itemShape.ex,");
    expect(read('src/app/navigation.ts')).toContain('metres: number; say?: string; ex?: string');
  });

  it('the glyph names the SPEAKER — it is the coach talking, not the app informing', () => {
    expect(flow()).toMatch(/accessibilityLabel=\{t\('sessionCoach\.open'\)\}[\s\S]{0,120}name="speech"/);
    expect(cardio()).toMatch(/accessibilityLabel=\{t\('workout\.keyPoints'\)\}[\s\S]{0,320}name="speech"/);
  });
});

describe('a repeated item says where she is in it', () => {
  /*
   * ⛔ FOUNDER, 2026-08-02, choosing between three ways to run an interval: *"do B."*
   *
   * `6 × 400 m` expands into six steps, and each one opened the item stage showing "400 m" and
   * nothing else — so the sixth rep was indistinguishable from the first, and from a brand new
   * exercise. The set stage has said "SET 2 OF 4" since the beginning.
   */
  it('the stage draws the round, and the flow hands it the session\'s own label', () => {
    const stage = read('src/screens/session/ItemStage.tsx');
    expect(stage).toContain("{t('workout.repOfM', { n: round.n, m: round.m })}");
    // All three item stages, not just the one the interval happens to use today.
    expect((stage.match(/<RoundLine round=\{round\} \/>/g) ?? [])).toHaveLength(3);
    expect(read('src/screens/session/SessionFlow.tsx')).toContain('const round = session.setLabel;');
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
      expect(copy.workout.keyPoints).toBeTruthy();
    }
  });
});
