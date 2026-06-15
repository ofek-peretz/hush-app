/**
 * Reduced Motion (spec §8.2). When the system setting is on: slides become
 * fades, sheet springs become fades, the timer pulse is suppressed (haptic
 * still fires), Portrait bars draw fully. No Hush moment depends on motion to
 * be understood.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}
