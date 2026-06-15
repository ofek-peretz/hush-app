/**
 * Notifications interface (spec §8.6, §1.25, §7.7). DEFERRED native surface —
 * stubbed per the v1 build decision (wired later via EAS/Mac).
 *
 * Contract captured for when it is wired:
 *  - Weekly Program Ready: 20:00 LOCAL, title "Next week's program is ready.",
 *    NO body, no numbers/CTA; opens Program (1.20).
 *  - Threshold alert: event-driven ONLY, never scheduled/periodic; opens the
 *    Portrait threshold alert (1.10); coalesce duplicates.
 *  - Receipts are NEVER notifications — receipts surface in-session only (§8.6).
 *
 * The in-app destinations (Program, ThresholdAlert) already exist; only the OS
 * scheduling/delivery is deferred.
 */

export type NotificationIntent =
  | { kind: 'weekly_program_ready' } // -> Program
  | { kind: 'threshold_alert' }; // -> ThresholdAlert

export interface Notifier {
  /** Schedule the calm weekly note at 20:00 local. */
  scheduleWeeklyProgramReady(): Promise<void>;
  /** Fire a one-off threshold alert (coalesced upstream). */
  fireThresholdAlert(): Promise<void>;
  /** Cancel everything (e.g. on sign-out). */
  cancelAll(): Promise<void>;
}

/** v1 no-op stub. */
export const notifierStub: Notifier = {
  async scheduleWeeklyProgramReady() {},
  async fireThresholdAlert() {},
  async cancelAll() {},
};
