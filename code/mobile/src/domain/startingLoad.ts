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
import { BAR_KG } from '@/engine/loadMath';
import { loadFloor } from '@/engine/v5/grid';
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
export type LoadProfile = Pick<Profile, 'sex' | 'weightKg'>;

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

export function startingWeight(ex: Exercise, profile: LoadProfile): number | null {
  const modelled = modelledLoadKg(ex, profile);
  if (modelled == null) return null;
  let kg = modelled;
  // Round to a loadable increment.
  // Founder: 1 kg steps everywhere (finer + more accurate than 2.5 — 80 → 81, not 82.5).
  const step = 1;
  kg = Math.round(kg / step) * step;
  // NO BARBELL LIFT IS LIGHTER THAN THE BAR. This clause used to read `&& ex.tier === 'compound'`,
  // which asked the wrong question: the bar weighs 20 kg whatever the lift is doing. The two
  // barbell ISOLATION lifts in the catalogue — `bb_curl` and `skullcrusher`, both baseKg 20 — fell
  // through it, so EVERY beginner was handed a 16 kg barbell curl (a beginner woman, 10 kg). The
  // tier was never the point; the equipment is.
  if (ex.equipment === 'barbell') kg = Math.max(kg, BAR_KG);
  return Math.max(kg, step);
}
