/**
 * ONE PLACE THAT PICKS THE CAMERA.
 *
 * The check, the review page and the product page all have to be looking at the same view, or
 * the thing being verified is not the thing being shipped. Each used to run its own elevation
 * sweep — the same loop, copy-pasted three times — which is exactly the arrangement that lets
 * them quietly drift apart the first time one of them gets a new scoring term.
 */
// @ts-nocheck

const { camera, solveCamera } = require('./core');
const { makeClearance } = require('./solids');

const EL_LO = -6, EL_HI = 30, EL_STEP = 2;

/** The best camera for a rig, machine included. */
function bestCamera(rig) {
  const clearance = makeClearance(rig);
  const all = [];
  for (let el = EL_LO; el <= EL_HI; el += EL_STEP) {
    const s = solveCamera(rig, { elevation: el, clearance });
    for (const r of s.rows) all.push({ ...r, el });
  }
  all.sort((a, b) => b.score - a.score);
  const b = all[0];
  const rows = all.filter((r) => r.el === b.el).sort((x, y) => x.az - y.az);
  return { az: b.az, el: b.el, cam: camera(b.az, b.el), metrics: b, rows, all };
}

/**
 * A SECOND VIEW. One camera can only ever show one side, and the far arm of a two-arm movement
 * spends the whole rep behind the near one. The second is simply the best-scoring camera far
 * enough round the azimuth to be answering a different question — chosen by the same score, not
 * by taste, so it is a real alternative rather than a decorative one.
 */
function secondCamera(rig, first, minGap = 34) {
  const alt = first.all.find((r) => Math.abs(r.az - first.az) >= minGap);
  if (!alt) return null;
  return { az: alt.az, el: alt.el, cam: camera(alt.az, alt.el), metrics: alt };
}

module.exports = { bestCamera, secondCamera };
