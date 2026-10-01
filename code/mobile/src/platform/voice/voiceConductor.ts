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
 *   the echo, the verdict (Loop 1 — voice only)                → three seconds for "לא, עשר"
 *   the rest line, ten seconds out, the chime, the next line   → which is the next start
 *
 * ── A SUPERSET IS ONE ROUND (spec §3.9, built 2026-09-27) ───────────────────────────────────────
 * Steps linked with no rest between them (`restAfterS` at or under the machine's skip line) are ONE
 * round: one loading dialogue naming every lift and its load, one question after all of them ("כמה
 * חזרות בלחיצה, וכמה במשיכה?"), the answers written half by half in order, one echo. Until today
 * the first half was never asked, and with the phone in her pocket the workout simply stopped.
 *
 * ── WHAT THIS FILE NEVER DOES ───────────────────────────────────────────────────────────────────
 * It never writes a set without saying it back first; it never says "נרשם" over a row it did not
 * write; it never guesses a sentence it did not recognise; it never speaks without earbuds; and it
 * never writes a set on SILENCE — not after the done question, and not after "נכון?" (founder,
 * 2026-09-09: the automatic set is cancelled everywhere; the last silent path closed 2026-09-27).
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { exerciseById, exerciseDisplayName, loadStyleOf } from '@/data/exercises';
import { snapToStock } from '@/domain/startingLoad';
import { voiceAskAfterS } from '@/domain/setDwell';
import { isRecordSet } from '@/domain/setRecord';
import { MAX_VOICE_REPS, parseVoiceAnswer, toKg, VOICE_HINTS, type VoiceAnswer } from '@/domain/voiceGrammar';
import { voiceScript, type VoiceLocale } from '@/domain/voiceScript';
import { weightStepFor } from '@/domain/weightStep';
import { kgFromDisplay } from '@/domain/schedule';
import { applyLoop1 } from '@/engine/v5/liveSession';
import { emptyBarKg } from '@/engine/loadMath';
import { REST_SKIP_THRESHOLD_S } from '@/state/machines/sessionState';
import type { SessionView, Step } from '@/state/stores/sessionStore';
import type { WindowEnd } from '@/platform/voice/voiceCapture';
import type { HearExpect } from '@/platform/voice/voiceCloud';

// ── The seams the conductor is built over (all injectable) ───────────────────────────────────

export interface Mouth {
  say(text: string, locale: string): Promise<void>;
  interrupt(): void;
  /** Lines about to be said, fetched ahead in the natural voice (`neuralVoice`) — optional. */
  warm?(lines: readonly string[], locale: string): void;
}
export interface Ear {
  open(opts: {
    locale: string;
    ms: number;
    hints?: readonly string[];
    /** What the question expects — the second ear is told (`cloudEar`). */
    expect?: HearExpect;
    onSentence: (text: string, confidence: number | null) => boolean;
    onEnd: (why: WindowEnd) => void;
  }): EarWindow;
}
/** An open window. `hold`/`extend` let a follow-up line be said on it without its clock running out. */
export interface EarWindow {
  close(): void;
  hold?(): void;
  extend?(ms: number): void;
}
export interface Session {
  duck(): Promise<void>;
  unduck(): Promise<void>;
  playChime(): Promise<void>;
}
/** What survives the app being killed mid-workout: whether the opening was said, and the loads she confirmed. */
export interface VoicePersisted {
  startedAtMs: number;
  confirmed: [string, number | null][];
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
  /** The phone's own microphone is open for the workout: listening costs her music nothing. */
  earIsFree?: () => boolean;
  /** Keep what must survive a killed app (see `VoicePersisted`). */
  persist?: (p: VoicePersisted) => void;
}

/** The spec's windows, in milliseconds. */
export const WINDOWS = {
  loading: 90_000,
  loadingPrompt: 45_000,
  done: 6_000,
  /** A round's one question asks for two or more numbers — a little longer than a set's. */
  round: 8_000,
  reps: 4_000,
  echoTail: 3_000,
  confirm: 4_000,
  reask: 25_000,
  longDone: 60_000,
  paused: 60_000,
  /** A set left open after every question went unanswered: asked again this often, `MAX_REMINDERS` times. */
  remind: 90_000,
  /** "עוד רגע" on a hold's "זהו" — she is still holding; asked again this much later. */
  holdReask: 15_000,
} as const;

/**
 * How many times an open set is asked about again after the long window closed unanswered (2026-09-27,
 * the voice walk): the coach used to go quiet for good there, and an athlete who answered a minute later
 * had nobody listening. Two more questions, ninety seconds apart — then the lock screen and the wrist.
 */
export const MAX_REMINDERS = 2;

/** A hold longer than this is a block of work (a ten-minute bike), announced and never counted aloud. */
const HOLD_COUNTED_MAX_S = 180;

/**
 * A bare number in the loading dialogue is a LOAD only when it could be one (2026-09-27, the voice walk):
 * "שש" into the squat's 90-second window turned an 80 kg bar into the empty bar. A number this far from
 * the load on the bar, and small enough to be a rep count, is the set she has already done.
 */
const LOAD_PLAUSIBLE = { below: 0.5, above: 1.6 } as const;
const MAX_REPS_IN_LOADING = 30;

/** A number the recognizer was not sure of is said back with a question (spec §3.5). */
export const CONFIDENCE_FLOOR = 0.6;
/** An unrecognisable sentence this soon after a line ended is the line — not her (see `isBleed`). */
const BLEED_MS = 1_000;

type Mode = 'off' | 'idle' | 'loading' | 'set' | 'asking' | 'rest' | 'paused' | 'ended';

interface RoundStep {
  exerciseId: string;
  exerciseSetIndex: number;
  kg: number | null;
  lo: number;
  hi: number;
}
interface RoundAsk {
  steps: RoundStep[];
  reps: number[];
  weights?: (number | null)[];
}

interface AskState {
  /** Which question is open — decides what a bare number means. */
  question: 'done' | 'reps' | 'confirm' | 'echo' | 'echo_reps' | 'long_done' | 'remind' | 'paused' | 'round' | 'echo_round';
  /** How many silences so far on this set's ask. */
  silences: number;
  /** The "נכון?" came out of the loading dialogue (a number that could not be a load): "לא" goes back to it. */
  fromLoading?: boolean;
  /** The step on stage is a hold she is timing with the voice: an answer ends the HOLD, not a set. */
  hold?: { seconds: number };
  /** How many times she said "לא" / "עוד רגע" on this set's ask — counted apart from silences. */
  noes?: number;
  /** Half an answer, waiting for its other half. */
  pendingWeight?: number | null;
  /** What the echo said, for a "לא" in its tail. */
  echoed?: { weight: number | null; reps: number };
  /** A low-confidence hearing waiting for "נכון?". */
  unconfirmed?: { weight: number | null; reps: number };
  /** A round's question: its steps and the reps heard so far, in order. */
  round?: RoundAsk;
}

/** What a verdict was computed from — kept so a correction in the echo's tail can compute it again. */
interface EchoCtx {
  ex: string;
  before: Step | undefined;
  wasCalibration: boolean;
  lastOfLift: boolean;
  firstTime: boolean;
  warmup: boolean;
  correctionsBefore: number;
}

const stepKeyOf = (v: SessionView): string | null =>
  v.currentExerciseId && v.setLabel
    ? `${v.currentExerciseId}/${v.setLabel.warmup ? 'w' : ''}${v.setLabel.n}/${v.globalProgress?.index ?? 0}`
    : null;

const rowKey = (exerciseId: string, setIndex: number) => `${exerciseId}#${setIndex}`;

const validReps = (n: number) => Number.isInteger(n) && n > 0 && n <= MAX_VOICE_REPS;

/** A step the next one follows with no rest — the link of a superset or a circuit. */
const straightOn = (s: Step | undefined): boolean =>
  !!s && !s.lastSetOfSession && s.restAfterS != null && s.restAfterS <= REST_SKIP_THRESHOLD_S;

const roundStepOf = (s: Step): RoundStep => {
  const lo = s.target?.repBandLo ?? s.target?.recommendedReps ?? 8;
  return {
    exerciseId: s.exerciseId,
    exerciseSetIndex: s.exerciseSetIndex,
    kg: s.target?.recommendedWeight ?? null,
    lo,
    hi: s.target?.repBandHi ?? lo,
  };
};

export class VoiceConductor {
  private mode: Mode = 'off';
  private on = false;
  private lastKey: string | null = null;
  private lastPhase: SessionView['displayPhase'] | null = null;
  private lastActive = false;
  private lastActiveView: SessionView | null = null;
  private lastAwaiting = false;
  private window: EarWindow | null = null;
  private timers = new Set<unknown>();
  private ask: AskState | null = null;
  /** The load each lift is standing at — what she confirmed, then what she actually lifted. */
  private confirmedLoad = new Map<string, number | null>();
  private corrections = new Map<string, number>();
  private calibrating: string | null = null;
  /** She said "דלג" on this lift — the lift presented next is announced as its replacement. */
  private skipFrom: string | null = null;
  private speaking = 0;
  /** Lines queued and not yet finished — the music comes back only when nothing is queued. */
  private queued = 0;
  private lastSpokeEndMs = 0;
  private lastSpoken: string[] = [];
  /** The session (by its start instant) whose opening line was said — so `enable()` mid-session knows. */
  private announcedStart: number | null = null;
  /** Re-entering the phase she is in (earbuds back, resume, a call): nothing already said is said again (§3.9). */
  private reentry = false;
  /** The set on stage and where it stands: started, or still loading; when its question is due; how often it was re-asked. */
  private setState: { key: string; started: boolean; askDueMs: number | null; reminders?: number } | null = null;
  /** The lifts that struck a record today — said at the set, counted at the end. */
  private records = new Set<string>();
  /** What the stage showed last: the exercise, and whether it was an item (a hold, a distance). */
  private stageEx: string | null = null;
  private stageItem = false;
  /** The lift of the last row written — a lift returned to after another one gets its loading dialogue. */
  private lastLoggedEx: string | null = null;
  /** Rows the voice itself said back — the rest never echoes them a second time. */
  private voiceRows = new Set<string>();
  /** The ear cannot hear her (a locked phone, a refused microphone): lines go on, no window opens. */
  private earDown = false;
  private earErrors = 0;
  private cantHearSaid = false;
  /** The last write in flight — the end of the workout is said after it, never before. */
  private writing: Promise<void> | null = null;
  /** A round being written half by half. */
  private roundWrite: { steps: RoundStep[]; reps: number[]; weights: (number | null)[]; next: number } | null = null;
  /** The rest's lines and the verdict's move, held until the echo's correction window has closed. */
  private heldRest: { lines: string[]; move: { exerciseId: string; kg: number } | null } | null = null;
  private echoCtx: EchoCtx | null = null;
  /** A Loop 1 move decided at the echo, applied on the fresh view when the rest begins. */
  private pendingMove: { exerciseId: string; kg: number } | null = null;
  /** A phone call is on: nothing is said, nothing is asked. */
  private interrupted = false;
  /** What the call cut off — asked once when it ends (spec §3.9). */
  private callCut: 'ask' | 'loading' | null = null;
  /** When the workout was paused — the set's question is due that much later after "המשך". */
  private pausedAtMs: number | null = null;

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
    this.closeWindow();
    this.clearTimers();
    this.d.mouth.interrupt();
    this.ask = null;
    this.roundWrite = null;
    this.heldRest = null;
    this.interrupted = false;
    this.callCut = null;
    this.mode = 'off';
    const v = this.d.getView();
    // Unconditionally: the view masks the flag during a pause, and a Ready button with the voice
    // off is a button nothing answers.
    v?.setAwaitingReady(false);
    void this.d.audio.unduck();
  }

  /**
   * The workout ended and the stage is leaving (2026-09-27, the output audit): what is queued — the
   * last set's echo, "סיימת את האימון" — is said to the end, and only then does the voice go quiet.
   * Until today the unmount interrupted both, and the last set was written without an echo.
   */
  finish(): Promise<void> {
    return this.chain.then(() => this.disable());
  }

  isOn(): boolean {
    return this.on;
  }

  /** The workout this voice was running has ended — its last lines may still be queued. */
  ended(): boolean {
    return this.mode === 'ended';
  }

  /** She refused the microphone: the coach speaks, the ear stays shut, and it says so once. */
  earRefused(): void {
    if (this.on) this.earWentDown('denied');
  }

  /** Mid-workout after the app was killed: whether the opening was said, and the loads she stood at. */
  restore(p: VoicePersisted | null): void {
    if (!p) return;
    this.announcedStart = p.startedAtMs;
    this.confirmedLoad = new Map(p.confirmed);
  }

  /** Back on glass, or the phone's microphone opened: windows may be tried again. */
  earMayListen(): void {
    if (!this.earDown) return;
    this.earDown = false;
    this.earErrors = 0;
    this.d.track?.('voice_ear_back');
  }

  /**
   * A phone call, Siri, an alarm took the audio (`began`) or gave it back (spec §3.9, wired
   * 2026-09-27): nothing is said over it, and a question it cut off is asked once after it.
   */
  onInterruption(began: boolean): void {
    if (!this.on) return;
    if (began) {
      if (this.interrupted) return;
      this.interrupted = true;
      const echoing = this.ask?.question === 'echo' || this.ask?.question === 'echo_reps' || this.ask?.question === 'echo_round';
      if (this.mode === 'asking' && !echoing) this.callCut = 'ask';
      else if (this.mode === 'loading') this.callCut = 'loading';
      this.closeWindow();
      this.clearTimers();
      this.d.mouth.interrupt();
      return;
    }
    if (!this.interrupted) return;
    this.interrupted = false;
    const v = this.d.getView();
    const cut = this.callCut;
    this.callCut = null;
    if (!v?.active) return;
    if (this.ask?.question === 'echo' || this.ask?.question === 'echo_reps' || this.ask?.question === 'echo_round') {
      this.ask = null;
      this.releaseHeldRest(true);
    }
    if (cut === 'ask') {
      this.ask = null;
      this.after(1_500, () => this.askDone());
    } else if (cut === 'loading') {
      this.openLoading(v, [voiceScript.readyPrompt()]);
    } else if (this.mode === 'set' && this.setState?.askDueMs != null) {
      this.after(Math.max(1_500, this.setState.askDueMs - this.d.now()), () => this.askDone());
    } else if (this.mode === 'rest') {
      this.scheduleTenSeconds(v);
    }
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
    /*
     * ⛔ NOTHING BUT "המשך" WHILE PAUSED (2026-09-27, the voice fuzz). Earbuds back in during a pause
     * cleared `lastPhase`, and the next render ran the set's handler under the pause: "מוכן?" and a
     * ninety-second window into a frozen workout, then "האימון מושהה" all over again.
     */
    if (v.paused) return;
    if (this.mode === 'paused') this.onResumed();

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
    this.voiceRows.clear();
    this.records.clear();
    this.calibrating = null;
    this.lastLoggedEx = null;
    this.setState = null;
    // A new workout tries to listen again, and says so again if it cannot.
    this.earDown = false;
    this.earErrors = 0;
    this.cantHearSaid = false;
    this.persist();
    const l = this.d.locale();
    const lines: string[] = [];
    if (this.d.firstSessionEver()) lines.push(voiceScript.openFirstSession());
    const first = v.sessionExerciseIds[0] ?? v.currentExerciseId;
    if (first) lines.push(voiceScript.openSession(v.workoutName ?? '', v.sessionExerciseIds.length, this.estimateMinutes(v), first, l));
    void this.speak(lines);
  }

  private onSessionEnd(v: SessionView): void {
    this.closeWindow();
    this.clearTimers();
    this.roundWrite = null;
    this.heldRest = null;
    const l = this.d.locale();
    const minutes = v.startedAtMs ? Math.max(1, Math.round((this.d.now() - v.startedAtMs) / 60_000)) : this.estimateMinutes(v);
    this.mode = 'ended';
    // ⛔ After the last set's own echo (2026-09-27): the end fires on the render that logs the last
    // set, while the voice's write is still in flight — and "סיימת את האימון" was said first.
    const lifts = v.sessionExerciseIds.length;
    void (this.writing ?? Promise.resolve()).then(() => {
      this.ask = null;
      // Counted after the last write: the last set can be the record.
      void this.speak([voiceScript.sessionDone(lifts, minutes, this.records.size, l)]);
    });
  }

  private estimateMinutes(v: SessionView): number {
    // Sets × (a set's ~45 s + its rest) — "בערך", and rounded to five, the way a coach rounds.
    const sets = v.livePlan.length || 1;
    const rest = v.restSeconds || 90;
    return Math.max(5, Math.round((sets * (45 + rest)) / 60 / 5) * 5);
  }

  private persist(): void {
    if (this.announcedStart == null || this.announcedStart < 0) return;
    this.d.persist?.({ startedAtMs: this.announcedStart, confirmed: [...this.confirmedLoad] });
  }

  // ── The set ───────────────────────────────────────────────────────────────────────────────────

  private onSetPresented(v: SessionView, setChanged: boolean): void {
    // A round the voice is writing, half by half: the next half is on stage — write it now.
    if (this.roundWrite) return void this.continueRound(v);
    // The rest just ended: the chime sounds before whatever is said next (spec §3.6) — the next
    // set's line, or the loading dialogue of a lift or a changed load.
    const fromRest = this.mode === 'rest';
    const key = stepKeyOf(v);
    // ⛔ Re-entering the set she is IN (earbuds back, resume, after a call) says nothing already said
    // and keeps the question's own time (2026-09-27, the conductor audit): it used to replay the set
    // line, restart the ask clock from now, and reopen a loading dialogue mid-set.
    if (this.reentry && key != null && this.setState?.key === key) {
      this.reentry = false;
      return this.resumeSet(v);
    }
    this.reentry = false;
    this.closeWindow();
    this.clearTimers();
    this.ask = null;
    // A set arrived while an echo's tail was still open (a rest shorter than the tail): its move lands.
    this.releaseHeldRest(false);
    const ex = v.currentExerciseId;
    const l = this.d.locale();
    /*
     * A new set on stage: no Ready of the old one stays on the card (a tap on the stage or the card,
     * a swap, a skip all land here). ⛔ UNCONDITIONALLY (2026-09-27, the voice fuzz): it was skipped
     * when the voice was still in the old set's loading dialogue — Done on the lock screen, or the
     * board moving the lift, put a set on stage that needed no loading, and its card kept a Ready
     * button nothing would ever answer. `openLoading` raises it again for a set that does need it.
     */
    v.setAwaitingReady(false);
    this.lastAwaiting = false;
    this.stageEx = ex;
    this.stageItem = !!(v.currentItem && v.currentItem.kind !== 'reps');
    // A hold, a distance: checked BEFORE the rep target, which such a step does not carry.
    if (ex && v.currentItem && v.currentItem.kind !== 'reps') {
      const item = v.currentItem as { kind: string; seconds?: number; metres?: number };
      const hold = this.holdOnStage(v);
      if (hold) {
        /*
         * ⛔ A HOLD IS COUNTED ALOUD (2026-09-27, the voice walk). The plank used to be announced and
         * then left to a tap — the one step of the workout that sent her hand back to the phone. Now
         * "מוכן" starts it, the voice says ten seconds out and "זהו", and HER word ends it: silence
         * writes nothing, exactly as for a set (founder, 2026-09-09).
         */
        this.openLoading(v, [voiceScript.holdLoading(exerciseDisplayName(ex), hold.seconds, l)], fromRest);
        return;
      }
      // A distance, or a block of work longer than a hold: announced, never counted (spec §3.9).
      this.mode = 'set';
      this.setState = { key: key ?? '', started: true, askDueMs: null };
      const line =
        item.kind === 'distance' && item.metres != null
          ? voiceScript.distanceItem(exerciseDisplayName(ex), item.metres, l)
          : voiceScript.holdItem(exerciseDisplayName(ex), item.seconds ?? 0, l);
      void this.speak([line], false, fromRest);
      return;
    }
    if (!ex || !v.currentTarget) return;
    const kg = v.currentTarget.recommendedWeight;
    const lo = v.currentTarget.repBandLo ?? v.currentTarget.recommendedReps;
    const hi = v.currentTarget.repBandHi ?? lo;
    const n = v.setLabel?.n ?? 1;
    const m = v.setLabel?.m ?? 1;
    const warmup = !!v.setLabel?.warmup;

    const chain = this.chainAt(v);
    if (chain) {
      if (chain.at > 0) {
        /*
         * Inside a round she moved through herself (a tap on the stage, the card, the wrist): no
         * loading dialogue mid-round — she is already on her way. ⛔ And what is LEFT of the round is
         * asked about (2026-09-27, the voice fuzz): the middle lift of a tri-set reached by a tap was
         * asked nothing, and the round's own question had died with the tap — the coach went silent
         * until she touched the phone again. One lift left: its own question; more: one for them all.
         */
        this.confirmedLoad.set(ex, kg);
        this.mode = 'set';
        this.scheduleAsk(v, this.d.now());
        return;
      }
      const needsLoading = chain.steps.some((s) => !this.confirmedLoad.has(s.exerciseId) || this.confirmedLoad.get(s.exerciseId) !== s.kg);
      if (needsLoading) {
        this.skipFrom = null;
        this.openLoading(v, [voiceScript.roundLoading(chain.steps, l)], fromRest);
        return;
      }
      this.mode = 'set';
      if (setChanged) void this.speak([voiceScript.roundStart(n, m, chain.steps.map((s) => s.exerciseId), l)], false, fromRest);
      this.scheduleAsk(v, this.d.now());
      return;
    }

    /*
     * ⛔ THE LOAD SHE STANDS AT IS THE LOAD SHE LIFTED (2026-09-27, the conductor audit). The
     * confirmed load was only ever written by "מוכן" — so a set she started with a tap reopened the
     * whole loading dialogue on every set after it, and a set lifted at 45 where 40 was written
     * told her to "add two and a half a side" to a bar already at 45. Every row written now moves
     * it (`onRest`, `complete`), and a lift she comes BACK to after another gets its dialogue.
     */
    const known = this.confirmedLoad.has(ex);
    const confirmed = this.confirmedLoad.get(ex);
    const loadChanged = known && confirmed !== kg;
    const cameBack = known && !loadChanged && this.lastLoggedEx != null && this.lastLoggedEx !== ex;
    if (!known || loadChanged || cameBack || this.skipFrom != null) {
      const firstTime = v.lastTime == null;
      let line: string;
      if (this.skipFrom != null && this.skipFrom !== ex) line = voiceScript.skippedLift(ex, kg, lo, hi, l);
      // A warm-up is announced as one — the lift, the ramp step, the load, the count — never as a
      // "load change" down from the working weight (2026-09-27, the voice fuzz).
      else if (warmup) line = voiceScript.warmupStart(ex, kg, v.currentTarget.recommendedReps, n, m, l);
      else if (loadChanged && confirmed != null && kg != null) line = voiceScript.loadChanged(ex, confirmed, kg, n, m, warmup, l);
      else if (firstTime && !known) line = voiceScript.loadFirstTime(ex, kg, lo, hi, l);
      else line = voiceScript.loadCalibrated(ex, kg, lo, hi, l);
      this.skipFrom = null;
      this.openLoading(v, [line], fromRest);
      return;
    }

    // Sets 2+ at the same load: the rest's end was the start (spec §3.6 / §3.3).
    this.mode = 'set';
    if (setChanged) void this.speak([voiceScript.setStart(ex, kg, lo, hi, n, m, warmup, l)], false, fromRest);
    this.scheduleAsk(v, this.d.now());
  }

  /** The hold on stage that the voice counts — a timed item of a plank's length; null for anything else. */
  private holdOnStage(v: SessionView): { seconds: number } | null {
    const it = v.currentItem as { kind: string; seconds?: number } | null;
    if (!it || it.kind !== 'time' || !(it.seconds! > 0) || it.seconds! > HOLD_COUNTED_MAX_S) return null;
    return { seconds: it.seconds! };
  }

  /** Back into the set on stage, as it stood: loading still waits for "מוכן"; a started set keeps its ask time. */
  private resumeSet(v: SessionView): void {
    const s = this.setState!;
    this.closeWindow();
    this.clearTimers();
    this.ask = null;
    if (!s.started) {
      // The loading line was said; the window opens again under a short prompt.
      this.openLoading(v, [voiceScript.readyPrompt()]);
      return;
    }
    this.mode = 'set';
    // A hold back from a pause: its question and its ten seconds follow the store's clock, which
    // moved by exactly the time stood still (2026-09-28) — never a clock of the voice's own.
    const hold = this.holdOnStage(v);
    if (hold && v.holdEndsAtMs != null) {
      s.askDueMs = v.holdEndsAtMs;
      this.scheduleHoldTen(v.holdEndsAtMs, hold.seconds);
    }
    if (s.askDueMs == null) return this.settleAudio();
    this.after(Math.max(1_500, s.askDueMs - this.d.now()), () => this.askDone());
  }

  /** The lifts of the round still to be done from the one on stage — null when one lift (or none) is left. */
  private roundAhead(v: SessionView): RoundStep[] | null {
    const chain = this.chainAt(v);
    if (!chain) return null;
    const rest = chain.steps.slice(chain.at);
    return rest.length >= 2 ? rest : null;
  }

  /** The round the step on stage belongs to — null for a lift on its own. */
  private chainAt(v: SessionView): { at: number; steps: RoundStep[] } | null {
    const plan = v.livePlan as Step[];
    const idx = v.globalProgress?.index ?? 0;
    const cur = plan[idx];
    if (!cur || !cur.target || cur.warmup) return null;
    const member = (s: Step | undefined) => !!s && !!s.target && !s.warmup && (!s.item || s.item.kind === 'reps');
    let s = idx;
    while (s > 0 && straightOn(plan[s - 1]) && member(plan[s - 1])) s--;
    let e = idx;
    while (e < plan.length - 1 && straightOn(plan[e]) && member(plan[e + 1])) e++;
    if (e === s) return null;
    return { at: idx - s, steps: plan.slice(s, e + 1).map(roundStepOf) };
  }

  private openLoading(v: SessionView, lines: string[], chime = false): void {
    this.mode = 'loading';
    const key = stepKeyOf(v) ?? '';
    this.setState = { key, started: false, askDueMs: null };
    /*
     * The set has not started (spec §3.2: "הסט לא מתחיל עד שיש אות"): EVERY surface offers Ready, and
     * "מוכן" from any of them — or her word — moves the set's stamp to the signal (`markSetStarted`).
     * ⛔ A HOLD TOO, SINCE 2026-09-28: its "מוכן" was the voice's alone, on a clock of the voice's own.
     * Now Ready on the stage, the wrist or the card starts the hold's ONE clock in the store, and the
     * voice counts to that clock's end (`onReady`).
     */
    v.setAwaitingReady(true);
    this.lastAwaiting = true;
    void this.speak(lines, true, chime).then(() => {
      if (this.mode !== 'loading') return this.settleAudio();
      this.openWindow(WINDOWS.loading, (a, text, conf) => this.onLoadingAnswer(v, a, text, conf), 'ready', (why) => {
        if (this.mode !== 'loading' || this.setState?.key !== key) return;
        if (why === 'heard' || why === 'closed' || why === 'unavailable') return;
        // The "מוכן?" timer dies with its window — it used to ask into a closed microphone.
        this.clearTimers();
        /*
         * ⛔ NEVER A DEAD END (2026-09-27, the voice fuzz: 113 of them in 40 random workouts). The
         * window ran out and the coach said where Ready lives — and then nothing, ever: she had
         * started without the word the ear missed, lifted, and no question came. The question now
         * comes anyway, one set's time from here; the Ready button stays until it does.
         */
        const failed = this.earFailed(why);
        void this.speak([failed ? voiceScript.readyFallback() : voiceScript.readyNotHeard()]);
        const now = this.d.getView();
        const inMs = now ? this.askDelayMs(now) : null;
        if (inMs != null) {
          this.setState = { key, started: false, askDueMs: this.d.now() + inMs };
          this.after(inMs, () => this.askDone());
        }
      });
      this.after(WINDOWS.loadingPrompt, () => {
        if (this.mode === 'loading' && this.window) void this.speak([voiceScript.readyPrompt()], true);
      });
    });
  }

  private onLoadingAnswer(v0: SessionView, a: VoiceAnswer | null, _text: string, _conf: number | null): boolean {
    const v = this.d.getView() ?? v0;
    const l = this.d.locale();
    const ex = v.currentExerciseId;
    if (!a || !ex) return true; // noise while loading: ignored, window stays open
    if (this.holdOnStage(v)) {
      // A hold's dialogue knows one word: its start (and the session's own verbs).
      switch (a.kind) {
        case 'ready':
        case 'yes':
          this.onReady(v, 'voice');
          return false;
        case 'skip':
          return this.onSkip(v, true);
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
    if (!v.currentTarget) return true;
    // A round's dialogue offers no weight change — which lift would it be? (it says only "מוכן")
    const round = this.chainAt(v)?.at === 0;
    const exo = exerciseById(ex);
    switch (a.kind) {
      case 'ready':
      case 'yes':
        this.onReady(v, 'voice');
        return false;
      case 'figures': {
        if (round) return true;
        const cur = v.currentTarget.recommendedWeight;
        /*
         * ⛔ A NUMBER THAT CANNOT BE A LOAD IS THE SET SHE ALREADY DID (2026-09-27, the voice fuzz).
         * "שש" into a squat's loading window made the 80 kg bar the empty bar; "שמונה" on a pull-up
         * hung eight kilos on her belt. A load and reps both, or a number that could not be the load
         * (far from the bar, small enough to be reps, or any number on a lift with no load), is read
         * as a finished set — and said back with "נכון?" before anything is written.
         */
        const n = a.numbers[0];
        const two = a.numbers.length >= 2 && validReps(a.numbers[1]);
        const loadless = cur == null || loadStyleOf(ex) === 'bodyweight' || loadStyleOf(ex) === 'band';
        const asKg = toKg(n, a.lb);
        const plausibleLoad = cur != null && cur > 0 && asKg >= cur * LOAD_PLAUSIBLE.below && asKg <= cur * LOAD_PLAUSIBLE.above;
        const repsLike = validReps(n) && n <= MAX_REPS_IN_LOADING;
        if (two || (!a.saysKg && repsLike && (a.saysReps || loadless || !plausibleLoad))) {
          const weight = two ? toKg(n, a.lb) : cur;
          const reps = two ? a.numbers[1] : n;
          return this.confirmFromLoading(v, weight, reps);
        }
        if (loadless && !a.saysKg) return true;
        if (!(asKg >= 0) || !exo) return true;
        const snapped = snapToStock(asKg, exo);
        v.setLiftLoad(snapped);
        void this.speak([voiceScript.loadEcho(ex, snapped, l)], true);
        this.relisten(WINDOWS.loading);
        return true;
      }
      case 'easier':
      case 'harder': {
        if (round || !exo) return true;
        const cur = v.currentTarget.recommendedWeight;
        if (cur == null) return true;
        // One step of the equipment, onto a weight that exists: 22.5 kg dumbbells "lighter" were 21.5.
        /* The detent is in HER units and the load is kilograms (2026-09-30): "harder" to an athlete in
           pounds added FIVE KILOGRAMS — two rungs — because 5 was added to a kilogram load as it stood. */
        const step = kgFromDisplay(weightStepFor(l.units, exo.equipment), l.units);
        const dir = a.kind === 'harder' ? 1 : -1;
        let next = snapToStock(cur + dir * step, exo);
        if (next === cur) next = snapToStock(cur + dir * 2 * step, exo);
        next = Math.max(emptyBarKg(exo.equipment), next);
        if (next === cur) return true;
        v.setLiftLoad(next);
        void this.speak([voiceScript.loadEcho(ex, next, l)], true);
        this.relisten(WINDOWS.loading);
        return true;
      }
      case 'dont_know': {
        if (round || !exo) return true;
        // The calibration set (spec §3.2): light, no range, her reps decide the next load.
        const cur = v.currentTarget.recommendedWeight;
        if (cur == null) return true;
        const light = Math.max(emptyBarKg(exo.equipment), snapToStock(cur * 0.75, exo));
        v.setLiftLoad(light);
        this.calibrating = ex;
        void this.speak([voiceScript.calibrationStart(ex, light, l)], true);
        this.relisten(WINDOWS.loading);
        return true;
      }
      case 'skip':
        return this.onSkip(v, true);
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

  /** A set she reported from the loading dialogue: said back with "נכון?" — "כן" writes it, "לא" goes back to loading. */
  private confirmFromLoading(v: SessionView, weight: number | null, reps: number): boolean {
    const l = this.d.locale();
    this.clearTimers();
    if (v.awaitingReady) v.setAwaitingReady(false);
    this.lastAwaiting = false;
    this.mode = 'asking';
    this.ask = { question: 'confirm', silences: 0, fromLoading: true, unconfirmed: { weight, reps } };
    /*
     * ⛔ A NEW WINDOW, NOT THE LOADING ONE HELD (2026-09-27, the voice fuzz). `reopen` keeps the open
     * window and restarts its clock — and the open window here is the LOADING dialogue's, whose handler
     * took her "כן" as "מוכן" and her "לא" as noise: the "נכון?" could never be answered, and the coach
     * went silent. The loading window closes; the question gets its own.
     */
    this.closeWindow();
    const mine = this.ask;
    void this.speak([voiceScript.confirmHeard(weight, reps, l)], true).then(() => {
      if (this.mode !== 'asking' || this.ask !== mine) return this.settleAudio();
      this.openWindow(WINDOWS.confirm, (a, text, conf) => this.onDoneAnswer(a, text, conf), 'confirm', (why) => this.onDoneWindowEnd(why));
    });
    return false;
  }

  /** "מוכן" — from the voice, the lock screen or the wrist: the set starts now. */
  private onReady(v: SessionView, via: 'voice' | 'tap'): void {
    if (this.mode !== 'loading') return;
    const ex = v.currentExerciseId;
    const hold = this.holdOnStage(v);
    const chain = hold ? null : this.chainAt(v);
    const loads: [string, number | null][] = hold
      ? []
      : chain
        ? chain.steps.map((s) => [s.exerciseId, s.kg])
        : ex
          ? [[ex, v.currentTarget?.recommendedWeight ?? null]]
          : [];
    for (const [id, kg] of loads) this.confirmedLoad.set(id, kg);
    this.persist();
    this.closeWindow();
    this.clearTimers();
    this.mode = 'set';
    // Her word starts the set — and a hold's one clock (2026-09-28) — on every surface at once.
    if (via === 'voice') v.markSetStarted();
    v.setAwaitingReady(false);
    this.lastAwaiting = false;
    /*
     * "קדימה." — and nothing more: ⛔ NO TECHNIQUE LINE, ON ANY SET (founder, 2026-09-27: *"לא צריך
     * בכלל"*; a form cue after "קדימה" was built that evening and removed the same night). Said for a
     * Ready pressed on the lock screen too: it is the only sign from the pocket that the press landed.
     */
    void this.speak([voiceScript.go()]);
    this.d.track?.('voice_ready', { via });
    /*
     * ⛔ A HOLD IS COUNTED TO THE STORE'S END (2026-09-28): the instant the stage, the wrist and the
     * card count to. A Ready tapped elsewhere started that clock a render ago (`holdStartedAtMs`); her
     * word starts it now, in the same instant this line runs.
     */
    const start = hold ? (this.d.getView()?.holdStartedAtMs ?? v.holdStartedAtMs ?? this.d.now()) : this.d.now();
    this.scheduleAsk(v, start);
    if (hold) this.scheduleHoldTen(start + hold.seconds * 1000, hold.seconds);
  }

  /** "עוד עשר שניות" on a hold — ten seconds before the ONE end every surface counts to. */
  private scheduleHoldTen(endMs: number, seconds: number): void {
    if (seconds < 20) return;
    const key = this.setState?.key;
    const inMs = endMs - 10_000 - this.d.now();
    if (inMs < 0) return;
    this.after(inMs, () => {
      if (this.mode === 'set' && this.setState?.key === key) void this.speak([voiceScript.tenSeconds()]);
    });
  }

  /** How long after its start the step on stage is asked about — null when it is not (a round's middle). */
  private askDelayMs(v: SessionView): number | null {
    const hold = this.holdOnStage(v);
    if (hold) return hold.seconds * 1000;
    const ex = v.currentExerciseId;
    if (!ex || !v.currentTarget) return null;
    // A round is asked once, after all of it — or all that is left of it: each lift's own time, in turn.
    const ahead = this.roundAhead(v);
    if (ahead) return ahead.reduce((t, s) => t + voiceAskAfterS(s.exerciseId, s.lo) * 1000, 0);
    const lo = v.currentTarget.repBandLo ?? v.currentTarget.recommendedReps;
    return voiceAskAfterS(ex, lo) * 1000;
  }

  private scheduleAsk(v: SessionView, startMs: number): void {
    const inMs = this.askDelayMs(v);
    if (inMs == null) {
      if (v.currentTarget || this.holdOnStage(v)) this.setState = { key: stepKeyOf(v) ?? '', started: true, askDueMs: null };
      return;
    }
    const dueMs = startMs + inMs;
    this.setState = { key: stepKeyOf(v) ?? '', started: true, askDueMs: dueMs };
    this.after(Math.max(0, dueMs - this.d.now()), () => this.askDone());
  }

  // ── The ask ───────────────────────────────────────────────────────────────────────────────────

  private askDone(reminder = false): void {
    const v = this.d.getView();
    if (!v || !this.on || v.displayPhase !== 'SET_PRESENTED' || v.paused) return;
    const hold = this.holdOnStage(v);
    if (v.currentItem && v.currentItem.kind !== 'reps' && !hold) return;
    if (this.interrupted) {
      this.callCut = 'ask';
      return;
    }
    // A question means the set is under way — begun without the word the ear missed, if it was
    // never said: the Ready it still offers on the card goes (a button nothing answers otherwise).
    if (v.awaitingReady) v.setAwaitingReady(false);
    this.lastAwaiting = false;
    if (this.earDown) {
      // Nothing can hear the answer: the question becomes where to mark the set.
      this.mode = 'set';
      void this.speak([voiceScript.markOnLock()]);
      return;
    }
    this.mode = 'asking';
    const prev = this.ask;
    const l = this.d.locale();
    let line: string;
    let ms: number = WINDOWS.done;
    const ahead = hold ? null : this.roundAhead(v);
    if (hold) {
      // "זהו, ארבעים וחמש שניות. סיימת?" — then, if she is still holding, only "סיימת?".
      this.ask = { question: 'done', silences: prev?.silences ?? 0, noes: prev?.noes ?? 0, hold };
      line = prev ? voiceScript.askDoneHoldAgain() : voiceScript.askDoneHold(hold.seconds, l);
    } else if (ahead) {
      this.ask = { question: 'round', silences: prev?.silences ?? 0, noes: prev?.noes ?? 0, round: { steps: ahead, reps: [] } };
      const ids = ahead.map((s) => s.exerciseId);
      line = ids.length === 2 ? voiceScript.askDoneSuperset(ids[0], ids[1]) : voiceScript.askDoneRound();
      ms = WINDOWS.round;
    } else {
      this.ask = { question: reminder ? 'remind' : 'done', silences: prev?.silences ?? 0, noes: prev?.noes ?? 0 };
      if (reminder) line = voiceScript.remindDone();
      else if (v.setLabel?.warmup) line = voiceScript.askDoneWarmup();
      else if (this.isLastSetOfSession(v)) line = voiceScript.askDoneLast();
      else line = voiceScript.askDone();
    }
    const mine = this.ask;
    void this.speak([line], true).then(() => {
      if (this.mode !== 'asking' || this.ask !== mine) return this.settleAudio();
      this.openWindow(ms, (a, text, conf) => this.onDoneAnswer(a, text, conf), hold ? 'confirm' : 'reps', (why) => this.onDoneWindowEnd(why));
    });
  }

  private isLastSetOfSession(v: SessionView): boolean {
    const idx = v.globalProgress?.index ?? 0;
    return idx >= v.livePlan.length - 1;
  }

  private onDoneAnswer(a: VoiceAnswer | null, _text: string, conf: number | null): boolean {
    const v = this.d.getView();
    if (!v || !this.ask) return false;
    const q = this.ask.question;
    if (q === 'round' || q === 'echo_round') return this.onRoundAnswer(v, a);
    const inEcho = q === 'echo' || q === 'echo_reps';
    if (this.ask.hold && !inEcho) return this.onHoldAnswer(v, a);
    if (!a) {
      // In the echo's tail, the long wait and a pause a stray sentence is ignored — only a question
      // gets "לא הבנתי" (it used to turn the echo's tail into a SECOND write of the same set).
      if (inEcho || q === 'long_done' || q === 'paused') return true;
      return this.didntGetReps();
    }
    switch (a.kind) {
      case 'figures': {
        const nums = a.numbers;
        if (q === 'confirm' && this.ask.unconfirmed) {
          // A number in the confirm window replaces what was heard.
          this.ask.unconfirmed = undefined;
        }
        if (inEcho && this.ask.echoed) {
          // A correction in the echo's tail — or the number after its "לא" → "כמה חזרות?": the row
          // is AMENDED (spec §3.5); a second write during the rest would be silently refused.
          const w = nums.length >= 2 ? toKg(nums[0], a.lb) : this.ask.echoed.weight;
          const reps = nums.length >= 2 ? nums[1] : nums[0];
          if (!validReps(reps)) return true;
          // The very figures just said back: that is agreement, not a correction (2026-09-27, the
          // voice fuzz — "…שמונה חזרות. נרשם." said twice over one row).
          if (w === this.ask.echoed.weight && reps === this.ask.echoed.reps) return this.closeEcho();
          this.amendLast(v, w, reps);
          return false;
        }
        if (nums.length >= 2) {
          // Load, then reps — always in that order (spec §3.4); the grammar has bound the units.
          if (!validReps(nums[1])) return this.didntGetReps();
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
        if (!validReps(n)) return this.didntGetReps();
        void this.complete(v, this.ask.pendingWeight !== undefined ? this.ask.pendingWeight : (v.currentTarget?.recommendedWeight ?? null), n, conf);
        return false;
      }
      case 'yes':
        if (q === 'confirm' && this.ask.unconfirmed) {
          const u = this.ask.unconfirmed;
          void this.complete(v, u.weight, u.reps, 1);
          return false;
        }
        // "כן" in the echo's tail is agreement: the row stands (it used to ask "כמה חזרות?" again).
        if (inEcho) return this.closeEcho();
        if (v.setLabel?.warmup) {
          void this.complete(v, v.currentTarget?.recommendedWeight ?? null, v.currentTarget?.recommendedReps ?? 0, 1);
          return false;
        }
        this.ask.question = 'reps';
        void this.speak([voiceScript.askReps()], true);
        this.reopen(WINDOWS.reps);
        return true;
      case 'done':
        if (inEcho) return this.closeEcho();
        if (v.setLabel?.warmup) {
          void this.complete(v, v.currentTarget?.recommendedWeight ?? null, v.currentTarget?.recommendedReps ?? 0, 1);
          return false;
        }
        this.ask.question = 'reps';
        void this.speak([voiceScript.askReps()], true);
        this.reopen(WINDOWS.reps);
        return true;
      case 'as_written':
        if (inEcho) return true;
        void this.complete(v, v.currentTarget?.recommendedWeight ?? null, v.currentTarget?.repBandLo ?? v.currentTarget?.recommendedReps ?? 0, 1);
        return false;
      case 'no':
        if (q === 'confirm' && this.ask.fromLoading) {
          // "שמעתי … נכון?" out of the loading dialogue, and it was not a set: back to loading.
          this.ask = null;
          this.closeWindow();
          this.openLoading(v, [voiceScript.readyPrompt()]);
          return false;
        }
        if (q === 'confirm' && this.ask.unconfirmed) {
          this.ask.unconfirmed = undefined;
          this.ask.question = 'reps';
          void this.speak([voiceScript.askReps()], true);
          this.reopen(WINDOWS.reps);
          return true;
        }
        if (inEcho && this.ask.echoed) {
          this.ask.question = 'echo_reps';
          void this.speak([voiceScript.askReps()], true);
          this.reopen(WINDOWS.reps);
          return true;
        }
        return this.stillLifting();
      case 'skip':
        return this.onSkip(v, false);
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

  /** "סיימת?" at a hold's end: her word ends it — "כן" as prescribed, a number as the seconds she held. */
  private onHoldAnswer(v: SessionView, a: VoiceAnswer | null): boolean {
    const hold = this.ask!.hold!;
    if (!a) return true;
    switch (a.kind) {
      case 'yes':
      case 'done':
      case 'as_written':
        void this.completeHold(v, hold.seconds);
        return false;
      case 'figures': {
        const n = a.numbers[a.numbers.length - 1];
        if (!(Number.isInteger(n) && n > 0 && n <= hold.seconds * 4)) return true;
        void this.completeHold(v, n);
        return false;
      }
      case 'no':
        return this.stillLifting();
      case 'skip':
        return this.onSkip(v, false);
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

  /** "לא הבנתי. כמה חזרות עשית?" — and the window, counted from the end of that line. */
  private didntGetReps(): boolean {
    if (this.ask) this.ask.question = 'reps';
    void this.speak([voiceScript.didntGet()], true);
    this.reopen(WINDOWS.reps);
    return true;
  }

  /** Still lifting: "בסדר", ask again in 25 s; after the second "לא", "תגיד סיימתי כשתסיים". */
  private stillLifting(): boolean {
    if (!this.ask) return false;
    // Counted apart from silences: a "לא" is her word.
    this.ask.noes = (this.ask.noes ?? 0) + 1;
    void this.speak([voiceScript.okWait()]);
    this.closeWindow();
    // A hold she is still in is asked again sooner, and never sent to the long window: it ends by itself.
    if (this.ask.hold) this.after(WINDOWS.holdReask, () => this.askDone());
    else if (this.ask.noes >= 2) this.openLongDone();
    else this.after(WINDOWS.reask, () => this.askDone());
    return false;
  }

  /** "כן" / "סיימתי" in the echo's tail — the row stands; the rest goes on. */
  private closeEcho(): boolean {
    this.closeWindow();
    this.ask = null;
    this.releaseHeldRest(true);
    return false;
  }

  /**
   * "דלג" / "תפוס": the board moves the lift (`markEquipmentOccupied`). The lift presented next is
   * announced as its replacement ("בסדר. במקום זה: …"); when NOTHING could move — the last lift
   * standing — she is told so and the set goes on (2026-09-27: the coach used to go quiet for good).
   */
  private onSkip(v: SessionView, loading: boolean): boolean {
    const ex = v.currentExerciseId;
    const key = stepKeyOf(v);
    this.skipFrom = ex;
    this.closeWindow();
    this.clearTimers();
    this.ask = null;
    v.markEquipmentOccupied();
    this.after(1_500, () => {
      const now = this.d.getView();
      if (!now || stepKeyOf(now) !== key) return;
      this.skipFrom = null;
      void this.speak([voiceScript.cantSkip()]);
      if (loading) {
        this.openLoading(now, [voiceScript.readyPrompt()]);
      } else {
        this.mode = 'set';
        this.after(WINDOWS.reask, () => this.askDone());
      }
    });
    return false;
  }

  private onDoneWindowEnd(why: WindowEnd): void {
    if (!this.ask) return;
    const q = this.ask.question;
    const echo = q === 'echo' || q === 'echo_reps' || q === 'echo_round';
    if (why === 'heard' || why === 'closed' || why === 'unavailable') return;
    if (this.earFailed(why)) {
      // The echo's row stands either way; an open question becomes where to mark the set.
      this.ask = null;
      if (echo) return this.releaseHeldRest(true);
      this.mode = 'set';
      void this.speak([voiceScript.markOnLock()]);
      return;
    }
    if (echo) {
      // The echo's tail closed with no correction: the row stands. The rest line and the move now.
      this.ask = null;
      return this.releaseHeldRest(true);
    }
    if (this.mode !== 'asking') return;
    if (q === 'long_done' || q === 'remind') {
      // No word again: the set waits for her (the lock screen and the wrist have Done) — and is
      // asked about again in a while, a bounded number of times (`MAX_REMINDERS`).
      this.ask = null;
      this.mode = 'set';
      this.settleAudio();
      this.scheduleReminder();
      return;
    }
    if (q === 'confirm' && this.ask.fromLoading) {
      // "שמעתי … נכון?" out of the loading dialogue, and no answer: it was not a set. Back to loading.
      const v = this.d.getView();
      this.ask = null;
      if (v) this.openLoading(v, [voiceScript.readyPrompt()]);
      return;
    }
    if (q === 'confirm') {
      /*
       * ⛔ SILENCE AFTER "נכון?" WRITES NOTHING (2026-09-27, both audits). Spec §3.5 said "שתיקה = כן",
       * which was the one path left where silence wrote a set — against the 2026-09-09 ruling that
       * nothing is ever logged by itself. It is the question's silence now, counted like any other.
       */
      this.ask.unconfirmed = undefined;
      this.ask.question = 'done';
    }
    this.ask.silences += 1;
    if (this.ask.silences === 1) {
      void this.speak([voiceScript.askAgainSoon()]);
      this.after(this.ask.hold ? WINDOWS.holdReask : WINDOWS.reask, () => this.askDone());
      return;
    }
    /*
     * ⛔ THE SECOND SILENCE WRITES NOTHING (founder, 2026-09-09). The set stays open, she is told so
     * and where "done" lives, and the long window waits for a number.
     */
    const mine = this.ask;
    void this.speak([mine.hold ? voiceScript.holdNotHeard() : voiceScript.notHeard()], true).then(() => {
      if (this.mode === 'asking' && this.ask === mine && mine.silences === 2) this.openLongDone(true);
      else this.settleAudio();
    });
  }

  /**
   * ⛔ THE SET IS ASKED ABOUT AGAIN, NOT ABANDONED (2026-09-27, the voice walk). After the long window
   * the coach went quiet for good: an answer a minute later reached nobody, and with no set written no
   * rest ever began — she stood there with no clock and no voice. Now: "הסט עדיין פתוח. כמה חזרות
   * עשית?" ninety seconds later, twice at most. It asks; it never writes.
   */
  private scheduleReminder(): void {
    const s = this.setState;
    if (!s) return;
    const n = s.reminders ?? 0;
    if (n >= MAX_REMINDERS) return;
    s.reminders = n + 1;
    const key = s.key;
    this.after(WINDOWS.remind, () => {
      if (this.setState?.key === key && this.mode === 'set') this.askDone(true);
    });
  }

  private openLongDone(afterNotHeard = false): void {
    if (!this.ask) this.ask = { question: 'long_done', silences: 2 };
    this.ask.question = 'long_done';
    this.mode = 'asking';
    const mine = this.ask;
    const open = () => {
      if (this.mode !== 'asking' || this.ask !== mine) return this.settleAudio();
      this.openWindow(WINDOWS.longDone, (a, text, conf) => this.onDoneAnswer(a, text, conf), 'reps', (why) => this.onDoneWindowEnd(why));
    };
    // "לא שמעתי תשובה…" already said where done lives; open the window without a second line.
    if (afterNotHeard) return open();
    void this.speak([voiceScript.sayDoneWhenDone()], true).then(open);
  }

  // ── A round (a superset, a circuit) ───────────────────────────────────────────────────────────

  private onRoundAnswer(v: SessionView, a: VoiceAnswer | null): boolean {
    const ask = this.ask!;
    const r = ask.round!;
    const ids = r.steps.map((s) => s.exerciseId);
    const inEcho = ask.question === 'echo_round';
    const askReps = () => {
      void this.speak([voiceScript.askRepsRound(ids)], true);
      this.reopen(WINDOWS.reps);
      return true;
    };
    if (!a) return inEcho ? true : askReps();
    switch (a.kind) {
      case 'figures': {
        const reps = a.numbers.filter(validReps);
        if (reps.length === 0) return inEcho ? true : askReps();
        if (inEcho) {
          /*
           * A correction in the round's echo: every lift's number, in order, amended and said back.
           * ⛔ One number cannot say WHICH lift it corrects (2026-09-27, the voice fuzz: it silently
           * rewrote the first) — so she is asked for all of them; and the figures just said back are
           * agreement, not a correction.
           */
          if (reps.length < r.steps.length) return askReps();
          const next = reps.slice(0, r.steps.length);
          if (next.every((n, i) => n === r.reps[i])) return this.closeEcho();
          const fresh = this.d.getView() ?? v;
          next.forEach((n, i) => {
            const s = r.steps[i];
            fresh.amendSet(s.exerciseId, s.exerciseSetIndex, { weight: r.weights?.[i] ?? s.kg, reps: n });
            r.reps[i] = n;
          });
          this.sayRoundEcho(r);
          return false;
        }
        r.reps.push(...reps.slice(0, r.steps.length - r.reps.length));
        if (r.reps.length < r.steps.length) {
          // One number for two lifts: the first's — and the next one's, by name (spec §3.9).
          void this.speak([voiceScript.askRepsSecond(ids[r.reps.length])], true);
          this.reopen(WINDOWS.reps);
          return true;
        }
        void this.writeRound(v);
        return false;
      }
      case 'as_written':
        if (inEcho) return true;
        r.reps = r.steps.map((s) => s.lo);
        void this.writeRound(v);
        return false;
      case 'yes':
      case 'done':
        if (inEcho) return this.closeEcho();
        return askReps();
      case 'no':
        if (inEcho) return askReps();
        return this.stillLifting();
      case 'skip':
        return this.onSkip(v, false);
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

  private async writeRound(v: SessionView): Promise<void> {
    const r = this.ask?.round;
    if (!r) return;
    this.closeWindow();
    this.roundWrite = { steps: r.steps, reps: r.reps.slice(), weights: [], next: 0 };
    await this.continueRound(v);
  }

  /** Write the half on stage; the store presents the next one, and `onSetPresented` comes back here. */
  private continueRound(v: SessionView): Promise<void> {
    const run = this.writeRoundStep(v);
    this.writing = run;
    return run;
  }

  private async writeRoundStep(v: SessionView): Promise<void> {
    const w = this.roundWrite;
    if (!w) return;
    const i = w.next;
    const s = w.steps[i];
    if (!s || v.currentExerciseId !== s.exerciseId) {
      // The stage moved somewhere else (a tap, a swap): what was not written stays hers to write.
      this.roundWrite = null;
      this.ask = null;
      this.mode = 'set';
      return this.settleAudio();
    }
    const weight = v.currentTarget?.recommendedWeight ?? s.kg;
    const reps = w.reps[i];
    w.weights[i] = weight;
    w.next = i + 1;
    const last = w.next >= w.steps.length;
    if (last) this.roundWrite = null;
    this.voiceRows.add(rowKey(s.exerciseId, s.exerciseSetIndex));
    v.announceLoggedSet(weight, reps);
    const res = await v.completeSet({ weight, reps });
    if (!(res.ended || res.written)) {
      this.roundWrite = null;
      this.ask = null;
      this.mode = 'set';
      this.d.track?.('voice_write_refused', { exerciseId: s.exerciseId, round: true });
      return this.settleAudio();
    }
    this.confirmedLoad.set(s.exerciseId, weight);
    this.lastLoggedEx = s.exerciseId;
    this.d.track?.('voice_set_logged', { exerciseId: s.exerciseId, reps, weight, round: true });
    if (!last) return;
    this.persist();
    this.sayRoundEcho({ steps: w.steps, reps: w.reps.slice(), weights: w.weights.slice() });
  }

  private sayRoundEcho(r: RoundAsk): void {
    const l = this.d.locale();
    const items = r.steps.map((st, j) => ({ exerciseId: st.exerciseId, kg: r.weights?.[j] ?? st.kg, reps: r.reps[j] }));
    this.ask = { question: 'echo_round', silences: 0, round: r };
    const mine = this.ask;
    void this.speak([voiceScript.echoRound(items, l)], true).then(() => {
      if (this.ask === mine && this.on && this.d.getView()?.active) {
        this.openWindow(WINDOWS.echoTail, (a, text, conf) => this.onDoneAnswer(a, text, conf), 'reps', (why) => this.onDoneWindowEnd(why));
      } else if (this.ask === mine) {
        this.ask = null;
        this.releaseHeldRest(true);
      }
    });
  }

  // ── The write, the echo, the verdict, the rest ────────────────────────────────────────────────

  private complete(v: SessionView, weight: number | null, reps: number, conf: number | null): Promise<void> {
    const run = this.completeNow(v, weight, reps, conf);
    this.writing = run;
    return run;
  }

  private async completeNow(v: SessionView, weight: number | null, reps: number, conf: number | null): Promise<void> {
    const l = this.d.locale();
    if (conf != null && conf < CONFIDENCE_FLOOR && this.ask?.question !== 'confirm') {
      // Not sure what was heard: say it back with a question before writing anything.
      this.ask = { question: 'confirm', silences: this.ask?.silences ?? 0, noes: this.ask?.noes, unconfirmed: { weight, reps } };
      await this.speak([voiceScript.confirmHeard(weight, reps, l)], true);
      this.reopen(WINDOWS.confirm);
      return;
    }
    this.closeWindow();
    const ex = v.currentExerciseId!;
    const idx = v.globalProgress?.index ?? 0;
    const before = v.livePlan[idx] as Step | undefined;
    // Asked of the plan, not of `lastSetOfExercise` (a coach plan marks every superset half, and a lift
    // the board split comes back later): does this lift appear again today?
    const lastOfLift = !(v.livePlan as Step[]).slice(idx + 1).some((s) => s.exerciseId === ex && !s.warmup);
    // The record is asked BEFORE the write, against everything logged before this set (`priorPeakKg`)
    // — and only where there is a past to beat: on a lift's first day, set two heavier than set one is
    // the day finding her weight, not a record (`domain/setRecord`: "the beat speaks only when…").
    const record = !v.setLabel?.warmup && v.lastTime != null && isRecordSet(weight, reps, v.priorPeakKg);
    const ctx: EchoCtx = {
      ex,
      before,
      wasCalibration: this.calibrating === ex,
      lastOfLift,
      firstTime: v.lastTime == null,
      warmup: !!v.setLabel?.warmup,
      correctionsBefore: this.corrections.get(ex) ?? 0,
    };
    if (before) this.voiceRows.add(rowKey(ex, before.exerciseSetIndex));
    // The phone's "Set logged" beat, exactly as a tap on the stage plays it — a set said aloud looks
    // the same on every screen as a set pressed (founder, 2026-09-15).
    v.announceLoggedSet(weight, reps);
    const res = await v.completeSet({ weight, reps });
    /*
     * ⛔ ONLY WHAT THIS CALL WROTE IS SAID BACK (2026-09-27, the conductor audit). A second channel
     * that landed first (Done on the lock screen, the wrist) makes this write a refusal, and the voice
     * still said "…עשר חזרות. נרשם." and moved the next load by the reps IT heard, over a row that
     * says eight. That row is the truth; the voice says nothing it did not write.
     */
    if (!(res.ended || res.written)) {
      if (before) this.voiceRows.delete(rowKey(ex, before.exerciseSetIndex));
      this.ask = null;
      this.d.track?.('voice_write_refused', { exerciseId: ex });
      return this.settleAudio();
    }
    this.d.track?.('voice_set_logged', { exerciseId: ex, reps, weight, calibration: ctx.wasCalibration, record });
    if (record) this.records.add(ex);
    this.confirmedLoad.set(ex, weight);
    this.lastLoggedEx = ex;
    this.persist();
    if (ctx.wasCalibration) this.calibrating = null;
    const verdict = this.verdictFor(ctx, weight, reps, this.d.getView() ?? v);
    this.echoCtx = ctx;
    this.pendingMove = verdict.move;
    /*
     * The echo's tail: three seconds for "לא, עשר" (spec §3.5) — before the rest line, not under it.
     * ⛔ Not after a warm-up (2026-09-27, the voice fuzz): a bridge row is outside every decision and
     * cannot be amended (`amendSet` reads working sets), so "…שתים עשרה חזרות. נרשם." was said over a
     * correction that never landed.
     */
    if (ctx.warmup) {
      this.ask = null;
      await this.speak([voiceScript.echo(weight, reps, l)]);
      return;
    }
    this.ask = { question: 'echo', silences: 0, echoed: { weight, reps } };
    const mine = this.ask;
    await this.speak([voiceScript.echo(weight, reps, l), ...(record ? [voiceScript.record()] : []), ...verdict.lines], true);
    if (this.ask === mine && this.on && this.d.getView()?.active) {
      this.openWindow(WINDOWS.echoTail, (a, text, conf2) => this.onDoneAnswer(a, text, conf2), 'reps', (why) => this.onDoneWindowEnd(why));
    } else if (this.ask === mine) {
      this.ask = null;
      this.releaseHeldRest(true);
    }
  }

  /** A hold, ended by her word: written as she said it, said back, and the rest follows as after any set. */
  private completeHold(v: SessionView, seconds: number): Promise<void> {
    const run = this.completeHoldNow(v, seconds);
    this.writing = run;
    return run;
  }

  private async completeHoldNow(v: SessionView, seconds: number): Promise<void> {
    const l = this.d.locale();
    const ex = v.currentExerciseId;
    const asked = this.ask?.hold?.seconds;
    this.closeWindow();
    this.ask = null;
    const res = await v.completeItem(asked != null && seconds !== asked ? { seconds } : {});
    if (!(res.ended || res.written)) {
      this.d.track?.('voice_write_refused', { exerciseId: ex, hold: true });
      return this.settleAudio();
    }
    this.d.track?.('voice_hold_logged', { exerciseId: ex, seconds });
    if (ex) this.lastLoggedEx = ex;
    if (ex) await this.speak([voiceScript.holdEcho(exerciseDisplayName(ex), seconds, l)]);
  }

  /** The verdict — Loop 1, under the voice only (founder 2026-09-08; the stage stays a logger). */
  private verdictFor(ctx: EchoCtx, weight: number | null, reps: number, after: SessionView): { lines: string[]; move: { exerciseId: string; kg: number } | null } {
    const l = this.d.locale();
    const { ex, before } = ctx;
    const lines: string[] = [];
    let moved: number | null = null;
    if (weight != null && before?.target && !ctx.warmup) {
      if (ctx.wasCalibration) {
        const lo = before.target.repBandLo ?? before.target.recommendedReps;
        const e1rm = weight * (1 + reps / 30);
        const next = snapToStock(e1rm / (1 + lo / 30), exerciseById(ex)!);
        if (!ctx.lastOfLift && next !== weight) {
          // A calibration set has no range to be over or under — it is what taught the load.
          return { lines: [voiceScript.verdictCalibrated(ex, weight, next, l)], move: { exerciseId: ex, kg: next } };
        }
        if (ctx.lastOfLift) lines.push(voiceScript.learnedLift());
      } else if (!ctx.lastOfLift) {
        const prevReps = this.previousWorkingReps(after, ex, before.exerciseSetIndex);
        // One detent above last time, in KILOGRAMS — the detent is in her units (see "harder" above).
        const rail = after.lastTime?.loadKg != null ? after.lastTime.loadKg + kgFromDisplay(weightStepFor(l.units, exerciseById(ex)?.equipment), l.units) : null;
        const r = applyLoop1(after.livePlan as never[], before.globalIndex, weight, reps, ctx.correctionsBefore, undefined, rail, prevReps, ctx.firstTime);
        if (r.corrected && r.nextLoad != null && r.nextLoad !== weight) {
          moved = r.nextLoad;
          this.corrections.set(ex, ctx.correctionsBefore + 1);
        } else {
          this.corrections.set(ex, ctx.correctionsBefore);
        }
      } else if (ctx.firstTime) {
        /*
         * ⛔ NO PROMISE ABOUT NEXT TIME (2026-09-27, the voice walk). "בפעם הבאה נתחיל בשישים ושתיים
         * וחצי" was the last set's weight, and the next workout's load is the engine's fold of ALL her
         * sets (Loop 2: the median of the sets that reached the band, held, raised by her headroom, or
         * backed off) — 62.5×9, 62.5×8, 57.5×10 was promised 57.5 and would open at 62.5. What is true
         * at the end of a first lift is that it was learned.
         */
        lines.push(voiceScript.learnedLift());
      }
    }
    if (moved != null) {
      lines.push(moved > weight! ? voiceScript.verdictUp(ex, weight!, moved, l) : voiceScript.verdictDown(ex, weight!, moved, l));
    } else if (weight != null && !ctx.lastOfLift && !ctx.warmup) {
      lines.push(voiceScript.verdictHold());
    }
    return { lines, move: moved != null ? { exerciseId: ex, kg: moved } : null };
  }

  private previousWorkingReps(v: SessionView, ex: string, setIndex: number): number | null {
    const prev = v.loggedSets
      .filter((s) => s.exerciseId === ex && s.setIndex < setIndex && !s.isWarmup && !s.isApproach)
      .sort((a, b) => b.setIndex - a.setIndex)[0];
    return prev ? prev.actualReps : null;
  }

  /** A correction in the echo's tail: the row amended, said back — and the verdict computed again (2026-09-27). */
  private amendLast(v: SessionView, weight: number | null, reps: number): void {
    const l = this.d.locale();
    const row = v.loggedSets[v.loggedSets.length - 1];
    // Only a working row can be amended (`amendSet` reads the working sets of the block she is in).
    if (!row || row.isWarmup || row.isApproach) {
      this.closeEcho();
      return;
    }
    v.amendSet(row.exerciseId, row.setIndex, { weight, reps });
    this.confirmedLoad.set(row.exerciseId, weight);
    this.persist();
    const lines = [voiceScript.echo(weight, reps, l)];
    if (this.echoCtx && this.echoCtx.ex === row.exerciseId) {
      // "נעלה לארבעים ושתיים וחצי", then "לא, עשר": the move said a moment ago is replaced, aloud.
      const verdict = this.verdictFor(this.echoCtx, weight, reps, this.d.getView() ?? v);
      lines.push(...verdict.lines);
      if (this.heldRest) this.heldRest.move = verdict.move;
      else this.pendingMove = verdict.move;
    }
    this.ask = { question: 'echo', silences: 0, echoed: { weight, reps } };
    const mine = this.ask;
    void this.speak(lines, true).then(() => {
      if (this.ask === mine && this.on) {
        this.openWindow(WINDOWS.echoTail, (a, text, conf) => this.onDoneAnswer(a, text, conf), 'reps', (why) => this.onDoneWindowEnd(why));
      } else if (this.ask === mine) {
        this.ask = null;
        this.releaseHeldRest(true);
      }
    });
  }

  // ── The rest ──────────────────────────────────────────────────────────────────────────────────

  private onRest(v: SessionView): void {
    if (this.mode === 'rest') return;
    // The set was logged from another channel while the loading dialogue was open: Ready goes.
    if (v.awaitingReady || this.mode === 'loading') v.setAwaitingReady(false);
    const echoOpen = this.ask?.question === 'echo' || this.ask?.question === 'echo_reps' || this.ask?.question === 'echo_round';
    if (!echoOpen) {
      this.closeWindow();
      this.ask = null;
    }
    this.clearTimers();
    this.mode = 'rest';
    const l = this.d.locale();
    const row = v.loggedSets[v.loggedSets.length - 1];
    // Whoever wrote it, the row is the load the lift now stands at.
    if (row) {
      this.confirmedLoad.set(row.exerciseId, row.actualWeight);
      this.lastLoggedEx = row.exerciseId;
      this.persist();
    }
    // Re-entering a rest already under way (earbuds back, resume): what was said is not said
    // again — but the ten seconds are counted to the rest's own end instant (2026-09-15).
    if (this.reentry) {
      this.reentry = false;
      this.pendingMove = null;
      if (v.restEndsAtMs != null) this.scheduleTenSeconds(v);
      return;
    }
    const lines: string[] = [];
    // Reached without the voice having said the set (a tap on the stage, the lock screen or the
    // wrist): say it back first, so the flow never goes quiet. Only the row of the set JUST on
    // stage, and never after a hold or a distance — those write no reps row (2026-09-27: after a
    // plank the voice read back a set of an earlier lift).
    if (row && !this.stageItem && row.exerciseId === this.stageEx && !this.voiceRows.has(rowKey(row.exerciseId, row.setIndex))) {
      lines.push(voiceScript.echo(row.actualWeight, row.actualReps, l));
      // A record pressed on the lock screen or the wrist is a record all the same (the store's beat
      // asked the question before the write, against the same baseline the voice uses).
      const beat = v.watchLoggedSet;
      if (beat?.record && v.lastTime != null && beat.lift === row.exerciseId && beat.reps === row.actualReps && beat.weight === row.actualWeight) {
        lines.push(voiceScript.record());
        this.records.add(row.exerciseId);
      }
    }
    // "סיימת X. התרגיל הבא: Y" only when X is really over: between two rounds of a superset the
    // stage crosses lifts, but she is not done with the row — she is resting before round two.
    // (`lastSetOfExercise` cannot say it: a coach plan marks it wherever the NEXT step is another lift,
    // which is every half of a superset. The plan itself can — does the lift come back?) Asked of
    // the step just done, which the machine still sits on during its rest — a hold writes no row.
    const plan = v.livePlan as Step[];
    const doneAt = v.globalProgress?.index ?? -1;
    const done = plan[doneAt];
    const liftOver = !done || !plan.slice(doneAt + 1).some((s) => s.exerciseId === done.exerciseId);
    if (v.displayPhase === 'REST_TRANSITION' && v.nextExerciseId && v.currentExerciseId && liftOver) {
      // The next lift and its load, while she walks to it — and whether it is the day's last.
      const ahead = new Set(plan.slice(doneAt + 1).map((s) => s.exerciseId));
      const nextKg = v.nextItem && v.nextItem.kind !== 'reps' ? null : (v.nextTarget?.recommendedWeight ?? null);
      lines.push(voiceScript.liftDone(v.currentExerciseId, v.nextExerciseId, nextKg, ahead.size === 1, v.restSeconds, l));
    } else {
      lines.push(voiceScript.rest(v.restSeconds, l));
    }
    // The verdict's move lands on the fresh plan: the completed row is written, so the change
    // begins with the next set — and the loading dialogue at the rest's end names it (spec §3.2).
    const move = this.pendingMove && this.pendingMove.exerciseId === v.currentExerciseId ? this.pendingMove : null;
    this.pendingMove = null;
    if (echoOpen) {
      // ⛔ The echo's three seconds are HERS (2026-09-27, both audits): the rest line was spoken into
      // them, so a correction was never heard — and "מנוחה: שתי דקות" could be heard as "2". The
      // rest's lines and the move wait until the tail has closed.
      this.heldRest = { lines, move };
    } else {
      void this.speak(lines);
      if (move) v.setLiftLoad(move.kg);
    }
    this.scheduleTenSeconds(v);
  }

  /** The echo's tail closed: the move lands, and the rest's own lines are said while it is still a rest. */
  private releaseHeldRest(sayLines: boolean): void {
    const h = this.heldRest;
    this.heldRest = null;
    if (!h) return this.settleAudio();
    const v = this.d.getView();
    if (h.move && v) v.setLiftLoad(h.move.kg);
    const resting = v?.active && (v.displayPhase === 'REST_INTER' || v.displayPhase === 'REST_TRANSITION');
    if (sayLines && resting && h.lines.length > 0) void this.speak(h.lines);
    else this.settleAudio();
  }

  scheduleTenSeconds(v: Pick<SessionView, 'restSeconds' | 'restExtraSeconds' | 'restEndsAtMs'>): void {
    const total = v.restSeconds + (v.restExtraSeconds ?? 0);
    if (total < 20) return; // a short rest has no "ten seconds" (spec §3.6)
    /*
     * ⛔ COUNTED TO THE REST'S OWN END, NOT TO THE MOMENT THE VOICE LOOKED (sync audit, 2026-09-15).
     * The end instant is the store's, and it is the same one the ring, the wrist's GO and the lock
     * card count to.
     */
    const endMs = v.restEndsAtMs ?? this.d.now() + total * 1000;
    const inMs = endMs - 10_000 - this.d.now();
    if (inMs < 0) return; // already inside the last ten seconds — a late "ten seconds" is a wrong one
    this.after(inMs, () => {
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

  private onPaused(_v: SessionView): void {
    this.closeWindow();
    this.clearTimers();
    this.heldRest = null;
    this.pausedAtMs = this.d.now();
    this.ask = { question: 'paused', silences: 0 };
    this.mode = 'paused';
    void this.speak([voiceScript.paused()], true).then(() => this.listenForResume(true));
  }

  /**
   * "המשך" — one minute of the earbuds' microphone at most (it holds her music at call quality);
   * the phone's own microphone costs nothing and listens for as long as the pause lasts.
   */
  private listenForResume(first: boolean): void {
    if (this.mode !== 'paused') return;
    if (this.earDown || (!first && !this.d.earIsFree?.())) return this.settleAudio();
    this.openWindow(
      WINDOWS.paused,
      (a) => {
        if (a?.kind === 'resume' || a?.kind === 'ready') {
          this.d.getView()?.resume();
          return false;
        }
        return true;
      },
      'resume',
      (why) => {
        if (this.mode !== 'paused') return;
        if (why === 'timeout' || why === 'silence') this.listenForResume(false);
        else this.settleAudio();
      },
    );
  }

  private onResumed(): void {
    this.closeWindow();
    this.ask = null;
    // A pause freezes the set: its question moves by the pause, so she is not asked "סיימת?" the
    // moment she picks the bar back up (2026-09-27).
    if (this.pausedAtMs != null && this.setState?.askDueMs != null) this.setState.askDueMs += this.d.now() - this.pausedAtMs;
    this.pausedAtMs = null;
    this.mode = 'idle';
    this.lastPhase = null; // re-enter the phase she is in
    this.reentry = true;
    void this.speak([voiceScript.resumed()]);
  }

  // ── Plumbing ──────────────────────────────────────────────────────────────────────────────────

  /**
   * Ear failure, decided once (2026-09-27): a locked phone or a refused microphone is an ear that
   * cannot hear from here; two errors in a row are too. Said ONCE a workout ("אני לא שומעת אותך
   * כרגע…"), and from then on the lines go on and no window is tried until the ear may listen again.
   */
  private earFailed(why: WindowEnd): boolean {
    if (why === 'locked' || why === 'denied') return this.earWentDown(why);
    if (why === 'error') {
      this.earErrors += 1;
      if (this.earErrors >= 2) return this.earWentDown(why);
    }
    return false;
  }

  private earWentDown(why: WindowEnd): true {
    if (!this.earDown) this.d.track?.('voice_ear_down', { why });
    this.earDown = true;
    if (!this.cantHearSaid) {
      this.cantHearSaid = true;
      void this.speak([voiceScript.cantHear()]);
    }
    return true;
  }

  /** One voice: every `speak` waits for the one before it, so lines land in the order they were decided. */
  private chain: Promise<void> = Promise.resolve();

  private speak(lines: string[], keepDucked = false, chime = false): Promise<void> {
    if (!this.on || this.interrupted || lines.length === 0) return this.chain;
    // Every line of this utterance starts on its way in the natural voice now — the verdict fetches
    // while the echo plays, and nothing waits twice.
    this.d.mouth.warm?.(lines, this.d.locale().locale);
    this.queued += 1;
    const run = async () => {
      try {
        if (!this.on || this.interrupted) return;
        this.speaking += 1;
        try {
          // While a window is open the recognizer owns the session (record + play, her music already
          // ducked); switching the category under it would end the recording mid-answer.
          if (!this.window) await this.d.audio.duck();
          // ⛔ The rest's end: the chime FIRST, and the line only once it has sounded (2026-09-27).
          if (chime && this.on) await this.d.audio.playChime();
          const locale = this.d.locale().locale;
          for (const line of lines) {
            if (!this.on || this.interrupted) break; // earbuds out, a call: the rest is not played
            await this.d.mouth.say(line, locale);
          }
        } finally {
          this.speaking -= 1;
          this.lastSpokeEndMs = this.d.now();
          this.lastSpoken = lines;
        }
      } finally {
        this.queued -= 1;
      }
      if (!keepDucked && this.speaking === 0 && this.queued === 0 && !this.window) await this.d.audio.unduck();
    };
    this.chain = this.chain.then(run, run);
    return this.chain;
  }

  /** The music back — once nothing is queued and no window listens (a tap, a closed question). */
  private settleAudio(): void {
    void this.chain.then(() => {
      if (this.on && !this.window && this.queued === 0 && this.speaking === 0) void this.d.audio.unduck();
    });
  }

  /**
   * The app's own line, heard back through the microphone: a sentence that lands while a line plays,
   * or an unrecognisable one in the second after it.
   *
   * ⚠️ NOT "anything contained in the last line" — tried 2026-09-27 and withdrawn the same day: her
   * "מוכן" said the moment "…תגיד: מוכן" ends IS contained in it, and dropping the real answer is
   * worse than the risk it guarded (headsets cancel their own echo on the call profile, and the
   * phone's microphone in a pocket does not hear the earbuds). The one line that WAS dangerous — the
   * rest line said into the echo's open tail — is no longer said there at all (`heldRest`).
   */
  private isBleed(_text: string, a: VoiceAnswer | null): boolean {
    if (this.speaking > 0) return true;
    return a == null && this.d.now() - this.lastSpokeEndMs < BLEED_MS;
  }

  private openWindow(
    ms: number,
    onAnswer: (a: VoiceAnswer | null, text: string, confidence: number | null) => boolean,
    expect: HearExpect,
    onEnd: (why: WindowEnd) => void,
  ): void {
    if (!this.on || this.interrupted) return;
    // Nothing can hear her from here: the question's own end, at once — never a window that moves
    // her earbuds to call quality for nothing.
    if (this.earDown) return onEnd('locked');
    this.closeWindow();
    let closed = false;
    let handle: EarWindow | null = null;
    handle = this.d.ear.open({
      locale: this.d.locale().locale,
      ms,
      hints: VOICE_HINTS,
      expect,
      onSentence: (text, confidence) => {
        const a = parseVoiceAnswer(text);
        if (this.isBleed(text, a)) return true;
        this.d.track?.('voice_heard', { kind: a?.kind ?? 'none', confidence });
        return onAnswer(a, text, confidence);
      },
      onEnd: (why) => {
        if (closed) return;
        closed = true;
        // A late end of an older window never clears the one open now.
        if (this.window === handle) this.window = null;
        if (why === 'heard') this.earErrors = 0;
        if (why !== 'closed') this.settleAudio();
        onEnd(why);
      },
    });
    this.window = handle;
  }

  /**
   * The follow-up's window, counted from the END of the line that asks it (2026-09-27).
   *
   * ⛔ Every caller has just queued that line ("כמה חזרות?", "לא הבנתי…"), and this used to open the
   * window at once: the four seconds ran while the app was still speaking — and every word she said
   * during it is dropped as the app's own bleed — so she was left about one second to answer. The
   * open window is HELD (still hearing, not counting) and its clock restarts when the line is said;
   * a window that cannot be held is replaced after the line.
   */
  private reopen(ms: number): void {
    const w = this.window;
    const ask = this.ask;
    if (w?.hold && w.extend) w.hold();
    else this.closeWindow();
    void this.chain.then(() => {
      if (!this.on || this.ask !== ask) return;
      if (w && this.window === w && w.extend) return w.extend(ms);
      if (!this.window) this.openWindow(ms, (a, text, conf) => this.onDoneAnswer(a, text, conf), 'reps', (why) => this.onDoneWindowEnd(why));
    });
  }

  /**
   * ⛔ A WINDOW CLOSED BY THE VOICE GIVES HER MUSIC BACK (2026-09-27, the voice fuzz). A window ended
   * by itself settles the audio (`openWindow`'s `onEnd`); one the conductor closed — a call, a tap
   * that started the set, a skip — left the duck on until some later line happened to release it.
   * `settleAudio` waits for whatever is queued, so a line said right after the close keeps the duck.
   */
  private closeWindow(): void {
    const w = this.window;
    this.window = null;
    if (w) {
      w.close();
      this.settleAudio();
    }
  }

  /** The loading window, given its full time again once the line answering her has been said. */
  private relisten(ms: number): void {
    const w = this.window;
    if (!w?.hold || !w.extend) return;
    w.hold();
    void this.chain.then(() => {
      if (this.window === w) w.extend!(ms);
    });
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
