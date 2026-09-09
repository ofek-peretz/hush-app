/**
 * THE COLD-START LOAD — what Hush puts on the bar the first time it meets an athlete.
 *
 * This was private to the model (fixtureModel). It is lifted out because a SECOND surface needs the
 * exact same number: the milestone ladders (founder 2026-07-13). The anchor of a club mark is the
 * load Hush itself prescribed on day one — a 100 kg bench is a landmark for one athlete and an
 * impossibility for another, while "three times what I started you at" is a landmark for both. One
 * function, two consumers, no second opinion about how strong an athlete probably is.
 *
 * Pure & I/O-free. **Inputs: sex × bodyweight. That is the whole list** (register B-1). Height,
 * frequency, age and experience are all deliberately NOT inputs — height does not predict strength
 * once bodyweight is known, frequency changes how FAST she arrives at a load rather than which load
 * is worth marking, and the other two are struck below.
 */
import type { Profile, Experience, Capability } from '@/data/local/models';
import { isEvidenceSet } from '@/domain/setEvidence';
import { BAR_KG, emptyBarKg } from '@/engine/loadMath';
import { loadFloor } from '@/engine/v5/grid';
import { STARTING_INCREMENT, SEED_RUNGS_LIGHT } from '@/engine/v5/constants';
import type { Exercise } from '@/data/exercises';

/**
 * The TWO fields the cold start reads — **her sex and her bodyweight, and nothing else.**
 *
 * B-1, verbatim: *"the catalogue cold-start from **her sex + bodyweight** (nothing else — no
 * self-report, no age)."* Two v4-era inputs were still multiplying this load and neither has any
 * standing in the v5 register:
 *
 *   · **`experience`** — a SELF-REPORT, scaled 0.78 / 1.00 / 1.22. Part 9 §A deletes it as an input
 *     ("removed from onboarding, Settings, and the profile's decision path"), and L1 is the reason:
 *     the engine acts on facts it measured, and what she calls herself is not one. It had been
 *     removed from the onboarding SCREEN and left in the decision path — so in practice every new
 *     athlete fell to the `beginner` default and had every day-one load cut by 22%.
 *   · **`age`** — a per-decade multiplier down to 0.80. Nowhere in the register. S-42 sets the
 *     precedent explicitly for the neighbouring field: *"She changes height. **Nothing.** Height
 *     touches no engine decision… Any other use would be a guess."* Age is the same guess.
 *
 * What replaces them is not a bigger guess — it is **Loop 1**, which reads her first working set and
 * moves the iron before the second (B-1, Rev 8). A cold start is a suggestion she can see and edit
 * (F-2); it was never meant to be right, only to be corrected fast.
 *
 * **DAY-ONE LOADS GO UP, and that is the point.** Measured across the catalogue the cold start moves
 * ×1.00–×1.75 (male 30/80 kg: bench 33 → 43, squat 42 → 53; a 72-year-old: 27 → 43). But an athlete
 * who had declared "intermediate" sees **no change at all** — 43 → 43 — because the new number IS
 * the un-multiplied one she always got. The old behaviour was not conservatism; it was a self-report
 * default. Rev 7 deleted the onboarding question and left the multiplier here, so every athlete
 * answered "beginner" by omission and took a 22% discount nobody chose.
 */
/*
 * ⚠️ `painEases` RIDES ALONG (2026-08-11) so the selector can refuse a movement she has just reported.
 * It is on this type rather than a new parameter because the profile ALREADY flows to every call
 * site — widening it changes no signature in `programAssembly`, the file with the most surviving
 * mutants in the engine, which is not a file to reshape for a feature.
 */
/* `equipment` joined the pick on 2026-09-01 (the room, audit 06): the assembly and the swap pool
 * already thread a LoadProfile everywhere a candidate is judged, so the room rides the same rail —
 * no new parameter on any signature, and absent means "full gym" exactly as before. */
export type LoadProfile = Pick<Profile, 'sex' | 'weightKg' | 'painEases' | 'equipment'>;

const UPPER: Capability[] = ['horizontal_push', 'horizontal_pull', 'vertical_push'];

/**
 * The female strength factors — CALIBRATED AGAINST POPULATION DATA (2026-07-21, founder-approved).
 *
 * They were 0.62 (upper) / 0.72 (lower). Both published research and the largest community lift
 * dataset put the real same-bodyweight female:male ratio meaningfully lower:
 *   · research meta-findings: women ≈ 52% of male upper-body strength, ≈ 66% lower-body;
 *   · StrengthLevel (~25M logged lifts), same bodyweight, same percentile: bench ≈ 0.51,
 *     squat ≈ 0.65, deadlift ≈ 0.66.
 * At 0.62/0.72 a woman's day-one loads sat 15–20% ABOVE the percentile her male counterpart got —
 * and the cost is asymmetric: a too-heavy first set is the scare moment (she fails set 1 of her
 * first workout), while a slightly-light one becomes Loop 1's visible "you did 14, I added weight"
 * — the product's best moment. So the factors now match the data: **0.52 upper / 0.66 lower.**
 * (Same-percentile parity with men; the barbell floor S-55 still applies underneath.)
 */
export const FEMALE_UPPER_FACTOR = 0.52;
export const FEMALE_LOWER_FACTOR = 0.66;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Conservative personalized starting load (kg), or null for bodyweight movements. */
/**
 * The load B-1 actually MODELS for her, before any equipment floor is applied — sex × bodyweight and
 * nothing else.
 *
 * Split out because the floor hides the model's own answer. `startingWeight` clamps a barbell up to
 * `BAR_KG`, so asking it "does this lift fit her?" always answers yes: it returns the floor. The
 * selector (S-55b) needs the number BEFORE the clamp, because the whole question it asks is whether
 * the modelled load survives the clamp at all.
 */
export function modelledLoadKg(ex: Exercise, profile: LoadProfile): number | null {
  if (ex.bodyweight || ex.baseKg == null) return null;
  const bw = profile.weightKg ?? 75;
  const bwFactor = ex.bwScaled ? clamp(bw / 75, 0.7, 1.45) : 1;
  const sexFactor = profile.sex === 'female' ? (UPPER.includes(ex.capability) ? FEMALE_UPPER_FACTOR : FEMALE_LOWER_FACTOR) : 1;
  return ex.baseKg * bwFactor * sexFactor; // B-1: sex + bodyweight, and nothing else
}

/**
 * ════ S-55b · CAN THIS EQUIPMENT HOLD HER LOAD? ════
 *
 * A barbell cannot weigh less than the bar. Every grid function floors a barbell at `BAR_KG`, so a
 * prescription below it is not a prescription — it is the floor, and **no loop can correct downward
 * out of a floor.** The athlete's only escape is a manual swap.
 *
 * So before any mechanism puts a lift in front of her — the assembler CHOOSING one, or Loop 2
 * ROTATING to one — it asks this single physical question of the load B-1 already computed. It is
 * not a demographic shelf (S-58): nothing here reads sex to pick a lift. A 95 kg man and a 50 kg
 * woman run identical code and get different answers because the arithmetic differs, not because
 * the catalogue has two shelves.
 *
 * It lives HERE, beside `modelledLoadKg`, because the two selectors that need it — the assembler
 * (engine) and the rotation resolver (domain) — must not each carry their own copy. They did, for
 * one revision, and the rotation's copy was the one that did not exist: the assembler refused a
 * barbell bench for a 52 kg beginner, which made that barbell bench the lift she had "gone longest
 * without" — so the stall rotation handed her the exact lift the selector had just protected her
 * from, at 20 kg, where it froze for ever.
 *
 * No profile (tests, the S-3 fallback) → the question is not asked and catalogue order stands.
 */
export function canLoad(ex: Exercise, profile?: LoadProfile): boolean {
  if (!profile) return true;
  const want = modelledLoadKg(ex, profile); // the MODELLED number, before the equipment clamp
  if (want == null) return true; // bodyweight / unpriced — no load axis to overflow
  return want >= loadFloor(ex.equipment);
}

/**
 * ════ THE OPENING LOAD IS ONE SHE CAN ACTUALLY BUILD (founder, build 36 — A.6) ════
 *
 * *"Gyms stock 2.5 kg jumps — why prescribe 8.5 a side? At least on the first workout, maximise
 * plate accuracy and the athlete's opening load."*
 *
 * He is right and the bug was here. This function rounded the modelled load to **1 kg whatever the
 * equipment was**, so a barbell opened at 37 kg — 8.5 kg a side, which is 5 + 2.5 + 1, and there is
 * no 1 kg plate. `loadPresentation.exactPlates` then found no stack that summed to 8.5 and printed
 * the bare figure, so her first instruction of her first session was a number she could not load.
 *
 * The app already knew the right grain: `STARTING_INCREMENT` says a barbell moves in 2.5 kg (1.25 a
 * side, the smallest plate in `GEAR`) and a machine the same. The seed simply was not asking. It
 * asks now, and it counts FROM THE FLOOR — a barbell's rungs are 20 / 22.5 / 25, not 0 / 2.5 / 5,
 * because the bar is where the ladder starts.
 *
 * The 1 kg comment above was not wrong, it was answering a different question. That ruling was
 * about how FINELY the engine may progress a load it already owns (80 → 81 beats 80 → 82.5), and
 * `nextRung` still does exactly that inside her learned grid. This is the cold start, where there
 * is no grid and the only ladder is the one the room stocks.
 *
 * It rounds to NEAREST rather than down — 37 → 37.5, not 35 — because he asked for the opening load
 * to be maximised, and because the engine's down-only law (`snapDown`) governs decisions it makes
 * ABOUT a performance. This is the seed before any performance exists.
 *
 * A dumbbell is untouched on purpose: its increment is 1.0, so every integer is already a rung. Real
 * racks step in 2s and often skip, but that is a per-gym inventory question and inventing a ladder
 * here would be the engine guessing — which it does not do. Flagged for the founder, not assumed.
 */
export function snapToStock(kg: number, ex: Exercise): number {
  const inc = STARTING_INCREMENT[ex.equipment] ?? 0;
  if (inc <= 0) return kg; // bodyweight — no load axis to land on
  const floor = emptyBarKg(ex.equipment); // the Olympic bar, or the lightest fixed bar (F-19)
  const rungs = Math.max(0, Math.round((kg - floor) / inc));
  return floor + rungs * inc;
}

/**
 * ════ B-1b · HOW FAR OFF THE MODEL SHE ACTUALLY IS, IN ONE NUMBER ════
 *
 * ⛔ MEASURED, 2026-08-16 — three athletes, ten weeks, the first set of every lift never performed:
 *
 *     athlete the model fits .......  85.0% in band  ·  0% over  ·  15% under
 *     athlete the model fits .......  57.7% in band  ·  0% over  ·  42% under
 *     athlete WEAKER than modelled    0.0% in band  ·  0% over  · 100% under, by 6.6 reps
 *
 * B-1 has exactly one failure mode and it is the wrong one. Its own register row says the seed must
 * err LIGHT — *"a light seed becomes Loop 1's visible 'you did 14, so I added weight'; a heavy one
 * fails her very first set"* — and shipped, it is never light and routinely heavy.
 *
 * ── ⚠️ WHY THIS IS NOT A NEW BOOTSTRAP ──────────────────────────────────────────────────────────
 * It introduces no number about bodies. It is the ratio between what B-1 PREDICTED for the lifts she
 * has done and what she DEMONSTRATED on them — entirely her own data, the same move S-9 makes with a
 * single load, taken one level up. The median across her lifts, for the F-13 reason: one freak
 * session may not move it.
 *
 * ── ⛔ IT MAY ONLY MAKE THE SEED LIGHTER, AND THAT ASYMMETRY IS THE POINT ────────────────────────
 * Clamped at 1. The two errors are not equal and the register already says so: light costs her one
 * set that Loop 1 raises from inside and is the product's best moment; heavy costs her the first set
 * of a lift she has never met. Measured, "over" was 0% for every athlete — the model is never too
 * light — so a factor that can only reduce fixes the failure that exists and cannot create the one
 * that does not.
 *
 * ⚠️ AND IT IS FLOORED, because a ratio is only as good as its sample: 0.5 is the least the model may
 * be scaled to, which is far past any athlete this measured and stops a single mis-logged set (a
 * 2.5 kg entry for 25) from halving her whole programme.
 *
 * `null` until she has `MIN_SCALE_LIFTS` distinct lifts — an evidence gate of the F-12 family. Below
 * it the model stands alone, exactly as it does today.
 */
/* ⚠️ 3 WAS RE-MEASURED AT 2 ON 2026-08-23 AND THE BOARD DID NOT MOVE — 58.3% in band, cold start
 * 52.6%, set 1 40.4%, identical to the tenth of a point. The gate is not the binding constraint:
 * by the time a cold start needs the scale, the athlete already holds three lifts of evidence, and
 * the first-session seeds it exists for have NO history for any gate to admit. Recorded so the next
 * accuracy pass does not spend the same experiment. */
export const MIN_SCALE_LIFTS = 3;
export const PERSONAL_SCALE_FLOOR = 0.5;

export function personalScale(
  history: readonly { sets: readonly { exerciseId: string; actualWeight: number | null; actualReps: number; isApproach?: boolean; presumed?: boolean }[] }[],
  profile: LoadProfile,
  exerciseById: (id: string) => Exercise | undefined,
  /** Her Tlo — what "a working load" means to her. The ratio is taken at the same rep target B-1 is. */
  repTarget: number,
  epley: (load: number, reps: number) => number,
): number | null {
  /** Per lift, the heaviest thing she has demonstrated — one sample each, so a favourite cannot vote twice. */
  const best = new Map<string, number>();
  for (const s of history)
    for (const log of s.sets) {
      if (!isEvidenceSet(log) || log.actualWeight == null || log.actualWeight <= 0 || log.actualReps <= 0) continue;
      const e1rm = epley(log.actualWeight, log.actualReps);
      if (e1rm > (best.get(log.exerciseId) ?? 0)) best.set(log.exerciseId, e1rm);
    }

  const ratios: number[] = [];
  for (const [id, e1rm] of best) {
    const ex = exerciseById(id);
    if (!ex) continue;
    const modelled = modelledLoadKg(ex, profile);
    if (modelled == null || modelled <= 0) continue;
    ratios.push(e1rm / (1 + repTarget / 30) / modelled); // her working load ÷ the one B-1 predicted
  }
  if (ratios.length < MIN_SCALE_LIFTS) return null;

  ratios.sort((a, b) => a - b);
  const mid = ratios.length >> 1;
  const median = ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
  return clamp(median, PERSONAL_SCALE_FLOOR, 1);
}

/**
 * B-1's number on real plates — the load the model says she works at, before B-1c's one-rung
 * discount. The milestone ladders are cut from THIS (a club is a multiple of what the model thought
 * of her, not of the careful first bar she was handed), and it is what `startingWeight` starts from.
 */
export function modelledStartingWeight(ex: Exercise, profile: LoadProfile): number | null {
  const modelled = modelledLoadKg(ex, profile);
  if (modelled == null) return null;
  const step = 1;
  let kg = snapToStock(Math.round(modelled / step) * step, ex);
  kg = Math.max(kg, emptyBarKg(ex.equipment));
  return Math.max(kg, step);
}

export function startingWeight(ex: Exercise, profile: LoadProfile): number | null {
  const modelled = modelledLoadKg(ex, profile);
  if (modelled == null) return null;
  let kg = modelled;
  const step = 1;
  kg = snapToStock(Math.round(kg / step) * step, ex);
  // NO LIFT IS LIGHTER THAN ITS BAR. This clause used to read `&& ex.tier === 'compound'`,
  // which asked the wrong question: the bar weighs what it weighs whatever the lift is doing.
  // Since 2026-08-25 the floor is per-family (F-19): an Olympic-bar lift floors at BAR_KG, and the
  // fixed-bar lifts (`bb_curl`, `reverse_curl`, `skullcrusher`) floor at the lightest fixed bar —
  // which is the whole reason the family exists: a beginner woman's curl now seeds at 10-15 kg
  // instead of being forced up to an Olympic bar she would never curl.
  kg = Math.max(kg, emptyBarKg(ex.equipment));
  // B-1c — the first guess errs one rung light (`SEED_RUNGS_LIGHT`, measured): the model's number is
  // the load she makes Tlo on fresh, which leaves every later set under it. Never below the bar.
  const inc = STARTING_INCREMENT[ex.equipment] ?? 0;
  if (inc > 0) kg = Math.max(emptyBarKg(ex.equipment), kg - inc * SEED_RUNGS_LIGHT);
  return Math.max(kg, step);
}
