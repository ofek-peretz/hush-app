/**
 * Live Activity / Dynamic Island / Lock Screen interface. DEFERRED native
 * surface — stubbed per the v1 build decision (wired later via EAS/Mac).
 * Spec §1.25, §8.5.
 *
 * Contract captured for when it is wired:
 *  - READ-ONLY mirror of the current Session state (Inter-Set Rest / Transition
 *    Rest / active set). Timer is the hero, tabular.
 *  - NO Complete-Set action from outside the app (data integrity).
 *  - NO progress ring, heart rate, calories, or streak.
 */

export interface SessionMirror {
  exerciseName: string;
  /** Remaining rest seconds when resting; null when an active set is shown. */
  restRemainingS: number | null;
  setLabel: string; // e.g. "Set 2 of 4"
}

export interface LiveActivityHost {
  start(mirror: SessionMirror): Promise<void>;
  update(mirror: SessionMirror): Promise<void>;
  end(): Promise<void>;
}

/** v1 no-op stub. */
export const liveActivityStub: LiveActivityHost = {
  async start() {},
  async update() {},
  async end() {},
};
