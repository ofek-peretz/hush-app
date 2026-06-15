# Native / Platform Surfaces — build spec

These iOS-native surfaces are **wired in JS and configured**, but require a
**Mac + Xcode (or EAS cloud build)** to compile. They do **not** run in Expo Go
or on Windows. Each has a clean swap point in the app; dropping in the native
module is the only remaining step.

Build prerequisite for all three:
```
npx expo prebuild -p ios          # generates the native iOS project
eas build --profile development   # dev client (macOS or EAS cloud)
```

---

## 1. Live Activity / Dynamic Island / Lock Screen

**Status:** lifecycle fully wired. `src/state/stores/sessionStore.tsx` calls
`liveActivity.start/update/end` on session start, every phase/timer change, and
session end. Swap point: the `liveActivity` const in that file (currently
`liveActivityStub`). Config: `NSSupportsLiveActivities: true` (app.json, done).

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

**Status:** interface + config done. Swap point: the `health` const in
`src/platform/health.ts` (currently `healthStub`). `ConnectHealth` already calls
`health.requestPermission()` and routes through About You on denial (§7.11).
Config: `com.apple.developer.healthkit` entitlement + usage descriptions
(app.json, done).

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

## 3. Notifications (related platform surface)

`src/platform/notifications.ts` defines the contract (Weekly Program Ready at
20:00 local; event-driven threshold alert; **never** a receipt notification).
In-app destinations (Program, ThresholdAlert) exist. Wiring `expo-notifications`
scheduling + permissions is the dev-build step; swap `notifierStub`.
