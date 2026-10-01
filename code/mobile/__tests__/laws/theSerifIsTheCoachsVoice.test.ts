/**
 * ════ ⛔ TWO VOICES FOR A HEADLINE, AND WHO OWNS EACH (design audit, 2026-09-29) ════
 *
 * The audit's finding, on glass: pausing a workout drew *"Take the time you need."* in Frank Ruhl —
 * and the sheet that rose over it, *"End the workout here?"*, in Assistant. Two headlines, one
 * above the other, in two faces, and no rule anyone could state for why. Across the product the
 * same split ran at random: a confirmation sheet in the serif here, in the sans there; a lift's name
 * in the sans on the set stage and in the serif on its own detail page.
 *
 * The rule, as the audit set it and as the stage already practised it:
 *
 *   · **The serif (Frank Ruhl) is the coach speaking** — the day's name, the letter, the pause,
 *     "your programme is ready", a surface's own title in the handoff's voice.
 *   · **The UI face (Assistant) is the app** — a sheet asking about an operation (end, delete,
 *     leave, correct, save, share) and an exercise's NAME, which the set stage has always set in
 *     `sansSemibold` and every other surface now does too.
 *
 * ⚠️ WHAT THIS PINS AND WHAT IT LEAVES. It pins the two families the audit named (operation sheets,
 * exercise-name headings) and the one pairing it walked (pause serif / end-sheet sans). Surface
 * titles, the letter and the posters keep the handoff's serif — that is the founder's ruling that
 * the screens match the handoff one-to-one, typeface included, and nothing here reopens it.
 */
// @ts-nocheck

import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join('/');
const files = globSync('**/*.tsx', { cwd: SRC, absolute: true }).filter((f) => !rel(f).startsWith('screens/dev/'));

/** `name → fontFamily token` for every top-level style in a file, braces matched. */
function faces(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const at = src.indexOf('StyleSheet.create(');
  if (at < 0) return out;
  const key = /\n {2}(\w+): \{/g;
  key.lastIndex = at;
  let m: RegExpExecArray | null;
  while ((m = key.exec(src))) {
    let depth = 1;
    let i = key.lastIndex;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    const fam = src.slice(key.lastIndex, i).match(/fontFamily: font\.(\w+)/);
    key.lastIndex = i;
    if (fam) out.set(m[1], fam[1]);
  }
  return out;
}

const face = (file: string, style: string): string | undefined =>
  faces(fs.readFileSync(path.join(SRC, file), 'utf8')).get(style);

describe('⛔ the serif is the coach’s voice; the app speaks in the UI face', () => {
  it('every sheet that asks about an operation titles itself in the UI face', () => {
    const OPERATION_SHEET = /^(confirmTitle|sheetTitle|amendTitle)$/;
    const serif: string[] = [];
    let seen = 0;
    for (const f of files) {
      for (const [name, fam] of faces(fs.readFileSync(f, 'utf8'))) {
        if (!OPERATION_SHEET.test(name)) continue;
        seen++;
        if (/^serif/.test(fam)) serif.push(`${rel(f)}:${name} (${fam})`);
      }
    }
    expect(seen).toBeGreaterThan(6); // the scan found the family, not nothing
    expect(serif).toEqual([]);
  });

  it('an exercise is named in the UI face wherever it heads a screen or a sheet', () => {
    for (const [file, style] of [
      ['screens/session/SessionFlow.tsx', 'exName'],
      ['screens/session/ItemStage.tsx', 'itemName'],
      ['screens/progress/LiftDetail.tsx', 'name'],
      ['components/SwapSheet.tsx', 'current'],
      ['screens/plan/PlanBuilder.tsx', 'coachSheetName'],
      ['components/ExerciseDemo.tsx', 'title'],
    ]) {
      expect({ at: `${file}:${style}`, face: face(file, style) }).toEqual({ at: `${file}:${style}`, face: expect.stringMatching(/^sans/) });
    }
  });

  it('the pairing the audit walked: the pause is the coach (serif), the end sheet is the app (sans)', () => {
    expect(face('components/PausedStage.tsx', 'title')).toMatch(/^serif/);
    expect(face('screens/session/SessionFlow.tsx', 'sheetTitle')).toMatch(/^sans/);
  });
});
