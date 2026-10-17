# App Review notes — what to paste into "Notes for the reviewer", and why each line exists

Written 2026-09-09 from the formula report's red finding 4: three things in this build are the
classic shape of a rejection when they arrive unexplained — a silent audio loop that keeps the app
awake, `audio` + `location` background modes, and an always-location permission. Each is real,
each is used for exactly what it says, and each needs a sentence before a reviewer sees it.

## Paste into App Store Connect → Notes for the reviewer

> **How to test the voice coach.** Connect any Bluetooth earbuds, start a workout from Today, and
> the coach speaks the first load and asks for your reps after each set. The coach only speaks
> through earbuds (a gym is loud and a phone speaker in a pocket is not a coach); without earbuds the
> stage shows one line saying so. The microphone is opened only in short listening windows after the
> coach asks a question. Answers are recognised by Apple's speech recogniser and, to hear through gym
> noise, a short clip of each answer is transcribed by OpenAI through our own server; clips are not
> stored and are not used to train any model. Only a closed grammar is acted on (ready, done, numbers).
>
> **Why `audio` background mode.** The workout continues with the phone locked in a pocket — the
> rest timer, the lock-screen Live Activity controls and the voice coach all run there. A silent
> audio session keeps the JavaScript timers alive between spoken lines, exactly as a metronome or a
> guided-workout app does; it is started only while a workout is running and stopped when it ends.
>
> **Why `location` background mode and "always" location.** A workout can include a distance item
> (an outdoor run or walk), which is recorded with GPS while the phone is in a pocket or the screen
> is off. Location is requested only when such an item is started, records only while it runs, and
> stops the moment it is finished. No location is read while lifting.
>
> **HealthKit.** Heart rate, calories and distance are read during a run; finished workouts are
> written back. Nothing else is read.
>
> **The Circle tab.** Up to six friends who exchanged an invite code see each other's workouts done
> this week, one shared streak of weeks, and can send a fixed "well done". There is no public feed,
> no free-form text between users and no messaging: invites and reminders are sent from the user's
> own WhatsApp through the system share sheet. With a single account the tab shows its invite screen;
> a second account is needed to see it populated.
>
> **Apple Watch.** The companion app mirrors the phone's workout and can run one standalone. To
> test standalone: start a workout on the phone, then move the phone out of range — the wrist keeps
> the sets, rests and haptics and syncs the record when the phone returns.
>
> **Account and trial.** The programme is built before any account; Sign in with Apple (or Google) is
> asked for when the athlete saves it (or, for some installs, after the first workout — dismissible). The
> first 3 workouts (within 10 days) are free with no card; the paywall appears at the end of the 3rd and
> offers Apple's 14-day introductory free trial on both plans (members enrolled before this build keep
> the 14 workouts / 30 days they were promised).
> Account deletion is in You → Delete Account and removes the server record.
>
> **Demo account.** Not needed — the intake works without one and nothing is gated behind sign-in
> for review. A reviewer who wants to see the paid state can set the trial to zero through the
> in-app membership screen's restore path after purchasing the sandbox monthly product.

## Privacy manifest — what still needs a line

`app.json`'s `NSPrivacyAccessedAPITypes` declares UserDefaults. Speech recognition sends audio to
Apple's servers when `requiresOnDeviceRecognition` is false (it is, for Hebrew — see
`platform/voice/voiceCapture.ts`), and since 2026-09-28 a short clip of every answer also goes to
OpenAI's transcription model through the coach Worker (`server/voice.ts`, not stored). The App
Privacy answers in App Store Connect must therefore declare **Audio Data → App Functionality, not
linked to identity, not used for tracking**. This is a Connect-side answer, not a code change.
(2026-09-29: the Circle adds nothing new to declare beyond what is already there — a first name and
workout counts, already covered by the account's existing answers; re-check the App Privacy page
when submitting.)

## The one thing a reviewer can still trip on

A reviewer testing on a device with no Bluetooth earbuds will not hear the coach. The one-line
notice on the stage (`workout.voiceSilentNoHeadset`) exists for exactly that reviewer. If the
rejection text quotes "voice coach does not work", reply with the first paragraph above.
