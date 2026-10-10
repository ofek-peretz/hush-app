/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE FREE LOG IS A RECORD, NOT A FUNNEL — founder authorization, 2026-08-24.
 *
 * "מי שסטתה מהתוכנית היום — האימון אבוד לה" was the review's finding; this closes it on the
 * record's own terms (models.ts `Session.freeform`), and this law holds the three promises:
 *
 *   1 · KEPT WHOLE — it counts as a workout, its kilograms count, its week counts, and a
 *       free-logged single can strike a club (a PR day is exactly what the clubs are for);
 *   2 · FOLDED BY NOTHING — the engine skips it entirely: a holiday max attempt must never move
 *       a load, hold a lift, or wear the deload's fatigue mark;
 *   3 · NEVER A FUNNEL — no trial session burns, no planned workout completes, no paywall stands
 *       between her and her own record.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import * as fs from 'fs';
import * as path from 'path';
import { freeSessionOf } from '@/screens/history/FreeLog';
import { advanceV5, currentV5Targets, resetV5 } from '@/engine/v5/v5Engine';
import { earnedMilestones } from '@/domain/milestones';
import { sessionCountsAsWorkout, sessionTonnageKg } from '@/domain/sessionMetrics';
import { bandFor } from '@/engine/v5/repBand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, SetLog } from '@/data/local/models';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

const BAND = bandFor('8-10');
const seed = () => 60;
const set = (exerciseId: string, setIndex: number, w: number, reps: number): SetLog => ({
  exerciseId, setIndex, recommendedWeight: w, recommendedReps: 8, actualWeight: w, actualReps: reps, edited: false, persistedAt: '', restBeforeS: 90,
});
const planned = (startedAt: string): Session => ({
  id: `s_${startedAt}`, programDayId: 'd', startedAt, state: 'SAVED', earlyFinish: false,
  sets: [0, 1, 2].map((i) => set('bb_bench_press', i, 60, 8)),
});
const T = (n: number) => new Date(2026, 2, 2 + n, 10).toISOString();

describe('1 · kept whole', () => {
  const free = freeSessionOf(
    [
      { exerciseId: 'bb_back_squat', weightKg: 100, reps: 1 }, // the PR single
      { exerciseId: 'bb_back_squat', weightKg: 80, reps: 5 },
    ],
    T(10),
    'Free workout',
  );

  it('a workout, with its kilograms, built with honest per-exercise set indices', () => {
    expect(free.trained).toBe(true);
    expect(free.freeform).toBe(true);
    expect(sessionCountsAsWorkout(free)).toBe(true);
    expect(sessionTonnageKg(free)).toBe(100 * 1 + 80 * 5);
    expect(free.sets.map((s) => s.setIndex)).toEqual([0, 1]);
  });

  it('a free-logged single strikes a club — a PR day is what the clubs are for', () => {
    const clubs = earnedMilestones([free], { sex: 'male', weightKg: 80, startWeightKg: 80 }).filter((m) => m.family === 'club');
    expect(clubs.length).toBeGreaterThan(0);
    expect(clubs.every((m) => m.exerciseId === 'bb_back_squat')).toBe(true);
  });
});

describe('2 · folded by nothing', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await resetV5();
  });

  it('the engine reads straight past it — the PR single moves no load and advances no cursor', async () => {
    const history = [planned(T(0)), planned(T(2))];
    const lastAt = Date.parse(history[1].startedAt);
    await advanceV5(['bb_bench_press'], BAND, history, seed, lastAt);
    const before = await currentV5Targets(history, lastAt);

    // A free session with a bench single at 100 kg — a fun max attempt, 1 rep, deep under the floor.
    const free = { ...freeSessionOf([{ exerciseId: 'bb_bench_press', weightKg: 100, reps: 1 }], T(4), 'Free'), startedAt: T(4) };
    await advanceV5(['bb_bench_press'], BAND, [...history, free], seed, Date.parse(T(4)) + 1);
    const after = await currentV5Targets([...history, free], Date.parse(T(4)) + 1);
    expect(after['bb_bench_press'].weight).toBe(before['bb_bench_press'].weight); // no hold, no back-off, no raise
  });
});

describe('3 · never a funnel', () => {
  const screen = read('src/screens/history/FreeLog.tsx');
  it('saving a free log touches no trial, no completion, no paywall', () => {
    expect(screen).not.toContain('recordSessionCompleted');
    expect(screen).not.toContain('markWorkoutCompleted');
    expect(screen).not.toContain('Paywall');
    expect(screen).toContain('cloudAutoBackup'); // …but the record still reaches the cloud
  });

  it('the door exists in the ledger, the screen is registered, the gallery hosts it', () => {
    expect(read('src/screens/history/History.tsx')).toContain("t('history.freeLogDoor')");
    expect(read('src/app/Root.tsx')).toContain('component={FreeLogScreen}');
    expect(read('src/screens/dev/gallery.tsx')).toContain('FreeLogView');
  });

  it('the words exist in both of her languages', () => {
    const en = JSON.parse(read('src/i18n/locales/en.json'));
    const he = JSON.parse(read('src/i18n/locales/he.json'));
    for (const lang of [en, he]) {
      expect(lang.freeLog.title).toBeTruthy();
      expect(lang.freeLog.lede).toBeTruthy();
      expect(lang.freeLog.save).toBeTruthy();
      expect(lang.history.freeLogDoor).toBeTruthy();
    }
  });
});
