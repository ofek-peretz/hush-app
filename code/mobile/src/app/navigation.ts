/**
 * Navigation param lists. Two groups gated by onboarding completion (Root.tsx):
 * onboarding (forward-only) and the main app.
 *
 * Entry flow (HUSH_BUILD_SPEC §3, founder directive 2026-06-18; Goal step removed
 * 2026-06-30 — Hush is hypertrophy-first for everyone, so goal is no longer asked;
 * Body data + Training merged into one "About you + Your week" step, v7 2026-07-24):
 *   Authentication (sign-in + consent, merged 2026-07-12) → Name → Connect Health
 *   → the conversation → Program Created → Home. Four screens, and one of them is a coach.
 * Invite-token enrollment is removed.
 */
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { CardioActivity, Experience, OnboardingInputs, Session, SessionSummary } from '@/data/local/models';
import type { ShareCard } from '@/domain/shareCard';
import type { WeeklyPlanView } from '@/engine/weeklyView';
import type { WristOffer } from '@/platform/watch/watchPresence';

/** The Saturday letter's fact band — workouts done of planned, tonnes moved, calories. */
export interface WeeklyBand {
  done: number;
  planned: number;
  tonnes: number;
  kcal: number | null;
}

export type OnboardingParamList = {
  // Sign-in AND consent (merged 2026-07-12): continuing with a provider records the
  // versioned agreement — the line under the buttons says so before it is pressed.
  Authentication: undefined;
  // "How should I address you?" — the NAME and the GENDER (moved here from Body data,
  // founder 2026-07-12: Hebrew conjugates the second person, so the copy layer needs it
  // before the next screen speaks). Sex rides the params from here to the profile.
  NameEntry: undefined;
  /*
   * ⛔ WHAT SHE WEIGHS (founder 2026-08-03) — *"the coach didn't ask for my weight, and it's
   * critical for it."* It was never asked by anyone: `coachFacts` spreads it conditionally, so an
   * absent bodyweight is simply an absent line on the sheet and nothing is surprised by it.
   *
   * `sex` rides through because the step after this one needs it, exactly as it already rode from
   * `NameEntry` — this screen is inserted into that relay, not bolted beside it.
   */
  Bodyweight: { sex: 'male' | 'female' };
  /*
   * ⛔ THE REST OF WHAT THE COACH MUST BE GIVEN (founder 2026-08-03) — age, experience, how many
   * days, how long a session. `domain/coachRequirements` is the list and the argument.
   *
   * Each step carries everything gathered so far and adds its own, so `ConnectHealth` still
   * assembles the whole `OnboardingInputs` in ONE place — the relay `sex` has always ridden.
   */
  AboutYou: { sex: 'male' | 'female'; weightKg: number };
  YourWeek: { sex: 'male' | 'female'; weightKg: number; age: number; experience: Experience };
  // `previewWrist` is the v7 GALLERY's seam and nothing else: 1.3 draws its wrist row from
  // WCSession, which a browser harness has no way to produce, so the row could only ever be looked
  // at ABSENT — the one state it says nothing in. Never passed by the app; on a device the paired
  // watch decides, as it always has.
  ConnectHealth: {
    sex?: 'male' | 'female';
    weightKg?: number;
    age?: number;
    experience?: Experience;
    daysPerWeek?: number;
    workoutMinutes?: number;
    previewWrist?: WristOffer;
  } | undefined;
  /*
   * ════ THE BODY MAP LEFT ONBOARDING ════
   *
   * Founder, 2026-08-01: *"I really did ask you to get rid of the body map in onboarding... and I
   * think we don't need a body map at all, because we said this is something the AI handles in the
   * case of an injury."*
   *
   * He asked, and it was still there — reachable in the product, absent from the gallery, so it
   * looked gone to the only person who reads the gallery.
   *
   * The screen asked her to mark ten muscles off / normal / emphasis BEFORE she had ever trained,
   * and then the very next screen asked a coach the same question in words. Two answers to one
   * question, and the coach's is the better one: it can ask WHY, and it can change its mind.
   *
   * The MAP itself is not gone — it is the pain flow's own surface (13.2) and the profile editor
   * (4.1). What is gone is asking a stranger to fill one in.
   */
  // THE INTAKE — the first conversation, and the step that produces the programme. Everything
  // before it collects what a coach cannot ask for twice (name, gender, bodyweight, days); this is
  // where she is asked the things only she knows, by the thing that will act on them.
  // The profile is NOT written here: `Root` swaps navigators the instant it exists, which would
  // take this screen out from under her mid-conversation. See `CoachIntake`.
  CoachIntake: { inputs: OnboardingInputs };
  // 2-second confirmation that builds the program, then auto-advances to Home (§4.6).
  ProgramCreated: { inputs: OnboardingInputs };
};

/**
 * FOUNDER RULING 2026-07-12 — CLOSED: navigation stays TAP-BASED and hub-and-spoke. A
 * swipe-carousel across Home / This week / History / Progress was proposed and rejected:
 * re-architecting routing purely to enable a swipe invites gesture conflicts with the controls
 * already living on those screens (the sheets, the horizontal wheels, the full-width back
 * swipe), and the current hierarchy is predictable and does not break. Simple, clear, tapped.
 */
/**
 * The four peer surfaces under the bottom tab bar (founder 2026-07-17). One tap from each other;
 * everything deeper is pushed ABOVE them on `MainParamList`, where the bar is absent.
 */
export type HomeTabsParamList = {
  // TODAY — the daily loop (the Home component). Renamed from "Home" in v7: the tab bar carries a
  // measured-range mark under it and the design calls the destination "Today".
  Today: undefined;
  // CARDIO — a launcher tab. Open training is a full-screen STAGE (no tab bar during a live run),
  // so this tab intercepts its own press and pushes the Main-stack Cardio screen instead of
  // rendering anything itself (Root.tsx). The working run/walk flow is untouched.
  Cardio: undefined;
  // Progression report (founder, 2026-06-21). Default = all-time + the milestones gallery;
  // `window: 'quarter'` = the last-12-weeks view the every-12-weeks notification opens (the former
  // QuarterlyReport screen, merged in here 2026-07-15). History folds into this surface in v7.
  Progress: { window?: 'all' | 'quarter' } | undefined;
  // YOU (ProfileSheet) — a peer surface you return to, not a one-off sheet. It exits by tapping
  // another tab. Renamed from "Settings" in v7.
  You: undefined;
};

export type MainParamList = {
  /**
   * THE COACH — the conversation, reached from the corner of Today rather than the tab bar.
   *
   * The founder's reason is the product's positioning: *"I don't want to put the AI in the tab bar,
   * because that would signal hardest of all that we're just another AI app — when we really,
   * really aren't."* A tab is a section; this is who decides what the other sections show.
   */
  Coach: undefined;
  // The tab host is the stack's root. Everything below is pushed on top of the tabs.
  HomeTabs: NavigatorScreenParams<HomeTabsParamList> | undefined;
  // Open training (run / walk) — recorded, never coached, sealed off from the v4
  // strength engine. The recorded activity lands in the unified History timeline.
  // NAME IS UNIQUE ON PURPOSE (not "Cardio"): the HomeTabs child also has a "Cardio"
  // route (the READY tab). A shared name made `navigate('Cardio')` from the focused
  // Cardio tab resolve back to that tab — so "Start cardio" no-op'd. The live stage
  // owns its own name so the launch always pushes it.
  /**
   * The live GPS stage. `target` is present only when the run is a STEP OF A WORKOUT the coach
   * wrote — "5 km" inside a session — and it is what lets the phone end the run itself instead of
   * asking her to confirm a distance it is already measuring.
   */
  CardioLive: { target?: { metres: number; say?: string; ex?: string } } | undefined;
  // Read-only details for one recorded cardio activity (opened from History).
  CardioDetail: { activity: CardioActivity };
  // History — every completed session + recorded run. A peer TAB in v6; in v7 it folds under the
  // Progress surface and is pushed here on the Main stack (opened from Progress).
  History: undefined;
  // Edit body data after onboarding (opened from Settings).
  /** The body map, editable forever (brief, Family 4) — stance + the per-muscle rep band. */
  // The live workout. `previewFirstGym` is the v7 GALLERY's seam and nothing else: 2.0 is an
  // overlay over this screen that rises ONCE PER INSTALL, so the first look at it in the harness
  // was also the last (it wrote the device's "seen" flag and never came back). The harness passes
  // the learning length it wants drawn; it holds the card open and never writes. Never passed by
  // the app — on a device the flag decides, as it always has.
  SessionFlow: { previewFirstGym?: number } | undefined;
  // `notStarted` = the workout was exited with zero sets logged (not saved, not counted) — Well
  // Done renders the calm "Workout not started" state instead of a completion.
  WellDone: { unlockedPortrait: boolean; summary?: SessionSummary; notStarted?: boolean };
  WorkoutDetail: { sessionId: string };
  // WHEN SOMETHING HURTS (v7 §13). `exerciseId` = the lift the session was on, so the response can
  // offer the ordinary swap for it; absent when the report is made outside a session.
  PainWhere: { exerciseId?: string } | undefined;
  // ONE LIFT'S CARD (v7 3.2b) — its climb, the marks it crossed, and the engine's stamped log for
  // it. Pushed from a chip on Progress · Lifts, so it opens above the tabs, not inside them.
  LiftDetail: { exerciseId: string };
  // Weekly Update (v4) — week-rollover summary of what changed + Why (obs/concl/action).
  // `previewAskBack` is the v7 GALLERY's seam and nothing else: the one question (3.1b) is derived
  // from the map + a real history, which a harness cannot produce. Never passed by the app.
  // `previewPlan` is the second half of the same seam: the letter's rows come from a week of engine
  // decisions, which a harness has no way to produce, so 3.1 could only ever be looked at EMPTY —
  // the one state it is least interesting in. The harness hands the engine's answer and the week's
  // band; the screen still does all the reading, ordering and drawing itself.
  WeeklyUpdate: { previewAskBack?: string; previewPlan?: { plan: WeeklyPlanView; band: WeeklyBand; history?: Session[] } } | undefined;
  // Paywall (Subscription + Apple Payments) — free-trial gate before further sessions,
  // also opened from Profile → Membership. `source` records what surfaced it.
  Paywall: { source: 'gate' | 'profile' } | undefined;
  // §11.4 / 11.5 — a plan travels as an opaque link and nothing else leaves the phone
  // (domain/planShare is an allow-list). `SharePlan` is opened from You; `PlanReceived` is opened
  // by the link itself, and carries the encoded token rather than a decoded plan so the screen
  // does the reading — an unreadable token must never have produced a route in the first place.
  SharePlan: undefined;
  PlanReceived: { token: string };
  // Share card (§9) — the poster, previewed, then handed to the OS share sheet. A transparent
  // modal over whatever surfaced it (a completed workout, the week's close). `card` carries the
  // already-derived facts (domain/shareCard); the screen renders and captures, deriving nothing.
  ShareCardModal: { card: ShareCard };
};
