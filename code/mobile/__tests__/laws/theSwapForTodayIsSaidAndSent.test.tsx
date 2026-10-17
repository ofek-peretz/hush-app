/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SWAP FOR TODAY IS SAID, SENT, AND NEVER WRITTEN — and the coach's note reaches the bar.
 * (the coach track, trainee screens — 2026-09-17)
 *
 * ⛔ RULING 4: *"the trainee may swap a lift for TODAY only, and the coach sees the swap."* Before
 * these screens, a swap on the pre-workout card of a linked coach's week was refused by the store
 * and the card said nothing: she picked a lift, the sheet closed, the row stood. Now:
 *
 *   1. the card SAYS it — the sheet's head reads "swap for today", the row names the lift it
 *      replaced, a line says the week stays and the coach sees it;
 *   2. Begin starts the session with the swap (`swapForToday`) and records it on the session
 *      (`Session.todaySwaps`) — the programme on disk is never read for writing;
 *   3. the upload tells the coach even when the replacement is from another muscle, which the
 *      derivation alone (`swapLearning.extractOccurrences`) could never have seen;
 *   4. the drag is not offered on a linked coach's week at all.
 *
 * ⛔ LAW 7: a coach's note travels Slot → CoachPlan item → the card row → the set stage, attributed.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import fs from 'fs';
import path from 'path';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initI18n, tg } from '@/i18n';
import { sessionToUpload, wireToProgram } from '@/domain/coachTrack';
import { coachPlanFromProgram } from '@/domain/enginePlan';
import { coachPlanRows, coachRows, coachSession } from '@/domain/coachWeek';
import { swapForToday } from '@/domain/coachTrackAthlete';
import { buildPlanFromCoach } from '@/state/stores/sessionStore';
import { PreWorkoutView } from '@/screens/plan/PreWorkout';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

beforeAll(async () => {
  await initI18n();
});

const week = () =>
  wireToProgram({
    version: 3,
    sentAt: '2026-09-17T08:00:00.000Z',
    coachName: 'Dana',
    week: {
      v: 1,
      days: [
        { name: 'Upper', lifts: [{ ex: 'bb_bench_press', sets: 4, band: [6, 8], note: 'Shoulder blades back' }, { ex: 'bb_row', sets: 3, band: [8, 10] }] },
      ],
    },
  }).program;

const set = (exerciseId: string, i: number) => ({
  exerciseId, setIndex: i, recommendedWeight: 50, recommendedReps: 8, actualWeight: 50, actualReps: 8, edited: false,
  persistedAt: `2026-09-17T17:0${i}:00.000Z`,
});

describe('⛔ ruling 4 — the coach sees the swap for today', () => {
  it('a stated swap to another muscle reaches the upload; without the record it would have read as a skip', () => {
    const base = { id: 's1', programDayId: 'coach_0', startedAt: '2026-09-17T17:00:00.000Z', state: 'SAVED', earlyFinish: false,
      sets: [set('bb_bench_press', 0), set('bb_back_squat', 1)] };
    const consent = { bodyweight: false, cardio: false };

    const derivedOnly = sessionToUpload(base, week(), consent);
    expect(derivedOnly.swaps).toBeUndefined();
    expect(derivedOnly.skipped).toEqual(['bb_row']);

    const stated = sessionToUpload({ ...base, todaySwaps: [{ from: 'bb_row', to: 'bb_back_squat' }] }, week(), consent);
    expect(stated.swaps).toEqual([{ from: 'bb_row', to: 'bb_back_squat' }]);
    expect(stated.skipped).toBeUndefined();
    expect(stated.weekVersion).toBe(3);
  });

  it('a stated swap she never trained is not reported — the upload says what happened', () => {
    const u = sessionToUpload(
      { id: 's2', programDayId: 'coach_0', startedAt: '2026-09-17T17:00:00.000Z', state: 'SAVED', earlyFinish: false,
        sets: [set('bb_bench_press', 0)], todaySwaps: [{ from: 'bb_row', to: 'db_row' }] },
      week(),
      { bodyweight: false, cardio: false },
    );
    expect(u.swaps).toBeUndefined();
    expect(u.skipped).toEqual(['bb_row']);
  });

  it('the card starts the session with the swap and records it — and never declares it on a coach’s week', () => {
    const card = read('src/screens/plan/PreWorkoutScreen.tsx');
    // both pickers: the locked branch returns before the week-editing declaration
    const branches = card.split('if (coachLocked) {\n                swapToday(from, toId);\n                return;\n              }');
    expect(branches.length - 1).toBe(2);
    for (const after of branches.slice(1)) expect(after.indexOf('swapToday')).not.toBe(0);
    expect(card).toMatch(/const planned = todaySwaps\.length \? swapForToday\(written, todaySwaps\) : written;/);
    expect(card).toMatch(/session\.startCoach\(planned, workout\.id, undefined, swapped\.length \? \{ todaySwaps: swapped \} : undefined\)/);
    // the drag is not offered at all
    expect(card).toMatch(/onReorder=\{[\s\S]{0,200}\|\| coachLocked/);
    // the lock is asked of the disk, like every other gate
    expect(card).toContain('setCoachLocked(weekIsLockedToCoach(program, !!link));');
    // the session stamps what it was handed
    expect(read('src/state/stores/sessionStore.tsx')).toContain('...(opts?.todaySwaps && opts.todaySwaps.length > 0 ? { todaySwaps:');
  });

  it('the card says it: today only, the week untouched, the coach told', () => {
    let r;
    act(() => {
      r = renderer.create(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } }}>
          <PreWorkoutView
            name="Upper"
            lifts={[{ exerciseId: 'db_row', name: 'Dumbbell Row', load: null, sets: 3, band: [8, 10] }]}
            units="kg"
            figure="female"
            onForm={() => {}}
            onStart={() => {}}
            onClose={() => {}}
            coachName="Dana"
            insteadOf={{ db_row: 'Barbell Row' }}
            onUndoSwaps={() => {}}
          />
        </SafeAreaProvider>,
      );
    });
    const all = r.root.findAllByType(Text).map((n) => [].concat(n.props.children).filter((x) => typeof x === 'string').join(''));
    expect(all).toContain(tg('coachTrack.athlete.swapTodayNote'));
    expect(all.some((s) => s.includes('Barbell Row'))).toBe(true);
    expect(all).toContain(tg('coachTrack.athlete.swapUndo'));
    act(() => r.unmount());
  });
});

describe('⛔ law 7 — the coach’s note reaches the card and the bar, attributed', () => {
  it('Slot → CoachPlan item → card row → the running step', () => {
    const plan = coachPlanFromProgram(week());
    const s = coachSession(plan, 'coach_0');
    expect(s.blocks[0].items[0].coachNote).toBe('Shoulder blades back');
    expect(coachRows(plan, 'coach_0')[0].coachNote).toBe('Shoulder blades back');
    expect(coachPlanRows(coachRows(plan, 'coach_0'), 'kg')[0].coachNote).toBe('Shoulder blades back');
    expect(buildPlanFromCoach(s)[0].item.coachNote).toBe('Shoulder blades back');
    // a lift she swapped away carries no note written about the other one
    expect(swapForToday(s, [{ from: 'bb_bench_press', to: 'db_bench_press' }]).blocks[0].items[0].coachNote).toBeUndefined();
    // the note is never on a week nobody wrote
    const engineDay = { ...week(), authored: 'engine', days: week().days.map((d) => ({ ...d, slots: d.slots.map(({ coachNote, ...x }) => x) })) };
    expect(coachSession(coachPlanFromProgram(engineDay), 'coach_0').blocks[0].items[0].coachNote).toBeUndefined();
  });

  it('the card and the stage draw it with the coach’s name', () => {
    let r;
    act(() => {
      r = renderer.create(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } }}>
          <PreWorkoutView
            name="Upper"
            lifts={[{ exerciseId: 'bb_bench_press', name: 'Bench', load: 80, sets: 4, band: [6, 8], coachNote: 'Shoulder blades back' }]}
            units="kg"
            figure="female"
            onForm={() => {}}
            onStart={() => {}}
            onClose={() => {}}
            coachName="Dana"
          />
        </SafeAreaProvider>,
      );
    });
    const all = r.root.findAllByType(Text).map((n) => [].concat(n.props.children).filter((x) => typeof x === 'string').join(''));
    expect(all.some((x) => x.includes('Shoulder blades back') && x.includes('Dana'))).toBe(true);
    act(() => r.unmount());

    const stage = read('src/screens/session/SessionFlow.tsx');
    expect(stage).toContain('<CoachNoteLine note={session.currentItem?.coachNote} coachName={coachName} lines={2}');
    // asked of the DISK: the store boots with no programme, so `app.program` cannot say who wrote the week
    expect(stage).toContain('const coachName = useCoachWeekOwner().coachName;');
    expect(read('src/state/useCoachWeekOwner.ts')).toMatch(/db\s*\.loadProgram\(\)/);
  });
});
