# Hush

A frictionless gym training app for iOS and Apple Watch.

Hush generates a weekly strength program, adapts the weights based on what you
actually completed, and handles progression, exercise selection, and rest timing
for you. You walk into the gym, do the work, and walk out — without managing a
spreadsheet or deciding what to lift next.

## Product philosophy

Remove every unnecessary decision between walking into the gym and walking out.

The athlete's only job is to train. Hush owns the programming — load,
progression, volume, frequency, and rest — and gets out of the way. When it does
make a change, it explains why in plain language rather than asking the athlete
to interpret numbers.

## Technical overview

- **Deterministic adaptive training engine — no machine learning.** Programming
  decisions are produced by explicit, rule-based logic. The same inputs always
  produce the same output, which makes every recommendation reproducible and
  auditable.
- **Fully explainable weekly adjustments.** Each change is presented as a plain
  observation → conclusion → action, so the athlete can always see what changed
  and why.
- **iOS + watchOS.** A native iPhone app with an Apple Watch companion for
  in-session use; the phone remains the single source of truth.
- **Hebrew and English with full RTL support.** Internationalized from the start,
  with right-to-left layout for Hebrew.

## Tech stack

- React Native + Expo (TypeScript) for the iOS app
- watchOS companion via native Apple targets
- The training engine is a self-contained, deterministic TypeScript module with
  an extensive unit and simulation test suite

## Repository layout

| Path | Contents |
|------|----------|
| `code/mobile/` | React Native + Expo (TypeScript) app. Source in `src/`, tests in `__tests__/`, watch/widget targets under `targets/` and `modules/`. |
| `code/mobile/src/engine/` | The deterministic adaptive training engine. |
| `docs/` | Architecture notes, canonical product/design specs, and analysis. |
| `build/` | Engineering specification documents and build/verification tooling. |
| `reference/` | Archived, non-functional infrastructure kept for historical reference only. |

## Building & running

The mobile app, from `code/mobile/`:

```bash
npm ci        # restore dependencies from package-lock.json
npm test      # run the jest test suite
npm start     # start the Expo dev server
```

## My role

I'm the founder and product lead. I designed the product architecture, the
engine specification, and the UX, and directed every product decision. The
codebase was built using AI-assisted development (Claude Code), with all
decisions made and reviewed by me.

## Status

In active development, targeting an App Store launch.
