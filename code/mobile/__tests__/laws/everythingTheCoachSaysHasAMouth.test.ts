/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY SENTENCE THE COACH WRITES REACHES A SCREEN THAT SAYS IT.
 *
 * ⛔ FOUND 2026-08-26, auditing the coach's wire against the surfaces, at the founder's instruction
 * to look for *"דברים שיש במנוע שלא מוצגים במסך"*. An item's `say` — the one line the coach is told
 * to spend on HOW HARD, HOW FAST or WHERE TO STOP — reached the device on every kind of item and
 * was drawn on exactly one of the three screens that execute them:
 *
 *   a HOLD or a DISTANCE in a session   `ItemStage` drew it                                   ✔
 *   a prescribed RUN on the GPS stage   `say` declared in the view's props, rendered by nothing ✘
 *   an ordinary LIFT on the set stage   `currentItem` discarded for `kind === 'reps'`           ✘
 *
 * ── ⚠️ IT IS ONE EVENT, NOT TWO BUGS, AND THAT IS WHY IT IS A LAW ───────────────────────────────
 * Both sentences used to live behind the KEY POINTS control. The control was deleted with
 * `EmphasesSheet` on 2026-08-12 — correctly: two readers, both gone — and **nothing put the
 * sentences back.** The store's own note recorded the casualty on the day (*"what no longer has a
 * surface is the `say` on an ordinary LIFT"*) as prose rather than as work, and the run's view kept
 * the prop, which is what made it read as wired for a fortnight.
 *
 * ⚠️ AND THE PROMPT WAS STILL PROMISING IT. `coachPrompt` tells the coach where each of its notes
 * surfaces. A model instructed to write a sentence the app will not draw spends its one line on
 * nothing — and the athlete is the only one who can tell.
 *
 * So the rule is mechanical: the three surfaces that can execute a coach's item all mount the ONE
 * component that speaks for it. A fourth would join this list on the day it is built.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..', '..', 'src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');
/** Comments blanked — a law must survive being explained at its own call site. */
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/** The three screens an item can be executed from, and the component that must speak for each. */
const STAGES = [
  { file: 'screens/session/ItemStage.tsx', what: 'a hold / a distance, inside a session' },
  { file: 'screens/session/SessionFlow.tsx', what: 'an ordinary lift, on the set stage' },
  { file: 'screens/cardio/Cardio.tsx', what: 'a prescribed run, on the live GPS stage' },
];

describe('the coach speaks on every stage that runs what it wrote', () => {
  it('⛔ all three execution surfaces mount SayLine', () => {
    const missing = STAGES.filter((s) => !code(read(s.file)).includes('<SayLine')).map((s) => `${s.file} — ${s.what}`);
    expect(missing).toEqual([]);
  });

  it('⛔ …and each hands it a real `say`, not a literal', () => {
    /*
     * `<SayLine say={undefined} />` would satisfy the check above and draw nothing — the same shape
     * as the defect this law exists for, one layer in. Each call site is pinned to the expression it
     * must read, because each reads the item from a different place.
     */
    expect(code(read('screens/session/SessionFlow.tsx'))).toContain('say={session.currentItem?.say}');
    expect(code(read('screens/cardio/Cardio.tsx'))).toContain('say={props.say}');
    expect(code(read('screens/session/ItemStage.tsx'))).toContain('say={item.say}');
  });

  it('⚠️ the run stage RECEIVES it too — the prop was never the broken half', () => {
    /* The route carried `say` the whole time; only the render was missing. If the route ever stops
       carrying it, the screen above goes quiet again with nothing failing. */
    expect(code(read('screens/session/SessionFlow.tsx'))).toContain('onRun(item.metres, item.say)');
    expect(code(read('screens/cardio/Cardio.tsx'))).toContain('say: target.say');
  });

  it('⛔ the set stage does NOT go on discarding a reps item wholesale', () => {
    /*
     * The original defect in one line: `itemShape` keeps the item only when it is NOT a lift, which
     * is right for choosing a STAGE and was silently also the only reader of the item. The stage
     * still branches on shape — it must — so what is pinned is that something else reads the item
     * for its sentence.
     */
    const flow = code(read('screens/session/SessionFlow.tsx'));
    expect(flow).toContain("session.currentItem.kind !== 'reps'"); // the stage choice, unchanged
    expect(flow).toContain('session.currentItem?.say'); // …and the sentence, no longer dropped
  });

  it('⛔ SayLine is the only mouth — no stage rolls its own instruction line', () => {
    /*
     * Two of these screens have drawn this sentence in their own style before. One component means
     * one voice, one type ramp, and one place to change it — and it is what makes the check above
     * mean anything: a hand-rolled `<Text>{item.say}</Text>` would pass a grep for the string and
     * reintroduce exactly the divergence `SayLine` was extracted to end.
     */
    for (const s of STAGES) {
      const body = code(read(s.file));
      expect({ file: s.file, rolled: /<Text[^>]*>\s*\{\s*(item|props|target)\.say\s*\}/.test(body) })
        .toEqual({ file: s.file, rolled: false });
    }
  });
});
