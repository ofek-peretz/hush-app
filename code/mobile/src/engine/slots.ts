/**
 * Engine-agnostic slot identity — the durable per-slot key used by the Lock System.
 *
 * These are PURE structural functions of the program + the catalogue pattern mapping. They read no
 * engine state (v4 or v5), so they live outside either engine and survive v4's deletion. The Lock
 * System keys a slot's lock to this durable id so it survives weekly regeneration and manual
 * replacement (the lock belongs to the SLOT, not the exercise inside it).
 */
import type { Program } from '@/data/local/models';
import { enginePattern, type Pattern } from '@/engine/catalog';

/**
 * Per day, the durable slotId aligned to each `day.slots` position (null where the slot is core /
 * unmapped — not engine-managed, so not lockable). `slot.engineSlotId` when the assembler stamped
 * one; a positional fallback (`dayKey:pattern#idx`) otherwise, for pre-upgrade programs.
 */
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

/** The durable slotId for a displayed (dayId, slotIndex), or null when the slot is not lockable. */
export function engineSlotIdAt(program: Program, dayId: string, slotIndex: number): string | null {
  return slotIdsByPosition(program).get(dayId)?.[slotIndex] ?? null;
}
