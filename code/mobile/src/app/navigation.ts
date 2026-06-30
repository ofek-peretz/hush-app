/**
 * Navigation param lists. Two groups gated by onboarding completion (Root.tsx):
 * onboarding (forward-only) and the main app.
 *
 * Entry flow (HUSH_BUILD_SPEC §3, founder directive 2026-06-18; Goal step removed
 * 2026-06-30 — Hush is hypertrophy-first for everyone, so goal is no longer asked):
 *   Authentication → Consent → Name → Connect Health → Manual Info
 *   → Experience → Days per week → Program Created → Home.
 * Invite-token enrollment is removed.
 */
import type { CardioActivity, Experience, OnboardingInputs, SessionSummary } from '@/data/local/models';

/** Profile fields gathered in onboarding — from HealthKit (granted) or Manual Info. */
export interface OnboardingProfileDraft {
  healthConnected: boolean;
  age?: number;
  sex?: 'male' | 'female';
  heightCm?: number;
  weightKg?: number;
}

export type OnboardingParamList = {
  Authentication: undefined;
  Consent: undefined;
  // "What should we call you?" — captures the name (fallback to the Apple-provided name).
  NameEntry: undefined;
  ConnectHealth: undefined;
  // Single screen, four fields (§4.3) — now shown to EVERYONE (sex/age/height/weight
  // are needed for the program; HealthKit only reliably gives steps/weight). The flag
  // records whether Health was connected (for weight prefill + the profile).
  ManualInfo: { healthConnected: boolean } | undefined;
  // Experience drives the starting weights; the first choice after body data.
  Experience: { profile: OnboardingProfileDraft };
  DaysPerWeek: { profile: OnboardingProfileDraft; experience: Experience };
  // 2-second confirmation that builds the program, then auto-advances to Home (§4.6).
  ProgramCreated: { inputs: OnboardingInputs };
};

export type MainParamList = {
  // Home is the single root. Program · History · Portrait · Settings (ProfileSheet)
  // are reached from the Home hamburger Menu (the Tab Bar was removed) and pushed
  // onto this stack with a back affordance.
  // `focusDayId` = the workout chosen via "Set as next"; Home offers it (if still
  // unfinished) instead of the default next workout (§4.19 / §5.8).
  Home: { focusDayId?: string } | undefined;
  Program: undefined;
  History: undefined;
  // Open training (run / walk) — recorded, never coached, sealed off from the v4
  // strength engine. The recorded activity lands in the unified History timeline.
  Cardio: undefined;
  // Read-only details for one recorded cardio activity (opened from History).
  CardioDetail: { activity: CardioActivity };
  // Pushed / modal surfaces.
  ProfileSheet: undefined;
  SessionFlow: undefined;
  // `notStarted` = the workout was exited with zero sets logged (not saved, not counted) — Well
  // Done renders the calm "Workout not started" state instead of a completion.
  WellDone: { unlockedPortrait: boolean; summary?: SessionSummary; notStarted?: boolean };
  ProgramDetail: { dayId: string };
  WorkoutDetail: { sessionId: string };
  // Quarterly peak-weight progress report — surfaced by the every-12-weeks notification.
  QuarterlyReport: undefined;
  // All-time progression (founder, 2026-06-21) — reached from Home / Recovery hub.
  Progress: undefined;
  // Weekly Update (v4) — week-rollover summary of what changed + Why (obs/concl/action).
  WeeklyUpdate: undefined;
  // Paywall (Subscription + Apple Payments) — free-trial gate before further sessions,
  // also opened from Profile → Membership. `source` records what surfaced it.
  Paywall: { source: 'gate' | 'profile' } | undefined;
  // Internal debug/QA (DEV only) — per-slot v4 engine state dump.
  V4Debug: undefined;
};
