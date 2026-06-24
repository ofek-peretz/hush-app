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
