/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE FOURTEEN HAVE NO SIDE DOOR — founder, 2026-08-23:
 *
 *   *"רק תוודא ל-14 האימונים שאין לזה פרצה מסוימת. שאנשים לא יוכלו לחגוג עלינו ולהנות מזה לעד."*
 *
 * The audit that answered him found one, LIVE IN BUILD 57: the pre-workout card's Start — reachable
 * from the Program tab and from Home's day list — never asked `isTrainingGated`. Home's Begin has
 * gated since the paywall shipped and the wrist is refused a lobby when gated; the third door
 * walked past both. (It was also broken outright: it carried a `workoutId` param nothing consumes,
 * so the stage it opened was empty — two defects, one button.)
 *
 * ── THE SEAL, IN LAYERS — and this law pins every layer ─────────────────────────────────────────
 *   1. EVERY UI DOOR GATES. Home's Begin, and the pre-workout card's Start.
 *   2. THE DOORWAY GATES. `sessionStore.start` and `startCoach` refuse a gated start whoever
 *      forgot to ask — doors multiply, the doorway does not.
 *   3. EVERY COMPLETION COUNTS. The phone's save path and the watch's reconcile both credit
 *      `recordSessionCompleted`, so no way of training is free of the meter.
 *   4. THE COUNT OUTLIVES THE APP. Every persist writes the Keychain ledger (`nextLedger`), and
 *      boot reads back the HIGHER of ledger and local (`trialUsed`) — delete-and-reinstall does
 *      not restart the trial.
 *
 * What is DELIBERATELY not sealed, stated so nobody "fixes" it into a regression:
 *   · CARDIO STAYS FREE. The trial meters the engine's workouts; the cardio recorder never touches
 *     the engine, and a free excellent recorder is the top of the funnel, not a leak.
 *   · A NEW APPLE ID IS A NEW TRIAL. Since 2026-08-23 the ledger also rides
 *     NSUbiquitousKeyValueStore (`theAccountIsHerAppleId`), so a new DEVICE on the same Apple ID
 *     continues the same fourteen. What remains is a fresh Apple ID per trial — which costs the
 *     attacker more than the subscription does, and is where the on-device defence honestly ends.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import * as fs from 'fs';
import * as path from 'path';
import { isTrainingGated, freeSessionsRemaining, FREE_SESSION_LIMIT } from '@/domain/entitlement';
import { trialUsed, nextLedger } from '@/domain/trialLedger';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('1 · every UI door gates', () => {
  it('Home’s Begin asks, and answers with the paywall', () => {
    const home = read('src/screens/home/Home.tsx');
    expect(home).toContain('isTrainingGated(app.modeState.completedSessions, app.entitlement.active, app.profile?.memberSince)');
    expect(home).toMatch(/if \(gated\) \{\s*\n\s*navigation\.navigate\('Paywall', \{ source: 'gate' \}\)/);
  });

  it('⛔ the pre-workout card’s Start asks the SAME question — the side door of build 57', () => {
    const card = read('src/screens/plan/PreWorkoutScreen.tsx');
    const at = card.indexOf('onStart={');
    expect(at).toBeGreaterThan(-1);
    const door = card.slice(at, at + 3000);
    expect(door).toContain('isTrainingGated(app.modeState.completedSessions, app.entitlement.active, app.profile?.memberSince)');
    expect(door).toContain("navigation.navigate('Paywall', { source: 'gate' }");
    // …and it actually starts the session it promises (the broken half of the same button):
    expect(door).toContain('coachSession(plan, workout.id)');
    expect(door).toContain('session.startCoach(planned, workout.id)');
    expect(door).not.toContain('workoutId: workout.id');
  });
});

describe('2 · the doorway gates, whoever forgot to ask', () => {
  it('both starters in the session store refuse a gated start', () => {
    const store = read('src/state/stores/sessionStore.tsx');
    const guards = store.split('isTrainingGated(a.modeState.completedSessions, a.entitlement.active, a.profile?.memberSince)').length - 1;
    expect(guards).toBe(2); // start + startCoach — one per doorway, exactly
  });
});

describe('3 · every completion counts', () => {
  it('the watch’s reconcile credits the meter — a wrist workout is not a free one', () => {
    expect(read('src/platform/watch/watchReconcile.ts')).toContain('recordSessionCompleted()');
  });
});

describe('4 · the count outlives the app', () => {
  it('every persist writes the Keychain ledger, monotonic', () => {
    const app = read('src/state/stores/appStore.tsx');
    expect(app).toContain('writeTrialLedger(nextLedger(prev, m.completedSessions))');
  });

  it('boot takes the HIGHEST of ledger, local and CLOUD — a reinstall restarts nothing, and neither does a new device on the same Apple ID', () => {
    const app = read('src/state/stores/appStore.tsx');
    expect(app).toContain('trialUsed(ledger, mode.completedSessions, cloud.ledgerGet())');
    expect(app).toContain('cloud.ledgerSet(nextLedger(cloud.ledgerGet(), m.completedSessions))');
  });

  it('the ledger arithmetic cannot be argued down', () => {
    expect(trialUsed(14, 0)).toBe(14); // reinstall: fresh local, surviving ledger
    expect(trialUsed(null, 9)).toBe(9); // unreadable Keychain: local wins, no second trial gifted
    expect(trialUsed(-5, -3)).toBe(0); // garbage never mints credit
    expect(trialUsed(0, 0, 14)).toBe(14); // new device: the iCloud half alone remembers (2026-08-23)
    expect(nextLedger(14, 3)).toBe(14); // the ledger only ever moves up
    expect(nextLedger(null, 7)).toBe(7);
  });
});

describe('the gate itself', () => {
  it('fourteen spent and no purchase → gated; either relief opens it', () => {
    expect(isTrainingGated(FREE_SESSION_LIMIT, false)).toBe(true);
    expect(isTrainingGated(FREE_SESSION_LIMIT + 50, false)).toBe(true);
    expect(isTrainingGated(FREE_SESSION_LIMIT - 1, false)).toBe(false);
    expect(isTrainingGated(FREE_SESSION_LIMIT, true)).toBe(false);
    expect(freeSessionsRemaining(FREE_SESSION_LIMIT + 9)).toBe(0); // never negative
  });
});
