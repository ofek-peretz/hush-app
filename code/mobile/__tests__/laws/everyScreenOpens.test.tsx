/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY SCREEN OPENS.
 *
 * ⛔ THE LESSON OF 2026-08-20, written down so it cannot be learned twice.
 *
 * One line in `Home.tsx` called `.map()` on a value whose declared type is `[…] | null` and whose
 * first statement is `if (!rows) return null`. It crashed the app on every launch and at the end of
 * onboarding, it cost eight TestFlight builds to find, and **3,097 tests were green the whole time**
 * — because of 44 screens in this product, not one was mounted by anything. Three suites rendered
 * `HomeView`, the presentational half with no effects; the container that holds the logic was never
 * executed outside a device.
 *
 * ── WHAT THIS SWEEP ASKS, AND WHY IT IS THE COLD CASE ───────────────────────────────────────────
 * It opens each screen the way the app can genuinely open it with nothing warmed up: inside the real
 * `AppProvider` / `SessionProvider` tree, inside a real navigator, with no route params and no
 * loaded week. That is the state after a cold start, after a restore, and behind every deep link —
 * and it is exactly the state the crash lived in. A screen that needs an id to exist is given the
 * smallest one that resolves to nothing, because "the thing you asked for is gone" is a real arrival
 * and the one nobody tests.
 *
 * ⚠️ IT ASSERTS ALMOST NOTHING ABOUT WHAT IS DRAWN, and that is deliberate. Layout, copy and colour
 * are held by their own laws and by the founder's eye; this holds the floor beneath all of them —
 * the screen renders at all. A floor is worth having precisely because it is boring.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { initI18n } from '@/i18n';
import { db } from '@/data/local/db';
import { fixtureModel } from '@/data/api/fixtureModel';
import { AppProvider } from '@/state/stores/appStore';
import { SessionProvider } from '@/state/stores/sessionStore';
import { ToastProvider } from '@/components/ds';

import { Home } from '@/screens/home/Home';
import { Cardio } from '@/screens/cardio/Cardio';
import { Progress } from '@/screens/progress/Progress';
import { ProfileSheet } from '@/screens/profile/ProfileSheet';
import { History } from '@/screens/history/History';
import { WeeklyUpdate } from '@/screens/weekly/WeeklyUpdate';
import { ExerciseLibrary } from '@/screens/profile/ExerciseLibrary';
import { BodyMapEdit } from '@/screens/profile/BodyMapEdit';
import { PainWhere } from '@/screens/pain/PainWhere';
import { Paywall } from '@/screens/subscription/Paywall';
import { ImportPlan } from '@/screens/import/ImportPlan';
import { SharePlanScreen } from '@/screens/plan/SharePlanScreen';
import { WorkoutDetail } from '@/screens/history/WorkoutDetail';
import { LiftDetail } from '@/screens/progress/LiftDetail';
import { PreWorkoutScreen } from '@/screens/plan/PreWorkoutScreen';

const METRICS = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

/**
 * The screens, and the smallest params each can legally arrive with. `undefined` is the cold case;
 * an id that resolves to nothing is the "it is gone" case, which is just as real (a wipe, an old
 * notification, a share link to a deleted week) and just as untested.
 */
/*
 * ⚠️ CONTAINERS ONLY. `WelcomeBackView`, `OnYourWristView` and the other `*View` halves are
 * presentational — they take their whole world as props and Home renders them. Mounting one with no
 * props proves nothing about the app and fails for a reason that is about the test; their own render
 * suites already drive them with fixtures. What has never been executed, and what this sweep is for,
 * is the CONTAINER: the half that reads the disk, runs the effects and decides what the view gets.
 */
const SCREENS: { name: string; C: React.ComponentType<never>; params?: unknown }[] = [
  { name: 'Home', C: Home },
  { name: 'Cardio', C: Cardio },
  { name: 'Progress', C: Progress },
  { name: 'ProfileSheet', C: ProfileSheet },
  { name: 'History', C: History },
  { name: 'WeeklyUpdate', C: WeeklyUpdate },
  { name: 'ExerciseLibrary', C: ExerciseLibrary },
  { name: 'BodyMapEdit', C: BodyMapEdit },
  { name: 'PainWhere', C: PainWhere },
  { name: 'Paywall', C: Paywall },
  { name: 'ImportPlan', C: ImportPlan },
  { name: 'SharePlan', C: SharePlanScreen },
  { name: 'WorkoutDetail', C: WorkoutDetail, params: { sessionId: 'gone' } },
  { name: 'LiftDetail', C: LiftDetail, params: { exerciseId: 'bb_bench_press' } },
  { name: 'PreWorkout', C: PreWorkoutScreen, params: { workoutId: 'gone' } },
];

jest.setTimeout(300_000);

async function open(entry: (typeof SCREENS)[number]): Promise<string | null> {
  const Stack = createNativeStackNavigator();
  let tree: renderer.ReactTestRenderer | null = null;
  try {
    await act(async () => {
      tree = renderer.create(
        React.createElement(
          SafeAreaProvider,
          { initialMetrics: METRICS },
          React.createElement(
            AppProvider,
            null,
            React.createElement(
              ToastProvider,
              null,
              React.createElement(
                SessionProvider,
                null,
                React.createElement(
                  NavigationContainer,
                  null,
                  React.createElement(
                    Stack.Navigator,
                    { screenOptions: { headerShown: false } },
                    React.createElement(Stack.Screen, {
                      name: entry.name,
                      component: entry.C,
                      initialParams: entry.params,
                    }),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    });
    // Let the boot read, the focus effects and their promises settle.
    for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); });
    return null;
  } catch (e) {
    return `${entry.name} — ${(e as Error)?.message ?? e}`;
  } finally {
    if (tree) {
      try {
        await act(async () => { (tree as renderer.ReactTestRenderer).unmount(); });
      } catch {
        /* a screen that cannot unmount is a separate defect; the mount is what this asks about */
      }
    }
  }
}

describe('every screen opens', () => {
  beforeAll(async () => {
    // The screens read copy through `tg`/`useCopy`; without this they render a language-less shell
    // and the sweep would pass on a screen no athlete could read.
    await initI18n();
  });

  /* Cleared per SCREEN inside `open` for the cold case; the warm case seeds once and keeps it. */

  it('renders cold, with nothing warmed up and nothing to show', async () => {
    /* Explicit, not inherited from test order — the warm case below seeds the same store. */
    await AsyncStorage.clear();
    expect(await db.loadProgram()).toBeNull();
    const broken: string[] = [];
    for (const entry of SCREENS) {
      const err = await open(entry);
      if (err) broken.push(err);
    }
    expect(broken).toEqual([]);
  });

  /**
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ AND WARM, WHICH IS WHERE SHE ACTUALLY LIVES.
   *
   * The sweep above opens every screen with nothing on the disk. That is a real arrival and it is
   * the rarer one: an athlete is cold for a few minutes and warm for ever after. Every screen in the
   * product spends its whole life reading a profile, a week, a history and an engine state — and
   * none of that had a single test behind it before this.
   *
   * ⚠️ THE TWO STATES BREAK DIFFERENTLY, which is the reason both are here. Cold finds the missing
   * guard: the `.map` on a null, the `[0]` of an empty list. Warm finds the opposite — the loop that
   * is fine over three sessions and pathological over thirty, the lookup that assumes the id it was
   * handed is still in the week. Yesterday's crash was reachable from both, and it took eight builds
   * partly because there was no way to ask either question off a device.
   *
   * The athlete below is deliberately ordinary: a real generated programme, a fortnight of sessions
   * against its own lifts, and an open week. Nothing exotic — if a screen cannot open for her, it
   * cannot open for anyone.
   */
  it('renders warm, for an athlete with a week and a history behind her', async () => {
    const profile = {
      sex: 'female' as const,
      units: 'kg' as const,
      weightKg: 62,
      startWeightKg: 62,
      heightCm: 168,
      age: 31,
      daysPerWeek: 4,
      repBand: '8-10' as const,
      repBandByMuscle: {},
      experience: 'beginner' as const,
      workoutMinutes: 60,
      bodyMap: { Glutes: 'emphasis' as const },
      healthConnected: false,
      memberSince: new Date('2026-06-01').toISOString(),
    };
    const program = await fixtureModel.generateProgram(profile as never);
    const days = program.days.filter((d: { isRest?: boolean }) => !d.isRest);

    // A fortnight against her own week — the sessions reference the lifts the engine chose.
    const history = [];
    for (let i = 0; i < 8; i++) {
      const day = days[i % days.length];
      const at = new Date(Date.now() - (8 - i) * 2 * 86_400_000).toISOString();
      history.push({
        id: `s-${i}`,
        programDayId: day.id,
        programDayName: day.name,
        startedAt: at,
        state: 'SAVED',
        earlyFinish: false,
        trained: true,
        sets: day.slots.slice(0, 3).flatMap((slot: { exerciseId: string }, k: number) =>
          [0, 1, 2].map((n) => ({
            exerciseId: slot.exerciseId,
            setIndex: k * 3 + n,
            recommendedWeight: 30 + k * 5,
            recommendedReps: 8,
            actualWeight: 30 + k * 5,
            actualReps: 8 + (n % 3),
            edited: false,
            persistedAt: at,
          })),
        ),
      });
    }

    for (const h of history) await db.appendCompletedSession(h as never);
    await db.saveProfile(profile as never);
    await db.saveProgram(program);
    await db.saveWeekOpen(Date.now() - 3 * 86_400_000);
    await db.saveMode({ mode: 'known', completedSessions: history.length, portrait: true } as never);

    /*
     * ⛔ THE GUARD ON THE GUARD. A seed that silently wrote nothing would leave this identical to the
     * cold sweep and just as green — the failure mode `theTestsAreTypechecked` records, where a law
     * passed for its whole life while asserting nothing.
     */
    expect(days.length).toBeGreaterThan(1);
    expect((await db.loadHistory()).length).toBe(8);
    expect((await db.loadProgram())?.days?.length).toBe(program.days.length);

    const broken: string[] = [];
    for (const entry of SCREENS) {
      // Her own ids, so the "it is gone" case above is not repeated here.
      const params =
        entry.name === 'WorkoutDetail'
          ? { sessionId: history[history.length - 1].id }
          : entry.name === 'PreWorkout'
            ? { workoutId: days[0].id }
            : entry.params;
      const err = await open({ ...entry, params });
      if (err) broken.push(err);
    }
    expect(broken).toEqual([]);
  });
});
