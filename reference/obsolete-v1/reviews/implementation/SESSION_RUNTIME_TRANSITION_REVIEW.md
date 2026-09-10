# SESSION_RUNTIME_TRANSITION_REVIEW.md — In-Process → Event-Driven Fidelity Review

> **Fidelity review only.** It traces the current in-process `SessionEngine.run_session` execution and the
> future event-driven API execution (`SERVER_BUILD_PLAN_V1.md` §7/§8), verifies that the ratified
> invariants and the capability / fatigue / progression / persistence semantics remain identical, and
> identifies the implementation risks and accidental-divergence points before a line of Wave-2 code is
> written. **It redesigns nothing, changes no architecture, and changes no model behavior.** Where it finds
> a question that touches model behavior, it **flags it for model review rather than resolving it.**
> Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-11 · Build: Sprint 0–4 ✅ + Wave 1 ✅ (131 tests, schema v6) · Scope: the transition only.
> Source verified against: `implementation/sprint3b2/session.py` (`SessionEngine`),
> `implementation/sprint1/pipeline.py` (`report_set_fatigue_aware`, `complete_block`,
> `_record_block_decision`), `repositories.py`, `API_CONTRACT_V1.md`, `SERVER_BUILD_PLAN_V1.md`.

---

## 0. Verdict (read first)

**Bit-for-bit fidelity to `SessionEngine` is achievable** in the event-driven path, because the only
athlete input the pipeline consumes is **reps** (`perform → actual_reps`); everything else is recomputed
deterministically from persisted state. Identical inputs in identical order ⇒ identical
recommendation/observation/evidence/state-update trajectory.

To achieve it, the event-driven path **must** satisfy five conditions (each a finding below):
1. **All `complete_block` calls deferred to `POST /complete`**, in `CAPABILITY_PRIORITY_ORDER`, exactly as
   `SessionEngine` steps 4–5 — **not** fired per block (R2 risk → §5.1).
2. A **persisted per-capability session accumulator** (entry score, primary-slot decision/weight/s_obs)
   carried across the separate set-report requests (§5.2).
3. **Strict per-athlete, in-order, serialized** application of set events (§5.4).
4. **`week` taken from the session row**, never the request; **`govern=False`** on every set (§5.3/§5.5).
5. The **idempotency record committed in the same transaction** as the learning chain (§5.6).

**One item (F1) was surfaced and has since been RESOLVED as a contract clarification — not a model
decision** (`reviews/implementation/F1_CLARIFICATION_REPORT.md`, 2026-06-11). Verification confirmed the
**validated system is already reps-only**: every learning path uses `recommended_weight` as the effective
load (`actual_weight` is invariantly the recommended weight), and no validated behavior depends on an
athlete-reported `actual_weight`. The remedy was wording in `API_CONTRACT_V1.md` (`actual_weight` = audit/A9
metadata, **not** a learning input), **not** a model-review decision. **There is no blocking pre-condition.**
Details in **§6.1**.

---

## 1. Current execution path (in-process `SessionEngine.run_session`)

One synchronous call runs the whole session (`session.py`). Numbered to match the code:

1. **Snapshot + compose (one read txn).** `load_athlete_state` → `compose_session(ath, strategy,
   session_index, seed, week)` — pure, **load-free** (ES-009 Inv. 3), deterministic from the persisted seed.
2. **Open session + persist blocks (one txn).** `create_session(... exploration_seed, session_index,
   weekly_frequency, weekly_volume, calibration_phase ...)` (ES-009 §9 audit snapshot), then for each
   composed block: `get_capability_state` → `recommend(cap, exercise, df, target_reps)` (**rested**, no
   fatigue args) → `add_block(... recommended_weight ...)`. *This persisted block weight is the **display**
   weight; the learning chain recomputes its own per-set weight (see §6.1).*
3. **Run each block's sets (per-set txn) + accumulate.** For each block, for `set_number` 1..`target_sets`:
   `report_set_fatigue_aware(..., govern=False)`. Per set, inside **one transaction** (`pipeline.py`):
   read `cap_state` + systemic fatigue → decay both forward on independent clocks (`TAU_SYS`,
   `TAU_CAP[c]`) → **recompute** `recommend(cap_state, fatigue_systemic=fs, fatigue_capability=fc)` →
   `perform(rec) → actual_reps` → write `set_record` + `observation` (`actual_weight = rec.recommended_weight`)
   → de-fatigue → `observation_to_evidence` → variance moments + `apply_evidence` (agreement-damped) →
   generate/accumulate fatigue → `write_capability_state` + `write_systemic_fatigue` + `state_update_log`.
   The driver accumulates a per-capability `_CapMemory`: `entry` = `score_before` of the capability's first
   set; `s_obs`/`decision_type`/`recommended_weight` from the **primary slot** (set 1 for decision/weight,
   last set for `s_obs`); `have_primary` once the primary block is seen. After a block's sets:
   `set_block_status(completed)`.
4. **Advance decision memory once per capability (per-cap txn).** For each capability in
   `sorted(mem, key=_cap_rank)` (i.e. `CAPABILITY_PRIORITY_ORDER`): `complete_block(athlete_id, capability,
   week, score_at_block_entry=acc.entry, block_s_obs=acc.s_obs, decision_type=acc.decision_type,
   recommended_weight=acc.recommended_weight)` → `_record_block_decision` → `update_streaks(block_surprise =
   s_obs − entry)`, reset-on-fire, write `last_recommended_weight/last_decision/last_decision_week`. **This
   is the ONLY place the ES-006 governor advances** (R2).
5. **Close session (one txn).** Mark remaining blocks completed, `complete_session`, `increment_workout_count`.

**Key facts that drive fidelity:**
- The only athlete input is **reps** (`perform`). Loads, fatigue, evidence, decisions are recomputed from
  persisted state — deterministic.
- `complete_block` (`_record_block_decision`) reads/writes **only that one capability's** `capability_state`
  row; it touches no systemic state and no other capability → **the order of `complete_block` calls is
  result-invariant** (verified §3, F3).
- Each set commits in **its own transaction**; `complete_block` is a **separate transaction**; the session
  close is a third. Transaction granularity is **per set**, already.

---

## 2. Future API-driven execution path (event-driven)

The device runs the frozen plan offline and posts an ordered, idempotent event stream; the server replays
each event through the **same** primitives. Recommended mapping (the SessionEngine-faithful one):

- **`POST /sessions` (compose/start)** ≡ steps 1–2 verbatim: `compose_session` (load-free, persisted seed)
  → `create_session` (audit snapshot) → per block `recommend(rested)` + `add_block`. Returns the frozen
  `Session`.
- **`POST /sessions/{id}/sets` (per set)** ≡ step 3 for one set: idempotency-wrap → `report_set_fatigue_aware
  (..., perform=<reported reps>, week=<session.week>, govern=False)` → **update the persisted per-capability
  accumulator** (entry score on the cap's first set; primary-slot decision/weight/s_obs). Return ack +
  `next` (flow control over the frozen plan).
- **`POST /blocks/{id}/skip`** → `set_block_status(skipped)`; no observation/evidence/state write (new path,
  §6.4).
- **`POST /blocks/{id}/replace`** → `HushService.replace_exercise` (the existing L2 primitive); subsequent
  sets of that block report against the new exercise (new path, §6.5).
- **`POST /sessions/{id}/complete`** ≡ steps 4–5 verbatim: for each capability in `CAPABILITY_PRIORITY_ORDER`
  `complete_block(accumulated)`; then `complete_session` + `increment_workout_count`; then **pre-compose
  next** + **shadow write** (BB-10). `finished_early` → complete with remaining blocks skipped; true abandon
  → `abandon_session` (new edge, §6.6).

**This mapping mirrors `SessionEngine`'s structure exactly** — per-set learning during the session, **all**
`complete_block` calls deferred to session close in priority order. It is the structure the fidelity below
assumes. (The `SERVER_BUILD_PLAN_V1.md` §7 phrasing "call complete_block when the block's last set is
reported" is the **riskier per-block variant**; this review recommends the deferred-to-`complete` variant —
see §5.1 / §6.2.)

---

## 3. Ratified-invariant preservation

| Invariant (source) | How `SessionEngine` enforces it | Event-driven preservation | Verdict |
|---|---|---|---|
| **R2 — one governor update per capability per session** | all sets `govern=False`; `complete_block` once per cap (step 4) | defer **all** `complete_block` to `POST /complete`, once per cap (§5.1) | ✅ if §5.1 honored |
| **R3 — governor memory capability-scoped; df translates load; swap not special-cased** | `recommend` uses df; replace via preference, not load | same `recommend`; replace via `replace_exercise` | ✅ |
| **R4 — deterministic exploration from a persisted seed** | seed persisted on the session row; compose load-free | compose at `POST /sessions`, seed persisted identically | ✅ |
| **ES-009 Inv. 3 — composition is load-free** | compose before any load | unchanged — compose at start | ✅ |
| **Single writer (ES-007)** | only `StateRepository` writes state | pipeline unchanged; web layer writes no model state | ✅ |
| **Transactional audit chain** | per-set atomic chain | per-request atomic chain — **must include the idempotency record** (§5.6) | ✅ if §5.6 honored |
| **Decisions read from state, not history (ES-Founder §34)** | `report_set` reads `cap_state` | identical | ✅ |
| **`complete_block` order-independence** | calls touch only the one cap's row | verified: `_record_block_decision` reads/writes one cap row, no systemic/cross-cap state | ✅ (F3, verified safe) |
| **Single-capability slots only (guarded)** | composition guard | composition unchanged | ✅ |

---

## 4. Are capability / fatigue / progression / persistence updates identical?

Yes — **conditionally bit-for-bit**, because each is a pure function of (persisted state, reps, order):

- **Capability updates** (`apply_evidence`, variance moments): a function of `cap_state` + the set's
  evidence, which is a function of the reported reps and the recomputed recommendation. Identical inputs in
  identical order ⇒ identical `score`/`confidence`/`sum_w`/`var_*`. The new uuids/timestamps differ; the
  **numeric trajectory is identical**.
- **Fatigue updates** (`decay_fatigue` forward, `set_fatigue`, `accumulate`): read systemic fatigue +
  `last_workout_at_week`/`last_trained_at_week` from persisted state, write them back **each set**. Because
  the event-driven path reads/writes the **same persisted `athlete_state`/`capability_state`** per set, the
  accumulation is identical **iff sets are applied in the same order** (§5.4). Fatigue is **order-sensitive
  and serial** — this is the tightest constraint.
- **Progression updates** (ES-006 governor): a pure function of the accumulator (`entry`, primary-slot
  `s_obs`/`decision`/`weight`) via `update_streaks` + reset-on-fire. Identical iff the accumulator carries
  the same values (§5.2) and `complete_block` runs once per cap (§5.1).
- **Persistence semantics**: per-set transaction (same granularity), append-only history (same),
  `complete_block` separate txn (same — now at `POST /complete`), `increment_workout_count` at close (same),
  lifecycle status UPDATEs (same). **Identical**, provided the idempotency record joins the set's
  transaction (§5.6) so atomicity is not split.

**Conclusion:** the four families are identical **iff** the five §5 conditions hold. None requires changing
the pipeline's math; all are about *how the web layer feeds and orders the existing calls*.

---

## 5. Implementation risks (must be engineered correctly)

### 5.1 `complete_block` must fire once per capability, deferred to session close (R2)
`SessionEngine` accumulates a capability across **all its blocks** (primary + secondary slots) and calls
`complete_block` **once** (step 4). A naive "fire `complete_block` when a block's last set arrives" would
fire **multiple times** for a multi-slot capability → the streak/decision memory advances more than once →
**divergence and an R2 violation.** **Mitigation:** defer **all** `complete_block` calls to `POST /complete`,
iterating `CAPABILITY_PRIORITY_ORDER` exactly as step 4. (Resolves the §6.2 divergence.)

### 5.2 The per-capability accumulator must persist across requests
`SessionEngine` holds `mem: dict[cap, _CapMemory]` in process for the whole session. Event-driven, **each
set is a separate request/transaction with no shared memory.** The server must persist, per
(session, capability): `entry` (score before the cap's first set), and the **primary slot's** `decision_type`
/`recommended_weight` (set 1) and `s_obs` (last set), plus `have_primary`. **Mitigation:** a persisted
`session_progress` accumulator (**additive infra table, not model state**), written by the set handler, read
by the complete handler. **Risk if instead recomputed from history:** identifying "first set", "primary set
1", and "primary last set" from rows is fragile and a likely divergence source — prefer the explicit
accumulator.

### 5.3 `week` and `govern` must be pinned
- **`week`**: `SessionEngine` uses one `week` for all sets **and** `complete_block`. The handler must take
  `week` from the **session row**, never a per-request client value — `decay_fatigue` forward, `source_week`,
  and `last_decision_week` all depend on it. A client-supplied week diverges fatigue + audit.
- **`govern`**: every set must be `report_set_fatigue_aware(govern=False)`. Calling the single-set legacy
  `govern=True` path would advance the governor **per set** → double-counting. The set endpoint must never
  set `govern=True`.

### 5.4 Strict per-athlete, in-order, serialized application
Fatigue and the per-set recompute are **stateful and serial**: set N reads the state set N−1 wrote. The
device guarantees one-in-flight, `seq`-ordered delivery (mobile §6.2), but the **server must enforce** it:
per-athlete serialization of writes (ties to BB-9 write-serialization) and rejection/buffering of
out-of-order or concurrent set application for the same athlete. Concurrent or reordered application ⇒
fatigue and trajectory divergence.

### 5.5 Transaction/connection composition (BB-9 interaction)
`report_set_fatigue_aware` opens and commits **its own** transaction on `self.db`. The API needs
**connection-per-request** (BB-9) and the **idempotency record in the same transaction** (§5.6). **Mitigation
(additive, no behavior change):** instantiate `LearningPipeline` with the request's `Database`, and add an
**optional `conn` parameter** (default `None` = today's self-managed txn, so the 131 tests stay bit-for-bit)
so the API can own the transaction. This is a persistence-layer refactor that **must preserve the golden
trajectory** — verify with the differential test (§7).

### 5.6 Idempotency atomicity
The dedup-key insert and the learning chain must **commit together** (contract §13; BB-1/BB-2). With §5.5's
`conn` parameter, the handler opens one txn: check key → run the chain on that conn → insert the key →
commit. A split (chain in one txn, key in another) reintroduces the double-apply hazard the contract
forbids.

---

## 6. Places where behavior could accidentally diverge

### 6.1 (F1 — RESOLVED, then REVERSED by M1/DX-06) Effective load vs. reported `actual_weight`
> **⚠️ REVERSED 2026-06-11 by M1 / DX-06.** The reps-only resolution recorded below is no longer current.
> A model review (`M1_MIGRATION_READINESS_REVIEW.md`) licensed M1: the input set is now the
> `(actual_weight, actual_reps)` pair, the effective load is the athlete's logged `actual_weight`
> (DX-01), prediction quality is evaluated at the actual load (DX-02), and future programs are built from
> the resulting learned score (DX-20). The differential-replay gate (§7.1) now runs with the **real
> load**, and is byte-for-byte preserved only on the no-deviation default (`actual_weight ==
> recommended_weight`). The note below is retained as the historical pre-M1 reading only.
>
> **RESOLVED 2026-06-11 — see `reviews/implementation/F1_CLARIFICATION_REPORT.md`.** Verification confirmed
> the **validated system is already reps-only**: `actual_weight` is invariantly `recommended_weight` in every
> learning path, and no validated behavior depends on an athlete-reported weight. F1 is therefore a **contract
> wording inconsistency, not a model fork** — **reclassified from "requires model review / blocking" to a
> resolved clarification.** The fix was wording in `API_CONTRACT_V1.md` (`actual_weight` = audit/A9 metadata,
> not a learning input); **the set endpoint is not blocked.** The technical record below is retained for
> context.

**The frozen pipeline never consumes an externally-reported `actual_weight`.** It sets
`observation.actual_weight = rec.recommended_weight` (its own recomputed weight) and uses that as the fatigue
`effective_load`; `perform` returns **reps only** (`pipeline.py:314–326, 356–361`). Two facts this surfaced,
now resolved:
1. **The contract previously called `actual_weight` "an observation input"** — but there is **no consumer**
   for it in the frozen model. **Resolution:** `actual_weight` is **captured as audit/A9 metadata only** (like
   bodyweight: stored, inert), matching today's behavior; the contract wording was corrected accordingly. This
   is the validated v1 behavior, not a new choice.
2. **The displayed (frozen) block weight and the learned per-set weight diverge on fatigued sets** (the
   pipeline recomputes a fatigue-reduced weight on sets 2+). This is **pre-existing** in `SessionEngine` + sim
   and does **not** affect fidelity between the in-process and event-driven paths (both learn from
   `recommended_weight`). Whether to ever *learn from* a real load deviation is a **deliberately deferred
   future model change** (out of v1 scope; `F1_CLARIFICATION_REPORT.md` §6) — **not** a Wave-2 decision.
- **Net:** the event-driven path uses `recommended_weight` as the effective load (identical to in-process),
  with **reps as the only athlete learning input** — so the differential-replay gate (§7.1) holds and no
  model review is required.

### 6.2 (F2/F3) `complete_block` cadence and order
- **Per-block firing** (the §2 risk) diverges for multi-slot capabilities (§5.1) — use deferred-to-`complete`.
- **Order:** verified **safe** — `complete_block` is capability-independent (§3, F3), so the priority-order
  iteration at `POST /complete` is result-identical to step 4. (Use the sorted order anyway for exactness.)

### 6.3 (F4) Accumulator reconstruction drift
If the accumulator is reconstructed from history instead of persisted (§5.2), a mis-identified "primary set
1" or "first set" silently changes `block_surprise` → a different KEEP/INCREASE/DECREASE. Prefer the
persisted accumulator; if reconstruction is used, it must be covered by the differential test (§7).

### 6.4 (F5) Skip interaction with the accumulator
`SessionEngine` has **no skip path**. For the event-driven skip: a skipped block produces **no
observation/evidence** and must **not** contribute to the accumulator. If **all** of a capability's blocks
are skipped, `complete_block` must **not** fire (no `entry`, no `s_obs`) — else `block_surprise` is computed
against an undefined entry. **Action:** define skip's accumulator semantics explicitly + test; there is no
`SessionEngine` reference, so this is a new, must-specify behavior (not a divergence from a baseline, but a
gap).

### 6.5 (F6) Replace interaction with the accumulator
Replace changes a block's exercise mid-block (existing `replace_exercise` primitive). The accumulator's
primary-slot capture must handle the exercise change deterministically (the capability is preserved by
construction). No `SessionEngine` reference exists — define + test.

### 6.6 (F7) Abandon vs. complete
`SessionEngine` always completes (steps 4–5). The contract adds **abandon**. For an abandoned session, should
`complete_block` (governor advance) fire? There is **no reference behavior.** Recommended fidelity-safe
default: on abandon, **do not** advance the governor (no `complete_block`), `abandon_session` only — but this
is a decision to record, not a silent choice.

---

## 7. Verification strategy (required before implementation)

The transition is accepted **only** when these pass. The spine is a **differential (golden-parity) test**
proving the event-driven path reproduces `SessionEngine` bit-for-bit.

1. **Differential session replay (the core gate).** For a battery of synthetic athletes/sessions: run the
   session through (a) `SessionEngine.run_session` and (b) the event-driven path (compose → emit each set as
   a separate idempotent request in `seq` order → complete), **with identical reported reps**. Assert
   **identical**: final `capability_state` (`score`, `confidence`, `sum_w`, `var_*`, `fatigue`, decision
   memory), `athlete_state.fatigue_systemic`, and the **ordered** `recommendation`/`observation`/`evidence`/
   `state_update_log` value rows (ignoring uuids/timestamps). This is the bit-for-bit proof of §4.
2. **`complete_block`-once + order test.** A multi-slot-capability session: assert `complete_block` runs
   **exactly once per capability** and that priority-order vs arrival-order completion yields identical state
   (F2/F3).
3. **Accumulator-persistence test.** Drive sets across separate transactions (simulating separate requests);
   assert the persisted accumulator yields the same `block_surprise`/decision as the in-process `_CapMemory`
   (F4).
4. **Idempotency atomicity test.** Replay a `set_report` `client_event_id`: assert **one** observation, the
   **same** response, and that a mid-chain fault rolls back **both** the chain and the key (F8/§5.6; BB-1/2).
5. **Ordering/serialization test.** Apply sets out of order / concurrently for one athlete; assert the server
   serializes/rejects so the trajectory matches the in-order baseline (F5/§5.4).
6. **`week`/`govern` guards.** Assert the handler uses `session.week` (not request) and `govern=False` always
   (F6/F7) — a unit test that a client-supplied week and any `govern=True` path are impossible.
7. **New-edge specs (no SessionEngine baseline — define then test):** skip accumulator semantics (§6.4),
   replace mid-block (§6.5), abandon vs complete (§6.6).
8. **Pre-condition (RESOLVED — no longer blocking):** the §6.1 `actual_weight` question is settled as a
   contract clarification (`F1_CLARIFICATION_REPORT.md`), **not** a model-review decision. The confirmed rule
   the set endpoint implements: **`actual_weight` captured as inert audit/A9 metadata; effective load =
   `recommended_weight`; reps are the only athlete learning input; pipeline recompute unchanged.**

**Tooling:** reuse the existing synthetic athlete + the assembled package; the differential test imports the
**same** `hush_model` both paths use (one implementation). Add it to the API `pytest` suite; it is the
backend's analog of the mobile contract test and must be green in CI before B6/B-integration.

---

## 8. What this review concludes

- **Fidelity is achievable and bounded:** the event-driven path can reproduce `SessionEngine` **bit-for-bit**
  by feeding the same reps in the same order with `govern=False`, a persisted per-capability accumulator, and
  all `complete_block` calls deferred to `POST /complete` in priority order. No pipeline math changes.
- **Five engineering conditions (§5)** must be met; the **differential replay test (§7.1)** is the gate.
- **F1 (§6.1) is RESOLVED as a contract clarification** (`F1_CLARIFICATION_REPORT.md`), **not** a model
  decision: the validated system is reps-only at `recommended_weight`, so no model review is required and the
  set endpoint is not blocked.
- **Three new edges (skip/replace/abandon)** have no `SessionEngine` baseline and must be specified + tested,
  not assumed.

This review changes nothing; it defines what "faithful" means and how to prove it.

---

*Fidelity review only — no redesign, no architecture change, no model-behavior change. Traceability:
`session.py` · `pipeline.py` · `API_CONTRACT_V1.md` · `SERVER_BUILD_PLAN_V1.md` · `MOBILE_BUILD_PLAN_V1.md`.
The §6.1 effective-load/`actual_weight` question is **resolved as a contract clarification** —
`reviews/implementation/F1_CLARIFICATION_REPORT.md` (2026-06-11).*
