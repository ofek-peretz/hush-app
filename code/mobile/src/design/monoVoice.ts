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
// @ts-nocheck

// 


/** Latin letters, digits, and the punctuation IBM Plex Mono draws. Nothing else. */
const MONO_DRAWABLE = /^[ -~ ·—–’‘“”…]*$/;

/** Can the mono face draw every character in this string? */
export function monoCanDraw(text: string): boolean {
  return MONO_DRAWABLE.test(text);
}
