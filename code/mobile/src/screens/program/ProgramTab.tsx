/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PROGRAM TAB — her whole week, one tap from anywhere.
 *
 * ⛔ FOUNDER, device QA 2026-08-23: *"או להוסיף ספרייה ל-Tab Bar שממנה אפשר לנהל את התוכנית, או
 * להוסיף ל-Tab Bar ניהול תוכנית האימון ששם אפשר ממש לנהל את תוכנית האימון באופן מלא."*
 *
 * The management machinery already existed — the pre-workout card carries the S-77 declared swap,
 * the why-sheets, and the move-to-today door — but it hid behind Today's workout list, so "manage
 * my programme" had no address. This tab is that address: the week laid out in full, every lift
 * with its live prescription, each day opening the SAME pre-workout card (one management surface,
 * never a rival one), and the library one row away.
 *
 * ── WHAT THIS SCREEN REFUSES TO BE ──────────────────────────────────────────────────────────────
 * A second editor. Every verb here routes to a surface that already owns it: a day edits on the
 * pre-workout card, exercise preferences edit in the library, the body map edits under You. This
 * screen is the MAP of the week — adding a rival editing grammar is how two surfaces drift.
 *
 * ── THE STATION NOTE (his item, verbatim) ───────────────────────────────────────────────────────
 * *"ארצה שהמתאמן ידע שהמערכת מסדרת את התוכנית כך שהמתאמן נשאר על ציוד מסוים ועוזב אותו רק כשהוא
 * מסיים — רק צריך לסגנן את זה יפה."* The engine has ordered the day by station since 2026-07-27
 * (`orderWithinDay`) and never said so. The note under the header says it, once, quietly.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

//

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { plannedMinutes } from '@/domain/duration';
import { View, Text, Pressable, ScrollView, StyleSheet, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Arrive, Legend} from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { useApp } from '@/state/stores/appStore';
import { db } from '@/data/local/db';
import { loadWeekPlan } from '@/data/local/weekPlan';
/* The app's ONE assembly of a prescription — see the note over `figure`. */
import { figureLoad, figureUnit, figureScheme, type PlanLift, FigureCells} from '@/components/PlanLifts';
import { coachWeek, coachRows, coachPlanRows } from '@/domain/coachWeek';
import type { CoachPlan } from '@/domain/coachPlan';
import { color, font, textScale, tracking } from '@/design/tokens';
import { Icon } from '@/components/Icon';
import { DayInMotion } from '@/components/DayInMotion';
import { exerciseMotion } from '@/motion/registry';
import type { FigureSex } from '@/motion/types';
import { bidi } from '@/i18n/bidi';
import type { MainParamList, HomeTabsParamList } from '@/app/navigation';
import { engineReceipt, type EngineReceipt } from '@/domain/engineReceipt';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { exerciseDisplayName } from '@/data/exercises';

type Props = CompositeScreenProps<
  BottomTabScreenProps<HomeTabsParamList, 'Program'>,
  NativeStackScreenProps<MainParamList>
>;

/** One lift's line: name left, the live prescription right — the pre-workout card's own grammar. */
interface Row {
  exerciseId: string;
  name: string;
  load: number | null;
  sets: number;
  band: [number, number];
  detail?: string;
}

/*
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THIS TAB WAS PRINTING KILOGRAMS TO A POUNDS ATHLETE, UNLABELLED (found 2026-08-26)
 *
 * It had its own `figure()` — six lines that assembled `60 · 4×8–10` out of the row — and it did two
 * things the shared assembly does not:
 *
 *   · NO UNIT. Today draws `41 kg · 4×8–10` for the same lift; this tab drew `41 · 4×8–10`. Two
 *     screens, one row, one of them silent about what the number is in.
 *   · ⛔ NO CONVERSION. `r.load` is KILOGRAMS off the plan, printed raw. `units` is read at the top
 *     of this file and was never passed here — so an athlete on pounds read her whole week in
 *     kilograms with nothing saying so. On the one screen that lists every load she will lift.
 *
 * `PlanLifts`'s own header states the rule this broke: *"the one place the app decides how a
 * prescription READS… the queued card's three headline rows borrow the assembly rather than growing
 * a second one beside it."* This tab grew a second one beside it.
 *
 * It borrows the same three functions now, so all three surfaces read a prescription identically and
 * `theProgrammeReadsInHerUnits` holds them together.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
const figure = (r: Row, units: 'kg' | 'lb'): string => {
  const lift = { load: r.load, sets: r.sets, band: r.band, ...(r.detail != null ? { detail: r.detail } : {}) } as PlanLift;
  return `${figureLoad(lift, units)}${figureUnit(lift, units)}${figureScheme(lift)}`;
};

/** Everything the tab draws, as data — the gallery mounts this half with fixtures. */
export interface ProgramTabViewProps {
  workouts: { id: string; name: string; lifts: number; minutes: number; done: boolean; rows: Row[] }[];
  /**
   * How she reads a weight.
   *
   * ⛔ REQUIRED, NOT OPTIONAL, AND THAT IS THE POINT (2026-08-26). `Row.load` is KILOGRAMS off the
   * plan — `coachPlanRows` spends `units` on distances and passes the load through untouched — so a
   * view that cannot be handed her units is a view that cannot print a weight. It was printing them
   * anyway. A required prop is the only version of this that a future screen cannot forget.
   */
  units: 'kg' | 'lb';
  /** True once the read settled — an empty settled week says so; an unsettled one says nothing. */
  settled: boolean;
  /** Which athlete demonstrates — the same `figure` switch every other motion surface takes. */
  figure?: FigureSex;
  /** True while this tab is not the visible one — every card's body holds its pose, no clock runs. */
  motionPaused?: boolean;
  onDay: (workoutId: string) => void;
  /** The engine's receipt over her log (2026-09-07) — null or no decisions draws nothing. */
  receipt?: EngineReceipt | null;
  /** The edit door — at the TOP of the tab (founder 2026-09-07). The library door is gone from here. */
  onBuild: () => void;
}

/** Where the eye rests on a scrolling list — a little above centre, where the card she stopped on sits. */
const FOCUS_FRACTION = 0.42;

export function ProgramTabView({ workouts, units, settled, figure, motionPaused, onDay, onBuild, receipt = null }: ProgramTabViewProps) {
  const { t } = useCopy();
  const insets = useSafeAreaInsets();
  /*
   * ════ ⛔ THE CARD SHE IS LOOKING AT IS THE ONE THAT MOVES (founder, 2026-09-07) ════
   *
   * *"כשאני גולל במסך הזה רק האימון הראשון הסרטון פעיל. אני מבין שזה בשביל לא להריץ כמה סרטונים
   * במקביל אבל למה לא פשוט כשגוללים עבור כל תוכנית אז שהסרטון שלה יופעל."*
   *
   * The one-clock law below stands — ONE figure moves at a time — and the founder is not arguing
   * with it; he is arguing with WHICH one. "The next workout" was the week's grammar; on a
   * scrolling tab it meant every card she scrolled to stood still while one she had scrolled past
   * kept performing to nobody. So the clock follows the eye: each card reports where it sits
   * (`onLayout`), the list reports how far she has scrolled, and the card under the focus line —
   * a little above the centre of the viewport, where a stopped scroll leaves the thing you were
   * looking at — is the one that performs. Before any layout has landed (the first frame) the
   * next workout performs, exactly as before, so the tab never opens still.
   *
   * ⚠️ `scrollEventThrottle={48}` — a rig-build per frame is the cost the law is about, and the
   * performer only changes when the focus line crosses a card edge, so a coarse scroll clock loses
   * nothing visible and spends nothing on frames where nothing changes.
   */
  const frames = useRef<Record<string, { y: number; h: number }>>({});
  const [focusY, setFocusY] = useState<number | null>(null);
  const viewportH = useRef(0);
  const onCardLayout = useCallback((id: string, e: LayoutChangeEvent) => {
    frames.current[id] = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
  }, []);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setFocusY(e.nativeEvent.contentOffset.y + viewportH.current * FOCUS_FRACTION);
  }, []);
  const onViewportLayout = useCallback((e: LayoutChangeEvent) => {
    viewportH.current = e.nativeEvent.layout.height;
  }, []);
  /*
   * ⛔ ONE CLOCK ON THIS TAB TOO (founder 2026-09-02 + `DayInMotion`'s own law).
   *
   * The founder's ask, verbatim: *"במסך תוכנית האימון... התוכנית צריכה להופיע כסרטון של תוכניות
   * האימון כמו במסך הToday ולא רשימת תרגילים כמו מכולת."* So every workout card carries a body now,
   * exactly as Today's card does — and the temptation is to let all four of them move.
   *
   * `DayInMotion`'s header already did that arithmetic: every moving figure is a
   * `requestAnimationFrame` loop rebuilding a whole rig per frame, and the 24fps cap exists because
   * ONE uncapped figure froze Chrome's renderer (measured 2026-08-31). Four moving at once is 96
   * rig-builds a second on a scrolling screen. So the grammar is the week's own: the NEXT workout —
   * the first one not behind her — performs its lifts in full motion; every other day stands ready,
   * mid-rep, still. One clock, and the stillness itself says "not yet".
   *
   * A day whose lifts have no rigs cannot perform (the hero draws nothing there), so the stage
   * passes over it to the first day that can — otherwise one unrigged day would silence the tab.
   */
  const nextId = useMemo(
    () => workouts.find((w) => !w.done && w.rows.some((r) => !!exerciseMotion(r.exerciseId)))?.id ?? null,
    [workouts],
  );
  const performingId = useMemo(() => {
    if (focusY == null) return nextId;
    const canPerform = (w: (typeof workouts)[number]) => w.rows.some((r) => !!exerciseMotion(r.exerciseId));
    // The card under the focus line, else the nearest card to it — never nothing while a card can move.
    let best: string | null = null;
    let bestDist = Infinity;
    for (const w of workouts) {
      const f = frames.current[w.id];
      if (!f || !canPerform(w)) continue;
      const dist = focusY < f.y ? f.y - focusY : focusY > f.y + f.h ? focusY - (f.y + f.h) : 0;
      if (dist < bestDist) {
        bestDist = dist;
        best = w.id;
      }
    }
    return best ?? nextId;
  }, [focusY, workouts, nextId]);
  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={48}
        onLayout={onViewportLayout}
      >
        {/*
          ✦ IT ARRIVES (2026-08-27). `Arrive` was built for the founder's largest note — a screen
          should ARRIVE, not appear (2026-08-12).

          Two beats: the tab's name with the rule it keeps, then her week. The WORKOUTS land together
          rather than one per beat — they are the four days of one week, and dealing them out like
          cards would say that the first matters more than the fourth.
        */}
        <Arrive order={0}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('program.tabTitle')}</Text>
          </View>

          {/* The station note — the ordering the engine has kept since 2026-07-27, finally said. */}
          <View style={styles.note}>
            <Icon name="layers" size={16} color={color.textMuted} />
            <Text style={styles.noteText}>{t('program.stationNote')}</Text>
          </View>

          {/*
            ════ THE RECEIPT (founder, 2026-09-07 — the plan's fourth part) ════
            *"הדבר שאימון לבד לא נותן: מאמן שמסיק בין סשן לסשן, עם נימוק, ומראה מה היה קורה בלעדיו."*

            The product sells decisions, and decisions are invisible — nobody can see the weight
            she did not lift. `engineReceipt` counts them off her own log (every set carries the
            engine's word at the moment of the set) and, when two plans have had time to part, puts
            the fixed plan's figure next to the engine's on her most-worked lift. Every number is
            either logged or the named rule's own arithmetic — the voice law, kept. It stood only on
            the paywall; the week she is about to train is where it earns its place. Silent until
            there is a decision to count: a first week has no receipt, and says nothing.
          */}
          {receipt && receipt.decisions > 0 ? (
            <View style={styles.receipt}>
              <Legend size={17} track={0.18} style={styles.receiptLegend}>{t('program.receiptLegend')}</Legend>
              <Text style={styles.receiptLine}>
                {t('program.receiptDecisions', { count: receipt.decisions, raises: receipt.raises, holds: receipt.holds, eases: receipt.eases })}
              </Text>
              {receipt.counterfactual ? (
                <Text style={styles.receiptLine}>
                  {t(receipt.counterfactual.engineKg > receipt.counterfactual.fixedKg ? 'paywall.receiptAhead' : 'paywall.receiptBehind', {
                    lift: bidi(exerciseDisplayName(receipt.counterfactual.exerciseId)),
                    fixed: displayWeight(receipt.counterfactual.fixedKg, units),
                    engine: displayWeight(receipt.counterfactual.engineKg, units),
                    unit: unitLabel(units),
                  })}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/*
            ⛔ THE EDIT DOOR IS THE FIRST THING ON THE TAB (founder, 2026-09-07): *"למה שינוי התוכנית
            מופיע למטה? אם נכנסתי למסך הזה כנראה שאני כן רוצה לעשות עריכה וזה אמור להיות בראש המסך."*
            It stood under the week with the library beside it; the library door is DELETED from
            this tab (its screen keeps a quiet door on the builder's chooser, off the Program tab),
            and the one door left is the first row, before the week it edits.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('program.buildRow')}
            onPress={onBuild}
            style={({ pressed }) => [styles.editDoor, pressed && styles.cardPressed]}
          >
            <View style={styles.cardHeadText}>
              <Text style={styles.editDoorTitle}>{t('program.buildRow')}</Text>
              <Text style={styles.dayMeta}>{t('program.buildSub')}</Text>
            </View>
            <Icon name="pencil" size={18} color={color.accent} strokeWidth={2} />
          </Pressable>
        </Arrive>

        {settled && workouts.length === 0 ? <Text style={styles.empty}>{t('program.emptyWeek')}</Text> : null}

        {workouts.map((w) => (
          <Pressable
            key={w.id}
            accessibilityRole="button"
            accessibilityLabel={w.name}
            onPress={() => onDay(w.id)}
            onLayout={(e) => onCardLayout(w.id, e)}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <View style={styles.cardHead}>
              <View style={styles.cardHeadText}>
                <Text style={styles.dayName}>{bidi(w.name)}</Text>
                <Text style={styles.dayMeta}>{t('program.dayMeta', { exercises: w.lifts, min: plannedMinutes(w.minutes) })}</Text>
              </View>
              {w.done ? (
                <View style={styles.doneChip}>
                  <Icon name="check" size={13} color={color.bg} />
                  <Text style={styles.doneChipText}>{t('program.doneChip')}</Text>
                </View>
              ) : (
                <Icon name="chevronRight" size={18} color={color.textMuted} />
              )}
            </View>
            {/*
              THE DAY, PERFORMED — the same hero Today carries, one per card (founder 2026-09-02).
              Only the next workout's clock runs (see `performingId`); the rest hold a mid-rep pose.
              ⚠️ ABOVE THE ROWS, NOT INSTEAD OF THEM — the ruling that placed Today's hero holds
              here word for word: this tab is the one screen that lists every load of her week
              (2026-08-26), and the figure says what a day IS while the rows say what it costs.
            */}
            <DayInMotion
              exerciseIds={w.rows.map((r) => r.exerciseId)}
              figure={figure}
              paused={motionPaused || w.id !== performingId}
              style={styles.dayMotion}
            />
            {w.rows.map((r) => (
              <View key={`${w.id}:${r.exerciseId}`} style={styles.liftRow}>
                {/* Two lines, not an ellipsis — "הרמת עקבים בישיבה עם מ…" cut the word that told
                    the machine variant apart from the standing one (eye-pass 2026-08-26). */}
                <Text style={styles.liftName} numberOfLines={2}>
                  {bidi(r.name)}
                </Text>
                {/* Columns, not a string — see `FigureCells` (design review 2026-09-01): a row
                    with no load kept its scheme in the scheme column instead of drifting it a
                    whole column sideways. */}
                <FigureCells
                  lift={{ load: r.load, sets: r.sets, band: r.band, ...(r.detail != null ? { detail: r.detail } : {}) } as PlanLift}
                  units={units}
                  bodyweightWord={t('workout.bodyweightShort')}
                />
              </View>
            ))}
          </Pressable>
        ))}

      </ScrollView>
    </View>
  );
}

export function ProgramTab({ navigation }: Props) {
  const { t } = useCopy();
  const app = useApp();
  const units = app.profile?.units ?? 'kg';
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [plan, setPlan] = useState<CoachPlan | null>(null);
  const [settled, setSettled] = useState(false);
  const [doneIds, setDoneIds] = useState<string[]>([]);
  /** The engine's receipt over her whole log — see the strip below the station note (2026-09-07). */
  const [receipt, setReceipt] = useState<EngineReceipt | null>(null);

  // Re-read on every focus: a swap declared on the pre-workout card, a workout finished, a week
  // rolled — all of it must be on this map the moment she comes back to it. The done marks are
  // derived exactly as Today derives them — trained sessions since the week opened — so the two
  // tabs can never disagree about which workout is behind her.
  useEffect(() => {
    if (!isFocused) return;
    let alive = true;
    void Promise.all([
      loadWeekPlan(),
      db.loadHistory().catch(() => []),
      db.loadWeekOpen().catch(() => null),
    ]).then(([p, history, weekOpenMs]) => {
      if (!alive) return;
      setPlan(p);
      setReceipt(engineReceipt(history));
      const since = weekOpenMs ?? 0;
      setDoneIds(
        history
          .filter((h) => Date.parse(h.startedAt) >= since && h.trained !== false)
          .map((h) => h.programDayId)
          .filter((id) => id.startsWith('coach_')),
      );
      setSettled(true);
    });
    return () => {
      alive = false;
    };
  }, [isFocused]);

  const workouts = useMemo(() => coachWeek(plan), [plan]);
  const viewWorkouts = useMemo(
    () =>
      workouts.map((w) => ({
        id: w.id,
        name: w.name,
        lifts: w.lifts,
        minutes: w.minutes,
        done: doneIds.includes(w.id),
        rows: coachPlanRows(coachRows(plan, w.id), units) ?? [],
      })),
    [workouts, plan, units, doneIds],
  );

  return (
    <ProgramTabView
      workouts={viewWorkouts}
      units={units}
      settled={settled}
      figure={app.profile?.sex === 'female' ? 'female' : 'male'}
      /* This tab lives in the tab navigator and stays MOUNTED behind the others — the same
         `useIsFocused` answer Today passes down, for the same rAF-does-not-care reason. */
      motionPaused={!isFocused}
      onDay={(workoutId) => navigation.navigate('PreWorkout', { workoutId })}
      onBuild={() => navigation.navigate('PlanBuilder')}
      receipt={receipt}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { paddingHorizontal: 30, paddingTop: 20, paddingBottom: 6 },
  // The surface title at 40 — the Progress page's own step (one below the letter's 56).
  title: { fontFamily: font.serif, fontSize: 40, lineHeight: 42, color: color.textPrimary, textAlign: 'left' },

  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 30,
    marginTop: 10,
    marginBottom: 4,
  },
  noteText: {
    flex: 1,
    fontFamily: font.sans,
    fontSize: textScale.base,
    lineHeight: 24,
    color: color.textMuted,
    textAlign: 'left',
  },
  /* The receipt (2026-09-07): a legend and one or two lines, in the same quiet ink as the note above. */
  /* The same 30-point inset the note above keeps — seen edge-to-edge on glass, 2026-09-08. */
  receipt: { gap: 6, marginHorizontal: 30, marginTop: 10, marginBottom: 14 },
  receiptLegend: { color: color.textMuted },
  receiptLine: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 24, color: color.textSecondary, textAlign: 'left' },

  empty: {
    fontFamily: font.sans,
    fontSize: textScale.base,
    lineHeight: 26,
    color: color.textMuted,
    textAlign: 'left',
    paddingHorizontal: 30,
    paddingTop: 26,
  },

  card: {
    marginHorizontal: 20,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.12)',
    backgroundColor: color.surface,
  },
  cardPressed: { backgroundColor: color.surface2 },
  // Today's `todayMotion` box, on a card: the parent owns the height or the Svg collapses to zero.
  dayMotion: { height: 132, marginTop: 4, marginBottom: 10, alignItems: 'center', justifyContent: 'center' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardHeadText: { flex: 1, gap: 3 },
  dayName: { fontFamily: font.serif, fontSize: 24, lineHeight: 28, color: color.textPrimary, textAlign: 'left' },
  dayMeta: {
    fontFamily: font.sans,
    fontSize: textScale.sm,
    lineHeight: 22,
    color: color.textMuted,
    textAlign: 'left',
  },
  doneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: color.up,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  doneChipText: { fontFamily: font.sans, fontSize: textScale.sm, color: color.bg, textAlign: 'left' },

  liftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 34,
  },
  liftName: {
    flex: 1,
    fontFamily: font.sans,
    fontSize: textScale.base,
    lineHeight: 24,
    color: color.textPrimary,
    textAlign: 'left',
  },
  // Numerals only — the mono never carries a word (monoCarriesNoWords), and never Hebrew.
  liftFigure: { fontFamily: font.mono, fontSize: textScale.base, lineHeight: 24, color: color.textSecondary, textAlign: 'right' },

  /* The edit door: a row in the accent's wash, first on the tab, dressed unlike the workout cards
     so it reads as the one ACTION above a list of days. */
  editDoor: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: color.accentWash,
  },
  editDoorTitle: { fontFamily: font.sansSemibold, fontSize: 20, lineHeight: 26, color: color.textPrimary, textAlign: 'left' },

});
