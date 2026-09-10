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

// 

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isEvidenceSet } from '@/domain/setEvidence';
import { View, Text, Pressable, StyleSheet, ScrollView, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '@/components/Icon';
import { Arrive, ARRIVE_STAGGER, Button, Legend, FooterFade } from '@/components/ds';
import { BottomSheet } from '@/components/BottomSheet';
import { RangeMark } from '@/components/RangeMark';
import { sessionPoster } from '@/domain/sessionPoster';
import { useCopy } from '@/i18n/useCopy';
import { sessionCardFromHistory } from '@/domain/shareCard';
import { bidi } from '@/i18n/bidi';
import { legendVoice, monoCanDraw } from '@/design/monoVoice';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { coachIsDeciding, onCoachUpdate, type CoachUpdate } from '@/platform/coach/afterSession';
import { coachVerdict } from '@/domain/coachEarned';
import type { CoachDecision } from '@/domain/coachLog';
import { NotificationAsk } from '@/screens/onboarding/NotificationAsk';
import { ensureNotificationPermission, markNotificationsAsked, notifier, shouldAskForNotifications } from '@/platform/notifications';
import { wellDone as wellDoneHaptic, tick as tickHaptic } from '@/platform/haptics';
import { useReducedMotion } from '@/platform/reducedMotion';
import { useFocusedStatusBar } from '@/platform/statusBar';
import { exerciseDisplayName, muscleOf } from '@/data/exercises';
import { displayWeight } from '@/domain/schedule';
import { newlyEarned } from '@/domain/milestones';
import { milestoneCopy } from '@/domain/milestoneCopy';
import { sessionKcal } from '@/domain/energy';
import { durationMinutes, posterDate} from '@/domain/duration';
import { milestone as milestoneHaptic } from '@/platform/haptics';
import { maybeAskForReview } from '@/platform/review';
import { MilestoneEmblem } from '@/components/MilestoneEmblem';
import { MiniBody } from '@/components/MiniBody';
import type { Session, SetLog } from '@/data/local/models';
import type { Explanation } from '@/engine/weeklyView';
import { color, space, stage, signal, font, textScale, ramp, tracking, trackingPx, up, down, motion } from '@/design/tokens';
import type { MainParamList } from '@/app/navigation';
// The app's language, not the device's — see `everyDateSpeaksHerLanguage`.
import { currentLocale } from '@/i18n';

type Props = NativeStackScreenProps<MainParamList, 'WellDone'>;

/**
 * ✦ When the body's bloom is allowed to begin.
 *
 * The figures are the poster's THIRD beat, so they land at `2 × ARRIVE_STAGGER`; the arrival itself
 * then takes `motion.dur[4]` to settle. The bloom starts as that settle finishes, so the two motions
 * read as a sequence — the body arrives, and THEN it lights up — rather than as one smear.
 */
const BLOOM_AFTER = 2 * ARRIVE_STAGGER + motion.dur[4];

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
        Animated.timing(pulse, { toValue: 0.35, duration: motion.dur[5], useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: motion.dur[5], useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, pulse]);
  return <Animated.View style={{ opacity: pulse }}>{children}</Animated.View>;
}

/** How many WORKING sets of one lift this session logged — the fact each scanned row states.
 *  A warm-up bridge (`isApproach`, 2026-08-24) is the road to the work, not the work — the same
 *  line sessionMetrics and the wrist summary draw, so every surface counts the same sets. */
function setsOf(exerciseId: string, session: Session | null): number {
  return (session?.sets ?? []).filter((s) => s.exerciseId === exerciseId && !s.isApproach).length;
}

/** Tonnes moved this session — Σ(weight × reps), in tonnes to one decimal. Bodyweight sets carry
 *  no declared load, so they add nothing rather than a guessed one. Working sets only — a warm-up
 *  bridge (`isApproach`) is excluded, exactly as `sessionMetrics.sessionTonnageKg` excludes it, so
 *  this poster and the Log row can never state two different tonnes for one workout. */
function sessionTonnes(sets: readonly SetLog[]): number {
  const kg = sets.reduce((sum, s) => sum + (isEvidenceSet(s) ? (s.actualWeight ?? 0) * s.actualReps : 0), 0);
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

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ ONE SENTENCE PER DECISION, NOT ONE PER LIFT (founder 2026-08-22, from a device screenshot).
 *
 * The ledger is the best thing on this screen and the closest the product comes to saying out loud
 * what it is — and on a first workout it read:
 *
 *   Barbell Bench Press   37.5 → 40    "It met its target on every set, so I added 2.5 kg."
 *   Deadlift              55 → 57.5    "It met its target on every set, so I added 2.5 kg."
 *   Triceps Pushdown      20 → 22.5    "It met its target on every set, so I added 2.5 kg."
 *   Cable Pull-Through    25 → 27.5    "It met its target on every set, so I added 2.5 kg."
 *   Seated Calf Raise     12 → 13      "It met its target on every set, so I added 2.5 kg."
 *
 * **The product's proudest moment, set like a mail merge.** Five lifts took the same decision for
 * the same reason, and the screen printed the reason five times — which does not read as five
 * decisions, it reads as one template.
 *
 * ── ⚠️ AND THE VOCABULARY WAS NEVER THE PROBLEM ─────────────────────────────────────────────────
 * `explain` carries eight distinct decisions (progress, graduate, volume up and down, the coarse-
 * machine hold, a reprice, a swap, detraining). Nothing here is short of words. What happened is
 * that a first session is the one where every lift meets its target — so the repetition is worst
 * exactly where the athlete is deciding what this app is.
 *
 * ── THE GROUPING KEY IS THE RENDERED SENTENCE, AND THAT IS THE WHOLE HONESTY OF IT ──────────────
 * Same copy key AND same params ⇒ the two rows would print the same words, so they are one thing
 * said once. A lift that went up **5 kg** while the others went up 2.5 carries a different sentence
 * and keeps its own — nothing is ever folded together that would have read differently apart.
 *
 * ⚠️ THE FACT STILL COMES BEFORE THE REASON. The rows are drawn first and the sentence sits under
 * them, ruled — which is this product's grammar everywhere (Today prints the load and the WHY sheet
 * holds the argument; the Saturday letter states the change and unfolds the case). A group of one is
 * therefore byte-for-byte the layout that shipped: one row, its sentence beneath it.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface DecisionGroup {
  key: string;
  lines: EarnedLine[];
  reason: EarnedReason;
}

/** The stable identity of a rendered sentence — the copy key and the values it interpolates. */
function reasonId(r: EarnedReason): string {
  return 'text' in r ? `t:${r.text}` : `k:${r.key}:${JSON.stringify(r.params ?? {})}`;
}

export function groupDecisions(lines: readonly EarnedLine[]): DecisionGroup[] {
  const out: DecisionGroup[] = [];
  const at = new Map<string, DecisionGroup>();
  for (const line of lines) {
    const id = reasonId(line.reason);
    const found = at.get(id);
    if (found) {
      found.lines.push(line);
      continue;
    }
    /*
     * ⚠️ ORDER IS THE SESSION'S, and it is kept twice over: a group takes the position of its FIRST
     * lift, and lifts stay in their own order inside it. She read these rows in this order twenty
     * seconds ago on the stage — re-sorting the record of a workout by anything other than the
     * workout would make her hunt for the lift she is looking for.
     */
    const group: DecisionGroup = { key: `${id}|${line.key}`, lines: [line], reason: line.reason };
    at.set(id, group);
    out.push(group);
  }
  return out;
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
  /**
   * ⚠️ A READ THAT FAILED IS NOT A WORKOUT THAT CHANGED NOTHING (found 2026-08-18).
   *
   * The catch below used to `setEarned([])`, and an empty list is drawn as *"Every lift held."* —
   * the one thing the note above says silence must never look like. An engine the screen could not
   * reach was reported to her as a verdict the engine did not give. It has its own state now: the
   * box states a result only when there IS one, and says nothing when the read did not land.
   */
  const [earnedFailed, setEarnedFailed] = useState(false);
  const [forward, setForward] = useState<Record<string, { loadFrom: number | null; loadTo: number | null }> | null>(null);
  useEffect(() => {
    if (notStarted || !summary?.startedAtMs) return;
    let active = true;
    const startedAtMs = summary.startedAtMs;
    /*
     * ⛔ ONE AT A TIME, AND THIS IS NOT TIDINESS (found 2026-08-18). Both calls ran unawaited, and
     * both run `foldEngine`: an unlocked load-mutate-save of the `hush.engine.v5` blob plus a
     * read-modify-write of `hush.preferences`. Two folds in flight over one blob means the second
     * save writes over whatever the first enacted — a graduation or a retirement simply gone, and
     * the lift the engine had just dropped back in her week the following Monday. Nothing about
     * that is visible here; it is visible next week, as a programme that will not move on.
     *
     * ⚠️ AND A FAILURE DOES NOT STRAND THE SECOND. Each read owns its own catch, so a `sessionEarned`
     * that throws still lets the from→to figures land, which is the same rule the two had apart.
     */
    void (async () => {
      try {
        const e = await Promise.resolve(app.model.sessionEarned?.({ startedAtMs }));
        if (active) setEarned(e ?? []);
      } catch {
        if (active) setEarnedFailed(true);
      }
      try {
        const f = await Promise.resolve(app.model.sessionForward?.({ startedAtMs }));
        if (active) setForward(f ?? {});
      } catch {
        if (active) setForward({});
      }
    })();
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
    /*
     * ⛔ THE ONE ASK FOR A RATING RIDES THE ONE LICENSED LOUD MOMENT (2026-08-23). A milestone is
     * rare by construction, it is HER achievement, and the emblem has already landed when the OS
     * sheet appears — so the app is asking at the only instant it has genuinely earned the
     * question. Once ever, structurally gated at ten sessions, silent on failure; the whole
     * doctrine is `platform/review`. Delayed past the stamp so nothing interrupts the beat itself.
     */
    const ask = setTimeout(() => void maybeAskForReview(app.modeState.completedSessions), 2600);
    if (reduced) {
      stamp.setValue(1);
      milestoneHaptic();
      return () => clearTimeout(ask);
    }
    stamp.setValue(0);
    const timer = setTimeout(() => {
      milestoneHaptic();
      Animated.spring(stamp, { toValue: 1, damping: 14, stiffness: 220, useNativeDriver: true }).start();
    }, 650);
    return () => {
      clearTimeout(timer);
      clearTimeout(ask);
    };
  }, [phase, reduced, stamp, app.modeState.completedSessions]);

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
      if (s.isApproach) continue; // a lift she only warmed up on was not trained — no row to read back
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
    /*
     * ════ THE ACCOUNT IS ASKED FOR HERE, ONCE, ON THE NEW ARM (2026-09-09, the formula report) ════
     *
     * An athlete whose enrolment finished without an account (`ProgramCreated`, the
     * `signInAfterFirstWorkout` arm) has just saved her first workout — the one moment the sentence
     * "an account keeps it yours" is about something she can lose. The closer is pushed OVER the
     * tabs, dismissible, and never again from here: the You tab keeps the door after that.
     */
    void app.isSignedIn().then((signed) => {
      if (signed || notStarted) {
        navigation.reset({ index: 0, routes: [{ name: 'HomeTabs' }] });
      } else {
        navigation.reset({ index: 1, routes: [{ name: 'HomeTabs' }, { name: 'Authentication', params: { after: 'workout' } }] });
      }
    });
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
              <Text
                style={[
                  styles.notStartedLegend,
                  { letterSpacing: legendVoice(t('complete.notStartedLegend'), textScale['2xs'], tracking.legend).letterSpacing },
                ]}
              >
                {t('complete.notStartedLegend')}
              </Text>
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
    const dateLabel = posterDate(new Date(celebration.earnedAt), currentLocale());
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
              <Legend size={17} track={0.24} align="center" tone="onStage">{t('milestones.legend')}</Legend>
              <View style={styles.milestoneEmblem}>
                {/* the one licensed loud moment — the seal gives off heat here, and nowhere else
                    in the app (founder 2026-07-12) */}
                <MilestoneEmblem size={216} onStage pulse value={mc.value} caption={mc.caption} glyph={mc.glyph} />
              </View>
              <View style={styles.milestoneWords}>
                <Text style={styles.milestoneTitle} accessibilityRole="header">{mc.title}</Text>
                {mc.sub ? <Text style={styles.milestoneSub}>{mc.sub}</Text> : null}
                {/* MEASURED · 17 JULY 2026 — the mark is a record, and a record is dated. */}
                <Legend size={17} track={0} weight="regular" align="center" tone="onStage">
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
   * ════════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ THE POSTER WAS STUTTERING ITS OWN HEADLINE (2026-08-27, the elevation pass)
   *
   * The legend was `${workoutName} · SAVED` and the line 40 points under it — `posterName`, the
   * serif at 36 — was `workoutName`. On every ordinary session the poster printed the name of the
   * workout TWICE, in two faces, one above the other. The docblock this replaces argued the name in
   * well: *"LOGGED said that something had been saved without ever saying what."* True — and by the
   * time it was written the title underneath was already saying it.
   *
   * ── WHAT THE LEGEND CARRIES INSTEAD, AND WHY IT IS THE RIGHT LINE ───────────────────────────────
   * The slot wants the thing the poster otherwise never says. This screen is a KEEPSAKE — it holds
   * the mark so *"a screenshot carries the product"*, it is the surface the share card is cut from,
   * and it is the one screen in the app an athlete comes back to look at. **A keepsake is dated.**
   * Nothing on it was.
   *
   * ⚠️ AND THE APP'S OTHER POSTER ALREADY KNEW. `Cardio`'s finish poster has carried `posterDate`
   * — weekday, day, month — since the founder asked for the pride half (2026-08-23). Two posters
   * for one product, and only the run was dated.
   *
   * The weekday is dropped where cardio keeps it: this line is tracked and centred inside 342 points
   * of poster, and `MONDAY 26 AUGUST · SAVED` is the one that wraps. The day and the month are what
   * survive a year; the weekday is not.
   *
   * ⚠️ `complete.logged` STAYS as the fallback. A session finalised before `startedAtMs` existed has
   * no date to print, and a legend reading just "· SAVED" would be worse than the word it replaced.
   * ════════════════════════════════════════════════════════════════════════════════════════════════
   */
  const savedOn = summary?.startedAtMs ? new Date(summary.startedAtMs) : null;
  /* ⛔ A PARTIAL SAYS SO AT THE TOP (design review 2026-09-01). "אימון חלקי נשמר." sat at the BOTTOM
     of the scroll — under the fold, beneath the sticky footer, on a screen most athletes close in
     two seconds. The most important status of the session was the least visible line on it. It is
     the head legend now, in the exact slot "נשמר" occupied, so nothing else on the poster moves. */
  const savedWord = partial ? t('complete.partialSavedShort') : t('complete.saved');
  const savedLegend = savedOn
    ? `${posterDate(savedOn, currentLocale())} · ${savedWord}`
    : partial
      ? t('complete.partialSavedShort')
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
          // She said yes seconds ago — the Saturday letter arms NOW, not at the next cold boot.
          // (Without this line a granted permission scheduled nothing until the app relaunched.)
          void notifier.scheduleWeeklyUpdate();
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
      /*
       * ⛔ TRAINED TOGETHER — v1 (founder, 2026-08-23: *"אפשר לעשות שגם מסך האימון ממש מציג עם מי
       * היה האימון המשותף"*). The names she gives are stamped onto the SAVED session
       * (`db.setSessionPartners` — the save has already landed when this screen stands), drawn on
       * the poster, and carried onto the story card. The LIVE shared session (the paired, mirrored
       * workout) is the next cycle's CloudKit work and will fill the same field — the record's
       * shape is the contract, not the mechanism.
       */
      partners={session?.partners ?? []}
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
      /* Her body, wearing this session's work — from the session itself, so the figures stand from
         the first frame instead of waiting on the history read the hero waits on. */
      muscles={[...new Set((session?.sets ?? []).map((x) => muscleOf(x.exerciseId)).filter((m): m is NonNullable<ReturnType<typeof muscleOf>> => m != null))]}
      sex={app.profile?.sex === 'male' ? 'male' : 'female'}
      /*
       * The COACH's rows now, with the engine's kept behind them.
       *
       * `decisions` is what the between-session fold used to produce and it is empty for ever —
       * the fold is deleted. Kept in the expression rather than dropped so a legacy athlete whose
       * last fold ran before the deletion still sees the sentence she was already promised.
       */
      decisions={coachLines.length ? coachLines : decisions}
      /* An empty list is the verdict "every lift held" — so it may only be drawn once the engine has
         actually answered. `earnedFailed` is a read that never will; see its note. */
      decisionsKnown={!earnedFailed && (earned !== null || coachLines.length > 0)}
      volume={volume}
      onDone={() => leave(goHome)}
      onRecord={() => leave(goRecord)}
      /*
       * ⛔ THE STORY DOOR (founder 2026-08-23, reversing his 2026-08-02 ruling BY NAME: *"המסך
       * שאותו אנשים ירצו לשתף ולהעלות לסטורי … מקור הגאווה שלהם + האפשרות לפרסום שלנו בזכות חשיפה
       * ויראלית. אנו חייבים לעמוד במשימה הזאת."*).
       *
       * The old ruling ("they can screenshot it — let's have some class") shaped the POSTER, and
       * the poster keeps it: no share chrome anywhere above the footer. What changed is that a
       * screenshot carries the status bar, the buttons, and whatever notch the phone has — and the
       * story she actually wants is the 9:16 card with none of that.
       *
       * ⛔ AND THE DOOR OPENS THE WORKOUT — ALWAYS (founder, device QA 2026-08-23: *"אני רוצה
       * לשתף את האימון מאיפה הגיע הדדליפט הזה"*). The first cut let the RECORD card outrank the
       * session here — my "prouder truth wins" — and on his device the door opened a deadlift
       * figure instead of the workout with her body on it. The record still rides the card, as a
       * line (`ShareSessionCard.record`); the workout is the story. No card (nothing real
       * logged) → no door, never a stub.
       */
      onShareStory={
        history && history.length > 0
          ? () => {
              const card = sessionCardFromHistory(
                history,
                app.profile?.units ?? 'kg',
                app.profile?.weightKg,
                app.profile?.sex === 'male' ? 'male' : 'female',
              );
              if (card) navigation.navigate('ShareCardModal', { card });
            }
          : undefined
      }
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
  muscles,
  sex,
  partners,
  decisions,
  decisionsKnown = true,
  volume,
  onDone,
  onRecord,
  onShareStory,
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
  /**
   * ⛔ HER BODY, ON THE FINISH ITSELF (founder, device QA 2026-08-23: *"אמרת שיופיע כאן
   * הדמויות. אין פה שום דבר שקשור לזה"*). The figures were built for the share card and drawn
   * only there — behind a door he had to guess at. The screen he photographs is this one, so the
   * body wearing the session's work stands on it too: the same `MiniBody` pair, the same moss.
   * Empty → nothing drawn (a bodyweight-only interval logs no muscle rows).
   */
  muscles?: string[];
  sex?: 'female' | 'male';
  /** Trained together — the names on the poster. Filled by the dedicated partner-workout flow
   *  (its own screen, founder 2026-08-24); an ordinary finish never asks. */
  partners?: string[];
  decisions: EarnedLine[];
  /**
   * ⚠️ WHETHER THE ENGINE ACTUALLY ANSWERED. An empty `decisions` means "every lift held", which is a
   * real verdict and is drawn as one — so it may only be drawn when the read LANDED. False while the
   * answer is still coming, and false for ever if it failed; the box holds its tongue instead of
   * telling her a workout changed nothing on the strength of a storage error. Defaults true for the
   * gallery and every harness that hands the rows in directly.
   */
  decisionsKnown?: boolean;
  volume: VolumeMove[];
  onDone: () => void;
  onRecord: () => void;
  /** The story door — absent when there is nothing true to put on a card (see the container). */
  onShareStory?: () => void;
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
  /*
   * ⛔ THE HERO IS ONE MEASUREMENT, AND VoiceOver HEARD TWO. `heroNum` and its unit are sibling
   * `Text`s, so the reader stopped on "60", moved on, and stopped again on "kg" — the biggest
   * figure in the product, delivered as two unrelated fragments. The group speaks once now.
   */
  const heroA11y = !poster
    ? ''
    : poster.hero.kind === 'record'
      ? `${poster.hero.value} ${poster.hero.unit}`
      : poster.hero.kind === 'tonnes'
        ? `${poster.hero.value.toFixed(1)} ${t('weekly.tonneUnit')} ${t('complete.movedShort')}`
        : `${poster.hero.value} ${t('complete.setsLabel')}`;

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
          {/*
            ⛔ AND ONLY THE HERO WAITS FOR THE POSTER (found 2026-08-18).

            This whole block — the legend, the two facts, the partial line, the decisions box — sat
            inside `{poster ? … }`. `poster` is built from the HISTORY read, so it is null on every
            render before the disk answers and null FOR EVER if `db.loadHistory()` rejects: the
            screen she gets for finishing a workout was a black page carrying "Finish workout" and
            nothing else. Under Reduce Motion the result is the first beat, so that was the whole of
            her closing screen, every single time, until the read landed.

            Everything below is built from `summary`, `durationLabel` and `kcal` — route params and
            props, present from the first frame. The poster decides the HERO and nothing else.
          */}
          <View style={styles.poster}>
              {/*
                ════════════════════════════════════════════════════════════════════════════════
                ⛔ FOUR GROUPS, EACH WITH ITS OWN SPACE (founder, 2026-08-12)

                  *"יש לך כאן המון חלל מת ומה שמופיע במסך הזה לא מסודר בצורה טובה מספיק."*

                Every gap on this poster was a hard `marginTop` — 22 under the mark, 6 under the
                legend, 18 over the hero, 26 over the stats, 26 over the box — stacked inside a
                block that was then CENTRED as a whole. So the spacing was fixed and the leftover
                went to the ends: measured, **190 points of black above the mark and 210 below the
                box**, with the four things she came for crushed into the middle third.

                The block owns the stage now and the groups are spread through it. The spacing
                inside each group is a `gap`; the spacing BETWEEN them is whatever the screen has
                left, which is the same rule the set stage and the end-of-set beat both run on.
                ════════════════════════════════════════════════════════════════════════════════
              */}
              {/*
                ════════════════════════════════════════════════════════════════════════════════
                ✦ THE POSTER ARRIVES (2026-08-27).

                `Arrive` was built for the founder's largest note — a screen should ARRIVE, not
                appear — and was wired into six screens. This one, the emotional peak of the
                product, was not among them: everything landed on the first frame at once.

                Four beats, in reading order: what it is, what it came to, the body that did it,
                and what it cost. The BLOOM is held until its own beat lands (`bloomDelay`) — a
                figure that lights up while it is still fading in reads as one smear, not two
                moments. See the note at `MiniBody.bloomDelay`.
                ════════════════════════════════════════════════════════════════════════════════
              */}
              <Arrive order={0} style={styles.posterHead}>
                {/* The mark, so a screenshot carries the product without a word of advertising. */}
                <View style={styles.posterMark}>
                  <RangeMark />
                  <Text style={styles.posterWord}>hush</Text>
                </View>

                <Legend size={17} track={0.2} align="center" style={styles.posterLegend}>{savedLegend}</Legend>

                {/*
                  ⚠️ THE IDENTITY IS ONE GROUP WHATEVER THE HERO IS. A record names the LIFT, an
                  ordinary session names the WORKOUT, and either way it is the line under the mark —
                  so the branch is on the words, never on the structure. The two used to fork the
                  whole poster, which is how the record variant ended up with its own spacing.
                */}
                {poster?.hero.kind === 'record' ? (
                  <>
                    {/* A record takes the poster: it is the one thing more postable than a total. */}
                    <View style={styles.bestPill}>
                      <Legend size={ramp.body} weight="semibold" style={styles.bestPillText}>{t('complete.newBest')}</Legend>
                    </View>
                    <Text style={styles.posterName} numberOfLines={2}>
                      {bidi(exerciseDisplayName(poster.hero.exerciseId))}
                    </Text>
                  </>
                ) : workoutName ? (
                  <Text style={styles.posterName} numberOfLines={2}>{bidi(workoutName)}</Text>
                ) : null}
                {/* Trained together — the sentence the poster is proudest of (2026-08-23). */}
                {partners && partners.length > 0 ? (
                  <Text style={styles.togetherLine} numberOfLines={1}>
                    {t('complete.togetherWith', { names: partners.join(' · ') })}
                  </Text>
                ) : null}
              </Arrive>

              {/* ⚠️ THE ONE THING THAT GENUINELY NEEDS THE HISTORY: a hero is a fact about her whole
                  record (a best, a tonnage, a set count), so it waits — and only it waits. */}
              {poster ? (
              <Arrive order={1} style={styles.posterHero} accessible accessibilityLabel={heroA11y}>
                {poster.hero.kind === 'record' ? (
                  /*
                   * ⛔ NO FOOTNOTE UNDER A RECORD (founder 2026-08-05): *"take off the × 8 reps · up
                   * 3.5 kg — it is just stuck there and not interesting."* This poster exists because
                   * a number is the story; a rep count and a delta are the ARGUMENT for why the
                   * number is a record, and nobody photographs an argument.
                   */
                  <View style={styles.heroRow}>
                    <Text style={styles.heroNum}>{poster.hero.value}</Text>
                    <Text style={styles.heroUnit}>{poster.hero.unit}</Text>
                  </View>
                ) : (
                  <>
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
                    <Legend size={ramp.body} align="center" style={styles.heroLabel}>
                      {poster.hero.kind === 'tonnes' ? t('complete.movedShort') : t('complete.setsLabel')}
                    </Legend>
                  </>
                )}
              </Arrive>
              ) : null}

              {/* her body, wearing this session's work — front and back, lit moss (see `muscles`) */}
              {/*
                ✦ THE ONE MOMENT THIS SCREEN HAS (2026-08-27).
                It bloomed nowhere before: the poster opened fully drawn, so the biggest beat in
                the product — she has just finished — arrived like a receipt printing. The muscles
                she worked now light up one after another under the total she moved. See the note
                in MiniBody. Front and back share the run because they are one body.
              */}
              {muscles && muscles.length > 0 ? (
                <Arrive order={2} style={styles.posterBody}>
                  {/* 132 → 150 (design review 2026-09-01): with the idle outline finally visible
                      (MiniBody.DIM), the pair earns the poster's room — at 132 the lit muscles
                      read as dots on smudges. */}
                  <MiniBody face="front" sex={sex} lit={muscles} height={150} bloom bloomDelay={BLOOM_AFTER} />
                  <MiniBody face="back" sex={sex} lit={muscles} height={150} bloom bloomDelay={BLOOM_AFTER} />
                </Arrive>
              ) : null}

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
              {/*
                ⛔ AND THE NAMES ARE THE BOARD'S OWN WORDS (`progress.badge*`), ON PURPOSE.

                The same three facts are drawn on Progress · ALL TIME, and between the two screens
                this app held FOUR vocabularies for them — `complete.kcal`, `weekly.statKcal`,
                `progress.unitKcal`, and "moved" as `complete.movedShort` / `weekly.statMoved` /
                `progress.badgeLifted`. A fact she meets twice must not change its name on the way.
                One key per fact, read from where the fact is defined at its longest.
              */}
              <Arrive order={3} style={styles.posterStats}>
                <Fact value={durationLabel} unit={t('common.minShort')} name={t('progress.badgeTrained')} />
                {poster?.hero.kind === 'record' && poster.tonnes > 0 ? (
                  <Fact value={poster.tonnes.toFixed(1)} unit={t('weekly.tonneUnit')} name={t('progress.badgeLifted')} />
                ) : null}
                {kcal != null ? <Fact value={String(kcal)} unit={t('complete.kcal')} name={t('progress.badgeBurned')} /> : null}
              </Arrive>

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

              {/* ⛔ the partial status ALSO leads the head legend (`savedWord`, design review
                  2026-09-01) — this line stays beside the facts it qualifies, because the child
                  cannot know what a caller's legend string carries, and a partial session must
                  say so on every path (`sessionEarned` pins it). */}
              {partial ? <Text style={styles.posterPartial}>{t('complete.partialTitle')}</Text> : null}

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
          {/*
            ⛔ "STILL READING YOUR SESSION" IS DELETED (founder, 2026-08-12: *"כבר לא רלוונטי לדעתי
            כי זה היה כאשר היה את ה-AI. אפשר למחוק ולוודא שכל הצינור הזה סגור."*).

            It held the box's slot for the ~15 s the post-session model call took. **That call is no
            longer made** — `sessionStore` stopped invoking `askAfterSession` on 2026-08-12, because
            the engine owns the programme after every session — so `coachIsDeciding()` is always
            false, `answered` is always true, and this branch could not render.

            ⚠️ AND THE ENGINE ANSWERS IN A MILLISECOND, which is the real reason it goes rather than
            being kept "just in case": there is no fifteen seconds left to fill. The pipe is closed
            at the source, not hidden behind a flag that would let it back in.
          */}
          {/*
            ⚠️ AND A VERDICT IS ONLY DRAWN WHEN THERE IS ONE (found 2026-08-18). "Every lift held" is
            what an EMPTY list means; it is not what an unread one means. While the engine's answer
            is still coming — and for ever, if the read failed — the box is simply not there, because
            the alternative is telling her the workout changed nothing on the strength of an error.
          */}
          {nothingDecided && !decisionsKnown ? null : (
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
                /*
                  ⚠️ A HOLD IS A VERDICT AND SHE IS OWED IT — but it is not a DOOR, because there is
                  nothing behind it. Same box, no chevron, not pressable.

                  ⛔ AND IT IS ALLOWED TO SOUND LIKE THE RESULT IT IS (founder, 2026-08-12): *"אם אין
                  שינוי לפחות תן לו ברכה מסוימת או פרגון מסוים. או משהו שבכל זאת יסב לו גאווה."*

                  It read "Every lift held at what you lifted. Nothing needed moving." — true, and
                  written like a receipt. **Landing every lift inside its band is the hardest thing
                  this product asks of her**, and the one week it happens the screen told her nothing
                  happened. The sentence stays inside what was measured; only the tone changed.
                */
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
          </View>
        </ScrollView>

        {/* WHAT CHANGED — the rows, when she asks for them. */}
        {sheetOpen ? (
          <View style={styles.sheetWrap}>
            <View style={styles.sheetHead}>
              <Legend size={17} track={0.2}>{t('complete.decisionsFrom')}</Legend>
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
              {groupDecisions(decisions).map((g) => (
                <View key={g.key} style={styles.earnedRow}>
                  {g.lines.map((d) => (
                  <View key={d.key} style={styles.earnedHead}>
                    <Text style={styles.earnedName} numberOfLines={2}>{bidi(d.name)}</Text>
                    {/* The held verdict puts a WORD in a mono slot — which the handoff does, and
                        which mono can only draw in a Latin script. When it cannot, the whole figure
                        hands over to sans rather than falling back mid-line (monoCarriesNoWords). */}
                    {/* ⛔ A SILENT ROW DRAWS NO COLUMN. Not "holds", not an empty arrow — nothing.
                        The coach's sentence beneath is the whole row, and any word here is a
                        verdict the app invented about a decision it did not make. */}
                    {/*
                      ════════════════════════════════════════════════════════════════════════════
                      ⛔ THE SANS FALLBACK WAS ASKED ABOUT THE LOCALE, NOT ABOUT THIS ROW.

                      The condition was `!monoCanDraw(holdsWord)` — and `holdsWord` is a CONSTANT
                      for the language, not this row's content. So in Hebrew, where mono cannot draw
                      `מחזיק`, the fallback fired on **every** row, including the ones whose figure
                      is nothing but digits and an arrow.

                      Measured in the harness, on one ledger, three rows apart:

                          " → 41"   Assistant             ← a LOAD that moved
                          " → 4"    IBMPlexMono-Medium    ← a SET COUNT that moved

                      Two faces for one kind of statement, and the wrong one won on the load. This
                      app's voice system is FACE: mono is what was measured, and 34 → 41 is the most
                      measured thing on the screen.

                      ⚠️ IT WAS INVISIBLE IN ENGLISH. `monoCanDraw('holds')` is true, so the fallback
                      never fired there and the ledger looked right. The defect only ever existed in
                      the primary locale — which is the one nobody was reading it in.

                      The question is per ROW now: a HELD row draws a word and hands the whole figure
                      to sans (that is `monoCarriesNoWords`, and it still holds); a moved row draws
                      figures and stays in the face figures are set in.
                      ════════════════════════════════════════════════════════════════════════════
                    */}
                    {d.silent ? null : (
                    <Text style={[styles.earnedFigure, d.held && !monoCanDraw(holdsWord) ? styles.earnedFigureSans : null]}>
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
                  ))}
                  {/* Said ONCE for the whole group — see `groupDecisions`. The rule appears only
                      when the sentence is covering more than one lift, because a rule over a single
                      row is a separator between a fact and its own reason. */}
                  <Text style={[styles.earnedReason, g.lines.length > 1 && styles.earnedReasonForMany]}>
                    {'text' in g.reason ? g.reason.text : t(g.reason.key, g.reason.params)}
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
                      <Text style={styles.earnedName} numberOfLines={2}>
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

        {/*
          ⛔ THE FOOTER STANDS DOWN WHILE THE SHEET IS UP (founder screenshot, 2026-08-18).

          `sheetWrap` is `StyleSheet.absoluteFillObject` — it covers the whole safe area, decisions
          included — and this footer is its NEXT SIBLING, so it painted **on top of it**: the cream
          "Finish workout" button and the "View session record" link sat across the middle of the
          decision list, with the fifth lift's "12 → 13" continuing underneath them and the footer's
          own hairline ruled straight through the sheet.

          ⚠️ IT WAS ALSO PRESSABLE THROUGH THE SHEET, which is the half a screenshot does not show:
          the one control that ENDS the workout was live, over a list she had opened to read, with
          nothing on screen tying it to the thing underneath. Nothing here was dimmed or hidden —
          later siblings simply paint above, and an absolute overlay that stops short of the last
          child is not an overlay.

          The sheet carries its own close (the ✕ in `sheetHead`), so the footer is not needed while
          it is up and returns the instant it closes. Not `opacity: 0` and not `pointerEvents`: the
          control is not there, so VoiceOver does not find it either.
        */}
        {sheetOpen ? null : (
        <View style={styles.footer}>
          {/* The ledger continues under this footer — the fade says so (design review 2026-09-01). */}
          <FooterFade ground={stage[0]} />
          {/* IMG_8260: the cream action first, "View session record" as a quiet ghost link beneath it.
              ⛔ "Finish workout", not "Done" (founder 2026-08-05): the box above is now the other
              thing she can do here, and two controls called Done and "3 decisions ›" do not tell
              her which one ends the workout. It says what happens. */}
          <Button variant="primary" size="lg" block label={t('complete.finishWorkout')} onPress={onDone} />
          {onShareStory ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('complete.shareStory')}
              onPress={onShareStory}
              style={({ pressed }) => [styles.recordLink, pressed && styles.ghostPressed]}
            >
              <Text style={styles.recordLinkLabel}>{t('complete.shareStory')}</Text>
            </Pressable>
          ) : null}
          {/*
            ════ ⛔ THE FOOTER IS TWO ACTS AGAIN (founder, build-58 device QA 2026-08-24) ════

            He photographed the closing screen with FOUR rows in this footer — finish, share,
            "התאמנתם יחד?", "צפייה ברשומת האימון" — standing so tall they buried the decisions box
            under the fold with no visible way to it: *"באג חריף שמסתיר את הכרטיסייה של ההחלטות."*

            Two left with that photograph:
              · THE TOGETHER DOOR — his ruling: a partner workout deserves its OWN simple screen,
                not a question appended to every ordinary finish. The RECORD's shape stays
                (`Session.partners`, `db.setSessionPartners`, the poster line, the story card) —
                the dedicated flow fills it when its cycle lands; this footer does not ask.
              · THE RECORD LINK — the Log owns the table, one tap away, where a table belongs.

            What remains is the founder's own arithmetic: the one act that ends the workout, and
            the one quiet door to the story.
          */}
          {/*
            ⛔ THE "SHARE YOUR RECORD" CONTROL IS GONE — founder, 2026-08-02.

            It appeared only when the session set a real all-time best, which made it rare and
            therefore a surprise: a finished workout ends on what she did and what it changed, and
            a second act arriving on the one day she was strongest turns the closing beat into a
            prompt. The record itself is still made and still readable — this removes the ask, not
            the achievement.
          */}
        </View>
        )}
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
              <Legend size={17} track={0.22} tone="onStage">{t('complete.scanLegend')}</Legend>
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
                        <Legend size={20} track={0} weight="regular" tone="accent">{t('complete.scanReading')}</Legend>
                      </ScanPulse>
                    ) : (
                      <Legend size={20} track={0} weight="regular" tone="onStage">
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
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ ONE FACT, ONE ROW (founder, 2026-08-12)
 *
 *   *"תן ל-3 המשתנים של הקלוריות משך האימון והטון שהורם כל שורה משל עצמו ותגדיל אותם — יש לך כאן
 *   מסך שלם למה אתה לא מנצל את כל האיזור במסך אני משתגע מזה."*
 *
 * Three facts shared one 18-point strip, side by side at 30 points, and on a record poster a THIRD
 * squeezed in beside them — "58 min · 3.6 t moved · 412 kcal" reading as one crowded line of small
 * print under a 92-point hero. They are three separate things she spent.
 *
 * A row each: the figure on the start edge at 44, its name on the end edge, a hairline between. The
 * block grows with the poster instead of competing with it.
 *
 * ⛔ EXCEPT THE THING ON THE END EDGE WAS NEVER A NAME — IT WAS THE UNIT.
 *
 * `justifyContent: 'space-between'` then threw it the full width of the poster, so the row read
 * **"5 ··· 250 points of black ··· min"**: a measurement torn in half, with nothing in the gap.
 * The row for time said "5 … min" and the one for energy "25 … kcal", while only the tonnage got a
 * word ("t moved") — three rows, two grammars, and no row saying what it was a measurement OF.
 *
 * ⚠️ AND THE APP ALREADY KNEW BETTER IN THREE PLACES. `fmtMinutes(seconds, unit)` exists in
 * `domain/duration` for the sole purpose of keeping a figure and its unit in one string, and this
 * screen went around it to split them. `WeeklyUpdate`'s `LetterFact` and `WorkoutDetail`'s `Fact`
 * both take value-with-unit and a separate `label`. This was the only one of the four that did not.
 *
 * The measurement is one group on the start edge, and the end edge carries the NAME this docblock
 * has been promising since it was written.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
function Fact({ value, unit, name }: { value: string; unit: string; name: string }) {
  return (
    /* One node, one sentence: "Trained 5 min" — not "5", stop, "min". */
    <View style={styles.factRow} accessible accessibilityLabel={`${name} ${value} ${unit}`}>
      <View style={styles.factMeasure}>
        <Text style={styles.factValue}>{value}</Text>
        <Text style={styles.factUnit}>{unit}</Text>
      </View>
      <Legend size={17} tone="muted">{name}</Legend>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: stage[0] },
  safe: { flex: 1 },

  // not started
  notStartedBody: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 12 },
  /* The one legend on the un-started state.
     ⚠️ THE TRACKING IS SUPPLIED AT THE CALL SITE, from `legendVoice`. It is an answer about the
     STRING — Latin keeps the instrument's open track, Hebrew never gets it — and a StyleSheet
     cannot see a string. `noTrackedHebrew` holds every slot in this class. */
  notStartedLegend: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], textTransform: 'uppercase', color: stage.ink2, textAlign: 'left' },

  // beats 1+2
  // v7 2.4c · THE SCAN — the head high on the page, the lifts ruled beneath it, the read's own
  // progress at the foot. One beat, no card, nothing framed.
  // Kept for the two beats that still open with a legend on a line: NOT STARTED, and the ledger.
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  savedTitle: { fontFamily: font.serif, fontSize: textScale['3xl'], lineHeight: Math.round(textScale['3xl'] * 1.1), letterSpacing: trackingPx(textScale['3xl'], tracking.display), color: stage.ink0, marginTop: 14, textAlign: 'left' },

  scanRoot: { flex: 1 },
  /* ════ ⛔ THE SCAN TAKES THE SCREEN (founder, 2026-08-12) ════
     *"למה מסך טעינת התרגילים הכל קטן ומינורי ולא גדול ובולט על כל המסך. תתפרש על המסך."* — this is
     the beat where the engine reads back every set she did, and it was drawn as a 17-point list
     under a 90-point top margin, ending a third of the way down. It is the only screen in the
     product whose whole job is to be watched. */
  scanHead: { paddingHorizontal: 26, paddingTop: 44, gap: 10 },
  scanTitle: { fontFamily: font.serif, fontSize: 46, lineHeight: 52, color: stage.ink0, textAlign: 'left' },
  scanList: { paddingHorizontal: 26, paddingTop: 28 },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 21,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,229,0.12)',
  },
  scanRowLast: { borderBottomWidth: 1, borderBottomColor: 'rgba(241,238,229,0.12)' },
  // Not yet read: the row is PRESENT, just not spoken for. It never disappears — the athlete can
  // see the whole session waiting to be taken in.
  scanRowAhead: { opacity: 0.4 },
  scanName: { flexShrink: 1, fontFamily: font.sansMedium, fontSize: 22, lineHeight: 28, color: stage.ink0, textAlign: 'left' },
  scanFooter: { marginTop: 'auto', alignItems: 'center', gap: 16, paddingHorizontal: 26, paddingBottom: 54 },
  scanTrack: { width: '100%', height: 6, borderRadius: 3, backgroundColor: 'rgba(241,238,229,0.12)', overflow: 'hidden' },
  scanFill: { height: '100%', backgroundColor: up.stage },
  scanNote: { fontFamily: font.sans, fontSize: 20, lineHeight: 27, color: stage.ink1, textAlign: 'center' },

  // beat 3
  /* paddingBottom 28 → 56: the last ledger row must clear the footer fade. */
  resultScroll: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 56, flexGrow: 1 },
  // v7 2.5: "That's the work." is Frank Ruhl Libre serif, ~46px — the workout's closing sentence.
  resultTitle: { fontFamily: font.serif, fontSize: textScale['4xl'], letterSpacing: trackingPx(textScale['4xl'], tracking.display), lineHeight: 46, color: stage.ink0, marginTop: 12, textAlign: 'left' },
  copy: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 23, color: stage.ink1, marginTop: 10, maxWidth: 320, textAlign: 'left' },

  // v7 2.5 · WHAT IT COST — one measured fact per row. See the note at `Fact`.
  factValue: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -1,
    color: stage.ink0,
    includeFontPadding: false,
    textAlign: 'left',
  },
  /* 17 → 20, and out of `ink2`. It names the figure beside it; at caption size in the dimmest ink
     it read as a footnote to a number that is the point of the row. */
  factUnit: { fontFamily: font.sans, fontSize: 20, color: stage.ink1, textAlign: 'left' },

  // v7 2.5 · THE DECISIONS — a ruled ledger. Each line opens on a hairline, so the block reads as
  // a record rather than a stack of cards, and the last line closes it.
  /*
   * ════ THE POSTER (founder 2026-08-04) ════
   *
   * Every figure here is sized to be read in a screenshot on somebody else's phone, which is the
   * only screen in this app with that requirement. His standing rule applies hardest here: *"there
   * can't be a lot of copy and certainly not small type."* Nothing below 12.5.
   */
  /* ⛔ THE BLOCK OWNS THE STAGE AND THE FOUR GROUPS SPREAD THROUGH IT — see the note at the
     markup. It was `alignItems: center` inside a centred scroll, so every gap was a hard margin and
     the leftover piled up at the two ends: 190 points of black above, 210 below. */
  poster: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  posterHead: { alignSelf: 'stretch', alignItems: 'center', gap: 10 },
  posterHero: { alignItems: 'center', gap: 6 },
  posterMark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  posterWord: { fontFamily: font.serif, fontSize: 20, color: stage.ink0, textAlign: 'left' },
  posterLegend: { color: stage.ink2 },
  posterName: {
    fontFamily: font.serif,
    fontSize: 36,
    lineHeight: 41,
    letterSpacing: trackingPx(36, tracking.display),
    color: stage.ink0,
    textAlign: 'center',
  },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  heroNum: {
    fontFamily: font.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 92,
    lineHeight: 96,
    /* ✦ Set as a headline at the size it actually is — see `tracking.figureLarge`. This is the
       biggest figure in the product and it was the loosest thing in its own size class. */
    letterSpacing: trackingPx(92, tracking.figureLarge),
    color: stage.ink0,
    includeFontPadding: false,
    textAlign: 'left',
  },
  heroUnit: { fontFamily: font.mono, fontSize: 24, color: stage.ink1, textAlign: 'left' },
  heroUnitWord: { fontFamily: font.sans, fontSize: 24, color: stage.ink1, textAlign: 'left' },
  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ THIS LABEL WAS DETACHING ITS OWN HEBREW LETTERS (found 2026-08-27, on the poster itself)
   *
   * It read `נ פ ח` under a 92-point `4.2`. Two faults, stacked, and both are fossils:
   *
   *   · ⛔ TRACKED SANS. `tracking.legend` is .16em — a device of an alphabet that HAS caps and
   *     whose letters are built to stand apart. `Legend` has forbidden this since 2026-08-26 and
   *     says why at length; this style was a hand-rolled copy of `Legend` that never got the fix,
   *     because `trackingPx(…)` is a CALL and the type lint only knew how to see a positive
   *     numeric literal. Six styles were hiding in that blind spot. The lint can see calls now.
   *   · ⚠️ AND THE TRACKING WAS SIZED FOR A FONT THIS TEXT IS NO LONGER SET IN. `trackingPx(13, …)`
   *     on a `fontSize: 17` line — the founder's type floor (2026-08-12) lifted 13 to 17 and left
   *     the argument behind. Every one of the six had the same tell: 13, 12.5, 10.5.
   *
   * It is a `Legend` now rather than a repair, which is the actual lesson: this was always an
   * instrument label, and the app has one of those. What survives here is the COLOUR — the poster
   * sits on `stage`, not on `color` — and `Legend` applies `style` last, so it wins.
   * ════════════════════════════════════════════════════════════════════════════════════════════
   */
  heroLabel: { color: stage.ink2, textAlign: 'center' },
  bestPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(169,196,159,0.12)',
  },
  /* The record stamp — a `Legend` for the same reason `heroLabel` is; see the note there. */
  bestPillText: { color: up.stage, textAlign: 'left' },
  /* ⛔ A COLUMN, NOT A STRIP — see the note at `Fact`. */
  // the session's body pair, front and back, between the hero and the facts
  posterBody: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 20 },
  posterStats: {
    alignSelf: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(241,238,229,0.12)',
  },
  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ `space-between` IS GONE (2026-08-27) — IT WAS STILL DOING THE THING ITS OWN NOTE INDICTS.
   *
   * The docblock at `Fact` names the fault exactly: *"`justifyContent: 'space-between'` then threw
   * it the full width of the poster, so the row read **\"5 ··· 250 points of black ··· min\"**: a
   * measurement torn in half, with nothing in the gap."*
   *
   * That repair changed WHAT was split — the figure and its unit were grouped, correctly — and left
   * `space-between` standing. So the row stopped tearing the measurement in half and started
   * tearing the measurement from its NAME instead. Measured on the poster: `58 דק׳` ends at 113 and
   * `זמן אימון` begins at 307. **194 points of black between a number and the word for what it is.**
   * The same void, one column over.
   *
   * ⚠️ AND THE FOUNDER'S RULING DOES NOT ASK FOR THIS. 2026-08-12: *"תן ל-3 המשתנים … כל שורה משל
   * עצמו ותגדיל אותם — יש לך כאן מסך שלם למה אתה לא מנצל את כל האיזור."* That is about ROWS and
   * SIZE, and both stay. Using the whole area is what the RULES do — they run edge to edge and give
   * the block its presence. It was never a reason to exile a three-letter word to the far margin.
   *
   * ⚠️ AND THE POSTER WAS THE ODD ONE OUT. This app has three stat displays: Today's `liveStats` and
   * the Saturday letter's `statBand` both set the label WITH its figure. Only the poster split them.
   *
   * A name sits beside the thing it names.
   * ════════════════════════════════════════════════════════════════════════════════════════════
   */
  factRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 14,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(241,238,229,0.12)',
  },
  /* The figure and its unit, tighter than the gap to the name — so the row reads as one
     measurement and then what it is OF, rather than three equal words. */
  factMeasure: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
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
    alignSelf: 'stretch',
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
  decisionNum: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 30, letterSpacing: trackingPx(30, tracking.figure), color: signal[0], textAlign: 'left' },
  decisionWords: { flex: 1, gap: 1 },
  decisionWord: { fontFamily: font.sansSemibold, fontSize: 17, color: stage.ink0, textAlign: 'left' },
  decisionFrom: { fontFamily: font.sans, fontSize: 17, color: stage.ink2, textAlign: 'left' },
  // A held week: the same frame, no figure, no chevron — a verdict rather than a door.
  decisionHeld: { flex: 1, fontFamily: font.serif, fontSize: 17, lineHeight: 23, color: stage.ink1, textAlign: 'left' },

  /* ── …and what it opens. Full-bleed over the poster, because the rows are the subject once
   *    she has asked for them — not a card peeking over the thing she was reading. ── */
  sheetWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: stage[0], paddingTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 26, paddingTop: 16, paddingBottom: 4 },
  sheetClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(241,238,229,0.10)', alignItems: 'center', justifyContent: 'center' },
  sheetScroll: { paddingHorizontal: 26, paddingBottom: 30 },

  /* ════════════════════════════════════════════════════════════════════════════════════════════
     ⛔ THE DECISIONS ARE THE PRODUCT, AND THEY WERE DRAWN AS A TABLE (founder, 2026-08-12)

       *"מסך עצוב שגם בו יש מלא מקום במסך ויש מלא הזדמנויות ממש להציג את ההחלטות שלנו בצורה מדהימה
       והמסך הזה פשוט לא טוב מספיק."*

     He is right, and the measurement says how far off it was: a 17-point name, a 17-point figure
     pushed to the right margin, a 17-point reason — **three type sizes that are all the same size**
     — stacked at 15 points apart, ending a third of the way down an 844-point sheet.

     ⚠️ AND THE NUMBER WAS THE SMALLEST THING IN THE ROW. "34 → 41" is the whole claim this product
     makes: it read her sets and moved the bar. It sat in the right margin at caption size, in the
     same weight as the word "Barbell". Here it is the largest thing in its block, on its own line,
     with the reason underneath in the coach's voice.
     ════════════════════════════════════════════════════════════════════════════════════════════ */
  earned: { marginTop: 10, gap: 4 },
  earnedRow: {
    gap: 9,
    paddingVertical: 22,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,229,0.12)',
  },
  /* Column, not a row: the figure is not an annotation of the name, it is the news. */
  earnedHead: { gap: 7 },
  earnedName: { fontFamily: font.sansSemibold, fontSize: 20, lineHeight: 26, color: stage.ink0, textAlign: 'left' },
  /* `-1` here was -0.025em by hand and it was RIGHT — it is the rung `tracking.figure` was named
     from. Stated in em now so it travels with the size instead of being re-guessed at each one. */
  earnedFigure: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], fontSize: 40, lineHeight: 46, letterSpacing: trackingPx(40, tracking.figure), color: stage.ink1, includeFontPadding: false, textAlign: 'left' },
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
  /* 17/21 → 19/27. It is the sentence that earns the figure above it and the only prose on the
     sheet; at caption size and caption leading it read as a footnote to a table. */
  earnedReason: { fontFamily: font.serif, fontSize: 19, lineHeight: 27, color: stage.ink1, textAlign: 'left' },
  /*
   * The sentence that covers SEVERAL lifts gets a rule above it, so it reads as belonging to the
   * rows rather than to the last one of them. A group of one gets nothing — see the note at the
   * markup: a rule between a fact and its own reason is a separator between two halves of one
   * thing, which is the opposite of what a rule is for.
   */
  /* ⚠️ `stage[2]`, NOT `color.border` — this file does not import `color`, and `@ts-nocheck` means
     nothing said so until a render test refused to load the module. The exact shape
     `everyComponentIsImported` was written for, one layer down: a StyleSheet is evaluated on import,
     so an unbound name here does not fail a screen, it fails the whole app at launch. */
  earnedReasonForMany: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: stage[2] },

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
  togetherLine: { fontFamily: font.serif, fontSize: 18, lineHeight: 24, color: stage.ink1, textAlign: 'center', marginTop: 6 },
  togetherLegend: { marginBottom: 10 },
  togetherTitle: { fontFamily: font.sansSemibold, fontSize: textScale.xl, color: color.textPrimary, textAlign: 'left' },
  togetherSub: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 23, color: color.textSecondary, marginTop: 8, marginBottom: 16, textAlign: 'left' },
  togetherSave: { marginTop: 16 },
});
