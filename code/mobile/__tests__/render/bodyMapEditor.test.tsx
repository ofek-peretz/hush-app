/**
 * The body-map EDITOR (brief, Family 4) — the same map, editable forever.
 *
 * Two things only this screen can be wrong about, and neither is visible to a typecheck:
 *
 *  · **S-56, the ask-back.** `shouldAskBackOnOff` sat in the engine — correct, tested, and unused —
 *    under a note: "DELIBERATELY NOT WIRED (founder decision, 2026-07-16): the ask-back is a
 *    body-map SCREEN interaction… which lands with the founder's end redesign of that screen. The
 *    engine predicate is ready for it." This is that screen. The trigger is a FACT ("does she have
 *    a logged set on this muscle?"), never a guess — a muscle she has never trained is honoured in
 *    silence, because asking would be the nagging L8 bans.
 *  · **The map that gets saved is the map she drew** — whole-object, so a muscle taken back to
 *    normal really LEAVES. A merge could not express that, and the engine reads absence as normal.
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { BodyMapEdit } from '@/screens/profile/BodyMapEdit';
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

jest.mock('@/state/stores/appStore', () => ({
  useApp: () => ({
    profile: { bodyMap: {}, repBandByMuscle: {} },
    updateProfileInfo: async (f: Record<string, unknown>) => void saved.push(f),
  }),
}));
jest.mock('@/components/ds', () => {
  const actual = jest.requireActual('@/components/ds');
  return { ...actual, useToast: () => ({ show: () => {} }) };
});

function mount(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = renderer.create(<SafeAreaProvider initialMetrics={METRICS}>{el}</SafeAreaProvider>);
  });
  return r;
}

type Json = { type: string; props: Record<string, unknown>; children: Json[] | null } | string | null;
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
function tap(r: ReactTestRenderer, muscle: string, stance: 'Off' | 'Normal' | 'Emphasis') {
  const node = byLabel(r, `${tg(`muscle.${muscle}`)} — ${tg(`ob.stance${stance}`)}`);
  if (!node) throw new Error(`no control for ${muscle}/${stance}`);
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
  jest.restoreAllMocks();
});

describe('S-56 · turning off a muscle she has TRAINED is asked about, once', () => {
  it('asks — and holds the toggle until she answers', async () => {
    const r = await open([session('bb_bench_press')]); // Chest has a logged set

    tap(r, 'Chest', 'Off');
    const said = texts(r).join(' ');
    expect(said).toContain(tg('ob.mapAskBackTitle', { muscle: tg('muscle.Chest') }));
    // …and it does not argue with her. It states what it keeps, and offers both doors.
    expect(said).toContain(tg('ob.mapAskBackKeep'));
    expect(said).toContain(tg('ob.mapAskBackOff'));
  });

  it('answering "keep training it" leaves the map exactly as it was', async () => {
    const r = await open([session('bb_bench_press')]);
    tap(r, 'Chest', 'Off');
    act(() => byLabel(r, tg('ob.mapAskBackKeep'))!.props.onPress());

    // Nothing to save — the toggle never happened.
    const save = byLabel(r, tg('profileEdit.save'))!;
    expect(save.props.accessibilityState?.disabled).toBe(true);
  });

  it('answering "turn it off" honours her — and the map carries it', async () => {
    const r = await open([session('bb_bench_press')]);
    tap(r, 'Chest', 'Off');
    act(() => byLabel(r, tg('ob.mapAskBackOff'))!.props.onPress());
    await act(async () => byLabel(r, tg('profileEdit.save'))!.props.onPress());

    expect(saved).toHaveLength(1);
    expect((saved[0].bodyMap as Record<string, string>).Chest).toBe('off');
  });

  it('a muscle she has NEVER trained goes off in silence — asking would be nagging', async () => {
    // The trigger is a fact, not a policy: no logged set → no history to lose → nothing to ask about.
    const r = await open([session('bb_bench_press')]); // …only Chest is trained

    tap(r, 'Calves', 'Off');
    expect(texts(r).join(' ')).not.toContain(tg('ob.mapAskBackTitle', { muscle: tg('muscle.Calves') }));
    await act(async () => byLabel(r, tg('profileEdit.save'))!.props.onPress());
    expect((saved[0].bodyMap as Record<string, string>).Calves).toBe('off');
  });

  it('never asks on the way BACK on — resuming a muscle costs her nothing', async () => {
    const r = await open([session('bb_bench_press')]);
    tap(r, 'Chest', 'Off');
    act(() => byLabel(r, tg('ob.mapAskBackOff'))!.props.onPress());
    tap(r, 'Chest', 'Normal'); // …she changes her mind

    expect(texts(r).join(' ')).not.toContain(tg('ob.mapAskBackTitle', { muscle: tg('muscle.Chest') }));
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
    act(() => byLabel(r, tg('ob.mapBandOpen', { muscle: tg('muscle.Shoulders') }))!.props.onPress());
    act(() => byLabel(r, `${tg('muscle.Shoulders')} — 12-15`)!.props.onPress());
    await act(async () => byLabel(r, tg('profileEdit.save'))!.props.onPress());

    expect(saved[0].repBandByMuscle).toEqual({ Shoulders: '12-15' });
  });

  it('an OFF muscle has no band to set — it is not trained', async () => {
    const r = await open([]);
    tap(r, 'Shoulders', 'Off');
    const door = byLabel(r, tg('ob.mapBandOpen', { muscle: tg('muscle.Shoulders') }));
    expect(door).toBeNull();
  });
});
