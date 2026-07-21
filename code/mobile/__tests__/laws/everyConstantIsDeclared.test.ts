/**
 * **L5 · CONSTANTS.** "Forbidden when a constant stands in for a fact we could measure. Allowed
 * *only* to define the shape of the product — and then **declared out loud and counted** (Part 6)."
 *
 * Every other law in the register is about a decision. L5 is about the DOCUMENT: it is the promise
 * that the ledger in Part 6 is complete and honest, and a promise nobody can keep by hand. So it is
 * kept here instead — the register and the code are read as data and made to agree on four points:
 *
 *   1. every number exported from the engine's constants file carries its ledger tag;
 *   2. every tag the code cites is a row the register actually has;
 *   3. every LIVE row of the ledger has a home in the engine — nothing is declared but unbuilt;
 *   4. every RETIRED row is GONE from the engine — the residue guard.
 *
 * (4) is the one with a body count. Rev 11 found two retired numbers still sitting in the source —
 * `RECENCY_WINDOW_DAYS` (unwired, left behind by the approach set) and `STARTING_SET_SECONDS` (a
 * second, disagreeing home for B-4). Both were the same failure: the feature was cut, the ledger row
 * was struck through, and the number stayed. This test is what makes that not happen again.
 */
import fs from 'fs';
import path from 'path';

const MOBILE = path.resolve(__dirname, '..', '..');
const REGISTER = path.resolve(MOBILE, '..', '..', 'docs', 'canonical', 'ENGINE_V5_SITUATION_REGISTER.md');
const CONSTANTS = path.join(MOBILE, 'src', 'engine', 'v5', 'constants.ts');

/** The engine and the three modules the register itself names as a declared constant's home. */
const HOMES = [
  ...walk(path.join(MOBILE, 'src', 'engine')),
  path.join(MOBILE, 'src', 'domain', 'startingLoad.ts'),
  path.join(MOBILE, 'src', 'domain', 'restPrescription.ts'),
  path.join(MOBILE, 'src', 'data', 'api', 'fixtureModel.ts'),
];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  ).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
}

const register = fs.readFileSync(REGISTER, 'utf8');
const constantsSrc = fs.readFileSync(CONSTANTS, 'utf8');
const homeSrc = HOMES.map((f) => ({ file: path.relative(MOBILE, f), text: fs.readFileSync(f, 'utf8') }));

/** The Part 6 ledger, read off the register: `| **B-3** | … |`. A struck-through cell = retired. */
const rows = [...register.matchAll(/^\|\s*\*\*([BF]-\d+)\*\*\s*\|(.*)$/gm)]
  .map((m) => ({ tag: m[1], retired: /~~/.test(m[2]) }));
const live = [...new Set(rows.filter((r) => !r.retired).map((r) => r.tag))];
const retired = [...new Set(rows.filter((r) => r.retired).map((r) => r.tag))].filter((t) => !live.includes(t));
const tagRe = (t: string) => new RegExp(t.replace('-', '\\-') + '(?![0-9])');

describe('L5 · the ledger in Part 6 is complete, and the code agrees with it', () => {
  it('the register really does declare a ledger (this test is not passing on an empty read)', () => {
    expect(live.length).toBeGreaterThanOrEqual(14);
    expect(retired.length).toBeGreaterThanOrEqual(5); // F-3/F-5/F-6/F-7/F-10, B-7
  });

  it('1 · every NUMBER exported from the engine\'s constants file carries its ledger tag', () => {
    // Read the file as blank-line-separated blocks: one doc comment plus the export(s) it covers.
    // Two exports with no blank line between them (SETS_MIN / SETS_MAX) share one tag, as they
    // should — they are one constant with two ends. A block holding no number at all (a muscle
    // order, a region map) shapes structure, not a quantity, and owes the ledger nothing.
    const untagged: string[] = [];
    for (const block of constantsSrc.split(/\n\s*\n/)) {
      const names = [...block.matchAll(/export const ([A-Z_0-9]+)/g)].map((m) => m[1]);
      if (names.length === 0) continue;
      const declarations = block.slice(block.indexOf('export const'));
      if (!/[=:,{[]\s*-?\d/.test(declarations)) continue; // no number in it
      if (!/[BF]-\d+/.test(block)) untagged.push(...names);
    }
    expect(untagged).toEqual([]);
  });

  it('2 · every tag the constants file cites is a row the register actually has', () => {
    const cited = [...new Set([...constantsSrc.matchAll(/\b([BF]-\d+)\b/g)].map((m) => m[1]))];
    const known = new Set([...live, ...retired]);
    expect(cited.filter((t) => !known.has(t))).toEqual([]);
  });

  it('3 · every LIVE ledger row has a home in the engine — nothing is declared but unbuilt', () => {
    const homeless = live.filter((t) => !homeSrc.some((f) => tagRe(t).test(f.text)));
    expect(homeless).toEqual([]);
  });

  it('4 · every RETIRED ledger row is GONE from the engine — no residue outlives the feature it served', () => {
    const survivors: string[] = [];
    for (const t of retired) {
      for (const f of homeSrc) {
        for (const line of f.text.split('\n')) {
          if (!tagRe(t).test(line)) continue;
          // The only legal mention of a retired number is the note recording that it is gone.
          if (/retired|deleted|gone|removed/i.test(line)) continue;
          survivors.push(`${t} @ ${f.file}: ${line.trim().slice(0, 80)}`);
        }
      }
    }
    expect(survivors).toEqual([]);
  });
});
