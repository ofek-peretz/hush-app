/**
 * Rest-haptics backstop (Build #19, regression #3).
 *
 * The 7s warning + rest-over cue must reach a LOCKED/BACKGROUNDED phone (JS timers
 * suspend, so Core Haptics can't). These tests pin the OS-notification backstop: the
 * ownership gate (watch active → phone stands down), the exact schedule (warning at
 * end−7s, complete at end), the sub-second guard, and idempotent re-arm/disarm.
 */
// @ts-nocheck

// 


// File-level mocks (jest hoists these above the import). Only `mock*`-prefixed vars may
// be referenced inside a factory.
const mockScheduled: Array<{ identifier: string; content: { data?: { kind?: string }; sound?: boolean; interruptionLevel?: string }; trigger: { seconds?: number } }> = [];
const mockCanceled: string[] = [];
const mockState = { reachable: false, granted: true, liveActivity: false };

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly', TIME_INTERVAL: 'timeInterval' },
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => ({ granted: mockState.granted, canAskAgain: true }),
  requestPermissionsAsync: async () => ({ granted: mockState.granted, canAskAgain: true }),
  scheduleNotificationAsync: async (req: (typeof mockScheduled)[number]) => {
    mockScheduled.push(req);
    return req.identifier;
  },
  cancelScheduledNotificationAsync: async (id: string) => {
    mockCanceled.push(id);
  },
  cancelAllScheduledNotificationsAsync: async () => {},
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  addNotificationReceivedListener: () => ({ remove: () => {} }),
  getLastNotificationResponseAsync: async () => null,
}));

jest.mock('@/platform/watch/watchTransportNative', () => ({
  watchTransport: { isReachable: () => mockState.reachable },
}));

jest.mock('@/platform/telemetry', () => ({ track: () => {} }));

jest.mock('@/platform/liveActivity', () => ({ liveActivityRunning: () => mockState.liveActivity }));

import { restHaptics, restAlertDelays, phoneOwnsRestHaptics, REST_WARNING_LEAD_S } from '@/platform/restHaptics';

const NOW = 1_700_000_000_000;

beforeEach(() => {
  mockScheduled.length = 0;
  mockCanceled.length = 0;
  mockState.reachable = false;
  mockState.granted = true;
  mockState.liveActivity = false;
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => jest.restoreAllMocks());

const at = (s: number) => NOW + s * 1000;
const byId = (id: string) => mockScheduled.find((r) => r.identifier === id);

describe('restAlertDelays — warning leads the end by 7s, sub-second dropped', () => {
  it('a normal 90s rest schedules both', () => {
    expect(restAlertDelays(at(90), NOW)).toEqual({ warnInS: 90 - REST_WARNING_LEAD_S, doneInS: 90 });
  });
  it('exactly 7s rest: warning collapses to null, complete stays', () => {
    expect(restAlertDelays(at(7), NOW)).toEqual({ warnInS: null, doneInS: 7 });
  });
  it('8s rest: warning is the minimum 1s', () => {
    expect(restAlertDelays(at(8), NOW)).toEqual({ warnInS: 1, doneInS: 8 });
  });
  it('a rest already over: both null', () => {
    expect(restAlertDelays(at(0), NOW)).toEqual({ warnInS: null, doneInS: null });
    expect(restAlertDelays(at(-5), NOW)).toEqual({ warnInS: null, doneInS: null });
  });
});

describe('ownership gate', () => {
  it('no watch reachable → phone owns', () => {
    mockState.reachable = false;
    expect(phoneOwnsRestHaptics()).toBe(true);
  });
  it('watch reachable → phone stands down', () => {
    mockState.reachable = true;
    expect(phoneOwnsRestHaptics()).toBe(false);
  });
});

describe('arm — phone owns (no watch)', () => {
  it('schedules the 7s warning and the rest-complete alert', async () => {
    await restHaptics.arm(at(90));
    expect(mockScheduled).toHaveLength(2);

    const warn = byId('hush.rest_warn')!;
    const done = byId('hush.rest_done')!;
    expect(warn.trigger.seconds).toBe(83);
    expect(done.trigger.seconds).toBe(90);
    // Tagged rest_* so the foreground handler suppresses them; sound on so they alert when locked.
    expect(warn.content.data?.kind).toBe('rest_warn');
    expect(done.content.data?.kind).toBe('rest_done');
    expect(warn.content.sound).toBe(true);
    expect(done.content.sound).toBe(true);
    // Time-Sensitive so both pierce the lock screen / Focus when the screen is off
    // (default `.active` is held silently) — the Build #19 locked-phone regression.
    expect(warn.content.interruptionLevel).toBe('timeSensitive');
    expect(done.content.interruptionLevel).toBe('timeSensitive');
  });

  it('clears the prior pair before scheduling (idempotent re-arm for +15s / resume)', async () => {
    await restHaptics.arm(at(90));
    expect(mockCanceled).toEqual(['hush.rest_warn', 'hush.rest_done']);
  });

  it('a short rest (<1s of warning window) schedules only what remains', async () => {
    await restHaptics.arm(at(5)); // warn null, done 5
    expect(byId('hush.rest_warn')).toBeUndefined();
    expect(byId('hush.rest_done')!.trigger.seconds).toBe(5);
  });

  it('a rest already over schedules nothing', async () => {
    await restHaptics.arm(at(0));
    expect(mockScheduled).toHaveLength(0);
  });

  it('denied notification permission → nothing scheduled (never throws)', async () => {
    mockState.granted = false;
    await expect(restHaptics.arm(at(90))).resolves.toBeUndefined();
    expect(mockScheduled).toHaveLength(0);
  });
});

describe('arm — watch present (reachable)', () => {
  // Founder 2026-07-11: the phone alert is ALWAYS scheduled — a locked phone must light up when
  // rest ends, and owning a watch never changes that. The WRIST keeps the buzz, so the phone's
  // alert goes out SILENT: no double buzz, and the screen still wakes (timeSensitive).
  it('still schedules both alerts, silently, and clears any stale pair first', async () => {
    mockState.reachable = true;
    await restHaptics.arm(at(90));
    expect(mockScheduled).toHaveLength(2);
    for (const n of mockScheduled) {
      expect(n.content.sound).toBe(false); // the watch buzzes; the phone only lights up
      expect(n.content.interruptionLevel).toBe('timeSensitive'); // breaks through the lock screen
    }
    expect(mockCanceled).toEqual(['hush.rest_warn', 'hush.rest_done']);
  });

  it('with NO watch, the alerts carry sound (the phone owns the cue)', async () => {
    mockState.reachable = false;
    await restHaptics.arm(at(90));
    expect(mockScheduled).toHaveLength(2);
    for (const n of mockScheduled) expect(n.content.sound).toBe(true);
  });
});

describe('disarm', () => {
  it('cancels both rest alerts', async () => {
    await restHaptics.disarm();
    expect(mockCanceled).toEqual(['hush.rest_warn', 'hush.rest_done']);
  });
});

/**
 * ════ THE LIVE ACTIVITY OWNS THE WARNING (founder 2026-07-29) ════
 *
 * These alerts are a BACKSTOP for a countdown the athlete cannot see — a JS timer is suspended the
 * moment the phone is locked. A Live Activity runs in ActivityKit, not in JS, so while one is up
 * the countdown is already on the lock screen and the "7 seconds" note is a second copy of a thing
 * she is looking at. The rest-OVER alert always stands: a ring reaching zero is not the same as
 * being told to go.
 */
describe('a Live Activity takes over the 7-second warning', () => {
  const kinds = () => mockScheduled.map((n) => n.content.data?.kind);

  it('with no Live Activity, BOTH alerts are scheduled — the backstop is doing its job', async () => {
    await restHaptics.arm(NOW + 60_000);
    expect(kinds()).toEqual(['rest_warn', 'rest_done']);
  });

  it('with one up, the warning stands down and the rest-over alert still fires', async () => {
    mockState.liveActivity = true;
    await restHaptics.arm(NOW + 60_000);
    expect(kinds()).toEqual(['rest_done']);
  });

  it('…and the pair is still CANCELLED first, so a stale warning can never survive the change', async () => {
    // A rest armed while no activity was up, then re-armed once one is: the earlier warning is in
    // iOS's queue and would fire over a Live Activity that is already counting.
    await restHaptics.arm(NOW + 60_000);
    mockCanceled.length = 0;
    mockScheduled.length = 0; // only the SECOND arm is under test
    mockState.liveActivity = true;
    await restHaptics.arm(NOW + 60_000);
    expect(mockCanceled).toEqual(expect.arrayContaining(['hush.rest_warn', 'hush.rest_done']));
    expect(kinds().filter((k) => k === 'rest_warn')).toEqual([]);
  });
});
