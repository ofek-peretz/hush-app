/**
 * v4 engine explanation copy (I-26/27) — guards the `explain` namespace, which the
 * engine now emits as i18n keys (src/engine/v4/explain.ts). Pins the two voice
 * invariants that used to live as runtime string checks in the engine:
 *   I-27a — a reprice explanation NEVER says "fatigue" (the load is matched to
 *           demonstrated capability, not blamed on fatigue);
 *   I-27b — a reprice explanation states the SETS ARE KEPT (volume is never cut).
 * Also proves en/he parity for the namespace so a change can't drop a locale.
 */
import en from '@/i18n/locales/en.json';
import he from '@/i18n/locales/he.json';

type Tree = Record<string, unknown>;
const explainEn = (en as Tree).explain as Tree;
const explainHe = (he as Tree).explain as Tree;

function leaves(node: unknown, path: string, out: { path: string; v: string }[]): void {
  if (typeof node === 'string') {
    out.push({ path, v: node });
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, child] of Object.entries(node as Tree)) leaves(child, path ? `${path}.${k}` : k, out);
  }
}

describe('v4 explanation copy', () => {
  const enLeaves: { path: string; v: string }[] = [];
  leaves(explainEn, '', enLeaves);

  it('exists', () => {
    expect(enLeaves.length).toBeGreaterThan(0);
  });

  it('I-27a: no explanation copy says "fatigue"', () => {
    const hits = enLeaves.filter((x) => /fatigue/i.test(x.v));
    expect(hits.map((h) => `${h.path}: "${h.v}"`)).toEqual([]);
  });

  it('I-27b: reprice copy keeps the sets (never implies a volume cut)', () => {
    const reprice = explainEn.reprice as Record<string, string>;
    for (const key of ['text', 'textBw', 'action', 'actionBw']) {
      expect(reprice[key].toLowerCase()).toContain('sets');
    }
  });

  it('en/he parity — every explain key is translated', () => {
    const heLeaves: { path: string; v: string }[] = [];
    leaves(explainHe, '', heLeaves);
    expect(heLeaves.map((l) => l.path).sort()).toEqual(enLeaves.map((l) => l.path).sort());
  });
});

/**
 * ════ ONE SENTENCE (founder 2026-07-29) ════
 *
 * "Limit it to a sentence. People finishing a workout do not read scrolls."
 *
 * `text` is the form the engine's reason takes on the CLOSING screen (2.5), read standing in a gym
 * with a pulse still up — so it gets one sentence and no more. `rungOutOfReach.text` was two, the
 * first of them 30 words long, and it was the row the founder was looking at.
 *
 * The reasoning is NOT thinned to fit: the triple (`observation` / `conclusion` / `action`) is the
 * long form, opened deliberately from a WHY, and the escape hatch that sentence carried still lives
 * in `rungOutOfReach.action` word for word. One fact, one place, at the length its place can hold.
 */
describe('a reason on the closing screen is ONE sentence', () => {
  /** Sentences, counted the way a reader counts them — a full stop that ends a clause. */
  const sentences = (s: string): string[] =>
    s
      .replace(/\{\{[^}]+\}\}/g, 'X') // an interpolated lift name is not a sentence break
      .split(/(?<=[.!?])\s+/)
      .map((x) => x.trim())
      .filter(Boolean);

  for (const [tag, tree] of [['en', explainEn], ['he', explainHe]] as const) {
    it(`${tag}: every explain.*.text lands in one`, () => {
      const out: { path: string; v: string }[] = [];
      leaves(tree, '', out);
      const tooLong = out
        .filter((x) => /\.text(Bw|Variation)?$/.test(x.path))
        .filter((x) => sentences(x.v).length > 1)
        .map((x) => `${x.path} — ${sentences(x.v).length} sentences`);
      expect({ scrolls: tooLong }).toEqual({ scrolls: [] });
    });
  }

  it('…and the long form still exists, so nothing was thinned to fit', () => {
    // The F-2 escape hatch (register Rev 12) survives where the athlete goes to read the argument.
    const rung = explainEn.rungOutOfReach as Record<string, string>;
    expect(rung.action).toContain('smaller jump');
    expect(rung.observation).toBeTruthy();
    expect(rung.conclusion).toBeTruthy();
  });
});
