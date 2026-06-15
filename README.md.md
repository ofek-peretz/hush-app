# Hush

AI training-intelligence system. **Hush recommends. The athlete decides.**

Current Version:
Hush v1

Status:
Implementation Phase — model delta complete; **Wave-2 backend (API shell) complete**; mobile app +
ops infra + consent pending (see deploy/README.md).

Canonical Entry Point:
docs/canonical/HUSH_V1_EXECUTION_CONTEXT.md
(product framing: docs/canonical/HUSH_V1_PRODUCT_SPECIFICATION.md · status: docs/canonical/HUSH_V1_PROJECT_STATUS.md)

Current Build (2026-06-12):
Sprint 0–4 ✅ · Wave 1 ✅ · DX-07 (bodyweight) ✅ · DX-04 (exploration off) ✅ · DX-03 (governor advisory) ✅ ·
M1 = DX-01/02/20/05/06/19 (actual_weight as learning input) ✅ · DX-11 (event runtime + session_progress) ✅ ·
DX-09 = M5 stagnation detection ✅ · DX-08/10/12 ✅ · **Wave-2 backend (API shell) ✅**.
**Schema v11 · 284 tests** (model golden 189 + API pytest 95).

What the model does today:
Learns a durable per-capability estimate from the athlete's **real logged performance**; recommends loads
**advisorily** (the athlete owns load); keeps the program structure stable; and **detects stagnation** (M5),
surfacing at most one insight and one optional recommendation per week. The active investigation engine
(ES-013) is **retired** in v1 — detection ships as M5.

Product decisions resolved (2026-06-12): OD-1/2/4/8 Closed; OD-3 (email recovery) decision ratified but
**implementation deferred** into the consent/email workstream. The on-host model + backend surface is
complete; everything remaining is off-host:

Next (NOT code on this host — Operations / Mobile / Compliance):
the deployed env + backups + monitoring (Ops — BB-30/21/22/27/29 + live runs of BB-3/5/28) · the iOS app
(Mobile — BB-15/26) · consent/enrollment + the deferred OD-3 recovery build (Product/Ops — BB-33/35/37).
Backend handoff: deploy/README.md. See docs/canonical/HUSH_V1_OPEN_ITEMS.md.
