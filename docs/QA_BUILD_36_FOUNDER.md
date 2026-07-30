# FOUNDER QA — BUILD 36 (2026-07-29)

> ## ▶ WHERE TO PICK THIS UP
> **Branch `feat/engine-progression-overhaul`, last commit `d74f933`, pushed. Tree clean.**
>
> **20 items closed** — A.5 · A.7 · A.10 · A.11 · A.12 · A.15 · A.16 · B.6 · B.7 · B.8 · C.2 ·
> C.3 · C.4 · C.6 · C.7 · C.8 · C.9 · C.12 · C.13 · C.14, plus the P0 programme audit (delivered as
> an artifact, defect NOT yet fixed).
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
> **NEXT, in this order:**
> 1. **C.19** — cardio live: the stray middle line, and HR must not show without a paired watch
>    (use the presence flag from `platform/watch/watchPresence`, already built).
> 2. **C.20** — the Live Activity is too small beside Spotify's.
> 3. **The Hebrew batch** B.1–B.3, B.5, B.9, B.11.
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
| P0b.1 | Detect the athlete's region and choose lb vs kg from it, so the units SETTING can disappear entirely. | open |

---

## A — ENGLISH / GENERAL LIST (his numbering)

| # | Item | Status |
|---|---|---|
| A.1 | Can the keyboard be dark? (screenshot 1 — a white system keyboard under the all-dark stage) | open |
| A.2 | The **Map screen appears in onboarding — remove it.** | open |
| A.3 | "Show my program" → Today: a momentary **screen flicker** before the transition. | open |
| A.4 | Share screen: **no way back to Today — no back control.** And restyle it in the manner of the personal-record share card; the current white treatment is ugly. | open |
| A.5 | **Today: the unit is missing** beside each exercise's weight. | **done** |
| A.6 | THE SET screen: the figure **37 is clipped**; the clock and `LIFT n/m` are **not centred**. His proposal: drop the Swap button under the video to free the room, then lower `LIFT` slightly (a little clearance from the clock). **Also:** gyms stock 2.5 kg jumps — why prescribe 8.5/side? At least on the first workout, maximise plate-accuracy and the athlete's opening load. **And:** find a more elegant way to carry the lift number and the set count than TEXT that steals focus — circles? He explicitly invites a proposal. | open |
| A.7 | **BUG:** Pause → "something doesn't feel right" → Back returns to the WORKOUT instead of the Pause screen — and afterwards **the Pause button no longer works at all.** | **done** |
| A.8 | Today: the **two-people icon is swallowed** by the background — effectively invisible. | open |
| A.9 | Tab bar: **tapping fires a haptic — remove it.** Transitions are not fully smooth; there is a small flicker. | open |
| A.10 | When the athlete **edits and confirms, it must confirm** — not bounce back to the set screen. | **done** |
| A.11 | **Remove the "next screen in 3 seconds" line AND its progress bar from every workout screen.** | **done** |
| A.12 | Today: **tapping the chips flickers.** | **done** |
| A.13 | Delete-account and Sign-out screens **look faded when pressed.** | open |
| A.14 | **"Share your plan" must leave the YOU tab** and live behind the two-people icon on Today — that icon is where everything person-to-person belongs. **Plus:** tapping "Hush Pro" opens the Paywall looking exactly as if all 14 workouts were spent. It must adapt to the athlete's actual workout number, and it must persuade — people may want to subscribe BEFORE the 14 run out, and it should say the trial converts to paid. He is open to another idea. | open |
| A.15 | Today: a **long exercise name truncates with an ellipsis** — needs a real solution. | **done** |
| A.16 | Today: a **completed workout's chip stays white**, reads like another workout still to do. And a completed workout may not belong in the row of pending ones at all — do something that reads as progress/achievement. | **done** |

---

## B — HEBREW, FEMALE VOICE (his numbering)

| # | Item | Status |
|---|---|---|
| B.1 | First screen: "רק להתאמן. השאר עליי." does not sound good in Hebrew. | open |
| B.2 | Connect-health: a sentence under the Apple Health toggle is in **masculine**. And in BOTH languages this screen should convey that she gets the most accurate measurements for her training, shown handsomely: one line calories · one line heart rate · one line kilometre (cardio). | open |
| B.3 | ABOUT YOU: the bottom line should read "אני בונה את תוכנית האימון שלך סביב זה" (**and the English equivalent**). And for a woman it must be **"עלייך", not "עליך"**. | open |
| B.4 | The 14-free-workouts screen at the end of onboarding **looks superb**, but the smallest text is still too small. | open |
| B.5 | Today: the **day name is in English**. He proposes "פלג גוף עליון" / "פלג גוף תחתון" / "פול באדי" instead of Upper A — and the same question for exercise names. **He asks for my opinion.** Right now Hebrew and English are mixed on one screen and it reads broken. **Edge case (both languages):** with many exercises the Begin button — and the free-workouts line — fall below the fold; it scrolls, but the athlete may simply not find Start. | open |
| B.6 | Cardio START reads "ריצה • מתחיל" — wrong order, and wrong gender. Swap the words and make it **"מתחילה"** for a woman. | **done** |
| B.7 | Cardio live screen: the type is **tiny** — "0 מטר", the kilometre label, and the word "קרדיו" at the top. Enlarge all of it; there is plenty of room. | **done** |
| B.8 | Finish-run screen: **"סיימי ושמרי"**, not "סיים ושמור" — including inside the confirmation that follows. | **done** |
| B.9 | YOU screen: **"חברה מאז"**, not "חבר מאז". Separate the word "חשבון" from the Apple Health text — they read as one subject. Plan-sharing moves to the two-people icon (see A.14). And **"טווחי החזרות נוסעים" is not Hebrew** — it makes no sense. | open |
| B.10 | Paywall: **the athlete's name must sit in the top lines** — "ליאור,⏎היה תענוג להתאמן איתך". **"חסכי"**, not "חסוך". In Israel the price must be in **shekels** — verify it really is. **And:** someone who reaches this screen has spent all 14 workouts and knows exactly what we are worth — he wants the three explanatory lines replaced with something better, and asks what I think. | open |
| B.11 | Plan-share screen: **"שתפי את תוכנית האימון שלך"**. | open |

---

## C — FROM THE SCREENSHOT ANNOTATIONS

| # | Screen | Item | Status |
|---|---|---|---|
| C.1 | 1.3 Connect health | The screen **flickers for a millisecond** when the toggle is pressed. | open |
| C.2 | 1.4 About you | The wheel **truncates its own number** ("82…"). Same wheel, same bug, in **Edit result**. | **done** |
| C.3 | 1.4 About you | The areas **around** the wheel also drag it — she must press exactly on the number to drive it. | **done** |
| C.4 | 2.0 First-four card | On the very first workout the card renders **misaligned / clipped** — "צריך לסדר את הבאג הזה". | **done** |
| C.5 | 13.1 Pause + End sheet | **The screen is faded.** | open |
| C.6 | 2.2b Edit set | The top row (back · lift name · SET… · clock) **collides** — the clock overlaps the label. He wants **that whole row deleted**, keeping only the clock where it naturally sits on the workout screen, and keeping the back control. | **done** |
| C.7 | 2.2b Edit set | **Remove the caption under "Save set"** ("36.5 kg × 8 — in your band"). | **done** |
| C.8 | 2.2b Edit set | **Enlarge the weight and reps figures.** | **done** |
| C.9 | 2.2 The set | A **decimal load overflows the screen** ("36.5" ran past the edge, and "8.25 kg a side" was clipped). | **done** |
| C.10 | 2.4d Rest · learned | **What "learned rest" means is not clear at all.** What actually happens when rests are shortened? And **adding +15 s shows nothing**, so the learning looks one-directional. | open |
| C.11 | 2.4b Transition rest | Swap appears **both** at the bottom AND the top exercise changes. He is considering **forcing the HTML's exercise-choice screen** instead. | open |
| C.12 | 2.4b Transition rest | The undo toast **overlaps the "+15 sec" control.** | **done** |
| C.13 | 2.3 Logged | "SET 2 OF 4 LOGGED · 14 kg × 8 · Set recorded." is **left over from the previous app.** Either restyle it to show entering the band / rising / falling out of it, **or simply delete the screen** — the next one already appears. | **done** |
| C.14 | 2.3 Correction | **Remove the "REST BEGINS IN 3" line and its bar.** (Same as A.11.) | **done** |
| C.15 | 2.5 Session earned | The engine **added a set to three different exercises** in one session. Not necessarily wrong — he wants to understand **why**. | open |
| C.16 | 2.3b Final set | "LIFT 6/6 · SET 3 · FINAL · LOGGED · NEXT LIFT COMING UP" — **the screen does not look good enough.** | open |
| C.17 | 3.2 Progress | It reads **"+0 raises"** although the engine had just raised several lifts. Contradiction. | open |
| C.18 | 3.2b Lift detail | **No graph** when you open a lift. | open |
| C.19 | 3.4 Cardio live | **Not what the HTML draws.** There is a **line across the middle** connected to nothing — remove it. And for someone with **no Apple Watch, HR must not appear** — tie it to the same flag as the watch presence. | open |
| C.20 | 6.2 Live Activity | Our lock-screen activity is **small next to Spotify's.** Make it the same size, lay the data out better, and make calories legible. | open |

---

## Carried over, still his call

- **Live Activity buttons ("log a set" / +15 s / skip rest)** — OPEN, do not build, do not re-raise.
- **Billing** — its own topic at the end, including the rules for what counts as a completed workout.
- **§11 + the 11.4/11.5 audit** — its own topic at the end.
- **Dead copy tidy-up** — last.
