# Hush v1 — Canonical Product Specification

> **Source of truth.** This document consolidates the approved Hush v1 product decisions
> into a single canonical specification. It introduces no new ideas, proposes no
> alternatives, reopens no closed decisions, and optimizes nothing. Where a topic was
> previously decided, it is recorded here exactly as approved.
>
> **Governing principle:** *Hush recommends. The athlete decides.*
>
> Date: 2026-06-11 · Status: Frozen (product philosophy)

---

## 1. Product Vision

Hush is a training-intelligence system whose value is **understanding training progress,
detecting stagnation, and helping build better future programs.**

Hush is **not** a load-authority system. It does not choose the athlete's working load, and
it does not act as a coach that imposes decisions. Hush observes the athlete's real
performance, maintains an accurate picture of their capability over time, and speaks — rarely
— when something meaningful has happened, primarily when progress has stalled.

The athlete trains. Hush understands.

---

## 2. Core Product Principles

1. **Hush recommends. The athlete decides.**
2. **The athlete owns load.** Actual training load, and whether to increase it, are the
   athlete's decisions.
3. **The athlete logs reality.** Actual weight and actual reps are recorded after every set.
4. **Program structure is stable.** Stability is preferred over optimization.
5. **Hush never changes the program structure automatically** — not exercises, not the split,
   not training days, not exercise order, not preferences.
6. **The athlete's exercise preferences are preserved**, and an exercise the athlete replaces
   becomes their persistent preference going forward.
7. **Recommendations are advisory and optional.** The athlete may accept, ignore, or override
   any recommendation.
8. **Stagnation is the primary trigger** for any recommendation.
9. **Hush speaks rarely.** At most one insight and one recommendation per week. If nothing
   important happened, Hush says so and leaves the program unchanged.

---

## 3. User Journey

1. **Onboarding** — the athlete provides the minimum profile needed to seed an initial
   capability estimate and generate a first program.
2. **Program Creation** — Hush generates a stable weekly program.
3. **Exercise Customization** — the athlete may adjust exercises and order; changes persist.
4. **Workout Execution** — the athlete trains the session; recommended loads are advisory.
5. **Set Logging** — the athlete logs actual weight and actual reps after every set.
6. **Rest & Session Flow** — the session proceeds set by set to completion.
7. **Weekly Intelligence Review** — at the top of each new weekly program, Hush presents at
   most one insight and one optional recommendation, or states that nothing notable happened.

The program remains stable from week to week unless the athlete changes it, or the athlete
accepts a recommendation.

---

## 4. Onboarding

Onboarding collects the inputs required to seed each capability and build the first program.

**Inputs**
- **Sex** — required.
- **Bodyweight** — required. It is the primary axis of the initial capability estimate.
- **Age** — required.
- **Experience level** — advisory input; it may only modestly and conservatively adjust the
  bodyweight-based estimate.

**Initial capability estimate (seeding)**
- The initial per-capability estimate is derived from a **bodyweight-anchored strength-standard
  estimate**, keyed primarily on bodyweight and sex, with experience as a **capped** modifier.
- The estimate is **conservatively biased downward** and clamped to a plausible range.
- The seed is held at a **capped confidence** so the athlete's real performance overtakes it,
  and so the initial estimate informs the first program without asserting authority.
- If bodyweight is unavailable, onboarding falls back to the experience-based seed.

The initial estimate exists to produce a reasonable first program and a starting advisory
load. It is a starting point, not an authority.

---

## 5. Program Creation

Hush generates the weekly program. Program generation is **load-free**: it selects structure
and volume, never the working load.

- **Capabilities.** The program is organized around the five Class-A capabilities:
  horizontal push, horizontal pull, vertical push, knee-dominant, hip-dominant.
- **Split & frequency.** The program uses frozen split templates at the athlete's training
  frequency. Every frequency covers all five Class-A capabilities.
- **Volume.** Weekly working sets per capability follow the athlete's volume band
  (low / moderate / high), with focus weighting and the standard two-lever allocation.
  During the calibration period, volume is held at the restrained calibration setting.
- **Exercise selection.** One class-matched exercise per slot, chosen by the athlete's
  preference.
- **Ordering.** Sessions follow the fixed capability priority order.

The generated program is **stable**. It does not change from week to week on its own.

---

## 6. Exercise Customization

- The athlete may **replace** any exercise. A replacement is **capability-preserving** and
  **class-matched** (it trains the same capability under the same class constraint).
- A **replacement becomes the athlete's persistent preferred exercise** for that slot going
  forward.
- The athlete owns **exercise order preferences**.
- **Hush never changes exercises, order, split, training days, or preferences automatically.**
  Replacement is preference-driven and athlete-initiated, never performance-driven.

---

## 7. Workout Execution

- The athlete trains the composed session.
- Each exercise displays an **advisory recommended weight** and a target rep count.
- The **athlete decides the actual weight** used. The recommended weight is a suggestion, not
  a requirement.
- The prescription **does not change mid-session.** Hush's recommendations are surfaced in the
  Weekly Intelligence Review, not during a workout.

---

## 8. Set Logging (Actual Weight + Actual Reps)

- After **every set**, the athlete logs **actual weight** and **actual reps**.
- **Both values are learning inputs.** Hush's understanding of the athlete's capability is
  built from the real weight and reps the athlete performed.
- There is **no effort, RIR, or proximity-to-failure input**, by design.

---

## 9. Rest & Session Flow

- Between sets, the athlete rests for the prescribed rest interval.
- The session proceeds set by set, block by block, to completion.
- The flow is execution and logging only; no recommendation or prescription change occurs
  during the session.

---

## 10. Weekly Intelligence Review

The Weekly Intelligence Review is how Hush speaks. It is the product's primary voice.

- It appears **at the top of the new weekly program**.
- It presents **at most one primary insight**.
- It presents **at most one recommendation**, which is **optional**.
- If **nothing important happened**, Hush **says so and leaves the program unchanged.**
- **Hush speaks rarely.** Silence with an unchanged program is the normal, expected state.

---

## 11. Recommendation Philosophy

- **All recommendations are advisory.** The athlete may accept, ignore, or override any of
  them.
- Recommendations are **optional**. Declining a recommendation requires no action and leaves
  the program unchanged.
- Hush **never automatically applies** a recommendation to load, exercises, exercise order,
  the split, training days, or preferences.
- The single exception that Hush may act on — and only on the athlete's **explicit
  acceptance**, never silently — is a **volume adjustment within the established volume
  bands**. Even this is a small, reversible, declinable step.
- Recommendations exist to inform the athlete. They never assert authority over load.

---

## 12. Stagnation Detection

Stagnation is the primary trigger for recommendations. Detection runs on the per-capability
capability estimate (the latent strength score), which is fed by the athlete's logged weight
and reps. Detection is computed **weekly, at program construction** — never mid-session.

**Trailing window**
- The stagnation window is **4 weeks**.
- A capability is evaluated only if it has at least **6 logged sessions training it within the
  window**; otherwise its state is "insufficient data" and no stagnation is declared.

**What qualifies as stagnation (per capability)** — all conditions must hold:
1. **Not progressing** — the capability's score trend over the window is flat or negative.
2. **The flat is genuine, not noise** — the modeled change over the window is within the
   capability's own recent variance band.
3. **Actively trained** — the capability has been trained through the window.
4. **Confident enough to judge** — see the confidence rules below.

**Trend states.** Each capability reports one of: **Progressing**, **Holding**, **Stalled**,
**Regressing**, or **Calibrating**. `Stalled` and `Regressing` are stagnation events.

**Confidence rules**
- Capability confidence **below 30**: **no stagnation call** (the estimate is not yet certain
  enough to judge).
- Confidence **30 to below 70**: **advisory "watch" only** — a soft insight may be shown;
  nothing actionable.
- Confidence **70 or above**: **eligible for an actionable recommendation.**
- Conflicting recent evidence (low agreement) **suppresses** the call regardless of tier.
- While a capability is still calibrating (below 70), its state is reported as "still learning
  this capability," never as stagnation.

**Imbalance detection**
- The capability score scale is comparable across capabilities (equal scores represent equal
  development relative to each capability's own standard).
- Compute the **median score across the five Class-A capabilities**, using only capabilities
  with confidence at or above 30.
- A capability whose score is **meaningfully below that median** (a relative-weakness gap) is
  flagged as an **imbalance / relative weakness**.
- A capability that is **both lagging and Stalled** is the **highest-priority target**. A
  lagging capability that is still progressing is catching up and is left alone.

**Surfacing & cadence**
- Stagnation is surfaced in the **Weekly Intelligence Review**, at the program-review moment,
  not mid-session.
- Per the weekly limits: at most one insight and one optional recommendation.
- **Anti-repetition:** once a capability's plateau has been surfaced, it is not surfaced again
  until its trend state changes or a **4-week cooldown** elapses.

---

## 13. Program Adaptation Rules

- **Program stability is preferred over optimization.**
- Hush makes **no automatic changes** to:
  - Exercises
  - Exercise order
  - Training split
  - Training days
  - User preferences
  - Alternative-exercise preferences
- The **only** change Hush may initiate is a **volume adjustment within the established volume
  bands**, and only on the athlete's **explicit acceptance** of a recommendation. It is never
  applied silently.
- An athlete-initiated **exercise replacement persists** as the preferred exercise.
- If nothing meaningful happened in a week, the program is **left unchanged.**

---

## 14. User Authority & Overrides

**The athlete owns:**
- Actual training load.
- Whether to increase load.
- Whether to accept recommendations.
- Exercise replacements (which then persist as preferences).
- Exercise order preferences.

**Hush owns:**
- Program generation.
- Performance analysis.
- Trend detection.
- Stagnation detection.
- Imbalance detection.
- Recommendation generation.
- Next-week program construction.

Any recommendation may be **overridden or ignored**. Overriding is a normal, expected action
and requires no justification. An overridden recommendation leaves the program unchanged.

---

## 15. Success Metrics

Hush's success is measured by its core value, not by load authority:

- **Understanding training progress** — maintaining an accurate, real-performance-based
  picture of the athlete's capability over time.
- **Detecting stagnation** — correctly identifying genuine, sustained plateaus while remaining
  quiet during normal training.
- **Improving future programs** — producing stable, well-targeted programs and timely,
  rare, useful insights.

Success is **not** measured by recommendation acceptance, by the athlete following the
recommended load, or by load-prediction accuracy.

---

## 16. Model Responsibilities

The model:
- Consumes the athlete's **actual weight and actual reps** from every set as its learning
  input.
- Maintains a **per-capability capability estimate** (latent strength score) with confidence
  and recent-variance, updated gradually and resistant to single-session noise.
- Performs **performance analysis, trend detection, stagnation detection, and imbalance
  detection** on that estimate.
- **Generates the program** (structure and volume, load-free) and **constructs the next week**.
- **Generates recommendations**, which are advisory.

The model does **not**:
- Select or control the athlete's working load.
- Automatically change exercises, order, split, days, or preferences.
- Act on any recommendation without the athlete's acceptance.

Recommended loads, where shown, are advisory outputs of the model, not authoritative
prescriptions.

---

## 17. Explicit Non-Goals

Hush v1 explicitly does **not**:
- Act as a **load-authority** system or choose the athlete's working load.
- **Automatically change** exercises, exercise order, the training split, training days, or
  preferences.
- Capture **effort, RIR, or proximity-to-failure**.
- Optimize for **recommendation acceptance** or for the athlete following the prescription.
- Change the prescription **mid-session**.
- **Speak frequently** — more than one insight and one recommendation per week is out of scope.
- Pursue aggressive **optimization** at the expense of program stability.

---

## 18. Final Hush v1 Definition

**Hush v1 is a training-intelligence system that recommends but never decides.**

The athlete owns the load and the structure: they log the actual weight and reps of every set,
they choose whether to increase load, and any exercise they replace becomes their lasting
preference. The program is stable; Hush changes nothing automatically.

Hush owns understanding: from the athlete's real performance it maintains an accurate picture
of each capability, detects genuine stagnation over a four-week window, and surfaces — at the
top of each new weekly program, and only when warranted — at most one insight and one optional
recommendation. When nothing important has happened, Hush says so and leaves the program
unchanged.

Hush's value is **understanding progress, detecting stagnation, and improving future
programs.** Hush is **not** a load-authority system.

*Hush recommends. The athlete decides.*
