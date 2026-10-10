# WAVE_2_EXECUTION_CHECKLIST.md — Wave 2 Execution Breakdown

> **The final execution breakdown before Wave 2 (Before-Beta) implementation begins.** It groups the
> Wave-2 items from `OPEN_ITEMS_EXECUTION_PLAN.md` §3 into implementation **milestones** and parallelizable
> **batches**, preserves every dependency recorded there, identifies the **critical path**, and estimates
> effort per batch. **It plans; it does not implement, and it redesigns nothing.** Every item is an
> existing registry row (`HUSH_V1_OPEN_ITEMS.md`); the only new content is sequencing, batching, and
> effort. OD-1 is **closed → Option B (Local-First Event-Sourced)** (`OD1_FINAL_DECISION.md`), so the
> client posture is settled and reflected throughout. Governing rule: *no redesign without explicit model
> review.*
>
> Date: 2026-06-10 · Build: Sprint 0–4 ✅ + Wave 1 ✅ (131 tests, schema v6) · Client architecture: **Option
> B adopted** · Model/UX/Architecture: frozen.

---

## 0. Scope & ground rules

**Wave-2 item set: 47 rows** — the 37 Before-Beta controls (BB-1…BB-37), the 8 carried-over Open Decisions
(OD-2, OD-3, OD-4, OD-5, OD-6, OD-7, OD-8, OD-9), the **new OD-10** (client outbox-preserving migrations,
created by the OD-1→Option B decision), and **ATD-20** (concurrency hardening, Phase-tagged Before-Beta).
OD-1 is **not** a Wave-2 item (closed in Wave-1/decision).

**Ground rules (unchanged from the execution plan):**
- **Every dependency in `OPEN_ITEMS_EXECUTION_PLAN.md` §3/§6/§7 is preserved.** This document re-expresses
  them as batch ordering; it never relaxes one.
- **Priority (P0–P3) orders work *within* a batch**, never moves an item between batches.
- **The A7 week-1 gate (BB-11) is the hard Phase-1 gate**; its only sanctioned unsafe-seed response is
  *stop and re-anchor ES-008 v2* — **never field-tune** parameters (KL-9).
- **Maintained invariants must not regress** while building (Health never enters the loop; single writer;
  parameterized SQL; no tracking SDKs; version-stamped audit).
- This is a checklist to **start** Wave 2 from; it is not an instruction to implement now.

---

## 1. Milestones (time-phased gates)

Wave 2 is broken into **eight milestones**. Each is a gate: it is "done" when its exit criterion holds.

| # | Milestone | Exit criterion (gate) |
|---|---|---|
| **M0** | S5 kickoff decisions | The 9 Wave-2 decisions (OD-2…OD-10) are settled so each component is built once. |
| **M1** | Service foundation | One runnable `pytest`-green service tree (BB-13) deployed to staging+prod (BB-30). |
| **M2** | Concurrency-safe persistence | The single-connection wall is resolved (BB-9) with concurrency/fault tests (ATD-20). |
| **M3** | API correctness core | The frozen API (BB-14) is live with idempotency/authz/atomicity/validation/stamping/clock/override. |
| **M4** | Instruments & A7 gate | Validation instruments live in the request path (BB-10/12) and the A7 week-1 gate armed (BB-11, OD-8). |
| **M5** | Durability & ops security | Backups+restore, encryption-at-rest, tokens, prod migration, operator surface (BB-3/5/20/21/22/23/24/25). |
| **M6** | Mobile app (Option B) | The 6-screen local-first app (BB-15) with device protection + outbox migrations + onboarding validated. |
| **M7** | Observability & people-facing | Monitoring/logging/SCA/export (BB-27/28/31/32) + consent/compliance/support (BB-33/35/37/36). |
| **M8** | Rollout gate | End-to-end dress rehearsal + staged rollout (BB-29); first cohort athlete trains with instruments live. |

Milestones overlap heavily in wall-clock (see §4 parallelization); the numbering is **dependency order,
not strictly sequential calendar order.**

---

## 2. Execution batches (the work units)

Ten batches (**B0–B9**), each a coherent unit owned by one primary track. Columns: items · owner ·
effort (planning estimate, engineer-days) · depends-on (preserved dependencies) · may-run-parallel-with.

### B0 — S5 kickoff decisions  · *Milestone M0*
- **Items:** OD-2 (erasure policy), OD-3 (recovery posture), OD-4 (HealthKit bodyweight y/n),
  OD-5 (SQLCipher vs Data Protection), OD-6 (MetricKit vs 3rd-party), OD-7 (state mgmt), OD-8 (gate
  thresholds), OD-9 (CI/CD), OD-10 (client migration **policy**).
- **Owner:** Product / Mobile / Model (decision-bound). **Effort:** ~3–5 eng-days (mostly elapsed/sign-off).
- **Depends on:** OD-1 (done). **Parallel with:** everything — start day 0.
- **Preserved couplings:** OD-8 → BB-11 · OD-2 → BB-33/BB-35 · OD-3 → BB-37 · OD-4 → BB-34 · OD-5 → BB-26 ·
  OD-7 → BB-15 · OD-9 → BB-29/BB-30 · OD-10 policy → BB-15 client migrations.

### B1 — Service foundation  · *M1* · **critical path**
- **Items:** BB-13 (assemble runnable `pytest`-green tree), BB-30 (deploy staging+prod, TLS, secrets).
- **Owner:** Backend / Operations. **Effort:** ~6–9 eng-days (BB-13 ~3–4 ∥ BB-30 ~3–5).
- **Depends on:** Wave-1 hygiene (done). **Parallel with:** B0, the infra half of B5.

### B2 — Concurrency-safe persistence  · *M2* · **critical path**
- **Items:** BB-9 (connection model — resolve the OC1 single-connection wall), ATD-20 (concurrency/IO +
  populated-DB migration + real fault-rollback tests).
- **Owner:** Backend. **Effort:** ~6–9 eng-days.
- **Depends on:** **BB-13** (a real tree) + **OD-1 (done)**. **Parallel with:** B5 ops security, B8.
- **Note:** additive shell around the unchanged pure model (no model change).

### B3 — API correctness core  · *M3* · **critical path / heaviest backend**
- **DX-11 landed ahead of the web shell (2026-06-11):** the event-driven set-report **primitive** the
  `POST /sessions/{id}/sets` + `POST /sessions/{id}/complete` handlers map onto is implemented and tested —
  `hush_model/persistence/runtime.py::SessionRuntime` (`start_session`/`report_set`/`complete_session`) over
  the persisted `session_progress` accumulator (migration 008, Schema v8). It carries the M1
  `(actual_weight, actual_reps)` pair through the existing chain and is **bit-for-bit** with
  `SessionEngine` (the differential-replay gate, `test_sprint5`). B3 now only wraps this primitive in HTTP +
  idempotency/auth; it does **not** re-author the lifecycle. See `DX-11_EXECUTION_PACKAGE.md` /
  `DX-11_COMPLETION_REPORT.md`.
- **Items:** BB-14 (build the frozen API per `API_CONTRACT_V1.md`) carrying **BB-1** (idempotency/dedup),
  **BB-19** (per-token authz / no IDOR), **BB-8** (input bounds), **BB-2** (transactional atomicity +
  single-writer, fault-injected), **BB-4** (version + `catalog_version` stamping end-to-end), **BB-6**
  (server-authoritative clock), **BB-7** (lossless override capture, server side).
- **Owner:** Backend. **Effort:** ~20–25 eng-days.
- **Depends on:** **B2** (connection model) + B1 (BB-30 for staging dress-rehearsal). **Parallel with:**
  B5, B6 (the app builds against the *contract* while the API is implemented), B7.
- **Preserved couplings:** BB-1 is "one mechanism, three payoffs" → also feeds BB-28 (correlation id) and
  BB-19 (anti-replay). BB-7 spans server+client (finishes with B6).

### B4 — Instruments & the A7 gate  · *M4* · **critical path (gate)**
- **Items:** BB-10 (shadow A8 / override A9 / fresh-state A1 / costly-tags A3 live in the request path),
  BB-12 (complete `reconstruct_session` verified), BB-11 (A7 week-1 gate armed + stop/re-anchor mechanism).
- **Owner:** Backend / Model / Operations. **Effort:** ~9–12 eng-days.
- **Depends on:** **BB-14** (B3) → BB-10 → {BB-11, BB-12}; **BB-11 needs OD-8** (ratified thresholds).
  **Parallel with:** B5, B6, B7.
- **Note:** BB-11 is the **hard Phase-1 gate**; abort path = re-anchor, never field-tune.

### B5 — Durability & ops security  · *M5*
- **Items:** BB-3 (backups + WAL + tested restore), BB-21 (encryption at rest + encrypted backups),
  BB-20 (high-entropy tokens, TLS-only, rotation/revocation), BB-5 (run the migration chain on the real
  prod DB), BB-22 (operator key in secrets mgr; `/internal/*` restricted + logged), BB-23 (operator
  audit/state/metrics endpoints), BB-25 (secure token provisioning channel), BB-24 (auth-failure
  throttling).
- **Owner:** Operations / Backend. **Effort:** ~16–18 eng-days.
- **Depends on:** **BB-30** (B1); **BB-3 → BB-5** (no migration without a tested backup); **BB-5** also
  needs the Wave-1 migration hygiene (done — ATD-8/12/13). BB-30 → BB-22 → BB-23 → BB-32. BB-20 → BB-25,
  BB-26. **Parallel with:** B2, B3, B4, B6, B7.

### B6 — Mobile app, Local-First (Option B)  · *M6* · **critical path / largest single track**
- **Items:** BB-15 (6 screens + onboarding + "why", **local-first per Option B**: `HushDatabase` +
  `HushSync` outbox/projection), BB-26 (iOS Data Protection + Keychain class), **OD-10 implementation**
  (outbox-preserving client migrations), BB-16 (onboarding→seed mapping validated, conservative bias),
  BB-17 (equipment→catalog Class-A coverage), BB-34 (HealthKit privacy policy + usage strings),
  BB-18 (calibration-phase expectation via the frozen "why" + comms).
- **Owner:** Mobile (BB-16/17 with Backend/Model). **Effort:** ~28–36 eng-days (the offline data layer +
  sync engine is the bulk of the app's weight).
- **Depends on:** **OD-7** (state mgmt), **OD-5** (encryption) → BB-26, **OD-4** → BB-34, **OD-10 policy**;
  builds against **`API_CONTRACT_V1.md`** in parallel with B3 and integrates against **BB-14** once live.
  **Parallel with:** B3 (against the contract), B4, B5, B7.
- **Note:** no model math on device (Option B §3.4); the Health→outbox boundary is a build/test rule.

### B7 — Observability & supply chain  · *M7*
- **Items:** BB-27 (uptime/error/latency monitoring + on-call alerting), BB-28 (structured logging +
  correlation id + no-sensitive-values rule, server+client), BB-31 (dependency pinning + SCA + build
  provenance), BB-32 (tested data-export path for A7/A8/A9 evidence).
- **Owner:** Backend / Mobile / Operations. **Effort:** ~7–10 eng-days.
- **Depends on:** BB-30 (B1); BB-28 reuses BB-1's `client_event_id` as correlation id; **BB-32 needs
  BB-10 (B4) + BB-23 (B5)**. **Parallel with:** B3, B4, B5, B6.

### B8 — Consent, compliance & support  · *M7* (people-facing, mostly non-engineering)
- **Items:** BB-33 (enrollment + consent + physical-risk waiver + special-category health consent + RIR-
  subset consent if used), BB-35 (DPIA + processor DPAs + retention + breach-notification), BB-37 (support
  channel + recovery/re-provision implementing OD-3 + override-vs-trust triage), BB-36 (App Privacy label).
- **Owner:** Product / Operations. **Effort:** ~10–12 eng-days (mostly elapsed/legal, low engineering).
- **Depends on:** **BB-33 + OD-2 + BB-35 close together** before any EU/CA participant; BB-37 implements
  OD-3 and uses BB-23. **Parallel with:** all engineering batches — runs alongside, gates the first athlete.

### B9 — Rollout gate / convergence  · *M8* · **critical path (final gate)**
- **Items:** BB-29 (incident runbook — deploy/rollback, restore, pause-trial, contact-cohort — + staged
  rollout internal → small external → full 100) + the end-to-end dress rehearsal that arms BB-11.
- **Owner:** Operations (+ all tracks for the rehearsal). **Effort:** ~5–7 eng-days.
- **Depends on:** **essentially all prior batches** — the API (B3), instruments+gate (B4), app (B6),
  durability+security (B5), people-facing (B8). Uses ATD-18 (Wave-1 runbook) + OD-9 (CI/CD).
- **Exit:** first cohort athlete trains, instruments capturing from session one, A7 gate watching.

---

## 3. Critical path

The **longest dependent chain** to the first 100-user-beta athlete. Items off this chain are required for
beta but do not extend it (they are the parallel tracks in §4).

```
B1: BB-13 assemble tree ─► B2: BB-9 connection model ─► B3: BB-14 API core (idempotency/authz/atomicity/…)
        │                                                        │
        └─ BB-30 deploy (∥)                                      ├──► B4: BB-10 instruments ─► BB-11 A7 gate armed (needs OD-8)
                                                                 │
                                                                 └──► B6: BB-15 mobile app (Local-First) ──────────────┐
                                                                          (builds vs API_CONTRACT_V1 in parallel,        │
                                                                           integrates at BB-14)                          ▼
                                                                                                       B9: BB-29 dress rehearsal
                                                                                                           + staged rollout
                                                                                                                  │
                                                                                          ── first cohort athlete trains ──
```

**The true critical path is the mobile branch:** `BB-13 → BB-9 → BB-14 → BB-15 → BB-29`. Because
`API_CONTRACT_V1.md` is already frozen, **B6 (app) and B3 (API) run in parallel against the contract** and
converge at integration — but the app (Option B's local data layer + sync engine, ~28–36 eng-days) is the
largest single track and dominates wall-clock. The **A7-gate branch** (`BB-14 → BB-10 → BB-11`, gated by
OD-8) is a parallel *hard gate*: shorter to build than the app, but the trial may not scale past the first
few athletes until it is armed and green. **B9 cannot start until both branches land.**

Single biggest schedule risks (from the dependency graph): (1) **BB-9** mis-scoped blocks the entire API;
(2) **BB-1 idempotency** is load-bearing for B3, B7, and security — build it first inside B3; (3) **B6**
length — start it against the frozen contract on day one of M3, do not wait for the API to be live.

---

## 4. Parallelization plan (tracks & phasing)

Four delivery tracks run concurrently after the foundation lands. The contract being frozen is what lets
Backend-API and Mobile proceed in parallel.

| Track | Owns batches | Runs |
|---|---|---|
| **Backend-API** | B1(tree), B2, B3, B4 | the spine — foundation → connection → API → instruments/gate |
| **Backend-Data/Ops** | B1(deploy), B5, B7(server) | durability, security, observability — parallel to Backend-API |
| **Mobile** | B6, B7(client) | the Option-B app against the frozen contract — parallel to Backend-API |
| **Product/Ops (people)** | B0, B8, B9 | decisions, consent/compliance/support, rollout — parallel throughout |

**Phasing (wall-clock, with parallelism):**

```
Phase 1 (≈ wk 1)      B0 decisions ∥ B1 foundation ∥ (B5 infra prep: backups/secrets design)
Phase 2 (≈ wk 1–2)    B2 connection model ─► start B3 API core ;  B6 app starts vs the frozen contract ;
                      B5 durability/security in parallel ; B8 consent/legal starts (long lead time)
Phase 3 (≈ wk 2–4)    B3 API core completes ─► B4 instruments + A7 gate ; B6 app continues (dominant) ;
                      B7 observability ; B5 prod migration (BB-5, after BB-3)
Phase 4 (≈ wk 4–5)    Integration: app ⇄ live API ; B4 gate armed (OD-8 ratified) ; B7/B8 finish
Phase 5 (≈ wk 5–6)    B9 dress rehearsal + staged rollout (internal → small external → full 100)
```

**Can run fully in parallel** (no inter-dependency): B0 ∥ B1 ∥ (B5 design); later B3 ∥ B5 ∥ B6 ∥ B7 ∥ B8.
**Must serialize:** B1 → B2 → B3 → {B4, B6-integration} → B9; B3(BB-1) before B7(BB-28); BB-3 before BB-5;
OD-8 before BB-11; BB-33+OD-2+BB-35 together before the first EU/CA athlete.

---

## 5. Effort rollup

| Batch | Track | Effort (eng-days) |
|---|---|---|
| B0 decisions | Product/Mobile/Model | ~3–5 |
| B1 foundation | Backend/Ops | ~6–9 |
| B2 connection | Backend | ~6–9 |
| B3 API core | Backend | ~20–25 |
| B4 instruments + gate | Backend/Model/Ops | ~9–12 |
| B5 durability + security | Ops/Backend | ~16–18 |
| B6 mobile (Option B) | Mobile | ~28–36 |
| B7 observability | Backend/Mobile/Ops | ~7–10 |
| B8 consent/compliance | Product/Ops | ~10–12 |
| B9 rollout gate | Operations (+all) | ~5–7 |
| **Total** | — | **~110–143 eng-days** |

**Wall-clock with the four parallel tracks: ≈ 5–6 weeks**, critical-path-bound by **B6 (mobile)** running
after the B1→B2→B3 spine. This is consistent with the Beta Review's "~30 days achievable **only** if
Sprint 5 is built, deployed, instrumented, and dress-rehearsed" — the ~30-day figure is the *aggressive,
fully-staffed, no-slippage* end of this range; ~6 weeks is the realistic end. Estimates are planning
figures for sequencing, not commitments.

---

## 6. Gates & cross-cutting threads to honor (preserved from the plan §7)

- **OD-1 is closed → Option B.** The app **is** local-first; BB-9 and BB-15 build to that posture. (No
  longer a blocker; recorded for context.)
- **Idempotency (BB-1)** is the highest-leverage single build item — data integrity + support tracing
  (BB-28) + anti-replay (BB-19). Build it first within B3.
- **Backups (BB-3) + encryption-at-rest (BB-21)** gate safe mid-beta migrations (BB-5) and offset the
  no-rollback debt (ATD-14).
- **Consent (BB-33) + erasure (OD-2) + retention (BB-35)** must close together before any EU/CA participant.
- **The A7 gate (BB-11)** is the Phase-1 hard gate; its abort path is *stop and re-anchor ES-008 v2* —
  **never** field-tune parameters (KL-9). OD-8 must ratify its thresholds first.
- **Staged rollout (BB-29)** surfaces a seed-safety problem on a handful, not all 100.

---

## 7. Wave-2 Definition of Done (the beta gate)

Wave 2 is complete — and the closed 100-user beta may begin — when **all of**:

- [ ] Runnable, deployed, `pytest`-green service on staging+prod (B1) with the concurrency-safe connection
      model + tests (B2).
- [ ] The frozen API is live and verified: idempotent/deduped, per-token authorized, input-bounded,
      transactionally atomic, version+catalog stamped, server-clocked, override-lossless (B3).
- [ ] Validation instruments capture from session one and every session reconstructs; the A7 week-1 gate is
      armed with a stop/re-anchor mechanism (B4).
- [ ] Backups+restore tested, encryption at rest, secure tokens, prod DB migrated, operator surface live
      and access-logged (B5).
- [ ] The Option-B mobile app runs a full workout offline, survives backgrounding/termination, syncs
      idempotently, protects data at rest, and preserves the outbox across upgrades; onboarding→seed and
      equipment coverage validated (B6).
- [ ] Monitoring/alerting, structured logging with correlation id, dependency pinning/SCA, and the
      validation data-export path are live (B7).
- [ ] Consent/waiver/special-category-consent pipeline, DPIA/retention, support+recovery, and the privacy
      label are in place (B8).
- [ ] End-to-end dress rehearsal passed and staged rollout begun (B9).
- [ ] **No maintained invariant regressed** (Health never enters the loop; single writer; parameterized
      SQL; no tracking SDKs; version-stamped audit) — and **no model number/formula/trajectory changed.**

---

## 8. What this document does NOT do

- It does **not** implement any Wave-2 item — it is the breakdown to start from.
- It does **not** redesign anything or add scope — all 47 items trace to `HUSH_V1_OPEN_ITEMS.md`; the only
  new content is milestones, batches, ordering, parallelism, and effort.
- It does **not** alter the frozen model, schema, or any maintained invariant.
- It does **not** re-open OD-1 or change the Option-B decision; it consumes it.

---

*Execution breakdown only — sequencing, batching, critical path, parallelism, and effort for Wave 2. No
implementation, no redesign, no new work. Dependencies preserved verbatim from
`OPEN_ITEMS_EXECUTION_PLAN.md` §3/§6/§7. Item roster: `HUSH_V1_OPEN_ITEMS.md`. Client architecture per
`OD1_FINAL_DECISION.md` (Option B). For the frozen model start at `HUSH_V1_EXECUTION_CONTEXT.md`.*
