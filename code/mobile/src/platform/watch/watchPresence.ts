/**
 * IS THERE A WATCH ON THIS WRIST — AND HAS SHE BEEN TOLD?
 *
 * ════ THE OFFER IS ONLY EVER MADE TO SOMEONE WHO HAS THE THING ════
 *
 * The one way any of this becomes an advertisement is by appearing for someone with no Apple
 * Watch. So nothing here is a guess: `WCSession.isPaired` is the device fact, read through
 * `nativeWatchPairing()`. Three answers, and only one of them shows anything:
 *
 *   · UNKNOWN (no native module, or WCSession has not finished activating) → say nothing, and
 *     ask again on the next open. An unknown is never spent as a "no", and never as a "yes".
 *   · NOT PAIRED → say nothing, ever. There is nothing to offer.
 *   · PAIRED → the wrist exists, and there is something true to say about it.
 *
 * ════ WHERE SHE IS TOLD (founder 2026-07-29, second pass) ════
 *
 * The first build put this on a screen AFTER her first session, which quietly forced that first
 * session to happen without the watch — for an athlete who owned one the whole time. There was
 * never a reason for that. So the telling moved to the earliest honest moment, and the two
 * surfaces split the world between them:
 *
 *   · **1.3 · Connect health, during onboarding** — the wrist is a NOTICE under the Health card,
 *     drawn only when a watch is already paired. She knows before she has trained once.
 *   · **10.4 · On your wrist, a state of Today** — for the athlete who acquires a watch LATER, or
 *     whose WCSession had not activated in time for 1.3 to say anything. It fires the first open
 *     where the answer arrives.
 *
 * One flag serves both, and that is what makes the split airtight: `hush.watch.offered` means
 * SHE HAS BEEN TOLD, by whichever surface got there first. 1.3 sets it when it drew the notice,
 * so 10.4 stays silent for her forever. 1.3 not drawing it — no watch, or an unknown — leaves the
 * flag unset, and 10.4 stays armed as the catch-all. Every case is covered exactly once:
 *
 *   watch at onboarding      → 1.3 tells her · 10.4 never fires
 *   watch bought later       → 1.3 said nothing · 10.4 fires the day it appears
 *   unknown at onboarding    → 1.3 said nothing · 10.4 fires the first open that knows
 *   no watch, ever           → neither surface ever says a word
 */
// @ts-nocheck

// 

import AsyncStorage from '@react-native-async-storage/async-storage';
import { nativeWatchPairing } from './watchTransportNative';

/** What we know about the wrist. `known: false` = we could not find out — never "no watch". */
export interface WatchPresence {
  known: boolean;
  paired: boolean;
  /** Our watch app is on it. False with `paired` true = auto-install is off on this iPhone. */
  appInstalled: boolean;
}

/** The two faces. `confirm` = it is already there; `install` = it is one step away. Both surfaces
 *  (1.3's notice and 10.4's screen) draw the same two, because it is the same pair of facts. */
export type WristOffer = 'confirm' | 'install';

export const WATCH_PRESENCE_UNKNOWN: WatchPresence = { known: false, paired: false, appInstalled: false };

/** Read WCSession's device facts. Never throws; degrades to UNKNOWN everywhere but a native build. */
export function readWatchPresence(): WatchPresence {
  const native = nativeWatchPairing();
  if (!native || !native.activated) return WATCH_PRESENCE_UNKNOWN;
  return { known: true, paired: native.paired, appInstalled: native.appInstalled };
}

/**
 * Which face a surface should draw for this presence, or null for "say nothing". Pure, and shared
 * by BOTH surfaces so 1.3's notice and 10.4's screen can never disagree about what is true.
 */
export function wristFace(presence: WatchPresence): WristOffer | null {
  if (!presence.known || !presence.paired) return null;
  return presence.appInstalled ? 'confirm' : 'install';
}

export interface WristOfferInput {
  presence: WatchPresence;
  /** She has already been told — by 1.3 during onboarding, or by 10.4 on a previous open. */
  offered: boolean;
  /**
   * She is being greeted back after a gap (10.1) on this same arrival. Two full-screen states in
   * one arrival is a stack; the wrist waits for the next open, and it has waited longer than that.
   */
  greetingBack?: boolean;
}

/**
 * 10.4's gate — the whole decision, pure, so every branch of "who sees this" is tested without a
 * watch, a phone, or a clock.
 *
 * There is no timing condition left in it, and that is the point of the second pass. The first
 * build waited for "the day after her first session", which was a workaround for showing this too
 * late in the first place: it collided with 8.2 on the way out of a first session, so it had to
 * dodge. Told at onboarding, there is nothing to dodge — by the time 10.4 is the surface that
 * speaks, she is either an existing athlete who just acquired a watch (news, worth saying now) or
 * someone 1.3 could not answer for (owed the same news, one screen late).
 */
export function offerTheWrist({ presence, offered, greetingBack }: WristOfferInput): WristOffer | null {
  if (offered) return null;
  if (greetingBack) return null;
  return wristFace(presence);
}

/**
 * SHE HAS BEEN TOLD. Written by whichever surface told her — 1.3 on the way out of Connect health,
 * or 10.4's one button. Registered in `db`'s `K` so an erased account really is erased (a flag
 * that outlives the athlete makes the app believe it has spoken to someone it has never met).
 */
const OFFERED_KEY = 'hush.watch.offered';

/**
 * THE WRITE IS ASYNC AND THE NAVIGATION IS NOT — hence the latch.
 *
 * Both surfaces mark and then leave in the same tick: 1.3 marks and navigates on to 1.4, 10.4
 * marks and hands Today back. `AsyncStorage.setItem` has not landed by then, and Home re-reads
 * this flag on every focus — so a fast return could read the OLD value and show the screen a
 * second time, which is precisely the nag both surfaces are written to avoid. The latch makes the
 * answer true the instant it is claimed; storage catches up behind it and carries it across
 * launches. Cleared by `resetWristOffered` so a wiped account and the tests both start clean.
 */
let toldThisLaunch = false;

export async function hasOfferedTheWrist(): Promise<boolean> {
  if (toldThisLaunch) return true;
  try {
    return (await AsyncStorage.getItem(OFFERED_KEY)) != null;
  } catch {
    return true; // unreadable storage → assume told, because the failure mode of "again" is a nag
  }
}

export async function markWristOffered(): Promise<void> {
  toldThisLaunch = true;
  try {
    await AsyncStorage.setItem(OFFERED_KEY, '1');
  } catch {
    /* the latch still holds for this launch; a lost write costs one extra showing next launch */
  }
}

/** Account reset — `db.clearAll()` removes the key, and this drops the latch that shadowed it.
 *  Without it a wiped phone keeps saying "already told" until the app is force-quit. */
export function resetWristOffered(): void {
  toldThisLaunch = false;
}
