/**
 * ════ THE SENTENCE THE PRODUCT IS BUILT AROUND ════
 *
 *   > *"It is exactly like me going to train now and sending you all the data from the workout and
 *   > saying — now decide what happens from here. That's it."*  — founder
 *
 * Everything else in this layer is scaffolding for this one call. So the tests are about the two
 * ways it can betray a finished workout: by taking something away from it, and by lying about
 * whether an update arrived.
 *
 * ── WHAT MUST NEVER HAPPEN ──────────────────────────────────────────────────────────────────────
 * She has finished and left. Nothing here may block, throw, retry, or decide anything locally. A
 * finished workout is finished whatever the network did.
 */
import { db } from '@/data/local/db';
import { askAfterSession } from '@/platform/coach/afterSession';
import type { Profile, Program, Session } from '@/data/local/models';

jest.mock('@/platform/coach/coachClient', () => ({
  askCoach: jest.fn(),
  coachIsReachable: () => true,
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { askCoach } = require('@/platform/coach/coachClient') as { askCoach: jest.Mock };

const profile: Profile = {
  sex: 'female', weightKg: 62, units: 'kg', goal: 'build_muscle',
  daysPerWeek: 4, repBand: '8-10', healthConnected: false,
};
const program: Program = { id: 'p', frequency: 4, days: [] };

const finished: Session = {
  id: 's-just-done', programDayId: 'd1', programDayName: 'Upper A',
  startedAt: '2026-08-01T17:00:00.000Z', state: 'SAVED', earlyFinish: false, trained: true,
  sets: [{
    exerciseId: 'bb_bench_press', setIndex: 0, recommendedWeight: 30, recommendedReps: 8,
    actualWeight: 30, actualReps: 12, edited: false, restBeforeS: 120,
    persistedAt: '2026-08-01T17:04:00.000Z',
  }],
};

const REPLY = {
  ok: true as const,
  model: 'gemini-3.6-flash',
  usage: null,
  text: JSON.stringify({
    say: 'You finished every set at the top of the band, so I have moved the bench up.',
    sessions: [{ name: 'Upper A', blocks: [{ rounds: 4, restS: 90, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: 32.5 }] }] }],
    notes: [{ ex: 'bb_bench_press', say: 'Twelve at 30 kg is the top of your band — up 2.5.' }],
  }),
};

beforeEach(async () => {
  askCoach.mockReset();
  await db.clearAll();
  await db.saveProfile(profile);
  await db.saveProgram(program);
});

describe('the workout ends and the coach decides', () => {
  it('sends what she just did, and lands the programme that comes back', async () => {
    askCoach.mockResolvedValue(REPLY);
    const update = await askAfterSession(finished);

    expect(update.outcome).toBe('decided');
    // The session it was about is named, so a retry sends THAT one and not merely the newest.
    expect(update.sessionId).toBe('s-just-done');

    // The finished session is in the sheet — this is the "all the data from the workout" half.
    const sheet = (askCoach.mock.calls[0][0] as { blocks: { text: string }[] }).blocks
      .find((b) => b.text.startsWith('HER RECORD'))!.text;
    expect(sheet).toContain('session');
    expect(sheet).toContain('bb_bench_press');

    // …and the decision is stored, with its reason where the NEXT call will read it back.
    expect((await db.loadCoachPlan())?.sessions[0].blocks[0].items[0]).toMatchObject({ load: 32.5 });
    expect((await db.loadCoachLog())[0].say).toContain('top of your band');
  });

  it('says the update is WAITING rather than deciding anything itself', async () => {
    // The ruling, in one assertion: no connection means nothing is decided. Not a safe default,
    // not last week again, not a local floor — nothing.
    askCoach.mockResolvedValue({ ok: false, reason: 'offline' });
    const update = await askAfterSession(finished);

    expect(update).toMatchObject({ outcome: 'waiting', trouble: 'offline', sessionId: 's-just-done' });
    expect(await db.loadCoachPlan()).toBeNull();
    expect(await db.loadCoachLog()).toEqual([]);
  });

  it('records the outcome so a surface can SAY it, in words', async () => {
    // The one thing worse than the update not arriving is the app not knowing that it did not.
    askCoach.mockResolvedValue({ ok: false, reason: 'timed_out' });
    await askAfterSession(finished);
    expect(await db.loadCoachUpdate()).toMatchObject({ outcome: 'waiting', trouble: 'timed_out' });
  });

  it('never retries — one workout is one call, and one bill', async () => {
    askCoach.mockResolvedValue({ ok: false, reason: 'upstream' });
    await askAfterSession(finished);
    expect(askCoach).toHaveBeenCalledTimes(1);
  });

  it('resolves rather than throwing when our own code falls over', async () => {
    // A rejected promise inside a finished workout is a crash report about something that does not
    // affect the workout at all. `void askAfterSession(...)` at the call site relies on this.
    askCoach.mockRejectedValue(new Error('boom'));
    await expect(askAfterSession(finished)).resolves.toMatchObject({ outcome: 'waiting' });
  });

  it('does not call the coach at all for an athlete with no profile', async () => {
    // Not a coach failure — an athlete who has not finished onboarding, with nothing to decide about.
    await db.clearAll();
    const update = await askAfterSession(finished);
    expect(askCoach).not.toHaveBeenCalled();
    expect(update).toMatchObject({ outcome: 'waiting', trouble: 'not_configured' });
  });

  it('tells an answer with no programme apart from no answer at all', async () => {
    /*
     * THE FIRST LIVE POST-SESSION CALL DID EXACTLY THIS, and it is the worst failure in the layer:
     * the coach replied *"I have increased your bench press load to 32.5 kg"* and attached no
     * `sessions`. She reads that sentence, trains the old load, and the app has lied to her on the
     * coach's behalf.
     *
     * It stays its own outcome rather than folding into `waiting` because the fault is different —
     * the network was fine and a model ignored an instruction — and counting it is how we learn
     * whether it happens often enough to matter. What must NOT differ is the consequence: nothing
     * was decided either way.
     */
    askCoach.mockResolvedValue({ ok: true, model: 'm', usage: null, text: JSON.stringify({ say: 'I have raised your bench to 32.5.' }) });
    const update = await askAfterSession(finished);
    expect(update).toMatchObject({ outcome: 'spoke', say: 'I have raised your bench to 32.5.' });
    expect(update.trouble).toBeUndefined();
    // And nothing was stored, whatever the sentence claimed.
    expect(await db.loadCoachPlan()).toBeNull();
  });

  it('tells the coach, in the ask, that a programme is REQUIRED this time', async () => {
    // The preamble used to say "sessions is optional and most turns do not have one" as an
    // absolute, and it is much longer than the ask, so it won. The rule was right for CHAT and was
    // being applied to everything.
    askCoach.mockResolvedValue(REPLY);
    await askAfterSession(finished);
    const blocks = (askCoach.mock.calls[0][0] as { blocks: { text: string }[] }).blocks;
    expect(blocks.at(-1)!.text).toContain('"sessions" IS REQUIRED ON THIS TURN');
    /*
     * And the preamble still states the prohibition that makes the failure above impossible to
     * rationalise. Matched on the RULE, not on its wording: the sentence was rewritten in prompt v15
     * (see `howToAnswer` — the long version was suppressing the answer), and a law that pins the
     * phrasing of a prompt breaks every time the prompt is improved, which teaches people to edit
     * the test rather than think about it.
     */
    expect(blocks[0].text).toContain('Never describe a change without attaching it');
  });
});

describe('the programme is required after a session', () => {
  /*
   * ⚠️ THIS WAS ASKED FOR IN PROSE FIRST, AND PROSE LOST.
   *
   * The instruction said "sessions IS REQUIRED ON THIS TURN", in capitals, and the first live
   * post-session call answered *"I have increased your bench press load to 32.5 kg"* with no
   * `sessions` at all. She would have read a change that never happened.
   *
   * Structured output is not a suggestion. With `sessions` in `required`, omitting it stops being
   * something the model can do — so the guarantee moves off the prompt, where it was a request,
   * and onto the schema, where it is a constraint.
   */
  it('sends a schema the coach cannot answer without a programme', async () => {
    askCoach.mockResolvedValue(REPLY);
    await askAfterSession(finished);
    const schema = askCoach.mock.calls[0][1] as { required: string[]; properties: Record<string, unknown> };
    expect(schema.required).toEqual(['say', 'sessions']);
    /*
     * …and it is the same schema otherwise. Two hand-written copies are two chances to drift.
     *
     * `next` is carried here even though this call has no branch to declare — it is one schema, and
     * a second copy that omitted a field would be exactly the drift this assertion exists to catch.
     * It is not in `required`, so the post-session call simply never fills it.
     */
    expect(Object.keys(schema.properties)).toEqual(['say', 'next', 'hurts', 'sessions', 'notes', 'learned', 'brief']);
  });

  it('still reports honestly if the model manages to answer without one', async () => {
    // Belt and braces: the schema makes it very hard, and `spoke` is what happens if it occurs
    // anyway. A surface must treat it exactly like `waiting` — nothing changed.
    askCoach.mockResolvedValue({ ok: true, model: 'm', usage: null, text: JSON.stringify({ say: 'Up 2.5 on the bench.' }) });
    const update = await askAfterSession(finished);
    expect(update.outcome).toBe('spoke');
    expect(await db.loadCoachPlan()).toBeNull();
  });

  it('leaves the CHAT schema permissive — most turns are a question answered', async () => {
    // The two must not converge. A chat turn locked to a required programme is "why did my bench
    // go down?" answered with a whole week, every time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { COACH_PLAN_SCHEMA } = require('@/domain/coachPlan') as { COACH_PLAN_SCHEMA: { required: string[] } };
    expect(COACH_PLAN_SCHEMA.required).toEqual(['say']);
  });
});
