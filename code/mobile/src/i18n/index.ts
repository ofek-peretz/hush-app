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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import he from './locales/he.json';
import { getGender } from './gender';

export type Locale = 'en' | 'he';

/** Locales known to be right-to-left. */
const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(['he']);

/** Persisted language override (Profile → Language). Absent → follow the device. */
const LOCALE_KEY = 'hush.locale';

export const resources = {
  en: { translation: en },
  he: { translation: he },
} as const;

async function getStoredLocale(): Promise<Locale | null> {
  try {
    const v = await AsyncStorage.getItem(LOCALE_KEY);
    return v === 'he' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

/** Stored override wins; otherwise follow the device language (he → Hebrew). */
async function resolveLocale(): Promise<Locale> {
  const stored = await getStoredLocale();
  if (stored) return stored;
  const device = Localization.getLocales()[0]?.languageCode ?? 'en';
  return device === 'he' ? 'he' : 'en';
}

export function isRTL(locale: Locale): boolean {
  return RTL_LOCALES.has(locale);
}

export function currentLocale(): Locale {
  return i18next.language === 'he' ? 'he' : 'en';
}

/**
 * Switch language at runtime (Profile → Language). Text updates immediately; the
 * RTL/LTR layout direction is flipped on the manager but iOS applies a full
 * mirror only after the app is reopened (the caller surfaces that note).
 */
export async function setLocale(locale: Locale): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* best-effort persistence */
  }
  await i18next.changeLanguage(locale);
  const rtl = isRTL(locale);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  }
}

export async function initI18n(): Promise<typeof i18next> {
  const locale = await resolveLocale();

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

/**
 * Gender-aware `t` for callers OUTSIDE React (notifications, rest haptics, the Live Activity).
 *
 * `useCopy` injects the athlete's gender as i18next's `context` on every lookup, so screens are
 * conjugated correctly without doing anything. The platform modules are not screens: they call
 * i18next directly, from a background task or a native bridge, and they were therefore the ONE
 * place in the app still speaking to every athlete as a man — a woman's rest-over notification
 * said "התכונן", and her weekly note said "הקש". Same store, same rule, one function.
 *
 * Use this — never bare `i18next.t` — for anything an athlete READS.
 */
export function tg(key: string, params?: Record<string, unknown>): string {
  return i18next.t(key, { context: getGender(), ...(params ?? {}) }) as unknown as string;
}

export { default as i18n } from 'i18next';
