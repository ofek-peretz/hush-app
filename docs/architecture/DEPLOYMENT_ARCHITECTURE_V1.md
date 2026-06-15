# DEPLOYMENT_ARCHITECTURE_V1.md — Production Topology, Environment Model & Deploy Runbook (BB-30)

> **What this document is.** The deployment-of-record for Hush v1: production/staging topology, the
> environment model, the **complete environment-variable + secrets contract**, the TLS assumptions,
> the `/internal/*` network-restriction posture, and the **step-by-step deploy / migrate / verify /
> smoke runbook**. It is the on-host preparation for **BB-30** (deployed env, TLS, secrets) — everything
> that can be specified before a real cloud account, DNS zone, or certificate exists. It composes the
> already-built mechanisms (`app/migrate.py`, `app/observability.py`, `app/ops_monitor.py`,
> `deploy/Dockerfile`) into an operational procedure; it builds **no new model behavior** and changes
> **no** number, formula, schema, or decision. Governing rule: *no redesign without explicit model
> review.*
>
> Date: 2026-06-12 · Build: Wave-2 backend ✅ (schema **v11**, suite **281+** = model golden 189 +
> API pytest 92+). Source-of-truth anchors: `SERVER_BUILD_PLAN_V1.md` §11 (topology), §4 (auth),
> §14 (toggle points); `SERVER_ARCHITECTURE_ASBUILT_V1.md` (as-built); `deploy/Dockerfile`;
> `deploy/README.md`.
>
> **What still needs real infrastructure (escalate — NOT code-completable on this host):** the cloud
> account / VM / managed runtime, the DNS zone + issued TLS certificate, the secrets-manager instance,
> the encrypted volume, the firewall/security-group rules, and the off-box backup bucket. This document
> specifies the *shape* of each so that standing them up is mechanical, not a design exercise. Items that
> are genuinely a **product/compliance** decision (enrollment, consent, email delivery — BB-33/OD-3) are
> out of scope here and called out where they intersect.

---

## 1. Architecture in one paragraph

Hush v1 is **one deployable** (the FastAPI web shell `app/` wrapping the frozen `hush_model/`), **one
SQLite database** (WAL mode), **single process / one write worker**, synchronous request handlers. TLS
terminates at an **ingress / reverse proxy** in front of the app; the app speaks plain HTTP on the
internal network only. WAL gives concurrent readers; a process-level lock serializes the single writer
(BB-9 / ES-007). There is **no microservice, no queue, no second datastore, no horizontal write scale** —
that is the frozen v1 architecture (build plan §11; out-of-scope items are Future/Cloud, BL-1). You
scale **readers**, never writers. The deployable is a **generated artifact** — the Docker image pins the
assembled tree produced by `build/_verify/assemble_and_test.py`, which must be green first (BB-31
provenance).

---

## 2. Production topology

```
                         Internet (athlete devices, TLS 1.2+)
                                      │
                                      ▼
            ┌──────────────────────────────────────────────────────────────┐
            │  INGRESS / reverse proxy  (TLS termination, HSTS, timeouts)    │
            │   • public listener :443  →  athlete API (the §4 contract)     │
            │   • /internal/*  NOT exposed publicly  (network-restricted)    │
            └───────────────┬───────────────────────────────┬──────────────┘
                            │ plain HTTP :8000 (private net) │
                            ▼                                 ▼ (bastion / VPN / private subnet only)
            ┌──────────────────────────────────────────────────────────────┐
            │  HUSH SERVICE  (one container/process: uvicorn, --workers 1)   │
            │   app/ (web shell)  →  hush_model/ (frozen)  →  persistence    │
            │   connection-per-request (WAL readers) + serialized writer     │
            │   secrets injected as env at start: OPERATOR_KEY, TOKEN_PEPPER │
            └───────────────┬──────────────────────────────────────────────┘
                            │ file I/O
                            ▼
            ┌──────────────────────────────────────────────────────────────┐
            │  ENCRYPTED-AT-REST VOLUME  /data/hush.db (+ -wal, -shm)        │  (BB-21)
            └───────────────┬───────────────────────────────┬──────────────┘
                            │ scheduled WAL-aware backups    │ A7 gate + health monitor
                            ▼ encrypted, off-box (BB-3/21)   ▼ ops_monitor → pager (BB-27/29)
                     backup bucket (versioned)        on-call alerting
```

**Two environments, one shape (BB-30):**

| | **staging** | **prod** |
|---|---|---|
| Purpose | dress-rehearsal, migration rehearsal, contract test | the ~100-athlete TestFlight cohort |
| Topology | identical (ingress + 1 service + 1 SQLite/WAL on encrypted vol) | identical |
| Data | synthetic / seeded only — **never** real athlete data | real special-category health data |
| Secrets | a **separate** operator key + token pepper (never shared with prod) | prod-only secrets |
| TLS | a staging cert (may be a short-lived/ACME cert) | a prod cert, auto-renewed |
| Backups | optional, unencrypted ok (no real data) | **mandatory**, encrypted, off-box, tested-restore |

Staging exists so that **every** prod change — image, migration, config — is exercised against an
identical-shaped environment first (build order Step 1; the migration rehearsal in §6).

---

## 3. The environment-variable & configuration contract

Every knob the service reads, where it comes from, and its production handling. This is the **single
source of truth** for what to put in the secrets manager vs. plain config. (Verified against
`app_main.py`, `auth.py`, `deps.py`, `connection.py`, `migrate.py`, `ops_monitor.py`.)

| Variable | Consumed by | Meaning | Prod source | Secret? |
|---|---|---|---|---|
| `HUSH_DB_PATH` | `app_main`, `deps`, `migrate` | path to the SQLite DB file | plain config → `/data/hush.db` (the encrypted volume) | no |
| `HUSH_OPERATOR_KEY` | `app_main`/`deps`, `ops_monitor` | the key gating the entire `/internal/*` operator surface | **secrets manager** → injected as env at start | **YES** |
| `TOKEN_PEPPER` | `auth.hash_token` | server-side pepper mixed into every athlete-token hash; a DB-only leak cannot forge tokens without it | **secrets manager** → injected as env at start | **YES** |
| `HUSH_AUTOCREATE_APP` | `app_main` | `1` = build the module-level app at import (dev/uvicorn); set `0` for tests/factory | plain config → `1` in the image, but prod migrates explicitly first (§6) | no |
| `HUSH_BASE_URL` | `ops_monitor` | base URL the ops monitor polls | plain config on the monitor host → the private service URL | no |

**Rules.**
- **Secrets are injected as environment variables at process start from the secrets manager** — never
  baked into the image, never written to the repo, never committed, never logged. The operator key is
  audited at use (BB-22, `operator_access` line) but its *value* never appears in any log
  (`observability` allowlist + the BB-22 tests assert this).
- **`HUSH_OPERATOR_KEY` and `TOKEN_PEPPER` must differ between staging and prod.** A staging key must
  never authenticate against prod.
- **`TOKEN_PEPPER` is set once at first deploy and is effectively immutable** — rotating it invalidates
  every existing athlete token (every athlete must be re-provisioned). Treat a pepper change as a fleet
  re-enrollment event, not a routine rotation. (The operator key, by contrast, rotates freely — see §5.)
- **`HUSH_OPERATOR_KEY` and `TOKEN_PEPPER` must be high-entropy** (≥ 256-bit random, e.g.
  `python -c "import secrets; print(secrets.token_urlsafe(32))"`).

`deploy/.env.example` documents this contract as a fill-in template (commit the example, never a filled
`.env`).

---

## 4. TLS assumptions

- **TLS terminates at the ingress / reverse proxy** (build plan §11); the Hush app process speaks plain
  HTTP **only on the private network** behind it and is never bound to a public interface. The app
  intentionally has no TLS code — termination is an infrastructure concern, swappable without touching
  the deployable.
- **TLS 1.2+ everywhere** for athlete traffic (contract §1 / ATS). The athlete token is a bearer secret;
  it must only ever travel over TLS and never appears in a URL or a log (BB-20/28 — enforced server-side
  by the access-log allowlist).
- **HSTS** on the public listener; redirect `:80 → :443` (or refuse `:80`).
- **Certificate issuance/renewal is infrastructure** (ACME/managed cert). On-host we can only state the
  requirement: a valid cert for the prod hostname, auto-renewed, alerting on < 21 days to expiry.
- **Certificate pinning** is explicitly a *Before Launch* consideration (BL-2), **not** a beta gate —
  recorded so it is not mistaken for missing beta work.
- `deploy/ingress/Caddyfile.example` is a concrete, minimal termination config (TLS + HSTS + the
  `/internal/*` deny rule of §5). Caddy is one reference; any proxy (nginx, Traefik, a cloud L7 LB)
  satisfies the same three requirements.

---

## 5. Secrets flow & the `/internal/*` restriction (intersects BB-22)

**Secrets flow (BB-22 — operator key in a secrets manager):**

```
secrets manager  ──(at process start, as env)──►  HUSH_OPERATOR_KEY, TOKEN_PEPPER  ──►  service
        ▲                                                                                  │
        │ rotation (operator key): mint new → update manager → restart service             │
        └──────────────────────────────────────────────────────────────────────────────────┘
   • operator key:  rotatable any time (a restart picks up the new value); no athlete impact.
   • token pepper:  set-once / immutable in practice (rotation = fleet re-provision, §3).
```

- The operator key lives in a **secrets manager** (cloud secrets manager, Vault, or — minimally — a
  root-only file injected as env by the orchestrator). It is **never** in the image, repo, or env-file
  committed to git.
- **Operator access is audited (BB-22, built):** every `/internal/*` call emits one structured
  `operator_access` line — `outcome=granted|denied`, the route **template**, the method — at INFO when
  granted and **WARNING when denied** (the brute-force / misconfiguration signal the pager watches). The
  key value is never in the line. (`deps.require_operator`; tests in `test_api_observability.py`.)

**`/internal/*` network restriction (BB-22):** the operator surface must be **unreachable from the public
internet**. Three enforcement layers, in order of preference:

1. **Network (primary):** the ingress does not route `/internal/*` from the public listener at all; the
   operator surface is reachable only from a private subnet / VPN / bastion (the `Caddyfile.example`
   `/internal/*` block returns 404 on the public listener; operators reach it over the private network).
2. **Auth (always on):** the operator key gates every `/internal/*` route regardless of network position
   (defense in depth — a network misconfig still fails closed).
3. **Audit (always on):** the `operator_access` WARNING line on every denial.

> The athlete bearer token has **no code path** to `/internal/*` (separate scope, contract §16A) — this
> is structural, not a config rule.

---

## 6. The deploy / migrate / verify / smoke runbook

The deployable is a **generated artifact**. The golden rule: **assemble + test green → build image →
deploy to staging → migrate(staging) → verify → smoke → repeat on prod**, and **never migrate a real DB
without a fresh, tested backup** (enforced in code by `migrate_production`, not by discipline).

### 6.0 Pre-flight (once per release)
```
python build/_verify/assemble_and_test.py        # MUST be green: model golden 189 + API pytest
docker build -f deploy/Dockerfile -t hush:<gitsha> .   # pin the assembled tree as the build-of-record
```
The image tag is the build-of-record (BB-31 provenance). The same image is promoted staging → prod; you
never rebuild between environments.

### 6.1 Deploy to **staging** and rehearse the migration
```
# 1. Drain: stop the old staging service (single writer → no concurrent migration).
# 2. Backup-gated forward migration against the staging DB (rehearses prod faithfully — SQLite at every tier):
python -m app.migrate --db "$HUSH_DB_PATH" --backup-dir /backups/staging
#    → takes a fresh integrity-checked backup FIRST, refuses if it can't, runs the ordered chain,
#      asserts schema_version == head (v11) + foreign_key_check + shape parity.
# 3. Start the new image. init_database brings a fresh DB to head; an existing DB was already migrated above.
# 4. Smoke (see 6.3). 5. Run the cross-tier contract test against staging (build plan §12).
```

### 6.2 Promote to **prod** (the same image, the same procedure)
```
# 0. Confirm the off-box encrypted backup of prod is current (BB-21 schedule) AND restore-tested recently.
# 1. Drain prod (maintenance window — single writer).
# 2. The ONE sanctioned production migration (refuses without a fresh backup — runbook rule in code):
python -m app.migrate --db "$HUSH_DB_PATH" --backup-dir /backups/prod
#    On a FAILED verify it does NOT auto-rollback (forward-only, no down-migration, MG3):
#    restore the reported backup with restore_database and investigate (INCIDENT_RUNBOOK_V1 §3).
# 3. Start the new image (same gitsha that passed staging).
# 4. Smoke (6.3). 5. Re-arm the ops monitor against prod (6.4).
```

### 6.3 Smoke test (every environment, every deploy)
```
GET  /health                       → 200, {"status":"ok","schema_version":11}
python -m app.migrate --db "$HUSH_DB_PATH" --verify-only   → all checks PASS, schema_version head == 11
POST /internal/athletes (staging only, synthetic) → 200 with a token; then one POST /sessions + /sets round-trip
GET  /internal/metrics  (operator key)  → 200 (read-only export; empty trial = expected pre-cohort)
# wrong operator key → 401 AND a `denied` operator_access WARNING line is emitted (BB-22)
```

### 6.4 Arm monitoring (BB-27 — already built, just point it)
```
*/5 * * * *  HUSH_OPERATOR_KEY=<key> python -m app.ops_monitor --base-url https://hush.internal \
              --expect-data --json >> /var/log/hush/ops_monitor.jsonl 2>&1 || notify-pager
```
Exit 0/1/2 = OK/WARN/CRITICAL; the A7 hard stop, an unreachable service, and a denied operator key are
all CRITICAL. Wire the exit code and the `hush.ops` JSON line into the pager (incident runbook BB-29).

---

## 7. What is prepared here vs. what needs real infrastructure

**Prepared on-host (this tranche):** the topology, the env/secrets contract (`§3` + `.env.example`),
the TLS posture (`§4` + `Caddyfile.example`), the secrets flow + `/internal/*` restriction (`§5`, with
the operator-access audit **built** in code), the deploy/migrate/verify/smoke runbook (`§6`), a
staging-shaped local `compose.staging.yaml`, and a prod-shaped `entrypoint.sh` that runs the
backup-gated migration before starting the service.

**Needs real infrastructure (escalate — recorded, not built):**
- a cloud account / host / managed runtime for staging + prod;
- a DNS zone and an **issued, auto-renewing TLS certificate** for the prod hostname;
- a **secrets-manager instance** holding `HUSH_OPERATOR_KEY` + `TOKEN_PEPPER` (separate per env);
- an **encrypted-at-rest volume** for `/data` (BB-21) and an **off-box encrypted backup bucket** (BB-3/21);
- firewall / security-group rules realizing the `/internal/*` private-only restriction (BB-22);
- the **pager integration** the ops monitor's exit code feeds (BB-27).

**Out of scope here (product/compliance):** enrollment, consent, the physical-risk waiver, and email
delivery (BB-33 / OD-3) — the operator `POST /internal/athletes` provisioning path exists, but *who* is
allowed to be enrolled and *what they consented to* is the consent workstream, not deployment.

---

*Deployment-of-record only — it composes built mechanisms into a procedure and decides no model
behavior. For the as-built code see `SERVER_ARCHITECTURE_ASBUILT_V1.md`; for migrations
`MIGRATION_RUNBOOK_V1.md`; for at-rest protection `DATA_PROTECTION_AT_REST_V1.md` (BB-21); for incidents
`INCIDENT_RUNBOOK_V1.md` (BB-29); for the open-items registry `docs/canonical/HUSH_V1_OPEN_ITEMS.md`.*
