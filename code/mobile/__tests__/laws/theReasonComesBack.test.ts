/**
 * ════ THE REASON THE COACH GAVE IS THE REASON IT IS REMINDED OF ════
 *
 * The founder saw this before I did. I had written down consistency-over-months as an unsolved
 * risk and a subsystem to build, and he answered:
 *
 *   > *"Isn't that directly connected to our WHY?"*
 *
 * It is, and the mechanism already existed. This app has always recorded why it changed something
 * and shown it to her. What was missing was one direction: **the reason never came back to the
 * thing that made it.** So a decision in month three could contradict a decision in month one —
 * not because the coach is inconsistent, but because it had no memory of having decided.
 *
 * Not a subsystem. A return path. And a return path is exactly the kind of thing that gets built,
 * works once, and then silently stops being connected — because nothing visibly breaks when the
 * last hop is missing. The coach just quietly starts contradicting itself, months later, to
 * someone who is not writing tests.
 *
 * So this walks the whole loop: a plan's notes → the stored log → the sheet → the bytes on the
 * wire. Every hop, in one test, because a hop is only ever missing at ONE of them.
 */
// @ts-nocheck

// 

import { appendDecisions, recentDecisions, COACH_LOG_CAP } from '@/domain/coachLog';
import { coachFacts } from '@/domain/coachFacts';
import { coachRequest } from '@/domain/coachPrompt';
import type { Profile, Program, Session } from '@/data/local/models';

const profile: Profile = {
  sex: 'female', weightKg: 62, units: 'kg', goal: 'build_muscle',
  daysPerWeek: 4, repBand: '8-10', healthConnected: false,
};
const program: Program = { id: 'p', frequency: 4, days: [] };
const history: Session[] = [];

const REASON = 'Your last two sessions ended short, so I have cut a set from the squat.';

describe('the whole loop, hop by hop', () => {
  it('carries a plan note into the log, into the sheet, and onto the wire', () => {
    // 1 — the coach decides, and says why.
    const log = appendDecisions([], [{ ex: 'bb_back_squat', say: REASON }], '2026-08-01T09:00:00.000Z');
    expect(log).toEqual([{ at: '2026-08-01T09:00:00.000Z', ex: 'bb_back_squat', say: REASON }]);

    // 2 — the sheet built for the NEXT call carries it.
    const facts = coachFacts({ profile, plan: null, history, decided: log });
    expect(facts.decided?.[0]?.say).toBe(REASON);

    // 3 — and it is actually in the bytes that get sent, below the cache breakpoint.
    const request = coachRequest({ facts, ask: { kind: 'after_session' } });
    const sheet = request.blocks.find((b) => b.text.startsWith('HER RECORD'));
    expect(sheet?.text).toContain(REASON);
    // The preamble is byte-identical for everyone; a reason of hers appearing in it would cold-cache
    // every athlete in the system, silently, with the bill arriving a month later.
    expect(request.blocks[0].text).not.toContain(REASON);
  });

  it('sends the newest decisions first, because that is the one about to be contradicted', () => {
    let log = appendDecisions([], [{ ex: 'a', say: 'first' }], '2026-06-01T00:00:00.000Z');
    log = appendDecisions(log, [{ ex: 'a', say: 'second' }], '2026-07-01T00:00:00.000Z');
    const facts = coachFacts({ profile, plan: null, history, decided: log });
    expect(facts.decided?.map((d) => d.say)).toEqual(['second', 'first']);
  });

  it('is capped, because it is paid for on every single call', () => {
    let log: ReturnType<typeof appendDecisions> = [];
    for (let i = 0; i < COACH_LOG_CAP + 25; i++) {
      log = appendDecisions(log, [{ say: `reason ${i}` }], new Date(2026, 0, 1 + i).toISOString());
    }
    expect(log.length).toBe(COACH_LOG_CAP);
    // The cap drops the OLDEST. Dropping the newest would keep a memory that is never the one
    // about to be contradicted.
    expect(recentDecisions(log)[0].say).toBe(`reason ${COACH_LOG_CAP + 24}`);
    expect(log[0].say).toBe(`reason ${25}`);
  });

  it('says nothing at all when there is nothing decided yet', () => {
    // An empty `decided: []` on every intake sheet is bytes paid for to say "no history", on the
    // one call where there is definitionally none.
    const facts = coachFacts({ profile, plan: null, history, decided: [] });
    expect('decided' in facts).toBe(false);
  });
});
