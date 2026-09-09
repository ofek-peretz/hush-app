/**
 * The voice coach, mounted on the stage — the one hook that wires the conductor to the real seams.
 *
 * Three gates, all of them the spec's (docs/canonical/HUSH_VOICE_SESSION_SPEC_V1.md §0.1, §4):
 * the profile switch is not off (`voiceCoach`, absent = on), the build has a mouth and an ear, and
 * earbuds are on the output route. Earbuds out → silent at once, the screens carry on; earbuds
 * back → "חזרתי", from the phase she is in. Nothing here draws.
 */

import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import i18next from 'i18next';
import { db } from '@/data/local/db';
import { track } from '@/platform/telemetry';
import { audioSession } from '@/platform/voice/audioSession';
import { coachVoice } from '@/platform/voice/coachVoice';
import { voiceCapture } from '@/platform/voice/voiceCapture';
import { VoiceConductor } from '@/platform/voice/voiceConductor';
import { useApp } from '@/state/stores/appStore';
import type { SessionView } from '@/state/stores/sessionStore';

/**
 * Why the voice is silent right now — null when it is on. `off`: her switch; `no_engine`: the
 * build has no mouth, ear or session module; `no_headset`: no earbuds on the route (silent by
 * design, spec §0.1 — no message); `permission`: the microphone / speech permission was refused.
 * The stage tells her about the last two (founder, 2026-09-09: *"לא היה שמע… גם מהצד שהמאמן מדבר"* —
 * a closed gate looked exactly like a broken coach).
 */
export type VoiceSilence = 'off' | 'no_engine' | 'no_headset' | 'permission' | null;

export function useVoiceCoach(session: SessionView): { silentBecause: VoiceSilence } {
  const app = useApp();
  const [silentBecause, setSilentBecause] = useState<VoiceSilence>('no_headset');
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

  // The conductor, once per stage — built over the real mouth, ear and session.
  if (!conductorRef.current) {
    conductorRef.current = new VoiceConductor({
      mouth: coachVoice,
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
    void track('voice_gate', { switchOn, mouth, ear, audio, headset: audioSession.headsetConnected() });
    if (!switchOn || !capable) {
      c.disable();
      setSilentBecause(!switchOn ? 'off' : 'no_engine');
      applyRef.current = () => {};
      return;
    }
    const apply = (connected: boolean) => {
      if (connected && !c.isOn()) {
        if (deniedRef.current) return;
        void Promise.all([voiceCapture.ensurePermission(), historyReadRef.current]).then(([ok]) => {
          if (ok) {
            c.enable();
            setSilentBecause(null);
          } else {
            deniedRef.current = true;
            setSilentBecause('permission');
            void track('voice_permission_denied');
          }
        });
      } else if (!connected && c.isOn()) {
        c.disable();
        setSilentBecause('no_headset');
      }
    };
    applyRef.current = apply;
    apply(audioSession.headsetConnected());
    const off = audioSession.onRouteChange(apply);
    return () => {
      off();
      applyRef.current = () => {};
      c.disable();
    };
  }, [switchOn]);

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
