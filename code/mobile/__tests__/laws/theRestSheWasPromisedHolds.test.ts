/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE REST SHE WAS PROMISED HOLDS — ON EVERY WEEK, NOT ONLY ON ONE THE ENGINE MAY REBUILD (2026-10-17)
 *
 * She reports pain and is told *"העבודה על ה{{muscle}} נחה ל־{{days}} ימים — ואז היא חוזרת מעצמה."*
 * The workout she was standing in kept that promise. The next one did not: later workouts were
 * protected only by a programme rebuild, and `engineMayRebuild` refuses every week she, a coach or
 * the model wrote — which is every week since 2026-09-28. So the next shoulder day opened on the
 * press she had just said hurt. Found while asking what an AI week does over time.
 *
 * `domain/restingToday` leaves the resting lifts out of the workout she STARTS while the window is
 * open, by the same table that decides it mid-workout. Her week itself is never rewritten.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';

import { planWithoutResting, restingLifts, sessionWithoutResting } from '@/domain/restingToday';
import { easeFor, liftsForbiddenNow } from '@/domain/painReport';
import { exerciseById } from '@/data/exercises';
import type { PlannedSession, RepsItem } from '@/domain/coachPlan';

const MOBILE = path.join(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(MOBILE, rel), 'utf8').replace(/\r\n/g, '\n');

const NOW = Date.UTC(2026, 9, 17, 9);
const DAY = 86_400_000;
const item = (ex: string): RepsItem => ({ kind: 'reps', ex, reps: [8, 12], load: 20 });
const block = (...ex: string[]) => ({ rounds: 3, items: ex.map(item) });
const shoulderDay: PlannedSession = {
  name: 'Upper',
  blocks: [block('bb_overhead_press'), block('bb_bench_press'), block('lateral_raise', 'face_pull'), block('lat_pulldown')],
};
const lifts = (s: PlannedSession) => s.blocks.flatMap((b) => b.items.map((i) => i.ex));

describe('1 · the workout she starts leaves out what her pain rests', () => {
  it('a hurt shoulder takes the overhead press and the raise out — the rest of the day stands', () => {
    const eases = [easeFor('Shoulders', 'pain', NOW - 2 * DAY)];
    const today = sessionWithoutResting(shoulderDay, eases, NOW);
    expect(lifts(today)).toEqual(['bb_bench_press', 'face_pull', 'lat_pulldown']);
  });

  it('a superset that loses one lift is a straight set of the other — never a couple with a stranger', () => {
    const today = sessionWithoutResting(shoulderDay, [easeFor('Shoulders', 'pain', NOW)], NOW);
    const pulls = today.blocks.find((b) => b.items.some((i) => i.ex === 'face_pull'))!;
    expect(pulls.items.map((i) => i.ex)).toEqual(['face_pull']);
    expect(pulls.rounds).toBe(3);
  });

  it('the same table as the workout she is IN — today and every day of the window agree', () => {
    for (const severity of ['twinge', 'pain', 'sharp'] as const) {
      const eases = [easeFor('Shoulders', severity, NOW)];
      const mid = liftsForbiddenNow(lifts(shoulderDay), eases, NOW, (id) => exerciseById(id)?.pattern);
      expect([...restingLifts(lifts(shoulderDay), eases, NOW)].sort()).toEqual([...new Set(mid)].sort());
    }
  });

  it('the window closes and the lift comes back on its own — nothing was rewritten to undo', () => {
    const eases = [easeFor('Shoulders', 'twinge', NOW - 30 * DAY)];
    expect(sessionWithoutResting(shoulderDay, eases, NOW)).toBe(shoulderDay);
    expect(sessionWithoutResting(shoulderDay, undefined, NOW)).toBe(shoulderDay);
  });

  it('⚠️ never the whole day — a day whose every lift rests is left as written', () => {
    const allShoulder: PlannedSession = { name: 'S', blocks: [block('bb_overhead_press'), block('lateral_raise')] };
    expect(sessionWithoutResting(allShoulder, [easeFor('Shoulders', 'pain', NOW)], NOW)).toBe(allShoulder);
  });

  it('a whole week as Today reads it: every workout filtered, the same object when nothing rests', () => {
    const week = { v: 2 as const, sessions: [shoulderDay, { name: 'Legs', blocks: [block('bb_back_squat')] }] };
    expect(planWithoutResting(week, [], NOW)).toBe(week);
    const rested = planWithoutResting(week, [easeFor('Shoulders', 'pain', NOW)], NOW)!;
    expect(lifts(rested.sessions[0]!)).toEqual(['bb_bench_press', 'face_pull', 'lat_pulldown']);
    expect(rested.sessions[1]).toBe(week.sessions[1]);
  });
});

describe('2 · every door reads it — what she is shown is what she is asked to do', () => {
  const store = read('src/state/stores/sessionStore.tsx');

  it('both session starts leave the resting lifts out', () => {
    expect(store).toContain('const toRun = sessionWithoutResting(planned, appRef.current?.profile?.painEases, Date.now());');
    expect(store).toContain('const plan2 = buildPlanFromCoach(toRun);');
    expect(store).toContain('const resting = restingLifts(written.map((st) => st.exerciseId), appRef.current?.profile?.painEases, Date.now());');
  });

  it('Today and the pre-workout card draw the same workout', () => {
    expect(read('src/screens/home/Home.tsx')).toContain('coachRows(planWithoutResting(coachPlan, painEases, Date.now()), todayId)');
    expect(read('src/screens/plan/PreWorkoutScreen.tsx')).toContain('const today = sessionWithoutResting(swapped, painEases, Date.now());');
  });

  it('…and her written week is never touched: nothing here saves a programme or a plan', () => {
    const src = read('src/domain/restingToday.ts');
    for (const write of ['db.', 'saveProgram', 'saveCoachPlan']) expect(src).not.toContain(write);
  });
});
