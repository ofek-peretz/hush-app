/**
 * ProgressLifts — Progress · Lifts, the ALL-TIME lens (v7 3.2). Rebuilt 1:1 from the handoff.
 *
 * IA (top → bottom):
 *   · header — serif "Progress", and "Log" beside it, which opens the history ledger
 *   · THE BOARD — six things she has earned, a row each, opened by its own mark in moss
 *   · EVERY LIFT — one row per trained lift: where it started, where it stands, what it gained
 *
 * ⚠️ AND THE THREE LINES ABOVE ARE THE FIRST ONES IN THIS FILE THAT DESCRIBE IT. The block that
 * stood here still promised a chip strip, a lifetime-tonnage hero, a weekly-volume area graph and a
 * gallery of milestone badges — four things deleted over the week of 2026-08-12, whose imports,
 * locals and styles were all still in the file underneath. A stale docblock is worse than none:
 * it is the one part of a screen a reader trusts without checking.
 *
 * Everything here is display arithmetic over the logged history (domain/progressAggregate) — no
 * engine type is read. A LIFT ROW OPENS ITS OWN CARD (3.2b, screens/progress/LiftDetail).
 *
 * DAY ONE (3.6b): before any workout is logged there is nothing measured to draw, and Hush shows
 * only what was measured — so the page says so, over a ghost of the graph to come.
 */

// 

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Arrive, GhostClimb, Legend, SegmentedControl } from '@/components/ds';
import { useCopy } from '@/i18n/useCopy';
import { currentLocale } from '@/i18n';
import { exerciseDisplayName } from '@/data/exercises';
import { displayWeight, unitLabel } from '@/domain/schedule';
import type { QuarterlyProgressEntry } from '@/domain/progressReport';
import type { ProgressAggregate } from '@/domain/progressAggregate';
import type { Units } from '@/data/local/models';
import { Icon, type IconName } from '@/components/Icon';
import { MilestoneEmblem } from '@/components/MilestoneEmblem';
import { color, space, font, textScale, ramp, tracking, trackingPx, signal } from '@/design/tokens';

/** One engraved seal on the wall — already formatted; this screen only hangs them. */
export interface WallMark {
  value: string;
  caption?: string;
  title: string;
  /** What the mark IS, where the moment's title would be the wrong tense — see `MilestoneCopy.name`. */
  name?: string;
  glyph?: string;
}

interface Props {
  entries: QuarterlyProgressEntry[];
  aggregate: ProgressAggregate | null;
  loaded: boolean;
  units: Units;
  /**
   * ════ THE PRIDE WALL (founder, device QA 2026-08-23) ════
   *
   * *"קיר הגאווה שלו … המסך שמספר מה הוא הרוויח ועשה לאורך כל התקופה. אני רוצה … שהוא יתרגש כשהוא
   * פותח אותו."*
   *
   * ⚠️ AND THIS IS NOT THE "COLLECTION OF MILESTONES" HE STRUCK ON 2026-08-04. What he struck was a
   * strip of 60-point dashed circles — placeholders costing screen. These are the ENGRAVED SEALS
   * from the milestone moment itself (`MilestoneEmblem`, foil + glyph — the warship, the plates,
   * the lift silhouettes), only the ones she has EARNED, plus exactly one locked seal: the next
   * mark, with how far she stands from it. A trophy shelf holds what was won; it never pads.
   */
  marks?: { earned: WallMark[]; next: (WallMark & { progressLabel: string; progress?: number }) | null };
  /** Opens the history ledger (the "Log" tab). */
  onLog?: () => void;
  /** Opens one lift's own card (3.2b) — what a lift chip does now. */
  onLift?: (exerciseId: string) => void;
  /** Opens the week's share card (§9.2) — present only when this week has real work to show. */
  onShareWeek?: () => void;
}

/** A lifetime figure, big and compact: "186" mono with a subordinate sans unit ("t"). */
const fmtTonnes = (kg: number): string => {
  const t = kg / 1000;
  return t >= 10 ? String(Math.round(t)) : String(+t.toFixed(1));
};
/*
 * ⛔ A LIFETIME FIGURE THAT ROUNDS ITSELF AWAY IS NOT A LIFETIME FIGURE.
 *
 * `fmtK` folded at 1,000, so the first real burn total this page ever showed — 3,400 kcal, earned
 * over weeks — came out as **"3k"**, on a screen whose entire subject is how much has accrued. It
 * folds at ten thousand now, where the abbreviation is finally buying something (five glyphs at 44
 * points is the width the row has).
 */
const fmtK = (n: number): string => (n >= 10000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));
/*
 * ⛔ AND A ROUNDED KILOMETRE ERASES A RUN. `Math.round(cardioKm)` wrote **0 Km** for every distance
 * under 500 m — on the one row a runner opens this page for. The tenth is kept until the figure is
 * big enough not to need it, which is the rule `fmtTonnes` already keeps one line above.
 */
const fmtKm = (km: number): string => (km >= 10 ? String(Math.round(km)) : String(+km.toFixed(1)));

/*
 * ⛔ SIX NUMERALS, ONE AXIS (founder, 2026-08-18: *"הוא צריך תיקון או שהוא מושלם לדעתך"*).
 *
 * The board's value and its unit sat in one right-anchored row, so what lined up down the page was
 * the END OF THE UNIT — and every unit is a different width. "1" ended at the page edge, "3.9 t"
 * and "25 kcal" each stopped somewhere else, and six facts that are supposed to read as one column
 * wobbled by forty points. **A table of figures has a numeral axis or it is a list.**
 *
 * A CONSTANT-WIDTH UNIT COLUMN is the whole fix: the numerals right-align against it, so they share
 * an edge whatever they measure. In Hebrew a unit is a WORD ("קלוריות", "שעות") and the column has
 * to be wider — which the shorter Hebrew captions pay for.
 */
/**
 * ⛔ THE UNIT COLUMN, AND TWO WAYS I GOT IT WRONG BEFORE LOOKING AT IT (2026-08-19).
 *
 * The numerals are right-aligned against a constant-width unit column — that is what puts six
 * figures on one axis. What the width depends on took two corrections, both found by opening the
 * screen and neither catchable by any test in this repo:
 *
 *   1. It keyed off `I18nManager.isRTL`. On the web target that is FALSE while the app runs in
 *      Hebrew, so the Hebrew branch was never taken and "קלוריות" wrapped under a 44-point numeral.
 *      **Direction and language are two different questions**, and only one of them decides how wide
 *      a unit word is.
 *   2. Keyed on the language, it was still a module-level `const` — evaluated at import, before
 *      `initI18n` has resolved anything, so it answered 'en' every time. **The same defect as the
 *      `Dimensions.get('window')` snapshot corrected one screen over**, and made the same morning.
 *
 * So it is read at RENDER, where the language is a fact. `useCopy` re-renders on a language change,
 * which is what makes the switch in the gallery — and in Settings — take effect without a reload.
 */
const unitColumnFor = (locale: string): number => (locale === 'he' ? 88 : 46);

export function ProgressLifts({ entries, aggregate, loaded, units, onLog, onLift, onShareWeek, marks }: Props) {
  const { t } = useCopy();
  /*
   * DAY ONE (3.6b) — nothing has been measured yet. The page then holds only its own name: there is
   * no Lifts/Log choice to make when both are empty, and no chip strip to scroll.
   *
   * ⛔ AND "NOTHING" USED TO MEAN "NO LIFT ENTRIES", WHICH IS NOT THE SAME SENTENCE.
   *
   * `entries` is built from logged SETS. So an athlete three runs into her week — kilometres,
   * calories and minutes all sitting in the aggregate, a CARDIO row on the board waiting for
   * exactly her — was told "nothing has been measured yet" and shown a dashed ghost. The screen
   * denied work it was already holding. Day one is now what it says: nothing measured, anywhere.
   */
  const measured =
    !!aggregate &&
    (aggregate.workouts > 0 ||
      aggregate.liftedKg > 0 ||
      aggregate.cardioKm > 0 ||
      aggregate.minutes > 0 ||
      aggregate.kcal > 0);
  const dayOne = loaded && !measured;

  if (dayOne) return <DayOne />;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* header — the section name in the coach's serif, and the Lifts / Log choice */}
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">{t('progress.title')}</Text>
        {/*
          ⛔ THE TOGETHER DISC MOVED HOME (founder, 2026-08-24: *"איך זה קשור לשם? זה לא."*).
          It sat here one day — pride and sharing as neighbours — and the founder is right that
          they are not: Progress reports HER training; Together is the people around it. The door
          is the corner disc on Today now (HomeView `onTogether`), one tap from the screen she
          opens every day, and this screen went back to owning exactly one subject.
        */}
        {/*
          ⛔ THE ONBOARDING SHAPE, HERE TOO (founder, 2026-08-12): *"את הפקדים שבצד של LIFT ו-LOG
          תשנה כמו שעשינו במין של ה-ONBORDING."* — the third control this week to leave
          `SegmentedControl` for it, which is the point: one gesture, taught once.
        */}
        {/*
          ⛔ BUT ONLY ONE OF THE TWO IS A CONTROL — and both were drawn as one.

          They were a radio group with `selected: 'lifts'` HARDCODED, which promises a state that
          flips and stays flipped. It never could: "Log" does not change a lens, it NAVIGATES to the
          ledger, and she comes back to find "Lifts" lit again as though her tap had been refused.
          And "Lifts" itself was a Pressable with an empty branch — it pressed, it dimmed, and it did
          nothing, because there is nowhere to go: it is the surface she is already standing on.
          The law both of them broke was written at the foot of this file, on the dead `Chip` that
          has now gone with the strip it belonged to, so it is restated here — *a control that
          announces itself to a screen reader and then does nothing is a lie the size of a tap.*
          The lit pill is a label now, and the ledger is a button.
        */}
        {/*
          ════════════════════════════════════════════════════════════════════════════════════════
          ⛔ THE SWITCH CHANGED SHAPE WHEN YOU USED IT (found 2026-08-27, by opening both halves)

          One switcher, one position, two designs:

            · HERE (Lifts)  two separate rounded rectangles, 1pt borders, the live one brightened.
            · `History` (Log)  the design system's `<SegmentedControl size="pill">` — a track with
              the choice settled into it.

          So she tapped "Log", and the control she had just used turned into a different control.
          Tapping "Lifts" turned it back. That is the whole fault and it needs no more argument than
          looking at the two screens side by side.

          ⚠️ AND THE FILE ALREADY BELIEVED THEY MATCHED. `History`'s markup is commented *"the same
          serif name + Lifts / Log toggle the Lifts lens wears"*, and `SegmentedControl`'s own
          docblock lists *"History's Lifts / Log switch"* as a `pill` user. Two files describing one
          control; only one of them was drawing it. A bespoke copy is not caught by a law because it
          is not broken — it is merely different, and different is invisible from inside one screen.

          The DS control draws it in both directions now. `role="tab"` + `selected` is what it always
          used, which also answers the note below this one honestly: a TAB that is already the
          current tab may be pressed and do nothing — that is what a tab IS, and the screen reader
          says "selected" rather than promising an action. The lie the note guards against was a
          `Pressable` with `role="button"` and an empty branch, and that is what has gone.

          ⚠️ Drawn only when there IS a second lens. Without `onLog` there is nowhere to switch to,
          and a switcher with one destination is the same lie in a new shape.
          ════════════════════════════════════════════════════════════════════════════════════════
        */}
        {onLog ? (
          <SegmentedControl
            size="pill"
            style={styles.lens}
            options={[
              { value: 'lifts', label: t('progress.tabLifts') },
              { value: 'log', label: t('progress.tabLog') },
            ]}
            value="lifts"
            onChange={(v) => {
              if (v === 'log') onLog();
            }}
          />
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {aggregate ? (
          <AllTime
            aggregate={aggregate}
            entries={entries}
            units={units}
            onShareWeek={onShareWeek}
            {...(onLift ? { onLift } : {})}
          marks={marks} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * 3.6b · PROGRESS — DAY ONE. "A ghost of the graph to come, and a promise that reads like a fact."
 *
 * No numbers, because none have been measured, and Hush shows only what was measured (R7). The one
 * lit thing on the page is where she stands: a single moss point at the foot of a dashed climb.
 */
function DayOne() {
  const { t } = useCopy();
  // The live window width, not a Dimensions snapshot taken at import — see LiftDetail's note.
  const win = useWindowDimensions();
  const ghostW = Math.round(win.width - 64);
  /*
   * ════ ⛔ THE CLIMB IS THE PAGE, NOT AN ORNAMENT ON IT (2026-08-22) ════
   *
   * FOUNDER, 2026-08-22, on the whole redesign: *"ניצול מלא ומושלם של כל האיזורים במסך ולא לדחוס
   * הכל לחלק אחד"*, and *"העדפה להראות במקום לכתוב."*
   *
   * It was a fixed 150 points inside a `justifyContent: 'center'` column — so on a 852-point phone
   * the one drawn thing on the page occupied under a fifth of it and left roughly **thirty percent
   * empty above and twenty-five below.** The screen said "this page is honestly empty" and then
   * looked it, which is a different claim: honest about having no DATA is not the same as having
   * nothing to show.
   *
   * ⚠️ AND THE FIX IS SCALE, NOT CONTENT — the same rule that settled the set stage the same day.
   * Nothing was added to this screen and nothing may be: Hush shows only what was measured, and on
   * day one nothing has been. What changed is that the SHAPE of a climb is drawn at the size of a
   * subject, so the air lands at the edges where it reads as room rather than in the middle where
   * it reads as absence.
   *
   * ⚠️ A FRACTION OF THE WINDOW, NEVER A CONSTANT. The block under it is four fixed things — a
   * header, a headline, a paragraph and a ruled note — so a constant tall enough for a 6.9" phone
   * would push the note off a 5.4" one. It also cannot be allowed to collapse: the floor is the 150
   * it used to be, which is the size at which the trace still reads as a rise.
   */
  const ghostH = Math.max(150, Math.min(320, Math.round(win.height * 0.3)));
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.dayOneHeader}>
        <Text style={styles.title} accessibilityRole="header">{t('progress.title')}</Text>
      </View>
      <View style={styles.dayOne}>
        {ghostW > 0 ? <GhostClimb width={ghostW} height={ghostH} label={t('progress.youAreHere')} /> : null}
        <Text style={styles.dayOneTitle}>{t('progress.dayOneTitle')}</Text>
        <Text style={styles.dayOneBody}>{t('progress.dayOneBody')}</Text>
        <View style={styles.dayOneNote}>
          <Icon name="check" size={15} color={signal[0]} strokeWidth={2.2} />
          <Text style={styles.dayOneNoteText}>{t('progress.dayOneFirstMark')}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

/**
 * ════ THE ANSWER, THEN THE EVIDENCE (founder 2026-08-04) ════
 *
 * ⛔ *"Right now it looks like a banal graph with a collection of milestones — and there's one for
 * every single exercise, which nobody is ever going to open."*
 *
 * The page led with LIFETIME TONNAGE, which is a vanity figure: it grows whether or not she is
 * getting stronger, and it cannot go down. It answers nothing. What she opens a progress tab to ask
 * is *am I getting stronger*, and the screen answers that first now — PERSONAL BESTS at the head of
 * the board — with EVERY LIFT proving it, lift by lift, directly underneath.
 *
 * Tonnage keeps its place further down the board, where a lifetime total belongs.
 */
function AllTime({ aggregate, entries, units, onShareWeek, onLift, marks }: {
  aggregate: ProgressAggregate;
  entries: QuarterlyProgressEntry[];
  units: Units;
  onShareWeek?: () => void;
  onLift?: (exerciseId: string) => void;
  marks?: Props['marks'];
}) {
  const { t } = useCopy();
  // Read at render, not at import — see `unitColumnFor` for the two ways this went wrong before.
  const unitCol = unitColumnFor(currentLocale());
  const a = aggregate;
  /* ⛔ `totalGainKg`, `totalGain` and `progressClaim` went with the head they fed — see the note
     where it stood. A derivation with no reader is what comes back later as a "summary".

     ⚠️ AND SO HAD EVERYTHING ELSE UP HERE, WITHOUT ANYONE NOTICING. `graphW` — a live-dimensions
     hook, so a re-render on every rotation — `weeklyTonnes` with its first and last points,
     `tonneUnit`, `raises`: six values computed on every draw for a hero and an area graph that were
     deleted above them. `@ts-nocheck` at the head of this file is why nothing ever said so. */

  /*
   * ════════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ THE BOARD — everything she has actually earned (founder, 2026-08-12)
   *
   *   *"להציג את כל מה שהמתאמן הרוויח … כמה כוח התווסף, כמה קלוריות, כמה אימונים, כמה קילומטר,
   *   כמה משקל הרים בסך הכל, כמה שעות … זה אשכרה מסך שמראה את כל ההשקעה של המתאמן בעצמו."*
   *
   * ⚠️ AND THE ANSWER TO ALL OF IT WAS ALREADY ON THIS SCREEN, BELOW THE FOLD, AT 17 POINTS.
   * Every figure he listed was drawn as one of five 60-point dashed circles under the heading
   * "ALL-TIME MILESTONES", beneath a chart and a table — **five 17-point numerals carrying the
   * whole of what she has done.** The screen led with a weekly-volume graph, which is not
   * something she earned; it is a shape that goes up and down.
   *
   * So the strip is promoted to the page. Six facts, at a size that means something, each named in
   * words — and `hours`, the one he asked for that nothing was keeping (`progressAggregate`).
   * ════════════════════════════════════════════════════════════════════════════════════════════
   */
  const hours = Math.floor(a.minutes / 60);
  /*
   * ⛔ AND EACH ONE IS A ROW WITH ITS OWN MARK (founder, 2026-08-12)
   *
   *   *"זה נראה לך כמו מסך שכיף להכנס אליו? בלי הצבע הירוק שלנו, בלי שום דבר שמסמל התקדמות …
   *   הכל בצבעים כבויים ועצומים. אני רוצה מסך שבראשו מופיע ALL TIME PROGRESS ולמטה לכל קטגוריה
   *   שורה משלה עם אייקון משל עצמו."*
   *
   * The 3×2 grid put the facts on the page at a size that meant something, which was the last
   * message's ask — and left them as six grey numerals with no mark on any of them. **Nothing on a
   * page about progress was the colour this product uses for progress.** A row each, opened by its
   * own glyph in moss, so the eye can find "how far have I run" without reading six captions.
   */
  /*
   * ⛔ AND PERSONAL BESTS LEADS IT.
   *
   * The order was workouts → trained → lifted → burned → cardio → **personal bests, last.** Five
   * figures that grow whether or not she is getting stronger, and then the one that only moves when
   * she beats herself, at the bottom of the list. The founder's own sentence put it first —
   * *"כמה כוח התווסף, כמה קלוריות, כמה אימונים…"* — and the head above this board was deleted
   * precisely because it led with a total instead of an answer. It leads with the answer now.
   */
  const board: { value: string; unit: string; caption: string; icon: IconName }[] = [
    { value: String(a.raises), unit: '', caption: t('progress.badgeRaises'), icon: 'star' },
    { value: String(a.workouts), unit: '', caption: t('progress.badgeWorkouts'), icon: 'dumbbell' },
    { value: hours >= 1 ? String(hours) : String(a.minutes), unit: hours >= 1 ? t('progress.unitHours') : t('progress.unitMinutes'), caption: t('progress.badgeTrained'), icon: 'history' },
    { value: fmtTonnes(a.liftedKg), unit: t('progress.unitTonnes'), caption: t('progress.badgeLifted'), icon: 'plate' },
    { value: fmtK(a.kcal), unit: t('progress.unitKcal'), caption: t('progress.badgeBurned'), icon: 'flame' },
    { value: fmtKm(a.cardioKm), unit: t('progress.unitKm'), caption: t('progress.badgeCardio'), icon: 'runner' },
  ];

  return (
    <>
      {/*
        ════════════════════════════════════════════════════════════════════════════════════════
        ⛔ THE WHOLE HEAD IS DELETED AND THE BOARD LEADS (founder, 2026-08-12)

          *"תמחק את כל החלק העליון … ופשוט תעלה את ה-ALL TIME PROGRESS לראש המסך במקום."*

        It carried "TOTAL STRENGTH ADDED · +41 kg", a derived sentence, the workouts-and-weeks line
        and a "Share this week" link — four things above the six facts the page is FOR, and on her
        first week all four degrade into a preamble that says she has not started yet.

        ⚠️ AND THE DERIVED CLAIM WAS THE ONE WORTH ARGUING FOR. `progressClaim` writes a sentence
        that is true of the table under it and nothing else — the whole difference between this page
        and a chart. It is deleted anyway: the EVERY LIFT table underneath states each lift's own
        start and best, per lift, which is the same claim without a narrator.
        ════════════════════════════════════════════════════════════════════════════════════════
      */}

      {/* ════ THE WALL — her earned seals, and the one she is walking toward ════ */}
      {marks && (marks.earned.length > 0 || marks.next) ? (
        <Arrive order={0}>
          <View style={styles.wall}>
            <Legend tone="accent">{t('progress.wallTitle')}</Legend>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wallRow}>
              {marks.earned.map((m2, i) => (
                <View key={`${m2.title}-${i}`} style={styles.wallSeal}>
                  <MilestoneEmblem size={148} value={m2.value} caption={m2.caption} glyph={m2.glyph as never} />
                  <Text style={styles.wallSealTitle} numberOfLines={2}>{m2.title}</Text>
                </View>
              ))}
              {marks.next ? (
                <View style={styles.wallSeal}>
                  <MilestoneEmblem size={148} tone="locked" value={marks.next.value} caption={marks.next.caption} glyph={marks.next.glyph as never} progress={marks.next.progress} />
                  {/* 26a0Fe0f The mark's NAME, not the moment's title 2014 this seal is LOCKED, and `05d405de05e905db05ea 05dc05d405d205d905e2.` under
                      something she has not reached yet is a congratulation for nothing. See `MilestoneCopy.name`. */}
                  {marks.next.name ? (
                    <Text style={styles.wallSealTitle} numberOfLines={2}>{marks.next.name}</Text>
                  ) : null}
                  {/* How far she stands from it — the one figure that makes a locked seal a PULL
                      rather than a lack ("7/10"). Moss: it is progress, in progress. */}
                  <Text style={styles.wallSealProgress}>{marks.next.progressLabel}</Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </Arrive>
      ) : null}

      {/* THE BOARD — see the notes above the `board` array.

          ✦ AND IT ARRIVES (2026-08-27). Three beats in reading order: the seals she has earned,
          the board of everything since the beginning, then every lift she trains. See the note at
          `HomeView` — this screen is one of the forty-one that appeared rather than arrived. */}
      <Arrive order={1}>
        <Legend tone="accent" style={styles.boardHead}>{t('progress.allTime')}</Legend>
        {board.map((b) => {
          /*
           * ⛔ A ZERO IS NOT AN ACHIEVEMENT. "CARDIO 0" and "PERSONAL BESTS 0" were drawn in the
           * same 44-point white as a figure she earned — two of the six loudest things on a page
           * about what she has done were the two things she has not. The row stays (it names what
           * is there to be earned, and its mark stays moss, which is the founder's ask); the
           * numeral goes quiet until there is something in it.
           */
          const empty = Number(b.value) === 0;
          return (
            <View key={b.caption} style={styles.boardRow}>
              <View style={styles.boardMark}>
                <Icon name={b.icon} size={20} color={signal[0]} strokeWidth={2} />
              </View>
              <Legend size={ramp.body} style={styles.boardCaption}>{b.caption}</Legend>
              <View style={styles.boardValueRow}>
                <Text style={[styles.boardValue, empty && styles.boardValueEmpty]}>{b.value}</Text>
                {/* Always drawn, even empty — see `unitColumnFor`: the numerals hang off this column. */}
                <Text style={[styles.boardUnit, { width: unitCol }]}>{b.unit}</Text>
              </View>
            </View>
          );
        })}
      </Arrive>

      {/*
        ⛔ THE LIFTS, AS A TABLE — and this is the answer to *"nobody is ever going to open it."*

        They were a horizontal strip of chips carrying nothing but a NAME. A chip that says
        "Barbell Row" gives no reason to tap it: there is no way to tell from the outside whether
        anything is behind it, so nothing is. A row that already says `40 → 47.5  +7.5` has told her
        the answer AND told her there is more — which is the only honest way to earn a tap.

        ⚠️ Each row still opens that lift's own card, which is where the whole history belongs. The
        detail screen was never the problem; the front page pretending to be six of them was.
      */}
      {entries.length > 0 ? (
        <Arrive order={2}>
          <View style={styles.table}>
            <Legend tone="accent">{t('progress.everyLift')}</Legend>
            {entries.map((e) => {
              // A bodyweight movement progresses in REPS and is never unit-converted (founder
              // 2026-07-10) — its row reads "9 reps", not a fabricated kilogram.
              const isReps = e.mode === 'reps';
              const conv = (v: number) => (isReps ? Math.round(v) : displayWeight(v, units) ?? 0);
              const unit = isReps ? t('report.repsUnit') : unitLabel(units);
              return (
                <Pressable
                  key={e.exerciseId}
                  accessibilityRole="button"
                  accessibilityLabel={`${exerciseDisplayName(e.exerciseId)} ${conv(e.initialPeakKg)} ${conv(e.periodPeakKg)} ${unit}`}
                  onPress={() => onLift?.(e.exerciseId)}
                  style={({ pressed }) => [styles.liftRow, pressed && styles.liftRowPressed]}
                >
                  <Text style={styles.liftName} numberOfLines={1}>{exerciseDisplayName(e.exerciseId)}</Text>
                  {/*
                    ⛔ "25 → 25" IS NOT A JOURNEY (founder, 2026-08-12): *"אם אין דלתא פשוט תציג את
                    המשקל עצמו, כי כרגע אתה מציג 25 וחץ ל-25 — ברור לך שאין בזה היגיון."*

                    He is right and the fault was one level up from where it looked. The DELTA was
                    already suppressed at zero — that part was correct — but the arrow and the two
                    identical figures were drawn unconditionally, so a lift she has done once came out
                    as a move from a weight to the same weight. **An arrow is a claim that something
                    travelled.**

                    One weight when nothing has moved; start → best when it has.
                  */}
                  {e.deltaKg > 0 ? (
                    <Text style={styles.liftFigure}>
                      <Text style={styles.liftFrom}>{conv(e.initialPeakKg)}</Text>
                      {' → '}
                      <Text style={styles.liftTo}>{conv(e.periodPeakKg)}</Text>
                      <Text style={styles.liftDelta}>{`  +${conv(e.deltaKg)}`}</Text>
                    </Text>
                  ) : (
                    /* ⛔ THE UNIT HOLDS ONE SIDE (design review 2026-09-01). A Hebrew unit
                       ("חזרות") inside a mono figure did two wrong things at once: bidi reordering
                       dropped it on the OPPOSITE side of the number from where `kg` sits three
                       rows up, and IBM Plex Mono has no Hebrew, so the word fell to a substitute
                       face. The figure is an LTR measurement (value, then unit — the FigureCells
                       rule); the word takes the sans. */
                    <View style={styles.liftFigureRow}>
                      <Text style={[styles.liftFigure, styles.liftTo]}>{conv(e.periodPeakKg)}</Text>
                      <Text style={[styles.liftUnitWord, !isReps && styles.liftUnitLatin]}>{unit}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </Arrive>
      ) : null}

    </>
  );
}

/*
 * ⛔ `Chip` AND `StatBadge` STOOD HERE, AND NOTHING HAD CALLED EITHER OF THEM FOR A WEEK.
 *
 * The chip strip was replaced by the EVERY LIFT table ("a chip that says 'Barbell Row' gives no
 * reason to tap it"), and the milestone badges by THE BOARD ("five 17-point numerals carrying the
 * whole of what she has done"). Both components survived their own deletion, along with ~20 styles,
 * nine imports and six locals — roughly two fifths of this file drawing nothing. `@ts-nocheck` at
 * the head means the compiler never said a word about any of it.
 *
 * `Chip`'s docstring is the one thing worth keeping, and it is quoted where the lens row now
 * obeys it.
 */

const styles = StyleSheet.create({
  /* ════ the pride wall (founder 2026-08-23) ════ */
  wall: { marginTop: 6, marginBottom: 22 },
  wallRow: { gap: 18, paddingVertical: 14, paddingHorizontal: 2 },
  wallSeal: { alignItems: 'center', width: 156, gap: 8 },
  wallSealTitle: {
    fontFamily: font.sans,
    fontSize: textScale.sm,
    lineHeight: 20,
    color: color.textSecondary,
    textAlign: 'center',
  },
  wallSealProgress: {
    fontFamily: font.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: textScale.sm,
    lineHeight: 20,
    color: signal[0],
    textAlign: 'center',
  },

  root: { flex: 1, backgroundColor: color.bg },

  /* ⛔ SEVENTY POINTS OF NOTHING. `paddingBottom: 16` + the body's `paddingTop: 20` + the board's
     `marginTop: 34` stacked into a fifth of the screen between the title and the first fact she
     came for — three paddings, each reasonable, none aware of the other two. The board is the top
     of the page now (its own marginTop is 0), so this is the whole gap. */
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
    paddingTop: 20,
    paddingBottom: 10,
  },
  // "Progress" at 40 — a surface title, one step below the letter's 56 and above a step's 32.
  title: { fontFamily: font.serif, fontSize: 40, lineHeight: 42, color: color.textPrimary, textAlign: 'left' },
  // The Lifts / Log switch rides on the headline's shoulder, not on its baseline.
  /* ⛔ `lensRow`/`lensOn`/`lensPressed`/`lensText`/`lensTextOn` ARE DELETED (2026-08-27) — they
     were the bespoke half of a switch the other half drew from the design system. See the note at
     the markup. What survives is the one line that was never about the control's SHAPE: where it
     sits against the headline. It is the same `marginTop: 8` `History` gives it, so the switch
     lands in the same place on both lenses as well as looking the same. */
  lens: { marginTop: 8 },

  /* ⛔ AND THE GUTTER WAS PAID TWICE. This 30 and the board's own `space.gutter` (26) both applied,
     so every row on the page was indented 56 while "Progress" above it sat at 30 — the section
     hung off the title's edge by 26 points. One gutter, declared here, for the whole scroll. */
  body: { paddingHorizontal: 30, paddingTop: 10, paddingBottom: 40, flexGrow: 1 },

  // ── 3.6b · day one ──────────────────────────────────────────────────────────────────────────
  dayOneHeader: { paddingHorizontal: 30, paddingTop: 20 },
  // Centred in the page, not stacked under the title: on day one the page IS this block.
  dayOne: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 40, gap: 22 },
  // 34 in the coach's serif — the promise, at the size of a screen headline.
  dayOneTitle: { fontFamily: font.serif, fontSize: 34, lineHeight: 39, color: color.textPrimary, textAlign: 'left' },
  dayOneBody: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 23, color: color.textSecondary, textAlign: 'left' },
  dayOneNote: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: color.border, paddingTop: 16 },
  dayOneNoteText: { flex: 1, fontFamily: font.sans, fontSize: 17, color: color.textSecondary, textAlign: 'left' },

  /*
   * ⚠️ EVERY SIZE BELOW IS THE FOUNDER'S FLOOR (2026-08-04): *"certainly not small type."*
   * Nothing on this page is a caption.
   */
  table: { gap: space[2], marginTop: space[6] }, // gutter: `body` — see its note
  liftRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space[4],
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  /* A wash, never a fade — `aPressNeverDimsWhatYouPressed`. */
  liftRowPressed: { backgroundColor: color.surface },
  /* ⚠️ 17 → 19 with the board above it. These rows are the ONLY door to a lift's own card (3.2b),
     which the founder asked how to reach — a row at caption size next to 44-point figures does not
     read as one. See the note above `entries.length` for why they are rows and not chips. */
  liftName: { flex: 1, fontFamily: font.sans, fontSize: 19, color: color.textPrimary, textAlign: 'left' },
  liftFigure: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: 19, color: color.textMuted, textAlign: 'left' },
  liftFrom: { color: color.textMuted },
  /* The figure's own row: an LTR measurement, value then unit — same law as `FigureCells`. */
  liftFigureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, direction: 'ltr' }, // rtl-ok: a measurement, not text
  /* The unit as a WORD ("חזרות") — sans; mono has no Hebrew glyphs. */
  liftUnitWord: { fontFamily: font.sans, fontSize: 17, color: color.textMuted, textAlign: 'left' }, // rtl-ok: inside an ltr row
  liftUnitLatin: { fontFamily: font.mono }, // rtl-ok: modifier on liftUnitWord
  liftTo: { color: color.textPrimary },
  liftDelta: { fontFamily: font.monoMedium, color: signal[0], textAlign: 'left' },

  /* ⛔ THE BOARD. A 3×2 grid across the full width — see the note at `board`. The figures it holds
     were five 17-point numerals inside 60-point dashed circles at the very foot of the page. */
  boardHead: { marginBottom: 6 },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 17,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(241,238,229,0.12)',
  },
  /* The glyph's own seat — a moss disc, so the column of marks reads down the page as one axis. */
  boardMark: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(169,196,159,0.12)',
  },
  boardValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  /* `right` is the logical END here (RN flips it under RTL, and the row mirrors with it), so the
     numeral always hangs off the edge its unit is on. That, plus the unit column, is the axis. */
  boardValue: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1.4,
    color: color.textPrimary,
    includeFontPadding: false,
    textAlign: 'right',
  },
  /* Quiet until there is something in it — see the note in the row. */
  boardValueEmpty: { color: color.textMuted },
  /* The unit is a WORD in some languages ("שעות", "טון") — sans, never the mono face. Its
     width is FIXED (see `unitColumnFor`): the six numerals are right-aligned against this column. */
  /* Width is applied at render — see `unitColumnFor`; it depends on the language, which a
     StyleSheet cannot know. */
  boardUnit: { fontFamily: font.sans, fontSize: 19, color: color.textSecondary, textAlign: 'left' },
  /* ⛔ A hand-rolled `Legend` that tracked its Hebrew — one of six found 2026-08-27. The note at
     `WellDone.heroLabel` has the whole account; the short version is that `.16em` is a Latin
     device and this caption is a Hebrew word on the board she reads her own records from. */
  boardCaption: {
    flex: 1,
    color: color.textSecondary,
    textAlign: 'left',
  },
});
