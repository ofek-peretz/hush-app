/**
 * Phone session resume (S3, approved 2026-07-05). The watch's LocalWorkoutEngine has always
 * persisted every transition and restored exactly; the phone only salvaged (logged sets became
 * an "ended early" history entry and the athlete lost their place). This module brings the
 * phone to the watch's standard:
 *
 *   • sessionStore persists a resume snapshot (plan + machine + rest anchors) on every state
 *     change; finalize/abandon clear it.
 *   • On boot, a FRESH snapshot (< RESUME_WINDOW_MS) is kept instead of salvaged; Home offers
 *     "Continue {workout}" as the primary CTA.
 *   • `reconcileResume` (pure) rebuilds the machine: a rest that finished while away advances
 *     to the next set (wall-clock, watch parity); a paused rest resumes with the remaining
 *     time frozen at the pause instant; an already-logged set is never re-presented (a crash
 *     between the set write and the snapshot write leaves the machine one step behind).
 *   • Anything stale or unusable falls back to the existing salvage — no data is ever lost.
 */
import { sessionReducer, type SessionMachine } from '@/state/machines/sessionState';
import { db } from '@/data/local/db';
import { track } from '@/platform/telemetry';
import { sessionTrained } from '@/domain/completion';
import type { Session } from '@/data/local/models';

/** How long an interrupted session stays resumable. Past this, the gym visit is over —
 *  salvage the logged work and compose the next start cleanly. */
export const RESUME_WINDOW_MS = 3 * 60 * 60 * 1000;

/** The structural slice of a plan Step the reconciler needs (avoids a store↔module cycle). */
export interface ResumeStep {
  exerciseId: string;
  exerciseSetIndex: number;
  lastSetOfSession: boolean;
}

/** The persisted resume snapshot (schema 1). `plan` is the full live plan (swaps and edits
 *  included) so restore is immune to a weekly regeneration replacing the program mid-gap. */
export interface ResumeSnapshot<S extends ResumeStep = ResumeStep> {
  schema: 1;
  plan: S[];
  machine: SessionMachine;
  /** Epoch ms the running rest began, or null when not resting. */
  restStartedAtMs: number | null;
  /** Seconds added via "+15 sec" to the running rest. */
  restExtraS: number;
  /** Epoch ms Pause was pressed (freezes the rest clock), or null. */
  pausedAtMs: number | null;
  savedAt: string; // ISO
}

export interface ReconciledResume {
  machine: SessionMachine;
  restStartedAtMs: number | null;
  restExtraS: number;
  /** Remaining seconds of a mid-flight rest (the Rest UI anchors on this once), or null. */
  restRemainingS: number | null;
}

const key = (exerciseId: string, setIndex: number) => `${exerciseId}#${setIndex}`;

/** Advance past any step that is already logged — never re-present (and never re-log) a
 *  completed set. Returns null when every remaining step is done (nothing left to resume). */
function skipLogged<S extends ResumeStep>(
  plan: S[],
  m: SessionMachine,
  logged: ReadonlySet<string>,
): SessionMachine | null {
  let idx = m.setIndex;
  while (idx < plan.length && logged.has(key(plan[idx].exerciseId, plan[idx].exerciseSetIndex))) {
    if (plan[idx].lastSetOfSession) return null; // all work done — nothing to resume
    idx += 1;
  }
  if (idx >= plan.length) return null;
  return { ...m, phase: 'SET_PRESENTED', resumePhase: null, setIndex: idx, isLastSetOfSession: plan[idx].lastSetOfSession };
}

/**
 * Rebuild the live machine from a snapshot + the persisted session's logged sets. Pure and
 * clock-injected. Returns null when the snapshot is stale, terminal, or fully completed —
 * the caller then falls back to salvage.
 */
export function reconcileResume<S extends ResumeStep>(
  snap: Pick<ResumeSnapshot<S>, 'plan' | 'machine' | 'restStartedAtMs' | 'restExtraS' | 'pausedAtMs' | 'savedAt'>,
  session: Pick<Session, 'sets'>,
  nowMs: number,
  restBaseS: (kind: 'inter' | 'transition', exerciseId: string | null) => number,
): ReconciledResume | null {
  const { plan } = snap;
  if (!plan.length) return null;
  let m = snap.machine;
  if (m.phase === 'SESSION_SAVED' || m.phase === 'WELL_DONE') return null;
  const savedMs = Date.parse(snap.savedAt);
  if (Number.isNaN(savedMs) || nowMs - savedMs > RESUME_WINDOW_MS) return null;

  const logged = new Set(session.sets.map((s) => key(s.exerciseId, s.setIndex)));

  // Un-freeze a pause: the athlete reopened the app to continue. A paused rest's elapsed
  // time is measured to the pause instant — never the time away.
  let frozenElapsedMs: number | null = null;
  if (m.phase === 'PAUSED') {
    const back = m.resumePhase ?? 'SET_PRESENTED';
    if (back !== 'SET_PRESENTED' && snap.restStartedAtMs != null && snap.pausedAtMs != null) {
      frozenElapsedMs = Math.max(0, snap.pausedAtMs - snap.restStartedAtMs);
    }
    m = { ...m, phase: back, resumePhase: null };
  }

  // Mid-rest: the machine sits on the COMPLETED set; the rest kept running on the wall clock.
  if (m.phase === 'REST_INTER' || m.phase.startsWith('REST_TRANSITION')) {
    const kind = m.phase === 'REST_INTER' ? 'inter' : 'transition';
    const step = plan[m.setIndex];
    const baseS = restBaseS(kind, step?.exerciseId ?? null) + (snap.restExtraS ?? 0);
    const elapsedMs =
      frozenElapsedMs ?? (snap.restStartedAtMs != null ? Math.max(0, nowMs - snap.restStartedAtMs) : baseS * 1000);
    const remainingS = Math.round(baseS - elapsedMs / 1000);
    if (remainingS > 0) {
      return {
        machine: m,
        restStartedAtMs: nowMs - (baseS - remainingS) * 1000,
        restExtraS: snap.restExtraS ?? 0,
        restRemainingS: remainingS,
      };
    }
    // Rest fully served while away → the next set presents (wall-clock, watch parity).
    m = sessionReducer(m, { type: 'REST_ELAPSED' });
  }

  const settled = skipLogged(plan, m, logged);
  if (!settled) return null;
  return { machine: settled, restStartedAtMs: null, restExtraS: 0, restRemainingS: null };
}

/**
 * Salvage an orphaned active session: whatever completed becomes an "ended early" history
 * entry (queued for sync), then the orphan is cleared so the next start composes cleanly.
 * De-duped by session id (a prior crash may have saved-but-not-cleared). Never throws.
 * Shared by the boot path (stale/unusable snapshot) and by start() (the athlete chose a
 * fresh workout instead of resuming).
 */
export async function salvageOrphanSession(): Promise<void> {
  try {
    const active = await db.loadActiveSession();
    if (active) {
      if (active.sets.length > 0) {
        const history = await db.loadHistory();
        if (!history.some((h) => h.id === active.id)) {
          // Stamp the TRAINED verdict (domain/completion) like any other save, so the workout-count
          // milestones and the week heal read a salvaged session exactly as they read a finished
          // one. (Whether a salvaged session ADVANCES the session count is a separate, unchanged
          // rule — see §2.3: an interrupted session does not.)
          const program = await db.loadProgram().catch(() => null);
          const day = program?.days.find((d) => d.id === active.programDayId);
          const saved: Session = {
            ...active,
            state: 'SAVED',
            earlyFinish: true,
            trained: sessionTrained(active, day),
            annotation: 'ended_early',
          };
          await db.appendCompletedSession(saved);
          await db.enqueuePendingSync({
            sessionId: saved.id,
            programDayId: saved.programDayId,
            sets: saved.sets.map((s) => ({
              exerciseId: s.exerciseId,
              setIndex: s.setIndex,
              actualWeight: s.actualWeight,
              actualReps: s.actualReps,
              blockId: s.blockId,
            })),
            earlyFinish: true,
          });
          void track('session_recovered', { sessionId: saved.id, sets: saved.sets.length });
        }
      }
      await db.clearActiveSession();
    }
  } catch {
    /* storage hiccup — the next boot retries; never block a start */
  }
  try {
    await db.clearSessionResume();
  } catch {
    /* best-effort */
  }
}
