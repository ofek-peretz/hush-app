/**
 * Typed copy hook. Screens call `t('namespace.key', params)` — never a literal.
 * Also resolves a {key, params} Line (from the voice/receipt resolvers) directly.
 */
import { useTranslation } from 'react-i18next';
import type { Line } from '@/domain/voice';

export function useCopy() {
  const { t } = useTranslation();
  return {
    t,
    /** Render a resolver Line (or nothing for silence). */
    line: (l: Line | null): string | null => (l ? t(l.key, l.params ?? {}) : null),
  };
}
