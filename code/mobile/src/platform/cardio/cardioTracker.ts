/**
 * Live cardio tracker — the sample source for the Open-training (run / walk) flow.
 *
 * ⚠️ SIMULATED pending native sensors. Distance, pace, heart rate, and calories are
 * modelled here (matching the Claude Design prototype) so the entire Open-training
 * flow — select → countdown → active → complete → recorded-to-History — works
 * end-to-end today on any device, including this Windows/Expo environment.
 *
 * NATIVE HANDOFF (macOS / Xcode): replace the sample generator in the interval
 * below with real sources —
 *   • distance / pace  → expo-location (GPS), `watchPositionAsync`
 *   • heart rate       → HealthKit live workout session (HKWorkoutSession)
 *   • calories         → HealthKit active energy, or keep the model estimate
 * Everything downstream (this hook's shape, the screen state machine, history
 * persistence, and the Live Activity wiring) is sensor-agnostic and stays as-is.
 */
import { useEffect, useRef, useState } from 'react';
import type { CardioGait, CardioSplit } from '@/data/local/models';

/** Base pace (sec/km) per gait — 5:42 /km running, 9:00 /km walking. */
const PACE: Record<CardioGait, number> = { run: 342, walk: 540 };

export interface CardioSample {
  elapsedSec: number;
  distanceKm: number;
  hr: number; // bpm
  calories: number; // kcal
  splits: CardioSplit[];
}

const ZERO: CardioSample = { elapsedSec: 0, distanceKm: 0, hr: 96, calories: 0, splits: [] };

/**
 * Accumulates a live cardio sample once per real second while `running` is true.
 * `liveGait` can change mid-activity (the athlete toggles run/walk); the model
 * follows it for pace, heart-rate target, and per-km split attribution.
 */
export function useCardioTracker(running: boolean, liveGait: CardioGait): CardioSample {
  const [sample, setSample] = useState<CardioSample>(ZERO);
  const gaitRef = useRef(liveGait);
  gaitRef.current = liveGait;
  // Mutable accumulator (refs so the interval reads the latest without re-subscribing).
  const acc = useRef({ elapsed: 0, dist: 0, hr: ZERO.hr, cal: 0, splits: [] as CardioSplit[], lastKm: 0, splitStart: 0 });

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const s = acc.current;
      const g = gaitRef.current;
      const pace = PACE[g] * (0.94 + Math.random() * 0.12); // sec/km, lightly jittered
      const dKm = 1 / pace; // one real second of progress
      s.elapsed += 1;
      s.dist += dKm;
      s.cal += dKm * (g === 'run' ? 65 : 48);
      const target = g === 'run' ? 152 : 120;
      s.hr = Math.round(s.hr + (target - s.hr) * 0.05 + (Math.random() - 0.5) * 2);
      const kmDone = Math.floor(s.dist);
      if (kmDone > s.lastKm) {
        s.lastKm = kmDone;
        const sec = s.elapsed - s.splitStart;
        s.splitStart = s.elapsed;
        s.splits = [...s.splits, { km: kmDone, durationSec: sec, paceSec: sec, gait: g }];
      }
      setSample({ elapsedSec: s.elapsed, distanceKm: s.dist, hr: s.hr, calories: s.cal, splits: s.splits });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  return sample;
}

/* ---- formatting helpers (shared by the screen + history detail) ---- */

/** mm:ss (or h:mm:ss past an hour). */
export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return (h ? `${h}:` : '') + `${mm}:${String(r).padStart(2, '0')}`;
}

/** m:ss per km (— : — when undefined). */
export function fmtPace(secPerKm: number): string {
  if (!isFinite(secPerKm) || secPerKm <= 0) return '--:--';
  const m = Math.floor(secPerKm / 60);
  const r = Math.round(secPerKm % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** Heart-rate zone label (Z1–Z5) for the live + detail readouts. */
export function hrZone(hr: number): string {
  if (hr < 132) return 'Z1';
  if (hr < 146) return 'Z2';
  if (hr < 162) return 'Z3';
  if (hr < 174) return 'Z4';
  return 'Z5';
}
