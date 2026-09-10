/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE LOCK SCREEN IS A CONTROL (founder, 2026-09-08).
 *
 *   > *"לעשות אפשרות של שליטה מבלי לפתוח את הפלאפון… להזין סט כשהמסך סגור וגם מנוחה של קיצור או
 *   > הוספת 15 שניות. כי כרגע חובה בכל פעם לפתוח את המסך."*
 *
 * Two halves, one law. The NATIVE half is read as source (this runtime has no Swift): the three
 * intents exist, name the same three verbs the phone parses, write the same App Group queue the
 * module drains, and are compiled into both targets. The PHONE half is run: a tap replayed at its
 * instant lands exactly where a thumb on the stage would have — the set logged at the tap, the
 * rest anchored to it, fifteen seconds added, a rest ended — and never twice, never from before
 * the session, never on a set she had already written.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck
//
import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { AppState } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { AppContext } from '@/state/stores/appStore';
import { SessionProvider, useSession, restAfterStep, type SessionView } from '@/state/stores/sessionStore';
import { db } from '@/data/local/db';
import { nudgeAfterS } from '@/domain/setDwell';
import { LOCK_INTENT_TYPES, parseLockIntents } from '@/platform/liveActivity';
import type { PlannedSession } from '@/domain/coachPlan';

jest.mock('@/platform/restHaptics', () => ({
  REST_WARNING_LEAD_S: 7,
  phoneOwnsRestHaptics: () => true,
  restAlertDelays: () => ({ warnInS: null, doneInS: null }),
  restHaptics: { arm: jest.fn(async () => {}), disarm: jest.fn(async () => {}) },
}));
jest.mock('@/platform/coach/afterSession', () => ({
  askAfterSession: jest.fn(async () => ({ ok: false, reason: 'offline' })),
}));

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8').replace(/\r\n/g, '\n');

// ═══════════════════════════════ the native half, as source ═══════════════════════════════

describe('⛔ the native half: three intents, one queue, two targets', () => {
  const intents = read('targets/widget/HushLockIntents.swift');
  const widget = read('targets/widget/HushLiveActivityWidget.swift');
  const module = read('modules/hush-live-activity/ios/HushLiveActivityModule.swift');

  it('the three verbs on the wire are exactly the three the phone parses', () => {
    const wire = [...intents.matchAll(/case \w+ = "(\w+)"/g)].map((m) => m[1]);
    expect(wire).toEqual([...LOCK_INTENT_TYPES]);
    // Five intents: the three verbs of the stage, the voice's "מוכן" (a verb on the wire, spec §3.2),
    // and the stepper turn — which is NOT a verb on the wire.
    expect((intents.match(/: LiveActivityIntent \{/g) ?? []).length).toBe(5);
    // Every verb writes the queue BEFORE it projects — the queue is the truth, the card a guess.
    for (const kind of ['completeSet', 'addRest', 'endRest', 'setReady']) {
      const i = intents.search(new RegExp(`HushLockIntentBus\\.push\\(\\.${kind}[,)]`));
      const j = intents.indexOf(`HushLockProjection.${kind}(`, i);
      expect({ kind, pushed: i > -1, projectedAfter: j > i }).toEqual({ kind, pushed: true, projectedAfter: true });
    }
  });

  it('⛔ her figures (2026-09-08): a stepper turn queues nothing; "Done" carries the parked figures, read before they are cleared', () => {
    const adjust = intents.slice(intents.indexOf('struct HushAdjustFigureIntent'), intents.indexOf('struct HushAddRestIntent'));
    expect(adjust).toContain('HushLockProjection.adjust(field: field, delta: delta)');
    expect(adjust).not.toContain('HushLockIntentBus.push(');
    // The set intent sends the parked figures WITH the tap, and reads them before the projection clears them.
    const done = intents.slice(intents.indexOf('struct HushCompleteSetIntent'), intents.indexOf('struct HushAdjustFigureIntent'));
    expect(done).toContain('HushLockIntentBus.push(.completeSet, figures: HushLockProjection.pendingForCurrentSet())');
    // The parked figures live under one key in both targets, keyed by the set they were typed for.
    for (const src of [intents, module]) {
      expect(src).toContain('"hush.lockPending"');
      expect(src).toContain('"\\(liftIndex)/\\(setIndex)"');
    }
    // The phone's module merges them only onto the SAME set, and drops them on any other card.
    expect(module).toContain('if r.phase == "set", let p = LockPending.read(), p.key == key');
    // The card draws two steppers on a set, − left and + right in every language.
    expect(widget).toContain('StrengthSetEntry(state: state)');
    expect(widget).toContain('.environment(\\.layoutDirection, .leftToRight)');
    for (const field of ['unitLabel', 'wordReps']) expect(widget).toMatch(new RegExp(`(s|state)[.]${field}`));
    // The detent is the PHONE's (`weightStep`, baked from `domain/weightStep`); the turn reads it off the state.
    expect(intents).toContain('let step = s.weightStep > 0 ? s.weightStep : 0.5');
    // The figures the phone parses: reps a positive whole number, the load finite or null; half a pair is dropped.
    const parsed = parseLockIntents([
      { id: 'a', type: 'complete_set', atMs: 10, reps: 10, weight: 42.5 },
      { id: 'b', type: 'complete_set', atMs: 11, reps: 8, weight: null },
      { id: 'c', type: 'complete_set', atMs: 12, reps: 0, weight: 40 },
      { id: 'd', type: 'complete_set', atMs: 13, reps: 8, weight: 'x' },
      { id: 'e', type: 'add_rest', atMs: 14, reps: 8, weight: 40 },
    ]);
    expect(parsed.map((p) => [p.id, p.reps, p.weight])).toEqual([
      ['a', 10, 42.5], ['b', 8, null], ['c', undefined, undefined], ['d', undefined, undefined], ['e', undefined, undefined],
    ]);
  });

  it('⛔ the line drains on the system clock, not on a fraction taken at render time', () => {
    expect(widget).toContain('ProgressView(timerInterval: interval, countsDown: true');
    expect(widget).not.toMatch(/geo\.size\.width \* fraction/);
    // The card fits the 160-point Lock Screen budget: 14 of padding, an 18 row, a 40 row, a 40 action row.
    expect(widget).toContain('.padding(14)');
    expect(widget).toContain('private var height: CGFloat { compact ? 34 : 40 }');
    expect(widget).not.toContain('.font(.system(size: 40, design: .monospaced))');
  });

  it('the card and the island wear the three buttons, and only on the phase each belongs to', () => {
    expect(widget).toContain('Button(intent: HushCompleteSetIntent())');
    expect(widget).toContain('Button(intent: HushAddRestIntent())');
    expect(widget).toContain('Button(intent: HushEndRestIntent())');
    const actions = widget.slice(widget.indexOf('private struct StrengthActions'));
    expect(actions.indexOf('if state.phase == "set"')).toBeLessThan(actions.indexOf('HushCompleteSetIntent'));
    expect(actions.indexOf('else if state.isResting')).toBeLessThan(actions.indexOf('HushAddRestIntent'));
    // Drawn twice: the lock card's action row and the island's bottom region.
    expect((widget.match(/StrengthActions\(state:/g) ?? []).length).toBe(2);
  });

  it('the intents and the module agree on the queue — suite, key, whistle', () => {
    for (const literal of ['"group.com.hushfitness.app"', '"hush.lockIntents"', '"com.hushfitness.app.lockIntent"']) {
      expect(intents).toContain(literal);
      expect(module).toContain(literal);
    }
    expect(module).toContain('AsyncFunction("drainLockIntents")');
    expect(module).toContain('Events("onLockIntent")');
    // The rest-over alert the intent schedules wears the same id the phone re-arms, so nothing stacks.
    expect(intents).toContain('static let restDoneId = "hush.rest_done"');
    expect(read('src/platform/restHaptics.ts')).toContain("const DONE_ID = 'hush.rest_done'");
  });

  it('⛔ the widget words come from the phone — no English word is hard-coded into a strength label', () => {
    // Code only (comments may quote the old words); cardio keeps its own two words.
    const strength = widget.slice(0, widget.indexOf('struct HushCardioLiveActivity')).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    for (const word of ['"Paused"', '"Next up"', '"Rest"', '"Workout paused"', '"Up next']) {
      expect(strength).not.toContain(word);
    }
    for (const field of ['wordRest', 'wordNext', 'wordPaused', 'wordLogged', 'actDone', 'actAddRest', 'actStart']) {
      expect(widget).toMatch(new RegExp(`(s|state)[.]${field}`)); // the words and the verbs, read off the state
    }
  });

  it('the activity state is declared identically in the widget and in the app module', () => {
    const below = (s: string) => s.slice(s.indexOf('struct HushSessionAttributes'));
    expect(below(read('targets/widget/HushSessionAttributes.swift'))).toBe(below(read('modules/hush-live-activity/ios/HushSessionAttributes.swift')));
  });

  it('the intents are compiled into the app target too — the plugin, declared and registered', () => {
    const plugin = read('plugins/withLockIntents.js');
    expect(plugin).toContain("'HushLockIntents.swift'");
    expect(plugin).toContain("'HushSessionAttributes.swift'");
    expect(plugin).toContain('addBuildSourceFileToGroup');
    const app = JSON.parse(read('app.json'));
    expect(app.expo.plugins).toContain('./plugins/withLockIntents');
    const target = read('targets/widget/expo-target.config.js');
    expect(target).toContain("deploymentTarget: '17.0'");
    expect(target).toContain("'AppIntents'");
  });

  it('what the native queue hands over is parsed strictly, oldest first', () => {
    expect(parseLockIntents([{ id: 'b', type: 'add_rest', atMs: 20 }, { id: 'a', type: 'complete_set', atMs: 10 }, { id: 'x', type: 'finish', atMs: 5 }, 'junk', { id: 7, type: 'end_rest', atMs: 1 }]))
      .toEqual([{ id: 'a', type: 'complete_set', atMs: 10 }, { id: 'b', type: 'add_rest', atMs: 20 }]);
    expect(parseLockIntents(null)).toEqual([]);
  });
});

// ═══════════════════════════════ the phone half, run ═══════════════════════════════

const BENCH = 'bb_bench_press';
const PRESS = 'bb_overhead_press';
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
  blocks: [
    { rounds: 3, items: [{ kind: 'reps', ex: BENCH, load: 60, reps: [8, 10] }] },
    { rounds: 2, items: [{ kind: 'reps', ex: PRESS, load: 22.5, reps: [8, 10] }] },
  ],
};

const T0 = 1_800_000_000_000;
let now = T0;
const clock = jest.spyOn(Date, 'now');
let wake: ((s: string) => void) | null = null;

beforeEach(async () => {
  await db.clearAll();
  now = T0;
  clock.mockImplementation(() => now);
  wake = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type: string, cb: (s: string) => void) => {
    wake = cb; // the last listener registered is the clock's; both drain, so either is fine to poke
    return { remove() {} } as never;
  });
});
afterAll(() => clock.mockRestore());

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

async function later(ms: number) {
  now += ms;
  await act(async () => {
    wake?.('active');
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** Her thumb on the lock screen, at an instant — replayed the way the app replays a drained queue. */
async function tapped(view: () => SessionView, intents: { id: string; type: string; atMs: number }[]) {
  await act(async () => {
    await view().applyLockIntents(intents as never);
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function started() {
  const view = harness();
  await act(async () => view().startCoach(PLAN, 'coach_0'));
  expect(view().displayPhase).toBe('SET_PRESENTED');
  return view;
}

describe('⛔ a tap on the lock screen lands where a thumb on the stage would have', () => {
  it('"done" at its instant: the set is written as of the tap, and the rest is anchored to it', async () => {
    const view = await started();
    const rest = restAfterStep(view().livePlan[0] as never);
    now = T0 + 60_000; // the phone woke a minute in…
    await tapped(view, [{ id: 'a', type: 'complete_set', atMs: T0 + 40_000 }]); // …the tap was twenty seconds ago
    expect(view().loggedSets).toHaveLength(1);
    const row = view().loggedSets[0];
    expect(row.presumed).toBeUndefined(); // hers, not the clock's
    expect(row.actualReps).toBe(8);
    expect(Date.parse(row.persistedAt)).toBe(T0 + 40_000);
    expect(view().displayPhase).toBe('REST_INTER');
    // The rest runs from the TAP, not from the wake: it ends at tap + rest.
    await later(40_000 + rest * 1000 - 60_000 - 1000); // one second before the rest ends
    expect(view().displayPhase).toBe('REST_INTER');
    await later(2000);
    expect(view().displayPhase).toBe('SET_PRESENTED');
    expect(view().globalProgress?.index).toBe(1);
  });

  it('"+15" stretches the running rest by exactly fifteen seconds', async () => {
    const view = await started();
    const rest = restAfterStep(view().livePlan[0] as never);
    now = T0 + 30_000;
    await tapped(view, [{ id: 'a', type: 'complete_set', atMs: T0 + 30_000 }]);
    now = T0 + 40_000;
    await tapped(view, [{ id: 'b', type: 'add_rest', atMs: T0 + 40_000 }]);
    await later(rest * 1000 - 5_000); // the base rest (tap + rest) is over…
    expect(view().displayPhase).toBe('REST_INTER'); // …but not the stretched one
    await later(11_000);
    expect(view().displayPhase).toBe('SET_PRESENTED');
  });

  it('"next set" ends the rest at the tap, and the next set is on stage from that instant', async () => {
    const view = await started();
    now = T0 + 30_000;
    await tapped(view, [{ id: 'a', type: 'complete_set', atMs: T0 + 30_000 }]);
    now = T0 + 70_000; // the phone woke twenty seconds after the tap
    await tapped(view, [{ id: 'b', type: 'end_rest', atMs: T0 + 50_000 }]);
    expect(view().displayPhase).toBe('SET_PRESENTED');
    expect(view().globalProgress?.index).toBe(1);
    // ⛔ And the second set is HERS however long it stands (founder, 2026-09-09: no automatic set).
    // The set's expected duration passes, and an hour more — nothing is written.
    const step = view().livePlan[1] as never as { exerciseId: string; target?: { repBandLo?: number; recommendedReps: number } };
    const askS = nudgeAfterS(step.exerciseId, step.target?.repBandLo ?? step.target?.recommendedReps ?? 8);
    await later(askS * 1000 + 60 * 60 * 1000);
    expect(view().loggedSets).toHaveLength(1);
    expect(view().displayPhase).toBe('SET_PRESENTED');
    expect(view().globalProgress?.index).toBe(1);
  });

  it('⛔ a tap long after the set\'s expected duration is still the ONLY thing that writes it — at its instant', async () => {
    const view = await started();
    const step = view().livePlan[0] as never as { exerciseId: string; target?: { repBandLo?: number; recommendedReps: number } };
    const askMs = nudgeAfterS(step.exerciseId, step.target?.repBandLo ?? step.target?.recommendedReps ?? 8) * 1000;
    now = T0 + askMs + 90_000; // the phone slept through the ask and half a minute more
    expect(view().loggedSets).toHaveLength(0); // nothing wrote it while she was away
    await tapped(view, [{ id: 'a', type: 'complete_set', atMs: T0 + askMs + 30_000 }]);
    expect(view().loggedSets).toHaveLength(1);
    expect(view().loggedSets[0].presumed).toBeUndefined();
    expect(Date.parse(view().loggedSets[0].persistedAt)).toBe(T0 + askMs + 30_000);
  });

  it('⛔ never twice, never from before the session, never in the future', async () => {
    const view = await started();
    now = T0 + 30_000;
    await tapped(view, [
      { id: 'old', type: 'complete_set', atMs: T0 - 60_000 }, // a queue from a previous workout
      { id: 'a', type: 'complete_set', atMs: T0 + 20_000 },
      { id: 'a', type: 'complete_set', atMs: T0 + 20_000 }, // the whistle and the wake both drained it
      { id: 'future', type: 'complete_set', atMs: T0 + 3_600_000 },
    ]);
    expect(view().loggedSets).toHaveLength(1);
    await tapped(view, [{ id: 'a', type: 'complete_set', atMs: T0 + 20_000 }]);
    expect(view().loggedSets).toHaveLength(1);
  });

  it('a second "done" during her own rest is a second tap, not a second set', async () => {
    const view = await started();
    now = T0 + 30_000;
    await tapped(view, [{ id: 'a', type: 'complete_set', atMs: T0 + 20_000 }, { id: 'b', type: 'complete_set', atMs: T0 + 25_000 }]);
    expect(view().loggedSets).toHaveLength(1);
    expect(view().displayPhase).toBe('REST_INTER');
  });
});
