# App Review notes — what to paste into "Notes for the reviewer", and why each line exists

Written 2026-09-09 from the formula report's red finding 4: three things in this build are the
classic shape of a rejection when they arrive unexplained — a silent audio loop that keeps the app
awake, `audio` + `location` background modes, and an always-location permission. Each is real,
each is used for exactly what it says, and each needs a sentence before a reviewer sees it.

## Paste into App Store Connect → Notes for the reviewer

> **How to test the voice coach.** Connect any Bluetooth earbuds, start a workout from Today, and
> the coach speaks the first load and asks for your reps after each set. The coach only speaks
> through earbuds (a gym is loud and a phone speaker in a pocket is not a coach); without earbuds the
> stage shows one line saying so. The microphone opens only in short listening windows after the
> coach asks a question, and only while earbuds are connected. Speech recognition is Apple's; the
> only words recognised are a closed grammar (ready, done, numbers).
>
> **Why `audio` background mode.** The workout continues with the phone locked in a pocket — the
> rest timer, the lock-screen Live Activity controls and the voice coach all run there. A silent
> audio session keeps the JavaScript timers alive between spoken lines, exactly as a metronome or a
> guided-workout app does; it is started only while a workout is running and stopped when it ends.
>
> **Why `location` background mode and "always" location.** The Cardio tab records outdoor runs
> and walks with GPS while the phone is in a pocket or the screen is off. Location is requested
> only when a run is started, runs only while it is recording, and stops the moment it is finished.
> No location is read during strength workouts.
>
> **HealthKit.** Heart rate, calories and distance are read during a run; finished strength and
> cardio workouts are written back. Nothing else is read.
>
> **Apple Watch.** The companion app mirrors the phone's workout and can run one standalone. To
> test standalone: start a workout on the phone, then move the phone out of range — the wrist keeps
> the sets, rests and haptics and syncs the record when the phone returns.
>
> **Account and trial.** The programme is built before any account; Sign in with Apple is asked for
> when the athlete saves it (or, for some installs, after the first workout — dismissible). The
> first 14 workouts within 30 days are free with no card; the paywall appears only at workout 15.
> Account deletion is in You → Delete Account and removes the server record.
>
> **Demo account.** Not needed — the intake works without one and nothing is gated behind sign-in
> for review. A reviewer who wants to see the paid state can set the trial to zero through the
> in-app membership screen's restore path after purchasing the sandbox monthly product.

## Privacy manifest — what still needs a line

`app.json`'s `NSPrivacyAccessedAPITypes` declares UserDefaults. Speech recognition sends audio to
Apple's servers when `requiresOnDeviceRecognition` is false (it is, for Hebrew — see
`platform/voice/voiceCapture.ts`). The App Privacy answers in App Store Connect must therefore
declare **Audio Data → App Functionality, not linked to identity, not used for tracking**. This is a
Connect-side answer, not a code change.

## The one thing a reviewer can still trip on

A reviewer testing on a device with no Bluetooth earbuds will not hear the coach. The one-line
notice on the stage (`workout.voiceSilentNoHeadset`) exists for exactly that reviewer. If the
rejection text quotes "voice coach does not work", reply with the first paragraph above.
