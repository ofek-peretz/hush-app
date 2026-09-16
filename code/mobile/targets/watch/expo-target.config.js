/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'watch',
  name: 'HushWatch',
  // Leading-dot id is appended to the main app id → com.hushfitness.app.watch
  // (a watch app id must be prefixed by its companion's id, which this satisfies).
  // MUST match app.json extra.eas.build.experimental.ios.appExtensions so EAS
  // provisions credentials for the bundle id the target actually builds with.
  // The companion link (WKCompanionAppBundleIdentifier = com.hushfitness.app) is in
  // targets/watch/Info.plist.
  bundleIdentifier: '.watch',
  // Placeholder AppIcon (opaque, no branding). watchOS REFUSES to install an app
  // with no AppIcon set ("This app could not be installed at this time"), so this
  // is required to install — apple-targets generates the watch icon set from it.
  // Replace with the real brand icon before TestFlight.
  icon: './icon.png',
  deploymentTarget: '10.0',
  // WidgetKit: the app asks the face to redraw after it writes the snapshot (2026-09-09).
  frameworks: ['SwiftUI', 'WatchConnectivity', 'WatchKit', 'HealthKit', 'WidgetKit'],
  // Standalone workout runtime: the watch runs its own HKWorkoutSession (background
  // execution + HealthKit workout persistence). The plugin writes these into
  // generated.entitlements AND injects them into the EAS appExtensions credentials —
  // keep the app.json watch entry's entitlements in lockstep. The HealthKit capability
  // must be enabled on the com.hushfitness.app.watch App ID for provisioning to
  // succeed (same portal toggle dance as Time-Sensitive Notifications on Build #20).
  // The App Group is how the complication reads what the app knows (design pass 2026-09-09): the
  // app writes `wrist-face.json` into the shared container, the widget extension reads it. Same
  // group id as the phone and its widget — an App Group is a team-wide identifier and the
  // container is per device, so nothing is shared across the Bluetooth link by naming it once.
  // The App Groups capability must be enabled on BOTH watch App IDs in the portal (the same
  // toggle HealthKit needed on this one) or provisioning fails.
  entitlements: {
    'com.apple.developer.healthkit': true,
    'com.apple.security.application-groups': ['group.com.hushfitness.app'],
  },
};
