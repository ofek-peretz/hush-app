# HUSH — Complete Product & Engine Brief
### The single document a designer needs to redesign this app end to end
**Prepared for a full visual / motion / interaction redesign (Claude Design).**
Source of truth: the shipped codebase (`code/mobile`) as of 2026-08-22, branch `engine/revival`,
reconciled against `docs/canonical/ENGINE_V5_SITUATION_REGISTER.md` (Revision 14).

---

## 0 · HOW TO READ THIS DOCUMENT

This is not a wish list. Everything below is **built and shipping** unless explicitly marked
`NOT BUILT` or `TODO`. It is organised so a designer can work from it without reading code:

| Part | What it gives you |
|---|---|
| **1** | What Hush is, and the four sentences the whole product is judged against |
| **2** | The surface map — every screen that exists, with its shipped ID |
| **3** | **The engine** — every rule that decides a number the athlete sees |
| **4** | **Screen by screen** — what is on each screen, why, and what may not be removed |
| **5** | Notifications — the complete, exhaustive catalogue (there are four) |
| **6** | Haptics — the complete taxonomy |
| **7** | Motion & animation — the current physics |
| **8** | The design system as it stands — tokens, type, colour law, mono law |
| **9** | **Hebrew & RTL** — gender, bidi, the mono ban, the exercise-name split |
| **10** | Apple Watch |
| **11** | Live Activity / Dynamic Island / widgets / complication |
| **12** | Sensors — Health, GPS, treadmill, heart rate |
| **13** | Subscription, trial, lapse |
| **14** | Data, privacy, sharing |
| **15** | **The hard constraints** — laws a redesign must not break, and why each exists |
| **16** | **The design brief** — the founder's own targets for this redesign |
| **17** | Appendix — catalogue statistics, constants, copy namespaces |

**Vocabulary note.** The athlete is referred to as "she" throughout, following the codebase. The app
addresses every athlete in their own grammatical gender — see §9.

---

# PART 1 · WHAT HUSH IS

## 1.1 The product, in one sentence

**Hush is a strength-training app whose engine is inside the set.** It reads the reps you just did
and moves the iron before your next set — in about ninety seconds — and it never says a word it did
not measure.

## 1.2 The four sentences the product is judged against

1. **"An AI coach will invent a reason. This engine was actually there."**
   An AI asked why the third set dropped will tell a convincing story about fatigue. It measured
   nothing, and it is not *inside* the set — it hears about the set afterwards, second-hand. Hush is
   inside the set, sees the number, and moves the iron in ninety seconds.
2. **"Not a template shop. Hush builds it."**
   The programme is *generated* from her body, her days and her body map. She is never asked to pick
   a split. There are no pre-made programmes on a shelf.
3. **"Built on facts."**
   No fatigue score, no readiness score, no RPE, no motivational language, no streaks, no confetti.
   Every number on every screen traces to something she actually did.
4. **"The engine obeys and states the cost."**
   It never argues, never nags, never moralises, and never claims a reason it did not measure.

## 1.3 The three things the athlete owns

| She owns | The engine owns |
|---|---|
| **The body map** — off / normal / lead, per muscle | Load |
| **The rep band (T)**, per muscle — default 8–10 | Volume |
| **Exercise selection** — expressed as swaps in the workout, and as picks/refusals in the library | Exercise selection (from her pool), workout structure, ordering, session length |

She sets her **days per week**. She does **not** set her session length, her sets, her loads, her
split, her rest, or her exercise count.

## 1.4 The AI's one job

As of **2026-08-08** (founder: *"אני לא רוצה יותר AI במערכת שלנו זה נכשל בענק"*) the model is
reachable from **exactly one place: reading a programme she already has** (a photograph of a coach's
sheet, or typed text — §4.13). There is no chat, no in-workout assistant, no post-session AI
decision. This is enforced mechanically by a law test (`theAiHasOneJob`) that fails the build if any
other file can reach the transport.

**Design consequence:** nothing in the redesign may look, read, or behave like an AI chat product.
That is the single strongest brand constraint in this document.

---

# PART 2 · THE SURFACE MAP

Every screen that exists, with its shipped gallery ID. The dev gallery (`src/screens/dev/gallery.tsx`)
renders each of these in isolation and a law test fails the build if a built screen is not listed or
is unreachable from a real door.

## 2.1 Navigation architecture

- **Hub-and-spoke, tap-based.** No swipe carousel (ratified and rejected — gesture conflicts with the
  wheels, sheets and full-width back swipe already living on those screens).
- **Bottom tab bar with four peers:** `Today · Cardio · Progress · You`.
  Custom-drawn, never the stock iOS bar. The active tab is `textPrimary` (brightest); inactive are
  `textMuted`. **The active tab wears the brand mark** — a small moss "measured-range" glyph (a
  hairline with two end ticks) struck beneath its label. One hairline separates the bar from the
  page. Nothing else is drawn.
- **A stage has no navigation.** The live workout, the live run, and modals are pushed *above* the
  tab navigator, so the bar is simply not in their tree.

## 2.2 Complete screen inventory

**Onboarding (forward-only)**
| ID | Screen |
|---|---|
| 1.1 | Sign in + consent (merged) |
| 1.1b | **Where do we start?** — the fork: build one, or bring the one you have |
| 1.2c | About you — name, sex, years training, on one screen |
| 1.2e | What do I train? — the body map (one body she presses) |
| 1.2f | …the same map on a three-day week (one lead, not two) |
| 1.3 | Connect Health (+ the wrist row, when a watch is paired) |
| 0.0e | Building her programme (the wait) |
| 1.5 | Ready — her week, by name, + the trial block |

**The daily loop**
| ID | Screen |
|---|---|
| 2.1 | **Today** — the week column, the queued row opened, one act |
| 2.1a–e | Today variants: week one, a finished session re-read, a named-day (imported) week |
| 2.1b / 2.1j / 2.1k | **The Why sheet** — raised / held / eased |
| 2.1f–h | **Pre-workout** — the full card a day opens into |
| 2.0 | First workout — "we're learning your gym" (once per install) |
| 2.2 (+ h,k,l,m,i,e,d,c,q,t,f) | **The set** — the live stage, all its states |
| 2.3 (+ d,e,f,g) | **The correction** — the beat after a set is logged |
| 2.4 / 2.4b / 2.4d | **Rest** / transition rest / "learned" |
| 2.45 | The end-of-session scan |
| 2.9 / 13.1 | Paused — the stage held, with the pain door |
| 2.5 (+ d,e,b) | **What this session earned** — the close |
| 2.6 / 2.6b | **Milestone** — the one licensed loud moment |

**The long view**
| ID | Screen |
|---|---|
| 3.1 / 3.1b / 3.1c | **The Saturday letter** (Weekly Update) / the one question / a steady week |
| 3.2 / 3.6b | Progress · Lifts / day one |
| 3.2b–d | Lift detail |
| 3.3 / 3.3b / 3.3c | Progress · Log (history ledger) / a workout record / a cardio record |
| 3.5 | The week is done — Recovery |

**Cardio**
| ID | Screen |
|---|---|
| 3.4a | Cardio — ready |
| 3.4d | 3·2·1 countdown |
| 3.4 (+ e,f,n,g,b,j,k) | Cardio — live, all its states |
| 3.4c / 3.4h | Cardio — done |
| 4.9 | The run, drawn (the engraved route) |

**You**
| ID | Screen |
|---|---|
| 4.0 | You — the whole tab |
| 4.1 | Body map — hers to change |
| 4.1b | Exercise library — the lifts she wants and never wants |
| 4.2 / 4.2a | Bring your own programme / what we found in it |
| 4.3 | Paywall |

**System surfaces**
| ID | Screen |
|---|---|
| 6.1 / 6.2 | Dynamic Island / lock-screen Live Activity |
| 8.1 / 8.2 / 8.3 | Notifications / the honest permission ask / in-workout rest-ending |
| 9.1 / 9.2 | Share card — personal record / week complete |
| 10.1 | After a gap — the welcome back |
| 10.2 / 10.3 | Subscription lapsed (read-only) / win-back push |
| 10.4 / 10.4b | On your wrist / not installed |
| 11.4 / 11.5 | Share your plan / plan, received |
| 13.2 | Something hurts |

**Not built (needs a server, deliberately out of the launch):** 11.1 invite a partner,
11.2 shared session, 11.3 the partner seen.

---

# PART 3 · THE ENGINE

The engine is called **v5**. It replaced v4 wholesale; v4 is deleted, and no athlete is on it. It is
specified situation-by-situation in a 2,288-line register, and **every situation has a test named
for it** — the register *is* the test suite. What follows is the whole engine in the order a
designer needs it.

## 3.1 The eleven laws

Every answer traces to one of these. An answer that cannot be traced to a law is a guess, and it
does not ship.

| # | Law |
|---|---|
| **L1** | **Facts only.** The engine never asks *why*. It has no concept of fatigue, readiness, recovery, motivation, or effort it did not measure. |
| **L2** | **A guess immediately tested is not theory.** A day-one cold-start load is allowed *only* because the very next set corrects it. A number the engine must live with for weeks is forbidden. |
| **L3** | **Like for like.** A set is comparable only to a set taken under similar conditions. Rest is recorded on every set; an unknown rest is **absent**, never zero. |
| **L4** | **A missing fact is asked for once** — never guessed, never asked twice. |
| **L5** | **Constants** are forbidden where they stand in for a measurable fact. Allowed only to define the shape of the product — and then declared out loud and counted. |
| **L6** | **Ownership.** Engine: load, volume, selection, structure. Athlete: her rep band, her rest, her body map, and her exercise preference. |
| **L7** | **No weekly boundary.** A decision is told at the moment it is born — the end of the set, or the end of the workout. Never on a schedule. |
| **L8** | **The engine obeys and states the cost.** It never argues, moralises, nags, or claims a reason it did not measure. |
| **L9** | **A question never stands between the athlete and her workout.** It assembles the best workout it can, runs it, and leaves the question open. |
| **L10** | **The engine steps from a load it cannot be lied to about** — the *median* of the sets that met her target. How far it moves is decided by her own measured reps-per-rung, never a fixed step. A raise rounds **down**; a drop rounds **up** (a coach who is unsure errs light). |
| **L11** | **The rail — the one hard stop.** The engine may never prescribe a load more than **one rung above the heaviest weight she completed at her target reps** on that exercise. Her own record is the ceiling, and a fat-fingered set cannot lift it (the base is a median, not a raw set). |

## 3.2 What is a fact

**Recorded on every set:** exercise · load in kg · reps · **seconds actually rested before this set**
· timestamp · was_completed.

**Recorded per session:** which exercises were prescribed, which were performed, how much of each was
completed (prescribed sets vs performed sets), which were replaced and by what, duration.

**Hush does not log warm-up sets, and will not.** Every logged set is a working set. A tripwire test
fails the build if a third kind is ever added.

**Declared by the athlete (durable, editable, never inferred):**
- Sex, age, height, bodyweight
- Days per week
- **T — the rep band, per muscle.** Default **8–10** for every muscle. Not asked in onboarding; edited
  per muscle inside the body map. Each exercise reads its **primary muscle's** band.
- **The body map** — every muscle is `off` / `normal` / `emphasis`.
- **Exercise preference** — learned from repeated in-workout swaps, plus explicit picks/refusals in
  the library.

**What "T" means everywhere:** she picks `Tlo–Thi` (e.g. 8–10).
- **`Tlo` is the target.** "Met T" = reps ≥ `Tlo`. Landing at 9 inside 8–10 *is* met, with room to
  spare. She never has to reach the top of the range.
- **`Thi` is the "too light" mark.** A set above `Thi` means the load is light enough to correct this
  session.
- **Below `Tlo`** → the contract broke → the load drops for the next set.

**Banned inputs (permanently):** fatigue · readiness · recovery · inferred RPE/RIR · e1RM *as a
judgement about her capacity* · demographic assumptions (sex → split) · calendar-driven anything ·
cardio. Heart rate is **recorded and displayed and is never an engine input.**

**Deleted forever:** goal (there is one goal: hypertrophy), experience level, a "volume lever", a
deload construct, an injury flag, streaks, an adherence gate, a calendar rotation.

## 3.3 The three loops

There is **no weekly loop**.

### Loop 1 — The Set (in-session, ~90 seconds) · **the signature moment of the product**

The prescription is a contract: **N sets, at load L, landing in her band `Tlo…Thi`.** After each
set, the reps are a fact.

- **Reps land below `Tlo`** → **drop the load for the next set**, by as many rungs as her own measured
  reps-per-rung says the shortfall is worth.
- **Reps land above `Thi`** → **raise the load for the next set**, by the same measure.
- **Inside the band** → exactly right. No correction. (But the app still tells her she landed —
  see §4.6.)

**"How many reps is one rung worth?"** is measured from *her* history on *this* lift — the
Theil–Sen slope (the median of all pairwise slopes) through her `(load, reps)` sets, reading only
sets whose rest is within 45 s of each other and only sets inside her recency window (her last 12
sessions of that lift). *"On the bench, Sarah loses about 2 reps per 2.5 kg. That is her number."*
Before she has four like-for-like pairs at distinct loads, the move is priced from the e1RM model
the app already displays — so a 20-rep set and a 12-rep set no longer raise the load by the same
amount.

**Cap: at most 2 corrections per exercise per session.** Never after the last set (it has no next set).

**A correction lands on a weight that physically exists at her gym** — her real performed rungs, not
an equipment default. And **a weight she edits carries forward** for the rest of that exercise.

### Loop 2 — The Exercise (end of every occurrence)

Decides the load for the **next occurrence of this exercise** — not next Saturday. State is keyed to
the exercise, never to a slot.

- **All working sets reached `Tlo`** → **up.** From the anchor (the median load across the sets that
  met `Tlo`), by as many rungs as her measured headroom says, never past the rail.
  *"All three sets hit 8. The row goes to 47.5."*
- **Not every set reached `Tlo`** → **hold at the anchor.** Not a further cut. Repeat it.
- **It has failed more times than her own typical attempts-to-clear** → in order: (1) **back off** to
  the heaviest load at which all sets met `Tlo`, and re-climb; (2) if that has persistently failed,
  **rotate** to the same-muscle lift she has gone longest without.
  *"The cable row hasn't moved in five weeks. I've swapped it for a chest-supported row."*
- **A set logged with 0 reps / the exercise abandoned** → ambiguous → **no load decision is banked.**

**"N" — attempts-to-clear — is her own statistic**, the 75th percentile (nearest-rank) of how many
occurrences she historically spends at a load before clearing it. A novice who clears first time has
N=1; a grinder's N becomes 3 on her own record. **Exceeding her own number is the definition of a
stall — never ours.**

### Loop 3 — The Muscle (end of every occurrence of that muscle)

- **She completed every set for a muscle and at least one of its lifts advanced** → **+1 set** at that
  muscle's next occurrence.
- **She completed everything but nothing advanced** → **hold.** (Adding volume to break a stall is a
  theory. The stall belongs to Loop 2.)
- **She left sets unfinished** → hold. **Twice in a row** → **−1 set.**
- **Never shave below 3 sets.** Drop an exercise instead (3×4 beats 2×5). The exercise that goes is
  the **last isolation** in assembly order — a compound is never sacrificed before an isolation.
- **Two protected lifts a drop may never take:** the only exercise of an `emphasis` muscle, and the
  only exercise of any `normal` muscle on the map.
- **When a muscle's earned sets exceed what its exercises can hold (5 sets max each), the next set
  opens a new exercise** for that muscle.
- **When the ceiling is reached and an emphasis muscle earned a set**, the set comes from a
  non-emphasis muscle — the one with the most rolling-7-day sets. The engine says what it did:
  *"Back earned another set. I took one from triceps to make room."*

## 3.4 How the programme is assembled

The programme is **generated**, never chosen from a shelf. Constraints, in strict priority:

1. **The body map.** An `off` muscle never appears. An `emphasis` muscle has first claim on volume
   **and is guaranteed at least one exercise.**
2. **The time budget.** `Σ sets × (work + her measured rest) ≤ 45–60 minutes.` **It is a ceiling,
   never a target.**
3. **Compounds before isolations, globally and without exception.** Never traded for a shorter walk.
4. **Inside each phase, save the walk** — chain to a lift on the same *physical station* first
   (the leg press and its calf raise), then to one in the same equipment family, then catalogue order.
5. **Deterministic exercise choice** from her pool: minus swapped-away, plus her learned leave-its and
   her library picks. **A leave-it is cut last.**

> **This ordering is the result of a founder reversal on 2026-08-08.** The engine used to group a day
> by equipment *class* ("every barbell lift, then every machine lift"), which cut a day into three
> huge blocks and cost the training order. Founder: *"מה שהמנוע עשה זה פשוט ליצור כמעט את כל האימון
> עם אותו הציוד וזה ברור שזה לא מה שרציתי. גם לא רציתי מבודד לפני מורכב."*

**Session structure is an output, not an input.** Mark Glutes + Quads on a 3-day programme and you
get two lower-body days — because the volume has to go somewhere. **She is never asked to pick a
split.**

**Below 4 days a week, every session trains the whole body.** Splitting upper from lower at two or
three days would train each muscle once a week, and twice a week grows roughly 63% more than once at
equal volume. Four days is where upper/lower first gives both halves two sessions.

**The finished week is read back and mended** (`weekRepair` against `weekQuality`) — small named
moves, kept only when the whole board improves. Over the 270 weeks the product can produce: muscles
past the ceiling 34 → 0, share inversions 104 → 92, **weeks made worse: 0.**

**The week has a name**, derived deterministically from its own shape — never asked for, never
AI-generated.

## 3.5 The volume model — how much of what

The week's pot is `WEEKLY_SETS_PER_DAY (5) × days × FULL_BODY_MUSCLE_COUNT (9)` and is divided by
each muscle's **share**:

| Back | Chest | Quads | Hamstrings | Shoulders | Glutes | Biceps | Triceps | Calves |
|---|---|---|---|---|---|---|---|---|
| **1.5** | **1.3** | **1.3** | **1.2** | **1.2** | **1.1** | **0.7** | **0.7** | **0.6** |

> **Why the table exists (founder, 2026-08-09):** *"אני רוצה גם שתסתכל על תוכניות האימון עצמם ותגיד
> לי האם הן טובות ברמה בינלאומית."* Read as a coach would read it, the answer was **no** — every
> muscle drew the same weekly target, and the printed week had **Calves trained harder than Back**.
> No coach in the world signs that. The engine had no concept of muscle size.

Bounds: floor **6** weekly sets (below this a muscle is maintained, not grown), ceiling **30** (a
*shape* input, not a prescription — the clock is the real allocator). An `off` muscle never shortens
her session: the pot is fixed and divided by the shares that remain, so turning off four leg muscles
hands the whole week to the five upper ones.

An `emphasis` mark is worth **+60% of the base**, proportionally at every frequency. **A mark moves
volume; it does not add it** — the hour is fixed.

**Worked example — a full map, four days:** the pot is 5 × 4 × 9 = 180. Back's share is 1.5 against
9.6 across the nine trainable muscles → **28 weekly sets → 6 lifts.** Chest 24 → 5. Calves 11 → 2.

**Emphasis budget: 2 marks — with two refusals stated out loud.**
- At **three days or fewer she gets one mark, not two.** Every session is full-body there, so two
  leads always compete for the same sessions.
- **Two marks may never share a region** (upper/lower). Measured across every legal pair: marks on
  different regions were honoured perfectly (36 marks, zero lowered); marks on the same region
  lowered three, and a mark could end up *lowering* the muscle it was placed on.
- Neither refusal ever revokes a mark she already has.

> **Design note:** this is a coaching constraint said out loud, not a bug. The screen must state the
> real budget for her frequency — a budget the copy and the guard disagree about is a budget she has
> to discover by being refused. This was a live founder complaint
> (*"אני מנסה לשים 2 שרירים על EMPHASIS וזה נותן לי רק על אחד משום מה"*): he was on three days, and
> the defect was that the screen promised two.

## 3.6 The grid — what weights exist

**The equipment grid is a movement, not a constant.** Rungs are the loads that physically exist. The
starting increment is a bootstrap (barbell 2.5 · dumbbell 1.0 · machine 2.5 · cable 2.5); **her own
performed loads refine it into her real rungs.**

- **A prescribed rung is a suggestion, never a requirement.** If a rung from another gym's grid isn't
  on the floor she is standing on today, she loads the nearest weight that *is* — and that performed
  load is the truth the loops read.
- **The empty bar weighs 20 kg**, and it is the floor under every barbell load. That is why the
  barbell curl and the skullcrusher floor at 20, not at their base load.
- **A prescription may never fall to or below zero**, or below the lightest weight that physically
  exists. Below that there is no prescription: it becomes a bodyweight or assisted lift, and the
  engine says so.
- **The big-jump hold.** On a coarse stack (a machine she has used at 40 and 50, so her grid reads a
  10 kg step) the engine will not prescribe the unreachable rung. It says the truth and offers the
  only honest axis left: *"This machine jumps 10 kg — too big a step for you right now. We'll add
  reps here until it's within reach. If the machine offers a smaller jump, load it and I'll learn
  the step."* One performed set at 45 makes 45 a real rung forever. **This is the one hold in the
  whole engine that is narrated**, because she cleared every set for it.

**Plate maths is done for her.** The load headline is the engine's number; underneath it the app
states how to *set the equipment up*, equipment-natively — barbell plate breakdown, dumbbell per
hand, a pin, a fixed bar. Plates are shown **only when they decompose exactly**; otherwise the
per-side weight is a plain number. (Founder screenshot, 2026-08-21: **8.75 KG A SIDE** — the app must
show the discs, not the arithmetic.)

## 3.7 Rest — two kinds, both learned

The rest before **set 1** of a lift is not a rest at all — it is the walk to the next station, the
setup, the plate change. The rest before **sets 2..N** is recovery.

| | Bootstrap | Replaced by |
|---|---|---|
| **Inter-set** (compound) | 150 s | her median inter-set rest **on that lift** |
| **Inter-set** (isolation) | 75 s | (same) |
| **Transition** (between exercises) | 120 s | her median transition rest, **pooled across lifts** — the walk is a fact about her gym and her pace |

Gate: **3 samples** before her median replaces the bootstrap (a median is chosen precisely so one bad
value cannot move it, and that property does not exist below three).

**She hammers skip on the rest → recorded → her median rest becomes the prescription.** The timer
stops being something she fights, and the time budget *credits* her for it: a 60-second rester earns
more work inside her hour. **The engine measures her and then hands back a timer she actually takes.**

An unknown rest is **absent**, never zero.

## 3.8 Session length

**45 to 60 minutes, one figure for everyone.** She is not asked how long she wants to train — founder,
2026-08-05: *"the athlete cannot answer how long she wants to be in a gym before her first session…
just make it at least 45 minutes, because less than that is too light."*

A day holds at most **7 lifts**. A muscle's block is **3–5 sets**.

If a day genuinely cannot fit — every trained muscle down to its last lift — the engine says so
rather than quietly starving a muscle.

## 3.9 Swaps, leave-its, rotation, graduation

**The swap** is offered only **before the first set of an exercise** (and on the transition rest, for
the lift she is walking to). The pool is **same-muscle synonyms only** — a swap can never change
which muscle is trained. The menu is **one to three rows and never padded**; six lifts in the
catalogue have no admissible peer at all, and for those the disc does not appear.

- **One swap declares nothing.** The station was taken; it's a backup. Zero progression cost, because
  progression is exercise-keyed — **the backup already knows her number.**
- **Two consecutive same-target swaps (K=2) become a standing replacement.** One swap = a backup; two
  = a preference. The engine narrates the change.
- **The original is always offered first afterwards**, so a wrong adoption is continuously and cheaply
  reversible. Adoption is never a latch.
- **A leave-it is earned, not declared.** If the engine rotates a stalled lift away and she swaps back
  to it twice, the engine **stops rotating it**. There is no pin button. She cannot place one, only
  earn one, and only on a lift the engine itself tried to take away.
- **Graduation** (bodyweight lifts): knee push-up → push-up → dip; chin-up → pull-up. Triggered when
  every working set reaches her `Thi`, or when it stalls below it and there is no load to add. History
  carries. When nothing harder exists, it **holds honestly and says so**.

## 3.10 Coming back after a gap

Below **10 days** away, nothing moves at all — *"a product that greets you after four days is a
product that watches you."*

Past ten days, the engine applies a decay of **10% a month, floored at 70%**, counted from the tenth
day. It is snapped to the **nearest** rung on her learned grid and can never exceed the load she came
in on — so an eleven-day break rounds to no change at all.

> **Why this exists, measured:** an athlete given eight ordinary weeks and then a 90-day gap was
> prescribed the incline barbell press at 30 kg and got **0 reps**; the machine row at 32.5 kg, **0
> reps**; at 180 days the dumbbell curl at 9 kg, **3 reps**. Four lifts of four, on the first session
> of a comeback — the one session in her whole history where the app most has to be right. Loop 1
> gets two corrections and they move by rungs; they cannot walk back thirty percent inside a session.

**Her very first set back overwrites it.** There is no deload construct, no re-entry week, no
"welcome back" adjustment beyond this one move. The Welcome Back screen's guarantee: **being away is
not punished here, and the bar decides the rest.**

## 3.11 Pain and ease

Three severities, in her own words — **twinge / pain / sharp** — because three is what a person can
answer honestly while standing at a rack. **The only thing severity buys is how long the muscle
rests:** 3 / 7 / 14 days.

**It adds no new mechanism.** A pain report is two things Hush already does:
1. **The muscle goes off** — the same `off` her body map has always had, except this one **expires and
   lifts itself**. Stored *beside* the map, never inside it: her map is hers, and a tender shoulder
   must not quietly rewrite a decision she made.
2. **The lift is swapped** — through the same pool every other swap uses. The new lift's load is
   whatever the engine already prescribes for it.

**A reported muscle forbids movements, not just the label.** A hurt shoulder that only switched
`Shoulders` off would still be loaded by tomorrow's chest press. Every exercise carries a movement
*pattern*, and a pain table names the patterns a reported muscle forbids. The ban filters the pool,
it filters core work, and it stops a learned swap chain from carrying her onto a movement she just
reported.

**No doctor cosplay, no alarm, no diagnosis, no tissue, no recovery estimate.** These are rest
windows, not healing estimates.

## 3.12 Determinism

Every tie breaks on a **fact, then a fixed order** — never a coin-toss, never wall-clock, never RNG.
Every estimator is a **named algorithm** (Theil–Sen for the slope; nearest-rank for the percentile).
Identical inputs yield identical output. This is what makes the whole engine reproducible and
testable, and it is why the app can be graded against a simulated athlete across 270 weeks.

## 3.13 The honest limits, stated

Three things this engine deliberately cannot do, written down so nobody mistakes them for oversights:

1. **Two actions cannot have their benefit measured directly** — adding a set, and rotating a stalled
   lift. Neither is theory: the set is cut back if she cannot finish it; the rotation is rotated again
   if the new lift doesn't move either.
2. **A rep that dropped from an injury and a rep that dropped from being undertrained are the same
   fact to it.** The alternative is a subjective "don't count today" flag — the exact self-reported
   effort signal this engine refuses. Her factual tools remain: skip the lift, or turn the muscle off.
3. **"No theory" is a discipline, not a proof.** The cold-start load and the base-load table are
   theory-laden by nature. **The claim is narrower and it is the one that matters: no assumption
   survives into a standing decision without a fact of hers overwriting it first.**

---

# PART 4 · SCREEN BY SCREEN

For each screen: what it is, what is on it, and what may not be removed.

## 4.1 · Onboarding

**Five answering steps, and one of them is a body.** The whole intake is measured in taps, and the
founder's standing rule is that onboarding is *"something people fill in and move on from"* — no
coaching voice per step, no paragraphs.

### 1.1 · Sign in + consent
Sign-in providers; continuing with a provider **records the versioned agreement**, and the line under
the buttons says so before it is pressed. (Consent used to be its own screen; it was merged.)

### 1.1b · Where do we start? — **the fork**
Two doors as **full panels** that split the body between them:
1. **Build me a programme.**
2. **I already have one** — photograph a coach's sheet, or type it out.

> Founder, 2026-08-12: *"למה כתוב בכל כך קטן האפשרות להוספת תוכנית קיימת? זה לא פיצ'ר אלא זה חלק
> מהמוצר שלנו שהגדרנו מערכת שלמה עבורו."* And on the first redraw: *"יש לך כאן מסך שלם ואתה שם סך
> הכל 2 תיבות קטנות בראש המסך ומשאיר חלל ענק ריק במרכז המסך עם משפט קטן למטה שאף אחד לא יקרא."*
>
> **A screen whose whole content is a choice must be MADE of the choice.** An empty middle is the
> screen saying the decision is small. This is the single clearest statement in the codebase of the
> "use the whole screen" principle the redesign is being asked for.

Each panel carries its ordinal, its mark, its title in the coach's serif at 27px, and — for the
second — **the guarantee, on the card it is about**: her week will not be rewritten.

If she chooses to import, the read runs **underneath the rest of the intake** and is almost always
finished before she reaches the build. The latency doesn't get shorter; it stops being time she
spends waiting.

### 1.2c · About you
Name, sex, and years training. **Sex comes first on the page**, above the wheels, because it is
published the moment it is picked and **every Hebrew sentence from there on conjugates against it.**

### 1.2e · What do I train? — the body map
**One body she presses.** Three answers per muscle: **LEAD with it · leave it · turn it OFF.**
Plus the per-muscle rep band.

Three states the design must handle:
- **An all-off map cannot continue** — Continue is blocked, and it says why.
- **A third emphasis mark is refused with a sentence**, naming the two muscles holding the budget —
  never a dead tap with a haptic tick.
- **Turning a whole region off states the consequence once, calmly** — never as an argument.

`normal` is the **absence** of a decision, not one: the map that leaves carries only what she changed.

### 1.3 · Connect Health
The Apple Health card **is the control** — a Switch that reads the granted state and runs the system
permission flow in place. (Founder, 2026-07-12: as a static info card, athletes read it as a notice
and missed the decision.) Icon is the moss activity waveform — *health is a signal, not a heart.*

**The wrist row appears only when WCSession reports a paired watch.** A phone with no watch never
sees a word about one. It is a **notice, not a second card** — there is nothing to grant.

Footer holds both exits: **Continue** and a quiet **Skip for now**.

### 0.0e · Building her programme — **the wait is the product**
A real build takes seconds, and *"the loading looks very static right now."*

It shows **no progress it cannot measure** — a percentage would be a lie, and a bar filling at a
made-up rate is the same lie with better manners. It shows **what is being considered, in her own
facts, one line at a time**: her days, her body map, the muscles she leads with. **Every line is a
value she gave two screens ago.** A generic "analysing your goals…" is exactly the AI-app noise the
product is getting away from.

### 1.5 · Ready
Her week **by name** — its shape, her days, the muscles she leads with. Then the trial block: the
**fourteen free workouts**, the FREE pill, and the *no card until they are done* line.

## 4.2 · Today (2.1) — the daily loop

Answers the only two questions an open earns — **what is up next**, and **what did Hush change** —
and offers **the one act.**

Structure, top to bottom:

```
hush (range mark + serif)                    · the wordmark
WEEK 3 · FOUR DAYS                           · the shape of the week, mono
Shoulders, rebuilt                           · THE PROGRAMME, coach's serif — the headline
its why, one or two lines                    · the reason for the whole thing
SUN  Upper A                              ✓  · the week as a COLUMN she reads down
TUE  Lower A               · 2 CHANGES       ·   the queued row OPENS and holds the shape,
     5 LIFTS · ~58 MIN                       ·   the lifts, and the change pill
     lift · load · scheme                    ·   a CHANGED load stands in the direction it moved
WED  ———                                     · a day with nothing on it: a letter and a rule
Begin Lower A                                · the one act — cream on the dark stage, pinned
```

**Why it is a column and not a strip of chips.** Founder, 2026-08-04: *"the way I chose is like a
to-do list, and that wasn't right."* The two questions an athlete actually opens the app with —
*what am I on?* and *where am I in the week?* — were both unanswerable, while *what is today called?*
took the largest type on the screen.

- **Nothing is a card on the stage.** The stage itself is lit; emphasis is standing in that light vs
  resting in shadow. **The open row of the week column is the one thing that rises off it** — the same
  law spent on the one row that has an act.
- **The queued card puts loads on exactly three lifts**, then "+4 more lifts". Three plus a remainder
  is plainly a sample; five would be a truncated table.
- **The weekdays are earned, never asked.** Until a pattern exists, the column numbers its rows. Only
  an **imported** programme names its own days (its days outrank her earned pattern).
- **A changed load is drawn in the direction it moved** — moss up, blue down, cream held. Tapping it
  opens the Why sheet.
- **A finished day still opens its plan** — a record, never an offer. The act refuses it.

**Recovery (3.5)** replaces this when the week is done: "Recovery." centred, the completed-week meter,
and the one fact recovery waits on — when the next week opens. There, and only there, **Open training
keeps its card**: on a day with no workout, a run *is* the day's act.

**The Why sheet (2.1b / 2.1j / 2.1k)** — three states: **raised · held · eased.** It draws the
*argument* behind the conclusion: what the load was, what it became, the band it was judged against,
the last two sessions of that lift set by set, and whether each reached the top of the band.

## 4.3 · Pre-workout (2.1f) — what she reads with her bag on her shoulder

> Founder, 2026-08-05: *"pressing a day with a workout opens a full-screen card with the workout's
> content and the requirements for each exercise — not technique, but the professional requirements:
> the reps, the weights, or updates where it raised or lowered the weight."* And then, taking things
> off it: *"Remove the explanation of why on each exercise — pressing that exercise opens the WHY
> screen. And the sentence at the top, I suggest removing it: nobody reads that before a workout."*

The lift list, each row: **name · load · scheme · a delta chip (`↑1.5`) when it moved.** The delta is
a fact she reads in half a second; the sentence behind it is what the row opens. A form clip is one
tap away. One act at the foot: **Begin.**

## 4.4 · The live workout — **the stage** (2.2)

*This is where she spends 95% of her time. If it is not better than the best logger, nothing else
matters.*

The room disappears; one decision remains. Everything is on **absolute black**.

### Layout

**Chrome (never leaves):**
- The **session rail** at the top: one segment per lift, the current one **lit and wider by flex**, the
  ones behind it dimmer. **It moves once per lift, never continuously** — a rail, not a progress bar
  for time. **A finished lift's segment turns moss.**
- **The lift she is on opens into its sets** — a second, visually distinct row (a well) inside the
  rail, holding the set pips. Two rows of identical ticks would read as one broken row, so they must
  not look alike.
- The **elapsed clock**, alone. `Lift 1 / 6` is **drawn** by the rail, not written.
- **Two discs a side** (founder, 2026-08-04): pause and the form clip; the **swap disc** appears only
  before the first set of a lift and on the transition rest for the lift she is walking to. It is the
  one disc that comes and goes.

**The prescription — two equal figures.** Redesigned 2026-08-12:

```
        WEIGHT                    REPS                 SET
       34  kg                    8–10                 2/4
```

- **Three bands, each with its own heading, its own space, its own card body and elevation.** Not
  grouped, not ruled — founder: *"אבל למה שוב הדבקת אותם והותרת חלל ריק? עכשיו רק תן להם מרווח."*
- **The headings are LIT** (not muted) — founder: *"צריך לשנות את הצבע של הכותרות כי בחדר כושר…"*
- **Every figure is labelled**, because it is a gym: KG under the load, REPS under the band.
- **SET is deliberately the small one.** It gets a band and a heading like the others, but set
  position is *orientation*, not instruction.
- **The delta rides the heading, not the figure row** — `WEIGHT ↑1.5`.
- **The unit hangs off the figure and costs it no width.**
- **A bodyweight lift keeps the screen's shape**: the word `Bodyweight` stands where the number would,
  in sans (mono cannot draw Hebrew).
- **The loading line belongs to the load** and sits inside its band: *"7 kg a side"* — and it returns
  the instant the load moves, because she has to re-load the bar. It reads as an **instruction**, not
  a footnote.

**The rep band is drawn on every lift, bodyweight included.** It is a 334-point instrument with the
band's two ends **written**, not two anonymous ticks. Her sets sit on it as a row of large figures
with **last time's directly beneath them** — position *is* the set number; nothing is labelled. Eight
digits carry the whole lift, and the comparison is in place rather than in a sentence: she can see
she is a rep down on set 2 without a word being written.

**What changed about this bar.** Founder, 2026-08-04: *"we show how many reps were done, but we are
not showing how much weight was lifted last time."* The answer is **not** last time's weight — that
is a number she has to subtract from. **`↑1.5` IS the fact.** On the first set it compares to last
time; mid-lift it compares to the set before, because a Loop 1 correction is the change she has to act
on right now. **She is never shown both, and silence is the common case** — on most sets nothing moved
and the line is simply not there. The screen gets quieter as the lift goes on.

**The actions live together, at the foot:** `Complete set` (cream — light standing on the dark stage)
and `Edit` in the stage's own colour. What keeps the hierarchy is the fill, not the colour.

### 2.3 · The correction — the beat after a set

The set is written first, then the beat opens. Three outcomes, one instrument:

| Outcome | What is drawn |
|---|---|
| **Landed in the band** | Cream. The load holds. *(This is the most common case and it had no picture at all until 2026-08-04 — the band she is being measured against was invisible on the beat that measures her against it.)* |
| **Above the band** | The instrument's dot sits above the band in **moss**; the old load struck through, the raised load rising, **with the reps that earned it named**. |
| **Below the band** | The dot sits below in **blue**; the load eases, same treatment. |
| **Out of band, correction budget spent** | Says so. Honest, not silent. |

Dwell: an ordinary logged set holds ~1.4 s; a correction holds ~2.2 s — long enough to read the
change, short enough to stay one breath.

**The lift-done beat (2.3f/g):** every pip filled, **the lift named**, the band under it, and the
sentence. Founder photographed the version without a name: *"the exercise-finished screen shows a
black screen with only dots at the top."* The name is the floor.

### 2.4 · Rest

- **The hero is the rest she will get, not the one she just took.**
- A breathing ring (4.5 s cycle, scale 1.035) and the countdown.
- **Between sets, the news is the SET — not the lift.** The rest card carries only what is news: the
  eased/raised load in moss under an "Eased/Raised for you" pill. A corrected load is *news, not a
  reminder*.
- Controls: **+15 s**, skip.
- **2.4b · transition rest** — the lift she is walking to, its setup, and the swap disc for it.
- **2.4d · "Learned"** — shown **only when something was learned.** She left a rest she *changed* (cut
  short, or stretched), and her median moves. Not a verdict and not a question: the pace she actually
  rests becomes the prescription, and this is the product saying so on the way past.
- **The final seconds are felt, not flashed** — see §6.

### 2.45 · The end-of-session scan
Before the session closes, the app **reads every lift back**, one at a time. The work becoming
evidence.

### 2.9 / 13.1 · Paused
The stage held. Resume · End session · **and the pain door** (*"something doesn't feel right"*), sitting
under the two acts.

## 4.5 · What this session earned (2.5) — the close

Three beats:

1. **SESSION SAVED · "{workout} complete."**
2. **Hush READS the session** — each lift checks in.
3. **What this session earned.** "{workout} · SAVED", *"That's the work."*, three measured facts
   (**minutes · kcal · tonnes moved**), and then **the ledger**: one ruled line per lift the engine
   moved — its load's from → to on the end edge, and the sentence that earned it beneath, in the
   coach's italic serif.

**No confetti. No daily-streak pressure. No top-set card and no big stat figures** — those answer
"what happened?" with facts she already knows; she had just lifted that set. **What she cannot know is
what the engine DECIDED because of it**, and that is the one thing this screen exists to say.
**An empty ledger is still an answer**: every lift held at what she lifted, stated in a line rather
than left as a blank.

> This beat used to close with "what you lifted this week sets next week's loads" and point at
> Saturday. That was the old engine's rule. **v5 reverses it: the decision is made the moment the
> workout ends.**

**The poster (2.5b/2.5e).** The finish is a **poster, not a report** — the share card is generated
right here. When the session set a new best, **the record takes the hero** and the tonnage drops to
the row. When nothing changed, it is **a verdict, not a door**.

**Calories** are a declared estimate, honestly gated: `kcal = round(4.5 × bodyweightKg × hours)`.
**No bodyweight ⇒ no number** — Hush never invents a body to bill calories against; the stat simply
does not render.

## 4.6 · Milestone (2.6) — the one licensed loud moment

Four families, tuned so a consistent athlete sees roughly **one mark a month in year one** and rarer
after:

| Family | What it marks |
|---|---|
| **count** | Cumulative whole workouts — 10 · 25 · 50 · 100 · 250 · 500 · 1000. **Pure count, no streak mechanics.** A partial session is not a workout. |
| **tonnage** | Cumulative kg moved — 250 t (≈ Statue of Liberty) · 500 t (≈ an A380) · 1,000 t (≈ a freight train) · 2,500 t · 5,000 t · 10,000 t (≈ the Eiffel Tower) |
| **club** | A logged set at a landmark load on *her* club lifts — cut from her own answers, personal to her |
| **engine** | The engine proved itself: the **first time Hush raised a compound's load** (once ever), and a compound's working load **doubling** from its start |

**At most ONE per workout.** When several cross, the most personal is celebrated and the rest surface
quietly in the gallery. **A beat of black, a heavy stamp haptic, and the engraved emblem lands.**

**Rejected forever:** bodyweight-relative standards, e1RM marks, daily streaks.

## 4.7 · The Saturday letter (3.1) — Weekly Update

**Saturday decides nothing.** Every decision was already told at the moment it was born. Saturday is a
**mirror**. The week rolls at **Saturday 20:30 local** — a waking hour on the quietest evening of the
week, chosen so the roll can be *witnessed* (it was 23:59, and nobody ever saw it).

- **It opens with her name. This is a letter.**
- **The fact band:** `4/4 WORKOUTS · 46.8 t MOVED · 3,120 KCAL`.
- **It holds the CHANGES and nothing else** — one line at the end says the rest of the plan stands.
  (It used to print the whole week with changes highlighted inside it, so the news was buried in a
  list of things that were not news.)
- **Every changed row carries the word "Why?"** and unfolds to **Observation → Conclusion → Action.**
- **A steady week is the engine being right, so it says so and PROVES it** — the lifts that have moved
  the furthest since day one, in her own numbers. *Trust me — here is the evidence.* (Founder: *"if
  there is no change, do not leave the screen empty — that reads as no progress."*)
- **Structural changes are named too** — a graduation, a rotation, an adopted swap, a volume move
  (shown as a muscle row with its why).
- **The one question (3.1b).** Once per muscle, ever: *"{Muscle} has been off a while. Want it back?"*
  — asked only for a muscle she has actually trained, one at a time, and **either answer retires it
  forever.** One tap and the muscle resumes with all its history.
- **Read-only.** No accept / reject / undo. A load coming down is *"matched to demonstrated
  capability, sets kept"* — never a setback, never red.

## 4.8 · Progress · Lifts (3.2)

- Header: serif "Progress", with **Log** beside it.
- **THE BOARD** — six things she has earned, a row each, opened by its own mark in moss.
- **EVERY LIFT** — one row per trained lift: where it started, where it stands, what it gained.
- **A lift row opens its own card (3.2b)** — its climb, the marks it crossed, and the engine's stamped
  log for it.
- **Day one (3.6b):** before any workout is logged there is nothing measured to draw, and Hush shows
  only what was measured — so the page says so, over a ghost of the graph to come.

> Founder, 2026-08-04: *"I'm not sure how much we even need the Progress screen versus just keeping
> the logs. Right now it looks like a banal graph with a collection of milestones."* The reason is
> named in the code: **the screen reports, it never claims.** This is an open design target — see §16.

## 4.9 · Progress · Log (3.3) — the ledger

A single reverse-chronological timeline of everything recorded — **completed strength sessions and
recorded cardio together**, in **month chapters** ("July" in the coach's serif):

- a date column — weekday (sans) over the day number (mono)
- the name — "Upper A" / "Run · 4.2 km" — with a meta line ("6 lifts · 52 min", "318 kcal · 141 avg hr")
- a trailing mark — strength: **"3 UP"** in moss (the raises that session); cardio: **"RECORDED"**
- a chevron into the read-only record

**The ledger speaks in mono**, because a ledger's columns are *readings*, not prose, and they have to
align down the page. Durations read in **minutes**, never as a clock ("52 min", not "0:52").

## 4.10 · Cardio (3.4)

**Recorded. Celebrated. Never an engine input.** Nothing about Tuesday's 5k can factually say what to
put on the bar on Wednesday, and any such link is a fatigue theory.

- **3.4a Ready** — the one question: **outdoors or a belt.** Walking vs running is **measured, never
  asked** (derived from pace, per segment).
- **3.4d Countdown** — 3·2·1·GO. **Haptic, no audio** — the phone is in a pocket or on an armband.
- **3.4 Live** — the elapsed clock as the hero; a **1,000 m band** whose dot travels the current
  kilometre with its metres riding under it in moss; one readable row — **kilometre · heart · burn**;
  a split pill when a kilometre logs; a single cream **Pause**.
- **3.4e** — a run her programme prescribed: the band is the whole distance and **the phone ends the
  run itself** instead of asking her to confirm a distance it is already measuring.
- **3.4c Done** — centred like a milestone: "Cardio · saved", *"That's the distance."*, the distance
  alone in the light, three facts (time · kcal · avg hr), one cream **Done**. A poster is generated
  here too.
- **4.9 The run, drawn** — the engraved path a GPS run leaves behind.

**Honesty gates:** a fix worse than a threshold accuracy is discarded; a speed below a floor is
discarded (a founder-reported defect: sitting on a chair indoors recorded 0.07 km); a pace faster than
120 s/km is clamped rather than drawn. **Too short for a pace → no pace line, no bars, and no zeros
standing in for them.** A run under a minute with no distance is a false start and is **never
recorded**.

**Background GPS** runs through a TaskManager task, not a React hook — an athlete who pocketed her
phone and ran 10 km used to come back to 0.00 km.

## 4.11 · You (4.0)

Identity (avatar + name) with **Membership directly beneath it** — who you are + your plan, one zone.
Then grouped rows: **Preferences** (Units, Language) · **Health** (Apple Health) · **Account** (Body
data, Body map, Exercise library, Import, Share plan). Sign out + Delete account at the bottom. The
version reads the real version from the binary, under the product's own thesis — **"Built on facts."**

There is **no Experience row** — the concept is deleted; the first set measures her.

## 4.12 · Body map, hers to change (4.1)

The map **is a place**, not an onboarding step. Per muscle: **off / normal / lead**, the **rep band**,
and — when one is running — **the rest window a pain report opened, with the days left on it**.

Two rules only this screen can break, and must not:
- **An OFF is obeyed in SILENCE.** The one "want it back?" question is asked later, once, at the
  Saturday mirror. **Never as a confirm in front of the toggle.** This screen does not argue with a
  choice she is making right now.
- **The map that is saved is the map she DREW** — whole-object, never merged.

## 4.13 · Exercise library (4.1b) and Import (4.2)

**The library** has two verbs: **pick** (this one over that one) and **refuse** (never deal me this).
- **A pick LEADS its muscle; it never ADDS a seat.** The hour is fixed and volume is still earned.
  The screen says so: *"A pick takes the first seat for that muscle. How many of them fit is decided
  by the muscle's volume and your hour."*
- **Refusing the last lift of a muscle she left ON is refused, with a sentence.** She asked for the
  muscle to be trained and then refused everything that trains it — silently ignoring the tap is the
  failure mode this codebase keeps finding.
- Only lifts the assembler can actually deal are listed. (Swap-only lifts exist to be substituted in
  when a station is busy; listing them would let her pick a lift that then cannot appear.)

**The import (4.2)** — photograph a coach's sheet or type it out. Four steps: **READ** (the model, and
this is its only job) → **MATCH** locally and deterministically against 117 catalogue lifts and their
synonyms → **ASK** the model about leftovers only, if there are any → **REPORT.**

**4.2a · What we found in it.** A list of everything about her week that breaks a Hush rule — a
74-minute Monday, a muscle under the effective dose, six sets where the ceiling is five. **Nothing is
fixed. Only named.** She chooses: **keep my week**, or **let Hush balance it**. If she keeps it,
**nothing in the engine may ever touch its shape again** — the engine manages the loads inside a week
it did not write. That promise is the door to the coach track, and a law test enforces it.

A wrong match is worse than no match, so matching is conservative: an exact hit on the id, the name,
or a declared synonym. Anything less confident becomes **a question, never an answer.**

## 4.14 · Paywall (4.3)

> Founder, 2026-08-13: *"אני חושב שצריך לשנות אותו ולהסיר את כל המלל הזה… ופשוט להגדיל את שני
> הכרטיסים ולשים אותם במרכז ותעצב אותם כמו שעשית לשאר הכרטיסים באפליקציה. גם למה הלבן הזה בתוך הכרטיס
> — מאיפה הוא הגיע בכלל?"*

Three ruled "promises" and a renewal sentence were removed: **a person who has trained with the app
for fourteen sessions does not need to be told the coach decides her weights; she needs to know what
it costs.** The white "paper" card was the only object in the product using that trick, on the one
screen where trust matters most.

**Two tall, equal, centred cards** in the shape she has already used to pick her sex, her units and
her language. Prices come from the store, localized, never assembled. The annual card's per-month
figure is the store's own label with its numeral divided — **absent rather than guessed** when the
label won't parse. Dismissible ("Maybe later" in words, not only an X).

## 4.15 · Share cards (9.1 / 9.2) and plan sharing (11.4 / 11.5)

**9.1 Personal record** — one lift, its new best load × reps, the step up from the previous best, and
how far it has come since Hush first saw it. **A record card exists only when the latest session
actually set a new all-time working-weight PR.** No card ⇒ nothing worth showing, and we say nothing.

**9.2 Week complete** — the week's shape (which days were trained), the tonnage, the calories, and the
honest change vs the week before.

Posters are the one place the old lit-from-above gradient survives — a poster rendered on absolute
black has no edge against a phone's own black screenshot.

**11.4 Share your plan** — *"send someone the shape of your week."* The split, the lifts, the rep
bands. **Her weights and her body data never travel with it** — the payload is an allow-list, and a
test reads the encoded token back as text to prove no load appears in it. **The card in the middle IS
the payload, rendered**, so she can read exactly what she is about to send. The privacy line sits
*inside* the card it describes.

**11.5 Plan, received** — the same card, with Adopt / Decline.

## 4.16 · The states around the edges

- **10.1 · Welcome back** — after a gap. Her current loads, drawn honestly (they may have eased — see
  §3.10). The guarantee it states: **being away is not punished here, and the bar decides the rest.**
- **10.2 · Lapsed** — read-only. Her history, her records, her plan, all still there. Nothing is taken
  away; she just cannot start a new session.
- **10.4 · On your wrist** — for the athlete who got a watch since. **10.4b** — the same, when
  auto-install is off on her iPhone.
- **2.0 · First workout** — "we're learning your gym", once per install.
- **13.2 · Something hurts** — see §3.11.

---

# PART 5 · NOTIFICATIONS — THE COMPLETE CATALOGUE

> **Founder, 2026-07-29, closing the question:** *"I do not want a reminder. At all. Only: rest about
> to end, rest over, the Saturday update we designed, and one for each kilometre in cardio."*

**That is four, and it is exhaustive. THERE IS NO REMINDER, of any kind, ever.**

All are **LOCAL** notifications — no push server, no APNs. Calm defaults: **no sound, no badge**
(except where noted). All copy flows through i18n and is gendered.

| # | Notification | When | Behaviour |
|---|---|---|---|
| **1** | **The Saturday letter** — *"עדכנתי את התוכנית שלך."* / *"קראתי את מה שהרמת השבוע — השבוע הבא מוכן, עם מה שהשתנה ולמה."* | **Saturday 20:30 local, weekly, repeating** — the exact instant the new week opens | The ONE recurring calendar push this product sends. No sound, no badge. A tap opens the Weekly Update. Idempotent (one stable id, re-scheduled every boot, never stacks). |
| **2** | **Kilometre logged** — *"קילומטר {km}"* / *"{pace} — נרשם."* | The instant a split closes on a run | **Not scheduled — delivered now**, so a pocketed phone says it. Each km is its own note (coalescing would erase km 3 the moment km 4 landed). **Suppressed in the foreground** — the on-screen moment is already saying it. No permission prompt during a run, ever. |
| **3** | **Rest ending** — *"עוד רגע" / "7 שניות — התכונן."* | 7 s before rest ends | The **locked/background backstop** for a countdown JS timers cannot run. `timeSensitive` so it pierces the lock screen and Focus. **Stands down entirely while a Live Activity is up** — the countdown is already on the lock screen, and two alerts for one moment is a pile. |
| **4** | **Rest over** — *"המנוחה הסתיימה" / "קדימה."* | At the rest instant | Always fires (a glanceable ring reaching zero is not the same as being told to go). `timeSensitive`. |

**Silent when the wrist is buzzing.** The alerts are *always scheduled* — a locked phone must light up
— but when the watch is reachable the **wrist owns the buzz** and the phone's alert is scheduled
`sound: false`. It still breaks through the lock screen and lights the display. No double buzz, no
dead screen. (The old rule "watch reachable → the phone schedules nothing" silenced the phone for
every athlete who merely *owns* a watch — the exact reported defect.)

**Foreground suppression.** In the foreground the in-app Core Haptics countdown fires, so the handler
presents nothing for `rest_*` — no double buzz, no banner over the stage.

**Receipts are NEVER notifications.** They surface in-session only.

**8.2 · The honest ask.** iOS grants one system prompt, so it is only ever spent on someone who has
already said yes in plain language. The pre-ask is shown **once, right after her first session** —
never at onboarding, before value is felt. It **lists exactly what we send**, read off the real
behaviour: the Saturday letter, the rest-ending tap, **and a third row that is struck rather than
ticked — what Hush will never send.** "Allow" opens the system dialog; "Not now" leaves the permission
untouched and never asks again. **No dark patterns, no pre-checked traps.**

**Retired notes are actively cancelled on boot** — deleting the code that schedules a repeating note
does not cancel the note already sitting in iOS's queue.

---

# PART 6 · HAPTICS — THE COMPLETE TAXONOMY

**Hush never uses the buzzy iOS notification haptic.** Transients only — impact and selection. The
phone mirrors the watch taxonomy so the two surfaces feel like one instrument.

### The in-workout five — tellable apart by rhythm alone, wrist-down, without looking

| Event | Pattern |
|---|---|
| **Workout start** | one confident **medium** tap as the stage takes over |
| **Set logged** | **one light tap** |
| **Rest over** | **soft → medium**, a soft ascending double — the "go" |
| **New exercise begins** | **medium · medium · medium**, a gentle-firm triple |
| **Workout close** | **soft · soft · [pause] · heavy** — the signature |

### The rest "Approach" countdown

Escalating single taps over the final seconds, at **7 · 3 · 2 · 1**, resolving into the GO:
`soft → light → medium → rigid`. **Awareness, not alarm.** One soft whisper at 7 s gives her an
unhurried window to wrap up and approach the station; the rising 3-2-1 builds readiness so she
launches into the set on the GO **without staring at the screen.** All single transients, distinct
from every other workout haptic.

### The three named textures the whole app shares

| Texture | Pattern | Meaning |
|---|---|---|
| **tick** | one light transient | a thing was scanned / counted / passed |
| **success** | medium · medium (90 ms apart) | something she DID landed and is now a fact — a profile saved, a run finished, Health connected, the programme built. **Never the in-workout logged set.** |
| **warning** | heavy · medium (260 ms apart) | an unusual, hard-to-undo action is underway — finishing a workout early, ending a run. The beats are FAR apart, so it reads as a hesitation rather than a confirmation. |

### The rare ones

| Event | Pattern |
|---|---|
| **Milestone** | **heavy · rigid** — a plate locking onto the bar. One heavy strike as the emblem stamps in, then a short rigid settle. The one licensed loud moment; rare by construction, so its weight stays meaningful. |
| **Week complete** | **soft · soft · medium** — a settling, not a stamp. Like something being set down. |
| **Cardio countdown** | rising per number (soft/light/medium), then a **sustained heavy double** on GO that cannot be mistaken for a count beat. **No audio, ever** — the wrist is the surface that works with the phone in a pocket. |
| **Wheel detent** | selection tick — the lightest thing in the product |
| **Confirm** | one light tap (swap chosen, sheet acknowledged) |

---

# PART 7 · MOTION & ANIMATION (AS BUILT)

**One physics: the settle.** Everything eases on `cubic-bezier(.22, 1, .36, 1)`. No bounce, no
overshoot, with exactly one exception — the brand dot's land.

**Durations:** `instant 80 · 120 · 180 · 240 · 360 · 600 · land 900 · breath 4500` ms.

| Motion | Spec |
|---|---|
| **Press** | settles to **0.98 scale** and back over 120 ms. Never a glow, never an opacity dip. (A press changes the *surface*, not the ink — a law: `aPressNeverDimsWhatYouPressed`.) |
| **Rows arriving** | rise **40 ms apart**, staggered |
| **The rest ring** | breathes at **4.5 s**, scale **1.035** |
| **The brand dot** | lands in **900 ms** |
| **The stage composing itself** | when a set is presented, the stage assembles rather than cutting. **This is not decoration** — it marks the beat. |
| **Reduced Motion** | honoured throughout (`platform/reducedMotion`) |

**Procedural exercise animation.** There is a built motion system (`src/motion`) that draws
anatomically-scaled figures performing lifts as pure vector primitives — an athlete rig, true-scale
ghost plates (a 45 cm plate is r=16 against the canonical figure), a dashed **bar-path range
statement** with a tick at each endpoint, and a ground shadow. **18 lifts have rigs today** (bench,
squat, row, lat pulldown, five horizontal presses, four vertical presses, five rows). Falls back to
the video seam, then a static silhouette. Rules: one pencil, one duotone (near limbs darkest, trunk
mid, far limbs lightest, equipment lighter still), **no accent hue in a clip** — the range statement
is stated by *line type* (dashed), not by colour, because nothing else in the frame is dashed.

**No demo videos ship.** Each exercise carries exactly **three plain-language technique cues** — a
reminder, never a lesson.

---

# PART 8 · THE DESIGN SYSTEM AS IT STANDS

*(This is what exists. The redesign is expected to replace most of it — but every LAW below has a
reason attached, and the reasons survive a repaint.)*

## 8.1 Direction: "ALL DARK · ONE LIT STAGE"

Paper was retired as a *background*. Every screen sits on the same dark stage; paper survives only as
small cards and pills.

**Three colours, plus light:**

| Token | Value | Role |
|---|---|---|
| **Stage** | `#000000` | The ground, everywhere. **Absolute black** (founder, 2026-08-05: *"take the blackish background to absolute black. I think everything will stand out better that way."*) |
| **Raised on stage** | `rgba(241,238,229,0.05)` → `.10` → `.14` | Cards, tracks, wells — cream washes, not new colours |
| **Paper** | `#f3f0e8` | Cards and pills ONLY, carrying dark ink. A resource, not a canvas. |
| **Moss** | `#a9c49f` lit / `#3e573f` deep | **THE accent — "a decision made."** A selection, the brand dot, a tick that landed, a live ring, a toggle that is on. |

**Cream — the ink of the whole app:**
`#f1eee5` primary (16.9:1) · `#a8a290` secondary (8.1:1) · `#8b8474` muted (5.4:1). There is **no
legible tier below the muted one**, and a law test sweeps for anyone who invents one.

## 8.2 The direction law

> **Founder, 2026-07-29:** *"I want this to be a law in the whole app, even on TODAY or on any other
> screen: **down = blue, hold = our cream, raise = our green.**"*

| Direction | Colour | Reason |
|---|---|---|
| **Up** | moss `#a9c49f` | a raise |
| **Down** | **blue** `#7eb2d6` | **A fall is not a failure.** An eased load is the engine doing its job — Loop 1 saw the reps and matched the weight to the body that showed up today. Told in clay it lands as a demotion, and the athlete learns to dread the one moment the product should be trusted for. Blue is the colour of care rather than alarm, and it can never be confused with a warning. |
| **Hold** | cream `#f1eee5` | The load did not move because nothing asked it to. **No hue, no verdict, no implied direction.** (It was grey — a fourth answer to a three-answer question.) |
| **Pain / destructive** | clay `#c56a4e` | **The only thing pain and destruction may draw in.** Never a direction; no load ever wears it. |

**One home for the mapping.** A surface that draws a direction *asks*; it never picks a hue. A law
test (`everyDirectionIsDrawnByTheLaw`) sweeps the source for anyone who tries. This was written after
the Saturday letter drew an eased load in **moss** — the colour of a raise, which is worse than red,
because it says the engine did the opposite of what it did.

## 8.3 Three voices

| Face | Carries | Rule |
|---|---|---|
| **Assistant** (sans) | Everything the product *says* in UI chrome | Full Hebrew |
| **Frank Ruhl Libre** (serif) | The coach's voice — headlines, the programme's name, the letter's chapters, the reasoning | Full Hebrew |
| **IBM Plex Mono** | **Every FACT** — loads, reps, timers, units, all-caps eyebrows and legends | **Figures only, never translated words** (see §9) |

## 8.4 The type floor — **17 px**

> **Founder, 2026-08-12:** *"הכיתוב הקטן ביותר במסך מאוד מאוד קטן… אני אמרתי לך את זה בערך 999 פעמים.
> בוא נגיד שהגודל הקטן ביותר בכל האפליקציה הוא כמו שכתוב 57.5 ליד הBarbell bench press. יותר קטן מזה
> פשוט לא רואים — זה בלתי אפשרי, אל תשכח שזה מסך של פלאפון."*

**269 declarations across 49 files were under the floor.** It is a law now, enforced on every file in
`src` by `typeHasAFloor`.

Scale: `17 · 18 · 20 · 24 · 30 · 38 · 44 · 64 · 84 (data)`. Four names (`2xs`/`xs`/`sm`/`base`) all
resolve to **17** — below 17 there is no room for steps on a phone, so there is one small size and
the names survive only so 200-odd call sites need not be rewritten.

**Why the floor is a gym floor:** the phone is on the floor or propped on a rack, she is two paces
away, her eyes are moving and her heart is at 150. Eleven points is decoration there, not information.

## 8.5 Geometry

- **Strict 4 px spacing grid.** Screen gutter **26**.
- **Radius:** control 14 · button **19** · card **22** · sheet 24 · pill 999.
- **Controls:** small 34 · default 46 · **primary action 58**.
- **Elevation:** deep, warm, low-alpha — on the dark stage a lift is **felt, not seen**.
- **The primary button is CREAM** with ink on it; the secondary is the stage's own colour with a
  hairline. Hierarchy is carried by **fill**, never by colour.

## 8.6 The component set

`Arrive` (staggered entry) · `Avatar` · `Badge` · `Button` · `Climb` / `GhostClimb` (the lift's
progression curve, and its day-one ghost) · `IconButton` · `Legend` (the mono eyebrow, which picks its
face from the *string*) · `LoadDelta` · `Metric` · `RestRing` · `SegmentedControl` · `Sparkline` ·
`Stage` · `Switch` · `TextField` · `Toast` · `Type` (Display/TitleL/Title/BodyL/Body/Caption) ·
**`WheelPicker`**.

Plus: `BodyMapFigure` (the pressable body) · `BottomSheet` · `ExerciseDemo` · `HushMark` ·
`Icon` (≈45 named glyphs) · `MilestoneEmblem` / `MilestoneGlyph` · `PausedStage` · `PlanLifts` ·
`RangeMark` (the brand's measured-range glyph) · `RouteTrace` · `SwapSheet` · `WeekColumn` ·
`WhyChangedSheet` · `WhyHereSheet`.

**Every wheel in the app is the same wheel** (a law). Its detent is **the equipment's own increment**,
not a flat 0.5 — a flat detent let a founder log `41.5 kg` on a barbell bench press, which does not
exist in any gym.

---

# PART 9 · HEBREW & RTL

**Hebrew is a first-class language of this product, not a translation layer.** 2,261 Hebrew keys
against 1,349 English ones — because Hebrew carries **273 feminine variants** the English source does
not need.

## 9.1 Grammatical gender — the whole app changes person at once

Hebrew has no neutral second person: **every verb Hush addresses the athlete with is conjugated
masculine or feminine.** Writing one form and hoping is what shipped once, and it is wrong for half
the athletes.

- Sex is asked on the **first answering screen**, above the wheels, so the copy layer has it **before
  the first sentence is rendered.**
- Every lookup carries the athlete's gender as i18next's `context`. `t('pain.whereSub')` resolves
  `pain.whereSub_female` for a woman and falls back to the base key when no feminine form was
  authored. **No screen passes anything.**
- **Surfaces that are not screens** — notifications, rest haptics, the Live Activity — cannot use a
  hook, so they use a dedicated gendered lookup reading the same store. They were the one place still
  speaking to every athlete as a man: a woman's rest-over notification said *"התכונן"*.

Example, live in the product:
| Masculine | Feminine |
|---|---|
| `הקש על האזור — אני אף פעם לא מבקש ממך לאבחן.` | `הקישי על האזור — אני אף פעם לא מבקשת ממך לאבחן.` |
| `ספר לי מה כואב ואני אקח את זה מכאן.` | `ספרי לי מה כואב ואני אקח את זה מכאן.` |
| `7 שניות — התכונן.` | `7 שניות — התכונני.` |

## 9.2 RTL layout

- The device language decides, unless she has set an override in **You → Language**. Switching is
  instant for text; iOS applies the full mirror after reopening, and the app **says so**.
- **Every text style declares an alignment.** `textAlign: 'left'` renders at the **start** of the line
  (right, in Hebrew); `'right'` renders at the end. An *omitted* alignment is `NSTextAlignmentNatural`,
  which React Native does **not** flip — it silently locks to the physical left. A lint rule fails the
  build on a `fontFamily` without an alignment, because "no alignment" is not a neutral default.
  (Founder device review: *"every screen is stuck on the left in Hebrew."*)

## 9.3 Bidirectional text

An English (LTR) run inside a Hebrew (RTL) sentence is a bidirectional string; without isolation the
Unicode BiDi algorithm reorders adjacent punctuation and numbers — a trailing "." jumps to the wrong
side. Any canonical English run interpolated into a translated sentence is wrapped in a **First-Strong
Isolate**. A name rendered alone in its own text node needs no wrapping.

## 9.4 The mono law

**IBM Plex Mono has no Hebrew glyphs.** A Hebrew string routed through it falls back mid-line to
whatever the OS can draw.

- **Mono carries figures, never words** — digits, ×, :, /, kg, lb. Enforced by `monoCarriesNoWords`.
- The legend component **asks the string, not the locale**: a legend the mono face can actually draw
  gets mono; anything else gets sans. **English reads exactly as designed; Hebrew never breaks.**

## 9.5 Exercise names — the split that took until 2026-08-21 to find

> Founder, photographing the workout stage: the muscle above the lift read **"יד אחורית"** and the
> lift itself read **"Triceps Pushdown"**.

Every exercise name was an English literal in the catalogue, and the Hebrew locale had **no `exercise`
namespace at all.** The app conjugated its verbs by gender, linted its copy, refused to let mono carry
a Hebrew word — and then printed the **114 words the athlete actually reads under a bar** in a language
she did not choose.

**The split, now enforced by two law tests:**
- The catalogue keeps its **English `name`, because that field is DATA** — the import matcher reads a
  photographed plan's raw text against it. Translating it would break an import.
- **The locale holds the spoken name**, and one function is the only door between them.
- The second test matters as much as the first: `x?.name ?? displayName(id)` reads like a safe
  fallback and is in fact a **bypass** — the catalogue always answers, so the locale never gets asked.
  Five of those were on the workout stage.

Muscle names have the same law (`aMuscleIsCalledWhatSheCallsIt`), and dates speak her language, not
the device's (`everyDateSpeaksHerLanguage`).

## 9.6 Copy namespaces (63 of them)

`common · weekly · home · cardio · ob · start · menu · choose · calibration · workout · finishSheet ·
reasonSheet · editResult · pauseSheet · why · whyHere · budgetNote · weekNotice · whyLoad · rest ·
pause · finishConfirm · technique · wellDone · complete · milestones · share · load · firstGym ·
portrait · capability · capabilityLoad · muscle · program · swap · equipment · report · progress ·
history · profile · settings · language · errors · notifications · watch · paywall · explain ·
profileEdit · exec · cues · nav · pain · notifAsk · onWrist · comeback · lapsed · planShare ·
planReceived · weekday · plan · import · library · exercise`

**No string literal may appear in a screen or component.** A copy lint runs against the source
resource and enforces the voice laws: **no exclamation marks, no emoji, no hedge words, first-person
indicative.**

---

# PART 10 · APPLE WATCH

A full native watchOS companion (Swift), with its own locked specification.

## 10.1 The design language

- **Pure black background.** Text in **three white opacities**. **One warm accent**, reserved for the
  coaching voice and the live rest countdown — **the accent is how you know Hush is speaking.**
  No status green/red/amber palette.
- **Exactly ONE hero per screen** (~52–60 pt, tabular, SF Pro Rounded semibold). Hierarchy is carried
  by **size and opacity, not colour.**
- **One tap per action.** Never a menu, never a precision target.
- **No navigation tree.** No tabs, no back, no scroll-to-find. **The workout is the only navigation
  and it advances on its own.**
- **The Digital Crown is inert during training** — rest is Hush-owned and not adjustable. Its one
  purpose is the rep-adjustment screen.
- **No swipes, no force-press, no hidden gestures.** Every action is visible.
- **Strict no-scroll requirement.** Every screen fits on a single watch face on the smallest supported
  watch. If a state cannot fit, **simplify content until it does — never add a scroll.**

## 10.2 Deliberately absent

**No heart rate, calories, rings, charts, exercise list, music, maps, or streaks. No session or
exercise progress** (`Exercise 3 of 7`, `3 / 14`) — it is not actionable and does not help the next
rep. **If it is not the next thing to do, it is not on the watch.**

**One set-language form across the whole experience: `Set 3 of 4`.** Never `3 / 4`.

## 10.3 The states

Active Set · Inter-Set Rest · **Exercise Complete** (a transition beat) · Transition Rest ·
**Exercise Busy** (one tap, no menus) · **Couldn't Complete → rep adjustment** (the Crown's one job) ·
Paused · Workout Complete · **Connection Lost (the trust state)**.

## 10.4 Locked copy (verbatim, founder-approved)

| Context | Copy |
|---|---|
| Inter-set rest | `You can do this.` |
| Transition rest | `Let's go.` |
| Exercise complete | `<Exercise> Complete` |
| Primary action | `Complete Set` |
| Secondary action | `Couldn't Complete` |
| Rep adjustment | `Actual reps` / `Target {{reps}}` / `Confirm` |
| Finish | `Finish Workout?` / `No` / `Yes` |
| Close | **`Well Done.`** *(the period is part of the copy — the Hush identity close, never reworded)* |

## 10.5 Authority

**The phone is the sole authority.** A watch tap gives instant local acknowledgment (haptic + subtle
settle) so it never feels laggy, but **the screen advances only when the phone confirms.** Taps cannot
double-count or land on the wrong set. Anything the phone cannot confirm shows as *Reconnecting* —
**never as a false success.**

The watch can also run a **standalone plan** when the phone is not reachable, carrying her learned
rest times with it.

A **complication** ships alongside.

---

# PART 11 · LIVE ACTIVITY / DYNAMIC ISLAND / WIDGET

Two activity kinds, mirroring the Dynamic Island grammar (compact pill + expanded panel + lock-screen
card):

**`strength`** — the live workout. `set / rest / transition / paused`. Workout name, exercise name,
set index and count **as numbers** (the design draws a dot row, which a localized string cannot be),
lift ordinal and count, target weight and reps, the upcoming exercise during a transition.
The rest countdown is driven by an **absolute end instant** so SwiftUI's timer is drift-proof under
update latency. **No completion control from outside the app** (data integrity). **No HR or calories**
— the strength engine never reads them.

**`cardio`** — running / paused, with **pace · calories · heart** and the latest kilometre split.

**While a Live Activity is up, the 7-second rest warning notification stands down** (§5).

---

# PART 12 · SENSORS

- **Apple Health** — optional, offered once, on a card that *is* the control. It may propose a
  **bodyweight** for display; **it never touches a lifting load or the model.**
- **Heart rate** (watch) — recorded and displayed on cardio and in the record. **Never an engine
  input.**
- **GPS** — outdoor runs and walks. Background TaskManager task, honesty gates, per-segment pace →
  gait (walk vs run is **measured, never asked**), per-kilometre splits, an engraved route trace.
- **Core Motion** — **treadmill runs are measured too** (founder, 2026-08-12). Indoors vs outdoors is
  a **sensor** difference, not a product one: one screen, one record, one poster, one calorie model.
- **Keep-awake** during a workout and a run.

---

# PART 13 · SUBSCRIPTION

- **14 free completed sessions**, then a paywall blocks *starting* further sessions.
  The arc: **I LEARN YOU (1–4) → I KNOW YOU (5–14).**
- A **partial session that leaves the workout open does not burn a free session** — an athlete who
  finishes that workout on a second visit must not pay twice for one workout.
- **The trial counter is NOT on Home by default.** It became news, not a countdown:
  > The counter sat under Home's one act, so the last thing she read before training — every session,
  > from the first — was how few she had left. That is a countdown to a paywall printed on the daily
  > screen of a product whose whole argument is that it is a coach rather than a funnel.
  >
  > **It is not deleted, because running out without warning is worse.** It appears as news near the
  > end — the same rule the load already follows: say nothing until there is something to say.
- **Lapsed = read-only**, never deleted. Her history, her records and her plan stay.
- Prices come from StoreKit, localized. Nothing is hardcoded (a hardcoded "50% off" becomes a lie the
  day pricing changes, in a place where being wrong is a legal problem).

---

# PART 14 · DATA & PRIVACY

- **Local-first.** Everything works offline; a completed workout never depends on the network. Backend
  sync is best-effort and queued.
- **A session is SAVED before Well Done ever renders** — an invariant.
- **A shared plan is an allow-list**, and a test reads the encoded token back as text to prove no load
  or body datum appears in it.
- **No migration, ever, from v4** — the testers were recreated clean and told so.
- Telemetry is event-based and carries no copy strings.

---

# PART 15 · THE HARD CONSTRAINTS

**These are the things a redesign must not break.** Each is enforced by a test that fails the build,
and each exists because it was once broken in production.

| # | Constraint | Why |
|---|---|---|
| 1 | **Every screen shows the ENGINE's number.** No screen may compute or round a load itself. | Two accountings of one week is how the letter said "steady" while Home said "updated". |
| 2 | **A moved load always opens its reason.** Every lit figure can explain itself. | A conclusion with no argument behind it is the AI behaviour this product exists to replace. |
| 3 | **down = blue · hold = cream · up = moss**, from one function, everywhere. | An eased load drawn in moss says the engine did the opposite of what it did. |
| 4 | **Mono carries no words.** | Hebrew falls back mid-line. |
| 5 | **Nothing on a phone is smaller than 17 px.** | It is a gym floor, two paces away, at 150 bpm. |
| 6 | **Paper tones stay off the stage; stage tones stay off paper.** Contrast holds on both. | Deep moss on the dark stage reads 2.2:1 — invisible. |
| 7 | **Every screen is reachable from a real door**, and everything built can be reached. | A feature is out when nothing reaches it, not when its button is hidden. |
| 8 | **The AI is reachable from the import and nowhere else.** | Three AI surfaces survived a deletion order for four days because each had been added on a real request. |
| 9 | **A question never blocks a workout.** | Training is never gated on a prompt. |
| 10 | **An `off` is obeyed in silence.** No confirm sheet in front of a toggle. | The app does not argue with a choice she is making right now. |
| 11 | **Say it when it is news.** Silence on a steady set is correct. | The screen gets quieter as the lift goes on. That is the product's manner. |
| 12 | **A press changes the surface, never the ink.** | A dimmed label reads as "disabled", not "pressed". |
| 13 | **A week she brought is not ours to rewrite.** | It is the door to the coach track. |
| 14 | **No screen counts itself down** (no artificial timers pressuring her). | |
| 15 | **No exclamation marks. No emoji. No hedge words. First person, indicative.** | The voice is a coach who was there, not a cheerleader. |

---

# PART 16 · THE DESIGN BRIEF

*This section is the ask. Everything above is the material.*

Take Hush to the level of the best-designed apps in the world — while keeping every law in §15 and
every engine behaviour in §3 intact. The specific targets, in the founder's own priority:

### 16.1 The gym screens must be unmistakably clear
The live workout stage is where she spends **95% of her time**, at two paces' distance, mid-set,
heart at 150. **Type must be large, bold, and unambiguous.** Every figure labelled. Every band
separated. Nothing decorative competing with the two numbers that matter. *This screen is the
product.*

### 16.2 Use the whole screen
> *"ניצול מלא ומושלם של כל האיזורים במסך ולא לדחוס הכל לחלק אחד."*

The codebase already carries the founder's own diagnosis of this failure twice — the fork screen
(*"you leave a huge empty space in the middle with a small sentence at the bottom that nobody will
read"*) and the set screen (`marginTop: 'auto'` making an empty middle third). **A screen whose whole
content is a choice must be MADE of the choice.**

### 16.3 Show, don't write
> *"העדפה להראות במקום לכתוב כי העין של בן אדם אוהבת לצפות במקום לקרוא."*

The engine already produces the facts to draw instead of state:
- **`↑1.5` instead of "last time 32.5 kg"** — already the law on the stage; extend it everywhere.
- **The set rail** (position IS the set number) instead of "Set 3 of 4".
- **The band instrument** with her sets sitting on it, and last time's ghosted beneath — she sees she
  is a rep down without a word being written.
- **The week column** with an opening row instead of a to-do list.
- **The plate breakdown** instead of the arithmetic.
- The **rig library** (§7) is an unfinished asset: 18 of 117 lifts have procedural motion. Finishing
  it, or replacing it with something better, is the single largest "show instead of write" win
  available.

### 16.4 Finish screens people want to post
> *"מסכי סיום אימון מהיפים והויראליים ביותר בעולם כך שזה יעזור לתפוצה שלנו."*

The finish is already a **poster, not a report**, and the share card system already exists (record
card, week card, cardio card). The material is there — a personal record with its step up and its
distance travelled since day one, tonnage in real-world objects, a milestone emblem, an engraved run
route. **The design target is a poster that is worth posting without a single exclamation mark.**

### 16.5 Injuries, handled better than anyone
Three severities in her own words, a rest window that **expires and lifts itself**, a movement-pattern
ban that survives every path, and a swap that costs her nothing. **No diagnosis, no alarm, no red.**
Clay is the reserved colour. The design task is to make this feel like *care*, not *damage control* —
and to make the body map the place where the whole state is visible and editable at a glance.

### 16.6 The programme, presented and managed better than anyone
Today's week column, the pre-workout card, the Saturday letter and the body map are four views of one
object. The engine gives the designer more to work with than almost any app of this kind: **every
change carries its own reason, every load carries its own history, every muscle carries its share of
the week, and every decision is reproducible.** The design opportunity is to make the *management*
visible — that a coach is holding this — without a single screen turning into a dashboard.

### 16.7 Controls, icons, motion, haptics
- **Controls:** one wheel, one switch, one segmented control, one button — used everywhere, at world
  class.
- **Icons:** ≈45 named glyphs today, mixed provenance. This is the weakest layer in the product and
  should be redrawn as one family.
- **Motion:** one physics (the settle) is already the right instinct — extend it into the beats that
  currently cut.
- **Haptics:** the taxonomy in §6 is complete and rhythm-distinguishable wrist-down. Preserve it.

### 16.8 Unforgettable moments
The product deliberately budgets its loud moments and keeps them rare:
1. **Loop 1 correcting the load mid-lift** — the signature moment, and the one thing no competitor has.
2. **The milestone stamp** — heavy strike, engraved emblem, one per workout at most.
3. **The finish poster.**
4. **The week closing into Recovery.**
5. **The Saturday letter arriving at 20:30 while she is awake.**

Everything else is quiet on purpose. **The rarity is what makes them land** — a redesign that adds a
sixth moment weakens the other five.

---

# PART 17 · APPENDIX

## 17.1 Catalogue

**117 exercises.** By muscle: Back 19 · Chest 14 · Shoulders 12 · Quads 12 · Hamstrings 12 ·
Triceps 11 · Glutes 11 · Core 10 · Biceps 9 · Calves 7.
By equipment: machine 33 · dumbbell 26 · barbell 20 · cable 19 · bodyweight 19.

**26 movements** — the things a coach can prescribe that are not lifts (runs, walks, planks, carries,
rope). Deliberately a separate list: a run wearing a lift's clothes would be offered as a substitute
for a squat and counted as leg volume.

Each exercise carries: capability (5 Class-A patterns) · muscle (10 groups) · **swap pattern** (finer
than muscle — two exercises with the same pattern train the same thing) · equipment family ·
**load style** (barbell / fixed barbell / dumbbell / selectorized / cable / plate-loaded / bodyweight)
· a cold-start base load · **3 technique cues** · a Hebrew name.

**Two assisted machines** (assisted dip, assisted pull-up) carry **no load axis at all** — the coach
says in words how much help to take, because the assist she needs is not a fact the engine has
measured. A tripwire test fails the build the day someone gives them a number.

## 17.2 The declared constants (the ledger)

**Nine bootstraps** (replaced by her own data, usually within weeks) and **thirteen form constants**
(they define the shape of the product; no measurement replaces them). Every number that moves iron is
measured, declared by the athlete, or listed here. **Thirteen guess-constants were deleted.**

Selected values a designer may need:
`SETS_MIN 3 · SETS_MAX 5 · MAX_LIFTS_PER_DAY 7 · SESSION_MIN 45 · SESSION_MAX 60 ·
EMPHASIS_BUDGET 2 · WEEKLY_SETS_PER_DAY 5 · WEEKLY_SETS_FLOOR 6 · WEEKLY_SETS_CEILING 30 ·
FULL_BODY_MUSCLE_COUNT 9 · FULL_BODY_UNTIL_DAYS 3 · EMPHASIS_FRACTION 0.6 · BAR_KG 20 ·
RECENCY_WINDOW_SESSIONS 12 · REST_BAND_WIDTH_S 45 · MIN_PAIRS_FOR_SLOPE 4 · N_PERCENTILE 0.75 ·
ADOPT_THRESHOLD (K) 2 · MAX_CORRECTIONS 2 · COMEBACK_DAYS 10 · DETRAIN_RETAINED_PER_MONTH 0.9 ·
DETRAIN_FLOOR 0.7 · EPLEY_VALID_REPS 20 · MIN_REST_SAMPLES 3 · FREE_SESSION_LIMIT 14 ·
STRENGTH_MET 4.5`

**Canonical muscle order** (the final tie-break, and the order every list is drawn in):
Chest · Shoulders · Triceps · Back · Biceps · Quads · Hamstrings · Glutes · Calves · Core.

## 17.3 Where things live in the code

| Area | Path |
|---|---|
| Engine | `src/engine/v5/` (`loop1` `loop2` `loop3` `grid` `repsPerRung` `programAssembly` `bodyMap` `detraining` `volumeAllocation` `timeBudget` `constants`) |
| Domain (pure) | `src/domain/` — 70 modules |
| Screens | `src/screens/` |
| Design system | `src/components/ds/`, `src/design/tokens.ts` |
| Copy | `src/i18n/locales/{en,he}.json` |
| Notifications / haptics / watch / Live Activity | `src/platform/` |
| Watch app (Swift) | `targets/watch/` |
| Widget + Live Activity (Swift) | `targets/widget/`, `targets/watch-widget/` |
| Procedural exercise motion | `src/motion/` |
| The laws (build-failing tests) | `__tests__/laws/` — 130 of them |
| The engine specification | `docs/canonical/ENGINE_V5_SITUATION_REGISTER.md` |
| The watch specification | `docs/canonical/מסמך סופי לשעון.md` |

---

*End of brief.*
