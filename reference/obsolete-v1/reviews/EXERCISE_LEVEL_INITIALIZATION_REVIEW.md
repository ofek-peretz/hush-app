# Exercise-Level Self-Reported Initialization (ESRI) — Review vs Option D

> **════ SUPERSEDED-FRAMING NOTE — DX-17 (2026-06-12) ════**
> Evaluation of an alternative to **Option D seeding (DX-08)**, which is **SPECIFIED but NOT YET
> IMPLEMENTED**; kept as design reference for that pending decision. As-built today: 3-bucket seed;
> `bodyweight_kg` collected (DX-07). Load-prediction success framing is reoriented by the v1 pivot —
> Hush is **advisory**; success = honest capability tracking + **stagnation detection (M5/DX-09)**.

**Type:** evaluation of an alternative initialization concept — evidence-based, design only.
**Date:** 2026-06-11 · **Model:** Hush v1 (frozen) · **Baseline:** adopted Option D
(`reviews/CAPABILITY_INITIALIZATION_IMPLEMENTATION_SPEC.md`).
**Constraint:** no implementation, no model modification.

**Evidence:** `build/_assembled/esri_review_sim.py` → `esri_review_output.txt`, day-1 load
from the real `recommend()` on the frozen model; learning-dominance numbers carried from
`init_spec_sim.py`. Conventions match the prior reviews (acceptable day-1 = 9–16 reps vs an
11-RTF target; too-heavy = ≤8 reps; unliftable = prescribed load ≥ true 1RM).

---

## 1. The concept, precisely

During the first training period only, just-in-time before an exercise, the athlete *may*
report the typical working set (weight × reps) they currently use. Epley → RM1 →
`score_of` → capability seed. It is **not** a learning observation and is **not** fed to the
adaptation loop; it only sets the initial capability state, after which the normal Hush loop
runs unchanged.

Mechanically this is a **direct, per-exercise, contextual measurement** prior — the most
accurate of the sources surveyed in the Decision review (it measures the individual rather
than estimating from a population). It is the just-in-time, better-UX realization of the
"training-history prior" that `CAPABILITY_INITIALIZATION_DECISION.md` flagged as a fast-follow.
It carries two distinctive properties absent from Option D: an **anchoring safety strength**
(the seed is tied to a load the athlete claims to actually handle) and a **self-report
hazard** (ego / aspiration / reporting a near-max as a "working set").

---

## 2. Head-to-head evidence

Population N = 1500/bucket; coverage (can report a weight for the exercise) = beginner 0.10 /
intermediate 0.55 / advanced 0.85; ESRI residual SD 4.3 score (direct) vs D 6.2 (table);
both at confidence cap 25 with the same downward bias. ESRI carries a self-report tail
(15 % inflate ~+8 score; 5 % report a near-max, +18). "D+ESRI(clamped)" cross-checks each
report against the bodyweight estimate and caps how far above it the report may sit.

| Strategy | acceptable | **too-heavy** | **unliftable** | median \|err%\| |
|---|---:|---:|---:|---:|
| **D** (adopted) | 30.8 % | 2.3 % | 0.0 % | 13.2 % |
| **ESRI** only | 31.6 % | **11.5 %** | **0.6 %** | 12.8 % |
| **D + ESRI** (no cross-check) | 34.1 % | 5.1 % | 0.1 % | 12.0 % |
| **D + ESRI (clamped)** | **34.3 %** | **2.5 %** | 0.0 % | **11.9 %** |

By experience (acceptable % / too-heavy %):

| Strategy | beginner | intermediate | advanced |
|---|---|---|---|
| D | 29 / 1.7 | 32 / 3.2 | 31 / 2.0 |
| ESRI only | **25 / 11.7** | 33 / 12.6 | 37 / 10.2 |
| D + ESRI | 31 / 2.4 | 33 / 5.6 | 38 / 7.3 |
| D + ESRI (clamped) | 30 / 2.3 | **37 / 2.7** | **36 / 2.5** |

Three results drive everything below:
1. **ESRI alone is the *least safe* option** (too-heavy 11.5 %, unliftable 0.6 %) — five×
   D's hazard — because self-report inflation is not contained by ESRI's own anchoring (an
   ego report claims a load the athlete does *not* truly use).
2. **ESRI alone does not help beginners** (25 % acceptable, *worse* than D's 29 %): they
   cannot report weights for novel exercises, so they fall back to the flat seed.
3. **A bodyweight cross-check fixes the safety problem entirely** while keeping the accuracy
   gain: D+ESRI(clamped) is the best accuracy (34.3 %) at D-level safety (2.5 % too-heavy,
   0 % unliftable), uniform across all buckets.

---

## 3. Evaluation across the requested axes

### Day-1 accuracy
ESRI is the most accurate prior *where the athlete can report* (direct measurement, SD 4.3 vs
D's 6.2). But pooled, **ESRI-only barely beats D (31.6 vs 30.8 %)** because coverage drags it
down — its accuracy only materializes when layered on D as the floor: **D+ESRI(clamped) is
the best of any option evaluated in this whole review series (34.3 %, median error 11.9 %).**

### Week-1 mapping accuracy
The prior dominates the blend for ~8 workouts (learning-dominance: prior share 94/88/83/73 %
after workouts 1/2/3/5 — `init_spec_sim.py`). An accurate ESRI seed therefore stays
authoritative through week 1, so **week-1 mapping ≈ day-1 accuracy** for both. ESRI's edge is
that its anchor is a load the athlete demonstrably handles, so week-1 prescriptions track
demonstrated capability tightly on covered lifts; uncovered lifts inherit D's week-1 behavior.

### Safety
The decisive axis. ESRI has a real **safety strength** (honest reports anchor day-1 load to a
weight the athlete already uses → safe by construction) and a real **safety hazard**
(ego/aspiration/near-max reporting → 11.5 % too-heavy, 0.6 % unliftable — the worst observed).
The hazard is **not** self-contained and, because the blend corrects slowly (§Week-1), cannot
be quickly undone after the fact. It is **fully neutralized by a mandatory bodyweight
cross-check** (clamp the report to the D estimate + margin): too-heavy drops 11.5 % → 2.5 %,
unliftable → 0 %. **Verdict: ESRI is unsafe to ship without the cross-check; safe with it.**

### Onboarding friction
**Low — arguably lower than a form.** Contextual, just-in-time, optional, spread across the
first sessions; no upfront questionnaire. Comparable to D's single bodyweight field. ESRI adds
no onboarding-screen friction but introduces in-session micro-prompts.

### User burden
**Regressive.** ~one light prompt per exercise's first occurrence (~5–10 across week 1).
Trivial for athletes who track their lifts (advanced); **confusing or unanswerable for
novices**, who are pushed to guess — which feeds the very ego/PR tail that causes the safety
hazard. Burden is lightest for those who need initialization least, heaviest for those who
need it most.

### Beginner experience
**Poor — ESRI's central weakness.** Coverage ~10 %: beginners can't report novel exercises,
get ~no benefit (25 % vs D's 29 %), and their guesses are the most dangerous inputs. ESRI does
not serve the cohort that most needs help; **D is strictly better for beginners** and must
remain their initializer.

### Intermediate experience
**Good where covered (55 %).** Known lifts get direct-measurement seeds; unknown lifts fall to
the D floor. Best intermediate cell in the study is D+ESRI(clamped): 37 % acceptable, 2.7 %
too-heavy.

### Advanced experience
**Excellent — ESRI's sweet spot (85 % coverage).** Most accurate seeds (38 % acceptable), and
this is exactly the cohort the original cold-start finding hurt most (under-seeded strong
athletes, gate shut ~30 weeks). ESRI addresses that pain with even more precision than D — but
it is also where ego inflation concentrates (10.2 % too-heavy uncapped), so the cross-check is
essential precisely here.

### Consistency with Hush design principles
- **Seeding is a sanctioned initialization exception** (`seed_athlete` already writes initial
  capability state directly). ESRI is another seed source and explicitly **not** a learning
  observation, so ES-007's "evidence is the single writer of state" for the *adaptation loop*
  is preserved. ✓
- **Gradualness / "a single workout shouldn't redefine the athlete."** Respected: one-time
  init, gradual loop unchanged afterward. ✓
- **Evidence-quality weighting.** Hush deliberately distrusts unvalidated input; ESRI injects
  an *unweighted* self-report into state, bypassing the quality gate. **Tension** — bounded by
  the confidence cap (a weak prior, `sum_w 2.30`, overtaken by real evidence) and, critically,
  by the **bodyweight cross-check** that validates the report against an objective signal.
  With both, it is consistent in spirit. ⚠→✓
- **Product thesis (an inference engine, not a configuration calculator).** Asking users their
  weights leans toward a logbook app. As a *temporary, optional* bootstrap it is defensible;
  it would erode the "it just knows" positioning only if it became a *required* step. The
  "first training period, optional" scoping is what keeps it principle-consistent. ✓ as scoped.

---

## 4. Determination

> **B — ESRI should SUPPLEMENT Option D** (not replace it), as an **optional, just-in-time
> refinement layer gated by a mandatory bodyweight cross-check**, with D remaining the
> universal base and fallback. It is a **post-beta enhancement**, not a beta blocker.

Reasoning against the other two options:
- **Not A (reject):** ESRI is genuinely valuable for the intermediate/advanced cohorts and
  produces the best accuracy of any option *when layered on D with the cross-check*
  (34.3 % acceptable at 2.5 % too-heavy). Rejecting it would forfeit a real, safe improvement.
- **Not "replace D":** ESRI-only is the least safe option and fails beginners outright —
  it cannot be the universal initializer. For the **advanced cohort** it does become the
  *dominant source where a report exists*, but D must still provide the floor, the fallback
  for unreported lifts, and the safety clamp — so functionally it **supplements** D rather
  than replacing it for any cohort.

### Conditions on adopting ESRI (hard requirements from the evidence)
1. **Mandatory bodyweight cross-check / clamp** — a report may seed above the D estimate by at
   most a bounded margin (study used 1.5·SD_D). This is non-negotiable: it is the difference
   between 11.5 % and 2.5 % too-heavy. ESRI must therefore be built *on top of* D, never instead of it.
2. **D remains base + fallback** — every uncovered capability, and every athlete who declines
   to report, is initialized by D. Beginners are served by D regardless.
3. **Inherit D's confidence cap (25) and corroboration gate** — the self-report is a weak
   prior that the athlete's real performance overtakes; it never authorizes progression on its
   own (§Safety, learning-dominance).
4. **Optional and temporary** — first-training-period only, skippable, to preserve the
   inference-engine product principle and avoid burdening/мis-prompting novices.

### Sequencing
D ships for beta as specified (it already resolves the convergence and safety findings). ESRI
is the recommended **fast-follow** that supersedes the generic training-history fast-follow in
the Decision doc — same intent, better UX, with the cross-check requirement now quantified.

---

## 5. Limitations
Constant-truth synthetic athletes; coverage rates (10/55/85 %), residual SDs (ESRI 4.3 / D 6.2),
and the ego/PR tail (15 % +8, 5 % +18 score) are conservative modeling assumptions, not
Hush-measured. The **orderings and the central conclusions are robust** to these — ESRI-unsafe-
without-cross-check, ESRI-fails-beginners, and clamp-recovers-D-safety hold across plausible
parameterizations; exact percentages are indicative. Real coverage and the self-report error
distribution should be measured during beta (which D enables) before ESRI is calibrated and shipped.
