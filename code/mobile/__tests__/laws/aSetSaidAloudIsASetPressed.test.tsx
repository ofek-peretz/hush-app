/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * A SET SAID ALOUD IS A SET PRESSED — ON EVERY SCREEN.
 *
 * Founder, 2026-09-15: *"אם אני מדבר בקול בזמן האימון זה מזין באפליקציה וזה שווה ערך ללחיצה גם ברמת
 * המסכים? זה חשוב."*
 *
 * Every channel already wrote the SAME set through the same `completeSet`, and the wrist and the lock
 * card saw it identically. The gap was the phone's own stage: a tap played its "Set logged" beat, a
 * set logged on the wrist played the same beat (`watchLoggedSet`), and a set said aloud or pressed on
 * the lock screen played NOTHING — straight to the rest, no figures read back, no record said, no lift
 * closed. One store function now raises that beat for every channel off the stage.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck
//
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppState } from 'react-native';
import { AppContext } from '@/state/stores/appStore';
import { SessionProvider, useSession, type SessionView } from '@/state/stores/sessionStore';
import { db } from '@/data/local/db';
import type { PlannedSession } from '@/domain/coachPlan';

jest.mock('@/platform/restHaptics', () => ({
  REST_WARNING_LEAD_S: 7,
  phoneOwnsRestHaptics: () => true,
  restAlertDelays: () => ({ warnInS: null, doneInS: null }),
  restHaptics: { arm: jest.fn(async () => {}), disarm: jest.fn(async () => {}) },
}));
jest.mock('@/platform/setNudge', () => ({
  setNudge: { arm: jest.fn(async () => {}), disarm: jest.fn(async () => {}) },
}));
jest.mock('@/platform/coach/afterSession', () => ({
  askAfterSession: jest.fn(async () => ({ ok: false, reason: 'offline' })),
}));

const read = (rel: string) => readFileSync(join(__dirname, '..', '..', rel), 'utf8');

const appFixture = {
  booted: true,
  profile: { id: 'p1', name: 'Maya', sex: 'female', units: 'kg', weightKg: 62, bodyMap: {}, repBandByMuscle: {} },
  program: null,
  sessions: [],
  entitlement: { status: 'trial', sessionsUsed: 0 },
  model: {},
  modeState: { completedSessions: 0 },
  recordSessionCompleted: async () => ({ unlockedPortrait: false }),
  markWorkoutCompleted: async () => {},
  refreshProgram: async () => {},
} as unknown as React.ContextType<typeof AppContext>;

const PLAN: PlannedSession = {
  name: 'Upper A',
  blocks: [{ rounds: 3, items: [{ kind: 'reps', ex: 'bb_bench_press', load: 60, reps: [8, 10] }] }],
};

beforeEach(async () => {
  await db.clearAll();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove() {} }) as never);
});

function harness() {
  let view: SessionView | null = null;
  function Probe() {
    view = useSession();
    return null;
  }
  act(() => {
    renderer.create(
      <AppContext.Provider value={appFixture}>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </AppContext.Provider>,
    );
  });
  return () => view!;
}

describe('the voice raises the phone’s beat, exactly as the wrist does', () => {
  it('⛔ a set about to be written by voice plays the stage’s "Set logged" beat, with its own figures', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    expect(view().watchLoggedSet).toBeNull();
    // What `voiceConductor.complete` does: announce from the set on stage, then write it.
    await act(async () => {
      view().announceLoggedSet(62.5, 9);
      await view().completeSet({ weight: 62.5, reps: 9 });
    });
    const beat = view().watchLoggedSet!;
    expect(beat).toMatchObject({ weight: 62.5, reps: 9, n: 1, m: 3, lift: 'bb_bench_press' });
    expect(beat.seq).toBe(1);
    // …the band it was decided against rides with it, so the beat can place the set as a tap's does.
    expect(beat.band).toEqual([8, 10]);
    // …and the set is written once.
    expect(view().loggedSets).toHaveLength(1);
  });

  it('a second word during the rest raises no beat — nothing is being written', async () => {
    const view = harness();
    await act(async () => view().startCoach(PLAN, 'coach_0'));
    await act(async () => {
      view().announceLoggedSet(60, 8);
      await view().completeSet({ weight: 60, reps: 8 });
    });
    expect(view().displayPhase).toBe('REST_INTER');
    const seq = view().watchLoggedSet!.seq;
    await act(async () => view().announceLoggedSet(60, 8));
    expect(view().watchLoggedSet!.seq).toBe(seq);
  });
});

describe('every off-stage channel goes through the one beat', () => {
  const store = read('src/state/stores/sessionStore.tsx');

  it('the voice announces before it writes, from the set still on stage', () => {
    const conductor = read('src/platform/voice/voiceConductor.ts');
    const at = conductor.indexOf('v.announceLoggedSet(weight, reps);');
    expect(at).toBeGreaterThan(-1);
    expect(conductor.indexOf('await v.completeSet({ weight, reps });')).toBeGreaterThan(at);
  });

  it('the lock screen raises it only once the set is actually written', () => {
    expect(store).toContain('if ((sessionRef.current?.sets.length ?? before) > before) raiseLoggedBeat(v, w, r);');
  });

  it('the wrist raises the same one — no second copy of the beat’s shape anywhere', () => {
    expect(store).toContain('raiseLoggedBeat(view, weight, reps);');
    expect(store.split('setWatchLoggedSet({').length - 1).toBe(1);
  });
});
