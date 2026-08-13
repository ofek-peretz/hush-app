/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHERE DO WE START — the fork, and the first real decision in the product.
 *
 * ⛔ FOUNDER, 2026-08-12: *"למה כתוב בכל כך קטן האפשרות להוספת תוכנית קיימת? זה לא פיצ'ר אלא זה חלק
 * מהמוצר שלנו שהגדרנו מערכת שלמה עבורו … אפילו אפשר לעשות לזה מסך נפרד."*
 *
 * ── WHAT THIS REPLACES, AND WHY HE IS RIGHT ─────────────────────────────────────────────────────
 * It was one underlined grey line, 14px, under the Continue button on the bodyweight step. Behind
 * that line: a matcher, a prompt, a background runner that survives four screen transitions, a
 * review screen, a balance pass, and 96 laws. **The largest system in the intake was drawn as its
 * smallest control** — and a control's SIZE is the app saying how much it matters.
 *
 * It was also in the wrong grammar. Underneath "Continue" it reads as an escape hatch from the form
 * she is filling in. It is not an escape from anything: it is one of the two ways this product
 * begins, and the two are peers.
 *
 * ── ⛔ AND THE FIRST DRAFT OF THIS SCREEN MADE THE SAME MISTAKE AT LARGER SCALE ──────────────────
 * FOUNDER, hours later: *"יש לך כאן מסך שלם ואתה שם סך הכל 2 תיבות קטנות בראש המסך ומשאיר חלל ענק
 * ריק במרכז המסך עם משפט קטן למטה שאף אחד לא יקרא … איזה מסך משעמם עשית אותו."*
 *
 * Correct, and it is worth naming precisely rather than just redrawing. I had promoted the import
 * from a 14px line to a 104px card and stopped — two cards at the top, a `flex: 1` spacer, and the
 * one sentence that answers the only fear anyone has about the second door parked in 11px type
 * below the fold of attention. **A screen whose whole content is a choice must be MADE of the
 * choice.** The empty middle was the screen saying the decision is small.
 *
 * So the two doors are now PANELS: they split the body between them and take every pixel the
 * question does not. Each carries its own ordinal, its own mark, its title in the coach's serif at
 * 27px, and — for the second — the guarantee, on the card it is about, where it is read.
 *
 * ── ⚠️ WHY IT IS AFTER THE FRONT DOOR AND BEFORE EVERYTHING ELSE ────────────────────────────────
 * Sign-in, then this (`Root.tsx`; and the gallery calls it `1.1b` for the same reason). Most
 * athletes will press the first panel and never think about it again, so a screen in front of them
 * has to earn its place. It earns it twice:
 *
 *   · IT CHANGES EVERYTHING AFTER IT. A woman who brought a programme is not answering the same six
 *     questions for the same reason; her week already exists and the intake is only fitting loads to
 *     it. Asking at the END would mean discarding what the middle just built.
 *   · THE READ RUNS UNDERNEATH THE REST. The model takes twenty to sixty seconds on a photograph.
 *     Started here it finishes while she answers her bodyweight; started later she watches a spinner
 *     on the one screen standing between her and her programme (`domain/pendingImport`).
 *
 * ⚠️ AND THE DEFAULT IS NOT PRE-SELECTED. Two panels, one geometry, no highlight, no "recommended" —
 * the first is simply first, which is how a fork should read when both directions are real. A
 * pre-selected option is a form; this is a question.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Arrive, Legend } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { RangeMark } from '@/components/RangeMark';
import { useCopy } from '@/i18n/useCopy';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, font, motion, stage } from '@/design/tokens';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'Start'>;

/** The product's one settle curve, in the form reanimated wants it. */
const EASE = Easing.bezier(...motion.easeStandard);

export function Start({ navigation }: Props) {
  const { t } = useCopy();

  const go = (where: 'build' | 'bring') => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (where === 'build') navigation.navigate('AboutYou');
    else navigation.navigate('ImportPlan', { fromOnboarding: true });
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <Arrive order={0}>
          <Legend size={17} track={0.22}>{t('start.legend')}</Legend>
        </Arrive>
        <Arrive order={1}>
          <Text style={styles.title} accessibilityRole="header">{t('start.title')}</Text>
        </Arrive>

        {/*
          ⚠️ TWO PANELS, ONE GEOMETRY — the same rule the sign-in buttons follow. Neither path is the
          product's preference, so neither may look like it: equal flex, same border, same weight,
          same type ramp. What differs is only the words and the mark, which is where the difference
          actually is. `flex: 1` on both is what makes that a promise rather than a coincidence — a
          longer note can never buy one door more of the screen than the other.
        */}
        <Arrive order={2} style={styles.panelFlex}>
          <Panel
            ordinal="01"
            title={t('start.buildTitle')}
            note={t('start.buildNote')}
            mark={<MeasureMark delay={520} />}
            onPress={() => go('build')}
          />
        </Arrive>

        <Arrive order={3} style={styles.panelFlex}>
          <Panel
            ordinal="02"
            title={t('start.bringTitle')}
            note={t('start.bringNote')}
            mark={<SheetMark delay={660} />}
            /*
              ⛔ THE SEAL IS DELETED (founder, 2026-08-12): *"תמחק את השורה בחלק התחתון של המסך שאנו
              לא משנים לתוכנית כלום — זה סתם תופס מקום במסך וזה משפט שאף אחד לא קורא."*

              It read "A PROGRAMME YOU BRING IS NEVER REWRITTEN" — the `authored` guarantee, argued
              onto this card two drafts ago on the grounds that a guarantee belongs against the thing
              it guarantees. **He has now called it unread twice**, and the drawing above says the
              same thing without a sentence: her page goes INTO ours, whole. The guarantee is not
              weakened by going unstated here; it is enforced by `engineMayRebuild` and its law.
            */
            onPress={() => go('bring')}
          />
        </Arrive>
      </View>
    </SafeAreaView>
  );
}

/** One of the two ways to begin. A whole-panel target — this is not a list, it is a fork. */
function Panel({
  ordinal,
  title,
  note,
  mark,
  seal,
  onPress,
}: {
  ordinal: string;
  title: string;
  note: string;
  mark: React.ReactNode;
  seal?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${note}${seal ? `. ${seal}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.panel, pressed && styles.panelPressed]}
    >
      <View style={styles.panelTop}>
        <Text style={styles.ordinal}>{ordinal}</Text>
        {/* The direction of travel, quiet. It mirrors with the writing direction like any glyph. */}
        <Icon name="chevronRight" size={18} color={stage.ink2} strokeWidth={1.5} />
      </View>

      <View style={styles.panelMark}>{mark}</View>

      <View style={styles.panelWords}>
        <Text style={styles.panelTitle}>{title}</Text>
        <Text style={styles.panelNote}>{note}</Text>
      </View>

      {seal ? (
        <View style={styles.seal}>
          <View style={styles.sealRule} />
          <Legend size={17} track={0.16}>{seal}</Legend>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * ⚠️ EACH DOOR CARRIES A MARK, AND BOTH MARKS ARE THE SAME TWO INGREDIENTS — rules and space. They
 * are drawn from Views rather than icons because that is already the house idiom for a measuring
 * mark (`ProgramCreated.StartFinishMark`), and because a glyph set would put two illustrations on
 * the first screen after sign-in.
 *
 * BUILD is a measurement being taken: a rule that grows out of a start cap.
 * BRING is a page already written: three lines that are simply there, arriving top to bottom.
 *
 * Under reduced motion both are at rest from the first frame. `Arrive` already refuses to animate
 * there, and a mark that kept drawing inside a panel that did not would be the one moving thing on
 * a screen someone asked to hold still.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE TWO MARKS ARE DRAWINGS NOW (founder, 2026-08-12)
 *
 *   *"במקום הקווים תצייר אולי במסך הראשון לתוכנית שהשם שלנו מופיע עליה, ולאפשרות השנייה של תוכנית
 *   מיובאת אתה יכול לצייר את זה כתוכנית עם חץ לתוך השם שלנו … ותוסיף את הצבע הירוק שלנו למסך הזה."*
 *
 * They were a growing rule and three ragged lines — abstract enough that neither said which door it
 * was, and both in the same grey. The fork is between a week **we write** and a week **she brings**,
 * so each mark shows exactly that: a sheet with our mark on it, and a sheet travelling INTO ours.
 *
 * ⚠️ AND THE GREEN IS THE POINT OF THE SECOND ONE. Moss means "a decision made" in this palette; on
 * this screen the decision is hers, and the accent marks the destination — our page — in both.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
function MeasureMark({ delay }: { delay: number }) {
  const reduced = useReducedMotion();
  const grow = useSharedValue(reduced ? 1 : 0);
  React.useEffect(() => {
    if (reduced) return;
    grow.value = withDelay(delay, withTiming(1, { duration: motion.dur[5], easing: EASE }));
  }, [delay, grow, reduced]);
  const rule = useAnimatedStyle(() => ({ width: `${grow.value * 100}%` }));

  /* A page we write: our mark at its head, and the week filling in under it. */
  return (
    <View style={styles.markSheet}>
      <View style={styles.markHead}>
        <RangeMark size={20} />
        <Text style={styles.markWord}>hush</Text>
      </View>
      <View style={styles.markRule} />
      <View style={styles.measureTrack}>
        <Animated.View style={[styles.measureRule, rule]} />
      </View>
      <View style={[styles.markLine, { width: '62%' }]} />
      <View style={[styles.markLine, { width: '78%' }]} />
    </View>
  );
}

function SheetMark({ delay }: { delay: number }) {
  const reduced = useReducedMotion();
  /* Her page, an arrow, our page — the whole promise of this door in three shapes. */
  return (
    <View style={styles.markBring}>
      <View style={styles.markPaper}>
        {[1, 0.72, 0.86].map((w, i) => (
          <SheetLine key={i} width={w} delay={reduced ? 0 : delay + i * 90} reduced={reduced} />
        ))}
      </View>
      <Icon name="chevronRight" size={22} color={color.up} strokeWidth={2.5} />
      <View style={styles.markOurs}>
        <RangeMark size={20} />
        <Text style={styles.markWord}>hush</Text>
      </View>
    </View>
  );
}

function SheetLine({ width, delay, reduced }: { width: number; delay: number; reduced: boolean }) {
  const t = useSharedValue(reduced ? 1 : 0);
  React.useEffect(() => {
    if (reduced) return;
    t.value = withDelay(delay, withTiming(1, { duration: motion.dur[4], easing: EASE }));
  }, [delay, t, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ translateX: (1 - t.value) * -6 }] }));
  return <Animated.View style={[styles.sheetLine, { width: `${width * 62}%` }, style]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 20, gap: 12 },

  // The question takes the serif and the size the front door's promise wears — it is the same voice
  // asking, one screen later.
  title: { fontFamily: font.serif, fontSize: 40, lineHeight: 45, color: stage.ink0, marginTop: 10, marginBottom: 8, textAlign: 'left' },

  /* ⚠️ THE FLEX LIVES ON THE `Arrive` WRAPPER, not on the panel. `Arrive` is an `Animated.View` in
     the middle of the tree, and a `flex: 1` panel inside a shrink-wrapped wrapper cannot expand —
     which is precisely how the first draft ended up with two small boxes and an empty middle. */
  panelFlex: { flex: 1 },

  panel: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 22,
    paddingHorizontal: 22,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.16)',
  },
  /* A press is a WASH under the panel, never a fade of it (founder A.13). */
  panelPressed: { backgroundColor: 'rgba(241,238,229,0.06)' },

  panelTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // 13, not 12: `typeHasAFloor` caught it on the first run and it is right to. An ordinal is small
  // BY ROLE, and "small by role" is exactly the argument every unreadable line in an app is made with.
  ordinal: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: 17, letterSpacing: 1.7, color: stage.ink2, textAlign: 'left' },

  panelMark: { justifyContent: 'center', minHeight: 34 },
  panelWords: { gap: 7 },
  panelTitle: { fontFamily: font.serif, fontSize: 27, lineHeight: 33, color: stage.ink0, textAlign: 'left' },
  panelNote: { fontFamily: font.sans, fontSize: 17, lineHeight: 21, color: color.textSecondary, textAlign: 'left' },

  seal: { gap: 9, marginTop: 16 },
  sealRule: { height: 1, backgroundColor: 'rgba(241,238,229,0.12)' },

  /* ── the two marks ── */
  /* ── THE TWO DRAWINGS — see the note above `MeasureMark`. ── */
  markSheet: { alignSelf: 'stretch', gap: 9 },
  markHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  markWord: { fontFamily: font.serif, fontSize: 17, color: color.up, textAlign: 'left' },
  markRule: { height: 1, backgroundColor: 'rgba(169,196,159,0.35)' },
  markLine: { height: 2, borderRadius: 1, backgroundColor: 'rgba(241,238,229,0.14)' },
  markBring: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  markPaper: { flex: 1, gap: 6 },
  markOurs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(169,196,159,0.45)',
    backgroundColor: 'rgba(169,196,159,0.10)',
  },
  measure: { flexDirection: 'row', alignItems: 'center', height: 18 },
  measureCap: { width: 2, height: 18, backgroundColor: stage.ink1 },
  measureTrack: { flex: 1, height: 2, marginStart: -1 },
  measureRule: { height: 2, backgroundColor: stage.ink1 },

  sheet: { gap: 5 },
  sheetLine: { height: 2, borderRadius: 2, backgroundColor: stage.ink1 },
});
