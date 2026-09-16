# DX-09_EXECUTION_PACKAGE.md — M5 stagnation detection (read-only, advisory)

> **Scope:** the implementation delta for **DX-09** (Delta Plan P1, Large) — **M5 stagnation detection**:
> a **read-only**, weekly, per-capability trend + imbalance read over the learned score history, mapping to
> **≤1 insight / ≤1 advisory recommendation / ≤1 acceptance-gated volume option**, with a 4-week
> anti-repetition cooldown. Implements **`HUSH_V1_PRODUCT_SPECIFICATION.md` §12 (Stagnation Detection)**
> and §13 (the volume-only, acceptance-gated lever). Depends on DX-01/DX-02 (✅, M1 — stagnation is
> untrustworthy until the score is fed by real performance). Implementation only — **no ① core-math
> change, no load authority, nothing applied automatically**.
>
> **Binding (Delta Plan note):** do **not** ship ES-013 active investigation alongside M5 — M5 is the
> **detection** path only; it surfaces insight/advice and never investigates or acts. DX-13 retires ES-013
> (documentation, downstream).
>
> **Baseline:** Sprint 0–4 ✅ + Wave 1 ✅ + DX-07/04/03 ✅ + M1 ✅ + DX-11 ✅ · Schema **v8** · **143/143**.
> Date: 2026-06-11. Trace: Delta Plan DX-09; Product Spec §12/§13; `sim/metrics.py` trend primitives;
> Gap Review M5.

---

## 1. The change in one paragraph

M5 reads the **per-capability learned score history** over a trailing **4-week window** and classifies each
capability into one of five **trend states** — *Progressing / Holding / Stalled / Regressing / Calibrating*
— using the OLS slope against the capability's **own recent-variance band**, gated by **confidence** (the
spec's 30 / 70 tiers) and **agreement** (low agreement suppresses the call). It computes an **imbalance**
read (the median score across the confident Class-A capabilities; a capability meaningfully below it is a
relative weakness) and the highest-priority target is a capability that is **both lagging and a stagnation
event** (Stalled/Regressing). It then surfaces **at most one insight, one advisory recommendation
(`CHANGE_STRATEGY`), and one acceptance-gated volume option** (next band up within the established bands),
respecting a **4-week cooldown** (a plateau is not re-surfaced until its state changes or the cooldown
elapses). Everything is **read-only and advisory**: it writes only an infra `stagnation_marker` (the
cooldown memory) and **never** changes the program, load, score, or volume. New: a pure `hush_model/
stagnation.py` (trend primitives ported from `sim/metrics.py` + classify + imbalance + assess), a
persistence `StagnationEngine` that reads the score history and composes the pure assessment, migration 009
(`stagnation_marker`, Schema v9), additive `CHANGE_STRATEGY` reason codes, and the volume-lever helper.

---

## 2. Source-of-truth note

`build/_assembled/` is generated — edit `implementation/` only and add new snapshots to the assembler `MAP`.

| Symbol / change | Source-of-truth file | Assembled dest |
|---|---|---|
| Pure stagnation model (primitives + classify + imbalance + assess + entities) | `implementation/sprint6/stagnation.py` | `hush_model/stagnation.py` |
| Stagnation persistence engine + repo (history read + marker) | `implementation/sprint6/stagnation_service.py` | `hush_model/persistence/stagnation_service.py` |
| `stagnation_marker` migration (NEW) | `implementation/sprint6/migration_009_stagnation.py` | `hush_model/persistence/migrations/migration_009_stagnation.py` |
| DX-09 tests (NEW) | `implementation/sprint6/test_sprint6.py` | `tests/test_sprint6.py` |
| M5 provisional constants | `implementation/sprint0/constants.py` | mirror |
| `CHANGE_STRATEGY` stagnation reason codes | `implementation/sprint3a/decision.py` | mirror |
| acceptance-gated volume lever | `implementation/sprint3b2/volume.py` | mirror |
| `stagnation_marker` table for fresh DBs | `implementation/sprint1/schema.py` | mirror |
| runner registration + `SCHEMA_VERSION` 9 | `implementation/wave1/migrations_runner.py` | mirror |
| Wave-1 drift-guard re-gold + migration-009 test | `implementation/wave1/test_wave1.py` | mirror |
| assembler MAP + suite list | `build/_verify/assemble_and_test.py` | (itself) |

> **Entity placement (documented):** the trend/insight dataclasses live in the new, self-contained
> `hush_model/stagnation.py` (cohesion + minimal blast radius), **not** in `domain.py`. The Delta Plan
> suggested `domain.py`; this is a placement-only choice with no behavior difference — `domain.py` core
> entities are left untouched.

---

## 3. M5 constants (provisional — `constants.py`, Phase-0 calibratable)

Encode the spec's stated thresholds; the two band knobs are conservative provisional defaults (marked, like
the rest of the model's provisional constants — not tuned to a scenario).

```python
STAGNATION_WINDOW_WEEKS      = 4.0     # §12 trailing window
STAGNATION_MIN_SESSIONS      = 6       # §12 ≥6 logged sessions in window, else "insufficient data"
STAGNATION_CONF_FLOOR        = 30.0    # §12 below 30 -> no call at all
STAGNATION_CONF_ACTIONABLE   = 70.0    # §12 ≥70 -> actionable; 30–<70 -> advisory "watch"
STAGNATION_AGREEMENT_GATE    = 0.5     # §12 low agreement suppresses the call (provisional)
STAGNATION_BAND_Z            = 1.0     # band = Z·sqrt(σ²_recent) (provisional)
STAGNATION_BAND_FLOOR        = 0.25    # score-unit floor so a zero-variance flat still has a band (provisional)
IMBALANCE_MEDIAN_GAP         = 5.0     # §12 "meaningfully below median" (provisional, score units)
STAGNATION_COOLDOWN_WEEKS    = 4.0     # §12 anti-repetition cooldown
```

---

## 4. Pure model — `hush_model/stagnation.py` (I/O-free)

**4.1 Trend primitives (ported from `sim/metrics.py`, made model-resident):** `window_slope(series)` (OLS
slope, signed — the model needs the *sign*, unlike the harness's `drift_vs_flat` magnitude),
`oscillation(series)`, `reversals(series)`. (`sim/metrics.py` keeps its own copies; the harness is not in
the deployable — the Delta Plan's "port into the model" = make them available to `hush_model`.)

**4.2 Trend states.** Constants `PROGRESSING / HOLDING / STALLED / REGRESSING / CALIBRATING`; `STAGNATION_EVENTS = {STALLED, REGRESSING}`.

**4.3 `classify_trend(scores, confidence, sigma2_recent, agreement, sessions_in_window) -> TrendReport`:**
```
tier = "none" if conf < 30 else "watch" if conf < 70 else "actionable"
eligible = sessions_in_window >= STAGNATION_MIN_SESSIONS and len(scores) >= 2
if not eligible or conf < STAGNATION_CONF_ACTIONABLE:
    state = CALIBRATING                                   # §12 "still learning … never stagnation"
    watch_flat = (tier == "watch" and eligible and change <= band)   # soft-insight eligibility (30–70)
else:
    change = window_slope(scores) * (len(scores) - 1)     # modeled change across the window
    band   = max(STAGNATION_BAND_FLOOR, STAGNATION_BAND_Z * sqrt(sigma2_recent))
    if change > band:                      state = PROGRESSING
    elif agreement < STAGNATION_AGREEMENT_GATE: state = HOLDING       # §12 low agreement SUPPRESSES the call
    elif change < -band:                   state = REGRESSING
    else:                                  state = STALLED           # genuine flat within the band
is_event = state in STAGNATION_EVENTS
return TrendReport(capability, state, is_event, tier, slope, change, band, agreement, sessions_in_window, watch_flat)
```
*Holding* = not-progressing but the call is suppressed by conflicting recent evidence (agreement gate) — a
spec-faithful, non-event "hold steady." *Calibrating* = below 70 or insufficient data.

**4.4 `detect_imbalance(scores_by_cap, confidences) -> {cap: lagging_bool}`:** median of the scores whose
confidence ≥ `STAGNATION_CONF_FLOOR`; a capability is `lagging` iff `median − score >= IMBALANCE_MEDIAN_GAP`
(§12). Capabilities below the confidence floor are not lagging-flagged (and don't enter the median).

**4.5 `assess(reports, lagging, markers, week) -> StagnationAssessment`** (the ≤1/≤1/≤1 surfacing, §12 cadence):
- **candidate events** = actionable-tier capabilities with `is_event`, **not** under cooldown
  (`marker.last_surfaced_week + COOLDOWN > week` AND `marker.state == report.state` ⇒ suppressed; a state
  change re-opens surfacing).
- **target** = the highest-priority candidate: *lagging ∧ event* first (Stalled ranked with Regressing),
  then any event, tie-broken by `CAPABILITY_PRIORITY_ORDER`.
- **insight** (≤1): the target's plateau if any; else an imbalance note (a lagging cap that is *not*
  progressing); else a watch-tier soft insight (`watch_flat`); else `None` ("nothing notable — program
  unchanged", §13).
- **recommendation** (≤1): for the target only, `decision_type=CHANGE_STRATEGY` +
  `REASON_STAGNATION_*` — **advisory**, never applied.
- **volume_option** (≤1): for the target only, the **next volume band up** (`volume.next_volume_band`),
  acceptance-gated (§13); `None` if already at `high` or no target.
- returns `StagnationAssessment(reports, insight, recommendation, volume_option, surfaced_capability)`.

Entities (frozen dataclasses): `TrendReport`, `StagnationInsight`, `StagnationRecommendation`,
`VolumeOption`, `StagnationAssessment`.

---

## 5. Persistence — `hush_model/persistence/stagnation_service.py`

**`StagnationRepository(conn)`** (reads; one marker write):
- `score_series(athlete_id, capability, since_week)` → `[new_score …]` ordered by week:
  `SELECT sul.new_score, ev.source_week FROM state_update_log sul JOIN evidence ev ON sul.evidence_id=ev.id
   WHERE sul.athlete_id=? AND sul.capability=? AND ev.source_week >= ? ORDER BY ev.source_week, sul.rowid`.
- `sessions_in_window(athlete_id, capability, since_week)` → count of **distinct** `workout_session_id` in
  `observation` for the capability with `week >= since_week`.
- `get_marker` / `upsert_marker(athlete_id, capability, week, state)`.

**`StagnationEngine(db)`**: `weekly_review(athlete_id, week) -> StagnationAssessment`:
1. `load_athlete_state` → per Class-A capability: `score`, `confidence`, and `σ²_recent` + `agreement` from
   `var_w/var_ws/var_ws2` (via `variance.recent_variance` / `variance.agreement`).
2. per capability: `score_series` + `sessions_in_window` over `[week − WINDOW, week]`.
3. `classify_trend` per capability; `detect_imbalance` across capabilities; read markers.
4. `assess(...)` → assessment.
5. **write the marker** for the surfaced capability only (`last_surfaced_week=week`, `last_surfaced_state`).
6. return the assessment. **No program/score/volume mutation** — read-only + the infra marker.

---

## 6. Additive wiring

- **`decision.py`**: add `REASON_STAGNATION_STALLED = "change_strategy:stagnation_stalled"`,
  `REASON_STAGNATION_REGRESSING = "change_strategy:stagnation_regressing"`,
  `REASON_STAGNATION_IMBALANCE = "change_strategy:imbalance_relative_weakness"`. `CHANGE_STRATEGY` already
  exists (signal-only). **No `govern()` logic change.**
- **`volume.py`**: `next_volume_band(weekly_volume) -> str | None` — the next of `WEEKLY_VOLUME_BANDS`
  (`low→moderate→high`), `None` at `high`. The acceptance-gated lever (§13). Pure; nothing applied.
- **schema.py / migration 009 / runner**: additive `stagnation_marker(athlete_id, capability,
  last_surfaced_week, last_surfaced_state, updated_at, PRIMARY KEY(athlete_id, capability))`; migration_009
  (`VERSION=9`, `_NEW_TABLES`); runner registers it → `SCHEMA_VERSION==9`.

---

## 7. Tests (`implementation/sprint6/test_sprint6.py`) + Wave-1 re-gold

- **classify_trend** unit cases: rising series → Progressing; genuine flat (good agreement, ≥70, ≥6
  sessions) → Stalled (event); falling → Regressing (event); flat with **low agreement** → Holding
  (suppressed); conf < 70 or < 6 sessions → Calibrating (never event).
- **imbalance**: a capability `IMBALANCE_MEDIAN_GAP` below the confident median → lagging; the median uses
  only conf ≥ 30 capabilities.
- **assess / cadence**: ≤1 insight, ≤1 rec, ≤1 volume option; *lagging ∧ Stalled* is the chosen target;
  the rec is `CHANGE_STRATEGY` advisory; the volume option is the next band; **"nothing notable"** when all
  Progressing/Calibrating.
- **cooldown / anti-repetition**: a surfaced plateau is **not** re-surfaced within 4 weeks while its state
  is unchanged; a state change re-opens it.
- **end-to-end `StagnationEngine.weekly_review`** on a persisted DB: build a flat-score history for a
  capability (≥6 sessions, conf ≥ 70) via the event-driven runtime or seeded state-update rows, run the
  review, assert a Stalled event + advisory rec + marker written; and a **read-only** assertion (score /
  confidence / program unchanged by the review).
- **migration_009** additive + idempotent (in `test_wave1.py`); **Wave-1 re-gold** `[2..8]/8 → [2..9]/9`.

---

## 8. Invariants preserved

- **① core untouched**; no load authority; **nothing applied** — M5 reads and advises only (§13: the only
  initiated change is an *acceptance-gated* volume option, surfaced here as an **option**, not applied).
- **Read-only w.r.t. model state** — writes only the infra `stagnation_marker`; score/confidence/program
  are not mutated by `weekly_review` (asserted).
- **ES-013 active investigation NOT shipped** — detection only (binding Delta-Plan note).
- **Additive schema** — `stagnation_marker` infra table; fresh == migrated at v9 (drift guard + migration
  test). DX-11 / M1 / DX-03/04 behavior untouched.

---

## 9. Acceptance checklist

- [ ] `hush_model/stagnation.py`: ported primitives + `classify_trend` (5 states, conf/agreement gates, variance band) + `detect_imbalance` (median gap) + `assess` (≤1/≤1/≤1, priority, cooldown) + entities.
- [ ] `stagnation_service.py`: history read (state_update_log⋈evidence), session-count, marker; `StagnationEngine.weekly_review` read-only + marker write.
- [ ] M5 provisional constants added (spec thresholds; band knobs marked provisional).
- [ ] `CHANGE_STRATEGY` reason codes added (additive); `volume.next_volume_band` added; **no `govern()` change**.
- [ ] migration_009 (`stagnation_marker`, v9) additive + idempotent; schema.py table; runner registers (`SCHEMA_VERSION==9`); Wave-1 drift-guard re-golded.
- [ ] Tests: classify (5 states) · imbalance · assess/cadence (≤1/≤1/≤1) · cooldown · end-to-end weekly_review · read-only · migration_009. All green.
- [ ] assembler MAP + suite list updated (`tests.test_sprint6`); `assemble_and_test.py` green; per-suite counts reported.
- [ ] ① core, load authority, program/score/volume **unchanged**; ES-013 active investigation **not** shipped.

---

## 10. Dependencies, ordering, rollback

- **Upstream:** DX-01/DX-02 (✅, M1) — the truthful score M5 reads.
- **Downstream (NOT here):** **DX-13** (retire ES-013 / restate specs to "detection = M5"), **DX-14**
  (success definition), **DX-12** (instrumentation repoint) — documentation/instrumentation.
- **Rollback (code-only):** drop `implementation/sprint6/*`, the schema table, the runner registration, the
  constants/reason-codes/volume-lever additions, the MAP entries; revert the Wave-1 re-gold. No model data
  migration; `stagnation_marker` is infra; learned state is untouched (M5 never wrote it).

---

*Execution package only — implements Product Spec §12/§13 within DX-09's bounded, read-only, advisory scope.
No ① core-math change, no load authority, nothing applied, no ES-013 active investigation. Trace: Delta Plan
DX-09; `HUSH_V1_PRODUCT_SPECIFICATION.md` §12/§13; `sim/metrics.py`; M1 (DX-01/02).*
