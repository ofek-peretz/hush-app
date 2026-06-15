/**
 * Navigation host. Onboarding (forward-only fades) vs main app, gated by whether
 * a profile exists (completeOnboarding atomically creates profile+program+mode).
 *
 * Idioms (spec §1, §7.1): full-layer Slide Left/Right; sheets present as modals;
 * Pause/Finish are modal-frozen (handled inside SessionFlow). No tab bar.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useApp } from '@/state/stores/appStore';
import { useReducedMotion } from '@/platform/reducedMotion';
import { fullLayerAnimation, sheetAnimation } from './navAnimations';
import { color } from '@/design/tokens';
import type { MainParamList, OnboardingParamList } from './navigation';

import { Enrollment } from '@/screens/onboarding/Enrollment';
import { ConnectHealth } from '@/screens/onboarding/ConnectHealth';
import { Goal } from '@/screens/onboarding/Goal';
import { DaysPerWeek } from '@/screens/onboarding/DaysPerWeek';
import { AboutYou } from '@/screens/onboarding/AboutYou';
import { AboutYouBody } from '@/screens/onboarding/AboutYouBody';
import { Home } from '@/screens/home/Home';
import { ProfileSheet } from '@/screens/profile/ProfileSheet';
import { SessionFlow } from '@/screens/session/SessionFlow';
import { WellDone } from '@/screens/session/WellDone';
import { PortraitUnlock } from '@/screens/portrait/PortraitUnlock';
import { PortraitRevisit } from '@/screens/portrait/PortraitRevisit';
import { ThresholdAlert } from '@/screens/portrait/ThresholdAlert';
import { Program } from '@/screens/program/Program';
import { ProgramDetail } from '@/screens/program/ProgramDetail';
import { History } from '@/screens/history/History';
import { WorkoutDetail } from '@/screens/history/WorkoutDetail';
import { Settings } from '@/screens/settings/Settings';

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
      <OnboardingStack.Screen name="Enrollment" component={Enrollment} />
      <OnboardingStack.Screen name="ConnectHealth" component={ConnectHealth} />
      <OnboardingStack.Screen name="Goal" component={Goal} />
      <OnboardingStack.Screen name="DaysPerWeek" component={DaysPerWeek} />
      <OnboardingStack.Screen name="AboutYou" component={AboutYou} />
      <OnboardingStack.Screen name="AboutYouBody" component={AboutYouBody} />
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
      <MainStack.Screen name="SessionFlow" component={SessionFlow} options={{ gestureEnabled: false }} />
      <MainStack.Screen name="WellDone" component={WellDone} options={{ animation: 'fade', gestureEnabled: false }} />
      {/* Portrait first-unlock fades in (the earned arrival, §2.7) and has no back. */}
      <MainStack.Screen name="PortraitUnlock" component={PortraitUnlock} options={{ animation: 'fade', gestureEnabled: false }} />
      <MainStack.Screen name="PortraitRevisit" component={PortraitRevisit} />
      <MainStack.Screen name="ThresholdAlert" component={ThresholdAlert} options={{ animation: 'fade' }} />
      <MainStack.Screen name="Program" component={Program} />
      <MainStack.Screen name="ProgramDetail" component={ProgramDetail} />
      <MainStack.Screen name="History" component={History} />
      <MainStack.Screen name="WorkoutDetail" component={WorkoutDetail} />
      <MainStack.Screen name="Settings" component={Settings} />
    </MainStack.Navigator>
  );
}

export function Root() {
  const app = useApp();

  if (!app.booted) {
    return <View style={styles.canvas} />; // resolve-before-showing (UX §4)
  }

  return (
    <NavigationContainer theme={navTheme}>
      {app.profile ? <MainNavigator /> : <OnboardingNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: color.bgBase },
});
