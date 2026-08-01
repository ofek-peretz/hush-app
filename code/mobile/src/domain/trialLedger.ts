/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE TRIAL, WHERE DELETING THE APP DOES NOT REACH.
 *
 * The founder asked the exact question: *"are we protected against loops — someone doing 14 free
 * workouts, not subscribing, and repeating it?"*
 *
 * We were not. The count lived in `hush.mode`, which is AsyncStorage: deleting the app clears it,
 * and so does "erase account" inside the app. Fourteen free workouts, a reinstall, fourteen more,
 * for ever, and it took no skill at all.
 *
 * ── WHY THE KEYCHAIN, AND WHAT IT HONESTLY BUYS ─────────────────────────────────────────────────
 * On iOS a Keychain item OUTLIVES the app that wrote it. It survives deletion and reinstall; it
 * does not survive an erased device or an athlete who deliberately clears it. So this stops the
 * casual loop — delete, reinstall, train free again — which is the one that actually happens,
 * because it costs nothing and occurs to everybody.
 *
 * It does not stop someone determined. Nothing on the device can: a trial defended only on the
 * device is defended by the attacker's own hardware. The real fix is a server that counts trials
 * per ACCOUNT, and this app is 100% on-device by ruling. So the honest description is: it turns a
 * free loop into a device wipe, and it costs one file.
 *
 * ── THE HIGHER OF THE TWO ALWAYS WINS ───────────────────────────────────────────────────────────
 * The ledger and the ordinary count are both kept, and the trial reads whichever is FURTHER ALONG.
 * That direction is deliberate:
 *
 *   · a reinstall gives a fresh `mode` and a surviving ledger → the ledger wins, and the trial does
 *     not restart;
 *   · a Keychain that fails to read (a restore onto new hardware, a locked device at boot) gives a
 *     surviving `mode` and an empty ledger → `mode` wins, and an honest athlete is not handed a
 *     second trial she did not ask for and cannot decline.
 *
 * Taking the LOWER would mean one unreadable Keychain hands a paying-track athlete a free restart.
 * Taking the higher means the worst case is that a genuinely new athlete on a second-hand phone
 * starts partway through. That is the better failure, and it is rare; the other is free money
 * leaving on every read error.
 *
 * Pure and I/O-free — the caller supplies both numbers and persists what comes back.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** The Keychain key. `expo-secure-store` accepts alphanumerics, `.`, `-` and `_` only. */
export const TRIAL_LEDGER_KEY = 'hush_trial_used';

/**
 * How many free sessions this DEVICE has consumed.
 *
 * `ledger` is the Keychain's number and `local` is the ordinary count. Either may be missing; the
 * higher of the two is the answer, and the header says why that direction.
 */
export function trialUsed(ledger: number | null | undefined, local: number | null | undefined): number {
  const a = Number.isFinite(ledger) ? Math.max(0, ledger as number) : 0;
  const b = Number.isFinite(local) ? Math.max(0, local as number) : 0;
  return Math.max(a, b);
}

/**
 * What to write back after a session.
 *
 * Monotonic on purpose: the ledger only ever moves up. A number that could go down is a number an
 * attacker only has to make go down once.
 */
export function nextLedger(ledger: number | null | undefined, completedNow: number): number {
  return Math.max(Number.isFinite(ledger) ? (ledger as number) : 0, Math.max(0, completedNow));
}
