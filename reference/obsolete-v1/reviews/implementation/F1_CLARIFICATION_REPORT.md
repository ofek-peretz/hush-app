# F1_CLARIFICATION_REPORT.md — `actual_weight` is Not a Model Decision

> **⚠️ SUPERSEDED by M1 / DX-06 (2026-06-11).** The reps-only conclusion below is **reversed**:
> `actual_weight` **IS** a v1 learning input. M1 (DX-01/DX-02) feeds the logged `actual_weight` into the
> evidence engine (`effective_load = obs.actual_weight`) and evaluates prediction quality at the actual
> load; M1/DX-20 then builds future programs from the resulting learned score. The "deferred future model
> change" floated in this report's §6 is now **adopted as M1**, licensed by the model review in
> `reviews/implementation/M1_MIGRATION_READINESS_REVIEW.md` and executed per `M1_EXECUTION_PACKAGE.md`.
> The contract wording fixes this report once prescribed (reps-only) are themselves reversed in
> `API_CONTRACT_V1.md` (§0.5/§7.1/§16C). This document is retained only as the historical record of the
> pre-M1 reading. **Do not treat anything below as current.**
>
> Resolves the F1 finding from `SESSION_RUNTIME_TRANSITION_REVIEW.md` §6.1. The question asked: *is the
> reported `actual_weight` a learning input requiring a model-review decision, or a contract inconsistency?*
> **Finding: contract inconsistency.** The validated Hush model is **reps-only at the recommended weight**;
> no validated behavior depends on an athlete-reported `actual_weight`. Therefore — per the standing
> instruction — **no formal model-review decision is opened.** This report documents the clarification, the
> required API-contract wording fixes, and the implementation notes. It changes no code and no model
> behavior. Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-11 · Build: Sprint 0–4 ✅ + Wave 1 ✅ (131 tests) · Reviewed: `pipeline.py`, `evidence.py`,
> `orchestrator.py`, `domain.py`, `API_CONTRACT_V1.md`, `HUSH_CANONICAL_DESIGN_SPEC_V1.0.md`,
> `SESSION_RUNTIME_TRANSITION_REVIEW.md`.

---

## 0. Verdict

**F1 is a contract clarification, not a model decision. No decision review is created.** The model truth is:

> **The recommended weight (the prescribed *anchor*) is the effective load; the athlete's only input is
> reps.** `actual_weight` is a **stored audit field** (ES-001 "store both" + A9 override-logging), **not a
> v1 learning input.** Removing it from the contract — or demoting it to an inert audit field — changes
> **zero** validated behavior.

There is **no behavioral fork.** The contract's §7.1 wording ("`actual_weight` … is an observation input,
not noise") **overstates a consumer that does not exist** and is the entire substance of F1.

---

## 1. The five questions, answered with evidence

### Q1 — Has Hush always been designed around reps-only reporting?  **Yes.**
- **Every** learning-loop writer sets the observation weight to the recommended weight, from Sprint 0
  onward: `orchestrator.py:77,127`, `pipeline.report_set:151,157`, `pipeline.report_set_fatigue_aware:316,322`
  all pass `actual_weight=rec.recommended_weight`. The athlete callback `perform(rec) → actual_reps` returns
  **reps only** (`pipeline.py:146, 311`); there is **no parameter** for an athlete-supplied weight.
- The canonical UX spec (`HUSH_CANONICAL_DESIGN_SPEC_V1.0.md`) renders **Weight as the prescribed anchor**
  (the "Hero Number", lines 115/370/390) + **Reps** as the logged quantity (lines 371/396); VoiceOver reads
  "82.5 kilograms / 8 repetitions" (1178–1179). Effort/RIR/recovery are **Forbidden** (897). The product law
  is "Flight Recorder — not Coaching Report" (830).
- **Conclusion:** reps-only-at-the-anchor-weight is the design since Sprint 0, reinforced by the frozen UX.

### Q2 — Does any validated model behavior depend on athlete-reported `actual_weight`?  **No.**
- No athlete-reported `actual_weight` exists anywhere in the validated trajectory — the pipeline supplies the
  weight (the recommendation's), the athlete supplies reps. All 131 tests' trajectories run with
  `actual_weight ≡ recommended_weight`.

### Q3 — Is `actual_weight` consumed anywhere in the learning loop today?  **The field is; an independent value is not.**
- `evidence.py:60` reads `effective_load = obs.actual_weight * w_c` → Epley inverse → `s_obs` (`:61–62`). So
  the **field** `obs.actual_weight` is consumed by the learning math.
- **But its value is invariantly `rec.recommended_weight`** (Q1). So the learning loop consumes *the
  recommended weight, stored in the `actual_weight` field* — **never an independent athlete report.** The
  effective load and the recommended weight are, in every validated path, the same number.

### Q4 — If `actual_weight` is removed from the API contract entirely, does any validated behavior change?  **No.**
- The validated pipeline already uses `recommended_weight` as the effective load. An API where the athlete
  reports **reps only** and the server uses `recommended_weight` reproduces every trajectory **byte-for-byte**.
  Removing `actual_weight` from the contract **aligns the contract with the validated model**; it does not
  change the model.

### Q5 — Is F1 a genuine model decision, or a clarification?  **A clarification.**
- The validated system is already reps-only. There is no fork to decide. The only artifact that implies a
  choice is the **contract's wording**, which must be corrected to match the model. **recommended_weight
  remains the model truth; athlete input is reps.**

---

## 2. The one apparent exception, explained (it confirms the rule)

`test_sprint4.py:146 test_override_target_logging_and_reconstruction` is the **only** place
`actual_weight (90.0) ≠ recommended (100.0)`. It:
- **hand-builds** the observation (not via the pipeline), with `prediction_error=0.0` set manually;
- logs it via `insert_observation(... override_category="LOAD", override_target=90.0)`;
- asserts **only** that the override is **reconstructable** (`override_category=="LOAD"`, `override_target==90.0`);
- **never runs the learning chain** — no evidence, no `apply_evidence`, no state assertion.

So the single weight-deviation case in the whole codebase is an **A9 override-*logging*** path, not a
learning path. It demonstrates exactly the intended v1 behavior: a load deviation is **captured for audit**,
**not fed into learning**. This *confirms* reps-only learning rather than contradicting it.

---

## 3. The clarified model truth (for the record)

| Quantity | Role in v1 | Source |
|---|---|---|
| **recommended_weight** | the prescribed **anchor** = the **effective load** the model learns from | `recommend()`; `evidence.py` effective_load |
| **actual_reps** | the **only** athlete learning input | `perform → actual_reps` |
| **actual_weight** | **stored audit field** (ES-001 "store both"); if it differs from recommended, it is an **A9 LOAD override** (logged, not learned) | `schema.py:137`; `test_sprint4:146` |
| effort / RIR / proximity | **refused** (Anti-Requirement) | canonical spec 897; ES-011/A5 |

---

## 4. Required API-contract updates (documented; the contract is frozen — apply via its change process)

`API_CONTRACT_V1.md` overstates `actual_weight`. The following **wording** corrections align it with the
validated model. No endpoint, field, or behavior is added or removed — `actual_weight` stays in the request
(ES-001 storage + A9), but is **re-described** as an audit field, not a learning input.

| Location | Current (overstated) | Corrected (clarified) |
|---|---|---|
| **§7.1** (set request) | "`actual_weight` is required … the athlete may have loaded a different plate, and that is **an observation input, not noise**." | "`actual_weight` is recorded for audit (ES-001 store-both) and **override logging (A9)**. **It is not a v1 learning input** — the model learns from **reps at the recommended (anchor) weight**. If `actual_weight ≠ recommended_weight`, the server records an **A9 LOAD override** (`override_category=LOAD`, `override_target=actual_weight`); learning still uses `recommended_weight`." |
| **§16C** (model-input boundary) | lists `actual_weight` among "the only learning inputs". | move `actual_weight` out of the *learning-input* list; keep `actual_reps`, skip, replace-targets. Note `actual_weight` is an **audit/override** field, parallel to bodyweight (captured, inert to learning). |
| **§7.2 / §0.3** | implies the per-set prescription the athlete lifts is the learned load. | add a one-line note: the **displayed/anchor weight is the learned effective load**; per-set internal recomputation is the model's, not an athlete input. |

**`actual_weight` should remain a (recommended: optional) field in the request** so ES-001 "store both" and
A9 override capture are preserved. The correction is purely *what it means*, not *whether it exists*.

---

## 5. Required implementation notes (event-driven set handler, Wave-2 B3)

These make the API faithful to the validated pipeline (and dissolve the F1 "blocking pre-condition"):

1. **Effective load = `recommended_weight`.** The set handler calls `report_set_fatigue_aware(perform=
   reported_reps, …)` exactly as `SessionEngine` does; the **pipeline's recomputed `rec.recommended_weight`
   is the learned load** (unchanged from today). Do **not** wire the device-reported `actual_weight` into the
   observation's `actual_weight`/`effective_load` — that would be the model change this report shows is
   unnecessary.
2. **Capture, don't consume.** Persist the device-reported `actual_weight` for audit; if it differs from
   `recommended_weight`, record an **A9 LOAD override** (`override_category=LOAD`, `override_target`) via the
   existing instrumentation (BB-10/A9) — the `test_sprint4` pattern. Learning is untouched.
3. **No new field reaches the learning math.** The §6.1 fidelity concern is resolved: the event-driven path
   uses the same effective load (`recommended_weight`) as the in-process path, so the differential-replay
   test (`SESSION_RUNTIME_TRANSITION_REVIEW.md` §7.1) holds with **reps as the only athlete input**.

---

## 6. The one genuinely-future item (NOT F1, not blocking)

There is a separate, **future** model question — *should a real athlete's load deviation be **learned from**
(at the lifted weight) rather than only logged?* This is **not** F1, **not** a v1 decision, and **not**
blocking: v1 is reps-only-at-anchor with A9 logging, exactly as validated. Consuming load deviations into
learning would be a deliberate **future model change** (it would alter `evidence.py`'s effective load to the
reported weight and require re-validation). **Parked** as a future consideration; it needs no action now and
no decision review for Wave 2.

---

## 7. Effect on `SESSION_RUNTIME_TRANSITION_REVIEW.md`

This report **supersedes that review's §6.1 (F1)** and the related "blocking pre-condition" in its §0/§7.8:

- **F1 is reclassified** from "requires model review / blocking" to **"contract clarification — resolved
  here."** The set endpoint is **not** blocked on a model-review decision.
- **All other transition-review findings stand unchanged** (F2 `complete_block`-once-per-capability, F3
  verified order-safe, F4 persisted accumulator, F5 serialization, F6 `week`, F7 `govern`, F8 idempotency
  atomicity, and the skip/replace/abandon edges). The differential-replay gate (§7.1) remains the acceptance
  test — now with the confirmed input set: **reps only**.

*(A one-line resolution note should be added to that review's §6.1 pointing here; documented, not applied, to
keep this report the single change.)*

---

## 8. What this report changes / does not change

- **Changes:** the *description* of `actual_weight` in the API contract (§4 wording fixes) and the
  classification of F1 (clarification, not decision). It records the implementation rule (effective load =
  recommended_weight).
- **Does not change:** any code, any model number/formula/trajectory, the schema, or any endpoint/field. The
  131 tests are untouched. `actual_weight` remains stored (ES-001) and available for A9 override logging.
- **Does not open:** a formal model-review decision — because there is no behavioral fork.

---

*Clarification report only — no redesign, no model-behavior change, no new decision review. F1 is a contract
inconsistency resolved by aligning the contract wording to the validated reps-only model. Traceability:
`pipeline.py` · `evidence.py` · `orchestrator.py` · `HUSH_CANONICAL_DESIGN_SPEC_V1.0.md` · `API_CONTRACT_V1.md`
· `SESSION_RUNTIME_TRANSITION_REVIEW.md` (§6.1, superseded).*
