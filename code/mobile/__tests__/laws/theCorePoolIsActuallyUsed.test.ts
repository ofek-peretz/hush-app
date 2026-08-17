/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE CORE POOL IS TEN LIFTS, AND SHE USED TO SEE ONE.
 *
 * ⛔ FOUNDER'S LIST, 2026-08-16: *"החלפת תרגילים של התוכנית לגיוון בשביל לגרות את השריר."*
 *
 * ── WHAT THE MEASUREMENT ACTUALLY SAID ──────────────────────────────────────────────────────────
 * The complaint was assumed to be general — "the same two or three lifts for ever" — and twelve
 * simulated weeks say that is NOT true of the engine as a whole. Loop 3 opens and closes exercise
 * slots as a muscle's volume moves, and that rotates the pool on its own:
 *
 *     Quads       8 of 12 lifts seen      Hamstrings   7 of 11      Chest   4-6 of 11
 *
 * ⛔ EXCEPT CORE, WHICH SAW EXACTLY ONE OF TEN, AND ONE MOVEMENT PATTERN OF FOUR — both athletes,
 * every week, `ab_wheel`. Core has no volume loop: it is appended once, supplemental, by
 * `addWeeklyCore` alone, and that function chose its entry point with
 *
 *     start = (daysPerWeek - 1) % CORE_POOL.length
 *
 * whose comment read "rotate the entry point by frequency". It does — ACROSS ATHLETES. Her own
 * frequency never changes, so nothing ever moved her core lift.
 *
 * ── THE CURSOR IS HER TRAINING, NOT A CALENDAR ──────────────────────────────────────────────────
 * Register Part 5 deleted the three-week rotation because *"variety comes from a measured stall, not
 * a schedule"*, and a clock-driven refresh would walk straight back into it. This advances on a FACT
 * — the number of sessions she has actually logged core work in — so a week she skipped rotates
 * nothing, and the whole sequence is reproducible from her history alone (I-24).
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { fixtureModel } from '@/data/api/fixtureModel';
import { db } from '@/data/local/db';
import { exerciseById } from '@/data/exercises';
import type { Profile, Session } from '@/data/local/models';

jest.setTimeout(300000);

const athlete = (over = {}): Profile => ({
  units: 'kg', goal: 'build_muscle', healthConnected: false,
  sex: 'female', weightKg: 62, daysPerWeek: 4, repBand: '8-10', ...over,
} as Profile);

const coreOf = (p) =>
  p.days.flatMap((d) => d.slots).filter((s) => exerciseById(s.exerciseId)?.muscle === 'Core').map((s) => s.exerciseId);

/** `n` sessions that each contained core work — the only fact the cursor reads. */
const withCoreSessions = (n: number): Session[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `s${i}`, programDayId: 'd', startedAt: new Date(2026, 0, 5 + i).toISOString(), state: 'SAVED', earlyFinish: false,
    sets: [{ exerciseId: 'ab_wheel', setIndex: 0, recommendedWeight: null, recommendedReps: 12, actualWeight: null, actualReps: 12, edited: false, persistedAt: '' }],
  })) as unknown as Session[];

async function programAfter(coreSessions: number, profile = athlete()) {
  await db.clearAll();
  await db.saveProfile(profile);
  for (const s of withCoreSessions(coreSessions)) await db.appendCompletedSession(s);
  return fixtureModel.generateProgram(profile);
}

describe('⛔ the core movement advances as she trains', () => {
  it('walks the pool instead of standing on one lift', async () => {
    const seen = new Set<string>();
    for (let n = 0; n < 10; n += 1) for (const id of coreOf(await programAfter(n))) seen.add(id);
    expect(seen.size).toBeGreaterThanOrEqual(8); // it was 1
  });

  it('⚠️ and it covers the movement PATTERNS, which is what "incompletely trained" means', async () => {
    const patterns = new Set<string>();
    for (let n = 0; n < 10; n += 1) for (const id of coreOf(await programAfter(n))) patterns.add(exerciseById(id)?.pattern ?? '?');
    expect(patterns.size).toBeGreaterThanOrEqual(4); // crunch, leg_raise, rotation, anti_extension
  });

  it('⛔ a week she did NOT train rotates nothing — the cursor is her work, not the clock', async () => {
    expect(coreOf(await programAfter(3))).toEqual(coreOf(await programAfter(3)));
  });

  it('…and one more session of core work moves it on', async () => {
    expect(coreOf(await programAfter(3))).not.toEqual(coreOf(await programAfter(4)));
  });

  it('⚠️ Core switched OFF still means no core at all (S-2)', async () => {
    expect(coreOf(await programAfter(5, athlete({ bodyMap: { Core: 'off' } })))).toEqual([]);
  });

  it('⚠️ …and an emphasis mark still buys a SECOND movement, never a repeat of the first', async () => {
    const core = coreOf(await programAfter(5, athlete({ bodyMap: { Core: 'emphasis' } })));
    expect(core.length).toBe(2);
    expect(new Set(core).size).toBe(2);
  });
});
