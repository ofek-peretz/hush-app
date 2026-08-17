/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A SURFACE NOTHING CAN REACH IS NOT A SURFACE.
 *
 * ⛔ FOUNDER'S LIST, 2026-08-16, item 15 — a pass over the whole app for things that claim to be
 * there and are not. It was going to be a reading. A reading finds what the reader happens to look
 * at, so it is this instead, and on the day it was written it had already found five:
 *
 *     Home passed `overBudget={false}`, a literal, to a note that could never draw
 *     …and `budgetMinutes` = a field F-15 deleted, so the note would have said "in 0 minutes"
 *     `domain/replacement` — a whole module with no importer outside its own tests
 *     `swap.title` / `swap.body` / `swap.samePattern` — copy for a sheet that did not exist
 *     `LapsedView priceLabel={null}` — against that screen's OWN promise to print her real price
 *
 * Every one is the same defect wearing different clothes: something was built, something changed,
 * and the two halves stopped meeting without anything going red.
 *
 * ── ⚠️ WHY THIS IS A RATCHET AND NOT A ZERO ─────────────────────────────────────────────────────
 * A text scan cannot see every reader. Copy reached by a computed key (`t(\`muscle.${m}\`)`), copy a
 * helper assembles, copy the Swift watch app resolves through `watchCopyPack` — all of them look
 * orphaned from here and are not. So the honest instrument is a COUNT that may only fall, plus the
 * anti-rot guard this repo puts under every ratchet: get it well below the ceiling and the ceiling
 * must come down to meet it, or the number stops meaning anything.
 *
 * ⚠️ AND IT IS DELIBERATELY NOT A LIST OF NAMES. Pinning names would make this a chore that grows;
 * pinning the count makes it a budget that shrinks.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const rel = (f: string) => f.replace(/\\/g, '/').split('/src/')[1];
/** The dev gallery renders everything on purpose — it proves nothing about what SHIPS. */
const files = globSync('**/*.{ts,tsx}', { cwd: SRC, absolute: true }).filter((f) => !rel(f).startsWith('screens/dev/'));
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const corpus = files.map((f) => strip(fs.readFileSync(f, 'utf8'))).join('\n');

/** Every leaf key in the copy table, with the forms i18next resolves from a base key removed. */
function copyKeys(): string[] {
  const en = JSON.parse(fs.readFileSync(path.join(SRC, 'i18n/locales/en.json'), 'utf8'));
  const out: string[] = [];
  const walk = (o: Record<string, unknown>, p: string) => {
    for (const k of Object.keys(o)) {
      // `x_female` (gender.ts) and the plural suffixes are resolved from `x`, never asked for by name.
      if (/_(female|one|other|zero|two|few|many)$/.test(k)) continue;
      const v = o[k];
      if (v && typeof v === 'object') walk(v as Record<string, unknown>, `${p}${k}.`);
      else out.push(`${p}${k}`);
    }
  };
  walk(en, '');
  return out;
}

/**
 * Is anything at all asking for this key?
 *
 * Deliberately generous: the whole key, or its LEAF under a computed prefix. A stricter reader would
 * report keys that are perfectly alive, and a law that cries wolf gets a ceiling raised to silence it.
 */
function hasReader(key: string): boolean {
  const leaf = key.split('.').pop()!;
  return corpus.includes(`'${key}'`) || corpus.includes(`"${key}"`) || corpus.includes(`\`${key}\``)
    || corpus.includes(`'${leaf}'`) || corpus.includes(`${leaf}\``) || corpus.includes(`.${leaf}`);
}

const keys = copyKeys();
/** `watch.*` is resolved by `watchCopyPack` into the Swift app; `watchCopyPack.test.ts` binds it. */
const orphaned = keys.filter((k) => !k.startsWith('watch.') && !hasReader(k));

describe('⛔ copy nothing renders', () => {
  it('the scan really read the copy table (this is not passing on an empty file)', () => {
    expect(keys.length).toBeGreaterThan(900);
  });

  /*
   * ⛔ MEASURED 2026-08-16: 248 of 1179, after deleting three namespaces that were dead in FULL —
   * `coach.*` (15 keys, the conversation screens removed on 2026-08-12), `gated.*` (3) and
   * `transition.*` (2). Whole-namespace death is the safe deletion: every key at zero references and
   * no dynamic construction anywhere, so there is nothing for the scan to be blind about. The mixed
   * namespaces below it (`ob.` 67 of 141, `cardio.` 24 of 77, …) are features that still EXIST with
   * stale keys inside them, and picking those off one at a time is where a text scan starts guessing.
   *
   * The number may only go DOWN. It is high, and that is the finding: roughly a quarter of the
   * strings in the product have no reader this scan can see. Some fraction is the scan's blindness
   * (computed keys, helpers); the rest is copy for screens that changed shape underneath it.
   */
  const CEILING = 248;

  it('⛔ RATCHET · no more copy without a reader than the day this was measured', () => {
    // eslint-disable-next-line no-console
    console.log(`ORPHANED COPY = ${orphaned.length} of ${keys.length} (ceiling ${CEILING})`);
    expect({ sample: orphaned.slice(0, 8), within: orphaned.length <= CEILING })
      .toEqual({ sample: orphaned.slice(0, 8), within: true });
  });

  it('⛔ …and the ratchet may not go slack — clear it by a quarter and it must come down', () => {
    expect({ slack: orphaned.length < CEILING * 0.75, actual: orphaned.length, ceiling: CEILING })
      .toEqual({ slack: false, actual: orphaned.length, ceiling: CEILING });
  });

  it('⛔ the deleted conversation took its words with it', () => {
    // The specific case this law was written on: a feature is out when its copy is out too.
    expect(keys.filter((k) => k.startsWith('coach.'))).toEqual([]);
  });
});

/**
 * ⛔ A PROP PINNED TO A LITERAL IS A BRANCH THAT CANNOT RUN.
 *
 * `overBudget={false}` and `priceLabel={null}` were both this: a component with a real branch, and a
 * caller that had quietly decided the branch would never be taken. Neither showed up in a typecheck,
 * a test, or a screenshot — the code reads as wired.
 *
 * Scoped to OUR components (a capitalised tag) and to props we author, because `bounces={false}` on
 * a ScrollView is an instruction, not a dead branch.
 */
const RN_PROP = /^(shows[A-Z]\w*|bounces|autoCorrect|autoCapitalize|scrollEnabled|pointerEvents|animated|editable|multiline|secureTextEntry|adjustsFontSizeToFit|allowFontScaling|numberOfLines|disabled|collapsable|accessible|focusable|transparent|visible|nativeControls|hitSlop|keyboardShouldPersistTaps|horizontal|inverted|pagingEnabled|scrollEventThrottle)$/;
/** Layout and geometry values that are legitimately zero — a design token, not a decision. */
const GEOMETRY = /^(track|order|min|max|x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|offset|stopOpacity|opacity|strokeWidth|index|delay|size|gap|inset|top|left|right|bottom)$/;

function pinnedProps(): string[] {
  const out: string[] = [];
  for (const f of files) {
    const code = strip(fs.readFileSync(f, 'utf8'));
    for (const el of code.matchAll(/<([A-Z]\w+)([^>]*?)\/?>/gs)) {
      for (const p of el[2].matchAll(/(\w+)=\{(false|0|null|''|"")\}/g)) {
        if (RN_PROP.test(p[1]) || GEOMETRY.test(p[1])) continue;
        out.push(`${rel(f)}  <${el[1]} ${p[1]}={${p[2]}}`);
      }
    }
  }
  return out;
}

describe('⛔ props pinned to a literal', () => {
  /*
   * ⛔ MEASURED 2026-08-16: ONE remains, and it is not a dead branch.
   *
   * `<BodyMapFigure selected={null}` on the profile page — the figure there is a DISPLAY of her map,
   * not an editor, so no muscle is open. Null is the true value, not a decision deferred.
   *
   * The other two found on the day were deleted rather than pinned, because pinning residue is how a
   * ratchet becomes a to-do list nobody reads:
   *   · `<ProgressReportView milestones={null}` — the milestone gallery went on 2026-08-04 BECAUSE
   *     this prop was already null, and the interface was "kept so the call sites still typecheck",
   *     which left a handle on a deleted feature for someone to grab.
   *   · `<HomeView muscles={''}` — declared in `HomeViewProps` and never read there; the coach names
   *     its own sessions and does not state muscle groups.
   */
  const CEILING = 1;

  it('⛔ RATCHET · no more literal-pinned props than the day this was measured', () => {
    const found = pinnedProps();
    expect({ found, within: found.length <= CEILING }).toEqual({ found, within: true });
  });
});
