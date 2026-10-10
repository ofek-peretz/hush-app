# Beta Readiness Review — Hush v1, 100-User Beta (Phase 1)

> **════ SUPERSEDED-FRAMING NOTE — DX-17 (2026-06-12) ════**
> Read against the as-built system: current build is through **DX-09 (M5 stagnation)** — **schema v9,
> 156/156 tests**; Hush is **advisory** (athlete owns load; ES-006 governor advisory, DX-03/DX-20),
> `actual_weight` is a learning input (M1), and the **active investigation engine (ES-013) is retired →
> detection = M5**. v1 success = honest capability tracking + stagnation detection, not load authority
> (DX-14). Where this review assumes a load-authority model or a pre-pivot success bar, defer to
> `HUSH_V1_PROJECT_STATUS.md` and `HUSH_V1_PRODUCT_SPECIFICATION.md`.

> Pre-launch readiness review for a 100-athlete beta starting **~next month** (the Phase 1 cohort).
> The model, the architecture (`docs/architecture/MOBILE_ARCHITECTURE_V1.md`), and the UX/UI are
> treated as **frozen**. This review **does not propose product features and does not redesign the
> model**; it identifies what could realistically fail during a 100-user beta and what must be in
> place before launch. Everything recommended is operational/engineering scaffolding (deployment,
> instrumentation wiring, backups, support, monitoring) — none of it is new product scope or a model
> change. Governing rule respected: *no redesign without explicit model review.*
>
> Date: 2026-06-10 · Model: Hush v1 (frozen) · Server build: Sprint 0–4 ✅ (125 tests, schema v6) ·
> Athlete-facing build (API + app + live instrumentation + deployment): **Sprint 5 — not started** ·
> Sources: `HUSH_V1_PROJECT_STATUS.md` §3/§5 · Build Plan §3/§4/§5/§9/§10 · Validation Architecture
> (A7 week-1 hard gate) · `reviews/decisions/D1_THIN_CLIENT_VS_LOCAL_FIRST.md` (open) · ES-003/008v2/011.

> **HEADLINE VERDICT — NOT YET READY; READINESS IS A BUILD PROBLEM, NOT A TUNING PROBLEM.** The model
> spine is built and tested (Sprints 0–4). **The entire athlete-facing and operational half of the
> product does not exist yet** — there is no live API, no app, no live instrumentation, no deployed
> service, no backups, no monitoring, no support path, and no enrollment pipeline (all Sprint 5,
> unstarted). The repo is **per-sprint snapshots, not an assembled runnable tree, with no `pytest` run
> in the checkout** (PROJECT_STATUS §5.8). The client architecture decision **D1 is unresolved**. A
> beta in ~30 days is achievable **only** if Sprint 5 is built, deployed, instrumented, and
> dress-rehearsed to the blocker checklist in §11 — and only if the **A7 week-1 seed-safety hard gate**
> (with its "stop and re-anchor" abort) is staffed and armed before the first athlete trains. Launching
> without the §11 blockers closed risks an **untestable trial** (instruments not live = "dead on
> arrival", Build Plan §10) and **silent, unrecoverable data loss**.

---

## 0. Executive summary

What is solid: the frozen model and its seven engines are implemented and tested to 125 passing tests,
conservative-by-design (light seeds, discount, fatigue veto, round-down loads) — exactly the
properties a first-session-safety beta needs. **Scale is not a risk**: 100 users, sub-millisecond
learning, one SQLite DB is comfortably within capacity. The risks below are **not** about the model
being wrong or the system being too small to cope.

The risks are about everything *around* the model that a live trial with real people requires and that
is **not built or not decided yet**:

1. **The athlete-facing + operational half is unbuilt** (API, app, live instrumentation wiring,
   deployment, ops). "Readiness" is really a *pre-build checklist*, and the calendar is tight.
2. **The validation instruments must be live from session one or the trial is worthless** — they
   exist as Sprint-4 *modules* that run in simulation, but are **not wired into a live request path**.
3. **No durability/recovery scaffolding exists** — no backups, no idempotency contract on the live
   service, no tested restore. A single SQLite corruption or a double-applied observation is
   silent and, today, unrecoverable.
4. **No operational observability or support path exists** — no uptime/error/latency monitoring, no
   way for an operator to look up an athlete's state/audit to answer a ticket, no support channel.
5. **The A7 week-1 hard gate has an abort criterion but no armed mechanism** — nothing today watches
   first-session loads across the cohort tails or can pause the trial if seeds land unsafe.
6. **D1 (thin client vs local-first) is open**, and it directly determines the crash-recovery and
   data-integrity posture (§7). It must be decided *before* the app is built, not during the beta.

The rest of this document details each requested risk category with severities
(**🔴 Blocker** / **🟠 High** / **🟡 Medium** / **🔵 Monitor**) and consolidates a pre-launch
blocker checklist (§11) and a first-30-days operating plan (§12).

---

## 1. Build-state reality (the context every section depends on)

| Layer | State | Implication for a 30-day beta |
|---|---|---|
| Frozen model + 7 engines | ✅ built, 125 tests | Solid spine; conservative by design |
| Persistence, schema v6, migrations 001–006 | ✅ built | But verified by an assemble-and-test script, **not** a live deployed DB |
| Assembled, runnable, `pytest`-green tree | ❌ **snapshots only** (§5.8) | The deployable service does not exist as a single runnable artifact yet |
| API (Build Plan §4 endpoints) | ❌ not built (Sprint 5) | No way for an app to talk to the model |
| Mobile app (6 screens) | ❌ not built (Sprint 5) | No athlete-facing surface |
| **Live** instrumentation wiring (A8/A9/A1/A3) | ❌ modules exist, **not live** | Trial is untestable until wired into the request path |
| Deployment / hosting / TLS / secrets | ❌ none specified | Nowhere for the service to run |
| Backups / restore | ❌ none | Single SQLite = single point of total data loss |
| Monitoring / alerting / logging pipeline | ❌ none | Blind to outages, errors, latency, integrity violations |
| Support path / operator tooling | ❌ none | No way to help 100 users or read their state |
| Enrollment / token provisioning / consent | ❌ none | No way to onboard the cohort |
| **D1** client architecture decision | ⚠ **open** | Gates crash-recovery & integrity design (§7) |

**This table is the review.** Every category below is an instance of "a live trial needs X; X is in the
right-hand column."

---

## 2. Onboarding risks

**2.1 🔴 Seed safety across cohort tails is THE gate, and nothing yet enforces it.** A7 (conservative
seeds safe across all cohorts) is the Phase-1 **hard gate at week 1**, and the validation plan is
explicit: *"if seeds are unsafe for any cohort, **stop and re-anchor ES-008 v2** before proceeding."*
The seeds are cohort-adjusted and deliberately light, but they are **unvalidated against real cohort
diversity** — the tails (older, female, detrained, bodyweight movements) are exactly where A7 lives,
and exactly who a diversity-recruited cohort includes. *Must before launch:* the first-session
prescription must be visibly conservative and auditable per athlete, and an operator must be able to
review week-1 first-session loads **segmented by cohort** with a defined stop/pause trigger (§5, §12).

**2.2 🟠 Onboarding inputs ↔ seeding inputs must map exactly and be hard to get catastrophically
wrong.** Seeds depend on the ES-Athlete fields + cohort multipliers + self-reported experience
(ES-003/008v2). A miscalibrated self-assessment (athlete overstates experience) seeds heavier; the
conservative discount mitigates but does not eliminate. *Must:* validate the onboarding→seed mapping
end to end on real inputs, and bias every ambiguous self-report **down** (conservative, per Principle
#39). Bodyweight is **correctly not collected** (absent from the frozen Athlete entity; Class-B
inactive) — onboarding must not imply vertical-pull training exists.

**2.3 🟠 Equipment-to-catalog coverage can silently fail composition.** The athlete declares available
equipment; if the ES-002 catalog (Class-A only, replacement groups) cannot compose a 5/5-Class-A
session for a constrained equipment set (e.g., dumbbells-only, or a bodyweight-only athlete),
onboarding produces a degenerate or empty first session. *Must:* verify Class-A coverage across the
**full range of equipment combinations the cohort will declare**, before they declare them.

**2.4 🟡 Calibration-phase expectations are a dropout risk.** For the first 3–5 workouts
(`global_confidence < 70`, calibration_phase) loads are exploratory and conservative; an experienced
athlete may feel the weights are "too light" and lose trust early — the precise moment trust is most
fragile. This is by design, but **unmanaged it reads as the product being wrong.** *Must:* the
(frozen) "why this weight?" view and out-of-band onboarding comms set the expectation that early
sessions calibrate. (No new feature — use what exists.)

**2.5 🟠 Enrollment, consent, and token provisioning have no pipeline.** 100 users need: informed
consent (training + health data + the trial's research-adjacent nature; note the optional
RIR-on-a-subset *research* instrument the validation plan allows — consent must cover it if used), a
per-athlete bearer token provisioned securely (Build Plan §4), and TestFlight invitations. *Must:* a
defined, low-error enrollment runbook; tokens in the Keychain, never the bundle.

---

## 3. Migration risks

**3.1 🟢→🔵 Launch-time server migration risk is LOW (greenfield).** The beta DB starts empty;
migrations 001–006 run once on a fresh DB. *But* they have been validated by the assemble-and-test
script, **not on the real deployment DB** (§1). *Must:* run the full additive migration chain on the
actual production DB engine/config and assert schema v6 + referential integrity before launch.

**3.2 🔴 `model_version` / `capability_model_version` must be stamped on every row from day one.**
Build Plan §3: this is "free now and impossible to retrofit." If launch ships without version stamps,
every future migration, audit reconstruction, and post-hoc analysis is compromised — and you cannot
add it after athletes have data. *Must verify it is wired into the live write path before the first
session.*

**3.3 🟠 Mid-beta migrations on LIVE athlete data are the real risk.** A bug found in week 2 may need a
schema change while 100 athletes have history. Additive-only discipline (the project's standard) plus
a **tested migration runbook + a verified backup taken immediately before** are mandatory; an
in-place, non-additive migration on live trial data could corrupt the audit chain irreversibly. *Must:*
a "no migration without a fresh restorable backup" rule (depends on §4 backups existing).

**3.4 🟡 Catalog versioning must be stamped and immutable-after-use.** The ES-002 catalog is
code-resident; a mid-beta catalog patch (likely, given A9 off-catalog override pressure) is a deploy +
`catalog_version` bump. Recommendations made under the old catalog must stay reconstructable. *Must:*
`catalog_version` stamped on every composed session.

**3.5 🟡 Client migrations depend on D1.** If D1 → local-first, the device DB has its own additive,
**outbox-preserving** migration story (an app update must never strand an un-synced workout). If D1 →
thin client, there is no client migration surface. **Cannot finalize client migration policy until D1
is decided** (§7).

---

## 4. Data integrity risks

**4.1 🔴 No idempotency/dedup contract = silent double-learning.** Per the D1 review, an ambiguous
network timeout on a set report, retried by the client, can **double-apply an observation** (the model
learns the same set twice) unless the server dedups on a client-generated event id. This corrupts
capability state silently and is **independent of D1** — *both* thin client and local-first need it.
*Must before launch:* server-side idempotency keyed on a client event id, with a test that a replayed
set report is a no-op.

**4.2 🔴 Transactional atomicity / single-writer must be enforced on the LIVE service.** The audit
chain's "every link present" guarantee depends on `Set→Observation→de-fatigue→Evidence→StateUpdate`
committing atomically through the single `StateWriter` chokepoint (Build Plan §5). A half-applied step
"corrupts state silently" — the single biggest correctness hazard. The discipline exists in the model
package; it must be **verified end-to-end on the deployed service**, including a fault-injection test
(fail mid-chain → assert full rollback) and the CI single-writer guard.

**4.3 🔴 No backups = one disk event is total trial loss.** A single SQLite database with no backup is
a single point of total, unrecoverable data loss for the entire trial. *Must:* WAL mode, scheduled
backups (e.g., periodic snapshot + WAL archiving), off-box storage, and a **tested restore** before
launch. This is the cheapest high-severity item to fix and the most catastrophic to skip.

**4.4 🟠 Clock/timezone integrity feeds fatigue decay.** Recovery decay is a function of Δt between
sessions (ES-011 D). Device clock skew or timezone bugs would corrupt fatigue/recovery state. *Must:*
the **server** timestamps authoritatively for all decay-relevant time; device-supplied times are
advisory only, never the basis for decay.

**4.5 🟠 Lossless override-target capture (A9).** Off-catalog substitutions must be recorded verbatim
with the attribution gap flagged; dropping them loses the richest learning signal *and* an
existential-adjacent measurement (A9 is one of only two fully-testable assumptions). *Must:* the
replace path persists the full target, including free-text off-catalog identities.

**4.6 🔵 State written during the beta is provisional, but auditable.** κ, τ, σ²_ref,
`SESSION_FATIGUE_CEILING`, `PREFERENCE_NUDGE` are **provisional/UNVALIDATED** (PROJECT_STATUS §5); the
learning is "directional, not calibrated," with a known conservative-discount equilibrium bias and
knife-edge κ/τ sensitivity. This is **not** an integrity defect (every conclusion carries what it
assumed), but operators must know the state is provisional and **must not tune parameters to fit
field data mid-beta** (that is a model-review act, not an ops action).

---

## 5. Support risks

**5.1 🔴 No operator tooling to answer "what happened for athlete X?"** The Build Plan specifies
`GET /internal/athletes/{id}/audit/{rec_id}`, `/state`, `/internal/metrics` — **not yet built.**
Without them, a support ticket ("why was my weight light?", "I lost my workout") cannot be diagnosed.
*Must:* the internal state + audit endpoints live behind the operator key before launch.

**5.2 🟠 No support channel and no account-recovery path.** With Anti-Requirements limiting in-app
account/settings, support is out-of-band (email/Discord/TestFlight feedback) — fine, but it must
*exist* and be staffed. **Account recovery is a sharp edge:** if the token lives only in the Keychain
and an athlete reinstalls or changes devices, can they recover their history? Without a re-provisioning
path, a reinstall = lost athlete = lost trial data. *Must:* a defined recovery/re-provision procedure.

**5.3 🟠 Override and "feels wrong" triage.** Athletes will override (welcomed, the richest signal).
Support must distinguish a *healthy* override (data) from an athlete *losing trust* (retention risk),
especially during calibration (§2.4). *Must:* a simple operator view of an athlete's recent
overrides/decisions (uses §5.1 tooling, no new feature) and a support script for the calibration
expectation.

**5.4 🟡 TestFlight/build logistics.** Builds expire (90 days; a 30-day beta is fine) but crash/feedback
triage and build rotation need an owner. *Should:* a named build/release owner.

---

## 6. Observability gaps

**6.1 🔴 Validation observability — the instruments are NOT live.** Shadow baseline (A8), override log
(A9), fresh-state checks (A1), costly-case tags (A3) exist as Sprint-4 modules that run **in
simulation**, not wired into a live request path (PROJECT_STATUS §5.7; Build Plan §10: instruments
must be live "from the first real session or the validation program is dead on arrival"). *Must:* wire
all four into the live pipeline and verify, for a recorded test session, that shadow + Hush
predictions are both present on every recommendation and the audit reconstructs a complete chain.

**6.2 🔴 A7 week-1 gate observability has no armed mechanism.** The hard gate needs a **cohort-segmented
first-session view** (completion rate, first-rep-failure rate by cohort tail) and a defined trigger to
**stop and re-anchor ES-008 v2**. Today nothing computes or surfaces this. *Must build before
launch* — the gate is the whole point of Phase 1.

**6.2 🟠 Operational observability is absent.** No uptime monitoring, no error-rate/latency tracking
(latency is a *thesis* concern — "calm"), no DB-size/health metric, no alerting. For a 30-day live
service you are otherwise blind to outages and slow requests. *Must:* basic uptime + error + latency
monitoring with alerting to a named on-call.

**6.3 🟠 No integrity-violation alerting.** Nothing alerts on a broken audit chain, a single-writer
violation, or a detected double-apply (§4.1/4.2). *Should:* lightweight invariant checks + alerts
(e.g., periodic referential-integrity scan; alert on any `StateWriter` bypass).

**6.4 🟡 Trial-health visibility (not athlete analytics).** Operators need to see who is training, who
has stalled, and completion counts — to run the trial, **not** as an athlete-facing feature
(distinct from the refused engagement analytics, Founder ch.8). *Should:* a minimal operator metrics
view off `/internal/metrics`.

---

## 7. Logging gaps

**7.1 🟠 End-to-end request correlation is likely absent.** A support ticket needs a `request_id` /
`client_event_id` flowing client → server → audit so one athlete event is traceable across tiers.
*Must:* propagate a correlation id and log it (it is also the §4.1 idempotency key — one mechanism,
two payoffs).

**7.2 🟠 Server operational logging.** The audit chain is the *domain* log, but exceptions, failed
requests, slow transactions, and migration runs need **structured, queryable operational logs** with
retention and access control. *Must:* structured logging + a place to read it.

**7.3 🟠 Privacy discipline in logs (must be set before, not after, launch).** Training + health data
are sensitive; rep counts, bodyweight, and health values must **not** be logged in the clear. The
mobile architecture specifies OSLog privacy annotations + MetricKit; the server needs the same
discipline. *Must:* a "no sensitive values in logs" rule enforced before the first real athlete.

**7.4 🟡 Client logging/crash capture depends on D1 and the app build.** MetricKit (Apple-native,
privacy-preserving) is the recommended crash/diagnostic path; if MetricKit latency is too slow for a
100-user trial, a privacy-respecting crash reporter is the flagged alternative. *Should:* decide and
wire crash capture as part of the app build.

---

## 8. Crash recovery risks

**8.1 🔴 Crash-recovery posture is UNDECIDED because D1 is open.** This is the category most exposed by
the open decision:
- **If D1 → Thin Client:** a set not yet POSTed is **lost on crash/termination**; mid-workout
  resumability depends on what the server already received. Combined with §4.1, an interrupted post
  is in an unknown state. **This is a real first-impression and data-loss risk** in exactly the gym
  conditions (poor signal, backgrounding) the D1 review documents.
- **If D1 → Local-First:** the outbox is durable-before-confirm; a reported set survives termination
  by construction, and idempotent retry makes interrupted posts safe.

*Must:* **resolve D1 before the app is built.** Launching with the crash-recovery posture undecided is
itself the blocker.

**8.2 🟠 Server crash/restart mid-transaction.** SQLite ACID + WAL should roll back a half-applied
learning step cleanly (§4.2), but this must be **verified under fault injection**, not assumed. A
deploy/restart during a live session must not corrupt in-flight state. *Must:* test it; prefer
graceful-drain deploys.

**8.3 🟡 App-update recovery.** If D1 → local-first, an app update mid-beta must run outbox-preserving
migrations (§3.5). If thin client, app update is near-stateless. *Decide with D1.*

---

## 9. Operational risks — first 30 days

**9.1 🔴 The biggest operational risk is the calendar.** The athlete-facing + operational half (API,
app, live instrumentation, deployment, backups, monitoring, support, enrollment) is **unstarted**, and
the repo is not yet an assembled runnable tree (§1). Building, deploying, instrumenting, and
**dress-rehearsing** all of it to the §11 checklist in ~30 days — *plus* recruiting and onboarding a
diversity-tailored cohort — is aggressive. *Recommendation:* treat the §11 blockers as the true launch
gate; if they cannot be closed, **slip the date rather than launch an untestable or lossy trial.**

**9.2 🔴 Deployment/hosting/secrets/TLS unspecified.** There is nowhere for the single service to run.
*Must:* a deployed environment (staging + prod), TLS, secret management for the operator key,
per-athlete tokens, and the DB on durable storage with backups (§4.3).

**9.3 🔴 The A7 gate must be armed with a stop/pause mechanism.** Week-1 is a **hard gate** with an
explicit abort ("stop and re-anchor ES-008 v2"). *Must:* a defined gate review (who, when, on what
data — §6.2), a way to **pause new first sessions** if seeds land unsafe for any cohort, and a comms
plan to the affected athletes. Staged rollout (a few internal testers → small external batch → full
100) so a seed-safety problem surfaces on a handful, not all hundred.

**9.4 🟠 No incident response / runbook.** No on-call, no rollback procedure, no "how to pause the
trial," no athlete-comms template. *Must:* a one-page runbook (deploy/rollback, restore-from-backup,
pause-trial, contact-cohort).

**9.5 🟠 Data export for analysis.** The trial exists to produce validation evidence (A7/A8/A9). Someone
must be able to extract and analyze it via `/internal/metrics` + audit. *Must:* a tested export path.

**9.6 🔵 Capacity is NOT a risk.** 100 users, sub-ms learning, single SQLite is comfortable. Resist
building scaling infrastructure (Anti-Requirement against scale we don't have, Build Plan §11). The
risk is operational maturity, not throughput.

**9.7 🔵 Provisional-parameter behavior may surprise.** Loads sit slightly conservative (equilibrium
bias) and κ/τ are knife-edge-sensitive; behavior is safe-by-design but may prompt "feels light"
tickets (§2.4, §5.3). **Do not tune parameters in response to field data** — that is a model-review
act, not an ops fix (PROJECT_STATUS §5; the parameter-adoption review is closed NO-ADOPTION).

---

## 10. Severity rollup

| # | Risk | Sev | Category |
|---|---|---|---|
| 6.1 | Validation instruments not live | 🔴 | Observability |
| 6.2 | A7 week-1 gate has no armed mechanism | 🔴 | Observability / Ops |
| 4.1 | No idempotency → silent double-learning | 🔴 | Data integrity |
| 4.2 | Transactional/single-writer not verified live | 🔴 | Data integrity |
| 4.3 | No backups / tested restore | 🔴 | Data integrity |
| 3.2 | `model_version` stamping must ship day one | 🔴 | Migration |
| 2.1 | Seed safety across cohort tails unvalidated | 🔴 | Onboarding (= the gate) |
| 5.1 | No operator audit/state tooling | 🔴 | Support |
| 8.1 | Crash-recovery undecided (D1 open) | 🔴 | Crash recovery |
| 9.1/9.2/9.3 | Calendar / deployment / armed gate | 🔴 | Operations |
| 2.2/2.3/2.5 | Onboarding↔seed mapping, equipment coverage, enrollment | 🟠 | Onboarding |
| 3.3 | Mid-beta live migrations | 🟠 | Migration |
| 4.4/4.5 | Clock-for-decay; lossless override capture | 🟠 | Data integrity |
| 5.2/5.3 | Support channel + account recovery; override triage | 🟠 | Support |
| 6.2/6.3 | Operational + integrity-violation monitoring | 🟠 | Observability |
| 7.1/7.2/7.3 | Correlation id; structured logs; log privacy | 🟠 | Logging |
| 8.2 | Server crash mid-transaction (verify) | 🟠 | Crash recovery |
| 9.4/9.5 | Runbook; data export | 🟠 | Operations |
| 2.4, 3.4, 3.5, 5.4, 6.4, 7.4, 8.3, 9.7 | (as listed) | 🟡/🔵 | various |

---

## 11. Pre-launch blocker checklist (must be green before the first athlete)

**Correctness & durability**
- [ ] Server **idempotency/dedup** on a client event id; replayed set report is a verified no-op. *(4.1)*
- [ ] **Transactional atomicity + single-writer** verified end-to-end on the deployed service, with a
      mid-chain fault-injection rollback test. *(4.2)*
- [ ] **Backups + WAL + a tested restore**; off-box storage; "no migration without a fresh backup". *(4.3, 3.3)*
- [ ] `model_version` / `capability_model_version` (and `catalog_version`) **stamped on every row**. *(3.2, 3.4)*
- [ ] Full additive migration chain run on the **real prod DB**; referential integrity asserted. *(3.1)*
- [ ] Server is the **authoritative clock** for all decay-relevant time. *(4.4)*

**The trial's instruments & gate**
- [ ] Shadow baseline (A8), override log (A9), fresh-state (A1), costly-case tags (A3) **live in the
      request path** and verified on a recorded session. *(6.1)*
- [ ] **A7 cohort-segmented first-session view** + a defined stop/pause-and-re-anchor mechanism. *(6.2, 9.3)*
- [ ] Lossless **override-target capture**, including off-catalog free text. *(4.5)*

**The athlete-facing build**
- [ ] **D1 resolved** (thin client vs local-first) before the app is built; crash-recovery posture
      chosen accordingly. *(8.1)*
- [ ] Assembled, **runnable, `pytest`-green** service tree (not snapshots). *(1)*
- [ ] API (Build Plan §4) + app (6 screens + onboarding + "why") built and dress-rehearsed.
- [ ] Onboarding→seed mapping validated; **equipment→catalog coverage** verified across declared
      equipment sets. *(2.2, 2.3)*

**Operations & support**
- [ ] Deployed env (staging + prod), TLS, secrets, **per-athlete tokens** in Keychain. *(9.2, 2.5)*
- [ ] **Uptime + error + latency monitoring** with alerting to a named on-call. *(6.2)*
- [ ] **Operator audit/state/metrics endpoints** live behind the operator key. *(5.1, 9.5)*
- [ ] **Structured operational logging** + correlation id + **no-sensitive-values-in-logs** rule. *(7.1–7.3)*
- [ ] **Support channel + account-recovery/re-provision procedure**; calibration-expectation script. *(5.2, 5.3)*
- [ ] **Incident runbook** (deploy/rollback, restore, pause-trial, contact-cohort) + **staged rollout**. *(9.3, 9.4)*
- [ ] **Enrollment + consent** pipeline (incl. consent for any optional RIR research subset). *(2.5)*

---

## 12. First-30-days operating plan (skeleton)

- **T-minus (pre-launch dress rehearsal):** run §11; do an end-to-end rehearsal with internal testers
  on the real prod stack (start → full workout → sync → audit reconstructs → metrics populated →
  restore-from-backup drill). No external athlete until this passes.
- **Staged rollout:** internal testers → ~10 external (tail-representative) → full 100, so seed-safety
  surfaces on a handful first. *(9.3)*
- **Week 1 — the hard gate:** daily cohort-segmented first-session review (completion + first-rep
  failure by tail). **If any cohort shows unsafe seeds: pause first sessions and escalate to a model
  review to re-anchor ES-008 v2** — do not patch parameters in the field. *(A7; 9.3, 9.7)*
- **Weeks 2–4:** monitor instrument completeness (shadow + override + audit present on every rec),
  override/off-catalog rates (patch the catalog via a `catalog_version` bump if A9 pressure is high —
  catalog data, not a model change), support tickets, uptime/latency, and trial health (who is
  training). Take a backup before any mid-beta migration.
- **Throughout:** the success/stop criteria are the validation plan's, not engagement metrics; the
  model and parameters stay frozen — field surprises are logged for a *later* model review, never
  tuned live.

---

## 13. Bottom line

The model is ready; **the trial is not, because the trial is more than the model.** None of the gaps
require a new feature or a model change — they are the deployment, durability, instrumentation,
observability, and support scaffolding a live human trial demands, plus resolving the one open
architecture decision (D1). Close the §11 blockers and arm the A7 gate, and a disciplined 100-user
beta is achievable. Launch without them and the most likely outcomes are an **untestable trial**
(instruments not live), **silent data corruption or loss** (no idempotency, no backups), and **no way
to help or diagnose** the first 100 people — failures that would burn the one scarce resource the whole
program exists to earn: trust.

---

*Readiness review only. No model change, no UX/UI change, no new product scope, no redesign. The
frozen model is authoritative as in `HUSH_V1_EXECUTION_CONTEXT.md`; status in
`HUSH_V1_PROJECT_STATUS.md`; the open client-architecture decision is
`reviews/decisions/D1_THIN_CLIENT_VS_LOCAL_FIRST.md`; the A7 hard gate is the Validation Architecture's.*
