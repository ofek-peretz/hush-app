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
  // HealthKit powers the rest-screen live heart rate + active calories (a watch-side
  // HKLiveWorkoutBuilder). The companion iPhone app already has the HealthKit
  // entitlement + usage strings; the watch target declares its own below + in Info.plist.
  frameworks: ['SwiftUI', 'WatchConnectivity', 'WatchKit', 'HealthKit'],
  entitlements: {
    'com.apple.developer.healthkit': true,
  },
};
