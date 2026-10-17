# DX-08_COMPLETION_REPORT.md — Option D bodyweight-keyed cold-start seeding

> Completion report for **DX-08** (Delta Plan P1, Medium — **Option D strength-standard prior**), executed
> per `reviews/implementation/DX-08_EXECUTION_PACKAGE.md` and gated by `DX-08_READINESS_REVIEW.md` (GO; D1
> interpretation LOCKED), implementing `reviews/CAPABILITY_INITIALIZATION_IMPLEMENTATION_SPEC.md` (Option D)
> and the `..._DECISION.md` recommendation. **DX-08 is complete.** Tests: **165/165 passing** (was
> **156/156**; **+9 net-new** — 7 in `test_sprint0`, 2 in `test_sprint1`; **zero re-gold**). The cold-start
> seed for a bodyweight user is now a **bodyweight × sex strength-standard prior** (experience a bounded,
> capped ≤ +20% modifier), written at onboarding via the model's **own** `score_of`; absent/invalid
> bodyweight falls back **bit-for-bit** to the 3-bucket seed. **No ① core-math change** — blend, decay,
> evidence weighting, decision governor, and `kappa` are untouched; **no schema change** (`bodyweight_kg`
> exists since DX-07, Schema v9). The seed informs only the *starting* advisory load and the prior the model
> learns from; `PRIOR_CONF = 25 < DECISION_CONF_GATE = 30` keeps the governor **inert at the seed**.
>
> Date: 2026-06-12 · Build: Sprint 0–4 ✅ + Wave 1 ✅ + DX-07/04/03 ✅ + M1 ✅ + DX-11 ✅ + DX-09 ✅ +
> DX-13…18 ✅ + **DX-08 ✅** (Schema **v9**, unchanged) · Owner: Model/Backend.

---

## 0. Executive summary

| Item | Class | Status | Evidence |
|---|---|---|---|
| **`hush_model/strength_standards.py`** | Pure table + estimator (new) | ✅ Done | `base_ratio`/`clamp_kg`/`experience_modifier`/`age_taper`/`estimate_1rm`; female via `SEX_MULTIPLIER`; versioned `STRENGTH_STANDARD_VERSION="v1-PROVISIONAL"`; I-O-free |
| **5 Option D constants** | Additive scalars (PROVISIONAL) | ✅ Done | `PRIOR_CONF=25`, `OPTION_D_DOWN_BIAS=0.06`, `BODYWEIGHT_MIN/MAX_KG=35/250`, `SEED_AGE_MIN=14`; `PRIOR_CONF < DECISION_CONF_GATE` |
| **`seed_capability_prior_bw` + `seed_athlete` branch** | Additive seeding (new path) | ✅ Done | validated-bodyweight branch writes `(score, 25, 2.30)` bypassing `cohort_multiplier`; `OPTION_D_PRIOR_SUM_W = 2.3015` |
| **3-bucket fallback** | Invariant (kill-switch) | ✅ Verified | absent/`None`/out-of-range `bodyweight_kg` ⇒ exact pre-DX-08 seed (conf 10, `SEED_PRIOR_SUM_W`) |
| **Assembler MAP** | Build wiring | ✅ Done | `hush_model/strength_standards.py ← sprint0/strength_standards.py` |
| **DX-08 tests** | Additive (7 pure + 2 e2e) | ✅ Done | bodyweight/sex monotonicity, conf/sum_w cap, exp cap, downbias+clamp, model-inverse round-trip, §2.1 continuity, fallback-bit-for-bit, onboard e2e |

**Test result:** `==== 165/165 passed ====` — per-suite:
`sprint0 19 · sprint1 12 · sprint2 27 · sprint3a 18 · sprint3b1 18 · sprint3b2 26 · sprint4 20 · wave1 10 · sprint5 3 · sprint6 12`.
Baseline before DX-08 was **156/156** (`sprint0 12`, `sprint1 10`). Net: **sprint0 +7**, **sprint1 +2**;
**every other suite count is identical and green** — additive-on-a-new-input, **zero re-gold**.

---

## 1. The change

At onboarding, when a valid `bodyweight_kg` is present, each Class-A capability seed is:

```
estimate_1rm = bodyweight_kg × base_ratio[cap][sex] × experience_modifier(experience ≤ ×1.20) × age_taper(age)
             × (1 − OPTION_D_DOWN_BIAS)          # conservative downward bias
estimate_1rm = clamp(estimate_1rm, floor_c, ceil_c)   # per-capability plausibility band
seed_score   = score_of(cap, estimate_1rm)       # the model's OWN frozen inverse — no new math
→ CapabilityState(score=seed_score, confidence=25, sum_w=2.3015)
```

`sex` and `age` are encoded in the table/taper, so the Option D path **bypasses `cohort_multiplier`** (no
double-count). When `bodyweight_kg` is absent or outside `[35, 250]`, seeding **falls back bit-for-bit** to
`seed_capability_score` (confidence 10, `SEED_PRIOR_SUM_W`). `seed_capability_score`, `SEED_CONFIDENCE`,
`SEED_PRIOR_SUM_W`, and `cohort_multiplier` are untouched. `service.onboard` / `domain.py` needed **no
change** (DX-07 already forwards `bodyweight_kg`).

**Files (source-of-truth `implementation/`):** `sprint0/strength_standards.py` (new),
`sprint0/constants.py` (+5 scalars), `sprint0/seeding.py` (branch + `seed_capability_prior_bw` +
`OPTION_D_PRIOR_SUM_W`), `sprint0/test_sprint0.py` (+7), `sprint1/test_sprint1.py` (+2),
`build/_verify/assemble_and_test.py` (MAP +1).

---

## 2. Behavioral effect (verified, not assumed — direct probe on the assembled tree)

**Bodyweight prior vs 3-bucket fallback** (male, 85 kg, intermediate, `horizontal_push`):

| Path | score | confidence | sum_w |
|---|---:|---:|---:|
| **Option D** (bodyweight) | **30.78** | **25.0** | **2.301** |
| 3-bucket fallback (no bw) | 48.00 | 10.0 | 0.843 |

The bodyweight prior is **grounded in the athlete's actual mass** rather than the flat experience bucket,
and carries a higher precision (`sum_w 2.301`, conf 25) so it begins corroborating toward the gate within a
few sessions instead of months — yet stays **below the decision gate** (`25 < 30`), so the governor remains
inert until the athlete's own data crosses it.

**§2.1 beginner-continuity gate (binding safety interpretation, readiness §0/§2)** — at the PROVISIONAL
calibration bodyweight (male 92 kg) an **untrained/beginner** athlete maps within **±3 score of
`SEED_SCORE['beginner']` (30)** for every capability (max deviation **−0.56**):

```
horizontal_push 29.79 · horizontal_pull 29.44 · vertical_push 29.61 · knee_dominant 30.06 · hip_dominant 30.06
```

**Advanced under-seeding is real, intended, and benign** (stated, not hidden — readiness §1 truthfulness
note): a male 85 kg **advanced** `knee_dominant` seeds at score **36.42**, far below the old flat advanced
seed of **64**. The capped (≤ +20%) experience modifier cannot reach the old advanced anchor by design; a
**genuinely** advanced athlete recovers the headroom through the existing governor after corroboration
(conf > 30), not through an aggressive seed. Under-loading is the safe direction (an easy early session; the
athlete owns load).

**Detrained over-claim is bounded** (the dangerous direction): a male 85 kg "advanced" claim yields a
`knee_dominant` 1RM estimate of **95.9 kg** vs the **79.9 kg** bodyweight baseline — exactly the **+20% cap**,
not an elite estimate. Bodyweight-keying + cap + downward bias + per-capability ceiling are the four day-1
over-estimation guards (spec §3.1).

---

## 3. Acceptance criteria (execution package §8)

- [x] `strength_standards.py` added (versioned): `base_ratio`/`clamp`/`experience_modifier`/`age_taper`/
      `estimate_1rm`; female via `SEX_MULTIPLIER`; pure / I-O-free.
- [x] 5 Option D constants added, **all marked PROVISIONAL**; `PRIOR_CONF = 25 < DECISION_CONF_GATE = 30`.
- [x] `seed_athlete` branches on a **validated** `bodyweight_kg`; Option D writes `(score, 25, 2.301)`,
      bypassing `cohort_multiplier`; **fallback path byte-for-byte unchanged** (probe + `test_fallback_is_bit_for_bit_3bucket`).
- [x] Bodyweight-primary, experience **capped ≤ +20%**, downward bias + per-capability clamp all present
      (the four day-1 over-estimation guards).
- [x] **§2.1 continuity gate (beginner median ±3 of 30)** passes for the chosen median bodyweight (male);
      `test_option_d_calibration_continuity`.
- [x] Existing **156/156 unchanged**; new Option D + fallback tests green; `assemble_and_test.py` green;
      per-suite counts reported (§0).
- [x] ① core math, blend, decay, evidence weighting, decision governor, `kappa` **untouched**; no schema
      change; no progression-system change (governor inert at the seed).
- [ ] **§5 coverage gates on the *fitted, frozen* table** (≤ 5% too-heavy / 0% unliftable across cohorts +
      both detrained cells) — **deferred per readiness D1/D2**: the structure ships on **PROVISIONAL** values;
      these gates and the dataset fit are the condition on making Option D the **live onboarding default**,
      not on this build. See §4.

---

## 4. Scope boundary & carried-forward conditions (honest)

This slice ships the **structure** of Option D on **PROVISIONAL** parameters (readiness D1 option (b)),
exactly as the readiness review licensed: *approved to build the structure now; the live default is gated
on D1/D2/D3.* Carried forward, explicitly **not** done here:

1. **D1 — fit & freeze the table.** `base_ratio`/`clamp`/`DOWN_BIAS` are illustrative (spec §2.1), anchored
   so the median **untrained** male (92 kg) maps to ~30; they must be **fit to a named public dataset**
   (StrengthLevel/ExRx-class) under the beginner-continuity gate and frozen (bump `STRENGTH_STANDARD_VERSION`)
   before Option D is the live default. `CALIBRATION_BW_KG` (92 kg) is itself PROVISIONAL and refits with
   the table. *Note:* the §2.1 constraint is bound to the **beginner median only** (readiness §2) — a single
   bodyweight baseline cannot also span the 34-score level gap, so intermediate/advanced are the capped
   uplift, not separate continuity targets.
2. **D2 — §5 coverage harness.** `init_spec_sim.py` was a study artifact, not in the tree. A small
   `sim/seed_validation.py` (reuse `SyntheticAthlete` + real `recommend()`) running the §5 cohorts + the two
   detrained cells should be wired as the pre-beta acceptance gate. The unit-level guards (cap, clamp,
   downbias monotonicity, continuity, model-inverse) **are** in place now (`test_sprint0`).
3. **D3 — onboarding requests `bodyweight_kg`.** Mobile/API onboarding (BB-16) must *request* bodyweight
   (optional, validated) or Option D never fires for real users; the fallback keeps it graceful.

**Not licensed / out of scope (unchanged):** any change to the blend/decay/evidence/gate/`kappa`,
per-lift/history priors (Option C fast-follow), Class-B activation, or making the seed authorize
progression.

---

## 5. Rollback

Code-only, no data migration. Remove `strength_standards.py` + its MAP entry, the `seed_athlete` Option D
branch + `seed_capability_prior_bw`/`OPTION_D_PRIOR_SUM_W`, the 5 constants, and the new tests. **Soft
rollback without a code revert:** stop sending `bodyweight_kg` from onboarding ⇒ all new athletes silently
take the 3-bucket fallback (the fallback **is** the kill-switch). Already-onboarded Option D athletes keep
their conf-25 priors — legal `capability_state` rows the loop treats like any other prior; learned state is
never corrupted because Option D only writes a legal `(score, confidence, sum_w)` at onboarding and touches
nothing afterward.

---

*Completion report only. Implements Option D within DX-08's bounded scope: no ① core-math change, no schema
change, no progression-system change; governor inert at the seed; fallback preserves all prior behavior
(156/156 → 165/165, zero re-gold). Live-default conditions D1/D2/D3 carried forward. Trace:
`DX-08_EXECUTION_PACKAGE.md`; `DX-08_READINESS_REVIEW.md`; `CAPABILITY_INITIALIZATION_IMPLEMENTATION_SPEC.md`;
`CAPABILITY_INITIALIZATION_DECISION.md`; Delta Plan DX-08; ES-008 v2 (+DX-13).*
