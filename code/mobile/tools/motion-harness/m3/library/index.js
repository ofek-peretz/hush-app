/**
 * THE LIBRARY.
 *
 * Every rig the 3D system can draw, by catalogue id. The check runs all of them, the renderer
 * takes one by name, and nothing anywhere else needs a list of exercises.
 *
 * 123 in the catalogue. 9 here. The number that matters is not how many are done but how much a
 * new one costs — and now that the athlete and the station are shared, the answer for anything on
 * a selectorised machine is a page of parameters.
 */
// @ts-nocheck

const RIGS = [
  require('./machineChestPress'),
  require('./machineShoulderPress'),
  require('./bbOverheadPress'),
  require('./bbBenchPress'),
  require('./dbShoulderPress'),
  require('./bbRow'),
  require('./dbRow'),
  require('./latPulldown'),
  require('./pullUp'),
];

const byId = Object.fromEntries(RIGS.map((r) => [r.id, r]));

module.exports = { RIGS, byId, get: (id) => byId[id] || RIGS[0] };
