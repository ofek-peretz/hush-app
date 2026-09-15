# BB-16 / BB-17 — Option D seed-coverage acceptance gate (DX-08 §4 D2) — COMPLETION REPORT

> Completion report for the **seed-coverage validation harness** carried forward as DX-08 §4 **D2**
> ("a small `sim/seed_validation.py` … wired as the pre-beta acceptance gate") and registered as
> **BB-16** (validate onboarding→seed mapping end-to-end, bias conservative) + **BB-17** (verify the
> seed maps safely across cohort cells). This builds the **mechanism** behind the one hard Phase-1
> gate (**A7 seed safety across the diverse cohort**) and runs it on the live model. **Complete.**
> Tests: **179/179** model golden (was **173/173**; **+6 net-new** in `test_seed_validation`, zero
> re-gold) **+ API pytest 30** → canonical gate **PASS**. No model/constant/schema/migration change —
> a pure validation harness over the frozen seeding + recommendation path.
>
> Date: 2026-06-12 · Build: … + DX-08 ✅ + **seed-coverage gate ✅** (Schema **v10**, unchanged) ·
> Owner: Model/Backend.

---

## 0. Executive summary

| Item | Class | Status | Evidence |
|---|---|---|---|
| **`sim/seed_validation.py`** | Pure validation harness (new) | ✅ Done | live `seed_athlete`→`recommend` per cohort cell; independent ground-truth 1RM; §5 gates (a)(b)(c) |
| **`tests/test_seed_validation.py`** | Gate tests (new, +6) | ✅ Done | mechanism, gate (a) normal-cell safety, gate (c) continuity, teeth, determinism |
| **Assembler wiring** | Build MAP (+2) + suite (+1) | ✅ Done | `sim/seed_validation.py ← sprint0/seed_validation.py`; test in golden runner |
| **§5 gate (a) — normal cells** | Acceptance result | ✅ **PASS** | all 6 cells **0 % unliftable**, **≤ 0.7 % too-heavy**, median \|err\|% ~17–20 % (benign under-load) |
| **§5 gate (c) — beginner continuity** | Acceptance result | ✅ **PASS** | untrained @ 92 kg male maps within **0.56** score of 30 (tol ±3) |
| **§5 gate (b) — detrained over-claim** | Acceptance result | ⚠ **NOT YET MET on the PROVISIONAL table** | adv→beg **20.1 %** / int→beg **5.7 %** too-heavy, adv→beg **0.1 % unliftable** — the concrete D1 fit target |

**Test result:** `==== model golden runner: 179/179 passed ====` + `API pytest rc=0` →
`OVERALL: model 179/179 + API pytest rc=0 -> PASS`. Per-suite: `sprint0 19 · **seed_validation 6** ·
sprint1 12 · sprint2 27 · sprint3a 18 · sprint3b1 22 · sprint3b2 26 · sprint4 23 · wave1 11 ·
sprint5 3 · sprint6 12` (model 179) + API `core 19 · connection 7 · instruments 4` (30). Suite **209**.

---

## 1. What was built

A pure-Python coverage harness that exercises the **real** cold-start path end to end and scores
day-1 seed safety against **independent** ground-truth capability:

```
for each cohort cell × N synthetic athletes:
    bodyweight ~ Normal(cohort mean, sd)              # the only seed input that varies within a cell
    seed_state = seed_athlete(declared_exp, bodyweight)   # live Option D bodyweight prior
    for each Class-A capability:
        true_1rm = bodyweight × base_ratio × experience_modifier(TRUE_exp) × age_taper × lognormal(σ)
        W        = recommend(seed_state[cap], …).recommended_weight       # the live working load
        unliftable ⇔ W ≥ true_1rm
        too_heavy  ⇔ reps_to_failure(W, true_1rm) < TARGET_REPS
        err%       = (W − load_for_reps(TARGET_REPS+RIR, true_1rm)) / …
```

**Non-circularity.** The seed sees only `(sex, age, experience, bodyweight)`. The true 1RM is generated
independently from the same physical anchors **without** the conservative down-bias and **without** the
plausibility clamp, plus lognormal within-bucket noise (σ = 6.2 · `K_GROWTH`, the spec §5 residual SD in
score space ≈ 10 % on kg). For a **normal** cell `TRUE_exp == declared` (seed is calibrated-but-
conservative → benign under-load); for a **detrained** cell the athlete declares a higher level than is
true (`TRUE_exp = beginner`) so the seed applies the wrong, higher experience modifier — the exact
hazard the bodyweight-keying + ≤ +20 % cap + down-bias + clamp must contain.

**Gates wired** (spec §5): **(a)** every normal cell ≤ 5 % too-heavy / 0 % unliftable · **(b)** both
detrained cells (bodyweight-keyed) ≤ 5 % too-heavy / 0 % unliftable · **(c)** §2.1 beginner continuity
(untrained median within ±3 of 30). Gate **(d)** (DECISION Part-B gate-open median ≤ 3 weeks) is a
multi-week *convergence* check, not a day-1 seed-safety check, and is intentionally out of this slice
(it needs the full learning loop, not seeding).

**Files** (source-of-truth `implementation/`): `sprint0/seed_validation.py` (new harness),
`sprint0/test_seed_validation.py` (+6 tests), `build/_verify/assemble_and_test.py`
(MAP `sim/seed_validation.py` + `tests/test_seed_validation.py`; suite list +1).

Run standalone (operator acceptance view): `python -m sim.seed_validation` (from `build/_assembled/`).

---

## 2. Results (PROVISIONAL table — verified, not assumed)

```
cohort cell                     too-heavy  unliftable  median|err%|   gate
M young beginner                     0.7%        0.0%         17.2%   PASS
M middle intermediate                0.4%        0.0%         17.2%   PASS
M older advanced                     0.7%        0.0%         17.4%   PASS
F young intermediate                 0.5%        0.0%         19.4%   PASS
F middle beginner                    0.5%        0.0%         20.4%   PASS
F older intermediate                 0.2%        0.0%         20.6%   PASS
-- detrained over-claim stress cells (bodyweight-keyed) ------------------
adv→beg (Δ−34) detrained            20.1%        0.1%          6.8%   FAIL
int→beg (Δ−18) detrained             5.7%        0.0%         10.3%   FAIL
(c) §2.1 beginner continuity @ 92kg male: max|dev|=0.56 (tol 3.0) -> PASS
```

**Gate (a) PASS / gate (c) PASS** — the normally-classified cohort is seed-safe across male/female,
young/middle/older, beginner/intermediate/advanced: **0 % unliftable**, **≤ 0.7 % too-heavy**, with the
residual sitting on the benign under-load side (median \|err\|% ~17–20 % — the down-bias + safety-discount
conservatism, the safe direction). This is the executable confirmation of the A7 seed-safety property
for normally-classified athletes.

**Gate (b) NOT YET MET on the PROVISIONAL table** — the detrained over-claim tail exceeds the §5 ≤ 5 %
bound (adv→beg **20.1 %**, int→beg **5.7 %** too-heavy) and shows a small but real **0.1 % unliftable**
in the adv→beg cell. This is **the correct, expected output of an acceptance gate with teeth**, and it
matches DX-08's honest carry-forward exactly: the strength-standard table ships on **PROVISIONAL**,
illustrative ratios/clamps, and the per-capability **ceiling clamps are not yet tight enough** to bind
a detrained "advanced" over-claimer. The fix is the **D1 table fit/freeze** (tighten `ceil_c` toward the
chosen dataset's ~95th-pct ratio until both detrained cells reach ≤ 5 % / 0 % unliftable) — **not** a
field tweak now (changing a live clamp to fit is a model-review act, and the table is the thing being
fit). The harness now gives D1 a **concrete, re-runnable acceptance target** instead of a prose promise.

> Note on absolutes: the spec §5 itself states "exact percentages are indicative; the orderings and the
> bodyweight-vs-experience conclusion are robust." The harness reproduces the **robust** conclusions
> (normal-cell safety; detrained as the bounded hazard direction; bodyweight-keying as the structural
> protection) under its own clearly-marked PROVISIONAL population parameters; the detrained absolutes
> move with the table fit and population means, which is precisely what D1 settles.

---

## 3. Implication for beta readiness (honest)

- **Mechanism (BB-16/BB-17, DX-08 D2): DONE.** The pre-beta seed-safety acceptance gate now exists, runs
  on the live model, is deterministic, and is part of the canonical command's regression set (the design
  invariants — normal-cell safety, continuity, gate-has-teeth, determinism — are asserted green).
- **Option D as the LIVE onboarding default remains D1-gated** (unchanged from DX-08): it must not be the
  default until (D1) the table is fit/frozen to a named public dataset **and** this harness's gate (b)
  passes (detrained ≤ 5 % too-heavy / 0 % unliftable). Until then the graceful fallback (absent/invalid
  bodyweight ⇒ the 3-bucket seed) is the kill-switch. The harness makes that gate auditable.
- The single **0.1 % unliftable** in the detrained adv→beg cell is flagged loudly (the harness prints
  `hard safety … VIOLATED` whenever any cell is non-zero) so it cannot be missed at D1 sign-off.

---

## 4. Acceptance criteria

- [x] `sim/seed_validation.py` added — live `seed_athlete`→`recommend`, independent ground-truth 1RM,
      §5 cohort cells + the two detrained stress cells, gates (a)(b)(c); pure / deterministic.
- [x] Wired into the canonical command (assembler MAP + golden-runner suite); `python -m sim.seed_validation`
      prints the operator acceptance table.
- [x] Gate (a) normal-cell safety and gate (c) continuity **asserted green** in the canonical gate.
- [x] Gate has **teeth** — detrained over-claim detected strictly above every normal cell (asserted).
- [x] **No model/constant/schema/migration change**; existing 173/173 unchanged; +6 additive →
      **179/179 + API rc=0 → PASS**.
- [ ] Gate (b) detrained ≤ 5 % / 0 % unliftable — **deferred to D1** (table fit/freeze); the harness is
      the acceptance check that fit must clear. Tracked, not asserted green (would lock in the provisional gap).
- [ ] Gate (d) convergence (≤ 3-week gate-open) — **out of this slice** (needs the multi-week loop).

---

## 5. Rollback

Code-only, no data. Remove `sim/seed_validation.py` + `tests/test_seed_validation.py`, their two MAP
entries, and the suite-list entry. Nothing in the frozen model, seeding, recommendation, schema, or any
golden depends on the harness — it only reads the model.

---

*Completion report only. A pure validation harness over the frozen seeding + recommendation path: no ①
core-math change, no seeding-behavior change, no schema/migration change (173/173 → 179/179, zero
re-gold). Implements DX-08 §4 D2 / BB-16 / BB-17; the live-default condition (D1 table fit + gate (b))
is carried forward and now has an executable acceptance gate. Trace: `DX-08_COMPLETION_REPORT.md` §4;
`CAPABILITY_INITIALIZATION_IMPLEMENTATION_SPEC.md` §5; `OPEN_ITEMS_EXECUTION_PLAN.md` BB-16/BB-17.*
