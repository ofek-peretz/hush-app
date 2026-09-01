/**
 * The body-map EDITOR (brief, Family 4) — **S-57**: the map after onboarding is permanent and
 * editable, and it is where she turns a muscle back on (S-44) or off (S-56).
 *
 * Two things only this screen can be wrong about, and neither is visible to a typecheck:
 *
 *  · **S-56 — an OFF is obeyed in SILENCE.** The register's rule verbatim: the one "want it back?"
 *    question is asked later, once, at the Saturday mirror (WeeklyUpdate) — never as a confirm in
 *    front of the toggle. The editor must not argue with a choice she is making right now (L8).
 *  · **The map that gets saved is the map she drew** — whole-object, so a muscle taken back to
 *    normal really LEAVES. A merge could not express that, and the engine reads absence as normal.
 */
// @ts-nocheck

// 

import React from 'react';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { BodyMapEdit } from '@/screens/profile/BodyMapEdit';
import { viewOf } from '@/components/BodyMapFigure';
import { initI18n, tg } from '@/i18n';
import { db } from '@/data/local/db';
import type { Session } from '@/data/local/models';

beforeAll(async () => {
  await initI18n();
});

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

/** A saved session with one logged set on `exerciseId` — the only thing S-56 reads. */
function session(exerciseId: string): Session {
  return {
    id: 's1',
    programDayId: 'd',
    startedAt: '2026-07-16T10:00:00Z',
    state: 'SAVED',
    earlyFinish: false,
    sets: [
      {
        exerciseId,
        setIndex: 0,
        recommendedWeight: 40,
        recommendedReps: 8,
        actualWeight: 40,
        actualReps: 8,
        edited: false,
        persistedAt: '',
        restBeforeS: 90,
      },
    ],
  };
}

const saved: Array<Record<string, unknown>> = [];
/**
 * What the store answers, and what she is told about it.
 *
 * `updateProfileInfo` resolves TRUE only when the week was actually rebuilt — a week she brought is
 * not ours to rewrite, so the save can land while the programme stays exactly as it was. The screen
 * has to be able to tell those apart, and a storage throw from a third thing again.
 */
let mockRebuilt: boolean | 'throw' = true;
let mockDays = 4;
const mockToasts: string[] = [];

jest.mock('@/state/stores/appStore', () => ({
  useApp: () => ({
    profile: { bodyMap: {}, repBandByMuscle: {}, daysPerWeek: mockDays },
    updateProfileInfo: async (f: Record<string, unknown>) => {
      saved.push(f);
      if (mockRebuilt === 'throw') throw new Error('the disk said no');
      return mockRebuilt;
    },
  }),
}));
jest.mock('@/components/ds', () => {
  const actual = jest.requireActual('@/components/ds');
  return { ...actual, useToast: () => ({ show: (m: string) => mockToasts.push(m) }) };
});

/*
 * ⛔ WHAT IS MOUNTED HERE IS UNMOUNTED (2026-08-27).
 *
 * This suite created renderers and never tore them down. It costs nothing while the screen is
 * static — and turns into a worker-killing crash the moment that screen gains an ARRIVAL:
 * `Arrive` schedules a native-driver animation on a delay, jest tears the environment down while
 * one is still pending, and it wakes into a renderer that no longer exists —
 *
 *     TypeError: Cannot read properties of undefined (reading 'findNodeHandle')
 *
 * printed AFTER "Ran all test suites", belonging to no test. Caught for real on
 * `weeklyUpdateScreen` the day the letter learnt to arrive; closed here BEFORE this screen does.
 */
const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()!.unmount();
  });
});
function mount(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(<SafeAreaProvider initialMetrics={METRICS}>{el}</SafeAreaProvider>);
  });
  mounted.push(r);
  return r;
}

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
/** Every string rendered under one node — the tabs carry their label as a child, not a prop. */
function instText(n: ReactTestInstance): string {
  const out: string[] = [];
  const walk = (x: ReactTestInstance | string): void => {
    if (typeof x === 'string') return void out.push(x);
    (x.children ?? []).forEach(walk as never);
  };
  walk(n);
  return out.join(' ');
}

/** The face of the body a muscle is drawn on, turned to the front of the stage. */
function face(r: ReactTestRenderer, muscle: string) {
  const label = tg(viewOf(muscle) === 'back' ? 'ob.mapBack' : 'ob.mapFront');
  const tab = r.root
    .findAll((n) => n.props?.accessibilityRole === 'tab' && typeof n.props?.onPress === 'function', { deep: true })
    .find((n) => instText(n).includes(label));
  if (tab && !tab.props.accessibilityState?.selected) act(() => tab.props.onPress());
}

/** Open a muscle's sheet the way a finger does — turn the body, then press its zone. */
function openZone(r: ReactTestRenderer, muscle: string) {
  face(r, muscle);
  const zone = r.root.findAll(
    (n) => typeof n.props?.accessibilityLabel === 'string'
      && n.props.accessibilityLabel.startsWith(`${tg(`muscle.${muscle}`)}, `)
      && typeof n.props?.onPress === 'function',
    { deep: true },
  )[0];
  if (!zone) throw new Error(`no zone for ${muscle}`);
  if (!zone.props.accessibilityState?.selected) act(() => zone.props.onPress());
}

/** Set a muscle's stance: open it, then press the rung. The label VoiceOver reads, unchanged. */
function tap(r: ReactTestRenderer, muscle: string, stance: 'Off' | 'Normal' | 'Emphasis') {
  openZone(r, muscle);
  const label = `${tg(`muscle.${muscle}`)} — ${tg(`ob.stance${stance}`)}`;
  const node = byLabel(r, label);
  if (!node) throw new Error(`no control for ${label}`);
  act(() => node.props.onPress());
}

/** Mount with a given history, and let the screen's async read settle. */
async function open(history: Session[]) {
  jest.spyOn(db, 'loadHistory').mockResolvedValue(history);
  const nav = { goBack: () => {}, navigate: () => {} };
  let r!: ReactTestRenderer;
  await act(async () => {
    r = mount(<BodyMapEdit navigation={nav as never} route={{ params: undefined } as never} />);
  });
  return r;
}

beforeEach(() => {
  saved.length = 0;
  mockToasts.length = 0;
  mockRebuilt = true;
  mockDays = 4;
  jest.restoreAllMocks();
});

describe('S-56 · an OFF is obeyed in silence — the one question lives at the Saturday mirror', () => {
  it('turning off a TRAINED muscle just happens — no sheet, no confirm, no argument (L8)', async () => {
    const r = await open([session('bb_bench_press')]); // Chest has a logged set

    tap(r, 'Chest', 'Off');
    // The register: "Once — and once only — Hush comes back… at the Saturday mirror." The editor
    // itself never asks; a confirm here would argue with a choice she is making right now.
    expect(texts(r).join(' ')).not.toContain(askTitle('Chest'));
    await act(async () => byLabel(r, tg('profileEdit.save'))!.props.onPress());
    expect(saved).toHaveLength(1);
    expect((saved[0].bodyMap as Record<string, string>).Chest).toBe('off');
  });

  it('a muscle she has never trained goes off in the same silence', async () => {
    const r = await open([session('bb_bench_press')]); // …only Chest is trained

    tap(r, 'Calves', 'Off');
    await act(async () => byLabel(r, tg('profileEdit.save'))!.props.onPress());
    expect((saved[0].bodyMap as Record<string, string>).Calves).toBe('off');
  });
});

describe('the map that is saved is the map she drew', () => {
  it('stores only her decisions — a mark taken back really leaves', async () => {
    const r = await open([]);
    tap(r, 'Calves', 'Off');
    tap(r, 'Calves', 'Normal'); // …taken back
    tap(r, 'Back', 'Emphasis');
    await act(async () => byLabel(r, tg('profileEdit.save'))!.props.onPress());

    // Whole-object, never merged: `normal` is the ABSENCE of a decision, and the engine reads
    // absence as normal. A merge could not express a muscle coming back.
    expect(saved[0].bodyMap).toEqual({ Back: 'emphasis' });
  });

  it('an untouched map cannot be saved — there is nothing to say', async () => {
    const r = await open([]);
    expect(byLabel(r, tg('profileEdit.save'))!.props.accessibilityState?.disabled).toBe(true);
  });

  it('the per-muscle rep band is written — the first surface that ever could', async () => {
    // `repBandByMuscle` has been read by the engine all along (each exercise resolves its band from
    // its primary muscle). Nothing could WRITE it until this screen existed.
    const r = await open([]);
    openZone(r, 'Shoulders'); // the tapped muscle raises stance AND its ruler
    act(() => byLabel(r, `${tg('muscle.Shoulders')} — 12-15`)!.props.onPress());
    await act(async () => byLabel(r, tg('profileEdit.save'))!.props.onPress());

    expect(saved[0].repBandByMuscle).toEqual({ Shoulders: '12-15' });
  });

  it('an OFF muscle has no band to set — it is not trained', async () => {
    const r = await open([]);
    tap(r, 'Shoulders', 'Off'); // …and the sheet stays open on it
    // The ruler is gone: an off muscle lands in no range, so a scale there would decide nothing.
    expect(byLabel(r, `${tg('muscle.Shoulders')} — 12-15`)).toBeNull();
    // …while the stance rungs are still there, because turning it back on must stay one tap away.
    expect(byLabel(r, `${tg('muscle.Shoulders')} — ${tg('ob.stanceNormal')}`)).not.toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ WHAT THE SCREEN TELLS HER WHEN SHE PRESSES SAVE (found 2026-08-18).
 *
 * Three faults, all of them in the four lines of `save()`, and none of them visible to a typecheck:
 *
 *   · a `db.saveProfile` that threw was an unhandled rejection — no toast, no error, `touched` left
 *     true, and the map she drew lost the moment she walked away;
 *   · the toast promised *"your week was rebuilt to match"* unconditionally, including for the
 *     athlete whose week is her coach's and is deliberately left alone;
 *   · and the back arrow discarded every unsaved stance in silence, on the one profile surface that
 *     is not instant-apply.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('⛔ pressing save says what actually happened', () => {
  it('a rebuilt week is announced as one', async () => {
    const r = await open([]);
    tap(r, 'Back', 'Emphasis');
    await act(async () => byLabel(r, tg('profileEdit.save'))!.props.onPress());
    expect(mockToasts).toEqual([tg('profileEdit.savedDays')]);
  });

  it('⛔ …and a week she BROUGHT is not claimed to have been rebuilt', async () => {
    // `updateProfileInfo` returns without rebuilding when the week is authored — so the sentence
    // about her programme changing is a claim the store had just decided not to make.
    mockRebuilt = false;
    const r = await open([]);
    tap(r, 'Back', 'Emphasis');
    await act(async () => byLabel(r, tg('profileEdit.save'))!.props.onPress());
    expect(mockToasts).toEqual([tg('library.savedNoRebuild')]);
    expect(mockToasts.join(' ')).not.toContain(tg('profileEdit.savedDays'));
  });

  it('⛔ a save that FAILS is said out loud, and she is not left thinking it landed', async () => {
    mockRebuilt = 'throw';
    const r = await open([]);
    tap(r, 'Back', 'Emphasis');
    await act(async () => byLabel(r, tg('profileEdit.save'))!.props.onPress());
    expect(mockToasts).toEqual([tg('library.saveFailed')]);
    // …and the button is live again, because there is still something unsaved to try with.
    expect(byLabel(r, tg('profileEdit.save'))!.props.accessibilityState?.disabled).toBe(false);
  });
});

describe('⛔ the back arrow does not throw her map away', () => {
  /** Mount with a spy on `goBack`, so leaving can be watched as well as counted. */
  async function openWithBack(): Promise<{ r: ReactTestRenderer; backs: number[] }> {
    jest.spyOn(db, 'loadHistory').mockResolvedValue([]);
    const backs: number[] = [];
    const nav = { goBack: () => backs.push(1), navigate: () => {} };
    let r!: ReactTestRenderer;
    await act(async () => {
      r = mount(<BodyMapEdit navigation={nav as never} route={{ params: undefined } as never} />);
    });
    return { r, backs };
  }
  const back = (r: ReactTestRenderer) => byLabel(r, tg('common.back'))!;

  it('an unsaved stance is SAVED on the way out, not discarded in silence', async () => {
    const { r, backs } = await openWithBack();
    tap(r, 'Back', 'Emphasis'); // …and she never presses Save
    await act(async () => back(r).props.onPress());
    expect(saved).toHaveLength(1);
    expect(saved[0].bodyMap).toEqual({ Back: 'emphasis' });
    expect(backs).toHaveLength(1); // …and she still leaves
  });

  it('nothing touched writes nothing — leaving is not an edit', async () => {
    const { r, backs } = await openWithBack();
    await act(async () => back(r).props.onPress());
    expect(saved).toHaveLength(0);
    expect(backs).toHaveLength(1);
  });
});

describe('⛔ the editor promises exactly what her week can honour', () => {
  /*
   * ⛔ FOUNDER, 2026-08-12 — the same defect onboarding was fixed for: the line read "pick up to two"
   * on a week that can hold one, so his second mark being refused looked like a fault rather than
   * the rule. This screen hardcoded the two-lead copy while `onboarding/BodyMap` asked
   * `emphasisBudgetFor(days)`, and this file's own header says the two can never disagree.
   */
  it('a three-day week is promised ONE lead, not two', async () => {
    mockDays = 3;
    const r = await open([]);
    const out = texts(r).join('\n');
    expect(out).toContain(tg('ob.mapSubOne'));
    expect(out).toContain(tg('ob.mapEmphasisOne', { n: 0 }));
    expect(out).not.toContain(tg('ob.mapSub'));
  });

  it('…and a four-day week is still promised two', async () => {
    const r = await open([]);
    const out = texts(r).join('\n');
    expect(out).toContain(tg('ob.mapSub'));
    expect(out).toContain(tg('ob.mapEmphasis', { n: 0 }));
  });
});
