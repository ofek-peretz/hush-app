/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH TRACK, OFF THE RENDER TREE — the link, the outbox, the pull. (2026-09-17)
 *
 * React-free on purpose: the session store enqueues from inside `finalize`, the wrist's adoption
 * and the orphan salvage enqueue from outside any provider, and a law must be able to drive all of
 * it without mounting a screen. `state/stores/coachStore` is the thin provider over these verbs.
 *
 * ── ⛔ LAW 3 — NO UPLOAD BLOCKS A SET ────────────────────────────────────────────────────────────
 * `queueSessionForCoach` is called `void` — never awaited — AFTER the local save has landed. It
 * writes the upload to local storage and kicks a drain it does not wait for either. A drain that
 * fails keeps every item, silently, with a backoff; nothing here throws and nothing here is shown.
 *
 * ── ⛔ ZERO NETWORK FOR ANYONE NOT ON THE TRACK ──────────────────────────────────────────────────
 * No link on this phone → no queue, no drain, no pull. No identity session → no call. An athlete
 * who never met a coach pays nothing for this file existing: one AsyncStorage read, at most.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import { db } from '@/data/local/db';
import type { Profile, Program, Session } from '@/data/local/models';
import {
  COACH_WIRE,
  landCoachUpdate,
  sessionToUpload,
  validateSessionUpload,
  type CoachLanding,
  type CoachWeekDiff,
  type DroppedLift,
  type SessionUpload,
  type WeekEnvelope,
} from '@/domain/coachTrack';
import {
  coachTrackAvailable,
  coachTrackSignedIn,
  traineeUpload,
  traineeWeek,
  type AthleteOf,
  type CoachMe,
  type CoachTrackError,
} from '@/platform/coachTrackClient';
import { track } from '@/platform/telemetry';

/** Her link to a coach, as this phone last learned it (join, or `/coach/me`). */
export type CoachLink = AthleteOf;

export interface OutboxItem {
  upload: SessionUpload;
  /** Failed attempts so far. */
  tries: number;
  /** Not before this instant (ms) — the backoff. */
  nextAtMs: number;
  queuedAtMs: number;
}

/** The update card Home draws once — what landed, and from when. Cleared when she has seen it. */
export interface PendingCoachUpdate {
  version: number;
  coachName: string;
  diff: CoachWeekDiff;
  effectiveDay: string;
  dropped: string[];
  /** ⚠️ ABSENT on an update stored by a build before 2026-09-18 — the ids in `dropped` are what a
   *  card read off disk can still count on. Each dropped lift with the day it was written for. */
  droppedAt?: DroppedLift[];
  landedAtMs: number;
}

/** How long a failed batch waits: 30 s, doubling, never past six hours. */
export function backoffMs(tries: number): number {
  return Math.min(6 * 3_600_000, 30_000 * 2 ** Math.max(0, tries - 1));
}

/** The outbox never grows without bound: past this, the OLDEST unsent workouts are let go. */
export const OUTBOX_CAP = 200;

/* ── one writer at a time ─────────────────────────────────────────────────────────────────────── */

let chain: Promise<unknown> = Promise.resolve();
/** Serialize every read-modify-write of the outbox — a queue during a drain must not be lost. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

/* ── the link ─────────────────────────────────────────────────────────────────────────────────── */

export async function loadCoachLink(): Promise<CoachLink | null> {
  return (await db.loadCoachTrackLink<CoachLink>().catch(() => null)) ?? null;
}

export async function saveCoachLink(link: CoachLink): Promise<void> {
  await db.saveCoachTrackLink(link);
  announceLink(true);
}

/*
 * ⛔ WHO ELSE MUST KNOW THE LINK CHANGED (the trainee screens, 2026-09-17). A linked trainee is Pro
 * (ruling 1), and the gate that asks is in the APP store, which sits OUTSIDE the coach track's
 * provider — so the two writers of the link announce it here, and `appStore` listens. Synchronous
 * and in-process: nothing crosses a wire, nothing can fail.
 */
type LinkListener = (linked: boolean) => void;
const linkListeners = new Set<LinkListener>();
function announceLink(linked: boolean): void {
  for (const l of [...linkListeners]) {
    try {
      l(linked);
    } catch {
      /* a listener never breaks the writer */
    }
  }
}
/** Subscribe to link changes (join, `/coach/me` refresh, leave, removal). Returns the unsubscribe. */
export function onCoachLinkChange(listener: LinkListener): () => void {
  linkListeners.add(listener);
  return () => {
    linkListeners.delete(listener);
  };
}

/**
 * ⛔ LAW 6 — UNLINKING TAKES NOTHING. Forgets the link and the unsent queue (the coach has lost
 * access; sending workouts after she left would be the opposite of leaving). It does NOT touch the
 * programme: the week stays on the phone, still `authored: 'coach'`.
 */
export async function forgetCoachLink(): Promise<void> {
  await serial(async () => {
    await db.clearCoachTrackLink().catch(() => {});
    await db.saveCoachTrackOutbox([]).catch(() => {});
    await db.clearCoachTrackPending().catch(() => {});
  });
  announceLink(false);
}

export async function loadCoachMe(): Promise<CoachMe | null> {
  return (await db.loadCoachTrackMe<CoachMe>().catch(() => null)) ?? null;
}

/* ── the outbox ───────────────────────────────────────────────────────────────────────────────── */

export async function loadOutbox(): Promise<OutboxItem[]> {
  return db.loadCoachTrackOutbox<OutboxItem>().catch(() => []);
}

/**
 * ⛔ THE SINK. Called `void` from every place a workout is saved. Reads the link, builds the upload
 * through the allow-list, stores it, kicks a drain — and returns without waiting on any network.
 *
 * ⚠️ ONLY FROM THE LINK DATE ON (ruling 3). A session that started before she joined is not her
 * coach's to see — including a resumed one saved after the join.
 */
export async function queueSessionForCoach(session: Session, nowMs: number = Date.now()): Promise<void> {
  try {
    const link = await loadCoachLink();
    if (!link) return;
    if (session.freeform) return; // off the coach's plan, told to nobody's plan — see `Session.freeform`
    if (Date.parse(session.startedAt) < Date.parse(link.since)) return;
    const [program, profile] = await Promise.all([
      db.loadProgram().catch(() => null as Program | null),
      db.loadProfile().catch(() => null as Profile | null),
    ]);
    const upload = sessionToUpload(session, program, link.consent, profile?.weightKg, profile?.painEases);
    if (!upload) return;
    if (!validateSessionUpload(upload).ok) {
      void track('coach_upload_refused_locally', {});
      return;
    }
    await serial(async () => {
      const box = await loadOutbox();
      if (box.some((i) => i.upload.id === upload.id)) return;
      box.push({ upload, tries: 0, nextAtMs: nowMs, queuedAtMs: nowMs });
      await db.saveCoachTrackOutbox(box.slice(-OUTBOX_CAP));
    });
    void drainOutbox(nowMs);
  } catch {
    /* a sink never throws into the save that called it */
  }
}

let draining: Promise<{ sent: number; kept: number }> | null = null;
/*
 * ⚠️ A QUEUE THAT ARRIVES DURING A DRAIN (found on the web walk, 2026-09-17). The save queues its
 * workout while the session-end routine's drain is already reading the box; that drain read it
 * empty, and the new workout waited for the next foreground. So a call that finds a drain running
 * marks it, and the drain goes round once more before it lets go — still one drain at a time.
 */
let drainAgain = false;

/**
 * Send what is due, in batches of `COACH_WIRE.batchMax`. Success removes exactly the ids sent;
 * failure keeps them and pushes their next attempt out by `backoffMs`. Idempotent on the server
 * (the upload id is the key), so a batch whose answer was lost is simply sent again.
 */
export function drainOutbox(nowMs: number = Date.now()): Promise<{ sent: number; kept: number }> {
  if (draining) {
    drainAgain = true;
    return draining;
  }
  draining = (async () => {
    let sent = 0;
    try {
      if (!coachTrackAvailable()) return { sent, kept: (await loadOutbox()).length };
      if (!(await loadCoachLink())) return { sent, kept: 0 };
      if (!(await coachTrackSignedIn())) return { sent, kept: (await loadOutbox()).length };
      for (let round = 0; round < 10; round += 1) {
        const box = await loadOutbox();
        const due = box.filter((i) => i.nextAtMs <= nowMs).slice(0, COACH_WIRE.batchMax);
        if (due.length === 0) break;
        const ids = new Set(due.map((i) => i.upload.id));
        // eslint-disable-next-line no-await-in-loop
        const res = await traineeUpload(due.map((i) => i.upload));
        // eslint-disable-next-line no-await-in-loop
        await serial(async () => {
          const now = await loadOutbox();
          const next = res.ok
            ? now.filter((i) => !ids.has(i.upload.id))
            : now.map((i) =>
                ids.has(i.upload.id) && res.error !== 'signed_out'
                  ? { ...i, tries: i.tries + 1, nextAtMs: nowMs + backoffMs(i.tries + 1) }
                  : i,
              );
          await db.saveCoachTrackOutbox(next);
        });
        if (!res.ok) break;
        sent += due.length;
      }
      return { sent, kept: (await loadOutbox()).length };
    } catch {
      return { sent, kept: (await loadOutbox().catch(() => [])).length };
    } finally {
      draining = null;
      if (drainAgain) {
        drainAgain = false;
        void drainOutbox();
      }
    }
  })();
  return draining;
}

/* ── the pull ─────────────────────────────────────────────────────────────────────────────────── */

export type PullOutcome =
  | { kind: 'idle' } // not linked, not signed in, or no server in this build — no call was made
  | { kind: 'current' } // she already holds the newest version
  | { kind: 'error'; error: CoachTrackError }
  | { kind: 'unlinked' } // the server no longer knows this link — the week stays (law 6)
  | CoachLanding;

/**
 * Ask for a newer week and land it — through `landCoachUpdate`, so law 2 is decided in one pure
 * place — then write it through `adopt`, the app store's save path (`appStore.adoptCoachWeek`).
 *
 * `envelope` skips the network: the join answer already carries the first week.
 */
export async function pullCoachWeek(
  adopt: (program: Program) => Promise<void>,
  opts: { nowMs?: number; envelope?: WeekEnvelope } = {},
): Promise<PullOutcome> {
  const nowMs = opts.nowMs ?? Date.now();
  const link = await loadCoachLink();
  if (!link) return { kind: 'idle' };
  const onDisk = await db.loadProgram().catch(() => null);
  /*
   * ⚠️ VERSIONS COUNT PER LINK (found on the web walk, 2026-09-17). A coach week landed through an
   * EARLIER link (she left, then joined again — or joined another coach) holds that link's version;
   * compared against the new link's v1, every week the new coach sent read as stale and never landed.
   * A week from another link is still her week on disk (law 6), but it is version 0 to this link.
   */
  const current =
    onDisk?.authored === 'coach' && onDisk.coachLinkId !== link.linkId
      ? { ...onDisk, coachVersion: 0 }
      : onDisk;
  let week = opts.envelope;
  if (!week) {
    if (!coachTrackAvailable() || !(await coachTrackSignedIn())) return { kind: 'idle' };
    const since = current?.authored === 'coach' ? current.coachVersion ?? 0 : 0;
    const r = await traineeWeek(since);
    if (!r.ok) {
      if (r.error === 'not_found' || r.error === 'forbidden') {
        // The coach removed her, or the link was purged. Forget the link; keep the week.
        await forgetCoachLink();
        return { kind: 'unlinked' };
      }
      return { kind: 'error', error: r.error };
    }
    if (!r.value.week) return { kind: 'current' };
    week = r.value.week;
  }
  const active = await db.loadActiveSession().catch(() => null);
  const landing = landCoachUpdate(current, week, active, new Date(nowMs));
  if (landing.kind === 'landed') {
    await adopt({ ...landing.program, coachLinkId: link.linkId });
    const card: PendingCoachUpdate = {
      version: landing.version,
      coachName: week.coachName,
      diff: landing.diff,
      effectiveDay: landing.effectiveDay,
      dropped: landing.dropped,
      droppedAt: landing.droppedAt,
      landedAtMs: nowMs,
    };
    await db.saveCoachTrackPending(card).catch(() => {});
    void track('coach_week_landed', { version: landing.version, dropped: landing.dropped.length });
  } else if (landing.kind === 'deferred') {
    void track('coach_week_deferred', { version: landing.version });
  }
  return landing;
}

export async function loadPendingCoachUpdate(): Promise<PendingCoachUpdate | null> {
  return (await db.loadCoachTrackPending<PendingCoachUpdate>().catch(() => null)) ?? null;
}

export async function clearPendingCoachUpdate(): Promise<void> {
  await db.clearCoachTrackPending().catch(() => {});
}
