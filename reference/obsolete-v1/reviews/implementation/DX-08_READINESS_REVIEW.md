# DX-08_READINESS_REVIEW.md — model review gating Option D seeding

> **Purpose.** DX-08 changes a model behavior (the cold-start seed for bodyweight users) and introduces
> fitted parameters. Per the governing rule — *no redesign without explicit model review* — **this document
> is that review.** It (a) confirms scope and truthfulness against the approved Product Specification and the
> founder constraint, (b) resolves the spec-internal inconsistencies an implementer would otherwise hit, (c)
> names the decisions that must be made before coding, and (d) gives a **go / no-go** with conditions.
> Pairs with `DX-08_EXECUTION_PACKAGE.md`. Date: 2026-06-12. Baseline: schema v9, 156/156.

---

## 0. APPROVED DIRECTION — D1 interpretation LOCKED (owner, 2026-06-12)

The structural interpretation of Option D is **approved and binding**:

- **Bodyweight and sex are the primary seed inputs.** The bodyweight × sex table **is the baseline
  capability estimate.**
- **Experience is a bounded adjustment layer on top of that baseline — not an alternative capability
  model.** It may only nudge the baseline within the hard cap (≤+20%); it must **not dominate** the seed.
- **Conservative under-seeding is preferred over aggressive over-seeding.**
- **Advanced athletes may start slightly below true capability and converge through observed performance**
  (the existing governor recovers headroom after corroboration; no new progression machinery).

This is exactly the **safety interpretation** the review recommended; it resolves the §2.1-vs-§2.3 tension
(§2 below) and the structural half of D1. The implementation in `DX-08_EXECUTION_PACKAGE.md` (§3
`estimate_1rm`: `bodyweight × base_ratio[cap][sex] × experience_modifier(≤×1.20) × age_taper`, capped + bias
+ clamp; `PRIOR_CONF 25 < DECISION_CONF_GATE 30`) **conforms to this direction as written** — no rework
needed. The only residual under D1 is *numeric sourcing* of the table values, which is a parameterization
step, not an interpretation question (§3 D1, now non-blocking).

---

## 1. Scope & truthfulness check (PASS)

| Claim under review | Verdict |
|---|---|
| Seed is **primarily bodyweight × sex**, experience a **bounded modifier only** (≤+20%, never the primary axis) | ✅ Exactly the founder constraint and the spec §0 structural mandate; encoded in `estimate_1rm` + `experience_modifier` cap. |
| Goal is a **better first-session estimate, not a new progression system** | ✅ No change to blend/decay/evidence/governor/`kappa`; `PRIOR_CONF = 25 < DECISION_CONF_GATE = 30` keeps the governor **inert at the seed** — progression stays athlete-/corroboration-driven on the unchanged path. |
| Consistent with the advisory Product Spec (athlete owns load; conservative) | ✅ Seed feeds an **advisory** `recommended_weight`; conf-25 safety discount (~0.91) + downward bias + clamp keep day-1 conservative (Product Spec §1/§2/§7). |
| No false "done" — Option D is the *pending* item DX-08 | ✅ This builds it; the DX-13/15 docs already label it pending. |
| Backward-compatible | ✅ Fallback to the 3-bucket seed when bodyweight absent ⇒ **zero golden re-gold** (156/156 preserved). |

**Truthfulness note carried into the build:** Option D **intentionally under-seeds a genuinely advanced
athlete** (the capped uplift cannot reach the old advanced seed of 64). This is the *benign* direction and is
recovered by the existing governor after corroboration — it must be **stated, not hidden**, in the
completion report (as DX-03/M1 stated their behavior changes).

---

## 2. Spec-internal issues resolved here (so the implementer doesn't have to guess)

1. **§2.1 calibration vs §2.3 cap — inconsistent as written.** "Median bodyweight at each declared level
   maps within ±3 of `SEED_SCORE` 30/48/64" cannot hold together with a capped ≤+20% (≈ +11 score)
   experience modifier on a single bodyweight baseline (the level gap is 34 score). **Resolution — APPROVED
   (owner, 2026-06-12; see §0):** the **safety interpretation** is binding — the table is the
   **untrained/beginner baseline**; the §2.1 continuity gate is applied to the **beginner median only**
   (maps within ±3 of 30); intermediate/advanced are the **capped uplift**; a genuine advanced athlete
   under-seeds and recovers via the governor. *Rationale:* it is the reading that makes §0/§3/§5 (the safety
   result) true, and it matches the founder constraint. **This question is closed.**

2. **Illustrative ratios are not a frozen table.** The spec's ratios/clamps are explicitly "fit to a chosen
   public dataset." They are **parameters**, not values this review can rubber-stamp. See decision D1.

3. **The §5 validation harness does not exist in the repo** (`init_spec_sim.py` / `init_spec_output.txt`
   were study artifacts; not in the source tree). Acceptance therefore needs a minimal harness built. See D2.

---

## 3. Decisions required before coding

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | **Interpretation: LOCKED (§0).** Residual = how to *source the numeric* `base_ratio`/`clamp`/`DOWN_BIAS` | (a) Fit to a named public dataset (StrengthLevel/ExRx) under the §2.1 beginner-continuity gate, then **freeze** (`STRENGTH_STANDARD_VERSION="v1"`); (b) Adopt analytically-anchored **PROVISIONAL** values (set `base_ratio` so the median untrained bw maps to 30; mark Phase-0 calibratable like `kappa`/`tau`) | Interpretation **resolved**. For *values*: build on **(b) PROVISIONAL** now (non-blocking for implementation); **(a) fit+freeze gates the live default** along with D2. This is a parameterization step, not an ambiguity. |
| **D2** | Acceptance for the §5 coverage gates (no harness today) | (i) Build a small `sim/seed_validation.py` (reuse `SyntheticAthlete` + real `recommend()`) running the §5 cohorts + the two detrained cells; (ii) Ship with **unit-level** guards only (calibration-continuity + cap + clamp + bias monotonicity) and defer cohort coverage to the Phase-1 A7 week-1 gate | **(i)** — it's the A7 evidence and is cheap; wire its pass/fail as the DX-08 sign-off gate. Fall back to (ii) only if the dataset/D1 slips, and then **do not** make Option D the live default pre-beta. |
| **D3** | Onboarding contract: is `bodyweight_kg` requested/required? | (a) Mobile onboarding **requests** bodyweight (optional, validated) so users actually get Option D; (b) leave nullable, rely on fallback | **(a)** — without it, Option D never fires for real users; keep it *optional with graceful fallback* (Product Spec minimal-profile + data-minimization). This is a **mobile/API** task (BB-16 onboarding mapping), tracked, not in this code slice. |

---

## 4. Blast-radius & invariant audit (PASS)

- **① core math untouched** — Option D only *calls* `score_of` (the frozen inverse); blend, decay,
  confidence saturation, evidence weighting, governor, `kappa` unchanged.
- **No schema / migration** — `bodyweight_kg` exists since DX-07 (schema v9); no new column, no migration.
- **Single onboarding write changes**; the learning loop reads `capability_state` identically.
- **`cohort_multiplier` double-count avoided** — Option D bypasses it (sex/age in the table/taper); fallback
  alone uses it.
- **Fallback = kill-switch** — absent/invalid bodyweight ⇒ exact prior behavior; soft-rollback by not
  sending bodyweight; hard-rollback is code-only, no data migration; already-seeded priors stay valid.

---

## 5. Go / No-Go

**GO — to implement the structure now. D1 interpretation is LOCKED (§0); nothing blocks implementation.**

- **Approved to build immediately:** `strength_standards.py` (structure + **PROVISIONAL** values anchored
  so the median untrained bodyweight maps to ~30), the Option D constants, the `seed_athlete` branch +
  `seed_capability_prior_bw`, and the full additive test set including the **fallback-bit-for-bit** and
  **§2.1 beginner-continuity** guards. Additive, reversible, re-golds nothing (156/156 preserved).
- **Non-blocking for implementation** (gate the **LIVE onboarding default** only — not the build):
  1. **D1 values** — ratios/clamps/`DOWN_BIAS` **fit and frozen** to the chosen dataset under the beginner-
     continuity gate (build proceeds PROVISIONALLY until then).
  2. **D2** — the §5 coverage harness green: ≤5% too-heavy & 0% unliftable across the required cohorts,
     **both detrained cells bodyweight-keyed** ≤5% too-heavy & 0% unliftable.
  3. **D3** — onboarding requests `bodyweight_kg` (mobile/API; BB-16).
- **Not licensed:** any change to the blend/decay/evidence/gate/`kappa`, per-lift/history priors (Option C),
  Class-B activation, or making the seed authorize progression. Out of scope by design.

**Governing-rule status:** this review licenses the bounded onboarding-seed behavior change for bodyweight
users, exactly as DX-08 scopes it. No redesign; the model's equations are unchanged.

---

*Readiness review only. Confirms scope/truthfulness against `HUSH_V1_PRODUCT_SPECIFICATION.md` and the
founder constraint, resolves the §2.1/§2.3 spec inconsistency to the safety interpretation, and gates the
live default on D1/D2/D3. Pairs with `DX-08_EXECUTION_PACKAGE.md`. Trace:
`CAPABILITY_INITIALIZATION_IMPLEMENTATION_SPEC.md`; Delta Plan DX-08; ES-008 v2 (+DX-13 addendum).*
