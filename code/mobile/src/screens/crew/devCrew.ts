/**
 * ⚠️ WEB FIXTURE (2026-09-29) — the circle judged on the REAL screens (RTL, real tab bar) without a
 * server. Web only, and only while `localStorage['hush.dev.crew']` holds members; absent, it is
 * `undefined` and the real circle (`state/stores/circleStore`) is the only source. Read in exactly
 * one place — the circle store — so the walk on Expo web runs the same path a phone does.
 */
import { Platform } from 'react-native';
import type { CircleState } from '@/domain/circle';
import type { CrewMemberView } from './Crew';

const DAY_MS = 24 * 60 * 60 * 1000;

export function devCrew(): CrewMemberView[] | null | undefined {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem('hush.dev.crew');
    if (raw == null) return undefined;
    const members = JSON.parse(raw) as CrewMemberView[];
    return Array.isArray(members) && members.length > 0 ? members : null;
  } catch {
    return undefined;
  }
}

/** The fixture as the worker would answer it: `undefined` = no fixture, `null` = in no circle yet. */
export function devCircle(nowMs: number = Date.now()): CircleState | null | undefined {
  const members = devCrew();
  if (members === undefined) return undefined;
  if (members === null) return null;
  return {
    code: 'K7M2QX',
    members: members.map((m, i) => ({
      name: m.name,
      done: m.done,
      planned: m.planned,
      at: nowMs,
      id: `dev${i}`,
      ...(m.me ? { me: true } : {}),
      ...(m.lastDays != null ? { last: nowMs - m.lastDays * DAY_MS } : {}),
    })),
    streak: 4,
    cheers: [{ from: 'יוסי', at: nowMs - 3 * 60 * 60 * 1000 }],
  };
}
