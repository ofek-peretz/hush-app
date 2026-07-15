# Hush — The Complete Screen Specification (v5)

**For Figma / the designer. Build the whole app from this.** Everything changed when the engine
became v5: it now corrects the weight **inside the set in real time**, decides the next load **at the
end of every workout** (never on a schedule), and folds the whole week into **one short review**.
The screens must show that.

This document is the source of truth for *what each screen is, what the engine gives it, and what the
athlete sees and does*. The engine's own contract is `ENGINE_V5_SITUATION_REGISTER.md`; this is its
face.

---

## Part 0 — The product in one page (read this first)

**Hush manages your training programme for you, on facts alone.** It is the coach for the everyday
gym-goer who wants the best engine in the world running their programme — not a log book, not a
library of templates.

Three things define the feel, and every screen must carry them:

1. **It narrates its own decisions.** Nobody has to be taught how to use it. The product *tells you
   what it did and why*, in the first person: *"All three sets hit 8, so the row goes to 47.5."* It
   never shows a number without the sentence that earned it.

2. **It reacts in real time, and it reacts honestly.** During your workout, if a set comes in too
   light or too heavy, Hush moves the next set's weight **right then** — and says so. At the end of
   the workout, next time's weights are already set. On Saturday, it hands you a short review of the
   whole week. It only ever says things it **measured** — never "you're tired," never a guess.

3. **It is a calm instrument, not a hype app.** Paper-white surfaces, graphite ink, one warm ochre
   accent. No emoji. No streaks-and-confetti. One fact per element. The confidence comes from being
   right, not from being loud.

**The one mental model for the whole app:** *You own how you train (which exercises, how many reps you
like, which muscles matter, how long you have). Hush owns the numbers (what weight, how many sets) and
tells you every time it changes one.*

---

## Part 1 — Design language (carry forward, do not reinvent)

- **Palette.** Paper/cream background, warm graphite ink (not pure black), **one** ochre accent
  `#cc9147` with cream text on it. Light mode is the product — the screens win by committing to the
  instrument look, not by going dark. Sage/green marks "done." A hairline separates, never a box.
- **Type.** Hanken Grotesk for text; JetBrains Mono for numbers (weights, reps, timers). Numbers are
  always mono — they read as instrument readouts.
- **Motion.** Restrained. A weight change animates as a single ochre tick, not a celebration. Haptics
  carry the rhythm of a set (the countdown is haptic, not a loud beep).
- **Voice.** First person, always ("I added 2.5 kg"), present and plain. Never emoji. Never a reason
  it did not measure (no "fatigue," "recovery," "readiness"). Exercise names in English; muscle names
  localised; Hebrew is RTL with the number/name direction rules already in the app.
- **One fact, one element.** Never show the same fact twice on a screen. If the workout name is in the
  header, it is not repeated in the body.

---

## Part 2 — Screen inventory

**Full count: 27 screens across 6 flows.** Cross-checked against the built app so none is missed.

**A · Onboarding** (first run) — 1 Welcome/Sign-in · 2 Name · 3 About you (sex, age, height, weight) ·
4 Experience & days per week · 5 **Time per workout (NEW)** · 6 **Reps you like — T (NEW)** · 7 **Body
map (NEW)** · 8 Connect Health (optional) · 9 Building your programme.

**B · The core loop** — 10 Home · 11 Pre-workout / ready (the brief) · 12 Active set · 13 Rest · 14
Session complete.

**C · The reflection** — 15 Weekly review (the Saturday mirror) · 16 Progress · 17 Progress report
detail (a single capability / milestone) · 18 History · 19 Workout detail (one past session).

**D · Ownership** — 20 Programme (view + swap + pin + video) · 21 Body map (living, editable) · 22
Profile edit · 23 Profile sheet (quick menu) · 24 Subscription / Paywall.

**E · Aside** — 25 Cardio (open training) · 26 Cardio detail (one activity).

**F · Internal** — 27 Engine debug (dev-only, not shipped to users — a v5 state inspector for
on-device QA; no design needed, list it so it isn't mistaken for a user screen).

Below, each screen: **Purpose · What the engine gives · What the athlete sees · What the athlete does
· States & edges.**

---

## Part 3 — The screens

### A · ONBOARDING

Onboarding gathers only **declared facts** the engine needs, and nothing else. Keep it fast, one
decision per screen, no scroll. Two of these screens are NEW and load-bearing (Time, T, Body map).

#### 1 · Welcome / Sign-in
- **Purpose.** Enter. Sign in (Apple / magic link). Consent is merged here (a single line + link).
- **Sees.** The wordmark, one calm line of what Hush is ("The coach that runs your programme."), a
  sign-in button.
- **Edges.** Return user → straight to Home.

#### 2 · Name
- **Purpose.** Her first name — Hush speaks to her by it (the weekly review opens with it; the app
  is personal). If sign-in already provided a name, this can be a confirm, not a re-entry.
- **Sees.** One field, one line: *"What should I call you?"* One `Continue`.
- **Edge.** Skippable → the app shows stats without a vocative; never blocks.

#### 3 · About you
- **Purpose.** Sex, age, height, bodyweight. These are **seeds only** — they pick starting weights and
  the first programme shape; the engine overwrites them with real data within weeks.
- **Sees.** Four compact inputs (wheel pickers for numbers — mono). One screen, no scroll.
- **Engine.** Sex + bodyweight seed the day-one loads (B-1); height is display-only, it never moves a
  weight; age nudges the starting rep floor.
- **Copy note.** Do NOT frame anything as medical. No injury question here (a negative prompt most
  people would tick "no" to — handled by the body map instead).

#### 3 · Experience
- **Purpose.** Beginner / Intermediate / Advanced → the cold-start starting weight.
- **Sees.** Three cards, one tap.

#### 4 · Days per week
- **Purpose.** How many workouts a week (1–6). This is structural — it sets how the week is shaped.
- **Sees.** A wheel or segmented control 1–6.

#### 5 · Time per workout — **NEW**
- **Purpose.** How many minutes she has. This is the **real ceiling** on her programme (S-64): the
  engine fits sets into her minutes using the rest she actually takes — not a guess.
- **Sees.** A wheel: 30 / 45 / 60 / 75 / 90 min. Default 60. One line under it in Hush's voice:
  *"I'll fit your work into this — and never past it."*
- **Engine.** Feeds the time budget. A faster rester earns more work in the same minutes; the plan is
  trimmed the moment she can't finish it.

#### 6 · Reps you like — **T — NEW, important**
- **Purpose.** Her rep band. This is the single most personal choice, and the science says it's free
  (any band from ~6 to 15+ builds muscle when the sets are hard). So Hush lets her own it.
- **Sees.** One question — *"How many reps do you like?"* — and four options:
  **6-8 · 8-10 · 10-12 · 12-15**. Default highlight on **8-10**.
- **Under it, in Hush's voice:** *"This is yours. I'll keep every lift landing in it, and add weight
  when you clear it — you never have to grind to the top."*
- **Engine.** This becomes `T = [Tlo, Thi]`. `Tlo` is the target (clear it → weight goes up), `Thi` is
  the "too light" mark (above it → I add weight, even mid-set). It applies to **every** exercise —
  there is no separate rule for small muscles. Fully editable later in Profile.
- **Edge.** Whatever she picks, the engine never silently overrides it — so there is nothing to warn
  about here.

#### 7 · Body map — **NEW, the centrepiece**
- **Purpose.** Replace the old "men's / women's programme" guess entirely. She tells Hush **what to
  train and what to leave alone**, on a body. This is where the programme is truly hers.
- **Sees.** A front/back figure of the **same mannequin used in the exercise videos** (one body across
  the app). Each muscle group is a tappable region with **three states**:
  - **Normal** (default) — trained.
  - **Emphasis** (ochre) — first claim on volume. **Budget of exactly 2 marks.** When both are used,
    the others can't be emphasised until she frees one.
  - **Off** (dimmed / hollow) — never appears in the programme.
- **Under it, live:** a one-line consequence in Hush's voice as she edits, e.g. *"Legs off — your
  week is four upper-body sessions, more room for back and chest."*
- **Engine.** The map drives the whole assembly: off muscles vanish, emphasis muscles get more sets
  and are guaranteed at least one exercise, and **the split falls out of the volume** — mark glutes +
  quads and a 3-day week becomes two lower days, with no split chosen from a shelf.
- **Edges.**
  - **Too much off** → *"There isn't enough left to build a workout. Turn something back on."* (Never
    silently re-add.)
  - The map is **permanent and editable** post-onboarding (see screen 18). Turning a muscle back on
    **resumes** it (its history is intact), never restarts it.
  - **No pain/injury framing.** If she can't train something, she turns it off. The reason is her
    business; the off is the only fact the engine needs.

#### 8 · Connect Health (optional)
- **Purpose.** Offer to connect Apple Health — for cardio/HR display only. **Make the opt-out easy and
  guilt-free;** it is not required and it never feeds the training engine.
- **Sees.** One card explaining the benefit (route + heart-rate on your workouts), a `Connect` and a
  plain `Not now`. Honest about what it's used for (display, never load).
- **Edge.** Declined → everything works; no nagging later.

#### 9 · Building your programme
- **Purpose.** A brief, honest beat while the first programme assembles. Not a fake loading bar.
- **Sees.** One line — *"Cutting your programme to what you told me…"* — then straight to Home.

---

### B · THE CORE LOOP

This is where v5 changed most. The engine now acts **inside the set** and **at the end of the
workout**. The session screens must make that visible and calm.

#### 9 · Home
- **Purpose.** One surface for "what's this week, and what do I do now."
- **Engine gives.**
  - The current week's workouts (from the programme) and which is next-unfinished.
  - A **first-person briefing** of today's session: the muscles, and any load changes Hush made since
    last time (*"Today: back and biceps. The row's up to 47.5 — you earned it last week."*).
  - Whether there's an unseen **weekly review** (a quiet dot on the review entry).
- **Sees.** A single week card (the week's sessions as a row, done ones sage, next one live), the
  briefing paragraph, and one plain **`Begin`** CTA. The run/cardio option is a **link**, not a
  competing button. No forecasts, no projections — those were removed on purpose.
- **Does.** Taps Begin → Pre-workout. Taps the review entry → Weekly review.
- **Edges.** Week 1 (no history) → the briefing is a warm intro, not a decision ("Let's find your
  numbers this week."). Rest day (all sessions done) → a calm "You're done for the week" state.

#### 10 · Pre-workout — the black brief
- **Purpose.** The moment before lifting. She's at the gym, she tapped Begin. This screen **shows
  Hush's work** and lets her start — it is a *brief, not a control panel*. (Design decision: heavy
  per-exercise controls here are friction at the worst moment. The one place to change an exercise is
  the Programme screen, calmly, not here.)
- **Sees.** A dark (graphite) full-screen brief: today's workout name, the muscle line, the list of
  lifts with their **prescribed weight × reps** (mono), and — for anything Hush changed — a one-line
  reason under it. A single `Begin workout`.
- **Engine.** Every weight here is the v5 prescription (already decided at the last occurrence). An
  **approach set** (a new lift, or one she hasn't done in a while) is marked: *"New to you — we'll
  start light and find your number on the first set."*
- **Does.** Reads, starts. (Swaps/pins live on the Programme screen, not here.)

#### 11 · Active set — **the real-time screen (biggest change)**
- **Purpose.** Do the set, log it. And — new in v5 — **Hush corrects the next set's weight in real
  time** from what she just lifted.
- **Engine gives.**
  - The current set: exercise, target weight (mono), target reps = her `Tlo`, set n of m.
  - After she logs a set, if the reps fell **outside her band**, the engine changes the **next set's
    weight** immediately and returns the new number + a one-line reason.
- **Sees.**
  - The lift name, muscle group centred over it, the ordinal ("Set 2 of 3") in the top bar.
  - The **weight and reps as large mono readouts**, editable (two doors: a pencil and tapping the
    number itself).
  - A big **Complete Set**.
- **The real-time correction — how it must feel:**
  - She logs Set 1 at 80×15 (way above her band). Between sets, the **next set's weight animates from
    80 → 82.5** with a single ochre tick and a quiet line: *"That was light — Set 2 goes to 82.5."*
  - She logs a set at 80×5 (below her band): *"Take five off — Set 3 is 77.5, finish it strong."*
  - The correction carries to the **remaining** sets, not just the next. It happens at most twice per
    exercise, never after the last set. **On the watch, the same change appears — one engine, both
    wrists.**
- **Does.** Logs each set; edits if the number's wrong (an edit is a fact Hush reads).
- **States & edges.**
  - **Approach set** (first set of a new/returning lift): labelled as a measurement, not a working
    set — *"Finding your number — this one's just to feel it."* It doesn't count toward the decision.
  - **Bodyweight lift:** no weight readout; reps only. No load correction (there's no weight to move).
  - **Swap (station taken):** a one-tap swap to a backup — it "already knows your number." This is a
    backup, not a preference; it changes nothing about your programme.
  - **Edit result:** she can always correct a logged set; the engine reads the correction.

#### 12 · Rest
- **Purpose.** The gap between sets — and the moment the real-time correction is shown.
- **Engine gives.** The rest length (learned from the rest she actually takes — it stops being a fixed
  timer she fights). The next set's (possibly corrected) weight.
- **Sees.** A calm ring/timer (mono), the next set's weight and reps (with the correction already
  applied and its one-line reason if it changed), and **`Ready`** (the only rest agency) + `+15s`.
- **Engine.** Every rest is **measured** and fed back — it's what lets the time budget be real, and
  what makes the timer personal. (Heart rate is display-only; it never ends the rest or moves a
  weight.)
- **Edges.** She can Ready early (short rest is fine — it's recorded). The timer never forces the next
  set; it just guides.

#### 13 · Session complete — "Well Done"
- **Purpose.** Close the workout, and — new in v5 — **tell her what the workout just earned**, because
  the decision was made at the end of the workout (not on Saturday).
- **Engine gives.** For each lift she trained: whether next time's weight went up / held / came down,
  and the one-line reason. Plus the session facts (sets, best set, duration).
- **Sees.** A "Well Done" beat, then a short list: **each lift → its next-time weight and a reason**
  (*"Bench: 82.5 next time (+2.5) — all three sets hit 8."*). Done marks in sage. One line if nothing
  changed (*"Steady session — the plan's already right"*). No tonnage-worship; the fact that matters
  is what changed.
- **Does.** Closes → Home (which now shows the workout as done).
- **Edges.** Early finish (partial session) → still credited; the lifts she did get their decisions,
  the rest hold.

---

### C · THE REFLECTION

#### 14 · Weekly review — the Saturday mirror — **reframed in v5**
- **Purpose.** Once a week, connect **all** the week's changes into one short reflection. **Critically
  (v5): this screen decides NOTHING.** Every decision already happened — in the set, at the end of
  each workout. This is a **mirror** of what *she* did. It opens from the Saturday note.
- **Engine gives.** The **net** change per lift over the week that just closed (a lift that moved
  twice reads as one line, from where it started to where it ended), each with its Why, plus the
  headline facts (*"This week: 4 workouts. 12 loads moved. Back went up on three lifts."*).
- **Sees.**
  - A vocative open (her name), a headline of the week's facts, and — for the week where things
    changed — **only what changed**, grouped by workout, each lift a row with a tap-to-expand **Why**
    (the saw / means / did triple, in Hush's voice).
  - **For a steady week** (nothing changed — the plan is already right), it must NOT read as "nothing
    happened." It fills with **evidence**: her own biggest lifts-travelled since Hush met her.
- **Does.** Reads, expands a Why, closes. Marking-seen is automatic.
- **Edges.** Opened mid-week → shows the last fully-closed week. The note fires Saturday 20:30; opening
  it must show the week that just closed, never last week's.

#### 15 · Progress
- **Purpose.** The long view — real strength per capability, and milestones earned by facts.
- **Engine gives.** Relative strength per movement (from her best real e1RM vs a sex/bodyweight
  benchmark — **display only**, never a decision input), and milestone families (count / tonnage /
  clubs / engine), each earned from data.
- **Sees.** A portrait (5 capability bars), a milestone gallery, month chapters of history. Bodyweight
  progress by reps where there's no load.
- **Edges.** Confidence rises with real data per capability; never show a fabricated projection.

#### 17 · Progress report detail (one capability / milestone)
- **Purpose.** Tapping a capability bar or a milestone opens its story — the quarterly / all-time
  view of how far one thing has travelled.
- **Sees.** A single capability's trajectory (real e1RM over time — display only), or a milestone's
  earned-moment and what it took. Month chapters. No projection past today.
- **Engine.** All from her real logged data; confidence shown only where there's enough of it.

#### 18 · History
- **Purpose.** Every completed session, stable and readable, newest first.
- **Sees.** Sessions grouped by month; each shows the workout, its lifts, best sets, and any
  owner-voice note ("I eased the row after you were away."). Day names captured at start so they read
  stably even after regeneration.

#### 19 · Workout detail (one past session)
- **Purpose.** Tapping a session in History opens it in full.
- **Sees.** The workout name + date, every lift with its logged sets (weight × reps, best set marked),
  the rest actually taken, and Hush's owner-voice note for that session if there was one. Approach
  sets are marked as measurements, not working sets.

---

### D · OWNERSHIP

#### 17 · Programme (view + swap + pin + video)
- **Purpose.** See the week's workouts and exercise them. This is the **calm** place to change an
  exercise — not mid-workout.
- **Engine gives.** The assembled week: each workout, its lifts, sets × reps × weight, muscle line.
- **Sees.** The week's workouts; tap a workout → its lifts; tap a lift → a sheet with **Swap · Pin ·
  Video**.
  - **Swap (here = a permanent refusal):** replacing a lift here removes it from her pool **for good**
    — Hush never offers it again. (This is different from the in-workout backup swap, which declares
    nothing.)
  - **Pin:** locks the exercise against any engine change (rotation/graduation). A padlock marks it.
  - **Video:** the exercise demo — the same mannequin as the body map.
- **Engine.** A swapped-in lift keeps its own history (it "knows her number") or starts with an
  approach set if new. A pin is durable across regeneration.
- **Edges.** Reorder within a workout and reorder workouts are athlete-owned and durable.

#### 18 · Body map (living)
- **Purpose.** The onboarding map, permanent. Where she turns a muscle on/off/emphasis any time, and —
  new — **sees what Hush is training**.
- **Sees.** The same figure. Editable states. Optional: a quiet read of sets-per-muscle this week
  (only if it doesn't clutter — the engine narrates in words, so this is secondary).
- **Engine.** Editing re-assembles the programme. A muscle turned back on **resumes** (history intact).
  **Ask-back:** if she turns off a muscle she has actually *trained*, Hush asks **once**, later, at the
  weekly review: *"Legs have been off a while — want them back?"* One tap. Never asked twice, and never
  asked for a muscle she turned off before ever training it (that's settled taste, not a change).
- **Edges.** A pinned lift whose muscle is turned off then on → the pin resumes as she left it.

#### 19 · Profile & settings
- **Purpose.** The declared facts, editable, and app settings.
- **Sees.** Height / weight / days per week / **time per workout** / **reps you like (T)** / units /
  the real version. Sign-out, subscription, data.
- **Engine.** Changing **T** recomputes each lift's load from her own history at the new band (no
  conversion formula; if she has no history at the new band, the first set finds it). Changing **days**
  re-assembles — nothing resets (progression is keyed to the exercise). Changing **bodyweight** only
  affects bodyweight-lift load and future seeds; **height** changes nothing. Age auto-advances yearly.
- **Edges.** Every change is safe — the engine is built to survive edits without losing progression.

#### 23 · Profile sheet (quick menu)
- **Purpose.** A light sheet from the header — the fast path to identity, settings, sign-out — without
  opening the full edit screen.
- **Sees.** Her name + "member since," quick links (Profile edit, Body map, Subscription, Settings,
  Sign out). A menu, not a page.

#### 24 · Subscription / Paywall
- **Purpose.** The one monetisation surface. Presents the plan(s) and unlocks the product.
- **Sees.** What Hush is (the value in one honest line — *"A coach that runs your programme, on facts
  alone"*), the plan(s) and price, restore-purchase, terms/privacy links. No dark patterns, no fake
  countdowns — the calm instrument voice extends here too.
- **Engine.** Gating is entitlement-based; the app degrades gracefully offline (cached entitlement).
- **Edges.** Already subscribed → never shown. Lapsed → a clear, non-punitive state.

---

### E · ASIDE

#### 25 · Cardio (open training)
- **Purpose.** Walks/runs, indoor or outdoor, recorded and celebrated — **never coached, never an
  engine input.** Nothing about a run changes what's on the bar (that would be a fatigue theory,
  which Hush refuses).
- **Sees.** A simple record surface (GPS route for outdoor, HR for watch users), a list of activities.
  Off the main lifting path — a link from Home, not a competing button.

#### 26 · Cardio detail (one activity)
- **Purpose.** Tapping a recorded run/walk opens it.
- **Sees.** The route map (outdoor), distance / duration / pace, heart-rate trace if worn. Recorded
  facts only — no coaching, no "you should have gone faster."

---

### F · INTERNAL

#### 27 · Engine debug (dev-only, NOT shipped)
- **Purpose.** An on-device inspector of the v5 exercise-keyed state (per-exercise load, band, sets,
  history, the change log) for QA. **No design needed** — a plain list. Listed here only so it is not
  mistaken for a user screen and so it is remembered when v4's debug screen is removed.

---

## Part 4 — The engine's voice (copy the designer will need)

Every load change carries a **saw → means → did** triple; short forms for rows, long forms for the Why
expansion. All first person, all measured. Samples (the app resolves these through localisation):

- **Weight up:** *"All three sets hit 8, so I added 2.5 kg — the bench goes to 82.5."*
- **Weight held down (matched to what she did):** *"Last week came in under target, so I set it to
  77.5 and kept your sets."*
- **In-set raise (real-time):** *"That was light — Set 2 goes to 82.5."*
- **In-set drop (real-time):** *"Take five off — Set 3 is 77.5."*
- **Approach set:** *"New to you — we'll start light and find your number on the first set."*
- **Stall → rotate:** *"The cable row hasn't moved in a while, so I swapped it for a chest-supported
  row."*
- **Bodyweight graduate:** *"You outgrew the push-up — moving you to the dip."*
- **Muscle off (cost stated, no moralising):** *"Legs off — more room this week for back and chest."*
- **Steady week:** *"Nothing to change — the plan's already right. Here's how far you've come."*

**Never:** "fatigue," "recovery," "readiness," "you're tired," any projection/forecast, any emoji, any
number without its sentence.

---

## Part 5 — What's genuinely NEW vs the current app (so the designer knows what to rebuild)

1. **The Active-set screen must show real-time weight corrections** with a one-line reason, on phone
   AND watch. This is the single biggest new behaviour.
2. **The Session-complete screen must report per-lift what next time earned** (decisions now happen at
   the end of the workout, not Saturday).
3. **The Weekly review is now a pure mirror** — it decides nothing, it reflects the week. Net change
   per lift.
4. **Two new onboarding screens:** Time-per-workout and Reps-you-like (T).
5. **The Body map replaces the demographic split entirely** — it's the onboarding centrepiece and a
   living screen, and the programme's shape falls out of it.
6. **The mannequin is one body across the app** — body map, exercise videos, progress portrait.

---

*Engine contract: `ENGINE_V5_SITUATION_REGISTER.md`. This screen spec is its face — build the app so
that every number the athlete sees arrives with the sentence that earned it, in real time.*
