/**
 * ════ THE LOCK-SCREEN INTENTS LIVE IN TWO TARGETS (founder, 2026-09-08) ════
 *
 * A `LiveActivityIntent` is named by the widget extension (`Button(intent:)`) and PERFORMED by the
 * app — iOS runs `perform()` in the app's process. Apple's recipe is one file compiled into both
 * targets. `@bacons/apple-targets` compiles everything under `targets/widget/` into the extension;
 * this plugin adds the two files the app needs to the APP target's Sources phase:
 *
 *   · `HushLockIntents.swift` — the three intents, the App Group queue, the local projection;
 *   · `HushSessionAttributes.swift` — the activity's state, so the app-target Swift can find the
 *     running activity by its type name and update it (ActivityKit matches the attributes type by
 *     name and Codable shape, which is also why the widget copy and the pod copy are identical).
 *
 * The Expo module (`modules/hush-live-activity`) keeps its own copy of the attributes for the
 * activity it starts; the app target's copy here is a third declaration of the same shape in a
 * third Swift module. `theLockScreenIsAControl` holds all three byte-identical below the header.
 */
const { withXcodeProject, IOSConfig } = require('@expo/config-plugins');
const path = require('path');

const FILES = ['HushLockIntents.swift', 'HushSessionAttributes.swift'];

module.exports = function withLockIntents(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const groupName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    for (const file of FILES) {
      // Relative to the ios/ project directory, the way the extension's own references are made.
      const filepath = path.posix.join('..', 'targets', 'widget', file);
      const already = Object.values(project.pbxFileReferenceSection() ?? {}).some(
        (ref) => ref && typeof ref === 'object' && typeof ref.path === 'string' && ref.path.replace(/"/g, '') === filepath,
      );
      if (already) continue;
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName, project });
    }
    return cfg;
  });
};
