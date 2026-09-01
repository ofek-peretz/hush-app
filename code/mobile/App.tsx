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
import { PairProvider } from '@/state/stores/pairStore';
import { ToastProvider } from '@/components/ds';
import { Root } from '@/app/Root';
import { installCrashHandler, flush as flushTelemetry, track } from '@/platform/telemetry';
import { LIFECYCLE_EVENTS } from '@/platform/events';
import { loadRemoteConfig } from '@/platform/remoteConfig';
import { installCrashReporting } from '@/platform/crash';
import { color } from '@/design/tokens';
import { installGlobalFontDefault } from '@/design/typography';

installGlobalFontDefault();
installCrashReporting(); // Sentry when a DSN is configured; a silent no-op otherwise

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
    void loadRemoteConfig(); // tunables (trial length…) — cached word applies now, fresh word lands quietly
    initI18n().then(() => setI18nReady(true));
    /*
     * ════ THE HEARTBEAT, AND THE FLUSH THAT CATCHES THE ONE WHO LEAVES ════
     *
     * `app_open` fires once per cold launch (here, on mount) and once per warm return from
     * background — the event every retention curve is computed from; see LIFECYCLE_EVENTS.
     *
     * The flush runs on BOTH edges of the lifecycle, and the leaving edge is the one that was
     * missing (audit finding 2): flushing only on 'active' meant an athlete who abandoned
     * onboarding and never came back kept her funnel events on the device forever — the highest-
     * churn cohort was exactly the invisible one. 'background' is the last breath iOS reliably
     * gives us; the ship's own 10 s timeout fits inside it.
     */
    void track(LIFECYCLE_EVENTS.appOpen, { kind: 'cold' });
    let wasBackground = false;
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        if (wasBackground) void track(LIFECYCLE_EVENTS.appOpen, { kind: 'warm' });
        wasBackground = false;
        void flushTelemetry();
      } else if (st === 'background') {
        wasBackground = true;
        void flushTelemetry();
      }
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
            {/* The pair reads the live session and publishes a count — so it sits INSIDE the
                session it spectates, and outside nothing. See `state/stores/pairStore`. */}
            <PairProvider>
              <ToastProvider>
                <Root />
              </ToastProvider>
            </PairProvider>
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
