# BB-32 — Tested data-export path for A7/A8/A9 evidence (+ BB-23 metrics) — COMPLETION REPORT

> Completion report for **BB-32** (`OPEN_ITEMS_EXECUTION_PLAN.md` §3.6: "tested data-export path for
> A7/A8/A9 evidence via `/internal/metrics` + audit") — and the **metrics half of BB-23** (operator
> metrics endpoint behind the operator key). **Complete.** The trial's validation evidence is now
> extractable as one analyzable aggregate from session one, read-only, operator-key only. Tests:
> **188/188** model golden (unchanged) **+ API pytest 35** (was 30; **+5** in `test_api_metrics`) →
> canonical gate **PASS**. Additive read-only surface — no model/schema/migration change, no golden moved.
>
> Date: 2026-06-12 · Build: … + BB-16 seed gate ✅ + BB-17 equipment coverage ✅ + **BB-32 export ✅**
> (Schema **v10**, unchanged) · Owner: Backend.

---

## 0. Executive summary

| Item | Class | Status | Evidence |
|---|---|---|---|
| **`HushService.validation_export()`** | Read-only aggregate (new) | ✅ Done | trial health + A7/A8/A9 in `sprint1/service.py` |
| **`_summarize_shadow` / `_summarize_overrides`** | Pure summarizers (new) | ✅ Done | dependency-free, unit-testable A8/A9 aggregation |
| **`GET /internal/metrics`** | Operator endpoint (new) | ✅ Done | `api/internal/operator.py`; operator-key only |
| **`tests/test_api_metrics.py`** | API tests (new, +5) | ✅ Done | access control · empty-DB · health+A8+A7 · cohort segmentation · A9 capture |

**Test result:** `model golden 188/188` + `API pytest 35 → rc=0` → `OVERALL … PASS`. API suite:
`core 19 · connection 7 · instruments 4 · metrics 5`. Suite total **223** (188 + 35).

---

## 1. What it exports (`GET /internal/metrics`)

Read-only over the per-request connection; behind the operator key (an athlete bearer token gets 401):

- **`trial_health`** — `athletes`, `sessions`, `sessions_completed`, `observations` (BB-23 / §6.4 trial
  visibility; for running the trial, not athlete-facing analytics).
- **`a8_shadow_paired`** (A8) — the within-set paired comparison of the model's reps prediction vs the
  fixed non-learning counterfactual (`sim/shadow.py`), both scored at the **same** actual reps:
  `n_pairs`, `model_mean_abs_err`, `shadow_mean_abs_err`, `model_no_worse_than_shadow_frac`. **Directional
  diagnostic only** (DX-12/DX-14 — reps-prediction is not a gated success metric); the absolutes are
  meaningful only on real actuals.
- **`a9_overrides`** (A9) — `override_rate` over all observations, `by_category` counts, and the captured
  override rows **verbatim** (`override_category`, `override_target`, capability/exercise/week) — the
  lossless BB-7 capture, the richest learning signal.
- **`a7_first_session_by_cohort`** (A7) — each athlete's **first** session, segmented by cohort
  (`sex/experience`): `n_athletes`, `n_blocks`, `first_rep_shortfall_frac` (any set under `target_reps` =
  a realized too-heavy), and per-capability prescribed-load `mean_weight` / `max_weight`. **This is the
  *data* behind the week-1 seed-safety gate** — its pass/fail **thresholds are OD-8 and are deliberately
  not applied here** (export, not verdict). Per-session raw chains remain available via the existing
  `GET /internal/audit/sessions/{id}` (BB-12).

Sample (one athlete, one completed session, one LOAD override):

```json
"trial_health": {"athletes":1,"sessions":2,"sessions_completed":1,"observations":6},
"a9_overrides": {"n_overrides":1,"override_rate":0.167,"by_category":{"LOAD":1},
                 "rows":[{"override_category":"LOAD","override_target":60.0,"capability":"knee_dominant",...}]},
"a7_first_session_by_cohort": {"male/intermediate":{"n_athletes":1,"n_blocks":3,"first_rep_shortfall_frac":0.0,
                 "per_capability":{"knee_dominant":{"n":1,"mean_weight":55.0,"max_weight":55.0}, ...}}}
```

---

## 2. As-built notes

- **A9 overrides are server-detected**, not a client field: `lifecycle.report_set` records a `LOAD`
  override whenever the logged `actual_weight` deviates from the prescription (BB-7). The set-report
  schema is `extra="forbid"` (a stray field is a model-boundary 422), so the export reads overrides from
  the persisted `observation.override_category/override_target` — the test drives a heavier `actual_weight`
  and asserts the override surfaces with its target captured losslessly.
- **First-session selection is deterministic**: per athlete, the session with the smallest
  `(session_index, created_at)`. (`/complete` pre-composes the *next* session, so `sessions` can exceed
  `sessions_completed` — the A7 view keys on the first only.)
- **Pure summarizers** (`_summarize_shadow`, `_summarize_overrides`) are module-level and DB-free, so the
  A8/A9 aggregation is unit-testable independent of the API.

---

## 3. Acceptance criteria

- [x] `GET /internal/metrics` live behind the operator key; athlete token → 401; missing key → 401.
- [x] Empty DB returns a well-formed zeroed aggregate (no error).
- [x] A8 shadow pairs, A9 override log, and A7 cohort-segmented first-session loads all populate from a
      real driven session; cohort segmentation verified across two cohorts.
- [x] A9 override captured verbatim (category + lossless target) via the server-detected path.
- [x] **No model/schema/migration change**; 188/188 model unchanged; API 30 → **35**; gate **PASS**.
- [x] A7 **thresholds NOT applied** here (OD-8) — export surfaces the data; the gate verdict is BB-11.

---

## 4. Rollback

Code-only, read-only. Remove `validation_export` + the two summarizers from `service.py`, the
`/internal/metrics` route, and `test_api_metrics.py` (+ its two assembler entries). Nothing writes; no
data or schema involved.

---

*Completion report only. An additive read-only operator export over existing persisted instruments
(`shadow_recommendation`, `observation.override_*`, first-session blocks ⋈ athlete cohort): no model/
schema/migration change, no golden moved (188/188; API 30→35). Implements BB-32 + the metrics half of
BB-23; the A7 gate verdict/thresholds remain BB-11/OD-8. Trace: `OPEN_ITEMS_EXECUTION_PLAN.md` BB-32/BB-23;
Beta-Readiness §5.1/§6.4/§9.5; BB-10 instruments; BB-12 audit.*
