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
