/**
 * The map module, resolved per platform. Native gets react-native-maps (Apple Maps on iOS — no
 * key, no account); web and jest get null through `maps.web.ts` / the guarded require, and the
 * caller (`CardioDetail.RouteMap`) falls back to the engraved `RouteTrace`. The split exists
 * because Metro resolves imports statically: a try/catch cannot stop the web bundle from choking
 * on a native-only module — only a platform extension can.
 */

//

let mod: typeof import('react-native-maps') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  mod = require('react-native-maps');
} catch {
  mod = null; // jest, or a build without the native module
}

export const maps = mod;
