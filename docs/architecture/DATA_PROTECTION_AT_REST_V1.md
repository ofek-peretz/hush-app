# DATA_PROTECTION_AT_REST_V1.md — Encryption at Rest, Encrypted Backups & Restore (BB-21)

> **What this document is.** The data-protection-at-rest strategy for Hush v1: disk/volume encryption
> for the live DB, the **encrypted, access-controlled, off-box backup** strategy layered on the built
> backup mechanism, the **retention policy**, and the **restore drill**. It is the on-host preparation
> for **BB-21** — the policy + the wrapper tooling that an Operations team operationalizes against real
> infrastructure. The *backup/restore/verify mechanism itself is already built and tested* in code
> (`app/migrate.py`, BB-3/BB-5 tranche); BB-21 adds the **encryption envelope + off-box storage +
> retention** around it. It changes **no** model behavior. Governing rule: *no redesign without explicit
> model review.*
>
> Date: 2026-06-12 · Anchors: `app/migrate.py` (`backup_database`/`restore_database`/`verify_database`);
> `deploy/README.md` (built mechanism); `SERVER_BUILD_PLAN_V1.md` §11/§14; `DEPLOYMENT_ARCHITECTURE_V1.md`
> (topology, secrets). Threat sources: `SECURITY_PRIVACY_REVIEW.md` S3 / CS5; Beta §4.3.
>
> **What needs real infrastructure (escalate — NOT code-completable on this host):** the encrypted volume
> itself, the off-box backup bucket, the KMS/secrets-manager-held backup key, and the cron/scheduler that
> runs the wrapper. This document specifies each precisely; `deploy/backup/encrypted_backup.sh` is the
> wrapper that ties the built snapshot mechanism to an encryption envelope so standing it up is mechanical.

---

## 1. What we are protecting and from what

Hush v1 stores **special-category health data** (training loads, bodyweight, age, sex/experience cohort,
the full immutable audit chain) plus **authentication material** (hashed+peppered athlete tokens). The
re-identifiability of the small tail-recruited cohort means even "anonymized" rows must be treated as
identified special-category data (KL-16). The at-rest threats (Sec S3 / CS5):

- **Disk/volume theft or snapshot exfiltration** → mitigated by **encryption at rest** (§2).
- **Backup theft** (the classic gap: the DB is encrypted but backups sit in plaintext) → mitigated by
  **encrypted backups** (§3).
- **DB-only leak used to forge tokens** → already mitigated: only *peppered hashes* of tokens are stored,
  and the pepper (`TOKEN_PEPPER`) lives in the secrets manager, not the DB (BB-20). At-rest encryption is
  defense in depth on top of this.

---

## 2. Encryption at rest (the live DB)

**Decision: volume-level (full-disk) encryption of the `/data` volume that holds `hush.db` (+ `-wal`,
`-shm`).** Rationale:

- It is **transparent to the frozen single-process SQLite model** — no application crypto, no schema
  change, no new dependency, no model touch. The build plan's toggle table (§14) lists application-level
  SQLCipher as the *alternative*; v1 builds to the volume-encryption default because it keeps the model
  package untouched and the WAL/`backup()` mechanics unchanged.
- It covers the WAL and shm sidecars and any temp files automatically — an app-level cell encryption would
  not.
- The encryption key is held by the **platform KMS / disk-encryption subsystem**, not by the app process
  and not in the repo.

**Requirements (infrastructure — escalate):**
- The `/data` volume (prod and any env holding real data) is provisioned **encrypted-at-rest** (cloud
  encrypted block volume / LUKS / managed-disk encryption). The key is KMS-managed with audited access.
- The host's swap and any container scratch that could page DB contents are likewise on encrypted storage.
- Staging that holds **only synthetic data** may run unencrypted (it has no real data — see the env table
  in `DEPLOYMENT_ARCHITECTURE_V1.md` §2).

> **Device-side at-rest is a separate item (Mobile):** iOS Data Protection + Keychain (BB-26) and the
> local SQLite encryption choice (OD-5) protect the *client* copy; this document is the *server* side.

---

## 3. Encrypted backup strategy

The backup *mechanism* is built and tested (`app/migrate.py`):

- `backup_database(path, dir)` — a **WAL-safe online snapshot** via the sqlite3 backup API (copies
  committed state including un-checkpointed WAL pages — a raw file copy would corrupt/miss them),
  self-verified with `integrity_check`.
- `restore_database(backup, dest)` — copy a known-good backup back into place (removing stale WAL
  sidecars) **and verify it** — the tested-restore.
- `verify_database(target)` — schema head + chain-complete + `integrity_check` + `foreign_key_check` +
  shape parity.

BB-21 wraps three things around this mechanism — **encryption, off-box storage, retention**:

```
   live DB (encrypted vol)
        │  backup_database()  → WAL-safe snapshot (plaintext, transient, on the encrypted vol)
        ▼
   age/gpg encrypt with the BACKUP PUBLIC KEY (recipient)  →  hush-<ts>.db.age + .sha256 manifest
        │                                                       (the snapshot is shredded after encrypt)
        ▼
   upload to the OFF-BOX, versioned, access-controlled backup bucket  (different blast radius than the host)
        │
        ▼
   retention sweep (§4)
```

**`deploy/backup/encrypted_backup.sh`** is that wrapper: it calls the built `backup_database`, encrypts
the snapshot to a recipient public key with `age` (preferred) or `gpg`, writes a `.sha256` manifest,
shreds the plaintext snapshot, and exposes an `upload` hook for the off-box bucket. Notes:

- **Asymmetric (recipient-key) encryption** so the *backup host needs only the public key* — the private
  key that can decrypt backups lives in the KMS/secrets manager and is used only at restore time on a
  separate, audited host. A compromised backup host cannot read its own backups.
- The encryption tool (`age`/`gpg`) is an **Operations dependency**, deliberately *not* a Python package —
  it keeps the deployable's pinned dependency set (BB-31) minimal and the model package untouched.
- **Off-box + versioned + access-controlled:** the bucket is in a different failure domain than the host,
  has object-versioning (defends against a bad-overwrite/ransomware), and least-privilege access (the
  backup identity can `put` but not `delete`/`get`; restore uses a separate audited identity).

**Schedule (infrastructure — escalate):** a scheduled job (cron/scheduler on the host or a sidecar) runs
the wrapper. Recommended cadence for the ~100-user beta: **at least daily**, plus an **on-demand backup
immediately before any migration** — the latter is already mandatory and **enforced in code**
(`migrate_production` refuses to migrate without a fresh backup; deploy runbook §6).

---

## 4. Retention policy

A first explicit retention policy for the beta (was ATD-adjacent / Beta §4.3 — recorded here so it is a
decision, not a vacuum):

| Tier | Keep | Rationale |
|---|---|---|
| Daily backups | **14 days** | routine point-in-time recovery for the beta window |
| Weekly backups | **8 weeks** | longer regression / "when did this row go bad" window |
| Pre-migration backups | **retain until the migration is confirmed healthy in prod, min 30 days** | the rollback source for a bad migration (no down-migration, MG3) |

- **Erasure interaction (OD-2 / GDPR):** a right-to-erasure request anonymizes the live DB
  (`erase_athlete`), but **backups still contain the pre-erasure rows** until they age out. The retention
  windows above bound that exposure; the retention policy *is* the backup-side erasure SLA. Document this
  in the privacy notice (BB-35) — backups are purged on the schedule above, not instantly. This is a
  **compliance decision to ratify** with BB-35 (retention/DPIA) — flagged, not unilaterally fixed.
- Retention enforcement (the lifecycle sweep) is a **bucket lifecycle rule** (infrastructure), not app
  code.

---

## 5. The restore drill (test the backups, or you don't have backups)

Backups that have never been restored are a hope, not a control. Run this drill on a **schedule**
(recommended monthly) and **after any change to the backup pipeline**, against a **throwaway host** —
never the live DB:

```
# 1. Pull the latest encrypted backup from the off-box bucket to a throwaway host.
# 2. Decrypt with the restore-only private key (from KMS — a DIFFERENT identity than the backup writer):
age -d -i restore-key.txt hush-<ts>.db.age > hush-restore.db     # (or: gpg -d ...)
# 3. Confirm the manifest:
sha256sum -c hush-<ts>.db.sha256
# 4. Verify it is a sound, fully-migrated DB using the BUILT gate:
python -m app.migrate --db hush-restore.db --verify-only        # all checks PASS, schema head == 11
# 5. (deeper drill) restore_database into a scratch path and confirm a read endpoint round-trips.
# 6. Record: backup age, decrypt OK, manifest OK, verify OK, wall-clock to restore (the RTO datapoint).
```

A failed drill is a **CRITICAL incident** (the backups are not recoverable) — see
`INCIDENT_RUNBOOK_V1.md`. **Recovery objectives for the beta:** RPO ≤ 24h (daily backups; less if the
scheduler runs more often), RTO ≤ a few hours (single small SQLite file — restore is a copy + verify).

---

## 6. What is prepared here vs. what needs real infrastructure

**Prepared on-host:** the at-rest decision (volume encryption, model untouched), the encrypted-backup
strategy + the `encrypted_backup.sh` wrapper (built snapshot mechanism → encryption envelope → manifest →
upload hook), the retention policy, and the restore drill — all wired to the already-built+tested
`backup_database`/`restore_database`/`verify_database` mechanism.

**Needs real infrastructure (escalate — recorded, not built):** the encrypted `/data` volume; the
KMS-held backup key pair (public on the backup host, private restore-only in KMS); the off-box, versioned,
least-privilege backup bucket; and the scheduler that runs the wrapper. **Needs a compliance decision
(BB-35):** ratifying the retention windows + the backup-side erasure SLA in the privacy/retention notice.

---

*At-rest protection strategy only — it composes built mechanisms and decides no model behavior. For the
backup/restore/verify mechanism see `app/migrate.py` + `deploy/README.md`; for topology + secrets
`DEPLOYMENT_ARCHITECTURE_V1.md`; for the migration discipline `MIGRATION_RUNBOOK_V1.md`; for the
open-items registry `docs/canonical/HUSH_V1_OPEN_ITEMS.md`.*
