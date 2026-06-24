# Launch-readiness cleanup changelog

Running log of engineering fixes made to prepare Hush for public launch. Each entry: what changed and why. Verification (`tsc --noEmit` + `jest` + `expo export`) re-run after each commit.

Baseline before this work: tsc clean, jest 452/452 (51 suites).

## 1. Remove orphaned pre-redesign components
Deleted 12 component files that were left behind by the LIGHT-instrument redesign and are now imported nowhere (verified across `src/`, `__tests__/`, `App.tsx`, `App.web.tsx`). The live screens use `components/ds/*` and inline implementations instead:

- `BackBar`, `BackButton` → replaced by `ds`/inline back affordances
- `DraggableList` → reordering done via gesture-handler inline
- `MenuSheet` → replaced by `MenuSheet`'s successor / inline menu
- `ProgressArrow` → replaced by `ds`
- `ReplacementSheet` → replaced by `SwapSheet`
- `RestTimer` → replaced by `ds/RestRing`
- `SecondaryButton` → replaced by `ds/Button`/`IconButton`
- `SlideToStart` → replaced by inline slide affordance
- `WeightDisplay` → replaced by `ds`/inline weight rendering
- `WorkoutCard`, `WorkoutTopBar` → replaced by `ds`/inline workout rendering
- `Divider05` → replaced by `ds`/inline dividers
- `PrimaryButton` → replaced by `ds/Button`
- `TopSheet` → unused (only `BottomSheet` is live)

Why: dead code increases maintenance/compile surface and confuses future readers about which components are live. No behavior change. (15 files total; `ds/*` and `onboarding/*` components all verified still in use.)

## 2. Fix stale comments referencing removed features
Updated misleading comments that still named features removed in the v4 migration / Bayesian decommission. No code paths changed:

- `app/navigationRef.ts`, `platform/notifications.ts` — removed references to the non-existent `ThresholdAlert` route / `threshold_alert` intent (the Portrait threshold alert was removed; that intent kind no longer exists in `NotificationIntent`).
- `app/Root.tsx` — removed the dead comment block describing `threshold_alert` routing (no such intent kind remains).
- `platform/events.ts` — `notification_scheduled` doc no longer claims a "threshold" notification fires.
- `data/api/httpClient.ts` — header comment no longer points at the removed `programChanges` model-client method; notes the v4 Weekly Update is the live surface.

Why: comments that name deleted features mislead the next reader during launch hardening.

## 3. Launch on-device only (production runs the v4 engine)
**Founder decision (2026-06-24):** the launch build runs entirely on-device on the v4 engine.

Root cause fixed: production `eas.json` set `EXPO_PUBLIC_API_BASE_URL=https://hush-api.fly.dev`, so
onboarding's `selfEnroll` adopted a server token and `selectModel()` switched the app to
`HttpModelClient` — which does NOT use the v4 engine (v4 only runs on the on-device `fixtureModel`
path). A production build therefore would have run the deployed server engine, bypassing v4 — and that
backend's source was deleted in `2e8e21f` (along with the `build/_assembled` inputs `fly.toml` needs),
so it is undeployable/unmaintainable.

- `code/mobile/eas.json` — removed the `EXPO_PUBLIC_API_BASE_URL` env from the `preview` and
  `production` profiles. With no base URL, `selectModel()` always picks `fixtureModel` (→ v4),
  `selfEnroll` short-circuits, telemetry buffers locally (no sink), and Delete Account is a local wipe.
- Moved the dead Fly.io deploy stack to `reference/` (`reference/fly.toml`, `reference/deploy/`) — it
  references deleted build inputs and cannot build; preserved as topology for a future v4 backend.
  Documented in `reference/backend/README.md`.

Implications (accepted): no server-side research telemetry / crash reports, no server identity, and
account deletion is local-only until a v4 backend is built. All restorable by re-adding the URL.

## 4. Remove the legacy rollback engine (v4 is the sole engine)
**Founder decision (2026-06-24):** no second engine path remains. The v4 engine in `src/engine/v4`
is the single source of every prescription. Removed:

- `src/engine/v4/flag.ts` — deleted the `isV4Enabled`/`setV4Enabled` feature flag.
- `src/data/progression.ts` — removed `prescribe()` (legacy equipment-aware double progression) and
  its helpers (`Prescription`, `Performance`, `performances`, `RANGE_SPREAD`). **Kept** `computePortrait`
  and the Portrait math (still used by `portraitSnapshot`).
- `src/data/api/fixtureModel.ts` — removed the flag-OFF branch in `generateProgram` and
  `sessionTargets`; v4 now always seeds slots and sources targets. Dropped the now-unused
  `CALIBRATION_SESSIONS` constant and the legacy per-set `reasonType`/`forecast` voice (v4 surfaces
  "why" via the Weekly Update, not per-set targets — this voice was already dead in production with
  the flag ON).
- `src/app/Root.tsx`, `src/screens/dev/V4Debug.tsx` — dropped the flag import; the weekly notification
  always routes to the v4 Weekly Update; the debug screen no longer prints a flag state.
- Tests: deleted `progression.test.ts` (tested `prescribe`) and `fixtureAdvisory.test.ts` (tested the
  removed legacy advisory voice). Dropped flag toggling from `v4_integration`, `v4_sims`,
  `programCoverage`, and removed the "flag OFF" integration block. Added `beforeEach(db.clearAll)` to
  `programCoverage` (v4 persists slot state, so the cold-start fallback tests now need isolation).

Verification: tsc clean, jest 437/437 (49 suites), `expo export --platform ios` clean.

## 5. Remove the Forecasts feature (prediction → react-don't-predict)
**Founder decision (2026-06-24):** Forecasts is a prediction feature (not goal-tracking) and was
already dead in the on-device v4 build — no producer of `SetTarget.forecast` on the v4 path, no
caller of `createPortraitForecast` (the Portrait screen is gone), and the in-session receipt was
rendered by no screen. Removed end-to-end:

- **Data model** (`models.ts`): deleted `ForecastSeed`, `ForecastState`, `ForecastRecord`,
  `SetTarget.forecast`, and the `'hold'` member of `ReasonType` (now `'increase' | 'decrease'`).
- **Persistence** (`db.ts`): removed `db.forecasts` (`loadForecasts`/`saveForecasts`, the
  `hush.forecasts` key).
- **Logic**: deleted `domain/receiptRules.ts` (entirely forecast resolution); removed the forecast
  exports from `domain/portrait.ts` (`buildPortraitForecast`, `forecastableLagging`,
  `commitmentTargets`, `commitmentLine`, `ACTIONABLE_CONFIDENCE`) — kept the Portrait math
  (`barFraction`, `strongestConfident`, `laggingConfident`, `isStillLearning`, `compareProof`, …);
  removed `forecastLine` from `domain/voice.ts` and `mayForecast` from `domain/modeGate.ts`.
- **Stores**: stripped all forecast paths from `appStore.tsx` (`forecasts` state, `pendingPortraitReceipt`,
  `createPortraitForecast`, `issueHoldForecast`, `resolveHoldForecasts`, `clearPortraitReceipt`,
  `devResolvePortraitForecast`, the portrait-forecast resolution in `recordSessionCompleted`) and
  `sessionStore.tsx` (the increase/hold resolution block, `pendingReceipt`/`receiptLine`, the
  `forecast_*`/`receipt_surfaced` telemetry). Kept Portrait snapshots, capability trajectory, and
  the general `set_completed` event.
- **HTTP adapter** (`httpClient.ts`, `decisionMap.ts`): dropped the forecast + `'hold'` mapping
  (increase/decrease reason line only).
- **Analytics** (`events.ts`): removed the `receipt_surfaced` event; the `forecast_created`/
  `forecast_resolved`/`first_forecast_*`/`first_receipt_*`/`first_hold_*` track calls are gone.
- **Copy** (`en.json`/`he.json`): removed `forecastIncrease`, `forecastHold`, `forecastFrame`,
  `receiptClean`, `receiptWithReps`, `reasonHold`, `holdingLast`, `portrait.commitment`,
  `portrait.receiptClosed`.
- **Tests**: deleted the pure-forecast suites (`portraitForecast`, `portraitProductionResolution`,
  `receiptAsymmetry`); retargeted `decisionMap`, `advisoryVoice`, `calibrationSilence`,
  `portraitLogic`, `portraitCopy` to the surviving reason/Portrait behavior.

Verification: tsc clean, jest 412/412 (46 suites), copy-lint pass, `expo export --platform ios` clean.

## 6. Remove dead components (LogoMark, Wheel)
Final dead-path sweep. Deleted two component files imported nowhere in `src/`, `__tests__/`,
or `App*.tsx`:

- `components/LogoMark.tsx` — the live logo is `HushMark`; `LogoMark` survived only as a name in
  a `tokens.ts` comment. Removed the orphaned `accent` gradient export it was the sole consumer of
  (the comment said it was "retained for the LogoMark only"; product surfaces use the flat
  `color.accent`, never the gradient).
- `components/Wheel.tsx` — the old wheel picker; onboarding now uses `ds/SegmentedControl` +
  `ds/Stepper`. The only `Wheel` string left in `src` is the "Ab Wheel Rollout" exercise name.

Why: leftover pre-redesign UI with zero importers. No behavior change.

## 7. Remove unused design tokens + domain helpers
Deleted exported utilities with zero callers anywhere in `src/` or `__tests__/` (verified by
`ts-prune` + per-symbol grep). No behavior change — each was superseded by an inline or `ds/*`
implementation:

- `design/tokens.ts` — `scaleFactor` (the `s()` scaler uses the private `_scaleFactor`), `a11y`,
  `tabBar` ("kept for any chrome that still references it" — nothing does; Hush has no tab bar),
  `tnum`/`heroNum` and their now-orphaned `TABULAR`/`FontVariant` helpers.
- `design/typography.ts` — `sansFamily`/`monoFamily` weight→family mappers (callers set
  `fontFamily` via the `ds` components / `font` tokens directly). Kept `installGlobalFontDefault`.
- `domain/schedule.ts` — `dayExerciseCount`, `estimateMinutes`, and `daySetCount` (orphaned once
  `estimateMinutes` went). Home computes its own `slots.length` / `~8 min per lift` inline.

Why: dead exports inflate the API surface and mislead readers. No behavior change.

## 8. Remove dead `design/motion.ts` (duplicate motion tokens)
Deleted `src/design/motion.ts` — a constants file imported by **no** file (`@/design/motion`
appears in zero imports). Its `motion` export was a dead duplicate shadowed by the live
`tokens.motion` (the one every component imports via `@/design/tokens`, e.g. `Switch.tsx`'s
`motion.dur`/`motion.easeStandard`). Its `reducedMotion` constants were superseded by the live
`platform/reducedMotion.ts`; navigation durations are inlined in `navAnimations.ts`.

Caught by a per-file inbound-import scan (the earlier grep "use" count was inflated by the
basename collision with `tokens.motion` + `platform/reducedMotion`). No behavior change.

## 9. Remove unused locals / imports
Trivial dead bindings flagged by `tsc --noUnusedLocals --noUnusedParameters` (non-engine files
only; the frozen `engine/v4` is left untouched):

- `screens/session/WellDone.tsx` — dropped the unused `color` import.
- `components/HushMark.tsx` — dropped `const k` (the SVG scales via its `viewBox`, not `k`).
- `data/api/fixtureModel.ts` — renamed an unused `.map((s, i) => i)` param to `_s`.

Why: unused bindings are lint noise that obscures real usage. No behavior change.

## 10. Remove unwired placeholder haptics
**Founder decision (2026-06-24):** the full rest-timer haptics experience will be designed later as
a dedicated UX feature; the current placeholder impls are unwired dead scaffolding. Removed from
`platform/haptics.ts` the two haptics that no screen ever called:

- `timerComplete` (Light Impact on rest 00:00) and `startWorkout` (Medium Impact on the Home Start
  press) — neither was imported anywhere. Kept `wellDone`, the only wired haptic (Well Done screen).

No behavior change (the removed functions never fired).

## 11. Remove the unsurfaced swap search / browse / recents helpers
**Founder decision (2026-06-24):** the richer Swap UI (text search, "Your exercises" recents, and
"All [muscle] exercises" grouped browse) is not shipping; `SwapSheet` offers only the capped
Recommended list. Removed the production-dead helpers from `domain/replacement.ts`:

- `searchExercises`, `recentsForSlot`, `allByEquipment`, the `EquipmentGroup` type, and the
  now-orphaned private `normalize`/`matches` helpers (+ the `EquipmentFamily` import). Kept
  `recommended` and its `poolFor` helper.
- `__tests__/flows/replacement.test.ts` — dropped the search/recents/browse suites; retargeted the
  in-group + capability-subset invariants onto `recommended` so the no-cross-muscle guarantee stays
  covered.

No behavior change (`SwapSheet` uses only `recommended`).

## 12. Remove the dead `isQuarterlyReportDue` gate
**Founder decision (2026-06-24):** drop the retained-for-future helper. The Quarterly Report is
driven by the every-12-weeks local notification (`notifier.scheduleQuarterlyReport` → the
`quarterly_report` intent navigates to the screen); nothing called `isQuarterlyReportDue`.

- `domain/progressReport.ts` — removed the function (its `REPORT_WINDOW_WEEKS`/`WEEK_MS` constants
  stay; other functions use them).
- `__tests__/flows/progressReport.test.ts` — removed the `isQuarterlyReportDue` suite + import.

No behavior change (the report cadence is the notification, not this gate).

## 13. Remove the unused `expo-sqlite` dependency
**Founder decision (2026-06-24):** drop it if unused — it is. `expo-sqlite` was imported by no
source file (it appeared only in a `db.ts` comment as a hypothetical future swap) and was in no
`app.json`/EAS config. `db.ts` runs entirely on AsyncStorage.

- `npm uninstall expo-sqlite` — removed from `package.json`, `package-lock.json`, and
  `node_modules` (also slims the native build, which would otherwise autolink the unused module).
- `db.ts` — reworded the storage-backend comment to drop the specific package name (the
  swap-the-backend-later intent stands; "e.g. SQLite").

No behavior change.
