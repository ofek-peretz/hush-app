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

**★ REVISION 14 (2026-08-19) — THE REGISTER IS RECONCILED WITH THE SHIPPED ENGINE.** A six-part,
clause-by-clause audit read this document against the built engine. **The engine came out well: not
one declared constant has drifted from its value here, both determinism guarantees (I-24 / I-25)
hold, and Revision 7 is wired end to end.** Almost every disagreement was **this document being
stale** — so nothing below changes the engine, and nothing below deletes a decision: each superseded
rule stays visible and is superseded *in writing*, the way S-59, S-60 and S-62 already are.

1. **S-38 FORBADE AN ABSENCE ADJUSTMENT WHILE B-9 RATIFIED ONE, and the document asserted both.**
   S-38 now carries B-9's amendment note, the trigger `COMEBACK_DAYS` = 10 is declared (it was
   nowhere in Part 6), B-9's *"snapped DOWN onto her learned grid"* is corrected to the **nearest**
   rung the code actually takes (with the measurement that chose it), and the Welcome Back screen's
   copy — which was still promising the loads had not moved — is recorded as corrected.
2. **THE 60-MINUTE, SETTINGS-EDITED TIME BUDGET is superseded by F-15** (`SESSION_MIN` = 45 /
   `SESSION_MAX` = 60). Both stale sentences — Part 1's declared-facts table and Part 9 §A — now say so.
3. **THE e1RM BAN was too wide to be true.** B-1 prices its cross-exercise transfer with Epley and
   B-5 (revised 2026-08-16) reads `loadMath.epley` / `loadForReps` both ways. Part 1's banned-inputs
   line and Part 5 now ban what is actually banned: **e1RM as a JUDGEMENT about her capacity — never
   as arithmetic inside a declared bootstrap.**
4. **S-67's PREMISE WAS FACTUALLY STALE** — there are two assisted machines in the catalogue now, and
   the sign problem was resolved by giving them no load axis at all. Recorded, with the law that pins it.
5. **F-4's "budget is 2 marks" IS THE CEILING, NOT THE OPERATIVE BUDGET.** Two refusals that exist in
   the code and nowhere here — **one mark at or below `FULL_BODY_UNTIL_DAYS`**, and **never two marks
   in the same region** — are written in beside F-4 and S-4.
6. **THE REV-7 DENSITY EXAMPLE WAS DEAD ARITHMETIC.** `DAY_ONE_EX_DIVISOR` = 5 is right; *"a normal
   muscle → 2 exercises"* was derived from the flat B-2 that `startingWeeklySets` replaced. Replaced
   with the real formula and a worked number (Back, four days: **28 weekly sets → 6 lifts**).
7. **EIGHT CONSTANTS THAT REPEATEDLY ALLOCATE REAL VOLUME WERE DECLARED NOWHERE** — by F-9's own
   standard (*"it repeatedly allocates real volume, so by our own standard it is a form constant and
   is named here, not buried in an example"*) that is a hole in the ledger. They now have a **B-2
   sub-table** in Part 6. Six more constants are declared in the rows that own them.
8. **L10 FORBADE SOMETHING THE ENGINE DELIBERATELY DOES.** It reads her slope and then rounds the
   answer conservatively; both alternatives were measured on the full accuracy board this week and
   both lose. L10 now draws the distinction instead of banning the practice.
9. **THE PAIN / EASE SYSTEM IS NOT IN THIS REGISTER AT ALL** — zero occurrences of "pain", "twinge"
   or "sharp" — while it bans lifts and shapes her week. Flagged as an unwritten subsystem (Part 4 §K).
   Two fixes it produced this week are recorded: `addWeeklyCore` and `resolveChain` each had a door
   the ban did not cover.

**THREE CONFLICTS WERE FOUND BETWEEN A RATIFIED CLAUSE HERE AND A RATIFIED DECISION IN THE CODE.
TWO OF THEM THE EVIDENCE SETTLES, AND THEY ARE SETTLED HERE.**

10. **THE STATION LAW (Part 3 #3/#4) — SETTLED, and the dates settle it.** Rev 12 §8 ratified
    equipment-class grouping on **2026-07-21**; the founder rejected what it produced on
    **2026-08-08**, eighteen days later, after seeing a week it built — naming both halves, the
    equipment blocks and the isolation-before-compound they cost. A clause ratified *before* the
    result was visible does not outrank the ruling made *after* it. #3 and #4 are struck; the
    shipped ordering (compounds globally, physical `station` as a tie-break) is the law. Both
    sides stay recorded at the clause.
11. **`repairWeek`'s PRICING (Part 3) — SETTLED, and the measurement settles it.** Closing the
    inconsistency costs **3.3 points of in-band accuracy** (58.31% → 55.03%). It stays. What was
    wrong was what the number is CALLED: it is a **volume governor**, not a rest estimate, and it
    is now named that in both places. The real work, when someone wants it, is an explicit
    conservatism parameter tuned against the same board.

12. **THE EXERCISE LIBRARY vs. "NOTHING IS BROWSED BY HAND" (Part 9 §B) — SETTLED by the founder,
    on being asked what the screen is for:** *"to choose a lift you love over one you don't. Or a
    lift you love as well as the existing one."* That is a preference, not a programme. §B's rule
    is narrowed to what it was actually protecting — **no load, set count, day or order is ever set
    by hand** — and the "as well as" half is answered by the engine as Part 3 requires: a pick
    **leads** its muscle, it never **adds** a seat.

*Nothing is left marked OPEN in this revision. An open question written down is a question; an open
question left out of the register is a defect waiting to be re-discovered — and the three this audit
found are now decided, each beside the clause it belonged to, with the evidence that decided it.*

**★★ REVISION 10 (2026-07-21) — THE DOCUMENT IS RECONCILED WITH ITSELF, AND LOCKED.** Founder
instruction: *"this document is the only source of truth — not things that were true for the V4
engine."* A line-by-line pass for **critical internal contradictions** (facts, not theoretical holes)
found **six**, all in the seams Revisions 7 and 8 left open, and all now closed. Every fix takes the
**later, ratified** half of a contradiction and strikes the stale half — no new design was invented.

1. **REV 8 BROKE THE LEDGER'S CENTRAL CLAIM, and nothing said so.** B-1's numbers were declared
   acceptable *"only because the approach set overwrites them in 90 seconds… not one of them ever
   survives into a working load."* Rev 8 deleted the approach set — **so a B-1 cold-start number IS
   now the load on the bar for set 1.** The claim was simply false as written. Fixed at B-1 and in
   Part 6: **Loop 1 is what redeems B-1 now**, correcting from her first set. Still L2 (a guess
   immediately tested), but tested by a *working* set, and the honest cost is stated.
2. **THE RAIL HAD NO FALLBACK.** L11 said it goes quiet on a new or aged-out lift *"where the
   approach set guards instead."* It doesn't exist. F-10 (the sanity ceiling) was deleted as theory.
   So that moment had **no guard named anywhere.** Fixed: L11 now names what actually guards it —
   Loop 1 from set 1, plus the athlete's own eyes on a visible number (S-49). No ceiling invented.
3. **EIGHT SITUATIONS STILL PRESCRIBED THE APPROACH SET.** S-1, S-8, S-9, S-38, S-41, S-43, L2, F-8
   all told the engine to do a thing Rev 8 deleted. Rev 8's own note asked the *reader* to mentally
   patch them — **a document that requires mental patching is not locked.** All eight rewritten.
4. **★ THERE IS NO PIN (founder, 2026-07-21).** The word carried two incompatible meanings: a
   **declared quantity** (S-59, S-63, S-66, Part 3 #5) and an **inferred leave-it** (S-71). Rev 7
   deleted the button but never reconciled the first set. **S-59's question — *"You've pinned six
   lifts. Four fit in 45 minutes. Which two come out?"* — describes a state she cannot put the engine
   into**, since a leave-it is earned one lift at a time by swapping back twice to something the
   engine tried to rotate away (K=2). **That question is deleted.** Everywhere else "pin" is now
   "leave-it": *nothing is declared, everything is learned from her swaps.*
5. **LOOP 3 CONTRADICTED ITSELF ON THE UNIT OF VOLUME.** Part 2 said *"each day is its own volume
   track — this Monday's chest work is adjusted from last Monday's."* The founder-ratified note under
   S-34 says the fold is **exercise-keyed and day-agnostic by design**, because a historical
   session's `programDayId` may point at a regenerated programme. Both were in the document. The
   later, ratified half wins: **the muscle is the unit** (as it is everywhere else here), the
   decision is per occurrence. Per-day tracks also halved a two-day muscle in practice.
6. **`experience` WAS DELETED FOR A REASON THAT NO LONGER EXISTS.** Part 9 §A deleted it *"because
   the approach set measures her."* It doesn't. The deletion stands on **L1** — a self-report is not
   a fact the engine measured — which was always the stronger ground, and Part 9 §A now says so, and
   names the cold-start (B-1) explicitly as part of the decision path it must leave.

**Also struck:** Part 7's *"71 situations, 71 tests"* (a count that goes stale on every revision — the
guarantee is now stated without a number), S-60 from the Stage 1/2 coverage rows, and the Rev-7 audit
note still claiming `APPROACH_FRACTION` was wired.

**THEN THE CODE WAS SWEPT AGAINST IT — v4 inputs were still deciding loads.** `src/engine/v4/` was
deleted at the burial, but v4 INPUTS lived on in the layer that CALLS the engine, because nothing
failed when they did. Each of these multiplied a real prescription and **none appears anywhere in
this document**; all are now removed, and pinned by `__tests__/laws/onlyV5IsInTheEngine.test.ts`:

| Removed | What it was doing | The register |
|---|---|---|
| **`experience`** | a SELF-REPORT scaling every cold-start load ×0.78 / ×1.00 / ×1.22 — and since the onboarding question was deleted but the decision path was not, **every new athlete fell to `beginner` and had her day-one loads cut by 22%** | Part 9 §A deletes it "from onboarding, Settings, **and the profile's decision path**"; L1 bans it |
| **`age`** | a per-decade cold-start multiplier down to ×0.80, plus −1 set at 65+ | B-1: the cold start is "her sex + bodyweight"; S-42 refuses the identical guess for height |
| **`goal`** | a fork on a self-reported goal in the set scheme | Part 5 deletes the goal fork — "there is one goal: hypertrophy" |
| **the weekly VOLUME lever** (`low`/`moderate`/`high`) | ±1 set on every exercise, **by declaration**, with no UI left to set it | Loop 3 earns and cuts volume from FACTS (S-32/S-34) from B-2. A dial is the opposite |
| **`MAX_SETS = 4`** | a second ceiling fighting F-1, while `distributeMuscleSets` already gave a grown muscle 5 | F-1: 3–5, and only that |
| **`engineSlotId` / `canonicalEngineId`** | slot keys + a unification hack | Loop 2: "state is keyed to the exercise, never to a slot"; S-29 deletes the hack by name |
| **the "week 1 is silent" gate** | suppressed the engine's reason line until calendar week 2 | L7 (no weekly boundary) and Part 1's banned inputs ("calendar-driven anything") |
| **`pinsByMuscle`** | named a thing that no longer exists | renamed `leaveItsByMuscle` — **there is no pin**; it is earned at K=2 (S-71) |

**Did v5 solve each of them? Yes, and by the same mechanism every time: Loop 1.** What `experience`
and `age` were guessing at — how strong she probably is — Loop 1 measures from her first working set
and corrects before the second. What the volume lever declared, Loop 3 earns. What the slot key
tracked, exercise-keying makes unnecessary.

> ### ⚠️ THE CONSEQUENCE, STATED PLAINLY: DAY-ONE LOADS GO UP
>
> Deleting `experience` and `age` is not a refactor. It changes the first number a new athlete ever
> sees, and this document should say so rather than let it be discovered on a stage. **Measured
> across the catalogue, the cold start moves by ×1.00 to ×1.75.** Real lifts, before → after:
>
> | Athlete | Bench | Squat | Pushdown | Lat pulldown |
> |---|---|---|---|---|
> | male 30, 80 kg | 33 → **43 kg** | 42 → **53 kg** | 16 → **20 kg** | 27 → **35 kg** |
> | female 30, 60 kg | 20 → **20 kg** *(at the bar)* | 22 → **29 kg** | 10 → **12 kg** | 17 → **22 kg** |
> | male 72, 80 kg | 27 → **43 kg** | 33 → **53 kg** | 12 → **20 kg** | 22 → **35 kg** |
> | male 30, 80 kg, **declared "intermediate"** | 43 → **43 kg** | 53 → **53 kg** | 20 → **20 kg** | 35 → **35 kg** |
>
> **Read the last row: nothing changed for her.** The new number is exactly what an athlete who
> declared "intermediate" was always given. The old behaviour was not a deliberate conservatism —
> it was a **self-report default**: Rev 7 deleted the onboarding question and left the multiplier in
> the decision path, so *every* athlete answered "beginner" by omission and took a 22% discount
> nobody chose. On top of it, a 72-year-old took a further 14%. Removing the two does not make the
> engine bolder; it stops it from quietly marking her down for a question it no longer asks.
>
> *(Rev 12 note: the female column above predates the population-data calibration — the female
> factors have since moved 0.62/0.72 → 0.52/0.66, so her actual day-one numbers are slightly lower
> than this table shows. The male column is unchanged. See the Revision 12 block and B-1.)*
>
> **What carries the risk is B-1's own row, and Rev 8 already changed who holds it.** The old
> protection was the approach set — a light measurement before the real work. It is gone, so the
> first set of a brand-new lift is now the cold-start number itself. **Loop 1 is the whole guard:**
> it reads that set and moves the load before the second one, in either direction, and the athlete
> sees the weight on the stage before she touches it (F-2 — a prescribed rung is a suggestion, never
> a requirement). That is L2 honoured, not evaded — but it is a working set doing the measuring now,
> and this is the paragraph that admits it.

**AND THE LAST THREE, from a final pass over what the ledger DECLARES vs what the code holds:**

- **B-4 was half-wired.** It names two facts that replace the day-one per-set cost — *"her measured
  rest (built, Stage 0) **and her set durations (timestamps)**."* The rest half shipped; the work
  half did not, so a fixed `SET_EXEC_SECONDS` was standing in for a fact every logged set has carried
  all along. `learnedExecS` now reads it — `(persistedAt[i] − persistedAt[i−1]) − restBeforeS[i]`,
  same-exercise same-session pairs only, and only when the rest is KNOWN (an unknown rest would
  silently become "work", L3). The time budget (S-64) now prices **both** halves from her.
- **F-2 and B-6 each lived in the code TWICE.** `engine/loadMath` carried its own `LOAD_INCREMENT`
  (a second B-6) and its own grid snap with a `GRID_SNAP_TOLERANCE_KG` rule `engine/v5/grid` did not
  share (a second F-2) — the cold-start seed and the live loops free to disagree about what is
  loadable on the same lift. `normalizeLoad` now **delegates** to `grid.snapDown`; B-6 has one
  declaration. `BAR_KG` moved into the v5 ledger beside it (it was in `loadMath`, which the grid
  imported while `loadMath` imported the grid back — a cycle, and two chances to hold a different bar).
- **The swap pool is now scoped in writing.** Its GATES are register law (before the first set;
  same-muscle synonyms only — "a swap can never change which muscle is trained"). Its SCORE is not:
  it sets no load, moves no volume, appears nowhere here, and its weights are **not** ledger
  constants. Said out loud in the module so the two are never confused.

**Left as TODO(screens), deliberately, for the founder's redesign:** **S-3's sentence** (a day that
genuinely cannot fit her minutes is reported to telemetry but not yet said to her, in words) and
**S-59's surface** (its assembly rule — a leave-it is cut last — is built; Rev 10 deleted its old
prompt because a declarative pin no longer exists). Both are marked in `fixtureModel` at the exact
line that produces the fact the copy needs.

**THE DOCUMENT IS NOW SELF-CONSISTENT.** No situation prescribes a deleted mechanism; no law cites a
guard that does not exist; "pin" appears only as a historical word; and every load-touching bootstrap
names the thing that actually corrects it.

**★ REVISION 11 (2026-07-21) — THE POST-LOCK SWEEP.** A line-by-line code↔register pass after the
lock. One real behavioural defect, a Rev-8 residue sweep, and three calibration fixes — all built,
tested (931 green + tsc + both lints + `expo export`), nothing in the design changed.

1. **S-52 · THE BODYWEIGHT STALL RAN ON THE WRONG AXIS — this situation's OWN trap case was still
   frozen.** The built stall read was "failed to clear `Tlo`", which is the LOADED lift's clear. On a
   bodyweight lift that read is wrong three ways at once:
   - **The register's motivating example — a 12-15 athlete stuck flat at 3×12 — never graduated.**
     She meets `Tlo` every session, so "failed to clear" never fires; she never reaches `Thi`=15 and
     has no load lever. Frozen forever — the exact wording of the trap Rev 6 recorded as fixed.
   - **A fresh post-graduation lift climbing reps BELOW `Tlo` graduated AGAIN after two occurrences.**
     8 → 9 in a 12-15 band read as "not cleared" twice → `attempts > N` → graduate — a
     chain-graduation up the ladder while she was honestly climbing, which is the opposite of
     *"graduating drops her below the new lift's `Tlo` and she climbs again — no harm."*
   - **A flat occurrence at `Tlo` counted as a lift "advancing" for Loop 3** — so a muscle's volume
     could grow (S-32) on a session where nothing moved, an S-32b breach.
   **Fix — the S-25 machinery, run on the reps axis, no new constant:** the scalar is the
   occurrence's **worst-set reps** (all sets, the S-22 discipline); *advanced* = it beat every prior
   occurrence's (a first occurrence sets the wall); `N` = her own **attempts-to-improve** (the
   nearest-rank 75th percentile of occurrences historically spent before adding a rep, F-13; B-3
   seed); stall = exceeding it → graduate. `Thi` on every set still graduates immediately.
   Tests: `v5_stage1_core` ("S-52's OWN trap case", the chain-graduation guard, the S-32b hold).
2. **Rev-8 residue swept out of the code** (this document deleted the approach set; these survived
   it): the unreachable `Loop2Decision 'approach'` + `Loop2Result.isApproach`; **`SetTarget.isApproach`
   and the `completeSet` line that copied it onto new logs** — "nothing writes the mark any more" is
   now literally true (`SetLog.isApproach` stays, read-only, for the legacy Build-#33 fold-exclusion);
   `RECENCY_WINDOW_DAYS` (its only job was the approach trigger; unused since); and
   `STARTING_SET_SECONDS` — a second, unwired declaration of B-4's day-one cost whose numbers
   (210/150 s) disagreed with the live ones. One declared constant, one home.
3. **Three calibrations:** the seed's e1RM→working conversion priced every transfer at a fixed **8
   reps** whatever band she declared — it now prices at **her `Tlo`** (identical for the default band;
   a 12-15 athlete's transfer is no longer ~12% heavy); the S-3 over-budget report was priced with
   her measured REST but the bootstrap EXEC (so the report could disagree with the enforcement about
   whether a day fits) — both measured halves now; and the stage's reason-delta could read a legacy
   15 kg approach set as "her previous weight" — excluded. Also struck: `milestones`' profile type
   still carried `experience`/`age` (unused v4 leftovers in a load-adjacent surface).

**★ REVISION 13 (2026-07-21) — THE REST DOCTRINE COMPLETED, AND THE DOCUMENT MADE ANSWERABLE TO THE
TEST SUITE.** Founder instruction: go over the WHOLE register and verify that every live situation is
backed by a test, and fix the small remaining nuance in the rest times. 970 tests + tsc + both lints +
`expo export` green.

1. **S-17 / S-64 · THERE ARE TWO KINDS OF REST, AND THE ENGINE WAS LEARNING ONE NUMBER FOR BOTH.**
   The rest before **set 1** of a lift is not a rest at all — it is the walk to the next station, the
   setup, the plate change. The rest before **sets 2..N** is recovery. The log already carries the
   fact that separates them (`setIndex`), and nothing was reading it: every `restBeforeS` went into
   one per-exercise median. Two consequences, both small and both real: a lift's between-sets median
   was **dragged upward by its own first-set samples** — so the engine measured her and then handed
   back a timer longer than the one she actually takes, which is precisely the argument S-17 exists
   to end — and the between-exercises rest was **never learned at all**, sitting on the fixed 120 s
   bootstrap forever. **Now:** `domain/restPrescription` is the ONE home for the whole doctrine —
   the three bootstraps (B-4 family), the per-lift INTER median (`setIndex > 0` only), and a POOLED
   TRANSITION median (`setIndex === 0`, pooled across lifts, because the walk between stations is a
   fact about her gym and her pace, not about the lift she is walking to). `sessionStore` re-exports
   it, so every existing surface reads the same answer, and the learned transition now ships to the
   **standalone watch plan** as well. L3 holds throughout: an unknown rest is ABSENT, never zero.
   **And the budget now prices the same seconds the timers run:** `estimateSessionMinutes` charges a
   day's between-exercise gaps at her transition rest instead of silently pricing them as another
   inter-set rest — the S-64 ceiling and the S-17 clock finally agree about what a workout costs.
2. **THE TRACEABILITY AUDIT — every live situation, law, fact and constant in this document is now
   named by a test.** The check is mechanical, not a feeling: the register is parsed for its live
   `S-`/`L-`/`F-`/`B-` entries and each must appear in `__tests__`. **Six were genuinely uncovered
   and got tests** — S-15 (the median absorbs a mis-key), S-21 (an untrained managed lift earns
   nothing and says nothing), S-44/S-66 (off→on resumes, and the leave-it resumes with it), S-46 (a
   tripwire: no cardio or HR source may appear in an engine file), S-56/S-65 (the Saturday letter's
   ask-back card, at the screen — that a question never blocks Done), S-45 (a volume move renders as
   a muscle row with its why), and **F-8 / F-11 / F-12 / F-13** (reps-per-rung had no direct test at
   all: the rest band, the evidence gate, the recency window, and Theil–Sen's resistance to one wild
   set). Eight more were covered under another name and now carry their S-number so the next sweep
   finds them: S-1, S-7, S-10, S-27, S-39, S-48, S-57, S-62.
3. **L5 · THE LEDGER WAS SHORT ONE ROW, AND ITS OWN COUNT SAID SO.** L5 requires a constant to be
   "declared out loud and **counted**." **F-14** (K = 2) lived only in a parenthetical under the
   table — never a row — while the summary line above that parenthetical still read "six bootstraps
   and eight form constants" and the parenthetical below it read "seven and nine." Both fixed: F-14
   has its row, the count is right. **And L5 is no longer kept by hand:**
   `__tests__/laws/everyConstantIsDeclared.test.ts` reads these tables and the engine's source as
   data and holds them to each other on four points — every exported number carries its tag, every
   tag is a row that exists, every live row has a home in the code, and **every retired row is GONE
   from the code**. That last one has a body count: Rev 11 found two retired numbers still sitting in
   the source (`RECENCY_WINDOW_DAYS`, `STARTING_SET_SECONDS`). It was verified to fail on a
   deliberately resurrected one before being trusted.

**★ REVISION 12 (2026-07-21) — THE WEAK POINTS, RESOLVED AGAINST OUTSIDE EVIDENCE.** Each open
weakness from the Rev-11 critique was decided against published data and population statistics
(founder mandate: research first, then the best decision; day-one calibration from group data
explicitly approved). Five resolutions — two change numbers, one moves a question to where this
document always said it lives, two are ratifications with the evidence attached. 933 tests + tsc +
both lints + `expo export` green.

1. **B-1 · THE FEMALE COLD-START FACTORS WERE 15–20% HOT — now calibrated to population data.**
   The factors were 0.62 (upper) / 0.72 (lower) of the male load. Two independent sources agree they
   were high: research meta-findings put women at **≈52% of male upper-body strength and ≈66%
   lower-body**, and the ~25-million-lift StrengthLevel dataset gives the same same-bodyweight,
   same-percentile ratios (bench ≈0.51, squat ≈0.65, deadlift ≈0.66). So a woman's first-ever set
   sat 15–20% above the percentile her male counterpart got — and the cost is asymmetric: a
   too-heavy set 1 is the scare moment (she fails the first thing the product ever asked of her),
   while a slightly-light one becomes Loop 1's **visible** "you did 14, so I added weight" — the
   product's signature moment. **Factors are now 0.52 / 0.66** (`domain/startingLoad`, exported;
   the Portrait benchmark reads the same constants — one opinion in this product about relative
   strength). Male numbers verified against the same standards (day-one seed ≈ the community
   "Beginner" e1RM, at 8 reps ≈ 72–80% of it) and left alone. Pinned by a ratio test in
   `onlyV5IsInTheEngine`.
2. **B-3 = 1 · RATIFIED AGAINST PRACTICE, not just kept.** With no clear-history, `N = 1` means the
   first back-off comes on the **second consecutive failed occurrence** at a load — which is
   exactly the standing double-progression coaching rule ("if you still can't stay in your rep
   range after the attempt, reduce and rebuild"). Not premature: a first miss holds (S-24), a second
   acts, and `N` then personalises upward from her real attempts-to-clear (a grinder's N becomes 3
   on her own record). The bodyweight attempts-to-improve read (Rev 11) inherits the same seed and
   the same defence.
3. **L11/F-8 · THE RECENCY WINDOW IS A SESSION COUNT, DELIBERATELY — the "layoff" sentence was the
   stale half and is struck.** L11 claimed "after a real layoff the rail goes quiet"; the code's
   window is the lift's most recent `RECENCY_WINDOW_SESSIONS` sessions, with no calendar in it, and
   **the code is right**: (a) the rail only ever CAPS a raise — it never sets a load — so an old
   record's ceiling cannot "pin her under" anything (the anchor and Loop 1 follow her down
   regardless); (b) detraining research shows strength is largely retained for weeks and only
   partially lost over months, so her old record + one rung stays a MORE protective ceiling than no
   ceiling at all; (c) a calendar cutoff would re-introduce a days constant whose only effect is
   deactivating a guard. A count window also survives the athlete who trains a lift rarely — her
   twelve real occurrences ARE her recent history on it. L11 and the F-8 ledger row now say this
   in as many words.
4. **S-56 · THE ONE QUESTION NOW LIVES WHERE THIS DOCUMENT ALWAYS PUT IT — the Saturday mirror.**
   The built behaviour was a confirm sheet in front of the OFF toggle: a mechanism that appears
   nowhere here, and one that argues with a choice she is making right now (L8). Now: the map
   editor obeys an OFF **in silence**; the weekly mirror asks **once per muscle, ever** — "{muscle}
   has been off a while. Want it back?" — only for a muscle with a logged set
   (`engine/v5/bodyMap.askBackMuscle`, deterministic by F-9, one question at a time), and either
   answer retires it forever (L4, `prefs.askedBackMuscles`). One tap on "bring it back" and the
   muscle RESUMES with its history (S-44). Tests: the pure predicate (stage 4) + the editor's
   silence (render).
5. **S-28 · THE HOLD NOW TEACHES THE ESCAPE HATCH.** The learned grid knows only the rungs she has
   performed, so a machine she has used at 40 and 50 reads as a 10 kg-step machine even if 45
   exists. Rather than prescribe a weight the engine cannot know exists (the F-2 line it must not
   cross), the `rungOutOfReach` narration now ends with F-2 said to her directly: *"If the machine
   offers a smaller jump, load it and I'll learn the step."* Her one performed set at 45 makes 45 a
   real rung forever. The release condition stays exactly as built and is hereby RATIFIED:
   the rung is taken when `reps − perRung ≥ Tlo` — her measured slope says the step no longer
   breaks her. **Also ratified: the S-11 "recovered in ONE correction" promise and the rail are not
   in tension** — see the note under S-11.
6. **And the last v4 self-report is out of the product entirely:** the Capability Portrait's
   "still learning" prior read `profile.experience` (display-only, but a guess wearing a bar). One
   neutral prior now; her own lifts replace it within sessions.
7. **S-45 · THE MIRROR NAMED THINGS THE ATHLETE COULD NEVER SEE — the plan view dropped three of
   the change log's four kinds of news.** Found by the third hermetic pass (2026-07-21, same day).
   `getWeeklyPlanV5` attached changes by `c.exerciseId` and hardcoded `swapped: false` — but a
   STRUCTURAL change is keyed by the lift that LEFT (absent from the very programme that enacts
   it), and a VOLUME move is keyed by a MUSCLE (which no slot matches). The data layer named them
   (`getWeeklyUpdateV5`, proven in stage 7) while every surface the athlete reads consumes the PLAN
   view — so: the Saturday letter never showed a graduation/rotation/adopted-swap row (its whole
   `swapped` UI branch was dead); **Home's one-tap rotation-UNDO could never appear** (it keys off
   `snapshot.swapped`, permanently false); the briefing's swap sentence was dead; and a volume-only
   week read "steady" on the letter while the Home note claimed the programme was updated. "Built
   but unconnected" — the exact Part-7 failure, one seam further out than Rev 9 looked. **Fixed:**
   a structural change attaches to the lift that ARRIVED (`toExercise`), marked `swapped`, shown at
   its own current number (S-8/S-9 — never the old lift's load); volume moves ride the view as
   muscle rows (`WeeklyPlanView.volume`), are rendered by the letter with their why, are COUNTED in
   `changedCount`, and reach Home's briefing as the "tuned" count. Tests: stage 7 (structural →
   plan view, swapped; volume → counted + carried).
8. **Part 3 #3 · THE STATION LAW, VERIFIED ON REQUEST — held in principle, hardened at two seams,
   and PINNED (it had no test).** The founder asked (2026-07-21) whether a day really exhausts a
   piece of equipment before moving on. The class-grouping held; two seams did not: (a) the leg
   press and its calf raise — the one catalogue pair sharing a physical machine — could be split by
   the block's compounds-first order (leg press → leg extension → back to the leg press); a
   `station` field on that pair now pulls them back to back; (b) `applyLeaveIts` runs after the
   ordering and can plant a different-equipment lift mid-block — the day is now re-flowed after it.
   `flows/stationFlow.test.ts` pins the law at all three layers; the implementation note lives
   under Part 3 #3.

**★ REVISION 8 (2026-07-16, founder ruling from Build #33 manual QA) — THE APPROACH SET IS REMOVED
ENTIRELY.** S-60 in whole (and its dependents — the "light load" B-1 fraction `APPROACH_FRACTION`, the
`isApproach` *prescription*, the F-8/S-38 layoff re-measurement) is **gone from the engine.** Every set,
including set 1, is now the real working load from the first set, and Loop 1 responds to what she
performs from the very first set — the v4 behaviour the founder valued. Rationale (founder): "I don't do
warm-up sets. It's nonsense that hurts UX and scares the customer from the first moment — a lift showing
15 kg then jumping to 34 kg looks broken. In v4 it just showed the starting weight for the muscle group
and the engine responded from set 1." **What this means for the rest of this document:** wherever S-60 /
the approach set is invoked below (S-1, S-8, S-38, S-41, L2, L11, B-1, F-8), read it as *"the working
load stands from set 1; Loop 1 is the in-session safety."* The **cross-exercise seed transfer** described
in B-1/S-9 (a new lift inherits her proven same-pattern strength via the `baseKg` ratio, never a
cold-start) **STAYS** — that was never the approach set, and it is verified live (`v5_cross_exercise_transfer`).
Two guards are also KEPT: (a) the `SetLog.isApproach` **fold-exclusion** filters, because Build #33
shipped the approach set live and testers' on-device histories already contain `isApproach` sets that
must stay out of the fold; (b) the rail (L11) as the standing in-session/between-session ceiling.

**★ THE BAND-FLOOR BUG, fixed the same day (Build #33 QA — the real defect behind "the load never
moves").** Loop 1 read its rep band from `target.recommendedReps`, but the phone's edit wheel
(`editCurrentSet`) overwrites `recommendedReps` with the athlete's *performed* reps — so the band
tracked her input and every set sat "in band," freezing the load no matter what she entered. Fixed with
an **immutable `SetTarget.repBandLo`** (the true Tlo, mirrors `repBandHi`, untouched by edits); Loop 1
now reads the band from it. Test `v5_loop1_edited_reps`. This was independent of the approach set — it
would have frozen the load even without one.

**★ EDITED WEIGHT NOW CARRIES FORWARD (Build #33 QA, founder ruling).** A weight the athlete actually
lifts is the baseline for the REST of the exercise — if she edits the prescribed load up or down (the
machine's real pin, a heavier dumbbell she reached for), that choice STICKS for the remaining sets
instead of reverting to the prescription every set (before, she had to re-edit each set). `sessionStore.
completeSet` runs, in order: (1) `carryWeightForward(plan, idx, performedWeight)` — weight only; reps,
band, perRung untouched (each set still targets Tlo); a set completed at exactly the prescription is a
true no-op; (2) `applyLoop1` ON TOP, so an out-of-band rep count corrects FROM the load she actually
lifted, not the old prescription. Both up and down. Tests `v5_carry_weight_forward`. **Credibility is
immediate** — from set 2 of the first exercise on the first workout, the app shows her real working load
and never asks her to re-enter it.

**★ LIVE LOOP 1 NOW SNAPS TO HER LEARNED GRID (Build #33 QA, same batch).** A mid-session correction used
to step by the equipment DEFAULT increment (`metaFor` carried no grid) — so a dumbbell raise could ask
for "17 kg" that her gym doesn't stock (it jumps 16 → 18). Now `sessionStore.completeSet` computes
`observedLoads(exerciseId, [thisSession, ...history])` — her real performed rungs across history AND this
session so far — and passes it to `applyLoop1` (new optional arg) → `metaFor` → the grid math. So a
correction lands on a weight that PHYSICALLY EXISTS at her gym, the same grid the between-session
prescription already uses. Above her top observed rung it steps by the increment (a real new-PR raise,
S-9). `historyRef` is loaded once at session start (and on resume). Legacy approach sets are excluded
from the grid (`!isApproach`). Test `v5_loop1_learned_grid` (16 → 18 with grid, 16 → 17 without).

**★ REVISION 9 (2026-07-21) — THE LINE-BY-LINE AUDIT.** A hermetic pass over this document against
the built engine, situation by situation. Eight defects, each now fixed + tested
(`__tests__/engine/v5_register_gaps.test.ts`); tsc + 888 tests + both lints + `expo export` green.
Nothing in the design changed — every fix makes the code do what this document already said.

1. **S-55 · THE BAR WAS NOT THE FLOOR ON THE ENGINE'S OWN GRID.** `engine/loadMath.normalizeLoad`
   floors barbell loads at `BAR_KG` — but that is the *cold-start seed's* path. v5's live progression
   walks `engine/v5/grid`, which had no idea a barbell weighs anything: a failed set on `bb_curl` at
   20 kg prescribed **17.5 kg** for the next set. The exact bug `barIsTheFloor` was written to kill,
   killed on one path and left alive on the other. The grid reads the same `BAR_KG` now.
2. **S-55 (b) · `loadFloor` was returning her LIGHTEST PERFORMED LOAD as the floor.** That is not a
   floor, it is a statistic. On a lift she had only ever done at one weight it made the floor equal
   the current load — so `max(floor, prevRung)` in the stall back-off clamped to a **no-op**.
3. **S-25.1 · THE BACK-OFF COULD BACK OFF ONTO ITSELF.** "The heaviest load at which all sets met
   `Tlo`" was read over the whole window, so a wall she had once cleared answered *itself*. Real
   path: clear 40 → fail 42.5 twice → back to 40 → fail 40 twice → back to **40**, for ever;
   `isRepeatedStall` never fired either (it needs an occurrence *lower* than the wall, and 42.5 is
   not lower). The read is now strictly **below** the wall.
4. **S-11 / L11 · THE RAIL NEVER REACHED LOOP 1.** S-11 says a raise is "always inside the rail" and
   S-14 calls the rail absolute; only Loop 2 clamped. One implausible rep count could size a
   mid-session correction to a load she has never come near. `railCeilingFor` (façade — the rail is a
   fact about her history) now feeds `correctInSession`. It only ever cancels a raise; it can never
   pull a load down, and a drop is never railed.
5. **S-17 · HER MEDIAN REST WAS NEVER THE PRESCRIPTION.** Half of S-17 shipped: `restBeforeS` was
   recorded and her median fed the time BUDGET — while the timer on screen still counted the same
   150 s she had skipped every set. The engine measured her and then argued with her. The rest timer
   is her own median now (phone, watch mirror, and the standalone watch plan, from one registry).
6. **S-35 / S-59 / S-63 · THE TIME CAP COULD STOP TRAINING A MUSCLE.** `enforceTimeCap`'s isolation
   drop had neither of S-35's two protected lifts and ignored pins entirely — so a tight budget
   silently deleted her only biceps or triceps lift, an `off` she never chose. Both guards added, and
   pinned lifts are cut last (S-59). **Consequence, and it is the register's own ruling:** a day may
   now finish OVER budget when every trained muscle is down to its last lift. That is S-3 — "the
   engine says so rather than quietly starving a muscle" — and it is reported rather than silent.
7. **S-47 · AN UNREADABLE ENGINE STATE WAS A SILENT RESET.** `getJSON` treats corrupt JSON as absent,
   so a lost `db.engineV5` was indistinguishable from a first run: the engine rebuilt from history
   and overwrote the blob without a word. The recovery is right (her history IS the safe
   prescription); the silence is what S-47 forbids. `db.engineV5ReadFailed()` tells the two apart and
   telemetry fires.
8. **S-68…S-72 · LEARNED SELECTION WAS STILL BEHIND THE DEAD COHORT GATE.** `sessionStore` gated the
   swap fold on `profile.repBand` — the old v5 cohort switch, on the one field Rev 7 §A *deleted from
   onboarding*. Any profile without it lost the whole of learned selection and the learned leave-it.
   A legacy fallback is meant to be free; one that switches off a feature is not. Gate removed.

**★ AND THEN THE LAW TESTS FOUND TWO MORE (same day).** The audit's own conclusion was that these
defects are never errors of thinking — they are laws that hold on one path and not its neighbour. So
`__tests__/laws/loadLawsHoldOnEveryPath.test.ts` was written to state each load law once and sweep
**every entry point that can put a number on the bar** (the real catalogue × every equipment class ×
loads on the floor × rep counts from 0 to 60 × with and without her learned grid). It failed on its
first run, on code nobody had suspected:

9. **`snapDown` SNAPPED UP, and it killed Loop 1's drop.** Its own header promises "snapping is
   always DOWN — normalization can only ever lower an implied load, never raise it (the safety
   invariant)". But when the ideal sat **below her lowest observed rung**, the loop's initialiser
   (`let down = rungs[0]`) returned that rung. On a lift she had only ever performed at ONE weight —
   **every lift on its second session** — Loop 1 computed the drop to 37.5, `snapDown` hauled it back
   to 40, and the result reported `corrected: false`. **The load could not ease.** That is the exact
   shape of the Build-#33 complaint ("no matter how many reps I write it stays at 34"), alive on a
   path the band-floor fix never touched, and it also re-froze the S-25.1 back-off from defect 3.
   **Fix (F-2, and the rule `normalizeLoad` already documented):** the learned grid speaks only
   *within* the range she has performed — outside it the equipment increment is the honest answer.
   Applied symmetrically to `nextRung` (below her lowest rung it proposed a LEAP up to it) and
   `prevRung` (above her heaviest it proposed a PLUNGE down to it).
10. **`normalizeLoad` could return 0.** S-55's first clause is "a prescription may never fall TO OR
    BELOW ZERO"; flooring to the increment returned 0 for any ideal under one step. Unreachable
    today — every caller happens to pass a positive number — which is precisely why it would have
    survived until a caller did not.

**The maintenance contract this earns:** if you add a function that returns a prescribed weight, add
it to `LOAD_PRODUCERS` in that file. Nothing else stands between this class of bug and the next one.

**11. S-28 · THE COARSE-MACHINE REP-CLIMB — NOW BUILT.** *(It was first logged here as "deliberately
not built", on the authority of a founder ruling from 2026-06-26. The founder rejected that the same
day, and was right on every count: that ruling is **v4-era**, it appears **nowhere in this document**,
and its whole justification — *"on a truly coarse grid the **e1RM rail** is a catch-22 wall"* — rests
on a rail **v5 deleted** (Part 5; L11: "v4's implied-e1RM rail capped a demand with a **formula**; the
rail is now a **fact**"). **THIS DOCUMENT IS THE ONLY SOURCE OF TRUTH.** A ruling that is not in it —
and whose reason the rewrite deleted — does not bind this engine. The correction is kept in place of
the error because the error is the more useful record.)*

**The situation is reachable, and it was costing real sessions.** F-2's learned grid means a coarse
stack enters the engine from her own behaviour: once she has performed 40 and 50 on a machine,
`observedLoads` is `[40, 50]` and `nextRung(40)` is genuinely **50** — no catalogue flag needed. A
10-session simulation on that grid gave a permanent **40↔50 oscillation**, and — worse — Loop 2 read
it as a stalled LIFT and **rotated her chest press away** (S-25.2). The exercise was never the
problem; the granularity of the stack was.

**Both conditions came from this situation's own wording — no constant was added.**
   1. *"a machine with 10 kg pins; **no micro-loading**"* → the rung she faces (F-2's learned grid)
      exceeds the equipment's finest step (B-6). `grid.isBigJump`. **False on a barbell**, which is
      why **S-22 is untouched** there ("All three sets hit 8. The row goes to 47.5" still holds).
   2. *"the load cannot move without breaking her"* / *"when her reps give a full rung's worth of
      headroom, the rung is taken"* → one test on her measured reps-per-rung (F-13):
      `reps − perRung ≥ Tlo`. **One measured fact, both ends of the problem**, exactly as written.

Then the load **holds at the anchor** — *"T is hers, so the engine may not quietly raise it"* — and
the engine **says so** (`explain.rungOutOfReach`, both locales): the one hold in this engine that is
narrated, because it is a decision she cleared every set for. Silent until her slope is fitted
(F-12), so no bootstrap ever triggers it. New `Loop2Decision: 'rung_out_of_reach'`; tests in
`v5_s28_big_jump.test.ts`, including the 10-session oscillation, which now settles with **zero**
rotations.

**Applied to Loop 1 as well as Loop 2.** The register places S-28 among the between-session
situations, but leaving the in-session raise (S-11) free to prescribe the unreachable rung would
simply re-open the oscillation through the other door — and *"one measured fact governs both ends of
the problem"*. A law that holds on one path and not its neighbour is how every defect in this audit
got in.

**One dependency this required:** `repsPerRung` scaled its slope by `nextRung(maxLoad) − maxLoad` —
the rung at the TOP of her grid — so on a `[40, 50]` grid it priced a 2.5 kg step, not the 10 kg one
in front of her. It now prices the rung at the load being judged.

**Post-Rev-7 audit fixes (2026-07-16)** — a hermetic code↔register review closed six gaps where the
build had drifted from this contract, each now WIRED + tested: (1) ~~**the approach set is LIGHT** —
`APPROACH_FRACTION`~~ **SUPERSEDED BY REVISION 8 the following day: the approach set and
`APPROACH_FRACTION` are deleted outright, and Loop 1 acts from set 1 on the real working load**; (2)
**Core honours the body map** — off → no core, emphasis → a second core movement (S-2/S-4/S-50); (3)
the dead **`chooseWinner`** (an unwired S-32 give-rule picker) is **deleted** — the give-rule is
realized structurally by per-muscle independent earning, and only the wired **donor** (S-37) has a
real contest point; (4) the façade's **reps-per-rung now respects the recency window** (F-8); (5)
**goal is no longer read** in the v5 path (one goal: hypertrophy); (6) the dead **`MEN_SPLITS` /
`WOMEN_SPLITS`** are deleted from `fixtureModel`. tsc + 781 tests + `expo export` green.

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
| **L2** | **A guess that is immediately tested is not theory. Theory is a guess that is never tested.** A day-one cold-start load (B-1) is allowed *only* because the very next set corrects it - Loop 1 reads what she actually performed and moves the iron inside the same 90 seconds (Rev 8: the approach set is gone; Loop 1 is the sole in-session safety). A number the engine must live with for weeks is forbidden. |
| **L3** | **Like for like.** A set is only comparable to a set taken under similar conditions. `restBeforeS` is therefore recorded on every set. Without it, every rep comparison is corrupt. |
| **L4** | **A missing fact is asked for once — never guessed, and never asked twice.** The answer becomes a durable declared fact. |
| **L5** | **Constants.** Forbidden when a constant stands in for a fact we could measure. Allowed *only* to define the shape of the product — and then declared out loud and counted (Part 6). |
| **L6** | **Ownership.** The **engine** owns: load, volume, exercise selection, workout structure. The **athlete** owns: the rep target (**T** — **per-muscle** since Rev 7, Part 9 §A), rest, the body map, and exercise selection. *(Rev 7: selection is expressed through the **in-workout swap**, LEARNED into a standing choice at K=2, S-69. **THERE IS NO PIN** — the programme-edit swap and the pin button are deleted (S-73), and the declarative pin with them. Its only surviving role is the **learned leave-it** (S-71): a lift the engine tried to rotate away and she swapped back to twice, at the same K=2, so the engine stops rotating it. Nothing is declared; everything is learned from her swaps.)* **A leave-it binds *which* exercise trains a muscle — never *whether* it is trained, and never how many minutes exist** (S-59). |
| **L7** | **No weekly boundary.** A decision is told at the moment it is born — the end of the set, or the end of the workout. Never on a schedule. |
| **L8** | **The engine obeys and states the cost.** It never argues, moralises, nags, or claims a reason it did not measure. |
| **L9** | **A question never stands between the athlete and her workout.** When the engine needs an answer it cannot derive, it assembles the best workout it can, **runs it**, and leaves the question open until she answers. Training is never blocked on a prompt. |
| **L10** | **The engine steps from a load it cannot be lied to about.** The anchor is the **median** of the sets that met `Tlo` — a single mis-keyed number cannot be the median of several. *(When only one set met `Tlo`, the median is that one set — there the rail (L11) is the guard on an established lift, and on a lift with no rail the athlete's own eyes are, S-49. The layers are named in S-22 and S-49.)* **How far** the load then moves is decided by **her own measured reps-per-rung**, never by a fixed step — **and the answer is then rounded to a whole rung, asymmetrically: a raise takes the floor, a drop takes the ceiling, always at least one** (`Math.max(1, down ? ceil : floor)`, `engine/v5/repsPerRung.rungsForHeadroom`). **Reading her slope and rounding the answer down is not the same thing as inventing a fixed step**, and this clause used to forbid what the engine deliberately does. *(Added Rev 14, 2026-08-19, after both alternatives were measured on the full accuracy board — see the note below.)* There is no clipping constant anywhere, because there is nothing left to clip. |
| **L11** | **The rail — the one hard stop.** The engine may **never** prescribe a load more than **one rung above the heaviest weight she completed at `Tlo` reps on that exercise.** The base is **`max(her settled record, THIS session's median anchor)`** — the settled record (sessions before the one being judged, inside the recency window F-8) **plus** the median of the loads she met `Tlo` at this session. *(Rev-7 correction, found when the per-workout cadence went live: a "settled history only" rail HALVED progression — she'd have to complete each load twice before advancing, contradicting S-22's one-rung-per-clear. Including the current session's **median** anchor fixes it while keeping the guarantee: the median absorbs a single mis-key, so a fat-finger still can't lift the rail, but a load she cleanly completed this session DOES count.)* Her own record is the ceiling; **a fat-fingered set cannot lift it** (the median, not the raw set, is the base). **The window (F-8) is a count of her most recent sessions of the lift, deliberately not a calendar** (Rev 12): the rail only ever CAPS a raise — it never sets a load — so an old record's ceiling cannot pin her under anything (the anchor and Loop 1 follow her down regardless), and detraining evidence says her old record + one rung remains a more protective ceiling than none. *(Replaces v4's implied-e1RM rail, which capped a demand with a **formula**; the rail is now a **fact**.)* **Inactive on a lift with no completed set inside the window — and since Rev 8 deleted the approach set, nothing replaces it there, deliberately: the guard is Loop 1 correcting from the very first set, plus the athlete's own eyes on a visible number (S-49). No ceiling is invented for that moment — that was F-10, and it was deleted as theory.** |

> **⛔ L10's ROUNDING CLAUSE — WHY IT WAS ADDED, AND WHY THE OBVIOUS FIX LOSES (Rev 14, 2026-08-19).**
>
> Read against the old wording, `Math.max(1, floor(headroom / perRung))` looks like the defect that
> explains the whole accuracy board. For the ordinary case — a 2-rep band, one to four reps of
> overshoot, a real slope near 2.3 reps per rung — **`floor` returns 0, the clamp makes it 1, so her
> fitted slope and B-5's un-fitted model give the SAME integer, and Loop 1 in week 10 emits exactly
> what it emitted in week 2.** That reading is correct, and it is why this note exists rather than a
> one-line amendment.
>
> **⚠️ AND RELEASING IT LOSES. Both arms were run on the full board (`thePrescriptionIsAccurate`):**
>
> | Rounding on the up path | in band | under | over | mean miss |
> |---|---|---|---|---|
> | **`floor` (today)** | **58.3%** | **17.5** | **24.2** | **0.87** |
> | `round` | 58.6% | 17.8 | 23.6 | 0.89 |
> | `ceil` on both (symmetric) | 58.9% | 20.0 | 21.1 | 0.93 |
>
> In-band buys 0.3–0.6 points and **the misses get BIGGER in both arms.** The symmetric arm pays for
> it in the wrong currency: `under` **+2.5 points** — sets she cannot finish — to buy `over` −3.1,
> sets that were merely easy. **Those two are not worth the same to an athlete**, and
> `theProgrammeSurvivesTheMonths` grades one of them and not the other.
>
> **So the floor is a DECISION, not an accident: a coach who is unsure errs light.** A rung down is
> taken in full the moment she falls short (`ceil`); a rung up has to be earned outright (`floor`) —
> guessing a raise too small costs one under-stimulating set, guessing a DROP too small leaves her
> under a weight that already beat her for the rest of an exercise she has two corrections to escape
> (S-13). **The law's target was never rounding: it was the invented fixed step (`T+4`, `LOAD_STEP_CAP`,
> `step()`'s `max(2.5, 2.5%)`) that moved iron without measuring her.** Reading her slope and then
> rounding the answer conservatively is a different thing, and L10 now says so instead of banning it.

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
| ~~Time budget per workout~~ — **NOT A DECLARED FACT ANY MORE (Rev 14, superseded by F-15)** | *This row read: "Rev 7: NOT asked — defaults to a 60-min ceiling, edited in Settings."* **The second half was never true and the first half is now the whole truth.** No Settings control was ever built and onboarding stopped asking on 2026-08-05, so every athlete carried the same 60 — a variable nobody could set. **F-15 declares the session's length instead: `SESSION_MIN` = 45, `SESSION_MAX` = 60, one figure for everyone**, and `profile.workoutMinutes` is deleted. What she declares about her week is her **days**, not her minutes. |
| **T — the rep band, PER MUSCLE** (Rev 7, Part 9 §A) | Default **8-10** for every muscle; **NOT asked in onboarding** — edited per-muscle in the body map. Each exercise reads its **primary muscle's** band. **The band she has IS the target** (see below). |
| **The body map** — every muscle is `off` / `normal` / `emphasis` | Onboarding, permanently editable *(also holds the per-muscle T above)* |
| Exercise selection — **learned** from repeated in-workout swaps (Rev 7, S-69); a stall-resisting swap-back earns a "leave it" (S-71) | In the workout *(the programme-edit screen is deleted, S-73)* |

*(The **goal** question is deleted. There is one goal: hypertrophy. **Experience** is deleted too — Rev 7, Part 9 §A. Its original reason was that the approach set measured her; Rev 8 deleted the approach set, and the deletion still stands on the stronger ground it always had: **a self-report is not a fact the engine measured (L1), so it may never touch a load.** Loop 1 measures her instead, from set 1.)*

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
Fatigue · readiness · recovery · inferred RPE/RIR · **e1RM as a JUDGEMENT about her capacity** ·
demographic assumptions (sex → split) · calendar-driven anything · cardio (S-46).

> **⛔ THIS LINE USED TO READ "e1RM as a **decision** input (display only)", AND THE ENGINE HAS NOT
> OBEYED IT SINCE B-1 WAS WRITTEN (corrected Rev 14, 2026-08-19).** Epley is arithmetic inside two
> **declared bootstraps**, both of them in this ledger: **B-1** converts a proven same-pattern e1RM
> into a working load at her `Tlo` to price a cross-exercise transfer (`fixtureModel.smartSeed`), and
> **B-5** — revised 2026-08-16 on the founder's *"if a trainee performed 20 reps or 12 we raise them
> the same"* — prices one rep of headroom by reading `loadMath.epley` / `loadForReps` **both ways**
> (`repsPerRung.bootstrapPerRung`), which is the whole reason a 20-rep set no longer moves the load
> the same distance as a 12-rep one. **B-1b** takes the same model one level up, as a ratio of her own
> data. A ban the engine breaks in three declared places is not a ban; it is a stale sentence.
>
> **What IS banned, and what v4 actually did, is the thing the line was written against:** the
> **implied-e1RM rail** (`RAIL_HEADROOM`) and `classifyTrend` / `progressMetric` — a **formula**
> standing in for a fact about how strong she is, capping a demand or calling a week UP or DOWN.
> L11 replaced that with a **fact** (the heaviest load she actually completed at `Tlo`). So: **e1RM
> may do arithmetic inside a bootstrap the next set tests (L2); it may never be the engine's opinion
> of her capacity, and nothing standing is ever decided by it.** Display use (Progress) is unchanged.

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

> **Where the correction now SURFACES (2026-07-24, presentation only — no engine mechanic changed).**
> Loop 1 still computes the correction exactly as above and publishes it on `SessionView.correction`.
> As of the v7 reconciliation, `completeSet` ALSO returns the same `LiveCorrection` on its
> `CompleteResult`, so the phone can reveal it **synchronously, on the "Set logged" beat itself**
> (the correction moment: old load struck through, the eased/raised load rising in moss, with the
> reps that earned it named — R7, nothing invented). The between-sets **rest card** then carries only
> the eased/raised load in moss under an "Eased/Raised for you" pill — the one number the up-next law
> licenses between sets, because a corrected load is *news, not a reminder*. This is a split of the
> SAME fact across two beats; the decision, the cap, the rail, and the learned-grid snap are all
> untouched. (The last set of a session never corrects — it has no next set — so the beat reveal
> never fires there and the session-end path is unaffected.)

### Loop 2 — The Exercise (end of every occurrence)
Decides the load for the **next occurrence of this exercise** — not next Saturday.
State is keyed to the **exercise**, never to a slot.

### Loop 3 — The Muscle (end of every occurrence of that muscle)
A volume DECISION is taken **at every occurrence of the muscle**, the moment that workout ends — never
on a schedule (L7). What it moves is **one target per MUSCLE**, not one per day.

> **This paragraph used to say "each day is its own volume track: this Monday's chest work is adjusted
> from last Monday's." It was struck (2026-07-21) because it contradicts the founder-ratified note
> under S-34, which is the later and binding half:** the fold is **exercise-keyed and day-agnostic by
> design**, because a historical session's `programDayId` may point at a regenerated programme, so
> "which day was this" is not a fact the engine can trust. Per-day tracks also HALVED a two-day
> muscle in practice. **The muscle is the unit** — it is the unit everywhere else in this document —
> the decision is per occurrence, and the target it moves is that muscle's whole footprint,
> distributed back across its exercises at assembly.

The target is bounded by **her time budget** (S-64) — the only ceiling volume needs, because a muscle
can never accrue more sets than fit across the days it is trained on.
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
   > **How it is built (verified + hardened, Rev 12 §8).** `orderForFlow` groups a day by equipment
   > CLASS — every barbell lift contiguous, every machine lift contiguous — so each physical machine
   > is visited exactly once (each lift appears once). Free weights are clustered too: costless, and
   > a barbell IS a claimed station (a rack, a bench); the dumbbell rack being always available just
   > makes its clustering free. Two lifts that genuinely share ONE machine (catalog `station` — the
   > leg press and its calf raise) are pulled back to back, or compounds-first would send her leg
   > press → leg extension → BACK to the leg press. And an edit made AFTER assembly (a leave-it can
   > sit on different equipment than the slot it replaces) re-runs the flow ordering, so the law
   > survives substitution. Pinned by `flows/stationFlow.test.ts` at all three layers.
4. **Compound before isolation** — within a station.

   > **⛔ SETTLED — #3 AND #4 ARE STRUCK. THE SHIPPED ORDERING IS THE LAW.** *(Rev 14, 2026-08-19)*
   >
   > **#3 and #4 above describe an ordering the code deliberately refuses, and it refuses it by
   > quoting the founder.** The audit that found this recorded both sides and declined to choose,
   > on the grounds that both were ratified and neither was obviously stale. **Then the dates were
   > read, and they settle it outright:**
   >
   > **Rev 12 §8 is 2026-07-21. The founder's objection is 2026-08-08 — eighteen days later, and
   > made after he had seen what the grouping actually produced in a build.** That is the whole
   > argument. This document ratified the rule on request, the engine shipped it, he looked at a
   > week it built and said in as many words that it was not what he wanted — naming BOTH halves,
   > the equipment blocks and the isolation-before-compound they cost. A clause ratified before the
   > result was visible does not outrank the ruling made after it.
   >
   > ⚠️ And the grouping did not even buy what it was written for, which is the part that removes
   > the last reason to hesitate: `e.equipment` has five values, so "one station, fully" cut a day
   > into three or four huge blocks — and a leg press, a chest press, a lat pulldown and a leg curl
   > are all `machine` and stand in four corners of the room. It traded the training order for a
   > walk it did not save.
   >
   > **Both sides stay recorded below, because the reasoning is worth keeping.** What changes is that
   > #3's class grouping and #4's "within a station" are no longer the law: the physical-`station`
   > pairing survives as a tie-break, compounds lead globally, and that is what the engine does.
   >
   > **THE REGISTER'S SIDE (Rev 12 §8, 2026-07-21, "verified on request").** The founder asked whether
   > a day really exhausts a piece of equipment before moving on; `orderForFlow` grouped a day by
   > equipment CLASS — every barbell lift contiguous, every machine lift contiguous — the class
   > grouping was held to have passed, two seams were hardened, and it was pinned by a test at three
   > layers. #4 follows from it: compound before isolation **within a station**, which is what makes
   > the grouping affordable.
   >
   > **THE CODE'S SIDE (founder, 2026-08-08, in `fixtureModel.orderForFlow`):** *"מה שהמנוע עשה זה
   > פשוט ליצור כמעט את כל האימון עם אותו הציוד וזה ברור שזה לא מה שרציתי. גם לא רציתי מבודד לפני
   > מורכב."* Two objections, and the file's own argument for each: **`e.equipment` has FIVE values**,
   > so "one station, fully, before moving on" meant "every barbell lift together, then every machine
   > lift together" — a day cut into three or four huge blocks that reads as a session done on one
   > thing. **And it does not even save the walk it was written for:** a leg press, a chest press, a
   > lat pulldown and a leg curl are all `machine` and stand in four corners of the room. It also
   > **bought that with the training order** — the old note admitted the price in as many words (*"a
   > station's isolation can precede another station's compound; grouping equipment is worth it"*),
   > which is the second half of what he said he did not want.
   >
   > **WHAT THE CODE DOES INSTEAD, in his order:** (1) selection is not touched, this only orders;
   > (2) **COMPOUNDS BEFORE ISOLATIONS, globally and without exception** — never traded for a shorter
   > walk, which also delivers "a compound before an isolation on the same equipment" for free, since
   > every compound is already ahead of every isolation; (3) **inside** each of those two phases, save
   > the walk — chain to a lift on the **same physical station** first (catalogue `station`: the leg
   > press and its calf raise), then to one in the same equipment family, then to whatever catalogue
   > order offers next. **Equipment family is a tie-break there, never a grouping key.** Deterministic:
   > every preference falls back to the incoming order, which is catalogue order.
   >
   > **So #3's "minimising station changes is an assembly objective" and #4's "within a station" are
   > both REVERSED in the shipped engine** — the physical-station pairing survives, the class grouping
   > does not, and the priority between the two is inverted. **That reversal is now the rule**, on the
   > dates above. #3 and #4 as written at the head of this list are the superseded text, kept for the
   > record in this document's usual way; the three rules the engine obeys are the numbered list
   > immediately above.
5. **Deterministic exercise choice** from her pool: minus swapped-away (S-69), plus her learned
   leave-its (S-71). **A leave-it is cut LAST** (S-59).

**Session structure is an output, not an input.** Mark Glutes + Quads on a 3-day programme and you
get two lower-body days — because the volume has to go somewhere. She is never asked to pick a split.

> **⛔ SETTLED — THE BOOTSTRAP STAYS, AND IT IS RENAMED FOR WHAT IT DOES.** *(Rev 14, 2026-08-19)*
>
> **The measurement decides the behaviour and the measurement is below: closing the inconsistency
> costs 3.3 points of in-band accuracy. It stays.** What was wrong was never the number — it was
> calling it a rest estimate. Priced with the day-one rest, the repair pass leaves room in every
> session; that is not a mis-timing, it is a **volume governor**, and it is the only thing in
> assembly holding the week below what the clock would technically allow.
>
> ⚠️ **AND THAT IS WHERE THE REAL WORK IS, WHEN SOMEONE WANTS IT.** Conservatism arrived here as a
> side effect of using the wrong rest number. The honest shape is an explicit conservatism parameter
> on `repairWeek`, tuned against this same board — a coach who leaves room in a session does it on
> purpose, not because he mis-measured the rest. Until that exists, the bootstrap is the knob, and
> the code says so at the call site rather than apologising for itself.
>
> **The record of the inconsistency follows, unchanged**, because the reasoning is what makes the
> decision reviewable:
>
> **The finished week is read back and mended** (`domain/weekRepair`, against `domain/weekQuality` —
> see the B-2 sub-table in Part 6 for what it mends and what it bought). **It is the only pass in
> assembly that judges a day with the DAY-ONE rest.**
>
> **The inconsistency is real and is exactly the shape this register keeps calling a defect.** Every
> other pass prices a day with her **measured** rest and set duration (S-17 / B-4), and so does the
> `overBudget` / `shortOfBudget` verdict stamped two lines later — while the repair pass, **which
> MUTATES the programme she is given**, prices it with the 150-second compound rest every athlete
> starts on. An athlete who rests 90 seconds had days priced ten minutes long and "repaired" — sets
> moved off a session the engine had already fitted inside her hour — while the verdict beside it,
> reading her real rest, said it fit. **Two accountings, one week**, and the one that edits the week
> is not the one that reports it.
>
> **⚠️ AND CLOSING IT WAS MEASURED, AND THE ENGINE GOT WORSE.** `thePrescriptionIsAccurate` — the
> ratchet that grades the forecast against a simulated athlete — moved **all three** of its numbers
> the wrong way:
>
> | | bootstrap rest (today) | her measured rest |
> |---|---|---|
> | in band | **58.31%** | 55.03% |
> | mean miss | **0.871** reps | 0.946 reps |
> | first-set in band | **40.38%** | 37.53% |
>
> **The mechanism is not mysterious:** priced with her real 90-second rest, more work fits, so the
> repair pass moves fewer sets off — her days come out **fuller**, and a fuller day is one the rep
> forecast misses more often. **Closing a real inconsistency costs 3.3 points of the accuracy the
> whole product rests on.**
>
> **So the principle loses to the measurement, and says why.** An internal inconsistency is worth
> closing right up until the moment closing it makes the athlete's prescription worse; here it does,
> by three points, on the one number the whole brief reduces to. *(The instrumented line is marked at
> the `repairWeek` call in `fixtureModel` with the same figures.)*

> **Rev 7 — assembly is WIRED, and the one number it owns.** `assembleV5DayLists` (built + tested)
> turns the map into the week's day-lists (a region per day + its exercises); the existing generator
> then builds each day, so ordering / station-clustering / the time cap are shared verbatim.
> `generateProgram` runs this for the v5 cohort (a declared band); the split survives for legacy only.
> The register fixes the CONSTRAINTS above; the day-one **density** — how a muscle's starting
> weekly-set target becomes an exercise COUNT — is the integration layer's, declared as a bootstrap:
> **`DAY_ONE_EX_DIVISOR = 5`** — `exerciseCountFor(sets) = max(1, round(sets / 5))`. Loop 3 refines
> volume from there. A hole-guard means no workout is ever empty even on a very sparse map (a repeat
> is legal, S-29).
>
> > **⛔ THE WORKED EXAMPLE HERE WAS DEAD ARITHMETIC, AND IS REPLACED (Rev 14, 2026-08-19).** It read
> > *"a normal muscle → 2 exercises, an emphasised one → 3, min 1"*. **The divisor is right; the
> > figures are not** — they were derived from the FLAT B-2 (`STARTING_WEEKLY_SETS.base` = 10, the
> > same ten sets for every muscle at every frequency) that **`startingWeeklySets` replaced on
> > 2026-08-08**. Volume now scales with the days she trains and with the muscle's share of the week
> > (see the **B-2 sub-table** in Part 6), so there is no single "normal muscle" figure to quote any
> > more — which is the point of the change.
> >
> > **The formula, and one worked number.** A muscle's target is
> > `round( (WEEKLY_SETS_PER_DAY × days × FULL_BODY_MUSCLE_COUNT) × share(muscle) ÷ Σ share(trainable) )`,
> > bounded by `WEEKLY_SETS_FLOOR` and `WEEKLY_SETS_CEILING`, and the exercise count is that ÷ 5.
> > **Back, four days, a full map:** the pot is `5 × 4 × 9` = 180; Back's share is 1.5 against 9.6
> > across the nine trainable muscles; `180 × 1.5 ÷ 9.6` = 28.125 → **28 weekly sets → round(28/5) =
> > 6 lifts.** Chest on the same map comes out at 24 → 5, Calves at 11 → 2. **That spread IS the
> > B-2 share table working**, and the old *"2 exercises"* would now be wrong for every muscle on the
> > map. `enforceTimeCap` still has the last word on what fits her session.
>
> **Wiring (2026-07-16, C1):** the assembler now honours the standing-replacement map `prefs.substitutes`
> (`offeredFor` — a learned adoption S-69, or a manual edit-swap) — but only a **same-muscle** substitute,
> so a corrupt entry can never move a lift into the wrong muscle's day. This is what makes a swap
> *persist across regeneration*; before it, a v5 edit-swap was silently lost on the next rebuild.

---

## Part 4 — THE SITUATION REGISTER

### A · First contact

**S-1 · Brand-new athlete, zero history.** Every lift opens at its **cold-start working load** (B-1),
from set 1 — there is no approach set (Rev 8) and **no calibration mode**. The first set she performs
is the measurement, and Loop 1 acts on it before the second set.

**S-2 · A muscle is turned `off`.** It never appears. The engine obeys silently and states the cost
once, without moralising (L8): *"Legs are off. Your week is four upper-body workouts — more time for
back and chest."*

**S-3 · So much is off that no workout can be assembled.** The engine says so plainly and invents
nothing: *"There isn't enough left to build a workout. Turn something back on."* It never silently
re-adds a muscle.

**S-4 · The 2 emphasis marks.** First claim on every earned set and every tie-break, plus a floor of
one exercise (S-63). **The budget is 2 marks** (F-4) — emphasis is zero-sum because minutes are.

> **⛔ TWO IS THE CEILING, NOT THE OPERATIVE BUDGET — AND THE TWO REFUSALS THAT NARROW IT WERE
> NOWHERE IN THIS DOCUMENT (written in Rev 14, 2026-08-19; both built in `engine/v5/bodyMap` and
> measured before they were built).** F-4 is unchanged; these say **when a second mark can be
> honoured at all.**
>
> **1 · THE FREQUENCY RULE — at or below `FULL_BODY_UNTIL_DAYS` (3) she gets ONE mark, not two.**
> `emphasisBudgetFor(days)` returns **1** there. Below the split every session trains the whole body,
> so two leads always compete for the same sessions and neither can be separated out.
> *Founder, 2026-08-12: "אני מנסה לשים 2 שרירים על EMPHASIS וזה נותן לי רק על אחד משום מה."* **He was
> on three days, and it was not a bug — the defect was that the SCREEN promised two.** The standing
> line read *"I lead with two muscles — 0 of 2 chosen"* on a week that can honour exactly one, so the
> rule looked like a fault and the refusal looked like a glitch. **A budget the copy and the guard
> disagree about is a budget the athlete has to discover by being refused.** One function answers
> both surfaces and the engine, so they cannot drift.
>
> **2 · THE REGION RULE — two marks may never share a region** (`emphasisRefusal` → `same_region`).
> Measured across every legal pair — 8 pairs × 5 frequencies × both sexes: at 4, 5 and 6 days, marks
> on **different** regions were honoured **perfectly (36 marks, ZERO lowered)**; marks on the **same**
> region lowered 3. Two ratified laws collide there and only there: **S-4 / S-63** say a mark earns
> more exercises for the muscle it sits on, and **S-64** says the session is 45–60 minutes, so a
> region holds `days × 7` lifts (`MAX_LIFTS_PER_DAY`) and no more. One mark fits inside that; two
> competing for the same sessions do not, and the surplus was deleted by `enforceTimeCap` on the way
> to the screen — **unevenly, so a mark could end up LOWERING the muscle it was placed on** (Chest
> 15 → 10 weekly sets; Glutes 21 → 15). **Ten fixes were written across five layers** — selection,
> dealing, trimming, the catalogue, and volume — and each bought two same-region marks by breaking
> single marks everywhere else (the record is pinned in `theWeekIsBalanced`).
>
> **⚠️ SO IT IS A COACHING CONSTRAINT SAID OUT LOUD, NOT A WORKAROUND.** She can lead with one thing
> per half of her body, and a coach would tell her that in words rather than take the tap and quietly
> hand back less — which is L8 exactly. Over all 810 configurations the rule leaves **one** failure (a
> single mark at three days, off by one set — a remainder of the transfer's five-set block) and makes
> the other twenty-five unreachable. **⚠️ AND IT NEVER TAKES A MARK SHE ALREADY HAS:** it refuses only
> a NEW one, so a map drawn before the rule existed keeps every stance she chose (`validateMap`
> reports; it does not rewrite).

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

**S-8 · Never performed.** → The **cold-start seed** (B-1), prescribed as a real working load from
set 1 and corrected by Loop 1 off that set. Cost: one set. Not three weeks.

**S-9 · Performed before — in any programme.**
**Her own history is the starting point, never a transfer formula.** T is not stored on a set and
does not need to be: her history is `(load, reps)` pairs, so the load at which she performed **≥
`Tlo`** is computed, never looked up (this is what makes S-43 free).

**Two facts of different ages, handled differently — the distinction the F-8 window turns on:**
   - **What she LIFTED is a raw fact and does not expire.** A weight she completed is a weight she
     completed; it seeds the prescription however long ago it was.
   - **A fact that has aged out of the recency window (F-8) still seeds the prescription** — and
     since Rev 8 there is no approach set to re-measure her first. What catches a stale seed is
     **Loop 1, from set 1**: if she has weakened, that set falls below `Tlo` and the load is eased
     before the second (S-38). The seed is a suggestion she can see and edit (F-2), never a demand.
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

> **"One correction" and the rail are not in tension — three regimes, each already right (Rev 12).**
> (1) A corrupted-LOW prescription on a lift with a real record: the rail sits one rung above that
> record, far above the corruption, so the measured multi-rung raise recovers her in one correction —
> the promise holds exactly where it was made. (2) A lift whose ONLY completions are at the low load:
> her history does not prove the "corruption", so one rung above her proven best per raise is the
> honest pace, not a bug. (3) No completed set at `Tlo` at all: the rail is inactive (L11) and the
> full measured jump is allowed — pinned by the law tests. Nothing to fix; stated so nobody "fixes" it.

**S-12 · A set lands below `Tlo`** (the bottom of her band). → **Drop for the next set**, by the same
measure, so the remaining sets can meet the contract. The engine does not ask why. *(Expect this to
be visible: with 4–5 sets, mid-exercise drops will be common. That is correct — it is what a coach
says: "take five off, finish the set.")*

**S-13 · Cap.** At most **2 corrections per exercise per session**; never after the last set.
Each correction is itself a hypothesis, and the very next set tests it (L2).

> **Declared, Rev 14: the number is `MAX_CORRECTIONS` = 2, and it lives at `engine/v5/loop1.ts:15` —
> NOT in `engine/v5/constants.ts`.** That matters for L5's enforcement, not just for tidiness:
> `__tests__/laws/everyConstantIsDeclared.test.ts` reads the ledger tables against **the engine's
> declared constants**, so a number sitting outside that file is outside the sweep that would notice
> it drifting. It is a form constant by every test in L5 — it shapes the loop, it sets no load — and
> it is named here so the ledger is honest about where it is. **B-5's row already depends on it in
> writing** (*"one rung heavy after a 1-rep set leaves her under a weight she cannot move, with
> `MAX_CORRECTIONS` = 2 to escape it"*), and so does B-9's whole argument (two corrections cannot walk
> back thirty percent). A cap two clauses reason FROM is not an implementation detail.

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
> **Rev 13 — two kinds of rest, split by a fact the log already carries.** The rest before **set 1**
> of a lift is the walk to the next station, the setup, the plate change; the rest before **sets
> 2..N** is recovery. They are different lengths, so learning one median for both handed her a timer
> she never takes. `setIndex` already knows which is which: the **INTER** median is learned **per
> lift** from `setIndex > 0` samples only, and the **TRANSITION** median is learned **pooled across
> lifts** from `setIndex === 0` — the walk is a fact about her gym and her pace, not about the lift
> she is walking to. One home for the whole doctrine (`domain/restPrescription`), one answer for the
> phone, the watch mirror and the standalone plan, and **the time budget (S-64) prices the same
> seconds these timers run.**

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
   A lift she has earned a **leave-it** on is never rotated (S-30/S-71). A **calendar** never
   rotates anything.

**S-27 · Bounds.** 3 – 5 sets per exercise (F-1).

**S-28 · The next rung is a big jump** (a machine with 10 kg pins; no micro-loading).
The load cannot move without breaking her — and **T is hers, so the engine may not quietly raise it.**
So it says the truth and offers the only honest axis left:
*"This machine jumps 10 kg — too big a step for you right now. We'll add reps here until it's within
reach."*
**And "within reach" is the same measured number as S-11:** when her reps at the current load give
her a full rung's worth of headroom, the rung is taken. **One measured fact governs both ends of the
problem** — which is how you know it earns its place.

> **Rev 12 — the release condition is RATIFIED as built (`reps − perRung ≥ Tlo`), and the narration
> now teaches the F-2 escape hatch.** The learned grid knows only the rungs she has performed, so a
> stack she has used at 40 and 50 reads as a 10 kg machine even when 45 exists. The engine may not
> prescribe a weight it cannot know exists — so it says F-2 to her instead: *"If the machine offers
> a smaller jump, load it and I'll learn the step."* One performed set at 45 makes 45 a real rung
> forever, and the hold releases itself.

**S-29 · The same exercise in two workouts in one week.** **One progression, fed by both sessions** —
automatic under exercise-keying. The `canonicalEngineId` unification hack is deleted.

**S-30 · A leave-it.** *(**There is no pin.** Rev 7 / S-73 deleted the button, and the declared pin
with it. This situation is now entirely S-71: a leave-it is EARNED, at K=2, by swapping back twice to
a lift the engine rotated away. Nothing here is ever declared.)* A lift with a leave-it is never
rotated, never engine-swapped. Leave-it **and** stalled → the engine obeys and says so: it still
offers the back-off and re-climb (S-25), but **it will not take the lift away.**

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

   > **Implementation (2026-07-16 audit).** This give-rule has **no single contest point** in the built
   > engine: each muscle's volume grows on its OWN track, one set at a time, capped by its own weekly
   > time budget (Loop 3) — there is never a moment where two muscles bid for one shared set, so the
   > emphasis-first / fewest-first / canonical tie-break is expressed *structurally* (the emphasis bonus
   > B-2 + independent earning), not by a picker. A `chooseWinner` function that WAS written for it sat
   > **unwired** and was **deleted** as a dead branch (exactly the Part-7 risk). The **donor** side
   > (S-37) DOES have a contest point — trimming an over-budget day — and IS wired (`chooseDonor`).

**Where the set physically goes** — and this is derived, not chosen: an exercise holds at most 5 sets
(F-1). When a muscle's earned sets exceed what its current exercises can hold, **the next set opens a
new exercise** for that muscle (from her pool: minus swapped-away, plus her leave-its). **Emphasis is what
usually gets a muscle its second exercise** — which is exactly what she asked for when she marked it.

**Emphasis is a priority, not a free lunch (S-63): a muscle that did not progress earns nothing, mark
or no mark.**

**S-32b · She completed everything — but nothing advanced.** → **Hold the volume.**
Volume grows only when she **both** completed **and** progressed. Adding sets to a stalled muscle
assumes more volume breaks a stall — **that is a theory** (L1). The stall belongs to Loop 2, and
Loop 2 is already on it.

**S-33 · She left sets unfinished.** → **Hold.**

**S-34 · Unfinished twice in a row.** → **−1 set.**

> **Implementation scope — completion is judged over the lifts she TRAINED, not the day's blueprint
> (founder-ratified, 2026-07-16, third audit).** The fold (`advanceV5`) is exercise-keyed and
> **day-agnostic by design** (L7 deleted slot/day coupling): it infers "which lifts trained this
> muscle" from the sets she actually logged, never from a per-day slot list — a historical session's
> `programDayId` may reference a regenerated (stale) programme, and a muscle trained on two days would
> be falsely marked "unfinished" every single day if judged against its whole-week exercise set. The
> **honest consequence:** a lift she skips *entirely* on a multi-exercise day is invisible to the
> completion check, so another lift on that day completing + advancing can still grow the muscle. This
> is **not a hole to close** — reintroducing "day membership" to fix it would re-couple the engine to
> the calendar L7 removed, and risks the worse multi-day false-negative. It is **bounded and
> self-correcting**: the time budget (S-64, `trimV5ToBudget` / `enforceTimeCap`) caps any over-growth
> at her minutes, and a disliked lift is a *swap* (S-69), not a chronic skip. Closed as a deliberate
> trade-off of the fact-only, exercise-keyed fold.

**S-35 · Cutting hits the floor (3 sets).** → **Never shave below 3. Drop an exercise instead.**
3 sets × 4 exercises beats 2 sets × 5.

**Which exercise goes:** the **last isolation lift** in assembly order. **A compound is never
sacrificed before an isolation** — the day's main lift keeps its full scheme. *(This is the existing
`enforceTimeCap` law, and it is right; it is preserved verbatim.)* A lift with a **leave-it** is
dropped **last of all** (S-59).

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

**She is caught by exactly the same thing as any other lift: the very first set.** Her last number
stands — a weight she completed is a fact whatever its age (S-9) — and any real weakening drops that
first set below `Tlo`, where **Loop 1 eases it in one correction, before the second set.** Since Rev 8
there is no approach set and no separate absence rule: there is one mechanism, and it is the one that
runs on every set of every workout.

> **⛔ THE PARAGRAPH ABOVE IS SUPERSEDED BY B-9 (founder's list, 2026-08-16; recorded here Rev 14,
> 2026-08-19). It is kept because it is the reasoning B-9 had to answer, and because its second half
> is still true.**
>
> **What was struck: "No easing, no ×0.90, no deload, no 'welcome back' adjustment. The absence
> machinery is deleted."** The ledger ratified an easing four months later, and the engine built it —
> `DETRAIN_RETAINED_PER_MONTH` = **0.9** a month, floored at `DETRAIN_FLOOR` = **0.7**
> (`engine/v5/detraining`, applied by `v5Engine.applyDetrainingV5`, called from `fixtureModel`). The
> document asserted both rules at once, which is exactly the state Rev 10 was written to end.
>
> **B-9's reason, and why it beats this clause on its own terms.** The clause rests on one claim —
> *"Loop 1 eases it in one correction"* — and that claim was **measured false at this magnitude**. An
> athlete given eight ordinary weeks and then a gap: away 90 days, the incline barbell press asked
> **30 kg → 0 reps**, the machine row 32.5 kg → **0 reps**; away 180 days, the dumbbell curl 9 kg →
> **3 reps**. Four lifts out of four, on the comeback session — the one session in her whole history
> where the app most has to be right. **S-13 gives Loop 1 two corrections and they move by RUNGS from
> where they start; they cannot walk back thirty percent inside one session.** The mechanism named
> above is real and it is simply not big enough for this case.
>
> **And it is not the theory this clause banned.** Detraining is the one thing about her the engine
> genuinely cannot measure — there is no data during a gap, by definition — so Part 6 has exactly one
> category for it: a **BOOTSTRAP**, *"theory-laden by nature and acceptable ONLY because a fact of
> hers replaces them fast (L2)"*. This is the **fastest-replaced bootstrap in the ledger: her very
> first set back overwrites it.** Ten percent a month is the **safe end** of the evidence, not its
> midpoint, because the errors are not symmetric — too light costs one under-loaded session that
> Loop 1 raises from inside; too heavy costs her the comeback.
>
> **THE TRIGGER IS `COMEBACK_DAYS` = 10** (`domain/comeback`) — declared in Part 6 under B-9 as of
> Rev 14, having been wired but undeclared. Below ten days there is **no decay at all**
> (`retainedAfterGap` returns 1): an ordinary week off is not detraining, and *"a product that greets
> you after four days is a product that watches you."* The decay is measured from the tenth day, not
> from the last session, so the grace window is not silently charged for.
>
> **The second half of this situation SURVIVES INTACT, and B-9 depends on it.** The easing is one
> move; **what settles the comeback is still her first set**, read by Loop 1 exactly as on any other
> day. There is still no deload construct, no re-entry week, and no `injury_flag` — S-39 is unchanged.
>
> **What she is told (corrected 2026-08-19).** The Welcome Back screen's header and copy said *"your
> weights stand where you left them … the numbers did not move while you were gone"* — written before
> B-9 and false the moment it shipped, **on the very screen whose detection drives the decay**. The
> card itself was always honest (it draws her CURRENT loads, so it has been showing the eased numbers
> all along); only the sentence over it promised otherwise, and it has been rewritten. What the screen
> guarantees is unchanged and is what it now says: being away is not punished here, and the bar
> decides the rest. *(The register's own share of that defect is this note: the document asserted
> S-38 and B-9 together, and the screen picked the half that was no longer true.)*

**S-39 · Her numbers come down across the board.** **The engine follows them down, and back up.**
There is **no deload construct** (`injury_flag`, `DELOAD_LOAD`, `DELOAD_SETS` — all deleted). A
deload is a *prediction* device. **A measured descent IS the deload.**

**S-40 · She changes days per week.** The programme re-assembles. **Nothing resets** — history is
keyed to the exercise, not the slot. *(In v4 this silently cold-starts every slot.)*

**S-41 · She changes bodyweight.** It is **not a prescribed load**. It feeds the cold-start seed (B-1)
and tonnage / Progress. **Loaded lifts are untouched** — their prescriptions are facts.

**S-42 · She changes height.** **Nothing.** Height touches no engine decision. It exists for display.
Any other use would be a guess.

**S-43 · She changes T.** **Free.** Her history is `(load, reps)` pairs, so the load at which she has
performed ≥ the new T is **computed** (S-9). If she has never worked at that T on this lift, the
current load stands and **Loop 1 finds it from her first set at the new band.** **No conversion
formula, ever.**

**S-44 · She edits the body map.** Re-assemble. A muscle switched back on keeps **all** its
exercises' history — it **resumes**, it does not restart. **Its leave-its resume with it** (S-66).

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
is move one rung. **On a lift with no active rail** (brand-new or aged-out — and since
Rev 8 there is no approach set standing in front of it either), there is no invented ceiling to lean
on — and we do not add one (the deleted
F-10 was theory). Instead the guard is the athlete herself: **the mis-key becomes a visible
prescription she corrects, or the next set exposes it** (she cannot lift the impossible; S-16 holds
the load on the resulting zero). **The lie never survives the next set** — which is the same
fact-first discipline as everywhere else, not a special mechanism.

---

### H · The lifts with no load axis

**S-50 · Core / abs.** Under `muscle = the engine's unit`, **Core is a muscle on the map like any
other** — it can be turned off, can carry an emphasis mark. Weighted core progresses on load;
unweighted on reps (S-51). *(Implementation, 2026-07-16 audit: Core's on/off and emphasis are honoured
— `addWeeklyCore` reads the map, so **off → no core** (S-2) and **emphasis → a second core movement**
(S-4). Per the founder's standing rule Core stays a **supplemental finisher** placed last, not a
structural region day, so its volume is map-sized rather than run through Loop 3's region assembly —
a deliberate, founder-ratified scoping of "earns and loses volume by the same rule," not the drift the
audit found where the map was ignored entirely.)*

**S-51 · A bodyweight lift.** No load axis → **reps carry the progression**, climbing through her
band toward `Thi`. *(A loaded lift converts reps at `Thi` into a load step and resets; a bodyweight
lift has no rung, so reaching `Thi` on every set means the movement itself is now too easy — S-52.)*

**S-52 · A bodyweight lift is too easy — OR stalled — so it must get harder.** → **Graduate to the
harder catalogue variation** (knee push-up → push-up → dip; chin-up → pull-up); or, where a load can
be added (a belt), it becomes a loaded lift (S-53). Its history carries; the new lift enters at
S-8/S-9. **A lift with a leave-it never graduates** (S-30/S-71).

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

> **WIRED AS WRITTEN (Rev 12, 2026-07-21).** The map editor obeys an OFF **in silence** (an earlier
> build put a confirm sheet in front of the toggle — a mechanism found nowhere in this document, and
> one that argued with a choice she was making right now; removed). The weekly mirror asks via
> `engine/v5/bodyMap.askBackMuscle` — off + a logged set + never asked, first in the canonical order
> (F-9), ONE question at a time — and either answer retires that muscle's question forever
> (`prefs.askedBackMuscles`, L4). "Bring it back" is one tap; the muscle resumes with all its
> exercises' history (S-44).

**S-57 · The map after onboarding.** Permanent and editable — where she turns a muscle back on (S-44)
or off (S-56). *(A live per-muscle volume dashboard on the map was considered and **dropped** —
founder, 2026-07-15. The engine narrates in words, at the moment a decision happens; it does not need
a second, parallel display of the same facts.)*

**S-58 · Migration.** **There is none.** The TestFlight cohort are testers; the founder's ruling is to
**recreate cleanly rather than blend two engines' state**. `db.engineV4` is **dropped**, not
converted. Session history is untouched and remains the substrate (S-9) — but `restBeforeS` is absent
on every historical set, so those sets are **excluded from the reps-per-rung rest filter** (F-11) and
never read as zero (L3).

**S-76 · The Complete-screen calorie estimate is a declared constant, not an engine fact (v7 2.5, 2026-07-25).**
The 2.5 close (IMG_8260) shows **EST. CALORIES** beside DURATION. The founder's source-of-truth rule for
that screen is that *every input must be an already-measured fact* — so the estimate and its one constant
are declared here, like any other engine number, even though **the engine neither computes nor stores it**.

> **kcal = round(MET × bodyweightKg × hours)**, where `MET = STRENGTH_MET = 4.5` (the compendium band for a
> multi-exercise resistance session *including* its rest — moderate 3.5 … vigorous 6.0), `bodyweightKg` is the
> athlete's declared `Profile.weightKg` (a measured fact, never guessed), and `hours = durationMs / 3_600_000`
> where `durationMs` is the session's own wall-clock span (start → last logged set), carried on the summary.
> Implemented in `domain/energy.ts` (`strengthSessionKcal`), used by both the Complete screen and the read-only
> record (`WorkoutDetail`). **Honesty gate (the cardio precedent `cardioMath.kcalForKm`): no bodyweight ⇒ NO
> number.** Hush never invents a body to bill calories against — the stat simply does not render.
>
> This touches **no loop, no write path, no stored field**: it is arithmetic over two facts that already exist
> at render time. It is registered only so the constant `4.5` has a home and its provenance is auditable — not
> because the engine owns it (it does not).

---

### J · The collisions (from the reviews, 2026-07-15)

**S-59 · Her leave-its do not fit inside her declared minutes.**
A leave-it binds **which** exercise, not **whether** it appears (L6). The budget still cuts — but
**a lift with a leave-it is cut last**, in assembly order, deterministically.

> **The QUESTION this situation used to ask is deleted (2026-07-21).** It read: *"You've pinned six
> lifts. Four fit in 45 minutes. Which two come out — or shall we find more time?"* — and it was
> written for the **declarative pin, which no longer exists** (S-73). A leave-it is not declared; it
> is **earned**, one lift at a time, by the engine attempting a rotation and her swapping back twice
> (S-71, K=2). "Six pinned lifts" is not a state she can put the engine into, so the collision the
> question resolved cannot arise. **There is no collision between two of her declarations, because
> there is only one declaration left: the body map.** If leave-its ever did exceed the budget, the
> ordinary rule already answers it — they are cut last, and if that still does not fit, it is S-3 and
> the engine says so. No prompt, and by L9 nothing waits on one.

**S-60 · The approach set. — ⛔ REMOVED ENTIRELY (Revision 8, 2026-07-16, founder ruling). See the
Revision 8 note at the top of this document.** The engine no longer prescribes any approach / warm-up /
measurement set, in any condition. Every set is the working load from set 1; Loop 1 is the sole
in-session safety. The description below is retained for history only — it does NOT describe the shipped
engine. (The `SetLog.isApproach` fold-exclusion filters survive to keep legacy Build-#33 logged approach
sets out of the fold; nothing writes the mark any more.)**

*(Historical description follows — superseded by Revision 8.)*

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

> **WIRED (2026-07-16 audit).** The light load is `APPROACH_FRACTION` (a declared piece of B-1) of the
> working/seed load, snapped to a real loadable weight on the equipment increment grid (going lighter
> than her lightest *observed* rung is the whole point, so the sparse observed grid is bypassed for
> this one down-step; null — the working load stands — when nothing lighter physically exists, e.g. an
> empty bar). Only **set 1** uses it; the working sets stay at her real number, guarded by Loop 1. And
> **Loop 1 does NOT correct off the approach set** — its light load would otherwise drag the working
> sets down toward it; "excluded from every rep comparison" now includes the in-session correction.
> Before the audit the approach set was prescribed at her FULL last-working load and merely labelled —
> exactly the "she finds out under a loaded bar" this situation exists to prevent.

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
**This is NOT the same thing as S-59, and the difference matters.**
A **leave-it is a quantity** — *"this exercise must be here."* No room → it is cut last, and if
nothing else can go, S-3.
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

**S-66 · The muscle of a lift she earned a leave-it on is switched off, then back on.** **The
leave-it resumes.** Nothing revoked it, and S-44 says the muscle resumes rather than restarts — the
leave-it is part of what resumes. **And she sees it**: the lift is back in her programme, and the
engine still does not rotate it.

**S-67 · An assisted machine (a load model with an inverted sign).**
~~**There are none in the catalogue today, and until there are, this is a guard against adding one
blindly**~~ **⛔ THE PREMISE IS STALE — THERE ARE TWO, AND THE SITUATION IS RESOLVED (Rev 14,
2026-08-19; added to the catalogue 2026-08-02).** Founder: *"these are common exercises — so if an
athlete wants to do them, they just don't exist? that isn't serious."* `assisted_dip` and
`assisted_pull_up` are in `data/exercises` today.

> **AND THEY ARE RESOLVED BY THE ONE ROUTE THIS CLAUSE DID NOT CONSIDER: GIVING THEM NO LOAD AXIS.**
> Both are filed `bodyweight: true, equipment: 'machine'`, with **no `baseKg` and no `bwScaled`** — so
> `startingWeight` returns **null** for every athlete and there is no number for the engine to reason
> about. **The inverted-sign problem cannot arise, because nothing here ever prescribes the pin.** The
> coach says in words how much help to take (*"Set the assist you need today"*), which is the honest
> answer anyway: the assist she needs is not a fact the engine has measured. They are also marked
> `regression: true`, so a busy loaded lift is never *answered* with one — offering the assist machine
> to someone whose bench is taken reads as the app losing confidence in her. It is reachable the day
> she asks for it, and never before.
>
> **The tripwire this situation demanded is built, and it is stronger than the one it asked for.**
> `__tests__/laws/noLoadRunsBackwards.test.ts` names both lifts by id and asserts, for each, that all
> four places a load could appear are empty (`bodyweight` true, `baseKg` undefined, `bwScaled`
> undefined, cold start **null**) — so the day someone gives an assist machine a load, the build fails
> before the sign-flip is missing rather than after. *(The same file holds the neighbouring case for
> the same reason: a Smith carriage is **not** a barbell — `barbell` means "20 kg plus what you put on
> it", and filing a counterbalanced carriage there would add a fabricated 20 kg to every set she is
> shown, in every gym, for ever. It is a plate-loaded machine: the plates are stated, nothing else is
> claimed.)*
>
> **The sign-flip design below is NOT built and does not need to be — it is kept as the answer for the
> day a machine arrives that must carry a real number.** On an assisted pull-up / dip
> machine the number on the pin is **counterweight**: more number = more help = *easier*. Every rule
> here — S-11/S-12, the anchor (L10), the rail (L11) — assumes *more load = harder, fewer reps*.
> Unflipped, Loop 1 would answer a strong set by **adding assistance**, the rail would cap her at her
> **weakest**, `observedLoads` would read a rising ladder as progress, and the milestone ladders would
> celebrate it. So a machine that must carry a real number has to be flagged `assisted` in the
> catalogue, and the engine **flips the sign for that lift only**: "harder / progress" = a **lower**
> number, "easier / back off" = a higher one; the rail caps the *lowest* assistance she has completed
> at `Tlo`, not the highest load. **Until that exists, an assist machine carries no load at all** —
> which is what the two in the catalogue do, and what the law above enforces — so the build fails
> before the inverted rule is missing rather than after. *(This is the same discipline as S-54's
> warm-up tripwire: never let a new input reach progression through the back door.)*

---

### K · ⚠️ THE UNWRITTEN SUBSYSTEM — pain and ease *(flagged Rev 14, 2026-08-19; NOT specified here)*

**Grep this document for "pain", "twinge" or "sharp" and you get zero hits — and yet a pain report
BANS LIFTS AND SHAPES HER WEEK.** That is stated here as a defect in the register, exactly as Part 7
requires: *"If a situation is not here, the engine has no answer for it — and that is a bug in this
document, not in the code."* This section deliberately **invents no clauses**. It records what
exists, where it lives, and that it is unwritten.

**What is built** (`domain/painReport`, founder-approved 2026-08-11 — *"הטבלה נראית טובה, תבנה
לפיה"*), in outline only: **three severities** in her own words (`twinge` / `pain` / `sharp` — three,
because three is what a person can answer honestly while standing at a rack); **rest windows** per
severity; and **pattern tables** naming the movements a reported muscle forbids — because a muscle is
the label she can point at and the *movement* is what the joint feels, so a hurt shoulder that only
switched `Shoulders` off would still be loaded by tomorrow's chest press. Its own design claim is
that it adds no new mechanism: the muscle goes `off` the way the body map has always allowed, except
that this one expires and lifts itself (stored **beside** the map, never inside it — her map is
hers), and the lift is swapped through the same pool every other swap uses, with the new lift's load
being whatever the engine already prescribes for it.

**Why it belongs in this register and is not in it.** A ban that removes a lift from her pool is a
decision about what she trains; a window that expires is a decision with a clock in it (and L7 has
opinions about clocks). Neither is derivable from anything written above. **Until it is written, the
authority is the module, not this file** — which is the exact inversion of Rev 10's founder
instruction (*"this document is the only source of truth"*). **Writing it is the founder's ruling to
make, not an audit's**, and it is left open rather than guessed at.

**⚠️ AND IT HAS ALREADY REACHED TWO DOORS THE ENGINE THOUGHT WERE CLOSED — both found and fixed
2026-08-19, both recorded here because they are engine facts now:**

1. **`addWeeklyCore` now takes the muscle's forbidden patterns, so a Core twinge no longer has
   sit-ups dealt back to her.** Every other muscle's pool is filtered by `forbiddenFor` inside
   `pickExercises`; **Core is supplemental and is dealt on its own path, which never asked.** A Core
   twinge bans `crunch` and `rotation` and — correctly — does *not* rest the muscle, so Core stayed
   switched on and the pool went on dealing her sit-ups and Russian twists. **The report was stored,
   honoured everywhere else, and never reached her week.** *(A `pain` or `sharp` report never reached
   the function either; that one was safe only by accident, through `coreStance === 'off'`.)* **The
   ban is walked PAST, not counted against her:** a banned entry must not consume one of the core
   lifts she is owed, or a twinge would quietly halve her core work on top of taking the movement
   away. *(And the injury audit knew: `theProgrammeUnderAnInjury` skipped Core with the note
   "supplemental — its own path (addWeeklyCore), tested there", and no such test existed. It does now.)*
2. **`resolveChain` stops at a banned pattern, so a learned swap can no longer carry her onto a
   movement she just reported.** The ban filters the **pool**; a standing substitute is applied
   **after** that, to a lift which already passed — and since every hop is same-muscle by design while
   a muscle's forbidden patterns are a property of the muscle, the walk was **the one path into the
   pool the ban did not cover**: a chest twinge bans `fly`, and an adopted `bench → cable_fly` is
   same-muscle and passed. **The report is the newer fact and it wins — a learned swap is a
   preference, an ease is a thing her body did.** It **stops** rather than refusing outright, because
   the anchor is still hers and the chain resumes the day the window lapses. *(This sits alongside the
   walk's existing guards: same-muscle at every hop, and a cycle guard.)*

**Both are the same lesson this register has learned five times now** (Rev 9's own conclusion): *a
law that holds on one path and not its neighbour is how every defect in this engine's audit got in.*

---

## Part 5 — What is deleted

v4 is not tuned. It is replaced.

**Whole subsystems:** `CALIBRATING` · the absence path (`ABSENCE_DAYS`, ×0.90) · the deload path
(`injury_flag`, `DELOAD_LOAD`, `DELOAD_SETS`) · the adherence gate (`ADHERENCE_MIN` — dead code
today) · the stall lever ladder (`vol`/`load`/`range`, `RANGE_ALTERNATE`, `PATIENT_PROBE_EVERY`) ·
the weekly rollover (`bucketOpenMs`, `firstBucketOpen`, `displayWeekNumber`, `lastAdvanceWeekOpen`) ·
the **3-week calendar rotation** · `MEN_SPLITS` / `WOMEN_SPLITS` (**fully deleted from `fixtureModel`
2026-07-16** — v4/legacy is gone, so nothing reads them; the programme is only ever assembled from the
body map) · the goal fork (**`goal` is no longer read in the v5 path — 2026-07-16**) · **(Rev 7) the programme-edit SCREEN + the pin/swap
BUTTONS (S-73) · the declared edit-swap (S-31) · the `experience` input · the onboarding rep-band and
minutes questions (defaults instead — Part 9 §A).**

**Metrics:** `classifyTrend` · `progressMetric` · `TREND_BAND` · **e1RM as a JUDGEMENT about her
capacity** · the implied-e1RM rail (`RAIL_HEADROOM`).

> **⛔ THIS ENTRY USED TO READ "e1RM as a decision input (Epley survives for the Progress screen
> only)" — AMENDED REV 14 (2026-08-19), because the parenthetical is false and has been twice over.**
> **B-1** prices its cross-exercise transfer with Epley (`smartSeed`: a proven same-pattern e1RM →
> a working load at her `Tlo`, scaled by the `baseKg` ratio), and **B-5**, revised 2026-08-16, prices
> one rep of headroom by reading `loadMath.epley` / `loadForReps` **both ways** — the change that
> stopped a 20-rep set and a 12-rep set raising the load by the same amount. **B-1b** reads it once
> more, as a ratio of her own demonstrated loads to what B-1 predicted for them.
>
> **What is deleted is what was always the point:** a **formula** standing in for a fact about her
> capacity — the rail that capped a demand with an equation (L11 replaced it with the heaviest load
> she has actually completed at `Tlo`) and the trend metrics that graded her week from one. **Epley
> as arithmetic inside a declared bootstrap that the very next set tests (L2) is not that**, and each
> such use is named in Part 6 rather than left implicit. See Part 1's banned-inputs note.

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
| **B-1** | The **cold-start** load on a never-performed lift. **The rule:** take her nearest evidence — the same-muscle lift she has performed, transferred by the catalogue's `baseKg` ratio; or, with no such lift, the catalogue cold-start from **her sex + bodyweight** (nothing else — no self-report, no age). **This bootstrap contains two catalogue/starter numbers — the `baseKg` table and the sex+bodyweight cold-start — and they are theory-laden by nature** (assumptions about relative strength). **Rev 8 changed what makes them acceptable, and the change is not cosmetic:** they used to be overwritten by the approach set in 90 seconds. **The approach set is gone, so a B-1 number now IS the load on the bar for set 1** — and what redeems it is **Loop 1**, which reads that set and corrects the load before the second one. It is still a guess that is immediately tested (L2), so it is still not theory; but it is now tested by a WORKING set rather than a measurement set, and the honest cost is that her first set of a brand-new lift can be wrong in either direction. That is the founder's ruling (Rev 8) and this row is where it is declared. *(The light fraction `APPROACH_FRACTION` is deleted with the approach set.)* **Rev 12: the sex+bodyweight numbers are now CALIBRATED against population data, not hand-set** — the female factors moved 0.62/0.72 → **0.52 (upper) / 0.66 (lower)**, matching both research meta-findings (women ≈52%/66% of male upper/lower strength) and the ~25M-lift community dataset's same-bodyweight ratios; the male seeds sit at ≈72–80% of the community "Beginner" e1RM for 8 reps and were verified, not moved. The asymmetry is deliberate: a light seed becomes Loop 1's visible "you did 14, so I added weight"; a heavy one fails her very first set. | Loop 1, from set 1 — then her own history (S-9) |
| **B-2** | Starting sets per muscle — **frequency-aware and size-aware since 2026-08-08/09.** It is no longer one number: eight constants stand behind it, and **they are declared in the B-2 sub-table below**, added Rev 14 because F-9's own standard demanded it. | Earned / cut volume (S-32/34) |
| **B-3** | Attempts-to-clear, before she has history on the lift. **= 1, ratified against practice (Rev 12):** with it, the first back-off lands on the SECOND consecutive failed occurrence — the standing double-progression rule ("still out of the range after the attempt → reduce and rebuild"). A first miss holds (S-24); her real record then personalises `N` upward. | Her own statistic (S-25) |
| **B-4** | **Work + rest seconds per set, on day one** — what assembly uses to know how many exercises fit in her hour | Her measured rest (built, Stage 0) and her set durations (timestamps) |
| **B-5** | **Reps-per-rung, before she has `F-12` like-for-like pairs.** Still not a *guessed* slope — but no longer a flat one either. **Revised 2026-08-16, on the founder's reading:** *"if a trainee performed 20 reps or 12 we raise them the same."* He was right, and it measured out on an 8-10 band at 10 kg — 12 reps and 20 reps both went to 11 kg, and 7, 3 and 1 rep all went to 9 kg. A flat rung is only cautious in ONE direction: one rung light after a 20-rep set is a wasted exercise, and one rung heavy after a 1-rep set leaves her under a weight she cannot move with `MAX_CORRECTIONS` = 2 to escape it. So the bootstrap is now **derived from the e1RM model the app already displays** (`loadMath.epley` / `loadForReps`, read both ways in `repsPerRung.bootstrapPerRung`) — no new number, and it scales itself per equipment because it is a proportion of her load. The flat rung survives only as the floor under a step the model cannot price at all. Rounding is **asymmetric**: a raise rounds down, a drop rounds up, because a raise guessed small costs one under-stimulating set and a drop guessed small costs her the exercise. Read within F-16. | Her own measured load↔rep slope (Loop 1) |
| **B-6** | **The starting equipment increment per class** (barbell/dumbbell/machine) — the smallest step assumed **before she has touched the equipment**, so day-one loads are loadable | The distinct loads she actually performs (`observedLoads`) — the real rungs replace the assumed step |
| **B-7** | ~~median gap before a lift's 2nd performance~~ — **RETIRED (Rev 6)** with the gap trigger it served (F-6). The approach set now fires on one condition only: no set in the recency window (S-60). | — |
| **B-8** | **The day-one exercise COUNT per muscle** (Rev 7) — `DAY_ONE_EX_DIVISOR = 5` (`engine/v5/programAssembly`): `exerciseCountFor(sets) = max(1, round(sets / 5))`. The integration layer's number: the register fixes the assembly constraints (Part 3), but not the sets→exercises granularity. **⛔ THIS ROW USED TO END "(a normal muscle → 2, an emphasised one → 3, min 1)" — struck Rev 14 (2026-08-19): the divisor is right, those figures are dead arithmetic.** They were read off the FLAT B-2 base of 10 sets a muscle, which `startingWeeklySets` replaced on 2026-08-08 — targets now scale with her days AND with the muscle's share of the week, so no single figure describes "a normal muscle" any more. Worked, on a full map at four days: **Back 28 weekly sets → 6 lifts**, Chest 24 → 5, Calves 11 → 2. See the note under Part 3 and the **B-2 sub-table** below. | Loop 3's earned / cut volume (S-32/34), within weeks |
| **B-9** | **What she kept while she was away** (`DETRAIN_RETAINED_PER_MONTH` = 0.9, `DETRAIN_FLOOR` = 0.7, `engine/v5/detraining`). **Measured before it was chosen:** an athlete given eight ordinary weeks and then a gap was prescribed loads she could not move once — away 90 days, the incline barbell press asked 30 kg and she gets **0 reps**; the machine row 32.5 kg, **0 reps**; away 180 days the dumbbell curl 9 kg, **3 reps**. Four lifts of four, on the first session of a comeback. **Loop 1 cannot rescue it** — S-13 gives it two corrections and they move by RUNGS from where they start, which cannot walk back thirty percent inside one session; F-8's seed exemption (*"what catches a stale seed is Loop 1, from set 1"*) is reasonable and measurably false at this magnitude. Detraining is **the one thing about her the engine cannot measure** — there is no data during a gap, by definition — so it is a bootstrap, and the fastest-replaced one in this table: **her very first set back overwrites it.** Ten percent a month floored at seventy is the **safe end** of the evidence rather than its midpoint, because the errors are not symmetric — too light costs one under-loaded session that Loop 1 raises from inside, too heavy costs the comeback. **It is a DECISION, not a filter:** `applyDetrainingV5` writes `ExerciseState.load` and logs the change, so S-9/S-29/S-43 (the façade reports what the engine decided) and `everyScreenShowsTheEngineNumber` stay true rather than bypassed — two earlier attempts filtered on read and were correctly reverted by exactly those laws. **The trigger is `COMEBACK_DAYS` = 10** (`domain/comeback` — declared Rev 14; it was wired and undeclared): below ten days `retainedAfterGap` returns **1** and nothing moves, and the months are counted **from the tenth day**, so the grace window is never charged for. Snapped onto her learned grid (F-2) at the **NEAREST** rung, never above the load she came in on; bodyweight is untouched, having no load axis. **⛔ THIS ROW SAID "snapped DOWN", AND THE CODE IS RIGHT, NOT THE ROW (corrected Rev 14; `v5Engine.decayRung`).** Always-down is the correct rule for NORMALISING a load she performed — it may never imply she lifted more than she did — but a decay is a decision the engine is **making**, and a review measured what always-down did to it: an eleven-day break asks 0.35% off a 60 kg bench (a 59.79 kg ideal) and `snapDown` turned that into **55** on a {50, 55, 60} grid — a five-kilo cut for a week and a half away. Nearest keeps the guarantee that matters (the result can never exceed the load she came in on) while letting a decay smaller than half a rung round to **no change at all**, which is the honest answer. It also supersedes S-38 in whole — see the amendment note there. | Her first set back — Loop 1, from set 1 |
| **B-10** | **The first guess errs one rung light** (`SEED_RUNGS_LIGHT`, B-1c, 2026-09-10 — measured on `thePrescriptionIsAccurate`). B-1 models the load she makes Tlo on FRESH, so every later set of a first occurrence lands under the floor and the second occurrence opens heavy — 66.8% of second-occurrence sets were under the band. One rung lighter opens set 1 a rep or two over the floor and the last set on it, and Loop 2 climbs from evidence: second occurrence 38.1% → 47.6% in band, cold start 60% in band. Never below the bar (F-19 / S-55). The milestone ladders keep the MODELLED number (`modelledStartingWeight`) — a club is a multiple of what the model thought of her, not of the careful first bar. | yes — it **lowers** every cold seed by one rung |
| **B-1b** | **How far off the model she actually is, in one number** (`personalScale`, `MIN_SCALE_LIFTS` = 3, `PERSONAL_SCALE_FLOOR` = 0.5, `domain/startingLoad`). **Measured before it was written** — three athletes, ten weeks, the first set of every lift never performed: an athlete the model fits got 85.0% in band, another 57.7%, and an athlete WEAKER than modelled got **0.0% in band, 100% too heavy, missing her band by 6.4 reps**. Across all three, **"over" was ZERO**: B-1 is never too light and routinely too heavy, the exact reverse of what B-1's own row says it is for. **This adds no number about bodies.** It is the ratio between what B-1 PREDICTED for the lifts she has done and what she DEMONSTRATED on them — entirely her own data, the same move S-9 makes with a single load taken one level up; the MEDIAN across her lifts, for F-13's reason, one sample per lift so a favourite cannot vote twice. **Clamped at 1 and floored at 0.5:** it may only make a seed LIGHTER, because the two errors are not symmetric (light is Loop 1's visible "you did 14, so I added weight"; heavy fails the first set of a lift she has never met) and because measurement says the light failure does not occur. Gated at three distinct lifts (the F-12 family); below it the model stands alone. **Paired with the seed itself no longer being frozen:** state was created for EVERY lift in the programme on the first call from an empty history, so a lift she met on Thursday carried a load decided before she had lifted anything — `ensureExercisesV5` now re-reads the seed of a lift she has neither performed nor been decided about. Together: the accuracy board moved **55.77% → 58.31% in band, 1.02 → 0.87 mean miss**, and the convergence defect (`thePrescriptionIsAccurate`) closed. | Her first set on the lift — Loop 1, from set 1 |

> **B-4 was hiding in plain sight.** It lives in the code **today** as `COMPOUND_SET_MIN` /
> `ISOLATION_SET_MIN` — two numbers that decide how many exercises an athlete gets, that nobody ever
> declared. The second review found it. **It is exactly the door F-2 nearly slipped through.**
>
> **AND ITS THREE NUMBERS ARE NOW WRITTEN DOWN (Rev 14, 2026-08-19), because "it lives in the code
> today" is not a declaration.** They also moved home since this note was written — it says
> `fixtureModel`, and Rev 13 gave the whole rest doctrine **one** home:
>
> | Constant | Value | Where |
> |---|---|---|
> | `COMPOUND_SET_MIN` | **3** minutes — a compound set's day-one all-in cost | `domain/restPrescription` |
> | `ISOLATION_SET_MIN` | **2** minutes — an isolation set's | `domain/restPrescription` |
> | `SET_EXEC_SECONDS` | **{ compound: 45, isolation: 30 }** — the WORK half alone | `domain/restPrescription` |
>
> Both halves are replaced by facts of hers the moment she has them: her **measured rest** (S-17,
> split INTER / TRANSITION by Rev 13) and her **set durations** (`learnedExecS` —
> `(persistedAt[i] − persistedAt[i−1]) − restBeforeS[i]`, same-exercise same-session pairs, and only
> when the rest is KNOWN, or an unknown rest would silently become "work" and break L3).

### ⊕ B-2's sub-table — the eight constants that shape the week's volume *(declared Rev 14, 2026-08-19)*

**These were nowhere in this document, and each of them repeatedly allocates real volume.** The
standard is F-9's, in the register's own words: *"It repeatedly allocates real volume, so by our own
standard it is a form constant and is named here, not buried in an example."* By that standard their
absence was a hole in the ledger, not a detail of the integration layer. They are **one bootstrap** —
B-2's day-one shape — and Loop 3 overwrites all of it from her facts within weeks (S-32/S-34), and may
take a muscle past any of these numbers, *because that is measured and this is a guess.*

| Constant | Value | What it decides | Home |
|---|---|---|---|
| `WEEKLY_SETS_PER_DAY` | **5** | The week's pot is `5 × days × FULL_BODY_MUSCLE_COUNT`. **Frequency is what BUYS recoverable volume, so it is what sets it.** Before this, `base` was a flat 10 for every frequency, and the audit printed the cost plainly: male 4×, 5× and 6× all came out at ~156 minutes a week, and the 6× week ended on a two-lift, 18-minute session. Training more days bought nothing; it sliced the same pot thinner. The audit reads monotonic now — **120 / 174 / 240 / 294 / 360 minutes** a week at 2…6 days. | `engine/v5/constants` |
| `WEEKLY_SETS_FLOOR` | **6** | MEV — below this a muscle is *maintained*, not grown. Applied **after** the ceiling squeeze, so squeezing can never take a muscle under it. | `engine/v5/constants` |
| `WEEKLY_SETS_CEILING` | **30** | **⚠️ A SHAPE INPUT, NOT A PRESCRIPTION — never read as "she will do 30 sets."** Deliberately above the ~20 the evidence calls the point of diminishing returns, because the day-one target is what FILLS a day *before* `enforceTimeCap` trims it to her minutes: **the clock is the real allocator.** Realized: ~11 sets a muscle a week at four days, ~16 at six — inside the 12–20 the evidence calls optimal; ~5 at two days, which is honestly below the effective dose because two sessions cannot hold more. **⛔ And it bounds the week without flattening its SHAPE (founder 2026-08-11):** clamping each muscle separately made every muscle whose share carried it past 30 come out at *exactly* 30 (at 6 days: Back 42 → 30, Chest 37 → 30, six muscles landing together), erasing the share table for precisely the muscles it matters most for — and that, not the dealer, is why push:pull failed at five and six days and nowhere else. The clamp is applied to the **largest** muscle and everything squeezed with it, so the biggest target still lands exactly on the ceiling and the ratios survive. | `engine/v5/constants` |
| `FULL_BODY_MUSCLE_COUNT` | **9** | The muscles a full map trains (every group but Core, which is supplemental). **The pot is fixed at `WEEKLY_SETS_PER_DAY × days × 9` and divided by the shares that REMAIN**, so an `off` muscle never shortens her session — she asked not to train a muscle, not for a shorter workout. Turning off four leg muscles hands the whole week to the five upper ones. Before this, the sweep counted **335 sessions under 45 minutes**, nearly all on maps with something off. | `engine/v5/constants` |
| `FULL_BODY_UNTIL_DAYS` | **3** | At or below this, **every session trains the whole body**. Splitting upper from lower divides the week's sessions between the halves, so at two days each muscle is trained once a week and at three the entire lower body is. **Twice a week grows roughly 63% more than once at equal volume — the single best-supported number in the hypertrophy literature — and a split that costs it is a split not worth having yet.** Four days is where upper/lower first gives BOTH halves two sessions, so that is where the split begins. *(It is also the frequency rule under F-4: below the split, one emphasis mark, not two.)* | `engine/v5/constants` |
| `EMPHASIS_FRACTION` | **0.6** | **The mark's share of the base — a proportional claim, not a fixed number of sets.** It replaced a flat `emphasisBonus` of +6, which was +60% of the old flat base of 10 and quietly shrank to +40% at three days and +20% at six once the base scaled with frequency — so emphasis stopped shaping the week. `structure follows volume` caught it: two emphasised lower muscles at 3 days stopped pulling a second lower day, because 72 lower sets against 75 upper rounds to one day where 52 against 50 rounded to two. The mark must carry the same WEIGHT at every frequency. *(And under a fixed hour a mark MOVES volume, it does not add it — S-4/S-63.)* | `engine/v5/constants` |
| `MAX_LIFTS_PER_DAY` | **7** | The most lifts a day realistically holds — a 60-minute session at three to five sets a lift, **the same arithmetic `enforceTimeCap` prices.** It is read *before* the deal as well as during it, which is why it is one number and not two. It is also the S-64 half of F-4's region rule: a region holds `days × 7` lifts and no more. | `engine/v5/programAssembly` |
| `MUSCLE_VOLUME_SHARE` | *(table below)* | **A muscle's share of the week's pot.** These are SHARES of a fixed pot, not multipliers on a per-muscle number, so tuning them **moves** work without adding any. | `engine/v5/constants` |

**⛔ THE SHARE TABLE, AND WHY IT EXISTS (founder 2026-08-09):** *"אני רוצה גם שתסתכל על תוכניות
האימון עצמם ותגיד לי האם הן טובות ברמה בינלאומית."* Read as a coach would read it the answer was
**no**, and one number was the reason: **every muscle drew the same weekly target.** The printed male
4× week came out —

> Quads 15 · Calves 12 · Hamstrings 11 · Triceps 10 · Shoulders 10 · Biceps 9 · Chest 8 · Back 8

— and **no coach in the world signs a programme where the CALVES are trained harder than the BACK**,
or where the biceps (a small muscle already worked by every pull) gets more direct volume than the
largest muscle group in the body. The engine simply had no concept of muscle size.

| Back | Chest | Quads | Hamstrings | Shoulders | Glutes | Biceps | Triceps | Calves |
|---|---|---|---|---|---|---|---|---|
| **1.5** | **1.3** | **1.3** | **1.2** | **1.2** | **1.1** | **0.7** | **0.7** | **0.6** |

The ordering follows the standing evidence — roughly **12–16** weekly sets for the large groups and
**8–12** for the small ones — and the small ones sit at the bottom of their band **on purpose**,
because every number here counts **DIRECT sets only**: the biceps also work on every row and pulldown
and the triceps on every press, and none of that indirect work is counted anywhere. Back is the
largest group and the one the old flat target starved worst; Shoulders sit high because the lateral
and rear heads get nothing indirectly. *(Core is absent by design — it is supplemental, dealt outside
the pot by `addWeeklyCore`, S-50.)*

> **⚠️ AND THE TABLE ENCODES A RANK RULE THAT LIVED ONLY IN `constants.ts` AND IN A TEST UNTIL NOW:
> a muscle with a larger share never delivers less than one with a smaller share.** That is the
> guarantee the numbers are FOR — the ordering, not the arithmetic — and it is now register law.
> **`domain/weekRepair` mends finished weeks against it:** `domain/weekQuality` is the written
> definition of a good week, and the repair pass reads a week against it and makes small named moves,
> keeping a move **only when the whole board improves**. Over the 270 weeks the product can actually
> produce: *a muscle past the ceiling* **34 → 0**, *share inversions* **104 → 92** (82 of the 92
> cross-region), *weeks made worse* **0**, at ~1.3 ms a week.
>
> **Two thresholds in that check are materiality, not leniency, and both are stated so nobody reads
> them as slack:** an inversion is only counted where the two shares differ by **≥ 0.3** (so ordinary
> rounding between neighbours — Chest 1.3 against Hamstrings 1.2 — is not read as the table being
> thrown away) and by **≥ 2 sets** (F-1 prescribes a block at three to five sets, so ONE set is finer
> than any decision the engine can make: "Glutes 3, Triceps 4" is two muscles that each got one
> block). A **marked** muscle is excluded from both sides of the comparison, **by her stance** — not
> by a "delivered more than its target" proxy, which was wrong in both directions.
>
> **Why the repair pass exists at all, in its own words:** every pass before it decides with partial
> information and hands on — *the targets do not know what a lift costs, the dealer does not know what
> the clock will cut, and the cap prices ONE day at a time and cannot see the week.* Thirteen attempts
> to fix a defect inside one of those stages each broke something in another, and the diagnosis they
> produced was not "the pipeline is wrong" — it was that **nothing had ever looked at the finished
> week.**

### Form constants — they define the shape of the product; no measurement replaces them

| | Form constant | Moves iron? |
|---|---|---|
| **F-1** | 3 – 5 sets per exercise | volume only |
| **F-2** | **The equipment grid is a MOVEMENT, not a constant** — rungs are the loads that physically exist. Its starting increment is the bootstrap **B-6**; her performed loads (`observedLoads`) refine it into the real rungs. *(Rev 4: I had called it "a property of the equipment, not learned" — the review was right that this hid B-6.)* **A prescribed rung is a suggestion, never a requirement:** the engine has no venue fact, so if a rung from another gym's grid (the union of `observedLoads`) is not on the floor she is standing on today, **she loads the nearest weight that IS — and that performed load is the truth the loops read (S-14/15).** No venue tracking is needed, because the completed set always overrules the suggestion. **The one FIXED number the grid holds is `BAR_KG` = 20** (declared Rev 14; `engine/v5/constants`, beside B-6) — **the empty bar**, S-55's floor under every barbell load. It is a fact of the room, not a statistic, and it has exactly ONE home: it used to sit in `engine/loadMath`, which `engine/v5/grid` imported while `loadMath` imported the grid back — a cycle, and two chances for the seed and the live loops to hold a different bar. `loadMath` re-exports it. *(It is why `bb_curl` and `skullcrusher` — both barbell isolations — are floored at 20 rather than at their `baseKg`: the bar weighs 20 kg whatever the lift is doing.)* | it **is** the iron |
| **F-3** | ~~rest-lever noise guard~~ — **RETIRED (Rev 6)** with the rest lever (S-26). See the simplification note below. | — |
| **F-4** | The emphasis budget: **2 marks** (`EMPHASIS_BUDGET` = 2). **⚠️ TWO IS THE CEILING, NOT THE OPERATIVE BUDGET (Rev 14) — two refusals narrow it, and both were undeclared until now:** at or below `FULL_BODY_UNTIL_DAYS` (3) the budget is **1** (`emphasisBudgetFor` — every session is full-body there, so two leads always compete), and **two marks may never share a region** (`emphasisRefusal` → `same_region`). Both live in `engine/v5/bodyMap`, both refuse a mark she can otherwise place, and both are measured — see the note under **S-4** for the sweep, the founder's report, and why this is a coaching constraint rather than a workaround. It never revokes a mark she already has. | no |
| **F-5** | ~~HR rest margin + timer bounds~~ — **RETIRED (Rev 6)** with S-19. HR is display-only now; rest ends on the learned timer (S-17). | — |
| **F-6** | ~~gap factor for the approach set~~ — **RETIRED (Rev 6).** The recency window (F-8) alone decides when an approach set fires (S-60). | — |
| **F-7** | ~~bodyweight graduation rep ceiling~~ — **DELETED (Rev 5).** Graduation now triggers at **her own `Thi`** (S-52); the catalogue keeps only the ladder pointer, which is structure, not a number. The review found a fixed ceiling of 12 trapped an athlete who chose the 12-15 band. | — |
| **F-8** | The **recency window** — how far back a measured statistic reads: reps-per-rung, `N`, the rest median (S-17), **and the rail (L11)**. **It is a COUNT — the lift's most recent `RECENCY_WINDOW_SESSIONS` sessions — deliberately not a calendar window (Rev 12):** a count survives the rarely-trained lift (her twelve real occurrences ARE her recent history on it), while a days cutoff would only ever DEACTIVATE guards — and every statistic it scopes merely sizes or caps a move the very next set tests (L2), so a stale one has bounded cost. Old history outside it is not "her number today." **The one thing it does NOT scope is a raw completed load used to seed a prescription (S-9)** — a weight she lifted is a fact whatever its age; **Loop 1 from set 1**, not F-8, is what catches a stale seed (Rev 8 deleted the approach set that used to). *(2026-07-16 audit: the FAÇADE's reps-per-rung read now applies this window too — it previously flattened all-time history into one record and slipped the window; the pure core always honoured it.)* | it **scopes** every measured statistic (never a raw seed) |
| **F-9** | The **canonical muscle order** — the final tie-break for a contested set (S-32 #3, reversed in S-37). It repeatedly allocates real volume, so by our own standard it is a form constant and is named here, not buried in an example. | it **breaks ties** in volume |
| **F-10** | ~~physical sanity ceiling~~ — **DELETED (Rev 6).** It was a *predicted* human limit resting on the unaudited `baseKg` table — theory. A cold-start load is guarded by the athlete's own eyes and by Loop 1 on the next set instead (S-49). | — |
| **F-11** | The **rest-band width — 45 seconds** (`REST_BAND_WIDTH_S`, declared Rev 14): how close two sets' `restBeforeS` must be to count as "same conditions" for the reps-per-rung fit (L3), so a set done after a very different rest is not fitted against one that wasn't. A set whose rest is **unknown** is excluded outright, never read as zero. | no — it **filters** which sets compare |
| **F-12** | The **minimum like-for-like pairs — 4, at DISTINCT loads** (`MIN_PAIRS_FOR_SLOPE`, declared Rev 14) before B-5 (the modelled bootstrap, and the cautious single rung under it) gives way to her fitted reps-per-rung slope. | no — it **gates** bootstrap→data |
| **F-13** | The **reps-per-rung estimator: Theil–Sen** (the median of all pairwise slopes) — **one named algorithm**, not "a robust fit," so identical inputs yield an identical slope (I-24). Likewise `N`'s percentile is the **nearest-rank** method — one rule, stable on the small samples where it matters. | it **fixes** the estimator, not a value |
| **F-14** | **K = 2 — the learned-swap adoption threshold** (Rev 7, `ADOPT_THRESHOLD`): the number of CONSECUTIVE same-target in-workout swaps before a standing replacement is adopted (S-69), and the same K at which a twice-resisted engine rotation becomes a learned leave-it (S-71). An evidence gate (the F-12 / N family), deliberately small — the original is offered first ever after (S-70), so a wrong adoption is cheap to undo. | no — it **gates** when a swap becomes standing |

| **F-15** | **The session's length — 45 to 60 minutes, one figure for everyone** (`SESSION_MIN` / `SESSION_MAX`). The ceiling is the founder's 2026-06-23 rule that the prescribed work must fit an hour; the floor is his 2026-08-05 one — *"just make it at least 45 minutes, because less than that is too light."* **It replaces `profile.workoutMinutes`, which was a variable NOBODY COULD SET:** onboarding stopped asking on 2026-08-05 (*"the athlete cannot answer how long she wants to be in a gym before her first session"*) and no settings control was ever built, so every athlete carried the same 60 while the engine carried a whole dimension of state to support it — weaker guarantees (a family of bounds proved instead of one) and two reported "defects" at 45 minutes that no athlete could reach. What she sets is her days, her bodyweight and her body map. | it **bounds** every session |

| **F-16** | **Where the load–rep continuum ends, for reading headroom — 20 reps** (`EPLEY_VALID_REPS`). B-5 is no longer a flat rung: with no fitted slope, a move is priced from the e1RM model the app already displays (`loadMath.epley` / `loadForReps`), so a 20-rep set and a 12-rep set no longer raise the load by the same amount — the founder's 2026-08-16 reading. That model's RATIO between two rep counts holds across roughly 3–20 reps (a 20-rep set is ~60% of 1RM, a 10-rep set ~75%, and it lands on both); past twenty, reps stop pricing the load — the set is limited by endurance, not by the weight — so headroom is read at the edge and rep 21 and rep 60 are not treated as different facts. **It bounds a READING, never a load:** an implausible set is stopped by L11 (the rail), and where the rail is inactive by the athlete's own eyes (S-49). | no — it **bounds** how far a rep count is evidence |

| **F-17** | **The evidence gate under her learned REST — 3 samples** (`MIN_REST_SAMPLES`). S-17's median was the one measured statistic with NO gate: it returned a median of whatever it was given, down to a single sample, and that number runs a timer. One rest cut short — a phone call, a queue for the rack, a mis-tapped skip — would have become her standing prescription on that lift. **Three is derived, not picked:** a median is chosen over a mean precisely so one bad value cannot move it, and that property does not exist below three (at n=1 the outlier IS the median; at n=2 it is half of it). Cheap to clear — one occurrence of a three-set lift yields two inter-set rests. The F-12 family: an evidence gate, never a number that sets a load. | no — it **gates** when her rest replaces the bootstrap |

| **F-18** | **The evidence gate under a PER-SET shape — 6 samples** (`MIN_PER_SET_SAMPLES`, `engine/v5/perSetShape`). The shape has ONE degree of freedom — the fraction of her capacity a set costs — and every (occurrence, position) pair is one sample of it, so a four-set occurrence contributes three. **⚠️ BUILT, TESTED, AND DELIBERATELY NOT WIRED.** Five wirings were measured (56.1% → 53.1 / 40.9 / 38.2 / 47.1 / 44.7 in band) and a controlled run settled it: with Loop 1 switched off, the ramp does exactly what it was built to do — the set-1-to-set-4 skew flattens from 30.5/38.9/47.0/47.5 to 37.6/39.8/37.8/35.1 — **and the total does not move** (39.5% → 37.9%). Equalising the sets redistributes the misses rather than removing them, because each set's error is dominated by how wrong `base` is and by the rung quantum (±0.8 reps on a 2.5 kg rung at 60 kg, most of a two-rep band), not by its position. Loop 1 is worth 16.6 points because it corrects `base` from evidence; the ramp then fights it — two controllers on one load inside one session. **⛔ THIS ROW WAS CORRECTED TWICE ON 2026-08-16, AND THE SECOND CORRECTION IS THE ONE THAT HOLDS.** It first read *"the per-set spread is not the lever"*. An oracle over 1,969 real sets then appeared to overturn that — perfect knowledge with ONE load per lift tops out at **63.0%**, the same knowledge plus the TRUE fatigue ramp reaches **72.0%**, four free per-set loads **83.7%** (88.7% with the rungs removed, which is physics) — so the row was rewritten to call the ramp the largest prize left. **That oracle contains no Loop 1, and that is the error.** It compares one FIXED load per exercise against per-set loads, and this engine does not deliver a fixed load: measured on the same runs, **Loop 1 moves the load inside 57.6% of occurrences, by 2.25 kg on average.** The architecture is already per-set — reactive rather than predictive — and the live profile proves it, RISING after set 1 (40.4 / 65.8 / 65.6 / 68.1) where a fixed load against a fatiguing body can only fall. The ramp was therefore wired a sixth time and measured against the real engine: **58.3% flat → 53.2% with the true decay centred, 53.1% anchored, 50.5% and 46.5% at gentler slopes** — every arm losing on the LATE sets, exactly where Loop 1 has already acted. The remedy for set 1 was tested in Loop 2 too (price the raise from the FIRST set rather than `worstReps`): **58.3% → 54.6%, and set 1 itself 40.4% → 34.0%**, because a bigger raise more often leaves a set short of Tlo, `allMet` goes false, and the lift holds or backs off. **So the original sentence was right for the wrong reason, and is restored with the right one:** the per-set spread is real and is ALREADY being closed, by Loop 1, from evidence. What remains of it is set 1 — the one position no in-session corrector can reach, because it IS the evidence — and closing that is a better BASE (Loop 2, B-1b), not a shape. | no — it **gates** a shape that is not currently applied |
| **F-19** | **The lightest fixed bar — 10 kg** (`FIXED_BAR_KG`). `fixed_barbell` became its own equipment family on 2026-08-25 (founder gym finding #11): `bb_curl`, `reverse_curl` and `skullcrusher` are performed on pre-weighted fixed bars, not on the Olympic bar, and while they wore the `barbell` family they inherited its 20 kg floor — the edit wheel refused to go under 20 on a curl, and the seed handed a beginner woman an Olympic bar she would never curl. The same kind of room-fact as `BAR_KG` (S-55): commercial fixed-bar sets start at 10 kg and step in 2.5s, so the family carries `FIXED_BAR_KG` = 10 as its floor and B-6's 2.5 as its increment. Her performed grid (F-2) refines the ladder as ever; this is only what the room offers before she has touched it. | yes — it **floors** every fixed-bar load |
| **F-20** | **Loop 1's second witness — a 1-rep miss waits, a 2-rep miss acts** (`LOOP1_CONFIRM_MISS`). The founder's gym finding #3 (2026-08-25): set one landed ONE rep under the band, Loop 1 ordered a drop, he ignored it, and set two landed in the band — the correction was noise, not signal. A single set one rep outside the band is the smallest miss the instrument can register, and it is within the set-to-set wobble of an honest lift; correcting on it means renegotiating the bar between every pair of sets, which is exactly the authority the founder revoked (finding #6: the athlete logs, the engine adjusts between sessions). So Loop 1 now demands a SECOND WITNESS for the smallest miss: a 1-rep miss corrects only when the previous set of the same lift also finished outside the band on the same side; a miss of `LOOP1_CONFIRM_MISS` = 2 or more is evidence on its own and corrects immediately, because a set two reps short is a grinding set and waiting costs another one. Symmetric on the raise side. Safety is untouched — MAX_CORRECTIONS, the rail, the band floor and the last-set guard all stand. | no — it **gates** when a mid-session correction may move the load |
| **F-21** | **A raise needs TWO reps of headroom on the worst set** (`RAISE_HEADROOM_REPS`, S-22b, 2026-09-10 — measured). S-22 raised whenever every set met Tlo, including when the worst set landed EXACTLY on it; traced, that is the oscillation the accuracy board printed for a month — set 4 reaches 8 → raise → set 4 falls to 6–7 → hold → stall → back off → 8 → raise. A clear at the edge is the edge. **The SIZE of the margin was settled against her capacity, not against the in-band board**, because that board rises monotonically with the margin (63.5% at one rep, 75.6% at two, 82.5% at three) and cannot see the failure a big margin causes: a load parked under her capacity produces high reps, and high reps still land inside an 8–12 band. Scored instead on `load / true capacity` at the tenth week — a fresh set lands in band in [0.88, 1.0] — one rep leaves **17.5% of lifts prescribed ABOVE capacity**, two reps leaves 1.7%, and three reps freezes the lift (30 of 58 never rose; the weakest athlete went backward). Two is the arm that nearly deletes the error this engine calls dangerous and pays in the one it says it prefers (`rungsForHeadroom`: *"a coach who is unsure errs light"*). Half of all lifts finish a little light; a hold corrects that within one occurrence. | no — it **gates** when S-22 may move the load |

**Nine bootstraps and fifteen form constants active (B-7, F-3, F-5, F-6, F-7, F-10 retired) — every one declared. Thirteen guess-constants are gone.**
*(Rev 7 added the last two, both declared and neither a load-mover: **F-14** = K = 2 above, and
**B-8** = `DAY_ONE_EX_DIVISOR` = 5, the day-one exercise-count-per-muscle bootstrap, overwritten by
Loop 3's earned/cut volume within weeks. **No invented number still decides a LOAD.** Until the
Rev-12 traceability audit F-14 lived only in this paragraph, never as a row — and the count above it
still read "six and eight". L5 is no longer kept by hand: `__tests__/laws/everyConstantIsDeclared.test.ts`
reads these two tables and the engine's source as data and holds them to each other — every number
exported carries its tag, every live row has a home, and every retired row is gone from the code.)*

> **⚠️ REV 14 — THE COUNT ABOVE COUNTS ROWS, AND A ROW IS NOT ALWAYS ONE NUMBER.** No row was added
> or retired on 2026-08-19, so "nine bootstraps and thirteen form constants" still stands. What
> changed is that **three rows stopped hiding their arithmetic**: B-2 now carries a **sub-table of
> eight** constants that shape the week's volume, B-4 names its **three** seconds-per-set numbers, and
> B-9 names its **trigger**. They were not new — they were **undeclared**, which by F-9's own standard
> (*"it repeatedly allocates real volume, so by our own standard it is a form constant and is named
> here, not buried in an example"*) is the one thing this ledger exists to prevent. Six more are now
> named in the rows that own them: `REST_BAND_WIDTH_S` (F-11), `MIN_PAIRS_FOR_SLOPE` (F-12), `BAR_KG`
> (F-2), `COMEBACK_DAYS` (B-9), `MAX_CORRECTIONS` (S-13), and `MAX_LIFTS_PER_DAY` (B-2's sub-table).
>
> **⚠️ AND ONE HONEST LIMIT ON THE AUTOMATION, WHICH IS THE REASON THEY COULD HIDE.**
> `everyConstantIsDeclared` holds the ledger and the code together on four points, and **only the
> first one hunts for an undeclared number — it reads `engine/v5/constants.ts` and nothing else.** The
> other three run the other way (a cited tag must be a row; a live row must have a home; a retired row
> must be gone), so **a number declared in any other file is never asked whether it carries a tag.**
> That is precisely where today's finds were sitting: `MAX_CORRECTIONS` in `engine/v5/loop1.ts`,
> `MAX_LIFTS_PER_DAY` in `engine/v5/programAssembly.ts`, and B-4's three in
> `domain/restPrescription.ts`. **L5's completeness half is enforced over one file, not over the
> engine** — that is the standing gap, and it is written down here rather than left for the next audit
> to find the same way this one did.

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
> physically real (the grid). The two load-touching bootstraps — the cold-start load (B-1) and the
> starting equipment step (B-6) — **are overwritten by her own data inside the first sessions, and
> Loop 1 corrects B-1 from her very first set** (Rev 8: the approach set that used to do this in 90
> seconds is gone, and Loop 1 took the job — so B-1 is now a working load that is immediately tested,
> not a measurement that never reaches the bar. The claim is narrower than it was, and it is stated
> at B-1 rather than glossed here). What remains permanent are constants
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
> **Coverage is a count: every LIVE situation has a test, green — or we are not done.**
> *(The count itself is deliberately not written here any more. It was "71 situations, 71 tests", and
> it went stale the moment Rev 8 removed S-60 entirely and Rev 7 removed S-31 — a number that has to
> be re-derived on every revision is a maintenance trap, not a guarantee. **68 live situations**
> today: S-1…S-74, minus S-19, S-23, S-26, S-31, S-60, and minus the never-issued S-75+.)*
> *(S-23 absorbed into S-22 (Rev 3); S-19 and S-26 deleted as feature-creep (Rev 6); S-67 added
> (Rev 5) — leaving 64 of the S-1…S-67 numbering. **Rev 7 added S-68…S-74** — learned exercise
> selection (Part 9 §B) — for 71. Tests carry the tripwires (S-54 warm-ups, S-67 assisted, and the
> Rev 7 no-secondary-muscle-coupling tripwire) that fail the build if a new input reaches progression
> through the back door. **S-68…S-70 are now WIRED (2026-07-16):** the assembler honours
> `prefs.substitutes` (C1); `domain/swapLearning` extracts occurrences from a finished session
> (conservative — a clean single swap per muscle only) and folds them into `prefs.substitutes` +
> `swapPending`, in `finishSession`, v5 cohort only (C2/C3). **S-70 is wired (C4):** the swap menu
> (`swapCandidates`) offers the blueprint ORIGINAL first when the current lift is an adopted substitute
> (reverse-lookup of `substitutes`), so a wrong adoption is always cheap to reverse. **GRADUATION
> (S-52) is wired (task E, 2026-07-16):** `advanceV5` surfaces a wanted change per lift; `domain/
> engineChanges` resolves the target (graduate → the bodyweight `harder` pointer; the top of a ladder
> holds, S-53); `fixtureModel` writes it to `substitutes` (an ENGINE change, S-72 — straight to
> substitutes, never through the learned counter), and `pickExercises` follows a substitute CHAIN
> (bench → knee-push-up → push-up), same-muscle-guarded + cycle-guarded, so a graduated swap resolves.
> **ROTATION (S-25.3) is now wired too (2026-07-16):** the trigger is a REPEATED stall at the same wall
> — `isRepeatedStall` (loop2) detects a prior stall at the current prescribed load with a back-off
> (a lower-load occurrence) more recent than it, i.e. back-off-and-re-climb has persistently failed. A
> FIRST stall still backs off and re-climbs (S-25's order holds); a repeated one rotates to the
> same-muscle lift gone longest without (`engineChanges.rotationTarget`), enacted like graduation. The
> load backs off in both cases; when no rotation target exists the lift simply backs off (S-53).
> **S-71/S-72 NOW WIRED (2026-07-16, commit `2135839`).** An engine rotation is marked in a new pref
> `engineRotated` (anchor → rotated-to); if she swaps BACK to the rotated-away lift twice, the
> swap-learning fold clears the substitute and `swapLearning.learnedLeaveIts` commits a learned pin —
> the engine stops rotating it (`engineChanges.resolveEngineEnactments` drops a rotate/graduate on a
> pinned lift, S-30/S-71). S-72 holds by construction: the engine writes `substitutes` directly and
> never advances the athlete-swap counter, so only her own swap-backs earn a leave-it. (Graduation is
> deliberately NOT resistible — S-71 is scoped to rotation.) **S-73 IS ENACTED (2026-07-16, stage 6):**
> the programme-edit swap + pin buttons are deleted and `ProgramDetail` is now a read-only plan
> preview. *(This paragraph used to say S-73 was HELD until the learning was device-validated. The
> burial shipped it anyway, and the code is the authority: `appStore`/`fixtureModel` carry no
> `toggleSlotLock`/`setSlotLock`, and `ProgramDetail.tsx` edits nothing. Corrected 2026-07-17.)*
> **The structural-narration follow-up is CLOSED (2026-07-16), not open.** This paragraph used to
> end by noting that the weekly mirror (S-45) narrated load moves from the change log but NOT
> structural changes (graduation / rotation / a learned swap write `substitutes`, not the change
> log). It does now: `fixtureModel` calls `recordStructuralChangeV5` for every enacted change
> (idempotent per week), and `engineChanges` maps a ROTATION onto the `swap` copy — which is why
> there is no `explain.rotate` key and does not need to be one. Proven by
> `v5_stage7_weekly_update.test.ts` ("a graduation and a learned/rotation swap are NAMED in the
> mirror"). Line 1016's ✅ was right; this note was the stale half. Corrected 2026-07-17.)*

| # | Stage | Owns | Status |
|---|---|---|---|
| **0** | **The fact substrate** — `restBeforeS` on every set, phone **and** watch | S-17, S-18, S-54, S-58 | ✅ **BUILT + WIRED** |
| **1** | **The pure core** — Loop 1 + Loop 2, exercise-keyed state, the grid, reps-per-rung | S-8…S-16, S-22…S-31, S-49…S-55, S-61, S-67 | ✅ **BUILT** — Loop 1 now sizes an in-session correction to her FITTED reps-per-rung (`perRungForV5` stamped on the target; 2026-07-16 review), not one cautious rung |
| **2** | **The set loop, live** — `sessionStore` **and the watch** together | S-11…S-13, S-28 | ✅ **WIRED** |
| **3** | **Volume + real time** — Loop 3, the time budget from measured rest | S-17, S-18, S-32…S-37, S-64 | ✅ **WIRED (Rev 7 D + 2026-07-16 review)** — advanceV5 runs Loop 3 per muscle per occurrence (grow/hold/trim), the learned target persists (`EngineV5.volumeByMuscle`) and regeneration distributes it (`distributeMuscleSets`, 3..5 each, new exercise on overflow); an over-budget day donates by S-37 (`chooseDonor`). **The TIME BUDGET now uses HER MEASURED REST** (exec + median `restBeforeS` per lift, S-64) — the review found it built-but-unwired and connected it; day-one bootstrap unchanged. Volume moves are NARRATED in the mirror (`explain.volumeUp/Down`) |
| **4** | **The map + T + assembly** — the programme becomes generated | S-1…S-7, S-44, S-50, S-56, S-57, S-59, S-62, S-63, S-66 | ✅ **WIRED (Rev 7)** — per-muscle T live; map-driven `generateProgram` live for the v5 cohort; the onboarding body-map screen sets `bodyMap`+`repBand` |
| **5** | **The surfaces** — decision at the end of the WORKOUT (per-workout, L7); Saturday is a mirror | S-45 | ✅ **WIRED** (v5 cohort) — incl. **structural** changes (graduate/rotate/learned-swap) named in the mirror (Rev 7 S-45, 2026-07-16) |
| **6** | **The burial** — drop `db.engineV4`, delete `src/engine/v4/` | S-58 | ✅ **DONE (2026-07-16).** `src/engine/v4/` deleted in full; the legacy `!isV5` branches, the Lock System, the programme-edit swap + pin button (S-73), the 3-week periodic refresh, and the `engineV4` store are all gone. Shared infra re-homed first (`engine/catalog` / `weeklyView` / `loadMath`). No migration — the TestFlight cohort is recreated clean. tsc + 771 tests green + `expo export` clean |

*(Status **2026-07-17**: **there is no cohort any more — v5 is the only engine.** Live for everyone:
map-driven `generateProgram`, per-muscle T, `sessionStore`, the weekly mirror, **Loop 3
volume-over-time (D)**, graduation/rotation reaching the programme (S-52/S-25.3), and the learned
exercise selection (C, S-68…S-70). **S-73 (the learned-swap UI deletion) IS wired** — it shipped with
the burial (stage 6); `ProgramDetail` is a read-only preview and the pin/swap buttons are gone.

**Corrected 2026-07-17 — this paragraph described a world that no longer exists.** It said the engine
was "gated on `profile.repBand`" and that "existing users stay v4 (no migration)", and listed "the v4
deletion" as still-not-wired. All three were made false by the burial the table above records: there
is no `isV5` gate left in the source, no `src/engine/v4/`, and no `engineV4` store — so nobody can
"stay v4", because there is no v4 to stay on. A **legacy profile does not break and does not need a
migration**: it degrades by construction — `bandFor(undefined)` → the default 8–10 band ("the
fallback for older profiles"), and `stanceOf(undefined, m)` → `normal`, so an athlete with no body
map is simply trained full-body at normal stance until she opens the map — but **no real athlete is
even in that state.**

**S-58 IS CLOSED, AND IT IS NOT A LOOSE END (founder, 2026-07-17):** *"v4 is deleted. I told the old
users it was deleted and that they start everything fresh on the new engine."* The testers were
recreated clean and the athletes were **told**, so the "legacy profile" path above is a safety net
with nobody standing on it — not a migration debt, not a cohort, not a risk to design around.
**Nobody reading this file should spend another minute on v4.** The legacy fallbacks stay only
because they are free and honest, never because someone is depending on them.

**Nothing in Rev 7 is outstanding; the only item left is a nice-to-have V5Debug dev screen.**
See the memory `engine-v5-open-tasks-2026-07-15`.)*

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
- **The time budget is NOT asked.** ~~Default **60 minutes** — a CEILING (S-64), editable in
  Settings.~~ **⛔ SUPERSEDED BY F-15 (2026-08-10, founder — Rev 14 records it here).** *"למה לא פשוט
  להגדיר שעה אימון קבוע — בין 45 ל-60 דקות טווח קבוע?"* — and *"just make it at least 45 minutes,
  because less than that is too light."* **There is no Settings control and there never was one**:
  the question left onboarding on 2026-08-05 (*"the athlete cannot answer how long she wants to be in
  a gym before her first session"*) and nothing else ever wrote `profile.workoutMinutes`, so the
  "editable" half of this bullet described a screen that does not exist. The session is now **45–60
  minutes for everyone** (`SESSION_MIN` / `SESSION_MAX`), the field is deleted, and the ceiling is
  still a CEILING (S-64) — one bound proved instead of a family of them.
  The rest of this bullet stands unchanged: the existing loops already converge the real workout to
  her behaviour from facts — measured rest fills the budget for a fast rester (S-17); unfinished sets
  trim it (S-33/34). "Wants more than 60" is near-illusory — 60 minutes of prescribed work is a
  complete session. **No new mechanism, no learning.**
- **`experience` is deleted as an input.** A self-report is not a fact the engine measured (L1), so
  it may never touch a load; **Loop 1 measures her from set 1** instead. *(This bullet originally
  said "the approach set measures her" — Rev 8 deleted the approach set, and the deletion of
  `experience` stands on L1, which was always the stronger reason.)* Removed from onboarding,
  Settings, **and the profile's decision path — including the cold-start load (B-1), which reads her
  sex and bodyweight and nothing else.**
- **Reps are NOT learned from behaviour — a learned rep-band was designed and REJECTED (2026-07-15).**
  The signal "high reps at a flat load" is confounded with **S-28** (the coarse-machine rep-climb the
  engine itself induces), it has **no natural re-test surface** (weak L2), and it would ADD per-set
  friction to replace a single map setting. The manual per-muscle band is the whole answer.

### B · Learned exercise selection — the edit screen, the pin, and the declared swap are deleted

The athlete owns exercise selection through exactly two facts — the **body map** (which muscles) and
the **in-workout swap** (which exercise) — plus what the engine **learns** from repeated swaps.
Nothing is browsed or assembled by hand (soul: *"Not a template shop. Hush builds it."*).

> **⛔ SETTLED — THE LIBRARY IS A PREFERENCE, AND §B's RULE IS NARROWED TO WHAT IT WAS PROTECTING.**
> *(Rev 14, 2026-08-19 — founder, on being asked what the screen is for: *"מטרת הספרייה היא לבחור
> תרגיל שאתה אוהב על פני אחד שלא. או תרגיל שאתה אוהב בנוסף לקיים."*)*
>
> **§B's sentences were written to stop her BUILDING a programme** — the thing that makes the engine
> pointless. The library does not let her build one. There is no load in it, no set count, no day,
> no order. She says *this lift over that one*, or *never this one again*, and the engine still
> assembles the week. **The body map is already a declaration made off the gym floor, and nobody
> calls that couch-planning** — this is the same kind of fact about her, one level down.
>
> ⚠️ **AND "IN ADDITION TO THE EXISTING ONE" IS THE HALF THAT COULD HAVE BITTEN — the engine already
> answers it correctly, and the answer is the one Part 3 demands.** A pick **leads** its muscle; it
> never **adds** a seat. `pickExercises` caps the picks at the muscle's own allowance
> (`.slice(0, Math.max(1, wanted))`), and the line carries the measurement that forced it: without
> the cap, five declared chest lifts seated **seven where the target afforded five**. So "a lift I
> love, as well" means it goes to the FRONT of the queue for that muscle — not that the week grows
> by one. The hour is still fixed and volume is still earned (S-64, S-32). The screen says as much
> already: *"A pick takes the first seat for that muscle. How many of them fit is decided by the
> muscle's volume and your hour."*
>
> **The two gates that make it safe, both already shipped and both now declared here:** a refusal can
> never empty a muscle she left on (`exerciseLibrary.refusalBlock` → `last_lift`), and a pick she has
> since refused, or that pain has banned, is not in the pool and therefore cannot lead — the gates
> run before the picks, deliberately.
>
> **§B's rule now reads:** *no load, set count, day or order is ever set by hand.* That is still true,
> it is the rule that actually protects the product, and it is the one the engine enforces. The
> original sentences are kept below for the record.

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
engine adopts it **and stops rotating it** — a **leave-it**, *earned by resisting rotation*, never
declared on a button. **This is the ONLY thing left of the old "pin", and it is not a pin: she cannot
place one, only earn one, and only on a lift the engine itself tried to take away.** Thereafter it
behaves exactly as S-30's leave-it-and-stalled lift: it still gets back-off/re-climb, but the engine
never takes it away. This bounds the "rotate ↔ swap-back" loop to two cycles. A leave-it persists
(through reassembly, and a muscle off→on, S-66) until she swaps it away herself, and under the time
budget it is **cut last** (S-59).

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
- ~~**No couch-planning.** An exercise can be changed only at the gym (in a workout). On-soul
  (*"Hush builds it"*), but a deliberate loss of pre-planning.~~
  **⛔ SETTLED AND STRUCK — S-77 (founder, 2026-08-22).** The clause was flagged OPEN on 2026-08-19
  because `ExerciseLibrary` (2026-08-16) already contradicted it. The founder then closed it in the
  other direction outright: *"יש לנו ספריית תרגילים אבל אי אפשר ממש להכנס לתוכנית האימון שלנו
  ולהחליף תרגיל לתרגיל שנמצא בספרייה."* Couch-planning is not a loss the product is taking; the
  question was only ever **which kind of couch-planning**, and the answer is a same-muscle 1:1
  substitution and nothing else. See **S-77** below.

**S-77 · She names a replacement off the gym floor.** *(New, founder-ratified 2026-08-22.)* From the
pre-workout card she may say **"give me THIS one instead of THAT one"**, through the **same sheet the
rack raises** — `swapChoices`, same-muscle synonyms only, one to three rows and never padded.

   1. **It changes no load, no set count, no day and no order.** That is §B's rule as Rev 14 narrowed
      it, and a same-muscle 1:1 substitution sets none of the four. Volume and the hour are untouched,
      which is the same reason the in-workout swap (S-20) was always safe.
   2. **It is a DECLARATION, not a count, and it is stored apart from one.** The learned map
      (`substitutes`, S-68/S-69) is written by the K=2 fold and **cleared by it** when it stops
      believing an adoption; a declaration living there would be deleted by inference weeks later. It
      is written to `declaredSubs` and **declared beats learned on a collision**, with the learned
      entry left standing underneath so taking a declaration back falls to her behaviour rather than
      to nothing (`swapPool.effectiveSubstitutes`).
   3. **It is reversible the way she made it** — naming the original again removes the entry. No
      second control exists whose only job is to undo the first.
   4. **A finished session is never offered one.** It is a record; proposing to change a lift she has
      already done would be the app offering to rewrite history.
   5. **A week she brought is not reshaped by it** — the declaration is saved, the REBUILD is refused,
      exactly as it is for a pain report, a profile edit, an ease answer and the library
      (`aWeekSheBroughtIsNotOursToRewrite` counts the gates by name; this is the fifth).

   > **⚠️ AND IT IS NOT S-31 RETURNING.** S-31 was the programme-edit screen: a surface for arranging
   > a week by hand. This is one verb on a row, drawn from the pool the engine itself would have
   > chosen from, on the screen she reads before she leaves the house. The thing S-73 deleted was the
   > **editor**; what comes back is the **swap**, at the moment she actually decides.
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
