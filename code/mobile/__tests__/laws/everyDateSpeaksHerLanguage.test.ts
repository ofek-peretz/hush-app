/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ A DATE SPEAKS THE LANGUAGE SHE CHOSE, NOT THE ONE HER PHONE IS IN.
 *
 * Every date, weekday and month in the product was formatted with `toLocaleDateString(undefined, …)`
 * — nineteen sites across nine files. `undefined` does not mean "the app's language"; it means "the
 * runtime's default", which is the DEVICE locale. An athlete who set Hush to Hebrew on a phone she
 * bought in English read **"WEDNESDAY · 14:17"** at the head of her Saturday letter, "MONDAY" on her
 * run poster, and an English month on the share card she posts in public.
 *
 * ⚠️ FOUND BY OPENING THE SCREEN, 2026-08-19. Nothing could have caught it otherwise: the strings
 * are produced by `Intl`, not by the locale files, so `lint-copy` never sees them, and no test
 * renders a date and reads it. One screen showed one English word and the sweep found eighteen more.
 *
 * ⚠️ AND THE CORRECT PATTERN WAS ALREADY IN THE CODEBASE — `WhyChangedSheet` takes a `locale` and
 * passes it, with a comment saying the caller "owns the locale". One file knew; nine did not.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..', 'src');

function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      // the dev gallery is a harness, not a surface she meets
      if (e.isDirectory()) { if (e.name !== 'dev') walk(p); }
      else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
  };
  walk(SRC);
  return out;
}

describe('⛔ every date speaks her language', () => {
  it('no Intl formatter is handed `undefined` for its locale', () => {
    const offenders: string[] = [];
    for (const file of sources()) {
      const src = fs.readFileSync(file, 'utf8');
      const re = /\.toLocale(?:Date|Time)?String\(\s*undefined\s*,/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        offenders.push(`${path.relative(SRC, file)}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('⚠️ …and `new Intl.DateTimeFormat` is held to the same rule', () => {
    const offenders: string[] = [];
    for (const file of sources()) {
      const src = fs.readFileSync(file, 'utf8');
      const re = /new Intl\.(?:DateTimeFormat|NumberFormat|RelativeTimeFormat)\(\s*(undefined|\))/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        offenders.push(`${path.relative(SRC, file)}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
    // An omitted first argument is the same defect wearing a shorter spelling.
    expect(offenders).toEqual([]);
  });
});
