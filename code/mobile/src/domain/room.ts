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
  'kettlebell',
  'machine',
  'cable',
  'band',
];

/** Is `ex` performable in a room offering `equipment`? Absent list = full gym = always yes. */
export function inRoom(ex: Pick<Exercise, 'equipment' | 'bodyweight'>, equipment?: readonly EquipmentFamily[]): boolean {
  if (!equipment) return true;
  /*
   * ⛔ THE FAMILY DECIDES, NOT THE LOAD AXIS (2026-09-10). This read `ex.bodyweight || …`, and
   * `bodyweight` means "no load is prescribed", not "needs nothing": the assisted pull-up and dip
   * are MACHINES carrying that flag, the back extension is a bench, and every band lift carries it.
   * So a living room was handed an assist machine and a dumbbell room a hyperextension bench. What
   * she needs is the equipment family, and only the bodyweight FAMILY is in every room.
   */
  if (ex.equipment === 'bodyweight') return true;
  return equipment.includes(ex.equipment);
}

/**
 * The families a HOME is made of (2026-09-10): her body, a set of bells, a bag of bands. None of
 * them is ever a gym's furniture, and a room built only from them is a living room.
 */
export const HOME_FAMILIES: ReadonlySet<EquipmentFamily> = new Set<EquipmentFamily>(['bodyweight', 'kettlebell', 'band']);

/**
 * Is this a declared room with nothing a gym has in it? Absent (a full gym) is not; the empty room
 * (bodyweight only) is; a kettlebell room, a band room, and the two together are. A dumbbell room is
 * NOT — a rack of dumbbells is the one family a home and a gym share, and its fallback is unchanged.
 */
export function isHomeRoom(equipment?: readonly EquipmentFamily[]): boolean {
  return equipment != null && equipment.every((f) => HOME_FAMILIES.has(f));
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
