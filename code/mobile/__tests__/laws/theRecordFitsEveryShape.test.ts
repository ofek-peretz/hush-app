// @ts-nocheck
// 
import { coachFacts } from '@/domain/coachFacts';
import type { ItemResult, Profile, Program, Session } from '@/data/local/models';

/**
 * ════ THE RECORD FITS EVERY SHAPE ════
 *
 * `SetLog` requires reps and carries a weight, so a 45-second plank could not be written down at
 * all — and neither could a 400 m repeat, a 40 m carry, or five minutes of mobility. The stage
 * learned to run those; without a record that holds them, the new shapes are a demo.
 *
 * The failure this guards against is not a crash. It is the LIE: writing a plank as `0 reps at
 * 0 kg` so it fits the old shape. That record then flows into the coach's sheet, the history, the
 * milestones and the tonnage, and every one of them is quietly wrong in a way nothing detects.
 *
 * The invariant while `sets` still exists (it dies with `SetTarget[]`, one migration, not two):
 * every REPS item may appear in `sets`, and no other shape may appear there ever.
 */

const profile: Profile = {
  sex: 'female', weightKg: 62, units: 'kg', daysPerWeek: 4, healthConnected: false,
};
const program: Program = { id: 'p', frequency: 4, days: [] };

/** A mixed session: a lift, a plank, a loaded carry, a run repeat, and some mobility. */
const items: ItemResult[] = [
  { kind: 'reps', ex: 'bb_bench_press', block: 1, round: 1, position: 1, load: 30, reps: 12, at: '2026-07-31T17:00:00.000Z', restBeforeS: 120 },
  { kind: 'time', ex: 'plank', block: 2, round: 1, position: 1, seconds: 38, askedSeconds: 45, at: '2026-07-31T17:10:00.000Z' },
  { kind: 'distance', ex: 'farmer_carry', block: 3, round: 1, position: 1, metres: 40, askedMetres: 40, load: 24, at: '2026-07-31T17:14:00.000Z' },
  { kind: 'distance', ex: 'run_outdoor', block: 4, round: 2, position: 1, metres: 400, askedMetres: 400, seconds: 84, activityId: 'act-1', at: '2026-07-31T17:20:00.000Z' },
  { kind: 'open', ex: 'mobility', block: 5, round: 1, position: 1, at: '2026-07-31T17:30:00.000Z' },
];

const session: Session = {
  id: 's1', programDayId: 'd1', startedAt: '2026-07-31T17:00:00.000Z',
  state: 'SAVED', earlyFinish: false, trained: true,
  // Only the REPS item has a `SetLog`. This is the invariant, written down.
  sets: [{
    exerciseId: 'bb_bench_press', setIndex: 0, recommendedWeight: 30, recommendedReps: 8,
    actualWeight: 30, actualReps: 12, edited: false, restBeforeS: 120,
    persistedAt: '2026-07-31T17:00:00.000Z',
  }],
  items,
};

const facts = () => coachFacts({ profile, plan: null, history: [session], justFinished: session });

describe('the record fits every shape', () => {
  it('carries all five items to the coach, not just the one that was reps', () => {
    const work = facts().session!.work!;
    expect(work.map((w) => w.kind)).toEqual(['reps', 'time', 'distance', 'distance', 'open']);
    expect(work.map((w) => w.name)).toEqual([
      'Barbell Bench Press', 'Plank', 'Farmer’s Carry', 'Run', 'Mobility',
    ]);
  });

  it('states what she DID against what was ASKED, in each shape\'s own number', () => {
    const work = facts().session!.work!;
    const by = (ex: string) => work.find((w) => w.ex === ex)!;
    // The plank is the case the old record could not hold: 38 seconds of a 45-second ask. The gap
    // IS the signal, and writing it as "0 reps" would have destroyed it.
    expect({ did: by('plank').did, asked: by('plank').asked }).toEqual({ did: 38, asked: 45 });
    expect({ did: by('farmer_carry').did, asked: by('farmer_carry').asked }).toEqual({ did: 40, asked: 40 });
    expect(by('farmer_carry').load).toBe(24);
    expect(by('bb_bench_press').did).toBe(12);
  });

  it('carries how long a measured distance took, and never invents one', () => {
    const work = facts().session!.work!;
    expect(work.find((w) => w.ex === 'run_outdoor')!.seconds).toBe(84);
    expect('seconds' in work.find((w) => w.ex === 'farmer_carry')!).toBe(false);
  });

  it('gives an `open` item no number at all', () => {
    const mobility = facts().session!.work!.find((w) => w.ex === 'mobility')!;
    expect('did' in mobility).toBe(false);
    expect('asked' in mobility).toBe(false);
    expect('load' in mobility).toBe(false);
  });

  it('keeps where each item sat, so a round can be told from a repeat', () => {
    const run = facts().session!.work!.find((w) => w.ex === 'run_outdoor')!;
    // The second 400 of an interval block, not the first — a coach reading six identical repeats
    // with no round number cannot tell which one faded.
    expect({ block: run.block, round: run.round, position: run.position })
      .toEqual({ block: 4, round: 2, position: 1 });
  });

  it('NEVER writes a non-reps shape into `sets` — a plank is not zero reps at zero kg', () => {
    // The lie this type exists to prevent. `sets` may hold reps items and nothing else, for as long
    // as it survives at all.
    const repsIds = new Set(items.filter((i) => i.kind === 'reps').map((i) => i.ex));
    for (const set of session.sets) {
      expect({ ex: set.exerciseId, isRepsWork: repsIds.has(set.exerciseId) })
        .toEqual({ ex: set.exerciseId, isRepsWork: true });
    }
    expect(session.sets.length).toBe(items.filter((i) => i.kind === 'reps').length);
  });

  it('says nothing about `work` on a session recorded before it existed', () => {
    const { items: _dropped, ...legacy } = session;
    const f = coachFacts({ profile, plan: null, history: [legacy], justFinished: legacy });
    // Absent, not empty: an old session did not do zero non-rep items, we simply did not record it.
    expect('work' in f.session!).toBe(false);
    expect(f.session!.lifts.length).toBe(1); // and the rep half still reads exactly as before
  });
});
