# Backend reference assets (preserved from the decommissioned Bayesian backend)

The dormant Python "ES" backend (`implementation/`) was **decommissioned** in the v4 cleanup
(see `V4_CLEANUP_PROPOSAL.md`): it ran the Bayesian latent-score / prediction / fatigue engine that
v4 replaced, was never reached by the live app (mobile runs the v4 engine), and embodied concepts the
frozen v4 spec forbids. The full code remains recoverable from git history.

This folder preserves the genuinely reusable, **engine-agnostic** assets a future v4 backend would
want, so they don't have to be excavated from history:

- **`exercise_catalog_rich.py`** — the richer exercise model from the old catalog: per-exercise
  `capabilities{cap: weight}` (multi-capability / assistance attribution), `exercise_family`,
  `replacement_group`, `difficulty_factor`, `exercise_cost`, `active`. The mobile catalog is
  single-capability + tier; these fields enable smarter swap pools, assistance-aware progress, and
  difficulty-aware seeding later. (The Bayesian *parity-firewall* comments are historical context.)

### Where the rest of the "keep for future" schema lives
The full data model — which tables/fields to KEEP vs drop for a future v4 backend (the append-only
history hierarchy, `preference_event`, `athlete_event`, the `recommendation` shell, auth/idempotency/
erasure, week_plan) — is documented and **classified** in `V4_LEGACY_DATA_AUDIT.md` and
`V4_CLEANUP_PROPOSAL.md`. That curated inventory is the schema reference (better than the raw
`schema.py`, which also defined the now-removed Bayesian latent tables).

**Nothing here is wired into the app.** It is reference material for if/when a v4 backend is built.
