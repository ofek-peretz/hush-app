/**
 * ════ AN INVITE THAT ARRIVED BEFORE THERE WAS ANYONE TO JOIN (the coach track, 2026-09-17) ════
 *
 * A coach's link can be the very thing that installs and opens the app. On that phone there is no
 * profile yet, so `Root` cannot open `CoachJoin` on the main stack — and it must not open it in the
 * intake either, ahead of About you: the join sends her sex and name, and the invite's copy is
 * conjugated at her. So the code waits HERE, in memory, and About you's Continue carries it to the
 * invite once she has answered. Spent once; a second link simply replaces it.
 *
 * In memory on purpose: an invite she ignored should not ambush her on a later launch.
 */

let pending: string | null = null;

export function setPendingCoachInvite(code: string | null): void {
  pending = code;
}

export function peekPendingCoachInvite(): string | null {
  return pending;
}

export function takePendingCoachInvite(): string | null {
  const c = pending;
  pending = null;
  return c;
}
