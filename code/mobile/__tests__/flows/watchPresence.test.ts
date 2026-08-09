/**
 * WHO IS TOLD ABOUT THE WRIST, AND BY WHICH SURFACE.
 *
 * Two things can go wrong, and both are silent:
 *
 *  · **The advertisement.** Either surface appearing for someone who owns no Apple Watch.
 *  · **The gap or the double.** Two surfaces tell her — 1.3 during onboarding, 10.4 as a state of
 *    Today — and between them every athlete must be covered EXACTLY ONCE. A gap means somebody who
 *    owns a watch is never told; a double means somebody is told twice, which is the nag both
 *    screens are written to avoid.
 *
 * The founder's second pass (2026-07-29) is what made the split necessary: the first build only had
 * 10.4, and waited for the day after her first session — which quietly forced that first session to
 * happen without a watch the athlete had owned the whole time. `hush.watch.offered` is the single
 * seam, and this file is the truth table for it.
 */
// @ts-nocheck

// 

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  hasOfferedTheWrist,
  markWristOffered,
  offerTheWrist,
  resetWristOffered,
  wristFace,
  WATCH_PRESENCE_UNKNOWN,
  type WatchPresence,
  type WristOffer,
} from '@/platform/watch/watchPresence';

const PAIRED: WatchPresence = { known: true, paired: true, appInstalled: true };
const PAIRED_NO_APP: WatchPresence = { known: true, paired: true, appInstalled: false };
const NO_WATCH: WatchPresence = { known: true, paired: false, appInstalled: false };

describe('the offer is only ever made to someone who has the thing', () => {
  it('says nothing when no watch is paired to this iPhone', () => {
    expect(wristFace(NO_WATCH)).toBeNull();
    expect(offerTheWrist({ presence: NO_WATCH, offered: false })).toBeNull();
  });

  it('says nothing while the answer is unknown — an unknown is not a "no", and not a "yes"', () => {
    // No native module (web / Expo Go / jest), or WCSession still activating. Both land here, and
    // both must simply wait: telling an Apple Watch owner they have no watch on the one boot that
    // lost the activation race is the bug the third value exists for.
    expect(wristFace(WATCH_PRESENCE_UNKNOWN)).toBeNull();
    expect(offerTheWrist({ presence: WATCH_PRESENCE_UNKNOWN, offered: false })).toBeNull();
  });

  it('shows the CONFIRM face when the watch already carries the app', () => {
    expect(wristFace(PAIRED)).toBe('confirm');
  });

  it('shows the INSTALL face when a watch is paired but auto-install is off', () => {
    expect(wristFace(PAIRED_NO_APP)).toBe('install');
  });

  it('both surfaces read the SAME face from the same facts — they can never disagree', () => {
    for (const presence of [PAIRED, PAIRED_NO_APP, NO_WATCH, WATCH_PRESENCE_UNKNOWN]) {
      // 1.3 draws `wristFace` directly; 10.4 goes through the gate. Same answer, or one screen is
      // telling her something the other contradicts.
      expect(offerTheWrist({ presence, offered: false })).toEqual(wristFace(presence));
    }
  });
});

describe('every athlete is covered exactly once', () => {
  /** The four worlds an athlete can be in, and what each surface does about it. */
  const CASES: {
    what: string;
    atOnboarding: WatchPresence;
    later: WatchPresence;
    /** What 1.3 drew during onboarding — and therefore whether it set the flag. */
    told: WristOffer | null;
    /** What 10.4 does afterwards. */
    then: WristOffer | null;
  }[] = [
    {
      what: 'she already owned a watch — 1.3 tells her, 10.4 never speaks',
      atOnboarding: PAIRED,
      later: PAIRED,
      told: 'confirm',
      then: null,
    },
    {
      what: 'she owned a watch with auto-install off — 1.3 names the step, 10.4 never speaks',
      atOnboarding: PAIRED_NO_APP,
      later: PAIRED_NO_APP,
      told: 'install',
      then: null,
    },
    {
      what: 'she bought a watch LATER — 1.3 said nothing, so 10.4 is armed for the day it appears',
      atOnboarding: NO_WATCH,
      later: PAIRED,
      told: null,
      then: 'confirm',
    },
    {
      what: 'WCSession had not activated at 1.3 — 10.4 catches it the first open that knows',
      atOnboarding: WATCH_PRESENCE_UNKNOWN,
      later: PAIRED,
      told: null,
      then: 'confirm',
    },
    {
      what: 'she owns no watch and never will — neither surface ever says a word',
      atOnboarding: NO_WATCH,
      later: NO_WATCH,
      told: null,
      then: null,
    },
  ];

  for (const { what, atOnboarding, later, told, then } of CASES) {
    it(what, () => {
      // 1.3 · Connect health draws the row from the presence it read, and sets the flag iff it drew.
      const drewAtOnboarding = wristFace(atOnboarding);
      expect(drewAtOnboarding).toEqual(told);

      // …and 10.4 reads that same flag on every later open.
      expect(offerTheWrist({ presence: later, offered: drewAtOnboarding != null })).toEqual(then);
    });
  }
});

describe('10.4 is shown once, and never on top of another state', () => {
  it('stands aside for the welcome back — one full-screen state per arrival', () => {
    expect(offerTheWrist({ presence: PAIRED, offered: false, greetingBack: true })).toBeNull();
  });

  it('never returns after it has been read', () => {
    expect(offerTheWrist({ presence: PAIRED, offered: true })).toBeNull();
  });
});

/**
 * THE WRITE IS ASYNC AND THE NAVIGATION IS NOT.
 *
 * Both surfaces mark and leave in the same tick — 1.3 navigates on to 1.4, 10.4 hands Today back —
 * and Home re-reads this flag on every focus. Without the in-memory latch a fast return reads the
 * value storage has not written yet, and the athlete is told a second time: exactly the nag both
 * screens exist to avoid, and exactly the kind of race that only ever shows up on a real device.
 */
describe('being told takes effect immediately, not when storage catches up', () => {
  beforeEach(() => resetWristOffered());
  afterAll(() => resetWristOffered());

  it('reads as told in the same tick the mark is claimed — before the write resolves', async () => {
    expect(await hasOfferedTheWrist()).toBe(false);
    const writing = markWristOffered(); // deliberately NOT awaited first
    expect(await hasOfferedTheWrist()).toBe(true);
    await writing;
    expect(await hasOfferedTheWrist()).toBe(true);
  });

  it('an account wipe needs BOTH halves — the key removed and the latch dropped', async () => {
    await markWristOffered();
    expect(await hasOfferedTheWrist()).toBe(true);

    // Half one, on its own, is not a wipe: `db.clearAll()` removes the key, and the latch goes on
    // answering "told" over the top of it until the app is force-quit.
    await AsyncStorage.removeItem('hush.watch.offered');
    expect(await hasOfferedTheWrist()).toBe(true);

    // Half two is what appStore does in the same breath, on all three wipe paths.
    resetWristOffered();
    expect(await hasOfferedTheWrist()).toBe(false);
  });
});
