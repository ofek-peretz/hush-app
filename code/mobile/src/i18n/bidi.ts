/**
 * Bidirectional-text helpers for the RTL (Hebrew) build.
 *
 * The product rule (2026-06-30): exercise names — and any other canonical English
 * run — stay in English even when the app is Hebrew. An English (LTR) run sitting
 * inside a Hebrew (RTL) sentence is a *bidirectional* string; without isolation the
 * Unicode BiDi algorithm reorders adjacent punctuation/numbers (e.g. a trailing "."
 * jumps to the wrong side). `bidi()` wraps the run in a First-Strong Isolate so it
 * renders as its own self-contained run and never reorders the Hebrew around it.
 *
 * Use `bidi(name)` ONLY when interpolating a name into a translated sentence
 * (`t('…', { exercise: bidi(name) })`) or concatenating it inline with other copy.
 * A name rendered ALONE in its own <Text> needs no wrapping. Never feed a bidi()
 * string to telemetry, comparisons, or anything non-visual — it carries invisible
 * control characters.
 */

// 

import { I18nManager, type TextStyle } from 'react-native';

const FSI = '⁨'; // First Strong Isolate — open
const PDI = '⁩'; // Pop Directional Isolate — close

/** Isolate a run so the surrounding BiDi context cannot reorder it (or it the context). */
export function bidi(s: string): string {
  return `${FSI}${s}${PDI}`;
}

/** Longer than this and a name has to be allowed to break, or it overruns the column. */
const UNBREAKABLE_NAME = 22;

/**
 * ⛔ A PERSON'S NAME IS ONE THING (2026-09-18, measured on `MyCoach`).
 *
 * `bidi()` stops the BiDi algorithm reordering a Latin name inside a Hebrew sentence. It does
 * nothing at all about the LINE BREAKER, and the space inside "Dani Azoulay" is a break
 * opportunity like any other — so the leave note set his name as *"הגישה של Dani"* / *"Azoulay
 * נסגרת מיד"*, a man's name cut in half across two lines, on the screen that asks her to decide
 * about him. Every surface of the track interpolates this name, so the fix belongs beside `bidi`
 * and not in one screen.
 *
 * The spaces inside a SHORT name become no-break spaces; the isolate is unchanged. A long one
 * (the server allows 40 characters) keeps its ordinary spaces, because a name that cannot break
 * at all is a name that overruns the measure — which is a worse fault than a break.
 */
export function bidiName(s: string): string {
  const name = s.trim();
  return bidi(name.length <= UNBREAKABLE_NAME ? name.replace(/ /g, ' ') : name);
}

/**
 * Logical text alignment. THIS FILE USED TO SAY THE OPPOSITE, AND THAT WAS THE BUG
 * (founder device review, 2026-07-12: "every screen is stuck on the left in Hebrew").
 *
 * The old doctrine — "for START alignment simply omit `textAlign`, RN mirrors it" — is
 * false on iOS. An omitted alignment is `NSTextAlignmentNatural`, which RN does NOT flip;
 * it resolves LTR and freezes every heading and paragraph to the physical left, even
 * under `I18nManager.isRTL`. What RN DOES flip is an EXPLICIT physical value: in an RTL
 * layout it swaps 'left' <-> 'right' before handing the alignment to the platform.
 *
 * So in React Native the explicit physical value IS the logical one:
 *     textAlign: 'left'   -> renders at the START of the line (right, in Hebrew)
 *     textAlign: 'right'  -> renders at the END of the line   (left, in Hebrew)
 * and an I18nManager-conditional value (what these constants used to be) DOUBLE-flips
 * and lands on the wrong edge.
 *
 * Every text style in the app therefore declares an alignment — `scripts/lint-rtl.cjs`
 * fails the build on a `fontFamily` without one, because "no alignment" is not a neutral
 * default: it is a silent LTR lock.
 */
export const textStart: TextStyle['textAlign'] = 'left';
export const textEnd: TextStyle['textAlign'] = 'right';

/**
 * True while the app is laid out right-to-left (Hebrew).
 *
 * ⛔ THIS WAS A `const`, AND THE LATCH WAS THE BUG (founder, device QA 2026-08-23: *"הכתב בעברית,
 * הכל כתוב בצד שמאל"*). The language switch flips `I18nManager` and remounts the tree — but a
 * module-load `const` had already been read by every importer, so every layout decision computed
 * from it stayed LTR until the process was killed by hand. In dev this never showed, because dev
 * reloads re-evaluate modules; only a RELEASE build kept the stale latch, which is exactly where
 * nobody was looking.
 *
 * A `let` with a re-latch keeps every call site byte-identical (babel's module interop reads the
 * namespace member at each use, so importers see the new value live). `reloadApp` re-latches at
 * the same instant it remounts — one seam, both halves.
 */
export let rtl = I18nManager.isRTL;

/*
 * ⛔ RE-READING `I18nManager.isRTL` RE-READ NOTHING (found 2026-10-01 on the founder's build 75).
 *
 * In RN 0.81 `I18nManager.isRTL` is a CONSTANT — `NativeI18nManager.getConstants()` read once when
 * the module loads — and `forceRTL` writes the NEXT launch's direction without touching it. So the
 * re-latch below used to copy the launch value over itself: after `initI18n` decided Hebrew on a
 * fresh install, `rtl` stayed false, Root's `direction` stayed 'ltr', and the whole intake ran on
 * the left edge. The LANGUAGE decides the direction; i18n tells this module what it decided, and
 * the latch reads that.
 */
let decided: boolean | null = null;

/** The direction the app's language decided — set by `initI18n` and `setLocale`, nothing else. */
export function decideDirection(next: boolean): void {
  decided = next;
}

/** Re-read the decided direction — called by `initI18n` and `reloadApp`. */
export function relatchDirection(): void {
  rtl = decided ?? I18nManager.isRTL;
}

/** True when this process was LAUNCHED facing the other way from the direction the app decided. */
export function launchedFacingWrongWay(): boolean {
  return decided != null && decided !== I18nManager.isRTL;
}

/**
 * ⛔ AN LTR ISLAND, THE ONE WAY BOTH PLATFORMS AGREE ON (2026-09-29, after `FigureCells`'s lesson).
 * `direction: 'ltr'` holds on iOS and is IGNORED by react-native-web, so a brand lockup or a
 * "94 lb" row came out mirrored in the browser while the phone was right — two products from one
 * source. `row-reverse` under RTL flows left-to-right on both. Read at render: `rtl` re-latches.
 */
export function ltrIsland(): { flexDirection: 'row' | 'row-reverse' } {
  return { flexDirection: rtl ? 'row-reverse' : 'row' };
}
