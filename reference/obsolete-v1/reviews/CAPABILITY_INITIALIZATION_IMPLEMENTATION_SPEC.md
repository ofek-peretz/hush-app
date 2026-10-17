# Capability Initialization — Implementation Specification (Option D)

> **════ SUPERSEDED-FRAMING NOTE — DX-17 (2026-06-12) ════**
> Implementation spec for **Option D seeding = DX-08**, which is **SPECIFIED but NOT YET IMPLEMENTED** —
> the canonical build reference for that pending work. As-built today: the cold start uses the 3-bucket
> seed; `bodyweight_kg` is collected (DX-07) but not yet keyed into a strength-standard prior. Read
> load-prediction success framing against the v1 pivot — Hush is **advisory**; success = honest
> capability tracking + **stagnation detection (M5/DX-09)**. See `HUSH_V1_DELTA_EXECUTION_PLAN.md` (DX-08).

**Type:** implementation-ready specification — design only, no code, no model change.
**Date:** 2026-06-11 · **Model:** Hush v1 (frozen) · **Target:** V1 beta.
**Status:** specifies the onboarding-time *prior generator*. It writes `capability_state`
(score, confidence, `sum_w`) at onboarding using the model's **own** `score_of` inverse.
It does **not** modify any frozen constant, the learning loop, the decision governor, or
`kappa`. Everything below is a contract and a parameterization, not an instruction to build.

**Evidence basis (reproducible, frozen model, real `recommend()`/`SessionEngine`):**
`build/_assembled/init_spec_sim.py` → `init_spec_output.txt` (learning dominance, coverage);
prior studies `CAPABILITY_INITIALIZATION_REVIEW.md` and `..._DECISION.md`.

---

## 0. Scope and the one structural decision the evidence forces

Option D replaces the flat 3-bucket seed score (and its fixed confidence 10) with a
**bodyweight-anchored strength-standard estimate per Class-A capability**, written at
onboarding. The single most important design decision, forced by the coverage evidence
(§5), is:

> **The strength-standard table MUST be keyed primarily on bodyweight × sex, with
> self-declared experience as a *bounded, capped* modifier — never as the primary axis.**

Rationale (Part 2): a table keyed on self-declared experience prescribes day-1 loads
**above the true 1RM for 72 % of detrained "advanced" users** (98.7 % too-heavy). The same
table keyed on bodyweight reduces that to **3.3 % too-heavy, 0 % unliftable**. Because the
learning blend is slow to overwrite a wrong prior (§4), this hazard cannot be corrected
after the fact — it must be prevented at initialization.

---

## 1. Onboarding inputs

The model's strength-score space is decoded by `reference_strength_c(S) = A_c·e^(k·S)` with
`k = 0.016227` and (derived from the frozen landmarks)
`A_c = {horizontal_push 40.0, horizontal_pull 35.4, vertical_push 24.1, knee_dominant 53.1,
hip_dominant 63.7}`. The prior generator emits a per-capability 1RM estimate and inverts it
with the model's exact `score_of(cap, rm1) = ln(rm1/A_c)/k`.

| Field | Currently collected? | D status | Use |
|---|---|---|---|
| `sex` (`male`/`female`) | yes (`onboard`) | **mandatory** | selects the sex ratio row (primary) |
| `bodyweight_kg` | **no — new field** | **mandatory** | primary table axis; `1RM = bw × ratio` |
| `age` (years) | yes | **mandatory** | age taper on the estimate (encoded in the table) |
| `experience` (beg/int/adv) | yes | **optional / advisory** | *capped* upward modifier only (§2.3) |

- **Mandatory for D:** `sex`, `bodyweight_kg`, `age`. If `bodyweight_kg` is absent or fails
  validation, the generator **falls back to the current 3-bucket seed** (no regression).
- **Optional:** `experience`. It may only *raise* the bodyweight baseline within a hard cap
  (§2.3) and is treated with extra downward caution for the `advanced` claim. A user who
  skips it is initialized from bodyweight × sex × age alone.
- **Validation:** `bodyweight_kg` clamped to a plausible human range (e.g. 35–250 kg) before
  use; out-of-range → fallback. `age` clamped ≥ 14.

No other onboarding inputs are consumed. No per-lift history is required (that is the
deferred Option C fast-follow).

---

## 2. Prior generation flow

Pure function, run once at onboarding, per Class-A capability `c`:

```
estimate_1RM_c  =  bodyweight_kg
                 × base_ratio[c][sex]                 # (2.1) bodyweight-anchored baseline
                 × experience_modifier(experience)    # (2.3) capped, ≥1.0
                 × age_taper(age)                      # (2.2)
seed_1RM_c      =  estimate_1RM_c × (1 − DOWN_BIAS)    # (3.1) conservative downward bias
seed_1RM_c      =  clamp(seed_1RM_c, floor_c, ceil_c) # (3.2) plausibility clamp
S_seed_c        =  score_of(c, seed_1RM_c)            # model's exact inverse — no new math
confidence      =  PRIOR_CONF (= 25)                  # (2.4) capped
sum_w           =  −K·ln(1 − PRIOR_CONF/100) = 2.30   # precision implied by the cap
```

The result is written to `capability_state(score=S_seed_c, confidence=25, sum_w=2.30)` in
place of the values `seed_athlete()` would have written. **The existing
`cohort_multiplier(sex, age)` path is bypassed for D users** — sex and age are already in
the table (2.1/2.2), so routing through `seed_athlete`'s multiplier would double-count.

### 2.1 Table structure (`base_ratio[capability][sex]`)

A static, versioned data table of **untrained-baseline 1RM-to-bodyweight ratios**, one value
per (Class-A capability × sex). It is the *primary* estimator. Illustrative values, anchored
so that the population-median athlete maps — through `score_of` — back onto the existing seed
scores (preserving continuity with the frozen anchors); the real numbers are fit to the
chosen public dataset (StrengthLevel/ExRx-class):

| capability | male base ×BW | female base ×BW | (advanced cap, male, ref.) |
|---|---:|---:|---:|
| horizontal_push (bench) | ~0.75 | ~0.47 | ≤ ~1.33 |
| horizontal_pull (row) | ~0.66 | ~0.41 | ≤ ~1.18 |
| vertical_push (OHP) | ~0.45 | ~0.28 | ≤ ~0.80 |
| knee_dominant (squat) | ~1.00 | ~0.62 | ≤ ~1.76 |
| hip_dominant (hinge) | ~1.20 | ~0.74 | ≤ ~2.12 |

- Female ratios = male × the model's existing `SEX_MULTIPLIER` (0.62), keeping D consistent
  with the frozen cohort assumption; they may be refined to a sex-specific dataset later.
- **Calibration constraint (acceptance test):** for the dataset's median bodyweight at each
  declared level, `score_of(c, bw × base_ratio × exp_mod × age_taper)` must land within ±3
  score of the existing `SEED_SCORE` (30/48/64). This guarantees D never drifts the
  population off the frozen landmarks; it only *spreads* athletes around them by bodyweight.

### 2.2 Age taper (`age_taper(age)`)

Reuse the model's shape: `1 − 0.005·max(0, age − 30)` (the existing `AGE_TAPER_PER_YEAR`
past 30). Applied inside the table so it is **not** re-applied by the model.

### 2.3 Experience modifier (`experience_modifier`) — capped

`experience` may only *raise* the bodyweight baseline, within a hard cap:

| experience | modifier | cap rationale |
|---|---|---|
| (omitted) / beginner | ×1.00 | baseline = untrained-for-bodyweight |
| intermediate | ×1.10 | modest, corroboration-gated |
| advanced | ×1.20 (**hard cap**) | bounded so a *detrained* "advanced" cannot be lifted to elite estimate |

The cap (≤ +20 %) is the safety lever proven in §5: it keeps a detrained over-claimer's
estimate near their bodyweight norm. A genuinely advanced lifter recovers the remaining
headroom through the decision governor (the gate opens after corroboration, §3.3), not
through an aggressive seed.

### 2.4 Uncertainty representation

Uncertainty is the seed **confidence / precision**, capped at **`PRIOR_CONF = 25`**
(`sum_w = 2.30`). This single number encodes "how much to trust the prior." It is below the
current per-source accuracy would allow on purpose (§3.3). If a capability cannot be
estimated (missing input) it retains the conf-10 fallback seed.

---

## 3. Day-1 safety protections

### 3.1 Prevent severe OVER-estimation (the dangerous direction)
1. **Bodyweight-keyed table (§0/§5)** — the structural protection: collapses the detrained
   over-estimation from 98.7 %→3.3 % too-heavy.
2. **Capped experience modifier (≤ +20 %, §2.3)** — bounds the only self-report lever.
3. **Conservative downward bias `DOWN_BIAS`** — shift the estimate down by ~0.4 residual SD
   (~2.5 score) so residual error lands on the light side.
4. **Upper clamp `ceil_c`** — hard ceiling per capability (e.g. the dataset's ~95th-percentile
   ratio × bodyweight) so no table/input error can emit an elite load.
5. **Model safety discount (existing)** — at `conf 25` the recommendation already multiplies
   the target load by `safety_discount(25) ≈ 0.91`, a further automatic under-load.

Combined day-1 result across all normally-classified subgroups: **≤ 3 % too-heavy, 0 %
unliftable** (§5).

### 3.2 Prevent severe UNDER-estimation (the benign direction)
1. **Lower clamp `floor_c`** — a per-capability floor so the seed is never absurdly light.
2. **Prompt gate opening** — `sum_w 2.30` sits just below the decision gate (`2.85`), so a
   genuinely strong athlete's load begins ratcheting up after only ~3–4 corroborating
   workouts (~1.5–2 weeks; `DECISION` study Part B), instead of the ~7–8 months the flat
   seed produced. Under-estimation self-corrects upward quickly and safely.
Under-loading is benign (an easy early session), so protections here are intentionally lighter
than §3.1.

### 3.3 How confidence interacts with the prior (why the cap is 25, not higher)
Seed confidence does three things at once; `25` is the value that balances them:
- **Safety discount:** higher confidence → smaller discount → heavier day-1 load. `25`
  keeps a ~9 % automatic discount.
- **Prior stiffness:** confidence sets `sum_w`; higher → the prior resists correction
  (Part C of the review: a stiff *wrong* prior is unsafe and durable). `25` keeps the prior
  dislodgeable (§4).
- **Gate corroboration:** `conf 25 → sum_w 2.30 < gate 2.85`. **The prior informs the
  starting load but does not by itself authorize progression** — the governor waits for the
  athlete's own data to cross the gate. A higher cap (e.g. 35, `sum_w 4.78`) would open the
  gate immediately on the *unconfirmed* prior. Requiring corroboration is the point of `25`.

---

## 4. Learning dominance (prior vs observed authority)

Exact, from the precision-weighted blend (`prior_fraction = seed_sum_w / current_sum_w`),
measured on the real pipeline for a `conf 25` seed (`init_spec_sim.py` Part 1):

| After workout… | `sum_w` | **prior influence** | **observed influence** |
|---|---:|---:|---:|
| 1 | 2.45 | 94 % | 6 % |
| 2 | 2.61 | 88 % | 12 % |
| 3 | 2.78 | 83 % | 17 % |
| 5 | 3.15 | 73 % | 27 % |
| 8 | 3.94 | 58 % | 42 % |

Observed performance reaches parity at ~workout 8–9 and majority shortly after. **This is
deliberately characterized, not hidden:** evidence accrues slowly at cold start (large early
rep-surprises fall in the model's lowest evidence-quality class) — a property of the *frozen
blend*, identical for any seed, and **out of scope to change here** (it belongs with the
Phase-0 `kappa`/evidence-weighting work).

The spec's resolution of the "observed data must rapidly become authoritative" requirement:
- For an **accurate** prior (D's design intent), slow overwrite is invisible — the prior and
  the athlete's data agree, so the emitted load is correct from day 1 and stays correct.
- Authority that matters for **safety** — the right to *raise* load — is gated on
  corroboration by ~workout 3–4 (§3.3), i.e. progression is athlete-driven within ~2 weeks
  even while the score estimate is still prior-weighted.
- Authority against a **wrong** prior is provided up front by §3.1 (bodyweight-keying +
  bias + clamp), **not** by fast overwrite — because the blend cannot deliver fast overwrite.
This is the central safety logic: *make the start accurate, because correction is slow.*

---

## 5. Coverage validation

Day-1 from real `recommend()`, N = 300/group, `conf 25`, residual SD 6.2 score, downward
bias 0.4 SD (`init_spec_output.txt`). Sex multiplier and age taper are encoded in the table,
so each normally-classified subgroup reduces to the same residual — confirmed uniform:

| Subgroup | too-heavy | acceptable | median \|err%\| | unliftable |
|---|---:|---:|---:|---:|
| M young beginner | 2.7 % | 27.7 % | 12.5 % | 0 % |
| M middle intermediate | 1.7 % | 30.3 % | 13.0 % | 0 % |
| M older advanced | 0.7 % | 35.7 % | 12.1 % | 0 % |
| F young intermediate | 1.7 % | 30.7 % | 13.8 % | 0 % |
| F middle beginner | 0.7 % | 31.3 % | 12.5 % | 0 % |
| F older intermediate | 3.0 % | 29.7 % | 13.6 % | 0 % |

→ **Pass** across male/female, young/middle/older, beginner/intermediate/advanced:
≤ 3 % too-heavy, 0 % unliftable, uniform median error ~12–14 % (the residual safety-discount
under-load, the benign direction).

**Detrained athletes** (declared HIGH, true LOW) — the over-estimation stress test, shown
under both table keyings to justify §0:

| Detrained case | table keyed on | too-heavy | unliftable | correct → safe |
|---|---|---:|---:|---:|
| adv→beg (Δ−34) | **experience** | 98.7 % | 71.7 % | > 10 weeks |
| adv→beg (Δ−34) | **bodyweight** | **3.3 %** | **0 %** | day-1 safe |
| int→beg (Δ−18) | **experience** | 74.0 % | 9.3 % | 4.3 weeks |
| int→beg (Δ−18) | **bodyweight** | **2.3 %** | **0 %** | day-1 safe |

→ **Pass only under bodyweight-keying.** This is the empirical mandate for §0/§2.1/§2.3 and
the reason experience is capped and advisory. Under experience-keying the hazard persists for
weeks because the blend (§4) cannot quickly undo it.

**Validation gates to re-run before sign-off** (same harness): (a) all normally-classified
cells ≤ 5 % too-heavy and 0 % unliftable; (b) both detrained cells, bodyweight-keyed, ≤ 5 %
too-heavy and 0 % unliftable; (c) §2.1 calibration constraint (median maps within ±3 score of
30/48/64); (d) `DECISION` Part B gate-open median ≤ 3 weeks.

---

## 6. Adoption recommendation

> **Yes — adopt Option D before beta.** It is the only evaluated option that fixes the
> originating convergence finding while *improving* day-1 safety, it is uniform across every
> required cohort, and (with the §2.1 calibration constraint) it cannot drift the population
> off the frozen anchors. The residual risks (over-estimation, detrained) are fully contained
> by the bodyweight-keying + cap + bias + clamp protections, all validated in §5.

### Minimal implementation required (the V1-beta slice)
1. **One new onboarding field:** `bodyweight_kg` (mandatory; validated range; fallback to the
   3-bucket seed on absence).
2. **One static, versioned data table:** `base_ratio[capability][sex]` (§2.1), fit to a chosen
   public strength-standard dataset subject to the §2.1 calibration constraint.
3. **One pure prior-generator** (§2 flow) invoked at onboarding *in place of* the flat seed
   score/confidence: emits per-capability `(score, confidence = 25, sum_w = 2.30)` via the
   existing `score_of`. Bypasses `cohort_multiplier` (already in the table).
4. **Five fixed parameters:** `PRIOR_CONF = 25`, `DOWN_BIAS ≈ 0.4 SD`, experience cap `≤ +20 %`,
   per-capability `floor_c`/`ceil_c`.
5. **The §5 validation gates** wired as a pre-beta acceptance check.

### Explicitly NOT in this slice (and why)
- Training-history / per-lift priors (Option C fast-follow) — defer until real onboarding data
  exists to calibrate coverage and the fusion rule.
- Any change to the blend, decay, evidence weighting, decision gate, or `kappa` — out of scope;
  the slow learning-dominance in §4 and the +5–6 score steady-state bias are Phase-0
  calibration items, neither caused nor fixed by initialization.
- Collaborative / fitted priors — rejected (overfitting; no beta-scale data).

### Residual limitations (carried forward)
Constant-truth synthetic athletes; within-bucket true SD 12 and residual SD 6.2 are
conservative modeling assumptions, not Hush-measured — the **orderings and the bodyweight-vs-
experience conclusion are robust**; exact percentages are indicative. The table's real ratios
and the floor/ceil clamps must be fit and frozen against the chosen dataset before beta, and
re-validated through the §5 gates.
