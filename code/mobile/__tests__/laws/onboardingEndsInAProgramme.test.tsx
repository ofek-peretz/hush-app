/**
 * ════ ONBOARDING IS NOT FINISHED UNTIL THERE IS A PROGRAMME ════
 *
 * The last step used to be a generator: four forms, a two-second reveal, and a week composed
 * locally. It is a conversation now — the founder's own description of the product, arriving as its
 * front door:
 *
 *   > *"Imagine someone came to you in a Claude chat and asked you to manage their training, and
 *   > promised to give you all their workout data afterwards."*
 *
 * Two things about that ordering are load-bearing and neither is obvious from reading the screen.
 *
 * ── 1. THE PROFILE IS NOT WRITTEN HERE ──────────────────────────────────────────────────────────
 * `Root` renders the main app the instant `app.profile` exists. Writing it during the conversation
 * would swap the navigator out from under her mid-sentence. And the ordering is the honest one
 * anyway: an athlete with a profile and no programme is an account with nothing in it — precisely
 * what a crash between the two would leave behind.
 *
 * ── 2. THERE IS NO LOCAL FIRST PROGRAMME ────────────────────────────────────────────────────────
 * If the coach cannot be reached she cannot finish, and the screen says so. A generated first week
 * would be the exact thing this layer removed, handed over at the one moment she has no way to tell
 * it apart from the real thing.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { CoachIntake } from '@/screens/onboarding/CoachIntake';
import { db } from '@/data/local/db';
import { tg, initI18n } from '@/i18n';
import type { OnboardingInputs } from '@/data/local/models';

jest.mock('@/platform/coach/coachClient', () => ({
  askCoach: jest.fn(),
  coachIsReachable: () => true,
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { askCoach } = require('@/platform/coach/coachClient') as { askCoach: jest.Mock };

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const inputs: OnboardingInputs = {
  goal: 'build_muscle', daysPerWeek: 4, units: 'kg', healthConnected: false,
  name: 'Dana', sex: 'female', heightCm: 168, weightKg: 62, age: 31,
  bodyMap: { Chest: 'emphasis' },
};

const PLAN = {
  ok: true as const, model: 'gemini-3.6-flash', usage: null,
  text: JSON.stringify({
    say: 'That is enough to start. Here is your first week.',
    sessions: [{ name: 'Upper A', blocks: [{ rounds: 3, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: 30 }] }] }],
    notes: [{ ex: 'bb_bench_press', say: 'Starting conservatively — we correct from what you actually do.' }],
  }),
};
const QUESTION = {
  ok: true as const, model: 'gemini-3.6-flash', usage: null,
  text: JSON.stringify({ say: 'How many days a week can you actually train?' }),
};

function mount() {
  const nav = { replace: jest.fn(), navigate: jest.fn(), goBack: jest.fn() };
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <CoachIntake navigation={nav as any} route={{ key: 'k', name: 'CoachIntake', params: { inputs } } as any} />
      </SafeAreaProvider>,
    );
  });
  const composer = () =>
    tree.root.findAll((n) => typeof n.props?.onChangeText === 'function' && typeof n.props?.value === 'string')[0];
  const sendControl = () =>
    tree.root.findAll((n) => n.props?.accessibilityLabel === tg('coach.send'))[0];
  /** The programme's own control. Absent until the coach has actually attached one. */
  const acceptControl = () =>
    tree.root.findAll((n) => n.props?.label === tg('coach.accept'))[0];
  return {
    nav,
    acceptShown: () => acceptControl() !== undefined,
    async accept() {
      await act(async () => { acceptControl().props.onPress(); });
    },
    async say(text: string) {
      await act(async () => { composer().props.onChangeText(text); });
      await act(async () => { sendControl().props.onPress(); });
    },
    texts: () =>
      tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children as string),
  };
}

beforeAll(async () => { await initI18n(); });
beforeEach(async () => {
  askCoach.mockReset();
  await db.clearAll();
});

describe('the intake is the last step', () => {
  it('opens with an INVITATION in her name, not a cursor waiting for her to know what to say', () => {
    /*
     * The screen used to recite three lines about the coach before she had said a word, and the
     * founder's verdict was exact: *"it's as if before talking to you these sentences appeared —
     * it's strange."* Nobody introduces themselves to an empty room.
     *
     * What opens the room now is one line, above the thread, that uses the name 1.2 asked for. The
     * introduction moved into the prompt, where it happens while the coach is already being useful.
     */
    askCoach.mockResolvedValue(QUESTION);
    const read = mount().texts().join(' ');
    expect(read).toContain('Dana');
    expect(read).toContain(tg('coach.inviteNamed', { name: 'Dana' }));
  });

  it('briefs the coach with everything the forms already collected', async () => {
    askCoach.mockResolvedValue(QUESTION);
    await mount().say('I want to build muscle');

    const sheet = (askCoach.mock.calls[0][0] as { blocks: { text: string }[] }).blocks
      .find((b) => b.text.startsWith('HER RECORD'))!.text;
    // Her body, her days, her map — asked once, on a form, and never asked again in words.
    expect(sheet).toContain('62');
    expect(sheet).toContain('emphasis');
    // …and an empty record is stated as a fact about her, not left as a hole to fill in.
    expect(sheet).toContain('"performed":[]');
  });

  it('does not leave the conversation while the coach is still asking questions', async () => {
    askCoach.mockResolvedValue(QUESTION);
    const c = mount();
    await c.say('I want to build muscle');
    expect(c.nav.replace).not.toHaveBeenCalled();
  });

  it('⚠️ shows her the programme and WAITS — a plan arriving is not her agreeing to it', async () => {
    /*
     * ⛔ FOUNDER, ON BUILD 39: *"he moved me straight to the transition screen without showing me
     * the plan first, without asking whether this is what I want and whether I approve."*
     *
     * This screen used to navigate the instant a programme appeared — while the coach's own closing
     * sentence was "what would you like to change?". The prompt and the screen contradicted each
     * other and the screen won. Now the week is drawn in the conversation, where it can be argued
     * with, and only her acceptance moves her on.
     */
    askCoach.mockResolvedValue(PLAN);
    const c = mount();
    await c.say('four days, full gym');

    // It is on disk — `useCoach` awaits the write, so anything downstream reads a programme that
    // exists rather than racing it. (It did not, and the next screen drew an empty week.)
    expect((await db.loadCoachPlan())?.sessions[0].name).toBe('Upper A');
    // She can see it, and she has not been moved anywhere.
    expect(c.texts().join(' ')).toContain('Barbell Bench Press');
    expect(c.acceptShown()).toBe(true);
    expect(c.nav.replace).not.toHaveBeenCalled();
  });

  it('hands over when she accepts, carrying what the conversation produced', async () => {
    askCoach.mockResolvedValue(PLAN);
    const c = mount();
    await c.say('four days, full gym');
    await c.accept();
    // `daysPerWeek` is 1 here because this fixture's week is one session, and the programme is the
    // answer to "how many days a week does she train" whatever the form guessed on the way in.
    expect(c.nav.replace).toHaveBeenCalledWith('ProgramCreated', { inputs: { ...inputs, daysPerWeek: 1 } });
  });

  it('⚠️ lets her ask for a change instead, and shows the NEW week', async () => {
    // The whole point of waiting. A programme she cannot argue with is one she was handed.
    askCoach.mockResolvedValue(PLAN);
    const c = mount();
    await c.say('four days, full gym');
    askCoach.mockResolvedValue({
      ...PLAN,
      text: JSON.stringify({
        say: 'Swapped it.',
        sessions: [{ name: 'Lower A', blocks: [{ rounds: 3, items: [{ kind: 'reps', ex: 'bb_back_squat', reps: [8, 12], load: 40 }] }] }],
      }),
    });
    await c.say('I would rather squat');
    const read = c.texts().join(' ');
    expect(read).toContain('Barbell Back Squat');
    expect(read).not.toContain('Barbell Bench Press');
    expect(c.nav.replace).not.toHaveBeenCalled();
  });

  it('writes NO profile of its own — Root would swap the navigator out mid-sentence', async () => {
    askCoach.mockResolvedValue(PLAN);
    await mount().say('four days, full gym');
    expect(await db.loadProfile()).toBeNull();
  });

  it('hands over exactly once, however many times she taps', async () => {
    // Two taps in the same tick would push this screen twice.
    askCoach.mockResolvedValue(PLAN);
    const c = mount();
    await c.say('four days');
    await c.accept();
    await c.accept();
    expect(c.nav.replace).toHaveBeenCalledTimes(1);
  });
});

describe('when the coach cannot be reached', () => {
  it('does not finish onboarding, and does not invent a first week', async () => {
    /*
     * The ruling, at the moment it matters most. A locally generated first programme is exactly the
     * thing this layer removed, handed over when she has no way to tell it apart from the real one.
     */
    askCoach.mockResolvedValue({ ok: false, reason: 'offline' });
    const c = mount();
    await c.say('I want to build muscle');

    expect(c.nav.replace).not.toHaveBeenCalled();
    expect(await db.loadCoachPlan()).toBeNull();
    expect(await db.loadProfile()).toBeNull();
  });

  it('keeps her words on the screen, marked, so she can try again without retyping', async () => {
    askCoach.mockResolvedValue({ ok: false, reason: 'offline' });
    const c = mount();
    await c.say('I want to build muscle');
    expect(c.texts().join(' ')).toContain('I want to build muscle');
    expect(c.texts().join(' ')).toContain('Not sent');
  });
});
