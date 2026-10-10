/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ A FRESH INTAKE DOES NOT HAND BACK A TRIAL THE PHONE HAS ALREADY USED. (2026-10-05)
 *
 * The trial's count outlives a reinstall — the Keychain ledger, the founder's own ruling against
 * *"someone doing the free workouts, not subscribing, and repeating it"* (`domain/trialLedger`,
 * `theFourteenHaveNoSideDoor`). It was read in ONE place: boot.
 *
 * `completeOnboarding` built the athlete's mode from nought. So a phone that had spent its free
 * workouts and then ran the intake again counted ZERO from the last press of the Ready screen until
 * the app was next launched: Start stood open. Delete, reinstall, answer three screens, train before
 * the app is ever relaunched — the loop the ledger exists to close, one workout at a time. It also
 * made the two screens either side of that press disagree: Ready (reading the boot's count) said
 * nothing was left, and everything after it said three were.
 *
 * Found on 2026-10-05 while walking the screens for the founder's first finding of that day — the
 * paywall that met his first Start — and it is why that walk happened in a browser and not in a law:
 * every law about the ledger read the SOURCE of the boot. This one drives the store.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

let mockLedger: number | null = null;
jest.mock('@/platform/trialLedger', () => ({
  readTrialLedger: jest.fn(async () => mockLedger),
  writeTrialLedger: jest.fn(async () => {}),
}));

import { AppProvider, useApp } from '@/state/stores/appStore';
import { __resetTrialForTest, freeSessionsRemaining, isTrainingGated } from '@/domain/entitlement';

function Probe({ hold }: { hold: (a: any) => void }) {
  hold(useApp());
  return null;
}

async function bootFresh() {
  await AsyncStorage.clear();
  let api: any = null;
  let tree: any = null;
  await act(async () => {
    tree = renderer.create(React.createElement(AppProvider, null, React.createElement(Probe, { hold: (a: any) => { api = a; } })));
  });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  return { api: () => api, unmount: async () => { await act(async () => { tree.unmount(); }); } };
}

const inputs = { sex: 'male', weightKg: 78, units: 'kg', daysPerWeek: 3, healthConnected: false };
const gated = (a: any) => isTrainingGated(a.modeState.completedSessions, a.entitlement.active, a.profile?.memberSince);

jest.setTimeout(120_000);
beforeEach(() => __resetTrialForTest());

describe('⛔ the intake does not reset the trial', () => {
  it('a phone that spent its free workouts before this install is still out of them after the intake — not only after the next launch', async () => {
    mockLedger = 14; // what the Keychain remembers across a reinstall
    const h = await bootFresh();
    // Boot already knows (this half always worked): the Ready screen reads this count.
    expect(h.api().modeState.completedSessions).toBe(14);
    expect(freeSessionsRemaining(h.api().modeState.completedSessions)).toBe(0);
    await act(async () => { await h.api().completeOnboarding(inputs); });
    // ⛔ The press that ends the intake used to take the count back to nought.
    expect(h.api().profile).not.toBeNull();
    expect(h.api().modeState.completedSessions).toBe(14);
    expect(freeSessionsRemaining(h.api().modeState.completedSessions)).toBe(0);
    expect(gated(h.api())).toBe(true); // Start is the gate it says it is
    await h.unmount();
  });

  it('…and a phone that never trained begins at nought, with all three in hand', async () => {
    mockLedger = null;
    const h = await bootFresh();
    expect(h.api().modeState.completedSessions).toBe(0);
    await act(async () => { await h.api().completeOnboarding(inputs); });
    expect(h.api().modeState.completedSessions).toBe(0);
    expect(freeSessionsRemaining(h.api().modeState.completedSessions)).toBe(3);
    expect(gated(h.api())).toBe(false);
    await h.unmount();
  });

  it('a phone part-way through its free workouts keeps exactly what it had left', async () => {
    mockLedger = 2;
    const h = await bootFresh();
    await act(async () => { await h.api().completeOnboarding(inputs); });
    expect(h.api().modeState.completedSessions).toBe(2);
    expect(freeSessionsRemaining(h.api().modeState.completedSessions)).toBe(1); // what the Ready screen promised
    expect(gated(h.api())).toBe(false);
    await h.unmount();
  });
});

/*
 * ════ AND THE OFFER MEETS HER AS SHE LANDS — ONCE (the decision the founder handed over) ════
 * *"קח אותה בעצמך רק תוודא שאתה בוחר את ההחלטה הטובה ביותר מבין כל האופציות."* The Ready screen says
 * the free workouts are spent; the screen she lands on shows the offer once, over her programme;
 * the gate on Start is unchanged (`app/intakeHandoff`). Run here on the REAL Today screen in a real
 * navigator — the seam between the two stacks is exactly the kind no source-reading law can see.
 */
describe('⛔ the offer is shown once as the intake ends on a spent phone', () => {
  const METRICS: any = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

  async function land(seen: any[]) {
    const { SafeAreaProvider } = require('react-native-safe-area-context');
    const { NavigationContainer } = require('@react-navigation/native');
    const { createNativeStackNavigator } = require('@react-navigation/native-stack');
    const { SessionProvider } = require('@/state/stores/sessionStore');
    const { ToastProvider } = require('@/components/ds');
    const { Home } = require('@/screens/home/Home');
    const Stack = createNativeStackNavigator();
    const PaywallStub = ({ route }: any) => {
      seen.push(route.params);
      return null;
    };
    let tree: any = null;
    await act(async () => {
      tree = renderer.create(
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
                    React.createElement(Stack.Screen, { name: 'Paywall', component: PaywallStub }),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    });
    for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); });
    return tree;
  }

  it('the Today screen opens the paywall once when the intake owed it — and never on an ordinary landing', async () => {
    const { intakeHandoff } = require('@/app/intakeHandoff');
    mockLedger = 14;
    const h = await bootFresh();
    await act(async () => { await h.api().completeOnboarding(inputs); });
    await h.unmount();

    // What the Ready screen's last press does on a phone with nothing left.
    intakeHandoff.owePaywall();
    const first: any[] = [];
    const a = await land(first);
    expect(first.length).toBeGreaterThan(0);
    expect(first[0]).toEqual({ source: 'intake' });
    await act(async () => { a.unmount(); });

    // The next time Today mounts — a relaunch, a tab switch — nothing is owed and nothing opens.
    const second: any[] = [];
    const b = await land(second);
    expect(second).toEqual([]);
    await act(async () => { b.unmount(); });
  });
});
