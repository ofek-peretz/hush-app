# Hush — The Product Brief + Screen Map (for the designer)

**This tells you what to build, not what it looks like.** It names every screen the product needs,
and for each one it says *what it must contain and do* so that the app tells the truth about the
engine. It does **not** tell you the colours, the exact words, the type, where anything sits, or how
it moves. **Form is entirely yours** — design the app you believe is the truest expression of this
product.

Two things changed, and they are why this document exists:

1. **The engine underneath was replaced** (not tuned — replaced). The full contract is
   `ENGINE_V5_SITUATION_REGISTER.md`; the short version is in *"What the engine actually does"*
   below. The app and the engine must now move in one breath — every surface must tell the truth
   about the new behaviour.
2. **The old brief gave total freedom over *which* screens exist.** That was too open. We already
   have a strong app — ~23 built screens — and the right move is to **embed the new engine into the
   skeleton we have**, reshaping or cutting what no longer fits. So this version names the screens
   concretely. **You still have freedom to merge two screens, split one, or reorder — wherever you
   think it serves the athlete better.** What is fixed is the *jobs* and the *content*, not the count.

---

## The global laws (they bind every screen)

- **Form is yours.** Colour, copy, type, layout, motion, iconography — all designer's call. Where
  this document says "must show X," it means the *fact* X, never the phrasing or the placement.
- **Numbers are chosen on a SCROLLER — never with + / − buttons.** Any time the athlete picks from a
  range of numbers (age, height, weight, days, minutes, editing a weight or a rep count), it is a
  scroller (a wheel / ruler), horizontal or vertical — your choice. **Plus/minus steppers are banned
  from the whole product.** *(A pick from a few named choices — the rep band, a body-map stance — is
  not a number range and can be a segmented control or a tap; the scroller law is about number
  ranges.)*
- **One fact, one element.** Never render the same fact three ways on one screen. If the hero already
  says it, the button and the chip should not repeat it.
- **The voice is Hush's** (see the last section) — first person, measured, no emoji, never a claim it
  did not measure. This is a product truth, not a copy instruction.
- **Merge / split freely.** If two screens here are better as one, or one is better as two, do it —
  as long as every *job* below still has a home.

---

## Who Hush is

**Hush runs your training programme for you — on facts alone.** It is the coach for the everyday
gym-goer who wants the best engine in the world managing their programme. Not a log book. Not a
library of templates to pick from. A coach that decides, and explains itself.

Three truths define the product. Everything you design should feel like them:

1. **It narrates its own decisions.** Nobody is taught how to use Hush. The product *tells you what it
   did and why*, in the first person — *"All three sets hit 8, so the row goes up."* The number and
   the reason arrive together.

2. **It reacts to what actually happened, in real time.** During a workout it adjusts the next weight
   the moment a set comes in too light or too heavy. **At the end of a workout, next time's weights
   are already decided** — and it says so, then. Once a week it hands back a short reflection of
   everything that changed. It only ever says what it **measured**.

3. **It is calm and certain.** Its confidence comes from being right, not from being loud. It respects
   the athlete's attention and their intelligence.

**The mental model the whole app should express:** *You own how you train — which exercises, how many
reps you like, which muscles matter, how much time you have. Hush owns the numbers — what weight, how
many sets — and tells you every time it changes one.*

---

## What Hush is NOT

- **Not a hype app.** No streaks, badges-for-showing-up, confetti, or manufactured urgency. No emoji.
- **Not a guesser.** It never claims a reason it did not measure — never "you're tired," "you haven't
  recovered," "you're not ready." If it didn't measure it, it doesn't say it.
- **Not a fortune-teller.** No projections, no "you'll bench X by summer." Only what has happened.
- **Not a template shop.** The athlete does not browse and assemble a plan. Hush builds it.
- **Not a demographic guess.** It does not give people a programme because of their sex. What to train
  is the athlete's own stated choice — the **body map** (below). *Sex survives only as one physical
  seed for a first starting weight, overwritten in the first session.*
- **Not a nag.** It asks for something at most once, and never blocks training on a question.

---

## What the engine actually does (the behaviour your design must express)

These are the real, new capabilities that make Hush different. You don't design them as literal
screens, but the app must make each one *felt* — the screen map below says where.

- **It learns a few facts, then builds the programme.** It needs only what the athlete declares: who
  they are, how they like to train, how much time they have, and — on a body — which muscles to train,
  leave alone, or emphasise. From that it assembles the whole programme. **There is no menu of splits.**

- **The body map is the heart of "what to train."** Instead of guessing by sex, the athlete marks, on
  a body, which muscles to train normally, which to emphasise (a small, deliberate budget — not
  everything can be a priority), and which to leave off entirely. The programme's shape *follows* from
  this. It is set at the start and can be changed any time; turning a muscle back on resumes it where
  it left off.

- **Reps are the athlete's to choose.** They tell Hush the rep range they like once (the *band*).
  Hush keeps every lift landing in it and adds weight when they clear it — they never have to grind to
  the top of a range. This is theirs; Hush never quietly overrides it.

- **It corrects the weight inside the set, in real time.** During a workout, if a set is too light or
  too heavy for the athlete's chosen band, Hush changes the *next* set's weight immediately and says
  why — and the same change appears on the watch. **This is the single most distinctive moment in the
  product.** It should feel like a coach standing next to you, not a form re-submitting.

- **It decides at the end of each workout — never on a schedule.** The moment a workout ends, the next
  time's weights are set. A lift trained twice in a week builds on itself. **There is no "wait until
  Sunday."** The end-of-workout moment should tell the athlete what that session earned.

- **Once a week it reflects, and decides nothing.** A short weekly review connects everything that
  changed across the week into one honest reflection — a mirror of what *the athlete* did, with the
  reasons available if they want them. On a week where nothing needed to change, it says so, and shows
  how far they've come instead of an empty screen.

- **It survives the athlete's edits.** Swapping an exercise, changing days, editing a muscle's rep
  range, or reshaping the body map — none of it loses their progress. The engine is built to be edited.

- **It measures rest, and uses it honestly.** Rest between sets is measured, not dictated; it makes the
  timing personal and lets Hush fit the right amount of work into the time the athlete actually has.
  **Heart rate (for watch users) is shown, never used to decide anything.**

- **Cardio is recorded, never coached.** Walks and runs are tracked and celebrated, but they never
  change what's on the bar. Nothing about a run tells Hush what to prescribe.

---

## The screens

Grouped by the job each serves. Every screen carries a **verdict**:

- **KEEP** — it already fits the engine; leave the job as-is (redesign the form freely).
- **RESHAPE** — the job changes to match v5; the content notes say how.
- **NEW** — it does not exist yet; build it.
- **MERGE** — fold it into another screen.
- **CUT** — remove it (or the input it carries).

*(Screen names in brackets are the current files, for orientation only — rename freely.)*

### Family 1 · Getting started

The onboarding's job is to learn *just enough* to build the first programme, and to feel like a good
coach's first conversation — not a form. **This family carries the biggest change — but the change is
mostly *subtraction*.** v5 needs exactly **one** genuinely new thing from onboarding: the **body map**.
The rep range and the workout length are **not asked** (they get sensible defaults the athlete can
change later — the rep range per-muscle in the map, the length in Settings; asking them here is
deliberation at the worst moment), and **experience is cut** entirely (the engine measures her in the
first set instead of guessing). So onboarding gets *shorter*, not longer, even as it gains the body map.

- **Sign in** *(Authentication)* — **KEEP.** Front door: the wordmark, sign in with Apple / Google,
  the legal line beneath (consent is recorded at sign-in). Sells nothing.

- **Name + sex** *(NameEntry)* — **KEEP.** Two answers: the name Hush will address them by, and sex.
  Say plainly what sex is *for* now: a physical seed for the first starting weight (and, in Hebrew,
  how the app addresses them) — **not** what they train. What they train is the body map.

- **Connect Health** *(ConnectHealth)* — **KEEP, optional.** Offer HealthKit. It must read as a
  *choice*, skippable, and it must state the truth: heart rate and cardio are **shown, never used to
  decide anything.** (This is now an engine law, not a nicety.)

- **Body stats** *(ManualInfo)* — **KEEP.** Age, height, weight — three scrollers. They seed the first
  starting loads and nothing else; the approach set overwrites them in the first session.

- **Your schedule** *(Training)* — **RESHAPE, mostly by subtraction.** Today this screen asks
  *experience* + *days*.
  - **CUT experience** — v5 does not use it (the first set measures her).
  - **Do NOT ask the rep range or the workout length.** Every muscle starts at a default rep range
    (8–10), editable later per-muscle in the body map; the workout length defaults to a 60-minute
    *ceiling*, editable in Settings — and the engine already learns her real length from facts (fast
    rests earn more work; unfinished sets trim it). Asking either here forces a novice to deliberate
    about things they have no opinion on yet.
  - What remains to ask is **days per week** — a single scroller. That is the whole screen (and it may
    fold into the step before or after it — your call).

- **The body map** *(NEW — the centrepiece)* — **NEW.** On a body (front / back — your call), the
  athlete marks every muscle as **off**, **normal**, or **emphasis**. This is what *replaces the
  gendered split* — the programme's whole shape follows from it. It must:
  - let a muscle be set to one of the three stances, clearly;
  - enforce a **small emphasis budget** (only a couple of muscles can be a priority — priority is
    zero-sum because time is), and make that limit legible, not a hidden error;
  - state the *consequence* of turning things off, calmly and once (e.g. "legs off → your week is
    upper-body work") — never argue with the choice;
  - never present a list of split templates. There is no split to pick; the map *is* the input.

  The muscles are fixed (10): Chest, Shoulders, Back, Biceps, Triceps, Core (upper) and Quads,
  Hamstrings, Glutes, Calves (lower). The emphasis budget is **2**. *(Onboarding sets only the
  stance — off / normal / emphasis. The per-muscle rep range is NOT set here; it lives in the editable
  version of this map, Family 4, at a default of 8–10 most people never touch.)*

  This is the one screen you author from scratch, and the most important surface in onboarding. It is
  also **reused, editable, forever** (see Family 4).

- **Building + Ready** *(ProgramCreated)* — **KEEP, realign the promise.** The build moment (Hush
  assembling the programme) and the first hand-off. It speaks the athlete's name and states the deal.
  **Fix the deal to match v5:** Hush decides *at the end of every workout*, and each **Saturday it
  mirrors** the week. Remove any wording that implies loads change on a weekly schedule — they don't.

### Family 2 · Training

The core loop: see today, do it, feel Hush working with you.

- **Home** *(HomeView / Home)* — **KEEP, realign the language.** The hub: what to do next, the one act
  to begin, the set of this cycle's workouts (as choosable chips), Hush's short note about what it
  changed, and links out to history / progress / a run. It is strong — keep its shape. Realign only
  the *framing*: the set of N workouts is a **display container**, not an engine boundary; Hush's note
  narrates decisions that were made **per workout** (not batched weekly). Nothing on Home should imply
  "your loads update on a certain day."

- **The live workout** *(SessionFlow)* — **KEEP, and elevate the signature moment.** The stage: one
  set at a time, log it, rest, next. Everything the engine owns (loads, sets, per-set logging, rest
  timing, in-workout swap, edit-a-result, finish) stays. **The one thing to raise:** the *real-time
  weight correction* — the next set's weight visibly moving in response to the set just logged, **with
  the reason** — is the product's single most distinctive moment, and today it is easy to miss. Make it
  a first-class, felt beat on the stage. It must mirror to the watch. *(Drop the leftover weekly-cadence
  coupling; the engine has no week.)* **The in-workout swap is now the athlete's main exercise-selection
  lever** — it happens before the first set, and with the edit screen gone, the stage is the **only**
  place the swap verb is taught, so it must be discoverable here. A repeated swap is how the engine
  learns a permanent replacement (register Part 9).

- **Workout Complete** *(WellDone)* — **RESHAPE — the important one.** Today this screen defers all
  decisions to Saturday ("a single workout never builds next week's program"). **v5 reverses that
  rule.** The decision *is* made when the workout ends. This screen must now tell the athlete **what
  this session earned** — the loads Hush set for next time, and the reason ("all three sets hit 8, so
  the row goes up") — not point everything at the weekly letter. Keep the calm close and the milestone
  moment (the one licensed loud beat, at most one per workout).

### Family 3 · The weekly reflection

- **The Saturday letter** *(WeeklyUpdate)* — **KEEP, confirm it decides nothing.** Once a week, a
  short honest mirror of everything that changed across the week, with the *why* one tap away, and a
  "here's how far you've come" for a steady week (never an empty screen). It is **read-only and decides
  nothing** — every decision already happened at a workout's end. A load that came down is "matched to
  what you showed me," never a setback, never red. No forecasts.

### Family 4 · Owning the programme

Let the athlete change things without ever losing progress.

- **The day's plan editor** *(ProgramDetail)* — **CUT (the editing part).** The engine no longer has a
  declared edit surface: the **pin and swap buttons are deleted**, and with them the whole edit screen.
  Exercise selection is owned two ways — the **body map** (which muscles) and the **in-workout swap**
  (which exercise) — and the engine *learns* a standing replacement when the athlete swaps the same way
  twice (a repeated in-workout swap quietly becomes permanent; the pin is earned by behaviour, never a
  button — register Part 9). What may survive is a **read-only plan PREVIEW** (see today's exercises +
  watch a form clip), reachable off Home, **off the START path** — it edits nothing.

- **The body-map editor** *(NEW — reuses the onboarding map)* — **NEW (shared).** The same body map,
  editable any time — and the home of two per-muscle controls: the **stance** (off / normal / emphasis)
  and the **rep range** for that muscle's exercises (default 8–10; this is where the athlete who likes,
  say, higher-rep shoulder work sets it). Turning a muscle back on **resumes** it (with its history),
  never restarts it. Reached from Settings.

- **Edit preferences** *(ProfileEdit)* — **RESHAPE.** Height / weight / days / **workout-length
  ceiling** (default 60), plus a path to the body-map editor (where per-muscle stance and rep range
  live). **CUT the experience concept** here. The rep range is *not* edited here — it is per-muscle, so
  it lives in the map. Editing any of these must never reset progression (history is keyed to the
  exercise, not the slot).

### Family 5 · Progress & history

The long view, from real data — never a projection.

- **Progress** *(Progress)* — **KEEP.** All-time: how far each lift has travelled (from logged data),
  plus the milestones earned by fact. The always-on long view.

- **Quarterly report** *(QuarterlyReport)* — **MERGE → Progress.** It is the same view over a 12-week
  window — a thin wrapper. Fold it into Progress (one surface, optionally windowed). **Keep the
  periodic notification**, and point it at Progress. One fewer screen to maintain.

- **History** *(History)* — **KEEP.** One reverse-chronological timeline of everything recorded —
  strength sessions *and* cardio — read in month chapters. Records without grading.

- **Workout record** *(WorkoutDetail)* — **KEEP.** The read-only record of one logged session: the
  actual sets as they were performed. Immutable, no targets, no editing.

### Family 6 · Cardio

- **Cardio (run / walk)** *(Cardio)* — **KEEP.** A simple place to record a run or a walk, off the main
  lifting path — select → count-in → active → complete, with real distance / pace / calories and a
  route trace. **Recorded, never coached**; nothing here ever feeds the engine. Heart rate is display
  only.

- **Cardio record** *(CardioDetail)* — **KEEP.** The read-only details of one recorded activity
  (distance, duration, pace, HR, calories, splits). Never graded.

### Family 7 · Account & access

Honest and calm — the same voice as the rest of the product, no dark patterns.

- **Settings / Profile** *(ProfileSheet)* — **RESHAPE.** Identity + membership, then preferences
  (units, language), Health, and account actions (sign out, delete, the real app version). **CUT the
  Experience row.** Add the path to the body-map editor (stance + per-muscle rep range) and to the
  workout-length ceiling (Family 4). Keep everything else.

- **Paywall** *(Paywall)* — **KEEP.** Choose a plan, subscribe through the store, restore a purchase.
  Dismissible. Prices come from the store; copy obeys the voice laws (no "Recommended," no hedging).

- *(Dev only: the debug screen is a developer tool, not product — out of scope here.)*

---

## What changed, at a glance

| Change | Where | Why |
|---|---|---|
| **CUT: experience** | Onboarding, Settings | v5 measures via the approach set; a self-report guess is dead weight. |
| **CUT: the edit screen + pin/swap buttons** | ProgramDetail | Selection is learned from repeated in-workout swaps; the pin is earned by behaviour (register Part 9). A read-only preview may remain, off the START path. |
| **NEW: body map** (the only genuinely new onboarding ask) | Onboarding + an editor | Replaces the sex→split guess; the programme's shape follows from it. Onboarding sets stance only. |
| **NOT ASKED: rep range** (default 8–10, per-muscle) | Body-map editor | Set-once preference; lives per-muscle in the map, never a question at onboarding. |
| **NOT ASKED: workout length** (default 60 ceiling) | Settings | The loops already learn her real length from facts; editable for the rare exception. |
| **RESHAPE: end-of-workout decision** | Workout Complete | v5 decides when the workout ends — the screen must say what it earned. |
| **ELEVATE: real-time correction + swap discoverability** | Live workout | The signature moment; and the stage is now the only place the swap verb is taught. |
| **MERGE: quarterly report → Progress** | Progress | Same view, different window — one surface, keep the notification. |
| **REALIGN: no weekly boundary** | Home, Live workout, Ready, Saturday letter | Decisions are per-workout; Saturday is only a mirror. |

Everything not listed here is **keep** — the skeleton is strong; this is embed-and-realign, not a
rebuild.

---

## The voice (a product truth, not a design constraint)

However you design it, the words are Hush's, and they are always:

- **First person and plain** — "I added weight," "I eased it," "I found your number."
- **Measured** — only what happened. Never a reason it didn't measure.
- **Paired with the fact** — a number that changed arrives with the sentence that earned it.
- **Never** an emoji, a projection, or a claim about the body it can't back with data.

Build the app you think is best. Make it feel like a coach who is quietly, provably right.
