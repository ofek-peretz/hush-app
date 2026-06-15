# VERSIONING_POLICY_V1.md — When to Bump Each Version Identifier (ATD-19)

> **What this document is.** The policy for the four independent version identifiers Hush v1 stamps —
> `MODEL_VERSION`, `CAPABILITY_MODEL_VERSION`, `CATALOG_VERSION`, `SCHEMA_VERSION` — defining **when each
> bumps, who may bump it, and what it implies**. It closes **ATD-19** (versioning policy undocumented). It
> records existing discipline; it changes **no** value and **no** behavior. Governing rule: *no redesign
> without explicit model review* — and a version bump on a frozen model is, by definition, the output of
> such a review, never a casual edit.
>
> Date: 2026-06-12 · Source: `constants.py` (`MODEL_VERSION="v1.0.0"`, `CAPABILITY_MODEL_VERSION="es008v2"`),
> `catalog.py` (`CATALOG.version = CAPABILITY_MODEL_VERSION`), `migrations/runner.py` (`SCHEMA_VERSION=11`).
> Anchors: `SERVER_ARCHITECTURE_ASBUILT_V1.md` §5, `MIGRATION_RUNBOOK_V1.md`, BB-4 (version stamping).

---

## 1. The four identifiers

| Identifier | Lives in | Current | Stamped on | Meaning |
|---|---|---|---|---|
| `MODEL_VERSION` | `constants.py` | `v1.0.0` | `observation`, `evidence`, `recommendation`, `state_update_log` | The **learning/decision model** as a whole — the prediction → evidence → state-update math + decision logic. |
| `CAPABILITY_MODEL_VERSION` | `constants.py` | `es008v2` | `evidence`, `recommendation` (+ ties the catalog) | The **capability/seeding model** (ES-008 v2): how a fresh athlete is seeded and how capability is parameterized. |
| `CATALOG_VERSION` | `catalog.py` (= `CAPABILITY_MODEL_VERSION`) | `es008v2` | composed sessions (`catalog_version` on `GET /sessions/today`, BB-4) | The **exercise catalog** (the Class-A exercise set + difficulty factors). **Version-tied to the capability model.** |
| `SCHEMA_VERSION` | `migrations/runner.py` | `11` | `schema_version` table (every applied step + fresh-DB full chain) | The **database schema** head. Independent of the model versions. |

These are **independent axes** — a schema migration that adds an infra table (e.g. `auth_token`, v10)
bumps `SCHEMA_VERSION` and **nothing else**; a re-anchored seed bumps `CAPABILITY_MODEL_VERSION` and
(because they are tied) `CATALOG_VERSION`, but need not touch `SCHEMA_VERSION`.

---

## 2. Bump policy

### `SCHEMA_VERSION` (Backend — routine, additive)
Bump **whenever the migration chain grows**: add a new `migration_0NN_*.py` with the next `VERSION`,
register it in the runner's `MIGRATIONS` (the single source of truth), and the head moves to it.
- **Constraints:** additive-only, idempotent, self-guarded, and the `SCHEMA_SQL` drift guard must stay
  green (a fresh DB and a migrated DB must end identical — ATD-8). No down-migration (MG3).
- **Implies:** a production migration event — backup-gated (`migrate_production`), per the deploy runbook.
- This is the only version that bumps in normal backend work; it carries **no model meaning**.

### `MODEL_VERSION` (Model — gated, rare)
Bump **only** when the learning/decision math or decision logic changes in a way that makes new rows
**not comparable** to old rows under the same number: a changed update rule, a changed decision gate, a
changed prediction formula, or **any adoption of a currently-provisional parameter** (κ, τ, σ²_ref, the
gates/deadbands — KL-9). Use semantic versioning on the `vX.Y.Z` string (patch = bit-compatible fix,
minor = additive-compatible, major = breaking comparability).
- **Requires:** an explicit model review (the governing rule) **and** a golden-test re-baseline (the
  bit-for-bit goldens will, by design, change — ATD-2). You never bump `MODEL_VERSION` to *make a test
  pass*; the review authorizes the change, the re-gold records it.
- **Never field-tuned:** a live incident does **not** bump this. The A7 abort path is re-anchor (below),
  not a parameter tweak (KL-9 / OD-8).

### `CAPABILITY_MODEL_VERSION` (Model — gated; the A7 re-anchor axis)
Bump when the **seeding / capability model** changes — most importantly, the sanctioned **A7
`PAUSE_AND_REANCHOR` response**: re-anchoring ES-008 v2 for a failing cohort tail produces a new
capability-model version (e.g. `es008v3`). Also any change to capability parameterization that changes how
seeds/scores are produced.
- **Requires:** an explicit model review (re-anchor is a deliberate model change, INCIDENT_RUNBOOK §5).
- **Forces a `CATALOG_VERSION` bump** because the catalog is tied to it (next item).

### `CATALOG_VERSION` (Model — tied to capability model)
**Tied to `CAPABILITY_MODEL_VERSION` by construction** (`CATALOG.version = CAPABILITY_MODEL_VERSION`). Bump
when the exercise catalog changes — the Class-A exercise set, an exercise's `difficulty_factor`, or
selection metadata — **and** when the capability model is re-anchored. Because the equipment→catalog
coverage harness (`sim/equipment_coverage.py`) is regression-locked to the current catalog, a catalog
change is a `catalog_version`/model-version event that re-runs that coverage gate, not a silent edit.
- **V1 scope reminder:** V1 is gym-based (barbell always present → complete Class-A coverage). Catalog
  *expansion* for non-gym setups is **out of scope** (no equipment-aware composition work) — so the
  routine reason to touch the catalog in V1 is a re-anchor, not new equipment.

---

## 3. Why they are stamped (the BB-4 payoff)

Every history row carries the version(s) under which it was produced, so the audit chain stays
interpretable across a model change: when you reconstruct a session (`reconstruct_session`), you can see
*which* model produced each recommendation/observation/evidence/state-update, and a re-anchor (new
`CAPABILITY_MODEL_VERSION`) is visible as a clean before/after boundary in the data rather than a silent
discontinuity. This is what makes the validation evidence (A7/A8/A9) attributable to a specific model
generation — the precondition for ever adopting a provisional parameter (KL-9/KL-10).

---

## 4. Quick reference

| Change you are making | Bump |
|---|---|
| Add an infra/projection table or column (additive migration) | `SCHEMA_VERSION` only |
| Change a learning/decision formula or **adopt a provisional parameter** | `MODEL_VERSION` (+ re-gold; model review) |
| Re-anchor seeding after an A7 hard stop | `CAPABILITY_MODEL_VERSION` (+ `CATALOG_VERSION`; model review) |
| Edit the exercise catalog / a difficulty factor | `CATALOG_VERSION` (+ coverage gate; usually with a capability bump) |
| Fix a bug with **no** behavioral/numeric change | nothing (the goldens prove no change) |

---

*Versioning policy only — it records discipline and changes no value. For the schema/runner see
`SCHEMA_REFERENCE_V1.md` + `MIGRATION_RUNBOOK_V1.md`; for the frozen model `HUSH_V1_EXECUTION_CONTEXT.md`;
for the A7 re-anchor procedure `INCIDENT_RUNBOOK_V1.md` §5; for the registry
`docs/canonical/HUSH_V1_OPEN_ITEMS.md`.*
