/**
 * Typed copy hook. Screens call `t('namespace.key', params)` — never a literal.
 * Also resolves a {key, params} Line (from the voice/receipt resolvers) directly.
 *
 * GENDERED BY DEFAULT (founder 2026-07-12). Every lookup carries the athlete's gender as
 * i18next's `context`, so `t('ob.trainTitle')` resolves `ob.trainTitle_female` for a woman and
 * falls back to the base key when no feminine form exists (English authors none). No screen
 * passes anything: the hook re-renders when the gender is picked, and the whole app changes
 * person at once. A caller that genuinely needs the ungendered string can pass its own `context`
 * and override it.
 *
 * Callers that are NOT screens (notifications, rest haptics, the Live Activity) cannot use a
 * hook — they use `tg()` from '@/i18n', which reads the same store. The one surface that can use
 * neither is the technique-cue library, because a context suffix cannot address an element of a
 * JSON array; it selects the feminine array itself (see data/exercises.ts).
 */
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Line } from '@/domain/voice';
import { useGender } from './gender';

type Params = Record<string, unknown>;

export function useCopy() {
  const { t: raw } = useTranslation();
  const gender = useGender();

  const t = useCallback(
    (key: string | string[], params?: Params): string =>
      raw(key as string, { context: gender, ...(params ?? {}) }) as unknown as string,
    [raw, gender],
  );

  return useMemo(
    () => ({
      t,
      /** Render a resolver Line (or nothing for silence). */
      line: (l: Line | null): string | null => (l ? t(l.key, l.params ?? {}) : null),
    }),
    [t],
  );
}
