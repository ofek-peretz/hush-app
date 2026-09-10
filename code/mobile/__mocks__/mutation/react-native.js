// @ts-nocheck
﻿const { Platform } = require('./platformShims');
module.exports = { Platform, StyleSheet: { create: (s) => s, flatten: (s) => s }, Dimensions: { get: () => ({ width: 390, height: 844 }) }, I18nManager: { isRTL: false, forceRTL: () => {} }, Appearance: { getColorScheme: () => 'light' }, NativeModules: {}, Easing: {}, Animated: {}, InteractionManager: { runAfterInteractions: (f) => f && f() } };
