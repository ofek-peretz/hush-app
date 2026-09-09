// @ts-nocheck
/**
 * ═══ THE WEEK THE MODEL WROTE IS THE WEEK SHE TRAINS ═══
 *
 * ⛔ FOUNDER, 2026-09-09, on build 72: *"זה לא עובד. ביקשתי מהבינה בלי אימון רגליים והוא שם לי כאן
 * פעמיים אימון רגליים."*
 *
 * The model had obeyed — eleven live calls that day, zero leg lifts — and `BuildingProgramme` had
 * DRAWN its week. Then nothing wrote it to disk. `ProgramCreated` read the disk, found no programme,
 * and `completeOnboarding` generated the engine's week over the one she had just been shown: two
 * leg days, in silence, under an animation quoting her own sentence.
 *
 * This law renders the real container with the wire mocked to answer a no-legs week, and reads the
 * DISK afterwards. What is on disk must be the model's lifts, sealed with the passport that makes
 * `engineMayRebuild` refuse — the same road the builder's intake door takes.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppProvider, engineMayRebuild } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { exerciseById } from '@/data/exercises';
import { initI18n } from '@/i18n';

/** A four-day week the model could write for "no leg days at all" — every id a catalogue id. */
const NO_LEGS_WEEK = {
  days: [
    { name: 'חזה וזרועות', lifts: [{ ex: 'bb_bench_press', sets: 4 }, { ex: 'incline_db_press', sets: 3 }, { ex: 'triceps_pushdown', sets: 3 }] },
    { name: 'גב וכתפיים', lifts: [{ ex: 'lat_pulldown', sets: 4 }, { ex: 'bb_row', sets: 3 }, { ex: 'lateral_raise', sets: 3 }] },
    { name: 'חזה וגב', lifts: [{ ex: 'chest_dip', sets: 3 }, { ex: 'cable_row', sets: 3 }] },
    { name: 'כתפיים וזרועות', lifts: [{ ex: 'bb_overhead_press', sets: 4 }, { ex: 'hammer_curl', sets: 3 }] },
  ],
  missing: [],
};

const mockRequestPlanBuild = jest.fn(async () => ({ ok: true, week: NO_LEGS_WEEK, attempts: 1, ms: 5000 }));
jest.mock('@/platform/coach/planBuild', () => ({
  ...jest.requireActual('@/platform/coach/planBuild'),
  requestPlanBuild: (...args: unknown[]) => mockRequestPlanBuild(...args),
}));

const { BuildingProgramme } = require('@/screens/onboarding/BuildingProgramme');

const LEGS = new Set(['Quads', 'Hamstrings', 'Glutes', 'Calves']);

const inputs = {
  name: 'עופר',
  sex: 'male',
  weightKg: 78,
  age: 30,
  experience: 'intermediate',
  units: 'kg',
  goal: 'build_muscle',
  daysPerWeek: 4,
  workoutMinutes: 60,
  healthConnected: false,
  bodyMap: {},
};

beforeAll(async () => {
  await initI18n();
});

async function settle(times = 6) {
  for (let i = 0; i < times; i++) {
    await act(async () => { await Promise.resolve(); });
  }
}

describe('the week the model wrote is the week she trains', () => {
  it('⛔ what the reveal draws is what the DISK holds — sealed, and every lift the model chose', async () => {
    await AsyncStorage.clear();
    const navigation = { replace: jest.fn(), navigate: jest.fn(), goBack: jest.fn() };
    const route = { params: { inputs, coachAsk: 'אני לא רוצה אימוני רגליים בכלל' } };
    let tree: any = null;
    await act(async () => {
      tree = renderer.create(
        React.createElement(AppProvider, null, React.createElement(BuildingProgramme, { navigation, route })),
      );
    });
    await settle(12);

    expect(mockRequestPlanBuild).toHaveBeenCalledTimes(1);
    expect(mockRequestPlanBuild.mock.calls[0][0]).toMatchObject({ daysPerWeek: 4, sex: 'male', ask: 'אני לא רוצה אימוני רגליים בכלל' });

    const onDisk = await db.loadProgram();
    expect(onDisk).not.toBeNull();
    // 1 · the passport — the engine may not rebuild over it, which is what happened on build 72
    expect(onDisk.authored).toBe('athlete_or_coach');
    expect(engineMayRebuild(onDisk)).toBe(false);
    // 2 · the model's own lifts, in its own days, and not one leg lift among them
    const days = onDisk.days.filter((d: any) => !d.isRest);
    expect(days.map((d: any) => d.slots.map((s: any) => s.exerciseId))).toEqual(NO_LEGS_WEEK.days.map((d) => d.lifts.map((l) => l.ex)));
    expect(days.map((d: any) => d.name)).toEqual(NO_LEGS_WEEK.days.map((d) => d.name));
    const legLifts = days.flatMap((d: any) => d.slots).filter((s: any) => LEGS.has(exerciseById(s.exerciseId)?.muscle));
    expect(legLifts).toEqual([]);
    // 3 · the frequency is the WEEK's
    expect(onDisk.frequency).toBe(4);

    await act(async () => { tree.unmount(); });
  });
});
