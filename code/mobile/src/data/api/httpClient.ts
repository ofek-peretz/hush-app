/**
 * HTTP ModelClient — adapts the real backend (implementation/api) to the client's
 * ModelClient interface. The backend is SESSION-AT-A-TIME (it composes
 * /sessions/today with blocks, learns from per-set reports, and pre-composes the
 * next session on complete) — see API contract §5/§6/§7.
 *
 * Cleanly mapped here: session compose → blocks-as-targets, per-set report,
 * complete, profile, history, block replace.
 *
 * STRUCTURAL GAPS surfaced as blockers (NOT silently invented — see the
 * connect-backend report):
 *  - B1 week-program / day-list: the backend has no multi-day program; it composes
 *    one session. generateProgram wraps the composed session as a single "day".
 *  - B2 Capability Portrait: capability_state exists server-side but is NOT exposed
 *    by any athlete read endpoint → portraitSnapshot cannot be fulfilled.
 *  - B4 program-change card / forecast-receipt: no weekly-change or forecast surface;
 *    decisions live per-block (decision_type / predicted_reps / confidence).
 */
import type {
  Capability,
  PortraitSnapshot,
  ProgramChange,
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

const CALIBRATION_SESSIONS = 7;

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
  status: string;
  week: number;
  blocks: BlockOut[];
}

/** Map a backend capability string to the client's Capability enum (1:1 names). */
function toCapability(c: string): Capability {
  return c as Capability;
}

/** Muscle-group display nouns for the Home "Today" card metadata (content). */
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

  async sessionsCompleted(): Promise<number | null> {
    const strat = await this.request<{ sessions_completed?: number }>('GET', '/strategy');
    return typeof strat.sessions_completed === 'number' ? strat.sessions_completed : null;
  }

  async generateProgram(_profile: Profile): Promise<Program> {
    // Session-at-a-time (ratified 2026-06-14): "the athlete opens Hush and
    // receives today's session." READ-FIRST so this returns the CURRENT session
    // (and, after a completion pre-composes the next, that next one) — composing
    // only when none exists yet. Safe to call on every Home focus (a read unless
    // awaiting_compose). No calendar, no multi-day plan.
    const today = await this.request<{ today: SessionOut | null }>('GET', '/sessions/today');
    const session =
      today.today ??
      (await this.request<SessionOut>('POST', '/sessions', { client_request_id: `compose_${Date.now()}` }));

    let frequency = 0;
    try {
      const strat = await this.request<{ weekly_frequency: number }>('GET', '/strategy');
      frequency = strat.weekly_frequency;
    } catch {
      // strategy unreadable → frequency unknown; the loop still works.
    }

    const slots = this.blocksToSlots(session);
    const muscleGroups = [...new Set(slots.map((s) => CAPABILITY_MUSCLE[s.capability]))];
    const day: ProgramDay = { id: session.id, name: 'Today', muscleGroups, isRest: false, slots, key: '0' };
    return { id: session.id, frequency, days: [day] };
  }

  async sessionTargets({ programDayId }: { programDayId: string; completedSessions: number }): Promise<SetTarget[]> {
    void programDayId;
    // The composed session's blocks ARE the targets. Re-read today's session.
    const data = await this.request<{ today: SessionOut | null }>('GET', '/sessions/today');
    const session = data.today;
    if (!session) return [];

    // The athlete's last logged weight per exercise (for the reason-line delta).
    const lastWeight = await this.lastLoggedWeights();

    const out: SetTarget[] = [];
    for (const b of session.blocks) {
      // Honest reason/forecast from the real recommendation (contract §12).
      let reasonType: SetTarget['reasonType'];
      let reasonDelta: number | undefined;
      let forecast: SetTarget['forecast'];
      if (b.recommendation_id) {
        try {
          const why = await this.request<WhyResponse>('GET', `/recommendations/${b.recommendation_id}/why`);
          const mapped = mapDecision(why);
          reasonType = mapped.reasonType;
          if (reasonType === 'increase' && mapped.increaseForecastReps != null) {
            forecast = {
              type: 'increase',
              capability: toCapability(b.capability),
              predictedValue: b.recommended_weight,
              predictedReps: mapped.increaseForecastReps,
              dueSessionOrDate: 'same-session',
            };
          }
          // Hold carries a HORIZONLESS forecast ("You'll pass it.") — the held
          // weight is what the athlete must later exceed (#9). dueSessionOrDate
          // 'open' signals no deadline; it resolves on a future session.
          if (reasonType === 'hold' && mapped.holdForecast) {
            forecast = {
              type: 'hold',
              capability: toCapability(b.capability),
              predictedValue: b.recommended_weight,
              predictedReps: b.target_reps,
              dueSessionOrDate: 'open',
            };
          }
          if (reasonType === 'increase' || reasonType === 'decrease') {
            const prev = lastWeight.get(b.exercise);
            // Δ from the athlete's own last comparable set; omit the reason if no
            // prior exists (cannot render "Up [Δ]" honestly). Backend `delta`
            // would be authoritative — see CONTRACTS_NEEDED.
            if (prev != null) reasonDelta = Math.round((b.recommended_weight - prev) * 10) / 10;
            else reasonType = undefined;
          }
        } catch {
          // /why unavailable → stay silent rather than guess (§5.2/§18).
        }
      }

      for (let s = 0; s < b.target_sets; s++) {
        const first = s === 0; // reason/forecast on the first working set only (ratified)
        out.push({
          exerciseId: b.exercise,
          setIndex: s,
          blockId: b.id, // carried so report_set can target the block
          recommendedWeight: b.recommended_weight,
          recommendedReps: b.target_reps,
          reasonType: first ? reasonType : undefined,
          reasonDelta: first ? reasonDelta : undefined,
          forecast: first ? forecast : undefined,
        });
      }
    }
    return out;
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

  async programChanges({ completedSessions }: { completedSessions: number }): Promise<ProgramChange[]> {
    // B4: no weekly program-change surface. Per-block decisions exist but the
    // load-change(Undo)/frame-change(veto) card has no backend counterpart yet.
    void completedSessions;
    void CALIBRATION_SESSIONS;
    return [];
  }

  // C5 (ratified 2026-06-15): program-change responses (acknowledged|vetoed|ignored) are
  // recorded as research events for learning + trust measurement via the telemetry →
  // athlete_event pipeline; they never alter model state or future recommendations, so there
  // is NO model-mutating undo/veto endpoint here.

  // ---- Program Ownership Contract: durable, server-backed athlete-owned structure ----
  async setExercisePreference({ capability, fromExercise, toExercise, reason }: { capability: Capability; fromExercise: string; toExercise: string; reason?: string }): Promise<void> {
    await this.request('POST', '/preferences/exercise', {
      client_event_id: newEventId(), capability, action: 'replace',
      from_exercise: fromExercise, to_exercise: toExercise,
      reason: reason ?? 'preference', source: 'program_detail',
    });
  }

  async restoreExercisePreference({ capability }: { capability: Capability }): Promise<void> {
    await this.request('POST', '/preferences/exercise', {
      client_event_id: newEventId(), capability, action: 'restore', source: 'program_detail',
    });
  }

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

  async setOrder({ scope, order, capability }: { scope: 'exercise' | 'workout'; order: string[]; capability?: Capability }): Promise<void> {
    await this.request('POST', '/preferences/order', {
      client_event_id: newEventId(), scope, order, capability, source: 'program_detail',
    });
  }

  async markEquipmentOccupied({ blockId }: { blockId: string }): Promise<void> {
    await this.request('POST', `/blocks/${blockId}/unavailable`, {
      client_event_id: newEventId(), seq: 0,
    });
  }

  async weeklyRest(): Promise<boolean> {
    try {
      const data = await this.request<{ rest?: boolean; week?: unknown }>('GET', '/weeks/current');
      return data.rest === true;
    } catch {
      return false; // no week yet / backend unreachable → not resting
    }
  }
}
