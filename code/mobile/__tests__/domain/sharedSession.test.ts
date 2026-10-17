/**
 * The shared session's pure half — `domain/sharedSession`.
 *
 * The design's promise is "perfect sync", and the only way to keep it is to have nothing to sync:
 * the wire carries STATE (how many sets each athlete has finished), never deltas, and everything
 * the two screens show is derived from those two vectors on both phones independently. These are
 * the tests that hold that claim up — including the ones that lose frames, duplicate them, and
 * deliver them backwards.
 */

//

import {
  SHARED_INTENT_TTL_MS,
  SHARED_PROGRESS_KEYS,
  SHARED_STALE_TURN_MS,
  acceptsFrame,
  frameIsStale,
  payloadIsWithinAllowList,
  readSharedBar,
  readSharedPlan,
  readSharedProgress,
  sharedDoneAgainstPlan,
  sharedPlanFromSteps,
  sharedRestEndsAt,
  sharedStanding,
  turnAtLift,
  type SharedPlan,
  type SharedProgress,
} from '@/domain/sharedSession';

const step = (exerciseId: string, exerciseSetIndex: number) => ({ exerciseId, exerciseSetIndex });

const progress = (over: Partial<SharedProgress> = {}): SharedProgress => ({
  v: 1,
  name: 'Dan',
  presence: 'resting',
  done: [],
  at: 1_000,
  ...over,
});

const PLAN: SharedPlan = { v: 1, lifts: [{ exerciseId: 'bench', sets: 4 }, { exerciseId: 'row', sets: 3 }] };

describe('the plan that travels is structure and nothing else', () => {
  it('contiguous runs become lifts, in order, counted', () => {
    const plan = sharedPlanFromSteps([
      step('bench', 0), step('bench', 1), step('bench', 2),
      step('row', 0), step('row', 1),
    ]);
    expect(plan).toEqual({ v: 1, lifts: [{ exerciseId: 'bench', sets: 3 }, { exerciseId: 'row', sets: 2 }] });
  });

  it('⛔ a warm-up bridge is nobody else’s business — negative set indices never travel', () => {
    const plan = sharedPlanFromSteps([
      step('bench', -2), step('bench', -1), // her ramp, to her load, at her moment
      step('bench', 0), step('bench', 1),
    ]);
    expect(plan.lifts).toEqual([{ exerciseId: 'bench', sets: 2 }]);
  });

  it('a lift the workout RETURNS to is a second station, not a merged one', () => {
    const plan = sharedPlanFromSteps([step('bench', 0), step('row', 0), step('bench', 1)]);
    expect(plan.lifts).toEqual([
      { exerciseId: 'bench', sets: 1 },
      { exerciseId: 'row', sets: 1 },
      { exerciseId: 'bench', sets: 1 },
    ]);
  });

  it('no load can even be expressed — the payload type is the fence', () => {
    const plan = sharedPlanFromSteps([step('bench', 0)]);
    expect(payloadIsWithinAllowList(plan)).toBe(true);
    expect(Object.keys(plan.lifts[0]).sort()).toEqual(['exerciseId', 'sets']);
  });
});

describe('her position, as the vector the wire carries', () => {
  const plan: SharedPlan = { v: 1, lifts: [{ exerciseId: 'bench', sets: 3 }, { exerciseId: 'row', sets: 2 }] };

  it('counts working sets per lift of the SHARED plan', () => {
    expect(sharedDoneAgainstPlan(plan, [])).toEqual([0, 0]);
    expect(sharedDoneAgainstPlan(plan, [{ exerciseId: 'bench', setIndex: 0 }])).toEqual([1, 0]);
    expect(sharedDoneAgainstPlan(plan, [
      { exerciseId: 'bench', setIndex: 0 },
      { exerciseId: 'bench', setIndex: 1 },
      { exerciseId: 'row', setIndex: 0 },
    ])).toEqual([2, 1]);
  });

  it('⛔ a warm-up bridge counts for nothing — it cannot buy her a turn', () => {
    expect(sharedDoneAgainstPlan(plan, [{ exerciseId: 'bench', setIndex: -1 }])).toEqual([0, 0]);
  });

  it('⛔ it never exceeds the lift — a phone one swap ahead cannot report five of four', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ exerciseId: 'bench', setIndex: i }));
    expect(sharedDoneAgainstPlan(plan, many)).toEqual([3, 0]);
  });

  it('a lift the workout visits TWICE fills its stations in order', () => {
    const twice: SharedPlan = {
      v: 1,
      lifts: [{ exerciseId: 'bench', sets: 2 }, { exerciseId: 'row', sets: 1 }, { exerciseId: 'bench', sets: 2 }],
    };
    const log = (n: number) => Array.from({ length: n }, (_, i) => ({ exerciseId: 'bench', setIndex: i }));
    expect(sharedDoneAgainstPlan(twice, log(1))).toEqual([1, 0, 0]);
    expect(sharedDoneAgainstPlan(twice, log(3))).toEqual([2, 0, 1]);
    expect(sharedDoneAgainstPlan(twice, log(9))).toEqual([2, 0, 2]);
  });

  it('⛔ the vector survives a plan the ATHLETE reordered under it', () => {
    // Her squat rack was busy, so her own workout moved that lift later. The pair's plan did not,
    // and the count is against the PAIR's plan — so the two phones still agree about what is done.
    const reordered = [{ exerciseId: 'row', setIndex: 0 }, { exerciseId: 'bench', setIndex: 0 }];
    expect(sharedDoneAgainstPlan(plan, reordered)).toEqual([1, 1]);
  });

  it('the vector and the plan are always the same length, by construction', () => {
    expect(sharedDoneAgainstPlan(plan, []).length).toBe(plan.lifts.length);
  });
});

describe('the turn is DERIVED, and it alternates', () => {
  it('host, guest, host, guest — the host takes every tie', () => {
    const seen: string[] = [];
    let h = 0;
    let g = 0;
    for (let i = 0; i < 8; i++) {
      const turn = turnAtLift(h, g, 4);
      if (turn == null) break;
      seen.push(turn);
      if (turn === 'host') h++;
      else g++;
    }
    expect(seen).toEqual(['host', 'guest', 'host', 'guest', 'host', 'guest', 'host', 'guest']);
    expect([h, g]).toEqual([4, 4]);
  });

  it('when one of them has finished the lift, the other simply keeps the bar', () => {
    expect(turnAtLift(4, 1, 4)).toBe('guest');
    expect(turnAtLift(1, 4, 4)).toBe('host');
    expect(turnAtLift(4, 4, 4)).toBeNull();
  });

  it('⛔ both phones compute the same answer from the same two numbers — there is nothing to agree on', () => {
    for (let h = 0; h <= 4; h++) {
      for (let g = 0; g <= 4; g++) {
        // The guest's phone holds the same pair of numbers, labelled the other way round; the
        // function is a function, so the answer cannot differ by which screen asked.
        expect(turnAtLift(h, g, 4)).toBe(turnAtLift(h, g, 4));
      }
    }
  });
});

describe('⛔ a partner can only LENGTHEN a rest, never shorten one', () => {
  it('he racks it early — she still rests every second the engine prescribed', () => {
    expect(sharedRestEndsAt(1_090_000, 1_040_000)).toBe(1_090_000);
  });

  it('he is still under the bar when her rest is up — she waits for him', () => {
    expect(sharedRestEndsAt(1_090_000, 1_120_000)).toBe(1_120_000);
  });

  it('the bar is busy and there is no instant to count to — null, never a guess', () => {
    expect(sharedRestEndsAt(1_090_000, null)).toBeNull();
  });

  it('the law, swept: the answer is NEVER earlier than her own rest', () => {
    for (let own = 0; own < 200_000; own += 7_919) {
      for (let freed = 0; freed < 200_000; freed += 6_131) {
        expect(sharedRestEndsAt(own, freed)!).toBeGreaterThanOrEqual(own);
      }
    }
  });
});

describe('the standing — where the pair is, drawn from two vectors', () => {
  const at = (over: Partial<Parameters<typeof sharedStanding>[0]> = {}) =>
    sharedStanding({ plan: PLAN, role: 'host', mine: null, theirs: null, nowMs: 1_000, ...over });

  it('a fresh pair opens at the first lift, and the host is up', () => {
    const s = at();
    expect(s.liftIndex).toBe(0);
    expect(s.exerciseId).toBe('bench');
    expect(s.turn).toBe('host');
    expect(s.mine).toBe(true);
    expect(s.mineSet).toEqual({ n: 1, m: 4 });
    expect(s.theirsSet).toEqual({ n: 1, m: 4 });
  });

  it('after her first set the bar is his, and her screen says so', () => {
    const s = at({ mine: progress({ done: [1] }), theirs: progress({ done: [0] }) });
    expect(s.turn).toBe('guest');
    expect(s.mine).toBe(false);
    expect(s.mineSet).toEqual({ n: 2, m: 4 });
    expect(s.theirsSet).toEqual({ n: 1, m: 4 });
  });

  it('the pair moves on only when BOTH have finished the lift', () => {
    expect(at({ mine: progress({ done: [4] }), theirs: progress({ done: [3] }) }).liftIndex).toBe(0);
    expect(at({ mine: progress({ done: [4] }), theirs: progress({ done: [4] }) }).liftIndex).toBe(1);
  });

  it('when the shared work is done there is no turn and no station', () => {
    const s = at({ mine: progress({ done: [4, 3] }), theirs: progress({ done: [4, 3] }) });
    expect(s.liftIndex).toBeNull();
    expect(s.turn).toBeNull();
    expect(s.exerciseId).toBeNull();
  });

  it('a SHORT vector is zero, not unknown — a phone that has not seen the new plan still draws', () => {
    const s = at({ mine: progress({ done: [4, 3] }), theirs: progress({ done: [4] }) });
    expect(s.liftIndex).toBe(1);
    expect(s.turn).toBe('guest');
    expect(s.theirsSet).toEqual({ n: 1, m: 3 });
  });

  it('a partner counting against an older plan is flagged, not ignored', () => {
    const plan = { ...PLAN, v: 2 };
    const s = sharedStanding({ plan, role: 'host', mine: progress({ v: 2 }), theirs: progress({ v: 1 }), nowMs: 1_000 });
    expect(s.behindOnPlan).toBe(true);
  });

  it('⛔ stale ONLY while the bar is his — a silent partner never interrupts her own set', () => {
    const long = SHARED_STALE_TURN_MS + 10_000;
    // His turn, and he has said nothing for four minutes → there is nobody to hand off to.
    expect(at({
      mine: progress({ done: [1] }),
      theirs: progress({ done: [0], at: 1_000 }),
      nowMs: 1_000 + long,
    }).stale).toBe(true);
    // Her turn. He is just as silent, and it changes nothing about the set in front of her.
    expect(at({
      mine: progress({ done: [0] }),
      theirs: progress({ done: [0], at: 1_000 }),
      nowMs: 1_000 + long,
    }).stale).toBe(false);
  });
});

describe('⛔ the wire carries state, so losing / duplicating / reordering frames costs nothing', () => {
  const plan = PLAN;
  const standing = (theirs: SharedProgress | null) =>
    sharedStanding({ plan, role: 'host', mine: progress({ done: [2] }), theirs, nowMs: 10_000 });

  it('a LOST frame self-heals — the next one carries the whole truth', () => {
    // He finished sets 1 and 2; the frame announcing set 1 never arrived.
    expect(standing(progress({ done: [2], at: 9_000 })).turn).toBe('host');
  });

  it('a DUPLICATED frame is refused, and would have been harmless anyway', () => {
    const held = progress({ done: [1], at: 5_000 });
    expect(acceptsFrame(held, { ...held })).toBe(false);
    expect(standing(held)).toEqual(standing({ ...held }));
  });

  it('an OUT-OF-ORDER frame is dropped on the floor', () => {
    const held = progress({ done: [2], at: 9_000 });
    expect(acceptsFrame(held, progress({ done: [1], at: 5_000 }))).toBe(false);
    expect(acceptsFrame(held, progress({ done: [3], at: 12_000 }))).toBe(true);
  });

  it('⛔ a partner one plan behind is still HEARD — being ignored has no end, and this did not', () => {
    // She swapped a lift; his frames still say v1. Dropping them would freeze him on her screen for
    // the rest of the workout, because the only thing that could unfreeze him is a frame she refuses.
    const held = progress({ v: 2, done: [1], at: 9_000 });
    expect(acceptsFrame(held, progress({ v: 1, done: [3], at: 99_000 }))).toBe(true);
    // …and `sharedStanding` is where that mismatch is judged, one layer up from the transport.
    expect(sharedStanding({
      plan: { ...PLAN, v: 2 }, role: 'host',
      mine: progress({ v: 2 }), theirs: progress({ v: 1 }), nowMs: 1_000,
    }).behindOnPlan).toBe(true);
  });

  it('the same instant read against a newer plan is the newer reading', () => {
    const held = progress({ v: 1, done: [1], at: 9_000 });
    expect(acceptsFrame(held, progress({ v: 2, done: [1], at: 9_000 }))).toBe(true);
    expect(acceptsFrame(held, progress({ v: 1, done: [3], at: 9_000 }))).toBe(false);
  });

  it('the first frame is always accepted', () => {
    expect(acceptsFrame(null, progress())).toBe(true);
  });

  it('a frame older than the wrist’s own TTL is not acted on', () => {
    expect(frameIsStale(1_000, 1_000 + SHARED_INTENT_TTL_MS - 1)).toBe(false);
    expect(frameIsStale(1_000, 1_000 + SHARED_INTENT_TTL_MS + 1)).toBe(true);
  });
});

describe('⛔ the fence — no key this file did not name may leave the phone', () => {
  it('a legitimate frame passes', () => {
    expect(payloadIsWithinAllowList(progress({ done: [1, 2], bar: { exerciseId: 'bench', kg: 40, reps: 8 } }))).toBe(true);
    expect(payloadIsWithinAllowList(PLAN)).toBe(true);
  });

  it('a load, a bodyweight, a history — none of them can ride along', () => {
    for (const smuggled of ['actualWeight', 'bodyweight', 'tonnage', 'history', 'oneRepMax', 'email']) {
      expect({ smuggled, ok: payloadIsWithinAllowList({ ...progress(), [smuggled]: 1 }) })
        .toEqual({ smuggled, ok: false });
    }
  });

  it('…including nested, and including inside the arrays', () => {
    expect(payloadIsWithinAllowList({ v: 1, lifts: [{ exerciseId: 'b', sets: 3, loadKg: 60 }] })).toBe(false);
    expect(payloadIsWithinAllowList({ v: 1, bar: { exerciseId: 'bench', kg: 40, reps: 8, best: 100 } })).toBe(false);
  });

  it('the allow-list is exactly the six fields the header answers for', () => {
    expect([...SHARED_PROGRESS_KEYS].sort()).toEqual(['at', 'bar', 'done', 'name', 'presence', 'v']);
  });
});

describe('what arrives is rebuilt field by field, or refused', () => {
  it('an unknown key does not survive the trip', () => {
    const read = readSharedProgress({ ...progress(), done: [1], secret: 'x', actualWeight: 95 });
    expect(read).toEqual({ v: 1, name: 'Dan', presence: 'resting', done: [1], at: 1_000 });
    expect(payloadIsWithinAllowList(read)).toBe(true);
  });

  it('a first name only, bounded — the circle’s own rule, kept here too', () => {
    expect(readSharedProgress(progress({ name: 'x'.repeat(80) }))!.name).toHaveLength(20);
    expect(readSharedProgress(progress({ name: '   ' }))).toBeNull();
  });

  it('a presence that is not one of the four words is refused outright', () => {
    expect(readSharedProgress({ ...progress(), presence: 'crushing it' })).toBeNull();
  });

  it('a malformed vector is refused rather than half-read', () => {
    expect(readSharedProgress({ ...progress(), done: [1, 'two'] })).toBeNull();
    expect(readSharedProgress({ ...progress(), done: [-1] })).toBeNull();
    expect(readSharedProgress({ ...progress(), done: null })).toBeNull();
    expect(readSharedProgress(null)).toBeNull();
  });

  it('the bar is bounded at both ends, and absent when it is nonsense', () => {
    expect(readSharedBar({ exerciseId: 'bench', kg: 42.5, reps: 8 })).toEqual({ exerciseId: 'bench', kg: 42.5, reps: 8 });
    expect(readSharedBar({ exerciseId: 'bench', kg: 900, reps: 8 })).toBeUndefined();
    expect(readSharedBar({ exerciseId: 'bench', kg: -5, reps: 8 })).toBeUndefined();
    expect(readSharedBar({ exerciseId: 'bench', kg: 40 })).toBeUndefined();
    expect(readSharedBar(undefined)).toBeUndefined();
  });

  it('⛔ a bar that does not name its lift is not a bar — the reader could not place it', () => {
    expect(readSharedBar({ kg: 42.5, reps: 8 })).toBeUndefined();
    expect(readSharedBar({ exerciseId: '  ', kg: 42.5, reps: 8 })).toBeUndefined();
  });

  it('a bar she chose not to send simply is not there, and the frame is still good', () => {
    const read = readSharedProgress({ ...progress(), done: [1] });
    expect(read).not.toBeNull();
    expect(read!.bar).toBeUndefined();
  });

  it('a plan is refused unless every lift is whole', () => {
    expect(readSharedPlan(PLAN)).toEqual(PLAN);
    expect(readSharedPlan({ v: 1, lifts: [{ exerciseId: 'b', sets: 0 }] })).toBeNull();
    expect(readSharedPlan({ v: 1, lifts: [{ sets: 3 }] })).toBeNull();
    expect(readSharedPlan({ v: 1, lifts: [] })).toBeNull();
    expect(readSharedPlan({ lifts: [{ exerciseId: 'b', sets: 3 }] })).toBeNull();
  });
});

describe('a whole workout, set by set, on both phones at once', () => {
  it('two vectors and one plan carry a pair from the first bench set to the last row', () => {
    const plan: SharedPlan = { v: 1, lifts: [{ exerciseId: 'bench', sets: 3 }, { exerciseId: 'row', sets: 2 }] };
    let host = progress({ name: 'Ofek', done: [0, 0], at: 0 });
    let guest = progress({ name: 'Dan', done: [0, 0], at: 0 });
    const order: string[] = [];

    for (let tick = 1; tick <= 20; tick++) {
      // BOTH phones derive independently, from the same facts, labelled from each side.
      const onHost = sharedStanding({ plan, role: 'host', mine: host, theirs: guest, nowMs: tick });
      const onGuest = sharedStanding({ plan, role: 'guest', mine: guest, theirs: host, nowMs: tick });
      // ⛔ The two screens never disagree about whose turn it is.
      expect(onHost.turn).toBe(onGuest.turn);
      expect(onHost.liftIndex).toBe(onGuest.liftIndex);
      if (onHost.turn == null) {
        expect([onHost.mine, onGuest.mine]).toEqual([false, false]); // nobody is up; the work is done
        break;
      }
      // ⛔ EXACTLY ONE of them is holding the bar, on every tick, from both sides of the wire.
      expect([onHost.mine, onGuest.mine].filter(Boolean)).toHaveLength(1);

      const i = onHost.liftIndex!;
      order.push(`${plan.lifts[i].exerciseId}:${onHost.turn}`);
      if (onHost.turn === 'host') {
        const done = [...host.done];
        done[i] += 1;
        host = { ...host, done, at: tick };
      } else {
        const done = [...guest.done];
        done[i] += 1;
        guest = { ...guest, done, at: tick };
      }
    }

    expect(order).toEqual([
      'bench:host', 'bench:guest', 'bench:host', 'bench:guest', 'bench:host', 'bench:guest',
      'row:host', 'row:guest', 'row:host', 'row:guest',
    ]);
    expect(host.done).toEqual([3, 2]);
    expect(guest.done).toEqual([3, 2]);
  });
});

/**
 * ⛔ THE COMMUNITY IS A SUM, NOT A TABLE (founder ruling, 2026-08-31 — see `domain/circle`).
 *
 * Filed here rather than beside the circle's own tests because it is the pair's half of that
 * decision: `togetherCount` reads `Session.partners`, which only a shared session ever writes.
 */
describe('the week, between them', () => {
  const { circleWeekTotal, togetherCount } = jest.requireActual('@/domain/circle');
  const member = (name: string, done: number) => ({ name, done, planned: 4, at: 1 });

  it('one number for everyone, and the count of people it is for', () => {
    expect(circleWeekTotal([member('Ofek', 3), member('Dan', 2), member('Yael', 4)]))
      .toEqual({ done: 9, people: 3 });
  });

  it('an empty circle is zero, not a hole', () => {
    expect(circleWeekTotal([])).toEqual({ done: 0, people: 0 });
  });

  it('⛔ nothing in the answer can be read as a ranking — it is two numbers, not a list', () => {
    expect(Object.keys(circleWeekTotal([member('Ofek', 9), member('Dan', 1)])).sort())
      .toEqual(['done', 'people']);
  });

  const sess = (startedAt: string, partners?: string[]) =>
    ({ id: startedAt, programDayId: 'd', startedAt, state: 'SAVED', earlyFinish: false, sets: [], ...(partners ? { partners } : {}) });

  it('counts the workouts she did WITH somebody, and names them once each', () => {
    const since = Date.parse('2026-08-01T00:00:00.000Z');
    expect(togetherCount([
      sess('2026-08-04T10:00:00.000Z', ['Dan']),
      sess('2026-08-06T10:00:00.000Z', ['Dan']),
      sess('2026-08-08T10:00:00.000Z', ['Yael']),
      sess('2026-08-09T10:00:00.000Z'),                 // solo — not a shared workout
      sess('2026-07-30T10:00:00.000Z', ['Dan']),        // last month
    ], since)).toEqual({ count: 3, names: ['Dan', 'Yael'] });
  });

  it('no shared workouts is an honest zero with nobody in it', () => {
    expect(togetherCount([sess('2026-08-04T10:00:00.000Z')], 0)).toEqual({ count: 0, names: [] });
  });
});
