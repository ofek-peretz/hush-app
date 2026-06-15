# INCIDENT_RUNBOOK_V1.md — Incident Response, Rollback, Recovery & Staged Rollout (BB-29)

> **What this document is.** The operational playbook for the Hush v1 beta: severity definitions and
> escalation, the **staged rollout** plan, and concrete **runbooks** for the incidents that can actually
> happen to this system — a bad deploy (rollback), data corruption (restore), the **A7 hard stop**
> (pause-the-trial + re-anchor), an operator-key compromise, and a backups-broken disaster. It is the
> on-host preparation for **BB-29**; it composes already-built mechanisms (`app/migrate.py`,
> `app/ops_monitor.py`, `app/a7_gate.py`, `auth.revoke_token`, `service.erase_athlete`) into procedures.
> It decides **no** model behavior. Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-12 · Anchors: `DEPLOYMENT_ARCHITECTURE_V1.md` (topology/deploy), `DATA_PROTECTION_AT_REST_V1.md`
> (backups/restore), `MIGRATION_RUNBOOK_V1.md` (migration discipline), `app/ops_monitor.py` (the watcher),
> `reviews/completion/BB-11_A7_GATE_ARMED_COMPLETION_REPORT.md` (the hard gate). Sources: Beta §9.3/§9.4.
>
> **Needs Operations to operationalize (escalate):** the named on-call rota, the pager integration, the
> out-of-band cohort-contact channel, and the maintenance-window mechanism. This runbook specifies the
> *procedures*; wiring them to people + tools is the Operations step. The **cohort-contact channel itself
> intersects the consent/enrollment workstream (BB-33)** — you cannot contact athletes you have no
> consented channel for.

---

## 1. Severity & escalation

| Sev | Definition | Examples | Response |
|---|---|---|---|
| **SEV-1** | Athlete-safety or data-integrity risk; or the trial's validity is threatened | A7 gate → `PAUSE_AND_REANCHOR`; DB corruption; a bad migration; backups unrecoverable; operator-key compromise | Page on-call **now**; halt the relevant flow; follow the specific runbook below |
| **SEV-2** | Service degraded/down but no data/safety risk | Service unreachable; elevated 5xx/latency; cert near expiry | Page on-call; restore service; root-cause after |
| **SEV-3** | Minor / cosmetic / single-athlete | one athlete's support issue; a non-blocking log anomaly | Ticket; handle in hours |

**The monitor is the trigger.** `app/ops_monitor.py` grades **OK / WARN / CRITICAL → exit 0/1/2**; a
CRITICAL is a SEV-1/2 page. The A7 hard stop, an unreachable service, and a denied/absent operator key
are all CRITICAL by construction. A **denied `operator_access` WARNING** spike (BB-22) is an operator-key
brute-force / misconfiguration signal → investigate.

**Golden rule for any model-facing incident:** the only sanctioned response to unsafe seeds is **stop and
re-anchor ES-008 v2 — NEVER field-tune a model parameter** (KL-9 / OD-8). Parameters are frozen; an
incident does not unfreeze them.

---

## 2. Staged rollout (how the beta turns on)

Ramp in stages; each stage must hold its gate before the next. The **A7 week-1 seed-safety gate is the
hard gate** at every stage (it is ARMED — OD-8 thresholds).

| Stage | Who | Gate to advance |
|---|---|---|
| **0. Internal** | the team's own accounts on **staging**, then prod | smoke test green (deploy runbook §6.3); instruments capturing from the first session (BB-10); `reconstruct_session` complete (BB-12) |
| **1. Small external** | ~5–10 athletes | ≥ 1 week; **A7 gate `PROCEED`** for every cohort with ≥ 5 first sessions (`min_cohort_n=5`); no SEV-1; backups + a restore drill proven |
| **2. Full cohort** | up to ~100 | A7 still `PROCEED`; monitoring + on-call steady; incident runbook rehearsed once |

**Instruments-first rule (Beta):** if the validation instruments are not confirmed capturing from the
**first real session**, the trial is "dead on arrival" — do not advance. Verify via `GET /internal/metrics`
(A7/A8/A9 evidence present) before opening Stage 1.

**Abort/hold at any stage:** A7 → `PAUSE_AND_REANCHOR` (runbook §5), or any unresolved SEV-1.

---

## 3. Runbook: bad deploy → rollback

Symptoms: smoke test fails post-deploy, or the monitor goes CRITICAL right after a release.

```
1. Decide fast: is it the IMAGE or the DB?
   • Image/config only (no migration in this release):  roll the image back to the previous gitsha
     (same procedure as deploy runbook §6.2, prior tag) and restart. No data action. Done.
   • A migration ran this release:  go to §4 (the DB changed; an image rollback alone is unsafe because
     migrations are forward-only — MG3).
2. Confirm health:  GET /health 200 + `python -m app.migrate --db $HUSH_DB_PATH --verify-only` all PASS.
3. Re-arm the monitor; watch one cycle green.
4. Post-incident: why did staging not catch it? (staging is supposed to be identical-shaped — §2 of DEPLOYMENT).
```

The previous image is always available — the deployable is a pinned, generated artifact (BB-31); you
never rebuild to roll back, you re-point to the prior tag.

---

## 4. Runbook: bad migration / data corruption → restore

Forward-only migrations have **no down-migration** (MG3). Recovery is **restore from the pre-migration
backup**, which `migrate_production` is guaranteed to have taken first (it refuses to migrate without one).

```
1. DRAIN the service (stop the single writer — no connection may be open to the DB during restore).
2. Identify the backup:  the migration printed `backup: /backups/.../hush-<ts>.db`; or for an encrypted
   off-box backup, pull + decrypt + verify the manifest (DATA_PROTECTION_AT_REST_V1.md §5).
3. Restore with the BUILT, tested mechanism:
      python -c "from app.migrate import restore_database; r=restore_database('<backup>', '$HUSH_DB_PATH'); print(r.ok)"
   restore_database removes stale -wal/-shm sidecars and re-runs verify_database — a False return means
   the BACKUP is bad: escalate to §6 (disaster), do not start on it.
4. Start the PREVIOUS image (the one that matched the pre-migration schema). Do NOT re-apply the bad migration.
5. Smoke + verify-only + re-arm monitor.
6. Root-cause the migration on a populated staging COPY before re-attempting (MIGRATION_RUNBOOK §4).
```

Recovery objectives (beta): **RPO ≤ 24h** (daily backups; tighter if the scheduler runs more often),
**RTO ≤ a few hours** (one small SQLite file — restore is copy + verify).

---

## 5. Runbook: A7 hard stop → pause the trial & re-anchor (SEV-1, model-facing)

This is **the** safety incident. The A7 gate (`GET /internal/gate/a7`, ARMED) flipped a cohort to
`UNSAFE` and the overall recommendation to **`PAUSE_AND_REANCHOR`** — a cohort showed a day-1 first-rep
failure or sub-threshold completion (`max_first_rep_failure_rate=0.0`, `min_completion_rate=0.80`).

```
1. STOP new first sessions. Pause enrollment/Stage advancement immediately (do not open new athletes to
   the seeding path that produced the unsafe cohort). Existing athletes mid-session are not the concern;
   the seed for NEW athletes is.
2. CONFIRM with the data:  GET /internal/gate/a7 (per-cohort verdict) + GET /internal/metrics (the A7/A9
   evidence behind it). Identify which cohort tail (sex × experience × bodyweight band) is failing.
3. RE-ANCHOR, do not tune.  The sanctioned response is to re-anchor the seeding model ES-008 v2 for the
   failing tail — a deliberate, reviewed model change — NOT a live parameter tweak (KL-9 / OD-8). This is
   a Model decision; escalate to the model owner. constants.py stays frozen until that review.
4. CONTACT the affected cohort if a recommendation may have been unsafe (out-of-band channel — needs the
   consented contact channel, BB-33). Advisory framing: Hush recommends, the athlete decides.
5. Resume only after the re-anchored seed passes the gate on a fresh small cohort (back to Stage 1 gate).
```

The gate's verdict is authoritative; the monitor surfaces it; the human action is **pause + re-anchor**,
never "adjust the threshold to make it pass."

---

## 6. Runbook: operator-key compromise / disaster

**Operator-key compromise** (a `denied` `operator_access` WARNING spike, or a known leak):
```
1. Rotate HUSH_OPERATOR_KEY: mint a new high-entropy key -> update the secrets manager -> restart the
   service (picks up the new env). No athlete impact (the operator key is independent of athlete tokens).
2. Audit the `operator_access` lines for the window of exposure: which /internal/* routes, granted/denied.
3. If any athlete token may have leaked too (e.g. via a compromised provisioning channel), revoke it
   (auth.revoke_token) and re-provision (a revoked token authenticates to nothing → 401).
```

**Disaster — backups unrecoverable** (a restore drill failed, or restore returns False): this is the
worst case (Sec CS5). Treat as SEV-1: stop writes, escalate, work from the most recent *verifiable*
backup even if older, and accept the RPO gap explicitly. The standing defense is the **monthly restore
drill** (DATA_PROTECTION §5) — a drill failure is itself a SEV-1 *before* you ever need the backup, which
is the point of running it.

**Token-pepper loss** (`TOKEN_PEPPER` lost from the secrets manager): every athlete token becomes
unverifiable → the entire fleet must be re-provisioned. The pepper is therefore **set-once + KMS-backed +
itself backed up** (DEPLOYMENT §3). This is a disaster to design against, not recover from.

---

## 7. Pre-beta rehearsal checklist (do these once before Stage 1)

- [ ] Roll an image forward and back on staging (§3).
- [ ] Run a migration on a populated staging copy, then **restore from its backup** (§4) — prove RTO.
- [ ] Run the monthly **restore drill** against an encrypted off-box backup (DATA_PROTECTION §5).
- [ ] Force an A7 `PAUSE_AND_REANCHOR` on staging (synthetic unsafe cohort) and walk §5 end-to-end.
- [ ] Rotate the staging operator key and confirm the service comes back (§6).
- [ ] Confirm the monitor pages on a CRITICAL (kill staging, see the page fire).
- [ ] Confirm instruments capture from the first synthetic session (Stage-0 gate).

---

*Operational playbook only — it composes built mechanisms into procedures and decides no model behavior.
For topology/deploy see `DEPLOYMENT_ARCHITECTURE_V1.md`; for backups/restore `DATA_PROTECTION_AT_REST_V1.md`;
for migrations `MIGRATION_RUNBOOK_V1.md`; for the monitor `deploy/README.md` (BB-27); for the registry
`docs/canonical/HUSH_V1_OPEN_ITEMS.md`.*
