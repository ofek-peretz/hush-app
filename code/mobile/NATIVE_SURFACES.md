# Native / Platform Surfaces — build spec

These iOS-native surfaces are **wired in JS and configured**, but require a
**Mac + Xcode (or EAS cloud build)** to compile. They do **not** run in Expo Go
or on Windows. Each has a clean swap point in the app; dropping in the native
module is the only remaining step.

## NATIVE IMPLEMENTATION COMPLETE (2026-06-16) — compile-pending only

All four surfaces now have their native code in the repo behind the existing swap
points (selected on iOS, degrading to the stub everywhere else). Verified on
Windows: `tsc` clean, `npm test` **218/218**, copy-lint pass, `expo config
--type prebuild` resolves. The ONLY remaining work is native compilation + device
verification (macOS/EAS) — see each surface's "Native steps", now satisfied in code:

- **HealthKit:** `@kingstinct/react-native-healthkit@14.0.2` (SDK-54 / RN-0.81 / New-Arch
  line; needs `react-native-nitro-modules`) + `src/platform/health/healthKitGate.ts`
  (read-only bodyMass + distanceWalkingRunning), selected in `health.ts` on iOS. tsc
  validates the gate against the real v14 type defs.
- **Live Activity:** local module `modules/hush-live-activity` (Swift/ActivityKit) +
  widget extension `targets/widget` (`@bacons/apple-targets`); host in `liveActivity.ts`.
- **Watch:** local module `modules/hush-watch-connectivity` (phone WCSession) + watchOS
  app `targets/watch` (SwiftUI, all screens + haptics); transport in `watchTransportNative.ts`.
- **Notifications:** already real (`notifierExpo`).

Build prerequisites added: `@bacons/apple-targets` + `@expo/prebuild-config` (devDeps;
the latter is required for apple-targets to resolve on SDK 54 — expo-doctor flags it as
a "direct install" but it is intentional). **One value the founder must supply** before
signing the extra targets: `ios.appleTeamId` in app.json (Apple Team ID).

## Apple native preparation phase — status (2026-06-15)

All non-native layers for the four surfaces are **implemented + tested** (no
Apple Developer account, watchOS target, physical hardware, or TestFlight
required). Highlights:

- **Canonical projection:** `src/platform/sessionMirror.ts` is the SINGLE
  read-only projection (`projectSessionMirror`) consumed by Live Activity,
  Dynamic Island, **and** the Apple Watch — no duplicate projection system. It
  carries an absolute `restEndsAt` so every surface renders a drift-proof timer.
- **Event taxonomy:** `src/platform/events.ts` catalogues every learnable event
  across the four surfaces; all flow through the existing durable, append-only
  telemetry pipeline (`platform/telemetry.ts`) → backend `athlete_event`. There
  is no parallel event store, so there is one dataset and no interaction is lost.
- **HealthKit:** data model + ingestion pipeline + permission-state + denied path
  + persistence (`db.healthState`, schema v2) + telemetry — `health/`.
- **Notifications:** versioned payload schema + lifecycle telemetry
  (scheduled/delivered/opened/coalesced/canceled) + delivery listener.
- **Watch:** full protocol + bridge with source-of-truth enforcement, offline
  rules, and telemetry, driven by an injectable transport (`watch/`).

Coverage: `npm run typecheck` clean; `npm test` 170/170. Remaining work for each
surface is the **native module only** (below) — Swift/ActivityKit/WatchKit/
WCSession + a dev build.

Build prerequisite for all three:
```
npx expo prebuild -p ios          # generates the native iOS project
eas build --profile development   # dev client (macOS or EAS cloud)
```

---

## 1. Live Activity / Dynamic Island / Lock Screen

**Status:** lifecycle fully wired off the **canonical SessionMirror**.
`src/state/stores/sessionStore.tsx` projects the mirror once per state change
(`projectSessionMirror`) and drives `liveActivity.start/update/end` from it
(start/ended telemetry via `LIVE_ACTIVITY_EVENTS`). Swap point: the
`liveActivity` const (currently `liveActivityStub`). The host renders a SUBSET of
the mirror. Config: `NSSupportsLiveActivities: true` (app.json, done).

**Contract (spec §8.5) — do not violate:** read-only mirror of session state;
the **timer is the hero, tabular**; **no Complete-Set / completion control from
outside the app**; no progress ring, heart rate, calories, or streak.

**Native steps:**
1. Add a Widget Extension target (Swift, ActivityKit).
2. `ActivityAttributes` mirroring `SessionMirror`:
   ```swift
   struct HushSessionAttributes: ActivityAttributes {
     struct ContentState: Codable, Hashable {
       var exerciseName: String
       var restEndDate: Date?   // drives the native countdown when resting
       var setLabel: String
     }
   }
   ```
3. Lock Screen + Dynamic Island (compact/expanded) views: render the rest
   countdown with `Text(timerInterval:)` (monospaced/tabular), the exercise name,
   and the set label. No buttons.
4. Native module exposing `start/update/end` → implement `LiveActivityHost` in
   JS (replace `liveActivityStub`). Pass `restEndDate = now + restRemainingS`.

---

## 2. HealthKit

**Status:** contract + data model + ingestion pipeline + persistence + telemetry
done; only the native gate remains. Swap point: the `health` const in
`src/platform/health.ts` (currently `healthStub`). The expanded `HealthGate` adds
`permissionState()`, `latestBodyweight()`, and `recentWalks()`. `ConnectHealth`
calls `requestPermission()`, telemeters the grant/deny via `recordPermissionOutcome`,
and routes through About You on denial (§7.11). On boot, `appStore` runs
`ingestHealth` (`health/healthIngestion.ts`): convenience-only, silent bodyweight
adoption into the Profile (iPhone stays source of truth), **never a model input**,
idempotent, and a no-op on denied/unavailable. The connection record persists via
`db.healthState` (schema v2). Config: `com.apple.developer.healthkit` entitlement
+ usage descriptions (app.json, done).

**Contract:** HealthKit is **NOT a model input** (ratified OD) — bodyweight
updates flow **silently** to the profile, no UI (§10.3). Walk/Run come from
Health only (never manual) and populate History → Walk Detail.

**Native steps:**
1. Add a HealthKit RN library as a dev-build dependency (e.g.
   `@kingstinct/react-native-healthkit`). Do **not** add it to the Expo-Go
   bundle — it needs the dev build.
2. Implement `HealthGate`:
   - `requestPermission()` → request **read** for `bodyMass`,
     `distanceWalkingRunning`/`stepCount`. Return whether authorized.
   - `latestBodyweightKg()` → most-recent `bodyMass` sample in kg, else null.
3. Replace `health = healthStub` with the HealthKit gate.
4. (Walk Detail) Add a `walks()` reader for History's Walk/Run rows.

---

## 3. Notifications (WIRED — no Apple Developer access required)

**Status: implemented.** `src/platform/notifications.ts` now ships a real
`expo-notifications`-backed `notifier` (the active export; `notifierStub` is kept
as the test/non-native swap point). These are **LOCAL** notifications — they need
no APNs key and no `aps-environment` entitlement, so they work in any EAS
dev/preview/production build today.

- Weekly Program Ready: 20:00 local, weekly-repeating, title from
  `notifications.weeklyReadyTitle`, **no body**; scheduled idempotently from
  `appStore` on onboarding/enrollment. Cadence is anchored to the weekday the
  plan became ready (the one product assumption here — confirm with founder).
- Threshold alert: immediate, event-driven, coalesced via a stable id, title
  `notifications.thresholdTitle` (**placeholder copy — confirm with founder**).
  Not yet invoked by any caller (dormant, by design).
- Calm defaults: foreground banner shown, **no sound, no badge**.
- Config: `expo-notifications` plugin added to `app.json`.

Remaining (needs the build, not Apple Developer access): run a dev build and
verify the OS permission prompt + delivery on a device. A future *remote/push*
channel (not in v1) would be the only part requiring APNs + Apple Developer.

Now also: versioned payload schema (`buildPayload`, `NOTIF_PAYLOAD_VERSION`),
full lifecycle telemetry (`NOTIFICATION_EVENTS`: scheduled / delivered / opened /
coalesced / canceled / permission_denied) wired in `notifications.ts` + `Root.tsx`
(`addNotificationDeliveryListener`), so delivered-vs-opened (and therefore
"ignored") is reconstructable from the dataset. In-session receipts are captured
as `receipt_surfaced` (receipts are never notifications, §8.6).

---

## 4. Apple Watch companion

**Experience spec (CANONICAL):** `WATCH_EXPERIENCE_SPEC.md` (founder-approved
2026-06-15) is the source of truth for the watch athlete experience — every
state, layout, haptic, transition, and the locked copy. It lists the only mirror
+ protocol additions the experience needs (`completedExerciseName`, an
Exercise-Busy availability flag, and a new `exercise_busy` intent).

**Status (non-native): implemented + tested.** The iPhone is the sole authority;
the watch is a remote terminal with no local workout DB, no model execution, and
no independent lifecycle. All application-layer pieces exist and run without a
watchOS target or hardware:

- **Protocol** (`src/platform/watch/protocol.ts`, pure): phone→watch
  `WatchStateEnvelope` (carries the canonical mirror + a monotonic `authoritySeq`),
  watch→phone `WatchIntent` schema, `decideWatchIntent` (the source-of-truth
  guard — rejects malformed / wrong-version / duplicate / stale / phase- or
  index-mismatched intents), intent→`SessionEvent` mapping, and offline/freshness
  rules (`WATCH_INTENT_TTL_MS`).
- **Bridge** (`src/platform/watch/watchBridge.ts`): `WatchSession` orchestrates
  publish + intent handling + reachability lifecycle + de-dupe + completion
  latency, all telemetered (`WATCH_EVENTS`). The native WatchConnectivity is the
  injected `WatchTransport` swap point (currently `watchTransportStub`).
- **Wiring:** `sessionStore.tsx` publishes the SAME mirror it gives the Live
  Activity to `WatchSession`, and maps accepted watch intents to the exact view
  actions an in-app tap fires (a watch Complete Set accepts the recommended
  target — editing stays phone-only).

**Validated flow:** Active Set → Rest → Workout Complete maps to the mirror
phases `active_set` → `rest_inter`/`rest_transition` → `complete`. The watch
"Workout Complete" is a read-only terminal frame; the phone owns the save-order
invariant (§8.4) and the watch never triggers the save.

**Offline rule:** the watch is a terminal — completion intents are never queued
on it (would risk double-logging / broken save-order); a stale intent after a
reconnect is rejected; the phone completes workouts entirely on its own.

**Is there a watch at all? (`pairingState`, added 2026-07-29.)** The one native
read that is not about the connection but about the DEVICE. `isReachable` cannot
answer it — that is false whenever the watch app is not in the foreground, which
is nearly always — so the module exposes `WCSession.isPaired` /
`isWatchAppInstalled` alongside an `activated` flag, and JS reads them through
`src/platform/watch/watchPresence.ts`. Nothing built on it may ever appear for an
athlete who owns no Apple Watch, so the seam is deliberately three-valued:
**UNKNOWN** (no native module, or activation has not finished) is never spent as a
"no". On web / Expo Go / jest it is always UNKNOWN and nothing shows.

Two surfaces read it, and between them every athlete is covered exactly once —
`hush.watch.offered` ("she has been told") is the single seam:

| when she got the watch | who tells her |
| --- | --- |
| before onboarding | **1.3 · Connect health** — a ruled notice row under the Health card, drawn only when paired. Sets the flag on the way out. |
| after onboarding, or WCSession answered too late for 1.3 | **10.4 · On your wrist** — a state of Today, armed because the flag is unset. |
| never | neither |

Both surfaces resolve the face through the same pure `wristFace()`, so they cannot
disagree. Neither is drivable from the browser gallery (no WCSession), so each has
a documented preview seam: `ConnectHealth`'s `previewWrist` route param, and
10.4's `offer` prop.

**Native steps (require macOS + a watchOS target — out of this phase):**
1. Add a watchOS app target (SwiftUI) to the prebuilt iOS project, protected by a
   config plugin (or a committed `ios/`) so it survives `expo prebuild --clean`.
2. Implement a `WatchConnectivity` (`WCSession`) native module on **both** sides
   and expose it as a `WatchTransport` (replace `watchTransportStub`): phone→watch
   via `updateApplicationContext` (coalesced last-write-wins) + `sendMessage`
   (low-latency); watch→phone via `sendMessage` carrying `WatchIntent`s.
3. Build the three watch screens to render the mirror subset; anchor the rest
   timer on `mirror.restEndsAt`.
4. (Optional) An `HKWorkoutSession` purely as a runtime/sensor container **slaved
   to the phone** — never an independent lifecycle, and HR/calories must NOT enter
   any model input path.
5. Validate on a physical paired iPhone + Apple Watch (no simulator shortcut).
