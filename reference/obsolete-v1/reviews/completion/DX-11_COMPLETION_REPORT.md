# DX-11_COMPLETION_REPORT.md — event-driven set-report primitive + `session_progress` accumulator

> Completion report for **DX-11** (Delta Plan P1 / Sprint 5 — the **runtime half of the M1 input flip**),
> executed per `reviews/implementation/DX-11_EXECUTION_PACKAGE.md`, implementing
> `SESSION_RUNTIME_TRANSITION_REVIEW.md` §2/§5/§7 and `SERVER_BUILD_PLAN_V1.md` §7. **DX-11 is complete.**
> Tests: **143/143 passing** (was **139/139**; **+4 net-new** — 3 in `test_sprint5`, 1 migration-008 test
> in `test_wave1`; **3 Wave-1 drift-guard assertions re-golded in place** to Schema v8). The **acceptance
> gate — the differential-replay test (review §7) — is green: an event-driven replay reproduces
> `SessionEngine` bit-for-bit.** This is **additive**: a new infra table + a new orchestration engine over
> the **unchanged** pipeline; **no ① core-math change**, no model schema-meaning change. Governing rule
> honored: *no redesign without explicit model review* — DX-11 maps endpoints onto existing primitives.
>
> Date: 2026-06-11 · Build: Sprint 0–4 ✅ + Wave 1 ✅ + DX-07/04/03 ✅ + M1 ✅ + **DX-11 ✅** (Schema **v7 → v8**) · Owner: Backend.

---

## 0. Executive summary

| Item | Class | Status | Evidence |
|---|---|---|---|
| **`session_progress`** | Additive infra (migration 008, v8) | ✅ Done | `schema.py` table + `migration_008_session_progress` (`_NEW_TABLES`, idempotent) + runner registration |
| **`SessionRuntime`** | Event-driven primitive | ✅ Done | `runtime.py`: `start_session`/`report_set`/`complete_session` over the accumulator; carries `(actual_weight, actual_reps)` |
| **`compose_and_open`** | Additive refactor | ✅ Done | extracted from `SessionEngine.run_session` (steps 1–2); reused by the runtime — "one implementation" |
| **Differential gate** | Acceptance (review §7) | ✅ Green | event-driven replay == `SessionEngine` bit-for-bit (score/conf/sum_w/fatigue/variance/decision memory + systemic fatigue) |
| **Docs** | DX-11 affected files | ✅ Done | `SERVER_BUILD_PLAN_V1.md` §5.2/§7; `WAVE_2_EXECUTION_CHECKLIST.md` B3 |

**Test result:** `==== 143/143 passed ====` — per-suite:
`sprint0 12 · sprint1 10 · sprint2 27 · sprint3a 18 · sprint3b1 18 · sprint3b2 26 · sprint4 20 · wave1 9 · sprint5 3`.
Baseline before DX-11 was **139/139** (`wave1 8`, no `sprint5`). Net: **sprint5 +3**, **wave1 +1**
(migration-008 test); the 3 Wave-1 version assertions were re-golded **in place** ([2..7]/7 → [2..8]/8).

**Behavioral effect (verified, not assumed — direct probe on the assembled tree):** a steady-state athlete
(confidence 80 ⇒ 2 slots/cap) composed **6 blocks over 3 capabilities**; driving the session as **20
separate event-driven `report_set` calls + `complete_session`** produced, for **every** trained capability,
`score`/`confidence`/`sum_w`/`fatigue`/`var_*`/decision-memory **identical** to `SessionEngine.run_session`,
and **systemic fatigue identical** (`13.139186 == 13.139186`). A reported deviation
(`actual_weight = recommended + 10`) is stored on both the `set_record` and the `observation` and the chain
learns from it — `actual_weight` carried through the event path. The persisted accumulator advances the
governor **once per capability** (R2) across the independent requests.

---

## 1. Requirement compliance (the execution-package instructions)

| Requirement | Result |
|---|---|
| Persisted `session_progress` accumulator (replaces in-process `_CapMemory`) | ✅ migration 008 + `SessionProgressRepository`; mirrors `_CapMemory` one-to-one. |
| Event-driven set-report primitive carrying `actual_weight` | ✅ `SessionRuntime.report_set` → `report_set_fatigue_aware(govern=False)` with `perform` returning the logged pair. |
| `complete_block` once per capability, deferred to close, priority order (R2) | ✅ `complete_session` iterates `CAPABILITY_PRIORITY_ORDER` (review §5.1 variant, not per-block-last-set). |
| `week`/`govern` pinned (review §5.3) | ✅ `week` from the caller (session row); `govern=False` always. |
| Bit-for-bit parity with `SessionEngine` (review §7) | ✅ differential-replay test green; probe confirms identical state incl. systemic fatigue. |
| Additive schema only; fresh == migrated at v8 | ✅ `session_progress` in `schema.py` + migration 008; drift guard + a new additive/idempotent migration test. |
| Run the canonical assembler + full suite | ✅ `python build/_verify/assemble_and_test.py` → **143/143**. |
| Docs (`SERVER_BUILD_PLAN_V1.md`, `WAVE_2_EXECUTION_CHECKLIST.md`) | ✅ §5.2 numbering note + §7 set-path note; B3 "landed ahead" note. |
| Produce a DX-07/04/03/M1-format completion report | ✅ This document. |

> **Transparent scope note.** DX-11 delivers the **service-layer primitive** the future HTTP handlers map
> onto — **not** the FastAPI shell, auth, idempotency, or connection-per-request (Wave-2 B1–B5 /
> BB-1/9/19; review §5.5/§5.6). Those wrap this primitive later. The "bit-for-bit" claim is the model-state
> trajectory; new rows carry their own UUIDs/timestamps (as always).

---

## 2. What was delivered

### New — `implementation/sprint5/migration_008_session_progress.py` → `hush_model/persistence/migrations/`
Additive, idempotent migration (`VERSION = 8`, `_NEW_TABLES = [("session_progress", …)]`, `migration_007`
shape). Creates the `session_progress` table if absent and stamps version 8. Declares `_NEW_TABLES` so the
Wave-1 ATD-8 drift guard checks it against `schema.py`.

### New — `implementation/sprint5/runtime.py` → `hush_model/persistence/runtime.py`
- **`SessionProgressRepository`** — `get` / `upsert` / `all_for_session` over `session_progress`; an `_Acc`
  dataclass = the persisted `_CapMemory`.
- **`SessionRuntime`** — `start_session` (delegates to `SessionEngine.compose_and_open`), `report_set`
  (`report_set_fatigue_aware(govern=False)` then upsert the accumulator with the **exact** `_CapMemory`
  logic from `session.py`), `complete_session` (read accumulator → `complete_block` once per capability in
  `CAPABILITY_PRIORITY_ORDER` → mark remaining blocks completed → `complete_session` →
  `increment_workout_count`). Writes **no** model logic.

### New — `implementation/sprint5/test_sprint5.py` → `tests/test_sprint5.py`
`test_event_driven_matches_session_engine_bit_for_bit` (the §7 gate, steady-state/multi-slot),
`test_report_set_carries_actual_weight` (DX-01/DX-11 carry), `test_accumulator_persists_across_requests_R2`.

### Edit — `implementation/sprint3b2/session.py` (additive refactor)
Extracted **`compose_and_open`** (steps 1–2) from `run_session`, which now calls it; the set loop + steps
4–5 are unchanged. The runtime reuses the same compose/persist primitive (Build Plan §0 "one
implementation"). **No behavior change** — sprint3b2 suite is the backstop; the differential test confirms.

### Edit — `implementation/sprint1/schema.py`, `implementation/wave1/migrations_runner.py`
`session_progress` `CREATE TABLE` added (fresh DBs); migration 008 registered in `MIGRATIONS` →
`SCHEMA_VERSION == 8` (the fresh-DB stamp + drift guard extend automatically).

### Edit — `implementation/wave1/test_wave1.py` (re-gold + new test)
Three drift-guard assertions re-golded `[2..7]`/`7` → `[2..8]`/`8`; new
`test_migration_008_additive_and_idempotent`.

### Edit — `build/_verify/assemble_and_test.py`
MAP entries for `runtime.py`, `migration_008_session_progress.py`, `test_sprint5.py`; `tests.test_sprint5`
added to the suite list.

### Edit — documentation
`SERVER_BUILD_PLAN_V1.md` §5.2 (migration-numbering note: 007 = bodyweight, 008 = session_progress) and §7
(set path → `SessionRuntime`, deferred-complete variant); `WAVE_2_EXECUTION_CHECKLIST.md` B3 ("landed
ahead of the web shell").

---

## 3. Files changed

**New source (snapshots under `implementation/sprint5/`):** `migration_008_session_progress.py`,
`runtime.py`, `test_sprint5.py`.
**Edited source:** `sprint3b2/session.py` (extract `compose_and_open`), `sprint1/schema.py`
(`session_progress`), `wave1/migrations_runner.py` (register 008, v8), `wave1/test_wave1.py` (re-gold + new
test), `build/_verify/assemble_and_test.py` (MAP + suite).
**Documentation:** `docs/architecture/SERVER_BUILD_PLAN_V1.md`,
`reviews/implementation/WAVE_2_EXECUTION_CHECKLIST.md`; `DX-11_EXECUTION_PACKAGE.md`; this report.

**Unchanged (deliberately):** ① core math; `pipeline.py` (the learning chain — the runtime *calls* it
unchanged); `evidence.py`/`state_update.py`/`decision.py`/`recommendation.py`/`composition.py`; all model
schema **meaning** (only an additive infra table added); `service.py` / `SessionEngine` behavior (only the
additive `compose_and_open` extraction).

**Regenerated:** `build/_assembled/` (re-assembled from the snapshots).

---

## 4. Acceptance checklist (from the Execution Package §8)

- [x] migration_008 created (`VERSION=8`, `_NEW_TABLES`), additive + idempotent; `session_progress` in `schema.py`; runner registers it (`SCHEMA_VERSION==8`).
- [x] `compose_and_open` extracted; `run_session` calls it; sprint3b2 suite unchanged-green (26/26).
- [x] `SessionProgressRepository` + `SessionRuntime` added; accumulator logic mirrors `_CapMemory` exactly; `week`/`govern=False` pinned; `complete_block` once per cap in priority order.
- [x] **Differential gate green** — event-driven replay == `SessionEngine` bit-for-bit (probe: 3 caps / 6 blocks / 20 set reports; systemic fatigue identical).
- [x] `actual_weight` carried — a +10 kg deviation set learns at the logged load through the event path.
- [x] Accumulator persists across independent requests (R2: once-per-cap; `consecutive_* ≤ 1`).
- [x] Wave-1 drift-guard re-golded to v8; migration_008 test green.
- [x] assembler MAP + suite list updated; `assemble_and_test.py` green; per-suite counts reported (§0).
- [x] ① core, model schema meaning, DX-01/02/20 + DX-03/04 behavior untouched.
- [x] Docs updated (`SERVER_BUILD_PLAN_V1.md`, `WAVE_2_EXECUTION_CHECKLIST.md`).

---

## 5. Verification method & evidence

- **Baseline (pre-change):** `python build/_verify/assemble_and_test.py` → `139/139 passed`.
- **After DX-11:** `143/143 passed` (per-suite in §0). Sprint 0–4 + M1 suites green and unchanged; sprint3b2
  unchanged at 26 (the `compose_and_open` extraction is behavior-preserving).
- **Differential-replay gate (the acceptance criterion, review §7) — genuine, multi-slot:** steady-state
  athlete, **6 blocks / 3 capabilities / 20 event-driven `report_set` calls**; every capability's
  `score`/`confidence`/`sum_w`/`fatigue`/`var_*`/`consecutive_*`/`last_recommended_weight`/`last_decision`
  **equal** to `SessionEngine`, and **systemic fatigue identical** (`13.139186`). Order-sensitive serial
  fatigue (review §5.4, the tightest constraint) is preserved because the runtime applies sets in plan
  order, one at a time, reading/writing the same persisted state.
- **`actual_weight` carry:** a deviation set (`recommended + 10`) is stored on `set_record.actual_weight`
  **and** `observation.actual_weight`, and `score_after != score_before` — the logged load reaches the
  chain (M1/DX-01) over the event path.
- **R2 across requests:** reporting every set as a separate transaction then `complete_session` leaves
  `consecutive_positive/negative ≤ 1` per capability — the persisted accumulator advanced the governor once
  per capability (no double-fire), proving the accumulator survived the independent requests.
- **Migration hygiene:** fresh DB stamps `[2..8]`; runner applies `[2..8]` and is idempotent; migration 008
  is additive + idempotent; drift guard confirms `session_progress` in both `schema.py` and the chain.

---

## 6. Out of scope / explicitly not done (owned by other DX / Wave-2 batches)

- **FastAPI web shell, routing, Pydantic DTOs** (BB-14) — **not built.** DX-11 is the primitive the handlers
  call.
- **Idempotency / `client_event_id` dedup + conn-atomicity** (BB-1; review §5.5/§5.6) — the optional `conn`
  parameter joining the accumulator write to the set transaction is the **idempotency batch**, not DX-11;
  here `report_set` uses the pipeline's own per-set transaction + a separate accumulator transaction
  (same risk profile as `SessionEngine`'s in-process `_CapMemory` update).
- **Auth / per-token authz / no-IDOR** (BB-19), **connection-per-request / write serialization** (BB-9),
  **A8/A9/A1/A3 instruments in-path** (BB-10), **A7 gate** (BB-11) — later Wave-2 batches.
- **DX-12** (Phase-0 instrumentation/gate repoint) — separate, depends on DX-19.
- **① core math / model schema meaning** — untouched.

---

## 7. DX-11 Definition-of-Done

- [x] The device-driven set-report path exists as a tested primitive (`SessionRuntime`) carrying the M1 `(actual_weight, actual_reps)` pair through the unchanged learning chain.
- [x] The per-capability decision-memory accumulator is **persisted** (`session_progress`, migration 008, v8) and advances the governor **once per capability** at session close (R2), deferred + priority-ordered (review §5.1).
- [x] Event-driven replay is **bit-for-bit** with `SessionEngine` (the differential gate, review §7) — score, confidence, sum_w, fatigue, variance, decision memory, systemic fatigue.
- [x] Additive only: ① core, the pipeline, and all model schema **meaning** unchanged; `SessionEngine` behavior preserved (verified `compose_and_open` extraction); fresh == migrated at v8.
- [x] Suite green at **143/143**; the only moved goldens are the 3 intended Wave-1 version assertions, each documented.

**DX-11 is closed.** The set-report endpoint primitive + `session_progress` accumulator are implemented,
validated, and documented. The remaining Sprint-5 work is the HTTP/auth/idempotency shell that wraps this
primitive.

---

## 8. Recommended next step (not executed)

Per the user's sequence, proceed to **DX-09 / M5 stagnation detection** (Delta Plan P1, Large; depends on
DX-01/DX-02 ✅). The web-shell batches (BB-1/9/14/19) that wrap this DX-11 primitive remain the broader
Wave-2 backend effort and are not part of the Delta-Plan DX items.

---

*Completion report only. Implementation strictly within DX-11 as scoped; no web/auth/idempotency shell, no
① core-math change, no model schema-meaning change, no redesign. Verified at 143/143 with the bit-for-bit
differential-replay gate. Traceability: `DX-11_EXECUTION_PACKAGE.md` · `SESSION_RUNTIME_TRANSITION_REVIEW.md`
§2/§5/§7 · `SERVER_BUILD_PLAN_V1.md` §7 · `HUSH_V1_DELTA_EXECUTION_PLAN.md` (DX-11) · M1 (DX-01/05).*
