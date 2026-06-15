# MOBILE_BUILD_PLAN_V1.md — iOS Engineering Blueprint (Sprint 5 / Wave-2 B6)

> A **step-by-step engineering blueprint** a SwiftUI engineer executes to build the Hush v1 iOS app. It
> **implements**, without redesigning, the frozen `MOBILE_ARCHITECTURE_V1.md` (Option B, local-first
> event-sourced) against the frozen `API_CONTRACT_V1.md`, rendering the frozen 6-screen UX. **It is a build
> plan, not an architecture review** — every module, boundary, and data path traces to a frozen document;
> where a detail depends on an unresolved Wave-2 decision (OD-4/5/6/7/9), the plan follows the
> architecture's **recommended default** and marks the toggle point. **No feature is added; no model math
> runs on device.** Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-10 · Assumes: **OD-1 = Option B adopted**; `API_CONTRACT_V1.md` frozen;
> `MOBILE_ARCHITECTURE_V1.md` frozen; Hush UX/UI frozen · Targets: iOS 17+, Swift 5.9+, SwiftUI.
> Server: Hush v1 — advisory (schema v11, 284 tests; `actual_weight` a learning input, M1). The backend
> API shell this app talks to is **built and `pytest`-green** (Wave-2), pending off-host deployment (Ops).

---

## 0. Fixed constraints (read first — these are invariants, not choices)

- **No model math on device.** No ReferenceStrength/Epley/blend/fatigue/decision governor in Swift. The
  device renders loads/reps the server derived and relays events (`MOBILE_ARCHITECTURE_V1.md` §3.4).
- **Server is the single writer.** The device's `capability_state` etc. are a **read cache**, overwritten
  on pull; the **outbox** is the only client-origin source of truth (§6.3 tiers).
- **One number in.** The set screen captures `actual_reps` (+ `actual_weight`, both per ES-001) and asks
  **nothing** about effort/RIR/proximity-to-failure (Anti-Requirement). The app has no field for it.
- **Active capabilities = 5 Class-A only:** `horizontal_push`, `horizontal_pull`, `vertical_push`,
  `knee_dominant`, `hip_dominant`. `vertical_pull` / `core_stability` are inactive and must never render.
- **Health never enters the learning loop.** No code path from a `HKSample` to an `OutboxEvent` (§9.1).
- **Frozen UX = 6 screens + onboarding + optional "why".** No screen added; no charts/streaks/social/
  notifications/AI-chat (Founder ch.8 Anti-Requirements).
- **Loads in kilograms; reps integer; ids opaque** (per `API_CONTRACT_V1.md` §1).

---

## 1. Project structure

A single Xcode project wrapping a set of **Swift Package Manager local packages** with a strict acyclic
graph (`MOBILE_ARCHITECTURE_V1.md` §5). Repo layout:

```
HushApp/
├─ HushApp.xcodeproj
├─ App/                         # the app target (composition root)
│   ├─ HushAppApp.swift          # @main, DI wiring, app lifecycle, BGTask registration
│   ├─ AppContainer.swift        # the one place concretes are bound to protocols
│   ├─ Config/                   # xcconfig: staging/prod base URLs, flags
│   └─ Resources/                # Assets, Info.plist, entitlements (HealthKit, BGTask)
├─ Packages/
│   ├─ HushModelTypes/           # pure Codable DTOs (no logic, no I/O)
│   ├─ HushSessionFlow/          # pure session FSM (no math, no I/O)
│   ├─ HushDatabase/             # GRDB: projection + outbox + migrations
│   ├─ HushAPI/                  # typed REST client over the frozen endpoints + auth
│   ├─ HushSync/                 # outbox push/pull engine (the offline-first heart)
│   ├─ HushHealth/               # HealthKit gateway behind a protocol (siloed)
│   ├─ HushTelemetry/            # operational events + MetricKit (no 3rd-party analytics)
│   └─ HushUI/                   # the 6 screens + onboarding + "why" (SwiftUI)
└─ HushAppTests/ , per-package Tests/   # see §10
```

**CI-enforced rule:** `HushModelTypes` and `HushSessionFlow` import **no I/O framework** (no GRDB, no
HealthKit, no networking) — they are the device-side analog of the server's pure model package.

---

## 2. Swift package / module layout

Build the packages in dependency order (leaves first). Each `Package.swift` declares only the dependencies
below — the graph is acyclic and compile-checked.

| Package | Product type | Depends on | Responsibility (frozen §5.1) |
|---|---|---|---|
| **HushModelTypes** | library (pure) | — | Codable DTOs mirroring frozen entities + the `OutboxEvent` sum type; `model_version`/`capability_model_version` stamps. **No logic.** |
| **HushSessionFlow** | library (pure) | HushModelTypes | The session FSM (states + skip/replace transitions); emits domain events. **No math, no I/O.** |
| **HushDatabase** | library (I/O) | HushModelTypes, GRDB | Local projection (read model) + append-only outbox + migrations; repository protocols + GRDB impls. |
| **HushAPI** | library (I/O) | HushModelTypes | Typed REST client over the frozen endpoints (§8.2 of arch) + bearer auth; DTO ↔ wire mapping. |
| **HushSync** | library (I/O) | HushModelTypes, HushDatabase, HushAPI | Outbox drain (ordered, idempotent), projection pull, pre-compose cache, retry/backoff, connectivity. |
| **HushHealth** | library (I/O) | HushModelTypes | HealthKit gateway behind a protocol: read bodyweight (profile-only), write `HKWorkout`. Siloed. |
| **HushTelemetry** | library (I/O) | HushModelTypes | Operational/validation events + MetricKit. **No third-party analytics SDK.** |
| **HushUI** | library (SwiftUI) | HushModelTypes, HushSessionFlow | The 6 screens + onboarding + "why" as feature views + `@Observable` view models. |
| **HushApp** (target) | app | all of the above | Composition root: bind protocols → concretes, routing, lifecycle, entitlements, flags. |

Third-party dependency: **GRDB.swift** only (pinned). No networking lib (use `URLSession`), no analytics
SDK, no architecture framework (see §3).

---

## 3. State management architecture

**Pattern (per OD-7 recommended default): plain SwiftUI `@Observable` view models over injected
repositories, Swift Concurrency (`async/await`, `actor`).** No TCA/Redux (the dominant complexity is sync +
durability, not view composition — `MOBILE_ARCHITECTURE_V1.md` §6.1). The design maps cleanly onto TCA if
the team later standardizes on it; default stands.

**Unidirectional flow:**
```
View (SwiftUI, dumb) ──intent──► ViewModel (@Observable) ──command──► Repository / Sync (actor)
      ▲                                  │                                   │
      └──────── renders projection ──────┘◄──── projection updates ──────────┘  (GRDB ValueObservation)
```

**Three tiers of client state (mirror the server's zones — §6.3):**
1. **Ephemeral UI state** — rest-timer countdown, current screen, button-disabled flags. Lives in view
   models; never persisted; lost on relaunch by design.
2. **Local projection (read model, replaceable)** — `athlete`, `capabilityState×5`, `strategyState`,
   `preferenceState`, the cached `Session` plan, last "why". **Server-authoritative**; overwritten wholesale
   on pull. Safe to delete and re-pull.
3. **Local event log (outbox, authoritative-until-acked)** — the append-only `OutboxEvent` stream. **The
   only client-origin source of truth.** Never overwritten by the server; marked `acked` once durably
   accepted.

**Cardinal client rule: tier 2 is disposable; tier 3 is sacred.** Recovery may rebuild tier 2 from the
server; nothing may discard an un-acked tier-3 event.

**Determinism:** inject `Clock` and `UUIDProvider` everywhere event timestamps / idempotency keys are
created, so tests produce reproducible event streams (matches the server's golden-determinism discipline).

### 3.1 HushModelTypes — the DTOs to define first

Codable value types mirroring `API_CONTRACT_V1.md` §3 and the frozen entities (no logic):

```swift
public enum Capability: String, Codable, CaseIterable {   // active Class-A only
    case horizontalPush = "horizontal_push", horizontalPull = "horizontal_pull"
    case verticalPush = "vertical_push", kneeDominant = "knee_dominant", hipDominant = "hip_dominant"
}
public struct Athlete: Codable { let id: String; let sex: String; let age: Int
    let experience: String; let modelVersion: String; let capabilityModelVersion: String }
public struct CapabilityState: Codable { let capability: Capability; let score: Double; let confidence: Double }
public struct StrategyState: Codable { let weeklyFrequency: Int; let weeklyVolume: String
    let primaryFocus: String?; let secondaryFocus: String? }
public struct Block: Codable, Identifiable {           // ExerciseBlock (contract §3.2)
    public let id: String; let position: Int; let capability: Capability; let exercise: String
    let difficultyFactor: Double; let recommendedWeight: Double; let targetReps: Int
    let targetSets: Int; let restSeconds: Int; let selectionReason: String
    let recommendationId: String; var status: String }
public struct Session: Codable, Identifiable {          // contract §3.1
    public let id: String; var status: String; let week: Double; let sessionIndex: Int
    let blocks: [Block]; let modelVersion: String; let capabilityModelVersion: String }
public struct Projection: Codable {                     // contract §3.3 (pull payload)
    let athlete: Athlete; let capabilityState: [CapabilityState]; let strategyState: StrategyState
    let today: Session?; let modelVersion: String; let capabilityModelVersion: String }

public enum OutboxEvent: Codable {                       // the client-authored sum type
    case setReport(SetReport), skip(Skip), replace(Replace), sessionComplete(SessionComplete)
    // each payload carries clientEventId (idempotency key) + seq, set by the Clock/UUID providers
}
public struct SetReport: Codable { let clientEventId: String; let seq: Int; let sessionId: String
    let blockId: String; let setNumber: Int; let actualReps: Int; let actualWeight: Double }  // NO effort field
public struct Skip: Codable { let clientEventId: String; let seq: Int; let blockId: String; let reason: String }
public struct Replace: Codable { let clientEventId: String; let seq: Int; let blockId: String
    let fromExercise: String; let toExercise: String?; let offCatalogText: String?; let reason: String }
public struct SessionComplete: Codable { let clientEventId: String; let seq: Int; let sessionId: String; let finishedEarly: Bool }
```

---

## 4. Local database implementation (HushDatabase)

**Engine: GRDB.swift over SQLite** (mirrors the server's SQLite discipline — §7.1). It persists a **subset**
of the server zones: the projection it renders + the outbox it authors. It does **not** replicate immutable
history (server-owned; pulled on demand for "why").

### 4.1 Schema (device subset — §7.2)

Define as GRDB `Codable` records + a `DatabaseMigrator`. Tables:

```
-- Local projection (read model; server-authoritative; REPLACEABLE) --
athlete(id PK, sex, age, experience, model_version, capability_model_version, updated_at)
capability_state(athlete_id, capability, score, confidence, updated_at, PRIMARY KEY(athlete_id, capability)) -- 5 rows
strategy_state(athlete_id PK, weekly_frequency, weekly_volume, primary_focus, secondary_focus)
preference_state(athlete_id, exercise_family, preference_score, PRIMARY KEY(athlete_id, exercise_family))
session_plan(id PK, athlete_id, status, started_at, completed_at, payload JSON, is_next BOOL)  -- payload = full composed plan
exercise_catalog(code PK, name, primary_capability, secondary_capability, weights, equipment_type,
                 replacement_group, catalog_version)  -- read-only mirror for offline skip/replace

-- Local event log (OUTBOX; client-authored; APPEND-ONLY; authoritative until acked) --
outbox_event(client_event_id TEXT PK, athlete_id, session_id, seq INTEGER,
             kind TEXT, payload JSON, created_at_logical TEXT,
             sync_status TEXT, attempt_count INTEGER, last_error TEXT)   -- sync_status: pending|inflight|acked|failed

-- Bookkeeping --
local_schema_version(version INTEGER)
sync_cursor(athlete_id, last_acked_seq, last_pulled_at, server_projection_etag)
```

Notes (frozen §7.2): **`actual_weight` is captured, not just reps**; **replace payload preserves
off-catalog targets verbatim** (A9, never dropped); the catalog mirror is **versioned** — a
`catalog_version` mismatch on sync forces a refresh.

### 4.2 Repository protocols (injected; fakeable)

```swift
public protocol ProjectionRepository {            // tier-2: replaceable read model
    func loadProjection(athleteId: String) throws -> Projection?
    func replaceProjection(_ p: Projection) throws            // wholesale overwrite on pull
    func nextSession(athleteId: String) throws -> Session?    // is_next == true
    func observeProjection(athleteId: String) -> AsyncStream<Projection>   // GRDB ValueObservation
}
public protocol OutboxRepository {                 // tier-3: append-only, sacred
    func append(_ event: OutboxEvent) throws                  // inside a local txn, BEFORE UI confirm
    func pending(athleteId: String) throws -> [OutboxRow]     // ordered by seq
    func mark(_ clientEventId: String, status: SyncStatus, error: String?) throws
    func nextSeq(athleteId: String) throws -> Int             // per-device monotonic
}
```

### 4.3 Encryption & migrations
- **At rest:** iOS Data Protection `NSFileProtectionComplete`/`.completeUnlessOpen` on the DB file (§7.4),
  keyed to the device passcode. **SQLCipher is deferred** unless OD-5 demands it — build behind a single
  config point so it can be enabled without touching call sites.
- **Migrations (OD-10, §7.3):** versioned, **additive, idempotent**, registered with GRDB's
  `DatabaseMigrator`. **Outbox rows must survive every app update** — a migration test asserts outbox
  preservation across upgrades (the un-syncable-workout-loss is the one unacceptable failure).

---

## 5. Outbox implementation

The outbox is the durability mechanism — the contract's idempotency (`API_CONTRACT_V1.md` §13) is delivered
here. Every athlete action becomes an immutable, independently-authored event.

**Write path (durable-before-confirm — §8.3 step 1):**
1. View model translates the intent into an `OutboxEvent`, stamping a **client-generated UUID**
   (`clientEventId` = idempotency key, from `UUIDProvider`) and a **per-device monotonic `seq`**
   (`OutboxRepository.nextSeq`), with `created_at_logical` from the injected `Clock`.
2. Append it to `outbox_event` **inside a local transaction**, status `pending`, **before the UI confirms**.
   Only after the local commit does the view model advance the FSM / show "done".
3. The event is now durable — it survives crash, force-quit, and offline by construction.

**Event kinds → endpoints (the contract surface, §4 of the contract):**

| OutboxEvent | Endpoint | Idempotency key |
|---|---|---|
| `setReport` | `POST /sessions/{id}/sets` | `clientEventId` |
| `skip` | `POST /blocks/{id}/skip` | `clientEventId` |
| `replace` | `POST /blocks/{id}/replace` | `clientEventId` |
| `sessionComplete` | `POST /sessions/{id}/complete` | `clientEventId` |

(Session **start** uses `POST /sessions` with a `client_request_id`; normal operation runs the pre-fetched
plan and does not call it live — §6 of the contract.)

**Invariant:** the outbox is **append-only**; rows are never edited except to advance `sync_status`
(`pending → inflight → acked` / `failed`) and `attempt_count`/`last_error`. It is never overwritten by a
pull.

---

## 6. Sync engine implementation (HushSync)

An **outbox-based, event-sourced, eventually-consistent** synchronizer with a server-authoritative
projection (§8). Implemented as a Swift `actor` so all drain state is serialized.

### 6.1 Contract in one paragraph (§8.1)
Push an ordered, idempotent stream of athlete events; pull the resulting authoritative projection + the
next pre-composed session. Pushes are deterministic facts the server replays through the canonical
pipeline; pulls overwrite the disposable read model. The athlete's experience never blocks on the network.

### 6.2 Push — ordered, idempotent replay (§8.3)
```
actor SyncEngine {
  func drain(athleteId) async {
    let rows = outbox.pending(athleteId)            // ordered by seq, ascending
    for row in rows {                               // ONE in-flight at a time, in seq order
      mark(row, .inflight)
      do {
        let result = try await api.send(row)        // POST to row.kind's endpoint, clientEventId = idempotency key
        outbox.mark(row.id, .acked, nil)            // 2xx (fresh apply OR server dedup — identical response)
        cursor.advance(lastAckedSeq: row.seq)
      } catch let e as APIError where e.isTransient { // network / 429 / 5xx
        backoffWithJitter(row.attemptCount); mark(row, .pending); return   // stop; retry later, SAME key
      } catch let e as APIError where e.isPermanent { // 4xx that isn't a dedup
        outbox.mark(row.id, .failed, e.message); telemetry.contractViolation(row, e)  // should be ~0
      }
    }
    await pull(athleteId)                            // after draining, refresh projection + next session
  }
}
```
- **Ordering matters** (§8.3): a `setReport` must not be applied before the `session*` it belongs to —
  per-device serial `seq` + in-order drain guarantees it. No vector clocks (single author per athlete).
- **Idempotency** (contract §13): the server dedups on `clientEventId`; a replay returns the **same**
  response, so blind retries never double-apply. The device guarantees *at-least-once, ordered*; the server
  makes it *effectively-once*.

### 6.3 Pull — projection adoption (§8.1)
`GET /sessions/today` (with `If-None-Match` / `ETag`) + the projection; on `200`, `ProjectionRepository
.replaceProjection` overwrites tier-2 wholesale and caches the next session (`is_next = true`). On
`{today: null, reason: "awaiting_compose"}` (§6 of contract), surface the calm degraded state.

### 6.4 Pre-compose cache (offline session start — §8.5)
After every successful sync and on `sessionComplete`, the **server pre-composes the next session**; the
device caches **exactly one**. The athlete runs that next session fully offline. If they outrun the cache,
show the honest *"Sync to get your next workout"* — **never fabricate a plan on device** (that would be
client-side composition = a model violation).

### 6.5 Connectivity, scheduling, lifecycle (§8.6)
- **`NWPathMonitor`** → wake the drain on "became reachable", on app foreground, and after each local
  append (best-effort immediate push when online).
- **`BGTaskScheduler`** (background refresh) drains the outbox + refills the cache while backgrounded.
- All sync is **best-effort and invisible** — at most a tiny "syncing"/"offline — saved on device"
  affordance; never a blocking spinner over the workout.

### 6.6 Error mapping (contract §15)
Map HTTP → action: `2xx`→ack; `401`→terminal "re-enroll" (stop retrying); `403/404/422/400`→permanent,
mark `failed` + telemetry; `409`→pull projection then reconcile; `429/5xx`→transient backoff. Honor
`Retry-After`.

---

## 7. HealthKit integration (HushHealth)

Integrated **narrowly and at arm's length from the learning loop** (§9). Behind a protocol so it is
mockable and absent on unsupported targets.

```swift
public protocol HealthGateway {
    func isAvailable() -> Bool
    func requestProfileReadAuth() async -> Bool          // bodyweight only
    func readBodyweightKg() async -> Double?             // profile-only, optional
    func requestWorkoutWriteAuth() async -> Bool
    func writeStrengthWorkout(start: Date, end: Date, energyKcal: Double?) async   // HKWorkout export
}
```

**Hard boundary (§9.1) — enforced structurally:** `HushHealth` depends **only** on `HushModelTypes` and is
**never imported** by the sync/observation path. A CI/architecture test asserts **no edge `HushHealth →
HushSync`/outbox**. There is no code path from an `HKQuantitySample` into an `OutboxEvent`.

- **Read (§9.2):** **bodyweight only**, *profile metadata, optional, out of the v1 loop* (Class-B inactive).
  Stored on the local profile, synced as athlete metadata via `PATCH /profile` (`bodyweight_kg`), **never**
  as an observation. **Gated by OD-4** — build behind a flag; if OD-4 says "do not read in v1," the read
  path stays dark. **Nothing else is read** (no HR/HRV/sleep/energy).
- **Write (§9.3):** on session complete, optionally write the session as an `HKWorkout` (export only; Hush
  never reads its own workouts back as signal).
- **Permissions (§9.4):** deferred/contextual prompts (bodyweight at onboarding, skippable; workout-write
  at first complete, once). Fully functional with HealthKit **denied**. No dark patterns, no re-prompting.

---

## 8. Authentication flow

**Scheme (contract §2): one bearer token per athlete, provisioned out-of-band at enrollment, stored in the
Keychain, attached to every request.** There is **no in-app registration or login** (closed cohort).

```swift
public protocol TokenStore {                  // Keychain-backed
    func save(_ token: String) throws         // kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    func load() -> String?
    func clear() throws
}
```

**Flow:**
1. **Enrollment (out-of-band):** the operator creates the `Athlete` and issues the token; it reaches the
   device through the secure provisioning channel (Wave-2 BB-25) — entered once (e.g. a deep link / paste at
   onboarding), **never** in URLs/logs.
2. **Storage:** `TokenStore.save` into the Keychain with a restrictive accessibility class
   (`...ThisDeviceOnly`); never `UserDefaults`/bundle.
3. **Attach:** `HushAPI` adds `Authorization: Bearer <token>` to every request. TLS-only (ATS defaults).
4. **401 handling (contract §2/§15):** persistent `401` is **terminal "re-enroll"** — clear local caches,
   show a calm re-enroll state; **do not** retry-loop. (Recovery posture is OD-3; the app surfaces it,
   support re-provisions.)
5. **Scope:** the token authorizes exactly the one athlete's own data; the app never sends another athlete's
   ids (the server derives identity from the token — BB-19).

The onboarding screen collects the ES-003 profile fields (`sex`, `age`, `experience`) and submits them
through the enrollment flow (not a public endpoint); `GET/PATCH /profile` read/correct them after.

---

## 9. Session runtime architecture (HushSessionFlow + HushUI)

The running workout is a **pure finite-state machine** (no math, no I/O) fed the cached `Session` plan,
emitting domain events on each meaningful transition (§6.2). This is what makes the runtime unit-testable
without a UI or server.

```swift
public enum SessionState: Equatable {
    case idle
    case loaded(Session)
    case runningBlock(index: Int, setNumber: Int)     // showing weight/reps, "set N of M"
    case awaitingReps(index: Int, setNumber: Int)     // the one question
    case resting(index: Int, setNumber: Int, until: Date)
    case skipped(index: Int)
    case replacePending(index: Int)
    case completed
}
public enum SessionIntent { case start, submitReps(Int, weightKg: Double), skip(reason: String),
    replace(to: String?, offCatalog: String?, reason: String), restElapsed, finishEarly }
public enum DomainEvent { case setReported(SetReport), blockSkipped(Skip), blockReplaced(Replace),
    sessionCompleted(SessionComplete) }   // handed to the OutboxRepository, never computed-as-math

public struct SessionFSM {                 // pure: (state, intent, plan) -> (state, [DomainEvent])
    public func apply(_ intent: SessionIntent, to state: SessionState, plan: Session)
        -> (SessionState, [DomainEvent])
}
```

**Runtime rules (frozen):**
- The **whole prescription is fixed at composition time and does not change mid-session** (`API_CONTRACT_V1.md`
  §0.3; arch §3.3). `submitReps` advances the FSM over the *already-frozen* plan; it does **not** re-fetch a
  new load. The server's `POST /sets` response is an **ack + next-action**, applied as flow control only.
- **Loads/reps come from the cached plan**, not from any device computation.
- **Skip/replace are first-class welcomed paths** (arch §2). Replace offers alternates from the **mirrored
  replacement group** offline; off-catalog substitutes are captured verbatim (A9).
- **Rest timer** is local-only (ephemeral tier), precise, and **survives backgrounding** (compute from
  `until: Date`, not a ticking counter).

**The 6 screens (frozen UX) → FSM/render mapping:**

| Screen | State | Athlete action | Emits |
|---|---|---|---|
| Home | `idle`/`loaded` | sees today's workout + est. duration; taps Start | `start` (plan `planned→active` locally) |
| Exercise | `runningBlock` | sees name, weight, reps, "set N of M" | — (render) |
| Set completion | `awaitingReps` | answers reps → Submit | `setReported` → outbox |
| Rest | `resting` | watches timer | — (local) |
| Equipment-busy / skip & replace | `skipped`/`replacePending` | skip / replace | `blockSkipped` / `blockReplaced` → outbox |
| Complete | `completed` | "Well Done." | `sessionCompleted` → outbox; triggers sync + next pre-compose |
| Onboarding | (pre-session) | enters ES-003 fields | profile create (enrollment) |
| "Why this weight?" (optional) | any | reads explanation | `GET /recommendations/{id}/why` (on-demand) |

View models (`@Observable`) translate intents → `SessionFSM.apply` → append emitted events to the outbox
(durable-before-confirm) → advance UI. They render only the **local projection**, never a live network call.

---

## 10. Testing strategy

Test where the app's own logic lives — flow, persistence, sync, the cross-tier contract — and manually QA
the one thing automation can't judge: whether it feels calm (§12 of arch). The model math is exhaustively
tested **server-side**; the app does not re-test it.

| Layer | What | How |
|---|---|---|
| **Pure flow** (`HushSessionFlow`) | every FSM transition, skip/replace branches, event emission | plain unit tests, deterministic |
| **Persistence** (`HushDatabase`) | schema round-trip, **outbox survives migration (OD-10)**, append-only & referential integrity | GRDB in-memory DB |
| **Sync** (`HushSync`) | offline→online drain, **idempotent retry (no double-apply)**, ordering by `seq`, backoff, pre-compose cache fill, degraded state | stub `APIClient` + in-memory DB; injected `Clock`/`UUID` |
| **API contract** (`HushAPI`) | request/response mapping vs recorded fixtures + a shared **contract test** against the real service in CI | golden fixtures; the server's start→report→assert e2e is the integration test |
| **Health boundary** (`HushHealth`) | read/write mapped; **architecture test forbidding `Health → outbox`** | mock `HealthGateway` + a dependency-edge test |
| **View models** | intent → event/flow; projection rendering; degraded/empty/error states | unit tests with fakes |
| **Snapshot** | the 6 screens + onboarding + "why" in each state (loading/offline/error/completed) | snapshot tests |
| **UI e2e** | launch → start → report a full workout **offline** → background → sync → assert acked | XCUITest, airplane-mode toggled |
| **Determinism** | injected `Clock`/`UUID` → reproducible event streams | property tests |
| **Manual QA** | does it feel calm? latency, jank, prompt fatigue | human, on-device |

**CI architecture guards (cheap, high-leverage — §12):** no I/O import in pure modules; **no Health→outbox
edge**; **no third-party analytics/tracking SDK** in the graph; **outbox-preserving migrations**.

---

## 11. Build order

Ordered by dependency, mirroring the architecture's sub-sprints (§15) and Wave-2 batch B6. Each step ends
green before the next starts.

**Step 1 — Foundations.**
1.1 `HushModelTypes` (DTOs §3.1 + `OutboxEvent`). 1.2 `HushDatabase` (schema §4.1, repositories §4.2,
`DatabaseMigrator` with the **outbox-preserving** migration test). 1.3 `HushAPI` (typed client for the §6
endpoints + `TokenStore`/Keychain + error mapping §6.6). 1.4 `HushApp` composition root + `AppContainer`
DI + xcconfig (staging/prod URLs). *Builds against `API_CONTRACT_V1.md`; backend BB-14 proceeds in
parallel — integrate at the contract.*

**Step 2 — Sync core (the offline-first guarantee).**
`HushSync` actor: durable-before-confirm append, ordered idempotent push (§6.2), projection pull (§6.3),
pre-compose cache (§6.4), `NWPathMonitor` + `BGTaskScheduler` (§6.5), backoff, degraded state. **Highest-
value tests live here** — write them alongside.

**Step 3 — Session flow + UI.**
`HushSessionFlow` FSM (§9) then `HushUI`: the 6 screens + onboarding + "why", `@Observable` view models
wiring intent → FSM → outbox → render. Frozen UX only; snapshot tests per state.

**Step 4 — Health + telemetry.**
`HushHealth` (bodyweight read behind OD-4 flag / workout write, siloed, boundary test) and `HushTelemetry`
(operational events + MetricKit; per OD-6 default). **Instruments must be live for the A7 gate.**

**Step 5 — Hardening + deploy.**
Full test matrix (§10), the offline XCUITest e2e, the **API contract test against staging** in CI, CI/CD
(OD-9: fastlane + GitHub Actions default, or Xcode Cloud), code signing via `match`, TestFlight. Staged
rollout to the cohort gated by **A7 week-1 seed safety** (server-side BB-11).

**Integration checkpoints (with the backend tracks):**
- After Step 1: `HushAPI` ⇄ live `BB-14` API on staging (auth + one `GET /sessions/today`).
- After Step 2: full offline→online drain against staging with **idempotent replay** verified (ties to
  server BB-1).
- Before Step 5 ships: the Sprint-4 instruments (shadow A8 / override A9 / fresh-state A1 / costly tags)
  confirmed capturing from the app's first real session (server BB-10) — or the trial is "dead on arrival".

---

## 12. Decision toggle points (build to the default; flip if the OD resolves otherwise)

These follow the architecture's **recommended defaults**; each is a single, isolated config/flag point so a
different OD outcome does not ripple:

| Decision | Default built | Toggle point |
|---|---|---|
| OD-4 HealthKit bodyweight read | **off / profile-only behind a flag** | `HealthGateway` feature flag in `AppContainer` |
| OD-5 DB encryption | **iOS Data Protection only** (SQLCipher deferred) | one GRDB config point in `HushDatabase` |
| OD-6 crash diagnostics | **MetricKit** (no 3rd-party SDK) | `HushTelemetry` sink selection |
| OD-7 state management | **`@Observable` + repositories** | view-model layer (TCA-mappable if chosen) |
| OD-9 CI/CD | **fastlane + GitHub Actions** | CI config only (Xcode Cloud fallback) |

---

## 13. What this blueprint does NOT do

- It does **not** redesign the architecture, the UX, or the API — it implements the frozen `MOBILE_
  ARCHITECTURE_V1.md` / `API_CONTRACT_V1.md` / 6-screen UX.
- It adds **no feature** (no charts/streaks/social/notifications/AI-chat/RIR) — Anti-Requirements are
  refused, not parked.
- It runs **no model math on device** and creates **no second writer** of model state.
- It does **not** begin implementation — it is the executable plan for Wave-2 batch B6.

---

*Engineering build plan only. Implements the frozen mobile architecture and API contract; no redesign, no
new features, no model-behavior change. Traceability: `MOBILE_ARCHITECTURE_V1.md` · `API_CONTRACT_V1.md` ·
`OD1_FINAL_DECISION.md` (Option B) · `WAVE_2_EXECUTION_CHECKLIST.md` (batch B6). Frozen model authoritative
as in `HUSH_V1_EXECUTION_CONTEXT.md`.*
