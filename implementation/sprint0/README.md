# Hush v1 — Sprint 0

Smallest executable version of the Hush learning loop. Pure model package +
synthetic athlete simulator + closed-loop end-to-end run. Implements ES-005.1,
ES-008 v2, and the ES-001/004/006/007/010 loop *exactly as frozen* — no
redesign, no added features.

## Run

```
pip install pytest
PYTHONPATH=. python -m pytest tests/ -q     # 12 passing
PYTHONPATH=. python -m sim.run_e2e          # end-to-end demo
```

## Structure

```
hush_model/                  pure model package (no I/O, no DB, no network)
  constants.py               single source of truth for all frozen parameters
  domain.py                  core objects: state (mutable) + history (frozen)
  capability/
    reference_strength.py    score <-> kg decoder      (ES-005.1 s1 / ES-008 v2)
    epley.py                 load <-> reps, 3 directions (ES-005.1 s2)
    confidence.py            confidence from precision   (ES-005.1 s6)
    decay.py                 evidence decay              (ES-005.1 s10)
  prediction.py              score -> predicted reps-to-failure (ES-004)
  recommendation.py          working-set rec + discount + floor (ES-006/s7/s13)
  evidence.py                observation -> evidence, load-space attribution (ES-010)
  state_update.py            precision-weighted blend; ONLY state writer (ES-007)
  seeding.py                 cohort-adjusted cold start (ES-008 v2 s4-5)
  loop/orchestrator.py       recommend->observe->evidence->update (master loop)

sim/
  synthetic_athlete.py       known-truth athlete; generates reps from true capability
  run_e2e.py                 end-to-end execution over weeks

tests/test_sprint0.py        golden values, round-trip, recovery + stability
```

## What Sprint 0 deliberately defers (stubs, not redesign)

- Fatigue/recovery adjustment (ES-011) — loop runs fully-rested sets.
- Variance-suppressed confidence (ES-010 Part C) — clean loop has no conflict.
- Full ES-006 decision hierarchy (KEEP/INCREASE/DECREASE across sessions).
- Investigation/probes (ES-013), Trust metric (ES-012), session composition (ES-009).
- Persistence/API/app — pure model only.

## Verified invariants

- ReferenceStrength S=64 -> landmark kg per capability (113/100/68/150/180).
- Forward/inverse round-trip exact (Principle #43 consistency).
- Epley bench@82.5kg -> 11.09 reps-to-failure.
- Decay 1wk~1.0, 78wk~0.1 (half-life 23.48 wk).
- Seed confidence 10 regardless of score; prior participates in blend.
- Closed loop recovers a synthetic athlete's true capability; stable when seeded at truth.
