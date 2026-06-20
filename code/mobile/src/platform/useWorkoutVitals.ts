/**
 * useWorkoutVitals — polls the paired-watch live vitals (heart rate + active
 * energy) while a workout is active, for the rest-screen status line (founder #7;
 * watch spec §3.4/§3.5). Returns null until a live source exists (the HealthKit
 * workout session is native and ships with the watch build), and the caller hides
 * the row when null. Fully isolated: a missing method / thrown read is a clean null.
 */
import { useEffect, useState } from 'react';
import { health, type WorkoutVitals } from '@/platform/health';

/**
 * Estimated active calories for athletes WITHOUT a paired watch (founder #1): a
 * MET-based approximation from bodyweight × elapsed time — resistance training ≈
 * 5 MET → ~0.07 kcal per kg per minute. Rough but honest and useful; the watch
 * value replaces it when present. Pure.
 */
export function estimateActiveKcal(weightKg: number | null | undefined, elapsedMinutes: number): number {
  const kg = weightKg && weightKg > 0 ? weightKg : 75;
  return Math.max(0, Math.round(0.07 * kg * Math.max(0, elapsedMinutes)));
}

export function useWorkoutVitals(active: boolean): WorkoutVitals | null {
  const [vitals, setVitals] = useState<WorkoutVitals | null>(null);

  useEffect(() => {
    if (!active || typeof health.workoutVitals !== 'function') {
      setVitals(null);
      return;
    }
    let cancelled = false;
    const read = () => {
      health
        .workoutVitals?.()
        .then((v) => {
          if (!cancelled) setVitals(v);
        })
        .catch(() => {
          if (!cancelled) setVitals(null);
        });
    };
    read();
    const id = setInterval(read, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active]);

  return vitals;
}
