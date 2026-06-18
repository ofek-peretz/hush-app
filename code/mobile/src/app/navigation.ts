/**
 * Navigation param lists. Two groups gated by onboarding completion (Root.tsx):
 * onboarding (forward-only) and the main app.
 *
 * Entry flow (HUSH_BUILD_SPEC §3, founder directive 2026-06-18):
 *   Authentication → Consent → Connect Health → [Manual Info, if Health skipped]
 *   → Goal → Days per week → Program Created → Home.
 * Invite-token enrollment is removed.
 */
import type { Goal, OnboardingInputs } from '@/data/local/models';

/** Profile fields gathered before Goal — from HealthKit (granted) or Manual Info. */
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
  ConnectHealth: undefined;
  // Single screen, four fields (§4.3) — only reached when Health is skipped.
  ManualInfo: undefined;
  Goal: { profile: OnboardingProfileDraft };
  DaysPerWeek: { profile: OnboardingProfileDraft; goal: Goal };
  // 2-second confirmation that builds the program, then auto-advances to Home (§4.6).
  ProgramCreated: { inputs: OnboardingInputs };
};

export type MainParamList = {
  // Four tab roots (spec §3). Flat stack + persistent TabBar overlay; tab taps
  // navigate by name (deduped) so switching feels like tabs.
  // `focusDayId` = the workout chosen via "Set as next"; Home offers it (if still
  // unfinished) instead of the default next workout (§4.19 / §5.8).
  Home: { focusDayId?: string } | undefined;
  Program: undefined;
  History: undefined;
  Portrait: undefined;
  // Pushed / modal surfaces over the tabs.
  ProfileSheet: undefined;
  SessionFlow: undefined;
  WellDone: { unlockedPortrait: boolean };
  PortraitUnlock: undefined;
  // `receipt` => arrived via a resolved forecast: force Compare + show the receipt.
  PortraitRevisit: { receipt?: boolean } | undefined;
  // Then·Now quarterly comparison modal (§4.27).
  PortraitThenNow: undefined;
  ThresholdAlert: undefined;
  ProgramDetail: { dayId: string };
  WorkoutDetail: { sessionId: string };
};
