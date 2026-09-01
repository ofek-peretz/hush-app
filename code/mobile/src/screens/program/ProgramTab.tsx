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

import React, { useEffect, useMemo, useState } from 'react';
import { plannedMinutes } from '@/domain/duration';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
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
import { bidi } from '@/i18n/bidi';
import type { MainParamList, HomeTabsParamList } from '@/app/navigation';

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
  onDay: (workoutId: string) => void;
  onLibrary: () => void;
  onBuild: () => void;
}

export function ProgramTabView({ workouts, units, settled, onDay, onLibrary, onBuild }: ProgramTabViewProps) {
  const { t } = useCopy();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 28 }} showsVerticalScrollIndicator={false}>
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
        </Arrive>

        {settled && workouts.length === 0 ? <Text style={styles.empty}>{t('program.emptyWeek')}</Text> : null}

        {workouts.map((w) => (
          <Pressable
            key={w.id}
            accessibilityRole="button"
            accessibilityLabel={w.name}
            onPress={() => onDay(w.id)}
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

        {/* ⛔ DOORS, NOT WORKOUTS (design review 2026-09-01). The two action cards below shared
            the workout cards' exact dress, so the list read as six peers — four sessions and two
            impostors. A small accent legend parts the content from its actions; the doors keep
            their chevrons, which the workout cards do not carry. */}
        <Legend tone="accent" style={styles.doorsLegend}>{t('program.doorsLegend')}</Legend>
        {/* THE BUILDER'S DOOR (founder 2026-08-25): full authorship of the week. This tab's
            doctrine holds — the verb routes to the surface that owns it. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('program.buildRow')}
          onPress={onBuild}
          style={({ pressed }) => [styles.card, styles.libraryRow, pressed && styles.cardPressed]}
        >
          <View style={styles.cardHeadText}>
            <Text style={styles.dayName}>{t('program.buildRow')}</Text>
            <Text style={styles.dayMeta}>{t('program.buildSub')}</Text>
          </View>
          <Icon name="chevronRight" size={18} color={color.textMuted} />
        </Pressable>

        {/* The library — where "which exercises are mine" is declared (S-77 / refusals / picks). */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('program.libraryRow')}
          onPress={onLibrary}
          style={({ pressed }) => [styles.card, styles.libraryRow, pressed && styles.cardPressed]}
        >
          <View style={styles.cardHeadText}>
            <Text style={styles.dayName}>{t('program.libraryRow')}</Text>
            <Text style={styles.dayMeta}>{t('program.librarySub')}</Text>
          </View>
          <Icon name="chevronRight" size={18} color={color.textMuted} />
        </Pressable>
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
      onDay={(workoutId) => navigation.navigate('PreWorkout', { workoutId })}
      onLibrary={() => navigation.navigate('ExerciseLibrary')}
      onBuild={() => navigation.navigate('PlanBuilder')}
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

  libraryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  doorsLegend: { marginTop: 14, marginBottom: 2 },
});
