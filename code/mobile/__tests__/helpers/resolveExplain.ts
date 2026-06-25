/**
 * Test helper — resolve a v4 Explanation i18n line ({key, params}) to its English
 * string via a standalone i18next instance built from the real en.json. Lets the
 * engine tests assert on the RENDERED copy (the engine now emits keys, not strings).
 * Not a test suite (outside the *.test.ts glob); imported by the engine tests.
 */
import i18next from 'i18next';
import en from '@/i18n/locales/en.json';
import type { ExplanationLine } from '@/engine/v4/types';

const inst = i18next.createInstance();
// Inline resources → init resolves synchronously, so `t` is usable immediately.
void inst.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false, skipOnVariables: false },
  returnNull: false,
});

export function resolveLine(l: ExplanationLine): string {
  return inst.t(l.key, l.params ?? {}) as string;
}
