/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ENGINE DECIDES WHAT A SET IS — founder ruling, 2026-08-24 (the reversal).
 *
 * For a few hours the edit sheet carried two chips, "to failure" and "drop set", so the athlete
 * could state what a set had been, and the engine excluded a self-declared drop from every
 * miss-read. The founder struck the whole mechanism, and the reason is the product's thesis:
 *
 *   "אם אנשים רוצים לעשות דרופ סט צריך לתת להם אפשרות במהלך התוכנית לעשות דרופ סט ולא על דעת
 *    עצמם, אחרת מה הנקודה?! הכל צריך להיות מתוכנן מראש כך שהמתאמן בזמן אימון לא יחשוב על כלום
 *    אלא רק יבצע!"
 *
 * An athlete who invents a drop set at the bar has taken the coaching decision back, and an engine
 * that then excuses the set has stopped planning and started transcribing. The technique is not
 * rejected — its AUTHOR is. When drop sets ship they will ship as a PRESCRIPTION, printed into the
 * plan and marked by the engine itself, exactly the way the warm-up bridge already works
 * (`isApproach`/`isWarmup`) — which is a mark the engine writes, never one she chooses.
 *
 * This is the same ruling as the RIR one, one step further: the engine does not ask her how hard
 * it was, AND it does not ask her what it was. It asked for a weight and a rep count, and those
 * two numbers are the whole of what comes back.
 *
 * The contract:
 *   1 · no set-type control exists anywhere she can reach — the edit sheet is two dials;
 *   2 · no `tag` on the models, the engine's `SetPerf`, or the live plan step;
 *   3 · every performed set is evidence: nothing is excused from a miss-read except the engine's
 *       own warm-up/approach mark;
 *   4 · the words are gone from both of her languages.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import * as fs from 'fs';
import * as path from 'path';
import { decideExercise } from '@/engine/v5/loop2';
import { liftIsFatigued } from '@/engine/v5/deload';
import type { Band, ExerciseMeta, ExerciseState } from '@/engine/v5/types';

const SRC = path.join(__dirname, '..', '..', 'src');
const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

/** Every source file, so "nowhere she can reach" is checked against the whole app. */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
const FILES = walk(SRC);

const BAND: Band = { lo: 8, hi: 10 };
const BARBELL: ExerciseMeta = { equipment: 'barbell', bodyweight: false, observedLoads: [] };
const state = (over: Partial<ExerciseState> = {}): ExerciseState => ({
  exerciseId: 'bb_bench_press',
  load: 60,
  band: BAND,
  sets: 3,
  history: [],
  ...over,
});

describe('1 · nothing she can reach declares what a set was', () => {
  it('no set-type control survives in any screen or component', () => {
    const offenders = FILES.filter((f) => /tagDrop|tagFailure|editTagRow|editTagOn|currentTag/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('the edit sheet takes a weight and a rep count, and nothing else', () => {
    const store = read('src/state/stores/sessionStore.tsx');
    expect(store).toContain('editCurrentSet: (v: { weight: number | null; reps: number }) => void;');
    expect(store).toContain('editCurrentSet({ weight, reps }) {');
  });
});

describe('2 · no tag on any model the app writes or the engine reads', () => {
  it("neither SetLog, SetPerf, nor the live Step carries 'failure' | 'drop'", () => {
    for (const rel of ['src/data/local/models.ts', 'src/engine/v5/types.ts', 'src/state/stores/sessionStore.tsx']) {
      expect(read(rel)).not.toMatch(/tag\?: 'failure' \| 'drop'/);
    }
  });

  it('no engine reader excuses a set by tag', () => {
    for (const rel of ['src/engine/v5/loop2.ts', 'src/engine/v5/deload.ts', 'src/engine/v5/repsPerRung.ts', 'src/engine/v5/v5Engine.ts', 'src/domain/liveCorrections.ts']) {
      expect(read(rel)).not.toMatch(/\.tag (===|!==) 'drop'/);
    }
  });
});

describe('3 · every performed set is evidence', () => {
  it('a light third set is a miss again — the engine reads what happened, not what she calls it', () => {
    const out = decideExercise({
      state: state(),
      session: [{ load: 60, reps: 8 }, { load: 60, reps: 8 }, { load: 45, reps: 6 }],
      meta: BARBELL,
      rotationAvailable: true,
    });
    expect(out.decision).not.toBe('progress');
  });

  it('the deload mark lands on repeated short sets, with nothing able to wave it off', () => {
    expect(
      liftIsFatigued({
        load: 60,
        band: { lo: 8, hi: 10 },
        history: [
          { load: 60, sets: [{ reps: 6 }] },
          { load: 60, sets: [{ reps: 6 }] },
        ],
      }),
    ).toBe(true);
  });

  it("the engine's OWN warm-up mark is still the one exclusion", () => {
    const withBridge = decideExercise({
      state: state(),
      session: [{ load: 30, reps: 5, isApproach: true }, { load: 60, reps: 8 }, { load: 60, reps: 8 }, { load: 60, reps: 8 }],
      meta: BARBELL,
      rotationAvailable: true,
    });
    expect(withBridge.decision).toBe('progress'); // the 30 kg bridge did not read as a failed floor
  });
});

describe('4 · the words are gone from both of her languages', () => {
  it('no tag copy remains in en or he', () => {
    for (const rel of ['src/i18n/locales/en.json', 'src/i18n/locales/he.json']) {
      const lang = JSON.parse(read(rel));
      expect(lang.editResult.tagFailure).toBeUndefined();
      expect(lang.editResult.tagDrop).toBeUndefined();
      expect(lang.history.failureChip).toBeUndefined();
      expect(lang.history.dropChip).toBeUndefined();
    }
  });
});
