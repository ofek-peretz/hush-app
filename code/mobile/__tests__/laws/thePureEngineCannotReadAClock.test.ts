/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * I-24 · THE PURE ENGINE IS HANDED THE TIME. IT NEVER ASKS FOR IT.
 *
 * The register requires that identical inputs produce an identical programme, and every module under
 * `engine/v5` says so in its own header — `programAssembly` opens with the single word **PURE**.
 *
 * ⛔ IT WAS NOT (found 2026-08-16). `pickExercises` called `Date.now()` four frames deep, to judge
 * whether a pain window was still open, and two things followed from it:
 *
 *   · **The claim was false.** The same body map, the same report and the same preferences built a
 *     different week depending on what the wall clock said.
 *   · **And it was a time bomb in the suite.** `theProgrammeUnderAnInjury` pins its report to a fixed
 *     date, so the audit passed on the day it was written and began failing the moment real time
 *     walked past the three-day TWINGE window — with the seven-day PAIN case and the fourteen-day
 *     SHARP case still green, and both due to break within the fortnight. A red test that appears on
 *     a calendar boundary, in a suite nobody changed, is the most expensive kind there is.
 *
 * ⚠️ THE PROGRAMME *SHOULD* CHANGE WHEN A WINDOW CLOSES. That was never the defect. Reading the clock
 * from inside a decision, where no caller and no test can reach it, is.
 *
 * So the instant is a parameter. `assembleV5DayLists` may default it — it is the boundary — and
 * nothing deeper may know the time at all.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';
import { assembleV5DayLists } from '@/engine/v5/programAssembly';
import { easeFor, effectiveBodyMap } from '@/domain/painReport';

const ENGINE = path.join(__dirname, '..', '..', 'src', 'engine');

/** Every .ts under src/engine, which is the whole of the pure core. */
function engineFiles(dir: string = ENGINE): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? engineFiles(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : [],
  );
}

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('⛔ nothing in the pure engine reads a clock', () => {
  it('no Date.now(), no new Date(), no performance.now() — except the one declared boundary', () => {
    const offenders: string[] = [];
    for (const file of engineFiles()) {
      const rel = path.relative(ENGINE, file).replace(/\\/g, '/');
      const src = strip(fs.readFileSync(file, 'utf8'));
      for (const [i, line] of src.split(/\r?\n/).entries()) {
        // `new Date(x)` FORMATS an instant it was handed; only the no-argument form reads a clock.
        if (!/\bDate\.now\s*\(|\bnew Date\s*\(\s*\)|performance\.now\s*\(/.test(line)) continue;
        /*
         * THE ONE ALLOWED READ: a DEFAULT on a parameter — `nowMs: number = Date.now()`. It keeps
         * the decision injectable (every caller and every test can pass its own instant) while
         * letting the outermost boundary stay convenient. A clock read anywhere else is a decision
         * nobody can reach, and that is the whole defect this law exists for.
         */
        if (/:\s*number\s*=\s*Date\.now\(\)/.test(line)) continue;
        offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('⚠️ and the assembler really does honour the instant it is given', () => {
    /*
     * The behavioural half — a text law alone would pass on a parameter nothing reads. A twinge is a
     * three-day window: judged inside it the movement is gone, judged after it the movement is back,
     * from the SAME report and the same map.
     */
    const reportedAt = Date.UTC(2026, 0, 10);
    const eases = [easeFor('Glutes', 'twinge', reportedAt)];
    const map = effectiveBodyMap(undefined, eases, reportedAt);
    const profile = { sex: 'female', weightKg: 62, painEases: eases };

    const inside = assembleV5DayLists(map, 4, {}, {}, undefined, profile, reportedAt + 86400000);
    const after = assembleV5DayLists(map, 4, {}, {}, undefined, profile, reportedAt + 30 * 86400000);
    const patterns = (lists) => new Set(lists.flatMap((d) => d.exerciseIds));

    expect(patterns(inside)).not.toEqual(patterns(after)); // the window really does bind
  });

  it('…and is deterministic when the instant does not move', () => {
    const at = Date.UTC(2026, 0, 10);
    const eases = [easeFor('Glutes', 'twinge', at)];
    const profile = { sex: 'female', weightKg: 62, painEases: eases };
    const a = assembleV5DayLists(effectiveBodyMap(undefined, eases, at), 4, {}, {}, undefined, profile, at);
    const b = assembleV5DayLists(effectiveBodyMap(undefined, eases, at), 4, {}, {}, undefined, profile, at);
    expect(a).toEqual(b);
  });
});
