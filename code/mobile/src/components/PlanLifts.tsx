/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE LIFTS OF A WORKOUT — the table, and the only place it is written.
 *
 * ⛔ IT LEFT TODAY ON 2026-08-05. The founder: *"you cannot see that there are other workouts
 * besides the first one, because the rest are hidden in the scroll below."*
 *
 * The card was tall because it printed all six lifts, and that is what pushed workouts 02, 03 and
 * 04 under the fold — not the number of workouts. So the table moved to the screen she opens when
 * she has decided to train (`screens/plan/PreWorkout`), and Today became a week she can see in one
 * screen.
 *
 * ⚠️ IT IS A COMPONENT RATHER THAN A COPY, because the figure assembly below is the one place the
 * app decides how a prescription READS — "54 kg · 4×8–10" — and two of those would drift within a
 * week. The rows themselves are unchanged from the ones Home drew.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/Icon';
import { bidi } from '@/i18n/bidi';
import { useCopy } from '@/i18n/useCopy';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { color, font, textScale, directionTone, type LoadDirection } from '@/design/tokens';

/** One lift as the plan prints it. Shape unchanged from `HomeView`, which is where it used to live. */
export interface PlanLift {
  exerciseId: string;
  name: string;
  /**
   * THE RIGHT-HAND FIGURE, ALREADY WRITTEN — for work that is not reps at a load.
   *
   * The assembly below only knows how to say "40 kg · 3×8–12". A 400 m repeat and a 45-second plank
   * have no load and no band, and bending them into those fields would print "0 · 4×0–0". So the
   * shapes that cannot be said in this vocabulary arrive already said, from `coachWeek`.
   */
  detail?: string;
  /** kg; null = bodyweight (the row then says the reps carry the work, not a weight). */
  load: number | null;
  sets: number;
  /** HER BAND — `[Tlo, Thi]`. The prescription IS the band; printing Tlo alone prints the FLOOR. */
  band: [number, number];
  /** Which way the coach moved this lift's load; absent = it did not touch it. */
  changed?: LoadDirection;
  /** The figure has not landed yet — the row stands, the column waits. Never a claim of zero. */
  pending?: boolean;
}

export interface PlanLiftsProps {
  lifts: PlanLift[];
  units: 'kg' | 'lb';
  /** The form clip — the glyph opens it, and only the glyph. */
  onForm: (exerciseId: string) => void;
  /**
   * ⛔ THE ROW OPENS THE REASON (founder 2026-08-05): *"take off the explanation of why on each
   * exercise — pressing that exercise opens the WHY screen."*
   *
   * The delta chip stays, because `↑ 3.5` is a fact she reads in half a second and is the reason to
   * look at the row at all. The SENTENCE behind it is what the row opens — the same sheet the
   * Mirror opens, so one explanation has three doors and no second author.
   */
  onWhy?: (exerciseId: string) => void;
}

export function PlanLifts({ lifts, units, onForm, onWhy }: PlanLiftsProps) {
  const { t } = useCopy();
  return (
    <View style={styles.plan}>
      {lifts.map((lift, i) => (
        <Pressable
          key={`${lift.exerciseId}_${i}`}
          accessibilityRole="button"
          accessibilityLabel={lift.pending ? lift.name : `${lift.name} · ${planFigureLabel(lift, units)}`}
          accessibilityHint={lift.changed && onWhy ? t('weekly.whyLink') : undefined}
          onPress={() => (lift.changed && onWhy ? onWhy(lift.exerciseId) : onForm(lift.exerciseId))}
          style={({ pressed }) => [
            styles.planRow,
            // The table is CLOSED — the last row carries the bottom rule, so the plan reads as a
            // block of facts rather than a list that trails off.
            i === lifts.length - 1 && styles.planRowLast,
            pressed && styles.pressedDim,
          ]}
        >
          <View style={styles.planLeft}>
            {/* The clip is its own target: the glyph opens the video, the rest of the row opens the
                reason. Two doors on one row, which is the pattern Today already used. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('workout.form')}
              hitSlop={10}
              onPress={() => onForm(lift.exerciseId)}
            >
              <Icon name="playCircle" size={17} color={color.textMuted} strokeWidth={1.5} />
            </Pressable>
            {/* THE NAME WRAPS, IT DOES NOT TRUNCATE (founder A.15). An ellipsis hides the one word
                that distinguishes two lifts of the same family. */}
            <Text style={styles.planName}>{bidi(lift.name)}</Text>
            {lift.changed && lift.changed !== 'hold' ? (
              <View style={[styles.delta, { borderColor: directionTone(lift.changed) }]}>
                <Text style={[styles.deltaText, { color: directionTone(lift.changed) }]}>
                  {lift.changed === 'up' ? '↑' : '↓'}
                </Text>
              </View>
            ) : null}
          </View>
          {lift.pending ? null : (
            <Text style={styles.planFigure} numberOfLines={1}>
              <Text
                style={[
                  lift.changed ? styles.figureChanged : styles.figureQuiet,
                  lift.changed ? { color: directionTone(lift.changed) } : null,
                ]}
              >
                {figureLoad(lift, units)}
              </Text>
              <Text style={[styles.figureMeta, styles.figureUnit]}>{figureUnit(lift, units)}</Text>
              <Text style={[styles.figureMeta, lift.changed ? styles.figureScheme : styles.figureQuiet]}>
                {figureScheme(lift)}
              </Text>
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

/* ───────────────────────────────────────────────────────── the figure, assembled in one place */

/** The load, formatted for display — "41", "" for bodyweight. */
export function figureLoad(lift: PlanLift, units: 'kg' | 'lb'): string {
  // A pre-written figure carries its own numbers; a load column beside it would print twice.
  if (lift.detail != null) return '';
  if (lift.load == null) return '';
  const w = displayWeight(lift.load, units);
  return w == null ? '' : String(+w.toFixed(2));
}

/**
 * The unit, in shadow beside the load — " kg" / " lb", and nothing for a bodyweight lift.
 *
 * ⚠️ IT IS BACK (founder 2026-07-29: "the unit is missing"). v7 took it off on the argument that a
 * column of loads in one declared unit does not need it six times — overturned on the device, and
 * he is right for a reason the argument missed: every row already ends in a scheme ("· 4×8–10"), so
 * the number was never alone in a bare column. Muted, so the LOAD is still the only lit thing.
 */
export function figureUnit(lift: PlanLift, units: 'kg' | 'lb'): string {
  if (lift.detail != null) return '';
  return lift.load == null ? '' : ` ${unitLabel(units)}`;
}

/** The scheme, tight, with an EN-dash range: " · 4×8–10" (leading separator when a load precedes). */
export function figureScheme(lift: PlanLift): string {
  if (lift.detail != null) return lift.detail;
  const [lo, hi] = lift.band;
  const scheme = `${lift.sets}×${hi > lo ? `${lo}–${hi}` : lo}`;
  return lift.load == null ? scheme : ` · ${scheme}`;
}

/** The whole right-hand figure as one string, for the row's accessibility label. */
export function planFigureLabel(lift: PlanLift, units: 'kg' | 'lb'): string {
  const load = figureLoad(lift, units);
  return load ? `${load}${figureUnit(lift, units)}${figureScheme(lift)}` : figureScheme(lift);
}

const styles = StyleSheet.create({
  plan: { marginTop: 2 },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 54,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,229,0.10)',
  },
  planRowLast: { borderBottomWidth: 1, borderBottomColor: 'rgba(241,238,229,0.10)' },
  planLeft: { flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9 },
  planName: { flexShrink: 1, minWidth: 0, fontFamily: font.sansMedium, fontSize: textScale.md, lineHeight: 21, color: color.textPrimary, textAlign: 'left' },
  planFigure: { flexGrow: 0, flexShrink: 0, fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: 17, textAlign: 'right' },
  figureQuiet: { color: color.textSecondary, fontFamily: font.mono }, // rtl-ok: nested span, inherits end-alignment from planFigure
  figureMeta: { fontSize: 13.5 },
  figureUnit: { color: color.textMuted, fontFamily: font.mono }, // rtl-ok: nested span, inherits end-alignment from planFigure
  figureChanged: { fontFamily: font.monoMedium }, // rtl-ok: nested span, inherits end-alignment from planFigure
  figureScheme: { color: color.textMuted, fontFamily: font.mono }, // rtl-ok: nested span, inherits end-alignment from planFigure
  /* The delta — an arrow in the direction's own tone, no number. The figure beside it carries the
     new load, and printing the delta as well would state the same move twice. */
  delta: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 99, borderWidth: 1 },
  deltaText: { fontFamily: font.monoSemibold, fontSize: 13, textAlign: 'center' },
  pressedDim: { opacity: 0.6 },
});
