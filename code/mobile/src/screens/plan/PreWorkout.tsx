/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE PRE-WORKOUT SCREEN — what she reads with her bag on her shoulder.
 *
 * ⛔ FOUNDER, 2026-08-05, correcting the week board I had drawn:
 *
 *   > *"Why not make it so that pressing a day with a workout opens a full-screen card with the
 *   > workout's content and the AI's requirements for each exercise — not technique, but the
 *   > professional requirements: the reps, the weights, or updates where it raised or lowered the
 *   > weight on a particular exercise. And below it the exercise list with the option to watch the
 *   > video exactly as today, and then pressing that starts the workout."*
 *
 * This is better than what I proposed, and it resolves something I had left unsolved: **where the
 * lift list goes when it leaves Today.** It goes here — and it arrives with the thing it was always
 * missing. The coach's reasoning existed only on Saturday, in the Mirror, days after it could have
 * been useful. Here it is in her hand while she is deciding whether to go.
 *
 * ── WHAT HE THEN TOOK OFF IT ────────────────────────────────────────────────────────────────────
 *   > *"Remove the explanation of why on each exercise — pressing that exercise opens the WHY
 *   > screen. And the sentence at the top, I suggest removing it: nobody reads that before a
 *   > workout."*
 *
 * Both right, and the second is his own law returning to me: a label that explains a control steals
 * the control's job. The paragraph was me explaining the list underneath it. The list can speak.
 *
 * The delta chip stays. `↑` is a fact she reads in half a second and is the reason to look at the
 * row at all; the sentence behind it is what the row opens.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

// 

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, Legend, Stage } from '@/components/ds';
import { PlanLifts, type PlanLift } from '@/components/PlanLifts';
import { muscleOf } from '@/data/exercises';
import { bidi } from '@/i18n/bidi';
import { useCopy } from '@/i18n/useCopy';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, font, motion, space, stage, signal } from '@/design/tokens';

export interface PreWorkoutProps {
  /** The workout's own name — the coach's, in her language. */
  name: string;
  /** The weekday it sits on, already spoken ("Monday"), or absent on a week with no days yet. */
  dayLabel?: string | null;
  /** "6 lifts · ~50 min", assembled by the caller exactly as Today used to. */
  shape?: string | null;
  lifts: PlanLift[];
  units: 'kg' | 'lb';
  /**
   * ⛔ HOW MANY OF *THESE* LIFTS MOVED — and it is a FACT, not a door (audit, 2026-08-05).
   *
   * The first cut made it a button into the Mirror, which re-opened the bug I had spent the morning
   * fixing on the other two screens: the pill would say "2 changes" about this workout and land her
   * on a letter saying "5 changes" about the week. **Two screens, two answers, one word.**
   *
   * The ROWS are the doors — each changed lift opens its own reason — so the pill has nothing to
   * hide behind it and no reason to be pressable. It states what the list beneath it shows.
   */
  changes?: number | null;
  /** Minutes of work whose duration is KNOWN — the third figure. Absent → it is not drawn, which is
   *  what a session carrying a distance must do (there is no pace to price it with). */
  minutes?: number | null;
  /**
   * ⛔ WHAT THE ENGINE COULD NOT DO, IN WORDS (founder 2026-08-12) — the S-3 sentence, both halves.
   *
   * A day may come out OVER her minutes (every trained muscle down to its last lift, nothing legal
   * left to cut) or UNDER them (the map she drew does not contain enough work to fill her hour — a
   * one-muscle map gives 25-minute sessions and no arrangement can do better). Both are correct
   * weeks that are not the week she thinks she asked for, and the register says the engine "says so
   * rather than quietly" doing it. Until now it only said so to telemetry.
   *
   * ⚠️ ONE QUIET LINE, NOT A WARNING. It is a fact about her own inputs with a remedy she owns —
   * more minutes, or a muscle back on — so it reads as information, not as an error she caused.
   */
  budgetNote?: string | null;
  onForm: (exerciseId: string) => void;
  onWhy?: (exerciseId: string) => void;
  onStart: () => void;
  onClose: () => void;
  /**
   * ⚠️ ALREADY TRAINED — a record, not an offer (founder 2026-07-11). She may open a finished
   * session to re-read it; she may not start it again, and the button is what says so.
   */
  done?: boolean;
  /** Gated by the trial: the plan is still hers to read, the act is not. */
  locked?: boolean;
}

/*
 * ⛔ `WorkBar` AND `muscleWork` ARE DELETED WITH THE BLOCK THEY DREW (founder, 2026-08-12) — the
 * per-muscle allocation. An animated component with no caller is the kind of thing that gets
 * "reused" a year later for something it was never about.
 */

/** One of the three figures across the top of the sheet — a mono number over its tracked label. */
function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureValue}>{value}</Text>
      <Legend size={17} track={0.2}>{label}</Legend>
    </View>
  );
}

export function PreWorkoutView(props: PreWorkoutProps) {
  const { t } = useCopy();
  const changed = props.changes != null && props.changes > 0;
  const totalSets = React.useMemo(() => props.lifts.reduce((n, l) => n + (l.sets || 0), 0), [props.lifts]);
  /*
   * The session's work, per muscle, heaviest first. `muscleOf` is the catalogue's own answer, and
   * the set counts are the assembler's — so this block cannot disagree with the table below it.
   */

  return (
    <View style={styles.root}>
      <Stage />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/*
          ⛔ THE GRABBER — the other half of the founder's question (2026-08-12).

          He asked whether the CARD looks like it opens a sheet. The card now carries a chevron; this
          is what meets it at the other end. A bar at the top of a rising surface is the one mark
          that says *"this came up from the bottom and goes back down"* — and it says it about the
          gesture, which is the part a chevron cannot promise.

          ⚠️ DRAWN RATHER THAN ASKED FOR. `presentation: 'modal'` gives the rise and the drag on iOS
          but no grabber; `sheetGrabberVisible` belongs to `formSheet`, which brings detents and its
          own iPad behaviour with it. Six points of cream costs none of that and is identical on
          Android and in the harness, where every review of this screen actually happens.

          ⚠️ AND THE ✕ STAYS. The grabber is the gesture's mark, not a control — a sheet whose only
          way out is a drag is a sheet that traps anyone who does not know the drag exists.
        */}
        <View style={styles.grabber} />

        <View style={styles.head}>
          {props.dayLabel ? <Legend size={17} track={0.2}>{props.dayLabel}</Legend> : <View />}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={props.onClose}
            hitSlop={10}
            style={({ pressed }) => [styles.close, pressed && styles.dim]}
          >
            <Icon name="close" size={18} color={stage.ink0} strokeWidth={2} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* The name is the screen. It is the coach's word for the day, so it takes the serif. */}
          <Text style={styles.title} accessibilityRole="header" numberOfLines={3}>
            {bidi(props.name)}
          </Text>

          <View style={styles.metaRow}>
            {/* ⚠️ `shape` NO LONGER DRAWS HERE. It is "6 LIFTS · ~50 MIN" — the very line the row
                she pressed already carries, and the figures below say it larger and in parts. The
                prop stays because the harness and the tests pass it; nothing renders it twice. */}
            {changed ? (
              <View style={styles.pill}>
                <Legend size={17} track={0.08} weight="semibold" tone="accent">
                  {t('home.briefChangesShort', { count: props.changes! })}
                </Legend>
              </View>
            ) : null}
          </View>

          {/*
            ════ ⛔ THE SESSION, STATED AS FIGURES ════

            FOUNDER, 2026-08-12: *"לחיצה על אימון פותחת MODAL שעולה מלמטה שמציגה את תוכן האימון אבל
            בצורה הרבה יותר מרשימה מאשר מסך הPREWORKOUT."*

            What stood here was a legend reading "6 LIFTS · ~50 MIN" — the same sentence the row she
            just pressed already carried. A sheet that opens to repeat the row that opened it has
            told her nothing.

            ⚠️ EVERY NUMBER HERE IS ARITHMETIC ON THE ROWS BELOW IT, not a new claim. The lifts, the
            sum of their sets, the minutes the engine priced. **Nothing on this sheet is a fact the
            table underneath cannot be checked against** — which is the only kind of summary this
            product is allowed to draw (R7).
          */}
          <View style={styles.figures}>
            <Figure value={String(props.lifts.length)} label={t('program.sheetLifts')} />
            <Figure value={String(totalSets)} label={t('program.sheetSets')} />
            {props.minutes ? <Figure value={`~${props.minutes}`} label={t('program.sheetMin')} /> : null}
          </View>

          {/*
            ════════════════════════════════════════════════════════════════════════════════════════
            ⛔ "WHERE THE WORK GOES" IS DELETED (founder, 2026-08-12)

              *"להוריד את ההקצאה לכל שריר שכתוב שם, זה לא מעניין אף אחד. תציג את התוכנית במקום זה
              ותעצב את זה בגדול וברור."*

            It drew the assembler's per-muscle set allocation as seven labelled bars, and the case
            for it was that it answered *what is this session actually for?* — a question a list of
            exercises cannot. That case was mine and it was made about the wrong reader: **she is
            standing in a gym about to start, and what she needs is the lifts.** Seven bars pushed
            them under the fold on a 390-point phone.

            ⚠️ NOTHING IS LOST THAT SHE ASKS FOR. The allocation is still the reason each lift is
            here, and `whyLiftIsHere` gives it one row at a time, on the row it is about — which is
            where a reason belongs and where she actually goes looking for one.
            ════════════════════════════════════════════════════════════════════════════════════════
          */}

          {props.budgetNote ? <Text style={styles.budgetNote}>{props.budgetNote}</Text> : null}

          <Legend size={17} track={0.2} style={styles.liftsLegend}>{t('program.sheetTheLifts')}</Legend>

          {/*
            ⛔ NO PARAGRAPH HERE (founder 2026-08-05). A block of the coach's prose stood above this
            list for one draft. *"Nobody reads that before a workout"* — and it was me explaining the
            table underneath, which is the thing his copy law is about.
          */}
          <PlanLifts lifts={props.lifts} units={props.units} onForm={props.onForm} onWhy={props.onWhy} />
        </ScrollView>

        <View style={styles.footer}>
          {props.done ? (
            /* A record wears no offer's clothes — the same refusal the week column makes. */
            <View style={styles.doneNote}>
              <Icon name="check" size={17} color={signal[0]} strokeWidth={2.6} />
              <Text style={styles.doneText}>{t('program.doneThisWeek')}</Text>
            </View>
          ) : (
            <Button
              variant="primary"
              size="lg"
              block
              disabled={!!props.locked}
              label={t('home.begin', { name: props.name })}
              onPress={props.onStart}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  /* ── the session, stated as figures ── */
  figures: { flexDirection: 'row', gap: 34, marginTop: 22, marginBottom: 4 },
  figure: { gap: 4 },
  figureValue: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 34,
    lineHeight: 38,
    color: stage.ink0,
    textAlign: 'left',
  },

  /* ⛔ The `work*` styles went with the block they drew — an orphaned style is what `styles.ask`
     became when its graphic was deleted around it, and it then rendered the second-largest figure
     on the set screen at the platform default for a week. */

  liftsLegend: { marginTop: 30, marginBottom: 2 },

  root: { flex: 1, backgroundColor: color.bg },
  safe: { flex: 1 },
  /* 36 × 5, centred, at the cream's quietest step — present enough to read as a handle, quiet
     enough that it is never the first thing on the sheet. */
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(241,238,229,0.22)',
    marginTop: 8,
    marginBottom: 4,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.gutter,
    paddingTop: 14,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(241,238,229,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: 24 },
  // 31 — the largest thing on the screen, because it is what tells her what today IS.
  title: { fontFamily: font.serif, fontSize: 31, lineHeight: 35, color: stage.ink0, textAlign: 'left' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 9, marginBottom: 6 },
  /* A fact, in the reading voice — not a banner, not clay. Clay is for pain and destructive confirms. */
  budgetNote: { fontFamily: font.sans, fontSize: 17, lineHeight: 20, color: color.textSecondary, marginBottom: 10, textAlign: 'left' },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, backgroundColor: 'rgba(169,196,159,0.12)' },
  footer: { paddingHorizontal: space.gutter, paddingBottom: 26, paddingTop: 10 },
  doneNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 14 },
  doneText: { fontFamily: font.sansMedium, fontSize: 17, color: stage.ink1, textAlign: 'left' },
  /* A.13 — a wash under the control, never a fade of it. */
  dim: { backgroundColor: 'rgba(241,238,229,0.10)' },
});
