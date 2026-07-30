// AsyncStorage native module is null under jest — use the package's official mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/**
 * expo-video is native, and importing it under jest throws before a single test runs
 * ("Cannot read properties of undefined (reading 'prototype')"). It is pulled in by
 * ExerciseVideoPlayer → FormMedia → ExerciseDemo → SessionFlow, which is why no test had ever
 * been able to mount the workout screen — the one screen the athlete spends the whole session on.
 * The player is a silent looping clip with no controls and nothing to assert, so the mock is a
 * stub: the surrounding chrome, the stage and every control are real.
 */
jest.mock('expo-video', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useVideoPlayer: () => ({ loop: false, muted: false, play: () => {}, pause: () => {}, release: () => {} }),
    VideoView: (props) => React.createElement(View, props),
  };
});

/**
 * expo-task-manager / expo-location are native, and importing either throws under jest
 * ("Cannot find native module 'ExpoTaskManager'") before a test runs. They are pulled in by
 * platform/cardio/cardioLocationTask → cardioTracker → Cardio.tsx, which is why NO test had ever
 * been able to mount a cardio screen — and B.6 (the countdown legend in the wrong order and the
 * wrong gender) was sitting on one of them, unseen.
 *
 * These stubs are deliberately inert: no task is ever defined, no permission is ever granted, and
 * no fix is ever delivered. Every cardio VIEW takes its numbers as props, so the stage, the band,
 * the readouts, the pause screen and the end sheet are all real — only the GPS underneath is not.
 */
jest.mock('expo-task-manager', () => ({
  defineTask: () => {},
  isTaskDefined: () => false,
  isTaskRegisteredAsync: async () => false,
  unregisterTaskAsync: async () => {},
  unregisterAllTasksAsync: async () => {},
}));

jest.mock('expo-location', () => ({
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
  ActivityType: { Fitness: 2, OtherNavigation: 3 },
  requestForegroundPermissionsAsync: async () => ({ status: 'denied', granted: false }),
  requestBackgroundPermissionsAsync: async () => ({ status: 'denied', granted: false }),
  getForegroundPermissionsAsync: async () => ({ status: 'denied', granted: false }),
  watchPositionAsync: async () => ({ remove: () => {} }),
  getCurrentPositionAsync: async () => {
    throw new Error('no fix under jest');
  },
  startLocationUpdatesAsync: async () => {},
  stopLocationUpdatesAsync: async () => {},
  hasStartedLocationUpdatesAsync: async () => false,
}));

// expo-notifications is native — no-op mock for tests. requestPermissions
// resolves "not granted" so scheduling is skipped (mirrors a denied device).
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly', TIME_INTERVAL: 'timeInterval' },
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
