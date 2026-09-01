/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS LIFT IS HERE — the reason for an exercise the engine PLACED rather than moved.
 *
 * ⛔ FOUNDER, 2026-08-11: the WHY per exercise, including one **not trained yet**.
 *
 * `WhyChangedSheet` argues about a LOAD: struck number, new number, her band, the two sessions that
 * decided it. None of that exists for a lift she has never performed — and in her first week that is
 * every lift she has, so the one screen this product is built around had nothing to say on the day
 * it matters most.
 *
 * ── WHY IT IS A SECOND SHEET AND NOT A SECTION OF THE FIRST ──────────────────────────────────────
 * They answer different questions and the first sheet's whole composition is the answer to its own:
 * a 70px load in the verdict's tone, glowing, over a drawn band with two marks on it. A placement
 * has no load, no direction and no band — folding it in would mean a sheet whose centrepiece is
 * absent half the time, and a shape that changes under her between two taps is not one explanation
 * with two halves, it is two explanations wearing one frame.
 *
 * What they DO share is the voice, the frame and the closing provenance line, and both are opened by
 * the same press on the same row — so the athlete meets one idea ("press a lift, it explains itself")
 * with two answers behind it, rather than a door that is sometimes locked.
 *
 * ── ⚠️ WHAT IS DELIBERATELY NOT ON IT ────────────────────────────────────────────────────────────
 * **The weekly TARGET.** `liftPlacement` carries it and this sheet never draws it, which looks like
 * an omission and is the most important decision here. `weeklyTargets` is not a quantity — at five
 * days it asks for ~208 weekly sets across the body, which is three hours a session — it is a set of
 * PROPORTIONS that `enforceTimeCap` scales into her hour. Printing "11 of 28 sets" would state a
 * goal she is being denied, when 28 was never a number anyone intended her to train. What is drawn
 * instead is the work she is actually given, and the one weekly figure that IS ratified as a
 * quantity: `WEEKLY_SETS_FLOOR`, the least that grows a muscle.
 *
 * ⚠️ AND THE FIGURE SHE IS SHOWN IS NOT THE FIGURE THE VERDICT IS DECIDED ON. She reads the sets on
 * her cards; the engine decides on `weeklyReceived`, which adds what her compounds lend the muscle.
 * That split is deliberate and it is stated at the verdict below — a number shown may be the
 * prescribed count, a number COMPARED must be the engine's.
 *
 * Nothing on this screen is computed here. Every line is a field of a measured `LiftPlacement`
 * (R7 — Hush never states a reason it did not measure).
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Legend, Button, Arrive } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { SHEET_SETTLE } from '@/components/BottomSheet';
import { useCopy } from '@/i18n/useCopy';
import { bidi } from '@/i18n/bidi';
import { color, font, stage, hold } from '@/design/tokens';

/** One measured fact about the placement, already worded by `whyHereProps`. */
export interface WhyHereFact {
  /** Stable key — the row's React key, and what a test names when it asserts a fact is present. */
  id: 'trains' | 'alsoWorks' | 'essential' | 'marked' | 'firstTime';
  text: string;
}

export interface WhyHereProps {
  /** "BARBELL ROW" — the lift, as the head of the argument. */
  liftName: string;
  /** The engine's headline for why this exercise is in her week. */
  title: string;
  /** The sets on THIS row, and the caption under them. */
  sets: number;
  setsNote: string;
  /** What the whole week carries for this muscle — the row's figure in context. */
  weeklyNote: string;
  facts: WhyHereFact[];
  /** The closing sentence about the dose. Empty draws nothing, as on the changed sheet. */
  line: string;
  /**
   * ⛔ THE ANSWER CARRIES THE VERB (founder, device QA 2026-08-23: *"ובלחיצה על תרגיל למה זה מציג
   * למה זה נבחר?"*). He tapped a lift to MANAGE it and got an explanation with no way to act — the
   * swap lived on a 17-point glyph he never saw. His own 2026-08-05 ruling (the row opens the WHY)
   * stands; what changes is that the why now ends with the one thing she can do about it. Absent on
   * surfaces that only report (the Mirror), exactly like `PlanLifts.onSwap`.
   */
  onSwap?: () => void;
  onClose: () => void;
}

export function WhyHereSheet(props: WhyHereProps) {
  const { t } = useCopy();
  return (
    <View style={styles.root}>
      {/*
        The same light the changed sheet opens with, in the neutral cream rather than a verdict's
        tone — nothing here went up or down, and lighting a placement in moss would claim a
        progression that has not happened. (`components/ds/Stage` pattern: absoluteFill on the
        WRAPPER, percentages inside; both on the <Svg> disagree on the first native frame.)
      */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="whyHereGlow" cx="50%" cy="-12%" rx="120%" ry="78%">
              <Stop offset="0" stopColor={hold.stage} stopOpacity="0.10" />
              <Stop offset="0.58" stopColor={hold.stage} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#whyHereGlow)" />
        </Svg>
      </View>

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* ⛔ A WAY OUT THAT IS NOT AN OATH (design review 2026-09-01). The only exit was "הבנתי"
            at the very foot — an athlete who opened this by mistake had to scroll past the whole
            argument and declare she understood it. Every sheet in the product carries a close at
            its head; this one does too now. */}
        <View style={styles.closeRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            hitSlop={10}
            onPress={props.onClose}
            style={({ pressed }) => [styles.closeDisc, pressed && styles.closeDiscPressed]}
          >
            <Icon name="close" size={18} color={color.textPrimary} strokeWidth={2} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {/*
            ════════════════════════════════════════════════════════════════════════════════════
            ⛔ STACKED, NOT SHARED — THE SAME FAULT ITS SIBLING HAD (2026-08-27).

            `WhyChangedSheet` put its KIND and its SUBJECT on one line with a spacer between them,
            and on the English locale the pair overflowed and broke a DATE in half. This sheet was
            built the same way, and measured against the 326 points this body leaves it overflows
            there too: `WHY THIS IS HERE` is ~214 points of tracked mono and `BARBELL ROW` ~112,
            before the dot and the gaps.

            ⚠️ IT FITS IN HEBREW, which is exactly why both copies survived. A header whose integrity
            depends on the SUM OF TWO TRANSLATED STRINGS is fragile by construction — and fixing one
            of them fixed one COPY of it.

            ✦ AND IT ARRIVES, after the sheet does (`SHEET_SETTLE`): the kind and its subject, then
            what the coach actually says.
            ════════════════════════════════════════════════════════════════════════════════════
          */}
          <Arrive order={0} after={SHEET_SETTLE} style={styles.head}>
            <View style={styles.headKind}>
              <View style={styles.dot} />
              <Legend track={0.2} tone="accent" style={styles.legend}>{t('whyHere.legend')}</Legend>
            </View>
            <Legend track={0} weight="regular">{bidi(props.liftName)}</Legend>
          </Arrive>

          <Arrive order={1} after={SHEET_SETTLE}>
            <Text style={styles.title} accessibilityRole="header">{props.title}</Text>
          </Arrive>

          {/* THE DOSE — the one figure a placement has. */}
          <View style={styles.dose}>
            <Text style={styles.sets}>{props.sets}</Text>
            <Text style={styles.setsNote}>{props.setsNote}</Text>
          </View>
          <Text style={styles.weekly}>{props.weeklyNote}</Text>

          {/* THE FACTS — every one of them a field the engine decided. */}
          <View style={styles.facts}>
            {props.facts.map((f, i) => (
              <View key={f.id} style={[styles.factRow, i === props.facts.length - 1 && styles.factRowLast]}>
                <View style={styles.bullet} />
                <Text style={styles.factText}>{f.text}</Text>
              </View>
            ))}
          </View>

          {props.line ? <Text style={styles.line}>{props.line}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          {/* The provenance, stated — as on the changed sheet, and it is a DIFFERENT provenance:
              that one was decided from her sets, this one from the map she drew and the hour she gave. */}
          <Legend size={17} track={0.14} align="center">{t('whyHere.decidedFrom')}</Legend>
          <Button variant="primary" size="whySheet" block label={t('whyLoad.got')} onPress={props.onClose} />
          {/* The verb under the answer — see `onSwap`. A ghost, so "understood" stays the act. */}
          {props.onSwap ? (
            <Button variant="ghost" size="whySheet" block label={t('swap.title')} onPress={props.onSwap} />
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

/**
 * A measured placement → what the sheet draws.
 *
 * The only work here is LANGUAGE, exactly as in `whyProps` beside the changed sheet: every value is
 * already established, and this chooses the words for it. It lives beside the sheet so that a second
 * door onto the same argument — the Mirror, a swap screen — cannot grow a second voice.
 */
export function whyHereProps(
  p: import('@/domain/whyLiftIsHere').LiftPlacement,
  liftName: string,
  t: (k: string, o?: Record<string, unknown>) => string,
  /** `WEEKLY_SETS_FLOOR` — passed in rather than imported, so the copy layer holds no constants. */
  weeklyFloor: number,
): Omit<WhyHereProps, 'onClose'> {
  const muscle = t(`muscle.${p.muscle}`, { defaultValue: p.muscle });
  /*
   * ⚠️ THE HEADLINE IS CHOSEN BY WHAT IS MOST HERS. Her own mark outranks the engine's structural
   * reason, because a week she shaped and a week she was handed are different things to be told —
   * and "you asked for this" is the only sentence on the screen she can check against her memory.
   */
  const title =
    p.stance === 'emphasis'
      ? t('whyHere.titleMarked', { muscle })
      : p.essential
        ? t('whyHere.titleEssential', { muscle })
        : t('whyHere.titlePlain', { muscle });

  const facts: WhyHereFact[] = [{ id: 'trains', text: t('whyHere.trains', { muscle }) }];
  if (p.alsoWorks.length > 0)
    facts.push({
      id: 'alsoWorks',
      text: t('whyHere.alsoWorks', {
        muscles: p.alsoWorks.map((m) => t(`muscle.${m}`, { defaultValue: m })).join(', '),
      }),
    });
  if (p.essential) facts.push({ id: 'essential', text: t('whyHere.essential', { muscle }) });
  if (p.stance === 'emphasis') facts.push({ id: 'marked', text: t('whyHere.marked', { muscle }) });
  // ⛔ S-38 — the opening load comes from her FIRST SET, so this is the one thing a never-performed
  // lift can honestly say about its weight. Saying nothing would leave the blank column unexplained.
  if (p.firstTime) facts.push({ id: 'firstTime', text: t('whyHere.firstTime') });

  /*
   * ⛔ THE CLOSING LINE IS THE ENGINE'S VERDICT, AND IT USED TO CONTRADICT IT (2026-08-18).
   *
   * It was `p.weeklySetsHere >= weeklyFloor` — the DIRECT set count — while the engine decides a
   * muscle is fed on `weeklyEffectiveSets`: direct sets plus what every compound lends the muscles it
   * also drives. Her biceps take 4 direct sets and about 3.5 from her rows, so `raiseToWeeklyFloor`
   * considers them dosed and will not spend another minute of her hour on them — and this sheet
   * closed with *"6 sets a week is the least that grows a muscle. This one has 4, and your hour is
   * why."* A complaint about a shortfall the engine does not believe in, that no regeneration could
   * ever clear, on the one screen whose job is to read the engine's decisions back (R7).
   *
   * ── THE THREE CASES, AND WHY ONE OF THEM SAYS NOTHING ────────────────────────────────────────────
   *   · her cards already carry the dose ......... `doseMet`, and the number she reads is the number
   *                                                 she can count. Received is never less than
   *                                                 prescribed, so the engine agrees.
   *   · the ENGINE says she is short ............. `doseShort`. Short on received implies short on
   *                                                 prescribed too, so the sentence's number is still
   *                                                 the one on her cards and still under the floor.
   *   · prescribed short, received enough ........ ⚠️ SILENCE. This is the case that was lying. The
   *                                                 engine is satisfied, her cards show four rows,
   *                                                 and no sentence in the copy can say *"and your
   *                                                 pulling feeds the rest"* — so it says nothing,
   *                                                 which is what R7 asks of a claim we cannot make.
   *                                                 The sheet already draws an empty `line`.
   *
   * ⚠️ AND SUPPLEMENTAL WORK IS NOT JUDGED AT ALL. The core block sits outside the volume pot —
   * `weeklyTargets` deletes Core before the week is dealt and every volume rule in `weekQuality`
   * excludes it — so telling her a core lift is under the dose holds it to a standard nothing aimed
   * at it. It said exactly that before this.
   */
  const line = !p.judgedByDose
    ? ''
    : p.weeklySetsHere >= weeklyFloor
      ? t('whyHere.doseMet', { floor: weeklyFloor, sets: p.weeklySetsHere })
      : p.weeklyReceived < weeklyFloor
        ? t('whyHere.doseShort', { floor: weeklyFloor, sets: p.weeklySetsHere })
        : '';

  return {
    liftName,
    title,
    sets: p.setsHere,
    setsNote: t('whyHere.setsToday'),
    weeklyNote: t('whyHere.weekly', { sets: p.weeklySetsHere, muscle }),
    facts,
    line,
  };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  safe: { flex: 1 },
  /* `justifyContent:'center'` when the content is short (design review 2026-09-01): the sheet's
     three blocks ended mid-screen with ~180 points of void before the footer — two screens glued.
     Centring shares that air above and below the argument instead of piling it underneath. */
  body: { flexGrow: 1, paddingHorizontal: 32, paddingTop: 4, paddingBottom: 16, justifyContent: 'center' },
  closeRow: { paddingHorizontal: 20, paddingTop: 8, alignItems: 'flex-start' },
  closeDisc: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(241,238,229,0.08)', borderWidth: 1, borderColor: 'rgba(241,238,229,0.12)' },
  closeDiscPressed: { backgroundColor: 'rgba(241,238,229,0.14)' },

  /* Two lines: the kind, then the subject — see the note at the markup. */
  head: { gap: 4 },
  headKind: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: hold.stage },
  legend: { color: hold.stage },

  // The same 39/39 serif statement the changed sheet opens with — one voice across both doors.
  title: { fontFamily: font.serif, fontSize: 39, lineHeight: 39, color: stage.ink0, marginTop: 16, textAlign: 'left' },

  dose: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 22 },
  sets: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 70,
    lineHeight: 70,
    letterSpacing: -2.8,
    color: stage.ink0,
    textAlign: 'left',
  },
  setsNote: { fontFamily: font.sans, fontSize: 17, color: stage.ink2, textAlign: 'left' },
  weekly: { fontFamily: font.sans, fontSize: 17, lineHeight: 20, color: '#c9c4b4', marginTop: 6, textAlign: 'left' },

  facts: { marginTop: 24, paddingTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(241,238,229,0.12)' },
  factRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241,238,229,0.08)',
  },
  factRowLast: { borderBottomWidth: 0 },
  bullet: { width: 5, height: 5, borderRadius: 2.5, marginTop: 8, backgroundColor: color.textMuted },
  factText: { flexShrink: 1, fontFamily: font.sans, fontSize: 17, lineHeight: 22, color: stage.ink1, textAlign: 'left' },

  line: { fontFamily: font.serif, fontSize: 19, lineHeight: 27, color: stage.ink0, marginTop: 'auto', paddingTop: 16, paddingBottom: 4, textAlign: 'left' },

  footer: { paddingHorizontal: 26, paddingTop: 12, paddingBottom: 30, gap: 11 },
});
