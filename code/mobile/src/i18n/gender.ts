/**
 * Grammatical gender — the athlete's `sex`, published to the copy layer.
 *
 * Hebrew has no neutral second person: every verb Hush addresses the athlete with is
 * conjugated masculine or feminine ("התחלת" / "התחלת", "תרים" / "תרימי"). Writing one
 * form and hoping is what shipped, and it is wrong for half the athletes. So the copy
 * layer needs the athlete's gender BEFORE the first sentence is rendered — which is why
 * sex is now asked on the NAME screen (step 2), not on Body data (step 4).
 *
 * This is a tiny store rather than app state on purpose: `useCopy` is used by every
 * screen and by the pure domain resolvers, and it must not depend on the app store (a
 * cycle) nor re-render the world through a context. `setGender` is called from exactly
 * two places — the app store when a profile boots/changes, and the name screen the moment
 * the athlete picks.
 *
 * The value feeds i18next's `context` suffix: `t('k')` resolves `k_female` for a woman
 * and falls back to the base `k` when no feminine form was authored (English needs none).
 * Masculine is the fallback for an unknown gender — the app's copy as it shipped.
 */
import { useSyncExternalStore } from 'react';

export type Gender = 'male' | 'female';

let current: Gender = 'male';
const listeners = new Set<() => void>();

/** Publish the athlete's gender to the copy layer. Idempotent; unknown → masculine. */
export function setGender(sex: Gender | null | undefined): void {
  const next: Gender = sex === 'female' ? 'female' : 'male';
  if (next === current) return;
  current = next;
  for (const l of listeners) l();
}

export function getGender(): Gender {
  return current;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Re-renders the caller when the athlete's gender changes (the onboarding pick). */
export function useGender(): Gender {
  return useSyncExternalStore(subscribe, getGender, getGender);
}

/** Test seam — reset to the default between cases. */
export function resetGender(): void {
  setGender('male');
}
