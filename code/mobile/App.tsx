/**
 * App entry. Loads the two type voices (Hanken Grotesk + JetBrains Mono — the
 * design's Google-Fonts substitutes), boots i18n, then renders the navigation
 * host inside the app + session providers.
 *
 * Light "instrument" theme (2026-06-21 design): warm paper base, dark status bar.
 */
import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, StyleSheet, AppState } from 'react-native';
import { useFonts } from 'expo-font';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from '@expo-google-fonts/hanken-grotesk';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono';
import { initI18n } from '@/i18n';
import { AppProvider } from '@/state/stores/appStore';
import { SessionProvider } from '@/state/stores/sessionStore';
import { Root } from '@/app/Root';
import { installCrashHandler, flush as flushTelemetry } from '@/platform/telemetry';
import { color } from '@/design/tokens';
import { installGlobalFontDefault } from '@/design/typography';

installGlobalFontDefault();

export default function App() {
  const [i18nReady, setI18nReady] = useState(false);
  const [fontsLoaded] = useFonts({
    // keys must match `font.*` in design/tokens.ts
    HankenGrotesk: HankenGrotesk_400Regular,
    'HankenGrotesk-Medium': HankenGrotesk_500Medium,
    'HankenGrotesk-SemiBold': HankenGrotesk_600SemiBold,
    'HankenGrotesk-Bold': HankenGrotesk_700Bold,
    JetBrainsMono: JetBrainsMono_400Regular,
    'JetBrainsMono-Medium': JetBrainsMono_500Medium,
    'JetBrainsMono-SemiBold': JetBrainsMono_600SemiBold,
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
        <StatusBar style="dark" />
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
  canvas: { flex: 1, backgroundColor: color.bg },
});
