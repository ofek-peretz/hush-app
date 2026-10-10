// @ts-nocheck
/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WRIST IS WHERE A SET IS TOLD (the watch pass, 2026-10-10)
 *
 * The workout holds no microphone (`theWorkoutHoldsNoMicrophone`): the coach speaks, and a set is
 * marked by a tap. The lock screen means taking the phone out of a pocket, so for anyone wearing a
 * watch the wrist is now the whole of her half of the workout. The founder, the same day:
 *
 *   > *"למה פשוט שלא תעבור בצורה היסודית ביותר על מסכי השעון, ותוודא שחווית האימון שם היא ברמה
 *   > הגבוהה ביותר שאפשר לקבל."*
 *
 * What a full read of the target found, each of it in the path of one set:
 *
 *   1 · Saying how many reps she did took FOUR presses and the crown (the load was the only door
 *       into the editor, and the editor's button did not log). Complete set alone writes the floor
 *       of the band — so that is what most sets would have recorded.
 *   2 · A logged set was FELT only when it closed a lift. The tap went out with the SET LOGGED
 *       screen (2026-08-01) for every other set, under a comment that says the opposite.
 *   3 · The Reconnecting viewer could be entered with the phone in reach the whole time (a late
 *       reply), and was left only by a reachability TRANSITION — which then never came.
 *   4 · A hold had no end on the wrist — in the one exercise where nobody can look at it.
 *   5 · A reps figure she had dialled was drawn nowhere on the live set.
 *
 * ── Scope, honestly ────────────────────────────────────────────────────────────────────────────
 * Source laws: no Swift runs on this machine. CI type-checks the watch target, so the code below
 * compiles or the push is red; how it FEELS is verified on a wrist, or not at all.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import fs from 'node:fs';
import path from 'node:path';

const WATCH = path.join(__dirname, '..', '..', 'targets', 'watch');
const read = (f: string): string => fs.readFileSync(path.join(WATCH, f), 'utf8');
const flat = (s: string): string => s.replace(/\s+/g, ' ');
const between = (src: string, from: string, to: string): string => {
  const a = src.indexOf(from);
  expect(a).toBeGreaterThan(-1);
  const b = src.indexOf(to, a + from.length);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b);
};

describe('1 · how many she did: as on the phone — one press as written, two presses and the crown otherwise', () => {
  /*
   * ⛔ THE RULING, AND THE RULING IT REPLACED (both 2026-10-10). I reported that a press on Complete
   * set with nothing dialled writes the floor of the band, and the founder answered *"למה שפשוט לא נעשה
   * שחובה להזין את החזרות בכל סט וסט"* — which was built (commit be97226: the reps asleep until the
   * crown woke them). The same evening he took it back:
   *
   *   > *"עזוב, תשאיר את החזרות כמו שיש בפלאפון, תעשה ככה בשעון. נדיר מאוד שאנשים מזינים את כמות
   *   > החזרות ששונה ממה שהם עשו."*
   *
   * So the wrist logs as the phone's stage and the lock card do: one press writes the set as
   * written, and a set that went otherwise is corrected where her eyes already are. Do not bring
   * the question back without his word.
   */
  const screens = read('WatchScreens.swift');
  const set = between(screens, 'struct ActiveSetScreen: View', '// MARK: 03 · WT3');
  const model = read('WatchModel.swift');

  it('⛔ Complete set on the live stage LOGS — nothing stands between the press and the set', () => {
    const footer = between(set, 'private var footer: some View', 'private func enterEdit');
    expect(footer).toContain('StageButton(title: WatchCopy.completeSet, kind: .primary, height: Wrist.action, fontSize: 15, seated: true, action: onComplete)');
    // Nothing of the withdrawn rule is left on the wrist.
    const all = ['WatchScreens.swift', 'WatchModel.swift', 'WatchHaptics.swift', 'WatchCopy.swift'].map(read).join('\n');
    expect(all).not.toMatch(/mustStateReps|repsStated|howManyReps|notYet|pressComplete/);
    const complete = between(model, 'func completeSet()', 'func ready()');
    expect(complete).toContain('let weight = editDraft?.weight ?? m.targetWeight');
    expect(complete).toContain('let reps = editDraft?.reps ?? m.targetReps');
  });

  it('⛔ the rep band is a door of its own, and it opens the editor ON THE REPS', () => {
    const band = between(set, '@ViewBuilder private var bandLine: some View', 'private var setFigures: some View');
    expect(band).toContain('Button { TapGate.pass { enterEdit(.reps) } } label: {');
    // …and the load is still the door to the load.
    expect(set).toContain('Button { TapGate.pass { enterEdit(.weight) } } label: {');
  });

  it('⛔ the editor\'s own Complete set commits her figures AND logs them, in that order', () => {
    const footer = between(set, 'private var footer: some View', 'private func enterEdit');
    const editing = flat(between(footer, '} else if editing {', '// Mock WT2'));
    expect(editing).toContain('StageButton(title: WatchCopy.completeSet, kind: .primary, height: Wrist.action, fontSize: 15, seated: true) { commit() onComplete() }');
    // Nothing on this screen is a "Done" that only closes the editor any more.
    expect(set).not.toContain('WatchCopy.done');
    // `commit` hands the model the figures before `completeSet` reads them (both on the main queue).
    expect(flat(between(set, 'private func commit()', 'private func leaveEdit'))).toContain('onSave(bodyweight ? nil : w, Int(r)) editing = false');
  });

  it('⛔ the editor has ONE button — the way out without logging is its header, not a second button that looks like the first', () => {
    /*
     * Founder, 2026-10-10, of the row [Save | Complete set]: *"למה בעריכת הסט יש גם שמירה וגם השלמת
     * סט? זה לא אותה פעולה בגדול?"* Both said "I am done here" and one of them wrote the set — a
     * difference she could not see. He offered the place to a "split" (a few reps, the load dropped,
     * a few more) *"רק אם אתה באמת חושב שזה הכרחי"*; it was not taken — rare by his own account, and a
     * set in two parts is a change to the record, not a button. Neither comes back as a standing
     * control beside Complete set.
     */
    const footer = between(set, 'private var footer: some View', 'private func enterEdit');
    const editing = between(footer, '} else if editing {', '// Mock WT2');
    expect(editing.match(/\b(StageButton|OutlineButton)\(/g)).toHaveLength(1);
    expect(set).not.toContain('WatchCopy.save');
    // The header: the back chevron the pain flow already uses, the whole row left of the clock as its target.
    const header = flat(between(set, 'private var editHeader: some View', '/// The header row: the lift she is on'));
    expect(header).toContain('ClockLane { Button(action: { TapGate.pass(leaveEdit) }) {');
    expect(header).toContain('Image(systemName: "chevron.backward")');
    expect(header).toContain('.frame(maxWidth: .infinity, alignment: .leading) .frame(height: Fit.s(Wrist.head)) .contentShape(Rectangle())');
    expect(flat(set)).toContain('if editing { // The header lives top-left on every screen (the wrist\'s second rule); the edit legend was // the one exception, centred on a row of its own (design pass 2026-09-09). editHeader } else {');
    // Going back keeps what she dialled — and an editor she only opened leaves no draft behind.
    const leave = flat(between(set, 'private func leaveEdit()', '\n}'));
    expect(leave).toContain('let loadMoved = !bodyweight && w != ((shownWeight ?? 0) * 2).rounded() / 2');
    expect(leave).toContain('if loadMoved || Int(r) != shownReps { onSave(bodyweight ? nil : w, Int(r)) } editing = false');
    expect(leave).not.toContain('onComplete');
  });

  it('a figure she dialled is what the row shows — the number Complete set is about to write', () => {
    const band = between(set, '@ViewBuilder private var bandLine: some View', 'private var setFigures: some View');
    expect(band).toContain('Text(draft != nil ? "× \\(shownReps)" : (hi > lo ? "× \\(lo)–\\(hi)" : "× \\(lo)"))');
    expect(band).toContain('.foregroundStyle(draft != nil ? Palette.ink0 : Palette.ink1)');
  });

  it('⛔ only her hand turns the crown: a value the CODE set is not a turn, and a value that belongs to the other row is ignored', () => {
    // The handler also runs when the editor opens and when the row changes; it used to strike the
    // crown hint the moment the editor opened.
    const crown = flat(between(set, '.onChange(of: crown) { _, v in', '.onChange(of: field)'));
    expect(crown).toContain('guard editing, crownField == field else { return }');
    expect(crown).toContain('let next = max(0, (v * 2).rounded() / 2) guard !bodyweight, next != w else { return } crownMoved = true w = next');
    expect(crown).toContain('let next = max(0, v.rounded()) guard next != r else { return } crownMoved = true r = next');
    expect(flat(between(set, '.onChange(of: field) { _, f in', '/// The header row'))).toContain('crown = f == .weight ? w : r crownField = f');
    expect(flat(between(set, 'private func enterEdit(_ f: EditField)', 'private func commit()'))).toContain('crown = field == .weight ? w : r crownField = field crownMoved = false editing = true');
  });

  it('a new set is a new screen — an editor left open never carries into the next set', () => {
    const stage = between(screens, 'case let .activeSet(m, draft):', 'case let .interRest(m):');
    expect(stage).toContain('ActiveSetScreen(mirror: m, draft: draft, onSave: model.saveEdit,');
    expect(stage).toContain('.id(m.globalIndex)');
  });

  it('the hint names both doors, in both languages and both genders', () => {
    const he = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'i18n', 'locales', 'he.json'), 'utf8')).watch;
    const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'i18n', 'locales', 'en.json'), 'utf8')).watch;
    expect(he.tapWeightToEdit).toBe('הקש על מספר כדי לעדכן');
    expect(he.tapWeightToEdit_female).toBe('הקישי על מספר כדי לעדכן');
    expect(en.tapWeightToEdit).toBe('Tap a number to edit');
    expect(read('WatchCopy.swift')).toContain('L("tapWeightToEdit", "Tap a number to edit")');
  });
});

describe('open training is not offered on the wrist (founder, 2026-10-10: "תבטל את אימון חופשי")', () => {
  const screens = read('WatchScreens.swift');
  const start = between(screens, 'struct StartScreen: View', 'private struct WeekRail');

  it('⛔ neither face of Home has the door — and nothing sets the count that opened it', () => {
    expect(start).not.toContain('WatchCopy.cardio');
    expect(start).not.toMatch(/counting = true/);
    // One chooser where there were two chips, so it says the whole thing.
    expect(start.match(/WatchCopy\.chooseWorkout/g)).toHaveLength(2);
    expect(start).not.toContain('WatchCopy.another');
  });

  it('the run\'s own screens are kept, as the phone kept its tab\'s — only the door is closed', () => {
    expect(screens).toContain('private struct CardioPicker');
    expect(screens).toContain('struct CardioPager');
  });
});

describe('2 · every logged set is felt', () => {
  const model = read('WatchModel.swift');
  const haptic = between(model, 'private func entryHaptic(for screen: WatchScreen, from was: WatchScreen) -> HapticEvent?', 'private func sameKind');

  it('⛔ leaving a live set for a rest plays the set\'s tap — whoever logged it', () => {
    expect(flat(haptic)).toContain('case .interRest, .transitionRest: if case .activeSet = was { return .setLogged } return nil');
    // The screen it left is handed in by the one place a screen changes.
    expect(flat(between(model, 'private func recompute()', 'private func project()'))).toContain(
      'let was = screen let kindChanged = !sameKind(next, was) screen = next if kindChanged, let haptic = entryHaptic(for: next, from: was) {',
    );
  });

  it('…and never twice: a beat reached FROM a rest has had its tap', () => {
    const beat = flat(between(haptic, 'case .correction, .liftDone:', 'case .interRest, .transitionRest:'));
    expect(beat).toContain('if case .interRest = was { return nil } if case .transitionRest = was { return nil } return .setLogged');
  });

  it('the confirmation still waits for the phone\'s ANSWER (W3) — nothing is played at the press', () => {
    const complete = between(model, 'func completeSet()', 'func ready()');
    expect(complete).not.toMatch(/onEntryHaptic\.send|WatchHaptics\.play/);
  });
});

describe('3 · the Reconnecting viewer is never a dead end', () => {
  const model = read('WatchModel.swift');

  it('⛔ a frame from a phone in reach ends it', () => {
    const apply = between(model, 'func apply(_ envelope: WireEnvelope)', 'private func syncWorkoutRuntime');
    const at = apply.indexOf('if connection == .reconnecting, manager.isReachable { markConnected() }');
    expect(at).toBeGreaterThan(-1);
    // After the reorder guard (a straggler proves nothing), before anything is projected.
    expect(at).toBeGreaterThan(apply.indexOf('guard envelope.authoritySeq > highestSeq else { return }'));
    expect(at).toBeLessThan(apply.indexOf('recompute()'));
  });

  it('⛔ a press that did not land brings the stage back by itself — only with the phone in reach, her figures kept', () => {
    const fail = between(model, 'private func intentDidNotLeave()', 'private func markConnected()');
    expect(fail).toContain('scheduleStageReturn()');
    const back = between(model, 'private func scheduleStageReturn()', '// MARK: Projection');
    expect(flat(back)).toContain('guard self.connection == .reconnecting, self.manager.isReachable else { return } self.markConnected() self.recompute()');
    const m = model.match(/stageReturnS: TimeInterval = ([\d.]+)/);
    expect(m).not.toBeNull();
    // Long enough to read "reconnecting", short enough that she is still looking at her wrist.
    expect(Number(m![1])).toBeGreaterThanOrEqual(2);
    expect(Number(m![1])).toBeLessThanOrEqual(8);
    // The draft is cleared only on the answered path (`noMessageDiesBetweenTheWristAndThePhone`).
    expect(back).not.toContain('editDraft');
  });

  it('the honest viewer is still immediate, and a reachability change still heals it', () => {
    const fail = between(model, 'private func intentDidNotLeave()', 'private func markConnected()');
    expect(flat(fail)).toContain('guard connection != .reconnecting else { return } connection = .reconnecting recompute()');
    expect(between(model, 'func setReachable(_ reachable: Bool)', '// MARK: Rest haptics')).toContain('connection = .connected');
  });
});

describe('4 · a hold ends on the wrist', () => {
  const model = read('WatchModel.swift');
  const hold = between(model, 'private func syncHoldHaptics(prev: WireMirror?, next: WireMirror?)', 'private func scheduleRestHaptics(endsAt');

  it('⛔ three seconds and the end, counted to the instant every surface counts to', () => {
    expect(hold).toContain('let end = next?.phase == "active_set" ? next?.holdEndsAt : nil');
    expect(flat(hold)).toContain('(-3, .restApproach), (-2, .restApproach), (-1, .restApproachFinal), (0, .exerciseBoundary),');
    // A beat the system delivered late is stale — the rest's own guard.
    expect(hold).toContain('guard lateBy < (offset == 0 ? 3.0 : 1.2) else { return }');
  });

  it('it follows the clock: scheduled when the end appears or moves, dropped when it goes (a pause, a Done)', () => {
    expect(flat(hold)).toContain('for w in holdHaptics { w.cancel() } holdHaptics = [] guard let end, let endsAt = WatchWire.parseDate(end) else { return }');
    // One seam: every place the rest's beats are synced syncs the hold's.
    expect(flat(between(model, 'private func syncRestHaptics(prev: WireMirror?, next: WireMirror?)', 'let isRest'))).toContain('syncHoldHaptics(prev: prev, next: next)');
  });

  it('⛔ and it writes nothing: the beat says the time is up, her Done says the set is', () => {
    expect(hold).not.toMatch(/completeSet|sendIntent|engine\./);
  });

  it('⛔ a hold that has not started can be STARTED here with the voice off — the clock was reachable only through the voice\'s dialogue', () => {
    const screens = read('WatchScreens.swift');
    const set = between(screens, 'struct ActiveSetScreen: View', '// MARK: 03 · WT3');
    // A timed hold with no end yet: not a carry (metres), not a set.
    expect(set).toContain('private var holdWaits: Bool { mirror.holdSeconds != nil && mirror.holdEndsAt == nil }');
    expect(set).toContain('if !editing && (mirror.awaitingReady == true || holdWaits) {');
    // Ready is the same proposal either way, and the phone starts any set still on stage with it.
    expect(model).toContain('if !sendIntent(type: "set_ready", expectedIndex: m.globalIndex) { intentDidNotLeave() }');
    const store = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'state', 'stores', 'sessionStore.tsx'), 'utf8');
    expect(flat(store)).toContain("watchReadyRef.current = afterClock((v) => { if (v.displayPhase === 'SET_PRESENTED') v.markSetStarted(); });");
  });
});

describe('a component that scales its own size is handed the 40 mm number', () => {
  it('the lift-done check is not scaled twice', () => {
    const screens = read('WatchScreens.swift');
    expect(screens).not.toMatch(/DrawCheck\(size:\s*Fit\.s\(/);
    expect(screens).toContain('DrawCheck(size: 22)');
  });
});
