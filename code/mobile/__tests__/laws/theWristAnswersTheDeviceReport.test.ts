import fs from 'fs';
import path from 'path';

/**
 * ════ THREE THINGS THE FOUNDER FOUND ON HIS WRIST ════
 *
 * Device QA, 2026-07-30. Three of the six findings are pure Swift, and no machine in this project
 * can compile Swift — there is no Xcode on this box, and `jest` cannot drive a watch. So these are
 * SOURCE laws, the same shape as `theWristCannotStartASecondWorkout`: they do not prove the wrist
 * behaves, they prove the specific defect he reported cannot come back through an edit that looks
 * innocent.
 *
 * That distinction is worth being honest about. Everything below is verified on a device or it is
 * not verified at all. What a source law buys is that the SECOND time is caught by us.
 *
 *   #2  "the watch's first screen forces a specific workout instead of showing today"
 *   #5  "there is no CORRECTION screen on the watch"  (canonical WT3)
 *   #6  "tapping quickly skips screens and ends the workout early"
 */

const WATCH = path.join(__dirname, '..', '..', 'targets', 'watch');
const read = (f: string) => fs.readFileSync(path.join(WATCH, f), 'utf8');

describe('#6 · one tap is one tap', () => {
  /*
   * Every beat on the wrist is short and several replace each other inside two seconds. A finger
   * that taps twice where a button USED to be hits whatever took its place — and the pairs laid out
   * most alike are the ones that end a workout.
   */
  it('routes EVERY button through the gate — no ungated `Button` survives', () => {
    // The whole value is that it is exhaustive. One screen that guards itself is one screen someone
    // has to remember; the forgotten one is found by an athlete, mid-workout.
    const src = read('WatchScreens.swift');
    const ungated = src
      .split('\n')
      .map((l, i) => [l.trim(), i + 1] as const)
      .filter(([l]) => /\bButton\s*\{|\bButton\(action:/.test(l))
      .filter(([l]) => !l.includes('TapGate'));
    expect(ungated).toEqual([]);
  });

  it('gates the tap-to-advance surfaces too — they are the ones that vanish under the finger', () => {
    // The set confirmation and WT3 both dismiss on a tap ANYWHERE and both last 1.5 seconds. They
    // are the surfaces a stray second tap is most likely to land on.
    const src = read('WatchScreens.swift');
    const taps = [...src.matchAll(/\.onTapGesture[^\n]*/g)].map((m) => m[0]);
    expect(taps.length).toBeGreaterThan(0);
    expect(taps.filter((t) => !t.includes('TapGate'))).toEqual([]);
  });

  it('holds the window between a stray double-tap and a considered second tap', () => {
    /*
     * ~250 ms is the fastest accidental double-tap; ~500 ms is about what it takes to see a new
     * screen, read it and decide. Anything at or above half a second starts eating taps a person
     * meant; anything at or below a quarter stops catching the ones they did not.
     */
    const src = read('WatchScreens.swift');
    const m = src.match(/windowS: TimeInterval = ([\d.]+)/);
    expect(m).not.toBeNull();
    const windowS = Number(m![1]);
    expect({ windowS, sane: windowS >= 0.25 && windowS < 0.5 }).toMatchObject({ sane: true });
  });
});

describe('#5 · the correction gets its screen', () => {
  it('draws WT3 as its own beat, not a note under a timer', () => {
    const src = read('WatchScreens.swift');
    expect(src).toContain('struct CorrectionScreen: View');
    // The canonical parts: the eyebrow that states the direction, and the closing serif line.
    expect(src).toContain('WatchCopy.raisedForYou');
    expect(src).toContain('WatchCopy.easedForYou');
    expect(src).toContain('WatchCopy.loggedResting');
  });

  it('⚠️ colours the new load by DIRECTION, against the mock', () => {
    /*
     * The canonical HTML draws WT3's new load in moss on a screen whose eyebrow reads EASED FOR
     * YOU. It predates the founder's ruling of 2026-07-29 — down is blue, hold is cream, raise is
     * moss, on every surface INCLUDING the wrist — which exists because five surfaces were drawing
     * an ease as a raise. A pixel-faithful WT3 would have made it six.
     */
    const src = read('WatchScreens.swift');
    const screen = src.slice(src.indexOf('struct CorrectionScreen'), src.indexOf('// MARK: 04'));
    expect(screen).toMatch(/up \? Palette\.up : Palette\.down/);
    expect(screen).not.toMatch(/Palette\.signal\b/);
  });

  it('takes the confirmation’s slot rather than adding a third full-screen beat', () => {
    // Set → confirmation → WT3 → rest would be three screens between one set and the next. And the
    // confirmation is the one that can go: it restates a load and a rep count she chose herself.
    const model = read('WatchModel.swift');
    const at = model.indexOf('if let sc = setConfirm {');
    expect(at).toBeGreaterThan(-1);
    const block = model.slice(at, at + 900);
    expect(block).toContain('return .correction(c)');
    // And the correction is checked FIRST — otherwise the confirmation always wins and WT3 is dead
    // code that compiles.
    expect(block.indexOf('return .correction(c)')).toBeLessThan(block.indexOf('return .setConfirmation'));
  });

  it('does not say it twice — but never loses it either', () => {
    /*
     * The rest screen carries the same news underneath. Saying it twice in four seconds on a 41 mm
     * case is worse than saying it once — but the correction rides the envelope AFTER the set and
     * sometimes lands past the confirmation beat, and then the note is the ONLY place it exists.
     * So the note stands down only for the correction WT3 actually announced.
     */
    const src = read('WatchScreens.swift');
    expect(src).toMatch(/private var note: WireCorrection \{ 0 \}|announced \? nil : mirror\.correction/);
    expect(src).toContain('announced: model.announcedCorrectionAt == m.globalIndex');
  });
});

describe('#2 · the wrist offers the day she is on', () => {
  it('prefers what the PHONE last offered over the plan’s own order', () => {
    /*
     * With the phone present the wrist shows Today — the lobby carries `workoutId`. With the phone
     * absent it rebuilt a lobby from the stored plan and offered `remaining[0]`: the first workout
     * of the week it had not seen finished. That is the plan's sequence, not her week, and it
     * disagreed with the phone she had been looking at ten minutes earlier.
     */
    const model = read('WatchModel.swift');
    const at = model.indexOf('private func offlineLobby()');
    const body = model.slice(at, at + 1600);
    expect(body).toContain('store.loadQueuedWorkoutId()');
    // Her own pick on the wrist still wins over the phone's memory of Today.
    expect(body.indexOf('offlineQueuedWorkoutId')).toBeLessThan(body.indexOf('store.loadQueuedWorkoutId()'));
    expect(body.indexOf('store.loadQueuedWorkoutId()')).toBeLessThan(body.indexOf('?? remaining[0]'));
  });

  it('writes it to DISK, because the case that matters is a relaunch away from the phone', () => {
    // Held in memory it would be lost by exactly the scenario it exists for.
    expect(read('WatchStore.swift')).toContain('func saveQueuedWorkoutId');
    expect(read('WatchModel.swift')).toContain('store.saveQueuedWorkoutId(l.workoutId)');
  });
});

describe('#3 · her language survives the phone leaving', () => {
  it('stores the copy pack, like the plan', () => {
    /*
     * The standalone runtime exists so she can train with the phone in a locker. A wrist that
     * reverted to English the moment it lost the phone would be the founder's own report one step
     * further out.
     */
    expect(read('WatchStore.swift')).toContain('func saveCopy');
    expect(read('WatchModel.swift')).toContain('WatchCopyStore.adopt(store.loadCopy())');
  });

  it('turns the whole interface around ONCE, at the root', () => {
    // Twenty-three screens each remembering to mirror themselves is twenty-three chances to forget.
    const src = read('WatchScreens.swift');
    expect(src).toContain('.environment(\\.layoutDirection, model.rtl ? .rightToLeft : .leftToRight)');
    expect(src.match(/\.environment\(\\\.layoutDirection/g)!.length).toBe(1);
  });
});
