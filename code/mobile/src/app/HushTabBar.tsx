/**
 * The bottom tab bar — Home · Progress · History · Settings.
 *
 * WHY A TAB BAR (founder direction, 2026-07-17). Every reference mock the founder sent carries one,
 * and the four destinations are a genuine PEER SET: Home is the daily loop, and Progress / History /
 * Settings are the "long view" surfaces you return to often but not in sequence. Hub-and-spoke made
 * them two taps apart from each other (back to Home, then out again); a tab bar makes any of the
 * four one tap from any other, which is the whole point.
 *
 * It also let Home SHED chrome rather than gain it: the two hub rows (History / Progress) and the
 * settings gear all did what a tab does, so they are gone. Home's content — the decision, the plan,
 * Begin — is untouched. The bar is a quiet global switcher beneath it, never a competitor to the
 * one act: the reference proves a huge Begin button and a quiet ink tab row coexist fine.
 *
 * DELIBERATELY CUSTOM, not the default bar: the stock tab bar is iOS-blue on a translucent white
 * blur, which is neither the palette nor the v7 law. This one is cream-on-stage — the active tab is
 * `textPrimary` (the brightest thing, emphasis by distance from the ground), the rest are
 * `textMuted`, and a small moss DOT sits beneath the active label. A hairline separates the bar from
 * the page; nothing else is drawn.
 *
 * ⛔ IT WAS THE RANGE MARK, AND ON TODAY IT SAID ITSELF TWICE (design audit 2026-09-29; the founder's
 * free hand, 2026-09-30). The active tab wore the brand's measured-range glyph under its label — and
 * Today's own ICON is that glyph, so the one tab opened every day drew the mark over the word and
 * again under it: a doubled icon, read as a rendering fault. The mark keeps its place where it means
 * something (Today's icon, the logo); the selection is a dot, the mark every tab bar in the world
 * uses for "you are here", in the moss this product reserves for what is lit.
 *
 * It is hidden entirely on the deeper screens (a live workout, cardio, a modal) — those are pushed
 * ABOVE the tab navigator, so the bar is simply not in their tree. A stage has no navigation.
 */

// 

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Icon, type IconName } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import { color, font, textScale } from '@/design/tokens';

/** v7 2.1 draws these four exactly: the range mark, the activity waveform, a bare trace, a head. */
const ICON: Record<string, IconName> = {
  Today: 'todayRange',
  Program: 'program',
  Cardio: 'activity',
  Progress: 'lineChart',
  Crew: 'twoPeople',
  // The coach track's fifth tab — present only on a coach account (Root.HomeTabs).
  Athletes: 'twoPeople',
};

const LABEL: Record<string, string> = {
  Today: 'nav.today',
  Program: 'nav.program',
  Cardio: 'nav.cardio',
  Progress: 'nav.progress',
  Crew: 'crew.title',
  Athletes: 'coachTrack.coach.tab',
};

export function HushTabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useCopy();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (focused || event.defaultPrevented) return;
          /*
           * NO HAPTIC ON A TAB (founder A.9). The vocabulary is deliberate: a tick answers something
           * she DID to her training — a set logged, a rest ended, a load moved. Moving between the
           * app's own rooms is not one of those, and spending the strongest signal the product has
           * on navigation makes every other tick mean slightly less.
           */
          navigation.navigate(route.name);
        };
        const tint = focused ? color.textPrimary : color.textMuted;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={t(LABEL[route.name] ?? route.name)}
            onPress={onPress}
            style={styles.tab}
            hitSlop={6}
          >
            <Icon name={ICON[route.name] ?? 'home'} size={22} color={tint} strokeWidth={1.8} />
            <Text style={[styles.label, focused && styles.labelActive, { color: tint }]} numberOfLines={1}>
              {t(LABEL[route.name] ?? route.name)}
            </Text>
            <ActiveDot active={focused} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** A moss dot beneath the ACTIVE tab; an equal empty spacer otherwise, so the row never reflows. */
function ActiveDot({ active }: { active: boolean }) {
  return <View style={active ? styles.dot : styles.dotSpacer} />;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: color.bg,
    borderTopWidth: 1,
    borderTopColor: color.border,
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44 },
  label: { fontFamily: font.sansMedium, fontSize: 17, textAlign: 'center' },
  labelActive: { fontFamily: font.sansSemibold }, // rtl-ok: merged onto label, which sets textAlign:'center'
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.accent },
  dotSpacer: { width: 5, height: 5 },
});
