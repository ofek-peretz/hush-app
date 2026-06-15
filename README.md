# Hush

AI training-intelligence system. **Hush recommends. The athlete decides.**

> Product overview and current status: see [`README.md.md`](README.md.md),
> [`CURRENT_STATUS.md.md`](CURRENT_STATUS.md.md), and the canonical entry point
> [`docs/canonical/HUSH_V1_EXECUTION_CONTEXT.md`](docs/canonical/HUSH_V1_EXECUTION_CONTEXT.md).
>
> This file documents the **repository layout and version-control / recovery operation**.

---

## Repository layout

| Path | Contents | Tracked |
|------|----------|---------|
| `implementation/` | **Source of truth** for the backend API and model (per-sprint snapshots: `sprint0…6`, `wave1`, `api/`). Includes all DB migrations (`migration_002…016`). | ✅ |
| `build/_verify/` | `assemble_and_test.py` — assembles `implementation/` into a runnable tree and runs the test suite. | ✅ |
| `build/_txt/` | Engineering specification documents (text). | ✅ |
| `build/_assembled/` | **Generated** output of the assembler. Reproducible — **not tracked.** | ❌ (gitignored) |
| `code/mobile/` | React Native + Expo (TypeScript) mobile app. Source in `src/`, tests in `__tests__/`. | ✅ (source only) |
| `code/backend`, `code/model`, `code/simulation` | Empty stubs. Real backend/model source lives in `implementation/`. | — (empty) |
| `deploy/` | Dockerfile, compose, ingress (Caddy), backup script, requirements, OpenAPI export. | ✅ |
| `docs/` | Architecture, canonical specs, assumptions, analysis, founder docs. | ✅ |
| `specs/`, `reviews/` | Specifications and review records. | ✅ |
| `hush.db` | Local SQLite dev database. **Not tracked** — regenerated from migrations. | ❌ (gitignored) |

> **Note on `code/backend` and `code/model`:** these directories are intentionally
> empty placeholders. The authoritative backend and model source is `implementation/`,
> assembled by `build/_verify/assemble_and_test.py`.

---

## Building & verifying

The model/backend are assembled from `implementation/` and verified with the
plain-assert runner:

```bash
python build/_verify/assemble_and_test.py
```

Mobile app (from `code/mobile/`):

```bash
npm ci        # restore dependencies from package-lock.json
npm test      # jest
```

---

## Version control & recoverability

This repository is the single source of truth for Hush. Everything required to
rebuild the project is tracked **except** dependencies and generated artifacts,
which are deterministically reproducible:

- **Mobile dependencies** → `npm ci` (from `package-lock.json`)
- **Assembled model tree** → `python build/_verify/assemble_and_test.py`
- **Local database** → re-run migrations (`implementation/` migration files)

What is intentionally **excluded** (see `.gitignore`): `node_modules/`,
`__pycache__/`, `.pytest_cache/`, `.expo/`, `build/_assembled/`, `*.db`,
`.env`/secrets, and OS/editor files.

### Connecting a private remote

This repo is initialized locally with no remote yet. To connect a private
GitHub repository:

```bash
# create an EMPTY private repo on GitHub first (no README/license), then:
git remote add origin git@github.com:<owner>/<repo>.git   # or https://...
git branch -M main
git push -u origin main
```

### Backups

Source-control on a private remote is the primary backup. Push after every
meaningful change. The local SQLite database is **not** in version control;
operational data backups are handled separately (see
`deploy/backup/encrypted_backup.sh`).
