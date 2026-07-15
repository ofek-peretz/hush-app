# Hush Engine v5 — The Situation Register

**Status:** design closed. Stage 0 built. **Revision 6 — the audit that CUT** (2026-07-15). After
five reviews had grown the ledger back toward the size v4 started at, the founder called the risk by
name: feature-creep. Rev 6 deleted **four things as creep or theory, not core** — the rest lever
(S-26), HR-ends-rest (S-19), the approach-set gap trigger (S-60 #2), and the sanity ceiling (F-10) —
taking the constant count **from 18 down to 14**. Nothing that decides a working load was touched.
**Revision 7 (2026-07-15) — see Part 9.** T becomes **per-muscle** (default 8–10, edited in the body
map, not asked in onboarding); minutes and `experience` leave onboarding (60-minute ceiling default;
the loops already learn her real workout); exercise selection is **learned from repeated in-workout
swaps** (K=2), which **deletes the programme-edit screen, the pin button, and the declared swap** —
the pin survives only as a fact earned by resisting rotation. One evidence-gate constant added (F-14,
K=2); no load-touching constant added. **Supersedes:** the v4 engine (`src/engine/v4/`) in whole. v4
is not tuned — it is replaced.

This document is the contract, and it is built literally: every situation `S-n` becomes a test named
for it, every law `L`/`B`/`F` becomes code. It is a specification, not an inspiration — Stage 0 was
built from it word for word. If a situation is not here, the engine has no answer for it — and that
is a bug in this document, not in the code.

**The through-line of every revision:** the reviews hunt for *invented numbers that move iron*, and
each one found some that were mine. `T+4` and the `T ≥ 10` floor (Rev 3) → replaced by her measured
reps-per-rung. The equipment step, the recency of a "fact" (Rev 4) → declared as B-6/F-8. The
bodyweight graduation ceiling that trapped a wide-band athlete (Rev 5) → graduation moved to her own
`Thi`, plus a stall trigger so a bodyweight lift can never freeze (Rev 6). And in Rev 6 the arc
reversed: the sanity ceiling I had added to guard the approach set **was itself the theory** — a
*predicted* physical limit on an unaudited `baseKg` table — so it was **deleted**, the approach set
now guarded by the athlete's own eyes. **The ledger (Part 6) is the running account of every number
that survived, and why — it moves down as often as up now.**

---

## Part 0 — The Laws

Every answer here traces to one of these. An answer that cannot be traced to a law is a guess, and
it does not ship.

| # | Law |
|---|---|
| **L1** | **Facts only.** The engine never asks *why* something happened. It records what happened and acts. It has no concept of fatigue, readiness, recovery, motivation, or effort it did not measure. |
| **L2** | **A guess that is immediately tested is not theory. Theory is a guess that is never tested.** An approach load is allowed *only* because the next set corrects it. A number the engine must live with for weeks is forbidden. |
| **L3** | **Like for like.** A set is only comparable to a set taken under similar conditions. `restBeforeS` is therefore recorded on every set. Without it, every rep comparison is corrupt. |
| **L4** | **A missing fact is asked for once — never guessed, and never asked twice.** The answer becomes a durable declared fact. |
| **L5** | **Constants.** Forbidden when a constant stands in for a fact we could measure. Allowed *only* to define the shape of the product — and then declared out loud and counted (Part 6). |
| **L6** | **Ownership.** The **engine** owns: load, volume, exercise selection, workout structure. The **athlete** owns: the rep target (**T** — **per-muscle** since Rev 7, Part 9 §A), rest, the body map, and exercise selection. *(Rev 7: selection is expressed through the **in-workout swap**, LEARNED into a standing choice at K=2, S-69; the programme-edit swap and the pin **button** are deleted, S-73. The pin as a **fact** survives — earned by resisting rotation, S-71.)* **A pin binds *which* exercise trains a muscle — never *whether* it is trained, and never how many minutes exist** (S-59). |
| **L7** | **No weekly boundary.** A decision is told at the moment it is born — the end of the set, or the end of the workout. Never on a schedule. |
| **L8** | **The engine obeys and states the cost.** It never argues, moralises, nags, or claims a reason it did not measure. |
| **L9** | **A question never stands between the athlete and her workout.** When the engine needs an answer it cannot derive, it assembles the best workout it can, **runs it**, and leaves the question open until she answers. Training is never blocked on a prompt. |
| **L10** | **The engine steps from a load it cannot be lied to about.** The anchor is the **median** of the sets that met `Tlo` — a single mis-keyed number cannot be the median of several. *(When only one set met `Tlo`, the median is that one set — there the rail (L11) is the guard on an established lift, and on a lift with no rail the athlete's own eyes are, S-49. The layers are named in S-22 and S-49.)* **How far** the load then moves is decided by **her own measured reps-per-rung**, never by a fixed step. There is no clipping constant anywhere, because there is nothing left to clip. |
| **L11** | **The rail — the one hard stop.** The engine may **never** prescribe a load more than **one rung above the heaviest weight she completed at `Tlo` reps on that exercise.** The base is **`max(her settled record, THIS session's median anchor)`** — the settled record (sessions before the one being judged, inside the recency window F-8) **plus** the median of the loads she met `Tlo` at this session. *(Rev-7 correction, found when the per-workout cadence went live: a "settled history only" rail HALVED progression — she'd have to complete each load twice before advancing, contradicting S-22's one-rung-per-clear. Including the current session's **median** anchor fixes it while keeping the guarantee: the median absorbs a single mis-key, so a fat-finger still can't lift the rail, but a load she cleanly completed this session DOES count.)* Her own record is the ceiling; **a fat-fingered set cannot lift it** (the median, not the raw set, is the base), and **a heroic single from two years ago cannot pin her under a load she can no longer do** (F-8 — after a real layoff the rail goes quiet and the approach set S-60 takes over). *(Replaces v4's implied-e1RM rail, which capped a demand with a **formula**; the rail is now a **fact**.)* Inactive on a lift with no completed set inside the window — where the approach set guards instead. |

---

## Part 1 — What is a fact

### Recorded per set
`exercise · load_kg · reps · restBeforeS · timestamp · was_completed · isApproach`

**`restBeforeS`** (built, Stage 0). Seconds actually rested before this set. **Absent means UNKNOWN,
never zero** — a rest silently read as 0 is a lie the engine would act on: it would cut the load of
an athlete whose load was never the problem.

**`isApproach`** — the engine marked this set a measurement, not work (S-60). Excluded from every
decision, from volume, and from every rep comparison.

**`failed` is deleted.** In v4 it was derived (`actualReps < recommendedReps`), so it carried nothing
the rep count did not already carry. **The fact is the rep count.**

### Recorded per session
Which exercises were prescribed · which were performed · **how much of each was completed**
(prescribed sets vs performed sets — the fact the volume loop reads) · which were replaced, and by
what · duration.

**Hush does not log warm-up sets, and will not.** Every logged set is a working set or an approach
set. A tripwire test asserts no third kind exists.

### Declared by the athlete (durable, editable, never inferred)
| Fact | Where |
|---|---|
| Sex, age, height, bodyweight | Onboarding / Profile |
| Days per week | Onboarding |
| Time budget per workout | **Rev 7: NOT asked — defaults to a 60-min ceiling, edited in Settings** (Part 9 §A) |
| **T — the rep band, PER MUSCLE** (Rev 7, Part 9 §A) | Default **8-10** for every muscle; **NOT asked in onboarding** — edited per-muscle in the body map. Each exercise reads its **primary muscle's** band. **The band she has IS the target** (see below). |
| **The body map** — every muscle is `off` / `normal` / `emphasis` | Onboarding, permanently editable *(also holds the per-muscle T above)* |
| Exercise selection — **learned** from repeated in-workout swaps (Rev 7, S-69); a stall-resisting swap-back earns a "leave it" (S-71) | In the workout *(the programme-edit screen is deleted, S-73)* |

*(The **goal** question is deleted. There is one goal: hypertrophy. **Experience** is deleted too — Rev 7, Part 9 §A: the approach set measures her, so a self-report never touches a load.)*

**What "T" means everywhere in this document — the band she chose is a floor and a ceiling, and
nothing in between is invented (Revision 4).** She picks `Tlo–Thi` (e.g. 8–10):

- **`Tlo` is the target.** "Met T" = **reps ≥ `Tlo`**. Loop 2 raises the load when **every working
  set reached `Tlo`** (S-22). Landing at 9 inside 8–10 **is** met, with room to spare — she does not
  have to reach 10 to progress.
- **`Thi` is the "too light" mark.** A set **above `Thi`** means the load is light enough to correct
  **this session** (Loop 1, S-11). It never gates progression — it only triggers an in-set raise.
- **Below `Tlo`** → the contract broke → Loop 1 drops the load (S-12), Loop 2 holds (S-24).

This is the band `T…T+4` I deleted in Revision 3 — **except the band is now HERS**, not a `+4` I
invented. The onboarding fact and every loop's threshold are finally the same object. *(Where the
register says "T" as shorthand, it means `Tlo` — the target — unless it says `Thi`.)*

**T applies to every exercise — compound and isolation alike.** Revision 3 deleted the isolation
floor (`T ≥ 10`). It rested on *"small muscles, small weights"* — **an opinion, not a fact** — and
the evidence says the rep band is a free parameter for hypertrophy anyway. **She owns T. There is no
silent override, so there is nothing to disclose.**

> **Rev 7 — T is PER MUSCLE (Part 9 §A).** Every mechanic above is unchanged; only the *source* of a
> band moves. Each exercise reads the band of its **primary muscle** (`exercise.muscle` — the single
> field volume, swap-scoping and display already key on, so no new coupling: turning Chest off never
> touches Shoulders). Default **8-10** for every muscle; she may raise a single muscle to, say, 12-15
> in the map (joint-friendly higher-rep work) and only that muscle's exercises change (S-43 per
> muscle). It is **not asked in onboarding** — a set-once preference that lives in the body map.
> **Rep band = PREFERENCE. A specific exercise that hurts is a *swap* (S-69); a whole muscle you can't
> train is *off* (S-2) — not the rep band's job.** A learned rep-band from behaviour was designed and
> **rejected** (the "high reps at a flat load" signal collides with the S-28 coarse-machine rep-climb,
> and has no natural re-test surface).

### Optional (Apple Watch)
Heart rate during the session is **recorded and displayed, and is NEVER an engine input** — exactly
like cardio (S-46). *(Rev 6 deleted the one prior use, HR-ends-rest: it was, honestly, a recovery
signal governing a timer — the closest thing to theory in the document — and it split the product
into watch/no-watch haves. Rest ends on the learned timer for everyone, S-17. HR stays a thing she
can look at, never a thing that moves her training.)*

### Banned inputs
Fatigue · readiness · recovery · inferred RPE/RIR · e1RM as a **decision** input (display only) ·
demographic assumptions (sex → split) · calendar-driven anything · cardio (S-46).

---

## Part 2 — The three loops

There is **no weekly loop** (L7).

### Loop 1 — The Set (in-session, ~90 seconds)

The prescription is a contract: **N sets, at load L, landing in her band `Tlo…Thi`.** After each
set, the reps are a fact. If the fact breaks the contract, **the load is corrected for the next set,
immediately.**

**Down:** a set lands **below `Tlo`** → drop the load for the next set — by as many rungs as her own
reps-per-rung says the shortfall is worth — so the remaining sets can meet the contract.

**Up:** a set lands **above `Thi`** → raise the load for the next set, by the same measure.
*(A set inside the band is exactly right — no correction.)*

> **And "how many reps is one rung worth?" is not a number we invent. It is measured from her own
> history on this lift** — how her reps actually moved when the load actually moved.
> *"On the bench, Sarah loses about 2 reps per 2.5 kg."* **That is her number.**
> A move is sized by that number, never by a fixed step — so a badly-wrong prescription is fixed in
> **one** correction, not crawled out of a rung at a time. Always inside the rail (L11).
>
> **How it is computed, so it is neither vague nor exempt from L3** (the review caught both):
> it is the **Theil–Sen slope (F-13 — the median of all pairwise slopes) through her `(load, reps)`
> sets** on this lift — one named algorithm, so identical data gives an identical slope —
> and it reads **only sets that are like-for-like**: sets whose `restBeforeS` sits in her normal rest
> band (F-11 — a declared width; two sets at the same load after very different rests are not
> comparable and are not fitted together, L3), and **only sets inside the recency window (F-8)** — an
> old layoff, a form change, or a different gym years ago is not "her number today." A set with
> unknown rest is excluded, exactly as everywhere else.
>
> **Before she has enough like-for-like pairs (F-12) to fit a slope, `B-5` is NOT a guessed slope —
> it is a single cautious rung** (the review was right that a wrong guessed slope would over- or
> under-correct violently in the very first session). The correction moves **one rung**, the next set
> tests it, and it converges in a few sets instead of lurching. **No invented reps-per-rung moves
> iron on day one; a real rung does, and the set that follows judges it (L2).** Only once the slope
> is fitted from her own like-for-like data does a correction size itself to her measured number.

This is what replaced `T+4`. The old rule fired an in-session load change on a rep count **inside
the band the engine itself had asked for** — a correction against a contract she was keeping.
The new rule fires on **her own measured relationship between load and reps**, and nothing else.

**Cap: at most 2 corrections per exercise per session** (a correction is itself a hypothesis, and
each one is tested by the very next set — L2).

### Loop 2 — The Exercise (end of every occurrence)
Decides the load for the **next occurrence of this exercise** — not next Saturday.
State is keyed to the **exercise**, never to a slot.

### Loop 3 — The Muscle (end of every occurrence of that muscle)
Volume is managed **per occurrence of the muscle in the split**, not per calendar week — there is no
week (L7). If a muscle is trained on two days, each day is its own volume track: the set count at
*this* Monday's chest work is adjusted from what happened at *last* Monday's chest work, and Thursday
likewise. Each track is bounded by **its own workout's time budget** — which is the only ceiling
volume needs, because a muscle can never accrue more sets than fit across the days it is trained on.
*("Weekly sets per muscle", where the register uses it — S-32's tie-break — means a
**rolling 7-day sum**, a read for display and tie-breaking only. It is never a boundary a decision
waits for.)*

**Consequence:** `bucketOpenMs`, `firstBucketOpen`, `displayWeekNumber` and the whole weekly-rollover
machinery are deleted. Saturday survives only as a **mirror** (S-45).

---

## Part 3 — How the programme is assembled

The programme is **generated**, never chosen from a shelf. `MEN_SPLITS` / `WOMEN_SPLITS` are deleted.

Constraints, in strict priority:

1. **The body map.** An `off` muscle never appears. An `emphasis` muscle has first claim on volume
   **and is guaranteed at least one exercise** (S-63).
2. **The time budget.** `Σ sets × (work + her measured rest) ≤ her declared minutes.`
   **It is a CEILING, never a TARGET** (S-64).
3. **The station.** Enter once, leave it finished. Minimising station changes is an **assembly
   objective**, not a post-hoc reorder.
4. **Compound before isolation** — within a station.
5. **Deterministic exercise choice** from her pool: minus swapped-away, plus pins.
   **Pinned exercises are cut LAST** (S-59).

**Session structure is an output, not an input.** Mark Glutes + Quads on a 3-day programme and you
get two lower-body days — because the volume has to go somewhere. She is never asked to pick a split.

> **Rev 7 — assembly is WIRED, and the one number it owns.** `assembleV5DayLists` (built + tested)
> turns the map into the week's day-lists (a region per day + its exercises); the existing generator
> then builds each day, so ordering / station-clustering / the time cap are shared verbatim.
> `generateProgram` runs this for the v5 cohort (a declared band); the split survives for legacy only.
> The register fixes the CONSTRAINTS above; the day-one **density** — how a muscle's starting
> weekly-set target becomes an exercise COUNT — is the integration layer's, declared as a bootstrap:
> **`DAY_ONE_EX_DIVISOR = 5`** (a normal muscle → 2 exercises, an emphasised one → 3, min 1). Loop 3
> refines volume from there. A hole-guard means no workout is ever empty even on a very sparse map
> (a repeat is legal, S-29).

---

## Part 4 — THE SITUATION REGISTER

### A · First contact

**S-1 · Brand-new athlete, zero history.** Every lift opens with an approach set (S-60). There is
**no calibration mode** — it does not exist any more.

**S-2 · A muscle is turned `off`.** It never appears. The engine obeys silently and states the cost
once, without moralising (L8): *"Legs are off. Your week is four upper-body workouts — more time for
back and chest."*

**S-3 · So much is off that no workout can be assembled.** The engine says so plainly and invents
nothing: *"There isn't enough left to build a workout. Turn something back on."* It never silently
re-adds a muscle.

**S-4 · The 2 emphasis marks.** First claim on every earned set and every tie-break, plus a floor of
one exercise (S-63). **The budget is 2 marks** (F-4) — emphasis is zero-sum because minutes are.

**S-5 · Signs up Friday, wants 4×/week.** **Nothing special happens.** He trains Friday; by Monday
his row has already gone up — progression is keyed to the *workout*, not the week. **No engine edge
case exists**, because the engine has no weekly boundary to fall off.

**S-6 · She has a rep band T.** *(Rev 7, Part 9 §A: T is now **per-muscle**, default 8-10, **not asked
in onboarding** — edited in the body map. Each exercise reads its primary muscle's band.)* No override,
no floor, no disclosure needed.

**S-7 · A small time budget.** The ceiling drops; assembly re-runs. Exercises are removed — sets are
never shaved below 3 (S-35).

---

### B · A new exercise appears

**S-8 · Never performed.** → **Approach set (S-60).** Cost: one set. Not three weeks.

**S-9 · Performed before — in any programme.**
**Her own history is the starting point, never a transfer formula.** T is not stored on a set and
does not need to be: her history is `(load, reps)` pairs, so the load at which she performed **≥
`Tlo`** is computed, never looked up (this is what makes S-43 free).

**Two facts of different ages, handled differently — the distinction the F-8 window turns on:**
   - **What she LIFTED is a raw fact and does not expire.** A weight she completed is a weight she
     completed; it seeds the prescription however long ago it was.
   - **But if that fact has aged out of the recency window (F-8), the seed is not trusted blind** —
     an approach set (S-60) re-measures her before loading her. So "however long ago" never means
     "loaded cold on a stale number."
   - **Derived statistics** (reps-per-rung, `N`, the rail) read only the **recency window (F-8)** —
     they describe who she is *now*, not who she was.

**S-10 · The engine rotates in a new exercise.** S-8 or S-9. A rotation is nearly free, which is what
makes it safe to trust.

---

### C · Inside the workout (Loop 1)

**S-11 · A set lands above `Thi`** (the top of her band). → **Raise for the next set — by as many
rungs as her own measured reps-per-rung says the overshoot is worth.**
Not a fixed step. **Any set, not just the first** — the old asymmetry (up from set 1 only) had no
fact behind it.
*Why "as many rungs": a corrupted-low prescription (5 kg on a bench) must be recoverable in ONE
correction, not crawled out of a rung at a time inside a wasted session. Her reps tell us how far.*
**Always inside the rail (L11).**

**S-12 · A set lands below `Tlo`** (the bottom of her band). → **Drop for the next set**, by the same
measure, so the remaining sets can meet the contract. The engine does not ask why. *(Expect this to
be visible: with 4–5 sets, mid-exercise drops will be common. That is correct — it is what a coach
says: "take five off, finish the set.")*

**S-13 · Cap.** At most **2 corrections per exercise per session**; never after the last set.
Each correction is itself a hypothesis, and the very next set tests it (L2).

**S-14 · She loads far MORE than prescribed** (real, or a fat finger).
**No clipping constant, because three laws already contain it:** the anchor is a **median** (L10) —
a mis-key cannot be the median of three sets; the move is sized by **her measured** reps-per-rung;
and **the rail (L11) is absolute** — a mis-keyed 400 kg cannot produce a prescription above one rung
past the heaviest weight she has ever actually completed at T.
**Her own record is the ceiling, and she cannot lie her way over it.**

**S-15 · She loads far LESS than prescribed** — including `4` for `40` on the last set, where S-13
allows no correction. The **median** absorbs it (L10), and if it ever did reach a prescription, S-11
recovers it **inside the next session, in one correction.**
*(Revision 3 note: my first fix made the anchor the **heaviest** in-band set. The review was right —
that **amplified** the heavy direction: a mis-keyed 400 would have become the anchor. The median is
symmetric, and it costs nothing.)*

**S-16 · A set logged with 0 reps / the exercise abandoned.** Ambiguous → **no LOAD decision is
banked.** The load holds. **An ambiguous session never changes the load.**

**But load and volume are separate axes (the review found the ambiguity):** a lift she skipped for
time still produced no completed sets, and **that is the volume fact Loop 3 reads** — a whole lift
repeatedly unreached is exactly the signal that the workout is too long for her minutes, so **its
volume is trimmed (S-33/34)** while its load is held (here). This is correct, not a spiral: the
footprint shrinks because she keeps running out of time for it, and the load stays right for when she
does reach it. *(A lift skipped because the **station was taken** is not this — she did a backup,
S-20, so the slot produced work and no volume signal fires.)*

**S-17 · She hammers SKIP on the rest.** Recorded. **Her median rest becomes the prescription.**
The timer stops being something she fights — and the time budget now **credits** her for it: a
60-second rester earns more work inside her hour.

**S-18 · She rests much longer than usual.** Recorded. Part of the set's context (L3). No judgement.

*(S-19 — ending rest by heart rate — was **deleted in Rev 6.** It was a recovery signal in substance,
and it split the product into watch/no-watch. Rest ends on the learned timer for everyone, S-17. HR
is displayed, never an input — Part 1.)*

**S-20 · The station is taken → in-workout swap.** A **backup, not a preference.** It declares
nothing, blacklists nothing — and because progression is exercise-keyed, **the backup already knows
her number.** Zero progression cost. *(In v4 this costs a full slot reset. That is the bug it fixes.)*
**Rev 7 (S-68/S-69): a SINGLE in-workout swap still declares nothing — but the SAME swap repeated
(twice consecutive, K=2) becomes a standing replacement, and the original is offered first ever after
(S-70). One swap = a backup; two = a preference.**

**S-21 · She skips an exercise mid-workout.** No consequence, no inference, no question. It produced
no fact, so it holds. *(If an athlete ever wants to skip a lift because she dislikes it, we have
already failed — the body map is what prevents that.)*

---

### D · Between sessions — the exercise (Loop 2)

**The anchor — one rule for both S-22 and S-24, so a mid-set correction can never orphan the load.**
Loop 2 always steps from the **MEDIAN load across the sets that met `Tlo` this session** — the sets
she *actually completed to contract*, at whatever load Loop 1 had settled on when she did (L10).
**If the median lands between two real rungs, it snaps DOWN to the nearer real rung (F-2)** —
normalization can only ever lower an implied load, never raise it. **If no set met `Tlo`, there is no
anchor** — the load is held at **the last rung Loop 1 settled on this session** (the corrected weight
closest to her contract), **never the pre-session number she already failed.** Loop 1's in-session
correction is a fact she earned; it is never thrown away.

> **The safety here is TWO layers, not one — the review was right that the median alone is not
> enough.** The median protects when several sets met `Tlo` (a mis-key cannot be the median of
> three). But when only **one** set met `Tlo`, that set *is* the median, and a fat-fingered `400×8`
> would be adopted — so the median has no power exactly when it would matter most. **The rail (L11)
> is the layer that never weakens:** it is computed from her **settled history — the sets from before
> this session — never from the suspect set being judged**, and it forbids any prescription above one
> rung past the heaviest load she has *already* completed at `Tlo`. A single in-band typo cannot lift
> the rail, because the rail does not read the current session to set itself. **Median first, rail
> underneath — and the rail holds when the median cannot.**

**S-22 · ALL working sets reached T.** → **Next occurrence: up.**
From the anchor, **how many rungs** is decided by **her measured headroom** — one if she just cleared
T, more if her reps-per-rung says she had more in hand, **never past the rail (L11).**
Says: *"All three sets hit 8. The row goes to 47.5."*
**She never has to reach the top of a range. She never has to grind 12. There is no top.**

**S-24 · Not every set reached `Tlo`.** → **Hold — at the anchor** (the median of the sets that *did*
reach `Tlo`), snapped to a real rung. So an athlete whose set 3 fell to 6, after Loop 1 had eased her
to 77.5, returns to **77.5** next time — the load she actually held to contract — not the stale 80 she
never completed, and not a further cut. Repeat it. No lever, no drama. **If no set met `Tlo`,** hold
at the last rung Loop 1 settled on this session (per the anchor rule above), not the pre-session
number; S-16 governs the all-zero case.

**S-25 · The load has failed more times than *her own* typical attempts-to-clear.**
**`N` is not a constant — it is her own statistic on this lift** (B-3 until she has history).

**How `N` is computed, so it is never vague:** for every load she has cleared on this lift **within
the recency window (F-8)**, count the occurrences she spent at it before clearing. `N` = her **75th
percentile (nearest-rank method, F-13)** of those counts. A novice who clears every load first time has `N = 1`; an advanced
lifter who typically needs three attempts has `N = 3`. **Exceeding HER OWN number is the definition of
a stall — never ours.** *(Recency, not all-time: an athlete who has sped up or slowed down since last
year is judged by who she is now.)*

Then, in order:
   1. **Back off and re-climb** — to the heaviest load at which *all* sets met `Tlo` (a fact from her
      history). If her history holds no such load on this lift, back off **one rung from the current
      load** — the smallest honest step down. Then climb again.
   2. **Rotate the exercise** — to the same-muscle lift she has gone longest without.
      *"The cable row hasn't moved in five weeks. I've swapped it for a chest-supported row."*
   A **pinned** lift is never rotated (S-30). A **calendar** never rotates anything.

**S-27 · Bounds.** 3 – 5 sets per exercise (F-1).

**S-28 · The next rung is a big jump** (a machine with 10 kg pins; no micro-loading).
The load cannot move without breaking her — and **T is hers, so the engine may not quietly raise it.**
So it says the truth and offers the only honest axis left:
*"This machine jumps 10 kg — too big a step for you right now. We'll add reps here until it's within
reach."*
**And "within reach" is the same measured number as S-11:** when her reps at the current load give
her a full rung's worth of headroom, the rung is taken. **One measured fact governs both ends of the
problem** — which is how you know it earns its place.

**S-29 · The same exercise in two workouts in one week.** **One progression, fed by both sessions** —
automatic under exercise-keying. The `canonicalEngineId` unification hack is deleted.

**S-30 · A pin.** *(Rev 7: the pin BUTTON is deleted, S-73; the pin as a FACT survives — earned by
resisting the engine's rotation twice, S-71.)* A pinned lift is never rotated, never engine-swapped.
Pinned **and** stalled → the engine obeys and says so: it still offers the back-off and re-climb
(S-25), but **it will not take the lift away.**

**S-31 · ~~She swaps an exercise in the PROGRAMME EDIT screen.~~ DELETED (Rev 7, S-73).** There is no
programme-edit screen. Its job — a permanent, declared refusal — is now done by the **learned**
standing replacement (S-69, from a repeated in-workout swap) and by the body map (turning a muscle
off, S-2). *(The single in-workout swap, S-20, still declares nothing.)*

---

### E · Volume — the muscle (Loop 3)

**S-32 · She completed every set for a muscle, and at least one of its lifts advanced.**
→ **+1 set at that muscle's next occurrence.**

**Two muscles earn a set and only one fits under the ceiling:**
   1. **An emphasis mark wins.**
   2. Else → **the muscle with the fewest rolling-7-day sets** (bring up the lagging one).
   3. Still tied → **a fixed canonical muscle order** (the old `PATTERNS` enum, extended to every
      muscle). **Never a coin-toss, never wall-clock, never RNG** — determinism is I-24, and it is
      what makes the whole engine reproducible and testable.

**Where the set physically goes** — and this is derived, not chosen: an exercise holds at most 5 sets
(F-1). When a muscle's earned sets exceed what its current exercises can hold, **the next set opens a
new exercise** for that muscle (from her pool: minus swapped-away, plus pins). **Emphasis is what
usually gets a muscle its second exercise** — which is exactly what she asked for when she marked it.

**Emphasis is a priority, not a free lunch (S-63): a muscle that did not progress earns nothing, mark
or no mark.**

**S-32b · She completed everything — but nothing advanced.** → **Hold the volume.**
Volume grows only when she **both** completed **and** progressed. Adding sets to a stalled muscle
assumes more volume breaks a stall — **that is a theory** (L1). The stall belongs to Loop 2, and
Loop 2 is already on it.

**S-33 · She left sets unfinished.** → **Hold.**

**S-34 · Unfinished twice in a row.** → **−1 set.**

**S-35 · Cutting hits the floor (3 sets).** → **Never shave below 3. Drop an exercise instead.**
3 sets × 4 exercises beats 2 sets × 5.

**Which exercise goes:** the **last isolation lift** in assembly order. **A compound is never
sacrificed before an isolation** — the day's main lift keeps its full scheme. *(This is the existing
`enforceTimeCap` law, and it is right; it is preserved verbatim.)* A **pinned** lift is dropped
**last of all** (S-59).

**Two lifts a drop may NEVER take — the guarantees above it win (Part 3 priority):**
   - the **only** exercise of an `emphasis` muscle (S-63 promised it one), and
   - the **only** exercise of any `normal` muscle on the map (dropping it would silently stop
     training a muscle she never turned off — an `off` she never chose).

If honouring both leaves nothing else to cut, the workout genuinely cannot fit her minutes: that is
**S-3**, and the engine says so rather than quietly starving a muscle. If only compounds remain, the
last non-protected compound goes — and the engine says so.

**S-36 · She still cannot finish, even at the floor.** → **The engine stops cutting volume.**
The problem is not volume. It looks at the **load** (S-24/25). **Volume can never spiral to 1.**

**S-37 · The ceiling is reached and an emphasis muscle earned a set.** Zero-sum: the set comes from a
**non-emphasis** muscle. **Which one donates is the mirror image of S-32's give-rule, so the two can
never disagree:**
   1. Never an `emphasis` muscle, and never a muscle at its 3-set floor (S-35).
   2. Among the rest → **the muscle with the MOST rolling-7-day sets** (the one that can best spare
      it — the exact inverse of "give to the fewest").
   3. Still tied → **the reverse of the canonical muscle order** (S-32's order, read backwards).
The engine says what it did: *"Back earned another set. I took one from triceps to make room."*
If no muscle can donate (all are emphasis or at floor), **the earned set simply does not fit, and is
held for the next occurrence** — the ceiling is real (S-64), and the engine never breaks it.

---

### F · Life happens

**S-38 · She disappears, then returns.** **No easing, no ×0.90, no deload, no "welcome back"
adjustment.** The absence machinery is deleted — it existed only because the engine had to predict
how much she had lost, **and that is a theory** (L1).

**She is caught by exactly the same test as any other lift (S-60):** if the gap pushed her last set
out of the recency window (F-8), her next set is an **approach set** — a measurement, so she does not
find out under a loaded bar. If the gap is shorter than that, her recent number stands, and any real
weakening drops the first working set below `Tlo`, where **Loop 1 eases it in one correction.** One
window, no separate absence rule.

**S-39 · Her numbers come down across the board.** **The engine follows them down, and back up.**
There is **no deload construct** (`injury_flag`, `DELOAD_LOAD`, `DELOAD_SETS` — all deleted). A
deload is a *prediction* device. **A measured descent IS the deload.**

**S-40 · She changes days per week.** The programme re-assembles. **Nothing resets** — history is
keyed to the exercise, not the slot. *(In v4 this silently cold-starts every slot.)*

**S-41 · She changes bodyweight.** It is **not a prescribed load**. It feeds the approach load (B-1)
and tonnage / Progress. **Loaded lifts are untouched** — their prescriptions are facts.

**S-42 · She changes height.** **Nothing.** Height touches no engine decision. It exists for display.
Any other use would be a guess.

**S-43 · She changes T.** **Free.** Her history is `(load, reps)` pairs, so the load at which she has
performed ≥ the new T is **computed** (S-9). If she has never worked at that T on this lift, the
approach set finds it. **No conversion formula, ever.**

**S-44 · She edits the body map.** Re-assemble. A muscle switched back on keeps **all** its
exercises' history — it **resumes**, it does not restart. **Its pins resume with it** (S-66).

**S-45 · Saturday.** **Nothing is decided.** Every decision was already told at the moment it was
born (L7). Saturday is a **mirror**: *"This week: 4 workouts. 12 loads moved. Your back went up on
three lifts."* Facts about what **she** did — not decisions taken behind her back.

**S-46 · Cardio.** **Recorded. Celebrated. Never an engine input.** Nothing about Tuesday's 5k can
factually say what to put on the bar on Wednesday. **Any such link is a fatigue theory, and it is
banned.**

---

### G · Integrity

**S-47 · Engine state fails to load.** Telemetry fires; a safe prescription is served.
**Never a silent reset.**

**S-48 · Watch and phone disagree.** Phone is the authority.

**S-49 · An impossible number is logged.** **On an established lift, two layers hold:** the **median**
(L10) — a mis-key is not the median of several sets — and the **rail** (L11), so the worst a lie does
is move one rung. **On a lift with no active rail** (brand-new or aged-out, where only a single
approach set exists), there is no invented ceiling to lean on — and we do not add one (the deleted
F-10 was theory). Instead the guard is the athlete herself: **the mis-key becomes a visible
prescription she corrects, or the next set exposes it** (she cannot lift the impossible; S-16 holds
the load on the resulting zero). **The lie never survives the next set** — which is the same
fact-first discipline as everywhere else, not a special mechanism.

---

### H · The lifts with no load axis

**S-50 · Core / abs.** Under `muscle = the engine's unit`, **Core is a muscle on the map like any
other** — it earns and loses volume by the same rule, can be turned off, can carry an emphasis mark.
Its "accessory finisher with no progression" status was an artefact of the pattern model, and dies
with it. Weighted core progresses on load; unweighted on reps (S-51).

**S-51 · A bodyweight lift.** No load axis → **reps carry the progression**, climbing through her
band toward `Thi`. *(A loaded lift converts reps at `Thi` into a load step and resets; a bodyweight
lift has no rung, so reaching `Thi` on every set means the movement itself is now too easy — S-52.)*

**S-52 · A bodyweight lift is too easy — OR stalled — so it must get harder.** → **Graduate to the
harder catalogue variation** (knee push-up → push-up → dip; chin-up → pull-up); or, where a load can
be added (a belt), it becomes a loaded lift (S-53). Its history carries; the new lift enters at
S-8/S-9. **A pinned lift never graduates** (S-30).

**Two triggers, because a bodyweight lift has no load axis to progress on — the only way forward is a
harder movement:**
   1. **Every working set reaches `Thi`** (the top of HER band) — it is plainly too easy.
   2. **It stalls (S-25) below `Thi`** — she cannot add reps, and there is no load to add. **This is
      the trap the review found:** an athlete who chose the 12-15 band, stuck at 3×12 pull-ups, would
      otherwise never reach `Thi`=15 to graduate and has no load lever — **frozen forever.** A stall
      IS the signal to make the movement harder, exactly as a stall on a loaded lift drives its own
      ladder (S-25). Graduating drops her below the new lift's `Tlo` and she climbs again — no harm,
      like any new lift.

> **The graduation trigger is her own `Thi`, not an invented catalogue number — and this DELETES
> F-7** (the review found the collision). The old rule graduated at a fixed per-exercise rep ceiling
> (`chin_up` at 12 in the catalogue today). But `T` is a free band: an athlete who chose **12-15**
> has `Thi = 15`, and a fixed ceiling of 12 **trapped her** — she could not reach her own target
> without tripping a graduation, and could not stay in her band without the engine calling her a
> failure. Tying graduation to **her `Thi`** removes the paradox and removes the constant: the same
> object (her band) that governs a loaded lift now governs a bodyweight one. *(The catalogue keeps
> only the ladder itself — the "next harder" pointer — which is structure, not a number.)*
> If the graduation lands early for her taste, the harder lift simply drops her below its own `Tlo`
> and she climbs again — no harm, exactly like any new lift (S-8).

**S-53 · Nothing harder exists** (pull-up, dip). It **holds honestly and says so** — it never claims
a move that cannot happen. Add a belt and it becomes a **loaded lift**, re-entering Loop 2 normally.

**S-61 · Bodyweight is a small surface, and stays small.** Outside the pull-up, a commercial gym is
machines and iron (founder). The ladder stays exactly this simple and gets no further investment.

---

### I · Memory and surfaces

**S-54 · Warm-ups.** Hush does not log them (Part 1). A tripwire test enforces it: if warm-up logging
is ever added, that test fails and forces the exclusion to be built **at the same time**, rather than
warm-ups silently feeding progression.

**S-55 · The load floor.** A prescription may never fall to or below zero, or below the lightest
weight that physically exists (the empty bar, the smallest dumbbell, the first pin). Below that there
is no prescription to give: it becomes a bodyweight or assisted lift, **and the engine says so.**

**S-56 · A muscle is switched `off` after she has trained it.**
Once — **and once only** — Hush comes back: *"Legs have been off a while. Want them back?"* One tap;
if she says no, **it is never raised again** (L4).

> **The trigger is: does she have a single logged set on that muscle?**
> **Not "did this happen during onboarding."** The second review was right, and the distinction is
> the founder's own: **a change of state, versus a statement of taste.** A muscle that was `normal`
> but never actually trained — crowded out by the time budget (S-37) — and is then switched off has
> **no history**, so it is **taste**, and asking would be nagging. The old wording would have missed
> that case exactly, and become a bug.

**No elapsed-time threshold.** "Three months" was flavour text pretending to be a rule; it is gone.
The question is asked once, at the Saturday mirror, and never counted in days.

**S-57 · The map after onboarding.** Permanent and editable — where she turns a muscle back on (S-44)
or off (S-56). *(A live per-muscle volume dashboard on the map was considered and **dropped** —
founder, 2026-07-15. The engine narrates in words, at the moment a decision happens; it does not need
a second, parallel display of the same facts.)*

**S-58 · Migration.** **There is none.** The TestFlight cohort are testers; the founder's ruling is to
**recreate cleanly rather than blend two engines' state**. `db.engineV4` is **dropped**, not
converted. Session history is untouched and remains the substrate (S-9) — but `restBeforeS` is absent
on every historical set, so those sets are **excluded from the reps-per-rung rest filter** (F-11) and
never read as zero (L3).

---

### J · The collisions (from the reviews, 2026-07-15)

**S-59 · Her pins do not fit inside her declared minutes.**
A pin binds **which** exercise, not **whether** it appears (L6). The budget still cuts — but
**pinned lifts are cut last.** Only when the **pins alone** exceed the budget does the engine surface
it and ask: *"You've pinned six lifts. Four fit in 45 minutes. Which two come out — or shall we find
more time?"*
**It is a collision between two of HER OWN declarations. The engine does not get to break that tie.**
**And by L9, it does not wait for her either** — it assembles deterministically (pins cut last, in
assembly order), **runs tonight's workout**, and leaves the question open.

**S-60 · The approach set.**
The first set of a lift is a **measurement, not a working set**, in exactly **one condition: there is
no completed set inside the recency window (F-8) to load her against.** That single rule covers both
cases that matter — **a lift never performed** (S-8), and **a lift whose history has aged out of the
window** (a long layoff, S-38, or a rarely-trained lift). It is also **exactly the condition under
which the rail (L11) is inactive** — so the two are one test, and a lift is never left with neither a
rail nor an approach set. *(A shorter absence — one still inside the window — needs no approach set:
her last number is recent, and if she has weakened, the very first working set falls below `Tlo` and
Loop 1 eases it in one correction. No separate "gap" trigger, no median-gap constant — the recency
window alone decides.)*

The engine prescribes a light approach load, **reads it**, and finds her number from there. It is
excluded from every decision: not a working set, no volume, no rep comparison (`isApproach`) — **but
its minutes ARE counted in the time budget**, because they are minutes she really spends.

> **The approach set is the one moment with no rail behind it — and we guard it with a FACT, not an
> invented ceiling.** An earlier revision added a "physical sanity ceiling" (bodyweight × a
> per-exercise `baseKg` table) to reject an impossible mis-key here. **It is deleted (Rev 6):** it was
> a *predicted* limit — exactly the theory this engine refuses — resting on an unaudited constant
> table. The honest guard is the same one the whole engine runs on: **the athlete sees the number.**
> A mis-keyed `400` becomes next set's prescription, she sees Hush ask for 400 kg and corrects it (an
> edit is a fact), or the very next set shows she cannot lift it and Loop 1 / S-16 responds. The lie
> does not survive contact with the next set — no guessed ceiling required.

**This is the whole answer to warm-ups.** No generic warm-up logging — that is friction, and people
warm up on their own. The approach set exists because it is the engine's **cheapest measurement
instrument**, and because it closes the one real safety hole in this document:
*"set 1 tells the truth"* must never mean *"she discovers the truth under a loaded bar."*

> **We predict nothing about detraining. We simply refuse to load her before we have measured her.**

**S-62 · Her pool for a muscle empties out** — she has permanently swapped away (S-31) every exercise
we have for it.
> **Rev 7 — amended by S-74:** with the declared edit-swap deleted (S-31), a pool no longer empties by
> refusal; she always performs *something* for the muscle. So the "want this muscle off?" question is
> reached only through the body map (S-56), never through swaps. The reasoning below still holds — the
> map and the swap converge on the same fact — it is just the map that now carries it.
**This is not a pool problem. It is her telling us something.** The engine asks the S-56 question:
*"You've turned down every chest exercise I have. Do you want chest off?"*
**The map and the swap converge on the same fact** — which is how you know the model is right.
*(And by L9, tonight's workout still runs, on whatever remains.)*

**S-63 · Emphasis versus the ceiling.**
**This is NOT the same collision as S-59, and the difference matters.**
A **pin is a quantity** — *"this exercise must be here."* No room → head-on conflict → only she can
resolve it.
An **emphasis is a priority** — *"when there is a set to give, give it here."* Nothing to give →
**it simply does not fire. Nothing conflicts.**
**The one real hole: if the budget is so tight the emphasised muscle gets ZERO, we broke a promise
she can see.** → **An emphasis muscle is guaranteed at least one exercise.** If not even that fits,
we are in S-3, and the engine says so.

**S-64 · The time budget is a CEILING, never a TARGET.**
Her measured rest has no floor and needs none. If she rests 20 seconds, the ceiling rises — but
**volume and exercise count still only grow by being earned, one at a time** (S-32). So the plan
climbs slowly and is cut the moment she cannot finish it (S-33/34). **The system self-corrects. No
guardrail constant is required, and none is added.**

**S-65 · A question goes unanswered.** See **L9**. The engine never blocks a workout on a prompt.

**S-66 · A pinned lift's muscle is switched off, then back on.** **The pin resumes.** Nothing revoked
it, and S-44 says the muscle resumes rather than restarts — the pin is part of what resumes. **And
she sees it**: the lift appears in her programme, pinned, as she left it.

**S-67 · An assisted machine (a load model with an inverted sign).**
**There are none in the catalogue today, and until there are, this is a guard against adding one
blindly** (the review was right that it would break every load rule). On an assisted pull-up / dip
machine the number on the pin is **counterweight**: more number = more help = *easier*. Every rule
here — S-11/S-12, the anchor (L10), the rail (L11) — assumes *more load = harder, fewer reps*. If one
is ever added, it must be flagged `assisted` in the catalogue, and the engine **flips the sign for
that lift only**: "harder / progress" = a **lower** number, "easier / back off" = a higher one; the
rail caps the *lowest* assistance she has completed at `Tlo`, not the highest load. **A tripwire test
asserts no catalogue lift is `assisted` until that sign-flip exists** — so the day someone adds an
assisted machine, the build fails until the inverted rule is built with it. *(This is the same
discipline as S-54's warm-up tripwire: never let a new input reach progression through the back
door.)*

---

## Part 5 — What is deleted

v4 is not tuned. It is replaced.

**Whole subsystems:** `CALIBRATING` · the absence path (`ABSENCE_DAYS`, ×0.90) · the deload path
(`injury_flag`, `DELOAD_LOAD`, `DELOAD_SETS`) · the adherence gate (`ADHERENCE_MIN` — dead code
today) · the stall lever ladder (`vol`/`load`/`range`, `RANGE_ALTERNATE`, `PATIENT_PROBE_EVERY`) ·
the weekly rollover (`bucketOpenMs`, `firstBucketOpen`, `displayWeekNumber`, `lastAdvanceWeekOpen`) ·
the **3-week calendar rotation** · `MEN_SPLITS` / `WOMEN_SPLITS` (for the v5 cohort — the split
survives for legacy only) · the goal fork · **(Rev 7) the programme-edit SCREEN + the pin/swap
BUTTONS (S-73) · the declared edit-swap (S-31) · the `experience` input · the onboarding rep-band and
minutes questions (defaults instead — Part 9 §A).**

**Metrics:** `classifyTrend` · `progressMetric` · `TREND_BAND` · e1RM as a decision input (Epley
survives for the Progress screen only) · the implied-e1RM rail (`RAIL_HEADROOM`).

**Constants that stood in for facts:** `STALL_WINDOW` · `MISS_ESCALATE` · `LOAD_STEP_CAP` ·
`step()`'s `max(2.5, 2.5%)` · `SWAP_MIN_TENURE` / `SWAP_REUSE_WEEKS` / `SWAP_COOLDOWN_WEEKS` ·
`VOL_FLOOR` / `VOL_CEIL` / `STARTING_VOL_MAJOR` · **the `T+4` band ceiling** · **the isolation
`T ≥ 10` floor** · **the 2× adoption clip.**

**Bugs that die with them:** the trend-metric mismatch (this week's e1RM compared to prior weeks'
`volume_load` → permanent `DOWN` → **every hypertrophy athlete's load froze forever**) · the rail
cutting the load while the copy said *"you progressed"* · `estimateSessionMinutes` ignoring rest
entirely, so the 60-minute cap measured a workout nobody ever had.

---

## Part 6 — The ledger, honestly

**Every number that moves iron is now either measured, declared by the athlete, or listed here.**

### Bootstraps — replaced by her own data, usually within weeks

| | Bootstrap | Replaced by |
|---|---|---|
| **B-1** | The **approach** load on a never-performed lift. **The rule:** take her nearest evidence — the same-muscle lift she has performed, transferred by the catalogue's `baseKg` ratio; or, with no such lift, the catalogue cold-start from her sex + bodyweight — then take it at a deliberately light fraction so the approach set is *guaranteed* reachable. **This bootstrap contains three catalogue/starter numbers — the `baseKg` table, the sex+bodyweight cold-start, and the light fraction — and they are theory-laden by nature** (assumptions about relative strength). They are acceptable *only* because the approach set overwrites them in 90 seconds (S-60); **not one of them ever survives into a working load**, which is why they live inside a bootstrap and not as standing constants. | The approach set itself |
| **B-2** | Starting sets per muscle | Earned / cut volume (S-32/34) |
| **B-3** | Attempts-to-clear, before she has history on the lift | Her own statistic (S-25) |
| **B-4** | **Work + rest seconds per set, on day one** — what assembly uses to know how many exercises fit in her hour | Her measured rest (built, Stage 0) and her set durations (timestamps) |
| **B-5** | **Reps-per-rung, before she has `F-12` like-for-like pairs.** Not a guessed slope — a correction moves **one cautious rung**, tested by the next set (so no invented slope moves iron on day one; a real rung does). | Her own measured load↔rep slope (Loop 1) |
| **B-6** | **The starting equipment increment per class** (barbell/dumbbell/machine) — the smallest step assumed **before she has touched the equipment**, so day-one loads are loadable | The distinct loads she actually performs (`observedLoads`) — the real rungs replace the assumed step |
| **B-7** | ~~median gap before a lift's 2nd performance~~ — **RETIRED (Rev 6)** with the gap trigger it served (F-6). The approach set now fires on one condition only: no set in the recency window (S-60). | — |
| **B-8** | **The day-one exercise COUNT per muscle** (Rev 7) — `DAY_ONE_EX_DIVISOR = 5`: a muscle's starting weekly-set target ÷ 5 → its exercise count (a normal muscle → 2, an emphasised one → 3, min 1). The integration layer's number: the register fixes the assembly constraints (Part 3), but not the sets→exercises granularity. | Loop 3's earned / cut volume (S-32/34), within weeks |

> **B-4 was hiding in plain sight.** It lives in the code **today** as `COMPOUND_SET_MIN` /
> `ISOLATION_SET_MIN` — two numbers that decide how many exercises an athlete gets, that nobody ever
> declared. The second review found it. **It is exactly the door F-2 nearly slipped through.**

### Form constants — they define the shape of the product; no measurement replaces them

| | Form constant | Moves iron? |
|---|---|---|
| **F-1** | 3 – 5 sets per exercise | volume only |
| **F-2** | **The equipment grid is a MOVEMENT, not a constant** — rungs are the loads that physically exist. Its starting increment is the bootstrap **B-6**; her performed loads (`observedLoads`) refine it into the real rungs. *(Rev 4: I had called it "a property of the equipment, not learned" — the review was right that this hid B-6.)* **A prescribed rung is a suggestion, never a requirement:** the engine has no venue fact, so if a rung from another gym's grid (the union of `observedLoads`) is not on the floor she is standing on today, **she loads the nearest weight that IS — and that performed load is the truth the loops read (S-14/15).** No venue tracking is needed, because the completed set always overrules the suggestion. | it **is** the iron |
| **F-3** | ~~rest-lever noise guard~~ — **RETIRED (Rev 6)** with the rest lever (S-26). See the simplification note below. | — |
| **F-4** | The emphasis budget: **2 marks** | no |
| **F-5** | ~~HR rest margin + timer bounds~~ — **RETIRED (Rev 6)** with S-19. HR is display-only now; rest ends on the learned timer (S-17). | — |
| **F-6** | ~~gap factor for the approach set~~ — **RETIRED (Rev 6).** The recency window (F-8) alone decides when an approach set fires (S-60). | — |
| **F-7** | ~~bodyweight graduation rep ceiling~~ — **DELETED (Rev 5).** Graduation now triggers at **her own `Thi`** (S-52); the catalogue keeps only the ladder pointer, which is structure, not a number. The review found a fixed ceiling of 12 trapped an athlete who chose the 12-15 band. | — |
| **F-8** | The **recency window** — how far back a measured statistic reads: reps-per-rung, `N`, the rest median (S-17), **and the rail (L11)**. Old history outside it is not "her number today." **The one thing it does NOT scope is a raw completed load used to seed a prescription (S-9)** — a weight she lifted is a fact whatever its age; the approach set (S-60), not F-8, guards a stale seed. | it **scopes** every measured statistic (never a raw seed) |
| **F-9** | The **canonical muscle order** — the final tie-break for a contested set (S-32 #3, reversed in S-37). It repeatedly allocates real volume, so by our own standard it is a form constant and is named here, not buried in an example. | it **breaks ties** in volume |
| **F-10** | ~~physical sanity ceiling~~ — **DELETED (Rev 6).** It was a *predicted* human limit resting on the unaudited `baseKg` table — theory. The approach set is guarded by the athlete's own eyes and the next set instead (S-49, S-60). | — |
| **F-11** | The **rest-band width** — how close two sets' `restBeforeS` must be to count as "same conditions" for the reps-per-rung fit (L3), so a set done after a very different rest is not fitted against one that wasn't. | no — it **filters** which sets compare |
| **F-12** | The **minimum like-for-like pairs** before B-5 (the cautious single rung) gives way to her fitted reps-per-rung slope. | no — it **gates** bootstrap→data |
| **F-13** | The **reps-per-rung estimator: Theil–Sen** (the median of all pairwise slopes) — **one named algorithm**, not "a robust fit," so identical inputs yield an identical slope (I-24). Likewise `N`'s percentile is the **nearest-rank** method — one rule, stable on the small samples where it matters. | it **fixes** the estimator, not a value |

**Six bootstraps and eight form constants active (B-7, F-3, F-5, F-6, F-7, F-10 retired) — every one declared. Thirteen guess-constants are gone.**
*(Rev 7 adds two, both declared and neither a load-mover: **F-14** = K = 2, the learned-swap adoption
threshold — an evidence gate, F-12/N family; and **B-8** = `DAY_ONE_EX_DIVISOR` = 5, the day-one
exercise-count-per-muscle bootstrap, overwritten by Loop 3's earned/cut volume within weeks. **Seven
bootstraps, nine form constants now** — no invented number still decides a LOAD.)*

> **Rev 6 was the audit that CUT.** The founder saw the ledger swelling back toward the size we
> started at and asked the right question: is this facts, or feature-creep? Three whole features and
> their constants were deleted as creep, not core:
> - **The rest lever (S-26, F-3)** — it fired almost never (it needs the athlete to vary her rest
>   wildly at one stuck load), and it was advice, not a progression decision. The engine manages her
>   perfectly without it.
> - **HR-ends-rest (S-19, F-5)** — a recovery signal in substance, and it split the product by watch.
>   HR is display-only now.
> - **The approach-set gap trigger (S-60 #2, F-6, B-7)** — folded into the recency window it already
>   overlapped. One test now, not two.
>
> With F-10 (Rev 6's theory deletion) and F-7 (Rev 5), **the ledger fell from 18 constants to 14.**
> A ledger that only grows is hoarding; one that only shrinks is marketing. **This one is audited —
> it keeps what moves iron by fact, and cuts what was only clever.**
>
> **The claim this ledger actually makes is narrow, and it is the only one worth making:**
> **no invented number decides a LOAD and is left standing.** Every load a working set is judged
> against is measured from her (the anchor, reps-per-rung, `N`, the rest medians, the rail) or
> physically real (the grid). The two load-touching bootstraps — the approach load (B-1) and the
> starting equipment step (B-6) — **are overwritten by her own data inside the first sessions, and
> the approach set guards B-1 in the very first 90 seconds.** What remains permanent are constants
> that shape a **timer**, a **sentence**, a **set count**, an **exercise swap**, a **tie-break**
> (F-9), or **fix an estimator's algorithm** (F-13) — never *set* a working load — and each is named
> above. **The one thing that would have crossed that line — a predicted physical ceiling — was
> deleted (F-10) rather than kept.**

### And two determinism guarantees, so nothing here is ever a coin-toss
Every tie in this document breaks on a **fact, then a fixed order** — the volume tie-break (S-32),
the drop order (S-35), the exercise choice (Part 3 #5) — and every estimator is a **named algorithm**
(F-13). **No decision TRIGGERS on wall-clock, and none reads RNG** (I-24 / I-25, from v4's invariants).
*(A decision may still **read** the clock to measure a fact — "sets in the last 7 days," "days since
last performed" — but the same inputs at any wall-clock time yield the same output. The ban is on
time as a **trigger**, not time as a **measurement**; the earlier blanket wording overclaimed, and
the review was right.)* Identical inputs yield identical output — what makes the register testable
situation by situation.

### And the honest limit

**Two actions in this engine cannot have their benefit measured directly:** adding a set (S-32), and
rotating a stalled lift (S-25.3). **Neither is theory — both are *tested*:** the set is cut back if
she cannot finish it (S-33/34); the rotation is rotated again if the new lift does not move either.
That is the L2 standard, and it is the honest ceiling of a fact-only engine.

**The one place theory had crept in, and what we did about it (Rev 6):** ending rest by heart rate
(the deleted S-19) was, in substance, a *recovery* signal — the one concept L1 bans — however
carefully "a number returning to a number" kept it inside the letter of the law. A weaker document
would have kept it and defended the wording. **We deleted it.** Rest ends on the learned timer for
everyone (S-17); HR is something she can look at, never something that moves her training. The ledger
is worthless the moment it starts protecting itself.

**And one deliberate blind spot, so no one mistakes it for an oversight (the review named it):**
because the engine never asks *why* (L1), **a rep that dropped from a genuine injury and a rep that
dropped from being undertrained are the same fact to it.** The rail insulates the worst case (it
moves only on her *best* performance, never her worst), but Loop 2's anchor can still be pulled down
by an injury-day session. We accept this on purpose: the alternative is a subjective "don't count
today" flag, which is exactly the self-reported effort signal this engine refuses. Her factual tools
remain — skip the lift (S-21), or turn the muscle off on the map (S-2) — and a real injury shows up
as a *pattern* the engine follows down, not a single day it must interpret.

**A word on "no theory," honestly (the review was right to press it):** L2 — "a guess immediately
tested is not theory" — is an engineering discipline, not a proof that no assumptions exist. B-1,
B-4, B-6 and the `baseKg` ratios are all quietly theory-laden (assumptions about strength across
sexes, bodyweights, exercises). **The true claim this document makes is narrower and it is the one
that matters: no assumption survives into a standing decision without a fact of hers overwriting it
first.** That is why Part 6 exists at all — a "no theory" engine would not need a ledger.

**Everything else the engine does, it measured.**

---

## Part 7 — How this gets built without leaving a hole

**The register is the test suite.** Not a metaphor:

> **Every situation S-n gets a test named for it** — `s22_median_anchor.test.ts`,
> `s15_fat_finger_cannot_move_more_than_one_rung.test.ts`,
> `s60_approach_set_is_not_a_working_set.test.ts`.
> **Coverage is a count: 71 situations, 71 tests, green — or we are not done.**
> *(S-23 absorbed into S-22 (Rev 3); S-19 and S-26 deleted as feature-creep (Rev 6); S-67 added
> (Rev 5) — leaving 64 of the S-1…S-67 numbering. **Rev 7 added S-68…S-74** — learned exercise
> selection (Part 9 §B) — for 71. Tests carry the tripwires (S-54 warm-ups, S-67 assisted, and the
> Rev 7 no-secondary-muscle-coupling tripwire) that fail the build if a new input reaches progression
> through the back door. Rev 7's pure cores ship with their own tests — `per-muscle T`, the
> `learnedSwap` reducer, and `programAssembly` — with the S-68…S-70 logic green; S-71/S-72 land with
> the learned-swap WIRING, which is the one Rev 7 situation-set not yet connected.)*

| # | Stage | Owns | Status |
|---|---|---|---|
| **0** | **The fact substrate** — `restBeforeS` on every set, phone **and** watch | S-17, S-18, S-54, S-58 | ✅ **BUILT + WIRED** |
| **1** | **The pure core** — Loop 1 + Loop 2, exercise-keyed state, the grid, reps-per-rung | S-8…S-16, S-22…S-31, S-49…S-55, S-60, S-61, S-67 | ✅ **BUILT** |
| **2** | **The set loop, live** — `sessionStore` **and the watch** together | S-11…S-13, S-60 | ✅ **WIRED** |
| **3** | **Volume + real time** — Loop 3, the time budget from measured rest | S-17, S-18, S-32…S-37, S-64 | ✅ built · ⛔ Loop 3 volume-over-time NOT wired into regeneration (the assembler now sets the day-one shape; growing/trimming per occurrence is a Rev 7 follow-up) |
| **4** | **The map + T + assembly** — the programme becomes generated | S-1…S-7, S-44, S-50, S-56, S-57, S-59, S-62, S-63, S-66 | ✅ **WIRED (Rev 7)** — per-muscle T live; map-driven `generateProgram` live for the v5 cohort; the onboarding body-map screen sets `bodyMap`+`repBand` |
| **5** | **The surfaces** — decision at the end of the WORKOUT (per-workout, L7); Saturday is a mirror | S-45 | ✅ **WIRED** (v5 cohort) |
| **6** | **The burial** — drop `db.engineV4`, delete `src/engine/v4/` | S-58 | ⛔ blocked — **new users are v5 (Rev 7)**, but existing v4 users remain until the founder recreates the testers (S-58); also the learned-swap UI deletion (S-73) must land first |

*(Status **2026-07-16 (Rev 7)**: gated on `profile.repBand` — and onboarding now SETS it, so **every
new athlete is on v5**. Live for that cohort: map-driven `generateProgram`, per-muscle T,
`sessionStore`, the weekly mirror. Existing users stay v4 (no migration, S-58). Still NOT wired: the
learned-swap occurrence-recording + UI deletion (S-68…S-74 §B), Loop 3 volume-over-time into
regeneration, graduation/rotation reaching the programme (S-52/S-25.3), and the small clean-ups
(`experience` removal, `workoutMinutes` → the time cap). See the memory
`engine-v5-open-tasks-2026-07-15`.)*

**Integration is never deferred.** Stages 0 and 2 are phone+watch by definition. The engine is never
allowed to be "done but unconnected" — **that is exactly how v4 ended up with four dead branches
(`injury_flag`, the adherence gate, the volume lever, the engine swap) that nobody noticed for
months.**

---

## Part 8 — Why this beats an AI coach

An AI coach will invent a reason. Ask it why the third set dropped and it will tell you a convincing
story about fatigue. **It measured nothing.** And it is not *inside the set* — it hears about the set
afterwards, second-hand.

This engine is inside the set, sees the number, and moves the iron in ninety seconds.
**And it will never say a word it did not measure.**

That is not a contest of intelligence. It is a contest between whoever guesses beautifully, and
whoever was actually there.

---

## Part 9 — Revision 7: learned selection, per-muscle T, and the death of the edit screen

**Founder-ratified 2026-07-15.** The through-line: move more of the athlete's ownership onto **facts
she produces** (her behaviour, her body map) and **delete the declarative surfaces** that asked her
to configure by hand — the programme-edit screen, the pin button, and the reps + minutes questions in
onboarding. **Every deletion is replaced by a fact the engine already has or learns**, and every new
mechanism is tested by the very next occurrence (L2). Net: fewer screens, fewer questions, the same
fact-only discipline — and no new number that decides a load.

> **A code invariant verified before this revision was written (2026-07-15):** every exercise carries
> exactly **one** muscle (`exercise.muscle` — the single field that volume, swap-scoping, and display
> already key on). There is **no secondary-muscle concept anywhere in the engine.** So a muscle is an
> independent track: turning `Chest` off removes only Chest-primary exercises and never touches
> Shoulders; and adding a per-muscle rep band on that same field introduces **zero new coupling.**

### A · Per-muscle T, and two onboarding questions deleted

*Amends Part 1 (the T table), L6, S-6.*

- **T is now per-muscle, not one band for the athlete.** Each exercise reads the band of its **primary
  muscle** (`exercise.muscle`). Default **8–10** for every muscle. Resolution order:
  *her edited per-muscle band → the 8–10 default.* Engine impact is **nil**: T was always a
  per-set/per-exercise threshold (`recommendedReps`/`repBandHi`); only its **source** moves from one
  profile field to the exercise's muscle. Loop 1, Loop 2, reps-per-rung, the rail, N, and graduation
  (S-52 at her `Thi`) all recompute identically — and the document's existing care for a non-8–10
  band (S-43, S-52) now simply applies per muscle.
- **T is NOT asked in onboarding.** Every muscle starts at 8–10; she edits a muscle's band inside the
  (editable) body map — a *set-once preference* ("I like my [muscle] work in [range]"), never a
  per-workout question. **The onboarding rep-band question is deleted** (deliberation at the worst
  moment).
- **The time budget is NOT asked.** Default **60 minutes** — a CEILING (S-64), editable in Settings.
  The existing loops already converge the real workout to her behaviour from facts: measured rest
  fills the budget for a fast rester (S-17); unfinished sets trim it (S-33/34). "Wants more than 60"
  is near-illusory — 60 minutes of prescribed work is a complete session. **No new mechanism, no
  learning.**
- **`experience` is deleted as an input.** The approach set (S-60) measures her; a self-report never
  touches a load. Removed from onboarding, Settings, and the profile's decision path.
- **Reps are NOT learned from behaviour — a learned rep-band was designed and REJECTED (2026-07-15).**
  The signal "high reps at a flat load" is confounded with **S-28** (the coarse-machine rep-climb the
  engine itself induces), it has **no natural re-test surface** (weak L2), and it would ADD per-set
  friction to replace a single map setting. The manual per-muscle band is the whole answer.

### B · Learned exercise selection — the edit screen, the pin, and the declared swap are deleted

The athlete owns exercise selection through exactly two facts — the **body map** (which muscles) and
the **in-workout swap** (which exercise) — plus what the engine **learns** from repeated swaps.
Nothing is browsed or assembled by hand (soul: *"Not a template shop. Hush builds it."*).

**Foundation (verified in code):** an in-workout swap happens **only before the first set** of an
exercise (`SessionFlow.canSwap`), and the pool is **same-muscle synonyms only** — so a swap is a clean
pre-exercise choice and can **never** change which muscle is trained. The body map's volume is
inviolate.

**S-68 · A single in-workout swap still declares nothing.** *(Preserves S-20.)* She swapped E for E' —
station taken, a tweak, or taste; the engine does not ask why. The next assembly still offers E. It
banks a **pending** `(E→E', count 1)`, tied to a **performed** set of E' (≥1 set), never to the tap —
so an app-kill mid-swap banks nothing.

**S-69 · A repeated swap becomes a standing replacement (K=2).** When E is offered again and she swaps
`E→E'` and performs it a **second consecutive** time, the engine adopts E': `substitutes[E]=E'`, E
**de-prioritised, never deleted**. It narrates the change. **The pending resets** if, at E's next
occurrence, she performs E itself or swaps to a *different* target — only two consecutive same-target
swaps commit. *(New constant **K=2**, F-14 — an evidence gate, F-12/N family; it moves no iron.)*

**S-70 · The re-test: the original is always offered first.** *(The whole L2 guarantee.)* Once E' is
standing, every Swap on E' offers **E first**. A swap-back to E, twice, re-adopts E. An accidental
adoption (a station taken twice) is thus continuously and cheaply reversible — adoption is never a
latch, only the current fact. Symmetric in both directions.

**S-71 · The learned "leave it" — resisting the engine's own rotation.** The engine rotates a
genuinely **stalled** lift (S-25.2: `attempts > N`, a last resort — weeks of real time, verified in
`loop2.ts`). If she swaps back to the rotated-away lift, that is an athlete swap; done **twice**, the
engine adopts it **and stops rotating it** — a learned pin, *earned by resisting rotation*, not
declared on a button. Thereafter it behaves exactly as S-30's pinned-and-stalled lift: it still gets
back-off/re-climb, but the engine never takes it away. This bounds the "rotate ↔ swap-back" loop to
two cycles. The learned pin persists (through reassembly, and a muscle off→on, S-66) until she swaps
it away herself, and it feeds **S-59** (pins vs. the time budget) unchanged.

**S-72 · An engine rotation is never counted as an athlete swap.** The two signals stay strictly
apart: only an athlete-initiated swap advances a pending (S-68/69) or a leave-it (S-71). An engine
rotation always leaves the previous lift reachable via S-70.

**S-73 · The programme-edit swap and the pin BUTTON are deleted.** *(Supersedes S-31; retires the pin
control.)* There is no edit screen. The old permanent edit-screen swap (S-31) is gone — its job is
done by the learned standing replacement (S-69) and by the body map (turning a muscle off). The pin
button is gone — its concept survives as the learned leave-it (S-71), which inherits **every** role
the pin had: never rotated (S-25.2), cut last under the budget (S-35/S-59). A **read-only plan
PREVIEW** (the day's exercises + form clips) may live off the Home entry point — off the START path —
and it edits nothing.

**S-74 · A muscle's pool can no longer be "declared empty."** *(Amends S-62.)* Because she can no
longer declaratively swap an exercise away forever, the pool never empties by refusal — she always
performs *something* for the muscle. The S-62 question ("want this muscle off?") is therefore reached
only through the body map (S-56), never through swaps. **The map is the only "off" lever.**

**The honest costs (named, not hidden):**
- **Discoverability moves to the stage.** The edit screen taught the swap verb; deleting it means the
  swap affordance on the live stage must teach itself, or a novice who dislikes an exercise never
  learns she can change it. A design task, not an engine one — but the real price of the deletion.
- **No couch-planning.** An exercise can be changed only at the gym (in a workout). On-soul
  (*"Hush builds it"*), but a deliberate loss of pre-planning.
- Neither cost touches a load. The engine is unchanged except that it now **writes** `substitutes` /
  the leave-it flag from behaviour and **reads** them at assembly — structures that already exist.

### C · The ledger delta
- **+ F-14: K = 2** — consecutive same-target in-workout swaps before a standing replacement (S-69) or
  a learned leave-it (S-71) commits. An evidence gate (F-12/N family); it sets **no load**. Chosen
  deliberately small: the engine reacts fast, and S-70's perpetual re-test makes a wrong adoption
  cheap to undo, so "2" behaves like a responsive threshold, not a lock.
- **No bootstrap added. No load-touching constant added.** The ledger's core claim (Part 6) holds: no
  invented number decides a load and is left standing.
- **Removed from the product** (these were declarative UI, never ledger constants): the programme-edit
  swap (S-31), the pin button, the onboarding rep-band question, the onboarding minutes question, and
  the `experience` input.

### D · The test obligation (Part 7 discipline)
Each new situation gets its test — `s69_two_swaps_adopt`, `s70_original_offered_first`,
`s71_resisting_rotation_becomes_leave_it`, `s72_engine_rotation_is_not_a_swap`,
`s74_pool_never_declared_empty` — plus `per_muscle_band_reads_primary_muscle`, and a **tripwire**
asserting no exercise is credited to more than one muscle (guarding the no-secondary-coupling
invariant verified above). **Green, or we are not done** — the same standard as every S-n.

> **Inline reconciliation DONE (2026-07-16).** L6, Part 1's declared-facts table + the T section, S-6,
> S-20, S-30, S-31, S-62, Part 3 (assembly wired + the density bootstrap), Part 5 (deletions), Part 6
> (F-14 + B-8, the counts), and Part 7 (71 situations + the stage table + the status note) now all read
> Rev 7-current. Part 9 remains the single deep source for §A (per-muscle T, the dropped questions) and
> §B (learned selection); the inline mentions point back here.
