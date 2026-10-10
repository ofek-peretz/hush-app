# WAVE_1_EXECUTION_CHECKLIST.md — First Implementation Wave

> **Build checklist for Wave 1 only** (the "before any implementation begins" gate from
> `reviews/decisions/OPEN_ITEMS_EXECUTION_PLAN.md` §2). For each of the seven Wave-1 items it states the
> concrete deliverable, how completion is verified, an effort estimate, and dependencies. **This is not a
> new plan and introduces no new work** — every item is an existing registry row (`HUSH_V1_OPEN_ITEMS.md`)
> already placed in Wave 1; the deliverables are the **non-redesign remediations already named** in
> `ARCHITECTURAL_AUDIT_HUSH_V1.md` §11 and the decision already framed in
> `D1_THIN_CLIENT_VS_LOCAL_FIRST.md`. Nothing here changes the frozen model's numeric behavior, schema
> meaning, UX, or architecture. Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-10 · Build: Sprint 0–4 ✅ (125 tests, schema v6) · Model/UX/Architecture: frozen ·
> Wave 2/3/4 checklists are **out of scope** for this document.

---

## 0. Scope & the Wave-1 gate

The seven Wave-1 items, exactly as listed in the execution plan §2:

| # | ID | Title | Owner | Source finding |
|---|---|---|---|---|
| 1 | **OD-1** | Client architecture: Thin-Client vs Local-First (D1) | Product/Mobile/Backend | D1; Build Plan §9 |
| 2 | **ATD-13** | Single ordered migration runner | Backend | Audit MG2 |
| 3 | **ATD-12** | Fresh-DB version-bookkeeping gap | Backend | Audit MG1 |
| 4 | **ATD-8** | Dual schema source of truth | Backend | Audit SR1 |
| 5 | **ATD-15** | As-built code-architecture document | Backend | Audit DG1 |
| 6 | **ATD-16** | Snapshot/assembly dev-workflow doc | Backend | Audit DG2 |
| 7 | **ATD-18** | Migration runbook + invariant-enforcement matrix | Backend/Operations | Audit DG4 |

*(Listed in dependency order, not the plan's numeric order: ATD-13 precedes ATD-12, which pairs with
ATD-8; the three doc items follow. OD-1 is independent and runs in parallel from day one.)*

**Wave-1 Definition of Done (the gate that lets Wave-2 build begin):**
- [ ] D1 is **decided and recorded** (OD-1) — Option A or B ratified; if B, Build Plan §9 amended.
- [ ] Exactly **one** sanctioned, ordered migration invocation path exists and is the only way migrations
      run (ATD-13).
- [ ] A fresh v6 DB **reports its version** and its migrations correctly read "already applied" (ATD-12).
- [ ] Schema drift between `SCHEMA_SQL` and the migration chain is **structurally caught**, not
      hand-checked (ATD-8).
- [ ] The **as-built code doc**, the **assembly-workflow doc**, and the **migration runbook +
      invariant-enforcement matrix** exist and are accurate to the current tree (ATD-15/16/18).
- [ ] **The 125 tests remain green and the fresh-vs-migrated parity test still holds** after every
      change above (the universal Wave-1 acceptance constraint — no behavior may move).

> **Hard constraint on every code item below (ATD-8/12/13):** the change is **bookkeeping/enforcement
> hygiene only**. It must not alter a number, a formula, a column's meaning, or a recorded trajectory.
> The fresh-vs-migrated parity test and the full golden suite are the regression backstop and must pass
> byte-for-byte. If any deliverable *would* move output, it is out of Wave-1 scope and must stop for
> model review.

> **Not a Wave-1 item (noted to prevent scope creep):** `BB-13` (assemble the runnable, `pytest`-green
> service tree) is the *first Wave-2 build task* and the natural next step once this gate clears; it is
> tracked in the execution plan §3.2 / critical-path step ②, **not** here. ATD-16 documents the assembly
> *workflow*; it does not perform the BB-13 assembly.

---

## 1. OD-1 — Client architecture: Thin-Client vs Local-First (D1)

**Concrete deliverable.** A **ratified decision**, not code. Close `D1_THIN_CLIENT_VS_LOCAL_FIRST.md`
from *Proposed* to *Adopted* by selecting **Option A (thin client, Build Plan §9 as-is)** or **Option B
(local-first event-sourced, the `MOBILE_ARCHITECTURE_V1.md` proposal)**. The deliverable artifacts are:
- the decision recorded in `D1_THIN_CLIENT_VS_LOCAL_FIRST.md` (status → Adopted, with the chosen option
  and the rationale already laid out in that doc's §6–§8);
- the **facility-connectivity sanity-check** that doc's §8 makes a precondition of choosing B
  (confirm against the actually-recruited gyms whether buffering is warranted);
- if **B** is chosen, the one sanctioned canonical edit: amend **Build Plan §9** (thin-client wording)
  to the event-sourced posture — the explicit model-review act D1 requires;
- the registry updated (`OD-1` → Closed, with the chosen option) per the "update both" rule.

No app or API code is written here; this item exists to **unblock** BB-9 (connection model) and BB-15
(app build) with a settled posture.

**How completion is verified.**
- `D1_THIN_CLIENT_VS_LOCAL_FIRST.md` shows status **Adopted** with a named option and a dated sign-off.
- If B: Build Plan §9 reads the event-sourced decision (diff reviewed); if A: Build Plan §9 is
  explicitly reaffirmed (no edit, recorded as "no change").
- `HUSH_V1_OPEN_ITEMS.md` OD-1 row is **Closed** and the execution-plan critical path step ① is checked.
- The facility sanity-check result is recorded (so the B-bet is evidenced, not assumed).

**Effort estimate.** **S — ~2–3 days, decision-bound not build-bound.** Engineering input is small (the
analysis already exists in the D1 doc); the elapsed time is dominated by the facility check and the
cross-functional sign-off (Product + Mobile + Backend). No implementation.

**Dependencies.**
- *Upstream:* none — this is the **root** of the Wave-1 / critical path and starts on day one.
- *Downstream:* gates Wave-2 `BB-9`, `BB-15`, and the crash-recovery/sync posture. Its outcome **informs
  the connection/transaction section of ATD-15** (the as-built doc should reference the settled posture),
  so ideally land OD-1 before ATD-15 is finalized — but ATD-15 can be drafted in parallel and annotated.

---

## 2. ATD-13 — Single ordered migration runner

**Concrete deliverable.** Confirm or establish **exactly one** runner that composes migrations
`002 → 006` in order and is the **only** sanctioned invocation path. As-built, each migration is a
standalone `apply(conn)` + `already_applied(conn)` file (`implementation/sprint{2..4}/migration_00*.py`,
assembled into `hush_model/persistence/migrations/`) and the audit (**MG2**) "did not find one runner
that composes 002→006 as the single invocation path." Deliverable: a single ordered runner (a thin list
of the migrations applied in sequence, each guarded by its existing `already_applied`) — or, if one
already exists, the documented confirmation that it is the sole path. **No migration logic changes**; this
only guarantees ordering and one entry point.

**How completion is verified.**
- A single runner applies 002→006 in order on a pre-v2 DB and brings it to schema v6; re-running is a
  no-op (idempotent).
- Test: ad-hoc per-file invocation is no longer the documented/used path; the runner is the only one the
  runbook (ATD-18) names.
- The existing **fresh-vs-migrated parity test passes unchanged**; the 125-test suite stays green.

**Effort estimate.** **S — ~1 day.** Small, mechanical; the per-migration guards already exist.

**Dependencies.**
- *Upstream:* none (operates on existing migration files).
- *Downstream:* **prerequisite for ATD-12** (the fresh-DB version stamp must agree with how the runner
  reads `already_applied`) and feeds **ATD-18** (the runbook documents this runner). Pairs with ATD-8.

---

## 3. ATD-12 — Fresh-DB version-bookkeeping gap (MG1)

**Concrete deliverable.** Make a freshly-created v6 DB **report its version**. As-built, `SCHEMA_SQL`
*creates* `schema_version` but **inserts no row**, so a fresh, fully-v6-shaped DB reports no version and
every migration's `already_applied()` would read "not applied" (safe today only because all migrations
are additive + idempotent). Deliverable: the audit §11 one-line remediation — **stamp `schema_version`
on fresh-DB creation** (record the current version, v6, when `SCHEMA_SQL` builds the DB) so recorded
state matches actual shape and the runner (ATD-13) sees a fresh DB as already-at-v6. **Bookkeeping only;
no schema shape or model behavior changes.**

**How completion is verified.**
- A fresh DB built from `SCHEMA_SQL` has a populated `schema_version` reflecting v6.
- Running the ATD-13 runner against that fresh DB is a **no-op** (it correctly reads all migrations as
  already applied) — not a re-run.
- New/extended test asserting the fresh-DB version row; the **fresh-vs-migrated parity test still holds**
  (both paths converge to identical shape *and* version); 125 tests green.

**Effort estimate.** **XS — ~0.5 day.** One bookkeeping insert + a guard test.

**Dependencies.**
- *Upstream:* **ATD-13** (the runner's `already_applied` semantics define what the stamp must satisfy).
- *Downstream:* hardens the path BB-5 (Wave-2 prod migration) relies on; pairs with ATD-8.

---

## 4. ATD-8 — Dual schema source of truth (SR1)

**Concrete deliverable.** Remove the **hand-sync** between the cumulative `SCHEMA_SQL` (fresh-DB path,
already v6-shaped) and the migration chain (existing-DB path). Per audit §11: make the drift
**structurally impossible** rather than convention-checked — the lowest-risk form is to have the
**migrations assert against `SCHEMA_SQL`** (or derive from it) so a fresh-built DB and a fully-migrated DB
are provably identical by construction, not by a reviewer remembering to update both. (The migration files
already carry "Must match schema.py exactly" comments — this replaces that comment with an enforced
check.) **No column is added, renamed, or re-meant.**

**How completion is verified.**
- An automated check fails if `SCHEMA_SQL` and the end-state of the migration chain diverge (the drift
  that today is only caught by the parity test is now caught at the source).
- The existing **fresh-vs-migrated parity test passes**; the new assertion passes on the current tree
  (proving they are in sync *now*).
- 125 tests green; no behavior delta.

**Effort estimate.** **S — ~1–2 days.** Mechanical comparison/derivation + a test; bounded by getting the
two representations into a comparable form.

**Dependencies.**
- *Upstream:* benefits from **ATD-13** (one runner gives a single, well-defined "end-state of the chain"
  to compare against). Pairs with **ATD-12**.
- *Downstream:* makes Wave-2 **BB-5** (run the migration chain on the real prod DB) safe and removes the
  drift risk that compounds with every future migration.

---

## 5. ATD-15 — As-built code-architecture document (DG1)

**Concrete deliverable.** Write the **single missing document** describing how the *server code* actually
fits together (audit DG1 calls this "the single highest-leverage, lowest-risk item"). It is a factual
as-built reference, not a design or redesign. It must cover, for the current tree:
- the **snapshot → assembled-package mapping** (flat `implementation/sprintN/` files → generated
  `build/_assembled/hush_model/...`) and the `CONCEPTUAL LOCATION:` convention;
- the **connection/transaction model** as-built (one `Database`, one `sqlite3.Connection`, WAL + FK
  pragmas, the `transaction()` context manager) — annotated with the OD-1 outcome and a forward pointer
  to BB-9 (the Wave-2 connection-model work), **without** designing it here;
- the **repository boundaries** (sole-writer `StateRepository`; append-only `Session`/`Learning`
  repositories) and the per-set vs per-block transaction split;
- the **invariant-enforcement table** — for each load-bearing invariant (immutable history, single
  writer, three-site column discipline, version stamping), whether it is enforced by **DB / CI-grep /
  test / convention** (this table is shared with ATD-18).

**How completion is verified.**
- The document exists under `docs/` (or `reviews/`) and a reviewer who has *not* read the code can trace
  a set report from API boundary → pipeline → repositories → audit chain using only the doc.
- Cross-checked against the actual files (no claim contradicts `repositories.py` / `pipeline.py` /
  `service.py` / `schema.py`); the invariant table matches reality (e.g. it correctly records that
  immutable history is **test/convention-enforced, not DB-enforced** — SR2).
- Referenced by the execution plan as satisfying ATD-15; registry row updated.

**Effort estimate.** **M — ~2–3 days.** Documentation of an intricate but already-understood system;
most cost is accuracy-checking against the code and building the invariant matrix.

**Dependencies.**
- *Upstream:* **OD-1** (so the connection/transaction section can reference the settled posture) — can be
  drafted in parallel and finalized once OD-1 lands.
- *Downstream:* **informs Wave-2 BB-9 and BB-14** (the API engineer's primary reference). Shares the
  invariant-enforcement matrix with **ATD-18**; pairs with **ATD-16**.

---

## 6. ATD-16 — Snapshot/assembly dev-workflow doc (DG2)

**Concrete deliverable.** Document the **actual development loop** that today exists nowhere in writing
(audit DG2): *edit the correct per-sprint snapshot → run `build/_verify/assemble_and_test.py` → the
runnable package and tests are (re)generated into `build/_assembled/`* — and the explicit rule **do not
edit `build/_assembled/` directly** (it is generated). Include how to run the suite and where the
`CONCEPTUAL LOCATION:` comments map. This is a short "how to work in this repo" page; it **performs no
assembly itself** (that is BB-13).

**How completion is verified.**
- A new engineer can, following only this doc, make a trivial change in the right snapshot, re-assemble,
  and see the tests run — without editing the generated tree.
- The doc names `build/_verify/assemble_and_test.py` as the assembly entry point and states the
  do-not-edit-`_assembled` rule.
- Consistent with ATD-15 (no contradiction in the snapshot→package description).

**Effort estimate.** **XS–S — ~0.5–1 day.** Short procedural doc.

**Dependencies.**
- *Upstream:* none (describes the existing `assemble_and_test.py` workflow).
- *Downstream:* makes **BB-13** (Wave-2 assembly) reproducible by someone other than the original author;
  pairs with **ATD-15**.

---

## 7. ATD-18 — Migration runbook + invariant-enforcement matrix (DG4)

**Concrete deliverable.** The operator/maintainer document the audit (DG4) names as "the very things a
maintainer most needs," in two parts:
- a **migration runbook** — how to add a migration (the additive + idempotent + `IF NOT EXISTS` /
  column-existence-guard discipline), the **ordering guarantee via the single runner (ATD-13)**, the
  fresh-vs-migrated parity requirement, and the current **no-rollback / forward-only** reality plus its
  dependence on backups (cross-ref Wave-2 BB-3; this only *documents* the constraint, it does not build
  backups);
- the **invariant-enforcement matrix** — each load-bearing invariant with its enforcement mechanism
  (DB / CI-grep / test / convention). This is the **same matrix produced in ATD-15**, owned jointly so
  there is one authoritative copy.

**How completion is verified.**
- The runbook lets a maintainer add a hypothetical migration 007 correctly (additive, guarded, applied by
  the single runner, parity-tested) using only the doc.
- The invariant matrix is present, accurate to the current code, and identical to (or the single source
  for) the one in ATD-15.
- Operations signs off that the runbook is sufficient to support the Wave-2 prod migration (BB-5) and the
  incident runbook (BB-29) can reference it.

**Effort estimate.** **S–M — ~1–2 days.** Procedural + the shared matrix (largely reused from ATD-15).

**Dependencies.**
- *Upstream:* **ATD-13** (the runner the runbook documents) and **ATD-15** (the shared invariant matrix).
- *Downstream:* feeds Wave-2 **BB-5** (prod migration) and **BB-29** (incident runbook); owned with
  Operations.

---

## 8. Sequencing & effort rollup

**Suggested order** (respecting the dependencies above; OD-1 runs in parallel throughout):

```
day 0 ──► OD-1 kickoff (decision track, Product/Mobile/Backend) ───────────────► OD-1 ratified
            │  (facility check + sign-off; informs ATD-15 connection section)
            ▼
  Backend track:
   ATD-13 (single runner) ─► ATD-12 (fresh-DB version stamp) ─► ATD-8 (schema-drift guard)
                                                                   │
   ATD-15 (as-built doc, drafts in parallel) ──┬── ATD-16 (assembly workflow)
                                               └── ATD-18 (migration runbook + shared invariant matrix)
                                                        (consumes ATD-13 + the ATD-15 matrix)
  ── gate: Wave-1 DoD (§0) all checked, 125 tests green, parity holds ──► Wave-2 may begin (BB-13 first)
```

**Effort rollup (engineer-days, indicative):**

| Item | Size | Days | Track |
|---|---|---|---|
| OD-1 | S | ~2–3 (decision-bound) | Product/Mobile/Backend |
| ATD-13 | S | ~1 | Backend |
| ATD-12 | XS | ~0.5 | Backend |
| ATD-8 | S | ~1–2 | Backend |
| ATD-15 | M | ~2–3 | Backend |
| ATD-16 | XS–S | ~0.5–1 | Backend |
| ATD-18 | S–M | ~1–2 | Backend/Operations |
| **Total** | — | **~8–12 eng-days** (code hygiene ~3–4.5; docs ~3.5–6; decision parallel) | — |

The three code items (ATD-8/12/13) are small and share a backstop (parity + golden suite). The three doc
items (ATD-15/16/18) share content (the invariant matrix; the snapshot/assembly description) and are the
larger half of the wave. OD-1 is elapsed-time, not engineering-time. With one backend engineer plus the
decision track running in parallel, Wave 1 is a **~1.5–2 week** gate.

---

## 9. Acceptance: the one regression rule for the whole wave

Every code change in this wave (ATD-8/12/13) is hygiene/enforcement only and is accepted **only if**:
- the **125 tests pass** unchanged, and
- the **fresh-vs-migrated parity test holds** (a fresh `SCHEMA_SQL` DB and a fully-migrated DB are
  identical in shape *and* now in recorded version), and
- **no number, formula, column meaning, or recorded trajectory moves** (no golden re-baseline).

If any item would breach this, it is **not** a Wave-1 hygiene item — it stops and routes to model review.
The documentation items (ATD-15/16/18) and the decision (OD-1) cannot move behavior by construction; their
acceptance is **accuracy to the current tree** and **sign-off by the consuming owner** (the API engineer
for ATD-15, a fresh engineer for ATD-16, Operations for ATD-18, the cross-functional trio for OD-1).

---

*Build checklist for Wave 1 only — no Wave 2/3/4 content, no redesign, no new work. Every item traces to
`HUSH_V1_OPEN_ITEMS.md` and its source (`ARCHITECTURAL_AUDIT_HUSH_V1.md` §11; `D1_THIN_CLIENT_VS_LOCAL_FIRST.md`).
Sequencing authority: `reviews/decisions/OPEN_ITEMS_EXECUTION_PLAN.md` §2. Resolving any item requires
updating both the registry and its source.*
