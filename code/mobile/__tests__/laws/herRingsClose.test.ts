/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * HER WORKOUT REACHES HER RINGS — AND THE PLIST STOPS LYING.
 *
 * ⛔ THE FINDING (2026-08-23, under the founder's world-class mandate). `NSHealthUpdateUsageDescription`
 * has said *"Hush saves your completed strength workouts to Apple Health"* on every build — a
 * sentence iOS shows the athlete in Settings — while the gate's contract said *"never write to
 * Health (no `toShare`)"*. One user-facing promise, one internal contract, opposite claims.
 *
 * And the missing write is not paperwork: **an hour under a bar that does not close her Move ring
 * is an hour Apple's own habit loop counts against this app.** Every serious competitor writes the
 * finished workout; hers said she did nothing.
 *
 * ── WHAT THIS FILE HOLDS TOGETHER ───────────────────────────────────────────────────────────────
 *   1. The plist claim ↔ a real write path (`healthWrite`), so neither can drift alone again.
 *   2. The write NEVER stands between the save and Well Done — fire-and-forget, after the record.
 *   3. Only a TRAINED session is a workout — the app's own completion bar, kept in Health too.
 *   4. The read-back cannot double-count what we wrote — runs AND strength, one ±5-minute rule.
 *   5. The honesty gates survive the trip: no bodyweight ⇒ no kcal figure, in Health as on screen.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';
import { healthWriteStub } from '@/platform/health/healthWrite';
import appJson from '../../app.json';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('the plist and the code make the same claim', () => {
  it('⛔⛔ the write-usage string exists AND a write path exists — neither drifts alone', () => {
    const claim = appJson.expo.ios.infoPlist.NSHealthUpdateUsageDescription;
    expect(claim).toContain('saves your completed strength workouts');
    // …and the module the claim now rests on:
    const writer = read('platform/health/healthWrite.ts');
    expect(writer).toContain('saveWorkoutSample');
    // …and the auth actually asks to share what we save:
    const gate = read('platform/health/healthKitGate.ts');
    expect(gate.replace(/\s+/g, ' ')).toContain('toShare: [WORKOUT]');
  });

  it('⛔ the stub answers false and never throws — jest, web and Expo Go are real runtimes', () => {
    return Promise.all([
      healthWriteStub.strength({ startedAt: 'x', endedAt: 'y' }).then((r) => expect(r).toBe(false)),
      healthWriteStub.cardio({ gait: 'run', startedAt: 'x', endedAt: 'y' }).then((r) => expect(r).toBe(false)),
    ]);
  });
});

describe('the write costs the ring, never the record', () => {
  it('⛔⛔ strength: strictly AFTER the save, strictly un-awaited', () => {
    /*
     * §8.4 is the invariant this must not bend: the session is on disk before Well Done renders,
     * and nothing may stand between them. So the write appears after `appendCompletedSession` and
     * is fired with `void` — an `await healthWrite` on this path would hold the closing screen
     * hostage to HealthKit.
     */
    const store = read('state/stores/sessionStore.tsx');
    const save = store.indexOf('await db.appendCompletedSession(saved)');
    // , not the import line at the file's head — the CALL is what must follow the save.
    const write = store.indexOf('void healthWrite');
    expect(save).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(save);
    expect(store).toContain('void healthWrite');
    expect(store).not.toContain('await healthWrite');
  });

  it('⛔ …and only a TRAINED session is written — the app’s own bar, kept in Health too', () => {
    // A two-set false start written to Health would put a "workout" on her rings that this app
    // itself refuses to count toward anything.
    const store = read('state/stores/sessionStore.tsx').replace(/\s+/g, ' ');
    expect(store).toContain('if (trained) { const spanMs = sessionDurationMs(saved);');
  });

  it('⛔ the span is the WORKOUT’s, not screen time', () => {
    // The exact defect the summary block already documents — the stopwatch running while she
    // changed and got round to pressing Finish. One span, everywhere, for one session.
    const store = read('state/stores/sessionStore.tsx').replace(/\s+/g, ' ');
    expect(store).toContain('endedAt: new Date(Date.parse(saved.startedAt) + spanMs).toISOString()');
  });

  it('⛔ cardio rides beside the record write, un-awaited, with the same guard', () => {
    const cardio = read('screens/cardio/Cardio.tsx');
    expect(cardio).toContain('void healthWrite');
    expect(cardio).not.toContain('await healthWrite');
  });
});

describe('nothing is invented on the way to Health', () => {
  it('⛔ a workout under a minute, or with a broken span, is refused — Health would keep it forever', () => {
    const writer = read('platform/health/healthWrite.ts').replace(/\s+/g, ' ');
    expect(writer).toContain('end.getTime() - start.getTime() < 60_000) return null');
  });

  it('⛔ kcal rides only when it exists — no body, no number, in Health as on screen', () => {
    const writer = read('platform/health/healthWrite.ts').replace(/\s+/g, ' ');
    // Both writers guard the figure; an absent kcal writes NO total rather than a zero.
    expect(writer).toContain("w.kcal != null && w.kcal > 0 ? { energyBurned: Math.round(w.kcal) } : {}");
  });

  it('⛔ it never prompts — the one permission ask stays where it has always been', () => {
    const writer = read('platform/health/healthWrite.ts');
    expect(writer).not.toContain('requestAuthorization');
  });
});

describe('the read-back cannot double-count what we wrote', () => {
  it('⛔⛔ externalFrom excludes her STRENGTH sessions now, not only her runs', () => {
    /*
     * We write `traditionalStrengthTraining`; `queryWorkoutSamples` reads it back; a coach told she
     * ALSO lifted on Tuesday is being told about the session already on the sheet — and a coach
     * that double-counts a workout halves her week for a rest she did not need.
     */
    const facts = read('domain/coachFacts.ts').replace(/\s+/g, ' ');
    expect(facts).toContain('externalFrom(external, cardio, history)');
    expect(facts).toContain('...(mySessions ?? []).map((s) => Date.parse(s.startedAt))');
  });
});
