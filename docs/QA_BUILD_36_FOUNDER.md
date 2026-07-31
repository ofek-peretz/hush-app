# FOUNDER QA — BUILD 36 (2026-07-29)

> ## ▶ WHERE TO PICK THIS UP
> **Branch `feat/engine-progression-overhaul`, last commit `9aebe24`, pushed. Tree clean.**
>
> **35 items closed** — P0b.1 · A.1 · A.4 · A.5 · A.7 · A.8 · A.10 · A.11 · A.12 · A.13 · A.15 ·
> A.16 · B.1 · B.2 · B.6 · B.7 · B.8 · B.9 · B.11 · C.1 · C.2 · C.3 · C.4 · C.5 · C.6 · C.7 · C.8 ·
> C.9 · C.12 · C.13 · C.14 · C.15 · C.18 · C.19 · C.20, plus the P0 programme audit (delivered as
> an artifact, defect NOT yet fixed). **B.5 is half done.**
>
> **THE TODAY BATCH (A.5 · A.12 · A.15 · A.16) IS CLOSED.** What each one actually was:
> *A.5* — the unit was removed on purpose by v7 2.1 ("a column of loads in one declared unit"). He
> overruled it and he is right: every row already ends in a scheme, so the number was never alone in
> a bare column. *A.12* — **the chips were not flickering; the six rows under them were.** `plan` was
> null until the engine's `sessionTargets` promise landed, so every tap collapsed the list into an
> empty 168 px box and grew it back, walking Begin up and down the page. A lift's name and set count
> are facts of the programme DAY and are known synchronously; only the figures wait now
> (`screens/home/homePlan.ts`). *A.15* — the name wraps instead of clamping, **and** the figure's
> meta went back to the canonical 13.5 pt: at 17 pt it took 158 of the row's 330 px and forced a
> THIRD line. *A.16* — `current` was applied after `done` in the style array, so a finished workout
> tapped to re-read put on the cream queued pill. Done outranks it now, and finished workouts fall
> to the end of the strip, struck through — which is what the canonical handoff already does on the
> wrist (`HUSH_V7_ALL_DARK.html:1647`). New gallery entry **2.1a "Today — driven"**: 2.1 is a static
> `HomeView` with `onChooseWorkout={noop}` and could not produce a single one of these four states.
>
> **THE CARDIO BATCH (B.6 · B.7 · B.8) IS CLOSED.** *B.6* — the legend was ASSEMBLED IN JSX,
> `{run} · {starting}` with a hard-coded separator, so Hebrew could neither reorder it nor
> conjugate it; both of his faults had that one cause. One key per locale now. *B.7* — the small
> type was **not drift**: it was a faithful 1:1 of the canonical handoff, which was drawn in
> ENGLISH, where those slots hold Latin capitals at heavy tracking. Hebrew has no uppercase, so it
> got the small size and none of what makes it legible. There is a floor now (`RUN_SMALL_PT`), and
> a law that walks every state of the run. *B.8* — one key, `finish_female`, covering the pause
> control and the confirmation behind it.
>
> ⚠️ **Two things I widened beyond his words, both reversible in one line:**
> (1) the DONE stage's readout labels moved with the live ones — they are the same three facts one
> screen apart and a mismatch would read as a bug; (2) `PausedStage`'s legend went 11 → 12.5, which
> the **lifting** session's pause screen shares. Its own header says it is one pause screen for the
> whole product, so it could not be legible on one surface and not the other.
>
> **Three new gallery entries** — 3.4d (the 3·2·1 countdown, where B.6 lived), 3.4e (paused) and
> 3.4f (the end sheet, where B.8's second half lived). None of the three could be reached before.
> **And the harness has a VOICE BAR now** (EN / עברית · he-him / she-her, under the frame): his
> whole B list is headed "Hebrew, female voice" and the gallery could speak neither.
>
> **C.19 IS CLOSED.** The "line across the middle connected to nothing" was **not the line** — the
> rule above the km/hr/kcal row is in the canonical file, at the top of the stat table. What was
> wrong was what stood above it: the GPS status sat in a FIXED 20 px slot ("no jump"), and with a
> lock — the ordinary case — that slot drew nothing, so between the body's two 30 px gaps the rule
> had EIGHTY pixels of void over it. The canonical body is three children on a 32 px rhythm; this
> had four. The band was also ~15 px low inside its own box (its labels were tucked inside instead
> of sitting above it); it is at the handoff's exact offsets now, verified in the browser. The HR
> half is `showsHeartRate(hr, watchPaired)` — a paired wrist OR a reading already arriving, because
> `watchPresence` is explicit that `known: false` means "we could not find out", never "no watch".
> The saved stage asks the other honest question (`avgHr != null`). New entry **3.4g** — 3.4 mounts
> a paired athlete, so the screen he was actually looking at had none.
>
> **C.20 IS BUILT — BUT NOBODY HAS SEEN IT.** Windows compiles no Swift; the widget's first honest
> picture is a device build. Two things it turned out to be:
> **(1) "Make calories legible" was not about type size — the calories were GONE.** The card had one
> 13 pt line that chose between the last split and the pace/kcal/bpm run-on. `lastSplitKm` comes off
> `splits[splits.length - 1]` and a split list never shrinks, so from the moment the first kilometre
> closed that line took the split branch and never came back: **no calories and no heart rate for
> every kilometre after the first, on every run.** The card is a table now, not a sentence — the
> split has its own slot, and each measured fact has a 19 pt figure over its own label.
> **(2) Why it was short beside Spotify's: the canonical 6.2 card's third row is a 46 pt "Log set"
> ACTION row.** We do not draw it — §8.5 is read-only and **the buttons are your open call**. So our
> card was the handoff's composition minus ~60 pt. That height now goes to the data, not to controls.
> Guarded by `__tests__/laws/theLockCardStatesEveryFact.test.ts` (a source reader — it cannot see
> what the card looks like, only that no branch can switch a measured fact off).
>
> ❓**ONE FOR YOU:** I left the **STRENGTH** lock card alone. It is short for the same reason — it is
> also the canonical minus its button row — but the height it is missing IS the button row, and
> redesigning its composition would pre-empt the decision you reserved. Say the word and it gets the
> same treatment.
>
> **THE HEBREW BATCH IS CLOSED BUT FOR ONE QUESTION.** *B.1* — unvowelled, "השאר" reads as the
> imperative "stay" before it reads as the noun "the rest"; "כל השאר" can only be the noun. *B.2* —
> `ob.healthHelper` addressed a man twice and had no feminine form; and the three measurements are
> three ROWS now, not "HR · KCAL · KM" crammed into one mono legend. They are exactly the three
> HealthKit types the app asks read access to — nothing invented. *B.9* — `memberSince_female`; the
> "חשבון" legend gets a RULE (every other section follows a bordered row, which supplies an edge for
> free — this one follows a bare paragraph, so at the same 20 px the word became the paragraph's
> last line); the plan-share row is gone from YOU; and "טווחי החזרות נוסעים" is now "כלולים".
> *B.11* — his exact sentence. *B.5's edge case* — **the act is pinned below the scroller now**, so
> Begin is on the glass whether the day holds two lifts or eight.
>
> ⚠️ `gender.test.ts` REFUSED my first draft of B.9's line: it scans for feminine markers as
> SUBSTRINGS, and "שלחי" lives inside "נשלחים". The linter was wrong about the word and right about
> the class, so the line was rephrased rather than the law loosened.
>
> ❓**B.5's REAL QUESTION IS STILL YOURS** — you asked for my opinion, so here it is, with the
> constraint I found:
> **Translate the DAY names; keep the EXERCISE names in English.** A day name ("Upper A") is a label
> we invented, so it is ours to say in Hebrew. An exercise name is the trade's proper noun — it is
> what the gym, the plate chart, every other app and every video calls it, and a Hebrew rendering of
> "Barbell Bench Press" is a translation nobody uses. That is also already the ratified rule
> (2026-06-30: exercise names English + BiDi isolate, muscle groups Hebrew), and it is why the
> screen reads broken today: the day name is the ONE English thing on it that did not have to be.
> **The constraint:** Today sets that name as a 54 px serif headline on ONE line. "פלג גוף עליון A"
> will not fit and will ellipsise. So it is a choice between a shorter Hebrew name and a smaller
> headline. My recommendation is the shorter name — **"עליון A" / "תחתון A" / "פול באדי"** — because
> the headline size is a v7 decision and the name is not. Say which and it is an afternoon: the
> stored name stays the stable structure-derived key, and only the DISPLAY translates.
>
> **A.4 IS CLOSED.** The back control names its DESTINATION — the word the tab bar itself uses
> (`nav.today`) — because on a screen opened from a door on Today, a bare chevron saying "back" is
> a guess. And the card is built the way the record poster is: the stage gradient poured into the
> frame, the wordmark carried whole, the split name in the coach's serif, and the days tag a moss
> WASH instead of a solid pill that was shouting over the payload it labels. ⚠️ **I could not find
> any white treatment on that screen** — it has been `stage[0]` since Rev 15 and never held
> `color.paper`, so what you saw may have been the OS share sheet or the PlanReceived screen. Worth
> a second look on the next build.
>
> ⚠️ **`svgBackgroundsAreSizedOneWay` caught my gradient before it reached a device** — I had
> written `<Svg style={absoluteFill} width="100%">`, the exact shape that drew the first-four
> card's gradient offset on your first workout (C.4). Then it caught my COMMENT explaining the
> fix, because it read the source as prose; it strips comments now, and still catches the real
> thing (verified both ways).
>
> **A.1 · A.8 · A.13 · C.1 · C.5 ARE CLOSED**, and they turned out to be one story: values chosen
> when this was a LIGHT instrument, carried unchanged onto v7's dark stage.
> *A.1* — iOS defaults a keyboard to light. There is exactly ONE `TextInput` in the app, so one
> word fixes it everywhere and cannot drift. *A.8* — not the colour (lit moss on near-black is all
> the contrast this palette has); a hairline glyph with **no surface under it** does not read as a
> thing to press. It has the wash back. *A.13* — six hand-rolled `opacity: pressed ? 0.5` fades,
> and **a word at half strength reads as disabled, not as pressed**. The product had already
> settled this: `press.opacity` is 1 and every `Button` answers a press by changing its FILL. A new
> law closed the class — **and immediately found two more the sweep had missed, both in the design
> system: `ListRow` at 0.55, and the MOSS button at 0.88 — which is the Resume button on the pause
> screen.** *C.1* — the toggle flipped a `useState` wired to `disabled` on three controls, so a
> round trip that resolves in a frame stepped the whole screen through its disabled state and back.
> It is a ref now; nothing re-renders. *C.5* — the scrim is **0.7, and that number was tuned against
> paper.** 70% black over `#131210` lands near `#050504`: the pause screen does not recede, it goes
> out. 0.45 says "this is behind now" and leaves 13.1 visibly standing still, which is its point.
>
> ⚠️ **I reopened a 2026-07-12 number.** What that ruling CLOSED is flat-vs-blur, and that stands
> untouched. The opacity was a separate paragraph, argued from "at 0.55 the screen behind stayed
> legible" — true of the light instrument, and the palette changed the answer.
>
> **C.18 · P0b.1 · C.15 ARE DONE.**
> *C.18* — there WAS a graph: at a single training day `Climb` draws a lone dot in the middle of a
> 138 px box. A dot in a void is not a graph, and it withheld the honest thing — one day is not a
> climb. Two points are the fewest that can rise, so the graph draws from the second day and the
> first gets a sentence in the same slot. Her CURRENT figure stays beside the title throughout.
> New entries **3.2c** (one day) and **3.2d** (never trained) — 3.2b hands the screen EIGHT days,
> so neither state anyone actually opens it on had an entry.
> *P0b.1* — onboarding wrote `units: 'kg'` for everybody. It reads `measurementSystem` now — the
> setting SHE chose when she set the phone up — falling back to the region. **That is what makes the
> control's disappearance honest rather than a removal: it moves to where iOS already keeps it.**
> `uk` resolves to KILOS on purpose: Britain weighs people in stones and its gyms in kilograms.
> WARNING: **I left the Units row in the YOU tab.** Removing it strands every existing athlete whose
> stored value disagrees with their region, with no way back. Say the word and it goes.
>
> **C.15 — THE ANSWER.** Loop 3 decides **per MUSCLE, never per exercise** (S-32). Complete every
> set for a muscle AND have one of its lifts advance, and that muscle earns +1 — which lands on one
> exercise inside it. An upper day trains three or four muscles, so three of them clearing that bar
> is **three separate decisions, not one decision applied three times.** The bar is deliberately
> high: not finishing then holds; finishing but nothing advanced holds (S-32b, "more volume breaking
> a stall is a theory"); and the whole thing is capped by your time budget. Three at once means
> three muscles each had a genuinely good session. **2.5 has said exactly this per muscle since
> Rev 15 (`4361c6e`, 2026-07-29) — the same day your pass is dated, so the build you read predates
> it.** New entry **2.5b** shows that screen with three muscles earning at once.
> WARNING: **driving it found a real bug in the answer itself** — the engine stamps the muscle raw
> (English, correctly: it is pure), the row's TITLE translated it and the sentence underneath did
> not, so a Hebrew athlete read the muscle in English inside a Hebrew sentence. Fixed on 2.5 and in
> the weekly letter. English gained too: the muscle keys are authored lowercase for mid-sentence,
> so it no longer capitalises one there.
>
> **P0.3 IS HALF SOLVED, AND PARKED ON PURPOSE** — branch
> `wip/p0-weekly-volume-follows-frequency` (`721e17a`, pushed). **It is not mergeable: one law fails,
> and that law is right.**
>
> **The defect.** B-2's base was a flat **10** — the same weekly volume whether you train twice a week
> or six times. The register never ruled that; it never asked. The mechanism sits one step lower than
> it looks: that number becomes an exercise COUNT, so a flat base meant **~20 exercises for the whole
> week**, dealt across however many days you train. Ten a day at two days; three a day at six.
>
> **Measured, before → after, across all ten builds:** sessions under 45 min **30/40 → 13/40** · the
> shortest session **12 min → 36 min** · the six-day week **156 → 282 min** · the two-day week
> unchanged at 120. Two things it forced, both real: emphasis had to become a RATIO (a flat +6 on a
> scaling base means less and less the more you train), and `startingWeeklySets` throws on a bad
> `days` — three test call sites had silently kept the old arity and were producing NaN programmes,
> because `__tests__` is not typechecked.
>
> ⚠️ **THE BLOCKER, and it is a genuine find.** `10 weeks · woman 52 kg · 4 days · leaves no lift dead
> on the floor of its equipment` now fails. More volume gives her a THIRD hamstring lift, and her
> pool's third is the barbell RDL. `canLoad` admits it — her modelled load lands at about the 20 kg
> bar, so "at or above the floor" passes — and she is then pinned there for four occurrences with
> her reps never reaching the band. **The selector needs a MARGIN, not "at or above the floor": a
> lift may only be chosen when there is room left to EASE.** That touches a ratified law (S-55b) and
> the rotation resolver shares the same function, so it is deliberate work, not a bolt-on. Do that,
> re-run the audit, land both — and only then unskip `everyProgramme`'s two assertions.
>
> **P0.4 is untouched and separate.** 3×/week still gives Upper A + Upper B + Lower A, because the
> engine knows ONLY upper/lower. The canonical three-day answer is full body, which it cannot
> express at all — that is a new split type, not a tuning.
>
> **DO NOT TOUCH** — these die or change under the AI move (see [[where-we-are-now]]):
> A.2, A.3, A.9, B.3, B.4, B.10, C.17, and the A.14 paywall half.
>
> **DEFERRED, needs the founder:** A.6 + C.16 are one design proposal for the set stage — he
> explicitly invited a proposal on the lift/set chrome. C.11's second half (the handoff's
> exercise-choice screen) is still his call. C.10 (what "learned rest" means) is copy + design.
>
> **HOW I WORK THESE:** read the code before assuming; drive the screen in the gallery
> (`preview_start {name:'hush-web-alt'}` → `http://localhost:8083#<id>`); write the test FIRST or
> immediately after and **verify it fails against the old code** — three of these tests passed
> against the bug on their first draft and had to be rewritten. Gate before every commit:
> `npx tsc --noEmit` · `npx jest` · `npm run lint:copy` · `npm run lint:rtl` ·
> `npx expo export --platform ios`. Run everything from `code/mobile`.
>
> ⚠️ **Never `git checkout` a file to undo a scratch edit** — it reverts uncommitted real work too.
> It bit me twice. Copy to the scratchpad and copy back instead.


The founder's own device pass on TestFlight build 36. **Every item he raised is here, verbatim in
intent, nothing merged away and nothing dropped.** Status column is the only thing that changes.

`open` · `doing` · `done` · `ask` (needs his decision before it can be built)

---

## P0 — THE PROGRAMME AUDIT (his stated first priority)

| # | Item | Status |
|---|---|---|
| P0.1 | Enumerate **every** programme the engine can generate — each sessions-per-week × sex × body-map default — and put them on a screen he can read. | **done** |
| P0.2 | Compare each one against the most established, widely-used programme in the world for that session count and sex. | **done** |
| P0.3 | **A 3-lift / ~25 min workout is not a workout.** Every session must land 45–60 min. (Screenshot 4: "Lower B · 3 LIFTS · ~25 MIN" was the 4th session of the week.) | open |
| P0.4 | **A 50 kg woman training 3×/week got a programme with duplicated/twin days.** He questions the whole split. Must be explained or fixed. | open |
| P0.5 | Verify the engine really does learn the loads (he is not convinced): "המנוע גם ככה לומד את המשקלים (אני מקווה ותבדוק את זה בכל מקרה)". | open |

## P0b — UNITS BY LOCATION

| # | Item | Status |
|---|---|---|
| P0b.1 | Detect the athlete's region and choose lb vs kg from it, so the units SETTING can disappear entirely. | **done** |

---

## A — ENGLISH / GENERAL LIST (his numbering)

| # | Item | Status |
|---|---|---|
| A.1 | Can the keyboard be dark? (screenshot 1 — a white system keyboard under the all-dark stage) | **done** |
| A.2 | The **Map screen appears in onboarding — remove it.** | open |
| A.3 | "Show my program" → Today: a momentary **screen flicker** before the transition. | open |
| A.4 | Share screen: **no way back to Today — no back control.** And restyle it in the manner of the personal-record share card; the current white treatment is ugly. | **done** |
| A.5 | **Today: the unit is missing** beside each exercise's weight. | **done** |
| A.6 | THE SET screen: the figure **37 is clipped**; the clock and `LIFT n/m` are **not centred**. His proposal: drop the Swap button under the video to free the room, then lower `LIFT` slightly (a little clearance from the clock). **Also:** gyms stock 2.5 kg jumps — why prescribe 8.5/side? At least on the first workout, maximise plate-accuracy and the athlete's opening load. **And:** find a more elegant way to carry the lift number and the set count than TEXT that steals focus — circles? He explicitly invites a proposal. | open |
| A.7 | **BUG:** Pause → "something doesn't feel right" → Back returns to the WORKOUT instead of the Pause screen — and afterwards **the Pause button no longer works at all.** | **done** |
| A.8 | Today: the **two-people icon is swallowed** by the background — effectively invisible. | **done** |
| A.9 | Tab bar: **tapping fires a haptic — remove it.** Transitions are not fully smooth; there is a small flicker. | open |
| A.10 | When the athlete **edits and confirms, it must confirm** — not bounce back to the set screen. | **done** |
| A.11 | **Remove the "next screen in 3 seconds" line AND its progress bar from every workout screen.** | **done** |
| A.12 | Today: **tapping the chips flickers.** | **done** |
| A.13 | Delete-account and Sign-out screens **look faded when pressed.** | **done** |
| A.14 | **"Share your plan" must leave the YOU tab** and live behind the two-people icon on Today — that icon is where everything person-to-person belongs. **Plus:** tapping "Hush Pro" opens the Paywall looking exactly as if all 14 workouts were spent. It must adapt to the athlete's actual workout number, and it must persuade — people may want to subscribe BEFORE the 14 run out, and it should say the trial converts to paid. He is open to another idea. | open |
| A.15 | Today: a **long exercise name truncates with an ellipsis** — needs a real solution. | **done** |
| A.16 | Today: a **completed workout's chip stays white**, reads like another workout still to do. And a completed workout may not belong in the row of pending ones at all — do something that reads as progress/achievement. | **done** |

---

## B — HEBREW, FEMALE VOICE (his numbering)

| # | Item | Status |
|---|---|---|
| B.1 | First screen: "רק להתאמן. השאר עליי." does not sound good in Hebrew. | **done** |
| B.2 | Connect-health: a sentence under the Apple Health toggle is in **masculine**. And in BOTH languages this screen should convey that she gets the most accurate measurements for her training, shown handsomely: one line calories · one line heart rate · one line kilometre (cardio). | **done** |
| B.3 | ABOUT YOU: the bottom line should read "אני בונה את תוכנית האימון שלך סביב זה" (**and the English equivalent**). And for a woman it must be **"עלייך", not "עליך"**. | open |
| B.4 | The 14-free-workouts screen at the end of onboarding **looks superb**, but the smallest text is still too small. | open |
| B.5 | Today: the **day name is in English**. He proposes "פלג גוף עליון" / "פלג גוף תחתון" / "פול באדי" instead of Upper A — and the same question for exercise names. **He asks for my opinion.** Right now Hebrew and English are mixed on one screen and it reads broken. **Edge case (both languages):** with many exercises the Begin button — and the free-workouts line — fall below the fold; it scrolls, but the athlete may simply not find Start. | **half done — the scroll fix is in; the NAMING is a question for him (below)** |
| B.6 | Cardio START reads "ריצה • מתחיל" — wrong order, and wrong gender. Swap the words and make it **"מתחילה"** for a woman. | **done** |
| B.7 | Cardio live screen: the type is **tiny** — "0 מטר", the kilometre label, and the word "קרדיו" at the top. Enlarge all of it; there is plenty of room. | **done** |
| B.8 | Finish-run screen: **"סיימי ושמרי"**, not "סיים ושמור" — including inside the confirmation that follows. | **done** |
| B.9 | YOU screen: **"חברה מאז"**, not "חבר מאז". Separate the word "חשבון" from the Apple Health text — they read as one subject. Plan-sharing moves to the two-people icon (see A.14). And **"טווחי החזרות נוסעים" is not Hebrew** — it makes no sense. | **done** |
| B.10 | Paywall: **the athlete's name must sit in the top lines** — "ליאור,⏎היה תענוג להתאמן איתך". **"חסכי"**, not "חסוך". In Israel the price must be in **shekels** — verify it really is. **And:** someone who reaches this screen has spent all 14 workouts and knows exactly what we are worth — he wants the three explanatory lines replaced with something better, and asks what I think. | open |
| B.11 | Plan-share screen: **"שתפי את תוכנית האימון שלך"**. | **done** |

---

## C — FROM THE SCREENSHOT ANNOTATIONS

| # | Screen | Item | Status |
|---|---|---|---|
| C.1 | 1.3 Connect health | The screen **flickers for a millisecond** when the toggle is pressed. | **done** |
| C.2 | 1.4 About you | The wheel **truncates its own number** ("82…"). Same wheel, same bug, in **Edit result**. | **done** |
| C.3 | 1.4 About you | The areas **around** the wheel also drag it — she must press exactly on the number to drive it. | **done** |
| C.4 | 2.0 First-four card | On the very first workout the card renders **misaligned / clipped** — "צריך לסדר את הבאג הזה". | **done** |
| C.5 | 13.1 Pause + End sheet | **The screen is faded.** | **done** |
| C.6 | 2.2b Edit set | The top row (back · lift name · SET… · clock) **collides** — the clock overlaps the label. He wants **that whole row deleted**, keeping only the clock where it naturally sits on the workout screen, and keeping the back control. | **done** |
| C.7 | 2.2b Edit set | **Remove the caption under "Save set"** ("36.5 kg × 8 — in your band"). | **done** |
| C.8 | 2.2b Edit set | **Enlarge the weight and reps figures.** | **done** |
| C.9 | 2.2 The set | A **decimal load overflows the screen** ("36.5" ran past the edge, and "8.25 kg a side" was clipped). | **done** |
| C.10 | 2.4d Rest · learned | **What "learned rest" means is not clear at all.** What actually happens when rests are shortened? And **adding +15 s shows nothing**, so the learning looks one-directional. | open |
| C.11 | 2.4b Transition rest | Swap appears **both** at the bottom AND the top exercise changes. He is considering **forcing the HTML's exercise-choice screen** instead. | open |
| C.12 | 2.4b Transition rest | The undo toast **overlaps the "+15 sec" control.** | **done** |
| C.13 | 2.3 Logged | "SET 2 OF 4 LOGGED · 14 kg × 8 · Set recorded." is **left over from the previous app.** Either restyle it to show entering the band / rising / falling out of it, **or simply delete the screen** — the next one already appears. | **done** |
| C.14 | 2.3 Correction | **Remove the "REST BEGINS IN 3" line and its bar.** (Same as A.11.) | **done** |
| C.15 | 2.5 Session earned | The engine **added a set to three different exercises** in one session. Not necessarily wrong — he wants to understand **why**. | **answered — see the banner; a Hebrew bug in the answer is fixed** |
| C.16 | 2.3b Final set | "LIFT 6/6 · SET 3 · FINAL · LOGGED · NEXT LIFT COMING UP" — **the screen does not look good enough.** | open |
| C.17 | 3.2 Progress | It reads **"+0 raises"** although the engine had just raised several lifts. Contradiction. | open |
| C.18 | 3.2b Lift detail | **No graph** when you open a lift. | **done** |
| C.19 | 3.4 Cardio live | **Not what the HTML draws.** There is a **line across the middle** connected to nothing — remove it. And for someone with **no Apple Watch, HR must not appear** — tie it to the same flag as the watch presence. | **done** |
| C.20 | 6.2 Live Activity | Our lock-screen activity is **small next to Spotify's.** Make it the same size, lay the data out better, and make calories legible. | **done — needs a device build to SEE** |

---

## Carried over, still his call

- **Live Activity buttons ("log a set" / +15 s / skip rest)** — OPEN, do not build, do not re-raise.
- **Billing** — its own topic at the end, including the rules for what counts as a completed workout.
- **§11 + the 11.4/11.5 audit** — its own topic at the end.
- **Dead copy tidy-up** — last.
