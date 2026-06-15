# HUSH_V1_OPEN_ITEMS.md — Consolidated Open-Items Registry

> **Single source of truth for all unresolved work in Hush v1.** This document **consolidates and
> normalizes** open decisions, deferred items, known limitations, beta-readiness gaps, architectural
> findings, security/privacy findings, architecture deviations, and unresolved risks that already
> exist across the canonical docs and the hardening review series. **It creates no new findings and
> makes no new decisions** — every row traces to a source document. When an item is resolved, update
> both this registry and its source. Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-12 · Build: Sprint 0–4 ✅ · Wave 1 ✅ · DX-07/04/03 ✅ · M1 ✅ · DX-11 ✅ · DX-09/M5 ✅ ·
> DX-08/10/12 ✅ · Wave-2 backend (API shell) ✅
> (**284 tests** = model golden 189 + API pytest 95, **schema v11**; backend API/auth/instrumentation
> built + `pytest`-green, **none deployed live**) · Model: advisory; UX/Architecture: frozen.
>
> **════ DELTA-TRANCHE RE-STATUS — DX-15 (2026-06-12) ════**
> Since this registry's last date the model delta shipped: the recommendation surface is **advisory**
> (DX-03/DX-20), `actual_weight` is a **learning input** (M1), `bodyweight_kg` is collected (DX-07),
> exploration is off (DX-04), and **ES-013 active investigation is RETIRED → read-only M5 stagnation
> detection** (DX-09). Re-statuses below: **KL-1** (Investigation retired→M5), **KL-2** (Trust = Phase-0
> instruments only), **KL-3** (fresh-state probes — ES-013 retired), **KL-4** (bodyweight now collected),
> **KL-8** (CHANGE_STRATEGY = advisory M5 surfacing). **New P1 open items: DX-08** (Option D seeding),
> **DX-10** (sticky preference), **DX-12** (Phase-0 instrumentation/gate repoint) — see §5 KL-17/18/19.
> Wave-2 web/app shell (BB-1/9/14/19 …) remains open and unchanged.
>
> **════ WAVE-2 BACKEND RE-STATUS (2026-06-12) ════**
> The additive **API shell** over the frozen model shipped (`SERVER_BUILD_PLAN_V1.md` Steps 1–5,
> backend; `reviews/completion/WAVE_2_BACKEND_COMPLETION_REPORT.md`). **Schema v9 → v10** (one
> additive web-shell migration: `idempotency_key`, `auth_token`). Gate: **model golden 173/173 + API
> pytest 30/30** via `python build/_verify/assemble_and_test.py`. **Now CLOSED (code):**
> **BB-13** (assembled pytest-green tree) · **BB-9** (connection-per-request + serialized writer +
> re-entrant txn) · **BB-14** (full contract §4 API) · **BB-1** (idempotency/anti-replay) · **BB-2**
> (transactional atomicity, fault-rollback verified) · **BB-19/BB-20** (per-token authz no-IDOR,
> hashed high-entropy tokens) · **BB-24** (auth-failure throttling) · **BB-8** (input bounds;
> effort/RIR→422) · **BB-4** (version stamping) · **BB-6** (server-authoritative clock) · **BB-7**
> (lossless override capture) · **BB-10** (A8 shadow in request path) · **BB-12** (complete
> reconstruct_session). **Partial:** **BB-23/BB-25** (operator enrollment + token minting built;
> network-restriction/secrets-manager are ops) · **BB-31** (deps pinned + Dockerfile; SCA is ops) ·
> **ATD-20** (concurrency/fault tests added; ATD-1 snapshot-assemble debt persists by design).
> **Also closed in code since (2026-06-12):** BB-16/BB-17 (seed-coverage + equipment-coverage harnesses),
> BB-32 (validation export `/internal/metrics`), BB-11 (A7 gate *mechanism* — thresholds still need OD-8),
> BB-28 (observability backend half), **BB-5 (prod-migration verify) + BB-3 (backup/restore mechanism)**,
> DX-08/DX-10/DX-12. **Still open (NOT code on this host — escalate or hand to Operations/Mobile/Product):**
> BB-15/26 (iOS); BB-21/22(net)/27/29/30 (Operations infra); BB-33/34/35/36/37 (consent/legal); the
> **live runs** of BB-3/BB-5/BB-28 against the deployed env. **Product decisions OD-2/OD-3/OD-4/OD-8
> RATIFIED 2026-06-12** → the unblocked code shipped same day: **BB-11 ARMED** (OD-8 thresholds), **OD-2
> erasure mechanism built** (`erase_athlete` + migration 011, schema **v10→v11**), OD-4 = no V1 code
> (HealthKit not a model input — maintained invariant). **OD-3 impl** (email magic-link) is **DEFERRED**
> (decided 2026-06-12 — no partial build): it is bundled into the future enrollment + consent +
> email-delivery workstream (BB-33 + BB-30) and built only when that workstream exists. The
> **executable before-beta backend surface is complete** — every remaining item needs infra, an iOS
> toolchain, or a compliance/enrollment build (BB-33).
>
> **Sources consolidated:** `HUSH_V1_PROJECT_STATUS.md` · `HUSH_V1_EXECUTION_CONTEXT.md` ·
> `HUSH_V1_TRACEABILITY.md` · all `reviews/completion/SPRINT_*` reports · all `reviews/planning/*` ·
> `reviews/decisions/MODEL_REVIEW_PARAMETER_ADOPTION.md` · `reviews/decisions/D1_THIN_CLIENT_VS_LOCAL_FIRST.md` ·
> `reviews/BETA_READINESS_REVIEW.md` · `reviews/ARCHITECTURAL_AUDIT_HUSH_V1.md` ·
> `reviews/SECURITY_PRIVACY_REVIEW.md` · `docs/architecture/MOBILE_ARCHITECTURE_V1.md`.

---

## How to use this document

- **Category** is the section an item lives in (the five requested buckets):
  **Open Decision** (OD) · **Before Beta** (BB) · **Before Launch** (BL) · **Accepted Technical Debt**
  (ATD) · **Known Limitation** (KL).
- **ID** is a registry-normalized identifier; the **Source** column carries the original finding id
  (e.g. *Audit OC1*, *Sec S3*, *Beta §4.1*, *D1*) so traceability is preserved.
- Items that appeared in multiple reviews are **merged into one row** with all sources listed
  (e.g. idempotency = *Beta §4.1 + Sec DI2 + D1*).

**Legend**
- **Priority:** P0 blocker · P1 high · P2 medium · P3 low.
- **Status:** Open · Proposed (recommended, not adopted) · Accepted (acknowledged/kept) ·
  Reviewed-Kept (reviewed, deliberately unchanged) · Closed.
- **Target phase:** Pre-S5 (before Sprint 5 build begins) · S5/Phase 1 (beta) · Phase 2 · Phase 3 ·
  Future/Cloud · Phase 0 (done — gate) · Ongoing.
- **Owner:** Model · Backend · Mobile · Operations · Product.

**Summary counts:** Open Decisions 10 (OD-1 Closed → Option B; **OD-2/4/8 Closed + OD-3 decision Closed /
impl Deferred → ratified 2026-06-12**; OD-10 created; OD-5/6/7/9 Mobile-open) · Before Beta 37 (rows
1–37) — **executable backend surface Closed in code; the remainder is Operations infra / iOS / consent**
· Before Launch 4 · Accepted Technical Debt 20 (ATD-8/12/13/15/16/18 Closed in Wave 1) · Known
Limitations 16 (KL-1/8/17/18/19 Closed). *(Counts are of registry rows; merged duplicates count once.)*

---

## 1. Open Decisions (OD) — must be decided, not engineered away

| ID | Title — description | Source | Pri | Status | Phase | Owner |
|---|---|---|---|---|---|---|
| **OD-1** | **Client architecture: Thin Client vs Local-First Event-Sourced (D1).** Deviates from Build Plan §9 (thin client); MOBILE_ARCHITECTURE_V1 proposes local-first. *Resolved 2026-06-10: **ADOPTED Option B (Local-First Event-Sourced)** — see `reviews/decisions/OD1_FINAL_DECISION.md`. Build Plan §9 amendment is the one TODO follow-up.* | D1; Mobile §3; Build Plan §9 | P0 | Closed ✅ (Option B) | Pre-S5 | Product/Mobile/Backend |
| **OD-10** | **Client DB migration policy (outbox-preserving).** Created by the OD-1→Option B decision: the device SQLite store needs an additive, **outbox-preserving** migration discipline (an app update must never strand an un-synced workout). | Beta §3.5; Mobile §7.3; OD-1 decision | P1 | Open | S5/Phase 1 | Mobile |
| **OD-2** | **Immutable audit chain vs. right-to-erasure (T1).** *RATIFIED 2026-06-12 → **logical deletion / anonymization**: remove personal identity + authentication data + user-linked identifiers; **retain audit/system-history anonymized** for operational/reconstruction/validation; retained records must be non-identifiable (no reconstruction of the deleted user's identity); **no destructive audit-chain deletion** in V1.* **Mechanism built (same day):** `HushService.erase_athlete` + `POST /internal/athletes/{id}/erase` + migration 011 `erasure_record` tombstone — deletes auth + idempotency rows, nulls precise identifiers (exact age, bodyweight), keeps coarse cohort labels (sex/experience) the A7 validation needs, leaves immutable history untouched. `reviews/completion/OD-2_ERASURE_COMPLETION_REPORT.md`. **Operations complement (not this DB):** delete the external enrollment/consent record (with BB-33). | Sec §10/P3/C1 | P0 | **Closed ✅ (logical anonymization; mechanism built)** | Before Beta | Product ✅ / Backend ✅ |
| **OD-3** | **Account-recovery posture (T2).** *RATIFIED 2026-06-12 → **email-based magic-link** recovery; **email is the primary account identifier** in V1; no SMS, no security questions, no alternative flows.* **Implementation DEFERRED (decided 2026-06-12):** do **not** build a partial/standalone magic-link tranche on this host. Email *delivery* needs an external email service (BB-30 infra); email-as-primary-identifier restructures enrollment + collects email PII (intersects **BB-33** consent + must extend the OD-2 erasure scrub set). Because the token mint/verify/re-provision mechanism is meaningless without the email channel and would force enrollment/PII/erasure-scrub decisions that belong to the consent workstream, the **entire OD-3 implementation is deferred until the future enrollment + consent + email-delivery workstream exists** (BB-33 + BB-30) — at which point it is built as one coordinated tranche, not before. | Sec R1/R2/§10; Beta §5.2 | P1 | **Decision Closed ✅; impl Deferred → bundled w/ BB-33+BB-30 enrollment/consent/email workstream** | Future (with BB-33) | Product ✅ / Operations / Backend |
| **OD-4** | **Read bodyweight from HealthKit in v1 at all? (P2).** *RATIFIED 2026-06-12 → **HealthKit is NOT a model input in V1**: no HealthKit-derived signal (steps/calories/HR/sleep/runs/walks) may influence capability scores, progression, recommendations, stagnation, weekly programming, or any learning component — the strength model stays fully independent. Future (non-V1): HealthKit import for UX only (unified activity timeline / Watch), kept separate from the strength model unless explicitly redesigned.* **No V1 code:** reinforces the maintained invariant "Apple Health never enters the learning loop" (§6); HealthKit read is Mobile/UX, out of the learning loop by construction. | Sec P2; Mobile §9.2 | P1 | **Closed ✅ (not a model input; future UX-only)** | Before Beta | Product ✅ / Mobile |
| **OD-5** | **Local DB encryption: SQLCipher vs iOS Data Protection only.** | Mobile §7.4/§14 | P2 | Open | S5/Phase 1 | Mobile |
| **OD-6** | **Crash/diagnostics: MetricKit vs a third-party crash reporter.** | Mobile §10.2/§14 | P3 | Open | S5/Phase 1 | Mobile |
| **OD-7** | **Client state mgmt: `@Observable` + repositories vs TCA.** | Mobile §6.1/§14 | P3 | Open | S5/Phase 1 | Mobile |
| **OD-8** | **Phase 0 gate-threshold ratification (Q5).** *RATIFIED 2026-06-12 → A7 thresholds for V1: `max_first_rep_failure_rate=0.0`, `min_completion_rate=0.80`, `min_cohort_n=5`; no parameter adoption before validation gates pass; provisional parameters stay provisional; **never field-tune** on live users; A7 is the authoritative safety gate; thresholds change only by a future explicit product decision.* **BB-11 ARMED (same day):** `app/a7_gate.py` now stamps `thresholds_status: RATIFIED — OD-8 (V1)` + `armed: true` (values unchanged; the provisional placeholders matched the ratified numbers). `reviews/completion/BB-11_A7_GATE_ARMED_COMPLETION_REPORT.md`. | PROJECT_STATUS S4; Param review Q5 | P1 | **Closed ✅ (ratified; BB-11 armed)** | Before Beta | Model ✅ / Product ✅ |
| **OD-9** | **CI/CD: Xcode Cloud vs fastlane + GitHub Actions.** | Mobile §13.2 | P3 | Open | S5/Phase 1 | Mobile/Operations |

---

## 2. Before Beta (BB) — must be in place before the first real athlete (Phase 1)

> Consolidates `BETA_READINESS_REVIEW.md` §11 and `SECURITY_PRIVACY_REVIEW.md` §13. These are the
> launch-gate blockers/high items for the closed ~100-user TestFlight cohort.

### 2.1 Correctness, durability & data integrity

| ID | Title — description | Source | Pri | Status | Phase | Owner |
|---|---|---|---|---|---|---|
| **BB-1** | **Idempotency/dedup contract** — server dedups on a client event id; replayed event is a verified no-op. (Anti-double-apply *and* anti-replay.) | Beta §4.1; Sec DI2/CS2; D1; Audit | P0 | Closed ✅ (code, Wave-2) | Before Beta | Backend ✅ |
| **BB-2** | **Transactional atomicity + single-writer verified on the live service**, incl. mid-chain fault-injection rollback. | Beta §4.2; Audit OC4 | P0 | Closed ✅ (code, Wave-2 — fault-rollback verified) | Before Beta | Backend ✅ |
| **BB-3** | **Backups + WAL + tested restore**; "no migration without a fresh backup". *Mechanism built 2026-06-12 (BB-5 tranche): `app/migrate.py` — `backup_database` (WAL-safe sqlite3 `.backup()` online snapshot, self-verified), `restore_database` (tested restore), and the backup-gated `migrate_production`. WAL already on. `reviews/completion/BB-5_PROD_MIGRATION_COMPLETION_REPORT.md`.* **Still Operations:** off-box/encrypted/scheduled backup storage (with BB-21/BB-30). | Beta §4.3/§3.3; Sec CS5 | P0 | Mechanism Closed ✅; storage Open | Before Beta | Operations ⟵ Backend mech ✅ |
| **BB-4** | **Version stamping on every row** — `model_version`/`capability_model_version` (present in history schema) **+ `catalog_version` on composed sessions**; verify end-to-end. | Beta §3.2/§3.4 | P0 | Closed ✅ (code, Wave-2) | Before Beta | Backend ✅ |
| **BB-5** | **Run the full additive migration chain on the real prod DB**; assert schema **v11** (current head) + referential integrity. *Mechanism Closed 2026-06-12: `app/migrate.py` — `verify_database` (schema_version head + chain_complete + `integrity_check` + **`foreign_key_check` referential integrity** + fresh-vs-migrated shape parity) and the backup-gated, forward-only `migrate_production` (refuses to migrate without a fresh verified backup; runs the single ordered runner; verifies). Prod engine = SQLite everywhere ⇒ faithful on-host rehearsal; tested on fresh/populated/older DBs + idempotency + restore. `reviews/completion/BB-5_PROD_MIGRATION_COMPLETION_REPORT.md`; API suite 55→67, golden 188 unchanged.* **Still Operations:** running it against the **deployed** DB (BB-30 env). | Beta §3.1 | P1 | Mechanism Closed ✅; live-run Open | Before Beta | Backend ✅ / Operations |
| **BB-6** | **Server is the authoritative clock** for all decay-relevant time (device times advisory only). | Beta §4.4 | P1 | Closed ✅ (code, Wave-2) | Before Beta | Backend ✅ |
| **BB-7** | **Lossless override-target capture**, incl. off-catalog free text (A9 attribution gap flagged). | Beta §4.5; Sec; Mobile §7.2 | P1 | Closed ✅ (backend, Wave-2); client field = Mobile | Before Beta | Backend ✅ / Mobile |
| **BB-8** | **Input validation / bounds** on client-supplied reps & weights (frozen model trusts its inputs; the API boundary must not). | Sec DI3 | P1 | Closed ✅ (code, Wave-2 — effort/RIR→422) | Before Beta | Backend ✅ |
| **BB-9** | **Connection model for a concurrent API** — resolve the single-shared-SQLite-connection wall (OC1) when building the API (connection-per-request / write-serialization; additive shell, no model change). | Audit OC1/LP1/EX4 | P0 | Closed ✅ (code, Wave-2 — connection-per-request + serialized writer) | Before Beta | Backend ✅ |

### 2.2 The trial's instruments & the A7 gate

| ID | Title — description | Source | Pri | Status | Phase | Owner |
|---|---|---|---|---|---|---|
| **BB-10** | **Validation instruments live in the request path** — shadow baseline (A8), override log (A9), fresh-state (A1), costly-case tags (A3); verified on a recorded session. | Beta §6.1; PROJECT_STATUS §5.7; EXEC_CTX §4 | P0 | Closed ✅ (code, Wave-2 — A8 shadow in request path) | Before Beta | Backend ✅ |
| **BB-11** | **A7 week-1 gate armed** — cohort-segmented first-session view (completion / first-rep-failure by tail) + a defined **stop/pause-and-re-anchor** mechanism. *Mechanism built 2026-06-12 (`app/a7_gate.py` + `GET /internal/gate/a7`); **ARMED 2026-06-12** once OD-8 ratified the thresholds (`thresholds_status: RATIFIED — OD-8 (V1)`, `armed: true`). Hard stop verified: any cohort with a day-1 first-rep failure → PAUSE_AND_REANCHOR. The only sanctioned response to an UNSAFE cohort is stop-and-re-anchor ES-008 v2 — never field-tune (KL-9). `reviews/completion/BB-11_A7_GATE_ARMED_COMPLETION_REPORT.md`.* **Still Operations:** the human gate-review cadence + pause-new-first-sessions runbook (BB-29) on top of the armed signal. | Beta §6.2/§9.3; Validation Arch | P0 | **Armed ✅ (code); review cadence = BB-29 (Ops)** | Before Beta | Backend ✅ / Model ✅ / Operations |
| **BB-12** | **Complete `reconstruct_session` audit reconstruction** verified (every block → composition + recommendation + shadow + observation). | Beta §6.1; PROJECT_STATUS | P1 | Closed ✅ (code, Wave-2) | Before Beta | Backend ✅ |

### 2.3 The athlete-facing build

| ID | Title — description | Source | Pri | Status | Phase | Owner |
|---|---|---|---|---|---|---|
| **BB-13** | **Assembled, runnable, `pytest`-green service tree** (not per-sprint snapshots). | Beta §1; PROJECT_STATUS §5.8; Audit MR1/TB5 | P0 | Closed ✅ (code, Wave-2 — assembled pytest-green tree) | Before Beta | Backend ✅ |
| **BB-14** | **Build the API** (Build Plan §4 endpoints) + dress-rehearse end-to-end against staging. *Dress-rehearsal **harness built** 2026-06-12: `deploy/smoke_test.py` — a stdlib-only end-to-end HTTP smoke that drives the full athlete lifecycle + operator surface against a running server (`--base-url`), with a `--self` mode that boots the assembled app and tears it down (validated green locally + in CI). This is the exact gate to run against staging.* **Still Operations:** the staging env to point it at (BB-30). | Beta §1 | P0 | Closed ✅ (API built, Wave-2; smoke harness built); run-against-staging = Ops (BB-30) | Before Beta | Backend ✅ / Operations |
| **BB-15** | **Build the mobile app** (6 screens + onboarding + "why") per the (D1-resolved) architecture. *Client-contract prep 2026-06-12: `deploy/export_openapi.py` emits `deploy/openapi.json` (the served contract, 16 paths, schema-version-stamped) so the iOS client can codegen/type-check against the exact server surface instead of hand-transcribing `API_CONTRACT_V1.md`; a `--check` CI drift gate keeps it honest. The app build itself needs the iOS toolchain.* | Beta §1; Mobile | P0 | Open (contract baseline prepped ✅; app build = iOS toolchain) | Before Beta | Mobile |
| **BB-16** | **Validate onboarding→seed mapping** end-to-end; bias ambiguous self-report conservative. | Beta §2.2 | P1 | Closed ✅ (code — `sim/seed_validation.py` gate) | Before Beta | Backend ✅ / Model ✅ |
| **BB-17** | **Verify equipment→catalog Class-A coverage** across the full range of declared equipment sets. | Beta §2.3 | P1 | Closed ✅ (resolved — V1 = commercial gym; barbell covers all 5 Class-A) | Before Beta | Backend ✅ / Model ✅ |
| **BB-18** | **Calibration-phase expectation-setting** via the frozen "why" view + out-of-band comms (no new feature). | Beta §2.4/§5.3 | P2 | Open | Before Beta | Product/Operations |

### 2.4 Authentication, authorization & data protection

| ID | Title — description | Source | Pri | Status | Phase | Owner |
|---|---|---|---|---|---|---|
| **BB-19** | **Per-token object authorization (no IDOR)** — server **derives `athlete_id` from the token**, never trusts client-supplied ids. | Sec DI1 | P0 | Closed ✅ (code, Wave-2 — athlete_id derived from token) | Before Beta | Backend ✅ |
| **BB-20** | **High-entropy random tokens, TLS-only, revocation/rotation** capability; restrictive Keychain class. | Sec S1/A3; Beta §2.5 | P0 | Closed ✅ (code, Wave-2 — hashed high-entropy tokens + revocation/rotation); TLS/Keychain = Ops/Mobile | Before Beta | Backend ✅ / Operations / Mobile |
| **BB-21** | **Encryption at rest** (disk/volume) for the DB; **encrypted, access-controlled backups**. *Strategy + tooling prepared 2026-06-12: `docs/architecture/DATA_PROTECTION_AT_REST_V1.md` (volume-encryption decision — model untouched; encrypted off-box backup strategy layered on the built `backup_database`; retention policy; restore drill) + `deploy/backup/encrypted_backup.sh` (snapshot→age/gpg envelope→manifest→upload hook). Backup/restore/verify mechanism already built (`app/migrate.py`).* **Still Operations infra:** the encrypted `/data` volume, the KMS backup key, the off-box versioned bucket, the scheduler; **+ a BB-35 compliance decision** to ratify retention/backup-erasure SLA. | Sec S3; Beta §4.3 | P0 | Prep Closed ✅ (strategy + wrapper); infra Open | Before Beta | Operations ⟵ Backend prep ✅ |
| **BB-22** | **Operator key in a secrets manager**; `/internal/*` network-restricted; **operator access logged**. *Operator-access logging **built 2026-06-12** (code): `deps.require_operator` now constant-time-checks the key and emits one structured `operator_access` audit line per call — `outcome=granted|denied`, route template, method; **WARNING on denial** (brute-force/misconfig signal); key value never logged. Tests in `test_api_observability.py` (suite +3). Secrets-manager flow + `/internal/*` private-only restriction specified in `DEPLOYMENT_ARCHITECTURE_V1.md` §5 (`deploy/ingress/Caddyfile.example` denies `/internal/*` on the public listener).* **Still Operations infra:** the secrets-manager instance + the firewall/network rules. | Sec S2/A5/P6 | P1 | Logging Closed ✅ (code); secrets-mgr/network = Ops infra | Before Beta | Backend ✅ / Operations |
| **BB-23** | **Operator audit/state/metrics endpoints live** behind the operator key (support + analysis surface). | Beta §5.1/§9.5 | P1 | Closed ✅ (code, Wave-2 — `/internal/metrics`+`/gate`+reconstruct behind operator key) | Before Beta | Backend ✅ |
| **BB-24** | **Auth-failure throttling** even without general rate limiting (mitigates token brute-force). | Sec S4 | P2 | Closed ✅ (code, Wave-2 — auth-failure throttling) | Before Beta | Backend ✅ |
| **BB-25** | **Secure token provisioning/distribution channel** (never in URLs/logs/clear email). | Sec A2; Beta §2.5 | P1 | Partial ✅ (token mint built, Wave-2); secure distribution channel = Ops | Before Beta | Backend (mint ✅) / Operations |
| **BB-26** | **iOS Data Protection + Keychain accessibility class** on device. | Sec S5; Mobile §7.4 | P1 | Open | Before Beta | Mobile |

### 2.5 Observability, logging & operations

| ID | Title — description | Source | Pri | Status | Phase | Owner |
|---|---|---|---|---|---|---|
| **BB-27** | **Uptime + error + latency monitoring** with alerting to a named on-call. *Watcher mechanism built 2026-06-12 (code): `app/ops_monitor.py` — a dependency-free (stdlib-only) CLI that polls `/health` + `/internal/gate/a7` + `/internal/metrics` and grades **OK/WARN/CRITICAL → exit 0/1/2** (worst finding wins; the A7 hard stop, an unreachable service, and a denied/absent operator key are all CRITICAL). Emits one structured JSON line per run on logger `hush.ops` for shipping. Runs on a bare bastion Python pointed at the deployed URL (`python -m app.ops_monitor`); tested in `test_api_ops_monitor.py` (17 tests).* **Still Operations:** point `--base-url` at the deployed service + wire the exit code / `hush.ops` line into the actual pager + name the on-call rota (BB-29). | Beta §6.2 | P1 | Watcher mechanism Closed ✅ (code); alert delivery/on-call = Ops | Before Beta | Backend ✅ / Operations |
| **BB-28** | **Structured operational logging + end-to-end correlation id + no-sensitive-values-in-logs rule** (server & client). *Backend half resolved 2026-06-12: `app/observability.py` — pure-ASGI correlation-id middleware (inbound validated against log-injection; echoed `X-Correlation-Id`; surfaced as `error.request_id`) + one allowlisted JSON access line per request (method/route-template/status/latency_ms/correlation_id) on `hush.api`; no-sensitive-values enforced structurally (no body/header/token/health path), proven by a full-lifecycle test. `reviews/completion/BB-28_OBSERVABILITY_COMPLETION_REPORT.md`; API suite 43→55, golden 188 unchanged, schema v10.* **Still open:** client-side logging (Mobile); log shipping/retention/alerting (Operations — BB-27/29/30). | Beta §7.1–7.3; Sec S6; Audit | P1 | Backend half Closed ✅; client/ship Open | Before Beta | Backend ✅ / Mobile / Operations |
| **BB-29** | **Incident runbook** (deploy/rollback, restore, pause-trial, contact-cohort) + **staged rollout** (internal → small external → full 100). *Written 2026-06-12: `docs/architecture/INCIDENT_RUNBOOK_V1.md` — severity/escalation, staged rollout (internal→small→full, A7 as the hard gate at each stage), and runbooks for bad-deploy rollback, bad-migration/corruption restore, the **A7 hard stop → pause + re-anchor** (never field-tune), operator-key compromise, and the backups-unrecoverable disaster; + a pre-beta rehearsal checklist. Composes the built `app/migrate.py`/`ops_monitor.py`/`a7_gate.py`.* **Still Operations:** named on-call rota + pager wiring + maintenance-window mechanism; **cohort-contact channel intersects BB-33 consent.** | Beta §9.3/§9.4 | P1 | Playbook Closed ✅; on-call/pager wiring = Ops | Before Beta | Operations ⟵ Backend prep ✅ |
| **BB-30** | **Deployed env (staging + prod), TLS, secrets management.** *Architecture prepared 2026-06-12: `docs/architecture/DEPLOYMENT_ARCHITECTURE_V1.md` (prod/staging topology, the full env-var + secrets contract, TLS assumptions, `/internal/*` restriction, deploy/migrate/verify/smoke runbook) + `deploy/.env.example`, `deploy/ingress/Caddyfile.example`, `deploy/entrypoint.sh` (backup-gated migrate→serve), `deploy/compose.staging.yaml` (staging-shaped). Composes the built migration/observability/monitor mechanisms. **Post-deploy verification gate built** (`deploy/smoke_test.py --base-url <url>` — full-lifecycle HTTP smoke) so the deployed env has a pass/fail gate before traffic.* **Still Operations infra (escalate):** cloud host/runtime, DNS + issued TLS cert, secrets-manager instance, encrypted volume, firewall rules, off-box backup bucket, pager integration. | Beta §9.2; Sec | P0 | Architecture Closed ✅ (docs+templates); infra Open | Before Beta | Operations ⟵ Backend prep ✅ |
| **BB-31** | **Dependency pinning + SCA + controlled build provenance** (the deployable is a generated artifact). *SCA **scripted** 2026-06-12: `deploy/sca_audit.py` runs `pip-audit --strict` over the pinned closure (`deploy/requirements*.txt`) and fails on a known-vulnerable pin; honest exit 2 (NOT a false pass) when the advisory DB is unreachable. Wired into `.github/workflows/ci.yml` (assemble → canonical gate → OpenAPI-drift → SCA + a `--self` HTTP smoke job) as the reproducible build-of-record.* **Still Operations:** an Actions/CI runner to execute it (+ network to the advisory DB) and signed image/build provenance. | Sec S7; Audit OC3 | P2 | Partial ✅ (deps pinned + Dockerfile + SCA/CI scripted); runner/provenance = Ops | Before Beta | Backend ✅ / Operations / Mobile |
| **BB-32** | **Tested data-export path** for the validation evidence (A7/A8/A9) via `/internal/metrics` + audit. | Beta §9.5 | P2 | Closed ✅ (code, Wave-2 — `/internal/metrics` A7/A8/A9 export); log shipping = Ops | Before Beta | Backend ✅ / Operations |

### 2.6 Consent, compliance & support (people-facing)

| ID | Title — description | Source | Pri | Status | Phase | Owner |
|---|---|---|---|---|---|---|
| **BB-33** | **Enrollment + consent pipeline** — informed consent incl. health/training data, the **physical-risk waiver**, **explicit special-category (health) consent**, and consent for the optional **RIR research subset** if used. | Beta §2.5; Sec C1/C4/H4 | P0 | Open | Before Beta | Operations/Product |
| **BB-34** | **HealthKit privacy policy + honest usage strings; no third-party Health sharing / no ads.** | Sec H2/C3 | P1 | Open | Before Beta | Product/Mobile |
| **BB-35** | **DPIA (if EU) + processor DPAs + retention policy + breach-notification readiness.** | Sec C1/C5/P4 | P1 | Open | Before Beta | Product/Operations |
| **BB-36** | **App Privacy label "Data Not Used to Track You"**; confirm research/ethics framing. | Sec C3/C4 | P2 | Open | Before Beta | Product |
| **BB-37** | **Support channel + account-recovery/re-provision procedure** (implements OD-3 — **deferred with OD-3** into the enrollment/consent/email workstream; no standalone build) + override-vs-trust triage view. | Beta §5.2/§5.3 | P1 | Open (OD-3 portion Deferred) | Future (with BB-33) | Operations/Product |

*(Note: BB IDs are listed 1–37 across sub-sections; the §0 count of 32 refers to distinct
launch-gate controls in Beta §11 — the extra rows here are the merged security/compliance controls
from Sec §13. Treat all BB rows as the before-beta gate.)*

---

## 3. Before Launch (BL) — public/App-Store launch and future cloud sync

| ID | Title — description | Source | Pri | Status | Phase | Owner |
|---|---|---|---|---|---|---|
| **BL-1** | **Cloud-sync security gate** — TLS 1.2+ (+ consider pinning), event authenticity (server-derived identity), encryption at rest + backups at scale, least-privilege + access logging. | Sec CS1–CS5 | P1 | Open | Future/Cloud | Backend/Operations |
| **BL-2** | **Certificate pinning** consideration for the high-trust health app. | Sec CS3 | P2 | Open | Before Launch/Cloud | Mobile |
| **BL-3** | **Data residency / cross-border transfer decision** (drives GDPR transfer obligations). | Sec CS4/C1 | P2 | Open | Before Launch/Cloud | Product/Operations |
| **BL-4** | **Multi-device token story** — sync implies multiple devices per athlete; static-token model has no clean multi-device path. | Sec CS6 | P3 | Open | Future/Cloud | Backend/Mobile |

---

## 4. Accepted Technical Debt (ATD) — acknowledged; addressable without redesign

> From `ARCHITECTURAL_AUDIT_HUSH_V1.md`. None alters frozen model behavior. The "expensive future
> changes" (Audit §10 EX1–EX6) are consequences of these and are cross-referenced, not duplicated.
>
> **Wave 1 closed (2026-06-10):** ATD-8 / ATD-12 / ATD-13 / ATD-15 / ATD-16 / ATD-18 resolved — see
> `reviews/completion/WAVE_1_COMPLETION_REPORT.md`. Code items (ATD-8/12/13) verified at **131/131 tests
> (125 prior unchanged bit-for-bit + 6 new Wave-1 guards)**; fresh-vs-migrated parity preserved; no model
> number, formula, schema shape, or trajectory changed.

| ID | Title — description | Source | Pri | Status | Phase | Owner |
|---|---|---|---|---|---|---|
| **ATD-1** | **Snapshot-and-assemble source model** — runnable package exists only post-`assemble_and_test.py`; real layout in `CONCEPTUAL LOCATION` comments. | Audit MR1 | P1 | Accepted | Ongoing | Backend |
| **ATD-2** | **Bit-for-bit golden-test refactor-resistance** — safety mechanism is also a rigidity mechanism (EX2). Cleanups are cheapest when a sanctioned model change already forces a re-baseline. | Audit MR2/EX2 | P1 | Accepted | When model un-freezes | Model/Backend |
| **ATD-3** | **Two near-duplicate learning-chain methods** (`report_set` / `report_set_fatigue_aware`). | Audit TD1 | P2 | Accepted | Ongoing | Backend |
| **ATD-4** | **Opt-in flag / default proliferation** to preserve golden tests. | Audit TD2 | P3 | Accepted | Ongoing | Backend |
| **ATD-5** | **Audit reads are raw SQL in the service layer** (second query surface over the schema). | Audit TD3 | P2 | Accepted | Ongoing | Backend |
| **ATD-6** | **Positional parameter binding / three-site discipline** (silent column-misalignment risk; EX1). | Audit TD4/EX1 | P2 | Accepted | Ongoing | Backend |
| **ATD-7** | **`capability_state` god-row** (core + variance + decision memory + fatigue in one row). | Audit TD5 | P2 | Accepted | Ongoing | Backend |
| **ATD-8** | **Dual schema source of truth** — cumulative `SCHEMA_SQL` vs the migration chain, hand-synced (EX5). *Wave 1: structural drift guard added (`test_wave1.test_schema_sql_embodies_every_migration_addition`).* | Audit SR1 | P1 | Closed ✅ | Pre-S5 hygiene | Backend |
| **ATD-9** | **Immutable history is convention, not storage** — status UPDATEs exist; no DB guard; no audit tamper-evidence (Sec DI4). | Audit SR2; Sec DI4 | P1 | Accepted | Ongoing | Backend |
| **ATD-10** | **Single-writer is convention + CI grep**, not a DB boundary. | Audit SR4 | P2 | Accepted | Ongoing | Backend |
| **ATD-11** | **Accreted, default-heavy, semantically-loaded columns** (NULL/'' carry meaning). | Audit SR5 | P3 | Accepted | Ongoing | Backend |
| **ATD-12** | **Fresh-DB version-bookkeeping gap** — `schema_version` empty on a fresh v6 DB; correctness rests on migrations staying additive+idempotent. *Wave 1: fresh DB now stamps the full chain (`db._stamp_fresh_schema_version`).* | Audit MG1 | P1 | Closed ✅ | Pre-S5 hygiene | Backend |
| **ATD-13** | **No visible single ordered migration runner** (verify one exists as the only invocation path). *Wave 1: `migrations/runner.py` added (`MIGRATIONS`/`SCHEMA_VERSION`/`run_migrations`), the single ordered path.* | Audit MG2 | P2 | Closed ✅ | Pre-S5 | Backend |
| **ATD-14** | **Forward-only migrations, no rollback** (compounds with backups gap BB-3). | Audit MG3 | P2 | Accepted | Ongoing | Backend/Operations |
| **ATD-15** | **No as-built code-architecture document** (layout, assembly, connection/transaction model, invariant-enforcement matrix). *Wave 1: `docs/architecture/SERVER_ARCHITECTURE_ASBUILT_V1.md` (canonical invariant matrix).* | Audit DG1 | P1 | Closed ✅ | Pre-S5 | Backend |
| **ATD-16** | **Snapshot/assembly dev workflow undocumented.** *Wave 1: `docs/DEVELOPMENT_WORKFLOW.md` (edit-snapshot → assemble → test; never edit `_assembled`).* | Audit DG2 | P2 | Closed ✅ | Pre-S5 | Backend |
| **ATD-17** | **No schema reference / ER overview.** *Closed 2026-06-12: `docs/architecture/SCHEMA_REFERENCE_V1.md` — v11 table inventory by zone (immutable history / mutable projection / runtime-surfacing / web-shell infra / bookkeeping), the FK/ER topology, and per-table column lists; generated by introspecting the fresh `SCHEMA_SQL` head and verified against the chain.* | Audit DG3 | P3 | Closed ✅ | Ongoing | Backend |
| **ATD-18** | **No migration runbook / invariant-enforcement matrix.** *Wave 1: `docs/architecture/MIGRATION_RUNBOOK_V1.md` (+ shared invariant matrix).* | Audit DG4 | P2 | Closed ✅ | Pre-S5 | Backend/Operations |
| **ATD-19** | **Versioning policy undocumented** (when to bump MODEL/CAPABILITY/schema/catalog versions). *Closed 2026-06-12: `docs/architecture/VERSIONING_POLICY_V1.md` — the four identifiers (`MODEL_VERSION`/`CAPABILITY_MODEL_VERSION`/`CATALOG_VERSION`/`SCHEMA_VERSION`), when each bumps + who may, the catalog↔capability tie, the A7-reanchor = capability bump rule, and the "never field-tune / re-gold on model bump" discipline.* | Audit DG5 | P3 | Closed ✅ | Ongoing | Backend |
| **ATD-20** | **Concurrency/IO shell untested** — single in-memory connection only; FK-off, populated-DB migration, real fault rollback thinly covered (TB1/TB2/TB3). *Wave-2: concurrency/fault tests added (connection-per-request, serialized writer, mid-chain fault-rollback verified); residual snapshot-assemble debt = ATD-1.* | Audit TB1–TB3 | P1 | Largely addressed ✅ (Wave-2); ATD-1 residual | Before Beta (with BB-9) | Backend |

---

## 5. Known Limitations (KL) — deferred scope & accepted model constraints

> From `HUSH_V1_PROJECT_STATUS.md` §2/§5, `HUSH_V1_EXECUTION_CONTEXT.md` §4/§6, the sprint completion
> reports, and `MODEL_REVIEW_PARAMETER_ADOPTION.md`. Deferred roadmap items carry a target phase.

| ID | Title — description | Source | Pri | Status | Phase | Owner |
|---|---|---|---|---|---|---|
| **KL-1** | **Investigation Engine (ES-013) RETIRED in v1** — the active investigation/mode-controller/probe engine is not built and is **not a v1 target**; replaced by read-only **M5 stagnation detection** (DX-09, shipped). | PROJECT_STATUS §2/§3; EXEC_CTX §4; DX-09 | P1 | Closed ✅ (retired → M5) | — | Model/Backend |
| **KL-2** | **Trust Measurement (ES-012) — Phase-0 instruments only** — shadow baseline (A8) + de-biased error built (Sprint 4); full TrustScore + operator dashboard deferred; v1 success reoriented to stagnation/program (DX-14). | PROJECT_STATUS §2; DX-14 | P1 | Deferred (partial built) | Phase 2/3 | Model/Backend |
| **KL-3** | **Live fresh-state probe slots not built** (offline fresh-state check exists; live probe slots do not). Was "deferred to ES-013"; ES-013 is retired, so this is now an unscheduled post-v1 item. | PROJECT_STATUS §6; DX-09 | P2 | Deferred | Phase 2/3 | Backend/Model |
| **KL-4** | **Class-B `vertical_pull` inactive** — `bodyweight_kg` is **now collected (DX-07)**, but Class-B activation still cross-cuts seeding/templates/Class-B pipeline and is deferred; Option D (DX-08) is the seeding prerequisite. | EXEC_CTX §4; Audit SR3/EX3; DX-07 | P2 | Deferred | Phase 3 | Model/Backend |
| **KL-5** | **Class-C `core_stability` inactive** (7-cap templates frozen). | EXEC_CTX §4 | P2 | Deferred | Phase 3 | Model |
| **KL-6** | **Per-athlete recovery τ not learned (A6)** — ship fixed population τ; unidentifiable at MVP N. | PROJECT_STATUS §5.3; EXEC_CTX A6 | P2 | Accepted | Phase 3 | Model |
| **KL-7** | **`effort_offset = 0` (A5)** — effort/fatigue separability unidentifiable without RIR (refused); flag every dependent conclusion un-separated. | PROJECT_STATUS §5.2 | P2 | Accepted | Phase 3 | Model |
| **KL-8** | **`CHANGE_STRATEGY` is an advisory M5 surfacing** — read-only, acceptance-gated volume option; **not** investigation-licensed (ES-013 retired). Built in DX-09. | PROJECT_STATUS §2; DX-09 | P2 | Closed ✅ (advisory via M5) | — | Model/Backend |
| **KL-9** | **Provisional/UNVALIDATED parameters, reviewed & kept** — κ, τ_sys, τ_cap, σ²_ref, `DECISION_CONF_GATE`, `SURPRISE_DEADBAND`, `PREFERENCE_NUDGE`, `SESSION_FATIGUE_CEILING`, `P_EXPLORE`, bands; corrections directional not calibrated. *Do not tune in the field.* | PROJECT_STATUS §5.1/§7; Param review | P2 | Reviewed-Kept | Re-review needs extended harness | Model |
| **KL-10** | **Parameter-adoption follow-up** — extend the harness (conflict / progress-regress / varied-rest / INCREASE–DECREASE-firing) before any future adoption review. | Param review §7; PROJECT_STATUS | P2 | Open | Before any future adoption | Model |
| **KL-11** | **Single-capability blocks only** — multi-capability C.3 de-fatigue is an approximation (dormant). | PROJECT_STATUS §5.4 | P2 | Accepted | Phase 3 | Model |
| **KL-12** | **Volume band collapse under Class-A (Q3)** — `moderate==high` for once-trained caps; null-focus ×0.75 flagged for Phase-0 model review. | PROJECT_STATUS §5.5; Sprint 3B-2 | P3 | Accepted | Phase 0/2 review | Model |
| **KL-13** | **`SESSION_FATIGUE_CEILING=24` effectively inert under Class-A (Q2)** — trim-only recovery gate. | PROJECT_STATUS §5.5 | P3 | Accepted | Phase 2 | Model |
| **KL-14** | **Existential assumptions A1–A4 unreachable in MVP** — capability recoverable / loop converges / trust measurable / athletes delegate. A successful MVP proves *safe, interpretable, probably good* — not *correct over the long run*. | EXEC_CTX §6; PROJECT_STATUS §5.9 | P1 | Accepted | Phase 2/3 (partial) | Model/Product |
| **KL-15** | **A8 de-biased-error validity testable only directionally** (within-athlete shadow-baseline paired comparison). | EXEC_CTX §6 | P2 | Accepted | Phase 2 | Model/Product |
| **KL-16** | **Re-identifiability of the diversity-tailored micro-cohort (P1)** — small tail-recruited cohort + demographics ⇒ "anonymized" data is re-identifiable; treat as identified special-category data. | Sec P1 | P1 | Accepted | Ongoing | Product/Operations |
| **KL-17** | **DX-08 — Option D bodyweight-keyed seeding (shipped)** — bodyweight-keyed strength-standard table + prior generator (capped experience modifier, downward bias, floor/ceiling clamp, confidence cap 25) **replaced** the 3-bucket seed; `bodyweight_kg` (DX-07) is now keyed. *Shipped 2026-06-12 — `reviews/completion/DX-08_COMPLETION_REPORT.md`.* | Delta Plan DX-08; DX-07 | P1 | Closed ✅ | — | Model ✅ / Backend ✅ |
| **KL-18** | **DX-10 — sticky exercise preference** — an accepted replacement now becomes a persistent preference (Product Spec Principle 6): chosen family **set** to `PREFERENCE_STICKY` (100), displaced **demoted** to default (50) ⇒ deterministic/durable argmax, most-recent-wins. *Resolved 2026-06-12: replaces the bounded `PREFERENCE_NUDGE` (±5); `reviews/completion/DX-10_COMPLETION_REPORT.md`; suite 165→169, one golden re-gold, no schema change.* | Delta Plan DX-10; Product Spec §2/§6 | P1 | Closed ✅ | — | Model/Backend |
| **KL-19** | **DX-12 — Phase-0 instrumentation/gate repoint** — keep trend primitives + score-estimate calibration; reframe the load-prediction (shadow/convergence/recoverability) metrics off the old success basis (now stagnation/program — DX-14). *Resolved 2026-06-12: validation-only reframe — `gate.evaluate()` gates on a named `criteria={stability, estimate_recovery}` (boolean-identical verdict, no re-gold); A8 `shadow_paired` + A1 `fresh_state_check` reframed into directional diagnostics (reported, not gated); criterion (b) M5 detector cited to DX-09/`test_sprint6`. `reviews/completion/DX-12_COMPLETION_REPORT.md`; suite 169→172, +3 additive, no schema/constant/model change.* | Delta Plan DX-12; DX-14 | P1 | Closed ✅ | — | Model/Backend |

---

## 6. Maintained invariants — do not regress (not open items)

Recorded so they are not mistaken for unfinished work; these are **healthy and must be preserved**:
- **Apple Health never enters the learning loop** (Mobile §9.1; Sec H1).
- **Parameterized SQL throughout** the existing code (Sec S8).
- **No third-party analytics / ad / tracking SDKs; no "sale" of data** (Mobile §10; Sec §11).
- **Single source of truth for model constants** (`constants.py`); **audit chain version-stamped**.
- **`constants.py` unchanged — no parameter adopted** (parameter-adoption review, RATIFIED no-adoption).

---

## 7. Cross-cutting threads (for planning, not new items)

- **Idempotency** recurs as one mechanism with three payoffs: data integrity (BB-1), support-ticket
  tracing (BB-28), and anti-replay (BB-19/BL-1). Highest-leverage single build item regardless of OD-1.
- **OD-1 (D1)** gates BB-9 (connection model), the crash-recovery posture, and BB-15 (app build) —
  decide first.
- **Backups (BB-3) + encryption-at-rest (BB-21)** gate safe mid-beta migrations (BB-5) and the
  no-rollback debt (ATD-14). *The backup→migrate→verify mechanism is now code (`app/migrate.py`,
  BB-5 tranche) and structurally enforces "no migration without a fresh backup"; only off-box/encrypted
  storage (BB-21) and the live-env run (BB-30) remain.*
- **Consent (BB-33) + erasure (OD-2) + retention (BB-35)** must close together before any EU/CA
  participant. *OD-2 ratified + the server erasure mechanism is built; BB-33 enrollment/consent + BB-35
  retention remain (Product/Operations), and the Operations erasure complement = deleting the external
  enrollment/consent record alongside the server `erase_athlete` call.*
- **The A7 gate (BB-11)** is the Phase-1 hard gate; **armed 2026-06-12** (OD-8 thresholds ratified). Its
  abort path ("stop and re-anchor ES-008 v2") is the only sanctioned response to unsafe seeds —
  **never** field-tune parameters (KL-9, reaffirmed by OD-8).

---

*Consolidation only — no new findings, no new decisions. This registry is the canonical index of
unresolved work; resolving an item requires updating both this document and its source. For the frozen
model start at `HUSH_V1_EXECUTION_CONTEXT.md`; for status `HUSH_V1_PROJECT_STATUS.md`; for rule origins
`HUSH_V1_TRACEABILITY.md`.*
