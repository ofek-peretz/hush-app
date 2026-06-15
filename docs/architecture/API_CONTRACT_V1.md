# API_CONTRACT_V1.md

> The wire contract between the Hush v1 iOS app (Sprint 5) and the single Hush service
> (Sprints 0–4). This document **specifies the existing frozen surface** — it does not
> redesign the model, the UX, or the engine boundaries, and it adds no feature. Every
> endpoint traces to the frozen API surface in `MOBILE_ARCHITECTURE_V1.md` §8.2 (Build
> Plan §4) and to a frozen ES spec or System-Architecture invariant. Where a section
> below is deliberately *minimal* (history, profile), that minimalism is the frozen
> design (Founder ch.8 Anti-Requirements), not an omission.
>
> - **Status:** Proposed (Sprint 5 deliverable). Pending the same **D1** sign-off as the
>   mobile architecture (local-first reconciled with the frozen invariants).
> - **Date:** 2026-06-10
> - **Server:** Hush v1 — **advisory** (the athlete owns load). Pipeline built through DX-09/M5 + DX-08/10/12
>   and the **Wave-2 backend API shell that implements this contract** (**schema v11, 284 tests** — model
>   golden 189 + API pytest 95; `pytest`-green, not yet deployed); `actual_weight` is a learning input (M1);
>   `recommended_weight` advisory (DX-18).
> - **Reads:** `MOBILE_ARCHITECTURE_V1.md` §3/§7/§8 · `HUSH_V1_EXECUTION_CONTEXT.md` ·
>   Build Plan §4/§9 · System Architecture · ES-001/002/006/009/010/011/012.
> - **Audience:** the engineer implementing the service endpoints and the engineer
>   implementing `HushAPI`/`HushSync` on the device. The two must agree on this file.

---

## 0. Governing constraints (read first)

These are inherited, non-negotiable, and shape every rule below. They are restated so the
contract is self-contained; each traces to a frozen source.

1. **The server is the single writer and the audit authority** (ES-007; System Architecture).
   The device never computes a load, a capability score, or a decision; it renders ones the
   server derived and relays events. There is no client-side model math in v1 (Mobile Arch D1,
   §3.4).
2. **The athlete's events are an append-only, ordered stream** authored on the device; the
   server replays them through the canonical transactional pipeline
   (`Set → Observation → de-fatigue → Evidence → StateUpdate`, committed atomically). Because
   the pipeline is deterministic, replay yields identical state regardless of *when* it runs
   (Mobile Arch §3.3, §8.3).
3. **A session is composed server-side, load-free, then frozen** (ES-009 Inv. 3; ES-006
   governor cadence — once per capability per session). The whole prescription is fixed at
   composition time and **does not change mid-session** in response to set reports. This is
   what makes the session cacheable and offline-runnable (Mobile Arch §3.3).
4. **Closed cohort, ~100 athletes.** There is intentionally **no public sign-up, no API
   version negotiation, and no operator surface in this contract** (Build Plan §4). Tokens are
   provisioned out-of-band at enrollment.
5. **The model input boundary is hard** (§13). The athlete-provided **learning inputs** are the per-set
   `(actual_weight, actual_reps)` pair, plus skip/replace/override targets. The model's **effective load
   is the athlete's logged `actual_weight`** (M1/DX-01); `recommended_weight` is the advisory
   prescription, itself derived from learned capability (M1/DX-20). `actual_weight` is **a required
   learning input** (see §7.1; reverses `reviews/implementation/F1_CLARIFICATION_REPORT.md`, per M1/DX-06). No
   effort/RIR/proximity-to-failure, ever (ES-011 / A5 Anti-Requirement). No HealthKit metric feeds the loop
   (§9.1 of Mobile Arch).

Active capabilities in v1 are the **five Class-A** external-load capabilities:
`horizontal_push`, `horizontal_pull`, `vertical_push`, `knee_dominant`, `hip_dominant`.
`vertical_pull` (Class-B) and `core_stability` (Class-C) are **frozen inactive** and MUST NOT
appear in any composed session or be accepted in any request.

---

## 1. Conventions

- **Base URL:** `https://{env}.hush.internal` where `{env}` ∈ `staging`, `prod`
  (Mobile Arch §13.3). All traffic is **TLS-only**; cleartext is refused (ATS defaults).
- **Encoding:** `application/json; charset=utf-8` for every request and response body.
- **Time:** all timestamps are RFC 3339 / ISO 8601 UTC strings (e.g. `2026-06-10T14:32:01Z`),
  mirroring the server's `now_iso()`. Durations (rest) are integer seconds.
- **`week`:** the model's training-time axis is a float **week index** (decay/recovery are
  computed in weeks — ES-005.1 / ES-011). The client never computes `week`; it is server-set
  on composition and echoed back read-only.
- **Identifiers** are opaque strings with a typed prefix and MUST be treated as such by the
  client (never parsed): `ws_…` session, `eb_…` block, `set_…` set, `rec_…` recommendation,
  `obs_…` observation. The athlete id is the enrollment id.
- **Units:** loads in **kilograms** (the catalog and model are kg-native). Reps are integers.
- **Unknown fields:** clients MUST ignore response fields they do not recognize (forward
  compatibility, §11). Servers MUST reject request fields they do not recognize only when the
  field would change a learning input; otherwise ignore (be liberal in, strict on inputs).

---

## 2. Authentication

**Scheme:** one **bearer token per athlete**, provisioned at cohort enrollment and carried on
every request (Mobile Arch §8.2, Build Plan §4). This is the entire auth model for v1 — a
closed, operator-recruited cohort, one athlete per token, one phone per athlete.

```
Authorization: Bearer <athlete_token>
```

- **Provisioning is out-of-band.** The operator creates the `Athlete` (the
  `onboard(athlete_id, sex, age, experience)` server call, §8) and issues the token at
  enrollment. **There is no self-serve registration or login endpoint in this contract** —
  adding one would be a new feature and a new attack surface against a deliberately closed
  trial.
- **Storage:** the device stores the token in the **iOS Keychain**, never in `UserDefaults`
  or the bundle (Mobile Arch §13.3). It is attached to every request and never logged
  (release logs redact it, §11 of Mobile Arch).
- **Scope:** the token authorizes **exactly one athlete's own data**. The server MUST scope
  every read and write to the token's athlete and MUST reject any request whose path
  references another athlete's resource (see §13, security boundary). There is **no operator
  scope reachable from the athlete token**.
- **Token absent / malformed:** `401 unauthenticated`. **Token valid but resource belongs to
  another athlete:** `403 forbidden` (the server returns `403`, not `404`, only when the
  resource exists; for non-existent resources it returns `404` so existence is not leaked
  across athletes — see §13).
- **Rotation / revocation:** operator-side, out-of-band. A revoked token returns `401`; the
  device treats persistent `401` as "re-enroll" (a calm, terminal state), never as a retry
  loop (§10).

There is no refresh-token flow, no OAuth, no session cookie. At 100 athletes this is
sufficient and is the frozen decision.

---

## 3. Resource model

The wire resources mirror the frozen server entities (schema v11). Field names match the
server columns so the audit chain is traceable end to end.

### 3.1 `Session`
The composed, load-free-then-frozen plan for one workout.

| Field | Type | Notes |
|---|---|---|
| `id` | string `ws_…` | |
| `status` | enum | `planned` \| `active` \| `completed` \| `abandoned` (ES-001) |
| `week` | number | server-set training-week index |
| `session_index` | integer | position in the athlete's sequence (composition audit) |
| `started_at` / `completed_at` | string \| null | RFC 3339; set on lifecycle transitions |
| `model_version` / `capability_model_version` | string | stamped at composition (§11) |
| `blocks` | `Block[]` | ordered by `position` |

### 3.2 `Block` (ExerciseBlock)
One exercise within the session.

| Field | Type | Notes |
|---|---|---|
| `id` | string `eb_…` | |
| `position` | integer | render order |
| `capability` | enum | one of the five active Class-A capabilities |
| `exercise` | string | catalog code (ES-002) |
| `difficulty_factor` | number | catalog scalar; `1.0` for canonical |
| `recommended_weight` | number (kg) | **advisory** prescription (DX-18), server-derived from learned capability (`target_load`, DX-20), frozen for the session; the athlete owns load — accept, ignore, or override |
| `target_reps` | integer | |
| `target_sets` | integer | sole owner: ES-009.1 volume engine |
| `rest_seconds` | integer | render-only; no domain effect |
| `selection_reason` | enum | `canonical` \| `preference` \| `exploration` \| `second_slot` \| `replacement` (ES-009 §6) |
| `recommendation_id` | string `rec_…` | for the "why" view (§5) |
| `status` | enum | `planned` \| `active` \| `completed` \| `skipped` (ES-001) |

### 3.3 `Projection` (the read model the device caches)
Server-authoritative; overwritten wholesale on pull (Mobile Arch §6.3 tier 2).

| Field | Type | Notes |
|---|---|---|
| `athlete` | object | `id`, `sex`, `age`, `experience` (§9) |
| `capability_state` | array | per active capability: `capability`, `score` (0–100), `confidence` |
| `strategy_state` | object | `weekly_frequency`, `weekly_volume` (`low`\|`moderate`\|`high`), `primary_focus`, `secondary_focus` |
| `today` | `Session` \| null | the current/next composed session (the pre-compose cache fill) |
| `model_version` / `capability_model_version` | string | the versions this projection was derived under |

The device never persists immutable history (evidence, state-update log, audit) — that is
server-owned and fetched on demand only for the "why" view (Mobile Arch §7.2).

---

## 4. Endpoints (the frozen surface)

This is exactly the surface in Mobile Architecture §8.2 — no endpoint is added.

| Method · path | Section | Idempotency key |
|---|---|---|
| `GET  /sessions/today` | §6 workout retrieval | — (safe) |
| `POST /sessions` | §5 session lifecycle (start) | `client_request_id` |
| `POST /sessions/{id}/sets` | §7 set reporting | `client_event_id` |
| `POST /blocks/{id}/skip` | §5 lifecycle (skip) | `client_event_id` |
| `POST /blocks/{id}/replace` | §8 replacement flow | `client_event_id` |
| `POST /sessions/{id}/complete` | §5 lifecycle (complete / finish-early) | `client_event_id` |
| `GET  /sessions` | §10 history (list) | — (safe) |
| `GET  /sessions/{id}` | §10 history (read one) | — (safe) |
| `GET  /recommendations/{id}/why` | §12 explainability | — (safe) |
| `GET  /profile` · `PATCH /profile` | §9 profile | `client_request_id` (PATCH) |

`GET` endpoints are safe and naturally idempotent. All state-changing `POST`s carry an
idempotency key (§14). No other paths exist; the operator/validation instrumentation
(`/internal/*`) is **not reachable** from the athlete token (§13).

---

## 5. Session lifecycle

The ES-001 hierarchy is `WorkoutSession → ExerciseBlock → Set`. A session moves through a
fixed state machine; the server owns the authoritative status, the device mirrors it.

```
            compose (server)            start                 report sets / skip / replace
 (none) ───────────────────────► planned ──────► active ───────────────────────────────────┐
                                                    │                                        │
                                                    │ complete (all blocks completed/skipped)│
                                                    ▼                                        │
                                                completed ◄──────────────────────────────────┘
                                                    ▲
                          finish early (abandon) ───┘  ──► abandoned  (terminal, ES-001)
```

- **Compose / start — `POST /sessions`.** The server composes today's load-free session
  (ES-009/009.1), seeds each block's `recommended_weight` from current state at session entry
  (ES-006), persists the composition audit snapshot (template, seed, frequency, volume,
  calibration phase — ES-009 §9), opens it `active`, and returns the full `Session`.
  In normal operation the device does **not** call this live — it runs the pre-fetched
  `today` plan (§6, the pre-compose cache). `POST /sessions` exists for the cold/first case.
  - Request body: `{ "client_request_id": "<uuid>" }` (idempotency, §14). No athlete-supplied
    composition parameters — composition is server-owned and load-free; the client cannot
    influence it (that would be a model violation).
  - `201 Created` with the `Session`. Replays of the same `client_request_id` return the same
    session (`200`), never a second one.
- **Block status transitions** are driven implicitly by set reports (§7), skip (§5.1), and
  replace (§8); the client never `PATCH`es a block status directly.
- **Complete — `POST /sessions/{id}/complete`.** Closes the session. Per the ES-001 completion
  rule the server marks any block not already `completed`/`skipped` as `completed`, sets
  `status = completed`, increments the workout count, and **triggers the next-session
  pre-compose** server-side (so the device's `GET /sessions/today` will return a fresh plan).
  See §11 (finish-early variant).

### 5.1 Skip flow — `POST /blocks/{id}/skip`

The athlete declines an exercise (equipment busy, can't/won't do it). Skip is a **first-class,
welcomed path**, not a failure (Thesis v2; Mobile Arch §2).

- Request:
  ```json
  { "client_event_id": "<uuid>", "seq": 41, "reason": "equipment_busy" }
  ```
  `reason` is a free-form short string for audit; it is **not** a model input that changes a
  capability score (a skip produces no observation for that block).
- Effect: block `status → skipped` (ES-001). No `Observation`, no `Evidence`, no state write
  for the skipped block. The session can still complete with skipped blocks.
- `200 OK` → `{ "block": { "id": "...", "status": "skipped" }, "next": <NextAction> }` (§7.2).
- Idempotent on `client_event_id`: re-skipping an already-skipped block returns the same body,
  never double-counts.

---

## 6. Workout retrieval — `GET /sessions/today`

Returns the athlete's **current or next composed session** — the pre-compose cache fill that
makes offline start possible (Mobile Arch §8.5).

- `200 OK` with a `Session` (status `active` if one is in progress, else `planned` for the
  next pre-composed one).
- `200 OK` with `{ "today": null, "reason": "awaiting_compose" }` when the athlete has outrun
  the one-session cache (completed the cached session before reconnecting). The device renders
  the calm degraded state *"Sync to get your next workout"* — it does **not** fabricate a plan
  on-device (Mobile Arch §8.5). The next reconnect+complete cycle repopulates the cache.
- The returned plan is **complete and self-contained**: every block carries its
  `recommended_weight` (**advisory** — DX-18; the athlete owns the working load), `target_reps`,
  `target_sets`, `rest_seconds`, and `recommendation_id`, so the entire workout runs from cache
  with the radio off. The plan is **frozen for the session** — re-fetching mid-session returns
  the same prescription (§0.3).
- Caching: response carries an `ETag`; the device may send `If-None-Match` and accept
  `304 Not Modified` (the next plan rarely changes between syncs).

The catalog (exercise names, replacement groups) is mirrored on-device read-only and versioned
(ES-002); a `catalog_version` mismatch on any response forces a one-time catalog refresh (§11).

---

## 7. Set reporting — `POST /sessions/{id}/sets`

The core loop. The athlete reports **what they actually did — the weight lifted and the reps — and
submits.** The model learns from the `(actual_weight, actual_reps)` pair (M1/DX-01): the **effective
load is the logged `actual_weight`**, so an honest heavier-load-fewer-reps set is learned as the
capability it demonstrates, not down-weighted. `recommended_weight` is the advisory prescription.

### 7.1 Request

```json
{
  "client_event_id": "1f0c…",      // idempotency key (§14), client-generated UUID
  "seq": 42,                        // per-device monotonic order (§10, §14)
  "block_id": "eb_9a3…",
  "set_number": 3,
  "actual_reps": 9,
  "actual_weight": 82.5             // kg; REQUIRED learning input — the load actually lifted (M1/DX-01)
}
```

- **The `(actual_weight, actual_reps)` pair is the athlete-provided learning input.** The model's
  **effective load is the logged `actual_weight`**; the model learns capability from the reps achieved at
  the weight the athlete actually lifted (M1/DX-01 — `effective_load = obs.actual_weight`).
- **`actual_weight` is required and IS consumed by learning** (M1/DX-06, reversing the prior reps-only
  reading). The frozen `Set` entity still stores **both** weights (ES-001), and a deviation is still
  logged: if `actual_weight ≠ recommended_weight` the server records an **A9 LOAD override**
  (`override_category=LOAD`, `override_target=actual_weight`) — but the deviation is now **logged AND
  learned**, no longer logged-and-ignored. The prediction quality is evaluated at the actual load
  (M1/DX-02), so an honest deviation keeps full evidence weight. Omitting the field means the athlete
  used the prescribed weight (`actual_weight == recommended_weight`), the byte-for-byte-preserved default.
- **There is no effort / RIR / proximity-to-failure field, by design** (ES-011 / A5
  Anti-Requirement). A request carrying such a field is rejected `422` (the model boundary,
  §13) — the contract refuses the input rather than silently dropping it.
- `set_number` is 1-based and bounded by the block's `target_sets`.

### 7.2 Response — the set report returns the next action

The server runs the full transactional learning chain
(`Set → Observation → de-fatigue → Evidence → StateUpdate`) for the reported set and returns
what to do next. The prescription does **not** change mid-session (the ES-006 governor advances
once per capability *at block completion*, not per set — §0.3); `next` is pure flow control over
the already-frozen plan.

```json
{
  "observation_id": "obs_4c2…",
  "accepted_seq": 42,
  "next": {
    "kind": "next_set",                 // next_set | next_block | session_complete
    "block_id": "eb_9a3…",
    "set_number": 4,
    "recommended_weight": 82.5,        // advisory (DX-18); athlete owns load
    "target_reps": 8,
    "rest_seconds": 120
  },
  "model_version": "…",
  "capability_model_version": "…"
}
```

- `kind: "session_complete"` signals the device to present the Complete screen; the device
  still sends `POST /sessions/{id}/complete` to finalize (§5).
- The response is the server's **acknowledgement** of the event; on receipt the device marks
  the outbox event `acked` and advances `last_acked_seq` (Mobile Arch §8.3).
- `200 OK` (the observation is appended; idempotent replays return the same `observation_id`
  and `next`, never a second observation — §14).

---

## 8. Replacement flow — `POST /blocks/{id}/replace`

The athlete swaps the prescribed exercise for another (preference, equipment, or skip trigger).
This is the live **L2 `REPLACE_EXERCISE`** path (ES-006 / ES-009 §6), and it is **the richest
learning signal** the system gets (Thesis v2; ES-006 override metrics). Replacement is
**preference-driven, never performance-driven** (ES-006) and **capability-preserving** — the
substitute trains the same capability and satisfies the same class constraint (Principle #53).

### 8.1 Two replacement modes

1. **In-catalog replace** — pick a substitute from the current exercise's replacement group.
   The client may either let the server choose the most-preferred alternate, or name a specific
   catalog code it offered offline from the mirrored replacement group.
   ```json
   {
     "client_event_id": "<uuid>", "seq": 43,
     "from_exercise": "barbell_bench_press",
     "to_exercise": "dumbbell_bench_press",     // optional; omit to let the server pick
     "reason": "equipment_busy"
   }
   ```
2. **Off-catalog substitute** — the athlete did something Hush doesn't know. The free-text /
   identifier is preserved **verbatim and losslessly** (A9) and flagged server-side as an
   attribution gap; it is never silently dropped (Mobile Arch §7.2).
   ```json
   {
     "client_event_id": "<uuid>", "seq": 43,
     "from_exercise": "barbell_back_squat",
     "off_catalog_text": "hack squat machine",
     "reason": "preference"
   }
   ```

### 8.2 Server effect (frozen)

- Selects the substitute over the replacement group constrained to the **same capability and
  class** (`catalog.replace`, preference-ordered), emits a `REPLACE_EXERCISE` recommendation
  with full audit (`replaced_from_exercise`, `replace_reason`), and applies **one bounded
  preference nudge per event** (chosen family up, rejected family down) — only when the family
  actually changed (no double-nudge on re-selecting the same family).
- An off-catalog substitute records the override target (`override_category`,
  `override_target`) on the observation for A9 analysis; it produces no in-catalog
  recommendation (the substitute is outside the model's catalog).
- **The substitute trains the same capability** — the replace never changes which capability the
  block targets, only which exercise expresses it.

### 8.3 Response

```json
{
  "block": {
    "id": "eb_9a3…",
    "exercise": "dumbbell_bench_press",
    "difficulty_factor": 1.0,
    "recommended_weight": 30.0,
    "selection_reason": "replacement",
    "recommendation_id": "rec_77b…"
  },
  "from_exercise": "barbell_bench_press",
  "decision_type": "REPLACE_EXERCISE"
}
```

The device then reports sets against the new block exactly as in §7. `200 OK`; idempotent on
`client_event_id`.

---

## 9. Profile — `GET /profile` · `PATCH /profile`

The frozen `Athlete` entity is **deliberately minimal**: `sex`, `age`, `experience` (ES-001 /
ES-003 onboarding inputs). There is no rich profile, no settings beyond the essential
(Anti-Requirements).

- `GET /profile` → `200`:
  ```json
  { "id": "ath_…", "sex": "male", "age": 31, "experience": "intermediate",
    "bodyweight_kg": 82.5,
    "model_version": "…", "capability_model_version": "…" }
  ```
- `PATCH /profile` — correct an onboarding value. Body carries only the changed field(s) plus
  `client_request_id`. `200` with the updated profile.
- **Athlete creation is not in this contract.** The `Athlete` is created by the operator at
  enrollment (`onboard(...)`, §2); the app's onboarding screen collects the ES-003 fields and
  submits them through the enrollment flow, not a public endpoint.
- **Bodyweight (`bodyweight_kg`) — DX-07.** As of DX-07 the nullable `bodyweight_kg` field is
  **captured at onboarding and persisted on the `Athlete` entity** (collected by `onboard(...)`,
  §2; correctable via `PATCH /profile`). It remains **inert and is NOT a learning input** in
  this change — it is **never** routed into an observation — until a future reviewed model
  change (Option D / DX-08) consumes it for capability seeding. Existing athletes read `NULL`.

---

## 10. History — `GET /sessions` · `GET /sessions/{id}`

A **thin, read-only** view of the athlete's own past sessions. This is raw-history read, not
analytics: **no charts, no trends, no streaks, no feed** (Founder ch.8 Anti-Requirements — the
product is measured by trust earned, not engagement). The athlete may look back at what they
did; the app renders nothing derived or motivational on top.

- `GET /sessions?status=completed&limit=20&before=<cursor>` → `200`:
  ```json
  { "sessions": [ { "id": "ws_…", "status": "completed", "week": 12.0,
                    "completed_at": "…", "block_count": 4 } ],
    "next_cursor": "…" }
  ```
  Cursor-paginated, newest first. `status` filter optional. Bounded `limit` (server caps it).
- `GET /sessions/{id}` → `200` with the full `Session` (blocks + the sets reported against
  them, read-only).
- **History is server-authoritative and pulled on demand** — the device does not replicate it
  locally (Mobile Arch §7.2). Scoped strictly to the token's athlete (§13).
- The deep audit chain (evidence → state-update log → "what it could not exclude") is **not**
  exposed to the athlete app here; the only athlete-facing slice of it is the per-recommendation
  "why" view (§12). Full reconstruction lives behind the operator `/internal/audit` surface,
  which the athlete token cannot reach (§13).

---

## 11. Versioning

At ~100 athletes the frozen decision is **no API version-negotiation scheme** (Build Plan §4).
Compatibility is handled by three rules instead:

1. **Model provenance is stamped on every learning artifact.** Every recommendation,
   observation, session, and projection carries `model_version` and `capability_model_version`
   (stamped server-side on every history row from day one — Build Plan §3). The app records the
   versions it rendered against, so any recommendation is reconstructable to the exact model
   that produced it. The client treats these as **opaque provenance**, not as a feature gate.
2. **Additive, fail-closed evolution.** The server may add response fields; clients **ignore
   unknown fields** (§1). Clients must **fail closed into a calm degraded state, never crash**,
   on a response they cannot fully parse (Mobile Arch §13.4). The server never repurposes the
   meaning of an existing field (the same additive-only discipline as the DB migrations
   001–006).
3. **Catalog version is a hard gate.** Every response that carries catalog-derived data
   includes `catalog_version` (ES-002). On a mismatch with the device's mirrored catalog, the
   device performs a **one-time catalog + projection refresh** before composing/offering any
   replacement offline. A catalog bump is the one event that forces a projection refresh on next
   sync.

There is no `/v1/` path prefix and no `Accept-Version` header in this contract. The filename
`API_CONTRACT_V1` denotes the **frozen-model** generation, not a negotiated wire version.

---

## 12. Explainability — `GET /recommendations/{id}/why`

Backs the optional "why this weight?" view (ES-006 explainability). Returns the human-readable
rationale for one recommendation, fetched on demand (not cached as history).

- `200`:
  ```json
  {
    "recommendation_id": "rec_77b…",
    "capability": "horizontal_push",
    "exercise": "barbell_bench_press",
    "recommended_weight": 82.5,
    "target_reps": 8,
    "predicted_reps_to_failure": 11.09,
    "prediction_confidence": "medium",        // low | medium | high (ES-005.1 three-level)
    "decision_type": "KEEP_LOAD",             // KEEP_LOAD | INCREASE_LOAD | DECREASE_LOAD | REPLACE_EXERCISE
    "decision_reason": "stability_guard_not_met",
    "what_it_could_not_exclude": "…"          // the honesty clause (ES-013 / Execution Context §1)
  }
  ```
- The `what_it_could_not_exclude` field is required by the project's honesty contract — every
  conclusion carries what it could not rule out (Execution Context §1). It is rendered calmly,
  never as a warning.
- Scoped to the token's athlete; `404` if the recommendation id is not theirs (§13).

---

## 13. Idempotency

Every state-changing `POST` is **exactly-once from the athlete's perspective**, built on
at-least-once delivery + server-side dedup (Mobile Arch §8.3).

- **Key.** Each event carries a **client-generated UUID**: `client_event_id` for the
  per-set/skip/replace/complete events, `client_request_id` for `POST /sessions` and
  `PATCH /profile`. The key is generated **before** the local outbox commit, so it survives
  crash/retry unchanged (durable-before-confirm, Mobile Arch §8.3 step 1).
- **Server contract.** The server **dedups on the key**. The first time it sees a key it
  applies the event inside the transactional pipeline and records `(key → result)`. Any later
  request with the same key **returns the original result without re-applying** — a retried
  `set_report` must **never learn twice** (the cardinal idempotency requirement; double-applying
  would corrupt the capability state the whole trial measures).
- **Scope.** Keys are unique per athlete; the server scopes dedup to the token's athlete.
- **Response parity.** A deduped replay returns a response **semantically identical** to the
  original (same `observation_id`, same `next`), so the client cannot tell a fresh apply from a
  replay — which is exactly what lets the sync engine retry blindly.
- **Ordering interacts with idempotency.** Events also carry a per-device monotonic `seq`
  (§14); the server applies a given athlete's events **in `seq` order**, so a `set_report`
  cannot be applied before the `session_start` it belongs to. Idempotency makes a retry safe;
  ordering makes the stateful pipeline correct. There is exactly one author per athlete stream
  (the device), so no vector clocks are needed (Mobile Arch §8.3–§8.4).

---

## 14. Retries

The device guarantees **at-least-once, ordered** delivery; the server makes it
**effectively-once** (§13). The retry policy is part of the contract because the trial's data
integrity depends on it.

- **Drain discipline.** A background sync `actor` drains the outbox **in `seq` order, one
  in-flight batch at a time** (Mobile Arch §8.3). It never reorders, never skips a gap.
- **What is retried:** any **transient** failure — network error, timeout, `429`, or `5xx`.
  Retries use **exponential backoff with jitter**. The device keeps the event `pending`/`failed`
  and re-sends with the **same idempotency key**.
- **What is not retried:** a **permanent** `4xx` that is not a dedup (`400`, `422`, `403`). The
  event is marked `failed` and surfaced to **operator telemetry** — with a correct client this
  is ~zero; non-zero means a client/server contract bug the trial wants to catch early (Mobile
  Arch §8.3 step 4, §10.2). A persistent `401` is terminal "re-enroll", not a retry loop (§2).
- **Server-side retry safety.** Because every state-changing call is idempotent (§13), the
  server tolerates duplicate deliveries with no special handling; it simply returns the recorded
  result. The server SHOULD honor `Retry-After` on `429`/`503`; the client MUST respect it when
  present.
- **`GET`s** are safe and freely retriable; the device may also serve them from the local
  projection cache and revalidate with `ETag`/`If-None-Match` (§6).
- **Connectivity triggers.** The drain wakes on "became reachable" (`NWPathMonitor`), on app
  foreground, after each local append (best-effort immediate push), and on a background refresh
  task (Mobile Arch §8.6) — never a blocking spinner over the workout (calm > status).

---

## 15. Errors

### 15.1 Envelope

Every non-2xx response uses one shape:

```json
{
  "error": {
    "code": "validation_failed",        // stable machine string (see taxonomy)
    "message": "actual_reps must be a non-negative integer",
    "request_id": "req_…",              // server trace id, safe to surface to operators
    "field": "actual_reps"              // optional, for validation errors
  }
}
```

The `code` is the stable contract; `message` is human-readable and may change. Clients branch
on `code` (and HTTP status), never on `message`.

### 15.2 Status codes and taxonomy

| HTTP | `code` | Meaning | Client action |
|---|---|---|---|
| `200` / `201` | — | success / created | proceed; mark event `acked` |
| `304` | — | not modified (ETag) | use cached projection/session |
| `400` | `bad_request` | malformed JSON / missing required field | **permanent**: mark `failed`, telemetry; do not retry |
| `401` | `unauthenticated` | token absent/invalid/revoked | terminal "re-enroll"; stop retrying |
| `403` | `forbidden` | token valid but resource is another athlete's | **permanent**: contract bug; telemetry |
| `404` | `not_found` | resource does not exist (or is hidden cross-athlete, §16) | **permanent**: telemetry |
| `409` | `conflict` | lifecycle violation (e.g. set reported on a `completed` session; out-of-order `seq` gap the server won't buffer) | resync projection, then reconcile from server truth |
| `422` | `unprocessable` | well-formed but rejects a **model-boundary** input (e.g. an effort/RIR field, an inactive capability, an off-catalog code where a catalog code was required) | **permanent**: telemetry; never strip-and-resend |
| `429` | `rate_limited` | too many requests | **transient**: honor `Retry-After`, backoff |
| `500` / `503` | `server_error` / `unavailable` | server fault | **transient**: backoff + jitter, same key |

- **A deduped replay is a success, not a `409`.** Re-sending an already-applied
  `client_event_id` returns `200` with the original result (§13), so the sync engine's blind
  retries never produce spurious conflicts.
- **`409` is reserved for genuine lifecycle/order violations**, which with a correct client
  should not occur; when it does, the device pulls the authoritative projection and reconciles
  rather than guessing (the server is the single source of truth, §0.1).
- The athlete **never sees a raw error**. Transient failures are invisible ("saved on device,
  will sync"); permanent failures are silent to the athlete and loud to operator telemetry
  (Mobile Arch §14, "calm is correctness").

---

## 16. Security boundary

The boundaries this contract enforces, each traceable to a frozen rule. Threat model =
**lost/stolen device + a small trusted cohort**, not a public adversarial userbase (Mobile Arch
§14).

**A. Authorization boundary — one athlete, own data only.**
- The athlete token authorizes **exactly the token's own athlete**. Every endpoint is scoped to
  that athlete server-side; a path that references another athlete's `ws_…`/`eb_…`/`rec_…` is
  refused.
- **Existence is not leaked across athletes:** for a resource that belongs to another athlete
  the server returns `404 not_found` (not `403`), so one athlete cannot probe another's id space.
  `403` is used only where the resource is provably the caller's-context but the action is
  disallowed.
- **No operator surface is reachable from the athlete token.** The validation/operator
  instrumentation (`/internal/audit`, shadow-baseline A8, override-log A9, fresh-state A1,
  parameter sweeps) is a **separate, operator-scoped surface**; the athlete app has **no
  endpoint into it** (Mobile Arch §8.2, §10).

**B. Single-writer boundary — the client cannot mutate derived truth.**
- The device **never writes capability state, scores, confidence, fatigue, or decisions**. It
  submits **events**; the server's State Update engine is the only writer (ES-007). There is no
  endpoint that accepts a computed score or a chosen load — the contract has no shape for the
  client to claim it learned anything (Mobile Arch §3.4, §4.6).
- The projection (§3.3) is a **read cache**: server-authoritative, overwritten on pull, never
  pushed back.

**C. Model-input boundary — only sanctioned learning inputs are accepted.**
- The learning inputs are: the per-set `(actual_weight, actual_reps)` pair, skip events, and replace
  targets (in- and off-catalog, A9). Full stop. The model's effective load is the logged `actual_weight`
  (M1/DX-01); `recommended_weight` is the advisory prescription, derived from learned capability (DX-20).
- **`actual_weight` is a required learning input** (M1/DX-06) — still captured under ES-001 store-both and
  still A9-logged on a deviation, but now **consumed by learning** (reverses the prior reps-only reading in
  `reviews/implementation/F1_CLARIFICATION_REPORT.md`). Bodyweight remains profile metadata, inert to learning.
- **Effort / RIR / proximity-to-failure is refused at the contract level** (`422`), not
  silently dropped — it is a frozen Anti-Requirement (ES-011 / A5).
- **No HealthKit metric is ever a learning input.** HRV, heart rate, sleep, active energy MUST
  NOT appear in any request body that reaches the pipeline. Bodyweight is **profile metadata
  only**, out of the loop in v1 (§9; Mobile Arch §9.1). There is no code path from a health
  sample into an observation, and the contract provides no field for one.
- **Inactive capabilities are refused.** A request naming `vertical_pull` or `core_stability`
  (frozen inactive) is rejected `422` (§0).

**D. Transport & data-at-rest boundary.**
- **TLS-only** (ATS defaults); cleartext refused. Token in the **Keychain**, attached per
  request, never logged (release logs redact training/health values, Mobile Arch §11).
- The device DB is **encrypted at rest** via iOS Data Protection (`NSFileProtectionComplete`),
  keyed to the device passcode — the at-rest defense for the lost/stolen-device threat (Mobile
  Arch §7.4). The server is the backup of record; no third-party tracking/analytics SDK touches
  this data ("Data Not Used to Track You", Mobile Arch §10).

**E. Audit boundary — every athlete-facing output is reconstructable.**
- Every recommendation rendered and every override captured must be **reconstructable
  server-side** (shadow baseline A8, override log A9, immutable audit chain) or the trial is
  untestable (Build Plan §10; Mobile Arch §4.8). The contract's stamping (§11) and lossless
  override capture (§8) exist to keep that guarantee — they are a security/integrity boundary
  on the *science*, not just a feature.

---

## 17. Traceability

| Contract section | Frozen source |
|---|---|
| §2 Authentication (per-athlete bearer token, Keychain) | Build Plan §4; Mobile Arch §8.2, §13.3 |
| §3 Resource model (Session/Block/Projection fields) | ES-001; **schema v11** (`workout_session`/`exercise_block`/`set_record`/`capability_state` + decision memory, `session_progress`, `stagnation_marker`, + web-shell `idempotency_key`/`auth_token`, `erasure_record`); `recommended_weight` **advisory** (DX-18) |
| §5 Session lifecycle (planned/active/completed/abandoned) | ES-001; `service.complete_session` / `repositories.abandon_session` |
| §6 Workout retrieval + pre-compose cache | ES-009 (load-free, Inv. 3); Mobile Arch §8.5; `recommended_weight` advisory — ES-006 governor advisory (DX-03 / DX-20) |
| §7 Set reporting (logged weight+reps = learning input) | ES-001 store-both; **M1/DX-01/02** (`effective_load = actual_weight`); ES-010 (deviation = input, not override); ES-011 / A5 (no RIR) |
| §8 Replacement (L2, preference-driven, capability-preserving, A9) | ES-006; ES-009 §6; ES-010 / A9; `service.replace_exercise` (sticky preference = DX-10, pending) |
| §9 Profile (minimal Athlete; `bodyweight_kg` collected) | ES-001/003; **DX-07** (migration_007); Assumptions Register; Mobile Arch §9.2 |
| §10 History (raw read, no analytics) | Founder ch.8 Anti-Requirements; Mobile Arch §7.2, §10 |
| §11 Versioning (stamps, additive, catalog gate) | Build Plan §3/§4; ES-002; Mobile Arch §13.4 |
| §12 Explainability + honesty clause | ES-006; Execution Context §1 |
| §13 Idempotency (`client_event_id` dedup, exactly-once) | Mobile Arch §8.3 |
| §14 Retries (ordered, backoff, transient vs permanent) | Mobile Arch §8.3, §8.6, §10.2 |
| §15 Errors (envelope, taxonomy, calm-to-athlete) | Mobile Arch §14 |
| §16 Security boundary (auth / single-writer / model-input / transport / audit) | ES-007; ES-011/A5; System Architecture; Mobile Arch §3.4, §9.1, §13–§14 |

---

*This contract specifies the frozen v1 API surface only. The model is authoritative as in
`HUSH_V1_EXECUTION_CONTEXT.md`; the app architecture that consumes this surface is
`MOBILE_ARCHITECTURE_V1.md`. Any change to an endpoint's shape, to the set of accepted learning
inputs, or to the security boundary is a model-review act, not a silent edit (governing rule:
no redesign without explicit model review).*
