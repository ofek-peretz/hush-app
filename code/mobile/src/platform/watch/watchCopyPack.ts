/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WATCH SPEAKS HER LANGUAGE — and the phone is the one that knows it.
 *
 * The founder overturned his own ruling: *"about my decision on Hebrew — I'd like you to change it,
 * and do the same RTL as the phone."* The old ruling was that the wrist is English-only, and
 * `WatchCopy.swift` says so in its header: *"the watch target has no i18n runtime; v1 is English
 * only, so these are constants."*
 *
 * ── WHY THE STRINGS TRAVEL INSTEAD OF THE TRANSLATIONS ──────────────────────────────────────────
 * The obvious move is to put a second copy of every string into Swift, keyed on locale. It is
 * 111 constants — 222 strings, hand-maintained, in a language the app's copy lint cannot read, and
 * they would drift from `he.json` inside a week. Worse, Hebrew here is GENDERED: `tg` resolves
 * `_female` variants, and a Swift dictionary would either duplicate that machinery or address the
 * athlete as a man.
 *
 * So the phone resolves the copy and sends it. That is not a new idea in this product — it is
 * already how the milestone crosses ("rides the complete frame as finished English copy") and it is
 * the same law the loads follow: **the phone is the sole authority (S-48) and the watch renders
 * what it is handed.** This just stops making an exception of words.
 *
 * What the watch keeps is a full set of English fallbacks. A watch binary installs asynchronously
 * from the phone app, so a phone that has already updated will talk to an older wrist for a while;
 * a missing pack has to mean "use what you shipped with", never a blank screen.
 *
 * ── AND `rtl` IS A FACT, NOT A LANGUAGE CHECK ───────────────────────────────────────────────────
 * The flag rides with the pack rather than being inferred on the wrist from the strings. A watch
 * that guesses direction from the characters it received gets it wrong on the first mixed line —
 * and every line here is mixed, because the exercise names stay English by their own ruling.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import { I18nManager } from 'react-native';

import { currentLocale, tg } from '@/i18n';
import en from '@/i18n/locales/en.json';

/**
 * Every `watch.*` string, resolved.
 *
 * The keys are the JSON's own, flattened one level — a shape the Swift side can decode into a
 * dictionary without knowing any of them, so adding a string is a copy change and not a protocol
 * change.
 */
export interface WatchCopyPack {
  /** Bumped when the SHAPE changes, never when a string does. */
  v: 1;
  /** BCP-47, for anything the watch formats itself (a date, a number). */
  locale: string;
  /** Lay the interface right-to-left. A fact from the phone, never guessed from the characters. */
  rtl: boolean;
  /** `watch.*`, resolved for her language and her gender. */
  s: Record<string, string>;
  /**
   * The body map's muscles, in her words.
   *
   * Keyed by the map's OWN name (`Chest`), which is what the wrist sends back when she reports a
   * pain — so her report needs no translation on the way in. The phone already holds these under
   * `muscle.*`; the wrist showing them in English while everything around it is Hebrew is exactly
   * the split the founder asked to close.
   */
  m: Record<string, string>;
}

/**
 * Every key under `watch.*`, taken from the copy file itself rather than a list kept beside it.
 *
 * A hand-written list is the one thing here that can rot: a string added to `en.json` and not to
 * the list simply never reaches the watch, and the wrist falls back to English on that one line
 * while every line around it is Hebrew. Nobody would notice for months.
 *
 * `_female` variants are not keys of their own — `tg` resolves them behind their base key.
 */
const KEYS = Object.keys((en as { watch: Record<string, string> }).watch).filter(
  (k) => !k.endsWith('_female'),
);

/**
 * The keys that take a parameter — read off the English, not declared.
 *
 * They are sent as TEMPLATES with their placeholders intact — `"{{n}} lifts"` — because the number
 * is not known when the pack is built, and rebuilding the pack per set would send a hundred strings
 * to change one. The watch does the substitution; that is the one piece of formatting it owns, and
 * it is a search-and-replace rather than an i18n runtime.
 */
export const WATCH_TEMPLATE_KEYS = KEYS.filter((k) =>
  /\{\{\w+\}\}/.test((en as { watch: Record<string, string> }).watch[k]),
);

/** The body-map muscles the wrist can name. Mirrors `domain/painReport.WRIST_PAIN_MUSCLES`. */
const MUSCLES = [
  'Chest', 'Shoulders', 'Triceps', 'Back', 'Biceps',
  'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core',
] as const;

/**
 * Build the pack for whoever is using the phone right now.
 *
 * `tg` rather than `t`: Hebrew conjugates the second person, so "save" said to a woman is a
 * different word. The gendered resolution is the phone's and it has to happen HERE — a wrist handed
 * a base form would address every woman as a man, in every string, on the surface she looks at most
 * during a workout.
 */
export function watchCopyPack(): WatchCopyPack {
  const s: Record<string, string> = {};
  for (const key of KEYS) {
    // Templates keep their placeholders: `tg` would otherwise print "{{n}}" as a missing value.
    const raw = tg(`watch.${key}`, WATCH_TEMPLATE_KEYS.includes(key) ? { skipInterpolation: true } : undefined);
    if (typeof raw === 'string' && raw.length > 0) s[key] = raw;
  }
  const m: Record<string, string> = {};
  for (const muscle of MUSCLES) m[muscle] = tg(`muscle.${muscle}`);
  return {
    v: 1,
    locale: currentLocale(),
    // The phone's own layout direction, which is the flag every screen on this side already obeys.
    rtl: I18nManager.isRTL,
    s,
    m,
  };
}
