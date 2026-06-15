# HUSH · CANONICAL DESIGN SPECIFICATION · V1.0
### המסמך המלא, המסודר, ללא כפילויות

---

> **════ V1 ALIGNMENT ADDENDUM — DX-13 (2026-06-12) ════**
>
> This design spec predates the v1 model pivot. Where any screen, copy, or philosophy here
> implies that Hush **chooses or auto-adjusts the working load**, read it against the as-built
> model, which is now **advisory** (see `HUSH_V1_PRODUCT_SPECIFICATION.md`):
>
> - **The athlete owns load.** The displayed `recommended_weight` is **advisory** — accept,
>   ignore, or override. Hush learns from the **logged actual weight** (M1/DX-01/02), not from
>   whether the recommendation was followed. *Set Confirmation / Different Result* screens log
>   the athlete's real weight + reps as the learning input.
> - **Program structure is stable.** Hush never auto-changes exercises, split, order, or
>   preferences; the L1 progression governor (ES-006) is advisory only (DX-03 / DX-20).
> - **Stagnation is the primary weekly trigger.** The weekly review surfaces **≤1 insight and
>   ≤1 optional recommendation** (plus an acceptance-gated volume option), or says nothing
>   happened — read-only detection = **M5** (DX-09); the active "investigation engine" (ES-013)
>   is **retired** in v1.
>
> Visual/navigation/component content below is unaffected.

---

## תוכן עניינים
1. [Product Philosophy](#1-product-philosophy)
2. [Navigation Philosophy](#2-navigation-philosophy)
3. [Visual System](#3-visual-system)
4. [Motion System](#4-motion-system)
5. [Component Library](#5-component-library)
6. [Authentication Philosophy](#6-authentication-philosophy)
7. [Health Integration Philosophy](#7-health-integration-philosophy)
8. [Walk / Run Strategy](#8-walk--run-strategy)
9. [V1 Boundaries](#9-v1-boundaries)
10. [Base Canvas & Global Rules](#10-base-canvas--global-rules)
11. [Screen Specifications](#11-screen-specifications)
    - [Screen 01 · Home (Workout Day)](#screen-01--home-workout-day)
    - [Screen 01-R · Home (Rest Day)](#screen-01-r--home-rest-day)
    - [Screen 02 · Workout](#screen-02--workout)
    - [Screen 03 · Set Confirmation](#screen-03--set-confirmation)
    - [Screen 03A · Different Result](#screen-03a--different-result)
    - [Screen 04 · Inter-Set Rest](#screen-04--inter-set-rest)
    - [Screen 05 · Transition Rest](#screen-05--transition-rest)
    - [Screen 05A · Equipment Busy Sheet](#screen-05a--equipment-busy-sheet)
    - [Screen 06 · Pause Sheet](#screen-06--pause-sheet)
    - [Screen 06A · Finish Early](#screen-06a--finish-early)
    - [Screen 07 · Exercise Demo](#screen-07--exercise-demo)
    - [Screen 08 · Well Done](#screen-08--well-done)
    - [Screen 09 · History](#screen-09--history)
    - [Screen 09A · Workout Detail](#screen-09a--workout-detail)
    - [Screen 09B · Walk / Run Detail](#screen-09b--walk--run-detail)
    - [Screen 10 · Profile Sheet](#screen-10--profile-sheet)
    - [Screen 11 · Authentication](#screen-11--authentication)
    - [Screen 12 · Health Permissions](#screen-12--health-permissions)
    - [Screen 13A · Goal Selection](#screen-13a--goal-selection)
    - [Screen 13B · Days Per Week](#screen-13b--days-per-week)
    - [Screen 13C · Health Fallback](#screen-13c--health-fallback-only)
    - [Screen 14 · Settings](#screen-14--settings)
12. [Future Considerations (Non-V1)](#12-future-considerations-non-v1)

---

## 1. Product Philosophy

**Hush = Silent Operator**
המוצר הוא כלי עבודה מקצועי, לא מעודד. הוא לא חוגג הצלחות עם קונפטי ולא נוזף על חוסר פעילות.

**Show The Next Decision Only**
אפס עומס קוגניטיבי. המשתמש מקבל רק את הפעולה הבאה שעליו לבצע.

**Explain Changes, Not Decisions**
מציגים רק עובדות (למשל ↑ Load Increased). המודל עצמו (Fatigue, Capability) נשאר קופסה שחורה ואינו מוצג לעולם.

**Strength Training First**
אימוני כוח הם הליבה והמודל לומד רק מהם. פעילויות קרדיו (הליכות/ריצות) מסתנכרנות ברקע ומופיעות ביומן כ-Action Log בלבד, ללא התערבות במודל.

**No Dashboard**
אין מסך ריכוז נתונים.

**No Social**
אין כלל רכיב חברתי.

**No AI Coach Chat**
ה-AI מורגש רק דרך חוויית אימון חלקה, לא בשיח ישיר.

**No Analytics Surface**
אין מסכי ניתוח נתונים.

**White Space Is Functional**
חלל ריק שחור הוא חומר הגלם. הוא זה שמבליט את המידע הקריטי ומונע עומס.

**One Surface + Temporary Layers**
אין "מעברי מסכים" מרובים. יש מסך ראשי אחד, וכל חריגה (החלפת תרגיל, שינוי חזרות, עצירה) עולה כ-Bottom Sheet זמני שנסגר בחזרה לתוך הלופ.

---

## 2. Navigation Philosophy

- **No Tab Bar** — אין סרגל ניווט תחתון
- **No Hamburger Menu** — אין תפריטי צד מורכבים
- **Home = Primary Surface** — מסך הבית הוא נקודת המוצא
- **History / Profile = Layers** — הכול מתלבש כ-Sheets על גבי הבית
- השראה: Notion / Linear hierarchy
- יחס: **70% Linear + 30% Raycast direction**

---

## 3. Visual System

### צבעים (Dark Mode בלבד)

| Token | Hex | שימוש |
|---|---|---|
| Background | `#000000` | שחור מוחלט — OLED Infinity Edge |
| Surface | `#1C1C1E` | Bottom Sheets, Modal Layers, כרטיסים |
| Primary Text | `#FFFFFF` | טקסט ראשי, כפתורים |
| Secondary Text | `#A1A1AA` | מטא-דאטה, תוויות, פעולות משניות |
| Divider | `#2C2C2E` | קווי הפרדה |
| CTA Background | `#FFFFFF` | כפתור ראשי |
| CTA Text | `#000000` | טקסט בתוך כפתור ראשי |

**כלל:** שימוש מינימלי בצבע. שפה מונוכרומטית פרמיום.

---

### טיפוגרפיה

**משפחות פונטים (חובה):**
- iOS: SF Pro Display (טקסט כללי) · SF Mono (טיימרים ומספרים)
- Android: Inter (טקסט כללי) · Roboto Mono (טיימרים ומספרים)

| Role | גודל | משקל | צבע |
|---|---|---|---|
| Hero Number (Weight) | 96px | Bold | #FFFFFF |
| Timer Number | 72px | Semibold Monospaced | #FFFFFF |
| Large Headline (Well Done) | 56px | Bold | #FFFFFF |
| Screen Title | 32px | Semibold | #FFFFFF |
| Large CTA Label | 18px | Medium | #000000 |
| Section Label | 16px | Medium | #A1A1AA |
| Body / Meta | 16px | Regular | #A1A1AA |
| Annotation | 13px | Medium | #A1A1AA |

---

### Spacing & Layout

- **8pt Grid** — כל המרווחים בכפולות של 8 (8, 16, 24, 32, 48, 64, 96)
- **24px** Global Horizontal Margins — ללא יוצאים מן הכלל
- **16px** Component Corner Radius (כפתורים, כרטיסים)
- **64px** Primary CTA Height

---

## 4. Motion System

- **Fade Through** — מעברי מסכים (Home → Workout), משך: 220ms
- **Bottom Sheets** — עולים מלמטה (Slide Up), משך: 250ms
- **No Bounce, No Scale, No Zoom** — אין קפיצות, אין אנימציות גומי
- **Button Pressed State** — שינוי ל-90% Opacity בלבד, ב-100ms. ללא שינוי גודל
- **Digit Transitions** — Cross-fade עדין (Apple-style) בספירת הטיימר ובשינוי חזרות — ללא הבהוב/קפיצה
- **No Sound** — המערכת שותקת לחלוטין
- **Minimal Haptics:**
  - Light Haptic — בהתחלת/סיום מנוחה (00:00)
  - Medium Haptic — ב-Complete Set
  - Success Haptic — ב-Well Done (פעם אחת בלבד)

---

## 5. Component Library

### Component 01 · Primary Button
- Height: 64px · Radius: 16px
- Background: #FFFFFF · Text: #000000
- Typography: 18px Medium
- Pressed State: Opacity 90% / 100ms — ללא Scale/Bounce

### Component 02 · Secondary Action
- טקסט בלבד — 16px Medium #A1A1AA
- ללא מסגרת, ללא רקע, ללא אייקון

### Component 03 · Bottom Sheet
- עולה מלמטה, 250ms
- Radius עליון: 24px
- Background: #1C1C1E
- ריווח פנימי: 24px
- Handle עליון: 36×4px

### Component 04 · History Row
- גובה בסיס: 72px (עם Annotation: 88px)
- מפריד תחתון 1px #2C2C2E, Inset 24px
- טקסט נקי — ללא כרטיסים או צלליות

### Component 05 · Profile Trigger
- סמל: ○ (עיגול ריק ואלגנטי)
- Size: 24×24px · Stroke: 1.5px
- Color: #A1A1AA · Pressed: #FFFFFF
- Touch Target: 44×44px
- מיקום: 24px מתחת ל-Safe Area

### Component 06 · Status / System Annotation
- 13px Medium #A1A1AA
- מוצג רק כשמשהו מיוחד קרה

### Component 07 · Custom Wheel Picker (Different Result)
- גלגלת מספרים ייעודית בצבעי המערכת
- לא ה-Picker הנייטיבי הגנרי של iOS
- טווח: 1–30 חזרות (לא ניתן לחרוג)

### Component 08 · Equipment Busy Button (Transition Rest בלבד)
- Height: 44px · Radius: 12px
- Background: #1C1C1E · Border: 1px #2C2C2E
- Text: 16px Medium #FFFFFF
- Width: Fit Content (לא Full Width)

---

## 6. Authentication Philosophy

- **Sign In With Apple** ✅
- **Sign In With Google** ✅
- **No Passwords**
- **No Email Verification Flow**
- **No Account Creation Wizard**

---

## 7. Health Integration Philosophy

- **Apple Health** (iOS) · **Health Connect** (Android)
- נמשכים: Age, Sex, Height, Weight
- נמשכים ומתועדים: Walks, Runs
- **Health data never enters model loop** — נתוני בריאות לא נכנסים למודל
- **Manual Fallback** — אם ההרשאות נדחו, מאספים ידנית בהמשך ה-Onboarding
- הרשאות **אינן חוסמות** את ה-Onboarding — המשתמש תמיד ממשיך

---

## 8. Walk / Run Strategy

- **Auto-import only** מ-Apple Health / Health Connect
- **No Log Walk button** — אין הזנה ידנית של קרדיו
- **No manual cardio entry**
- קרדיו מאוחסן ב-History כ-Action Log בלבד
- **Model ignores cardio** — המודל אינו לומד מהליכות/ריצות
- המשתמש רואה רצף פעולות מאוחד ב-History (אימונים + קרדיו יחדיו)

---

## 9. V1 Boundaries (מה בכוונה לא קיים)

| קטגוריה | פרטים |
|---|---|
| חברתי | No Social, No Friends, No Leaderboards |
| גמיפיקציה | No Achievements, No Badges, No Confetti, No Streaks |
| ציונים | No Recovery Score, No Readiness Score, No Fatigue Score, No Capability Score |
| ממשק AI | No AI Chat, No AI Coach UI |
| אנליטיקה | No Analytics Dashboard, No Charts, No Graphs |
| קהילה | No Community |

---

## 10. Base Canvas & Global Rules

### Canvas Reference
- **Target Device:** iPhone 16 Pro
- **Dimensions:** 393 × 852pt
- **Top Safe Area:** 59px
- **Bottom Safe Area:** Native iOS Home Indicator

### Global Layout Rules
- Background: #000000 — ללא גרדיאנטים, טקסטורות, או צלליות
- Surface: #1C1C1E — לשימוש ב-Bottom Sheets ו-Modal Layers בלבד
- Horizontal Padding: 24px — ללא יוצאים מן הכלל
- Grid: 8pt — כל ה-Spacing Tokens חייבים להתפצל ל-8, 16, 24, 32, 48, 64, או 96
- Corner Radius: 16px — לכפתורים, Sheets, ו-Option Cards

---

## 11. Screen Specifications

---

### Screen 01 · Home (Workout Day)

**Purpose:** מסך הבית — עונה על שאלה אחת בלבד: *"What should I do now?"*
זה המסך הכי חשוב במוצר. הכי ריק. הכי נקי.

**Psychological Outcome:** "I have one thing to do." — לא "I need to manage my training."

**Layout:**
```
┌─────────────────┐
│              ○  │
│                 │
│    Upper A      │
│  5 ex · 14 sets │
│    ~52 min      │
│                 │
│  [Start Workout]│
└─────────────────┘
```

| אלמנט | ערך |
|---|---|
| Background | #000000 |
| Scrollable | No — לעולם לא גולל |
| Horizontal Padding | 24px |

**Profile Trigger (○)**
- מיקום: Top Right
- 24px מהמרווח הימני · 24px מ-Top Safe Area
- Touch Target: 44×44px · Visual Size: 20px
- Color: #A1A1AA · Pressed: #FFFFFF

**Workout Name Zone**
- טקסט לדוגמה: "Upper A"
- Typography: 32px Semibold #FFFFFF
- מיקום: ממורכז אופטית — **45% viewport height** (לא 50% — הכפתור מושך את מרכז הכובד)
- מקסימום: 2 שורות · ללא Truncation לעולם

**Metadata Block**
- טקסט לדוגמה: "5 exercises · 14 sets · ~52 min"
- Typography: 16px Regular #A1A1AA
- מיקום: 24px מתחת לשם האימון

**Primary CTA — [ Start Workout ]**
- Width: 100% (בתוך ה-24px margins)
- Height: 64px · Radius: 16px
- Background: #FFFFFF · Text: #000000
- Typography: 17px Semibold
- מיקום: 24px above Home Indicator
- מרחק מ-Metadata: 48px
- Max Delay לאחר לחיצה: 150ms (אחרת → Show Skeleton)

**Transition:** Home → Workout = Fade Through, 220ms

**Forbidden — אסור להוסיף:**
Next Workout · Calendar · Progress · Charts · Streaks · Fatigue · Recovery · Confidence · Capability · Readiness · Quotes · Tips · Achievements · Calories

**Product Test:** לפני כל תוספת לשאול: *"Does it help start today's workout?"* — אם לא: Reject.

---

### Screen 01-R · Home (Rest Day)

**Purpose:** להעביר מצב מנוחה. המסך נשאר שקט לחלוטין.

**Layout:** זהה ל-Home (Workout Day) — אותו מיקום אופטי (47% viewport height)

| אלמנט | ערך |
|---|---|
| Core Text | "Rest." — 56px Bold #FFFFFF |
| Subtext | "Next: Lower A · Tomorrow" — 18px Regular #A1A1AA, 16px מתחת |

**Forbidden:** No CTA · No Logging Actions · No Widgets · No Buttons — המסך מת לחלוטין.

---

### Screen 02 · Workout

**Purpose:** מסך ביצוע — לא מסך מידע. המשתמש לא אמור לחשוב, הוא אמור לבצע.

**Psychological Outcome:** "I know exactly what to do." — לא "I need to understand the system."

**Layout:**
```
┌────────────────────┐
│ ~31 min        ||  │
│                    │
│   Bench Press      │
│                    │
│       82.5         │
│                    │
│        × 8         │
│                    │
│    Set 1 of 3      │
│                    │
│                    │
│  [ Complete Set ]  │
└────────────────────┘
```

| אלמנט | ערך |
|---|---|
| Scrollable | Never |
| Vertical Center | ~44% viewport height |

**Visual Hierarchy (בסדר חשיבות):**
1. Weight (82.5) — ה-Anchor הוויזואלי
2. Reps (× 8)
3. Exercise Name
4. Set Counter
5. CTA (Complete Set)
6. Remaining Time
7. Pause Trigger

**Top Bar**
- מיקום: 24px below Safe Area
- Left: "~31 min remaining" — 14px Medium #A1A1AA
- Right: "||" Pause Trigger — 20px Medium #FFFFFF
- Touch Target ||: 44×44px · Tap Response: Opacity 100→70% / 100ms

**Exercise Name**
- טקסט לדוגמה: "Bench Press"
- Typography: 32px Semibold **#A1A1AA** (אפור — כדי שלא יתחרה במשקל)
- מיקום: 24px below Top Bar
- מקסימום: 2 שורות · ללא Truncation

**Weight — ה-Anchor**
- טקסט לדוגמה: "82.5"
- Typography: 96px Bold #FFFFFF
- מיקום: מרכז אופקי · ~40% viewport height
- אם >6 תווים: Scale down, מינימום 72px

**Reps**
- טקסט לדוגמה: "× 8"
- Typography: 40px Medium #FFFFFF
- מיקום: 8px below Weight

**Set Counter**
- טקסט לדוגמה: "Set 1 of 3"
- Typography: 16px Medium #A1A1AA
- מיקום: 16px below Reps

**Primary CTA — [ Complete Set ]**
- Width: 100% · Height: 64px · Radius: 16px
- Background: #FFFFFF · Text: #000000 · Typography: 17px Semibold
- מיקום: 24px above Home Indicator
- Max Latency: 150ms (אחרת → Optimistic Local State, Never Block)

**Equipment Busy:** לא מופיע במסך זה — מופיע ב-Transition Rest בלבד.

**Forbidden:** Fatigue · Capability · Confidence · Readiness · Recovery · Calories · Heart Rate · Volume Metrics · Progress Graphs

---

### Screen 03 · Set Confirmation

**Product Law:** The workout must never stop flowing.

**Behavior — Morph בדיוק במקום:**
1. לחיצה על [ Complete Set ]
2. Fade Animation: **150ms**
3. הכפתור הופך ל: **[ 8 ✓ ]** — אותו גודל, אותו מיקום, אותה רקע לבנה
4. נשאר על המסך: **400ms**
5. מעבר אוטומטי ל-Rest (Fade)

המשתמש לא רואה "Submit" / "Confirm" / "Review" — הוא פשוט מסמן שביצע.

---

### Screen 03A · Different Result

**מיקום:** טקסט בלבד מתחת לכפתור ה-CTA (12px below)

- Typography: 16px Medium #A1A1AA
- ללא אייקון · ללא Chevron

**לחיצה → Bottom Sheet:**
- Custom Wheel Picker לבחירת מספר חזרות
- טווח: **1–30** בלבד (Data Integrity — מניעת ערכים חסרי משמעות פיזיולוגית)

---

### Screen 04 · Inter-Set Rest

**Purpose:** התאוששות בין סטים.
**Core Design Law:** הטיימר הוא המסך — לא "נמצא במסך", אלא **הוא המסך**.
**Psychological Outcome:** "I'm recovering." — לא "I'm using an app."

**Layout:**
```
┌─────────────────────┐
│                     │
│        02:14        │
│                     │
│      Next Set       │
│      82.5 × 8       │
│                     │
│                     │
│      Skip Rest      │
└─────────────────────┘
```

**Top Bar:** זהה ל-Workout Screen (Remaining Time + Pause Trigger)

**Timer — ה-Anchor**
- טקסט לדוגמה: "02:14"
- Typography: 72px Semibold Monospaced Digits #FFFFFF
- מיקום: **42% viewport height**
- Countdown: עדכון כל שנייה — ללא אנימציה. ספרה פשוט מתחלפת.
- חובה: Monospaced — כל ספרה באותו רוחב, אין ריצוד

**Context Label**
- "Next Set" — 16px Medium #A1A1AA
- מיקום: 24px below Timer

**Next Set Value**
- טקסט לדוגמה: "82.5 × 8"
- Typography: 28px Semibold #FFFFFF
- מיקום: 8px below Label

**Skip Rest (CTA)**
- **Text Only** — לא Primary Button (כדי שלא לעודד דילוג על מנוחה)
- Typography: 16px Medium #A1A1AA
- מיקום: 24px above Home Indicator
- ללא container · ללא border · ללא icon
- לחיצה → מיידי ל-Workout Screen, ללא אישור

**Timer Completion (00:00):**
- Haptic: Light Haptic, פעם אחת בלבד
- Transition: 250ms delay → Workout Screen (Fade)

**Lock Screen / Background:**
- הטיימר ממשיך לרוץ גם כשהאפליקציה ברקע
- אם המשתמש חוזר לאחר שהמנוחה פגה → מיידי ל-Workout Screen (לא להראות 00:00)
- שימוש ב-Monotonic Timer — לא Wall Clock

**Visual Hierarchy:** 1. Timer → 2. Next Set → 3. Skip Rest

**Forbidden:** Calories · Heart Rate · Recovery Score · Fatigue · Readiness · Tips · Quotes

---

### Screen 05 · Transition Rest

**Purpose:** מנוחה בין תרגילים — לא בין סטים.
**ההבדל מ-Inter-Set Rest:** "Move" במקום "Recover". המשתמש עובר למכשיר אחר.

**Layout:**
```
┌─────────────────────┐
│                     │
│        02:14        │
│                     │
│   Next Exercise     │
│ Incline DB Press    │
│      85 × 8         │
│                     │
│  [ Equipment Busy ] │
│                     │
│      Skip Rest      │
└─────────────────────┘
```

**Timer:** זהה לחלוטין ל-Inter-Set Rest — 72px Monospaced 42% Height

**Next Exercise Label**
- "Next Exercise" — 16px Medium #A1A1AA
- מיקום: 24px below Timer

**Exercise Name**
- טקסט לדוגמה: "Incline Dumbbell Press"
- Typography: 28px Semibold #FFFFFF
- מקסימום: 2 שורות · ללא Truncation (מינימום: 24px אם ארוך)

**Target**
- טקסט לדוגמה: "85 × 8"
- Typography: 20px Medium #A1A1AA
- מיקום: 8px below Exercise Name

**Equipment Busy Button** (מופיע כאן בלבד, לא ב-Workout Screen)
- Height: 44px · Radius: 12px
- Background: #1C1C1E · Border: 1px #2C2C2E
- Text: 16px Medium #FFFFFF
- Width: **Fit Content** (לא Full Width — זו לא הפעולה הראשית)
- מיקום: 40px below Target

**Skip Rest:** זהה למסך הקודם

**Visual Hierarchy:** 1. Timer → 2. Next Exercise → 3. Equipment Busy → 4. Remaining Time → 5. Skip Rest

**Forbidden:** Alternative exercises · Rankings · Why this exercise · Muscle groups · Replacement recommendations (הכול קורה רק אחרי לחיצה)

---

### Screen 05A · Equipment Busy Sheet

**Purpose:** המערכת מקבלת החלטה — המשתמש מאשר אותה.

**Product Law:** "Do this." — לא "Choose."

**Presentation:** Bottom Sheet · Height: ~30% (לא Full Screen)

**Layout:**
```
Equipment Busy

Recommended Replacement

Machine Chest Press

[ Accept ]

Choose Another
```

**Header:** "Equipment Busy" — 24px Semibold #FFFFFF

**Recommendation Label:** "Recommended Replacement" — 14px Medium #A1A1AA

**Exercise Name:** 24px Semibold #FFFFFF · מקסימום 2 שורות

**Accept Button:** Primary CTA · Full Width · 64px

**Choose Another:** Text Only · 16px Medium #A1A1AA
- לחיצה → Sheet שני, גובה ~50%
- מציג **3 חלופות בלבד** (לא יותר — יותר מ-3 = קטלוג = שבירת חזון)
- כל שורה: Exercise Name + Accept בלבד

**לאחר Accept:** Sheet נסגר → Transition Rest מתעדכן → האימון ממשיך

**Forbidden:** 3+ חלופות · Ratings · Descriptions · Comparisons · Muscles · Capability · Reasoning

**Product Law:** Equipment Busy exists because reality exists — לא כי רצינו פיצ'ר. Replacement Browser / Exercise Explorer = **Rejected. Violates Silent Operator.**

---

### Screen 06 · Pause Sheet

**Purpose:** Temporary Interruption — לא Menu, לא Navigation, לא Settings.
**Product Law:** כשמשתמש לוחץ ||, האימון עוצר מיידית — ללא Confirm.

**Immediate Effects on Open:**
- Workout Timer → Pause
- Rest Timer → Pause
- Workout State → Freeze — הכול קופא

**Presentation:** Bottom Sheet · Height: ~38%

**Layout:**
```
Workout Paused

[ Resume Workout ]

Exercise Demo

Finish Early
```

**Header:** "Workout Paused" — 24px Semibold #FFFFFF · Centered

**Resume Workout:** Primary CTA · 64px · #FFFFFF → #000000 — הפעולה הראשונה והבולטת ביותר

**Exercise Demo:** Secondary Action · 16px Medium #A1A1AA · ללא icon · ללא container

**Finish Early:** Secondary Action · אותו סגנון כמו Exercise Demo · **לא אדום** (Finishing Early הוא לא כישלון)

**Resume → Animation:** Sheet נסגר + Workout ממשיך · 220ms Fade

**Visual Hierarchy:** 1. Resume Workout → 2. Workout Paused → 3. Exercise Demo → 4. Finish Early

**Forbidden:** Settings · History · Notifications · Profile · Achievements · Stats

**Psychological Outcome:** "I can continue whenever I'm ready." — לא "I left the workout."

---

### Screen 06A · Finish Early

**Purpose:** לסיים אימון. בכבוד. ללא אשמה.
**Product Law:** Hush never argues with the user.

**Presentation:** Bottom Sheet · Height: ~28%

**Layout:**
```
Finish Workout Early?

[ Finish Workout ]

Cancel
```

**Header:** "Finish Workout Early?" — 24px Semibold #FFFFFF

**Finish Workout:** Primary CTA · Normal Style (לא Destructive — Red)

**Cancel:** Text Only · חוזר ל-Pause Sheet (לא ישירות ל-Workout)

**Flow:** Pause → Finish Early → Confirm → **Well Done** (לא Home ישירות)

**Workout State לאחר אישור:**
- Workout → Completed
- Remaining Blocks → Incomplete
- History Entry → Created מיידית

ללא "No Resume Later" · ללא "Continue Tomorrow" · ללא "Recovery Session"

**Forbidden:** "You will lose progress" · "Are you sure?" · Warning · "This may affect results" · "Your streak..."

---

### Screen 07 · Exercise Demo

**Purpose:** הצגת תנועה בלבד — Quick Reference. לא חינוך, לא Coaching.
**Psychological Outcome:** "Quick confidence." — לא "Learning session."

**Presentation:** Bottom Sheet · Height: ~65%

**Layout:**
```
Bench Press

[ Looping Video ]

Key Points
• Shoulder blades back
• Feet planted
• Full range of motion

[ Done ]
```

**Header:** שם התרגיל · 28px Semibold #FFFFFF · Centered

**Video:**
- Type: **Local Asset** (לא YouTube · לא WebView · לא Streaming)
- Style: Muted · Looping · **Monochrome / Grayscale**
- Aspect Ratio: 16:9 · Radius: 16px
- Duration per Loop: 3–5 שניות
- ויז'ואל: Apple Fitness × Linear — לא Influencer Video / Bright Gym / Bodybuilding Ad

**Key Points:**
- כותרת: "Key Points" — 14px Medium #A1A1AA
- נקודות: 16px Regular #FFFFFF
- **מקסימום: 3 נקודות בלבד**

**Done CTA:** Primary Button · חוזר ל-Pause Sheet (לא ישירות ל-Workout)

**Motion:** פתיחה 250ms Bottom Sheet · סגירה Fade Down

**Visual Hierarchy:** 1. Video → 2. Exercise Name → 3. Key Points → 4. Done

**Forbidden:** Comments · Likes · Coach Notes · Form Score · AI Feedback

---

### Screen 08 · Well Done

**Purpose:** הכרה בסיום — לא חגיגה.
**Product Law:** "Not celebration. Acknowledgement."

**Layout:**
```
Well Done.
```

אלמנט יחיד. ללא כפתור. ללא מספרים. ללא גרפים. ללא סטטיסטיקה.

| אלמנט | ערך |
|---|---|
| Typography | 56px Bold #FFFFFF |
| Alignment | Center Horizontal |
| Position | 50% screen height |
| Background | #000000 |

**Motion In:** Fade · 220ms · ללא Scale / Bounce / Confetti

**Duration On Screen:** 2.5 שניות — אוטומטי, ללא המתנה ללחיצה

**Motion Out:** Fade · 220ms

**Auto Transition (חובה לפיתוח):** לאחר 2.5 שניות → **Home** אוטומטית, ללא אינטראקציה מהמשתמש

**Haptic:** Success Haptic · פעם אחת · ללא צליל

**Visual Hierarchy:** "Well Done." בלבד

**Forbidden:** Workout Summary · Calories · Volume · Records · Badges · Achievements · Share · Post Workout Rating

---

### Screen 09 · History

**Purpose:** *"What happened?"* — לא *"How am I progressing?"*
**Mental Model:** Git Commit History — לא Fitness Dashboard.
**Product Law:** History הוא Action Log. ימי מנוחה **אינם מופיעים** — רק פעולות.

**Layout (דוגמה):**
```
History

Jun 13
Upper A

────────────────

Jun 11
Walk · 5.2 km

────────────────

Jun 10
Lower B
↑ Load Increased

────────────────

Jun 08
Upper B
Workout Ended Early
```

**Header:** "History" · 32px Semibold #FFFFFF · 24px below Safe Area · Left Aligned

**List:**
- סדר: Descending Chronological (חדש ראשון)
- אין קיבוץ לפי שבוע / חודש / תוכנית / תרגיל
- אינסופי (Infinite Scroll)

**History Row:**

| חלק | Typography | צבע |
|---|---|---|
| Date (Jun 13) | 13px Medium | #A1A1AA |
| Activity Name (Upper A) | 20px Semibold | #FFFFFF |
| Annotation (↑ Load Increased) | 13px Medium | #A1A1AA |

- Row Height: 72px בסיס · 88px עם Annotation
- Touch Target: כל השורה
- Divider: 1px #2C2C2E · Inset 24px

**Walk / Run Entries:**
- "Jun 11 · Walk · 5.2 km" או "Run · 4.1 km"
- מגיע אוטומטית מ-Apple Health / Health Connect
- אין הזנה ידנית

**Annotations (מוצגות רק כשרלוונטי):**
↑ Load Increased · Exercise Replaced · Workout Ended Early

**Empty State:** "No activity yet." — Centered · ללא illustrations

**Product Law (History Law):**
יומן ההיסטוריה אינו כולל ימי מנוחה או רשומות ריקות. ימי מנוחה אינם מופיעים ואינם מתועדים. המערכת מציגה רצף כרונולוגי של **פעולות בלבד** — התאריכים קופצים בין פעילות לפעילות.

**לחיצה על Workout Row:** Slide Left → Workout Detail Layer

**Visual Hierarchy:** 1. Activity Name → 2. Activity Details → 3. System Annotation → 4. Date

**Forbidden:** Charts · Graphs · Volume Trends · Strength Trends · Recovery Trends · Heat Maps · Streaks · Weekly Scores · Monthly Summaries · Achievements · Badges

---

### Screen 09A · Workout Detail

**Purpose:** הרשומה ההיסטורית המדויקת בלבד.
**Product Law:** Flight Recorder — לא Coaching Report.

**Layout (דוגמה):**
```
Upper A
Jun 13, 2026

Bench Press
82.5 × 8
82.5 × 8
82.5 × 8

Incline DB Press
32.5 × 8
32.5 × 8
32.5 × 8

↑ Load Increased
```

**Workout Name:** 32px Semibold #FFFFFF
**Date:** 16px #A1A1AA
**Exercise Name:** 18px Semibold #FFFFFF
**Set Entry (82.5 × 8):** 16px Regular #A1A1AA · 8px between rows

**Annotation:** 13px Medium #A1A1AA · מוצגת בתחתית הרשומה

**Early Finish Visual:**
```
────────────────────
Workout Ended Early
```
Centered · 13px Medium #A1A1AA · Divider פשוט (ללא Warning Style)

**Visual Hierarchy:** 1. Activity Name → 2. Activity Details → 3. System Annotation → 4. Date

**Forbidden:** Capability · Fatigue · Confidence · Agreement · Variance · Recovery · Readiness · Model Explanation · Decision Explanation

---

### Screen 09B · Walk / Run Detail

**Purpose:** הצגת פעילות מיובאת בלבד.

**Layout Walk:**
```
Walk
5.2 km
42 min
```

**Layout Run:**
```
Run
4.1 km
27 min
```

| אלמנט | Typography | צבע |
|---|---|---|
| Activity Type | 32px Semibold | #FFFFFF |
| Distance | 56px Bold | #FFFFFF |
| Duration | 18px Regular | #A1A1AA |
| Data Source | 13px | #A1A1AA |

**Data Source Label:** "Imported from Apple Health" / "Imported from Health Connect"

**Forbidden:** VO2 Max · Heart Rate · Recovery · Training Load · Recommendations · Pace Analysis · Performance Analysis

---

### Screen 10 · Profile Sheet

**Purpose:** Identity Layer — *"Who am I?"* — לא *"How am I doing?"*
**Product Law:** Profile must never become a dashboard.

**Presentation:** Bottom Sheet · Height: ~55%

**Layout:**
```
Alex

Male · 29
178 cm · 82 kg

History      >
Settings     >
Health Data  >
```

**Name:** "Alex" — 32px Semibold #FFFFFF · Centered
**Meta:** "Male · 29 / 178 cm · 82 kg" — 16px Regular #A1A1AA

**Navigation Rows:**

| שורה | פרטים |
|---|---|
| History | Slide Left → History Screen |
| Settings | → Settings |
| Health Data | מציג "Connected" / "Not Connected" + אפשרות לפתוח הגדרות מערכת |

- Row Height: 56px · Divider: 1px #2C2C2E · Chevron קטן ימינה

**Health Data Row:** מסך הרשאות — לא מסך נתונים. **לא** מציג Steps / Calories / Heart Rate.

**החלטה עיצובית:** אין תמונת משתמש / Avatar / Initials / Initials — רק שם. (Linear / Notion / Raycast — לא Instagram)

**Visual Hierarchy:** 1. Name → 2. Physical Identity → 3. History → 4. Settings → 5. Health Data

**Forbidden:** Avatar · Profile Picture · Followers · Workouts Completed · Achievements · Badges · Capability Scores · Fatigue · Readiness · Recovery

---

### Screen 11 · Authentication

**Purpose:** להכניס את המשתמש ל-Hush. מהיר.
**Product Law:** Authentication is not marketing. הוא כבר החליט להתקין.

**Layout:**
```
Hush

Train.
Quietly.

[ Continue with Apple ]

[ Continue with Google ]
```

**Vertical Rhythm:**
- Logo: ~35% viewport height
- Tagline: 16px below Logo
- Buttons: 48px below Tagline
- Between Buttons: 16px

**Logo / App Name:**
- "Hush" — טקסט בלבד, ללא אייקון גרפי
- Typography: 48px Bold #FFFFFF

**Tagline:**
- "Train." / "Quietly." — שתי שורות נפרדות
- Typography: 24px Medium #A1A1AA

**Buttons:** שניהם Height 64px · אותו גודל · אותו סגנון

**Authentication Flow:**
```
Authentication
↓
Health Permissions
↓
Onboarding (13A → 13B → [13C if needed])
↓
Home
```

**Visual Hierarchy:** 1. Hush → 2. Train. Quietly. → 3. Apple → 4. Google

**Forbidden:** Email · Password · Forgot Password · Create Account · Testimonials · Screenshots · Statistics · Community · Social Proof · "Get Stronger / Build Muscle / Lose Weight"

---

### Screen 12 · Health Permissions

**Purpose:** להסביר **למה** Hush מבקשת — לא מה זה Apple Health.
**Product Law:** Health permissions improve setup — they never block setup.

**Layout:**
```
Health Data

Hush can import:

• Age
• Sex
• Height
• Weight

And automatically log:

• Walks
• Runs

[ Continue ]
```

**Header:** "Health Data" — 32px Semibold #FFFFFF · Centered

**Description:** 18px Regular #FFFFFF · הרבה White Space

**Continue Button → פותח:** Apple Health (iOS) / Health Connect (Android)

**אם מאשר:** מעבר ישיר ל-Onboarding
**אם מסרב:** גם מעבר ל-Onboarding — **ללא אזהרות, ללא לחץ**

**אין כפתור "Skip"** — כי "Continue" מוביל לשני המסלולים ממילא.

**Visual Hierarchy:** 1. Health Data → 2. Why we ask → 3. Continue

**Forbidden (לעולם לא לבקש):** Sleep · Recovery · Readiness · Heart Rate · Calories · VO2 Max · Body Fat % · Training Experience · Injuries

---

### Screen 13A · Goal Selection

**Purpose:** הבחירה האסטרטגית היחידה.

**Layout:**
```
What's your goal?

[ Build Muscle ]
[ Get Stronger ]
[ Fat Loss ]
```

**Card Style:**
- Height: 72px · Radius: 16px · Spacing: 12px
- Selected: Background #FFFFFF / Text #000000
- Unselected: Background #1C1C1E / Text #FFFFFF

---

### Screen 13B · Days Per Week

**Purpose:** תדירות אימון.

**Layout:**
```
How many days per week?

[ 2 ]  [ 3 ]
[ 4 ]  [ 5 ]
```

**Grid:** 2×2 · Equal Size Cards · Height: 88px
**Selected/Unselected:** זהה ל-Goal Selection
**Product Law:** ערכים אפשריים: 2, 3, 4, 5 בלבד — ללא Custom Value

---

### Screen 13C · Health Fallback (Only)

**Purpose:** איסוף מידע חסר — **רק** אם Apple Health לא סיפק.

**Layout:**
```
Age
Sex
Height
Weight

[ Continue ]
```

- Native Platform Controls (ללא Custom Pickers / ללא אנימציות)

**Flow המלא לרוב המשתמשים (עם Apple Health):**
```
Authentication (Screen 11)
↓
Health Permission (Screen 12)
↓
Goal (Screen 13A)
↓
Days Per Week (Screen 13B)
↓
Home
```
≈ **4 מסכים · ~20 שניות**

**Forbidden Fields:** Body Fat % · Training Experience · Injuries · Questionnaires

---

### Screen 14 · Settings

**Purpose:** להכיל פקדי חשבון בלתי נמנעים.
**Product Law:** "Settings should remain boring. If users spend time in Settings, something is wrong with the product."

**Layout:**
```
Settings

Units
Health Data
Delete Account
Sign Out
```

**Row Height:** 56px

**Units:**
- Metric (kg) / Imperial (lb) — המקום היחיד בכל האפליקציה לשינוי יחידות

**Health Data:**
- מציג: "Connected" / "Not Connected"
- עם אפשרות לפתוח הגדרות מערכת

**Delete Account / Sign Out:** שורה רגילה → נפתחת שכבת אישור

**Forbidden:**
Notifications · Themes · Workout Preferences · Rest Timers · Developer Options · Coach Mode · Advanced Settings · Achievements · Social · Integrations

---

## 12. Future Considerations (Non-V1)

| תכונה | סטטוס |
|---|---|
| Apple Watch companion | Non-V1 |
| Live Activity / Widgets (Timers) | Non-V1 |
| Wearables (אינטגרציה עמוקה) | Non-V1 |
| Rich health integrations | Non-V1 |
| Advanced history filtering | Non-V1 |

---

## 13. Accessibility Standards

### עקרון יסוד
Hush נגיש לכל משתמש — כולל משתמשי VoiceOver (iOS) ו-TalkBack (Android). הנגישות אינה תוספת, היא חלק מהמוצר.

### Touch Targets
- מינימום לכל אלמנט אינטראקטיבי: **44×44px**
- זה כולל אלמנטים שה-Visual Size שלהם קטן יותר (למשל Profile Trigger שהוא 20px ויזואלית אך 44×44px בלחיצה)

### Accessibility Labels (VoiceOver / TalkBack)

| אלמנט | Label |
|---|---|
| Profile Trigger ○ | "Profile, Button" |
| Start Workout | "Start Workout, Button" |
| Complete Set | "Complete Set, Button" |
| || Pause | "Pause Workout, Button" |
| Skip Rest | "Skip Rest, Button" |
| Resume Workout | "Resume Workout, Button" |
| Done (Exercise Demo) | "Done, Button" |
| Equipment Busy | "Equipment Busy, Button" |
| Accept (Replacement) | "Accept [Exercise Name], Button" |
| Finish Workout | "Finish Workout, Button" |
| Cancel | "Cancel, Button" |

### קריאת נתונים (Screen Reader)

| מסך | קריאה |
|---|---|
| Workout — Weight | "82.5 kilograms" |
| Workout — Reps | "8 repetitions" |
| Workout — Set Counter | "Set 1 of 3" |
| Rest — Timer | "2 minutes 14 seconds remaining" |
| Rest — Next Set | "82.5 kilograms for 8 repetitions" |
| History Row | "Upper A, June 13, Load Increased" (נקרא כיחידה אחת) |
| Transition Rest — Exercise | "Incline Dumbbell Press, 85 kilograms for 8 repetitions" |

### Contrast
- כל הטקסט הראשי: #FFFFFF על #000000 — עומד בתקן **WCAG AAA**
- טקסט משני: #A1A1AA על #000000 — עומד בתקן **WCAG AA**
- טקסט על כפתור לבן: #000000 על #FFFFFF — עומד בתקן **WCAG AAA**

### Dynamic Type
- כל גדלי הפונטים תומכים ב-Dynamic Type של iOS / Font Scale של Android
- Layout חייב להתאים עצמו ב-Wrap ולא לחתוך טקסט

### Reduce Motion
- אם המשתמש הפעיל Reduce Motion: כל ה-Fade Through מוחלף ב-Cross Dissolve מיידי (50ms)
- Bottom Sheets: עולים ללא אנימציה (Snap)
- הטיימר: מתחלף ישירות ללא Digit Transition

### Haptics — Opt-Out
- כל ה-Haptics כפופים להגדרות המערכת של המשתמש
- אם Haptics מכובים במערכת — Hush לא מאלצת אותם

---

## 14. Core User Flows

### Flow 01 · יום אימון רגיל (Happy Path)
```
Home (Workout Day)
↓ [Start Workout]
Workout Screen
↓ [Complete Set] × N
Set Confirmation (Morph 150ms → 400ms)
↓ Auto
Inter-Set Rest
↓ Timer expires / [Skip Rest]
Workout Screen (Set N+1)
↓ [Complete Set — last set of exercise]
Transition Rest
↓ Timer expires / [Skip Rest]
Workout Screen (Next Exercise)
↓ ... (חוזר על עצמו)
↓ [Complete Set — last set of workout]
Well Done (2.5s Auto)
↓ Auto
Home
```

### Flow 02 · יום מנוחה
```
Home (Rest Day)
[Rest. / Next: Lower A · Tomorrow]
← אין פעולה — המסך שקט
```

### Flow 03 · Result שונה מהצפוי
```
Workout Screen
↓ [Complete Set]
Set Confirmation [ 8 ✓ ]
↓ [Different Result] (טקסט מתחת לכפתור)
Bottom Sheet — Custom Wheel Picker (1–30)
↓ בחירה + אישור
Set Confirmation מתעדכן
↓ Auto
Rest
```

### Flow 04 · ציוד תפוס
```
Transition Rest
↓ [Equipment Busy]
Equipment Busy Sheet (~30%)
Recommended Replacement + [Accept] / Choose Another
↓ [Accept]
Transition Rest מתעדכן לתרגיל החדש
↓ Timer expires
Workout Screen (תרגיל מוחלף)
```

### Flow 04A · Choose Another
```
Equipment Busy Sheet
↓ [Choose Another]
Sheet שני (~50%) — 3 חלופות
↓ [Accept] על אחת מהן
חזרה ל-Flow 04 מנקודת ה-Accept
```

### Flow 05 · עצירה וחזרה לאימון
```
Workout Screen / Rest Screen
↓ [||]
Pause Sheet (הכול קופא מיידית)
↓ [Resume Workout]
חזרה מדויקת לנקודה שנעצרה
```

### Flow 06 · סיום מוקדם
```
Pause Sheet
↓ [Finish Early]
Finish Early Sheet (~28%)
↓ [Finish Workout]
Well Done (2.5s Auto)
↓ Auto
Home
```

### Flow 07 · דמו של תרגיל
```
Workout Screen
↓ [||]
Pause Sheet
↓ [Exercise Demo]
Exercise Demo Sheet (~65%) — Video + Key Points
↓ [Done]
Pause Sheet
↓ [Resume Workout]
Workout Screen
```

### Flow 08 · גישה להיסטוריה
```
Home
↓ [○] Profile Trigger
Profile Sheet (~55%)
↓ [History]
History Screen (Slide Left)
↓ [Workout Row]
Workout Detail Layer (Slide Left)
↓ [Back]
History Screen
↓ [Back]
Profile Sheet
↓ Dismiss
Home
```

### Flow 09 · Onboarding (משתמש חדש עם Apple Health)
```
Authentication Screen
↓ [Continue with Apple / Google]
Health Permissions Screen
↓ [Continue] → Native Health Sheet → Accept / Reject
Goal Selection (13A)
↓ [Build Muscle / Get Stronger / Fat Loss]
Days Per Week (13B)
↓ [2 / 3 / 4 / 5]
Home
≈ 20 שניות סה"כ
```

### Flow 10 · Onboarding (Fallback — ללא Apple Health)
```
Authentication Screen
↓ [Continue]
Health Permissions Screen
↓ [Continue] → Native Health Sheet → Reject
Goal Selection (13A)
↓
Days Per Week (13B)
↓
Health Fallback (13C) — Age / Sex / Height / Weight
↓ [Continue]
Home
```

---

## 15. Design Governance Rules

### כלל 01 · The Silent Operator Test
לפני כל תוספת לכל מסך, שאלה חובה:
> *"האם זה עוזר למשתמש לבצע את הפעולה הבאה?"*

אם התשובה לא — **Reject.**

### כלל 02 · Home Is Sacred
Home לא מקבל שום אלמנט חדש ללא אישור מפורש.
רשימת האיסורים של Home (ראו Screen 01) היא **Locked** ואינה ניתנת לשינוי בלי שיח מוצרי מלא.

### כלל 03 · The Model Is a Black Box
המודל, הנימוקים שלו, ה-Fatigue, ה-Capability וה-Confidence — **לא מוצגים לעולם** בשום מסך.
ניתן להציג רק עובדות (↑ Load Increased, Exercise Replaced) — לא פרשנויות.

### כלל 04 · One Recommendation Rule
בכל מקרה שבו המערכת מציעה חלופה (Equipment Busy, Replacement) — **הצעה אחת ראשית** בלבד.
Choose Another מציג מקסימום 3 אפשרויות.
יותר מ-3 = קטלוג = **Rejected. Violates Silent Operator.**

### כלל 05 · History Is Not Analytics
אסור להוסיף לכל מסך היסטוריה (09, 09A, 09B):
Charts · Graphs · Trends · Scores · Summaries
ההיסטוריה קיימת כדי **לזכור** — לא כדי לנתח.

### כלל 06 · No Guilt, No Shame
Hush לא שופטת את המשתמש.
אסור להציג: Streak Loss · Progress Warning · "You will lose..." · "Are you sure?" · Warning Colors (Red / Orange) על פעולות שגרתיות.
Finish Early הוא אירוע — לא כישלון.

### כלל 07 · Screens Are Locked Unless Specified
כל מסך שמסומן **LOCKED** (ע"ג Screen Audit) — לא ניתן לשינוי ללא פתיחת שיח מוצרי מחדש עם תיעוד מלא.
השינויים האלה אינם שינויי UI — הם שינויי פילוסופיה.

### כלל 08 · Settings Is a Graveyard
Settings לא מקבל פיצ'רים חדשים.
כל דבר שמוצע להכניס ל-Settings הוא דגל אדום — אומר שהחלטה מוצרית לא הושלמה.

### כלל 09 · Data Integrity
ה-Custom Wheel Picker (Different Result) מוגבל ל-1–30 חזרות בלבד.
ערכים מחוץ לטווח גורמים ל"זבל" שמרוסס את המודל לטווח ארוך — **לא לפתוח את המגבלה.**

### כלל 10 · Component Consistency
אין יצירת כפתורים, טקסטים, או Sheets שאינם מוגדרים ב-Component Library (פרק 5).
כל חריגה חייבת תיעוד מפורש ואישור.

### כלל 11 · No New Surfaces
אסור להוסיף Tab Bar / Bottom Navigation / Hamburger Menu / Floating Buttons.
כל ניווט חדש חייב לעלות כ-Bottom Sheet זמני — לא כמסך עצמאי.

### כלל 12 · V1 Boundary Is Hard
כל אחד מה-V1 Boundaries (פרק 9) הוא **קו אדום**.
אין "רק הצצה קטנה" לאנליטיקה, אין "Social רק לחבר אחד", אין "Streak קטן ולא מציק".
הגבול קיים כי פילוסופיית המוצר קיימת.

---

*HUSH · CANONICAL DESIGN SPECIFICATION · V1.0 · Complete*
