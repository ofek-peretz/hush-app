/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE ROOM — is this exercise physically possible where she trains? (2026-09-01, audit finding 06)
 *
 * One predicate, asked at the two places the engine chooses FOR her — assembly (`pickExercises`)
 * and the swap pool. Nothing she chooses HERSELF is ever filtered: a library pick, an imported
 * week and a builder week are her word about her own room, and the app arguing with a choice she
 * is making is the exact behaviour constraint #10 bans.
 *
 * ── THE DEFAULT IS EVERYTHING, AND THAT IS A PARITY GUARANTEE ───────────────────────────────────
 * `profile.equipment` absent → every family. Every athlete who never opened the control, every
 * existing install and every existing test gets byte-for-byte the programme they had. The filter
 * exists only for the athlete who SAID her room is smaller.
 *
 * ── BODYWEIGHT IS NEVER ABSENT ──────────────────────────────────────────────────────────────────
 * A room with no equipment at all still contains her. `bodyweight` passes unconditionally and is
 * not an option in the control.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import type { Exercise, EquipmentFamily } from '@/data/exercises';

/** The families the You control offers, in display order. Bodyweight is deliberately not here. */
export const ROOM_FAMILIES: Exclude<EquipmentFamily, 'bodyweight'>[] = [
  'barbell',
  'fixed_barbell',
  'dumbbell',
  'machine',
  'cable',
];

/** Is `ex` performable in a room offering `equipment`? Absent list = full gym = always yes. */
export function inRoom(ex: Pick<Exercise, 'equipment' | 'bodyweight'>, equipment?: readonly EquipmentFamily[]): boolean {
  if (!equipment) return true;
  if (ex.bodyweight || ex.equipment === 'bodyweight') return true;
  return equipment.includes(ex.equipment);
}

/**
 * Normalise a control's answer for storage: the FULL room stores as absent (the parity default).
 *
 * ⛔ THE EMPTY ANSWER IS A ROOM (2026-09-10, the formula report). It used to fold back to absent —
 * "you cannot declare away your body" — which was true and also meant a bodyweight-only room could
 * not be said at all: every switch off was the full gym. A living room with nothing in it is the
 * most common room there is, and the catalogue now holds a quad lift and a split for it. `[]`
 * stores as `[]`: every family off, bodyweight (never a switch) still there, and `inRoom` admits
 * exactly the bodyweight shelf. A muscle the shelf cannot serve keeps the assembler's fallback.
 */
export function roomForStorage(picked: readonly EquipmentFamily[]): EquipmentFamily[] | undefined {
  const clean = ROOM_FAMILIES.filter((f) => picked.includes(f));
  if (clean.length === ROOM_FAMILIES.length) return undefined;
  return clean;
}
