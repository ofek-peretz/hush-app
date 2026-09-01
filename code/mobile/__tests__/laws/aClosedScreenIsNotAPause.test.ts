/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A CLOSED SCREEN IS NOT A PAUSE — founder, device QA 2026-08-23, and it was critical:
 *
 *   *"כשאני סוגר את המסך המטרים והמדדים לא משתנים. כאילו זה היה בהפסקה. זה קריטי…
 *   מסך סגור לא אומר שהאפליקציה סגורה."*
 *
 * THE DEFECT (live in build 57): the cardio background task was gated on the "Always" location
 * upgrade — `if (bg?.granted) startCardioLocationTask()` — while expo-location's own source states
 * a foreground-started task needs only the When-In-Use grant (its consumer sets
 * `allowsBackgroundLocationUpdates = YES`; the app declares `UIBackgroundModes: location`).
 * Without the task, iOS suspended the whole JS runtime seconds after the lock — no metres, no
 * calories, no kilometre notes, no Live Activity updates. A pocketed phone is a run's NORMAL
 * state, which is what made it critical.
 *
 * This law pins every clock and every accumulator that must survive a locked screen:
 *   1. The outdoor task starts on the foreground grant, unconditionally.
 *   2. The indoor and heart-rate polls catch up the INSTANT the app returns (Core Motion counts in
 *      hardware while JS sleeps; the cumulative read heals the gap — but only when it runs).
 *   3. Every elapsed figure is anchored to an ABSOLUTE instant, never to tick counting: the run's
 *      clock, the workout's clock, the rest's countdown.
 *   4. The rest already had the full discipline — AppState resync + OS-level backstop alerts — and
 *      it must keep it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import * as fs from 'fs';
import * as path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('1 · the outdoor task needs no "Always"', () => {
  const tracker = () => read('src/platform/cardio/cardioTracker.ts');

  it('⛔ starts on the foreground grant, unconditionally — the build-57 freeze', () => {
    expect(tracker()).toContain('void startCardioLocationTask();');
    // CODE only — the fix's own comment quotes the buggy line it removed, which is not the bug.
    const code = tracker()
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .join('\n');
    expect(code).not.toMatch(/if \(bg\?\.granted\)/);
  });

  it('…and the "Always" request survives, after the start and gating nothing', () => {
    const t = tracker();
    expect(t).toContain('requestBackgroundPermissionsAsync');
    expect(t.indexOf('void startCardioLocationTask();')).toBeLessThan(
      t.indexOf('requestBackgroundPermissionsAsync().catch'),
    );
  });
});

describe('2 · the polls catch up the instant she returns', () => {
  it('both the stride poll and the heart-rate poll listen for the foreground', () => {
    const tracker = read('src/platform/cardio/cardioTracker.ts');
    expect(tracker.split("if (st === 'active') read();").length - 1).toBe(2);
  });
});

describe('3 · every elapsed figure is an absolute anchor, never a tick count', () => {
  it('the run’s clock is wall-clock across pause/resume', () => {
    const run = read('src/platform/cardio/cardioRun.ts');
    expect(run).toContain('Wall-clock elapsed, accumulated across pause/resume — never an interval tick count.');
    expect(run).toContain('Date.now() - s.resumedAtMs');
  });

  it('the workout’s clock derives from the session’s start instant each tick', () => {
    const flow = read('src/screens/session/SessionFlow.tsx');
    const at = flow.indexOf('function ElapsedClock');
    expect(at).toBeGreaterThan(-1);
    expect(flow.slice(at, at + 600)).toContain('(now - from) / 1000');
  });
});

describe('4 · the rest keeps its full background discipline', () => {
  const flow = () => read('src/screens/session/SessionFlow.tsx');

  it('an absolute end, resynced on every return to foreground', () => {
    expect(flow()).toContain('endAtRef.current - Date.now()');
    expect(flow()).toMatch(/AppState\.addEventListener\('change'/);
    expect(flow()).toContain("if (state === 'active' && !paused) sync();");
  });

  it('and the OS-level backstops armed against the same absolute end', () => {
    expect(flow()).toContain('restHaptics.arm(endAtRef.current)');
  });
});

describe('5 · the Live Activity rides the event path, not a screen timer', () => {
  /*
   * (Founder, 2026-08-23: "בדקת גם שזה מתעדכן ב-Dynamic Island ו-Live Activity? הכל?" — it was
   * not: the island's update lived only in the screen's one-second interval, and RN timers stop
   * with the display link. The publisher lives in `cardioRun` now, on the same event path as the
   * per-kilometre notification.)
   */
  const run = () => read('src/platform/cardio/cardioRun.ts');

  it('⛔ every credited stretch publishes (throttled), and a closed kilometre publishes ALWAYS', () => {
    expect(run()).toContain('publishLiveActivity(false)');
    expect(run()).toContain('publishLiveActivity(true)');
    // The force lands after the kilometre loop — beside the persist that always lands too.
    const at = run().indexOf('s.lastKm = kmDone;');
    expect(run().slice(at, at + 220)).toContain('publishLiveActivity(true)');
  });

  it('…re-anchoring the native clock so a background stretch never drifts', () => {
    expect(run()).toContain('startedAtMs: now - elapsed * 1000');
  });

  it('…and never publishes for a run that is over', () => {
    const at = run().indexOf('function publishLiveActivity');
    expect(run().slice(at, at + 300)).toContain('if (!s.active) return;');
  });

  it('the STRENGTH activity was already event-driven — the store’s state effect, not a timer', () => {
    const store = read('src/state/stores/sessionStore.tsx');
    expect(store).toContain('void liveActivity.update(mirror)');
  });
});
