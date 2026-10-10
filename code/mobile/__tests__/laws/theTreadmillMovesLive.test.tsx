/**
 * ════ ⛔ THE TREADMILL MOVES AS SHE WALKS (founder, 2026-09-15: "עשה אותה") ════
 *
 * Health alone put the first metres of every indoor run minutes late — the iPhone flushes
 * `DistanceWalkingRunning` in batches. The live half is Core Motion's pedometer
 * (`modules/hush-pedometer`), polled every second; Health stays beside it for the watch's strides.
 *
 * These render the REAL `useCardioTracker` in indoor mode against controllable sources, so the
 * wire from both reads to the run's distance is exercised, not described:
 *   · live: the pedometer moves, Health has flushed nothing — the metres move within seconds;
 *   · the phone on the console: the pedometer reads 0, the watch (via Health) carries the walk;
 *   · both measured the same strides — one distance, never the sum;
 *   · no source at all — `unavailable`, never a confident zero;
 *   · the process is held awake for the run and let go after it, by name.
 * And the native seam itself is pinned: the module's name, CoreMotion, and the Info.plist string
 * without which the first query crashes the app.
 */
// @ts-nocheck

import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { create, act } from 'react-test-renderer';

jest.mock('@/platform/notifications', () => ({ notifier: { kilometre: async () => {} } }));

const src = {
  healthKm: null as number | null,
  healthState: 'granted',
  pedUsable: true,
  pedKm: null as number | null,
  holds: [] as string[],
  releases: [] as string[],
};
jest.mock('@/platform/health', () => ({
  health: {
    permissionState: async () => src.healthState,
    requestPermission: async () => true,
    latestHeartRate: async () => null,
    distanceSince: async () => src.healthKm,
  },
}));
jest.mock('@/platform/cardio/pedometer', () => {
  const actual = jest.requireActual('@/platform/cardio/pedometer');
  return {
    ...actual,
    pedometer: { usable: () => src.pedUsable, kmSince: async () => src.pedKm },
  };
});
jest.mock('@/platform/voice/audioSession', () => ({
  audioSession: {
    holdKeepAlive: async (o) => void src.holds.push(o),
    releaseKeepAlive: async (o) => void src.releases.push(o),
  },
}));

import { useCardioTracker } from '@/platform/cardio/cardioTracker';
import { snapshot, endRun } from '@/platform/cardio/cardioRun';
import { indoorReadingKm } from '@/platform/cardio/pedometer';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

function Probe() {
  useCardioTracker(true, false, 75, true);
  return null;
}

async function tick(ms: number) {
  for (let i = 0; i < ms / 250; i++) {
    await act(async () => {
      jest.advanceTimersByTime(250);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  jest.useFakeTimers();
  Object.assign(src, { healthKm: null, healthState: 'granted', pedUsable: true, pedKm: null, holds: [], releases: [] });
});
afterEach(() => {
  endRun();
  jest.useRealTimers();
});

describe('one walk, two measurements of it', () => {
  it('the larger of the two, never the sum; null only when neither measured', () => {
    expect(indoorReadingKm(1.0, 1.02)).toBeCloseTo(1.02, 5);
    expect(indoorReadingKm(0.3, null)).toBeCloseTo(0.3, 5);
    expect(indoorReadingKm(null, 0.5)).toBeCloseTo(0.5, 5);
    expect(indoorReadingKm(null, null)).toBeNull();
    expect(indoorReadingKm(NaN, -1)).toBeNull();
  });
});

describe('the tracker, indoors', () => {
  it('⛔ live: the pedometer moves and Health has flushed nothing — the metres move within seconds', async () => {
    src.pedKm = 0;
    src.healthKm = 0;
    let r;
    await act(async () => {
      r = create(<Probe />);
    });
    await tick(1500);
    for (let s = 1; s <= 10; s++) {
      src.pedKm = (s * 1.4) / 1000;
      await tick(1000);
    }
    expect(snapshot().distanceKm).toBeGreaterThan(0.01);
    expect(snapshot().distanceKm).toBeLessThanOrEqual(0.014 + 1e-9);
    await act(async () => r.unmount());
  });

  it('the phone on the console: the watch, by way of Health, carries the walk', async () => {
    src.pedKm = 0;
    src.healthKm = 0;
    let r;
    await act(async () => {
      r = create(<Probe />);
    });
    await tick(1500);
    src.healthKm = 0.5;
    await tick(6000);
    expect(snapshot().distanceKm).toBeCloseTo(0.5, 3);
    await act(async () => r.unmount());
  });

  it('⛔ both measured the same strides — one distance, not two', async () => {
    src.pedKm = 0;
    src.healthKm = 0;
    let r;
    await act(async () => {
      r = create(<Probe />);
    });
    await tick(1500);
    src.pedKm = 1.0;
    src.healthKm = 1.02;
    await tick(6000);
    expect(snapshot().distanceKm).toBeCloseTo(1.02, 3);
    await act(async () => r.unmount());
  });

  it('a source that drops out mid-run does not pull the distance down', async () => {
    src.pedKm = 0;
    src.healthKm = 0;
    let r;
    await act(async () => {
      r = create(<Probe />);
    });
    await tick(1500);
    src.pedKm = 0.4;
    await tick(2000);
    src.pedKm = null;
    await tick(6000);
    expect(snapshot().distanceKm).toBeCloseTo(0.4, 3);
    await act(async () => r.unmount());
  });

  it('no pedometer and no Health reading — `unavailable`, never a confident zero', async () => {
    src.pedUsable = false;
    src.healthKm = null;
    let r;
    await act(async () => {
      r = create(<Probe />);
    });
    await tick(1500);
    expect(snapshot().gps).toBe('unavailable');
    await act(async () => r.unmount());
  });

  it('the process is held awake for the run, and let go after it — by name', async () => {
    let r;
    await act(async () => {
      r = create(<Probe />);
    });
    expect(src.holds).toEqual(['indoorRun']);
    expect(src.releases).toEqual([]);
    await act(async () => r.unmount());
    expect(src.releases).toEqual(['indoorRun']);
  });
});

describe('the pace tells the truth at a one-second cadence (review, 2026-09-15)', () => {
  it('⛔ a repeated reading while she walks keeps the pace; ten seconds of nothing blanks it', () => {
    const { beginRun, setPaused, ingestStride } = jest.requireActual('@/platform/cardio/cardioRun');
    beginRun(70, true);
    setPaused(false);
    ingestStride(0, 1_000);
    ingestStride(0.01, 8_000); // 10 m in 7 s
    const pace = snapshot().paceSec;
    expect(pace).toBeGreaterThan(0);
    ingestStride(0.01, 9_000); // Core Motion has not ticked yet
    ingestStride(0.01, 10_000);
    expect(snapshot().paceSec).toBe(pace);
    ingestStride(0.01, 18_000); // ten seconds without a metre
    expect(snapshot().paceSec).toBe(0);
  });

  it('⛔ a watch batch that overtakes the pedometer is not billed as a 2:00 /km sprint', async () => {
    src.pedKm = 0;
    src.healthKm = 0;
    let r;
    await act(async () => {
      r = create(<Probe />);
    });
    await tick(1500);
    // Two minutes of walking at 1.4 m/s counted live by the pedometer…
    for (let s = 1; s <= 120; s++) {
      src.pedKm = (s * 1.4) / 1000;
      await tick(1000);
    }
    // …then the watch's batch lands above it: it measured 30 m more over the same two minutes.
    src.healthKm = 0.198;
    await tick(6000);
    expect(snapshot().distanceKm).toBeCloseTo(0.198, 3);
    // Walking pace is ~714 s/km. Timed over one second the 30 m would clamp to 120 and drag the
    // smoothed pace to ~540; timed over the share of the two minutes it covered, it stays near 700.
    expect(snapshot().paceSec).toBeGreaterThan(640);
    await act(async () => r.unmount());
  });
});

describe('the keep-alive has owners', () => {
  afterEach(() => {
    jest.dontMock('expo-modules-core');
    jest.resetModules();
  });
  it('⛔ a treadmill opened inside a workout does not stop the workout’s loop on its way out', async () => {
    jest.resetModules();
    const calls: string[] = [];
    jest.doMock('expo-modules-core', () => ({
      requireOptionalNativeModule: () => ({
        startKeepAlive: async () => void calls.push('start'),
        stopKeepAlive: async () => void calls.push('stop'),
      }),
    }));
    const { audioSession } = jest.requireActual('@/platform/voice/audioSession');
    await audioSession.holdKeepAlive('workout');
    await audioSession.holdKeepAlive('indoorRun');
    await audioSession.releaseKeepAlive('indoorRun');
    expect(calls).toEqual(['start']);
    await audioSession.releaseKeepAlive('workout');
    expect(calls).toEqual(['start', 'stop']);
    // A release by an owner that never held it changes nothing.
    await audioSession.releaseKeepAlive('indoorRun');
    expect(calls).toEqual(['start', 'stop']);
  });
});

describe('the native seam', () => {
  it('the module is registered under the name the JS asks for', () => {
    expect(JSON.parse(read('modules/hush-pedometer/expo-module.config.json')).apple.modules).toEqual(['HushPedometerModule']);
    const swift = read('modules/hush-pedometer/ios/HushPedometerModule.swift');
    expect(swift).toContain('public class HushPedometerModule: Module');
    expect(swift).toContain('Name("HushPedometer")');
    expect(read('src/platform/cardio/pedometer.ts')).toContain("requireOptionalNativeModule<PedometerModule>('HushPedometer')");
    for (const fn of ['isDistanceAvailable', 'authorizationStatus', 'distanceSince']) {
      expect(swift).toContain(`"${fn}"`);
    }
  });
  it('⛔ Info.plist carries the motion usage string — without it the first query crashes the app', () => {
    const plist = JSON.parse(read('app.json')).expo.ios.infoPlist;
    expect(typeof plist.NSMotionUsageDescription).toBe('string');
    expect(plist.NSMotionUsageDescription.length).toBeGreaterThan(20);
  });
  it('CoreMotion is linked, and a refusal or an error answers nil — "not measured", never zero', () => {
    expect(read('modules/hush-pedometer/ios/HushPedometer.podspec')).toContain("s.frameworks     = 'CoreMotion'");
    const swift = read('modules/hush-pedometer/ios/HushPedometerModule.swift');
    expect(swift).toMatch(/status == \.denied \|\| status == \.restricted \{\s*promise\.resolve\(nil\)/);
    expect(swift).toMatch(/guard error == nil, let data = data else \{\s*promise\.resolve\(nil\)/);
  });
  it('the workout holds the loop by name too', () => {
    const store = read('src/state/stores/sessionStore.tsx');
    expect(store).toContain("void audioSession.holdKeepAlive('workout');");
    expect(store).toContain("void audioSession.releaseKeepAlive('workout');");
    expect(store).not.toMatch(/audioSession\.(start|stop)KeepAlive\(/);
  });
});
