/**
 * ════ "WHAT CHANGED, AND WHY" — AFTER THE ENGINE STOPPED DECIDING ════
 *
 * The last beat of Well Done used to read a `changeLog` the between-session fold wrote. The fold is
 * deleted, so that log is never written again and the surface would come back empty forever — which
 * is not merely missing, it is WRONG: an empty list on this screen means "nothing changed", and
 * that is a real and common verdict (a hold). Silence and a hold must never look alike.
 *
 * So the verdict has three states, and the third one is the interesting one.
 */
import { coachVerdict } from '@/domain/coachEarned';
import type { CoachUpdate } from '@/platform/coach/afterSession';
import type { CoachDecision } from '@/domain/coachLog';

const AT = '2026-08-01T18:04:00.000Z';
const SESSION = 'sess_1';

const decided: CoachUpdate = {
  at: AT, sessionId: SESSION, outcome: 'decided',
  say: 'You finished every set at the top of the band, so the bench goes up.',
};

const log: CoachDecision[] = [
  { at: AT, ex: 'bb_bench_press', say: 'Twelve at 30 kg is the top of your band — up 2.5.' },
  { at: AT, say: 'Holding the rest of the week while that settles.' },
  // A decision from a DIFFERENT session. Two workouts in one day are two decisions.
  { at: '2026-07-25T09:00:00.000Z', ex: 'bb_back_squat', say: 'Last week, not this one.' },
];

describe('the three states', () => {
  it('says THINKING while the call is out, which is not the same as nothing changed', () => {
    /*
     * The engine answered in a millisecond and a screen could assume the answer existed by the time
     * it drew. The coach takes about fifteen seconds. Showing an empty list in that gap tells her
     * the workout changed nothing, which is a sentence about her training and not about the network.
     */
    expect(coachVerdict(SESSION, null, [], true)).toEqual({ state: 'thinking' });
  });

  it('says WAITING when no call is out and nothing has landed', () => {
    expect(coachVerdict(SESSION, null, [], false)).toEqual({ state: 'waiting', say: null });
  });

  it('gives the coach’s sentence and its per-lift reasons once it lands', () => {
    const v = coachVerdict(SESSION, decided, log, false);
    expect(v.state).toBe('decided');
    if (v.state !== 'decided') return;
    expect(v.say).toContain('top of the band');
    expect(v.lines).toEqual([
      { ex: 'bb_bench_press', say: 'Twelve at 30 kg is the top of your band — up 2.5.' },
      { ex: null, say: 'Holding the rest of the week while that settles.' },
    ]);
  });
});

describe('what it refuses to blend', () => {
  it('ignores an update about a DIFFERENT session', () => {
    // She trained twice today. The screen for the morning session must not narrate the evening's.
    expect(coachVerdict('sess_2', decided, log, false)).toEqual({ state: 'waiting', say: null });
    expect(coachVerdict('sess_2', decided, log, true)).toEqual({ state: 'thinking' });
  });

  it('takes only the decisions this call wrote, matched on its own instant', () => {
    // Two sessions in one day are two decisions, and a "recent" window would merge them.
    const v = coachVerdict(SESSION, decided, log, false);
    if (v.state !== 'decided') throw new Error('expected a decision');
    expect(v.lines.some((l) => l.say === 'Last week, not this one.')).toBe(false);
  });

  it('reports an answer that decided NOTHING as waiting, with what the coach said', () => {
    /*
     * `spoke` and `waiting` are different faults with different fixes and are counted apart. To her
     * they are one fact: nothing changed. "The coach replied but did not decide" is true and useless.
     */
    const spoke: CoachUpdate = { at: AT, sessionId: SESSION, outcome: 'spoke', say: 'Nothing changes this week.' };
    expect(coachVerdict(SESSION, spoke, log, false)).toEqual({ state: 'waiting', say: 'Nothing changes this week.' });
  });

  it('reports an outage as waiting, with nothing said', () => {
    const out: CoachUpdate = { at: AT, sessionId: SESSION, outcome: 'waiting', trouble: 'offline' };
    expect(coachVerdict(SESSION, out, log, false)).toEqual({ state: 'waiting', say: null });
  });

  it('draws a decision that carried no notes as decided, not as silence', () => {
    // The coach changed the programme and explained it in one sentence rather than per lift. That
    // is a complete answer; an empty `lines` here is not the same as an empty verdict.
    const v = coachVerdict(SESSION, decided, [], false);
    expect(v).toEqual({ state: 'decided', say: decided.say, lines: [] });
  });
});
