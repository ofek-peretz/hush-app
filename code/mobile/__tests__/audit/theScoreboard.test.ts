/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SCOREBOARD — every week the engine can build, against the one definition of a good one.
 *
 * ⛔ FOUNDER, 2026-08-12: *"תעשה את שלב א'."*
 *
 * Thirteen engine attempts each fixed the number their author was looking at and broke another one
 * in a file they were not reading. The scoreboard that would have caught them was built by hand
 * three times in a single day and deleted each time. This is that scoreboard, kept.
 *
 * It sweeps every (frequency × sex × map) the product can produce and asks `domain/weekQuality` —
 * the single written definition — how many rules each week breaks. The totals are RATCHETS: a change
 * that improves the engine leaves them green, and a change that gives any of it back turns them red
 * the moment it is run, in the file that owns the number rather than three files away.
 *
 * ⚠️ THE NUMBERS BELOW ARE MEASURED, NOT CHOSEN. They are what the engine delivers today. Lowering
 * one is a change to the engine; raising one is a decision that has to be argued for in writing.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { fixtureModel } from '@/data/api/fixtureModel';
import { weekFindings, describeFinding, defects, unavoidable, type WeekRule } from '@/domain/weekQuality';
import { CANONICAL_MUSCLE_ORDER } from '@/engine/v5/constants';
import { emphasisRefusal } from '@/engine/v5/bodyMap';
import type { MuscleStance, Profile } from '@/data/local/models';

const athlete = (over: Partial<Profile> = {}): Profile => ({
  id: 'p1',
  sex: 'female',
  units: 'kg',
  weightKg: 62,
  startWeightKg: 62,
  daysPerWeek: 4,
  repBand: '8-10',
  repBandByMuscle: {},
  memberSince: new Date('2026-01-01').toISOString(),
  ...over,
});

const DAYS = [2, 3, 4, 5, 6];
const SEXES: ('male' | 'female')[] = ['male', 'female'];

/**
 * ⛔ EVERY MAP HER SCREENS CAN ACTUALLY PRODUCE, built THROUGH the rule rather than beside it.
 *
 * A sweep over maps the product refuses is a sweep of weeks no athlete can ask for, and this file
 * exists to price what she can reach. `emphasisRefusal` is the same function the body map and the
 * profile editor ask, so if the rule is ever loosened the sweep widens on its own.
 */
function reachableMaps(days: number): Record<string, MuscleStance>[] {
  const structural = CANONICAL_MUSCLE_ORDER.filter((m) => m !== 'Core');
  const out: Record<string, MuscleStance>[] = [{}];
  // …every single mark,
  for (const m of structural) {
    const map: Record<string, MuscleStance> = {};
    if (!emphasisRefusal(map, m, CANONICAL_MUSCLE_ORDER, days)) out.push({ [m]: 'emphasis' });
  }
  // …every PAIR of marks the rule allows,
  for (let i = 0; i < structural.length; i += 1)
    for (let j = i + 1; j < structural.length; j += 1) {
      const map: Record<string, MuscleStance> = {};
      for (const m of [structural[i], structural[j]]) {
        if (emphasisRefusal(map, m, CANONICAL_MUSCLE_ORDER, days)) break;
        map[m] = 'emphasis';
      }
      if (Object.keys(map).length === 2) out.push(map);
    }
  // …and the refusals a real athlete makes.
  out.push({ Calves: 'off', Core: 'off' });
  out.push({ Shoulders: 'off' });
  out.push({ Quads: 'off' });
  out.push({ Quads: 'off', Hamstrings: 'off', Glutes: 'off', Calves: 'off' });
  out.push({ Calves: 'off', Core: 'off', Biceps: 'off' });
  return out;
}

interface Swept {
  label: string;
  inputs: { bodyMap: Record<string, MuscleStance>; daysPerWeek: number };
  findings: ReturnType<typeof weekFindings>;
}

let swept: Swept[] = [];
let weeks = 0;

beforeAll(async () => {
  const out: Swept[] = [];
  for (const days of DAYS)
    for (const sex of SEXES)
      for (const bodyMap of reachableMaps(days)) {
        const program = await fixtureModel.generateProgram(athlete({ daysPerWeek: days, sex, bodyMap }));
        const inputs = { bodyMap, daysPerWeek: days };
        out.push({ label: `${sex} ${days}d ${JSON.stringify(bodyMap)}`, inputs, findings: weekFindings(program, inputs) });
      }
  swept = out;
  weeks = out.length;
}, 600_000);

/** Every finding of one rule, across the sweep, as readable lines. */
const linesFor = (rule: WeekRule): string[] =>
  swept.flatMap((s) => defects(s.findings).filter((f) => f.rule === rule).map((f) => `${s.label} — ${describeFinding(f)}`));

/** ⚠️ DEFECTS ONLY. What no arrangement could have kept is counted separately — see `unavoidable`. */
const countOf = (rule: WeekRule) => swept.reduce((n, s) => n + defects(s.findings).filter((f) => f.rule === rule).length, 0);
const unavoidableOf = (rule: WeekRule) => swept.reduce((n, s) => n + unavoidable(s.findings).filter((f) => f.rule === rule).length, 0);

describe('⛔ the scoreboard', () => {
  it('the sweep is wide enough to be worth trusting', () => {
    // A ratchet over a narrow sweep is a ratchet over nothing. This is every frequency, both sexes,
    // every mark and pair of marks the rule permits, and the refusals athletes actually make.
    expect(weeks).toBeGreaterThan(250);
  });

  /* ════ THE RULES THAT ARE CLOSED — zero, and they stay zero ════════════════════════════════ */

  it('⛔ a muscle she switched OFF never appears', () => {
    expect(linesFor('muscle_switched_off')).toEqual([]);
  });

  it('⛔ every session is 45–60 minutes, or the engine has SAID it could not manage that', () => {
    expect(linesFor('session_length').slice(0, 10)).toEqual([]);
  });

  it('⛔ every block is three to five sets (F-1)', () => {
    expect(linesFor('set_count').slice(0, 10)).toEqual([]);
  });

  it('⛔ no muscle she trains falls under the effective dose — where the week COULD have reached it', () => {
    /*
     * ⛔ AND THE "WHERE IT COULD" IS THE WHOLE FINDING OF THIS SWEEP. The first run reported 158
     * muscles under the dose and every one was a TWO-DAY week: two sessions deliver about 49 working
     * sets and nine muscles need 54. No dealer, cap or repair closes a gap of five sets that the
     * clock never bought. Those are `unavoidable` — arithmetic, not arrangement.
     *
     * ⚠️ TWO SURVIVE AND THEY ARE REAL. A two-day week with the LEGS off trains five muscles, so the
     * dose is comfortably reachable — and Shoulders still lands at five sets. That is arrangement,
     * not arithmetic, and it is pinned rather than excused.
     *
     * ── ⛔ 2 → 1, 2026-08-18 · THE RULE NOW ASKS THE ENGINE'S OWN NUMBER ─────────────────────────
     * `weekQuality` counted DIRECT sets while `raiseToWeeklyFloor` — the pass that actually spends
     * her minutes on a thin muscle — counts direct PLUS `INDIRECT_SHARE` of every compound that also
     * drives the muscle. Two accountings of one quantity, so this board reported shortfalls the
     * engine had already decided did not exist and would never have acted on.
     *
     * The one that left is the FEMALE two-day, legs-off week: Triceps at 5 direct sets and 8 or more
     * received, because a week of pressing is triceps work. Nothing about her programme changed —
     * only that the board stopped calling a fed muscle starved.
     *
     * The one that stays is the male Shoulders, and it stays for the reason that makes this number
     * worth keeping: NO pattern in the catalogue lends to the shoulders, so 5 direct is 5 received,
     * and the defect is exactly as real as it was.
     */
    expect(linesFor('under_dose').length).toBeLessThanOrEqual(UNDER_DOSE);
  });

  it('⚠️ …and where it could NOT, the engine knows, so she can be told', () => {
    /*
     * ⛔ THIS IS NOT A FAILURE. It is the two-day athlete's arithmetic, and it is the same family as
     * `shortOfBudget`: something the engine cannot do, that she can, and that nothing has ever said
     * out loud. Pinned so the count cannot grow silently.
     */
    expect(unavoidableOf('under_dose')).toBe(UNAVOIDABLE_UNDER_DOSE);
    // …and every one of them is a two-day week, which is the claim that makes it arithmetic.
    const notTwoDay = swept.filter((s) => s.inputs.daysPerWeek !== 2 && unavoidable(s.findings).length > 0);
    expect(notTwoDay.map((s) => s.label)).toEqual([]);
  });

  it('⛔ no muscle she trains is trained only once a week', () => {
    expect(linesFor('trained_once').slice(0, 10)).toEqual([]);
  });

  it('⛔ a muscle’s lifts are spread across its days, never clumped', () => {
    expect(linesFor('clumped').slice(0, 10)).toEqual([]);
  });

  it('⛔ no day repeats a muscle’s movement', () => {
    expect(linesFor('repeated_pattern').slice(0, 10)).toEqual([]);
  });

  it('⛔ pulling is never dwarfed by pushing where she did not ask for it', () => {
    expect(linesFor('push_pull').slice(0, 10)).toEqual([]);
  });

  /* ════ THE RULES STILL OPEN — pinned at what they measure TODAY ════════════════════════════ */

  it('⚠️ share inversions — the ratchet, and the cause is traced on `theWeekIsBalanced`', () => {
    /*
     * The share table's purpose, still unmet in some weeks: a bigger share delivering less than a
     * smaller one. Traced in full on the pin — the region day split apportions WHOLE days, and at
     * four days the only split expressible is 2/2 while the upper half carries 51–65% of the volume.
     * Three separate repairs were measured and reverted (attempts 11, 12, 13).
     *
     * ⚠️ THIS NUMBER IS A CEILING ON A KNOWN GAP, NOT A TARGET.
     *
     * ── 2026-08-12 · 104 → 92, AND THE RESIDUE IS NOW EXACTLY CHARACTERISED ──────────────────
     * The repair pass closed twelve of them and cannot reach the rest, and WHY it cannot is the
     * most useful thing this ratchet now records:
     *
     *     82 of 92 are CROSS-REGION — Back against Hamstrings or Glutes. On a split week those
     *        muscles never share a session, and the region day split is what decides how much room
     *        each half gets. No repair below the split can move volume across it.
     *     10 of 92 are same-region, blocked by F-1's three-set floor: every donor block is already
     *        at three, so there is no set to give without dropping a lift.
     *
     * That is an independent confirmation, from the far end of the pipeline, of the diagnosis
     * traced above — and it is why stage C (a full constrained search) was NOT taken: a search
     * cannot conjure a session either.
     */
    expect(countOf('share_inversion')).toBeLessThanOrEqual(SHARE_INVERSIONS);
  });

  it('⛔ a mark never runs a muscle past the ceiling — CLOSED by the repair pass', () => {
    /*
     * Junk volume: it costs her the hour and buys nothing. The constant's own note calls 30
     * "deliberately above the ~20 the evidence calls the point of diminishing returns".
     *
     * ⛔ THIRTY-FOUR CASES, CLOSED WITHOUT TOUCHING THE PIPELINE (2026-08-12, stage B). Ten attempts
     * had been spent trying to stop the volume layer producing them; `domain/weekRepair` simply
     * reads the finished week and gives the set back. See `theWeekIsRepaired`.
     */
    expect(linesFor('over_ceiling').slice(0, 10)).toEqual([]);
    expect(countOf('over_ceiling')).toBe(OVER_CEILING);
  });

  it('⛔ and the WHOLE board is printed, so a change is priced in one place', () => {
    /*
     * ⚠️ NOT AN ASSERTION ABOUT QUALITY — an assertion that the board is COMPLETE. Every rule the
     * definition can emit has a line here, so a rule added to `weekQuality` and forgotten in the
     * sweep cannot go unmeasured. That is exactly how the thirteen attempts went unnoticed.
     */
    const RULES: WeekRule[] = [
      'session_length', 'set_count', 'muscle_switched_off', 'under_dose', 'over_ceiling',
      'trained_once', 'clumped', 'repeated_pattern', 'share_inversion', 'push_pull',
    ];
    const board = Object.fromEntries(RULES.map((r) => [r, countOf(r)]));
    for (const r of ['under_dose', 'push_pull', 'over_ceiling', 'share_inversion'] as WeekRule[]) {
      const byDays: Record<string, number> = {};
      for (const s of swept) for (const f of s.findings) if (f.rule === r) {
        const d = /\s(\d)d\s/.exec(s.label)?.[1] ?? '?';
        byDays[d] = (byDays[d] ?? 0) + 1;
      }
      // eslint-disable-next-line no-console
      console.log(`-- ${r} by days: ${JSON.stringify(byDays)}\n` + linesFor(r).slice(0, 8).map((x) => '     ' + x).join('\n'));
    }
    // eslint-disable-next-line no-console
    console.log(`\n══ ${weeks} weeks swept ══\n` + RULES.map((r) => `  ${r.padEnd(20)} ${board[r]}`).join('\n'));
    expect(Object.keys(board).sort()).toEqual([...RULES].sort());
  });
});

/*
 * ⚠️ MEASURED 2026-08-12 against the engine as it stands, over the 270 weeks above.
 *
 * ⛔ RE-MEASURED 2026-08-16, when the clock learned that a one-sided set is performed twice
 * (`CHARGE_BOTH_SIDES` in `domain/restPrescription`, where the full table sits). The honest hour
 * moved two of these, in OPPOSITE directions, and both are recorded rather than only the convenient
 * one:
 *
 *     share inversions ............ 92 → 85    BETTER, so the ceiling is tightened to meet it
 *     unavoidable under-dose ..... 156 → 159   WORSE, and it is the two-day week's arithmetic
 *
 * The three extra under-dosed muscles are all on two-day weeks — the assertion below already proves
 * that, and it still holds — where two sessions cannot carry nine muscles to MEV whatever the clock
 * says. They were not being dosed before; they were being PRICED as dosed, in sessions that ran past
 * the hour she was promised. Naming three more of them is the scoreboard doing its job.
 *
 * ⛔ RE-MEASURED 2026-08-18, when the dose rule stopped keeping its own set of books.
 *
 * `weekQuality` judged the dose on DIRECT sets; `raiseToWeeklyFloor` — the engine pass that decides
 * whether to spend another minute of her hour on a thin muscle — judged it on direct sets PLUS
 * `INDIRECT_SHARE` of every compound that also drives the muscle. Both are now the same call
 * (`weeklyEffectiveSets`, exported from the assembler), so the board reports what the engine
 * believes rather than a rival opinion:
 *
 *     unavoidable under-dose ..... 159 → 111   BETTER, and no programme changed
 *     under-dose defects ......... 2 → 1       BETTER, and the survivor is Shoulders (see below)
 *     share inversions ........... 85 → 85     untouched — that rule reads PRESCRIBED sets, rightly
 *     every other rule ........... unchanged
 *
 * ⚠️ NOT ONE SET MOVED. Every one of the 48 is a muscle the engine had already decided was fed —
 * biceps under a week of rows, triceps under a week of presses, glutes under a week of hinges — and
 * refused to add to. The old number was the scoreboard, the WHY sheet and HOME all complaining about
 * a shortfall no regeneration could ever have cleared, because the engine did not believe in it.
 *
 * ⚠️ 111 IS STILL A LARGE NUMBER AND STILL HONEST. They are all two-day weeks, and what remains
 * there is what indirect work cannot reach: nine muscles need 54 weekly sets and two sessions carry
 * about 49, and no compound lends to the shoulders or the calves at all.
 */
const SHARE_INVERSIONS = 85;
const OVER_CEILING = 0;
/*
 * 111 → 123 on 2026-08-25 when the hour began pricing compulsory warm-up bridges: twelve more
 * low-frequency weeks could not fit the dose in the promised time, and said so.
 *
 * ⛔ AND 123 → 111 ON 2026-08-30, to the athlete, when the founder made the ramp OPTIONAL and the
 * charge went with it. Those twelve weeks were never really short of minutes — they were short of
 * minutes we had spent in advance on a warm-up nobody had asked for. Twelve athletes get their dose
 * back. (The same reversal, to the same pre-charge number, shows up in `theWeekIsBalanced`'s
 * emptied-donor ratchet: 0 → 40. One charge, two distorted boards.)
 */
const UNAVOIDABLE_UNDER_DOSE = 111;
const UNDER_DOSE = 1;
