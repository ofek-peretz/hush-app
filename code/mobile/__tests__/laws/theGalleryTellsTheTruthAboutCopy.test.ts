/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE GALLERY TELLS THE TRUTH ABOUT COPY — design-audit finding, 2026-08-24.
 *
 * The gallery is the ONLY surface on which a human reviews Hush screen by screen. On 2026-08-24 a
 * design audit read six screens in it and filed two localisation defects — Hebrew screens showing
 * "Barbell Bench Press", "Lat Pulldown", "Dumbbell Shoulder Press". Both were false. The product
 * translates every one of those (`exerciseDisplayName` → `exercise.<id>` in he.json); it was the
 * FIXTURES that hardcoded English, in 51 places.
 *
 * That is worse than a cosmetic bug, and it is worth being precise about why:
 *
 *   · a REAL localisation defect and a fixture lie look identical in the gallery, so the harness
 *     cannot distinguish the bug from the noise — it can only produce false positives (wasting a
 *     reviewer's day) and false negatives (a Hebrew screen that really is broken still renders in
 *     English, and reads as fine);
 *   · 13 of those 51 rows carried ids that exist in NO catalogue (`bench`, `ohp`, `tri`, `row`…),
 *     so every Form door and every WHY sheet on those rows opened onto nothing. The file's own
 *     comment records catching this once before, on one screen, and the other rows kept it.
 *
 * The rule is therefore mechanical, not a matter of care: a fixture may not SAY an exercise's name.
 * It names an id, and the name is whatever the product would print for that id — which is exactly
 * what a reviewer needs to be looking at. `exerciseDisplayName` is the one door, in the gallery and
 * on device alike, so the harness can no longer disagree with the app about a single word.
 *
 * This is the harness lie the gallery's own header names, closed for the copy that matters most.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import * as fs from 'fs';
import * as path from 'path';
import { EXERCISES } from '@/data/exercises';
import { MOVEMENTS } from '@/data/movements';

const GALLERY = path.join(__dirname, '..', '..', 'src/screens/dev/gallery.tsx');
const src = fs.readFileSync(GALLERY, 'utf8');

const CATALOGUE = new Set<string>([...EXERCISES.map((e) => e.id), ...MOVEMENTS.map((m) => m.id)]);

describe('1 · no fixture writes an exercise name by hand', () => {
  it('every `exerciseId` is followed by the localiser, never a string literal', () => {
    const literals = [...src.matchAll(/exerciseId:\s*'([a-z0-9_]+)',\s*name:\s*'([^']*)'/g)].map(
      (m) => `${m[1]} → "${m[2]}"`,
    );
    expect(literals).toEqual([]);
  });

  it('the localiser is actually what they call', () => {
    const routed = [...src.matchAll(/exerciseId:\s*'([a-z0-9_]+)',\s*name:\s*exerciseDisplayName\('([a-z0-9_]+)'\)/g)];
    expect(routed.length).toBeGreaterThan(40); // 51 at the time of writing; a floor, not a count
    // And it must name the SAME lift twice — a row whose id and name disagree is the old bug wearing
    // the new shape, and it would put one lift's door under another lift's name.
    expect(routed.filter((m) => m[1] !== m[2]).map((m) => `${m[1]} ≠ ${m[2]}`)).toEqual([]);
  });
});

describe('1b · nor does it smuggle one in as a parameter', () => {
  /*
   * The first sweep fixed 51 `exerciseId: … name: '…'` pairs and MISSED this shape, because the
   * name arrived as a positional argument: `liftRow('front_squat', 'Front Squat', 38.5, 34)`, which
   * the helper then interpolated into the letter's sentence as `{ ex: name }`. The Saturday letter
   * therefore drew one lift under two names two lines apart — the heading in Hebrew off
   * `exerciseDisplayName`, the sentence in English off the literal. Exactly the defect the audit
   * filed against the product, produced entirely by the harness.
   *
   * So the rule is about the VALUE, wherever it enters: an `ex` interpolation carries a localised
   * name or an id, never a hand-typed English string.
   */
  it('no explanation parameter is given a hand-typed name', () => {
    const literals = [...src.matchAll(/ex:\s*'([^']+)'/g)]
      .map((m) => m[1])
      // ids and enum values are fine — a capitalised, spaced phrase is a name someone typed.
      .filter((v) => /[A-Z]/.test(v) && /\s|-/.test(v));
    expect(literals).toEqual([]);
  });

  it('the letter fixture derives its rows from ids alone', () => {
    expect(src).toMatch(/const liftRow = \(exerciseId: string, from: number, to: number\)/);
    expect(src).not.toMatch(/liftRow\('[a-z0-9_]+',\s*'/);
  });
});

describe('1c · THE GENERAL RULE — no catalogue name appears as a literal at all', () => {
  /*
   * Three sweeps, three shapes, and the third one proved the approach wrong. First it was
   * `name: 'Barbell Bench Press'` (51 of them). Then `liftRow('front_squat', 'Front Squat', …)` — a
   * positional argument. Then `title="Bench Press"` on the Form card, plus `straightInto:`,
   * `liftName:`, `subject=`, `nextExercise: { name }` and `params: { ex }`. Chasing shapes is a game
   * the fixtures win, because a new prop is one keystroke and a new clause in a law is a whole edit.
   *
   * So the rule is about the STRING, not where it sits: no literal anywhere in the gallery may equal
   * an exercise's or a movement's catalogue name. If a fixture needs a name, it derives one from an
   * id, and a reviewer then sees the same word the athlete sees. Comments are exempt — prose about a
   * past bug is allowed to say what the bug said.
   */
  const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const CATALOGUE_NAMES = [...EXERCISES.map((e) => e.name), ...MOVEMENTS.map((m) => m.name)];

  it('not one of them survives as a hand-typed string', () => {
    const offenders = CATALOGUE_NAMES.filter(
      (n) => withoutComments.includes(`'${n}'`) || withoutComments.includes(`"${n}"`),
    );
    expect(offenders).toEqual([]);
  });

  it('and the localiser is imported so a fixture always has the honest option', () => {
    expect(src).toMatch(/import \{[^}]*exerciseDisplayName[^}]*\} from '@\/data\/exercises'/);
  });
});

describe('2 · every id in a fixture is a real one', () => {
  /*
   * A fixture id is not decoration: the row's press calls `onForm(exerciseId)` and the WHY sheet
   * calls `liftPlacement(exerciseId, …)`, both of which answer null for an unknown lift. An invented
   * id renders a row that looks complete and opens onto nothing.
   */
  it('no invented exercise ids survive anywhere in the gallery', () => {
    const used = [...src.matchAll(/exerciseId:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);
    expect([...new Set(used)].filter((id) => !CATALOGUE.has(id))).toEqual([]);
  });

  it('the ids named inside exerciseDisplayName calls are real too', () => {
    const named = [...src.matchAll(/exerciseDisplayName\('([a-z0-9_]+)'\)/g)].map((m) => m[1]);
    expect([...new Set(named)].filter((id) => !CATALOGUE.has(id))).toEqual([]);
  });
});

describe('2b · `mount()` is only ever pointed at a navigation screen', () => {
  /*
   * The visual sweep opened entry 4.2a — the import report, one of the features with NO competitor
   * equivalent — and got a red "This screen threw" page. `mount()` hands what it is given to
   * `route.params`, which is correct for a navigation screen and silently wrong for a plain
   * component: `ImportReview` is rendered inline by `ImportPlan` with direct props, so every prop
   * arrived `undefined` and `findings.length` threw on the first line of its body.
   *
   * The severity is the point. A fixture that lies about COPY shows the wrong word; a fixture that
   * lies about the PROP CHANNEL shows nothing at all, and the screen that cannot be reviewed is the
   * screen that silently rots. So the rule is structural: anything `mount()` targets must take
   * `{ navigation, route }`. Components are rendered directly, inside `<InApp>`, like `HomeView`.
   */
  const SRC_DIR = path.join(__dirname, '..', '..', 'src');

  function signatureOf(name: string): string | null {
    const stack = [SRC_DIR];
    while (stack.length) {
      const dir = stack.pop()!;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (/\.tsx?$/.test(e.name)) {
          const line = fs
            .readFileSync(p, 'utf8')
            .split('\n')
            .find((l) => l.includes(`export function ${name}(`));
          if (line) return line;
        }
      }
    }
    return null;
  }

  it('every mount() target is a screen, not a component', () => {
    const targets = [...new Set([...src.matchAll(/mount\(([A-Za-z0-9_]+)\s*,/g)].map((m) => m[1]))];
    expect(targets.length).toBeGreaterThan(5);
    const wrong = targets.filter((name) => {
      const sig = signatureOf(name);
      return sig != null && !/navigation|route/.test(sig);
    });
    expect(wrong).toEqual([]);
  });

  it('the import report is rendered directly, with its props', () => {
    expect(src).not.toMatch(/mount\(ImportReview/);
    expect(src).toMatch(/<ImportReview\b/);
  });
});

describe('2c · milestone faces are derived too', () => {
  /*
   * Third shape, same lie. The Progress fixture typed its milestone marks by hand — `caption:
   * 'WORKOUTS'`, `title: 'The 10-workout club'`, `'Squat · one plate'` — so a Hebrew Progress screen
   * drew English badges and read as a localisation defect the product does not have: every mark goes
   * through `milestoneCopy(m, t, units)` and therefore through `t('milestones.*')`.
   *
   * The name law (1c) could not see this one, because a milestone caption is not an exercise name.
   * The general lesson is the one worth keeping: a fixture may not TYPE anything the product LOOKS
   * UP. Where the product has a function that turns data into words, the harness calls that function.
   */
  it('the Progress fixture calls milestoneCopy instead of typing captions', () => {
    expect(src).toContain("import { milestoneCopy } from '@/domain/milestoneCopy'");
    const marks = src.slice(src.indexOf('marks={{'), src.indexOf('marks={{') + 900);
    expect(marks).toMatch(/milestoneCopy\(/);
    expect(marks).not.toMatch(/caption:\s*'/);
    expect(marks).not.toMatch(/title:\s*'/);
  });
});

describe('3 · the product side of the promise still holds', () => {
  it('every catalogue lift has a Hebrew name and three Hebrew cues to be shown', () => {
    const he = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src/i18n/locales/he.json'), 'utf8'));
    const missing: string[] = [];
    for (const ex of EXERCISES) {
      if (!he.exercise?.[ex.id]) missing.push(`${ex.id}: name`);
      const cues = he.cues?.[ex.id] ?? {};
      if (Object.keys(cues).length < 3) missing.push(`${ex.id}: cues ${Object.keys(cues).length}/3`);
    }
    expect(missing).toEqual([]);
  });
});
