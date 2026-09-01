/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE LAST STEP OF ONBOARDING IS RUN, NOT ASSUMED.
 *
 * ⛔ FOUND ON A DEVICE, 2026-08-20: a FRESH install of build 52 walked all the way through
 * onboarding and died at the end of it — founder: *"ממש בסיום האונבורדינג זה קרס"*. Not a crash on
 * launch, and not a crash about stored state: the app was brand new. It crashed at the one moment
 * where `completeOnboarding` writes the profile and the engine builds her first week.
 *
 * ⚠️ AND NOTHING IN THIS SUITE HAD EVER CALLED IT. `completeOnboarding` is the single most
 * consequential function in the app — it is the only path a new athlete can take — and of 312 test
 * suites exactly one mounts `AppProvider` at all, to assert a rebuild guard. The engine sweeps run
 * `generateProgram` directly; the screens are rendered with fixtures. The seam between them, where
 * a profile becomes a persisted programme, was covered by nothing.
 *
 * So this sweeps the whole matrix a real athlete can produce — both sexes, one to six days, every
 * goal and experience, and the body maps that bracket the extremes (everything on, one muscle
 * emphasised, most of it switched off) — and requires each to finish and persist.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppProvider, useApp } from '@/state/stores/appStore';
import { SessionProvider } from '@/state/stores/sessionStore';
import { ToastProvider } from '@/components/ds';
import { Home } from '@/screens/home/Home';
import { db } from '@/data/local/db';

function Probe({ hold }: { hold: (a: any) => void }) {
  hold(useApp());
  return null;
}

async function bootFresh() {
  await AsyncStorage.clear();
  let api: any = null;
  let tree: any = null;
  await act(async () => {
    tree = renderer.create(
      React.createElement(AppProvider, null, React.createElement(Probe, { hold: (a: any) => { api = a; } })),
    );
  });
  // let the boot effect settle
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  return { api: () => api, unmount: async () => { await act(async () => { tree.unmount(); }); } };
}

const MAPS: Record<string, any> = {
  'all normal': {},
  'one emphasis': { Back: 'emphasis' },
  'two emphasis': { Back: 'emphasis', Glutes: 'emphasis' },
  'most off': { Chest: 'off', Back: 'off', Shoulders: 'off', Triceps: 'off', Biceps: 'off', Calves: 'off' },
};

const inputs = (over: any = {}) => ({
  name: 'Test',
  sex: 'female',
  heightCm: 168,
  weightKg: 62,
  age: 31,
  units: 'kg',
  goal: 'build_muscle',
  experience: 'beginner',
  daysPerWeek: 4,
  healthConnected: false,
  bodyMap: {},
  workoutMinutes: 60,
  ...over,
});

jest.setTimeout(120_000);

describe('a new athlete can finish onboarding', () => {
  it('completes and persists a programme for the plainest athlete there is', async () => {
    const h = await bootFresh();
    await act(async () => { await h.api().completeOnboarding(inputs()); });
    const program = await db.loadProgram();
    const profile = await db.loadProfile();
    expect(profile).not.toBeNull();
    expect(program).not.toBeNull();
    expect(program.days.filter((d: any) => !d.isRest).length).toBeGreaterThan(0);
    await h.unmount();
  });

  /**
   * ⛔ THE SWEEP. Every combination a real athlete can hand it — and the check is deliberately weak
   * (it finished, and it wrote a week with work in it), because the failure this exists for is not a
   * wrong number. It is the last step of onboarding not finishing at all.
   */
  it('finishes for every sex × days × goal × map an athlete can produce', async () => {
    const failures: string[] = [];
    for (const sex of ['female', 'male']) {
      for (const daysPerWeek of [1, 2, 3, 4, 5, 6]) {
        for (const goal of ['build_muscle', 'get_stronger', 'general_fitness']) {
          for (const [mapName, bodyMap] of Object.entries(MAPS)) {
            const label = `${sex} · ${daysPerWeek}d · ${goal} · ${mapName}`;
            const h = await bootFresh();
            try {
              await act(async () => {
                await h.api().completeOnboarding(inputs({ sex, daysPerWeek, goal, bodyMap }));
              });
              const p = await db.loadProgram();
              if (!p || p.days.filter((d: any) => !d.isRest).length === 0) {
                failures.push(`${label} — no programme written`);
              }
            } catch (e: any) {
              failures.push(`${label} — threw: ${e?.message ?? e}`);
            }
            await h.unmount();
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

/**
 * ⛔ AND THEN THE SCREEN SHE LANDS ON. ("ממש בסיום האונבורדינג… שלוחצים על הצג את התוכנית בום זה יוצא")
 *
 * `completeOnboarding` finishing is only half of that button. The other half is `Home` MOUNTING with
 * a programme for the first time — and Home is where the effects live: the watch lobby, the
 * standalone watch plan (which runs the engine once per remaining workout), the target prefetch, the
 * learned-rest refresh. Of 314 suites, not one mounts the Home CONTAINER; three mount `HomeView`,
 * which is the presentational half and has no effects at all.
 *
 * So the single most-travelled seam in the product — finish onboarding, land on Home — had never
 * been executed anywhere but on a device.
 */
const METRICS: any = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

const nav: any = {
  navigate: () => {}, replace: () => {}, goBack: () => {}, reset: () => {}, push: () => {},
  setOptions: () => {}, addListener: () => () => {}, isFocused: () => true, canGoBack: () => false,
};

describe('the screen she lands on after that button', () => {
  it('mounts Home with a freshly generated programme without throwing', async () => {
    await AsyncStorage.clear();
    let api: any = null;
    let tree: any = null;
    await act(async () => {
      tree = renderer.create(
        React.createElement(AppProvider, null, React.createElement(Probe, { hold: (a: any) => { api = a; } })),
      );
    });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await api.completeOnboarding(inputs({ daysPerWeek: 5 })); });
    await act(async () => { tree.unmount(); });

    // Now the app restarts into Home, exactly as the CTA leaves it.
    const Stack = createNativeStackNavigator();
    let home: any = null;
    await act(async () => {
      home = renderer.create(
        React.createElement(
          SafeAreaProvider, { initialMetrics: METRICS },
          React.createElement(
            AppProvider, null,
            React.createElement(
              ToastProvider, null,
              React.createElement(
                SessionProvider, null,
                React.createElement(
                  NavigationContainer, null,
                  React.createElement(
                    Stack.Navigator, { screenOptions: { headerShown: false } },
                    React.createElement(Stack.Screen, { name: 'Today', component: Home }),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    });
    for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); });
    expect(home).not.toBeNull();

    /*
     * ⛔ AND IT CLAIMS NOTHING ABOUT A WEEK THAT HAS NOT HAPPENED (founder, 2026-08-21, from a
     * photograph of his own Home: a moss "1 CHANGE" pill on TWO cards in WEEK 1).
     *
     * The pill counts lifts whose load the engine MOVED this week (`engine.changeLog`, entries where
     * `loadFrom !== loadTo`). For an athlete who has never trained there is nothing to have moved
     * from, so the honest number is none at all — and a badge saying the coach changed her programme
     * before she has lifted anything is the app taking credit for work it has not done, on the first
     * screen it ever shows her.
     *
     * ⚠️ IT IS NOT A CLAIM ABOUT A TRAINED ATHLETE. Once she has performed a set — or edited one,
     * which is what produced the founder's screenshot — a change is real and the pill is right to
     * say so. This pins the empty case only, which is the one no test covered.
     */
    const words = (n: any): string[] =>
      typeof n === 'string' ? [n] : Array.isArray(n) ? n.flatMap(words) : n?.children ? words(n.children) : [];
    const said = words(home.toJSON()).join(' | ').toLowerCase();
    /* ⛔ REPAIRED 2026-08-23: this regex carried RAW BACKSPACE (0x08) characters where its word
       boundaries should be — the same corruption found in theFinishIsAPosterNotAReport the same
       day — so it matched nothing and asserted nothing since it was written. */
    expect(said).not.toMatch(/\bchange(s)?\b/);

    await act(async () => { home.unmount(); });
  });
});
