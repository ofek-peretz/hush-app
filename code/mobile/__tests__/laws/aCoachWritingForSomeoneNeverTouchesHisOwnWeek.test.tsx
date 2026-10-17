// @ts-nocheck
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ LAW · A COACH WRITING FOR SOMEONE NEVER TOUCHES HIS OWN WEEK (the coach track, 2026-09-17)
 *
 * The phone a coach writes a trainee's week on is, very often, the phone he trains with. The
 * programme on its disk is HIS. The pen in for-mode (`screens/coach/CoachWeekBuilder`) reuses the
 * plan builder's view — the rows, the algebra, the four doors — and it must share none of the
 * builder CONTAINER's writes: no `saveBuiltProgram`, no pen-back, no draft read off `loadProgram`,
 * and no model call built from `app.profile` (her week from HIS bodyweight).
 *
 * Two halves, because either alone is a law that can be walked around:
 *   1. BY SOURCE — the container does not import the app store, the database, the outbox, or the
 *      builder container; and the view it reuses writes nothing itself.
 *   2. BY RENDER — a real mount on a phone that already holds the coach's own week: open the week
 *      he sent, change a band and a note, send; take the AI door and send again. Every write method
 *      on `db` is watched, and the programme on disk is byte-for-byte the one he had.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('@/platform/coachTrackClient', () => {
  const actual = jest.requireActual('@/platform/coachTrackClient');
  return {
    ...actual,
    coachSendWeek: jest.fn(async () => ({ ok: true, value: { version: 4, sentAt: '2026-09-17T12:00:00Z' } })),
    coachTemplates: jest.fn(async () => ({ ok: true, value: { templates: [] } })),
    coachSaveTemplate: jest.fn(async () => ({ ok: true, value: {} })),
  };
});
jest.mock('@/platform/coach/planBuild', () => ({
  requestPlanBuild: jest.fn(async () => ({
    ok: true,
    attempts: 1,
    ms: 10,
    week: { days: [{ name: 'Push', lifts: [{ ex: 'bb_bench_press', sets: 4, reps: [6, 8] }] }], missing: [], unreadable: [] },
  })),
}));

import { initI18n, tg } from '@/i18n';
import { db } from '@/data/local/db';
import { AppContext } from '@/state/stores/appStore';
import { ToastProvider } from '@/components/ds';
import { CoachWeekBuilder } from '@/screens/coach/CoachWeekBuilder';
import { coachSendWeek } from '@/platform/coachTrackClient';
import { requestPlanBuild } from '@/platform/coach/planBuild';

const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('1 · by source', () => {
  const pen = code(read('src/screens/coach/CoachWeekBuilder.tsx'));

  it('the for-mode container imports nothing that can reach this phone\'s programme', () => {
    const forbiddenImports = [
      '@/state/stores/appStore',
      '@/data/local/db',
      '@/state/coachOutbox',
      '@/state/stores/coachStore',
      '@/domain/pendingImport',
    ];
    expect(forbiddenImports.filter((m) => pen.includes(`'${m}'`))).toEqual([]);
  });

  it('…and names none of the verbs that write one', () => {
    const verbs = ['useApp', 'saveProgram', 'saveBuiltProgram', 'adoptImportedProgram', 'adoptCoachWeek', 'revertProgramToEngine', 'generateProgram', 'loadProgram', 'app.profile'];
    expect(verbs.filter((v) => pen.includes(v))).toEqual([]);
  });

  it('it reuses the builder VIEW, never the builder container', () => {
    expect(pen).toMatch(/import \{ PlanBuilderView \} from '@\/screens\/plan\/PlanBuilder'/);
    expect(pen).not.toMatch(/<PlanBuilder\b[\s/>]/);
  });

  it('the view it reuses writes nothing itself — every write is a prop the container owns', () => {
    const src = code(read('src/screens/plan/PlanBuilder.tsx'));
    const start = src.indexOf('export function PlanBuilderView');
    const end = src.indexOf('type Props = {', start); // the container begins here
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const view = src.slice(start, end);
    expect(view.length).toBeGreaterThan(2000);
    expect(view).not.toMatch(/\bdb\./);
    expect(view).not.toMatch(/\bapp\.(save|adopt|revert|model)/);
    expect(view).not.toMatch(/useApp\(/);
  });
});

describe('2 · by render — his week on disk survives two weeks written for her', () => {
  const HIS_WEEK = {
    id: 'his-own',
    frequency: 2,
    authored: 'athlete_or_coach',
    title: 'The coach trains too',
    days: [
      { id: 'h1', name: 'Heavy', muscleGroups: ['Quads'], isRest: false, slots: [{ capability: 'knee_dominant', exerciseId: 'bb_back_squat', setCount: 5, repBand: [3, 5] }] },
      { id: 'h2', name: 'Pull', muscleGroups: ['Back'], isRest: false, slots: [{ capability: 'hip_dominant', exerciseId: 'bb_rdl', setCount: 3 }] },
    ],
  };
  /** The COACH's own profile — a heavier man. Nothing here may reach the model call for her. */
  const appFixture = {
    booted: true,
    profile: { id: 'coach', name: 'Danny', sex: 'male', units: 'kg', weightKg: 92, bodyMap: {}, repBandByMuscle: {} },
    program: HIS_WEEK,
    sessions: [],
    entitlement: { status: 'trial', sessionsUsed: 0 },
    model: {},
    modeState: { completedSessions: 0 },
    refreshProgram: async () => {},
  };
  const METRICS = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
  const HER_SENT_WEEK = {
    v: 1,
    title: 'Upper / Lower',
    days: [{ name: 'Upper', lifts: [{ ex: 'bb_bench_press', sets: 3, band: [8, 10] }, { ex: 'cable_row', sets: 3, band: [8, 12] }] }],
  };

  const mounted = [];
  let writes: jest.SpyInstance[] = [];
  let before = '';

  beforeAll(async () => {
    await initI18n();
  });

  beforeEach(async () => {
    await db.saveProgram(HIS_WEEK);
    before = JSON.stringify(await db.loadProgram());
    // Every method on `db` that could write anything is watched from here on.
    writes = Object.keys(db)
      .filter((k) => typeof db[k] === 'function' && /^(save|clear|delete|remove|set|write|adopt|append|amend|record|put|mark)/i.test(k))
      /* Telemetry is the one write allowed: a door-chosen event is not her week, and not his. */
      .filter((k) => !/telemetry/i.test(k))
      .map((k) => jest.spyOn(db, k).mockName(k));
    (coachSendWeek as jest.Mock).mockClear();
    (requestPlanBuild as jest.Mock).mockClear();
  });

  afterEach(() => {
    act(() => {
      while (mounted.length) mounted.pop().unmount();
    });
    writes.forEach((s) => s.mockRestore());
  });

  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

  function mount(params) {
    const navigation = { goBack: jest.fn(), navigate: jest.fn(), popTo: jest.fn() };
    let r;
    act(() => {
      r = renderer.create(
        <SafeAreaProvider initialMetrics={METRICS}>
          <AppContext.Provider value={appFixture}>
            <ToastProvider>
              <CoachWeekBuilder navigation={navigation} route={{ key: 'k', name: 'CoachWeekBuilder', params }} />
            </ToastProvider>
          </AppContext.Provider>
        </SafeAreaProvider>,
      );
    });
    mounted.push(r);
    return { r, navigation };
  }
  const press = async (r, label) => {
    const node = r.root.findAll((n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function', { deep: true })[0];
    if (!node) throw new Error(`no control labelled "${label}"`);
    await act(async () => { node.props.onPress(); });
    await flush();
  };

  const PARAMS = { linkId: 'L1', name: 'Dana', sex: 'female', days: 4, bodyweightKg: 61 };

  it('opening the week he sent her, editing it and sending it writes nothing to this phone', async () => {
    const { r, navigation } = mount({ ...PARAMS, week: HER_SENT_WEEK });
    await flush();

    // The draft is HER week, not his: her lifts are on the page and his squat is not.
    const liftNames = r.root.findAll((n) => n.props?.exerciseId && n.props?.chip, { deep: true }).map((n) => n.props.exerciseId);
    expect([...new Set(liftNames)]).toEqual(['bb_bench_press', 'cable_row']);

    // The chip opens the lift sheet: a band and a note, through the view's own verbs.
    const chip = r.root.findAll((n) => n.props?.exerciseId === 'bb_bench_press' && n.props?.onToggleSets, { deep: true })[0];
    await act(async () => { chip.props.onToggleSets(); });
    await press(r, `${tg('coachTrack.coach.pen.bandLow')} −`);
    const note = r.root.findAll((n) => n.props?.label === tg('coachTrack.coach.pen.note') && n.props?.onChangeText, { deep: true })[0];
    await act(async () => { note.props.onChangeText('Pause on the chest.'); });
    await press(r, tg('coachTrack.coach.pen.done'));

    await press(r, tg('coachTrack.coach.pen.send', { name: 'Dana' }));

    expect(coachSendWeek).toHaveBeenCalledTimes(1);
    const [linkId, wire] = (coachSendWeek as jest.Mock).mock.calls[0];
    expect(linkId).toBe('L1');
    expect(wire.days[0].lifts[0]).toEqual({ ex: 'bb_bench_press', sets: 3, band: [7, 10], note: 'Pause on the chest.' });
    expect(navigation.popTo).toHaveBeenCalledWith('AthleteDetail', { linkId: 'L1', name: 'Dana', sentVersion: 4 }, { merge: true });

    expect(writes.filter((s) => s.mock.calls.length > 0).map((s) => s.getMockName())).toEqual([]);
    expect(JSON.stringify(await db.loadProgram())).toBe(before);
  });

  it('the AI door is asked from HER facts — never his profile — and its week goes to the wire only', async () => {
    const { r } = mount(PARAMS);
    await flush();
    await press(r, tg('coachTrack.coach.pen.doorAi'));
    await press(r, tg('ob.weekEngine'));

    expect(requestPlanBuild).toHaveBeenCalledTimes(1);
    const asked = (requestPlanBuild as jest.Mock).mock.calls[0][0];
    expect(asked).toMatchObject({ daysPerWeek: 4, sex: 'female', weightKg: 61 });

    await press(r, tg('coachTrack.coach.pen.send', { name: 'Dana' }));
    expect(coachSendWeek).toHaveBeenCalledTimes(1);
    expect((coachSendWeek as jest.Mock).mock.calls[0][1].days[0].lifts[0]).toMatchObject({ ex: 'bb_bench_press', sets: 4, band: [6, 8] });

    expect(writes.filter((s) => s.mock.calls.length > 0).map((s) => s.getMockName())).toEqual([]);
    expect(JSON.stringify(await db.loadProgram())).toBe(before);
  });

  it('a week the server would refuse is said, and not sent', async () => {
    const { r } = mount({ ...PARAMS, week: HER_SENT_WEEK });
    await flush();
    await press(r, tg('builder.addDay'));
    await press(r, tg('coachTrack.coach.pen.send', { name: 'Dana' }));
    expect(coachSendWeek).not.toHaveBeenCalled();
    const said = JSON.stringify(r.toJSON());
    expect(said).toContain(tg('coachTrack.coach.problem.emptyDay', { day: tg('builder.dayNamed', { letter: 'B' }) }).slice(0, 12));
  });
});
