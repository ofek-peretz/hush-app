# Deploy the Hush v1 API to Fly.io (no Mac required)

This is the lowest-friction path to a **real, reachable HTTPS backend** without a domain,
DNS, manual TLS, or a Mac. Fly builds the existing `deploy/Dockerfile`, gives you
`https://<app>.fly.dev`, and mounts a persistent volume for the single SQLite/WAL DB.

Config: `fly.toml` at the repo root (already written). Topology: one machine, one volume,
single write worker — the frozen architecture.

---

## 0. One-time: install flyctl + sign in

```sh
# Windows (PowerShell):  iwr https://fly.io/install.ps1 -useb | iex
# macOS/Linux:           curl -L https://fly.io/install.sh | sh
fly auth signup        # or: fly auth login
```

In a Claude Code session you can run the login interactively by typing it with the `!`
prefix in the prompt: `!fly auth login`. After that I can drive the remaining commands.

## 1. Gate the build-of-record (must be green)

```sh
python build/_verify/assemble_and_test.py    # model golden runner + API pytest
```

The image COPYs `build/_assembled/*`; this regenerates and verifies it. Already verified
green locally (full lifecycle smoke passed, schema v17).

## 2. Create the app + volume (first time only)

```sh
# Register the app from fly.toml WITHOUT deploying yet (edit `app`/`primary_region` first
# if you changed them):
fly apps create hush-api          # or `fly launch --no-deploy --copy-config` to auto-name

# One persistent volume for the SQLite DB, in the same region as primary_region:
fly volumes create hush_data --region iad --size 1   # 1 GB is ample for v1

# Enforce the single-writer invariant: exactly one machine.
fly scale count 1
```

## 3. Set the secrets (NOT in fly.toml — they are real secrets)

```sh
# Generate two high-entropy values:
python -c "import secrets; print('HUSH_OPERATOR_KEY=' + secrets.token_urlsafe(32)); print('TOKEN_PEPPER=' + secrets.token_urlsafe(32))"

# Set them (store the OPERATOR key somewhere safe — you need it to enroll athletes):
fly secrets set HUSH_OPERATOR_KEY="<paste>" TOKEN_PEPPER="<paste>"
```

- `HUSH_OPERATOR_KEY` gates every `/internal/*` call (enroll/revoke/erase/audit/metrics).
- `TOKEN_PEPPER` is mixed into the bearer-token hash so a DB-only leak can't forge tokens.
  **Never rotate it after athletes exist** — it would invalidate every issued token.

## 4. Deploy

```sh
fly deploy
```

When it finishes, Fly prints the URL: `https://hush-api.fly.dev`.

## 5. Prove the wire end-to-end (real HTTP, real TLS)

```sh
HUSH_OPERATOR_KEY="<the key from step 3>" \
  python deploy/smoke_test.py --base-url https://hush-api.fly.dev
```

A green `SMOKE PASSED` means enroll → compose → report sets → idempotency → complete →
audit → A7 gate all work over the public wire.

## 6. Point the mobile client at it

Set the client env to the deployed URL (this is the "fill the URL" step that flips the app
off the local fixture onto the real backend):

```sh
# code/mobile/.env  (and per-profile under build.<profile>.env in eas.json for EAS builds)
EXPO_PUBLIC_API_BASE_URL=https://hush-api.fly.dev
```

The client already reads this (`data/api/config.ts`); with a URL present **and** a token in
the Keychain, `selectModel()` activates `HttpModelClient` automatically.

## 7. Enroll the first athlete (get a token for the device)

Enrollment is operator-mediated by design (no public registration):

```sh
curl -X POST https://hush-api.fly.dev/internal/athletes \
  -H "x-operator-key: <HUSH_OPERATOR_KEY>" \
  -H "content-type: application/json" \
  -d '{"athlete_id":"ath_demo","sex":"male","age":30,"experience":"intermediate","bodyweight_kg":82.5}'
# -> { "athlete_id": "ath_demo", "token": "<bearer>" }   (token shown ONCE)
```

Deliver that token to the device via the deep link `hush://enroll?token=<bearer>` or by
pasting it into the Enrollment screen. The app validates it against `/profile` and enters Home.

---

## Operating notes

- **Cost / cold start:** `auto_stop_machines="stop"` + `min_machines_running=0` scales the
  single machine to zero between requests (cheap for alpha) and wakes it on the next call.
  All work is request-driven, so nothing is lost. Set `min_machines_running=1` in `fly.toml`
  if you want zero cold-start latency during testing.
- **Backups:** for alpha the DB lives on the Fly volume (`fly volumes snapshots` gives daily
  snapshots). For the backup-GATED migration path (entrypoint.sh) and off-box encrypted
  backups, see `docs/architecture/DATA_PROTECTION_AT_REST_V1.md` — a later hardening step,
  not needed to get the URL live.
- **Migrations on later deploys:** the plain image CMD relies on `init_database` to bring the
  schema forward on start. Once there is real athlete data, switch the machine's start command
  to `deploy/entrypoint.sh` (backup-gated migrate → verify → serve) so it can never serve on a
  half-migrated DB. Until then, first deploy needs nothing.
- **Monitoring:** `HUSH_OPERATOR_KEY=<k> python -m app.ops_monitor --base-url https://hush-api.fly.dev --json`
  grades health + the A7 gate + metrics (exit 0/1/2 for cron/alerting).
