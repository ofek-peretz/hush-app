/**
 * Workout Complete (§4.18) — rebuilt 1:1 to the Claude Design Complete
 * (ui_kits/app/Complete.jsx). A three-beat closing on the inverted stage:
 *   1) SESSION SAVED · "{workout} complete."
 *   2) Hush READS the session — each lift checks in (the work becomes evidence)
 *   3) WHAT THIS SESSION EARNED (v7 2.5) — "{workout} · SAVED", "That's the work.", the three
 *      measured facts it cost (minutes · kcal · tonnes moved), and then the LEDGER: one ruled line
 *      per lift the engine moved, its load's from→to on the end edge and the sentence that earned
 *      it beneath, in the coach's italic serif. No confetti, no daily-streak pressure.
 *
 *      The TOP SET card and the two big stat figures are gone. They were the old mock's answer to
 *      "what happened?", and they answered it with facts the athlete already knew — she had just
 *      lifted that set. What she cannot know is what the engine DECIDED because of it, which is the
 *      one thing this screen exists to say. An empty ledger is still an answer: every lift held at
 *      what she lifted (S-24), stated in a line rather than left as a blank.
 *
 *      ════ REBUILT 2026-07-17 — this beat used to lie ════
 *      It closed with a calendar icon and "What you lifted this week sets next week's
 *      loads", and its own header said "a single workout never builds next week's
 *      program; that ritual is the weekly update." That was v4's rule. **v5 reverses
 *      it**: the decision is made the moment the workout ENDS (register L7 — there is
 *      no weekly boundary), and the brief calls this screen "the important one" for
 *      exactly that reason.
 *
 *      The screen was not being lazy — the DECISION did not exist yet when it rendered.
 *      The engine's fold was only triggered by `sessionTargets`, i.e. when the athlete
 *      opened the NEXT workout, so at the whistle there was genuinely nothing true to
 *      show and Saturday was the only honest thing left to point at. So the fold moved
 *      to the whistle (`ModelClient.sessionEarned` → `foldEngine` → `getSessionEarnedV5`)
 *      and this beat now says what the session bought, in Hush's own first person, with
 *      the reason attached to the number.
 *
 *      Saturday keeps its job — it MIRRORS a week of decisions already told, and decides
 *      nothing (S-45). It just no longer borrows this moment.
 *   4) MILESTONE — only when this session crossed one (domain/milestones): the
 *      one licensed loud moment. A beat of black, a heavy stamp haptic, and the
 *      engraved emblem lands. At most ONE per workout (rarity law) — when
 *      several cross, the most personal is celebrated and the rest surface
 *      quietly in the Progress gallery.
 *
 * The session is already SAVED (invariant §8.4); stats are read from it. The
 * success haptic fires once.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Button, Legend } from '@/components/ds';
import { RangeMark } from '@/components/RangeMark';
import { sessionPoster } from '@/domain/sessionPoster';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { monoCanDraw } from '@/design/monoVoice';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { coachIsDeciding, onCoachUpdate, type CoachUpdate } from '@/platform/coach/afterSession';
import { coachVerdict } from '@/domain/coachEarned';
import type { CoachDecision } from '@/domain/coachLog';
import { NotificationAsk } from '@/screens/onboarding/NotificationAsk';
import { ensureNotificationPermission, markNotificationsAsked, shouldAskForNotifications } from '@/platform/notifications';
import { wellDone as wellDoneHaptic, tick as tickHaptic } from '@/platform/haptics';
import { useReducedMotion } from '@/platform/reducedMotion';
import { useFocusedStatusBar } from '@/platform/statusBar';
import { exerciseDisplayName } from '@/data/exercises';
import { displayWeight } from '@/domain/schedule';
import { newlyEarned } from '@/domain/milestones';
import { milestoneCopy } from '@/domain/milestoneCopy';
import { sessionKcal } from '@/domain/energy';
import { durationMinutes } from '@/domain/duration';
import { milestone as milestoneHaptic } from '@/platform/haptics';
import { MilestoneEmblem } from '@/components/MilestoneEmblem';
import type { Session, SetLog } from '@/data/local/models';
import type { Explanation } from '@/engine/weeklyView';
import { space, stage, signal, font, textScale, tracking, trackingPx, up, down } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<MainParamList, 'WellDone'>;

/** The beats of this screen, in the only order they may be walked. */
export type WellDonePhase = 'saved' | 'result' | 'milestone';

/**
 * The saved beat's auto-advance, as a RULE rather than a wish.
 *
 * A timer that fires 3.4 s after mount knows nothing about where the athlete has got to in the
 * meantime, so it must never assert a phase — only carry the one it was scheduled for forward.
 * Anything past the saved beat is the athlete's own progress and is left exactly as it is.
 * (Founder 2026-07-12: the milestone stamp was being erased by this timer. See the call site.)
 */
export function advanceFromSaved(current: WellDonePhase): WellDonePhase {
  return current === 'saved' ? 'result' : current;
}

interface Lift {
  exerciseId: string;
  name: string;
}

/**
 * THE SCAN'S BREATH — the row being read now, pulsing 1.2s in and out.
 *
 * It is the only thing moving on the screen, and it is doing the same job the rest ring's breath
 * does: saying "still working" without a spinner, which would say "waiting". Off under Reduce Motion.
 */
function ScanPulse({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);
  return <Animated.View style={{ opacity: pulse }}>{children}</Animated.View>;
}

/** How many sets of one lift this session logged — the fact each scanned row states. */
function setsOf(exerciseId: string, session: Session | null): number {
  return (session?.sets ?? []).filter((s) => s.exerciseId === exerciseId).length;
}

/** Tonnes moved this session — Σ(weight × reps), in tonnes to one decimal. Bodyweight sets carry
 *  no declared load, so they add nothing rather than a guessed one. */
function sessionTonnes(sets: readonly SetLog[]): number {
  const kg = sets.reduce((sum, s) => sum + (s.actualWeight ?? 0) * s.actualReps, 0);
  return Math.round(kg / 100) / 10;
}

/**
 * LOOP 3'S DECISION — a muscle whose WEEKLY set target moved because of this workout.
 *
 * The handoff draws it on 2.5 ("Chest earned a set · 3 → 4") and the screen had no idea it existed.
 * Worse than absent: a volume entry comes back inside `sessionEarned` like any other change, keyed
 * by the MUSCLE rather than a lift, so `earnedLines` ran `exerciseDisplayName('Chest')` over it,
 * found no forward load, and drew it as a lift that HELD at nothing — "Chest · holds " with the
 * figure blank. The one decision on this screen that is about the shape of the week read as a
 * rendering fault.
 *
 * The figures are not on `Explanation` (it carries the narration, not the counts), so they are read
 * back off the stamped changeLog — the same log the Saturday mirror reads, through the same app-layer
 * door LiftDetail uses. Nothing is recomputed and nothing is asked of the engine: the fold has
 * already run by the time `earned` resolves, and this only reads what it wrote.
 */
export interface VolumeMove {
  muscle: string;
  setsFrom: number;
  setsTo: number;
  /**
   * WHY the week's shape changed — the engine's own sentence, joined from the same `sessionEarned`
   * narration that carries every other row's reason. The row shipped with the figures and NO
   * reason at all, which made it the one decision on the screen that would not say why (founder
   * 2026-07-29). Null only if the log and the narration ever disagree about what happened.
   */
  reason: { key: string; params?: Record<string, string | number> } | null;
}

/**
 * A reason, either said by the APP or said by the COACH.
 *
 * The engine narrated in i18n keys — it had to, being a machine assembling a sentence for two
 * languages. The coach writes the sentence itself, in her language, because it was asked to.
 * Translating its prose back into an enum would turn "your last two sessions ended short" into
 * `endedShort` and the reason she is owed into a category.
 */
export type EarnedReason =
  | { key: string; params?: Record<string, string | number> }
  | { text: string };

/** One line of "what this session earned": the lift, the load it moved from → to, and the
 *  sentence for why. */
export interface EarnedLine {
  key: string;
  name: string;
  from: string | null;
  to: string | null;
  /** Held at the load she lifted — no arrow, the word and the figure (S-24). */
  held: boolean;
  /**
   * ⛔ THE ROW HAS NO FIGURE COLUMN AT ALL — which is NOT the same as holding (2026-08-05).
   *
   * FOUNDER, from a screenshot of the finish screen: the verdict column read `Leg Extension ·
   * holds` directly above the coach's own sentence, *"Raised starting load to 50 kg after clearing
   * 17 and 13 reps."* The screen contradicted itself in two adjacent lines.
   *
   * Every coach row was built with `held: true`, and the comment justifying it was right about the
   * reason and wrong about the consequence: there is no from→to to draw because the coach states a
   * programme rather than a delta. But `held` does not mean "no arrow" to the RENDERER — it means
   * print the word "holds", which is a verdict, and it was being printed on lifts that moved.
   *
   * `silent` is the state that was missing: nothing in the figure column. The reason is the row.
   */
  silent?: boolean;
  reason: EarnedReason;
}

/**
 * Join the engine's narration to the figures the same occurrence stamped.
 *
 * `Explanation.slotId` names the slot; `sessionForward` is keyed by exerciseId. The overlap is what
 * can be drawn with a from→to; a decision with no forward entry HELD, which is a real verdict
 * (S-24) and is drawn as "holds N", never as an empty row.
 */
function earnedLines(
  earned: Explanation[] | null,
  forward: Record<string, { loadFrom: number | null; loadTo: number | null }> | null,
  units: 'kg' | 'lb',
): EarnedLine[] {
  if (!earned) return [];
  const fmt = (kg: number | null) => {
    if (kg == null) return null;
    const w = displayWeight(kg, units);
    return w == null ? null : String(+w.toFixed(2));
  };
  return earned.map((e) => {
    const moved = forward?.[e.slotId] ?? null;
    const from = fmt(moved?.loadFrom ?? null);
    const to = fmt(moved?.loadTo ?? null);
    return {
      key: e.slotId,
      name: exerciseDisplayName(e.slotId),
      from,
      to,
      held: to == null || to === from,
      reason: { key: e.text.key, params: e.text.params },
    };
  });
}

export function WellDone({ navigation, route }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  const summary = route.params?.summary;
  const notStarted = route.params?.notStarted ?? false;
  const early = summary?.earlyFinish ?? false;
  // Partial = ended early but real work was logged; Full = completed every set.
  const partial = !notStarted && early && (summary?.sets ?? 0) > 0;
  // …and a partial that didn't reach half the prescribed sets leaves the workout OPEN for the
  // week (domain/completion). `trained === false` says exactly that.
  const stillOpen = partial && summary?.trained === false;
  const reduced = useReducedMotion();

  const [history, setHistory] = useState<Session[] | null>(null);
  const [phase, setPhase] = useState<'saved' | 'result' | 'milestone'>(reduced ? 'result' : 'saved');
  const [read, setRead] = useState(0);
  const session = history?.[0] ?? null;

  useFocusedStatusBar('light'); // stage screen: light glyphs, restored to dark on blur

  /**
   * 8.2 · THE HONEST ASK. "Shown once, right after your first session — never at onboarding,
   * before value is felt." So it waits for a session that actually happened, asks ONCE ever, and
   * only opens the system dialog if she says yes. `null` while we are still finding out whether
   * this is the first; the screen simply does not draw until then.
   */
  const [askNotifications, setAskNotifications] = useState(false);
  useEffect(() => {
    if (notStarted) return;
    let active = true;
    void shouldAskForNotifications().then((yes) => active && setAskNotifications(yes));
    return () => {
      active = false;
    };
  }, [notStarted]);

  useEffect(() => {
    // Nothing was completed → no success moment, no history read.
    if (notStarted) return;
    let active = true;
    wellDoneHaptic();
    // Never let a storage hiccup leave the result data empty without recovering.
    db.loadHistory()
      .then((h) => active && setHistory(h))
      .catch(() => active && setHistory(null));
    return () => {
      active = false;
    };
  }, [notStarted]);

  /**
   * WHAT THE SESSION EARNED (v7 2.5) — the engine's decisions, each with the reason that earned it.
   *
   * `sessionEarned` narrates the loads this occurrence set for next time; `sessionForward` gives
   * the from→to figures the same decisions moved. Together they are the ruled list this screen
   * exists for. An EMPTY list is a real answer — every lift held (S-24) — and the screen says so
   * rather than papering over it with a card of stats.
   *
   * Read at the whistle, off the model seam. Both members are optional on that seam, so a client
   * without them simply yields nothing and the list does not draw.
   */
  const [earned, setEarned] = useState<Explanation[] | null>(null);
  const [forward, setForward] = useState<Record<string, { loadFrom: number | null; loadTo: number | null }> | null>(null);
  useEffect(() => {
    if (notStarted || !summary?.startedAtMs) return;
    let active = true;
    const startedAtMs = summary.startedAtMs;
    void Promise.resolve(app.model.sessionEarned?.({ startedAtMs }))
      .then((e) => active && setEarned(e ?? []))
      .catch(() => active && setEarned([]));
    void Promise.resolve(app.model.sessionForward?.({ startedAtMs }))
      .then((f) => active && setForward(f ?? {}))
      .catch(() => active && setForward({}));
    return () => {
      active = false;
    };
  }, [app.model, notStarted, summary?.startedAtMs]);

  /**
   * …and the volume moves the same occurrence stamped (see `VolumeMove`). Gated on `earned`, because
   * `sessionEarned` is what runs the fold — reading the log before it has been written would find
   * this workout's decisions missing and quietly draw nothing.
   */
  /*
   * ════ THE COACH'S VERDICT, WHICH MAY NOT HAVE ARRIVED YET ════
   *
   * `askAfterSession` was fired the moment the workout was saved and it takes about fifteen
   * seconds. This screen opens immediately, so it subscribes: `thinking` while the call is out,
   * then the sentence, or the honest "nothing changed" if it never landed.
   *
   * The engine used to answer in a millisecond and this screen could assume the answer existed by
   * the time it drew. Drawing an empty list in that gap would tell her the workout changed nothing —
   * which is a real verdict (a hold) and therefore the one thing silence must never look like.
   */
  const [coachUpdate, setCoachUpdate] = useState<CoachUpdate | null>(null);
  const [coachLog, setCoachLog] = useState<CoachDecision[]>([]);
  const [deciding, setDeciding] = useState(() => coachIsDeciding());
  useEffect(() => {
    let active = true;
    const read = () =>
      void Promise.all([db.loadCoachUpdate(), db.loadCoachLog()]).then(([u, l]) => {
        if (!active) return;
        setCoachUpdate(u);
        setCoachLog(l);
        setDeciding(coachIsDeciding());
      });
    read(); // it may already have landed before this screen mounted
    const off = onCoachUpdate(() => read());
    return () => {
      active = false;
      off();
    };
  }, []);

  /*
   * ⛔ THE VOLUME ROWS WERE HERE, and they went with Loop 3.
   *
   * They read the engine's changeLog for entries stamped `kind: 'volume'` — a muscle earning or
   * losing a set — and nothing writes that log any more. There is no volume DECISION either: the
   * coach writes the whole programme, so a set count changing is not a separate kind of news with
   * its own row shape. It is part of the week it wrote, and its reason is the sentence it attached.
   *
   * Kept as an empty list rather than pulled out of the view, because the view's shape is the
   * founder's and he is redesigning it — a prop deleted today is a prop argued about twice.
   */
  const volume: VolumeMove[] = [];

  // Milestones crossed by THIS session (the latest in history), most personal
  // first. [0] is the single celebrated mark; the rest go quietly to the gallery.
  const celebration = useMemo(
    () => (history ? newlyEarned(history, app.profile)[0] ?? null : null),
    [history, app.profile],
  );
  const celebrated = useRef(false);
  const pendingExit = useRef<(() => void) | null>(null);
  /** An exit the athlete asked for before the history had been read (see `leave`). */
  const pendingLeave = useRef<(() => void) | null>(null);

  // The stamp: a beat of black, the heavy plate-lock haptic, and the emblem lands.
  const stamp = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (phase !== 'milestone') return;
    if (reduced) {
      stamp.setValue(1);
      milestoneHaptic();
      return;
    }
    stamp.setValue(0);
    const timer = setTimeout(() => {
      milestoneHaptic();
      Animated.spring(stamp, { toValue: 1, damping: 14, stiffness: 220, useNativeDriver: true }).start();
    }, 650);
    return () => clearTimeout(timer);
  }, [phase, reduced, stamp]);

  /**
   * The session's lifts, in the order they were performed — the list THE SCAN reads down (2.4c).
   *
   * It is just the distinct exercises, first-seen order. The per-lift "best set" and the session's
   * cross-lift top set went with the card that showed them: v7's closing beats state what the
   * ENGINE decided, not a highlight the athlete already lived through.
   */
  /**
   * EVERY HOOK LIVES ABOVE EVERY EARLY RETURN.
   *
   * This screen has four exits (not started · milestone · the scan · the ask) and React counts
   * hooks per render: a `useMemo` sitting BELOW an exit is skipped on the renders that take it, and
   * the first render that falls through instead throws "Rendered more hooks than during the
   * previous render". That is exactly what 2.5 was doing the moment the scan handed over to the
   * result. Nothing below the first `if` may call a hook.
   */
  /** The three facts the session cost, on one mono line: minutes · kcal · tonnes moved. */
  const tonnes = useMemo(() => sessionTonnes(session?.sets ?? []), [session]);
  /**
   * The LIFT decisions, joined to the from→to figures the same occurrence stamped.
   *
   * A volume move is narrated in the same list but is not a lift, and it is keyed by its muscle —
   * so it is lifted out here and drawn as its own row below. Left in, it became a lift with no
   * forward load, i.e. a hold with a blank number.
   */
  const volumeMuscles = useMemo(() => new Set(volume.map((v) => v.muscle)), [volume]);
  const decisions = useMemo(
    () => earnedLines(earned && earned.filter((e) => !volumeMuscles.has(e.slotId)), forward, units),
    [earned, forward, units, volumeMuscles],
  );

  /**
   * WHAT THE COACH DECIDED, as rows this screen already knows how to draw.
   *
   * No from→to figures: the coach states the next programme whole rather than a set of deltas, so
   * there is no "moved from" to print. `held` is true on every row for the same reason — the arrow
   * exists to show a direction, and there is no direction in a sentence. The number she wants is on
   * Today, next to the lift; what belongs here is the reason.
   */
  const coachDecided = useMemo(
    () => coachVerdict(session?.id ?? '', coachUpdate, coachLog, deciding),
    [session?.id, coachUpdate, coachLog, deciding],
  );
  const coachLines = useMemo<EarnedLine[]>(
    () =>
      coachDecided.state === 'decided'
        ? coachDecided.lines.map((l, i) => ({
            key: l.ex ?? `note_${i}`,
            name: l.ex ? exerciseDisplayName(l.ex) : '',
            from: null,
            to: null,
            held: false,
            // ⛔ SILENT, NOT HELD — see `EarnedLine.silent`. This said `held: true` and printed the
            // word "holds" over sentences that said "Raised".
            silent: true,
            reason: { text: l.say },
          }))
        : [],
    [coachDecided],
  );

  const lifts = useMemo(() => {
    const seen = new Set<string>();
    const order: Lift[] = [];
    for (const s of session?.sets ?? []) {
      if (seen.has(s.exerciseId)) continue;
      seen.add(s.exerciseId);
      order.push({ exerciseId: s.exerciseId, name: exerciseDisplayName(s.exerciseId) });
    }
    return order;
  }, [session]);

  // Beat 2 → 3: advance to the result on a fixed ceiling, INDEPENDENT of whether the session
  // loads — so a storage failure can never trap the athlete on the (button-less) "saved" beat
  // after a workout. The result beat reads `session` reactively, so it fills in if the data
  // arrives late (or stays a graceful fallback if it never does).
  //
  // IT ONLY EVER ADVANCES (founder 2026-07-12 — "when several milestones land at once the
  // screen shows none of them and pops out"). This timer used to call setPhase('result') flat,
  // with no idea what phase it was in by the time it fired. An athlete who tapped through the
  // saved beat and pressed Done within 3.4 s — which is what anyone does when they are eager to
  // see what they just earned — would land on the milestone stamp, and then this stale timer
  // would fire and THROW THEM BACK to the result. Because the stamp holds a beat of black before
  // the emblem lands, the whole mark could come and go without ever being seen. Nothing to do
  // with how MANY milestones landed; everything to do with how fast the athlete moved. A phase
  // is a one-way street now: this can carry the saved beat forward and cannot touch anything else.
  useEffect(() => {
    if (reduced) return; // reduced-motion starts on 'result' already
    const t = setTimeout(() => setPhase((p) => advanceFromSaved(p)), 3400);
    return () => clearTimeout(t);
  }, [reduced]);

  // The "reading" checks fill in as the session's lifts resolve. Each check that lands taps the
  // wrist: the copy says the session is being READ, and a tick per lift is what makes that felt
  // rather than claimed — the machine chewing through the evidence, felt with the phone in a pocket.
  //
  // GATED ON THE BEAT IT BELONGS TO. These timers used to be scheduled once and left to run, so
  // an athlete who tapped to skip — or who moved fast enough to reach the milestone stamp — kept
  // getting tapped on the wrist by a beat that was no longer on screen, right through the one
  // moment in the app that is supposed to be silent before it lands. Same family of fault as the
  // stale phase timer above: a timer that outlives its beat. The dependency on `phase` means the
  // cleanup cancels every pending tick the instant the beat is over.
  useEffect(() => {
    if (reduced || lifts.length === 0) return;
    if (phase !== 'saved') return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const STEP = 260;
    const START = 500;
    for (let i = 1; i <= lifts.length; i++) {
      timers.push(
        setTimeout(() => {
          setRead(i);
          tickHaptic();
        }, START + i * STEP),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [reduced, lifts.length, phase]);

  function skip() {
    setRead(lifts.length);
    setPhase('result');
  }
  // The stack root is the TAB host now, not 'Home'. Reset to it, and for the record view land the
  // host on its History tab (nested initial route) so "View record" opens the timeline directly.
  function goHome() {
    app.clearPortraitFlag();
    navigation.reset({ index: 0, routes: [{ name: 'HomeTabs' }] });
  }
  function goRecord() {
    /*
     * ⛔ THIS LANDED HER ON TODAY (founder 2026-08-03): *"when you press finish workout and then
     * 'view the workout record', it throws you straight to the TODAY screen."*
     *
     * It reset `HomeTabs` to an inner route named `History` — and **History is not a tab.** The tab
     * navigator holds Today · Cardio · Progress · You; History is a screen on the MAIN stack. React
     * Navigation cannot find the route inside the navigator it was handed, so it silently falls back
     * to the first tab. No error, no warning: the one control on the closing screen that promises to
     * show her what she just did took her to the screen that shows what she does NEXT.
     *
     * Two entries in the stack instead: the tabs underneath, History on top — so the back gesture
     * lands on Today, which is where a workout ends.
     */
    app.clearPortraitFlag();
    navigation.reset({ index: 1, routes: [{ name: 'HomeTabs' }, { name: 'History' }] as never });
  }
  /**
   * Any exit from the result passes through the milestone beat exactly once.
   *
   * AND IT WAITS FOR THE EVIDENCE. `celebration` is derived from the history, which is read from
   * disk after mount — so an athlete who taps through the saved beat and presses Done before that
   * read lands would find `celebration` still null, walk straight out, and NEVER see the mark they
   * had just earned: a milestone is celebrated on the session that crossed it and on no other. The
   * window is small and the loss is total, which is the worst shape a bug can have. So an exit
   * requested before the history is in is QUEUED, and runs the moment it arrives — through this
   * same function, with the answer known. The athlete perceives nothing; the read is milliseconds.
   */
  function leave(exit: () => void) {
    if (history === null && !notStarted) {
      pendingLeave.current = exit;
      return;
    }
    if (celebration && !celebrated.current) {
      celebrated.current = true;
      pendingExit.current = exit;
      setPhase('milestone');
      return;
    }
    exit();
  }

  // The history landed — run the exit the athlete already asked for, now that we can answer the
  // only question it was waiting on: did this session cross a mark?
  useEffect(() => {
    if (history === null) return;
    const queued = pendingLeave.current;
    if (!queued) return;
    pendingLeave.current = null;
    if (celebration && !celebrated.current) {
      celebrated.current = true;
      pendingExit.current = queued;
      setPhase('milestone');
      return;
    }
    queued();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, celebration]);


  /* ---- Not started (item 3A): nothing was completed — not a workout, nothing saved ---- */
  if (notStarted) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.notStartedBody}>
            <View style={styles.savedRow}>
              <Icon name="minus" size={18} color={stage.ink2} strokeWidth={2.4} />
              <Text style={styles.notStartedLegend}>{t('complete.notStartedLegend')}</Text>
            </View>
            <Text style={styles.savedTitle} accessibilityRole="header">{t('complete.notStartedTitle')}</Text>
            <Text style={styles.copy}>{t('complete.notStartedBody')}</Text>
          </View>
          <View style={styles.footer}>
            <Button variant="onstage" size="lg" block label={t('complete.done')} onPress={goHome} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  /* ---- Beat 4: a milestone landed — the one licensed loud moment ---- */
  if (phase === 'milestone' && celebration) {
    const mc = milestoneCopy(celebration, t, units);
    const dateLabel = new Date(celebration.earnedAt).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.milestoneBody}>
            <Animated.View
              style={{
                alignItems: 'center',
                opacity: stamp,
                transform: [{ scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) }],
              }}
            >
              <Legend size={12} track={0.24} align="center" tone="onStage">{t('milestones.legend')}</Legend>
              <View style={styles.milestoneEmblem}>
                {/* the one licensed loud moment — the seal gives off heat here, and nowhere else
                    in the app (founder 2026-07-12) */}
                <MilestoneEmblem size={216} onStage pulse value={mc.value} caption={mc.caption} glyph={mc.glyph} />
              </View>
              <View style={styles.milestoneWords}>
                <Text style={styles.milestoneTitle} accessibilityRole="header">{mc.title}</Text>
                {mc.sub ? <Text style={styles.milestoneSub}>{mc.sub}</Text> : null}
                {/* MEASURED · 17 JULY 2026 — the mark is a record, and a record is dated. */}
                <Legend size={13.5} track={0} weight="regular" align="center" tone="onStage">
                  {`${t('milestones.measured')} · ${dateLabel}`}
                </Legend>
              </View>
            </Animated.View>
          </View>
          <View style={styles.footer}>
            <Button
              variant="onstage"
              size="act"
              block
              label={t('milestones.continue')}
              onPress={() => (pendingExit.current ?? goHome)()}
            />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  /* ---- Beat 1+2 · THE SCAN (v7 2.4c) ----
     One beat, not two. It used to be "SAVED · Upper A complete." and then, underneath, a checklist
     ticking itself off — the same moment announced twice, the second half explaining the first.
     v7 keeps only the WORK: Hush reading the session, lift by lift, and saying what it is doing
     with it. "Saved" is not news; a decision being made from what you just lifted is. */
  if (phase !== 'result') {
    return <SessionScan lifts={lifts} read={read} setsOf={(id) => setsOf(id, session)} onSkip={skip} />;
  }

  /* ---- Beat 3 · WHAT THIS SESSION EARNED (v7 2.5) ----
     The whistle's own screen: what was saved, the three facts it cost, and then — ruled, one per
     line — every load the engine moved because of it, each under the sentence that earned it. */
  const durationMs = summary?.durationMs ?? 0;
  // Through the ONE door (domain/energy.sessionKcal): the estimate for a phone-run workout, the
  // wrist's measurement for one the watch executed standalone. Absent bodyweight ⇒ no number.
  const kcal = sessionKcal(session ?? {}, durationMs, app.profile?.weightKg);
  // The two record figures: DURATION and EST. CALORIES. Both are already-measured facts — wall-clock
  // ms on the summary, and the declared MET formula in `domain/energy`. Nothing here is an engine
  // SITUATION, so nothing here cites one: a code the register does not declare is a claim of
  // provenance the product cannot keep (the residue guard exists for exactly this).
  const durationLabel = String(durationMinutes(durationMs / 1000));
  // TOP SET card figures (IMG_8260): "34 kg × 8" — the heaviest working set, split so the numerals
  // stay mono/tabular and the unit word sits small beside them. A bodyweight top set has no weight
  // figure; it shows "× reps" alone rather than a fabricated load.

  /**
   * The saved legend names the WORKOUT — "UPPER A · SAVED" (v7 2.5). The single word "LOGGED" said
   * that something had been saved without ever saying what; the name is the fact, and it is the one
   * the athlete came out of the session holding.
   */
  const savedLegend = summary?.workoutName
    ? `${summary.workoutName} · ${t('complete.saved')}`
    : t('complete.logged');

  // 8.2 — the ask stands OVER the completion, once ever, and hands it back on either answer. It is
  // deliberately after this screen has been earned: the handoff asks for it "right after your first
  // session", never at onboarding, before value is felt.
  if (askNotifications) {
    return (
      <NotificationAsk
        onAllow={async () => {
          await markNotificationsAsked();
          await ensureNotificationPermission();
          setAskNotifications(false);
        }}
        onDecline={() => {
          // "Not now" spends nothing: the system prompt is untouched, and we never ask from here
          // again — iOS gives one, and burning it on someone who just declined loses it for good.
          void markNotificationsAsked();
          setAskNotifications(false);
        }}
      />
    );
  }

  return (
    <SessionEarned
      savedLegend={savedLegend}
      partial={partial}
      durationLabel={durationLabel}
      kcal={kcal}
      tonnes={tonnes}
      /*
       * ⛔ THE POSTER. `history` already carries the just-saved session at index 0, which is what
       * `recordCardFromHistory` reads to decide whether this workout set an all-time best — so the
       * record and the receipt come from the same read the rest of this screen uses.
       */
      poster={
        session && session.sets.length > 0
          ? sessionPoster({
              session,
              history: history ?? [],
              units: app.profile?.units ?? 'kg',
              durationMs,
              kcal,
            })
          : null
      }
      workoutName={summary?.workoutName ?? session?.programDayName ?? null}
      units={app.profile?.units ?? 'kg'}
      /*
       * The COACH's rows now, with the engine's kept behind them.
       *
       * `decisions` is what the between-session fold used to produce and it is empty for ever —
       * the fold is deleted. Kept in the expression rather than dropped so a legacy athlete whose
       * last fold ran before the deletion still sees the sentence she was already promised.
       */
      decisions={coachLines.length ? coachLines : decisions}
      volume={volume}
      /*
       * `answered` is what stops the screen drawing "nothing changed" over a decision that is still
       * in the post. `thinking` is the one state the old surface never had, because the engine
       * answered in a millisecond and this one takes fifteen seconds.
       */
      answered={coachDecided.state !== 'thinking' && earned !== null}
      onDone={() => leave(goHome)}
      onRecord={() => leave(goRecord)}
    />
  );
}

/**
 * 2.5 · WHAT THIS SESSION EARNED — the closing beat, on its own.
 *
 * Split from `WellDone` for the same reason `SessionScan` was (2.4c): inside a real completion this
 * beat is three seconds behind a timer, a history read and an engine fold, so a harness that mounted
 * the whole screen watched the SCAN and then a ledger with nothing in it — which is precisely what
 * the gallery was showing under the id "2.5". Takes only facts; renders exactly what WellDone rendered.
 */
export function SessionEarned({
  savedLegend,
  partial,
  durationLabel,
  kcal,
  tonnes,
  poster,
  workoutName,
  units,
  decisions,
  volume,
  answered,
  onDone,
  onRecord,
  previewSheetOpen,
}: {
  savedLegend: string;
  /** Ended early with real work logged — the closing sentence says so instead. */
  partial: boolean;
  durationLabel: string;
  kcal: number | null;
  tonnes: number;
  /**
   * ⛔ THE POSTER (founder 2026-08-04) — the facts this screen leads with, from `domain/sessionPoster`.
   *
   * ⚠️ NULLABLE, NOT OPTIONAL. There is no second layout to fall back to: the ledger-only screen it
   * replaced is deleted, and a `?` here would let a call site quietly render a workout's close as an
   * empty page. `null` means "no work logged", and the poster simply does not draw.
   */
  poster: import('@/domain/sessionPoster').SessionPoster | null;
  workoutName?: string | null;
  units?: 'kg' | 'lb';
  decisions: EarnedLine[];
  volume: VolumeMove[];
  /** The engine has answered. Only then is an empty ledger a verdict ("everything held") rather
   *  than a read still in flight, which must draw nothing at all. */
  answered: boolean;
  onDone: () => void;
  onRecord: () => void;
  /** Offered only when this session set a real record (§9.1) — there is no card for a session that
   *  set none, and a share button that had nothing true to put on one would be the fabrication the
   *  whole card module exists to refuse. */
  /**
   * ⚠️ GALLERY ONLY — opens "what changed" on mount so the harness can draw it.
   *
   * The gallery cannot press a button, and **a state nobody can produce is a state nobody looks
   * at** — which is precisely how the lift-done beat shipped as four dots on a black screen. Never
   * set in the app.
   */
  previewSheetOpen?: boolean;
}) {
  const { t } = useCopy();
  /** Whether "what changed" is open over the poster. Closed until she asks (founder 2026-08-05). */
  const [sheetOpen, setSheetOpen] = useState(previewSheetOpen ?? false);
  /** The word a held lift wears — read once so the face check below is done once. */
  const holdsWord = t('complete.holds');
  const nothingDecided = decisions.length === 0 && volume.length === 0;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.resultScroll} showsVerticalScrollIndicator={false}>
          {/*
            ════════════════════════════════════════════════════════════════════════════════════════
            ⛔ THE POSTER (founder 2026-08-04). *"This is the moment the athlete finishes a workout
            and wants to photograph it for social — and right now our finish screen looks like a
            list of decisions and conclusions. It doesn't invite anyone at all to be proud."*

            Everything above the footer is screenshot-safe: no back arrow, no title bar, the
            wordmark carried whole. A phone screen is 9:16 — the exact shape of a story — so the
            fix was never a share button. It was making the screen worth photographing.

            ⚠️ AND THE LEDGER IS STILL HERE, directly below. *"I'm not saying we shouldn't give
            access to the decisions."* Putting them behind a tap would have been a third control on
            a closing beat; **scrolling is access**, and it costs nothing.
            ════════════════════════════════════════════════════════════════════════════════════════
          */}
          {poster ? (
            <View style={styles.poster}>
              {/* The mark, so a screenshot carries the product without a word of advertising. */}
              <View style={styles.posterMark}>
                <RangeMark />
                <Text style={styles.posterWord}>hush</Text>
              </View>

              <Legend size={12} track={0.2} align="center" style={styles.posterLegend}>{savedLegend}</Legend>

              {poster.hero.kind === 'record' ? (
                <>
                  {/* A record takes the poster: it is the one thing more postable than a total. */}
                  <View style={styles.bestPill}>
                    <Text style={styles.bestPillText}>{t('complete.newBest')}</Text>
                  </View>
                  <Text style={styles.posterName} numberOfLines={2}>
                    {bidi(exerciseDisplayName(poster.hero.exerciseId))}
                  </Text>
                  <View style={styles.heroRow}>
                    <Text style={styles.heroNum}>{poster.hero.value}</Text>
                    <Text style={styles.heroUnit}>{poster.hero.unit}</Text>
                  </View>
                  {/*
                    ⛔ THE FOOTNOTE IS DELETED (founder 2026-08-05): *"and for a new record, take off
                    the × 8 reps · up 3.5 kg — it is just stuck there and not interesting."*

                    He is right and the reason is the screen's own logic: this poster exists because
                    a number is the story. A rep count and a delta underneath it are the ARGUMENT for
                    why the number is a record, and nobody photographs an argument. The delta is
                    still on the set stage, where she needed it while the bar was in front of her.
                  */}
                </>
              ) : (
                <>
                  {workoutName ? (
                    <Text style={styles.posterName} numberOfLines={2}>{bidi(workoutName)}</Text>
                  ) : null}
                  <View style={styles.heroRow}>
                    <Text style={styles.heroNum}>
                      {poster.hero.kind === 'tonnes' ? poster.hero.value.toFixed(1) : String(poster.hero.value)}
                    </Text>
                    {/* ⚠️ SANS. "t" is a translated WORD ("טון"), and mono cannot draw Hebrew at
                        all — the same two-voice split the set stage makes between a unit that is a
                        symbol (kg/lb, mono) and one that is a word. `monoCarriesNoWords` caught it. */}
                    {poster.hero.kind === 'tonnes' ? (
                      <Text style={styles.heroUnitWord}>{t('weekly.tonneUnit')}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.heroLabel}>
                    {poster.hero.kind === 'tonnes' ? t('complete.movedShort') : t('complete.setsLabel')}
                  </Text>
                </>
              )}

              {/*
                THE THREE FACTS, as figures. A record poster swaps calories for the tonnage, because
                the tonnage has just lost the hero slot and is the more distinctive of the two.
              */}
              {/*
                ⛔ TWO FACTS, NOT THREE (founder 2026-08-05): *"how long the workout was and how many
                calories were burned, ONLY."*

                The set count went with the receipt below it. Eleven sets is a number she cannot do
                anything with and cannot feel — minutes and calories are both things she spent.

                ⚠️ A RECORD POSTER STILL SHOWS THE TONNAGE, because the tonnage has just lost the hero
                slot to the record and is the more distinctive of the two.
              */}
              <View style={styles.posterStats}>
                <Fact value={durationLabel} unit={t('common.minShort')} />
                {poster.hero.kind === 'record' && poster.tonnes > 0 ? (
                  <Fact value={poster.tonnes.toFixed(1)} unit={`${t('weekly.tonneUnit')} ${t('complete.movedShort')}`} />
                ) : null}
                {kcal != null ? <Fact value={String(kcal)} unit={t('complete.kcal')} /> : null}
              </View>

              {/*
                ⛔ THE RECEIPT IS DELETED (founder 2026-08-05): *"all the exercises and their sets and
                how much weight was lifted on every single exercise — nobody is interested in that."*

                It was defended as what makes a screenshot credible rather than decorative. That was
                a reason to keep it on a SHARE card, and there is no share card: he has now said
                twice that these are screens you screenshot, not screens you share from. Ten rows of
                "45kg × 8·8·8·8" at 12 points was the small type in his photograph and the reason
                the coach's decisions were pushed under the fold.

                ⚠️ Nothing is lost — it is the session record, one press away, where a table belongs.
              */}

              {partial ? <Text style={styles.posterPartial}>{t('complete.partialTitle')}</Text> : null}
            </View>
          ) : null}

          {/*
            ⛔ THE DECISIONS GO BEHIND A DOOR (founder 2026-08-05):

              > *"Underneath, a nicely framed box saying X decisions were made based on this
              > workout, and pressing it opens the screen you showed of what changed. And if not,
              > there is the option to press finish workout."*

            They used to be the tail of this scroll, which is how they ended up UNDER the Done
            button in his screenshot — the work in front, the reasoning below the fold, and the
            reasoning arriving fifteen seconds late on top of that. A box states the count where the
            eye already is and holds the rows until she wants them.

            ⚠️ THE COUNT IS THE ROWS' OWN LENGTH. Not a second derivation — that is precisely the
            defect this same batch fixed on the Mirror, where a count and its rows updated by
            different rules and the screen printed "10 changes" over nothing.
          */}
          {!answered ? (
            /*
             * ⚠️ THE FIFTEEN SECONDS BEFORE THE BOX EXISTS.
             *
             * `answered` is false while the coach's call is out, and nothing was drawn there — so
             * the box appeared out of nowhere under her thumb, or never at all if she tapped
             * Finish first. **The most valuable thing on the screen was invisible to anyone
             * quick.**
             *
             * A quiet line, in the box's own slot, holding its place. It states what is happening
             * and claims nothing: there is no count yet, and a count is a claim. It is not a
             * control and it never blocks Finish — she may leave, and the decisions are on Today
             * and in the Saturday letter either way.
             */
            <View style={[styles.decisionBox, styles.decisionBoxThinking]}>
              <Text style={styles.decisionHeld}>{t('complete.stillReading')}</Text>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                nothingDecided
                  ? t('complete.everythingHeld')
                  : t('complete.decisionsCount', { count: decisions.length + volume.length })
              }
              disabled={nothingDecided}
              onPress={() => setSheetOpen(true)}
              style={({ pressed }) => [styles.decisionBox, pressed && !nothingDecided && styles.decisionBoxPressed]}
            >
              {nothingDecided ? (
                /* ⚠️ A HOLD IS A VERDICT AND SHE IS OWED IT — but it is not a DOOR, because there is
                   nothing behind it. Same box, no chevron, not pressable. */
                <Text style={styles.decisionHeld}>{t('complete.everythingHeld')}</Text>
              ) : (
                <>
                  <View style={styles.decisionLead}>
                    <Text style={styles.decisionNum}>{String(decisions.length + volume.length)}</Text>
                    <View style={styles.decisionWords}>
                      <Text style={styles.decisionWord}>
                        {t('complete.decisionsWord', { count: decisions.length + volume.length })}
                      </Text>
                      <Text style={styles.decisionFrom}>{t('complete.decisionsFrom')}</Text>
                    </View>
                  </View>
                  <Icon name="chevronRight" size={18} color={signal[0]} strokeWidth={2} />
                </>
              )}
            </Pressable>
          )}
        </ScrollView>

        {/* WHAT CHANGED — the rows, when she asks for them. */}
        {sheetOpen ? (
          <View style={styles.sheetWrap}>
            <View style={styles.sheetHead}>
              <Legend size={11} track={0.2}>{t('complete.decisionsFrom')}</Legend>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                onPress={() => setSheetOpen(false)}
                hitSlop={10}
                style={({ pressed }) => [styles.sheetClose, pressed && styles.ghostPressed]}
              >
                <Icon name="close" size={18} color={stage.ink0} strokeWidth={2} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.earned}>
              {decisions.map((d) => (
                <View key={d.key} style={styles.earnedRow}>
                  <View style={styles.earnedHead}>
                    <Text style={styles.earnedName} numberOfLines={1}>{bidi(d.name)}</Text>
                    {/* The held verdict puts a WORD in a mono slot — which the handoff does, and
                        which mono can only draw in a Latin script. When it cannot, the whole figure
                        hands over to sans rather than falling back mid-line (monoCarriesNoWords). */}
                    {/* ⛔ A SILENT ROW DRAWS NO COLUMN. Not "holds", not an empty arrow — nothing.
                        The coach's sentence beneath is the whole row, and any word here is a
                        verdict the app invented about a decision it did not make. */}
                    {d.silent ? null : (
                    <Text style={[styles.earnedFigure, !monoCanDraw(holdsWord) && styles.earnedFigureSans]}>
                      {d.held ? (
                        <>
                          <Text style={styles.earnedHold}>{`${holdsWord} `}</Text>
                          <Text style={styles.earnedHoldNum}>{d.from ?? d.to ?? ''}</Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.earnedFrom}>{d.from ?? ''}</Text>
                          <Text style={styles.earnedTo}>{`${d.from ? ' → ' : ''}${d.to}`}</Text>
                        </>
                      )}
                    </Text>
                    )}
                  </View>
                  <Text style={styles.earnedReason}>
                    {'text' in d.reason ? d.reason.text : t(d.reason.key, d.reason.params)}
                  </Text>
                </View>
              ))}

              {/* LOOP 3 · THE SHAPE OF THE WEEK. Not a lift and not a load — the figures beside it
                  are weekly SETS — but it is a DECISION, so it answers "why" like every other row
                  here (founder 2026-07-29: it shipped with the numbers and nothing else). It sits
                  last because it is the decision the other rows added up to. */}
              {volume.map((v) => {
                const rose = v.setsTo > v.setsFrom;
                const muscle = t(`muscle.${v.muscle}`);
                return (
                  <View key={`vol:${v.muscle}`} style={styles.earnedRow}>
                    <View style={styles.earnedHead}>
                      <Text style={styles.earnedName} numberOfLines={1}>
                        {t(rose ? 'complete.volumeUp' : 'complete.volumeDown', {
                          // `muscle.*` is authored for mid-sentence (English is singular lowercase),
                          // so a phrase that OPENS on it capitalises rather than earning a second key.
                          muscle: muscle.charAt(0).toUpperCase() + muscle.slice(1),
                        })}
                      </Text>
                      <Text style={styles.earnedFigure}>
                        <Text style={styles.earnedFrom}>{String(v.setsFrom)}</Text>
                        <Text style={rose ? styles.earnedTo : styles.earnedDown}>{` → ${v.setsTo}`}</Text>
                      </Text>
                    </View>
                    {/* ════ THE REASON SPEAKS HEBREW TOO (found driving C.15) ════
                        The engine stamps `muscle` as the RAW name — deliberately, because it is
                        pure and the lift names in this copy are English. The row's TITLE has
                        always translated it; the sentence under it did not, so a Hebrew athlete
                        read "העבודה על chest מתקדמת". The muscle is already resolved two lines
                        up for the title — the sentence gets the same word. */}
                    {v.reason ? (
                      <Text style={styles.earnedReason}>{t(v.reason.key, { ...v.reason.params, muscle })}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.footer}>
          {/* IMG_8260: the cream action first, "View session record" as a quiet ghost link beneath it.
              ⛔ "Finish workout", not "Done" (founder 2026-08-05): the box above is now the other
              thing she can do here, and two controls called Done and "3 decisions ›" do not tell
              her which one ends the workout. It says what happens. */}
          <Button variant="primary" size="lg" block label={t('complete.finishWorkout')} onPress={onDone} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('complete.viewRecord')}
            onPress={onRecord}
            style={({ pressed }) => [styles.recordLink, pressed && styles.ghostPressed]}
          >
            <Text style={styles.recordLinkLabel}>{t('complete.viewRecord')}</Text>
          </Pressable>
          {/*
            ⛔ THE "SHARE YOUR RECORD" CONTROL IS GONE — founder, 2026-08-02.

            It appeared only when the session set a real all-time best, which made it rare and
            therefore a surprise: a finished workout ends on what she did and what it changed, and
            a second act arriving on the one day she was strongest turns the closing beat into a
            prompt. The record itself is still made and still readable — this removes the ask, not
            the achievement.
          */}
        </View>
      </SafeAreaView>
    </View>
  );
}


/**
 * 2.4c · THE SCAN — the closing beat, on its own.
 *
 * Extracted so the v7 gallery can hold it still: inside a real completion it is driven by timers
 * and a history read, and a harness that mounts the whole screen sees it for a moment and then
 * loses it. Takes only props; renders exactly what WellDone rendered.
 */
export function SessionScan({
  lifts,
  read,
  setsOf,
  onSkip,
}: {
  lifts: { exerciseId: string; name: string }[];
  /** How many lifts have been read so far — the row at this index is the one being read. */
  read: number;
  setsOf: (exerciseId: string) => number;
  onSkip: () => void;
}) {
  const { t } = useCopy();
  return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <Pressable style={styles.scanRoot} onPress={onSkip} accessibilityRole="button" accessibilityLabel={t('complete.tapSkip')}>
            <View style={styles.scanHead}>
              <Legend size={12} track={0.22} tone="onStage">{t('complete.scanLegend')}</Legend>
              <Text style={styles.scanTitle} accessibilityRole="header">{t('complete.scanTitle')}</Text>
            </View>

            {/* THE LIFTS, READ IN ORDER. Three states, and each is drawn rather than labelled:
                already read (full presence, its set count stated), being read now (moss, breathing),
                and not yet reached (the same row at .4 — present, but not yet spoken for). */}
            <View style={styles.scanList}>
              {lifts.map((l, i) => {
                const done = i < read;
                const reading = i === read;
                return (
                  <View
                    key={l.exerciseId}
                    style={[
                      styles.scanRow,
                      i === lifts.length - 1 && styles.scanRowLast,
                      !done && !reading && styles.scanRowAhead,
                    ]}
                  >
                    <Text style={styles.scanName} numberOfLines={1}>{bidi(l.name)}</Text>
                    {reading ? (
                      <ScanPulse>
                        <Legend size={12.5} track={0} weight="regular" tone="accent">{t('complete.scanReading')}</Legend>
                      </ScanPulse>
                    ) : (
                      <Legend size={12.5} track={0} weight="regular" tone="onStage">
                        {t('complete.setsCount', { count: setsOf(l.exerciseId), n: setsOf(l.exerciseId) })}
                      </Legend>
                    )}
                  </View>
                );
              })}
            </View>

            {/* What the scan is FOR, with how far through it is. The bar is the read itself — it
                fills as the lifts are taken in, so it is a report, not a decoration. */}
            <View style={styles.scanFooter}>
              <View style={styles.scanTrack}>
                <View style={[styles.scanFill, { width: `${lifts.length ? Math.round((read / lifts.length) * 100) : 0}%` }]} />
              </View>
              <Text style={styles.scanNote}>{t('complete.scanFooter')}</Text>
            </View>
          </Pressable>
        </SafeAreaView>
      </View>
  );
}

/**
 * One measured fact: the number, and its unit beside it.
 *
 * The split is this app's habit everywhere else a figure appears — 34 in mono at the figure's size,
 * "kg" small and quiet beside it. Three of these read as three measurements; three legends, which
 * is what they were, read as a caption.
 */
function Fact({ value, unit }: { value: string; unit: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factUnit}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: stage[0] },
  safe: { flex: 1 },

  // not started
  notStartedBody: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 12 },
  notStartedLegend: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: trackingPx(textScale['2xs'], tracking.legend), textTransform: 'uppercase', color: stage.ink2, textAlign: 'left' },

  // beats 1+2
  // v7 2.4c · THE SCAN — the head high on the page, the lifts ruled beneath it, the read's own
  // progress at the foot. One beat, no card, nothing framed.
  // Kept for the two beats that still open with a legend on a line: NOT STARTED, and the ledger.
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  savedTitle: { fontFamily: font.serif, fontSize: textScale['3xl'], lineHeight: Math.round(textScale['3xl'] * 1.1), letterSpacing: trackingPx(textScale['3xl'], tracking.display), color: stage.ink0, marginTop: 14, textAlign: 'left' },

  scanRoot: { flex: 1 },
  scanHead: { paddingHorizontal: 30, paddingTop: 90, gap: 8 },
  scanTitle: { fontFamily: font.serif, fontSize: 36, lineHeight: 40, color: stage.ink0, textAlign: 'left' },
  scanList: { paddingHorizontal: 30, paddingTop: 26 },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,229,0.12)',
  },
  scanRowLast: { borderBottomWidth: 1, borderBottomColor: 'rgba(241,238,229,0.12)' },
  // Not yet read: the row is PRESENT, just not spoken for. It never disappears — the athlete can
  // see the whole session waiting to be taken in.
  scanRowAhead: { opacity: 0.4 },
  scanName: { flexShrink: 1, fontFamily: font.sansMedium, fontSize: 15.5, color: stage.ink0, textAlign: 'left' },
  scanFooter: { marginTop: 'auto', alignItems: 'center', gap: 10, paddingHorizontal: 30, paddingBottom: 60 },
  scanTrack: { width: '100%', height: 3, borderRadius: 2, backgroundColor: 'rgba(241,238,229,0.12)', overflow: 'hidden' },
  scanFill: { height: '100%', backgroundColor: up.stage },
  scanNote: { fontFamily: font.sans, fontSize: 15, color: stage.ink1, textAlign: 'center' },

  // beat 3
  resultScroll: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 16, flexGrow: 1, justifyContent: 'center' },
  // v7 2.5: "That's the work." is Frank Ruhl Libre serif, ~46px — the workout's closing sentence.
  resultTitle: { fontFamily: font.serif, fontSize: textScale['4xl'], letterSpacing: trackingPx(textScale['4xl'], tracking.display), lineHeight: 46, color: stage.ink0, marginTop: 12, textAlign: 'left' },
  copy: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 23, color: stage.ink1, marginTop: 10, maxWidth: 320, textAlign: 'left' },

  // v7 2.5 · WHAT IT COST — three measured facts on one mono line under the closing sentence.
  factRow: { flexDirection: 'row', gap: 26, marginTop: 18, alignItems: 'flex-end' },
  // The number and its unit sit on one baseline, the way every figure in this app is set.
  fact: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  factValue: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 30,
    color: stage.ink0,
    textAlign: 'left',
  },
  factUnit: { fontFamily: font.sans, fontSize: 13, color: stage.ink2, textAlign: 'left' },

  // v7 2.5 · THE DECISIONS — a ruled ledger. Each line opens on a hairline, so the block reads as
  // a record rather than a stack of cards, and the last line closes it.
  /*
   * ════ THE POSTER (founder 2026-08-04) ════
   *
   * Every figure here is sized to be read in a screenshot on somebody else's phone, which is the
   * only screen in this app with that requirement. His standing rule applies hardest here: *"there
   * can't be a lot of copy and certainly not small type."* Nothing below 12.5.
   */
  poster: { alignItems: 'center', paddingTop: 8 },
  posterMark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  posterWord: { fontFamily: font.serif, fontSize: 20, color: stage.ink0, textAlign: 'left' },
  posterLegend: { marginTop: 22, color: stage.ink2 },
  posterName: {
    marginTop: 6,
    fontFamily: font.serif,
    fontSize: 36,
    lineHeight: 41,
    letterSpacing: trackingPx(36, tracking.display),
    color: stage.ink0,
    textAlign: 'center',
  },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 18 },
  heroNum: {
    fontFamily: font.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 92,
    lineHeight: 96,
    letterSpacing: trackingPx(92, tracking.display),
    color: stage.ink0,
    includeFontPadding: false,
    textAlign: 'left',
  },
  heroUnit: { fontFamily: font.mono, fontSize: 24, color: stage.ink1, textAlign: 'left' },
  heroUnitWord: { fontFamily: font.sans, fontSize: 24, color: stage.ink1, textAlign: 'left' },
  heroLabel: {
    marginTop: 8,
    fontFamily: font.sansMedium,
    fontSize: 13,
    letterSpacing: trackingPx(13, tracking.legend),
    textTransform: 'uppercase',
    color: stage.ink2,
    textAlign: 'center',
  },
  bestPill: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(169,196,159,0.12)',
  },
  bestPillText: {
    fontFamily: font.sansMedium,
    fontSize: 13,
    letterSpacing: trackingPx(12.5, tracking.legend),
    textTransform: 'uppercase',
    color: up.stage,
    textAlign: 'left',
  },
  posterStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: 26,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(241,238,229,0.12)',
  },
  posterPartial: {
    marginTop: 20,
    fontFamily: font.serif,
    fontSize: 17,
    lineHeight: 24,
    color: stage.ink1,
    textAlign: 'center',
  },

  /* ── THE DECISIONS BOX — the only control on the poster that opens anything. ──
   *
   * A moss rim and a moss wash, which is the accent spent once on this screen: the palette's law is
   * that moss means A DECISION MADE, and this box is literally a count of them. It is the one place
   * on the finish screen where the app claims to have done something.
   */
  decisionBox: {
    marginTop: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 17,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(169,196,159,0.42)',
    backgroundColor: 'rgba(169,196,159,0.06)',
  },
  decisionBoxPressed: { backgroundColor: 'rgba(169,196,159,0.13)' },
  // Waiting is not a decision, so it does not wear the accent — a plain rim, holding the slot.
  decisionBoxThinking: { borderColor: 'rgba(241,238,229,0.16)', backgroundColor: 'transparent' },
  decisionLead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  decisionNum: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 30, color: signal[0], textAlign: 'left' },
  decisionWords: { flex: 1, gap: 1 },
  decisionWord: { fontFamily: font.sansSemibold, fontSize: 15, color: stage.ink0, textAlign: 'left' },
  decisionFrom: { fontFamily: font.sans, fontSize: 13, color: stage.ink2, textAlign: 'left' },
  // A held week: the same frame, no figure, no chevron — a verdict rather than a door.
  decisionHeld: { flex: 1, fontFamily: font.serif, fontSize: 16, lineHeight: 23, color: stage.ink1, textAlign: 'left' },

  /* ── …and what it opens. Full-bleed over the poster, because the rows are the subject once
   *    she has asked for them — not a card peeking over the thing she was reading. ── */
  sheetWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: stage[0], paddingTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 26, paddingTop: 16, paddingBottom: 4 },
  sheetClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(241,238,229,0.10)', alignItems: 'center', justifyContent: 'center' },
  sheetScroll: { paddingHorizontal: 26, paddingBottom: 40 },

  earned: { marginTop: 22 },
  earnedRow: {
    gap: 5,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,229,0.12)',
  },
  earnedHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  earnedName: { flexShrink: 1, fontFamily: font.sansSemibold, fontSize: 16, color: stage.ink0, textAlign: 'left' },
  earnedFigure: { flexShrink: 0, fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 16, color: stage.ink1, textAlign: 'right' },
  // The load it came FROM rests in shadow; the load it moved TO stands in moss — the decision is
  // the only thing on this line the engine actually made.
  earnedFrom: { color: stage.ink1 }, // rtl-ok: nested in earnedFigure
  earnedTo: { color: up.stage }, // rtl-ok: nested in earnedFigure
  // A TRIMMED muscle goes down, and down is blue everywhere in v7 (founder 2026-07-28): red would
  // read as failure, and losing a set she could not finish is the engine keeping the week honest.
  earnedDown: { color: down.stage }, // rtl-ok: nested in earnedFigure
  // A HELD lift (S-24) is a verdict too: the word is a word, so it takes the sans voice, and the
  // figure beside it stays mono and full cream — nothing moved, and that is stated, not implied.
  earnedHold: { color: stage.ink0 }, // rtl-ok: nested in earnedFigure
  // …and the sans sibling the whole figure swaps to when mono cannot draw the word.
  earnedFigureSans: { fontFamily: font.sans },
  earnedHoldNum: { color: stage.ink0 }, // rtl-ok: nested in earnedFigure
  // The reason, in the coach's own italic serif — the sentence that earned the number above it.
  earnedReason: { fontFamily: font.serif, fontStyle: 'italic', fontSize: 15, lineHeight: 21, color: stage.ink1, textAlign: 'left' },

  // beat 4 — the milestone stamp
  // v7 2.6: one 30px rhythm — legend, seal, words — centred with the whole column lifted 20.
  milestoneBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, marginTop: -20 },
  milestoneEmblem: { marginTop: 30, marginBottom: 30 },
  milestoneWords: { alignItems: 'center', gap: 10 },
  // The milestone's fact, stamped in the coach's serif voice — 40px, the biggest sentence in the app.
  milestoneTitle: { fontFamily: font.serif, fontSize: 40, lineHeight: 46, color: stage.ink0, textAlign: 'center' },
  milestoneSub: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 22, color: stage.ink1, textAlign: 'center', maxWidth: 300 },

  footer: { paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: 18, gap: 10, borderTopWidth: 1, borderTopColor: stage[2] },
  ghost: { height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  ghostPressed: { backgroundColor: stage[1] },
  ghostLabel: { fontFamily: font.sansSemibold, fontSize: textScale.base, color: stage.ink1, textAlign: 'left' },
  // IMG_8260: "View session record" — a quiet centred ghost link beneath the cream Done action.
  recordLink: { height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  recordLinkLabel: { fontFamily: font.sansSemibold, fontSize: textScale.base, color: stage.ink1, textAlign: 'center' },
});
