/**
 * Navigation host. Onboarding (forward-only fades) vs main app, gated by whether
 * a profile exists (completeOnboarding atomically creates profile+program+mode).
 *
 * Idioms (spec §1, §7.1): full-layer Slide Left/Right; sheets present as modals;
 * Pause/Finish are modal-frozen (handled inside SessionFlow). No tab bar.
 */
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useApp } from '@/state/stores/appStore';
import { useReducedMotion } from '@/platform/reducedMotion';
import { fullLayerAnimation, sheetAnimation } from './navAnimations';
import { navigationRef, navigateMain } from './navigationRef';
import {
  addNotificationDeliveryListener,
  addNotificationResponseListener,
  getInitialNotificationIntent,
  type NotificationIntent,
} from '@/platform/notifications';
import { color } from '@/design/tokens';
import type { MainParamList, OnboardingParamList } from './navigation';

import { Authentication } from '@/screens/onboarding/Authentication';
import { Consent } from '@/screens/onboarding/Consent';
import { NameEntry } from '@/screens/onboarding/NameEntry';
import { ConnectHealth } from '@/screens/onboarding/ConnectHealth';
import { ManualInfo } from '@/screens/onboarding/ManualInfo';
import { Goal } from '@/screens/onboarding/Goal';
import { Experience } from '@/screens/onboarding/Experience';
import { DaysPerWeek } from '@/screens/onboarding/DaysPerWeek';
import { ProgramCreated } from '@/screens/onboarding/ProgramCreated';
import { Home } from '@/screens/home/Home';
import { ProfileSheet } from '@/screens/profile/ProfileSheet';
import { SessionFlow } from '@/screens/session/SessionFlow';
import { WellDone } from '@/screens/session/WellDone';
import { Portrait } from '@/screens/portrait/Portrait';
import { PortraitUnlock } from '@/screens/portrait/PortraitUnlock';
import { PortraitRevisit } from '@/screens/portrait/PortraitRevisit';
import { PortraitThenNow } from '@/screens/portrait/PortraitThenNow';
import { ThresholdAlert } from '@/screens/portrait/ThresholdAlert';
import { Program } from '@/screens/program/Program';
import { ProgramDetail } from '@/screens/program/ProgramDetail';
import { History } from '@/screens/history/History';
import { WorkoutDetail } from '@/screens/history/WorkoutDetail';

const OnboardingStack = createNativeStackNavigator<OnboardingParamList>();
const MainStack = createNativeStackNavigator<MainParamList>();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: color.bgBase, card: color.bgBase, text: color.textPrimary },
};

function OnboardingNavigator() {
  return (
    <OnboardingStack.Navigator
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bgBase }, animation: 'fade', gestureEnabled: false }}
    >
      <OnboardingStack.Screen name="Authentication" component={Authentication} />
      <OnboardingStack.Screen name="Consent" component={Consent} />
      <OnboardingStack.Screen name="NameEntry" component={NameEntry} />
      <OnboardingStack.Screen name="ConnectHealth" component={ConnectHealth} />
      <OnboardingStack.Screen name="ManualInfo" component={ManualInfo} />
      <OnboardingStack.Screen name="Goal" component={Goal} />
      <OnboardingStack.Screen name="Experience" component={Experience} />
      <OnboardingStack.Screen name="DaysPerWeek" component={DaysPerWeek} />
      <OnboardingStack.Screen name="ProgramCreated" component={ProgramCreated} />
    </OnboardingStack.Navigator>
  );
}

function MainNavigator() {
  const reduced = useReducedMotion();
  const fullLayer = fullLayerAnimation(reduced);
  const sheet = sheetAnimation(reduced);
  return (
    <MainStack.Navigator
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bgBase }, animation: fullLayer }}
    >
      <MainStack.Screen name="Home" component={Home} />
      <MainStack.Screen name="ProfileSheet" component={ProfileSheet} options={{ presentation: 'modal', animation: sheet }} />
      {/* Session Flow: only pre-completion exit is Pause -> Finish, so no back gesture. */}
      {/* Home → Workout = Fade Through, 220ms (Screen 01). */}
      <MainStack.Screen name="SessionFlow" component={SessionFlow} options={{ animation: 'fade', animationDuration: 220, gestureEnabled: false }} />
      <MainStack.Screen name="WellDone" component={WellDone} options={{ animation: 'fade', gestureEnabled: false }} />
      {/* Portrait first-unlock fades in (the earned arrival, §2.7) and has no back. */}
      <MainStack.Screen name="PortraitUnlock" component={PortraitUnlock} options={{ animation: 'fade', gestureEnabled: false }} />
      <MainStack.Screen name="PortraitRevisit" component={PortraitRevisit} />
      <MainStack.Screen name="PortraitThenNow" component={PortraitThenNow} options={{ presentation: 'modal' }} />
      <MainStack.Screen name="ThresholdAlert" component={ThresholdAlert} options={{ animation: 'fade' }} />
      <MainStack.Screen name="Program" component={Program} />
      <MainStack.Screen name="ProgramDetail" component={ProgramDetail} />
      <MainStack.Screen name="History" component={History} />
      <MainStack.Screen name="Portrait" component={Portrait} />
      <MainStack.Screen name="WorkoutDetail" component={WorkoutDetail} />
    </MainStack.Navigator>
  );
}

/** Route a tapped notification into the main stack (no-op pre-enrollment). */
function routeNotificationIntent(intent: NotificationIntent | null, enrolled: boolean): void {
  if (!intent || !enrolled) return;
  if (intent.kind === 'weekly_program_ready') navigateMain('Program'); // 1.20
  else if (intent.kind === 'threshold_alert') navigateMain('ThresholdAlert'); // 1.10
}

export function Root() {
  const app = useApp();
  // Latest enrolled flag for the notification listeners (no stale closure).
  const enrolledRef = useRef(false);
  enrolledRef.current = !!app.profile;
  const coldStartRouted = useRef(false);

  // Warm taps: app already running. Route every notification response.
  useEffect(() => {
    const remove = addNotificationResponseListener((intent) =>
      routeNotificationIntent(intent, enrolledRef.current),
    );
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
      ref={navigationRef}
      theme={navTheme}
      onReady={() => {
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
