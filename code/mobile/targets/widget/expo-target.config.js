/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'HushWidget',
  // Leading-dot id is appended to the main app id → com.hushfitness.app.widget.
  // MUST match app.json extra.eas.build.experimental.ios.appExtensions so EAS
  // provisions credentials for the bundle id the target actually builds with.
  bundleIdentifier: '.widget',
  // 17.0 — the lock screen is a CONTROL (founder, 2026-09-08): `Button(intent:)` in a Live Activity
  // is iOS 17. An iOS 16 phone simply gets no Live Activity; the app itself still runs there.
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit', 'AppIntents'],
  /*
   * The Today widget reads the snapshot the app writes through `group.com.hushfitness.app`.
   * Declarations restored 2026-08-24 (parked for build 58 only) — the founder creates the App
   * Group + iCloud container on the Apple Developer App IDs before the next build signs.
   */
  entitlements: { 'com.apple.security.application-groups': ['group.com.hushfitness.app'] },
};
