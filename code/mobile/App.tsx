/**
 * App entry. Loads the three v7 voices — Assistant (interface), Frank Ruhl Libre
 * (the coach's serif), IBM Plex Mono (facts) — boots i18n, then renders the
 * navigation host inside the app + session providers.
 *
 * "All Dark · one lit stage" theme (v7, 2026-07-22): warm dark ground, light
 * status bar.
 */
import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, StyleSheet, AppState } from 'react-native';
import { useFonts } from 'expo-font';
import {
  Assistant_400Regular,
  Assistant_500Medium,
  Assistant_600SemiBold,
  Assistant_700Bold,
} from '@expo-google-fonts/assistant';
import {
  FrankRuhlLibre_400Regular,
  FrankRuhlLibre_500Medium,
  FrankRuhlLibre_700Bold,
} from '@expo-google-fonts/frank-ruhl-libre';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono';
import { initI18n } from '@/i18n';
import { AppProvider } from '@/state/stores/appStore';
import { SessionProvider } from '@/state/stores/sessionStore';
import { ToastProvider } from '@/components/ds';
import { Root } from '@/app/Root';
import { installCrashHandler, flush as flushTelemetry } from '@/platform/telemetry';
import { color } from '@/design/tokens';
import { installGlobalFontDefault } from '@/design/typography';

installGlobalFontDefault();

export default function App() {
  const [i18nReady, setI18nReady] = useState(false);
  const [fontsLoaded] = useFonts({
    // keys must match `font.*` in design/tokens.ts
    Assistant: Assistant_400Regular,
    'Assistant-Medium': Assistant_500Medium,
    'Assistant-SemiBold': Assistant_600SemiBold,
    'Assistant-Bold': Assistant_700Bold,
    FrankRuhlLibre: FrankRuhlLibre_400Regular,
    'FrankRuhlLibre-Medium': FrankRuhlLibre_500Medium,
    'FrankRuhlLibre-Bold': FrankRuhlLibre_700Bold,
    IBMPlexMono: IBMPlexMono_400Regular,
    'IBMPlexMono-Medium': IBMPlexMono_500Medium,
    'IBMPlexMono-SemiBold': IBMPlexMono_600SemiBold,
  });

  useEffect(() => {
    installCrashHandler(); // capture JS crashes → telemetry (observability)
    initI18n().then(() => setI18nReady(true));
    // Ship buffered telemetry whenever the app foregrounds.
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void flushTelemetry();
    });
    return () => sub.remove();
  }, []);

  if (!i18nReady || !fontsLoaded) {
    return <View style={styles.canvas} />;
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AppProvider>
          <SessionProvider>
            <ToastProvider>
              <Root />
            </ToastProvider>
          </SessionProvider>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  canvas: { flex: 1, backgroundColor: color.bg },
});
