# BB-11 — A7 week-1 seed-safety gate ARMED (OD-8 ratified) — Completion Report

Date: 2026-06-12
Owner: Backend/Model (mechanism + arming); Operations (review cadence — BB-29)
Status: **ARMED** — OD-8 thresholds ratified; the gate is live for a real cohort
Gate: `python build/_verify/assemble_and_test.py` → **model golden 189/189 + API pytest 75 → PASS**

---

## 1. What changed

The BB-11 A7 gate **mechanism** was already built and tested (per-cohort first-session completion +
first-rep-failure → per-cohort `SAFE`/`UNSAFE`/`INSUFFICIENT_DATA` and overall
`PROCEED`/`PAUSE_AND_REANCHOR`/`AWAIT_DATA`). It shipped stamped **PROVISIONAL**, explicitly "not armed
for a real cohort" pending **OD-8** (Phase-0 gate-threshold ratification).

**OD-8 is now ratified (2026-06-12).** The product decision ratified the A7 thresholds for V1:

| threshold | ratified V1 value | meaning |
|---|---|---|
| `max_first_rep_failure_rate` | **0.0** | any day-1 first-rep failure in a cohort = unsafe seed |
| `min_completion_rate` | **0.80** | < 80 % first-session completion in a cohort = unsafe |
| `min_cohort_n` | **5** | below this, a cohort is `INSUFFICIENT_DATA`, not a verdict |

These are **identical** to the conservative placeholders the mechanism already carried, so arming the
gate is a status flip, not a behavior change — no verdict moves.

## 2. As-built

`implementation/api/a7_gate.py`:
- `PROVISIONAL_THRESHOLDS` → **`A7_THRESHOLDS_V1`** (values unchanged; kept a back-compat alias).
- New `A7_THRESHOLDS_STATUS = "RATIFIED — OD-8 (V1, 2026-06-12); armed (change only by future product
  decision)"`.
- `evaluate_a7_gate` now stamps `thresholds_status: <ratified>` and **`armed: true`** when run with the
  default ratified thresholds (a caller-supplied custom config is stamped `CUSTOM` / `armed: false`).
- `GET /internal/gate/a7` docstring updated: thresholds RATIFIED, gate ARMED.

OD-8 also reaffirms the standing rule: the **only** sanctioned response to an `UNSAFE` cohort is
stop-and-re-anchor ES-008 v2 (a model review) — **never** field-tune parameters on live users (KL-9).
The evaluator decides nothing about the model; it has no field-tuning path.

## 3. Tests

`implementation/api/test_api_gate.py` — `test_evaluator_surfaces_provisional_threshold_status` →
**`test_evaluator_surfaces_ratified_armed_threshold_status`**: asserts `thresholds_status` is the
ratified string, `armed is True`, and the thresholds equal the ratified V1 values
(`{0.0, 0.80, 5}`). The two live tests now reference `A7_THRESHOLDS_V1`. The hard-stop test
(a day-1 first-rep-failure cohort → `PAUSE_AND_REANCHOR` while a clean cohort stays `SAFE`) is unchanged
and green.

## 4. Scope boundary

- **In code (done):** the armed verdict signal with ratified thresholds, surfaced behind the operator key.
- **Remains Operations (BB-29):** the human gate-review cadence (who reviews `/internal/gate/a7`, when)
  and the operational "pause new first sessions + contact affected cohort" runbook that consumes the
  armed `PAUSE_AND_REANCHOR` signal. The signal is now authoritative; the operational response around it
  is the incident-runbook work.

## 5. Files

- **Edited:** `implementation/api/a7_gate.py`, `implementation/api/internal/operator.py` (docstring),
  `implementation/api/test_api_gate.py`.

**Verification:** `python build/_verify/assemble_and_test.py` → `OVERALL: model 189/189 + API pytest
rc=0 -> PASS`.
