# iOS capabilities — CLOSED (2026-08-24)

**Nothing is pending. This file is kept as the record of how it closed, and as the place to look
first if signing ever fails on these capabilities again.**

## What was pending, and for how long

Build 58 shipped with the App Group + iCloud entitlements *parked*, because the two account-level
objects did not exist on the Apple Developer App IDs and creating them needs an interactive Apple
session. The declarations were restored to the tree on 2026-08-24:

* `app.json` → `expo.ios.entitlements` — App Group + iCloud container + CloudDocuments + KV store.
* `app.json` → the widget entry under `expo.extra.eas.build.experimental.ios.appExtensions`.
* `targets/widget/expo-target.config.js` — App Group.

## How it was closed

The identifiers already existed in the portal. They were **assigned to both App IDs** in an
interactive Apple session on 2026-08-24 — App Groups + iCloud + Sign in with Apple on
`com.hushfitness.app`, App Groups on `com.hushfitness.app.widget`. That assignment invalidated the
June provisioning profiles; EAS regenerated them from its stored App Store Connect API key on the
next build. **Build 59 signed, finished and was submitted to TestFlight**, which is the proof: the
doc's own failure mode was `Provisioning profile … doesn't support the App Groups and iCloud
capability`, and a build that signs cannot have hit it.

| Feature | Now live because of it | Where |
| --- | --- | --- |
| iCloud record backup + cloud trial ledger | `FileManager.ubiquityIdentityToken` is non-nil → `cloud.available()` true → automatic backup after every workout, silent restore on an empty phone, the KV store carries the trial ledger | `platform/cloud.ts`, `modules/hush-cloud` |
| Home-screen Today widget | `UserDefaults(suiteName:)` resolves → the snapshot is written → the widget draws the week | `platform/homeWidget.ts`, `targets/widget/HushTodayWidget.swift` |

## If it ever breaks again

At <https://developer.apple.com/account/resources>, confirm both App IDs still carry the
capabilities: `com.hushfitness.app` (App Groups → `group.com.hushfitness.app`; iCloud →
`iCloud.com.hushfitness.app`, Documents + Key-value) and `com.hushfitness.app.widget` (App Groups,
same group). Then let EAS regenerate the profiles on the next build.

`theAccountIsHerAppleId` and `theWidgetSpeaksFromThePhone` hold the pair in code — declared, or
documented here — so the capability can never be silently dropped again.
