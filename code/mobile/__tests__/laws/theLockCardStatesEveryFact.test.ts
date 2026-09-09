/**
 * THE LOCK CARD STATES EVERY FACT IT MEASURES — founder C.20, and nothing here compiles Swift.
 *
 * ── The bug this exists to prevent ────────────────────────────────────────────────────────────
 * "Our lock-screen activity is small next to Spotify's. Make it the same size, lay the data out
 * better, and make calories legible."
 *
 * The last clause was the big one, and it was not about type size. The card carried ONE 13 pt
 * muted line that chose between two things:
 *
 *     if let km = state.lastSplitKm, let pace = state.lastSplitPaceSec { …the split… }
 *     var line = "\(fmtPace(state.paceSec)) /km · \(state.calories) kcal"      // ← the other branch
 *
 * `lastSplitKm` comes off `splits[splits.length - 1]`, and a split list never shrinks. So from the
 * moment the athlete's FIRST kilometre closed, that line took the split branch and never came
 * back: calories and heart rate were absent from the lock screen for every kilometre after the
 * first, on every run anyone has ever taken. The founder read it as illegible. It was missing.
 *
 * ── Scope, honestly ───────────────────────────────────────────────────────────────────────────
 * This is a source reader, not a renderer. It cannot see what the card LOOKS like — no Swift
 * compiles on this machine, and the widget's first honest picture is a paid EAS build on a device.
 * What it can close completely is the class of defect above: a measured fact that some other piece
 * of state can switch off. So it asserts that each fact the card exists to state is drawn
 * UNCONDITIONALLY, and that the figures carrying them are not set at caption size.
 */
// @ts-nocheck

// 

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WIDGET = join(__dirname, '../../targets/widget/HushLiveActivityWidget.swift');
const source = readFileSync(WIDGET, 'utf8');

/**
 * The body of a `struct <name>: View { … }`, by brace matching. Reading the whole file would let a
 * fact drawn in the Dynamic Island stand in for one missing from the card — which is exactly the
 * confusion that let this ship: the ISLAND states calories, and always did.
 */
function structBody(name: string): string {
  const start = source.indexOf(`struct ${name}: View {`);
  if (start < 0) throw new Error(`${name} is gone from the widget — if it was renamed, rename it here too`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
}

const card = structBody('CardioLockView');

describe('the cardio lock card', () => {
  /**
   * The measured facts. DISTANCE and the clock are the glance; CALORIES and heart rate are what
   * the run earned. A card that drops one because a kilometre happened to close is not a smaller
   * card, it is a wrong one.
   *
   * ⛔ RE-LITIGATED 2026-08-23: `state.paceSec` was pinned INTO this card, and the founder's
   * pace ruling (*"אני לא רוצה שיופיע בזמן אמת מה הקצב לקילומטר"*) reverses that half: the
   * per-kilometre figure exists only once the kilometre does. The split tag — a FINISHED
   * kilometre's time, in its own slot — is the card's only per-km figure now, and the live pace
   * may not return to any cardio widget surface.
   */
  it('states the distance and the calories — and NO live pace', () => {
    expect(card).toContain('state.distanceKm');
    expect(card).not.toContain('state.paceSec');
    expect(card).toContain('state.calories');
  });

  it('⛔ …and no cardio widget surface draws the live pace at all (founder 2026-08-23)', () => {
    // The whole widget file — Dynamic Island included. The ContentState FIELD stays (Codable
    // parity with the app-side copy); what is banned is reading it into a view.
    const draws = source.split('\n').filter((l) => l.includes('.paceSec') && !l.trim().startsWith('//') && !l.includes('var paceSec'));
    expect(draws).toEqual([]);
  });

  /**
   * THE LAW. `state.calories` may not sit inside a conditional — that is precisely what happened.
   * Heart rate is the one legitimate exception and it is checked separately below: `hr == 0` means
   * NO SOURCE, so hiding it is honesty, not loss (the same rule the in-app row follows, C.19).
   */
  it('and no branch can switch the calories off', () => {
    const lines = card.split('\n');
    const at = lines.findIndex((l) => l.includes('state.calories'));
    expect(at).toBeGreaterThan(-1);

    // Walk back to the enclosing block and prove nothing on the way opened a conditional.
    let depth = 0;
    for (let i = at; i >= 0; i--) {
      const line = lines[i];
      depth += (line.match(/\}/g) ?? []).length - (line.match(/\{/g) ?? []).length;
      if (depth < 0) break; // we have stepped out into the enclosing block — clear
      if (/^\s*(if|guard|else|switch)\b/.test(line) && i !== at) {
        throw new Error(`the calories are drawn inside a conditional: "${line.trim()}"`);
      }
    }
  });

  it('the split is stated in its OWN slot, never in place of another fact', () => {
    // `lastSplitKm` may gate the split tag — and only the split tag. If a measured fact appears
    // anywhere near it, it is choosing between them again. The window is deliberately wide: at ±4
    // this assertion passed against the original bug by a single line, which is not a test.
    const lines = card.split('\n');
    const splitLines = lines.map((l, i) => [l, i] as const).filter(([l]) => l.includes('lastSplitKm'));
    expect(splitLines.length).toBeGreaterThan(0);
    for (const [, i] of splitLines) {
      const near = lines.slice(Math.max(0, i - 8), i + 9).join('\n');
      expect(near).not.toContain('state.calories');
      expect(near).not.toContain('state.paceSec');
    }
  });

  /**
   * "Make calories legible." The figure carries the number; the label beside it is a caption. The
   * old card set the whole thing — number and all — at 13 inside a sentence.
   */
  it('the measured figures are set as figures, not as caption text', () => {
    const size = /CARDIO_LOCK_STAT_FIGURE: CGFloat = ([\d.]+)/.exec(source);
    expect(size).not.toBeNull();
    expect(Number(size![1])).toBeGreaterThanOrEqual(18);
    // …and the stat cell is the thing that reads it, so the constant cannot drift out of use.
    expect(source).toContain('size: CARDIO_LOCK_STAT_FIGURE');
  });

  /**
   * PAUSED IS A LEGEND, NOT A DIFFERENT CARD. It used to swap in a big word and a sentence, which
   * threw away the athlete's own numbers in order to tell her she had stopped. She can see that
   * she stopped.
   */
  it('keeps one composition — a pause does not delete what she has run', () => {
    const at = card.indexOf('state.paused');
    expect(at).toBeGreaterThan(-1);
    // The only thing `paused` decides on this card is the legend's wording.
    expect(card.slice(at, at + 160)).toMatch(/paused["']?\s*:|paused \?/);
    // The clock's own muting lives in CardioElapsedText, shared with the island — not re-decided here.
    expect(card).not.toContain('the clock is stopped');
  });

  /** hr == 0 is "no source" — the one fact allowed to be conditional, for the C.19 reason. */
  it('drops heart rate only when there is no source for it', () => {
    expect(card).toMatch(/if state\.hr > 0/);
  });
});

describe('⛔ the lock screen is a control — and only for the three verbs the stage has (founder, 2026-09-08)', () => {
  /**
   * §8.5 ratified this activity as READ-ONLY and the buttons were the founder's own open decision
   * ("do not build and do not re-raise"). He raised it himself on 2026-09-08: *"להזין סט כשהמסך
   * סגור וגם מנוחה של קיצור או הוספת 15 שניות."* The action row the canonical 6.2 card always
   * had is drawn now — and the law turns with the ruling: the STRENGTH card may carry exactly the
   * three verbs (`HushLockIntents.swift`) plus, since the same evening (*"להזין ישירות מהלייב
   * אקטיביטי את המשקל והחזרות"*), the one stepper key that turns a figure — nothing else may be
   * tappable, and the CARDIO card stays read-only (a run is recorded, never controlled from a card).
   */
  it('the strength card carries the three verbs and the stepper key, and no other tap target', () => {
    const strength = source.slice(0, source.indexOf('struct HushCardioLiveActivity'));
    for (const intent of ['HushCompleteSetIntent', 'HushAddRestIntent', 'HushEndRestIntent']) {
      expect(strength).toContain(`Button(intent: ${intent}())`);
    }
    // The fourth button is the stepper's key — one struct, drawn four times (− + on load and reps).
    expect(strength).toContain('Button(intent: HushAdjustFigureIntent(field: field, delta: delta))');
    // The fifth is the voice's "מוכן" (spec §3.2), drawn only while the loading dialogue is open.
    expect(strength).toContain('Button(intent: HushSetReadyIntent())');
    expect(strength.indexOf('if state.awaitingReady')).toBeLessThan(strength.indexOf('HushSetReadyIntent()'));
    // Five buttons in CODE (the header comment names the API once).
    const code = strength.split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith("//")).join(String.fromCharCode(10));
    expect((code.match(/Button\(intent:/g) ?? []).length).toBe(5);
    expect((code.match(/Button\(/g) ?? []).length).toBe(5);
    expect(strength).not.toContain('onTapGesture');
  });
  it('the cardio card is untouched — no button, intent or tap target', () => {
    const cardio = source.slice(source.indexOf('struct HushCardioLiveActivity'));
    for (const forbidden of ['Button(', 'AppIntent', 'LiveActivityIntent', 'onTapGesture']) {
      expect(cardio).not.toContain(forbidden);
    }
  });
});
