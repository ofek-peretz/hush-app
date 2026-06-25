// AsyncStorage native module is null under jest — use the package's official mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-notifications is native — no-op mock for tests. requestPermissions
// resolves "not granted" so scheduling is skipped (mirrors a denied device).
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly' },
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
  requestPermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
  scheduleNotificationAsync: async () => 'mock-id',
  cancelScheduledNotificationAsync: async () => {},
  cancelAllScheduledNotificationsAsync: async () => {},
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  addNotificationReceivedListener: () => ({ remove: () => {} }),
  getLastNotificationResponseAsync: async () => null,
}));

// @kingstinct/react-native-healthkit is native — mock so the iOS-selected
// healthKitGate loads under jest. isHealthDataAvailable() resolves false, so the
// gate reports 'unavailable' (mirrors a host without HealthKit), keeping the
// denied/unavailable path the one exercised in tests.
jest.mock('@kingstinct/react-native-healthkit', () => ({
  isHealthDataAvailableAsync: async () => false,
  isHealthDataAvailable: () => false,
  requestAuthorization: async () => false,
  getRequestStatusForAuthorization: async () => 0,
  getMostRecentQuantitySample: async () => undefined,
  AuthorizationRequestStatus: { unknown: 0, shouldRequest: 1, unnecessary: 2 },
}));

// expo-secure-store is native — in-memory mock for tests (Keychain in prod).
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: async (k) => (store.has(k) ? store.get(k) : null),
    setItemAsync: async (k, v) => void store.set(k, v),
    deleteItemAsync: async (k) => void store.delete(k),
  };
});
