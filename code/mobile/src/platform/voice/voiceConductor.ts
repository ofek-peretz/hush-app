/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE CONDUCTOR — the voice coach as a state machine over the session's own view.
 *
 * docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md, as code. The screens do not change: this reads the
 * same `SessionView` they draw and presses the same verbs a thumb would. It decides WHEN a line is
 * said and WHICH question is open; the lines themselves are `domain/voiceScript`, the answers are
 * `domain/voiceGrammar`, the mouth is `coachVoice`, the ear is `voiceCapture`, the session under
 * both is `audioSession` — every one of them injected, so the whole workout can be run on a fake
 * clock in a test (`theCoachRunsTheSpec`).
 *
 * ── THE SHAPE OF ONE SET ────────────────────────────────────────────────────────────────────────
 *   loading dialogue (a lift's first set, or a changed load)   → "מוכן" is the start
 *   silence while she lifts                                    → nothing
 *   the ask, at start + floor reps × rep time + 15 s           → a number closes it
 *   the echo, the verdict (Loop 1 — voice only), the rest      → said in that order
 *   ten seconds out, the chime, the next set's line            → which is the next start
 *
 * ── WHAT THIS FILE NEVER DOES ───────────────────────────────────────────────────────────────────
 * It never writes a set without saying it back first; it never guesses a sentence it did not
 * recognise; it never speaks without earbuds; it never writes a set on SILENCE — two silences
 * leave the set open and tell her where "done" lives (founder, 2026-09-09: the automatic set is
 * cancelled everywhere, the voice included).
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { exerciseById, exerciseDisplayName } from '@/data/exercises';
import { snapToStock } from '@/domain/startingLoad';
import { voiceAskAfterS } from '@/domain/setDwell';
import { parseVoiceAnswer, toKg, VOICE_HINTS, type VoiceAnswer } from '@/domain/voiceGrammar';
import { voiceScript, type VoiceLocale } from '@/domain/voiceScript';
import { weightStepFor } from '@/domain/weightStep';
import { applyLoop1 } from '@/engine/v5/liveSession';
import { emptyBarKg } from '@/engine/loadMath';
import type { SessionView } from '@/state/stores/sessionStore';
import type { WindowEnd } from '@/platform/voice/voiceCapture';

// ── The seams the conductor is built over (all injectable) ───────────────────────────────────

export interface Mouth {
  say(text: string, locale: string): Promise<void>;
  interrupt(): void;
}
export interface Ear {
  open(opts: {
    locale: string;
    ms: number;
    hints?: readonly string[];
    onSentence: (text: string, confidence: number | null) => boolean;
    onEnd: (why: WindowEnd) => void;
  }): { close(): void };
}
export interface Session {
  duck(): Promise<void>;
  unduck(): Promise<void>;
  playChime(): Promise<void>;
}
export interface ConductorDeps {
  mouth: Mouth;
  ear: Ear;
  audio: Session;
  now: () => number;
  setTimeout: (f: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
  /** The latest view — read AFTER a verb, since the store re-renders asynchronously. */
  getView: () => SessionView | null;
  locale: () => VoiceLocale;
  /** No session in her history at all: the first-workout opening line (spec §1). */
  firstSessionEver: () => boolean;
  track?: (event: string, props?: Record<string, unknown>) => void;
}

/** The spec's windows, in milliseconds. */
export const WINDOWS = {
  loading: 90_000,
  loadingPrompt: 45_000,
  done: 6_000,
  reps: 4_000,
  echoTail: 3_000,
  confirm: 4_000,
  reask: 25_000,
  longDone: 60_000,
  paused: 60_000,
} as const;

/** A number the recognizer was not sure of is said back with a question (spec §3.5). */
export const CONFIDENCE_FLOOR = 0.6;

type Mode = 'off' | 'idle' | 'loading' | 'set' | 'asking' | 'rest' | 'paused' | 'ended';

interface AskState {
  /** Which question is open — decides what a bare number means. */
  question: 'done' | 'reps' | 'reps_second' | 'confirm' | 'echo' | 'echo_reps' | 'long_done' | 'paused';
  /** How many silences so far on this set's ask. */
  silences: number;
  /** How many times she said "לא" / "עוד רגע" on this set's ask — counted apart from silences. */
  noes?: number;
  /** Half an answer, waiting for its other half. */
  pendingWeight?: number | null;
  pendingFirstReps?: number;
  /** What the echo said, for a "לא" in its tail. */
  echoed?: { weight: number | null; reps: number };
  /** A low-confidence hearing waiting for "נכון?". */
  unconfirmed?: { weight: number | null; reps: number };
}

const stepKeyOf = (v: SessionView): string | null =>
  v.currentExerciseId && v.setLabel ? `${v.currentExerciseId}/${v.setLabel.n}/${v.globalProgress?.index ?? 0}` : null;

export class VoiceConductor {
  private mode: Mode = 'off';
  private on = false;
  private lastKey: string | null = null;
  private lastPhase: SessionView['displayPhase'] | null = null;
  private lastActive = false;
  private lastActiveView: SessionView | null = null;
  private lastAwaiting = false;
  private window: { close(): void } | null = null;
  private timers = new Set<unknown>();
  private ask: AskState | null = null;
  /** The load the athlete confirmed for each lift, to tell a changed load from a repeated one. */
  private confirmedLoad = new Map<string, number | null>();
  private corrections = new Map<string, number>();
  private calibrating: string | null = null;
  private skippedInto: string | null = null;
  private restEndsAtMs: number | null = null;
  private speaking = 0;
  private lastSpokeEndMs = 0;
  /** The session (by its start instant) whose opening line was said — so `enable()` mid-session knows. */
  private announcedStart: number | null = null;
  /** Re-entering the phase she is in (earbuds back, resume): nothing already said is said again (§3.9). */
  private reentry = false;

  constructor(private readonly d: ConductorDeps) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────────────────────────

  /** Earbuds in and the switch on: the voice takes the session from where it stands. */
  enable(): void {
    if (this.on) return;
    this.on = true;
    const v = this.d.getView();
    if (v?.active) {
      this.mode = 'idle';
      // The stage mounts AFTER the session starts, so the first `observe` with the voice on is
      // mid-session: a session never announced gets its opening (§3.1), one that was gets "חזרתי".
      if (this.announcedStart === (v.startedAtMs ?? -1)) {
        void this.speak([voiceScript.back()]);
        this.reentry = true;
        this.lastActive = true;
      } else {
        this.lastActive = false; // so `observe` runs `onSessionStart`
      }
      this.lastPhase = null; // re-enter the current phase as if it had just begun
      this.lastKey = null;
      this.observe(v);
    }
  }

  /** Earbuds out (or the switch off): silent at once; the screens carry on. */
  disable(): void {
    if (!this.on) return;
    this.on = false;
    this.closeWindow('closed');
    this.clearTimers();
    this.d.mouth.interrupt();
    this.ask = null;
    this.mode = 'off';
    const v = this.d.getView();
    // Unconditionally: the view masks the flag during a pause, and a Ready button with the voice
    // off is a button nothing answers.
    v?.setAwaitingReady(false);
    void this.d.audio.unduck();
  }

  isOn(): boolean {
    return this.on;
  }

  /** Every change of the session's view lands here. Idempotent per (phase, set). */
  observe(v: SessionView): void {
    if (!this.on) {
      this.lastActive = v.active;
      return;
    }
    // Session start / end. The end line is built from the LAST ACTIVE view — the ended one has
    // no lifts and no start time left in it.
    if (v.active && !this.lastActive) this.onSessionStart(v);
    if (!v.active && this.lastActive) this.onSessionEnd(this.lastActiveView ?? v);
    this.lastActive = v.active;
    if (!v.active) return;
    this.lastActiveView = v;

    // Pause / resume.
    if (v.paused && this.mode !== 'paused') return this.onPaused(v);
    if (!v.paused && this.mode === 'paused') this.onResumed();

    const key = stepKeyOf(v);
    const phase = v.displayPhase;
    const phaseChanged = phase !== this.lastPhase;
    const setChanged = key !== this.lastKey;
    // Ready came from another channel (the lock screen, the wrist): the store cleared the flag.
    if (this.lastAwaiting && !v.awaitingReady && this.mode === 'loading' && phase === 'SET_PRESENTED' && !setChanged) {
      this.onReady(v, 'tap');
    }
    this.lastAwaiting = v.awaitingReady;
    if (!phaseChanged && !setChanged) return;
    this.lastPhase = phase;
    this.lastKey = key;

    if (phase === 'SET_PRESENTED') this.onSetPresented(v, setChanged);
    else if (phase === 'REST_INTER' || phase === 'REST_TRANSITION') this.onRest(v);
  }

  // ── Session ───────────────────────────────────────────────────────────────────────────────────

  private onSessionStart(v: SessionView): void {
    this.mode = 'idle';
    this.announcedStart = v.startedAtMs ?? -1;
    this.reentry = false;
    this.confirmedLoad.clear();
    this.corrections.clear();
    this.calibrating = null;
    const l = this.d.locale();
    const lines: string[] = [];
    if (this.d.firstSessionEver()) lines.push(voiceScript.openFirstSession());
    const first = v.sessionExerciseIds[0] ?? v.currentExerciseId;
    if (first) lines.push(voiceScript.openSession(v.workoutName ?? '', v.sessionExerciseIds.length, this.estimateMinutes(v), first, l));
    void this.speak(lines);
  }

  private onSessionEnd(v: SessionView): void {
    this.closeWindow('closed');
    this.clearTimers();
    this.ask = null;
    const l = this.d.locale();
    const minutes = v.startedAtMs ? Math.max(1, Math.round((this.d.now() - v.startedAtMs) / 60_000)) : this.estimateMinutes(v);
    this.mode = 'ended';
    void this.speak([voiceScript.sessionDone(v.sessionExerciseIds.length, minutes, l)]);
  }

  private estimateMinutes(v: SessionView): number {
    // Sets × (a set's ~45 s + its rest) — "בערך", and rounded to five, the way a coach rounds.
    const sets = v.livePlan.length || 1;
    const rest = v.restSeconds || 90;
    return Math.max(5, Math.round((sets * (45 + rest)) / 60 / 5) * 5);
  }

  // ── The set ───────────────────────────────────────────────────────────────────────────────────

  private onSetPresented(v: SessionView, setChanged: boolean): void {
    // The rest just ended: the chime sounds before whatever is said next (spec §3.6) — the next
    // set's line, or the loading dialogue of a lift or a changed load.
    const fromRest = this.mode === 'rest';
    this.closeWindow('closed');
    this.clearTimers();
    this.ask = null;
    const ex = v.currentExerciseId;
    const l = this.d.locale();
    // A new set on stage: no Ready of the old one stays on the card (a tap on the stage or the
    // card, a swap, a skip all land here).
    if (this.mode !== 'loading') v.setAwaitingReady(false);
    this.reentry = false;
    // A hold, a distance, an open item: announced, never asked about (spec §3.9). Checked BEFORE
    // the rep target, which such a step does not carry.
    if (ex && v.currentItem && v.currentItem.kind !== 'reps') {
      const secs = (v.currentItem as { seconds?: number }).seconds ?? 0;
      this.mode = 'set';
      if (fromRest) void this.d.audio.playChime();
      void this.speak([voiceScript.holdItem(exerciseDisplayName(ex), secs, l)]);
      return;
    }
    if (!ex || !v.currentTarget) return;
    const kg = v.currentTarget.recommendedWeight;
    const lo = v.currentTarget.repBandLo ?? v.currentTarget.recommendedReps;
    const hi = v.currentTarget.repBandHi ?? lo + 4;
    const n = v.setLabel?.n ?? 1;
    const m = v.setLabel?.m ?? 1;

    const firstSetOfLift = n === 1 || !this.confirmedLoad.has(ex);
    const confirmed = this.confirmedLoad.get(ex);
    const loadChanged = !firstSetOfLift && confirmed !== undefined && kg !== confirmed;

    if (firstSetOfLift || loadChanged || this.skippedInto === ex) {
      // The loading dialogue (spec §3.2).
      const firstTime = v.lastTime == null;
      let line: string;
      if (this.skippedInto === ex) line = voiceScript.skippedLift(ex, kg, lo, hi, l);
      else if (loadChanged && confirmed != null && kg != null) line = voiceScript.loadChanged(ex, confirmed, kg, n, m, !!v.setLabel?.warmup, l);
      else if (v.setLabel?.warmup) line = voiceScript.setStart(ex, kg, lo, hi, n, m, true, l);
      else if (firstTime) line = voiceScript.loadFirstTime(ex, kg, lo, hi, l);
      else line = voiceScript.loadCalibrated(ex, kg, lo, hi, l);
      this.skippedInto = null;
      if (fromRest) void this.d.audio.playChime();
      this.openLoading(v, [line]);
      return;
    }

    // Sets 2+ at the same load: the rest's end was the start (spec §3.6 / §3.3).
    this.mode = 'set';
    if (setChanged) {
      const line = v.straightInto && v.nextExerciseId
        ? voiceScript.supersetStart(n, m, ex, v.nextExerciseId, l)
        : voiceScript.setStart(ex, kg, lo, hi, n, m, !!v.setLabel?.warmup, l);
      if (fromRest) void this.d.audio.playChime();
      void this.speak([line]);
    }
    this.scheduleAsk(v, this.d.now());
  }

  private openLoading(v: SessionView, lines: string[]): void {
    this.mode = 'loading';
    // The set has not started (spec §3.2: "הסט לא מתחיל עד שיש אות"): the card offers Ready, and
    // "מוכן" from any channel moves the set's stamp to the signal (`markSetStarted`).
    v.setAwaitingReady(true);
    this.lastAwaiting = true;
    void this.speak(lines, true).then(() => {
      if (this.mode !== 'loading') return;
      this.openWindow(WINDOWS.loading, (a, text, conf) => this.onLoadingAnswer(v, a, text, conf), (why) => {
        if (this.mode !== 'loading') return;
        if (why === 'timeout') {
          void this.speak([voiceScript.readyFallback()]);
          // The Ready button on the lock screen and the wrist carry the start from here.
        }
      });
      this.after(WINDOWS.loadingPrompt, () => {
        if (this.mode === 'loading') void this.speak([voiceScript.readyPrompt()], true);
      });
    });
  }

  private onLoadingAnswer(v0: SessionView, a: VoiceAnswer | null, _text: string, _conf: number | null): boolean {
    const v = this.d.getView() ?? v0;
    const l = this.d.locale();
    const ex = v.currentExerciseId;
    if (!a || !ex || !v.currentTarget) return true; // noise while loading: ignored, window stays open
    switch (a.kind) {
      case 'ready':
      case 'yes':
        this.onReady(v, 'voice');
        return false;
      case 'figures': {
        const kg = toKg(a.numbers[0], a.lb);
        if (!(kg >= 0)) return true;
        const snapped = snapToStock(kg, exerciseById(ex)!);
        v.setLiftLoad(snapped);
        void this.speak([voiceScript.loadEcho(ex, snapped, l)], true);
        return true;
      }
      case 'easier':
      case 'harder': {
        const step = weightStepFor(l.units, exerciseById(ex)?.equipment);
        const cur = v.currentTarget.recommendedWeight;
        if (cur == null) return true;
        const next = Math.max(emptyBarKg(exerciseById(ex)?.equipment ?? 'barbell'), cur + (a.kind === 'harder' ? step : -step));
        v.setLiftLoad(next);
        void this.speak([voiceScript.loadEcho(ex, next, l)], true);
        return true;
      }
      case 'dont_know': {
        // The calibration set (spec §3.2): light, no range, her reps decide the next load.
        const cur = v.currentTarget.recommendedWeight;
        if (cur == null) return true;
        const light = Math.max(emptyBarKg(exerciseById(ex)?.equipment ?? 'barbell'), snapToStock(cur * 0.75, exerciseById(ex)!));
        v.setLiftLoad(light);
        this.calibrating = ex;
        void this.speak([voiceScript.calibrationStart(ex, light, l)], true);
        return true;
      }
      case 'skip':
        this.skippedInto = v.nextExerciseId;
        v.markEquipmentOccupied();
        return false;
      case 'pause':
        v.pause();
        return false;
      case 'finish':
        void this.speak([voiceScript.finishOnPhone()], true);
        return true;
      default:
        return true;
    }
  }

  /** "מוכן" — from the voice, the lock screen or the wrist: the set starts now. */
  private onReady(v: SessionView, via: 'voice' | 'tap'): void {
    if (this.mode !== 'loading') return;
    const ex = v.currentExerciseId;
    if (ex) this.confirmedLoad.set(ex, v.currentTarget?.recommendedWeight ?? null);
    this.closeWindow('closed');
    this.clearTimers();
    this.mode = 'set';
    if (via === 'voice') {
      v.markSetStarted();
      v.setAwaitingReady(false);
      this.lastAwaiting = false;
      void this.speak([voiceScript.go()]);
    }
    this.d.track?.('voice_ready', { via });
    this.scheduleAsk(v, this.d.now());
  }

  private scheduleAsk(v: SessionView, startMs: number): void {
    const ex = v.currentExerciseId;
    if (!ex || !v.currentTarget) return;
    if (v.straightInto) return; // a superset asks once, after its second half (spec §3.9)
    const lo = v.currentTarget.repBandLo ?? v.currentTarget.recommendedReps;
    const dueMs = startMs + voiceAskAfterS(ex, lo) * 1000;
    this.after(Math.max(0, dueMs - this.d.now()), () => this.askDone());
  }

  // ── The ask ───────────────────────────────────────────────────────────────────────────────────

  private askDone(): void {
    const v = this.d.getView();
    if (!v || !this.on || v.displayPhase !== 'SET_PRESENTED' || v.paused) return;
    this.mode = 'asking';
    this.ask = { question: 'done', silences: this.ask?.silences ?? 0, noes: this.ask?.noes ?? 0 };
    const ex = v.currentExerciseId!;
    const superset = !!v.straightInto && !!v.nextExerciseId; // never: the first half is never asked
    const prev = this.previousHalf(v);
    let line: string;
    if (prev) line = voiceScript.askDoneSuperset(prev.exerciseId, ex);
    else if (v.setLabel?.warmup) line = voiceScript.askDoneWarmup();
    else if (this.isLastSetOfSession(v)) line = voiceScript.askDoneLast();
    else line = voiceScript.askDone();
    void superset;
    void this.speak([line], true).then(() => {
      if (this.mode !== 'asking') return;
      this.openWindow(WINDOWS.done, (a, text, conf) => this.onDoneAnswer(a, text, conf), (why) => this.onDoneWindowEnd(why));
    });
  }

  /** The first half of a superset the machine has already presumed as written — its reps are asked with the second's. */
  private previousHalf(v: SessionView): { exerciseId: string; setIndex: number; weight: number | null } | null {
    const idx = v.globalProgress?.index ?? 0;
    const prev = v.livePlan[idx - 1];
    if (!prev || !(prev as { straightInto?: unknown }).straightInto) return null;
    const logged = v.loggedSets.find((s) => s.exerciseId === prev.exerciseId && s.setIndex === prev.exerciseSetIndex);
    if (!logged) return null;
    return { exerciseId: prev.exerciseId, setIndex: prev.exerciseSetIndex, weight: logged.actualWeight };
  }

  private isLastSetOfSession(v: SessionView): boolean {
    const idx = v.globalProgress?.index ?? 0;
    return idx >= v.livePlan.length - 1;
  }

  private onDoneAnswer(a: VoiceAnswer | null, _text: string, conf: number | null): boolean {
    const v = this.d.getView();
    if (!v || !this.ask) return false;
    const l = this.d.locale();
    const q = this.ask.question;
    if (!a) {
      void this.speak([voiceScript.didntGet()], true);
      this.ask.question = 'reps';
      this.reopen(WINDOWS.reps);
      return true;
    }
    switch (a.kind) {
      case 'figures': {
        const nums = a.numbers;
        if (q === 'confirm' && this.ask.unconfirmed) {
          // A number in the confirm window replaces what was heard.
          this.ask.unconfirmed = undefined;
        }
        if ((q === 'echo' || q === 'echo_reps') && this.ask.echoed) {
          // A correction in the echo's tail — or the number after its "לא" → "כמה חזרות?": the row
          // is AMENDED (spec §3.5); a second write during the rest would be silently refused.
          const w = nums.length >= 2 ? toKg(nums[0], a.lb) : this.ask.echoed.weight;
          const reps = nums.length >= 2 ? nums[1] : nums[0];
          if (Number.isInteger(reps) && reps > 0) this.amendLast(v, w, reps);
          return false;
        }
        if (q === 'reps_second' && this.ask.pendingFirstReps != null) {
          const prev = this.previousHalf(v);
          if (prev) v.amendSet(prev.exerciseId, prev.setIndex, { weight: prev.weight, reps: this.ask.pendingFirstReps });
          const reps = nums[0];
          if (!Number.isInteger(reps) || reps <= 0) return true;
          void this.complete(v, this.ask.pendingWeight ?? v.currentTarget?.recommendedWeight ?? null, reps, conf);
          return false;
        }
        const prev = q === 'done' ? this.previousHalf(v) : null;
        if (prev) {
          // Two numbers: first half's reps, then the second's. One: the first's, and ask the second's.
          if (nums.length >= 2) {
            v.amendSet(prev.exerciseId, prev.setIndex, { weight: prev.weight, reps: nums[0] });
            void this.complete(v, v.currentTarget?.recommendedWeight ?? null, nums[1], conf);
            return false;
          }
          this.ask.pendingFirstReps = nums[0];
          this.ask.question = 'reps_second';
          void this.speak([voiceScript.askRepsSecond(v.currentExerciseId!)], true);
          this.reopen(WINDOWS.reps);
          return true;
        }
        if (nums.length >= 2) {
          // Load, then reps — always in that order (spec §3.4).
          void this.complete(v, toKg(nums[0], a.lb), nums[1], conf);
          return false;
        }
        const n = nums[0];
        if (a.saysKg && !a.saysReps) {
          // A load alone: the reps are still to come.
          this.ask.pendingWeight = toKg(n, a.lb);
          this.ask.question = 'reps';
          void this.speak([voiceScript.askReps()], true);
          this.reopen(WINDOWS.reps);
          return true;
        }
        if (!Number.isInteger(n) || n <= 0 || n > 100) {
          void this.speak([voiceScript.didntGet()], true);
          this.reopen(WINDOWS.reps);
          return true;
        }
        void this.complete(v, this.ask.pendingWeight !== undefined ? this.ask.pendingWeight : (v.currentTarget?.recommendedWeight ?? null), n, conf);
        return false;
      }
      case 'yes':
        if (q === 'confirm' && this.ask.unconfirmed) {
          const u = this.ask.unconfirmed;
          void this.complete(v, u.weight, u.reps, 1);
          return false;
        }
        if (v.setLabel?.warmup) {
          void this.complete(v, v.currentTarget?.recommendedWeight ?? null, v.currentTarget?.recommendedReps ?? 0, 1);
          return false;
        }
        this.ask.question = 'reps';
        void this.speak([voiceScript.askReps()], true);
        this.reopen(WINDOWS.reps);
        return true;
      case 'done':
        if (v.setLabel?.warmup) {
          void this.complete(v, v.currentTarget?.recommendedWeight ?? null, v.currentTarget?.recommendedReps ?? 0, 1);
          return false;
        }
        this.ask.question = 'reps';
        void this.speak([voiceScript.askReps()], true);
        this.reopen(WINDOWS.reps);
        return true;
      case 'as_written':
        void this.complete(v, v.currentTarget?.recommendedWeight ?? null, v.currentTarget?.repBandLo ?? v.currentTarget?.recommendedReps ?? 0, 1);
        return false;
      case 'no':
        if (q === 'confirm' && this.ask.unconfirmed) {
          this.ask.unconfirmed = undefined;
          this.ask.question = 'reps';
          void this.speak([voiceScript.askReps()], true);
          this.reopen(WINDOWS.reps);
          return true;
        }
        if ((q === 'echo' || q === 'echo_reps') && this.ask.echoed) {
          this.ask.question = 'echo_reps';
          void this.speak([voiceScript.askReps()], true);
          this.reopen(WINDOWS.reps);
          return true;
        }
        // Still lifting: "בסדר", ask again in 25 s; after the second "לא", "תגיד סיימתי כשתסיים".
        // Counted apart from silences: a "לא" is her word.
        this.ask.noes = (this.ask.noes ?? 0) + 1;
        void this.speak([voiceScript.okWait()]);
        this.closeWindow('closed');
        if (this.ask.noes >= 2) this.openLongDone();
        else this.after(WINDOWS.reask, () => this.askDone());
        return false;
      case 'skip':
        void this.speak([voiceScript.skippedSet()]);
        v.markEquipmentOccupied();
        return false;
      case 'pause':
        v.pause();
        return false;
      case 'finish':
        void this.speak([voiceScript.finishOnPhone()], true);
        return true;
      default:
        return true;
    }
  }

  private onDoneWindowEnd(why: WindowEnd): void {
    if (this.mode !== 'asking' || !this.ask) return;
    if (why !== 'timeout' && why !== 'silence') return;
    const v = this.d.getView();
    if (!v) return;
    if (this.ask.question === 'confirm' && this.ask.unconfirmed) {
      // Silence after "נכון?" is yes (spec §3.5).
      const u = this.ask.unconfirmed;
      void this.complete(v, u.weight, u.reps, 1);
      return;
    }
    if (this.ask.question === 'echo' || this.ask.question === 'echo_reps') {
      // The echo's tail closed with no correction: the row stands. On to the rest.
      this.ask = null;
      void this.d.audio.unduck();
      return;
    }
    if (this.ask.question === 'long_done') {
      // Sixty seconds with no word: the set waits for her (the lock screen and the wrist have Done).
      this.ask = null;
      this.mode = 'set';
      void this.d.audio.unduck();
      return;
    }
    this.ask.silences += 1;
    if (this.ask.silences === 1) {
      void this.speak([voiceScript.askAgainSoon()]);
      this.after(WINDOWS.reask, () => this.askDone());
      return;
    }
    /*
     * ⛔ THE SECOND SILENCE WRITES NOTHING (founder, 2026-09-09). Until today it was the clock's own
     * presumption — the set as prescribed, marked, "רשמתי… כרישום אוטומטי" — under spec §0.5 / law 4.
     * The automatic set is cancelled everywhere, the voice included: the set stays open, she is told
     * so and where "done" lives, and the long window waits for a number.
     */
    void this.speak([voiceScript.notHeard()], true).then(() => {
      if (this.mode === 'asking' && this.ask?.silences === 2) this.openLongDone(true);
    });
  }

  private openLongDone(afterNotHeard = false): void {
    if (!this.ask) this.ask = { question: 'long_done', silences: 2 };
    this.ask.question = 'long_done';
    this.mode = 'asking';
    if (afterNotHeard) {
      // "לא שמעתי תשובה…" already said where done lives; open the window without a second line.
      this.openWindow(WINDOWS.longDone, (a, text, conf) => this.onDoneAnswer(a, text, conf), (why) => this.onDoneWindowEnd(why));
      return;
    }
    void this.speak([voiceScript.sayDoneWhenDone()], true).then(() => {
      if (this.mode !== 'asking') return;
      this.openWindow(WINDOWS.longDone, (a, text, conf) => this.onDoneAnswer(a, text, conf), (why) => this.onDoneWindowEnd(why));
    });
  }

  // ── The write, the echo, the verdict, the rest ────────────────────────────────────────────────

  private async complete(v: SessionView, weight: number | null, reps: number, conf: number | null): Promise<void> {
    const l = this.d.locale();
    if (conf != null && conf < CONFIDENCE_FLOOR && this.ask?.question !== 'confirm') {
      // Not sure what was heard: say it back with a question before writing anything.
      this.ask = { question: 'confirm', silences: this.ask?.silences ?? 0, unconfirmed: { weight, reps } };
      await this.speak([voiceScript.confirmHeard(weight, reps, l)], true);
      this.reopen(WINDOWS.confirm);
      return;
    }
    this.closeWindow('closed');
    const ex = v.currentExerciseId!;
    const before = v.livePlan[v.globalProgress?.index ?? 0];
    const wasCalibration = this.calibrating === ex;
    const lastOfLift = !!(before as { lastSetOfExercise?: boolean }).lastSetOfExercise;
    const firstTime = v.lastTime == null;
    await v.completeSet({ weight, reps });
    this.d.track?.('voice_set_logged', { exerciseId: ex, reps, weight, calibration: wasCalibration });
    const after = this.d.getView() ?? v;
    const lines: string[] = [voiceScript.echo(weight, reps, l)];

    // The verdict — Loop 1, under the voice only (founder 2026-09-08; the stage stays a logger).
    let moved: number | null = null;
    if (weight != null && before?.target && !v.setLabel?.warmup) {
      if (wasCalibration) {
        this.calibrating = null;
        const lo = before.target.repBandLo ?? before.target.recommendedReps;
        const e1rm = weight * (1 + reps / 30);
        const next = snapToStock(e1rm / (1 + lo / 30), exerciseById(ex)!);
        if (!lastOfLift && next !== weight) moved = next;
        else if (lastOfLift) lines.push(voiceScript.nextTimeLearned(next, l));
      } else if (!lastOfLift) {
        const prevReps = this.previousWorkingReps(after, ex, before.exerciseSetIndex);
        const rail = after.lastTime?.loadKg != null ? after.lastTime.loadKg + weightStepFor(l.units, exerciseById(ex)?.equipment) : null;
        const r = applyLoop1(
          after.livePlan as never[],
          before.globalIndex,
          weight,
          reps,
          this.corrections.get(ex) ?? 0,
          undefined,
          rail,
          prevReps,
          firstTime,
        );
        if (r.corrected && r.nextLoad != null && r.nextLoad !== weight) {
          moved = r.nextLoad;
          this.corrections.set(ex, (this.corrections.get(ex) ?? 0) + 1);
        }
      } else {
        const opened = this.confirmedLoad.get(ex);
        if (opened != null && opened !== weight) lines.push(firstTime ? voiceScript.nextTimeLearned(weight, l) : voiceScript.nextTimeStart(weight, l));
      }
    }
    if (moved != null) {
      lines.push(moved > weight! ? voiceScript.verdictUp(ex, weight!, moved, l) : voiceScript.verdictDown(ex, weight!, moved, l));
    } else if (weight != null && !lastOfLift && !v.setLabel?.warmup) {
      lines.push(voiceScript.verdictHold());
    }

    // The rest line (spec §3.6 / §3.7) and the moved load land in `onRest`, on the FRESH view the
    // store publishes after this write — the view in hand here still shows the set on stage. The
    // one voice (`chain`) keeps the order: echo, verdict, then the rest.
    this.narrated = this.lastKey;
    this.pendingMove = moved != null ? { exerciseId: ex, kg: moved } : null;
    // The echo's tail: three seconds for "לא, עשר" (spec §3.5).
    this.ask = { question: 'echo', silences: 0, echoed: { weight, reps } };
    await this.speak(lines, true);
    if (this.ask?.question === 'echo' && this.d.getView()?.active) {
      this.openWindow(WINDOWS.echoTail, (a, text, conf2) => this.onDoneAnswer(a, text, conf2), (why) => this.onDoneWindowEnd(why));
    } else {
      void this.d.audio.unduck();
    }
  }

  /** The set the voice itself narrated (echo said), so `onRest` does not say it a second time. */
  private narrated: string | null = null;
  /** A Loop 1 move decided at the echo, applied on the fresh view when the rest begins. */
  private pendingMove: { exerciseId: string; kg: number } | null = null;

  private previousWorkingReps(v: SessionView, ex: string, setIndex: number): number | null {
    const prev = v.loggedSets
      .filter((s) => s.exerciseId === ex && s.setIndex < setIndex && !s.isWarmup && !s.isApproach)
      .sort((a, b) => b.setIndex - a.setIndex)[0];
    return prev ? prev.actualReps : null;
  }

  private amendLast(v: SessionView, weight: number | null, reps: number): void {
    const l = this.d.locale();
    const row = v.loggedSets[v.loggedSets.length - 1];
    if (!row) return;
    v.amendSet(row.exerciseId, row.setIndex, { weight, reps });
    this.ask = { question: 'echo', silences: 0, echoed: { weight, reps } };
    void this.speak([voiceScript.echo(weight, reps, l)], true).then(() => {
      if (this.ask?.question === 'echo') {
        this.openWindow(WINDOWS.echoTail, (a, text, conf) => this.onDoneAnswer(a, text, conf), (why) => this.onDoneWindowEnd(why));
      }
    });
  }

  // ── The rest ──────────────────────────────────────────────────────────────────────────────────

  private onRest(v: SessionView): void {
    if (this.mode === 'rest') return;
    // The set was logged from another channel while the loading dialogue was open: Ready goes.
    if (v.awaitingReady || this.mode === 'loading') v.setAwaitingReady(false);
    // The echo's tail may still be open (the voice wrote the set a moment ago): it stays open.
    if (this.ask?.question !== 'echo' && this.ask?.question !== 'echo_reps') {
      this.closeWindow('closed');
      this.ask = null;
    }
    this.clearTimers();
    this.mode = 'rest';
    const l = this.d.locale();
    const row = v.loggedSets[v.loggedSets.length - 1];
    const lines: string[] = [];
    // Re-entering a rest already under way (earbuds back, resume): what was said is not said
    // again, and a "ten seconds" from a rest whose remainder is unknown is not guessed (§3.9).
    if (this.reentry) {
      this.reentry = false;
      this.narrated = null;
      this.pendingMove = null;
      return;
    }
    // Reached without the voice having said the set (a tap on the stage, the lock screen or the
    // wrist): say it back first, so the flow never goes quiet.
    const completedKey = this.lastKey;
    if (row && v.currentExerciseId && this.narrated !== completedKey) {
      lines.push(voiceScript.echo(row.actualWeight, row.actualReps, l));
    }
    this.narrated = null;
    if (v.displayPhase === 'REST_TRANSITION' && v.nextExerciseId && v.currentExerciseId) {
      lines.push(voiceScript.liftDone(v.currentExerciseId, v.nextExerciseId, v.restSeconds, l));
    } else {
      lines.push(voiceScript.rest(v.restSeconds, l));
    }
    void this.speak(lines, this.ask?.question === 'echo');
    // The verdict's move lands now, on the fresh plan: the completed row is written, so the change
    // begins with the next set — and the loading dialogue at the rest's end names it (spec §3.2).
    if (this.pendingMove && this.pendingMove.exerciseId === v.currentExerciseId) v.setLiftLoad(this.pendingMove.kg);
    this.pendingMove = null;
    this.scheduleTenSeconds(v);
  }

  private scheduleTenSeconds(v: SessionView): void {
    const total = v.restSeconds + (v.restExtraSeconds ?? 0);
    if (total < 20) return; // a short rest has no "ten seconds" (spec §3.6)
    this.restEndsAtMs = this.d.now() + total * 1000;
    this.after(Math.max(0, total * 1000 - 10_000), () => {
      const now = this.d.getView();
      if (now && (now.displayPhase === 'REST_INTER' || now.displayPhase === 'REST_TRANSITION')) void this.speak([voiceScript.tenSeconds()]);
    });
  }

  /** "+15" moved the rest's end (the lock screen, the wrist): the ten-seconds line moves with it. */
  onRestExtended(v: SessionView): void {
    if (this.mode !== 'rest') return;
    this.clearTimers();
    this.scheduleTenSeconds(v);
  }

  // ── Pause ─────────────────────────────────────────────────────────────────────────────────────

  private onPaused(v: SessionView): void {
    this.closeWindow('closed');
    this.clearTimers();
    this.ask = { question: 'paused', silences: 0 };
    this.mode = 'paused';
    void this.speak([voiceScript.paused()], true).then(() => this.listenForResume());
    void v;
  }

  private listenForResume(): void {
    if (this.mode !== 'paused') return;
    this.openWindow(WINDOWS.paused, (a) => {
      if (a?.kind === 'resume' || a?.kind === 'ready') {
        this.d.getView()?.resume();
        return false;
      }
      return true;
    }, (why) => {
      if (this.mode === 'paused' && (why === 'timeout' || why === 'silence')) this.listenForResume();
    });
  }

  private onResumed(): void {
    this.closeWindow('closed');
    this.ask = null;
    this.mode = 'idle';
    this.lastPhase = null; // re-enter the phase she is in
    this.reentry = true;
    void this.speak([voiceScript.resumed()]);
  }

  // ── Plumbing ──────────────────────────────────────────────────────────────────────────────────

  /** One voice: every `speak` waits for the one before it, so lines land in the order they were decided. */
  private chain: Promise<void> = Promise.resolve();

  private speak(lines: string[], keepDucked = false): Promise<void> {
    if (!this.on || lines.length === 0) return this.chain;
    const run = async () => {
      if (!this.on) return;
      this.speaking += 1;
      // While a window is open the recognizer owns the session (record + play, her music already
      // ducked); switching the category under it would end the recording mid-answer.
      if (!this.window) await this.d.audio.duck();
      const locale = this.d.locale().locale;
      for (const line of lines) {
        if (!this.on) break; // earbuds out mid-sentence: the rest is not played out of the speaker
        await this.d.mouth.say(line, locale);
      }
      this.speaking -= 1;
      this.lastSpokeEndMs = this.d.now();
      if (!keepDucked && this.speaking === 0 && !this.window) await this.d.audio.unduck();
    };
    this.chain = this.chain.then(run, run);
    return this.chain;
  }

  private openWindow(
    ms: number,
    onAnswer: (a: VoiceAnswer | null, text: string, confidence: number | null) => boolean,
    onEnd: (why: WindowEnd) => void,
  ): void {
    this.closeWindow('closed');
    let closed = false;
    this.window = this.d.ear.open({
      locale: this.d.locale().locale,
      ms,
      hints: VOICE_HINTS,
      onSentence: (text, confidence) => {
        const a = parseVoiceAnswer(text);
        // The earbuds' microphone hears the app's own line. Anything unrecognisable that lands
        // while a line is being said, or in the second after it, is that bleed — not her.
        if (this.speaking > 0) return true; // a line is playing: the microphone hears the app, not her
        if (a == null && this.d.now() - this.lastSpokeEndMs < 1_000) return true;
        this.d.track?.('voice_heard', { kind: a?.kind ?? 'none', confidence });
        return onAnswer(a, text, confidence);
      },
      onEnd: (why) => {
        if (closed) return;
        closed = true;
        this.window = null;
        if (why !== 'closed') void this.d.audio.unduck().then(() => onEnd(why));
        else onEnd(why);
      },
    });
  }

  private reopen(ms: number): void {
    // The same question, another window — the handlers are the ask's own.
    this.openWindow(ms, (a, text, conf) => this.onDoneAnswer(a, text, conf), (why) => this.onDoneWindowEnd(why));
  }

  private closeWindow(_why: WindowEnd): void {
    const w = this.window;
    this.window = null;
    if (w) w.close();
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
