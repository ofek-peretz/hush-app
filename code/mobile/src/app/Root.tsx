/**
 * Navigation host. Onboarding (forward-only fades) vs main app, gated by whether
 * a profile exists (completeOnboarding atomically creates profile+program+mode).
 *
 * Idioms (spec §1, §7.1): full-layer Slide Left/Right; sheets present as modals;
 * Pause/Finish are modal-frozen (handled inside SessionFlow). No tab bar.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useApp } from '@/state/stores/appStore';
import { useReducedMotion } from '@/platform/reducedMotion';
import { fullLayerAnimation, sheetAnimation } from './navAnimations';
import { onReloadRequested } from './reload';
import { navigationRef, navigateMain } from './navigationRef';
import {
  addNotificationDeliveryListener,
  addNotificationResponseListener,
  consumeLastNotificationResponse,
  getInitialNotificationIntent,
  type NotificationIntent,
} from '@/platform/notifications';
import { color } from '@/design/tokens';
import { track } from '@/platform/telemetry';
import type { MainParamList, OnboardingParamList } from './navigation';

import { Authentication } from '@/screens/onboarding/Authentication';
import { NameEntry } from '@/screens/onboarding/NameEntry';
import { ConnectHealth } from '@/screens/onboarding/ConnectHealth';
import { ManualInfo } from '@/screens/onboarding/ManualInfo';
import { Training } from '@/screens/onboarding/Training';
import { BodyMap } from '@/screens/onboarding/BodyMap';
import { ProgramCreated } from '@/screens/onboarding/ProgramCreated';
import { Home } from '@/screens/home/Home';
import { ProfileSheet } from '@/screens/profile/ProfileSheet';
import { ProfileEdit } from '@/screens/profile/ProfileEdit';
import { SessionFlow } from '@/screens/session/SessionFlow';
import { WellDone } from '@/screens/session/WellDone';
import { ProgramDetail } from '@/screens/program/ProgramDetail';
import { History } from '@/screens/history/History';
import { WorkoutDetail } from '@/screens/history/WorkoutDetail';
import { Cardio } from '@/screens/cardio/Cardio';
import { CardioDetail } from '@/screens/cardio/CardioDetail';
import { Progress } from '@/screens/progress/Progress';
import { WeeklyUpdate } from '@/screens/weekly/WeeklyUpdate';
import { Paywall } from '@/screens/subscription/Paywall';

const OnboardingStack = createNativeStackNavigator<OnboardingParamList>();
const MainStack = createNativeStackNavigator<MainParamList>();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: color.bgBase, card: color.bgBase, text: color.textPrimary },
};

function OnboardingNavigator() {
  return (
    <OnboardingStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.bgBase },
        animation: 'fade',
        // ONBOARDING SWIPES BACK (founder 2026-07-12). It used to be forward-only, with the
        // arrow as the single way back — which is not how a phone works: the athlete drags from
        // the edge, nothing happens, and the app feels stuck. Every step here is reversible
        // (nothing is committed until the program is built), so the gesture is simply correct.
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      <OnboardingStack.Screen name="Authentication" component={Authentication} />
      <OnboardingStack.Screen name="NameEntry" component={NameEntry} />
      <OnboardingStack.Screen name="ConnectHealth" component={ConnectHealth} />
      {/* BODY DATA DOES NOT SWIPE BACK (founder 2026-07-13). Its body is three horizontal wheels,
          and a full-screen horizontal back gesture over them means every attempt to set an age
          drags the STEP instead of turning the rule. The step keeps a hand-held way back — a drag
          across its footer, the one band with no wheel in it (OnboardingScaffold.onSwipeBack). */}
      <OnboardingStack.Screen
        name="ManualInfo"
        component={ManualInfo}
        options={{ gestureEnabled: false, fullScreenGestureEnabled: false }}
      />
      <OnboardingStack.Screen name="Training" component={Training} />
      {/* The body map (Rev 7) — a vertical list, so the default horizontal back-swipe is fine. */}
      <OnboardingStack.Screen name="BodyMap" component={BodyMap} />
      {/* The build/ready step is the ONE place with no way back: the program exists. */}
      <OnboardingStack.Screen
        name="ProgramCreated"
        component={ProgramCreated}
        options={{ gestureEnabled: false, fullScreenGestureEnabled: false }}
      />
    </OnboardingStack.Navigator>
  );
}

function MainNavigator() {
  const reduced = useReducedMotion();
  const fullLayer = fullLayerAnimation(reduced);
  const sheet = sheetAnimation(reduced);
  return (
    <MainStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.bgBase },
        animation: fullLayer,
        // WhatsApp-style full-width back swipe (not just the screen edge). Stage screens
        // (SessionFlow / WellDone / Cardio) opt out individually via gestureEnabled:false.
        fullScreenGestureEnabled: true,
      }}
    >
      <MainStack.Screen name="Home" component={Home} />
      <MainStack.Screen name="ProfileSheet" component={ProfileSheet} options={{ presentation: 'modal', animation: sheet }} />
      <MainStack.Screen name="ProfileEdit" component={ProfileEdit} options={{ presentation: 'modal', animation: sheet }} />
      {/* Session Flow: only pre-completion exit is Pause -> Finish, so no back gesture. */}
      {/* Home → Workout = Fade Through, 220ms (Screen 01). */}
      <MainStack.Screen name="SessionFlow" component={SessionFlow} options={{ animation: 'fade', animationDuration: 220, gestureEnabled: false }} />
      <MainStack.Screen name="WellDone" component={WellDone} options={{ animation: 'fade', gestureEnabled: false }} />
      <MainStack.Screen name="ProgramDetail" component={ProgramDetail} />
      <MainStack.Screen name="History" component={History} />
      <MainStack.Screen name="WorkoutDetail" component={WorkoutDetail} />
      {/* Open training (run / walk) — full-screen focus; fades in like the session flow.
          Swipe-back is enabled on the select step only (the screen flips gestureEnabled
          per phase; a live recording is never swipe-dismissable). */}
      <MainStack.Screen name="Cardio" component={Cardio} options={{ animation: 'fade', animationDuration: 220, gestureEnabled: false }} />
      <MainStack.Screen name="CardioDetail" component={CardioDetail} />
      <MainStack.Screen name="Progress" component={Progress} />
      <MainStack.Screen name="WeeklyUpdate" component={WeeklyUpdate} />
      <MainStack.Screen name="Paywall" component={Paywall} options={{ presentation: 'modal', animation: sheet }} />
    </MainStack.Navigator>
  );
}

/** Route a tapped notification into the main stack (no-op pre-enrollment). */
function routeNotificationIntent(intent: NotificationIntent | null, enrolled: boolean): void {
  if (!intent || !enrolled) return;
  void track('notification_opened', { kind: intent.kind });
  // v4: the weekly notification opens the Weekly Update (what changed + Why).
  if (intent.kind === 'weekly_program_ready') navigateMain('WeeklyUpdate'); // 1.20 (v4 Weekly Update + Why)
  else if (intent.kind === 'quarterly_report') navigateMain('Progress', { window: 'quarter' }); // 12-week view (merged into Progress)
}

export function Root() {
  const app = useApp();
  // Latest enrolled flag for the notification listeners (no stale closure).
  const enrolledRef = useRef(false);
  enrolledRef.current = !!app.profile;
  const coldStartRouted = useRef(false);
  // A tap that arrives BEFORE the container is ready (cold start emits the response
  // event during boot, while Root still renders the empty canvas) must not be lost —
  // navigateMain would silently no-op. Stash it; onReady flushes it.
  const pendingIntentRef = useRef<NotificationIntent | null>(null);
  const routeOrStash = (intent: NotificationIntent | null) => {
    if (!intent) return;
    if (navigationRef.isReady()) routeNotificationIntent(intent, enrolledRef.current);
    else pendingIntentRef.current = intent;
  };

  // Soft reload: a language change flips I18nManager direction, then asks for a
  // remount so the new direction (RTL ⇄ LTR) applies without a process relaunch.
  // Bumping this key recreates the whole navigator subtree with the new direction.
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => onReloadRequested(() => setReloadKey((k) => k + 1)), []);

  // Warm taps: app already running. Route every notification response (or stash a
  // boot-time one until the container mounts).
  useEffect(() => {
    const remove = addNotificationResponseListener(routeOrStash);
    // Foreground deliveries → telemetry (delivered-vs-opened reconstructability).
    const removeDelivery = addNotificationDeliveryListener();
    return () => {
      remove();
      removeDelivery();
    };
  }, []);

  if (!app.booted) {
    return <View style={styles.canvas} />; // resolve-before-showing (UX §4)
  }

  return (
    <NavigationContainer
      key={reloadKey}
      ref={navigationRef}
      theme={navTheme}
      onReady={() => {
        // A tap stashed while the container was still mounting routes first.
        if (pendingIntentRef.current) {
          const intent = pendingIntentRef.current;
          pendingIntentRef.current = null;
          routeNotificationIntent(intent, enrolledRef.current);
          coldStartRouted.current = true; // the stashed tap IS the launch intent
          // …and it must be CONSUMED here too: this path skips
          // getInitialNotificationIntent, and an unconsumed native response would be
          // replayed (and re-routed) by the next manual launch.
          void consumeLastNotificationResponse();
          return;
        }
        // Cold start: the app was launched by tapping a notification. Route once,
        // after the container is mounted (so navigateMain can act).
        if (coldStartRouted.current) return;
        coldStartRouted.current = true;
        void getInitialNotificationIntent().then((intent) =>
          routeNotificationIntent(intent, enrolledRef.current),
        );
      }}
    >
      {app.profile ? <MainNavigator /> : <OnboardingNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: color.bgBase },
});
