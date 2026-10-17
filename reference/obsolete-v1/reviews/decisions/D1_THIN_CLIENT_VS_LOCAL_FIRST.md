# Decision Review — D1: Thin Client vs. Local-First Event-Sourced

> Focused decision-review document for the mobile architecture's one open question: how the iOS app
> relates to the single Hush service. It compares the two candidate architectures, evaluates them
> against real gym conditions and against engineering cost, and states what remains
> server-authoritative in each. **This is a review document only: nothing is adopted here. No code is
> written, the frozen model is untouched, and no canonical document is modified.** The frozen Build
> Plan §9 (thin client) remains the canonical decision of record until a separate, explicit approval
> changes it. Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-10 · Model: Hush v1 (frozen) · Server build: Sprint 0–4 ✅ (125 tests, schema v6) ·
> Scope: Sprint 5 mobile app (iOS, SwiftUI, ~100-athlete Phase 1 cohort) ·
> Sources: Build Plan §4/§5/§9/§11 · System Architecture · `docs/architecture/MOBILE_ARCHITECTURE_V1.md` (proposes D1) · ES-001/006/007/009/011.

> **STATUS — PROPOSED, NOT ADOPTED.** Decision D1 (adopt Local-First Event-Sourced as a revision to
> Build Plan §9) is **recommended** by this review but **not adopted**. The canonical decision of
> record remains the Build Plan §9 thin client until sign-off. This document presents the evidence and
> a defensible recommendation; the adoption act — editing Build Plan §9 and committing to the build —
> is separate and explicitly approved elsewhere.

---

## 0. Executive summary (read this first)

**The decision is narrower than it looks, and that reframing is the most important point in this
document.** D1 is **not** "where does the model run." In **both** options the entire frozen learning
loop — composition, prediction, evidence, state update, recommendation, fatigue, the audit chain, and
all validation instrumentation — is **100% server-authoritative** (§3). The model never runs on the
device in either option. D1 is only about **where the athlete's input is durably buffered, and when
the network is required for the athlete to keep training.**

So the real question is: *should a workout depend on connectivity?*

- **Option A — Thin Client (Build Plan §9):** the app renders server responses and posts each set as
  it happens; the network is on the critical path of the workout. Simplest possible app; zero client
  data layer; zero divergence risk. **But the athlete's session is only as reliable as the gym's
  signal**, and a dropped request between sets is a blocked or lost rep.
- **Option B — Local-First Event-Sourced (proposed in MOBILE_ARCHITECTURE_V1):** the app holds a
  pre-composed session plan and an append-only local outbox; the workout runs entirely offline and
  syncs opportunistically. **Connectivity leaves the critical path**, at the cost of a real client
  data layer (SQLite + outbox + sync engine + migrations) and the testing/maintenance that implies.

**Recommendation (not adopted): Option B**, on the strength of one argument that the others don't
overcome — **a gym is a hostile network environment, a workout is a 45–60-minute interaction the
athlete cannot pause, and the product thesis is "calm and frictionless."** A thin client puts a
network round-trip between "I did 9 reps" and "what's next," in exactly the places (basement racks,
steel-and-concrete rooms, locked phones between sets) where the network is least reliable. For a
product whose entire validatable claim is *trustworthy, frictionless default*, a workout that stalls
or loses a set because of signal is a thesis-level failure, not a UX nit. Option B removes that
failure mode for a bounded, well-understood engineering cost that the §3 reframing makes much smaller
than "local-first" usually implies (no second model, no merge/CRDT problem).

**This recommendation is conditional** and the honest case for Option A is real (§6, §7): at ~100
users it is materially less to build, test, and operate, and it carries zero risk of client/server
divergence. If the cohort trains exclusively in well-connected facilities, A is sufficient and
cheaper. The recommendation for B rests on the bet that gym connectivity is unreliable enough, often
enough, that buffering is worth its cost — a bet that should be **sanity-checked against the actual
recruited facilities** before adoption (§8).

---

## 1. The two options, precisely

### Option A — Thin Client (the frozen Build Plan §9 decision)

> "Build it as a thin client — all logic server-side, the app just renders recommendations and posts
> sets. No offline mode, no local model, no client-side state beyond the current session."

- App holds **only the current session in memory**; no database.
- `POST /sessions` to start (server composes); `POST /sessions/{id}/sets` per set, **response carries
  the next action**; skip/replace/complete are live calls.
- If a call fails, the app retries or surfaces an error; there is no durable local record of an
  un-posted set beyond in-memory retry.
- Smallest possible client. The audit/parity story is trivial: there is exactly one place anything is
  recorded.

### Option B — Local-First Event-Sourced (proposed in MOBILE_ARCHITECTURE_V1.md)

- App holds a **pre-composed session plan** (cached on the prior sync) and an **append-only outbox**
  of athlete events (`set_report`, `skip`, `replace`, `complete`) in SQLite.
- Every action **commits locally before the UI confirms**; the workout runs fully offline.
- A background sync engine drains the outbox in order, **idempotently** (client-generated UUID per
  event; server dedups), then pulls the server's updated **projection** + the next pre-composed
  session.
- The device is the source of truth for the **event log**; the server is the source of truth for the
  **derived state** and the **audit chain**.

### Option C — "Resilient Thin Client" (middle ground, noted for completeness)

A thin client that keeps a **small durable outbox for set reports only** (so a reported rep is never
lost), but **still requires the network to start a session** (no pre-composed plan cache) and holds no
state projection. This buys most of the *durability* benefit at part of the cost, but **does not make
a workout runnable offline** (session start still blocks on signal) — which is the dominant gym
failure mode. It is a real option if the concern is only "don't lose a rep," not "let me train with no
signal." Evaluated inline below; not separately recommended.

---

## 2. What is identical in both (so it is off the table)

To keep the comparison honest, these are the same in A and B and should not be argued as
differentiators:

- The **frozen model** and all seven engines — unchanged, server-side.
- **Single writer** to capability state (the server's State Update engine).
- **Transactional audit chain** and immutable history — server-side.
- All **validation instrumentation** (shadow baseline A8, override log A9, fresh-state A1,
  costly-case tags A3) — server-side, live from session one.
- The **frozen UX** — the same six screens render in both.
- The **frozen API surface** (Build Plan §4) — both consume the same endpoints; B adds an idempotency
  key and a `GET /sessions/today` pre-fetch, neither of which changes the pipeline.

**Implication:** D1 cannot affect model correctness, auditability, or the science. It is purely a
client-resilience-vs-simplicity trade. That bounds the blast radius of getting it wrong.

---

## 3. What remains server-authoritative in each (explicit)

The user asked for this to be stated plainly. It is nearly the same list in both — which is the point.

| Concern | Option A (Thin Client) | Option B (Local-First Event-Sourced) |
|---|---|---|
| Session **composition** (ES-009/009.1) | **Server** | **Server** (cached client-side as read-only plan) |
| **Recommendation** / loads / decision governor (ES-006) | **Server** | **Server** (rendered from the cached plan) |
| **Learning**: evidence → state update (ES-007/010) | **Server** | **Server** (replayed from the device's event log) |
| **Fatigue & recovery** (ES-011) | **Server** | **Server** |
| **Capability state** (the projection) | **Server** (sole copy) | **Server is authoritative**; device holds a disposable read cache |
| **Audit chain** / immutable history | **Server** | **Server** |
| **Validation instrumentation** | **Server** | **Server** |
| **Catalog** (ES-002) | **Server** (code-resident) | **Server**; device holds a read-only mirror for offline skip/replace |
| **What the athlete actually did** (the observation/event) | **Server** (no durable client copy) | **Device is authoritative until acked**, then server |
| **Session-in-progress state** (which set, rest timer) | Client memory only (lost on kill) | **Client** (durable) |

The **only** authority that moves from server to device in B is **the athlete's own event log while
offline** (and the trivially-local rest timer / current-set pointer). Everything the *model* touches
stays on the server in both. B does not create a second writer of model state; it creates a durable
local buffer of inputs that the single server writer consumes on its own schedule.

---

## 4. Reliability under real gym conditions

This is the axis on which the options most diverge, and it is the one that matters most for a product
sold as "calm." Three conditions, each common in real gyms.

### 4.1 Poor or absent connectivity (basement gyms, steel/concrete rooms, dead zones)

- **Option A:** the network is on the **critical path of every set**. `POST /sets` returns the next
  action; if it times out, the athlete is **blocked between sets** (no next prescription) or the app
  must degrade to a local guess it isn't allowed to make (no client model). Repeated retries mid-set
  are exactly the friction the thesis forbids. Starting a session with no signal is **impossible** (no
  `POST /sessions`). **This is a frequent, not edge, condition** — commercial gyms routinely have poor
  cellular in the rack area.
- **Option B:** the session was pre-composed and cached on the last sync; the whole workout renders
  and records **with the radio off**. Sets queue locally and sync later. **Connectivity is irrelevant
  during the workout.** The only degraded state is the conservative, honest "sync to get your *next*
  workout" if the athlete outruns the one-session cache — and even that is a between-sessions message,
  never a mid-set stall.
- **Option C:** set reports survive, but **starting** still needs signal — so the worst case (athlete
  arrives at a dead-zone gym and can't begin) is unsolved.
- **Verdict:** **B clearly best.** A's failure here is direct, frequent, and thesis-level.

### 4.2 Backgrounding (phone locked between sets; music/timer apps; a glance at a text)

- **Option A:** session state lives in server + app memory. iOS may evict the backgrounded app's
  memory; on return the app must **re-fetch** session state from the server — which **needs the
  network again**, compounding 4.1. Any in-flight `POST` interrupted by backgrounding is in an unknown
  state (did the set record?) without an idempotency/dedup contract.
- **Option B:** session state is **durable in SQLite**; returning from background (or relaunch)
  restores the exact set/rest position from disk, **no network needed**. In-flight pushes are
  idempotent, so an interrupted post is safe to retry.
- **Verdict:** **B clearly best.** Backgrounding between sets is the *normal* behavior of a person in a
  gym, not an edge case.

### 4.3 App termination / crash (iOS reclaims the app; a crash mid-workout)

- **Option A:** any set not yet successfully POSTed is **lost** (no durable local copy); session
  resumability depends entirely on what the server already received, which may be mid-sequence. The
  athlete may have to restart or lose work — corrosive to trust.
- **Option B:** the outbox is **append-only and durable before the UI confirms**, so a reported set
  survives termination by construction; on relaunch the app resumes from disk and the outbox drains
  when possible. **No athlete input is ever lost.**
- **Verdict:** **B clearly best**, and this is the single strongest reliability argument: in B, losing
  an athlete's reported work is *structurally impossible*; in A it depends on a network call having
  already succeeded.

**Reliability summary:** across all three real conditions, B is materially more robust, and the
conditions are **common, not exceptional** — they describe an ordinary phone in an ordinary gym. A's
reliability is a direct function of facility connectivity, which the program does not control.

---

## 5. Complexity, operational risk, testing burden, maintainability

This is the axis on which A wins, and the case is genuine.

### 5.1 Build / code complexity

- **Option A:** no client database, no sync engine, no migrations, no outbox, no idempotency, no
  conflict reasoning. The app is screens + an API client + view models. **Smallest possible surface.**
- **Option B:** adds `HushDatabase` (schema + migrations), `HushSync` (ordered idempotent drain,
  backoff, pre-compose cache, connectivity), and the outbox/projection discipline. This is **the bulk
  of the app's engineering weight** and where its bugs will live. Mitigated — not eliminated — by the
  §3 reframing: there is **no model port, no CRDT, no multi-writer merge** (single author per athlete
  stream + single server writer), which removes the genuinely hard part of "local-first." What remains
  is a well-trodden outbox pattern, but it is still real work.
- **Verdict:** **A simpler**, by a meaningful margin.

### 5.2 Operational risk

- **Option A:** one source of truth, one place to look when something is wrong. The risk it carries is
  **field reliability** (§4) — which is operationally visible as confused/abandoned sessions and
  support load, and is harder to diagnose remotely than a server bug. Also a **subtle correctness
  risk**: without an idempotency contract, a client retry of a `POST /sets` after an ambiguous timeout
  could **double-apply an observation** (learn twice) — so even A arguably needs the dedup contract B
  makes explicit.
- **Option B:** more moving parts (a client DB that can get into bad states; a sync engine that can
  stall). But its failure modes are **local and recoverable**: the tier-2 projection is disposable and
  re-pullable; the tier-3 outbox is the only sacred artifact and is append-only. The idempotent server
  contract is explicit, which *removes* the double-apply risk A leaves implicit.
- **Verdict:** **mixed.** A has fewer parts but pushes risk into the least-observable place (the field)
  and leaves the double-apply hazard implicit. B has more parts but more *recoverable, observable*
  failure modes. Net: **slight edge to B on correctness risk, edge to A on fewer-things-to-break.**

### 5.3 Testing burden

- **Option A:** per Build Plan §9, the app is "mostly untestable in isolation usefully"; rely on the
  **API end-to-end tests** for logic and manual QA for UX. Low client-side test burden.
- **Option B:** adds a real test matrix — sync engine (offline→online, idempotent retry, ordering),
  DB migrations (**outbox must survive upgrades**), the Health→outbox boundary guard. This is **the
  largest single addition to the testing burden.** It is, however, *tractable and high-value* testing
  (deterministic, fakeable, no UI needed), not flaky UI testing.
- **Verdict:** **A lighter.** B's added tests are worth their cost only if B is built at all.

### 5.4 Long-term maintainability

- **Option A:** less to maintain, but **brittle to one external factor** (connectivity) it can't fix
  in code; if field reliability proves bad, the fix *is* migrating toward B later — a larger change
  mid-trial than building it up front.
- **Option B:** more to maintain (a client DB schema that evolves with migrations), but the
  architecture **scales cleanly** to anything later wanted (multi-device, richer offline, eventually
  the gated on-device-parity option) without re-platforming. The outbox/event-sourced shape is a
  durable foundation.
- **Verdict:** **mixed / slight edge B** *if* offline matters at all — because retrofitting durability
  into a thin client mid-trial is worse than starting with it. If offline never matters, A is less to
  carry forever.

---

## 6. Where Option A is genuinely the right call

Stated plainly so the recommendation isn't mistaken for a foregone conclusion:

- **If the recruited cohort trains in well-connected facilities**, §4's failures are rare and A's
  simplicity wins outright. The Build Plan chose A deliberately as "the single biggest scope saving,"
  and at 100 users that judgment is defensible.
- A is **faster to ship**, which matters because the app gates the start of the Phase 1 validation
  clock; a simpler app reaches the **A7 week-1 seed-safety gate** sooner.
- A has **zero divergence risk** — there is literally one copy of everything; nothing to reconcile.
- A's weaknesses (double-apply, lost reps) can be **partially** addressed by adopting just the
  idempotency contract and a set-report outbox (**Option C**) without the full offline-session
  machinery — a smaller step than B.

The honest tension: A optimizes **engineering cost**; B optimizes **field reliability and thesis
fidelity**. The Build Plan weighted the former. This review weights the latter, because the cost of a
stalled/lost workout is paid in *trust* — the one currency the entire program exists to measure.

---

## 7. Comparison at a glance

| Axis | Option A — Thin Client | Option B — Local-First Event-Sourced |
|---|---|---|
| Model / audit authority | Server (sole) | Server (sole) — **identical** |
| Workout runs offline | ✗ no | ✅ yes (pre-composed + outbox) |
| Set reported in a dead zone | ✗ blocked / lost | ✅ durable locally, syncs later |
| Survives backgrounding mid-set | ⚠ needs re-fetch (network) | ✅ restored from disk |
| Survives termination/crash | ✗ un-posted reps lost | ✅ outbox durable before confirm |
| Mid-set latency ("calm") | ⚠ network round-trip | ✅ local, sub-frame |
| Double-apply on retry | ⚠ risk unless dedup added | ✅ idempotent by design |
| Client code complexity | ✅ minimal | ⚠ DB + sync engine |
| Testing burden | ✅ low (API e2e + manual) | ⚠ sync/migration/boundary tests |
| Operational parts to break | ✅ fewest | ⚠ more, but recoverable/observable |
| Time-to-ship (to A7 gate) | ✅ faster | ⚠ slower |
| Divergence risk | ✅ none | ✅ none (single author + single writer) |
| Maintainability if offline matters | ⚠ brittle; retrofit is costly | ✅ scales cleanly |
| Maintainability if offline never matters | ✅ least to carry | ⚠ unneeded weight |

Legend: ✅ favorable · ⚠ caution / conditional · ✗ unfavorable.

---

## 8. Recommendation (proposed, not adopted)

**Recommend Option B (Local-First Event-Sourced), conditional on a connectivity sanity check of the
recruited facilities.** The deciding argument is that real gyms are unreliable networks, a workout is
an unpausable 45–60-minute interaction, and the product's only validatable claim is *calm,
trustworthy default* — so a session that stalls or loses a reported set on bad signal is a
thesis-level failure, not a polish gap. B removes that failure mode structurally. Crucially, the §3
reframing shrinks B's usual cost: **no second model, no CRDT, no merge** — the model and audit stay
entirely server-authoritative; B adds only a durable input buffer + a render cache. That is a
favorable cost/benefit for the resilience gained.

**The recommendation is explicitly conditional.** Before adoption, confirm the premise with one cheap
check (§9): if the recruited cohort will train in well-connected facilities, Option A's simplicity is
the better trade and B is over-engineering for a problem the cohort won't hit. If facility
connectivity is mixed or poor (the likely real-world case), adopt B.

**If a smaller step is preferred,** Option C (idempotent set-report outbox, but online session start)
is a defensible compromise that fixes lost-reps and double-apply without the offline-session
machinery — but it leaves the dominant failure (can't start in a dead zone) unsolved, so it is a
half-measure, not the recommendation.

**Nothing is adopted by this document.** Build Plan §9 (thin client) remains the canonical decision of
record. Adoption of B (or C) is a separate, explicitly approved act that edits Build Plan §9 and
commits the Sprint 5 build; it should be taken only after the §9 sanity check.

---

## 9. The cheap check that should precede adoption

One question resolves most of the uncertainty: **how well-connected are the gyms the Phase 1 cohort
will actually train in?**

- Recruitment is for **cohort diversity** (A7), which likely means varied facilities — leaning toward
  B.
- A lightweight way to measure without committing: ship **Option A first** with the **idempotency
  contract and lightweight connectivity/latency telemetry** (sync success rate, request latency at
  set-report time, timeouts per session) from session one. If the telemetry shows frequent poor
  connectivity, the case for B is evidenced rather than assumed, and the migration A→(C→)B is a
  planned increment on an outbox the idempotency work already motivates.
- This turns D1 from a guess into a **measured decision**, and is itself a defensible adoption path:
  *adopt A now with idempotency + telemetry; let week-1 field data decide B.* This sequencing also
  protects the A7 gate timeline (A ships fastest) while keeping B's door open at low retrofit cost.

---

## 10. Decision status and next step

- **Status:** PROPOSED. Recommendation = **Option B, conditional** (or the measured A→B path in §9).
  **Not adopted.** Build Plan §9 unchanged; frozen model and all canonical docs untouched; no code
  written.
- **Blocking input needed:** the §9 facility-connectivity check (or a decision to gather it via the
  measured A-first path).
- **Adoption act (separate, when approved):** edit Build Plan §9 to record the chosen option and its
  rationale; update `docs/architecture/MOBILE_ARCHITECTURE_V1.md`'s D1 from "proposed" to "adopted
  (option X)"; then build. Until then, this review stands as evidence and recommendation only.

---

*Decision review only. No model change, no canonical-document change, no implementation. The frozen
model is authoritative as in `HUSH_V1_EXECUTION_CONTEXT.md`; the mobile architecture that proposes D1
is `docs/architecture/MOBILE_ARCHITECTURE_V1.md`; the canonical app-scope decision of record remains
Build Plan §9 until explicitly revised.*
