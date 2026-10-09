/**
 * The voice coach, mounted on the stage — the one hook that wires the conductor to the real seams.
 *
 * Three gates, all of them the spec's (docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md §0.1, §4):
 * the profile switch is not off (`voiceCoach`, absent = on), the build has a mouth and an ear, and
 * earbuds are on the output route. Earbuds out → silent at once, the screens carry on; earbuds
 * back → "חזרתי", from the phase she is in. Nothing here draws.
 */

import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18next from 'i18next';
import { db } from '@/data/local/db';
import { track } from '@/platform/telemetry';
import { audioSession } from '@/platform/voice/audioSession';
import { coachVoice } from '@/platform/voice/coachVoice';
import { cloudEar } from '@/platform/voice/cloudEar';
import { neuralVoice } from '@/platform/voice/neuralVoice';
import { fixedLines, voiceLinesAhead } from '@/domain/voiceLinesAhead';
import { recognizerLang, voiceCapture } from '@/platform/voice/voiceCapture';
import { VoiceConductor, type VoicePersisted } from '@/platform/voice/voiceConductor';
import { workoutHoldsMicrophone } from '@/platform/voice/workoutMicrophone';
import { useApp } from '@/state/stores/appStore';
import { syncTrace } from '@/platform/syncTrace';
import { restAfterStep, type SessionView, type Step } from '@/state/stores/sessionStore';
import { restHaptics } from '@/platform/restHaptics';

/**
 * Why the voice is silent right now — null when it is on. `off`: her switch; `no_engine`: the
 * build has no mouth, ear or session module; `no_headset`: no earbuds on the route (silent by
 * design, spec §0.1 — no message); `permission`: the microphone / speech permission was refused.
 * The stage tells her about the last two (founder, 2026-09-09: *"לא היה שמע… גם מהצד שהמאמן מדבר"* —
 * a closed gate looked exactly like a broken coach).
 */
export type VoiceSilence = 'off' | 'no_engine' | 'no_headset' | 'permission' | null;

/** How long a "no earbuds" read must stand before the gate believes it. */
const CONFIRM_MS = 1500;
/** While the gate is shut, how often the route is asked again. */
const POLL_MS = 3000;
/** How long the voice waits for the pocket ear before it speaks without it (a first model download is longer). */
const EAR_OPEN_WAIT_MS = 3000;
/** Where the voice keeps what must survive a killed app (see `VoicePersisted`). */
const VOICE_STATE_KEY = 'hush.voice.state';
/** The most the last lines of a workout may take to be said before the voice lets go regardless. */
const DRAIN_MS = 20_000;
/**
 * ⛔ EARBUDS THAT DROP DO NOT COST HER THE EAR (2026-10-05). When the earbuds left, the microphone was
 * closed with the voice — and iOS will not START a recording from the pocket. So one Bluetooth
 * hiccup, or AirPods hopping to her laptop and back, and the coach returned saying "חזרתי" but deaf
 * until the next time she happened to look at the phone. The microphone is now kept this long after
 * the earbuds go (running, keeping nothing — no window is open with the voice off); if they are back
 * inside it, she is heard at once. Past it the app lets the microphone go: it does not hold one
 * through a workout it is not coaching.
 */
export const EAR_GRACE_MS = 3 * 60_000;

export function useVoiceCoach(session: SessionView): { silentBecause: VoiceSilence } {
  const app = useApp();
  /* ⛔ UNKNOWN UNTIL THE GATE IS READ (2026-09-15). This began as 'no_headset', so with earbuds IN the
     stage announced "the coach needs earbuds" for the moment the permission check took — on every
     mount. The gate below says 'no_headset' when it actually reads no headset. */
  const [silentBecause, setSilentBecause] = useState<VoiceSilence>(null);
  /** Denied once this mount: iOS does not ask twice, and the re-check below must not spam. */
  const deniedRef = useRef(false);
  /** The gate, re-applied from the observe effect when a route change was never delivered. */
  const applyRef = useRef<(connected: boolean) => void>(() => {});
  const viewRef = useRef(session);
  viewRef.current = session;
  const firstEverRef = useRef<boolean | null>(null);
  /** Resolves once the history was read — the opening line depends on it (§1). */
  const historyReadRef = useRef<Promise<void> | null>(null);
  /** Resolves once the voice's state from before a relaunch was read (see below). */
  const restoredRef = useRef<Promise<void> | null>(null);
  const conductorRef = useRef<VoiceConductor | null>(null);
  // `voiceSpec`, not the dead phase-B `voiceCoach` — see `Profile.voiceSpec` (2026-09-09).
  const switchOn = app.profile?.voiceSpec !== false;
  const units = app.profile?.units ?? 'kg';
  /*
   * ⛔ THE PHONE'S MICROPHONE BY DEFAULT (2026-09-27, the input audit). The earbuds' microphone can
   * only be opened on glass — iOS refuses to START a recording in the background — so with the
   * phone in her pocket, the default ear could never hear a single answer; and every window it
   * tried moved her music to call quality. The phone's own microphone is opened on glass once and
   * kept (`openPocketEar`), answers from the pocket, and leaves her music whole. Where it cannot
   * open (she refused the microphone, or nothing at all could listen through it), the screen-on ear
   * is what listens, exactly as before.
   *
   * ⛔ AND THERE IS NO CHOICE TO MAKE (2026-10-06, after the research the founder asked for). The
   * profile used to offer "earbuds": in build 76 that meant no held microphone at all — a coach deaf
   * from a pocket — and for one afternoon it meant moving the held engine to the earbuds for each
   * answer, which nothing Apple has written says a locked phone may do. `Profile.voiceMic` is not
   * read any more. Whether the earbuds' microphone can ever hear an answer from a pocket is one of
   * the questions the profile's measurement asks the phone (`platform/voice/voiceMeasure`).
   */
  /*
   * ════ THE NATURAL VOICE AND THE SECOND EAR (2026-09-27) ════
   * Her choices from the profile, applied before anything is said: which voice the coach speaks in
   * (`neuralVoice` — Carmit says any line not yet on the phone), and whether a number and a missed
   * answer are heard again by the cloud recognizer (`cloudEar`). Both degrade to exactly the voice
   * that shipped before them: offline, signed out, or out of budget, nothing changes but the sound.
   */
  neuralVoice.setVoice(app.profile?.coachVoiceId);
  cloudEar.setEnabled(app.profile?.voiceCloudEar !== false);

  /*
   * ════ THE POCKET EAR IS OPENED ON GLASS (2026-09-15) ════
   *   > founder: *"אם המסך דלוק זה אומר … שהמתאמן יצטרך ללחוץ על המסך … מה שהורס את כל החוויה"*
   * iOS will not start a microphone from a locked phone, and Apple's old recognizer does not run
   * there at all. So the microphone is opened here — the gate opens on the stage, which she is
   * looking at — and kept for the workout; `voiceCapture` hands its windows to it.
   *
   * ⛔ IT OPENS FOR THE STRONG EAR, ON EVERY PHONE — IT DOES NOT ASK APPLE'S RECOGNIZER FIRST
   * (founder, 2026-10-05: *"מה זאת אומרת אין עדיין אוזן של openai? אבל אמרנו ש-openai זה מי שהמשתמש
   * מנהל איתו את השיחה לאורך כל האימון"*). It used to return before `earOpen` unless the phone had
   * Apple's new on-device recognizer (iOS 26) AND its Hebrew model — so the recording the strong ear
   * hears through did not exist on any other phone, and there the coach's ear was Apple's old
   * recognizer on a lit screen. Never a decision: the order two things were built in. Now the
   * microphone opens whenever the strong ear can listen; the phone's own recognizer is fetched
   * behind it, for the gym with no signal. Only when NEITHER could hear a window is the microphone
   * left closed — holding it would buy her nothing.
   *
   * ⛔ ONLY ON THE PHONE'S OWN MICROPHONE (founder, 2026-09-15: *"אי אפשר שהשמע של המוזיקה
   * תיפגע"*). A Bluetooth microphone held open for the workout keeps her earbuds on their call
   * profile — her music at phone-call quality from the first set to the last. The earbuds'
   * microphone is therefore only ever opened in the conductor's short windows (the founder's own
   * design: the app asks, she answers, the microphone closes). The continuous ear is the phone's
   * microphone, which leaves the earbuds on A2DP and her music untouched.
   */
  const openPocketEar = async (): Promise<void> => {
    // ⛔ ALWAYS the phone's own microphone (2026-10-06): it is what holds the right to listen from a
    // pocket. Until today choosing "earbuds" meant no held microphone at all — and so nothing heard
    // from a locked phone.
    // ⛔ AND NONE AT ALL while the workout holds no microphone (2026-10-10, `workoutMicrophone`):
    // every road that would open it — the gate, the return to glass — ends here.
    if (!workoutHoldsMicrophone()) return;
    if (Platform.OS !== 'ios' || audioSession.earRunning()) return;
    const lang = recognizerLang(i18next.language ?? 'en');
    const strong = cloudEar.available();
    if (!strong) {
      // Only the phone's own recognizer could listen: it has to be there for the microphone to be worth holding.
      if (!(await audioSession.earAvailable(lang))) return void track('voice_ear', { state: 'unsupported', lang });
      if (!(await audioSession.earPrepare(lang))) return void track('voice_ear', { state: 'no_model', lang });
    }
    if (AppState.currentState !== 'active') return void track('voice_ear', { state: 'not_on_glass' });
    const error = await audioSession.earOpen('phone');
    void track('voice_ear', { state: error ? 'failed' : 'open', error, strong });
    // The phone's own recognizer, behind the strong ear: its model is fetched while she trains (a
    // download the first time), and a window uses it from the moment it is on the phone.
    if (strong && !error) {
      void audioSession
        .earAvailable(lang)
        .then((can) => (can ? audioSession.earPrepare(lang) : false))
        .then((own) => void track('voice_ear', { state: own ? 'own_recognizer' : 'strong_only', lang }))
        .catch(() => {});
    }
  };

  // The conductor, once per stage — built over the real mouth, ear and session.
  if (!conductorRef.current) {
    conductorRef.current = new VoiceConductor({
      // The mouth, traced: when a line began and when it ended (`platform/syncTrace`; inert when off).
      mouth: {
        say: async (text: string, locale: string) => {
          syncTrace.add('V', text.length);
          await coachVoice.say(text, locale);
          syncTrace.add('v');
          // Written down (`voiceJournal`): the line's first words, which mouth said it, and how it ended.
          const last = coachVoice.lastLine();
          /*
           * …and, since 2026-10-10, what the duck before it did and where the phone was. The profile's
           * measurement hears the duck on glass; a workout is in a pocket, and whether her music is
           * lowered THERE is read from these rows after any workout — `let/took/on` is a duck that
           * let the session go, took it again, and has the option on it.
           */
          const duck = audioSession.duckReport?.() ?? null;
          void track('voice_said', {
            line: text.slice(0, 22),
            by: last?.engine ?? null,
            end: last?.how ?? null,
            glass: AppState.currentState === 'active',
            duck: duck ? `${duck.letGo === 'ok' ? 'let' : (duck.letGo ?? '?')}/${duck.taken === 'ok' ? 'took' : (duck.taken ?? '?')}/${duck.option ? 'on' : 'OFF'}` : null,
          });
        },
        interrupt: () => coachVoice.interrupt(),
        warm: (lines, locale) => coachVoice.warm(lines, locale),
      },
      // The ear, written down: which microphone a window listened through, and what it ended with.
      ear: {
        open: (o) => {
          void track('voice_window', { expect: o.expect ?? null, s: Math.round(o.ms / 1000), mic: audioSession.earRunning() ? 'held' : 'screen', patient: o.patient ?? false, glass: AppState.currentState === 'active' });
          return voiceCapture.open({
            ...o,
            onEnd: (why) => {
              if (why !== 'heard' && why !== 'closed') void track('voice_window_end', { why, expect: o.expect ?? null });
              o.onEnd(why);
            },
          });
        },
      },
      audio: audioSession,
      now: () => Date.now(),
      setTimeout: (f, ms) => setTimeout(f, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      getView: () => viewRef.current,
      locale: () => ({ locale: i18next.language ?? 'en', units: viewRef.current ? units : units }),
      firstSessionEver: () => firstEverRef.current === true,
      track: (event, props) => void track(event, props),
      earIsFree: () => audioSession.earRunning(),
      hearsHer: () => workoutHoldsMicrophone(),
      persist: (p) => void AsyncStorage.setItem(VOICE_STATE_KEY, JSON.stringify(p)).catch(() => {}),
    });
  }
  /*
   * What the voice said before the app was killed (2026-09-27, the conductor audit): read once, before
   * the gate can enable it, so a relaunch mid-workout says "חזרתי" — not the opening, again, at lift four.
   */
  if (!restoredRef.current) {
    restoredRef.current = AsyncStorage.getItem(VOICE_STATE_KEY)
      .then((raw) => {
        const p = raw ? (JSON.parse(raw) as VoicePersisted) : null;
        if (p && p.startedAtMs === viewRef.current?.startedAtMs) conductorRef.current?.restore(p);
      })
      .catch(() => {});
  }

  // "Her first workout" is read once per mount, before the opening line can need it.
  if (!historyReadRef.current) {
    historyReadRef.current = db
      .loadHistory()
      .then((h) => {
        firstEverRef.current = h.length === 0;
      })
      .catch(() => {
        firstEverRef.current = false;
      });
  }

  // The gates: the switch, the build, the earbuds. Earbuds come and go mid-workout.
  useEffect(() => {
    const c = conductorRef.current!;
    const mouth = coachVoice.available();
    const ear = voiceCapture.available();
    const audio = audioSession.available();
    const capable = Platform.OS === 'ios' && mouth && ear && audio;
    /*
     * ⛔ THE GATE IS WRITTEN DOWN (founder, 2026-09-09: *"הקול באימון לא עובד"*). Four gates stand
     * between the stage and the first line, and a closed one is silent by design (spec §0.1) — so
     * when the voice does not speak, this row is the only way to know WHICH gate was shut. The
     * profile's voice row reads the same gates live (`VoiceGateLine`).
     */
    void track('voice_gate', {
      switchOn,
      mouth,
      ear,
      audio,
      headset: audioSession.headsetConnected(),
      outputs: audioSession.routeInfo()?.outputs.map((o) => o.type).join(',') ?? null,
    });
    if (!switchOn || !capable) {
      c.disable();
      setSilentBecause(!switchOn ? 'off' : 'no_engine');
      applyRef.current = () => {};
      return;
    }
    /*
     * ⛔ "NO EARBUDS" IS BELIEVED ONLY TWICE (founder, 2026-09-15: *"זה כותב לי המאמן בקול מדבר דרך
     * האוזניות. חבר אותן והוא מתחיל. אבל בפועל אין קול"* — with earbuds in). One read of the route
     * that said "speaker" was enough to shut the gate, flash the notice, or disable a coach that had
     * just started, and the app's own audio switches produce exactly such reads. So a "not connected"
     * is read again after CONFIRM_MS before anything acts on it, a "connected" is re-checked after
     * the permission wait, and while the gate is shut the route is asked every POLL_MS — a gate that
     * missed its moment opens within seconds, not at the next logged set.
     */
    let disposed = false;
    let confirm: ReturnType<typeof setTimeout> | null = null;
    let opening = false;
    /** The microphone's grace after the earbuds left (see `EAR_GRACE_MS`). */
    let earGrace: ReturnType<typeof setTimeout> | null = null;
    const keepEar = () => {
      if (earGrace) clearTimeout(earGrace);
      earGrace = null;
    };
    /* ⛔ A REFUSED MICROPHONE SILENCES THE EAR, NOT THE COACH (2026-09-27, the input audit). The
       lines — the load, how to build it, the rest, the ten seconds — help without an answer, and the
       lock screen and the wrist carry the answers; the coach says once that it cannot hear. */
    /** The voice came on or went quiet: written down, and the rest-over alert is told who says it now. */
    const voiceIs = (on: boolean, why: string) => {
      restHaptics.voiceCallsTheSet?.(on);
      void track(on ? 'voice_on' : 'voice_off', { why, mic: audioSession.earRunning() ? 'held' : 'none', glass: AppState.currentState === 'active' });
    };
    const openWithoutEar = () => {
      if (!audioSession.headsetConnected() || c.isOn()) return;
      c.enable();
      c.earRefused();
      voiceIs(true, 'no_permission');
    };
    const open = () => {
      if (c.isOn() || opening) return;
      if (!workoutHoldsMicrophone()) {
        // No microphone to open and none to ask her for: the coach speaks (the conductor's ear is
        // down by design, `hearsHer`), and the lock screen, the wrist and the stage carry the sets.
        opening = true;
        void Promise.all([historyReadRef.current, restoredRef.current]).then(() => {
          opening = false;
          if (disposed || c.isOn() || !audioSession.headsetConnected()) return;
          c.enable();
          setSilentBecause(null);
          voiceIs(true, 'earbuds');
        });
        return;
      }
      if (deniedRef.current) return openWithoutEar();
      opening = true;
      void Promise.all([voiceCapture.ensurePermission(), historyReadRef.current, restoredRef.current]).then(([ok]) => {
        opening = false;
        if (disposed || c.isOn()) return;
        if (!ok) {
          deniedRef.current = true;
          setSilentBecause('permission');
          void track('voice_permission_denied');
          return openWithoutEar();
        }
        if (!audioSession.headsetConnected()) return apply(false);
        // The pocket ear first (bounded), so the first question can already be answered from a
        // locked phone and the earbuds' switch to their microphone lands before the first line.
        void Promise.race([openPocketEar(), new Promise((r) => setTimeout(r, EAR_OPEN_WAIT_MS))]).then(() => {
          if (disposed || c.isOn() || !audioSession.headsetConnected()) return;
          c.enable();
          setSilentBecause(null);
          voiceIs(true, 'earbuds');
        });
      });
    };
    /** `leaving`: the stage is going (the workout ended, the screen unmounted) — nothing is kept. */
    const close = (leaving: boolean) => {
      if (c.isOn()) voiceIs(false, leaving ? 'stage_left' : 'no_earbuds');
      if (c.isOn()) {
        if (c.ended()) {
          /* ⛔ THE WORKOUT IS OVER AND THE STAGE IS LEAVING (2026-09-27): the last set's echo and
             "סיימת את האימון" are said to the end first — the unmount used to cut both. The process
             is held awake for them, since the workout has just let go of its own keep-alive. */
          void audioSession.holdKeepAlive('voice');
          void Promise.race([c.finish(), new Promise((r) => setTimeout(r, DRAIN_MS))]).then(() => {
            c.disable();
            void audioSession.releaseKeepAlive('voice');
          });
        } else {
          c.disable();
        }
      }
      keepEar();
      if (leaving) return void audioSession.earClose();
      earGrace = setTimeout(() => {
        earGrace = null;
        void audioSession.earClose();
      }, EAR_GRACE_MS);
    };
    const apply = (connected: boolean) => {
      if (disposed) return;
      if (connected) {
        if (confirm) clearTimeout(confirm);
        confirm = null;
        keepEar(); // back inside the grace: the microphone that was kept is the one that hears her
        // Back before the departure was confirmed: the voice picks up where the pull cut it.
        if (c.isOn()) c.onInterruption(false);
        open();
      } else if (!confirm) {
        // ⛔ Not one more word out of the phone's speaker while the departure is confirmed (2026-09-27,
        // the output audit: a line went on through the speaker for a second and a half).
        if (c.isOn()) c.onInterruption(true);
        confirm = setTimeout(() => {
          confirm = null;
          if (disposed) return;
          if (audioSession.headsetConnected()) return open();
          close(false);
          setSilentBecause('no_headset');
          void track('voice_gate_closed', { reason: 'no_headset' });
        }, CONFIRM_MS);
      }
    };
    applyRef.current = apply;
    apply(audioSession.headsetConnected());
    // The event is a knock, not an answer: the route is read again, on a session that is ours.
    const off = audioSession.onRouteChange(() => apply(audioSession.headsetConnected()));
    const poll = setInterval(() => {
      if (!c.isOn() && audioSession.headsetConnected()) apply(true);
      // The strong ear could not be reached and its wait is over (`cloudEar.deaf`): the next
      // question is listened to again — reached, she hears as before; not, it waits again, unsaid.
      if (c.isOn() && c.earDownBecause() === 'deaf' && !cloudEar.deaf()) c.earMayListen();
    }, POLL_MS);
    // Back on glass with the voice on and no pocket ear (it could not open, or a call stopped it in
    // the pocket): this is the one moment iOS lets the microphone start again — and the screen-on
    // ear can hear again, so the conductor may open windows again.
    const appState = AppState.addEventListener('change', (s) => {
      // Every turn of the app's state during a workout, written down: on glass, minimised, locked.
      void track('voice_app', { state: s, on: c.isOn(), mic: audioSession.earRunning() ? 'held' : 'none' });
      if (s !== 'active' || !c.isOn()) return;
      if (!deniedRef.current) c.earMayListen();
      /*
       * ⛔ AN INTERRUPTION THAT NEVER SAID IT ENDED (2026-10-05). iOS does not promise an "ended" for
       * every "began" (Apple says so in as many words), and the conductor says nothing while one is
       * on — so a single missed "ended" left the coach mute for the rest of the workout, with
       * nothing on any screen to say why. She is on glass now: the audio is asked for. If it is
       * given, the interruption is over, whatever was or was not reported; if a call still holds
       * it, nothing changes.
       */
      void (async () => {
        if (c.isInterrupted() && (await audioSession.recoverSession()) && !disposed) c.onInterruption(false);
        if (!disposed && c.isOn() && !audioSession.earRunning()) void openPocketEar();
      })();
    });
    const earState = audioSession.onEarState((running, error) => {
      // Every word the microphone says about itself is written down — "restarted", "stopped", and
      // the one trace a sleep leaves: "app was suspended" (see the Swift).
      void track('voice_ear', { state: running ? 'running' : 'stopped', error });
      if (running && !deniedRef.current) c.earMayListen();
    });
    // A call, Siri, an alarm: nothing is said over it; a question it cut off is asked after it (§3.9).
    const offCall = audioSession.onInterruption((began) => c.onInterruption(began));
    return () => {
      disposed = true;
      off();
      offCall();
      clearInterval(poll);
      appState.remove();
      earState();
      if (confirm) clearTimeout(confirm);
      applyRef.current = () => {};
      close(true);
    };
  }, [switchOn]);

  /*
   * The lines ahead, fetched in the natural voice while nothing waits on them (2026-09-27): once as
   * the workout starts, and again at every rest — from the step she is on to the end, so a load the
   * verdict moved, or a lift the board brought forward, is ready before the chime.
   */
  const prefetchedSessionRef = useRef<string | null>(null);
  const prefetchedRestRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session.active || !neuralVoice.enabled()) return;
    const resting = session.displayPhase === 'REST_INTER' || session.displayPhase === 'REST_TRANSITION';
    const sessionKey = String(session.startedAtMs ?? 0);
    const restKey = resting ? `${sessionKey}:${session.globalProgress?.index ?? 0}` : null;
    const newSession = prefetchedSessionRef.current !== sessionKey;
    if (!newSession && (!restKey || restKey === prefetchedRestRef.current)) return;
    if (newSession) {
      prefetchedSessionRef.current = sessionKey;
      neuralVoice.reset(); // a network that failed last workout is tried again
    }
    if (restKey) prefetchedRestRef.current = restKey;
    const l = { locale: i18next.language ?? 'en', units };
    const from = (session.globalProgress?.index ?? 0) + (resting ? 1 : 0);
    // The rest each step will be given — the store's own rule, so the prefetched rest line is the said one.
    const ahead = voiceLinesAhead(session.livePlan as never[], from, (st) => restAfterStep(st as Step), l);
    neuralVoice.prefetch([...ahead, ...fixedLines()], l.locale);
  }, [session.active, session.startedAtMs, session.displayPhase, session.globalProgress?.index]);

  // A new workout: a strong ear that could not be reached last time is tried again at once.
  useEffect(() => {
    if (!session.active) return;
    cloudEar.reset();
  }, [session.active, session.startedAtMs]);

  // Every change of the view lands on the conductor; "+15" moves the ten-seconds line.
  const lastExtraRef = useRef(session.restExtraSeconds);
  useEffect(() => {
    const c = conductorRef.current!;
    /*
     * ⛔ THE GATE IS RE-READ ON EVERY TURN OF THE SESSION (2026-09-09). The mount-time read above
     * and one route-change listener were the only two doors in, and the founder trained a whole
     * workout with earbuds in and heard nothing: a read that answered "speaker" once (the session
     * was not yet activated) was never corrected, because nothing on the route changed after it.
     * So while the voice is off for want of a headset, every view change asks the route again —
     * cheap, idempotent, and it cannot spam: a refused permission is remembered for the mount.
     */
    if (!c.isOn() && audioSession.headsetConnected()) applyRef.current(true);
    c.observe(session);
    if (session.restExtraSeconds !== lastExtraRef.current) {
      lastExtraRef.current = session.restExtraSeconds;
      c.onRestExtended(session);
    }
  }, [session]);

  return { silentBecause };
}
