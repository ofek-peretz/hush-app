# DEVELOPMENT_WORKFLOW.md — How to Work in This Repo

> The actual development loop for the Hush v1 server code (Audit DG2 / ATD-16). It documents the
> **snapshot → assemble → test** cycle that was previously unwritten, and the one rule a new engineer must
> know: **never edit the generated `build/_assembled/` tree.** It documents the existing workflow; it
> changes no code and no behavior. Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-10 · Build: Sprint 0–4 ✅ + Wave 1 ✅ (131 tests, schema v6).
> **As of 2026-06-12: schema v11, 284 tests** (DX-07/04/03 · M1 · DX-11 · DX-09/M5 · DX-08/10/12 ·
> Wave-2 backend API shell — model golden 189 + API pytest 95). The snapshot → assemble → test loop and
> the never-edit-`build/_assembled/` rule are unchanged.

---

## 1. The mental model in one paragraph

The runnable Python package (`hush_model/`, `sim/`, `tests/`) does **not** exist as a checked-in package.
It is **generated** by `build/_verify/assemble_and_test.py`, which copies flat per-sprint **snapshot**
files from `implementation/` into `build/_assembled/` and then runs every test. The files you edit are the
**snapshots**; the package you run is the **assembled output**. This is the project's source-of-truth model
(Audit MR1) — unusual, but it is the convention, and the steps below are how you work within it.

---

## 2. The loop

```
1. EDIT      the snapshot under  implementation/sprintN/<file>.py   (or implementation/wave1/…)
2. ASSEMBLE+TEST   python build/_verify/assemble_and_test.py
3. READ      the result:  "==== P/T passed ===="   (and any FAIL tracebacks)
4. REPEAT    until green
```

- **Step 2 rebuilds `build/_assembled/` from scratch** (`shutil.rmtree` then re-copy per the `MAP`) and
  runs all suites with a bespoke plain-assert runner (no `pytest` in this checkout). A test is any
  `test_*` function in a mapped `tests/test_*.py` module.
- The script exits non-zero if any test fails, so it is CI-usable as-is.

---

## 3. The one hard rule

> **Never edit `build/_assembled/`.** It is deleted and regenerated on every run; any change you make there
> is **lost on the next assemble** and is invisible to source control intent. All real edits go in
> `implementation/`.

If you find yourself editing a file under `build/_assembled/…`, stop — find its **source** via the `MAP`
in `assemble_and_test.py` (it maps each `build/_assembled/...` path back to its `implementation/...`
snapshot) and edit that instead.

---

## 4. Where things live (find the snapshot to edit)

- The authoritative map is the **`MAP` dict** in `build/_verify/assemble_and_test.py`:
  `"hush_model/persistence/db.py": "sprint1/db.py"` means the assembled `db.py` comes from
  `implementation/sprint1/db.py`. To change `db.py`, edit that snapshot.
- **Provenance note:** later sprints edit earlier snapshots in place — e.g. `sprint1/schema.py` holds all
  v6 columns, and `sprint1/db.py` holds the Wave-1 stamp. Use the `MAP`, not the sprint number, to locate
  a file. `CONCEPTUAL LOCATION:` comments in each snapshot name where it "really" lives in the package.
- **Adding a new file** to the package: add a `MAP` entry (`"<dest under build/_assembled>": "<src under
  implementation>"`); for a new test suite also append its module to the `suites` list in `run()`.
  (Wave 1 did exactly this for `migrations/runner.py` and `tests/test_wave1.py`.)

---

## 5. Conventions to preserve

- **Additive, idempotent migrations** (`implementation/sprint*/migration_00*.py`) — never rewrite or drop;
  see `docs/architecture/MIGRATION_RUNBOOK_V1.md`.
- **Bit-for-bit golden tests** — most model tests assert byte-exact trajectories; a structural change that
  moves output requires a **deliberate, reviewed re-baseline** (Audit MR2). Hygiene changes (like Wave 1)
  must keep the prior counts green.
- **Pure model stays I/O-free** — `constants.py`, `prediction.py`, `state_update.py`, `capability/…` etc.
  import no persistence; keep it that way.

---

## 6. Related

- As-built code map and invariant matrix: `docs/architecture/SERVER_ARCHITECTURE_ASBUILT_V1.md` (ATD-15).
- Migration procedure + runbook: `docs/architecture/MIGRATION_RUNBOOK_V1.md` (ATD-18).
- Long-term engineering-health findings: `reviews/ARCHITECTURAL_AUDIT_HUSH_V1.md`.

---

*Documents the existing workflow only — no code or behavior change.*
