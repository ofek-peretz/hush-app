/**
 * Hush v4 engine — live integration façade (gated). Bridges the app's Program / Session history /
 * Profile to the pure v4 engine and persists per-slot state (db.engineV4), so:
 *   • the prescription athletes see comes from the durable v4 SlotState (week-rollover cadence);
 *   • C-1 slot continuity holds across weekly regeneration (state keyed by a stable slotId);
 *   • the existing split library remains the assembler (override §6) — the engine only owns
 *     load / progression / reprice / volume / state per slot.
 *
 * Cadence (approved): planNextWeek runs at WEEK ROLLOVER — when completed-session count crosses a
 * multiple of the weekly frequency. sessionTargets then reads the persisted prescription.
 *
 * The seed/cold-start load is INJECTED (seedFor) by the caller (fixtureModel) to avoid a layering
 * cycle and to keep all personalization seed-only (C-8). The engine discards it at calibration exit.
 */
import type { Profile, Program, ProgramDay, Session, Goal, Experience } from '@/data/local/models';
import { db, type EngineV4State } from '@/data/local/db';
import { planNextWeek } from './planWeek';
import { demonstrated, epley, normalizeLoad, volumeLoad } from './reads';
import { exerciseDisplayName } from '@/data/exercises';
import { enginePattern, exerciseMeta, candidatesForPattern } from './catalogAdapter';
import type { Explanation } from './types';
import { toEngineGoal, toTrainingAge, repScheme, type EngineProfile, type SlotState, type SlotResult, type GlobalState, type SetRecord, type Pattern } from './types';
import { REP_RANGE_BY_GOAL } from './constants';

export type SeedFor = (exerciseId: string) => number | null;

// ───────────────────────────── profile mapping ─────────────────────────────
export function toEngineProfile(p: Pick<Profile, 'sex' | 'age' | 'weightKg' | 'experience' | 'goal' | 'daysPerWeek'> & { goal: Goal; experience?: Experience }): EngineProfile {
  return {
    sex: p.sex ?? 'male',
    age: p.age ?? 30,
    bodyweight_kg: p.weightKg ?? 75,
    training_age: toTrainingAge(p.experience),
    goal: toEngineGoal(p.goal),
    variety_preference: 'medium',
    workout_count: Math.min(Math.max(p.daysPerWeek ?? 4, 1), 6),
    available_equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'],
    gym_busyness: 'medium',
  };
}

// ───────────────────────────── slot derivation (stable ids) ─────────────────────────────
export interface DerivedSlot {
  slotId: string;
  pattern: Pattern;
  exerciseId: string;
  dayKey: string;
  setCount: number;
}

/** Stable engine slots for a program: every non-core slot whose exercise maps to an engine pattern.
 *  slotId = `${dayKey}:${pattern}#${indexWithinDay}` — stable across weekly regeneration (the split
 *  structure and day keys are deterministic; pins change the exercise inside a slot, not its slot). */
export function deriveSlots(program: Program): DerivedSlot[] {
  const out: DerivedSlot[] = [];
  for (const day of program.days) {
    if (day.isRest) continue;
    const perPattern = new Map<Pattern, number>();
    for (const slot of day.slots) {
      if (slot.supplemental) continue; // CORE accessory — not engine-managed
      const pattern = enginePattern(slot.exerciseId);
      if (pattern == null) continue;
      const idx = perPattern.get(pattern) ?? 0;
      perPattern.set(pattern, idx + 1);
      out.push({ slotId: `${day.key ?? day.id}:${pattern}#${idx}`, pattern, exerciseId: slot.exerciseId, dayKey: day.key ?? day.id, setCount: slot.setCount });
    }
  }
  return out;
}

// ───────────────────────────── initial state (migration §9.2) ─────────────────────────────
/** Best demonstrated e1RM for an exercise across history (weighted lifts only). */
function bestE1rmFromHistory(exerciseId: string, history: Session[]): { best: number; sessions: number } {
  let best = 0;
  let sessions = 0;
  for (const s of history) {
    const sets = s.sets.filter((x) => x.exerciseId === exerciseId);
    if (!sets.length) continue;
    sessions += 1;
    for (const set of sets) if (set.actualWeight != null && set.actualReps > 0) best = Math.max(best, epley(set.actualWeight, set.actualReps));
  }
  return { best, sessions };
}

function initialSlot(d: DerivedSlot, profile: EngineProfile, history: Session[], seedFor: SeedFor): SlotState {
  const scheme = repScheme(profile.goal);
  const meta = exerciseMeta(d.exerciseId);
  const { best, sessions } = bestE1rmFromHistory(d.exerciseId, history);
  const established = sessions >= 2 && best > 0 && !meta.bodyweight; // §9.2 threshold
  const seed = seedFor(d.exerciseId);
  const load = meta.bodyweight
    ? null
    : established
      ? normalizeLoad(best / (1 + scheme.target / 30), meta.equipment)
      : seed;
  return {
    slotId: d.slotId,
    pattern: d.pattern,
    order_index: 0,
    locked: false,
    current_exercise_id: d.exerciseId,
    current_load_kg: load,
    current_sets: d.setCount,
    rep_target: scheme.target,
    rep_range: scheme.range,
    tenure_weeks: established ? Math.min(sessions, 12) : 0,
    flat_weeks: 0,
    miss_streak: 0,
    levers_tried: [],
    hold_mode: false,
    weeks_since_swap: established ? 12 : 0,
    calibrating: !established,
    calib_weeks: 0,
    history: [],
  };
}

// ───────────────────────────── state load/save ─────────────────────────────
const emptyState = (): EngineV4State => ({ slots: {}, global: { days_since_last_session: 0 }, lastAdvanceAt: 0 });

async function loadState(): Promise<EngineV4State> {
  try {
    return (await db.loadEngineV4()) ?? emptyState();
  } catch {
    return emptyState();
  }
}
async function saveState(s: EngineV4State): Promise<void> {
  try {
    await db.saveEngineV4(s);
  } catch {
    /* offline/test — in-memory edit already applied for this cycle */
  }
}

const slotsRecord = (s: EngineV4State) => s.slots as Record<string, SlotState>;

/**
 * Ensure persisted slot state matches the current program. Adds missing slots (initialized from
 * history per §9.2). If a slot's exercise changed (athlete pin / manual replacement, C-7), reset the
 * exercise-scoped state for the new lift and LOCK it (athlete owns selection). Idempotent.
 */
export async function ensureSlots(program: Program, profile: EngineProfile, history: Session[], seedFor: SeedFor): Promise<EngineV4State> {
  const state = await loadState();
  const slots = slotsRecord(state);
  const derived = deriveSlots(program);
  const keep = new Set(derived.map((d) => d.slotId));
  for (const d of derived) {
    const existing = slots[d.slotId];
    if (!existing) {
      slots[d.slotId] = initialSlot(d, profile, history, seedFor);
    } else if (existing.current_exercise_id !== d.exerciseId) {
      // Athlete-owned manual replacement (C-7): new lift starts CALIBRATING, slot is LOCKED.
      const fresh = initialSlot(d, profile, history, seedFor);
      slots[d.slotId] = { ...fresh, locked: true, calibrating: true, tenure_weeks: 0, weeks_since_swap: 0 };
    }
  }
  // Drop slots no longer in the program (e.g. frequency change).
  for (const id of Object.keys(slots)) if (!keep.has(id)) delete slots[id];

  // Goal change transition (C4-1, IT-goal-change): on a goal change, set each slot's rep_range/
  // rep_target from the new goal and RECOMPUTE load from demonstrated history at the new target;
  // `calibrating` is unchanged (NOT a new-athlete path); the seed is never consulted.
  if (state.goal && state.goal !== profile.goal) {
    const scheme = repScheme(profile.goal);
    for (const id of Object.keys(slots)) {
      const s = slots[id];
      const meta = exerciseMeta(s.current_exercise_id);
      const { best } = bestE1rmFromHistory(s.current_exercise_id, history);
      const load = meta.bodyweight ? null : best > 0 ? normalizeLoad(best / (1 + scheme.target / 30), meta.equipment) : s.current_load_kg;
      slots[id] = { ...s, rep_range: scheme.range, rep_target: scheme.target, current_load_kg: load, levers_tried: [], flat_weeks: 0, hold_mode: false };
    }
  }
  state.goal = profile.goal;

  await saveState(state);
  return state;
}

// ───────────────────────────── prescription read ─────────────────────────────
export interface V4Target {
  weight: number | null;
  reps: number;
}

/** The current persisted prescription for an exercise, or null if it has no engine slot
 *  (a non-program / swap-only exercise → caller falls back to the cold-start seed). */
export async function targetFor(exerciseId: string): Promise<V4Target | null> {
  return (await currentTargets())[exerciseId] ?? null;
}

/** All current per-slot prescriptions keyed by exercise id (single state read; for sessionTargets). */
export async function currentTargets(): Promise<Record<string, V4Target>> {
  const state = await loadState();
  const slots = slotsRecord(state);
  const out: Record<string, V4Target> = {};
  for (const id of Object.keys(slots)) {
    const s = slots[id];
    out[s.current_exercise_id] = { weight: s.current_load_kg, reps: s.rep_target };
  }
  return out;
}

// ───────────────────────────── week rollover ─────────────────────────────
function setRecords(exerciseId: string, sessions: Session[]): SetRecord[] {
  const recs: SetRecord[] = [];
  for (const s of sessions) {
    for (const log of s.sets) {
      if (log.exerciseId !== exerciseId) continue;
      recs.push({ load: log.actualWeight, reps: log.actualReps, failed: log.actualReps < log.recommendedReps });
    }
  }
  return recs;
}

/**
 * Advance the engine for every COMPLETED week that has not yet been processed (week rollover). A
 * week = `frequency` completed sessions. Aggregates each week's logged sets into per-slot results,
 * runs planNextWeek, and persists the updated slot state + a fresh history record per slot.
 */
export async function maybeAdvance(program: Program, profile: EngineProfile, history: Session[], seedFor: SeedFor): Promise<void> {
  const freq = Math.max(1, program.frequency);
  const state = await ensureSlots(program, profile, history, seedFor);
  const slots = slotsRecord(state);
  // history is newest-first; process oldest-first in week-sized chunks.
  const chrono = history.slice().reverse();

  while (chrono.length - state.lastAdvanceAt >= freq) {
    const week = chrono.slice(state.lastAdvanceAt, state.lastAdvanceAt + freq);
    const slotList = Object.values(slots);
    const results: SlotResult[] = [];
    for (const slot of slotList) {
      const sets = setRecords(slot.current_exercise_id, week);
      if (!sets.length) continue; // untrained slot → no result → holds
      results.push({ slotId: slot.slotId, pattern: slot.pattern, exercise_id: slot.current_exercise_id, sets, sessions_completed: week.length, sessions_planned: freq });
    }

    const out = planNextWeek({
      profile,
      slots: slotList,
      global: state.global as GlobalState,
      results,
      meta: exerciseMeta,
      candidates: (p) => candidatesForPattern(p),
      seedLoad: (id) => seedFor(id),
      nameOf: exerciseDisplayName,
      consts: undefined,
    });

    // Persist updated slots + append a per-slot history record for trend continuity.
    for (const ns of out.updated_slots) {
      const res = results.find((r) => r.slotId === ns.slotId);
      const rec = res
        ? { week: state.lastAdvanceAt / freq, sets: res.sets, e1rm_week: demonstrated(res.sets, ns.rep_target).best_e1rm ?? 0, volume_load: volumeLoad(res.sets), completed_sets: res.sets.length, prescribed_sets: ns.current_sets }
        : null;
      slots[ns.slotId] = rec ? { ...ns, history: [rec, ...ns.history].slice(0, 6) } : ns;
    }
    state.global = out.updated_global;
    // Capture the week's explanations for the Weekly Update + Why surfaces (a new week to view).
    state.lastUpdate = { weekIndex: state.lastAdvanceAt / freq, at: new Date().toISOString(), explanations: out.explanations, seen: false };
    state.lastAdvanceAt += freq;
  }
  await saveState(state);
}

// ───────────────────────────── Weekly Update accessors ─────────────────────────────
export interface WeeklyUpdate {
  weekIndex: number;
  at: string;
  explanations: Explanation[];
  seen: boolean;
}

/** The most recent week's explanations (Weekly Update + Why surfaces), or null if none yet. */
export async function getWeeklyUpdate(): Promise<WeeklyUpdate | null> {
  const state = await loadState();
  const u = state.lastUpdate;
  if (!u) return null;
  return { weekIndex: u.weekIndex, at: u.at, explanations: (u.explanations as Explanation[]) ?? [], seen: !!u.seen };
}

/** Mark the latest Weekly Update as seen (so it is not re-presented). */
export async function markWeeklyUpdateSeen(): Promise<void> {
  const state = await loadState();
  if (state.lastUpdate) {
    state.lastUpdate.seen = true;
    await saveState(state);
  }
}

/** Reset all v4 engine state (account wipe / tests). */
export async function resetV4(): Promise<void> {
  await saveState(emptyState());
}

// ───────────────────────────── debug / QA ─────────────────────────────
export interface V4DebugState {
  slots: SlotState[];
  global: GlobalState;
  lastAdvanceAt: number;
  lastUpdate: { weekIndex: number; at: string; changes: number; seen: boolean } | null;
}

/** Full persisted engine state for the internal debug/QA screen (every slot field). */
export async function getDebugState(): Promise<V4DebugState> {
  const state = await loadState();
  const u = state.lastUpdate;
  return {
    slots: Object.values(slotsRecord(state)),
    global: state.global as GlobalState,
    lastAdvanceAt: state.lastAdvanceAt,
    lastUpdate: u ? { weekIndex: u.weekIndex, at: u.at, changes: (u.explanations as unknown[]).length, seen: !!u.seen } : null,
  };
}
