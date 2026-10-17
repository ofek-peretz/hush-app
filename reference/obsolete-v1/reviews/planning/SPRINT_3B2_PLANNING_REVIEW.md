# Sprint 3B-2 Planning Review — Session Composition (ES-009) + Volume (ES-009.1) + Live Fatigue Ceiling, Class-A only

> Planning/readiness review, produced before any 3B-2 code. Does **not** redesign the frozen
> model; plans the faithful implementation of ES-009/009.1 + the live ES-011 ceiling on the
> foundation Sprint 3B-1 delivered. Every scope claim traces to a frozen spec
> (`HUSH_V1_SPEC_MANIFEST.md`, `HUSH_V1_TRACEABILITY.md`, ES-009/ES-009.1 in `build/_txt/`).
> Governing rule: *no redesign without explicit model review.*
>
> Date: 2026-06-10 · Model: Hush v1 (frozen) · Build: Sprint 0/1/2/3A/3B-1 ✅ (82 tests) · Schema v4 · No code written.

> **STATUS: ACCEPTED (2026-06-10).** This review carries forward the five rulings ratified
> in `SPRINT_3B_PLANNING_REVIEW.md` §7 (split approved; Class-A only; live fatigue ceiling with
> 24 as fallback; single-capability slots in V1; minimal PreferenceState slice) and opened **three
> new design questions** (§8) that surfaced only when the frozen templates and volume math were
> checked against the *actual* Class-A catalog and restricted templates. **All three are now
> resolved (§8); the resolutions gate the build and are folded into the Implementation Plan.**

## 0. Where we are (one paragraph)

Sprint 3B-1 delivered every prerequisite ES-009/009.1 silently assume — the ES-002 Class-A
catalog (`catalog.py`, with the Stage-3 `select` primitive already built), StrategyState
(`weekly_frequency`, `weekly_volume` enum, focus), PreferenceState, the derived
`global_confidence`/`calibration_phase` aggregate, and the single `complete_block()` decision
hook — and proved them by promoting L2 REPLACE_EXERCISE to live on the existing single-block
path, with the Sprint 0–3A trajectories preserved bit-for-bit. Sprint 3B-2 is the remaining,
**highest-new-risk** half: it turns the single-block path into an ordered, volume-bearing,
multi-set `ExerciseBlock[]` over the five Class-A capabilities, and switches on — *simultaneously*
— the system's first nondeterminism (the exploration floor), its first multi-set blocks, the live
ES-011 fatigue ceiling, and the recovery gate. The foundation is proven; the composition engine
is not. Two facts that only became visible by reading the delivered code and re-running the frozen
math sharpen the plan: (a) the current Class-A catalog is **entirely single-capability**, so the
multi-capability de-fatigue approximation (R4 in the 3B review) **cannot be activated by selection
in V1** — it is dormant, not merely deferred; and (b) the volume-band *distinctness* property the
spec calls "verified" was verified on the **7-capability** templates, and it **partially collapses
under the Class-A restriction** because dropping two capabilities per template drops `times_trained`
to 1 for several capabilities, re-introducing the exact single-lever saturation the two-lever model
exists to prevent. (b) is the new headline risk.

---

## 1. Sprint goal

**Compose and allocate a full session, deterministically and reconstructably, on the proven 3B-1
foundation.** Turn the single-block path into an ordered, volume-bearing, **multi-set**
`ExerciseBlock[]` over the five Class-A capabilities: template → priority → volume (slots × sets)
→ exercise per slot → ordering → then ES-006 loads each block. Concretely:

- **ES-009 + ES-009.1** emit the ordered, volume-bearing, **load-free** skeleton; ES-009.1 runs
  *inside* ES-009 between Stage 2 and Stage 3 (it allocates slots, then sets `target_sets`).
- The **ES-011 fatigue ceiling** becomes the **live** session bound (`MAX_SESSION_SETS = 24`
  demoted to a static fallback), and the **recovery gate** goes live, both consuming Sprint 2
  fatigue state with a deterministic reduction order.
- Multi-set blocks complete through the **3B-1 `complete_block()` hook** (built and synthetically
  tested in 3B-1; now exercised for real).

Succeeds when every block traces to `(template, priority, volume band, focus multiplier,
times_trained, slot, selection rule, exploration seed, ceiling-trim)`; the **calibration path is
fully deterministic** (no exploration, 1 slot × 2 sets, canonical, single-capability); and the
existing **rested single-block steady-state-of-one trajectory stays bit-for-bit identical**.

---

## 2. Scope

### 2A. In scope — the frozen mechanism (ES-009 / ES-009.1 / ES-011 ceiling)

**ES-009 four stages** (Section 3, none skippable):
1. **Stage 1 — template:** `weekly_frequency` → fixed split; `session_index mod len(template)`
   → today's slot-set. **Class-A-restricted** (drop `vertical_pull`/`core_stability` from every
   frozen template); clamp frequency to {2,3,4}. Re-prove Class-A coverage (§4 R2; proof in §5).
2. **Stage 2 — priority:** during calibration, `priority = staleness + uncertainty` info-gain
   (`staleness = min(days_since_last_trained/7, 2.0)`, `uncertainty = (100−confidence)/100`);
   at steady state, `primary/secondary_focus` first, info-gain as tie-break only. Affects
   ordering/inclusion, **never load**. Data source `capability_state.last_trained_at_week`
   **already exists** (Sprint 0) — no new prerequisite.
3. **Stage 3 — selection:** one class-matched exercise per slot via the **3B-1 `catalog.select`**
   primitive (canonical during calibration; `argmax(preference_score)` tie-broken by
   `difficulty_factor` at steady state) **plus the new exploration floor** `p_explore ≈ 0.10`
   (the only addition to `select`; never fires during calibration, never crosses the class
   constraint). Second-slot fill draws the next-best distinct exercise in the same capability.
4. **Stage 4 — ordering:** compound-first / core-last → `position` (0-indexed). **Open design
   item — the ordering key is undefined for the current catalog; see §8 Q1.**

**ES-009.1 coupled volume** (runs between Stage 2 and Stage 3; sole owner of `target_sets`, sole
consumer of `weekly_volume`): enum bands `low/moderate/high → 8/12/18` weekly sets/cap; two-lever
allocation `per_session_sets = weekly_sets / times_trained`, `slots = clamp(round(p/3),1,2)`,
`sets_per_slot = clamp(round(p/slots),2,4)`; focus weighting `×1.25 / ×1.00 / ×0.75` on the weekly
budget before distribution; calibration restraint (fixed 1 slot × 2 sets while `calibration_phase`).
**`times_trained` and band totals must be recomputed on the Class-A-restricted templates and
distinctness re-verified — the spec's numbers do not transfer (§4 R-VD; §5).**

**ES-011 fatigue ceiling + recovery gate** consuming Sprint 2 fatigue: the live ceiling replaces
the static 24 (which remains a hard fallback); deterministic reduction order (reduce `sets_per_slot`
on lowest-focus capabilities first, then drop second slots). The recovery gate's exact action
(defer/lighten under chronic systemic fatigue) is pinned to ES-011 B.1/B.3 — **do not invent
behavior beyond the frozen spec.**

**Multi-set block completion** through the 3B-1 `complete_block()` hook; block surprise
`= s_obs − score_at_block_entry`, once per block.

### 2B. In scope — wiring & verification

Compose → **ES-006 loads each block** (composition strictly load-free); per-block `target_sets`
honored by the set loop; exploration **seed threaded and logged** (Section 9 audit chain); the
calibration→steady-state transition driven only by the existing `global_confidence ≥ 70` boundary
(no new flag).

### 2C. Out of scope — deferred, stub at clean boundaries (unchanged from 3B §6)

Class-B `vertical_pull` (needs bodyweight — absent from the Athlete entity) and Class-C
`core_stability` (needs the duration curve + DurationObservation) as live slots — 7-cap templates
stay **frozen inactive**; volume-band auto-progression (static bands; ES-009.1 §6 emits a
band-change *signal* to ES-007 — **emit, never swing**); the ES-007 Strategy Evaluation consumer;
CHANGE_STRATEGY licensing and ES-013 investigation/slot interaction; κ/τ/σ²_ref + fatigue-ceiling
threshold + `PREFERENCE_NUDGE` calibration (Phase 0 — the ceiling is directional, not calibrated);
per-athlete τ, `effort_offset`; a full PreferenceState learning curve.

---

## 3. Dependencies

**Consumed (built and proven in 3B-1 / earlier):** the ES-002 catalog + `catalog.select`/`replace`
primitive; StrategyState (`weekly_frequency`, `weekly_volume` enum, `primary/secondary_focus`);
PreferenceState (`exercise_family`, `preference_score`); `global_confidence`/`calibration_phase`
(derived); `capability_state.last_trained_at_week` (Stage-2 staleness source); the single
`complete_block()` decision hook; the `decision.py` governor + ES-006 loading; Sprint 2
fatigue/recovery state + decay; evidence/state_update; ES-005.1 math; 3-zone persistence;
single-writer; transactional audit; schema v4.

**Hard prerequisites that must land first:** **none new** — this is the payoff of the 3B-1/3B-2
split. Every prerequisite the 3B review flagged as "none exist" now exists and is tested. Stage 3
extends the *already-built* `catalog.select` with one exploration branch rather than building
selection from scratch.

**Frozen internal ordering (must not be violated):**
- ES-009.1 runs **inside** ES-009: Stage 2 priority → 009.1 allocates slots → Stage 3 fills them
  → 009.1 sets `target_sets`. **Do not split 009 from 009.1.**
- Runtime: compose (009/009.1) → **ES-006 loads each block** (composition is load-free).
- Fatigue ceiling / recovery gate **consume** fatigue (one-directional).
- L2 REPLACE (live since 3B-1) and ES-001 equipment-busy both **reuse Stage 3** over
  `replacement_group` — already true; composition must not fork a second selection path.

**Deferred-but-stub-cleanly:** ES-007 Strategy Evaluation (009.1 §6 signal), ES-013 interaction,
CHANGE_STRATEGY licensing.

---

## 4. Risks (ranked)

- **R-VD — Volume-band distinctness partially collapses under Class-A (new, highest).** ES-009.1
  §2/§9's "verified distinctness" (freq-2 totals 28/30/32; freq-4 16/20/24) was proven on the
  **7-capability** templates. Dropping `vertical_pull`+`core_stability` from every template drops
  `times_trained` to **1** for capabilities trained once/week, so `per_session_sets = weekly_sets`,
  which **saturates the `2 slots × 4 sets = 8` lever ceiling for every band ≥ 8** — i.e. low =
  moderate = high for those capabilities. Worked through on the restricted templates (§5): at
  **frequency 2 the collapse is total** (every Class-A capability is trained exactly once; all three
  bands yield 2×4=8/cap and Session A = 24 sets for *every* band); at **frequency 3** it is partial
  (only the twice-trained `horizontal_push`/`hip_dominant` stay distinct); at **frequency 4** only
  `horizontal_push` collapses. This directly threatens ES-009.1 Success Criterion 2. *Mitigation:
  re-derive and **re-verify** the band totals on the restricted templates; document precisely where
  distinctness survives (twice-trained caps + the focus multiplier still differentiate) and where it
  does not; **treat any change to the 8/12/18 bands or the 1–2 / 2–4 lever clamps as a model-review
  event** (ES-009.1's closing note flags the bands as the most tunable numbers — but tuning is a
  Phase-0/model-review act, not a 3B-2 act). Recommend surfacing this to the model owner as Q3 (§8).*

- **R2 — Class-A coverage replaces the frozen 7/7 guarantee.** The frozen "7/7 in 3–5 sessions"
  cannot hold with two capabilities dropped. *Mitigation: prove and freeze a **Class-A 5/5**
  property (§5 shows ≤2 sessions at every frequency) and accept the side effects it exposes —
  **thin sessions** (freq-2 Session B = 2 slots; freq-4 Sessions B/D = 2 slots) and **duplicate
  sessions** (freq-4 Session B ≡ Session D = {knee, hip}; freq-3 Session C = {h_push, hip} adds no
  new coverage). These are consequences of the restriction, not bugs; document them.*

- **R6 — Exploration floor = first nondeterminism.** `p_explore ≈ 0.10` in Stage 3 breaks
  bit-reproducibility unless the seed is logged. *Mitigation: thread an explicit per-session seed;
  log it on the session/recommendation audit; assert determinism-given-seed; assert it **never**
  fires during calibration or across the class constraint. This is the single most audit-sensitive
  change in the sprint (Section 9: "a session that cannot be reconstructed is invalid").*

- **R5 — Two frozen ceilings collide.** ES-009.1 §4 freezes `MAX_SESSION_SETS = 24`; ES-011 B.1
  *replaces* it. *Mitigation (ratified): ES-011 fatigue ceiling is the live bound, 24 is a static
  fallback, the fatigue threshold ships as a flagged provisional constant. Note: under Class-A the
  static 24 binds at **equality** at freq-2 Session A (3×8) and rarely elsewhere — so most trimming,
  if any, comes from the live fatigue ceiling, which is exactly the intended behavior.*

- **R8 — Rested/steady-path parity regression.** The zero-fatigue, single-capability,
  steady-state-of-one path must still reduce to today's behavior. *Mitigation: keep all 82 tests
  green bit-for-bit; add a "composition of a one-capability session ≡ today's single-block path"
  identity test; the calibration path (1 slot × 2 sets, canonical, deterministic) is the natural
  reduction and the easiest parity anchor.*

- **R-RG — Recovery gate behavior is the least-specified live piece.** The ceiling has explicit
  math; the recovery gate's action under chronic systemic fatigue is described, not formula-frozen.
  *Mitigation: implement strictly to ES-011 B.1/B.3; if the spec underdetermines the action, **stop
  and raise it** rather than inventing a rule (no redesign without model review).*

- **R4 — Multi-capability de-fatigue approximation: DORMANT, not active (downgraded).** The 3B
  review ranked this a live risk. The delivered catalog is **entirely single-capability** (every
  `Exercise.capabilities` dict has one key), and the ratified "single-capability slots in V1" rule
  holds **by construction** — selection cannot produce a multi-capability block. The two-slot lever
  yields two *single-capability* blocks (e.g. `bench_press` + `db_bench_press`), never a
  multi-capability one. *Mitigation: keep the C.3 exact path; add an assertion/guard that a composed
  block is single-capability, and flag the seam where a future multi-capability catalog entry would
  activate the approximation. This risk does not bind in V1.*

- **R-MS — Multi-set blocks first exercised for real.** `complete_block()` was built and only
  *synthetically* multi-set tested in 3B-1. *Mitigation: integration test a real multi-set block
  through compose → load → set loop → one decision update at block close; verify block surprise is
  captured once from `score_at_block_entry`.*

---

## 5. Exact implementation sequence

Single coupled sprint (ES-009 and ES-009.1 are inseparable — §7). Internal phase gates, with one
**hard checkpoint** after Phase B so the deterministic calibration path is proven before any
nondeterminism switches on (this gives the de-risking a further split would, without stranding
scaffolding — the same logic as the 3B-1/3B-2 split).

**Phase A — Templates + coverage proof + priority (deterministic spine):**
1. Class-A-restricted frozen templates + frequency clamp {2,3,4}.
2. **Re-prove Class-A 5/5 coverage** (test, frozen property). The restricted templates:

   | Freq | Sessions (Class-A slots after dropping B/C) | 5/5 covered by |
   |---|---|---|
   | 2 | A:{h_push,h_pull,knee} · B:{v_push,hip} | A∪B (2 sessions) |
   | 3 | A:{h_push,h_pull,knee} · B:{v_push,hip} · C:{h_push,hip} | A∪B (2 sessions) |
   | 4 | A:{h_push,h_pull,v_push} · B:{knee,hip} · C:{h_pull,v_push} · D:{knee,hip} | A∪B (2 sessions) |

   All frequencies cover 5/5 in ≤2 sessions (stronger than the original 3–5). Record the
   thin/duplicate-session side effects (R2).
3. Stage 2 priority: calibration info-gain (`staleness + uncertainty`, source
   `last_trained_at_week`) vs steady-state focus-ordered + info-gain tie-break.

**Phase B — Volume allocation + calibration restraint (deterministic):**
4. ES-009.1 two-lever allocation on restricted `times_trained`; focus weighting; calibration
   restraint (1 slot × 2 sets). Emit slot counts to Stage 3, then `target_sets` per block.
5. **Re-verify band distinctness on the restricted templates (R-VD)** — produce the freq×band
   totals table; assert distinctness where it holds; document the freq-2 (total) and freq-3
   (partial) collapse; **no clamp/band edits without model review.**

> **★ HARD CHECKPOINT:** the calibration-phase session (1 slot × 2 sets, canonical, single-cap,
> info-gain priority, **fully deterministic, no exploration**) composes, loads via ES-006, and
> reconstructs end-to-end; all 82 prior tests green bit-for-bit. Only past this gate do we switch on
> the steady-state surface.

**Phase C — Steady-state selection + ordering (introduces nondeterminism):**
6. Stage 3 steady-state: extend `catalog.select` with the **exploration floor + logged seed**
   (R6); second-slot distinct fill; single-capability guard (R4).
7. **Stage 4 ordering — define and ratify the ordering key (Q1)** → assign `position`; deterministic
   block order within a two-slot capability.

**Phase D — Fatigue ceiling + recovery gate + multi-set wiring (live ES-011):**
8. Live ES-011 fatigue ceiling (deterministic reduction order) + 24 static fallback (R5).
9. Recovery gate per ES-011 B.1/B.3 (R-RG — raise if underdetermined).
10. Wire compose → ES-006 loads each block → set loop honors `target_sets` → `complete_block()`
    once per block (R-MS).

**Phase E — Verification & docs:** rested/calibration identity (R8); Class-A 5/5 coverage proof;
band-distinctness table + documented collapse (R-VD); ceiling-trim determinism; exploration
seed reconstructability + never-during-calibration; single-capability block guard; multi-set
streak-at-block-close; full-session audit reconstruction `(template, priority, band, focus,
times_trained, slot, selection, seed, trim)`; canonical-doc + traceability updates + Sprint 3B-2
README and completion report in house style.

---

## 6. What must remain deferred

- **Class-B `vertical_pull`** (needs bodyweight — absent from the Athlete entity) and **Class-C
  `core_stability`** (needs the duration curve + DurationObservation pipeline). 7-cap templates
  stay **frozen inactive**.
- **Volume-band auto-progression** — static bands; ES-009.1 §6 emits a band-change *signal* to
  ES-007 (unbuilt); **never swing the band per session.**
- **ES-007 Strategy Evaluation consumer** (10–20-workout cycle) — signal emission only.
- **CHANGE_STRATEGY licensing** (ES-013) and **ES-013 investigation slot/recovery interaction.**
- **κ/τ/σ²_ref + fatigue-ceiling threshold + `PREFERENCE_NUDGE` calibration** — Phase 0; the
  ceiling is directional, not calibrated. **The 8/12/18 bands and the lever clamps are likewise
  not tuned in 3B-2** (R-VD): they ship as the frozen defaults, with the Class-A collapse documented.
- **Per-athlete τ, `effort_offset`** — fixed τ, offset 0 (unchanged).
- **A full PreferenceState learning curve** — only the 3B-1 minimal bounded nudge.
- **Multi-capability blocks / the C.3 approximation** — dormant by catalog construction (R4); the
  exact single-capability path ships, with a guard at the seam.

---

## 7. Should Sprint 3B-2 be further split? — **No. Keep ES-009 + ES-009.1 + the live ceiling as one sprint, with the Phase-B hard checkpoint.**

ES-009.1 runs *inside* ES-009's pipeline (Stage 2 → allocate slots → Stage 3 → set `target_sets`);
the two cannot be separated without building a throwaway seam mid-pipeline — the 3B review already
ratified this. The genuine new-risk surface (exploration nondeterminism, two-lever volume, the live
ceiling, multi-set blocks) is real, but a *sprint-level* split would strand the deterministic
calibration spine as un-shippable scaffolding (it produces nothing athlete-meaningful until
selection and volume exist on top of it). The honest equivalent of a split is the **internal hard
checkpoint after Phase B**: prove the fully-deterministic calibration path (1 slot × 2 sets,
canonical, single-capability, no exploration) end-to-end and bit-for-bit against the 82 prior tests
*before* turning on any nondeterminism. That yields the de-risking of a split with none of the
stranding. **Recommendation: do not split; gate at Phase B.**

One caveat worth the model owner's attention: **R-VD (band-distinctness collapse under Class-A)** is
the kind of finding that, if the owner decides the bands *must* be distinguishable at frequency 2,
would require a model-review decision (re-tune bands, raise the per-exercise set ceiling, or accept
the collapse) — and that decision is a *prerequisite to Phase B*, not a mid-sprint discovery. It is
raised as Q3 below so it is resolved before code, not during it.

---

## 8. Open questions requiring model review — RESOLVED (2026-06-10)

1. **Q1 — Stage-4 ordering key. RESOLVED — approved frozen capability-priority ordering.** Stage 4
   orders blocks by a **frozen Class-A capability priority**, then canonical-before-alternate
   (`difficulty_factor` desc), then slot index — fully deterministic. **No new catalog metadata**
   (`is_compound`, ordering scores) is introduced. The ordered capability list is the single frozen
   constant driving Stage 4.
2. **Q2 — Recovery-gate action (R-RG). RESOLVED — approved trim-only.** When the live ES-011 fatigue
   ceiling is exceeded, **remove the lowest-priority slot(s) until the session satisfies the
   ceiling.** The session is **not** rebuilt or re-optimized; no session deferral in V1. This is the
   same deterministic reduction the ES-009.1 §4 ceiling already specifies (lowest-focus sets first,
   then drop second slots), now driven by the live fatigue ceiling.
3. **Q3 — Volume-band distinctness under Class-A (R-VD). RESOLVED — accept and document.** The
   collapse (total at frequency 2, partial at frequency 3, from `times_trained = 1` saturating the
   lever) is accepted as a **known V1 limitation**. **ES-009.1 is not modified in this sprint** — the
   frozen 8/12/18 bands and 1–2 / 2–4 lever clamps ship unchanged. It is recorded as a limitation
   here and must appear in the Sprint 3B-2 completion report and the canonical Known-Limitations
   list. Any band/clamp re-tuning is deferred to Phase 0 (model review).

### Known V1 limitation recorded (Q3)

> **Volume bands are not fully distinguishable under Class-A-only coverage.** Because each
> Class-A capability is trained once/week at frequency 2 (and several are at frequency 3), the
> two-lever allocation saturates at `2 slots × 4 sets`, so `low`/`moderate`/`high` produce identical
> per-capability volume for once-trained capabilities (frequency 2: all capabilities; frequency 3:
> the once-trained ones). Bands remain distinct only for twice-trained capabilities and via the
> focus multiplier. This is a consequence of the ratified Class-A restriction collapsing
> `times_trained`, **not** an ES-009.1 defect; ES-009.1 is unchanged. Revisit when Class-B/C
> capabilities activate (restoring per-template capability count) or in Phase-0 band calibration.

---

*Sources read: `docs/canonical/*` (Execution Context, Project Status, Traceability);
`SPRINT_3B_PLANNING_REVIEW.md`, `reviews/completion/SPRINT_3B1_COMPLETION_REPORT.md`; ES-009 +
ES-009.1 (full, `build/_txt/`); delivered code `implementation/sprint3b1/catalog.py`,
`sprint1/schema.py`/`repositories.py`/`pipeline.py`, `sprint0/domain.py` (catalog single-capability
fact; `last_trained_at_week` presence; restricted-template coverage + volume math worked by hand).
No code written.*
