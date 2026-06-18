/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'HushWidget',
  // Leading-dot id is appended to the main app id → com.hushfitness.app.widget.
  // MUST match app.json extra.eas.build.experimental.ios.appExtensions so EAS
  // provisions credentials for the bundle id the target actually builds with.
  bundleIdentifier: '.widget',
  deploymentTarget: '16.2',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
};
