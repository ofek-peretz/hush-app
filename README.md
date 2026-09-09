# Hush

A strength-training app for iPhone and Apple Watch that removes every decision between walking
into the gym and walking out. It writes the week, sets every load from a set you actually lifted,
runs the rest, speaks in your earbuds, and lets you log a set from the lock screen or the wrist.

**Status (2026-09-09):** TestFlight build 72 · iOS + watchOS · Hebrew and English · pre-launch.

## What it does

- **Writes the week.** A short intake, then a Gemini call (walled behind a Cloudflare Worker) writes
  the week's lifts, sets and rep ranges inside a schema. Local templates stand in when the model
  cannot. A programme photographed from another coach, or a Strong/Hevy CSV, is imported and kept
  as written.
- **Sets every load on the device.** The engine (`src/engine/v5`) is deterministic and runs entirely
  on the phone: Loop 1 corrects the next set's load mid-session, Loop 2 moves the lift's load
  between sessions from what was demonstrated, Loop 3 moves weekly volume by one set. Deloads are
  earned by evidence, detraining is decayed, rests are learned. Every change is written with a
  reason she can open.
- **Runs the session anywhere.** One tap per set on the phone; four App Intents and steppers on the
  Lock Screen Live Activity; a standalone watchOS app with its own execution engine, crash resume,
  Digital Crown editing, pain reports and HealthKit workouts; a voice coach in the earbuds (Hebrew
  and English, closed grammar) that says the next load and listens for the reps.
- **Shows the movement.** 136 lifts, each with a procedural vector demonstration validated in CI
  against its own form spec — no video assets.
- **Keeps the record hers.** Sets can be corrected, lifts annotated, the log exported as CSV and
  backed up to iCloud. The account is Sign in with Apple; sign-in is asked for after the programme
  is built (or, on one experiment arm, after the first workout).

## Repository layout

| Path | Contents |
|------|----------|
| `code/mobile/` | The Expo / React Native (TypeScript) app. Source in `src/`, tests in `__tests__/`, native targets under `targets/` (watch, watch complication, widgets + Live Activity) and `modules/` (watch connectivity, live activity, voice audio). |
| `code/mobile/src/engine/v5/` | The on-device training engine — three loops, the assembler, deload, detraining, the load grid. |
| `code/mobile/src/domain/` | Pure product logic: plan building and review, imports and exports, the voice grammar and script, rest, records, milestones. |
| `code/mobile/src/motion/` | The procedural exercise demonstrations (rigs, form specs, the renderer, the audit). |
| `code/mobile/__tests__/laws/` | ~200 "laws" — tests that pin product rulings, not just behaviour. |
| `server/` | Two Cloudflare Workers: `hush-coach` (the Gemini proxy with quotas and the anonymous intake door) and `hush-identity` (Apple sign-in, sessions, the circle, remote config, the events sink, App Store notifications). |
| `docs/` | Canonical product briefs, the voice spec, motion standards, the founder documents, release notes. |
| `reference/obsolete-v1/` | The 2026-06 v1/v4 era (Python backend, its reviews and plans). Historical only — nothing in it describes the product that ships. |

## Building & running

From `code/mobile/`:

```bash
npm ci                       # dependencies
npm run typecheck            # tsc, 0 errors expected
npm test -- --ci --maxWorkers=4   # ~4,000 tests; a bare `npx jest` fakes stage-suite timeouts
npm run lint:copy && npm run lint:rtl && npm run lint:hooks
npm start                    # Expo dev server (web harness: `npx expo start --web`)
```

Native builds go through EAS (`eas.json`); the working tree is what ships, not the last commit.
The Workers deploy with `npx wrangler deploy` from `server/` and `server/hush-identity/` — smoke-call
the liveness GET and one intake POST after every deploy.

## Configuration the founder holds

Secrets never enter the repo. `code/mobile/.env` carries the public Worker URLs and the shared
coach token (a speed bump, not a secret — the Worker requires a session for every call except an
anonymous intake). Still to be set for launch: the PostHog sink secrets on `hush-identity`
(`EVENTS_URL`, `EVENTS_KEY`), the Sentry upload token, the App Store name and grace period, the
Small Business Program, and regional prices.

## Founder

I'm the founder and product lead. I designed the product, the engine specification and the UX, and
directed every product decision. The codebase was built with AI-assisted development (Claude Code),
with every decision made and reviewed by me.
