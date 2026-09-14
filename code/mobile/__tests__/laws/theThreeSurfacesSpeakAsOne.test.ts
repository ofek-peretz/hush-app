/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE THREE SURFACES SPEAK AS ONE
 *
 * Founder, 2026-09-14: *"אני רוצה שתבדוק אם השעון, הלייב אקטיביטי הפלאפון גם מבחינת המסכים וגם
 * מבחינת השמע מסונכרנים בינהם בצורה מושלמת… זה חייב להיות מסונכרן בצורה מושלמת בלי יוצא מין הכלל."*
 *
 * One workout is drawn on three surfaces at once — the stage, the wrist, and the lock screen — and
 * one rest ends on two of them at the same instant. This law holds the four seams the audit found
 * open, each of which had already produced a visible disagreement:
 *
 *   1 · THE LOCK CARD SPOKE ENGLISH WHERE THE OTHER TWO SPOKE HERS. The strength card printed a
 *       hard "BW" for a lift with no external load while the stage said "משקל גוף" and the wrist
 *       — which takes its every word from this same phone — said hers too. It was also the only
 *       surface that never learned about bands: the stage says "גומייה", the card said "BW".
 *
 *   2 · THE CARDIO CARD HAD NO WORDS AT ALL. `CardioLiveActivityState` carried no copy channel, so
 *       "Run", "Walk", "live", "paused", "km", "kcal" and "bpm" were Swift literals in the widget.
 *       On a Hebrew phone the two Live Activities of one product spoke two languages.
 *
 *   3 · ONE REST ENDED TWICE. The NOTIFICATION layer has asked `phoneOwnsRestHaptics()` since the
 *       wrist shipped — the watch owns the buzz when it is there. The in-app Core Haptics never
 *       asked, so with the app open and a watch on, the phone's beat and the watch's own beat,
 *       scheduled independently against the very same absolute instant, both landed.
 *
 *   4 · THE FOREGROUND HANDLER ASKED ONE QUESTION AND READ THE WRONG KEY. Rest alerts and the set
 *       nudge write a bare `data.kind`; everything `buildPayload` makes writes `intent`. The
 *       handler read only the first, so the second family fell through to "show a banner" — and
 *       `kilometre` is documented as suppressed in the foreground, and never was.
 *
 * ── Scope, honestly ─────────────────────────────────────────────────────────────────────────────
 * Nothing here compiles Swift; no machine in this project can. These are SOURCE laws in the shape
 * of `theWidgetSpeaksFromThePhone` and `theLockCardStatesEveryFact`: they do not prove the card
 * renders, they prove the specific disagreements above cannot return through an edit that looks
 * innocent. The mapper's own behaviour is proved for real in `flows/liveActivityMapping`.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

//

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = (rel: string) => join(__dirname, '..', '..', rel);
const read = (rel: string) => readFileSync(root(rel), 'utf8');

/** Swift/TS source with its comment lines removed — the prose here QUOTES the literals it forbids. */
function codeOnly(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('1 · one athlete, one word — the strength card', () => {
  const widget = codeOnly(read('targets/widget/HushLiveActivityWidget.swift'));

  it('⛔ draws no hard-coded "BW" — the word crosses from the phone like every other', () => {
    expect(widget).not.toContain('Text("BW")');
    expect(widget).not.toContain('?? "BW"');
    expect(widget).toContain('state.wordBodyweight');
    expect(widget).toContain('s.wordBodyweight');
  });

  it('…and the phone bakes it with the BAND distinction the stage itself makes', () => {
    const store = read('src/state/stores/sessionStore.tsx');
    // The SAME choice `SessionFlow` makes for the stage: a band lift says the band's word.
    expect(store).toContain("bodyweight: tg(noLoadIsBand(onStep?.exerciseId) ? 'workout.bandWord' : 'workout.bodyweight')");
    expect(store).toContain('noLoadIsBand');
  });

  it('…and it reaches the card through the one projection both surfaces already share', () => {
    const la = read('src/platform/liveActivity.ts');
    expect(la).toContain('wordBodyweight: lock.words.bodyweight');
    // Declared on the state AND on the extras, so a caller cannot forget it.
    expect(la).toContain('wordBodyweight: string;');
    expect(la).toContain('bodyweight: string }');
  });
});

describe('2 · one athlete, one word — the cardio card', () => {
  const widget = codeOnly(read('targets/widget/HushLiveActivityWidget.swift'));

  it('⛔ carries no English literal for anything it draws', () => {
    expect(widget).not.toContain('"Run" : "Walk"');
    expect(widget).not.toContain('"LIVE"');
    expect(widget).not.toContain('unit: "km"');
    expect(widget).not.toContain('unit: "kcal"');
    expect(widget).not.toContain('unit: "bpm"');
    expect(widget).not.toContain('label: "kcal"');
    expect(widget).not.toContain('label: "bpm"');
  });

  it('…and draws each of them from the state instead', () => {
    for (const field of ['wordRun', 'wordWalk', 'wordLive', 'wordPaused', 'unitKm', 'unitKcal', 'unitBpm']) {
      expect(widget).toContain(field);
    }
  });

  it('⛔ the words are baked in ONE place, and on BOTH publishing roads', () => {
    /*
     * A run is published twice over: the screen once a second while it is open, and `cardioRun`
     * every fifteen seconds from a background GPS wake. Words baked at each call site are words
     * that eventually disagree — so the HOST fills them, and both of its roads must.
     */
    const la = read('src/platform/liveActivity.ts');
    expect(la).toContain('export function cardioWords()');
    expect(la.split('words: cardioWords()').length - 1).toBe(2);
    // …and neither publisher writes its own.
    expect(read('src/platform/cardio/cardioRun.ts')).not.toContain('cardioWords');
    expect(read('src/screens/cardio/Cardio.tsx')).not.toContain('cardioWords');
  });
});

describe('3 · one shape, two processes', () => {
  /*
   * ActivityKit decodes ContentState across the app↔widget boundary by its Codable shape, so a
   * divergent copy is what stops an activity pairing at all (TestFlight item 8). Both files say so
   * in their own headers; only the strength pair was ever checked.
   *
   * ⚠️ LINE ENDINGS ARE NOT THE SHAPE. The two copies of the cardio state differ today in exactly
   * one way — one file is CRLF and the other LF — which is invisible to Swift and to Codable. A
   * law that failed on that would be a law about checkouts, not about the wire.
   */
  const decl = (rel: string) => {
    const s = read(rel).replace(/\r\n/g, '\n');
    const i = s.indexOf('struct Hush');
    expect(i).toBeGreaterThanOrEqual(0);
    return s.slice(i);
  };

  it('the STRENGTH state is declared identically in the widget and in the app module', () => {
    expect(decl('targets/widget/HushSessionAttributes.swift')).toBe(
      decl('modules/hush-live-activity/ios/HushSessionAttributes.swift'),
    );
  });

  it('⛔ …and so is the CARDIO state, which nothing checked until 2026-09-14', () => {
    expect(decl('targets/widget/HushCardioAttributes.swift')).toBe(
      decl('modules/hush-live-activity/ios/HushCardioAttributes.swift'),
    );
  });

  it('every word the module sends has somewhere to land', () => {
    const module = read('modules/hush-live-activity/ios/HushLiveActivityModule.swift');
    expect(module).toContain('wordBodyweight: r.wordBodyweight');
    expect(module).toContain('struct CardioWordsRecord: Record');
    for (const field of ['wordRun:', 'wordWalk:', 'wordLive:', 'wordPaused:', 'unitKm:', 'unitKcal:', 'unitBpm:']) {
      expect(module).toContain(field);
    }
  });
});

describe('4 · one beat, one wrist', () => {
  const flow = read('src/screens/session/SessionFlow.tsx');

  it('⛔ the in-app rest beat asks the SAME owner the notification layer has always asked', () => {
    /*
     * `phoneOwnsRestHaptics()` is false while a watch is reachable — and a reachable watch is one
     * whose app is alive, which is precisely the condition under which its own locally-scheduled
     * beats fire. Asked at the FIRING instant rather than when the rest was armed, so a watch that
     * goes away mid-rest hands the beat straight back to the phone.
     */
    expect(flow).toContain("phoneOwnsRestHaptics } from '@/platform/restHaptics'");
    expect(flow).toContain('if (phoneOwnsRestHaptics()) {');
  });

  it('…and so does every Approach beat — the wrist counts those down too', () => {
    expect(flow).toContain('remaining === tSec && phoneOwnsRestHaptics()');
  });

  it('the gate itself still means "no watch is there to do it"', () => {
    const rh = read('src/platform/restHaptics.ts');
    expect(rh).toContain('export function phoneOwnsRestHaptics()');
    expect(rh).toContain('!watchTransport.isReachable()');
  });
});

describe('5 · one question, two payload keys', () => {
  const notif = read('src/platform/notifications.ts');

  it('⛔ the foreground handler reads the key `buildPayload` actually writes', () => {
    expect(notif).toContain('buildPayload');
    expect(notif).toContain("typeof data?.intent === 'string'");
  });

  it('…so the kilometre stops banner-ing over the screen that just said it', () => {
    expect(notif).toContain("kind === 'cardio_km'");
    // It stays in the LIST: each split has its own id because the run's splits are a record.
    //
    // ⚠️ ANCHORED INSIDE THE HANDLER. `cardio_km` is named twice in this file, and the FIRST is
    // `intentFromNotificationData` — the router that decides where a TAP goes. Reading from there
    // would let the routing branch stand in for the presentation one, which is the opposite seam.
    const handler = notif.slice(notif.indexOf('setNotificationHandler'));
    const branch = handler.slice(handler.indexOf("kind === 'cardio_km'"));
    expect(branch.slice(0, 220)).toContain('shouldShowBanner: false');
    expect(branch.slice(0, 220)).toContain('shouldShowList: true');
  });
});
