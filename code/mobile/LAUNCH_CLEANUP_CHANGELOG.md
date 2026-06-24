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
