/**
 * HTTP ModelClient ↔ backend mapping (API contract §5/§6/§7). Validates the
 * adapter against the wire shapes (BlockOut/SessionOut) and the per-set report
 * payload, without a live backend.
 */
jest.mock('@/data/api/config', () => ({
  getBaseUrl: () => 'http://test',
  getToken: async () => 'tok',
}));

import { HttpModelClient } from '@/data/api/httpClient';
import type { ActualSet } from '@/data/api/modelClient';
import { setUnauthorizedHandler } from '@/data/api/authEvents';

describe('401 signals revocation (founder decision)', () => {
  it('notifies the unauthorized handler on any 401 from an authed request', async () => {
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    (global as { fetch: jest.Mock }).fetch = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(new HttpModelClient().getProfile()).rejects.toMatchObject({ kind: 'unauthorized', status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    setUnauthorizedHandler(null);
  });

  it('classifies a 5xx as a (transient) server error and does NOT revoke', async () => {
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    (global as { fetch: jest.Mock }).fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    await expect(new HttpModelClient().getProfile()).rejects.toMatchObject({ kind: 'server' });
    expect(onUnauthorized).not.toHaveBeenCalled();
    setUnauthorizedHandler(null);
  });

  it('classifies a 422 as a (permanent) validation error', async () => {
    (global as { fetch: jest.Mock }).fetch = jest.fn(async () => ({ ok: false, status: 422, json: async () => ({}) }));
    await expect(new HttpModelClient().getProfile()).rejects.toMatchObject({ kind: 'validation' });
  });
});

const SESSION = {
  today: {
    id: 'sess_1',
    name: 'Upper A',
    status: 'active',
    week: 1,
    blocks: [
      { id: 'blk_a', position: 0, capability: 'horizontal_push', exercise: 'bb_bench_press', recommended_weight: 60, target_reps: 5, target_sets: 3, rest_seconds: 120, selection_reason: 'progress', recommendation_id: 'rec_a', status: 'pending' },
      { id: 'blk_b', position: 1, capability: 'hip_dominant', exercise: 'bb_rdl', recommended_weight: 80, target_reps: 8, target_sets: 2, rest_seconds: 90, selection_reason: 'progress', recommendation_id: 'rec_b', status: 'pending' },
    ],
  },
};

function mockFetchOnce(json: unknown, ok = true, status = 200) {
  (global as { fetch: jest.Mock }).fetch = jest.fn(async () => ({ ok, status, json: async () => json }));
}

// The weekly payload: a bucket of N workouts (no calendar). Workout A is still planned;
// workout B is already completed (its slot should render green / advance Home past it).
const WEEK = {
  week: { id: 'wk_1', weekly_frequency: 4 },
  rest: false,
  workouts: [
    { ...SESSION.today, id: 'sess_a', name: 'Upper A', status: 'planned', session_index: 0, position_in_week: 0 },
    { ...SESSION.today, id: 'sess_b', name: 'Lower A', status: 'completed', session_index: 1, position_in_week: 1 },
  ],
};

describe('generateProgram consumes the WEEKLY model (/weeks)', () => {
  it('reads /weeks/current and maps workouts[] → the week bucket (names, completion, ordering key)', async () => {
    const urls: { url: string; method: string }[] = [];
    (global as { fetch: jest.Mock }).fetch = jest.fn(async (url: string, init: { method: string }) => {
      urls.push({ url, method: init.method });
      if (url.endsWith('/weeks/current')) return { ok: true, status: 200, json: async () => WEEK };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const program = await new HttpModelClient().generateProgram({} as never);

    expect(urls.some((u) => u.url.endsWith('/weeks/current'))).toBe(true);
    expect(urls.some((u) => u.url.endsWith('/weeks') && u.method === 'POST')).toBe(false); // no compose when a week exists
    expect(program.days).toHaveLength(2); // the whole week, not one workout
    expect(program.frequency).toBe(4);
    expect(program.days.map((d) => d.name)).toEqual(['Upper A', 'Lower A']); // real backend names
    expect(program.days.map((d) => d.id)).toEqual(['sess_a', 'sess_b']); // each workout's own session id
    expect(program.days.map((d) => d.completed)).toEqual([false, true]); // status → completion (green)
    expect(program.days.map((d) => d.key)).toEqual(['0', '1']); // str(session_index % weekly_frequency)
    expect(program.days[0].muscleGroups).toEqual(expect.arrayContaining(['Chest', 'Hamstrings']));
  });

  it('composes the week (POST /weeks) only when none exists yet', async () => {
    const urls: { url: string; method: string }[] = [];
    (global as { fetch: jest.Mock }).fetch = jest.fn(async (url: string, init: { method: string }) => {
      urls.push({ url, method: init.method });
      if (url.endsWith('/weeks/current')) return { ok: true, status: 200, json: async () => ({ week: null, reason: 'no_week_yet' }) };
      if (url.endsWith('/weeks')) return { ok: true, status: 200, json: async () => WEEK };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const program = await new HttpModelClient().generateProgram({} as never);
    expect(urls.some((u) => u.url.endsWith('/weeks') && u.method === 'POST')).toBe(true);
    expect(program.days).toHaveLength(2);
  });
});

describe('sessionTargets maps blocks to per-set targets', () => {
  it('reads the CHOSEN workout by id (GET /sessions/{id}) and expands target_sets + block ids', async () => {
    const urls: string[] = [];
    (global as { fetch: jest.Mock }).fetch = jest.fn(async (url: string) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => SESSION.today };
    });
    const targets = await new HttpModelClient().sessionTargets({ programDayId: 'sess_1', completedSessions: 10 });
    expect(urls.some((u) => u.endsWith('/sessions/sess_1'))).toBe(true); // the specific workout, not "today"
    expect(targets).toHaveLength(5); // 3 + 2 sets
    const bench0 = targets.find((t) => t.blockId === 'blk_a' && t.setIndex === 0)!;
    expect(bench0.exerciseId).toBe('bb_bench_press');
    expect(bench0.recommendedWeight).toBe(60);
    expect(bench0.recommendedReps).toBe(5);
    expect(targets.filter((t) => t.blockId === 'blk_b')).toHaveLength(2);
  });
});

describe('recordSession reports each set then completes', () => {
  it('posts /sets per set with the backend block id, then /complete', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    (global as { fetch: jest.Mock }).fetch = jest.fn(async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const sets: ActualSet[] = [
      { exerciseId: 'bb_bench_press', setIndex: 0, actualWeight: 62.5, actualReps: 5, blockId: 'blk_a' },
      { exerciseId: 'bb_bench_press', setIndex: 1, actualWeight: 62.5, actualReps: 4, blockId: 'blk_a' },
    ];
    await new HttpModelClient().recordSession({ programDayId: 'sess_1', sets, earlyFinish: false });

    const setCalls = calls.filter((c) => c.url.endsWith('/sets'));
    expect(setCalls).toHaveLength(2);
    expect(setCalls[0].body).toMatchObject({ block_id: 'blk_a', set_number: 1, actual_reps: 5, actual_weight: 62.5 });
    const completeCall = calls.find((c) => c.url.endsWith('/complete'))!;
    expect(completeCall.body).toMatchObject({ finished_early: false });
  });

  it('skips sets with no backend block id (cannot be reported)', async () => {
    const calls: string[] = [];
    (global as { fetch: jest.Mock }).fetch = jest.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => ({}) };
    });
    await new HttpModelClient().recordSession({
      programDayId: 'sess_1',
      sets: [{ exerciseId: 'x', setIndex: 0, actualWeight: 10, actualReps: 5 }],
      earlyFinish: true,
    });
    expect(calls.filter((u) => u.endsWith('/sets'))).toHaveLength(0);
    expect(calls.filter((u) => u.endsWith('/complete'))).toHaveLength(1);
  });
});

describe('getProfile validates the invite + maps backend identity', () => {
  it('maps GET /profile fields (sex/age/bodyweight)', async () => {
    (global as { fetch: jest.Mock }).fetch = jest.fn(async (url: string) => {
      expect(url).toContain('/profile');
      return { ok: true, status: 200, json: async () => ({ sex: 'male', age: 31, bodyweight_kg: 82.5, experience: 'intermediate' }) };
    });
    const p = await new HttpModelClient().getProfile();
    expect(p).toMatchObject({ sex: 'male', age: 31, bodyweightKg: 82.5, experience: 'intermediate' });
  });

  it('a bad/expired invite (401) throws unauthorized (caller reverts + shows the error line)', async () => {
    (global as { fetch: jest.Mock }).fetch = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(new HttpModelClient().getProfile()).rejects.toMatchObject({ kind: 'unauthorized' });
  });

  it('maps /strategy.sessions_completed (calibration source of truth)', async () => {
    (global as { fetch: jest.Mock }).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ weekly_frequency: 4, sessions_completed: 9 }) }));
    expect(await new HttpModelClient().sessionsCompleted()).toBe(9);
  });
});

describe('equipment occupied + weekly rest (Program Ownership / Weekly Container)', () => {
  it('eraseAccount POSTs to /me/erase (in-app Delete Account → server erasure)', async () => {
    const calls: { url: string; method: string }[] = [];
    (global as { fetch: jest.Mock }).fetch = jest.fn(async (url: string, init: { method: string }) => {
      calls.push({ url, method: init.method });
      return { ok: true, status: 200, json: async () => ({ athlete_id: 'a', method: 'logical_anonymization' }) };
    });
    await new HttpModelClient().eraseAccount();
    expect(calls.some((c) => c.url.endsWith('/me/erase') && c.method === 'POST')).toBe(true);
  });

  it('markEquipmentOccupied POSTs to /blocks/{id}/unavailable', async () => {
    const calls: { url: string; method: string }[] = [];
    (global as { fetch: jest.Mock }).fetch = jest.fn(async (url: string, init: { method: string }) => {
      calls.push({ url, method: init.method });
      return { ok: true, status: 200, json: async () => ({}) };
    });
    await new HttpModelClient().markEquipmentOccupied({ blockId: 'blk_a' });
    expect(calls.some((c) => c.url.endsWith('/blocks/blk_a/unavailable') && c.method === 'POST')).toBe(true);
  });
});

describe('portraitSnapshot maps /capabilities to a snapshot (relative bars, Decision 2)', () => {
  it('returns raw score + confidence; still-learning derived from confidence<30', async () => {
    (global as { fetch: jest.Mock }).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        capabilities: [
          { capability: 'horizontal_push', score: 60, confidence: 80 },
          { capability: 'vertical_push', score: 30, confidence: 20 },
        ],
      }),
    }));
    const snap = await new HttpModelClient().portraitSnapshot({ completedSessions: 10 });
    expect(snap.perCapability.horizontal_push).toBe(60); // raw — barFraction normalizes relatively
    expect(snap.confidence.horizontal_push).toBe(80);
    expect(snap.stillLearning.vertical_push).toBe(true); // confidence < 30
    expect(snap.stillLearning.horizontal_push).toBe(false);
  });
});
