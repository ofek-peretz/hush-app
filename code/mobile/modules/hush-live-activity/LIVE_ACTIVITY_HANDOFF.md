# Live Activity / Dynamic Island — architecture

The Hush Live Activities (strength session + cardio) are split across two
locations; both build automatically in an EAS iOS build (no manual Xcode step):

- **App target — `modules/hush-live-activity/ios/`** (this Expo local module,
  autolinked): `HushLiveActivityModule` exposes `start/update/end` to JS and holds
  the single in-flight `Activity` (strength OR cardio — starting one kind ends the
  other). `HushSessionAttributes` / `HushCardioAttributes` are the ActivityKit
  `ContentState` definitions.
- **Widget extension — `targets/widget/`** (`@bacons/apple-targets`, bundle id
  `.widget`, deployment target 16.2): `HushWidgetBundle` + the SwiftUI Lock
  Screen / Dynamic Island presentations, plus a **duplicate copy of each
  attributes file**.

## Parity rule (do not violate)

ActivityKit decodes `ContentState` across the app↔widget process boundary by its
Codable shape. The attributes copies in `ios/` and `targets/widget/` MUST stay
byte-identical — a divergent copy silently stops the activity from
pairing/rendering (TestFlight item 8). If you change one, change the other.

## JS side

- `src/platform/liveActivity.ts` — the complete seam: projects the canonical
  `SessionMirror` (strength) / cardio tracker state into the exact ContentState the
  widget renders; resolves the native module `HushLiveActivity` when present and
  degrades to a no-op stub otherwise. Projection locked by
  `__tests__/flows/liveActivityMapping.test.ts`.
- Strength is driven by `sessionStore.tsx` (start/update per mirror change, end on
  complete/no-session); cardio by `src/screens/cardio/Cardio.tsx`.
- Standalone-watch note: the Live Activity mirrors the PHONE's session machine
  only. A watch-authority (phone-absent) workout never starts one; reconciliation
  writes history directly and involves no live session.

## Contract (do not violate)

- READ-ONLY projection — no completion / pause / skip controls from the Live
  Activity (spec §8.5; also impossible pre-iOS 17 App Intents).
- Strength shows no heart rate / calories. Cardio legitimately shows pace / HR /
  calories (recorded, never coached — sealed from the strength engine).
- One activity at a time; switching kinds ends the prior one.
- All countdowns ride absolute dates via `Text(timerInterval:)` (drift-proof);
  ranges must be guarded (`end > Date()`) — an inverted range traps.
- No `@available` guards inside the widget's result builders (deployment target is
  16.2, and the guards were a result-builder hazard).

Visual source of truth: the design sheet in
`screen shots/notes & Dynamic island & live activity/` (mono digits, stage/ochre
tokens; the mockup's interactive buttons are overridden by the read-only contract).

## 2026-09-08 — the lock screen is a control

The §8.5 read-only contract above is retired by the founder ("להזין סט כשהמסך סגור וגם מנוחה של
קיצור או הוספת 15 שניות"). What changed:

- `targets/widget/HushLockIntents.swift` — three `LiveActivityIntent`s (log the set as written,
  +15 s, start the next set). Each writes `{id, type, atMs}` to the App Group queue
  (`group.com.hushfitness.app` / `hush.lockIntents`), posts the Darwin notification
  `com.hushfitness.app.lockIntent`, then projects the tap onto the Live Activity locally and
  re-schedules the `hush.rest_done` notification with the next set's figures.
- `plugins/withLockIntents.js` compiles that file AND `HushSessionAttributes.swift` into the main
  app target as well (Apple's recipe: the intent is named by the widget, performed by the app).
- The widget target is iOS 17.0 (`Button(intent:)`), frameworks + `AppIntents`.
- `HushLiveActivityModule` listens for the Darwin notification, emits `onLockIntent`, and exposes
  `drainLockIntents()`; `sessionStore.applyLockIntents` replays each tap at its instant.
- `ContentState` grew the fields a tap needs offline (`restAfterS`, `nextSetLabel`, the alert
  words, the localized verbs). Both copies are byte-identical below the header —
  `theLockScreenIsAControl` compares them.

First build to verify on glass: tap "Done" on the lock screen with the app killed — the card must
turn into the rest within a second, the rest-over alert must fire with the next set's figures, and
opening the app must show the set logged at the tap's time (not at the wake's).

## 2026-09-08 (evening) — the card re-cut, her figures, the line that drains

Three findings from the founder's own workout, photographed:

- **The card was clipped top and bottom.** iOS gives a Lock Screen Live Activity 160 points and
  clips the excess, centred. The old composition summed to ~192. `StrengthLockView` is now a
  budget (14 padding · 18 name row · 8 · 40 figure row · 8 · [5 drain · 8] · 40 actions · 14):
  142 on a set, 155 on a rest. The brand mark rides the name row; the word "hush" is gone.
- **The moss line never moved.** It was a fraction taken at render time, and a Live Activity
  renders once per content update. It is `ProgressView(timerInterval:countsDown:)` now —
  system-driven, drains on its own, no phone update needed (`restInterval`).
- **Her figures from the locked phone.** Two steppers on the set row (`StrengthSetEntry`):
  load by the lift's detent (`weightStep`, from `domain/weightStep` on the phone), reps by one.
  Each turn is `HushAdjustFigureIntent` → `HushLockPending` (App Group, key `hush.lockPending`,
  keyed `liftIndex/setIndex`) → local redraw. Nothing is queued until "Done", which pushes
  `complete_set` WITH `weight`/`reps`; the phone replays it as `completeSet({ weight, reps })`.
  The module merges the parked figures on republish (same set only) so a tick cannot erase them.
  ContentState grew `unitLabel`, `weightStep`, `wordReps` (three copies, byte-identical below
  the header, as before).

And one rule on the phone side that changes what the card shows in the pocket (rewritten
2026-09-09): **no set is written by time.** The clock's presumption (2026-09-07 → 09, "law 4")
is cancelled outright by the founder; every set waits for her word — "Done" on this card, with or
without figures, the stage, the wrist or the voice — and the pocket's ask notification is armed
for every set instead of a rest-over alert. A rest she started still ends on the wall clock.

## 2026-09-09 — the steppers answer late, and sit on top of Done

Two findings from a workout on build 71: *"כשמעלים ומורידים מספרים ב-live activity זה משנה אבל
בדילאיי"* and *"הכפתורי מינוס פלוס קרובים מאוד להתחלת התרגיל וקל מאוד לפספס."*

- **The delay is the process waking.** A `LiveActivityIntent` is performed in the APP's process;
  with the screen locked the process is suspended within seconds, so every stepper tap first had
  to resume it. The session store now runs `modules/hush-voice-audio`'s keep-alive (a looping
  second of silence under `.playback` + `.mixWithOthers`, the `audio` background mode) from the
  Live Activity's start to its end, voice or no voice, so the process — and the intent handler,
  the JS clock and the lock-intent listener — stays awake for the whole workout. An interruption
  (a call) puts the loop back when it ends.
- **14 pt of air on a set.** The round keys (34 pt) stood 8 pt above the Done capsule; the set
  card spends 14 of its 18 unspent points between the figures and the act (`StrengthLockView`,
  `.padding(.top, 14)` on a set only). Budget: 156 on a set, 155 on a rest.

Still only a build can prove: the `@Parameter` intent from a `Button(intent:)` in the widget,
`ProgressView(timerInterval:)` inside the activity, and the 160-point fit on a real Lock Screen.

## 2026-09-08 (night) — "מוכן" from the card

The voice coach's loading dialogue (docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md §3.2) can be
answered by a thumb: while `awaitingReady` is true the set row shows **Ready** beside **Done**.
`HushSetReadyIntent` pushes `set_ready` to the App Group queue (the fourth verb on the wire;
`LOCK_INTENT_TYPES` and the Swift enum agree, in order) and clears the flag locally; the phone
replays it as `markSetStarted()` — the clock's stamp moves to the tap. ContentState grew
`awaitingReady` and `actReady` (three copies, byte-identical below the header, as before). The
flag is set only by the conductor, so without earbuds the row is exactly Done alone.
