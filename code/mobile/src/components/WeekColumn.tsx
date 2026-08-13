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
// @ts-nocheck

// 

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
  /** How many things she does in it, and how long the timed part of it takes. */
  items?: number;
  minutes?: number;
  /** There is work in it that cannot be timed (a distance) — `minutes` is a floor. */
  timeUnknown?: boolean;
  /**
   * ⛔ HOW MANY LOADS THE ENGINE MOVED IN **THIS** WORKOUT (founder 2026-08-12).
   *
   * The change pill used to draw the WEEK's total, on the queued card only — so a load the engine
   * moved in Lower B was invisible until she opened it, and the pill on the card she was looking at
   * was counting work that was not in it. A count belongs to the thing it counts.
   */
  changes?: number;
  /** "Chest · Shoulders · Triceps" — what the session is for. Drawn on the queued card only. */
  muscles?: string;
}

export interface WeekColumnProps {
  workouts: WeekColumnWorkout[];
  /** The workout currently queued — the row that opens. */
  selectedId: string | null;
  onChoose: (id: string) => void;
  /** Drawn inside the open row: the lifts, the reason, whatever Home puts there. */
  children?: React.ReactNode;
  /** The change count for the open row's moss pill, and what opens the WHY surface. */
  changes?: number | null;
  onChanges?: () => void;
  /* ⛔ `shape` IS DELETED (2026-08-12) — see `shapeOf`. Every card composes its own line from its
     own `items`/`minutes`, so two rows can never disagree about the same kind of fact. */
  /** Frozen while a session is resumable: the queue is not hers to change mid-workout. */
  inert?: boolean;
  /*
   * ⛔ `onMoveToDay` IS GONE WITH THE WEEKDAY SLOTS (founder 2026-08-12).
   *
   * It came from his own note on 2026-08-05 — *"the athlete can change it herself by dragging from
   * one day to another and swapping"* — and it moved a session between the seven slots that no
   * longer exist. **There is nothing to drop onto in a numbered column.**
   *
   * ⚠️ AND IT HAD ALREADY STOPPED WORKING FOR ALMOST EVERYONE, which the code said out loud: *"the
   * drag still does not stick on the engine's week … the board snaps back."* `saveCoachPlanDays`
   * returns early when there is no stored coach plan, so on a generated programme — every athlete
   * who did not import one — the row lifted, dropped and reverted. A gesture that is offered and
   * changes nothing reads as a broken app.
   *
   * Reordering the QUEUE is a different feature, and a real one; it is not this one, and it is not
   * being invented here on the way past.
   */
}

/** What each row of the drawn column is. Exported so the law can assert the arrangement directly. */
export type WeekRow = {
  kind: 'workout';
  /** Her position in the week — "01", "02". Always present; it is what the column IS. */
  label: string;
  /**
   * ⚠️ `day` IS THE WEEKDAY, `dayTag` IS WHAT IT PRINTS — and they are not the same thing. The tag
   * is `t('weekday.tue')`, which is "TUE" in English and "ג׳" in Hebrew. Both are absent unless a
   * programme she IMPORTED named the day; nothing derives one.
   */
  day?: Weekday;
  dayTag?: string;
  workout: WeekColumnWorkout;
  open: boolean;
};

/**
 * The rows to draw, in the order she reads them. Pure, and the whole design decision.
 *
 * ════ ⛔ ONE ARRANGEMENT NOW: N WORKOUTS, NUMBERED (founder 2026-08-12) ════
 *
 * *"ואמרנו שזה לא יופיע כימים אלא כN אימונים."* Ruled: **always**, never a calendar.
 *
 * What this deletes is a second arrangement that laid the sessions onto seven weekday slots once
 * `domain/trainingDays` had earned a pattern — two sessions on the same weekday inside three weeks.
 * It was defensible and it was built from his own words: the days were OBSERVED, never assigned, so
 * nothing was ever a promise she could break.
 *
 * ⚠️ AND IT STILL DRIFTED INTO THE THING HE REJECTED. Seven rows, three of them empty, Sunday at
 * the top — whatever the derivation behind it, **what she reads is a calendar with gaps in it**, and
 * a gap in a calendar is a day you did not train. The founder's model was never "don't guess her
 * days"; it was "a week is four workouts, not seven days, and the ones she has left are the only
 * count that means anything."
 *
 * ── ⚠️ WHAT SURVIVES: A DAY SOMEBODY ACTUALLY WROTE ─────────────────────────────────────────────
 * `w.day` is not dead. An IMPORTED programme can name its own days — "Tuesday, easy 5 km" — and the
 * `authored` guarantee says we never rewrite what she brought. So that day is carried onto the row
 * as a TAG beside the name, where it is information, rather than used as a position, where it would
 * be a schedule. The engine writes no `day` at all (`domain/enginePlan`), so a generated week is
 * numbered end to end.
 *
 * **The only weekdays that ever appear are weekdays a person wrote down.**
 */
export function weekRows(
  workouts: WeekColumnWorkout[],
  selectedId: string | null,
  weekdayLabel: (d: Weekday) => string,
): WeekRow[] {
  return workouts.map((w, i) => {
    const d = w.day as Weekday | undefined;
    const named = d && WEEK_ORDER.includes(d) ? d : undefined;
    return {
      kind: 'workout' as const,
      // Two digits, so 01 and 10 occupy the same width and the names below them line up.
      label: String(i + 1).padStart(2, '0'),
      ...(named ? { day: named, dayTag: weekdayLabel(named) } : {}),
      workout: w,
      open: w.id === selectedId,
    };
  });
}

/*
 * ════ ⛔ THE SHEEN IS DELETED, AND I SHIPPED IT WITHOUT EVER LOOKING AT IT ════
 *
 * FOUNDER, 2026-08-12: *"מה פתאום, אתה ראית איך האור הזה ניראה? זה פשוט הבזק שנע מהר על כולם."*
 *
 * A cream band swept across each card on arrival, staggered down the column, to answer his question
 * about whether a card reads as pressable. On a device it is a **strobe**: 600 ms of travel with only
 * 90 ms between rows means all four are lit at once, and light crossing four separate objects
 * simultaneously does not read as light — it reads as the screen flickering.
 *
 * ⚠️ THE FAILURE IS NOT THE TIMING, IT IS THAT I NEVER WATCHED IT. The harness pane does not
 * composite frames for me, so I verified that four unique gradient ids had mounted and called the
 * design good. **Four ids is evidence the component rendered; it is no evidence at all about what an
 * animation looks like** — and I argued for it in a paragraph about motion that "invites rather than
 * decorates" without having seen a single frame of it. That is asserting instead of measuring, which
 * is the thing this whole review has been about.
 *
 * ⚠️ WHAT CARRIES THE AFFORDANCE NOW is what was underneath it and did not depend on motion: every
 * card wears the same frame — including the finished ones, which were the only pressable things on
 * the screen that looked like plain text — and a press answers with a WASH under the card rather
 * than a fade of it (founder A.13; see `cardPressed`). Both are permanent, both survive
 * reduced-motion, and neither needs to be seen once to work.
 */

export function WeekColumn(props: WeekColumnProps) {
  const { t } = useCopy();
  const rows = React.useMemo(
    () => weekRows(props.workouts, props.selectedId, (d) => t(`weekday.${d}`).toUpperCase()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.workouts, props.selectedId, t],
  );

  /**
   * One workout's own shape, from its own numbers.
   *
   * ⛔ EVERY ROW SAYS THIS NOW (founder 2026-08-12): *"החזון שלי הוא שהאימונים יהיו מסודרים ברצף
   * יפה."* Three of the four rows used to carry a NAME AND NOTHING ELSE, because `items`/`minutes`
   * were drawn only for the queued one — which is why the week read as a list of labels rather than
   * a sequence of things worth pressing.
   *
   * ⚠️ AND IT NEVER GUESSES. A session with a distance in it has no honest total (`timeUnknown`), so
   * it says how many things she does and stops.
   */
  const shapeOf = (w: WeekColumnWorkout): string | null => {
    /*
     * ⛔ ONE SOURCE, AND IT IS THE WORKOUT (2026-08-12). This began `if (props.shape && w.id ===
     * props.selectedId) return props.shape` — the queued card took a line HomeView had composed from
     * `plan`, and every other card composed its own from `items`/`minutes`. Two derivations of one
     * fact, and the gallery caught them disagreeing on the first mount: a card reading "6 LIFTS ·
     * ~55 MIN" for a session whose own numbers said seven and forty-eight.
     *
     * A row must never be able to say a different thing from its neighbour about the same kind of
     * fact. The workout answers for itself.
     */
    if (!w.items) return null;
    /* ⚠️ `count` AS WELL AS `lifts` — i18next picks the plural form off `count` and nothing else,
       so without it a one-exercise session read "1 EXERCISES". Found in the harness on the long run
       (`2.1e`), which is exactly the shape that has one item and no honest minute total. */
    return w.minutes && !w.timeUnknown
      ? t('home.planShape', { count: w.items, lifts: w.items, min: w.minutes })
      : t('home.planShapeNoTime', { count: w.items, lifts: w.items });
  };

  return (
    <View style={styles.week}>
      {rows.map((row) => {
        const w = row.workout;
        const done = !!w.done;
        const shape = shapeOf(w);
        const changes = w.changes ?? 0;

        /*
         * ════ ⛔ THREE SHAPES, BECAUSE A WORKOUT IS THREE DIFFERENT THINGS ════
         *
         * FOUNDER, 2026-08-12, on whether Today was finished: it was not, and the measurement was
         * the argument. **46% of the week block was spent on work she had already done** — two
         * finished cards at 108px each, the same size as the ones ahead of her, carrying a shape
         * line ("6 LIFTS · ~55 MIN") she no longer has any use for because she has already done it.
         *
         * A finished workout's whole content is that it is finished. It is a LINE now (~46px), and
         * the ~124px that frees goes to the one card the screen is actually about.
         *
         *   DONE   — index · name · check. One line. A record.
         *   AHEAD  — index · name · shape. She may choose it, so it says what it costs.
         *   QUEUED — the subject: its changes, its name at 34, its shape, and what it trains.
         *
         * ⚠️ AND THE CHANGE PILL BELONGS TO ITS OWN CARD. It drew the WEEK's total on the queued
         * card only, so a load moved in Lower B was invisible until she opened it — and the number
         * on the card she was looking at was counting work that was not in it.
         */
        return (
          <Pressable
            key={w.id}
            accessibilityRole="button"
            accessibilityLabel={shape && !done ? `${w.name}. ${shape}` : w.name}
            accessibilityState={{ selected: row.open, disabled: !!props.inert }}
            disabled={!!props.inert}
            onPress={() => {
              if (props.inert) return;
              haptics.tick();
              props.onChoose(w.id);
            }}
            style={({ pressed }) => [
              styles.card,
              done && styles.cardDone,
              row.open && styles.cardOpen,
              pressed && (row.open ? styles.cardOpenPressed : styles.cardPressed),
            ]}
          >
            <View style={styles.cardHead}>
              <Text style={[styles.letter, done ? styles.letterWas : row.open ? styles.letterNow : styles.letterFaint]}>
                {row.label}
              </Text>
              {/* The day a programme she BROUGHT wrote down. Never derived — see `weekRows`. */}
              {row.dayTag ? <Text style={styles.dayTag}>{row.dayTag}</Text> : null}

              {/* A finished workout puts its name on the head row: there is nothing else to say. */}
              {done ? (
                <Text style={[styles.name, styles.nameDone, styles.nameInline]} numberOfLines={1}>
                  {bidi(w.name)}
                </Text>
              ) : null}

              <View style={styles.spacer} />

              {/*
                ⛔ DONE OUTRANKS QUEUED (founder A.16): *"a completed workout's chip stays white and
                reads like another workout still to do."* The check is what keeps a record from
                wearing an offer's clothes.
              */}
              {done ? <Icon name="check" size={17} color={signal[0]} strokeWidth={2.6} /> : null}
              {!done && changes > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('home.briefChanges', { count: changes })}
                  hitSlop={8}
                  onPress={props.onChanges}
                  style={({ pressed }) => [styles.pill, pressed && styles.dim]}
                >
                  {/* ⚠️ SANS, NOT MONO — "3 CHANGES" is a translated SENTENCE, and IBM Plex Mono
                      cannot draw Hebrew at all. `monoCarriesNoWords` caught this the moment the
                      column landed, which is exactly what it is for. */}
                  <Legend size={17} track={0.08} weight="semibold" tone="accent">
                    {t('home.briefChangesShort', { count: changes })}
                  </Legend>
                </Pressable>
              ) : null}
              {/*
                ⛔ THE CHEVRON WAS HERE FOR ONE HOUR, AND THE FOUNDER WAS RIGHT ABOUT IT.

                *"שברון זה הפלסטר הכי קל שיכולת לשים."* It is. It is what every app reaches for, it
                is inert, and on a screen whose queued card is already lit and raised, a small grey
                arrow in the corner is one more thing in the corner. It answered his question by
                borrowing someone else's answer.

                What stands in its place is not a mark at all: every card wears the same frame, and
                a press answers with a wash under it (`cardPressed`). A sweep of light was tried in
                between and deleted the same hour — see the note above the component.
              */}
            </View>

            {done ? null : (
              <>
                <Text style={[styles.name, row.open && styles.nameOpen]} numberOfLines={2}>
                  {bidi(w.name)}
                </Text>
                {shape ? <Text style={styles.shape}>{shape}</Text> : null}
                {/*
                  ⛔ WHAT THE SESSION IS FOR — on the queued card only.
                  `HomeWorkoutOption.muscles` has existed since v7 and `Home` passed `''` under a
                  note saying *"the coach names its own sessions and does not state muscles"*. True
                  of the coach; the ENGINE composed this week and `muscleOf` answers for every lift
                  in it. A prop that was always empty because its comment described a machine that
                  is gone.
                */}
                {row.open && w.muscles ? <Text style={styles.muscles}>{w.muscles}</Text> : null}
              </>
            )}
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
  /*
   * ⛔ THE WEEK SITS IN ITS SPACE, NOT AT THE TOP OF IT (founder 2026-08-12).
   *
   * Shrinking the finished cards freed ~135px, and it all pooled at the bottom as a hole above the
   * act — the fourth time on this screen that reclaiming space just moved the emptiness somewhere
   * else. **A week is however many workouts it is**, and that number is not a design decision: two
   * days a week is a real answer and so is six.
   *
   * So the column centres in whatever the header and the act leave it. A short week is composed
   * rather than stranded at the top; a long one overflows into the scroll, which is the right thing
   * to lose off the bottom. The gaps stay equal either way — `space-between` would have paid for
   * the emptiness by making the rhythm depend on how many workouts she trains.
   */
  week: { flex: 1, justifyContent: 'center', marginTop: space[2], gap: 7 },

  /*
   * ════ A WORKOUT IS A CARD, AND ALL FOUR ARE THE SAME CARD ════
   *
   * The column used to draw a raised block for the queued session and one-line labels for the rest.
   * Four objects of the same kind fill a screen; one object and three labels leave a hole in it, and
   * that hole is what the founder kept finding filled with something borrowed.
   *
   * ⚠️ EMPHASIS IS DISTANCE FROM THE GROUND, NEVER A HUE (the palette's law). A closed card sits IN
   * the stage on a hairline; the queued one stands ON it, lit, with more room inside. Same geometry,
   * different elevation.
   */
  /*
   * ⚠️ TIGHTENED WHEN THE TYPE FLOOR LANDED. Every line inside a card grew — the index 13 → 17, the
   * shape 13 → 17 — and four cards took the last workout of the week under the CTA, which is the
   * founder's own rule about seeing the whole week. **The padding is what gives way, never the
   * type**: air is worth having and it is worth less than a legible word.
   */
  card: {
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    gap: 4,
  },
  /*
   * ⛔ A RECORD KEEPS ITS FRAME (founder 2026-08-12, asking whether a card reads as pressable).
   *
   * This was `borderWidth: 0` — one line of receded text — on the argument that *"a record must
   * never wear an offer's clothes."* The argument is right and I applied it to the wrong property:
   * **the finished card was the only pressable thing on the screen that looked like plain text**,
   * and she can open it, to re-read what she did.
   *
   * What says "done" is the ink and the check. What says "you may press this" is the frame, and
   * every row on this screen can be pressed.
   */
  cardDone: { paddingVertical: 11, gap: 0 },
  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ THE NEXT WORKOUT WEARS THE ACCENT (founder, 2026-08-12)
   *
   *   *"את הפקדים אפשר לעצב בצורה טובה יותר, כמו בסגנון שעשית את הפקד של צירוף תוכנית קיימת — לא
   *   אותו דבר אבל בהשראת."*
   *
   * It was `borderWidth: 0` over a `stage[1]` fill: a slightly lighter rectangle among three
   * hairline rectangles. The one card on this screen she is meant to press was distinguished from
   * the other two by a shade of grey, and the FRAME — the thing that says "press me" — was the
   * property it gave up.
   *
   * ⚠️ INSPIRED BY, NOT COPIED. The programme door on You is a solid moss wash because it is the
   * only accent on that page. Here three cards sit together and one is next: it takes the moss
   * RIM and the faintest wash, so the trio still reads as one week rather than as an advert with
   * two footnotes beside it. The palette's rule holds either way — moss marks the thing that is
   * about to happen.
   * ════════════════════════════════════════════════════════════════════════════════════════════
   */
  cardOpen: {
    paddingVertical: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(169,196,159,0.45)',
    backgroundColor: 'rgba(169,196,159,0.07)',
    gap: 10,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  spacer: { flex: 1 },

  /*
   * ⛔ SANS, NOT MONO — and `monoCarriesNoWords` could not see this one.
   *
   * The day tag is `t('weekday.sun')`, which is "SUN" in English and **"א׳" in Hebrew**. IBM Plex
   * Mono has no Hebrew glyphs at all, so every Hebrew athlete's week was drawn in a silent system
   * fallback: the wrong face, in the gutter of the first screen she opens.
   *
   * ⚠️ THE LAW MISSED IT BECAUSE THE `t()` CALL IS IN A CALLBACK. It is a source reader and matches a
   * `t(…)` beside a mono style in the same JSX — here the string arrives through
   * `weekRows(…, weekdayLabel)`, one indirection away.
   */
  letter: {
    fontFamily: font.sansMedium,
    fontSize: 17,
    letterSpacing: trackingPx(13, tracking.legend),
    color: stage.ink2,
    textAlign: 'left',
  },
  /*
   * ════ ⛔ THE ORDER WAS BACKWARDS, AND ONLY A SCREENSHOT SHOWED IT ════
   *
   * FOUNDER, 2026-08-12, sending the first picture of this screen anyone has looked at.
   *
   * `04` — the workout she has NOT done yet — was the faintest thing on the week, and the two she
   * had already finished were the brightest. `letterWas` and `letterNow` were both `signal` at full
   * opacity while everything else sat at 0.55. **A record outshone an offer**, which is the exact
   * inversion founder A.16 exists to forbid, arriving through the one property nobody had thought
   * of as carrying it.
   *
   * ⚠️ AND EVERY LAW ON THIS SCREEN PASSED. `homeWeekCard` checks that a DONE NAME recedes — it
   * does, and it did. Nothing was watching the index beside it, because until there was a picture
   * nobody knew there was anything to watch.
   *
   * The order is now what the week actually is: what is next stands, what is ahead is legible, what
   * is finished recedes.
   */
  letterFaint: { color: stage.ink1, opacity: 1 },
  letterWas: { color: stage.ink2, opacity: 0.7 },
  letterNow: { color: signal[0], opacity: 1 },
  /* A weekday a PROGRAMME SHE BROUGHT wrote down. Quiet: it is provenance, not position. */
  dayTag: {
    fontFamily: font.sansMedium,
    fontSize: 17,
    letterSpacing: trackingPx(13, tracking.legend),
    color: stage.ink2,
    opacity: 0.75,
    textAlign: 'left',
  },

  /*
   * ⛔ THE NAME IS THE SERIF ON EVERY CARD, not only the open one (2026-08-12). A workout is a made
   * thing with a name — the same argument the programme's name won — and setting three of them in
   * the interface sans made the week read as navigation rather than as her training.
   */
  /* 23 → 27 on the open card, which is the one she reads from across a changing room. */
  name: { fontFamily: font.serif, fontSize: 27, lineHeight: 33, color: stage.ink0, textAlign: 'left' },
  /* ⛔ 23 → 34 on the queued card. **A screen should be biggest where it changes**, and this is the
     one thing on Today that is different today. */
  nameOpen: { fontSize: 34, lineHeight: 39 },
  nameDone: { color: stage.ink2 },
  /* On a done card the name sits IN the head row beside its index, not under it. */
  nameInline: { flexShrink: 1, fontSize: 19, lineHeight: 24 },
  /* What the queued session trains. Sans and muted: it is a caption on the name above it, and the
     figures on the sheet are where the amounts live. */
  muscles: { fontFamily: font.sans, fontSize: 17, lineHeight: 23, color: stage.ink2, textAlign: 'left' },

  shape: {
    fontFamily: font.mono,
    fontSize: 17,
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
  /*
   * ⛔ A PRESS IS A WASH, NEVER A FADE (founder A.13) — and these cards were fading.
   *
   * `pressed && styles.dim` dropped the whole card to 0.6 opacity: the name, the figures, the
   * check, all of it. **At 0.6 a pressed row is a DISABLED row**, which is the exact reading A.13
   * exists to forbid, and it was on the screen she opens every morning.
   *
   * A wash is also the honest answer to *"a glowing background that says pressing opens
   * something"*: the surface takes light while her thumb is on it. The content never moves.
   */
  cardPressed: { backgroundColor: 'rgba(241,238,229,0.07)' },
  /* The queued card already stands on `stage[1]`, so its press goes further up, not down. */
  /* ⛔ THE OPEN CARD'S WASH IS THE ACCENT'S NOW — it wears the moss rim, and a grey wash under a
     moss card reads as the card going out rather than being pressed (A.13). */
  cardOpenPressed: { backgroundColor: 'rgba(169,196,159,0.16)' },
  /* A.13 — the change pill answers a press by taking light, not by losing it. */
  dim: { backgroundColor: 'rgba(169,196,159,0.22)' },
});
