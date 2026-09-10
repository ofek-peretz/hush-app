/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  // Watch-face complication (WidgetKit, embedded in the HushWatch app) — founder
  // 2026-07-10: "I can't put the app on the watch face". This gives Hush a spot in
  // the complication picker (circular / corner / inline / rectangular + Smart
  // Stack); tapping it opens the watch app. Since 2026-09-09 it draws the Home screen's
  // first fact from the App Group snapshot the app writes — see HushComplication.swift.
  type: 'watch-widget',
  name: 'HushWatchWidget',
  // Leading-dot id is appended to the main app id → com.hushfitness.app.watch.widget
  // (a widget embedded in the watch app must be prefixed by ITS id, which this
  // satisfies). MUST match app.json extra.eas.build.experimental.ios.appExtensions
  // so EAS provisions credentials for the bundle id the target actually builds with.
  bundleIdentifier: '.watch.widget',
  deploymentTarget: '10.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
  entitlements: { 'com.apple.security.application-groups': ['group.com.hushfitness.app'] },
};
