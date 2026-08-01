/**
 * HTTP ModelClient — adapts the real backend (implementation/api) to the client's
 * ModelClient interface. Per-set reports learn; complete pre-composes next.
 *
 * Cleanly mapped here: blocks-as-targets, per-set report, complete, profile,
 * history, block replace, preferences, capabilities (Portrait), weekly rest.
 *
 * WEEKLY-PROGRAM MODEL (ratified — consumed since 2026-06-17). The backend is the
 * weekly-program model: migration_016 `week_plan` + `POST /weeks` / `GET /weeks/current`
 * compose N unscheduled workouts as a UNIT and return `{week, rest, workouts[]}`
 * (per-workout status/blocks/name). The product (see memory hush-weekly-program-model)
 * is a weekly BUCKET of N workouts — no calendar/day-assignment, done in any order, Rest
 * only after ALL complete. `generateProgram` reads `/weeks/current` (composing the week
 * via `POST /weeks` only if none exists) and maps `workouts[]` → `Program.days[]`, each
 * day carrying its backend session id, name, blocks, the athlete-ownership ordering key
 * (`str(session_index % weekly_frequency)`), and a `completed` flag (status). The Program
 * screen renders completed workouts green; Home advances to the next unfinished workout (Recovery
 * when none remain). Each workout's own `session id` is the `programDayId` the client then uses for
 * `sessionTargets` (GET /sessions/{id}) and `recordSession`.
 *
 * Historical resolved blockers (kept for context): B2 Portrait → `GET /capabilities`
 * (done). The per-week material-change surface is now the v4 Weekly Update + Why
 * (engine/v4), sourced from the engine's persisted explanations — not a model-client method.
 */
import type {
  Capability,
  PortraitSnapshot,
  Profile,
  Program,
  ProgramDay,
  SetTarget,
  Slot,
} from '@/data/local/models';
import type { ActualSet, BackendProfile, ModelClient } from './modelClient';
import { getBaseUrl, getToken } from './config';
import { notifyUnauthorized } from './authEvents';
import { HttpError, classifyStatus } from './httpErrors';
import { track } from '@/platform/telemetry';
import { mapDecision, type WhyResponse } from './decisionMap';
import { newEventId } from '@/platform/deviceContext';

const REQUEST_TIMEOUT_MS = 12000;
import { db } from '@/data/local/db';

// ---- backend wire shapes (mirror schemas.py BlockOut / SessionOut) ----
interface BlockOut {
  id: string;
  position: number;
  capability: string;
  exercise: string;
  recommended_weight: number;
  target_reps: number;
  target_sets: number;
  rest_seconds: number;
  selection_reason: string;
  recommendation_id: string | null;
  status: string;
}
interface SessionOut {
  id: string;
  name: string | null; // stable, structure-derived workout name (e.g. "Upper A"); migration 017
  status: string;
  week: number;
  blocks: BlockOut[];
}
// A workout in the weekly payload = a SessionOut plus its in-week positioning fields.
interface WeekWorkout extends SessionOut {
  session_index: number;
  position_in_week: number;
}
// GET /weeks/current and POST /weeks both return this shape (lifecycle._week_to_dict).
interface WeekResponse {
  week: { id: string; weekly_frequency: number } | null;
  rest?: boolean;
  workouts?: WeekWorkout[];
}

/** Map a backend capability string to the client's Capability enum (1:1 names). */
function toCapability(c: string): Capability {
  return c as Capability;
}

/** Muscle-group display nouns for the workout-card metadata (content). */
const CAPABILITY_MUSCLE: Record<Capability, string> = {
  horizontal_push: 'Chest',
  horizontal_pull: 'Back',
  vertical_push: 'Shoulders',
  knee_dominant: 'Legs',
  hip_dominant: 'Hamstrings',
};

export class HttpModelClient implements ModelClient {
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const base = getBaseUrl();
    const token = await getToken();

    // Every request has a deadline — a hung/half-open connection can never strand
    // the UI (alpha hardening). Failures are classified and telemetered so they
    // are observable and distinguishable, not collapsed into "offline".
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      const kind = (e as { name?: string })?.name === 'AbortError' ? 'timeout' : 'offline';
      void track('request_failed', { kind, method, path });
      throw new HttpError(kind);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const kind = classifyStatus(res.status);
      // A 401 means the invite was revoked → clear identity + return to Enrollment.
      if (kind === 'unauthorized') notifyUnauthorized();
      void track('request_failed', { kind, status: res.status, method, path });
      throw new HttpError(kind, res.status);
    }
    return (await res.json()) as T;
  }

  private blocksToSlots(session: SessionOut): Slot[] {
    return session.blocks
      .sort((a, b) => a.position - b.position)
      .map<Slot>((b) => ({ capability: toCapability(b.capability), exerciseId: b.exercise, setCount: b.target_sets }));
  }

  async getProfile(): Promise<BackendProfile> {
    const p = await this.request<{ sex?: string; age?: number; bodyweight_kg?: number | null; experience?: string }>(
      'GET',
      '/profile',
    );
    return {
      sex: p.sex === 'female' ? 'female' : p.sex === 'male' ? 'male' : undefined,
      age: p.age,
      bodyweightKg: p.bodyweight_kg ?? undefined,
      experience: p.experience,
    };
  }

  async recordConsent({ version, acceptedAt }: { version: string; acceptedAt: string }): Promise<void> {
    // Append-only + idempotent server-side on a deterministic id (consent:{athlete}:{version}),
    // so a retry never doubles the record; the server stamps the authoritative legal timestamp.
    await this.request('POST', '/consent', { version, accepted_at: acceptedAt });
  }

  async eraseAccount(): Promise<void> {
    // OD-2 athlete self-erase: anonymizes this athlete server-side and deletes the token. The token
    // is invalid immediately after, so the caller MUST wipe local state right after this resolves.
    await this.request('POST', '/me/erase');
  }

  async sessionsCompleted(): Promise<number | null> {
    const strat = await this.request<{ sessions_completed?: number }>('GET', '/strategy');
    return typeof strat.sessions_completed === 'number' ? strat.sessions_completed : null;
  }



  /** Map a `{week, rest, workouts[]}` payload to the client Program (the weekly bucket of N
   *  workouts). Each workout becomes a non-rest ProgramDay carrying its backend session id (the
   *  `programDayId` used for targets/reporting), structure-derived name, the athlete-ownership
   *  ordering key (`str(session_index % weekly_frequency)`, matching compose_week), and a
   *  `completed` flag derived from status. */
  private weekToProgram(week: WeekResponse): Program {
    const workouts = week.workouts ?? [];
    const frequency = week.week?.weekly_frequency ?? workouts.length;
    const days: ProgramDay[] = workouts.map((w) => {
      const slots = this.blocksToSlots(w);
      const muscleGroups = [...new Set(slots.map((s) => CAPABILITY_MUSCLE[s.capability]))];
      // Workout-ordering identity = the template index the backend keys workout_order on; falls
      // back to in-week position if frequency is unknown. Stable across regeneration + reordering.
      const templateIndex = frequency > 0 ? w.session_index % frequency : w.position_in_week;
      return {
        id: w.id,
        // Real, structure-derived name (migration 017); muscle-group line only as a pre-017
        // fallback — never the generic "Today".
        name: w.name ?? muscleGroups.join(' · '),
        muscleGroups,
        isRest: false,
        slots,
        key: String(templateIndex),
        completed: w.status === 'completed' || w.status === 'skipped',
      };
    });
    return { id: week.week?.id ?? 'week', frequency, days };
  }


  /** Most recent logged actual weight per exercise, from local history. */
  private async lastLoggedWeights(): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const history = await db.loadHistory(); // newest first
    for (const sess of history) {
      for (const set of sess.sets) {
        if (set.actualWeight != null && !out.has(set.exerciseId)) {
          out.set(set.exerciseId, set.actualWeight);
        }
      }
    }
    return out;
  }

  async replaceBlock({ blockId, fromExercise, toExercise }: { blockId: string; fromExercise: string; toExercise?: string }): Promise<void> {
    await this.request('POST', `/blocks/${blockId}/replace`, {
      client_event_id: `${blockId}:replace:${Date.now()}`,
      seq: 0,
      from_exercise: fromExercise,
      ...(toExercise ? { to_exercise: toExercise } : {}),
    });
  }

  async recordSession({ programDayId, sets, earlyFinish }: { programDayId: string; sets: ActualSet[]; earlyFinish: boolean }): Promise<void> {
    // Replay the locally-logged sets to the backend, then complete. Each /sets
    // call is idempotent on client_event_id (safe to retry on reconnect, §5.2).
    let seq = 0;
    for (const s of sets) {
      if (!s.blockId) continue; // can only report sets that carry a backend block id
      await this.request('POST', `/sessions/${programDayId}/sets`, {
        client_event_id: `${programDayId}:${s.blockId}:${s.setIndex}`,
        seq: seq++,
        block_id: s.blockId,
        set_number: s.setIndex + 1,
        actual_reps: s.actualReps,
        ...(s.actualWeight != null ? { actual_weight: s.actualWeight } : {}),
      });
    }
    await this.request('POST', `/sessions/${programDayId}/complete`, {
      client_event_id: `${programDayId}:complete`,
      seq,
      finished_early: earlyFinish,
    });
  }

  async portraitSnapshot({ completedSessions }: { completedSessions: number }): Promise<PortraitSnapshot> {
    void completedSessions;
    // GET /capabilities → raw latent score + confidence per capability. Decision 2
    // (2026-06-14) defines the Portrait as PURELY RELATIVE to the athlete's
    // strongest confident capability, so the raw score's absolute scale is
    // irrelevant — barFraction normalizes it. No invention; the model's score is
    // rendered as relative internal structure only.
    const data = await this.request<{
      capabilities: { capability: string; score: number; confidence: number }[];
    }>('GET', '/capabilities');

    const perCapability = {} as Record<Capability, number>;
    const confidence = {} as Record<Capability, number>;
    const stillLearning = {} as Record<Capability, boolean>;
    for (const c of data.capabilities) {
      const cap = toCapability(c.capability);
      perCapability[cap] = c.score;
      confidence[cap] = c.confidence;
      stillLearning[cap] = c.confidence < 30; // client derives (§5.7)
    }
    return { timestamp: new Date().toISOString(), perCapability, confidence, stillLearning };
  }

  // ---- Program Ownership Contract: durable, server-backed athlete-owned structure ----
  async setSubstitute({ primaryExercise, substituteExercise, remove }: { primaryExercise: string; substituteExercise?: string; remove?: boolean }): Promise<void> {
    await this.request('POST', '/preferences/substitute', {
      client_event_id: newEventId(), primary_exercise: primaryExercise,
      substitute_exercise: substituteExercise, remove: !!remove, source: 'program_detail',
    });
  }

  async setBackup({ primaryExercise, backupExercise, remove }: { primaryExercise: string; backupExercise?: string; remove?: boolean }): Promise<void> {
    await this.request('POST', '/preferences/backup', {
      client_event_id: newEventId(), primary_exercise: primaryExercise,
      backup_exercise: backupExercise, remove: !!remove, source: 'program_detail',
    });
  }

  async setOrder({ scope, order, capability, workoutKey }: { scope: 'exercise' | 'workout'; order: string[]; capability?: Capability; workoutKey?: string }): Promise<void> {
    await this.request('POST', '/preferences/order', {
      client_event_id: newEventId(), scope, order, capability, workout_key: workoutKey, source: 'program_detail',
    });
  }

  async markEquipmentOccupied({ blockId }: { blockId: string }): Promise<void> {
    await this.request('POST', `/blocks/${blockId}/unavailable`, {
      client_event_id: newEventId(), seq: 0,
    });
  }
}
