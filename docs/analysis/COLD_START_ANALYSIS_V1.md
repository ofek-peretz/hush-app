# Cold-Start Behavior — Evidence Report (Hush v1, frozen model)

**Date:** 2026-06-11 · **Scope:** evidence only — no redesign, no model edits.
**Method:** the frozen `hush_model` driven through the real production `SessionEngine`
via the Phase-0 `Harness` (`build/_assembled/`). Synthetic athletes generate reps from
their **own** true capability + independent rep noise (sd 0.4), never the model's
equations (non-circularity, R2). Reproduce with
`build/_assembled/coldstart_analysis.py` (raw log: `coldstart_output.txt`).

Capability reported: `horizontal_push` (uniform true score across the five Class-A
capabilities). Working set `target_reps=8`, `RIR=3` ⇒ target reps-to-failure (RTF) = **11**.
Constant-truth athletes (no true gain, no true fatigue) so convergence is measured cleanly.

---

## 1. How the cold start actually works (mechanism)

The entire starting point is set by **one input: self-reported experience** (3 buckets),
times a sex/age cohort multiplier applied to the prior only:

| Lever | Value | Source |
|---|---|---|
| Seed score | beginner **30** / intermediate **48** / advanced **64** | `constants.SEED_SCORE` |
| Seed confidence | **10** for everyone (floor) | `SEED_CONFIDENCE` |
| Seed prior precision | `sum_w ≈ 0.843` | `seeding.SEED_PRIOR_SUM_W` |
| Confidence curve | `c = 100·(1 − e^(−sum_w/8))` | `confidence.py` |
| Decision gate | no INCREASE/DECREASE until capability `conf ≥ 30` | `decision.govern` |
| Stability guard | gate also needs **3** consecutive consistent surprises | `STABILITY_N` |
| Rate limiter | load moves **one 2.5 kg step per session**, max | `decision.govern` |
| Calibration phase | global conf `< 70` ⇒ restrained volume | `CALIBRATION_CONFIDENCE_THRESHOLD` |

Precision needed to clear each gate: **`conf 30 → sum_w ≈ 2.85`**, **`conf 70 → sum_w ≈ 9.63`**
(vs the seed's 0.843). Precision accrues per observation as
`weight = decay × (pred_conf/100) × error_class_weight(|rep_error|)`.

**The compounding trap.** At cold start the seed-derived load is conservative (safety
discount at conf≈10), so the athlete beats the predicted reps by a wide margin. A large
rep surprise lands in the **worst** error class (`|err|>3 ⇒ 0.3`) and `pred_conf` is
~10–20%, so each observation contributes `≈ 0.2 × 0.3 ≈ 0.06` precision. Confidence
therefore crawls, the gate stays shut, the load stays conservative, and the surprise
stays large. The starting point doesn't just delay convergence — it **suppresses the
evidence that would end it.**

---

## 2. Convergence times by cohort (current seed logic)

"Matched" = true equals the seed. "Under/over-seeded" = true offset ±16 score (~±30 %
strength) — a realistic within-bucket misclassification (sandbagger, returning lifter,
bodyweight-relative differences). Times in weeks; freq = 3 sessions/wk.

| Cohort | Day-1 load gap | Gate opens (conf≥30) | Load ramp (95 %) | Calibration ends |
|---|---:|---:|---:|---:|
| beginner / matched | −16 % | 9.3 w | 10 w | 23 w ↺ |
| beginner / **under-seeded (strong)** | **−33 %** | **29 w** | 32 w | **never (<1 yr)** |
| beginner / over-seeded (weak) | +14 % | 10 w | 4 w | 40 w ↺ |
| intermediate / matched | −12 % | 11 w | 13 w | 22 w ↺ |
| intermediate / **under-seeded (strong)** | **−33 %** | **32 w** | 37 w | **never** |
| intermediate / over-seeded (weak) | +16 % | 12 w | 6 w | 40 w ↺ |
| advanced / matched | −12 % | 12 w | 14 w | 22 w ↺ |
| advanced / **under-seeded (strong)** | **−31 %** | **33 w** | 38 w | **never** |
| advanced / over-seeded (weak) | +16 % | 13 w | 6 w | 39 w ↺ |

Read-outs:

- **Even a perfectly classified athlete** does not reach a stable prescription quickly:
  the decision gate opens at **~week 9–12**, and the calibration phase (restrained
  volume) runs **~22–23 weeks**.
- **Under-seeded strong athletes — the realistic damaging case — never finish
  calibration inside a year**, and their decision gate stays shut for **~7–8 months**.
  Because the gate is shut, the rate-limiter is moot: the load *cannot* climb toward the
  athlete's real capacity.
- **↺ = calibration re-opens.** Global confidence crosses 70 and then **drops back
  below it** (the ES-010 variance/agreement factor reacting to ongoing rep noise). Most
  matched and over-seeded cells bounce back into restrained calibration volume after
  appearing to graduate — convergence is not monotonic.

---

## 3. UX risk of the current starting-point logic

**3a. What the user feels in the first sessions** (emitted load vs the load that gives
the target ~11 RTF):

| Cohort | Session 1 | Verdict |
|---|---|---|
| beginner / matched | 40 kg → **19 reps** | too light |
| beginner / strong | 40 kg → **33 reps** | far too light |
| beginner / weak | 40 kg → **8 reps** | too heavy |
| intermediate / matched | 55 kg → **18 reps** | too light |
| intermediate / strong | 55 kg → **32 reps** | far too light |
| intermediate / weak | 55 kg → **7 reps** | too heavy |
| advanced / strong | 72.5 kg → **31 reps** | far too light |
| advanced / weak | 72.5 kg → **6 reps** | too heavy |

- **Matched athletes are still ~16–19 reps vs an 11 target** for the first ~2–4 weeks —
  a ~12–16 % under-load baked in by the cold-start safety discount, independent of any
  misclassification.
- **The error is asymmetric and both directions are bad.** Under-seeded → months of
  unchallenging, "this app doesn't know me" prescriptions (engagement/retention risk),
  with a gate that won't open for ~30 weeks. Over-seeded → **first sessions are too
  heavy** (6–8 reps vs 11), a form/injury and intimidation risk on day one.

**3b. The starting point is a 3-valued guess against a continuous, high-variance
quantity.** A single self-report bucket cannot represent ±30 % within-bucket strength
variance, and the model has no second channel to correct it quickly (see the §1 trap).
The risk is structural, not a tuning artifact.

**3c. Steady-state caveat (not cold-start, but it bounds "stable recommendations").**
Every cell settles at an inferred score **+5.3 … +6.5 above truth**, so the *stable*
recommendation lands at **~8–10 reps vs the 11 target** (slightly too heavy relative to
the stated target). This is the **provisional, externally-unanchored `kappa`** (the model
de-fatigues reps the athlete never lost) — already flagged PROVISIONAL in
`constants.py` and the assumptions register. It is a steady-state calibration issue, but
it matters here for two reasons: (1) "stable recommendations" converge to a *biased*
fixed point, and (2) it contaminates any asymptote-relative convergence metric (see §4).

---

## 4. Would demographic / training-history priors materially reduce convergence?

Tested by replacing the seed with a prior at onboarding (writes `capability_state`
score and — for the informed prior — confidence/precision; **no model constant changed**).
Worst realistic cohort (under-seeded strong) shown:

| Cohort (strong) | Day-1 load gap | Gate opens |
|---|---:|---:|
| beginner — **current seed** | −33 % | 29 w |
| beginner — **perfect prior** | **−8 %** | **0.3 w** |
| beginner — noisy prior (sd 6 score, conf 25) | avg **6.7 %** | — |
| intermediate — current seed | −33 % | 32 w |
| intermediate — perfect prior | **−9 %** | **0.3 w** |
| intermediate — noisy prior | avg **6.1 %** | — |
| advanced — current seed | −31 % | 33 w |
| advanced — perfect prior | **−7 %** | **0.3 w** |
| advanced — noisy prior | avg **6.2 %** | — |

**Yes — materially, on exactly the two things that hurt most:**

1. **Initial mis-prescription** (the part the user feels in weeks 0–8): a perfect prior
   collapses the day-1 load gap from **−31…−33 %** to **−7…−9 %** (the residual is just
   the irreducible safety discount). Even a **noisy** prior — sd 6 score (~±10 % strength),
   modest confidence 25 — collapses the average initial gap to **~6 %**. ~25 percentage
   points of day-1 error removed.

2. **Decision-gate latency**: supplying prior precision opens the gate at **week 0.3
   instead of week 29–33**. The system can adapt load from session one instead of after
   ~7–8 months. ~30 weeks of latency removed.

**What a prior does *not* fix** (and must not be credited with): the steady-state +5–6
score `kappa` bias, the terminal ±1-step load hunting, and the calibration re-opening —
all independent of the starting point. This is why the asymptote-relative "ramp(95 %)"
column still reads ~30 w even with a perfect prior: that number is dominated by the slow
`kappa`-driven upward drift, **not** the cold start. The honest split: **priors fix the
cold-start gap and gate latency; they do not fix the steady-state bias.**

---

## 5. Method, scope, and limits of this evidence

- Real production path (`hush_model` + `SessionEngine`), not a reimplementation;
  synthetic reps from an independent ground truth (R2 non-circularity preserved).
- Constant-truth athletes only; rep noise sd 0.4; freq = 3/wk; uniform truth across the
  5 Class-A capabilities; `horizontal_push` reported. Part 1/2 use a single seed/cell;
  the noisy-prior row averages 5 draws. Results are deterministic given the seeds.
- **Not swept:** improvement/fatigue interacting with cold start, higher rep-noise,
  alternative frequencies/volume bands, female/older cohorts (cohort multiplier only
  rescales the prior, not the qualitative findings).
- **Robustness:** the cold-start *latency* findings (gate opens at ~9–33 w, calibration
  ~22 w→never, the evidence-suppression trap) flow from the confidence ramp + rate-limiter
  + 3-bucket seed coarseness, and are **independent of the provisional `kappa`**. If
  Phase 0 calibrates `kappa` down, the §3c/§4 steady-state numbers shift; the convergence
  and UX-risk conclusions do not.

## 6. Bottom line (evidence, not recommendation)

- The current starting point is a **3-valued self-report** feeding a **fixed
  low-confidence seed**, and the learning loop **suppresses its own correction evidence**
  at cold start. Consequence: matched athletes take ~2–4 weeks of too-light sessions and
  ~22 weeks to leave calibration; **realistically misclassified strong athletes get
  ~7–8 months of unchallenging prescriptions and never finish calibration within a year.**
- The user-facing risk is concrete and bidirectional: **under-seeded → disengagement**;
  **over-seeded → day-one loads that are too heavy.**
- A demographic / training-history prior **would** materially reduce convergence on the
  two axes the user experiences — **day-1 load error (−25 pp) and decision-gate latency
  (−~30 weeks)** — while leaving the separate, already-flagged steady-state `kappa` bias
  untouched.
