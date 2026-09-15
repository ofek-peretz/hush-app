# OD1_FINAL_DECISION.md — Client Architecture (D1): Final Decision Record

> **Final, adopted decision for OD-1 / D1.** This record resolves the open client-architecture question
> by selecting one architecture, recording the rationale, the rejected alternatives, the consequences, the
> required canonical-document updates, and the open items the decision creates. **It proposes no new
> architecture and redesigns nothing** — it selects among the options already laid out in
> `D1_THIN_CLIENT_VS_LOCAL_FIRST.md` and consumes the existing `MOBILE_ARCHITECTURE_V1.md` /
> `API_CONTRACT_V1.md`. Governing rule honored: *no redesign without explicit model review* — this is the
> explicit decision act that D1 §10 reserved for separate approval. The frozen model is untouched.
>
> Date: 2026-06-10 · Decided before opening Wave 2 · Build: Sprint 0–4 ✅ + Wave 1 ✅ (131 tests) ·
> Sources: `D1_THIN_CLIENT_VS_LOCAL_FIRST.md` · `MOBILE_ARCHITECTURE_V1.md` · `API_CONTRACT_V1.md` ·
> `SECURITY_PRIVACY_REVIEW.md` · `BETA_READINESS_REVIEW.md`.

---

## 0. Decision

> **ADOPTED — Option B: Local-First, Event-Sourced client with a server-authoritative projection.**
>
> The iOS app holds a **pre-composed session plan** (cached on the prior sync) and an **append-only local
> outbox** of athlete events; the workout runs **fully offline**; a background sync engine drains the
> outbox **in order, idempotently** and pulls back the server's authoritative projection + next
> pre-composed session. **All model logic, the single writer, the audit chain, and every validation
> instrument remain 100% server-authoritative** (unchanged from the frozen design). This adopts the
> architecture already specified in `MOBILE_ARCHITECTURE_V1.md` (D1) and `API_CONTRACT_V1.md`, and
> supersedes Build Plan §9's thin-client decision.

This closes **OD-1**. It does not begin Wave 2.

---

## 1. Context (what was being decided)

OD-1 is the one open question in the mobile architecture: how the iOS app relates to the single Hush
service. `D1_THIN_CLIENT_VS_LOCAL_FIRST.md` framed three options and a sequencing variant:

- **Option A — Thin Client** (Build Plan §9): app renders server responses and posts each set live; the
  network is on the critical path of the workout; no durable local record.
- **Option B — Local-First Event-Sourced** (`MOBILE_ARCHITECTURE_V1.md`): pre-composed plan cache +
  append-only outbox; the workout runs offline; server stays authoritative for all derived state.
- **Option C — Resilient Thin Client**: a durable set-report outbox (so a rep is never lost) but **online
  session start** (no offline workout).
- **Measured path (D1 §9)**: ship A first with the idempotency contract + connectivity telemetry, let
  week-1 field data decide whether to migrate to B.

**What is identical in every option** (off the table — D1 §2/§3): the frozen model and seven engines; the
single writer of capability state; the transactional audit chain and immutable history; all validation
instrumentation (A8/A9/A1/A3); the frozen six-screen UX; the frozen API surface. **D1 cannot affect model
correctness, auditability, or the science** — it is purely a client-resilience-vs-simplicity trade, which
bounds the blast radius of the choice.

The only authority that moves from server to device under B is **the athlete's own event log while
offline** (plus the trivially-local rest timer / current-set pointer). B creates **no second writer of
model state** — only a durable buffer of inputs the single server writer consumes on its own schedule.

---

## 2. Rationale (why Option B)

Five evidence-backed arguments, drawn from the source documents, decide it:

1. **Real gym conditions break Option A frequently, not exceptionally (D1 §4).** Poor/absent connectivity
   (basement racks, steel-and-concrete rooms), backgrounding between sets, and termination/crash are
   *ordinary* for a phone in a gym. Under A, each is a mid-set stall, a network re-fetch, or a **lost
   rep**; under B, the workout runs with the radio off and a reported set is durable before the UI
   confirms. The Beta Review §7 concurs: with local-first, "a reported set survives termination by
   construction, and idempotent retry makes interrupted posts safe."

2. **A lost or double-applied set corrupts the exact thing the trial measures.** The Beta Review §4.1
   rates silent double-learning **🔴**, and the Security Review **DI2/CS2** makes idempotency both a
   correctness control *and* an anti-replay security control. Option B makes the idempotent,
   durable-before-confirm contract **structural**; Option A leaves the double-apply hazard implicit. Since
   the program's only currency is *trust earned*, protecting the integrity of athlete input and the
   validation data is decisive.

3. **The cohort is diversity-recruited → varied, often-poor facilities (Beta §2.1; D1 §9).** A7 seed
   safety is validated precisely on the tails (older, female, detrained), who train in heterogeneous
   gyms. D1 §9 states this "likely means varied facilities — leaning toward B." The premise that makes A
   acceptable (a well-connected cohort) is contradicted by the recruitment design itself.

4. **Retrofitting durability mid-trial is worse than building it up front (D1 §5.4).** If A ships and
   week-1 telemetry shows poor connectivity, the fix *is* migrating A→B **during the validation trial** —
   re-platforming the client mid-flight, which is corrosive to both trust and the trial's continuity.
   Committing to B now avoids a costly, risky mid-trial change.

5. **B is already specified and its cost is bounded.** `MOBILE_ARCHITECTURE_V1.md` and
   `API_CONTRACT_V1.md` are **already designed around B** (event-sourced, `client_event_id` idempotency,
   `GET /sessions/today` pre-fetch, outbox/projection). The §3 reframing removes "local-first's" usual
   cost: **no model port, no CRDT, no multi-writer merge** (single author per athlete stream + single
   server writer). What remains is a well-trodden outbox pattern over the **mandatory** idempotency work
   (BB-1) — incremental, not a new platform.

**Net:** B optimizes field reliability and thesis fidelity for a bounded, already-designed cost, and
protects the validation data. The arguments for A (simplicity, time-to-ship) are real but are outweighed
by the cohort's facility diversity and the high cost of a mid-trial retrofit.

---

## 3. Rejected alternatives

### Option A — Thin Client — **REJECTED**
- **Why rejected:** the network sits on the critical path of an unpausable 45–60-minute workout; in the
  common gym conditions of §4 it stalls between sets and **loses un-posted reps** (no durable local copy).
  Its premise — a well-connected cohort — is contradicted by diversity recruitment (Beta §2.1). It also
  leaves the double-apply hazard implicit (Beta §4.1).
- **What it had going for it (acknowledged):** smallest client, lowest test burden, fastest to the A7
  gate, zero divergence risk (D1 §6). Genuinely the right call *if* facilities were well-connected — they
  are not expected to be.

### Option C — Resilient Thin Client (set-report outbox, online start) — **REJECTED**
- **Why rejected:** it fixes lost-reps and double-apply but **still requires the network to start a
  session** — leaving the dominant failure (athlete arrives at a dead-zone gym and cannot begin)
  unsolved (D1 §1/§4.1). A half-measure that pays much of B's conceptual cost (a durable local store) for
  only part of B's benefit.

### Measured path — "ship A now, decide B from week-1 telemetry" (D1 §9) — **REJECTED as the commitment**
- **Why rejected:** its value is hedging genuine uncertainty about facility connectivity — but the
  program's diversity-recruitment design already resolves that uncertainty toward "varied/poor," and the
  Beta Review requires D1 be decided **before** the app is built, "not during the beta" (§7). Adopting A
  with a planned A→B migration bakes in exactly the costly mid-trial re-platforming §5.4 warns against.
- **What is retained from it:** the **connectivity/sync telemetry** it proposes is *already* part of
  Option B's allowed operational instrumentation (`MOBILE_ARCHITECTURE_V1.md` §10.2: outbox depth, push
  success/failure, time-to-sync, degraded-state occurrences). So B still **measures** whether the offline
  investment is exercised — the evidence discipline survives without deferring the build or risking a
  mid-trial migration.

---

## 4. Consequences

### 4.1 What stays exactly as frozen (no change)
- The model, the seven engines, the single writer, the transactional audit chain, immutable history, and
  all validation instrumentation remain **server-authoritative and unchanged** (D1 §2/§3). **No model
  number, formula, schema, or behavior is touched by this decision.**
- The frozen six-screen UX and the frozen API surface are unchanged; B uses the API surface
  `API_CONTRACT_V1.md` already specifies.

### 4.2 What this decision makes required (now confirmed in scope for Wave 2)
- **Idempotency/dedup contract (BB-1)** — already mandatory (Security DI2; Beta §4.1); B makes it the
  spine of the outbox drain.
- **A client data layer on device** — `HushDatabase` (SQLite schema + migrations), `HushSync`
  (ordered idempotent drain, backoff, pre-compose cache, connectivity), the outbox/projection discipline
  (`MOBILE_ARCHITECTURE_V1.md` §5/§7/§8). This is the bulk of the app's engineering weight (D1 §5.1) and
  now confirmed Wave-2 work (BB-15).
- **Device-side data protection (BB-26; Security S5)** — the local outbox holds health-adjacent data, so
  iOS Data Protection (`NSFileProtectionComplete`) + a restrictive Keychain class are required on device.
- **Outbox-preserving client migrations** — an app update must never strand an un-synced workout
  (Beta §3.5; `MOBILE_ARCHITECTURE_V1.md` §7.3). Now a concrete requirement (see §6, new OD-10).
- **The structural Health→outbox boundary** — no code path from a HealthKit sample into an `OutboxEvent`
  (Security; `MOBILE_ARCHITECTURE_V1.md` §9.1) — must be enforced as a build/test rule.

### 4.3 Costs accepted by choosing B (eyes open)
- **More client engineering and a larger client test matrix** (sync engine, DB migrations, the
  Health-boundary guard) than Option A (D1 §5.1/§5.3). Accepted as bounded and high-value/deterministic
  testing.
- **More client moving parts** (a local DB that can enter bad states; a sync engine that can stall) — but
  failure modes are **local, observable, and recoverable**: the projection (tier 2) is disposable and
  re-pullable; the outbox (tier 3) is append-only and the only sacred artifact (D1 §5.2).
- **Slightly slower time-to-ship** than A (D1 §6), which marginally pressures the A7 week-1 timeline —
  accepted because the cohort diversity and retrofit cost outweigh it.

### 4.4 Risks removed by choosing B
- Mid-set stalls / blocked sessions on poor signal (§4.1) — removed (offline workout).
- Lost reported reps on backgrounding/crash (§4.2/§4.3) — removed (durable-before-confirm outbox).
- Silent double-learning on retry (Beta §4.1) — removed (idempotent by design).
- A costly mid-trial A→B re-platforming (D1 §5.4) — removed (built up front).

---

## 5. Required updates to canonical documents

| Document | Required update | Status |
|---|---|---|
| **Hush v1 Technical Build Plan §9** (`docs/architecture/Hush v1 Technical Build Plan.docx`) | Amend the thin-client decision to record **Option B (local-first event-sourced)** as the adopted client architecture, with a pointer to this record. (Binary `.docx` — must be edited manually by the doc owner; flagged, not auto-edited.) | **TODO (owner: Product/Backend)** |
| **`docs/architecture/MOBILE_ARCHITECTURE_V1.md`** | Flip D1 from "Proposed (pending sign-off)" to **Adopted (Option B)**, citing this record. | **Done in this change** |
| **`docs/canonical/HUSH_V1_OPEN_ITEMS.md`** | Mark **OD-1** as **Closed ✅ (Option B)** with a pointer; add the new **OD-10** (client migration policy) from §6. | **Done in this change** |
| **`HUSH_V1_EXECUTION_CONTEXT.md` / `HUSH_V1_PROJECT_STATUS.md`** | No change required — they describe the frozen *model*, which is untouched. (Optional: note the client architecture in the Sprint-5 forward-look.) | No change |

The Build Plan §9 edit is the formal "decision of record" change D1 §10 named; because the source is a
binary `.docx`, this record adopts the decision and **requires** that edit as a follow-up, rather than
performing it in-place.

---

## 6. Open items created / activated by this decision

**Newly created (added to the registry):**
- **OD-10 — Client DB migration policy (outbox-preserving).** B introduces a device SQLite store, so the
  client needs an additive, **outbox-preserving** migration discipline (an app update must never strand an
  un-synced workout). Source: Beta §3.5; `MOBILE_ARCHITECTURE_V1.md` §7.3. Pri P1 · Phase S5/Phase 1 ·
  Owner Mobile.

**Activated / now-confirmed-relevant (already in the registry; D1 was their precondition):**
- **OD-5** — Local DB encryption (SQLCipher vs iOS Data Protection): now live because B has a device DB.
- **BB-26** — iOS Data Protection + Keychain accessibility class: confirmed required (Security S5).
- **BB-1** — Idempotency/dedup contract: confirmed as the outbox spine (was already P0, D1-independent).
- **BB-9** — Server connection model for concurrent replay: unchanged requirement; B's idempotent replay
  still lands on the one server writer.
- **BL-4** — Multi-device token story: B's event-sourcing makes this cleaner later, but it stays
  Future/Cloud (out of beta scope).

**No item is removed.** The connectivity-telemetry idea from the measured path is **not** a new item — it
is already covered by `MOBILE_ARCHITECTURE_V1.md` §10.2 and is retained as a confirmation instrument.

---

## 7. What this decision explicitly does NOT do

- It does **not** change the frozen model, any number/formula/constant, the schema, or any decision logic.
- It does **not** propose a new architecture or a hybrid — it selects the existing Option B and retains
  the existing Option B telemetry; the rejected options are recorded, not redesigned.
- It does **not** begin Wave 2. It unblocks Wave 2 by settling OD-1; the next step remains the
  execution-plan critical path (BB-13 → BB-9/BB-14 → BB-15), to be started under the Wave-2 gate.
- It does **not** weaken any maintained invariant (Apple Health never enters the loop; single writer;
  parameterized SQL; no third-party tracking; version-stamped audit).

---

## 8. Status & next step

- **Status: ADOPTED — Option B (Local-First Event-Sourced).** OD-1 is closed.
- **Immediate follow-up:** the Build Plan §9 `.docx` amendment (§5, owner Product/Backend) and registering
  OD-10 (done here).
- **Next (not started):** Wave 2 may now open at its critical-path step ② (`BB-13`, assemble the runnable
  service tree), per `OPEN_ITEMS_EXECUTION_PLAN.md` §6. No Wave-2 work has begun.

---

*Final decision record only. One architecture selected (Option B); rationale, rejected alternatives,
consequences, required canonical updates, and created open items recorded. No new architecture, no
redesign, no model-behavior change. Traceability: `D1_THIN_CLIENT_VS_LOCAL_FIRST.md` ·
`MOBILE_ARCHITECTURE_V1.md` · `API_CONTRACT_V1.md` · `SECURITY_PRIVACY_REVIEW.md` ·
`BETA_READINESS_REVIEW.md` · `HUSH_V1_OPEN_ITEMS.md`.*
