# Pre-Deploy Tooling — Completion Report (2026-06-12)

> **Scope:** close the remaining *repository-local, executable* non-model gaps after the on-host
> model + backend surface was declared complete. The frozen model is **untouched** — no model,
> scoring, learning, recommendation, seeding, progression, or composition logic was opened. No
> `constants.py` value changed. The canonical gate is unchanged and green:
> `python build/_verify/assemble_and_test.py` → **model 189/189 + API pytest 95 = 284 passing**.
>
> Governing rule observed: *no redesign without explicit model review.* Everything here is an
> additive deployment/operational/CI asset wrapping the existing assembled tree.

## What shipped (all validated on this host)

| Asset | File(s) | Reduces | Validation run |
|---|---|---|---|
| **OpenAPI contract export** | `deploy/export_openapi.py`, generated `deploy/openapi.json` | BB-15 (iOS client codegen vs. hand-transcribing the contract), BB-14 (staging contract baseline) | `export_openapi.py` → 16 paths, schema-version 11 stamped; `--check` drift gate returns OK against the committed file |
| **End-to-end HTTP smoke test** | `deploy/smoke_test.py` | BB-14 / BB-30 staging dress-rehearsal (proves the wire: ASGI server + auth headers + `/internal/*` restriction end-to-end, which `TestClient` cannot) | `smoke_test.py --self` boots the assembled app under uvicorn, drives the full athlete lifecycle + operator surface over real HTTP, tears down → **SMOKE PASSED**, exit 0 |
| **SCA dependency-audit gate** | `deploy/sca_audit.py` | BB-31 (SCA over the pinned closure) | runs `pip-audit --strict` over `requirements*.txt`; with the tool absent it exits **2 (UNABLE TO RUN)**, never a false clean — verified |
| **CI workflow** | `.github/workflows/ci.yml` | BB-31 (reproducible build-of-record) | static asset: assemble → canonical gate → OpenAPI-drift → SCA, plus a `--self` smoke job |
| **Status reconciliation** | `HUSH_V1_PROJECT_STATUS.md`, `HUSH_V1_OPEN_ITEMS.md`, `CURRENT_STATUS.md.md`, `deploy/README.md` | doc drift | header test count corrected **264/API-75 → 284/API-95** (live gate); BB-27/BB-31 statuses reconciled; `deploy/README` corrected `schema_version == 10` → `== 11` |

## Design notes

- **Stdlib-only at the edges.** `smoke_test.py` (and the existing `ops_monitor.py`) use only `urllib`,
  so Operations can run them from a bare Python on a bastion/cron host pointed at the deployed URL —
  no extra runtime closure to vet.
- **Honest failure.** The SCA gate never reports "clean" when it could not reach the advisory DB
  (exit 2 ≠ exit 0); the OpenAPI `--check` fails on any drift from the served surface; the smoke test
  distinguishes a contract failure (exit 1) from a transport/harness error (exit 2).
- **Run against the build-of-record.** The contract export and smoke test both import the *assembled*
  tree (`build/_assembled/`), so they describe/exercise exactly what ships, not the snapshot sources.

## Remaining blocked work + the exact external dependency

| Item | Blocked on (external) |
|---|---|
| BB-15 iOS app build | iOS toolchain / Xcode (contract baseline `deploy/openapi.json` now prepped) |
| BB-14/BB-30 run smoke against staging | a deployed staging/prod environment |
| BB-31 execute SCA / CI | a GitHub-compatible Actions runner + network to the advisory DB |
| BB-27 alert delivery | a pager integration + named on-call rota (watcher `ops_monitor.py` already built) |
| BB-30/21/22 infra | cloud host, DNS+TLS cert, secrets manager, encrypted volume, firewall, off-box backup bucket |
| BB-33/34/35/36/37 + OD-3 impl | consent/legal/App-Store processes; OD-3 email recovery bundled with the BB-33+BB-30 workstream |
| OD-5/6/7/9/10, BB-26, BL-1..4 | Mobile architecture decisions / iOS toolchain / future cloud |

**Model confirmation:** no model item was opened or implemented. No genuinely-incomplete model item
was discovered during the sweep; the frozen model and its golden baseline remain bit-for-bit intact
(189/189). Every change in this tranche is an additive non-model asset.
