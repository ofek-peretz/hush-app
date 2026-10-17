// @ts-nocheck
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * THE FULL SWEEP OF THE SCREENS (2026-10-11)
 *
 * FOUNDER: *"תעשה סריקה מקיפה והרמטית על כל המסכים ותוודא שאין חורים או דברים שצריך לתקן שם."*
 *
 * Four readers went over every screen, and each finding was then checked against the code before
 * anything was changed. What follows is what was TRUE, one section per hole, each with the way it
 * was reached — so the next sweep starts from a closed door rather than from a memory of one.
 *
 * ⚠️ MOST OF THESE WERE GREEN WHEN THEY WERE FOUND. The pain report's line was pinned by a law that
 * read the source and passed; the wrist's names were photographed from fixtures typed in Hebrew.
 * Where a behaviour can be run, it is run here; a source pin is the fallback, never the first choice.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'node:fs';
import path from 'node:path';

import { addWorkingSet, reorderBoundary } from '@/state/stores/sessionStore';
import { easesAfterReport, liftsForbiddenNow } from '@/domain/painReport';
import { equipmentDelta } from '@/domain/loadPresentation';
import { liftPosition, summaryLifts } from '@/platform/sessionMirror';
import {
  FREE_SESSION_LIMIT,
  TRIAL_MAX_DAYS,
  __resetTrialForTest,
  freeSessionsRemaining,
  isTrainingGated,
  trialDaysLeft,
  trialEndedByTime,
} from '@/domain/entitlement';
import { erasedRecord, readRecord } from '@/domain/record';
import { fixedLines } from '@/domain/voiceLinesAhead';
import { voiceScript } from '@/domain/voiceScript';
import { exerciseById } from '@/data/exercises';
import { initI18n } from '@/i18n';
import { inHerUnits } from '@/i18n/herUnits';

const MOBILE = path.join(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(MOBILE, rel), 'utf8');
const code = (src: string): string => src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const he = JSON.parse(read('src/i18n/locales/he.json'));
const en = JSON.parse(read('src/i18n/locales/en.json'));

beforeAll(async () => {
  await initI18n();
});

/* ───────────────────────────────────────────────────────────── the live workout ── */

function step(ex: string, i: number, n: number, at: number) {
  return {
    exerciseId: ex,
    globalIndex: at,
    exerciseSetIndex: i,
    totalSetsInExercise: n,
    target: { exerciseId: ex, setIndex: i, recommendedWeight: 40, recommendedReps: 10, repBandLo: 10, repBandHi: 12 },
    restAfterS: 60,
    lastSetOfExercise: i === n - 1,
    lastSetOfSession: false,
  };
}

describe('"+1 set" can never strand a set', () => {
  // A superset as the machine holds it: one step per run — A, B, A, B, A, B.
  const superset = ['a', 'b', 'a', 'b', 'a', 'b'].map((ex, at) => step(ex, Math.floor(at / 2), 3, at));

  it('⛔ inside a superset it adds nothing — the next number is already taken by the next round', () => {
    // Resting after B's first round: the boundary is A's second round.
    expect(addWorkingSet(superset, 2, 'b')).toBe(superset);
    expect(addWorkingSet(superset, 2, 'a')).toBe(superset);
  });

  it('…and on the LAST round, where the number is free, it still adds', () => {
    const out = addWorkingSet(superset, 6, 'b');
    expect(out).toHaveLength(7);
    expect(out[6]).toMatchObject({ exerciseId: 'b', exerciseSetIndex: 3 });
    // no two steps of one lift share a number — the thing `hasLoggedStep` depends on
    const keys = out.map((s) => `${s.exerciseId}#${s.exerciseSetIndex}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('the stage does not draw the control where the store would refuse it', () => {
    const flow = read('src/screens/session/SessionFlow.tsx');
    expect(flow).toContain('session.currentExerciseId && session.currentTarget && !session.superset && !session.nextSuperset ? (');
  });
});

describe('a pain report reaches the workout she is standing in — on the FIRST report', () => {
  const chestDay = ['bb_bench_press', 'db_incline_press', 'lat_pulldown'];
  const patternOf = (id: string) => exerciseById(id)?.pattern;

  it('⛔ the eases AFTER the report forbid the chest press; the profile from before it forbids nothing', () => {
    const now = Date.parse('2026-10-11T10:00:00Z');
    expect(liftsForbiddenNow(chestDay, undefined, now, patternOf)).toEqual([]); // what the screen used to ask
    const after = easesAfterReport(undefined, 'Chest', 'pain', now);
    expect(liftsForbiddenNow(chestDay, after, now, patternOf)).toContain('bb_bench_press');
  });

  it('a second report on the same muscle replaces its window; another muscle keeps its own', () => {
    const now = Date.parse('2026-10-11T10:00:00Z');
    const first = easesAfterReport(undefined, 'Chest', 'twinge', now);
    const second = easesAfterReport(first, 'Chest', 'pain', now + 1000);
    expect(second.filter((e) => e.muscle === 'Chest')).toHaveLength(1);
    expect(second[0].severity).toBe('pain');
    expect(easesAfterReport(second, 'Back', 'pain', now + 2000).map((e) => e.muscle).sort()).toEqual(['Back', 'Chest']);
  });

  it('the store saves from the same list the screen asks', () => {
    expect(code(read('src/state/stores/appStore.tsx'))).toContain('painEases: easesAfterReport(state.profile.painEases, muscle, severity, now)');
  });

  it('⛔ a live edit starts where the future starts — never on the set just logged', () => {
    const store = code(read('src/state/stores/sessionStore.tsx'));
    const body = store.slice(store.indexOf('reviseToday(edits) {'), store.indexOf('swapNextExercise(exerciseId) {'));
    expect(body).toContain('const from = reorderBoundary(machine);');
    expect(body).not.toContain('const from = machine.setIndex;');
    // the boundary itself: on a rest the cursor is still on the logged set, and the future is one on
    expect(reorderBoundary({ phase: 'REST_INTER', setIndex: 3 })).toBe(4);
    expect(reorderBoundary({ phase: 'SET_PRESENTED', setIndex: 3 })).toBe(3);
  });
});

describe('the number pad cannot leave a slip of the thumb in the record', () => {
  const flow = read('src/screens/session/SessionFlow.tsx');
  const pad = flow.slice(flow.indexOf('const onPadKey = (k: string) => {'), flow.indexOf('/** Open a field with the pad.'));

  it('⛔ an emptied field hands the prescription back — reps and weight alike', () => {
    expect(pad).toContain('else if (plannedRepsRef.current != null) session.editCurrentSet({ weight: target.recommendedWeight, reps: plannedRepsRef.current });');
    expect(pad).toContain('else if (plannedWeightRef.current != null) session.editCurrentSet({ weight: plannedWeightRef.current, reps: repsNow });');
    expect(flow).toContain('plannedRepsRef.current = session.currentTarget?.recommendedReps ?? null;');
  });

  it('⛔ and a number no bar has carried is refused at the key', () => {
    expect(pad).toContain('if (kg != null && kg > STATED_LIFT_MAX_KG) return;');
    expect(pad).toContain('if (typed && v > MAX_TYPED_REPS) return;');
    expect(flow).toMatch(/const MAX_TYPED_REPS = 100;/);
  });
});

describe('a set she was shown as logged is logged', () => {
  const flow = read('src/screens/session/SessionFlow.tsx');

  it('⛔ Pause during the beat writes the set first, then freezes the workout', () => {
    const pause = flow.slice(flow.indexOf('function openPause() {'), flow.indexOf('function resume() {'));
    expect(pause).toContain('const flush = flushConfirmRef.current;');
    expect(pause.indexOf('void flush().then((ended) => {')).toBeLessThan(pause.indexOf('session.pause(); // the effect above'));
    expect(pause).toContain('if (ended) return;');
    // the beat registers its own write, and runs it at most once
    expect(flow).toContain('flushConfirmRef.current = () => {');
    expect(flow).toMatch(/if \(written\) return false;\s+written = true;/);
  });

  it('⛔ a Pause in the same breath as a logged set cannot put the stage back on that set', () => {
    /*
     * Found by WALKING the fix above, not by reading it: complete, then Pause at once. The set was in
     * the record and the stage was back on it, with a Complete that did nothing — the Pause had
     * reduced from the machine BEFORE the set, because logging a set did not move `machineRef`.
     */
    const store = read('src/state/stores/sessionStore.tsx');
    expect(store).toMatch(/machineRef\.current = m;\s+dispatch\(\{ type: 'LOG', setLog, session: updated, machine: m \}\);/);
  });

  it('⛔ a workout ends once, whoever asked twice', () => {
    const store = read('src/state/stores/sessionStore.tsx');
    expect(store).toMatch(/async function finalize\(earlyFinish: boolean\): Promise<CompleteResult> \{\s+if \(finalizingRef\.current\) return \{ ended: false, unlockedPortrait: false \};\s+finalizingRef\.current = true;\s+try \{\s+return await finalizeOnce\(earlyFinish\);\s+\} finally \{\s+finalizingRef\.current = false;/);
  });
});

describe('the arrow beside the load is measured on the figure it stands beside', () => {
  it('⛔ a bar that went 60 → 62.5 moved 1.25 a side, not 2.5', () => {
    expect(equipmentDelta('bb_bench_press', 62.5, 60, 'kg')).toBe(1.25);
  });

  it('a stack moves its whole pin; a move that rounds away draws nothing', () => {
    expect(equipmentDelta('lat_pulldown', 50, 45, 'kg')).toBe(5);
    expect(equipmentDelta('bb_bench_press', 60, 60, 'kg')).toBeNull();
    expect(equipmentDelta('pull_up', null, null, 'kg')).toBeNull();
  });

  it('the stage draws that figure and never the total’s move', () => {
    const flow = read('src/screens/session/SessionFlow.tsx');
    expect(flow).toContain("{`${news.direction === 'up' ? '↑' : '↓'}${newsFigure}`}");
    expect(flow).not.toContain('${displayWeight(news.deltaKg, units)}`}');
  });
});

/* ───────────────────────────────────────────────────────── three surfaces, one name ── */

describe('the wrist and the lock screen say what the phone says', () => {
  const store = code(read('src/state/stores/sessionStore.tsx'));
  const steps = store.slice(store.indexOf('function buildMirrorSteps('), store.indexOf('const setup = loadSetup(st.exerciseId, st.target.recommendedWeight') + 400);

  it('⛔ every mirrored step carries her language’s name — never the catalogue’s English key', () => {
    expect(steps.match(/exerciseName: exerciseDisplayName\(st\.exerciseId\),/g)).toHaveLength(2);
    expect(steps).not.toMatch(/exerciseName: ex\?\.name/);
    // the swap options are matched against that name on the wrist (Undo), so they speak it too — asked
    // through the ONE definition the live mirror and the wrist-alone plan share (2026-10-17, stage 4)
    expect(steps).toContain('wristSwapOptions(st.exerciseId, sessionExerciseIds, equipment)');
    expect(code(read('src/platform/watch/watchLoad.ts'))).toContain('name: exerciseDisplayName(c.exercise.id)');
    expect(code(read('src/platform/watch/watchPlan.ts'))).toContain('exerciseName: exerciseDisplayName(item.ex),');
  });

  it('⛔ the medallion on the wrist is in her language', () => {
    expect(store).not.toContain("getFixedT('en')");
    expect(store).toContain('milestoneCopy(earned, tg as unknown as Translate,');
  });

  it('⛔ "lift 2 of 5" counts LIFTS — a superset is two lifts, not six runs', () => {
    const names = ['Bench', 'Row', 'Bench', 'Row', 'Bench', 'Row', 'Curl', 'Dip', 'Plank'];
    const mirror = names.map((exerciseName) => ({ exerciseName }));
    expect(liftPosition(mirror, 0)).toEqual({ index: 1, count: 5 });
    expect(liftPosition(mirror, 3)).toEqual({ index: 2, count: 5 }); // Row, on its second round
    expect(liftPosition(mirror, 6)).toEqual({ index: 3, count: 5 });
    expect(liftPosition(mirror, 8)).toEqual({ index: 5, count: 5 });
    // …and the wrist's own engine counts the same way
    const swift = read('targets/watch/LocalWorkoutEngine.swift');
    expect(swift).toContain('for s in state.steps where !order.contains(s.exerciseId) { order.append(s.exerciseId) }');
    expect(swift).not.toContain('runs += 1');
  });

  it('⛔ no surface says "BW"', () => {
    const lifts = summaryLifts([{ exerciseName: 'מתח', targetWeight: null, targetReps: 12 }], 1, [{ weight: null, reps: 11 }]);
    expect(lifts).toEqual([{ name: 'מתח', best: '× 11' }]);
    expect(read('targets/watch/LocalWorkoutEngine.swift')).not.toContain('?? "BW"');
    expect(read('targets/widget/HushLiveActivityWidget.swift')).not.toContain('· BW ×');
    expect(read('targets/widget/HushLiveActivityWidget.swift')).toContain('\\(s.wordNext) · \\(s.wordBodyweight) × \\(r)');
  });

  it('the home-screen widget names and times the day as Today does', () => {
    const widget = code(read('src/platform/homeWidget.ts'));
    expect(widget).toContain('title: dayTitle(next.name),');
    expect(widget).toContain('min: plannedMinutes(next.minutes)');
    expect(code(read('src/screens/home/Home.tsx'))).toContain("`${plannedMinutes(todayCoach.minutes)} ${t('common.minShort')}`");
  });

  it('a past workout opens under the name its row had', () => {
    expect(code(read('src/screens/history/WorkoutDetail.tsx'))).toContain("dayName={session ? dayTitle(sessionDayName(session)) : ''}");
    const home = code(read('src/screens/home/Home.tsx'));
    expect(home).toContain('detail: dayTitle(sessionDayName(last)),');
    expect(home).not.toMatch(/toLocaleDateString\(\)/);
  });
});

/* ─────────────────────────────────────────────────────────────── the free workouts ── */

describe('the counter and the gate are one sentence', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const joined = '2026-10-01T08:00:00.000Z';
  const start = Date.parse(joined);
  beforeEach(() => __resetTrialForTest());
  afterAll(() => __resetTrialForTest());

  it('⛔ once the days are spent, no screen can say a free workout is left', () => {
    const late = start + (TRIAL_MAX_DAYS as number) * DAY + 1;
    expect(isTrainingGated(1, false, joined, late)).toBe(true);
    expect(freeSessionsRemaining(1, joined, late)).toBe(0);
    expect(trialEndedByTime(1, joined, late)).toBe(true);
    // inside the window the count is the count
    expect(freeSessionsRemaining(1, joined, start + DAY)).toBe(FREE_SESSION_LIMIT - 1);
    expect(trialEndedByTime(1, joined, start + DAY)).toBe(false);
    // spent by COUNT is not "ended by time" — the wall says the truer thing
    expect(trialEndedByTime(FREE_SESSION_LIMIT, joined, late)).toBe(false);
  });

  it('for every count and every day, "none left" and "gated" agree', () => {
    for (let done = 0; done <= FREE_SESSION_LIMIT + 1; done++) {
      for (let day = 0; day <= (TRIAL_MAX_DAYS as number) + 2; day++) {
        const now = start + day * DAY + 5;
        expect({ done, day, gated: isTrainingGated(done, false, joined, now) }).toEqual({ done, day, gated: freeSessionsRemaining(done, joined, now) === 0 });
      }
    }
  });

  it('the days left are said, and reach zero exactly when the gate closes', () => {
    expect(trialDaysLeft(joined, start)).toBe(TRIAL_MAX_DAYS);
    expect(trialDaysLeft(joined, start + 13 * DAY + 1)).toBe(1);
    expect(trialDaysLeft(joined, start + (TRIAL_MAX_DAYS as number) * DAY)).toBe(0);
    expect(trialDaysLeft(undefined, start)).toBeNull();
  });

  it('every reader passes the date she joined', () => {
    expect(code(read('src/screens/home/Home.tsx'))).toContain('freeSessionsRemaining(app.modeState.completedSessions, app.profile?.memberSince)');
    expect(code(read('src/screens/profile/ProfileSheet.tsx'))).toContain('freeSessionsRemaining(app.modeState.completedSessions, app.profile?.memberSince)');
    const wall = code(read('src/screens/subscription/Paywall.tsx'));
    expect(wall).toContain('const endedByTime = trialEndedByTime(app.modeState.completedSessions, app.profile?.memberSince);');
    expect(wall).toContain("? t('paywall.trialDays', { days: TRIAL_MAX_DAYS ?? 0 })");
    expect(code(read('src/platform/trialCatch.ts'))).toContain('freeSessionsRemaining(completed, profile?.memberSince, nowMs + FIRE_AFTER_MS)');
  });

  it('⛔ and the clock is SAID where the free workouts are promised', () => {
    expect(code(read('src/screens/onboarding/ProgramCreated.tsx'))).toContain("{TRIAL_MAX_DAYS != null ? ` ${t('ob.readyWithin', { days: TRIAL_MAX_DAYS })}` : ''}");
    expect(code(read('src/screens/profile/ProfileSheet.tsx'))).toContain("t('profile.trialDaysLeft', { count: trialDaysLeft(app.profile?.memberSince) ?? 0 })");
    for (const l of [he, en]) {
      expect(l.ob.readyWithin).toContain('{{days}}');
      expect(l.paywall.trialDays).toContain('{{days}}');
      expect(l.profile.trialDaysLeft_other).toContain('{{count}}');
    }
  });
});

/* ───────────────────────────────────────────────────────────── deleted means deleted ── */

describe('a wiped account does not come back from her iCloud', () => {
  it('⛔ what the wipe leaves in the cloud is not a record — the boot restores nothing from it', () => {
    const left = JSON.parse(JSON.stringify(erasedRecord(Date.parse('2026-10-11T10:00:00Z'))));
    expect(left).toEqual({ erased: true, at: '2026-10-11T10:00:00.000Z' });
    expect(readRecord(left)).toEqual({ ok: false, why: 'not_a_record' });
  });

  it('⛔ both wipes unmake the cloud copy BEFORE they clear the phone, and neither waits for ever', () => {
    const store = code(read('src/state/stores/appStore.tsx'));
    for (const verb of ['async resetAccount() {', 'async deleteAccount() {']) {
      const from = store.indexOf(verb);
      const body = store.slice(from, store.indexOf("dispatch({ type: 'RESET' });", from));
      expect(body.indexOf('within(cloudErase(), WIPE_WAIT_MS, false)')).toBeGreaterThan(0);
      expect(body.indexOf('within(cloudErase(), WIPE_WAIT_MS, false)')).toBeLessThan(body.indexOf('await db.clearAll();'));
    }
    expect(store).toContain('within(deleteIdentity().catch(() => false), WIPE_WAIT_MS, false)');
    expect(code(read('src/platform/cloudBackup.ts'))).toContain('return await cloud.backup(JSON.stringify(erasedRecord(nowMs)));');
  });

  it('the buttons say they are working, and take one press', () => {
    const sheet = code(read('src/screens/profile/ProfileSheet.tsx'));
    expect(sheet).toContain("label={t('profile.signOut')} disabled={wiping} onPress={() => wipe(app.resetAccount)}");
    expect(sheet).toContain("label={t('profile.deleteAccount')} disabled={wiping} onPress={() => wipe(app.deleteAccount)}");
    expect(sheet).toMatch(/function wipe\(run: \(\) => Promise<void>\) \{\s+if \(wiping\) return;/);
  });
});

/* ─────────────────────────────────────────────────────── copy that tells the truth ── */

describe('the engine’s sentences are read in her units', () => {
  it('⛔ a pound athlete is told pounds, in the sentence and in its word', () => {
    const lb = inHerUnits({ ex: 'Bench', delta: 2.2679618 }, 'lb');
    expect(lb.delta).toBe(5);
    expect(lb.unit).toBe(en.common.unitLb);
    const kg = inHerUnits({ ex: 'Bench', load: 62.5 }, 'kg');
    expect(kg).toMatchObject({ load: 62.5, unit: en.common.unitKg });
  });

  it('⛔ no engine sentence bakes a unit in — each takes {{unit}}', () => {
    for (const l of [he, en]) {
      for (const k of ['text', 'action', 'textMet']) expect(l.explain.progressLoad[k]).toContain('{{unit}}');
      for (const k of ['text', 'action']) expect(l.explain.reprice[k]).toContain('{{unit}}');
      expect(JSON.stringify(l.explain)).not.toMatch(/ק״ג| kg\b/);
      expect(l.workout.itemCarrying).toContain('{{unit}}');
    }
  });

  it('every screen that draws one converts it', () => {
    expect(code(read('src/screens/session/WellDone.tsx'))).toContain("t(g.reason.key, inHerUnits(g.reason.params, units ?? 'kg'))");
    expect(code(read('src/screens/weekly/WeeklyUpdate.tsx'))).toContain('inHerUnits(l.change!.explanation.text.params, units)');
    expect(code(read('src/components/WhyChangedSheet.tsx'))).toContain("inHerUnits(c.line.params, c.unit === 'lb' ? 'lb' : 'kg')");
    expect(code(read('src/screens/session/ItemStage.tsx'))).toContain("t('workout.itemCarrying', inHerUnits({ load: item.load }, units))");
  });
});

describe('nothing is promised that the product does not do', () => {
  it('⛔ the privacy text claims no recording, no body map, no photographed routine', () => {
    expect(en.legal.privacyBody).not.toMatch(/recordings|body map|photographed|You tab/);
    expect(he.legal.privacyBody).not.toMatch(/הקלטות|מפת הגוף|שצילמת|בלשונית/);
    // …and it says the two things that are true and were missing
    expect(en.legal.privacyBody).toContain('does not record you');
    expect(en.legal.privacyBody).toContain('the iCloud backup');
    expect(he.legal.privacyBody).toContain('אינה מקליטה');
  });

  it('the Health step sells no run distance; a rested muscle is not "in your map"; the reminder names no fixed hour as a law', () => {
    expect(read('src/screens/onboarding/ConnectHealth.tsx')).not.toContain("t('ob.healthKm')");
    expect(he.ob.healthKm).toBeUndefined();
    expect(he.pain.easedFor).not.toContain('במפה');
    expect(en.pain.easedFor).not.toContain('map');
    expect(en.profile.reminderSub).not.toContain('finished week');
  });

  it('⛔ a new week is asked of the coach — the editor has no door to the local assembler', () => {
    const builder = code(read('src/screens/plan/PlanBuilder.tsx'));
    expect(builder).toContain("label={t('builder.newWeek')} onPress={() => setAsking(true)}");
    expect(builder).not.toContain("t('builder.revertYes')");
    expect(builder).not.toContain('onPress={props.onRevert}');
  });

  it('⛔ the coach’s voice has the two lines a workout with no microphone actually says', () => {
    const lines = fixedLines();
    expect(lines).toContain(voiceScript.openFirstSessionMark());
    expect(lines).toContain(voiceScript.pausedNoEar());
  });
});
