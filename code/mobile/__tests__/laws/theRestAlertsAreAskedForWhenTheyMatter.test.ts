/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE REST ALERTS ARE ASKED FOR WHEN THEY MATTER — AND THEY DO NOT PILE UP (2026-09-14)
 *
 * Two findings from one workout on the gym floor, and they are opposite halves of the same story.
 *
 *   ⛔ *"ההתראות לא עובדות באימון."* The backstop (`platform/restHaptics`) schedules nothing without
 *      permission, and permission was asked exactly once — on Well Done, AFTER the first workout.
 *      So the workout that needs the alerts most never had them. The founder's ruling:
 *      *"תקפיץ את זה בפעם הראשונה באימון הראשון וזהו."* The ask moves to the first REST of a first
 *      workout — the one moment in a session that is hers to read on, which is why `setNudge` and
 *      `kilometre` refuse to raise a dialog and this may.
 *
 *   ⛔ *"כשיש התראות זה מצטבר למלא התראות וקשה לבחור את ההתראה העדכנית."* A stable identifier
 *      de-duplicates the SCHEDULE and does nothing to a card iOS has already shown: twelve rests
 *      left twelve "rest over" cards stacked over the live one. A delivered rest alert is litter
 *      the moment the rest moves on, and it is now dismissed as well as cancelled.
 *
 * Both halves are pinned here because they can only be broken together: an alert nobody permitted
 * and an alert nobody cleared are the same athlete's complaint from two ends.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const read = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('⛔ the ask lands where the alerts are needed', () => {
  const stage = read('screens/session/SessionFlow.tsx');

  it('the workout screen raises the pre-ask on a REST, and only on a first workout', () => {
    expect(stage).toContain("'notifyAsk'");
    expect(stage).toContain('shouldAskForNotifications');
    expect(stage).toContain('<NotificationAsk');
    // the two conditions, stated in code rather than implied
    expect(stage).toContain('(app.modeState?.completedSessions ?? 0) === 0');
    expect(stage).toMatch(/displayPhase !== 'REST_INTER' && [^\n]*displayPhase !== 'REST_TRANSITION'/);
  });

  it('…and Well Done keeps its own ask — the athlete past her first workout still gets one', () => {
    const wellDone = read('screens/session/WellDone.tsx');
    expect(wellDone).toContain('shouldAskForNotifications');
    expect(wellDone).toContain('<NotificationAsk');
  });

  it('⛔ and NOTHING raises a system dialog from under a loaded bar', () => {
    /* The schedulers ask only whether permission EXISTS; the prompt belongs to a screen.
       ⚠️ COMMENTS ARE STRIPPED FIRST: both files EXPLAIN in prose why they never call
       `ensureNotificationPermission`, and a scan that counts the explanation as the call fails the
       law for saying the right thing. */
    const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    for (const f of ['platform/restHaptics.ts', 'platform/setNudge.ts']) {
      const src = strip(read(f));
      expect({ f, asks: src.includes('ensureNotificationPermission') }).toEqual({ f, asks: false });
      expect({ f, checks: src.includes('hasNotificationPermission') }).toEqual({ f, checks: true });
    }
  });
});

describe('⛔ a delivered alert is cleared, not only cancelled', () => {
  it('the rest pair is dismissed when it re-arms and when it disarms', () => {
    const rest = read('platform/restHaptics.ts');
    expect(rest).toContain('dismissNotificationAsync');
    // both roads out of a rest clear the tray
    const arm = rest.slice(rest.indexOf('async arm('), rest.indexOf('async disarm('));
    const disarm = rest.slice(rest.indexOf('async disarm('));
    expect({ where: 'arm', clears: arm.includes('clearDelivered()') }).toEqual({ where: 'arm', clears: true });
    expect({ where: 'disarm', clears: disarm.includes('clearDelivered()') }).toEqual({ where: 'disarm', clears: true });
  });

  it('…and so is the set nudge, which piles up the same way', () => {
    expect(read('platform/setNudge.ts')).toContain('dismissNotificationAsync');
  });
});

describe('⛔ a tap from the lock screen that cannot land is counted', () => {
  /*
   * *"כשאני מזין מהלייב אקטיביטי את הסטים והחזרות זה לא מעדכן באפליקציה."* The drop is sometimes
   * right — during a rest the set is already written — but it happened in silence, so the report
   * had nothing behind it. The phase that refused the tap is the whole diagnosis.
   */
  it('every refused lock intent leaves an event with the phase that refused it', () => {
    const store = read('state/stores/sessionStore.tsx');
    const drops = store.match(/lock_intent_dropped/g) ?? [];
    expect(drops.length).toBeGreaterThanOrEqual(3); // complete_set · end_rest · set_ready
    expect(store).toContain("void track('lock_intent_dropped', { sessionId: session.id, type: i.type, phase: v.displayPhase })");
  });

  it('…and the wrist’s own "start set" records what it moved', () => {
    const store = read('state/stores/sessionStore.tsx');
    const at = store.indexOf("void track('watch_rest_end'");
    expect(at).toBeGreaterThan(0);
    /* The event's own argument object — read as written, shorthand included (`before,` is the same
       fact as `before: before`, and a law that only accepts one spelling is a style rule). */
    const call = store.slice(at, store.indexOf('});', at));
    for (const field of ['before', 'after', 'fromIndex', 'toIndex', 'fromExercise', 'toExercise']) {
      expect({ field, present: new RegExp(`\\b${field}\\b`).test(call) }).toEqual({ field, present: true });
    }
  });
});
