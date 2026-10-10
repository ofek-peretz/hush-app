# Sprint 3A Code Readiness Review

> Pre-implementation readiness review of the accepted Sprint 3A plan, conducted against the **actual built code** (`recommendation.py`, `fatigue.py`, `evidence.py`, `state_update.py`, `pipeline.py`, `repositories.py`, `schema.py`, `db.py`, `migration_002`, `test_sprint2`). It checks whether the plan can be implemented faithfully and safely as written. No code written.
>
> Date: 2026-06-09 · Build: Sprint 0/1/2 ✅ (46 tests) · Schema v2.

> **STATUS: ACCEPTED (2026-06-09).** Verdict: **GO**, conditional on three start refinements (§6). The user further mandated four implementation conditions at start: (1) `decision.py` is the single live decision authority; (2) MR2 is a mandatory checklist with explicit tests; (3) the multi-session sequencing harness is built in Sprint 3A, not as follow-up; (4) the Sprint 0–2 46-test parity guarantee is preserved. All were satisfied — see `reviews/completion/SPRINT_3A_COMPLETION_REPORT.md`.

## 1. Hidden dependencies

**HD1 — "Reuse Sprint 2 surprise" is actually "introduce surprise into the live chain."** `fatigue.surprise()` exists but is **not wired into the pipeline** — only unit-tested. So 3A must *add* the surprise computation to the governed path.
*De-risk:* on the single-capability path, surprise collapses to an identity already in the pipeline. Because `defatigue_reps` adds fatigue back in score space (`s_obs_clean = s_obs_raw + F`), and the expectation is `score − F`: `surprise = s_obs_clean − score_before`. So the streak signal is just `ev.s_obs − score_before`; no new raw-rep conversion. *(Implemented exactly this way.)*

**HD2 — Three reason vocabularies; one vestigial.** `recommend()` emits colon-strings; `fatigue.decision_reason()` emits bare codes but is **unwired**; 3A adds `decision_type` + ES-006 reasons. 3A must designate **`decision.py` as the single live authority** and mark `fatigue.decision_reason()` superseded. *(Done.)*

**HD3 — `recommend()`'s reason string is load-bearing for audit and parity.** `pipeline.py` writes `reason=rec.decision_reason` into `state_update_log`, and Sprint 2 tests assert exact strings. The new `decision_type` must be **additive**; the inert/rested path must keep the verbatim strings. *(Done — cold-start emits the legacy string via a preserved constant.)*

**HD4 — `recommend()` gains a dependency on decision state** (reads `last_recommended_weight` + streaks from `CapabilityState`). Consistent with "decisions read from state." *(Done.)*

**HD5 — No migration runner chains migrations.** `Database.__init__` runs `SCHEMA_SQL` only; `migration_00x.apply()` is a standalone path. 3A must update `schema.py` (fresh DBs) and add `migration_003` (existing DBs) in lockstep. *(Done.)*

## 2. Migration risks

**MR1 — schema.py ↔ migration_003 lockstep.** Five `capability_state` cols + `recommendation.decision_type`/`target_load` + `state_update_log.decision_type` must match in both. *(Done.)*

**MR2 — The three-site state-plumbing trap (highest-likelihood bug).** New `CapabilityState` fields must be updated in `create_athlete` (INSERT), `write_capability_state` (UPDATE), and `_row_to_cap` (SELECT→object) together or persistence silently fails (streaks reset on read → governor never fires). *(Done; guarded by `test_decision_memory_round_trips`.)*

**MR3 — Migration only exercised by an explicit test.** Need a v2→v3 migration test (apply twice; additive; idempotent). *(Done — `test_migration_003_additive_and_idempotent`.)*

**MR4 — `CapabilityStateSnapshot` is intentionally partial** (feeds only the prev-state audit). Left partial by design. *(Unchanged.)*

## 3. Test coverage gaps

**TG1 — No multi-session sequencing harness (net-new infrastructure).** The stability guard and memory are cross-session; current tests are single-session. *(Built this sprint — mandated condition 3.)*
**TG2 — Override path never exercised** (sim performs the recommendation). *(Override instrumentation deferred to where overrides exist; the no-collapse rule is honored.)*
**TG3 — Migration v2→v3 test.** *(Done.)*
**TG4 — Block-vs-set granularity untested by construction** (all blocks single-set). *(Streak update confined to one-per-block via `set_number == 1`; documented for 3B.)*
**TG5 — "No double-discount" has no analog.** *(Added — `test_governor_increase_does_not_double_discount`.)*

## 4. State-model risks

**SM1 — Streak-update site vs decision-evaluation site.** Decision is block-level; the increment must be confined to one-per-block or 3B's multi-set blocks over-count. *(Gated on `set_number == 1`; 3B must relocate to block completion — documented.)*
**SM2 — Streak must read the clean signal** (`s_obs`, not raw), so fatigue cannot manufacture a run. *(Done; proven by `test_fatigue_explained_deficit_does_not_accrue_negative_streak`.)*
**SM3 — Which load does the governor hold from under an override?** Decision: govern from the system's own last *recommended* baseline; log overrides separately. *(Adopted.)*
**SM4 — (Checked, NON-issue.)** `last_trained_at_week` advances (`apply_evidence`), so per-capability fatigue decays correctly — the DECREASE-vs-fatigue branch is sound.

## 5. Cross-cutting observation

Sprint 2 left `surprise` and `decision_reason` specified, tested, but **unwired** — a deliberate "emit-the-code-now, act-later" boundary. Sprint 3A is the sprint that wires the decision side, so its real surface is **integration** (wiring + state plumbing + audit) more than new math. Risk shifts from "is the formula right" (tested) to "is it threaded through state/persistence without dropping a field" (MR2/SM1).

## 6. Verdict — GO, conditional on three start refinements

No blocking reason: decisions ratified, the 3A/3B seam clean, and every prerequisite 3A needs is already built. Conditions to satisfy at start (no model review needed):
1. Reword "reuse surprise" → "introduce surprise into the live chain via `s_obs − score_before`" (HD1).
2. Adopt the MR2 three-site checklist + v2→v3 migration test as DoD items.
3. Decide SM1 (streak-per-block) and SM3 (govern from last *recommended*) explicitly before coding.

Plus: build the multi-session harness as real work (TG1), and mark `fatigue.decision_reason()` superseded (HD2).

---

*Sources read: the accepted Sprint 3A plan; `recommendation.py`, `fatigue.py`, `evidence.py`, `state_update.py`, `pipeline.py`, `repositories.py`, `schema.py`, `db.py`, `service.py`, `orchestrator.py`, `synthetic_athlete.py`, `recovery.py`, `migration_002_fatigue.py`; `test_sprint0/1/2`. No code written.*
