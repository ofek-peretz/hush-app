/**
 * Navigation param lists. Two groups gated by onboarding completion (Root.tsx):
 * onboarding (forward-only) and the main app. No tab bar, ever (spec §8.9).
 */
import type { Goal } from '@/data/local/models';

export type OnboardingParamList = {
  Enrollment: undefined;
  ConnectHealth: undefined;
  Goal: { healthConnected: boolean };
  DaysPerWeek: { healthConnected: boolean; goal: Goal };
  // About You is split across two screens so the age field can never sit below
  // the fold (§1.5). Screen A captures Age + Sex; Screen B captures Height + Weight.
  AboutYou: { healthConnected: boolean; goal: Goal; daysPerWeek: number };
  AboutYouBody: {
    healthConnected: boolean;
    goal: Goal;
    daysPerWeek: number;
    age: number;
    sex: 'male' | 'female';
  };
};

export type MainParamList = {
  Home: undefined;
  ProfileSheet: undefined;
  SessionFlow: undefined;
  WellDone: { unlockedPortrait: boolean };
  PortraitUnlock: undefined;
  // `receipt` => arrived via a resolved forecast: force Compare + show the receipt.
  PortraitRevisit: { receipt?: boolean } | undefined;
  ThresholdAlert: undefined;
  Program: undefined;
  ProgramDetail: { dayId: string };
  History: undefined;
  WorkoutDetail: { sessionId: string };
  Settings: undefined;
};
