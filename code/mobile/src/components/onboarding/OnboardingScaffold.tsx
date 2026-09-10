/**
 * OnboardingScaffold — the shared chrome for the design's onboarding flow
 * (ui_kits/app/Onboarding.jsx): an optional back control, a segmented progress
 * bar, the head (legend → title → sub), the body, and a pinned footer.
 * One decision per screen, nothing optional dressed up as required.
 *
 * Founder 2026-07-10: onboarding NEVER scrolls — every step is designed to fit the viewport
 * whole. A step that doesn't fit is a copy/layout bug on that step, not a reason to scroll.
 *
 * That law still holds, and the body still LOOKS like a plain View: on every device where the
 * step fits, nothing moves and there is no scroll indicator (2026-07-12). What changed is the
 * failure mode. The body was literally a View, so a step that overflowed simply had its bottom
 * — including the footer's Continue — pushed off the screen with no way to reach it: an
 * unrecoverable dead end during onboarding, on the smallest phones, where the athlete has not
 * even reached the app yet. It is now a ScrollView with `flexGrow: 1`, which does not scroll
 * while the content fits and yields rather than clips when it doesn't.
 *
 * This is a SAFETY NET, not a licence. A step that actually scrolls on the reference frame is
 * still a bug on that step. But "the athlete cannot press Continue" must never be the way we
 * find out.
 */

// 

import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, PanResponder, I18nManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Arrive, Legend } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { FooterFade } from '@/components/ds/FooterFade';
import { useCopy } from '@/i18n/useCopy';
import { color, space, font, ramp, textScale, tracking, trackingPx } from '@/design/tokens';

/** A back-drag must travel this far (and be more horizontal than vertical) before it counts. */
const SWIPE_BACK_DX = 56;

interface Props {
  onBack?: () => void;
  progress?: { index: number; total: number }; // e.g. { index: 1, total: 6 }
  legend?: string;
  title: string;
  sub?: string;
  /**
   * The coach's line, in italic serif (v7): a single spoken sentence that sits between the
   * title and the body — "I show it. It never decides a weight." It is the voice, not the
   * fine print; a step's factual `sub` stays sans below it. Rendered only when given.
   */
  voice?: string;
  keyboard?: boolean; // wrap the body in a KeyboardAvoidingView (typed inputs)
  footer?: React.ReactNode;
  /**
   * Back-drag confined to the FOOTER (founder 2026-07-13). A step whose body is made of
   * horizontal wheels cannot also be a step you leave with a horizontal drag: on Body data the
   * whole screen is a back gesture, so every attempt to set an age dragged the screen towards
   * the previous step instead of turning the rule. The navigator's own gesture is switched OFF
   * on such a step, and the way back by hand lives down here, in the one band that holds no
   * wheel — the athlete drags across the footer and the step recedes. The arrow in the top bar
   * is, as ever, the way back that always works.
   */
  onSwipeBack?: () => void;
  /**
   * Centre the children vertically in the space between the head and the footer, instead of
   * top-aligning them. For a short, self-contained control set (the wheels on Body data, the one
   * wheel on the schedule step) top-alignment leaves a large dead band above the pinned Continue —
   * the balance reads as unfinished. Off by default so no existing step shifts; opt in per screen.
   */
  centerContent?: boolean;
  /**
   * Air between the head and the body. The handoff's onboarding steps are one flex column
   * with a single gap, and that gap is not the same on every step: 1.2 breathes at 40, 1.3
   * — which carries a legend, a title, a spoken line AND a card — closes to 32.
   */
  headGap?: number;
  /** Air above the head. 44 on the steps that lead with a headline; 30 where the body is long. */
  bodyTop?: number;
  /**
   * The headline's size.
   *
   * ⛔ 44 → `ramp.title` (40) ON 2026-08-26, and the prop kept ONE caller: none. The comment said
   * *"1.4 sets 42 to fit About you over two rulers"* and no screen has passed a `titleSize` in a
   * long time — so what it actually documented was a third headline size that existed only as an
   * option. Every onboarding step now speaks at the same size, and it is a size the app's ramp has.
   *
   * ⚠️ AND `Start` WAS ALREADY OFF ON ITS OWN. The fork after sign-in sets its own headline (40),
   * so the first two screens of the product introduced themselves at two different sizes — which is
   * the kind of thing nobody can name and everybody feels.
   */
  titleSize?: number;
  children?: React.ReactNode;
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ NO TITLE ENDS ON A WORD ALONE (founder's screenshots, 2026-08-21).
 *
 * "Connect health data" broke as **Connect health / data** — one word, on its own line, under a
 * serif set at 40 pt. It is the first thing on the screen and the break is the first thing the eye
 * resolves, so an orphan there reads as a layout that came out wrong rather than as a sentence.
 *
 * ── WHY IT IS A RULE AND NOT ELEVEN EDITED STRINGS ──────────────────────────────────────────────
 * Six of the eleven onboarding titles are long enough to wrap, in two languages, at a size that
 * changes with the device — and the copy is edited constantly. Rewording each one to fit is a fix
 * with a shelf life of one commit. Binding the last two words with a non-breaking space is a
 * TYPOGRAPHIC rule: the break moves earlier and the last line always carries at least two words,
 * whatever the copy says tomorrow and whichever language it is in.
 *
 * ⚠️ IT BINDS THE LAST TWO WORDS, NEVER MORE. A longer bind starts forcing breaks that are worse
 * than the orphan it prevents, and a title of two words has nothing to fix.
 */
const NBSP = ' ';
/**
 * ⚠️ IT TAKES A MISSING TITLE, and that is not defensive clutter — it is a crash I wrote and my own
 * screen sweep caught within the hour (2026-08-21). `title` is typed `string`, but a caller resolves
 * it through `tg()`, which answers `undefined` when i18n has not initialised. Before this helper an
 * absent title simply drew nothing; after it, `undefined.trimEnd()` took the whole screen down. A
 * typographic nicety may not be the thing that decides whether a screen renders.
 */
export const noOrphan = (s: string | null | undefined): string => {
  if (!s) return '';
  const at = s.trimEnd().lastIndexOf(' ');
  return at <= 0 || s.trimEnd().indexOf(' ') === at ? s : s.slice(0, at) + NBSP + s.slice(at + 1);
};

export function OnboardingScaffold({
  onBack,
  progress,
  legend,
  title,
  sub,
  voice,
  keyboard,
  footer,
  onSwipeBack,
  centerContent,
  headGap = 40,
  bodyTop = 44,
  titleSize = ramp.title,
  children,
}: Props) {
  const { t } = useCopy();

  // The drag travels in the reading direction's "back": rightwards in LTR, leftwards in RTL —
  // the same direction the platform's own edge gesture would carry it.
  const backPan = useMemo(() => {
    if (!onSwipeBack) return null;
    const back = (dx: number) => (I18nManager.isRTL ? dx <= -SWIPE_BACK_DX : dx >= SWIPE_BACK_DX);
    return PanResponder.create({
      // A tap must still reach the Continue button underneath — only a real horizontal travel
      // claims the gesture.
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_e, g) => {
        if (back(g.dx)) onSwipeBack();
      },
    });
  }, [onSwipeBack]);

  const Body = (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.body, { paddingTop: bodyTop }]}
      // Reads as a static page until the moment it cannot be one.
      showsVerticalScrollIndicator={false}
      bounces={false}
      keyboardShouldPersistTaps="handled"
    >
      {/*
        ════════════════════════════════════════════════════════════════════════════════════════
        ✦ THE SCAFFOLD ARRIVES, SO SIX SCREENS DO (2026-08-27).

        `Arrive` was built for the founder's largest note — a screen should ARRIVE, not appear
        (2026-08-12) — and reached six screens out of forty-seven. Six MORE of them share this
        shell: About you, the body map, Building programme, Connect health, the body-map editor, the
        exercise library and On your wrist. Giving the shell its beats gives all of them one, in the
        same rhythm, from one place — which is the whole argument `Arrive`'s own docblock makes
        about why the stagger is a token and not a per-screen decision.

        Two beats and no more: the HEAD is what the screen is, and the BODY is what it asks. A
        scaffold cannot know how many parts its children have, so it must not pretend to — a screen
        that wants its own inner sequence numbers from 2 upward and stays in step, because the step
        is `ARRIVE_STAGGER` and nobody owns a different one.
        ════════════════════════════════════════════════════════════════════════════════════════
      */}
      <Arrive order={0} style={[styles.head, { marginBottom: headGap }]}>
        {legend ? <Legend style={styles.legend}>{legend}</Legend> : null}
        <Text
          style={[styles.title, { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.05), letterSpacing: trackingPx(titleSize, tracking.display) }]}
          accessibilityRole="header"
        >
          {noOrphan(title)}
        </Text>
        {voice ? <Text style={styles.voice}>{voice}</Text> : null}
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </Arrive>
      <Arrive order={1}>
        {centerContent ? <View style={styles.centerWrap}>{children}</View> : children}
      </Arrive>
    </ScrollView>
  );

  const Footer = footer ? (
    <View style={styles.footer} {...(backPan ? backPan.panHandlers : {})}>
      {/* The body scrolls on under this footer; the fade is the one signal that says so
          (design review 2026-09-01 — the library's tenth muscle group was invisible without it). */}
      <FooterFade />
      {footer}
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        {onBack ? (
          // The glyph sits flush at the 26px gutter — no button padding around it, exactly
          // 22px of chevron. The tap target is bought with hitSlop instead of with air.
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={onBack} hitSlop={12} style={styles.back}>
            <Icon name="chevronLeft" size={22} color={color.textPrimary} strokeWidth={1.8} />
          </Pressable>
        ) : null}
        {progress ? (
          <>
            <View style={styles.progress}>
              {Array.from({ length: progress.total }).map((_, i) => (
                <View key={i} style={[styles.seg, i < progress.index ? styles.segOn : styles.segOff]} />
              ))}
            </View>
            {/*
              ⛔ THE STEP COUNTER IS DELETED (founder 2026-08-04): *"onboarding is something people
              fill in and move on from."*

              "1/5" is a chore meter — it tells her how much is LEFT of the boring part, which is a
              thing only a boring part needs to say. The rail beside it shows exactly the same
              progress without counting it, and the difference between the two is the difference
              between a horizon and a queue.
            */}
          </>
        ) : null}
      </View>

      {keyboard ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {Body}
          {Footer}
        </KeyboardAvoidingView>
      ) : (
        <>
          {Body}
          {Footer}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  // The rail: 26px gutter, 20px down from the status bar, 16px between glyph · bars · count.
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: space.gutter, paddingTop: 20 },
  back: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', gap: 6, flex: 1 },
  seg: { flex: 1, height: 3, borderRadius: 2 },
  segOn: { backgroundColor: color.textPrimary },
  // The steps ahead: a 15% cream rail, not the 10% fill used for control grounds.
  segOff: { backgroundColor: 'rgba(241,238,229,0.15)' },

  // flexGrow (not flex) — the content keeps its natural height and only takes the full
  // viewport when it is SHORTER than it, which is what makes the page read as static.
  // The body's own gutter is 30 (the rail and the footer sit at 26).
  body: { flexGrow: 1, paddingHorizontal: 30, paddingBottom: 12 },
  head: {},
  // Centre a short control set in the space between the head and the footer (centerContent).
  centerWrap: { flex: 1, justifyContent: "center", paddingBottom: 24 },
  legend: { marginBottom: 18 },
  // v7: the step's headline is the coach's serif voice, not a sans label — 44px/1.05 Frank Ruhl Libre.
  title: { fontFamily: font.serif, color: color.textPrimary, textAlign: 'left' },
  // The spoken line under the title — italic serif, 22px/1.4, one breath.
  voice: { fontFamily: font.serif, fontSize: 22, lineHeight: 31, color: color.textSecondary, marginTop: 18, textAlign: 'left' },
  // The factual line under the title — sans, 14/1.5, and it sits CLOSE (8): it finishes the
  // headline's sentence rather than starting a new thought.
  sub: { fontFamily: font.sans, fontSize: 17, lineHeight: 21, color: color.textSecondary, marginTop: 8, textAlign: 'left' },

  footer: { paddingHorizontal: space.gutter, paddingTop: 14, paddingBottom: 30, gap: 14 },
});
