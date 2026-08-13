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
 * instead is what she actually receives, and the one weekly figure that IS ratified as a quantity:
 * `WEEKLY_SETS_FLOOR`, the least that grows a muscle.
 *
 * Nothing on this screen is computed here. Every line is a field of a measured `LiftPlacement`
 * (R7 — Hush never states a reason it did not measure).
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Legend, Button } from '@/components/ds';
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
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.head}>
            <View style={styles.dot} />
            <Legend track={0.2} tone="accent" style={styles.legend}>{t('whyHere.legend')}</Legend>
            <View style={styles.flex} />
            <Legend track={0} weight="regular">{bidi(props.liftName)}</Legend>
          </View>

          <Text style={styles.title} accessibilityRole="header">{props.title}</Text>

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

  return {
    liftName,
    title,
    sets: p.setsHere,
    setsNote: t('whyHere.setsToday'),
    weeklyNote: t('whyHere.weekly', { sets: p.weeklySetsHere, muscle }),
    facts,
    line:
      p.weeklySetsHere >= weeklyFloor
        ? t('whyHere.doseMet', { floor: weeklyFloor, sets: p.weeklySetsHere })
        : t('whyHere.doseShort', { floor: weeklyFloor, sets: p.weeklySetsHere }),
  };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  safe: { flex: 1 },
  flex: { flex: 1 },
  body: { flexGrow: 1, paddingHorizontal: 32, paddingTop: 24 },

  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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

  line: { fontFamily: font.serif, fontStyle: 'italic', fontSize: 19, lineHeight: 27, color: stage.ink0, marginTop: 'auto', paddingTop: 16, paddingBottom: 4, textAlign: 'left' },

  footer: { paddingHorizontal: 26, paddingTop: 12, paddingBottom: 30, gap: 11 },
});
