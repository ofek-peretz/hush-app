/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE TWO FIGURES ARE TWO BODIES, NOT ONE BODY DRAWN TWICE.
 *
 * ⛔ FOUNDER, 2026-08-21, on the first attempt: **"זה לא אישה."** Four words, and they were right.
 *
 * That attempt moved the shoulder line five units on a 200-wide box — 2.5%, under the threshold an
 * eye resolves — and deliberately left the muscles alone on the reasoning that a deltoid sits in the
 * same place on both bodies. But the muscles are most of the cream on that screen, and a six-segment
 * rectus over a square pair of pectorals reads as a man whatever the outline does. It shipped, it
 * looked identical, and it cost a TestFlight build to find out.
 *
 * ── WHY A NUMBER AND NOT AN EYE ─────────────────────────────────────────────────────────────────
 * "It reads as a woman" cannot be asserted in a test, and nothing here pretends to. What CAN be held
 * is the property that made the first attempt fail: **the difference was too small to see.** So this
 * measures the one ratio that separates the two silhouettes at a glance — waist against hip — and
 * requires a real gap, plus the sign of the thing that carries it: her shoulders are narrower than
 * her hips, and his are not.
 *
 * ⚠️ IT ALSO REQUIRES THE MUSCLES TO MOVE WITH HER. A body that narrows while its deltoids stay put
 * is the first attempt with extra steps.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { fillerFor, zonesFor } from '@/components/BodyMapFigure';

/** The extreme x of a path, at any height — enough to compare two outlines. */
const xs = (d: string): number[] =>
  (d.match(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g) ?? []).map((p) => Number(p.split(',')[0]));

/** Half-width of the torso at a height, measured off its own path. */
function halfWidthAt(d: string, yLo: number, yHi: number): number {
  const pts = (d.match(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g) ?? [])
    .map((p) => p.split(',').map(Number) as [number, number])
    .filter(([, y]) => y >= yLo && y <= yHi);
  return Math.max(...pts.map(([x]) => Math.abs(x - 100)), 0);
}

/*
 * ⚠️ THE HIP IS NOT MEASURED ON THE TORSO. The torso path ends where the legs begin, so at hip
 * height it is already tapering and reads narrow — the first draft of this file asserted against
 * that and failed on a figure that was correct. Width at a height is the widest of the torso and the
 * two legs; the arms are excluded because at hip height they are beside her, not part of her.
 */
const FILLER_IDX = { torso: 1, legL: 4, legR: 5 } as const;
const bodyAt = (sex: 'female' | 'male', yLo: number, yHi: number): number =>
  Math.max(
    ...[FILLER_IDX.torso, FILLER_IDX.legL, FILLER_IDX.legR].map((i) => halfWidthAt(fillerFor(sex)[i], yLo, yHi)),
  );

const torso = (sex: 'female' | 'male') => fillerFor(sex)[FILLER_IDX.torso];

describe('the two figures are two bodies', () => {
  it('gives her a waist, and it is not a rounding error', () => {
    const hisWaist = halfWidthAt(torso('male'), 165, 195);
    const herWaist = halfWidthAt(torso('female'), 165, 195);
    // At least a tenth narrower — below that the first attempt's failure repeats.
    expect(herWaist).toBeLessThan(hisWaist * 0.9);
  });

  /**
   * ⛔ THE SIGN THAT CARRIES IT. A narrower everything is a smaller man; what reads as a woman at a
   * glance is the shoulder line sitting INSIDE the hip line, which on his figure it never does.
   */
  it('puts her shoulders INSIDE her hips, where his tower over them', () => {
    const ratio = (sex: 'female' | 'male') => bodyAt(sex, 78, 95) / bodyAt(sex, 214, 234);
    expect(ratio('male')).toBeGreaterThan(1.3);
    /*
     * ⛔ TIGHTENED 1.15 → 0.95 ON THE DEVICE REVIEW (2026-08-23). The founder photographed her on
     * TestFlight; the old bound was satisfied at **1.021**, which is a figure whose shoulders are
     * still the wider end — a man's triangle with a waist cut into it. That is exactly what he had
     * already rejected once in four words (*"זה לא אישה"*), and the waist alone had not fixed it,
     * because an eye does not grade a waist on its own: it reads WHICH END IS WIDER, instantly, and
     * the answer was the same on both figures.
     *
     * Measured now: shoulder 42.2 · waist 26.6 · hip 46.6 → 0.906. The bound sits just above that,
     * so the triangle can never quietly invert back.
     */
    expect(ratio('female')).toBeLessThan(0.95);
  });

  /**
   * And the waist that carries it. ⚠️ HIS MEASURES EXACTLY 1.00 — his torso is straight from ribs to
   * pelvis, which is the honest fact about that drawing and not a defect: the first draft of this
   * test asserted `> 1` and failed on a correct figure. What separates them is that she HAS a waist
   * and he does not.
   */
  it('gives her a waist-to-hip a man’s figure does not have', () => {
    const whr = (sex: 'female' | 'male') => bodyAt(sex, 165, 195) / bodyAt(sex, 214, 234);
    expect(whr('male')).toBeGreaterThanOrEqual(0.98); // straight — no waist at all
    expect(whr('female')).toBeLessThan(0.70); // measured 0.571 — tightened with the hips, 2026-08-23
  });

  /**
   * ⚠️ AND THE MUSCLES TRAVEL WITH HER — the failure the first attempt actually shipped. Every zone
   * must differ, or a deltoid is floating beside an arm that moved without it.
   */
  it('moves every muscle with the body it sits on', () => {
    for (const face of ['front', 'back'] as const) {
      const his = zonesFor('male')[face];
      const hers = zonesFor('female')[face];
      expect(hers).toHaveLength(his.length);
      const unmoved = his.filter((z, i) => z.d === hers[i].d).map((z) => `${face}:${z.muscle}`);
      expect(unmoved).toEqual([]);
    }
  });

  it('narrows her rectus with her waist rather than leaving a man’s abdomen on it', () => {
    const core = (sex: 'female' | 'male') => zonesFor(sex).front.find((z) => z.muscle === 'Core')!;
    const width = (z: { hit: { w: number } }) => z.hit.w;
    expect(width(core('female'))).toBeLessThan(width(core('male')));
  });

  /** Her press targets travel too — a body you press beside is worse than one you cannot press. */
  it('carries the hit areas with the shapes', () => {
    const his = zonesFor('male').front;
    const hers = zonesFor('female').front;
    const same = his.filter((z, i) => z.hit.x === hers[i].hit.x && z.hit.w === hers[i].hit.w);
    expect(same).toEqual([]);
  });

  /**
   * ⛔ AND SHE HAS HAIR, HE DOES NOT. It is the fastest read on the figure — a head-and-hair
   * silhouette is recognised before an eye has begun comparing a shoulder to a hip.
   */
  it('gives her hair and leaves his head bare', () => {
    expect(fillerFor('female')).toHaveLength(fillerFor('male').length + 1);
    // It falls past the jaw — a crown alone reads as a hat, not as hair.
    const hair = fillerFor('female')[fillerFor('female').length - 1];
    const lowest = Math.max(
      ...(hair.match(/-?\d+(?:\.\d+)?,(-?\d+(?:\.\d+)?)/g) ?? []).map((p) => Number(p.split(',')[1])),
    );
    expect(lowest).toBeGreaterThan(90); // the head ends at 56; this reaches the shoulders
  });

  /**
   * ⚠️ AND IT IS NOT A MUSCLE. The filler is drawn dim and takes no touches — a shape that lights up
   * but cannot be chosen is a promise the screen does not keep, and hair is not something she trains.
   */
  it('keeps the hair out of the muscles', () => {
    for (const face of ['front', 'back'] as const) {
      expect(zonesFor('female')[face]).toHaveLength(zonesFor('male')[face].length);
    }
  });

  /** Nothing above changes how tall anything is — only how wide it is at each height. */
  /**
   * ⛔ THE WINGS. The first cut of the hip flare re-widthed EVERY path by the body's cross-section,
   * arms included — and the hands hang at exactly pelvis height, so at 1.58 her forearms bowed
   * outward and her hands swung into the air beside her. A hip is a cross-section of a body; an arm
   * hangs beside one. The two scales are separate now, and this is what says so: her arm must not
   * grow wider as it passes the pelvis.
   */
  it('hangs her arms straight past the pelvis instead of flaring them with it', () => {
    const armR = fillerFor('female')[3]; // FILLER order: neck, torso, armL, armR, legL, legR, …
    const atWaist = halfWidthAt(armR, 150, 185);
    const atPelvis = halfWidthAt(armR, 215, 250);
    // The fall of the arm is straight: it may taper, it may not FLARE at the hips.
    expect(atPelvis).toBeLessThanOrEqual(atWaist + 1);
  });

  /**
   * ⛔ AND HER CHEST STOPS ABOVE HER ABDOMEN. One unit of ground between the pectorals and the
   * rectus is not a gap at the size this draws — it made her torso one unbroken field of cream from
   * collarbone to pelvis, which is most of what still read as a man. The dark is the anatomy.
   */
  it('leaves ground between her chest and her abdomen', () => {
    const chest = zonesFor('female').front.find((z) => z.muscle === 'Chest')!;
    const lowestChestY = Math.max(
      ...(chest.d.match(/-?\d+(?:\.\d+)?,(-?\d+(?:\.\d+)?)/g) ?? []).map((p) => Number(p.split(',')[1])),
    );
    const core = zonesFor('female').front.find((z) => z.muscle === 'Core')!;
    /* ⚠️ ONLY THE `M` MOVES. The rectus is generated as rounded rectangles in RELATIVE commands, so
       every other number in it is a delta — reading them as heights returns nonsense (−134). */
    const highestCoreY = Math.min(
      ...[...core.d.matchAll(/M\s*-?\d+(?:\.\d+)?,(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])),
    );
    expect(highestCoreY - lowestChestY).toBeGreaterThanOrEqual(8);
  });

  it('leaves every height exactly where it was', () => {
    for (const sex of ['front', 'back'] as const) {
      const his = zonesFor('male')[sex];
      const hers = zonesFor('female')[sex];
      his.forEach((z, i) => {
        expect(hers[i].hit.y).toBe(z.hit.y);
        expect(hers[i].hit.h).toBe(z.hit.h);
      });
    }
    expect(xs(torso('female'))).toHaveLength(xs(torso('male')).length);
  });
});
