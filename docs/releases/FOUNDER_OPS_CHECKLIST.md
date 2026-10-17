# Founder ops — the walls only you can cross (2026-09-10)

Everything below is either a secret, a console with your login, or money. None of it is code, and
all of it is written in the formula report's Phase 0. Each item is minutes. Tick them in order.

## 1. The analytics sink (blind launch otherwise)

```bash
cd server/hush-identity
npx wrangler secret put EVENTS_URL     # PostHog batch endpoint, e.g. https://eu.i.posthog.com/batch/
npx wrangler secret put EVENTS_KEY     # the project API key
npx wrangler deploy
```

Proof: `POST /events` answers 202, not 503; `app_open`, the `funnel_*` events and `experiment_arm`
appear in PostHog within a minute of a cold start on your phone.

## 2. Symbolicated crashes

In `code/mobile/.env` set `SENTRY_DISABLE_AUTO_UPLOAD=false` and add `SENTRY_AUTH_TOKEN` +
`SENTRY_ORG` + `SENTRY_PROJECT` to EAS secrets (`eas env:create`). Proof: the next build's release
shows source maps in Sentry.

## 3. The coach Worker

```bash
cd server
npx wrangler deploy                    # ships REQUIRE_AUTH="1" and DAILY_ANON_CALLS="6"
curl -s https://hush-coach.hush-app.workers.dev            # → {"ok":true}
```

Then one smoke intake from the app (build a programme). A 401 on an intake means the app build is
older than build 65 (no bearer, no `kind`) — install the current build.

## 4. Google Cloud — a budget and an alert on the Gemini key

Console → Billing → Budgets: $50/month, alerts at 50 / 90 / 100 %. Proof: the alert email arrives.

## 5. App Store Connect

- **Name:** "Hush" is taken; save **Hush Fitness** (subtitle: "The coach in your ear").
- **Billing Grace Period:** App → Subscriptions → enable (16 days). An expired card is otherwise an
  immediate churn.
- **Small Business Program:** enrol at developer.apple.com → 15 % commission under $1M.
- **Intro offer (2026-09-28, the pricing model):** a **14-day free trial** introductory offer on BOTH
  `hush.pro.annual` and `hush.pro.month` (the app shows the timeline and arms the day-12 reminder
  from it). Three workouts are free in the app before it.
- **Prices (2026-09-28):** annual **$79.99** (≈ ₪249.90), monthly **$14.99** (≈ ₪49.90). Confirm the
  Israeli figures in App Store Connect → Pricing; Apple's 2026-09-14 Israel change did not reprice
  subscriptions.
- **App Privacy:** add *Audio Data → App Functionality* (speech recognition goes to Apple's servers
  for Hebrew). See `APP_REVIEW_NOTES.md`.
- **Notes for the reviewer:** paste the block from `APP_REVIEW_NOTES.md`.

## 6. The next build

Not mine to start. When you do: it carries the anonymous intake door, the trial cap, the walk on
the wrist, the sign-in experiment and the five record features. The gym checklist for that build is
in `docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md` §5 and `modules/hush-live-activity/LIVE_ACTIVITY_HANDOFF.md`.

## 7. Remote config words you now hold

`wrangler kv key put config:app '{"trialMaxDays":30,"signInAfterFirstWorkoutPct":50}'` on the
identity Worker's KV. `signInAfterFirstWorkoutPct: 0` ends the experiment on the old arm, `100` on
the new one. `trialMaxDays: 0` disarms the time cap.
