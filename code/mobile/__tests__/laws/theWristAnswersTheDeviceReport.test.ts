// @ts-nocheck
// 
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
    // WT3 only — WT10 now sits between it and the next MARK, and its check ring is moss by right.
    const at = src.indexOf('struct CorrectionScreen');
    const screen = src.slice(at, src.indexOf('\nstruct ', at + 10));
    expect(screen).toMatch(/up \? Palette\.up : Palette\.down/);
    expect(screen).not.toMatch(/Palette\.signal\b/);
  });

  it('⚠️ took the confirmation’s slot, and the confirmation is GONE', () => {
    /*
     * Founder, device review 2026-08-01: *"remove the SET LOGGED screen — it is a leftover from the
     * earlier screens, and what I asked for in its place was WT3."*
     *
     * The first cut of WT3 kept both and let the correction win the slot when there was one. He
     * wants the beat itself gone: it restated a load and a rep count she had chosen herself and
     * executed thirty seconds earlier, and it cost a second and a half of every single rest.
     *
     * `setConfirm` survives as the TIMER — it is what holds WT3 on screen and what a tap dismisses.
     * A screen case named for the confirmation must not come back with it.
     */
    const model = read('WatchModel.swift');
    expect(model).not.toContain('case setConfirmation');
    expect(model).not.toContain('.setConfirmation(');
    expect(read('WatchScreens.swift')).not.toContain('struct ConfirmScreen');
    // …and the correction still reaches the screen, off the same window.
    const at = model.indexOf('if setConfirm != nil');
    expect(at).toBeGreaterThan(-1);
    expect(model.slice(at, at + 300)).toContain('return .correction(c)');
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

describe('the layout law — nothing gets cut off again', () => {
  /*
   * Founder, device review 2026-08-01, four separate findings that are one bug: *"on the first
   * workout screen the START is cut off"*, *"that SOMETHING FEELS OFF button gets cut off"*, *"on
   * the MILESTONES screen Done is cut off"*, and the transition rest's buttons running off the
   * bottom of his screenshot.
   *
   * Every one of them was a screen laying itself out by hand — a VStack of blocks with Spacers
   * between them, hoping the total came to less than the case. `WristScreen` measures the action
   * zone FIRST and lets the body compress into what is left, which is the difference between a
   * layout and a hope.
   */
  const SCREENS = 'WatchScreens.swift';

  it('gives every screen with an action the container that reserves it', () => {
    const src = read(SCREENS);
    // The container exists and takes its actions at a higher layout priority than its body.
    const at = src.indexOf('struct WristScreen<');
    expect(at).toBeGreaterThan(-1);
    /*
     * ⚠️ SLICED TO THE STRUCT, NOT TO 1,400 CHARACTERS. The magic number was fine until the
     * container grew the note explaining why the action zone owns the floor (2026-08-05), which
     * pushed `.layoutPriority(1)` out of the window — so this failed on a file where the claim was
     * still perfectly true. A law that reads source has to be bounded by the source's own shape.
     */
    const decl = src.slice(at, src.indexOf('extension WristScreen'));
    expect(decl).toContain('.layoutPriority(1)');
    // And it is actually used — by every screen that ends in a button.
    expect((src.match(/WristScreen \{/g) ?? []).length).toBeGreaterThan(10);
  });

  it('⚠️ leaves NO screen laying out its own bottom edge by hand', () => {
    /*
     * The regression this file exists to catch. A new screen that pads its own bottom with a
     * hand-picked number is a new screen that will clip on the 40 mm case, and it will be found by
     * an athlete rather than by us — there is no Xcode in this project and no simulator in this
     * suite, so the text is the only place it can be caught.
     */
    const src = read(SCREENS);
    const handRolled = [...src.matchAll(/\.padding\(\.bottom, (\d+)\)/g)].map((m) => m[1]);
    expect(handRolled).toEqual([]);
  });

  it('holds the type floor — a watch is read in under a second, sweating', () => {
    /*
     * Founder: *"the 12 kg a side is written very small"*, *"the UP NEXT line is very small"*,
     * *"the text is tiny, impossible to see through a watch, especially the KG · SETS line"*.
     *
     * 7.5 pt appeared eleven times in this file. It is not a small size; it is a decision to be
     * unreadable. The floor is 10, and `Wrist.legend` is where it is written down.
     */
    const src = read(SCREENS);
    const sizes = [...src.matchAll(/\.system\(size: ([0-9.]+)/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(40);
    expect(sizes.filter((n) => n < 8)).toEqual([]);
  });
});

describe('#4 · the two weights that disagreed', () => {
  it('⚠️ reads the load of the set that is COMING, not the one behind her', () => {
    /*
     * Founder, device review 2026-08-01: *"it says the next set is 44 kg and one line below it says
     * 50 kg — there is probably a bug behind the scenes."*
     *
     * There was, and `sessionMirror.ts` documents it: on a rest frame the phone HOLDS the finished
     * set's index, so `targetWeight` is the load she has just lifted and `nextTargetWeight` is the
     * one coming. The up-next card read the first.
     *
     * The two agree on every ordinary rest, which is why it survived months of use. They diverge in
     * exactly one case — when Loop 1 has just moved the load — which is the case where the card sits
     * directly above a correction announcing the new number.
     */
    const src = read('WatchScreens.swift');
    const at = src.indexOf('struct InterRestScreen');
    const body = src.slice(at, src.indexOf('// MARK: 05', at));
    expect(body).toContain('mirror.nextTargetWeight ?? mirror.targetWeight');
    // The card must read that, and not reach for the raw field beside it.
    const card = body.slice(body.indexOf('private var upNextCard'));
    expect(card).toContain('nextLoad');
    expect(card).not.toContain('mirror.targetWeight');
  });
});

describe('#14 · two gaits, because Apple Health keeps the record', () => {
  it('asks which way, and the count carries her answer to the runtime', () => {
    /*
     * ⛔ REVERSED 2026-09-09 (the formula report, red finding 5). The 2026-08-01 ruling — *"why was
     * there a Run option and a Walk option? it was just general cardio."* — saved one tap and wrote
     * every walk into Apple Health as a run, which the code itself recorded as the consequence.
     * Wrong data in Apple's own app outranks a tap. Two chips, one count, the gait on the wire.
     */
    const src = read('WatchScreens.swift');
    const at = src.indexOf('private struct CardioPicker');
    const body = src.slice(at, src.indexOf('struct ChooseOverlay', at));
    expect(body).toContain('WatchCopy.run');
    expect(body).toContain('WatchCopy.walk');
    expect(body).toContain('WatchCopy.startCardio');
    // The count starts on the pick and hands the SAME gait on — never a literal.
    expect(body).toContain('onCardio(gait)');
    expect(body).not.toContain('onCardio("run")');
    expect(body).not.toContain('ForEach');
  });

  it('gives the run the gym’s own swipe', () => {
    // Founder: *"swiping to the side opens a PAUSE screen like the gym mode."*
    const src = read('WatchScreens.swift');
    expect(src).toContain('struct CardioStageScreen');
    expect(src).toContain('struct CardioPausedScreen');
    const at = src.indexOf('struct CardioPager');
    expect(src.slice(at, at + 1600)).toContain('TabView(selection: $page)');
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
