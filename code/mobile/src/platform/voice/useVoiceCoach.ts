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
import i18next from 'i18next';
import { db } from '@/data/local/db';
import { track } from '@/platform/telemetry';
import { audioSession, type EarSource } from '@/platform/voice/audioSession';
import { coachVoice } from '@/platform/voice/coachVoice';
import { recognizerLang, voiceCapture } from '@/platform/voice/voiceCapture';
import { VoiceConductor } from '@/platform/voice/voiceConductor';
import { useApp } from '@/state/stores/appStore';
import { syncTrace } from '@/platform/syncTrace';
import type { SessionView } from '@/state/stores/sessionStore';

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
  const conductorRef = useRef<VoiceConductor | null>(null);
  // `voiceSpec`, not the dead phase-B `voiceCoach` — see `Profile.voiceSpec` (2026-09-09).
  const switchOn = app.profile?.voiceSpec !== false;
  const units = app.profile?.units ?? 'kg';
  const mic: EarSource = app.profile?.voiceMic ?? 'headset';
  const micRef = useRef(mic);
  micRef.current = mic;

  /*
   * ════ THE POCKET EAR IS OPENED ON GLASS (2026-09-15) ════
   *   > founder: *"אם המסך דלוק זה אומר … שהמתאמן יצטרך ללחוץ על המסך … מה שהורס את כל החוויה"*
   * iOS will not start a microphone from a locked phone, and Apple's old recognizer does not run
   * there at all. So the microphone is opened here — the gate opens on the stage, which she is
   * looking at — and kept for the workout; `voiceCapture` hands its windows to it. Without iOS 26,
   * the Hebrew model, or on refusal, nothing changes: the screen-on ear is what listens.
   *
   * ⛔ ONLY ON THE PHONE'S OWN MICROPHONE (founder, 2026-09-15: *"אי אפשר שהשמע של המוזיקה
   * תיפגע"*). A Bluetooth microphone held open for the workout keeps her earbuds on their call
   * profile — her music at phone-call quality from the first set to the last. The earbuds'
   * microphone is therefore only ever opened in the conductor's short windows (the founder's own
   * design: the app asks, she answers, the microphone closes). The continuous ear is the phone's
   * microphone, which leaves the earbuds on A2DP and her music untouched.
   */
  const openPocketEar = async (): Promise<void> => {
    if (Platform.OS !== 'ios' || audioSession.earRunning() || micRef.current !== 'phone') return;
    const lang = recognizerLang(i18next.language ?? 'en');
    if (!(await audioSession.earAvailable(lang))) return void track('voice_ear', { state: 'unsupported', lang });
    if (!(await audioSession.earPrepare(lang))) return void track('voice_ear', { state: 'no_model', lang });
    if (AppState.currentState !== 'active') return void track('voice_ear', { state: 'not_on_glass' });
    const error = await audioSession.earOpen(micRef.current);
    void track('voice_ear', { state: error ? 'failed' : 'open', error, source: micRef.current });
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
        },
        interrupt: () => coachVoice.interrupt(),
      },
      ear: voiceCapture,
      audio: audioSession,
      now: () => Date.now(),
      setTimeout: (f, ms) => setTimeout(f, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      getView: () => viewRef.current,
      locale: () => ({ locale: i18next.language ?? 'en', units: viewRef.current ? units : units }),
      firstSessionEver: () => firstEverRef.current === true,
      track: (event, props) => void track(event, props),
    });
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
    const open = () => {
      if (c.isOn() || deniedRef.current || opening) return;
      opening = true;
      void Promise.all([voiceCapture.ensurePermission(), historyReadRef.current]).then(([ok]) => {
        opening = false;
        if (disposed || c.isOn()) return;
        if (!ok) {
          deniedRef.current = true;
          setSilentBecause('permission');
          void track('voice_permission_denied');
          return;
        }
        if (!audioSession.headsetConnected()) return apply(false);
        // The pocket ear first (bounded), so the first question can already be answered from a
        // locked phone and the earbuds' switch to their microphone lands before the first line.
        void Promise.race([openPocketEar(), new Promise((r) => setTimeout(r, EAR_OPEN_WAIT_MS))]).then(() => {
          if (disposed || c.isOn() || !audioSession.headsetConnected()) return;
          c.enable();
          setSilentBecause(null);
        });
      });
    };
    const close = () => {
      if (c.isOn()) c.disable();
      void audioSession.earClose();
    };
    const apply = (connected: boolean) => {
      if (disposed) return;
      if (connected) {
        if (confirm) clearTimeout(confirm);
        confirm = null;
        open();
      } else if (!confirm) {
        confirm = setTimeout(() => {
          confirm = null;
          if (disposed) return;
          if (audioSession.headsetConnected()) return open();
          close();
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
      if (!c.isOn() && !deniedRef.current && audioSession.headsetConnected()) apply(true);
    }, POLL_MS);
    // Back on glass with the voice on and no pocket ear (it could not open, or a call stopped it in
    // the pocket): this is the one moment iOS lets the microphone start again.
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active' && c.isOn() && !audioSession.earRunning()) void openPocketEar();
    });
    const earState = audioSession.onEarState((running, error) => {
      if (!running) void track('voice_ear', { state: 'stopped', error });
    });
    return () => {
      disposed = true;
      off();
      clearInterval(poll);
      appState.remove();
      earState();
      if (confirm) clearTimeout(confirm);
      applyRef.current = () => {};
      close();
    };
  }, [switchOn]);

  // Her microphone choice changed with the ear open (the profile, on glass): reopen on the new one.
  const lastMicRef = useRef(mic);
  useEffect(() => {
    if (lastMicRef.current === mic) return;
    lastMicRef.current = mic;
    // To the earbuds: the continuous ear closes (windows only). To the phone: it opens, if the voice is on.
    if (mic !== 'phone') void audioSession.earClose();
    else if (conductorRef.current?.isOn()) void openPocketEar();
  }, [mic]);

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
