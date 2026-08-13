/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE DELIVERED WEEK AGAINST THE WEEK THE ENGINE DECIDED ON.
 *
 * ⛔ FOUNDER, 2026-08-11: *"תתקן את היעד מול המסופק ותאמת הכל בקוד."*
 *
 * Every other audit asks whether the week is LEGAL — inside the hour, inside F-1, no muscle switched
 * off that she left on. None of them ever asked whether it is the week the engine's own targets
 * describe, and the answer was no.
 *
 * `weeklyTargets` is not a quantity — at five days it asks for ~208 weekly sets, which is three
 * hours a session. It is a set of PROPORTIONS, and `enforceTimeCap` scales them down to what her
 * minutes hold. So the guarantee that matters is not "Back gets 30 sets"; it is that the RATIOS
 * survive the scaling: a muscle the table gives the largest share of the week does not come out
 * smaller than one it gives less.
 *
 * ── WHAT THIS FOUND, AND WHAT IT PINS ─────────────────────────────────────────────────────────────
 * At five days, Chest (share 1.3) delivered 21 sets and Back (share 1.5) delivered 15, from equal
 * targets. Push:pull came out 2.29:1 against a target of about 1.2:1. Both are the direction a coach
 * criticises first, and neither was visible to any existing test.
 *
 * The cause was in the DEALER, not the cap: a muscle's lifts were placed on the emptiest day by TOTAL
 * load, blind to where that muscle's own lifts had gone, so Back came out 1/3/2 across its three days
 * where Chest came out 2/2/2 — and the cap, which prices one day at a time, cut the clump.
 *
 * ⚠️ THE THRESHOLDS BELOW ARE MEASURED CEILINGS, NOT AMBITIONS. They sit just above what the engine
 * delivers today, so this test fails on a REGRESSION and does not quietly pass a week that got worse.
 * Tightening them is a change to the engine, not to the number.
 *
 * ════ RE-MEASURED ON EFFECTIVE VOLUME, 2026-08-11 — AND EVERY PIN SURVIVED ════
 *
 * ⛔ Founder: *"תמדוד מחדש את הנעולים על המספר האמיתי."* Once `indirectMusclesOf` existed there was a
 * real possibility that these three pins were the same class of mistake as "Glutes at 7 weekly sets"
 * — defects in the MEASUREMENT rather than in the engine. Seven engine fixes had already been spent
 * on that one. So each was re-run against the volume a muscle RECEIVES:
 *
 *   pin · two marks on one region ....... filed 7 cases → received 8 cases      REAL, and worse
 *   pin · push:pull over 2.0 ............ filed 6 cases → by capability 6        REAL, unchanged
 *   pin · share inversions .............. filed 69 → received 436               filed is the RIGHT
 *                                                                                measure; see below
 *   pin · clumping ...................... structural, volume does not apply      REAL
 *
 * ⚠️ THE PUSH:PULL RE-READ IS THE ONE WORTH UNDERSTANDING, because the naive effective number said
 * the defect had almost vanished (6 cases → 1) and that number is WRONG. Adding indirect volume to
 * both sides double-counts: a bench press set becomes 1 for Chest and 0.5 for Triceps, and BOTH sit
 * on the push side. The honest measure counts each set exactly once, by `capability` —
 * `horizontal_push + vertical_push` against `horizontal_pull` — and it agrees with the original
 * reading precisely: six cases, same worst case (2.33). The imbalance is in the engine, not the ruler.
 *
 * ⚠️ AND SHARE INVERSIONS MUST STAY ON FILED SETS. `MUSCLE_VOLUME_SHARE` is a rule about what to
 * PRESCRIBE, and it already discounts the arms for exactly this reason — the table's own note on
 * Biceps and Triceps reads "worked by every pull already". Measuring received volume against it
 * double-counts the discount and manufactures 367 phantom inversions.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { fixtureModel, estimateSessionMinutes } from '@/data/api/fixtureModel';
import { weeklyTargets } from '@/engine/v5/assembler';
import {
  CANONICAL_MUSCLE_ORDER,
  MUSCLE_VOLUME_SHARE,
  SESSION_MIN,
  SESSION_MAX,
  WEEKLY_SETS_FLOOR,
  WEEKLY_SETS_CEILING,
} from '@/engine/v5/constants';
import { muscleOf, exerciseById } from '@/data/exercises';
import { emphasisRefusal } from '@/engine/v5/bodyMap';
import type { MuscleStance, Profile, Program } from '@/data/local/models';

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

const build = (p: Profile): Promise<Program> => fixtureModel.generateProgram(p);
const workouts = (p: Program) => p.days.filter((d) => !d.isRest);

/** Weekly sets per muscle, as the athlete actually receives them. */
function delivered(p: Program): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of workouts(p)) {
    for (const s of d.slots) {
      const m = muscleOf(s.exerciseId);
      if (m) out[m] = (out[m] ?? 0) + s.setCount;
    }
  }
  return out;
}

const DAYS = [2, 3, 4, 5, 6];
const SEXES: ('male' | 'female')[] = ['male', 'female'];
/*
 * ⚠️ THE TWO-MARK MAPS ARE HERE BECAUSE LEAVING THEM OUT HID THE WORST DEFECT IN THIS FILE'S HISTORY.
 *
 * The first cut of this sweep carried single marks only, reported everything green, and a wider
 * sweep run minutes later found that **marking Chest and Back at four days gave the entire lower
 * body ONE session a week** (three upper days against one lower). F-4 allows two marks; a sweep that
 * only tries one is not sweeping the space the product offers.
 */
const MAPS: Record<string, MuscleStance>[] = [
  {},
  { Shoulders: 'off' },
  { Back: 'emphasis' },
  { Glutes: 'emphasis' },
  { Chest: 'emphasis', Back: 'emphasis' },
  { Quads: 'emphasis', Glutes: 'emphasis' },
  { Calves: 'off', Core: 'off' },
  { Calves: 'off', Core: 'off', Biceps: 'off' },
  { Quads: 'off' },
];

/** Every (days × sex × map) the sweep covers, built once and shared by the blocks below. */
async function sweep(): Promise<{ label: string; days: number; got: Record<string, number>; want: Record<string, number>; p: Program }[]> {
  const out = [];
  for (const days of DAYS)
    for (const sex of SEXES)
      for (const bodyMap of MAPS) {
        const p = await build(athlete({ daysPerWeek: days, sex, bodyMap }));
        const want = weeklyTargets(bodyMap, CANONICAL_MUSCLE_ORDER, days);
        delete want.Core; // supplemental — not part of the week's volume pot
        out.push({ label: `${sex} ${days}d ${JSON.stringify(bodyMap)}`, days, got: delivered(p), want, p });
      }
  return out;
}

describe('⛔ the delivered week matches the week the engine decided on', () => {
  jest.setTimeout(300000);

  it('no muscle she trains sinks under MEV, at any frequency she can actually choose', async () => {
    /*
     * ⛔ THE PIN THAT CLOSED THIS FILE'S SISTER TEST (eightWeeksOfTraining, 2026-08-11).
     *
     * Two days a week is EXCLUDED and it is not a fudge: nine muscles at MEV is ~54 weekly sets and
     * two 60-minute sessions hold about 40. That week cannot reach MEV for everything and no engine
     * change makes it — it is arithmetic. Three days up is where the promise is real, and the sweep
     * asserts it there. (The 2-day gap is product-side debt: nothing on the screen tells her.)
     */
    const thin: string[] = [];
    for (const c of await sweep()) {
      if (c.days < 3) continue;
      for (const [m, n] of Object.entries(c.got)) {
        if (m === 'Core') continue;
        if (n > 0 && n < WEEKLY_SETS_FLOOR) thin.push(`${c.label}: ${m} at ${n}`);
      }
    }
    expect(thin).toEqual([]);
  });

  it('⛔ the lower body is not a quad programme — hip work against knee work', async () => {
    /*
     * ⛔ THE FINDING THAT TURNED OUT TO BE MINE, NOT THE ENGINE'S (2026-08-11) — and the law that
     * replaces it, so nobody re-reports it.
     *
     * I reported "Glutes 7 weekly sets against a target of 26, glute:quad 0.39" as the worst defect
     * left in the engine. It is not a defect. It is an artefact of counting a lift for exactly ONE
     * muscle: the catalogue files `bb_deadlift` and `db_rdl` under Hamstrings and
     * `bulgarian_split_squat` under Quads, and the glutes are a prime mover in all three. Summing
     * `muscle === 'Glutes'` therefore measures the catalogue's filing convention, not her training.
     *
     * `capability` is the grouping that survives that convention — `hip_dominant` vs `knee_dominant`
     * is the split a coach actually means by "posterior chain vs quads" — and measured on it the
     * week is not quad-dominant at any frequency:
     *
     *     3 days   hip 12 : knee  7      5 days   hip 20 : knee 18
     *     4 days   hip 22 : knee 16      6 days   hip 38 : knee 23
     *
     * ⚠️ CALVES AND CORE ARE EXCLUDED, and they must be: a calf raise is `knee_dominant` and a
     * hanging leg raise is `hip_dominant`, and neither is what this ratio is about. Including them
     * was what made the first reading of this measurement wrong too.
     *
     * So the guarantee is stated where it is true: the lower body must never become a quad programme
     * with the posterior chain as an afterthought. 0.8 is the floor — below it the hinge and the
     * thrust have stopped being half the training.
     */
    const thin: string[] = [];
    for (const c of await sweep()) {
      let hip = 0;
      let knee = 0;
      for (const d of workouts(c.p))
        for (const s of d.slots) {
          const ex = exerciseById(s.exerciseId);
          if (!ex || ex.muscle === 'Calves' || ex.muscle === 'Core') continue;
          if (ex.capability === 'hip_dominant') hip += s.setCount;
          if (ex.capability === 'knee_dominant') knee += s.setCount;
        }
      if (knee === 0) continue; // she switched the quads off — nothing to compare
      // …and a mark on a knee muscle is her own request for more of it (S-4), not an imbalance.
      if (/Quads":"emphasis|Hamstrings":"emphasis|Glutes":"emphasis/.test(c.label)) continue;
      const ratio = hip / knee;
      if (ratio < 0.8) thin.push(`${c.label}: hip ${hip} : knee ${knee} = ${ratio.toFixed(2)}`);
    }
    expect(thin).toEqual([]);
  });

  it('⛔ …and the numbers only move the right way — today’s measured ceilings', async () => {
    /*
     * ⛔ THE REGRESSION FLOOR UNDER THE THREE PINS BELOW.
     *
     * The three `it.failing` blocks after this one hold the engine to the standard a coach would set,
     * and the engine does not meet it yet. That leaves a hole: a change could make the week WORSE and
     * every one of them would stay red exactly as before, saying nothing.
     *
     * So this pins what the engine delivers TODAY, measured 2026-08-11 over the same sweep:
     *
     *                        before          after      (the full sweep, including two-mark maps)
     *   under MEV (3d+)          ~10              0     ← now a strict law, above
     *   lower body at 1×/week      yes             no    ← the worst of them; see assignRegionDays
     *   clumped muscles            25              8
     *   push:pull, 5 days ♀      2.29           1.88
     *   push:pull, worst         2.33           2.33     (6 days — untouched)
     *   share inversions           64             72     ⛔ WORSE
     *   share RMSE              3.008%         3.155%    ⛔ WORSE
     *
     * ⛔ AND TWO OF THOSE WENT THE WRONG WAY. Recorded here rather than left out, because a fix
     * reported only by the numbers it improved is not a measurement. Spreading a muscle across its
     * days moves sets between muscles, and where a big muscle's lifts were previously clumped onto
     * one day the cap had been cutting them there — which, by accident, sometimes left the
     * PROPORTIONS closer to the table even while it starved the muscle. Trading five share
     * inversions for six muscles brought up off MEV is the right trade (a muscle under MEV is
     * training that costs her the session and buys no growth; an inversion is a week that grows the
     * wrong muscle slightly faster), but it IS a trade and it is not free.
     *
     * These are CEILINGS ON A KNOWN GAP, not targets. A change that improves the week leaves them
     * green; a change that gives any of it back turns them red on the spot. When a pin below goes
     * green its ceiling here comes out with it.
     *
     * ════ RE-CUT 2026-08-11, WHEN THE CLUMPING PIN CLOSED ════
     *
     *                            before        after
     *   clumped muscles              7            0     ← now a LAW below; its ceiling is gone
     *   share inversions            35           40     ⛔ WORSE
     *   push:pull, worst          1.75         1.83     ⛔ WORSE
     *   under MEV                    0            0
     *
     * ⛔ AND THE TWO THAT WENT THE WRONG WAY ARE THE SAME FACT SEEN TWICE. Every clump this closed
     * was Shoulders, and a clumped muscle is one the time cap cuts: three shoulder lifts on one day
     * is the most over-served muscle on that day, so that is where the cap took them from. Spread
     * across its three days, Shoulders keeps its sets — which is the fix working, and it moves the
     * count like this:
     *
     *     Shoulders < Triceps ......  5 → 0     the inversion the clump was CAUSING
     *     Quads     < Triceps ......  1 → 0
     *     Back      < Shoulders ....  0 → 4     ⛔ new — and it is the pin below, not this change
     *
     * Shoulders did not overtake Back by growing past its share; it overtook Back because **Back is
     * short**, which is the unclosed defect the share-inversion pin holds and whose cause is now
     * traced in full there. The clump was hiding it by holding Shoulders down too.
     *
     * ⚠️ THE TRADE, STATED PLAINLY: seven muscles whose work was piled onto one day against five
     * proportion errors, none of which crosses the push:pull line a coach names (the law below caps
     * that at 2.0 and the worst week is 1.83). A muscle trained 3/1/1 across its days is worse
     * training than one trained slightly ahead of its share — the clumped day is over-stimulus she
     * cannot recover from and the other two are under it. Taken deliberately, recorded here.
     */
    let clumps = 0;
    let inversions = 0;
    let worstPushPull = 0;
    for (const c of await sweep()) {
      const perDay: Record<string, number[]> = {};
      for (const d of workouts(c.p)) {
        const n: Record<string, number> = {};
        for (const s of d.slots) {
          const m = muscleOf(s.exerciseId);
          if (m) n[m] = (n[m] ?? 0) + 1;
        }
        for (const m of Object.keys(n)) (perDay[m] ??= []).push(n[m]);
      }
      for (const [m, counts] of Object.entries(perDay)) {
        if (m === 'Core' || counts.length < 2) continue;
        if (Math.max(...counts) - Math.min(...counts) > 1) clumps += 1;
      }
      if (c.days < 3) continue;
      const marked = new Set(Object.keys(c.want).filter((m) => (c.got[m] ?? 0) > (c.want[m] ?? 0)));
      const muscles = Object.keys(c.want).filter((m) => !marked.has(m));
      for (const big of muscles)
        for (const small of muscles) {
          if ((MUSCLE_VOLUME_SHARE[big] ?? 1) - (MUSCLE_VOLUME_SHARE[small] ?? 1) < 0.3) continue;
          const a = c.got[big] ?? 0;
          if (a > 0 && (c.got[small] ?? 0) > a) inversions += 1;
        }
      const push = ['Chest', 'Shoulders', 'Triceps'].reduce((a, m) => a + (c.got[m] ?? 0), 0);
      const pull = ['Back', 'Biceps'].reduce((a, m) => a + (c.got[m] ?? 0), 0);
      if (c.want.Back != null && c.want.Biceps != null) worstPushPull = Math.max(worstPushPull, push / Math.max(1, pull));
    }
    expect({
      // ⚠️ ZERO, AND IT IS A LAW NOW — the block at the foot of this file owns it. Kept in the
      // scoreboard because a ratchet that only counts what is still broken cannot notice a closed
      // thing re-opening on a week this sweep covers and that one does not.
      clumps: clumps === 0,
      inversions: inversions <= 40,
      worstPushPull: worstPushPull <= 1.85,
    }).toEqual({ clumps: true, inversions: true, worstPushPull: true });
  });

  it('⛔ EVERY mark her screens can actually place is a mark she gains from', async () => {
    /*
     * ⛔ THE CLOSE, 2026-08-11. The pin below records ten engine attempts on this defect and why each
     * was reverted; the resolution was a RULE rather than an eleventh fix — `emphasisRefusal` refuses
     * a second mark that would compete with the first for the same sessions.
     *
     * This is the test that makes the rule mean something. It replays the rule exactly as the two
     * screens apply it (mark in order, skip what is refused), throws away every configuration the
     * rule makes unreachable, and asserts the promise over what is LEFT — every single mark and every
     * legal pair, five frequencies, both sexes.
     *
     *     330 reachable marks · ZERO lowered · 2 that buy nothing
     *
     * ⚠️ IT WAS 1 LOWERED FOR AN HOUR. A single mark (male, 3 days) took Chest from 15 weekly sets to
     * 14, and it closed as a side effect of the push:pull work later the same day: `essentialPatternOf`
     * taught the time cap that a `row_supported` is the day's ROW, which stopped a full-body session
     * losing its only back lift. The mark had not been broken — the week under it had.
     *
     * The two that buy nothing are both at two days, where the week has no room to give anything, and
     * they are pinned in `everyAthleteTheEngineCanMeet`'s ratchet rather than hidden in this number.
     *
     * ⚠️ THE UNREACHABLE CONFIGURATIONS ARE NOT SWEPT UNDER THE RUG — they are counted in the pin
     * below, which stays red at full strength precisely so nobody reads this green as "the engine can
     * serve two competing marks". It cannot. It is no longer asked to.
     */
    const ALL = CANONICAL_MUSCLE_ORDER.filter((m) => m !== 'Core');
    const bad: string[] = [];
    let reachable = 0;
    for (const days of DAYS)
      for (const sex of SEXES) {
        const plain = delivered(await build(athlete({ daysPerWeek: days, sex })));
        const configs: string[][] = ALL.map((m) => [m]);
        for (let i = 0; i < ALL.length; i += 1)
          for (let j = i + 1; j < ALL.length; j += 1) configs.push([ALL[i], ALL[j]]);
        for (const cfg of configs) {
          const map: Record<string, MuscleStance> = {};
          for (const m of cfg) if (!emphasisRefusal(map, m, CANONICAL_MUSCLE_ORDER, days)) map[m] = 'emphasis';
          if (Object.keys(map).length !== cfg.length) continue; // the rule blocks it — she cannot get here
          const got = delivered(await build(athlete({ daysPerWeek: days, sex, bodyMap: map })));
          for (const m of cfg) {
            reachable += 1;
            if ((got[m] ?? 0) < (plain[m] ?? 0)) bad.push(`${sex} ${days}d ${cfg.join('+')}: ${m} ${plain[m]} → ${got[m]}`);
          }
        }
      }
    /* The sweep really covered the space — a green run on an empty read would prove nothing. */
    expect(reachable).toBeGreaterThan(300);
    /* No remainder. Every mark her screens can place now adds to the muscle it is placed on. */
    expect(bad).toEqual([]);
  });

  it.failing('⛔ a mark is a dose, not a licence — it may not run past the ceiling or empty a donor', async () => {
    /*
     * ⛔ FOUND 2026-08-11 WHILE CLOSING PUSH:PULL, AND IT IS PRE-EXISTING — verified against the tree
     * as it stood that morning (80 over-ceiling cases then, 81 now; donors drained 188 then, 141 now,
     * so the ceiling-squeeze that closed push:pull improved this by a quarter and caused none of it).
     *
     * Two things a mark may not do, and today it does both:
     *
     *   · DELIVER PAST THE CEILING. 81 of 330 reachable marks finish ABOVE `WEEKLY_SETS_CEILING`, and
     *     the worst is Back at FIFTY weekly sets on a six-day week. Thirty is already generous — the
     *     constant's own note calls it "deliberately above the ~20 the evidence calls the point of
     *     diminishing returns". Fifty is not a bigger dose, it is junk volume: it costs her the hour
     *     and buys nothing, and no coach would write it.
     *
     *   · EMPTY A DONOR. 141 cases take 8 or more weekly sets off an unmarked muscle, e.g. marking
     *     Chest at four days takes Back from 14 to 6 — the MEV floor. `weeklyTargets` already refuses
     *     to take a donor UNDER the floor, and `growEmphasised` refuses too; what neither bounds is
     *     how far a donor may fall TOWARDS it. "Lead with this muscle" is not "stop training that one".
     *
     * ⚠️ NOTE HOW THIS WAS FOUND: only by sweeping the marks the RULE now permits and reading the
     * delivered numbers, rather than the ratios. Every push:pull case flagged with `Chest: emphasis`
     * looked like "she asked for it" until the absolute figures were read — Chest 34, Back 11.
     * A ratio can be defended; thirty-four weekly sets cannot.
     *
     * -- 2026-08-11 - MOSTLY CLOSED, AND THE REMAINDER NAMED -------------------------------------
     * Two bounds shipped, both in the volume layer where the claim is made:
     *
     *   - the emphasis TRANSFER stops one exercise-block past `WEEKLY_SETS_CEILING`. It had no bound
     *     at all and ran to fifty.
     *   - NO SINGLE DONOR carries the whole mark - one block each. The donor was re-chosen as
     *     "whoever has most" every block, which let one large muscle be the richest three times over.
     *
     *                                  before      after
     *     marks delivered above 30 ....  81         34   (worst 50 -> 35)
     *     donors losing 8+ sets ....... 141         76   (worst Chest 18 -> 6, unchanged)
     *     marks that LOWER the muscle .   0          0
     *
     * WHAT IS LEFT, AND WHY IT IS STILL RED. Thirty-five is bounded and arguable - a specialisation
     * block does run one muscle hot - but the DONOR side is not: marking Shoulders still takes Chest
     * from 18 weekly sets to 6. Traced, the amplification is NOT in the transfer (the target moves one
     * block, 26 -> 21) and NOT in `growEmphasised` (bounding its donor at a third of what it holds
     * changed nothing). It is SELECTION: a marked Shoulders takes SEVEN of the upper region's 21
     * slots, and the cap then cuts Chest because the marked muscle is protected. Capping the marked
     * muscle's exercise count is the obvious next move and is exactly the change that broke
     * `emphasis earns MORE exercises` twice already - it must bind on the MARKED muscle only.
     *
     * IT WAS TRIED, 2026-08-11, AND IT CASCADED. Three changes, each written to repair the one before:
     *
     *   1. bound the MARKED muscle's count at one more lift than it would get unmarked
     *      (`plainWant + 1`) ....... over-30 34 -> 12, donors 76 -> 50, and BROKE S-4/S-63: the extra
     *                               lift is exactly what a full day turns away, so marked and
     *                               unmarked both came out at five.
     *   2. …so let a marked muscle's lift past the day-capacity refusal ....... fixed that, and put
     *                               EIGHTEEN sessions on a repeated movement, because `mustPlace`
     *                               waives the pattern-clash guard as well as the lift limit.
     *   3. …so split the two flags, capacity only ....... clash gone, S-4/S-63 still tied. Traced to
     *                               SELECTION: `pickExercises` returned flat/incline/decline/fly/fly/
     *                               fly for a marked chest, because the diversity score knows whether
     *                               a pattern is used and not HOW OFTEN. Counting uses (2/2/1/1
     *                               instead of 1/1/1/3) fixed the chest and broke four other laws,
     *                               including this file's own "every mark is a mark she gains from".
     *
     * All three reverted. `plainWant + 2` was measured too and is inert — the numbers return exactly
     * to the unbounded ones, so it is not a smaller version of the fix, it is no fix.
     *
     * WHAT THAT ESTABLISHES: the marked muscle's count cannot be bounded without also changing how
     * its lifts are SELECTED, and the selection score is shared by every muscle and every law that
     * rests on it. This is a coherent piece of work, not a one-line guard, and it should be started
     * deliberately rather than as the fourth repair in a chain.
     *
     * A HARD ceiling (no block of headroom) is better on every number here - nothing above 30, donors
     * 48 - and was NOT taken, because it breaks S-4/S-63: a marked chest and an unmarked one both come
     * out at five lifts. The law outranks the tidier number, and that trade is recorded on the test
     * that owns it.
     */
    const ALL = CANONICAL_MUSCLE_ORDER.filter((m) => m !== 'Core');
    const past: string[] = [];
    const emptied: string[] = [];
    for (const days of DAYS)
      for (const sex of SEXES) {
        const plain = delivered(await build(athlete({ daysPerWeek: days, sex })));
        const configs: string[][] = ALL.map((m) => [m]);
        for (let i = 0; i < ALL.length; i += 1)
          for (let j = i + 1; j < ALL.length; j += 1) configs.push([ALL[i], ALL[j]]);
        for (const cfg of configs) {
          const map: Record<string, MuscleStance> = {};
          for (const m of cfg) if (!emphasisRefusal(map, m, CANONICAL_MUSCLE_ORDER, days)) map[m] = 'emphasis';
          if (Object.keys(map).length !== cfg.length) continue; // the rule blocks it
          const got = delivered(await build(athlete({ daysPerWeek: days, sex, bodyMap: map })));
          for (const m of cfg) if ((got[m] ?? 0) > WEEKLY_SETS_CEILING) past.push(`${sex} ${days}d ${cfg.join('+')}: ${m} = ${got[m]}`);
          for (const m of ALL) {
            if (map[m]) continue;
            const lost = (plain[m] ?? 0) - (got[m] ?? 0);
            if (lost >= 8) emptied.push(`${sex} ${days}d ${cfg.join('+')}: ${m} ${plain[m]} → ${got[m]}`);
          }
        }
      }
    expect({ pastTheCeiling: past.slice(0, 6), donorsEmptied: emptied.slice(0, 6) }).toEqual({
      pastTheCeiling: [],
      donorsEmptied: [],
    });
  });

  it('⛔ two marks on ONE region — the second mark must not be eaten by the first', async () => {
    /*
     * ⛔ FOUNDER'S ITEM 8: *"והכל עובד תקין ומקבלים את התוכניות הטובות בעולם גם אם מסמנים שריר
     * כEMPHASIS וגם 2 שרירים? כי זה מוגדר עד 2 אם אני זוכר נכון."*
     *
     * Two marks work when they sit on DIFFERENT regions. On the SAME region the larger share eats the
     * smaller, and the smaller mark comes out BELOW where it started — the athlete asked for more of a
     * muscle and got less of it. Measured (male, and identical for female):
     *
     *     6 days · Quads + Glutes marked    Quads 23 → 36     Glutes 21 → 12   ⛔
     *     3 days · Chest + Back  marked     Back  7 → 16      Chest  15 → 10   ⛔
     *
     * ── 2026-08-11 · ATTACKED DIRECTLY AND NOT CLOSED. WHAT WAS LEARNED ─────────────────────────
     * ⛔ Three fixes were written for this and TWO WERE REVERTED, both by measurement:
     *
     *   · reading the real `weeklyTargets` in the cap's `claimOf` instead of reconstructing the
     *     target from `MUSCLE_VOLUME_SHARE` — more correct, moved nothing, cost 3 inert marks;
     *   · refusing to drop an UNDER-served muscle's isolation, which is the actual mechanism here
     *     (Glutes' pool is isolations, Quads' is compounds, and the cap drops isolations first). It
     *     worked — Glutes 12 → 21 — and pushed `everyAthleteTheEngineCanMeet`'s ratchet from 147 to
     *     205 against a ceiling of 192. Fifty-eight SINGLE marks broken to fix three double ones.
     *
     * What shipped is the third: marks that share a REGION now share its room, since they compete
     * for the same sessions. Measured in isolation it is worth having — double-mark cases 12 → 8 and
     * the sets they lose 35 → 25 — and without it the ratchet fails.
     *
     * ⚠️ AND THE HONEST NUMBER AGAINST THE ENGINE AS IT STOOD THIS MORNING IS WORSE, NOT BETTER:
     *
     *     before all of 2026-08-11 ....... 3 cases, 21 weekly sets lost
     *     after .......................... 8 cases, 25 weekly sets lost
     *
     * The count moved mostly because the BASELINE moved: the unmarked week is materially better now
     * (no region at one session, no muscle under MEV, no clumping), so "marked delivers less than
     * unmarked" fires in places it could not before. The worst single case did improve — Glutes at
     * six days went 21 → 12 and is now 21 → 15. But the defect is not closed and this is not a fix
     * being reported as one.
     *
     * ── SIX ATTEMPTS, THREE LAYERS, ONE RESULT ──────────────────────────────────────────────────
     * Written out because the diagnosis is solid and every fix that follows from it fails the same
     * way, and the seventh reader deserves to know that before spending the day on it.
     *
     *   1. Deal muscles in SHARE order instead of canonical order ......... worse on every measure
     *   2. Cap selection at a muscle's share of its region's slots ........ broke `emphasis earns
     *                                                                       MORE exercises` (an
     *                                                                       UNMARKED chest 5 → 3)
     *   3. Give the cap the real `weeklyTargets` for its claim ............ no effect, cost 3 marks
     *   4. Refuse to drop an UNDER-served muscle's isolation .............. fixed it (Glutes 12→21),
     *                                                                       ratchet 147 → 205 ⛔
     *   5. Two-pass selection: ask first, give back by share if the region
     *      is over-subscribed .......................................... same break as #2, because
     *                                                                       EVERY region is always
     *                                                                       over-subscribed
     *   6. Rank the trim by muscle share, tier only WITHIN a muscle ....... ratchet over ceiling AND
     *                                                                       a mark lowering itself
     *                                                                       (Quads 16 → 15)
     *
     * ⛔ WHAT THAT MEANS. "Deal more than fits, then let the time cap decide" is LOAD-BEARING, not an
     * accident: the cap is the only pass that knows what a lift actually costs in her measured rest
     * and set duration, so every attempt to pre-empt it with a COUNT loses information it has. And
     * the tier rule it trims by — isolations first — is what serves the common case (one mark), which
     * is why every intervention that helps two marks on one region is paid for by single marks.
     *
     *   7. Split the CATALOGUE's `thrust` pattern, and name the glutes' hinge essential
     *      ...................................................... split: no effect on this defect;
     *                                                              essential-pattern: ratchet 236 ⛔
     *
     * ── #7 IN FULL, BECAUSE IT WAS THE MOST PROMISING AND IT FAILED MOST CLEANLY ─────────────────
     * The theory was that the CATALOGUE, not the engine, shaped Glutes like an isolation muscle:
     * `hip_thrust`, `glute_bridge`, `machine_hip_thrust` and `single_leg_hip_thrust` were all one
     * `thrust` pattern, so with a day forbidden from repeating a muscle's pattern the glutes could
     * place one compound per day and everything else they own is an accessory.
     *
     * `thrust` was split into `thrust` / `bridge` (a floor bridge and a bench thrust are different
     * ROMs — the split is catalogue-correct and it stays). ⛔ AND IT DID NOT TOUCH THIS DEFECT: over
     * sixty programmes it produced **zero** days holding two thrust-family lifts. The clash rule was
     * never what bound the glutes, which the pipeline trace then showed directly — the assembler
     * deals four glute lifts at four and five days and the athlete receives two, because the two that
     * die are `cable_pull_through` and `hip_abduction` and the cap drops ISOLATIONS first.
     *
     * Naming the hinge essential (`ESSENTIAL_PATTERNS.Glutes`) fixes that — 2 lifts to 3 — and takes
     * the ratchet from 147 to 236. See the note on `ESSENTIAL_PATTERNS` for why, and for the evidence
     * that the damage is real rather than a moving baseline (Shoulders 3 → 28, Triceps 7 → 26).
     *
     * ── SO THE HONEST STATE OF THIS DEFECT ──────────────────────────────────────────────────────
     * It is bounded by a fact about the WEEK, not by any one pass: at four and five days the lower
     * region has TWO sessions holding four muscles, and at three days everything is full-body. There
     * is no spare lift in those weeks. Every fix above works by taking a lift from somewhere else,
     * and the ratchet exists to notice exactly that.
     *
     * The lead that has NOT been tried: the hinges that build glutes hardest — `bb_rdl`,
     * `bb_deadlift` — are filed under Hamstrings, so the engine cannot see that a glute-emphasis week
     * already contains heavy glute work. `capability` ('hip_dominant') is the field that knows, and
     * the hip-vs-knee law above is the first thing in the suite to read it. Teaching VOLUME to read
     * it too is a bigger change than a day's work and should be decided deliberately.
     *
     * ── OPTION (a) · THREE ATTACKS AT THE VOLUME LAYER, 2026-08-11 ──────────────────────────────
     * Founder: *"תלך על א'"* — fix it upstream, in `weeklyTargets`, rather than in the passes that
     * clean up after it. Three bounds were written and all three were reverted by measurement:
     *
     *   8.  Stop the transfer at `WEEKLY_SETS_CEILING` (30). The constant is ratified, every other
     *       target already clamps to it, and this transfer was the ONE path that ignored it — two
     *       marks reached 50 weekly sets each. ⛔ Four laws broke: `startingWeeklySets` already
     *       saturates every muscle at 30 by six days, so an absolute ceiling deletes emphasis
     *       entirely at the frequencies with the most room for it.
     *   9.  Bound it by the LIFTS a region can hold (`regionDays × 2`). ⛔ Collides head-on with
     *       `S-4/S-63 · emphasis earns MORE exercises`, which requires a marked muscle to reach more
     *       than five lifts — more than a two-day region physically holds.
     *   10. Give same-region marks NO target transfer, and let the emphasis land as SETS instead
     *       (`setsFor` +1 and `growEmphasised`, which the region CAN deliver). Best of the three —
     *       four-day same-region marks went to zero lowered — but ⛔ the ratchet and the clumping
     *       ceiling both broke: a mark that moves no target reads as inert.
     *
     * ⛔ WHAT THE THREE OF THEM ESTABLISH, AND IT IS NOT A BUG. This is a CONFLICT BETWEEN TWO
     * RATIFIED RULES under a fixed hour:
     *
     *     S-4 / S-63    a mark earns MORE EXERCISES for the muscle it is placed on
     *     S-64          the session is 45–60 minutes, so a region holds `days × 7` lifts and no more
     *
     * One mark fits inside that. TWO marks competing for the SAME sessions do not, and no allocation
     * rule can make them: something must be refused, and every fix above differs only in WHICH rule
     * it chooses to break. Ten attempts across five layers — selection, dealing, trimming, the
     * catalogue, and now volume — and each one paid for two same-region marks with single marks
     * everywhere else.
     *
     * ── AND THE SCOPE IS NOW EXACT, WHICH MATTERS MORE THAN ANOTHER ATTEMPT ─────────────────────
     * Swept over eight muscle pairs × four frequencies × both sexes:
     *
     *     4, 5, 6 days · marks on DIFFERENT regions .... 36 marks, ZERO lowered — it works
     *     4, 5, 6 days · marks on the SAME region ....... 3 lowered
     *     3 days (every session is full-body) .......... 3 lowered — no two marks can be separated
     *
     * So the engine honours two marks whenever they do not compete for the same sessions, and cannot
     * when they do. That is a statement about the athlete's hour, not about this code.
     *
     * ⚠️ THE REMAINING FIX IS A PRODUCT DECISION, NOT AN ENGINE ONE, and it is the founder's to make:
     * F-4 already bounds her to two marks; bounding them to one per region (or telling her, in words,
     * that a second mark on the same half of the body will cost the first) is the same kind of rule
     * and it closes this honestly. Held for him rather than chosen here.
     *
     * The rule is unchanged and so is this test: a mark may never lower the muscle it is on.
     *
     * ⚠️ PRE-EXISTING, and verified so rather than assumed: the same numbers come out of the tree with
     * every 2026-08-11 change stashed. The region-day floor added that day is not the cause (the day
     * split is identical in both), and the dealer fix slightly IMPROVED the 3-day case (Chest 8 → 10).
     *
     * WHY: `weeklyTargets` hands each marked muscle its chunks in turn out of one donor pool, and the
     * muscle with the larger `MUSCLE_VOLUME_SHARE` both draws more and then out-competes its
     * neighbour for the region's limited lift slots — so the second mark's volume has nowhere to land
     * and is taken back. F-4 permits two marks; it does not yet make them independent.
     *
     * Left red at full strength. The one thing a mark may never do is lower the muscle it is on.
     *
     * ════════════════════════════════════════════════════════════════════════════════════════════
     * ⛔ CLOSED 2026-08-11 — BY THE PRODUCT RULE ABOVE, WHICH IS THE ONE THIS NOTE ASKED FOR.
     *
     * The paragraph three screens up ends: *"the remaining fix is a product decision, not an engine
     * one, and it is the founder's to make: F-4 already bounds her to two marks; bounding them to
     * one per region … closes this honestly. Held for him rather than chosen here."*
     *
     * He answered — *"תלך על הכלל המלא"* — and `emphasisRefusal` is the rule: a second mark is
     * refused on a region that already carries one, and refused outright on a full-body week.
     *
     * ⚠️ SO THE THREE SURVIVING CASES ARE NOT FIXED. THEY ARE UNREACHABLE, and that is a different
     * claim, so it is asserted rather than assumed. Measured, every map this block used to sweep:
     *
     *     Quads+Glutes   3d ✗   4d ✗   5d ✗   6d ✗       ✗ = her screens refuse the second mark
     *     Chest+Back     3d ✗   4d ✗   5d ✗   6d ✗
     *
     * The engine still delivers those three cases if a map is handed to it directly — nothing in the
     * volume layer changed and ten attempts recorded above say nothing there can. What changed is
     * that no athlete can ask for one. A defect behind a door that cannot be opened is closed; a
     * defect behind a door we merely stopped drawing is not, which is why the FIRST assertion below
     * is about the door.
     *
     * ⚠️ AND IT RE-ARMS ITSELF. `reachableMarks` builds every map through `emphasisRefusal`, so if
     * the rule is ever loosened — a per-region budget of two, a different `FULL_BODY_UNTIL_DAYS` —
     * the pairs come back into the sweep on their own and this test goes red without being edited.
     * ════════════════════════════════════════════════════════════════════════════════════════════
     */
    const PAIRS: Record<string, MuscleStance>[] = [
      { Quads: 'emphasis', Glutes: 'emphasis' },
      { Chest: 'emphasis', Back: 'emphasis' },
    ];
    /** The map she is left with after her screens have had their say — `null` when they refuse it. */
    const reachableMarks = (want: Record<string, MuscleStance>, days: number) => {
      const map: Record<string, MuscleStance> = {};
      for (const [m, stance] of Object.entries(want)) {
        if (stance !== 'emphasis') { map[m] = stance; continue; }
        if (emphasisRefusal(map, m, CANONICAL_MUSCLE_ORDER, days)) return null;
        map[m] = 'emphasis';
      }
      return map;
    };

    // ⛔ FIRST: the door. Both same-region pairs are refused at every frequency she can choose.
    const placeable: string[] = [];
    for (const days of [3, 4, 5, 6])
      for (const pair of PAIRS) if (reachableMarks(pair, days)) placeable.push(`${days}d ${Object.keys(pair).join('+')}`);
    expect(placeable).toEqual([]);

    // …and then the law itself, over every map that IS reachable.
    const eaten: string[] = [];
    for (const days of [3, 4, 5, 6])
      for (const sex of SEXES)
        for (const pair of PAIRS) {
          const bodyMap = reachableMarks(pair, days);
          if (!bodyMap) continue; // her screens refuse it — asserted above, not assumed here
          const marked = delivered(await build(athlete({ daysPerWeek: days, sex, bodyMap })));
          const plain = delivered(await build(athlete({ daysPerWeek: days, sex })));
          for (const m of Object.keys(bodyMap))
            if ((marked[m] ?? 0) < (plain[m] ?? 0)) eaten.push(`${sex} ${days}d ${JSON.stringify(bodyMap)}: ${m} ${plain[m]} → ${marked[m]}`);
        }
    expect(eaten).toEqual([]);
  });

  it('⛔ pulling is never dwarfed by pushing WHERE SHE HAS NOT ASKED FOR MORE PUSHING', async () => {
    /*
     * ⛔ THE HALF OF THE PUSH:PULL PIN THAT IS NOW CLOSED (founder 2026-08-11).
     *
     * Measured by CAPABILITY, so each set is counted exactly once — `horizontal_push +
     * vertical_push` against `horizontal_pull`. The naive "effective volume" reading is not used
     * here and the header explains why: it double-counts a bench press onto both sides.
     *
     * The defect was real and it was in the ENGINE, not the ruler:
     *
     *     male 3 days, no map at all ......... 2.08 : 1
     *
     * Cause: the catalogue split `row` into `row`/`row_supported`, and `ESSENTIAL_PATTERNS.Back`
     * still said `['row','pulldown']`. The time cap therefore did not recognise a cable row as the
     * day's row, and a full-body session was left with NO BACK LIFT AT ALL — Back delivered 7 weekly
     * sets against a target of 21 while Chest delivered 15 of 18. `essentialPatternOf` maps the split
     * names back onto the movement, and that case is now 1.44 : 1.
     *
     * ⚠️ THIS ASSERTS THE CASE SHE DID NOT CHOOSE. A mark on Chest is a request for more pushing and
     * the ratio SHOULD rise — those weeks are excluded here and bounded by the ceiling test instead.
     * What may never happen is a push-dominant week she never asked for.
     */
    const bad: string[] = [];
    for (const c of await sweep()) {
      if (c.days < 3) continue;
      if (/(Chest|Shoulders|Triceps)":"emphasis/.test(c.label)) continue; // she asked for it
      if (c.want.Back == null || c.want.Biceps == null) continue; // a map with pulling switched off
      let push = 0;
      let pull = 0;
      for (const d of workouts(c.p))
        for (const s of d.slots) {
          const ex = exerciseById(s.exerciseId);
          if (!ex) continue;
          if (ex.capability === 'horizontal_push' || ex.capability === 'vertical_push') push += s.setCount;
          if (ex.capability === 'horizontal_pull') pull += s.setCount;
        }
      if (pull > 0 && push / pull > 2.4) bad.push(`${c.label}: push ${push} : pull ${pull} = ${(push / pull).toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });

  /*
   * ════ WHAT IS LEFT OF PUSH:PULL, AND THE THREE ATTEMPTS THAT DID NOT CLOSE IT (2026-08-11) ════
   *
   * The block above closed the case that mattered most — a default programme nobody had customised —
   * by teaching the cap that a `row_supported` is the day's row. FIVE cases remain, all at five and
   * six days, all female, and they share one cause traced through the pipeline:
   *
   *     Biceps   target 20   wants 4 lifts   dealt 2   →  6 sets
   *     Back     target 30   wants 6 lifts   dealt 5   → 15 sets
   *     Chest / Shoulders / Triceps ......... dealt in full
   *
   * At six days the upper region asks for 26 lifts and holds 21. Chest, Shoulders and Triceps are
   * dealt first — CANONICAL order, which is a determinism tie-break and was never meant to be a
   * priority — so Back and Biceps pay the whole difference. Back has the LARGEST share in the table
   * (1.5, against Chest's 1.3) and an equal target, and is still dealt one lift fewer.
   *
   * ⛔ THREE FIXES WERE WRITTEN FOR EXACTLY THAT AND ALL THREE WERE REVERTED:
   *
   *   · deal both passes in SHARE order ....... 5 cases → 3, and broke S-66 (a leave-it no longer
   *                                             survived the off→on round trip) and `emphasis earns
   *                                             MORE exercises`
   *   · share order for ISOLATIONS only ....... 5 cases → 4, still broke the emphasis law
   *   · let a muscle below its share past the
   *     day-capacity refusal .................. capability reading 5 → 3, but the TORSO reading got
   *                                             worse (2.53 → 2.92) and the twin pin re-opened
   *
   * ⚠️ AND THE METRIC WAS CHALLENGED BEFORE THE ENGINE WAS BLAMED, which is the only reason this note
   * is trustworthy. Three readings of the same 48 programmes:
   *
   *     by capability (a curl counts as pull) ....... 5 over 2.0 · worst 2.33
   *     by TORSO (Chest+Shoulders against Back) ..... 6 over 2.0 · worst 2.53   ← the strictest
   *     by muscle, on EFFECTIVE volume .............. 1 over 2.0 · worst 2.04
   *
   * The torso reading is the one a coach means most directly — pressing against rowing, arms out of
   * it — and it is the WORST of the three. So the imbalance is not an artefact of counting curls as
   * pull, and it is not dissolved by indirect volume. It is real, and it is left red.
   *
   * ════ CLOSED 2026-08-11 — AND THE DEALER WAS NEVER THE PROBLEM ════
   *
   * ⛔ The four attempts above all aimed at WHO GETS THE LEFTOVER LIFTS, because that is where the
   * symptom was visible. The cause was one line upstream, in `startingWeeklySets`:
   *
   *     `Math.min(WEEKLY_SETS_CEILING, …)` was applied to each muscle ON ITS OWN.
   *
   * So every muscle whose share carried it past 30 came out at EXACTLY 30, and the share table — the
   * only thing in the engine that knows a back is not a chest — was erased for precisely the muscles
   * it matters most for. At five days Back's 35 and Chest's 30 both became 30; at six days SIX
   * muscles landed on 30 together. The dealer was then handed a week with no shape left in it and
   * fell back on canonical order, which puts Back fourth and Biceps fifth.
   *
   * That is also why the defect lived ONLY at five and six days: below five nothing clamps, the
   * shares hold, and the delivered week came out at 1.44–1.47 the whole time.
   *
   * The ceiling now applies to the LARGEST muscle and squeezes the rest with it — the biggest target
   * still lands exactly on `WEEKLY_SETS_CEILING`, so the register's bound is kept to the set, and the
   * ratios survive it. Measured over the same 48 programmes:
   *
   *                       before        after
   *     by capability     5 · 2.33      0 · 1.75
   *     by TORSO          6 · 2.53      1 · 2.10
   *     by effective      1 · 2.04      0 · 1.52
   *
   * ⚠️ AND EVERY GUARANTEE HELD: minutes [45, 60] with no breach, every set inside F-1, nothing under
   * MEV, no muscle below twice a week, determinism intact.
   */
  it('⛔ pulling is never dwarfed by pushing — the imbalance a coach names first', async () => {
    /*
     * The share table asks for roughly 1.2 push : 1 pull (Chest 1.3 + Shoulders 1.2 + Triceps 0.7
     * against Back 1.5 + Biceps 0.7). Delivered was 2.29:1 at five days before the dealer was fixed.
     * 2.0 is the ceiling this pins — above it the week reads as a push programme with pulling on the
     * side, which is the single most common criticism of a machine-written hypertrophy plan.
     */
    const PUSH = ['Chest', 'Shoulders', 'Triceps'];
    const PULL = ['Back', 'Biceps'];
    const bad: string[] = [];
    for (const c of await sweep()) {
      if (c.days < 3) continue;
      if (!PULL.every((m) => c.want[m] != null)) continue; // a map with pulling switched off
      const push = PUSH.reduce((a, m) => a + (c.got[m] ?? 0), 0);
      const pull = PULL.reduce((a, m) => a + (c.got[m] ?? 0), 0);
      const ratio = push / Math.max(1, pull);
      if (ratio > 2.0) bad.push(`${c.label}: push ${push} : pull ${pull} = ${ratio.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });

  it.failing('⛔ a muscle with a LARGER share never delivers less than one with a smaller share', async () => {
    /*
     * The share table's whole purpose, asserted directly. A back is not a calf: if `MUSCLE_VOLUME_SHARE`
     * says Back 1.5 and Calves 0.6, a week where the calves out-train the back has thrown the table
     * away. Compared only where the gap is clear (≥ 0.3), so ordinary rounding between neighbours
     * (Chest 1.3 vs Hamstrings 1.2) is not read as an inversion.
     *
     * ⚠️ EMPHASIS IS EXCLUDED FROM BOTH SIDES — a mark is the athlete overriding the table on purpose
     * (S-4), and it is supposed to move the muscle past its share. That is the mark working.
     *
     * ════════════════════════════════════════════════════════════════════════════════════════════
     * ⛔ 2026-08-11 · STILL RED, AND THE CAUSE IS NOW EXACT. It is not in selection, dealing or
     *    trimming — the three layers every previous attempt went after. It is the REGION DAY SPLIT.
     *
     * ── WHAT THE PIPELINE ACTUALLY DOES, TRACED · female · 4 days · no marks ────────────────────
     * The upper region is TWO sessions — fourteen lifts of room — and its five muscles ask for
     * TWENTY-TWO. The lower region is also two sessions, and its four muscles ask for sixteen:
     *
     *     UPPER   Chest 5 · Shoulders 5 · Triceps 3 · Back 6 · Biceps 3  = 22 into 14   (+57%)
     *     LOWER   Quads 5 · Hamstrings 5 · Glutes 4 · Calves 2           = 16 into 14   (+14%)
     *
     * Eight upper lifts cannot be placed and two lower ones cannot. WHICH eight was decided by
     * nothing but the loop's order: picks arrive muscle by muscle in `CANONICAL_MUSCLE_ORDER`, so
     * Chest — first in that list — is dealt all five of its lifts into empty days, and Back —
     * fourth, and holding the LARGEST share in the table — arrives to find them full:
     *
     *     dealt      Chest 5   Shoulders 4   Triceps 2   Back 3 of the 6 it asked for   Biceps 2
     *     delivered  Back 11 sets · Hamstrings 14 sets          ⛔ the inversion, exactly
     *
     * ── AND THE OVER-SUBSCRIPTION IS AN INTEGER PROBLEM, WHICH IS WHY IT CANNOT BE FIXED BELOW ──
     * `assignRegionDays` apportions whole DAYS by region volume. Measured over all twenty-one
     * inverted weeks in this sweep, the sign of the error is perfect:
     *
     *     days given to upper − volume owed to upper        the inversions that appear
     *     ────────────────────────────────────────────      ──────────────────────────────────
     *     −15pp  (4d, upper carries 65% of volume, gets 50%)  Back < Hamstrings, Back < Glutes
     *     −10pp  (5d with Shoulders off: 2U/3L)               Back < Hamstrings
     *      −6pp  (4d, plain)                                  Back < Hamstrings
     *      +4pp  (5d, upper gets 3 of 5)                      Glutes < Triceps   ← flips to LOWER
     *      +9pp  (5d, Glutes marked)                          Back < Shoulders
     *
     * Every under-day region produces inversions among ITS muscles, and the largest-share muscle in
     * that region shows it first. At four days the split can only be 2/2 — fifty per cent — while
     * the upper region carries 51% to 65% of the volume depending on her map. There is no four-day
     * upper/lower split that expresses sixty per cent. 2.4 sessions is not a thing.
     *
     * ── THE ATTEMPT THIS BOUGHT, AND ITS MEASURED FAILURE (#11) ─────────────────────────────────
     * If the refusal is what is unfair, make the refusal fair: queue every muscle's k-th lift at
     * `k / target`, so a full region turns away the lift that is deepest down its own muscle's list
     * rather than the lift belonging to whichever muscle sorts last. Nothing capped, nothing
     * pre-empted — a pure re-ordering, which is what separated it from attempts 1–10.
     *
     *     clumps 7 → 16 ⛔    inversions 35 → 48 ⛔    push:pull 1.75 → 1.83 ⛔    a muscle under MEV ⛔
     *     Back < Hamstrings 13 → 13 — it did not even move the case it was written for.
     *
     * Reverted. It confirms the same finding as every attempt before it, from the other side:
     * moving a lift to a different DAY changes what `enforceTimeCap` charges for, and the cap is
     * the only pass that knows a lift's real cost. Reordering across muscles is not free.
     *
     * ── ⛔ AND THE LEVER I CALLED "A PRODUCT DECISION" WAS NOT ONE. I WAS WRONG ──────────────────
     * Written here first: *"it changes the shape of the week for every four-day athlete — she asked
     * for upper/lower and would be given a full-body day — and that is the founder's call."*
     *
     * ⛔ FOUNDER, 2026-08-12: *"זה יריקה בפרצוף לדרישה שלה… אין לנו דרך להתמודד עם זה?"*
     *
     * **She never asks for an upper/lower split.** There is no `split` on `Profile`, no onboarding
     * question about one, and the register is explicit that structure is an OUTPUT of volume
     * (Part 3). The engine has always chosen the split by itself, and it ALREADY answers "full
     * body" for every athlete below four days. I invented a requirement of hers that does not
     * exist and used it to hand an engine decision to him. That is the thing to not do again.
     *
     * So it was taken, and MEASURED, along with the other two ideas the diagnosis suggested. All
     * three are recorded here because each one looks obviously right until it is run.
     *
     * ── ATTEMPT #11 · queue the deal by `k / target` ──────────────────────────────────────────
     * If the refusal is what is unfair, make the refusal fair: a muscle's k-th lift is queued at
     * `k / target`, so a full region turns away the lift deepest down its own muscle's list rather
     * than the lift of whichever muscle sorts last. Nothing capped — a pure re-ordering.
     *
     *     clumps 7 → 16 ⛔   inversions 35 → 48 ⛔   push:pull 1.75 → 1.83 ⛔   a muscle under MEV ⛔
     *     Back < Hamstrings 13 → 13 — it did not move the case it was written for.
     *
     * ── ATTEMPT #12 · scale each muscle's ASK to the region's capacity ────────────────────────
     * Largest-remainder apportionment of the region's slots by target, floored at one lift (two for
     * a mark, so S-4 was arithmetically out of reach). It is the fair-shares answer, and on paper
     * it produces exactly the right counts: Back 4, Chest 3, Shoulders 3, Triceps 2, Biceps 2.
     *
     *     inversions 40 → 48 ⛔   push:pull 1.83 → 2.38 ⛔⛔ (past the 2.0 LAW)   2 under MEV ⛔
     *
     * It starves the time cap. With the ask trimmed to what fits, there is no overflow left for the
     * cap to choose from, and its tier rule — isolations first — then cuts pulling work that used
     * to survive. This is the tenth confirmation that *"deal more than fits, then let the cap
     * decide"* is load-bearing, and the first one measured from the volume side.
     *
     * ── ATTEMPT #13 · the shared day, which is the one I had deferred ─────────────────────────
     * `upper / lower / upper / full` at four days: the tight half gets three sessions of four, the
     * slack half keeps two, and no half loses a session because a full-body day trains both.
     * Promoted only when one half's ask-to-capacity pressure exceeds the other's by 0.25.
     *
     *     first cut ....... clumps 0 → 14 ⛔   under MEV 0 → 2 ⛔ (her CALVES at four weekly sets)
     *
     * The cause was the deal order: upper deals before lower, so it filled the shared day and the
     * lower body arrived at a session it is named after and could not enter. Repaired by reserving
     * each half's share of the shared day —
     *
     *     with reservation ... inversions 40 → 36 ✅   under MEV 0 ✅
     *                          clumps 0 → 21 ⛔⛔   push:pull 1.83 → 1.90 ⛔
     *                          ⛔ S-4 BROKE OUTRIGHT: a marked chest got FOUR lifts and an unmarked
     *                            one got FIVE. A mark that takes work away is the single thing
     *                            emphasis may never do.
     *
     * ── ⛔ WHAT THIRTEEN ATTEMPTS ACROSS SIX LAYERS NOW ESTABLISH ─────────────────────────────
     * Selection, dealing, trimming, the catalogue, the volume targets, and now the day split. Every
     * one of them redistributes; not one of them creates room. At four days her body asks for 38
     * lifts and her four hours hold 28, and the ten that do not fit have to come off SOMETHING.
     * Each attempt only changes whose they are, and the current answer — the largest-share muscle
     * in the busier half gives up three lifts — is the least bad of the fourteen shapes measured.
     *
     * ⚠️ SO THE HONEST STATEMENT IS NOT "WE CANNOT FIX IT". It is that this is not a defect in the
     * arrangement, it is a shortage of TIME, and the two levers that would genuinely create room
     * are both hers and both already exist:
     *
     *     · `workoutMinutes` — she is asked for it, and the whole cap is priced from it;
     *     · `daysPerWeek`  — at five days the upper half gets three sessions of five and the
     *                        inversions in this list drop away on their own.
     *
     * A four-day sixty-minute week that trains nine muscles is a week where something is short by
     * arithmetic. The engine's remaining job is to be honest about it, which is `overBudget`'s job
     * and is TRACKED — `fixtureModel`'s TODO(screens · S-3): she is never told, in words, that her
     * hour could not hold everything the week wanted. That is a real, unbuilt piece of work, and it
     * is worth more than a fourteenth rearrangement.
     * ════════════════════════════════════════════════════════════════════════════════════════════
     */
    const inversions: string[] = [];
    for (const c of await sweep()) {
      if (c.days < 3) continue;
      const marked = new Set(
        Object.entries(c.want).filter(([m]) => (c.got[m] ?? 0) > (c.want[m] ?? 0)).map(([m]) => m),
      );
      const muscles = Object.keys(c.want).filter((m) => !marked.has(m));
      for (const big of muscles)
        for (const small of muscles) {
          const gap = (MUSCLE_VOLUME_SHARE[big] ?? 1) - (MUSCLE_VOLUME_SHARE[small] ?? 1);
          if (gap < 0.3) continue;
          const a = c.got[big] ?? 0;
          const b = c.got[small] ?? 0;
          if (a > 0 && b > a) inversions.push(`${c.label}: ${big}(${a}) < ${small}(${b})`);
        }
    }
    expect(inversions.slice(0, 12)).toEqual([]);
  });

  it('and every guarantee that was already closed still holds — length, and F-1’s [3,5]', async () => {
    /*
     * The regression net. Both fixes above move volume between muscles, and the cheapest way to make
     * any of the ratios look better is to break the hour or the set floor. Asserted here so that can
     * never be the accidental price of a balance fix.
     */
    const broken: string[] = [];
    for (const c of await sweep())
      for (const d of workouts(c.p)) {
        const min = estimateSessionMinutes(d);
        if (min < SESSION_MIN) broken.push(`${c.label} ${d.name}: ~${min.toFixed(0)} min (under ${SESSION_MIN})`);
        /*
         * ⚠️ `overBudget` IS THE ONE EXEMPTION, AND IT IS THE ENGINE SAYING SO RATHER THAN FAILING.
         *
         * S-3: when every trained muscle is down to its last lift and every lift is at F-1's floor,
         * a day genuinely cannot fit her minutes — and the register is explicit that the engine
         * "says so rather than quietly starving a muscle". `generateProgram` sets this flag on
         * exactly those days and emits `engine_cannot_fit_budget`. Reachable today by ONE case in
         * this sweep: 3 days with two emphasis marks, at 63 minutes.
         *
         * This is not a threshold loosened to fit a change — it predates all of it, and the strict
         * bound still applies to every day the engine believes DOES fit. What is still missing is
         * product-side and tracked in `fixtureModel` as TODO(screens · S-3): she is never told, in
         * words, that this workout does not fit the minutes she asked for.
         */
        if (min > SESSION_MAX && !d.overBudget) broken.push(`${c.label} ${d.name}: ~${min.toFixed(0)} min (over ${SESSION_MAX})`);
        for (const s of d.slots)
          if (s.setCount < 3 || s.setCount > 5) broken.push(`${c.label} ${d.name}: ${s.exerciseId} ${s.setCount} sets`);
      }
    expect(broken.slice(0, 12)).toEqual([]);
  });

  it('⛔ a muscle’s lifts are SPREAD across its days, never clumped onto one', async () => {
    /*
     * The mechanism itself, pinned so the tie-break in `dealTo` cannot be undone without a red run.
     * Back came out 1/3/2 across its three days where Chest came out 2/2/2 — same region, same
     * target — and the day-at-a-time time cap then cut the clump. A muscle's lifts may differ by one
     * across the days it is trained on; two is a clump.
     *
     * ════ CLOSED 2026-08-11 · 7 → 0 ════
     *
     * The spread tie-break took it from 25 to 7 and then stopped, and the seven survivors were all
     * one muscle in one shape — Shoulders 1/1/3 (or 3/1/1) across three upper days at five and six
     * days. Not a weaker version of the same defect: a different one underneath it.
     *
     *     Upper A   cable_lateral_raise
     *     Upper B   machine_lateral_raise
     *     Upper C   db_shoulder_press · db_front_raise · lateral_raise
     *
     * Shoulders owns THREE lifts of one pattern and a day may not repeat a muscle's movement, so
     * those three are one-per-day whatever else happens. The catalogue hands them over interleaved
     * with the front raise, the front raise was dealt third, and at that moment every day held
     * exactly one shoulder lift — nothing for the spread to separate. It fell through to total load,
     * took Upper C, and the third lateral raise then arrived to find C the only day it was legal on.
     *
     * The fix is in `dealTo`'s queue, not in the tie-break: **a muscle's lifts are dealt
     * most-constrained first**, so the three lateral raises take their three days before the lift
     * that fits anywhere is placed. See `dealOrder` in `programAssembly`, and the note there on why
     * it reorders only WITHIN a muscle — the wider version of the same idea regressed every number
     * in this file at once and was reverted.
     *
     * ⚠️ IT WAS NOT FREE. Shoulders keeps sets the cap used to take off its clumped day, which puts
     * it ahead of an under-served Back in four weeks. The trade is priced on the scoreboard above.
     */
    const clumped: string[] = [];
    for (const c of await sweep()) {
      const perDay: Record<string, number[]> = {};
      for (const d of workouts(c.p)) {
        const n: Record<string, number> = {};
        for (const s of d.slots) {
          const m = muscleOf(s.exerciseId);
          if (m) n[m] = (n[m] ?? 0) + 1;
        }
        for (const m of Object.keys(n)) (perDay[m] ??= []).push(n[m]);
      }
      for (const [m, counts] of Object.entries(perDay)) {
        if (m === 'Core' || counts.length < 2) continue;
        const spread = Math.max(...counts) - Math.min(...counts);
        if (spread > 1) clumped.push(`${c.label}: ${m} ${counts.join('/')}`);
      }
    }
    expect(clumped.slice(0, 12)).toEqual([]);
  });
});
