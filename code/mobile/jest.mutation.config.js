/**
 * Jest config for the MUTATION run only (stryker.conf.json points here).
 *
 * Identical to jest.config.js but for one thing: Stryker requires a green initial run before it
 * will mutate anything, and three suites currently fail to RESOLVE — they import UI and domain
 * modules that were deleted along with the AI (`screens/onboarding/BodyMap`,
 * `screens/profile/BodyMapEdit`, `domain/effort`). They contribute zero assertions, because they
 * never execute at all, so skipping them costs the mutation score nothing.
 *
 * ⛔ This is a list of things TO REBUILD, not a list of things to keep ignoring. Delete each entry
 * as its module comes back — a suite that stays here quietly stops guarding the engine.
 *
 * ── Why this still carries the jest-expo preset ──────────────────────────────────────────────────
 * A lightweight config (plain node, no preset) was tried and abandoned, and the reason is worth
 * keeping: the ENGINE is pure TypeScript, but the TESTS are not reachable without Expo. Stubbing
 * `react-native`, AsyncStorage, expo-localization and expo-constants took the failures from 62
 * suites to 49, and behind those sat expo-modules-core, expo-network, react-native-svg and
 * safe-area-context — a growing stub surface, each one a chance to fake something the engine
 * reasons about and quietly measure the stub instead of the engine.
 *
 * The memory pressure that motivated it is real (~1.4 GB per worker), but it is addressed in
 * stryker.conf.json by running fewer workers, not by faking the platform.
 */
// @ts-nocheck

const base = require('./jest.config.js');

module.exports = {
  ...base,
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/__tests__/render/bodyMapScreen.test.tsx',
    '<rootDir>/__tests__/render/bodyMapEditor.test.tsx',
    '<rootDir>/__tests__/render/howHardItWasReachesTheCoach.test.tsx',
  ],
};
