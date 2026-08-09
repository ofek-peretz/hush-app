/**
 * Age upkeep (founder 2026-07-10): age is asked ONCE (onboarding) and never edited
 * again — the app keeps it current by itself, adding a year for every full year
 * since it was last set, and the engine reads the always-current value when it
 * builds programs. Sex is likewise fixed at onboarding; experience is derived from
 * real progression — so the edit screen carries none of them.
 *
 * The anchor is `ageUpdatedAt` (stamped whenever age is set); profiles from before
 * this rule fall back to `memberSince` (age was captured at account creation).
 *
 * Pure + I/O-free; the app store applies the result at boot.
 */
// @ts-nocheck

// 

import type { Profile } from '@/data/local/models';

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/** Whole years elapsed since `anchorIso` (0 for invalid/future anchors). */
export function fullYearsSince(anchorIso: string, nowMs: number): number {
  const t = Date.parse(anchorIso);
  if (Number.isNaN(t) || t > nowMs) return 0;
  return Math.floor((nowMs - t) / YEAR_MS);
}

/**
 * The profile with age advanced by the full years elapsed since its anchor, or
 * null when nothing changes (no age, no anchor, or under a year elapsed). The
 * anchor advances by exactly the years credited — never resets to "now" — so
 * fractional years are never silently dropped.
 */
export function agedProfile(profile: Profile, nowMs: number): Profile | null {
  if (profile.age == null) return null;
  const anchor = profile.ageUpdatedAt ?? profile.memberSince;
  if (!anchor) return null;
  const years = fullYearsSince(anchor, nowMs);
  if (years <= 0) return null;
  const anchorMs = Date.parse(anchor);
  return {
    ...profile,
    age: profile.age + years,
    ageUpdatedAt: new Date(anchorMs + years * YEAR_MS).toISOString(),
  };
}
