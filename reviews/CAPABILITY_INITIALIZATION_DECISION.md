# Capability Initialization — V1 Beta Decision

> **════ SUPERSEDED-FRAMING NOTE — DX-17 (2026-06-12) ════**
> Part of the **Option D capability-initialization** design set, i.e. **DX-08** — **SPECIFIED but NOT
> YET IMPLEMENTED**. It remains the canonical design reference for that pending seeding work. As-built
> today: the cold start still uses the 3-bucket beginner/intermediate/advanced seed; `bodyweight_kg` is
> now collected (DX-07) but not yet keyed into a prior. Any "predict the right load" success framing is
> reoriented by the v1 pivot — Hush is **advisory**; v1 success = honest capability tracking +
> **stagnation detection (M5/DX-09)**. See `HUSH_V1_PRODUCT_SPECIFICATION.md`,
> `HUSH_V1_DELTA_EXECUTION_PLAN.md` (DX-08).

**Type:** final comparative decision review — evidence-based, recommendation only.
**Date:** 2026-06-11 · **Model:** Hush v1 (frozen) · **Decision:** which initialization to ship for V1 beta.
**Constraint:** no implementation, no model modification.

**Evidence basis**
- `reviews/CAPABILITY_INITIALIZATION_REVIEW.md` (the prior study: should we revise at all → yes)
- `docs/analysis/COLD_START_ANALYSIS_V1.md` (the originating cold-start finding)
- `build/_assembled/init_decision_sim.py` → `init_decision_output.txt` (coverage-aware A/B/C/D)
- `build/_assembled/init_review_sim.py` → `init_review_output.txt` (per-source accuracy/convergence/risk)

All numbers are from the **frozen `hush_model` on its real `recommend()` / `SessionEngine`
paths**, synthetic reps from an independent ground truth (non-circular). Day-1 accuracy is
exact and per-capability; convergence is the harness-measured gate latency composed by each
strategy's coverage. The B/C/D split is driven by **coverage** — what fills the lifts a user
*cannot* self-report — modeled by realistic history coverage (beginner 10 % / intermediate
50 % / advanced 80 %).

---

## 1. Decision (up front)

> **Ship Option D (strength-standard prior) for V1 beta.**
> Retain the 3-bucket experience seed as the no-bodyweight fallback. Defer training-history
> refinement (the B/C benefits for users who know their numbers) to a **post-beta
> fast-follow**, once real onboarding data exists to calibrate it.

Rationale in one line: **D is the only one of the four that fixes the convergence problem
that triggered this review, while also delivering the best day-1 safety floor and the most
uniform benefit across experience levels — at low onboarding friction and low
assumption-risk.** C buys a marginal day-1 accuracy edge for materially more complexity and
*worse* convergence; B leaves beginners no better than today and does not fix convergence.

---

## 2. Head-to-head evidence

Pooled across the population (N = 600/bucket × 5 capabilities), day-1 from real `recommend()`;
`~medGate` = median capability gate-open week composed from harness per-confidence latencies:

| Strategy | median \|err%\| | p90 \|err%\| | acceptable day-1 | **too-heavy** (safety) | **~median gate-open** |
|---|---:|---:|---:|---:|---:|
| **A** current 3-bucket | 15.8 % | 33.3 % | 26.0 % | 14.6 % | 12.3 w |
| **B** history-only | 11.1 % | 29.0 % | 39.7 % | 8.3 % | 12.3 w |
| **C** history + demographic | 10.0 % | 23.1 % | **44.5 %** | 7.5 % | 10.3 w |
| **D** strength-standard | 10.0 % | **20.8 %** | 43.6 % | **5.3 %** | **2.0 w** |

Acceptable-day-1 **by experience** (exposes coverage dependence — the crux of B vs C vs D):

| Strategy | beginner | intermediate | advanced |
|---|---:|---:|---:|
| A current 3-bucket | 26 % | 28 % | 29 % |
| B history-only | 28 % | 42 % | **53 %** |
| C history + demographic | 36 % | 46 % | **53 %** |
| D strength-standard | **41 %** | 45 % | 46 % |

Reading the tables:
- **B helps only those who already know their numbers.** Beginners (10 % coverage) get
  28 % — statistically the same as today's 26 % — and the median gate stays 12.3 w because
  uncovered capabilities fall back to the conf-10 seed. B does not fix the beta-blocking
  convergence finding.
- **C is the day-1 accuracy leader** and rescues beginners (36 %), but its demographic
  fallback is seeded at confidence 20 — *below* the decision gate's precision threshold — so
  convergence improves only to 10.3 w. C also carries the most moving parts (two data
  sources + fusion + per-capability fallback).
- **D is the most uniform and the only convergence fix.** Full coverage at confidence 25
  (≈ the gate threshold) opens the gate for *every* capability for *every* user at ~2 w,
  gives the best too-heavy safety floor (5.3 %), the tightest error tail (p90 20.8 %), and
  the best beginner outcome (41 %) — the cohort least served by history and hardest to
  bucket. Its only deficit is the small day-1 accuracy gap vs C for advanced users.

---

## 3. Per-option assessment across the seven dimensions

### A — Current 3-bucket seed (baseline)
- **Implementation complexity:** none (ships today).
- **Onboarding complexity:** minimal (experience dropdown only).
- **Day-1 accuracy:** worst — 26 % acceptable, median \|err\| 15.8 %.
- **Convergence:** baseline — gate 12.3 w median; realistically-strong athletes ~30 w or
  never (cold-start study). This is the beta blocker.
- **Safety impact:** worst — 14.6 % too-heavy day-1 tail (weaker-than-declared users).
- **Maintenance cost:** none.
- **Risk of incorrect assumptions:** the *product* assumption (3 buckets capture strength)
  is already disproven; intrinsic data risk is nil.

### B — Expanded training-history prior only (no external datasets)
- **Implementation complexity:** low–moderate — one onboarding form (recent top set per
  lift); Epley inversion to score already exists; seed fallback for missing lifts.
- **Onboarding complexity:** moderate — asks for numbers many users (esp. beginners) don't
  have; partial entry is the norm.
- **Day-1 accuracy:** good where covered (advanced 53 %), **no better than baseline for
  beginners (28 %)**; pooled 39.7 %.
- **Convergence:** **not improved at the median (12.3 w)** — uncovered caps dominate.
- **Safety impact:** better than A (8.3 % too-heavy), worse than C/D.
- **Maintenance cost:** low — no external dataset to source or refresh.
- **Risk of incorrect assumptions:** self-report honesty, rep-count accuracy,
  exercise→capability mapping; structurally **abandons the low-coverage beginner cohort.**

### C — Training-history + demographic prior (age, sex, bodyweight)
- **Implementation complexity:** **highest** — two estimators + a fusion/fallback rule per
  capability + a demographic regression/table; must avoid double-applying the cohort multiplier.
- **Onboarding complexity:** moderate — history form plus bodyweight (sex/age already collected).
- **Day-1 accuracy:** **best** — 44.5 % acceptable, median 10.0 %, p90 23.1 %; lifts
  beginners to 36 %.
- **Convergence:** modest — 10.3 w; the demographic fallback's confidence (20) sits below
  the gate, so it does **not** fix convergence for the uncovered majority.
- **Safety impact:** strong — 7.5 % too-heavy.
- **Maintenance cost:** moderate — maintain a demographic model *and* a history pipeline.
- **Risk of incorrect assumptions:** **most surface area** — demographic regressions degrade
  at the tails (very light/heavy, older, female-sparse datasets) and two models means two
  ways to be wrong; fairness review required.

### D — Strength-standard prior (population strength datasets)
- **Implementation complexity:** moderate — one static lookup (per-lift bodyweight-ratio ×
  sex × experience) mapped into score space; no per-user history pipeline.
- **Onboarding complexity:** minimal+ — one extra field (bodyweight); sex/age/experience
  already collected.
- **Day-1 accuracy:** ≈ C — 43.6 % acceptable, median 10.0 %, **tightest tail (p90 20.8 %)**,
  most uniform across buckets (41/45/46 %).
- **Convergence:** **best — 2.0 w median**, full coverage; this is the option that resolves
  the originating finding.
- **Safety impact:** **best — 5.3 % too-heavy.**
- **Maintenance cost:** low–moderate — a versioned static table; one-time sourcing/licensing,
  occasional refresh; not fitted to Hush users.
- **Risk of incorrect assumptions:** table accuracy at the tails and the assumption that
  population norms transfer to Hush users — but it is a **population constant, not fitted to
  the user base, so overfitting risk is low.** Bounded further by the guardrails in §5.

---

## 4. Why D over C for V1 beta (the close call)

C and D tie on median day-1 error (10.0 %) and C leads pooled acceptable-day-1 by less than
one point (44.5 vs 43.6 %). That marginal edge does not justify C for beta because:
1. **The review was triggered by convergence, and D fixes it (2.0 w) while C does not
   (10.3 w).** Choosing C would leave the originating problem largely unsolved for the
   uncovered majority.
2. **D is safer** (5.3 vs 7.5 % too-heavy) and has the **tighter error tail** (p90 20.8 vs
   23.1 %) — the tail is what produces bad beta experiences.
3. **D serves beginners best** (41 vs 36 %) — the cohort with the least history and the most
   to gain — i.e. D's benefit is the most equitable.
4. **D is materially simpler and lower-risk** — one population table vs two fused estimators,
   no demographic-fairness exposure, no per-capability fusion logic to get wrong at beta.

C's strengths (peak accuracy for users who know their numbers) are real but are exactly the
**training-history refinement best added *on top of* D after beta**, when real onboarding
data can calibrate coverage and validate the fusion — at which point "D + optional history"
captures advanced users' 53 % without paying C's convergence and complexity costs up front.

---

## 5. Conditions on the D recommendation (carried from the prior review)

These are acceptance conditions, not a design:
1. **Conservative downward bias** — seed at a sub-median percentile of the table so residual
   error lands on the benign (too-light) side; never let the prior guess high.
2. **Confidence cap** — bound seed precision so a wrong table entry stays dislodgeable within
   a few sessions (the over-confident-prior risk: a stiff wrong prior is both unsafe and
   durable — `init_review_sim.py` Part C).
3. **No double cohort adjustment** — the table already encodes sex/experience; do not
   re-apply the existing prior cohort multiplier on top.
4. **Versioned, auditable table** — treat the dataset as a tracked model input with provenance.

**Explicitly out of scope / unchanged:** the learning loop, decision governor, and the
provisional `kappa` steady-state bias (a separate Phase-0 calibration item — all four
strategies settle ~+5–6 score above truth regardless, so it is neither caused nor fixed by
initialization and must not enter this decision).

---

## 6. Summary

| | A current | B history-only | C history+demog | **D strength-standard** |
|---|---|---|---|---|
| Day-1 acceptable | 26 % | 40 % | **44 %** | 44 % |
| Too-heavy (safety) | 14.6 % | 8.3 % | 7.5 % | **5.3 %** |
| Median gate-open | 12.3 w | 12.3 w | 10.3 w | **2.0 w** |
| Beginner acceptable | 26 % | 28 % | 36 % | **41 %** |
| Impl. complexity | none | low–mod | **high** | moderate |
| Onboarding friction | minimal | moderate | mod–high | **minimal+** |
| Maintenance | none | low | moderate | low–mod |
| Assumption risk | (product) | self-report | **highest** | low (pop. constant) |
| **Fixes convergence?** | no | **no** | partly | **yes** |

**Recommendation: adopt D (strength-standard prior) for V1 beta**, with the §5 guardrails,
the 3-bucket seed retained as the no-bodyweight fallback, and training-history refinement
scheduled as a post-beta fast-follow.

### Limitations
Constant-truth synthetic athletes; within-bucket true SD = 12 score and the history-coverage
rates (10/50/80 %) are modeling assumptions, not Hush-measured — the **ordering** of the
strategies is robust to these; the exact percentages are indicative. Residual SDs per source
(history 4.3 / standard 6.2 / demographic 9.2 score) are conservative literature-grounded
mappings via the model's own `Δscore = 61.6·rel_err`. No real onboarding data exists yet —
itself a reason to ship the lower-assumption-risk option (D) and calibrate before layering C.
