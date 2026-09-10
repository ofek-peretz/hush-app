/**
 * The size a lift's name is drawn at on the stage — decided from the name, never measured.
 *
 * ⛔ THE NAME THAT SHRANK TO NOTHING (founder 2026-09-08, mid-workout: "מראה את שם התרגיל בצורה
 * ממש ממש קטנה, גם במעבר למקלדת וגם בתצוגה הרגילה").
 *
 * The stage used `adjustsFontSizeToFit` with a 0.72 floor. On iOS that prop fits the text to the
 * container's HEIGHT as well as its width, and the identity block's height is not a constant: it is
 * squeezed while the keypad slides in and while `Arrive` is still animating the block on. In those
 * frames the fit ran far below the declared floor — RN honours `minimumFontScale` for the width
 * search, not for the height one — and a name drawn at 12 points is a name she cannot read from
 * the bar. "Sometimes" was the animation; "when the keypad opens" was the squeeze.
 *
 * So the size is arithmetic on the name itself: the same input always draws the same size, on
 * every frame, and nothing about the layout around it can move it. The thresholds come from the
 * stage's own width (330 points) and the semibold face's Hebrew run (~20 points a character at 36):
 * one line holds ~16 characters at 36, two lines hold ~30 at 30, and anything longer takes 26,
 * which is still above the type floor and the old fit's nominal minimum.
 */

export interface NameSize {
  fontSize: number;
  lineHeight: number;
}

/** Character count that matters for width: a joined pair (superset) is measured by its longer half. */
function longestLine(name: string): number {
  return name.split('\n').reduce((m, line) => Math.max(m, line.trim().length), 0);
}

export function exerciseNameSize(name: string): NameSize {
  const n = longestLine(name);
  if (n <= 16) return { fontSize: 36, lineHeight: 42 };
  if (n <= 30) return { fontSize: 30, lineHeight: 36 };
  return { fontSize: 26, lineHeight: 32 };
}
