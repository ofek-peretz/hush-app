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
import { VOICE_BUFFER_S, voiceAskAfterS, voiceReportFromS } from '@/domain/setDwell';
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
    /** Nobody is waiting on a clock for her word: only a voice clearly above the room is sent anywhere (`voiceCapture`). */
    patient?: boolean;
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
/**
 * What survives the app being killed mid-workout: whether the opening was said, the loads she
 * confirmed — and (2026-10-05) where the set on stage stood: begun or still being loaded, when its
 * question is due and from when her own report counts.
 *
 * ⛔ WITHOUT THE SET, A KILL STARTED IT OVER. The voice came back with "חזרתי" and called the set
 * he was in the middle of as if it had not begun: "סט ראשון מתוך שלושה", its clock from zero — so
 * the reps he said as he racked the bar, seconds after reopening the app, were "too soon for a set"
 * and dropped without a word (`theVoiceSurvivesThePhone`).
 */
export interface VoicePersisted {
  startedAtMs: number;
  confirmed: [string, number | null][];
  set?: { key: string; started: boolean; askDueMs: number | null; reportFromMs: number | null; soft?: boolean } | null;
  /** The workout was paused at this instant when it was written: the set's clocks stood still from here. */
  pausedAtMs?: number | null;
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
  /**
   * ⛔ `false`: the workout holds no microphone at all (`platform/voice/workoutMicrophone`). The coach
   * speaks, no window is ever opened, and NOTHING IS SAID ABOUT IT — it is how the workout is held,
   * not a fault to apologise for. Absent = it listens (every law that walks the ear).
   */
  hearsHer?: () => boolean;
  /** Keep what must survive a killed app (see `VoicePersisted`). */
  persist?: (p: VoicePersisted) => void;
  /**
   * The verdict after a set — Loop 1 moving the NEXT set's load inside the workout, and the line that
   * says so ("אותו משקל.", "תוסיף קילו ורבע בכל צד."). ⛔ OFF unless set (founder, 2026-10-06 — see
   * `verdictFor`): the app ships without it, and the laws that still walk it pass `true`.
   */
  verdictInWorkout?: boolean;
}

/** A line about a set already written: said whatever has happened since (see `speak`). */
const SAID_TO_THE_END = (): boolean => true;

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

/**
 * ⛔ A PAUSE IS NOT LISTENED TO FOR EVER (2026-10-05). On the phone's own microphone the pause was
 * listened to "for as long as it lasts", a minute at a time — written when a window cost nothing.
 * Since the strong ear hears every window, a ten-minute pause was ten minutes of whatever was said
 * near the phone, sent on every few seconds: his call, his talk with a friend, at his cost. Now:
 * the first minute as attentive as any question; after it only a voice clearly above the room is
 * sent anywhere (`patient`); and past this, nothing listens — he comes back by a button (the stage,
 * the lock screen, the wrist), and the voice is whole the moment he does.
 */
export const PAUSE_LISTEN_MS = 5 * 60_000;

/**
 * ════ ⛔ HER WORD ENDS A REST (founder, 2026-10-06: *"אי אפשר לקצר את המנוחה במלל במידה ואני רוצה?"*) ════
 *
 * Nothing listened during a rest at all — the one stretch of the workout where "מוכן" had no ear, and
 * the only way to start early was the phone. Now, on a microphone that costs her music nothing, the
 * rest is listened to: "מוכן" / "קדימה" / "דלג" ends it and the next set is called at once (a set she
 * is continuing STARTS on that word — "קדימה." — with no second "מוכן"); "עצור" pauses.
 *
 * ⚠️ PATIENT, AND ONLY PATIENT. A rest is when people talk. This window is never sent anywhere on a
 * timer — only a voice clearly above the room is (`voiceCapture`'s patient window) — so a quiet
 * "מוכן" in a loud room may not be heard, and then the rest simply ends when it ends. It closes a
 * little before the rest's own end, so the chime and the call are never said into an open question.
 */
const REST_EAR_LEAD_MS = 2_000;
const REST_EAR_MIN_MS = 6_000;

/**
 * ════ ⛔ NO "מוכן" — THE SET IS CALLED, SHE LIFTS, SHE SAYS HER REPS (founder, 2026-10-06) ════
 *
 *   > *"אני לא חושב שצריך לחכות למוכן, אלא רק להגיד בתחילת האימון הראשון בלבד שצריך לומר רק את מספר
 *   > החזרות בסוף כל סט והבינה תרשום וזהו. בלי להגיד מוכן ובלי להוסיף פקד של מוכן במסכים. … הסוד הוא
 *   > כמה שפחות מלל. בדיוק כמו ב-WAZE — בעוד X מטרים פנה ימינה וזהו."*
 *
 * One day after "מוכן" was put before every set, he trained with it: a word to say to a coach who
 * could not always hear it, a second voice line in answer ("קדימה."), a Ready button on three
 * surfaces — all so the coach could know when a set began. Waze does not ask whether you have
 * pulled out of the parking spot. So a set is called and is simply hers: the coach takes it to have
 * begun when the call ends (plus, on a lift's first set, a moment to get under the bar), listens for
 * her number from the time a set could be over, and asks "כמה חזרות?" only if none came.
 *
 * The one step that still has a start is a HOLD: a plank counted aloud needs an instant to count from.
 */
export const FIRST_SET_SETUP_S = 20;

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
/**
 * A bare number said while a set is under way waits this long before it is her report: a count on
 * the way to the last rep ("שש… שבע… שמונה") is replaced by the number after it, and only the last
 * one is written. A number said AS a report ("עשר חזרות", "סיימתי") does not wait.
 */
export const REPORT_SETTLE_MS = 2_000;
/** The set's own window stays open this much past the moment the question is due, so the two never leave a gap. */
const SET_WINDOW_TAIL_MS = 3_000;

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
  /** When the loading dialogue on stage was opened — a number said sooner than a set takes cannot be its reps. */
  private loadingSinceMs = 0;
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
  private setState: {
    key: string;
    started: boolean;
    askDueMs: number | null;
    reminders?: number;
    /** From when a number she says can be her reps (`voiceReportFromS`) — null where a set is not reported unprompted (a round, a hold). */
    reportFromMs?: number | null;
    /** A set the coach has ASSUMED will begin at the rest's end if she does not say "מוכן" (see `nextSet`). */
    soft?: boolean;
  } | null = null;
  /** A bare number she said during the set, held a beat in case the next number replaces it (`REPORT_SETTLE_MS`). */
  private pendingReport: { key: string; weight: number | null; reps: number; conf: number | null } | null = null;
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
  private earDownWhy: WindowEnd | null = null;
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
  /** She ended the rest with her own word: the set after it is called without the bell. */
  private restCut = false;
  /** "האימון מושהה" was really said for the pause she is in (or has just left). */
  private pauseSaid = false;

  constructor(private readonly d: ConductorDeps) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────────────────────────

  /** Earbuds in and the switch on: the voice takes the session from where it stands. */
  enable(): void {
    if (this.on) return;
    this.on = true;
    this.shutEarByDesign();
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
    this.pendingReport = null;
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

  /** The workout holds no microphone (`ConductorDeps.hearsHer`). */
  private earless(): boolean {
    return this.d.hearsHer?.() === false;
  }

  /**
   * ⛔ NO MICROPHONE, AND NOT A WORD ABOUT IT (2026-10-10). The ear is down exactly as it is when she
   * refuses the microphone — the lines go on, a set's question becomes where to mark it — but "אני
   * לא שומעת אותך כרגע" is never said: nothing is wrong, and a coach that opens every workout with an
   * apology is the opposite of *"כמה שפחות מלל"*.
   */
  private shutEarByDesign(): void {
    if (!this.earless()) return;
    if (!this.earDown) this.d.track?.('voice_ear_down', { why: 'no_microphone' });
    this.earDown = true;
    this.earDownWhy = 'denied';
    this.cantHearSaid = true;
  }

  /** Mid-workout after the app was killed: whether the opening was said, the loads she stood at, and the set she was in. */
  restore(p: VoicePersisted | null): void {
    if (!p) return;
    this.announcedStart = p.startedAtMs;
    this.confirmedLoad = new Map(p.confirmed);
    // The set on stage as it stood: `enable` re-enters it (`resumeSet`) if it is still the one on stage.
    if (p.set) this.setState = { ...p.set };
    /*
     * ⛔ KILLED WHILE PAUSED (2026-10-06, found by `theVoiceSurvivesThePhone`). Reopening the app
     * un-freezes the workout (the store's own rule) — but "המשך" never ran, so the set's question
     * was still due where it stood before the pause: two minutes after pausing five seconds into a
     * set, the coach came back with "חזרתי." and, a second later, "כמה חזרות?". The time the workout
     * stood still is given back to the set here, exactly as "המשך" gives it.
     */
    if (p.pausedAtMs != null && this.setState) {
      const stoodStill = Math.max(0, this.d.now() - p.pausedAtMs);
      if (this.setState.askDueMs != null) this.setState.askDueMs += stoodStill;
      if (this.setState.reportFromMs != null) this.setState.reportFromMs += stoodStill;
    }
  }

  /** A call, Siri or an alarm holds the audio — and nothing has said it ended (see `useVoiceCoach`). */
  isInterrupted(): boolean {
    return this.interrupted;
  }

  /** Why the ear is down right now — null while it listens. `deaf` is the one that heals by itself (`useVoiceCoach`). */
  earDownBecause(): WindowEnd | null {
    return this.earDown ? this.earDownWhy : null;
  }

  /** Back on glass, the phone's microphone opened, or the strong ear's wait is over: windows may be tried again. */
  earMayListen(): void {
    if (!this.earDown || this.earless()) return;
    this.earDown = false;
    this.earDownWhy = null;
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
      this.armSetWindow();
    } else if (this.mode === 'rest') {
      this.scheduleTenSeconds(v);
      this.listenInRest();
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
    this.pendingReport = null;
    // A new workout tries to listen again, and says so again if it cannot.
    this.earDown = false;
    this.earDownWhy = null;
    this.earErrors = 0;
    this.cantHearSaid = false;
    this.shutEarByDesign();
    this.persist();
    const l = this.d.locale();
    const lines: string[] = [];
    // The one sentence of the first workout says where a set is told: aloud, or — with no microphone — marked.
    if (this.d.firstSessionEver()) lines.push(this.earless() ? voiceScript.openFirstSessionMark() : voiceScript.openFirstSession());
    const first = v.sessionExerciseIds[0] ?? v.currentExerciseId;
    if (first) lines.push(voiceScript.openSession(v.workoutName ?? '', v.sessionExerciseIds.length, this.estimateMinutes(v), l));
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
    const s = this.setState;
    this.d.persist?.({
      startedAtMs: this.announcedStart,
      confirmed: [...this.confirmedLoad],
      set: s ? { key: s.key, started: s.started, askDueMs: s.askDueMs, reportFromMs: s.reportFromMs ?? null, ...(s.soft ? { soft: true } : {}) } : null,
      pausedAtMs: this.pausedAtMs,
    });
  }

  /** The set on stage, where it stands — and written down, so a killed app comes back into it. */
  private setSet(s: NonNullable<VoiceConductor['setState']>): void {
    this.setState = s;
    this.persist();
  }

  // ── The set ───────────────────────────────────────────────────────────────────────────────────

  private onSetPresented(v: SessionView, setChanged: boolean): void {
    // A round the voice is writing, half by half: the next half is on stage — write it now.
    if (this.roundWrite) return void this.continueRound(v);
    // The rest just ended: the chime sounds before whatever is said next (spec §3.6) — the next
    // set's line, or the loading dialogue of a lift or a changed load. Not when SHE ended it: her own
    // word needs no bell, and a set she is simply continuing starts on it (`listenInRest`).
    const cut = this.restCut && this.mode === 'rest';
    this.restCut = false;
    const fromRest = this.mode === 'rest' && !cut;
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
    this.pendingReport = null;
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
      this.setSet({ key: key ?? '', started: true, askDueMs: null });
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
        // Said once: these are the loads the round now stands at.
        for (const st of chain.steps) this.confirmedLoad.set(st.exerciseId, st.kg);
        this.persist();
        return this.callSet(v, [voiceScript.roundLoading(chain.steps, l)], fromRest, FIRST_SET_SETUP_S);
      }
      // Rounds 2+ at the loads already out.
      return this.callSet(v, setChanged ? [voiceScript.roundStart(n, m, l)] : [], fromRest, 0);
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
      else if (loadChanged && confirmed != null && kg != null) line = voiceScript.loadChanged(ex, kg, n, m, warmup, l);
      else if (firstTime && !known) line = voiceScript.loadFirstTime(ex, kg, lo, hi, l);
      else line = voiceScript.loadCalibrated(ex, kg, lo, hi, l);
      this.skipFrom = null;
      // Said once: this is the load the lift now stands at (it used to be "מוכן" that wrote it down).
      this.confirmedLoad.set(ex, kg);
      this.persist();
      return this.callSet(v, [line], fromRest, FIRST_SET_SETUP_S);
    }

    // Sets 2+ at the same load.
    this.callSet(v, setChanged ? [voiceScript.setStart(n, m, warmup, l)] : [], fromRest, 0);
  }

  /**
   * A set, called (see `FIRST_SET_SETUP_S`): its line, and from the end of that line it is under way —
   * her report is listened for from the time a set could be over (`armSetWindow`, on a microphone
   * that costs her music nothing), and "כמה חזרות?" comes at the set's own time if she said nothing.
   *
   * (2026-10-05, for one day: every set waited to be started with "מוכן" — "the same five beats". The
   * founder trained with it and struck the second beat the next morning.)
   */
  private callSet(v: SessionView, lines: string[], chime: boolean, setupS: number): void {
    const key = stepKeyOf(v) ?? '';
    this.mode = 'set';
    // Hers from the first word of the call: a killed app, a call, earbuds coming back all re-enter THIS set.
    this.setSet({ key, started: true, askDueMs: null });
    // Called only while it is still the set on stage: a set already marked, a pause, an ended workout are not called.
    void this.speak(lines, false, chime, () => this.inSet(key)).then(() => {
      const now = this.d.getView();
      if (!now || !this.on || this.mode !== 'set' || this.setState?.key !== key || stepKeyOf(now) !== key) return;
      this.scheduleAsk(now, this.d.now() + setupS * 1000);
    });
  }

  /** Still inside the set `key` — on stage, not paused, not ended: what a line about THIS set must be true of. */
  private inSet(key: string | null | undefined): boolean {
    const now = this.d.getView();
    if (this.mode !== 'set' || !now?.active || now.paused || now.displayPhase !== 'SET_PRESENTED') return false;
    return key == null || (this.setState?.key === key && stepKeyOf(now) === key);
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
      // A hold still waiting for its start: its line was said; the window opens again under a short prompt.
      if (this.holdOnStage(v)) return this.openLoading(v, [voiceScript.readyPrompt()]);
      s.started = true; // a set is hers from its call — there is nothing left to wait for
    }
    this.mode = 'set';
    // A hold back from a pause: its question and its ten seconds follow the store's clock, which
    // moved by exactly the time stood still (2026-09-28) — never a clock of the voice's own.
    const hold = this.holdOnStage(v);
    if (hold && v.holdEndsAtMs != null) {
      s.askDueMs = v.holdEndsAtMs;
      this.persist();
      this.scheduleHoldTen(v.holdEndsAtMs, hold.seconds);
    }
    if (s.askDueMs == null) {
      // Called, and cut off before its clock was set (the app killed mid-line): the clock starts here.
      if (!hold && v.currentTarget) return this.scheduleAsk(v, this.d.now());
      return this.settleAudio();
    }
    this.after(Math.max(1_500, s.askDueMs - this.d.now()), () => this.askDone());
    this.armSetWindow();
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

  /** The one step that waits for a start: a hold (see `FIRST_SET_SETUP_S`). */
  private openLoading(v: SessionView, lines: string[], chime = false): void {
    this.mode = 'loading';
    this.loadingSinceMs = this.d.now();
    const key = stepKeyOf(v) ?? '';
    this.setSet({ key, started: false, askDueMs: null });
    this.pendingReport = null;
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
          this.setSet({ key, started: false, askDueMs: this.d.now() + inMs });
          this.after(inMs, () => this.askDone());
        }
      });
      this.after(WINDOWS.loadingPrompt, () => {
        if (this.mode === 'loading' && this.window) void this.speak([voiceScript.readyPrompt()], true);
      });
    });
  }

  /**
   * ════ ⛔ SHE REPORTS; THE COACH DOES NOT MAKE HER WAIT TO BE ASKED (founder, 2026-10-05) ════
   *
   * "כמה חזרות?" was fired by an estimate — her reps at the stage figure's tempo, plus fifteen
   * seconds. The coach cannot see the bar go back on the rack; a set done in twenty-five seconds
   * waited twenty more for the question, and a slow one was asked mid-rep. Waze knows where the car
   * is. The gym's version of that is her own voice: she racks the bar and says "עשר", and the coach
   * answers at once. The question stays — as what it should have been all along, the fallback for a
   * set she finished and said nothing about.
   *
   *   · NOT BEFORE A SET COULD BE OVER. The window opens at `voiceReportFromS` — before it nothing
   *     listens at all, so a count started aloud, a word to a friend, a breath, are never even heard.
   *   · A COUNT IS NOT A REPORT. A bare number waits `REPORT_SETTLE_MS`; the number after it replaces
   *     it ("שש… שבע… שמונה" writes eight, once). Said as a report — "עשר חזרות", a load and reps,
   *     "סיימתי" — it does not wait.
   *   · NOTHING ELSE CHANGES: the write, the echo, the three seconds for "לא, תשע", the verdict and
   *     the rest are the asked answer's own road (`complete`). An unsure hearing is still said back
   *     with "נכון?" before anything is written.
   *   · A NOISE IS NOT AN ANSWER, and here it is not even a "לא הבנתי": she is lifting.
   */
  private armSetWindow(): void {
    const s = this.setState;
    if (!s || !s.started || s.askDueMs == null || s.reportFromMs == null) return;
    // Only a microphone that costs her music nothing listens through a set.
    if (this.earDown || !this.d.earIsFree?.()) return;
    const key = s.key;
    this.after(Math.max(0, s.reportFromMs - this.d.now()), () => {
      const cur = this.setState;
      if (!this.on || this.interrupted || this.mode !== 'set' || !cur || cur.key !== key || cur.askDueMs == null) return;
      const ms = cur.askDueMs - this.d.now() + SET_WINDOW_TAIL_MS;
      if (ms < 2_000) return;
      // Patient from its first second: she is under the bar, and nobody asked anything.
      this.openWindow(
        ms,
        (a, _text, conf) => this.onSetReport(key, a, conf),
        'set',
        (why) => {
          if (why === 'heard' || why === 'closed' || why === 'unavailable') return;
          this.earFailed(why);
        },
        true,
      );
    });
  }

  private onSetReport(key: string, a: VoiceAnswer | null, conf: number | null): boolean {
    const v = this.d.getView();
    const s = this.setState;
    if (!v || !s || s.key !== key || (this.mode !== 'set' && this.mode !== 'loading')) return false;
    if (!a) return true; // an effort, a plate, the next rack: she is lifting
    const ahead = this.roundAhead(v);
    if (ahead) return this.onRoundReport(v, ahead, a);
    const planned = v.currentTarget?.recommendedWeight ?? null;
    switch (a.kind) {
      case 'figures': {
        const two = a.numbers.length >= 2;
        const reps = two ? a.numbers[1] : a.numbers[0];
        // A load alone, or "ten a side", is not a report of a set; a number that cannot be reps is noise.
        if (!validReps(reps) || a.perSide || (!two && a.saysKg && !a.saysReps)) return true;
        const weight = two ? toKg(a.numbers[0], a.lb) : planned;
        if (two || a.saysReps) return this.takeReport(v, weight, reps, conf);
        this.holdReport(key, weight, reps, conf);
        return true;
      }
      case 'done': {
        // "סיימתי" after a number is that number; alone, it is the cue for the one question left.
        const held = this.pendingReport;
        if (held && held.key === key) return this.takeReport(v, held.weight, held.reps, held.conf);
        if (v.setLabel?.warmup) return this.takeReport(v, planned, v.currentTarget?.recommendedReps ?? 0, 1);
        this.clearTimers();
        this.askDone();
        return false;
      }
      case 'as_written':
        return this.takeReport(v, planned, v.currentTarget?.repBandLo ?? v.currentTarget?.recommendedReps ?? 0, 1);
      case 'skip':
        return this.onSkip(v, false);
      case 'pause':
        v.pause();
        return false;
      case 'finish':
        void this.speak([voiceScript.finishOnPhone()], true);
        return true;
      default:
        return true; // "כן", "לא", "מוכן" in the middle of a set answer nothing
    }
  }

  /**
   * A round reported before its question (2026-10-05): every lift's number at once ("חמש עשרה ושתים
   * עשרה"), or "סיימתי" — which brings the round's one question now instead of at its estimate. A
   * lone number in the middle of a round is a count, or the first lift's own; it waits for the
   * question, which asks for them in order.
   */
  private onRoundReport(v: SessionView, ahead: RoundStep[], a: VoiceAnswer): boolean {
    switch (a.kind) {
      case 'figures':
        if (a.saysKg || a.perSide || a.numbers.filter(validReps).length < ahead.length) return true;
        break;
      case 'done':
        this.clearTimers();
        this.askDone();
        return false;
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
    // The round's own answer, taken exactly as if its question had just been asked.
    this.closeWindow();
    this.clearTimers();
    if (v.awaitingReady) v.setAwaitingReady(false);
    this.lastAwaiting = false;
    this.mode = 'asking';
    this.ask = { question: 'round', silences: 0, noes: 0, round: { steps: ahead, reps: [] } };
    this.d.track?.('voice_set_reported', { asked: false, round: ahead.length });
    this.onRoundAnswer(v, a);
    return false;
  }

  /** Her report is the answer: the due question is not asked, and the set is written the asked answer's own way. */
  private takeReport(v: SessionView, weight: number | null, reps: number, conf: number | null): boolean {
    this.pendingReport = null;
    this.clearTimers();
    // A set reported is a set begun, with or without "מוכן": the Ready it still offered goes.
    if (v.awaitingReady) v.setAwaitingReady(false);
    this.lastAwaiting = false;
    this.mode = 'asking';
    this.ask = { question: 'done', silences: 0 };
    this.d.track?.('voice_set_reported', { asked: false });
    void this.complete(v, weight, reps, conf);
    return false;
  }

  /** A bare number during the set: held a beat — the next number replaces it, silence makes it hers. */
  private holdReport(key: string, weight: number | null, reps: number, conf: number | null): void {
    const mine = { key, weight, reps, conf };
    this.pendingReport = mine;
    this.after(REPORT_SETTLE_MS, () => {
      if (this.pendingReport !== mine) return; // a later number took its place: she was counting
      const v = this.d.getView();
      const s = this.setState;
      if (!v || !s || s.key !== key || (this.mode !== 'set' && this.mode !== 'loading') || v.displayPhase !== 'SET_PRESENTED' || v.paused) {
        this.pendingReport = null;
        return;
      }
      this.closeWindow();
      this.takeReport(v, weight, reps, conf);
    });
  }

  /** A load said back in the loading dialogue: the window listens on for "מוכן" (or another load). */
  private loadSaid(v0: SessionView, line: string): boolean {
    if (this.setState?.soft) {
      // She changed the bar on a set the coach had taken to be simply continuing: now it waits for
      // her word, like any set whose load she has to set up.
      this.closeWindow();
      this.clearTimers();
      this.openLoading(this.d.getView() ?? v0, [line]);
      return false;
    }
    void this.speak([line], true);
    this.relisten(WINDOWS.loading);
    return true;
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
        const style = loadStyleOf(ex);
        const loadless = cur == null || style === 'bodyweight' || style === 'band';
        const plausible = (kg: number) => cur != null && cur > 0 && kg >= cur * LOAD_PLAUSIBLE.below && kg <= cur * LOAD_PLAUSIBLE.above;
        /*
         * ⛔ ON A BAR, HER NUMBER MAY BE ONE SIDE OF IT (2026-10-05). The coach now says a bar by what
         * goes on each side ("עשרה קילו בכל צד"), so that is how she answers: "חמש עשרה בכל צד" is the
         * bar plus thirty. And a number with no "בכל צד" is read the way that makes sense of it — the
         * total if only the total could be this bar, a side if only a side could, and when both could,
         * the smaller change from what is loaded (people move a bar by a plate, not by half). Whichever
         * it was, the echo says both figures, so a wrong reading is heard and corrected in one word.
         */
        const plated = !!exo && (style === 'barbell' || style === 'plate_loaded');
        const asTotal = toKg(n, a.lb);
        const asSide = plated ? emptyBarKg(exo!.equipment) + 2 * toKg(n, a.lb) : null;
        const away = (kg: number) => (cur != null && cur > 0 && kg > 0 ? Math.abs(Math.log(kg / cur)) : Infinity);
        const readAsSide =
          asSide != null && !two && !a.saysReps &&
          (a.perSide === true || (plausible(asSide) && (!plausible(asTotal) || away(asSide) < away(asTotal))));
        const asKg = asTotal;
        const plausibleLoad = plausible(asTotal);
        const repsLike = validReps(n) && n <= MAX_REPS_IN_LOADING;
        /*
         * A bare number that fits ONLY as a side — is it a load, or the reps of a set she did without
         * saying "מוכן"? The clock says: a set cannot be over sooner than `voiceReportFromS`. Inside
         * that time since the set was called, the number is the bar. (A number that fits as a total
         * too is a load either way — the only question was which.) ⚠️ The same instant from which a
         * number is heard as her report everywhere else — with "מוכן" asked of every set, a set begun
         * without the word and reported with one ("עשר") must never move the bar instead.
         */
        const tooSoonForASet = this.d.now() - this.loadingSinceMs < voiceReportFromS(ex, v.currentTarget.repBandLo ?? v.currentTarget.recommendedReps) * 1000;
        /*
         * …and a side is made of plates: a bare number no plates add up to ("שמונה", "שתים עשרה" on a
         * bar that moves by a kilo and a quarter a side) is not a side at all — it is reps, or noise,
         * and it goes on to the question below, which writes nothing without her "כן".
         */
        const loadable = readAsSide && Math.abs(snapToStock(asSide!, exo!) - asSide!) < 1e-6;
        if (readAsSide && (a.perSide === true || a.saysKg || (loadable && (plausibleLoad || tooSoonForASet || !repsLike)))) {
          const snapped = snapToStock(asSide!, exo!);
          v.setLiftLoad(snapped);
          return this.loadSaid(v, voiceScript.loadEcho(ex, snapped, l));
        }
        if (two || (!a.saysKg && repsLike && (a.saysReps || loadless || !plausibleLoad))) {
          if (!tooSoonForASet) {
            const weight = two ? toKg(n, a.lb) : cur;
            const reps = two ? a.numbers[1] : n;
            return this.confirmFromLoading(v, weight, reps);
          }
          /*
           * ⛔ SOONER THAN A SET CAN BE DONE, IT IS NOT A SET (2026-10-05). The same instant from which
           * her report is heard everywhere else: seconds after a lift is called nobody has lifted it,
           * so "שמעתי שמונים קילו, שמונה חזרות. נכון?" asked a question no honest answer to which is
           * yes — it was a plate, the next rack, the strong ear making a word of a noise. A lone number
           * that is no load and no side is let go; a load said with a number is the load.
           */
          if (!two || !plausibleLoad) return true;
        }
        if (loadless && !a.saysKg) return true;
        if (!(asKg >= 0) || !exo) return true;
        const snapped = snapToStock(asKg, exo);
        v.setLiftLoad(snapped);
        return this.loadSaid(v, voiceScript.loadEcho(ex, snapped, l));
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
        return this.loadSaid(v, voiceScript.loadEcho(ex, next, l));
      }
      case 'dont_know': {
        if (round || !exo) return true;
        // The calibration set (spec §3.2): light, no range, her reps decide the next load.
        const cur = v.currentTarget.recommendedWeight;
        if (cur == null) return true;
        const light = Math.max(emptyBarKg(exo.equipment), snapToStock(cur * 0.75, exo));
        v.setLiftLoad(light);
        this.calibrating = ex;
        return this.loadSaid(v, voiceScript.calibrationStart(ex, light, l));
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
      if (this.mode === 'set' && this.setState?.key === key) void this.speak([voiceScript.tenSeconds()], false, false, () => this.inSet(key));
    });
  }

  /** How long after its start the step on stage is asked about — null when it is not (a round's middle). */
  private askDelayMs(v: SessionView): number | null {
    const hold = this.holdOnStage(v);
    if (hold) return hold.seconds * 1000;
    const ex = v.currentExerciseId;
    if (!ex || !v.currentTarget) return null;
    // A round is asked once, after all of it — or all that is left of it: each lift's own time, in turn.
    // ⛔ ONE margin for the round, not one per lift (2026-10-05): a superset of two was asked about
    // a hundred and eighteen seconds after "קדימה" — thirty of them the same fifteen, counted twice.
    const ahead = this.roundAhead(v);
    if (ahead) return (ahead.reduce((t, s) => t + voiceAskAfterS(s.exerciseId, s.lo) - VOICE_BUFFER_S, 0) + VOICE_BUFFER_S) * 1000;
    const lo = v.currentTarget.repBandLo ?? v.currentTarget.recommendedReps;
    return voiceAskAfterS(ex, lo) * 1000;
  }

  /** From how long after its start the step on stage can be reported unprompted — null for a hold, which the clock counts. */
  private reportDelayMs(v: SessionView): number | null {
    if (this.holdOnStage(v)) return null;
    const ex = v.currentExerciseId;
    if (!ex || !v.currentTarget) return null;
    const ahead = this.roundAhead(v);
    if (ahead) return ahead.reduce((t, s) => t + voiceReportFromS(s.exerciseId, s.lo), 0) * 1000;
    return voiceReportFromS(ex, v.currentTarget.repBandLo ?? v.currentTarget.recommendedReps) * 1000;
  }

  private scheduleAsk(v: SessionView, startMs: number): void {
    const inMs = this.askDelayMs(v);
    if (inMs == null) {
      if (v.currentTarget || this.holdOnStage(v)) this.setSet({ key: stepKeyOf(v) ?? '', started: true, askDueMs: null });
      return;
    }
    const dueMs = startMs + inMs;
    // Her own report is heard from the moment the set — or the whole round — could be over. Not a
    // hold: that is counted by the clock.
    const reportIn = this.reportDelayMs(v);
    const reportFromMs = reportIn == null ? null : startMs + reportIn;
    this.setSet({ key: stepKeyOf(v) ?? '', started: true, askDueMs: dueMs, reportFromMs });
    this.after(Math.max(0, dueMs - this.d.now()), () => this.askDone());
    this.armSetWindow();
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
    // She said a number a moment ago and the beat it was held for ran into the question: it is her answer.
    const held = this.pendingReport;
    if (held && !reminder && this.setState?.key === held.key) {
      this.closeWindow();
      this.takeReport(v, held.weight, held.reps, held.conf);
      return;
    }
    // A question means the set is under way — begun without the word the ear missed, if it was
    // never said: the Ready it still offers on the card goes (a button nothing answers otherwise).
    if (v.awaitingReady) v.setAwaitingReady(false);
    this.lastAwaiting = false;
    if (this.earDown) {
      // Nothing can hear the answer: the question becomes where to mark the set.
      this.mode = 'set';
      const key = this.setState?.key;
      void this.speak([voiceScript.markOnLock()], false, false, () => this.inSet(key));
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
      line = prev ? voiceScript.askDoneHoldAgain() : voiceScript.askDoneHold();
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
      case 'ready':
        // "מוכן" to the question of a set the coach had only ASSUMED was under way — she never said it,
        // and she was still resting: it begins now. Her word is the start whenever she gives it.
        if (!inEcho && (q === 'done' || q === 'reps') && this.setState && !this.setState.started) {
          this.ask = null;
          this.closeWindow();
          this.mode = 'loading';
          this.onReady(v, 'voice');
          return false;
        }
        return true;
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
      const key = this.setState?.key;
      void this.speak([voiceScript.markOnLock()], false, false, () => this.inSet(key));
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
    void this.speak([voiceScript.echoRound(items, l)], true, false, SAID_TO_THE_END).then(() => {
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
    const idx = v.globalProgress?.index ?? 0;
    const before = v.livePlan[idx] as Step | undefined;
    // The load the plan held for this set: at it, the set is said back by its reps alone (2026-10-05).
    const planned = before?.target?.recommendedWeight;
    if (conf != null && conf < CONFIDENCE_FLOOR && this.ask?.question !== 'confirm') {
      // Not sure what was heard: say it back with a question before writing anything.
      this.ask = { question: 'confirm', silences: this.ask?.silences ?? 0, noes: this.ask?.noes, unconfirmed: { weight, reps } };
      await this.speak([voiceScript.confirmHeard(weight, reps, l, planned)], true);
      this.reopen(WINDOWS.confirm);
      return;
    }
    this.closeWindow();
    const ex = v.currentExerciseId!;
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
      await this.speak([voiceScript.echo(weight, reps, l, planned)], false, false, SAID_TO_THE_END);
      return;
    }
    this.ask = { question: 'echo', silences: 0, echoed: { weight, reps } };
    const mine = this.ask;
    await this.speak([voiceScript.echo(weight, reps, l, planned), ...(record ? [voiceScript.record()] : []), ...verdict.lines], true, false, SAID_TO_THE_END);
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
    if (ex) await this.speak([voiceScript.holdEcho(seconds, l)], false, false, SAID_TO_THE_END);
  }

  /** The verdict — Loop 1, under the voice only (founder 2026-09-08; the stage stays a logger). */
  private verdictFor(ctx: EchoCtx, weight: number | null, reps: number, after: SessionView): { lines: string[]; move: { exerciseId: string; kg: number } | null } {
    /*
     * ════ ⛔ NO VERDICT INSIDE THE WORKOUT — FOR NOW (founder, 2026-10-06) ════
     *
     *   > *"אני לא חושב שצריך לומר 'אותו משקל' או הורד משקל או הרם משקל. לפחות לא כרגע. כרגע המנוע
     *   > שמעלה ומוריד משקל מחוץ לאימון עד כמה שאני זוכר נכון, לכן רק צריך להשמיע צליל של LOGGED."*
     *
     * His first workout with a voice he could hear, and after every set it said one more line he had
     * no use for. And his memory is the product's own rule everywhere but here: the stage is a
     * logger, and the load is the engine's between workouts (Loop 2). Under the voice alone a set
     * also MOVED the next one (Loop 1, his ruling of 2026-09-08) — which is what those lines were
     * announcing. A move with nobody saying it would be a bar that changes behind her back, so both
     * go together: after a set the coach says what was written, and the plan's load stands.
     *
     * The one exception is the set she asked for by saying "לא יודע": a calibration set has no load
     * to stand at — its whole purpose is the next one — so its line and its move stay.
     */
    if (!this.d.verdictInWorkout && !ctx.wasCalibration) return { lines: [], move: null };
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
      }
      /*
       * ⛔ NOTHING IS SAID AT THE END OF A LIFT MET FOR THE FIRST TIME — and never a promise about
       * next time (2026-09-27, the voice walk): "בפעם הבאה נתחיל בשישים ושתיים וחצי" was the last
       * set's weight, and the next workout's load is the engine's fold of ALL her sets (Loop 2).
       * "למדתי את המשקל שלך בתרגיל הזה" stood here until 2026-10-05: true, and two and a half seconds
       * she could do nothing with, before the line that tells her where to walk.
       */
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
    const lines = [voiceScript.echo(weight, reps, l, this.echoCtx?.before?.target?.recommendedWeight)];
    if (this.echoCtx && this.echoCtx.ex === row.exerciseId) {
      // "נעלה לארבעים ושתיים וחצי", then "לא, עשר": the move said a moment ago is replaced, aloud.
      const verdict = this.verdictFor(this.echoCtx, weight, reps, this.d.getView() ?? v);
      lines.push(...verdict.lines);
      if (this.heldRest) this.heldRest.move = verdict.move;
      else this.pendingMove = verdict.move;
    }
    this.ask = { question: 'echo', silences: 0, echoed: { weight, reps } };
    const mine = this.ask;
    void this.speak(lines, true, false, SAID_TO_THE_END).then(() => {
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
    this.pendingReport = null;
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
      this.listenInRest();
      return;
    }
    const lines: string[] = [];
    // Reached without the voice having said the set (a tap on the stage, the lock screen or the
    // wrist): say it back first, so the flow never goes quiet. Only the row of the set JUST on
    // stage, and never after a hold or a distance — those write no reps row (2026-09-27: after a
    // plank the voice read back a set of an earlier lift).
    if (row && !this.stageItem && row.exerciseId === this.stageEx && !this.voiceRows.has(rowKey(row.exerciseId, row.setIndex))) {
      const stepDone = (v.livePlan as Step[])[v.globalProgress?.index ?? -1];
      const planned = stepDone?.exerciseId === row.exerciseId ? stepDone.target?.recommendedWeight : undefined;
      lines.push(voiceScript.echo(row.actualWeight, row.actualReps, l, planned));
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
    // What is in `lines` so far is the set she did — said to the end. What follows is where she goes next.
    const facts = lines.length;
    const plan = v.livePlan as Step[];
    const doneAt = v.globalProgress?.index ?? -1;
    const done = plan[doneAt];
    const liftOver = !done || !plan.slice(doneAt + 1).some((s) => s.exerciseId === done.exerciseId);
    if (v.displayPhase === 'REST_TRANSITION' && v.nextExerciseId && v.currentExerciseId && liftOver) {
      // The next lift and its load, while she walks to it — and whether it is the day's last.
      const ahead = new Set(plan.slice(doneAt + 1).map((s) => s.exerciseId));
      const nextKg = v.nextItem && v.nextItem.kind !== 'reps' ? null : (v.nextTarget?.recommendedWeight ?? null);
      lines.push(voiceScript.liftDone(v.nextExerciseId, nextKg, ahead.size === 1, v.restSeconds, l));
    }
    // ⛔ Between two sets of one lift NOTHING is said (founder, 2026-10-06: "כמה שפחות מלל"): the rest's
    // length is the same every time and on every screen; ten seconds out and the bell are the news.
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
      void this.speak(lines, false, false, (i) => i < facts || this.mode !== 'ended').then(() => this.listenInRest());
      if (move) v.setLiftLoad(move.kg);
    }
    this.scheduleTenSeconds(v);
  }

  /** The rest, listened to for the word that ends it (see `REST_EAR_LEAD_MS`). */
  private listenInRest(): void {
    if (!this.on || this.interrupted || this.mode !== 'rest' || this.window) return;
    // Only a microphone that costs her music nothing — and one that can hear at all.
    if (this.earDown || !this.d.earIsFree?.()) return;
    const v = this.d.getView();
    if (!v?.active || v.paused || v.restEndsAtMs == null) return;
    if (v.displayPhase !== 'REST_INTER' && v.displayPhase !== 'REST_TRANSITION') return;
    const ms = v.restEndsAtMs - this.d.now() - REST_EAR_LEAD_MS;
    if (ms < REST_EAR_MIN_MS) return;
    this.openWindow(
      ms,
      (a) => this.onRestAnswer(a),
      'ready',
      (why) => {
        if (why === 'locked' || why === 'denied' || why === 'deaf' || why === 'error') this.earFailed(why);
      },
      true,
    );
  }

  private onRestAnswer(a: VoiceAnswer | null): boolean {
    const v = this.d.getView();
    if (!v || this.mode !== 'rest') return false;
    if (!a) return true; // a rest is when people talk: whatever it was, it was not for the coach
    switch (a.kind) {
      case 'ready':
      case 'skip':
        this.restCut = true;
        this.d.track?.('voice_rest_cut', { leftS: v.restEndsAtMs != null ? Math.round((v.restEndsAtMs - this.d.now()) / 1000) : null });
        v.endRest();
        return false;
      case 'pause':
        v.pause();
        return false;
      default:
        return true;
    }
  }

  /** The echo's tail closed: the move lands, and the rest's own lines are said while it is still a rest. */
  private releaseHeldRest(sayLines: boolean): void {
    const h = this.heldRest;
    this.heldRest = null;
    if (!h) return this.settleAudio();
    const v = this.d.getView();
    if (h.move && v) v.setLiftLoad(h.move.kg);
    const resting = v?.active && (v.displayPhase === 'REST_INTER' || v.displayPhase === 'REST_TRANSITION');
    if (sayLines && resting && h.lines.length > 0) void this.speak(h.lines).then(() => this.listenInRest());
    else {
      this.settleAudio();
      if (resting) this.listenInRest();
    }
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
      if (now && (now.displayPhase === 'REST_INTER' || now.displayPhase === 'REST_TRANSITION')) {
        // Still a rest, and still more than a breath of it left: a late "ten seconds" is a wrong one.
        void this.speak([voiceScript.tenSeconds()], false, false, () => {
          const n = this.d.getView();
          if (!n?.active || n.paused || (n.displayPhase !== 'REST_INTER' && n.displayPhase !== 'REST_TRANSITION')) return false;
          return n.restEndsAtMs == null || n.restEndsAtMs - this.d.now() > 5_000;
        });
      }
    });
  }

  /** "+15" moved the rest's end (the lock screen, the wrist): the ten-seconds line moves with it. */
  onRestExtended(v: SessionView): void {
    if (this.mode !== 'rest') return;
    this.clearTimers();
    this.scheduleTenSeconds(v);
    // The rest's own window was cut to the OLD end: it is opened again to the new one. (Never the
    // echo's three seconds — those are a question still open.)
    if (!this.ask) {
      this.closeWindow();
      this.listenInRest();
    }
  }

  // ── Pause ─────────────────────────────────────────────────────────────────────────────────────

  private onPaused(_v: SessionView): void {
    this.closeWindow();
    this.clearTimers();
    this.heldRest = null;
    this.pausedAtMs = this.d.now();
    this.persist();
    this.ask = { question: 'paused', silences: 0 };
    this.mode = 'paused';
    this.pauseSaid = false;
    /*
     * ⛔ SHE IS TOLD TO SAY "המשך" ONLY WHEN SOMETHING CAN HEAR IT (2026-10-10). With no microphone
     * the line was said all the same — "כדי להמשיך, תגיד: המשך" into a workout that listens to nothing
     * (it is in his build-78 journal). And said only while the pause still stands: a pause she left
     * before its turn came is not announced after the fact.
     */
    void this.speak([this.earDown ? voiceScript.pausedNoEar() : voiceScript.paused()], true, false, () => {
      if (this.mode !== 'paused') return false;
      this.pauseSaid = true;
      return true;
    }).then(() => this.listenForResume(true));
  }

  /**
   * "המשך" — one minute of the earbuds' microphone at most (it holds her music at call quality). On
   * the phone's own: a minute as attentive as any question, then only a clear voice, and nothing at
   * all past `PAUSE_LISTEN_MS` — a pause is not listened to for ever.
   */
  private listenForResume(first: boolean): void {
    if (this.mode !== 'paused') return;
    if (this.earDown || (!first && !this.d.earIsFree?.())) return this.settleAudio();
    const left = this.pausedAtMs == null ? 0 : this.pausedAtMs + PAUSE_LISTEN_MS - this.d.now();
    if (!first && left < 1_000) return this.settleAudio();
    this.openWindow(
      first ? WINDOWS.paused : Math.min(WINDOWS.paused, left),
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
      !first,
    );
  }

  private onResumed(): void {
    this.closeWindow();
    this.ask = null;
    // A pause freezes the set: its question moves by the pause, so she is not asked "סיימת?" the
    // moment she picks the bar back up (2026-09-27).
    if (this.pausedAtMs != null && this.setState?.askDueMs != null) this.setState.askDueMs += this.d.now() - this.pausedAtMs;
    if (this.pausedAtMs != null && this.setState?.reportFromMs != null) this.setState.reportFromMs += this.d.now() - this.pausedAtMs;
    this.pausedAtMs = null;
    this.persist();
    this.mode = 'idle';
    this.lastPhase = null; // re-enter the phase she is in
    this.reentry = true;
    // "ממשיכים" answers a pause that was said. One she left before its line had its turn needs no answer.
    const answered = this.pauseSaid;
    void this.speak([voiceScript.resumed()], false, false, () => answered && this.mode !== 'paused' && this.mode !== 'ended');
  }

  // ── Plumbing ──────────────────────────────────────────────────────────────────────────────────

  /**
   * Ear failure, decided once (2026-09-27): a locked phone or a refused microphone is an ear that
   * cannot hear from here; two errors in a row are too. Said ONCE a workout ("אני לא שומעת אותך
   * כרגע…"), and from then on the lines go on and no window is tried until the ear may listen again.
   */
  private earFailed(why: WindowEnd): boolean {
    if (why === 'locked' || why === 'denied' || why === 'deaf') return this.earWentDown(why);
    if (why === 'error') {
      this.earErrors += 1;
      if (this.earErrors >= 2) return this.earWentDown(why);
    }
    return false;
  }

  private earWentDown(why: WindowEnd): true {
    if (!this.earDown) this.d.track?.('voice_ear_down', { why });
    this.earDown = true;
    this.earDownWhy = why;
    if (!this.cantHearSaid) {
      this.cantHearSaid = true;
      void this.speak([voiceScript.cantHear()]);
    }
    return true;
  }

  /** One voice: every `speak` waits for the one before it, so lines land in the order they were decided. */
  private chain: Promise<void> = Promise.resolve();

  /*
   * ════ ⛔ A LINE THAT IS NO LONGER TRUE IS NOT SAID (2026-10-10) ════
   *
   * From the journal of his first build-78 workout — a set marked, a pause, the workout ended, three
   * taps inside three seconds:
   *
   *     12:05:43  session_completed
   *     12:05:43  said  סט שני מתוך שלושה.          ← a set that would never be done
   *     12:05:48  said  האימון מושהה. כדי להמש…      ← five seconds after the workout was over
   *     12:05:52  said  כל הכבוד. ארבעה תרגילי…
   *
   * Every one of those was true when it was decided. A line takes seconds to say and the voice says
   * them in order, so by its turn the workout had moved on under it; Waze does not say "turn right"
   * after the turn. So each line is asked once more, AT ITS TURN, whether it is still true (`still`,
   * by its index in the utterance). With no answer of its own, a line decided while the workout was
   * running is not said once the workout has ended. The echo of a set already written is the one
   * thing said to the end (`SAID_TO_THE_END`, the ruling of 2026-09-27): the set is a fact.
   */
  private speak(lines: string[], keepDucked = false, chime = false, still?: (index: number) => boolean): Promise<void> {
    if (!this.on || this.interrupted || lines.length === 0) return this.chain;
    // Every line of this utterance starts on its way in the natural voice now — the verdict fetches
    // while the echo plays, and nothing waits twice.
    this.d.mouth.warm?.(lines, this.d.locale().locale);
    this.queued += 1;
    const decidedInAWorkout = this.mode !== 'ended';
    const stillTrue = (i: number) => (still ? still(i) : !decidedInAWorkout || this.mode !== 'ended');
    const run = async () => {
      try {
        if (!this.on || this.interrupted) return;
        if (lines.some((_, i) => stillTrue(i))) {
          this.speaking += 1;
          try {
            // While a window is open the recognizer owns the session (record + play, her music already
            // ducked); switching the category under it would end the recording mid-answer.
            if (!this.window) await this.d.audio.duck();
            // ⛔ The rest's end: the chime FIRST, and the line only once it has sounded (2026-09-27).
            if (chime && this.on) await this.d.audio.playChime();
            const locale = this.d.locale().locale;
            for (let i = 0; i < lines.length; i += 1) {
              if (!this.on || this.interrupted) break; // earbuds out, a call: the rest is not played
              if (!stillTrue(i)) {
                // `String(…)`: a journal row is never the thing that throws inside the voice's chain.
                this.d.track?.('voice_unsaid', { line: String(lines[i]).slice(0, 22) });
                continue;
              }
              await this.d.mouth.say(lines[i], locale);
            }
          } finally {
            this.speaking -= 1;
            this.lastSpokeEndMs = this.d.now();
            this.lastSpoken = lines;
          }
        } else {
          // Not one word of it is true any more: no duck, no bell, nothing — and it is written down.
          this.d.track?.('voice_unsaid', { line: String(lines[0]).slice(0, 22), lines: lines.length });
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
    patient = false,
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
      ...(patient ? { patient: true } : {}),
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
