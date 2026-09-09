# DX-09_COMPLETION_REPORT.md — M5 stagnation detection (read-only, advisory)

> Completion report for **DX-09** (Delta Plan P1, Large — **M5 stagnation detection**), executed per
> `reviews/implementation/DX-09_EXECUTION_PACKAGE.md`, implementing **`HUSH_V1_PRODUCT_SPECIFICATION.md`
> §12 (Stagnation Detection)** and §13 (the volume-only, acceptance-gated lever). **DX-09 is complete.**
> Tests: **156/156 passing** (was **143/143**; **+13 net-new** — 12 in `test_sprint6`, 1 migration-009
> test in `test_wave1`; **3 Wave-1 drift-guard assertions re-golded in place** to Schema v9). M5 is
> **read-only and advisory**: it reads the learned score history and surfaces **at most one insight, one
> advisory `CHANGE_STRATEGY` recommendation, and one acceptance-gated volume option** per week; it authors
> no load, changes no score, and **applies nothing**. **No ① core-math change.** Binding Delta-Plan note
> honored: **ES-013 active investigation is NOT shipped** — M5 is detection only.
>
> Date: 2026-06-11 · Build: Sprint 0–4 ✅ + Wave 1 ✅ + DX-07/04/03 ✅ + M1 ✅ + DX-11 ✅ + **DX-09 ✅**
> (Schema **v8 → v9**) · Owner: Model/Backend.

---

## 0. Executive summary

| Item | Class | Status | Evidence |
|---|---|---|---|
| **`hush_model/stagnation.py`** | Pure detection (new) | ✅ Done | ported trend primitives + `classify_trend` (5 states) + `detect_imbalance` + `assess` (≤1/≤1/≤1) + entities |
| **`stagnation_service.py`** | Persistence engine (new) | ✅ Done | history read (`state_update_log`⋈`evidence`) + session count + marker; `StagnationEngine.weekly_review` read-only |
| **`stagnation_marker`** | Additive infra (migration 009, v9) | ✅ Done | cooldown memory; `schema.py` + migration + runner registration |
| **`CHANGE_STRATEGY` reasons / volume lever** | Additive wiring | ✅ Done | `decision.py` 3 reason codes; `volume.next_volume_band` (acceptance-gated) |
| **Read-only / nothing applied** | Invariant | ✅ Verified | probe: score/confidence/sum_w unchanged by `weekly_review`; only the marker is written |

**Test result:** `==== 156/156 passed ====` — per-suite:
`sprint0 12 · sprint1 10 · sprint2 27 · sprint3a 18 · sprint3b1 18 · sprint3b2 26 · sprint4 20 · wave1 10 · sprint5 3 · sprint6 12`.
Baseline before DX-09 was **143/143** (`wave1 9`, no `sprint6`). Net: **sprint6 +12**, **wave1 +1**
(migration-009 test); the 3 Wave-1 version assertions were re-golded **in place** ([2..8]/8 → [2..9]/9).

**Behavioral effect (verified, not assumed — direct probe on the assembled tree):** a confident capability
(`confidence 99.5`) with **8 sessions in the 4-week window** and a flat-to-slightly-declining learned-score
history (`change −0.209`, within its variance `band 0.250`, `agreement 0.999`) is classified **Stalled
(stagnation event)**. The weekly review surfaces exactly **one insight** ("horizontal_push is stalled over
the last weeks"), **one advisory recommendation** (`decision_type=CHANGE_STRATEGY`,
`reason=change_strategy:stagnation_stalled`, `advisory=True`), and **one acceptance-gated volume option**
(`moderate → high`, `requires_acceptance=True`), and writes the cooldown **marker** (`week=8.0`, `Stalled`).
The review is **read-only**: `score 47.7629 == 47.7629`, `confidence 99.5272 == 99.5272`, `sum_w` unchanged.

---

## 1. Requirement compliance (the execution-package instructions)

| Requirement | Result |
|---|---|
| Per-capability trend state over a 4-week window (slope + variance band + confidence/agreement gates) | ✅ `classify_trend` → Progressing / Holding / Stalled / Regressing / Calibrating; Stalled/Regressing are events. |
| ≥6 sessions eligibility; conf 30/70 tiers; low-agreement suppression | ✅ encoded per §12 (`STAGNATION_MIN_SESSIONS`, `_CONF_FLOOR/_ACTIONABLE`, `_AGREEMENT_GATE`). |
| Imbalance read (median gap across the 5 Class-A, conf ≥ 30 only) | ✅ `detect_imbalance`; lagging-and-event is the highest-priority target. |
| ≤1 insight / ≤1 advisory recommendation / ≤1 acceptance-gated volume option | ✅ `assess`; recommendation is `CHANGE_STRATEGY` advisory; volume option is the next band, acceptance-gated. |
| 4-week cooldown / anti-repetition | ✅ `stagnation_marker` + `_cooldown_suppressed` (unchanged state within window suppressed; state change re-opens). |
| Score-history read from `state_update_log` | ✅ `StagnationRepository.score_series` (`state_update_log`⋈`evidence.source_week`); session count from `observation`. |
| Read-only; nothing applied automatically | ✅ `weekly_review` mutates no model state (probe-verified); the volume change is an **option** (§13). |
| ES-013 active investigation NOT shipped with M5 | ✅ detection only; no investigation engine. |
| Run the canonical assembler + full suite | ✅ `python build/_verify/assemble_and_test.py` → **156/156**. |
| Produce a completion report (DX-07/04/03/M1/DX-11 format) | ✅ This document. |

---

## 2. What was delivered

### New — `implementation/sprint6/stagnation.py` → `hush_model/stagnation.py` (pure, I/O-free)
- **Trend primitives** ported from `sim/metrics.py` and made model-resident: `window_slope` (**signed** —
  the model needs direction), `oscillation`, `reversals`.
- **`classify_trend`** — the five-state classifier: Calibrating below confidence 70 or with insufficient
  data; else Progressing if the modeled window change clears the variance band upward, Holding if low
  agreement suppresses the call, Regressing if it clears downward, otherwise Stalled (genuine flat).
- **`detect_imbalance`** — median across confident (≥30) capabilities; lagging if `median − score ≥ gap`.
- **`assess`** — the ≤1/≤1/≤1 weekly surfacing with lagging-event priority and the cooldown filter;
  "nothing notable" → all None (program left unchanged, §13).
- Frozen entities: `TrendReport`, `StagnationInsight`, `StagnationRecommendation` (`advisory=True`),
  `VolumeOption` (`requires_acceptance=True`), `StagnationAssessment`.

### New — `implementation/sprint6/stagnation_service.py` → `hush_model/persistence/stagnation_service.py`
- **`StagnationRepository`** — `score_series` (`state_update_log`⋈`evidence`), `sessions_in_window`
  (`observation`), `get_marker` / `upsert_marker`.
- **`StagnationEngine.weekly_review(athlete_id, week)`** — reads current state + history, computes
  σ²_recent/agreement from the variance moments (`variance.py`), classifies each Class-A capability,
  detects imbalance, assembles the assessment, **writes only the cooldown marker** for the surfaced
  capability, and returns the advisory assessment. Mutates **no** model state.

### New — `implementation/sprint6/migration_009_stagnation.py` → migrations
`stagnation_marker(athlete_id, capability, last_surfaced_week, last_surfaced_state, updated_at)` — additive,
idempotent (`VERSION=9`, `_NEW_TABLES`); the anti-repetition memory.

### New — `implementation/sprint6/test_sprint6.py` → `tests/test_sprint6.py` (12 tests)
5 classify-state cases · 2 imbalance · 3 assess/priority/nothing-notable · 1 cooldown (3-way) · 1 end-to-end
`weekly_review` (event detected + advisory rec + read-only + marker).

### Edits (all additive)
- `constants.py` — M5 thresholds (spec values; band/agreement/gap knobs marked **provisional**).
- `decision.py` — `REASON_STAGNATION_STALLED/_REGRESSING/_IMBALANCE` (additive; **no `govern()` change**).
- `volume.py` — `next_volume_band` (the acceptance-gated lever; pure, applies nothing).
- `schema.py` / `migrations_runner.py` — `stagnation_marker` table + register migration 009
  (`SCHEMA_VERSION==9`).
- `wave1/test_wave1.py` — 3 drift-guard assertions re-golded to v9 + `test_migration_009_additive_and_idempotent`.
- `build/_verify/assemble_and_test.py` — MAP entries (`stagnation.py`, `stagnation_service.py`,
  `migration_009`, `test_sprint6`) + `tests.test_sprint6` in the suite list.

---

## 3. Files changed

**New source (`implementation/sprint6/`):** `stagnation.py`, `stagnation_service.py`,
`migration_009_stagnation.py`, `test_sprint6.py`.
**Edited source:** `sprint0/constants.py`, `sprint3a/decision.py`, `sprint3b2/volume.py`,
`sprint1/schema.py`, `wave1/migrations_runner.py`, `wave1/test_wave1.py`, `build/_verify/assemble_and_test.py`.
**Documentation:** `DX-09_EXECUTION_PACKAGE.md`; this report.

**Unchanged (deliberately):** ① core math; `pipeline.py` / `recommendation.py` / `evidence.py` /
`state_update.py` / `composition.py` (M5 reads, never calls into the load/learning path); `decision.govern()`
logic; `domain.py` (entities live in the self-contained `stagnation.py` — documented placement choice); all
prior model behavior (M1 / DX-11 / DX-03 / DX-04). **No load authority, nothing applied.**

**Entity placement note:** the Delta Plan suggested the trend/insight entities in `domain.py`; they live in
the new `hush_model/stagnation.py` instead (cohesion + minimal blast radius). Placement-only, no behavior
difference; `domain.py` is untouched.

---

## 4. Acceptance checklist (from the Execution Package §9)

- [x] `stagnation.py`: ported primitives + `classify_trend` (5 states, conf/agreement gates, variance band) + `detect_imbalance` (median gap) + `assess` (≤1/≤1/≤1, priority, cooldown) + entities.
- [x] `stagnation_service.py`: history read (`state_update_log`⋈`evidence`), session count, marker; `weekly_review` read-only + marker write.
- [x] M5 provisional constants added (spec thresholds; band knobs marked provisional).
- [x] `CHANGE_STRATEGY` reason codes added (additive); `volume.next_volume_band` added; **no `govern()` change**.
- [x] migration_009 (`stagnation_marker`, v9) additive + idempotent; `schema.py` table; runner registers (`SCHEMA_VERSION==9`); Wave-1 drift-guard re-golded.
- [x] Tests: 5 classify states · imbalance · assess/cadence (≤1/≤1/≤1) · cooldown · end-to-end `weekly_review` · read-only · migration_009 — all green.
- [x] assembler MAP + suite list updated (`tests.test_sprint6`); `assemble_and_test.py` green; per-suite counts reported (§0).
- [x] ① core, load authority, program/score/volume **unchanged**; ES-013 active investigation **not** shipped.

---

## 5. Verification method & evidence

- **Baseline (pre-change):** `python build/_verify/assemble_and_test.py` → `143/143 passed`.
- **After DX-09:** `156/156 passed` (per-suite in §0). All prior suites green and unchanged in count; the
  only moved goldens are the 3 intended Wave-1 version assertions ([2..8]/8 → [2..9]/9), each documented.
- **Detection is genuine (probe):** a flat-to-slightly-declining confident history (`change −0.209` within
  `band 0.250`, `agreement 0.999`, 8 sessions) → **Stalled** (event, actionable tier) → one insight, one
  `CHANGE_STRATEGY` advisory (`change_strategy:stagnation_stalled`), one `moderate → high` acceptance-gated
  volume option; marker written (`week 8.0`, `Stalled`).
- **Read-only is genuine (probe):** `weekly_review` left `score`, `confidence`, and `sum_w` **identical**;
  the only write is the infra `stagnation_marker`.
- **The five states + imbalance + cooldown are deterministically covered** by the `test_sprint6` unit tests
  (rising → Progressing; flat+agreement → Stalled; falling → Regressing; flat+low-agreement → Holding;
  low-conf / few-sessions → Calibrating; median-gap imbalance; cooldown suppress-then-reopen).

---

## 6. Out of scope / explicitly not done (owned by other DX)

- **ES-013 active investigation** — **not shipped** (binding Delta-Plan note); M5 is detection only. DX-13
  retires ES-013 in documentation.
- **DX-13 / DX-14 / DX-15 / DX-16 / DX-17** — spec/assumption/canonical re-statement to "detection = M5,
  ES-013 retired, success = program/stagnation" — **documentation, downstream; not done here.**
- **DX-12** — Phase-0 instrumentation/gate repoint (depends on DX-19) — separate.
- **Applying** any recommendation or volume change — **never**; the volume option is acceptance-gated (§13)
  and the recommendation is advisory. M5 surfaces; it does not act.
- **① core math / load authority** — untouched.

---

## 7. DX-09 Definition-of-Done

- [x] Per-capability trend detection (5 states) over a 4-week window on the **learned** score (fed by real performance — M1), gated by confidence/agreement against the capability's own variance band.
- [x] Imbalance (relative-weakness) read across the five Class-A capabilities; lagging-and-event is the priority target.
- [x] Weekly surfacing of **≤1 insight / ≤1 advisory `CHANGE_STRATEGY` recommendation / ≤1 acceptance-gated volume option**, with a 4-week anti-repetition cooldown.
- [x] **Read-only and advisory** — no load authority, no score/program/volume mutation; the only write is the infra cooldown marker (probe-verified).
- [x] Additive schema (`stagnation_marker`, v9); fresh == migrated; ① core + M1 + DX-11 + DX-03/04 untouched; ES-013 not shipped.
- [x] Suite green at **156/156**; only the 3 intended Wave-1 version assertions moved, each documented.

**DX-09 is closed.** M5 stagnation detection is implemented, validated, and documented.

---

## 8. Recommended next step (not executed)

Per the Delta Plan, the **P2 documentation pass** that M5 unblocks — **DX-13** (retire ES-013 / restate the
affected specs to advisory + "detection = M5"), **DX-14** (success definition), **DX-15** (canonical
re-status), **DX-16/17** (assumptions / consolidated inputs) — is the next tranche. The web-shell Wave-2
batches (BB-1/9/14/19) that wrap the DX-11 runtime remain the broader backend effort. No further code is
required for M5.

---

*Completion report only. Implementation strictly within DX-09 as scoped; no ① core-math change, no load
authority, nothing applied, no ES-013 active investigation, no redesign. Verified at 156/156 with a
read-only, probe-confirmed weekly review. Traceability: `DX-09_EXECUTION_PACKAGE.md` ·
`HUSH_V1_PRODUCT_SPECIFICATION.md` §12/§13 · `HUSH_V1_DELTA_EXECUTION_PLAN.md` (DX-09) · `sim/metrics.py` ·
M1 (DX-01/02).*
