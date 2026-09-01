/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SHARED SESSION — two athletes, one bar, one clock. The pure half. (2026-08-31)
 *
 * Founder: *"אם נניח ואני רוצה ללכת להתאמן עם אחי ושנעשה את אותו האימון בסנכרון מושלם."*
 * Design: `_v7_handoff` §11.2 — *"Same bar, alternating sets. The screen shows whose turn it is and
 * holds each person's own weight — never side-by-side to rank, but stacked to hand off."*
 *
 * Everything in this file is a FUNCTION OF TWO FACTS AND A PLAN. No I/O, no clock of its own, no
 * imports. `docs/architecture/SHARED_SESSION_V1.md` is the design; this is the part of it that can
 * be proved.
 *
 * ── ⛔ THE ONE DECISION THIS FILE EXISTS TO ENFORCE: THE WIRE CARRIES STATE, NEVER DELTAS ────────
 *
 * A phone does not send "I finished a set". It sends **how many sets it has finished**, of every
 * lift, every time anything changes. `SharedProgress.done` is a whole vector, not an increment.
 *
 * That single choice deletes the entire family of bugs this feature would otherwise be made of:
 *
 *   · a frame LOST on gym wifi costs nothing — the next one carries the truth anyway;
 *   · a frame DUPLICATED costs nothing — applying it twice is applying it once;
 *   · a frame ARRIVING OUT OF ORDER costs nothing — `v` says which is newer and the older is dropped;
 *   · a phone that was ASLEEP for four minutes needs no catch-up protocol — it sends where it is.
 *
 * There is no reconciliation algorithm here because there is nothing to reconcile. Whose turn it
 * is, which lift the pair is on, how far each of them is through it — every one of those is
 * DERIVED, on both phones, from the same two vectors (`sharedStanding`). Nothing negotiates, so
 * "we both think it is our turn" is not a bug that can be written.
 *
 * ── WHAT MAY CROSS THE WIRE, AND THE ONE THING THAT SURPRISED ME ────────────────────────────────
 *
 * `domain/circle` keeps the standing law for what may be said about a person: a first name, and
 * workouts done of planned. No loads, no history, no bodyweight. `domain/planShare` keeps the same
 * law for a plan — *"the card IS the payload — no weight is in it."*
 *
 * ⚠️ AND YET `bar` BELOW CARRIES A WEIGHT. That is a deliberate exception, and this is its reason.
 *
 * The law those two files keep is about **stored, published facts about an athlete's training** —
 * a feed, a card, a week. This is not that. Two brothers are standing at one bench, and the single
 * most useful sentence either of them says out loud is *"strip it to thirty."* The number on the
 * bar is not a fact about her; it is a fact about **the equipment they are both touching**, and
 * withholding it does not protect her — it just makes one of them do arithmetic while the other
 * waits. So:
 *
 *   · it is the CURRENT lift's next set, and nothing else. Not a history, not a best, not a total.
 *   · it is NEVER STORED. Not in KV, not in the Durable Object, not in either phone's record. It is
 *     relayed between two open sockets and dropped. When the pair ends it has never existed.
 *   · it is OPTIONAL AT THE TYPE LEVEL (`bar?`), because she can turn it off in one tap, and every
 *     reader must already handle its absence. With it off the hand-off still works: the partner's
 *     row says the lift and the set, and the plates are his business.
 *
 * A key added to `SHARED_PROGRESS_KEYS` is a decision, with this header to answer to.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

/** Bump on any incompatible change to the frames below. A phone rejects a shape it cannot read. */
export const SHARED_PROTOCOL_VERSION = 1 as const;

/**
 * How long a frame stays worth believing.
 *
 * The exact mirror of `WATCH_INTENT_TTL_MS`, and for the identical reason — that constant's header
 * documents a two-authority bug where a stale `start_workout` arrived after the wrist had already
 * begun a workout locally. A pair is the same bug with a second phone instead of a wrist. Late is
 * a kind of wrong, and it gets the same wall.
 */
export const SHARED_INTENT_TTL_MS = 15_000;

/**
 * How long the bar waits for a partner who has stopped answering.
 *
 * Founder ruling 3 (2026-08-31): two people. So when the other one goes silent there is nobody
 * left to hand off to, and the honest thing is to say so and let her train. Three minutes is long
 * enough to survive a phone in a bag, a lift that ran long, a walk to the water fountain — and
 * short enough that she is never left staring at a screen waiting for a brother who went home.
 */
export const SHARED_STALE_TURN_MS = 180_000;

/**
 * ⛔ HOW LONG A SWAP PROPOSAL WAITS FOR AN ANSWER.
 *
 * Founder ruling 1 (2026-08-31): a swap is PROPOSED, and the pair survives either answer. Which
 * means the athlete who proposed it is standing at a machine she cannot use until her partner
 * answers — and he is two metres away, so the answer takes seconds.
 *
 * ⚠️ BUT IT MUST HAVE AN END. He put his phone down, he walked to the water fountain, his battery
 * died: without this she is held at a busy station for ever by a question nobody is reading. A
 * proposal that times out is treated exactly as a decline — nothing changes, both keep training,
 * and she is told in one line rather than left watching a spinner.
 */
export const SHARED_SWAP_WAIT_MS = 25_000;

/** Two. Not three, not six (founder ruling 3). A rotating turn destroys the rest model below. */
export const SHARED_PAIR_SIZE = 2;

/** Unambiguous invite alphabet + length — the SAME as the circle's, so one habit covers both. */
export const SHARED_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const SHARED_CODE_LENGTH = 6;

// ───────────────────────────── the allow-lists ─────────────────────────────

/** One lift of the shared plan. The order of the array IS the order of the workout. */
export const SHARED_LIFT_KEYS = ['exerciseId', 'sets'] as const;

/** The plan, as the host publishes it. `v` rises on every accepted change (a swap). */
export const SHARED_PLAN_KEYS = ['v', 'lifts'] as const;

/** ⛔ THE WHOLE SURFACE OF WHAT ONE ATHLETE SAYS ABOUT HERSELF. See the header on `bar`. */
export const SHARED_PROGRESS_KEYS = ['v', 'name', 'presence', 'done', 'at', 'bar'] as const;

/**
 * What goes on the bar for the sender's NEXT set — and WHICH LIFT that is for.
 *
 * ⛔ `exerciseId` IS NOT DECORATION, IT IS THE GUARD. A frame says "42.5 × 8"; the receiving screen
 * draws it beside whatever lift the pair's station happens to be. Those are the same lift almost
 * always and NOT the same lift exactly when it matters — one of them is a station ahead, one of
 * them swapped, one of them is on a warm-up bridge. A number printed against the wrong lift is the
 * defect class this codebase hunts hardest: confident, plausible, and wrong. So the number carries
 * its subject and the reader checks it (`PairStrip`).
 *
 * Never stored, anywhere. See the file header for why this weight crosses at all.
 */
export const SHARED_BAR_KEYS = ['exerciseId', 'kg', 'reps'] as const;

/** Every key that may appear anywhere in a frame — the fence `payloadIsWithinAllowList` checks. */
const ALL_ALLOWED_KEYS: readonly string[] = [
  ...SHARED_LIFT_KEYS,
  ...SHARED_PLAN_KEYS,
  ...SHARED_PROGRESS_KEYS,
  ...SHARED_BAR_KEYS,
];

// ───────────────────────────── the shapes ─────────────────────────────

/** Who opened the pair, and who walked into it. Decides nothing but ties (see `turnAtLift`). */
export type SharedRole = 'host' | 'guest';

/**
 * What the partner is doing, in the only four words the other screen needs.
 *
 * Projected from the session machine and nothing else, so the two phones cannot describe the same
 * athlete differently: SET_PRESENTED → lifting, REST_* → resting, PAUSED → paused, and anything
 * past the last set → done.
 */
export type SharedPresence = 'lifting' | 'resting' | 'paused' | 'done';

/** What goes on the bar for the sender's next set — the hand-off number, live and unstored. */
export interface SharedBar {
  /** The lift this number is for. A reader that cannot match it draws no number at all. */
  exerciseId: string;
  kg: number;
  reps: number;
}

export interface SharedLift {
  exerciseId: string;
  /** WORKING sets. A warm-up bridge is nobody else's business — see `sharedPlanFromSteps`. */
  sets: number;
}

/** The structure, and only the structure. The host owns it; `v` rises on every accepted swap. */
export interface SharedPlan {
  v: number;
  lifts: SharedLift[];
}

/**
 * One athlete's whole position, as a snapshot. NOT an increment — see the file header.
 *
 * `done[i]` is how many working sets of `plan.lifts[i]` this athlete has finished. Its length is
 * allowed to disagree with the plan's (a phone that has not yet seen a new plan version); every
 * reader below indexes defensively and treats a missing entry as zero, which is what it means.
 */
export interface SharedProgress {
  /** The plan version this vector was measured against. A vector counted against an older plan is
   *  still usable — the lifts before the swap did not move — and `sharedStanding` says so. */
  v: number;
  name: string;
  presence: SharedPresence;
  done: number[];
  /** Epoch ms this snapshot was taken, by the sender's clock. Only ever compared to the room's
   *  clock through `at` on arrival — never subtracted from the other phone's `at` (§7 row 8). */
  at: number;
  bar?: SharedBar;
}

// ───────────────────────────── building the plan ─────────────────────────────

/** The only shape `sharedPlanFromSteps` needs of a step — structural, so this file stays pure. */
export interface PlanStepShape {
  exerciseId: string;
  /** 0-based within the exercise; NEGATIVE on a warm-up bridge (see `sessionStore.Step`). */
  exerciseSetIndex: number;
}

/**
 * The host's live plan, reduced to the only thing the pair needs: which lifts, in which order,
 * for how many working sets.
 *
 * ⛔ WARM-UP BRIDGES ARE EXCLUDED, AND THAT IS A PRODUCT DECISION, NOT A FILTER.
 *
 * A ramp is a bridge to a load — HER load, computed from HER working weight, offered by HER disc
 * at the moment SHE asks for it (`domain/warmupRamp`). Two athletes at one bench warm up to two
 * different places, at two different times, and pretending that is a shared, turn-taking step
 * would make the pair wait on a set that means nothing to it. Each of them warms up as they always
 * have; the pair begins at the first working set, which is the first set there is anything to
 * share about.
 *
 * Contiguous runs, in order, so a plan that returns to a lift later expresses it as a second
 * entry rather than silently merging two stations into one.
 */
export function sharedPlanFromSteps(steps: readonly PlanStepShape[], v = 1): SharedPlan {
  const lifts: SharedLift[] = [];
  for (const st of steps) {
    if (st.exerciseSetIndex < 0) continue; // a bridge, not a working set
    const last = lifts[lifts.length - 1];
    if (last && last.exerciseId === st.exerciseId) last.sets += 1;
    else lifts.push({ exerciseId: st.exerciseId, sets: 1 });
  }
  return { v, lifts };
}

/** The only shape the done-vector needs of a logged set. Structural, for the same reason. */
export interface LoggedSetShape {
  exerciseId: string;
  setIndex: number;
}

/**
 * Her position, as the vector the wire carries: working sets finished, per lift of the SHARED plan.
 *
 * ── ⛔ COUNTED AGAINST THE PAIR'S PLAN, NOT AGAINST HER OWN STEP LIST ────────────────────────────
 *
 * The obvious implementation walks her local plan and counts what is logged against it. It is
 * wrong, and it is wrong in a way that only shows up in a real gym:
 *
 *   · the GUEST's plan is built by his own engine from the host's lift list, so his step list is
 *     his — same lifts, but his warm-up bridges, his set targets, his `buildPlan`;
 *   · either of them can REORDER their own workout mid-session (`markEquipmentOccupied` — the
 *     squat rack is busy, so that lift moves one position later);
 *   · a swap changes one lift on one phone before the other has answered.
 *
 * Any of those makes "index 2 of my plan" and "index 2 of his plan" different lifts, and a turn
 * derived from mismatched indices is two screens confidently disagreeing. So the plan the pair
 * shares is the ONLY index either side counts against, and each of them simply answers the same
 * question about it: *how many sets of this lift have I logged?*
 *
 * ⚠️ A LIFT THE WORKOUT VISITS TWICE fills its occurrences IN ORDER — the first station takes its
 * full count before the second is credited with anything, which is the order they are performed in.
 *
 * ⚠️ A WARM-UP BRIDGE COUNTS FOR NOTHING (its `setIndex` is negative — `sessionStore.Step`), so a
 * ramp can never make the pair believe she has taken a turn.
 */
export function sharedDoneAgainstPlan(plan: SharedPlan, logged: readonly LoggedSetShape[]): number[] {
  const spent: Record<string, number> = {};
  return plan.lifts.map((lift) => {
    const total = logged.filter((l) => l.exerciseId === lift.exerciseId && l.setIndex >= 0).length;
    const already = spent[lift.exerciseId] ?? 0;
    const mine = Math.max(0, Math.min(lift.sets, total - already));
    spent[lift.exerciseId] = already + mine;
    return mine;
  });
}

// ───────────────────────────── the derivation ─────────────────────────────

/** Sets of lift `i` this athlete has finished. A short vector means zero, not unknown. */
const doneAt = (p: SharedProgress | null, i: number): number =>
  p && Number.isFinite(p.done[i]) ? Math.max(0, Math.trunc(p.done[i])) : 0;

/**
 * Whose set is next at one lift — the whole turn rule, in five lines, derived from facts both
 * phones already hold.
 *
 * The alternation is `host, guest, host, guest…`, and it falls out of a comparison rather than
 * being assigned: whoever has done fewer sets here is up, and the host takes the tie, which is
 * every odd set. When one of them has finished the lift the other simply keeps the bar.
 *
 * ⛔ NOTHING NEGOTIATES THIS. Two phones holding the same two vectors compute the same answer, in
 * any order, with any frames lost — which is why there is no "whose turn is it really" message in
 * the protocol, and no state on the server that could disagree with either screen.
 */
export function turnAtLift(hostDone: number, guestDone: number, sets: number): SharedRole | null {
  const hostLeft = hostDone < sets;
  const guestLeft = guestDone < sets;
  if (!hostLeft && !guestLeft) return null; // the lift is finished by both
  if (!guestLeft) return 'host';
  if (!hostLeft) return 'guest';
  return hostDone <= guestDone ? 'host' : 'guest';
}

/**
 * ⛔ A PARTNER CAN ONLY LENGTHEN A REST, NEVER SHORTEN ONE.
 *
 * The direction is not symmetric and the asymmetry is the whole point:
 *
 *   · he is still under the bar when her 90 s is up → **she waits.** The bar is occupied; there is
 *     nothing else honest to show her.
 *   · he racks it after 40 s → **she still rests the 90 s the engine prescribed.** The bar being
 *     free is not a reason to be recovered.
 *
 * So the engine keeps its authority over recovery exactly as it has it in a solo session, and the
 * partner is only ever able to add. Expressed as an ABSOLUTE INSTANT for the same reason
 * `sessionMirror` states its rest that way — *"so a surface renders a drift-proof timer even under
 * transport latency"* — and two phones on gym wifi is that case, harder.
 *
 * `barFreedAtMs` null means the bar is still busy: there is no instant yet, and `null` is returned
 * rather than a guess. The screen draws "waiting", never a countdown to a moment it invented.
 */
export function sharedRestEndsAt(ownRestEndsAtMs: number, barFreedAtMs: number | null): number | null {
  if (barFreedAtMs == null) return null;
  return Math.max(ownRestEndsAtMs, barFreedAtMs);
}

/** Where the pair is, and what each screen draws. The one derivation both phones run. */
export interface SharedStanding {
  /** Index into `plan.lifts` of the station the pair is at. Null = the shared work is finished. */
  liftIndex: number | null;
  exerciseId: string | null;
  /** Whose set is next at that station. Null when there is none (the work is finished). */
  turn: SharedRole | null;
  /** True when the next set at the shared station is HERS. */
  mine: boolean;
  /** Set n of m at this lift, for each side. `n` is the set they are ABOUT to do (1-based),
   *  clamped to `m` once they are finished with it. */
  mineSet: { n: number; m: number };
  theirsSet: { n: number; m: number };
  /**
   * The partner has stopped answering (`SHARED_STALE_TURN_MS` since his last frame) AND the bar is
   * his. There is nobody to hand off to; the caller dissolves the pair and she trains on.
   *
   * Deliberately false while the bar is HERS — a silent partner does not stop her own set, and a
   * pair that dissolved because he put his phone down between sets would be a worse product than
   * one that waited.
   */
  stale: boolean;
  /** The partner is counting against an older plan (a swap he has not seen yet). */
  behindOnPlan: boolean;
}

export function sharedStanding(inputs: {
  plan: SharedPlan;
  role: SharedRole;
  mine: SharedProgress | null;
  theirs: SharedProgress | null;
  nowMs: number;
}): SharedStanding {
  const { plan, role, mine, theirs, nowMs } = inputs;
  const host = role === 'host' ? mine : theirs;
  const guest = role === 'host' ? theirs : mine;

  let liftIndex: number | null = null;
  for (let i = 0; i < plan.lifts.length; i++) {
    if (turnAtLift(doneAt(host, i), doneAt(guest, i), plan.lifts[i].sets) != null) {
      liftIndex = i;
      break;
    }
  }

  if (liftIndex == null) {
    const last = Math.max(0, plan.lifts.length - 1);
    const m = plan.lifts[last]?.sets ?? 0;
    return {
      liftIndex: null,
      exerciseId: null,
      turn: null,
      mine: false,
      mineSet: { n: m, m },
      theirsSet: { n: m, m },
      stale: false,
      behindOnPlan: false,
    };
  }

  const lift = plan.lifts[liftIndex];
  const turn = turnAtLift(doneAt(host, liftIndex), doneAt(guest, liftIndex), lift.sets);
  const setOf = (p: SharedProgress | null) => {
    const d = doneAt(p, liftIndex);
    return { n: Math.min(d + 1, lift.sets), m: lift.sets };
  };

  const isMine = turn === role;
  const theirsAt = theirs?.at ?? null;
  return {
    liftIndex,
    exerciseId: lift.exerciseId,
    turn,
    mine: isMine,
    mineSet: setOf(mine),
    theirsSet: setOf(theirs),
    stale: !isMine && (theirsAt == null || nowMs - theirsAt > SHARED_STALE_TURN_MS),
    behindOnPlan: theirs != null && theirs.v < plan.v,
  };
}

// ───────────────────────────── the guards ─────────────────────────────

/**
 * Is this frame newer than the one already held?
 *
 * ⛔ ORDERED BY THE SENDER'S OWN CLOCK, AND ONLY THEN BY PLAN VERSION. The first build had it the
 * other way round — plan version first, `at` as the tiebreak — and it reads perfectly until you ask
 * what happens to a partner who has not yet received a new plan:
 *
 *     she swaps a lift → her plan goes to v2 → every frame he sends still says v1
 *     → `incoming.v > current.v` is false → **his frames are dropped, and keep being dropped**
 *
 * On a good connection that is one round trip. On a phone that went into a pocket at the wrong
 * moment it is the rest of the workout: her screen shows him frozen at the set he was on when the
 * versions parted, and nothing ever un-freezes it, because the only thing that could is a frame
 * being refused.
 *
 * A vector counted against an older plan is still THE LATEST THING THAT ATHLETE HAS SAID. It is
 * accepted, and `sharedStanding` flags the mismatch as `behindOnPlan` so a screen can decline to
 * draw a TURN it cannot stand behind — which is the honest place for that judgement, one layer up
 * from the transport.
 *
 * Equal instants are a duplicate, and a duplicate is refused rather than applied — not because
 * applying it would corrupt anything (a state snapshot is idempotent by construction) but because
 * a screen that re-renders on every redelivered frame is a screen that flickers.
 */
export function acceptsFrame(current: SharedProgress | null, incoming: SharedProgress): boolean {
  if (!current) return true;
  if (incoming.at !== current.at) return incoming.at > current.at;
  return incoming.v > current.v; // the same instant, read against a newer plan
}

/** Has this frame sat around too long to act on? (`SHARED_INTENT_TTL_MS`, the wrist's rule.) */
export function frameIsStale(frameAtMs: number, nowMs: number): boolean {
  return nowMs - frameAtMs > SHARED_INTENT_TTL_MS;
}

/**
 * ⛔ THE FENCE. Every key, at every depth, must be one this file named.
 *
 * Not a formality: it is the only mechanical thing standing between a future edit and a load, a
 * bodyweight or a history leaving the phone by accident. Called on the way OUT (the client refuses
 * to send a payload that fails) and asserted by the law, so the check cannot be quietly deleted.
 */
export function payloadIsWithinAllowList(payload: unknown): boolean {
  const walk = (v: unknown, depth: number): boolean => {
    if (depth > 4) return false; // nothing legitimate here nests that far
    if (v === null || typeof v !== 'object') return true;
    if (Array.isArray(v)) return v.every((e) => walk(e, depth + 1));
    return Object.entries(v as Record<string, unknown>).every(
      ([k, val]) => ALL_ALLOWED_KEYS.includes(k) && walk(val, depth + 1),
    );
  };
  return walk(payload, 0);
}

// ───────────────────────────── reading what arrived ─────────────────────────────
//
// Rebuilt FIELD BY FIELD, exactly as `server/hush-identity/src/index.ts` rebuilds the circle's week: whatever the
// far side sent, what this app holds is what these functions built. An unknown key does not
// survive the trip, so a tampered — or simply newer — peer cannot put anything into this phone's
// memory that this file did not name.

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, max) : null;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const PRESENCES: readonly SharedPresence[] = ['lifting', 'resting', 'paused', 'done'];

export function readSharedBar(raw: unknown): SharedBar | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const exerciseId = str(r.exerciseId, 64);
  const kg = num(r.kg);
  const reps = num(r.reps);
  if (!exerciseId || kg == null || reps == null) return undefined;
  // Bounded at both ends: a bar is not negative, and no plate stack on earth is half a tonne.
  if (kg < 0 || kg > 500 || reps < 0 || reps > 100) return undefined;
  return { exerciseId, kg: Math.round(kg * 100) / 100, reps: Math.round(reps) };
}

export function readSharedPlan(raw: unknown): SharedPlan | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const v = num(r.v);
  if (v == null || !Array.isArray(r.lifts)) return null;
  const lifts: SharedLift[] = [];
  for (const entry of r.lifts) {
    if (typeof entry !== 'object' || entry === null) return null;
    const e = entry as Record<string, unknown>;
    const exerciseId = str(e.exerciseId, 64);
    const sets = num(e.sets);
    if (!exerciseId || sets == null || sets < 1 || sets > 20) return null;
    lifts.push({ exerciseId, sets: Math.round(sets) });
  }
  if (lifts.length === 0 || lifts.length > 40) return null;
  return { v: Math.round(v), lifts };
}

export function readSharedProgress(raw: unknown): SharedProgress | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const v = num(r.v);
  const at = num(r.at);
  const name = str(r.name, 20);
  const presence = PRESENCES.find((p) => p === r.presence);
  if (v == null || at == null || !name || !presence || !Array.isArray(r.done)) return null;
  const done: number[] = [];
  for (const d of r.done) {
    const n = num(d);
    if (n == null || n < 0 || n > 20) return null;
    done.push(Math.round(n));
  }
  if (done.length > 40) return null;
  const bar = readSharedBar(r.bar);
  return { v: Math.round(v), name, presence, done, at: Math.round(at), ...(bar ? { bar } : {}) };
}
