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
import { applySwap } from './swap';
import { demonstrated, epley, normalizeLoad, volumeLoad } from './reads';
import { exerciseById, exerciseDisplayName, progressionRule } from '@/data/exercises';
import { enginePattern, exerciseMeta } from './catalogAdapter';
import { currentWeekOpen } from '@/domain/weekCadence';
import type { Explanation } from './types';
import { toEngineGoal, toTrainingAge, repScheme, type EngineProfile, type SlotState, type SlotResult, type GlobalState, type SetRecord, type Pattern } from './types';
import { DEFAULTS, REP_RANGE_BY_GOAL } from './constants';

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
  const seen = new Set<string>(); // unified same-exercise slots share one id → emit it once
  for (const day of program.days) {
    if (day.isRest) continue;
    const perPattern = new Map<Pattern, number>();
    for (const slot of day.slots) {
      if (slot.supplemental) continue; // CORE accessory — not engine-managed
      const pattern = enginePattern(slot.exerciseId);
      if (pattern == null) continue;
      const idx = perPattern.get(pattern) ?? 0;
      perPattern.set(pattern, idx + 1);
      // STABLE id when the assembler stamped one (founder 2026-07-09); positional fallback keeps
      // pre-upgrade programs + pure-engine callers working. This is what lets an engine swap change
      // a slot's exercise WITHOUT shifting its identity at the next regen (finding 2 / V1).
      const slotId = slot.engineSlotId ?? `${day.key ?? day.id}:${pattern}#${idx}`;
      if (seen.has(slotId)) continue; // a shared (same-exercise) slot is one engine progression
      seen.add(slotId);
      out.push({ slotId, pattern, exerciseId: slot.exerciseId, dayKey: day.key ?? day.id, setCount: slot.setCount });
    }
  }
  return out;
}

/**
 * Per day, the engine slotId aligned to each `day.slots` position (null where the slot is core /
 * unmapped — i.e. not engine-managed, so not lockable). Mirrors deriveSlots' indexing exactly, so
 * the app can key a slot's lock/state to the durable engine slotId from a (dayId, slotIndex). */
export function slotIdsByPosition(program: Program): Map<string, (string | null)[]> {
  const byDay = new Map<string, (string | null)[]>();
  for (const day of program.days) {
    const ids: (string | null)[] = [];
    if (day.isRest) {
      byDay.set(day.id, ids);
      continue;
    }
    const perPattern = new Map<Pattern, number>();
    for (const slot of day.slots) {
      const pattern = slot.supplemental ? null : enginePattern(slot.exerciseId);
      if (pattern == null) {
        ids.push(null);
        continue;
      }
      const idx = perPattern.get(pattern) ?? 0;
      perPattern.set(pattern, idx + 1);
      ids.push(slot.engineSlotId ?? `${day.key ?? day.id}:${pattern}#${idx}`);
    }
    byDay.set(day.id, ids);
  }
  return byDay;
}

/** The engine slotId for a displayed (dayId, slotIndex), or null when that slot is not engine-
 *  managed (core / unmapped) and therefore cannot be locked. */
export function engineSlotIdAt(program: Program, dayId: string, slotIndex: number): string | null {
  return slotIdsByPosition(program).get(dayId)?.[slotIndex] ?? null;
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
    // Calibration tunes LOAD — a bodyweight lift has none, and an athlete overshooting the
    // rep target can never land "in range" to exit, freezing the slot in calibrate forever
    // (blocking rep progression AND graduation). Bodyweight goes straight to reactive.
    calibrating: !meta.bodyweight && !established,
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
 * exercise-scoped state so the new lift starts CALIBRATING — the slot's durable identity (slotId,
 * order, LOCK) is preserved. Idempotent.
 *
 * Lock System: the athlete-LOCKED set is the source of truth for `slot.locked` — every slot's lock
 * is reconciled to it here. A lock therefore belongs to the SLOT (survives regen + manual
 * replacement) and is purely athlete-controlled; manual replacement no longer implies a lock.
 */
export async function ensureSlots(
  program: Program,
  profile: EngineProfile,
  history: Session[],
  seedFor: SeedFor,
  lockedSlotIds: ReadonlySet<string> = new Set(),
): Promise<EngineV4State> {
  const state = await loadState();
  const slots = slotsRecord(state);
  const derived = deriveSlots(program);
  const keep = new Set(derived.map((d) => d.slotId));
  for (const d of derived) {
    const existing = slots[d.slotId];
    if (!existing) {
      slots[d.slotId] = initialSlot(d, profile, history, seedFor);
    } else if (existing.current_exercise_id !== d.exerciseId) {
      // Manual replacement (C-7): the new lift calibrates into the slot; identity is kept.
      // Bodyweight never calibrates (no load to calibrate — see initialSlot).
      const fresh = initialSlot(d, profile, history, seedFor);
      slots[d.slotId] = { ...fresh, calibrating: !exerciseMeta(d.exerciseId).bodyweight, tenure_weeks: 0, weeks_since_swap: 0 };
    }
  }
  // Slots no longer in the program (time-cap trim / frequency change). Finding 17: keep a dropped
  // slot's state DORMANT if it was ever trained (has trend history or tenure), so its progression
  // resumes untouched if the lift returns; prune only never-trained slots so state can't accrete.
  for (const id of Object.keys(slots)) {
    if (keep.has(id)) continue;
    const s = slots[id] as SlotState;
    if ((s.history?.length ?? 0) === 0 && (s.tenure_weeks ?? 0) === 0) delete slots[id];
  }

  // Reconcile each slot's lock to the athlete's lock store (the source of truth). This is what
  // makes the lock durable across regen/replacement and prevents engine-initiated swaps (swap.ts
  // I-7) on locked slots, while leaving manual replacement unaffected.
  for (const id of Object.keys(slots)) slots[id].locked = lockedSlotIds.has(id);

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

/** Per-slot current identity + volume, keyed by the durable engine slotId — the source the
 *  assembler overlays onto the program so engine swaps/graduations (exercise) and the volume lever
 *  (sets) actually reach the athlete's workout (findings 2/3). Load/reps stay in currentTargets. */
export interface V4SlotView {
  exerciseId: string;
  sets: number;
  /** Weeks stalled + weeks in the slot — the periodic-refresh picker rotates the most-stalled
   *  (tie: longest-tenured) non-pinned lift out each cycle. */
  flatWeeks: number;
  tenure: number;
}
export async function currentSlots(): Promise<Record<string, V4SlotView>> {
  const state = await loadState();
  const slots = slotsRecord(state);
  const out: Record<string, V4SlotView> = {};
  for (const id of Object.keys(slots)) {
    const s = slots[id];
    out[id] = { exerciseId: s.current_exercise_id, sets: s.current_sets, flatWeeks: s.flat_weeks, tenure: s.tenure_weeks };
  }
  return out;
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
 * The athlete's learned equipment grid for an exercise: the distinct loads they have ACTUALLY
 * performed (preserved observed truth — never normalized). De-duped to 0.5 kg so float dust /
 * a one-off mis-entry can't shatter the grid. This is what lets normalizeLoad prefer a real
 * achievable load over the static increment; empty until the first session, where it falls back.
 */
function observedLoads(exerciseId: string, sessions: Session[]): number[] {
  const seen = new Set<number>();
  for (const s of sessions) {
    for (const log of s.sets) {
      if (log.exerciseId !== exerciseId) continue;
      if (log.actualWeight != null && log.actualWeight > 0) seen.add(Math.round(log.actualWeight * 2) / 2);
    }
  }
  return [...seen];
}

/** `exerciseMeta` enriched with the athlete's observed grid (integration-only; the pure engine just
 *  reads `meta.observed_loads`). Curried over the full history so each slot's normalization snaps to
 *  the real loads performed on THAT exercise. */
function metaWithGridFor(history: Session[]) {
  return (exerciseId: string) => ({ ...exerciseMeta(exerciseId), observed_loads: observedLoads(exerciseId, history) });
}

/**
 * Advance the engine at the WEEKLY calendar roll (founder 2026-07-09, finding 7). A training week =
 * the Sat-20:30 window; at the roll the engine folds ALL sessions logged since the last roll into
 * one week's per-slot results, runs planNextWeek, and persists the updated slot state + a per-slot
 * history record. So the plan is stable all week and updates on the whole week's work (2+ sessions
 * of a muscle group feed one decision). The PURE engine is unchanged — only the cadence moved from
 * "every `frequency` completed sessions" to "once per calendar week". `nowMs` is injectable for tests.
 */
let advanceInFlight: Promise<void> | null = null;
export async function maybeAdvance(
  program: Program,
  profile: EngineProfile,
  history: Session[],
  seedFor: SeedFor,
  lockedSlotIds: ReadonlySet<string> = new Set(),
  nowMs: number = Date.now(),
  /** The Sat-20:30 the CURRENT program bucket was built for (db.loadWeekOpen). The engine never
   *  advances ahead of the bucket the athlete is executing — see the anchor stamp in doAdvance.
   *  Absent → the current week-open (the ordinary case; identity). */
  bucketOpenMs?: number,
): Promise<void> {
  // Finding 14: coalesce concurrent advances (Home fires several sessionTargets at once) so the
  // read-modify-write of the persisted engine state never interleaves — the in-flight advance
  // already folds the current history, and the next read picks up anything newer.
  if (advanceInFlight) {
    await advanceInFlight.catch(() => {});
    return;
  }
  advanceInFlight = doAdvance(program, profile, history, seedFor, lockedSlotIds, nowMs, bucketOpenMs);
  try {
    await advanceInFlight;
  } finally {
    advanceInFlight = null;
  }
}

async function doAdvance(
  program: Program,
  profile: EngineProfile,
  history: Session[],
  seedFor: SeedFor,
  lockedSlotIds: ReadonlySet<string> = new Set(),
  nowMs: number = Date.now(),
  bucketOpenMs?: number,
): Promise<void> {
  const state = await ensureSlots(program, profile, history, seedFor, lockedSlotIds);
  const slots = slotsRecord(state);
  // history is newest-first; process oldest-first in week-sized chunks.
  const chrono = history.slice().reverse();

  // ── Extended absence (I-6) — the one time-based fact the engine reads. days_since_last_session
  // is a wall-clock read of the newest completed session; when the gap exceeds ABSENCE_DAYS the
  // engine's absence path (ease all loads ×0.90, KEEP volume, fresh baseline) is applied ONCE per
  // gap, keyed to the last pre-gap session so reopening the app never re-eases. This runs on
  // RETURN (every prescription read), not at week rollover — an absent athlete completes no weeks,
  // so the rollover path alone could never reach it.
  // Finding 15: the "last session" for the absence read is the one with the newest DATE, not the
  // one inserted most recently — a stale watch record reconciled late lands at history[0] but must
  // not make a currently-active athlete look absent.
  const lastSession = history.length
    ? history.reduce((a, b) => (Date.parse(b.startedAt) > Date.parse(a.startedAt) ? b : a))
    : undefined;
  const daysSince = lastSession ? Math.max(0, Math.floor((nowMs - Date.parse(lastSession.startedAt)) / 86400000)) : 0;
  state.global = { ...(state.global as GlobalState), days_since_last_session: daysSince };
  if (lastSession && daysSince > DEFAULTS.ABSENCE_DAYS && state.absenceKey !== lastSession.id && Object.keys(slots).length > 0) {
    const slotList = Object.values(slots);
    const beforeById = new Map(slotList.map((s) => [s.slotId, s]));
    const out = planNextWeek({
      profile,
      slots: slotList,
      global: state.global as GlobalState,
      results: [], // no completed week — the global absence order applies to every slot
      meta: metaWithGridFor(history),
      nameOf: exerciseDisplayName,
      consts: undefined,
    });
    for (const ns of out.updated_slots) slots[ns.slotId] = ns;
    state.absenceKey = lastSession.id;
    // Surface the easing (Weekly Update + Why): the athlete returns to visibly adjusted loads.
    const plan: WeekPlanChange[] = out.explanations.map((e) => {
      const before = beforeById.get(e.slotId);
      const after = out.next_slots.find((n) => n.slotId === e.slotId);
      return {
        slotId: e.slotId,
        exerciseId: after?.exercise_id ?? before?.current_exercise_id ?? '',
        loadFrom: before?.current_load_kg ?? null,
        loadTo: after?.load_kg ?? before?.current_load_kg ?? null,
        setsFrom: before?.current_sets ?? after?.sets ?? 0,
        setsTo: after?.sets ?? before?.current_sets ?? 0,
        rangeFrom: before?.rep_range ?? after?.rep_range ?? [0, 0],
        rangeTo: after?.rep_range ?? before?.rep_range ?? [0, 0],
        swapped: false,
      };
    });
    state.lastUpdate = { weekIndex: state.weeksProcessed ?? 0, at: new Date(nowMs).toISOString(), explanations: out.explanations, plan, seen: false };
  }

  // ── Weekly rollover at the Sat-20:30 calendar boundary (finding 7) ──
  const weekOpen = currentWeekOpen(nowMs);
  const rolled = state.lastAdvanceWeekOpen != null && weekOpen > state.lastAdvanceWeekOpen;
  if (rolled && chrono.length > state.lastAdvanceAt) {
    const week = chrono.slice(state.lastAdvanceAt); // every session since the last roll = this week
    const weekIndex = state.weeksProcessed ?? 0;
    const slotList = Object.values(slots);
    const results: SlotResult[] = [];
    for (const slot of slotList) {
      const sets = setRecords(slot.current_exercise_id, week);
      if (!sets.length) continue; // untrained slot → no result → holds
      // sessions_planned = sessions_completed keeps adherence at 1.0: missed sessions never cut load
      // (founder — the adherence deload stays off), the engine just progresses from what WAS trained.
      results.push({ slotId: slot.slotId, pattern: slot.pattern, exercise_id: slot.current_exercise_id, sets, sessions_completed: week.length, sessions_planned: week.length });
    }

    // Snapshot each slot's BEFORE state so the Weekly Update (B) can render the
    // true from→to per change (decreases included — the explanation lines alone
    // don't carry the old value).
    const beforeById = new Map(slotList.map((s) => [s.slotId, s]));

    const out = planNextWeek({
      profile,
      slots: slotList,
      // A completed week being processed is activity by definition — the absence fact is a NOW
      // read handled by the pre-pass above, never re-applied to queued historical chunks.
      global: { ...(state.global as GlobalState), days_since_last_session: 0 },
      results,
      meta: metaWithGridFor(history),
      // Founder 2026-07-09: the engine's automatic stall-SWAP is OFF (no `candidates` → planNextWeek
      // never swaps). Exercise variety + plateau-breaking is handled by the periodic 3-week refresh
      // (assembler-owned), which walks the whole muscle pool with no ping-pong; a swap the engine
      // used to make was rare, reactive, and surfaced a roll late — the refresh does it better.
      seedLoad: (id) => seedFor(id),
      // Founder 2026-07-09: the engine's set-adding lever is OFF — set count is owned entirely by the
      // assembler (setsFor + the 4-set cap + the 60-min ceiling). A stall therefore breaks straight
      // through LOAD → RANGE (both reach the athlete's workout), never a set that would fight those
      // caps. The stall ladder skips 'vol' and never wastes a week on it.
      volumeLeverAvailable: () => false,
      nameOf: exerciseDisplayName,
      consts: undefined,
    });

    // Persist updated slots + append a per-slot history record for trend continuity.
    for (const ns of out.updated_slots) {
      const res = results.find((r) => r.slotId === ns.slotId);
      const rec = res
        ? { week: weekIndex, sets: res.sets, e1rm_week: demonstrated(res.sets, ns.rep_target).best_e1rm ?? 0, volume_load: volumeLoad(res.sets), completed_sets: res.sets.length, prescribed_sets: ns.current_sets }
        : null;
      slots[ns.slotId] = rec ? { ...ns, history: [rec, ...ns.history].slice(0, 6) } : ns;
    }
    state.global = out.updated_global;

    // ── Bodyweight graduation (S6, approved 2026-07-05) ──
    // A bodyweight lift has no load axis: once it holds the TOP of its rep range for the
    // athlete's stall window, the next stimulus is the harder catalog variation (knee
    // push-up → push-up → dip; chin-up → pull-up). Slot-durable swap: identity, order and
    // volume survive; LOCKED never graduates (I-7). The new lift does NOT calibrate when it
    // is itself bodyweight (calibration tunes load — meaningless without one; a strong
    // athlete overshooting the rep target would otherwise never exit). Lifts with no harder
    // variation (pull-up, dips at the ladder's top) hold honestly — the textVariation copy
    // says so instead of claiming a move that never happens.
    const graduated = new Map<string, { from: string; to: string }>();
    const gradWindow = DEFAULTS.STALL_WINDOW[profile.training_age];
    for (const id of Object.keys(slots)) {
      const s = slots[id];
      const meta = exerciseMeta(s.current_exercise_id);
      if (!meta.bodyweight || s.locked || s.calibrating) continue;
      if (s.rep_target !== s.rep_range[1]) continue;
      const rule = progressionRule(s.current_exercise_id);
      if (rule.mode !== 'reps' || !rule.harder || !exerciseById(rule.harder)) continue;
      let streak = 0;
      for (const rec of s.history) {
        const best = rec.sets.reduce((m, x) => Math.max(m, x.reps), 0);
        if (best >= s.rep_range[1]) streak += 1;
        else break;
      }
      if (streak < gradWindow) continue;
      const from = s.current_exercise_id;
      const harderMeta = exerciseMeta(rule.harder);
      slots[id] = { ...applySwap(s, rule.harder, seedFor(rule.harder), repScheme(profile.goal)), calibrating: !harderMeta.bodyweight };
      graduated.set(id, { from, to: rule.harder });
    }
    const gradExplanations: Explanation[] = [...graduated.entries()].map(([slotId, g]) => ({
      slotId,
      pattern: slots[slotId].pattern,
      observation: { key: 'explain.graduate.observation', params: { from: exerciseDisplayName(g.from) } },
      conclusion: { key: 'explain.graduate.conclusion' },
      action: { key: 'explain.graduate.action', params: { ex: exerciseDisplayName(g.to) } },
      text: { key: 'explain.graduate.text', params: { from: exerciseDisplayName(g.from), ex: exerciseDisplayName(g.to) } },
    }));
    // A graduating slot's engine line (the "hold the top" note) gives way to the graduation.
    const explanations = out.explanations.filter((e) => !graduated.has(e.slotId)).concat(gradExplanations);

    // Per-changed-slot from→to snapshot (only slots that surfaced an explanation). `slots`
    // already holds the FINAL post-week state (rails + graduation applied).
    const plan: WeekPlanChange[] = explanations.map((e) => {
      const before = beforeById.get(e.slotId);
      const after = slots[e.slotId];
      return {
        slotId: e.slotId,
        exerciseId: after?.current_exercise_id ?? before?.current_exercise_id ?? '',
        loadFrom: before?.current_load_kg ?? null,
        loadTo: after?.current_load_kg ?? before?.current_load_kg ?? null,
        setsFrom: before?.current_sets ?? after?.current_sets ?? 0,
        setsTo: after?.current_sets ?? before?.current_sets ?? 0,
        rangeFrom: before?.rep_range ?? after?.rep_range ?? [0, 0],
        rangeTo: after?.rep_range ?? before?.rep_range ?? [0, 0],
        swapped: !!after && !!before && after.current_exercise_id !== before.current_exercise_id,
      };
    });
    // Capture the week's explanations + plan for the Weekly Update + Why surfaces (a new week to view).
    state.lastUpdate = { weekIndex, at: new Date(nowMs).toISOString(), explanations, plan, seen: false };
    state.lastAdvanceAt = chrono.length; // all sessions to now are folded in
    state.weeksProcessed = weekIndex + 1;
  }
  // Move the anchor to the current week (even with no work to fold), so the next roll is the NEXT
  // Sat 20:30; on the very first run this only establishes the baseline (rolled was false → no fold).
  //
  // The engine advances with the PROGRAM BUCKET, never ahead of it (founder 2026-07-10): a mid-week
  // signup's first bucket is stamped for the NEXT Sat 20:30 (domain/weekCadence.firstBucketOpen) so
  // the athlete's first plan gets a full runway — and the engine must not bump loads (or publish a
  // Weekly Update) in the MIDDLE of a plan the athlete is still executing. Anchoring to the bucket
  // makes the first roll land exactly when that bucket expires. In the ordinary case the bucket
  // anchor IS the current week-open, so this is the identity.
  state.lastAdvanceWeekOpen = Math.max(weekOpen, bucketOpenMs ?? weekOpen);
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

// ──────────────── Weekly Update B: the whole week at its new loads ────────────────
/** A per-changed-slot from→to snapshot, captured at advance time (decreases included). */
export interface WeekPlanChange {
  slotId: string;
  exerciseId: string;
  loadFrom: number | null;
  loadTo: number | null;
  setsFrom: number;
  setsTo: number;
  rangeFrom: [number, number];
  rangeTo: [number, number];
  swapped: boolean;
}

export interface WeeklyPlanLift {
  exerciseId: string;
  name: string;
  loadKg: number | null; // current (new) prescribed load; null = bodyweight / unmanaged
  sets: number;
  repRange: [number, number] | null;
  /** Present only when Hush changed this slot this week (carries the Why triple). */
  change: { snapshot: WeekPlanChange; explanation: Explanation } | null;
}
export interface WeeklyPlanWorkout {
  dayId: string;
  name: string;
  groups: string[];
  lifts: WeeklyPlanLift[];
}
export interface WeeklyPlanView {
  weekIndex: number;
  at: string; // ISO of the advance
  changedCount: number;
  seen: boolean;
  workouts: WeeklyPlanWorkout[];
}

/**
 * The full week — every workout's lifts at their NEW loads, with the per-change
 * from→to snapshot and Why. Joins the program structure (grouping / order / names)
 * with engine slot state (current load / sets / range) and the captured weekly
 * snapshot (changes + explanations). Read-only; never alters state. Returns null
 * only when there is no engine state at all.
 */
export async function getWeeklyPlan(program: Program): Promise<WeeklyPlanView | null> {
  const state = await loadState();
  const u = state.lastUpdate;
  const slots = slotsRecord(state);
  const explanations = (u?.explanations as Explanation[] | undefined) ?? [];
  const plan = (u?.plan as WeekPlanChange[] | undefined) ?? [];
  const explBySlot = new Map(explanations.map((e) => [e.slotId, e]));
  const planBySlot = new Map(plan.map((p) => [p.slotId, p]));
  const idsByDay = slotIdsByPosition(program);

  const workouts: WeeklyPlanWorkout[] = [];
  for (const day of program.days) {
    if (day.isRest) continue;
    const ids = idsByDay.get(day.id) ?? [];
    const lifts: WeeklyPlanLift[] = day.slots.map((slot, i) => {
      const slotId = ids[i] ?? null;
      const st = slotId ? slots[slotId] : undefined;
      const snap = slotId ? planBySlot.get(slotId) : undefined;
      const expl = slotId ? explBySlot.get(slotId) : undefined;
      return {
        exerciseId: slot.exerciseId,
        name: exerciseDisplayName(slot.exerciseId),
        loadKg: st ? st.current_load_kg : null,
        sets: st ? st.current_sets : slot.setCount,
        repRange: st ? st.rep_range : null,
        change: snap && expl ? { snapshot: snap, explanation: expl } : null,
      };
    });
    workouts.push({ dayId: day.id, name: day.name, groups: day.muscleGroups, lifts });
  }
  const changedCount = workouts.reduce((n, w) => n + w.lifts.filter((l) => l.change).length, 0);
  return { weekIndex: u?.weekIndex ?? 0, at: u?.at ?? new Date().toISOString(), changedCount, seen: !!u?.seen, workouts };
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
