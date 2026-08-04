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
    expect(lastTimeOn('bb_bench_press', h, { nowMs: NOW })).toEqual({ ago: 4, loadKg: 32.5, reps: [9, 9, 8] });
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
      .toEqual({ ago: 4, loadKg: 32.5, reps: [9] });
  });

  it('takes the load she FINISHED on, not the one she started', () => {
    // Loop 1 moves the load mid-exercise. What she finished at is what she trained at — the same
    // rule `coachFacts` uses, so the screen and the coach can never disagree about "last time".
    const h = [session('b', '06', [set('x', 40, 11), set('x', 42.5, 9), set('x', 42.5, 8)])];
    expect(lastTimeOn('x', h, { nowMs: NOW })).toMatchObject({ loadKg: 42.5, reps: [11, 9, 8] });
  });

  it('is null on a lift she has never done — a real state, not a hole', () => {
    expect(lastTimeOn('never_done', [session('b', '06', [set('x', 40, 8)])], { nowMs: NOW })).toBeNull();
    expect(lastTimeOn(null, [], { nowMs: NOW })).toBeNull();
    expect(lastTimeOn('x', [], { nowMs: NOW })).toBeNull();
  });

  it('carries a bodyweight lift as null rather than zero', () => {
    // Zero kilograms is a weight. Bodyweight is the absence of one, and the screen says so in words.
    expect(lastTimeOn('pull_up', [session('b', '06', [set('pull_up', null, 6)])], { nowMs: NOW }))
      .toMatchObject({ loadKg: null, reps: [6] });
  });
});

describe('and it reaches the stage', () => {
  const flow = () => read('src/screens/session/SessionFlow.tsx');

  it('⛔ is drawn on the set screen, with no tap', () => {
    /*
     * ⚠️ THE FORM CHANGED ON 2026-08-04, THE LAW DID NOT. It was one line — "LAST TIME · 4 DAYS AGO
     * · 57.5 KG · 8·8·7·6" — at ten points, which is the exact type the founder ruled off this
     * screen. Its REPS are the ghost row under her own sets now, where the comparison stands under
     * the number it is about; only the LOAD is still a line, because the row cannot carry it.
     *
     * Both halves are asserted, because losing either would put the evidence back behind a tap.
     */
    expect(flow()).toContain("{t('workout.lastLoad', {"); // the load
    expect(flow()).toContain('lastReps: lastTime.reps'); // …and the reps, into the row
    expect(flow()).toContain('const lastTime = session.lastTime;');
  });

  it('the session computes it, excluding the live session by id', () => {
    const store = read('src/state/stores/sessionStore.tsx');
    expect(store).toContain('lastTime: lastTimeOn(current?.exerciseId ?? null, historyRef.current, {');
    expect(store).toContain('excludeSessionId: sessionRef.current?.id,');
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
    const at = flow().indexOf('lastLoad: {');
    const style = flow().slice(at, flow().indexOf('},', at));
    expect(style).not.toContain('textTransform:');
    expect(flow()).not.toMatch(/<Legend[^>]*styles\.lastLoad/);
  });

  it('says nothing at all on a lift she has never done', () => {
    // A "last time —" with a dash is a row that answers nothing and costs a line of a stage whose
    // whole job is one fact.
    expect(flow()).toContain('{lastTime ? (');
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
      expect(copy.workout.lastLoad).toMatch(/\{\{load\}\}[\s\S]*\{\{unit\}\}/);
      expect(copy.workout.bodyweightShort).toBeTruthy();
    }
  });
});
