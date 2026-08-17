/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * HOW OFTEN IS THE ENGINE RIGHT?
 *
 * ⛔ FOUNDER, 2026-08-16: *"תחזית נכונה ברוב המוחלט של המקרים עבור המשקלים והחזרות כך שהמנוע ידע
 * בדיוק מה היכולות של המתאמן וכמה הוא מסוגל להרים בכל תרגיל ובכל סט."*
 *
 * ── WHY THIS FILE HAD TO EXIST ──────────────────────────────────────────────────────────────────
 * Nothing in this repo measured it. `theProgrammeSurvivesTheMonths` asks three SAFETY questions —
 * never above her, never dead on a floor, fewer than a quarter of sets under target — and passes
 * with a wide margin. None of them is "how often is the number right", and a prescription can be
 * perfectly safe and habitually wrong: every set at 60% of her capacity clears all three.
 *
 * The engine makes a falsifiable claim on every set — **N reps at load L, landing in [Tlo, Thi]** —
 * and this is the scoreboard for that claim. It is the one number the whole brief reduces to, and
 * every future change to the loops should be priced against it.
 *
 * ── WHAT "RIGHT" MEANS HERE, AND WHY IT IS NOT 100% ─────────────────────────────────────────────
 * A set lands IN BAND when her performed reps fall in `[Tlo, Thi]`. Three structural reasons the
 * ceiling is well below 100%, none of them a defect:
 *
 *   · **The first occurrence of a lift is a measurement, not a prediction.** The engine has never
 *     seen her on it; B-1 models an opening load and Loop 1 corrects from set 1. Counting that
 *     against the forecast measures the cold start, not the engine.
 *   · **Every set of an exercise is asked for the SAME load and the SAME reps**
 *     (`fixtureModel.sessionTargets` emits one target per lift and copies it across the slot), while
 *     her body loses ~0.8 reps per set to fatigue. A four-set lift therefore CANNOT have all four
 *     inside a two-rep band, however well the load is chosen. This is the single largest term in the
 *     miss, and it is a design gap, not noise — see the per-set breakdown this file prints.
 *   · **The band is two reps wide** and reps are integers, so ±1 of noise is most of it.
 *
 * ⚠️ SO THE RATCHETS BELOW ARE FLOORS UNDER A KNOWN NUMBER, NOT TARGETS. The printed board is the
 * useful output; the assertions exist so a regression cannot land quietly.
 *
 * ⛔ THEY MAY MOVE DOWN FOR EXACTLY ONE REASON, AND IT MUST BE SHOWN, NOT ASSERTED: the SAMPLE
 * changed while the per-position quality did not. This number is an average over set positions, and
 * the late positions are far harder to predict than the early ones — so anything that changes how
 * many four- and five-set slots survive the time cap moves the average without touching the
 * prescription at all. A move down with no per-position evidence beside it is a regression.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { train, TLO, THI, type Person, type PerformedSet } from '../helpers/virtualAthlete';

const WEEKS = 10;

/**
 * The same three athletes `theProgrammeSurvivesTheMonths` uses, deliberately — one simulation, two
 * questions. The light woman at 0.7 of the model is the hard case: every rung is a larger fraction
 * of her load, so the band is harder to hit for reasons that are physical, not algorithmic.
 */
const PEOPLE: Person[] = [
  { label: 'woman 52 kg · 4 days · weaker than the model assumed', sex: 'female', weightKg: 52, days: 4, minutes: 45, capRatio: 0.7, seed: 22 },
  { label: 'woman 58 kg · 3 days', sex: 'female', weightKg: 58, days: 3, minutes: 50, capRatio: 1.0, seed: 11 },
  { label: 'man 80 kg · 4 days', sex: 'male', weightKg: 80, days: 4, minutes: 60, capRatio: 1.0, seed: 33 },
];

interface Board { n: number; inBand: number; under: number; over: number; absMiss: number }
const empty = (): Board => ({ n: 0, inBand: 0, under: 0, over: 0, absMiss: 0 });

function add(b: Board, s: PerformedSet): void {
  b.n += 1;
  if (s.reps < s.bandLo) { b.under += 1; b.absMiss += s.bandLo - s.reps; }
  else if (s.reps > s.bandHi) { b.over += 1; b.absMiss += s.reps - s.bandHi; }
  else b.inBand += 1;
}
const pct = (x: number, n: number) => (n === 0 ? 0 : (100 * x) / n);
const show = (b: Board) =>
  `n=${String(b.n).padStart(5)}  in-band ${pct(b.inBand, b.n).toFixed(1).padStart(5)}%  under ${pct(b.under, b.n).toFixed(1).padStart(5)}%  over ${pct(b.over, b.n).toFixed(1).padStart(5)}%  mean miss ${(b.absMiss / Math.max(1, b.n)).toFixed(2)} reps`;

/**
 * The forecast is only a forecast once the engine has met the lift. The first occurrence is the
 * cold start (B-1 + Loop 1 from set 1); everything after it is a prediction it is fair to grade.
 */
const graded = (s: PerformedSet) => s.priorOccurrences >= 1 && !s.bodyweight;

jest.setTimeout(600000);

describe('⛔ the prescription is a forecast, and this is its accuracy', () => {
  const all: PerformedSet[] = [];

  beforeAll(async () => {
    for (const p of PEOPLE) {
      const run = await train(p, WEEKS);
      for (const s of run.sets) all.push({ ...s, exerciseId: `${p.seed}:${s.exerciseId}` });
    }
  });

  it('prints the whole board, so a change to any loop is priced in one place', () => {
    const overall = empty();
    for (const s of all) if (graded(s)) add(overall, s);

    const byWeek: Board[] = Array.from({ length: WEEKS }, empty);
    for (const s of all) if (graded(s)) add(byWeek[s.week], s);

    const bySet: Record<number, Board> = {};
    for (const s of all) if (graded(s)) add((bySet[s.setIndex] ??= empty()), s);

    const byFamiliarity: Record<string, Board> = { '2nd time': empty(), '3rd–5th': empty(), '6th+': empty() };
    for (const s of all) {
      if (!graded(s)) continue;
      const k = s.priorOccurrences === 1 ? '2nd time' : s.priorOccurrences <= 4 ? '3rd–5th' : '6th+';
      add(byFamiliarity[k], s);
    }

    const coldStart = empty();
    for (const s of all) if (s.priorOccurrences === 0 && !s.bodyweight) add(coldStart, s);

    /* eslint-disable no-console */
    console.log(`\n══ PRESCRIPTION ACCURACY · ${WEEKS} weeks × ${PEOPLE.length} athletes · band [${TLO}, ${THI}] ══\n`);
    console.log(`  ALL GRADED SETS      ${show(overall)}`);
    console.log(`  (cold start, ungraded) ${show(coldStart)}\n`);
    console.log('  by WEEK — is it learning her?');
    byWeek.forEach((b, i) => console.log(`    week ${String(i + 1).padStart(2)}  ${show(b)}`));
    console.log('\n  by SET INDEX — the same target is asked for every set, her body is not the same:');
    for (const k of Object.keys(bySet).sort((a, b) => +a - +b)) console.log(`    set ${+k + 1}     ${show(bySet[k])}`);
    console.log('\n  by FAMILIARITY with the lift:');
    for (const [k, b] of Object.entries(byFamiliarity)) console.log(`    ${k.padEnd(9)} ${show(b)}`);
    console.log('');
    /* eslint-enable no-console */

    expect(overall.n).toBeGreaterThan(500); // the board must actually have looked at something
  });

  it('⛔ RATCHET · the graded forecast lands in her band at least this often', () => {
    const b = empty();
    for (const s of all) if (graded(s)) add(b, s);
    expect(pct(b.inBand, b.n)).toBeGreaterThanOrEqual(IN_BAND);
  });

  it('⛔ RATCHET · and it misses by no more than this many reps on average', () => {
    const b = empty();
    for (const s of all) if (graded(s)) add(b, s);
    expect(b.absMiss / b.n).toBeLessThanOrEqual(MEAN_MISS);
  });

  it('⛔ RATCHET · the FIRST set of a lift is the one the engine can genuinely predict', () => {
    /*
     * Set 1 is the honest test of the load choice: no accumulated fatigue, nothing but "did the
     * engine know what she could lift today". The later sets are graded above and are dragged by a
     * per-set gap the prescription does not model at all — so this number, and the distance between
     * it and set 4, is what says whether the next piece of work is the LOAD or the FATIGUE MODEL.
     */
    const b = empty();
    for (const s of all) if (graded(s) && s.setIndex === 0) add(b, s);
    expect(pct(b.inBand, b.n)).toBeGreaterThanOrEqual(FIRST_SET_IN_BAND);
  });

  /**
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔⛔ WHAT ACTUALLY MOVES THIS NUMBER — MEASURED 2026-08-16, AFTER NINE FAILED INTERVENTIONS.
   *
   * Read the set breakdown the board prints and the whole thing is there:
   *
   *     set 1   39%      ← Loop 1 has not acted yet
   *     set 2   63%
   *     set 3   65%      ← Loop 1 has corrected
   *     set 4   60%
   *
   * **Loop 1 cannot help set 1, because set 1 IS the measurement.** Every other set benefits from
   * what set 1 taught the engine; set 1 itself is prescribed blind, from a `base` whose error is
   * measured at bias −6.0% and, within one lift session to session, sd 12.8%.
   *
   * Nine interventions were built and measured against this board. NONE beat the baseline:
   * five per-set ramp variants (see `engine/v5/perSetShape`), three anchor estimators (smoothing
   * over the recency window, a direct e1RM estimate, and both together — 52.3 / 51.5 / 48.9), and a
   * straight scale on the anchor (1.03 / 1.06 / 1.10 / 1.15 → 53.2 / 53.2 / 53.3 / 50.6). The engine
   * sits at a local optimum: every perturbation of `base` costs more in destabilised corrections
   * than it buys in accuracy.
   *
   * ── A CALIBRATION SET WAS TRIED, AND IT MOSTLY MEASURED ITSELF ──────────────────────────────
   * The idea: perform one set at the working load BEFORE the counted ones, let Loop 1 read it, and
   * do not grade it. Graded the way this board grades — counted sets only — it looked decisive:
   *
   *     no probe                55.4%   miss 1.01
   *     probe, extra set        62.8%   miss 0.58     ← +7.4
   *     probe, replaces a set   59.2%   miss 0.63
   *
   * ⛔⛔ MOST OF THAT WAS THE SCORING, NOT THE ENGINE (founder, 2026-08-16: *"how does it help the
   * engine? I don't understand"*). The probe is a set she really performed, at a load that was really
   * wrong, and excluding it from the score simply hid it. Grading EVERY set she actually did:
   *
   *     no probe                50.5%   miss 1.31
   *     probe, extra set        52.8%   miss 1.05     ← +2.3
   *     probe, replaces a set   53.8%   miss 1.04     ← +3.3
   *
   * ⚠️ AND THE REASON THE REAL GAIN IS SO SMALL IS THAT THE ENGINE ALREADY DOES THIS. Loop 1 reads
   * set 1 and corrects immediately — **set 1 IS the calibration set.** The probe performs the same
   * set at the same load and relabels it. In the "replaces a set" arm she performs four sets at
   * identical loads either way; only the accounting differs.
   *
   * ⚠️ SO SET 1's 39% IS NOT A DEFECT TO BE ENGINEERED AWAY. It is the price of the first
   * measurement, and any design that predicts before it measures pays it once per lift per session.
   * A calibration set does not remove that price; it renames it — for real friction on every
   * exercise of every workout.
   *
   * ── WHAT THE CEILING ACTUALLY IS ────────────────────────────────────────────────────────────
   * An oracle that knows her true capacity exactly, on this body, this noise, this band and these
   * rungs, prescribing ONE load per exercise:
   *
   *     barbell 60 kg  78.4%    ·    barbell 40 kg  35.4%
   *     dumbbell 12 kg 78.4%    ·    machine 50 kg  61.2%          average ≈ 63%
   *
   * …and with a continuous load and no rungs at all, per set, still only **84.5%** — the noise floor.
   * The engine sits at 56%. **The gap to a perfect engine of this design is about seven points, and
   * the equipment's rung quantum owns most of it.** On a 40 kg barbell one rung is 2.3 reps against a
   * band two reps wide, so a perfect engine scores 35%: no algorithm prescribes iron that does not
   * exist. That is also the fourth and final reason the per-set ramp failed — four numbers must each
   * land on a rung instead of one, and on a coarse grid that is strictly worse.
   *
   * ⚠️ THE HONEST CONCLUSION FOR ANYONE READING THIS LATER: this number is close to its ceiling, and
   * what is left is not where the product's value is.
   * ════════════════════════════════════════════════════════════════════════════════════════════
   */

  /**
   * ⛔ THIS DOES NOT PASS, AND IT IS THE MOST IMPORTANT LINE IN THE FILE.
   *
   * A forecast that degrades as evidence accumulates is the one failure no ratchet catches: the
   * overall number holds while the engine drifts away from her. Measured 2026-08-16:
   *
   *     week  2   in-band 56.6%   under 28.9%   over 14.5%
   *     week  4   in-band 63.2%   under 16.8%   over 20.0%     ← it finds her
   *     week  7   in-band 54.0%   under 15.3%   over 30.7%
   *     week 10   in-band 53.3%   under 15.2%   over 31.5%     ← and then loses her
   *
   * `under` halves — it stops handing her loads she cannot lift, which is what
   * `theProgrammeSurvivesTheMonths` measures and passes. `over` DOUBLES. The engine is not getting
   * worse at her; **it is falling behind her.**
   *
   * ── ⛔ WHAT IT IS *NOT*, ESTABLISHED BY EXPERIMENT AND WORTH KEEPING ─────────────────────────────
   * The obvious suspect was L11: `applyRail` is the last thing a raise passes through, and it caps
   * at one rung above the anchor. It was tested directly on 2026-08-16 — first by letting the rail
   * read her demonstrated capacity instead of the raw bar weight, then by **removing the rail
   * entirely** — and the board came back byte-for-byte identical both times. The rail is real and it
   * was wrong (see `v5_rail_reads_capacity`, where it flattened a five-rung move to one), but **it
   * is not what limits an ordinary week**, because in an ordinary week the engine only ever sizes a
   * one-rung move in the first place.
   *
   * ── WHAT IT ACTUALLY IS ─────────────────────────────────────────────────────────────────────────
   * S-22 sizes the raise from `worstReps` — the occurrence's WORST set — and the worst set is the
   * LAST one, about 2.4 reps below her first after per-set fatigue. So the headroom the engine reads
   * is 1-3 reps when her fresh capacity is 4-6 reps clear of the band, and `rungsForHeadroom` floors
   * that to a single rung whatever her slope. Reading the exercise through its most fatigued set is
   * both why set 1 is 51.8% over AND why the load cannot keep up: **they are one defect, not two.**
   *
   * Using set 1 instead would be faster and wrong — the worst set is deliberate ("10/9/8 ≠ 10/7/5")
   * and it is what stops a load she can only manage fresh. The fix is `engine/v5/perSetShape`: when
   * each set carries its own load, every set can sit in the band, and the worst set stops being a
   * fatigue reading and becomes a real signal again. That needs Loop 2 to read a ramp as a ramp — an
   * L10 change — which is the open work this ratchet is waiting on.
   */
  /*
   * ⛔ CLOSED 2026-08-16, AND NOT BY THE WORK THIS NOTE WAS WAITING ON.
   *
   * Everything above stands: reading the exercise through its most fatigued set is still why set 1
   * is half over the band, and `perSetShape` is still the answer to THAT. What closed this was a
   * different defect entirely — the COLD START. The engine seeded every lift in the programme on day
   * one, from an empty history, and then froze it; a lift she would not meet until Thursday had its
   * load decided before she had lifted anything. An athlete the sex+bodyweight model does not fit
   * (measured: 0% in band, 100% too heavy, by 6.4 reps) therefore started every lift wrong and spent
   * the run climbing out — which reads exactly like a failure to converge, because it is one.
   *
   * With an unperformed seed re-read (`ensureExercisesV5`) and scaled by what her own lifts show
   * (`personalScale`), the late weeks now match the early ones. The board moved 55.8% → 58.3% in
   * band and 1.02 → 0.87 mean miss on the same change.
   */
  it('⛔ it converges — the second half of the run is not worse than the first', () => {
    const early = empty();
    const late = empty();
    for (const s of all) if (graded(s)) add(s.week < WEEKS / 2 ? early : late, s);
    expect(pct(late.inBand, late.n)).toBeGreaterThanOrEqual(pct(early.inBand, early.n));
  });
});

/* ⚠️ MEASURED 2026-08-16 against the engine as it stands, over 1,579 graded sets. Floors under a
 * known number — they may only ever move UP. Re-measure with the printed board above, never by
 * guessing.
 *
 *     ALL GRADED   in-band 56.1%   under 19.6%   over 24.3%   mean miss 0.94 reps
 *     set 1        in-band 39.4%   under  8.7%   over 51.8%   ← fresh, and the load is set for later
 *     set 2        in-band 62.9%
 *     set 3        in-band 64.6%
 *     set 4        in-band 59.9%   under 32.9%   over  7.2%   ← tired, and the load has not moved
 *
 * The set-1/set-4 spread is the single largest term in the miss and it is a DESIGN GAP, not noise:
 * `fixtureModel.sessionTargets:1861` emits one target per lift and copies it across every set of the
 * slot, so one load is asked for a body that loses ~0.8 reps per set. Half of set 1 is above the
 * band and a third of set 4 is below it, from the same correct number. No amount of load accuracy
 * closes that; only a per-set prescription does. */
/*
 * ⚠️ RE-MEASURED 2026-08-16, AND IT WENT UP — 54.5 → 55.8 IN BAND — ON A HARNESS FIX, NOT AN ENGINE
 * ONE. `virtualAthlete` advanced its own clock week by week while the engine underneath read the WALL
 * clock, so the simulation had two different todays. Nothing had ever compared them, so it sat there
 * harmlessly until B-9 (detraining) made an engine decision depend on the calendar: week 1 of a
 * ten-week run looked like an athlete returning after seventy days away, and the board fell to 37.5%
 * with set 1 missing by thirteen reps. The run now happens on HER clock throughout — so the recency
 * window, the fold cursor and the week cadence all read the day she is actually training on.
 *
 * The 1.3 points are the correction of a measurement error, not a gain to be proud of; the ceiling is
 * raised anyway, because a ratchet left below the truth is a rubber stamp — the lesson this repo
 * relearned twice today (743-vs-113 on the inversion ceiling, 92-vs-85 on the scoreboard's).
 */
/*
 * ⚠️ THE UNROUNDED VALUES. The board PRINTS 58.3 / 40.4 and pinning a printed number once failed the
 * very run that produced it — a ratchet is read off the measurement, never off its display.
 *
 * ⛔ RAISED 2026-08-16 ON THE COLD-START FIX, the largest single move measured on this board:
 *
 *     in band     55.77%  →  58.31%      mean miss   1.02  →  0.871
 *     set 1       37.68%  →  40.38%      cold start  45.1% →  52.6% in band
 *
 * Two things, one defect. The engine seeded EVERY lift in the programme on day one from an empty
 * history and then froze it, so a lift she met on Thursday carried a load decided before she had
 * lifted anything (`ensureExercisesV5` now re-reads a seed she has not tested). And the seed itself
 * read only sex and bodyweight, while her own performed lifts already said how far off that model
 * she is (`personalScale`). Measured before either was written: an athlete the model does not fit
 * got 0% in band on her cold starts, 100% too heavy, by 6.4 reps — and could only ever fail heavy.
 */
const IN_BAND = 58.31;
const MEAN_MISS = 0.871;
const FIRST_SET_IN_BAND = 40.38;

/*
 * ⚠️ RE-MEASURED 2026-08-16 after the core pool began rotating (`theCorePoolIsActuallyUsed`), and the
 * evidence that this is a SAMPLE change and not a regression — the mid positions, which are the ones
 * the engine predicts best and the ones least sensitive to slot length, did not move:
 *
 *                    before            after
 *     set 2      62.9%  (0.71)     63.8%  (0.74)
 *     set 3      64.6%  (0.58)     63.4%  (0.62)
 *     set 4      n = 167           n = 179
 *     set 5      n =  12           n =  33          ← nearly tripled
 *     ALL        56.1%             54.7%   (n 1586 → 1637)
 *
 * Rotating the core lift changes what a session COSTS — `ab_wheel` is not `cable_crunch` — so the
 * time cap leaves a different number of sets on the other slots, and the extra sets land in the late
 * positions where every engine does worst. Zero core sets enter the grade at all (they are
 * supplemental, and the ungraded ones are bodyweight), which is how this was confirmed.
 */
