# OD-2 — Right-to-Erasure (logical deletion / anonymization) — Completion Report

Date: 2026-06-12
Owner: Backend (server mechanism); Operations (external enrollment-record complement — BB-33)
Status: **Server mechanism COMPLETE**
Gate: `python build/_verify/assemble_and_test.py` → **model golden 189/189 + API pytest 75 → PASS**

---

## 1. The ratified decision

OD-2 (ratified 2026-06-12) resolves the immutable-audit-vs-erasure tension as **logical deletion /
anonymization**:

- Personal identity, authentication data, and user-linked identifiers are **removed**.
- Audit/system-history records **may be retained in anonymized form** for operational, reconstruction,
  and validation purposes.
- Retained audit records must be **non-identifiable** and must not allow reconstruction of the deleted
  user's identity.
- **No destructive audit-chain deletion** in V1.

This tranche builds the **server-side erasure mechanism** that implements it over the frozen model's
append-only schema.

## 2. As-built

**`HushService.erase_athlete(athlete_id)`** (`implementation/sprint1/service.py`) — atomic, in one
transaction:

1. **delete** the athlete's `auth_token` rows — authentication data removed (the token now
   authenticates to nothing → 401);
2. **delete** the athlete's `idempotency_key` rows — transient user-linked anti-replay records;
3. **null the precise identifiers** on the retained `athlete` row — exact `age` → 0, `bodyweight_kg`
   → NULL — while **keeping the coarse cohort labels `sex` / `experience`** (the A7 seed-safety
   validation is segmented by them, and on their own they are not a unique identifier) and `created_at`
   (the retention basis);
4. **write an `erasure_record` tombstone** (`athlete_id`, `erased_at`, `method=logical_anonymization`)
   — durable, auditable proof the erasure happened.

The append-only history (`observation` / `evidence` / `state_update_log` / `recommendation` /
`workout_session` / `capability_state`) is **untouched** — anonymized by the removal of the precise
identifiers and the auth link, not destroyed. The retained `athlete_id` is an opaque pseudonym whose
link to the real person lived in the auth token (now deleted) and the external enrollment/consent
record (deleted by Operations as the BB-33 complement — outside this DB). Idempotent: re-erasing an
already-erased athlete re-stamps the tombstone and removes nothing further.

**`POST /internal/athletes/{id}/erase`** (`implementation/api/internal/operator.py`) — operator-key
only, write-serialized; 404 on an unknown athlete; returns the removal summary.

**Schema:** new additive infra table `erasure_record` via **migration 011** (`migration_011_erasure.py`,
same thin idempotent shape as 010), mirrored into `SCHEMA_SQL`, registered in the single ordered runner.
**Schema v10 → v11.** No model number/formula/decision/behaviour change; empty until the first erasure,
so every prior trajectory reproduces bit-for-bit.

## 3. Why this anonymization is defensible (and where the boundary is)

- **Removed:** the two things that re-link the pseudonym to a person inside this DB — the auth token and
  the precise body metrics (exact age, bodyweight). KL-16 flagged the diversity-tailored micro-cohort as
  re-identifiable from precise demographics; nulling exact age + bodyweight removes that within-DB vector.
- **Retained (deliberately):** the coarse cohort labels `sex`/`experience`, because the decision
  explicitly permits retaining anonymized history **for validation**, and A7 — the Phase-1 hard gate — is
  cohort-segmented by exactly those labels. Destroying them would defeat the retained data's purpose.
- **Assumption (documented):** the anonymization holds only if enrollment assigns an **opaque
  athlete_id** (not derived from name/email). The contract already says the server never trusts a
  client-supplied id; enrollment must assign a random opaque id (an enrollment-runbook rule, BB-33).
- **Operations complement (not code-completable here):** deleting the external enrollment/consent record
  that maps athlete_id → person, alongside this server call (BB-33). The server mechanism exposes the
  hook; the cross-system orchestration is Operations.

## 4. Tests — `implementation/api/test_api_erasure.py` (+8) and `test_wave1.py` (+1)

- `test_erase_requires_operator_key` — athlete token → 401; operator key → 200.
- `test_erase_unknown_athlete_404` — erasing a non-enrolled athlete → 404.
- `test_erase_removes_auth_and_blocks_further_use` — the bearer token works before, and authenticates to
  nothing (401) after, erasure; `tokens_removed ≥ 1`.
- `test_erase_removes_idempotency_keys` — the athlete's idempotency rows go to zero.
- `test_erase_redacts_precise_identifiers_keeps_cohort_labels` — after erasure: `age == 0`,
  `bodyweight_kg is None`, **`sex`/`experience` retained**, `created_at` retained, row present.
- `test_erase_retains_audit_history` — `observation` / `capability_state` / `state_update_log` counts
  **unchanged**, and `GET /internal/audit/sessions/{id}` still reconstructs (no destructive deletion).
- `test_erase_writes_tombstone` — `erasure_record` row with `method=logical_anonymization` + `erased_at`.
- `test_erase_is_idempotent` — second erase still 200, `tokens_removed == 0`.
- `test_migration_011_additive_and_idempotent` (Wave-1) — `erasure_record` created, version stamped 11,
  second apply is a no-op.

## 5. Files

- **New:** `implementation/api/migration_011_erasure.py`, `implementation/api/test_api_erasure.py`.
- **Edited:** `implementation/sprint1/service.py` (`erase_athlete` + `is_erased`),
  `implementation/sprint1/schema.py` (`erasure_record`), `implementation/wave1/migrations_runner.py`
  (register 011), `implementation/api/internal/operator.py` (erase endpoint),
  `implementation/wave1/test_wave1.py` (v11 re-gold + migration 011 test),
  `implementation/api/test_api_migrate.py` (BB-5 interior-gap test updated for the v11 head),
  `build/_verify/assemble_and_test.py` (MAP + test wiring).

**Verification:** `python build/_verify/assemble_and_test.py` → `OVERALL: model 189/189 + API pytest
rc=0 -> PASS`. Suite total **264** (model 189 + API 75); schema **v11**.
