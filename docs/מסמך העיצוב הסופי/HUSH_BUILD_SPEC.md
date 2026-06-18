# Hush — iOS App Build Specification

> A complete, pixel- and logic-accurate spec for building the **Hush** strength-training iOS app.
> Hand this entire document to Claude Code. Build it in **SwiftUI** (preferred) targeting iOS 17+.
> The reference design exists as an interactive HTML prototype (`hush_app_screens.html`, 31 screens).
> This document is the source of truth. Where the prototype and this doc disagree, follow this doc.

---

## 0. How to use this document

1. Read the **Product Philosophy** so every micro-decision matches the intent.
2. Build the **Design System** first (tokens, components). Everything else depends on it.
3. Build screens in the order given. Each screen section lists: purpose, layout, exact values, interactions, and state logic.
4. Implement the **Data Model & Logic** section — this is what makes it a real app, not a mockup.
5. Use the **Acceptance Checklist** at the end to self-verify pixel and behavior fidelity.

**Target:** Native SwiftUI app, iOS 17+, iPhone only, dark mode only (the app is always dark). Use SF Pro (system font). Use SF Symbols for all icons. Support Dynamic Island + Live Activities via ActivityKit, and local notifications via UserNotifications.

---

## 1. Product philosophy (read first — it governs everything)

Hush is a strength coach that **decides for you and gets out of the way**. The emotional target is *quiet confidence*. Principles, in priority order:

- **Override, not permission.** Hush sets your weights and program. It states decisions as facts ("Up 2.5 from last week."), never asks "what weight today?" The athlete *can* override (Edit result), but the default path is to trust Hush.
- **One question per screen.** Each screen answers exactly one thing ("What do I do today?" → the workout name, huge). Never crowd.
- **Silence as a feature.** Rest days say "Rest." and nothing else. No streaks, no nagging, no dark patterns, no engagement bait.
- **Encouragement is always positive.** During a set, copy is supportive ("You're ready for it." / "You can do it."). Never negative, never guilt.
- **Typography is the UI.** Big numbers and short statements carry the product. Minimal chrome, generous negative space.
- **Premium Apple finish.** Tabular figures on all numerals, tight tracking on display type, SF Symbols, translucent blurred bars, baseline-aligned units, no raw glyphs.

Voice: first person singular when Hush speaks ("I increased your chest load."), second person for the athlete ("You trained 4 days this week."). Sentence case. No exclamation marks except the rare payoff.

---

## 2. Design system

### 2.1 Color tokens

Define these as a single source of truth (e.g. `Color` extension / asset catalog). All hex values are exact.

| Token        | Hex       | Usage |
|--------------|-----------|-------|
| `bg`         | `#000000` | App background (true black) |
| `surface`    | `#111111` | Bottom sheets, demo cards |
| `surface2`   | `#1C1C1E` | Swap sheet bg, raised rows, DONE chip bg |
| `surface3`   | `#2C2C2E` | Cards inside sheets, circular icon buttons |
| `textPrimary`| `#FFFFFF` | Primary text |
| `textSecondary` (`G`) | `#A1A1AA` | Secondary text, captions |
| `textTertiary` (`T`)  | `#71717A` | Tertiary text, eyebrows, inactive |
| `textDim` (`DIM`)     | `#D4D4D8` | Slightly brighter than secondary (cap-bar labels, coaching line) |
| `border` (`BD`)       | `#2C2C2E` | Hairline dividers / borders |
| `tabInactive`| `#6D6D72` | Inactive tab icon + label |
| `accentBlue` | `#2D9CDB` | Actionable links ("Set as next") |
| `accentBlue2`| `#185FA5` → `#2D7DD2` | Logo gradient (135°) |
| `accentGreen`| `#3DB48C` | Live timer / rest ring in Dynamic Island & Live Activity |
| `danger`     | `#EF4444` | Destructive ("Delete Account") |
| `doneText`   | `#8A8A8E` | DONE chip text |
| `doneBorder` | `#38383A` | DONE chip border |

Lock-screen wallpaper (for iOS screens 27–29): radial gradient `radial-gradient(130% 100% at 50% 0%, #1A2535 0%, #0F1620 45%, #070A0F 100%)`. In SwiftUI use a `RadialGradient` or an equivalent layered gradient.

### 2.2 Typography

System font (SF Pro). Two reusable modifiers:

- **`heroNum`** — for all large numerals (weights, timers, the "4", lock-screen clock): `fontFeatures: tabularNumbers`, `tracking: -0.03em` (≈ `-0.03 * fontSize` points), weight per use.
- **`heroTitle`** — for display headings ("Hush", "Upper A", "Rest.", "Well done.", "Program", "Alex", section headers): `tracking: -0.02em`.
- **`tnum`** — any inline number that should not jitter (set counts, "kg", percentages, clocks): `tabularNumbers` only.
- Body text: default tracking.
- Enable `-webkit-font-smoothing: antialiased` equivalent → in SwiftUI this is default; ensure no synthetic bolding.

Type scale actually used (pt at the prototype's 232pt-wide device — scale proportionally to real device width; see §2.4):

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Weight hero (e.g. 82.5) | 76 | 700 | `heroNum`, `line-height: .85` |
| "kg" unit | 16 | 500 | baseline-aligned to weight, `tracking -0.01em` |
| Rep counter "× 8" | 30 | 500 | `tnum`, `tracking -0.01em` |
| Big timer (mm:ss) | 62 / 58 | 600 | `heroNum`, `tracking -0.02em`, tabular |
| Lock-screen clock | 62–64 | 300 | `heroNum`, `tracking -1.5px` |
| Home workout title ("Upper A") | 52 | 700 | `heroTitle`, `line-height 1` |
| "Rest." | 62 | 700 | `heroTitle` |
| "Hush" wordmark | 54 | 700 | `heroTitle` |
| "Well done." | 40 | 600 | `heroTitle`, `tracking -0.035em`, single line, period in `textTertiary` |
| "Program Created" | 36 | 600 | `heroTitle`, two lines, centered |
| Section header ("Program","History","Portrait","Alex") | 28–32 | 600 | `heroTitle` |
| Screen subtitle / detail header ("Upper A" in edit) | 22–24 | 600 | `heroTitle` |
| Row title (exercise name) | 16–18 | 500–600 | |
| Body | 14–15 | 400 | |
| Caption / secondary | 12–13 | 400 | `textSecondary` |
| Eyebrow (uppercase) | 11–13 | 400 | `textTertiary`, `letter-spacing 1.5–3px`, `text-transform: uppercase` |
| Tab label | 10 | 400/500 | |

### 2.3 Spacing, radii, hairlines

- Screen horizontal padding: **18pt** left/right (the standard gutter). Some sheets use 16pt.
- Hairline dividers/borders: **0.5pt**, color `border`.
- Corner radii: buttons/cards **14pt**; bottom sheets **24pt** (top corners only); circular icon buttons fully round; DONE chip **10pt**; small pills (segmented) **20pt**.
- Primary button height: **48pt** (auth) / padding `13pt` vertical elsewhere.
- Tab bar height: **62pt**, translucent: `background rgba(10,10,10,0.72)` + **backdrop blur 20pt**, top border `0.5pt rgba(255,255,255,0.08)`.

### 2.4 Device & scaling

The prototype device is **232×500pt** (a scaled mock). When building native, **do not** hardcode 232×500 — use the real safe-area-respecting layout and treat the prototype's values as **ratios**. Practical rule: the prototype is ~0.62× a real 375pt-wide iPhone, so multiply prototype px by ~1.6 for a real device, OR (cleaner) re-derive from the relative positions described per screen (e.g. "hero block vertically centered at 47%"). Prefer **relative/SwiftUI-native layout** (`Spacer`, `.frame(maxWidth: .infinity)`, safe-area insets) over absolute coordinates. The percentages and ratios below are the intent.

### 2.5 Icons (SF Symbols mapping)

The prototype uses custom inline SVG. In native, use SF Symbols:

| Prototype icon | SF Symbol | Used in |
|----------------|-----------|---------|
| menu (hamburger) | `line.3.horizontal` | Home top-right |
| chevron right | `chevron.right` | list rows, profile |
| chevron left (back) | `chevron.left` | edit/detail headers |
| pause | `pause.fill` | workout top bar, DI |
| grip (reorder) | `line.3.horizontal` (in drag handle) or `equal` | workout edit |
| swap | `arrow.left.arrow.right` | workout edit rows |
| check | `checkmark` | set confirm, DONE chip, swap-current |
| close | `xmark` | swap sheet |
| Tab: Home | `house` / `house.fill` (active) | tab bar |
| Tab: Program | `square.grid.2x2` or `rectangle.grid.1x2` | tab bar |
| Tab: History | `clock.arrow.circlepath` | tab bar |
| Tab: Portrait | `chart.bar` / `chart.bar.fill` (active) | tab bar |

Active tab: `textPrimary`, slightly heavier weight. Inactive: `tabInactive`.

### 2.6 Core reusable components

Build these once:

1. **`PrimaryButton`** — white fill (`#fff`), black text, radius 14, height 48 (or 13pt vertical padding), font 15/500. Full width minus 18pt gutters.
2. **`SecondaryButton`** — transparent, 0.5–1pt `border`, white text, radius 14.
3. **`TextButton`** — centered text, white or `textSecondary`, 14–15/500, no fill (used for "Edit result", "Ready", "Done").
4. **`Eyebrow`** — uppercase label component (size, tracking, `textTertiary`).
5. **`Divider05`** — 0.5pt hairline in `border`.
6. **`TabBar`** — the translucent bottom bar with the 4 icon+label tabs; takes an `active` enum. Sits above safe area.
7. **`WorkoutTopBar`** — top row inside an active workout: left = "31m left" (`tnum`, `textSecondary`), right = pause icon (`textDim`).
8. **`BottomSheet`** — a presentation container: dimmed scrim over the app, sheet with top radius 24, a **grabber** (36×5pt, `#3A3A3C`, radius 3, centered, ~10pt from top).
9. **`SlideToStart`** — see §4.6.
10. **`CapabilityBar`** — see §4 Portrait.
11. **`PickerWheel`** — see §4.12.

---

## 3. Information architecture & navigation

Four primary tabs (bottom tab bar): **Home · Program · History · Portrait**. A hamburger on Home opens **Profile** (modal/push). Workout flow is a full-screen modal launched from Home. Bottom sheets (Edit result, Pause, Exercise demo, Swap) present over their parent.

```
Tab: Home ──(Slide to start)──▶ Workout (full-screen, sequential)
  └ hamburger ▶ Profile
Tab: Program ▶ Weekly View ─(tap workout)─▶ Workout Edit ─(swap icon)─▶ Swap sheet
Tab: History ▶ list ─(tap)─▶ Workout Detail
Tab: Portrait ▶ Locked / Unlocked / (every 3 months) Then·Now
System surfaces: Dynamic Island, Live Activity (lock screen), Notification (8 PM)
```

Onboarding (first launch only): Authentication → Connect Health → (if skipped) Manual Info → Goal → Days per week → Program Created → Home.

---

## 4. Screens (exact spec, in build order)

> Notation: "centered at 47%" = vertical center of the block placed at 47% of the content height. "gutter" = 18pt. All text colors reference §2.1 tokens.

### 4.1 — Authentication (`01`)
**Purpose:** Front door. Sells nothing.
- Vertical group centered ~33% from top: "**Hush**" (`heroTitle`, 54/700), below it "Train.\nQuietly." (21/`textSecondary`, line-height 1.35, `tracking -0.01em`), centered.
- Two buttons pinned to bottom:
  - **Continue with Apple** — `PrimaryButton` (white/black), with Apple logo (SF Symbol `apple.logo`) left of the label, 8pt gap. Bottom offset ~90pt.
  - **Continue with Google** — `SecondaryButton`, with the multicolor Google "G" logo left of label. Bottom offset 40pt.
- Footer: "Terms · Privacy", 12/`textTertiary`, centered, ~16pt from bottom.
- **Logic:** Use real Sign in with Apple (`AuthenticationServices`). Google optional/stub. On success → if first launch, go to onboarding; else Home.

### 4.2 — Connect Health (`02`)
**Purpose:** Offer HealthKit; declining is free (sets the override-not-permission tone).
- Centered block (~42% vertical): "**Connect Health**" (28/600, centered), body (15, line-height 1.6): "Hush builds your first program from it. Skip it and I'll ask you four quick things instead.", then "Optional. You can change this anytime." (13/`textSecondary`).
- **Continue** (`PrimaryButton`, bottom ~52pt). "Skip" text link below (14/`textSecondary`, bottom ~26pt).
- **Logic:** Continue → request HealthKit read (`HKHealthStore`: DOB, biological sex, height, body mass). If granted, prefill profile and **skip** Manual Info. Skip → go to Manual Info.

### 4.3 — Manual Info (`03`) — only if Health skipped
**Purpose:** Four fields, one screen.
- Block vertically centered (~46%). Title "**A few quick things.**" (`heroTitle`, 28/600).
- Four fields stacked, gap 20pt:
  - **Age** — label (13/`textSecondary`), value "28" (18) with 0.5pt bottom border (underline field).
  - **Sex** — label, then 3 segmented pills: Male (selected: 1pt white border) / Female / Other (unselected: 0.5pt `border`, `textSecondary`). Pill radius 20, padding 5×14, 13pt.
  - **Height** — "178 cm" underline field.
  - **Weight** — "82 kg" underline field.
- **Continue** (`PrimaryButton`, bottom 40pt).
- **Logic:** Persist to user profile. Drives starting program.

### 4.4 — Goal (`04`)
**Purpose:** One choice.
- Centered (~40%). Eyebrow "WHAT ARE YOU TRAINING FOR" (`Eyebrow`, 13, tracking 2px, `textTertiary`, centered, margin-bottom 30).
- Three options stacked, gap 12pt:
  - Selected (**Build Muscle**): white fill, black text, 19/600, radius 14, padding 15 vertical.
  - Others (Increase Strength, Stay Consistent): 0.5pt `border`, `textSecondary`, 19/400.
- **Continue** (`PrimaryButton`, bottom 40).
- **Logic:** Single-select. Stored; influences split generation.

### 4.5 — Days per week (`04b`)
**Purpose:** Frequency.
- Centered (~40%). Eyebrow "HOW MANY DAYS A WEEK". 
- Vertical number picker column, centered: 2,3 (dim), **4** (`heroNum` 48/600, white), 5,6 (dim). Off-center values use `#6A6A6E` (one step) and `#46464A` (two steps) — fades like a wheel.
- **Continue** (`PrimaryButton`, bottom 40).
- **Logic:** Select 2–6. Generates that many training days.

### 4.6 — Program Created (`05`)
**Purpose:** 2-second confirmation, then auto-advance to Home.
- Fully centered: "Program\nCreated" (`heroTitle`, 36/600, two lines, line-height 1.12, centered), below "4 days · built for you." (14/`textSecondary`).
- **Logic:** No button. Build the program in the background, display ~2s, then auto-navigate to Home.

### 4.7 — Home · Training day (`06`)
**Purpose:** Answer "what do I do today?"
- Top row: date "Jun 17" (12/`textSecondary`, top-left, ~18pt). Hamburger (`line.3.horizontal`, 21pt, white) top-right in a 32×32 tappable area → opens Profile.
- Centered block (~30% from top): "Good morning, Alex." (14/`textSecondary`, margin-bottom 24), then **workout title** "Upper A" (`heroTitle`, 52/700, line-height 1), then muscles "Chest · Shoulders · Triceps" (14/`textSecondary`, margin-top 18).
- **SlideToStart** control, bottom ~72pt (see below).
- **TabBar** (Home active).
- **SlideToStart spec:** pill, full width minus gutters, height 58, radius 29, bg `linear-gradient(180°, #161616, #0E0E0E)`, 0.5pt border `#2A2A2A`, inner top highlight + subtle drop shadow. Knob: 48×48 white circle (gradient `#fff→#ECECEC`), left inset 5pt, with a **double chevron** (›› second at 45% opacity). Label "Slide to start" centered (offset right to clear knob), 14/500, with an **animated shimmer** gradient sweeping L→R (2.6s loop) and a periodic knob **nudge** (+5px at ~84% of a 2.6s cycle). On real drag past ~60% width → start workout; release before → spring back.

### 4.8 — Home · Rest day (`07`)
- Same top row (date "Jun 18", hamburger).
- Fully centered: "Good morning, Alex." (14/`textSecondary`, margin-bottom 24), "**Rest.**" (`heroTitle`, 62/700), "You trained 4 days this week." (14/`textSecondary`, margin-top 16).
- No start control. **TabBar** (Home active).
- **Logic:** Shown when today is a scheduled rest day.

### 4.9 — Active Set (`08`) — the core workout screen
- **WorkoutTopBar**: "31m left" + pause.
- Hero block vertically centered (~47%), centered text:
  - Exercise name "Bench Press" (`heroTitle`, 22/600, color `textDim`).
  - Weight row, **baseline-aligned**: number "82.5" (`heroNum`, 76/700, line-height .85) + "kg" (16/500, `textSecondary`, **on the same baseline**), gap 5pt, margin-top 10.
  - Rep counter "× 8" (`tnum`, 30/500, margin-top 6).
  - "Set 1 of 3" (13/`textSecondary`, margin-top 16).
  - Coaching line (13/`textDim`, margin-top 12, padding 0×22, line-height 1.4): **positive only**, e.g. "Up 2.5 from last week. You're ready for it."
- "Edit result" `TextButton` (bottom ~90pt).
- "Complete set" `PrimaryButton` (bottom 32pt).
- **Logic:** Weight & reps are **decided by Hush** (see §5 progression). Coaching line is computed from the week-over-week delta (see §5.4). "Complete set" → Set Confirmation. "Edit result" → Edit Result sheet.

### 4.10 — Set Confirmation (`09`)
- Identical to Active Set but **without** the coaching line, and the "Complete set" button momentarily becomes a confirmation: white button showing "8 ✓" (rep count + `checkmark` SF Symbol, 18/600, centered, 7pt gap).
- **Logic:** Display ~0.8s after completing a set, then transition to rest (Inter-set Rest) or next exercise (Transition Rest) or Well Done if last set.

### 4.11 — Inter-set Rest (`10`)
- **WorkoutTopBar** ("31m left").
- Centered (~41%): big countdown "02:14" (`heroNum`, 62/600, tabular, `tracking -0.02em`), "Set 2 of 3" (13/`textSecondary`, margin-top 18), "Bench Press" (14/`textSecondary`), "82.5 × 8" (22/500, margin-top 6).
- "Ready" as **text** (not a button), 14/white, bottom ~52pt. "Exercise Busy" link (12/`textTertiary`, bottom 28) → see §5.5.
- **Logic:** Auto-counts down; reaching 0 (or tapping "Ready") advances to the next set. "Ready" is intentionally a label, not a CTA — tapping anywhere/skip is allowed but it's not emphasized.

### 4.12 — Transition Rest (`11`)
- Like Inter-set Rest but for moving between exercises. Countdown "01:30" (58/600) higher (~37%). Below (~58%): "Next exercise" (13/`textSecondary`), "Romanian Deadlift" (22/600, margin-top 8), "100 × 8" (17/`textSecondary`).
- "Ready" text + "Exercise Busy" link, same as above.
- **Logic:** If Hush auto-swapped an exercise due to a conflict, it's already reflected here.

### 4.13 — Edit Result sheet (`12`)
**Purpose:** Override weight/reps via a wheel picker.
- Behind: faded current weight ("82.5", 70/700, opacity .25, ~18% from top).
- **BottomSheet** (`surface`, height ~48%): grabber, then two-column header eyebrows "WEIGHT" / "REPS" (11, tracking 1px, uppercase, `textSecondary`).
- **PickerWheel** area, height 160, `overflow hidden`, relative:
  - A **selection band** centered: full-width inset (left/right 12), height 36, top/bottom 0.5pt hairlines `#3A3A3C`, bg `rgba(255,255,255,0.03)`, radius 8.
  - Top fade: linear-gradient `surface → transparent`, 60pt; bottom fade mirrored. (z-index above values.)
  - Two columns of `tnum` values, line-height 32:
    - Weight: 77.5(`#46464A`), 80(`#6A6A6E`), **82.5**(26/600 white), 85(`#6A6A6E`), 87.5(`#46464A`).
    - Reps: 6,7,**8**,9,10 with same opacity gradient.
- **Save** (`PrimaryButton`, bottom 28).
- **Logic:** Native iOS wheel pickers (`Picker` / `UIPickerView`). Default = Hush's chosen values. Saving overrides this set's logged values (an override is recorded — see §5.4 "the athlete pushed").

### 4.14 — Pause sheet (`13`)
- Behind: faded weight (62/700, opacity .3, ~24% top).
- **BottomSheet** (`surface`, ~44%): "Workout paused" (22/600, centered, margin-bottom 32), then three equal options (no hierarchy), each 16/centered, 12pt padding:
  - **Resume workout** (white)
  - **Show exercise** (`textSecondary`)
  - **Finish early** (`textSecondary`)
- **Logic:** Pause stops timers exactly. Resume restores. Finish early → save partial session → Well Done or Home. Hush does not editorialize.

### 4.15 — Exercise Demo (`14`)
**Purpose:** Silent form guide.
- **BottomSheet** (`surface`, height 66%): grabber, title "Bench Press" (`heroTitle`, 21/600, centered).
- **Demo frame** (aspect 16:10, radius 14, border 0.5pt `#262628`, bg `radial-gradient(120% 140% at 50% 20%, #202022, #161618 55%, #0C0C0D)`): contains a **grayscale silhouette** of a bench-press figure (person lying on bench pressing a barbell). In native, replace with an actual **looping grayscale video/USDZ/Lottie**; if unavailable, ship a clean vector silhouette. Bottom-left: a pulsing dot (`#9A9AA0`, 1.8s opacity pulse) + "Form guide" (10/`#8A8A90`, tracking 0.3px).
- "FOCUS ON" eyebrow, then cues (14, line-height 1.95): "Shoulder blades back / Feet planted / Full range of motion".
- "Done" centered `TextButton` (15/white/500, padding 8×24).
- **Logic:** Pure reference; no logging. Closes back to the set.

### 4.16 — Active Set · Held (`15`)
- Same as Active Set. Used the week weight is **held** (not increased) or **lowered**. Coaching line = **"You can do it."** Example shows "Back Squat / 80 kg / × 5".
- **Logic:** See §5.4 — selects this copy when delta ≤ 0.

### 4.17 — Active Set · Up (`16`)
- Same as Active Set, week weight **increased**. Coaching line = "Up 2.5 from last week. You're ready for it." Example "Back Squat / 82.5 / × 5".
- **Logic:** Selected when delta > 0.

### 4.18 — Well Done (`17`)
- Fully centered, single line: "Well done" + period in `textTertiary` ("Well done**.**"), `heroTitle`, 40/600, `tracking -0.035em`, **white-space nowrap**.
- Black background, nothing else.
- **Logic:** Save the completed session **before** showing this. Display ~2s, then return to Home.

### 4.19 — Program · Weekly View (`18`)
**Purpose:** The week's plan, grouped by status.
- Scroll container, top 22pt, bottom inset clears tab bar (66pt). 
- Header "**Program**" (`heroTitle`, 28/600), "4 days / week" (13/`textSecondary`, margin-top 6).
- **Group 1 — eyebrow "COMPLETED THIS WEEK"** (11, tracking 1.5px, uppercase, `textTertiary`). Then completed rows: each shows the **day it was done** (e.g. "Mon", 12/`textSecondary`), workout name (18/600), muscles single-line w/ ellipsis (12/`textSecondary`), and a **DONE chip** on the right: bg `surface2`, 0.5pt `doneBorder`, radius 10, text `doneText` 10/600 tracking 0.6px, with a small `checkmark` left of "DONE". Row padding 13 vertical, 0.5pt bottom divider.
  - Example data: Mon · Upper A · Chest · Shoulders · ✓DONE ; Wed · Lower A · Quads · Glutes · ✓DONE.
- **Group 2 — eyebrow "UP NEXT"**. Upcoming rows: **no day shown**, workout name (18/600), muscles single-line (kept short to avoid truncation, e.g. "Back · Biceps", "Hamstrings"), and a right-side **"Set as next"** action: `accentBlue`, 13/500, with a small `chevron.right` (`accentBlue`).
  - Example: Upper B · Back · Biceps · [Set as next] ; Lower B · Hamstrings · [Set as next].
- **TabBar** (Program active).
- **Logic (critical):**
  - A workout in **Group 1** only if it was completed this week; show the actual weekday it was performed.
  - A workout in **Group 2** is upcoming; **never display a planned weekday** for it.
  - Tapping **"Set as next"** sets that workout as the one Home shows next (updates the Home training-day card to that workout). Persist this choice.
  - Tapping a row body opens **Workout Edit**.

### 4.20 — Workout Edit (`19`)
- Header row: back `chevron.left` (`textSecondary`) + title "Upper A" (`heroTitle`, 24/600).
- Exercise list (margin-top 24), each row 14pt padding, 0.5pt bottom divider:
  - Left: **grip handle** (reorder, `textTertiary`), margin-right 12, cursor grab.
  - Middle: exercise name (16/500) + "82.5 kg · 3 × 8" (13/`textSecondary`).
  - Right: **swap icon** (`arrow.left.arrow.right`, `textSecondary`) → opens Swap sheet for that exercise.
  - Rows: Bench Press 82.5kg 3×8, Incline DB Press 32kg 3×10, Shoulder Press 52.5kg 3×8, Lateral Raise 14kg 3×15, Tricep Pushdown 25kg 3×12.
- **Logic:** Drag to reorder (persist order). Swap icon → §4.21. Changes save to the program.

### 4.21 — Swap Exercise sheet (`19b`)
**Purpose:** Offer alternatives that hit the **same movement pattern**.
- Behind: a **faint glimpse** of the Workout Edit list (opacity ~0.32) under a `rgba(0,0,0,0.55)` scrim, for depth.
- **BottomSheet** (`surface2`, height 74%, 16pt horiz padding): grabber.
- Header row: left = title "Swap exercise" (`heroTitle`, 21/600) + subtitle "Horizontal push · same pattern" (13/`textSecondary`); right = circular close button (30×30, `surface3`, `xmark` 16pt `textDim`).
- Options list (gap 8):
  - **Current** (Bench Press · "Barbell · current"): **white card**, black text 16/500, subtitle `#6D6D72` 12, right = `checkmark` (black).
  - Alternatives: `surface3` cards, white name 16/500, subtitle `textSecondary` 12, right = `chevron.right` (`textTertiary`). Each padding 14, radius 14.
    - Dumbbell Press — "Greater range of motion"
    - Incline Bench Press — "Upper chest focus"
    - Machine Chest Press — "Stable · rack-free"
    - Push-up — "Bodyweight"
- **Logic:** Alternatives are filtered to the same movement pattern (here: horizontal push). Selecting one replaces the exercise in the program (and reflects in Workout Edit / future sessions). The current is marked, not re-selectable.

### 4.22 — History · Empty (`20`)
- Header "**History**" (`heroTitle`, 28/600), top 22pt.
- Centered message: "Your first session will appear here." (14/`textSecondary`). 
- **TabBar** (History active).

### 4.23 — History · Populated (`21`)
- Header "**History**" + "You completed 47 sessions." (13/`textSecondary`, margin-top 6).
- Chronological list (margin-top 20). Each entry: date (12/`textSecondary`), workout name (18/600, margin-top 3), and **optional Hush note** in first person (12/`textSecondary`, margin-top 5, line-height 1.4). Row padding 13 vertical, 0.5pt divider, tappable → Workout Detail.
  - Jun 17 · Upper A · "I increased your chest load."
  - Jun 15 · Lower B · (no note)
  - Jun 13 · Upper B · "I swapped in machine press — rack was taken."
  - Jun 10 · Lower A · "You ended this one early."
  - Jun 08 · Upper A · (no note)
- **TabBar** (History active).
- **Logic:** Notes are generated from what Hush did that session (progression, swaps, early finish). Stated as fact.

### 4.24 — Workout Detail (`22`)
- Header: back `chevron.left` + ("Upper A" 22/600 / "Jun 17 · 52 min" 13/`textSecondary`).
- Per-exercise blocks (gap 20, margin-top 22): exercise name (17/500), then each set row: "Set N" (left, 14/`textSecondary`) and "82.5 kg × 8" (right, `tnum`, 14/`textSecondary`).
  - Bench Press: 82.5×8, 82.5×8, 80×7.
  - Incline DB Press: 32×10, 32×10, 30×9.
  - Shoulder Press: 52.5×8, 52.5×7, 50×8.
- **Logic:** Read-only record of the logged session.

### 4.25 — Portrait · Locked (`23`)
**Purpose:** Builds anticipation while data accrues (unlocks after 7 sessions).
- Header "**Portrait**" (28/600).
- Centered block, padding 0×30, gap 20: "Still taking shape." (21/600), explanation (14/`textSecondary`, line-height 1.55): "I'm learning how your body moves. Four more sessions and I'll show you what I see.", then a **progress dot row** (7 dots, 7×7, filled=`#fff` for done, empty=`#2C2C2E`), then "3 of 7 sessions" (12/`textTertiary`, tracking 0.3px).
- **TabBar** (Portrait active).
- **Logic:** Dots reflect sessions completed / 7. The "Four more" copy is computed (7 − done).

### 4.26 — Portrait · Unlocked (`24`)
**Purpose:** Show **capabilities, not lifts** — 5 movement patterns as relative bars.
- Eyebrow "WHAT YOUR BODY CAN DO" (12, tracking 2px, uppercase, `textTertiary`). 
- **CapabilityBar** ×5 (margin-top 26):
  - Label (13/`textDim`, margin-bottom 9): Hip hinge 88, Squat 72, Horizontal push 64, Vertical push 58, Horizontal pull 41.
  - Bar: track height 6, radius 3, bg `#1A1A1A`; fill white to `pct%`.
- One-line insight (14/`textDim`, line-height 1.5): "I'm building around your hinge. It's your strongest."
- **TabBar** (Portrait active).
- **Logic:** Percentages are **relative capability scores** (normalized), never absolute kg. Insight names the strongest pattern.

### 4.27 — Portrait · Then · Now (`25`)
**Purpose:** Quarterly event; same bars with a ghost "then" bar behind.
- Eyebrow "THREE MONTHS". A small **legend**: a `#3A3A3C` swatch "Then" + a white swatch "Now" (11/`textSecondary`, gap row).
- **CapabilityBar with ghost** ×5: ghost (then) bar `#3A3A3C` behind, white (now) bar in front. Values (now, then): Hip hinge 88/80, Squat 72/66, Horizontal push 64/60, Vertical push 58/50, Horizontal pull 62/33.
- Insight (14/`textDim`): "Your pulling went from your weakest to even with your press."
- **"Got it"** `PrimaryButton` (bottom 40) — this is a modal event, not a tab.
- **Logic:** Triggered every ~3 months; compares current vs snapshot taken 3 months prior. Insight highlights the biggest relative gain.

### 4.28 — Profile (`26`)
- Opened from Home hamburger. Top 30pt, full-height layout to bottom 24pt.
- "**Alex**" (`heroTitle`, 32/600), "Male · 29 · 178 cm · 82 kg" (14/`textSecondary`, margin-top 6).
- List (margin-top 34, top border 0.5pt), each row 18pt vertical, 0.5pt bottom divider, label (16) + value/chevron right:
  - Units — "kg / lb toggle"
  - Membership — **two lines**, right-aligned: "Member since" / "Jun 2024" (13/`textSecondary`, line-height 1.5).
  - Health Access — "Connected"
  - Sign Out — `chevron.right`
  - **Delete Account** — `danger` (#EF4444), its own row.
- Footer "Hush v1.0.0" (11/`textTertiary`, centered, pinned bottom).
- **Logic:** Units toggles kg/lb across the app. Sign Out / Delete real actions. Membership reads from account.

### 4.29 — Dynamic Island (`27`)
**Purpose:** Live workout state in the Dynamic Island during an active session.
- This is a **system surface**, not an in-app screen. Implement with **ActivityKit** (`ActivityConfiguration` → `compactLeading`, `compactTrailing`, `minimal`, and `expanded` regions). The prototype renders the *compact/expanded pill* look:
  - Pill (black, radius 21, height 38, width ~178, centered top ~8pt): left = H logo tile (26×26, radius 7, logo gradient, "H" 13/700 white) + green timer "02:14" (`tnum`, 17/600, `accentGreen`); right = small stack "Set 2/3" (9/`#8A8A90`) over "Rest" (10/white/500) + a pause ring (24×24, 1.5pt `accentGreen` border, `pause.fill` 11pt `accentGreen`).
- Behind (the demo lock screen): split status bar (time left, signal+battery right), big clock "9:41" (`heroNum` 64/300, tracking -1.5px) + "Thursday, June 18".
- **Logic:** The Live Activity timer counts the **rest** interval; compactLeading shows the H logo, compactTrailing the timer; expanded shows set progress + pause. Tapping returns to the active set. Use `Text(timerInterval:)` for the live countdown.

### 4.30 — Live Activity card (`28`)
**Purpose:** Lock-screen Live Activity for an in-progress workout.
- System surface (ActivityKit **lock screen / banner** view). Prototype card spec:
  - Card: `rgba(28,28,30,0.78)` + backdrop blur 24, 0.5pt `rgba(255,255,255,0.1)` border, radius 22, padding 15×16.
  - Header: H logo tile (30×30) + ("Upper A" 15/600 / "Chest · Shoulders · Triceps" 12/`rgba(255,255,255,0.55)`) + right "Elapsed / 24:08" (`tnum`).
  - Progress: "6 of 12 sets" / "50%" row, then a 6pt track (`rgba(255,255,255,0.14)`) with white fill at 50%.
  - Divider 0.5pt, then a **rest ring**: 34×34 circle, 2pt `accentGreen` border, "38" (`tnum` 10/600 `accentGreen`) + ("Resting" 13/500 / "Next · Incline DB Press · 32 kg" 12/`rgba(255,255,255,0.55)`).
- Behind: lock-screen clock "9:41" (50/300) + date; notch as a black pill.
- **Logic:** Mirrors the active session (elapsed, sets done/total, current rest countdown, next exercise). Updates via ActivityKit.

### 4.31 — Notification (`29`)
**Purpose:** Local notification at **8:00 PM** announcing next week's program is ready.
- System surface (lock screen). Prototype: lock-screen "Thursday, June 18" + clock "8:00" (`heroNum` 62/300), then a **notification banner** (`rgba(40,40,42,0.7)` + blur 24, 0.5pt border, radius 20, padding 13×14):
  - Header: H logo tile (22×22) + "HUSH" (12/600, tracking 0.3px, `rgba(255,255,255,0.75)`) + "now" (12/`rgba(255,255,255,0.5)`, right).
  - Title "Next week is ready" (15/600).
  - Body "I've built your program for next week. Four sessions, tuned to how you trained." (14/`rgba(255,255,255,0.78)`, line-height 1.4).
- Home indicator bar at bottom.
- **Logic:** Schedule a **local notification** (`UNUserNotificationCenter`) at 20:00 on the day the next-week program finishes generating. Title/body as above (pluralize sessions by count). Tapping opens Program.

---

## 5. Data model & business logic

This is what makes Hush real. Implement these even though the prototype only shows static states.

### 5.1 Core entities
```
User { id, name, sex, age, heightCm, weightKg, units(kg|lb), goal, daysPerWeek,
       healthConnected, memberSince }
Exercise { id, name, movementPattern (hipHinge|squat|horizPush|vertPush|horizPull),
           equipment, defaultSetsReps }
ProgramWorkout { id, name (e.g. "Upper A"), muscles[], exercises: [WorkoutExercise] }
WorkoutExercise { exerciseId, order, sets, reps, prescribedWeightKg }
Program { id, daysPerWeek, workouts: [ProgramWorkout], nextWorkoutId }
Session { id, programWorkoutId, date, durationMin, completed(bool),
          finishedEarly(bool), hushNote?, setLogs: [SetLog] }
SetLog { exerciseId, setIndex, weightKg, reps, wasOverride(bool) }
CapabilitySnapshot { date, scores: [pattern: 0–100] }  // for Portrait
```

### 5.2 Program generation
On onboarding completion: build a split from `goal` + `daysPerWeek` (e.g. 4 days → Upper A / Lower A / Upper B / Lower B). Seed each workout with exercises per movement pattern and starting weights from profile (HealthKit or manual) using conservative estimates. Persist locally (SwiftData/Core Data).

### 5.3 Progression engine (Hush decides the weight)
For each exercise, each session, compute the **prescribed weight**:
- If last session's sets for this exercise were completed at/above target reps with margin → **increase** by the smallest sensible increment (e.g. +2.5 kg upper, +5 kg lower).
- If last session was missed/short or the athlete overrode downward → **hold** (or reduce).
- Surface this as the on-screen weight; **never ask the user**.

### 5.4 Coaching-line selection (Active Set copy)
Compute `delta = prescribedWeight − lastSessionWeight` for the exercise:
- `delta > 0` → screen `16` style, copy "Up {delta} from last week. You're ready for it." (`delta` formatted in user units).
- `delta ≤ 0` (held or lowered) → screen `15` style, copy "You can do it."
- Always positive; never reference failure or weakness. (The previous "hold/receipt" negative concept was intentionally removed — do not implement guilt/justification copy.)

### 5.5 "Exercise Busy" / auto-swap
During rest screens, "Exercise Busy" lets the athlete flag the station is occupied. Hush **auto-swaps** to an equivalent same-pattern exercise (same logic as the Swap sheet) and reflects it on the next Transition Rest / set without ceremony. Record the swap → becomes a History note ("I swapped in machine press — rack was taken.").

### 5.6 Session lifecycle
Start (Slide to start) → iterate exercises × sets (Active Set → Set Confirmation → Inter-set Rest, then Transition Rest between exercises) → on last set, save `Session` → **Well Done** → Home. Pause sheet can interrupt at any point; Finish early saves a partial session with `finishedEarly = true` and an appropriate Hush note.

### 5.7 Portrait scoring
After each session, recompute 5 capability scores (0–100) from logged performance per movement pattern (relative, normalized — not absolute load). Unlocks at **7 sessions**. Every ~3 months, snapshot and present **Then · Now** comparing to the snapshot from 3 months earlier; insight names the biggest relative gain.

### 5.8 Next-week generation + notification
When a training week completes, generate next week's program in the background, then schedule the **8:00 PM local notification** ("Next week is ready"). Tapping deep-links to Program. The chosen "Set as next" workout (from Weekly View) drives which workout Home shows next.

### 5.9 ActivityKit (Dynamic Island + Live Activity)
Start a Live Activity when a workout begins. Attributes: workout name, muscles. Content state: elapsed, setsDone, setsTotal, currentRestEndDate, nextExerciseName/weight, phase (working|resting). Drive the compact/expanded Dynamic Island and the lock-screen card from this. Use `Text(timerInterval:)` so the timer is live without app wakeups. End the activity on Well Done / Finish early.

---

## 6. Motion & micro-interactions
- **Slide to start:** shimmer sweep (2.6s loop) + knob nudge; real drag with spring-back.
- **Set Confirmation:** button morph to "{reps} ✓" for ~0.8s, then transition.
- **Program Created / Well Done:** ~2s dwell, then auto-advance.
- **Exercise Demo:** pulsing "Form guide" dot (1.8s).
- **Rest countdowns:** live, tabular, no layout shift (that's why `tnum` everywhere).
- Respect **Reduced Motion** (disable shimmer/nudge, keep instant states).
- All transitions feel like iOS defaults; don't over-animate.

## 7. Accessibility & quality floor
- Dynamic Type where feasible (hero numerals can cap scaling).
- VoiceOver labels on all icons/controls (e.g. swap icon → "Swap exercise").
- Min 44pt tap targets (the hamburger uses a 32→pad to ≥44 hit area).
- Visible focus, color-contrast on all text.
- Haptics: success haptic on set complete; light impact on slide-to-start engage.

## 8. Acceptance checklist (self-verify before done)
- [ ] All numerals use tabular figures; no width jitter on timers/weights.
- [ ] "kg" sits on the **baseline** of the weight number, not floating high.
- [ ] Display headings use tight tracking (`heroTitle`); "Well done." is one line with a tertiary-color period.
- [ ] Tab bar: 4 SF Symbol icons above labels; active white/heavier, inactive `#6D6D72`; translucent blurred bar.
- [ ] Home training-day shows the **next** workout (respects "Set as next").
- [ ] Program Weekly: completed rows show the weekday + grey DONE chip; upcoming rows show **no** weekday and a blue "Set as next".
- [ ] "Set as next" actually changes what Home shows next.
- [ ] Active Set coaching line is positive and computed from week delta (Up vs "You can do it.").
- [ ] Edit Result is a real wheel picker with a centered selection band + edge fades.
- [ ] Swap sheet offers same-pattern alternatives; current is marked with a check; faint app context behind.
- [ ] Exercise Demo shows a silhouette/looping guide, not a placeholder label.
- [ ] Dynamic Island + Live Activity reflect live session state via ActivityKit with a live timer.
- [ ] 8:00 PM local notification "Next week is ready" schedules and deep-links to Program.
- [ ] Portrait unlocks at 7 sessions; bars are relative capability scores; Then·Now every 3 months.
- [ ] App is always dark; gutters 18pt; hairlines 0.5pt; sheet radius 24; button radius 14.
- [ ] No raw text glyphs for icons anywhere — SF Symbols only.
- [ ] Reduced Motion respected; VoiceOver labels present; 44pt targets.

---

## 9. Asset notes
- **Logo "H":** rounded-square tile, gradient 135° `#2D7DD2 → #185FA5`, white "H" 700. Provide as an app icon + in-app mark.
- **Bench-press silhouette** (Exercise Demo): ship a grayscale vector or a short looping grayscale clip per exercise.
- **Apple/Google logos** on auth: use official marks (Sign in with Apple uses the system button; Google per brand guidelines).

*End of spec.*
