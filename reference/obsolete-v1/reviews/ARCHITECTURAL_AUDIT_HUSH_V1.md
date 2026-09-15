# Architectural Audit — Hush v1 (as-built)

> **════ SUPERSEDED-FRAMING NOTE — DX-17 (2026-06-12) ════**
> "As-built" here means **close of Sprint 4** (schema v6, 125 tests). The build has since advanced through
> Wave 1, DX-07/04/03, **M1**, **DX-11**, and **DX-09 (M5)** — now **schema v9, 156/156 tests**, with the
> model **advisory** (ES-006 governor advisory; `actual_weight` a learning input) and the **active
> investigation engine (ES-013) retired → detection = M5**. For the current as-built picture defer to
> `HUSH_V1_PROJECT_STATUS.md` and `SERVER_ARCHITECTURE_ASBUILT_V1.md`.

> Complete architectural audit of the Hush v1 codebase **as it exists today** (close of Sprint 4).
> The goal is **not** beta readiness; it is to understand the **long-term engineering health** of the
> system. The model, UX/UI, and architecture are treated as **frozen** — this audit **does not
> redesign anything and proposes no product features**. It identifies technical debt, maintainability
> risks, schema/migration risks, testing blind spots, operational complexity, long-term production
> risks, documentation gaps, and the places where future change is disproportionately expensive.
> Remediations noted are non-structural hygiene/enforcement/documentation only — **none alter the
> frozen model's numeric behavior.** Governing rule respected: *no redesign without explicit model
> review.*
>
> Date: 2026-06-10 · Build: Sprint 0–4 ✅ (125 tests, schema v6) · Model: Hush v1 (frozen) ·
> Examined: `implementation/sprint{0,1,2,3a,3b1,3b2,4}/` (~7k LOC), `build/_assembled/`,
> `build/_verify/assemble_and_test.py`, schema/migrations/repositories/pipeline/service, `constants.py`.

> **OVERALL VERDICT — HEALTHY MODEL CORE, FRAGILE SHELL, AND A REFACTOR-RESISTANT WHOLE.** The pure
> model package is genuinely high-quality: single-source constants, exhaustive golden/round-trip
> tests, clean pure-vs-IO separation, additive-migration discipline, and a well-conceived audit chain.
> The risks are concentrated in the **transition from "a validated single-process simulation artifact"
> to "a long-lived, concurrently-accessed production service"**, and in **three structural properties
> that make the codebase resist the very changes its roadmap requires**: (1) the source of truth is a
> set of per-sprint *snapshots* assembled by a script, not a coherent package; (2) the same exhaustive
> golden tests that make the model safe make it **bit-for-bit refactor-resistant**; and (3) the system's
> load-bearing invariants (immutable history, single writer) are enforced **by convention and
> individual tests, not by the storage layer**. None of these is a defect *today* at 100-user sim
> scale — but each compounds as the model un-freezes (parameter adoption, Class-B, Investigation,
> Trust) and as the code meets real concurrency. This audit names them while they are still cheap to
> address.

---

## 0. Executive summary

**What is healthy (and should be protected):**
- A **pure, deterministic model package** with a single-source-of-truth `constants.py` imported
  everywhere — the math has one home and one set of numbers (ES-005.1/008v2 traceable).
- **Exhaustive golden-value + round-trip + property tests** (125), near-total on the model.
- **Clean separation** of pure model (no I/O) from persistence (the IO shell), reused verbatim by the
  simulation harness — so the sim tests the real model.
- A **deliberate audit-chain design** (Set→Observation→Evidence→StateUpdate, version-stamped) and a
  **single-writer concept** (`StateRepository`) — the right invariants are *identified*.
- **Additive, idempotent migrations** with explicit fresh-vs-migrated parity tests.

**The five structural risks that define long-term health:**
1. **Snapshot-and-assemble source model** — the runnable package exists only after
   `assemble_and_test.py` stitches flat per-sprint files into `hush_model/...`; the real layout lives
   in `CONCEPTUAL LOCATION:` comments. (Maintainability, onboarding, build reproducibility.)
2. **Bit-for-bit golden-test coupling** — the safety mechanism is also a rigidity mechanism: any
   structural cleanup changes byte output and forces re-baselining 100+ tests, so cleanups are
   deferred indefinitely and debt compounds. (Refactor-resistance.)
3. **Invariants enforced by convention, not storage** — immutable history and single-writer rest on
   discipline + individual tests; the DB itself permits violation, and history-status UPDATEs already
   exist. (Audit-integrity erosion over time.)
4. **Single shared SQLite connection, single-threaded by construction** — the persistence layer cannot
   serve a concurrent API as-is; productionizing concurrency is a change to a golden-locked layer.
   (The top production wall.)
5. **Dual schema source of truth + version-bookkeeping gap** — cumulative `SCHEMA_SQL` vs the migration
   chain, kept in sync by hand; a fresh DB ships with an **empty `schema_version`**, so safety rests
   entirely on migrations never ceasing to be additive+idempotent. (Migration fragility.)

The detail and a severity-rated register follow; §11 lists non-redesign remediations.

---

## 1. The architecture as-built (factual grounding)

- **Source layout:** flat per-sprint directories (`implementation/sprintN/`). Later sprints **edit
  earlier files in place** (e.g., `schema.py` lives under `sprint1/` but already carries Sprint 2–4
  columns). The package structure (`hush_model/persistence/`, `hush_model/capability/`,
  `hush_model/loop/`, `sim/`, `tests/`) is **generated** by `build/_verify/assemble_and_test.py` into
  `build/_assembled/`; files carry `CONCEPTUAL LOCATION:` comments naming where they "really" live.
- **Model package:** pure functions over value objects; `constants.py` is the single source of truth
  (`MODEL_VERSION="v1.0.0"`, `CAPABILITY_MODEL_VERSION="es008v2"`, A_c derived from landmarks, etc.).
- **Persistence:** one SQLite DB; `Database` opens **one `sqlite3.Connection`** (WAL, FK pragma) and
  runs the full cumulative `SCHEMA_SQL` on init. A `transaction()` context manager commits/rolls back.
- **Repositories:** `StateRepository` (sole mutable-state writer), `SessionRepository` +
  `LearningRepository` (history). All writes take the active connection; binding is **positional**
  across 16–20-column statements.
- **Pipeline:** two near-identical transactional learning methods — `report_set` (rested) and
  `report_set_fatigue_aware` (ES-011) — plus a shared `_record_block_decision` hook and a separate
  `complete_block` transaction for multi-set blocks.
- **Service:** thin orchestration (onboard, session lifecycle, L2 replace, audit). Audit reads are
  **raw SQL on `self.db.conn`**, outside the repositories.
- **Scale assumption:** synchronous, single-process, ~100 users; "sub-millisecond inside the request."

---

## 2. Technical debt

| ID | Finding | Evidence | Sev |
|---|---|---|---|
| **TD1** | **Two near-duplicate learning-chain methods.** `report_set` and `report_set_fatigue_aware` are ~70 lines each, identical in skeleton, diverging only in fatigue handling. The rested path is retained for bit-for-bit parity; the fatigue-aware path is the production one. Every chain change must be made twice. | `pipeline.py:101,245` | 🟠 |
| **TD2** | **Opt-in flag / default proliferation to preserve golden tests.** `govern=False`, fatigue defaults, `est_fatigue` defaults, `SetResult` defaulted fields, composition-audit columns defaulting to `None` — each a small dual path added so prior trajectories stay byte-identical. Individually cheap, cumulatively a maze of "default == old behavior." | `pipeline.py:115,258`; `SetResult:49-57` | 🟡 |
| **TD3** | **Audit reads are raw SQL in the service layer**, bypassing repositories (`reconstruct_observation`, `reconstruct_session` query `self.db.conn` directly). A second, hand-maintained query surface over the schema; a schema change must be reflected in both repos and these ad-hoc queries. | `service.py:133-185` | 🟡 |
| **TD4** | **Positional parameter binding throughout.** 16–20-column `INSERT/UPDATE` with `VALUES (?,?,…)` and hand-aligned tuples; no row-mapper/ORM. A miscount silently writes the wrong column. Mitigated only by a single round-trip test per table. | `repositories.py:55-68,133-145` | 🟠 |
| **TD5** | **`capability_state` is a god-row.** One table/dataclass carries the core projection (score/confidence/sum_w) + variance moments (ES-010 C) + decision memory (ES-006) + fatigue (ES-011). Every engine's state shares one row, one sole-writer method, and one "three-site" sync burden. | `schema.py:47-68`; `repositories._row_to_cap` | 🟡 |

**Theme:** the debt is overwhelmingly a *byproduct of the bit-for-bit parity strategy* (TD1/TD2) — an
excellent safety discipline that bills its cost as duplication and dual paths. It is acceptable debt
*today*; it becomes expensive when the model un-freezes (each new path multiplies).

---

## 3. Maintainability risks

- **MR1 — Snapshot-and-assemble source model (🟠).** The authoritative source is flat sprint snapshots;
  the package an engineer reasons about (`hush_model/persistence/...`) is *generated*. Provenance is
  confusing (`schema.py` under `sprint1/` holds v6 columns), navigation requires knowing sprint
  history, and "make a change" means "edit the right snapshot, then re-assemble." This raises the cost
  of every future change and of onboarding, independent of the code's quality.
- **MR2 — Bit-for-bit refactor-resistance (🟠).** 105+ tests assert prior score trajectories
  *byte-unchanged*. This is the right call for a frozen model in validation — but it means **no
  structural cleanup is free**: merging TD1's two methods, renaming, or reshaping TD5's god-row all
  change output and force a deliberate re-baseline. The rational local choice is therefore to *never*
  refactor, so debt is sticky by design.
- **MR3 — Load-bearing documentation lives in code archaeology (🟡).** Understanding any table or
  method requires reading "Sprint 2 … / Sprint 3A …" provenance comments. Knowledge is distributed
  across docstrings rather than a current as-built reference (see DG1).
- **MR4 — Intricate core control flow (🟡).** The per-set vs per-block transaction split, the shared
  `_record_block_decision` hook called from three sites, `govern` gating, and "block surprise computed
  once at entry" are correct but comment-dependent; a newcomer cannot safely modify the loop without
  absorbing several interacting conventions.

---

## 4. Schema risks

- **SR1 — Dual schema source of truth (🟠).** A fresh DB is built from the cumulative `SCHEMA_SQL`
  (already v6-shaped); an existing DB is brought forward by the migration chain. The two must be
  hand-kept identical (the migration even comments "Must match schema.py exactly (MR1)"), guarded by a
  fresh-vs-migrated parity test. Drift risk grows with every future migration.
- **SR2 — Immutable history is convention, not storage (🟠).** Docstrings claim history is "enforced by
  the absence of mutation methods," but `SessionRepository` **does** expose `set_block_status`,
  `complete_session`, `abandon_session` — UPDATEs on history rows. So the invariant is *already*
  partial (facts are append-only; lifecycle status is mutated), and the DB has **no trigger/view/grant
  preventing UPDATE/DELETE** on the truly-immutable tables (observation/evidence/recommendation/log).
  The audit guarantee the product's honesty rests on has no structural backstop.
- **SR3 — `athlete` entity has no bodyweight (🟠 for the roadmap).** The table is `sex/age/experience`
  only. Class-B (`vertical_pull`) is dimensionally bodyweight-dependent; activating it (a known
  roadmap item, currently "frozen inactive") requires a schema migration + onboarding + seeding
  change. The schema does not accommodate a need the roadmap already names.
- **SR4 — Single-writer is convention + a CI grep, not a DB boundary (🟡).** Correct as an
  architecture decision (ES-007 as a code boundary), but nothing in the storage layer prevents a
  future module from writing `capability_state` directly.
- **SR5 — Accreted, default-heavy, semantically-loaded columns (🟡).** Defaults are chosen so
  "absence == freshly-seeded" (clever, enables clean migration), but it means `NULL`/`''` carry
  meaning (e.g., `selection_reason=''` ⇒ pre-3B-2 manual block; `last_decision=NULL` ⇒ governor
  inert). The schema's intent is not self-evident without the comments.

---

## 5. Migration risks

- **MG1 — Fresh-DB version-bookkeeping gap (🟠).** `SCHEMA_SQL` **creates** `schema_version` but
  **inserts no row**, so a fresh, fully-v6-shaped DB reports *no* version. Each migration's
  `already_applied()` keys off a `version` row; on a fresh DB they all read "not applied" and would
  re-run. This is currently safe **only because every migration is additive + `IF NOT EXISTS` /
  column-existence-guarded**. The entire correctness of the migration story rests on that discipline
  never lapsing — a single non-idempotent or non-additive future migration breaks the fresh-DB path
  silently. (Recorded state and actual shape disagree; the masking is real but fragile.)
- **MG2 — No visible single ordered runner (🟡, verify).** Each migration is a standalone
  `apply(conn)` with its own `already_applied`. I did **not** find, in the files read, one runner that
  composes 002→006 in order as the single invocation path. Confirm one exists and is the only way
  migrations run; ad-hoc per-file invocation invites ordering mistakes.
- **MG3 — Forward-only, no rollback (🟡).** Additive-only is appropriate, but there is no down-migration
  or scripted reversal. A bad migration on live athlete data has no rollback and (per the beta review)
  no backups yet — the two gaps compound. *(Cross-ref: `BETA_READINESS_REVIEW.md` §3/§4.)*
- **MG4 — Migrations are snapshots too (🔵).** They carry `CONCEPTUAL LOCATION` and are assembled into
  `persistence/migrations/`; the same snapshot-provenance friction as MR1 applies.

---

## 6. Testing blind spots

- **TB1 — Concurrency is entirely untested (🟠).** Every test runs on one in-memory connection,
  single-threaded. The behavior under concurrent athletes / multiple threads or processes — the actual
  production condition once an API exists — has **zero coverage** (and, per OC1, currently cannot pass
  without a connection-model change).
- **TB2 — The IO shell is thinly tested vs the math (🟡).** Golden/parity coverage of the model is
  near-total; but real-world persistence edges — FK enforcement when the pragma is absent, rollback
  under genuine mid-chain faults (vs simulated), migrations against a **populated** DB with realistic
  history volume — are lightly covered.
- **TB3 — Invariants guarded by individual tests, not structure (🟡).** "Three-site discipline" (TD4)
  and "immutable history" (SR2) each rest on one test; add a field or table without recalling the test
  and the guard is silently absent. A structural guard (codegen, trigger, schema introspection test)
  would not have this gap.
- **TB4 — Whole scenario classes unexercised (🟠).** The parameter-adoption review already records that
  σ²_ref and the decision thresholds (`DECISION_CONF_GATE`, `SURPRISE_DEADBAND`) are **unexercised** by
  the present stable-truth scenarios; there is no conflict / progress-regress / varied-rest /
  INCREASE-DECREASE-firing coverage. So parts of the *model* are carried by code that no test
  meaningfully drives. *(Cross-ref: `reviews/decisions/MODEL_REVIEW_PARAMETER_ADOPTION.md` §7.)*
- **TB5 — Bespoke test runner (🟡).** "125 passing" was produced by a plain-assert runner over the
  assembled tree (status §4 caveat), not standard `pytest` in the canonical checkout. The test harness
  itself is bespoke and tied to the assembly step; CI parity with a normal `pytest` run is unproven.

---

## 7. Operational complexity

- **OC1 — Single shared SQLite connection, single-threaded by construction (🔴 for production).**
  `HushService` holds one `Database` with one `self.conn`; every repository takes that connection;
  there is no pool, no per-request connection, and `sqlite3.Connection` defaults to
  `check_same_thread=True`. The layer was built for synchronous, single-process sim/test use. A live
  API serving concurrent requests **cannot reuse this as-is** — even two `uvicorn` workers or a
  threaded server would break it. This is the single biggest gap between "tested in sim" and "runs as
  a service."
- **OC2 — Per-connection PRAGMAs (🟡).** WAL and `foreign_keys=ON` are set per connection; any
  out-of-band tool/connection that omits them silently loses FK enforcement and WAL semantics.
- **OC3 — The deployable is a generated artifact (🟡).** Deployment must run (or commit the output of)
  `assemble_and_test.py`; build reproducibility depends on that script. There is no `pip`-installable
  package or pinned build of record.
- **OC4 — Partial-commit seam across set/block boundaries (🟡).** Each set is its own transaction; the
  ES-006 decision-memory advance is a *separate* `complete_block` transaction. A crash between the last
  set and `complete_block` leaves sets recorded but decision memory un-advanced. Recoverable (it's a
  default-inert projection) but a real operational nuance the audit must account for.

---

## 8. Long-term production risks

- **LP1 — The concurrency wall (🔴).** OC1 is also the dominant *long-term* risk: the model+persistence
  is correct for one synchronous process and brittle just past it. Productionizing concurrency is a
  change to a layer protected by bit-for-bit tests (MR2) — i.e., exactly the kind of change this
  codebase makes expensive.
- **LP2 — Single-writer DB, single-process assumption (🟠).** SQLite is fine at 100 users, but the
  design assumes one process owning one connection. Any move to multi-process/horizontal deployment
  (or a managed Postgres) is not a config change — it touches the connection model and every raw
  positional query (EX6).
- **LP3 — Compounding complexity as the model un-freezes (🟠).** Parameter adoption, Class-B,
  Investigation Engine (ES-013), and Trust metric (ES-012) all layer onto an intricate, golden-locked
  core (TD1/TD5/MR2). Each addition is harder than the last; the architecture's intricacy is monotonic.
- **LP4 — Audit-integrity erosion (🟠).** The product's entire honesty claim is "every conclusion is
  reconstructable." That rests on convention (SR2/SR4) over years and multiple contributors, with no
  structural backstop. Discipline decays; the one invariant that *must not* should be the
  best-defended, and is currently among the least-defended (test-only).

---

## 9. Documentation gaps

- **DG1 — No as-built *code* architecture document (🟠).** The canonical docs describe the frozen
  *model/specs* (design-level); `MOBILE_ARCHITECTURE_V1.md` covers the future app. There is **no single
  document describing how the server code actually fits together** — the snapshot→package mapping, the
  assembly step, the connection/transaction model, the repository boundaries, which invariants are
  DB-enforced vs convention vs test-guarded. That knowledge lives only in scattered docstrings.
- **DG2 — The snapshot/assembly workflow is undocumented (🟠).** "Edit which snapshot, then
  re-assemble" is the actual development loop and appears nowhere as a written process; a new engineer
  would not know not to edit `build/_assembled/` directly.
- **DG3 — No schema reference / ER overview (🟡).** Column semantics (what `NULL`/`''` mean, why each
  default) exist only as inline comments; there is no consolidated schema doc or diagram.
- **DG4 — No migration runbook / invariant-enforcement matrix (🟡).** How to add a migration, the
  ordering guarantee, and a list of invariants *with their enforcement mechanism* (DB vs CI-grep vs
  test) are undocumented — the very things a maintainer most needs.
- **DG5 — Versioning policy undocumented (🔵).** `MODEL_VERSION` / `CAPABILITY_MODEL_VERSION` are manual
  strings; when to bump them, and their relationship to `schema_version` and a future `catalog_version`,
  is unwritten.

---

## 10. Where future change becomes disproportionately expensive

| ID | Change (routine elsewhere) | Why it is expensive here | Sev |
|---|---|---|---|
| **EX1** | Add one field to capability state | Edit the dataclass + **3 positional SQL sites** in lockstep (TD4) + a migration + risk to golden tests | 🟠 |
| **EX2** | Any structural refactor of the learning chain (e.g., merge TD1's two methods) | Changes byte output → re-baseline 100+ bit-for-bit golden tests (MR2) | 🟠 |
| **EX3** | Activate Class-B (`vertical_pull`) | Cross-cuts schema (no bodyweight, SR3), onboarding, seeding, 7-cap templates, domain — a known roadmap need the schema doesn't fit | 🟠 |
| **EX4** | Serve a concurrent API | Rework the single-connection model (OC1/LP1) under golden-test protection | 🔴 |
| **EX5** | Change the schema mid-trial | Dual source of truth (SR1) must both be edited + parity-tested; no rollback (MG3); no backups yet | 🟠 |
| **EX6** | Move off SQLite | Raw, SQLite-flavored positional SQL in every repository method; no abstraction layer to swap | 🟡 |

The pattern: **point changes carry whole-system cost** because of the parity coupling (MR2), the
positional-SQL fan-out (TD4), and the snapshot/assembly indirection (MR1). This is the concrete meaning
of "long-term engineering health" for this codebase.

---

## 11. Non-redesign remediations (for reference only — none alter the frozen model)

Listed to show the risks are *addressable without redesigning anything*; adopting them is a separate
decision and explicitly out of this audit's scope. None changes a number, a formula, or a behavior.

- **Generate, don't hand-sync, the schema.** Make `SCHEMA_SQL` the single source and have migrations
  assert against it (or derive from it) so SR1/MG1 drift is structurally impossible. *(Hygiene, no
  behavior change.)*
- **Stamp `schema_version` on fresh-DB creation** so recorded state matches actual shape (closes MG1's
  masking). *(One-line bookkeeping fix.)*
- **Make the invariants structural, not conventional:** a schema-introspection test (or codegen) for
  the three-site discipline (TD4); a test/trigger asserting no UPDATE/DELETE on the truly-immutable
  tables (SR2); keep the single-writer CI grep but document it (SR4). *(Guards, not redesign.)*
- **Write the missing as-built code-architecture doc + assembly/migration runbook** (DG1/DG2/DG4) —
  the single highest-leverage, lowest-risk item.
- **Plan the connection model before the API is built** (OC1/LP1/EX4): connection-per-request or a
  write-serializing queue is an *additive shell* around the unchanged pure model — decide it
  deliberately rather than discover it under load. *(Architecture decision, not model change;
  cross-ref D1 and the beta review.)*
- **Treat the bit-for-bit suite as a conscious budget:** when the model next un-freezes (parameter
  adoption, Class-B), pair the re-baseline with the deferred structural cleanups (TD1/TD5), since the
  test cost is already being paid — the *only* cheap moment to refactor is when a sanctioned model
  change already forces a re-baseline.

---

## 12. Severity rollup

| Sev | Findings |
|---|---|
| 🔴 High (production-blocking long-term) | OC1 / LP1 / EX4 — the single-connection concurrency wall |
| 🟠 Elevated | TD1, TD4 · MR1, MR2 · SR1, SR2, SR3 · MG1 · TB1, TB4 · LP2, LP3, LP4 · DG1, DG2 · EX1, EX2, EX3, EX5 |
| 🟡 Medium | TD2, TD3, TD5 · MR3, MR4 · SR4, SR5 · MG2, MG3 · TB2, TB3, TB5 · OC2, OC3, OC4 · DG3, DG4 · EX6 |
| 🔵 Low / watch | MG4 · DG5 |

---

## 13. Bottom line

Hush v1's **model is in excellent engineering health**; the concerns are not "is the math right" (it is
exhaustively tested) but "**will this code be cheap to live with for years**" — and there the honest
answer is *not yet*. Three structural properties — the snapshot-and-assemble source model, the
bit-for-bit refactor-resistance, and convention-based (not storage-based) invariant enforcement —
combine so that **routine changes carry whole-system cost** and the system's most sacred guarantee (a
reconstructable audit chain) has the least structural protection. Layered on top is one concrete
production wall: a **single-threaded persistence layer** that the future API cannot use as-is. None of
this requires redesigning the frozen model, and none is urgent at today's sim scale — which is exactly
why now, before the model un-freezes and before concurrency arrives, is the cheap moment to record
them and decide, deliberately, which to harden.

---

*Architectural audit only. No model change, no UX/UI change, no architecture redesign, no new product
scope. The frozen model is authoritative as in `HUSH_V1_EXECUTION_CONTEXT.md`; status in
`HUSH_V1_PROJECT_STATUS.md`. Related: `reviews/BETA_READINESS_REVIEW.md` (launch gaps),
`reviews/decisions/D1_THIN_CLIENT_VS_LOCAL_FIRST.md` (client architecture, open).*
