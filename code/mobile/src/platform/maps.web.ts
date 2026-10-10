/**
 * The web half of the platform split — react-native-maps is native-only, and Metro must never even
 * try to bundle it for the browser (it fails at resolve time, not runtime). The gallery draws the
 * engraved `RouteTrace` instead, which is the same fallback jest takes.
 */

//

export const maps: typeof import('react-native-maps') | null = null;
