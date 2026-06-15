# MOBILE_ARCHITECTURE_V1.md

> Complete mobile application architecture for **Hush v1** (Sprint 5 — the athlete-facing app).
> iOS first, SwiftUI, Apple Health, offline-first, local-first. The model and the UX/UI are
> frozen; this document does **not** redesign either. Every athlete-facing surface traces to the
> frozen 6-screen scope (Build Plan §9); every data path traces to a frozen ES spec or to the
> System Architecture invariants. Where this design departs from a canonical document, the
> departure is called out explicitly and routed to model review (governing rule: *no redesign
> without explicit model review*).
>
> - **Status:** Adopted (Sprint 5 design). Decision **D1** (see §3) **resolved 2026-06-10: ADOPTED
>   Option B (Local-First Event-Sourced)** — see `reviews/decisions/OD1_FINAL_DECISION.md`.
> - **Date:** 2026-06-10
> - **Model:** Hush v1 — **advisory**. Server pipeline built through DX-09/M5 + DX-08/10/12 + the Wave-2
>   backend API shell (**schema v11, 284 tests**; `pytest`-green, not yet deployed); `recommended_weight`
>   is advisory (the athlete owns load), the logged `actual_weight` is a learning input (M1), and
>   stagnation detection (M5) drives the weekly review. ES-013 active investigation retired.
> - **Reads:** `HUSH_V1_EXECUTION_CONTEXT.md` · `HUSH_V1_PROJECT_STATUS.md` · Build Plan §4/§5/§9 ·
>   System Architecture · ES-001/002/003/006/009/011/012 · Founder Package ch.8 (Anti-Requirements).

---

## 1. Purpose and scope

This is the architecture for the **only athlete-facing artifact in Hush v1**: a minimal iOS app
that lets a recruited cohort athlete (Phase 1, ~100 users) run a workout the system composed for
them, report what they actually did, and nothing else. The app is the *thinnest possible shell
around the frozen learning loop* — its entire job is to render a recommendation and capture an
observation, calmly and without friction.

**In scope:** the six frozen screens + onboarding + the optional "why this weight?" view; a
local-first / offline-first data layer; sync to the single Hush service; Apple Health integration;
the operator/validation instrumentation the Phase 1 gate depends on; testing; deployment to the
cohort via TestFlight.

**Explicitly out of scope** (Founder ch.8 Anti-Requirements — *not deferred, refused*): charts,
feeds, streaks, badges, XP, leaderboards, social, AI chat, push-notification engagement loops,
analytics dashboards for the athlete, settings beyond the essential, account management beyond
login. Also out of scope for v1: Android (iOS first), Class-B/C capabilities (frozen inactive),
the Investigation Engine UX (ES-013, Phase 2), and any client-side reimplementation of the model
math (see **D1**).

The app must be live **with the Sprint 4 instruments running from the first real session** —
shadow baseline (A8), override-target logging (A9), fresh-state checks (A1), costly-case tagging
(A3) — or the validation program is "dead on arrival" (Build Plan §10). Instrumentation is a
first-class requirement of this app, not an afterthought.

---

## 2. What the app must do (the frozen athlete loop)

The product is one loop, repeated: **compose → prescribe → observe → learn → re-prescribe.** The
learning half lives in the server (Sprints 0–4). The app owns the athlete half:

| Frozen screen (Build Plan §9) | Athlete action | Domain effect |
|---|---|---|
| **Home** | sees today's workout + est. duration; taps Start | reads cached `Session` plan; `status: planned → active` |
| **Exercise** | sees name, weight, reps, "set N of M" | renders one `ExerciseBlock` / one `Set` prescription |
| **Set completion** | answers one question — *how many reps?* — Submit | appends an **observation** (the only real input the model gets) |
| **Rest** | watches a timer | local-only; no domain effect |
| **Equipment-busy / skip** | taps skip / replace | emits a `skip` or `replace` event (ES-001 lifecycle, ES-006 L2) |
| **Complete** | "Well Done." | `status → completed`; triggers sync + the next-session pre-compose |
| *Onboarding* | enters the ES-Athlete fields | creates the `Athlete` (ES-001/003 inputs) |
| *"Why this weight?"* (optional) | reads the explanation | renders the recommendation's explainability (ES-006 / `/why`) |

Two product constraints shape every decision below:

1. **Calm and frictionless is the thesis, not a polish goal.** The app captures *one number per
   set* and never asks proximity-to-failure / RIR (a frozen Anti-Requirement and the dominant
   refused input, ES-011 / A5). No nudges, no streak pressure, no "you're behind."
2. **The athlete owns the decision.** Skip/replace/override are first-class, welcomed paths — and
   the **richest learning signal** (Thesis v2; ES-006 override metrics). The UI must never make
   overriding feel like a failure, and the data layer must capture override *targets* losslessly
   (A9), including off-catalog substitutions.

---

## 3. The central decision: local-first **without** a second model (D1)

### 3.1 The conflict

The user's assumptions for this design are **offline-first** and **local-first**. The frozen
**Build Plan §9** says the opposite, in as many words:

> "Build it as a thin client — all logic server-side, the app just renders recommendations and
> posts sets. **No offline mode, no local model, no client-side state beyond the current
> session.**"

These cannot both stand unaltered. This is the architecture's pivotal decision, and because the
Build Plan is a *canonical* document (Active/Historical), changing it is a model-review act, not a
silent edit (governing rule). **Decision D1 is therefore proposed, not assumed**, and is the one
thing in this document that must be signed off before build.

### 3.2 The constraint that makes it subtle

The frozen model is **pure, deterministic, I/O-free Python**, and three invariants protect it
(System Architecture; Build Plan §5–§6):

- **Single writer.** Only the State Update engine mutates capability state.
- **Transactional audit chain.** `Set → Observation → de-fatigue → Evidence → StateUpdate` commits
  atomically; "every link present" is the audit guarantee. A half-applied step corrupts state
  silently.
- **One implementation.** The simulation harness imports the *same* package the service runs, so
  it "tests the real model, not a reimplementation." A second implementation of the math (e.g. a
  Swift port) is, at v1, a parity liability against the golden-value tests — the place the
  "intellectual weight sits" (Build Plan §6, §11).

A naive "local-first" reading — *port the model to Swift and run learning on device* — violates all
three. It creates a second writer, a second (non-transactional, harder-to-audit) chain, and a
second implementation whose drift from the Python golden values would be undetectable in the field.
That is the wrong kind of local-first for this product.

### 3.3 The resolution: event-sourced local-first, server-authoritative derivation

The reconciliation rests on a property of the frozen model the Build Plan's thin-client framing
overlooked: **a workout session is a precomputed, load-free-then-frozen plan, and the athlete's
only input is an append-only stream of observations.**

- Session composition is **load-free** (ES-009, Inv. 3) and the per-set prescription is derived
  from state **at session entry**. The ES-006 decision governor advances **once per block / once
  per capability per session** (`complete_block()` hook; SessionEngine R2), *not* per set. So the
  entire session prescription — exercises, loads, target reps, sets, rest — is fully determined the
  moment the session is composed and **does not change mid-session in response to set reports**.
- Therefore the device can hold a **precomputed `Session` plan** and the athlete can complete the
  whole workout **fully offline**, rendering from cache and capturing rep counts locally.
- Each set report / skip / replace is an **immutable, independently-authored event**. The device is
  the **source of truth for the event log** (local-first: the athlete's data is born on the device,
  durable there before anything else). Events are appended to a local **outbox** before the UI ever
  confirms.
- The **authoritative learning derivation stays in the one Python service.** On reconnect, the
  device replays its queued events through the *real* transactional pipeline server-side. Because
  the pipeline is **deterministic** and the events are the ground truth, the resulting state is
  identical regardless of *when* it is computed. The server returns the updated **projection**
  (capability scores/confidence, decision memory, the next composed session), which the device
  adopts.

This is **event sourcing with a server-authoritative projection**: the device owns the authoritative
*event log*; the server owns the authoritative *state projection* and the audit chain. It is
genuinely local-first (the device functions and stays durable without the network, and the
athlete's data lives there first) and genuinely offline-first (a full session works with the radio
off), **while preserving every frozen invariant** — single writer, transactional audit, and exactly
one implementation of the math.

```
        ┌─────────────────────── DEVICE (local-first, offline-capable) ───────────────────────┐
        │  SwiftUI (6 screens)                                                                 │
        │      │ renders from / writes to                                                      │
        │  Local projection (read model)        Local OUTBOX (append-only event log = truth)   │
        │   • athlete, capability_state          • set_report  • skip  • replace  • complete    │
        │   • today's Session plan (cached)      • each: client UUID (idempotency) + seq + ts   │
        └───────────────▲───────────────────────────────────┬──────────────────────────────────┘
                        │ pull: authoritative projection      │ push: queued events, in order
                        │ + next pre-composed Session          │ (idempotent replay)
        ┌───────────────┴───────────────────────────────────▼──────────────────────────────────┐
        │  ONE Hush service (Python, synchronous, single SQLite DB)                              │
        │  Set→Observation→de-fatigue→Evidence→StateUpdate  (transactional, single writer)       │
        │  + instrumentation: shadow baseline (A8), override log (A9), fresh-state (A1), tags     │
        │  + immutable audit history (the source of truth for "why")                             │
        └───────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 What the device deliberately does **not** do

- **No model math on device in v1.** No ReferenceStrength, Epley, blend, fatigue, or decision
  governor in Swift. The device never computes a load or a capability score; it renders ones the
  server derived. (See §3.5 for the gated future option.)
- **No second writer to capability state.** The device's local `capability_state` is a *read
  cache*, never a source.
- **No conflict-prone shared mutable state.** Because each athlete authors their own serial event
  stream and only the server derives state, there is no multi-writer merge problem (see §8.4).

### 3.5 The one gated future option

If, post-v1, on-device prescription recomputation is wanted (e.g. to remove the "sync to get your
next workout" degraded state entirely), the **only** sanctioned path is a Swift port of the pure
model package **behind a golden-vector parity gate**: the same golden values that test the Python
package (`S=64 → 113/100/68/150/180 kg`, `bench@82.5 → 11.09`, decay anchors, exact forward/inverse
round-trip) become **cross-language conformance vectors** that the Swift port must reproduce
bit-for-bit in CI before it may compute anything an athlete sees. This is explicitly **deferred and
out of v1 scope**; it is recorded here so the door is left open the disciplined way, not the
parity-liability way.

---

## 4. Principles and invariants the app must preserve

These are inherited, non-negotiable, and testable:

1. **The model is frozen.** No client-side change to any number, formula, or decision. The app is a
   renderer and a recorder.
2. **The UX is frozen.** Six screens + onboarding + optional "why". No screen is added; each
   existing one "justifies its existence" (Founder Workout-Engine). Anti-Requirements are refused,
   not parked.
3. **One number in.** The set-completion screen asks reps and nothing about effort/RIR/proximity.
4. **Observations are immutable and durable-before-confirm.** A reported set is an append-only fact
   the instant the athlete submits, surviving crash, force-quit, and offline (local-first).
5. **Overrides are data, captured losslessly.** Skip/replace/off-catalog targets are recorded with
   their full target (A9), never silently dropped.
6. **Server is the single writer and the audit authority.** The device never claims to have learned
   anything; it relays events and adopts the server's derived truth.
7. **Determinism guarantees convergence.** Replaying the device's event log through the canonical
   pipeline yields the same state every time — this is what makes offline-first safe here.
8. **Instrument-from-day-one.** Every recommendation rendered and every override captured must be
   reconstructable server-side (shadow baseline, override log, audit) or the trial is untestable.
9. **Privacy by default.** Training and health data are sensitive; local encryption, no third-party
   engagement analytics, Apple-native diagnostics only (§10–§11).
10. **Calm is correctness.** Latency, jank, and chatty prompts are bugs against the thesis, not
    polish items.

---

## 5. App modules

iOS app, Swift + SwiftUI, organized as a set of **Swift Package Manager (SPM) local packages** with
a strict, acyclic dependency graph. Packaging as SPM modules (not one target) enforces boundaries at
compile time, keeps the pure/testable cores free of UIKit/HealthKit, and lets the I/O shell be
mocked in tests.

### 5.1 Module map

| Package | Kind | Responsibility | Depends on |
|---|---|---|---|
| **HushModelTypes** | pure value types | Codable domain DTOs mirroring the frozen entities: `Athlete`, `Exercise` (catalog mirror), `Session`, `ExerciseBlock`, `Set`, `Recommendation`, `CapabilityState`, `StrategyState`, `PreferenceState`, `Observation`, and the **`OutboxEvent`** sum type. Carries `model_version` / `capability_model_version` stamps. **No logic.** | — |
| **HushSessionFlow** | pure state machine | The session as an explicit finite-state machine (Home→Exercise→SetCompletion→Rest→…→Complete) + skip/replace transitions. Pure, deterministic, no I/O — unit-testable in isolation. Owns *flow*, not *math*. | HushModelTypes |
| **HushDatabase** | I/O | GRDB/SQLite: schema, migrations, the local projection (read model) and the append-only outbox; repository protocols. Sole owner of on-device persistence. | HushModelTypes |
| **HushAPI** | I/O | Typed REST client over the frozen athlete endpoints (§8.2) + auth (per-athlete token). Maps DTOs ↔ wire. | HushModelTypes |
| **HushSync** | I/O orchestration | The outbox push/pull engine: connectivity monitoring, ordered idempotent push, projection pull, retry/backoff, next-session caching. The heart of offline-first (§8). | HushModelTypes, HushDatabase, HushAPI |
| **HushHealth** | I/O gateway | HealthKit gateway behind a protocol: read bodyweight (profile-only), write completed workouts (`HKWorkout`). **Strictly outside the learning loop** (§9). | HushModelTypes |
| **HushTelemetry** | I/O | Operator/validation product-event emission + MetricKit diagnostics. **No third-party analytics SDK** (§10). | HushModelTypes |
| **HushUI** | SwiftUI | The six screens + onboarding + "why this weight?" as feature views and `@Observable` view models. Renders projection, dispatches events. Frozen UX only. | HushModelTypes, HushSessionFlow |
| **HushApp** (the app target) | composition root | Dependency injection / wiring, routing, app lifecycle, entitlements, secrets, feature flags. The only place that knows the concrete implementations. | all of the above |

### 5.2 Dependency graph (acyclic)

```
                 HushModelTypes  ◄─────────────────────────────┐ (everything)
                   ▲      ▲   ▲
   HushSessionFlow─┘      │   └─HushDatabase ◄─┐
        ▲                 │         ▲          │
        │              HushAPI ─────┴── HushSync│
        │                 ▲                    │
        │              HushHealth   HushTelemetry
        │                 ▲              ▲     ▲
      HushUI──────────────┴──────────────┴─────┘
        ▲
     HushApp (composition root: binds protocols → concretes, owns DI)
```

Rule enforced in CI: **HushModelTypes and HushSessionFlow import no I/O framework** (no GRDB, no
HealthKit, no Foundation networking). They are the device-side analog of the server's "pure model
package," and stay trivially testable.

### 5.3 Composition root and dependency injection

`HushApp` is the only module that constructs concrete dependencies and injects them as protocols
(`SessionRepository`, `OutboxRepository`, `APIClient`, `HealthGateway`, `TelemetrySink`,
`Clock`/`UUIDProvider` for determinism). Every feature view model receives its collaborators through
an initializer, so:

- tests inject fakes (in-memory DB, stub API, mock Health) with zero ceremony;
- `Clock`/`UUIDProvider` are injected so event timestamps and idempotency keys are deterministic in
  tests (matching the project's golden-determinism discipline);
- there is exactly one wiring graph, reviewed in one file.

---

## 6. State management

### 6.1 Pattern: unidirectional store over `@Observable`, no heavy framework

Recommendation: **plain SwiftUI with iOS-17 `@Observable` view models over a single injected
`AppStore`/repositories, using Swift Concurrency (`async/await`, `actor`)** — *not* a third-party
architecture (TCA, Redux). Rationale: the app is six screens and a finite session flow; the dominant
complexity is the **sync engine and durability**, not view composition. A heavy architecture
dependency would add ceremony disproportionate to a 6-screen app and contradict Principle #29
("every feature justifies itself against simplicity"). Unidirectional data flow gives us the
testability benefit without the dependency.

If the team already standardizes on **The Composable Architecture**, the session FSM (§6.2) and the
event/outbox model (§8) map onto TCA reducers cleanly — the design does not preclude it. Default
recommendation stands at `@Observable` + repositories for v1.

**Shape of state flow:**

```
   View (SwiftUI, dumb) ──intent──► ViewModel (@Observable) ──command──► Repository / Sync (actor)
        ▲                                   │                                   │
        └──────── renders projection ───────┘◄──── projection updates ──────────┘
                                                   (DB observation, Combine/AsyncSequence)
```

Views are declarative and stateless beyond transient UI; view models translate athlete intents into
**domain events appended to the outbox** and into **flow transitions**; repositories/sync own all
persistence and network. State the UI reads is always the **local projection**, never history,
never a live network call — mirroring the server invariant "decisions read from state, never from
raw history" (ES-Founder §34) on the client.

### 6.2 The session as an explicit finite-state machine (`HushSessionFlow`)

The running workout is modeled as a pure FSM so its correctness is unit-testable without a UI:

```
states:   Idle → SessionLoaded(plan) → RunningBlock(i) → AwaitingReps(i, setN)
                → Resting(i, setN) → RunningBlock(i+1 | next set) → … → Completed
branches: AwaitingReps --skip--> Skipped(block i) → next block
          RunningBlock --replace--> ReplacePending(block i) → (server/cached replacement) → RunningBlock(i')
events emitted on transitions: SetReported, BlockSkipped, BlockReplaced, SessionCompleted
```

The FSM is fed the cached `Session` plan and emits **domain events** on each meaningful transition.
It contains **no math** (loads/reps come from the plan) and **no I/O** (emitting an event means
handing it to the repository). This isolation is what lets a snapshot/unit test drive an entire
synthetic workout deterministically.

### 6.3 Three tiers of client state

Mirroring the server's state zones, deliberately:

1. **Ephemeral UI state** — rest-timer countdown, current screen, button-disabled flags. Lives in
   view models; never persisted; lost on relaunch by design.
2. **Local projection (read model, replaceable)** — `athlete`, `capability_state`, `strategy_state`,
   `preference_state`, the cached `Session` plan, last "why" explanation. **Server-authoritative**;
   overwritten wholesale on pull. Safe to delete and re-pull.
3. **Local event log (outbox, authoritative-until-acked)** — the append-only `OutboxEvent` stream.
   **The only client-origin source of truth.** Never overwritten by the server; only marked
   `acked` once the server has durably accepted it. This is the tier that makes the app local-first.

The cardinal client rule: **tier 2 is disposable; tier 3 is sacred.** Any recovery path may rebuild
tier 2 from the server; nothing may discard an un-acked tier-3 event.

---

## 7. Local database

### 7.1 Engine: GRDB.swift over SQLite

**SQLite via GRDB** — chosen to *mirror the server's SQLite*, so the same mental model, the same
append-only-history discipline, and the same additive-migration practice carry across the tier.
GRDB gives typed records, value-type mapping, migrations, and `ValueObservation` (reactive reads
that drive SwiftUI). Alternatives rejected: Core Data (heavier, object-graph semantics fight the
event-log model), SwiftData (immature for explicit migrations / outbox control at the time of
build), raw files (no query/transaction story for the outbox).

### 7.2 Schema (device subset of the server zones)

The device persists a **subset** of the server zones — the projection it renders plus the outbox it
authors. It does **not** replicate immutable history (evidence, state_update_log, audit) — that is
server-owned and pulled on demand only for the "why" view.

```
-- ── Local projection (read model; server-authoritative; replaceable) ──
athlete(id PK, onboarding fields per ES-001/003, model_version, capability_model_version, updated_at)
capability_state(athlete_id, capability_id, score, confidence, updated_at)        -- 5 Class-A rows
strategy_state(athlete_id, weekly_frequency, weekly_volume, primary_focus, secondary_focus)
preference_state(athlete_id, exercise_family, preference_score)
session_plan(id PK, athlete_id, status, started_at, completed_at, payload JSON, is_next BOOL)
  -- payload = the fully composed plan: blocks[exercise, position, recommended_weight,
  --           target_reps, target_sets, rest], plus the per-block "why" explanation
exercise_catalog(code PK, name, primary/secondary_capability, weights, equipment_type,
                 replacement_group, catalog_version)   -- mirror of the code-resident ES-002 catalog

-- ── Local event log (OUTBOX; client-authored; append-only; authoritative until acked) ──
outbox_event(
  client_event_id TEXT PK,      -- client-generated UUID = idempotency key
  athlete_id, session_id,
  seq INTEGER,                  -- per-device monotonic sequence (total order of intent)
  kind TEXT,                    -- set_report | skip | replace | session_start | session_complete
  payload JSON,                 -- e.g. set_report: {block_id, set_number, actual_weight, actual_reps}
                                --      replace:    {block_id, from_exercise, to_exercise|off_catalog_text}
  created_at_logical TEXT,      -- injected Clock (deterministic in tests)
  sync_status TEXT,             -- pending | inflight | acked | failed
  attempt_count INTEGER, last_error TEXT
)

-- ── Bookkeeping ──
local_schema_version(version INTEGER)         -- mirrors the server's additive-migration discipline
sync_cursor(athlete_id, last_acked_seq, last_pulled_at, server_projection_etag)
```

Notes:
- **`actual_weight` is captured, not just `actual_reps`** — the frozen Set entity records both
  (ES-001), and the athlete may have used a different plate than prescribed; that is an observation
  input, not noise.
- **Replace payload preserves off-catalog targets verbatim** (A9): if the athlete substitutes an
  exercise Hush doesn't know, the free-text/identifier is stored and synced, flagged as an
  attribution gap server-side. Lossless override capture is a hard requirement.
- The catalog is mirrored read-only so skip/replace alternates can be offered offline (ES-002
  replacement groups). It is versioned; a catalog-version mismatch on sync forces a refresh.

### 7.3 Migrations

Versioned, **additive, idempotent** migrations registered with GRDB's `DatabaseMigrator` — the same
discipline the server uses (migrations 001–006). The local schema version is independent of the
server schema version but follows the same rule: **never rewrite the meaning of an existing column;
add.** Outbox rows must survive every app update (an un-synced workout cannot be lost to a
migration), so migration tests assert outbox preservation across upgrades.

### 7.4 Encryption and data protection

Training + health-adjacent data is sensitive. Two layers:

- **iOS Data Protection** on the database file: `NSFileProtectionComplete` /
  `.completeUnlessOpen` so the DB is encrypted at rest, keyed to the device passcode, unreadable
  while the device is locked. Sufficient for v1's threat model (lost/stolen device).
- **Optional SQLCipher** (GRDB supports it) if a stronger requirement emerges, keyed via the
  Keychain. Recommended **deferred** unless the privacy review demands it — Data Protection already
  encrypts at rest, and SQLCipher adds key-management complexity. Decision flagged in §14.

No iCloud/CloudKit backup of the raw DB in v1 (the server is the backup of record); the outbox is
the only at-risk durable artifact and it drains to the server quickly.

---

## 8. Sync strategy

The sync engine is where the offline-first guarantee is actually delivered. It is an **outbox-based,
event-sourced, eventually-consistent** synchronizer with a server-authoritative projection.

### 8.1 The contract in one paragraph

The device **pushes** an ordered, idempotent stream of athlete events and **pulls** the resulting
authoritative projection (current capability state + the next pre-composed session). Pushes are
deterministic facts; the server replays them through the canonical transactional pipeline; pulls
overwrite the disposable read model. The athlete's experience never blocks on the network: every
action commits locally first, the UI confirms immediately, and sync happens opportunistically in the
background.

### 8.2 Endpoints (the frozen API surface, Build Plan §4)

The app consumes exactly the athlete-facing surface (the API itself is a parallel Sprint-5
deliverable; this is the contract the app needs it to honor):

| Method · path | Used for | Idempotency |
|---|---|---|
| `POST /sessions` | start/compose today's session (server composes; normally pre-fetched, see §8.5) | client request id |
| `POST /sessions/{id}/sets` | **report a set → returns next action**; the core loop | **client_event_id** |
| `POST /blocks/{id}/skip` | skip flow (ES-001) | client_event_id |
| `POST /blocks/{id}/replace` | replace flow (ES-006 L2; carries override target, A9) | client_event_id |
| `POST /sessions/{id}/complete` | finish; triggers next-session pre-compose server-side | client_event_id |
| `GET /sessions/today` | pull the current/next composed session (the pre-compose cache fill) | — |
| `GET /recommendations/{id}/why` | "why this weight?" explainability (ES-006) | — |

Auth: **one bearer token per athlete** (Build Plan §4), stored in the **Keychain**, attached to
every request. No operator endpoints are reachable from the athlete app.

### 8.3 Push: ordered, idempotent replay

1. Every athlete action writes an `outbox_event` **inside a local transaction** *before* the view
   model confirms to the UI (durable-before-confirm; Principle #4). The event carries a
   **client-generated UUID** (`client_event_id`) and a per-device monotonic `seq`.
2. A background sync `actor` drains the outbox **in `seq` order**, one in-flight batch at a time,
   POSTing each event to its endpoint with the `client_event_id` as the idempotency key.
3. The **server dedups on `client_event_id`** — replaying a `set_report` the server already applied
   returns the same result without double-applying (critical: a retry after a flaky network must not
   learn twice). The server pipeline stays transactional; the device just guarantees *at-least-once,
   ordered* delivery and the server makes it *effectively-once*.
4. On `2xx ack`, the event is marked `acked` and `sync_cursor.last_acked_seq` advances. On transient
   failure, exponential backoff with jitter; on permanent failure (4xx that isn't a dedup), the
   event is marked `failed` and surfaced to operator telemetry (it should never happen with a
   correct client — it indicates a contract bug, which the trial wants to see).

Ordering matters because the pipeline is stateful per athlete: a `set_report` must not be applied
before the `session_start` it belongs to. Per-device serial `seq` + in-order drain provides this
cheaply; there is no need for vector clocks because there is exactly one author per athlete stream
(the device).

### 8.4 The conflict model (why it is nearly empty)

True local-first conflict (concurrent writers to shared mutable state) **does not arise here**, by
construction:

- **Capability state has a single writer — the server.** The device never writes it. So there is no
  client/server merge of derived state; the server's projection always wins on pull (it is a pure
  function of the agreed event log).
- **The event log has a single author per athlete — the device.** Two devices for one athlete are
  out of scope for the v1 cohort (one athlete, one phone); if it ever occurs, the per-device `seq`
  namespacing + server-side `client_event_id` dedup degrade safely to "interleave both streams in
  arrival order," which is still deterministic.
- The only genuine edge is **stale-plan composition** (§8.5), handled by caching exactly one next
  session and degrading gracefully rather than letting the device compose.

Result: convergence is guaranteed by **determinism + single-writer**, not by CRDTs or
last-writer-wins heuristics. This is the cleanest possible sync model and it falls directly out of
D1.

### 8.5 Offline session start: the pre-compose cache

The subtlety: `POST /sessions` (start) requires **server-side composition + recommendation**, which
needs the network. To let an athlete *start* a workout offline, the device must already hold the
plan:

- **After every successful sync (and on `session_complete`), the server pre-composes the athlete's
  next session** and the device caches it (`session_plan.is_next = true`). The athlete can then run
  that entire next session offline.
- The cache holds **exactly one** next session. If the athlete completes it and wants another before
  reconnecting, the app shows a **calm, honest degraded state**: *"Sync to get your next workout."*
  It does **not** fabricate a plan on-device (that would require client-side composition/recommendation
  = a model violation). This conservative degradation matches the product's first-session-safety
  posture (better to wait than to guess).
- On reconnect, the completed session's events drain, the server learns, re-composes, and the next
  plan repopulates the cache. Steady state for a normal athlete (train, then days of rest before the
  next session) is that the next plan is always already cached well before they need it.

### 8.6 Connectivity, scheduling, and lifecycle

- **`NWPathMonitor`** drives a reachability signal; the sync actor wakes on "became reachable," on
  app foreground, and after each local event append (best-effort immediate push when online).
- **`BGTaskScheduler`** (background app refresh) drains the outbox and refreshes the next-session
  cache opportunistically while the app is backgrounded, so a workout finished offline syncs without
  the athlete reopening the app.
- All sync is **best-effort and invisible**; the UI shows at most a tiny, non-alarming "syncing" /
  "offline — saved on device" affordance, never a blocking spinner over the workout. Calm > status.

### 8.7 What sync is *not*

No real-time channel, no websockets, no GraphQL subscriptions, no delta/patch protocol. At ~100
users training a few times a week, sync is a handful of small POSTs and one GET per session. Building
anything more is an Anti-Requirement against scale we don't have (Build Plan §11).

---

## 9. Health integration (Apple Health / HealthKit)

HealthKit is integrated **narrowly and at arm's length from the frozen learning loop.** The model is
frozen; Health data must not become a backdoor input that changes what the model learns.

### 9.1 The hard boundary

> **No HealthKit metric ever feeds the frozen learning loop in v1.** Fatigue in Hush is
> *model-derived* (ES-011: `fatigue = capability − observed`), not sensor-derived. Wiring HRV/heart
> rate/sleep into fatigue, or RIR-like signals into the observation, would be a **model change** and
> is refused (frozen model + ES-011 + the RIR Anti-Requirement, A5). HealthKit is used only for
> (a) an optional profile input and (b) writing the athlete's own workout back to their system of
> record.

This boundary is enforced structurally: `HushHealth` depends only on `HushModelTypes` and is never
imported by the sync/observation path. There is no code path from a `HKQuantitySample` into an
`OutboxEvent`.

### 9.2 What we read

- **Body mass (bodyweight)** — *profile-only, optional.* Bodyweight is **deliberately absent from
  the frozen `Athlete` entity** and Class-B (`vertical_pull`, the bodyweight-dimensioned capability)
  is **frozen inactive** in v1. So in v1 bodyweight is **not** a model input; reading it from Health
  is a low-friction convenience for onboarding/profile and **forward-looking groundwork** for when
  Class-B activates (it is the dimensionally-required input flagged in the Assumptions Register). It
  is stored on the local profile and synced as athlete metadata, **not** as an observation, and is
  clearly out of the loop until a future, reviewed model change consumes it.

Nothing else is read in v1. Specifically **not** heart rate, HRV, sleep, or active energy — reading
them would invite exactly the model violation §9.1 forbids, and they justify no athlete-facing
feature we are allowed to build.

### 9.3 What we write

- **Completed workouts as `HKWorkout`** — *optional, athlete-controlled.* On session complete, Hush
  can write the session to Apple Health as a strength-training workout (duration, type, optional
  total energy if available). This is **not** an Anti-Requirement: it is not social, not
  gamification, not a notification loop — it is *giving the athlete their own data in the OS system
  of record*, which aligns with "the athlete owns their data" and "calm." It is purely an export;
  Hush never reads its own workouts back as a signal.

### 9.4 Permissions and UX

- HealthKit entitlement + `NSHealthShareUsageDescription` / `NSHealthUpdateUsageDescription` with
  honest, specific copy ("Hush can save your finished workouts to Apple Health" / "Hush can read your
  bodyweight to complete your profile").
- Permission prompts are **deferred and contextual**, never on first launch: the bodyweight read is
  offered (skippable) during onboarding; the workout-write permission is offered at the first
  session complete, once. Health is **entirely optional** — the product is fully functional with
  HealthKit denied. No dark patterns, no re-prompting.
- HealthKit availability is gated (`HKHealthStore.isHealthDataAvailable()`); the whole integration is
  behind a protocol so it is mockable in tests and absent on unsupported targets.

---

## 10. Analytics

The Founder Anti-Requirements explicitly refuse athlete-facing analytics dashboards and engagement
vanity metrics (notification open rate, social/notification engagement are named rejects). The
product thesis is measured by **trust earned**, not engagement. This shapes a deliberately unusual
analytics posture.

### 10.1 Two kinds of "analytics," sharply separated

- **Engagement analytics — refused.** No Firebase/Amplitude/Mixpanel/Segment, no ad/attribution
  SDKs (no AppsFlyer/Adjust), no funnels, retention dashboards, session-length optimization, or
  push-engagement loops. These optimize for attention; Hush optimizes for trust (Founder ch.8). They
  are not in the app.

- **Product-data + validation telemetry — required, and first-class.** The thing the trial actually
  measures is the *learning loop*, and that data is the **domain data itself** (observations,
  overrides, recommendations, costly-case events), which already flows to the server through the
  sync path and is analyzed by the **operator-side** instrumentation (shadow baseline A8, override
  log A9, fresh-state A1, costly-case tags A3 — Sprint 4). **No separate analytics pipeline is
  needed for the science**; the product data *is* the analytics, read server-side, where the
  Anti-Requirements about *athlete-facing* dashboards don't apply.

### 10.2 The minimal client telemetry that is allowed

A thin `HushTelemetry` emits only what the *validation/operations* program needs and an athlete
dashboard would never show:

- **Sync/operational health**: outbox depth, push success/failure, time-to-sync, degraded-state
  occurrences (athlete outran the next-session cache). Needed to know the trial's instruments are
  actually capturing data.
- **Contract-violation signals**: a `failed` outbox event (a 4xx that isn't a dedup) — should be
  ~zero; non-zero means a client/server contract bug the trial must catch early.
- **Crash/diagnostics**: via **MetricKit** (Apple-native, privacy-preserving, on-device aggregation)
  — *not* a third-party crash SDK by default. Optionally a privacy-respecting crash reporter if
  MetricKit's latency proves too slow for a 100-user trial; decision flagged in §14.

All of it is **operational, low-volume, non-PII, and consented**; none of it profiles the athlete or
feeds any athlete-facing surface. There is no IDFA, no App Tracking Transparency prompt (nothing to
track), and the App Privacy nutrition label is "Data Not Used to Track You."

---

## 11. Logging

### 11.1 Three logs, three purposes

1. **The audit chain — server-side, the real "log."** Every recommendation's full reconstruction
   (Set→Observation→de-fatigue→Evidence→StateUpdate, plus what it could not exclude) lives in the
   server's immutable history (E in every ES spec; `/internal/audit`). The device does **not**
   duplicate it. The "why this weight?" view fetches the relevant slice on demand.

2. **The local outbox — the durable client truth.** Distinct from diagnostics: the outbox *is* the
   record of what the athlete did, append-only, the source of truth until acked (§7.2). It is the
   one client artifact whose loss is unacceptable.

3. **Diagnostic logging — `OSLog` / unified logging.** Structured, leveled, category-tagged
   (`sync`, `db`, `health`, `flow`, `ui`) `Logger` calls. **Privacy-annotated**: training/health
   values are logged as `.private` (redacted in release), only non-sensitive control-flow is
   `.public`. No PII or rep counts in release logs. Signposts (`OSSignposter`) around sync and DB
   transactions for Instruments profiling (latency is a thesis concern, §4.10).

### 11.2 Privacy discipline

- No logs leave the device except the consented operational telemetry (§10.2) and MetricKit
  payloads. No verbose network logging of bodies in release.
- Health data never appears in any log, public or private.
- Log retention is the OS default (rolling); nothing persisted by Hush beyond the DB.

---

## 12. Testing

Testing strategy follows the project's existing discipline: **the math is exhaustively tested
server-side (284 tests, golden values); the app is tested where its own logic lives — flow,
persistence, sync, and the cross-tier contract — and manually QA'd for the one thing automation
can't judge: whether it feels calm** (Build Plan §9).

| Layer | What | How | Why it matters here |
|---|---|---|---|
| **Pure flow** | `HushSessionFlow` FSM: every transition, skip/replace branches, event emission | plain unit tests, deterministic | the session logic must be correct without a UI or a server |
| **Persistence** | `HushDatabase`: schema round-trip, **outbox survives migration**, append-only invariants, referential integrity | GRDB in-memory DB | an un-synced workout must never be lost (§4.4) |
| **Sync engine** | `HushSync`: offline→online drain, **idempotent retry (no double-apply)**, ordering by `seq`, backoff, pre-compose cache fill, degraded-state | stub `APIClient` + in-memory DB; injected `Clock`/`UUID` | this is where offline-first correctness lives; the highest-value app tests |
| **API contract** | `HushAPI` request/response mapping against recorded fixtures + a shared **contract test** run against the real service in CI | golden request/response fixtures; the Build Plan's end-to-end "start→report full workout→assert state+audit" test is the integration test | the API e2e test *is* the pipeline integration test (Build Plan §4) |
| **Health** | `HushHealth` behind a protocol: read/write mapped correctly; **assert no path from Health into the outbox** | mock `HealthGateway`; an architecture test forbidding the dependency edge | enforces the §9.1 hard boundary mechanically |
| **View models** | `@Observable` view models: intent → event/flow, projection rendering, degraded/empty/error states | unit tests with fakes | thin, but they own the intent→event translation |
| **Snapshot** | the six screens + onboarding + "why" in each state (loading, offline, error, completed) | snapshot tests | the frozen UX must not regress visually |
| **UI e2e** | the core loop: launch → start → report a full workout offline → background → sync → assert acked | XCUITest, airplane-mode toggled | proves offline-first end to end on a device |
| **Determinism / parity** | injected `Clock`/`UUID` give reproducible event streams; (future) Swift-port golden vectors gate any on-device math | property tests | matches the server's determinism discipline; pre-wires the §3.5 gate |
| **Manual QA** | does it feel calm and frictionless? latency, jank, prompt fatigue | human, on-device | "the entire product thesis is that the experience feels calm" (Build Plan §9) |

Architecture/CI guards (cheap, high-leverage):
- **No I/O import in pure modules** (`HushModelTypes`, `HushSessionFlow`).
- **No Health→outbox edge** (the §9.1 boundary as a compile/test rule).
- **No third-party analytics/tracking SDK** in the dependency graph (the §10 stance as a rule).
- **Outbox-preserving migrations** (a test upgrades a DB with pending events and asserts survival).

---

## 13. Deployment

### 13.1 Distribution: TestFlight for the cohort, App Store later

Phase 1 is a **closed ~100-athlete cohort recruited for diversity** (A7 seed-safety gate). The right
channel is **TestFlight** (internal + external testing groups): no public App Store review gating the
trial, easy build rotation, per-build release notes, tester management for the recruited cohort. The
public **App Store** release is a later, post-validation step. This keeps the trial private and the
iteration loop fast (Build Plan: instruments live from day one, gate at week 1).

### 13.2 CI/CD

- **CI:** Xcode Cloud (Apple-native, least setup) *or* GitHub Actions + **fastlane** (`scan` for
  tests, `gym` for builds, `pilot` for TestFlight upload, `match` for signing). Recommend
  **fastlane + GitHub Actions** to keep CI alongside the existing repo tooling; Xcode Cloud is the
  low-friction fallback.
- **Pipeline:** lint (SwiftLint/SwiftFormat) → build all SPM modules → unit + snapshot tests →
  UI e2e on a simulator (airplane-mode loop) → **API contract test against a deployed staging
  service** → archive → TestFlight. The contract test failing blocks release (it guards the §8.2
  surface the app depends on).
- **Code signing:** automatic via `match` (shared encrypted certs/profiles) so any CI runner or
  engineer can sign reproducibly.

### 13.3 Configuration, secrets, and flags

- **Environments:** `staging` and `prod` service base URLs via build configuration / xcconfig. No
  secrets in the bundle beyond the public base URL.
- **Auth:** the **per-athlete token** is provisioned at onboarding (cohort enrollment), stored in
  the **Keychain**, never in `UserDefaults` or the bundle. One operator key never ships in the
  athlete app.
- **Feature flags:** a tiny, local (or server-pulled) flag set for: the instrumentation toggles
  (default **on**), HealthKit read/write enablement, and the (future, default-off) on-device-parity
  experiment. Flags are operational, not engagement experiments — no A/B engagement testing
  (Anti-Requirement).

### 13.4 Versioning and compatibility

- Every event and every pulled projection carries **`model_version` / `capability_model_version`**
  (stamped server-side on every row from day one — Build Plan §3). The app records the version it
  rendered against, so a recommendation is always reconstructable to the exact model that produced
  it.
- **Local DB migrations** are additive/idempotent and **outbox-preserving** (§7.3); an app update
  must never strand a pending workout.
- **API compatibility:** the frozen surface (§8.2) has "no versioning scheme" at 100 users (Build
  Plan §4); the app instead tolerates additive response fields and fails closed (degraded state, not
  crash) on anything it doesn't understand. A hard server/catalog-version bump forces a one-time
  projection refresh on next sync.

### 13.5 Rollout and the gate

The deployment exists to serve the **A7 seed-safety check at week 1** (Phase 1 gate): the very first
real sessions must show the conservative seeds keeping first-session loads safe across the diverse
cohort. So the build that reaches TestFlight must have **all Sprint 4 instruments live** (shadow
baseline, override log, fresh-state scheduling, costly-case tags) and verified end-to-end against
staging *before* the first athlete trains. Rollout is staged (internal testers → small external
batch → full cohort) so a seed-safety problem surfaces on a handful of athletes, not all hundred.

---

## 14. Cross-cutting concerns and open decisions

**Security / privacy.** Keychain for the token; Data Protection (encrypted-at-rest DB); no
third-party tracking; "Data Not Used to Track You" privacy label; Health strictly siloed and
optional; TLS-only, certificate handling per ATS defaults. Threat model = lost/stolen device + a
small trusted cohort, not a public adversarial userbase.

**Accessibility.** Dynamic Type, VoiceOver labels on the (few) controls, sufficient contrast,
large tap targets for the in-gym one-handed reality. Calm UX and accessibility coincide here.

**Performance ("calm is correctness").** Local-first means every athlete action is a local write —
sub-frame, never network-blocked. Sync is background and invisible. Rest timer is precise and
survives backgrounding. Cold launch renders the cached session immediately, before any network.

**Error / empty / degraded states** (designed, not incidental): offline ("saved on device, will
sync"), outran-the-cache ("sync to get your next workout"), no Health permission (fully functional),
sync-failed contract bug (silent to athlete, loud to operator telemetry).

**Explicitly flagged open decisions (route to review):**
- **D1 — local-first vs. Build Plan §9 thin-client.** **RESOLVED 2026-06-10: ADOPTED — Option B
  (event-sourced, server-authoritative-derivation model, §3)**, see `reviews/decisions/OD1_FINAL_DECISION.md`.
  The reconciliation preserves every frozen model invariant. Remaining follow-up: amend Build Plan §9 to
  record Option B as the decision of record (the canonical app-scope edit).
- **SQLCipher vs. Data Protection only** (§7.4) — recommend Data Protection only for v1.
- **MetricKit vs. a third-party crash reporter** (§10.2) — recommend MetricKit; revisit if trial
  diagnostics are too slow.
- **`@Observable` + repositories vs. TCA** (§6.1) — recommend the lighter stack; TCA acceptable if
  the team standardizes on it.
- **Bodyweight-from-Health** (§9.2) is profile-only and out of the loop until Class-B activates via a
  reviewed model change — confirm this stays out of v1 learning.

---

## 15. Build sequence (app sub-sprints) and traceability

Ordered by dependency, mirroring the Build Plan's "math and instruments first, then the shell":

1. **Foundations** — `HushModelTypes`, `HushDatabase` (schema + migrations + outbox), `HushAPI`
   client, composition root. *Depends on the API being stood up in parallel (Build Plan §4).*
2. **Sync core** — `HushSync` outbox engine: durable-before-confirm, ordered idempotent push,
   projection pull, pre-compose cache, offline/degraded states. *The offline-first guarantee.*
3. **Session flow + UI** — `HushSessionFlow` FSM + the six screens + onboarding + "why". *Frozen UX.*
4. **Health + telemetry** — `HushHealth` (bodyweight read / workout write, siloed) and
   `HushTelemetry` (operational + MetricKit). *Instruments must be live for the gate.*
5. **Hardening + deploy** — full test matrix (§12), CI/fastlane/TestFlight (§13), staged rollout to
   the cohort gated by **A7 week-1 seed safety**.

**Traceability of every athlete-facing element to a frozen source:**

| App element | Frozen source |
|---|---|
| 6 screens + onboarding + "why" | Build Plan §9; Founder Workout-Engine |
| One-number set report (no RIR) | ES-011 / A5 / Anti-Requirements |
| Skip / replace lifecycle | ES-001; ES-006 L2 (REPLACE_EXERCISE) |
| Lossless override-target capture | ES-010 / A9 |
| Session plan = composed, load-free-then-frozen | ES-009 (Inv. 3); ES-009.1; ES-006 governor cadence |
| Server-only learning, transactional, single writer | ES-007; System Architecture; Build Plan §5 |
| Instruments live from session one | Sprint 4; Validation Architecture; A1/A3/A7/A8/A9 |
| Catalog mirror + replacement groups | ES-002 (with ES-008 v2 class match) |
| No charts/streaks/social/notifications/AI-chat | Founder ch.8 Anti-Requirements |
| Bodyweight out of the v1 loop | Assumptions Register (bodyweight absent from frozen Athlete; Class-B inactive) |

---

*This document specifies the mobile architecture only. The frozen model is authoritative as in
`HUSH_V1_EXECUTION_CONTEXT.md`; the server pipeline status is `HUSH_V1_PROJECT_STATUS.md`. The one
decision requiring sign-off before build is **D1** (§3) — local-first reconciled with, not against,
the frozen invariants.*
