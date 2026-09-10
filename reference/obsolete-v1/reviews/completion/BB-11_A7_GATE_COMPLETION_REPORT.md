# BB-11 — A7 week-1 seed-safety gate (mechanism) — COMPLETION REPORT

> Completion report for **BB-11** (`OPEN_ITEMS_EXECUTION_PLAN.md` §3.3: "A7 week-1 gate armed +
> stop/re-anchor mechanism" — the single hard Phase-1 gate). **Mechanism: COMPLETE.** The gate now
> computes, per cohort, first-session completion + first-rep-failure rates and returns the per-cohort
> verdict plus the overall **PROCEED / PAUSE-AND-RE-ANCHOR** recommendation — the sanctioned response to
> an unsafe cohort (stop and re-anchor ES-008 v2, never field-tune). Tests: **188/188** model golden
> (unchanged) **+ API pytest 43** (was 35; **+8** in `test_api_gate`) → canonical gate **PASS**.
> Additive read-only — no model/schema/migration change.
>
> **⚠ The gate's THRESHOLDS are PROVISIONAL pending OD-8 (escalated, §3).** The mechanism is built and
> tested; arming it for a real cohort requires ratifying the numbers — a Model/Product decision.
>
> Date: 2026-06-12 · Build: … + BB-32 export ✅ + **BB-11 A7 gate ✅ (thresholds → OD-8)** (Schema
> **v10**, unchanged) · Owner: Backend/Model (mechanism) → Model/Product (OD-8 thresholds).

---

## 0. Executive summary

| Item | Class | Status | Evidence |
|---|---|---|---|
| **`app/a7_gate.py`** | Pure gate evaluator (new) | ✅ Done | `evaluate_a7_gate` → per-cohort verdict + PROCEED/PAUSE/AWAIT |
| **`HushService.a7_first_session_safety()`** | Read-only metrics (new) | ✅ Done | per-cohort completion + first-rep-failure from first sessions |
| **`GET /internal/gate/a7`** | Operator endpoint (new) | ✅ Done | `api/internal/operator.py`; operator-key only |
| **`tests/test_api_gate.py`** | Tests (new, +8) | ✅ Done | 5 pure verdict + 3 live (access · await→proceed · pause-on-failure) |
| **Thresholds** | Decision | 🔺 **OD-8 (provisional)** | surfaced verbatim in the response; not armed (§3) |

**Test result:** `model golden 188/188` + `API pytest 43 → rc=0` → `PASS`. API suite:
`core 19 · connection 7 · instruments 4 · metrics 5 · gate 8`. Suite total **231** (188 + 43).

---

## 1. What the gate does

The A7 gate is the one hard Phase-1 stop (Validation Architecture): *"no cohort shows unsafe seeds
(A7 passes) … If seeds are unsafe for any cohort, **stop and re-anchor ES-008 v2** before proceeding."*
A7 is tested by **first-session completion + first-rep-failure, segmented by cohort** — cohort coverage
matters more than total N (the tails are where A7 lives), so the gate rules **per cohort** and one unsafe
cohort halts the ramp.

**Metrics** (`a7_first_session_safety`, read-only over persisted first sessions, per `sex/experience`):
- `completion_rate` — fraction of the cohort's **first** sessions with status `completed`;
- `first_rep_failure_rate` — fraction of first-session sets with `actual_reps == 0` (could not complete a
  single rep at the prescribed day-1 load — the catastrophic seed-safety signal).

**Verdict** (`evaluate_a7_gate`, pure):
- per cohort → `SAFE` / `UNSAFE` / `INSUFFICIENT_DATA` (below `min_cohort_n`, the gate cannot yet rule);
- overall → **`PAUSE_AND_REANCHOR`** if any cohort `UNSAFE` (the hard stop); else **`PROCEED`** if any
  cohort `SAFE`; else **`AWAIT_DATA`** (only insufficient cohorts — recruit the tails).

The response carries `unsafe_cohorts`, the full per-cohort breakdown, and the thresholds used + their
`PROVISIONAL` status, so no consumer mistakes the placeholder numbers for ratified ones.

---

## 2. As-built notes

- **Reuses the BB-32 evidence path**: first sessions are picked deterministically per athlete by
  `(session_index, created_at)` (shared `_first_session_ids` helper, now used by both the export and the
  gate). The gate adds the *safety verdict* on top of the BB-32 *data*.
- **Pure / DB-free evaluator**: `app/a7_gate.py` is I-O-free and deterministic — verdict logic is
  unit-tested without a database; the endpoint only joins the service metrics to the evaluator.
- **No field-tuning path**: the evaluator decides nothing about the model; the only sanctioned response to
  an `UNSAFE` cohort is stop-and-re-anchor ES-008 v2 (a model review), never a parameter tweak (KL-9).

---

## 3. 🔺 ESCALATION — OD-8 threshold ratification (Model/Product)

The **mechanism** is complete and tested; **arming** the gate for a real cohort requires ratifying the
thresholds, which is **OD-8** ("Phase-0 gate-threshold ratification, Q5") — explicitly a Model/Product
decision, not autonomous executable work. The current placeholders (in `PROVISIONAL_THRESHOLDS`, surfaced
in every response):

| threshold | provisional value | meaning |
|---|---|---|
| `max_first_rep_failure_rate` | **0.0** | any day-1 first-rep failure in a cohort = unsafe seed |
| `min_completion_rate` | **0.80** | < 80 % first-session completion in a cohort = unsafe |
| `min_cohort_n` | **5** | below this, a cohort is `INSUFFICIENT_DATA`, not a verdict |

These are placeholders chosen to be conservative (zero-tolerance on first-rep failure, the catastrophic
signal). **OD-8 must ratify them before the gate is armed.** Until then the response is stamped
`thresholds_status: "PROVISIONAL — pending OD-8 … (not armed for a real cohort)"`.

---

## 4. Acceptance criteria

- [x] `GET /internal/gate/a7` live behind the operator key; athlete token → 401.
- [x] Per-cohort first-session completion + first-rep-failure computed read-only from persisted data.
- [x] Per-cohort `SAFE`/`UNSAFE`/`INSUFFICIENT_DATA` + overall `PROCEED`/`PAUSE_AND_REANCHOR`/`AWAIT_DATA`.
- [x] **Hard stop verified**: a cohort with a day-1 first-rep failure flips the gate to `PAUSE_AND_REANCHOR`
      while a clean cohort stays `SAFE` (live test).
- [x] Thresholds surfaced as **PROVISIONAL** in every response; not armed.
- [x] **No model/schema/migration change**; 188/188 model unchanged; API 35 → **43**; gate **PASS**.
- [🔺] Threshold ratification — **escalated as OD-8** (Model/Product).

---

## 5. Rollback

Code-only, read-only. Remove `app/a7_gate.py` + its MAP entry, `a7_first_session_safety` +
`_first_session_ids` from `service.py` (inline the first-session query back into `_first_session_by_cohort`),
the `/internal/gate/a7` route, and `test_api_gate.py` (+ its two assembler entries). Nothing writes.

---

*Completion report only. An additive read-only gate over existing first-session evidence: no model/schema/
migration change, no golden moved (188/188; API 35→43). Implements the BB-11 mechanism + stop/re-anchor
recommendation; the threshold ratification (OD-8) is escalated. Trace: `OPEN_ITEMS_EXECUTION_PLAN.md`
BB-11/OD-8; Validation Architecture §"Gate to Phase 2"; A7; BB-32 evidence path.*
