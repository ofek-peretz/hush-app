/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE EAR — a window, not a stream.
 *
 * docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md §4: the microphone opens only after a question and
 * closes on the first final sentence or when the window runs out. Three reasons, all measured on a
 * gym floor: the earbuds' microphone drops the music to phone quality (HFP) for as long as it is
 * open; an always-on microphone in the loudest room the app is ever in is a stream of false
 * answers; and the recognizer's own one-minute cap means a long window (the loading dialogue, up
 * to 90 s) must be restarted silently under the athlete — which this seam does.
 *
 * A thin seam over `expo-speech-recognition` (Apple's Speech framework), resolved as an OPTIONAL
 * native module exactly as the Live Activity is: present in a dev-client / store build, absent in
 * Expo Go, on the web and under jest — and absent means `available() === false` and a window
 * that closes at once with `unavailable`, never a throw. Nothing here imports the package's JS.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { AppState, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { audioSession } from '@/platform/voice/audioSession';
import { cloudEar, LISTEN_EVERY_MS } from '@/platform/voice/cloudEar';
import type { HearExpect } from '@/platform/voice/voiceCloud';

/**
 * iOS 18 and later hand back a final result per UTTERANCE while a continuous request keeps running
 * (`ExpoSpeechRecognizer.swift`, the `speechDuration` final-like result). Before 18, a continuous
 * request holds every final back until it is stopped — so those keep one-sentence requests.
 */
const PER_UTTERANCE_FINALS = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 18;

/** The slice of `ExpoSpeechRecognitionModule` this seam uses — typed here so the package's JS is never imported. */
interface SpeechModule {
  start(options: Record<string, unknown>): void;
  stop(): void;
  abort(): void;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  /** `canAskAgain` is Expo's standard permission field: false once she has answered the dialog. */
  getPermissionsAsync(): Promise<{ granted: boolean; canAskAgain?: boolean }>;
  supportsOnDeviceRecognition?(): boolean;
  addListener(event: string, listener: (e: unknown) => void): { remove(): void };
}

/**
 * Why a window closed. `locked` (2026-09-27): the phone is not on glass and no pocket ear runs —
 * iOS will not START a recording from the background, so the window never tried, and the route
 * was never moved (her music stays whole).
 */
export type WindowEnd = 'heard' | 'silence' | 'timeout' | 'closed' | 'error' | 'denied' | 'unavailable' | 'locked';

const nativeModule: SpeechModule | null =
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? requireOptionalNativeModule<SpeechModule>('ExpoSpeechRecognition')
    : null;

/** The recognizer's tag for the app's locale. */
export function recognizerLang(locale: string): string {
  return locale.startsWith('he') ? 'he-IL' : 'en-US';
}

/**
 * The audio session while a window is open: record AND play, the earbuds' microphone over
 * Bluetooth, her music ducked. Restored to playback-only by the audio module when the window closes.
 * ⛔ Identical to `prepareListening` in `modules/hush-voice-audio` — a difference is a route change.
 */
const LISTENING_SESSION = {
  category: 'playAndRecord',
  categoryOptions: ['duckOthers', 'allowBluetooth', 'defaultToSpeaker'],
  mode: 'measurement',
} as const;

/** Apple's recognizer ends a request itself around the minute; restart under it at 55 s (spec §3.2). */
const RESTART_AFTER_MS = 55_000;
/** How long the earbuds take to move to their call profile before the recognizer starts. */
const ROUTE_SETTLE_MS = 400;

export interface WindowOptions {
  locale: string;
  /** How long to listen, in milliseconds. Long windows are restarted silently under the athlete. */
  ms: number;
  hints?: readonly string[];
  /** What the open question expects — for the second ear (`cloudEar`). */
  expect?: HearExpect;
  /**
   * Every FINAL sentence the window hears. Return `true` to keep the window open (the sentence was
   * not an answer — noise during loading), `false` to close it as `heard`.
   */
  onSentence: (text: string, confidence: number | null) => boolean;
  /** The window closed, and why. Called exactly once. */
  onEnd: (why: WindowEnd) => void;
}

export interface OpenWindow {
  close(): void;
  /**
   * Stop the window's clock without closing it — the app is about to ask a follow-up on the same
   * window (2026-09-27). What she says meanwhile is still heard; nothing times out under the line.
   */
  hold(): void;
  /** Restart the clock at `ms` from now — called when the follow-up line has been said. */
  extend(ms: number): void;
}

/**
 * How long a window waits, after its deadline, for the sentence she was half-way through (2026-09-27).
 * The recognizer is stopped at the deadline and hands back what it had; without this wait the
 * listeners were already gone and "עשר" said at the last second was lost.
 */
const FLUSH_MS = 1_200;

let windowToken = 0;

/*
 * The pocket ear's stops and starts, one after another (2026-09-27, the input audit): a window's
 * stop was not awaited, so it ran beside the NEXT window's listen on a native object that is not an
 * actor — and the old stop could take the new window's results with it.
 */
let pocketChain: Promise<unknown> = Promise.resolve();
function inPocketOrder<T>(f: () => Promise<T>): Promise<T> {
  const run = pocketChain.then(f, f);
  pocketChain = run.catch(() => {});
  return run;
}

/**
 * ⛔ A WINDOW ON THE POCKET EAR (2026-09-15). The microphone already runs (opened on glass, see
 * `HushEar.swift`); the window only decides when its audio is transcribed. Same contract as the
 * screen-on window: every final sentence goes to `onSentence`, and exactly one `onEnd`. At the
 * deadline the recognizer is FLUSHED first — the number she was half-way through saying as the
 * window ran out is still her answer — and only then does the window end as `timeout`.
 */
function openPocketWindow(opts: WindowOptions): OpenWindow {
  const token = ++windowToken;
  let ended = false;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  /** A follow-up is being said on this window (`hold`) — it goes on after its line (`extend`). */
  let held = false;
  const expect: HearExpect = opts.expect ?? 'any';
  /** When the phone last handed over a sentence of this window — a stretch it heard is not heard twice. */
  let lastHeardAt = Date.now();
  /*
   * ⛔ ONE SENTENCE AT A TIME (2026-09-27). Every sentence waits a moment for the strong ear
   * (`cloudEar`) before it is handed on; everything heard meanwhile — the stretches it listens to on
   * its own, and the deadline itself — queues behind it, so answers reach the conductor in order.
   */
  let queue: Promise<void> = Promise.resolve();
  let busy = 0;
  const later = (f: () => Promise<void> | void) => {
    busy += 1;
    queue = queue
      .then(f, f)
      .catch(() => {})
      .finally(() => {
        busy -= 1;
      });
  };
  const off = audioSession.onEarResult((text, from) => {
    if (ended || from !== token) return; // a late sentence of an earlier window is not this answer
    const t = text.trim();
    if (!t) return;
    lastHeardAt = Date.now();
    later(async () => {
      if (ended) return;
      // The strong ear hears the same audio; its words decide — the phone's go on if it cannot answer.
      const said = await cloudEar.check(token, t, expect, opts.locale);
      if (ended) return;
      if (!opts.onSentence(said, null)) finish('heard');
    });
  });
  /*
   * ⛔ A LONG WINDOW IS LISTENED TO WHILE IT IS OPEN, NOT ONLY AT ITS END (2026-09-28). The loading
   * dialogue waits up to ninety seconds for "מוכן": a word the phone did not catch used to wait for
   * the window's end — or for "מוכן?" at forty-five seconds. Every few seconds in which the phone
   * handed over nothing but the microphone heard a voice, the strong ear hears that stretch.
   */
  const longWindow = opts.ms > 12_000;
  const during = longWindow
    ? setInterval(() => {
        if (ended || held || busy > 0 || Date.now() - lastHeardAt < LISTEN_EVERY_MS - 500) return;
        later(async () => {
          if (ended) return;
          const clip = await audioSession.earClip(token, LISTEN_EVERY_MS / 1000 + 0.5);
          const heard = await cloudEar.rescue(clip, expect, opts.locale, 'during');
          if (ended || !heard) return;
          lastHeardAt = Date.now();
          if (!opts.onSentence(heard, null)) finish('heard');
        });
      }, LISTEN_EVERY_MS)
    : null;
  const finish = (why: WindowEnd) => {
    if (ended) return;
    ended = true;
    if (deadline) clearTimeout(deadline);
    deadline = null;
    if (during) clearInterval(during);
    off();
    void inPocketOrder(() => audioSession.earStopListening());
    opts.onEnd(why);
  };
  const arm = (ms: number) => {
    if (deadline) clearTimeout(deadline);
    deadline = setTimeout(() => {
      deadline = null;
      // The recognizer flushed first (what she was half-way through saying is still her answer),
      // every sentence handled, and only then — nothing understood — the strong ear hears the rest.
      void inPocketOrder(() => audioSession.earStopListening()).then(() =>
        later(async () => {
          if (ended) return;
          const clip = await audioSession.earClip(token, longWindow ? LISTEN_EVERY_MS / 1000 + 0.5 : 12);
          const rescued = await cloudEar.rescue(clip, expect, opts.locale, 'end');
          if (ended) return;
          if (rescued) {
            if (!opts.onSentence(rescued, null)) return finish('heard');
            // The rescued words opened a follow-up on this window ("כן" → "כמה חזרות?"): it listens on.
            if (held || deadline) {
              void inPocketOrder(() => audioSession.earListen(recognizerLang(opts.locale), token)).then((error) => {
                if (error) finish('error');
              });
              return;
            }
          }
          finish('timeout');
        }),
      );
    }, Math.max(500, ms));
  };
  arm(opts.ms);
  void inPocketOrder(() => audioSession.earListen(recognizerLang(opts.locale), token)).then((error) => {
    if (error) finish('error');
  });
  return {
    close: () => finish('closed'),
    hold: () => {
      held = true;
      if (deadline) clearTimeout(deadline);
      deadline = null;
    },
    extend: (ms: number) => {
      held = false;
      if (!ended) arm(ms);
    },
  };
}

export const voiceCapture = {
  /** Is there an ear at all in this build? False in Expo Go, on the web and under jest. */
  available(): boolean {
    return nativeModule != null;
  },

  /** Ask for the microphone and speech permissions once, up front — at session start, not mid-set. */
  async ensurePermission(): Promise<boolean> {
    const m = nativeModule;
    if (!m) return false;
    try {
      let perm = await m.getPermissionsAsync();
      if (!perm.granted) perm = await m.requestPermissionsAsync();
      /* ⛔ READ ONCE MORE BEFORE BELIEVING A REFUSAL (2026-09-27). The SDK 54 line of the package
         (3.x — see `theBuildLinksWhatTheAppAsksFor`) answers the request by re-reading
         `recordPermission` inside the grant callback, where it can still say "undetermined" the
         instant she taps Allow; 57.x fixed that by passing the callback's own answer. Without this
         read her first workout would say "no permission" for a grant she had just given. */
      if (!perm.granted) {
        await new Promise((r) => setTimeout(r, 300));
        perm = await m.getPermissionsAsync();
      }
      return perm.granted;
    } catch {
      return false;
    }
  },

  /**
   * ⛔ THE DIALOG BELONGS TO THE TAP OF START (founder 2026-09-28, approving the review: the
   * microphone prompt *"יקפוץ בלחיצה על 'התחל' באימון הראשון, ולא באמצע הסט"*).
   *
   * Apple's microphone dialog cannot be skipped, only placed. `ensurePermission` is asked by the
   * stage as it mounts — which is the first set, on the glass, under her hands — so the doors that
   * start a workout ask here first. It asks only a phone that has NEVER answered: after that it
   * returns at once, so no later Start waits on it (`ensurePermission` re-reads a refusal after
   * 300 ms, and that must not stand between any tap and the first set). Never from the pocket —
   * iOS shows no dialog there — and never when she turned the voice off.
   */
  async askAtStart(voiceOn: boolean): Promise<void> {
    const m = nativeModule;
    if (!m || !voiceOn || Platform.OS !== 'ios' || AppState.currentState !== 'active') return;
    try {
      const perm = await m.getPermissionsAsync();
      if (perm.granted || perm.canAskAgain === false) return;
      await voiceCapture.ensurePermission();
    } catch {
      // A permission read that fails leaves the stage's own ask exactly as it was.
    }
  },

  /**
   * Open one listening window. Closes on the first final sentence the caller accepts, on `ms`
   * elapsed, or on `close()`. Never throws; every road out ends in exactly one `onEnd`.
   */
  open(opts: WindowOptions): OpenWindow {
    // The pocket ear, when the workout opened one: it answers from a locked phone.
    if (audioSession.earRunning()) return openPocketWindow(opts);
    const m = nativeModule;
    /*
     * ⛔ FROM A LOCKED PHONE THIS EAR CANNOT START (2026-09-27, the input audit). iOS refuses to begin
     * a recording in the background and Apple's recognizer does not run there — so every window tried
     * from the pocket moved her earbuds to call quality, failed, and was heard as her silence. It is
     * said once now (`locked`), and nothing is touched.
     */
    if (m && Platform.OS === 'ios' && AppState.currentState !== 'active') {
      let gone = false;
      const t = setTimeout(() => {
        gone = true;
        opts.onEnd('locked');
      }, 0);
      const quietly = () => {
        if (gone) return;
        gone = true;
        clearTimeout(t);
        opts.onEnd('closed');
      };
      return { close: quietly, hold: () => {}, extend: () => {} };
    }
    let ended = false;
    let subs: { remove(): void }[] = [];
    let deadline: ReturnType<typeof setTimeout> | null = null;
    /** A pending reopen (after the recognizer's own end, or an error retried once). */
    let restart: ReturnType<typeof setTimeout> | null = null;
    /** The restart under Apple's minute cap. */
    let cap: ReturnType<typeof setTimeout> | null = null;
    let retried = false;
    let lastFinal = '';
    /*
     * ⛔ THE WINDOW'S CLOCK STARTS WHEN THE MICROPHONE DOES (2026-09-27). It used to start at `open`,
     * before the route moved to the earbuds' microphone (`prepareListening`), the settle, and the
     * recognizer's own start — so a four-second window gave her about three. Now the clock is armed
     * by the first request that actually starts; `startGuard` bounds a start that never comes.
     */
    let listening = false;
    let startGuard: ReturnType<typeof setTimeout> | null = null;
    /** A follow-up line is being said on this window: its clock waits for `extend` (see `OpenWindow`). */
    let held = false;
    let windowMs = opts.ms;
    /** The deadline passed and the recognizer was stopped: its last final is her last word. */
    let flushing = false;
    const clear = () => {
      for (const s of subs) s.remove();
      subs = [];
      if (restart) clearTimeout(restart);
      restart = null;
      if (cap) clearTimeout(cap);
      cap = null;
    };
    const end = (why: WindowEnd) => {
      if (ended) return;
      ended = true;
      clear();
      if (deadline) clearTimeout(deadline);
      deadline = null;
      if (startGuard) clearTimeout(startGuard);
      startGuard = null;
      try {
        m?.stop();
      } catch {
        /* not running */
      }
      /*
       * ⚠️ THE MUSIC COMES BACK ONLY AFTER THE MICROPHONE HAS STOPPED (2026-09-27, the output audit).
       * `stop()` is asynchronous; the caller's unduck deactivates the session, which fails as busy
       * while the engine still runs — and her music stayed ducked, on the call profile. So a window
       * that ended by itself waits for the recognizer's own `end` (bounded); a close is immediate.
       */
      if (why === 'closed' || !m || !listening) return opts.onEnd(why);
      let reported = false;
      const report = () => {
        if (reported) return;
        reported = true;
        sub?.remove();
        clearTimeout(bound);
        opts.onEnd(why);
      };
      const sub: { remove(): void } | null = m.addListener('end', report);
      const bound = setTimeout(report, 500);
    };
    if (!m) {
      setTimeout(() => end('unavailable'), 0);
      return { close: () => end('closed'), hold: () => {}, extend: () => {} };
    }
    /** The deadline: stop the recognizer, keep listening for FLUSH_MS for the sentence it hands back. */
    const flush = () => {
      deadline = null;
      if (ended) return;
      flushing = true;
      if (restart) clearTimeout(restart);
      restart = null;
      if (cap) clearTimeout(cap);
      cap = null;
      try {
        m.stop();
      } catch {
        /* not running */
      }
      deadline = setTimeout(() => end('timeout'), FLUSH_MS);
    };
    const arm = (ms: number) => {
      if (deadline) clearTimeout(deadline);
      deadline = setTimeout(flush, Math.max(500, ms));
    };
    const startRequest = () => {
      if (ended || flushing) return;
      clear();
      // A repeat is only a repeat within ONE request: "מוכן" dropped as bleed while the app spoke must
      // still be heard when she says it again (2026-09-27, the input audit).
      lastFinal = '';
      subs.push(
        m.addListener('result', (e) => {
          const ev = e as { isFinal?: boolean; results?: { transcript?: string; confidence?: number }[] };
          const best = ev.results?.[0];
          const text = (best?.transcript ?? '').trim();
          if (!ev.isFinal || !text) return;
          if (text === lastFinal) return; // some recognizers repeat the last final on segment end
          lastFinal = text;
          retried = false; // an ear that hears is a working ear — one bad moment later is not a second strike
          // iOS 18+ promotes results Apple has not finalised, and their segments carry confidence 0 —
          // that zero is "not measured", never "not sure", or every set would be asked "נכון?".
          const c = typeof best?.confidence === 'number' && best.confidence > 0 ? best.confidence : null;
          const keepOpen = opts.onSentence(text, c);
          if (!keepOpen) end('heard');
          else if (flushing) end('timeout');
        }),
        m.addListener('error', (e) => {
          const ev = e as { error?: string; message?: string };
          if (flushing) return end('timeout');
          if (ev.error === 'no-speech') return; // silence: 'end' follows, and the window's own deadline rules
          /*
           * ⛔ ONLY A REAL REFUSAL IS `denied` (2026-09-27). `service-not-allowed` is a recognizer that is
           * unavailable (a Hebrew model that needs the network in a basement gym), and `not-allowed`
           * is also what iOS reports from the background — both are an ear that failed, which the
           * conductor answers; `denied` it cannot, and the coach went quiet for the set.
           */
          if (ev.error === 'not-allowed') {
            void m
              .getPermissionsAsync()
              .then((p) => end(p.granted ? 'error' : 'denied'))
              .catch(() => end('error'));
            return;
          }
          if (ev.error === 'service-not-allowed') return end('error');
          // Any other error mid-window: try once more under the athlete; a second one closes it.
          if (retried) return end('error');
          retried = true;
          if (!restart) restart = setTimeout(startRequest, 300);
        }),
        m.addListener('end', () => {
          // Stopped at the deadline: whatever it had has been delivered — the window is over.
          if (flushing) return end('timeout');
          // The recognizer closed its own request (silence, the minute cap). Reopen under the
          // athlete for as long as the window has time left.
          if (!ended && !restart) restart = setTimeout(startRequest, 150);
        }),
      );
      // Apple chooses on-device recognition where the locale has it and the network where it
      // does not; REQUIRING on-device would fail every window on a device whose Hebrew is not
      // installed offline (spec §4 accepts Apple's server for the one sentence).
      try {
        m.start({
          lang: recognizerLang(opts.locale),
          interimResults: false,
          /*
           * iOS 18+: ONE request for the whole window, a final per utterance (2026-09-27). The
           * one-sentence request ended itself after three seconds without speech and was restarted
           * under her, and a reply that began at that seam was cut into a fragment. Before 18 a
           * continuous request holds its finals back, so those keep one-sentence requests.
           */
          continuous: PER_UTTERANCE_FINALS,
          maxAlternatives: 1,
          requiresOnDeviceRecognition: false,
          addsPunctuation: false,
          contextualStrings: [...(opts.hints ?? [])].slice(0, 100),
          iosTaskHint: 'confirmation',
          iosCategory: LISTENING_SESSION,
        });
      } catch {
        if (retried) return end('error');
        retried = true;
        if (!restart) restart = setTimeout(startRequest, 500);
        return;
      }
      // The microphone is on: from here, and not before, the window's time is hers.
      if (!listening) {
        listening = true;
        if (startGuard) clearTimeout(startGuard);
        startGuard = null;
        if (!held) arm(windowMs);
      }
      // Restart under the athlete before Apple's own cap ends the request — from the recognizer's
      // own `end` (above), never beside it: a start over a task still finishing cancels both.
      cap = setTimeout(() => {
        cap = null;
        try {
          m.stop();
        } catch {
          /* not running */
        }
      }, RESTART_AFTER_MS);
    };
    // A route or a recognizer that never starts is an ear that failed — never a window left open.
    startGuard = setTimeout(() => {
      startGuard = null;
      if (!listening) end('error');
    }, 4_000);
    /*
     * ⛔ THE ROUTE MOVES FIRST, THEN THE RECOGNIZER STARTS (2026-09-15 audit). Started cold, the
     * recognizer's own switch to record-and-play moves Bluetooth earbuds to their call profile — a
     * route change it hears itself, and from a locked phone it ends the recognition on any route
     * change. So the audio module takes the same listening session first, and the recognizer starts
     * once the route has settled, onto a session its own `setCategory` no longer changes.
     */
    void audioSession.prepareListening().then(() => {
      if (!ended) restart = setTimeout(() => {
        restart = null;
        startRequest();
      }, ROUTE_SETTLE_MS);
    });
    return {
      close: () => end('closed'),
      hold: () => {
        held = true;
        if (!flushing && deadline) clearTimeout(deadline);
        if (!flushing) deadline = null;
      },
      extend: (ms: number) => {
        held = false;
        windowMs = ms;
        if (!ended && listening && !flushing) arm(ms);
      },
    };
  },
};
