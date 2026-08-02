/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT SHE TELLS THE COACH REACHES HER RECORD.
 *
 * The intake prompt makes a promise on the app's behalf: *"Two things NOTHING ELSE in the app will
 * ever ask her: her bodyweight, and how many days a week she can train."* The forms that used to
 * ask are gone, and the coach does ask — in conversation, the way a person would.
 *
 * And then the answers stopped there. `ConnectHealth` hands the intake `daysPerWeek: 4` with a
 * comment saying "a PLACEHOLDER, and the coach replaces it"; nothing replaced it. `weightKg` was
 * never collected at all. So the numbers she gave lived in a chat transcript and nowhere else.
 *
 * ── WHY THAT IS NOT COSMETIC ────────────────────────────────────────────────────────────────────
 * `coachFacts` builds every LATER sheet from the PROFILE. So a coach that agreed on three days read
 * "daysPerWeek: 4" on its own sheet the following week, under a bound that says *"write exactly
 * that many sessions"* — it contradicted itself out of a record it had no way to correct. And an
 * empty bodyweight silently switches off everything keyed to it: the calorie estimate, the
 * milestone ladders' anchor, and her weight trend, which has no first point to measure from.
 *
 * ── WHY IT IS REPORTED AND NOT PARSED ───────────────────────────────────────────────────────────
 * The thing that already reads her sentences is the model. A regex over free text in two languages
 * ("62 kilos", "around 60", "one thirty-five") is a second interpreter of the same words, and the
 * place it goes wrong is the place it matters.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { parseCoachPlan } from '@/domain/coachPlan';
import { applyLearned } from '@/domain/coachLearned';
import { CoachIntake } from '@/screens/onboarding/CoachIntake';
import { db } from '@/data/local/db';
import { initI18n, tg } from '@/i18n';
import type { OnboardingInputs, Profile } from '@/data/local/models';

jest.mock('@/platform/coach/coachClient', () => ({
  askCoach: jest.fn(),
  coachIsReachable: () => true,
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { askCoach } = require('@/platform/coach/coachClient') as { askCoach: jest.Mock };

const profile: Profile = {
  sex: 'female', units: 'kg', goal: 'build_muscle', daysPerWeek: 4, healthConnected: false,
};

const reply = (body: Record<string, unknown>) => JSON.stringify({ say: 'Noted.', ...body });

beforeAll(async () => { await initI18n(); });
beforeEach(async () => { await db.clearAll(); askCoach.mockReset(); });

describe('the coach reports what she said', () => {
  it('reads a stated bodyweight off a turn that decided nothing', () => {
    // The shape of nearly every intake turn: she answers a question, no programme yet. A `learned`
    // read only alongside `sessions` would miss almost every number she gives.
    const r = parseCoachPlan(reply({ learned: { weightKg: 58.5 } }));
    expect(r.ok && r.answer.plan).toBeNull();
    expect(r.ok && r.answer.learned).toEqual({ weightKg: 58.5 });
  });

  it('refuses a figure that cannot be a person, and keeps the rest of the turn', () => {
    // This object is written into her profile unread by anybody. A wrong number here is wrong in
    // the app for ever, and she never typed it — but refusing the whole answer over a stray field
    // would cost her a workout to save a number.
    const r = parseCoachPlan(reply({ learned: { weightKg: 6200, daysPerWeek: 3 } }));
    expect(r.ok && r.answer.say).toBe('Noted.');
    expect(r.ok && r.answer.learned).toEqual({ daysPerWeek: 3 });
  });

  it('says nothing at all when the coach reported nothing', () => {
    // Absent and empty must not look the same to the caller: one is "she told me nothing", the
    // other is "she told me something I refused", and the caller writes what it is handed.
    expect(parseCoachPlan(reply({ learned: {} })).ok && parseCoachPlan(reply({ learned: {} })).ok).toBe(true);
    const r = parseCoachPlan(reply({ learned: { daysPerWeek: 99 } }));
    expect(r.ok && 'learned' in r.answer).toBe(false);
  });

  it('takes the DAY COUNT from the programme when the coach did not state it', () => {
    // Not a guess about her: the prompt's own bound is "write exactly that many sessions", so a
    // three-session week IS three days, whether or not the coach thought to say so.
    const three = ['A', 'B', 'C'].map((name) => ({
      name, blocks: [{ rounds: 3, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: 30 }] }],
    }));
    const r = parseCoachPlan(reply({ sessions: three }));
    expect(r.ok && r.answer.learned).toEqual({ daysPerWeek: 3 });
  });

  it('lets what she SAID stand beside the programme it wrote', () => {
    const one = [{ name: 'A', blocks: [{ rounds: 3, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: 30 }] }] }];
    const r = parseCoachPlan(reply({ sessions: one, learned: { weightKg: 62, minutes: 45 } }));
    expect(r.ok && r.answer.learned).toEqual({ weightKg: 62, minutes: 45, daysPerWeek: 1 });
  });
});

describe('and the record takes it in', () => {
  it('writes the fields that moved', () => {
    const applied = applyLearned(profile, { weightKg: 62, daysPerWeek: 3, minutes: 45 })!;
    expect(applied.profile.weightKg).toBe(62);
    expect(applied.profile.daysPerWeek).toBe(3);
    expect(applied.profile.workoutMinutes).toBe(45);
    expect(applied.changed.sort()).toEqual(['daysPerWeek', 'minutes', 'weightKg']);
  });

  it('writes NOTHING when the record already says it', () => {
    // The coach repeats her numbers whenever the conversation returns to them ("you're 62, so…").
    // A write per turn is a storage write and a PROFILE_UPDATED for news the profile already has.
    expect(applyLearned({ ...profile, weightKg: 62 }, { weightKg: 62, daysPerWeek: 4 })).toBeNull();
  });

  it('anchors the weight she was MET at exactly once', () => {
    // `startWeightKg` is what the milestone ladders are cut from and what her weight trend is
    // measured against. Re-anchoring on every new figure makes the ladders follow her down the
    // scale and every trend read flat.
    const first = applyLearned(profile, { weightKg: 62 })!;
    expect(first.profile.startWeightKg).toBe(62);
    const later = applyLearned(first.profile, { weightKg: 59 })!;
    expect(later.profile.weightKg).toBe(59);
    expect(later.profile.startWeightKg).toBe(62);
  });
});

describe('and it does not tell the coach its own news', () => {
  it('never routes a learned fact through the road that calls the coach back', () => {
    /*
     * ⚠️ THE OBVIOUS REFACTOR IS THE BUG. `updateProfileInfo` already merges these exact fields, so
     * "just reuse it" is the first thing anybody will try — and it ends with `askCoachToRevise`,
     * because it exists for her CHANGING HER MIND in Settings. Routed through it, the coach saying
     * "three days then" would spend a second call to inform the coach that she now trains three
     * days, and the programme it had just written would be rewritten on the strength of it.
     *
     * A source law, because the store cannot be mounted without a backend, a model client and the
     * notification layer — and a rule that can only be checked by reading is a rule that gets
     * broken by someone who did not read.
     */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src/state/stores/appStore.tsx'), 'utf8');
    const body = src.slice(src.indexOf('async learnFromCoach'));
    const fn = body.slice(0, body.indexOf('\n      },'));
    expect(fn).toContain('applyLearned');
    expect({ calls: /askCoachToRevise|updateProfileInfo/.test(fn) }).toEqual({ calls: false });
  });
});

describe('the intake carries them out of the conversation', () => {
  const inputs: OnboardingInputs = {
    goal: 'build_muscle',
    // The placeholder `ConnectHealth` hands over, because the field is not optional and the first
    // sheet needs a number. It is a guess about her, and it survives exactly until she speaks.
    daysPerWeek: 4,
    units: 'kg', healthConnected: false, name: 'Dana', sex: 'female',
  };

  const METRICS: Metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

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
    const composer = () => tree.root.findAll((n) => typeof n.props?.onChangeText === 'function' && typeof n.props?.value === 'string')[0];
    /*
     * Both controls found by LABEL rather than by position. This used to take the last button on the
     * screen, which was the send control only for as long as the send control was the last button —
     * and the programme's own accept control now sits below it.
     */
    const send = () => tree.root.findAll((n) => n.props?.accessibilityLabel === tg('coach.send'))[0];
    const accept = () => tree.root.findAll((n) => n.props?.label === tg('coach.accept'))[0];
    return {
      nav,
      async accept() {
        await act(async () => { accept().props.onPress(); });
      },
      async say(text: string) {
        act(() => composer().props.onChangeText(text));
        await act(async () => { send().props.onPress(); await Promise.resolve(); await Promise.resolve(); });
      },
    };
  }

  it('accumulates across turns and hands them on with the rest', async () => {
    // She says her weight in the second turn and the programme arrives in the fifth. There is no
    // profile in between — writing one would swap the navigator out mid-sentence — so the facts
    // have to survive the conversation.
    const c = mount();
    askCoach.mockResolvedValue({ ok: true, model: 'm', usage: null, text: reply({ learned: { weightKg: 58 } }) });
    await c.say('I weigh 58');
    expect(c.nav.replace).not.toHaveBeenCalled();

    askCoach.mockResolvedValue({ ok: true, model: 'm', usage: null, text: reply({ learned: { minutes: 45 } }) });
    await c.say('about 45 minutes');

    askCoach.mockResolvedValue({
      ok: true, model: 'm', usage: null,
      text: reply({
        sessions: ['A', 'B', 'C'].map((name) => ({ name, blocks: [{ rounds: 3, items: [{ kind: 'reps', ex: 'bb_bench_press', reps: [8, 12], load: 30 }] }] })),
      }),
    });
    await c.say('three days');
    /*
     * ⚠️ AND SHE HAS TO ACCEPT IT NOW. The screen used to hand over the instant a programme arrived;
     * the founder overruled that on build 39 (*"without asking whether this is what I want"*), so
     * the week is shown in the conversation and her acceptance is what moves her on. The facts
     * still have to survive all of it, which is what this law is about.
     */
    await c.accept();

    expect(c.nav.replace).toHaveBeenCalledWith('ProgramCreated', {
      inputs: { ...inputs, weightKg: 58, workoutMinutes: 45, daysPerWeek: 3 },
    });
  });
});
