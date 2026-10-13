// @ts-nocheck
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * THE WRIST IS TOLD A SUPERSET (2026-10-11)
 *
 * The founder on the superset: *"שזה יהיה מוצג אחרת לגמרי כי כרגע זה לא ברור בכלל."* The phone
 * was rebuilt first (`SupersetBlock`); the wrist still alternated the pair under "SHOULDERS · 2/3",
 * "TRICEPS · 2/3", "SHOULDERS · 3/3" and a rest strip counting "LIFT 4/6 … 5/6 … 4/6" — nothing on
 * it had ever heard the word. His word on the open items: *"טפל … ותוודא בצורה הרמטית שזה סגור
 * ונעול."*
 *
 * The wire carries four integers — round, rounds, position, count — read from the plan by the one
 * rule the phone's own stage uses, and the wrist's strip says them: on a set which of the pair she
 * is on and which round, on a rest which round it leads into.
 *
 * ⚠️ A WORKOUT THE WRIST RUNS ALONE (phone absent) used to list each lift's sets in a row and never
 * alternate a pair — "so there is no superset there to name", this note said. Since 2026-10-13 it
 * runs the phone's own order and names the superset from the step (`theWristRunsWhatThePhoneRuns`
 * plays that on the watch's real engine; the last describe here pins the source).
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildMirrorSteps } from '@/state/stores/sessionStore';
import { projectSessionMirror } from '@/platform/sessionMirror';
import he from '@/i18n/locales/he.json';
import en from '@/i18n/locales/en.json';

const MOBILE = path.join(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(MOBILE, rel), 'utf8');
const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

/** bench ×2 · three rounds of raise + pushdown · curl ×1 — rest 0 inside a round, as `planRun` writes it. */
const step = (exerciseId: string, i: number, n: number, m: number, restAfterS?: number) => ({
  exerciseId,
  globalIndex: i,
  exerciseSetIndex: n,
  totalSetsInExercise: m,
  target: { exerciseId, setIndex: n, recommendedWeight: 20, recommendedReps: 10, repBandLo: 10, repBandHi: 12 },
  ...(restAfterS != null ? { restAfterS } : {}),
});
const PLAN = [
  step('bb_bench_press', 0, 0, 2, 150),
  step('bb_bench_press', 1, 1, 2, 120),
  step('lateral_raise', 2, 0, 3, 0),
  step('rope_pushdown', 3, 0, 3, 90),
  step('lateral_raise', 4, 1, 3, 0),
  step('rope_pushdown', 5, 1, 3, 90),
  step('lateral_raise', 6, 2, 3, 0),
  step('rope_pushdown', 7, 2, 3, 120),
  { ...step('db_curl', 8, 0, 1), lastSetOfSession: true },
];

describe('⛔ every step of a pair knows the pair — and no other step does', () => {
  const steps = buildMirrorSteps(PLAN);

  it('both lifts carry round, rounds, position and count; the lifts around them carry nothing', () => {
    expect(steps.map((s) => s.superset ?? null)).toEqual([
      null,
      null,
      { round: 1, rounds: 3, position: 1, count: 2 },
      { round: 1, rounds: 3, position: 2, count: 2 },
      { round: 2, rounds: 3, position: 1, count: 2 },
      { round: 2, rounds: 3, position: 2, count: 2 },
      { round: 3, rounds: 3, position: 1, count: 2 },
      { round: 3, rounds: 3, position: 2, count: 2 },
      null,
    ]);
  });

  it('an ordinary step is the object it always was — no key, not a null one', () => {
    expect('superset' in steps[0]).toBe(false);
    expect('superset' in steps[8]).toBe(false);
  });

  it('it is the one rule the stage draws from, not a second reading of the plan', () => {
    const store = code(read('src/state/stores/sessionStore.tsx'));
    expect(store).toContain('const round = sessionSupersetAt(plan, at);');
    expect(store).toContain('superset: { round: round.round, rounds: round.rounds, position: round.position, count: round.exerciseIds.length }');
  });
});

describe('⛔ the frame carries the superset that matters NOW', () => {
  const mirror = code(read('src/platform/sessionMirror.ts'));

  it('on a set, the one the set is in; on a rest, the one the rest leads into; otherwise no key at all', () => {
    expect(mirror).toContain('...((resting ? next?.superset : cur.superset) ? { superset: resting ? next!.superset : cur.superset } : {}),');
    // Never `superset: null`: an ordinary frame stays byte-for-byte what it was.
    expect(mirror).not.toMatch(/superset:\s*[^,\n]*\?\?\s*null/);
  });

  it('the wrist can decode it, and a frame without it still decodes', () => {
    const wire = code(read('targets/watch/WatchWire.swift'));
    expect(wire).toMatch(/struct WireSuperset: Codable, Equatable \{\s*var round: Int\s*var rounds: Int\s*var position: Int\s*var count: Int\s*\}/);
    // Optional, declared the way every other optional of the frame is — `watchWireParity` reads the
    // `?` to know a frame without it still decodes.
    expect(wire).toMatch(/var superset: WireSuperset\?\s*\n/);
    // The wrist ALONE names it too (2026-10-13): off the step on a set, off the NEXT step on a rest —
    // the same choice the phone's projector makes — and a pause keeps the one it froze.
    const engine = read('targets/watch/LocalWorkoutEngine.swift');
    expect(engine).toContain('m.superset = cur.superset');
    expect(engine).toContain('m.superset = next?.superset');
    expect(engine).toContain('p.superset = isResting(state.pausedFrom ?? "active_set") ? next?.superset : cur.superset');
    // …and it goes straight on inside a round, by the phone's own line.
    expect(engine).toContain('if let said = step.restAfterS, said <= REST_SKIP_THRESHOLD_S {');
    expect(wire).toContain('let REST_SKIP_THRESHOLD_S = 5');
    expect(read('src/state/machines/sessionState.ts')).toContain('export const REST_SKIP_THRESHOLD_S = 5;');
  });
});

describe('⛔ the wrist says it — on both lifts and on the rest between rounds', () => {
  const screens = code(read('targets/watch/WatchScreens.swift'));

  it('one extension writes the line and its short form, from her own two words', () => {
    const ext = screens.slice(screens.indexOf('extension WireSuperset {'), screens.indexOf('private struct FerroxHorns'));
    expect(ext).toContain('var line: String { "\\(WatchCopy.supersetWord.uppercased()) · \\(WatchCopy.roundWord.uppercased()) \\(round)/\\(rounds)" }');
    expect(ext).toContain('var lineBrief: String { "\\(WatchCopy.supersetWord.uppercased()) \\(round)/\\(rounds)" }');
  });

  it('⛔ the WORD is the last thing to go — photographed 2026-10-11', () => {
    // The first cut gave way to "1/2 · ROUND 2/3" on both cases: two fractions and no word. Every
    // form the wrist can draw now carries the word; nothing falls back to figures alone.
    const ext = screens.slice(screens.indexOf('extension WireSuperset {'), screens.indexOf('private struct FerroxHorns'));
    const forms = [...ext.matchAll(/var (\w+): String \{ "([^"]+)" \}/g)].map((m) => ({ name: m[1], says: m[2] }));
    expect(forms.map((f) => f.name).sort()).toEqual(['line', 'lineBrief']);
    for (const f of forms) expect(f.says).toContain('WatchCopy.supersetWord');
  });

  it('the set screen: the superset and its round where the muscle and the set count stood', () => {
    expect(screens).toMatch(/if let pair = mirror\.superset \{\s*ViewThatFits\(in: \.horizontal\) \{\s*positionLine\(pair\.line\)\s*positionLine\(pair\.lineBrief\)\.minimumScaleFactor\(0\.75\)\s*\}\s*\} else \{\s*ViewThatFits\(in: \.horizontal\) \{\s*positionLine\(setPosition\)/);
  });

  it('both rests: the round it leads into, not "lift 4/6"', () => {
    const strips = screens.match(/if let pair = mirror\.superset \{\s*TopStrip\(text: pair\.line, short: pair\.lineBrief, controlsHint: true\)\s*\} else \{/g) ?? [];
    expect(strips).toHaveLength(2); // the rest between sets, and the crossing
    expect(screens).toContain('TopStrip(lift: (mirror.liftIndex ?? 1, mirror.liftCount ?? 1), controlsHint: true)');
    expect(screens).toContain('TopStrip(text: crossing, short: crossingShort, controlsHint: true)');
  });

  it('her two words ride the copy pack in both languages, and the wrist has a fallback for each', () => {
    expect(he.watch.supersetWord).toBe('סופרסט');
    expect(he.watch.roundWord).toBe('סבב');
    expect(en.watch.supersetWord).toBe('SUPERSET');
    expect(en.watch.roundWord).toBe('ROUND');
    const copy = read('targets/watch/WatchCopy.swift');
    expect(copy).toContain('static var supersetWord: String { L("supersetWord", "SUPERSET") }');
    expect(copy).toContain('static var roundWord: String { L("roundWord", "ROUND") }');
  });

  it('it is PHOTOGRAPHED: the gallery draws the first lift, the second, and the rest before a round', () => {
    const frames = read('native-tests/watch-gallery/build-frames.cjs');
    for (const shot of ['23-superset-first', '24-superset-second', '25-superset-rest']) expect(frames).toContain(`'${shot}'`);
    expect(frames).toContain('superset: { round: 2, rounds: 3, position: 1, count: 2 }');
    expect(frames).toContain('superset: { round: 2, rounds: 3, position: 2, count: 2 }');
  });
});

/*
 * ⛔ "TAKEN", INSIDE A SUPERSET (2026-10-13). The phone now moves a superset as one thing and lands
 * nothing inside a round she has begun (`aSupersetIsOnlyEverWritten`). The wrist's offer asked only
 * "is there a different lift ahead?" — and inside a superset the partner always is. So it offered
 * the verb on both halves of every round, and on a superset that ends the workout; pressed on the
 * second half it was accepted, buzzed, and changed nothing she could see.
 */
describe('⛔ the wrist offers "taken" only where pressing it moves something', () => {
  const frame = (plan, setIndex) =>
    projectSessionMirror({
      steps: buildMirrorSteps(plan),
      total: plan.length,
      machine: { phase: 'SET_PRESENTED', resumePhase: null, setIndex, isLastSetOfSession: setIndex === plan.length - 1, earlyFinish: false },
      restInterS: 90,
      restTransitionS: 120,
      restStartedAtMs: null,
      nowMs: Date.UTC(2026, 9, 13, 10, 0, 0),
    });

  it('on an ordinary lift, as it always was: yes while another lift lies ahead, no on the last', () => {
    expect(frame(PLAN, 0).canMarkBusy).toBe(true);
    expect(frame(PLAN, 8).canMarkBusy).toBe(false);
  });

  it('on the FIRST lift of a round — the whole superset steps aside — and never on the second', () => {
    expect([2, 4, 6].map((i) => frame(PLAN, i).canMarkBusy)).toEqual([true, true, true]);
    expect([3, 5, 7].map((i) => frame(PLAN, i).canMarkBusy)).toEqual([false, false, false]);
  });

  it('a superset that ENDS the workout has nowhere to step aside to: not offered at all', () => {
    const ending = PLAN.slice(0, 8).map((st, i) => ({ ...st, lastSetOfSession: i === 7 }));
    expect([2, 3, 4, 5, 6, 7].map((i) => frame(ending, i).canMarkBusy)).toEqual([false, false, false, false, false, false]);
    expect(frame(ending, 0).canMarkBusy).toBe(true); // the bench before it can still step past it
  });

  it('…and a press that arrives anyway on the second half moves nothing on the phone either', () => {
    const store = code(read('src/state/stores/sessionStore.tsx'));
    expect(store).toMatch(/markEquipmentOccupied\(\) \{[\s\S]{0,400}?const round = plan\[boundary\] \? sessionSupersetAt\(plan, boundary\) : null;\s+if \(round && round\.position > 1\) return;/);
  });
});
