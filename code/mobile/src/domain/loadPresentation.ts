/**
 * Equipment-native load presentation (UX items 5 & 12). The headline IS the engine's prescribed
 * load — the same number the athlete lifts, logs, and that Hush learns. This layer NEVER changes
 * that number; it only explains how to set the equipment up so the athlete never has to calculate.
 *
 * RATIFIED RULE: display value = performed value = logged value = learned value. The engine's
 * `normalizeLoad` already maps every prescription onto a real, loadable rung (the learn-real-loads
 * grid, or the static equipment increment), so there is no display-side rounding here — doing so
 * would re-introduce the very divergence the grid was built to remove.
 *
 * The setup instruction is equipment-native, never a universal "per side": barbell plate math,
 * dumbbell-per-hand, a machine pin, a fixed bar. Plate breakdowns are shown ONLY when the load
 * decomposes EXACTLY onto standard plates; otherwise the per-side weight is shown as a plain number
 * (so we never print a plate stack that doesn't sum to the actual load).
 */
import { loadStyleOf, type LoadStyle } from '@/data/exercises';
import type { Units } from '@/data/local/models';

/** Bar weight + plate denominations per unit (standard commercial gym). */
const GEAR: Record<Units, { bar: number; plates: number[] }> = {
  // Athletes think in 20s on a kg bar (100 kg → 20 + 20 / side), so the big plate is 20, not 25.
  kg: { bar: 20, plates: [20, 15, 10, 5, 2.5, 1.25] },
  lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] },
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Greedy plate decomposition for ONE side (largest plates first). */
export function platesPerSide(perSide: number, units: Units): number[] {
  let remaining = round2(perSide);
  const out: number[] = [];
  for (const p of GEAR[units].plates) {
    while (remaining >= p - 1e-6) {
      out.push(p);
      remaining = round2(remaining - p);
    }
  }
  return out;
}

/** Plates for one side ONLY if they sum EXACTLY to the per-side weight, else null (not loadable on
 *  standard plates — e.g. a learned-grid value like 9.5 kg/side, or a lb-converted weight). */
function exactPlates(perSide: number, units: Units): number[] | null {
  if (perSide <= 0) return [];
  const plates = platesPerSide(perSide, units);
  const sum = round2(plates.reduce((a, p) => a + p, 0));
  return sum === round2(perSide) ? plates : null;
}

export interface LoadSetup {
  style: LoadStyle;
  /** The headline number — identical to the engine's load (no rounding). */
  headline: number;
  /** Per-side weight for the bar/carriage (barbell, plate_loaded). */
  perSide?: number;
  /** Plate stack for one side (largest first) — present ONLY when it sums exactly to `perSide`. */
  plates?: number[];
  /** Bar weight (barbell only). */
  barKg?: number;
  /** Per-hand weight (dumbbell). */
  perHand?: number;
  /** Stack pin weight (selectorized, cable). */
  pin?: number;
  /** Fixed-bar weight (fixed_barbell). */
  fixedBar?: number;
}

/**
 * Derive the load setup for an exercise at its prescribed DISPLAY load (already in the athlete's
 * units). Returns null for bodyweight (the caller keeps its existing "Bodyweight" copy) and for a
 * null load. The headline always equals `displayValue` — this never changes the prescribed load.
 */
export function loadSetup(exerciseId: string | null | undefined, displayValue: number | null, units: Units): LoadSetup | null {
  if (displayValue == null) return null;
  const style = loadStyleOf(exerciseId);
  switch (style) {
    case 'bodyweight':
      return null;
    case 'barbell': {
      const perSide = Math.max(0, round2((displayValue - GEAR[units].bar) / 2));
      const plates = exactPlates(perSide, units);
      return { style, headline: displayValue, perSide, plates: plates ?? undefined, barKg: GEAR[units].bar };
    }
    case 'plate_loaded': {
      const perSide = round2(displayValue / 2);
      const plates = exactPlates(perSide, units);
      return { style, headline: displayValue, perSide, plates: plates ?? undefined };
    }
    case 'dumbbell':
      return { style, headline: displayValue, perHand: displayValue };
    case 'selectorized':
    case 'cable':
      return { style, headline: displayValue, pin: displayValue };
    case 'fixed_barbell':
      return { style, headline: displayValue, fixedBar: displayValue };
  }
}
