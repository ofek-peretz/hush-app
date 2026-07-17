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
 * blur, which is neither the palette nor the READOUT law. This one is ink-on-paper — the active tab
 * is `textPrimary` (the darkest thing, i.e. emphasis by distance from the ground, no accent hue),
 * the rest are `textTertiary`. A hairline separates it from the page; nothing else is drawn.
 *
 * It is hidden entirely on the deeper screens (a live workout, cardio, a modal) — those are pushed
 * ABOVE the tab navigator, so the bar is simply not in their tree. A stage has no navigation.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Icon, type IconName } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';
import * as haptics from '@/platform/haptics';
import { color, font, textScale } from '@/design/tokens';

const ICON: Record<string, IconName> = {
  Home: 'home',
  Progress: 'trendingUp',
  History: 'history',
  Settings: 'settings',
};

const LABEL: Record<string, string> = {
  Home: 'nav.home',
  Progress: 'nav.progress',
  History: 'nav.history',
  Settings: 'nav.settings',
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
          haptics.tick();
          navigation.navigate(route.name);
        };
        const tint = focused ? color.textPrimary : color.textTertiary;
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
            <Icon name={ICON[route.name] ?? 'home'} size={22} color={tint} strokeWidth={focused ? 2.2 : 1.9} />
            <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
              {t(LABEL[route.name] ?? route.name)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: color.bg,
    borderTopWidth: 1,
    borderTopColor: color.border,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44 },
  label: { fontFamily: font.sansMedium, fontSize: 11, letterSpacing: 0.2, textAlign: 'center' },
});
