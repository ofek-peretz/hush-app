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

describe('1 · how many she did: SAID on every working set (founder, 2026-10-10)', () => {
  /*
   * I had reported that a press on Complete set with nothing dialled writes the floor of the band.
   * His ruling: *"למה שפשוט לא נעשה שחובה להזין את החזרות בכל סט וסט."* On the wrist a working set
   * cannot be logged until she has turned the crown on its reps.
   */
  const screens = read('WatchScreens.swift');
  const set = between(screens, 'struct ActiveSetScreen: View', '// MARK: 03 · WT3');
  const model = read('WatchModel.swift');

  it('⛔ one rule says which sets must be told: not a hold, not a carry, not a warm-up step — everything else', () => {
    const rule = flat(between(model, 'static func mustStateReps(_ m: WireMirror, draft: EditDraft?) -> Bool', '/// The current shown weight/reps'));
    expect(rule).toContain('if m.holdSeconds != nil || m.holdMetres != nil { return false }');
    expect(rule).toContain('if m.isWarmup == true { return false }');
    expect(rule).toContain('return draft?.repsStated != true');
    // Asked by the stage (what its button does) and by the model (what may leave).
    expect(set).toContain('private var mustState: Bool { WatchModel.mustStateReps(mirror, draft: draft) }');
    const complete = between(model, 'func completeSet()', 'func ready()');
    expect(complete).toContain('guard !WatchModel.mustStateReps(m, draft: editDraft) else { return }');
    expect(complete.indexOf('mustStateReps')).toBeLessThan(complete.indexOf('engine.completeSet'));
    expect(complete.indexOf('mustStateReps')).toBeLessThan(complete.indexOf('sendExpectingReply'));
  });

  it('⛔ Complete set on the live stage ASKS: it opens the editor on the reps, and writes nothing', () => {
    expect(flat(between(set, 'private func pressComplete()', 'private func enterEdit'))).toContain('if mustState { enterEdit(.reps) } else { onComplete() }');
    const footer = between(set, 'private var footer: some View', 'private func pressComplete()');
    // Both live buttons go through it — the lone one, and the one beside Ready.
    expect(footer.match(/action: pressComplete\)/g)).toHaveLength(2);
    expect(footer).not.toMatch(/action: onComplete\)/);
  });

  it('⛔ the reps are ASLEEP until her hand turns the crown on them: a dash, no figure she did not put there', () => {
    expect(set).toContain('value: stated ? "\\(Int(r))" : "–", active: bodyweight || field == .reps, asleep: !stated)');
    // Opened asleep on every set that must be told; awake only where nothing has to be said.
    const enter = flat(between(set, 'private func enterEdit(_ f: EditField)', 'private func commit()'));
    expect(enter).toContain('r = Double(seedReps)');
    expect(enter).toContain('stated = !mustState');
    // The crown: a value that differs from the figure the row holds is her hand; the first such
    // click brings the figure in where it stands, and only the clicks after it move it.
    const crown = flat(between(set, '.onChange(of: crown) { _, v in', '.onChange(of: field)'));
    expect(crown).toContain('guard editing, crownField == field else { return }');
    expect(crown).toContain('let next = max(0, v.rounded()) guard next != r else { return } crownMoved = true if stated { r = next } else {');
    expect(crown).toContain('stated = true crown = r');
    // Nothing else on the screen says the reps for her.
    expect(set.match(/stated = true/g)).toHaveLength(1);
    expect(set.match(/stated = !mustState/g)).toHaveLength(1);
  });

  it('⛔ and the editor\'s Complete set is not a button until then — it refuses aloud, and says what it waits for', () => {
    const footer = between(set, 'private var footer: some View', 'private func pressComplete()');
    const editing = flat(between(footer, '} else if editing {', '// Mock WT2'));
    expect(editing).toContain('if stated { StageButton(title: WatchCopy.completeSet, kind: .primary, height: Wrist.action, fontSize: 15) { commit() onComplete() } } else {');
    expect(editing).toContain('field = .reps crownMoved = false WatchHaptics.play(.notYet) } .opacity(0.35)');
    // The quiet way back: figures dialled before a set, and an editor opened by mistake.
    expect(editing).toContain('StageButton(title: WatchCopy.save, kind: .quiet, height: Wrist.action, fontSize: 15) { commit() }');
    expect(read('WatchHaptics.swift')).toContain('return [Beat(delay: 0, type: .retry)]');
    // Until she has said them, the strip asks the coach's own question.
    expect(set).toContain('TopStrip(text: (stated ? WatchCopy.editSet : WatchCopy.howManyReps).uppercased())');
  });

  it('what she said is what is written, and it travels with the draft — a save, a failed press, the stage coming back', () => {
    expect(flat(between(set, 'private func commit()', '\n}'))).toContain('onSave(bodyweight ? nil : w, Int(r), stated) editing = false');
    expect(flat(model)).toContain('func saveEdit(weight: Double?, reps: Int, repsStated: Bool) { editDraft = EditDraft(weight: weight, reps: max(0, reps), repsStated: repsStated) recompute() }');
    const complete = between(model, 'func completeSet()', 'func ready()');
    expect(complete).toContain('let weight = editDraft?.weight ?? m.targetWeight');
    expect(complete).toContain('let reps = editDraft?.reps ?? m.targetReps');
    // A figure she said is what the live row shows; a draft of the load alone leaves the band up.
    const band = between(set, '@ViewBuilder private var bandLine: some View', 'private var setFigures: some View');
    expect(band).toContain('Text(draft?.repsStated == true ? "× \\(shownReps)" : (hi > lo ? "× \\(lo)–\\(hi)" : "× \\(lo)"))');
  });

  it('the doors: the band opens the editor on the reps, the load on the load; nothing here is a "Done" that only closes', () => {
    const band = between(set, '@ViewBuilder private var bandLine: some View', 'private var setFigures: some View');
    expect(band).toContain('Button { TapGate.pass { enterEdit(.reps) } } label: {');
    expect(set).toContain('Button { TapGate.pass { enterEdit(.weight) } } label: {');
    expect(set).not.toContain('WatchCopy.done');
  });

  it('a new set is a new screen — reps said for one set never carry into the next', () => {
    const stage = between(screens, 'case let .activeSet(m, draft):', 'case let .interRest(m):');
    expect(stage).toContain('ActiveSetScreen(mirror: m, draft: draft, onSave: model.saveEdit,');
    expect(stage).toContain('.id(m.globalIndex)');
  });

  it('the words, in both languages and both genders', () => {
    const he = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'i18n', 'locales', 'he.json'), 'utf8')).watch;
    const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'i18n', 'locales', 'en.json'), 'utf8')).watch;
    expect(he.howManyReps).toBe('כמה חזרות?');
    expect(en.howManyReps).toBe('How many reps?');
    expect(he.tapWeightToEdit).toBe('הקש על מספר כדי לעדכן');
    expect(he.tapWeightToEdit_female).toBe('הקישי על מספר כדי לעדכן');
    expect(en.tapWeightToEdit).toBe('Tap a number to edit');
    expect(read('WatchCopy.swift')).toContain('L("tapWeightToEdit", "Tap a number to edit")');
    expect(read('WatchCopy.swift')).toContain('L("howManyReps", "How many reps?")');
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
