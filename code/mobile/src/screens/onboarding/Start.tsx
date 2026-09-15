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
import { track } from '@/platform/telemetry';
import { FUNNEL_EVENTS } from '@/platform/events';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, font, motion, radius, ramp, rampLine, stage, textScale } from '@/design/tokens';
import { setLocale, currentLocale, type Locale } from '@/i18n';
import { reloadApp } from '@/app/reload';
import type { OnboardingParamList } from '@/app/navigation';

type Props = NativeStackScreenProps<OnboardingParamList, 'Start'>;

/** The product's one settle curve, in the form reanimated wants it. */
const EASE = Easing.bezier(...motion.easeStandard);

export function Start({ navigation }: Props) {
  const { t } = useCopy();
  /*
   * LANGUAGE LIVES ON THE FRONT DOOR (founder 2026-07-12) — and the front door is THIS screen now
   * (2026-09-01, the wall moved behind the aha). Same control, same argument, same remount-on-
   * direction-change; it moved here with the job rather than staying on a screen she meets last.
   */
  const locale = currentLocale();
  async function pickLocale(next: string) {
    if (next === locale) return;
    try {
      await setLocale(next as Locale);
    } catch {
      return; // the language did not switch; a reload would remount in the OLD language
    }
    reloadApp();
  }
  /* ⛔ FUNNEL (2026-08-23; re-grounded 2026-09-01): one event per step REACHED. This IS the front door now — startReached means the app opened into the intake, and sign-in happens at the closer. */
  React.useEffect(() => {
    void track(FUNNEL_EVENTS.startReached);
  }, []);

  const go = (where: 'build' | 'bring') => {
    void track(FUNNEL_EVENTS.doorChosen, { door: where });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (where === 'build') navigation.navigate('AboutYou');
    else navigation.navigate('ImportPlan', { fromOnboarding: true });
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Step 1 of 5 — the journey's rail starts where the journey does (see `styles.rail`).
          Five is the count of railed steps she actually walks (fork, you, health, the doors, the
          ask) — it was four, drawn twice at the end, which read as a stall (audit lever 3). */}
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={locale === 'he' ? 'English' : 'עברית'}
          hitSlop={16}
          onPress={() => void pickLocale(locale === 'he' ? 'en' : 'he')}
          style={({ pressed }) => [styles.langSwap, pressed && styles.langSwapPressed]}
        >
          <Text style={styles.langSwapText}>{locale === 'he' ? 'English' : 'עברית'}</Text>
        </Pressable>
      </View>
      <View style={styles.rail}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.railSeg, i < 1 && styles.railSegOn]} />
        ))}
      </View>
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
        {/*
          ⛔ THE NOTE PROMISED A QUESTION THE INTAKE NEVER ASKS. It read "…shaped around what you can
          train AND THE TIME YOU HAVE", and nothing in the flow asks how long a session is:
          `BodyMap.relay()` does not carry `workoutMinutes` and `ProgramCreated` hard-defaults it to
          60. The first sentence of the product was selling a control that does not exist, so the
          clause is gone. Restoring the question is a product decision, not a repair.
        */}
        <Arrive order={2} style={styles.panelFlex}>
          <Panel
            title={t('start.buildTitle')}
            note={t('start.buildNote')}
            mark={<MeasureMark delay={520} />}
            onPress={() => go('build')}
          />
        </Arrive>

        <Arrive order={3} style={styles.panelFlex}>
          <Panel
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

/**
 * One of the two ways to begin. A whole-panel target — this is not a list, it is a fork.
 *
 * ⚠️ AND THE `seal` SLOT IS GONE WITH THE SEAL. The prop, its branch and its rules outlived the
 * founder's deletion below by six days: no call site ever passed one, so the panel carried an
 * optional third element that could never appear and a11y read a label composed around it.
 */
/*
 * ⛔ `ordinal` IS DELETED (2026-08-26, the elevation pass).
 *
 * `01` and `02` numbered two things that are NOT a sequence. She does one of these, not both and
 * not in that order — and numbering alternatives is the one thing that makes a fork read as a
 * checklist. Position already says which came first for anyone who cares, and nobody does.
 *
 * It also cost the panel its whole top row: with the ordinal gone the chevron stands alone at the
 * end, which is the only mark the card needed — *this goes somewhere*.
 */
function Panel({
  title,
  note,
  mark,
  onPress,
}: {
  title: string;
  note: string;
  mark: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${note}`}
      onPress={onPress}
      style={({ pressed }) => [styles.panel, pressed && styles.panelPressed]}
    >
      {/*
        ⛔ THE CORNER CHEVRON IS DELETED (2026-08-26, the elevation pass).
        
        Two reasons, and the second is the one that settles it:
        
          · IT WAS AN ORPHAN. With the ordinal gone it stood alone in a row of its own, a single
            glyph against the ceiling with the drawing floating below it — chrome held up by nothing.
            The panel is a bordered block with a title, a sentence and a press wash; nothing about it
            reads as un-pressable.
          · ⛔ IT COLLIDED WITH THE DRAWING. The BRING door already contains a chevron, and that one
            means something specific: her page becoming ours. Two identical glyphs on one card, one
            saying "this goes somewhere" and one saying "this becomes that", is the card arguing with
            itself in a vocabulary of one shape.
      */}
      <View style={styles.panelMark}>{mark}</View>

      <View style={styles.panelWords}>
        {/* ⛔ THE DOOR WEARS ITS MARK AGAIN (founder 2026-09-01, treating the deferred review
            finding). The 08-26 deletion argued two chevrons collide — but the BRING drawing's
            arrow is MOSS, central and part of a picture; this one is muted chrome at the title's
            end, the same disclosure every pressable row in the product carries. Different colour,
            different seat, different sentence. What the deletion got right stays: no orphan row —
            the chevron rides the title's own line. */}
        <View style={styles.panelTitleRow}>
          <Text style={styles.panelTitle}>{title}</Text>
          <Icon name="chevronRight" size={20} color={color.textMuted} strokeWidth={2} />
        </View>
        <Text style={styles.panelNote}>{note}</Text>
      </View>
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

  /*
   * ⛔ IT IS A PAGE NOW, WITH AN EDGE (2026-08-26, the elevation pass).
   *
   * The founder asked for *"a plan with our name on it"* and what was drawn was a header and three
   * horizontal grey bars of decreasing width — **the universal skeleton-loading idiom**. On glass
   * the first screen after sign-in looked like an app that had not finished loading, which is the
   * single worst thing a graphic can imitate.
   *
   * The tell was on the OTHER door: `markOurs` there has always had a bounded edge, and it is the
   * only one of the four stacks that reads as an object. Lines without a boundary are not a page.
   *
   * So both doors draw the same KIND of thing now — a bounded page — and the difference between
   * them is what is ON it. Ours carries the mark, in moss, because moss is where the decision lands.
   */
  return (
    <View style={styles.markSheet}>
      <View style={styles.markHead}>
        {/* ⛔ `size` was not a prop RangeMark has — it was silently dropped and the mark drew at
            its default 26. `width` is the name; found when the checker was allowed to look. */}
        <RangeMark width={20} />
        <Text style={styles.markWord}>hush</Text>
      </View>
      <View style={styles.markRule} />
      <View style={styles.measureTrack}>
        <Animated.View style={[styles.measureRule, rule]} />
      </View>
      {/* ⛔ NOT BARE BARS (design review 2026-09-01). Two uniform grey bars inside a page are the
          skeleton-loading idiom whatever frames them. A page of OURS holds a plan, so each line is
          a plan ROW: the day's tick, the entry, and the little load block at its end — content,
          not absence. */}
      <View style={styles.markRow}>
        <View style={styles.markDot} />
        <View style={[styles.markLine, { flex: 1, maxWidth: '52%' }]} />
        <View style={styles.markFig} />
      </View>
      <View style={styles.markRow}>
        <View style={styles.markDot} />
        <View style={[styles.markLine, { flex: 1, maxWidth: '68%' }]} />
        <View style={styles.markFig} />
      </View>
    </View>
  );
}

function SheetMark({ delay }: { delay: number }) {
  const reduced = useReducedMotion();
  /* Her page, an arrow, our page — the whole promise of this door in three shapes. */
  return (
    <View style={styles.markBring}>
      {/* HER page — the same object as ours, without our name on it. That is the whole sentence the
          arrow completes: this page becomes that one. Drawn as three bare lines it was a loader
          beside a chip, and the two halves did not read as the same kind of thing at all. */}
      <View style={styles.markPaper}>
        {/* HER plan's rows — the same row grammar as our page (tick · entry), so the arrow reads
            "this page becomes that one" instead of "loader beside a chip". */}
        {[1, 0.72, 0.86].map((w, i) => (
          <View key={i} style={styles.markRow}>
            <View style={styles.markDot} />
            <SheetLine width={w} delay={reduced ? 0 : delay + i * 90} reduced={reduced} />
          </View>
        ))}
      </View>
      <Icon name="chevronRight" size={22} color={color.up} strokeWidth={2.5} />
      <View style={styles.markOurs}>
        {/* ⛔ `size` was not a prop RangeMark has — it was silently dropped and the mark drew at
            its default 26. `width` is the name; found when the checker was allowed to look. */}
        <RangeMark width={20} />
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
  /* The intake's own rail (OnboardingScaffold.seg, verbatim geometry) — the fork is STEP ONE of
     the journey, and until now the first two screens floated outside it (design review 2026-09-01:
     the rail appeared mid-journey and counted something she couldn't see). */
  topBar: { paddingHorizontal: 26, paddingTop: 14, alignItems: 'flex-start' },
  /* The language offer — the exact capsule Authentication wore when it was the front door. */
  langSwap: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.fillSubtle,
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.14)',
  },
  langSwapPressed: { backgroundColor: color.fillSubtleStrong },
  langSwapText: {
    fontFamily: font.sansMedium,
    fontSize: textScale.sm,
    color: color.textPrimary,
    textAlign: 'left',
  },
  rail: { flexDirection: 'row', gap: 6, paddingHorizontal: 26, paddingTop: 12 },
  railSeg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(241,238,229,0.15)' },
  railSegOn: { backgroundColor: color.textPrimary },
  /* The question, then the two doors — with the air between them that says they are alternatives
     rather than steps. `gap: 16` is the pair's own rhythm; the title carries its own margins. */
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 20, gap: 16 },

  // The question takes the serif and the size the front door's promise wears — it is the same voice
  // asking, one screen later.
  title: { fontFamily: font.serif, fontSize: ramp.title, lineHeight: rampLine.title, color: stage.ink0, marginTop: 10, marginBottom: 8, textAlign: 'left' },

  /*
   * ⛔ THE PANELS NO LONGER STRETCH (2026-08-26, the elevation pass).
   *
   * `flex: 1` on both wrappers split the leftover height evenly, which was the right cure for an
   * earlier draft's "two small boxes and an empty middle" and became its own version of the same
   * fault: each card grew to ~250 points around ~90 points of content, so `space-between` pushed a
   * chevron to the ceiling, left the drawing floating in a void, and dropped the words to the
   * floor. Card TWO was then clipped by the bottom of the screen — **the second of two options was
   * half-visible at the moment the screen says there are two.**
   *
   * A card that fits its content is a card. The pair sits under the question with real air between
   * them, both whole, both above the fold — which is the only thing this screen has to achieve.
   */
  panelFlex: {},

  panel: {
    gap: 18,
    paddingVertical: 22,
    paddingHorizontal: 22,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.16)',
  },
  /* A press is a WASH under the panel, never a fade of it (founder A.13). */
  panelPressed: { backgroundColor: 'rgba(241,238,229,0.06)' },


  panelMark: { justifyContent: 'center', minHeight: 34 },
  panelWords: { gap: 7 },
  /* 27 → 24 (`ramp.subhead`). Twenty-seven was a size this screen invented for itself, three points
     from a rung the app already had and one point from two others elsewhere in the product. */
  panelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  panelTitle: { flex: 1, fontFamily: font.serif, fontSize: ramp.subhead, lineHeight: rampLine.subhead, color: stage.ink0, textAlign: 'left' },
  panelNote: { fontFamily: font.sans, fontSize: 17, lineHeight: 21, color: color.textSecondary, textAlign: 'left' },

  /* ── the two marks ── */
  /* ── THE TWO DRAWINGS — see the note above `MeasureMark`. ── */
  /* OUR page: a bounded sheet in the accent, our mark at its head, the week filling in under it. */
  markSheet: {
    alignSelf: 'stretch',
    gap: 9,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(169,196,159,0.45)',
    backgroundColor: 'rgba(169,196,159,0.10)',
  },
  markHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  markWord: { fontFamily: font.serif, fontSize: 17, color: color.up, textAlign: 'left' },
  markRule: { height: 1, backgroundColor: 'rgba(169,196,159,0.35)' },
  /* A row of the drawn plan: day tick · entry line · load block. 0.14 → 0.30: the entry has to
     read as INK on the page, not as the wash a skeleton bar is drawn in. */
  markRow: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'stretch' },
  markDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(169,196,159,0.8)' },
  markFig: { width: 9, height: 5, borderRadius: 1.5, backgroundColor: 'rgba(241,238,229,0.45)', marginStart: 'auto' },
  markLine: { height: 2, borderRadius: 1, backgroundColor: 'rgba(241,238,229,0.30)' },
  markBring: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  /* HER page: the same sheet, in the neutral — no mark, because it is not ours yet. */
  markPaper: {
    flex: 1,
    gap: 6,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(241,238,229,0.18)',
  },
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
  /* ⚠️ `measure` AND `measureCap` ARE GONE. They drew the abstract "rule growing out of a start cap"
     the founder replaced with the two sheet drawings on 2026-08-12; only the track and the rule
     inside `MeasureMark` survived that redraw. `sheet` went the same way — `markPaper` holds the
     three lines now. Rules nothing renders are a description of a screen that is not there. */
  measureTrack: { flex: 1, height: 2, marginStart: -1 },
  measureRule: { height: 2, backgroundColor: stage.ink1 },

  sheetLine: { height: 2, borderRadius: 2, backgroundColor: stage.ink1, flexShrink: 1 },
});
