/**
 * i18n runtime. ALL user-facing copy flows through here (project decision,
 * 2026-06-13). No string literal may appear in a screen or component.
 *
 * v1 ships `en` only. The layer is RTL-ready and ICU-plural-ready so that
 * Hebrew (`he`, RTL) can be added later by dropping in locales/he.json with
 * zero structural change.
 *
 * Product-law enforcement (spec §8.9: no exclamation/emoji, no hedge words,
 * first-person indicative) runs against the `en` resource — see
 * scripts/lint-copy.ts — so the laws are guaranteed at the copy source.
 */
import { I18nManager } from 'react-native';
import * as Localization from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';

export type Locale = 'en' | 'he';

/** Locales known to be right-to-left. Hebrew is future scope. */
const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(['he']);

export const resources = {
  en: { translation: en },
} as const;

/** v1 forces English. When `he` lands, switch to device detection here. */
function resolveLocale(): Locale {
  const device = Localization.getLocales()[0]?.languageCode ?? 'en';
  if (device === 'he' && 'he' in resources) return 'he';
  return 'en';
}

export function isRTL(locale: Locale): boolean {
  return RTL_LOCALES.has(locale);
}

export async function initI18n(): Promise<typeof i18next> {
  const locale = resolveLocale();

  // RTL is a layout concern handled via logical start/end styles everywhere;
  // we only flip the manager so the platform mirrors navigation + text.
  const rtl = isRTL(locale);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  }

  await i18next.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: 'en',
    // skipOnVariables:false lets domain lines pass nested `$t(...)` params
    // (e.g. a capability name) that resolve through the same locale resource.
    interpolation: { escapeValue: false, skipOnVariables: false },
    returnNull: false,
    // ICU pluralization is handled by i18next's `_one` / `_other` suffix keys;
    // Hebrew's plural categories will be authored in he.json when added.
  });

  return i18next;
}

export { default as i18n } from 'i18next';
