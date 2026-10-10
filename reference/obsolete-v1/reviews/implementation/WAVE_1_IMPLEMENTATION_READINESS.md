# WAVE_1_IMPLEMENTATION_READINESS.md — Classification & Readiness

> **Classification-only readiness assessment** of the seven Wave-1 items in
> `reviews/implementation/WAVE_1_EXECUTION_CHECKLIST.md`. For each item it classifies the work
> (documentation-only / decision-only / implementation), names the **exact files** that would change, and
> marks whether the change touches **model behavior / schema / migrations / tests / runtime behavior**.
> It then judges whether Wave 1 is ready to execute and which items need a confirmation before coding
> begins. **It implements nothing, redesigns nothing, and creates no new work** — every item and
> deliverable is already defined in the checklist, the registry (`HUSH_V1_OPEN_ITEMS.md`), and the audit
> (`ARCHITECTURAL_AUDIT_HUSH_V1.md` §11). Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-10 · Build: Sprint 0–4 ✅ (125 tests, schema v6) · Model/UX/Architecture: frozen.

---

## 0. Verdict (read first)

**Wave 1 is ready to execute.** All seven items are low-risk by construction: **3 are documentation-only,
1 is decision-only, and 3 are implementation — but the three implementation items are bookkeeping /
enforcement hygiene that, by their own acceptance rule, may not move any number, formula, column meaning,
or recorded trajectory** (the 125-test golden suite + the fresh-vs-migrated parity test are the
backstop). **No Wave-1 item touches the pure model package or `constants.py`; none changes request-time
(athlete-facing) runtime behavior.**

Three small **pre-coding confirmations** are required — none is a *model* review (no behavior moves):

1. **OD-1 must be ratified** (it is a decision = a review by nature): cross-functional sign-off
   (Product + Mobile + Backend) plus the facility-connectivity check. It does not block the Wave-1 doc
   work, but it is the one item that *is* a review and it gates Wave 2.
2. **ATD-8 must be scope-bounded** to the **assert/compare** form (a check that `SCHEMA_SQL` and the
   migration-chain end-state agree), **not** the heavier "derive migrations from schema" form — the
   latter would edit migration files and risk behavior, which is out of Wave 1.
3. **ATD-12 needs a placement decision** (stamp `schema_version` in `schema.py`'s `SCHEMA_SQL` vs in
   `db.py` at init) and a single source for "current version = 6", and must be sequenced **after ATD-13**
   so fresh-vs-migrated parity is re-confirmed against the runner.

None of these requires un-freezing the model; they are scoping confirmations, not redesigns.

---

## 1. As-built facts the classification rests on

So the "exact files" and "impact" columns are grounded, not guessed:

- **Source of truth is the per-sprint snapshots** in `implementation/sprintN/`. The runnable package in
  `build/_assembled/` is **generated** by `build/_verify/assemble_and_test.py`. **Every code edit below is
  made in `implementation/sprintN/…` and re-assembled; `build/_assembled/…` is never edited directly**
  (it is output). This is itself the subject of ATD-16.
- **Fresh-DB path:** `implementation/sprint1/db.py` → `Database.__init__` runs `executescript(SCHEMA_SQL)`
  from `implementation/sprint1/schema.py`. It **does not run migrations and does not insert a
  `schema_version` row** (the MG1/ATD-12 gap, confirmed in `db.py:22-29`).
- **Migrations:** five standalone files `implementation/sprint{2,3a,3b1,3b2,4}/migration_00{2..6}_*.py`,
  each self-contained (`apply()` / `already_applied()`, each `CREATE TABLE IF NOT EXISTS schema_version`,
  each `INSERT OR REPLACE` its own `VERSION`, each `commit()`). **No file composes them in order** — a
  whole-tree search for a runner returns nothing (the MG2/ATD-13 gap). Migrations are the **prod/existing-DB
  path only**; the fresh-DB path never touches them.
- **Tests:** `implementation/sprintN/test_sprintN.py` (the migration/fresh-vs-migrated parity tests live in
  `test_sprint2.py` and are re-exercised in later sprint tests).
- **Build Plan §9** is a binary doc: `docs/architecture/Hush v1 Technical Build Plan.docx` (relevant to
  OD-1 only).

---

## 2. Classification summary

Impact axes: **MB** model behavior · **SC** schema (shape) · **MG** migrations · **TS** tests ·
**RT** runtime behavior. (`✗` none · `△` touched but non-behavioral/ops-only · `✓` changed.)

| # | ID | Class | Exact files that would change | MB | SC | MG | TS | RT | Needs review before impl? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **OD-1** | **Decision-only** | `reviews/decisions/D1_THIN_CLIENT_VS_LOCAL_FIRST.md`; `docs/canonical/HUSH_V1_OPEN_ITEMS.md`; **if Option B:** `docs/architecture/Hush v1 Technical Build Plan.docx` (§9) + any canonical doc quoting the thin-client wording | ✗ | ✗ | ✗ | ✗ | ✗ | **Yes — it *is* the review** (cross-functional sign-off + facility check) |
| 2 | **ATD-13** | **Implementation** (new orchestration) | **NEW** runner file `implementation/sprint4/migrations_runner.py` (conceptual `hush_model/persistence/migrations/runner.py`); `build/_verify/assemble_and_test.py` (teach it the new file); **NEW** test in `implementation/sprint4/test_sprint4.py` | ✗ | ✗ | △ (orders existing migrations; no migration logic changed) | ✓ | △ (migration-invocation path only; ops-time, not request-time) | Minor — confirm assembly still yields 125 green |
| 3 | **ATD-12** | **Implementation** (one-line bookkeeping) | `implementation/sprint1/schema.py` **or** `implementation/sprint1/db.py` (stamp `schema_version`); **NEW** guard test in `implementation/sprint1/test_sprint1.py` | ✗ | △ (table *contents*, not shape) | △ (must agree with `already_applied`) | ✓ | △ (DB-init/startup path, not request-time) | **Yes — placement + version-source decision; sequence after ATD-13** |
| 4 | **ATD-8** | **Implementation** (assertion/guard) | **NEW** parity/drift check (test in `implementation/sprint?/test_*.py` or a check in `build/_verify/assemble_and_test.py`); **no edits expected** to `schema.py`/migration files (they agree today) | ✗ | ✗ | ✗ (asserts end-state) | ✓ | ✗ (build/test-time only) | **Yes — bound to assert/compare form, not derive form** |
| 5 | **ATD-15** | **Documentation-only** | **NEW** doc, e.g. `docs/architecture/SERVER_ARCHITECTURE_ASBUILT_V1.md` | ✗ | ✗ | ✗ | ✗ | ✗ | No (accuracy review only; reflects OD-1 outcome) |
| 6 | **ATD-16** | **Documentation-only** | **NEW** doc, e.g. `docs/DEVELOPMENT_WORKFLOW.md` (describes `assemble_and_test.py` loop) | ✗ | ✗ | ✗ | ✗ | ✗ | No |
| 7 | **ATD-18** | **Documentation-only** | **NEW** doc, e.g. `docs/architecture/MIGRATION_RUNBOOK_V1.md` (+ shared invariant matrix with ATD-15) | ✗ | ✗ | ✗ | ✗ | ✗ | No (Operations sign-off; reflects ATD-13 runner) |

**Tally:** Documentation-only **3** (ATD-15/16/18) · Decision-only **1** (OD-1) · Implementation **3**
(ATD-13/12/8). Items touching **model behavior: 0**. Touching **schema shape: 0** (ATD-12 touches table
*contents*; no column added/renamed/re-meant). Touching **request-time runtime: 0**.

---

## 3. Per-item classification detail

### OD-1 — Decision-only
- **Class:** decision. No code is written; the deliverable is a ratified choice (Option A or B) recorded
  in the D1 doc, the registry row closed, and — only if B — the Build Plan §9 `.docx` amended.
- **Files:** the three listed; all documents. No `.py`, no schema, no migration, no test.
- **Impact:** none on MB/SC/MG/TS/RT. It **gates** future runtime work (BB-9 connection model, BB-15 app)
  but changes no executing code now.
- **Review:** this item **is** a review/decision act — it requires the cross-functional sign-off and the
  §8 facility-connectivity sanity-check the D1 doc already names as a precondition for choosing B. Flag it
  as the one Wave-1 item whose completion is a *decision gate*, not an engineering task.

### ATD-13 — Implementation (new orchestration file)
- **Class:** implementation — but **orchestration only**: a thin runner composing the five existing
  migrations `002→006` in order, each still guarded by its own unchanged `already_applied`. **No migration's
  SQL changes.**
- **Files:** a **new** runner snapshot under `implementation/` (conceptual
  `hush_model/persistence/migrations/runner.py`); `build/_verify/assemble_and_test.py` to include it in the
  generated tree; a new test asserting ordered, idempotent application.
- **Impact:** MB ✗ · SC ✗ · MG △ (composes, does not alter) · TS ✓ (new test) · RT △ — affects only the
  **migration-invocation path** (an operator/startup action for existing DBs), never the athlete request
  path, and never the fresh-DB path (which builds from `SCHEMA_SQL`).
- **Review:** minor — confirm the assembly change leaves the 125-test run green; no model review.

### ATD-12 — Implementation (one-line bookkeeping)
- **Class:** implementation — a single insert so a fresh v6 DB records its version.
- **Files:** **either** `schema.py` (add an `INSERT INTO schema_version …` to `SCHEMA_SQL`) **or** `db.py`
  (stamp after `executescript`, using `now_iso()` for `applied_at`); plus a guard test. The choice is a
  small engineering decision (the `applied_at` timestamp is awkward inside a static `SCHEMA_SQL` string,
  which slightly favors `db.py`) — **call it before coding.**
- **Impact:** MB ✗ · SC △ (writes a row into the already-existing `schema_version`; **no shape change**) ·
  MG △ (the stamped version must make the ATD-13 runner read a fresh DB as fully-applied) · TS ✓ · RT △
  (DB-init/startup only).
- **Review:** **yes (light).** Two confirmations: (a) where to stamp + a single source for "current
  version = 6"; (b) **sequence after ATD-13** and re-run the fresh-vs-migrated parity test so both paths
  provably converge to identical shape *and* version. No behavior moves.

### ATD-8 — Implementation (assertion/guard)
- **Class:** implementation — a check that makes the `SCHEMA_SQL` vs migration-chain agreement
  **structural** instead of hand-maintained.
- **Files:** a **new** comparison/parity check (a test, or a guard in `assemble_and_test.py`). It should
  **not** edit `schema.py` or the migration files — they agree on the current tree (the existing parity
  test passes), so the deliverable is the *guard*, not a fix.
- **Impact:** MB ✗ · SC ✗ · MG ✗ · TS ✓ · RT ✗ (build/test-time only).
- **Review:** **yes (scope boundary).** The audit's §11 remediation has two forms; Wave 1 is the
  **assert/compare** form only. The **derive-migrations-from-`SCHEMA_SQL`** form would modify migration
  files and could alter output — **out of Wave 1**; flag if anyone reaches for it.

### ATD-15 / ATD-16 / ATD-18 — Documentation-only
- **Class:** documentation. Each is a **new** Markdown file; no code, schema, migration, test, or runtime
  touched.
- **Files:** the three new docs listed in §2. ATD-15 and ATD-18 **share one invariant-enforcement matrix**
  (single authoritative copy).
- **Impact:** none on any axis.
- **Review:** accuracy-only, by the consuming owner (API engineer for ATD-15; a fresh engineer for ATD-16;
  Operations for ATD-18). Soft sequencing: ATD-15's connection/transaction section should reflect the
  **OD-1** outcome, and ATD-18 should describe the **ATD-13** runner — so both finalize *after* those land,
  though both can be drafted in parallel.

---

## 4. Risk & blast-radius notes

- **The golden/parity backstop covers the three code items.** ATD-8/12/13 are accepted only if the 125
  tests stay green and the fresh-vs-migrated parity test holds. Because none adds/renames/re-means a column
  or alters migration SQL, a passing suite is strong evidence nothing moved.
- **The fresh-DB and prod-DB paths are separate**, which shrinks blast radius: ATD-13 (runner) and the
  prod side of ATD-12 affect only the **existing-DB migration path** (the Wave-2 BB-5 concern). The
  fresh-DB path (every test DB) changes only by the single ATD-12 version stamp.
- **Request-time behavior is untouched by all seven items.** No file in the learning chain
  (`pipeline.py`, `repositories.py` write methods, `recommendation.py`, `state_update.py`, `domain.py`,
  `constants.py`) is edited. The athlete-facing runtime is out of Wave-1's reach entirely.
- **`build/_assembled/` must not be hand-edited.** All edits land in `implementation/sprintN/` and are
  regenerated; editing the generated tree is the failure mode ATD-16 exists to prevent.

---

## 5. What Wave 1 explicitly does NOT touch (confirming "no redesign / no new work")

- **No change to the pure model package or `constants.py`** — no number, formula, A_c, version string, or
  decision threshold.
- **No new column, table, or schema shape** (ATD-12 writes a row into an existing table; that is all).
- **No change to any migration's SQL** (ATD-13 orders them; ATD-8 asserts about them).
- **No request-path / athlete-facing runtime change.**
- **No new product scope, endpoint, or feature** — the API (BB-14), app (BB-15), and the runnable-tree
  assembly (BB-13) are **Wave 2**, deliberately excluded.

---

## 6. Readiness conclusion

| Question | Answer |
|---|---|
| Is Wave 1 ready for execution? | **Yes.** |
| Any item blocked on model review? | **No** — no item moves model behavior. |
| Any item requiring a decision before coding? | **OD-1** (the decision itself), **ATD-8** (form boundary), **ATD-12** (stamp placement + sequence after ATD-13). |
| Items that can start immediately, zero gating? | **ATD-15, ATD-16** (docs); **ATD-13** (runner). |
| Items to start after a dependency lands? | **ATD-12** (after ATD-13); **ATD-8** (after ATD-13 gives a defined chain end-state); **ATD-18** (after ATD-13); **ATD-15** connection section (after OD-1). |

**Recommended green-light:** begin ATD-15/ATD-16/ATD-13 and the OD-1 decision track on day one; take the
two scope confirmations (ATD-8 form, ATD-12 placement) before those two are coded; finalize ATD-12/ATD-8/
ATD-18 and the ATD-15 connection section as their upstreams land. The Wave-1 Definition-of-Done in the
checklist §0 remains the gate to Wave 2.

---

*Classification and readiness only — nothing implemented, nothing redesigned, no new work. Every item
traces to `WAVE_1_EXECUTION_CHECKLIST.md`, `HUSH_V1_OPEN_ITEMS.md`, and `ARCHITECTURAL_AUDIT_HUSH_V1.md`
§11 / `D1_THIN_CLIENT_VS_LOCAL_FIRST.md`. As-built file facts verified against `db.py`, `schema.py`, and
the `migration_00{2..6}` files at close of Sprint 4.*
