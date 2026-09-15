/** Jest config. Domain/state modules are pure TS — tested via babel-jest. */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    /*
     * ⚠️ A HOISTING QUIRK, NOT A MISSING PACKAGE. `expo-asset` is installed nested, at
     * `node_modules/expo/node_modules/expo-asset`, so nothing resolves it from `expo-font`'s own
     * directory by ordinary node rules. Metro resolves it (that is why `expo export` builds a bundle
     * and the app runs), jest does not — so without this line the ONE test that loads `App.tsx` fails
     * for a reason that has nothing to do with the app. Cost us an hour on 2026-08-20.
     */
    '^expo-asset$': '<rootDir>/node_modules/expo/node_modules/expo-asset',
  },
  testMatch: ['<rootDir>/__tests__/**/*.test.ts', '<rootDir>/__tests__/**/*.test.tsx'],
  /* `__tests__/live` talks to the REAL coach Worker (network, a paid model call, needs `.env`
     sourced into the shell). A hand-run wire check, never part of the standing suite's promise:
       set -a; . ./.env; set +a; npx jest coachPlanReviewLive --testPathIgnorePatterns=/node_modules/ */
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/live/'],
};
