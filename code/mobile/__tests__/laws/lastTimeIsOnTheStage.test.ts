// @ts-nocheck
// 
import fs from 'fs';
import path from 'path';
import { lastTimeOn } from '@/domain/lastTimeOn';
import type { Session, SetLog } from '@/data/local/models';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT SHE DID LAST TIME IS ON THE SET SCREEN, WITHOUT ASKING.
 *
 * ⛔ FOUNDER, 2026-08-04, choosing the next move: *"the set screen is where she spends 95% of her
 * time — if it isn't better than Strong's, nothing else matters."*
 *
 * Measured first, then built. Logging a set as prescribed is ONE tap here — a 338×64 target — which
 * matches the best loggers. What was missing is the thing she comes to the screen wanting: the last
 * time she did this lift and what she got.
 *
 * ── ⚠️ AND IT IS NOT PARITY ─────────────────────────────────────────────────────────────────────
 * In a logger, last time is there because SHE picks today's weight and needs it. Here the COACH
 * picked it, so last time is the EVIDENCE for the number already on the stage — it turns "34 kg"
 * from an instruction into a conclusion she can check, at no cost and without asking.
 *
 * It has been one tap away in the Why sheet the entire time. **One tap is where things go to be
 * unread.**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const set = (ex: string, w: number | null, reps: number): SetLog =>
  ({ exerciseId: ex, setIndex: 0, recommendedWeight: w, recommendedReps: 8, actualWeight: w,
     actualReps: reps, edited: false, persistedAt: '2026-08-01T10:00:00.000Z' } as SetLog);

const session = (id: string, day: string, sets: SetLog[]): Session =>
  ({ id, programDayId: 'd', startedAt: `2026-08-${day}T10:00:00.000Z`, state: 'SAVED',
     earlyFinish: false, trained: true, sets } as Session);

const NOW = Date.parse('2026-08-10T10:00:00.000Z');

describe('the last time she did this lift', () => {
  it('finds the most recent session that contains it', () => {
    const h = [
      session('a', '02', [set('bb_bench_press', 30, 10)]),
      session('b', '06', [set('bb_bench_press', 32.5, 9), set('bb_bench_press', 32.5, 9), set('bb_bench_press', 32.5, 8)]),
      session('c', '08', [set('db_row', 22, 12)]),
    ];
    expect(lastTimeOn('bb_bench_press', h, { nowMs: NOW }))
      .toEqual({ ago: 4, loadKg: 32.5, reps: [9, 9, 8], loads: [32.5, 32.5, 32.5] });
  });

  it('⛔ EXCLUDES the session she is in — or "last time" is the set she just did', () => {
    /*
     * History is written as she goes. Without the exclusion this reads back her own live session,
     * which is both useless and wrong: it would show today's first set as evidence for today's
     * second, and the number would change under her mid-exercise.
     */
    const live = session('live', '10', [set('bb_bench_press', 35, 7)]);
    const h = [live, session('b', '06', [set('bb_bench_press', 32.5, 9)])];
    expect(lastTimeOn('bb_bench_press', h, { nowMs: NOW, excludeSessionId: 'live' }))
      .toEqual({ ago: 4, loadKg: 32.5, reps: [9], loads: [32.5] });
  });

  it('takes the load she FINISHED on, not the one she started', () => {
    // Loop 1 moves the load mid-exercise. What she finished at is what she trained at — the same
    // rule `coachFacts` uses, so the screen and the coach can never disagree about "last time".
    const h = [session('b', '06', [set('x', 40, 11), set('x', 42.5, 9), set('x', 42.5, 8)])];
    expect(lastTimeOn('x', h, { nowMs: NOW })).toMatchObject({ loadKg: 42.5, reps: [11, 9, 8] });
    /* ⛔ AND THE ROW THAT DRAWS EACH SET GETS EACH SET'S OWN LOAD (founder, 2026-08-26). One
       finishing figure printed over three sets she did at two weights is a statement about a
       workout that did not happen — see `LastTime.loads`. */
    expect(lastTimeOn('x', h, { nowMs: NOW })).toMatchObject({ loads: [40, 42.5, 42.5] });
  });

  it('is null on a lift she has never done — a real state, not a hole', () => {
    expect(lastTimeOn('never_done', [session('b', '06', [set('x', 40, 8)])], { nowMs: NOW })).toBeNull();
    expect(lastTimeOn(null, [], { nowMs: NOW })).toBeNull();
    expect(lastTimeOn('x', [], { nowMs: NOW })).toBeNull();
  });

  it('carries a bodyweight lift as null rather than zero', () => {
    // Zero kilograms is a weight. Bodyweight is the absence of one, and the screen says so in words.
    expect(lastTimeOn('pull_up', [session('b', '06', [set('pull_up', null, 6)])], { nowMs: NOW }))
      .toMatchObject({ loadKg: null, reps: [6], loads: [null] });
  });
});

describe('and it reaches the stage', () => {
  const flow = () => read('src/screens/session/SessionFlow.tsx');

  it('⛔ is drawn on the set screen, with no tap', () => {
    /*
     * ⚠️ THE FORM CHANGED AGAIN ON 2026-08-04, AND THE LAW HELD BOTH TIMES. The reps went from a
     * ten-point line, to a ghost ROW under her own, to a single row where last time's number sits in
     * the slot until she replaces it. And the LOAD stopped being a line at all: it is a delta on the
     * hero now (`↑1.5`), because "32.5 last time" is a sum she has to do and the delta is the fact.
     */
    expect(flow()).toContain('lastTimeKg: lastTime.loadKg'); // the load, as news beside the figure
    /*
     * ⛔ `lastReps` NO LONGER REACHES A ROW (founder 2026-08-12). The set row drew the reps of each
     * finished set, and `Complete set` records `recommendedReps` — the FLOOR of her band — so an
     * athlete who did ten and pressed once saw her own set written down as eight. He removed the
     * figures himself: *"זה נותן את הלגיטימציה להוריד את המספרים של החזרות הקודמות, פשוט להציג איזה
     * SET זה מתוך כמה."*
     *
     * ⚠️ THE LAW'S SUBJECT SURVIVES INTACT AND IS THE HALF THAT MATTERED. "Last time" reaches the
     * stage as the LOAD's comparison — the delta beside the figure — which is what turns "34 kg"
     * from an instruction into a conclusion she can check. That was always the argument in this
     * file's header; the rep ghosts were the part that could lie.
     */
    expect(flow()).toContain('setRow({');
    expect(flow()).toContain('const lastTime = session.lastTime;');
  });

  /*
   * ⛔ AND HE ASKED FOR THE FIGURES BACK (founder, 2026-08-26): *"אני עדיין לא מבין איך אתה הולך
   * להציג את החזרות והמשקלים מהאימון הקודם במידה וצריך את זה. כי אם כן כרגע אני לא רואה את זה."*
   *
   * The two clauses above record the row being DELETED and the law surviving on the delta alone.
   * Both were right at the time and the reason the row went is gone: `Complete set` used to write
   * `recommendedReps` — the floor of the band — so the row printed her eight when she did ten. The
   * dials fixed the cause on the same day this was asked; the record is hers now, so it can be
   * shown. See `LastTimeStrip`.
   *
   * ⚠️ THE INFERENCES ARE NOT THE ANSWER, WHICH IS WHY THIS IS A LAW AND NOT A COMMIT. A delta and
   * a 6-point dot on a dial are both TRUE statements about last time and neither of them is the
   * number she asked for. The delta is arithmetic run backwards; the dot is not a figure at all.
   */
  it('⛔ her actual figures are on the stage — not only the delta and the dial mark', () => {
    /*
     * ⛔ REWRITTEN 2026-08-31 (founder, free hand on the layout). The figures moved OUT of a row of
     * their own and INTO the two fields they are about — `prevLoad` under the load, `prevReps`
     * under the count. `LastTimeStrip` is deleted.
     *
     * The clause this law has always been about is untouched and is asserted harder: **her actual
     * figures, for THIS set, on the glass.** What is new is the third line, and it is the reason
     * the move was worth making — the previous is now in the SAME UNITS as the figure it sits
     * under, so the comparison needs no arithmetic. It used to say `32.5` above a field saying `7`.
     */
    /*
     * ⛔ REWRITTEN AGAIN 2026-09-07 (founder: *"עיצוב יפה שיראה מה היה בפעם הקודמת"*). The two
     * in-field lines became ONE strip under the fields — every set of her last session on this
     * lift, `load×reps` per set, the set she is on lit. The clause is the same and is asserted the
     * same way: her actual figures, per SET, in the field's own units.
     */
    const f = flow();
    expect(f).toContain('const lastSets =');
    /* Per SET, by position — every set she did, `loads[i]` beside `reps[i]`. */
    expect(f).toContain('lastTime.reps.map((reps, i) =>');
    expect(f).toContain('lastTime.loads?.[i]');
    /* …and the set she is on now is the lit one. */
    expect(f).toContain('const now = i === prevSetIdx;');
    /* ⛔ AND IN THE FIELD'S OWN UNITS — `displayWeight` into hers, `equipmentValue` into what she
       hangs on one end. Dropping either one puts a second scale back on the screen. */
    expect(f).toMatch(/equipmentValue\(session\.currentExerciseId, displayWeight\(/);
  });

  it('⛔ …and it says nothing at all on a warm-up bridge', () => {
    /*
     * A bridge is half the working load BY DESIGN (`theWarmupIsABridgeNotAMeasurement`), so a
     * comparison against last time there is the "looks broken" frame Rev 8 deleted the approach set
     * over. Both figures are suppressed by the SAME flag that suppresses the dial markers, so they
     * can never disagree about whether last time is being shown.
     */
    const f = flow();
    expect(f).toMatch(/const lastSets =[\s\S]{0,8}!isWarmupSet && lastTime/);
  });



  it('the session computes it, excluding the live session by id', () => {
    const store = read('src/state/stores/sessionStore.tsx');
    expect(store).toContain('lastTime: lastTimeOn(current?.exerciseId ?? null, historyRef.current, {');
    expect(store).toContain('excludeSessionId: sessionRef.current?.id,');
  });

  it('⚠️ the delta is absent when nothing moved, rather than a zero', () => {
    /*
     * It sits beside the largest figure on the screen; a "↑0" there is a claim about her training at
     * the size of a fist. `loadNews` returns null and the view draws nothing at all.
     *
     * ⚠️ MATCHED ON THE GUARD, NOT ON ONE SPELLING OF IT (2026-08-31). This pinned the literal
     * `{news ? (` and broke the day a second condition joined it — the delta is also suppressed
     * while the weight's own number pad is open, because a figure being typed has no "against last
     * week" yet. The clause that matters is that `news` gates it.
     */
    expect(flow()).toMatch(/\{news[^}]*\?\s*\(/);
  });

  it('⚠️ the unit is written the same way here as on the hero — nothing uppercases it', () => {
    /*
     * ⛔ AND THIS CAUGHT ME REINTRODUCING IT. The original defect was a `Legend`, which uppercases:
     * it rendered "32.5KG" four lines under a hero that says "kg". I removed the Legend, then wrote
     * `textTransform: 'uppercase'` into the style of the line that replaced it.
     *
     * So the law is asserted against the STYLE now, not against the component — the component was
     * never the cause.
     */
    // `textTransform:` with its colon — a DECLARATION. The bare word appears in the comment that
    // explains why it must not be there, and matching that would make the law unfixable.
    const at = flow().indexOf('rxDelta: {'); // `heroNews` until the stage went vertical (2026-08-12)
    const style = flow().slice(at, flow().indexOf('},', at));
    expect(style).not.toContain('textTransform:');
  });

  it('⛔ says nothing at all on a lift she has never done', () => {
    /*
     * No history → no delta and no ghosts. `loadNews` returns null without a comparison, and the row
     * falls through to a dash rather than a zero — a zero is a set she did and failed.
     *
     * ⚠️ The "LAST TIME · 57.5 KG" line that used to carry this is DELETED: the hero states the
     * comparison now, and printing the absolute weight underneath said the same fact twice in the
     * form she has to do arithmetic on.
     */
    expect(flow()).not.toContain('styles.lastLoad');
    /*
     * ⛔ THE DASH WENT WITH THE ROW IT LIVED IN. It printed "–" for a set with no history rather than
     * a zero — a zero is a set she DID and failed — and that distinction was real for as long as the
     * row drew rep figures at all. It no longer does; see the note above.
     *
     * What must still hold on a lift with no history is that nothing is claimed: `loadNews` returns
     * null without a comparison, so the delta beside the load is simply absent.
     */
    expect(flow()).toMatch(/\{news[^}]*\?\s*\(/);
  });

  it('is written in both languages', () => {
    for (const loc of ['en', 'he']) {
      const copy = JSON.parse(read(`src/i18n/locales/${loc}.json`)) as { workout: Record<string, string> };
      /*
       * ⚠️ `lastTime` IS DELETED, not merely unused — the reps and the "N days ago" it carried are
       * the ghost row now. Dead copy in a locale file is the thing that comes back into a screen a
       * year later because someone finds the key and assumes it belongs somewhere.
       */
      expect(copy.workout.lastTime).toBeUndefined();
      /* ⚠️ AND THE ROW'S OWN WORD IS A DIFFERENT KEY ON PURPOSE. `workout.lastTime` carried the
         deleted ten-point sentence ("LAST TIME · 4 DAYS AGO · 57.5 KG · 8·8·7·6") and this file
         asserts it never returns; the row above it is a row of FIGURES with one word introducing
         them, so it gets its own name rather than reviving a string this law forbids. */
      expect(copy.workout.lastSession).toBeTruthy();
      expect(copy.workout.lastLoad).toBeUndefined(); // deleted with the line, not left unused
      /* The delta's screen-reader sentence — the glyph is "↑1.5" and VoiceOver gets words. */
      expect(copy.workout.loadUpBy).toMatch(/\{\{delta\}\}[\s\S]*\{\{unit\}\}/);
      expect(copy.workout.loadDownBy).toBeTruthy();
      expect(copy.workout.bodyweightShort).toBeTruthy();
    }
  });
});
