/**
 * ════ THE BUILDER — her week, written by her own hand (founder, 2026-08-25) ════
 *
 * *"כעת ארצה אפשרות לבנות את תוכנית האימון בעצמי… האפליקציה מכריחה לקבל את התבנית של הבנייה
 * שלה… אנחנו צריכים לאפשר בנייה באופן מלא של תוכנית האימון."*
 *
 * This module is the pure algebra of a DRAFT: a `Program` being edited. Every operation returns a
 * fresh `Program` (React state discipline) and touches nothing else — no I/O, no store, no engine
 * calls. The draft becomes real only through `sealAuthored`, which stamps the one field that
 * changes its citizenship: `authored: 'athlete_or_coach'` — the same passport an imported week
 * carries, which is the entire architecture. A sealed draft runs through the SAME session runner,
 * gets the SAME cold-start seeds (`smartSeed`), the SAME Loop-2 progression, the SAME warm-up
 * ramps and rest timers, and the engine never rewrites its shape (`engineMayRebuild`).
 *
 * What the engine keeps on a built week is exactly what HEVY's blank sheet cannot offer: the
 * steward's voice. `builderMinutes` prices each day with the real clock (bridges included);
 * `builderAdvice` runs the week judge (`weekFindings`) in ADVISORY mode — a leg day once a week is
 * hers to choose, and its price is said out loud, never enforced (S-3's philosophy, extended).
 *
 * ⚠️ SET COUNTS ARE HERS HERE, [1..8]. F-1's [3,5] binds the ENGINE's prescriptions, not her pen —
 * the same freedom an imported coach plan already enjoys (`sessionTargets` sizes its emission from
 * the programme's largest slot, so a 6-set block gets a load on set 6).
 */

//

import type { Program, ProgramDay, Slot } from '@/data/local/models';
import { exerciseById, type Exercise } from '@/data/exercises';
import { estimateSessionMinutes, reflowDayForStations } from '@/data/api/fixtureModel';
import { weekFindings, type WeekFinding, type WeekInputs } from '@/domain/weekQuality';
import { move } from '@/domain/reorder';

/** Her set-count bounds. Wider than F-1 on purpose — see the header. */
export const BUILDER_SETS_MIN = 1;
export const BUILDER_SETS_MAX = 8;
/** What a new lift opens at — the engine's own day-one isolation count, a sane middle. */
export const BUILDER_SETS_DEFAULT = 3;

/** Day names cycle A, B, C… — plain data, renameable, never translated in storage. */
const DAY_LETTERS = 'ABCDEFGHIJ';

const cloneDay = (d: ProgramDay): ProgramDay => ({ ...d, slots: d.slots.map((s) => ({ ...s })), muscleGroups: [...d.muscleGroups] });
const cloneProgram = (p: Program): Program => ({ ...p, days: p.days.map(cloneDay) });

/** The metadata line a day carries — derived from its slots, in slot order, de-duped. */
function musclesOf(slots: readonly Slot[]): string[] {
  const out: string[] = [];
  for (const s of slots) {
    const m = exerciseById(s.exerciseId)?.muscle;
    if (m && !out.includes(m)) out.push(m);
  }
  return out;
}

/** A fresh, empty, editable day. */
/**
 * ⛔ THE NAME IS RESOLVED AT CREATION, NEVER AT RENDER (2026-08-29) — the rule the template shelves
 * already follow (`materializeTemplate`): storage holds a PLAIN name she can retype, so the app must
 * localise it the moment the day is made or never.
 *
 * It did neither. `name` was the literal `Workout A`, and on a Hebrew phone the "start from a blank
 * sheet" door — the founder's own ask, and now a headline door in the intake — opened onto two
 * English words. Nothing failed: a day name is free text, so no law and no typecheck could see it.
 *
 * `say` is that resolver, and it is optional so the pure algebra stays callable from a test without
 * a copy layer. Absent, the plain English name is the honest fallback it always was.
 */
export function blankDay(index: number, say?: (letter: string) => string): ProgramDay {
  const letter = DAY_LETTERS[index % DAY_LETTERS.length];
  return {
    id: `built_day_${index + 1}`,
    name: say ? say(letter) : `Workout ${letter}`,
    muscleGroups: [],
    isRest: false,
    slots: [],
  };
}

/** A draft copied from the current programme (engine's or hers) — the "start from the draft" door. */
export function draftFromProgram(program: Program): Program {
  const p = cloneProgram(program);
  // The engine's rest-day placeholders are its scheduling artefact, not content she edits.
  p.days = p.days.filter((d) => !d.isRest);
  return p;
}

/** A draft with nothing in it — the "start blank" door. */
export function blankDraft(id: string, say?: (letter: string) => string): Program {
  return { id, frequency: 1, days: [blankDay(0, say)] };
}

export function addDay(p: Program, say?: (letter: string) => string): Program {
  const out = cloneProgram(p);
  out.days.push(blankDay(out.days.length, say));
  return out;
}

export function removeDay(p: Program, dayIdx: number): Program {
  if (dayIdx < 0 || dayIdx >= p.days.length) return p;
  const out = cloneProgram(p);
  out.days.splice(dayIdx, 1);
  return out;
}

export function renameDay(p: Program, dayIdx: number, name: string): Program {
  if (dayIdx < 0 || dayIdx >= p.days.length) return p;
  const out = cloneProgram(p);
  out.days[dayIdx].name = name.trim() || out.days[dayIdx].name;
  return out;
}

export function moveDay(p: Program, from: number, to: number): Program {
  if (from === to || from < 0 || to < 0 || from >= p.days.length || to >= p.days.length) return p;
  const out = cloneProgram(p);
  out.days = move(out.days, from, to);
  return out;
}

/** True when the lift can join the day: known to the catalogue and not already in it. */
export function canAddLift(p: Program, dayIdx: number, exerciseId: string): boolean {
  const day = p.days[dayIdx];
  if (!day) return false;
  if (!exerciseById(exerciseId)) return false;
  return !day.slots.some((s) => s.exerciseId === exerciseId);
}

export function addLift(p: Program, dayIdx: number, exerciseId: string): Program {
  if (!canAddLift(p, dayIdx, exerciseId)) return p;
  const ex = exerciseById(exerciseId) as Exercise;
  const out = cloneProgram(p);
  out.days[dayIdx].slots.push({ capability: ex.capability, exerciseId, setCount: BUILDER_SETS_DEFAULT });
  out.days[dayIdx].muscleGroups = musclesOf(out.days[dayIdx].slots);
  return out;
}

export function removeLift(p: Program, dayIdx: number, slotIdx: number): Program {
  const day = p.days[dayIdx];
  if (!day || slotIdx < 0 || slotIdx >= day.slots.length) return p;
  const out = cloneProgram(p);
  const slots = out.days[dayIdx].slots;
  // Removing either partner dissolves the pair — the survivor goes back to straight sets.
  if (slotIdx > 0 && slots[slotIdx - 1].pairedWithNext) delete slots[slotIdx - 1].pairedWithNext;
  if (slots[slotIdx].pairedWithNext) delete slots[slotIdx].pairedWithNext;
  slots.splice(slotIdx, 1);
  normalizePairs(slots);
  out.days[dayIdx].muscleGroups = musclesOf(slots);
  return out;
}

export function setLiftSets(p: Program, dayIdx: number, slotIdx: number, sets: number): Program {
  const day = p.days[dayIdx];
  if (!day || slotIdx < 0 || slotIdx >= day.slots.length) return p;
  const clamped = Math.max(BUILDER_SETS_MIN, Math.min(BUILDER_SETS_MAX, Math.round(sets)));
  if (!Number.isFinite(clamped)) return p;
  const out = cloneProgram(p);
  out.days[dayIdx].slots[slotIdx].setCount = clamped;
  // A superset's partners share their rounds — editing either edits both (the pair contract).
  const slots = out.days[dayIdx].slots;
  if (slots[slotIdx].pairedWithNext && slots[slotIdx + 1]) slots[slotIdx + 1].setCount = clamped;
  if (slotIdx > 0 && slots[slotIdx - 1]?.pairedWithNext) slots[slotIdx - 1].setCount = clamped;
  return out;
}

/** Drop pair marks that no longer describe two adjacent partners — called by every structural
 *  verb, so a moved or removed row can never leave a pair binding lifts she did not pair. */
function normalizePairs(slots: Slot[]): void {
  for (let i = 0; i < slots.length; i++) {
    if (!slots[i].pairedWithNext) continue;
    // the last slot has no next; and a chain (A+B while B+C) is not in the vocabulary — clear the
    // second link so a pair is always exactly two.
    if (i === slots.length - 1 || (i > 0 && slots[i - 1].pairedWithNext)) delete slots[i].pairedWithNext;
  }
}

/** True when these two adjacent seats currently run as one superset. */
export function isPaired(p: Program, dayIdx: number, slotIdx: number): boolean {
  return p.days[dayIdx]?.slots[slotIdx]?.pairedWithNext === true;
}

/**
 * ════ HER SUPERSET (founder mandate 2026-08-26) ════
 * Couple this seat with the one under it — the two run as one alternating block, resting once per
 * round. Pairing SYNCS the partners' set counts (the runner's rounds are one number); unpairing
 * leaves the counts as they stand. Refuses to chain: a slot already claimed by the pair above
 * cannot open a second pair below it.
 */
export function togglePair(p: Program, dayIdx: number, slotIdx: number): Program {
  const day = p.days[dayIdx];
  if (!day || slotIdx < 0 || slotIdx >= day.slots.length - 1) return p;
  const out = cloneProgram(p);
  const slots = out.days[dayIdx].slots;
  if (slots[slotIdx].pairedWithNext) {
    delete slots[slotIdx].pairedWithNext;
    return out;
  }
  // no chains, in either direction
  if (slotIdx > 0 && slots[slotIdx - 1].pairedWithNext) return p;
  if (slots[slotIdx + 1].pairedWithNext) return p;
  slots[slotIdx].pairedWithNext = true;
  slots[slotIdx + 1].setCount = slots[slotIdx].setCount;
  return out;
}

export function moveLift(p: Program, dayIdx: number, from: number, to: number): Program {
  const day = p.days[dayIdx];
  if (!day || from === to || from < 0 || to < 0 || from >= day.slots.length || to >= day.slots.length) return p;
  const out = cloneProgram(p);
  // A move breaks every pair it disturbs — the mark binds SEATS, and these seats just changed
  // occupants. Cleared on the mover and on both old/new neighbours, then normalized.
  const slots = out.days[dayIdx].slots;
  for (const i of [from - 1, from, to - 1, to]) {
    if (i >= 0 && i < slots.length && slots[i].pairedWithNext) delete slots[i].pairedWithNext;
  }
  out.days[dayIdx].slots = move(out.days[dayIdx].slots, from, to);
  normalizePairs(out.days[dayIdx].slots);
  return out;
}

/** Swap one lift for another, keeping its seat and its set count. */
/**
 * A rep range written on ONE seat (founder 2026-09-07 — the model's per-lift band, see
 * `buildPrompt` at `REPS_MIN`). Stored on the slot; the engine's `bandOf` reads it ahead of her
 * profile band, and every scheme that prints `sets×lo–hi` prints this one. Clamped to the sane
 * bounds and refused when low > high; `null` clears it back to her own band.
 */
export const BAND_MIN = 2;
export const BAND_MAX = 30;
export function setLiftBand(p: Program, dayIdx: number, slotIdx: number, band: [number, number] | null): Program {
  const day = p.days[dayIdx];
  if (!day || slotIdx < 0 || slotIdx >= day.slots.length) return p;
  const out = cloneProgram(p);
  const slot = out.days[dayIdx].slots[slotIdx];
  if (band == null) {
    delete slot.repBand;
    return out;
  }
  const lo = Math.round(band[0]);
  const hi = Math.round(band[1]);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < BAND_MIN || hi > BAND_MAX || lo > hi) return p;
  slot.repBand = [lo, hi];
  return out;
}

export function replaceLift(p: Program, dayIdx: number, slotIdx: number, toId: string): Program {

  const day = p.days[dayIdx];
  const ex = exerciseById(toId);
  if (!day || !ex || slotIdx < 0 || slotIdx >= day.slots.length) return p;
  if (day.slots.some((s, i) => i !== slotIdx && s.exerciseId === toId)) return p;
  const out = cloneProgram(p);
  const slot = out.days[dayIdx].slots[slotIdx];
  slot.exerciseId = toId;
  slot.capability = ex.capability;
  out.days[dayIdx].muscleGroups = musclesOf(out.days[dayIdx].slots);
  return out;
}

/**
 * The equipment-flow order, ON HER TAP. `orderForFlow`'s law for authored weeks is that it never
 * runs silently (`aWeekSheBroughtIsNotOursToRewrite`); a button she presses is her authorship —
 * the same act as dragging the rows there herself, priced at one tap.
 */
export function reorderDayForStations(p: Program, dayIdx: number): Program {
  if (dayIdx < 0 || dayIdx >= p.days.length) return p;
  const out = cloneProgram(p);
  /*
   * A SUPERSET RIDES THE REFLOW AS ONE STOP. The flow sorts by station; a pair is two lifts at one
   * decision ("these run together"), so the pair travels under its FIRST partner's station and the
   * second is re-seated directly after it — the reflow never gets the chance to tear them apart.
   */
  const slots = out.days[dayIdx].slots;
  const trailing = new Map<Slot, Slot>();
  const fused: Slot[] = [];
  for (let i = 0; i < slots.length; i++) {
    fused.push(slots[i]);
    if (slots[i].pairedWithNext && slots[i + 1]) {
      trailing.set(slots[i], slots[i + 1]);
      i += 1;
    }
  }
  out.days[dayIdx].slots = fused;
  reflowDayForStations(out.days[dayIdx]);
  const expanded: Slot[] = [];
  for (const s of out.days[dayIdx].slots) {
    expanded.push(s);
    const b = trailing.get(s);
    if (b) expanded.push(b);
  }
  out.days[dayIdx].slots = expanded;
  normalizePairs(expanded);
  return out;
}

/** The day's honest clock — the same arithmetic the engine's cap and Today's card read. */
export function builderMinutes(day: ProgramDay): number {
  return Math.round(estimateSessionMinutes(day));
}

/**
 * The steward's advice for a draft — the week judge, in advisory mode. Everything it returns is a
 * FINDING, never a veto: `trained_once` on her single leg day is a price stated, not a wall.
 */
export function builderAdvice(p: Program, inputs: WeekInputs = {}): WeekFinding[] {
  return weekFindings(p, { ...inputs, daysPerWeek: p.days.filter((d) => !d.isRest).length });
}

/**
 * Seal the draft as HER programme. Empty days are pruned (an empty day is scaffolding, not a
 * workout); a draft with no work at all cannot be sealed. The `authored` stamp is what changes
 * everything downstream: `engineMayRebuild` refuses, the session runner takes it as-is, and the
 * only sanctioned mutation left is `balanceAuthoredWeek` — behind her own button.
 */
export function sealAuthored(p: Program): Program | null {
  const days = p.days.filter((d) => !d.isRest && d.slots.length > 0).map(cloneDay);
  if (days.length === 0) return null;
  for (const d of days) d.muscleGroups = musclesOf(d.slots);
  return { ...p, days, frequency: days.length, authored: 'athlete_or_coach' };
}

/** A day's content signature — what "she changed this day" means. Name + the slots she controls. */
const daySignature = (d: ProgramDay): string =>
  // The pair mark is part of a day's content: coupling two engine lifts IS touching the day.
  JSON.stringify({ name: d.name, slots: d.slots.map((s) => [s.exerciseId, s.setCount, s.supplemental === true, s.pairedWithNext === true]) });

/**
 * ════ THE HYBRID SEAL (founder, 2026-08-25: "יום שנגעה בו — שלה; יום שלא — שלו") ════
 *
 * Diff-based and stateless: a draft day that MATCHES its engine original (by id and content) is
 * still the engine's — it keeps adapting at every rebuild. A day that differs, or a day she added,
 * is stamped `authored: true` and the engine preserves it for ever after, assembling its days
 * around the volume hers deliver. The week's citizenship follows the days:
 *
 *   · she changed nothing        → the program returns as-was (an honest no-op save)
 *   · she changed SOME days      → hybrid: program stays `'engine'`, her days carry the flag
 *   · she changed EVERY day, or
 *     REMOVED an engine day      → the whole week is hers (`sealAuthored`) — removing a day is a
 *                                  claim about the week's structure, which day-level ownership
 *                                  cannot express without lying about `daysPerWeek`
 *
 * A draft opened from an already-authored week always seals fully — there is no road back to
 * hybrid from full ownership except the pen-back door.
 */
export function sealSmart(draft: Program, original: Program | null | undefined): Program | null {
  if (!original || (original.authored ?? 'engine') === 'athlete_or_coach') return sealAuthored(draft);

  const draftDays = draft.days.filter((d) => !d.isRest && d.slots.length > 0).map(cloneDay);
  if (draftDays.length === 0) return null;
  const originalByld = new Map(original.days.filter((d) => !d.isRest).map((d) => [d.id, d] as const));

  // An engine day she DELETED is a structural claim — the whole week becomes hers.
  const draftIds = new Set(draftDays.map((d) => d.id));
  for (const [id, day] of originalByld) {
    if (!day.authored && !draftIds.has(id)) return sealAuthored(draft);
  }

  let authoredCount = 0;
  const days = draftDays.map((d) => {
    const was = originalByld.get(d.id);
    const hers = !was || was.authored === true || daySignature(was) !== daySignature(d);
    if (hers) authoredCount += 1;
    const out = { ...d, muscleGroups: musclesOf(d.slots) };
    if (hers) out.authored = true;
    else delete out.authored;
    return out;
  });

  if (authoredCount === days.length) return sealAuthored(draft);
  return { ...draft, days, frequency: days.length, authored: 'engine' };
}

/** Which draft days currently read as HERS against the original — the UI's ownership chips. */
export function ownedDayIds(draft: Program, original: Program | null | undefined): Set<string> {
  if (!original || (original.authored ?? 'engine') === 'athlete_or_coach') return new Set(draft.days.map((d) => d.id));
  const originalByld = new Map(original.days.filter((d) => !d.isRest).map((d) => [d.id, d] as const));
  const out = new Set<string>();
  for (const d of draft.days) {
    const was = originalByld.get(d.id);
    if (!was || was.authored === true || daySignature(was) !== daySignature(d)) out.add(d.id);
  }
  return out;
}
