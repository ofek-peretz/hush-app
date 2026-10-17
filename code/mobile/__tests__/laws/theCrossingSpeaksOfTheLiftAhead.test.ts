/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE CROSSING SPEAKS OF THE LIFT AHEAD — founder bug, 2026-08-30.
 *
 *   > *"באג - בסט המעבר זה מציג את הוידאו של התרגיל הקודם."*
 *
 * ── WHY THIS IS A LAW AND NOT A FIX ─────────────────────────────────────────────────────────────
 * The transition rest is the one beat in the app where **the cursor is behind the screen**. The
 * store's own contract says so in one line — *the cursor only moves on `REST_ELAPSED`* — so for the
 * whole of a crossing, `currentExerciseId` is the lift that just ENDED while every word on the
 * screen is about the next one: the name, the load, the plates a side, the swap.
 *
 * That makes `current` a trap on exactly one screen, and the trap has been walked into once per
 * control: the SWAP disc was written from `current` and corrected in 2026-08-12; the FORM disc was
 * written from `current` and shipped that way until the founder caught it in the gym, playing the
 * dumbbell he had just put down over a card describing the machine he was walking to.
 *
 * Two controls, one mistake, two years apart is not a bug — it is the shape of the screen. So the
 * rule is held here rather than remembered: **on a crossing, every control names the lift ahead.**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import * as fs from 'fs';
import * as path from 'path';
import { filmSubject } from '@/state/stores/sessionStore';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

const LIFT = 'bb_bench_press';
const NEXT = 'bb_back_squat';
const RUN = 'run_5k'; // not in the catalogue: a movement, with no film and no cues

describe('the film plays the lift the beat is about', () => {
  it('⛔ ON A CROSSING IT IS THE NEXT LIFT — the founder’s bug, held closed', () => {
    expect(filmSubject('REST_TRANSITION', LIFT, NEXT)).toBe(NEXT);
  });

  it('on a live set, and on a rest BETWEEN sets, it is the lift she is standing at', () => {
    // Between sets `current` is right and always was: she has not moved, and `next` is the same lift.
    expect(filmSubject('SET_PRESENTED', LIFT, null)).toBe(LIFT);
    expect(filmSubject('REST_INTER', LIFT, LIFT)).toBe(LIFT);
  });

  it('⛔ AND THE GATE FAILED BOTH WAYS, which is the half that is easy to miss', () => {
    // Crossing INTO a run: the old gate asked about `current`, found a lift, and offered a film of
    // the lift she had finished. There is no film of five kilometres — so there is no door.
    expect(filmSubject('REST_TRANSITION', LIFT, RUN)).toBeNull();
    // Crossing OUT of a run into a lift: the old gate asked about `current`, found a movement, and
    // hid the door at the exact moment a film is most wanted — a station she has not reached yet.
    expect(filmSubject('REST_TRANSITION', RUN, NEXT)).toBe(NEXT);
    // And on the run itself there is nothing to play, whichever beat she is on.
    expect(filmSubject('SET_PRESENTED', RUN, null)).toBeNull();
  });

  it('a missing id is a missing door, never a crash and never a blank card', () => {
    expect(filmSubject('REST_TRANSITION', LIFT, null)).toBeNull();
    expect(filmSubject('SET_PRESENTED', null, NEXT)).toBeNull();
  });
});

describe('and the screen asks the derivation rather than re-deriving it', () => {
  const src = read('src/screens/session/SessionFlow.tsx');

  it('the demo overlay is handed ONE subject, in all four of its props', () => {
    const at = src.lastIndexOf('<ExerciseDemo');
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(at, src.indexOf('/>', at));
    /* ⚠️ ALL FOUR, because a title from one lift over a film of another is the same bug wearing a
       different face — and the title/cues were the half that could have been left behind. */
    expect(block).toContain('title={exerciseDisplayName(demoExerciseId)}');
    expect(block).toContain('cues={exerciseCues(demoExerciseId)}');
    expect(block).toContain('exerciseId={demoExerciseId}');
    expect(block).not.toContain('currentExerciseId');
  });

  it('⛔ NO CONTROL ON THE STAGE BAR IS WRITTEN FROM `currentExerciseId`', () => {
    /*
     * The bar draws pause, map, swap and form across every beat INCLUDING the crossing, so a raw
     * `session.currentExerciseId` anywhere in its props is the exact defect this law exists for.
     * The subjects it may name are the derivations that already know about the crossing.
     */
    /* ⚠️ THE ELEMENT, NOT THE PROSE. `<StageBar` also appears inside a doc comment further up this
       file, and anchoring on that one instead swept in the derivations that sit between the comment
       and the JSX — which mention `currentExerciseId` legitimately, because deriving FROM it is
       exactly their job. The element is the last of the two; the prose only ever precedes it. */
    const at = src.lastIndexOf('<StageBar');
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(at, src.indexOf('/>', at));
    expect(block).not.toContain('currentExerciseId');
  });

  it('the swap on a crossing still proposes the NEXT lift — the 2026-08-12 half stays fixed', () => {
    expect(src).toContain("startQuickSwap('next')");
    expect(src).toMatch(/isTransition && nextIsALift/);
  });
});
