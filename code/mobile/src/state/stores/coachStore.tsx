/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE COACH TRACK'S STORE — what the screens of the track stand on. (2026-09-17)
 *
 * ⛔ FOUNDER, 2026-09-17: *"אני רוצה להוסיף מסלול למאמנים שנותנים למתאמנים שלהם להתאמן איתנו."*
 *
 * A thin provider over `state/coachOutbox` (the link, the queue, the pull — React-free so the save
 * path and the laws can reach them) and `platform/coachTrackClient` (the wire). It holds the few
 * facts a screen draws: her role as a coach, her link as a trainee, the update card waiting on
 * Home, and how many workouts are still on their way.
 *
 * ── WHEN IT TALKS TO THE WORKER ─────────────────────────────────────────────────────────────────
 *   · at mount and at every return to the foreground: pull + drain — ONLY WHEN LINKED; and a
 *     `/coach/me` refresh only for a phone that already knows it is a coach;
 *   · when a running workout ends: drain, then pull — a week the coach sent mid-workout was
 *     DEFERRED (law 2) and lands the moment the session is saved;
 *   · on a screen's explicit verb (enroll, join, leave, consent, refreshMe).
 * An athlete who never met a coach makes no call at all.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { db } from '@/data/local/db';
import type { Consent } from '@/domain/coachTrack';
import {
  coachEnroll,
  coachJoin,
  coachMe,
  coachTrackAvailable,
  coachTrackSignedIn,
  traineeConsent,
  traineeLeave,
  type CoachMe,
  type CoachPlanState,
  type CoachResult,
  type CoachSelf,
  type JoinAnswer,
} from '@/platform/coachTrackClient';
import {
  clearPendingCoachUpdate,
  drainOutbox,
  forgetCoachLink,
  loadCoachLink,
  loadCoachMe,
  loadOutbox,
  loadPendingCoachUpdate,
  pullCoachWeek,
  saveCoachLink,
  type CoachLink,
  type PendingCoachUpdate,
  type PullOutcome,
} from '@/state/coachOutbox';
import { useApp } from '@/state/stores/appStore';
import { useSession } from '@/state/stores/sessionStore';
import { track } from '@/platform/telemetry';

export interface CoachTrackView {
  /** Is the track part of this build at all? (No identity URL → no door is ever drawn.) */
  available: boolean;
  /** Her coach account, as `/coach/me` last said. Null = not a coach (or never asked). */
  coach: CoachSelf | null;
  /**
   * ⛔ WHY HIS SEATS ARE THE NUMBER THEY ARE (2026-09-18, the worker's `/coach/plan` landed).
   *
   * Null for a coach who never bought a tier — the free two are the ABSENCE of a plan. The state
   * the screens actually have to say out loud is `over_limit`: his plan lapsed (or he downgraded)
   * while more athletes are linked than he now has seats for. He keeps every one of them and every
   * week he ever sent; what he cannot do is invite another. Nothing about it is drawn as a removal.
   */
  plan: CoachPlanState | null;
  /** Her link to a coach, as a trainee. Null = not linked. */
  link: CoachLink | null;
  /** The update card for Home — set when a new version LANDED, cleared by `dismissUpdate`. */
  pendingUpdate: PendingCoachUpdate | null;
  /** Workouts saved but not yet delivered to her coach. */
  outboxCount: number;

  /** Ask the worker who she is on the track. Updates `coach` and `link`. */
  refreshMe: () => Promise<CoachResult<CoachMe>>;
  enroll: (name: string) => Promise<CoachResult<{ coach: CoachSelf }>>;
  /** Join a coach by code; the first week, when the answer carries one, lands through law 2. */
  join: (input: { code: string; name: string; sex?: 'male' | 'female'; days?: number; consent: Consent }) => Promise<CoachResult<JoinAnswer>>;
  /** ⛔ LAW 6 — leaves the coach; the week stays on the phone, still `authored: 'coach'`. */
  leave: () => Promise<CoachResult<{ ok: boolean }>>;
  setConsent: (consent: Consent) => Promise<CoachResult<{ ok: boolean }>>;
  pullWeek: () => Promise<PullOutcome>;
  drainOutbox: () => Promise<{ sent: number; kept: number }>;
  dismissUpdate: () => Promise<void>;
}

const Ctx = createContext<CoachTrackView | null>(null);
/** The raw context, for the web preview gallery only — screens use `useCoachTrack()`. */
export const CoachTrackContext = Ctx;

export function CoachTrackProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const session = useSession();
  const [coach, setCoach] = useState<CoachSelf | null>(null);
  const [plan, setPlan] = useState<CoachPlanState | null>(null);
  const [link, setLink] = useState<CoachLink | null>(null);
  const [pendingUpdate, setPending] = useState<PendingCoachUpdate | null>(null);
  const [outboxCount, setOutboxCount] = useState(0);

  // The save path, read through a ref so a pull started under an old render lands through the current one.
  const adoptRef = useRef(app.adoptCoachWeek);
  adoptRef.current = app.adoptCoachWeek;
  const adopt = useCallback((p: Parameters<typeof app.adoptCoachWeek>[0]) => adoptRef.current(p), []);

  const reread = useCallback(async () => {
    const [l, me, pending, box] = await Promise.all([
      loadCoachLink(),
      loadCoachMe(),
      loadPendingCoachUpdate(),
      loadOutbox(),
    ]);
    setLink(l);
    setCoach(me?.coach ?? null);
    setPlan(me?.plan ?? null);
    setPending(pending);
    setOutboxCount(box.length);
    return { link: l, me };
  }, []);

  const pullWeek = useCallback(async (): Promise<PullOutcome> => {
    const out = await pullCoachWeek(adopt).catch((): PullOutcome => ({ kind: 'error', error: 'network' }));
    await reread();
    return out;
  }, [adopt, reread]);

  const drain = useCallback(async () => {
    const out = await drainOutbox();
    setOutboxCount(out.kept);
    return out;
  }, []);

  const refreshMe = useCallback(async (): Promise<CoachResult<CoachMe>> => {
    const r = await coachMe();
    if (!r.ok) return r;
    await db.saveCoachTrackMe(r.value).catch(() => {});
    if (r.value.athleteOf) await saveCoachLink(r.value.athleteOf);
    // The server no longer knows a link this phone holds — she left elsewhere, or was removed.
    else if (await loadCoachLink()) await forgetCoachLink();
    await reread();
    return r;
  }, [reread]);

  /**
   * The routine: linked → pull + drain; a known coach → refresh the seats. Nobody else is called.
   *
   * ⛔ …EXCEPT ONCE, EVER, AND THE HOLE IT CLOSES IS A COACH WHO LOST HIS TAB (2026-09-18, walked).
   *
   * `/coach/me` is what tells this phone it belongs to a coach — and it was only ever asked by a
   * phone that ALREADY knew. So a coach who reinstalled, or signed in on a second device, opened
   * the app with four tabs and no roster: the account was live on the worker and nothing on the
   * glass would ever ask. (Re-enrolling repaired it, which is why it survived the first walk — the
   * walk enrolled through the UI.) A trainee restored the same way lost her link, her coach's week
   * and her Pro with it.
   *
   * The cost of closing it is ONE GET, once per install, for an athlete who is neither: after the
   * first ask `loadCoachMe()` answers `{}` rather than null, and that is the memory that keeps the
   * promise in this file's header — *an athlete who never met a coach makes no call at all* — true
   * for every launch after the first.
   */
  const routine = useCallback(async () => {
    if (!coachTrackAvailable()) return;
    const { link: l, me } = await reread();
    const askedBefore = me !== null;
    if (askedBefore && !l && !me.coach) return;
    if (!(await coachTrackSignedIn())) return;
    if (!askedBefore || me?.coach) void refreshMe();
    if (l) {
      await drain();
      await pullWeek();
    }
  }, [reread, refreshMe, drain, pullWeek]);

  useEffect(() => {
    void routine();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void routine();
    });
    return () => sub.remove();
  }, [routine]);

  // A workout just ended: its upload was queued by the save path; a deferred week may land now.
  const wasActive = useRef(session.active);
  useEffect(() => {
    const was = wasActive.current;
    wasActive.current = session.active;
    if (was && !session.active) void routine();
  }, [session.active, routine]);

  const enroll = useCallback(async (name: string) => {
    const r = await coachEnroll(name);
    if (r.ok) {
      const me: CoachMe = { ...((await loadCoachMe()) ?? {}), coach: r.value.coach };
      await db.saveCoachTrackMe(me).catch(() => {});
      setCoach(r.value.coach);
      /* ⚠️ Enrolling never touches the plan — `/coach/enroll` does not answer one, and writing
         `null` here would tell a returning coach his tier had gone. `refreshMe` is the only writer. */
      void track('coach_enrolled', {});
    }
    return r;
  }, []);

  const join = useCallback<CoachTrackView['join']>(async (input) => {
    const r = await coachJoin(input);
    if (!r.ok) return r;
    await saveCoachLink({ linkId: r.value.linkId, coachName: r.value.coachName, since: r.value.since, consent: input.consent });
    void track('coach_joined', { withWeek: !!r.value.week });
    if (r.value.week) await pullCoachWeek(adopt, { envelope: r.value.week }).catch(() => null);
    await reread();
    return r;
  }, [adopt, reread]);

  const leave = useCallback(async () => {
    const r = await traineeLeave();
    if (r.ok) {
      await forgetCoachLink(); // the programme is NOT touched — law 6
      void track('coach_left', {});
      await reread();
    }
    return r;
  }, [reread]);

  const setConsent = useCallback(async (consent: Consent) => {
    const r = await traineeConsent(consent);
    if (r.ok) {
      const l = await loadCoachLink();
      if (l) await saveCoachLink({ ...l, consent });
      await reread();
    }
    return r;
  }, [reread]);

  const dismissUpdate = useCallback(async () => {
    await clearPendingCoachUpdate();
    setPending(null);
  }, []);

  const value = useMemo<CoachTrackView>(
    () => ({
      available: coachTrackAvailable(),
      coach,
      plan,
      link,
      pendingUpdate,
      outboxCount,
      refreshMe,
      enroll,
      join,
      leave,
      setConsent,
      pullWeek,
      drainOutbox: drain,
      dismissUpdate,
    }),
    [coach, plan, link, pendingUpdate, outboxCount, refreshMe, enroll, join, leave, setConsent, pullWeek, drain, dismissUpdate],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCoachTrack(): CoachTrackView {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCoachTrack must be used within CoachTrackProvider');
  return v;
}
