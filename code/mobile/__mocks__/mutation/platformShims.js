/**
 * Platform shims for the MUTATION run only (see jest.mutation.config.js).
 *
 * Four modules — `react-native`, AsyncStorage, expo-localization, expo-constants — are imported by
 * one shared config module and therefore reach every engine test. Loading them for real is what
 * forced the jest-expo preset, which cost ~1.4 GB per worker and starved the machine.
 *
 * ⛔ These stubs may only ever cover PLATFORM surface — a device flag, a key/value store, a locale.
 * The moment a mutation stub has to fake something the engine reasons ABOUT (a load, a rep, a set
 * count), the mutation score stops measuring the engine and starts measuring the stub.
 */
// @ts-nocheck


// `Platform.OS` is read for device branches the engine never takes; 'ios' is the shipping target.
const Platform = { OS: 'ios', select: (o) => (o && (o.ios ?? o.default)) };

// AsyncStorage, in memory. The engine's own persistence goes through `data/local/db`, which the
// tests already drive directly — this only has to not throw.
const store = new Map();
const AsyncStorage = {
  getItem: async (k) => (store.has(k) ? store.get(k) : null),
  setItem: async (k, v) => void store.set(k, String(v)),
  removeItem: async (k) => void store.delete(k),
  clear: async () => void store.clear(),
  getAllKeys: async () => [...store.keys()],
  multiGet: async (ks) => ks.map((k) => [k, store.has(k) ? store.get(k) : null]),
  multiSet: async (pairs) => void pairs.forEach(([k, v]) => store.set(k, String(v))),
  multiRemove: async (ks) => void ks.forEach((k) => store.delete(k)),
};

module.exports = { Platform, AsyncStorage, store };
