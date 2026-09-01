/**
 * THE MONO LEGEND VOICE — and the one place it is allowed to hold a word.
 *
 * v7 sets every all-caps legend ("BUILT ON FACTS", "UP NEXT", "YOUR FIRST WEEK") in
 * IBM Plex Mono at .16–.22em. That is the design, one-to-one. But IBM Plex Mono has
 * no Hebrew glyphs, and `monoCarriesNoWords` exists because a Hebrew legend routed
 * through it falls back mid-line to whatever the OS can draw.
 *
 * Both hold at once: ask the STRING, not the locale. A legend the mono face can
 * actually draw gets the mono face; anything else gets the sans it was always
 * rendered in. English reads exactly as the handoff renders it; Hebrew never breaks.
 */

//

/** Latin letters, digits, and the punctuation IBM Plex Mono draws. Nothing else. */
const MONO_DRAWABLE = /^[ -~ ·—–’‘“”…]*$/;

/** Can the mono face draw every character in this string? */
export function monoCanDraw(text: string): boolean {
  return MONO_DRAWABLE.test(text);
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE FACE AND THE TRACKING ARE ONE ANSWER, NOT TWO (2026-08-26)
 *
 * `Legend` learned this on 2026-08-21 and learned it the hard way — the founder saw `מ ש ק ל` and
 * `ח ז ר ו ת` on the live stage, every legend in the app, in every Hebrew screen:
 *
 *   > *"Tracked all-caps is a convention of an alphabet that HAS caps and whose letters are built
 *   > to stand apart. Hebrew has no majuscule and its letters carry the word as a connected block —
 *   > pushing them apart does not read as 'instrument label', it reads as a rendering fault."*
 *
 * ⚠️ THE FIX WAS MADE INSIDE ONE COMPONENT AND THE RULE WAS LEFT AS PROSE, so it did not travel.
 * The FIRST SCREEN OF THE APP was still doing it on 2026-08-26: `Authentication`'s affirmation
 * swapped the face for a non-Latin string (`affirmSans`) and kept `.22em` of tracking on top of it,
 * which is precisely the half-fix `Legend`'s own note warns about. Read on a device it is
 * `כ ל  מ ש ק ל  מ ס ט  ש ה ר מ ת` — the product's one claim, spelled out letter by letter.
 *
 * So the rule is a FUNCTION now, in the design layer, and every slot that tracks a translated
 * string asks it. `noTrackedHebrew` (in `lint-rtl`) makes asking non-optional.
 *
 * ⚠️ NEGATIVE TRACKING IS NOT THIS BUG and is deliberately still allowed by hand: `-0.012em` on a
 * serif headline tightens Latin and Hebrew alike and breaks neither. What may never be applied
 * blind is the OPENING of a word.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface LegendVoice {
  /** True when the mono face can draw this string — i.e. when it may also be tracked. */
  latin: boolean;
  /** Points of letter-spacing: `size × em` for Latin, and ZERO for anything else. */
  letterSpacing: number;
}

/**
 * What face and what tracking this exact string should be set in.
 *
 * `em` is the design's tracking for the slot (`tracking.legend` is .16; a stamp runs .18–.22).
 * Pass the size the slot draws at — the answer is in points, ready for a style.
 */
export function legendVoice(text: string, size: number, em: number): LegendVoice {
  const latin = monoCanDraw(text);
  return { latin, letterSpacing: latin ? size * em : 0 };
}
