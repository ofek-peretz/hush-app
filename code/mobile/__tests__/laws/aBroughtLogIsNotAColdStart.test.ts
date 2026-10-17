/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ A LOG SHE BROUGHT IS NOT A COLD START — the law behind M1's largest claim (2026-09-01).
 *
 * The import (`domain/historyImport`) exists to remove the one real switching cost in this
 * category. But the claim the audit actually staked the strategy on is bigger than convenience:
 *
 *   > **"Every competitor's day one is a guess. For an athlete who brought her log, ours is a
 *   > measurement."**
 *
 * That sentence is only true if the imported sessions genuinely reach the ENGINE — if they are
 * folded like her own history rather than filed like a scrapbook. One field decides it: the
 * parser deliberately does NOT stamp `freeform`, because `advanceV5` skips freeform sessions by
 * design (a holiday PR single must not read as a failed floor). Stamp it and the claim silently
 * becomes false: the ledger would still show two years of work while the engine met her cold.
 *
 * ⚠️ SO THE CLAIM GETS A LAW RATHER THAN A COMMENT. This drives the REAL parser into the REAL
 * engine and measures what she is prescribed on day one — against the same athlete with no
 * import, on the same clock. A regression here is not a broken test; it is the product's largest
 * promise going quietly untrue.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseHistoryCsv } from '@/domain/historyImport';
import { currentV5Targets, ensureExercisesV5, resetV5, observedLoads, railCeilingFor } from '@/engine/v5/v5Engine';
import { db } from '@/data/local/db';

const BAND = { lo: 8, hi: 10 };

/** Ten weeks of a real Strong export: bench climbing 60 → 82.5, twice a week. */
function strongCsv(): string {
  const rows = ['Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE'];
  let load = 60;
  for (let w = 0; w < 10; w++) {
    for (const day of [1, 4]) {
      const d = new Date(2026, 5, 1 + w * 7 + day, 9, 0);
      const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 09:00:00`;
      for (let s = 1; s <= 3; s++) rows.push(`${stamp},Push,1h,Bench Press,${s},${load},8,,,,,`);
      load += 1.25; // her real climb, in half-rungs — the grid learns what she actually touched
    }
  }
  return rows.join('\n');
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await resetV5();
});

describe('⛔ a brought log reaches the engine', () => {
  it('⛔ the parser never stamps `freeform` — the one field that would make the claim false', () => {
    const report = parseHistoryCsv(strongCsv(), 'kg');
    expect(report.sessions.length).toBeGreaterThan(10);
    for (const s of report.sessions) {
      // `freeform` is what `advanceV5` filters. An imported history is the substrate (S-58),
      // not a deviation — see the header on `domain/historyImport`.
      expect(s.freeform).toBeUndefined();
      expect(s.trained).toBe(true);
    }
  });

  it('⛔ her own rungs become the engine’s grid — learned from what she actually lifted', async () => {
    const report = parseHistoryCsv(strongCsv(), 'kg');
    await db.appendImportedHistory(report.sessions);
    const history = await db.loadHistory();
    const rungs = observedLoads('bb_bench_press', history, 'barbell');
    // She touched twenty distinct loads; the grid is hers, not the equipment's assumption.
    expect(rungs.length).toBeGreaterThan(5);
    expect(Math.max(...rungs)).toBeGreaterThan(75);
  });

  it('⛔ the rail stands on her demonstrated best — a ceiling she EARNED, before her first Hush set', async () => {
    const report = parseHistoryCsv(strongCsv(), 'kg');
    await db.appendImportedHistory(report.sessions);
    const history = await db.loadHistory();
    const rail = railCeilingFor('bb_bench_press', BAND.lo, history);
    expect(rail).not.toBeNull();
    expect(rail).toBeGreaterThan(75); // not a bootstrap — a number she proved
  });

  it('⛔ DAY ONE IS A MEASUREMENT, NOT A GUESS — the whole claim, in one comparison', async () => {
    /*
     * The real day-one path: a programme is built, `ensureExercisesV5` creates the state for every
     * lift in it, and what she is handed comes from that state. Run it BOTH ways on one clock.
     */
    const seed = () => 40; // the cold-start table's word for this athlete — deliberately blind
    const report = parseHistoryCsv(strongCsv(), 'kg');
    await db.appendImportedHistory(report.sessions);
    await ensureExercisesV5(['bb_bench_press'], BAND, await db.loadHistory(), seed);
    const broughtLoad = (await currentV5Targets([]))['bb_bench_press']?.weight ?? null;
    expect(broughtLoad).not.toBeNull();

    // The same athlete, same engine, same seed — no import. Nothing measured, so the seed stands.
    await AsyncStorage.clear();
    await resetV5();
    await ensureExercisesV5(['bb_bench_press'], BAND, [], seed);
    const coldLoad = (await currentV5Targets([]))['bb_bench_press']?.weight ?? null;

    /*
     * The prescription she is handed is built from HER OWN top set, and it is nowhere near the
     * cold-start table. This is the assertion the strategy rests on — if it ever goes red, the
     * import has become a scrapbook and the pitch has become a lie.
     */
    expect(coldLoad).toBe(40); // the guess, unchanged
    expect(broughtLoad).toBeGreaterThan(70); // the measurement
    expect(broughtLoad).toBeGreaterThan(coldLoad);
  });
});
