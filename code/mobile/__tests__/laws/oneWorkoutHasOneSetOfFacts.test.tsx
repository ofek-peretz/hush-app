/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ONE WORKOUT HAS ONE SET OF FACTS.
 *
 * A session has a duration, a tonnage, and an answer to "did that count as a workout?". Six
 * surfaces derived the first, eight the second, five the third — and they disagreed.
 *
 * ⛔ THE ONE THE FOUNDER NAMED. A workout read "38 min" on the Log row and "0 min" on the record one
 * tap later, and added ZERO minutes and ZERO kcal to the lifetime "hours trained" and "burned"
 * figures on Progress — *"כמה זמן בשעות הוא עשה מבחינת אימונים בסך הכל"*. The three derivations
 * that read only `session.sets` could not see an interval session at all, because an interval
 * session logs no `SetLog`: it is a warm-up, six 400 m repeats and a cool-down, all of it `items`.
 * **The one fact she can never get back was the only one they were not keeping.**
 *
 * ⚠️ AND THE COUNTS BESIDE IT. A heavier load logged at ZERO reps earned a moss "1 up" on the Log
 * that Progress never counted, and the share card posted "Week 4" from a screen reading "6 weeks".
 *
 * `domain/sessionMetrics` is the single source now. This law is the proof that every reader asks it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { HistoryView } from '@/screens/history/History';
import { WorkoutDetailView } from '@/screens/history/WorkoutDetail';
import { initI18n } from '@/i18n';
import {
  completedWorkouts,
  raisesBySession,
  sessionCountsAsWorkout,
  sessionDurationMs,
  sessionDurationSec,
  sessionEnergyKcal,
  sessionHasLoggedWork,
  sessionTonnageKg,
  totalRaises,
  totalTonnageKg,
} from '@/domain/sessionMetrics';
import { progressAggregate } from '@/domain/progressAggregate';
import { weekCardFromHistory } from '@/domain/shareCard';
import { currentWeekOpen, trainingWeekNumber } from '@/domain/weekCadence';
import type { ItemResult, Session, SetLog } from '@/data/local/models';

const METRICS: Metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
beforeAll(async () => { await initI18n(); });

const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { while (mounted.length) mounted.pop()!.unmount(); }); });

const MIN = 60_000;
const DAY = 86_400_000;
const T0 = Date.parse('2026-08-01T09:00:00.000Z');
const BODY_KG = 78;

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────────

/** Six 400 m repeats with a walk between them, a warm-up and a cool-down. Not one set. Forty min. */
const intervalItems: ItemResult[] = [
  { kind: 'time', ex: 'warm_up', block: 1, round: 1, position: 1, seconds: 600, askedSeconds: 600, at: new Date(T0).toISOString() },
  ...[1, 2, 3].flatMap((r): ItemResult[] => [
    { kind: 'distance', ex: 'run_outdoor', block: 2, round: r, position: 1, metres: 400, askedMetres: 400, at: new Date(T0 + (10 + r * 4) * MIN).toISOString() },
    { kind: 'time', ex: 'walk_outdoor', block: 2, round: r, position: 2, seconds: 90, askedSeconds: 90, at: new Date(T0 + (12 + r * 4) * MIN).toISOString() },
  ]),
  { kind: 'time', ex: 'cool_down', block: 3, round: 1, position: 1, seconds: 300, askedSeconds: 300, at: new Date(T0 + 40 * MIN).toISOString() },
];

const intervals: Session = {
  id: 's_intervals', programDayId: 'coach_0', programDayName: 'Intervals',
  startedAt: new Date(T0).toISOString(), state: 'SAVED', earlyFinish: false, trained: true,
  sets: [], items: intervalItems,
};

const set = (exerciseId: string, kg: number | null, reps: number, atMs: number): SetLog => ({
  exerciseId,
  setIndex: 0,
  recommendedWeight: kg,
  recommendedReps: 8,
  actualWeight: kg,
  actualReps: reps,
  edited: false,
  persistedAt: new Date(atMs).toISOString(),
});

const lifted = (id: string, atMs: number, sets: SetLog[], extra = {}): Session => ({
  id, programDayId: 'd', programDayName: 'Upper A',
  startedAt: new Date(atMs).toISOString(), state: 'SAVED', earlyFinish: false, trained: true,
  sets, ...extra,
});

const noop = () => {};

function textOf(r: ReactTestRenderer): string {
  return r.root.findAllByType(Text).map((n) => {
    const c = n.props.children;
    return Array.isArray(c) ? c.filter((x) => typeof x === 'string').join('') : String(c ?? '');
  }).join('\n');
}

function draw(node: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = renderer.create(<SafeAreaProvider initialMetrics={METRICS}>{node}</SafeAreaProvider>); });
  mounted.push(r);
  return r;
}

const logScreen = (sessions: Session[]) =>
  textOf(draw(
    <HistoryView sessions={sessions} cardio={[]} dayName={(x) => x.programDayName ?? ''} onLifts={noop} onSession={noop} onCardio={noop} />,
  ));

const recordScreen = (s: Session) =>
  textOf(draw(
    <WorkoutDetailView session={s} forward={{}} loading={false} units="kg" dayName={s.programDayName ?? ''} bodyweightKg={BODY_KG} onBack={noop} />,
  ));

const lifetime = (history: Session[], nowMs = T0 + 3 * DAY) =>
  progressAggregate(history, [], new Date(T0).toISOString(), BODY_KG, nowMs);

// ── The duration ────────────────────────────────────────────────────────────────────────────────

describe('⛔ a workout she finished is the same length on every screen that shows it', () => {
  it('the interval session lasted forty minutes, and it logged not one set', () => {
    expect(intervals.sets.length).toBe(0);
    expect(sessionDurationMs(intervals)).toBe(40 * MIN);
    expect(sessionDurationSec(intervals)).toBe(2400);
  });

  it('the Log row and the record one tap later read the SAME forty — not 38 and 0', () => {
    expect(logScreen([intervals])).toContain('40');
    expect(recordScreen(intervals)).toContain('40');
  });

  it('⛔ …and those forty minutes reach the lifetime hours, which is the fact she cannot get back', () => {
    const agg = lifetime([intervals]);
    expect(agg.minutes).toBe(40);
  });

  it('⛔ …and the lifetime burn is priced over them instead of over nothing', () => {
    const agg = lifetime([intervals]);
    // MET 4.5 × 78 kg × ⅔ h = 234 kcal. The old sets-only span made it 0.
    expect(sessionEnergyKcal(intervals, BODY_KG)).toBe(234);
    expect(agg.kcal).toBe(234);
  });

  it('the share card prices the same session rather than skipping it for having no sets', () => {
    const weekStart = currentWeekOpen(T0);
    const card = weekCardFromHistory([intervals], weekStart, BODY_KG, 'kg', new Date(T0).toISOString());
    expect(card).not.toBeNull();
    expect(card.kcal).toBe(sessionEnergyKcal(intervals, BODY_KG));
    // A day she trained is a day she trained, even when she moved no bar on it.
    expect(card.trainedDays).toBe(1);
    expect(card.moved).toBe(0);
  });

  it('a session with neither sets nor items is zero minutes, not a NaN and not a throw', () => {
    const shell: Session = { ...intervals, id: 's_shell', items: [], sets: [] };
    expect(sessionDurationMs(shell)).toBe(0);
    expect(sessionDurationMs(null)).toBe(0);
    expect(sessionEnergyKcal(shell, BODY_KG)).toBeNull();
  });

  it('the last stamp wins, not the last row — a resumed session appends out of time order', () => {
    const s = lifted('s_resumed', T0, [
      set('bb_bench_press', 60, 8, T0 + 30 * MIN),
      set('bb_bench_press', 60, 8, T0 + 12 * MIN), // written later, happened earlier
    ]);
    expect(sessionDurationMs(s)).toBe(30 * MIN);
  });
});

// ── "Workouts completed" ────────────────────────────────────────────────────────────────────────

describe('⛔ one session yields one integer for "workouts completed"', () => {
  const history = [intervals, lifted('s_upper', T0 + DAY, [set('bb_bench_press', 60, 8, T0 + DAY + 30 * MIN)])];

  it('every reader counts the same two workouts', () => {
    expect(completedWorkouts(history)).toBe(2);
    expect(lifetime(history).workouts).toBe(2);
    expect(history.filter(sessionCountsAsWorkout).length).toBe(2);
  });

  it('⚠️ an empty shell is a workout to nobody — `trained !== false` alone once counted it', () => {
    const shell: Session = { id: 's_shell', programDayId: 'd', programDayName: 'Nothing', startedAt: new Date(T0 + 2 * DAY).toISOString(), state: 'SAVED', earlyFinish: false, sets: [], items: [] };
    expect(shell.trained).toBeUndefined(); // the pre-rule shape that used to slip through
    expect(sessionCountsAsWorkout(shell)).toBe(false);
    expect(completedWorkouts([...history, shell])).toBe(2);
    expect(lifetime([...history, shell]).workouts).toBe(2);
    expect(logScreen([...history, shell])).not.toContain('Nothing');
  });

  it('⚠️ …but a PARTIAL is still a row in her Log, and that difference is meant', () => {
    // "Only performed work is a record" (founder 2026-07-10). She lifted it, so it is written down;
    // it just did not finish the week's workout. Two questions, two predicates, both deliberate.
    const partial = lifted('s_partial', T0 + 2 * DAY, [set('bb_bench_press', 60, 8, T0 + 2 * DAY + 8 * MIN)], { trained: false });
    expect(sessionHasLoggedWork(partial)).toBe(true);
    expect(sessionCountsAsWorkout(partial)).toBe(false);
    expect(lifetime([...history, partial]).workouts).toBe(2);
    expect(logScreen([partial])).toContain('Upper A');
  });
});

// ── The tonnage ─────────────────────────────────────────────────────────────────────────────────

describe('⛔ the tonnage is one sum, clamped once', () => {
  it('a corrupt negative rep count cannot subtract from what she lifted', () => {
    const s = lifted('s_bad', T0, [set('bb_bench_press', 60, 8, T0 + 20 * MIN), set('bb_bench_press', 60, -5, T0 + 25 * MIN)]);
    expect(sessionTonnageKg(s)).toBe(480);
    expect(lifetime([s]).liftedKg).toBe(480);
    expect(totalTonnageKg([s])).toBe(480);
  });

  it('a null weight is bodyweight — no kilograms moved, and no NaN either', () => {
    const s = lifted('s_bw', T0, [set('bw_push_up', null, 15, T0 + 10 * MIN)]);
    expect(sessionTonnageKg(s)).toBe(0);
    expect(Number.isNaN(sessionTonnageKg(s))).toBe(false);
  });

  it('an items-only session moved no bar and says so — it does NOT double-count its reps', () => {
    // A `reps` item is written in the same breath as its SetLog; summing both would count twice.
    expect(sessionTonnageKg(intervals)).toBe(0);
  });
});

// ── The bests ───────────────────────────────────────────────────────────────────────────────────

describe('⛔ a best is a rep she actually did', () => {
  const abandoned = [
    lifted('s1', T0, [set('bb_bench_press', 60, 8, T0 + 20 * MIN)]),
    // A heavier load entered, then logged at zero reps — she racked it without lifting it.
    lifted('s2', T0 + DAY, [set('bb_bench_press', 80, 0, T0 + DAY + 20 * MIN)]),
    // …and the day she really did lift it.
    lifted('s3', T0 + 2 * DAY, [set('bb_bench_press', 80, 8, T0 + 2 * DAY + 20 * MIN)]),
  ];

  it('the zero-rep set earns no "up" on the Log — the guard Progress always applied', () => {
    expect(raisesBySession(abandoned).get('s2')).toBe(0);
  });

  it('⚠️ …and it does not poison the running best, so the real lift IS the raise', () => {
    expect(raisesBySession(abandoned).get('s3')).toBe(1);
  });

  it('the Log and the lifetime lens now report the same one best', () => {
    expect(totalRaises(abandoned)).toBe(1);
    expect(lifetime(abandoned, T0 + 5 * DAY).raises).toBe(1);
  });
});

// ── The week number ─────────────────────────────────────────────────────────────────────────────

describe('⛔ the card the world sees counts weeks the way the app counts them', () => {
  const memberSince = new Date(T0 - 40 * DAY).toISOString(); // joined well before her first session
  const history = [lifted('s1', T0, [set('bb_bench_press', 60, 8, T0 + 20 * MIN)])];

  it('Progress said "N weeks" and the card said something else; now they are the same number', () => {
    const weekStart = currentWeekOpen(T0);
    const card = weekCardFromHistory(history, weekStart, BODY_KG, 'kg', memberSince);
    const agg = progressAggregate(history, [], memberSince, BODY_KG, weekStart);
    expect(card.weekNumber).toBe(trainingWeekNumber(memberSince, weekStart));
    expect(card.weekNumber).toBe(agg.weeks);
    expect(card.weekNumber).toBeGreaterThan(1); // and it is NOT the count from the first session
  });

  it('⚠️ without the anchor it claims no week at all, rather than calling a veteran "Week 1"', () => {
    const card = weekCardFromHistory(history, currentWeekOpen(T0), BODY_KG, 'kg', null);
    expect(card.weekNumber).toBeNull();
  });
});
