/**
 * The Saturday letter — the three things only THIS screen can be wrong about:
 *
 *  · **S-56 — the one question the mirror may ask.** "A muscle is switched off after she has
 *    trained it. Once — and once only — Hush comes back… asked once, at the Saturday mirror."
 *    Either answer retires the muscle's question forever (L4); "bring it back" resumes the muscle.
 *  · **S-65 / L9 — a question never stands between the athlete and anything.** The card is a row
 *    in the letter, not a modal: Done closes the letter whether or not she answered.
 *  · **S-45 — volume moves are muscle news, rendered as muscle rows** (Rev 12 §7: the plan view
 *    used to drop them, so the letter claimed "steady" on a week Loop 3 changed).
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { WeeklyUpdate } from '@/screens/weekly/WeeklyUpdate';
import { initI18n, tg } from '@/i18n';
import { db } from '@/data/local/db';
import type { WeeklyPlanView } from '@/engine/weeklyView';
import type { Program, Session } from '@/data/local/models';

beforeAll(async () => {
  await initI18n();
});

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

// The mock-factory captures below MUST keep the `mock` prefix — jest hoists `jest.mock` above
// every declaration, and only mock-prefixed names are allowed to be referenced from a factory.
const mockProgram: Program = {
  id: 'p', frequency: 3,
  days: [{ id: 'd1', name: 'Upper A', muscleGroups: ['Chest'], isRest: false, slots: [{ capability: 'horizontal_push', exerciseId: 'bb_bench_press', setCount: 3 }] }],
};

/** A session with one logged squat set — Quads is a TRAINED muscle (the S-56 fact). */
const quadsSession: Session = {
  id: 's1', programDayId: 'd1', startedAt: '2026-07-15T10:00:00Z', state: 'SAVED', earlyFinish: false,
  sets: [{ exerciseId: 'bb_back_squat', setIndex: 0, recommendedWeight: 50, recommendedReps: 8, actualWeight: 50, actualReps: 8, edited: false, persistedAt: '' }],
};

/** The mutable view the mocked data layer serves. */
let mockView: WeeklyPlanView | null = null;
const baseView = (): WeeklyPlanView => ({
  weekIndex: 0, at: '2026-07-18T17:30:00Z', changedCount: 0, seen: true,
  workouts: [{ dayId: 'd1', name: 'Upper A', groups: ['Chest'], lifts: [] }],
});

jest.mock('@/domain/weeklyUpdate', () => ({
  getWeeklyPlan: async () => mockView,
  markWeeklyUpdateSeen: async () => {},
}));

const mockProfileUpdates: Array<Record<string, unknown>> = [];
let mockBodyMap: Record<string, 'off' | 'normal' | 'emphasis'> = {};
jest.mock('@/state/stores/appStore', () => ({
  useApp: () => ({
    profile: { name: 'Dana', units: 'kg', bodyMap: mockBodyMap },
    program: mockProgram,
    modeState: { completedSessions: 3 },
    refreshProgram: async () => {},
    model: { sessionTargets: async () => [] },
    updateProfileInfo: async (f: Record<string, unknown>) => void mockProfileUpdates.push(f),
  }),
}));

type Json = { type: string; props: Record<string, unknown>; children: Json[] | null } | string | null;
/** The question's headline, with the muscle in HEADLINE CASE — `muscle.*` is written for
 *  mid-sentence, and this word opens the sentence (WeeklyUpdate.headlineCase). */
const askTitle = (muscle: string) => {
  const m = tg(`muscle.${muscle}`);
  return tg('weekly.askBackTitle', { muscle: m ? m[0].toLocaleUpperCase() + m.slice(1) : m });
};

function texts(r: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (n: Json | Json[]): void => {
    if (n == null) return;
    if (typeof n === 'string') return void out.push(n);
    if (Array.isArray(n)) return void n.forEach(walk);
    if (n.children) n.children.forEach(walk);
  };
  walk(r.toJSON() as unknown as Json);
  return out;
}
function byLabel(r: ReactTestRenderer, label: string): ReactTestInstance | null {
  const hits = r.root.findAll((n) => n.props?.accessibilityLabel === label, { deep: true });
  return hits.find((n) => typeof n.props.onPress === 'function') ?? hits[0] ?? null;
}

const goBack = jest.fn();
async function open(): Promise<ReactTestRenderer> {
  const nav = { goBack, navigate: () => {} };
  let r!: ReactTestRenderer;
  await act(async () => {
    r = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <WeeklyUpdate navigation={nav as never} route={{ params: undefined } as never} />
      </SafeAreaProvider>,
    );
  });
  return r;
}

beforeEach(async () => {
  await db.clearAll();
  mockProfileUpdates.length = 0;
  goBack.mockClear();
  mockBodyMap = {};
  mockView = baseView();
  await db.saveProgram(mockProgram);
});

describe('S-56 · the one question, at the Saturday mirror', () => {
  it('asks about an OFF muscle she has TRAINED — and "bring it back" resumes it and retires the question (L4)', async () => {
    mockBodyMap = { Quads: 'off' };
    await db.appendCompletedSession(quadsSession);
    const r = await open();

    expect(texts(r).join(' ')).toContain(askTitle('Quads'));
    await act(async () => byLabel(r, tg('weekly.askBackYes'))!.props.onPress());

    expect(mockProfileUpdates).toHaveLength(1);
    expect((mockProfileUpdates[0].bodyMap as Record<string, string>).Quads).toBe('normal');
    expect((await db.loadPreferences()).askedBackMuscles).toContain('Quads');
    expect(texts(r).join(' ')).not.toContain(askTitle('Quads'));
  });

  it('"leave it off" is honoured — the map is untouched, and the question is never raised again (L4)', async () => {
    mockBodyMap = { Quads: 'off' };
    await db.appendCompletedSession(quadsSession);
    const r = await open();
    await act(async () => byLabel(r, tg('weekly.askBackNo'))!.props.onPress());

    expect(mockProfileUpdates).toHaveLength(0); // her off stands
    expect((await db.loadPreferences()).askedBackMuscles).toContain('Quads');
    // …and a fresh open never asks about Quads again.
    const r2 = await open();
    expect(texts(r2).join(' ')).not.toContain(askTitle('Quads'));
  });

  it('an OFF muscle she never trained is honoured in silence — asking would be nagging (L8)', async () => {
    mockBodyMap = { Calves: 'off' };
    const r = await open();
    expect(texts(r).join(' ')).not.toContain(askTitle('Calves'));
  });

  it('S-65 / L9 · the question never blocks the letter — the way out works with the card on screen', async () => {
    mockBodyMap = { Quads: 'off' };
    await db.appendCompletedSession(quadsSession);
    const r = await open();
    expect(texts(r).join(' ')).toContain(askTitle('Quads'));
    // v7 3.1 closes the letter with the × in its chrome, not a Done button in the footer — a letter
    // ends, it is not dismissed. The law is unchanged: the question never holds her here.
    await act(async () => byLabel(r, tg('common.close'))!.props.onPress());
    expect(goBack).toHaveBeenCalled(); // she owes the letter nothing
  });
});

describe('S-45 · a Loop 3 volume move is muscle news, and the letter shows it', () => {
  it('renders the muscle row with its set move and its why', async () => {
    mockView = {
      ...baseView(),
      changedCount: 1,
      volume: [{
        muscle: 'Chest', setsFrom: 9, setsTo: 10,
        explanation: {
          slotId: 'Chest', pattern: '' as never,
          observation: { key: 'explain.volumeUp.observation', params: { muscle: 'Chest' } },
          conclusion: { key: 'explain.volumeUp.conclusion' },
          action: { key: 'explain.volumeUp.action', params: { muscle: 'Chest' } },
          text: { key: 'explain.volumeUp.text', params: { muscle: 'Chest' } },
        },
      }],
    };
    const r = await open();
    const said = texts(r).join(' ');
    expect(said).toContain(tg('muscle.Chest'));
    // v7 splits the move into two styled spans — where it came from, and where it went — so assert
    // the two facts rather than one glued string.
    expect(said).toContain('9');
    expect(said).toContain(`→ 10 ${tg('weekly.setsUnit')}`);
    // The reason UNFOLDS: a muscle has no case sheet to open, so its WHY is a sentence in place.
    //
    // It is resolved with the TRANSLATED muscle, not the engine's raw stamp. The engine is pure
    // and hands over the English name; the row's title has always translated it and the sentence
    // beneath it did not, so a Hebrew athlete read "העבודה על chest מתקדמת" (found while answering
    // C.15). English gained from the same fix: `muscle.*` is authored lowercase for mid-sentence,
    // so the line now reads "Your chest work is progressing" instead of capitalising it.
    const why = tg('explain.volumeUp.text', { muscle: tg('muscle.Chest') });
    expect(said).not.toContain(why);
    await act(async () => byLabel(r, tg('weekly.whyLink'))!.props.onPress());
    expect(texts(r).join(' ')).toContain(why);
    // A volume-only week is NOT a "steady" week — the evidence screen must not appear.
    expect(texts(r).join(' ')).not.toContain(tg('weekly.evidenceIntro'));
  });
});

/**
 * ════ THE LETTER MAY NOT SPEAK BEFORE IT HAS READ (founder 2026-07-28) ════
 *
 * "When there are 0 changes, write something else — 'there are 0 changes' reads robotic."
 *
 * There were two ways to reach that sentence, and only one of them was the steady week. `view` is
 * null until the roll, the fold and the read have all finished, and `changedCount` falls back to 0
 * while it is — so the letter printed "I read last week's sessions and changed 0 lifts. Tap any of
 * them to see why": a count Hush had not counted, a claim to have read what it had not read, and an
 * instruction to tap rows that did not exist. A letter whose read FAILS keeps that sentence forever.
 */
describe('a week with no changes is never reported as a count', () => {
  it('says nothing at all until the read lands', async () => {
    // The read never resolves — the state every letter passes through, and the one a storage
    // failure stops in.
    mockView = null;
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const real = jest.requireMock('@/domain/weeklyUpdate') as { getWeeklyPlan: () => Promise<unknown> };
    const original = real.getWeeklyPlan;
    real.getWeeklyPlan = async () => { await held; return null; };
    try {
      const r = await open();
      const said = texts(r).join(' ');
      // The week's fact band is measured and may stand; the SENTENCE about what Hush decided may not.
      expect(said).not.toContain(tg('weekly.intro', { count: 0 }));
      expect(said).not.toContain(tg('weekly.evidenceIntro'));
    } finally {
      release();
      real.getWeeklyPlan = original;
    }
  });

  it('…and once it has, a steady week answers with the standing record, not a zero', async () => {
    mockView = { ...baseView(), changedCount: 0 };
    await db.appendCompletedSession(quadsSession);
    const r = await open();
    const said = texts(r).join(' ');
    expect(said).not.toContain(tg('weekly.intro', { count: 0 }));
    expect(said).toContain(tg('weekly.evidenceIntro'));
    // What the weeks have added up to — her own totals, read off her own sets. (A Legend draws in
    // upper case, so the comparison is made in the case the athlete actually sees.)
    expect(said.toUpperCase()).toContain(tg('weekly.standingLegend').toUpperCase());
    expect(said.toUpperCase()).toContain(tg('weekly.statSets').toUpperCase());
  });
});
