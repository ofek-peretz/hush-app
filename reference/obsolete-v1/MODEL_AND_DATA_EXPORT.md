# Hush — Complete Engine & Data Export (for external analysis)

> Self-contained description of **everything the Hush training engine does** and **all data
> Hush collects**, extracted directly from the source of truth (`implementation/` — the
> deployable model + API), 2026-06-22. Intended to be handed to an external AI for a thorough,
> adversarial review of whether the model can be materially improved.
>
> Conventions used below: "score" = a latent capability number 0–100 (never shown to the
> athlete). "Class-A" = the five barbell/compound capabilities the V1 model actually runs.
> Time unit everywhere is **weeks** (the loop's clock). Parameters flagged
> **[PROVISIONAL]** have **no external anchor** and are explicitly un-calibrated (a Phase-0
> simulation responsibility) — these are the prime candidates for improvement.

---

## 0. One-paragraph thesis

Hush models each athlete as **five latent "capability" strength scores**. It never stores or
trusts a workout as ground truth; instead every completed set is converted into **evidence**
about the underlying capability, and the capability estimate is a **precision-weighted,
time-decayed, variance-damped running blend** of all evidence. From the capability estimate it
**decodes** an expected 1-rep-max, predicts reps-to-failure at any load (Epley), and
**recommends** a working load. A separate, conservative **governor** decides whether the
program load may move. Fatigue, recovery, evidence conflict, exercise selection, weekly volume,
and stagnation are all layered on top of that single latent state. The product owns load,
progression, volume, frequency, fatigue and forecasts; the **athlete owns exercise selection,
substitutions and order** (the "Program Ownership Contract").

---

## 1. The closed learning loop

Implemented in `orchestrator.run_one_set` (offline harness) and `SessionEngine` /
`SessionRuntime` (live, device-driven). One iteration, per capability slot:

```
recommend ─► (athlete performs the set) ─► observe ─► attribute to evidence ─► update state
```

Detailed live ordering (fatigue-aware path):

1. **Estimate current fatigue** — decay the athlete's stored systemic + per-capability fatigue
   forward to "now" (recovery model).
2. **Recommend** a working load on `observed_capability = score − fatigue` (fatigue auto-softens
   the load; INCREASE is structurally vetoed while fatigued).
3. **Perform** — the athlete logs `actual_weight` and `actual_reps` (the *only* model inputs;
   no RIR, no soreness, no readiness are ever collected).
4. **Re-predict** reps-to-failure at the *actual* lifted load (so the error is measured at what
   was really done, not at what was prescribed).
5. **Observe** → build an immutable `Observation` (stores the fatigue removed, for audit).
6. **Attribute** → de-fatigue the reps in rep-space, convert to capability-space, split across
   mapped capabilities → one immutable `Evidence` row per capability.
7. **Update state** → variance-suppressed precision-weighted blend into the capability score +
   confidence.
8. **Generate + accumulate** the set's fatigue into systemic + capability fatigue.

The loop is **pure** except for the single state-writer (`apply_evidence`). History rows are
append-only and never edited; state rows are a mutable *projection* the recommender reads.

---

## 2. The latent capability model

### 2.1 The five Class-A capabilities
`horizontal_push, horizontal_pull, vertical_push, knee_dominant, hip_dominant`
(bench, row, overhead press, squat, deadlift families).
Two further capabilities — `vertical_pull` (Class-B, needs bodyweight) and `core_stability`
(Class-C, duration-based) — exist in the frozen split templates but are **INACTIVE** in V1
(no live pipeline). All five Class-A capabilities share one growth constant.

### 2.2 Score ↔ strength decoder (`reference_strength.py`)
```
ReferenceStrength_c(S) = A_c · e^(k · S)            # score → reference 1RM (kg)
S_of(RM1)              = ln(RM1 / A_c) / k           # exact closed-form inverse
```
- `k = K_GROWTH = 0.016227` (shared across all Class-A capabilities).
- `A_c` is fitted per capability so that **score 64 reproduces a "trained-intermediate"
  landmark** 1RM:
  `horizontal_push 113kg, horizontal_pull 100kg, vertical_push 68kg, knee_dominant 150kg,
  hip_dominant 180kg` (at score 64). `A_c = landmark / e^(k·64)`.
- Strictly increasing exponential ⇒ the inverse is exact, which keeps recommend and learn
  mathematically consistent (the same number means the same thing both directions).

### 2.3 Epley rep model (`epley.py`) — invertible 3 ways
```
reps_to_failure(L, RM1) = (RM1/L − 1) · 30          # predict
load_for_reps(r, RM1)   = RM1 / (1 + r/30)          # recommend
rm1_from(L, r)          = L · (1 + r/30)             # learn (inverse)
```
`EPLEY_DIVISOR = 30`.

### 2.4 Prediction (`prediction.py`)
```
score ─ReferenceStrength─► RM1_capability ─(× difficulty_factor)─► RM1_exercise ─Epley(load)─► predicted_reps_to_failure
```
Prediction always runs on `score − fatigue` (observed capability), never bare score.

---

## 3. Cold-start seeding (how a brand-new athlete is initialized)

Two paths (`seeding.py`, `strength_standards.py`):

**A. 3-bucket fallback (no bodyweight).** Seed score by self-reported experience:
`beginner 30, intermediate 48, advanced 64`. Then a cohort multiplier is applied **in
reference-strength space** and mapped back to a score:
`m(sex, age) = m_sex · (1 − 0.005·max(0, age−30))`, with `m_male = 1.00, m_female = 0.62`.
Seed confidence = **10** (a floor, regardless of score), corresponding to a nonzero prior
precision `sum_w = −8·ln(0.9) ≈ 0.84` so the seed behaves like a real prior, not something the
first set discards.

**B. Option D — bodyweight-keyed prior (`strength_standards.py`) [PROVISIONAL].** The *intended
primary* seed when a plausible bodyweight (35–250 kg) is given:
```
est_1RM = bodyweight · base_ratio(capability, sex) · experience_modifier · age_taper · (1 − 0.06 down_bias)
          then clamped to a per-capability plausibility band
seed_score = S_of(est_1RM);  seed_confidence = 25 (capped);  sum_w ≈ 2.30
```
- `base_ratio` (male, ×0.62 for female): push 0.75, pull 0.66, vertical_push 0.45,
  knee 1.00, hip 1.20.
- `experience_modifier`: beginner 1.00, intermediate 1.10, advanced 1.20 (capped **upward
  only**, ≤ +20% — experience is never the primary axis; bodyweight×sex is the baseline).
- **Every ratio/clamp here is illustrative/provisional and must be fit & frozen to a public
  strength-standard dataset (StrengthLevel/ExRx-class) before Option D becomes the live default.**
- Seed confidence 25 sits **below** the decision gate (30): the seed informs the *starting load*
  but cannot authorize progression by itself — progression waits for the athlete's own data.

---

## 4. Recommendation engine (`recommendation.py`)

For one capability slot, the **single load formula**:
```
RM1_rested  = ReferenceStrength(score) · difficulty_factor
L_ideal     = load_for_reps(target_reps + RIR, RM1_rested)        # RIR default = 3
target_load = floor_to_plate( L_ideal · safety_discount )         # plate = 2.5 kg, floor (never round up)
safety_discount = 1 − 0.12·(1 − confidence/100)                   # auto-removes as confidence rises
```
- **Rested cold-start:** emit `target_load` directly (KEEP_LOAD, "working_set" seed reason).
- **Rested with decision memory:** the **governor** (§5) computes an advisory lean
  (KEEP/INCREASE/DECREASE) but **does not author the load** — the emitted load is the
  score-derived `target_load` ("future programs are built from *learned capability*, never from
  a frozen historical anchor"). The athlete's logged weight reaches the program *only* through
  evidence → score → target_load, never directly.
- **Fatigued path (reduction order = reps → weight):** HOLD the rested load and lower the target
  reps (least disruptive); only if holding would push below `MIN_EFFECTIVE_REPS = 5` do we reduce
  the weight. INCREASE is structurally impossible here.

---

## 5. Decision hierarchy / governor (`decision.py`, ES-006)

The single live source of truth for *which decision type* and *why* each recommendation carries.
It is an **advisory, safety-first rate-limiter** over the score-derived target load. It never
computes a load from scratch.

Decision types: `KEEP_LOAD` (default), `INCREASE_LOAD`, `DECREASE_LOAD`,
`REPLACE_EXERCISE` (preference-driven, never performance-driven), `CHANGE_STRATEGY`
(signal-only / stagnation).

**Stability guard.** A change requires `STABILITY_N = 3` consecutive *consistent* observations.
Streaks advance on the **sign of the fatigue-adjusted surprise**; `|surprise| < SURPRISE_DEADBAND
(0.5 score units)` is neutral and **breaks** any run.

**govern() branch order (first match wins):**
1. `confidence < DECISION_CONF_GATE (30)` → KEEP (low-confidence hold).
2. consistent positive run ≥ 3 **and** target > held → INCREASE (advisory lean up).
3. consistent negative run ≥ 3 **and** target < held → DECREASE (advisory lean down).
4. otherwise / conflict → KEEP.

---

## 6. Observation → Evidence → State update (the learning core)

### 6.1 Evidence attribution (`evidence.py`, ES-010 Part A)
Done in **load space**, against each capability's own anchor:
```
reps_clean       = defatigue_reps(actual_reps, est_fatigue)        # rep-space, BEFORE conversion
effective_load_c = actual_weight · w_c                              # w_c = contribution weight
RM1_obs_c        = rm1_from(effective_load_c, reps_clean)           # Epley inverse
S_obs_c          = S_of(RM1_obs_c)                                  # capability c's OWN anchor
quality          = (prediction_confidence/100) · error_class_weight(|prediction_error|)
w_i              = decay(age_weeks) · quality · w_c
```
- **Error-class weight:** `|err| ≤ 1 → 1.0` (excellent), `≤ 3 → 0.6` (acceptable),
  `else → 0.3` (poor). A surprising-but-noisy set counts for less.
- **Decay:** `decay(dt) = 0.5^(dt / half_life)`, `half_life ≈ 23.48 weeks` (anchored so
  evidence is ~1.0 at 1 week, ~0.1 at 78 weeks / 18 months).
- One `Evidence` row per (observation, capability); the rep error is never split.

### 6.2 State update (`state_update.py`, the ONLY writer)
Precision-weighted blend:
```
eff_w        = w_i · agreement                                     # agreement ∈ [0,1], §7
sum_w_new    = sum_w_old + eff_w
score_new    = (sum_w_old·score_old + eff_w·S_obs) / sum_w_new
confidence_new = 100·(1 − e^(−sum_w_new / 8)) · agreement,  floored at 10
```
Gradual by construction — a single low-weight set barely moves the score ("single workouts
should not redefine the athlete"). `sum_w` is a materialized precision accumulator (O(1)).

### 6.3 Confidence (`confidence.py`)
`c = 100·(1 − e^(−sum_w/8))·agreement`, floored at the seed value 10. `CONFIDENCE_K = 8`
⇒ ~8 effective observations → ~63% confidence. **Global confidence** = mean of the five Class-A
confidences; `calibration_phase` is TRUE while global confidence < **70**.

---

## 7. Variance / evidence-conflict suppression (`variance.py`, ES-010 Part C)

Fixes a real failure of the naive blend: fed alternating signals (+3 −3 +2 −2 …) the blend
lands near the mean while `sum_w` keeps rising, so confidence would *climb* on a visibly unstable
athlete. One multiplicative term fixes it:
```
σ²_recent  = decay-weighted variance of recent S_obs (O(1) via moments var_w, var_ws, var_ws2)
agreement  = 1 − min(σ²_recent / σ²_ref, 1)                        # ∈ [0,1]
```
`agreement` both **suppresses confidence** (×, §6.3) and **damps the learning rate**
(`eff_w = w_i·agreement`, §6.2). Cold-start guard: below `VARIANCE_MIN_PRECISION = 1.0`
accumulated weight, agreement = 1.0 (no suppression).
- `σ²_ref = SIGMA2_REF = 9.0` (≈ 3-unit SD reference) **[PROVISIONAL]**.

---

## 8. Fatigue & recovery (`fatigue.py`, `recovery.py`, ES-011)

Fatigue is a **non-negative, score-space** quantity (subtracts cleanly from the score):
`observed_capability(t) = true_capability − Fatigue(t)`. Inferred from **time + logged
performance only** — no sleep/readiness/soreness inputs.

**Generation (per set):**
```
rel_load             = effective_load / ReferenceStrength_c(score)
RIR_observed         = max(0, predicted_reps_to_failure − reps_performed)   # reused from the model, never asked
proximity_to_failure = clamp(1 − RIR_observed / RIR_reference, 0, 1)
set_fatigue          = κ · rel_load · reps · proximity · exercise_cost
```
**Accumulation:** systemic gets the full set cost; capability gets its `w_c` share (the *same*
split rule that splits load credit).

**De-fatigue (rep space, exact, before conversion):**
```
reps_clean = 30 · [ (1 + reps_raw/30) · e^(k·F) − 1 ]
```

**Recovery = exponential fatigue decay** (same family as evidence decay):
```
Fatigue(t) = Fatigue(t0) · e^(−(t−t0)/τ)
```
- `κ = KAPPA = 0.05` **[PROVISIONAL]**, `RIR_reference = 5.0` **[PROVISIONAL]**,
  `exercise_cost` default 1.0 **[PROVISIONAL]**.
- `τ_sys = 1.0 week` **[PROVISIONAL]**; `τ_cap`: push/pull 0.6, vertical_push 0.5,
  knee/hip 0.9 weeks (larger muscle = slower) **[PROVISIONAL]**.
- `EFFORT_OFFSET = 0` (effort/fatigue separability is untestable without RIR — fatigue is the
  sole observation correction; every fatigue conclusion is flagged "un-separated").
- **Decision: ship FIXED population τ.** Per-athlete τ learning is the riskiest learning in the
  system and unidentifiable at MVP sample sizes — deliberately NOT implemented.
- `FATIGUE_ELEVATED_SCORE = 2.0` (above this, INCREASE is vetoed) **[PROVISIONAL]**.

> The entire fatigue/variance correction is currently **directional, not calibrated**: none of
> κ, τ, σ²_ref has an external anchor. This is the most explicitly flagged improvement surface.

---

## 9. Session composition (`composition.py`, ES-009) + volume (`volume.py`, ES-009.1)

Answers "which exercises, in what order, this session?" — strictly **load-free** (ES-006 fills
loads afterward). Four non-skippable stages, with volume running between 2 and 3:

1. **Template** — a frozen Class-A split chosen by weekly frequency & session index.
2. **Priority** — order the slots. Calibrating: by descending **info-gain**
   `= staleness(≤2 wks) + (100 − confidence)/100`. Steady-state: focus-aligned first
   (primary, secondary, rest), info-gain as tie-break.
3. **Selection** — one class-matched exercise per slot. Calibrating → the **canonical**
   exercise (cleanest reference). Steady-state → **argmax preference** (tie-break by
   difficulty_factor). Athlete **pins** override everything (Program Ownership, §10).
4. **Ordering** — `CAPABILITY_PRIORITY_ORDER = (knee, hip, h_push, h_pull, v_push)`, then
   athlete-owned order overrides.

**Frozen split templates** (Class-A only; frequency clamped to {2,3,4}):
- freq 2: `[h_push,h_pull,knee]` / `[v_push,hip]`
- freq 3: `[h_push,h_pull,knee]` / `[v_push,hip]` / `[h_push,hip]`
- freq 4: `[h_push,h_pull,v_push]` / `[knee,hip]` / `[h_pull,v_push]` / `[knee,hip]`

**Volume (two levers):** weekly working-sets per capability from the band
(`low 8, moderate 12, high 18`), × focus multiplier (`primary 1.25, secondary 1.00, other
0.75`), ÷ times-trained-per-week, then split into `slots (1–2) × sets-per-slot (2–4)`.
Calibration restraint: a fixed **1 slot × 2 sets** regardless of band (seek information, not
stimulus).
- **Known V1 limitation:** under Class-A-only coverage, once-per-week capabilities collapse
  `times_trained → 1`, so low/moderate/high become indistinguishable for them. Accepted &
  documented, not a defect of the volume math.

**Live fatigue ceiling:** if total working sets exceed `SESSION_FATIGUE_CEILING = 24`
**[PROVISIONAL]**, trim lowest-priority slots (second slots first), never rebuild.

**Exploration floor is DISABLED** in V1 (`P_EXPLORE = 0.0`): a slot deterministically takes its
top-preference exercise. The seeded-RNG plumbing + persisted `exploration_seed` are retained so a
Phase-0 study can re-enable and measure it.

**Goal lever (additive).** The athlete's goal sets the working-rep target; loads follow natively
through the RIR model (fewer reps ⇒ heavier load at the same score). Map:
`get_stronger 5, build_muscle 8, general_fitness 10, toning 12`. Absent/unknown goal ⇒ 8
(byte-for-byte parity with pre-goal athletes). Goal does **not** touch seeding, templates, or
volume bands.

---

## 10. Catalog, preferences & Program Ownership Contract

**Catalog (`catalog.py`, ES-002)** — frozen, code-resident reference data (not in the DB),
version-tied to the capability model version. Class-A only: each capability has a **canonical**
exercise (difficulty_factor 1.0, cost 1.0) + one alternate. Three distinct relations:
`capability` (what a slot trains), `replacement_group` (the interchangeable pool a REPLACE draws
from), `exercise_family` (the unit preferences are scored on).

| capability | canonical (df 1.0) | alternate (df) |
|---|---|---|
| horizontal_push | bench_press | db_bench_press (0.95) |
| horizontal_pull | barbell_row | db_row (0.95) |
| vertical_push | overhead_press | db_shoulder_press (0.90) |
| knee_dominant | back_squat | leg_press (0.85) |
| hip_dominant | deadlift | romanian_deadlift (0.90) |

**Preferences (ES-009 §6).** `preference_score` defaults to 50 (unobserved). On an athlete REPLACE
the chosen family is set **sticky-maximal (100)** and the displaced family demoted to 50, so the
chosen exercise is the durable argmax going forward.

**Program Ownership Contract.** Append-only `preference_event` log is the source of truth; current
prefs are a projection. The **athlete owns exercise selection, substitutions, and order**; a pinned
exercise wins over the model *including during calibration*. The **model owns** load, progression,
volume, frequency, fatigue, forecasts. Athlete responses to program changes (accepted / vetoed /
ignored) are recorded as **data for trust measurement only — never model-altering**.

---

## 11. Stagnation & imbalance detection (`stagnation.py`, M5 / DX-09)

Read-only & advisory — authors no load, changes no score, applies nothing. Runs **weekly** at
program construction (never mid-session). Per capability it classifies a trend over a trailing
4-week window from the *learned score* history:
`PROGRESSING / HOLDING / STALLED / REGRESSING / CALIBRATING`.

- Needs ≥ 6 in-window sessions and confidence ≥ 70 to be "actionable"; 30–70 is "watch" only;
  < 30 → no call.
- A flat must clear a **variance band** `= max(0.25, Z·√σ²_recent)` to count as genuine
  (not noise); **low agreement suppresses** the call.
- **Imbalance:** a capability ≥ 5 score-units below the confident-capabilities median is "lagging".
- Surfacing cadence: at most **one insight + one advisory recommendation + one acceptance-gated
  volume option** per week, with a 4-week anti-repetition cooldown. The *only* program change the
  spec permits is a one-band volume bump (low→moderate→high), applied **only on explicit athlete
  acceptance**.
- Band knobs (Z=1.0, floor=0.25), agreement gate (0.5), median gap (5.0) are **[PROVISIONAL]**.

---

## 12. Offline measurement instruments (`sprint7/`, Phase-0)

Pure, read-only instruments over the frozen model — they **write nothing the athlete sees**;
they exist to measure what the point-prediction hides and to calibrate parameters offline:

- **Monte Carlo predictive distribution** — propagates the model's own uncertainty
  (`sd_post = √(σ²_obs / sum_w)`) into a distribution of outcomes + a hit-probability for a target.
- **Forecast calibration** — reliability table + **Brier score** over (predicted_prob, outcome):
  does "70% chance" actually hit ~70% of the time?
- **Volatility tracking** — reconstructs the model's own recent-variance as a time series + a
  stable/volatile regime label (vs σ²_ref).
- **Counterfactual simulator** — runs the same seeded synthetic athlete under live vs overridden
  parameters with **common random numbers** (paired, noise-differenced) to isolate a parameter's
  causal effect — the harness for calibrating κ/τ/σ²_ref.

There is also a **shadow baseline** (a fixed, non-learning policy) stored beside the model's
recommendation for paired "did learning help?" comparison.

---

## 13. Full constant reference (`constants.py`)

| Constant | Value | Anchored? |
|---|---|---|
| MODEL_VERSION / CAPABILITY_MODEL_VERSION | v1.0.0 / es008v2 | — |
| K_GROWTH (k) | 0.016227 | ✅ ES-008 v2 |
| A_c landmarks @ score 64 (kg) | push 113, pull 100, vpush 68, knee 150, hip 180 | ✅ |
| SEED_SCORE | beginner 30 / intermediate 48 / advanced 64 | ✅ |
| SEED_CONFIDENCE | 10 (floor) | ✅ |
| SEX_MULTIPLIER | male 1.00 / female 0.62 | ✅ (frozen assumption) |
| AGE_TAPER | −0.5%/yr past age 30 | ✅ |
| DECAY_HALF_LIFE | ≈ 23.48 weeks | ✅ |
| CONFIDENCE_K | 8 | ✅ |
| error_class_weight | 1.0 / 0.6 / 0.3 | ✅ |
| SAFETY_DISCOUNT_MAX | 0.12 | ✅ |
| EPLEY_DIVISOR | 30 | ✅ |
| DEFAULT_RIR | 3.0 | ✅ |
| PLATE_INCREMENT_KG | 2.5 | ✅ |
| **Option D seed** PRIOR_CONF / DOWN_BIAS / ratios / clamps | 25 / 0.06 / table | ❌ **[PROVISIONAL]** |
| **KAPPA** (fatigue gen) | 0.05 | ❌ **[PROVISIONAL]** |
| **RIR_REFERENCE** | 5.0 | ❌ **[PROVISIONAL]** |
| **TAU_SYS / TAU_CAP** | 1.0 / 0.5–0.9 wk | ❌ **[PROVISIONAL]** |
| EFFORT_OFFSET | 0.0 | ✅ (MVP decision) |
| FATIGUE_ELEVATED / SURPRISE_REGRESSION | 2.0 / 2.0 | ❌ **[PROVISIONAL]** |
| MIN_EFFECTIVE_REPS | 5 | ❌ **[PROVISIONAL]** |
| **SIGMA2_REF** | 9.0 | ❌ **[PROVISIONAL]** |
| VARIANCE_MIN_PRECISION | 1.0 | infra |
| STABILITY_N | 3 | ✅ (ratified) |
| DECISION_CONF_GATE | 30 | ❌ **[PROVISIONAL]** |
| SURPRISE_DEADBAND | 0.5 | ❌ **[PROVISIONAL]** |
| CALIBRATION_CONFIDENCE_THRESHOLD | 70 | ✅ |
| VOLUME_BAND_SETS | low 8 / moderate 12 / high 18 | structural |
| FOCUS_MULTIPLIERS | 1.25 / 1.00 / 0.75 | structural |
| slots / sets bounds | 1–2 / 2–4 (baseline 3) | structural |
| SESSION_FATIGUE_CEILING / MAX_SESSION_SETS | 24 / 24 | ❌ **[PROVISIONAL]** ceiling |
| P_EXPLORE | 0.0 (disabled) | structural |
| Stagnation: window/min-sessions/conf | 4 wk / 6 / 30,70 | ✅ spec |
| Stagnation band Z / floor / agreement gate / median gap | 1.0 / 0.25 / 0.5 / 5.0 | ❌ **[PROVISIONAL]** |
| GOAL → target reps | stronger 5 / muscle 8 / fitness 10 / toning 12 | structural |

---

## 14. Explicit model limitations & assumptions (read this for the improvement question)

1. **Inputs are radically minimal: only `(actual_weight, actual_reps)` per set.** No RIR, no
   soreness, no sleep/readiness, no velocity, no tempo, no bar-path. By design (Anti-Requirements).
   ⇒ effort and fatigue are **not separable** (`EFFORT_OFFSET = 0`); RIR is *inferred* from the
   model's own prediction, not measured.
2. **All fatigue/recovery/variance parameters are un-calibrated (directional).** κ, τ_sys, τ_cap,
   σ²_ref have no external anchor; calibrating them against trial/simulation data is the single
   biggest stated opportunity.
3. **Option D bodyweight seeding is provisional** and not yet the live default — ratios/clamps
   must be fit to a public dataset under a beginner-continuity gate first. The live default is
   still the coarse 3-bucket experience seed.
4. **Per-athlete recovery (τ) learning is deliberately OFF** — judged unidentifiable at MVP N.
5. **Volume bands collapse** for once-per-week Class-A capabilities (times_trained → 1), so
   low/moderate/high are indistinguishable for them.
6. **Exploration is disabled** (`P_EXPLORE = 0`): selection is fully deterministic top-preference;
   no active arm to learn exercise-level response.
7. **Only 5 capabilities & 10 exercises are live.** Vertical-pull and core are frozen-inactive;
   the catalog is barbell-centric (gym-only V1; home/dumbbell/machine-only out of scope).
8. **Single global growth constant `k`** for all capabilities and all athletes — no per-capability
   or per-athlete growth-rate learning.
9. **The governor is intentionally conservative / advisory** (DX-20): the program load tracks the
   *learned score's* target, gated by confidence ≥ 30 and 3 consistent observations. Progression
   is slow by design ("single workouts should not redefine the athlete").
10. **Stagnation is detection-only**; the only permitted automated change is a one-band volume
    bump on explicit acceptance. No active plateau investigation (ES-013) in V1.

---

## 15. ALL DATA COLLECTED

Single SQLite DB (current schema version v18). Two zones: **immutable append-only history** and
**mutable projection state**, plus infra/research tables. Erasure = **logical anonymization**
(auth + identifiers removed; anonymized history retained — no destructive audit-chain deletion).

### 15.1 Athlete profile & mutable state
- **`athlete`** — `id, sex, age, experience, created_at, bodyweight_kg (nullable), goal (nullable)`.
- **`athlete_state`** — `workout_count, fatigue_systemic, last_workout_at_week, updated_at`.
- **`capability_state`** (per athlete × capability) — `score, confidence, sum_w,
  last_trained_at_week, fatigue, var_w, var_ws, var_ws2` (variance moments),
  `last_recommended_weight, last_decision, consecutive_positive, consecutive_negative,
  last_decision_week`.
- **`strategy_state`** — `weekly_frequency, weekly_volume (enum low|moderate|high),
  primary_focus, secondary_focus`.
- **`preference_state`** (per athlete × exercise_family) — `preference_score` (cache/projection).

### 15.2 Program structure
- **`week_plan`** — a generated week of N workouts: `week_number, status (active|completed),
  weekly_frequency, weekly_volume, primary/secondary_focus, catalog_version, model_version,
  capability_model_version, created_at, completed_at`.
- **`preference_event`** (append-only, source of truth for athlete-owned structure) —
  `event_id, seq, server_ts, action (exercise_replaced|restored|substitute_added/removed|
  backup_defined/removed|exercise_reordered|workout_reordered), capability, slot_key,
  from_exercise, to_exercise, payload (JSON), reason, source, created_at`.

### 15.3 Immutable training history (the ES-001 hierarchy)
- **`workout_session`** — `status (planned|active|completed|abandoned), week, started_at,
  completed_at, name, week_plan_id, position_in_week`, **+ full composition audit snapshot**:
  `exploration_seed, session_index, weekly_frequency, weekly_volume, calibration_phase,
  primary/secondary_focus, catalog_version, model_version, capability_model_version`
  (makes candidate-selection replayable from stored data alone, forever).
- **`exercise_block`** — `capability, exercise, difficulty_factor, position,
  recommended_weight, target_reps, target_sets, status, selection_reason
  (canonical|preference|exploration|second_slot|replacement)`.
- **`set_record`** — `set_number, recommended_weight, target_reps, **actual_weight,
  actual_reps**, status (completed|skipped), completed_at`. *(Both recommended and actual are
  always stored — the ES-001 critical rule.)*
- **`recommendation`** — every emitted recommendation: `capability, exercise, difficulty_factor,
  recommended_weight, target_reps, predicted_reps_to_failure, prediction_confidence,
  decision_reason, est_fatigue_systemic, est_fatigue_capability, decision_type, target_load,
  replaced_from_exercise, replace_reason, model/capability_model_version, created_at`.
- **`observation`** — interpreted set: `capability, exercise, difficulty_factor, actual_weight,
  actual_reps, predicted_reps_to_failure, prediction_error, week`, **override logging**
  (`override_category, override_target`), and an **off-policy calibration sample** (materializes
  decision-time model state beside the outcome): `off_policy, mu_decision (score μ),
  sigma_decision (σ), predicted_reps_prescribed, predicted_success, capability_value (s_obs)`.
- **`evidence`** — `s_obs, quality, weight, source_week, model/capability_model_version`.
- **`state_update_log`** — full before/after of every score move: `prev/new_score,
  prev/new_confidence, prev/new_sum_w, reason, agreement, sigma2_recent,
  est_fatigue_capability, decision_type, model_version`.

### 15.4 Infra / research / instrumentation
- **`session_progress`** — per-(session, capability) decision-memory accumulator (live path).
- **`stagnation_marker`** — anti-repetition memory (what was surfaced, when).
- **`shadow_recommendation`** — the fixed no-learning baseline beside the model (paired eval).
- **`athlete_event`** (append-only research log) — **every athlete/app interaction**:
  `event_id, athlete_id, session_id, type, server_ts, client_ts, client_monotonic, seq,
  app_version, os, device_id, locale, network, data (JSON)`. Dual clocks preserve
  intra-session chronology forever; `data` is a non-sensitive JSON payload.
- **`idempotency_key`** — exactly-once dedup (per-athlete, anti-replay).
- **`auth_token`** — stores only a **hash** of a high-entropy bearer token; server derives
  athlete_id from the token (never trusts a client-supplied id); revocation via `revoked_at`.
- **`erasure_record`** — tombstone proving logical erasure (athlete_id, erased_at, method).
- **`schema_version`** — migration bookkeeping.

### 15.5 Client-side tracked event types (→ `athlete_event.type`)
Lifecycle / auth: `auth_sign_in, signed_in, signed_out, consent_accepted, consent_declined,
consent_record_failed, self_enroll_ok, self_enroll_failed, account_deleted, account_erase_failed`.
Onboarding: `experience_selected, goal_selected, health_skipped, capability_snapshot`.
Training: `session_started, set_completed, session_completed, session_invalidated,
session_recovered, rest_completed, pause, resume, equipment_occupied`.
Program/preferences: `program_viewed, program_day_viewed, exercise_reordered, workout_reordered,
replacement_opened, replacement_accepted, replacement_dismissed`.
Forecasts/trust: `forecast_created, forecast_resolved, threshold_crossed`.
Diagnostics: `crash, request_failed, sync_dropped, preference_sync_failed,
schema_version_mismatch`.

> **Not collected / not a model input:** HealthKit vitals (HR/calories), sleep, soreness,
> readiness, RIR, velocity, location, contacts, or any health data — explicitly excluded by the
> Anti-Requirements. HealthKit, where present, is *not* a model input.

---

## 16. Suggested questions for the external analyzer

1. Is the **single-`k` exponential** ReferenceStrength the right capability→strength law, or would
   a per-capability / per-athlete growth model measurably improve fit?
2. Given **only (weight, reps)**, is **Epley** the best RM model, or would a 2-parameter
   (e.g. fitted load–rep curve per athlete) reduce prediction error materially?
3. How should κ, τ, σ²_ref actually be **calibrated**, and what trial/sim design identifies them?
   Is the score-space additive fatigue model (`observed = true − fatigue`) sound?
4. Is the **precision-weighted blend + agreement damping** the right estimator, or is a proper
   Bayesian/Kalman state-space filter (with process noise = real capability change) better?
5. Is **confidence ≥ 30 + 3-consistent-observations** progression too conservative? What's the
   evidence-optimal trade-off between responsiveness and stability?
6. Does disabling **exploration** (`P_EXPLORE = 0`) leave real learning on the table for
   exercise-level response and τ identification?
7. Are the **volume bands / focus multipliers / templates** defensible, given the documented
   times_trained collapse?

*(End of export. Source: `implementation/sprint0..7`, `implementation/api`, `constants.py`,
`schema.py`. All formulas quoted verbatim from code.)*
