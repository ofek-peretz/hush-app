import fs from 'fs';
import path from 'path';

/**
 * ════ THE FIVE SCREENS NOBODY COULD FIND ════
 *
 * Founder, 2026-08-01: *"look at the gallery yourself — it does not appear there at all."*
 *
 * He was right, and it was the worst possible five. The gallery index groups screens into sections
 * by an id prefix, and the section list is written by hand beside a screen list that is also
 * written by hand. §00 — THE COACH, the newest surface in the product and the entire point of the
 * AI move — had no section. All five of its screens were filtered out of the index.
 *
 * They were BUILT. They RENDERED. The only way to reach one was to already know its id and type it
 * into the URL, which is exactly how they came to be reviewed at all.
 *
 * ── WHY IT HID SO WELL ──────────────────────────────────────────────────────────────────────────
 * The header counts `GALLERY`; the list draws only what a section claims. So the page said "71 open
 * here" above a list of 66, and nobody subtracts two numbers on a page that has always looked
 * right. A missing row is invisible; only a missing row you were LOOKING for is visible.
 *
 * ── WHAT THIS HOLDS ─────────────────────────────────────────────────────────────────────────────
 * That the two hand-written lists still agree. The index itself now shows an "⚠ UNFILED" group for
 * anything unclaimed, which makes the drift loud in the UI — this makes it loud in CI, because the
 * founder finding it by accident is not a process.
 */

const ROOT = path.join(__dirname, '..', '..');
const WEB = fs.readFileSync(path.join(ROOT, 'App.web.tsx'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'screens', 'dev', 'gallery.tsx'), 'utf8');

/*
 * The ARRAY, not the file. Everything above `export const GALLERY` is fixture data for the screens
 * themselves — exercise rows, entitlements, logged sets — and plenty of it carries an `id` or a
 * `status` of its own. Reading the whole file finds twenty-one "screens" called `d0`, `4`, and a
 * `status: 'trial'` that belongs to a subscription fixture.
 */
const GALLERY = SRC.slice(SRC.indexOf('export const GALLERY'));

/**
 * Every screen id the gallery declares — TOP LEVEL of the array only.
 *
 * Exactly two spaces of indent. A gallery entry's `render` can build fixtures that carry ids of
 * their own (0.1b's chat turns are literally `{ id: '1' }` … `{ id: '4' }`), and any looser anchor
 * reports four screens called "1", "2", "3", "4" that no section will ever claim.
 */
const ids = [...GALLERY.matchAll(/^ {2}\{ id: '([^']+)'/gm)].map((m) => m[1]);

/** The section tests, read out of the index rather than re-declared here. */
const sections = [...WEB.matchAll(/\{ title: '([^']+)', test: \(g\) => ([^}]+?) \}/g)].map((m) => ({
  title: m[1],
  src: m[2].trim(),
}));

/** Run one section's predicate against an id, without importing a web entry point into jest. */
function claims(src: string, id: string): boolean {
  const startsWith = src.match(/^g\.id\.startsWith\('([^']+)'\)$/);
  if (startsWith) return id.startsWith(startsWith[1]);
  const regex = src.match(/^\/(.+)\/\.test\(g\.id\)$/);
  if (regex) return new RegExp(regex[1]).test(id);
  // The UNFILED catch-all is a closure over an array, not a predicate on the id — it claims
  // nothing by itself, which is the point: it exists to CATCH what these miss.
  return false;
}

describe('the index lists what the gallery holds', () => {
  it('finds the screens and the sections at all', () => {
    // A parser that silently matches nothing would make every assertion below vacuously true.
    expect(ids.length).toBeGreaterThan(70);
    expect(sections.length).toBeGreaterThan(4);
  });

  it('⚠️ files EVERY screen under a section — §00 was the five that got away', () => {
    const orphans = ids.filter((id) => !sections.some((s) => claims(s.src, id)));
    expect(orphans).toEqual([]);
  });

  it('keeps the coach where a person would look for it — first', () => {
    /*
     * Not cosmetic. The intake is the first conversation an athlete ever has with Hush, before a
     * single set; filing it after "OWN" would put the beginning of the product two thirds of the
     * way down the page.
     */
    expect(sections[0].title).toContain('00');
    expect(sections[0].title.toUpperCase()).toContain('COACH');
    expect(ids.filter((id) => id.startsWith('0.')).length).toBeGreaterThanOrEqual(5);
  });

  it('keeps the catch-all, because the section list will drift again', () => {
    // Two hand-maintained lists beside each other always drift. The only question is whether the
    // drift is loud. This is the thing that makes it loud without anyone adding a section for it.
    expect(WEB).toContain('UNFILED');
    expect(WEB).toMatch(/const unfiled = GALLERY\.filter/);
  });
});

describe('⚠️ the gallery holds what the PRODUCT has — the other direction', () => {
  /*
   * ════ THE BODY MAP WAS LIVE AND UNLISTED ════
   *
   * Founder, 2026-08-01: *"I really did ask you to get rid of the body map in onboarding. It does
   * not even appear in the gallery, so I don't understand how you say it suddenly appears."*
   *
   * Both halves were true, and that is the bug. `BodyMap` sat in the onboarding stack between
   * ManualInfo and CoachIntake — every new athlete walked through it — and it had no gallery entry
   * at all. He read the gallery, saw it gone, and reasonably concluded it was gone.
   *
   * The first law here checks that every GALLERY entry is listed. That is one direction. This is
   * the other, and it is the one that misleads a person: a screen the product renders and the
   * gallery does not know about is a screen nobody reviews, nobody screenshots, and everybody
   * believes was deleted.
   */
  const ROOT_SRC = fs.readFileSync(path.join(ROOT, 'src', 'app', 'Root.tsx'), 'utf8');

  it('lists every screen COMPONENT the navigators register', () => {
    const registered = [...ROOT_SRC.matchAll(/\.Screen\s+name="\w+"[^\n]*component=\{(\w+)\}/g)].map((m) => m[1]);
    const multiline = [...ROOT_SRC.matchAll(/name="\w+"\s*\n\s*component=\{(\w+)\}/g)].map((m) => m[1]);
    const all = [...new Set([...registered, ...multiline])];
    expect(all.length).toBeGreaterThan(20);

    /*
     * A component is "in the gallery" when the gallery imports it — an entry can mount it under any
     * label, and several do (`SessionFlow` alone backs a dozen states).
     *
     * The exemptions are surfaces a gallery cannot host, and each one is a reason rather than a
     * shrug: the two navigator containers are not screens, and `ShareCardModal` captures a native
     * view the web harness has no renderer for.
     */
    const CANNOT_BE_HOSTED = new Set(['HomeTabs', 'CardioTab', 'ShareCardModal']);
    /*
     * A screen may be hosted under its own name OR under its presentational half. Several screens
     * split container/View on purpose (`SharePlanScreen` renders `SharePlanView`) and the gallery
     * mounts the View with fixtures — which IS that screen, visually. Accept either.
     */
    const hosted = (c: string) =>
      new RegExp(`\\b${c}\\b`).test(SRC) ||
      new RegExp(`\\b${c.replace(/(Screen|Sheet)$/, '')}View\\b`).test(SRC);
    const missing = all.filter((c) => !CANNOT_BE_HOSTED.has(c) && !hosted(c));
    expect(missing).toEqual([]);
  });
});

describe('a status always has a mark', () => {
  it('⚠️ gives every ScreenStatus a glyph — `cancelled` printed the word "undefined"', () => {
    /*
     * The same class of bug, found in the same minute: the mark map was missing `cancelled`, so the
     * five withdrawn screens each rendered `undefined  1.6  Bring your history` in the list the
     * founder reads to decide what work is left.
     */
    const statuses = [...GALLERY.matchAll(/status: '(\w+)'/g)].map((m) => m[1]);
    expect(statuses.length).toBeGreaterThan(70);
    const markBlock = WEB.slice(WEB.indexOf('const MARK'), WEB.indexOf('\n', WEB.indexOf('const MARK')));
    for (const s of [...new Set(statuses)]) {
      expect({ status: s, marked: markBlock.includes(`${s}:`) }).toEqual({ status: s, marked: true });
    }
  });
});
