# DX-08_EXECUTION_PACKAGE.md — Option D bodyweight-keyed cold-start seeding

> **Scope:** the implementation delta for **DX-08** (Delta Plan P1, Medium) — replace the flat 3-bucket
> cold-start seed with a **bodyweight × sex–anchored** strength-standard prior, written at onboarding, with
> **experience as a bounded, capped modifier only** and a **fallback to the current 3-bucket seed when
> bodyweight is absent**. Implements `reviews/CAPABILITY_INITIALIZATION_IMPLEMENTATION_SPEC.md` (Option D)
> and the ES-008 v2 §4–5 seed, restated by DX-13. **Goal: a better, safer first-session estimate — not a new
> progression system.** No ① core-math change, no change to the blend / decay / evidence weighting / decision
> governor / `kappa`. Additive on a new input.
>
> **Binding product constraint (Product Specification §1–§3, §7):** Hush is **advisory**; the athlete owns
> load. The seed sets only the *starting* recommended load and the prior the model learns from; it never
> authorizes progression by itself (the conf-25 cap keeps the seed below the decision gate — §3 below).
>
> **Baseline:** Sprint 0–4 ✅ · Wave 1 ✅ · DX-07/04/03 ✅ · M1 ✅ · DX-11 ✅ · DX-09/M5 ✅ · docs aligned
> (DX-13…18) · Schema **v9** · **156/156**. Depends on **DX-07** (✅ — `bodyweight_kg` collected). Date: 2026-06-12.
> Trace: Delta Plan DX-08; `CAPABILITY_INITIALIZATION_IMPLEMENTATION_SPEC.md`; `CAPABILITY_INITIALIZATION_DECISION.md`;
> ES-008 v2 (+ DX-13 addendum); Gap Review (seed/coverage).

---

## 0. Pre-implementation gate (READ FIRST — see `DX-08_READINESS_REVIEW.md`)

Two inputs **must be decided before coding** (the readiness review recommends defaults):

1. **Table values + clamps are not yet frozen.** `base_ratio[capability][sex]`, the per-capability
   `floor`/`ceil`, and `DOWN_BIAS` must be **fit to a chosen public dataset** (StrengthLevel/ExRx-class)
   **subject to the §2.1 continuity constraint**, or adopted as **PROVISIONAL** (Phase-0 calibratable, the
   same discipline as `kappa`/`tau`). This package ships the **structure**; the numbers are parameters.
2. **§2.1 reinterpretation (spec-consistency fix).** As literally written, "median bodyweight at each
   declared level maps within ±3 of `SEED_SCORE` (30/48/64)" is **inconsistent** with the §2.3 capped
   (≤+20% ⇒ +11 score) modifier — a single bodyweight baseline cannot span a 34-score level gap. The
   **binding interpretation is the safety one** (§0/§3/§5 of the spec): the table is the **untrained /
   beginner baseline** (median maps near `SEED_SCORE['beginner']` ≈ 30); intermediate/advanced get the
   **capped** uplift; a genuinely advanced athlete is **intentionally under-seeded** (benign) and recovers
   headroom through the existing decision governor after corroboration. The §2.1 acceptance gate is applied
   to the **beginner/untrained median only**, not all three levels.

The validation harness for the §5 coverage gates (`init_spec_sim.py`) is **not in the repo**; the readiness
review specifies the minimal acceptance set to wire in its place.

---

## 1. The change in one paragraph

At onboarding, when a valid `bodyweight_kg` is present, the seed for each Class-A capability is computed as
`estimate_1RM = bodyweight_kg × base_ratio[cap][sex] × experience_modifier(experience) × age_taper(age)`,
shifted **down** by a conservative `DOWN_BIAS`, **clamped** to a per-capability `[floor, ceil]`, then
inverted with the model's **own** `score_of(cap, 1RM)` (no new math) to a seed score; confidence is written
at the capped `PRIOR_CONF = 25` (⇒ `sum_w ≈ 2.30`) instead of the floor 10. When `bodyweight_kg` is absent
or out of range, seeding **falls back bit-for-bit to the existing 3-bucket `seed_capability_score`**
(confidence 10). `sex` and `age` are encoded in the table/taper, so the existing `cohort_multiplier` is
**bypassed on the Option D path** (no double-count). New: a versioned `hush_model/strength_standards.py`
(table + `estimate_1rm`), additive Option D constants, a new pure `seed_capability_prior_bw` + a branch in
`seed_athlete`, and additive tests. **No schema change** (`bodyweight_kg` exists since DX-07; schema v9).

---

## 2. Source-of-truth note + MAP

`build/_assembled/` is generated — edit `implementation/` only and add the new snapshot to the assembler `MAP`.

| Symbol / change | Source-of-truth file | Assembled dest |
|---|---|---|
| **NEW** strength-standard table + `estimate_1rm` (pure, versioned) | `implementation/sprint0/strength_standards.py` | `hush_model/strength_standards.py` |
| Option D constants (additive) | `implementation/sprint0/constants.py` | mirror |
| `seed_capability_prior_bw` + `seed_athlete` branch + `OPTION_D_PRIOR_SUM_W` | `implementation/sprint0/seeding.py` | `hush_model/seeding.py` |
| Onboarding passes bodyweight (already wired, DX-07) — **no change needed** | `implementation/sprint1/service.py` | mirror |
| DX-08 pure tests (additive) | `implementation/sprint0/test_sprint0.py` | `tests/test_sprint0.py` |
| DX-08 onboard end-to-end + calibration/coverage tests (additive) | `implementation/sprint1/test_sprint1.py` | `tests/test_sprint1.py` |
| assembler MAP entry for `strength_standards.py` | `build/_verify/assemble_and_test.py` | (itself) |

> **Placement (documented):** the table lives in a self-contained `hush_model/strength_standards.py`
> (cohesion + versioning), **not** in `constants.py` (which keeps only the 5 scalar Option D params) and
> **not** in `seeding.py` (which keeps the generator). `domain.py` is untouched (`bodyweight_kg` already on
> `AthleteState` since DX-07).

---

## 3. Exact code changes

### 3.1 `hush_model/strength_standards.py` (NEW, pure / I-O-free)

```python
STRENGTH_STANDARD_VERSION = "v1"          # versioned; bump when ratios/clamps are re-fit

# Untrained ("beginner") 1RM-to-bodyweight ratios, MALE. Female via SEX_MULTIPLIER (single source).
# PROVISIONAL — anchored so the median-bodyweight UNTRAINED athlete maps near SEED_SCORE['beginner'] (§2.1,
# beginner-only). Must be fit/frozen to the chosen dataset before sign-off (see readiness review).
BASE_RATIO_MALE = {            # illustrative starting point from the Option D spec §2.1
    "horizontal_push": 0.75, "horizontal_pull": 0.66, "vertical_push": 0.45,
    "knee_dominant": 1.00,    "hip_dominant": 1.20,
}
# Per-capability plausibility clamp as ratio × bodyweight (floor benign, ceil = hard day-1 safety ceiling).
CLAMP_RATIO_MALE = {          # (floor, ceil); PROVISIONAL — ceil ≈ dataset ~95th-pct ratio
    "horizontal_push": (0.30, 1.33), "horizontal_pull": (0.26, 1.18), "vertical_push": (0.18, 0.80),
    "knee_dominant": (0.40, 1.76),   "hip_dominant": (0.48, 2.12),
}

def base_ratio(capability, sex):            # female = male × SEX_MULTIPLIER (frozen cohort assumption)
    r = BASE_RATIO_MALE[capability]
    return r if sex == "male" else r * SEX_MULTIPLIER["female"]

def clamp_kg(capability, sex, bodyweight_kg):
    lo, hi = CLAMP_RATIO_MALE[capability]
    m = 1.0 if sex == "male" else SEX_MULTIPLIER["female"]
    return lo * m * bodyweight_kg, hi * m * bodyweight_kg

def experience_modifier(experience):        # capped, ≥ 1.0 (never lowers the bodyweight baseline)
    return {"beginner": 1.00, "intermediate": 1.10, "advanced": 1.20}.get(experience, 1.00)

def age_taper(age):                         # reuse the model's shape; applied here, NOT re-applied by model
    return 1.0 - AGE_TAPER_PER_YEAR * max(0, age - AGE_TAPER_START)

def estimate_1rm(capability, sex, bodyweight_kg, age, experience):
    est = bodyweight_kg * base_ratio(capability, sex) * experience_modifier(experience) * age_taper(age)
    est *= (1.0 - OPTION_D_DOWN_BIAS)       # conservative downward bias (dangerous-direction guard)
    lo, hi = clamp_kg(capability, sex, bodyweight_kg)
    return min(max(est, lo), hi)            # per-capability plausibility clamp
```

### 3.2 `constants.py` (ADDITIVE — 5 Option D scalars, all PROVISIONAL)

```python
# --- DX-08 Option D seeding (PROVISIONAL — Phase-0 calibratable; bodyweight-keyed prior) ---
PRIOR_CONF: float        = 25.0   # capped seed confidence for a bodyweight prior (vs SEED_CONFIDENCE 10)
OPTION_D_DOWN_BIAS: float = 0.06  # fractional downward shift on the 1RM estimate (~0.4 residual-SD, PROVISIONAL)
BODYWEIGHT_MIN_KG: float = 35.0   # validation range; out-of-range -> 3-bucket fallback
BODYWEIGHT_MAX_KG: float = 250.0
SEED_AGE_MIN: int        = 14     # age clamp for the taper
```
`PRIOR_CONF = 25 < DECISION_CONF_GATE = 30` — the seed informs the *starting load* but the governor stays
inert until the athlete's own data lifts confidence past 30 (corroboration-gated progression, spec §3.3).
The experience cap (≤+20%) is the only self-report lever and is bounded by design.

### 3.3 `seeding.py` (ADDITIVE branch + new pure function; fallback unchanged)

```python
OPTION_D_PRIOR_SUM_W: float = -CONFIDENCE_K * math.log(1.0 - PRIOR_CONF / 100.0)   # 2.301 at conf 25

def _bodyweight_valid(bw):
    return bw is not None and BODYWEIGHT_MIN_KG <= bw <= BODYWEIGHT_MAX_KG

def seed_capability_prior_bw(capability, sex, bodyweight_kg, age, experience):
    """Option D prior: bodyweight×sex baseline -> 1RM -> model's own score_of -> (score, conf 25, sum_w)."""
    rm1 = estimate_1rm(capability, sex, bodyweight_kg, max(age, SEED_AGE_MIN), experience)
    return score_of(capability, rm1), PRIOR_CONF, OPTION_D_PRIOR_SUM_W

def seed_athlete(athlete_id, sex, age, experience, bodyweight_kg=None):
    use_d = _bodyweight_valid(bodyweight_kg)
    caps = {}
    for c in CLASS_A_CAPABILITIES:
        if use_d:
            score, conf, sumw = seed_capability_prior_bw(c, sex, bodyweight_kg, age, experience)
        else:                                   # FALLBACK — bit-for-bit the current 3-bucket seed
            score, conf, sumw = seed_capability_score(c, experience, sex, age), SEED_CONFIDENCE, SEED_PRIOR_SUM_W
        caps[c] = CapabilityState(capability=c, score=score, confidence=conf, sum_w=sumw)
    return AthleteState(athlete_id=athlete_id, sex=sex, age=age,
                        experience=experience, capabilities=caps, bodyweight_kg=bodyweight_kg)
```
`seed_capability_score`, `SEED_PRIOR_SUM_W`, `SEED_CONFIDENCE`, and `cohort_multiplier` are **untouched**
(the fallback). The Option D path **does not** call `cohort_multiplier` (sex/age already in the table/taper).

### 3.4 `service.py` / `domain.py` — NO change
`onboard(..., bodyweight_kg=None)` already forwards to `seed_athlete` (DX-07); `AthleteState.bodyweight_kg`
already exists. (The mobile/API onboarding should *request* `bodyweight_kg` so users actually get Option D —
a contract note in the readiness review, not code here.)

---

## 4. Data flow

```
onboarding inputs (sex, age, experience, bodyweight_kg?)            [Product Spec §3 step 1]
        │
   service.onboard ──► seeding.seed_athlete
        │                   │
        │      bodyweight valid?  ── no ──►  seed_capability_score (3-bucket × cohort_multiplier)  ► (score, conf 10, sum_w 0.843)
        │                   │ yes
        │                   ▼
        │      strength_standards.estimate_1rm
        │        = bw × base_ratio[cap][sex] × exp_mod(≤×1.2) × age_taper
        │          × (1 − DOWN_BIAS)            ► clamp[floor,ceil]
        │                   │
        │            score_of(cap, 1RM)          (model's exact inverse — no new math)
        │                   ▼
        │            (score, conf 25, sum_w 2.30)
        ▼
   StateRepository.create_athlete  ──►  capability_state rows (score, confidence, sum_w)
        │
        ▼   first session: recommend() uses score → target_load (advisory; safety_discount(25)≈0.91)
            learning: athlete's logged actual_weight blends in; conf climbs; at conf>30 the governor's
            advisory progression unlocks (corroboration-gated). Prior fraction: 94%→~58% by workout 8 (spec §4).
```
Only the **onboarding write** changes (for bodyweight users). The recommend/learn/govern paths are
**unchanged** — they consume `capability_state` exactly as before.

---

## 5. Test impact (all ADDITIVE — net-new; no re-gold)

New pure tests (`test_sprint0.py`):
- `test_option_d_seeds_from_bodyweight_sex` — heavier bodyweight ⇒ higher seed 1RM/score; female < male at equal bw (via `SEX_MULTIPLIER`).
- `test_option_d_confidence_and_sum_w_capped` — bodyweight path ⇒ `confidence == 25`, `sum_w ≈ 2.301`, and `25 < DECISION_CONF_GATE` (governor inert at seed).
- `test_option_d_experience_modifier_is_capped` — advanced ≤ ×1.20 over the bodyweight baseline; a *detrained* "advanced" lands near their bodyweight norm (over-claim bounded).
- `test_option_d_downbias_and_clamp` — estimate ≤ pre-bias estimate; result within `[floor,ceil]` for extreme bodyweights; no elite load from a table/input error.
- `test_option_d_uses_model_inverse` — `score_of(cap, estimate_1rm(...))` round-trips (no new math; uses the frozen inverse).
- **`test_option_d_calibration_continuity` (the §2.1 acceptance gate, beginner-only)** — for the chosen median bodyweight per sex, an **untrained/beginner** athlete maps within **±3 score** of `SEED_SCORE['beginner']` (continuity with the frozen anchors; the binding §2.1 reinterpretation per §0).
- **`test_fallback_is_bit_for_bit_3bucket`** — `seed_athlete(no bodyweight)` equals the pre-DX-08 path exactly (conf 10, `SEED_PRIOR_SUM_W`).

New onboard end-to-end (`test_sprint1.py`):
- `test_onboard_with_bodyweight_writes_option_d_prior` — `onboard(..., bodyweight_kg=…)` persists conf-25, bodyweight-derived `capability_state`; first `recommend()` is liftable (no unsafe day-1 load).
- `test_onboard_without_bodyweight_unchanged` — existing no-bodyweight onboarding rows identical to baseline.

**Existing 156 tests:** **unchanged and green.** Every existing `seed_athlete(...)` / `svc.onboard(...)`
call passes **no** `bodyweight_kg` ⇒ the fallback path ⇒ bit-for-bit identical (verified target — see Golden
impact). `test_cohort_multiplier`, `test_seed_*`, the convergence/stability goldens all sit on the fallback.

---

## 6. Golden impact

**Zero re-gold.** Unlike DX-03/M1, DX-08 is **additive on a new input**: the new behavior only fires when
`bodyweight_kg` is supplied, and **no existing test supplies it**. The fallback branch preserves
`seed_capability_score` / `SEED_CONFIDENCE` / `SEED_PRIOR_SUM_W` exactly, so every seed-, cohort-,
convergence-, and stability-golden assertion is **bit-for-bit unchanged**. The only moving numbers are in
the **new** Option D tests. (Acceptance check: run the suite before merge — it must read **156/156** with the
new tests **added**, no prior count or value changed.)

**Caveat (honest):** the Option D *coverage* claims (≤5% too-heavy, 0% unliftable across cohorts; spec §5)
are **acceptance gates on the fitted table**, not golden values — they depend on the frozen ratios/clamps
and must pass the validation harness (readiness review) before Option D is wired live in onboarding.

---

## 7. Rollback strategy (code-only; no data migration)

- Delete `implementation/sprint0/strength_standards.py` + its MAP entry; remove the `seed_athlete`
  Option D branch (revert to the single `seed_capability_score` body) and `seed_capability_prior_bw` /
  `OPTION_D_PRIOR_SUM_W`; remove the 5 Option D constants; drop the new tests.
- **No schema or data migration** — `bodyweight_kg` (DX-07) stays; it simply goes unused by seeding again.
- Already-onboarded Option D athletes keep their conf-25 priors (valid `capability_state` rows); the loop
  treats them like any other prior — **the learned state is never corrupted** because Option D only writes a
  legal `(score, confidence, sum_w)` at onboarding and touches nothing afterward.
- **Soft rollback without a code revert:** stop sending `bodyweight_kg` from onboarding ⇒ all new athletes
  silently take the 3-bucket fallback. (The fallback is the kill-switch.)

---

## 8. Acceptance criteria

- [ ] `strength_standards.py` added (versioned `STRENGTH_STANDARD_VERSION`): `base_ratio`/`clamp`/
      `experience_modifier`/`age_taper`/`estimate_1rm`; female via `SEX_MULTIPLIER`; pure / I-O-free.
- [ ] 5 Option D constants added, **all marked PROVISIONAL**; `PRIOR_CONF = 25 < DECISION_CONF_GATE`.
- [ ] `seed_athlete` branches on a **validated** `bodyweight_kg`; Option D writes `(score, 25, 2.30)`,
      bypassing `cohort_multiplier`; **fallback path byte-for-byte unchanged**.
- [ ] Bodyweight-primary, experience **capped ≤+20%**, downward bias + per-capability clamp all present
      (the four day-1 over-estimation guards, spec §3.1).
- [ ] **§2.1 continuity gate (beginner median ±3 of 30)** passes for the chosen median bodyweight per sex.
- [ ] **§5 coverage gates** (≤5% too-heavy, 0% unliftable across the required cohorts; both detrained cells
      bodyweight-keyed ≤5% too-heavy/0% unliftable) pass on the **fitted, frozen** table via the validation
      harness (or are explicitly deferred-with-PROVISIONAL-table per the readiness decision).
- [ ] Existing **156/156 unchanged**; new Option D + fallback tests green; `assemble_and_test.py` green;
      per-suite counts reported.
- [ ] ① core math, blend, decay, evidence weighting, decision governor, `kappa` **untouched**; no schema
      change; no progression-system change (governor inert at the seed).

---

## 9. Risk assessment

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| **Unfitted table emits an unsafe day-1 load** for a bodyweight user (dangerous direction) | High | Med (until fitted) | Bodyweight-keying (structural, 98.7%→3.3% per spec §5) + capped exp (≤+20%) + `DOWN_BIAS` + per-cap `ceil` clamp + conf-25 safety discount (≈0.91); **gate Option D live behind the §5 acceptance harness** (don't ship the live default on a PROVISIONAL table) |
| Genuine advanced under-seeded (benign direction) | Low | High (by design) | Intended; the governor recovers headroom after corroboration (conf>30); under-load = an easy early session, athlete owns load |
| §2.1 literal vs §2.3 cap inconsistency mis-implemented | Med | Med | Resolved in §0: adopt the **safety interpretation** (beginner-baseline table; §2.1 gate on beginner median only); documented + unit-tested |
| Double-counting sex/age (table **and** `cohort_multiplier`) | Med | Low | Option D **bypasses** `cohort_multiplier`; fallback alone uses it; covered by the calibration test |
| Regression in existing seeded trajectories | High | **Very low** | Additive-on-new-input; fallback bit-for-bit; 156/156 is the backstop (zero re-gold) |
| Validation harness absent ⇒ acceptance unverifiable | Med | High (today) | Readiness review specifies the minimal harness/gates to build before sign-off |

**Net:** lower-blast-radius than DX-03/M1 (no re-gold, no schema, governor untouched). The real work is
**parameter discipline** — fitting + validating the table — not plumbing. Reversible via the fallback.

---

## 10. Dependencies, ordering

- **Upstream:** DX-07 (✅ — `bodyweight_kg` field + onboard signature + profile contract). No other dep.
- **Downstream (NOT here):** DX-10 (sticky preference), DX-12 (instrument repoint). Class-B `vertical_pull`
  activation (post-v1) consumes the same bodyweight input but is **out of scope**.
- **Recommended order (this session's reassessment):** DX-08 → DX-10 → DX-12. DX-08 first because it is the
  A7 week-1 seed-safety gate.

---

*Execution package only — implements Option D within DX-08's bounded scope. No ① core-math change, no
schema change, no progression-system change; governor inert at the seed; fallback preserves all prior
behavior. Gated by `DX-08_READINESS_REVIEW.md`. Trace: `CAPABILITY_INITIALIZATION_IMPLEMENTATION_SPEC.md`;
Delta Plan DX-08; ES-008 v2 (+DX-13); Product Specification §1–§3/§7.*
