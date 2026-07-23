/**
 * Navigation param lists. Two groups gated by onboarding completion (Root.tsx):
 * onboarding (forward-only) and the main app.
 *
 * Entry flow (HUSH_BUILD_SPEC §3, founder directive 2026-06-18; Goal step removed
 * 2026-06-30 — Hush is hypertrophy-first for everyone, so goal is no longer asked;
 * Experience + Days per week merged into one Training step 2026-07-10):
 *   Authentication (sign-in + consent, merged 2026-07-12) → Name → Connect Health
 *   → Manual Info
 *   → Training → Program Created → Home.
 * Invite-token enrollment is removed.
 */
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { CardioActivity, OnboardingInputs, SessionSummary } from '@/data/local/models';
import type { ShareCard } from '@/domain/shareCard';

/** Profile fields gathered in onboarding — from HealthKit (granted) or Manual Info. */
export interface OnboardingProfileDraft {
  healthConnected: boolean;
  age?: number;
  sex?: 'male' | 'female';
  heightCm?: number;
  weightKg?: number;
}

export type OnboardingParamList = {
  // Sign-in AND consent (merged 2026-07-12): continuing with a provider records the
  // versioned agreement — the line under the buttons says so before it is pressed.
  Authentication: undefined;
  // "How should I address you?" — the NAME and the GENDER (moved here from Body data,
  // founder 2026-07-12: Hebrew conjugates the second person, so the copy layer needs it
  // before the next screen speaks). Sex rides the params from here to the profile.
  NameEntry: undefined;
  ConnectHealth: { sex: 'male' | 'female' } | undefined;
  // Age / height / weight (§4.3) — shown to EVERYONE (HealthKit is read for cardio only).
  // `healthConnected` records whether Health was connected; `sex` is carried from NameEntry.
  ManualInfo: { healthConnected: boolean; sex?: 'male' | 'female' } | undefined;
  // Training (merged Experience + Days per week, 2026-07-10): experience drives the
  // starting weights, frequency shapes the split — one screen, whole in the viewport.
  Training: { profile: OnboardingProfileDraft };
  // The BODY MAP (Revision 7) — off / normal / emphasis per muscle; the programme's shape follows
  // from it (register Part 3), replacing the demographic split. Carries the assembled inputs from
  // Training, writes bodyMap, then continues to the build.
  BodyMap: { inputs: OnboardingInputs };
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
  // The tab host is the stack's root. Everything below is pushed on top of the tabs.
  HomeTabs: NavigatorScreenParams<HomeTabsParamList> | undefined;
  // Open training (run / walk) — recorded, never coached, sealed off from the v4
  // strength engine. The recorded activity lands in the unified History timeline.
  Cardio: undefined;
  // Read-only details for one recorded cardio activity (opened from History).
  CardioDetail: { activity: CardioActivity };
  // History — every completed session + recorded run. A peer TAB in v6; in v7 it folds under the
  // Progress surface and is pushed here on the Main stack (opened from Progress).
  History: undefined;
  // Edit body data after onboarding (opened from Settings).
  ProfileEdit: undefined;
  /** The body map, editable forever (brief, Family 4) — stance + the per-muscle rep band. */
  BodyMapEdit: undefined;
  SessionFlow: undefined;
  // `notStarted` = the workout was exited with zero sets logged (not saved, not counted) — Well
  // Done renders the calm "Workout not started" state instead of a completion.
  WellDone: { unlockedPortrait: boolean; summary?: SessionSummary; notStarted?: boolean };
  WorkoutDetail: { sessionId: string };
  // Weekly Update (v4) — week-rollover summary of what changed + Why (obs/concl/action).
  WeeklyUpdate: undefined;
  // Paywall (Subscription + Apple Payments) — free-trial gate before further sessions,
  // also opened from Profile → Membership. `source` records what surfaced it.
  Paywall: { source: 'gate' | 'profile' } | undefined;
  // Share card (§9) — the poster, previewed, then handed to the OS share sheet. A transparent
  // modal over whatever surfaced it (a completed workout, the week's close). `card` carries the
  // already-derived facts (domain/shareCard); the screen renders and captures, deriving nothing.
  ShareCardModal: { card: ShareCard };
};
