/**
 * Bodyweight graduation (S6, approved 2026-07-05). A bodyweight lift has no load axis: once
 * it holds the TOP of its rep range for the athlete's stall window, the integration layer
 * swaps it to its harder catalog variation (knee push-up → push-up → dip; chin-up → pull-up)
 * via the slot-durable swap, surfaced through explain.graduate. LOCKED never graduates (I-7);
 * bodyweight slots never calibrate (calibration tunes load — an overshooter could never exit).
 */
import { maybeAdvance, toEngineProfile, getWeeklyUpdate } from '@/engine/v4/v4Engine';
import type { SlotState } from '@/engine/v4/types';
import { db } from '@/data/local/db';
import type { Program, Session, SetLog } from '@/data/local/models';

const DAY_MS = 24 * 60 * 60 * 1000;

// One-day program whose only engine slot is the chin-up (harder: pull_up). freq 1 → one
// session = one engine week. Novice stall window = 2.
const program: Program = {
  id: 'p_grad',
  frequency: 1,
  days: [
    {
      id: 'day_0',
      key: '0',
      name: 'Pull',
      muscleGroups: ['Back'],
      isRest: false,
      slots: [{ capability: 'horizontal_pull', exerciseId: 'chin_up', setCount: 3 }],
    },
  ],
};

const eprofile = toEngineProfile({
  sex: 'male', age: 25, weightKg: 75, experience: 'beginner', goal: 'build_muscle', daysPerWeek: 1,
});

const seedFor = () => null; // bodyweight — no seed

function chinUpSession(weekIdx: number, reps: number, target: number): Session {
  const startedAt = new Date(Date.now() - (10 - weekIdx) * DAY_MS).toISOString();
  const sets: SetLog[] = [0, 1, 2].map((s) => ({
    exerciseId: 'chin_up',
    setIndex: s,
    recommendedWeight: null,
    recommendedReps: target,
    actualWeight: null,
    actualReps: reps,
    edited: false,
    persistedAt: startedAt,
  }));
  return { id: `grad_wk${weekIdx}`, programDayId: 'day_0', startedAt, state: 'SAVED', earlyFinish: false, sets };
}

async function slotState(): Promise<SlotState> {
  const state = await db.loadEngineV4();
  return Object.values(state!.slots)[0] as SlotState;
}

beforeEach(async () => {
  await db.clearAll();
});

describe('bodyweight graduation', () => {
  it('a chin-up held past the range top for the stall window graduates to the pull-up', async () => {
    // 4 weeks of 13-rep chin-ups (top of [8,12] with room every week). The rep target climbs
    // 8→12; the moment it sits at the top with a ≥2-week top streak (novice window), the
    // slot graduates — on the LAST processed week, so the Weekly Update carries it.
    // History is newest-first.
    const history: Session[] = [];
    for (let wk = 0; wk < 4; wk++) history.unshift(chinUpSession(wk, 13, 8 + Math.min(wk, 4)));

    await maybeAdvance(program, eprofile, history, seedFor);

    const slot = await slotState();
    expect(slot.current_exercise_id).toBe('pull_up'); // graduated up the ladder
    expect(slot.calibrating).toBe(false); // bodyweight never calibrates
    expect(slot.rep_target).toBe(8); // fresh scheme — the harder lift re-earns its reps
    expect(slot.current_sets).toBe(3); // the slot keeps its volume

    const update = await getWeeklyUpdate();
    const keys = update!.explanations.map((e) => e.text.key);
    expect(keys).toContain('explain.graduate.text');
  });

  it('a LOCKED slot never graduates (I-7)', async () => {
    const history: Session[] = [];
    for (let wk = 0; wk < 5; wk++) history.unshift(chinUpSession(wk, 13, 8 + Math.min(wk, 4)));

    await maybeAdvance(program, eprofile, history, seedFor, new Set(['0:VERTICAL_PULL#0']));

    const slot = await slotState();
    expect(slot.current_exercise_id).toBe('chin_up'); // held — the athlete's stated choice
  });

  it('below the streak window the lift holds at the top (no premature swap)', async () => {
    // Only 1 week at the top → novice window (2) not met.
    const history: Session[] = [];
    // Weeks 0..3 climb the target (8→12) at exactly-target reps: no top-of-range streak.
    for (let wk = 0; wk < 4; wk++) history.unshift(chinUpSession(wk, 8 + Math.min(wk + 1, 4), 8 + Math.min(wk, 4)));

    await maybeAdvance(program, eprofile, history, seedFor);

    const slot = await slotState();
    expect(slot.current_exercise_id).toBe('chin_up');
  });
});
