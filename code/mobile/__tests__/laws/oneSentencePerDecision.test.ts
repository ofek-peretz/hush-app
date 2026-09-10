/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE LEDGER SAYS A DECISION ONCE, HOWEVER MANY LIFTS TOOK IT.
 *
 * ⛔ FOUNDER, 2026-08-22, from a device screenshot of his first workout's finish screen. Five lifts,
 * five rows, and the same sentence under every one of them:
 *
 *   > *"It met its target on every set, so I added 2.5 kg."* ×5
 *
 * The ledger is the closest this product comes to saying out loud what it is — the one screen that
 * answers *what did the engine decide because of what I just did* — and it was set like a mail
 * merge. Five identical sentences do not read as five decisions; they read as one template.
 *
 * ── ⚠️ THE VOCABULARY WAS NEVER SHORT ───────────────────────────────────────────────────────────
 * `explain` carries eight distinct decisions. What happened is arithmetic: a FIRST session is the
 * one where every lift meets its target, so the repetition is worst exactly where an athlete is
 * deciding what this app is.
 *
 * ── WHAT THE GROUPING MAY AND MAY NOT DO ────────────────────────────────────────────────────────
 * It folds two rows together **only when they would have printed the same words** — same copy key,
 * same interpolated values. A lift raised 5 kg beside four raised 2.5 keeps its own sentence,
 * because it was never the same sentence. That is the whole honesty of the mechanism and it is what
 * these tests are for.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { groupDecisions, type EarnedLine } from '@/screens/session/WellDone';

const line = (key: string, reason: EarnedLine['reason']): EarnedLine => ({
  key,
  name: key,
  from: '10',
  to: '12.5',
  held: false,
  reason,
});

const met = (delta: number) => ({ key: 'explain.progressLoad.textMet', params: { delta } });

describe('one sentence per decision', () => {
  it('⛔ five lifts that took the same decision are one group', () => {
    const g = groupDecisions([
      line('bench', met(2.5)),
      line('deadlift', met(2.5)),
      line('pushdown', met(2.5)),
      line('pullthrough', met(2.5)),
      line('calf', met(2.5)),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].lines.map((l) => l.key)).toEqual(['bench', 'deadlift', 'pushdown', 'pullthrough', 'calf']);
  });

  it('⛔ …and a lift whose sentence differs is NEVER folded in with them', () => {
    /*
     * The half that makes the grouping honest rather than merely tidy. `{delta: 5}` renders "so I
     * added 5 kg" — a different sentence — so folding it under "added 2.5 kg" would be the screen
     * stating a decision the engine did not make, on the screen that exists to state what it did.
     */
    const g = groupDecisions([line('bench', met(2.5)), line('squat', met(5)), line('row', met(2.5))]);
    expect(g.map((x) => x.lines.map((l) => l.key))).toEqual([['bench', 'row'], ['squat']]);
  });

  it('⛔ two different KINDS of decision never meet', () => {
    const g = groupDecisions([
      line('bench', met(2.5)),
      line('curl', { key: 'explain.swap.text', params: { ex: 'Hammer Curl' } }),
      line('row', met(2.5)),
    ]);
    expect(g).toHaveLength(2);
    expect(g[1].reason).toEqual({ key: 'explain.swap.text', params: { ex: 'Hammer Curl' } });
  });

  it('⚠️ a group takes the place of its FIRST lift, and the lifts keep the session’s order', () => {
    /*
     * She read these rows in this order twenty seconds ago, on the stage. Re-sorting the record of a
     * workout by anything other than the workout makes her hunt for the lift she is looking for —
     * the same reasoning that stopped `WeekSheet` re-sorting her week by done-ness.
     */
    const g = groupDecisions([
      line('a', met(2.5)),
      line('b', { key: 'explain.volumeUp.text', params: { muscle: 'Back' } }),
      line('c', met(2.5)),
    ]);
    expect(g.map((x) => x.lines[0].key)).toEqual(['a', 'b']);
    expect(g[0].lines.map((l) => l.key)).toEqual(['a', 'c']);
  });

  it('⚠️ a single decision is a group of one — the layout that shipped is untouched', () => {
    const g = groupDecisions([line('bench', met(2.5))]);
    expect(g).toHaveLength(1);
    expect(g[0].lines).toHaveLength(1);
  });

  it('⚠️ an empty ledger stays empty — "every lift held" is a verdict, not a group', () => {
    expect(groupDecisions([])).toEqual([]);
  });

  it('⛔ a coach’s own words group on the words, not on a key', () => {
    // `EarnedReason` has two shapes: a copy key with params, and a raw sentence. Two rows carrying
    // the identical raw sentence would print identically, so they are one thing said once.
    const g = groupDecisions([
      line('a', { text: 'I raised it because you cleared every set.' }),
      line('b', { text: 'I raised it because you cleared every set.' }),
      line('c', { text: 'I held it.' }),
    ]);
    expect(g.map((x) => x.lines.length)).toEqual([2, 1]);
  });
});
