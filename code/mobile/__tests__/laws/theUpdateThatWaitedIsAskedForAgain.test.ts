/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * "THE UPDATE IS WAITING" HAS TO MEAN IT WILL BE ASKED FOR AGAIN.
 *
 * ⚠️ WATCHED HAPPEN, 2026-08-02. Gemini was unreachable for two hours — 503s, then 524s at two
 * minutes, proven upstream by a bare eight-token call failing identically. Every post-session call
 * in that window died. The app behaved exactly as ruled: it decided nothing, and it said so.
 *
 * **And nothing ever tried again.** `loadCoachUpdate` had ONE reader in the whole app, and it only
 * draws the words. So an athlete who finishes a workout inside a bad hour never gets her next week:
 * no error, no retry, no screen that looks wrong, nothing to report. She would have to open the
 * chat and ask for a programme by hand.
 *
 * `CoachUpdate.sessionId` has carried a comment since the day it was written — *"so a retry sends
 * the right one, not the newest one"* — and the retry was never built.
 *
 * ── AND IT IS NOT THE RETRY THE RULING FORBIDS ──────────────────────────────────────────────────
 * `never retries — one workout is one call, and one bill` is about hammering a model that has just
 * failed, and it stands untouched: `askAfterSession` still calls once. This is a separate occasion
 * — her opening the app — which recovers from an outage of any length rather than of twenty
 * seconds, and spends nothing at all on an athlete who does not come back.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import { retryWaitingUpdate } from '@/platform/coach/afterSession';
import { db } from '@/data/local/db';
import type { Session } from '@/data/local/models';

jest.mock('@/platform/coach/coachClient', () => ({
  askCoach: jest.fn(),
  coachIsReachable: () => true,
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { askCoach } = require('@/platform/coach/coachClient') as { askCoach: jest.Mock };

const session: Session = {
  id: 's-lost', programDayId: 'coach_0', programDayName: 'אימון 1',
  startedAt: '2026-08-02T18:00:00.000Z', state: 'SAVED', earlyFinish: false, trained: true,
  sets: [{
    exerciseId: 'goblet_squat', setIndex: 0, recommendedWeight: 12, recommendedReps: 8,
    actualWeight: 12, actualReps: 9, edited: false, persistedAt: '2026-08-02T18:10:00.000Z',
  }],
};

const REPLY = {
  ok: true as const, model: 'gemini-3.6-flash', usage: null,
  text: JSON.stringify({
    say: 'הנה השבוע הבא.',
    sessions: [{ name: 'אימון 1', blocks: [{ rounds: 3, restS: 90, items: [{ kind: 'reps', ex: 'goblet_squat', reps: [8, 12], load: 12 }] }] }],
  }),
};

/** The state an outage leaves behind: a finished session, and an update that never came. */
async function anOutageHappened(trouble: string): Promise<void> {
  await db.clearAll();
  await db.saveProfile({ sex: 'female', weightKg: 62, units: 'kg', goal: 'build_muscle', daysPerWeek: 3, healthConnected: false });
  await db.appendCompletedSession(session);
  await db.saveCoachUpdate({ at: '2026-08-02T18:45:00.000Z', outcome: 'waiting', sessionId: 's-lost', trouble } as never);
}

beforeEach(() => askCoach.mockReset());

describe('when she comes back', () => {
  it('⚠️ asks again for the week the outage swallowed', async () => {
    await anOutageHappened('upstream');
    askCoach.mockResolvedValue(REPLY);

    const update = await retryWaitingUpdate();
    expect(update).toMatchObject({ outcome: 'decided', sessionId: 's-lost' });
    // …and the programme is on disk, which is the whole point: her week exists now.
    expect((await db.loadCoachPlan())?.sessions[0].name).toBe('אימון 1');
  });

  it('sends the session it was ABOUT, not the newest one', async () => {
    // A retry that decided from whatever happened most recently would answer a question nobody
    // asked. `sessionId` was stored for exactly this and had never been read.
    await anOutageHappened('timed_out');
    await db.appendCompletedSession({ ...session, id: 's-later', startedAt: '2026-08-03T18:00:00.000Z' });
    askCoach.mockResolvedValue(REPLY);

    await retryWaitingUpdate();
    const sheet = (askCoach.mock.calls[0][0] as { blocks: { text: string }[] }).blocks
      .find((b) => b.text.startsWith('HER RECORD'))!.text;
    expect(sheet).toContain('"at":"2026-08-02T18:00:00.000Z"');
  });

  it('does nothing at all when the last update landed', async () => {
    await db.clearAll();
    await db.saveCoachUpdate({ at: 't', outcome: 'decided', sessionId: 's-lost' } as never);
    expect(await retryWaitingUpdate()).toBeNull();
    expect(askCoach).not.toHaveBeenCalled();
  });

  it('does nothing when there is no update at all — which is most athletes, most days', async () => {
    await db.clearAll();
    expect(await retryWaitingUpdate()).toBeNull();
    expect(askCoach).not.toHaveBeenCalled();
  });

  it('⚠️ never re-asks a failure that will fail the same way', async () => {
    // A refused token and an unreadable answer are not about the moment. Asking again costs money
    // to be told the same thing, which is precisely what the no-retry ruling is protecting.
    for (const trouble of ['refused', 'not_configured', 'no_sessions']) {
      await anOutageHappened(trouble);
      expect(await retryWaitingUpdate()).toBeNull();
    }
    expect(askCoach).not.toHaveBeenCalled();
  });

  it('does nothing when the session it was about is gone', async () => {
    // A wipe, or an update older than the history it refers to. Deciding from the newest session
    // instead would be the app inventing the question.
    await anOutageHappened('offline');
    await db.saveCoachUpdate({ at: 't', outcome: 'waiting', sessionId: 'gone', trouble: 'offline' } as never);
    expect(await retryWaitingUpdate()).toBeNull();
    expect(askCoach).not.toHaveBeenCalled();
  });
});
