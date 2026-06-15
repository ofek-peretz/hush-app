# OPEN_ITEMS_EXECUTION_PLAN.md — Wave Prioritization & Critical Path

> **════ RE-SCOPE NOTE — DX-17 (2026-06-12) ════**
> Status since this plan: the model delta is complete — DX-07/04/03, **M1**, **DX-11**, and **DX-09 (M5)**
> all shipped (**schema v9, 156/156**), and the DX-13…18 documentation alignment is done. **Still open
> (P1):** DX-08 (Option D seeding), DX-10 (sticky preference), DX-12 (instrumentation repoint). **Not
> opened:** the Wave-2 web/app shell. Canonical status: `HUSH_V1_PROJECT_STATUS.md`; delta plan:
> `HUSH_V1_DELTA_EXECUTION_PLAN.md`.

> **Execution-planning document only.** It sequences the work already catalogued in
> `docs/canonical/HUSH_V1_OPEN_ITEMS.md` into four execution waves and derives the critical path to a
> 100-user beta. It **creates no new findings, makes no new decisions, redesigns nothing, and proposes
> no product feature.** Every row below is an existing registry item carried forward by ID; the only
> new content is *ordering, dependency, and rationale-for-placement*. Where this plan places an item in
> a different bucket than its registry **Category**, it does so strictly by the item's registry **Phase**
> tag (the gate it must clear), and says so. Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-10 · Source of truth: `HUSH_V1_OPEN_ITEMS.md` (2026-06-10) · Build: Sprint 0–4 ✅
> (125 tests, schema v6; no API/app/auth/instrumentation live yet) · Model/UX/Architecture: frozen.

---

## 0. Executive summary (read this first)

The registry holds **86 open rows** (9 Open Decisions, 37 Before-Beta controls, 4 Before-Launch, 20
Accepted Tech-Debt, 16 Known Limitations). Re-sequenced by gate, they fall into four waves:

| Wave | Gate | Count | What it is |
|---|---|---|---|
| **Wave 1** | Before any implementation begins | 7 | One architecture decision + the Pre-S5 source/migration/doc hygiene that any API build sits on. |
| **Wave 2** | Before beta (Phase 1, 100-user TestFlight) | 49 | The whole athlete-facing system: API + app + instruments + ops + security + consent. The bulk of the work. |
| **Wave 3** | Before public launch / cloud sync | 4 | The cloud-scale security gate (pinning, residency, multi-device, event authenticity). |
| **Wave 4** | Accepted debt / future review | 26 | Acknowledged tech-debt and deferred model scope; none blocks beta, none alters frozen behavior. |

### What is actually blocking implementation **today**
**One decision and one assembly.** `OD-1` (Thin-Client vs Local-First, the D1 question) is the single
hard blocker: it gates the connection model (`BB-9`), the crash-recovery/sync posture, and the app build
(`BB-15`). It must be decided before correct API or app code can begin. Running in parallel, **`BB-13`**
(assemble the per-sprint snapshots into one runnable, `pytest`-green service tree) must exist before
there is a real codebase to attach an API to, and the **Pre-S5 hygiene** items (`ATD-8`, `ATD-12`,
`ATD-13`, `ATD-15`, `ATD-16`, `ATD-18`) remove the dual-schema / migration-runner / as-built-doc
ambiguities the API build would otherwise inherit. **Nothing else in Wave 2 can correctly start until
OD-1 is decided and the source model is assembled.**

### What is blocking **beta**
The entire **Wave 2 gate** (49 controls), whose spine is five threads that must all be true on the live
service before the first real athlete trains:

1. **A correct API boundary** — `BB-14` (build the API) carrying `BB-1` idempotency, `BB-19` per-token
   authorization, `BB-8` input-bounds, `BB-9` connection model, `BB-2` transactional atomicity, `BB-4`
   version stamping, `BB-6` server-authoritative clock, `BB-7` lossless override capture.
2. **The trial's instruments live in the request path** — `BB-10` (shadow/override/fresh-state/costly
   tags), `BB-12` (full `reconstruct_session`), and the **`BB-11` A7 week-1 gate armed with a defined
   stop/re-anchor path** (the one hard Phase-1 gate; `OD-8` ratifies its thresholds).
3. **The athlete build** — `BB-15` (6 screens + onboarding + "why"), `BB-16`/`BB-17` (seed-mapping &
   equipment-coverage validated).
4. **Deployed, secured, observable ops** — `BB-30` env, `BB-3` backups+restore, `BB-20`/`BB-21`
   tokens+encryption-at-rest, `BB-27`/`BB-28` monitoring+logging, `BB-29` runbook+staged rollout.
5. **People-facing legitimacy** — `BB-33` consent/enrollment/waiver (+ `OD-2` erasure policy and `BB-35`
   retention, which must close together before any EU/CA participant).

### What is blocking **public launch**
**Wave 3 only** (`BL-1`–`BL-4`): the cloud-sync security gate (TLS1.2+/pinning, server-derived event
authenticity, at-scale encryption+backups, least-privilege+access logging), certificate pinning,
data-residency/cross-border decision, and the multi-device token story. **None of these is required for
the closed TestFlight beta**; all are required before an App Store release and server-side cloud sync.
Wave 4 (debt + deferred model scope, incl. Investigation Engine `KL-1`, Trust metric `KL-2`, Class-B/C
`KL-4`/`KL-5`) is explicitly **out of the launch path** and carries its own later phases.

---

## 1. Placement rules (how items were assigned to waves)

So the bucketing is mechanical and auditable, not a judgement call:

- **Wave = the registry `Phase` tag**, mapped: `Pre-S5` → Wave 1 · `Before Beta` / `S5/Phase 1` →
  Wave 2 · `Before Launch` / `Future/Cloud` → Wave 3 · `Ongoing` / `Phase 2` / `Phase 3` /
  `When model un-freezes` / `Re-review` → Wave 4.
- **Category vs. Wave can differ, intentionally.** A few `ATD` rows are Phase-tagged `Pre-S5` or
  `Before Beta`; those rise into Wave 1/2 because that is the gate they block, even though they live in
  the "Accepted Technical Debt" *category*. The Category column is preserved in every row so the
  source bucket is never lost.
- **Priority (P0–P3) orders work *within* a wave**, it does not move an item *between* waves.
- **No item is dropped, merged, or invented.** All 86 rows appear exactly once.

---

## 2. Wave 1 — Before any implementation begins (Pre-S5)

*Gate: must be true before Sprint 5 API/app code can correctly begin.*

| ID | Title | Cat·Pri | Rationale for placement | Dependency chain | Owner |
|---|---|---|---|---|---|
| **OD-1** | Client architecture: Thin-Client vs Local-First (D1) | OD·P0 | Decision, not engineering. It defines the connection model, crash-recovery, and sync design; building before it is decided risks rework of the whole client. | **(root)** → enables BB-9, BB-15, the sync/crash-recovery posture | Product/Mobile/Backend |
| **ATD-8** | Dual schema source of truth (`SCHEMA_SQL` vs migration chain) | ATD·P1 | Pre-S5 hygiene: the API and prod migration (BB-5) must build on one authoritative schema, not two hand-synced ones. | → unblocks clean BB-5; pairs with ATD-12/13 | Backend |
| **ATD-12** | Fresh-DB version-bookkeeping gap (`schema_version` empty on fresh v6) | ATD·P1 | Correctness of every later migration rests on this; cheapest to close before prod DB exists. | depends on ATD-13 (one runner) → enables BB-5 | Backend |
| **ATD-13** | No visible single ordered migration runner | ATD·P2 | The prod-migration gate (BB-5) needs exactly one sanctioned invocation path; verify/establish it pre-build. | → enables ATD-12, BB-5 | Backend |
| **ATD-15** | No as-built code-architecture document | ATD·P1 | The API engineer needs the real layout / connection / transaction / invariant map before extending it; absent doc is a build blocker. | informs BB-9, BB-14 | Backend |
| **ATD-16** | Snapshot/assembly dev workflow undocumented | ATD·P2 | BB-13 (assemble runnable tree) is reproducible only if the assembly workflow is written down. | pairs with BB-13, ATD-15 | Backend |
| **ATD-18** | No migration runbook / invariant-enforcement matrix | ATD·P2 | Operations needs the migration+invariant runbook before touching a real DB (feeds BB-5, BB-29). | → feeds BB-5, BB-29 | Backend/Operations |

> Wave-1 note: `BB-13` (assembled runnable service tree) is the natural Wave-1 companion to these — it is
> carried in Wave 2 per its `Before Beta` registry tag, but it is the **first build task** and is listed
> as critical-path step ②. Treat Wave 1 + BB-13 as the "can we start?" gate.

---

## 3. Wave 2 — Before beta (Phase 1, the closed 100-user cohort)

*Gate: must be live and verified on the real service before the first real athlete trains.* Grouped by
the registry's own sub-sections; P0 first within each group.

### 3.1 Open decisions that must close before/within the build

| ID | Title | Cat·Pri | Rationale for placement | Dependency chain | Owner |
|---|---|---|---|---|---|
| **OD-2** | Immutable-audit vs right-to-erasure (T1) | OD·P0 | Policy decision gating beta for any EU/CA participant; cannot append-only-store a withdrawing participant without a chosen erasure basis. | closes with BB-33 + BB-35 | Product/Backend/Operations |
| **OD-8** | Phase-0 gate-threshold ratification (Q5) | OD·P1 | The A7 gate (BB-11) is only meaningful once its thresholds are ratified; provisional verdict must be settled before arming the gate. | → BB-11 | Model/Product |
| **OD-3** | Account-recovery posture (T2) | OD·P1 | Token-only identity has nothing to recover against; the support/re-provision procedure (BB-37) implements whatever is chosen here. | → BB-37 | Product/Operations/Mobile |
| **OD-4** | Read bodyweight from HealthKit in v1 at all? (P2) | OD·P1 | Data-minimization decision that scopes the Health module before it is built; Class-B is inactive so v1 may read data it never uses. | → scopes BB-34, Health module in BB-15 | Product/Mobile |
| **OD-5** | Local DB encryption: SQLCipher vs Data Protection only | OD·P2 | Decide before the device DB module ships (BB-26); recommendation already exists, needs ratification. | → BB-26 | Mobile |
| **OD-7** | Client state mgmt: `@Observable` vs TCA | OD·P3 | App-architecture choice; decide at S5 kickoff so BB-15 builds once. Default recommended. | → BB-15 | Mobile |
| **OD-9** | CI/CD: Xcode Cloud vs fastlane+GHA | OD·P3 | Pipeline choice gating the deploy/rollout machinery (BB-29/BB-30); low-risk, recommendation exists. | → BB-29, BB-30 | Mobile/Operations |
| **OD-6** | Crash/diagnostics: MetricKit vs 3rd-party | OD·P3 | Diagnostics choice within the app; default recommended; lowest-risk decision. | → telemetry in BB-15 | Mobile |

### 3.2 Correctness, durability & data integrity

| ID | Title | Cat·Pri | Rationale for placement | Dependency chain | Owner |
|---|---|---|---|---|---|
| **BB-13** | Assembled, runnable, `pytest`-green service tree | BB·P0 | **First build task.** There is no real codebase until the snapshots are assembled; everything server-side depends on it. | Wave 1 hygiene → **BB-13** → BB-14 | Backend |
| **BB-9** | Concurrency connection model (resolve OC1 single-connection wall) | BB·P0 | A concurrent API cannot use the single shared in-memory connection; the shell must be built when the API is. Gated by OD-1. | OD-1 → BB-9 → BB-14; pairs with ATD-20 | Backend |
| **BB-1** | Idempotency/dedup contract (anti-double-apply + anti-replay) | BB·P0 | Highest-leverage single item: data integrity, support tracing, and anti-replay in one mechanism. Required the instant the API accepts events. | BB-14 hosts it → feeds BB-19, BL-1 | Backend |
| **BB-2** | Transactional atomicity + single-writer, fault-injection verified | BB·P0 | The audit chain corrupts silently if a mid-chain fault half-applies; must be proven on the live service. | needs BB-13/BB-14; pairs with ATD-20 | Backend |
| **BB-4** | Version stamping every row + `catalog_version` on sessions | BB·P0 | Every recommendation must be reconstructable to its exact model; verify end-to-end before real data exists. | within BB-14 path | Backend |
| **BB-3** | Backups + WAL + tested restore | BB·P0 | No mid-beta migration (BB-5) is safe without a tested restore; "no migration without a fresh backup". | → gates BB-5; offsets ATD-14 | Operations |
| **BB-5** | Run full additive migration chain on real prod DB | BB·P1 | Stand up the real schema v6 with referential integrity; depends on the Wave-1 schema/runner hygiene + backups. | ATD-8/12/13/18 + BB-3 → BB-5 | Backend/Operations |
| **BB-6** | Server is the authoritative clock for decay-relevant time | BB·P1 | Decay/recovery math must not trust device clocks; enforce at the API boundary. | within BB-14 | Backend |
| **BB-7** | Lossless override-target capture (incl. off-catalog free text) | BB·P1 | Overrides are the richest learning signal (A9); the boundary must capture targets losslessly across API+app. | BB-14 + BB-15 | Backend/Mobile |
| **BB-8** | Input validation / bounds on client reps & weights | BB·P1 | The frozen model trusts its inputs; the API boundary must not. Required before untrusted clients connect. | within BB-14 | Backend |

### 3.3 The trial's instruments & the A7 gate

| ID | Title | Cat·Pri | Rationale for placement | Dependency chain | Owner |
|---|---|---|---|---|---|
| **BB-10** | Validation instruments live in the request path | BB·P0 | The trial is "dead on arrival" if shadow/override/fresh-state/costly-tags aren't capturing from session one. | needs BB-14 → enables BB-11/BB-12/BB-32 | Backend |
| **BB-11** | A7 week-1 gate armed + stop/re-anchor mechanism | BB·P0 | The single hard Phase-1 gate (seed safety across the diverse cohort); its abort path is the only sanctioned unsafe-seed response. | OD-8 + BB-10 → BB-11 | Operations/Backend/Model |
| **BB-12** | Complete `reconstruct_session` audit reconstruction verified | BB·P1 | A session that cannot be reconstructed is invalid; verify every block→composition+rec+shadow+observation. | needs BB-10 | Backend |

### 3.4 The athlete-facing build

| ID | Title | Cat·Pri | Rationale for placement | Dependency chain | Owner |
|---|---|---|---|---|---|
| **BB-14** | Build the API (Build Plan §4) + staging dress-rehearsal | BB·P0 | The contract the app consumes; hosts BB-1/2/4/6/8/9/19. Nothing athlete-facing exists without it. | BB-13 + BB-9 (OD-1) → BB-14 → BB-15 | Backend |
| **BB-15** | Build the mobile app (6 screens + onboarding + "why") | BB·P0 | The only athlete-facing artifact; architecture resolved by OD-1, state by OD-7. | OD-1, OD-7, BB-14 → BB-15 | Mobile |
| **BB-16** | Validate onboarding→seed mapping end-to-end (bias conservative) | BB·P1 | Seed safety (A7) starts at onboarding; the mapping must be proven before real seeds are issued. | BB-14 + BB-15 → feeds BB-11 | Backend/Model |
| **BB-17** | Verify equipment→catalog Class-A coverage across equipment sets | BB·P1 | A composed session must cover the 5 Class-A capabilities for every declared equipment set. | BB-14 | Backend/Model |
| **BB-18** | Calibration-phase expectation-setting (frozen "why" + comms) | BB·P2 | Sets athlete expectations during early calibration; uses the frozen "why" view only, no new feature. | BB-15 ("why") + comms | Product/Operations |

### 3.5 Authentication, authorization & data protection

| ID | Title | Cat·Pri | Rationale for placement | Dependency chain | Owner |
|---|---|---|---|---|---|
| **BB-19** | Per-token object authorization (no IDOR) — derive `athlete_id` from token | BB·P0 | The core authorization invariant; server must never trust client-supplied ids. Required before multi-tenant data exists. | BB-14 + BB-1 → BB-19 | Backend |
| **BB-20** | High-entropy tokens, TLS-only, rotation/revocation, Keychain class | BB·P0 | Baseline credential security; provisioning (BB-25) and device storage (BB-26) build on it. | → BB-25, BB-26 | Backend/Operations |
| **BB-21** | Encryption at rest (DB) + encrypted access-controlled backups | BB·P0 | Health/training data at rest; pairs with backups (BB-3). | with BB-3 | Operations |
| **BB-30** | Deployed env (staging + prod), TLS, secrets management | BB·P0 | Everything else deploys onto this; the staging dress-rehearsal (BB-14) needs it. | → BB-14 staging, BB-22, BB-29 | Operations |
| **BB-22** | Operator key in secrets manager; `/internal/*` network-restricted + logged | BB·P1 | Protects the operator surface (BB-23) that the validation export (BB-32) relies on. | BB-30 → BB-22 → BB-23 | Operations/Backend |
| **BB-23** | Operator audit/state/metrics endpoints live behind operator key | BB·P1 | Support + analysis surface for the trial; gated behind BB-22. | BB-22 → BB-23 → BB-32 | Backend |
| **BB-25** | Secure token provisioning/distribution channel | BB·P1 | Tokens must reach athletes without leaking into URLs/logs/clear email; part of enrollment (BB-33). | BB-20 → BB-25, with BB-33 | Operations |
| **BB-26** | iOS Data Protection + Keychain accessibility class | BB·P1 | On-device at-rest protection; decision OD-5 scopes it. | OD-5, BB-20 → BB-26 | Mobile |
| **BB-24** | Auth-failure throttling (token brute-force mitigation) | BB·P2 | Mitigates token guessing even without general rate limiting; small, late-in-wave. | BB-19/BB-20 | Backend |

### 3.6 Observability, logging & operations

| ID | Title | Cat·Pri | Rationale for placement | Dependency chain | Owner |
|---|---|---|---|---|---|
| **BB-27** | Uptime + error + latency monitoring with on-call alerting | BB·P1 | The trial cannot run unobserved; alerting must exist before athletes depend on it. | BB-30 | Operations |
| **BB-28** | Structured logging + correlation id + no-sensitive-values rule | BB·P1 | Support tracing (links to BB-1 idempotency keys) and the privacy logging rule, server + client. | BB-14 + BB-15 | Backend/Mobile |
| **BB-29** | Incident runbook + staged rollout (internal→external→full 100) | BB·P1 | Staged rollout surfaces a seed-safety problem on a handful, not all 100; runbook is the operational safety net. | ATD-18 + BB-30 + OD-9 | Operations |
| **BB-31** | Dependency pinning + SCA + controlled build provenance | BB·P2 | The deployable is a generated artifact; pin and scan before shipping it to a cohort. | BB-13 (assembly) | Backend/Mobile/Operations |
| **BB-32** | Tested data-export path for A7/A8/A9 evidence | BB·P2 | The validation evidence must be extractable via `/internal/metrics` + audit. | BB-10 + BB-23 | Backend/Operations |

### 3.7 Concurrency hardening (ATD risen to Wave 2 by its `Before Beta` tag)

| ID | Title | Cat·Pri | Rationale for placement | Dependency chain | Owner |
|---|---|---|---|---|---|
| **ATD-20** | Concurrency/IO shell untested (single in-memory conn; FK-off, populated-DB migration, fault rollback) | ATD·P1 | Phase-tagged *Before Beta (with BB-9)*: the connection-model work must come with the concurrency/fault tests it claims. | rides with BB-9, BB-2 | Backend |

### 3.8 Consent, compliance & support (people-facing)

| ID | Title | Cat·Pri | Rationale for placement | Dependency chain | Owner |
|---|---|---|---|---|---|
| **BB-33** | Enrollment + consent pipeline (informed consent, physical-risk waiver, special-category health consent, optional RIR-subset consent) | BB·P0 | No real athlete may train without consent + waiver; the legal/ethical gate of the whole trial. | closes with OD-2 + BB-35; carries BB-25 | Operations/Product |
| **BB-34** | HealthKit privacy policy + honest usage strings; no 3rd-party Health sharing | BB·P1 | Required for the Health module (scoped by OD-4) and App Store review. | OD-4 → BB-34 | Product/Mobile |
| **BB-35** | DPIA (if EU) + processor DPAs + retention policy + breach-notification | BB·P1 | Retention basis must close with the erasure decision (OD-2) before EU/CA enrollment. | with OD-2 + BB-33 | Product/Operations |
| **BB-37** | Support channel + account-recovery/re-provision (implements OD-3) + override-vs-trust triage view | BB·P1 | The operational face of OD-3; athletes need a recovery path and operators a triage view. | OD-3 → BB-37; uses BB-23 | Operations/Product |
| **BB-36** | App Privacy label "Data Not Used to Track You" + research/ethics framing | BB·P2 | App Store submission requirement; small, late-in-wave. | BB-34 | Product |

---

## 4. Wave 3 — Before public launch / cloud sync

*Gate: required before an App Store release and server-side cloud sync; **not** required for the closed
TestFlight beta.*

| ID | Title | Cat·Pri | Rationale for placement | Dependency chain | Owner |
|---|---|---|---|---|---|
| **BL-1** | Cloud-sync security gate (TLS1.2+, event authenticity, at-scale encryption+backups, least-privilege+logging) | BL·P1 | Only relevant once data syncs to a public cloud surface; builds on the beta auth/idempotency work (BB-1/19/20/21). | BB-1/19/20/21 → BL-1 | Backend/Operations |
| **BL-2** | Certificate pinning for the high-trust health app | BL·P2 | Hardening appropriate at public scale; deferred from beta deliberately. | BL-1 | Mobile |
| **BL-3** | Data residency / cross-border transfer decision | BL·P2 | Drives GDPR transfer obligations at public scale; closes with the retention/erasure thread. | OD-2/BB-35 → BL-3 | Product/Operations |
| **BL-4** | Multi-device token story | BL·P3 | Static per-athlete token has no clean multi-device path; only needed once sync implies multiple devices. | BB-20 → BL-4 | Backend/Mobile |

---

## 5. Wave 4 — Accepted technical debt / future review

*Gate: none for beta. Acknowledged debt (addressable without redesign) and deferred model scope (carries
its own later phases). None alters frozen model behavior.* Ordered Pri then ID.

### 5.1 Accepted technical debt (ATD — the `Ongoing` / model-unfreeze rows)

| ID | Title | Cat·Pri | Rationale for placement | Dependency chain | Owner |
|---|---|---|---|---|---|
| **ATD-1** | Snapshot-and-assemble source model (runnable only post-assembly) | ATD·P1 | Ongoing debt; the beta act of assembling is BB-13, the debt itself persists. | underlies BB-13, ATD-16 | Backend |
| **ATD-9** | Immutable history is convention, not storage (no DB guard / tamper-evidence) | ATD·P1 | Acknowledged; hardening to a DB boundary is a non-redesign future change. | relates ATD-10 | Backend |
| **ATD-2** | Bit-for-bit golden-test refactor-resistance | ATD·P1 | Cleanups are cheapest when a sanctioned model change already forces a re-baseline. | when model un-freezes | Model/Backend |
| **ATD-3** | Two near-duplicate learning-chain methods | ATD·P2 | Cleanup; safe to defer, no behavior change. | — | Backend |
| **ATD-5** | Audit reads are raw SQL in the service layer | ATD·P2 | Second query surface; consolidate when convenient. | relates ATD-17 | Backend |
| **ATD-6** | Positional parameter binding / three-site discipline | ATD·P2 | Silent column-misalignment risk; mitigated by tests today. | — | Backend |
| **ATD-7** | `capability_state` god-row | ATD·P2 | Decomposition is a non-redesign refactor; defer. | — | Backend |
| **ATD-10** | Single-writer is convention + CI grep, not a DB boundary | ATD·P2 | Acknowledged; DB-level enforcement is future hardening. | relates ATD-9 | Backend |
| **ATD-14** | Forward-only migrations, no rollback | ATD·P2 | Compounds with backups; mitigated once BB-3 lands. | offset by BB-3 | Backend/Operations |
| **ATD-4** | Opt-in flag / default proliferation | ATD·P3 | Consequence of golden-test preservation; cosmetic. | relates ATD-2 | Backend |
| **ATD-11** | Accreted, semantically-loaded columns (NULL/'' carry meaning) | ATD·P3 | Documentation/cleanup; no behavior impact. | relates ATD-19 | Backend |
| **ATD-17** | No schema reference / ER overview | ATD·P3 | Doc debt; pairs with the as-built doc work. | relates ATD-15 | Backend |
| **ATD-19** | Versioning policy undocumented (when to bump versions) | ATD·P3 | Doc debt; informs but does not block BB-4. | relates BB-4 | Backend |

### 5.2 Known limitations / deferred model scope (KL)

| ID | Title | Cat·Pri | Rationale for placement | Dependency chain | Owner |
|---|---|---|---|---|---|
| **KL-14** | Existential assumptions A1–A4 unreachable in MVP | KL·P1 | The honesty contract: a successful MVP proves *safe, interpretable, probably good* — not *correct*. Carried as a stated limitation, not work. | Phase 2/3 (partial) | Model/Product |
| **KL-1** | Investigation Engine + probe slots (ES-013) not built | KL·P1 | Deferred to Phase 2; Recommendation Mode only for beta. | Phase 2 | Model/Backend |
| **KL-2** | Trust Measurement (ES-012) not built | KL·P1 | Deferred to Phase 2 (TrustScore, operator dashboard). | Phase 2 | Model/Backend |
| **KL-3** | Live fresh-state probe slots deferred to ES-013 | KL·P2 | Offline fresh-state exists; live probe slots are Phase 2. | Phase 2; with KL-1 | Backend/Model |
| **KL-4** | Class-B `vertical_pull` inactive (needs bodyweight, absent from entity/schema) | KL·P2 | Activation cross-cuts schema/onboarding/seeding (EX3); Phase 3. Links OD-4 (bodyweight read). | Phase 3 | Model/Backend |
| **KL-5** | Class-C `core_stability` inactive | KL·P2 | 7-cap templates frozen; Phase 3. | Phase 3 | Model |
| **KL-6** | Per-athlete recovery τ not learned (A6) — ship fixed population τ | KL·P2 | Unidentifiable at MVP N; accepted for Phase 3. | Phase 3 | Model |
| **KL-7** | `effort_offset = 0` (A5) — effort/fatigue unidentifiable without RIR | KL·P2 | Refused input (Anti-Requirement); flag dependent conclusions un-separated. | Phase 3 | Model |
| **KL-8** | `CHANGE_STRATEGY` signal-only | KL·P2 | Licensing needs a completed investigation (ES-013); Phase 2. | with KL-1 | Model/Backend |
| **KL-9** | Provisional parameters reviewed & kept (κ, τ, σ²_ref, gates, bands) | KL·P2 | Reviewed-Kept; **do not field-tune** — the A7 abort path is re-anchoring, never tuning. | Re-review needs extended harness | Model |
| **KL-10** | Parameter-adoption follow-up (extend harness before any adoption) | KL·P2 | Open prerequisite for any *future* adoption review; not beta work. | before future adoption | Model |
| **KL-11** | Single-capability blocks only (multi-cap de-fatigue dormant) | KL·P2 | Approximation accepted; Phase 3. | Phase 3 | Model |
| **KL-15** | A8 de-biased-error validity testable only directionally | KL·P2 | Within-athlete shadow-baseline comparison; Phase 2. | Phase 2 | Model/Product |
| **KL-16** | Re-identifiability of the diversity-tailored micro-cohort (P1) | KL·P1 | Treat "anonymized" cohort data as identified special-category; ongoing operational posture (intersects BB-35). | Ongoing; with BB-35 | Product/Operations |
| **KL-12** | Volume band collapse under Class-A (Q3) | KL·P3 | `moderate==high` for once-trained caps; flagged for Phase-0/2 model review. | Phase 0/2 review | Model |
| **KL-13** | `SESSION_FATIGUE_CEILING=24` effectively inert under Class-A (Q2) | KL·P3 | Trim-only recovery gate; Phase 2. | Phase 2 | Model |

> Wave-4 discipline: these are **not** "to-do before beta." `KL-9`/`KL-10` in particular forbid field
> tuning — the only sanctioned response to unsafe seeds is the `BB-11` stop-and-re-anchor path, never a
> parameter change. The maintained invariants in `OPEN_ITEMS_§6` (Health never enters the loop,
> parameterized SQL, no tracking SDKs, single constants source, no parameter adopted) are **preserved,
> not items** — they must not regress while any wave executes.

---

## 6. Critical path to a 100-user beta

The **minimum ordered sequence** of work that must complete to put the first cohort athlete in front of a
safe, instrumented, consented system. Items not on this list are required for beta but can proceed in
parallel off the spine (they are the rest of Wave 2); the path below is the longest dependent chain.

```
①  OD-1  decide client architecture (D1)                    [Product/Mobile/Backend]
        └─ unblocks the connection model + app architecture
②  BB-13 assemble runnable, pytest-green service tree        [Backend]
        └─ (Wave-1 hygiene ATD-8/12/13/15/16/18 done alongside)
③  BB-9  connection model (resolve OC1)                      [Backend]   ← needs OD-1
④  BB-14 build the API …                                     [Backend]   ← needs BB-13, BB-9
        carrying: BB-1 idempotency · BB-19 per-token authz ·
                  BB-8 input bounds · BB-2 atomicity ·
                  BB-4 version stamping · BB-6 server clock · BB-7 override capture
⑤  BB-30 deploy staging+prod (TLS, secrets)                  [Operations] ∥ from ②
        + BB-3 backups/restore · BB-20/21 tokens+encryption
⑥  BB-5  migrate real prod DB (schema v6)                    [Backend/Ops] ← needs BB-3 + Wave-1 hygiene
⑦  BB-10 instruments live in request path                    [Backend]    ← needs BB-14
        → BB-12 reconstruct_session verified
⑧  BB-15 build the mobile app (6 screens + onboarding + why) [Mobile]     ← needs OD-1, BB-14
        → BB-16 seed-mapping · BB-17 equipment-coverage validated
⑨  OD-8  ratify gate thresholds → BB-11 A7 week-1 gate armed [Model/Ops/Backend] ← needs BB-10
⑩  BB-33 consent/enrollment/waiver  (+ OD-2 erasure, BB-35 retention)  [Operations/Product]
        + BB-25 secure token provisioning · BB-37 support/recovery
⑪  BB-29 staged rollout (internal → small external → full 100) + runbook  [Operations]
        ── first cohort athlete trains, instruments capturing from session one ──
```

**Longest dependent chain (the true critical path):**
`OD-1 → BB-13 → BB-9 → BB-14 → BB-10 → BB-11`, with **BB-15** (app) joining at BB-14 and **BB-33/BB-29**
(consent + staged rollout) as the final human/operational gate. The A7 week-1 gate (**BB-11**, thresholds
ratified by **OD-8**) is the hard stop: the cohort may only scale past the first few athletes once seed
safety holds.

**Off-spine but still Before-Beta** (parallelizable, owned as shown): BB-22/23/24/26/27/28/31/32,
BB-34/36, OD-3/4/5/6/7/9, ATD-20. These do not extend the critical path but are part of the Wave-2 gate.

---

## 7. Owner load summary (Wave 1 + Wave 2 — the beta gate)

Counting the gating waves (decisions + before-beta), the distribution of *primary* owner:

| Owner | Representative items | Load |
|---|---|---|
| **Backend** | BB-1/2/4/5/6/8/9/13/14/19/24, BB-10/12, instruments, all Wave-1 hygiene | Heaviest — the API, pipeline boundary, instruments, and Pre-S5 hygiene |
| **Operations** | BB-3/21/22/27/29/30, BB-25/33/35/37 enrollment+ops, OD-2 | Heavy — deploy, backups, monitoring, consent, rollout |
| **Mobile** | BB-15/26, OD-5/6/7, BB-34 | The app build + device security + its decisions |
| **Product** | OD-1/3/4/8, BB-18/33/34/35/36 | Decisions + consent/compliance framing |
| **Model** | OD-8, BB-11/16/17 (shared), gate ratification | Light at beta — most model work is Wave 4 (Phase 2/3) |

Cross-owner gates to watch (from `OPEN_ITEMS_§7`): **OD-1** (3-way decision, blocks the build) ·
**BB-1 idempotency** (one mechanism, three payoffs) · **BB-3+BB-21** (safe migrations) ·
**BB-33+OD-2+BB-35** (consent/erasure/retention close together) · **BB-11** (the A7 hard gate; abort =
re-anchor, never field-tune).

---

*Prioritization and sequencing only — no new findings, no new decisions, no redesign, no new features.
Every item traces to `HUSH_V1_OPEN_ITEMS.md`; resolving any item requires updating that registry and its
source. For the frozen model start at `HUSH_V1_EXECUTION_CONTEXT.md`; for status
`HUSH_V1_PROJECT_STATUS.md`.*
