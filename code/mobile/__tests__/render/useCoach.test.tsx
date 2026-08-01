/**
 * ════ THE WIRE BETWEEN THE SCREEN AND THE COACH ════
 *
 * `CoachChat` was built and drivable in the gallery for a whole build without ever having spoken to
 * anything. This is the piece that connects them, and it is worth its own file because a chat UI
 * gets four things wrong by default and each of them is invisible until it happens to a real person:
 *
 *   · her words vanish when a send fails
 *   · a failure is answered locally, so she is told something nobody decided
 *   · a slow reply to an old message lands under a new one and the coach looks confused
 *   · the model is sent one message and asked to remember a conversation
 *
 * Every test here is one of those.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';

import { useCoach, type UseCoach } from '@/screens/coach/useCoach';
import { coachFacts } from '@/domain/coachFacts';
import type { CoachAnswer } from '@/domain/coachPlan';
import type { Profile, Program, Session } from '@/data/local/models';
import { db } from '@/data/local/db';

jest.mock('@/platform/coach/coachClient', () => ({
  askCoach: jest.fn(),
  coachIsReachable: () => true,
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { askCoach } = require('@/platform/coach/coachClient') as {
  askCoach: jest.Mock;
};

const profile: Profile = {
  sex: 'female', weightKg: 62, units: 'kg', goal: 'build_muscle',
  daysPerWeek: 4, repBand: '8-10', healthConnected: false,
};
const program: Program = { id: 'p', frequency: 4, days: [] };
const history: Session[] = [];
const facts = coachFacts({ profile, plan: null, history });

/** What the coach says when it only speaks. */
const words = (say: string) => ({
  ok: true as const,
  text: JSON.stringify({ say }),
  model: 'gemini-3.6-flash',
  usage: null,
});

/** What it says when it also decides. */
const wordsAndPlan = (say: string) => ({
  ok: true as const,
  text: JSON.stringify({
    say,
    sessions: [{ name: 'Upper A', blocks: [{ rounds: 3, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: 30 }] }] }],
  }),
  model: 'gemini-3.6-flash',
  usage: null,
});

/** Mount the hook and hand back a live handle on what it returns. */
function mount(opts: Partial<Parameters<typeof useCoach>[0]> = {}) {
  const seen: { answers: CoachAnswer[]; trouble: string[] } = { answers: [], trouble: [] };
  let api!: UseCoach;

  function Harness() {
    api = useCoach({
      facts,
      mode: 'chat',
      onAnswer: (a) => seen.answers.push(a),
      onTrouble: (t) => seen.trouble.push(t),
      ...opts,
    });
    return null;
  }

  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Harness />);
  });
  return {
    seen,
    get turns() { return api.turns; },
    get busy() { return api.busy; },
    async send(text: string) {
      await act(async () => {
        api.send(text);
      });
    },
    unmount: () => tree.unmount(),
  };
}

beforeEach(async () => {
  askCoach.mockReset();
  // The thread is PERSISTED now, and AsyncStorage's mock is one store for the whole file. Without
  // this each test inherits the last one's conversation — which is itself the proof that the
  // persistence works, and a reason every test below must start from an empty one.
  await db.clearCoachThread();
});

describe('an ordinary exchange', () => {
  it('shows her message before anything has been sent, then the answer beside it', async () => {
    askCoach.mockResolvedValue(words('It went down because your last two sets stopped at 8.'));
    const c = mount();
    await c.send('Why did my bench go down?');

    expect(c.turns.map((t) => [t.by, t.text])).toEqual([
      ['athlete', 'Why did my bench go down?'],
      ['coach', 'It went down because your last two sets stopped at 8.'],
    ]);
    // The pending mark is gone once the answer is beside it — it means "sent, not answered".
    expect(c.turns[0].pending).toBeFalsy();
    expect(c.busy).toBe(false);
  });

  it('hands the caller a turn that only spoke, with no programme attached', async () => {
    askCoach.mockResolvedValue(words('Nothing changes this week.'));
    const c = mount();
    await c.send('anything new?');
    expect(c.seen.answers).toEqual([{ say: 'Nothing changes this week.', plan: null }]);
  });

  it('hands the caller the programme when a turn decided one', async () => {
    // The intake's last turn: words that say it is ready, and the whole programme with them.
    askCoach.mockResolvedValue(wordsAndPlan('Here is your week.'));
    const c = mount({ mode: 'intake' });
    await c.send('four days, mostly upper body');
    expect(c.seen.answers[0].say).toBe('Here is your week.');
    expect(c.seen.answers[0].plan?.sessions[0].name).toBe('Upper A');
  });

  it('never sends whitespace — a stray tap on the send control costs a call', async () => {
    const c = mount();
    await c.send('   ');
    expect(askCoach).not.toHaveBeenCalled();
    expect(c.turns).toEqual([]);
  });
});

describe('when it does not arrive', () => {
  it('keeps her words in the thread and marks them, rather than losing them', async () => {
    askCoach.mockResolvedValue({ ok: false, reason: 'offline' });
    const c = mount();
    await c.send('Can I swap the squat?');

    expect(c.turns.length).toBe(1);
    expect(c.turns[0]).toMatchObject({ by: 'athlete', text: 'Can I swap the squat?', failed: true, pending: false });
    expect(c.seen.trouble).toEqual(['offline']);
  });

  it('answers with NOTHING of its own — there is no second decider', async () => {
    askCoach.mockResolvedValue({ ok: false, reason: 'upstream' });
    const c = mount();
    await c.send('what should I do today?');
    expect(c.turns.some((t) => t.by === 'coach')).toBe(false);
    expect(c.seen.answers).toEqual([]);
  });

  it('never retries — one message is one call, and one bill', async () => {
    askCoach.mockResolvedValue({ ok: false, reason: 'timed_out' });
    const c = mount();
    await c.send('hello');
    expect(askCoach).toHaveBeenCalledTimes(1);
  });

  it('treats a reply it cannot read as trouble, not as something to show her', async () => {
    // A model that answers with prose where a schema was asked for must not put that prose in the
    // thread as if it were an answer — the app cannot tell a refusal from a programme.
    askCoach.mockResolvedValue({ ok: true, text: 'Sure! Here you go.', model: 'm', usage: null });
    const c = mount();
    await c.send('build me a week');
    expect(c.turns.some((t) => t.by === 'coach')).toBe(false);
    expect(c.seen.trouble).toEqual(['not_json']);
  });
});

describe('the conversation is what is sent, not the message', () => {
  it('sends every turn so far, hers last', async () => {
    askCoach.mockResolvedValueOnce(words('How many days a week can you train?'));
    askCoach.mockResolvedValueOnce(words('Four it is.'));
    const c = mount({ mode: 'intake' });
    await c.send('I want to get stronger');
    await c.send('four');

    const second = askCoach.mock.calls[1][0] as { blocks: { text: string }[] };
    const sent = second.blocks[second.blocks.length - 1].text;
    expect(sent).toContain('SHE: I want to get stronger');
    expect(sent).toContain('YOU: How many days a week can you train?');
    expect(sent).toContain('SHE: four');
    // Without this the coach opens with the same first question for ever.
    expect(sent.indexOf('SHE: I want to get stronger')).toBeLessThan(sent.indexOf('SHE: four'));
  });

  it('carries a message that FAILED — she said it, and nobody received it', async () => {
    askCoach.mockResolvedValueOnce({ ok: false, reason: 'offline' });
    askCoach.mockResolvedValueOnce(words('Both answered.'));
    const c = mount();
    await c.send('my knee hurts');
    await c.send('still there?');

    const sent = (askCoach.mock.calls[1][0] as { blocks: { text: string }[] }).blocks.at(-1)!.text;
    expect(sent).toContain('SHE: my knee hurts');
  });

  it('keeps the preamble first and the conversation last, or the cache never hits', async () => {
    askCoach.mockResolvedValue(words('ok'));
    const c = mount();
    await c.send('hello');

    const [request] = askCoach.mock.calls[0] as [{ blocks: { text: string; cache?: true }[] }];
    expect(request.blocks[0].cache).toBe(true);
    expect(request.blocks[0].text).toContain('You are Hush');
    expect(request.blocks.at(-1)!.text).toContain('SHE: hello');
  });
});

describe('two messages in flight', () => {
  it('drops a late answer to an old message', async () => {
    // The composer stays usable while the coach thinks — so two calls can be open at once, and the
    // network does not promise order. An answer to her previous question landing under the answer
    // to her latest one reads as the coach losing the thread.
    let releaseFirst!: (v: unknown) => void;
    askCoach.mockReturnValueOnce(new Promise((res) => { releaseFirst = res; }));
    askCoach.mockResolvedValueOnce(words('the second answer'));

    const c = mount();
    act(() => { c.turns; });
    await c.send('first question');
    await c.send('second question');

    await act(async () => {
      releaseFirst(words('the first answer'));
    });

    const spoken = c.turns.filter((t) => t.by === 'coach').map((t) => t.text);
    expect(spoken).toEqual(['the second answer']);
  });

  it('is busy until every call in flight has settled', async () => {
    let release!: (v: unknown) => void;
    askCoach.mockReturnValueOnce(new Promise((res) => { release = res; }));
    const c = mount();
    await c.send('slow one');
    expect(c.busy).toBe(true);
    await act(async () => { release(words('done')); });
    expect(c.busy).toBe(false);
  });
});

describe('it survives the app dying', () => {
  /*
   * The intake is a long conversation, and a hook that keeps its state in `useState` and nothing
   * else loses all of it the moment the app is backgrounded and killed. Being asked everything
   * again is the worst thing this screen could do to someone.
   */
  it('reads the conversation back on a fresh mount', async () => {
    askCoach.mockResolvedValue(words('How many days a week can you train?'));
    const first = mount();
    await first.send('I want to get stronger');
    first.unmount();

    const second = mount();
    // Hydration is a read, so let it land.
    await act(async () => { await Promise.resolve(); });
    expect(second.turns.map((t) => [t.by, t.text])).toEqual([
      ['athlete', 'I want to get stronger'],
      ['coach', 'How many days a week can you train?'],
    ]);
  });

  it('restores a message that failed, because that is a fact, not a phase', async () => {
    askCoach.mockResolvedValue({ ok: false, reason: 'offline' });
    const first = mount();
    await first.send('my knee hurts');
    first.unmount();

    const second = mount();
    await act(async () => { await Promise.resolve(); });
    expect(second.turns[0]).toMatchObject({ text: 'my knee hurts', failed: true });
    // `pending` is a phase. Restoring one would show her a message for ever about to be sent.
    expect(second.turns[0].pending).toBeUndefined();
  });

  it('never lets a slow read overwrite what she has already typed', async () => {
    // The app is usable before the read lands. A hydration that arrives late must be DISCARDED —
    // the live conversation wins over the stored one, or her message vanishes as she watches.
    askCoach.mockResolvedValue(words('answered'));
    const first = mount();
    await first.send('stored message');
    first.unmount();

    const second = mount();
    await second.send('what she just typed');
    await act(async () => { await Promise.resolve(); });
    expect(second.turns.map((t) => t.text)).toEqual(['what she just typed', 'answered']);
  });

  it('writes the coach reasons where the NEXT call reads them back', async () => {
    // The return path: the reason given is the reason remembered. This is what stops month three
    // contradicting month one, and it is the whole of the mechanism.
    askCoach.mockResolvedValue({
      ok: true,
      text: JSON.stringify({
        say: 'Holding your bench.',
        sessions: [{ name: 'D', blocks: [{ rounds: 1, items: [{ kind: 'open', ex: 'mobility' }] }] }],
        notes: [{ ex: 'bb_bench_press', say: 'Your last two sessions ended short, so I am holding it.' }],
      }),
      model: 'm', usage: null,
    });
    const c = mount();
    await c.send('what now?');
    await act(async () => { await Promise.resolve(); });

    const log = await db.loadCoachLog();
    expect(log.map((d) => [d.ex, d.say])).toEqual([
      ['bb_bench_press', 'Your last two sessions ended short, so I am holding it.'],
    ]);
  });

  it('writes nothing to the log for a turn that only spoke', async () => {
    // A conversation is not a decision. A log full of chat is a log nobody can read a history out of.
    askCoach.mockResolvedValue(words('It went down because your last two sets stopped at 8.'));
    const before = (await db.loadCoachLog()).length;
    const c = mount();
    await c.send('why?');
    await act(async () => { await Promise.resolve(); });
    expect((await db.loadCoachLog()).length).toBe(before);
  });
});
