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

// 

import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Linking, I18nManager } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HushTabBar } from './HushTabBar';
import { useApp } from '@/state/stores/appStore';
import { usePair } from '@/state/stores/pairStore';
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
import { Start } from '@/screens/onboarding/Start';
import { AboutYou } from '@/screens/onboarding/AboutYou';
import { ConnectHealth } from '@/screens/onboarding/ConnectHealth';
import { BuildingProgramme } from '@/screens/onboarding/BuildingProgramme';
import { ProgramCreated } from '@/screens/onboarding/ProgramCreated';
import { Home } from '@/screens/home/Home';
import { ProgramTab } from '@/screens/program/ProgramTab';
import { ProfileSheet } from '@/screens/profile/ProfileSheet';
import { BodyMapEdit } from '@/screens/profile/BodyMapEdit';
import { ExerciseLibrary } from '@/screens/profile/ExerciseLibrary';
import { PlanBuilder } from '@/screens/plan/PlanBuilder';
import { ImportPlan } from '@/screens/import/ImportPlan';
import { SessionFlow } from '@/screens/session/SessionFlow';
import { WellDone } from '@/screens/session/WellDone';
import { History } from '@/screens/history/History';
import { FreeLogScreen } from '@/screens/history/FreeLog';
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
import { Together } from '@/screens/together/Together';
import { PlanReceivedScreen } from '@/screens/plan/PlanReceivedScreen';

const OnboardingStack = createNativeStackNavigator<OnboardingParamList>();
const MainStack = createNativeStackNavigator<MainParamList>();
const Tabs = createBottomTabNavigator<HomeTabsParamList>();

/** The Cardio tab's resting surface — the READY stage (handoff 3.4a), hosted INSIDE the tab so the
 *  bottom bar stays visible while at rest. "Start cardio" pushes the full-screen live stage onto the
 *  Main stack (which opens straight into the 3·2·1 countdown), so a live run carries no tab bar. */
function CardioTab() {
  /* ⛔ The one bit the live stage needs — see `CardioReady`. Outdoors or a belt; walking versus
     running is measured from her pace and never asked. */
  /*
   * ⛔ THE FLAG IS PASSED EXPLICITLY, ALWAYS — including `false` (founder, 2026-08-12, asking
   * whether "Motion tracking is off" on an outdoor run would be a bug).
   *
   * It read `indoor ? { indoor: true } : undefined`, and `navigate(name, undefined)` does not CLEAR
   * a route's existing params — it goes to the route as it stands. `CardioLive` is normally popped
   * when a run ends, so the entry is usually fresh; **usually is not a guarantee**, and the failure
   * it allows is silent and exactly the one he described: a treadmill run, then an outdoor one that
   * inherits `{indoor: true}` and spends the whole run saying the motion tracker is off while a
   * satellite sits unopened.
   *
   * An explicit `false` cannot be inherited. This is a one-word fix for a bug I could not reproduce
   * and could not rule out, which is the only honest thing to do with that pair of facts.
   */
  return <CardioReady onBegin={(indoor) => navigateMain('CardioLive', { indoor })} />;
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
      <Tabs.Screen name="Program" component={ProgramTab} />
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
      {/* ⛔ THE FORK IS THE FRONT DOOR NOW (2026-09-01, audit lever 3 — the wall moved behind the
          aha). It keeps its old argument whole: what she answers here decides what the intake is
          for, and the import's read needs the whole of onboarding to finish underneath it. What
          changed is only what stood in front of it — nothing does. */}
      <OnboardingStack.Screen name="Start" component={Start} />
      {/* THE CLOSER — sign-in + consent, reached from the Ready screen's save-CTA and from
          nowhere else. Registered here because a route must exist on the stack that pushes it;
          its position in this list carries no meaning (only the first child is the initial). */}
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
      {/* ⛔ HEALTH SECOND, THE WEEK LAST (founder 2026-08-10, and 2026-08-29). The last answering
          step is the one that shapes the week, because the peak belongs beside the payoff — a
          permission ask was a fine thing to put in front of a conversation and a poor thing to put
          between her and her programme. That step was the body map; it is the builder now. */}
      <OnboardingStack.Screen name="ConnectHealth" component={ConnectHealth} />
      {/*
        ⛔ THE BUILDER IS AN INTAKE STEP (founder 2026-08-29) — the same dual registration the import
        has, for the same reason: `OnboardingStack` and `MainStack` are separate navigators, so a
        route registered only on the main one is a tap that finds nothing at runtime. One component,
        two chromes; which one it wears it reads from its own params.
      */}
      {/*
        ⛔ THE HORIZONTAL GESTURE IS OFF HERE TOO, AND IT SHOULD HAVE MOVED WITH THE WHEEL
        (found on the onboarding sweep, 2026-08-30).

        `AboutYou` has carried `fullScreenGestureEnabled: false` since 2026-07-13 for one reason,
        written down twice: *"a horizontal gesture over a horizontal rule is the rule losing"* —
        every attempt to set a value would drag the screen back instead of turning the ruler. On
        2026-08-29 the days wheel LEFT that screen and landed on this one (`AskTheCoach`), and the
        protection did not come with it. So the one control the founder has a standing instruction
        about — *"אל תיגע בפונקציונליות של הסרגלים, הם עובדים מושלם"* — spent a day sitting on the
        only intake step that pops backwards when you touch it.
      */}
      <OnboardingStack.Screen name="PlanBuilder" component={PlanBuilder} options={{ fullScreenGestureEnabled: false }} />
      {/*
        ⛔ REGISTERED IN BOTH STACKS, AND IT HAS TO BE (2026-08-11). `OnboardingStack` and
        `MainStack` are separate navigators, so the line on the body-map step could not have reached
        a route that existed only in the main one — the tap would have found nothing at runtime.
        The same component serves both; what differs is only where it goes when she keeps the week,
        which it reads from its own params.
      */}
      <OnboardingStack.Screen name="ImportPlan" component={ImportPlan} />
      {/* BODY DATA DOES NOT SWIPE BACK (founder 2026-07-13). Its body is three horizontal wheels,
          and a full-screen horizontal back gesture over them means every attempt to set an age
          drags the STEP instead of turning the rule. The step keeps a hand-held way back — a drag
          across its footer, the one band with no wheel in it (OnboardingScaffold.onSwipeBack). */}
      {/* The body map (Rev 7) — a vertical list, so the default horizontal back-swipe is fine. */}
      {/* THE INTAKE. Swipe-back is left ON: nothing is committed until a plan lands, so returning
          to the body map is as reversible as every step before it. */}
      {/*
        ⛔ AND THE BUILD STEP MEANT IT (found on the same sweep). The comment below has claimed since
        it was written that this is *"the ONE place with no way back: the program exists"* — and only
        `ProgramCreated` was actually given the option. This screen was swipe-back-able.

        On the `authored` path that is not a cosmetic gap: `saveBuiltProgram` has ALREADY written her
        week before the navigation, and the navigation is a `replace`, so `PlanBuilder` is off the
        stack — a swipe lands her on `ConnectHealth` (2/3), whose Continue builds a fresh relay with
        `daysPerWeek: 0` and re-opens the doors over a week that is already hers. The comment was
        right; the registration was not.
      */}
      <OnboardingStack.Screen
        name="BuildingProgramme"
        component={BuildingProgramme}
        options={{ gestureEnabled: false, fullScreenGestureEnabled: false }}
      />
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
      <MainStack.Screen name="BodyMapEdit" component={BodyMapEdit} />
      <MainStack.Screen name="ExerciseLibrary" component={ExerciseLibrary} />
      {/* Same wheel, same reason — see the note on the onboarding registration. */}
      <MainStack.Screen name="PlanBuilder" component={PlanBuilder} options={{ fullScreenGestureEnabled: false }} />
      <MainStack.Screen name="ImportPlan" component={ImportPlan} />
      <MainStack.Screen name="History" component={History} />
      <MainStack.Screen name="FreeLog" component={FreeLogScreen} />
      <MainStack.Screen name="WorkoutDetail" component={WorkoutDetail} />
      <MainStack.Screen name="LiftDetail" component={LiftDetail} />
      {/*
        ⛔ THE WORKOUT SHEET — IT RISES FROM THE BOTTOM (founder 2026-08-12): *"לחיצה על אימון פותחת
        MODAL שעולה מלמטה שמציגה את תוכן האימון."*

        It was a pushed screen: it slid in from the side like History or Lift detail, which is the
        grammar of GOING somewhere. This is not somewhere — it is the week opening one of its rows to
        show what is inside it, and she comes straight back. A sheet says that and a push does not.

        ⚠️ `presentation: 'modal'` IS THE PLATFORM'S OWN SHEET, not a re-implementation of one. It
        rises, it holds the screen behind it visible at the top, and it dismisses by dragging down —
        every one of those behaviours is free, native, and already what an iPhone owner expects.
        Building a custom bottom sheet would have meant owning the gesture, the spring and the
        backdrop, and getting all three slightly wrong.
      */}
      <MainStack.Screen name="PreWorkout" component={PreWorkoutScreen} options={{ presentation: 'modal' }} />
      <MainStack.Screen name="SharePlan" component={SharePlanScreen} />
      <MainStack.Screen name="Together" component={Together} />
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
  // The wrist's save receipt opens History — where the workout it announces now sits.
  if (intent.kind === 'watch_workout_saved') navigateMain('History');
  // The training-day reminder (opt-in, 2026-08-23) opens the app — Home IS the day it names, so
  // no navigation is the navigation.

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
  /* The pair, behind a ref: the link listener is subscribed ONCE for the app's lifetime, and a
     handler that closed over the first render's `pair` would join into a stale room for ever. */
  const pair = usePair();
  const pairRef = useRef(pair);
  pairRef.current = pair;
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
   * §11.5 — A SHARED PLAN ARRIVES AS A LINK — `hush://plan?p=<token>` from the landing page's
   * own button and from older builds, `https://…/plan?p=<token>` when universal links reach us
   * (the match below reads the path + param, so both forms already land here).
   *
   * Both doors are covered: a cold start (the app was opened BY the link) and a warm one (it was
   * already running). The token is handed to the screen unread — `decodePlan` is the only thing
   * that decides whether a payload is trustworthy, and it lives there. A link that is not ours,
   * or carries no token, is ignored in silence: an unknown URL is not an error the athlete caused.
   */
  useEffect(() => {
    const open = (url: string | null) => {
      if (!url) return;
      /*
       * §11.2 — A PAIR ARRIVES AS A LINK TOO. `hush://pair?c=<code>`.
       *
       * It JOINS and does not navigate anywhere loud: she tapped a message from her brother, and
       * being thrown into a screen is not what she asked for. Home notices the room on its next
       * render and opens the sheet, which is the only place a room is legible (`joinedByLink`).
       *
       * An athlete with no profile yet is skipped for the same reason a shared plan is: there is
       * nothing to train, so there is nothing to train together.
       */
      /* BOTH FORMS, and the path is matched rather than the word. `hush://pair?c=…` is what the
         landing page's own button uses and what older builds send; `https://…/pair?c=…` is the
         universal link, which is the one that reaches a phone with no app on it yet. */
      const pairCode = /[?&]c=([^&]+)/.exec(url)?.[1];
      if (pairCode && /(^hush:\/\/pair)|(\/pair(\?|$))/.test(url)) {
        if (!enrolledRef.current) return;
        void pairRef.current.join(decodeURIComponent(pairCode).toUpperCase(), true);
        // Today, because the room is only legible where the sheet is — and quietly, because she
        // tapped a message from her brother, not a button asking to be taken somewhere.
        navigateMain('HomeTabs', { screen: 'Today' });
        return;
      }
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
    /*
     * ⛔ THE DIRECTION IS DECLARED ON OUR OWN TREE, NOT INHERITED FROM THE HOST (device QA
     * 2026-08-23: Hebrew stuck on the left in the TestFlight build).
     *
     * On iOS, Yoga resolves every node's direction from the ROOT HOST VIEW, and that view is
     * created once, at process start, with whatever `I18nManager` said at that instant. The
     * language switch flips the manager and remounts THIS subtree — but a subtree remount cannot
     * recreate the host, so the resolved direction never changed and every `textAlign`/flex
     * start-end kept rendering LTR. `reload.ts`'s own note said to verify exactly this on a
     * Hebrew device; verified, and it fails.
     *
     * An explicit `direction` style on our outermost View is the fix RN itself provides: every
     * node under it resolves against IT rather than the host, and it is re-read on every render —
     * so the remount applies it, and a first launch on a Hebrew phone is right regardless of who
     * won the boot race. Read straight off `I18nManager` (not the bidi latch): render-time truth.
     */
    <View style={[styles.direction, { direction: I18nManager.isRTL ? 'rtl' : 'ltr' }]} key={reloadKey}>
    <NavigationContainer
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
    </View>
  );
}

const styles = StyleSheet.create({
  /** The direction owner — see the note on the render. Must fill the screen, or nothing under it does. */
  direction: { flex: 1 },
  canvas: { flex: 1, backgroundColor: color.bgBase },
});
