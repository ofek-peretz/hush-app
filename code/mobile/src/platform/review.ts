/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ASK FOR A RATING — spent at the one moment the product has earned it, and spent once.
 *
 * ⛔ FOUNDER MANDATE, 2026-08-23 (world-class): every category leader asks for a review, and WHERE
 * they ask decides whether it converts or costs. The default failure is asking on a schedule —
 * launch #10, day #7 — which is asking a stranger at a bus stop. Hush has something none of them
 * have: **a moment engineered to be rare and proud.** The milestone is the one licensed loud beat
 * in the product (roughly once a month in year one, by construction), it fires exactly when she has
 * just done something SHE is proud of, and the emblem has already landed when we speak.
 *
 * ── THE RULES, AND EACH ONE IS LOAD-BEARING ─────────────────────────────────────────────────────
 *   · ONCE, EVER, from our side. iOS already throttles `requestReview` (3 per 365 days), but the
 *     throttle is Apple protecting the USER from apps — the flag here is Hush protecting its own
 *     manner. An app that asks twice has asked ten times; only iOS's counter knows the difference.
 *   · Only on a MILESTONE beat — never a plain finish, never a launch, never a timer. The moment
 *     must argue for the app by itself before the sheet appears over it.
 *   · Never before the athlete has real history: the milestone families start at 10 workouts /
 *     first engine raise, so the gate is structural — but `MIN_SESSIONS` states it anyway, so a
 *     future cheap milestone cannot silently start prompting week-one athletes.
 *   · FIRE-AND-FORGET and silent on failure. The OS decides whether a sheet actually appears;
 *     nothing in the product waits on it, reads its result, or mentions it in copy. There is no
 *     "rate us" screen, no stars in our UI, no pre-ask — the pre-ask pattern is begging with a
 *     doorman, and the product's whole voice is that it does not beg.
 *
 * Same seam shape as every native module here: guarded require, stub-clean under jest/web.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { track } from '@/platform/telemetry';

/**
 * Registered in `db.K` as `reviewAsked` so `clearAll` wipes it with the identity — a review flag
 * that survived a wiped account would silently never ask the NEXT athlete on this phone
 * (`everyStorageKeyIsAccountedFor` is the law that hunts exactly this).
 */
export const REVIEW_ASKED_KEY = 'hush.review.asked';

/** The structural floor under any future cheap milestone. Ten is the first count milestone. */
export const MIN_SESSIONS_FOR_REVIEW = 10;

function optionalRequire<T = unknown>(load: () => T): T | null {
  try {
    return load();
  } catch {
    return null;
  }
}

interface StoreReviewModule {
  hasAction(): Promise<boolean>;
  requestReview(): Promise<void>;
}

const storeReview = optionalRequire<StoreReviewModule>(() => require('expo-store-review'));

/**
 * Ask, if this is the once. Called from the milestone beat AFTER the emblem has landed — the
 * celebration is hers first; the sheet arrives over a moment already complete.
 */
export async function maybeAskForReview(completedSessions: number): Promise<void> {
  try {
    if (!storeReview) return;
    if (completedSessions < MIN_SESSIONS_FOR_REVIEW) return;
    if (await AsyncStorage.getItem(REVIEW_ASKED_KEY)) return;
    if (!(await storeReview.hasAction())) return;
    /*
     * ⚠️ THE FLAG IS WRITTEN BEFORE THE REQUEST, deliberately. `requestReview` resolves without
     * saying whether a sheet appeared (Apple's API tells nobody), so there is no "success" to wait
     * for — and a flag written after a hung native call is a flag that never lands, which turns
     * "once" into "on every milestone until it works". One spent attempt is the honest record.
     */
    await AsyncStorage.setItem(REVIEW_ASKED_KEY, '1');
    void track('review_asked', { atSessions: completedSessions });
    await storeReview.requestReview();
  } catch {
    // A review failure is nothing. She keeps her milestone; the OS keeps its counsel.
  }
}
