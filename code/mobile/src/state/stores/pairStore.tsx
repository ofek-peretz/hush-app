/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PAIR — the live half. Two athletes, one bar, for the length of one workout. (2026-08-31)
 *
 * `domain/sharedSession` holds every rule; `platform/sharedClient` holds the socket. This holds the
 * one thing neither can: the JOIN between the pair and the running session. It reads the session
 * (`livePlan`, `loggedSets`, `phase`) and publishes a count; it receives the partner's count and
 * derives what the stage draws. That is the whole of it.
 *
 * ── ⛔ IT IS A SPECTATOR OF THE SESSION, NOT A SECOND AUTHORITY OVER IT ──────────────────────────
 *
 * The wrist's protocol settled this question for this codebase and the answer is reused verbatim:
 * *"Phone → Watch: a read-only mirror. Watch → Phone: INTENTS, never state."* A partner is further
 * away than a wrist, not closer, so nothing arriving on this wire may log a set, move a cursor, end
 * a workout, or change a load. There is exactly ONE thing a partner can cause on this phone, and it
 * needs her finger: a swap she is asked about and accepts.
 *
 * The single exception is the GUEST'S START, and it is not an exception to the rule above — the
 * partner does not start his workout; the plan he published sits on screen and the guest presses
 * Begin. `beginAsGuest` runs through `sessionStore.start`, which means it passes the paywall gate
 * and the one-session guard *where they cannot be routed around* — the exact door the founder's
 * "side door around the fourteen" audit closed in August.
 *
 * ── WHAT THE GUEST ACTUALLY ADOPTS ──────────────────────────────────────────────────────────────
 *
 * A SHAPE, never a prescription. `domain/planShare` wrote this law for a plan that travels as a
 * link — *"the receiver's own engine then seeds every load from their own body and corrects from
 * their first working set"* — and a live pair is the same promise at a shorter distance. The host
 * sends which lifts, in which order, for how many sets. The guest's `sessionTargets` (his engine,
 * his history, his band, his cold start where he has never met the lift) supplies every number.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { db } from '@/data/local/db';
import { loadWeekPlan } from '@/data/local/weekPlan';
import { coachWeek, queuedWorkout } from '@/domain/coachWeek';
import { exerciseById } from '@/data/exercises';
import { useApp } from '@/state/stores/appStore';
import { isTrainingGated } from '@/domain/entitlement';
import { useSession } from '@/state/stores/sessionStore';
import { track } from '@/platform/telemetry';
import { tg } from '@/i18n';
import { shareText } from '@/platform/share';
import {
  SHARED_PUBLISH_EVERY_MS,
  pairAvailable,
  pairConnect,
  pairJoin,
  pairLink,
  pairOpen,
  pairSignedIn,
  type SharedFailure,
  type SharedLink,
  type SharedRoom,
} from '@/platform/sharedClient';
import {
  acceptsFrame,
  sharedDoneAgainstPlan,
  sharedPlanFromSteps,
  sharedStanding,
  type SharedBar,
  type SharedPlan,
  type SharedPresence,
  type SharedProgress,
  type SharedRole,
  type SharedStanding,
} from '@/domain/sharedSession';
import type { ProgramDay, Slot } from '@/data/local/models';

/** Where the pairing has got to, in the words the sheet draws. */
export type PairStage =
  /** No room. The door says "train together". */
  | 'idle'
  /** A room is open and she is alone in it — the code is on screen. */
  | 'waiting'
  /** Both are in the room; nobody has started a workout yet. */
  | 'ready'
  /** The host has started and published; the guest may begin. */
  | 'planReady'
  /** A shared workout is running. */
  | 'live';

export interface PairView {
  /** Can a pair be formed in this build at all? (No URL → the door is never drawn.) */
  ready: boolean;
  /** Does this phone hold an identity session? `null` while the answer is still being read — the
   *  sheet holds its shape rather than flashing a sign-in door at somebody already signed in. */
  signedIn: boolean | null;
  stage: PairStage;
  link: SharedLink;
  code: string | null;
  role: SharedRole | null;
  /** His first name, once he has sent a frame. */
  partnerName: string | null;
  /** He has a socket in the room right now. */
  partnerHere: boolean;
  partnerPresence: SharedPresence | null;
  /** What is on his bar for his next set — absent when he keeps his loads to himself. */
  partnerBar: SharedBar | null;
  plan: SharedPlan | null;
  /** Where the two of them are. Null unless a shared workout is running. */
  standing: SharedStanding | null;
  /**
   * ⛔ THE PAIR IS ONLY ALLOWED TO SPEAK ABOUT THE LIFT SHE IS ACTUALLY STANDING AT.
   *
   * True when the pair's station and her own stage are the same exercise. When they are not — she
   * moved a lift later because the rack was busy, she is on a warm-up bridge, one of them has run
   * ahead — the shared strip goes quiet and says only where her partner is. One rule, and it covers
   * every way two workouts can drift apart, including the ones nobody has thought of yet.
   */
  atSameStation: boolean;
  /** A swap he has proposed and she has not answered. */
  swapAsk: { from: string; to: string } | null;
  /** Her answer to a swap SHE proposed, once it comes back. Cleared by the consumer. */
  swapAnswer: boolean | null;
  failure: SharedFailure | null;
  /** She has chosen to keep her loads to herself (see `domain/sharedSession`'s header on `bar`). */
  loadsPrivate: boolean;

  open: () => Promise<string | null>;
  join: (code: string, byLink?: boolean) => Promise<SharedFailure | null>;
  /**
   * ⛔ A LINK PUT HER IN THE ROOM AND NOTHING ON SCREEN SAID SO.
   *
   * `hush://pair?c=…` joins silently — correct, because joining is not a thing to interrupt her
   * for. But it leaves her on whatever screen she was on, in a room she cannot see. Home reads this
   * once and opens the sheet, which is the only place the room is legible.
   */
  joinedByLink: boolean;
  clearJoinedByLink: () => void;
  /** The front door, from here: native Sign in with Apple, then the room. Cancel changes nothing. */
  signIn: () => Promise<boolean>;
  /** Hand the code to somebody — the system share sheet, with a link and the code in one message. */
  invite: () => Promise<void>;
  leave: () => void;
  /** Remembered across workouts — see `OwnedPreferences.pairLoadsPrivate`. */
  setLoadsPrivate: (v: boolean) => void;
  /**
   * ⛔ WHOSE LIFTS THE WORKOUT RUNS ON — and it was decided all along by who opened the room.
   *
   * That is a real property of the architecture (the host owns the structure), and for an afternoon
   * it was also completely invisible: two people paired and neither screen said whose workout they
   * were about to do. Naming it costs a line; being able to change it costs this.
   *
   * True only while `canHandOverLead` is — before a plan exists. See the room's own note.
   */
  canHandOverLead: boolean;
  handOverLead: () => void;
  askSwap: (from: string, to: string) => void;
  answerSwap: (accept: boolean) => void;
  clearSwapAsk: () => void;
  clearSwapAnswer: () => void;
  /**
   * The guest adopts the host's shape and begins.
   *
   * ⛔ IT ANSWERS WITH A REASON, NOT A BOOLEAN. `false` was indistinguishable from a paywall, and
   * the sheet could only fall silent — an athlete pressing Begin with a spent trial watched nothing
   * happen at all, which is the "surprise toll" the founder closed on Home in August wearing a
   * worse disguise. `'gated'` sends her to the paywall the way every other door does.
   */
  beginAsGuest: () => Promise<'started' | 'gated' | 'refused'>;
}

const Ctx = createContext<PairView | null>(null);

/**
 * EXPORTED for the render harness, exactly as `SessionContext` is: §11.2 cannot be driven from a
 * test without a partner, and a partner is a second phone. Never consumed by the app — screens read
 * `usePair()`.
 */
export const PairContext = Ctx;

/**
 * The four words a partner's screen needs, projected from the one session machine.
 *
 * ⚠️ THE PHASE IS READ BEFORE THE PLAN, and the order is the whole of it. An empty plan means two
 * opposite things — *she has not started yet* and *she has finished and left the stage* — and the
 * first version answered `done` to both. So a partner standing in the lobby waiting to begin was
 * described to the other phone as finished.
 */
function presenceOf(phase: string, planLength: number): SharedPresence {
  if (phase === 'SESSION_SAVED' || phase === 'WELL_DONE') return 'done';
  if (phase === 'PAUSED') return 'paused';
  if (planLength === 0) return 'resting'; // in the room, not yet on a bar
  if (phase.startsWith('REST')) return 'resting';
  return 'lifting';
}

export function PairProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const session = useSession();

  const [stage, setStage] = useState<PairStage>('idle');
  const [link, setLink] = useState<SharedLink>('idle');
  const [code, setCode] = useState<string | null>(null);
  const [role, setRole] = useState<SharedRole | null>(null);
  const [plan, setPlan] = useState<SharedPlan | null>(null);
  const [peer, setPeer] = useState<SharedProgress | null>(null);
  const [partnerHere, setPartnerHere] = useState(false);
  const [swapAsk, setSwapAsk] = useState<{ from: string; to: string } | null>(null);
  const [swapAnswer, setSwapAnswer] = useState<boolean | null>(null);
  const [failure, setFailure] = useState<SharedFailure | null>(null);
  const [loadsPrivate, setLoadsPrivate] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [joinedByLink, setJoinedByLink] = useState(false);

  const room = useRef<SharedRoom | null>(null);
  /** Latest of everything the publisher reads, so the 20 s tick never closes over a stale render. */
  const latest = useRef({ plan, role, loadsPrivate });
  latest.current = { plan, role, loadsPrivate };

  const firstName = useMemo(
    () => (app.profile?.name ?? '').trim().split(/\s+/)[0]?.slice(0, 20) ?? '',
    [app.profile?.name],
  );
  const nameRef = useRef(firstName);
  nameRef.current = firstName;

  // ── what this phone says about itself ──────────────────────────────────────────────────────────

  const livePlan = session.livePlan;
  const loggedSets = session.loggedSets;
  const phase = session.phase;

  /**
   * ⛔ THE PLAN THE HOST PUBLISHES IS DERIVED FROM HER LIVE SESSION, NOT FROM HER WEEK.
   *
   * A workout can be swapped, reordered or cut before the first set — and what the pair must follow
   * is the thing she is ACTUALLY doing, which is the only artefact that knows about all of that.
   */
  const myPlanShape = useMemo(
    () => (livePlan.length > 0 ? sharedPlanFromSteps(livePlan) : null),
    [livePlan],
  );

  /**
   * What goes on the bar for her NEXT set — the hand-off number, and nothing more.
   *
   * ⛔ HER NEXT UNLOGGED WORKING STEP, IN HER OWN PLAN'S ORDER. Not "the pair's station": deriving
   * it from the standing would make this depend on her partner's last frame, and a value that
   * changes when HE speaks is a value that makes her phone answer him — two phones publishing at
   * each other at wire speed for the length of a workout.
   *
   * It is safe to be simple because the number CARRIES ITS SUBJECT (`SharedBar.exerciseId`) and the
   * reader refuses to draw it beside a different lift. Whenever the two of them are genuinely at
   * the same station this is that station's next set; whenever they are not, it is a number the far
   * screen quietly declines to print.
   *
   * A warm-up bridge is skipped (`exerciseSetIndex < 0`) — a ramp is hers, and it is not what her
   * partner is about to load.
   */
  const myBar = useCallback((): SharedBar | null => {
    if (loadsPrivate) return null;
    const next = livePlan.find(
      (st) =>
        st.exerciseSetIndex >= 0 &&
        !loggedSets.some((l) => l.exerciseId === st.exerciseId && l.setIndex === st.exerciseSetIndex),
    );
    const kg = next?.target?.recommendedWeight;
    const reps = next?.target?.recommendedReps;
    // A hold, a run, a bodyweight lift — nothing to put on a bar, so nothing is said about one.
    if (!next || kg == null || reps == null) return null;
    return { exerciseId: next.exerciseId, kg, reps };
  }, [livePlan, loggedSets, loadsPrivate]);

  /**
   * ⛔ IT PUBLISHES BEFORE THERE IS A PLAN, AND THAT IS THE LOBBY.
   *
   * The first version returned early with no plan, so neither phone learned the other's NAME until
   * a workout had started — and the lobby is precisely the screen that wants it. Both athletes read
   * "Somebody is in the room" at the exact moment they are asking each other whether it worked.
   *
   * With no plan the frame is `v: 0` and an empty vector, which is the truth: nobody has counted
   * anything against anything. `sharedStanding` is not consulted until a plan exists, so an empty
   * vector cannot be read as progress.
   */
  const publish = useCallback(() => {
    const r = room.current;
    if (!r) return;
    const against = latest.current.plan;
    const bar = myBar();
    r.publish({
      v: against?.v ?? 0,
      name: nameRef.current || '—',
      presence: presenceOf(phase, livePlan.length),
      done: against ? sharedDoneAgainstPlan(against, loggedSets) : [],
      at: Date.now(),
      ...(bar ? { bar } : {}),
    });
  }, [myBar, phase, livePlan.length, loggedSets]);

  // Publish on every change that could move the count, and on a steady tick besides — the tick is
  // also what proves this phone is still on the air (see `sharedClient`'s header).
  useEffect(() => {
    publish();
    const id = setInterval(publish, SHARED_PUBLISH_EVERY_MS);
    return () => clearInterval(id);
  }, [publish]);

  /**
   * THE HOST PUBLISHES THE STRUCTURE THE MOMENT SHE HAS ONE, AND AGAIN WHENEVER IT MOVES.
   *
   * `v` rises on every change so a late frame can never un-swap a lift the pair has walked past
   * (the room refuses a plan whose version did not advance).
   */
  useEffect(() => {
    if (role !== 'host' || !myPlanShape) return;
    setPlan((prev) => {
      const same =
        prev &&
        prev.lifts.length === myPlanShape.lifts.length &&
        prev.lifts.every((l, i) => l.exerciseId === myPlanShape.lifts[i].exerciseId && l.sets === myPlanShape.lifts[i].sets);
      return same ? prev : { v: (prev?.v ?? 0) + 1, lifts: myPlanShape.lifts };
    });
  }, [role, myPlanShape]);

  /*
   * ⚠️ THE SEND IS ITS OWN EFFECT, NOT A LINE INSIDE THE UPDATER ABOVE. A state updater must be
   * pure: React is allowed to call it twice for one update, and a socket write is not something to
   * do twice by accident. (It happens to be harmless here — the room refuses a plan whose version
   * did not advance — but "harmless because the far end catches it" is not where a rule belongs.)
   */
  useEffect(() => {
    if (role !== 'host' || !plan) return;
    room.current?.publishPlan(plan);
  }, [role, plan]);

  // ── the stage the sheet draws ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!code) return void setStage('idle');
    if (livePlan.length > 0 && plan) return void setStage('live');
    if (role === 'guest' && plan) return void setStage('planReady');
    if (partnerHere) return void setStage('ready');
    setStage('waiting');
  }, [code, partnerHere, plan, role, livePlan.length]);

  // ── what the two of them are doing ────────────────────────────────────────────────────────────

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (stage !== 'live') return;
    // One second is the resolution a turn is read at; nothing here animates.
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [stage]);

  const standing = useMemo(() => {
    if (!plan || !role || livePlan.length === 0) return null;
    return sharedStanding({
      plan,
      role,
      mine: {
        v: plan.v,
        name: nameRef.current || '—',
        presence: presenceOf(phase, livePlan.length),
        done: sharedDoneAgainstPlan(plan, loggedSets),
        at: nowMs,
      },
      theirs: peer,
      nowMs,
    });
  }, [plan, role, livePlan.length, loggedSets, peer, phase, nowMs]);

  // ── the wire ──────────────────────────────────────────────────────────────────────────────────

  const connect = useCallback((theCode: string, ticket: string) => {
    room.current?.close();
    room.current = pairConnect(theCode, ticket, {
      onRole: (r) => setRole(r),
      onPlan: (p) => setPlan((prev) => (prev && prev.v >= p.v ? prev : p)),
      onPeer: (p) => {
        // ⛔ ONE ORDERING RULE, IN ONE PLACE. This held a hand-rolled copy of `acceptsFrame` for an
        // afternoon, and a second copy of a rule is a rule with two futures.
        setPeer((prev) => (acceptsFrame(prev, p) ? p : prev));
        setPartnerHere(true);
      },
      onPartner: (state) => setPartnerHere(state === 'joined'),
      onSwapAsk: (from, to) => setSwapAsk({ from, to }),
      onSwapAnswer: (accept) => setSwapAnswer(accept),
      onLink: setLink,
      onFailure: (why) => {
        setFailure(why);
        void track('pair_failed', { why });
      },
    });
  }, []);

  const leave = useCallback(() => {
    room.current?.close();
    room.current = null;
    setCode(null);
    setRole(null);
    setPlan(null);
    setPeer(null);
    setPartnerHere(false);
    setSwapAsk(null);
    setSwapAnswer(null);
    setFailure(null);
    setJoinedByLink(false);
    setLink('idle');
    setStage('idle');
  }, []);

  /*
   * Her standing answer about the number on her bar, read once and written on every change. Both
   * best-effort: a storage failure must never stand between two people and a workout, and the
   * default it falls back to is the one the design argued for.
   */
  useEffect(() => {
    let alive = true;
    void db.loadPreferences()
      .then((p) => alive && setLoadsPrivate(!!p.pairLoadsPrivate))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const rememberLoadsPrivate = useCallback((v: boolean) => {
    setLoadsPrivate(v);
    void db.loadPreferences()
      .then((p) => db.savePreferences({ ...p, pairLoadsPrivate: v }))
      .catch(() => {});
  }, []);

  // Read once on mount, and again whenever she comes back — a sign-in can happen elsewhere.
  useEffect(() => {
    let alive = true;
    const read = () => void pairSignedIn().then((v) => alive && setSignedIn(v)).catch(() => {});
    read();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && read());
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  // A socket that survived a spell in the background is often a ghost — see `poke`.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') room.current?.poke();
    });
    return () => sub.remove();
  }, []);

  // Leaving the app for good takes the room with it. (A workout does not need one to finish.)
  useEffect(() => () => room.current?.close(), []);

  /**
   * ⛔ THE PAIR ENDS WITH THE WORKOUT, AND NOT ONE MOMENT LATER.
   *
   * Both athletes finishing leaves two sockets open against a room that has nothing left to relay,
   * and — worse — leaves a live-looking pair on a phone whose owner has gone home. The workout's
   * end is the pair's end; the record of it lives on `Session.partners`, which was stamped at the
   * start and needs nothing from the wire.
   */
  useEffect(() => {
    if (stage !== 'live') return;
    if (phase === 'WELL_DONE' || (livePlan.length === 0 && plan != null)) leave();
  }, [stage, phase, livePlan.length, plan, leave]);

  // ── the doors ─────────────────────────────────────────────────────────────────────────────────

  const open = useCallback(async (): Promise<string | null> => {
    setFailure(null);
    const got = await pairOpen();
    if (typeof got === 'string') {
      setFailure(got);
      if (got === 'signed_out') setSignedIn(false);
      return null;
    }
    setCode(got.code);
    setRole('host');
    connect(got.code, got.ticket);
    return got.code;
  }, [connect]);

  /**
   * ⛔ SIGNING IN IS A DOOR, NOT AN ERROR MESSAGE.
   *
   * The pair needs an identity for the same reason the circle does — two phones have to know each
   * other — and an athlete who has the app but has never signed in used to be told her brother's
   * perfectly good code opened no room. `signIn` is the same native sheet the front door uses, and
   * a cancel leaves her exactly where she stood (`platform/auth` throws `SignInCanceledError`).
   */
  const signIn = useCallback(async (): Promise<boolean> => {
    try {
      await app.signIn('apple');
    } catch {
      return false; // cancelled, or the sheet is not available on this binary
    }
    /* `circleExchange` is fire-and-forget inside `signIn` (it never blocks a front door), so the
       session token may land a moment after this resolves. Read the answer rather than assume it. */
    const ok = await pairSignedIn();
    setSignedIn(ok);
    if (ok) setFailure(null);
    return ok;
  }, [app]);

  const invite = useCallback(async (): Promise<void> => {
    if (!code) return;
    await shareText(tg('pair.inviteMessage', { link: pairLink(code), code })).catch(() => 'error' as const);
    void track('pair_invited');
  }, [code]);

  const join = useCallback(
    async (raw: string, byLink = false): Promise<SharedFailure | null> => {
      setFailure(null);
      const trimmed = raw.toUpperCase().trim();
      const got = await pairJoin(trimmed);
      if (typeof got === 'string') {
        setFailure(got);
        if (got === 'signed_out') setSignedIn(false);
        return got;
      }
      setCode(trimmed);
      setRole('guest');
      setJoinedByLink(byLink);
      connect(trimmed, got.ticket);
      return null;
    },
    [connect],
  );

  /**
   * ════ THE GUEST BEGINS — the host's shape, his own everything else ════
   *
   * ⚠️ `sessionTargets` IGNORES THE DAY ID AND ANSWERS FOR THE WHOLE CATALOGUE (`fixtureModel`:
   * *"targets are keyed by exercise; the screen picks the day's slots"*). That is what makes this
   * possible without inventing a pricing path: the host can name any lift in the catalogue and the
   * guest's own engine already has a number for it — his learned load where he has trained it, his
   * cold start from his sex and bodyweight where he never has.
   *
   * ⛔ AND THE DAY ID IS HIS OWN WORKOUT'S WHEN HE HAS ONE TODAY. That is what makes the founder's
   * ruling ("נספר מלא, מנוע כולל") true all the way through: the engine folds every set either way,
   * but the WEEK only ticks for a day the week knows about. When his week has nothing queued the
   * session still counts and still folds — it simply marks nothing, because there is nothing of his
   * to mark, and inventing a mapping between two different programmes to tick a box would be a lie
   * about which workout he did.
   */
  const beginAsGuest = useCallback(async (): Promise<'started' | 'gated' | 'refused'> => {
    const shape = plan;
    if (!shape || role !== 'guest' || livePlan.length > 0) return 'refused';

    /*
     * ⛔ THE GATE, ASKED HERE SO IT CAN BE ANSWERED IN WORDS.
     *
     * `sessionStore.start` refuses a gated start on its own and always will — that is the doorway,
     * and it is the reason a side door cannot exist. But a doorway that refuses in silence leaves
     * the athlete pressing a button that does nothing. So the same question is asked one step
     * earlier, purely so the sheet can send her to the paywall instead of nowhere.
     */
    if (isTrainingGated(app.modeState.completedSessions, app.entitlement.active, app.profile?.memberSince)) return 'gated';

    const lifts = shape.lifts.filter((l) => exerciseById(l.exerciseId));
    if (lifts.length === 0) return 'refused'; // lifts this build does not know are not startable

    const targets = await app.model
      .sessionTargets({ programDayId: '', completedSessions: app.modeState.completedSessions })
      .catch(() => []);
    if (targets.length === 0) return 'refused';

    /*
     * HIS OWN WORKOUT FOR TODAY, found exactly the way Home finds it — one door onto the week
     * (`loadWeekPlan`), the same `queuedWorkout` rule, the same "trained since the week opened"
     * definition of done. Replicated rather than imported because Home holds it in screen state;
     * a second RULE would be a drift, a second READ of the same rule is not.
     */
    const mineToday = await (async (): Promise<string | null> => {
      try {
        const week = await loadWeekPlan();
        const workouts = coachWeek(week);
        if (workouts.length === 0) return null;
        const since = (await db.loadWeekOpen().catch(() => null)) ?? 0;
        const history = await db.loadHistory().catch(() => []);
        const doneIds = history
          .filter((h) => Date.parse(h.startedAt) >= since && h.trained !== false)
          .map((h) => h.programDayId);
        return queuedWorkout(workouts, doneIds)?.id ?? null;
      } catch {
        return null; // his week is unreadable — the session still counts and still folds
      }
    })();

    const slots: Slot[] = lifts.map((l) => ({
      capability: exerciseById(l.exerciseId)!.capability,
      exerciseId: l.exerciseId,
      setCount: l.sets,
    }));
    const day: ProgramDay = {
      id: mineToday ?? `shared_${code ?? 'room'}`,
      // What History will call it. The host's own name for his workout never travels (it is not on
      // the allow-list and it does not need to be) — what this session IS, is the one they did
      // together, and that is what it says.
      /*
       * ⛔ WHAT HISTORY CALLS IT — one word, and the same one every time.
       *
       * It used to be "Dana + Erez", which read fine and was asymmetric: the HOST's record kept her
       * own workout's name ("Upper A"), so one shared hour appeared in two histories under two
       * different kinds of name. And the concatenation restated a fact the record already holds —
       * `partners` is stamped on both sides now, and the poster and the story card read it from
       * there. So the name says what the session WAS, and who it was with stays where it belongs.
       */
      name: tg('pair.recordName'),
      muscleGroups: [],
      isRest: false,
      slots,
    };

    await session.start(day, targets, peer?.name ? [peer.name] : undefined);
    void track('pair_guest_started', { lifts: lifts.length });
    return 'started';
  }, [
    plan, role, livePlan.length, app.model, app.modeState.completedSessions,
    app.entitlement.active, code, peer?.name, session,
  ]);

  const value = useMemo<PairView>(
    () => ({
      ready: pairAvailable(),
      signedIn,
      stage,
      link,
      code,
      role,
      partnerName: peer?.name ?? null,
      partnerHere,
      partnerPresence: peer?.presence ?? null,
      partnerBar: peer?.bar ?? null,
      plan,
      standing,
      /*
       * ⛔ CURRENT **OR NEXT**, and the second half is the transition rest.
       *
       * On a crossing the cursor has not moved yet: `currentExerciseId` is still the lift she has
       * just finished while the pair has already arrived at the next station. Comparing against the
       * current lift alone made the strip fall silent on the ONE rest where "who is up, and at what
       * weight" is the entire content of the screen — she is walking to a bench and deciding what to
       * load. `nextExerciseId` is non-null only while resting (`SessionView`), so during a live set
       * this reads exactly as it did before.
       */
      atSameStation:
        standing != null &&
        standing.exerciseId != null &&
        (standing.exerciseId === session.currentExerciseId || standing.exerciseId === session.nextExerciseId),
      swapAsk,
      swapAnswer,
      failure,
      loadsPrivate,
      open,
      join,
      signIn,
      invite,
      joinedByLink,
      clearJoinedByLink: () => setJoinedByLink(false),
      leave,
      setLoadsPrivate: rememberLoadsPrivate,
      canHandOverLead: stage === 'ready' && plan == null,
      handOverLead: () => room.current?.handOverLead(),
      askSwap: (from, to) => room.current?.askSwap(from, to),
      answerSwap: (accept) => {
        room.current?.answerSwap(accept);
        setSwapAsk(null); // answered — the question is spent, whichever way it went
      },
      clearSwapAsk: () => setSwapAsk(null),
      clearSwapAnswer: () => setSwapAnswer(null),
      beginAsGuest,
    }),
    [
      stage, link, code, role, peer, partnerHere, plan, standing, signedIn,
      session.currentExerciseId, session.nextExerciseId,
      swapAsk, swapAnswer, failure, loadsPrivate, joinedByLink,
      open, join, signIn, invite, leave, beginAsGuest, rememberLoadsPrivate,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The pair, wherever it is read.
 *
 * ⚠️ SAFE OUTSIDE THE PROVIDER, and deliberately: the gallery mounts single screens with fixtures,
 * and a shared stage that threw there would be a screen nobody could review. Absent provider = no
 * pair, which is the same state as a build with no URL and the same state as training alone.
 */
export function usePair(): PairView {
  return useContext(Ctx) ?? SOLO;
}

/** Training alone — every field in its resting state. One object, so its identity is stable. */
const SOLO: PairView = {
  ready: false,
  signedIn: null,
  stage: 'idle',
  link: 'idle',
  code: null,
  role: null,
  partnerName: null,
  partnerHere: false,
  partnerPresence: null,
  partnerBar: null,
  plan: null,
  standing: null,
  atSameStation: false,
  swapAsk: null,
  swapAnswer: null,
  failure: null,
  loadsPrivate: false,
  open: async () => null,
  join: async () => 'unavailable',
  signIn: async () => false,
  invite: async () => {},
  joinedByLink: false,
  clearJoinedByLink: () => {},
  leave: () => {},
  setLoadsPrivate: () => {},
  canHandOverLead: false,
  handOverLead: () => {},
  askSwap: () => {},
  answerSwap: () => {},
  clearSwapAsk: () => {},
  clearSwapAnswer: () => {},
  beginAsGuest: async () => 'refused',
};
