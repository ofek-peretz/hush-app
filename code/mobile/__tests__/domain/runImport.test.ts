/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE IMPORT, END TO END — including every way it can fail.
 *
 * ⛔ The call is injected rather than imported, and this file is why. A feature whose failure modes
 * can only be reached by pointing it at a live API is a feature whose failure modes are never
 * tested — and the failures here are the expensive kind: a model that invents a lift, a photograph
 * of the wrong thing, a call that times out halfway through.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import { runImport } from '@/domain/runImport';
import { SETS_MAX } from '@/engine/v5/constants';

/** A model that answers with whatever the test hands it, and records what it was asked. */
function modelSaying(...replies: (object | string | null)[]) {
  const calls: { blocks: string; think?: string; images?: unknown[] }[] = [];
  let i = 0;
  const ask = async (req, _schema, think, images) => {
    calls.push({
      blocks: req.blocks.map((b) => b.text).join('\n'),
      // The LAST block is the varying half — her names on the match call, and nothing else.
      asked: req.blocks[req.blocks.length - 1].text,
      think,
      images,
    });
    const r = replies[Math.min(i, replies.length - 1)];
    i += 1;
    if (r === null) return { ok: false, reason: 'upstream' };
    return { ok: true, text: typeof r === 'string' ? r : JSON.stringify(r) };
  };
  return { ask, calls };
}

const PHOTO = [{ mime: 'image/jpeg', data: 'xxxx' }];

/** What the model returns after reading a photographed sheet. */
const readReply = {
  title: 'Coach block',
  sessions: [
    {
      name: 'Push',
      lifts: [
        { name: 'Barbell Bench Press', sets: 5 },
        { name: 'Back Squat', sets: 6 },
        { name: 'Zercher Squat', sets: 3 },
      ],
    },
    { name: 'Pull', lifts: [{ name: 'DB Row', sets: 4 }] },
  ],
};

describe('⛔ the import, from a photograph', () => {
  it('reads it, matches locally, and asks only about what is left over', async () => {
    const { ask, calls } = modelSaying(readReply, {
      lifts: [{ name: 'Zercher Squat', id: null, alternative: 'bb_back_squat', why: 'closest squat' }],
    });
    const out = await runImport(ask, { images: PHOTO });
    expect(out.ok).toBe(true);
    expect(calls).toHaveLength(2);

    // ⛔ The READ call carries her photo and NO catalogue.
    expect(calls[0].images).toBe(PHOTO);
    expect(calls[0].blocks).not.toContain('bb_bench_press');

    /*
     * ⛔ The SECOND call carries the catalogue (so the model can only choose from what we have) and,
     * in the block that VARIES, only the name we could not place. Asserted on that block rather than
     * on the whole prompt: the catalogue legitimately lists "Barbell Bench Press" as a name, and a
     * test that forbade the string outright would be testing the catalogue, not the call.
     */
    expect(calls[1].blocks).toContain('bb_bench_press = Barbell Bench Press');
    expect(calls[1].asked).toContain('Zercher Squat');
    expect(calls[1].asked).not.toContain('Barbell Bench Press');
    expect(calls[1].asked).not.toContain('DB Row');
    expect(calls[1].images).toBeUndefined();
  });

  it('⛔ makes NO second call when everything matched — the cheapest path is the safest', async () => {
    const { ask, calls } = modelSaying({
      sessions: [{ name: 'A', lifts: [{ name: 'Barbell Bench Press', sets: 4 }, { name: 'DB Row', sets: 4 }] }],
    });
    const out = await runImport(ask, { images: PHOTO });
    expect(out.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(out.suggestions).toEqual([]);
  });

  it('⛔ her set counts survive the whole round trip, past F-1’s ceiling', async () => {
    const { ask } = modelSaying(readReply, { lifts: [] });
    const out = await runImport(ask, { images: PHOTO });
    const squat = out.program.days[0].slots.find((s) => s.exerciseId === 'bb_back_squat');
    expect(squat.setCount).toBe(6);
    expect(squat.setCount).toBeGreaterThan(SETS_MAX);
    expect(out.program.authored).toBe('athlete_or_coach');
  });

  it('reports what it found, and fixes none of it', async () => {
    const { ask } = modelSaying(readReply, { lifts: [] });
    const out = await runImport(ask, { images: PHOTO });
    const kinds = out.findings.map((f) => f.kind);
    expect(kinds).toContain('unmatched_lift');
    expect(kinds).toContain('sets_above_ceiling');
    /*
     * ⛔ THE COUNT IS WHAT WAS **READ**, NOT WHAT SURVIVED. The review's own line says "{{lifts}}
     * exercises read", and counting the matched slots reported three off a sheet of four — the app
     * understating her programme back at her while the finding above named the missing one.
     */
    expect(out.liftCount).toBe(4);
    expect(out.sessionCount).toBe(2);
    // …and the programme still holds exactly what matched: three lifts, unchanged.
    expect(out.program.days.reduce((n, d) => n + d.slots.length, 0)).toBe(3);
    expect(out.title).toBe('Coach block');
  });
});

describe('⛔ the import, from text she typed', () => {
  it('skips the read call entirely', async () => {
    const { ask, calls } = modelSaying({ lifts: [] });
    const out = await runImport(ask, {
      week: { sessions: [{ name: 'A', lifts: [{ name: 'Bench', sets: 4 }] }] },
    });
    expect(out.ok).toBe(true);
    // Everything matched, so there is no call at all — not even the one that reads.
    expect(calls).toHaveLength(0);
    expect(out.program.days[0].slots[0].exerciseId).toBe('bb_bench_press');
  });
});

describe('⛔ every way it can fail', () => {
  it('she gave us nothing', async () => {
    const { ask } = modelSaying({});
    expect(await runImport(ask, {})).toEqual({ ok: false, reason: 'nothing_given' });
  });

  it('the call never came back — no signal, no key, the Worker is down', async () => {
    const { ask } = modelSaying(null);
    expect(await runImport(ask, { images: PHOTO })).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('it came back with no programme in it — a photo of a cat, a blank page', async () => {
    for (const junk of ['not json at all', { sessions: [] }, {}, { sessions: [{ name: 'A', lifts: [] }] }]) {
      const { ask } = modelSaying(junk);
      expect(await runImport(ask, { images: PHOTO })).toEqual({ ok: false, reason: 'unreadable' });
    }
  });

  it('⛔ we read it and NOTHING was ours — almost always the wrong photograph', async () => {
    const { ask } = modelSaying(
      { sessions: [{ name: 'A', lifts: [{ name: 'Zercher Squat', sets: 3 }, { name: 'Sissy Squat', sets: 3 }] }] },
      { lifts: [] },
    );
    expect(await runImport(ask, { images: PHOTO })).toEqual({ ok: false, reason: 'nothing_matched' });
  });

  it('⛔ a FAILED suggestion call does not lose the import — her matched lifts are already a week', async () => {
    /*
     * The second call is a nicety. Throwing away everything the local matcher got right because it
     * timed out would be the worst possible trade, and it is the easy mistake to make here.
     */
    const { ask } = modelSaying(readReply, null);
    const out = await runImport(ask, { images: PHOTO });
    expect(out.ok).toBe(true);
    expect(out.liftCount).toBe(4); // four lifts read; three of them are in her week
    expect(out.suggestions).toEqual([]);
    // …and the lift it could not place is still reported, which is a true and useful sentence.
    expect(out.findings.some((f) => f.kind === 'unmatched_lift' && f.subject === 'Zercher Squat')).toBe(true);
  });

  it('⛔ an INVENTED lift never reaches her week, even end to end', async () => {
    const { ask } = modelSaying(readReply, {
      lifts: [{ name: 'Zercher Squat', id: 'barbell_zercher_squat', why: 'made up' }],
    });
    const out = await runImport(ask, { images: PHOTO });
    expect(out.suggestions[0].id).toBeNull();
    expect(out.program.days.flatMap((d) => d.slots).some((s) => s.exerciseId.includes('zercher'))).toBe(false);
  });

  it('survives a reply that is valid JSON of entirely the wrong shape', async () => {
    const { ask } = modelSaying({ sessions: [{ name: 'A', lifts: [{ name: 'Bench', sets: 'four' }] }] }, { lifts: [] });
    const out = await runImport(ask, { images: PHOTO });
    expect(out.ok).toBe(true);
    // "four" is not a set count — it becomes a question on the review, not a number she never wrote.
    expect(out.program.days[0].slots[0].setCount).toBe(3);
    expect(out.findings.some((f) => f.kind === 'sets_unstated')).toBe(true);
  });
});

/*
 * ⛔ THE TYPED PATH — the one piece of logic that lives in the screen.
 *
 * It is deliberately dumb: a blank line starts a session, a non-blank line is a lift, and a trailing
 * `4x8` is its set count. The danger is not that it is too simple — it is that someone makes it
 * clever, and a second parser starts competing with the model's in a file nobody tests as hard.
 */
describe('⛔ a programme she typed or pasted', () => {
  const { parseTypedPlan } = require('@/screens/import/ImportPlan');

  it('reads sessions, lifts and set counts the way people write them', () => {
    const w = parseTypedPlan(
      ['Push', 'Bench Press 4x8', 'Incline DB Press 3 x 10', '', 'Pull', 'Deadlift 4 sets', 'DB Row'].join('\n'),
    );
    expect(w.sessions).toHaveLength(2);
    expect(w.sessions[0].name).toBe('Push');
    expect(w.sessions[0].lifts).toEqual([
      { name: 'Bench Press', sets: 4 },
      { name: 'Incline DB Press', sets: 3 },
    ]);
    expect(w.sessions[1].lifts).toEqual([{ name: 'Deadlift', sets: 4 }, { name: 'DB Row' }]);
  });

  it('⛔ takes a set count ONLY when it is unambiguous — never a guess', () => {
    /*
     * "Bench 8-10 reps" states a rep range and no set count. A parser that read the 8 would put a
     * number in her programme that she never wrote, which is the one thing this feature cannot do.
     * It comes back without one, and the review asks her.
     */
    const w = parseTypedPlan(['A', 'Bench Press 8-10 reps', 'DB Row'].join('\n'));
    expect(w.sessions[0].lifts[0].sets).toBeUndefined();
    expect(w.sessions[0].lifts[1].sets).toBeUndefined();
  });

  it('and what it parses feeds the same pipeline, unchanged', async () => {
    const { ask } = modelSaying({ lifts: [] });
    const out = await runImport(ask, { week: parseTypedPlan('Push\nBench Press 6x5\n') });
    expect(out.ok).toBe(true);
    // Six sets, straight through, past F-1's ceiling.
    expect(out.program.days[0].slots[0].setCount).toBe(6);
    expect(out.program.authored).toBe('athlete_or_coach');
  });

  it('⛔ a line with a set count is a LIFT, never the name of the day', () => {
    /*
     * She pastes her week out of a message thread, where nobody writes headers. The first non-blank
     * line of every block was taken as the session NAME whatever it said — so her bench press became
     * the day's title and vanished out of her programme. A silent edit to her week, by the one
     * feature that exists to refuse silent edits, and nothing on the review said it had happened.
     */
    const w = parseTypedPlan(['Bench 4x8', 'Squat 5x5', '', 'Deadlift 3x5'].join('\n'));
    expect(w.sessions[0].lifts).toEqual([{ name: 'Bench', sets: 4 }, { name: 'Squat', sets: 5 }]);
    expect(w.sessions[1].lifts).toEqual([{ name: 'Deadlift', sets: 3 }]);
    // The day still gets a name — one made up about the day, never one taken out of her week.
    expect(w.sessions.map((s) => s.name)).toEqual(['Day 1', 'Day 2']);
  });

  it('still reads a header when she wrote one', () => {
    const w = parseTypedPlan(['Push', 'Bench 4x8', '', 'Squat 5x5'].join('\n'));
    expect(w.sessions[0].name).toBe('Push');
    expect(w.sessions[0].lifts).toEqual([{ name: 'Bench', sets: 4 }]);
    expect(w.sessions[1].name).toBe('Day 2');
  });

  it('a blank or shapeless paste yields nothing rather than a broken week', () => {
    for (const junk of ['', '   ', '\n\n\n', 'Push']) {
      expect(parseTypedPlan(junk).sessions).toEqual([]);
    }
  });
});

describe('⛔ she does not wait for the second call', () => {
  /*
   * ⛔ FOUNDER: *"התהליך של ההמתנה צריך לעבור בצורה הכי חלקה ומהירה שיש ועם כמה שפחות חיכוכים."*
   *
   * By the time the local match is done her programme and her whole report exist. The leftovers call
   * only adds a suggested alternative for names we could not place — the least important part of the
   * flow, and on a bad connection the slowest. She reads while it runs.
   */
  it('⛔ hands over the full report BEFORE the leftovers call is made', async () => {
    const order: string[] = [];
    let readyAt: number | null = null;
    let calls = 0;
    const ask = async (req, _s, _t, images) => {
      calls += 1;
      order.push(images ? 'read' : 'leftovers');
      if (images) return { ok: true, text: JSON.stringify(readReply) };
      readyAt = readyAt; // the report must already have landed by now
      return { ok: true, text: JSON.stringify({ lifts: [] }) };
    };
    let partial = null;
    const out = await runImport(ask, {
      images: PHOTO,
      onReady: (p) => {
        partial = p;
        order.push('ready');
      },
    });
    // ⛔ The report arrived BETWEEN the two calls, not after both.
    expect(order).toEqual(['read', 'ready', 'leftovers']);
    expect(calls).toBe(2);
    // …and what she got early is the complete programme and the complete report.
    expect(partial.liftCount).toBe(out.liftCount);
    expect(partial.findings).toEqual(out.findings);
    expect(partial.program).toEqual(out.program);
  });

  it('it is the same object she keeps — the early report is not a draft', async () => {
    /*
     * If she taps "Keep mine" the instant the report appears, she must save the real programme. A
     * partial that later differed from the resolved one would be a race with her thumb.
     */
    let partial = null;
    const { ask } = modelSaying(readReply, { lifts: [{ name: 'Zercher Squat', id: null, alternative: 'bb_back_squat' }] });
    const out = await runImport(ask, { images: PHOTO, onReady: (p) => { partial = p; } });
    expect(partial.program).toBe(out.program); // the very same object
    // Only the suggestions differ, and they are rendered rather than applied.
    expect(partial.suggestions).toEqual([]);
    expect(out.suggestions).toHaveLength(1);
  });

  it('says which step is running, so the spinner carries an honest sentence', async () => {
    const phases: string[] = [];
    const { ask } = modelSaying(readReply, { lifts: [] });
    await runImport(ask, { images: PHOTO, onPhase: (p) => phases.push(p) });
    expect(phases).toEqual(['reading', 'matching']);
  });

  it('⛔ the typed path with everything matched reports instantly — no call, no phase', async () => {
    const phases: string[] = [];
    const { ask, calls } = modelSaying({});
    let partial = null;
    await runImport(ask, {
      week: { sessions: [{ name: 'A', lifts: [{ name: 'Bench', sets: 4 }] }] },
      onPhase: (p) => phases.push(p),
      onReady: (p) => { partial = p; },
    });
    expect(calls).toHaveLength(0);
    expect(phases).toEqual([]);
    expect(partial.liftCount).toBe(1);
  });
});
