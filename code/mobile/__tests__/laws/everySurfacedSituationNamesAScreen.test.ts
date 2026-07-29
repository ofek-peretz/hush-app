/**
 * **L5, one layer out — the SURFACE agrees with the register too.**
 *
 * `everyConstantIsDeclared` binds the register's Part-6 ledger to the ENGINE. This binds the register's
 * situations, laws and ledger to the SURFACE: every `S-`/`L-`/`F-`/`B-` code a screen or component cites
 * in its own reasoning must be a code the register actually declares — and, for a situation or a ledger
 * row, one that is still LIVE, not struck through. A screen that still explains itself by a deleted
 * situation is the same failure `everyConstantIsDeclared` (4) catches in the engine: the feature was cut,
 * the prose stayed. The only legal mention of a retired code is the line that records its death.
 *
 * The residue guard is the mechanical half — robust, and it fires the day someone renames a situation out
 * from under a screen. The coverage table is the curated half: it names the handful of situations that MUST
 * have a face, and pins each to the file that wears it, so a surface silently losing its citation is caught
 * too. Together they make the register↔screen tie a thing the CI holds, not a thing a human remembers.
 */
import fs from 'fs';
import path from 'path';

const MOBILE = path.resolve(__dirname, '..', '..');
const REGISTER = path.resolve(MOBILE, '..', '..', 'docs', 'canonical', 'ENGINE_V5_SITUATION_REGISTER.md');

/** The surfaces that speak in the register's language: the screens, the shared components, and the one
 *  domain module (`bodyMapNote`) whose whole job is to say the map's S-2 / S-3 / F-4 line out loud. */
const SURFACES = [
  ...walk(path.join(MOBILE, 'src', 'screens')),
  ...walk(path.join(MOBILE, 'src', 'components')),
  path.join(MOBILE, 'src', 'domain', 'bodyMapNote.ts'),
];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  ).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
}

const register = fs.readFileSync(REGISTER, 'utf8');
const surfaceSrc = SURFACES.map((f) => ({ file: path.relative(MOBILE, f), text: fs.readFileSync(f, 'utf8') }));

/** A situation is retired when its header is struck through or carries the words that record its removal. */
const isDead = (line: string) => /~~|DELETED|REMOVED|⛔/.test(line);

/** Situations: `**S-3 · …**`. Retired = the header line says so (S-31 struck, S-60 removed entirely). */
const sitRows = [...register.matchAll(/^\*\*(S-\d+) ·.*$/gm)].map((m) => ({ tag: m[1], retired: isDead(m[0]) }));
/** Laws: `| **L7** | … |`. Laws are never retired in place — a superseded law is rewritten, not struck. */
const lawTags = [...register.matchAll(/^\|\s*\*\*(L\d+)\*\*/gm)].map((m) => m[1]);
/** The Part-6 ledger: `| **B-4** | … |`. A struck-through row (`~~`) is retired. */
const ledgerRows = [...register.matchAll(/^\|\s*\*\*([BF]-\d+)\*\*\s*\|(.*)$/gm)]
  .map((m) => ({ tag: m[1], retired: /~~/.test(m[2]) }));

const live = new Set([
  ...sitRows.filter((r) => !r.retired).map((r) => r.tag),
  ...lawTags,
  ...ledgerRows.filter((r) => !r.retired).map((r) => r.tag),
]);
const retired = new Set(
  [...sitRows.filter((r) => r.retired).map((r) => r.tag), ...ledgerRows.filter((r) => r.retired).map((r) => r.tag)]
    .filter((t) => !live.has(t)),
);
const known = new Set([...live, ...retired]);

/** Every `S-`/`L-`/`F-`/`B-` code a line cites. `\b` so "BB-33" / "OD-3" (a different scheme) don't match. */
const CODE = /\b([SLFB]-\d+)\b/g;

describe('the register and the surface speak the same language (L5, one layer out)', () => {
  it('the register really declares situations, laws and a ledger (not passing on an empty read)', () => {
    expect(sitRows.length).toBeGreaterThanOrEqual(60);
    expect(lawTags.length).toBeGreaterThanOrEqual(8);
    expect(ledgerRows.length).toBeGreaterThanOrEqual(14);
    expect(retired.has('S-31')).toBe(true); // the swap-in-edit situation, deleted by S-73
    expect(retired.has('S-60')).toBe(true); // the approach set, removed entirely (Rev 8)
    expect(live.has('S-3')).toBe(true);
  });

  it('residue guard · every code a surface cites is one the register KNOWS, and (if a situation/ledger row) LIVE', () => {
    const offences: string[] = [];
    for (const f of surfaceSrc) {
      for (const line of f.text.split('\n')) {
        for (const [, tag] of line.matchAll(CODE)) {
          if (!known.has(tag)) { offences.push(`${f.file}: cites ${tag}, which the register never declares — "${line.trim().slice(0, 70)}"`); continue; }
          // A retired code may only be named by the line that records its death.
          if (retired.has(tag) && !/retired|deleted|gone|removed|supersede|no longer/i.test(line))
            offences.push(`${f.file}: cites RETIRED ${tag} as if live — "${line.trim().slice(0, 70)}"`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  /**
   * Coverage · the situations that MUST wear a face, each pinned to the file that says its code. If a
   * surface loses its citation (a refactor drops the comment, a rename slips), this is what notices.
   */
  const coverage: Record<string, string> = {
    'S-2': 'src/domain/bodyMapNote.ts',                    // the cost of an OFF, said in one line
    'S-3': 'src/screens/home/HomeView.tsx',               // the day that cannot fit her minutes
    'S-44': 'src/screens/weekly/WeeklyUpdate.tsx',        // a muscle turned back on keeps its history
    'S-56': 'src/screens/weekly/WeeklyUpdate.tsx',        // the one "want it back?" the mirror may ask
    'S-24': 'src/screens/session/WellDone.tsx',           // "nothing changed" is a real verdict, said
    'S-45': 'src/screens/session/WellDone.tsx',           // Saturday decides nothing — it was all told already
    'S-13': 'src/screens/session/SessionFlow.tsx',        // the 2-corrections-per-exercise cap
    'S-64': 'src/screens/profile/ProfileEdit.tsx',        // the time budget is a ceiling she sets
    'S-17': 'src/screens/home/Home.tsx',                  // her learned rest rides to the wrist
    'B-1': 'src/screens/onboarding/ManualInfo.tsx',       // cold start = sex × bodyweight only
    'F-4': 'src/screens/profile/BodyMapEdit.tsx',         // the 2-mark emphasis budget, refused out loud
  };

  for (const [tag, file] of Object.entries(coverage)) {
    it(`coverage · ${tag} is a LIVE situation/row AND ${file} names it`, () => {
      expect(live.has(tag)).toBe(true);
      const entry = surfaceSrc.find((f) => f.file.split(path.sep).join('/') === file);
      expect(entry).toBeDefined();
      expect(new RegExp('\\b' + tag.replace('-', '\\-') + '\\b').test(entry!.text)).toBe(true);
    });
  }
});
