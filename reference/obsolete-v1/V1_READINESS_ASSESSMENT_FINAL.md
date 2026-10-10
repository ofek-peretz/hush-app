# V1_READINESS_ASSESSMENT_FINAL — Hush v1

> **Official baseline assessment of Hush v1 as of 2026-06-12.** This is the **last periodic status
> document**. From here, work on this repo is justified only by: (1) real work on an open area
> (Mobile / Infrastructure / Compliance), (2) a newly identified real gap with product impact, or
> (3) a focused review with a concrete reason. Absent those, the state captured here is the baseline.
>
> Model: Hush v1 (frozen, advisory — Hush recommends, the athlete decides) · Schema: **v11** ·
> Tests: **284 passing** (model golden runner 189 + API pytest 95) ·
> Single gate: `python build/_verify/assemble_and_test.py`.
>
> Sources: `CURRENT_STATUS.md`, `docs/canonical/HUSH_V1_PROJECT_STATUS.md` (+ canonical set),
> `deploy/`, and `reviews/completion/*`. Where this disagrees with the canonical status, the canonical
> document governs. Governing rule respected: *no redesign without explicit model review.*

---

## 1. Closed (100%) — built, tested, on-host

**The full frozen model**
- Sprints 0–4 + Wave 1 (migration runner, drift guard, as-built docs).
- DX-01/02/05/06/19/20 (M1): `actual_weight` is a learning input; programs from learned `target_load`.
- DX-03 (governor advisory) · DX-04 (exploration off) · DX-07 (bodyweight, schema v7) ·
  DX-08 (Option D bodyweight-keyed seeding; D1 strength-standard table folded in) · DX-10 (sticky
  preference) · DX-11 (event-driven runtime + `session_progress`, schema v8) · DX-12 (instrumentation
  repoint).

**All 7 core engines**
- The seven engines (ES-001…ES-012 spine) implemented and golden-tested. ES-013 active-investigation
  engine **retired** → detection = **M5 stagnation** (DX-09: read-only, advisory; schema v9).

**Full backend service (Wave-2, additive over the frozen model)**
- BB-13 assembled `pytest`-green tree (not per-sprint snapshots) · BB-9 connection model ·
  BB-14 full API contract (§4) · BB-19/20/24 auth · BB-8 bounds · BB-4/6/7 stamping / authoritative
  server clock / override · BB-10 A8 shadow · BB-12 audit reconstruct · BB-23/25 operator provisioning ·
  BB-31 pinned deps + Dockerfile.
- **Live validation instruments** (A8 shadow, A9 override, A1 fresh-state, A3 costly-case) wired into
  the request path — instrumented from session one.

**Durability (idempotency / atomicity / migrations)**
- BB-1 idempotency (replayed set report is a verified no-op) · BB-2 transactional atomicity /
  single-writer chokepoint · BB-5/BB-3 production-migration runner (schema v10 → v11).

**A7 — ARMED**
- BB-11 `GET /internal/gate/a7`: per-cohort SAFE/UNSAFE/INSUFFICIENT + overall
  PROCEED/PAUSE_AND_REANCHOR. OD-8 thresholds ratified (first-rep-failure 0.0, completion 0.80,
  min cohort n=5) ⇒ `armed: true`.

**OD-2 erasure**
- `erase_athlete` + `POST /internal/athletes/{id}/erase` + migration_011 `erasure_record` (schema v11);
  logical anonymization, audit chain preserved (no destructive deletion).

**Observability (server half)**
- BB-28 `app/observability.py`: pure-ASGI correlation-id middleware (inbound validated against
  log-injection; echoed `X-Correlation-Id`) + one allowlisted JSON access line per request; no-sensitive-
  values enforced structurally (no body/header/token/health path).
- BB-22 operator-access audit logging (granted/denied; key never logged).

**Operator tooling**
- `GET /internal/metrics` (BB-32 validation export — trial health + A7/A8/A9 evidence, operator-key) ·
  internal state + audit reconstruct endpoints behind the operator key · BB-16 seed-coverage gate +
  BB-17 equipment→catalog coverage (V1 gym-based; barbell covers all 5 Class-A capabilities,
  regression-locked).

**Ops-prep (on-host artifacts, ready to deploy)**
- BB-30 `DEPLOYMENT_ARCHITECTURE_V1.md` + `deploy/{.env.example, ingress/Caddyfile.example,
  entrypoint.sh, compose.staging.yaml}` · BB-21 `DATA_PROTECTION_AT_REST_V1.md` +
  `deploy/backup/encrypted_backup.sh` · BB-29 `INCIDENT_RUNBOOK_V1.md` · ATD-17 `SCHEMA_REFERENCE_V1.md`
  · ATD-19 `VERSIONING_POLICY_V1.md`.

**Pre-deploy validation tooling (executable, validated on-host)**
- BB-15 `deploy/export_openapi.py` → `deploy/openapi.json` (16 paths, schema-stamped, `--check` drift
  gate) · BB-14/30 `deploy/smoke_test.py` (stdlib-only full-lifecycle HTTP smoke; `--self` boots/tears-
  down the assembled app; green) · BB-31 `deploy/sca_audit.py` (pip-audit over the pinned closure) +
  `.github/workflows/ci.yml` (assemble → gate → openapi-drift → SCA + `--self` smoke) ·
  BB-27 `python -m app.ops_monitor` (A7-gate watcher; exit 0/1/2; dependency-free).

---

## 2. Partial

| Item | Built on-host | Missing for "done" |
|---|---|---|
| **Backup / restore** | Mechanism (BB-3/5) + encrypted-backup script (BB-21) + restore runbook (BB-29) | **No live run** — off-box bucket, scheduler, and a real tested restore against the deployed DB |
| **Observability** | Server correlation-id + structured access log (BB-28) | **Log shipping / alerting** to a named on-call; client-side logging (Mobile) |
| **A7** | Armed mechanism (BB-11) + watcher CLI (BB-27) | **Staffing + operations** — named reviewer, alert delivery, executed pause/re-anchor on live cohort data |
| **OD-3** (email magic-link recovery) | Decision ratified | **Implementation deferred** — bundled with enrollment/consent/email workstream (BB-33 + BB-30 + BB-37) |

---

## 3. Open

**Mobile**
- **BB-15** iOS app — 6 screens + onboarding + "why this weight?" view.
- **BB-26** iOS Data Protection + Keychain (per-athlete bearer token in Keychain, never the bundle).

**Operations infrastructure** — see §6 (External Dependencies).

**Compliance**
- **BB-33** enrollment + consent pipeline · **BB-34** App Store privacy labels · **BB-35** DPIA /
  retention policy · **BB-36** privacy nutrition / data-use disclosures · **BB-37** support + recovery
  (carries the deferred OD-3 build).

---

## 4. Beta Blockers (100-user Phase 1)

All are **off-host** — none is a code task in this repo. The on-host blockers from the 2026-06-10 Beta
Readiness Review (idempotency, atomicity, live instruments, version stamping, operator tooling, A7
armed mechanism, backup mechanism) are **closed**.

1. **Production / staging environment** — cloud host/runtime, DNS, issued TLS cert, secrets-manager
   instance, encrypted `/data` volume, firewall on `/internal/*`.
2. **Backups + restore, live** — off-box bucket + scheduler + a real tested restore against the
   deployed DB.
3. **Enrollment + consent pipeline** — per-athlete token provisioning + informed consent (incl. any
   optional RIR research subset).
4. **Account recovery** — the deferred OD-3 path; a reinstall/device-change must not equal a lost athlete.
5. **On-call** — pager + rota wired to the incident runbook, including A7-gate alert delivery (BB-27).
6. **The iOS app** — built and dress-rehearsed end-to-end on the real stack (start → workout → sync →
   audit reconstructs → metrics populate).

---

## 5. Production Blockers (beyond Beta)

Production = graduating past the gated 100-user trial. In addition to **everything in §4**:

**Blocks Production**
- **A7 on real data** — the week-1 gate must read **PROCEED** on real cohort data. A PAUSE forces a
  model review to re-anchor ES-008 v2 (a model-review act, never a field patch).
- **Parameter adoption** — κ, τ (systemic + per-capability), σ²_ref, decision gate/deadband,
  PREFERENCE_NUDGE, SESSION_FATIGUE_CEILING, P_EXPLORE are currently **UNADOPTED**; adoption is an
  explicit model-review act.
- **Full operational readiness** — alerting + integrity-violation monitoring exercised over the beta;
  proven backup/restore cadence; real on-call rotation.
- **Full compliance** — DPIA, retention policy, and App Store privacy labels approved (BB-34/35/36).

**Explicitly does NOT block Production**
- **Scale** — 100 users, sub-ms learning, single SQLite is comfortable; building scaling infrastructure
  is an anti-requirement.
- **Model changes / parameter tuning to fit field data** — out of scope by rule; field surprises are
  logged for a later model review, never tuned live.
- **Non-gym equipment** — home/dumbbell-/machine-/bodyweight-only is OUT OF SCOPE (V1 is gym-based);
  no catalog-expansion or equipment-aware work is owed.

---

## 6. External Dependencies (cannot be done from this repo)

All Operations INFRA — to be escalated/procured. The deploy templates, runbooks, and tooling that
target this infrastructure are all built (§1):

- Cloud host / container runtime.
- DNS + an **issued** TLS certificate.
- Secrets-manager **instance** (operator key + per-athlete tokens).
- Encrypted `/data` volume.
- Firewall rules restricting `/internal/*`.
- Off-box **encrypted backup bucket** + scheduler.
- **Pager integration** + on-call rota + BB-27 alert delivery.
- The **live runs** of BB-3 / BB-5 / BB-28 against the deployed environment.

---

## 7. Product / Compliance Decisions Still Required

- **OD-3 implementation** — email magic-link recovery: decision ratified, build deferred; must be
  scheduled with the enrollment/consent/email workstream (BB-37) before beta.
- **OD-5 / OD-6 / OD-7 / OD-9 / OD-10** — client-side decisions, open; needed before/while the iOS app
  is built.
- **Consent scope** — informed consent covering training + health data and the trial's research-adjacent
  nature, including any optional RIR research subset (BB-33).
- **DPIA / data-retention policy** (BB-35).
- **Privacy label** — App Store privacy labels + data-use disclosures (BB-34/36).
- **Open assumptions** — A1–A18 remain field-pending; none is a code gate, but each is a validation
  question the beta exists to answer.

---

## Baseline declaration

As of **2026-06-12**, the on-host model + backend + operations-prep surface of Hush v1 is **complete and
verified** (schema v11, 284 tests, single gate green). This is the **official baseline**. Remaining work
is **Mobile**, **Infrastructure**, and **Compliance** — the off-host half — plus the field validation the
beta is designed to produce. No further periodic status summaries are warranted: the next entry in this
repo should be actual work in one of those three areas, a newly identified real gap, or a focused review
with a concrete reason.
