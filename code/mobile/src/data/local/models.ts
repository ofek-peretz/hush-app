/**
 * Local data models — the offline source of truth (UX §6, spec §8.4).
 *
 * The app STORES and RENDERS these; it never derives loads, confidence,
 * capability scores, or forecasts (spec §8.7 — the model owns those).
 */

// 


/** The five Class-A capabilities — the model's primitive (spec §0). */
export type Capability =
  | 'horizontal_push'
  | 'horizontal_pull'
  | 'vertical_push'
  | 'knee_dominant'
  | 'hip_dominant';

export type Units = 'kg' | 'lb';

export type Goal = 'get_stronger' | 'build_muscle' | 'general_fitness' | 'toning';

/** Engine v5 — the athlete's declared rep band (T). One onboarding question; default '8-10'.
 *  It is a floor and a ceiling: Tlo is the target, Thi the "too light" mark. See the register S-6. */
export type RepBandChoice = '6-8' | '8-10' | '10-12' | '12-15';

/** Engine v5 — the athlete's stance on a muscle group on the body map. `off` never appears in the
 *  programme; `emphasis` gets first claim on volume (budget of 2, F-4). Default: every muscle `normal`. */
export type MuscleStance = 'off' | 'normal' | 'emphasis';

/** Weekly training volume — the athlete's set-volume lever (default moderate). */

/** Training experience — the single biggest input to the cold-start starting weight. */
export type Experience = 'beginner' | 'intermediate' | 'advanced';

/** Athlete-Model mode (spec §6.1). Gates whether Hush may speak. */
export type AthleteMode =
  | 'UNAUTH'
  | 'AUTHED'
  | 'ONBOARDING'
  | 'CALIBRATING'
  | 'ADVISORY'
  | 'ADVISORY_AUTOPILOT_L1'; // gated, flag off in v1

export type PortraitState = 'PORTRAIT_LOCKED' | 'PORTRAIT_UNLOCKED';

export interface Profile {
  name?: string; // from auth provider; absent => identity block shows stats only (§10.2 UX)
  sex?: 'male' | 'female';
  heightCm?: number;
  weightKg?: number;
  /** The bodyweight Hush MET them at — written once, at onboarding, never edited (founder
   *  2026-07-13). The milestone ladders are cut from it (domain/milestones): a ladder anchored on
   *  the CURRENT weight would move every time the athlete edited their profile, and could take back
   *  a mark they had already earned. Absent on older profiles → they fall back to the current
   *  weight, which is what they were built from anyway. */
  startWeightKg?: number;
  age?: number;
  /** ISO instant age was last set/advanced — the auto-yearly-update anchor (founder
   *  2026-07-10: age is asked once; the app keeps it current by itself). Absent on
   *  older profiles → falls back to memberSince (see domain/profileAge). */
  ageUpdatedAt?: string;
  units: Units;
  goal: Goal;
  /**
   * THE VOICE COACH (docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md, 2026-09-08). Absent means ON:
   * the spec's whole point is that the phone stays in the pocket, so the voice is the default and
   * the screen is the fallback. `false` is the one switch in the You tab that turns it off.
   *
   * ⛔ `voiceSpec`, NOT `voiceCoach` (2026-09-09). The field was `voiceCoach` — the switch of the
   * phase-B "coach in her ear" the founder killed on 2026-09-08 — and a `false` he wrote into his
   * profile that day survived every build since, silencing the NEW voice with no sign (*"לא היה
   * שמע… ולא הופיע דיאלוג"*: no permission dialog means the gate shut before it). A dead feature's
   * switch is not this feature's switch: a fresh key starts everyone at the spec's default.
   */
  voiceSpec?: boolean;
  /**
   * ⛔ HER OWN WORDS, from onboarding (founder 2026-08-04, taking the chat out of the front door).
   *
   * Distinct from `goal`, which is an ENUM the product settled long ago (hypertrophy-first, one
   * value). This is the sentence she typed — "twelve weeks to a half marathon", "get my shoulder
   * working again" — and it is what the coach's whole programme is answerable to.
   *
   * `limitsText` is the same shape for what hurts or is refused. Both are prose on purpose: they are
   * the two things a form cannot hold, which is why they survived the chat being deleted.
   */
  goalText?: string;
  limitsText?: string;
  experience?: Experience; // drives starting weights; collected in onboarding
  daysPerWeek: number; // 1..6
  /** Engine v5 — her declared rep band (T). Absent on older profiles => default '8-10'. Also the
   *  v5-cohort marker (a set value opts the athlete onto the v5 engine) and the per-exercise fallback
   *  when a muscle has no override in `repBandByMuscle`. */
  repBand?: RepBandChoice;
  /** Engine v5 (Revision 7) — the rep band PER MUSCLE (register Part 9). Each exercise reads the band
   *  of its primary muscle (`exercise.muscle`); a muscle absent here falls back to `repBand`, then the
   *  '8-10' default. Set-once preference, edited in the body map — never asked in onboarding. Keyed by
   *  MuscleGroup. */
  repBandByMuscle?: Record<string, RepBandChoice>;
  /** Engine v5 — the body map: per-muscle stance. Absent on older profiles => every muscle 'normal'
   *  (the parity-preserving default). Keyed by MuscleGroup. */
  bodyMap?: Record<string, MuscleStance>;
  /**
   * v7 §13 — muscles resting because she said they hurt, each with the day it comes back.
   *
   * Kept BESIDE the map, never inside it: `bodyMap` is the map she drew, and a tender shoulder must
   * not quietly rewrite a decision she made. The programme is built from the two composed together
   * (`domain/painReport.effectiveBodyMap`), so when a window lapses the muscle returns to HER stance
   * with nothing to undo. Structural, so `domain/painReport` need not be imported here.
   */
  painEases?: {
    muscle: string;
    severity: 'twinge' | 'pain' | 'sharp';
    fromMs: number;
    untilMs: number;
    /**
     * When the coach was asked to check in on it, because the window had run out.
     *
     * ⛔ The window ending does NOT clear the ease — the founder's stone: *"after X time the system
     * has to tell him the time is up, ask how he feels, and ask whether we can release the injury
     * report."* A question about something already undone is not a question. So the rest stands,
     * this marks that she has been asked once, and her answer is what ends it.
     */
    askedAt?: number;
  }[];
  /** Engine v5 — minutes she has for a workout (the time-budget ceiling, S-64). Absent => 60. */
  workoutMinutes?: number;
  /**
   * ════ THE ROOM (2026-09-01, audit finding 06) — which equipment families exist where she trains. ═
   *
   * The engine assumed a full commercial gym for everyone: a home lifter with two dumbbells got a
   * week of machine rows and cable flys she cannot perform. This is the fix's whole storage: the
   * families her room actually offers, edited in You. ABSENT = every family (the parity default —
   * every existing athlete, every existing test, byte-for-byte the same programme). Bodyweight is
   * never listed because it is never absent from a room. Enforced at the two candidate chokepoints
   * — `pickExercises` (assembly) and the swap pool — via `domain/room.inRoom`; her OWN picks
   * (library choices, imports, the builder) are hers and are never filtered.
   */
  equipment?: import('@/data/exercises').EquipmentFamily[];
  /**
   * WHEN HER WEEK TURNS (2026-09-01, audit 07) — the JS weekday (0=Sun … 6=Sat) of the weekly roll.
   * Absent = Saturday, the founder's witnessable default. The hour stays 20:30 for everyone (one
   * product, one hour); only the DAY follows her calendar — most of the world's quiet evening is
   * Sunday, not Saturday. Applied at boot via `weekCadence.applyWeekOpenDow`; edited in You.
   */
  weekOpensDow?: number;
  healthConnected: boolean;
  /** ISO date the account was created (Profile §4.28 "Member since"). App-layer. */
  memberSince?: string;
}

/** Everything onboarding gathers before building the first program (§4.2–4.6). */
export interface OnboardingInputs {
  goal: Goal;
  /** Her own words — see `Profile.goalText`. The two things a form cannot hold. */
  goalText?: string;
  limitsText?: string;
  experience?: Experience;
  daysPerWeek: number;
  units: Units;
  healthConnected: boolean;
  name?: string;
  sex?: 'male' | 'female';
  heightCm?: number;
  weightKg?: number;
  age?: number;
  /** Engine v5 (Revision 7) — the body map set on the body-map onboarding screen. Its presence (via
   *  completeOnboarding's repBand default) is what puts a new athlete on the v5 engine. */
  bodyMap?: Record<string, MuscleStance>;
  /** How long she has for one session, when she told the coach so in the intake (`LearnedAboutHer`).
   *  Absent => the 60-minute default. No screen asks for it; only the conversation can produce it. */
  workoutMinutes?: number;
}

/** A frame-owned slot in a program day. */
export interface Slot {
  capability: Capability; // capability class is FIXED for the slot
  exerciseId: string;
  setCount: number;
  /**
   * ⛔ A REP RANGE WRITTEN ON THIS SEAT (founder 2026-09-07) — the model's per-lift band when it
   * wrote one (`buildPrompt` at `REPS_MIN`), written only by `planBuilder.setLiftBand`. Absent on
   * every engine-dealt and shelf-built slot: her profile band (per muscle, then the single choice,
   * then 8–10) answers exactly as it always did. The engine's `bandOf` reads this FIRST, so the
   * opening load is priced at this floor (S-38) and Loop 2 progresses inside this band — the same
   * arithmetic, a different pair of numbers. Never a load, never a rest.
   */
  repBand?: [number, number];

  // Supplemental work (currently: core) — included in the program but NOT a primary
  // progression target. One per week, 3 sets, placed last, preferring upper sessions.
  // Rendered like any slot; it just never drives capability load/progression.
  supplemental?: boolean;
  /**
   * ════ SUPERSET (founder mandate 2026-08-26): this slot and the NEXT run as one alternating
   * block — A, B, A, B, resting once per round. ════
   *
   * Written ONLY by the plan builder (`togglePair` — her verb); the engine never writes it today
   * (pairing as the time-cap's own instrument is a separate, register-tagged engine change).
   * Contract: pairs are ADJACENT and NEVER CHAIN (a slot may not carry this while the previous
   * slot does — no triplets), and both partners hold the SAME setCount (the builder syncs them).
   * `enginePlan` translates a pair into one `PlannedBlock` with two items, which the session
   * runner has always known how to interleave; `estimateSessionMinutes` prices the shared rest.
   * Any structural edit that breaks adjacency clears the mark (`planBuilder.clearPairAround`).
   */
  pairedWithNext?: boolean;
  // STABLE engine-slot identity (founder 2026-07-09), stamped at generation from the CANONICAL
  // blueprint pattern-occurrence order — NOT the display order. This decouples a slot's durable
  // identity from equipment clustering + engine swaps, so an engine swap/graduation never shifts
  // it (fixes findings 2 / V1). Absent on core / unmapped slots; deriveSlots falls back to the
  // positional id when absent (backward compatibility with pre-upgrade persisted programs).
  /** @deprecated v4 slot key — nothing reads it. v5 keys every decision to the EXERCISE, never to
     *  a slot (register Loop 2: "State is keyed to the exercise, never to a slot"), and S-29 deletes
     *  the `canonicalEngineId` unification this fed. Kept only so a persisted v4-era programme still
     *  parses; never written any more. */
  engineSlotId?: string;
}

export interface ProgramDay {
  id: string;
  name: string; // e.g. "Upper A"
  muscleGroups: string[]; // metadata line
  isRest: boolean;
  slots: Slot[];
  // Weekly Program Container: the workout's stable key for athlete-owned workout ordering
  // (the model's template index = session_index % weekly_frequency; persisted via
  // /preferences/order scope='workout' and consumed by compose_week's _ordered_template_indices).
  key?: string;
  // Weekly Program Container: this workout is finished for the week (backend status
  // 'completed'|'skipped'). The Program screen renders a completed workout green; Home advances
  // to the next UNFINISHED workout. Rest begins only after ALL of the week's workouts are done.
  completed?: boolean;
  // S-3 · THE DAY GENUINELY CANNOT FIT HER MINUTES. Set by the engine (generateProgram) when a day
  // is still over her declared budget after every legal cut — because every trained muscle is down
  // to its last lift (S-35's protected drops), so there is nothing left to cut without starving a
  // muscle. It is the ONE fact the engine already computed for telemetry (engine_cannot_fit_budget)
  // and used to throw away; carrying it here lets the surface SAY it, in words, rather than starve
  // a muscle in silence. Absent (the norm) whenever the day fits. Read-only: it changes no load,
  // volume, selection or order — enforceTimeCap has already run; this only reports its verdict.
  overBudget?: boolean;
  /*
   * ⛔ F-15 (`leanWarmup`) IS DELETED (founder 2026-08-30). It was the first cut an over-budget day
   * made — trim the bridges before a working set — and it existed only because the bridges were
   * compulsory and therefore priced. They are neither now: the ramp is offered at the station
   * (`warmupOffer`) and costs the promise nothing, so there is no warm-up minute to go lean on.
   * The flag is removed rather than left unread, which is how a field becomes a live-looking
   * surface that two builders still write and nothing consults.
   */
  /*
   * ════ DAY-LEVEL OWNERSHIP (founder, 2026-08-25 — the hybrid week) ════
   * On a program whose `authored` is 'engine', a day carrying `authored: true` is a day SHE wrote
   * in the plan builder: the engine preserves it byte-for-byte through every rebuild and assembles
   * its own days AROUND it — the weekly volume pot is reduced by what her days already deliver.
   * On a fully-authored program ('athlete_or_coach') the flag is redundant and unread.
   * Written ONLY by `domain/planBuilder.sealSmart` (the builder's diff-based seal); the engine
   * reads it and never writes it (`aWeekSheBroughtIsNotOursToRewrite` sweeps for that).
   */
  authored?: boolean;
  /**
   * ⛔ THE MIRROR OF `overBudget` — her minutes could not be FILLED (founder 2026-08-12).
   *
   * Set by the engine when a finished day comes out under `SESSION_MIN`, which happens when the map
   * she drew does not contain enough work to reach it: a map with one muscle left on produces
   * 25-minute sessions against the hour she asked for, and no arrangement can do better (F-1 caps a
   * block at five sets and a day may not repeat a movement).
   *
   * The week is CORRECT and it is not the week she thinks she asked for, so the surface says so.
   * Read-only, exactly like `overBudget`: it changes no load, volume, selection or order.
   */
  shortOfBudget?: boolean;
}

export interface Program {
  id: string;
  frequency: number;
  days: ProgramDay[];
  /**
   * ⛔ WHO WROTE THIS WEEK — and it decides whether the engine may ever rewrite it.
   *
   * FOUNDER, 2026-08-11: *"אסור למנוע שלנו לשנות את זה אלא רק לנהל את המתאמן בהסתמך על התוכנית
   * שהוא קיבל."*
   *
   * `'engine'` (or absent — every programme that exists today) is a week Hush generated. It may be
   * regenerated whenever her facts change, which is the whole point of it.
   *
   * `'authored'` is a week SHE brought: her own programme, or one her coach wrote for her. The
   * engine may not touch its shape — not the exercises, not the days, not the prescribed sets — and
   * that holds even when it breaks Hush's own rules. A 74-minute session stays 74 minutes. A muscle
   * under MEV stays under MEV. She was shown what we found and she chose to keep it, and a coach's
   * programme is not ours to improve.
   *
   * ⚠️ WHAT THE ENGINE STILL DOES IS THE LOADS. Loop 1 corrects the weight between sets from the
   * reps she just did, and Loop 2 decides the next session's load from the last one. Those are not
   * changes to the programme — they are the answer to "how heavy today", which no written plan can
   * contain and which is the reason she is using Hush at all.
   *
   * This is also the door for the COACH track: a coach writes the week, Hush runs the loads.
   */
  authored?: 'engine' | 'athlete_or_coach';
  /**
   * The AUTHOR'S title for the week, when it has one — today the model's (`BUILD_WEEK_SCHEMA.name`,
   * 2026-09-09). Shown by the reveal and the ready screen ahead of the shape heuristic in
   * `programmeName`. Absent for the engine's weeks, the shelves and a week she typed; those are
   * named by what their lifts make.
   */
  title?: string;
}

/** Reason types Hush may attach to a changed set (spec §4.4). */
export type ReasonType = 'increase' | 'decrease';

/** A model-provided target for one set of one exercise. */
export interface SetTarget {
  exerciseId: string;
  setIndex: number;
  /** Backend block id (HTTP model only) — needed to report sets against it. */
  blockId?: string;
  recommendedWeight: number | null; // null => bodyweight
  recommendedReps: number; // engine v5: this is Tlo, the band floor / target
  /** Engine v5 — Tlo, the band FLOOR, held immutably for Loop 1. `recommendedReps` starts equal to it,
   *  but the athlete's edit wheel (editCurrentSet) overwrites `recommendedReps` with her PERFORMED reps
   *  — so the live loop must read the band from here, or her reps would always sit "in band" and the
   *  load could never move (founder QA, Build #33). Absent on legacy/neutral targets => fall back to
   *  `recommendedReps`. */
  repBandLo?: number;
  /** Engine v5 — Thi, the top of her declared band (the "too light" mark Loop 1 reads). Absent on
   *  profiles with no declared T => the live loop falls back to a provisional window. */
  repBandHi?: number;
  /** Engine v5 — her fitted reps-per-rung for this lift (F-13), so Loop 1 sizes an in-session
   *  correction to HER number, not one cautious rung (B-5). Absent until enough like-for-like pairs
   *  exist, or for bodyweight → the live loop falls back to a single rung. */
  perRung?: number;
  /** A LIGHT WEEK is open (engine/v5/deload) — the live loop must not raise this load mid-session:
   *  a deliberately light bar always overshoots the band, and correcting it up would undo the
   *  engine's own decision. Down-corrections stay allowed (too heavy is too heavy, always). */
  deloadHold?: boolean;
  reasonType?: ReasonType; // present only on a changed set, ADVISORY only
  reasonDelta?: number; // for increase/decrease copy
}

/** A single logged set. Per-set actuals persisted at each Complete Set (§8.4). */
/**
 * A FREE-FORM session (screens/history/FreeLog, 2026-08-24) — work she did OFF the plan and told
 * us about afterwards: a friend's gym, a hotel, a PR day. Marked so the RECORD keeps everything
 * (History, tonnage, milestones, the weeks count, the clubs — a free-logged single can strike a
 * club) while the ENGINE folds none of it: a fun max attempt must never read as a failed floor,
 * and the engine coaches its own programme, not her holiday. It also never burns a trial session —
 * the trial gates coached training, not her right to keep her own record.
 */
export interface SetLog {
  exerciseId: string;
  setIndex: number;
  /** Backend block id (HTTP path) — carried so the set syncs to the right block. */
  blockId?: string;
  recommendedWeight: number | null;
  recommendedReps: number;
  actualWeight: number | null;
  actualReps: number;
  edited: boolean; // true if athlete used Edit Result
  /**
   * SHE CORRECTED THE RECORD AFTER THE FACT (2026-09-09, the formula report). A mis-typed set
   * could only ever be fixed by voice, mid-lift; every competitor lets the record be edited. The
   * stamp says WHEN she amended it, so a reader can tell a lift from a correction. What the
   * engine already folded from the original figures is NOT re-folded — a decision made on a
   * number she later changed stays a decision, with its reason on the record (`whatIsDoneStaysDone`
   * for the ledger, not the log).
   */
  amendedAt?: string;
  /** "Not a working set — excluded from every engine decision." Born as the Build-#33 approach
   *  mark (Rev 8 deleted that mechanism); since 2026-08-24 the WARM-UP RAMP writes it again
   *  (together with `isWarmup` below), deliberately reusing the one mark every fold reader
   *  already filters, so a warm-up can never leak into a decision through a missed filter. */
  isApproach?: boolean;
  /** A warm-up bridge set (domain/warmupRamp, 2026-08-24). Always accompanied by `isApproach`
   *  (the exclusion); this mark exists so surfaces can LABEL it honestly ("Warm-up"), and so the
   *  rest learner can tell a warm-up first-touch from a legacy approach measurement. */
  isWarmup?: boolean;
  /**
   * ⛔ A ROW THE SESSION CLOCK WROTE, NOT HER — builds 64–71 only (2026-09-07 → 2026-09-09).
   *
   * For two days the clock presumed a set done as written when its expected duration elapsed with
   * no word from her; the founder cancelled that outright on 2026-09-09 (*"הסט האוטומטי עדיין
   * קיים אפילו שאמרתי לך לבטל אותו לגמרי"*). NOTHING WRITES THIS MARK ANY MORE. It stays on the
   * model because records from those builds carry it, and they must keep reading as they did:
   * PRESENT (she was there, the plan passed through it) and NOT EVIDENCE (`actualWeight` /
   * `actualReps` are the prescription copied across). `domain/setEvidence` holds the two
   * predicates; every reader of a log asks one of them and never the raw marks.
   *
   * An engine mark in the `isWarmup`/`isApproach` family, exactly as the ruling below requires.
   */
  presumed?: true;
  /*
   * ⛔ NO `tag` HERE, AND NO SET-TYPE OF ANY KIND SHE AUTHORS (founder ruling, 2026-08-24).
   * A 'failure' | 'drop' tag lived on this model for a few hours. The ruling that removed it is
   * the product's thesis: the programme decides what a set IS, in advance, so that during the
   * workout she thinks about nothing and only executes. A drop set she invents at the bar is the
   * engine transcribing instead of coaching. When drop sets ship, they ship as a PRESCRIPTION and
   * carry the engine's own mark — the shape `isWarmup`/`isApproach` above already sets. Pinned by
   * `theEngineDecidesWhatASetIs`.
   */
  persistedAt: string; // ISO
  /**
   * Seconds of rest ACTUALLY taken immediately before this set (engine v5 · Stage 0 · law L3).
   *
   * The engine may only compare a set to a set taken under similar conditions. Without this
   * number every rep comparison is corrupt: an athlete who shortens her rest and drops a rep
   * looks identical to an athlete whose load is too heavy — and the engine would cut the load
   * when the load was never the problem. It is also what makes the time budget real (the 60-min
   * cap is otherwise computed from a per-set constant that ignores rest entirely).
   *
   * Absent when there was no rest to measure: the first set of a session, a resume across an app
   * kill that landed between the rest ending and the set being logged, and every set logged
   * before this field existed. Absent means UNKNOWN — such a set is usable for load history but
   * is excluded from any rest comparison. It never means zero.
   */
  restBeforeS?: number;
}

export type SessionState = 'ACTIVE' | 'SAVED';

/** Closing summary for the Complete screen, computed at finalize (§4.18 / design). */
export interface SessionSummary {
  workoutName: string;
  sets: number; // sets logged this session
  progressed: number; // distinct lifts whose load increased this session
  durationMs: number; // start → finish
  earlyFinish: boolean;
  /**
   * This occurrence's `startedAt` in ms — the key every engine decision it earned is stamped with
   * (`changeLog[].at`). Complete asks the engine what the workout bought using this.
   *
   * It travels on the SUMMARY rather than being re-read from history on the far side, so the ask is
   * independent of a storage read that can fail. Reading it back from history meant a failed
   * `loadHistory` left the screen claiming "setting your next loads" forever — a spinner that could
   * never resolve, promising work nobody was doing.
   */
  startedAtMs: number;
  /** The session FINISHED the workout for the week (>= half the prescribed sets — see
   *  domain/completion). False = a partial session: real work, saved and folded by the
   *  engine, but the workout stays on this week's list. */
  trained?: boolean;
}

/**
 * ════ HOW HARD IT WAS (2026-07-31) ════
 *
 * The one thing the record never held, and the one the coach needs most.
 *
 * A load and a rep count do not say whether the third set was a grind or a stroll. Two athletes
 * both finish 4x10 at 40 kg; one walks away with five reps still in the tank, the other barely
 * survived the last two. **They need opposite decisions next week**, and nothing in the record
 * could tell them apart — so the answer was a guess, and a guess is the thing this product forbids.
 *
 * Three levels, not ten. A scale finer than the athlete's own certainty invents precision: nobody
 * standing over a bar with their heart at 160 can honestly separate a 7 from an 8. These three are
 * the distinctions she can actually make, and they are the three that change what happens next.
 *
 * Asked ONCE PER EXERCISE, never per set — per set it is a toll on every rep of every workout, and
 * the answer barely moves between the sets of one lift.
 */
// the last reps were everything she had

/** Her answer for one exercise in one session. Absent = she was not asked, or did not answer. */

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT SHE ACTUALLY DID — the record, in every shape the coach can prescribe.
 *
 * `SetLog` can only describe a weight for a number of reps. It REQUIRES `actualReps` and carries
 * `actualWeight`, so **a 45-second plank cannot be written down at all** — and neither can a 400 m
 * repeat, a 40 m carry, or five minutes of mobility. The stage learned to run those; this is where
 * they land. Without it the new shapes are a demo.
 *
 * ── WHY THIS SITS BESIDE `sets` AND NOT INSTEAD OF IT (yet) ─────────────────────────────────────
 * `session.sets` is read in 126 places across 20 files, including the WATCH PROTOCOL and the Live
 * Activity — Swift, which cannot be compiled on the machine this is written on. A hard cutover
 * would be a change I could not verify, on the two surfaces where a silent break is invisible until
 * a device runs it.
 *
 * So `items` is the canonical record from here on, and a REPS item is written to both while the
 * consumers move across. That is a strangler, not a compromise, and it has a stated end:
 *
 *   > **`sets` dies when the session machine stops taking `SetTarget[]`** — the same change that
 *   > deletes the programme generator, and the same one that needs the transport. One migration,
 *   > not two.
 *
 * Until then the invariant is simple and testable: every reps item has a matching `SetLog`, and no
 * other shape appears in `sets` at all — a plank must never be written as zero reps at zero kg,
 * which is the lie this whole type exists to avoid.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Where in the session an item sat — the coach's blocks and rounds, as she met them. */
interface ItemResultBase {
  /** A catalogue lift id or a movement id. */
  ex: string;
  /** 1-based, from `domain/planRun`: which block, which round of it, which position in the round. */
  block: number;
  round: number;
  position: number;
  /** Seconds rested immediately BEFORE this item (L3). Absent = unknown, never read as 0. */
  restBeforeS?: number;
  /** ISO instant it was written. */
  at: string;
}

/** A weight for a number of reps — the shape the app has always had. */
export interface RepsResult extends ItemResultBase {
  kind: 'reps';
  /** What she lifted. null = bodyweight. */
  load: number | null;
  reps: number;
  /** She corrected it by hand rather than taking what was proposed. */
  edited?: boolean;
  /** The same mark as `SetLog.presumed` — records from builds 64–71 only; nothing writes it now. */
  presumed?: true;
}

/** Held or worked for a duration. `seconds` is what she ACTUALLY held — see `TimeStage`. */
export interface TimeResult extends ItemResultBase {
  kind: 'time';
  seconds: number;
  /** What was asked for, so the gap between the ask and the result is readable. */
  askedSeconds: number;
  load?: number | null;
}

/** Covered. Metres always — one unit in the record, converted only for display. */
export interface DistanceResult extends ItemResultBase {
  kind: 'distance';
  metres: number;
  askedMetres: number;
  /** How long it took, when anything measured it. */
  seconds?: number;
  load?: number | null;
  /** A GPS activity holds the pace, the splits, the heart rate and the route — never copied here. */
  activityId?: string;
}

/** No number worth stating. It happened, or it did not. */
export interface OpenResult extends ItemResultBase {
  kind: 'open';
}

export type ItemResult = RepsResult | TimeResult | DistanceResult | OpenResult;

export interface Session {
  id: string;
  programDayId: string;
  /** Did this session TRAIN the workout (>= half its prescribed sets — domain/completion)?
   *  Stamped at save so the verdict is durable and retroactively readable: the workout-COUNT
   *  milestones ("N workouts") only count trained sessions, since that family is about whole
   *  workouts. Every other milestone family (tonnage / clubs / engine) counts a partial's work
   *  in full — the athlete lifted it (founder 2026-07-11). Absent on sessions saved before the
   *  rule => counted (they finished the workout under the old law). */
  trained?: boolean;
  /** A FREE-FORM log (see the note above `SetLog`) — kept whole in the record, folded by nothing:
   *  the engine skips it, the trial never counts it, and no planned workout is marked done by it. */
  freeform?: boolean;
  // Day name captured AT START so History reads stably even after the program
  // regenerates with fresh day ids (the backend composes a new id per session).
  // Optional: sessions saved before this field fall back to a program lookup.
  programDayName?: string;
  /**
   * ⛔ TRAINED TOGETHER (founder, 2026-08-23: the social mandate — *"אפשר לעשות שגם מסך האימון
   * ממש מציג עם מי היה האימון המשותף"*). The people she trained WITH, by the names she gave them —
   * a fact of the session, shown on the finish poster and carried onto the story card. v1 is
   * names she writes; the live shared-session (CloudKit circles) will fill this from the pairing
   * when it lands, on the same field — the record's shape is the contract, not the mechanism.
   */
  partners?: string[];
  /**
   * HOW MUCH WORK THIS SESSION WAS PRESCRIBED, stamped at START.
   *
   * `sessionTrained` used to answer "did she finish the workout?" by looking the programme day up
   * and counting its slots. That lookup has two failure modes and the second is new:
   *
   *   · the programme changed shape since — the case the old comment already named;
   *   · a COACH session has no `ProgramDay` to look up AT ALL, and the fallback for an unknown
   *     prescription is "any logged work counts". So one set would have finished the workout,
   *     burned a free trial session and marked the week's workout done.
   *
   * Stamping it at start removes both. The number is what she was actually asked to do, by
   * whoever asked. Absent on sessions saved before this field — those fall back to the old lookup.
   */
  prescribed?: number;
  /**
   * SHE SAID SHE WAS DONE (2026-09-07 — the session runs itself).
   *
   * The clock never ends a session. So a session reaches SAVED either by her word — the finish
   * control, or "done" by voice or wrist — or by salvage after the resume window. This is the
   * difference, stamped at save. `sessionTrained` counts a PRESUMED set (builds 64–71) toward the
   * workout only under her word: a session whose sets the clock wrote
   * while the phone sat in a locker, never finished by her, is judged on what she actually said.
   * Absent on every session saved before the field existed (those were all finished by hand).
   */
  finishedByAthlete?: true;
  startedAt: string;
  state: SessionState;
  earlyFinish: boolean;
  sets: SetLog[];
  /**
   * ONE NUMBER PER WORKOUT (founder 2026-07-28).
   *
   * Active kilocalories as the WRIST MEASURED them, present only on a session the watch executed
   * standalone. Everywhere else Hush estimates (`strengthSessionKcal`: MET × bodyweight × hours),
   * and the estimate is honest — but the two are different numbers, and a workout that reads 412
   * on her wrist and 380 in her Log is the kind of small lie that costs more trust than the extra
   * accuracy buys. So whichever surface was the AUTHORITY produces the figure, and the other
   * renders what it is handed: read it through `domain/energy.sessionKcal`, never re-derived.
   */
  measuredKcal?: number;
  // Owner-voice History annotation — present only when Hush acted or the athlete
  // ended early (spec §4.10, §2.10). `annotationCapability` carries the load noun.
  annotation?: HistoryAnnotation;
  annotationCapability?: Capability;
  /**
   * Everything she did, in every shape — see `ItemResult`.
   *
   * The canonical record. `sets` is the legacy rep-only view kept in step until the session machine
   * moves off `SetTarget[]`; absent on every session written before this existed.
   */
  items?: ItemResult[];
}

/** Portrait snapshot stored at each program construction (spec §8.4). */
export interface PortraitSnapshot {
  timestamp: string;
  perCapability: Record<Capability, number>; // relative-to-standard score (rendered as bar length)
  confidence: Record<Capability, number>; // internal; NEVER displayed
  stillLearning: Record<Capability, boolean>;
}

export type HistoryAnnotation = 'increased' | 'swapped' | 'ended_early' | null;

/* ----------------------------------------------------------------------------
 * Cardio — "Open training" (run / walk). Recorded, NEVER coached. A deliberate
 * departure from the rest of Hush: the v4 strength engine does not see any of
 * this — it never influences load, progression, volume, frequency, exercise
 * selection, or programming. Cardio activities are simply logged and surfaced
 * in the single unified History timeline alongside strength sessions.
 * -------------------------------------------------------------------------- */
export type CardioGait = 'run' | 'walk';
export type CardioGoalKind = 'open' | 'distance' | 'time';

/** One kilometre split of a recorded cardio activity (pure data, never graded). */
export interface CardioSplit {
  km: number; // which kilometre (1-indexed)
  durationSec: number; // seconds spent on this km
  paceSec: number; // sec per km (this split)
  gait: CardioGait; // gait held during this km
  /** This kilometre's own burn (founder 2026-08-24: each kilometre's row carries its time AND its
   *  calories). Stamped at the split's cut from the pace it was covered at; absent on splits saved
   *  before the field, and on runs with no bodyweight — the row then shows time alone. */
  kcal?: number;
}

/** One GPS fix on the route actually travelled. */
export interface CardioPoint {
  lat: number;
  lon: number;
}

/** A recorded run/walk. Stored in History; opening it shows its own activity
 *  details (distance, duration, pace, heart rate, calories, route) — no coaching. */
export interface CardioActivity {
  kind: 'cardio'; // discriminator in the unified History timeline
  id: string;
  gait: CardioGait; // the chosen mode
  startedAt: string; // ISO
  durationSec: number;
  distanceKm: number;
  avgPaceSec: number; // sec/km
  avgHr?: number; // bpm — present only when a heart-rate source was available
  calories?: number; // kcal — present only when estimable
  splits: CardioSplit[];
  /**
   * The path travelled (founder 2026-07-12). Absent on activities recorded before routes
   * existed, and on any activity with no GPS lock — a run indoors on a treadmill has no
   * route, and the summary simply omits the trace rather than drawing a lie.
   */
  route?: CardioPoint[];
}

/** Unified History timeline entry: a completed strength Session or a recorded
 *  CardioActivity. Sessions are tagged `kind:'strength'` at merge time. */
export type HistoryItem = ({ kind: 'strength' } & Session) | CardioActivity;
