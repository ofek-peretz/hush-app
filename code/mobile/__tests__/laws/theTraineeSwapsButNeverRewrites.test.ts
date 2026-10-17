/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE TRAINEE SWAPS, BUT NEVER REWRITES. — the coach track, law 5 (app half, 2026-09-17)
 *
 * ⛔ RULING 4 (founder, 2026-09-17): the trainee may swap a lift for TODAY only, and the coach sees
 * the swap. Only the coach changes the week.
 *
 * So on a LINKED coach's week every door that reshapes the stored week refuses — the pre-workout
 * card's declared swap, the drag, the builder's save, an import, the pen-back — and the AI build
 * and AI review are not offered at all. The in-session swap is untouched, because it never touched
 * the stored week: it re-points the running plan and reaches the coach on the upload.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import fs from 'fs';
import path from 'path';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppProvider, useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { sessionToUpload, wireToProgram } from '@/domain/coachTrack';
import { saveCoachLink, forgetCoachLink } from '@/state/coachOutbox';
import type { Profile, Program } from '@/data/local/models';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const athlete = (): Profile => ({
  id: 'p1',
  sex: 'female',
  units: 'kg',
  weightKg: 62,
  startWeightKg: 62,
  daysPerWeek: 2,
  repBand: '8-10',
  repBandByMuscle: {},
  memberSince: new Date('2026-01-01').toISOString(),
});

const coachWeek = (): Program =>
  wireToProgram({
    version: 2,
    sentAt: '2026-09-17T08:00:00.000Z',
    coachName: 'Dana',
    week: {
      v: 1,
      days: [
        { name: 'Upper', lifts: [{ ex: 'bb_bench_press', sets: 4, band: [6, 8] }, { ex: 'bb_row', sets: 3, band: [8, 10] }] },
        { name: 'Lower', lifts: [{ ex: 'bb_back_squat', sets: 5, band: [3, 5] }, { ex: 'leg_extension', sets: 3, band: [12, 15] }] },
      ],
    },
  }).program;

function Probe({ hold }: { hold: (api: unknown) => void }) {
  hold(useApp());
  return null;
}
const settle = async () => {
  for (let i = 0; i < 30; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve(); });
  }
};

async function mount(): Promise<{ api: any; unmount: () => Promise<void> }> {
  let api: any = null;
  let tree: renderer.ReactTestRenderer | null = null;
  await act(async () => {
    tree = renderer.create(React.createElement(AppProvider, null, React.createElement(Probe, { hold: (a: any) => { api = a; } })));
  });
  await settle();
  return { get api() { return api; }, unmount: async () => { await act(async () => { tree!.unmount(); }); } } as any;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await db.saveProfile(athlete());
  await db.saveProgram(coachWeek());
  await saveCoachLink({ linkId: 'l1', coachName: 'Dana', since: '2026-09-01T00:00:00.000Z', consent: { bodyweight: false, cardio: false } });
});

describe('⛔ law 5 — on a linked coach’s week, no door of hers reshapes the stored week', () => {
  it('the declared swap, the drag, the builder’s save, an import, the pen-back — all refused', async () => {
    const sent = coachWeek();
    const m = await mount();
    let told: unknown;

    await act(async () => { told = await m.api.declareSwap('bb_bench_press', 'db_bench_press'); });
    expect(told).toBe(false);
    expect(await db.loadProgram()).toEqual(sent);

    await act(async () => { await m.api.reorderExercise(sent.days[0].id, 0, 1); });
    expect(await db.loadProgram()).toEqual(sent);

    const hers = { ...sent, id: 'built', authored: 'athlete_or_coach', days: sent.days.slice(0, 1) };
    await act(async () => { await m.api.saveBuiltProgram(hers); });
    expect(await db.loadProgram()).toEqual(sent);
    await act(async () => { await m.api.adoptImportedProgram(hers); });
    expect(await db.loadProgram()).toEqual(sent);

    await act(async () => { told = await m.api.revertProgramToEngine(); });
    expect(told).toBe(false);
    expect(await db.loadProgram()).toEqual(sent);

    // …and the one writer of a coach week refuses anything that is not one
    await act(async () => { await m.api.adoptCoachWeek(hers); });
    expect(await db.loadProgram()).toEqual(sent);

    await m.unmount();
  });

  it('…while an engine or a brought week is exactly as editable as it was', async () => {
    await forgetCoachLink();
    const m = await mount();
    let told: unknown;
    await act(async () => { told = await m.api.declareSwap('bb_bench_press', 'db_bench_press'); });
    expect(told).toBe(true); // unlinked: her pen is hers again (and the engine still may not rebuild it)
    expect((await db.loadProgram()).days[0].slots[0].exerciseId).toBe('db_bench_press');
    expect((await db.loadProgram()).authored).toBe('coach');
    await m.unmount();
  });

  it('⛔ the swap for TODAY never touches the stored week — and the coach sees it', () => {
    const store = read('src/state/stores/sessionStore.tsx');
    for (const verb of ['swapNextExercise', 'swapCurrentExercise']) {
      const body = store.slice(store.indexOf(`      ${verb}(exerciseId) {`), store.indexOf(`      ${verb}(exerciseId) {`) + 500);
      const end = body.indexOf('\n      },');
      const code = body.slice(0, end);
      expect(code).toContain("dispatch({ type: 'SWAP_PLAN'");
      expect(code).not.toMatch(/saveProgram|declareSwap|reorderExercise/);
    }
    const u = sessionToUpload(
      {
        id: 's', programDayId: 'coach_0', startedAt: '2026-09-15T17:00:00.000Z', state: 'SAVED', earlyFinish: false,
        sets: [
          { exerciseId: 'bb_bench_press', setIndex: 0, recommendedWeight: 80, recommendedReps: 6, actualWeight: 80, actualReps: 6, edited: false, persistedAt: '2026-09-15T17:05:00.000Z' },
          { exerciseId: 'db_row', setIndex: 1, recommendedWeight: 30, recommendedReps: 10, actualWeight: 30, actualReps: 10, edited: false, persistedAt: '2026-09-15T17:10:00.000Z' },
        ],
      },
      coachWeek(),
      { bodyweight: false, cardio: false },
    );
    expect(u.swaps).toEqual([{ from: 'bb_row', to: 'db_row' }]);
  });

  it('⛔ the AI build and the AI review are not offered on a linked coach’s week', () => {
    const builder = read('src/screens/plan/PlanBuilder.tsx');
    expect(builder).toContain('const canBuildForHer = !!(inputs || app.profile) && !coachLocked;');
    expect(builder).toContain('reviewOpen={reviewOpen && !coachLocked}');
    expect(builder).toMatch(/\{props\.intake \|\| props\.coachLocked \? null : \(\s*<Button[\s\S]{0,200}builder\.aiReview/);
    expect(builder).toMatch(/if \(!coachAsk \|\| askedOnce\.current \|\| !draft \|\| coachLocked\) return;/);
    expect(builder).toMatch(/setCoachLocked\(weekIsLockedToCoach\(p, !!l\)\)/);
  });

  it('⛔ every store door asks the disk, like every other gate', () => {
    const store = read('src/state/stores/appStore.tsx');
    const bodyOf = (name: string) => {
      const at = store.indexOf(`      async ${name}(`);
      return store.slice(at, store.indexOf('\n      async ', at + 10));
    };
    expect(bodyOf('saveBuiltProgram')).toMatch(/if \(await lockedToCoach\(state\.program\)\) return;[\s\S]*await db\.saveProgram\(program\)/);
    expect(bodyOf('adoptImportedProgram')).toMatch(/if \(await lockedToCoach\(state\.program\)\) return;/);
    expect(bodyOf('revertProgramToEngine')).toMatch(/if \(await lockedToCoach\(state\.program\)\) return false;/);
    expect(bodyOf('declareSwap')).toMatch(/if \(weekIsLockedToCoach\(program, !!\(await loadCoachLink\(\)/);
    expect(bodyOf('reorderExercise')).toMatch(/if \(weekIsLockedToCoach\(program, !!\(await loadCoachLink\(\)/);
    expect(store).toMatch(/async function lockedToCoach\(fallback: Program \| null\): Promise<boolean> \{\s*const onDisk = await db\.loadProgram\(\)/);
  });
});
