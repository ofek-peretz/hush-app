/**
 * Apple Watch companion protocol (non-native layer).
 *
 * Defines the wire contracts between the iPhone (sole authority) and the Watch
 * (a remote terminal), plus the PURE rules that enforce the phone's authority.
 * No WatchConnectivity / native code here — only schemas + validation + mapping,
 * so it is fully unit-testable on any host. The native WCSession transport is a
 * separate swap point (watchBridge.ts).
 *
 * Architecture (audit, ratified):
 *  - Phone → Watch: a read-only SessionMirror snapshot (the SAME canonical
 *    projection that feeds the Live Activity — no second projection system).
 *  - Watch → Phone: INTENTS, never state. The watch proposes an action; the
 *    phone validates it against its own truth and runs it through the one session
 *    machine. The watch never mutates its own state and keeps no workout database.
 *  - Offline: the watch is a terminal. A completion intent is NEVER queued on the
 *    watch (queuing risks double-logging and broken save-order); a stale intent
 *    after a reconnect is rejected. The phone remains able to complete a workout
 *    entirely on its own, online or offline.
 */

// 

import type { SessionEvent } from '@/state/machines/sessionState';
import type { WatchCopyPack } from './watchCopyPack';
import type { MirrorLoadSetup, SessionMirror } from '@/platform/sessionMirror';
import type { ReasonType } from '@/data/local/models';

export const WATCH_PROTOCOL_VERSION = 1 as const;

/** Schema of the standalone plan snapshot (phone → watch). Bump on any
 *  incompatible change — the watch rejects a shape it cannot read. */
export const WATCH_PLAN_SCHEMA_VERSION = 1 as const;

/** How long a watch intent stays valid after it was issued. Beyond this it is
 *  rejected as stale — protects against an intent arriving late after a
 *  reconnect, when the phone has already moved on (audit offline rule). */
export const WATCH_INTENT_TTL_MS = 15_000;

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * HOW LONG A `start_workout` IS STILL WANTED — the number the two devices must agree on.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The wrist's Begin button sends `start_workout` and then waits this long for a live frame. If none
 * arrives — the phone app was killed, and `sendMessage` to a dead app evaporates in silence — it
 * starts the workout ITSELF from the stored plan snapshot, which is the whole point of standalone.
 *
 * ⛔ THE BUG THIS CLOSES: the wrist gave up after 3 seconds and the phone accepted a start at ANY
 * age — lobby intents return above the staleness gate, so `start_workout` had no expiry at all.
 * Between those two facts:
 *
 *   t+0.0s  wrist taps Begin; the phone is cold, iOS begins waking it
 *   t+3.0s  no live frame → the wrist starts the workout locally and she begins lifting
 *   t+6.0s  React Native finishes booting; the phone accepts the intent and starts a SECOND session
 *   → the phone can only reclaim authority while no set has been logged on the wrist
 *     (`WatchModel.apply`), and by now one has. Two live authorities, one workout: the wrist's
 *     record comes home and is credited, and the phone is left holding an interrupted session it
 *     will later offer her to "continue" — a workout she has already finished.
 *
 * The rule is that the phone must not start something the wrist has already given up waiting for.
 * One constant, read by both sides, instead of a 3 here and a 15 there that never knew about each
 * other. `WatchWire.startGraceMS` mirrors it, and the wire-parity law holds the two together.
 *
 * ⚠️ IT DOES NOT NEED A MARGIN. If the phone accepts at 2.9 s and its first live frame lands after
 * the wrist has already fired the fallback, the existing reclaim in `WatchModel.apply` handles it
 * cleanly — no set has been logged that early, so the local session is discarded without a trace.
 * The only window that was ever unrecoverable is the late one, and this closes it.
 */
export const WATCH_START_GRACE_MS = 3_000;

// ---- Phone → Watch ---------------------------------------------------------

/** The envelope the phone publishes to the watch on every state change. */
export interface WatchStateEnvelope {
  v: typeof WATCH_PROTOCOL_VERSION;
  type: 'session_state';
  /** Read-only projection; null = no active session (watch tears its UI down). */
  mirror: SessionMirror | null;
  /** Pre-session lobby for the Start screen, populated ONLY when `mirror` is null
   *  (no active session). Optional/back-compatible: an older watch ignores it. */
  lobby?: WatchLobby | null;
  /** Monotonic authority sequence. The watch keeps the highest it has seen and
   *  ignores any envelope with a lower seq (last-write-wins, reorder-proof). */
  authoritySeq: number;
  /**
   * ⛔ WHICH PHONE PROCESS THE SEQUENCE BELONGS TO — the fix for a wrist that went deaf.
   *
   * `authoritySeq` counts from zero inside one JS context (`WatchSession` is built once per app
   * launch), while the watch's high-water mark lives in the watch app's own memory and outlives it.
   * iOS jettisons a backgrounded phone app as a matter of routine, so:
   *
   *   morning  · the phone publishes a few hundred envelopes → the wrist's high-water mark is ~300
   *   daytime  · iOS reclaims the phone app
   *   evening  · she reopens Hush; the sequence restarts at 1
   *   → every envelope is BELOW the high-water mark and is discarded, for as long as the watch app
   *     process happens to stay alive. The wrist sits on the morning's state and nothing heals it.
   *
   * The epoch names the process the count belongs to, so the watch can tell "an old message that
   * arrived late" (ignore) from "a new phone, counting again" (reset and adopt). It is wall-clock
   * milliseconds at construction, which makes it monotonic across launches without persisting
   * anything, and comparable so a straggler from the previous process still loses.
   *
   * ⚠️ OPTIONAL, AND 0 MEANS "NOT STATED". A watch binary installs asynchronously from the phone
   * app, so a newer wrist will meet older envelopes for a while; those keep the seq-only rule
   * rather than being read as epoch 0 and rejected forever, which would be this same bug mirrored.
   */
  authorityEpoch?: number;
  /**
   * ⛔ THE ACK FOR A LIVE HANDOVER — "this session is the one your wrist gave me, and here is its id."
   *
   * The wrist may only let go of a local session it has handed over ONCE THE PHONE HOLDS IT. Its
   * engine is carrying real sets; discarding on a guess is the one mistake in this whole layer that
   * loses a workout outright.
   *
   * A live mirror alone is not that proof — it says the phone is running SOMETHING, which could as
   * easily be a different workout. `SessionMirror` carries no session identity at all (checked), and
   * threading one through the projector's several return points is how a field goes missing on one
   * of them; a wrist that then saw an unstamped frame would either hold a session forever or, worse,
   * drop one that was never adopted. The envelope has a single construction site.
   *
   * Present on every frame while the phone is running an adopted session, so a wrist that missed the
   * first one is told again on the next — no retry logic, and no state to keep true on either side.
   */
  adoptedRecordId?: string;
  sentAt: string; // ISO
  /** Standalone plan snapshot — the full per-set prescriptions of the week's
   *  remaining workouts, so the watch can EXECUTE a workout with the phone absent.
   *  Attached to lobby envelopes only (it changes when the program/targets do, not
   *  per mirror frame). Optional/back-compatible: an older watch ignores it. */
  plan?: WatchPlanSnapshot | null;
  /**
   * HER LANGUAGE, RESOLVED — every `watch.*` string plus the layout direction.
   *
   * The founder overturned the English-only ruling. The wrist has no i18n runtime and should not
   * grow one: the phone already holds both languages AND the gendered forms, so it resolves the
   * copy and sends it. Same law the loads follow — the phone is the sole authority and the watch
   * renders what it is handed (S-48); this stops making an exception of words.
   *
   * Attached to LOBBY envelopes only, never to a mirror frame. A mirror is published many times a
   * second during a rest and the pack is a kilobyte that changes when she changes her language —
   * which is to say almost never. The watch caches the last one it saw.
   *
   * Optional and back-compatible: a watch binary installs asynchronously from the phone app, so a
   * phone that has updated will talk to an older wrist for a while. A missing pack means "use the
   * English you shipped with", never a blank screen.
   */
  copy?: WatchCopyPack | null;
}

export function makeStateEnvelope(
  mirror: SessionMirror | null,
  authoritySeq: number,
  sentAtMs: number,
  lobby: WatchLobby | null = null,
  plan: WatchPlanSnapshot | null = null,
  copy: WatchCopyPack | null = null,
  authorityEpoch = 0,
  adoptedRecordId: string | null = null,
): WatchStateEnvelope {
  return {
    v: WATCH_PROTOCOL_VERSION,
    type: 'session_state',
    mirror,
    lobby,
    plan,
    // Omitted rather than sent as null when there is none, so an unchanged envelope stays
    // byte-identical for an older watch that has never seen the field.
    ...(copy ? { copy } : {}),
    authoritySeq,
    // Same rule as `copy`: omitted rather than sent as 0, so "not stated" and "stated as zero"
    // cannot be confused by the wrist — see the field's note.
    ...(authorityEpoch ? { authorityEpoch } : {}),
    /* Omitted rather than sent as null, like every other optional here — a wrist that decodes an
       absent key gets `nil`, which is "no claim", never "not yours". */
    ...(adoptedRecordId ? { adoptedRecordId } : {}),
    sentAt: new Date(sentAtMs).toISOString(),
  };
}

// ---- Standalone plan snapshot (phone → watch) -------------------------------
//
// The phone remains the sole owner of the MODEL (progression, targets, program
// composition). The snapshot is the model's OUTPUT, precomputed for every
// remaining workout of the week and handed to the watch so it can execute one
// with the phone absent. The watch never recomputes targets — it runs the
// prescriptions verbatim and reports what actually happened back for
// reconciliation (WatchSessionRecord).

/** One prescribed set, fully resolved (names + equipment setup included) so the
 *  watch renders it with zero local model/catalog knowledge. */
export interface WatchPlanStep {
  exerciseId: string;
  exerciseName: string;
  /** Primary muscle group label (Active Set legend). */
  exerciseGroup?: string;
  setIndexInExercise: number; // 0-based within the exercise
  totalSetsInExercise: number;
  globalIndex: number; // 0-based within the workout
  targetWeight: number | null; // null => bodyweight
  targetReps: number;
  /**
   * The TOP of her band (`Thi`). Without it a standalone workout could not draw the rep RULER at
   * all — `WireMirror.targetRepsHi` was the one mirror field the wrist's own projector never set,
   * so the phone-absent athlete saw a single number where every phone-run set shows a range, and
   * WT2's "8 … 10" collapsed to "8". Optional so a stale watch build simply keeps collapsing it.
   */
  targetRepsHi?: number;
  /**
   * ⛔ WHAT SHE DID LAST TIME ON THIS LIFT (founder 2026-08-04): *"send the history for a standalone
   * workout too."*
   *
   * The mirror carries it, so a phone-run set draws last time's reps in the row; a STANDALONE set
   * drew dashes, because the plan snapshot is everything the wrist gets when the phone is in a
   * locker — and it carried no history at all. That asymmetry was a choice I had left open; this
   * closes it.
   *
   * ⚠️ REPEATED ON EVERY SET OF A LIFT rather than held in a per-workout map. It is a few hundred
   * bytes across a whole week, and it means the wrist's projector reads `cur.lastReps` off the step
   * it already has — no lookup, no second index to keep in step. The Swift side is the half I cannot
   * compile here, so the simplest thing that works there wins.
   *
   * ⚠️ OPTIONAL, AND THE PLAN SCHEMA IS NOT BUMPED: an older watch ignores keys it does not know,
   * and a newer watch reading an older plan decodes nil — which draws exactly what it drew before.
   */
  lastReps?: number[];
  /** …and the load she finished that lift on. Absent = bodyweight, or no history. */
  lastLoadKg?: number | null;
  /** Backend block id — carried through to the record so a reconciled set syncs
   *  to the right block, exactly like a phone-logged one. */
  blockId?: string;
  /** Advisory load-change reason (drives the watch LoadDelta mark + the truthful
   *  "lifts up" summary). Never authoritative. */
  reasonType?: ReasonType;
  reasonDelta?: number;
  /** Equipment-native setup (kg) for this step's load. */
  loadSetup?: MirrorLoadSetup | null;
  /** Between-sets rest (s) for THIS exercise (tier-based, S2). A stale watch build
   *  ignores it and falls back to the plan-level restInterS. */
  restInterS?: number;
  /**
   * ⛔ IS THAT REST ACTUALLY HERS? (S-17) — the field the wrist's "your pace" line was guessing at.
   *
   * The standalone watch lit that badge off `cur.restInterS != nil`, which is true of her learned
   * median AND of a rest the COACH wrote. So a number she had never produced was labelled with her
   * name, on the surface she looks at most during a set. The live mirror has carried an honest
   * `restIsLearned` for months; only the phone-less path was guessing, and the note on
   * `buildCoachWatchPlan` said so and left it — *"a schema bump plus a matching Swift decode that
   * cannot be exercised from here"*.
   *
   * ⚠️ IT IS NOT A SCHEMA BUMP, FOR THE SAME REASON `lastReps` WAS NOT. Optional in both directions:
   * an older watch ignores a key it has never heard of, and a newer watch reading an older plan
   * decodes `nil` — which draws exactly what it drew before. The Swift half is `WirePlanStep`.
   */
  restIsLearned?: boolean;
}

export interface WatchPlanWorkout {
  id: string;
  name: string;
  muscles: string;
  steps: WatchPlanStep[];
}

export interface WatchPlanSnapshot {
  schema: typeof WATCH_PLAN_SCHEMA_VERSION;
  /** Content hash — the watch replaces its stored plan when this changes, and a
   *  session record names the plan it executed. */
  planId: string;
  generatedAt: string; // ISO
  /** Hush-owned rest lengths (s) — the watch runs the same rests the phone would. */
  restInterS: number;
  restTransitionS: number;
  /** The week's REMAINING (not completed, non-rest) workouts, fully prescribed. */
  workouts: WatchPlanWorkout[];
}

// ---- Watch-local session record (watch → phone reconciliation) --------------

/** One set the watch logged locally. Mirrors the phone's SetLog materially so
 *  reconciliation produces a history entry indistinguishable from a phone-run one. */
export interface WatchRecordSet {
  exerciseId: string;
  setIndex: number; // 0-based within the exercise
  blockId?: string;
  recommendedWeight: number | null;
  recommendedReps: number;
  actualWeight: number | null;
  actualReps: number;
  completedAt: string; // ISO
}

/** A workout the watch executed AS THE LOCAL AUTHORITY (phone absent). Durable on
 *  the watch (outbox) until the phone acknowledges it; delivered at-least-once, so
 *  the phone de-dupes on `recordId`. */
export interface WatchSessionRecord {
  v: typeof WATCH_PROTOCOL_VERSION;
  type: 'session_record';
  /** Idempotency key; also the reconciled session's identity (`watch_<recordId>`). */
  recordId: string;
  /** The plan snapshot the watch executed (staleness is diagnosable, never fatal). */
  planId?: string;
  workoutId: string;
  workoutName: string;
  startedAt: string; // ISO
  endedAt: string; // ISO
  earlyFinish: boolean;
  /** Active kilocalories the WRIST measured (founder 2026-07-28). The phone has no such sensor, so
   *  on a standalone workout the wrist is the authority and its figure becomes the session's —
   *  read everywhere through `domain/energy.sessionKcal`, never re-estimated beside it. */
  kcal?: number;
  sets: WatchRecordSet[];
}

/**
 * ════ A RUN THE WRIST RECORDED, CARRIED HOME ════
 *
 * The strength side has had this since the standalone runtime shipped; cardio never did. A wrist
 * run wrote its `HKWorkout` to Health and stopped there — so the kilometres appeared in Apple
 * Health and **nowhere in Hush**: not in Progress's distance, not in her Log, not in the lifetime
 * burn. She had done the work and her own app did not know it (founder 2026-07-28: approved).
 *
 * Deliberately NOT the phone's `CardioActivity` verbatim. The wrist has no GPS trace worth carrying
 * (the route belongs to the phone's `watchPositionAsync`) and no per-kilometre split history to
 * replay — it has the four facts a wrist can honestly measure, and the reconciler builds the
 * activity from those. Every optional field is optional because the wrist may genuinely not have
 * it: no heart-rate source, no bodyweight to bill calories against (`kcalForKm`'s honesty rule).
 *
 * Same delivery contract as `WatchSessionRecord`, for the same reason: durable on the wrist,
 * at-least-once, de-duped on `recordId`, cleared only by the phone's ack.
 */
export interface WatchCardioRecord {
  v: typeof WATCH_PROTOCOL_VERSION;
  type: 'cardio_record';
  /** Idempotency key; also the reconciled activity's identity (`watch_<recordId>`). */
  recordId: string;
  gait: 'run' | 'walk';
  startedAt: string; // ISO
  endedAt: string; // ISO
  /** The WATCH's own clock — pause-aware, and the reason this is not `end − start` (founder
   *  2026-07-11: "pause doesn't stop the time" is exactly what it must not do). */
  durationSec: number;
  distanceKm?: number;
  avgHr?: number;
  kcal?: number;
}

/**
 * Which KIND of record is this payload? The two share one durable channel, so the receiver has to
 * tell them apart before it can parse either — and it must do so without throwing on a string, a
 * null, or a shape from a future watch build.
 *
 * Deliberately shallow: it reads the discriminator and nothing else. The real validation is each
 * parser's job, and a payload that claims to be cardio but is malformed must be REJECTED as cardio
 * rather than silently attempted as a session record (which would ack it against the wrong queue).
 */
export function isCardioRecordPayload(raw: unknown): boolean {
  let o: unknown = raw;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw);
    } catch {
      return false;
    }
  }
  return !!o && typeof o === 'object' && (o as Record<string, unknown>).type === 'cardio_record';
}

/** Parse a wire-form cardio record defensively — anything unreadable is null, never a throw. */
export function parseCardioRecord(raw: unknown): WatchCardioRecord | null {
  let o: unknown = raw;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  if (r.v !== WATCH_PROTOCOL_VERSION || r.type !== 'cardio_record') return null;
  if (typeof r.recordId !== 'string' || r.recordId.length === 0) return null;
  if (r.gait !== 'run' && r.gait !== 'walk') return null;
  if (typeof r.startedAt !== 'string' || typeof r.endedAt !== 'string') return null;
  // A recording with no duration is not an activity; it is a tap. Reject rather than save a zero.
  // `undefined` (absent) and `null` (present but junk) are both fatal here: an activity with no
  // duration is not an activity, and a duration we cannot read is not a duration.
  const durationSec = num(r, 'durationSec', 1, 24 * 3600, false);
  if (durationSec == null) return null;
  // The measurements. `null` from `num` means "present but junk" — dropped, never coerced to 0,
  // because a 0 km run and a run whose distance we could not read are different claims.
  // NOT an integer — a 4.2 km run is the normal case, and validating distance as a whole number
  // silently dropped every real one. HR and kcal ARE integers (the runtime rounds them).
  const distanceKm = num(r, 'distanceKm', 0, 1000, false) ?? undefined;
  const avgHr = num(r, 'avgHr', 20, 250, true) ?? undefined;
  const kcal = num(r, 'kcal', 0, 20000, true) ?? undefined;
  return {
    v: WATCH_PROTOCOL_VERSION,
    type: 'cardio_record',
    recordId: r.recordId,
    gait: r.gait,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    durationSec,
    ...(distanceKm === undefined ? {} : { distanceKm }),
    ...(avgHr === undefined ? {} : { avgHr }),
    ...(kcal === undefined ? {} : { kcal }),
  };
}

/** Parse a wire-form session record defensively — anything unreadable is null,
 *  never a throw (the phone must survive any watch payload). */
export function parseSessionRecord(raw: unknown): WatchSessionRecord | null {
  let o: unknown = raw;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  if (r.v !== WATCH_PROTOCOL_VERSION || r.type !== 'session_record') return null;
  if (typeof r.recordId !== 'string' || r.recordId.length === 0) return null;
  if (typeof r.workoutId !== 'string' || typeof r.startedAt !== 'string' || typeof r.endedAt !== 'string') {
    return null;
  }
  if (!Array.isArray(r.sets)) return null;
  for (const s of r.sets) {
    if (!s || typeof s !== 'object') return null;
    const set = s as Record<string, unknown>;
    if (typeof set.exerciseId !== 'string' || typeof set.setIndex !== 'number') return null;
    if (typeof set.actualReps !== 'number') return null;
  }
  // `kcal` is the one field here the phone STORES as a measurement rather than re-deriving, so it
  // is the one field that must not ride the blanket cast below. Junk is dropped (the session falls
  // back to the estimate); it is never coerced, and never stamped as a measurement it is not.
  const kcal = num(r, 'kcal', 0, 20000, true);
  const record = r as unknown as WatchSessionRecord;
  if (kcal === null || kcal === undefined) delete (record as { kcal?: number }).kcal;
  return record;
}

// ---- Watch → Phone ---------------------------------------------------------

/** The actions the watch may propose. The watch reports the actual WEIGHT and REPS
 *  (via the Edit Result screen — Crown-driven weight + reps, §3.6); either omitted
 *  falls back to the prescribed target. `exercise_busy` maps to the phone's
 *  equipment-occupied reorder. `select_workout` / `start_workout` are the Start
 *  (lobby) proposals — the watch picks/starts the queued workout, the phone (sole
 *  authority over the session lifecycle) validates and performs the actual start. */
export type WatchIntentType =
  | 'complete_set'
  | 'end_rest'
  | 'pause'
  | 'resume'
  | 'finish_early'
  | 'exercise_busy'
  | 'select_workout'
  | 'start_workout'
  | 'swap_exercise'
  | 'add_rest'
  // The wrist flagged a body area that hurts (WT14 · What's off). A REPORT the phone acts on —
  // never an authoritative session action. Carries `area`.
  | 'report_pain';

// ---- Pre-session lobby (the Start screen) ----------------------------------

/** One selectable workout in the Start screen's "Choose workout" list. */
export interface WatchLobbyWorkout {
  id: string;
  name: string;
  /** Number of exercises ("{n} lifts") and the muscle groups, for the list card. */
  lifts?: number;
  muscles?: string;
  /** Already completed this week (shows a "Done" tag). */
  done?: boolean;
}

/** What the phone publishes to the watch when there is NO active session: the
 *  queued workout (mirrors the iPhone home card) + the pickable list. The watch
 *  renders the Start screen from this; it owns no program state. */
export interface WatchLobby {
  /** The currently-queued workout (the one "Begin" will start). */
  workoutId: string | null;
  workoutName: string;
  muscles: string;
  /** Exercise count + estimated duration label ("6 lifts" / "~48 min"). */
  lifts?: number;
  durationLabel?: string;
  /**
   * WT7 · THE FIRST FOUR — she has no completed workout yet.
   *
   * The lobby's ordinary face reports on a week ("3 CHG", "6 LIFTS · ~55 MIN") and compares to a
   * history. On day one there is no week and no history, so every one of those figures is either
   * blank or a claim about nothing. The honest first face says what the engine is about to DO.
   */
  firstWorkout?: boolean;
  /** True when the week is locked (resting) — Begin is replaced by a recovery note. */
  resting?: boolean;
  /** True when training is GATED behind the paywall (free sessions spent, no active
   *  membership). The watch must then neither propose a start nor run one standalone —
   *  the purchase decision belongs to the phone. Absent = not gated (back-compatible). */
  gated?: boolean;
  workouts: WatchLobbyWorkout[];
}

export interface WatchIntent {
  v: number;
  type: WatchIntentType;
  /** Idempotency key — the phone de-dupes replays of the same intent. */
  intentId: string;
  issuedAt: string; // ISO, used to measure completion latency + reject stale
  /** The set the watch believed was active. Optimistic concurrency: a
   *  complete_set is rejected if this no longer matches the phone's truth. */
  expectedGlobalIndex?: number;
  /** Actual reps performed (a complete_set carries this when the athlete adjusted
   *  via the Edit Result screen). Omitted = the prescribed target reps. */
  actualReps?: number;
  /** Actual weight (kg) the athlete used, when adjusted on the watch's Edit Result.
   *  Omitted = the recommended target weight; null = bodyweight. */
  actualWeight?: number | null;
  /** The workout the Start screen selected/started (lobby proposals only). */
  workoutId?: string;
  /** The exercise the watch swapped to (swap_exercise). */
  exerciseId?: string;
  /** Seconds to add to the current rest (add_rest; default 15). */
  seconds?: number;
  /** The body area a `report_pain` intent flags — a MUSCLE the body map knows ("Shoulders",
   *  "Quads", …), so the phone rests exactly what she named (founder 2026-07-28). */
  area?: string;
  /** How sharp it is, in her words (WT14b) — the wrist asks the SAME three the phone asks, so the
   *  window is hers and never a default the engine picked for her. */
  severity?: string;
}

/** Why an intent was rejected (telemetered + useful in tests). */
export type WatchRejectReason =
  | 'no_session'
  | 'malformed'
  | 'version'
  | 'duplicate'
  | 'stale'
  | 'phase_mismatch'
  | 'index_mismatch'
  | 'unavailable';

/** What an accepted intent asks the phone to do: complete the current set with the
 *  reported actual reps (the phone processes it exactly as an on-phone entry — the
 *  source of truth), a session-machine event, or the equipment-occupied reorder. */
export type WatchPhoneAction =
  // actualReps/actualWeight omitted = prescribed target; actualWeight null = bodyweight.
  | { kind: 'complete_set'; actualReps?: number; actualWeight?: number | null }
  | { kind: 'session_event'; event: SessionEvent }
  | { kind: 'mark_equipment_occupied' }
  // Lobby proposals — the phone selects/starts the queued workout (it owns the
  // session lifecycle and validates before acting). `workoutId` omitted = the
  // workout the lobby already had queued.
  | { kind: 'select_workout'; workoutId?: string }
  | { kind: 'start_workout'; workoutId?: string }
  // Swap the current/next exercise (the phone recalibrates the load); extend rest.
  | { kind: 'swap_exercise'; exerciseId?: string }
  | { kind: 'add_rest'; seconds: number }
  // The wrist flagged a hurting area; the phone records it against the body map / model.
  | { kind: 'report_pain'; area: string; severity: string };

export interface WatchIntentDecision {
  accept: boolean;
  reason?: WatchRejectReason;
  /** The phone action to perform when accepted; null when rejected. */
  action: WatchPhoneAction | null;
  /** issuedAt → now, ms. Watch completion latency (present when parseable). */
  latencyMs?: number;
}

/** Every intent the wrist may send. Exported because it is the CONTRACT: `everyWristIntentLands
 *  Somewhere` walks it to prove each one both parses here and reaches a handler on the phone. */
export const WATCH_INTENT_TYPES: readonly WatchIntentType[] = [
  'complete_set', 'end_rest', 'pause', 'resume', 'finish_early', 'exercise_busy',
  'select_workout', 'start_workout', 'swap_exercise', 'add_rest', 'report_pain',
];
const INTENT_TYPES = WATCH_INTENT_TYPES;

/**
 * ⛔ A STANDING FACT — true whether or not a session is running, and true however late it arrives.
 *
 * FOUNDER, 2026-08-05: *"when you press injury mode on the watch it shows the area picker and the
 * pain level, which is fine — but when I press it nothing happens."*
 *
 * The wrist was dropping the report before it left (it guarded on `isReachable`, and his watch was
 * in aeroplane mode). Fixing that put it on the DURABLE channel, and **this function would then
 * have thrown it away on arrival** — twice over:
 *
 *   `noActiveSession` → a report delivered after the workout ended, after an app restart, or from
 *                       a CARDIO run (where there is no strength mirror at all) is rejected.
 *   `stale`           → the TTL is fifteen seconds, and the entire point of a queued report is
 *                       that it arrives late.
 *
 * ⚠️ That is the WT14 shape for the third time in two days: a wrist intent that reaches the phone
 * and dies quietly. Both gates exist for `complete_set` — a PROPOSAL against live state that must
 * never be replayed against a session that has moved on. **A muscle that hurts is not a proposal.**
 * It was true when she tapped it, it is true now, and no phase makes it untrue.
 */
function isStandingFact(t: WatchIntentType): boolean {
  return t === 'report_pain';
}

/** The lobby proposals are valid only when there is NO active session (the Start
 *  screen). They are handled before the active-session gates below. */
function isLobbyIntent(t: WatchIntentType): boolean {
  return t === 'select_workout' || t === 'start_workout';
}

/* --- The numbers the watch reports are NOT trusted (hardened 2026-07-13) --------------------
 *
 * This function used to check the three routing fields and then CAST the rest of the payload
 * straight through — so every number on the wire arrived unexamined at the phone's session
 * machine, which is the exact opposite of what this file promises ("the phone's truth wins").
 * Two of those numbers are load-bearing:
 *
 *   `actualReps` / `actualWeight` are written verbatim into the athlete's set log and folded by
 *   the engine. A corrupt frame could have logged −5 reps at 1e9 kg, permanently, and the engine
 *   would have progressed the next session off it.
 *
 *   `seconds` (+15) is ADDED to the rest length. A NaN there makes the rest end `NaN`, and the
 *   mirror's `new Date(NaN).toISOString()` THROWS — inside the store's publish effect, mid-set,
 *   on a phone lying on the gym floor. A projection documented as total would have crashed the
 *   workout because the wire said "seconds": "soon".
 *
 * So: a field that is ABSENT stays absent (the meaning of "unadjusted" is untouched), and a field
 * that is PRESENT but not a sane number makes the whole intent malformed — the frame is corrupt,
 * and a corrupt frame must be dropped, never half-believed.
 */
const MAX_STEPS = 10_000; // an absurd session is still a bounded one
const MAX_REPS = 200;
const MAX_WEIGHT_KG = 1_000;
const MAX_ADD_REST_S = 600;

/** Present-and-valid → the value. Absent → undefined. Present-and-invalid → `null` (malformed). */
function num(o: Record<string, unknown>, key: string, lo: number, hi: number, integer: boolean): number | undefined | null {
  const v = o[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) return null;
  if (integer && !Number.isInteger(v)) return null;
  return v;
}

function str(o: Record<string, unknown>, key: string): string | undefined | null {
  const v = o[key];
  if (v === undefined) return undefined;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Parse a wire-form intent defensively. Returns null on anything that is not a
 *  readable intent of a known type — INCLUDING a known type carrying a nonsense number. */
export function parseWatchIntent(raw: unknown): WatchIntent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== 'string' || typeof o.intentId !== 'string' || typeof o.issuedAt !== 'string') {
    return null;
  }
  if (!INTENT_TYPES.includes(o.type as WatchIntentType)) return null;

  const expectedGlobalIndex = num(o, 'expectedGlobalIndex', 0, MAX_STEPS, true);
  const actualReps = num(o, 'actualReps', 0, MAX_REPS, true);
  const seconds = num(o, 'seconds', 1, MAX_ADD_REST_S, true);
  const workoutId = str(o, 'workoutId');
  const exerciseId = str(o, 'exerciseId');
  const area = str(o, 'area');
  const severity = str(o, 'severity');
  // `actualWeight: null` is MEANINGFUL — it is bodyweight, and it must survive the sieve.
  const rawWeight = o.actualWeight;
  const actualWeight =
    rawWeight === undefined || rawWeight === null
      ? (rawWeight as null | undefined)
      : num(o, 'actualWeight', 0, MAX_WEIGHT_KG, false);

  if (
    expectedGlobalIndex === null ||
    actualReps === null ||
    (actualWeight === null && rawWeight !== null) || // null is bodyweight; null FROM `num` is junk
    seconds === null ||
    workoutId === null ||
    exerciseId === null ||
    area === null ||
    severity === null
  ) {
    return null;
  }

  return {
    v: typeof o.v === 'number' ? o.v : -1, // a non-numeric version fails the version gate below
    type: o.type as WatchIntentType,
    intentId: o.intentId,
    issuedAt: o.issuedAt,
    expectedGlobalIndex,
    actualReps,
    actualWeight: rawWeight === undefined ? undefined : (actualWeight as number | null),
    workoutId,
    exerciseId,
    seconds,
    area,
    severity,
  };
}

function intentToAction(intent: WatchIntent): WatchPhoneAction | null {
  switch (intent.type) {
    case 'complete_set':
      // The phone logs the set with the reported weight + reps (each falling back to
      // the target when omitted) and runs its own machine transition — exactly like
      // an on-phone Edit Result + Complete set.
      return { kind: 'complete_set', actualReps: intent.actualReps, actualWeight: intent.actualWeight };
    case 'end_rest':
      return { kind: 'session_event', event: { type: 'REST_ELAPSED' } };
    case 'pause':
      return { kind: 'session_event', event: { type: 'PAUSE' } };
    case 'resume':
      return { kind: 'session_event', event: { type: 'RESUME' } };
    case 'finish_early':
      return { kind: 'session_event', event: { type: 'FINISH_EARLY' } };
    case 'exercise_busy':
      return { kind: 'mark_equipment_occupied' };
    case 'select_workout':
      return { kind: 'select_workout', workoutId: intent.workoutId };
    case 'start_workout':
      return { kind: 'start_workout', workoutId: intent.workoutId };
    case 'swap_exercise':
      return { kind: 'swap_exercise', exerciseId: intent.exerciseId };
    case 'add_rest':
      return { kind: 'add_rest', seconds: intent.seconds ?? 15 };
    case 'report_pain':
      // A pain report with no area names nothing — drop it (malformed) rather than record a blank.
      // Severity is REQUIRED too: the wrist now asks (WT14b), so a report without one is a
      // half-finished flow, not a report, and the engine may not choose a rest window she did not.
      return intent.area && intent.severity
        ? { kind: 'report_pain', area: intent.area, severity: intent.severity }
        : null;
    default:
      return null;
  }
}

/**
 * Decide a watch intent against the phone's authoritative mirror. PURE — the
 * single point that enforces "the phone's truth wins". Rejects (never throws) a
 * malformed / wrong-version / duplicate / stale / phase- or index-mismatched
 * intent; otherwise returns the session event to dispatch.
 *
 * `seenIntentIds` is the caller-owned de-dupe set; this function only reads it
 * (the caller adds the id on acceptance) so the function stays pure.
 */
export function decideWatchIntent(
  raw: unknown,
  mirror: SessionMirror | null,
  nowMs: number,
  seenIntentIds: ReadonlySet<string>,
): WatchIntentDecision {
  const intent = parseWatchIntent(raw);
  if (!intent) return { accept: false, reason: 'malformed', action: null };
  if (intent.v !== WATCH_PROTOCOL_VERSION) return { accept: false, reason: 'version', action: null };

  const issuedMs = Date.parse(intent.issuedAt);
  const latencyMs = Number.isNaN(issuedMs) ? undefined : Math.max(0, nowMs - issuedMs);

  if (seenIntentIds.has(intent.intentId)) {
    return { accept: false, reason: 'duplicate', action: null, latencyMs };
  }

  const noActiveSession = !mirror || mirror.phase === 'complete';

  // A standing fact is accepted in EVERY phase and at ANY age — see `isStandingFact`. Checked
  // before every gate below, because every gate below is about live state.
  if (isStandingFact(intent.type)) {
    const action = intentToAction(intent);
    if (!action) return { accept: false, reason: 'malformed', action: null, latencyMs };
    return { accept: true, action, latencyMs };
  }

  // Lobby proposals (Start screen) are valid ONLY when there is no active session;
  // the phone is the authority and performs the actual select/start.
  if (isLobbyIntent(intent.type)) {
    if (!noActiveSession) return { accept: false, reason: 'phase_mismatch', action: null, latencyMs };
    /*
     * ⛔ A START THE WRIST HAS ALREADY GIVEN UP ON IS NOT A START — see `WATCH_START_GRACE_MS`.
     *
     * This branch returns above the staleness gate below, so `start_workout` was valid at any age.
     * A phone woken from cold six seconds after the tap would begin a session the wrist had already
     * begun itself at three, and the wrist can only be talked out of it before her first set.
     *
     * ⚠️ ONLY THE START. `select_workout` merely queues a choice and is idempotent — expiring it
     * would drop a harmless message and leave the Start screen disagreeing with the phone about
     * which workout is teed up.
     */
    if (
      intent.type === 'start_workout' &&
      !Number.isNaN(issuedMs) &&
      nowMs - issuedMs > WATCH_START_GRACE_MS
    ) {
      return { accept: false, reason: 'stale', action: null, latencyMs };
    }
    const action = intentToAction(intent);
    if (!action) return { accept: false, reason: 'malformed', action: null, latencyMs };
    return { accept: true, action, latencyMs };
  }

  // No active session on the phone → nothing else the watch can act on.
  if (noActiveSession) {
    return { accept: false, reason: 'no_session', action: null, latencyMs };
  }
  // Stale: issued too long ago (e.g. delivered late after a reconnect).
  if (!Number.isNaN(issuedMs) && nowMs - issuedMs > WATCH_INTENT_TTL_MS) {
    return { accept: false, reason: 'stale', action: null, latencyMs };
  }

  // Phase gating — the proposed action must make sense for the current phase.
  const resting = mirror.phase === 'rest_inter' || mirror.phase === 'rest_transition';
  // A set completion (with or without adjusted reps) acts on the presented set.
  if (intent.type === 'complete_set') {
    if (mirror.phase !== 'active_set') return { accept: false, reason: 'phase_mismatch', action: null, latencyMs };
    // Optimistic concurrency: the watch must be acting on the set the phone shows.
    if (intent.expectedGlobalIndex != null && intent.expectedGlobalIndex !== mirror.globalIndex) {
      return { accept: false, reason: 'index_mismatch', action: null, latencyMs };
    }
  }
  if (intent.type === 'exercise_busy') {
    if (mirror.phase !== 'active_set') return { accept: false, reason: 'phase_mismatch', action: null, latencyMs };
    // Only valid where the phone says it's offerable (start of exercise + a later one).
    if (!mirror.canMarkBusy) return { accept: false, reason: 'unavailable', action: null, latencyMs };
    if (intent.expectedGlobalIndex != null && intent.expectedGlobalIndex !== mirror.globalIndex) {
      return { accept: false, reason: 'index_mismatch', action: null, latencyMs };
    }
  }
  if (intent.type === 'end_rest' && !resting) {
    return { accept: false, reason: 'phase_mismatch', action: null, latencyMs };
  }
  if (intent.type === 'resume' && mirror.phase !== 'paused') {
    return { accept: false, reason: 'phase_mismatch', action: null, latencyMs };
  }
  if (intent.type === 'pause' && mirror.phase === 'paused') {
    return { accept: false, reason: 'phase_mismatch', action: null, latencyMs };
  }
  // Swap is offered on Active Set (current exercise) and Transition Rest (next).
  if (intent.type === 'swap_exercise' && mirror.phase !== 'active_set' && mirror.phase !== 'rest_transition') {
    return { accept: false, reason: 'phase_mismatch', action: null, latencyMs };
  }
  // +15s only extends a running rest.
  if (intent.type === 'add_rest' && !resting) {
    return { accept: false, reason: 'phase_mismatch', action: null, latencyMs };
  }

  const action = intentToAction(intent);
  if (!action) return { accept: false, reason: 'malformed', action: null, latencyMs };
  return { accept: true, action, latencyMs };
}

// ---- Serialization layer (wire ⇄ object) -----------------------------------
//
// Both sides of the bridge cross WatchConnectivity as JSON-ish dictionaries.
// These are the canonical (de)serializers; they are total and defensive so a
// malformed or wrong-version payload is a clean null, never a throw.

export function serializeEnvelope(env: WatchStateEnvelope): string {
  return JSON.stringify(env);
}

export function parseEnvelope(raw: unknown): WatchStateEnvelope | null {
  let o: unknown = raw;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  const e = o as Record<string, unknown>;
  if (e.v !== WATCH_PROTOCOL_VERSION || e.type !== 'session_state') return null;
  if (typeof e.authoritySeq !== 'number') return null;
  return e as unknown as WatchStateEnvelope;
}

export function serializeIntent(intent: WatchIntent): string {
  return JSON.stringify(intent);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE LIVE HANDOVER — a workout that began on the wrist, offered to the phone while it is running.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⛔ THE GAP THIS CLOSES, in the founder's words: *"אם התחלתי אימון בשעון ואני נכנס לאפליקציה
 * בפלאפון המסך של האימון צריך להופיע."*
 *
 * Today it cannot. The wrist has eleven things it can say and every one of them is a PROPOSAL about
 * a session the phone is running (`WatchIntentType`). While the wrist runs its own — the standalone
 * path, for a phone in a locker — it says nothing at all: every action goes to `localEngine` and no
 * message leaves. The phone first hears of that workout when it is over and the durable record
 * arrives. So opening the phone mid-workout showed Today, and offered to start the very workout she
 * was in the middle of.
 *
 * This is the missing sentence: **"I am running this, here is exactly where I am."** It is not an
 * intent — nothing about it is a proposal, and the phone does not get to refuse the facts. It is
 * the wrist's session state, offered so the authority can MOVE to the phone.
 *
 * ── WHY THE ID IS THE WHOLE DESIGN ──────────────────────────────────────────────────────────────
 * `recordId` is minted when the local session starts and is the same id its finished record will
 * carry. The phone adopts the session under `watchSessionId(recordId)` — the identity
 * `applyWatchSessionRecord` already de-dupes on. So if the handover succeeds and the wrist's record
 * arrives later anyway (the outbox is at-least-once, by design), the phone sees a session it
 * already holds and acks it as a duplicate. **The handover is idempotent through machinery that
 * already exists and is already tested**, rather than through a new rule I would have to keep true.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────────────────────────
 * ⚠️ NO `kcal`. The wrist measures energy and the phone estimates it, and that stays the record's
 * business at the end. A live figure would be a number changing under her on two screens.
 * ⚠️ NO REST LENGTHS. `restEndsAt` is absolute, which is the product's whole answer to drift — the
 * phone recomputes what remains from the clock, exactly as its own resume path does.
 */
export interface WatchLocalSession {
  v: typeof WATCH_PROTOCOL_VERSION;
  type: 'local_session';
  /** Minted at start; the id the finished record will carry. The handover's identity. */
  recordId: string;
  workoutId: string;
  workoutName: string;
  startedAt: string; // ISO
  /** The wrist's phase, in its own vocabulary — mapped to the phone's machine on adoption. */
  phase: 'active_set' | 'rest_inter' | 'rest_transition' | 'paused';
  /** The phase frozen under pause, when `phase` is 'paused'. */
  pausedFrom?: 'active_set' | 'rest_inter' | 'rest_transition' | null;
  /** Index of the PRESENTED step (during a rest it stays on the just-completed set). */
  currentIndex: number;
  /** Absolute instant the running rest ends — never a remaining count. */
  restEndsAt?: string | null;
  /** What that rest was prescribed as, so the phone can draw a ring with the right denominator. */
  restTotalS?: number | null;
  /** The prescriptions the wrist is executing — a full copy, so adoption never depends on the
   *  phone's plan file agreeing with the one the wrist was handed days ago. */
  steps: WatchPlanStep[];
  /** What she has logged so far, in order. */
  sets: WatchRecordSet[];
  sentAt: string; // ISO
}

/**
 * Parse a live-session offer, hardened the same way `parseWatchIntent` is: a frame with one
 * impossible number is rejected WHOLE rather than half-believed. This one writes into her session
 * log, so the cost of believing junk here is a workout that records something she never did.
 */
export function parseWatchLocalSession(raw: unknown): WatchLocalSession | null {
  let o: unknown = raw;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  if (r.v !== WATCH_PROTOCOL_VERSION || r.type !== 'local_session') return null;
  if (typeof r.recordId !== 'string' || r.recordId.length === 0) return null;
  if (typeof r.workoutId !== 'string' || r.workoutId.length === 0) return null;
  if (typeof r.workoutName !== 'string') return null;
  if (typeof r.startedAt !== 'string' || Number.isNaN(Date.parse(r.startedAt))) return null;
  const PHASES = ['active_set', 'rest_inter', 'rest_transition', 'paused'];
  if (typeof r.phase !== 'string' || !PHASES.includes(r.phase)) return null;
  if (r.pausedFrom != null && (typeof r.pausedFrom !== 'string' || !PHASES.includes(r.pausedFrom))) return null;
  if (typeof r.currentIndex !== 'number' || !Number.isInteger(r.currentIndex) || r.currentIndex < 0) return null;
  if (r.restEndsAt != null && (typeof r.restEndsAt !== 'string' || Number.isNaN(Date.parse(r.restEndsAt)))) {
    return null;
  }
  if (r.restTotalS != null && (typeof r.restTotalS !== 'number' || !Number.isFinite(r.restTotalS) || r.restTotalS < 0)) {
    return null;
  }
  if (!Array.isArray(r.steps) || r.steps.length === 0) return null;
  for (const s of r.steps) {
    if (!s || typeof s !== 'object') return null;
    const st = s as Record<string, unknown>;
    if (typeof st.exerciseId !== 'string' || st.exerciseId.length === 0) return null;
    if (typeof st.globalIndex !== 'number' || !Number.isInteger(st.globalIndex) || st.globalIndex < 0) return null;
    if (typeof st.setIndexInExercise !== 'number' || !Number.isInteger(st.setIndexInExercise)) return null;
    if (typeof st.totalSetsInExercise !== 'number' || st.totalSetsInExercise <= 0) return null;
    if (typeof st.targetReps !== 'number' || !Number.isFinite(st.targetReps) || st.targetReps < 0) return null;
    if (st.targetWeight != null && (typeof st.targetWeight !== 'number' || !Number.isFinite(st.targetWeight))) {
      return null;
    }
  }
  /** The presented step must exist in the plan she sent, or "where she is" means nothing. */
  if (r.currentIndex >= (r.steps as unknown[]).length) return null;
  if (!Array.isArray(r.sets)) return null;
  for (const s of r.sets) {
    if (!s || typeof s !== 'object') return null;
    const set = s as Record<string, unknown>;
    if (typeof set.exerciseId !== 'string' || set.exerciseId.length === 0) return null;
    if (typeof set.setIndex !== 'number' || !Number.isInteger(set.setIndex) || set.setIndex < 0) return null;
    if (typeof set.actualReps !== 'number' || !Number.isFinite(set.actualReps) || set.actualReps < 0) return null;
    if (set.actualWeight != null && (typeof set.actualWeight !== 'number' || !Number.isFinite(set.actualWeight))) {
      return null;
    }
    if (typeof set.completedAt !== 'string' || Number.isNaN(Date.parse(set.completedAt))) return null;
  }
  if (typeof r.sentAt !== 'string' || Number.isNaN(Date.parse(r.sentAt))) return null;
  return o as WatchLocalSession;
}
