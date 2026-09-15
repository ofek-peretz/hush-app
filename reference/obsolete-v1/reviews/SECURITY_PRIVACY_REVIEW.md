# Security & Privacy Review — Hush v1

> Complete security and privacy review of Hush v1 **as it exists today**, ahead of implementation and
> the 100-user beta. Assumes Apple Health integration, user accounts, and **future** cloud sync; the
> model, architecture, and UX/UI are **frozen**. This review **does not redesign the product and
> proposes no new features** — every mitigation noted is a security/privacy *control* (configuration,
> process, operational, or legal), not product scope, and where a real mitigation would require an
> architecture change it is flagged as a **tension requiring a decision**, not a redesign imposed here.
> Governing rule respected: *no redesign without explicit model review.*
>
> Date: 2026-06-10 · Model: Hush v1 (frozen) · Build: Sprint 0–4 ✅ (server pipeline; **no API/app/auth
> built yet**) · Auth model of record: per-athlete bearer token + one operator key, no rate limiting
> (Build Plan §4) · Sources: Build Plan §4/§5/§9 · `schema.py` · `MOBILE_ARCHITECTURE_V1.md` (§9 Health,
> §10–11 telemetry/logging, §14 privacy) · `D1_THIN_CLIENT_VS_LOCAL_FIRST.md` · `BETA_READINESS_REVIEW.md`.

> **HEADLINE VERDICT — THE POSTURE IS "MINIMAL BY DESIGN, UNHARDENED BY DEFAULT," WITH TWO STRUCTURAL
> TENSIONS THAT MUST BE DECIDED BEFORE LAUNCH.** Hush's privacy *intent* is strong — it refuses RIR,
> refuses engagement analytics, keeps Health out of the learning loop, and collects little. But the
> security *controls* around that data are almost entirely **unbuilt and unspecified**: authentication
> is a single static bearer token with no revocation/rotation, the operator key is one shared
> all-athlete master secret, the database is **plaintext at rest**, and authorization (per-token object
> access) has no implementation yet. Two tensions are **architectural and cannot be papered over**:
> (1) the **immutable audit chain vs. the right to erasure** — a withdrawing trial participant cannot be
> deleted without breaking the integrity guarantee; and (2) **token-only identity vs. account recovery**
> — with no verified identity factor, recovery is either *impossible* (data loss) or *socially
> engineerable* (account takeover). Health/demographic data on a deliberately diversity-tailored ~100
> cohort is **special-category, highly re-identifiable** data; handling it without encryption-at-rest,
> a lawful basis, a DPIA, and a retention/erasure policy is the dominant pre-launch exposure.

---

## 0. Executive summary

The product's **privacy-by-restraint** is real and should be credited: no RIR (an Anti-Requirement),
no third-party analytics/tracking SDKs, no ad/attribution, MetricKit-only diagnostics, and a hard rule
that Apple Health never feeds the learning loop. Data collection is minimal (sex, age, experience,
training history, optionally bodyweight + workouts).

The exposure is that **nothing protecting that data is built or hardened yet**, and the trial concerns
**special-category (health) data** on a **small, deliberately-identifiable cohort**:

- **Authentication (🔴):** one static, long-lived bearer token per athlete; no expiry, rotation, or
  revocation; one shared operator key that is a master key to *all* athletes' data. No rate limiting.
- **Authorization (🔴):** per-token object access (IDOR prevention) has no implementation; the server
  must derive `athlete_id` from the token, never trust client-supplied IDs — currently unenforced
  because the API doesn't exist yet.
- **Data at rest (🔴):** a single SQLite file holds all athletes' demographics + full training history
  in **plaintext**; no server-side encryption specified; no backups yet (and backups, when added, are a
  new plaintext copy to protect).
- **Erasure vs. immutable audit (🔴 tension):** the append-only history cannot honor a deletion request
  without breaking the audit chain — a GDPR/CCPA conflict baked into the frozen architecture.
- **Account recovery (🟠 tension):** token-only identity has nothing to verify recovery against —
  recovery is data-loss or takeover-prone.
- **Compliance (🟠):** health + demographics on EU/CA participants → lawful basis, explicit
  special-category consent, a DPIA, processor DPAs, retention policy, and Apple HealthKit
  privacy-policy obligations — none in place.
- **Cloud sync (🟠, future):** centralizes longitudinal health-adjacent data into a honeypot; event
  authenticity, TLS/pinning, idempotency-as-anti-replay, and residency all need controls.

None of these requires redesigning the frozen product. They require **deciding and building the
controls** that a token-and-database architecture leaves to the implementer, and **deciding the two
tensions** before a single real athlete's data exists. The detail and a pre-launch control checklist
(§13) follow.

---

## 1. Assets, adversaries, and trust boundaries

**Assets (in rough order of sensitivity):**
- Athlete **health & demographic data**: bodyweight (special-category health data, GDPR Art. 9),
  sex/age, training history (health-adjacent), Apple Health workouts.
- The **immutable audit chain**: the most complete longitudinal record of each athlete.
- **Credentials**: per-athlete tokens; the **single operator key** (master access to all athletes).
- **Trial integrity**: the learning state and audit must be authentic for the validation to mean
  anything.

**Adversaries / threat scenarios:**
- **Lost/stolen device** (most likely): local DB + token at risk.
- **Stolen/leaked token** (static, long-lived): full account access, anywhere, indefinitely.
- **Curious or malicious athlete**: tampering with their own events; probing other athletes' objects
  (IDOR) via the API.
- **Network MITM**: token capture, event replay.
- **Server compromise / stolen backup / cloud snapshot**: full plaintext breach of all athletes.
- **Insider / over-broad operator access**: the single operator key grants undifferentiated,
  unaudited access to identified health data.
- **The trial itself as a privacy risk**: a diversity-recruited small cohort segmented by tail
  (older/female/detrained) is **highly re-identifiable** even "anonymized."

**Trust boundaries:** device ↔ network ↔ single service ↔ single SQLite DB; plus Apple Health (on
device) and (future) the cloud-sync channel. The frozen architecture concentrates everything behind
one service and one database — high blast radius by construction.

---

## 2. Security risks

- **S1 — Static, long-lived bearer tokens are the entire auth model (🔴).** A captured token (lost
  device, leaked log, MITM, insecure provisioning email) grants full account access with **no expiry,
  rotation, or revocation** path specified. *Control (no redesign):* high-entropy random tokens,
  TLS-only transport, a server-side **revocation/rotation** capability, and short-ish rotation for the
  beta. Token must be stored with a restrictive Keychain class (`...WhenUnlockedThisDeviceOnly`), never
  `Always`.
- **S2 — The single operator key is an all-athlete master secret (🔴).** One shared key behind
  `/internal/athletes/{id}/audit|state|metrics` grants undifferentiated, unaudited access to every
  athlete's identified health data; its leak is a total breach with no per-operator accountability.
  *Control:* treat it as a crown-jewel secret (secrets manager, not source/config), restrict network
  exposure of `/internal/*`, and **log every operator access** (see OS2).
- **S3 — Database is plaintext at rest, single file, soon backed up (🔴).** All athletes'
  demographics + training history in one unencrypted SQLite file; a stolen disk/backup/snapshot is a
  full breach. *Control:* full-disk/volume encryption at minimum (e.g., encrypted EBS/host disk), and
  **encrypted, access-controlled backups** when backups are added (cross-ref `BETA_READINESS_REVIEW.md`
  §4.3). SQLCipher is an option but is closer to an architecture change — disk encryption fits the
  frozen design.
- **S4 — No rate limiting (by explicit decision, Build Plan §4) (🟠).** Acceptable for throughput at
  100 users, but it removes a defense against **token brute-forcing** and abuse. With weak tokens (S1)
  this becomes exploitable. *Control:* basic auth-failure throttling / lockout even if general rate
  limiting is skipped.
- **S5 — Mobile local store on a possibly-compromised device (🟠).** The local DB/outbox (D1 Option B)
  holds health-adjacent data on device. *Control:* iOS Data Protection (`NSFileProtectionComplete`),
  Keychain accessibility class (S1), and a documented stance on jailbroken devices.
- **S6 — Sensitive data in logs (🟠).** Rep counts, bodyweight, and health values must never reach
  server or client logs (the mobile arch specifies OSLog `.private`; the server needs the same). A
  single verbose error log of a request body leaks health data. *Control:* a "no sensitive values in
  logs" rule, enforced before launch (cross-ref Architectural Audit DG, Beta Review §7.3).
- **S7 — Supply-chain & build integrity (🟡).** Python deps + Swift packages (GRDB, etc.) need pinning
  + SCA; and the deployable server is a **generated artifact** from `assemble_and_test.py` (Architectural
  Audit MR1/OC3) — build provenance/integrity should be controlled (reproducible, checksummed).
- **S8 — Injection (🔵, currently low).** The model/repositories use **parameterized** SQL throughout
  (positional `?`), so SQLi risk is low *in the existing code*; the **API layer (unbuilt)** must keep
  this discipline and validate/bound all inputs (cross-ref DI3).

---

## 3. Privacy risks

- **P1 — Special-category data on a re-identifiable micro-cohort (🔴).** Bodyweight is health data
  (GDPR Art. 9); combined with sex/age and the deliberately tail-recruited ~100 cohort, "anonymized"
  training data is **readily re-identifiable** (a diverse N=20 tail is the validation's own design).
  *Control:* treat all trial data as identified special-category data; minimize, access-control, and
  segregate any analysis exports.
- **P2 — Collecting Health data the v1 model does not use (🟠).** Bodyweight is read from HealthKit as
  "profile-only / forward-looking for Class-B," but **Class-B is frozen inactive** — so v1 reads health
  data it does not use. This violates **data minimization** and invites App Store HealthKit scrutiny
  (read justification). *Decision needed (not a redesign):* either **don't read bodyweight in v1**
  (cleanest — it's unused) or document a concrete, consented justification. The frozen model does not
  need it.
- **P3 — Right-to-erasure vs. immutable audit chain (🔴 tension — see §10).** Append-only history
  cannot delete a withdrawing participant's data without breaking the integrity guarantee the product
  depends on. This is a structural conflict, not an oversight.
- **P4 — No data-retention policy (🟠).** How long is trial data kept, and what happens to it after the
  beta? Undefined. Indefinite retention of special-category data is a compliance and breach-exposure
  liability.
- **P5 — Third-party processors (🟡).** Any cloud host, and the cloud-sync backend, are data processors
  requiring DPAs and disclosure. Apple (TestFlight, HealthKit, MetricKit) processes data per its terms.
  The good news: **no analytics/ad/tracking processors** (refused) — keep it that way.
- **P6 — Operator visibility into identified health data (🟡).** The audit/state endpoints expose
  identified longitudinal data to anyone with the operator key (S2); privacy requires need-to-know +
  access logging, not just a working key.

---

## 4. Authentication risks

- **A1 — Token *is* the identity; no proofing, no second factor (🟠).** Acceptable for a closed beta,
  but it means there is **nothing to verify a person against** later (the root cause of the recovery
  tension, §8). No MFA is fine for v1 scope; the gap is the *absence of any durable identity factor*.
- **A2 — Provisioning/distribution channel (🟠).** How the athlete receives their token (enrollment
  email, invite link) is an interception point; a token mailed in clear text is a credential in an
  inbox. *Control:* deliver tokens over a secure channel; never embed in URLs/logs.
- **A3 — No revocation/rotation (🟠).** Lost device or suspected leak has no "revoke this athlete's
  token" mechanism specified. *Control:* a revocation list / token-version column the API checks.
- **A4 — Token not device-bound (🟡).** A copied token works from any client. Device binding is an
  option but borders on architecture change; at minimum, anomalous-use monitoring (OS2).
- **A5 — Operator auth has no per-user accountability (🟠).** One shared key = no "who accessed what"
  (ties to S2/P6).

---

## 5. Data integrity risks (security lens)

- **DI1 — No authorization / IDOR exposure (🔴).** Endpoints address objects by id
  (`/sessions/{id}/sets`, `/blocks/{id}/replace`, `/internal/athletes/{id}/...`). The server **must
  enforce that a token may only touch its own athlete's objects** and **derive `athlete_id` from the
  token**, never trust a client-supplied id. UUIDs reduce guessability but are **not** an authorization
  control. Unbuilt today → must be a first-class API requirement.
- **DI2 — Event forgery / replay in the learning pipeline (🔴 with cloud sync).** The server replays
  client-authored events into the authoritative model. Without (a) binding events to the authenticated
  athlete and (b) **idempotency/dedup**, a malicious or buggy client can **double-apply or forge
  observations**, corrupting model state and the audit. Idempotency is simultaneously a correctness
  control (Beta Review §4.1) and an **anti-replay** security control. *Control:* server-derived
  identity + idempotency keys scoped per athlete.
- **DI3 — Unbounded input corrupts state (🟠).** Client-supplied rep counts/weights must be
  **range-validated** server-side; an absurd `actual_reps` (or negative/huge values) corrupts learning
  and could trigger numeric issues. The frozen model trusts its inputs; the API boundary must not.
- **DI4 — Audit integrity is convention-enforced, not tamper-evident (🟡).** The Architectural Audit
  found immutable history is enforced by convention, not storage, and status fields are already
  UPDATEd. For a system whose entire claim is "every conclusion reconstructable," there is **no
  tamper-evidence** (no hash-chaining/signing). Hardening this fully borders on architecture change;
  at minimum, restrict write access and log mutations. *Flag as a tension, not a v1 redesign.*

---

## 6. Health-data handling concerns

- **H1 — Maintain the "Health never enters the learning loop" boundary (🟢 keep).** The mobile
  architecture's §9.1 hard rule (no HealthKit metric feeds fatigue/observation) is the correct privacy
  *and* model boundary; it must be enforced structurally (no code path HealthKit→outbox) and never
  relaxed. Credit where due.
- **H2 — HealthKit policy obligations (🟠).** Apple requires: a **privacy policy**, **no using
  HealthKit data for advertising/marketing/data-mining**, **no sharing with third parties**, and clear
  usage-permission strings. Writing `HKWorkout` is benign; **reading body mass needs a justification**
  that v1 cannot really give (P2). *Control:* privacy policy + honest usage strings; resolve P2.
- **H3 — Health-derived data leaving the device on cloud sync (🟠, future).** If workouts/bodyweight
  sync to the cloud, health-adjacent data leaves the device — requiring explicit disclosure/consent,
  TLS in transit, and encryption at rest (S3). Keep Health-origin data clearly labeled and minimized in
  what syncs.
- **H4 — Physical-safety / medical-claim boundary (🟡).** Load recommendations carry **injury risk**;
  the product must make **no medical claims** (not a medical device) and obtain a **physical-risk
  consent/waiver** at enrollment. The A7 seed-safety gate is the technical mitigation; the consent is
  its legal shadow.

---

## 7. Compliance concerns

- **C1 — GDPR (if any EU participant) (🟠):** lawful basis = **explicit consent** for a trial;
  **special-category (health) data** triggers Art. 9 explicit consent + safeguards; a **DPIA is likely
  mandatory** (systematic profiling + health data + novel technology on a vulnerable-tail cohort);
  data-subject rights (access, **erasure** — see §10, portability), processor **DPAs**, possible
  cross-border transfer safeguards if US-hosted, and **72-hour breach notification** readiness.
- **C2 — CCPA/CPRA (California participants) (🟡):** notice at collection, deletion rights, no "sale"
  (true — keep it), and the higher bar for sensitive personal information.
- **C3 — Apple App Store / HealthKit / TestFlight (🟠):** mandatory privacy policy, App Privacy
  "nutrition label" (should read *Data Not Used to Track You* — accurate here), HealthKit guideline
  compliance (H2), App Review §5 health scrutiny, and TestFlight beta terms. ATT is a non-issue (no
  tracking).
- **C4 — Research/human-subjects framing (🟡):** the program is explicitly a validation trial measuring
  assumptions on people; if framed as research (especially if the optional **RIR research subset** is
  used), consider **informed-consent norms / ethics (IRB-equivalent) review**, separate from product
  ToS.
- **C5 — Retention & records vs. erasure (🟠):** define a retention policy (P4) and reconcile it with
  the immutable audit (§10) and with any obligation to retain trial records.

---

## 8. Account recovery risks

- **R1 — Token-only identity makes recovery a dilemma (🟠 tension).** With no verified email/phone/MFA
  (A1), there is **nothing to authenticate a recovery against**. So account recovery is forced to one
  of two bad poles:
  - **No recovery** → a reinstall/new device/lost Keychain **loses the athlete's account and training
    history** (trial data loss + the corrosive-to-trust experience the Beta Review flagged), or
  - **Operator-assisted recovery** → support re-issues a token, which is **account takeover by social
    engineering** and means the operator can impersonate any athlete (compounds S2).
- **R2 — Recovery is the classic takeover vector (🟠).** Any recovery channel added later (magic link,
  support flow) becomes the weakest link; it must verify *something* the legitimate athlete holds.
  *Decision needed before launch (not a feature redesign):* either accept "no recovery, possible data
  loss" for the beta and **say so in consent**, or introduce a **minimal verified identity factor at
  enrollment** (e.g., a verified email used solely for recovery) — a control decision, kept out of the
  frozen six-screen flow by handling it at enrollment/out-of-band.
- **R3 — Cloud-sync recovery needs a durable identity to re-auth and re-pull (🟡).** The
  server-authoritative projection makes data *restorable* after recovery — **but only if** there is an
  identity to re-authenticate (R1). Sync mitigates *data loss*, not the *authentication* gap.

---

## 9. Cloud-sync risks (future)

- **CS1 — Centralization honeypot (🟠).** Cloud sync aggregates every athlete's longitudinal
  health-adjacent record server-side — maximizing breach impact (S3 at scale). Encryption at rest +
  least-privilege + access logging become non-optional.
- **CS2 — Event authenticity & anti-replay (🔴 with sync).** Per DI2: derive identity from the token,
  validate/bound inputs, and use per-athlete idempotency keys so a captured event batch cannot be
  replayed to corrupt state.
- **CS3 — Transport security (🟠).** TLS 1.2+; consider **certificate pinning** for a high-trust health
  app (the mobile arch currently assumes ATS defaults). MITM on the sync channel = token capture +
  event tampering.
- **CS4 — Data residency / cross-border (🟡).** Where the sync backend lives determines GDPR transfer
  obligations (C1).
- **CS5 — Backup security at scale (🟠).** The cloud DB's backups are additional full plaintext copies
  unless encrypted + access-controlled + retention-bounded (ties S3/P4).
- **CS6 — Multi-device implies token sharing (🟡, out of v1 scope).** Sync naturally invites multiple
  devices per athlete; the static-token model has no clean multi-device story (each copy is a
  long-lived credential). Note for when sync lands.

---

## 10. Two structural tensions that must be *decided*, not engineered away

These fall out of the **frozen** architecture; this review does not resolve them (that would be
redesign) — it states them so they are decided consciously before real data exists.

- **T1 — Immutable audit chain vs. right to erasure (P3/C1/DI4).** The product's integrity guarantee
  (append-only, every conclusion reconstructable) is in **direct conflict** with a participant's right
  to be deleted. Options that fit the frozen design are *policy*, not redesign: (a) crypto-erasure
  (encrypt per-athlete, destroy the key on erasure — but this touches storage), (b) a documented legal
  basis for retention of trial records during the study with deletion at study end, or (c) consent that
  explicitly scopes retention. **A decision is required before enrolling an EU/CA participant.**
- **T2 — Token-only identity vs. recoverable accounts (R1/R2).** Pick the pole deliberately: accept
  no-recovery-with-possible-data-loss (and disclose it), or add a minimal verified recovery factor at
  enrollment. **Decide before launch**; do not discover it when the first athlete reinstalls.

---

## 11. What is healthy (credit where due)

- **Privacy by restraint:** refuses RIR, refuses engagement/ad/tracking analytics, MetricKit-only
  diagnostics, minimal data collection.
- **Health kept out of the learning loop** (mobile arch §9.1) — a correct, enforceable boundary.
- **Parameterized SQL** throughout the existing code (low SQLi risk in what's built).
- **No "sale" of data, no third-party trackers** — a clean CCPA/ATT posture.
- **An audit chain exists** — the integrity *primitive* is present (its enforcement and erasure
  reconciliation are the gaps, DI4/T1).

The posture is *privacy-thoughtful, security-unbuilt* — the right foundation, missing its controls.

---

## 12. Severity rollup

| Sev | Findings |
|---|---|
| 🔴 Critical | S1 (static tokens) · S2 (operator master key) · S3 (plaintext at rest) · DI1 (authz/IDOR) · DI2/CS2 (event forgery/replay) · P1 (re-identifiable health data) · P3/T1 (erasure vs immutable audit) |
| 🟠 High | S4, S5, S6, A1, A2, A3, A5 · P2, P4, P6 · DI3 · H2, H3 · C1, C3, C5 · R1, R2 · CS1, CS3, CS5 · T2 |
| 🟡 Medium | S7 · A4 · DI4 · H4 · C2, C4 · P5 · R3 · CS4, CS6 |
| 🔵 Low / keep | S8 · H1 (keep) · the §11 healthy items |

---

## 13. Pre-launch control checklist (no redesign; controls + decisions only)

**Decide before any real athlete data exists**
- [ ] **T1** — erasure vs. immutable-audit reconciliation (retention basis / crypto-erasure / consented
      scope). *(P3/C1)*
- [ ] **T2** — recovery posture: no-recovery-disclosed **or** minimal verified factor at enrollment. *(R1/R2)*
- [ ] **P2** — read bodyweight in v1 at all? (Recommend **no** — unused by the frozen model.)

**Authentication & authorization (must exist in the API from day one)**
- [ ] High-entropy random tokens; TLS-only; restrictive Keychain class; **revocation/rotation**. *(S1/A3)*
- [ ] Server **derives `athlete_id` from the token**; per-token object authorization (no IDOR). *(DI1)*
- [ ] **Idempotency/dedup** as anti-replay + anti-double-apply; bound/validate all inputs. *(DI2/DI3)*
- [ ] Operator key in a secrets manager; `/internal/*` network-restricted; **operator access logged**. *(S2/A5/P6)*
- [ ] Auth-failure throttling even without general rate limiting. *(S4)*

**Data protection**
- [ ] **Encryption at rest** (disk/volume) for the DB; **encrypted, access-controlled, tested backups**. *(S3)*
- [ ] iOS Data Protection + Keychain class on device. *(S5)*
- [ ] **No sensitive values in logs** (server + client), enforced. *(S6)*
- [ ] Dependency pinning + SCA; controlled build provenance. *(S7)*

**Health & compliance**
- [ ] HealthKit **privacy policy** + honest usage strings; **no third-party Health sharing / no ads**. *(H2)*
- [ ] **Physical-risk consent/waiver** + **explicit special-category consent** at enrollment. *(H4/C1)*
- [ ] **DPIA** (if EU); processor **DPAs**; **retention policy**; breach-notification readiness. *(C1/C5)*
- [ ] App Privacy label = *Data Not Used to Track You*; confirm research/ethics framing if RIR subset used. *(C3/C4)*

**Cloud sync (gate before it ships)**
- [ ] TLS 1.2+ (+ consider pinning); event authenticity (CS2); encrypted at rest + backups at scale;
      residency decision; least-privilege + access logging. *(CS1–CS5)*

---

## 14. Bottom line

Hush is **privacy-minded but security-unbuilt**: it collects little and refuses the invasive inputs,
yet the controls that would protect what it *does* collect — real authentication, authorization,
encryption at rest, revocation, access logging, consent, retention, and erasure — are essentially all
still to be built, and two of them (**erasure vs. the immutable audit**, and **recovery vs. token-only
identity**) are **structural decisions** the frozen architecture forces rather than bugs to fix. The
data at stake is **special-category health data on a small, deliberately-identifiable cohort**, so the
margin for error is small. None of this needs a product redesign or a new feature — it needs the
security/privacy controls a token-and-database system leaves to its implementer, plus two conscious
decisions made **before** the first athlete's data exists. Make those decisions and build the §13
controls, and Hush can hold its trial data as carefully as it already declines to over-collect it.

---

*Security & privacy review only. No model change, no UX/UI change, no architecture redesign, no new
product scope. The frozen model is authoritative as in `HUSH_V1_EXECUTION_CONTEXT.md`. Related:
`reviews/BETA_READINESS_REVIEW.md`, `reviews/ARCHITECTURAL_AUDIT_HUSH_V1.md`,
`reviews/decisions/D1_THIN_CLIENT_VS_LOCAL_FIRST.md`.*
