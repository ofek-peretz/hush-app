# HUSH_V1_INDEX.md

> Complete inventory of the frozen Hush v1 document set, what each contains, and how they
> relate. Use this to find the authoritative source for any topic. For rule-level origins,
> see HUSH_V1_TRACEABILITY.md.

> **════ AS-BUILT REGISTER — DX-15 (2026-06-12) ════**
> Documents added/registered since the original frozen set, and re-status pointers:
> - **`HUSH_V1_PRODUCT_SPECIFICATION.md`** — the canonical product framing (advisory; athlete owns
>   load; stagnation-first; ≤1 insight/rec per week). The governing product document for v1.
> - **`reviews/implementation/HUSH_V1_DELTA_EXECUTION_PLAN.md`** — the DX-01…DX-20 delta map (Sprint 4 → v1).
> - **`reviews/completion/`** — per-delta completion reports: `M1_`, `DX-11_`, `DX-09_`, `DX-03_`,
>   `DX-04_`, `WAVE_1_`, `SPRINT_3A/3B1/3B2/4_`.
> - **Re-status:** ES-006 governor **advisory** (DX-03/DX-20); ES-012 v1 success **reoriented** to
>   stagnation/program (DX-14); **ES-013 RETIRED in v1 → detection = M5** (DX-09). Each frozen ES `.docx`
>   carries a dated DX-13/14 restatement addendum. As-built status anchor: `HUSH_V1_PROJECT_STATUS.md`
>   (Schema v11, 284/284 — DX-08/10/12 + Wave-2 backend API shell shipped 2026-06-12).

---

## 1. The document set

### Foundational

| Document | What it contains |
|---|---|
| **Founder Package** | The origin vision: product philosophy, the capability/exercise/fatigue ontology in prose, the decision hierarchy (L1–L5), Anti-Requirements, the (later-replaced) acceptance North Star, the trust ambition, and the two-phase validation intent. |
| **Hush Thesis v2** | The reconstructed, precise product thesis. Distinguishes Recommendation / Decision / Trust / Authority / Override; reframes the MVP goal from "take over decisions" (authority) to "become the default recommendation" (validatable), deferring authority to Phase 3. |
| **HUSH_V1_PRODUCT_SPECIFICATION** | **Canonical product framing (v1).** Hush is advisory and *not* a load-authority system: the athlete owns load and logs real weight+reps; program structure is stable; **stagnation is the primary weekly trigger** (≤1 insight + ≤1 optional rec). The governing product document — read first alongside Thesis v2. |

### Engineering specifications (frozen)

| Document | Scope |
|---|---|
| **ES-001** | Execution hierarchy: WorkoutSession → ExerciseBlock → Set; observation reporting; skip/replace lifecycle. |
| **ES-002** | Exercise catalog: capability mappings, contribution weights, difficulty_factor, equipment_type, replacement groups, catalog versioning. |
| **ES-003** | Calibration: onboarding inputs, full-capability coverage in 3–5 workouts, information-gain priority, conservative bias (Principle #39). |
| **ES-004** | Prediction Engine + evidence types (incl. the originally-unspecified fatigue signal). |
| **ES-005.1** | **Quantitative Model — the math source of truth.** ReferenceStrength (A·e^{kS}), Epley (3 directions), target vs reps-to-failure, precision-weighted blend, decay, three-level confidence, conservative discount, quantization, effort_offset. Supersedes ES-005. |
| **ES-006** | Recommendation Engine: decision hierarchy (KEEP/INCREASE/DECREASE/REPLACE/CHANGE_STRATEGY), confidence gate, three non-collapsed override metrics, explainability. **(v1: L1 load governor is ADVISORY — DX-03/DX-20; CHANGE_STRATEGY is an advisory M5 surfacing.)** |
| **ES-007** | State Update Engine: ownership rules ("only X writes Y"), gradual change, conflict principle. |
| **ES-008 v2** | **Capability Calibration Matrix — the calibration source of truth.** Capability classes A/B/C, observation types, shared-k curves + per-capability A_c, seeds, cohort multipliers, percentile-comparable normalization, quarantine rule. Supersedes ES-008 v1 (linear tables, rejected). |
| **ES-009** | Session Composition Engine: capability-first composition, split templates by frequency, exercise selection, exploration floor, compound-first ordering. |
| **ES-009.1** | Volume Composition Engine: weekly volume bands → per-capability sets, two-lever allocation (slots × sets), focus weighting, session ceiling, calibration restraint. |
| **ES-010** | Attribution & Override Framework: load-space multi-capability attribution, override taxonomy (6 types → 4 categories), conflict/variance confidence suppression. |
| **ES-011** | Fatigue & Recovery Model: fatigue = capability − observed; systemic + capability fatigue; generation/accumulation/decay; de-fatigue before attribution; fatigue-aware decisions. Amends ES-005.1 §4 and ES-010 ordering. |
| **ES-012** | Trust Measurement Framework: TrustScore = Trustworthiness × CostlyDeference × DiscernmentRetained; replaces the acceptance North Star; shadow-baseline validation; false-positive safeguards. **(v1 success reoriented to stagnation/program value; authority deferred to Phase 3 — DX-14.)** |
| **ES-013** | Investigation & Plateau Resolution: Recommendation vs Investigation Mode; probe framework + sequencing; investigation confidence; strategy-change licensing; goal-transition triggers. **(v1: RETIRED — active investigation not built; replaced by read-only M5 stagnation detection — DX-09.)** |

### Reviews, registers, and plans (governance & execution)

| Document | Purpose |
|---|---|
| **Final Red Team Review of Hush v1** | Adversarial review of the full model: remaining contradictions, circular dependencies, unobservables, uncalibratable parameters, missing data, MVP-untestable parts. |
| **Plateau & Goal Transition Red Team Review** | Why plateau detection is an experimentation problem; false-plateau causes; observable vs inferred variables; the assumptions required to declare "progress stopped." Precedes ES-013. |
| **Plateau Investigation Framework** | The four probes (deload/challenge/volume/exercise), their hypotheses/outcomes/interpretation, and optimal cheapest-first sequencing. Feeds ES-013. |
| **Investigation Engine Specification** | The mode controller: when to enter Investigation Mode, investigation state, concurrency, confidence, engine interactions, lifecycle. Feeds ES-013. |
| **Hush v1 Assumptions Register** | Every unresolved assumption (A1–A18+) with falsification, validation data, sample size, horizon, MVP-testability, risk. |
| **Hush Validation Architecture v1** | Per-assumption validation design + the Phase 0/1/2/3 roadmap (offline harness → safety → learning/trust → durability). |
| **Hush v1 System Architecture** | The consolidated end-to-end architecture: engines, states, decision layers, modes, loops, audit chains, invariants, safety/trust mechanisms. |
| **Hush v1 Technical Build Plan** | The 1–3 engineer execution roadmap: build order, MVP architecture, DB/API sequence, model package, simulation harness, instrumentation, app scope, Phase 0. |
| **Sprint 0 (code + README)** | The first executable slice (this is built, not just specified). |
| **HUSH_V1_PROJECT_STATUS** | **Canonical project status** (current: Wave-2 backend close — Schema v11, 284/284): what is built/deferred/unproven, architecture state, test counts, next steps. The status anchor; supersedes the root `CURRENT_STATUS`. |

---

## 2. How the documents relate

**Vision → thesis → specs → reviews → plans → code.** The flow is:

```
Founder Package ─────────────────────────────────────────────► (origin vision)
      │
      ▼
Hush Thesis v2 ──────────────────────────────────────────────► (precise, validatable goal)
      │
      ▼
ES-001 … ES-013 ─────────────────────────────────────────────► (frozen mechanism)
   ├─ ES-005.1  = math source of truth (everything numeric refers here)
   ├─ ES-008 v2 = calibration source of truth (every capability constant here)
   └─ later specs amend earlier where stated (ES-011 amends ES-005.1 §4 + ES-010 order)
      │
      ▼
Red Team Reviews + Assumptions Register ─────────────────────► (what's wrong / unproven)
      │
      ▼
Validation Architecture + System Architecture + Build Plan ──► (how to prove / build it)
      │
      ▼
Sprint 0 code ───────────────────────────────────────────────► (executable model)
```

**Supersession (read the newer, not the older):**
- ES-005.1 supersedes ES-005.
- ES-008 v2 supersedes ES-008 v1 (v1's linear tables were rejected).
- Hush Thesis v2 supersedes the Founder Package's acceptance-based North Star.
- ES-012's TrustScore replaces the Founder Package North Star and the acceptance success gates.

**Amendments (a frozen spec modified by a later one — apply the later):**
- ES-011 redefines ES-005.1 §4 effort_offset as the *stable* component of a joint correction (the time-varying component is fatigue), and overrules ES-010 Part A ordering for fatigued observations (de-fatigue in rep space *before* conversion and attribution).

**The plateau chain (read in order to understand ES-013):**
Plateau Red Team Review → Plateau Investigation Framework → Investigation Engine Specification → ES-013.

**Two anchor specs every implementer returns to constantly:**
- **ES-005.1** for any number, formula, or unit.
- **ES-008 v2** for any capability constant, class, seed, or cohort rule.

**For navigation by rule rather than by document, use HUSH_V1_TRACEABILITY.md.**
