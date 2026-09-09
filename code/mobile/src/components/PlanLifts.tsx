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

// 

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/Icon';
import { bidi, rtl } from '@/i18n/bidi';
import { useCopy } from '@/i18n/useCopy';
import { displayWeight, unitLabel } from '@/domain/schedule';
import { color, font, radius, textScale, directionTone, type LoadDirection } from '@/design/tokens';
import { MotionThumb } from '@/motion/render/MotionThumb';
import { ReorderRows } from '@/components/ReorderRows';

import { exerciseMotion } from '@/motion/registry';
import type { FigureSex } from '@/motion/types';

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
  /**
   * ⛔ WHOSE BODY THE STILL IS DRAWN ON, AND IT IS REQUIRED (founder 2026-08-23, on the build
   * screen): *"אם אני בוחר את הגוף הגברי, באנימציה זה מציג את הגוף הנשי."* `MotionThumb` has no
   * default worth having here — an optional prop is how a man ends up looking at a woman's figure
   * on every row of his own week, silently, the way he already caught once.
   */
  figure: FigureSex;
  /** The form clip — the STILL opens it, and only the still. */
  onForm: (exerciseId: string) => void;
  /**
   * ⛔ THE ROW OPENS THE REASON (founder 2026-08-05): *"take off the explanation of why on each
   * exercise — pressing that exercise opens the WHY screen."*
   *
   * The delta chip stays, because `↑ 3.5` is a fact she reads in half a second and is the reason to
   * look at the row at all. The SENTENCE behind it is what the row opens — the same sheet the
   * Mirror opens, so one explanation has three doors and no second author.
   *
   * ⛔ AND IT IS ASKED FOR EVERY ROW NOW, NOT ONLY A CHANGED ONE (founder 2026-08-11).
   *
   * This read `lift.changed && onWhy ? onWhy(id) : onForm(id)`. A change needs two programmes to
   * compare, so in her FIRST week nothing has changed — and the door to the one thing this product
   * claims to do differently was shut on every row she had. She met the engine at its most
   * assertive and least explicable, on the screen she opens with her bag on her shoulder.
   *
   * The row now always asks, and the CALLER decides which answer exists: the load's case when the
   * engine moved it, the placement (`domain/whyLiftIsHere`) when it merely put it there, and the
   * form clip when neither does. This component stays what it was — a table that reports facts —
   * and does not learn which kinds of explanation the product has.
   */
  onWhy?: (exerciseId: string) => void;
  /**
   * ⛔ "GIVE ME THIS ONE INSTEAD" — the swap, off the gym floor (founder 2026-08-22).
   *
   * Absent on every surface that only REPORTS a week (the finished-day preview, the harness's
   * read-only mounts). Present on the pre-workout card, which is the one screen where she is
   * deciding whether the day in front of her is the day she wants.
   *
   * ⚠️ IT IS THE SAME VERB AS THE RACK, deliberately: `swapChoices`, same-muscle synonyms, one to
   * three rows and never padded. The gym-floor swap declares nothing and is learned at K=2; this
   * one is a DECLARATION, because she named both sides with time to think. Two different kinds of
   * fact, one pool, one sheet — see `db.OwnedPreferences.declaredSubs`.
   */
  onSwap?: (exerciseId: string) => void;
  /**
   * ⛔ THE ROWS CAN BE DRAGGED INTO A NEW ORDER (founder 2026-09-07): *"אפשר לגרור ולשנות את סדר
   * התרגילים."* Present ⇒ every row grows a grip at its end and reports `(from, to)` on a drop;
   * absent (a finished day, a fixture) ⇒ the table is exactly what it was. `onDragging` lets the
   * host freeze the scroll it sits in while a row is in the air — see `ReorderRows`.
   */
  onReorder?: (from: number, to: number) => void;
  onDragging?: (dragging: boolean) => void;
}

export function PlanLifts({ lifts, units, figure, onForm, onWhy, onSwap, onReorder, onDragging }: PlanLiftsProps) {
  const { t } = useCopy();
  const rows = lifts.map((lift, i) => (grip: React.ReactNode = null, lifted = false) => (
        <Pressable
          key={`${lift.exerciseId}_${i}`}
          accessibilityRole="button"
          accessibilityLabel={lift.pending ? lift.name : `${lift.name} · ${planFigureLabel(lift, units)}`}
          accessibilityHint={onWhy ? t('weekly.whyLink') : undefined}
          onPress={() => (onWhy ? onWhy(lift.exerciseId) : onForm(lift.exerciseId))}
          style={({ pressed }) => [
            styles.planRow,
            // The table is CLOSED — the last row carries the bottom rule, so the plan reads as a
            // block of facts rather than a list that trails off.
            i === lifts.length - 1 && styles.planRowLast,
            pressed && styles.pressedDim,
            lifted && styles.planRowLifted,
          ]}
        >
          {/*
            ════════════════════════════════════════════════════════════════════════════════════
            ⛔ THE NAME GETS ITS OWN LINE (2026-08-27) — IT WAS BREAKING ONE WORD PER LINE.

            On the pre-workout sheet the rows read:

                ⊙   לחיצת          (↑)  57.5  kg  ·  4×8–10   ⇄
                    חזה
                    במוט

            Three words, three lines. Not a wrap — a collapse. The row asked seven things to share
            330 points: a clip door, the name, a direction chip, the load, its unit, the scheme and
            a swap door. `planLeft` was the only child that could give, so the NAME paid for all six
            of the others.

            ⚠️ IT WAS NOT FIXABLE BY TUNING, and that is why this is a restructure. Measured:
            `לחיצת חזה במוט` at 22 is ~154, `57.5 kg · 4×8–10` at 19 mono is ~182, the three
            controls ~76, the gaps ~40 — 452 points of content in a 330-point row. `Barbell Bench
            Press` is worse. No size, gap or shrink budget closes a 122-point deficit; something had
            to leave the line, and on a sheet with six rows and a whole screen the thing to spend is
            VERTICAL space, not the name.

            So: the name takes line one at full width with a door at each end, and the prescription
            takes line two on the end edge — where it forms a column down the sheet, which it never
            could while every row started it at a different place.

            ⚠️ Founder A.15 still holds and is better served: *the name wraps, it does not truncate.*
            It now has ~250 points to wrap INTO, so in both locales it stops needing to.
            ════════════════════════════════════════════════════════════════════════════════════
          */}
          <View style={styles.planHead}>
            {/* The clip is its own target: the glyph opens the video, the rest of the row opens the
                reason. Two doors on one row, which is the pattern Today already used.

                ⛔ AND THE SMALLER DOOR WAS 37pt. `hitSlop={10}` around a 17pt glyph is 37 × 37 —
                under the 44 a finger needs, on every row of the lift table, on the screen she opens
                with her bag on her shoulder. The row around it is 68 tall, so the miss did not land
                nowhere: it opened the WHY sheet instead of the form clip. 14 makes it 45. */}
            {/*
              ⛔ THE EXERCISE ITSELF, NOT A ▶ (founder 2026-08-29): *"יש סימן של play בסרטון. אני
              רוצה שתציג את התמונה בדיוק כמו במסך תוכנית האימון."*

              A play circle is the same 17 points on every row of the table — it says "there is a
              video here" and nothing whatever about WHICH lift the row is. The builder has drawn
              the lift's own still beside its name since it was written, and the still answers the
              question the glyph was standing in for: *what is this exercise?* — before she has
              opened anything.

              ⚠️ IT IS STILL THE SAME DOOR, and the hit target grew rather than shrank: 44 points of
              still with 8 of slop is 60, against the 45 the glyph reached with 14. The note below
              on 37-point targets is what that number is answering.

              ⚠️ AND `MotionThumb` RETURNS NULL FOR ANYTHING WITH NO RIG — a movement, a run. All 136
              catalogue lifts have one (`everyLiftLearnsToMove`), but this table also renders what a
              coach's week carries, so the glyph stays as the fallback rather than leaving a row
              with no door at all.
            */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('workout.form')}
              hitSlop={8}
              onPress={() => onForm(lift.exerciseId)}
            >
              {/* 44 → 56 (design review 2026-09-01): the clip floor. Below it a press or a hinge is
                  a smudge, and this thumb is a DOOR to the film — it has to say what is behind it. */}
              {exerciseMotion(lift.exerciseId) ? (
                <MotionThumb exerciseId={lift.exerciseId} size={56} figure={figure} style={styles.planThumb} />
              ) : (
                <Icon name="playCircle" size={17} color={color.textMuted} strokeWidth={1.5} />
              )}
            </Pressable>
            {/* THE NAME WRAPS, IT DOES NOT TRUNCATE (founder A.15). An ellipsis hides the one word
                that distinguishes two lifts of the same family. */}
            <Text style={styles.planName}>{bidi(lift.name)}</Text>
            {/*
              ⛔ THE THIRD DOOR (2026-08-22). The clip opens the video, the row opens the reason, and
              this replaces the lift. It rides the END of the NAME's line now rather than the end of
              the figure's — the two doors bracket the thing they both act on, and neither of them
              is standing in the prescription's way any more.

              ⚠️ SAME 14 OF HIT-SLOP AS THE CLIP, for the reason recorded there: a 17pt glyph with 10
              makes a 37-point target, and a finger that misses this one does not miss nothing — it
              opens the WHY sheet underneath.
            */}
            {onSwap ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('swap.title')}
                hitSlop={14}
                onPress={() => onSwap(lift.exerciseId)}
              >
                <Icon name="swap" size={17} color={color.textMuted} strokeWidth={1.6} />
              </Pressable>
            ) : null}
            {grip}
          </View>

          {/* The prescription, on the end edge — one column down the whole sheet. */}
          {lift.pending ? null : (
            <View style={styles.planFigures}>
              {lift.changed && lift.changed !== 'hold' ? (
                <View style={[styles.delta, { borderColor: directionTone(lift.changed) }]}>
                  <Text style={[styles.deltaText, { color: directionTone(lift.changed) }]}>
                    {lift.changed === 'up' ? '↑' : '↓'}
                  </Text>
                </View>
              ) : null}
              {/* ⛔ COLUMNS, NOT A STRING — see `FigureCells`. The single end-aligned string put
                  `kg` at a different x on every row and let a bodyweight row's scheme drift a
                  whole column sideways. */}
              <FigureCells
                lift={lift}
                units={units}
                loadSize={19}
                metaSize={17}
                changedColor={lift.changed ? directionTone(lift.changed) : null}
                bodyweightWord={t('workout.bodyweightShort')}
              />
            </View>
          )}
        </Pressable>
  ));
  if (onReorder) {
    return (
      <ReorderRows
        style={styles.plan}
        items={lifts.map((l, i) => ({ key: `${l.exerciseId}_${i}`, movable: true }))}
        onMove={onReorder}
        {...(onDragging ? { onDragging } : {})}
        gripColor={color.textMuted}
        gripLabel={t('program.reorderGrip')}
        renderItem={(_item, i, grip, lifted) => rows[i](grip, lifted)}
      />
    );
  }
  return <View style={styles.plan}>{rows.map((row) => row())}</View>;
}

/* ───────────────────────────────────────────────────────── the figure, assembled in one place */

/**
 * ════ ⛔ THE FIGURE IS A TABLE OF THREE COLUMNS, NOT A STRING (design review 2026-09-01) ════
 *
 * Every list that prints a prescription assembled it as ONE end-aligned string — so "kg" landed
 * wherever the load's digit count left it (four different x-positions in five rows on Today), and
 * a row with no load lost the whole load column, kicking its scheme ~80 points sideways on the
 * Program tab. A measured column is the product's own grammar (tabular-nums exists on every
 * figure); this finishes the job at the ROW level: load right-aligned into a fixed cell, the unit
 * in its own fixed cell, the scheme in a third — so every row's `kg` and every row's `3×8–10`
 * stand in one column, with or without a load.
 *
 * `direction:'ltr'` on the row: a measurement reads left-to-right in both locales, exactly like
 * the week meter's timeline. A bodyweight lift prints the WORD for body in the load cell — in the
 * sans (mono has no Hebrew; `monoCarriesNoWords`), muted, so the column never has a hole in it.
 */
export function FigureCells({
  lift,
  units,
  scheme = true,
  loadSize = textScale.base,
  metaSize = textScale.base,
  changedColor,
  bodyweightWord,
}: {
  lift: PlanLift;
  units: 'kg' | 'lb';
  /** Today's card deliberately prints no scheme (2026-08-27) — it passes false. */
  scheme?: boolean;
  loadSize?: number;
  metaSize?: number;
  /** The lit direction tone for a moved load — colours the load cell only. */
  changedColor?: string | null;
  /** Localized word for a bodyweight lift's load cell ("גוף" / "body"). Empty → cell stays blank. */
  bodyweightWord?: string;
}) {
  // A pre-written figure (a coach item's own string) spans the table — it is not a prescription.
  if (lift.detail != null) {
    return (
      <Text style={[cellStyles.detail, { fontSize: metaSize }]} numberOfLines={1}>
        {lift.detail}
      </Text>
    );
  }
  const load = figureLoad(lift, units);
  const [lo, hi] = lift.band;
  const schemeStr = `${lift.sets}×${hi > lo ? `${lo}–${hi}` : lo}`;
  /*
   * ⚠️ THE LTR ISLAND IS BUILT BY HAND (found rebuilding this, 2026-09-01). Neither escape hatch
   * survives both platforms: RN flips `textAlign` by I18nManager globally (a parent's direction
   * does not shield it), and react-native-web IGNORES the `direction` style outright — the same
   * row rendered mirrored on one platform and not the other. So the island uses the one mechanism
   * that is identical everywhere: the app's own `bidi.rtl` latch, reversing the row and the cell
   * alignments explicitly. A measurement reads value → unit → scheme, left to right, in BOTH
   * locales — the exact run the old bidi string produced.
   */
  const rowDir = { flexDirection: rtl ? ('row-reverse' as const) : ('row' as const) };
  const toUnit = { alignItems: rtl ? ('flex-start' as const) : ('flex-end' as const) };
  const fromUnit = { alignItems: rtl ? ('flex-end' as const) : ('flex-start' as const) };
  return (
    <View style={[cellStyles.row, rowDir]}>
      <View style={[cellStyles.loadCell, toUnit]}>
        {load ? (
          <Text
            style={[cellStyles.load, { fontSize: loadSize }, changedColor ? { color: changedColor, fontFamily: font.monoMedium } : null]} // rtl-ok: alignment lives on the flex cell (see the render note)
            numberOfLines={1}
          >
            {load}
          </Text>
        ) : (
          <Text style={[cellStyles.loadWord, { fontSize: metaSize }]} numberOfLines={1}>
            {bodyweightWord ?? ''}
          </Text>
        )}
      </View>
      <View style={[cellStyles.unitCell, fromUnit]}>
        <Text style={[cellStyles.unit, { fontSize: metaSize }]} numberOfLines={1}>
          {load ? unitLabel(units) : ''}
        </Text>
      </View>
      {scheme ? (
        <View style={[cellStyles.schemeCell, fromUnit]}>
          <Text style={[cellStyles.scheme, { fontSize: metaSize }]} numberOfLines={1}>
            {schemeStr}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/* The cells' geometry — ONE set of widths, so every consumer's columns agree. */
const cellStyles = StyleSheet.create({
  /* Direction is applied AT RENDER off `bidi.rtl` — see the island note in the component. */
  row: { alignItems: 'baseline', columnGap: 5 },
  /* Fixed cells; digits pull to the unit's edge by FLEX, aligned at render. */
  loadCell: { minWidth: 48 },
  unitCell: { width: 30 },
  schemeCell: { minWidth: 64 },
  load: {
    fontFamily: font.mono,
    fontVariant: ['tabular-nums'],
    color: color.textPrimary,
    textAlign: 'center', // rtl-ok: content-sized inside a flex-aligned cell; alignment lives on the cell
  },
  loadWord: {
    fontFamily: font.sans,
    color: color.textMuted,
    textAlign: 'center', // rtl-ok: content-sized inside a flex-aligned cell
  },
  unit: {
    fontFamily: font.mono,
    color: color.textMuted,
    textAlign: 'center', // rtl-ok: content-sized inside a flex-aligned cell
  },
  scheme: {
    fontFamily: font.mono,
    fontVariant: ['tabular-nums'],
    color: color.textMuted,
    textAlign: 'center', // rtl-ok: content-sized inside a flex-aligned cell
  },
  detail: { fontFamily: font.mono, fontVariant: ['tabular-nums'], color: color.textSecondary, textAlign: 'left' },
});

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
  /* ⛔ A COLUMN OF TWO LINES, NOT A ROW OF SEVEN THINGS — see the note at the markup. `planRight`
     is deleted with the single-line layout it existed to hold together. */
  planRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 4,
    minHeight: 68,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,229,0.10)',
  },
  /* Line one: the name, bracketed by the two doors that act on it. */
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  /* The builder's own still, at the builder's own radius and ground — one treatment for "here is
     the exercise" wherever a plan lists one. */
  planThumb: { borderRadius: radius.md, backgroundColor: color.surface2, overflow: 'hidden' },
  /* Line two: the direction and the prescription, as one group on the END edge, so the figures
     form a column down the sheet. Held together rather than flung apart — a chip at one margin and
     a figure at the other is the "5 ··· 250 points of black ··· min" fault `WellDone.Fact` has a
     docblock about. */
  planFigures: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  planRowLast: { borderBottomWidth: 1, borderBottomColor: 'rgba(241,238,229,0.10)' },
  /* In the air: the row takes a raised ground so it reads as lifted off the table, not slid along it. */
  planRowLifted: { backgroundColor: color.surface2, borderRadius: radius.md, borderTopColor: 'transparent' },
  planLeft: { flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  /* ⛔ 17 → 22 (founder, 2026-08-12: *"תציג את התוכנית … ותעצב את זה בגדול וברור"*). With the
     per-muscle allocation off the sheet above it, the LIFTS are the sheet — and they were set at
     the size of the caption that used to label the bars. */
  planName: { flex: 1, minWidth: 0, fontFamily: font.sansMedium, fontSize: 22, lineHeight: 28, color: color.textPrimary, textAlign: 'left' },
  planFigure: { flexGrow: 0, flexShrink: 0, fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: 19, textAlign: 'right' },
  figureQuiet: { color: color.textSecondary, fontFamily: font.mono }, // rtl-ok: nested span, inherits end-alignment from planFigure
  figureMeta: { fontSize: 17 },
  figureUnit: { color: color.textMuted, fontFamily: font.mono }, // rtl-ok: nested span, inherits end-alignment from planFigure
  figureChanged: { fontFamily: font.monoMedium }, // rtl-ok: nested span, inherits end-alignment from planFigure
  figureScheme: { color: color.textMuted, fontFamily: font.mono }, // rtl-ok: nested span, inherits end-alignment from planFigure
  /* The delta — an arrow in the direction's own tone, no number. The figure beside it carries the
     new load, and printing the delta as well would state the same move twice. */
  delta: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 99, borderWidth: 1 },
  deltaText: { fontFamily: font.monoSemibold, fontSize: 17, textAlign: 'center' },
  /* ⛔ A PRESS IS A WASH, NEVER A FADE (founder A.13). This was `opacity: 0.6` — touching a lift
     dimmed its own name and load to the strength of a disabled row. The wash sits UNDER the row and
     the figures never move. */
  pressedDim: { backgroundColor: 'rgba(241,238,229,0.06)' },
});
