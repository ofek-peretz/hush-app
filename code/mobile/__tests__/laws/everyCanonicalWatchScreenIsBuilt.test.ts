/**
 * EVERY WATCH SCREEN THE CANONICAL HTML SPECIFIES IS BUILT.
 *
 * ── Why this law exists ──────────────────────────────────────────────────────────────────────────
 * `_v7_handoff/HUSH_V7_ALL_DARK.html` is the founder's sole source of truth for what the product
 * looks like, and §05 — ON THE WRIST names every watch screen by an id (`WT1`, `WT13c`, `CR3`…).
 * The watch target is Swift: **this suite does not compile it**, no render test mounts it, and no
 * typecheck touches it. So a screen the design specifies and nobody built is invisible to every
 * other guard in this repo — which is exactly how WT7, WT13c, WT15 and CR3 stayed missing while
 * everything around them was green.
 *
 * This reads the ids out of the HTML and requires each one to be NAMED in the watch source. It
 * cannot prove a screen looks right; it proves that the screen was answered rather than forgotten,
 * and it fails the moment the founder adds a screen to the canonical document.
 *
 * A screen deliberately NOT built needs a row in `RULED_OUT` with the ruling behind it — so the gap
 * is a decision on the record, never a silence.
 */
// @ts-nocheck

// 

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const CANONICAL = path.join(ROOT, '_v7_handoff', 'HUSH_V7_ALL_DARK.html');
const WATCH_SRC = path.join(__dirname, '..', '..', 'targets', 'watch');

/** The founder's rulings that deliberately leave a canonical screen unbuilt. */
const RULED_OUT: Record<string, string> = {
  // Founder, 2026-07-28: "Don't build this screen — leave the swap as it is today." The wrist keeps
  // the ONE-TAP swap + 6 s Undo ratified in the 2026-07-12 watch review; the canonical's three-row
  // chooser is declined, because choosing between three lifts mid-rest is the deliberation the
  // one-tap swap exists to remove.
  WT11b: 'founder 2026-07-28 — one-tap swap + Undo stands; the chooser is declined',
};

/** Every screen id §05 names, in the order it draws them. */
function canonicalWatchScreenIds(): string[] {
  const html = fs.readFileSync(CANONICAL, 'utf8');
  const from = html.indexOf('data-screen-label="Watch v6"');
  const to = html.indexOf('data-screen-label="Live Activity v6"');
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  const section = html.slice(from, to);
  return [...new Set([...section.matchAll(/\b(WT\d+[a-z]?|CR\d+)\s*·/g)].map((m) => m[1]))];
}

/** Every line of the watch target, joined — the ids live in the doc comments beside their views. */
function watchSource(): string {
  return fs
    .readdirSync(WATCH_SRC)
    .filter((f) => f.endsWith('.swift'))
    .map((f) => fs.readFileSync(path.join(WATCH_SRC, f), 'utf8'))
    .join('\n');
}

describe('§05 — ON THE WRIST, screen by screen', () => {
  const ids = canonicalWatchScreenIds();
  const src = watchSource();

  it('the canonical document still names the screens this law was written against', () => {
    // Guard on the guard: if the extraction ever matches nothing, every assertion below passes
    // vacuously and the law becomes decoration.
    expect(ids.length).toBeGreaterThanOrEqual(20);
    expect(ids).toContain('WT1');
    expect(ids).toContain('WT15');
    expect(ids).toContain('CR3');
  });

  it('every screen is either built on the wrist or ruled out on the record', () => {
    const missing = ids.filter((id) => !new RegExp(`\\b${id}\\b`).test(src) && !(id in RULED_OUT));
    expect({ specifiedButNotBuilt: missing }).toEqual({ specifiedButNotBuilt: [] });
  });

  it('nothing is ruled out that the canonical document no longer asks for', () => {
    // A stale exemption is a licence to never build something nobody is asking for any more.
    const stale = Object.keys(RULED_OUT).filter((id) => !ids.includes(id));
    expect({ exemptedButUnspecified: stale }).toEqual({ exemptedButUnspecified: [] });
  });
});
