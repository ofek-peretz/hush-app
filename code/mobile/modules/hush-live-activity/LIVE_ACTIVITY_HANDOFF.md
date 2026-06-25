# Live Activity / Dynamic Island — macOS/Xcode handoff

This documents the **Hush Live Activity** (Dynamic Island + Lock Screen) for both
the **strength** session and the **cardio** (Open training) activity. The entire
**JS / React Native side is complete and unit-tested**; what remains is native
integration and on-device verification, which require macOS + Xcode (ActivityKit +
WidgetKit cannot be built or previewed on this Windows/Expo environment).

The visual source of truth is the Claude Design project + the screenshots in
`screen shots/notes & Dynamic island & live activity/` and the Dynamic Island
spec sheet. Do **not** redesign — match the screenshots.

---

## What is DONE (React Native — verified: tsc + jest green)

- **`src/platform/liveActivity.ts`** — the complete seam:
  - `LiveActivityState` (kind `strength`): workout, phase (`set`/`rest`/`transition`/`paused`),
    exercise, set label, lift index/count, target weight×reps, absolute `restEndsAtMs`,
    rest total, and the upcoming lift during a transition.
  - `CardioLiveActivityState` (kind `cardio`): gait, paused, absolute `startedAtMs`,
    elapsed, distance, pace, HR, calories, and the latest km split.
  - `liveActivityStateFromMirror()` — pure projection from the canonical `SessionMirror`
    (locked by `__tests__/flows/liveActivityMapping.test.ts`).
  - `liveActivity` (strength) + `cardioLiveActivity` (cardio) hosts, resolving the native
    module `HushLiveActivity` when present and degrading to a no-op stub otherwise.
- **Wiring**:
  - Strength: the session store drives `liveActivity.start/update/end` across the set →
    rest → transition → paused → complete lifecycle (read-only mirror; no external
    completion control).
  - Cardio: `src/screens/cardio/Cardio.tsx` starts the activity when the run/walk goes
    live, updates it each second, and ends it when the screen unmounts.
- **Lock-screen notification** copy aligned to the design ("Your weekly update is ready /
  … Tap to see what changed", `notifications.weeklyReady*`), routing to the Weekly Update.
- **`app.json`** already declares `NSSupportsLiveActivities: true`.

## What is SCAFFOLDED (Swift — compiles only in Xcode)

Under `modules/hush-live-activity/`:
- `ios/HushSessionAttributes.swift` — strength `ActivityAttributes.ContentState` (matches the JS state).
- `ios/HushCardioAttributes.swift` — cardio `ActivityAttributes.ContentState`.
- `ios/HushLiveActivityModule.swift` — the Expo module: one `start/update/end` entry point,
  discriminated by `kind`, holding a single in-flight activity (lifting and running are
  mutually exclusive; switching kinds ends the prior one).
- `targets/widget/HushLiveActivityWidget.swift` — the WidgetKit UI: a `WidgetBundle` with
  the strength + cardio `ActivityConfiguration`s, each providing the Lock Screen view and
  the Dynamic Island compact / expanded / minimal presentations, using the app's tokens
  (stage / ochre / sage / JetBrains Mono). The rest countdown and cardio elapsed clock use
  `Text(timerInterval:)` so they are drift-proof.

---

## Remaining work (macOS + Xcode)

1. **Add a Widget Extension target** (e.g. `HushWidget`) to the iOS app in Xcode
   (File ▸ New ▸ Target ▸ Widget Extension, "Include Live Activity" checked).
2. **Share the attributes**: add `HushSessionAttributes.swift` and `HushCardioAttributes.swift`
   to **both** the app target and the widget target (Target Membership), or move them to a
   shared framework. ActivityKit decodes `ContentState` by its Codable shape across the
   app↔widget boundary — the copies must stay byte-identical.
3. **Place the widget UI** (`targets/widget/HushLiveActivityWidget.swift`) in the widget
   target; keep `@main` on `HushWidgetBundle` (remove the default template widget).
4. **Bundle the fonts** in the widget target (JetBrains Mono) or fall back to
   `.monospaced` system digits.
5. **Build a dev client / TestFlight build** (EAS or local) so `requireOptionalNativeModule`
   resolves `HushLiveActivity` — until then the JS host stays on the no-op stub.
6. **On-device QA** against the screenshots: strength set / rest (countdown) / transition /
   paused; cardio running / auto-paused / km-split. Verify the Dynamic Island compact pill,
   expanded panel, and Lock Screen banner; verify the rest/elapsed timers stay correct after
   lock/background (driven by the absolute dates, so they should).
7. **(Optional) Deep-link the tap**: route a tap on the Live Activity into the app
   (`Link`/`widgetURL`) to the live session or cardio screen.

## Contract (do not violate)

- The Live Activity is a **read-only projection**. No "Complete set" / completion control
  from the Dynamic Island (data integrity, spec §8.5).
- **Strength** shows no heart rate / calories. **Cardio** legitimately shows pace / HR /
  calories (it is a recorded activity, sealed from the strength engine — never feeds it).
- One activity at a time; starting one kind ends the other.
