/**
 * Navigation host. Onboarding (forward-only fades) vs main app, gated by whether
 * a profile exists (completeOnboarding atomically creates profile+program+mode).
 *
 * Idioms (spec §1, §7.1): full-layer Slide Left/Right; sheets present as modals;
 * Pause/Finish are modal-frozen (handled inside SessionFlow).
 *
 * NAVIGATION SHAPE (founder 2026-07-17; v7 tabs 2026-07-22). The four peer surfaces — Today ·
 * Cardio · Progress · You — live under a BOTTOM TAB navigator (`HomeTabs`), one tap from each
 * other. Everything deeper (a live workout, a run, a record, a modal) is pushed ABOVE the tabs on
 * the Main stack, so the bar is simply absent from those trees — a stage has no navigation. Cardio
 * is a launcher tab: its press opens the full-screen Cardio stage on the Main stack (so a live run
 * carries no tab bar), and History folded out of the bar into the Progress surface.
 */
// @ts-nocheck

// 

import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Linking } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HushTabBar } from './HushTabBar';
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
import type { MainParamList, HomeTabsParamList, OnboardingParamList } from './navigation';

import { Authentication } from '@/screens/onboarding/Authentication';
import { AboutYou } from '@/screens/onboarding/AboutYou';
import { BodyMap } from '@/screens/onboarding/BodyMap';
import { ConnectHealth } from '@/screens/onboarding/ConnectHealth';
import { BuildingProgramme } from '@/screens/onboarding/BuildingProgramme';
import { CoachScreen } from '@/screens/coach/CoachScreen';
import { ProgramCreated } from '@/screens/onboarding/ProgramCreated';
import { Home } from '@/screens/home/Home';
import { ProfileSheet } from '@/screens/profile/ProfileSheet';
import { SessionFlow } from '@/screens/session/SessionFlow';
import { WellDone } from '@/screens/session/WellDone';
import { History } from '@/screens/history/History';
import { WorkoutDetail } from '@/screens/history/WorkoutDetail';
import { LiftDetail } from '@/screens/progress/LiftDetail';
import { PainWhere } from '@/screens/pain/PainWhere';
import { Cardio } from '@/screens/cardio/Cardio';
import { CardioReady } from '@/screens/cardio/CardioReady';
import { CardioDetail } from '@/screens/cardio/CardioDetail';
import { Progress } from '@/screens/progress/Progress';
import { WeeklyUpdate } from '@/screens/weekly/WeeklyUpdate';
import { Paywall } from '@/screens/subscription/Paywall';
import { ShareCardModal } from '@/screens/share/ShareCardModal';
import { PreWorkoutScreen } from '@/screens/plan/PreWorkoutScreen';
import { SharePlanScreen } from '@/screens/plan/SharePlanScreen';
import { PlanReceivedScreen } from '@/screens/plan/PlanReceivedScreen';

const OnboardingStack = createNativeStackNavigator<OnboardingParamList>();
const MainStack = createNativeStackNavigator<MainParamList>();
const Tabs = createBottomTabNavigator<HomeTabsParamList>();

/** The Cardio tab's resting surface — the READY stage (handoff 3.4a), hosted INSIDE the tab so the
 *  bottom bar stays visible while at rest. "Start cardio" pushes the full-screen live stage onto the
 *  Main stack (which opens straight into the 3·2·1 countdown), so a live run carries no tab bar. */
function CardioTab() {
  return <CardioReady onBegin={() => navigateMain('CardioLive')} />;
}

/** The four peer surfaces, under the bottom bar (v7: Today · Cardio · Progress · You). Everything
 *  deeper is pushed above them. The Cardio tab shows the READY stage at rest; "Start cardio" opens
 *  the Main-stack live stage, so a live run has no tab bar in its tree. */
function HomeTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bgBase } }}
      tabBar={(props) => <HushTabBar {...props} />}
    >
      <Tabs.Screen name="Today" component={Home} />
      <Tabs.Screen name="Cardio" component={CardioTab} />
      <Tabs.Screen name="Progress" component={Progress} />
      <Tabs.Screen name="You" component={ProfileSheet} />
    </Tabs.Navigator>
  );
}

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
      {/* ⛔ TWO WHEELS LIVE ON THIS STEP NOW, so its full-screen back-drag is off (founder
          2026-07-13): a horizontal gesture over a horizontal rule is the rule losing. The step
          keeps a hand-held way back across its FOOTER, the one band with no wheel in it
          (`OnboardingScaffold.onSwipeBack`), plus the arrow that always works. */}
      <OnboardingStack.Screen
        name="AboutYou"
        component={AboutYou}
        options={{ fullScreenGestureEnabled: false }}
      />
      <OnboardingStack.Screen name="BodyMap" component={BodyMap} />
      <OnboardingStack.Screen name="ConnectHealth" component={ConnectHealth} />
      {/* BODY DATA DOES NOT SWIPE BACK (founder 2026-07-13). Its body is three horizontal wheels,
          and a full-screen horizontal back gesture over them means every attempt to set an age
          drags the STEP instead of turning the rule. The step keeps a hand-held way back — a drag
          across its footer, the one band with no wheel in it (OnboardingScaffold.onSwipeBack). */}
      {/* The body map (Rev 7) — a vertical list, so the default horizontal back-swipe is fine. */}
      {/* THE INTAKE. Swipe-back is left ON: nothing is committed until a plan lands, so returning
          to the body map is as reversible as every step before it. */}
      <OnboardingStack.Screen name="BuildingProgramme" component={BuildingProgramme} />
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
      {/* The four peer surfaces live under the tab bar; the stack pushes everything deeper ON TOP
          of them, so a workout / run / record / modal has no tab bar in its tree. */}
      <MainStack.Screen name="HomeTabs" component={HomeTabs} />
      {/* Session Flow: only pre-completion exit is Pause -> Finish, so no back gesture. */}
      {/* Home → Workout = Fade Through, 220ms (Screen 01). */}
      <MainStack.Screen name="SessionFlow" component={SessionFlow} options={{ animation: 'fade', animationDuration: 220, gestureEnabled: false }} />
      <MainStack.Screen name="WellDone" component={WellDone} options={{ animation: 'fade', gestureEnabled: false }} />
      {/* History folded out of the tab bar in v7 — it opens from the Progress surface now. */}
      <MainStack.Screen name="Coach" component={CoachScreen} />
      <MainStack.Screen name="History" component={History} />
      <MainStack.Screen name="WorkoutDetail" component={WorkoutDetail} />
      <MainStack.Screen name="LiftDetail" component={LiftDetail} />
      {/* The pre-workout card — what a day on the week board opens (founder 2026-08-05). */}
      <MainStack.Screen name="PreWorkout" component={PreWorkoutScreen} />
      <MainStack.Screen name="SharePlan" component={SharePlanScreen} />
      <MainStack.Screen name="PlanReceived" component={PlanReceivedScreen} />
      <MainStack.Screen name="PainWhere" component={PainWhere} />
      {/* The live cardio stage — full-screen focus, fades in like the session flow, and opens
          straight into the 3·2·1 countdown (the READY step now lives in the Cardio tab). A live GPS
          recording is never swipe-dismissable, so the back gesture stays off for the whole stage. */}
      <MainStack.Screen name="CardioLive" component={Cardio} options={{ animation: 'fade', animationDuration: 220, gestureEnabled: false }} />
      <MainStack.Screen name="CardioDetail" component={CardioDetail} />
      <MainStack.Screen name="WeeklyUpdate" component={WeeklyUpdate} />
      <MainStack.Screen name="Paywall" component={Paywall} options={{ presentation: 'modal', animation: sheet }} />
      {/* The share card floats over its opener as a transparent modal — the preview sits on a dim
          stage, the sheet rises from the bottom. Never part of a back-stack a gesture walks into. */}
      <MainStack.Screen
        name="ShareCardModal"
        component={ShareCardModal}
        options={{ presentation: 'transparentModal', animation: 'fade', animationDuration: 200 }}
      />
    </MainStack.Navigator>
  );
}

/** Route a tapped notification into the main stack (no-op pre-enrollment). */
function routeNotificationIntent(intent: NotificationIntent | null, enrolled: boolean): void {
  if (!intent || !enrolled) return;
  void track('notification_opened', { kind: intent.kind });
  // The weekly notification opens the Saturday letter (what changed + Why).
  if (intent.kind === 'weekly_program_ready') navigateMain('WeeklyUpdate');
  // A KILOMETRE note routes NOWHERE. It is delivered mid-run, and the run is already the screen
  // she is on — bringing the app forward is the whole of it. Navigating anywhere from here would
  // take her off her own live run to show her a fact she has just been told.

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

  /**
   * §11.5 — A SHARED PLAN ARRIVES AS A LINK. `hush://plan?p=<token>`.
   *
   * Both doors are covered: a cold start (the app was opened BY the link) and a warm one (it was
   * already running). The token is handed to the screen unread — `decodePlan` is the only thing
   * that decides whether a payload is trustworthy, and it lives there. A link that is not ours,
   * or carries no token, is ignored in silence: an unknown URL is not an error the athlete caused.
   */
  useEffect(() => {
    const open = (url: string | null) => {
      if (!url) return;
      const token = /[?&]p=([^&]+)/.exec(url)?.[1];
      if (!token || !url.includes('plan')) return;
      if (!enrolledRef.current) return; // nothing to adopt a plan INTO yet
      navigateMain('PlanReceived', { token: decodeURIComponent(token) });
    };
    void Linking.getInitialURL().then(open).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => open(e.url));
    return () => sub.remove();
  }, []);

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
