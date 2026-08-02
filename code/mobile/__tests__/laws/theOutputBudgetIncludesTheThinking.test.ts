import fs from 'fs';
import path from 'path';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * `maxOutputTokens` IS NOT A BUDGET FOR THE ANSWER. THE THINKING IS SPENT OUT OF IT FIRST.
 *
 * ⚠️ WATCHED HAPPEN, 2026-08-02: two replies arrived as JSON that stopped mid-string. The app reads
 * that as `not_json`, which reaches her as **"Not sent"** — a whole turn lost, looking exactly like
 * a network failure and caused by nothing of the sort.
 *
 * On Gemini 3.x, `thoughtsTokenCount` is billed at the output rate AND counted against
 * `maxOutputTokens`. Measured on a deliberately heavy build — six days, 90 minutes, "as detailed as
 * possible", supersets and running — against the old cap of 8,192:
 *
 *     thinking 5,444 + visible 1,424 = 6,868      survived, with 1,300 to spare
 *     thinking 4,769 + visible 3,312 = 8,081      ⚠️ 1.4% under the ceiling
 *
 * Three runs of one identical request spanned 5,062 → 8,081. **The variance alone is larger than
 * the headroom was.** A seven-day week, or one athlete asking for more detail, is a truncated
 * programme — and truncation is the worst failure this product has, because it is indistinguishable
 * from a dropped call and therefore never gets reported as a bug.
 *
 * ── WHY THIS IS A LAW AND NOT JUST A BIGGER NUMBER ──────────────────────────────────────────────
 * "8192 is plenty for a JSON programme" is true, obvious, and wrong — it is exactly the reasoning
 * that will lower it again during a cost pass. The cap is a SAFETY NET against a runaway
 * generation, not a budget: the model stops when it is finished, so the usual call is untouched and
 * only a worst case that has never occurred gets more expensive.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const worker = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'server', 'worker.ts'), 'utf8');

/** Highest thinking + visible total measured on one real programme build. */
const MEASURED_WORST = 8_081;

describe('the output cap has room for the thinking as well as the answer', () => {
  it('⚠️ is comfortably above the largest real call we have measured', () => {
    const m = /const MAX_OUTPUT_TOKENS = ([\d_]+);/.exec(worker);
    expect(m).not.toBeNull();
    const cap = Number(m![1].replace(/_/g, ''));
    /*
     * Twice the worst case, not a few hundred over it. The three runs of ONE request spanned
     * 5,062 → 8,081, so anything sized to the worst observed number is sized to the middle of the
     * next distribution.
     */
    expect(cap).toBeGreaterThanOrEqual(MEASURED_WORST * 2);
  });

  it('says, where the number is, that thinking is spent out of it', () => {
    // The number alone teaches nobody. Whoever next opens this file to save money has to meet the
    // reason before they meet the constant.
    expect(worker).toMatch(/THIS CAP INCLUDES THINKING/);
    expect(worker).toMatch(/COUNTED AGAINST\s*\n?\s*\*?\s*`?maxOutputTokens`?/);
  });
});
