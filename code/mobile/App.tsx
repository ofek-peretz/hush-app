/**
 * App entry. Boots i18n, then renders the navigation host inside the app +
 * session providers. Dark mode only, #000000 base (spec §8.1).
 */
import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, StyleSheet, AppState } from 'react-native';
import { initI18n } from '@/i18n';
import { AppProvider } from '@/state/stores/appStore';
import { SessionProvider } from '@/state/stores/sessionStore';
import { Root } from '@/app/Root';
import { installCrashHandler, flush as flushTelemetry } from '@/platform/telemetry';
import { color } from '@/design/tokens';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    installCrashHandler(); // capture JS crashes → telemetry (observability)
    initI18n().then(() => setReady(true));
    // Ship buffered telemetry whenever the app foregrounds.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void flushTelemetry();
    });
    return () => sub.remove();
  }, []);

  if (!ready) {
    return <View style={styles.canvas} />;
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AppProvider>
          <SessionProvider>
            <Root />
          </SessionProvider>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  canvas: { flex: 1, backgroundColor: color.bgBase },
});
