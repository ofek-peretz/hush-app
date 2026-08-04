/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WEEK SHE WALKS — a reflection, not a schedule.
 *
 * ⛔ FOUNDER, 2026-08-04, approving the drawn proposal, after asking the three questions that made
 * it: *"what happens if she didn't train on the day we said? what if she wants to train on a rest
 * day? and how does the system know which days she wants to train?"*
 *
 * His own answer had been to remove days entirely — N workouts in a row — because a calendar
 * becomes a to-do list. He was right about the symptom. The cause is that **a schedule is a promise
 * the athlete never made**, so every day it can be broken.
 *
 * Nothing here is assigned to her. The column draws two different kinds of thing, and draws them
 * differently:
 *
 *   · FACT        — a day she trained. The letter stands in moss, the row carries its record.
 *   · EXPECTATION — a day she usually trains, from `domain/trainingDays`. The letter is faint.
 *
 * Only the second kind can be wrong, and being wrong costs nothing: no red, no "missed", no
 * catch-up. If she stops training on Tuesdays, Tuesday stops being expected — the pattern was
 * wrong, and the pattern is the only thing that changes.
 *
 * ── ⚠️ AND WHEN IT DOES NOT KNOW HER YET ────────────────────────────────────────────────────────
 * `days` absent → the rows are NUMBERED (01, 02, 03…) and no rest rows are drawn. That is the
 * founder's own model, unchanged, and it is what week one looks like. **The week earns its days.**
 *
 * ── WHY A REST ROW HOLDS A HAIRLINE AND NOT THE WORD "REST" ─────────────────────────────────────
 * A word there is a label explaining an empty row, which is the one thing his copy law forbids
 * ("let the control speak"). The row is also not a locked door: tapping it queues the next session,
 * exactly like tapping any other row, because she is allowed to train whenever she likes and the
 * app has no opinion about it.
 *
 * Pure — every state is reachable from props alone, so the gallery can drive all of them. That is
 * not a nicety here: three of the five states below cannot be produced by a live session at all.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/Icon';
import { Legend } from '@/components/ds';
import { bidi } from '@/i18n/bidi';
import { useCopy } from '@/i18n/useCopy';
import * as haptics from '@/platform/haptics';
import { WEEK_ORDER } from '@/domain/trainingDays';
import type { Weekday } from '@/domain/coachPlan';
import { color, font, space, stage, tracking, trackingPx, signal, radius } from '@/design/tokens';

export interface WeekColumnWorkout {
  id: string;
  name: string;
  /** The weekday the COACH put it on, when it put it on one. */
  day?: string;
  /** Already trained this week — a record, not an offer. */
  done?: boolean;
}

export interface WeekColumnProps {
  workouts: WeekColumnWorkout[];
  /** The workout currently queued — the row that opens. */
  selectedId: string | null;
  /**
   * The weekdays she trains on, or absent while the pattern is still being earned.
   *
   * ⚠️ ABSENT IS A REAL STATE AND THE COMMONEST ONE for a new athlete — see the header. It is not
   * an error and it must never be filled in with a guess.
   */
  days?: Set<Weekday> | null;
  /** Today, as a weekday — so the row she is standing on can be marked. */
  today?: Weekday;
  onChoose: (id: string) => void;
  /** Drawn inside the open row: the lifts, the reason, whatever Home puts there. */
  children?: React.ReactNode;
  /** The change count for the open row's moss pill, and what opens the WHY surface. */
  changes?: number | null;
  onChanges?: () => void;
  /** One line under the open row's name — "5 lifts · ~58 min". */
  shape?: string | null;
  /** Frozen while a session is resumable: the queue is not hers to change mid-workout. */
  inert?: boolean;
}

/** What each row of the drawn column is. Exported so the law can assert the arrangement directly. */
export type WeekRow =
  | { kind: 'workout'; label: string; workout: WeekColumnWorkout; open: boolean }
  | { kind: 'empty'; label: string };

/**
 * The rows to draw, in the order she reads them. Pure, and the whole design decision.
 *
 * ⚠️ TWO ARRANGEMENTS, ONE COMPONENT. With a pattern the column IS the week — seven slots, Sunday
 * first, sessions dropped onto their days and the gaps left open. Without one it is simply the
 * coach's order, numbered. Anything that tried to be both at once would have to invent a weekday
 * for a session that has none, which is the guess this whole feature exists not to make.
 */
export function weekRows(
  workouts: WeekColumnWorkout[],
  days: Set<Weekday> | null | undefined,
  selectedId: string | null,
  weekdayLabel: (d: Weekday) => string,
): WeekRow[] {
  const open = (w: WeekColumnWorkout) => w.id === selectedId;

  if (!days || days.size === 0) {
    return workouts.map((w, i) => ({
      kind: 'workout' as const,
      // Two digits, so 01 and 10 occupy the same width and the names below them line up.
      label: String(i + 1).padStart(2, '0'),
      workout: w,
      open: open(w),
    }));
  }

  /*
   * A session lands on the weekday the COACH gave it. When the coach gave none — a hypertrophy week,
   * which is most weeks — the sessions fill her expected days in order, because "four sessions in
   * any order" is the same week and her own days are the best place to put them.
   */
  const placed = new Map<Weekday, WeekColumnWorkout>();
  const loose: WeekColumnWorkout[] = [];
  for (const w of workouts) {
    const d = w.day as Weekday | undefined;
    if (d && WEEK_ORDER.includes(d) && !placed.has(d)) placed.set(d, w);
    else loose.push(w);
  }
  for (const d of WEEK_ORDER) {
    if (loose.length === 0) break;
    if (days.has(d) && !placed.has(d)) placed.set(d, loose.shift()!);
  }
  /*
   * ⚠️ AND ANYTHING STILL LOOSE TAKES ANY FREE DAY. A week with more sessions than expected days
   * would otherwise DROP them — she would open the app and find a workout missing, which is far
   * worse than a session sitting on a day she does not usually train.
   */
  for (const d of WEEK_ORDER) {
    if (loose.length === 0) break;
    if (!placed.has(d)) placed.set(d, loose.shift()!);
  }

  return WEEK_ORDER.map((d) => {
    const w = placed.get(d);
    return w
      ? { kind: 'workout' as const, label: weekdayLabel(d), workout: w, open: open(w) }
      : { kind: 'empty' as const, label: weekdayLabel(d) };
  });
}

export function WeekColumn(props: WeekColumnProps) {
  const { t } = useCopy();
  const rows = React.useMemo(
    () => weekRows(props.workouts, props.days, props.selectedId, (d) => t(`weekday.${d}`).toUpperCase()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.workouts, props.days, props.selectedId, t],
  );

  return (
    <View style={styles.week}>
      {rows.map((row, i) => {
        if (row.kind === 'empty') {
          /*
           * A day with nothing on it. Not a control and not a message — a letter and a rule, which
           * is the smallest true statement the screen can make about a Wednesday.
           */
          return (
            <View key={`e${i}`} style={[styles.row, i > 0 && styles.ruled]} importantForAccessibility="no">
              <Text style={[styles.letter, styles.letterFaint]}>{row.label}</Text>
              <View style={styles.hairline} />
            </View>
          );
        }

        const w = row.workout;
        if (row.open) {
          return (
            <View key={w.id} style={styles.open}>
              <View style={styles.openHead}>
                <Text style={[styles.letter, styles.letterNow]}>{row.label}</Text>
                <Text style={styles.openName} numberOfLines={2}>{bidi(w.name)}</Text>
                {/*
                  ⛔ DONE OUTRANKS QUEUED (founder A.16, carried over from the chips): *"a completed
                  workout's chip stays white and reads like another workout still to do."* The open
                  row is the one place that can happen again — she taps a finished session to re-read
                  it and the row opens exactly as an offer does. The check is what keeps a record
                  from wearing an offer's clothes; the Begin button below is separately refused.
                */}
                {w.done ? <Icon name="check" size={17} color={signal[0]} strokeWidth={2.6} /> : null}
                {props.changes != null && props.changes > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('home.briefChanges', { count: props.changes })}
                    hitSlop={8}
                    onPress={props.onChanges}
                    style={({ pressed }) => [styles.pill, pressed && styles.dim]}
                  >
                    {/* ⚠️ SANS, NOT MONO — "3 CHANGES" is a translated SENTENCE, and IBM Plex Mono
                        cannot draw Hebrew at all. `monoCarriesNoWords` caught this the moment the
                        column landed, which is exactly what it is for. */}
                    <Legend size={12} track={0.08} weight="semibold" tone="accent">
                      {t('home.briefChangesShort', { count: props.changes })}
                    </Legend>
                  </Pressable>
                ) : null}
              </View>
              {props.shape ? <Text style={styles.openShape}>{props.shape}</Text> : null}
              {props.children}
            </View>
          );
        }

        const done = !!w.done;
        return (
          <Pressable
            key={w.id}
            accessibilityRole="button"
            accessibilityLabel={w.name}
            accessibilityState={{ selected: false, disabled: !!props.inert }}
            disabled={!!props.inert}
            onPress={() => {
              if (props.inert) return;
              haptics.tick();
              props.onChoose(w.id);
            }}
            style={({ pressed }) => [styles.row, i > 0 && styles.ruled, pressed && styles.dim]}
          >
            <Text style={[styles.letter, done ? styles.letterWas : styles.letterFaint]}>{row.label}</Text>
            <Text style={[styles.name, done && styles.nameDone]} numberOfLines={1}>{bidi(w.name)}</Text>
            {done ? <Icon name="check" size={15} color={signal[0]} strokeWidth={2.6} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/*
 * ⚠️ EVERY SIZE HERE IS A FLOOR THE FOUNDER SET, NOT A TASTE (2026-08-04): *"there must not be a lot
 * of copy and certainly not small type — everything has to be clear and precise. You have a tendency
 * to use small type that can barely be seen."* The day letter is 13 (it was drawn at 10 in the
 * proposal), the session name 16.5, and the open row's name 23.
 */
const styles = StyleSheet.create({
  week: { marginTop: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 13 },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  /*
   * ⛔ SANS, NOT MONO — and `monoCarriesNoWords` could not see this one.
   *
   * The label is `t('weekday.sun')`, which is "SUN" in English and **"א׳" in Hebrew**. IBM Plex Mono
   * has no Hebrew glyphs at all, so every Hebrew athlete's week was drawn in a silent system
   * fallback: the wrong face, in the gutter of the first screen she opens.
   *
   * ⚠️ THE LAW MISSED IT BECAUSE THE `t()` CALL IS IN A CALLBACK. It is a source reader and it
   * matches a `t(…)` sitting next to a mono style in the same JSX — here the string arrives through
   * `weekRows(…, weekdayLabel)`, one indirection away. It caught the identical line in `PlanWeek`
   * the moment that one was written inline, which is what sent me back to look at this one.
   */
  letter: {
    width: 40,
    fontFamily: font.sansMedium,
    fontSize: 13,
    letterSpacing: trackingPx(13, tracking.legend),
    color: stage.ink2,
    textAlign: 'left',
  },
  letterFaint: { opacity: 0.55 },
  letterWas: { color: signal[0], opacity: 1 },
  letterNow: { color: signal[0], opacity: 1 },
  hairline: { width: 26, height: StyleSheet.hairlineWidth * 2, backgroundColor: color.borderStrong },
  name: { flex: 1, fontFamily: font.sans, fontSize: 16.5, color: stage.ink1, textAlign: 'left' },
  nameDone: { color: stage.ink2 },

  /* TODAY RISES OFF THE STAGE — emphasis is distance from the ground, never a hue. */
  open: {
    marginVertical: space[2],
    marginHorizontal: -space[3],
    paddingHorizontal: space[3],
    paddingTop: space[4],
    paddingBottom: space[3],
    borderRadius: radius.lg,
    backgroundColor: stage[1],
  },
  openHead: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  openName: {
    flex: 1,
    fontFamily: font.serif,
    fontSize: 23,
    lineHeight: 27,
    color: stage.ink0,
    textAlign: 'left',
  },
  openShape: {
    marginTop: 7,
    marginStart: 40 + space[3],
    fontFamily: font.mono,
    fontSize: 12.5,
    letterSpacing: trackingPx(12.5, tracking.wide),
    textTransform: 'uppercase',
    color: stage.ink2,
    textAlign: 'left',
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(169,196,159,0.12)',
  },
  dim: { opacity: 0.6 },
});
