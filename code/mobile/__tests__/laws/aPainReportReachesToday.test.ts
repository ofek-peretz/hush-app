// @ts-nocheck
import fs from 'fs';
import path from 'path';
import { easeFor, liftsForbiddenNow, patternsAt } from '@/domain/painReport';
import { applyLiveEdit } from '@/domain/liveRevision';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A PAIN REPORT REACHES THE WORKOUT SHE IS STANDING IN.
 *
 * ⛔ FOUNDER, 2026-08-12: *"אני באימון חזה ודיווחתי על פציעה בחזה והמשכתי את האימון וזה נשאר לי על
 * תרגיל חזה. אז מה המשמעות של זה לא הבנתי?"*
 *
 * The honest answer was: nothing. `reportPain` wrote the ease and regenerated the PROGRAMME —
 * every week after this one — and the session in front of her was untouched. She reported a hurt
 * chest, pressed Back, and Resume returned her to the next chest press.
 *
 * ⚠️ THE PROGRAMME HALF WAS RIGHT AND IT WAS THE HALF THAT COULD WAIT. A report filed standing at a
 * rack is about the set she is about to do.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const NOW = Date.parse('2026-08-12T10:00:00.000Z');
/** The REAL patterns, from `FORBIDDEN_PATTERNS`'s own vocabulary — not names invented here. */
const patternOf = (id: string): string | null =>
  ({ bb_bench_press: 'press_flat', db_row: 'row', bb_back_squat: 'squat', db_lateral_raise: 'lateral_raise' } as Record<
    string,
    string
  >)[id] ?? null;

describe('what a fresh report takes out of today', () => {
  it('⛔ names the lifts the ease forbids, from the SAME table the assembler uses', () => {
    /*
     * `patternsAt` is the one source. A second list here would let today and next week forbid
     * different movements — the exact shape of defect this file's neighbours keep recording.
     */
    const eases = [easeFor('Chest', 'pain', NOW)];
    // `pain` reaches the LOADED patterns as well as the aggravators — a flat press loads a chest.
    expect(patternsAt('Chest', 'pain')).toContain('press_flat');
    expect(liftsForbiddenNow(['bb_bench_press', 'db_row', 'bb_back_squat'], eases, NOW, patternOf))
      .toEqual(['bb_bench_press']);

    /*
     * ⚠️ AND A TWINGE REACHES ONLY THE AGGRAVATORS, which is the severity ladder doing its job:
     * a chest that twinges keeps its press and loses its fly.
     */
    expect(liftsForbiddenNow(['bb_bench_press'], [easeFor('Chest', 'twinge', NOW)], NOW, patternOf)).toEqual([]);
  });

  it('⚠️ a hurt BACK takes the squat with it — the muscle is the label, the pattern is the joint', () => {
    /*
     * The case a muscle-only model cannot express, and the reason this reads PATTERNS and not
     * names: `Back` at `pain` forbids `hinge`, `row` AND `squat`, so a lift filed under Quads goes
     * too. Switching the muscle "Back" off would never have reached it.
     */
    const eases = [easeFor('Back', 'pain', NOW)];
    const gone = liftsForbiddenNow(['bb_bench_press', 'db_row', 'bb_back_squat'], eases, NOW, patternOf);
    expect(gone).toEqual(['db_row', 'bb_back_squat']);
  });

  it('reports nothing when no window is open, and nothing on a lift it does not reach', () => {
    expect(liftsForbiddenNow(['bb_bench_press'], [], NOW, patternOf)).toEqual([]);
    expect(liftsForbiddenNow(['bb_bench_press'], undefined, NOW, patternOf)).toEqual([]);
    // An expired window forbids nothing — `activeEases` is what decides, not the presence of a row.
    const old = [easeFor('Chest', 'twinge', NOW - 30 * 24 * 3600_000)];
    expect(liftsForbiddenNow(['bb_bench_press'], old, NOW, patternOf)).toEqual([]);
  });
});

describe('⛔ and it cannot empty the session out from under her', () => {
  const step = (ex: string, i: number) =>
    ({ exerciseId: ex, setIndex: 0, indexInSession: i, recommendedWeight: 40, recommendedReps: 8 } as never);

  it('the drop is refused when nothing would be left at or after where she stands', () => {
    /*
     * ⚠️ THE GUARD IS `applyLiveEdit`'S AND IT IS NOT NEW — this only has to route through it. A
     * report that ended her workout for her would be a different act from the one she performed,
     * and she never asked for it.
     */
    const only = [step('bb_bench_press', 0)];
    expect(applyLiveEdit(only, 0, { do: 'drop', ex: 'bb_bench_press' })).toBe(only);
  });

  it('…and takes the lift out when there is something after it', () => {
    const plan = [step('bb_bench_press', 0), step('db_row', 1)];
    const out = applyLiveEdit(plan, 0, { do: 'drop', ex: 'bb_bench_press' });
    expect(out.map((s: { exerciseId: string }) => s.exerciseId)).toEqual(['db_row']);
  });
});

describe('the wire', () => {
  it('⛔ the report screen revises TODAY, not only the programme', () => {
    const pain = read('src/screens/pain/PainWhere.tsx');
    expect(pain).toContain('await app.reportPain(muscle, severity);');
    expect(pain).toContain('liftsForbiddenNow(remaining, app.profile?.painEases, Date.now()');
    expect(pain).toContain("session.reviseToday(gone.map((ex) => ({ do: 'drop', ex }) as const))");
  });

  it('⚠️ and the programme half is untouched — it was never the part that was wrong', () => {
    const store = read('src/state/stores/appStore.tsx');
    expect(store).toContain('await model.generateProgram(programProfile(profile))');
  });

  it('⛔ the pain door is reachable from BOTH paused stages — the gym and the run', () => {
    // A run loads calves, quads, hamstrings and shins; the cardio pause refused to ask until
    // 2026-08-12 on the grounds that it "trains no muscle Hush prescribes".
    expect(read('src/screens/session/SessionFlow.tsx')).toContain("navigation.navigate('PainWhere'");
    expect(read('src/screens/cardio/Cardio.tsx')).toContain("navigation.navigate('PainWhere'");
  });
});
