import fs from 'fs';
import path from 'path';

/**
 * ════ TWENTY-THREE SCREENS, AND A RELAYOUT THAT QUIETLY DROPPED THREE ════
 *
 * The 2026-08-01 redesign rewrote most of `WatchScreens.swift` in one pass, and it lost three beats
 * without a single test noticing:
 *
 *   · WT5's "your pace" — the line that tells her the rest timer is running on HER measured median
 *     rather than a default. Without it the app uses her data and never says so.
 *   · WT10's "Bench, done." — deleted from the transition rest for crowding (correctly), but not
 *     given the screen the canonical says it has, so the beat simply ceased to exist.
 *   · the transition card's ▲/▼ mark — a new lift's load could move and say nothing about it.
 *
 * Each was one line inside a two-hundred-line rewrite. Nothing failed, the audit was green, and the
 * only reason they were found is that someone diffed against the previous commit by hand.
 *
 * ── WHY THIS IS A SOURCE LAW ────────────────────────────────────────────────────────────────────
 * There is no Xcode on this box and jest cannot drive a watch. What CAN be held mechanically is
 * that the canonical vocabulary still appears in the file — every screen the design names, and the
 * copy key that is its whole reason to exist. It does not prove a screen looks right. It proves
 * nobody deleted one while tidying.
 */

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'targets', 'watch', 'WatchScreens.swift'), 'utf8',
);
const MODEL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'targets', 'watch', 'WatchModel.swift'), 'utf8',
);

/**
 * The canonical set, from `_v7_handoff/HUSH_V7_ALL_DARK.html` — the founder's supreme reference.
 * Each entry is the screen and the ONE thing in the source that only that screen would have.
 */
const CANONICAL: Array<[string, string]> = [
  ['WT1 · TODAY', 'private var lobbyFace'],
  ['WT1b · CHOOSE WORKOUT', 'struct ChooseOverlay'],
  ['WT2 · THE SET', 'private var readout'],
  ['WT3 · THE CORRECTION', 'struct CorrectionScreen'],
  ['WT4 · REST', 'struct InterRestScreen'],
  ['WT5 · REST — LEARNED', 'WatchCopy.yourPace'],
  ['WT6 · SESSION EARNED', 'WatchCopy.thatsTheWork'],
  ['WT7 · THE FIRST FOUR', 'private var firstWorkoutFace'],
  ['WT8 · MILESTONE', 'private func milestoneBeat'],
  ['WT9 · EDIT SET', 'private var editor'],
  ['WT10 · EXERCISE DONE', 'WatchCopy.liftDone'],
  ['WT11 · TRANSITION REST', 'struct TransitionRestScreen'],
  ['WT11b · SWAP', 'WatchCopy.swapTitle'],
  ['WT12 · THE SCAN', 'private var readBack'],
  ['WT13 · PAUSED', 'struct PausedScreen'],
  ['WT13b · END?', 'struct EndConfirmScreen'],
  ['WT13c · GLANCE', 'struct GlanceScreen'],
  ['WT14 · WHAT’S OFF', 'struct PainAreaScreen'],
  ['WT14b · HOW SHARP?', 'struct PainSeverityScreen'],
  ['WT15 · ENGINE RESPONDS', 'struct PainAcknowledgedScreen'],
  ['CR1 · READY', 'WatchCopy.startCardio'],
  ['CR2 · LIVE', 'struct CardioStageScreen'],
  ['CR3 · KM LOGGED', 'struct KmLoggedScreen'],
  ['CR4 · DONE', 'WatchCopy.thatsTheDistance'],
];

describe('every screen the design names still exists', () => {
  it.each(CANONICAL)('%s', (_screen, marker) => {
    expect(SRC.includes(marker)).toBe(true);
  });
});

describe('the marks that only appear when the engine moved something', () => {
  it('⚠️ draws the direction on a NEW lift whose load changed', () => {
    /*
     * The transition card lost its ▲/▼ in the relayout. A load that moved and says nothing about it
     * is precisely what the founder's colour ruling of 2026-07-29 exists to prevent — and on a new
     * lift she has no previous number on screen to compare against, so the mark is the only signal
     * there is.
     */
    const at = SRC.indexOf('struct TransitionRestScreen');
    const body = SRC.slice(at, SRC.indexOf('// MARK: Cardio', at));
    expect(body).toContain('LoadDelta(deltaKg: mirror.nextLoadDeltaKg');
  });

  it('says the rest is HERS, once the median is hers', () => {
    const at = SRC.indexOf('struct InterRestScreen');
    const body = SRC.slice(at, SRC.indexOf('// MARK: 05', at));
    expect(body).toContain('mirror.restIsLearned == true');
  });
});

describe('the two beats between a logged set and a rest cannot collide', () => {
  it('gives WT3 and WT10 the same window, and checks the correction first', () => {
    /*
     * Both ride `setConfirm`, the 1.5 s window that used to hold the deleted SET LOGGED screen.
     * They are mutually exclusive by construction — Loop 1 makes the last set of an exercise a
     * no-op, so a correction can never land on the set that closes a lift (`sessionMirror.ts` holds
     * the same invariant). Order still matters: if WT10 were tested first, a phone that ever broke
     * that invariant would silently swallow the correction.
     */
    const a = MODEL.indexOf('return .correction(c)');
    const b = MODEL.indexOf('return .liftDone(done)');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(-1);
    expect(a).toBeLessThan(b);
  });

  it('draws both — a projectable screen the root ignores is a black screen mid-workout', () => {
    const root = SRC.slice(SRC.indexOf('struct WatchRootView'), SRC.indexOf('// MARK: 01'));
    expect(root).toContain('case let .correction(c):');
    expect(root).toContain('case let .liftDone(name):');
  });
});
