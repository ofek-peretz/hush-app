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
import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, PanResponder, I18nManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton, Legend } from '@/components/ds';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { color, space, font, textScale, tracking, trackingPx, signal } from '@/design/tokens';

/** A back-drag must travel this far (and be more horizontal than vertical) before it counts. */
const SWIPE_BACK_DX = 56;

interface Props {
  onBack?: () => void;
  progress?: { index: number; total: number }; // e.g. { index: 1, total: 6 }
  legend?: string;
  title: string;
  sub?: string;
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
  children?: React.ReactNode;
}

export function OnboardingScaffold({ onBack, progress, legend, title, sub, keyboard, footer, onSwipeBack, children }: Props) {
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
      contentContainerStyle={styles.body}
      // Reads as a static page until the moment it cannot be one.
      showsVerticalScrollIndicator={false}
      bounces={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.head}>
        {legend ? <Legend style={styles.legend}>{legend}</Legend> : null}
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      {children}
    </ScrollView>
  );

  const Footer = footer ? (
    <View style={styles.footer} {...(backPan ? backPan.panHandlers : {})}>
      {footer}
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        {onBack ? (
          <IconButton accessibilityLabel={t('common.back')} onPress={onBack}>
            <Icon name="chevronLeft" size={20} color={color.textPrimary} strokeWidth={2} />
          </IconButton>
        ) : null}
        {progress ? (
          <View style={styles.progress}>
            {Array.from({ length: progress.total }).map((_, i) => (
              <View key={i} style={[styles.seg, i < progress.index ? styles.segOn : styles.segOff]} />
            ))}
          </View>
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
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.gutter - 4, paddingTop: 4, minHeight: 44 },
  progress: { flexDirection: 'row', gap: 5, flex: 1, paddingHorizontal: 4 },
  seg: { flex: 1, height: 3, borderRadius: 2 },
  segOn: { backgroundColor: signal[0] },
  segOff: { backgroundColor: color.fillSubtleStrong },

  // flexGrow (not flex) — the content keeps its natural height and only takes the full
  // viewport when it is SHORTER than it, which is what makes the page read as static.
  body: { flexGrow: 1, paddingHorizontal: space.gutter, paddingTop: 12, paddingBottom: 12 },
  head: { marginBottom: 22 },
  legend: { marginBottom: 8 },
  title: { fontFamily: font.sansSemibold, fontSize: textScale['2xl'], letterSpacing: trackingPx(textScale['2xl'], tracking.tight), lineHeight: textScale['2xl'] * 1.1, color: color.textPrimary, textAlign: 'left' },
  sub: { fontFamily: font.sans, fontSize: textScale.base, lineHeight: 22, color: color.textSecondary, marginTop: 10, textAlign: 'left' },

  footer: { paddingHorizontal: space.gutter, paddingTop: 14, paddingBottom: 12, gap: 10 },
});
