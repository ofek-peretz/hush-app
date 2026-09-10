/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * SHE STOPPED FOR THREE MONTHS AND WAS HANDED A WEIGHT SHE COULD NOT MOVE ONCE.
 *
 * ⛔ FOUNDER'S LIST, 2026-08-16. Measured on an athlete given eight ordinary weeks and then a gap,
 * against a conservative body model (~10% of strength a month away, levelling at 70% of peak):
 *
 *     away  90 days   incline barbell press   asked 30 kg  →  she gets 0 reps
 *                     machine row             asked 32.5   →  she gets 0 reps
 *     away 180 days   dumbbell curl           asked  9 kg  →  she gets 3 reps
 *
 * Four lifts of four, two of them unliftable, on the first session of a comeback — the one session
 * in her whole history where the app most has to be right. Loop 1 has two corrections to rescue it
 * (S-13) and cannot: it moves by RUNGS from where it starts.
 *
 * ── ⛔ THE THREE THINGS THIS PINS, AND WHY EACH ONE HAS A BODY ──────────────────────────────────
 *   · **IT IS A DECISION, NOT A FILTER.** Two earlier attempts decayed the load on the way to the
 *     screen — one inside `currentV5Targets`, one inside `sessionTargets` — and were reverted by
 *     S-9/S-29/S-43 and `everyScreenShowsTheEngineNumber`, which are right: they put a number on the
 *     stage that no decision produced. So the STORED state must move, and the change must be logged.
 *   · **IT RUNS EXACTLY ONCE PER GAP.** The decay sits where the prescription is read, which happens
 *     on every open. Without `detrainedAfter` it would compound 0.9 per launch and walk every load
 *     to the floor while she sat on the bus. This is the assertion most likely to save the feature.
 *   · **IT LANDS ON A REAL RUNG, AND NEVER BELOW THE FLOOR.** 0.9× a weight is not a weight; F-2's
 *     grid says which weights exist, and S-55 says a prescription may never fall below the lightest
 *     one that physically does.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { applyDetrainingV5, advanceV5, currentV5Targets } from '@/engine/v5/v5Engine';
import { retainedAfterGap, daysSinceLastSession, lastSessionStartMs } from '@/engine/v5/detraining';
import { DETRAIN_FLOOR, DETRAIN_RETAINED_PER_MONTH } from '@/engine/v5/constants';
import { COMEBACK_DAYS } from '@/domain/comeback';
import { db } from '@/data/local/db';
import type { Session } from '@/data/local/models';

const DAY = 86400000;
const T0 = Date.UTC(2026, 0, 5, 9, 0, 0);
const BAND = { lo: 8, hi: 10 };

/** Eight ordinary weeks on one barbell lift, climbing — then whatever gap the case wants. */
function history(exerciseId: string, load: number, weeks = 8): Session[] {
  const out: Session[] = [];
  for (let w = 0; w < weeks; w += 1) {
    out.push({
      id: `s${w}`, programDayId: 'd1', startedAt: new Date(T0 + w * 7 * DAY).toISOString(),
      state: 'SAVED', earlyFinish: false,
      sets: [0, 1, 2].map((i) => ({
        exerciseId, setIndex: i, recommendedWeight: load, recommendedReps: 8,
        actualWeight: load, actualReps: 9, edited: false, persistedAt: '', restBeforeS: 90,
      })),
    });
  }
  return out;
}

const lastStart = (h: Session[]) => lastSessionStartMs(h.map((s) => Date.parse(s.startedAt)));

/** Fold her history so the engine holds a real settled prescription, then read it. */
async function settle(exerciseId: string, h: Session[]): Promise<number | null> {
  await db.clearAll();
  await advanceV5([exerciseId], () => BAND, h, () => 20, Date.parse(h[h.length - 1].startedAt));
  return (await currentV5Targets(h)).weight ?? (await currentV5Targets(h))[exerciseId]?.weight ?? null;
}

const loadOf = async (exerciseId: string, h: Session[]) => (await currentV5Targets(h))[exerciseId]?.weight ?? null;

describe('⛔ the curve itself', () => {
  it('an ordinary week off is not detraining — inside the grace window she keeps everything', () => {
    expect(retainedAfterGap(0)).toBe(1);
    expect(retainedAfterGap(COMEBACK_DAYS - 1)).toBe(1);
  });

  it('⚠️ and it decays from the moment the gap becomes a comeback, not from day zero', () => {
    // The product already declares where a gap becomes a return; the curve starts there, so a
    // fourteen-day break and a fifteen-day one are not different animals.
    expect(retainedAfterGap(COMEBACK_DAYS)).toBeCloseTo(1, 6);
    expect(retainedAfterGap(COMEBACK_DAYS + 30)).toBeCloseTo(DETRAIN_RETAINED_PER_MONTH, 6);
    expect(retainedAfterGap(COMEBACK_DAYS + 60)).toBeCloseTo(DETRAIN_RETAINED_PER_MONTH ** 2, 6);
  });

  it('⛔ and it levels out — a year away is not a prescription of nothing', () => {
    expect(retainedAfterGap(COMEBACK_DAYS + 365)).toBe(DETRAIN_FLOOR);
    expect(retainedAfterGap(COMEBACK_DAYS + 3650)).toBe(DETRAIN_FLOOR);
  });

  it('⚠️ a first-ever athlete has no gap — that is a beginning, and B-1 owns it', () => {
    expect(daysSinceLastSession([], T0)).toBe(0);
    expect(lastSessionStartMs([])).toBe(0);
  });
});

describe('⛔ the decision reaches her prescription', () => {
  const EX = 'bb_bench_press';

  it('a 90-day gap brings the load DOWN, and the engine state is what moved', async () => {
    const h = history(EX, 60);
    await settle(EX, h);
    const before = await loadOf(EX, h);
    expect(before).toBeGreaterThan(0);

    const moved = await applyDetrainingV5(h, lastStart(h) + 90 * DAY);
    expect(moved).toBe(1);

    // ⛔ READ BACK THROUGH THE FAÇADE. That is the point: `currentV5Targets` reports STORED state
    // (S-9/S-29/S-43), so a lower number here proves a decision was written, not a filter applied.
    const after = await loadOf(EX, h);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
  });

  it('⛔ and it is LOGGED, so the Saturday mirror can say what it did (S-45/R7)', async () => {
    const h = history(EX, 60);
    await settle(EX, h);
    const before = await loadOf(EX, h);
    await applyDetrainingV5(h, lastStart(h) + 90 * DAY);

    const log = (await db.loadEngineV5())?.changeLog ?? [];
    const entry = log.find((c) => c.kind === 'detrain' && c.exerciseId === EX);
    expect(entry).toBeDefined();
    expect(entry.loadFrom).toBe(before);
    expect(entry.loadTo).toBe(await loadOf(EX, h));
    // A decay moves the load and nothing else — her band and her sets are not what went away.
    expect(entry.bandFrom).toEqual(entry.bandTo);
    expect(entry.setsFrom).toBe(entry.setsTo);
  });

  it('⛔⛔ A GROWING GAP IS TOPPED UP — the hole the first build shipped with', async () => {
    /*
     * The first version keyed idempotency on the gap's IDENTITY (the session before it), which never
     * changes while she stays away. A review found it: she peeks on day 11, the stamp says "paid",
     * and she returns on day 200 to her FULL pre-gap loads — the one session this exists for. The
     * original test re-read at the same instant, so it could never see a gap grow.
     */
    const h = history(EX, 60);
    await settle(EX, h);
    const before = await loadOf(EX, h);

    await applyDetrainingV5(h, lastStart(h) + 11 * DAY); // a peek, just past the grace window
    const afterPeek = await loadOf(EX, h);
    await applyDetrainingV5(h, lastStart(h) + 200 * DAY); // …and the real return
    const afterReturn = await loadOf(EX, h);

    expect(afterReturn).toBeLessThan(before);
    expect(afterReturn).toBeLessThan(afterPeek);
  });

  it('⛔ …and an ELEVEN-DAY break costs nothing, because a decay under a rung is not a decay', async () => {
    /*
     * `snapDown` turned a 0.35% ideal into a whole rung: 60 kg → 55 on a {50,55,60} grid, for a week
     * and a half away. Always-down is right for NORMALISING a load she performed; a decay is a
     * decision, and rounding it away from the truth by a rung is a different number, not caution.
     */
    const h = history(EX, 60);
    await settle(EX, h);
    const before = await loadOf(EX, h);
    await applyDetrainingV5(h, lastStart(h) + 11 * DAY);
    expect(await loadOf(EX, h)).toBe(before);
  });

  it('⛔⛔ IT RUNS ONCE PER GAP — the assertion that keeps this from eating her loads', async () => {
    const h = history(EX, 60);
    await settle(EX, h);
    const at = lastStart(h) + 90 * DAY;

    expect(await applyDetrainingV5(h, at)).toBe(1);
    const once = await loadOf(EX, h);

    // The prescription is read on every open. Ten more reads must change nothing at all.
    for (let i = 0; i < 10; i += 1) await applyDetrainingV5(h, at + i * 1000);
    expect(await loadOf(EX, h)).toBe(once);
  });

  it('⚠️ …and a SECOND gap, after she trains again, is answered on its own terms', async () => {
    const h = history(EX, 60);
    await settle(EX, h);
    await applyDetrainingV5(h, lastStart(h) + 90 * DAY);
    const afterFirst = await loadOf(EX, h);

    // She comes back and trains. That is a new most-recent session, so a later gap is a new gap.
    const h2 = [...h, { ...h[0], id: 'back', startedAt: new Date(lastStart(h) + 90 * DAY).toISOString() }];
    expect(await applyDetrainingV5(h2, lastStart(h2) + 90 * DAY)).toBe(1);
    expect(await loadOf(EX, h2)).toBeLessThan(afterFirst);
  });

  it('⛔ a gap inside the grace window decays nothing', async () => {
    const h = history(EX, 60);
    await settle(EX, h);
    const before = await loadOf(EX, h);
    expect(await applyDetrainingV5(h, lastStart(h) + (COMEBACK_DAYS - 1) * DAY)).toBe(0);
    expect(await loadOf(EX, h)).toBe(before);
  });
});

describe('⛔ what it refuses to do', () => {
  it('never prescribes a weight that does not exist — the result is on her grid', async () => {
    const EX = 'bb_bench_press';
    const h = history(EX, 60);
    await settle(EX, h);
    await applyDetrainingV5(h, lastStart(h) + 120 * DAY);
    const after = await loadOf(EX, h);
    // Her performed loads are the rungs she is known to have (F-2); barbell plates are 2.5 kg steps.
    expect(Math.round(after * 2) / 2).toBe(after);
    expect(after).toBeGreaterThanOrEqual(20); // never below the empty bar (S-55)
  });

  it('⛔ leaves a BODYWEIGHT lift alone — there is no load axis to lower', async () => {
    const EX = 'push_up';
    const h = history(EX, 0).map((s) => ({
      ...s,
      sets: s.sets.map((x) => ({ ...x, actualWeight: null, recommendedWeight: null })),
    }));
    await db.clearAll();
    await advanceV5([EX], () => BAND, h, () => null, Date.parse(h[h.length - 1].startedAt));
    expect(await applyDetrainingV5(h, lastStart(h) + 180 * DAY)).toBe(0);
    expect(await loadOf(EX, h)).toBeNull();
  });

  it('⚠️ an athlete with no history at all is untouched', async () => {
    await db.clearAll();
    expect(await applyDetrainingV5([], T0 + 400 * DAY)).toBe(0);
  });
});
