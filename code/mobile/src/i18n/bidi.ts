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

/** Re-read the direction after `I18nManager.forceRTL` — called by `reloadApp`, nothing else. */
export function relatchDirection(): void {
  rtl = I18nManager.isRTL;
}
