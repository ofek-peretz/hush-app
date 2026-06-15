# Model Readiness — Final Review (pre-Wave-2)

> **════ SUPERSEDED-FRAMING NOTE — DX-17 (2026-06-12) ════**
> Read against the as-built system, which has advanced past this review's baseline. Current build: through
> **DX-09 (M5 stagnation)** — **schema v9, 156/156 tests**; the model is **advisory** (athlete owns load;
> ES-006 governor advisory, DX-03/DX-20), `actual_weight` is a learning input (M1), exploration is off
> (DX-04), and the **active investigation engine (ES-013) is retired → detection = M5**. Where this
> document frames Hush as a load-authority system or cites Sprint-4 / schema-v6 / 125-tests, defer to
> `HUSH_V1_PROJECT_STATUS.md`.

**Type:** evidence-based readiness review. **Goal:** identify any remaining *model* risk that
could materially damage user experience in the first weeks. **Not** a feature proposal.
**Date:** 2026-06-11 · **Model:** Hush v1 (frozen) · **Premise:** Option D adopted, no other
model change. **Constraints honored:** no implementation, redesign, new feature, parameter
change, or model modification.

**Bodies of work reviewed:** `docs/analysis/COLD_START_ANALYSIS_V1.md`,
`reviews/CAPABILITY_INITIALIZATION_REVIEW.md`, `…_DECISION.md`, `…_IMPLEMENTATION_SPEC.md`,
`reviews/EXERCISE_LEVEL_INITIALIZATION_REVIEW.md`,
`reviews/implementation/SESSION_RUNTIME_TRANSITION_REVIEW.md`.
**New evidence for this review:** `build/_assembled/correction_velocity_sim.py` →
`correction_velocity_output.txt` (frozen model, real `recommend()`/`SessionEngine`). One
mechanism is verified directly in frozen code: `implementation/sprint1/pipeline.py:84–88`
(streak **reset-on-fire**).

---

## 1. Cold Start Status — **PARTIALLY SOLVED**

| Aspect | Status under Option D | Evidence |
|---|---|---|
| Day-1 starting accuracy | **Solved** for the typical population | ≤3 % too-heavy, 0 % unliftable, uniform across sex/age/experience (SPEC §5) |
| Day-1 safety (over-load tail) | **Solved** | 14.6 %→≤3 % too-heavy; detrained 98.7 %→3.3 % via bodyweight-keying (SPEC §5) |
| Decision-gate latency | **Solved** | strong-athlete gate ~30 wk → ~2 wk (DECISION Part B) |
| **Correction velocity** | **Open (bounded)** | rate-limited ~1 step/3 workouts; large residual errors slow/never (Q2) |
| **Steady-state accuracy** | **Open** | inferred score settles ~+5–6 (kappa); load ~+5 % heavy vs target (COLD_START §3c) |
| Atypical / mis-seeded tail | **Open (small)** | athletes D mis-seeds ≥20–30 % correct very slowly (Q2) |

**Why "Partially Solved":** Option D resolves the problem that triggered the investigation —
a coarse, low-confidence start that under-seeded strong athletes and left the decision gate
shut for months. For a normally-classified athlete the start is now accurate, safe, and
fast-gating. What remains is **not** the starting point but **post-start dynamics**: the model
corrects residual error slowly (Q2/§verified rate-limit), settles slightly heavy due to the
provisional `kappa` bias, and cannot quickly rescue the small tail it still mis-seeds. None of
these is reintroduced by D; they are pre-existing model properties D does not touch. The
**dominant** cold-start risk is solved; a **bounded, mostly-benign** tail remains.

---

## 2. Correction Velocity (Q2)

Seed a deliberate load error at Option D's confidence cap (25), drive the frozen model,
count **CAP-workouts** (sessions training that capability; ~1.3/wk at freq 3) to **permanently
enter ±10 %** and **first-touch ±5 %** of the true-correct load. The model's load asymptotes
**~+5 % above** the true-ideal load (kappa), so ±5 % is frequently only touched, not held.

**Underestimation (seed too light):**

| Cohort | 10 % | 20 % | 30 % | 40 % |
|---|---|---|---|---|
| beginner | 34 wk-outs (~11 w) | 52 (~17 w) | **never** | **never** |
| intermediate | 23 (~8 w) | 40 (~13 w) | 61 (~20 w) | **never** |
| advanced | 28 (~9 w) | 42 (~14 w) | 64 (~21 w) | **never** |

**Overestimation (seed too heavy):**

| Cohort | 10 % | 20 % | 30 % | 40 % |
|---|---|---|---|---|
| beginner | 1 | 5 (~2 w) | 13 (~4 w) | 21 (~7 w) |
| intermediate | 1 | 5 (~2 w) | 15 (~5 w) | 21 (~7 w) |
| advanced | 1 | 1 | 15 (~5 w) | 21 (~7 w) |

**Root cause (verified in code):** the ES-006 governor moves load by **one equipment step
(2.5 kg)** only after **3 consecutive consistent surprises**, and the streak **resets on each
fire** (`pipeline.py:84–88`). Effective ratchet ≈ **1 step per ~3 workouts**, independent of
the seed. The score-blend that feeds the target is also throttled at cold start (≈0.06
precision/observation). The two compound.

**Direction asymmetry:** the confidence-scaled safety discount (~−9 % at conf 25) pushes
under-seeds *further* light (a 10 % under-seed lands −21 % at day-1) but pulls over-seeds
*toward* correct (a 10 % over-seed lands ~0 %). So **over-estimation corrects faster in
load-space** even though it is the unsafe direction; **under-estimation corrects slower** but
is benign.

**Poor-UX scenarios identified:**
- **Large under-seed (≥20–30 %)** → 4–5+ months of too-light, unchallenging sessions, and at
  ≥30–40 % the load **does not reach ±10 % within a 40-week season**. Disengagement risk.
  *Likelihood under D: low* (the table is accurate and biased down) *but non-zero* — e.g. a
  lean, light-for-bodyweight but strong lifter, or table tail error.
- **Large over-seed (≥30–40 %)** → a prescribed load near the athlete's 1RM (a +40 % over-seed
  prescribes ~1-rep loads) held for **~7 weeks** before reaching ±10 %. *Likelihood under D:
  very low* (downward bias + bodyweight-keying suppress it) *but high severity* (injury/
  intimidation).
- **Everyone:** the kappa asymptote keeps the settled load ~+5 % heavy vs the stated target
  (settles ~8.7 reps where the target implies 11) — a persistent mild mismatch, not a
  convergence failure.

---

## 3. Week-1 Mapping — information deficit (Q3)

**Does the model receive enough information in week 1 to build an accurate capability map?**
**Yes — the information is sufficient; the model does not act on it.** Week 1 exposes all five
Class-A capabilities within ~2 sessions and observes actual reps at real loads every set. A
single week-1 observation is enough to pin the score: a re-seed from one first working set
lands **within ~0.5 score of true (median; p90 ≈1.3)** (Q4 / `correction_velocity_sim.py`).

The deficit is therefore **not missing data — it is two usage limits:**
1. **Throttled evidence weighting (primary).** Early observations carry low `pred_conf` and,
   because the conservative load produces large rep-surprises, the *poorest* error-class
   weight — ≈0.06 precision each. The prior stays authoritative for ~8 workouts (prior share
   94/88/83/73 % after workouts 1/2/3/5; SPEC §4). The model *has* the week-1 map but treats
   its own seed as more authoritative than the athlete's performance.
2. **Information-quality limit (secondary).** Because the model starts light (safety discount)
   and ratchets slowly, **week-1 observations are all at light loads → high reps → noisier
   Epley extrapolation.** The model never probes near the athlete's true working intensity in
   week 1, so the data it collects is lower-quality than it could be.

**What is "missing" is not information but the model's willingness to use week-1 performance as
authoritative, plus a near-working-load probe.** (Per instruction: stated as a deficit only;
no implementation proposed. The remedy touches evidence weighting — a model-review item.)

---

## 4. Calibration Strategies (Q4)

| Strategy | Accuracy | Safety | Convergence (week-1 map) | Complexity | User burden |
|---|---|---|---|---|---|
| **A. Option D only** | Good day-1 (≤3 % too-heavy) | High (guardrails) | **Slow** — blend/ratchet rate-limited; no week-1 map speed-up | Low (onboard field + table) | Minimal (bodyweight) |
| **B. D + ESRI** | **Best day-1** (34 % acc) | High *only with* bodyweight clamp (else 11.5 % too-heavy) | Slow — better *start*, same slow correction | High (self-report + clamp + fusion) | Moderate, regressive (prompts; worst for novices) |
| **C. D + week-1 actual-performance re-seed** | Day-1 = D; **map ≈true in 1 workout** (resid 0.5 score) | High — objective (no ego), safe both directions | **Materially improves week-1 mapping** — corrects any seed error in one exposure | Moderate–High, **and requires a model-behavior change** | **None** (passive capture) |

**Which materially improves week-1 mapping?** **Only Option C.** A and B improve (or polish)
the *starting point*; neither changes the *correction velocity*, so the week-1 map stays
prior-dominated for ~8 workouts. Option C attacks the actual deficit (§3) by treating the
first real performance as high-precision initialization, collapsing correction to one workout
— objectively and with zero burden.

**But Option C is out of current scope.** The validated model is **reps-only**:
`actual_weight` is inert audit metadata, and consuming performance as an initialization signal
(or re-weighting the first observation) is a **model-behavior change flagged for model review /
Phase-0**, not Wave-2 (SESSION_RUNTIME §6.1). For a no-model-change beta, **A is sufficient and
safe**; **B is optional polish carrying burden/▾risk** (and must not ship without the clamp);
**C is the highest-value post-beta move** and should be evaluated in Phase-0 alongside the
`kappa`/evidence-weighting work it depends on.

---

## 5. Adaptation Directionality (Q5)

**The model adapts in both directions and is eventually safe in both** — but slowly and
asymmetrically.

- **Stronger than expected (under-seed):** corrects **up** via INCREASE steps. **Benign-safe**
  (too-light is never dangerous) but **slow** (§2: months for ≥20 %, never for ≥30–40 % in a
  season). The safety discount makes the *effective* under-load worse than the seed error.
- **Weaker than expected (over-seed):** corrects **down** via DECREASE steps. **Faster in
  load-space** (the discount helps) **but it is the unsafe direction**, and the decision gate
  *holds* any change below conf 30 — so a too-heavy load can be **held while confidence ramps**.

**Asymmetries:** (1) the safety discount aids over-seeds and worsens under-seeds; (2) both
directions are rate-limited to ~1 step/3 workouts (reset-on-fire, verified); (3) the kappa
bias biases the *destination* ~+5 % heavy for everyone.

**Slow paths:** the ratchet + throttled blend (§2). **Failure modes:** large under-seed →
persistent too-light / never-converges-in-season (disengagement, benign safety); large
over-seed → sustained dangerous too-heavy ~7 wk (injury, rare under D); kappa fixed point →
permanent mild over-load vs target. No direction is *unable* to adapt; both are **slow**, and
the unsafe direction is **rare-but-real and rate-limited**, not blocked.

---

## 6. Remaining model-related UX risks (Q6)

| # | Risk | Severity | Likelihood | Impact (first weeks) | Recommended action (no model change now) |
|---|---|---|---|---|---|
| 1 | Slow correction velocity (1 step/3 workouts) | Med | Med (any residual error) | Weeks of off-target load | Accept for beta (bounded by D accuracy); flag governor-rate + Option C for Phase-0 |
| 2 | Large under-seed never corrects in a season (atypical/light-for-bw athletes) | Med | Low | Persistent too-light → disengagement | Monitor in beta telemetry; Option C candidate |
| 3 | Large over-seed → sustained too-heavy ~7 wk | **High** | **Low** | Injury / intimidation | Ship D guardrails (down-bias, ceiling clamp, bodyweight-keying) **as specified**; monitor |
| 4 | Kappa steady-state bias (+~5 % heavy vs target) | Low–Med | **High** (everyone) | Settles ~8.7 reps vs 11-target; mild chronic over-load | Phase-0 `kappa` calibration (already flagged); document for beta |
| 5 | Throttled week-1 learning (prior dominates ~8 workouts) | Low | High | Model slow to reflect reality despite having data | Evidence-weighting / Option C review in Phase-0 |
| 6 | ESRI self-report hazard *if B shipped without clamp* | High | Med (only if B adopted naively) | Day-1 too-heavy (11.5 %) | Do **not** ship ESRI without the mandatory bodyweight clamp (ESRI review §4); not a beta item if B deferred |
| 7 | D table mis-calibration / dataset tail error | Med | Low–Med | Cohort-specific mis-seed | Run the SPEC §5 validation gates before beta; freeze the table |

Risks 1, 2, 4, 5 are **inherent frozen-model dynamics** (not introduced by D) and are Phase-0
items. Risks 3, 7 are **contained by shipping D exactly as specified**. Risk 6 is **avoided by
not shipping B for beta** (or only with the clamp).

---

## 7. Final Verdict (Q7) — **READY WITH KNOWN LIMITATIONS**

If beta launched today with **Option D adopted and no other model change**, the model is
**Ready with known limitations** — provided D ships with its specified guardrails
(bodyweight-keying, capped experience modifier, downward bias, floor/ceiling clamps,
confidence cap 25) and the §5 validation gates pass.

**Why Ready (evidence):** the problems that motivated this entire investigation are resolved —
day-1 over-load 14.6 %→≤3 %, unliftable→0 %, detrained hazard 98.7 %→3.3 %, decision-gate
latency ~30 wk→~2 wk, uniform across every required cohort (SPEC §5; DECISION Part B). The
failure that would most damage early UX (a confidently-wrong, dangerous, durable start) is
specifically engineered out.

**Why "with known limitations," not unconditionally Ready:** three residual, **bounded**
model behaviors remain and must be documented + monitored, not silently shipped:
1. **Slow correction velocity** — large residual seed errors take months or do not converge in
   a season (§2); mitigated by D's accuracy but real for the atypical tail.
2. **Kappa steady-state bias** — recommendations settle ~+5 % heavy vs the stated target for
   everyone (§2/§5); provisional and unvalidated, a Phase-0 calibration item.
3. **Week-1 learning is throttled** — the model under-uses sufficient week-1 information (§3);
   the high-value fix (Option C) needs model review and is out of scope.

**Why not Not-Ready:** there is **no launch-blocking model defect**. The residual risks
degrade **gracefully** — the common direction (too-light) is safe, the dangerous direction
(too-heavy) is rare and guarded, and every remaining item is a *velocity/steady-state*
refinement rather than a correctness failure. None requires a model change before beta; all
belong to the Phase-0 calibration track (`kappa`, evidence weighting, governor rate, Option C).

**Condition on the verdict:** Ready-with-known-limitations **holds only if** D is implemented
to spec (guardrails + §5 gates) and limitations 1–3 are recorded in the beta risk log with
telemetry to measure correction velocity and over-load incidence in real users — the data
Phase-0 needs and that this study, on synthetic athletes, can only bound.

---

### Method note / limitations
All quantitative results are from the frozen `hush_model` on its real `recommend()`/
`SessionEngine` paths with synthetic, constant-truth athletes; error magnitudes are mapped to
score via the model's own `Δscore = 61.6·rel_err`. Coverage rates, residual SDs, and noise are
conservative modeling assumptions — the **orderings, the verified rate-limit, and the
direction asymmetry are robust**; exact week counts are indicative and should be confirmed
against beta telemetry. The reset-on-fire rate limit (§2) and the reps-only constraint (§4) are
verified in frozen code, not assumed.
