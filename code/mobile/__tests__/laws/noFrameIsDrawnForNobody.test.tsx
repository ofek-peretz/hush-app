// @ts-nocheck
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * NO FRAME IS DRAWN FOR NOBODY (founder's phone, build 79, 2026-10-12)
 *
 * *"יש באג בשעון… זה לרגע טוען ועושה כאילו אין אינטרנט ואז אומר: חזרתי… זה גם קורה אם אני לוחץ
 * מהפלאפון… היא לא מתריעה שהמנוחה נגמרה."*
 *
 * His voice journal showed the app starting from nothing ten times in twenty-five minutes of one
 * workout. Apple's report for one of them (`FERROX.cpu_resource_fatal`) said why:
 *
 *     Event: cpu usage · Action taken: Process killed
 *     48 seconds cpu time over 58 seconds (83% cpu average), exceeding limit of 80% cpu over 60 seconds
 *     Primary state: Non-Frontmost App · User Activity: Idle · heaviest stack: the JS thread
 *
 * The thread was the athlete's own frame loop (`MotionFigure.useMotionRom`): it re-arms itself every
 * frame and rebuilds the figure each time, and off glass React Native's frame clock no longer waits
 * for a display. The workout keeps its process awake in a pocket on purpose, so the loop ran flat
 * out behind a locked screen until iOS killed the app — and every press after that woke a new one.
 *
 * This file RUNS the loop over an app that leaves the glass and comes back. It also pins that the
 * figure's is the only loop in the product that re-arms itself for ever — a second one, added
 * somewhere else, would be the same kill by another door.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { MotionFigure } from '@/motion/render/MotionFigure';
import { exerciseMotion } from '@/motion/registry';

const MOBILE = path.join(__dirname, '..', '..');

/** A frame clock we hold: every request is kept, and nothing runs until the test says so. */
function frameClock() {
  let next = 1;
  const pending = new Map<number, () => void>();
  const requested: number[] = [];
  const cancelled: number[] = [];
  global.requestAnimationFrame = (cb) => {
    const id = next++;
    pending.set(id, cb);
    requested.push(id);
    return id;
  };
  global.cancelAnimationFrame = (id) => {
    cancelled.push(id);
    pending.delete(id);
  };
  return {
    requested,
    cancelled,
    waiting: () => pending.size,
    /** Run every frame that is waiting — once, as a display would. */
    frame: () => {
      const due = [...pending.values()];
      pending.clear();
      act(() => due.forEach((cb) => cb()));
    },
  };
}

/** The app's state, and the one listener the figure registers on it. */
function appState(initial: string) {
  const listeners = new Set<(s: string) => void>();
  const removed: number[] = [];
  Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => state });
  let state = initial;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, cb) => {
    listeners.add(cb);
    return { remove: () => { listeners.delete(cb); removed.push(1); } };
  });
  return {
    listeners,
    removed,
    go: (s: string) => {
      state = s;
      act(() => [...listeners].forEach((cb) => cb(s)));
    },
  };
}

const rig = exerciseMotion('bb_back_squat');

afterEach(() => jest.restoreAllMocks());

describe('⛔ the figure draws only while the app is on glass', () => {
  it('a locked phone ends the loop — and a frame that fires anyway re-arms nothing', () => {
    const clock = frameClock();
    const app = appState('active');
    let tree;
    act(() => { tree = renderer.create(<MotionFigure rig={rig} />); });
    expect(clock.waiting()).toBe(1);
    clock.frame();
    clock.frame();
    expect(clock.waiting()).toBe(1); // alive: each frame asks for the next

    const before = clock.requested.length;
    app.go('inactive'); // the lock: active → inactive → background
    app.go('background');
    expect(clock.waiting()).toBe(0);
    expect(clock.cancelled.length).toBeGreaterThanOrEqual(1);
    // a whole minute in the pocket, by whatever clock React Native has off glass
    for (let i = 0; i < 600; i++) clock.frame();
    expect(clock.requested.length).toBe(before);
    act(() => tree.unmount());
  });

  it('back on glass it runs again — one loop, not two', () => {
    const clock = frameClock();
    const app = appState('active');
    let tree;
    act(() => { tree = renderer.create(<MotionFigure rig={rig} />); });
    app.go('background');
    app.go('active');
    expect(clock.waiting()).toBe(1);
    app.go('active'); // told twice: still one
    expect(clock.waiting()).toBe(1);
    clock.frame();
    expect(clock.waiting()).toBe(1);
    act(() => tree.unmount());
    expect(clock.waiting()).toBe(0);
    expect(app.listeners.size).toBe(0); // …and it stops listening when it leaves
  });

  it('a figure mounted behind a locked screen never starts — the workout resumed by a wrist tap', () => {
    const clock = frameClock();
    const app = appState('background');
    let tree;
    act(() => { tree = renderer.create(<MotionFigure rig={rig} />); });
    expect(clock.requested.length).toBe(0);
    app.go('active');
    expect(clock.waiting()).toBe(1);
    act(() => tree.unmount());
  });
});

describe('⛔ and it is the only loop in the product that re-arms itself', () => {
  const files: string[] = [];
  (function walk(dir: string) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) files.push(full);
    }
  })(path.join(MOBILE, 'src'));
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const rel = (f: string) => path.relative(MOBILE, f).replace(/\\/g, '/');

  it('every `requestAnimationFrame` in the app is one of these — a new one is read before it ships', () => {
    const users = files.filter((f) => !rel(f).startsWith('src/screens/dev/') && /requestAnimationFrame\(/.test(code(fs.readFileSync(f, 'utf8')))).map(rel).sort();
    expect(users).toEqual([
      'src/app/Root.tsx', // once: the splash is released after the first frame
      'src/components/ReorderRows.tsx', // once per drop
      'src/components/ds/CountUp.tsx', // a count that ENDS at its number
      'src/components/ds/WheelPicker.tsx', // once per layout
      'src/motion/render/MotionFigure.tsx', // the one that never ends — and the one this law runs
    ]);
  });

  it('…and the one that never ends asks the app’s state before every frame', () => {
    const figure = code(fs.readFileSync(path.join(MOBILE, 'src/motion/render/MotionFigure.tsx'), 'utf8'));
    expect(figure).toContain("const offGlass = (state: AppStateStatus | undefined): boolean => state === 'background' || state === 'inactive';");
    expect(figure).toMatch(/const tick = \(\) => \{\s+raf\.current = null;\s+if \(!alive \|\| away\) return;/);
    expect(figure).toContain("AppState.addEventListener('change', (state) => {");
  });
});
