# Hush — v4 Design Handoff

**For:** Claude Design
**From:** Product
**Date:** 2026-06-25
**Status:** Refinement brief — not a redesign brief

---

## How to read this document

The Hush app has migrated to a new training engine internally called **v4**. The engine change is invisible plumbing, but it changes a few things the user actually *reads and feels*: the language we use, how we explain decisions, and a handful of new affordances (lock, subscription, exercise video).

This document tells you **only what changed because of v4** so you can bring the existing product into alignment with it.

It is deliberately not a list of design improvements. The current UX, navigation, information architecture, and minimalist visual language are intentional and **stay as they are**. See the final section, *What should NOT change* — that section is the most important one here.

---

## 1. The v4 product philosophy (in designer language)

Hush is a strength coach that **owns the decisions so the athlete can own the work.**

The old mental model was subtly predictive — it leaned on forecasts, projected outcomes, and confidence language. v4 removes all of that. The new philosophy is:

- **It reacts; it does not predict.** Hush watches what actually happened last week and responds. It never tells you what *will* happen. There are no forecasts, no projections, no "we expect."
- **The athlete owns the lifts. Hush owns the numbers.** The athlete chooses *which* exercises they do (swap, replace, lock). Hush decides *load, progression, volume, frequency, and rest*. This division is the spine of the whole product. Every screen should make it feel like a clean handshake, never a negotiation.
- **Every change is explained, calmly and after the fact.** When Hush changes something, it tells you what it saw, what it concluded, and what it did — in plain, first-person, past-tense voice. Never a justification in advance, never a sales pitch.
- **Quiet confidence.** The engine is more decisive than before but says less. Fewer numbers on screen, more trust. The tone is a senior coach who doesn't over-explain.

If a screen ever makes Hush sound like it's *guessing* or *predicting*, that's a v4 violation. Hush observes and acts.

---

## 2. Terminology changes

These are voice/word changes only. The visual treatment of these labels stays identical.

**Words that should disappear:**

| Retire | Why |
|---|---|
| Forecast / projection / prediction / "we expect" | v4 reacts, never predicts. The Forecasts feature is gone entirely. |
| Confidence / probability / "likely" | We no longer surface model confidence as a user-facing idea. |
| "fatigue" (as the reason for *lowering a load*) | When Hush matches a load down, it must say it matched the load to *demonstrated capability* and **kept the sets**. It must not imply the athlete is weak or tired, and must not imply volume was cut. (The word "fatigue" is still allowed elsewhere, e.g. recovery/hold copy — it's only banned as the explanation for a load reduction.) |
| "Bayesian," "double-progression," engine/algorithm names | Internal only. Never user-facing. |

**Words that should replace them:**

- "What I saw / what it means / what I did" — the explanation triple (see §4).
- "I matched it to your demonstrated capability and kept your sets." — the calm way we describe a load coming down.
- "Hush decides the loads. You decide the lifts." — the ownership line (already live on the onboarding "ready" screen; it's the canonical statement of the philosophy).
- "held steady," "ready for more," "re-test before pushing" — reactive, observational language.

---

## 3. The finalized Weekly Update concept

**What it is:** a calm, once-a-week digest shown at week rollover titled **"What changed"** (eyebrow: *This week*). It is the single place the athlete reviews everything Hush adjusted.

**Structure:**
- A short stack of cards, one per change. Each card's headline is a single first-person sentence: *"Bench press hit the top of its range with room, so I added 2.5 kg."*
- Tapping a card expands the **Why** (see §4) inline beneath it.
- If nothing changed: one reassuring line — *"Everything held steady this week — keep showing up and the work compounds."* No empty state anxiety, no filler.

**Designer notes:**
- This is **read-only**. There are no accept/reject/undo controls. v4 changes are presented as decisions already made, not proposals. (The old product had veto/undo affordances on changes — those are gone. Do not reintroduce approve/dismiss buttons on changes.)
- It should feel like reading a note from a coach, not reviewing a changelog. Roomy cards, one idea each, quiet hierarchy.
- The list length varies (0 to ~10 cards). Design for both the single-line "steady" state and a modest scroll.

---

## 4. The finalized "Why" concept — Observation → Conclusion → Action

Every change Hush makes can be unfolded into a **three-part explanation**. This is the heart of v4's trust model and should be treated as a first-class, repeatable design pattern.

The three lines, always in this order, always with these labels:

1. **What I saw** *(Observation)* — the evidence. *"Bench press reached the top of its range with room to spare."*
2. **What it means** *(Conclusion)* — the reasoning. *"It is ready for more weight."*
3. **What I did** *(Action)* — the decision. *"I added 2.5 kg."*

**Designer notes:**
- This pattern appears today inside the Weekly Update card when expanded. The labels are small mono/eyebrow style; the values are plain readable body text.
- It is always **past tense and first person**. Hush already did the thing. Never "I will," never "you should."
- The three lines are a fixed rhythm — treat them as a recognizable unit the user learns to trust. Keep the visual treatment consistent everywhere this triple appears.
- The in-session "Why {{weight}}" sheet (tapping a weight during a workout) is a lighter, single-line cousin of this idea. It does not need the full triple, but its voice must match: observational, calm, never predictive.

---

## 5. The Lock System

**Concept:** the athlete can **lock an exercise** in their program. A locked exercise will **never be auto-swapped by Hush.** It's the athlete drawing a line around a lift they want kept.

**Behavior the design must reflect:**
- Locking is **per-exercise-slot**, controlled entirely by the athlete. Hush never locks or unlocks anything on its own.
- A locked exercise still gets full load/progression treatment — locking protects the *choice of lift*, not the numbers. (Reinforces the ownership split: athlete owns the lift, Hush owns the load.)
- The athlete can still manually replace a locked exercise themselves; the lock stays attached to the slot.
- An unlocked exercise may be swapped by Hush (e.g. a slot that keeps underperforming for weeks gets moved to a different exercise — surfaced in the Weekly Update as a "swap").

**Where it lives:** a lock/unlock toggle on each exercise in the **Program detail** view (currently an icon button that takes on the accent color when locked). Copy: *"Lock this exercise" / "Unlock this exercise."*

**Designer notes:**
- The lock state needs a calm, unmistakable resting indication on the exercise row — the athlete should be able to glance at their program and see what's pinned. Use the existing accent, not a new color.
- Avoid padlock-heavy "security" connotations if it fights the minimalist language; the intent is "pinned / protected," not "restricted."

---

## 6. Subscription / free-trial behavior

**Model (finalized):** **free trial measured in completed sessions, then a paywall.**

- The app is **fully usable for the first 7 completed sessions** — the entire calibration arc, all the way through the Portrait unlock. The athlete experiences the complete "aha" before being asked to pay.
- Starting the **8th** session without an active membership opens the **paywall**.
- Plans: **Monthly** and **Annual**, both auto-renewing. **Annual leads as "Best value."** Prices are pulled live from the App Store — never hardcode a price in the design.
- Billing is through Apple ID; renews until cancelled in Settings.

**Where it lives:**
- **Paywall** screen (modal): eyebrow *Membership*, title *"Keep training with Hush,"* body explaining the 7 free sessions, three benefit lines, the two plans, Subscribe, Restore purchases, legal line.
- **Profile → Membership row**: shows trial state (*"Free trial · N sessions left"*), active plan (*"Hush Pro · {{plan}}"*), or *"Free trial ended."* Routes to the paywall or to Apple's manage-subscriptions screen.

**Designer notes:**
- The paywall should feel like a natural continuation, arriving *after* the product has already proven itself — not a gate slammed in front of a new user. Match the existing calm, premium tone. No urgency, no countdowns, no dark patterns.
- Design the Membership row for all three states (trial-with-count, active-plan, trial-ended).
- The trial counter is sessions, not days — copy already reflects this ("sessions left"). Keep that framing.

---

## 7. Exercise Video architecture (content deferred)

**Concept:** exercises can show a short, looping **demo video** as their form guide. The *player and the plumbing exist now; the video content does not yet.*

**Behavior:**
- The video lives inside the **existing in-session "Form" / form-guide affordance** on an exercise. When a video exists for that exercise, it plays (looping, muted, no controls). When it doesn't, it gracefully falls back to the **existing vector silhouette** form illustration. From the athlete's side, nothing breaks — they just sometimes get a richer demo.
- Because content is deferred, **today every exercise shows the vector fallback.** The video path lights up exercise-by-exercise as files are supplied.

**Designer notes:**
- No new screen and no new navigation — this slots into the form guide that already exists. Please design the *presence* and *absence* states of the same affordance so they feel like one coherent thing (e.g. a "Watch"/"Form" treatment that reads correctly whether it reveals a video or the silhouette).
- Keep it quiet: muted, looping, no scrub bar, no play button theatrics. It's a reference loop, not media playback.
- Plan for inconsistent coverage during rollout — a program where some lifts have video and some don't should not look broken or unequal.

---

## 8. Cardio philosophy — standalone, never affects the strength engine

**The rule:** cardio is **completely separate from the strength engine.** Nothing about cardio, walking, heart rate, or calories ever feeds into a load, progression, or programming decision. Hush's strength coaching is sealed off from it.

**What this means for design today:**
- Hush currently has **no cardio programming feature** and is not getting one in this pass. There is no cardio UI to design.
- The **only** health-data feature is **bodyweight import from Apple Health** — used so the athlete doesn't have to type their weight. All health copy must say exactly that and nothing more.
- Any older copy that implied health data drives "fatigue management" or coaching decisions has been **removed** and must not return. Health = bodyweight convenience, full stop.

**Designer notes:** if you touch any "Connect Health" surface, keep the promise narrow and honest: *"Hush imports your bodyweight from Apple Health."* Optional, changeable, nothing public, not a model input.

---

## 9. UI text to revisit because of v4

Most copy is already finalized in the app's two language files (English + Hebrew) under an `explain` namespace and the screen namespaces. The voice is set; what you need from design is to make sure the *containers* fit the final copy. Specifically:

- **Explanation cards / Why triple** — confirm the three-line rhythm (`What I saw / What it means / What I did`) has room to breathe at the longest realistic sentence length.
- **"Steady week" empty line** — make sure the reassuring single line reads as intentional, not as a missing-data state.
- **Load-down explanation** — wherever a load decrease is shown, the copy says it *matched demonstrated capability and kept the sets*. Never show this as a setback. No red, no warning treatment.
- **Membership states** — trial-with-count, active plan, trial-ended (see §6).
- **Health copy** — bodyweight-only, everywhere (see §8).
- **Onboarding "ready" line** — *"Hush decides the loads. You decide the lifts."* This is the philosophy in one sentence; give it weight in the layout.

Note: any copy referencing forecasts, predictions, confidence, or model probabilities has already been deleted. If you find such a string anywhere in the designs, it's stale — flag it.

---

## 10. Screens likely needing small UX or copy adjustments

These are **refinement** touches — copy fit, one new affordance, or state coverage — not redesigns.

| Screen | Why it's affected | Scope of change |
|---|---|---|
| **Weekly Update** | Core v4 surface (§3). | Confirm card rhythm, the expand-to-Why interaction, and the steady empty state. Remove any approve/undo affordances. |
| **Why / explanation surfaces** | The O→C→A triple (§4). | Lock the three-line pattern; ensure consistent treatment in-session and in Weekly Update. |
| **Program detail** | New Lock affordance (§5). | Add the per-exercise lock toggle + a calm locked-state indication on the row. |
| **Paywall** *(new modal)* | Subscription (§6). | Two plans, Annual = Best value, benefits, restore, legal. Premium-calm tone. |
| **Profile / Settings** | Membership row + health copy. | Three membership states; bodyweight-only health language. |
| **In-session form guide** | Exercise video (§7). | Design presence/absence of the demo affordance over the existing silhouette. |
| **In-session "Why {{weight}}" sheet** | v4 voice (§4). | Ensure the single-line reason is observational, never predictive; no setback framing on a decrease. |
| **Connect Health (onboarding + profile)** | Cardio philosophy (§8). | Narrow the promise to bodyweight import only. |
| **Home / session-complete** | Voice consistency. | Verify post-session and "next recommendation" copy reads as reactive (already adjusted from last session), not predictive. |
| **Onboarding "ready" screen** | Ownership statement (§1). | Give the "Hush decides the loads, you decide the lifts" line appropriate prominence. |

Anything not in this table is presumed **unaffected by v4** and should be left alone.

---

## What should NOT change

This refinement is about **aligning the existing product with v4 — not redesigning it.** Please explicitly preserve all of the following:

- **The current navigation.** Tab/stack structure, routes, and how the athlete moves between Home, Program, History, Progress, Profile, and the session flow stay exactly as they are. No new primary navigation.
- **The current product structure.** The weekly-bucket-of-sessions model, the onboarding sequence, the session flow, the program/history/progress split — all unchanged.
- **The minimalist visual language.** The light paper/ink/ochre "instrument" aesthetic, the Hanken + JetBrains type pairing, the existing token system, the restrained use of accent. Do not introduce new colors, decoration, or visual weight. Reuse the existing accent for the new lock state.
- **The overall interaction model.** Calm, low-chrome, glance-able. No new gestures, modals, onboarding coach-marks, tooltips, or "what's new" overlays for these changes.
- **The existing screen hierarchy.** The same screens with the same relative importance. New elements (lock toggle, paywall, video affordance) slot **into** existing screens and flows — they do not promote themselves to new top-level destinations (the paywall is the only new screen, and it is a modal that appears in context).
- **The existing user flows.** Sign-in → consent → onboarding → program → train. Start a session, log sets, finish, review what changed. These paths stay intact; v4 only changes the *words inside them* and adds the lock, the trial gate at session 8, and the optional video.

The goal is that a returning user feels the app got **quieter and more honest**, not redesigned. If a proposed change would make a long-time user have to relearn where something is, it's out of scope for this pass — raise it separately rather than folding it in here.

---

*End of handoff. Questions on intent → Product. This document supersedes any older design notes that reference forecasts, confidence, predictions, or cardio programming.*
