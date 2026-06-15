// AsyncStorage native module is null under jest — use the package's official mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-secure-store is native — in-memory mock for tests (Keychain in prod).
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: async (k) => (store.has(k) ? store.get(k) : null),
    setItemAsync: async (k, v) => void store.set(k, v),
    deleteItemAsync: async (k) => void store.delete(k),
  };
});
