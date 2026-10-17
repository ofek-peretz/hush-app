/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE QUIET COACH — what the voice says in a workout, and nothing else (founder-approved, 2026-10-17)
 *
 * Founder, after training with the full spoken coach: *"מה שטוב: שהבינה אומרת שנותרו עוד 10 שניות
 * למנוחה ואז כשנגמרת המנוחה יש את הצליל שהמנוחה נגמרה. כל השאר אני חושב שאפשר לבטל. אולי אפשר
 * לעשות שבסיום האימון לתת פידבק חיובי מסוים וזהו."* — and, on the proposal: *"מאשר הכל."*
 *
 * So in a workout the voice speaks at three moments, and every word is one she cannot get without
 * taking the phone out:
 *
 *   · TEN SECONDS before a rest ends — "עוד עשר שניות." — and, when the rest leads to a NEW lift, the
 *     lift she walks to: "עוד עשר שניות. הבא: לחיצת חזה." (not between sets of one lift, and not
 *     across the halves of a superset: she is not done with the row);
 *   · THE BELL when the rest runs out on its own — on its own timer, AT the rest's end instant, not
 *     when the stage gets round to ending the rest (a stage that ticks late in a pocket would ring
 *     late). Not when she ends it herself — she is already moving, and a bell then is noise;
 *   · and a TIMED exercise (a plank) the same way: ten seconds before its end, the bell at it;
 *   · ONE SENTENCE when the workout is over (`voiceScript.recap` over `domain/voiceRecap`).
 *
 * Everything the full coach said besides — the opening, each lift and its load, "set two of three",
 * the echo of every set, "rest: two minutes", the crossing, the reminders, the pause — is gone: the
 * stage, the wrist and the lock screen already show all of it, and each line lowered her music.
 * `voiceConductor` is that full coach, kept as it was and no longer mounted (`useVoiceCoach`).
 *
 * ⛔ STATELESS BY CONSTRUCTION. Every timer is armed from the store's own clocks (`restEndsAtMs`,
 * `holdEndsAtMs`) — the instants the ring, the wrist and the lock card count to — and armed again
 * from them after anything that could have moved them: earbuds back, a call ended, a pause left, the
 * app killed and reopened. There is nothing to persist and nothing to replay, so nothing can be said
 * twice or at the wrong second. It never listens: no microphone is held (`workoutMicrophone`).
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import type { Session as SavedSession } from '@/data/local/models';
import { voiceRecap } from '@/domain/voiceRecap';
import { voiceScript, type VoiceLocale } from '@/domain/voiceScript';
import type { SessionView, Step } from '@/state/stores/sessionStore';
import type { Mouth, Session as AudioSession } from '@/platform/voice/voiceConductor';

/** A rest that ended this close to its clock ran out on its own — the bell is hers. */
export const NATURAL_END_MS = 1_500;
/**
 * The bell's timer did not get to ring (the process was held back) and the rest's end is seen late:
 * rung if it is no later than this. Later than that a bell is not the end of a rest, it is noise.
 */
export const LATE_BELL_MS = 5_000;
/** No "ten seconds" in a rest (or a hold) shorter than this — the line would land at its start. */
export const TEN_SECONDS_MIN_S = 20;
/** The ten-seconds line is not said with less than this left — a late one is a wrong one. */
const TOO_LATE_MS = 5_000;
/** How long the end waits for the finished workout to be on disk before it says nothing. */
export const RECAP_WAIT_MS = 4_000;

export interface QuietCoachDeps {
  mouth: Mouth;
  audio: AudioSession;
  now: () => number;
  setTimeout: (f: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
  /** The latest view — the store re-renders asynchronously. */
  getView: () => SessionView | null;
  locale: () => VoiceLocale;
  track?: (event: string, props?: Record<string, unknown>) => void;
  /**
   * The workout that just ended, from disk, with the history BEFORE it and whether it closed her week
   * (`weekOpenMs === startedAt + 1`, the finish screen's own test) — null when it cannot be read in
   * time. The last set is never in the last live view, so the end is read from what was saved.
   */
  finished?: (startedAtMs: number) => Promise<{ session: SavedSession; history: readonly SavedSession[]; weekClosed: boolean } | null>;
}

const isRest = (v: Pick<SessionView, 'displayPhase'>): boolean => v.displayPhase === 'REST_INTER' || v.displayPhase === 'REST_TRANSITION';

export class QuietCoach {
  private on = false;
  private mode: 'off' | 'live' | 'ended' = 'off';
  private interrupted = false;
  private lastActive = false;
  private lastActiveView: SessionView | null = null;
  /** The rest being counted: the step it follows, and the end it counts to. */
  private rest: { index: number; endMs: number | null } | null = null;
  /** The rest end the bell has rung for — never twice for one end. */
  private rang: number | null = null;
  /** The timed exercise on stage: the step, and its end. */
  private hold: { index: number; endMs: number } | null = null;
  private timers = new Set<unknown>();
  private chain: Promise<void> = Promise.resolve();
  private queued = 0;

  constructor(private readonly d: QuietCoachDeps) {}

  // ── Lifecycle (the surface `useVoiceCoach` drives) ──────────────────────────────────────────────

  enable(): void {
    if (this.on) return;
    this.on = true;
    const v = this.d.getView();
    // Nothing waits on her word any more: no Ready stands on the card for a voice that asks nothing.
    v?.setAwaitingReady(false);
    // Mid-workout (earbuds in late, the app reopened): the clocks are read as they stand — nothing is
    // announced, nothing replayed.
    this.lastActive = !!v?.active;
    this.mode = v?.active ? 'live' : 'off';
    this.rest = null;
    this.hold = null;
    if (v) this.observe(v);
  }

  disable(): void {
    if (!this.on) return;
    this.on = false;
    this.clearTimers();
    this.rest = null;
    this.hold = null;
    this.interrupted = false;
    this.mode = 'off';
    this.d.mouth.interrupt();
    this.d.getView()?.setAwaitingReady(false);
    void this.d.audio.unduck();
  }

  /** The workout ended and the stage is leaving: the last sentence is said to the end, then quiet. */
  finish(): Promise<void> {
    return this.chain.then(() => this.disable());
  }

  isOn(): boolean {
    return this.on;
  }

  ended(): boolean {
    return this.mode === 'ended';
  }

  isInterrupted(): boolean {
    return this.interrupted;
  }

  /** A call, Siri, an alarm: nothing is said over it; afterwards the clocks are read again. */
  onInterruption(began: boolean): void {
    if (!this.on) return;
    if (began) {
      if (this.interrupted) return;
      this.interrupted = true;
      this.clearTimers();
      this.d.mouth.interrupt();
      return;
    }
    if (!this.interrupted) return;
    this.interrupted = false;
    // Re-armed from the store's clocks — a rest that ended during the call has no bell after it.
    this.rest = null;
    this.hold = null;
    const v = this.d.getView();
    if (v?.active) this.observe(v);
  }

  // ── The only seams the full coach had that this one keeps answering, so the hook stays one hook.

  /** The quiet coach never listens — nothing to refuse, nothing to say about it. */
  earRefused(): void {}
  earDownBecause(): null {
    return null;
  }
  earMayListen(): void {}
  /** Nothing to restore: every clock is read off the store (see the header). */
  restore(): void {}

  // ── The view ────────────────────────────────────────────────────────────────────────────────────

  observe(v: SessionView): void {
    if (!this.on) {
      this.lastActive = v.active;
      return;
    }
    if (v.active && !this.lastActive) {
      this.mode = 'live';
      this.rest = null;
      this.hold = null;
    }
    if (!v.active && this.lastActive) this.onEnd(this.lastActiveView ?? v);
    this.lastActive = v.active;
    if (!v.active) return;
    this.lastActiveView = v;
    if (this.interrupted) return;
    // A pause freezes every clock: nothing is counted, nothing rings. Leaving it re-reads the clocks.
    if (v.paused) {
      this.clearTimers();
      this.hold = null;
      if (this.rest) this.rest.endMs = null; // the end will be read again on resume
      return;
    }
    const index = v.globalProgress?.index ?? -1;

    // ── The rest.
    if (isRest(v)) {
      if (!this.rest || this.rest.index !== index || this.rest.endMs !== v.restEndsAtMs) {
        this.rest = { index, endMs: v.restEndsAtMs };
        this.armRest(v);
      }
    } else if (this.rest) {
      const end = this.rest.endMs;
      this.rest = null;
      this.clearTimers();
      // The rest ran out on its own and its timer could not ring (a process held back): rung now, if
      // only just late. She ended it herself: she is already moving.
      const now = this.d.now();
      if (end != null && this.rang !== end && now >= end - NATURAL_END_MS && now - end <= LATE_BELL_MS) this.ringRest(end);
    }

    // ── A timed exercise on stage.
    if (v.displayPhase === 'SET_PRESENTED' && v.holdEndsAtMs != null) {
      if (!this.hold || this.hold.index !== index || this.hold.endMs !== v.holdEndsAtMs) {
        this.hold = { index, endMs: v.holdEndsAtMs };
        this.armHold(v);
      }
    } else if (this.hold && !isRest(v)) {
      this.hold = null;
      this.clearTimers();
    } else if (this.hold && isRest(v)) {
      this.hold = null; // the hold is over and its rest has its own timers, armed above
    }
  }

  /** "+15" moved the rest's end (the stage, the lock screen, the wrist): the ten seconds move with it. */
  onRestExtended(v: SessionView): void {
    // Under a pause the end is frozen: +15 lands on it, and the clocks are read again on resume.
    if (!this.on || this.interrupted || v.paused || !isRest(v)) return;
    this.rest = { index: v.globalProgress?.index ?? -1, endMs: v.restEndsAtMs };
    this.armRest(v);
  }

  // ── The three moments ───────────────────────────────────────────────────────────────────────────

  /** Ten seconds before the rest's end, counted to the store's own end instant. */
  scheduleTenSeconds(v: Pick<SessionView, 'restSeconds' | 'restExtraSeconds' | 'restEndsAtMs'>): void {
    const total = v.restSeconds + (v.restExtraSeconds ?? 0);
    if (total < TEN_SECONDS_MIN_S) return;
    const endMs = v.restEndsAtMs ?? this.d.now() + total * 1000;
    const inMs = endMs - 10_000 - this.d.now();
    if (inMs < 0) return; // already inside the last ten seconds — a late "ten seconds" is a wrong one
    this.after(inMs, () => {
      const n = this.d.getView();
      if (!n?.active || n.paused || !isRest(n)) return;
      if (n.restEndsAtMs != null && n.restEndsAtMs - this.d.now() < TOO_LATE_MS) return;
      void this.speak([this.tenSecondsLine(n)]);
    });
  }

  private armRest(v: SessionView): void {
    this.clearTimers();
    this.scheduleTenSeconds(v);
    // The bell, at the rest's own end — the same instant the ring, the wrist and the card count to.
    const end = v.restEndsAtMs;
    const index = v.globalProgress?.index ?? -1;
    if (end == null || end <= this.d.now()) return;
    this.after(end - this.d.now(), () => {
      const n = this.d.getView();
      // Still this rest, still running: it ran out on its own.
      if (!n?.active || n.paused || !isRest(n) || (n.globalProgress?.index ?? -1) !== index || n.restEndsAtMs !== end) return;
      this.ringRest(end);
    });
  }

  private ringRest(end: number): void {
    if (this.rang === end) return;
    this.rang = end;
    this.bell('rest');
  }

  /** "עוד עשר שניות." — and the lift she walks to, when the rest leads to a new one. */
  private tenSecondsLine(v: SessionView): string {
    if (v.displayPhase !== 'REST_TRANSITION' || !v.nextExerciseId) return voiceScript.tenSeconds();
    // Is the lift she just did really over? Between the rounds of a superset the stage crosses lifts,
    // but the row comes back — she is resting before round two, not walking anywhere.
    const plan = v.livePlan as Step[];
    const at = v.globalProgress?.index ?? -1;
    const done = plan[at];
    const over = !done || !plan.slice(at + 1).some((s) => s.exerciseId === done.exerciseId);
    return over && v.nextExerciseId !== done?.exerciseId ? voiceScript.tenSecondsNext(v.nextExerciseId) : voiceScript.tenSeconds();
  }

  /** A plank on stage: ten seconds before its end, and the bell at it. */
  private armHold(v: SessionView): void {
    this.clearTimers();
    const endMs = v.holdEndsAtMs!;
    const index = v.globalProgress?.index ?? -1;
    const seconds = v.currentItem && v.currentItem.kind === 'time' ? v.currentItem.seconds : Math.round((endMs - this.d.now()) / 1000);
    const still = (): boolean => {
      const n = this.d.getView();
      return !!n?.active && !n.paused && n.displayPhase === 'SET_PRESENTED' && (n.globalProgress?.index ?? -1) === index && n.holdEndsAtMs === endMs;
    };
    const tenIn = endMs - 10_000 - this.d.now();
    if (seconds >= TEN_SECONDS_MIN_S && tenIn >= 0) {
      this.after(tenIn, () => {
        if (still()) void this.speak([voiceScript.tenSeconds()]);
      });
    }
    const endIn = endMs - this.d.now();
    if (endIn >= 0) {
      this.after(endIn, () => {
        if (still()) this.bell('hold');
      });
    }
  }

  /** The workout is over: one sentence, built from what was saved (the last set included). */
  private onEnd(last: SessionView): void {
    this.mode = 'ended';
    this.clearTimers();
    this.rest = null;
    this.hold = null;
    const startedAtMs = last.startedAtMs;
    const planned = last.sessionSetCounts;
    if (startedAtMs == null || !this.d.finished) return;
    const job = async () => {
      if (!this.on || this.interrupted) return;
      let waitHandle: unknown = null;
      const read = await Promise.race([
        this.d.finished!(startedAtMs).catch(() => null),
        new Promise<null>((r) => {
          waitHandle = this.d.setTimeout(() => r(null), RECAP_WAIT_MS);
        }),
      ]);
      if (waitHandle != null) this.d.clearTimeout(waitHandle);
      if (!read) return void this.d.track?.('voice_recap', { said: false, why: 'not_on_disk' });
      const recap = voiceRecap(read.session, read.history, planned);
      if (recap.sets === 0) return; // nothing logged is not a workout to sum up
      this.d.track?.('voice_recap', { said: true, records: recap.records.length, onTarget: recap.onTarget.length, week: read.weekClosed });
      await this.sayNow([voiceScript.recap(recap, read.weekClosed, this.d.locale())]);
    };
    this.enqueue(job);
  }

  // ── Plumbing ────────────────────────────────────────────────────────────────────────────────────

  private bell(why: 'rest' | 'hold'): void {
    this.d.track?.('voice_bell', { why });
    this.enqueue(() => this.sayNow([], true));
  }

  private speak(lines: string[]): Promise<void> {
    if (!this.on || this.interrupted || lines.length === 0) return this.chain;
    this.d.mouth.warm?.(lines, this.d.locale().locale);
    return this.enqueue(() => this.sayNow(lines));
  }

  /** One utterance: her music down, the bell first when it rings, the lines, the music back. */
  private async sayNow(lines: string[], chime = false): Promise<void> {
    if (!this.on || this.interrupted) return;
    await this.d.audio.duck();
    try {
      if (chime) await this.d.audio.playChime();
      const locale = this.d.locale().locale;
      for (const line of lines) {
        if (!this.on || this.interrupted) break;
        await this.d.mouth.say(line, locale);
      }
    } finally {
      if (this.queued <= 1) await this.d.audio.unduck();
    }
  }

  private enqueue(job: () => Promise<void>): Promise<void> {
    this.queued += 1;
    const run = async () => {
      try {
        await job();
      } finally {
        this.queued -= 1;
      }
    };
    this.chain = this.chain.then(run, run);
    return this.chain;
  }

  private after(ms: number, f: () => void): void {
    const h = this.d.setTimeout(() => {
      this.timers.delete(h);
      f();
    }, ms);
    this.timers.add(h);
  }

  private clearTimers(): void {
    for (const h of this.timers) this.d.clearTimeout(h);
    this.timers.clear();
  }
}
