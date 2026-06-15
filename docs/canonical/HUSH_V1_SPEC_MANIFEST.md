# HUSH_V1_SPEC_MANIFEST.md

> Source-of-truth map for the frozen Hush v1 document set. For every specification and
> review, this records its status, what modifies or replaces it, and whether it is canonical
> for implementation. This document only **classifies and maps** the existing set — it
> creates no new specifications and rewrites none.

> **════ STATUS UPDATE — DX-15 (2026-06-12) ════**
> The v1 build pivoted to **advisory** and added stagnation detection. Re-status of affected entries
> (details in each entry below): **ES-006** governor is now **advisory** (DX-03/DX-20); **ES-012**
> success is reoriented to stagnation/program value, authority deferred (DX-14); **ES-013** active
> investigation is **RETIRED in v1 → detection = M5** (DX-09).
> **Newly canonical / registered:**
> - **`HUSH_V1_PRODUCT_SPECIFICATION.md`** — Active; the canonical product framing (Hush is advisory;
>   the athlete owns load; stagnation-first; ≤1 insight/rec per week). Governs where it tightens the
>   older Founder/ES prose.
> - **`reviews/implementation/HUSH_V1_DELTA_EXECUTION_PLAN.md`** — Historical; the DX-01…DX-20 delta map.
> - **M1–M5 (Gap-Review milestones)** realized in code: M1 input-contract flip (DX-01/02/20), M2
>   predict-at-actual-load (DX-02), M3 governor advisory (DX-03), M4 exploration off (DX-04), M5
>   stagnation detection (DX-09). Completion records in `reviews/completion/`.
> **Since shipped (2026-06-12):** Option D seeding (DX-08), sticky preference (DX-10), instrumentation
> repoint (DX-12), and the **Wave-2 backend API shell** over the frozen model. As-built: **Schema v11,
> 284/284 tests** (model golden 189 + API pytest 95). What remains is off-host (Ops deploy / iOS / consent).

**Status definitions**

| Status | Meaning |
|---|---|
| **Active** | Current and authoritative as written. Implement directly. |
| **Superseded** | Fully replaced by a later document. Do NOT implement; read the replacement. |
| **Extended** | Still partially relevant, but a later document is the canonical implementation source for its core content. |
| **Historical** | Reasoning/context artifact (review, register, plan). Not a spec to implement against, but informs how and why. |

**Canonical-for-implementation** = the document an engineer codes against for that topic.

---

## 1. Foundational documents

### Founder Package
- **Status:** Extended
- **Modified/replaced by:** Hush Thesis v2 (thesis precision); ES-012 (replaces the acceptance-based North Star and the acceptance success gates); the full ES series (formalizes the prose ontology and decision hierarchy).
- **Canonical implementation source:** Hush Thesis v2 (for thesis/goal); the relevant ES specs (for mechanism). The Founder Package remains canonical for: the capability/exercise/fatigue *ontology intent*, the L1–L5 decision hierarchy framing, the Anti-Requirements, and Principle 8 (goals are athlete-owned).
- **Note:** Its North Star (recommendation acceptance) is explicitly invalidated — see ES-012.

### Hush Thesis v2
- **Status:** Active
- **Modified/replaced by:** — (current)
- **Canonical implementation source:** itself (product thesis, the Recommendation/Decision/Trust/Authority/Override distinctions, and the MVP goal = "become the default recommendation"; authority deferred to Phase 3).

---

## 2. Engineering specifications

### ES-001 — Execution Hierarchy
- **Status:** Active
- **Modified/replaced by:** — (Observation interpretation is later refined by ES-011's de-fatigue ordering, but the hierarchy/lifecycle itself is unchanged.)
- **Canonical implementation source:** ES-001.

### ES-002 — Exercise Catalog
- **Status:** Active
- **Modified/replaced by:** ES-010 reinterprets contribution weights as *load-space* attribution weights (does not change the catalog structure); ES-008 v2 adds the class constraint exercises must satisfy.
- **Canonical implementation source:** ES-002 (catalog structure), with ES-010 for how weights are applied and ES-008 v2 for class matching.

### ES-003 — Calibration
- **Status:** Active
- **Modified/replaced by:** — (Coverage and conservative-bias rules consumed by ES-009 composition and ES-008 v2 seeding.)
- **Canonical implementation source:** ES-003.

### ES-004 — Prediction Engine & Evidence Types
- **Status:** Extended
- **Modified/replaced by:** ES-005.1 (the prediction math); ES-011 (the previously-unspecified fatigue signal/adjustment); ES-010 (evidence attribution detail).
- **Canonical implementation source:** ES-005.1 (prediction math), ES-011 (fatigue), ES-010 (evidence). ES-004 remains canonical for the engine's *role and the catalogue of evidence types*.

### ES-005 — Quantitative Model (original)
- **Status:** Extended
- **Modified/replaced by:** ES-005.1
- **Canonical implementation source:** **ES-005.1.**
- **Note:** Treat ES-005 as the conceptual precursor; all numeric/formula authority is ES-005.1.

### ES-005.1 — Quantitative Model v1
- **Status:** Active
- **Modified/replaced by:** ES-011 amends §4 (effort_offset redefined as the *stable* component of a joint correction whose time-varying component is fatigue) and changes the attribution ordering it shares with ES-010 (de-fatigue in rep space before conversion).
- **Canonical implementation source:** **ES-005.1 — the math source of truth** for ReferenceStrength, Epley, blend, decay, confidence, discount, quantization. Apply ES-011's §4 amendment where fatigue is present.

### ES-006 — Recommendation Engine
- **Status:** Active — **but the L1 load governor is ADVISORY as built (DX-03 / DX-20).**
- **Modified/replaced by:** ES-011 (fatigue-aware decision conditions); ES-012 (override metrics); **DX-03/DX-20 (the governor computes & surfaces KEEP/INCREASE/DECREASE but emits the held load; the program load is the score-derived `target_load`)**. CHANGE_STRATEGY is an **advisory** surfacing via M5 (DX-09), **not** licensed by an investigation (ES-013 retired).
- **Canonical implementation source:** ES-006 for the decision computation, **read as advisory** (DX-03); ES-011 for fatigue gating (advisory); the M1 addendum on ES-005.1 for the advisory load output. See the ES-006 restatement addendum (DX-13).

### ES-007 — State Update Engine
- **Status:** Active
- **Modified/replaced by:** ES-010 (the conflict principle is realized as the variance term); ES-005.1 §5–6 (the blend/confidence math it applies).
- **Canonical implementation source:** ES-007 (ownership, gradual change, conflict principle), executing ES-005.1 math and the ES-010 variance term.

### ES-008 — Capability Calibration Matrix (original)
- **Status:** Superseded
- **Replaced by:** **ES-008 v2.**
- **Canonical implementation source:** ES-008 v2.
- **Note:** ES-008 v1's linear calibration tables were rejected (contradicted ES-005.1's exponential model, seeded too heavy, no cohort adjustment). Do NOT implement v1.

### ES-008 v2 — Capability Calibration Matrix v2
- **Status:** Active
- **Modified/replaced by:** — (current)
- **Canonical implementation source:** **ES-008 v2 — the calibration source of truth** for capability classes (A/B/C), observation types, shared-k curves and per-capability A_c, seeds, cohort multipliers, percentile normalization, and the quarantine rule.

### ES-009 — Session Composition Engine
- **Status:** Active
- **Modified/replaced by:** ES-009.1 inserts volume allocation between its Stage 2 and Stage 3 (and may require a second exercise slot per capability); ES-013 adds a recovery gate and the Investigation-Mode probe-slot interaction.
- **Canonical implementation source:** ES-009 (composition, selection, ordering), with ES-009.1 for slot counts and ES-013 for mode interaction.

### ES-009.1 — Volume Composition Engine
- **Status:** Active
- **Modified/replaced by:** ES-013 (the session ceiling becomes a fatigue ceiling once ES-011 is live); ES-011 (fatigue budget bounds volume).
- **Canonical implementation source:** ES-009.1, with ES-011 for the fatigue-aware ceiling.

### ES-010 — Attribution & Override Framework
- **Status:** Active
- **Modified/replaced by:** ES-011 overrules its Part A *ordering* for fatigued observations (de-fatigue in rep space happens before attribution).
- **Canonical implementation source:** ES-010 (load-space attribution, override taxonomy, conflict/variance), applying the ES-011 ordering amendment when fatigue is present.

### ES-011 — Fatigue & Recovery Model
- **Status:** Active
- **Modified/replaced by:** — (current)
- **Canonical implementation source:** ES-011.
- **Note:** ES-011 is itself an *amending* spec: it modifies ES-005.1 §4 and the ES-010 attribution ordering. Where ES-011 conflicts with the as-written text of those specs, ES-011 governs.

### ES-012 — Trust Measurement Framework
- **Status:** Active — **v1 success reoriented (DX-14).**
- **Modified/replaced by:** **DX-14** (v1 success = honest capability tracking + **stagnation detection / program value**, not load prediction; "minimize overrides" demoted — an override is a learning input; AUTHORITY deferred to Phase 3).
- **Canonical implementation source:** ES-012 for the trust concepts; **Phase-0 instruments built** (shadow baseline A8 + de-biased error, Sprint 4); full TrustScore/dashboard deferred. See the ES-012 restatement addendum (DX-14).
- **Note:** Replaces the Founder Package North Star (acceptance) with the TrustScore and shadow-baseline validation; under DX-14 the headline v1 success metric is stagnation detection + program value.

### ES-013 — Investigation & Plateau Resolution Framework
- **Status:** **RETIRED in v1 (DX-09).** The active investigation engine / mode controller / probe sequencer is **not built**.
- **Modified/replaced by:** **M5 stagnation detection (DX-09)** — read-only, advisory; `HUSH_V1_PRODUCT_SPECIFICATION.md` §12/§13. Plateau/stagnation **detection** ships as M5; CHANGE_STRATEGY is advisory (not investigation-licensed); goal change stays athlete-owned.
- **Canonical implementation source for v1:** `hush_model/stagnation.py` + `persistence/stagnation_service.py` (DX-09). The ES-013 probe/mode engine is **not** an implementation target in v1.
- **Retained as reference:** the plateau-cause taxonomy and "plateau = residual that survives experiment" inform the M5 trend gates. See the ES-013 restatement addendum (DX-13) and DX-17 notes on the Investigation/Plateau design inputs.
- **Derived from (read for rationale):** Plateau & Goal Transition Red Team Review → Plateau Investigation Framework → Investigation Engine Specification.

---

## 3. Reviews, registers, and plans

### Final Red Team Review of Hush v1
- **Status:** Historical
- **Modified/replaced by:** — (feeds the Assumptions Register)
- **Canonical implementation source:** not an implementation spec. Canonical for: the catalogue of contradictions, circular dependencies, unobservables, and MVP-untestable parts that implementation must respect.

### Plateau & Goal Transition Red Team Review
- **Status:** Historical
- **Modified/replaced by:** consolidated into ES-013.
- **Canonical implementation source:** ES-013. Read this review for the *why* (plateau as an experimentation problem; false-plateau causes).

### Plateau Investigation Framework
- **Status:** Historical (design input)
- **Modified/replaced by:** consolidated into ES-013.
- **Canonical implementation source:** ES-013. This document is the canonical *reference* for probe definitions and sequencing rationale.

### Investigation Engine Specification
- **Status:** Historical (design input)
- **Modified/replaced by:** consolidated into ES-013.
- **Canonical implementation source:** ES-013. This document is the canonical *reference* for mode transitions, investigation state, concurrency, and engine interactions.

### Hush v1 Assumptions Register
- **Status:** Active (Historical type)
- **Modified/replaced by:** — (current)
- **Canonical implementation source:** itself. Canonical for the assumption set (A1–A18+), risk levels, and MVP-testability. Implementation must honor its rule: code depending on A1–A6 records what it could not exclude; code depending on A7/A9 is instrumented for direct measurement.

### Hush Validation Architecture v1
- **Status:** Active (Historical type)
- **Modified/replaced by:** — (current)
- **Canonical implementation source:** itself, for the Phase 0/1/2/3 plan and per-assumption validation design (shadow baseline, fresh-state checks, cohort recruitment, fixed-τ decision).

### Hush v1 System Architecture
- **Status:** Active (Historical type)
- **Modified/replaced by:** — (current)
- **Canonical implementation source:** itself, for the consolidated engine/state/loop/audit picture and the core invariants. (For any specific rule, defer to the originating ES spec via HUSH_V1_TRACEABILITY.md.)

### Hush v1 Technical Build Plan
- **Status:** Active (Historical type)
- **Modified/replaced by:** — (current)
- **Canonical implementation source:** itself, for build order, MVP architecture, DB/API/model-package sequence, simulation harness, instrumentation, app scope, Phase 0 requirements.

### Sprint 0 (code + README)
- **Status:** Active
- **Modified/replaced by:** — (extended by subsequent sprints, not replaced)
- **Canonical implementation source:** itself, for the implemented model package, synthetic athlete simulator, and the verified-invariant test suite. It is the executable reference for the parts of ES-005.1 / ES-008 v2 / ES-007 / ES-010 already built.

---

## 4. Canonical implementation set (the "implement against these" list)

When writing code, these are the authoritative sources by topic:

| Topic | Canonical source |
|---|---|
| Product thesis / goal | Hush Thesis v2 |
| Ontology intent, decision hierarchy framing, Anti-Requirements, goal-ownership | Founder Package |
| Execution hierarchy & lifecycle | ES-001 |
| Exercise catalog structure | ES-002 (weights applied per ES-010; class per ES-008 v2) |
| Calibration coverage & conservative bias | ES-003 |
| Prediction math, blend, decay, confidence, discount, quantization | **ES-005.1** (apply ES-011 §4 amendment) |
| Capability classes, anchors, seeds, cohorts, normalization | **ES-008 v2** |
| Recommendation decisions & metrics | ES-006 (fatigue gating ES-011; strategy licensing ES-013; override metrics ES-012) |
| State update ownership, gradual change, conflict | ES-007 (math ES-005.1; variance ES-010) |
| Session composition / selection / ordering | ES-009 |
| Volume allocation | ES-009.1 (fatigue ceiling per ES-011) |
| Attribution & override taxonomy & conflict | ES-010 (ordering per ES-011) |
| Fatigue & recovery | ES-011 |
| Trust measurement & validation metrics | ES-012 |
| Investigation, probes, plateau, strategy licensing | ES-013 |
| Assumption discipline | Assumptions Register |
| Validation phases & gates | Validation Architecture |
| Build order & MVP architecture | Technical Build Plan |
| Executable model reference | Sprint 0 code |

**Do-not-implement list (superseded):** ES-005 (use ES-005.1) · ES-008 v1 (use ES-008 v2) ·
Founder Package North Star (use ES-012) · ES-010 Part A ordering as-written for fatigued
observations (use ES-011's ordering).
