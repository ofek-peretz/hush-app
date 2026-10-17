/**
 * Persistence robustness (production-readiness audit). Boot must survive corrupt
 * storage; offline-completed sessions queue idempotently for reconcile (§6.4).
 */
// @ts-nocheck

// 

import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '@/data/local/db';
import type { Session } from '@/data/local/models';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('boot resilience', () => {
  it('a corrupt stored value is treated as absent — never bricks boot', async () => {
    await AsyncStorage.setItem('hush.profile', '{ not valid json');
    expect(await db.loadProfile()).toBeNull();
    await AsyncStorage.setItem('hush.history.sessions', 'garbage');
    expect(await db.loadHistory()).toEqual([]);
  });
});

describe('offline sync queue (§6.4)', () => {
  it('de-dupes by session id so an idempotent replay never doubles', async () => {
    await db.enqueuePendingSync({ sessionId: 's1', programDayId: 'p', sets: [], earlyFinish: false });
    await db.enqueuePendingSync({ sessionId: 's1', programDayId: 'p', sets: [], earlyFinish: true });
    const q = await db.loadPendingSync();
    expect(q).toHaveLength(1);
    expect(q[0].earlyFinish).toBe(true); // latest wins
  });

  it('keeps distinct sessions', async () => {
    await db.enqueuePendingSync({ sessionId: 's1', programDayId: 'p', sets: [], earlyFinish: false });
    await db.enqueuePendingSync({ sessionId: 's2', programDayId: 'p', sets: [], earlyFinish: false });
    expect(await db.loadPendingSync()).toHaveLength(2);
  });
});

describe('active-session recovery primitives (§7.4 / §5.5)', () => {
  it('a partial session can be saved to history and the orphan cleared', async () => {
    const active: Session = {
      id: 'sess_x',
      programDayId: 'day_1',
      startedAt: '2026-06-14T00:00:00Z',
      state: 'ACTIVE',
      earlyFinish: false,
      sets: [{ exerciseId: 'bb_bench_press', setIndex: 0, blockId: 'blk', recommendedWeight: 60, recommendedReps: 5, actualWeight: 60, actualReps: 5, edited: false, persistedAt: '2026-06-14T00:01:00Z' }],
    };
    await db.saveActiveSession(active);
    // recovery: save as ended-early + clear
    await db.appendCompletedSession({ ...active, state: 'SAVED', earlyFinish: true, annotation: 'ended_early' });
    await db.clearActiveSession();

    expect(await db.loadActiveSession()).toBeNull();
    const history = await db.loadHistory();
    expect(history).toHaveLength(1);
    expect(history[0].annotation).toBe('ended_early');
    expect(history[0].sets).toHaveLength(1); // logged work preserved
  });
});
