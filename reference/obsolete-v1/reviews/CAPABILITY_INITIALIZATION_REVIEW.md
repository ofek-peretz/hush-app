# Capability Initialization Review

> **════ SUPERSEDED-FRAMING NOTE — DX-17 (2026-06-12) ════**
> Design study behind **Option D seeding = DX-08**, which is **SPECIFIED but NOT YET IMPLEMENTED**; kept
> as the canonical design reference for that pending work. As-built today: 3-bucket seed; `bodyweight_kg`
> collected (DX-07). Load-prediction success framing is reoriented by the v1 pivot — Hush is **advisory**;
> success = honest capability tracking + **stagnation detection (M5/DX-09)**. See
> `HUSH_V1_DELTA_EXECUTION_PLAN.md` (DX-08).

**Type:** formal design study — evidence-based recommendation only.
**Date:** 2026-06-11 · **Model:** Hush v1 (frozen) · **Decision horizon:** before beta.
**Constraint:** no implementation, no model modification, no Hush redesign.

**Companion evidence**
- `docs/analysis/COLD_START_ANALYSIS_V1.md` (cold-start behavior, baseline)
- `build/_assembled/init_review_sim.py` → `init_review_output.txt` (this study's Parts A–C)
- `build/_assembled/coldstart_analysis.py` → `coldstart_output.txt`
All numbers below are reproduced from the **frozen `hush_model` driven through the real
production path** (`recommend()` for day-1 prescriptions; `SessionEngine` for convergence).
Synthetic athletes generate reps from an independent ground truth (non-circular, R2).

---

## 1. Recommendation (up front)

> **REVISE capability initialization before beta — minimally and conservatively.**

The current 3-bucket experience seed is **not sufficient for V1**. The evidence shows it
(a) places only **~24 % of first sessions in an acceptable load zone**, (b) already
carries a **~15 % "too-heavy" day-1 tail** (a safety edge, not a safety margin), and
(c) leaves realistically-misclassified strong athletes with **7–8 months of too-light,
unadaptive prescriptions** because the decision gate never opens. A prior built from data
the user can supply at onboarding **improves all three at once** and, critically, is
**safer**, not riskier, on the day-1 axis — provided it is seeded conservatively.

The recommended revision is **scope-minimal**: add an *optional* training-history prior
(a recent top set per major lift) as the preferred onboarding path, with a
strength-standard table as the no-history fallback, and the **existing 3-bucket seed
retained as the final fallback**. The revision must satisfy three guardrails derived from
Part C (§6): conservative **downward** bias, a **prior-confidence cap**, and **source-matched
confidence**. This is a recommendation and a set of acceptance conditions — not a design.

What this review explicitly does **not** recommend touching: the provisional `kappa`
steady-state bias (a separate, already-flagged Phase-0 calibration item — see §7).

---

## 2. Question and scope

Beta-readiness question: *is the way Hush initializes per-capability strength estimates at
onboarding good enough to ship to beta users, or must it change first?*

In scope: the seed score, the seed confidence/precision, and any onboarding-time prior
(demographic, training-history, strength-standard, or test-based). Out of scope: the
learning loop, the decision governor, the fatigue/variance model, and `kappa` calibration.

---

## 3. How initialization works today (the object under review)

The entire starting estimate is set by **one input — self-reported experience (3 buckets)**
— times a sex/age cohort multiplier on the prior:

| Lever | Value | Source |
|---|---|---|
| Seed score | beginner 30 / intermediate 48 / advanced 64 | `constants.SEED_SCORE` |
| Seed confidence | **10 for everyone** (floor) | `SEED_CONFIDENCE` |
| Seed precision | `sum_w ≈ 0.843` | `seeding.SEED_PRIOR_SUM_W` |
| Cohort adjust | sex × age taper, **on the prior only** | `cohort_multiplier` |

Two model facts make this the dominant driver of early experience:
1. The decision gate (`conf ≥ 30 ⇒ sum_w ≥ 2.85`) and calibration exit
   (`conf ≥ 70 ⇒ sum_w ≥ 9.63`) are far above the seed's 0.843, and precision accrues
   slowly at cold start because the conservative seed load produces large rep surprises
   that land in the worst evidence class (the cold-start trap, see companion doc §1).
2. The model's score↔strength law fixes the unit of "how wrong is a seed":
   `Δscore = (1/k)·(Δstrength/strength) = 61.6 · relative_strength_error`. A 10 %
   strength error is ~6.2 score units; the 18-point gap between buckets is ~34 % strength.
   **Within-bucket true-strength variance is comparable to the between-bucket gap**, which
   a 3-valued seed cannot represent.

---

## 4. Finding 1 — the 3-bucket seed is insufficient for V1

Population study (Part A: N = 400/bucket; within-bucket true SD = 12 score ≈ ±20 % strength
at 1 SD, a conservative spread). Day-1 load taken from the real `recommend()`:

| Initializer | median \|err%\| | p90 \|err%\| | acceptable day-1 | **too-heavy** (risk) | too-light |
|---|---:|---:|---:|---:|---:|
| **current (3-bucket seed)** | 15.8 % | 33.3 % | **24.1 %** | **14.8 %** | 61.1 % |

- Only ~1 in 4 first sessions lands in an acceptable load zone (9–16 reps vs an 11-RTF target).
- ~15 % of users get a **too-heavy** first prescription (≤8 reps, no reserve) — these are
  the *weaker-than-declared* users. So "keep the conservative seed for safety" is a
  **false comfort**: the current seed already has a material day-1 safety tail.
- The residual "too-light" 61 % is dominated by the confidence-scaled safety discount (the
  model deliberately under-loads at low confidence), and is the benign failure direction.

Convergence (Part B: real `SessionEngine`, gate = capability `conf ≥ 30`):

| Initializer | median gate-open | p90 gate-open | never opens by 40 w |
|---|---:|---:|---:|
| **current (3-bucket seed)** | 12.3 w | 19.3 w | 4 % |

Combined with the cold-start study (under-seeded strong athletes: gate shut ~30 w,
calibration never completing within a year), the conclusion is that the current seed is a
**material beta risk on engagement (months of unadaptive light loads) and a non-trivial
day-1 safety tail**, not merely a slow-but-safe default.

**Verdict: insufficient for V1.**

---

## 5. Finding 2 — candidate initialization approaches, evaluated

Mapping each data source to the strength it leaves unexplained, then to a prior residual
SD via the model's own `61.6 · rel_err` law:

| Approach | What it uses | Residual (rel. strength → score SD) | Onboarding cost | Notes |
|---|---|---|---|---|
| **Training-history prior** | a recent top set (load×reps) or known 1RM per major lift | ~7 % → **4.3** | one screen of inputs | most accurate; Epley-invertible directly into the model's score space |
| **Strength-standard tables** | per-lift bodyweight-ratio norms × sex × experience | ~10 % → **6.2** | bodyweight only | public datasets (ExRx / StrengthLevel-class); no per-user history needed |
| **Demographic regression** | sex / age / bodyweight | ~15 % → **9.2** | bodyweight only | extends the *existing* cohort multiplier (already does sex/age) with bodyweight |
| **Onboarding test set (AMRAP)** | an in-app calibration set | ~5 % → ~3 | a test workout | most accurate but adds friction; effectively the training-history path executed live |
| **Collaborative / cohort transfer** | other users' trajectories | n/a | data-hungry | **rejected for V1** — high overfitting risk, needs a user base that doesn't exist at beta |

The first three are evaluated quantitatively in §§ 6–7. The test-set path is noted as the
accuracy ceiling but carries onboarding-friction trade-offs outside this review's remit.
Collaborative initialization is rejected for V1 on overfitting grounds (§7).

---

## 6. Finding 3 & 4 — quantified accuracy and convergence improvement

**First-session accuracy (Part A), same population as §4:**

| Initializer | median \|err%\| | p90 \|err%\| | acceptable | too-heavy | Δ vs current |
|---|---:|---:|---:|---:|---|
| current (3-bucket) | 15.8 % | 33.3 % | 24.1 % | 14.8 % | — |
| demographic prior | 12.5 % | 26.7 % | 35.5 % | 12.9 % | accept **+11 pp**, heavy −2 pp |
| strength-standard prior | 10.0 % | 20.6 % | 44.8 % | 4.3 % | accept **+21 pp**, heavy **−10 pp** |
| training-history prior | 8.3 % | 16.1 % | 52.8 % | 1.8 % | accept **+29 pp**, heavy **−13 pp** |

- Day-1 median error roughly **halves** (15.8 → 8.3 %) with a training-history prior.
- The **too-heavy (safety) tail is the headline**: 14.8 % → 1.8 %. Better priors are
  *safer*, because an accurate estimate plus the model's safety discount lands errors on
  the light side instead of guessing high for under-declared-strong / over-declared-weak users.

**Convergence — decision-gate latency (Part B):**

| Initializer | median gate-open | p90 gate-open | never by 40 w |
|---|---:|---:|---:|
| current (3-bucket) | 12.3 w | 19.3 w | 4 % |
| demographic prior (conf 20) | 10.3 w | 20.3 w | 1 % |
| strength-standard prior (conf 25) | **2.0 w** | 2.0 w | 0 % |
| training-history prior (conf 35) | **0.3 w** | 0.3 w | 0 % |

**Key nuance for the recommendation:** convergence benefit tracks the prior's **confidence
(precision), not only its accuracy.** The demographic prior is more accurate than the seed
but, seeded at confidence 20 (`sum_w 1.79`, still below the gate's 2.85), barely moves gate
latency. The strength-standard (conf 25) and training-history (conf 35) priors clear the
gate's precision threshold and open it almost immediately. **A prior must be seeded with
confidence proportional to its real accuracy to realize the convergence gain** — which is
exactly where the next finding's risk lives.

---

## 7. Finding 5 — risks of overfitting / incorrect / over-confident priors

**Incorrect-prior risk (Part C).** A prior that overstates strength by +12 score (~+20 %,
a plausible table or self-report error), at increasing confidence (stiffness):

| Prior | `sum_w` | day-1 reps | day-1 verdict | wks to correct (score < true+6) | wks until load safe (≥9 reps) |
|---|---:|---:|---:|---:|---:|
| current seed (unbiased) | 0.84 | 17.5 | too-light | 0.3 w | 0.0 w (already safe) |
| biased, loose (c15) | 1.30 | 8.7 | **too-heavy** | 5.3 w | 4.3 w |
| biased, medium (c35) | 3.45 | 7.4 | **too-heavy** | 7.3 w | 5.0 w |
| biased, stiff (c55) | 6.39 | 6.1 | **too-heavy** | 9.3 w | **11.3 w** |

This is the central tension: **stiffness buys convergence (§6) but, if the prior is wrong,
stiffness is also what makes the error dangerous and durable.** A stiff biased prior emits
a too-heavy day-1 load *and* resists the observations that would correct it (higher `sum_w`
needs more evidence to move), keeping the load unsafe for up to ~11 weeks. The current loose
seed, by contrast, errs light and self-corrects in one session on the safety axis.

**Mitigations (acceptance conditions for any revision, derived from this evidence):**
1. **Conservative downward bias** — seed the prior at a sub-median percentile so residual
   error lands on the too-light (benign) side; never let a prior guess high.
2. **Confidence cap** — bound seed `sum_w` so a wrong prior is dislodgeable within a few
   sessions (Part C shows c≤~35 stays correctable; c55 does not). The cap also bounds the
   blast radius of a bad input.
3. **Source-matched confidence** — set seed confidence from the source's real accuracy
   (training-history > strength-standard > demographic), not a flat optimistic value.

**Other risks considered:**
- **Demographic-prior fairness / coverage.** Sex/age/bodyweight regressions degrade at the
  tails (very light/heavy, older, atypical). The downward-bias + confidence-cap guardrails
  bound this; demographic should be the *lowest-confidence* fallback, consistent with §6.
- **Overfitting (collaborative/ML priors).** Rejected for V1: no beta-scale user base
  exists to fit against, and an over-fit prior is the §7 risk at scale. Strength-standard
  tables are population-level constants, not fitted to Hush users — low overfitting risk.
- **Interaction with the existing cohort multiplier.** Any prior must not double-apply
  the sex/age taper; this is an integration constraint for the revision, noted not designed.
- **Orthogonal steady-state `kappa` bias.** All cells settle ~+5–6 score above truth
  regardless of initializer (companion §3c). This is the provisional, unanchored `kappa`,
  already flagged for Phase-0 calibration. **Initialization cannot fix it and must not be
  blamed for it**; conversely, fixing initialization does not remove it. Keep the two items
  separate in beta-readiness accounting.

---

## 8. Decision

| Option | First-session accuracy | Convergence | Safety (day-1 too-heavy) | Beta risk |
|---|---|---|---|---|
| **Keep current 3-bucket seed** | 24 % acceptable | gate ~12 w; strong-athlete gate ~30 w / calib never | 14.8 % too-heavy | **High** — months of unadaptive loads + a real safety tail |
| **Revise: add conservative prior** (training-history → strength-standard → 3-bucket fallback) | 45–53 % acceptable | gate 0.3–2 w | 1.8–4.3 % too-heavy | **Low–moderate**, *iff* the §7 guardrails hold |
| Revise without guardrails (stiff/upward prior) | high | fast | **worse** (§7) | **High** — dangerous, durable errors |

**Recommendation: revise, with the §7 guardrails as hard acceptance conditions.** The
revision is scope-minimal (an onboarding input + a fallback chain, no learning-loop or
model-constant change) and is justified by a consistent, reproducible improvement on every
beta-relevant axis. Keeping the current seed ships a known engagement problem and a known
day-1 safety tail to beta users; revising without the guardrails trades a benign failure
mode for a dangerous one. The middle path is the only evidence-supported one.

---

## 9. Limitations of this evidence

- Constant-truth synthetic athletes; rep-noise SD 0.4; frequency 3/wk; uniform truth across
  the five Class-A capabilities; `horizontal_push` reported. Part A is analytic over the real
  `recommend()`; Part B uses N = 24/bucket (medians stable, tails indicative).
- Prior residual SDs (4.3 / 6.2 / 9.2 score) are literature-grounded mappings of "unexplained
  strength variance → score units," not Hush-measured; they are deliberately conservative and
  the ordering (history < standard < demographic) is the robust claim, not the exact weeks.
- Within-bucket true SD = 12 score is a modeling assumption; larger real spread strengthens
  the case to revise, smaller weakens it. No real onboarding data exists yet to fix it — a
  reason to treat the prior's confidence cap conservatively at beta.
- The `kappa` steady-state bias is provisional; if Phase-0 recalibrates it, §4/§6 day-1 and
  gate-latency conclusions are unaffected (they precede steady state), and §7's correction
  weeks shift modestly. The recommendation is robust to that calibration.
