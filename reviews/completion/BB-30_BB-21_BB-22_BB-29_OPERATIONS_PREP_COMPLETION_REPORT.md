# Operations Before-Beta Preparation — Completion Report (BB-30 / BB-21 / BB-22 / BB-29 + ATD-17/19)

> **Tranche:** the on-host preparation of the four Operations before-beta items, plus two adjacent
> documentation debts closed along the way. The goal was the stated one: get everything that can be
> prepared toward beta **from within the development environment** closed, so that moving to real
> infrastructure and mobile holds as few surprises as possible. Where an item required real cloud infra,
> a TLS certificate, a secrets-manager instance, a product/compliance decision, or an iOS toolchain, the
> work **stops at the on-host boundary and is reported**, not invented.
>
> Date: 2026-06-12 · Gate: `python build/_verify/assemble_and_test.py` — model golden **189/189** + API
> pytest **95** (was 92; **+3** BB-22 operator-access tests) · schema **v11** (unchanged) · `constants.py`
> unchanged (no parameter adopted) · **no model number/formula/schema/decision changed.**

---

## 1. What shipped

### BB-30 — deployment architecture (Architecture Closed ✅; infra Open)
- `docs/architecture/DEPLOYMENT_ARCHITECTURE_V1.md` — prod/staging topology, the **complete env-var +
  secrets contract** (`HUSH_DB_PATH`, `HUSH_OPERATOR_KEY`, `TOKEN_PEPPER`, `HUSH_AUTOCREATE_APP`,
  `HUSH_BASE_URL` — which are secret, which differ per env, pepper set-once semantics), TLS assumptions
  (terminate at ingress; TLS 1.2+; HSTS; pinning = BL-2 not a beta gate), the secrets flow + `/internal/*`
  network restriction, and the **deploy/migrate/verify/smoke runbook** wired to the built mechanisms.
- Config templates: `deploy/.env.example`, `deploy/ingress/Caddyfile.example` (TLS termination + a public
  `/internal/*` deny), `deploy/entrypoint.sh` (backup-gated migrate → serve), `deploy/compose.staging.yaml`
  (a staging-shaped local stack: ingress + one service + one WAL volume).

### BB-21 — encryption at rest + encrypted backups (Prep Closed ✅; infra Open)
- `docs/architecture/DATA_PROTECTION_AT_REST_V1.md` — the **volume-encryption** decision (transparent to
  the frozen single-process SQLite model; no app crypto, no schema/model change), the **encrypted off-box
  backup** strategy layered on the built `backup_database` (recipient-key encryption so the backup host
  holds only the public key; off-box + versioned + least-privilege), a first explicit **retention policy**
  (with the backups-vs-erasure SLA flagged for BB-35), and the **restore drill** (with RPO/RTO targets).
- `deploy/backup/encrypted_backup.sh` — the wrapper: built WAL-safe snapshot → `age`/`gpg` envelope →
  `.sha256` manifest → plaintext shred → off-box upload hook. Encryption tool is an Ops dependency (kept
  out of the pinned Python set, BB-31).

### BB-22 — operator-access logging (Logging Closed ✅, code; secrets-mgr/network = Ops)
- **Code (tested):** `deps.require_operator` now uses a **constant-time** key comparison and emits one
  structured `operator_access` audit line per `/internal/*` call — `outcome=granted|denied`, route
  template, method — at INFO when granted and **WARNING on denial** (the brute-force/misconfig signal the
  pager watches). The operator key value never reaches the log (asserted). `test_api_observability.py` +3
  tests (granted-audited, denied-audited-at-WARNING, key-never-in-logs).
- Secrets-manager flow + `/internal/*` private-only restriction specified in DEPLOYMENT §5 / the Caddyfile.

### BB-29 — incident runbook + staged rollout (Playbook Closed ✅; on-call wiring = Ops)
- `docs/architecture/INCIDENT_RUNBOOK_V1.md` — severity/escalation, the staged rollout (internal → small →
  full 100, A7 as the hard gate at each stage), and concrete runbooks: bad-deploy rollback, bad-migration/
  corruption restore, the **A7 hard stop → pause-the-trial + re-anchor** (never field-tune — KL-9/OD-8),
  operator-key compromise, and the backups-unrecoverable disaster; + a pre-beta rehearsal checklist.

### Adjacent debt closed
- **ATD-17** → `docs/architecture/SCHEMA_REFERENCE_V1.md` (v11 ER overview + per-table columns by zone).
- **ATD-19** → `docs/architecture/VERSIONING_POLICY_V1.md` (when to bump MODEL/CAPABILITY/CATALOG/SCHEMA).

---

## 2. The one code change, in detail (BB-22)

`implementation/api/deps.py::require_operator` — additive, outside the model package:
- was `key != settings.operator_key` → now `hmac.compare_digest(...)` (constant-time; small at-rest
  hardening, behavior-identical on the grant/deny decision);
- emits `observability.log_event("operator_access", level=INFO|WARNING, route=<template>, method, outcome)`
  before the grant/deny branch, so **both** outcomes are audited;
- the route field uses the route **template** (or the scope path fallback), consistent with the BB-28
  no-concrete-id-in-logs rule; the key is never a field.

No router, schema, migration, or model file changed. The new `operator_access` event is a distinct event
name, so the existing `http_access` allowlist tests are unaffected (verified — 15/15 observability tests,
full suite green).

---

## 3. Boundary — what is reported, not built (needs real infra / decisions)

- **Infra (escalate):** cloud host/runtime for staging+prod; DNS + an issued, auto-renewing TLS cert;
  a secrets-manager instance holding `HUSH_OPERATOR_KEY` + `TOKEN_PEPPER` (separate per env); an encrypted
  `/data` volume; firewall/security-group rules for the `/internal/*` private-only restriction; an off-box
  versioned least-privilege backup bucket + the backup scheduler; the pager integration the ops monitor
  feeds; the named on-call rota + maintenance-window mechanism.
- **Compliance decision (BB-35):** ratify the backup retention windows + the backups-vs-erasure SLA in the
  privacy/retention notice.
- **Consent (BB-33):** the cohort-contact channel the incident runbook's §5 depends on.
- **Mobile (unchanged):** BB-15/26, OD-5/6/7/9 client decisions.

These are exactly the items that are not code-completable on this host; the prepared docs make each one a
mechanical stand-up rather than a design exercise.

---

## 4. Verification

- `python build/_verify/assemble_and_test.py` → **model 189/189 + API pytest rc=0 → PASS** (API suite 92→95).
- `python -m pytest build/_assembled/tests/test_api_observability.py` → **15 passed** (12 + 3 new).
- Schema unchanged (v11); `constants.py` unchanged; no golden re-baseline (no model change).

---

*Composition + documentation only — it wires already-built mechanisms into operational procedure and adds
one tested, additive backend audit line. It changes no model behavior. Registry updated:
`docs/canonical/HUSH_V1_OPEN_ITEMS.md` (BB-21/22/29/30, ATD-17/19). For the new docs see
`docs/architecture/{DEPLOYMENT_ARCHITECTURE,DATA_PROTECTION_AT_REST,INCIDENT_RUNBOOK,SCHEMA_REFERENCE,VERSIONING_POLICY}_V1.md`.*
