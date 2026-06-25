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
